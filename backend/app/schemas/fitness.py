from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    muscle_group: str | None = Field(default=None, max_length=50)


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str | None


class SetIn(BaseModel):
    """Order in the request list is the set order; set_number is assigned server-side."""

    exercise_id: int
    reps: int = Field(ge=1, le=1000)
    weight_kg: Decimal | None = Field(default=None, ge=0, le=Decimal("9999.99"))


class WorkoutCreate(BaseModel):
    date: date
    name: str = Field(min_length=1, max_length=100)
    notes: str | None = None
    sets: list[SetIn] = Field(default_factory=list, max_length=200)


class SetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    set_number: int
    reps: int
    weight_kg: Decimal | None


class WorkoutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    name: str
    notes: str | None
    sets: list[SetOut] = []


class ProgressPoint(BaseModel):
    date: date
    workout_id: int
    top_weight: Decimal
    reps_at_top: int


class ExerciseProgress(BaseModel):
    exercise_id: int
    name: str
    points: list[ProgressPoint]
