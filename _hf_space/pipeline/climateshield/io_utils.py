"""Safe I/O helpers. Raw files are read-only."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import pandas as pd

from climateshield.config import RAW_DIR, RAW_HOURLY_DIR


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _is_under(path: Path, root: Path) -> bool:
    resolved = path.resolve()
    root_resolved = root.resolve()
    return resolved == root_resolved or root_resolved in resolved.parents


def assert_not_raw(path: Path) -> None:
    """Block writes to the immutable collected archive.

    New hourly API responses may be added under data/raw/hourly_ingest/ only.
    Files extracted from the original ZIP must never be modified.
    """
    if _is_under(path, RAW_HOURLY_DIR):
        return
    collected = RAW_DIR / "collected_datasets"
    if _is_under(path, collected):
        raise PermissionError(f"Refusing to write inside collected raw datasets: {path}")
    if _is_under(path, RAW_DIR) and not _is_under(path, RAW_HOURLY_DIR):
        raise PermissionError(f"Refusing to write inside raw directory: {path}")


def write_raw_hourly_bytes(path: Path, payload: bytes) -> None:
    """Save a newly fetched API body. Never overwrites collected_datasets."""
    if not _is_under(path, RAW_HOURLY_DIR):
        raise PermissionError(f"Hourly raw writes must stay under {RAW_HOURLY_DIR}: {path}")
    if _is_under(path, RAW_DIR / "collected_datasets"):
        raise PermissionError(f"Refusing to overwrite collected raw datasets: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def reset_dir(path: Path) -> None:
    assert_not_raw(path)
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    assert_not_raw(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def write_csv(path: Path, frame: pd.DataFrame) -> None:
    assert_not_raw(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False)


def write_parquet(path: Path, frame: pd.DataFrame) -> None:
    assert_not_raw(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False)


def write_table(path_stem: Path, frame: pd.DataFrame, parquet: bool = True, csv: bool = True) -> dict[str, str]:
    written: dict[str, str] = {}
    if csv:
        csv_path = path_stem.with_suffix(".csv")
        write_csv(csv_path, frame)
        written["csv"] = str(csv_path)
    if parquet:
        parquet_path = path_stem.with_suffix(".parquet")
        write_parquet(parquet_path, frame)
        written["parquet"] = str(parquet_path)
    return written
