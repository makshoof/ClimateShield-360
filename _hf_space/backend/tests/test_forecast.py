"""
Unit tests for the /api/forecast endpoint.
Ensures conformance with doc/AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Every number comes from DuckDB.
- Rule 2: Envelope returns {data, generated_at, is_sample}.
- Rule 3: Times in UTC, formatted in PKT for display.
- Rule 5: Always show uncertainty intervals and baseline comparison where predictions appear.
- Heat uses the Open-Meteo hourly temperature forecast when that API responds.
  It is labeled external and is not a trained heat model.
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_forecast_heavy_rain():
    """Verify heavy rain returns observed, predicted series, baseline and thresholds."""
    response = client.get("/api/forecast?hazard=heavy_rain&city=Karachi&range=24h")
    assert response.status_code == 200
    payload = response.json()

    assert "data" in payload
    assert "generated_at" in payload
    assert "is_sample" in payload

    data = payload["data"]
    assert data["hazard"] == "heavy_rain"
    assert data["city"] == "Karachi"
    assert data["range"] == "24h"
    assert isinstance(data["observed"], list)
    assert len(data["observed"]) > 0

    first_obs = data["observed"][0]
    assert "timestamp_utc" in first_obs
    assert "timestamp_pkt" in first_obs
    assert "value" in first_obs
    assert first_obs["unit"] == "mm"

    # Baseline info
    assert "baseline" in data
    assert "name" in data["baseline"]
    assert "description" in data["baseline"]

    # Thresholds
    assert "thresholds" in data
    assert data["thresholds"]["unit"] == "mm/hr"
    assert len(data["thresholds"]["levels"]) >= 3

    # If predicted series exists, verify uncertainty intervals
    if data["predicted"] is not None and len(data["predicted"]) > 0:
        first_pred = data["predicted"][0]
        assert "probability" in first_pred
        assert "interval_low" in first_pred
        assert "interval_high" in first_pred
        assert "median" in first_pred
        assert first_pred["interval_low"] <= first_pred["interval_high"]


def test_forecast_time_order_horizon_and_stale_flag():
    """Rain forecasts stay time-ordered and do not claim a multi-day model horizon."""
    response = client.get("/api/forecast?hazard=heavy_rain&city=Karachi&range=7d")
    assert response.status_code == 200
    data = response.json()["data"]
    times = [point["forecast_time_utc"] for point in data["predicted"] or []]
    assert times == sorted(times)
    if data["predicted"]:
        assert data["forecast_origin"] in ("model", "external")
        assert data["issued_at"]
        if data["forecast_origin"] == "external":
            assert data["horizon_hours"] == 168
            assert "Open-Meteo" in (data["note"] or "")
        else:
            assert data["horizon_hours"] == 1
        for point in data["predicted"]:
            assert point["interval_low"] <= point["median"] <= point["interval_high"]
            assert point["median"] == 0.0 or point["median"] != point["probability"]
    else:
        assert data["forecast_origin"] == "none"
        assert "No active ML predictions" in (data["note"] or "")


def test_forecast_missing_city_does_not_invent_values():
    response = client.get("/api/forecast?hazard=heavy_rain&city=NotACity&range=24h")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["observed"] == []
    assert data["predicted"] == []
    assert data["forecast_origin"] == "none"
    assert data["baseline"]["value"] is None


def test_forecast_coverage_does_not_claim_full_support():
    response = client.get("/api/forecast/coverage")
    assert response.status_code == 200
    rows = response.json()["data"]
    by_area = {row["impact_area"]: row["status"] for row in rows}
    assert by_area["physical_heavy_rain"] == "partial"
    assert by_area["economic"] == "unsupported"
    assert by_area["producers"] == "unsupported"
    assert by_area["public_health"] == "unsupported"
    assert by_area["infrastructure"] == "unsupported"
    assert by_area["social"] == "unsupported"
    assert "working" not in by_area.values()


def test_forecast_heat():
    """Verify heat returns observed and thresholds only, with predicted=null and required note."""
    response = client.get("/api/forecast?hazard=heat&city=Karachi&range=24h")
    assert response.status_code == 200
    payload = response.json()

    data = payload["data"]
    assert data["hazard"] == "heat"
    if data["predicted"]:
        assert data["forecast_origin"] == "external"
        assert "Open-Meteo" in data["note"]
        assert "trained heat model" in data["note"]
        assert data["predicted"][0]["unit"] == "°C"
        assert data["predicted"][0]["interval_low"] == data["predicted"][0]["median"]
    else:
        assert data["predicted"] is None
        assert data["note"] == "heat is observed against thresholds and is not ML-predicted"
    assert data["thresholds"]["unit"] == "°C"
    assert data["thresholds"]["primary_threshold"] == 40.0
    assert len(data["observed"]) > 0
    assert data["observed"][0]["unit"] == "°C"
