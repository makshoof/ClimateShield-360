"""
Pytest suite for Pipeline & Freshness API endpoints and status computation edge cases.
Tests:
- GET /api/status
- GET /api/freshness
- GET /api/runs
- GET /api/model-eval
- Edge cases: no runs, late run (>90m), stale source (>3x), late source (<=3x), fresh source (<=1x).
"""

from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
import sys
from pathlib import Path
import pytest
import duckdb

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
import db

client = TestClient(app)


def test_status_endpoint_nominal():
    """Verify GET /api/status returns latest run, is_late, next scheduled run, hourly evidence, and error logs."""
    response = client.get("/api/status")
    assert response.status_code == 200

    payload = response.json()
    assert "data" in payload
    assert "is_sample" in payload
    data = payload["data"]

    # Latest successful run (strictly from run_status)
    if data["latest_successful_run"] is not None:
        assert data["latest_successful_run"]["status"] == "success"
        assert "started_at" in data["latest_successful_run"]

    assert "quality_summary" in data

    # Next scheduled run (read from Prefect schedule or status row, else None)
    if data["next_scheduled_run"] is not None:
        assert "source" in data["next_scheduled_run"]
        assert "display_text" in data["next_scheduled_run"]

    # Hourly evidence panel: runs in the last 24h
    assert "hourly_evidence" in data
    assert data["hourly_evidence"] is not None
    assert "runs_last_24h" in data["hourly_evidence"]
    assert "success_count" in data["hourly_evidence"]
    assert "failed_count" in data["hourly_evidence"]
    assert "has_runs" in data["hourly_evidence"]

    # Error logs list
    assert "error_logs" in data
    assert isinstance(data["error_logs"], list)

    # Model version and evaluation status
    assert "model_version" in data
    assert "evaluation_status" in data


def test_freshness_endpoint_computation():
    """Verify GET /api/freshness returns sources with computed SLA status."""
    response = client.get("/api/freshness")
    assert response.status_code == 200

    payload = response.json()
    data = payload["data"]
    sources = data["sources"]
    assert len(sources) >= 1

    # Verify that each source has computed_status matching the contract
    for s in sources:
        assert s["computed_status"] in ["Fresh", "Late", "Stale"]

    summary = data["summary"]
    assert summary["total"] == len(sources)


def test_runs_history_endpoint():
    """Verify GET /api/runs?hours=24 returns 24h history strictly from run_status."""
    response = client.get("/api/runs?hours=24")
    assert response.status_code == 200

    payload = response.json()
    runs = payload["data"]
    assert isinstance(runs, list)
    if len(runs) > 0:
        first = runs[0]
        assert "run_id" in first
        assert "started_at" in first
        assert "status" in first


def test_model_eval_endpoint_and_weakest_group():
    """Verify GET /api/model-eval returns evaluations with weakest group flagged."""
    response = client.get("/api/model-eval")
    assert response.status_code == 200

    payload = response.json()
    data = payload["data"]
    evaluations = data["evaluations"]
    assert len(evaluations) >= 1

    weakest = data["weakest_group"]
    if weakest:
        assert weakest["is_weakest"] is True


# --- Edge Case Tests: Mocking or Temporary DuckDB Warehouse ---

def test_status_edge_case_no_runs(monkeypatch, tmp_path):
    """Edge Case: When run_status has no rows, is_late must be True and status='failed'."""
    temp_db = tmp_path / "empty_runs.duckdb"
    con = duckdb.connect(str(temp_db))
    con.execute("CREATE TABLE _is_sample (is_sample BOOLEAN); INSERT INTO _is_sample VALUES (TRUE);")
    con.execute("CREATE TABLE run_status (run_id VARCHAR, started_at TIMESTAMP, finished_at TIMESTAMP, status VARCHAR, notes VARCHAR);")
    con.execute("CREATE TABLE quality_log (logged_at TIMESTAMP, source_name VARCHAR, rule VARCHAR, action VARCHAR, rows_affected INT, explanation VARCHAR);")
    con.close()

    monkeypatch.setattr(db, "get_db_path", lambda: temp_db)
    db.clear_query_cache()

    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["latest_successful_run"] is None
    assert data["is_late"] is True
    assert data["status_indicator"] == "failed"


def test_status_edge_case_late_run(monkeypatch, tmp_path):
    """Edge Case: When latest successful run was 120m ago (>90m), is_late must be True and status='late'."""
    temp_db = tmp_path / "late_run.duckdb"
    con = duckdb.connect(str(temp_db))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    two_hours_ago = now - timedelta(minutes=120)

    con.execute("CREATE TABLE _is_sample (is_sample BOOLEAN); INSERT INTO _is_sample VALUES (TRUE);")
    con.execute("CREATE TABLE run_status (run_id VARCHAR, started_at TIMESTAMP, finished_at TIMESTAMP, status VARCHAR, notes VARCHAR);")
    con.execute("INSERT INTO run_status VALUES ('RUN-LATE', ?, ?, 'success', 'Late run');", [two_hours_ago, two_hours_ago + timedelta(seconds=10)])
    con.execute("CREATE TABLE quality_log (logged_at TIMESTAMP, source_name VARCHAR, rule VARCHAR, action VARCHAR, rows_affected INT, explanation VARCHAR);")
    con.close()

    monkeypatch.setattr(db, "get_db_path", lambda: temp_db)
    db.clear_query_cache()

    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["latest_successful_run"] is not None
    assert data["is_late"] is True
    assert data["status_indicator"] == "late"
    assert data["minutes_since_last_success"] >= 115.0


def test_freshness_edge_case_stale_and_fresh(monkeypatch, tmp_path):
    """
    Edge Case: Verify status thresholds:
    - Fresh: <= 1.0x expected_every_minutes
    - Late: <= 3.0x expected_every_minutes
    - Stale: > 3.0x expected_every_minutes
    """
    temp_db = tmp_path / "freshness_test.duckdb"
    con = duckdb.connect(str(temp_db))
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Source 1: Fresh (10m ago, expected 30m -> 0.33x)
    # Source 2: Late (45m ago, expected 30m -> 1.5x)
    # Source 3: Stale (100m ago, expected 30m -> 3.33x)
    con.execute("CREATE TABLE _is_sample (is_sample BOOLEAN); INSERT INTO _is_sample VALUES (TRUE);")
    con.execute("CREATE TABLE source_freshness (source_name VARCHAR, publisher VARCHAR, licence VARCHAR, last_fetched_at TIMESTAMP, expected_every_minutes INT, status VARCHAR);")
    con.execute("""
        INSERT INTO source_freshness VALUES
        ('Feed Fresh', 'Pub A', 'Open', ?, 30, 'fresh'),
        ('Feed Late', 'Pub B', 'Open', ?, 30, 'fresh'),
        ('Feed Stale', 'Pub C', 'Open', ?, 30, 'fresh');
    """, [
        now - timedelta(minutes=10),
        now - timedelta(minutes=45),
        now - timedelta(minutes=100),
    ])
    con.close()

    monkeypatch.setattr(db, "get_db_path", lambda: temp_db)
    db.clear_query_cache()

    response = client.get("/api/freshness")
    assert response.status_code == 200
    sources = response.json()["data"]["sources"]

    source_map = {s["source_name"]: s for s in sources}
    assert source_map["Feed Fresh"]["computed_status"] == "Fresh"
    assert source_map["Feed Late"]["computed_status"] == "Late"
    assert source_map["Feed Stale"]["computed_status"] == "Stale"
