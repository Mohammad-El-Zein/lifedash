from fastapi import APIRouter, HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep, commit_or_409, get_owned_or_404
from app.models.fitness import Exercise, Workout, WorkoutSet
from app.schemas.fitness import (
    ExerciseCreate,
    ExerciseOut,
    ExerciseProgress,
    ProgressPoint,
    SetIn,
    WorkoutCreate,
    WorkoutOut,
)

router = APIRouter(prefix="/api/fitness", tags=["fitness"])


def _get_workout(db: DbDep, user_id: int, workout_id: int) -> Workout:
    return get_owned_or_404(
        db,
        Workout,
        user_id,
        workout_id,
        options=(selectinload(Workout.sets),),
        detail="Workout not found",
    )


def _build_sets(db: DbDep, user_id: int, workout: Workout, sets: list[SetIn]) -> None:
    """Validate exercise ownership and append WorkoutSet rows in list order."""
    exercise_ids = {s.exercise_id for s in sets}
    if exercise_ids:
        owned = set(
            db.scalars(
                select(Exercise.id).where(
                    Exercise.user_id == user_id, Exercise.id.in_(exercise_ids)
                )
            )
        )
        missing = exercise_ids - owned
        if missing:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, f"Exercise {min(missing)} not found"
            )
    for index, set_in in enumerate(sets, start=1):
        workout.sets.append(
            WorkoutSet(
                user_id=user_id,
                exercise_id=set_in.exercise_id,
                set_number=index,
                reps=set_in.reps,
                weight_kg=set_in.weight_kg,
            )
        )


# --- Exercises --------------------------------------------------------------------


@router.get("/exercises", response_model=list[ExerciseOut])
def list_exercises(current_user: CurrentUser, db: DbDep) -> list[Exercise]:
    return list(
        db.scalars(
            select(Exercise).where(Exercise.user_id == current_user.id).order_by(Exercise.name)
        )
    )


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(payload: ExerciseCreate, current_user: CurrentUser, db: DbDep) -> Exercise:
    exercise = Exercise(user_id=current_user.id, **payload.model_dump())
    db.add(exercise)
    commit_or_409(db, "An exercise with this name already exists")
    db.refresh(exercise)
    return exercise


@router.put("/exercises/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: int, payload: ExerciseCreate, current_user: CurrentUser, db: DbDep
) -> Exercise:
    exercise = get_owned_or_404(
        db, Exercise, current_user.id, exercise_id, detail="Exercise not found"
    )
    for field, value in payload.model_dump().items():
        setattr(exercise, field, value)
    commit_or_409(db, "An exercise with this name already exists")
    db.refresh(exercise)
    return exercise


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(exercise_id: int, current_user: CurrentUser, db: DbDep) -> None:
    exercise = get_owned_or_404(
        db, Exercise, current_user.id, exercise_id, detail="Exercise not found"
    )
    in_use = db.scalar(select(exists().where(WorkoutSet.exercise_id == exercise.id)))
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Exercise is used in workouts; delete those sets first",
        )
    db.delete(exercise)
    db.commit()


@router.get("/exercises/{exercise_id}/progress", response_model=ExerciseProgress)
def exercise_progress(exercise_id: int, current_user: CurrentUser, db: DbDep) -> ExerciseProgress:
    """Top weight per workout for this exercise, oldest first (sets without a
    weight are bodyweight work and don't contribute a point)."""
    exercise = get_owned_or_404(
        db, Exercise, current_user.id, exercise_id, detail="Exercise not found"
    )
    rows = db.execute(
        select(Workout.date, WorkoutSet.workout_id, WorkoutSet.weight_kg, WorkoutSet.reps)
        .join(Workout, WorkoutSet.workout_id == Workout.id)
        .where(
            WorkoutSet.user_id == current_user.id,
            WorkoutSet.exercise_id == exercise.id,
            WorkoutSet.weight_kg.is_not(None),
        )
        .order_by(Workout.date, Workout.id, WorkoutSet.weight_kg.desc(), WorkoutSet.reps.desc())
    ).all()
    points: list[ProgressPoint] = []
    for workout_date, workout_id, weight, reps in rows:
        # Rows arrive heaviest-first within a workout, so the first row per
        # workout is its top set.
        if points and points[-1].workout_id == workout_id:
            continue
        points.append(
            ProgressPoint(
                date=workout_date, workout_id=workout_id, top_weight=weight, reps_at_top=reps
            )
        )
    return ExerciseProgress(exercise_id=exercise.id, name=exercise.name, points=points)


# --- Workouts ---------------------------------------------------------------------


@router.get("/workouts", response_model=list[WorkoutOut])
def list_workouts(current_user: CurrentUser, db: DbDep) -> list[Workout]:
    return list(
        db.scalars(
            select(Workout)
            .options(selectinload(Workout.sets))
            .where(Workout.user_id == current_user.id)
            .order_by(Workout.date.desc(), Workout.id.desc())
        )
    )


@router.post("/workouts", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
def create_workout(payload: WorkoutCreate, current_user: CurrentUser, db: DbDep) -> Workout:
    workout = Workout(
        user_id=current_user.id, date=payload.date, name=payload.name, notes=payload.notes
    )
    _build_sets(db, current_user.id, workout, payload.sets)
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout


@router.get("/workouts/{workout_id}", response_model=WorkoutOut)
def get_workout(workout_id: int, current_user: CurrentUser, db: DbDep) -> Workout:
    return _get_workout(db, current_user.id, workout_id)


@router.put("/workouts/{workout_id}", response_model=WorkoutOut)
def update_workout(
    workout_id: int, payload: WorkoutCreate, current_user: CurrentUser, db: DbDep
) -> Workout:
    """Full replace: header fields are overwritten and the set list is rebuilt."""
    workout = _get_workout(db, current_user.id, workout_id)
    workout.date = payload.date
    workout.name = payload.name
    workout.notes = payload.notes
    workout.sets.clear()
    _build_sets(db, current_user.id, workout, payload.sets)
    db.commit()
    db.refresh(workout)
    return workout


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(workout_id: int, current_user: CurrentUser, db: DbDep) -> None:
    workout = _get_workout(db, current_user.id, workout_id)
    db.delete(workout)
    db.commit()
