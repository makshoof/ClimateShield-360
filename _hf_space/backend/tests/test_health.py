"""
Pytest test suite for ClimateShield 360 backend core endpoints.
Verifies /api/health and /api/meta, response envelopes, and error handling.
"""

from fastapi.testclient import TestClient
import sys
from pathlib import Path

# Add backend directory to sys.path for direct imports
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_health_endpoint():
    """Verify /api/health responds with 200 and required contract envelope."""
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.json()
    assert "data" in data
    assert "generated_at" in data
    assert "is_sample" in data

    health = data["data"]
    assert health["status"] == "ok"
    assert health["db_connected"] is True
    assert isinstance(health["duckdb_version"], str)
    assert "run_status" in health["tables_found"]
    if data["is_sample"]:
        assert "_is_sample" in health["tables_found"]


def test_meta_endpoint():
    """Verify /api/meta responds with app info, sample indicator, and last run summary."""
    response = client.get("/api/meta")
    assert response.status_code == 200

    data = response.json()
    assert "data" in data
    assert "generated_at" in data
    assert "is_sample" in data
    assert isinstance(data["is_sample"], bool)

    meta = data["data"]
    assert meta["app_name"] == "ClimateShield 360 Karachi"
    assert meta["timezone_stored"] == "UTC"
    assert meta["timezone_display"] == "PKT (UTC+5)"
    assert meta["last_run"] is not None
    assert meta["last_run"]["run_id"] is not None
    assert meta["last_run"]["status"] == "success"


def test_cors_headers():
    """Verify CORS preflight / origin headers for local frontend."""
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
    }
    response = client.options("/api/health", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
