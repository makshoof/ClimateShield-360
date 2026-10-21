"""File inventory and initial quality report (no transforms)."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from climateshield.config import (
    INVENTORY_PATH,
    INITIAL_QUALITY_PATH,
    RAW_DATASETS,
    ROOT,
    SOURCE_LICENCES,
    ZIP_ARCHIVE,
)
from climateshield.io_utils import sha256_file, write_json


def _csv_profile(path: Path) -> dict[str, Any]:
    frame = pd.read_csv(path)
    numeric = frame.select_dtypes(include="number")
    profile: dict[str, Any] = {
        "format": "csv",
        "rows": int(len(frame)),
        "columns": list(frame.columns),
        "dtypes": {c: str(frame[c].dtype) for c in frame.columns},
        "missing_null": {c: int(frame[c].isna().sum()) for c in frame.columns},
        "duplicate_rows": int(frame.duplicated().sum()),
        "numeric_min_max": {
            c: {"min": _num(numeric[c].min()), "max": _num(numeric[c].max()), "zeros": int((numeric[c] == 0).sum())}
            for c in numeric.columns
        },
    }
    if "ADM2_PCODE" in frame.columns:
        profile["geographic_coverage"] = {
            "grain": "ADM2_PCODE district",
            "n_codes": int(frame["ADM2_PCODE"].nunique()),
            "prefixes": sorted({str(v)[:3] for v in frame["ADM2_PCODE"].astype(str)}),
        }
        profile["date_coverage"] = "snapshot; no date column"
    if "city" in frame.columns:
        profile["geographic_coverage"] = {
            "grain": "city",
            "cities": sorted(frame["city"].astype(str).unique().tolist()),
        }
    if "timestamp_utc" in frame.columns:
        ts = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
        profile["date_coverage"] = {"min": str(ts.min()), "max": str(ts.max()), "hours_present": sorted(ts.dt.hour.dropna().unique().tolist())}
    if "river_basin" in frame.columns:
        profile["geographic_coverage"] = {
            "grain": "river gauging station",
            "basins": sorted(frame["river_basin"].astype(str).unique().tolist()),
            "stations": frame["station_name"].astype(str).tolist(),
            "provinces": sorted(frame["province"].astype(str).unique().tolist()),
        }
        profile["date_coverage"] = "threshold table; not a time series"
    return profile


def _num(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _weather_json_profile(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    return {
        "format": "open_meteo_json",
        "rows": len(times),
        "columns": list(hourly.keys()),
        "units": data.get("hourly_units"),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "elevation_m": data.get("elevation"),
        "timezone": data.get("timezone"),
        "utc_offset_seconds": data.get("utc_offset_seconds"),
        "date_coverage": {"min": times[0] if times else None, "max": times[-1] if times else None},
        "geographic_coverage": {"grain": "city point", "lat": data.get("latitude"), "lon": data.get("longitude")},
        "missing_null": {
            key: sum(1 for item in values if item is None)
            for key, values in hourly.items()
            if key != "time" and isinstance(values, list)
        },
    }


def _geojson_profile(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    features = data.get("features") or []
    geom_types: Counter[str] = Counter()
    adm1: Counter[str] = Counter()
    unnamed = 0
    nulls: Counter[str] = Counter()
    for feat in features:
        geom_types[(feat.get("geometry") or {}).get("type") or "None"] += 1
        props = feat.get("properties") or {}
        for key, value in props.items():
            if value is None or value == "":
                nulls[key] += 1
        if not props.get("name") and not props.get("name_en") and not props.get("name_latin"):
            unnamed += 1
        if props.get("adm1_name"):
            adm1[str(props["adm1_name"])] += 1
    return {
        "format": "geojson",
        "rows": len(features),
        "columns": sorted({k for f in features[:1] for k in (f.get("properties") or {}).keys()}),
        "geometry_types": dict(geom_types),
        "unnamed_features": unnamed,
        "missing_null": dict(nulls),
        "geographic_coverage": {"grain": "OSM feature", "adm1": dict(adm1), "crs": data.get("crs")},
        "date_coverage": "OSM snapshot 2026-10-12 (see folder README/metadata)",
    }


def profile_file(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _csv_profile(path)
    if suffix == ".json" and path.name.startswith("weather_"):
        return _weather_json_profile(path)
    if suffix == ".geojson":
        return _geojson_profile(path)
    if suffix == ".pdf":
        return {
            "format": "pdf",
            "rows": None,
            "columns": [],
            "note": "Official document. Not a tabular dataset. Numbers are not extracted in the inventory pass.",
        }
    return {"format": suffix.lstrip(".") or "unknown", "rows": None, "columns": []}


def build_inventory() -> dict[str, Any]:
    files = []
    for path in sorted(p for p in RAW_DATASETS.rglob("*") if p.is_file()):
        rel = path.relative_to(RAW_DATASETS).as_posix()
        folder = path.parent.relative_to(RAW_DATASETS).as_posix()
        meta = SOURCE_LICENCES.get(folder, {"publisher": "collection", "licence": "see_readme", "source_url": ""})
        record = {
            "relative_path": rel,
            "filename": path.name,
            "folder": folder,
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
            "source": meta["publisher"],
            "licence": meta["licence"],
            "source_url": meta.get("source_url", ""),
            "profile": profile_file(path),
        }
        files.append(record)

    hashes: dict[str, list[str]] = {}
    for rec in files:
        hashes.setdefault(rec["sha256"], []).append(rec["relative_path"])
    content_duplicates = {h: paths for h, paths in hashes.items() if len(paths) > 1}

    adm2_sets: dict[str, set[str]] = {}
    for rec in files:
        if rec["profile"].get("format") == "csv" and "ADM2_PCODE" in (rec["profile"].get("columns") or []):
            frame = pd.read_csv(RAW_DATASETS / rec["relative_path"])
            adm2_sets[rec["filename"]] = set(frame["ADM2_PCODE"].astype(str))

    compatible = []
    names = list(adm2_sets)
    for i, left in enumerate(names):
        for right in names[i + 1 :]:
            inter = adm2_sets[left] & adm2_sets[right]
            compatible.append(
                {
                    "left": left,
                    "right": right,
                    "shared_adm2": len(inter),
                    "compatible_on_adm2": len(inter) == len(adm2_sets[left]) == len(adm2_sets[right]),
                }
            )

    inventory = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "archive": ZIP_ARCHIVE.name,
        "extracted_to": str(RAW_DATASETS.relative_to(ROOT)),
        "n_files": len(files),
        "files": files,
        "byte_identical_duplicates": content_duplicates,
        "adm2_compatibility": compatible,
    }
    write_json(INVENTORY_PATH, inventory)
    return inventory


def build_initial_quality_report(inventory: dict[str, Any]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    issues.append(
        {
            "dataset": "01_open_meteo_heat_rainfall",
            "severity": "high",
            "issue": "Peshawar hourly series starts 2023-01-01 (33288 hours) while 11 cities start 2021-01-01 (50808 hours).",
            "action_proposed": "flag",
        }
    )
    issues.append(
        {
            "dataset": "01_open_meteo_heat_rainfall",
            "severity": "medium",
            "issue": "pakistan_cities_hourly_heat_rainfall_sample.csv is 6-hourly (hours 0/6/12/18), not hourly. Peak temperature 49.0 C vs JSON 50.1 C.",
            "action_proposed": "fix label; flag undersampled peaks",
        }
    )
    issues.append(
        {
            "dataset": "01_open_meteo_heat_rainfall",
            "severity": "info",
            "issue": "Quetta extreme_heat_hours_ge_40c = 0 because max temperature is 39.7 C. This is a real climate value, not missing data.",
            "action_proposed": "keep",
        }
    )
    issues.append(
        {
            "dataset": "02_openstreetmap_geofabrik",
            "severity": "high",
            "issue": "All RP*_crops_* flood-exposure columns are 0.0 for every district.",
            "action_proposed": "flag as source-unavailable; exclude from gold join",
        }
    )
    issues.append(
        {
            "dataset": "02_openstreetmap_geofabrik",
            "severity": "high",
            "issue": "OSM facility zeros mean 'none mapped'. Health facilities GeoJSON covers 115 of 160 ADM2 codes and is sparse in Balochistan (79 features).",
            "action_proposed": "flag",
        }
    )
    issues.append(
        {
            "dataset": "02_openstreetmap_geofabrik",
            "severity": "medium",
            "issue": "populated_places: 35,237 unnamed of 67,781; population tag null on 66,679; 1,885 features lack ADM codes. Geometry includes 2 LineString and 2 GeometryCollection features.",
            "action_proposed": "flag; keep features",
        }
    )
    issues.append(
        {
            "dataset": "02_openstreetmap_geofabrik",
            "severity": "medium",
            "issue": "rural_access_dependency_ratio missing for PK702 and PK712 (0 rural population).",
            "action_proposed": "flag; do not fill",
        }
    )
    issues.append(
        {
            "dataset": "04_pakistan_bureau_of_statistics",
            "severity": "medium",
            "issue": "pbs_district_vulnerability_dependency_ratios.csv is an exact column-wise join of the demographics and rural/urban CSVs (160/160).",
            "action_proposed": "keep raw copies; one canonical processed table",
        }
    )
    issues.append(
        {
            "dataset": "04_pakistan_bureau_of_statistics",
            "severity": "info",
            "issue": "PBS tables have ADM2 codes but no district names. ADM_PCODE duplicates ADM2_PCODE.",
            "action_proposed": "fix redundant column; attach names from OSM where codes match",
        }
    )
    issues.append(
        {
            "dataset": "03_ndma_pmd_hazards_warnings",
            "severity": "info",
            "issue": "River thresholds are in cusecs, 19 stations, no time series. PDFs are not tabular.",
            "action_proposed": "keep thresholds; add cms conversion; catalog PDFs",
        }
    )
    issues.append(
        {
            "dataset": "integration",
            "severity": "high",
            "issue": "District OSM CSVs and PBS CSVs share the same 160 ADM2_PCODE values and can be joined. City weather and river stations cannot be joined to districts without a reviewed spatial assignment.",
            "action_proposed": "join district snapshots only; keep weather and rivers separate",
        }
    )

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "n_files": inventory["n_files"],
        "byte_identical_duplicates": inventory["byte_identical_duplicates"],
        "logical_duplicates": [
            {
                "files": [
                    "04_pakistan_bureau_of_statistics/pbs_district_vulnerability_dependency_ratios.csv",
                    "join(pbs_district_population_demographics_160_districts.csv, pbs_district_rural_urban_population.csv)",
                ],
                "note": "Not byte-identical, but shared columns are equal for all 160 rows.",
            }
        ],
        "issues": issues,
        "volume": {
            "open_meteo_hourly_rows_expected": 11 * 50808 + 33288,
            "open_meteo_6h_sample_rows": 98696,
            "osm_populated_places": 67781,
            "osm_health_facilities": 5144,
            "district_tables": 160,
        },
        "do_not": [
            "Overwrite raw files",
            "Fill Peshawar 2021-2022",
            "Treat OSM zeros as confirmed absence",
            "Treat crop-flood zeros as no crop exposure",
            "Discard temperatures >= 40 C",
            "Merge rainfall mm with river cusecs",
            "Train an ML model in this step",
        ],
    }
    write_json(INITIAL_QUALITY_PATH, report)
    return report
