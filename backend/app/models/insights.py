import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class InsightSet(Base, TimestampMixin):
    """The cached life insights for one user - at most one row each.

    Insights cost an API call, so they are generated once a day (lazily, on the
    first dashboard load of the day) or on an explicit refresh, and served from
    here in between. `language` is part of the freshness check: switching the UI
    language must not keep showing yesterday's German text in an English UI.
    """

    __tablename__ = "insight_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    language: Mapped[str] = mapped_column(String(5))
    model: Mapped[str] = mapped_column(String(50))
    generated_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True))
    #: List of {title, body, modules, tone} dicts, as generated.
    insights: Mapped[list[dict]] = mapped_column(JSON)
