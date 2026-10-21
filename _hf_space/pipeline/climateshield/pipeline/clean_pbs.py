"""Clean Pakistan Bureau of Statistics district tables."""

from __future__ import annotations

import pandas as pd

from climateshield.config import CLEANED_DIR, PCODE_REGION, RAW_DATASETS
from climateshield.io_utils import write_table
from climateshield.quality.agent import DataQualityAgent

SRC = RAW_DATASETS / "04_pakistan_bureau_of_statistics"
OUT = CLEANED_DIR / "04_pakistan_bureau_of_statistics"
DATASET = "04_pakistan_bureau_of_statistics"


def _region(code: str) -> str:
    return PCODE_REGION.get(str(code)[:3], {}).get("region_name", "unknown")


def _prep(frame: pd.DataFrame, agent: DataQualityAgent, name: str) -> pd.DataFrame:
    if "ADM_PCODE" in frame.columns and "ADM2_PCODE" in frame.columns:
        n = int((frame["ADM_PCODE"].astype(str) == frame["ADM2_PCODE"].astype(str)).sum())
        frame = frame.drop(columns=["ADM_PCODE"])
        agent.decide("PBS.REDUNDANT_ADM", DATASET, n, column="ADM_PCODE", details=name)
    frame = frame.copy()
    frame["region_name"] = frame["ADM2_PCODE"].map(_region)
    agent.decide("PBS.REGION_FROM_PCODE", DATASET, int(len(frame)), column="region_name", details=name)
    frame["quality_flags"] = ""
    return frame


def clean_pbs(agent: DataQualityAgent, name_lookup: pd.DataFrame) -> dict[str, pd.DataFrame]:
    OUT.mkdir(parents=True, exist_ok=True)
    names = (
        name_lookup.dropna(subset=["ADM2_PCODE", "adm2_name"])
        .drop_duplicates("ADM2_PCODE")[["ADM2_PCODE", "adm2_name"]]
        .rename(columns={"adm2_name": "district_name"})
    )

    demo = _prep(pd.read_csv(SRC / "pbs_district_population_demographics_160_districts.csv"), agent, "demographics")
    rural = _prep(pd.read_csv(SRC / "pbs_district_rural_urban_population.csv"), agent, "rural_urban")
    vuln = _prep(pd.read_csv(SRC / "pbs_district_vulnerability_dependency_ratios.csv"), agent, "vulnerability_joined_copy")

    demo_sorted = demo.sort_values("ADM2_PCODE").reset_index(drop=True)
    rural_sorted = rural.sort_values("ADM2_PCODE").reset_index(drop=True)
    vuln_sorted = vuln.sort_values("ADM2_PCODE").reset_index(drop=True)
    demo_match = demo_sorted[[c for c in demo.columns if c in vuln.columns and c != "quality_flags"]].equals(
        vuln_sorted[[c for c in demo.columns if c in vuln.columns and c != "quality_flags"]]
    )
    rural_match = rural_sorted[[c for c in rural.columns if c in vuln.columns and c != "quality_flags"]].equals(
        vuln_sorted[[c for c in rural.columns if c in vuln.columns and c != "quality_flags"]]
    )
    agent.decide(
        "PBS.LOGICAL_DUPLICATE",
        DATASET,
        int(len(vuln)),
        details=f"demographics_match={demo_match}; rural_match={rural_match}",
    )

    def attach_names(frame: pd.DataFrame, name: str) -> pd.DataFrame:
        if "total_pop_rural" in frame.columns:
            urban = frame["total_pop_rural"] == 0
            frame = agent.append_flags(frame, urban, "zero_rural_population_likely_fully_urban")
            agent.decide("PBS.URBAN_ZERO_RURAL", DATASET, int(urban.sum()), column="total_pop_rural", details=name)
        frame = frame.merge(names, on="ADM2_PCODE", how="left")
        missing_name = frame["district_name"].isna()
        frame = agent.append_flags(frame, missing_name, "district_name_not_in_osm_lookup")
        return frame

    demo = attach_names(demo, "demographics")
    rural = attach_names(rural, "rural_urban")
    vuln = attach_names(vuln, "vulnerability_joined_copy")

    demo["row_id"] = "pbs_demo|" + demo["ADM2_PCODE"].astype(str)
    rural["row_id"] = "pbs_rural|" + rural["ADM2_PCODE"].astype(str)
    write_table(OUT / "pbs_district_demographics", demo)
    write_table(OUT / "pbs_district_rural_urban", rural)
    return {"pbs_demo": demo, "pbs_rural": rural}
