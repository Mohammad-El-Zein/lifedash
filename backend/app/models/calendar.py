from datetime import date, time

from sqlalchemy import JSON, Date, ForeignKey, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class CalendarEvent(Base, TimestampMixin):
    """A one-off event (recurrence_days is NULL, happens on start_date) or a weekly
    recurring event (recurrence_days holds weekday numbers, 0=Monday .. 6=Sunday,
    active from start_date until end_date inclusive; NULL end_date = open-ended)."""

    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(255))
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    recurrence_days: Mapped[list[int] | None] = mapped_column(JSON)

    exceptions: Mapped[list["CalendarEventException"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class CalendarEventException(Base, TimestampMixin):
    """Overrides a single occurrence of an event: either cancelled entirely or
    moved to a different date/time."""

    __tablename__ = "calendar_event_exceptions"
    __table_args__ = (UniqueConstraint("event_id", "original_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("calendar_events.id", ondelete="CASCADE"), index=True
    )
    original_date: Mapped[date] = mapped_column(Date)
    kind: Mapped[str] = mapped_column(String(10))  # "cancelled" | "moved"
    new_date: Mapped[date | None] = mapped_column(Date)
    new_start_time: Mapped[time | None] = mapped_column(Time)
    new_end_time: Mapped[time | None] = mapped_column(Time)
    note: Mapped[str | None] = mapped_column(String(255))

    event: Mapped[CalendarEvent] = relationship(back_populates="exceptions")
