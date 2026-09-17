"""Life insights: the cross-module snapshot and the prompt built from it.

Only aggregates leave the database - counts, sums and short titles, never whole
tables and never another user's rows. That keeps the prompt small (which keeps
it cheap) and means a single API call can see all seven modules at once, which
is the whole point: the interesting statements connect two of them.
"""

import datetime
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.calendar import CalendarEvent
from app.models.finance import Budget, FinanceSettings, Transaction, TransactionCategory
from app.models.fitness import Workout
from app.models.habits import Habit, HabitLog
from app.models.jobs import JobApplication
from app.models.learning import LearningGoal
from app.models.meals import Meal
from app.services.calendar import expand_week

MAX_INSIGHTS = 4
MAX_TOKENS = 900

# Keep the snapshot small: these caps bound both cost and prompt noise.
TOP_CATEGORIES = 5
MAX_GOALS = 5
MAX_HABITS = 6


def monday_of(day: datetime.date) -> datetime.date:
    return day - datetime.timedelta(days=day.weekday())


def _money(value: Decimal | float | None) -> float:
    return round(float(value or 0), 2)


def _finance(db: Session, user_id: int, today: datetime.date) -> dict:
    month_start = today.replace(day=1)
    rows = list(
        db.execute(
            select(Transaction.kind, func.sum(Transaction.amount))
            .where(
                Transaction.user_id == user_id,
                Transaction.date >= month_start,
                Transaction.date <= today,
            )
            .group_by(Transaction.kind)
        )
    )
    totals = {kind: _money(total) for kind, total in rows}
    income = totals.get("income", 0.0)
    expenses = totals.get("expense", 0.0)

    spent_rows = list(
        db.execute(
            select(TransactionCategory.name, func.sum(Transaction.amount))
            .join(Transaction, Transaction.category_id == TransactionCategory.id)
            .where(
                Transaction.user_id == user_id,
                Transaction.kind == "expense",
                Transaction.date >= month_start,
                Transaction.date <= today,
            )
            .group_by(TransactionCategory.name)
            .order_by(func.sum(Transaction.amount).desc())
            .limit(TOP_CATEGORIES)
        )
    )
    budgets = {
        name: _money(amount)
        for name, amount in db.execute(
            select(TransactionCategory.name, Budget.amount)
            .join(TransactionCategory, Budget.category_id == TransactionCategory.id)
            .where(Budget.user_id == user_id, Budget.month == month_start)
        )
    }
    categories = [
        {"name": name, "spent": _money(spent), "budget": budgets.get(name)}
        for name, spent in spent_rows
    ]

    settings = db.scalar(select(FinanceSettings).where(FinanceSettings.user_id == user_id))
    # Key names carry the period: the model otherwise reports month-to-date
    # figures as "this week".
    return {
        "period": "month_to_date",
        "month_started_on": month_start.isoformat(),
        "income_month_to_date": income,
        "expenses_month_to_date": expenses,
        "net_month_to_date": round(income - expenses, 2),
        "top_expense_categories_month_to_date": categories,
        "monthly_savings_target": _money(settings.monthly_savings_target) if settings else None,
    }


def _meals(db: Session, user_id: int, week_start: datetime.date, today: datetime.date) -> dict:
    last_week = week_start - datetime.timedelta(days=7)

    def count(start: datetime.date, end: datetime.date) -> int:
        return (
            db.scalar(
                select(func.count(Meal.id)).where(
                    Meal.user_id == user_id, Meal.date >= start, Meal.date <= end
                )
            )
            or 0
        )

    days_logged = (
        db.scalar(
            select(func.count(func.distinct(Meal.date))).where(
                Meal.user_id == user_id, Meal.date >= week_start, Meal.date <= today
            )
        )
        or 0
    )
    calories = db.scalar(
        select(func.sum(Meal.calories)).where(
            Meal.user_id == user_id, Meal.date >= week_start, Meal.date <= today
        )
    )
    return {
        "meals_this_week_so_far": count(week_start, today),
        "meals_last_week_total": count(last_week, week_start - datetime.timedelta(days=1)),
        "days_logged_this_week_so_far": days_logged,
        "avg_calories_per_logged_day": (
            round(float(calories) / days_logged) if calories and days_logged else None
        ),
    }


def _fitness(db: Session, user_id: int, week_start: datetime.date, today: datetime.date) -> dict:
    last_week = week_start - datetime.timedelta(days=7)
    four_weeks_ago = week_start - datetime.timedelta(days=28)

    def count(start: datetime.date, end: datetime.date) -> int:
        return (
            db.scalar(
                select(func.count(Workout.id)).where(
                    Workout.user_id == user_id, Workout.date >= start, Workout.date <= end
                )
            )
            or 0
        )

    return {
        "workouts_this_week_so_far": count(week_start, today),
        "workouts_last_week_total": count(last_week, week_start - datetime.timedelta(days=1)),
        # A total, not an average - spelled out because it was read as one.
        "workouts_total_over_last_4_weeks": count(four_weeks_ago, today),
    }


def _jobs(db: Session, user_id: int, week_start: datetime.date, today: datetime.date) -> dict:
    last_week = week_start - datetime.timedelta(days=7)

    def count(start: datetime.date, end: datetime.date) -> int:
        return (
            db.scalar(
                select(func.count(JobApplication.id)).where(
                    JobApplication.user_id == user_id,
                    JobApplication.applied_date >= start,
                    JobApplication.applied_date <= end,
                )
            )
            or 0
        )

    by_status = {
        status: count_
        for status, count_ in db.execute(
            select(JobApplication.status, func.count(JobApplication.id))
            .where(JobApplication.user_id == user_id)
            .group_by(JobApplication.status)
        )
    }
    return {
        "applications_this_week_so_far": count(week_start, today),
        "applications_last_week_total": count(last_week, week_start - datetime.timedelta(days=1)),
        "applications_by_status_all_time": by_status,
    }


def _learning(db: Session, user_id: int) -> dict:
    goals = list(
        db.scalars(
            select(LearningGoal)
            .options(selectinload(LearningGoal.milestones))
            .where(LearningGoal.user_id == user_id, LearningGoal.status == "active")
            .order_by(LearningGoal.id.desc())
            .limit(MAX_GOALS)
        )
    )
    return {
        "active_goals": [
            {
                "title": goal.title,
                "milestones_done": sum(1 for m in goal.milestones if m.done),
                "milestones_total": len(goal.milestones),
                "target_date": goal.target_date.isoformat() if goal.target_date else None,
            }
            for goal in goals
        ]
    }


def _habits(db: Session, user_id: int, week_start: datetime.date, today: datetime.date) -> dict:
    habits = list(
        db.scalars(
            select(Habit)
            .where(Habit.user_id == user_id, Habit.is_archived.is_(False))
            .order_by(Habit.id)
            .limit(MAX_HABITS)
        )
    )
    if not habits:
        return {"habits": []}

    done: dict[int, int] = defaultdict(int)
    for habit_id, in_week in db.execute(
        select(HabitLog.habit_id, func.count(HabitLog.id))
        .where(
            HabitLog.user_id == user_id,
            HabitLog.done.is_(True),
            HabitLog.date >= week_start,
            HabitLog.date <= today,
        )
        .group_by(HabitLog.habit_id)
    ):
        done[habit_id] = in_week

    days_so_far = (today - week_start).days + 1
    return {
        "habits": [
            {
                "name": habit.name,
                "days_done_this_week_so_far": done.get(habit.id, 0),
                "scheduled_days_per_full_week": (
                    len(habit.schedule_days) if habit.schedule_days else 7
                ),
                "days_elapsed_this_week_so_far": days_so_far,
            }
            for habit in habits
        ]
    }


def _calendar(db: Session, user_id: int, week_start: datetime.date) -> dict:
    events = list(
        db.scalars(
            select(CalendarEvent)
            .options(selectinload(CalendarEvent.exceptions))
            .where(CalendarEvent.user_id == user_id)
        )
    )
    occurrences = expand_week(events, week_start)
    booked_minutes = 0
    per_day: dict[datetime.date, int] = defaultdict(int)
    for occurrence in occurrences:
        start, end = occurrence.start_time, occurrence.end_time
        minutes = max(0, (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute))
        booked_minutes += minutes
        per_day[occurrence.date] += minutes
    week = (week_start + datetime.timedelta(days=index) for index in range(7))
    return {
        "events_this_week": len(occurrences),
        "booked_hours_this_week": round(booked_minutes / 60, 1),
        "days_without_events_this_week": sum(1 for day in week if per_day.get(day, 0) == 0),
    }


def build_snapshot(db: Session, user_id: int, today: datetime.date) -> dict:
    """Aggregates only - this is what the model gets to see."""
    week_start = monday_of(today)
    return {
        "today": today.isoformat(),
        "week_start": week_start.isoformat(),
        "finance": _finance(db, user_id, today),
        "meals": _meals(db, user_id, week_start, today),
        "fitness": _fitness(db, user_id, week_start, today),
        "jobs": _jobs(db, user_id, week_start, today),
        "learning": _learning(db, user_id),
        "habits": _habits(db, user_id, week_start, today),
        "calendar": _calendar(db, user_id, week_start),
    }


def has_enough_data(snapshot: dict) -> bool:
    """A brand-new account has nothing to connect; don't pay for a call that can
    only produce platitudes."""
    signals = (
        snapshot["finance"]["income_month_to_date"] > 0,
        snapshot["finance"]["expenses_month_to_date"] > 0,
        snapshot["meals"]["meals_this_week_so_far"] > 0,
        snapshot["fitness"]["workouts_total_over_last_4_weeks"] > 0,
        bool(snapshot["jobs"]["applications_by_status_all_time"]),
        bool(snapshot["learning"]["active_goals"]),
        bool(snapshot["habits"]["habits"]),
        snapshot["calendar"]["events_this_week"] > 0,
    )
    return sum(1 for signal in signals if signal) >= 2


SYSTEM_PROMPT = """You write the "Life Insights" row of a personal dashboard.

You get one JSON snapshot of aggregated data from the user's own modules:
finance, meals, fitness, jobs, learning, habits and calendar.

Write {max_insights} short insights at most, in {language}. Rules:

- Each insight must connect at least TWO different modules. A single-module \
observation is not an insight - skip it.
- Use the actual numbers from the snapshot. Never invent a number, a name or a \
trend that is not in the data.
- Say something the user can act on or decide from, not a compliment.
- title: at most 6 words. body: one or two sentences, at most 220 characters.
- modules: only the module keys whose numbers you actually cite (2 or more). \
Do not pad the list to reach two - drop the insight instead.
- tone: "positive" when it reports something going well, "warning" when it \
points at a risk or a drop, otherwise "neutral".
- Prefer fewer, sharper insights over filling the quota. If the data supports \
only one honest insight, return only that one.
- Amounts are euros; the week starts on Monday and "this week" is Monday \
through today, so a partial week is normal - do not read it as a decline.
- Every field name states its own period ("_month_to_date", "_this_week_so_far", \
"_last_week_total", "_over_last_4_weeks", "_all_time"). Respect it: never call a \
month-to-date figure "this week", and never turn a total into an average.
- Write those periods as natural prose in the output language ("bisher diesen \
Monat", "diese Woche", "in den letzten vier Wochen"). Never put a raw field \
name or an English suffix like "month-to-date" or "all-time" into the text.
- This is the user's own dashboard: address them informally and consistently \
("du"/"dein" in German), and write fluent, grammatical prose."""


def system_prompt(language: str | None) -> str:
    return SYSTEM_PROMPT.format(
        max_insights=MAX_INSIGHTS,
        language="German" if (language or "en").startswith("de") else "English",
    )
