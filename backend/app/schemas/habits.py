from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # Weekday numbers (0=Monday .. 6=Sunday); None or all 7 days = daily.
    schedule_days: list[int] | None = None

    @field_validator("schedule_days")
    @classmethod
    def normalize_schedule(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        days = sorted(set(value))
        if any(day < 0 or day > 6 for day in days):
            raise ValueError("schedule_days must contain weekday numbers 0-6")
        if not days:
            raise ValueError("schedule_days must not be empty; use null for daily")
        return None if len(days) == 7 else days


class HabitUpdate(HabitCreate):
    is_archived: bool


class ToggleLog(BaseModel):
    date: date


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    done: bool


class HabitOut(BaseModel):
    id: int
    name: str
    schedule_days: list[int] | None
    is_archived: bool
    streak: int
    week_logs: dict[str, bool]
