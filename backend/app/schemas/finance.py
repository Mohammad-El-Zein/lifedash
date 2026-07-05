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


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    amount: float
    description: str | None
    date: date
    category_id: int | None

    @field_serializer("amount")
    def round_amount(self, v: float) -> float:
        return round(v, 2)


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
