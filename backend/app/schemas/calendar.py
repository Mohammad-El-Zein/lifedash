from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class EventBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=255)
    color: str = Field(default="#6366f1", max_length=20)
    start_date: date
    end_date: date | None = None
    start_time: time
    end_time: time
    recurrence_days: list[int] | None = None

    @field_validator("recurrence_days")
    @classmethod
    def validate_weekdays(cls, v: list[int] | None) -> list[int] | None:
        if v is not None:
            if not v:
                raise ValueError("recurrence_days must not be empty (use null for one-off events)")
            if any(d < 0 or d > 6 for d in v):
                raise ValueError("weekday numbers must be between 0 (Monday) and 6 (Sunday)")
            v = sorted(set(v))
        return v

    @model_validator(mode="after")
    def validate_ranges(self) -> "EventBase":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class EventCreate(EventBase):
    pass


class EventUpdate(EventBase):
    pass


class ExceptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    original_date: date
    kind: str
    new_date: date | None
    new_start_time: time | None
    new_end_time: time | None
    note: str | None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    location: str | None
    color: str
    start_date: date
    end_date: date | None
    start_time: time
    end_time: time
    recurrence_days: list[int] | None
    exceptions: list[ExceptionOut] = []


class ExceptionCreate(BaseModel):
    original_date: date
    kind: str = Field(pattern="^(cancelled|moved)$")
    new_date: date | None = None
    new_start_time: time | None = None
    new_end_time: time | None = None
    note: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_moved(self) -> "ExceptionCreate":
        if self.kind == "moved":
            if self.new_date is None or self.new_start_time is None or self.new_end_time is None:
                raise ValueError(
                    "moved exceptions require new_date, new_start_time and new_end_time"
                )
            if self.new_end_time <= self.new_start_time:
                raise ValueError("new_end_time must be after new_start_time")
        return self


class Occurrence(BaseModel):
    """A single concrete instance of an event on a specific day (recurrence expanded,
    exceptions applied)."""

    event_id: int
    exception_id: int | None = None
    title: str
    description: str | None
    location: str | None
    color: str
    date: date
    start_time: time
    end_time: time
    is_recurring: bool
    is_moved: bool = False


class WeekResponse(BaseModel):
    week_start: date
    week_end: date
    occurrences: list[Occurrence]
