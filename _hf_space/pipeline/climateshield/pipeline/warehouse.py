"""DuckDB gold warehouse. Parquet/CSV stay as files; this is the query layer."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd

from climateshield.config import (
    HOURLY_LOG_PATH,
    PROCESSED_DIR,
    REPORTS_DIR,
    WAREHOUSE_PATH,
)
from climateshield.io_utils import assert_not_raw, write_csv

# File in data/processed/ -> warehouse table name.
GOLD_SOURCES: list[tuple[str, str]] = [
    ("weather_hourly", "weather_hourly.parquet"),
    ("weather_6h_sample", "weather_6h_sample.parquet"),
    ("glofas_river_discharge", "glofas_river_discharge.parquet"),
    ("weather_city_stats", "weather_city_stats.parquet"),
    ("city_locations", "city_locations.parquet"),
    ("district_snapshot", "district_snapshot.parquet"),
    ("pbs_district_demographics", "pbs_district_demographics.parquet"),
    ("pbs_district_rural_urban", "pbs_district_rural_urban.parquet"),
    ("osm_emergency_facilities", "osm_emergency_facilities.parquet"),
    ("osm_hospital_access", "osm_hospital_access.parquet"),
    ("osm_flood_exposure", "osm_flood_exposure.parquet"),
    ("osm_rural_access", "osm_rural_access.parquet"),
    ("pmd_river_danger_levels", "pmd_river_danger_levels.parquet"),
    ("health_facilities", "health_facilities.parquet"),
    ("populated_places", "populated_places.parquet"),
    ("document_catalog", "document_catalog.csv"),
    ("district_name_lookup", "district_name_lookup.csv"),
    ("excluded_columns", "excluded_columns.csv"),
]


def _quoted_path(path: Path) -> str:
    return path.resolve().as_posix().replace("'", "''")


def _load_file(con: duckdb.DuckDBPyConnection, table: str, path: Path) -> int:
    source = _quoted_path(path)
    if path.suffix.lower() == ".parquet":
        sql = f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_parquet(\'{source}\')'
    elif path.suffix.lower() == ".csv":
        sql = (
            f'CREATE OR REPLACE TABLE "{table}" AS '
            f"SELECT * FROM read_csv_auto('{source}', header=true)"
        )
    else:
        raise ValueError(f"Unsupported warehouse source: {path}")
    con.execute(sql)
    return int(con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


# publication_frequency values written by the hourly ingest log.
# Minutes used only to judge whether the last logged fetch is late.
# Daily and bulletin values follow the connector publication_frequency text.
# PBS has no daily statistical release; 1440 is the homepage re-check window.
_EXPECTED_MINUTES = {
    "hourly": 60,
    "daily": 1440,
    "daily_bulletins": 1440,
    "daily_or_periodic_extract": 1440,
    "daily_or_irregular_bulletins": 1440,
    "census_and_periodic_releases": 1440,
}


def restore_contract_tables(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """Reload contract tables that are not gold parquet files.

    ``build_warehouse`` deletes the DuckDB file, which drops ``run_status``,
    ``source_freshness``, and ``model_eval``. This restores only rows already
    recorded in the hourly ingest log and the saved fairness report.
    """
    counts: dict[str, int] = {}
    if HOURLY_LOG_PATH.is_file():
        log = pd.read_csv(HOURLY_LOG_PATH)
        if not log.empty and "run_id" in log.columns:
            con.execute(
                """
                CREATE OR REPLACE TABLE run_status (
                    run_id VARCHAR PRIMARY KEY,
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    finished_at TIMESTAMP WITH TIME ZONE,
                    status VARCHAR NOT NULL,
                    notes VARCHAR
                )
                """
            )
            run_rows = 0
            for run_id, group in log.groupby("run_id", sort=True):
                started = pd.to_datetime(group["fetch_time_utc"], utc=True).min().to_pydatetime()
                finished = pd.to_datetime(group["fetch_time_utc"], utc=True).max().to_pydatetime()
                statuses = {str(value).lower() for value in group["status"].fillna("")}
                status = "failed" if statuses & {"failed", "error"} else "success"
                notes = (
                    "Loaded from hourly_ingest_log.csv after warehouse rebuild. "
                    f"connectors={len(group)}; statuses={', '.join(sorted(statuses))}."
                )
                con.execute(
                    "INSERT INTO run_status VALUES (?, ?, ?, ?, ?)",
                    [str(run_id), started, finished, status, notes],
                )
                run_rows += 1
            counts["run_status"] = run_rows

            latest = log.sort_values("fetch_time_utc").groupby("source_id", as_index=False).tail(1)
            con.execute(
                """
                CREATE OR REPLACE TABLE source_freshness (
                    source_name VARCHAR PRIMARY KEY,
                    publisher VARCHAR NOT NULL,
                    licence VARCHAR NOT NULL,
                    last_fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    expected_every_minutes INTEGER NOT NULL,
                    status VARCHAR NOT NULL
                )
                """
            )
            source_rows = 0
            for row in latest.itertuples(index=False):
                frequency = str(getattr(row, "publication_frequency", "") or "")
                expected = _EXPECTED_MINUTES.get(frequency)
                if expected is None:
                    continue
                fetched = pd.to_datetime(row.fetch_time_utc, utc=True).to_pydatetime()
                con.execute(
                    "INSERT INTO source_freshness VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        str(row.source_id),
                        str(row.publisher),
                        str(row.licence),
                        fetched,
                        expected,
                        str(row.status),
                    ],
                )
                source_rows += 1
            counts["source_freshness"] = source_rows

    fairness_path = REPORTS_DIR / "fairness_by_group.csv"
    metrics_path = REPORTS_DIR / "model_vs_baseline_metrics.json"
    if fairness_path.is_file():
        fairness = pd.read_csv(fairness_path)
        con.execute(
            """
            CREATE OR REPLACE TABLE model_eval (
                group_type VARCHAR NOT NULL,
                group_value VARCHAR NOT NULL,
                metric VARCHAR NOT NULL,
                baseline_score DOUBLE NOT NULL,
                model_score DOUBLE NOT NULL
            )
            """
        )
        eval_rows = 0
        for row in fairness.itertuples(index=False):
            con.execute(
                """
                INSERT INTO model_eval (group_type, group_value, metric, baseline_score, model_score)
                VALUES ('city', ?, 'MAE', ?, ?)
                """,
                [str(row.city), float(row.baseline_mae), float(row.model_mae)],
            )
            eval_rows += 1
        if metrics_path.is_file():
            import json

            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            if metrics.get("baseline_mae") is not None and metrics.get("model_mae") is not None:
                con.execute(
                    """
                    INSERT INTO model_eval (group_type, group_value, metric, baseline_score, model_score)
                    VALUES ('overall', 'all_cities', 'MAE', ?, ?)
                    """,
                    [float(metrics["baseline_mae"]), float(metrics["model_mae"])],
                )
                eval_rows += 1
        counts["model_eval"] = eval_rows
    return counts


def build_warehouse(extra_csv: dict[str, Path] | None = None) -> dict[str, int]:
    """Replace data/processed/climateshield.duckdb from gold files. Never writes to raw."""
    assert_not_raw(WAREHOUSE_PATH)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    if WAREHOUSE_PATH.exists():
        WAREHOUSE_PATH.unlink()

    counts: dict[str, int] = {}
    con = duckdb.connect(str(WAREHOUSE_PATH))
    try:
        for table, filename in GOLD_SOURCES:
            path = PROCESSED_DIR / filename
            if not path.exists():
                if table == "glofas_river_discharge":
                    continue
                raise FileNotFoundError(f"Gold file missing for warehouse table {table}: {path}")
            counts[table] = _load_file(con, table, path)
        for table, path in (extra_csv or {}).items():
            if path.exists():
                counts[table] = _load_file(con, table, path)

        counts.update(restore_contract_tables(con))
        catalog_rows = [(name, n_rows) for name, n_rows in counts.items()]
        con.execute("CREATE OR REPLACE TABLE warehouse_catalog (table_name VARCHAR, n_rows BIGINT)")
        con.executemany("INSERT INTO warehouse_catalog VALUES (?, ?)", catalog_rows)
        counts["warehouse_catalog"] = len(catalog_rows)
    finally:
        con.close()

    write_csv(
        PROCESSED_DIR / "warehouse_catalog.csv",
        pd.DataFrame([{"table_name": k, "n_rows": v} for k, v in counts.items()]),
    )
    return counts
