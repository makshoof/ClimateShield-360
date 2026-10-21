"""Extract the source ZIP into data/raw without modifying the archive."""

from __future__ import annotations

import zipfile

from climateshield.config import RAW_DIR, RAW_DATASETS, ZIP_ARCHIVE


def ensure_raw_extracted() -> None:
    if (RAW_DATASETS / "README_DATASETS_CATALOG.md").exists():
        ensure_zip_archive()
        return
    if not ZIP_ARCHIVE.exists():
        raise FileNotFoundError(f"ZIP archive not found: {ZIP_ARCHIVE}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_ARCHIVE) as archive:
        archive.extractall(RAW_DIR)


def ensure_zip_archive() -> None:
    """Recreate the collection ZIP from extracted files if the archive is missing.

    Collected file bytes are not modified. The ZIP is a reproducibility wrapper so
    `make data` can still be rebuilt from the declared archive path.
    """
    if ZIP_ARCHIVE.exists():
        return
    if not (RAW_DATASETS / "README_DATASETS_CATALOG.md").exists():
        raise FileNotFoundError(
            f"Neither ZIP archive nor extracted datasets found. Expected {ZIP_ARCHIVE}"
        )
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(p for p in RAW_DATASETS.rglob("*") if p.is_file()):
            archive.write(path, arcname=path.relative_to(RAW_DIR).as_posix())
