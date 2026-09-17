"""Quick capture: one short note (spoken or typed) -> one suggested entry.

This endpoint only *suggests*. It never writes: the frontend shows the parsed
result, the user confirms or corrects it, and the existing module endpoints do
the actual create. Anything the model returns is re-validated and clamped here
before it is handed back.
"""

import datetime
import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.rate_limit import capture_limiter
from app.models.finance import TransactionCategory
from app.schemas.capture import (
    AiCaptureSuggestion,
    CaptureEvent,
    CaptureFinance,
    CaptureJob,
    CaptureMeal,
    CaptureRequest,
    CaptureSuggestion,
)
from app.schemas.meals import MAX_MEAL_CALORIES, MAX_MEAL_MACRO_G
from app.services.ai import AiDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/capture", tags=["capture"])

MAX_AMOUNT = 1_000_000_000
MAX_TOKENS = 700
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

SYSTEM_PROMPT = """You turn one short note - spoken or typed - into a single \
structured LifeDash entry.

Today is {today} ({weekday}). Write any text you produce in {language}.

Choose exactly one module:
- finance: money spent or received
- meals: food or drink the user logged
- calendar: an appointment or event
- jobs: a job application

Rules:
- Fill only the block of the module you chose; every other block is null.
- If the note does not clearly fit one of these modules, use module "unknown", \
set every block to null, and say so in the summary.
- Resolve relative dates against today's date. With no date given, use today.
- Amounts are always positive: use kind "expense" for money spent and "income" \
for money received.
- finance.category: pick one of the user's existing categories when it fits, \
otherwise a short new name, otherwise null. Never invent numbers.
- Dates are YYYY-MM-DD, times are 24-hour HH:MM.
- For an event with no stated end time, end one hour after it starts.
- summary: one short sentence confirming what will be saved, in {language}.
- confidence: "high" when every field was stated, "medium" when you inferred \
something, "low" when you are mostly guessing.

The user's existing finance categories: {categories}."""


def _prompt(user_language: str | None, categories: list[str], today: datetime.date) -> str:
    language = "German" if (user_language or "en").startswith("de") else "English"
    return SYSTEM_PROMPT.format(
        today=today.isoformat(),
        weekday=WEEKDAYS[today.weekday()],
        language=language,
        categories=", ".join(categories) if categories else "none yet",
    )


def _date_or(value: str | None, fallback: datetime.date) -> datetime.date:
    try:
        return datetime.date.fromisoformat((value or "").strip())
    except ValueError:
        return fallback


def _time_or(value: str | None, fallback: datetime.time) -> datetime.time:
    try:
        return datetime.time.fromisoformat((value or "").strip())
    except ValueError:
        return fallback


def _clamp(value: int | None, ceiling: int) -> int | None:
    if value is None:
        return None
    return max(0, min(value, ceiling))


def _finance(
    ai: AiCaptureSuggestion, categories: dict[str, int], today: datetime.date
) -> CaptureFinance | None:
    block = ai.finance
    if block is None:
        return None
    amount = min(abs(block.amount), MAX_AMOUNT)
    if amount <= 0:
        return None
    name = (block.category or "").strip()
    return CaptureFinance(
        kind=block.kind,
        amount=round(amount, 2),
        description=block.description.strip()[:255],
        date=_date_or(block.date, today),
        category_id=categories.get(name.casefold()),
        category=name or None,
    )


def _meal(ai: AiCaptureSuggestion, today: datetime.date) -> CaptureMeal | None:
    block = ai.meal
    if block is None:
        return None
    return CaptureMeal(
        name=block.name.strip()[:200],
        meal_type=block.meal_type,
        calories=_clamp(block.calories, MAX_MEAL_CALORIES),
        protein_g=_clamp(block.protein_g, MAX_MEAL_MACRO_G),
        carbs_g=_clamp(block.carbs_g, MAX_MEAL_MACRO_G),
        fat_g=_clamp(block.fat_g, MAX_MEAL_MACRO_G),
        date=_date_or(block.date, today),
    )


def _event(ai: AiCaptureSuggestion, today: datetime.date) -> CaptureEvent | None:
    block = ai.event
    if block is None:
        return None
    start = _time_or(block.start_time, datetime.time(9, 0))
    end = _time_or(block.end_time, datetime.time(0, 0))
    if end <= start:
        # The calendar rejects a non-positive span; default to one hour, capped
        # at the end of the day.
        end = min(datetime.time(23, 59), datetime.time((start.hour + 1) % 24, start.minute))
        if end <= start:
            end = datetime.time(23, 59)
    return CaptureEvent(
        title=block.title.strip()[:200],
        date=_date_or(block.date, today),
        start_time=start,
        end_time=end,
        location=(block.location or "").strip()[:255] or None,
    )


def _job(ai: AiCaptureSuggestion, today: datetime.date) -> CaptureJob | None:
    block = ai.job
    if block is None:
        return None
    return CaptureJob(
        company=block.company.strip()[:200],
        position=block.position.strip()[:200],
        status=block.status,
        applied_date=_date_or(block.applied_date, today),
    )


def _normalise(
    ai: AiCaptureSuggestion, categories: dict[str, int], today: datetime.date
) -> CaptureSuggestion:
    """Keep only the block belonging to the chosen module, clamped to what the
    module endpoints accept. A module whose block came back empty degrades to
    "unknown" rather than handing the UI a half-filled form."""
    blocks = {
        "finance": lambda: _finance(ai, categories, today),
        "meals": lambda: _meal(ai, today),
        "calendar": lambda: _event(ai, today),
        "jobs": lambda: _job(ai, today),
    }
    builder = blocks.get(ai.module)
    block = builder() if builder else None
    if block is None:
        return CaptureSuggestion(
            module="unknown", confidence=ai.confidence, summary=ai.summary.strip()[:300]
        )

    suggestion = CaptureSuggestion(
        module=ai.module, confidence=ai.confidence, summary=ai.summary.strip()[:300]
    )
    field = {"finance": "finance", "meals": "meal", "calendar": "event", "jobs": "job"}[ai.module]
    setattr(suggestion, field, block)
    return suggestion


@router.post("/parse", response_model=CaptureSuggestion)
def parse_capture(
    payload: CaptureRequest,
    current_user: CurrentUser,
    db: DbDep,
    ai: AiDep,
) -> CaptureSuggestion:
    """Parse a note into a suggested entry. Costs one (small) API call, so it is
    rate limited per user; nothing is persisted."""
    text = payload.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nothing to parse")

    capture_limiter.check(str(current_user.id))

    categories = list(
        db.scalars(
            select(TransactionCategory).where(TransactionCategory.user_id == current_user.id)
        )
    )
    by_name = {category.name.casefold(): category.id for category in categories}

    suggestion = ai.parse(
        system=_prompt(current_user.language, [c.name for c in categories], datetime.date.today()),
        prompt=text,
        schema=AiCaptureSuggestion,
        max_tokens=MAX_TOKENS,
    )
    return _normalise(suggestion, by_name, datetime.date.today())
