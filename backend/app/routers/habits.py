from datetime import date as date_type
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep, commit_or_409, get_owned_or_404
from app.models.habits import Habit, HabitLog
from app.schemas.habits import HabitCreate, HabitOut, HabitUpdate, LogOut, ToggleLog

router = APIRouter(prefix="/api/habits", tags=["habits"])

MAX_STREAK_LOOKBACK_DAYS = 3650  # safety bound: ten years of daily logs


def _is_scheduled(habit: Habit, day: date_type) -> bool:
    return habit.schedule_days is None or day.weekday() in habit.schedule_days


def _streak(habit: Habit, logged: set[date_type], today: date_type) -> int:
    """Consecutive scheduled days with a done log, walking back from today.
    A still-unlogged today doesn't break the streak — it just isn't counted yet."""
    if habit.schedule_days == []:  # defensive: schema normalizes this away
        return 0
    streak = 0
    day = today
    pending_today = _is_scheduled(habit, day) and day not in logged
    if pending_today:
        day -= timedelta(days=1)
    for _ in range(MAX_STREAK_LOOKBACK_DAYS):
        if _is_scheduled(habit, day):
            if day not in logged:
                break
            streak += 1
        day -= timedelta(days=1)
    return streak


def _habit_out(habit: Habit, week_start: date_type, today: date_type) -> HabitOut:
    logged = {log.date for log in habit.logs if log.done}
    week_end = week_start + timedelta(days=6)
    return HabitOut(
        id=habit.id,
        name=habit.name,
        schedule_days=habit.schedule_days,
        is_archived=habit.is_archived,
        streak=_streak(habit, logged, today),
        week_logs={
            day.isoformat(): True
            for day in logged
            if week_start <= day <= week_end
        },
    )


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
        .options(selectinload(Habit.logs))
        .where(Habit.user_id == current_user.id)
        .order_by(Habit.is_archived, Habit.id)
    )
    if not include_archived:
        query = query.where(Habit.is_archived.is_(False))
    return [_habit_out(h, week_start, today) for h in db.scalars(query)]


@router.post("", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(payload: HabitCreate, current_user: CurrentUser, db: DbDep) -> HabitOut:
    habit = Habit(user_id=current_user.id, **payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    today = date_type.today()
    return _habit_out(habit, _monday_of(today), today)


@router.put("/{habit_id}", response_model=HabitOut)
def update_habit(
    habit_id: int, payload: HabitUpdate, current_user: CurrentUser, db: DbDep
) -> HabitOut:
    habit = get_owned_or_404(
        db,
        Habit,
        current_user.id,
        habit_id,
        options=(selectinload(Habit.logs),),
        detail="Habit not found",
    )
    for field, value in payload.model_dump().items():
        setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    today = date_type.today()
    return _habit_out(habit, _monday_of(today), today)


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
