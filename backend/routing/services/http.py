"""Shared outbound HTTP session: connection pooling, retries with backoff, and sane timeouts."""

from functools import cache

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class UpstreamError(Exception):
    """An external provider (routing / weather / geocoding) failed or returned unusable data."""

    def __init__(self, message: str, *, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


MAX_RETRY_AFTER_S = 5.0


class CappedRetry(Retry):
    """Honour Retry-After, but never stall a user request for long (rate-limit windows can be 60 s)."""

    def get_retry_after(self, response) -> float | None:
        retry_after = super().get_retry_after(response)
        return None if retry_after is None else min(retry_after, MAX_RETRY_AFTER_S)


QUICK_READ_TIMEOUT_S = 8.0


@cache
def session(retries: bool = True) -> requests.Session:
    """Pooled session. `retries=False` is for best-effort calls that must fail fast."""
    retry = CappedRetry(
        total=2 if retries else 0,
        connect=2 if retries else 0,
        read=1 if retries else 0,
        backoff_factor=0.6,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(pool_connections=8, pool_maxsize=32, max_retries=retry)
    s = requests.Session()
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({"User-Agent": settings.HTTP_USER_AGENT, "Accept": "application/json"})
    return s


def timeout(quick: bool = False) -> tuple[float, float]:
    return (5.0, QUICK_READ_TIMEOUT_S if quick else settings.HTTP_TIMEOUT_S)
