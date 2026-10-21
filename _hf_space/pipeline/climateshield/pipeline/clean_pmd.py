"""Clean NDMA / PMD hazard tables and catalog official PDFs."""

from __future__ import annotations

import pandas as pd

from climateshield.config import CLEANED_DIR, CUSEC_TO_CMS, PROVINCE_LABELS, RAW_DATASETS
from climateshield.io_utils import write_csv, write_table
from climateshield.quality.agent import DataQualityAgent

SRC = RAW_DATASETS / "03_ndma_pmd_hazards_warnings"
OUT = CLEANED_DIR / "03_ndma_pmd_hazards_warnings"
DATASET = "03_ndma_pmd_hazards_warnings"

PDF_META = {
    "ndma_anticipatory_action_strategy_2026_2030.pdf": {
        "publisher": "NDMA",
        "doc_type": "strategy",
        "title": "NDMA Anticipatory Action Strategy 2026-2030",
    },
    "ndma_weather_advisory_2026_09_11.pdf": {
        "publisher": "NDMA",
        "doc_type": "weather_advisory",
        "title": "NDMA weather advisory 2026-09-11",
    },
    "ndma_weather_advisory_2026_10_05.pdf": {
        "publisher": "NDMA",
        "doc_type": "weather_advisory",
        "title": "NDMA weather advisory 2026-10-05",
    },
    "ndma_weather_advisory_2026_10_09.pdf": {
        "publisher": "NDMA",
        "doc_type": "weather_advisory",
        "title": "NDMA weather advisory 2026-10-09",
    },
    "pmd_flood_advisory_river_chenab.pdf": {
        "publisher": "PMD",
        "doc_type": "flood_advisory",
        "title": "PMD flood advisory River Chenab",
    },
    "pmd_flood_bulletin_2026_10_15.pdf": {
        "publisher": "PMD",
        "doc_type": "flood_bulletin",
        "title": "PMD flood bulletin 2026-10-15",
    },
}


def clean_pmd(agent: DataQualityAgent) -> dict[str, pd.DataFrame]:
    OUT.mkdir(parents=True, exist_ok=True)
    rivers = pd.read_csv(SRC / "pmd_river_danger_levels_thresholds.csv")
    rivers["standardized_province"] = rivers["province"].map(lambda v: PROVINCE_LABELS.get(str(v), str(v)))
    agent.decide("PMD.PROVINCE_LABELS", DATASET, int(len(rivers)), column="standardized_province")
    cusec_cols = [c for c in rivers.columns if "cusecs" in c]
    for col in cusec_cols:
        rivers[col.replace("_cusecs", "_cms")] = rivers[col] * CUSEC_TO_CMS
    agent.decide("PMD.UNITS_CUSECS", DATASET, int(len(rivers)), column="*_cms")
    rivers["units_note"] = "publisher_thresholds_in_cusecs; cms_columns_are_derived"
    rivers["quality_flags"] = "thresholds_are_not_observations"
    rivers["row_id"] = "river|" + rivers["river_basin"].astype(str) + "|" + rivers["station_name"].astype(str)
    write_table(OUT / "pmd_river_danger_levels", rivers)

    docs = []
    pbs_pdfs = list((RAW_DATASETS / "04_pakistan_bureau_of_statistics").glob("*.pdf"))
    for path in sorted(SRC.glob("*.pdf")) + sorted(pbs_pdfs):
        meta = PDF_META.get(path.name, {
            "publisher": "PBS" if "pbs_" in path.name else "unknown",
            "doc_type": "official_pdf",
            "title": path.stem.replace("_", " "),
        })
        docs.append(
            {
                "row_id": f"doc|{path.name}",
                "filename": path.name,
                "relative_path": path.relative_to(RAW_DATASETS).as_posix(),
                "publisher": meta["publisher"],
                "doc_type": meta["doc_type"],
                "title": meta["title"],
                "bytes": path.stat().st_size,
                "quality_flags": "document_not_parsed_no_invented_numbers",
            }
        )
    catalog = pd.DataFrame(docs)
    agent.decide("PMD.PDF_NO_INVENTED_NUMBERS", DATASET, int(len(catalog)), details="PDF catalog only")
    write_csv(OUT / "document_catalog.csv", catalog)
    return {"rivers": rivers, "documents": catalog}
