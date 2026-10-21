"""
Pytest suite for Overview & Priorities API endpoints.
Tests:
- GET /api/overview?range=24h|48h|7d: summary cards data, freshness status, predictions series
- GET /api/priorities?range=: ranked zones from exposure_index by risk_level then exposed_population
- Verification that reason string is rule-based and strictly uses table fields (facilities_count, vulnerability_score, exposed_population)
- pytest tests for the ranking order
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)

RISK_ORDER = {
    "Severe": 1,
    "High": 2,
    "Moderate": 3,
    "Low": 4,
}


def test_overview_endpoint_default():
    """Verify GET /api/overview returns all required hazard levels, freshness, and prediction series."""
    response = client.get("/api/overview")
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    assert isinstance(payload["is_sample"], bool)
    data = payload["data"]

    # Required fields
    assert "heat_hazard_level" in data
    assert "rain_hazard_level" in data
    assert "severe_zones_count" in data
    assert "data_freshness_status" in data
    assert "predictions_series" in data

    # Verify hazard levels are valid
    assert data["heat_hazard_level"] in ("Severe", "High", "Moderate", "Low")
    assert data["rain_hazard_level"] in ("Severe", "High", "Moderate", "Low")
    assert data["severe_zones_count"] >= 0
    assert data["total_zones_count"] >= 7
    heat_value = data["heat_summary"]["headline_value"]
    rain_value = data["rain_summary"]["headline_value"]
    if heat_value is not None and heat_value < 35:
        assert data["heat_hazard_level"] == "Low"
    if rain_value == 0:
        assert data["rain_hazard_level"] == "Low"
    assert "exposure table" in data["rain_summary"]["source"]

    # Verify prediction series per hazard
    series = data["predictions_series"]
    assert "heat" in series
    assert "heavy_rain" in series
    assert len(series["heavy_rain"]) >= 1
    assert series["heavy_rain"][0]["probability"] <= 1

    # Verify prediction point contract on whichever hazard has data
    pts = series["heavy_rain"] if len(series["heavy_rain"]) > 0 else series["heat"]
    first_pt = pts[0]
    assert "probability" in first_pt
    assert "interval_low" in first_pt
    assert "interval_high" in first_pt
    assert "baseline_value" in first_pt
    assert first_pt["interval_low"] <= first_pt["interval_high"]
    assert data["heat_summary"]["kind"] == "observed"
    assert "WBGT" not in data["heat_summary"]["label"]
    assert "Open-Meteo" in data["heat_summary"]["source"]
    assert "Not an ECMWF" in data["rain_summary"]["source"]
    assert data["rain_summary"]["kind"] == "observed"


def test_overview_time_ranges():
    """Verify range=24h, 48h, 7d adjusts the prediction horizons properly."""
    r24 = client.get("/api/overview?range=24h").json()["data"]["predictions_series"]["heat"]
    r48 = client.get("/api/overview?range=48h").json()["data"]["predictions_series"]["heat"]
    r7d = client.get("/api/overview?range=7d").json()["data"]["predictions_series"]["heat"]

    # Point counts must expand as horizon increases
    assert len(r24) <= len(r48)
    assert len(r48) <= len(r7d)


def test_priorities_ranking_order():
    """
    Verify GET /api/priorities strictly ranks zones by risk_level:
    Severe -> High -> Moderate -> Low.
    """
    response = client.get("/api/priorities")
    assert response.status_code == 200

    payload = response.json()
    items = payload["data"]
    assert len(items) > 0

    # Verify risk_level order is non-decreasing in rank (Severe=1, High=2, Moderate=3, Low=4)
    for i in range(len(items) - 1):
        curr_lvl = items[i]["risk_level"]
        next_lvl = items[i + 1]["risk_level"]
        assert RISK_ORDER[curr_lvl] <= RISK_ORDER[next_lvl], (
            f"Ranking violation at index {i}: {curr_lvl} appeared before {next_lvl}"
        )


def test_priorities_population_tiebreaker():
    """
    Verify that within the same risk_level, items are ranked by exposed_population DESC.
    """
    response = client.get("/api/priorities")
    assert response.status_code == 200

    items = response.json()["data"]

    for i in range(len(items) - 1):
        curr = items[i]
        nxt = items[i + 1]
        if curr["risk_level"] == nxt["risk_level"]:
            assert curr["exposed_population"] >= nxt["exposed_population"], (
                f"Tie-breaker violation at index {i}: population {curr['exposed_population']} < {nxt['exposed_population']}"
            )


def test_priorities_rule_based_reason():
    """
    Verify reason string is deterministic and built strictly from table fields:
    facilities_count, vulnerability_score, exposed_population.
    """
    response = client.get("/api/priorities")
    assert response.status_code == 200

    items = response.json()["data"]
    for item in items:
        reason = item["reason"]
        vuln = item["vulnerability_score"]
        pop = item["exposed_population"]
        fac = item["facilities_count"]

        # Ensure numeric values from table appear in reason string
        assert f"{vuln:.2f}" in reason
        assert f"{pop:,}" in reason
        assert str(fac) in reason


def test_priorities_filters_and_limit():
    """Verify hazard filter and limit query parameters."""
    res_heat = client.get("/api/priorities?hazard=heat")
    assert res_heat.status_code == 200
    heat_items = res_heat.json()["data"]
    assert all(it["hazard_type"] == "heat" for it in heat_items)

    res_rain = client.get("/api/priorities?hazard=heavy_rain")
    assert res_rain.status_code == 200
    rain_items = res_rain.json()["data"]
    assert all(it["hazard_type"] == "heavy_rain" for it in rain_items)

    res_limit = client.get("/api/priorities?limit=3")
    assert res_limit.status_code == 200
    assert len(res_limit.json()["data"]) == 3
