from datetime import date as date_type
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, commit_or_409, get_owned_or_404
from app.models.habits import Habit, HabitLog
from app.schemas.habits import HabitCreate, HabitOut, HabitUpdate, LogOut, ToggleLog

router = APIRouter(prefix="/api/habits", tags=["habits"])

MAX_STREAK_LOOKBACK_DAYS = 3650  # safety bound: ten years of daily logs
# First streak pass only loads this window; long unbroken streaks (rare) get a
# second, full-depth pass. Keeps the per-request load bounded instead of pulling
# every habit's complete log history.
STREAK_WINDOW_DAYS = 400


def _is_scheduled(habit: Habit, day: date_type) -> bool:
    return habit.schedule_days is None or day.weekday() in habit.schedule_days


def _streak(
    habit: Habit, logged: set[date_type], today: date_type, floor: date_type
) -> tuple[int, bool]:
    """Consecutive scheduled days with a done log, walking back from today.
    A still-unlogged today doesn't break the streak — it just isn't counted yet.
    Returns (streak, complete); complete=False means the walk hit `floor`
    without finding a gap, so `logged` needs more history to be conclusive."""
    if habit.schedule_days == []:  # defensive: schema normalizes this away
        return 0, True
    streak = 0
    day = today
    if _is_scheduled(habit, day) and day not in logged:
        day -= timedelta(days=1)
    while day >= floor:
        if _is_scheduled(habit, day):
            if day not in logged:
                return streak, True
            streak += 1
        day -= timedelta(days=1)
    return streak, False


def _logged_dates(
    db: DbDep, user_id: int, habit_ids: list[int], since: date_type
) -> dict[int, set[date_type]]:
    """Done-log dates per habit from `since` on — date tuples only, no ORM rows."""
    if not habit_ids:
        return {}
    logged: dict[int, set[date_type]] = {habit_id: set() for habit_id in habit_ids}
    rows = db.execute(
        select(HabitLog.habit_id, HabitLog.date).where(
            HabitLog.user_id == user_id,
            HabitLog.habit_id.in_(habit_ids),
            HabitLog.done,
            HabitLog.date >= since,
        )
    )
    for habit_id, day in rows:
        logged[habit_id].add(day)
    return logged


def _habits_out(
    db: DbDep, user_id: int, habits: list[Habit], week_start: date_type, today: date_type
) -> list[HabitOut]:
    habit_ids = [h.id for h in habits]
    window_floor = today - timedelta(days=STREAK_WINDOW_DAYS)
    # One bounded query covers the requested week AND the streak window.
    since = min(window_floor, week_start)
    logged = _logged_dates(db, user_id, habit_ids, since)

    streaks: dict[int, int] = {}
    deep: list[Habit] = []
    for habit in habits:
        streak, complete = _streak(habit, logged[habit.id], today, window_floor)
        if complete:
            streaks[habit.id] = streak
        else:
            deep.append(habit)
    if deep:
        # Rare: a streak spans the whole window — re-walk with full history.
        full_floor = today - timedelta(days=MAX_STREAK_LOOKBACK_DAYS)
        full = _logged_dates(db, user_id, [h.id for h in deep], full_floor)
        for habit in deep:
            streaks[habit.id], _ = _streak(habit, full[habit.id], today, full_floor)

    week_end = week_start + timedelta(days=6)
    return [
        HabitOut(
            id=habit.id,
            name=habit.name,
            schedule_days=habit.schedule_days,
            is_archived=habit.is_archived,
            streak=streaks[habit.id],
            week_logs={
                day.isoformat(): True
                for day in logged[habit.id]
                if week_start <= day <= week_end
            },
        )
        for habit in habits
    ]


def _monday_of(day: date_type) -> date_type:
    return day - timedelta(days=day.weekday())


@router.get("", response_model=list[HabitOut])
def list_habits(
    current_user: CurrentUser,
    db: DbDep,
    week: Annotated[date_type | None, Query()] = None,
    include_archived: Annotated[bool, Query()] = False,
) -> list[HabitOut]:
    """Habits with their current streak and the done-days of the requested week
    (any date within the week; defaults to the current week, Monday-based)."""
    today = date_type.today()
    week_start = _monday_of(week or today)
    query = (
        select(Habit)
        .where(Habit.user_id == current_user.id)
        .order_by(Habit.is_archived, Habit.id)
    )
    if not include_archived:
        query = query.where(Habit.is_archived.is_(False))
    habits = list(db.scalars(query))
    return _habits_out(db, current_user.id, habits, week_start, today)


@router.post("", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(payload: HabitCreate, current_user: CurrentUser, db: DbDep) -> HabitOut:
    habit = Habit(user_id=current_user.id, **payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    today = date_type.today()
    return _habits_out(db, current_user.id, [habit], _monday_of(today), today)[0]


@router.put("/{habit_id}", response_model=HabitOut)
def update_habit(
    habit_id: int, payload: HabitUpdate, current_user: CurrentUser, db: DbDep
) -> HabitOut:
    habit = get_owned_or_404(db, Habit, current_user.id, habit_id, detail="Habit not found")
    for field, value in payload.model_dump().items():
        setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    today = date_type.today()
    return _habits_out(db, current_user.id, [habit], _monday_of(today), today)[0]


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(habit_id: int, current_user: CurrentUser, db: DbDep) -> None:
    habit = get_owned_or_404(db, Habit, current_user.id, habit_id, detail="Habit not found")
    db.delete(habit)
    db.commit()


@router.post("/{habit_id}/toggle", response_model=LogOut)
def toggle_log(
    habit_id: int, payload: ToggleLog, current_user: CurrentUser, db: DbDep
) -> LogOut:
    """Create the day's done-log, or remove it if it already exists."""
    habit = get_owned_or_404(db, Habit, current_user.id, habit_id, detail="Habit not found")
    existing = db.scalar(
        select(HabitLog).where(HabitLog.habit_id == habit.id, HabitLog.date == payload.date)
    )
    if existing is not None:
        db.delete(existing)
        db.commit()
        return LogOut(date=payload.date, done=False)
    db.add(HabitLog(user_id=current_user.id, habit_id=habit.id, date=payload.date, done=True))
    # A concurrent toggle (double-click) can insert the same (habit, date) first;
    # the unique constraint turns that into a clean 409 instead of a 500.
    commit_or_409(db, "This day was toggled concurrently; please retry")
    return LogOut(date=payload.date, done=True)
