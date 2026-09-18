"""Quick-capture parsing: free text (typed or dictated) -> one suggested entry.

Two layers on purpose:

* `AiCapture*` is what Claude fills in. It sticks to primitives and plain
  strings so the JSON schema stays inside what structured outputs support, and
  so a hallucinated value can never reach the database untouched.
* `Capture*` is what the API returns: normalised, clamped, with the free-text
  category resolved against the categories the user actually has.

Nothing here writes to the database - the user confirms in the UI first.
"""

import datetime
from typing import Literal

from pydantic import BaseModel, Field

CaptureModule = Literal["finance", "meals", "calendar", "jobs", "unknown"]
Confidence = Literal["high", "medium", "low"]

MAX_CAPTURE_TEXT = 500


class CaptureRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CAPTURE_TEXT)


# --- What the model fills in --------------------------------------------------------


class AiCaptureFinance(BaseModel):
    kind: Literal["income", "expense"]
    amount: float
    description: str
    date: str
    category: str | None


class AiCaptureMeal(BaseModel):
    name: str
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    calories: int | None
    protein_g: int | None
    carbs_g: int | None
    fat_g: int | None
    date: str


class AiCaptureEvent(BaseModel):
    title: str
    date: str
    start_time: str
    end_time: str
    location: str | None


class AiCaptureJob(BaseModel):
    company: str
    position: str
    status: Literal["applied", "interview", "offer", "rejected", "withdrawn"]
    applied_date: str


class AiCaptureSuggestion(BaseModel):
    module: CaptureModule
    confidence: Confidence
    summary: str
    finance: AiCaptureFinance | None
    meal: AiCaptureMeal | None
    event: AiCaptureEvent | None
    job: AiCaptureJob | None


# --- What the API returns -----------------------------------------------------------


class CaptureFinance(BaseModel):
    kind: Literal["income", "expense"]
    amount: float
    description: str
    date: datetime.date
    category_id: int | None = None
    #: The model's own wording, kept so the UI can offer to create the category.
    category: str | None = None


class CaptureMeal(BaseModel):
    name: str
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    calories: int | None = None
    protein_g: int | None = None
    carbs_g: int | None = None
    fat_g: int | None = None
    date: datetime.date


class CaptureEvent(BaseModel):
    title: str
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time
    location: str | None = None


class CaptureJob(BaseModel):
    company: str
    position: str
    status: Literal["applied", "interview", "offer", "rejected", "withdrawn"]
    applied_date: datetime.date


class CaptureSuggestion(BaseModel):
    module: CaptureModule
    confidence: Confidence
    summary: str
    finance: CaptureFinance | None = None
    meal: CaptureMeal | None = None
    event: CaptureEvent | None = None
    job: CaptureJob | None = None
