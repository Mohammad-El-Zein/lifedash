from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbDep, commit_or_409, get_owned_or_404
from app.models.finance import (
    Budget,
    FinanceSettings,
    RecurringSkip,
    RecurringTransaction,
    Transaction,
    TransactionCategory,
)
from app.schemas.finance import (
    BudgetOut,
    BudgetUpsert,
    CategoryCreate,
    CategoryOut,
    CategorySummary,
    CategoryUpdate,
    FixedItem,
    MonthlyPlan,
    MonthSummary,
    RecurringCreate,
    RecurringOut,
    SavingsMonth,
    SavingsOverview,
    SavingsSettingsOut,
    SavingsSettingsUpdate,
    SkipMonth,
    TransactionCreate,
    TransactionOut,
    TransactionStatusUpdate,
)

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _next_month(day: date) -> date:
    return date(day.year + 1, 1, 1) if day.month == 12 else date(day.year, day.month + 1, 1)


def _clamp_to_month(month_start: date, day_of_month: int) -> date:
    """Day 31 in a 30-day month (or 29+ in February) falls on the month's last day."""
    last_day = (_next_month(month_start) - timedelta(days=1)).day
    return month_start.replace(day=min(day_of_month, last_day))


def _materialize_month(db: DbDep, user_id: int, month_start: date) -> None:
    """Create the missing Transaction rows for every active recurring template
    covering this month (lazy materialisation, idempotent). Skipped months and
    already-materialised instances are left alone, so per-month edits persist."""
    templates = list(
        db.scalars(
            select(RecurringTransaction).where(
                RecurringTransaction.user_id == user_id,
                RecurringTransaction.is_active,
                RecurringTransaction.start_month <= month_start,
                (RecurringTransaction.end_month.is_(None))
                | (RecurringTransaction.end_month >= month_start),
            )
        )
    )
    if not templates:
        return
    template_ids = [t.id for t in templates]
    skipped = set(
        db.scalars(
            select(RecurringSkip.recurring_id).where(
                RecurringSkip.recurring_id.in_(template_ids),
                RecurringSkip.month == month_start,
            )
        )
    )
    existing = set(
        db.scalars(
            select(Transaction.recurring_id).where(
                Transaction.user_id == user_id,
                Transaction.recurring_id.in_(template_ids),
                Transaction.recurring_month == month_start,
            )
        )
    )
    created = False
    for template in templates:
        if template.id in skipped or template.id in existing:
            continue
        db.add(
            Transaction(
                user_id=user_id,
                category_id=template.category_id,
                kind=template.kind,
                amount=template.amount,
                description=template.description,
                date=_clamp_to_month(month_start, template.day_of_month),
                status="unpaid",
                recurring_id=template.id,
                recurring_month=month_start,
            )
        )
        created = True
    if not created:
        return
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request materialised the same month first; its rows win.
        db.rollback()


def _get_category(db: DbDep, user_id: int, category_id: int) -> TransactionCategory:
    return get_owned_or_404(
        db, TransactionCategory, user_id, category_id, detail="Category not found"
    )


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
    commit_or_409(db, "Category name already exists")
    db.refresh(category)
    return category


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, payload: CategoryUpdate, current_user: CurrentUser, db: DbDep
) -> TransactionCategory:
    category = _get_category(db, current_user.id, category_id)
    category.name = payload.name
    category.color = payload.color
    commit_or_409(db, "Category name already exists")
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
        _materialize_month(db, current_user.id, start)
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
    tx = get_owned_or_404(db, Transaction, current_user.id, transaction_id)
    _validate_category_kind(db, current_user.id, payload.category_id, payload.kind)
    for field, value in payload.model_dump().items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, current_user: CurrentUser, db: DbDep) -> None:
    tx = get_owned_or_404(db, Transaction, current_user.id, transaction_id)
    if tx.recurring_id is not None and tx.recurring_month is not None:
        # Deleting a generated instance skips that month, otherwise the next
        # month load would just re-materialise it.
        _add_skip(db, current_user.id, tx.recurring_id, tx.recurring_month)
    db.delete(tx)
    db.commit()


@router.patch("/transactions/{transaction_id}/status", response_model=TransactionOut)
def set_transaction_status(
    transaction_id: int,
    payload: TransactionStatusUpdate,
    current_user: CurrentUser,
    db: DbDep,
) -> Transaction:
    tx = get_owned_or_404(db, Transaction, current_user.id, transaction_id)
    tx.status = payload.status
    db.commit()
    db.refresh(tx)
    return tx


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


# --- Recurring templates ---------------------------------------------------------


def _recurring_out(template: RecurringTransaction) -> RecurringOut:
    return RecurringOut(
        id=template.id,
        kind=template.kind,
        amount=float(template.amount),
        description=template.description,
        day_of_month=template.day_of_month,
        start_month=template.start_month,
        end_month=template.end_month,
        category_id=template.category_id,
        is_active=template.is_active,
        skipped_months=sorted(s.month for s in template.skips),
    )


def _normalized_recurring_fields(payload: RecurringCreate) -> dict:
    fields = payload.model_dump()
    fields["start_month"] = _month_start(fields["start_month"])
    if fields["end_month"] is not None:
        fields["end_month"] = _month_start(fields["end_month"])
        if fields["end_month"] < fields["start_month"]:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "end_month is before start_month"
            )
    return fields


@router.get("/recurring", response_model=list[RecurringOut])
def list_recurring(current_user: CurrentUser, db: DbDep) -> list[RecurringOut]:
    templates = db.scalars(
        select(RecurringTransaction)
        .where(RecurringTransaction.user_id == current_user.id)
        .order_by(RecurringTransaction.day_of_month, RecurringTransaction.id)
    )
    return [_recurring_out(t) for t in templates]


@router.post("/recurring", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
def create_recurring(
    payload: RecurringCreate, current_user: CurrentUser, db: DbDep
) -> RecurringOut:
    _validate_category_kind(db, current_user.id, payload.category_id, payload.kind)
    template = RecurringTransaction(
        user_id=current_user.id, **_normalized_recurring_fields(payload)
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _recurring_out(template)


@router.put("/recurring/{recurring_id}", response_model=RecurringOut)
def update_recurring(
    recurring_id: int, payload: RecurringCreate, current_user: CurrentUser, db: DbDep
) -> RecurringOut:
    template = get_owned_or_404(db, RecurringTransaction, current_user.id, recurring_id)
    _validate_category_kind(db, current_user.id, payload.category_id, payload.kind)
    for field, value in _normalized_recurring_fields(payload).items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return _recurring_out(template)


@router.delete("/recurring/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(recurring_id: int, current_user: CurrentUser, db: DbDep) -> None:
    """Deletes the template; already-materialised transactions survive with
    recurring_id set to NULL (history stays intact)."""
    template = get_owned_or_404(db, RecurringTransaction, current_user.id, recurring_id)
    # Detach instances explicitly — SQLite (tests) doesn't apply ON DELETE SET NULL.
    db.execute(
        update(Transaction)
        .where(Transaction.user_id == current_user.id, Transaction.recurring_id == recurring_id)
        .values(recurring_id=None, recurring_month=None)
    )
    db.delete(template)
    db.commit()


def _add_skip(db: DbDep, user_id: int, recurring_id: int, month_start: date) -> None:
    exists = db.scalar(
        select(RecurringSkip.id).where(
            RecurringSkip.recurring_id == recurring_id, RecurringSkip.month == month_start
        )
    )
    if exists is None:
        db.add(RecurringSkip(user_id=user_id, recurring_id=recurring_id, month=month_start))


@router.post("/recurring/{recurring_id}/skips", response_model=RecurringOut)
def skip_month(
    recurring_id: int, payload: SkipMonth, current_user: CurrentUser, db: DbDep
) -> RecurringOut:
    """Skip one month: removes the materialised transaction (if any) and
    prevents it from being regenerated."""
    template = get_owned_or_404(db, RecurringTransaction, current_user.id, recurring_id)
    month = _month_start(payload.month)
    _add_skip(db, current_user.id, recurring_id, month)
    tx = db.scalar(
        select(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.recurring_id == recurring_id,
            Transaction.recurring_month == month,
        )
    )
    if tx is not None:
        db.delete(tx)
    commit_or_409(db, "Month was skipped concurrently; please retry")
    db.refresh(template)
    return _recurring_out(template)


@router.delete("/recurring/{recurring_id}/skips/{month}", response_model=RecurringOut)
def unskip_month(
    recurring_id: int, month: date, current_user: CurrentUser, db: DbDep
) -> RecurringOut:
    """Un-skip a month; the next month load re-materialises the transaction."""
    template = get_owned_or_404(db, RecurringTransaction, current_user.id, recurring_id)
    skip = db.scalar(
        select(RecurringSkip).where(
            RecurringSkip.recurring_id == recurring_id,
            RecurringSkip.month == _month_start(month),
        )
    )
    if skip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skip not found")
    db.delete(skip)
    db.commit()
    db.refresh(template)
    return _recurring_out(template)


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
    commit_or_409(db, "Budget was modified concurrently; please retry")
    db.refresh(budget)
    return budget


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, current_user: CurrentUser, db: DbDep) -> None:
    budget = get_owned_or_404(db, Budget, current_user.id, budget_id)
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
    _materialize_month(db, current_user.id, start)

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


# --- Monthly plan -----------------------------------------------------------------


@router.get("/monthly-plan", response_model=MonthlyPlan)
def monthly_plan(
    current_user: CurrentUser,
    db: DbDep,
    month: Annotated[
        date | None, Query(description="Any day of the month; defaults to today")
    ] = None,
) -> MonthlyPlan:
    start = _month_start(month or date.today())
    _materialize_month(db, current_user.id, start)

    txs = list(
        db.scalars(
            select(Transaction)
            .where(
                Transaction.user_id == current_user.id,
                Transaction.date >= start,
                Transaction.date < _next_month(start),
            )
            .order_by(Transaction.date, Transaction.id)
        )
    )

    recurring_income = sum(float(t.amount) for t in txs if t.kind == "income" and t.recurring_id)
    one_off_income = sum(
        float(t.amount) for t in txs if t.kind == "income" and t.recurring_id is None
    )
    fixed_expenses = [t for t in txs if t.kind == "expense" and t.recurring_id is not None]
    fixed_expense_total = sum(float(t.amount) for t in fixed_expenses)
    variable_expense_total = sum(
        float(t.amount) for t in txs if t.kind == "expense" and t.recurring_id is None
    )
    income_total = recurring_income + one_off_income

    return MonthlyPlan(
        month=start,
        income_total=round(income_total, 2),
        recurring_income_total=round(recurring_income, 2),
        one_off_income_total=round(one_off_income, 2),
        fixed_expense_total=round(fixed_expense_total, 2),
        variable_expense_total=round(variable_expense_total, 2),
        available_for_variable=round(income_total - fixed_expense_total, 2),
        fixed_paid_count=sum(1 for t in fixed_expenses if t.status == "paid"),
        fixed_unpaid_count=sum(1 for t in fixed_expenses if t.status == "unpaid"),
        fixed_items=[
            FixedItem(
                transaction_id=t.id,
                recurring_id=t.recurring_id,
                description=t.description,
                amount=round(float(t.amount), 2),
                date=t.date,
                status=t.status,
                category_id=t.category_id,
            )
            for t in fixed_expenses
        ],
    )


# --- Savings goal -------------------------------------------------------------------

# Sanity cap on how many months the savings overview will walk (20 years).
MAX_SAVINGS_MONTHS = 240


def _get_or_create_settings(db: DbDep, user_id: int) -> FinanceSettings:
    settings = db.scalar(select(FinanceSettings).where(FinanceSettings.user_id == user_id))
    if settings is None:
        settings = FinanceSettings(
            user_id=user_id,
            monthly_savings_target=100,
            savings_start_month=_month_start(date.today()),
        )
        db.add(settings)
        try:
            db.commit()
        except IntegrityError:  # concurrent first read created it already
            db.rollback()
            settings = db.scalar(
                select(FinanceSettings).where(FinanceSettings.user_id == user_id)
            )
    return settings


@router.get("/savings/settings", response_model=SavingsSettingsOut)
def get_savings_settings(current_user: CurrentUser, db: DbDep) -> SavingsSettingsOut:
    settings = _get_or_create_settings(db, current_user.id)
    return SavingsSettingsOut(
        monthly_target=float(settings.monthly_savings_target),
        start_month=settings.savings_start_month,
    )


@router.put("/savings/settings", response_model=SavingsSettingsOut)
def update_savings_settings(
    payload: SavingsSettingsUpdate, current_user: CurrentUser, db: DbDep
) -> SavingsSettingsOut:
    settings = _get_or_create_settings(db, current_user.id)
    settings.monthly_savings_target = payload.monthly_target
    settings.savings_start_month = _month_start(payload.start_month)
    db.commit()
    db.refresh(settings)
    return SavingsSettingsOut(
        monthly_target=float(settings.monthly_savings_target),
        start_month=settings.savings_start_month,
    )


@router.get("/savings", response_model=SavingsOverview)
def savings_overview(current_user: CurrentUser, db: DbDep) -> SavingsOverview:
    """Per-month actual savings (income − all expenses, from real transactions)
    vs the fixed monthly target, plus the cumulative total since the start month.
    Rolls forward automatically: the range always ends at the current month."""
    settings = _get_or_create_settings(db, current_user.id)
    target = float(settings.monthly_savings_target)
    current = _month_start(date.today())

    month_starts: list[date] = []
    cursor = settings.savings_start_month
    while cursor <= current and len(month_starts) < MAX_SAVINGS_MONTHS:
        _materialize_month(db, current_user.id, cursor)
        month_starts.append(cursor)
        cursor = _next_month(cursor)

    per_month: dict[date, dict[str, float]] = {
        m: {"income": 0.0, "expense": 0.0} for m in month_starts
    }
    if month_starts:
        rows = db.execute(
            select(Transaction.kind, Transaction.amount, Transaction.date).where(
                Transaction.user_id == current_user.id,
                Transaction.date >= month_starts[0],
                Transaction.date < _next_month(month_starts[-1]),
            )
        ).all()
        for kind, amount, tx_date in rows:
            key = "income" if kind == "income" else "expense"
            per_month[_month_start(tx_date)][key] += float(amount)

    months: list[SavingsMonth] = []
    for m in month_starts:
        income = per_month[m]["income"]
        expenses = per_month[m]["expense"]
        saved = income - expenses
        months.append(
            SavingsMonth(
                month=m,
                income=round(income, 2),
                expenses=round(expenses, 2),
                saved=round(saved, 2),
                target=target,
                delta=round(saved - target, 2),
                is_current=m == current,
            )
        )

    saved_total = sum(m.saved for m in months)
    target_total = len(months) * target
    return SavingsOverview(
        monthly_target=target,
        start_month=settings.savings_start_month,
        months=months,
        target_total=round(target_total, 2),
        saved_total=round(saved_total, 2),
        delta_total=round(saved_total - target_total, 2),
    )
