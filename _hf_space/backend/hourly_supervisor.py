"""
Background hourly ingest supervisor.

Tied to API process lifetime so closing the laptop (killing uvicorn) and
restarting the app always resumes catch-up + hourly refreshes. Does not rely
on Windows Task Scheduler staying awake.

Disable with CLIMATESHIELD_AUTO_INGEST=0.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger("climateshield.hourly_supervisor")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PIPELINE_DIR = PROJECT_ROOT / "pipeline"

_stop = threading.Event()
_thread: Optional[threading.Thread] = None
_ingest_lock = threading.Lock()


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


def _stale_minutes() -> float:
    try:
        return float(os.getenv("CLIMATESHIELD_INGEST_STALE_MINUTES", "55"))
    except ValueError:
        return 55.0


def _check_seconds() -> float:
    try:
        return max(60.0, float(os.getenv("CLIMATESHIELD_INGEST_CHECK_SECONDS", "300")))
    except ValueError:
        return 300.0


def _latest_weather_age_minutes() -> Optional[float]:
    """Age of newest weather_hourly row; None if unavailable."""
    try:
        from db import get_data_as_of

        as_of = get_data_as_of()
        if as_of is None:
            return None
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
        else:
            as_of = as_of.astimezone(timezone.utc)
        return (datetime.now(timezone.utc) - as_of).total_seconds() / 60.0
    except Exception as exc:
        logger.warning("Could not read weather age: %s", exc)
        return None


def _needs_ingest() -> bool:
    age = _latest_weather_age_minutes()
    limit = _stale_minutes()
    if age is None:
        logger.info("No weather_hourly timestamp — scheduling catch-up ingest.")
        return True
    if age >= limit:
        logger.info("Weather is %.0f min old (limit %.0f) — catch-up ingest.", age, limit)
        return True
    logger.debug("Weather is fresh (%.0f min old).", age)
    return False


def run_ingest_once() -> int:
    """Spawn pipeline ingest-hourly --once. Returns process exit code."""
    if not PIPELINE_DIR.is_dir():
        logger.error("Pipeline directory missing: %s", PIPELINE_DIR)
        return 1

    if not _ingest_lock.acquire(blocking=False):
        logger.info("Ingest already running — skip overlapping start.")
        return 0

    try:
        cmd = [sys.executable, "-m", "climateshield", "ingest-hourly", "--once"]
        logger.info("Starting hourly ingest: %s (cwd=%s)", " ".join(cmd), PIPELINE_DIR)
        completed = subprocess.run(
            cmd,
            cwd=str(PIPELINE_DIR),
            check=False,
            capture_output=True,
            text=True,
            timeout=60 * 25,
        )
        if completed.returncode != 0:
            tail = (completed.stderr or completed.stdout or "")[-800:]
            logger.error("Ingest exited %s: %s", completed.returncode, tail)
        else:
            logger.info("Ingest finished OK.")
        return int(completed.returncode)
    except subprocess.TimeoutExpired:
        logger.error("Ingest timed out after 25 minutes.")
        return 1
    except Exception as exc:
        logger.exception("Ingest failed to start: %s", exc)
        return 1
    finally:
        _ingest_lock.release()


def _loop() -> None:
    # Immediate catch-up after app start / laptop reopen.
    try:
        if _needs_ingest():
            run_ingest_once()
    except Exception:
        logger.exception("Startup catch-up ingest failed.")

    while not _stop.wait(_check_seconds()):
        try:
            if _needs_ingest():
                run_ingest_once()
        except Exception:
            logger.exception("Scheduled ingest check failed.")


def start_hourly_supervisor() -> None:
    """Start daemon thread (idempotent). No-op if disabled via env."""
    global _thread
    if not _env_flag("CLIMATESHIELD_AUTO_INGEST", True):
        logger.info("CLIMATESHIELD_AUTO_INGEST disabled — supervisor not started.")
        return
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_loop,
        name="climateshield-hourly-supervisor",
        daemon=True,
    )
    _thread.start()
    logger.info(
        "Hourly supervisor started (stale>=%.0f min, check every %.0f s).",
        _stale_minutes(),
        _check_seconds(),
    )


def stop_hourly_supervisor() -> None:
    """Signal the loop to stop (best-effort on process exit)."""
    _stop.set()
