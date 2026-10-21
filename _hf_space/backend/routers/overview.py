"""
Overview and Priorities router for ClimateShield 360 Karachi.
Follows all conventions from doc/AGENT_RULES.md:
- Read-only DuckDB access
- UTC storage, PKT display (Rule 3)
- Explicit empty state handling (Rule 1)
- Standard envelope: {data, generated_at, is_sample}
- Rule-based reason strings strictly built from table fields (No LLM text)
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Query

from db import is_sample_database, safe_query
from forecasting.live_forecast import upcoming_hours
from hazard_levels import heat_level as _heat_level, rain_level as _rain_level
from schemas import (
    APIResponse,
    FreshnessMetricSummary,
    HazardMetricSummary,
    OverviewData,
    PredictionPoint,
    PriorityItem,
    SevereZonesMetricSummary,
)

router = APIRouter(tags=["Overview"])


def _action_title_for(hazard: str, level: str) -> str:
    """Deterministic rule-based action titles based strictly on hazard and risk level."""
    h = hazard.lower()
    lvl = level.capitalize()
    if h == "heat":
        if lvl == "Severe":
            return "Activate Emergency Cooling Stations & Mobile Water Bowsers"
        elif lvl == "High":
            return "Restock ORS & Medical Supplies at Critical Health Facilities"
        elif lvl == "Moderate":
            return "Issue Public Heat Advisory & Hydration Warnings"
        else:
            return "Routine Thermal Monitoring & Grid Inspection"
    else:  # heavy_rain or generic
        if lvl == "Severe":
            return "Pre-position De-watering Pumps & Clear Major Nullahs"
        elif lvl == "High":
            return "Deploy Rapid Drainage Response & Traffic Diversions"
        elif lvl == "Moderate":
            return "Clear Arterial Sluice Gates & Inspect Culverts"
        else:
            return "Standard Coastal & Drainage Watch"


@router.get("/overview", response_model=APIResponse[OverviewData])
def get_overview(
    range: str = Query("24h", pattern="^(24h|48h|7d)$", description="Prediction time horizon")
) -> APIResponse[OverviewData]:
    """
    Returns heat and rain hazard level (max risk across zones), count of zones at Severe,
    data freshness status, and the prediction series (probability, interval_low, interval_high, baseline_value)
    per hazard.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    is_sample = is_sample_database()

    # 1. Determine horizon cutoff
    if range == "24h":
        cutoff_utc = now_utc + timedelta(hours=24, minutes=5)
    elif range == "48h":
        cutoff_utc = now_utc + timedelta(hours=48, minutes=5)
    else:  # 7d
        cutoff_utc = now_utc + timedelta(days=7, minutes=5)

    # Hazard badges follow the Karachi observation, not the seeded exposure_index.
    # That table stores fixed demo ranks (Malir/Korangi "Severe") with no weather time.

    # Total zones count
    total_zones_rows = safe_query("SELECT COUNT(*) as count FROM zones;")
    total_zones_count = total_zones_rows[0]["count"] if total_zones_rows else 7

    # 4. Data freshness status
    freshness_sql = "SELECT source_name, status, last_fetched_at, expected_every_minutes FROM source_freshness;"
    freshness_rows = safe_query(freshness_sql)
    
    total_sources = len(freshness_rows)
    fresh_count = 0
    lagging_source: Optional[str] = None

    for f in freshness_rows:
        st = str(f.get("status", "")).lower()
        if st in ("fresh", "ok"):
            fresh_count += 1
        elif st in ("delayed", "late", "stale"):
            if not lagging_source:
                lagging_source = f.get("source_name")

    freshness_status = "Nominal"
    if total_sources > 0:
        integrity_pct = round((fresh_count / total_sources) * 100, 1)
        if fresh_count == total_sources:
            freshness_status = "Nominal"
        elif fresh_count / total_sources >= 0.7:
            freshness_status = "Nominal"
        else:
            freshness_status = "Degraded"
    else:
        integrity_pct = 100.0

    # 5. Hourly Open-Meteo forecast for the selected window. The stored LightGBM
    # row is one past hour and is not the horizon shown here.
    window_hours = 24 if range == "24h" else 48 if range == "48h" else 168
    live_hours, _, _ = upcoming_hours("Karachi", window_hours)
    pred_series: dict[str, List[PredictionPoint]] = {
        "heat": [],
        "heavy_rain": [],
    }
    aware_now = datetime.now(timezone.utc)
    for hour in live_hours:
        hours_ahead = max(0, int(round((hour.time_utc - aware_now).total_seconds() / 3600.0)))
        if hour.temperature_c is not None:
            temp = round(float(hour.temperature_c), 1)
            pred_series["heat"].append(
                PredictionPoint(
                    forecast_time=hour.time_utc,
                    hours_ahead=hours_ahead,
                    probability=0.0,
                    interval_low=temp,
                    interval_high=temp,
                    baseline_value=0.0,
                    hazard_type="heat",
                    median=temp,
                )
            )
        if hour.precipitation_mm is not None:
            precip = round(float(hour.precipitation_mm), 3)
            pred_series["heavy_rain"].append(
                PredictionPoint(
                    forecast_time=hour.time_utc,
                    hours_ahead=hours_ahead,
                    probability=1.0 if precip >= 2.5 else 0.0,
                    interval_low=precip,
                    interval_high=precip,
                    baseline_value=0.0,
                    hazard_type="heavy_rain",
                    median=precip,
                )
            )

    observed_since = now_utc - timedelta(hours=window_hours)
    # Thermal card = latest hourly observation (what it is right now), not the day's peak.
    temp_rows = safe_query(
        """
        SELECT
            MAX(temperature_2m_c) AS max_temp_c,
            ARG_MAX(temperature_2m_c, timestamp_utc) AS latest_temp_c,
            MAX(timestamp_utc) AS latest_temp_at,
            ARG_MAX(timestamp_utc, temperature_2m_c) AS max_temp_at
        FROM weather_hourly
        WHERE lower(city) = 'karachi'
          AND temperature_2m_c IS NOT NULL
          AND timestamp_utc >= ?
        """,
        [observed_since],
    )
    rain_rows = safe_query(
        """
        SELECT SUM(precipitation_mm) AS rain_mm, MAX(precipitation_mm) AS max_hour_mm
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND timestamp_utc >= ?
        """,
        [observed_since],
    )
    last_wet_rows = safe_query(
        """
        SELECT timestamp_utc, precipitation_mm
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND precipitation_mm > 0
        ORDER BY timestamp_utc DESC
        LIMIT 1
        """
    )
    max_temp = temp_rows[0].get("max_temp_c") if temp_rows else None
    latest_temp = temp_rows[0].get("latest_temp_c") if temp_rows else None
    rain_total = rain_rows[0].get("rain_mm") if rain_rows else None
    max_hour = rain_rows[0].get("max_hour_mm") if rain_rows else None
    temp_time = temp_rows[0].get("latest_temp_at") if temp_rows else None
    peak_time = temp_rows[0].get("max_temp_at") if temp_rows else None
    heat_hazard_level = _heat_level(None if latest_temp is None else float(latest_temp))
    rain_hazard_level = _rain_level(None if max_hour is None else float(max_hour))
    # Weather is stored for the city point, not for each district, so no district is marked severe from this series.
    severe_count = 0
    severe_names: List[str] = []
    last_wet = ""
    if last_wet_rows:
        wet_mm = last_wet_rows[0].get("precipitation_mm")
        wet_time = last_wet_rows[0].get("timestamp_utc")
        if wet_mm is not None:
            last_wet = f" Last stored hour above 0 mm was {wet_mm} mm at {wet_time}."
    peak_note = ""
    if max_temp is not None and latest_temp is not None and float(max_temp) != float(latest_temp):
        peak_note = (
            f" 24h peak was {float(max_temp):.1f}°C"
            + (f" at {peak_time}." if peak_time is not None else ".")
        )

    overview_data = OverviewData(
        time_range=range,
        heat_hazard_level=heat_hazard_level,
        rain_hazard_level=rain_hazard_level,
        severe_zones_count=severe_count,
        total_zones_count=total_zones_count,
        severe_zone_names=severe_names,
        data_freshness_status=freshness_status,
        heat_summary=HazardMetricSummary(
            hazard_type="heat",
            hazard_level=heat_hazard_level,
            headline_value=float(latest_temp) if latest_temp is not None else None,
            unit="°C",
            source=(
                "Open-Meteo latest hourly 2m air temperature"
                + (f" at {temp_time}." if temp_time is not None else ".")
                + peak_note
                + " Thresholds: <35 Low, 35 Moderate, 40 High, 45 Severe. Not WBGT."
            ),
            label="Current observed air temperature, Karachi",
            kind="observed",
        ),
        rain_summary=HazardMetricSummary(
            hazard_type="heavy_rain",
            hazard_level=rain_hazard_level,
            headline_value=round(float(rain_total), 2) if rain_total is not None else None,
            unit=f"mm / {range}",
            source=(
                "Open-Meteo hourly precipitation at the Karachi point (24.851°N, 66.992°E). "
                "The badge uses the wettest hour in this window: below 1 mm is Low, "
                "1 mm is Moderate, 2.5 mm is High, and 10 mm is Severe. "
                "It is not the seeded district exposure table. Not an ECMWF or radar forecast."
                + last_wet
            ),
            label="Observed precipitation, Karachi",
            kind="observed",
        ),
        freshness_summary=FreshnessMetricSummary(
            status=freshness_status,
            fresh_sources=fresh_count,
            total_sources=total_sources,
            lagging_source=lagging_source,
            integrity_pct=integrity_pct,
        ),
        severe_summary=SevereZonesMetricSummary(
            severe_count=severe_count,
            total_count=total_zones_count,
            hotspots=severe_names,
            risk_level=rain_hazard_level,
        ),
        predictions_series=pred_series,
    )

    return APIResponse(
        data=overview_data,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample,
    )


@router.get("/priorities", response_model=APIResponse[List[PriorityItem]])
def get_priorities(
    range: Optional[str] = Query("24h", pattern="^(24h|48h|7d)$"),
    hazard: Optional[str] = Query(None, description="Optional hazard filter (heat, heavy_rain)"),
    limit: Optional[int] = Query(None, ge=1, le=100),
) -> APIResponse[List[PriorityItem]]:
    """
    Returns ranked zones from exposure_index by risk_level then exposed_population,
    each with a rule-based reason string built only from table fields
    (facilities_count, vulnerability_score, exposed_population). No LLM text.
    """
    is_sample = is_sample_database()

    query_sql = """
    SELECT 
        e.zone_id,
        z.name AS zone_name,
        e.hazard_type,
        e.risk_level,
        e.exposed_population,
        e.facilities_count,
        e.vulnerability_score,
        e.evidence_strength
    FROM exposure_index e
    LEFT JOIN zones z ON e.zone_id = z.zone_id
    """
    params = []

    if hazard:
        query_sql += " WHERE e.hazard_type = ? "
        params.append(hazard.lower())

    query_sql += """
    ORDER BY 
        CASE e.risk_level 
            WHEN 'Severe' THEN 1 
            WHEN 'High' THEN 2 
            WHEN 'Moderate' THEN 3 
            WHEN 'Low' THEN 4 
            ELSE 5 
        END ASC,
        e.exposed_population DESC;
    """

    rows = safe_query(query_sql, params)

    if limit and limit > 0:
        rows = rows[:limit]

    items: List[PriorityItem] = []
    for idx, r in enumerate(rows, start=1):
        vuln = float(r.get("vulnerability_score", 0.0))
        pop = int(r.get("exposed_population", 0))
        fac = int(r.get("facilities_count", 0))
        htype = str(r.get("hazard_type", "hazard"))
        rlvl = str(r.get("risk_level", "Moderate"))
        zname = str(r.get("zone_name") or r.get("zone_id"))

        # Rule-based reason string built ONLY from table fields:
        # facilities_count, vulnerability_score, exposed_population (Rule 1 / prompt requirement)
        reason = (
            f"Vulnerability score of {vuln:.2f} with {pop:,} residents exposed and "
            f"{fac} critical facilities at risk under {htype.replace('_', ' ')} conditions."
        )

        title = _action_title_for(htype, rlvl)
        score = round(vuln * 100, 1)

        items.append(
            PriorityItem(
                rank=idx,
                zone_id=r.get("zone_id", ""),
                zone_name=zname,
                hazard_type=htype,
                risk_level=rlvl,
                exposed_population=pop,
                facilities_count=fac,
                vulnerability_score=vuln,
                evidence_strength=str(r.get("evidence_strength", "medium")),
                score=score,
                action_title=title,
                reason=reason,
            )
        )

    return APIResponse(
        data=items,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample,
    )
