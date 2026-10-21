"""Unit tests for auto hourly ingest supervisor (no live network)."""

from datetime import datetime, timedelta, timezone
from unittest import mock

from hourly_supervisor import _needs_ingest, _stale_minutes


def test_stale_minutes_default():
    assert _stale_minutes() >= 1


def test_needs_ingest_when_no_timestamp(monkeypatch):
    monkeypatch.setattr("hourly_supervisor._latest_weather_age_minutes", lambda: None)
    assert _needs_ingest() is True


def test_needs_ingest_when_old(monkeypatch):
    monkeypatch.setattr("hourly_supervisor._latest_weather_age_minutes", lambda: 120.0)
    monkeypatch.setenv("CLIMATESHIELD_INGEST_STALE_MINUTES", "55")
    assert _needs_ingest() is True


def test_skips_ingest_when_fresh(monkeypatch):
    monkeypatch.setattr("hourly_supervisor._latest_weather_age_minutes", lambda: 10.0)
    monkeypatch.setenv("CLIMATESHIELD_INGEST_STALE_MINUTES", "55")
    assert _needs_ingest() is False


def test_run_ingest_once_invokes_cli(monkeypatch, tmp_path):
    from hourly_supervisor import run_ingest_once
    import hourly_supervisor as hs

    monkeypatch.setattr(hs, "PIPELINE_DIR", tmp_path)
    (tmp_path / "climateshield").mkdir()
    # PIPELINE_DIR must exist as a dir — already tmp_path
    calls = {}

    def fake_run(cmd, cwd=None, check=False, capture_output=True, text=True, timeout=None):
        calls["cmd"] = cmd
        calls["cwd"] = cwd
        return mock.Mock(returncode=0, stdout="ok", stderr="")

    monkeypatch.setattr(hs.subprocess, "run", fake_run)
    code = run_ingest_once()
    assert code == 0
    assert calls["cmd"][-2:] == ["ingest-hourly", "--once"]
    assert calls["cwd"] == str(tmp_path)
