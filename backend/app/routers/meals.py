from datetime import date as date_type
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import exists, select, update
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep, commit_or_409, get_owned_or_404
from app.models.meals import Ingredient, Meal, MealTemplate, MealTemplateItem
from app.schemas.meals import (
    MAX_MEAL_CALORIES,
    MAX_MEAL_MACRO_G,
    IngredientCreate,
    IngredientOut,
    MealCreate,
    MealFromTemplate,
    MealOut,
    NutritionTotals,
    TemplateCreate,
    TemplateItemIn,
    TemplateItemOut,
    TemplateOut,
)

router = APIRouter(prefix="/api/meals", tags=["meals"])


def _item_grams(item: MealTemplateItem) -> Decimal:
    if item.unit == "g":
        return item.amount
    # unit == "piece"; creation/update guarantees piece_grams is set
    return item.amount * item.ingredient.piece_grams


def _template_out(template: MealTemplate) -> TemplateOut:
    items: list[TemplateItemOut] = []
    totals = {
        "calories": Decimal(0),
        "protein_g": Decimal(0),
        "carbs_g": Decimal(0),
        "fat_g": Decimal(0),
    }
    for item in template.items:
        grams = _item_grams(item)
        factor = grams / Decimal(100)
        calories = (item.ingredient.calories_per_100g * factor).quantize(Decimal("0.1"))
        totals["calories"] += calories
        totals["protein_g"] += item.ingredient.protein_per_100g * factor
        totals["carbs_g"] += item.ingredient.carbs_per_100g * factor
        totals["fat_g"] += item.ingredient.fat_per_100g * factor
        items.append(
            TemplateItemOut(
                id=item.id,
                ingredient_id=item.ingredient_id,
                ingredient_name=item.ingredient.name,
                unit=item.unit,
                amount=item.amount,
                grams=grams.quantize(Decimal("0.1")),
                calories=calories,
            )
        )
    return TemplateOut(
        id=template.id,
        name=template.name,
        items=items,
        totals=NutritionTotals(**{k: v.quantize(Decimal("0.1")) for k, v in totals.items()}),
    )


def _get_template(db: DbDep, user_id: int, template_id: int) -> MealTemplate:
    return get_owned_or_404(
        db,
        MealTemplate,
        user_id,
        template_id,
        options=(selectinload(MealTemplate.items).selectinload(MealTemplateItem.ingredient),),
        detail="Template not found",
    )


def _build_items(
    db: DbDep, user_id: int, template: MealTemplate, items: list[TemplateItemIn]
) -> None:
    """Validate ingredient ownership and piece-unit availability, then append rows."""
    ingredient_ids = {i.ingredient_id for i in items}
    ingredients = {
        ing.id: ing
        for ing in db.scalars(
            select(Ingredient).where(
                Ingredient.user_id == user_id, Ingredient.id.in_(ingredient_ids)
            )
        )
    }
    missing = ingredient_ids - ingredients.keys()
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Ingredient {min(missing)} not found")
    for item in items:
        ingredient = ingredients[item.ingredient_id]
        if item.unit == "piece" and ingredient.piece_grams is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Ingredient '{ingredient.name}' has no piece weight; enter grams instead",
            )
        template.items.append(
            MealTemplateItem(
                user_id=user_id,
                ingredient_id=item.ingredient_id,
                unit=item.unit,
                amount=item.amount,
            )
        )


# --- Ingredients -------------------------------------------------------------------


@router.get("/ingredients", response_model=list[IngredientOut])
def list_ingredients(current_user: CurrentUser, db: DbDep) -> list[Ingredient]:
    return list(
        db.scalars(
            select(Ingredient)
            .where(Ingredient.user_id == current_user.id)
            .order_by(Ingredient.name)
        )
    )


@router.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED)
def create_ingredient(
    payload: IngredientCreate, current_user: CurrentUser, db: DbDep
) -> Ingredient:
    ingredient = Ingredient(user_id=current_user.id, **payload.model_dump())
    db.add(ingredient)
    commit_or_409(db, "An ingredient with this name already exists")
    db.refresh(ingredient)
    return ingredient


@router.put("/ingredients/{ingredient_id}", response_model=IngredientOut)
def update_ingredient(
    ingredient_id: int, payload: IngredientCreate, current_user: CurrentUser, db: DbDep
) -> Ingredient:
    ingredient = get_owned_or_404(
        db, Ingredient, current_user.id, ingredient_id, detail="Ingredient not found"
    )
    if payload.piece_grams is None:
        in_piece_use = db.scalar(
            select(exists().where(
                MealTemplateItem.ingredient_id == ingredient.id,
                MealTemplateItem.unit == "piece",
            ))
        )
        if in_piece_use:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Piece weight is used by template items and cannot be removed",
            )
    for field, value in payload.model_dump().items():
        setattr(ingredient, field, value)
    commit_or_409(db, "An ingredient with this name already exists")
    db.refresh(ingredient)
    return ingredient


@router.delete("/ingredients/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ingredient(ingredient_id: int, current_user: CurrentUser, db: DbDep) -> None:
    ingredient = get_owned_or_404(
        db, Ingredient, current_user.id, ingredient_id, detail="Ingredient not found"
    )
    in_use = db.scalar(select(exists().where(MealTemplateItem.ingredient_id == ingredient.id)))
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ingredient is used in dishes; remove it there first"
        )
    db.delete(ingredient)
    db.commit()


# --- Meal templates ----------------------------------------------------------------


@router.get("/templates", response_model=list[TemplateOut])
def list_templates(current_user: CurrentUser, db: DbDep) -> list[TemplateOut]:
    templates = db.scalars(
        select(MealTemplate)
        .options(selectinload(MealTemplate.items).selectinload(MealTemplateItem.ingredient))
        .where(MealTemplate.user_id == current_user.id)
        .order_by(MealTemplate.name)
    )
    return [_template_out(t) for t in templates]


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate, current_user: CurrentUser, db: DbDep
) -> TemplateOut:
    template = MealTemplate(user_id=current_user.id, name=payload.name)
    _build_items(db, current_user.id, template, payload.items)
    db.add(template)
    commit_or_409(db, "A dish with this name already exists")
    return _template_out(_get_template(db, current_user.id, template.id))


@router.put("/templates/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int, payload: TemplateCreate, current_user: CurrentUser, db: DbDep
) -> TemplateOut:
    """Full replace: name is overwritten and the item list is rebuilt."""
    template = _get_template(db, current_user.id, template_id)
    template.name = payload.name
    template.items.clear()
    _build_items(db, current_user.id, template, payload.items)
    commit_or_409(db, "A dish with this name already exists")
    return _template_out(_get_template(db, current_user.id, template.id))


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, current_user: CurrentUser, db: DbDep) -> None:
    template = get_owned_or_404(
        db, MealTemplate, current_user.id, template_id, detail="Template not found"
    )
    # Meals keep their snapshot values; drop the provenance link explicitly
    # (SQLite test runs don't enforce the FK's ON DELETE SET NULL).
    db.execute(
        update(Meal)
        .where(Meal.user_id == current_user.id, Meal.template_id == template.id)
        .values(template_id=None)
    )
    db.delete(template)
    db.commit()


# --- Meals -------------------------------------------------------------------------


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


@router.post("/from-template", response_model=MealOut, status_code=status.HTTP_201_CREATED)
def create_meal_from_template(
    payload: MealFromTemplate, current_user: CurrentUser, db: DbDep
) -> Meal:
    """Snapshot the template's computed nutrition (× portion factor) into a meal."""
    template = _get_template(db, current_user.id, payload.template_id)
    totals = _template_out(template).totals

    def scaled(value: Decimal) -> int:
        return int((value * payload.portion_factor).quantize(Decimal("1"), ROUND_HALF_UP))

    calories = scaled(totals.calories)
    protein_g = scaled(totals.protein_g)
    carbs_g = scaled(totals.carbs_g)
    fat_g = scaled(totals.fat_g)
    # Enforce the same bounds as manual meals (MealCreate); without this the
    # computed snapshot can exceed the INTEGER columns entirely.
    if calories > MAX_MEAL_CALORIES or max(protein_g, carbs_g, fat_g) > MAX_MEAL_MACRO_G:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Portion exceeds the meal limits "
            f"(max {MAX_MEAL_CALORIES} kcal, {MAX_MEAL_MACRO_G} g per macro); "
            "use a smaller portion factor",
        )

    meal = Meal(
        user_id=current_user.id,
        date=payload.date,
        meal_type=payload.meal_type,
        name=template.name,
        calories=calories,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
        template_id=template.id,
    )
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
