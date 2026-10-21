"""Raw-file manifest: source, query, fetch time, SHA-256, licence."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from climateshield.config import (
    MANIFEST_PATH,
    OPEN_METEO_CITY_POINTS,
    RAW_DATASETS,
    SOURCE_LICENCES,
    ZIP_ARCHIVE,
)
from climateshield.io_utils import sha256_file, write_csv


def build_manifest(extracted_at: str | None = None) -> pd.DataFrame:
    extracted_at = extracted_at or datetime.now(timezone.utc).isoformat()
    zip_mtime = (
        datetime.fromtimestamp(ZIP_ARCHIVE.stat().st_mtime, tz=timezone.utc).isoformat()
        if ZIP_ARCHIVE.exists()
        else ""
    )
    rows = []
    for path in sorted(p for p in RAW_DATASETS.rglob("*") if p.is_file()):
        folder = path.parent.relative_to(RAW_DATASETS).as_posix()
        source_meta = SOURCE_LICENCES.get(folder, {
            "publisher": "collection_catalog",
            "source_url": "",
            "licence": "see_folder_readme",
        })
        query = f"extracted from {ZIP_ARCHIVE.name}"
        source_url = source_meta.get("source_url", "")
        if folder == "01_open_meteo_heat_rainfall" and path.name.startswith("weather_") and path.suffix == ".json":
            slug = path.name.removeprefix("weather_").removesuffix("_raw.json")
            point = OPEN_METEO_CITY_POINTS.get(slug)
            if point:
                query = (
                    "Open-Meteo historical hourly JSON bundled in "
                    f"{ZIP_ARCHIVE.name}; city={point['city']} latitude={point['latitude']} "
                    f"longitude={point['longitude']} timezone=GMT start=2021-01-01 "
                    "(Peshawar start=2023-01-01)"
                )
                source_url = "https://archive-api.open-meteo.com/v1/archive"
        rows.append(
            {
                "filepath": path.relative_to(RAW_DATASETS).as_posix(),
                "source": source_meta["publisher"],
                "source_folder": folder,
                "query": query,
                "fetch_time_utc": extracted_at,
                "archive_mtime_utc": zip_mtime,
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "licence": source_meta["licence"],
                "source_url": source_url,
            }
        )
    frame = pd.DataFrame(rows)
    write_csv(MANIFEST_PATH, frame)
    return frame


def verify_manifest(manifest: pd.DataFrame) -> list[str]:
    errors = []
    for row in manifest.itertuples(index=False):
        path = RAW_DATASETS / row.filepath
        if not path.exists():
            errors.append(f"missing raw file: {row.filepath}")
            continue
        actual = sha256_file(path)
        if actual != row.sha256:
            errors.append(f"hash mismatch: {row.filepath}")
    return errors
