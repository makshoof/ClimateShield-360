"""
Unit tests for the /api/methodology endpoint.
Ensures conformance with doc/AGENT_RULES.md and prompt requirements:
- Reads manifest.csv, doc/Dataset_Declaration.md, model_vs_baseline_metrics.json, and quality reports.
- Returns dataset names, source links, licences, collection times, coverage,
  quality rules, ML target, baseline, evaluation method, limitations,
  risk score definitions and thresholds, known gaps, and responsible-use notes.
- Rule 1: Never hard-code outputs.
- Rule 2: No synthetic data presented as real; is_sample reported accurately.
- Standard envelope: {data, generated_at, is_sample}
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_methodology_envelope():
    """Verify standard envelope {data, generated_at, is_sample}."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    payload = response.json()

    assert "data" in payload
    assert "generated_at" in payload
    assert "is_sample" in payload
    assert isinstance(payload["is_sample"], bool)


def test_methodology_datasets():
    """Verify dataset names, source links, licences, collection times, and coverage."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    datasets = data.get("datasets", [])
    assert len(datasets) >= 4

    for ds in datasets:
        assert "name" in ds and len(ds["name"]) > 0
        assert "publisher" in ds and len(ds["publisher"]) > 0
        assert "source_links" in ds and len(ds["source_links"]) > 0
        assert "licence" in ds and len(ds["licence"]) > 0
        assert "collection_times" in ds
        assert "coverage" in ds
        assert "variables_extracted" in ds
        assert "credibility_rationale" in ds

        # Check collection times fields
        times = ds["collection_times"]
        assert "earliest" in times
        assert "latest" in times
        assert "frequency" in times
        assert "cadence" in times

        # Check coverage fields
        cov = ds["coverage"]
        assert "spatial" in cov
        assert "temporal" in cov
        assert "total_records" in cov
        assert cov["file_count"] > 0
        assert cov["total_bytes"] > 0


def test_methodology_manifest_files():
    """Verify manifest files from manifest.csv are returned with links and hashes."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    manifest_files = data.get("manifest_files", [])
    assert len(manifest_files) > 50

    sample_file = manifest_files[0]
    assert "filepath" in sample_file
    assert "source" in sample_file
    assert "licence" in sample_file
    assert "source_url" in sample_file
    assert "fetch_time_utc" in sample_file
    assert "bytes" in sample_file
    assert "sha256_short" in sample_file


def test_methodology_quality_rules():
    """Verify data quality & cleaning rules are returned."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    rules = data.get("quality_rules", [])
    assert len(rules) >= 20

    rule_ids = [r["rule_id"] for r in rules]
    assert "GLOBAL.RAW_IMMUTABLE" in rule_ids
    assert "OSM.CROP_FLOOD_ALL_ZERO" in rule_ids
    assert "WX.PESHAWAR_COVERAGE" in rule_ids

    for r in rules:
        assert r["action"] in ["keep", "fix", "fill", "flag", "exclude"]
        assert len(r["what"]) > 0
        assert len(r["why"]) > 0


def test_methodology_ml_target_and_baseline():
    """Verify ML target, declared baseline, and evaluation metrics."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    # ML Target
    ml_target = data.get("ml_target")
    assert ml_target is not None
    assert "primary_target" in ml_target
    assert "architecture" in ml_target
    assert "training_split" in ml_target
    assert "test_split" in ml_target

    # Baseline
    baseline = data.get("baseline")
    assert baseline is not None
    assert "declared_name" in baseline
    assert "formula" in baseline
    assert "y_{t-24h}" in baseline["formula"] or "y_{t - 24h}" in baseline["formula"]
    assert "baseline_mae" in baseline
    assert baseline["baseline_mae"] > 0
    assert "road_condition_rule" in baseline
    assert "2.5 mm/hr" in baseline["road_condition_rule"]

    # Evaluation Method
    eval_method = data.get("evaluation_method")
    assert eval_method is not None
    assert eval_method["train_rows"] > 0
    assert eval_method["test_rows"] > 0
    assert eval_method["model_mae"] < baseline["baseline_mae"]
    assert eval_method["mae_improvement_pct"] >= 20.0
    assert eval_method["meets_20pct_target"] is True
    assert eval_method["uncertainty_interval_80pct_coverage"] >= 80.0
    assert "weakest_group" in eval_method


def test_methodology_limitations_and_known_gaps():
    """Verify limitations and documented known gaps."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    limitations = data.get("limitations", [])
    assert len(limitations) >= 4
    for lim in limitations:
        assert "title" in lim
        assert "category" in lim
        assert "description" in lim
        assert "operational_impact" in lim

    gaps = data.get("known_gaps", [])
    assert len(gaps) >= 4
    gap_sources = [g["source"] for g in gaps]
    assert any("Peshawar" in s for s in gap_sources)
    assert any("Crop" in s for s in gap_sources)

    for g in gaps:
        assert g["severity"] in ["high", "medium", "info"]
        assert len(g["gap"]) > 0
        assert len(g["handling_strategy"]) > 0


def test_methodology_risk_definitions():
    """Verify risk levels, evidence tiers, and river danger thresholds."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    risk_defs = data.get("risk_score_definitions")
    assert risk_defs is not None

    levels = risk_defs.get("levels", [])
    assert len(levels) == 4
    level_names = [lvl["level"] for lvl in levels]
    assert level_names == ["Low", "Moderate", "High", "Severe"]

    for lvl in levels:
        assert "rainfall_threshold" in lvl
        assert "wbgt_threshold" in lvl
        assert "inundation_threshold" in lvl
        assert "operational_posture" in lvl

    tiers = risk_defs.get("evidence_tiers", [])
    assert len(tiers) >= 3

    river_thresh = risk_defs.get("river_thresholds", [])
    assert len(river_thresh) > 0
    assert "river_basin" in river_thresh[0]
    assert "station_name" in river_thresh[0]


def test_methodology_responsible_use():
    """Verify responsible use notes: info only, crop data exclusion, safety boundaries."""
    response = client.get("/api/methodology")
    assert response.status_code == 200
    data = response.json()["data"]

    resp = data.get("responsible_use")
    assert resp is not None

    # 1. Information only notice
    assert "Information only, not professional advice" in resp["primary_notice"]

    # 2. Exclusion of crop data
    assert "crop flood exposure" in resp["crop_data_exclusion"].lower()
    assert "excluded" in resp["crop_data_exclusion"].lower()

    # 3. Safety boundaries
    boundaries = resp.get("safety_boundaries", [])
    assert len(boundaries) >= 4
    boundary_titles = [b["boundary_title"] for b in boundaries]
    assert any("Legal" in t for t in boundary_titles)
    assert any("Indoor Thermal" in t for t in boundary_titles)
    assert any("Automated" in t for t in boundary_titles)
    assert any("Microeconomic" in t for t in boundary_titles)

    # 4. Emergency hotlines
    contacts = resp.get("emergency_contacts", [])
    assert len(contacts) >= 4
    agencies = [c["agency"] for c in contacts]
    assert any("PDMA" in a for a in agencies)
    assert any("1122" in a for a in agencies)
