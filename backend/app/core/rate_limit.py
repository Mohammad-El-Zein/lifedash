"""In-process sliding-window rate limiting for the auth endpoints.

Deliberately dependency-free: a per-IP deque of recent attempts guarded by a
lock. This protects a single-instance deployment (which is what LifeDash runs);
a multi-instance setup would move this to the proxy or a shared store.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.schemas.auth import UserLogin


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Record one attempt for `key`; raise 429 once the window is full."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Too many attempts; please try again later",
                    headers={"Retry-After": str(int(self.window))},
                )
            hits.append(now)

    def reset(self) -> None:
        """Test hook: forget all recorded attempts."""
        with self._lock:
            self._hits.clear()


login_limiter = RateLimiter(limit=10, window_seconds=60)
# Per-account guard, independent of how requests reach us: a spoofed or shared
# client IP must not allow unlimited attempts against one email.
login_email_limiter = RateLimiter(limit=10, window_seconds=300)
register_limiter = RateLimiter(limit=5, window_seconds=60)


def _client_ip(request: Request) -> str:
    """Best-effort client IP. In production every request arrives through the
    nginx proxy / Container Apps ingress, so request.client.host is the proxy —
    one shared bucket for all users. Prefer the X-Forwarded-For chain set by
    those proxies. The leftmost entry is client-controllable (spoofing escapes
    only the IP bucket; the per-email limiter above still applies)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "unknown"


def limit_login(request: Request, payload: UserLogin) -> None:
    login_limiter.check(_client_ip(request))
    login_email_limiter.check(payload.email.lower())


def limit_register(request: Request) -> None:
    register_limiter.check(_client_ip(request))
