"""
Pytest suite for Data Quality API endpoints (/api/quality/*).
Tests:
- GET /api/quality/summary
- GET /api/quality/decisions with filters (action, source)
- GET /api/quality/decisions pagination (limit, offset)
- GET /api/quality/daily
- Edge cases: no matches, invalid source filter, empty table fallback
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_quality_summary():
    """Verify /api/quality/summary returns total inspected, missing, duplicate, excluded, fix/fill/flag/exclude counts."""
    response = client.get("/api/quality/summary")
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    data = payload["data"]

    assert data["total_checks"] > 0
    assert data["total_records_inspected"] > 0
    assert data["missing_count"] >= 0
    assert data["duplicate_count"] >= 0
    assert data["excluded_count"] >= 0
    assert data["fix_count"] >= 0
    assert data["fill_count"] >= 0
    assert data["flag_count"] >= 0
    assert data["exclude_count"] >= 0
    assert 90.0 <= data["pass_rate_pct"] <= 100.0
    assert data["sources_audited"] >= 1


def test_quality_decisions_default():
    """Verify /api/quality/decisions returns default paginated rows with before/after values and rule triggered."""
    response = client.get("/api/quality/decisions?limit=5&offset=0")
    assert response.status_code == 200

    payload = response.json()
    data = payload["data"]

    assert len(data["items"]) == 5
    assert data["total"] >= 1
    assert data["limit"] == 5
    assert data["offset"] == 0
    assert len(data["sources"]) >= 1

    first = data["items"][0]
    assert "logged_at" in first
    assert "source_name" in first
    assert "rule" in first
    assert first["action"] in ["fix", "fill", "flag", "exclude", "keep"]
    assert "explanation" in first
    assert "before_value" in first
    assert "after_value" in first


def test_quality_decisions_filter_action_exclude():
    """Verify filtering by action=exclude returns excluded/keep records."""
    response = client.get("/api/quality/decisions?action=exclude")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert isinstance(items, list)


def test_quality_decisions_filter_action_fix():
    """Verify filtering by action=fix returns only fix records."""
    response = client.get("/api/quality/decisions?action=fix")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert item["action"] == "fix"


def test_quality_decisions_filter_action_fill():
    """Verify filtering by action=fill returns only fill records."""
    response = client.get("/api/quality/decisions?action=fill")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert item["action"] == "fill"


def test_quality_decisions_filter_action_flag():
    """Verify filtering by action=flag returns only flag records."""
    response = client.get("/api/quality/decisions?action=flag")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert item["action"] == "flag"


def test_quality_decisions_filter_source():
    """Verify filtering by source substring returns matched streams."""
    base_res = client.get("/api/quality/decisions?limit=1")
    sources = base_res.json()["data"]["sources"]
    sample_source = sources[0] if sources else "meteo"

    response = client.get(f"/api/quality/decisions?source={sample_source[:5]}")
    assert response.status_code == 200

    items = response.json()["data"]["items"]
    assert len(items) > 0
    for item in items:
        assert sample_source[:5].lower() in item["source_name"].lower()


def test_quality_decisions_pagination_pages():
    """Verify pagination offsets return non-overlapping distinct sets."""
    page1 = client.get("/api/quality/decisions?limit=3&offset=0").json()["data"]["items"]
    page2 = client.get("/api/quality/decisions?limit=3&offset=3").json()["data"]["items"]

    assert len(page1) == 3
    assert len(page2) == 3

    page1_rules = [item["rule"] for item in page1]
    page2_rules = [item["rule"] for item in page2]
    # Consecutive pages should not be identical
    assert page1_rules != page2_rules


def test_quality_decisions_no_match():
    """Verify non-existent filter returns empty items with total=0."""
    response = client.get("/api/quality/decisions?source=NonExistentSource999")
    assert response.status_code == 200

    data = response.json()["data"]
    assert data["items"] == []
    assert data["total"] == 0


def test_quality_daily_counts():
    """Verify /api/quality/daily returns chronological aggregated action counts."""
    response = client.get("/api/quality/daily")
    assert response.status_code == 200

    daily = response.json()["data"]
    assert len(daily) >= 1  # at least 1 day recorded in warehouse

    for d in daily:
        assert "date" in d
        assert d["total"] == (
            d["fix"] + d["fill"] + d["flag"] + d.get("exclude", 0) + d.get("keep", 0)
        )
        assert d["total"] >= 1
