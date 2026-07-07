from datetime import date

from pydantic import BaseModel, ConfigDict, Field

MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")
MEAL_TYPE_PATTERN = "^(breakfast|lunch|dinner|snack)$"


class MealCreate(BaseModel):
    date: date
    meal_type: str = Field(pattern=MEAL_TYPE_PATTERN)
    name: str = Field(min_length=1, max_length=200)
    calories: int = Field(ge=0, le=10000)
    protein_g: int | None = Field(default=None, ge=0, le=1000)
    carbs_g: int | None = Field(default=None, ge=0, le=1000)


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    meal_type: str
    name: str
    calories: int
    protein_g: int | None
    carbs_g: int | None
