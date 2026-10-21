"""Source connectors for declared ClimateShield datasets.

Each connector records fetch time separately from observation/publication time.
A successful fetch is not treated as a new observation unless the source actually
emitted a new timestamped record.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import pandas as pd

from climateshield.config import (
    GEOFABRIK_PBF_MD5_URL,
    NDMA_HOME_URL,
    OPEN_METEO_CITY_POINTS,
    OPEN_METEO_FLOOD_DAILY_VARS,
    OPEN_METEO_FLOOD_URL,
    OPEN_METEO_FORECAST_URL,
    OPEN_METEO_HOURLY_VARS,
    PBS_HOME_URL,
    PMD_FFD_URL,
    RAW_DATASETS,
    SOURCE_LICENCES,
)
from climateshield.ingest.http import HttpResponse, RateLimiter, fetch_url, robots_allows
from climateshield.io_utils import sha256_bytes


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str:
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


@dataclass
class ConnectorResult:
    source_id: str
    publisher: str
    licence: str
    source_url: str
    query: str
    impact_areas: list[str]
    publication_frequency: str
    live_observations: bool
    fetch_time_utc: str
    status: str
    observation_time_min: str = ""
    observation_time_max: str = ""
    n_records_fetched: int = 0
    n_new_records: int = 0
    n_duplicates_skipped: int = 0
    newly_updated_observations: bool = False
    error: str = ""
    notes: str = ""
    raw_files: list[str] = field(default_factory=list)
    tables: dict[str, pd.DataFrame] = field(default_factory=dict)
    sha256: str = ""
    http_status: int | None = None

    def to_log_row(self) -> dict[str, Any]:
        return {
            "source_id": self.source_id,
            "publisher": self.publisher,
            "licence": self.licence,
            "source_url": self.source_url,
            "query": self.query,
            "impact_areas": ";".join(self.impact_areas),
            "publication_frequency": self.publication_frequency,
            "live_observations": self.live_observations,
            "fetch_time_utc": self.fetch_time_utc,
            "observation_time_min": self.observation_time_min,
            "observation_time_max": self.observation_time_max,
            "n_records_fetched": self.n_records_fetched,
            "n_new_records": self.n_new_records,
            "n_duplicates_skipped": self.n_duplicates_skipped,
            "newly_updated_observations": self.newly_updated_observations,
            "status": self.status,
            "http_status": self.http_status,
            "sha256": self.sha256,
            "error": self.error,
            "notes": self.notes,
            "raw_files": "|".join(self.raw_files),
        }


def _open_meteo_meta() -> dict[str, str]:
    return SOURCE_LICENCES["01_open_meteo_heat_rainfall"]


def fetch_open_meteo_weather_with_raw(limiter: RateLimiter | None = None) -> tuple[ConnectorResult, list[tuple[str, bytes, str]]]:
    meta = _open_meteo_meta()
    fetch_time = _utc_now()
    frames: list[pd.DataFrame] = []
    raw_payloads: list[tuple[str, bytes, str]] = []
    errors: list[str] = []
    last_status = None
    query_example = ""
    for slug, point in OPEN_METEO_CITY_POINTS.items():
        params = {
            "latitude": point["latitude"],
            "longitude": point["longitude"],
            "hourly": OPEN_METEO_HOURLY_VARS,
            "timezone": "GMT",
            "past_days": 2,
            "forecast_days": 7,
        }
        query = f"{OPEN_METEO_FORECAST_URL}?{urlencode(params)}"
        query_example = query
        response = fetch_url(query, limiter=limiter)
        last_status = response.status
        if response.status != 200 or not response.body:
            errors.append(f"{point['city']}: {response.error or response.status}")
            continue
        raw_payloads.append((slug, response.body, query))
        payload = json.loads(response.body.decode("utf-8"))
        hourly = payload.get("hourly") or {}
        frame = pd.DataFrame(hourly)
        if frame.empty or "time" not in frame.columns:
            errors.append(f"{point['city']}: empty hourly object")
            continue
        frame["city"] = point["city"]
        frame["city_slug"] = slug
        frame["latitude"] = payload.get("latitude", point["latitude"])
        frame["longitude"] = payload.get("longitude", point["longitude"])
        frame["elevation_m"] = payload.get("elevation")
        frame["source_timezone"] = payload.get("timezone")
        frame["timestamp_utc"] = pd.to_datetime(frame["time"], utc=True)
        frame["ingest_fetch_time_utc"] = fetch_time.isoformat()
        frame["source_api"] = OPEN_METEO_FORECAST_URL
        frame["source_query"] = query
        frame["is_forecast"] = frame["timestamp_utc"] > pd.Timestamp(fetch_time)
        frame["impact_areas"] = "physical;environmental;public_health"
        frames.append(frame)
    result = ConnectorResult(
        source_id="open_meteo_weather",
        publisher=meta["publisher"],
        licence=meta["licence"],
        source_url=meta["source_url"],
        query=query_example,
        impact_areas=["physical", "environmental", "public_health"],
        publication_frequency="hourly",
        live_observations=True,
        fetch_time_utc=fetch_time.isoformat(),
        status="failed",
        error="; ".join(errors) or "no city responses",
        http_status=last_status,
        notes="Open-Meteo forecast API; forecast hours flagged.",
    )
    if not frames:
        return result, raw_payloads
    weather = pd.concat(frames, ignore_index=True)
    observed = weather[weather["is_forecast"] == False]  # noqa: E712
    result.status = "success" if not errors else "partial"
    result.observation_time_min = _iso(observed["timestamp_utc"].min().to_pydatetime()) if not observed.empty else ""
    result.observation_time_max = _iso(observed["timestamp_utc"].max().to_pydatetime()) if not observed.empty else ""
    result.n_records_fetched = int(len(weather))
    result.error = "; ".join(errors)
    result.tables = {"weather_hourly": weather}
    result.sha256 = sha256_bytes(b"".join(body for _, body, _ in raw_payloads))
    result.notes = (
        "Hourly Open-Meteo forecast API with past_days=2. Fetch time is not observation time. "
        "Hours after fetch_time are forecasts and are not labelled newly observed."
    )
    return result, raw_payloads


def fetch_open_meteo_flood_with_raw(limiter: RateLimiter | None = None) -> tuple[ConnectorResult, list[tuple[str, bytes, str]]]:
    meta = _open_meteo_meta()
    fetch_time = _utc_now()
    frames: list[pd.DataFrame] = []
    raw_payloads: list[tuple[str, bytes, str]] = []
    errors: list[str] = []
    last_status = None
    query_example = ""
    for slug, point in OPEN_METEO_CITY_POINTS.items():
        params = {
            "latitude": point["latitude"],
            "longitude": point["longitude"],
            "daily": OPEN_METEO_FLOOD_DAILY_VARS,
            "past_days": 5,
            "forecast_days": 1,
        }
        query = f"{OPEN_METEO_FLOOD_URL}?{urlencode(params)}"
        query_example = query
        response = fetch_url(query, limiter=limiter)
        last_status = response.status
        if response.status != 200 or not response.body:
            errors.append(f"{point['city']}: {response.error or response.status}")
            continue
        raw_payloads.append((slug, response.body, query))
        payload = json.loads(response.body.decode("utf-8"))
        daily = payload.get("daily") or {}
        frame = pd.DataFrame(daily)
        if frame.empty or "time" not in frame.columns:
            errors.append(f"{point['city']}: empty daily object")
            continue
        frame["city"] = point["city"]
        frame["city_slug"] = slug
        frame["latitude"] = payload.get("latitude", point["latitude"])
        frame["longitude"] = payload.get("longitude", point["longitude"])
        frame["observation_date"] = pd.to_datetime(frame["time"], utc=True)
        frame["ingest_fetch_time_utc"] = fetch_time.isoformat()
        frame["source_api"] = OPEN_METEO_FLOOD_URL
        frame["source_query"] = query
        frame["cadence"] = "daily"
        frame["is_forecast"] = frame["observation_date"].dt.normalize() > pd.Timestamp(fetch_time).normalize()
        frame["impact_areas"] = "environmental;emergency;physical"
        frame["geo_note"] = (
            "GloFAS grid value at the Open-Meteo city point. "
            "Not a PMD gauging-station observation; do not join to cusecs thresholds as if they were the same series."
        )
        frames.append(frame)
    result = ConnectorResult(
        source_id="open_meteo_flood_glofas",
        publisher="Open-Meteo / Copernicus GloFAS",
        licence=meta["licence"],
        source_url="https://flood-api.open-meteo.com",
        query=query_example,
        impact_areas=["environmental", "emergency", "physical"],
        publication_frequency="daily",
        live_observations=True,
        fetch_time_utc=fetch_time.isoformat(),
        status="failed",
        error="; ".join(errors) or "no city responses",
        http_status=last_status,
        notes="GloFAS river discharge is daily. Hourly pipeline runs do not create hourly discharge observations.",
    )
    if not frames:
        return result, raw_payloads
    discharge = pd.concat(frames, ignore_index=True)
    observed = discharge[discharge["is_forecast"] == False]  # noqa: E712
    result.status = "success" if not errors else "partial"
    result.observation_time_min = _iso(observed["observation_date"].min().to_pydatetime()) if not observed.empty else ""
    result.observation_time_max = _iso(observed["observation_date"].max().to_pydatetime()) if not observed.empty else ""
    result.n_records_fetched = int(len(discharge))
    result.error = "; ".join(errors)
    result.tables = {"glofas_river_discharge": discharge}
    result.sha256 = sha256_bytes(b"".join(body for _, body, _ in raw_payloads))
    return result, raw_payloads


def _snapshot_result(
    source_id: str,
    publisher: str,
    licence: str,
    url: str,
    impact_areas: list[str],
    publication_frequency: str,
    *,
    check_robots: bool,
    limiter: RateLimiter | None,
    notes: str,
) -> tuple[ConnectorResult, HttpResponse | None, bytes]:
    fetch_time = _utc_now()
    if check_robots:
        allowed, robot_note = robots_allows(url, limiter=limiter)
        if not allowed:
            return (
                ConnectorResult(
                    source_id=source_id,
                    publisher=publisher,
                    licence=licence,
                    source_url=url,
                    query=url,
                    impact_areas=impact_areas,
                    publication_frequency=publication_frequency,
                    live_observations=False,
                    fetch_time_utc=fetch_time.isoformat(),
                    status="blocked",
                    error=robot_note,
                    notes=notes,
                ),
                None,
                b"",
            )
        notes = f"{notes} robots: {robot_note}"
    response = fetch_url(url, limiter=limiter)
    # Snapshot pages are change-detection only. Timeouts become "unavailable"
    # so they do not mark the whole hourly run as failed in run_status.
    ok = response.status == 200 and bool(response.body)
    result = ConnectorResult(
        source_id=source_id,
        publisher=publisher,
        licence=licence,
        source_url=url,
        query=url,
        impact_areas=impact_areas,
        publication_frequency=publication_frequency,
        live_observations=False,
        fetch_time_utc=fetch_time.isoformat(),
        status="success" if ok else "unavailable",
        error="" if ok else (response.error or f"HTTP {response.status}"),
        notes=notes,
        http_status=response.status,
        sha256=sha256_bytes(response.body) if response.body else "",
        n_records_fetched=1 if ok else 0,
    )
    return result, response, response.body or b""


def fetch_geofabrik_md5(limiter: RateLimiter | None = None) -> tuple[ConnectorResult, bytes]:
    osm_meta = SOURCE_LICENCES["02_openstreetmap_geofabrik"]
    result, _response, body = _snapshot_result(
        "geofabrik_pakistan_pbf_md5",
        osm_meta["publisher"],
        osm_meta["licence"],
        GEOFABRIK_PBF_MD5_URL,
        ["infrastructure"],
        "daily_or_periodic_extract",
        check_robots=False,
        limiter=limiter,
        notes=(
            "Geofabrik publishes country extracts, not hourly road edits. "
            "This connector only fetches the MD5 of pakistan-latest.osm.pbf. "
            "A changed hash means the extract moved; it is not an hourly infrastructure observation."
        ),
    )
    local_md5 = RAW_DATASETS / "02_openstreetmap_geofabrik" / "geofabrik_pakistan_latest.osm.pbf.md5"
    if result.status == "success" and local_md5.exists():
        local = local_md5.read_text(encoding="utf-8").strip()
        remote = body.decode("utf-8", errors="replace").strip()
        if remote == local:
            result.notes += " Remote MD5 matches the collected archive; no new extract."
            result.newly_updated_observations = False
        else:
            result.notes += " Remote MD5 differs from the collected archive; extract updated, full PBF not downloaded hourly."
            result.newly_updated_observations = True
            result.n_new_records = 1
    return result, body


def fetch_ndma_home(limiter: RateLimiter | None = None) -> tuple[ConnectorResult, bytes]:
    meta = SOURCE_LICENCES["03_ndma_pmd_hazards_warnings"]
    result, _response, body = _snapshot_result(
        "ndma_homepage",
        meta["publisher"],
        meta["licence"],
        NDMA_HOME_URL,
        ["emergency", "social"],
        "daily_or_irregular_bulletins",
        check_robots=True,
        limiter=limiter,
        notes=(
            "NDMA does not publish a documented hourly observation API in this project. "
            "Homepage HTML is stored as a change-detection snapshot. Numbers are not scraped."
        ),
    )
    return result, body


def fetch_pmd_ffd(limiter: RateLimiter | None = None) -> tuple[ConnectorResult, bytes]:
    meta = SOURCE_LICENCES["03_ndma_pmd_hazards_warnings"]
    result, _response, body = _snapshot_result(
        "pmd_ffd_homepage",
        meta["publisher"],
        meta["licence"],
        PMD_FFD_URL,
        ["emergency", "physical"],
        "daily_bulletins",
        check_robots=True,
        limiter=limiter,
        notes=(
            "PMD Flood Forecasting Division bulletins are daily HTML/PDF, not an hourly station API. "
            "River danger levels in the archive are static thresholds, not a live hydrograph."
        ),
    )
    return result, body


def fetch_pbs_home(limiter: RateLimiter | None = None) -> tuple[ConnectorResult, bytes]:
    meta = SOURCE_LICENCES["04_pakistan_bureau_of_statistics"]
    result, _response, body = _snapshot_result(
        "pbs_homepage",
        meta["publisher"],
        meta["licence"],
        PBS_HOME_URL,
        ["social", "economic", "producers"],
        "census_and_periodic_releases",
        check_robots=True,
        limiter=limiter,
        notes=(
            "PBS census, agricultural census, and CPI/SPI releases are not hourly. "
            "No live producer, economic, or social observation series is ingested on this cadence. "
            "Homepage snapshot is change-detection only; PDF numbers are not extracted."
        ),
    )
    return result, body
