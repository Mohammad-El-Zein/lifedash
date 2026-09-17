"""The single place LifeDash talks to the Anthropic API.

Every AI feature (quick capture, life insights) goes through this service, so
model choice, timeouts, error translation and usage logging live in one spot.
The API key is server-side only and comes from the ANTHROPIC_API_KEY
environment variable - it is never sent to or stored in the frontend.

Tests override `get_ai_service` with a fake, so no test ever makes a real call.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import TYPE_CHECKING, Annotated, Any, Protocol, TypeVar

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

if TYPE_CHECKING:  # pragma: no cover - import only needed for type checking
    from anthropic import Anthropic

logger = logging.getLogger(__name__)

SchemaT = TypeVar("SchemaT", bound=BaseModel)

# Claude declines to answer some prompts outright; surface that as a clean 422
# rather than an opaque 502.
REFUSAL_DETAIL = "The assistant declined to answer this request"


class AiClient(Protocol):
    @property
    def configured(self) -> bool:
        """False when no API key is set - callers should degrade gracefully."""
        ...

    def parse(
        self,
        *,
        system: str,
        prompt: str,
        schema: type[SchemaT],
        max_tokens: int = 1024,
    ) -> SchemaT:
        """Ask for a single structured answer validated against `schema`."""
        ...


class AnthropicAiClient:
    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._client: Anthropic | None = None

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def _anthropic(self) -> Anthropic:
        # Imported lazily so the app still boots (with AI features disabled)
        # if the optional dependency is missing.
        import anthropic

        if self._client is None:
            self._client = anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout)
        return self._client

    def parse(
        self,
        *,
        system: str,
        prompt: str,
        schema: type[SchemaT],
        max_tokens: int = 1024,
    ) -> SchemaT:
        if not self.configured:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "AI features are not configured on this server",
            )

        import anthropic

        try:
            response = self._anthropic().messages.parse(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
                output_format=schema,
            )
        except anthropic.RateLimitError as exc:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "The AI service is rate limited; please try again shortly",
            ) from exc
        except anthropic.APIError as exc:
            logger.warning("Anthropic request failed: %s", exc)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "The AI service is currently unavailable"
            ) from exc
        except ValidationError as exc:
            # Structured outputs make this unlikely, but a schema mismatch must
            # not surface as a 500.
            logger.warning("Anthropic answer did not match %s: %s", schema.__name__, exc)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "The AI service returned an unusable answer"
            ) from exc

        self._log_usage(response)
        if response.stop_reason == "refusal":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, REFUSAL_DETAIL)

        parsed = response.parsed_output
        if parsed is None:
            logger.warning("Anthropic returned no parsable output (stop=%s)", response.stop_reason)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, "The AI service returned an unusable answer"
            )
        return parsed

    def _log_usage(self, response: Any) -> None:
        """Token counts are the cost signal - keep them in the logs."""
        usage = getattr(response, "usage", None)
        if usage is None:
            return
        logger.info(
            "anthropic model=%s input_tokens=%s output_tokens=%s",
            self._model,
            getattr(usage, "input_tokens", "?"),
            getattr(usage, "output_tokens", "?"),
        )


@lru_cache
def get_ai_service() -> AiClient:
    settings = get_settings()
    return AnthropicAiClient(
        api_key=settings.anthropic_api_key,
        model=settings.anthropic_model,
        timeout=settings.anthropic_timeout_seconds,
    )


AiDep = Annotated[AiClient, Depends(get_ai_service)]
