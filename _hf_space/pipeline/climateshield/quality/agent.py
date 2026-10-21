"""Data Quality Agent: run Pandera, then fix, fill, or flag each finding."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd
from pandera.errors import SchemaErrors
from pandera.pandas import DataFrameSchema

from climateshield.quality.logger import Action, QualityLogger
from climateshield.quality.rules import RULES
from climateshield.quality.schemas import SCHEMAS

SHORT_GAP_HOURS = 6
SMOOTH_COLUMNS = [
    "temperature_2m_c",
    "relative_humidity_pct",
    "dew_point_c",
    "surface_pressure_hpa",
    "soil_moisture_0_to_7cm_m3m3",
    "soil_moisture_7_to_28cm_m3m3",
    "wind_speed_10m_kmh",
    "wind_direction_10m_deg",
    "cloud_cover_pct",
]


@dataclass
class Finding:
    dataset: str
    table: str
    check_id: str
    column: str
    n_rows: int
    passed: bool
    message: str
    extras: dict[str, Any] = field(default_factory=dict)


def choose_action(finding: Finding) -> Action:
    """Guide matrix: fix certain conversions; fill short smooth gaps; otherwise flag."""
    if finding.check_id in {"hourly_short_gap", "WX.SHORT_GAP_FILL"}:
        return "fill"
    if finding.check_id in {
        "dtype",
        "unit_conversion",
        "redundant_column",
        "schema_coerce",
    }:
        return "fix"
    if finding.passed:
        return "keep"
    return "flag"


class DataQualityAgent:
    """Runs validation tools, decides fix/fill/flag, and logs every decision."""

    def __init__(self, logger: QualityLogger) -> None:
        self.logger = logger
        self._rules = {rule["rule_id"]: rule for rule in RULES}
        self.audit_summary: dict[str, Any] = {
            "tool": "pandera",
            "tables_checked": 0,
            "schema_passed": 0,
            "schema_failed": 0,
            "findings": [],
        }

    def decide(
        self,
        rule_id: str,
        dataset: str,
        n_rows: int,
        column: str = "",
        details: str = "",
        **extras: Any,
    ) -> Action:
        rule = self._rules[rule_id]
        action: Action = rule["action"]
        self.logger.record(
            dataset=dataset,
            rule_id=rule_id,
            action=action,
            reason=str(rule["why"]),
            n_rows=n_rows,
            column=column,
            details=details or str(rule["what"]),
            **extras,
        )
        return action

    def evaluate_finding(self, finding: Finding) -> Action:
        action = choose_action(finding)
        reason = (
            "Pandera check passed."
            if finding.passed
            else "Pandera/custom check failed; action comes from the fix/fill/flag matrix."
        )
        if action == "fill":
            reason = (
                "Short gap in a smooth hourly series. Fill is allowed only up to "
                f"{SHORT_GAP_HOURS} hours and must be marked. Precipitation is never interpolated."
            )
        if action == "flag" and not finding.passed:
            reason = "Long gap, unverifiable value, or incomplete mapping. Do not guess."
        self.logger.record(
            dataset=finding.dataset,
            rule_id=f"PANDERA.{finding.check_id}",
            action=action,
            reason=reason,
            n_rows=finding.n_rows,
            column=finding.column,
            details=finding.message,
            table=finding.table,
            passed=finding.passed,
            tool="pandera",
        )
        self.audit_summary["findings"].append(
            {
                "table": finding.table,
                "check_id": finding.check_id,
                "action": action,
                "passed": finding.passed,
                "n_rows": finding.n_rows,
                "message": finding.message,
            }
        )
        return action

    def append_flags(self, frame: pd.DataFrame, mask: pd.Series, code: str) -> pd.DataFrame:
        if "quality_flags" not in frame.columns:
            frame = frame.copy()
            frame["quality_flags"] = ""
        selected = mask.eq(True)
        current = frame.loc[selected, "quality_flags"].fillna("")
        updated = []
        for value in current:
            parts = [p for p in str(value).split(";") if p]
            if code not in parts:
                parts.append(code)
            updated.append(";".join(parts))
        frame.loc[selected, "quality_flags"] = updated
        return frame

    def run_schema(
        self,
        frame: pd.DataFrame,
        schema: DataFrameSchema,
        dataset: str,
        table: str,
    ) -> bool:
        """Run a Pandera schema. Failures are flagged, not filled."""
        self.audit_summary["tables_checked"] += 1
        try:
            schema.validate(frame, lazy=True)
        except SchemaErrors as err:
            self.audit_summary["schema_failed"] += 1
            cases = err.failure_cases
            grouped = (
                cases.groupby(["column", "check"], dropna=False).size().reset_index(name="n")
                if not cases.empty and {"column", "check"}.issubset(cases.columns)
                else pd.DataFrame(columns=["column", "check", "n"])
            )
            if grouped.empty:
                self.evaluate_finding(
                    Finding(
                        dataset=dataset,
                        table=table,
                        check_id="schema",
                        column="",
                        n_rows=int(len(frame)),
                        passed=False,
                        message=str(err),
                    )
                )
            else:
                for row in grouped.itertuples(index=False):
                    self.evaluate_finding(
                        Finding(
                            dataset=dataset,
                            table=table,
                            check_id=str(row.check),
                            column="" if pd.isna(row.column) else str(row.column),
                            n_rows=int(row.n),
                            passed=False,
                            message=f"Pandera failed check={row.check} on {row.column}",
                        )
                    )
            return False
        except Exception as exc:  # noqa: BLE001
            self.audit_summary["schema_failed"] += 1
            self.evaluate_finding(
                Finding(
                    dataset=dataset,
                    table=table,
                    check_id="schema_error",
                    column="",
                    n_rows=int(len(frame)),
                    passed=False,
                    message=str(exc),
                )
            )
            return False

        self.audit_summary["schema_passed"] += 1
        self.evaluate_finding(
            Finding(
                dataset=dataset,
                table=table,
                check_id="schema",
                column="",
                n_rows=int(len(frame)),
                passed=True,
                message=f"Pandera schema passed for {table} ({len(frame)} rows).",
            )
        )
        return True

    def fill_short_hourly_gaps(self, frame: pd.DataFrame, dataset: str) -> pd.DataFrame:
        """Fill gaps of at most 6 hours in smooth variables. Never interpolate rain."""
        frame = frame.copy()
        if "value_was_filled" not in frame.columns:
            frame["value_was_filled"] = False
        else:
            frame["value_was_filled"] = frame["value_was_filled"].eq(True)
        filled_rows = 0
        long_gap_hours = 0
        parts: list[pd.DataFrame] = []
        for city, group in frame.groupby("city", sort=False):
            group = group.sort_values("timestamp_utc").copy()
            group["timestamp_utc"] = pd.to_datetime(group["timestamp_utc"], utc=True)
            start, end = group["timestamp_utc"].min(), group["timestamp_utc"].max()
            expected = pd.date_range(start, end, freq="h", tz="UTC")
            present = pd.DatetimeIndex(group["timestamp_utc"])
            missing = expected.difference(present)
            short_missing, long_missing = _split_gaps(missing, SHORT_GAP_HOURS)
            long_gap_hours += len(long_missing)
            if len(short_missing) == 0:
                parts.append(group)
                continue
            indexed = group.set_index("timestamp_utc")
            indexed = indexed.reindex(indexed.index.union(short_missing)).sort_index()
            for col in SMOOTH_COLUMNS:
                if col in indexed.columns:
                    indexed[col] = indexed[col].interpolate(method="time", limit=SHORT_GAP_HOURS)
            new_mask = indexed.index.isin(short_missing)
            indexed["value_was_filled"] = indexed["value_was_filled"].eq(True)
            indexed.loc[new_mask, "value_was_filled"] = True
            indexed.loc[new_mask, "city"] = city
            indexed = indexed.reset_index()
            if "quality_flags" not in indexed.columns:
                indexed["quality_flags"] = ""
            indexed = self.append_flags(indexed, indexed["value_was_filled"].eq(True), "filled_short_gap")
            for col in ("latitude", "longitude", "elevation_m", "source_timezone"):
                if col in indexed.columns:
                    indexed[col] = indexed[col].ffill().bfill()
            if "timestamp_pkt" in indexed.columns:
                indexed["timestamp_pkt"] = pd.to_datetime(indexed["timestamp_utc"], utc=True) + pd.Timedelta(
                    hours=5
                )
            filled_rows += int(new_mask.sum())
            parts.append(indexed)
        out = pd.concat(parts, ignore_index=True)
        self.evaluate_finding(
            Finding(
                dataset=dataset,
                table="weather_hourly",
                check_id="hourly_short_gap",
                column=",".join(SMOOTH_COLUMNS),
                n_rows=filled_rows,
                passed=filled_rows == 0,
                message=(
                    f"Short gaps (<= {SHORT_GAP_HOURS}h) filled={filled_rows}; "
                    f"long internal gap hours left missing={long_gap_hours}. "
                    "Precipitation is not interpolated."
                ),
            )
        )
        if long_gap_hours:
            self.evaluate_finding(
                Finding(
                    dataset=dataset,
                    table="weather_hourly",
                    check_id="hourly_long_gap",
                    column="timestamp_utc",
                    n_rows=long_gap_hours,
                    passed=False,
                    message="Internal gaps longer than 6 hours were left missing (flag, do not fill).",
                )
            )
        return out

    def audit_gold(self, tables: dict[str, pd.DataFrame]) -> dict[str, Any]:
        """Run Pandera plus domain checks on gold tables after cleaning."""
        for table, schema in SCHEMAS.items():
            frame = tables.get(table)
            if frame is None:
                continue
            dataset = {
                "weather_hourly": "01_open_meteo_heat_rainfall",
                "district_snapshot": "processed",
                "pmd_river_danger_levels": "03_ndma_pmd_hazards_warnings",
                "osm_emergency_facilities": "02_openstreetmap_geofabrik",
            }[table]
            self.run_schema(frame, schema, dataset, table)

        weather = tables.get("weather_hourly")
        if weather is not None:
            heat = weather["temperature_2m_c"].notna() & (weather["temperature_2m_c"] >= 40)
            self.evaluate_finding(
                Finding(
                    dataset="01_open_meteo_heat_rainfall",
                    table="weather_hourly",
                    check_id="extreme_heat_kept",
                    column="temperature_2m_c",
                    n_rows=int(heat.sum()),
                    passed=True,
                    message="Observations >= 40 C remain in the gold table (not treated as outliers).",
                )
            )
            pesh = weather[weather["city"] == "Peshawar"]
            if not pesh.empty:
                start = pd.to_datetime(pesh["timestamp_utc"], utc=True).min()
                self.evaluate_finding(
                    Finding(
                        dataset="01_open_meteo_heat_rainfall",
                        table="weather_hourly",
                        check_id="peshawar_coverage",
                        column="timestamp_utc",
                        n_rows=int(len(pesh)),
                        passed=False,
                        message=f"Peshawar series starts {start.isoformat()} (not 2021-01-01). Long gap: flag, do not fill.",
                    )
                )

        flood = tables.get("osm_flood_exposure")
        if flood is not None:
            crop_cols = [c for c in flood.columns if "crops" in c]
            if crop_cols and all(bool((flood[c] == 0).all()) for c in crop_cols):
                self.evaluate_finding(
                    Finding(
                        dataset="02_openstreetmap_geofabrik",
                        table="osm_flood_exposure",
                        check_id="crop_flood_all_zero",
                        column=",".join(crop_cols),
                        n_rows=int(len(flood)),
                        passed=False,
                        message="All crop-flood columns are 0.0. Source unavailable; not zero exposure.",
                    )
                )
        return self.audit_summary


def _split_gaps(missing: pd.DatetimeIndex, max_hours: int) -> tuple[pd.DatetimeIndex, pd.DatetimeIndex]:
    if missing.empty:
        empty = pd.DatetimeIndex([], tz="UTC")
        return empty, empty
    missing = missing.sort_values()
    short: list[pd.Timestamp] = []
    long: list[pd.Timestamp] = []
    chunk = [missing[0]]
    for stamp in missing[1:]:
        if stamp - chunk[-1] == pd.Timedelta(hours=1):
            chunk.append(stamp)
        else:
            target = short if len(chunk) <= max_hours else long
            target.extend(chunk)
            chunk = [stamp]
    target = short if len(chunk) <= max_hours else long
    target.extend(chunk)
    tz = missing.tz
    return pd.DatetimeIndex(short, tz=tz), pd.DatetimeIndex(long, tz=tz)
