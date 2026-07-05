from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Meal(Base, TimestampMixin):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(20))  # "breakfast" | "lunch" | "dinner" | "snack"
    name: Mapped[str] = mapped_column(String(200))
    calories: Mapped[int | None]
    protein_g: Mapped[int | None]
    carbs_g: Mapped[int | None]
    fat_g: Mapped[int | None]
    notes: Mapped[str | None] = mapped_column(Text)
