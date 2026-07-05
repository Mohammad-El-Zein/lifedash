from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class LearningGoal(Base, TimestampMixin):
    __tablename__ = "learning_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    target_date: Mapped[date | None] = mapped_column(Date)
    # "active" | "done" | "paused"
    status: Mapped[str] = mapped_column(String(20), default="active")

    milestones: Mapped[list["LearningMilestone"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="LearningMilestone.position"
    )


class LearningMilestone(Base, TimestampMixin):
    __tablename__ = "learning_milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal_id: Mapped[int] = mapped_column(
        ForeignKey("learning_goals.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    done: Mapped[bool] = mapped_column(default=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    position: Mapped[int] = mapped_column(default=0)

    goal: Mapped[LearningGoal] = relationship(back_populates="milestones")
