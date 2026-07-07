from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep, get_owned_or_404
from app.models.meals import Meal
from app.schemas.meals import MealCreate, MealOut

router = APIRouter(prefix="/api/meals", tags=["meals"])


@router.get("", response_model=list[MealOut])
def list_meals(
    current_user: CurrentUser,
    db: DbDep,
    day: Annotated[date_type, Query(alias="date")],
) -> list[Meal]:
    return list(
        db.scalars(
            select(Meal)
            .where(Meal.user_id == current_user.id, Meal.date == day)
            .order_by(Meal.id)
        )
    )


@router.post("", response_model=MealOut, status_code=status.HTTP_201_CREATED)
def create_meal(payload: MealCreate, current_user: CurrentUser, db: DbDep) -> Meal:
    meal = Meal(user_id=current_user.id, **payload.model_dump())
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


@router.put("/{meal_id}", response_model=MealOut)
def update_meal(
    meal_id: int, payload: MealCreate, current_user: CurrentUser, db: DbDep
) -> Meal:
    meal = get_owned_or_404(db, Meal, current_user.id, meal_id, detail="Meal not found")
    for field, value in payload.model_dump().items():
        setattr(meal, field, value)
    db.commit()
    db.refresh(meal)
    return meal


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal(meal_id: int, current_user: CurrentUser, db: DbDep) -> None:
    meal = get_owned_or_404(db, Meal, current_user.id, meal_id, detail="Meal not found")
    db.delete(meal)
    db.commit()
