from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_serializer

KINDS = ("income", "expense")


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field(pattern="^(income|expense)$")
    color: str = Field(default="#3987e5", max_length=20)


class CategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = Field(max_length=20)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: str
    color: str


class TransactionCreate(BaseModel):
    kind: str = Field(pattern="^(income|expense)$")
    amount: float = Field(gt=0, le=1_000_000_000)
    description: str | None = Field(default=None, max_length=255)
    date: date
    category_id: int | None = None
    status: str = Field(default="paid", pattern="^(paid|unpaid)$")


class TransactionStatusUpdate(BaseModel):
    status: str = Field(pattern="^(paid|unpaid)$")


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    amount: float
    description: str | None
    date: date
    category_id: int | None
    status: str
    recurring_id: int | None

    @field_serializer("amount")
    def round_amount(self, v: float) -> float:
        return round(v, 2)


class RecurringCreate(BaseModel):
    kind: str = Field(pattern="^(income|expense)$")
    amount: float = Field(gt=0, le=1_000_000_000)
    description: str = Field(min_length=1, max_length=255)
    day_of_month: int = Field(ge=1, le=31)
    start_month: date  # any day within the month; normalised to the 1st
    end_month: date | None = None  # inclusive; normalised to the 1st
    category_id: int | None = None
    is_active: bool = True


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    amount: float
    description: str
    day_of_month: int
    start_month: date
    end_month: date | None
    category_id: int | None
    is_active: bool
    skipped_months: list[date] = []

    @field_serializer("amount")
    def round_amount(self, v: float) -> float:
        return round(v, 2)


class SkipMonth(BaseModel):
    month: date  # any day within the month; normalised to the 1st


class BudgetUpsert(BaseModel):
    category_id: int
    month: date  # any day within the month; normalised to the 1st
    amount: float = Field(ge=0, le=1_000_000_000)


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    month: date
    amount: float


class CategorySummary(BaseModel):
    category_id: int | None
    name: str
    color: str
    spent: float
    budget: float | None


class MonthSummary(BaseModel):
    month: date
    income_total: float
    expense_total: float
    net: float
    expenses_by_category: list[CategorySummary]


class FixedItem(BaseModel):
    """A materialised recurring expense for the plan month."""

    transaction_id: int
    recurring_id: int | None
    description: str | None
    amount: float
    date: date
    status: str
    category_id: int | None


class MonthlyPlan(BaseModel):
    month: date
    income_total: float
    recurring_income_total: float
    one_off_income_total: float
    fixed_expense_total: float
    variable_expense_total: float
    available_for_variable: float  # income_total - fixed_expense_total
    fixed_paid_count: int
    fixed_unpaid_count: int
    fixed_items: list[FixedItem]


class SavingsSettingsUpdate(BaseModel):
    monthly_target: float = Field(ge=0, le=1_000_000_000)
    start_month: date  # any day within the month; normalised to the 1st


class SavingsSettingsOut(BaseModel):
    monthly_target: float
    start_month: date


class SavingsMonth(BaseModel):
    month: date
    income: float
    expenses: float
    saved: float  # income - expenses
    target: float
    delta: float  # saved - target
    is_current: bool


class SavingsOverview(BaseModel):
    monthly_target: float
    start_month: date
    months: list[SavingsMonth]  # start_month .. current month, oldest first
    target_total: float  # len(months) × monthly_target
    saved_total: float
    delta_total: float
