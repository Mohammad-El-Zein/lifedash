from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TransactionCategory(Base, TimestampMixin):
    __tablename__ = "transaction_categories"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(10))  # "income" | "expense"
    color: Mapped[str] = mapped_column(String(20), default="#10b981")


class RecurringTransaction(Base, TimestampMixin):
    """Template for a monthly recurring transaction (salary, rent, insurance…).
    Real Transaction rows are materialised lazily, once per month, when a month
    is first viewed. A RecurringSkip row suppresses a single month; editing the
    materialised transaction covers per-month changes."""

    __tablename__ = "recurring_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("transaction_categories.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(10))  # "income" | "expense"
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    description: Mapped[str] = mapped_column(String(255))
    day_of_month: Mapped[int] = mapped_column()  # 1..31, clamped to the month's length
    start_month: Mapped[date] = mapped_column(Date)  # first day of the month
    end_month: Mapped[date | None] = mapped_column(Date)  # inclusive; NULL = open-ended
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category: Mapped[TransactionCategory | None] = relationship()
    skips: Mapped[list["RecurringSkip"]] = relationship(
        back_populates="recurring", cascade="all, delete-orphan"
    )


class RecurringSkip(Base, TimestampMixin):
    """Marks one month of a recurring template as skipped, so materialisation
    won't (re)create a transaction for it."""

    __tablename__ = "recurring_transaction_skips"
    __table_args__ = (UniqueConstraint("recurring_id", "month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    recurring_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_transactions.id", ondelete="CASCADE"), index=True
    )
    month: Mapped[date] = mapped_column(Date)  # first day of the month

    recurring: Mapped[RecurringTransaction] = relationship(back_populates="skips")


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_user_date", "user_id", "date"),
        # One materialised instance per template and month (NULLs don't collide).
        UniqueConstraint("recurring_id", "recurring_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("transaction_categories.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(10))  # "income" | "expense"
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    description: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(10), default="paid", server_default="paid")
    recurring_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_transactions.id", ondelete="SET NULL")
    )
    recurring_month: Mapped[date | None] = mapped_column(Date)  # first day of the month
    # NOTE: the `date` column must stay last — once assigned, the class attribute
    # shadows datetime.date in the annotations of any column declared after it.
    date: Mapped[date] = mapped_column(Date, index=True)

    category: Mapped[TransactionCategory | None] = relationship()


class FinanceSettings(Base, TimestampMixin):
    """Per-user finance settings; auto-created with defaults on first read.
    The savings target applies retroactively: cumulative target = months × current value."""

    __tablename__ = "finance_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    monthly_savings_target: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal(100))
    savings_start_month: Mapped[date] = mapped_column(Date)  # first day of the month


class Budget(Base, TimestampMixin):
    """Monthly budget per category; month is stored as the first day of the month."""

    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("user_id", "category_id", "month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("transaction_categories.id", ondelete="CASCADE")
    )
    month: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    category: Mapped[TransactionCategory] = relationship()
