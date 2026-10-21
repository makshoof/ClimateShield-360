"""
Unit and integration tests for GET /api/impacts/{impact_area} endpoint.
Adheres to doc/AGENT_RULES.md:
- Never hard-code outputs
- Standard envelope: {data, generated_at, is_sample}
- Rule 2: No synthetic data presented as real; producers & economic are limited evidence
- Proper error response for unknown domains
"""

import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_all_impacts():
    """Verify GET /api/impacts returns all eight impact domains in standard envelope."""
    response = client.get("/api/impacts")
    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "generated_at" in body
    assert "is_sample" in body
    assert isinstance(body["data"], list)
    assert len(body["data"]) == 8
    areas = [d["impact_area"] for d in body["data"]]
    assert "physical" in areas
    assert "environmental" in areas
    assert "producers" in areas
    assert "economic" in areas
    assert "public_health" in areas
    assert "infrastructure" in areas
    assert "social" in areas
    assert "emergency_response" in areas


def test_physical_impact():
    """Physical from weather extremes and flood return periods, with time series."""
    response = client.get("/api/impacts/physical?city=Karachi")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "physical"
    assert data["supported_data"] is True
    assert data["evidence_level"] == "measured"
    assert data["coverage"] > 0
    assert len(data["indicators"]) > 0
    indicator_names = [i["name"] for i in data["indicators"]]
    assert any("Extreme Heat" in name for name in indicator_names)
    assert any("Return Flood" in name or "RP10" in name for name in indicator_names)
    # Time series must exist
    assert data["time_series"] is not None
    assert len(data["time_series"]["points"]) > 0
    # Limitations and sources
    assert len(data["source_names"]) >= 2
    assert "flood" in data["limitations"].lower()


def test_environmental_impact():
    """Environmental from soil moisture and rain totals, with hourly time series."""
    response = client.get("/api/impacts/environmental?city=Karachi")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "environmental"
    assert data["supported_data"] is True
    assert data["evidence_level"] == "measured"
    assert len(data["indicators"]) > 0
    indicator_names = [i["name"] for i in data["indicators"]]
    assert any("Soil Moisture" in name for name in indicator_names)
    assert any("Precipitation" in name for name in indicator_names)
    # Time series must exist
    assert data["time_series"] is not None
    assert len(data["time_series"]["points"]) > 0
    assert "soil_moisture_0_7cm" in data["time_series"]["points"][0]["metrics"]


def test_producers_limited_evidence():
    """Producers is Limited Evidence because crop data was excluded by quality checks."""
    response = client.get("/api/impacts/producers")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "producers"
    assert data["supported_data"] is False
    assert data["evidence_level"] == "limited"
    assert data["coverage"] == 0.0
    # Must have no numbers (empty indicators)
    assert data["indicators"] == []
    assert data["time_series"] is None
    # Limitation text explains exclusion
    assert "quality" in data["limitations"].lower() or "exclude" in data["limitations"].lower()


def test_economic_limited_evidence():
    """Economic is Limited Evidence because no direct damage rows exist in warehouse."""
    response = client.get("/api/impacts/economic")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "economic"
    assert data["supported_data"] is False
    assert data["evidence_level"] == "limited"
    assert data["coverage"] == 0.0
    assert data["indicators"] == []
    assert data["time_series"] is None
    assert "economic" in data["limitations"].lower() or "warehouse" in data["limitations"].lower()


def test_public_health_hospital_access_only():
    """Public Health from hospital access only (no health outcomes data)."""
    response = client.get("/api/impacts/public_health")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "public_health"
    assert data["supported_data"] is True
    assert data["evidence_level"] == "indicator-based"
    assert len(data["indicators"]) > 0
    indicator_names = [i["name"] for i in data["indicators"]]
    assert any("Hospital Access" in name for name in indicator_names)
    # No health outcomes data disclaimer in limitations
    assert "no health outcome" in data["limitations"].lower() or "epidemiological" in data["limitations"].lower()
    assert data["time_series"] is None


def test_public_health_slug_hyphen():
    """Test public-health with hyphen alias."""
    response = client.get("/api/impacts/public-health")
    assert response.status_code == 200
    assert response.json()["data"]["impact_area"] == "public_health"


def test_infrastructure_impact():
    """Infrastructure from OSM roads (RAI) and hospital access."""
    response = client.get("/api/impacts/infrastructure")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "infrastructure"
    assert data["supported_data"] is True
    assert data["evidence_level"] == "indicator-based"
    assert len(data["indicators"]) > 0
    indicator_names = [i["name"] for i in data["indicators"]]
    assert any("Access Index" in name or "RAI" in name for name in indicator_names)
    assert any("Road Access" in name for name in indicator_names)


def test_social_impact():
    """Social from PBS population and vulnerability."""
    response = client.get("/api/impacts/social")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "social"
    assert data["supported_data"] is True
    assert data["evidence_level"] == "indicator-based"
    assert len(data["indicators"]) > 0
    indicator_names = [i["name"] for i in data["indicators"]]
    assert any("Population" in name for name in indicator_names)
    assert any("Dependency Ratio" in name for name in indicator_names)
    assert any("Children" in name for name in indicator_names)


def test_emergency_response_impact():
    """Emergency Response from facility counts."""
    response = client.get("/api/impacts/emergency_response")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "emergency_response"
    assert data["supported_data"] is True
    assert data["evidence_level"] == "indicator-based"
    assert len(data["indicators"]) > 0
    indicator_names = [i["name"] for i in data["indicators"]]
    assert any("Hospital" in name for name in indicator_names)
    assert any("Shelter" in name or "Disaster" in name for name in indicator_names)


def test_district_filtered_query():
    """Verify district_id filter works for Karachi district."""
    response = client.get("/api/impacts/social?city=Karachi&district_id=PK721")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["impact_area"] == "social"
    assert len(data["indicators"]) > 0
    # Population should be positive
    total_pop_ind = next(i for i in data["indicators"] if "Population" in i["name"])
    assert total_pop_ind["value"] > 0


def test_unknown_impact_area():
    """Invalid impact area returns 404."""
    response = client.get("/api/impacts/unknown_sector")
    assert response.status_code == 404
    assert "error" in response.json() or "detail" in response.json()
