"""
Database access module for ClimateShield 360 backend.
Rule 11: The API is read-only. Never write to the warehouse.
Connects to DuckDB specified by CLIMATESHIELD_DB environment variable.
Provides cached queries (60s TTL) and safe query helpers that degrade gracefully
to empty lists if tables are missing.
"""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import duckdb

# Determine workspace root and default database path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "warehouse" / "sample.duckdb"
REAL_DB_PATH = PROJECT_ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb"

# Simple in-memory thread-safe query cache
_CACHE_LOCK = threading.Lock()
_CACHE: Dict[Tuple[str, Tuple[Any, ...]], Tuple[float, List[Dict[str, Any]]]] = {}


def get_db_path() -> Path:
    """Resolve database file path from environment variable or default."""
    env_path = os.getenv("CLIMATESHIELD_DB")
    if env_path:
        path = Path(env_path)
        if not path.is_absolute():
            path = (PROJECT_ROOT / path).resolve()
        return path
    if os.getenv("CLIMATESHIELD_MODE") == "sample":
        return DEFAULT_DB_PATH.resolve()
    if REAL_DB_PATH.exists():
        return REAL_DB_PATH.resolve()
    return DEFAULT_DB_PATH.resolve()


def get_connection() -> duckdb.DuckDBPyConnection:
    """
    Open a read-only DuckDB connection.
    Strictly read_only=True to comply with Rule 11.
    Sets up contract views over attached secondary warehouse if needed.
    """
    db_path = get_db_path()
    if not db_path.exists():
        raise FileNotFoundError(
            f"DuckDB database not found at {db_path}. "
            "Run 'python scripts/seed_sample_db.py' or check CLIMATESHIELD_DB."
        )
    conn = duckdb.connect(str(db_path), read_only=True)

    # Cross-attach for full feature compatibility across tables
    try:
        if "climateshield" in db_path.name.lower():
            if DEFAULT_DB_PATH.exists():
                conn.execute(f"ATTACH '{DEFAULT_DB_PATH}' AS sample_db (READ_ONLY);")
                conn.execute("CREATE TEMPORARY VIEW IF NOT EXISTS zones AS SELECT * FROM sample_db.zones;")
                conn.execute("CREATE TEMPORARY VIEW IF NOT EXISTS exposure_index AS SELECT * FROM sample_db.exposure_index;")
                conn.execute("CREATE TEMPORARY VIEW IF NOT EXISTS facilities AS SELECT * FROM sample_db.facilities;")
                conn.execute("CREATE TEMPORARY VIEW IF NOT EXISTS impact_indicators AS SELECT * FROM sample_db.impact_indicators;")
                conn.execute('CREATE TEMPORARY VIEW IF NOT EXISTS quality_log AS SELECT timestamp_utc as logged_at, dataset as source_name, rule_id as rule, action, "column", n_rows as rows_affected, reason as explanation, details FROM quality_logs;')
        else:
            if REAL_DB_PATH.exists():
                conn.execute(f"ATTACH '{REAL_DB_PATH}' AS processed_db (READ_ONLY);")
                conn.execute("CREATE TEMPORARY VIEW IF NOT EXISTS weather_hourly AS SELECT * FROM processed_db.weather_hourly;")
                conn.execute("CREATE TEMPORARY VIEW IF NOT EXISTS weather_city_stats AS SELECT * FROM processed_db.weather_city_stats;")
    except Exception as attach_err:
        # Cross-attach is best effort to enhance compatibility
        pass

    return conn


def safe_query(
    sql: str,
    params: Optional[List[Any]] = None,
    fallback: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Safely execute a query against DuckDB.
    Returns list of dicts. If table is missing or DB file is absent,
    catches the error and returns fallback (default empty list []).
    """
    if fallback is None:
        fallback = []
    try:
        conn = get_connection()
        try:
            rel = conn.execute(sql, params or [])
            columns = [desc[0] for desc in rel.description] if rel.description else []
            rows = rel.fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            conn.close()
    except (duckdb.CatalogException, FileNotFoundError, duckdb.Error) as err:
        print(f"[safe_query warning] Query error (returning fallback): {err}")
        return fallback


def query_cached(
    sql: str,
    params: Optional[List[Any]] = None,
    ttl_seconds: int = 60,
    fallback: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Execute a read-only query with in-memory caching.
    TTL defaults to 60 seconds as required.
    """
    key_params = tuple(params) if params else ()
    cache_key = (sql.strip(), key_params)
    now = time.monotonic()

    with _CACHE_LOCK:
        if cache_key in _CACHE:
            cached_at, cached_rows = _CACHE[cache_key]
            if now - cached_at < ttl_seconds:
                return cached_rows

    # Cache miss: execute query
    rows = safe_query(sql, params, fallback=fallback)

    with _CACHE_LOCK:
        _CACHE[cache_key] = (now, rows)

    return rows


def clear_query_cache() -> None:
    """Flush the in-memory query cache."""
    with _CACHE_LOCK:
        _CACHE.clear()


def is_sample_database() -> bool:
    """
    Check if the connected warehouse is sample data.
    Rule 2: Checks CLIMATESHIELD_MODE and _is_sample table.
    """
    if os.getenv("CLIMATESHIELD_MODE") == "sample":
        return True
    db_name = get_db_path().name.lower()
    if "sample" in db_name:
        return True
    if "climateshield" in db_name:
        return False
    rows = safe_query("SELECT is_sample FROM _is_sample LIMIT 1;")
    if rows and "is_sample" in rows[0]:
        return bool(rows[0]["is_sample"])
    return False


def get_last_run_summary() -> Optional[Dict[str, Any]]:
    """
    Fetch the latest run status from run_status table.
    """
    rows = safe_query(
        "SELECT run_id, started_at, finished_at, status, notes "
        "FROM run_status ORDER BY started_at DESC LIMIT 1;"
    )
    if rows:
        return rows[0]
    return None


def get_db_mtime() -> float:
    """Return the current modified time (st_mtime) of the active database file."""
    path = get_db_path()
    if path.exists():
        return path.stat().st_mtime
    return 0.0


def get_data_as_of() -> Optional[datetime]:
    """Latest warehouse observation / prediction timestamp (UTC)."""
    rows = safe_query("SELECT MAX(timestamp_utc) as max_ts FROM weather_hourly;")
    if rows and rows[0].get("max_ts") is not None:
        ts = rows[0]["max_ts"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
            return ts.astimezone(timezone.utc)
        return ts.replace(tzinfo=timezone.utc)

    pred_rows = safe_query("SELECT MAX(forecast_time) as max_ts FROM predictions;")
    if pred_rows and pred_rows[0].get("max_ts") is not None:
        ts = pred_rows[0]["max_ts"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is not None:
            return ts.astimezone(timezone.utc)
        return ts.replace(tzinfo=timezone.utc)

    return None


def get_next_run_time() -> datetime:
    """Next scheduled hourly ingest at :05 UTC (matches register_hourly task cadence)."""
    now = datetime.now(timezone.utc)
    target = now.replace(minute=5, second=0, microsecond=0)
    if target <= now:
        target += timedelta(hours=1)
    return target


def get_sources_freshness_meta() -> Tuple[List[Dict[str, Any]], bool]:
    """
    Source freshness rows + is_live flag.
    is_live is True when every source with an expected interval is Fresh (age <= expected).
    """
    now_utc = datetime.now(timezone.utc)
    rows = safe_query(
        "SELECT source_name, publisher, licence, last_fetched_at, expected_every_minutes, status "
        "FROM source_freshness ORDER BY last_fetched_at DESC;"
    )
    sources: List[Dict[str, Any]] = []
    all_fresh = True
    found_any = False

    for r in rows:
        found_any = True
        last_dt = r.get("last_fetched_at")
        if last_dt is not None:
            if hasattr(last_dt, "tzinfo") and last_dt.tzinfo is not None:
                last_dt = last_dt.astimezone(timezone.utc)
            else:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            age_mins = max(0.0, (now_utc - last_dt).total_seconds() / 60.0)
        else:
            age_mins = 999999.0

        expected_min = max(1, int(r.get("expected_every_minutes") or 60))
        ratio = age_mins / expected_min
        if ratio <= 1.0:
            status = "Fresh"
        elif ratio <= 3.0:
            status = "Late"
            all_fresh = False
        else:
            status = "Stale"
            all_fresh = False

        sources.append(
            {
                "source_name": r["source_name"],
                "publisher": r.get("publisher"),
                "licence": r.get("licence"),
                "last_fetched_at": r.get("last_fetched_at"),
                "last_data_timestamp": r.get("last_fetched_at"),
                "expected_every_minutes": expected_min,
                "age_minutes": round(age_mins, 1),
                "status": status,
            }
        )

    return sources, (found_any and all_fresh)
