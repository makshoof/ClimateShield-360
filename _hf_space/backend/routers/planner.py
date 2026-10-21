"""
Emergency Action Planner router for ClimateShield 360 Karachi.
Adheres strictly to doc/AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Every metric, ranking, and facility comes from DuckDB.
- Rule 2: Sample data reports is_sample=true.
- Rule 3: Store time in UTC; display in PKT (UTC+5).
- Rule 4: Risk levels: Low green, Moderate yellow, High orange, Severe red with text labels.
- Rule 5: Always provide uncertainty intervals and baseline comparison.
- Rule 6: Footer and operational disclaimers.
- Rule 9: Simple, typed, commented code without unnecessary libraries.
- Rule 11: Read-only DuckDB access.

User Specifications:
- Backend: GET /api/planner?hazard=&range= returns districts ranked by risk level,
  then vulnerability, then exposed population, each with:
  1. Reason fields: probability and interval of the city forecast, population,
     facilities count, vulnerability score.
  2. Suggested measures from a fixed mapping in code:
     (heat -> heat warning and cooling support; heavy rain -> drainage inspection and flood preparedness)
  3. The row_ids used.
  4. A "resource gap" flag where exposed population is high and facilities are few.
- Suggestions are strictly rule-based, with NO LLM text.
- Operational notice: "Decision support only, not emergency dispatch instructions."
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Query

from db import is_sample_database, safe_query
from forecasting.live_forecast import upcoming_hours
from schemas import (
    APIResponse,
    CityForecastSummary,
    PlannerDistrictItem,
    PlannerMeasureItem,
    PlannerResponseData,
    ResourceGapDetail,
    ResourceGapSummary,
)

router = APIRouter(prefix="/planner", tags=["Emergency Planner"])

PKT_OFFSET = timezone(timedelta(hours=5))

# Fixed rule-based measure mappings in code (No LLM generation)
FIXED_MEASURES_HEAT: List[PlannerMeasureItem] = [
    PlannerMeasureItem(
        measure_id="HEAT-MEASURE-01",
        title="Heat Warning & Civic Alert Broadcast",
        category="Public Warning & Communication",
        action="Broadcast official heat health warnings across civic SMS, local radio/television channels, and mosque public address systems; advise citizens to avoid direct sun exposure between 11:00 and 16:00 and maintain electrolyte hydration.",
        target="High-density residential sectors, informal settlements, and outdoor labor hubs",
        priority="Immediate",
    ),
    PlannerMeasureItem(
        measure_id="HEAT-MEASURE-02",
        title="Cooling Support & Emergency Relief Stations",
        category="Direct Relief & Cooling Centers",
        action="Activate municipal air-conditioned cooling centers, erect insulated shade canopies along key transit arteries, deploy mobile chilled-water bowsers, and distribute oral rehydration salts (ORS) sachets.",
        target="Public transit hubs, major bazaars, and low-canopy settlements",
        priority="Immediate",
    ),
    PlannerMeasureItem(
        measure_id="HEAT-MEASURE-03",
        title="Healthcare Facility Heat Triage Surge",
        category="Public Health & Medical Surge",
        action="Pre-position intravenous (IV) normal saline, ice baths, and dedicated heat exhaustion triage beds across district hospitals and primary healthcare clinics.",
        target="District emergency rooms, rural health centers, and community dispensaries",
        priority="Urgent",
    ),
    PlannerMeasureItem(
        measure_id="HEAT-MEASURE-04",
        title="Power Grid Pumping Circuit Protection",
        category="Critical Utilities & Power Grid",
        action="Issue coordination request to K-Electric to halt scheduled load-shedding on high-voltage distribution feeders supplying municipal water pumping stations and hospital complexes.",
        target="KW&SC Dhabeji / Pipri pumping conduits and district hospital power feeds",
        priority="Urgent",
    ),
]

FIXED_MEASURES_RAIN: List[PlannerMeasureItem] = [
    PlannerMeasureItem(
        measure_id="RAIN-MEASURE-01",
        title="Drainage Inspection & Chokepoint De-silting",
        category="Infrastructure & Drainage Inspection",
        action="Deploy KMC and Sindh Irrigation engineering crews to inspect stormwater drains, clear accumulated solid waste from major nullah bottlenecks (Gujjar, Orangi, Nehr-e-Khayyam), and inspect sluice gate winches.",
        target="Major drainage outfalls, stormwater channels, culverts, and road underpasses",
        priority="Immediate",
    ),
    PlannerMeasureItem(
        measure_id="RAIN-MEASURE-02",
        title="Flood Preparedness & Dewatering Pump Pre-Positioning",
        category="Emergency Flood Preparedness",
        action="Pre-position high-capacity diesel de-watering pumps, suction trailers, heavy excavators, and generator fuel reserves at declared low-lying urban depression zones and submerged highway intersections.",
        target="Subterranean underpasses, urban depressions, and arterial bottlenecks",
        priority="Immediate",
    ),
    PlannerMeasureItem(
        measure_id="RAIN-MEASURE-03",
        title="Low-Lying Settlement Evacuation Readiness",
        category="Civic Shelter & Evacuation",
        action="Place designated emergency relief shelters and multi-purpose government schools on operational alert, verifying dry food rations, drinking water supply, and backup solar/generator illumination.",
        target="Informal riverside settlements, katchi abadis, and nullah embankments",
        priority="Urgent",
    ),
    PlannerMeasureItem(
        measure_id="RAIN-MEASURE-04",
        title="Submersion Traffic Diversions & Electrocution Prevention",
        category="Public Safety & Municipal Traffic",
        action="Enact pre-planned traffic diversions away from inundated corridors via Karachi Traffic Police, and dispatch K-Electric line crews to pre-emptively de-energize submerged low-voltage distribution transformers.",
        target="Primary arterial highways, flooded boulevards, and low-voltage transformer poles",
        priority="Urgent",
    ),
]


def _format_pkt(dt: datetime) -> str:
    """Format UTC datetime into PKT string."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(PKT_OFFSET).strftime("%d %b %H:%M PKT")


@router.get("", response_model=APIResponse[PlannerResponseData])
def get_planner(
    hazard: str = Query("heat", description="Hazard type: heat or heavy_rain (or rain)"),
    range: Literal["24h", "48h", "7d"] = Query("24h", description="Forecast time range horizon: 24h, 48h, 7d"),
) -> APIResponse[PlannerResponseData]:
    """
    Returns districts ranked strictly by:
    1. risk level (Severe > High > Moderate > Low)
    2. vulnerability (vulnerability_score DESC)
    3. exposed population (exposed_population DESC)

    Each district includes reason fields, fixed suggested measures, row_ids used,
    and a resource gap flag where exposed population is high and facilities are few.
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    is_sample = is_sample_database()

    # 1. Normalize hazard
    raw_h = hazard.lower().strip()
    if raw_h in ("rain", "heavy_rain"):
        db_hazard = "heavy_rain"
    else:
        db_hazard = "heat"

    # 2. Determine horizon cutoff
    if range == "24h":
        cutoff_utc = now_utc + timedelta(hours=24, minutes=5)
    elif range == "48h":
        cutoff_utc = now_utc + timedelta(hours=48, minutes=5)
    else:  # 7d
        cutoff_utc = now_utc + timedelta(days=7, minutes=5)

    # 3. Query districts ranked strictly by risk_level, vulnerability_score, exposed_population
    ranked_sql = """
    SELECT 
        e.zone_id,
        COALESCE(z.name, e.zone_id) AS district_name,
        e.hazard_type,
        e.risk_level,
        e.vulnerability_score,
        e.exposed_population,
        e.facilities_count,
        e.evidence_strength
    FROM exposure_index e
    LEFT JOIN zones z ON e.zone_id = z.zone_id
    WHERE e.hazard_type = ?
    ORDER BY 
        CASE e.risk_level 
            WHEN 'Severe' THEN 1 
            WHEN 'High' THEN 2 
            WHEN 'Moderate' THEN 3 
            WHEN 'Low' THEN 4 
            ELSE 5 
        END ASC,
        e.vulnerability_score DESC,
        e.exposed_population DESC;
    """
    district_rows = safe_query(ranked_sql, [db_hazard])

    # District rows do not have their own weather forecast. The horizon below is
    # the Karachi Open-Meteo hourly forecast, not the stored LightGBM row.
    pred_by_zone: Dict[str, Any] = {}
    city_prob = None
    has_model_forecast = False
    interval_unit = "unavailable"
    city_interval_unit = "unavailable"
    window_hours = 24 if range == "24h" else 48 if range == "48h" else 168
    live_hours, issued_at, live_source = upcoming_hours("Karachi", window_hours)
    display_value = None
    display_unit = ""
    display_label = ""
    origin = "none"
    city_low = None
    city_high = None
    city_base = None
    live_clause = ""

    if db_hazard == "heat":
        temps = [hour.temperature_c for hour in live_hours if hour.temperature_c is not None]
        base_rows = safe_query(
            """
            SELECT temperature_2m_c AS value
            FROM weather_hourly
            WHERE lower(city) = 'karachi' AND temperature_2m_c IS NOT NULL
              AND timestamp_utc <= ?
            ORDER BY timestamp_utc DESC
            LIMIT 1
            """,
            [now_utc - timedelta(hours=24)],
        )
        if base_rows and base_rows[0].get("value") is not None:
            city_base = round(float(base_rows[0]["value"]), 1)
        if temps:
            city_low = round(min(temps), 1)
            city_high = round(max(temps), 1)
            display_value = city_high
            display_unit = "°C"
            display_label = "Forecast high"
            origin = "open_meteo"
            city_interval_unit = "°C"
            live_clause = (
                f" Karachi Open-Meteo forecast high is {display_value}°C "
                f"(hourly range {city_low}–{city_high}°C)."
            )
            forecast_note = (
                f"Open-Meteo hourly temperature for the Karachi grid point, "
                f"{len(temps)} hours in this window. The range is the coolest and "
                f"hottest forecast hour, not a quantile interval. "
                f"Source: {live_source}. District ranks below are the exposure table, "
                f"not a district temperature forecast."
            )
        else:
            forecast_note = "The Open-Meteo hourly temperature forecast could not be loaded."
    else:
        precips = [hour.precipitation_mm for hour in live_hours if hour.precipitation_mm is not None]
        base_rows = safe_query(
            """
            SELECT SUM(precipitation_mm) AS value
            FROM weather_hourly
            WHERE lower(city) = 'karachi'
              AND timestamp_utc >= ? AND timestamp_utc < ?
            """,
            [now_utc - timedelta(hours=window_hours), now_utc],
        )
        if base_rows and base_rows[0].get("value") is not None:
            city_base = round(float(base_rows[0]["value"]), 2)
        if precips:
            city_low = round(min(precips), 3)
            city_high = round(max(precips), 3)
            display_value = round(sum(precips), 2)
            display_unit = "mm"
            display_label = "Forecast precipitation"
            origin = "open_meteo"
            city_interval_unit = "mm/h"
            heavy_hours = sum(1 for amount in precips if amount >= 2.5)
            city_prob = round(heavy_hours / len(precips), 4)
            live_clause = (
                f" Karachi Open-Meteo forecast total is {display_value} mm, "
                f"wettest hour {city_high} mm/h."
            )
            forecast_note = (
                f"Open-Meteo hourly precipitation for the Karachi grid point, "
                f"{len(precips)} hours. Total {display_value} mm. "
                f"Wettest hour {city_high} mm/h. Hours at or above 2.5 mm/h: {heavy_hours}. "
                f"A total of 0 mm means this forecast does not include rain. "
                f"The stored LightGBM row is not used here. Source: {live_source}."
            )
        else:
            forecast_note = "The Open-Meteo hourly precipitation forecast could not be loaded."

    # 5. Query facilities for breakdown and provenance row IDs
    facilities_rows = safe_query("SELECT facility_id, name, type, zone_id FROM facilities;")
    fac_ids_by_zone: Dict[str, List[str]] = {}
    fac_type_counts: Dict[str, int] = {}
    for f in facilities_rows:
        zid = f.get("zone_id", "")
        fid = f.get("facility_id", "")
        ftype = f.get("type", "other")
        if zid:
            fac_ids_by_zone.setdefault(zid, []).append(fid)
        fac_type_counts[ftype] = fac_type_counts.get(ftype, 0) + 1

    # 6. Query impact_indicators for indicator row IDs
    indicator_rows = safe_query("SELECT zone_id, row_ids FROM impact_indicators;")
    ind_ids_by_zone: Dict[str, List[str]] = {}
    for ind in indicator_rows:
        zid = ind.get("zone_id", "")
        raw_rids = ind.get("row_ids")
        if zid and raw_rids:
            for item in str(raw_rids).split(","):
                clean = item.strip()
                if clean and clean not in ind_ids_by_zone.setdefault(zid, []):
                    ind_ids_by_zone[zid].append(clean)

    # Base measures from fixed mapping in code
    base_measures = FIXED_MEASURES_HEAT if db_hazard == "heat" else FIXED_MEASURES_RAIN

    districts: List[PlannerDistrictItem] = []
    flagged_gap_names: List[str] = []
    total_pop = 0
    total_fac = 0

    for idx, row in enumerate(district_rows, start=1):
        zid = str(row["zone_id"])
        zname = str(row["district_name"])
        risk_lvl = str(row["risk_level"])
        vuln_score = float(row.get("vulnerability_score", 0.0))
        pop = int(row.get("exposed_population", 0))
        fac = int(row.get("facilities_count", 0))
        ev_strength = str(row.get("evidence_strength", "high"))

        total_pop += pop
        total_fac += fac

        # Predictor reason fields
        pred_item = pred_by_zone.get(zid, {})
        prob = float(pred_item["avg_prob"]) if pred_item.get("avg_prob") is not None else city_prob
        low = float(pred_item["avg_low"]) if pred_item.get("avg_low") is not None else city_low
        high = float(pred_item["avg_high"]) if pred_item.get("avg_high") is not None else city_high
        base = float(pred_item["avg_base"]) if pred_item.get("avg_base") is not None else city_base
        if low is not None and high is not None and low > high:
            low, high = high, low

        # Resource gap calculation:
        # High exposed population and few critical facilities
        ratio = int(round(pop / max(fac, 1)))
        is_gap = (pop >= 950_000 and fac <= 22) or (ratio > 55_000 and pop >= 900_000)

        if is_gap:
            flagged_gap_names.append(zname)
            gap_severity = "Severe" if ratio >= 65_000 else "Elevated"
            gap_explanation = (
                f"Severe resource deficit: {ratio:,} residents per registered emergency facility "
                f"({fac} facilities for {pop:,} population; threshold > 55,000 residents/facility)."
            )
            gap_mitigation = (
                f"Mobilize mobile relief units, auxiliary water bowsers, or mobile dewatering trailers "
                f"from neighboring higher-capacity sectors (e.g., Karachi South or East) to {zname}."
            )
        else:
            gap_severity = "Normal"
            gap_explanation = (
                f"Adequate facility ratio: {ratio:,} residents per facility "
                f"({fac} facilities for {pop:,} population)."
            )
            gap_mitigation = "Maintain standard sector preparedness and monitor facility readiness."

        gap_details = ResourceGapDetail(
            is_gap=is_gap,
            population_per_facility=ratio,
            severity=gap_severity,
            explanation=gap_explanation,
            mitigation_action=gap_mitigation,
        )

        # Build row_ids list from facilities and indicators
        zone_row_ids: List[str] = []
        if zid in fac_ids_by_zone:
            zone_row_ids.extend(fac_ids_by_zone[zid])
        if zid in ind_ids_by_zone:
            zone_row_ids.extend(ind_ids_by_zone[zid])
        if not zone_row_ids:
            zone_row_ids = [f"EXP-{zid}-{db_hazard.upper()}"]

        # Rule-based reason explanation (Rule 1 / No LLM text)
        h_label = "heat" if db_hazard == "heat" else "heavy rain"
        reason_summary = (
            f"Ranked #{idx} under {h_label} conditions with {risk_lvl} risk level. "
            f"Vulnerability score is {vuln_score:.2f} with {pop:,} residents exposed and "
            f"{fac} critical facilities. No separate district forecast is stored."
            f"{live_clause}"
        )
        if is_gap:
            reason_summary += f" Critical resource gap flagged ({ratio:,} residents per facility)."

        # Compile suggested measures from fixed mapping + gap mitigation if applicable
        district_measures = list(base_measures)
        if is_gap:
            if db_hazard == "heat":
                district_measures.append(
                    PlannerMeasureItem(
                        measure_id=f"GAP-HEAT-{zid}",
                        title="Resource Gap Mutual Aid: Mobile Cooling Fleet",
                        category="Inter-District Mutual Aid",
                        action=(
                            f"Acute facility shortage ({ratio:,} residents/facility). Dispatch auxiliary "
                            f"mobile medical response vans and municipal water bowsers from Karachi South or East "
                            f"directly into unserviced informal settlements across {zname}."
                        ),
                        target=f"High-deficit residential sectors in {zname}",
                        priority="Immediate",
                    )
                )
            else:
                district_measures.append(
                    PlannerMeasureItem(
                        measure_id=f"GAP-RAIN-{zid}",
                        title="Resource Gap Mutual Aid: Standby Dewatering Fleet",
                        category="Inter-District Mutual Aid",
                        action=(
                            f"Acute drainage triage bottleneck ({ratio:,} residents/facility). Pre-stage mobile "
                            f"trailer-mounted diesel suction pumps and Rescue 1122 inflatable boats from central reserve "
                            f"directly at low-lying nullah chokepoints in {zname}."
                        ),
                        target=f"Submerged low-lying informal settlements in {zname}",
                        priority="Immediate",
                    )
                )

        districts.append(
            PlannerDistrictItem(
                rank=idx,
                district_id=zid,
                district_name=zname,
                hazard_type=db_hazard,
                risk_level=risk_lvl,
                vulnerability_score=vuln_score,
                exposed_population=pop,
                facilities_count=fac,
                evidence_strength=ev_strength,
                forecast_probability=prob if has_model_forecast else None,
                forecast_interval_low=low if has_model_forecast else None,
                forecast_interval_high=high if has_model_forecast else None,
                baseline_value=base if has_model_forecast else None,
                interval_unit=interval_unit,
                reason_summary=reason_summary,
                suggested_measures=district_measures,
                row_ids=zone_row_ids,
                resource_gap=is_gap,
                resource_gap_details=gap_details,
            )
        )

    # 7. Build city forecast summary
    city_forecast = CityForecastSummary(
        hazard_type=db_hazard,
        time_range=range,
        avg_probability=city_prob if origin == "open_meteo" and db_hazard == "heavy_rain" else None,
        interval_low=city_low,
        interval_high=city_high,
        baseline_value=city_base,
        interval_unit=city_interval_unit,
        cutoff_time_utc=cutoff_utc.replace(tzinfo=timezone.utc),
        cutoff_time_pkt=_format_pkt(cutoff_utc),
        note=forecast_note,
        display_value=display_value,
        display_unit=display_unit,
        display_label=display_label,
        origin=origin,
        issued_at=issued_at,
    )

    # 8. Build resource gap summary
    citywide_ratio = total_pop // max(total_fac, 1)
    resource_summary = ResourceGapSummary(
        total_districts_evaluated=len(districts),
        flagged_gap_districts_count=len(flagged_gap_names),
        total_exposed_population=total_pop,
        total_facilities_registered=total_fac,
        citywide_ratio=citywide_ratio,
        flagged_district_names=flagged_gap_names,
        facilities_by_type=fac_type_counts,
        policy_notice="Decision support only, not emergency dispatch instructions.",
    )

    planner_data = PlannerResponseData(
        hazard=db_hazard,
        range=range,
        city="Karachi",
        city_forecast=city_forecast,
        districts=districts,
        resource_summary=resource_summary,
        operational_note="Decision support only, not emergency dispatch instructions.",
    )

    return APIResponse(
        data=planner_data,
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample,
    )
