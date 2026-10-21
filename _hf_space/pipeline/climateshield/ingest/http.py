"""HTTP fetch with timeout, retries, rate limit, and a small robots.txt check."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlparse

from climateshield.config import HTTP_RATE_LIMIT_SECONDS, HTTP_RETRIES, HTTP_TIMEOUT_SECONDS, USER_AGENT


@dataclass
class HttpResponse:
    url: str
    status: int
    body: bytes
    headers: dict[str, str]
    elapsed_seconds: float
    attempts: int
    error: str = ""

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")

    @property
    def etag(self) -> str:
        return self.headers.get("etag") or self.headers.get("ETag") or ""

    @property
    def last_modified(self) -> str:
        return self.headers.get("last-modified") or self.headers.get("Last-Modified") or ""


class RateLimiter:
    def __init__(self, min_interval_seconds: float = HTTP_RATE_LIMIT_SECONDS) -> None:
        self.min_interval_seconds = min_interval_seconds
        self._last = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        gap = self.min_interval_seconds - (now - self._last)
        if gap > 0:
            time.sleep(gap)
        self._last = time.monotonic()


_LIMITER = RateLimiter()
_ROBOTS_CACHE: dict[str, str] = {}


def clear_robots_cache() -> None:
    _ROBOTS_CACHE.clear()


def _header_map(headers: Any) -> dict[str, str]:
    if headers is None:
        return {}
    try:
        return {str(k).lower(): str(v) for k, v in headers.items()}
    except Exception:  # noqa: BLE001
        return {}


def fetch_url(
    url: str,
    *,
    timeout: float = HTTP_TIMEOUT_SECONDS,
    retries: int = HTTP_RETRIES,
    method: str = "GET",
    limiter: RateLimiter | None = None,
) -> HttpResponse:
    limiter = limiter or _LIMITER
    last_error = ""
    for attempt in range(1, retries + 1):
        limiter.wait()
        started = time.monotonic()
        request = urllib.request.Request(
            url,
            method=method,
            headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
                headers = _header_map(response.headers)
                return HttpResponse(
                    url=str(response.geturl() or url),
                    status=int(getattr(response, "status", 200) or 200),
                    body=body,
                    headers=headers,
                    elapsed_seconds=time.monotonic() - started,
                    attempts=attempt,
                )
        except urllib.error.HTTPError as exc:
            body = b""
            try:
                body = exc.read() or b""
            except Exception:  # noqa: BLE001
                body = b""
            last_error = f"HTTP {exc.code}: {exc.reason}"
            response = HttpResponse(
                url=url,
                status=int(exc.code),
                body=body,
                headers=_header_map(exc.headers),
                elapsed_seconds=time.monotonic() - started,
                attempts=attempt,
                error=last_error,
            )
            if exc.code in {408, 429, 500, 502, 503, 504} and attempt < retries:
                time.sleep(2 ** attempt)
                continue
            return response
        except Exception as exc:  # noqa: BLE001
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < retries:
                time.sleep(2 ** attempt)
                continue
            return HttpResponse(
                url=url,
                status=0,
                body=b"",
                headers={},
                elapsed_seconds=time.monotonic() - started,
                attempts=attempt,
                error=last_error,
            )
    return HttpResponse(url=url, status=0, body=b"", headers={}, elapsed_seconds=0.0, attempts=retries, error=last_error)


def robots_allows(url: str, limiter: RateLimiter | None = None) -> tuple[bool, str]:
    """Return (allowed, note). Fail-open only when robots.txt cannot be read."""
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    path = parsed.path or "/"
    if robots_url not in _ROBOTS_CACHE:
        response = fetch_url(robots_url, retries=1, limiter=limiter)
        _ROBOTS_CACHE[robots_url] = response.text if response.status == 200 else ""
        if response.status not in {200, 404} and response.error:
            return True, f"robots.txt unread ({response.error}); proceeding with GET and logging the failure"
        if response.status == 404:
            _ROBOTS_CACHE[robots_url] = ""
            return True, "no robots.txt (404)"
    body = _ROBOTS_CACHE.get(robots_url, "")
    if not body:
        return True, "robots.txt empty or missing"
    agent = "*"
    disallowed: list[str] = []
    current = False
    for raw in body.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if key == "user-agent":
            current = value in {USER_AGENT, "*"}
        elif key == "disallow" and current:
            disallowed.append(value)
    for rule in disallowed:
        if rule == "/":
            return False, f"robots.txt disallows / for {agent}"
        if rule and path.startswith(rule):
            return False, f"robots.txt disallows {rule}"
    return True, "robots.txt does not disallow this path"


def origin(url: str) -> str:
    return urljoin(url, "/")
