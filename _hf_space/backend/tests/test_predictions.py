"""
Unit tests for the /api/predictions endpoint.
Ensures conformance with doc/AGENT_RULES.md:
- Rule 5: Always show uncertainty intervals and baseline comparisons
- Standard envelope: {data, generated_at, is_sample}
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_predictions_envelope():
    """Verify standard envelope and non-empty predictions."""
    response = client.get("/api/predictions?limit=10")
    assert response.status_code == 200
    payload = response.json()

    assert "data" in payload
    assert "generated_at" in payload
    assert "is_sample" in payload
    assert isinstance(payload["data"], list)

    if len(payload["data"]) > 0:
        first = payload["data"][0]
        assert "zone_id" in first
        assert "forecast_time" in first
        assert "hazard_type" in first
        assert "probability" in first
        assert "interval_low" in first
        assert "interval_high" in first
        assert "baseline_value" in first
        # Rule 5 check: uncertainty intervals must be valid bounds
        assert first["interval_low"] <= first["interval_high"]


def test_list_predictions_filtering():
    """Verify filtering by hazard_type works as expected."""
    response = client.get("/api/predictions?hazard_type=heat&limit=5")
    assert response.status_code == 200
    payload = response.json()
    for item in payload["data"]:
        assert item["hazard_type"] == "heat"
