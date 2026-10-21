"""
Unit tests for the /api/model/summary endpoint.
Ensures conformance with doc/AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Values come from warehouse and audit reports.
- Standard envelope: {data, generated_at, is_sample}
- Required fields: model vs baseline metrics, training and test periods, interval coverage,
  and the per-group error table from model_eval with the weakest group flagged.
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_model_summary_structure():
    """Verify metrics, training and test periods, interval coverage, and weakest group."""
    response = client.get("/api/model/summary")
    assert response.status_code == 200
    payload = response.json()

    assert "data" in payload
    assert "generated_at" in payload
    assert "is_sample" in payload

    data = payload["data"]

    # 1. Model vs baseline metrics
    metrics = data["metrics"]
    assert "baseline_declared" in metrics
    assert "model_architecture" in metrics
    assert "model_mae" in metrics
    assert "baseline_mae" in metrics
    assert "mae_improvement_pct" in metrics
    assert "meets_20pct_target" in metrics
    assert metrics["meets_20pct_target"] is True

    # 2. Periods
    assert "training_period" in data
    assert data["training_period"]["rows_count"] > 0
    assert "test_period" in data
    assert data["test_period"]["rows_count"] > 0

    # 3. Interval coverage
    cov = data["interval_coverage"]
    assert "nominal_coverage_pct" in cov
    assert "observed_coverage_pct" in cov
    assert cov["observed_coverage_pct"] >= 80.0
    assert "average_interval_width" in cov

    # 4. Weakest group
    assert "weakest_group" in data
    assert "name" in data["weakest_group"]
    assert "mae" in data["weakest_group"]
    assert "recommendation" in data["weakest_group"]

    # 5. Group error table
    assert "groups" in data
    assert isinstance(data["groups"], list)
    assert len(data["groups"]) > 0

    # Ensure at least one group is flagged as weakest
    weakest_flags = [g for g in data["groups"] if g["is_weakest"]]
    assert len(weakest_flags) == 1
    if any(g["group_value"] == data["weakest_group"]["name"] for g in data["groups"]):
        assert weakest_flags[0]["group_value"] == data["weakest_group"]["name"]
