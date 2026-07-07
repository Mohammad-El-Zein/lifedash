from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

GOAL_STATUSES = ("active", "paused", "done")
STATUS_PATTERN = "^(active|paused|done)$"


class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None


class MilestoneUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None
    done: bool


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    done: bool
    due_date: date | None
    position: int


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    target_date: date | None = None
    milestones: list[MilestoneCreate] = Field(default_factory=list, max_length=100)


class GoalUpdate(BaseModel):
    """Status is changed via the dedicated /status endpoint; milestones via their
    own endpoints so done-flags survive goal edits."""

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    target_date: date | None = None


class GoalStatusChange(BaseModel):
    status: str = Field(pattern=STATUS_PATTERN)


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    target_date: date | None
    status: str
    created_at: datetime
    milestones: list[MilestoneOut] = []
