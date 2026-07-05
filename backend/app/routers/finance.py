from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbDep
from app.models.finance import Budget, Transaction, TransactionCategory
from app.schemas.finance import (
    BudgetOut,
    BudgetUpsert,
    CategoryCreate,
    CategoryOut,
    CategorySummary,
    CategoryUpdate,
    MonthSummary,
    TransactionCreate,
    TransactionOut,
)

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _next_month(day: date) -> date:
    return date(day.year + 1, 1, 1) if day.month == 12 else date(day.year, day.month + 1, 1)


def _get_category(db: DbDep, user_id: int, category_id: int) -> TransactionCategory:
    category = db.scalar(
        select(TransactionCategory).where(
            TransactionCategory.id == category_id, TransactionCategory.user_id == user_id
        )
    )
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return category


# --- Categories ---------------------------------------------------------------


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(current_user: CurrentUser, db: DbDep) -> list[TransactionCategory]:
    return list(
        db.scalars(
            select(TransactionCategory)
            .where(TransactionCategory.user_id == current_user.id)
            .order_by(TransactionCategory.kind, TransactionCategory.name)
        )
    )


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate, current_user: CurrentUser, db: DbDep
) -> TransactionCategory:
    category = TransactionCategory(user_id=current_user.id, **payload.model_dump())
    db.add(category)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Category name already exists") from None
    db.refresh(category)
    return category


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, payload: CategoryUpdate, current_user: CurrentUser, db: DbDep
) -> TransactionCategory:
    category = _get_category(db, current_user.id, category_id)
    category.name = payload.name
    category.color = payload.color
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Category name already exists") from None
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, current_user: CurrentUser, db: DbDep) -> None:
    category = _get_category(db, current_user.id, category_id)
    db.delete(category)
    db.commit()


# --- Transactions --------------------------------------------------------------


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    current_user: CurrentUser,
    db: DbDep,
    month: Annotated[date | None, Query(description="Any day of the month to filter on")] = None,
    category_id: int | None = None,
) -> list[Transaction]:
    query = select(Transaction).where(Transaction.user_id == current_user.id)
    if month is not None:
        start = _month_start(month)
        query = query.where(Transaction.date >= start, Transaction.date < _next_month(start))
    if category_id is not None:
        query = query.where(Transaction.category_id == category_id)
    return list(db.scalars(query.order_by(Transaction.date.desc(), Transaction.id.desc())))


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate, current_user: CurrentUser, db: DbDep
) -> Transaction:
    _validate_category_kind(db, current_user.id, payload.category_id, payload.kind)
    tx = Transaction(user_id=current_user.id, **payload.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int, payload: TransactionCreate, current_user: CurrentUser, db: DbDep
) -> Transaction:
    tx = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
    )
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    _validate_category_kind(db, current_user.id, payload.category_id, payload.kind)
    for field, value in payload.model_dump().items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, current_user: CurrentUser, db: DbDep) -> None:
    tx = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.user_id == current_user.id
        )
    )
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    db.delete(tx)
    db.commit()


def _validate_category_kind(
    db: DbDep, user_id: int, category_id: int | None, kind: str
) -> None:
    if category_id is None:
        return
    category = _get_category(db, user_id, category_id)
    if category.kind != kind:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Category '{category.name}' is a {category.kind} category",
        )


# --- Budgets --------------------------------------------------------------------


@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(
    current_user: CurrentUser,
    db: DbDep,
    month: Annotated[date | None, Query()] = None,
) -> list[Budget]:
    query = select(Budget).where(Budget.user_id == current_user.id)
    if month is not None:
        query = query.where(Budget.month == _month_start(month))
    return list(db.scalars(query))


@router.put("/budgets", response_model=BudgetOut)
def upsert_budget(payload: BudgetUpsert, current_user: CurrentUser, db: DbDep) -> Budget:
    category = _get_category(db, current_user.id, payload.category_id)
    if category.kind != "expense":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Budgets apply to expense categories"
        )
    month = _month_start(payload.month)
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == current_user.id,
            Budget.category_id == payload.category_id,
            Budget.month == month,
        )
    )
    if budget is None:
        budget = Budget(
            user_id=current_user.id,
            category_id=payload.category_id,
            month=month,
            amount=payload.amount,
        )
        db.add(budget)
    else:
        budget.amount = payload.amount
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Budget was modified concurrently; please retry"
        ) from None
    db.refresh(budget)
    return budget


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, current_user: CurrentUser, db: DbDep) -> None:
    budget = db.scalar(
        select(Budget).where(Budget.id == budget_id, Budget.user_id == current_user.id)
    )
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
    db.delete(budget)
    db.commit()


# --- Summary --------------------------------------------------------------------


@router.get("/summary", response_model=MonthSummary)
def month_summary(
    current_user: CurrentUser,
    db: DbDep,
    month: Annotated[
        date | None, Query(description="Any day of the month; defaults to today")
    ] = None,
) -> MonthSummary:
    start = _month_start(month or date.today())
    end = _next_month(start)

    totals = dict(
        db.execute(
            select(Transaction.kind, func.coalesce(func.sum(Transaction.amount), 0))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.date >= start,
                Transaction.date < end,
            )
            .group_by(Transaction.kind)
        ).all()
    )
    income_total = float(totals.get("income", 0))
    expense_total = float(totals.get("expense", 0))

    spent_rows = db.execute(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.kind == "expense",
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category_id)
    ).all()
    spent_by_category = {cat_id: float(total) for cat_id, total in spent_rows}

    budgets = {
        b.category_id: float(b.amount)
        for b in db.scalars(
            select(Budget).where(Budget.user_id == current_user.id, Budget.month == start)
        )
    }
    categories = {
        c.id: c
        for c in db.scalars(
            select(TransactionCategory).where(
                TransactionCategory.user_id == current_user.id,
                TransactionCategory.kind == "expense",
            )
        )
    }

    by_category: list[CategorySummary] = []
    for cat_id, category in categories.items():
        spent = spent_by_category.get(cat_id, 0.0)
        budget = budgets.get(cat_id)
        if spent == 0 and budget is None:
            continue  # nothing to show this month
        by_category.append(
            CategorySummary(
                category_id=cat_id,
                name=category.name,
                color=category.color,
                spent=round(spent, 2),
                budget=budget,
            )
        )
    if None in spent_by_category:
        by_category.append(
            CategorySummary(
                category_id=None,
                name="Uncategorised",
                color="#64748b",
                spent=round(spent_by_category[None], 2),
                budget=None,
            )
        )
    by_category.sort(key=lambda c: c.spent, reverse=True)

    return MonthSummary(
        month=start,
        income_total=round(income_total, 2),
        expense_total=round(expense_total, 2),
        net=round(income_total - expense_total, 2),
        expenses_by_category=by_category,
    )
