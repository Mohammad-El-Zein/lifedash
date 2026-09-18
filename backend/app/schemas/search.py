import datetime
from decimal import Decimal

from pydantic import BaseModel


class SearchHit(BaseModel):
    """One matched row. The backend stays language- and route-agnostic: it returns
    the raw pieces (title, optional data subtitle, amount, date) plus module/entity
    keys, and the frontend owns labels, formatting and navigation."""

    module: str
    entity: str
    id: int
    title: str
    subtitle: str | None = None
    amount: Decimal | None = None
    # datetime.date spelled out: a field named `date` would shadow a bare `date` import.
    date: datetime.date | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchHit]
