"""Grounded insight assistant: warehouse answers only, no invented numbers."""

from fastapi.testclient import TestClient

from db import safe_query
from main import app

client = TestClient(app)


def test_temperature_answer_matches_warehouse():
    rows = safe_query(
        """
        SELECT temperature_2m_c
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND temperature_2m_c IS NOT NULL
        ORDER BY timestamp_utc DESC
        LIMIT 1
        """
    )
    response = client.post(
        "/api/insight/ask",
        json={"question": "What is the latest observed temperature in Karachi?"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "generated_at" in payload
    data = payload["data"]
    assert data["status"] == "answered"
    assert "observation" in data["answer"].lower()
    assert "not a heat forecast" in data["answer"].lower()
    assert any(item["source"] == "weather_hourly" for item in data["citations"])
    if rows:
        assert f"{float(rows[0]['temperature_2m_c']):.1f}" in data["answer"]


def test_unknown_question_invents_nothing():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What will the stock market do next week?"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "unknown"
    assert data["citations"] == []
    assert "°C" not in data["answer"]
    assert "mm" not in data["answer"]


def test_empty_question_is_rejected():
    response = client.post("/api/insight/ask", json={"question": "   "})
    assert response.status_code == 400


def test_unknown_city_is_not_replaced():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What is the temperature in NotACity?"},
    )
    data = response.json()["data"]
    assert data["status"] == "unavailable"
    assert "NotACity" in data["answer"] or "notacity" in data["answer"].lower()
    assert "°C" not in data["answer"]


def test_rain_answer_uses_stored_prediction_without_swapping_zero_median():
    rows = safe_query(
        """
        SELECT median, probability
        FROM predictions
        WHERE lower(city) = 'karachi' AND hazard_type = 'heavy_rain'
        ORDER BY forecast_time DESC
        LIMIT 1
        """
    )
    response = client.post(
        "/api/insight/ask",
        json={"question": "What is the next-hour rainfall forecast for Karachi?"},
    )
    data = response.json()["data"]
    assert data["status"] == "answered"
    assert "weather_hourly" in data["answer"] or any(item["source"] == "predictions" for item in data["citations"])
    if rows and rows[0]["median"] is not None:
        median = float(rows[0]["median"])
        assert f"{median:.3f}" in data["answer"]
        if rows[0]["probability"] is not None and median == 0.0:
            assert f"{float(rows[0]['probability']):.3f} mm/h" not in data["answer"]


def test_documents_are_not_quoted_when_unparsed():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What do the NDMA documents say about losses?"},
    )
    data = response.json()["data"]
    assert data["status"] in {"answered", "unavailable"}
    if data["status"] == "answered":
        assert "not parsed" in data["answer"].lower() or "not extracted" in data["answer"].lower()
        assert "document_catalog" in {item["source"] for item in data["citations"]}


def test_coverage_does_not_claim_every_area_works():
    response = client.post(
        "/api/insight/ask",
        json={"question": "Which impact areas can be forecast?"},
    )
    data = response.json()["data"]
    assert data["status"] == "answered"
    assert "unsupported" in data["answer"].lower()
    assert "economic" in data["answer"]


def test_weather_question_does_not_cite_ndma_contingency():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What's the weather today in Karachi?"},
    )
    data = response.json()["data"]
    assert data["supported"] is False
    sources = {item["source"] for item in data["citations"]}
    titles = " ".join(str(item.get("title") or "") for item in data["citations"]).lower()
    details = " ".join(str(item.get("detail") or "") for item in data["citations"]).lower()
    assert "anticipatory" not in titles
    assert "contingency" not in titles
    assert "anticipatory" not in details
    assert "document_catalog" not in sources
    if data["status"] == "answered":
        assert "weather table" in data["answer"].lower()
        assert data["facts"]
        assert data["data_rows"]


def test_heat_health_cites_heat_document_and_shows_emergency_line():
    response = client.post(
        "/api/insight/ask",
        json={"question": "Heat stroke risk with the current Karachi temperature?"},
    )
    data = response.json()["data"]
    assert data["safety_related"] is True
    assert data["limitations"]
    assert "1736" in data["limitations"]
    assert "1122" in data["limitations"]
    if data["status"] == "answered":
        doc_titles = [
            str(item.get("title") or "").lower()
            for item in data["citations"]
            if item.get("source") == "document_catalog"
        ]
        assert data["supported"] is True
        assert doc_titles
        assert any("weather advisory" in title or "heat" in title for title in doc_titles)
        assert not any("anticipatory" in title for title in doc_titles)


def test_off_topic_question_returns_supported_false():
    response = client.post(
        "/api/insight/ask",
        json={"question": "What will the stock market do next week?"},
    )
    data = response.json()["data"]
    assert data["status"] == "unknown"
    assert data["supported"] is False
    assert data["citations"] == []
    assert "°C" not in data["answer"]
