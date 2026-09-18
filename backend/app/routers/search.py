"""Cross-module search behind the command palette.

Plain SQL ILIKE over the rows owned by the current user - no AI, no external
calls: the palette fires this on every (debounced) keystroke, so it has to stay
cheap. Every query is scoped by user_id; there is no unscoped code path here.
"""

from collections.abc import Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbDep
from app.models.calendar import CalendarEvent
from app.models.finance import RecurringTransaction, Transaction
from app.models.fitness import Exercise, Workout
from app.models.habits import Habit
from app.models.jobs import JobApplication
from app.models.learning import LearningGoal, LearningMilestone
from app.models.meals import Ingredient, Meal, MealTemplate
from app.schemas.search import SearchHit, SearchResponse

router = APIRouter(prefix="/api/search", tags=["search"])

MIN_QUERY_LENGTH = 2
PER_ENTITY_LIMIT = 5
MAX_RESULTS = 30


def _like_pattern(raw: str) -> str:
    """Wildcards typed by the user are literals, not operators."""
    escaped = raw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _matches(pattern: str, *columns: Any) -> ColumnElement[bool]:
    return or_(*(column.ilike(pattern, escape="\\") for column in columns))


def _fetch(
    db: Session,
    user_id: int,
    model: Any,
    predicate: ColumnElement[bool],
    order_by: Sequence[Any],
) -> list[Any]:
    return list(
        db.scalars(
            select(model)
            .where(model.user_id == user_id, predicate)
            .order_by(*order_by)
            .limit(PER_ENTITY_LIMIT)
        )
    )


def _search_calendar(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    events = _fetch(
        db,
        user_id,
        CalendarEvent,
        _matches(pattern, CalendarEvent.title, CalendarEvent.location, CalendarEvent.description),
        (CalendarEvent.start_date.desc(), CalendarEvent.id.desc()),
    )
    return [
        SearchHit(
            module="calendar",
            entity="event",
            id=event.id,
            title=event.title,
            subtitle=event.location,
            date=event.start_date,
        )
        for event in events
    ]


def _search_finance(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    transactions = _fetch(
        db,
        user_id,
        Transaction,
        _matches(pattern, Transaction.description),
        (Transaction.date.desc(), Transaction.id.desc()),
    )
    recurring = _fetch(
        db,
        user_id,
        RecurringTransaction,
        _matches(pattern, RecurringTransaction.description),
        (RecurringTransaction.id.desc(),),
    )
    hits = [
        SearchHit(
            module="finance",
            entity="transaction",
            id=tx.id,
            title=tx.description or "",
            amount=tx.amount if tx.kind == "income" else -tx.amount,
            date=tx.date,
        )
        for tx in transactions
    ]
    hits += [
        SearchHit(
            module="finance",
            entity="recurring",
            id=item.id,
            title=item.description,
            amount=item.amount if item.kind == "income" else -item.amount,
        )
        for item in recurring
    ]
    return hits


def _search_jobs(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    applications = _fetch(
        db,
        user_id,
        JobApplication,
        _matches(pattern, JobApplication.company, JobApplication.position, JobApplication.notes),
        (JobApplication.id.desc(),),
    )
    return [
        SearchHit(
            module="jobs",
            entity="application",
            id=application.id,
            title=application.company,
            subtitle=application.position,
            date=application.applied_date,
        )
        for application in applications
    ]


def _search_meals(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    meals = _fetch(
        db,
        user_id,
        Meal,
        _matches(pattern, Meal.name, Meal.notes),
        (Meal.date.desc(), Meal.id.desc()),
    )
    dishes = _fetch(
        db, user_id, MealTemplate, _matches(pattern, MealTemplate.name), (MealTemplate.name,)
    )
    ingredients = _fetch(
        db, user_id, Ingredient, _matches(pattern, Ingredient.name), (Ingredient.name,)
    )
    hits = [
        SearchHit(module="meals", entity="meal", id=meal.id, title=meal.name, date=meal.date)
        for meal in meals
    ]
    hits += [
        SearchHit(module="meals", entity="dish", id=dish.id, title=dish.name) for dish in dishes
    ]
    hits += [
        SearchHit(module="meals", entity="ingredient", id=ingredient.id, title=ingredient.name)
        for ingredient in ingredients
    ]
    return hits


def _search_fitness(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    workouts = _fetch(
        db,
        user_id,
        Workout,
        _matches(pattern, Workout.name, Workout.notes),
        (Workout.date.desc(), Workout.id.desc()),
    )
    exercises = _fetch(
        db,
        user_id,
        Exercise,
        _matches(pattern, Exercise.name, Exercise.muscle_group),
        (Exercise.name,),
    )
    hits = [
        SearchHit(
            module="fitness",
            entity="workout",
            id=workout.id,
            title=workout.name,
            date=workout.date,
        )
        for workout in workouts
    ]
    hits += [
        SearchHit(
            module="fitness",
            entity="exercise",
            id=exercise.id,
            title=exercise.name,
            subtitle=exercise.muscle_group,
        )
        for exercise in exercises
    ]
    return hits


def _search_learning(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    goals = _fetch(
        db,
        user_id,
        LearningGoal,
        _matches(pattern, LearningGoal.title, LearningGoal.description),
        (LearningGoal.id.desc(),),
    )
    milestones = list(
        db.execute(
            select(LearningMilestone, LearningGoal.title)
            .join(LearningGoal, LearningMilestone.goal_id == LearningGoal.id)
            .where(
                LearningMilestone.user_id == user_id,
                _matches(pattern, LearningMilestone.title),
            )
            .order_by(LearningMilestone.id.desc())
            .limit(PER_ENTITY_LIMIT)
        )
    )
    hits = [
        SearchHit(
            module="learning",
            entity="goal",
            id=goal.id,
            title=goal.title,
            date=goal.target_date,
        )
        for goal in goals
    ]
    hits += [
        SearchHit(
            module="learning",
            entity="milestone",
            id=milestone.id,
            title=milestone.title,
            subtitle=goal_title,
            date=milestone.due_date,
        )
        for milestone, goal_title in milestones
    ]
    return hits


def _search_habits(db: Session, user_id: int, pattern: str) -> list[SearchHit]:
    habits = _fetch(
        db,
        user_id,
        Habit,
        _matches(pattern, Habit.name),
        (Habit.is_archived, Habit.name),
    )
    return [
        SearchHit(module="habits", entity="habit", id=habit.id, title=habit.name)
        for habit in habits
    ]


# Module order here decides the grouping order in the palette.
_SEARCHERS = (
    _search_calendar,
    _search_finance,
    _search_jobs,
    _search_meals,
    _search_fitness,
    _search_learning,
    _search_habits,
)


@router.get("", response_model=SearchResponse)
def search(
    current_user: CurrentUser,
    db: DbDep,
    q: Annotated[str, Query(max_length=100)] = "",
) -> SearchResponse:
    """Substring search across every module, scoped to the current user.

    A term shorter than MIN_QUERY_LENGTH returns nothing rather than half the
    table - the palette shows navigation and quick actions until then.
    """
    term = q.strip()
    if len(term) < MIN_QUERY_LENGTH:
        return SearchResponse(query=term, results=[])

    pattern = _like_pattern(term)
    results: list[SearchHit] = []
    for searcher in _SEARCHERS:
        results.extend(searcher(db, current_user.id, pattern))
    return SearchResponse(query=term, results=results[:MAX_RESULTS])
