from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Ingredient(Base, TimestampMixin):
    """Nutrition is stored per 100 g; piece_grams optionally maps pieces to grams."""

    __tablename__ = "ingredients"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    calories_per_100g: Mapped[Decimal] = mapped_column(Numeric(7, 1))
    protein_per_100g: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    carbs_per_100g: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    fat_per_100g: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    piece_grams: Mapped[Decimal | None] = mapped_column(Numeric(7, 1))


class MealTemplate(Base, TimestampMixin):
    __tablename__ = "meal_templates"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))

    items: Mapped[list["MealTemplateItem"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="MealTemplateItem.id"
    )


class MealTemplateItem(Base, TimestampMixin):
    """Amount is either grams (unit='g') or pieces (unit='piece', needs
    ingredient.piece_grams)."""

    __tablename__ = "meal_template_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("meal_templates.id", ondelete="CASCADE"), index=True
    )
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id", ondelete="CASCADE"))
    unit: Mapped[str] = mapped_column(String(10))  # "g" | "piece"
    amount: Mapped[Decimal] = mapped_column(Numeric(8, 1))

    template: Mapped[MealTemplate] = relationship(back_populates="items")
    ingredient: Mapped[Ingredient] = relationship()


class Meal(Base, TimestampMixin):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    meal_type: Mapped[str] = mapped_column(String(20))  # "breakfast" | "lunch" | "dinner" | "snack"
    name: Mapped[str] = mapped_column(String(200))
    calories: Mapped[int | None]
    protein_g: Mapped[int | None]
    carbs_g: Mapped[int | None]
    fat_g: Mapped[int | None]
    notes: Mapped[str | None] = mapped_column(Text)
    # Snapshot provenance: which template this entry was logged from (values are
    # copied at log time, so later template edits don't rewrite history).
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("meal_templates.id", ondelete="SET NULL")
    )
    # Keep `date` last: SQLAlchemy resolves later `datetime.date` annotations
    # against this attribute otherwise (see dev-environment notes).
    date: Mapped[date] = mapped_column(Date, index=True)
