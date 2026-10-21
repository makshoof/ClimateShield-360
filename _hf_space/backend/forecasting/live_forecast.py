"""Hourly forecast hours from the Open-Meteo forecast API.

These hours are forecasts. They are not written into the observation table.
A short cache keeps the planner and forecast pages from calling the API on
every card. If the network call fails, the newest raw file from the hourly
ingest is used.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode
from urllib.request import urlopen

CITY_POINTS = {
    "faisalabad": (31.458698, 73.11828),
    "gilgit": (35.95782, 74.28201),
    "gwadar": (25.202108, 62.300217),
    "hyderabad": (25.413004, 68.353195),
    "islamabad": (33.63796, 73.0273),
    "karachi": (24.850615, 66.992485),
    "lahore": (31.528997, 74.38995),
    "multan": (30.123022, 71.49533),
    "peshawar": (34.059753, 71.549995),
    "quetta": (30.193321, 66.94737),
    "rawalpindi": (33.56766, 73.048325),
    "sukkur": (27.732864, 68.865166),
}

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_SECONDS = 600
_CACHE: dict[str, tuple[datetime, list["ForecastHour"], datetime, str]] = {}
_RAW_ROOT = (
    Path(__file__).resolve().parents[2]
    / "pipeline"
    / "data"
    / "raw"
    / "hourly_ingest"
)


@dataclass
class ForecastHour:
    time_utc: datetime
    temperature_c: Optional[float]
    precipitation_mm: Optional[float]


def _parse_hours(payload: dict) -> list[ForecastHour]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    temps = hourly.get("temperature_2m") or []
    precips = hourly.get("precipitation") or []
    hours: list[ForecastHour] = []
    for index, raw_time in enumerate(times):
        try:
            stamp = datetime.fromisoformat(str(raw_time))
        except ValueError:
            continue
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        else:
            stamp = stamp.astimezone(timezone.utc)
        temp = temps[index] if index < len(temps) else None
        precip = precips[index] if index < len(precips) else None
        hours.append(
            ForecastHour(
                time_utc=stamp,
                temperature_c=None if temp is None else float(temp),
                precipitation_mm=None if precip is None else float(precip),
            )
        )
    return hours


def _fetch(lat: float, lon: float) -> tuple[list[ForecastHour], datetime, str]:
    query = urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,precipitation",
            "timezone": "GMT",
            "forecast_days": 7,
            "past_days": 1,
        }
    )
    with urlopen(f"{FORECAST_URL}?{query}", timeout=12) as response:
        payload = json.loads(response.read().decode("utf-8"))
    issued = datetime.now(timezone.utc)
    return _parse_hours(payload), issued, "Open-Meteo hourly forecast API"


def _read_raw(city_key: str) -> Optional[tuple[list[ForecastHour], datetime, str]]:
    matches = sorted(_RAW_ROOT.glob(f"*/open_meteo_weather/weather_{city_key}_raw.json"))
    if not matches:
        return None
    path = matches[-1]
    payload = json.loads(path.read_text(encoding="utf-8"))
    issued = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    run_name = path.parents[1].name
    return _parse_hours(payload), issued, f"hourly ingest file {run_name}"


def _series(city_key: str) -> tuple[list[ForecastHour], Optional[datetime], str]:
    cached = _CACHE.get(city_key)
    now = datetime.now(timezone.utc)
    if cached and (now - cached[0]).total_seconds() < CACHE_SECONDS:
        return cached[1], cached[2], cached[3]

    point = CITY_POINTS.get(city_key)
    loaded: Optional[tuple[list[ForecastHour], datetime, str]] = None
    if point is not None:
        try:
            loaded = _fetch(point[0], point[1])
        except Exception:
            loaded = None
    if loaded is None:
        loaded = _read_raw(city_key)
    if loaded is None:
        return [], None, ""
    hours, issued, source = loaded
    _CACHE[city_key] = (now, hours, issued, source)
    return hours, issued, source


def upcoming_hours(city: str, horizon_hours: int) -> tuple[list[ForecastHour], Optional[datetime], str]:
    """Hours from the current hour through the requested horizon."""
    city_key = city.strip().lower()
    if city_key not in CITY_POINTS:
        return [], None, ""
    hours, issued, source = _series(city_key)
    now = datetime.now(timezone.utc)
    start = now.replace(minute=0, second=0, microsecond=0)
    end = now + timedelta(hours=horizon_hours)
    selected = [hour for hour in hours if start <= hour.time_utc <= end]
    return selected, issued, source
