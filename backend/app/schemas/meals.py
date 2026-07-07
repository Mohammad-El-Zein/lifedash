from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

MEAL_TYPES = ("breakfast", "lunch", "dinner", "snack")
MEAL_TYPE_PATTERN = "^(breakfast|lunch|dinner|snack)$"
UNIT_PATTERN = "^(g|piece)$"

# Shared bounds for a single meal entry — manual input AND template snapshots.
MAX_MEAL_CALORIES = 10000
MAX_MEAL_MACRO_G = 1000


class MealCreate(BaseModel):
    date: date
    meal_type: str = Field(pattern=MEAL_TYPE_PATTERN)
    name: str = Field(min_length=1, max_length=200)
    calories: int = Field(ge=0, le=MAX_MEAL_CALORIES)
    protein_g: int | None = Field(default=None, ge=0, le=MAX_MEAL_MACRO_G)
    carbs_g: int | None = Field(default=None, ge=0, le=MAX_MEAL_MACRO_G)
    fat_g: int | None = Field(default=None, ge=0, le=MAX_MEAL_MACRO_G)


class MealFromTemplate(BaseModel):
    date: date
    meal_type: str = Field(pattern=MEAL_TYPE_PATTERN)
    template_id: int
    portion_factor: Decimal = Field(default=Decimal(1), gt=0, le=10)


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    meal_type: str
    name: str
    calories: int
    protein_g: int | None
    carbs_g: int | None
    fat_g: int | None
    template_id: int | None


# --- Ingredients -------------------------------------------------------------------


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    calories_per_100g: Decimal = Field(ge=0, le=1000)
    protein_per_100g: Decimal = Field(ge=0, le=100)
    carbs_per_100g: Decimal = Field(ge=0, le=100)
    fat_per_100g: Decimal = Field(ge=0, le=100)
    piece_grams: Decimal | None = Field(default=None, gt=0, le=10000)


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    calories_per_100g: Decimal
    protein_per_100g: Decimal
    carbs_per_100g: Decimal
    fat_per_100g: Decimal
    piece_grams: Decimal | None


# --- Meal templates ----------------------------------------------------------------


class TemplateItemIn(BaseModel):
    ingredient_id: int
    unit: str = Field(pattern=UNIT_PATTERN)
    amount: Decimal = Field(gt=0, le=100000)


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    items: list[TemplateItemIn] = Field(min_length=1, max_length=100)


class NutritionTotals(BaseModel):
    calories: Decimal
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal


class TemplateItemOut(BaseModel):
    id: int
    ingredient_id: int
    ingredient_name: str
    unit: str
    amount: Decimal
    grams: Decimal
    calories: Decimal


class TemplateOut(BaseModel):
    id: int
    name: str
    items: list[TemplateItemOut]
    totals: NutritionTotals
