"""Life insights: 2-4 short cross-module observations, generated once a day.

Cost shape: a dashboard visit must not mean an API call. A set is generated
lazily on the first visit of a day (the same "materialise on read" idea the
finance module uses for recurring transactions) and served from the cache for
every visit after that. An explicit refresh is possible but rate limited.
"""

import datetime
import json
import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.config import get_settings
from app.core.rate_limit import insights_refresh_limiter
from app.models.insights import InsightSet
from app.models.user import User
from app.schemas.insights import AiInsights, Insight, InsightsResponse
from app.services.ai import AiClient, AiDep
from app.services.insights import (
    MAX_INSIGHTS,
    MAX_TOKENS,
    build_snapshot,
    has_enough_data,
    system_prompt,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["insights"])

MODULE_KEYS = {"calendar", "finance", "fitness", "meals", "jobs", "learning", "habits"}
MIN_MODULES_PER_INSIGHT = 2


def _language_of(user: User) -> str:
    return "de" if (user.language or "en").startswith("de") else "en"


def _is_fresh(cached: InsightSet | None, language: str, today: datetime.date) -> bool:
    """Fresh means: generated today, and in the language the UI is showing."""
    if cached is None:
        return False
    if cached.language != language:
        return False
    return cached.generated_at.date() == today


def _to_response(cached: InsightSet | None, *, available: bool) -> InsightsResponse:
    if cached is None:
        return InsightsResponse(available=available, insights=[])
    return InsightsResponse(
        available=available,
        insights=[Insight.model_validate(item) for item in cached.insights],
        generated_at=cached.generated_at,
        language=cached.language,
    )


def _generate(
    db: DbDep,
    ai: AiClient,
    user: User,
    language: str,
    today: datetime.date,
    cached: InsightSet | None,
) -> InsightSet | None:
    """Build the snapshot, ask for insights, store them. Returns None when there
    is not enough data to say anything worth an API call."""
    snapshot = build_snapshot(db, user.id, today)
    if not has_enough_data(snapshot):
        return None

    answer = ai.parse(
        system=system_prompt(language),
        prompt=json.dumps(snapshot, ensure_ascii=False, sort_keys=True),
        schema=AiInsights,
        max_tokens=MAX_TOKENS,
    )

    items = []
    for insight in answer.insights:
        # Unknown module keys would break the icon lookup in the UI.
        modules = sorted({module for module in insight.modules if module in MODULE_KEYS})
        if len(modules) < MIN_MODULES_PER_INSIGHT:
            # Connecting two modules is the whole premise of the feature; the
            # prompt asks for it, and live runs show it is not always honoured.
            # A single-module observation is dropped rather than shown.
            logger.info("Dropping single-module insight: %s", insight.title)
            continue
        items.append(
            {
                "title": insight.title.strip()[:80],
                "body": insight.body.strip()[:300],
                "modules": modules,
                "tone": insight.tone,
            }
        )
        if len(items) == MAX_INSIGHTS:
            break
    if not items:
        return None

    settings = get_settings()
    if cached is None:
        cached = InsightSet(user_id=user.id)
        db.add(cached)
    cached.language = language
    cached.model = settings.anthropic_model
    cached.generated_at = datetime.datetime.now(datetime.UTC)
    cached.insights = items
    db.commit()
    db.refresh(cached)
    return cached


def _cached_for(db: DbDep, user_id: int) -> InsightSet | None:
    return db.scalar(select(InsightSet).where(InsightSet.user_id == user_id))


@router.get("", response_model=InsightsResponse)
def get_insights(current_user: CurrentUser, db: DbDep, ai: AiDep) -> InsightsResponse:
    """Today's insights, generating them on the first visit of the day."""
    if not ai.configured:
        return _to_response(None, available=False)

    language = _language_of(current_user)
    today = datetime.date.today()
    cached = _cached_for(db, current_user.id)
    if _is_fresh(cached, language, today):
        return _to_response(cached, available=True)

    try:
        generated = _generate(db, ai, current_user, language, today, cached)
    except HTTPException:
        # An upstream hiccup should not blank the dashboard: yesterday's set is
        # still useful, and the UI shows when it was generated. With nothing
        # cached there is nothing to fall back to, so the error stands.
        if cached is None:
            raise
        logger.warning("Insight generation failed; serving the cached set")
        return _to_response(cached, available=True)

    # Nothing new to say: keep serving the previous set rather than an empty row.
    return _to_response(generated or cached, available=True)


@router.post("/refresh", response_model=InsightsResponse)
def refresh_insights(current_user: CurrentUser, db: DbDep, ai: AiDep) -> InsightsResponse:
    """Regenerate on demand. Each call costs one API call, so it is capped."""
    if not ai.configured:
        return _to_response(None, available=False)

    insights_refresh_limiter.check(str(current_user.id))
    language = _language_of(current_user)
    cached = _cached_for(db, current_user.id)
    generated = _generate(db, ai, current_user, language, datetime.date.today(), cached)
    return _to_response(generated or cached, available=True)
