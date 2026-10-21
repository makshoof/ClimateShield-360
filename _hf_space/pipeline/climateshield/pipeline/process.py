"""Build processed gold tables with stable row IDs. No incompatible merges."""

from __future__ import annotations

import pandas as pd

from climateshield.config import PROCESSED_DIR
from climateshield.io_utils import write_csv, write_table
from climateshield.quality.agent import DataQualityAgent

OUT = PROCESSED_DIR


def build_processed(cleaned: dict, agent: DataQualityAgent) -> dict[str, pd.DataFrame]:
    OUT.mkdir(parents=True, exist_ok=True)
    gold: dict[str, pd.DataFrame] = {}

    weather = cleaned["weather"]["weather_hourly"].copy()
    write_table(OUT / "weather_hourly", weather, csv=False)
    gold["weather_hourly"] = weather

    write_table(OUT / "weather_6h_sample", cleaned["weather"]["weather_6h_sample"], csv=False)
    write_table(OUT / "city_locations", cleaned["weather"]["city_locations"])
    write_table(OUT / "weather_city_stats", cleaned["weather"]["weather_city_stats"])

    demo = cleaned["pbs"]["pbs_demo"].copy()
    rural = cleaned["pbs"]["pbs_rural"].copy()
    facilities = cleaned["osm"]["osm_emergency_facilities"].copy()
    access = cleaned["osm"]["osm_hospital_access"].copy()
    flood = cleaned["osm"]["osm_flood_exposure"].copy()
    rai = cleaned["osm"]["osm_rural_access"].copy()

    crop_cols = [c for c in flood.columns if "crops" in c]
    flood_kept = flood.drop(columns=crop_cols, errors="ignore")

    agent.decide(
        "JOIN.DISTRICT_SNAPSHOT",
        "processed",
        n_rows=160,
        details="Join PBS demographics + rural/urban + OSM district indicators on ADM2_PCODE. Crop-flood columns excluded.",
    )
    agent.decide("JOIN.NO_WEATHER_DISTRICT", "processed", 0)
    agent.decide("JOIN.NO_RAIN_TO_CUSECS", "processed", 0)
    agent.decide("GLOBAL.NO_INCOMPATIBLE_MERGE", "processed", 0)

    def prefixed(frame: pd.DataFrame, prefix: str, extra_drop: list[str] | None = None) -> pd.DataFrame:
        drop = {"row_id", "quality_flags", "region_name", "district_name"}
        if extra_drop:
            drop.update(extra_drop)
        cols = [c for c in frame.columns if c not in drop]
        out = frame[cols].copy()
        rename = {c: f"{prefix}{c}" for c in out.columns if c != "ADM2_PCODE"}
        return out.rename(columns=rename)

    district = prefixed(demo, "pbs_")
    district = district.merge(prefixed(rural, "pbs_"), on="ADM2_PCODE", how="outer", validate="one_to_one")
    district = district.merge(prefixed(facilities, "osm_"), on="ADM2_PCODE", how="outer", validate="one_to_one")
    district = district.merge(prefixed(access, "osm_"), on="ADM2_PCODE", how="outer", validate="one_to_one")
    district = district.merge(prefixed(flood_kept, "osm_"), on="ADM2_PCODE", how="outer", validate="one_to_one")
    district = district.merge(prefixed(rai, "osm_"), on="ADM2_PCODE", how="outer", validate="one_to_one")

    names = demo[["ADM2_PCODE", "region_name", "district_name"]].drop_duplicates("ADM2_PCODE")
    district = names.merge(district, on="ADM2_PCODE", how="right")
    district["row_id"] = "district|" + district["ADM2_PCODE"].astype(str)
    flag_parts = [
        demo[["ADM2_PCODE", "quality_flags"]].rename(columns={"quality_flags": "pbs_demo_flags"}),
        rural[["ADM2_PCODE", "quality_flags"]].rename(columns={"quality_flags": "pbs_rural_flags"}),
        facilities[["ADM2_PCODE", "quality_flags"]].rename(columns={"quality_flags": "osm_facilities_flags"}),
        flood[["ADM2_PCODE", "quality_flags"]].rename(columns={"quality_flags": "osm_flood_flags"}),
        rai[["ADM2_PCODE", "quality_flags"]].rename(columns={"quality_flags": "osm_rai_flags"}),
    ]
    flags = flag_parts[0]
    for part in flag_parts[1:]:
        flags = flags.merge(part, on="ADM2_PCODE", how="outer")
    district = district.merge(flags, on="ADM2_PCODE", how="left")
    district["join_notes"] = (
        "district snapshot join on ADM2_PCODE; "
        "osm counts are mapped counts not official census; "
        "crop flood columns excluded because all-zero / source unavailable; "
        "weather and river discharge not joined"
    )
    write_table(OUT / "district_snapshot", district)
    gold["district_snapshot"] = district
    gold["osm_emergency_facilities"] = facilities
    gold["osm_flood_exposure"] = flood
    gold["pmd_river_danger_levels"] = cleaned["pmd"]["rivers"]

    write_table(OUT / "pbs_district_demographics", demo)
    write_table(OUT / "pbs_district_rural_urban", rural)
    write_table(OUT / "osm_emergency_facilities", facilities)
    write_table(OUT / "osm_hospital_access", access)
    write_table(OUT / "osm_flood_exposure", flood_kept)
    write_table(OUT / "osm_rural_access", rai)
    write_table(OUT / "pmd_river_danger_levels", cleaned["pmd"]["rivers"])
    write_table(OUT / "health_facilities", cleaned["osm"]["health_facilities"], csv=False)
    write_table(OUT / "populated_places", cleaned["osm"]["populated_places"], csv=False)
    write_csv(OUT / "document_catalog.csv", cleaned["pmd"]["documents"])
    write_csv(OUT / "district_name_lookup.csv", cleaned["osm"]["district_name_lookup"])

    excluded = pd.DataFrame(
        {
            "table": ["osm_flood_exposure"] * len(crop_cols),
            "column": crop_cols,
            "reason": "all values 0.0 across 160 districts; treated as missing source layer, not zero exposure",
        }
    )
    write_csv(OUT / "excluded_columns.csv", excluded)
    return gold
