"""End-to-end `make data` pipeline."""

from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from climateshield.config import (
    CLEANED_DIR,
    CLEANING_RULES_PATH,
    PROCESSED_DIR,
    QUALITY_LOGS_PATH,
    QUALITY_REPORT_PATH,
    RAW_DIR,
    REPORTS_DIR,
    ROOT,
    WAREHOUSE_PATH,
)
from climateshield.inventory import build_initial_quality_report, build_inventory
from climateshield.io_utils import reset_dir, sha256_file, write_json
from climateshield.manifest import build_manifest, verify_manifest
from climateshield.pipeline.clean_osm import clean_osm
from climateshield.pipeline.clean_pbs import clean_pbs
from climateshield.pipeline.clean_pmd import clean_pmd
from climateshield.pipeline.clean_weather import clean_weather
from climateshield.pipeline.extract import ensure_raw_extracted
from climateshield.pipeline.process import build_processed
from climateshield.pipeline.warehouse import build_warehouse
from climateshield.quality.agent import DataQualityAgent
from climateshield.quality.logger import QualityLogger
from climateshield.quality.rules import rules_payload


def _list_outputs(folder: Path) -> list[dict[str, str | int]]:
    if not folder.exists():
        return []
    rows = []
    for path in sorted(p for p in folder.rglob("*") if p.is_file()):
        rows.append(
            {
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "bytes": path.stat().st_size,
            }
        )
    return rows


def make_data() -> dict:
    started = datetime.now(timezone.utc)
    ensure_raw_extracted()
    raw_hashes_before = {
        path.relative_to(RAW_DIR).as_posix(): sha256_file(path)
        for path in RAW_DIR.rglob("*")
        if path.is_file()
    }

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    reset_dir(CLEANED_DIR)
    reset_dir(PROCESSED_DIR)

    logger = QualityLogger()
    agent = DataQualityAgent(logger)
    agent.decide("GLOBAL.RAW_IMMUTABLE", "all", n_rows=len(raw_hashes_before))
    agent.decide("GLOBAL.NO_INVENTED_VALUES", "all", 0)

    write_json(CLEANING_RULES_PATH, rules_payload())
    manifest = build_manifest()
    hash_errors = verify_manifest(manifest)
    if hash_errors:
        raise RuntimeError("Raw manifest verification failed: " + "; ".join(hash_errors))

    inventory = build_inventory()
    initial_quality = build_initial_quality_report(inventory)

    weather = clean_weather(agent)
    osm = clean_osm(agent)
    pbs = clean_pbs(agent, osm["district_name_lookup"])
    pmd = clean_pmd(agent)
    processed = build_processed({"weather": weather, "osm": osm, "pbs": pbs, "pmd": pmd}, agent)
    from climateshield.ingest.run import rebuild_glofas_from_hourly_raw

    rebuild_glofas_from_hourly_raw()
    audit = agent.audit_gold(
        {
            "weather_hourly": processed["weather_hourly"],
            "district_snapshot": processed["district_snapshot"],
            "pmd_river_danger_levels": processed["pmd_river_danger_levels"],
            "osm_emergency_facilities": processed["osm_emergency_facilities"],
            "osm_flood_exposure": processed["osm_flood_exposure"],
        }
    )

    raw_hashes_after = {
        path.relative_to(RAW_DIR).as_posix(): sha256_file(path)
        for path in RAW_DIR.rglob("*")
        if path.is_file()
    }
    if raw_hashes_after != raw_hashes_before:
        raise RuntimeError("Raw files changed during the pipeline. Aborting.")

    logger.write_csv(QUALITY_LOGS_PATH)
    warehouse_counts = build_warehouse(extra_csv={"quality_logs": QUALITY_LOGS_PATH})
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "started_at_utc": started.isoformat(),
        "pipeline": "climateshield.pipeline.run.make_data",
        "raw_files_unchanged": True,
        "n_raw_files": len(raw_hashes_before),
        "n_inventory_files": inventory["n_files"],
        "decision_counts": logger.counts_by_action(),
        "n_decisions": len(logger.decisions),
        "outputs": {
            "cleaned": _list_outputs(CLEANED_DIR),
            "processed": _list_outputs(PROCESSED_DIR),
            "reports": _list_outputs(REPORTS_DIR),
        },
        "gold_tables": {
            "weather_hourly_rows": int(len(weather["weather_hourly"])),
            "weather_6h_sample_rows": int(len(weather["weather_6h_sample"])),
            "district_snapshot_rows": int(len(processed["district_snapshot"])),
            "health_facilities_rows": int(len(osm["health_facilities"])),
            "populated_places_rows": int(len(osm["populated_places"])),
        },
        "warehouse": {
            "path": str(WAREHOUSE_PATH.relative_to(ROOT)).replace("\\", "/"),
            "engine": "duckdb",
            "tables": warehouse_counts,
        },
        "initial_quality_issues": initial_quality["issues"],
        "cleaning_rules_path": str(CLEANING_RULES_PATH.relative_to(ROOT)).replace("\\", "/"),
        "quality_agent": {
            "tool": audit.get("tool", "pandera"),
            "tables_checked": audit.get("tables_checked"),
            "schema_passed": audit.get("schema_passed"),
            "schema_failed": audit.get("schema_failed"),
            "findings": audit.get("findings", []),
        },
        "notes": [
            "Original datasets were not overwritten.",
            "The Quality Agent ran Pandera on gold tables and logged fix/fill/flag for each finding.",
            "Short hourly gaps (<= 6h) in smooth variables may be filled and marked; precipitation is never interpolated.",
            "Extreme heat observations were kept.",
            "District join is ADM2-only; weather and river thresholds remain separate tables.",
            "ML training is not part of this pipeline.",
            "Gold tables are queryable in data/processed/climateshield.duckdb.",
        ],
    }
    write_json(QUALITY_REPORT_PATH, report)
    shutil.copy2(QUALITY_REPORT_PATH, ROOT / "quality_report.json")
    shutil.copy2(QUALITY_LOGS_PATH, ROOT / "quality_logs.csv")

    print("ClimateShield 360 make data")
    print(f"  raw files verified: {len(raw_hashes_before)}")
    print(f"  cleaned outputs: {len(report['outputs']['cleaned'])}")
    print(f"  processed outputs: {len(report['outputs']['processed'])}")
    print(f"  quality decisions: {report['n_decisions']} {report['decision_counts']}")
    print(
        "  quality agent: "
        f"pandera tables={report['quality_agent']['tables_checked']} "
        f"passed={report['quality_agent']['schema_passed']} "
        f"failed={report['quality_agent']['schema_failed']}"
    )
    print(f"  weather_hourly rows: {report['gold_tables']['weather_hourly_rows']}")
    print(f"  district_snapshot rows: {report['gold_tables']['district_snapshot_rows']}")
    print(f"  duckdb: {WAREHOUSE_PATH}")
    for table_name, n_rows in warehouse_counts.items():
        print(f"    {table_name}: {n_rows}")
    print(f"  report: {QUALITY_REPORT_PATH}")
    return report
