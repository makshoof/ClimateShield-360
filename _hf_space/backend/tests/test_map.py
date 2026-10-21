"""
Pytest test suite for ClimateShield 360 Risk Map API endpoints.
Tests:
- GET /api/map/zones?hazard=heat|rain|combined
- GET /api/map/facilities?types=hospital,school,shelter
- GET /api/map/zone/{zone_id}
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_get_map_zones_default_combined():
    """Verify GET /api/map/zones returns GeoJSON FeatureCollection with required contract fields."""
    response = client.get("/api/map/zones")
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    assert "generated_at" in payload
    assert "is_sample" in payload
    assert isinstance(payload["is_sample"], bool)

    fc = payload["data"]
    assert fc["type"] == "FeatureCollection"
    assert "features" in fc
    assert len(fc["features"]) >= 7  # All 7 Karachi administrative zones

    valid_risk_levels = {"Low", "Moderate", "High", "Severe"}

    for feat in fc["features"]:
        assert feat["type"] == "Feature"
        assert "id" in feat
        assert "geometry" in feat
        assert feat["geometry"]["type"] == "Polygon"
        assert len(feat["geometry"]["coordinates"]) > 0

        props = feat["properties"]
        assert "zone_id" in props
        assert "name" in props
        assert props["hazard_type"] == "combined"
        assert props["risk_level"] in valid_risk_levels
        assert 0.0 <= props["probability"] <= 1.0
        assert isinstance(props["interval"], list)
        assert len(props["interval"]) == 2
        assert props["interval"][0] <= props["interval"][1]
        assert props["interval_low"] <= props["interval_high"]
        assert props["exposed_population"] > 0
        assert props["facilities_count"] >= 0
        assert 0.0 <= props["vulnerability_score"] <= 1.0
        assert props["evidence_strength"] in {"low", "medium", "high"}


def test_get_map_zones_heat_hazard():
    """Verify GET /api/map/zones?hazard=heat returns heat hazard metrics."""
    response = client.get("/api/map/zones?hazard=heat")
    assert response.status_code == 200

    fc = response.json()["data"]
    for feat in fc["features"]:
        props = feat["properties"]
        assert props["hazard_type"] == "heat"
        assert 0.0 <= props["probability"] <= 1.0
        assert props["risk_level"] in {"Low", "Moderate", "High", "Severe"}
        assert len(props["interval"]) == 2


def test_get_map_zones_rain_hazard():
    """Verify GET /api/map/zones?hazard=rain returns heavy rain metrics."""
    response = client.get("/api/map/zones?hazard=rain")
    assert response.status_code == 200

    fc = response.json()["data"]
    for feat in fc["features"]:
        props = feat["properties"]
        assert props["hazard_type"] == "rain"
        assert 0.0 <= props["probability"] <= 1.0
        assert props["risk_level"] in {"Low", "Moderate", "High", "Severe"}
        assert len(props["interval"]) == 2


def test_map_rain_follows_observed_weather_not_seeded_exposure():
    """
    Seeded exposure_index marks Malir/Korangi Severe for heavy_rain with no weather time.
    Map rain colors must follow Karachi weather_hourly (dry window => Low).
    """
    from datetime import datetime, timezone, timedelta
    from db import safe_query
    from hazard_levels import rain_level

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    rows = safe_query(
        """
        SELECT MAX(precipitation_mm) AS max_hour_mm
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND timestamp_utc >= ?
        """,
        [since],
    )
    max_hour = rows[0].get("max_hour_mm") if rows else None
    expected = rain_level(None if max_hour is None else float(max_hour))

    response = client.get("/api/map/zones?hazard=rain")
    assert response.status_code == 200
    levels = {f["properties"]["risk_level"] for f in response.json()["data"]["features"]}
    assert levels == {expected}
    # Dry Karachi must not keep seeded Severe/High district ranks.
    if expected == "Low":
        assert "Severe" not in levels
        assert "High" not in levels


def test_get_facilities_all():
    """Verify GET /api/map/facilities returns all facilities as GeoJSON Points."""
    response = client.get("/api/map/facilities")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload["is_sample"], bool)
    fc = payload["data"]
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) >= 15

    for feat in fc["features"]:
        assert feat["type"] == "Feature"
        assert feat["geometry"]["type"] == "Point"
        coords = feat["geometry"]["coordinates"]
        assert len(coords) == 2
        lon, lat = coords
        # Karachi coordinates roughly 66.8 - 67.5 lon, 24.7 - 25.2 lat
        assert 66.0 <= lon <= 68.0
        assert 24.0 <= lat <= 26.0

        props = feat["properties"]
        assert "facility_id" in props
        assert "name" in props
        assert "type" in props
        assert "zone_id" in props


def test_get_facilities_filter_types():
    """Live warehouse health_facilities maps hospitals; school/shelter are not invented."""
    response = client.get("/api/map/facilities?types=hospital,school,shelter")
    assert response.status_code == 200

    fc = response.json()["data"]
    assert len(fc["features"]) >= 1
    types_found = {feat["properties"]["type"] for feat in fc["features"]}
    assert "hospital" in types_found
    # Do not require school/shelter — those layers are absent from health_facilities.


def test_get_facilities_single_type():
    """Verify filtering for only hospitals."""
    response = client.get("/api/map/facilities?types=hospital")
    assert response.status_code == 200

    fc = response.json()["data"]
    assert len(fc["features"]) >= 5
    for feat in fc["features"]:
        assert feat["properties"]["type"] == "hospital"


def test_get_zone_detail_success():
    """Verify GET /api/map/zone/{zone_id} returns partitioned dossier for valid zone."""
    response = client.get("/api/map/zone/KHI-SOUTH")
    assert response.status_code == 200

    payload = response.json()
    assert isinstance(payload["is_sample"], bool)
    data = payload["data"]

    assert data["zone_id"] == "KHI-SOUTH"
    assert "Karachi South" in data["name"]

    # 1. Hazard Tab
    hazard = data["hazard"]
    assert 0.0 <= hazard["probability"] <= 1.0
    assert len(hazard["interval"]) == 2
    assert hazard["interval_low"] <= hazard["interval_high"]
    assert hazard["baseline_value"] is not None
    assert hazard["baseline_value"] >= 0
    # wbgt_celsius field may carry observed air temp; rainfall is observed 6h sum
    assert hazard["rainfall_6h_mm"] is not None
    assert hazard["rainfall_6h_mm"] >= 0
    assert hazard["warning_label"] is not None

    # 2. Exposure Tab
    exposure = data["exposure"]
    assert exposure["exposed_population"] > 0
    assert exposure["facilities_count"] > 0
    assert exposure["demographics"] is not None
    assert exposure["demographics"]["children_under_5"] > 0
    assert exposure["demographics"]["elderly_65_plus"] > 0
    assert exposure["demographics"]["informal_settlements_pct"] > 0
    assert len(exposure["critical_facilities"]) > 0

    # 3. Vulnerability Tab
    vuln = data["vulnerability"]
    assert 0.0 <= vuln["vulnerability_score"] <= 1.0
    assert vuln["risk_level"] in {"Low", "Moderate", "High", "Severe"}
    assert vuln["heat_risk_level"] in {"Low", "Moderate", "High", "Severe"}
    assert vuln["rain_risk_level"] in {"Low", "Moderate", "High", "Severe"}

    # 4. Evidence Tab
    evidence = data["evidence"]
    assert evidence["evidence_strength"] in {"low", "medium", "high"}
    assert evidence["sources_count"] > 0
    assert len(evidence["sources"]) > 0
    for src in evidence["sources"]:
        assert "source" in src
        assert "row_ids" in src
        assert len(src["source"]) > 0
        assert len(src["row_ids"]) > 0


def test_get_zone_detail_case_insensitivity():
    """Verify lowercase zone_id works identically."""
    response = client.get("/api/map/zone/khi-east")
    assert response.status_code == 200
    assert response.json()["data"]["zone_id"] == "KHI-EAST"


def test_get_zone_detail_not_found():
    """Verify 404 error returned for unknown zone ID."""
    response = client.get("/api/map/zone/UNKNOWN-ZONE-99")
    assert response.status_code == 404
    error_data = response.json()
    assert "error" in error_data or "detail" in error_data
