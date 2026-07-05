from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

JOB_STATUSES = ("applied", "interview", "offer", "rejected", "withdrawn")
STATUS_PATTERN = "^(applied|interview|offer|rejected|withdrawn)$"


class ApplicationCreate(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    position: str = Field(min_length=1, max_length=200)
    link: str | None = Field(default=None, max_length=500)
    status: str = Field(default="applied", pattern=STATUS_PATTERN)
    applied_date: date | None = None
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    """Status is changed via the dedicated /status endpoint so history stays intact."""

    company: str = Field(min_length=1, max_length=200)
    position: str = Field(min_length=1, max_length=200)
    link: str | None = Field(default=None, max_length=500)
    applied_date: date | None = None
    notes: str | None = None


class StatusChange(BaseModel):
    status: str = Field(pattern=STATUS_PATTERN)
    note: str | None = Field(default=None, max_length=255)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    note: str | None
    changed_at: datetime


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: str
    position: str
    link: str | None
    status: str
    applied_date: date | None
    notes: str | None
    status_history: list[StatusHistoryOut] = []
    documents: list[DocumentOut] = []
