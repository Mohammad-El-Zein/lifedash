import datetime
from typing import Literal

from pydantic import BaseModel

InsightTone = Literal["positive", "neutral", "warning"]


class AiInsight(BaseModel):
    title: str
    body: str
    #: Module keys the insight draws on, e.g. ["finance", "meals"].
    modules: list[str]
    tone: InsightTone


class AiInsights(BaseModel):
    insights: list[AiInsight]


class Insight(BaseModel):
    title: str
    body: str
    modules: list[str]
    tone: InsightTone


class InsightsResponse(BaseModel):
    """`available` is False when the server has no Anthropic key configured -
    the UI then hides the section instead of showing an error."""

    available: bool
    insights: list[Insight]
    generated_at: datetime.datetime | None = None
    language: str | None = None
