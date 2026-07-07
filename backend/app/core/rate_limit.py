"""In-process sliding-window rate limiting for the auth endpoints.

Deliberately dependency-free: a per-IP deque of recent attempts guarded by a
lock. This protects a single-instance deployment (which is what LifeDash runs);
a multi-instance setup would move this to the proxy or a shared store.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


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
register_limiter = RateLimiter(limit=5, window_seconds=60)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def limit_login(request: Request) -> None:
    login_limiter.check(_client_ip(request))


def limit_register(request: Request) -> None:
    register_limiter.check(_client_ip(request))
