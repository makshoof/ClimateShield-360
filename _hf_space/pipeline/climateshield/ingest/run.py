"""Run one hourly ingest cycle and update gold layers without touching the dashboard."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from climateshield.config import (
    CLEANED_DIR,
    HOURLY_LOG_PATH,
    HOURLY_MANIFEST_PATH,
    HOURLY_STATUS_PATH,
    PROCESSED_DIR,
    RAW_HOURLY_DIR,
    REPORTS_DIR,
    ROOT,
    WAREHOUSE_PATH,
)
from climateshield.ingest.connectors import (
    ConnectorResult,
    fetch_geofabrik_md5,
    fetch_ndma_home,
    fetch_open_meteo_flood_with_raw,
    fetch_open_meteo_weather_with_raw,
    fetch_pbs_home,
    fetch_pmd_ffd,
)
from climateshield.ingest.http import RateLimiter
from climateshield.io_utils import sha256_bytes, write_csv, write_json, write_raw_hourly_bytes, write_table
from climateshield.pipeline.clean_weather import _flatten_city_json, _flag_ranges
from climateshield.quality.agent import DataQualityAgent
from climateshield.quality.logger import QualityLogger


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def _run_id(now: datetime) -> str:
    return now.strftime("%Y-%m-%dT%H-%M-%SZ")


def _load_existing(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    return pd.read_csv(path)


def _append_unique(existing: pd.DataFrame, incoming: pd.DataFrame, key: str) -> tuple[pd.DataFrame, int, int]:
    if incoming.empty:
        return existing, 0, 0
    if existing.empty:
        return incoming.copy(), int(len(incoming)), 0
    already = set(existing[key].astype(str))
    is_new = ~incoming[key].astype(str).isin(already)
    new_rows = incoming.loc[is_new]
    dupes = int((~is_new).sum())
    if new_rows.empty:
        return existing, 0, dupes
    combined = pd.concat([existing, new_rows], ignore_index=True)
    return combined, int(len(new_rows)), dupes


def _write_hourly_manifest_rows(rows: list[dict]) -> None:
    frame = pd.DataFrame(rows)
    if HOURLY_MANIFEST_PATH.exists():
        prior = pd.read_csv(HOURLY_MANIFEST_PATH)
        frame = pd.concat([prior, frame], ignore_index=True)
        frame = frame.drop_duplicates(subset=["filepath", "sha256"], keep="first")
    write_csv(HOURLY_MANIFEST_PATH, frame)


def _append_log(rows: list[dict]) -> None:
    frame = pd.DataFrame(rows)
    if HOURLY_LOG_PATH.exists():
        prior = pd.read_csv(HOURLY_LOG_PATH)
        frame = pd.concat([prior, frame], ignore_index=True)
    write_csv(HOURLY_LOG_PATH, frame)


def _save_raw(run_dir: Path, relative: str, body: bytes, meta: dict) -> Path:
    path = run_dir / relative
    write_raw_hourly_bytes(path, body)
    sidecar = path.with_suffix(path.suffix + ".provenance.json")
    write_json(sidecar, meta)
    return path


def _normalize_weather(raw_path: Path, city: str, fetch_time: str) -> pd.DataFrame:
    frame = _flatten_city_json(raw_path, city)
    logger = QualityLogger()
    agent = DataQualityAgent(logger)
    frame = _flag_ranges(frame, agent)
    frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True)
    frame["row_id"] = frame["city"] + "|" + frame["timestamp_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    frame["ingest_fetch_time_utc"] = fetch_time
    frame["is_forecast"] = frame["timestamp_utc"] > pd.Timestamp(fetch_time)
    frame["source_api"] = "https://api.open-meteo.com/v1/forecast"
    frame = agent.append_flags(frame, frame["is_forecast"].eq(True), "forecast_not_observation")
    frame = agent.append_flags(frame, pd.Series(True, index=frame.index), "hourly_ingest")
    return frame


def _update_weather_gold(new_rows: pd.DataFrame) -> tuple[int, int, int]:
    observed = new_rows[new_rows["is_forecast"] == False].copy()  # noqa: E712
    gold_path = PROCESSED_DIR / "weather_hourly.parquet"
    existing = _load_existing(gold_path)
    combined, n_new, n_dup = _append_unique(existing, observed, "row_id")
    if n_new:
        write_table(PROCESSED_DIR / "weather_hourly", combined, csv=False)
        write_table(CLEANED_DIR / "01_open_meteo_heat_rainfall" / "weather_hourly", combined, csv=False)
        _replace_warehouse_table("weather_hourly", PROCESSED_DIR / "weather_hourly.parquet")
    return int(len(observed)), n_new, n_dup


def _update_flood_gold(new_rows: pd.DataFrame) -> tuple[int, int, int]:
    frame = new_rows.copy()
    frame["observation_date"] = pd.to_datetime(frame["observation_date"], utc=True)
    observed = frame[frame["is_forecast"] == False].copy()  # noqa: E712
    observed["row_id"] = (
        observed["city"].astype(str)
        + "|"
        + observed["observation_date"].dt.strftime("%Y-%m-%d")
    )
    gold_path = PROCESSED_DIR / "glofas_river_discharge.parquet"
    existing = _load_existing(gold_path)
    combined, n_new, n_dup = _append_unique(existing, observed, "row_id")
    if n_new or not gold_path.exists():
        write_table(PROCESSED_DIR / "glofas_river_discharge", combined, csv=False)
        write_table(CLEANED_DIR / "03_ndma_pmd_hazards_warnings" / "glofas_river_discharge", combined, csv=False)
        _replace_warehouse_table("glofas_river_discharge", gold_path)
    return int(len(observed)), n_new, n_dup


def _replace_warehouse_table(table: str, parquet_path: Path) -> None:
    if not parquet_path.exists():
        return
    if not WAREHOUSE_PATH.exists():
        return
    try:
        import duckdb
    except ImportError:
        return
    source = parquet_path.resolve().as_posix().replace("'", "''")
    last_error: Exception | None = None
    for _attempt in range(8):
        try:
            con = duckdb.connect(str(WAREHOUSE_PATH))
            try:
                con.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_parquet(\'{source}\')')
                n_rows = int(con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
                con.execute(
                    "CREATE TABLE IF NOT EXISTS warehouse_catalog (table_name VARCHAR, n_rows BIGINT)"
                )
                con.execute("DELETE FROM warehouse_catalog WHERE table_name = ?", [table])
                con.execute("INSERT INTO warehouse_catalog VALUES (?, ?)", [table, n_rows])
            finally:
                con.close()
            return
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    if last_error is not None:
        raise last_error


def _refresh_contract_tables() -> None:
    """Copy the hourly log into run_status so the dashboard sees this run."""
    from climateshield.pipeline.warehouse import restore_contract_tables
    import duckdb

    if not WAREHOUSE_PATH.exists():
        return
    last_error: Exception | None = None
    for _attempt in range(8):
        try:
            con = duckdb.connect(str(WAREHOUSE_PATH))
            try:
                restore_contract_tables(con)
            finally:
                con.close()
            return
        except Exception as exc:
            last_error = exc
            time.sleep(2)
    print(f"Could not refresh run_status: {last_error}")


def _previous_hash(source_id: str) -> str:
    if not HOURLY_LOG_PATH.exists():
        return ""
    logs = pd.read_csv(HOURLY_LOG_PATH)
    subset = logs[(logs["source_id"] == source_id) & (logs["status"].isin(["success", "partial", "unchanged"]))]
    if subset.empty or "sha256" not in subset.columns:
        return ""
    return str(subset.iloc[-1]["sha256"] or "")


def rebuild_glofas_from_hourly_raw() -> int:
    """Rebuild GloFAS gold from saved hourly raw JSON so `make data` does not drop it."""
    from climateshield.config import OPEN_METEO_CITIES, OPEN_METEO_CITY_POINTS, OPEN_METEO_FLOOD_URL

    files = sorted(RAW_HOURLY_DIR.rglob("flood_*_raw.json")) if RAW_HOURLY_DIR.exists() else []
    frames = []
    for path in files:
        slug = path.name.removeprefix("flood_").removesuffix("_raw.json")
        city = OPEN_METEO_CITIES.get(slug)
        if not city:
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        daily = pd.DataFrame(payload.get("daily") or {})
        if daily.empty or "time" not in daily.columns:
            continue
        daily["city"] = city
        daily["city_slug"] = slug
        daily["latitude"] = payload.get("latitude", OPEN_METEO_CITY_POINTS[slug]["latitude"])
        daily["longitude"] = payload.get("longitude", OPEN_METEO_CITY_POINTS[slug]["longitude"])
        daily["observation_date"] = pd.to_datetime(daily["time"], utc=True)
        daily["is_forecast"] = False
        daily["source_api"] = OPEN_METEO_FLOOD_URL
        daily["row_id"] = daily["city"].astype(str) + "|" + daily["observation_date"].dt.strftime("%Y-%m-%d")
        frames.append(daily)
    if not frames:
        return 0
    combined = pd.concat(frames, ignore_index=True).drop_duplicates(subset=["row_id"], keep="first")
    combined = combined[combined["is_forecast"] == False]  # noqa: E712
    write_table(PROCESSED_DIR / "glofas_river_discharge", combined, csv=False)
    write_table(CLEANED_DIR / "03_ndma_pmd_hazards_warnings" / "glofas_river_discharge", combined, csv=False)
    _replace_warehouse_table("glofas_river_discharge", PROCESSED_DIR / "glofas_river_discharge.parquet")
    return int(len(combined))


def run_ingest(*, limiter: RateLimiter | None = None) -> dict:
    now = datetime.now(timezone.utc)
    run_id = _run_id(now)
    run_dir = RAW_HOURLY_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    limiter = limiter or RateLimiter()
    results: list[ConnectorResult] = []
    manifest_rows: list[dict] = []

    weather_result, weather_raw = fetch_open_meteo_weather_with_raw(limiter=limiter)
    weather_frames = []
    for slug, body, query in weather_raw:
        path = _save_raw(
            run_dir,
            f"open_meteo_weather/weather_{slug}_raw.json",
            body,
            {
                "source_id": "open_meteo_weather",
                "fetch_time_utc": weather_result.fetch_time_utc,
                "query": query,
                "licence": weather_result.licence,
                "source_url": weather_result.source_url,
                "sha256": sha256_bytes(body),
            },
        )
        weather_result.raw_files.append(_rel(path))
        manifest_rows.append(
            {
                "filepath": _rel(path),
                "source": weather_result.publisher,
                "source_folder": "hourly_ingest/open_meteo_weather",
                "query": query,
                "fetch_time_utc": weather_result.fetch_time_utc,
                "sha256": sha256_bytes(body),
                "bytes": len(body),
                "licence": weather_result.licence,
                "source_url": weather_result.source_url,
                "run_id": run_id,
            }
        )
        city = slug.replace("_", " ").title() if slug != "rawalpindi" else "Rawalpindi"
        from climateshield.config import OPEN_METEO_CITIES

        city = OPEN_METEO_CITIES.get(slug, city)
        weather_frames.append(_normalize_weather(path, city, weather_result.fetch_time_utc))
    if weather_frames:
        incoming = pd.concat(weather_frames, ignore_index=True)
        fetched, n_new, n_dup = _update_weather_gold(incoming)[:3]
        weather_result.n_records_fetched = fetched
        weather_result.n_new_records = n_new
        weather_result.n_duplicates_skipped = n_dup
        weather_result.newly_updated_observations = n_new > 0
        if weather_result.status == "failed":
            weather_result.status = "success"
    results.append(weather_result)

    flood_result, flood_raw = fetch_open_meteo_flood_with_raw(limiter=limiter)
    flood_frames = []
    for slug, body, query in flood_raw:
        path = _save_raw(
            run_dir,
            f"open_meteo_flood/flood_{slug}_raw.json",
            body,
            {
                "source_id": "open_meteo_flood_glofas",
                "fetch_time_utc": flood_result.fetch_time_utc,
                "query": query,
                "licence": flood_result.licence,
                "source_url": flood_result.source_url,
                "sha256": sha256_bytes(body),
                "publication_frequency": "daily",
            },
        )
        flood_result.raw_files.append(_rel(path))
        manifest_rows.append(
            {
                "filepath": _rel(path),
                "source": flood_result.publisher,
                "source_folder": "hourly_ingest/open_meteo_flood",
                "query": query,
                "fetch_time_utc": flood_result.fetch_time_utc,
                "sha256": sha256_bytes(body),
                "bytes": len(body),
                "licence": flood_result.licence,
                "source_url": flood_result.source_url,
                "run_id": run_id,
            }
        )
        payload = json.loads(body.decode("utf-8"))
        daily = pd.DataFrame(payload.get("daily") or {})
        if daily.empty:
            continue
        from climateshield.config import OPEN_METEO_CITIES, OPEN_METEO_CITY_POINTS

        daily["city"] = OPEN_METEO_CITIES[slug]
        daily["city_slug"] = slug
        daily["latitude"] = payload.get("latitude", OPEN_METEO_CITY_POINTS[slug]["latitude"])
        daily["longitude"] = payload.get("longitude", OPEN_METEO_CITY_POINTS[slug]["longitude"])
        daily["observation_date"] = pd.to_datetime(daily["time"], utc=True)
        daily["ingest_fetch_time_utc"] = flood_result.fetch_time_utc
        daily["is_forecast"] = daily["observation_date"].dt.normalize() > pd.Timestamp(flood_result.fetch_time_utc).normalize()
        daily["source_api"] = flood_result.source_url
        daily["source_query"] = query
        daily["cadence"] = "daily"
        flood_frames.append(daily)
    if flood_frames:
        incoming = pd.concat(flood_frames, ignore_index=True)
        fetched, n_new, n_dup = _update_flood_gold(incoming)
        flood_result.n_records_fetched = fetched
        flood_result.n_new_records = n_new
        flood_result.n_duplicates_skipped = n_dup
        flood_result.newly_updated_observations = n_new > 0
        if flood_result.status == "failed":
            flood_result.status = "success"
    results.append(flood_result)

    snapshot_jobs = [
        ("geofabrik_md5.txt", *fetch_geofabrik_md5(limiter=limiter)),
        ("ndma_homepage.html", *fetch_ndma_home(limiter=limiter)),
        ("pmd_ffd_homepage.html", *fetch_pmd_ffd(limiter=limiter)),
        ("pbs_homepage.html", *fetch_pbs_home(limiter=limiter)),
    ]
    for filename, result, body in snapshot_jobs:
        if body:
            path = _save_raw(
                run_dir,
                f"snapshots/{filename}",
                body,
                {
                    "source_id": result.source_id,
                    "fetch_time_utc": result.fetch_time_utc,
                    "query": result.query,
                    "licence": result.licence,
                    "source_url": result.source_url,
                    "sha256": sha256_bytes(body),
                    "http_status": result.http_status,
                },
            )
            result.raw_files.append(_rel(path))
            manifest_rows.append(
                {
                    "filepath": _rel(path),
                    "source": result.publisher,
                    "source_folder": "hourly_ingest/snapshots",
                    "query": result.query,
                    "fetch_time_utc": result.fetch_time_utc,
                    "sha256": sha256_bytes(body),
                    "bytes": len(body),
                    "licence": result.licence,
                    "source_url": result.source_url,
                    "run_id": run_id,
                }
            )
            prior = _previous_hash(result.source_id)
            if result.status == "success" and prior and prior == result.sha256:
                result.status = "unchanged"
                result.newly_updated_observations = False
                result.n_new_records = 0
                result.n_duplicates_skipped = 1
                result.notes += " Byte hash matches previous successful fetch; page stored, not treated as new observations."
            elif result.status == "success" and not prior:
                result.newly_updated_observations = False
                result.notes += " First snapshot stored. HTML/MD5 change detection is not a new statistical observation."
        results.append(result)

    log_rows = [item.to_log_row() | {"run_id": run_id} for item in results]
    if manifest_rows:
        _write_hourly_manifest_rows(manifest_rows)
    _append_log(log_rows)

    last_success = {
        item.source_id: item.fetch_time_utc
        for item in results
        if item.status in {"success", "partial", "unchanged"}
    }
    status = {
        "generated_at_utc": now.isoformat(),
        "run_id": run_id,
        "raw_run_dir": _rel(run_dir),
        "interval_seconds": 3600,
        "last_successful_fetch_utc": last_success,
        "connectors": [item.to_log_row() for item in results],
        "impact_area_summary": _impact_summary(results),
        "notes": [
            "Fetch time is recorded separately from observation/publication time.",
            "A dataset is newly_updated_observations only when new unique observation keys were appended.",
            "GloFAS discharge is daily. OSM, NDMA, PMD, and PBS are not hourly observation APIs.",
            "Original collected_datasets files were not modified.",
        ],
    }
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    write_json(HOURLY_STATUS_PATH, status)
    write_json(run_dir / "run_summary.json", status)
    _refresh_contract_tables()
    print(f"Hourly ingest run {run_id}")
    for item in results:
        print(
            f"  {item.source_id}: {item.status} fetched={item.n_records_fetched} "
            f"new={item.n_new_records} dupes={item.n_duplicates_skipped} "
            f"obs={item.observation_time_max or 'n/a'}"
        )
        if item.error:
            print(f"    error: {item.error}")
    return status


def _impact_summary(results: list[ConnectorResult]) -> dict[str, dict[str, str]]:
    mapping = {
        "physical": ["open_meteo_weather", "open_meteo_flood_glofas"],
        "environmental": ["open_meteo_weather", "open_meteo_flood_glofas"],
        "producers": ["pbs_homepage"],
        "economic": ["pbs_homepage"],
        "public_health": ["open_meteo_weather"],
        "infrastructure": ["geofabrik_pakistan_pbf_md5"],
        "social": ["pbs_homepage", "ndma_homepage"],
        "emergency": ["open_meteo_flood_glofas", "ndma_homepage", "pmd_ffd_homepage"],
    }
    by_id = {item.source_id: item for item in results}
    out: dict[str, dict[str, str]] = {}
    for area, source_ids in mapping.items():
        live = [by_id[s] for s in source_ids if s in by_id and by_id[s].live_observations and by_id[s].status in {"success", "partial"}]
        snapshots = [by_id[s] for s in source_ids if s in by_id and not by_id[s].live_observations]
        if live and any(item.newly_updated_observations for item in live):
            label = "working_live_observations"
        elif live:
            label = "working_fetch_no_new_observation_keys"
        elif snapshots and any(item.status in {"success", "unchanged"} for item in snapshots):
            label = "snapshot_or_change_detection_only"
        elif any(s in by_id and by_id[s].status == "blocked" for s in source_ids):
            label = "blocked"
        else:
            label = "failed_or_unavailable"
        out[area] = {
            "status": label,
            "sources": ", ".join(source_ids),
            "detail": "; ".join(
                f"{by_id[s].source_id}={by_id[s].status}/{by_id[s].publication_frequency}"
                for s in source_ids
                if s in by_id
            ),
        }
    return out
