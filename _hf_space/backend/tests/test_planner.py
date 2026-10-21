"""
Tests for Emergency Action Planner API endpoint (GET /api/planner).
Verifies all requirements from doc/AGENT_RULES.md and user specifications:
1. Standard envelope {data, generated_at, is_sample}
2. Ranking order: risk level (Severe > High > Moderate > Low), then vulnerability, then exposed population
3. Reason fields: forecast probability, interval [low, high], baseline, population, facilities count, vulnerability score
4. Fixed rule-based suggested measures:
   - Heat -> heat warning and cooling support
   - Heavy Rain -> drainage inspection and flood preparedness
5. Provenance row_ids used per district
6. Resource gap flag where exposed population is high and facilities are few
7. Disclaimers: "Decision support only, not emergency dispatch instructions."
"""

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

SEVERITY_ORDER = {
    "Severe": 1,
    "High": 2,
    "Moderate": 3,
    "Low": 4,
}


def test_get_planner_heat_default():
    """Test default planner endpoint returns heat ranking and valid envelope."""
    response = client.get("/api/planner")
    assert response.status_code == 200
    body = response.json()

    assert "data" in body
    assert "generated_at" in body
    assert "is_sample" in body
    assert isinstance(body["is_sample"], bool)

    data = body["data"]
    assert data["hazard"] == "heat"
    assert data["range"] == "24h"
    assert data["operational_note"] == "Decision support only, not emergency dispatch instructions."

    districts = data["districts"]
    assert len(districts) > 0

    # Verify ranking order: risk_level, vulnerability_score DESC, exposed_population DESC
    for i in range(len(districts) - 1):
        cur = districts[i]
        nxt = districts[i + 1]

        cur_sev = SEVERITY_ORDER.get(cur["risk_level"], 99)
        nxt_sev = SEVERITY_ORDER.get(nxt["risk_level"], 99)

        if cur_sev == nxt_sev:
            if cur["vulnerability_score"] == nxt["vulnerability_score"]:
                assert cur["exposed_population"] >= nxt["exposed_population"]
            else:
                assert cur["vulnerability_score"] >= nxt["vulnerability_score"]
        else:
            assert cur_sev <= nxt_sev


def test_get_planner_heavy_rain_ranking():
    """Test heavy rain hazard ranking and ordering contract."""
    response = client.get("/api/planner?hazard=heavy_rain&range=48h")
    assert response.status_code == 200
    body = response.json()
    data = body["data"]

    assert data["hazard"] == "heavy_rain"
    assert data["range"] == "48h"
    assert data["city_forecast"]["origin"] == "open_meteo"
    assert data["city_forecast"]["display_unit"] == "mm"
    assert "LightGBM row is not used" in (data["city_forecast"]["note"] or "")

    districts = data["districts"]
    assert len(districts) > 0

    for i in range(len(districts) - 1):
        cur = districts[i]
        nxt = districts[i + 1]

        cur_sev = SEVERITY_ORDER.get(cur["risk_level"], 99)
        nxt_sev = SEVERITY_ORDER.get(nxt["risk_level"], 99)

        if cur_sev == nxt_sev:
            if cur["vulnerability_score"] == nxt["vulnerability_score"]:
                assert cur["exposed_population"] >= nxt["exposed_population"]
            else:
                assert cur["vulnerability_score"] >= nxt["vulnerability_score"]
        else:
            assert cur_sev <= nxt_sev


def test_planner_reason_fields():
    """Test that each district includes all required reason fields."""
    response = client.get("/api/planner?hazard=heat&range=24h")
    assert response.status_code == 200
    districts = response.json()["data"]["districts"]

    for d in districts:
        # Heat has no trained forecast. Do not accept a filled-in probability.
        assert d["forecast_probability"] is None
        assert d["interval_unit"] == "unavailable"

        # 2. Population, facilities count, vulnerability score
        assert isinstance(d["exposed_population"], int)
        assert d["exposed_population"] > 0
        assert isinstance(d["facilities_count"], int)
        assert d["facilities_count"] >= 0
        assert isinstance(d["vulnerability_score"], float)
        assert 0.0 <= d["vulnerability_score"] <= 1.0

        # 3. Deterministic rule-based reason summary
        assert d["reason_summary"]
        assert str(d["exposed_population"]) in d["reason_summary"].replace(",", "")

    city = response.json()["data"]["city_forecast"]
    assert city["origin"] == "open_meteo"
    assert city["display_value"] is not None
    assert city["display_unit"] == "°C"
    assert "Open-Meteo" in (city["note"] or "")


def test_planner_suggested_measures_heat():
    """Test fixed mapping for heat includes heat warning and cooling support."""
    response = client.get("/api/planner?hazard=heat")
    assert response.status_code == 200
    districts = response.json()["data"]["districts"]

    for d in districts:
        measures = d["suggested_measures"]
        assert len(measures) >= 4

        measure_titles = [m["title"].lower() for m in measures]
        measure_actions = [m["action"].lower() for m in measures]

        # Must include heat warning
        has_heat_warning = any("heat warning" in t or "heat health" in a for t, a in zip(measure_titles, measure_actions))
        assert has_heat_warning, f"Missing heat warning in district {d['district_id']}"

        # Must include cooling support
        has_cooling_support = any("cooling support" in t or "cooling" in a for t, a in zip(measure_titles, measure_actions))
        assert has_cooling_support, f"Missing cooling support in district {d['district_id']}"


def test_planner_suggested_measures_heavy_rain():
    """Test fixed mapping for heavy rain includes drainage inspection and flood preparedness."""
    response = client.get("/api/planner?hazard=heavy_rain")
    assert response.status_code == 200
    districts = response.json()["data"]["districts"]

    for d in districts:
        measures = d["suggested_measures"]
        assert len(measures) >= 4

        measure_titles = [m["title"].lower() for m in measures]
        measure_actions = [m["action"].lower() for m in measures]

        # Must include drainage inspection
        has_drainage = any("drainage inspection" in t or "drainage" in a for t, a in zip(measure_titles, measure_actions))
        assert has_drainage, f"Missing drainage inspection in district {d['district_id']}"

        # Must include flood preparedness
        has_flood_prep = any("flood preparedness" in t or "dewatering" in a for t, a in zip(measure_titles, measure_actions))
        assert has_flood_prep, f"Missing flood preparedness in district {d['district_id']}"


def test_planner_row_ids():
    """Test that verified row_ids are returned for each district."""
    response = client.get("/api/planner?hazard=heat")
    assert response.status_code == 200
    districts = response.json()["data"]["districts"]

    for d in districts:
        row_ids = d["row_ids"]
        assert isinstance(row_ids, list)
        assert len(row_ids) > 0
        # Check that row_ids conform to catalog conventions (FAC-, IND-, EXP-)
        assert any(r.startswith("FAC-") or r.startswith("IND-") or r.startswith("EXP-") for r in row_ids)


def test_planner_resource_gap_flag():
    """Test resource gap flag logic where exposed population is high and facilities are few."""
    response = client.get("/api/planner?hazard=heat")
    assert response.status_code == 200
    body = response.json()["data"]
    districts = body["districts"]
    resource_summary = body["resource_summary"]

    # Verify districts with known acute deficit (e.g. Malir, West, Korangi)
    gap_districts = [d for d in districts if d["resource_gap"]]
    non_gap_districts = [d for d in districts if not d["resource_gap"]]

    assert len(gap_districts) > 0
    assert len(non_gap_districts) > 0

    gap_ids = [d["district_id"] for d in gap_districts]
    assert "KHI-MALIR" in gap_ids or "KHI-WEST" in gap_ids

    # For gap districts, verify population_per_facility is high and details exist
    for d in gap_districts:
        assert d["resource_gap_details"]["is_gap"] is True
        assert d["resource_gap_details"]["population_per_facility"] >= 50000
        assert d["resource_gap_details"]["mitigation_action"]

    assert resource_summary["flagged_gap_districts_count"] == len(gap_districts)
    assert resource_summary["total_exposed_population"] > 0
    assert resource_summary["total_facilities_registered"] > 0


def test_planner_range_options():
    """Test 24h, 48h, and 7d horizons are supported."""
    for rng in ["24h", "48h", "7d"]:
        response = client.get(f"/api/planner?hazard=heat&range={rng}")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["range"] == rng
        assert data["city_forecast"]["time_range"] == rng
