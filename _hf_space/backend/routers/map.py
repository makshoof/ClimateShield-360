"""
Geospatial Risk Map Router for ClimateShield 360 Karachi.
Hazard colors and probabilities come from live weather_hourly + Open-Meteo forecast.
District population / facility counts come from warehouse district_snapshot + health_facilities.
Seeded sample exposure_index risk ranks are not used for map coloring.
"""

from datetime import datetime, timedelta, timezone
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from db import is_sample_database, safe_query
from forecasting.live_forecast import upcoming_hours
from hazard_levels import heat_level, rain_level
from routers.impacts import KARACHI_ZONE_MAPPING
from schemas import (
    APIResponse,
    DemographicBreakdown,
    EvidenceSourceItem,
    Facility,
    FacilityFeatureProperties,
    FacilityGeoJSONFeature,
    FacilityGeoJSONFeatureCollection,
    GeoJSONGeometry,
    ImpactIndicator,
    ZoneDetailResponseData,
    ZoneEvidenceDetail,
    ZoneExposureDetail,
    ZoneFeatureProperties,
    ZoneGeoJSONFeature,
    ZoneGeoJSONFeatureCollection,
    ZoneHazardDetail,
    ZoneVulnerabilityDetail,
)

router = APIRouter(prefix="/map", tags=["Risk Map"])

SEVERITY_ORDER = {
    "Severe": 4,
    "High": 3,
    "Moderate": 2,
    "Low": 1,
}

REVERSE_SEVERITY_ORDER = {
    4: "Severe",
    3: "High",
    2: "Moderate",
    1: "Low",
}

# Map live hazard level → display vulnerability (tracks current conditions, not seeded ranks)
_LEVEL_VULN = {"Low": 0.15, "Moderate": 0.4, "High": 0.7, "Severe": 0.9}


def _max_level(a: str, b: str) -> str:
    return REVERSE_SEVERITY_ORDER.get(
        max(SEVERITY_ORDER.get(a, 1), SEVERITY_ORDER.get(b, 1)),
        "Low",
    )


def _karachi_live_hazards(window_hours: int = 24) -> Dict[str, Any]:
    """Karachi point observations + live Open-Meteo forecast hours."""
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    observed_since = now_utc - timedelta(hours=window_hours)

    # Heat risk on the map follows the latest hourly observation (current conditions).
    # 24h peak is retained only as context — not used to paint overnight Low as Moderate.
    temp_rows = safe_query(
        """
        SELECT
            MAX(temperature_2m_c) AS max_temp_c,
            MIN(temperature_2m_c) AS min_temp_c,
            ARG_MAX(temperature_2m_c, timestamp_utc) AS latest_temp_c,
            MAX(timestamp_utc) AS latest_temp_at
        FROM weather_hourly
        WHERE lower(city) = 'karachi'
          AND temperature_2m_c IS NOT NULL
          AND timestamp_utc >= ?
        """,
        [observed_since],
    )
    rain_rows = safe_query(
        """
        SELECT
            SUM(precipitation_mm) AS rain_mm,
            MAX(precipitation_mm) AS max_hour_mm
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND timestamp_utc >= ?
        """,
        [observed_since],
    )
    rain_6h_rows = safe_query(
        """
        SELECT SUM(precipitation_mm) AS rain_6h_mm
        FROM weather_hourly
        WHERE lower(city) = 'karachi' AND timestamp_utc >= ?
        """,
        [now_utc - timedelta(hours=6)],
    )

    max_obs_temp = temp_rows[0].get("max_temp_c") if temp_rows else None
    min_obs_temp = temp_rows[0].get("min_temp_c") if temp_rows else None
    latest_temp = temp_rows[0].get("latest_temp_c") if temp_rows else None
    max_hour = rain_rows[0].get("max_hour_mm") if rain_rows else None
    rain_total = rain_rows[0].get("rain_mm") if rain_rows else None
    rain_6h = rain_6h_rows[0].get("rain_6h_mm") if rain_6h_rows else None

    max_temp_f = None if max_obs_temp is None else float(max_obs_temp)
    latest_temp_f = None if latest_temp is None else float(latest_temp)
    max_obs_mm = None if max_hour is None else float(max_hour)

    # Live forecast (not the single stale LightGBM warehouse row)
    live_hours, issued_at, origin = upcoming_hours("Karachi", window_hours)
    fc_temps = [h.temperature_c for h in live_hours if h.temperature_c is not None]
    fc_precips = [h.precipitation_mm for h in live_hours if h.precipitation_mm is not None]
    max_fc_temp = max(fc_temps) if fc_temps else None
    max_fc_mm = max(fc_precips) if fc_precips else None
    sum_fc_mm = sum(fc_precips) if fc_precips else 0.0

    # Current heat = latest hour only. Forecast peak stays in intervals, not risk paint.
    obs_heat = heat_level(latest_temp_f)
    obs_rain = rain_level(max_obs_mm)
    fc_rain = rain_level(max_fc_mm)

    heat_lvl = obs_heat
    rain_lvl = _max_level(obs_rain, fc_rain)

    # Probability: share of forecast hours at/above advisory thresholds, else observed flag
    rain_wet_hours = sum(1 for p in fc_precips if p >= 2.5)
    n_fc = max(len(live_hours), 1)
    rain_prob = round(rain_wet_hours / n_fc, 3) if fc_precips else (
        1.0 if max_obs_mm is not None and max_obs_mm >= 2.5 else 0.0
    )
    heat_prob = (
        1.0 if latest_temp_f is not None and latest_temp_f >= 40.0 else (
            0.5 if latest_temp_f is not None and latest_temp_f >= 35.0 else 0.0
        )
    )

    rain_low = round(min(fc_precips), 3) if fc_precips else 0.0
    rain_high = round(max(fc_precips), 3) if fc_precips else round(float(max_obs_mm or 0.0), 3)
    obs_min = float(min_obs_temp) if min_obs_temp is not None else None
    heat_low = round(
        min([t for t in [obs_min, latest_temp_f, *(fc_temps or [])] if t is not None] or [0.0]),
        2,
    )
    heat_high = round(
        max([t for t in [latest_temp_f, max_temp_f, max_fc_temp] if t is not None] or [0.0]),
        2,
    )

    return {
        "temp_c": latest_temp_f,
        "max_temp_c": max_temp_f,
        "max_hour_mm": max_obs_mm,
        "max_forecast_mm": max_fc_mm,
        "max_forecast_temp_c": max_fc_temp,
        "rain_total_mm": None if rain_total is None else float(rain_total),
        "rain_6h_mm": round(float(rain_6h), 2) if rain_6h is not None else 0.0,
        "forecast_precip_sum_mm": round(float(sum_fc_mm), 2),
        "heat_level": heat_lvl,
        "rain_level": rain_lvl,
        "obs_heat_level": obs_heat,
        "obs_rain_level": obs_rain,
        "heat_prob": heat_prob,
        "rain_prob": rain_prob,
        "heat_interval": [heat_low, heat_high],
        "rain_interval": [rain_low, rain_high],
        "heat_baseline": round(float(latest_temp_f), 2) if latest_temp_f is not None else 0.0,
        "rain_baseline": round(float(max_obs_mm or 0.0), 3),
        "forecast_origin": origin,
        "forecast_issued_at": issued_at,
    }


def _district_live_stats() -> Dict[str, Dict[str, Any]]:
    """PBS + OSM counts from district_snapshot keyed by KHI-* zone_id."""
    codes = sorted(set(KARACHI_ZONE_MAPPING.values()))
    placeholders = ", ".join(["?"] * len(codes))
    rows = safe_query(
        f"""
        SELECT
            ADM2_PCODE,
            district_name,
            pbs_total_pop,
            pbs_children_u5,
            pbs_elderly,
            pbs_rural_pop_perc,
            osm_hospitals_count,
            osm_education_count,
            osm_primary_healthcare_count
        FROM district_snapshot
        WHERE ADM2_PCODE IN ({placeholders})
        """,
        codes,
    )
    by_code = {str(r["ADM2_PCODE"]): r for r in rows}
    out: Dict[str, Dict[str, Any]] = {}
    for zone_id, adm2 in KARACHI_ZONE_MAPPING.items():
        row = by_code.get(adm2, {})
        hospitals = int(row.get("osm_hospitals_count") or 0)
        clinics = int(row.get("osm_primary_healthcare_count") or 0)
        schools = int(row.get("osm_education_count") or 0)
        out[zone_id] = {
            "adm2": adm2,
            "district_name": row.get("district_name"),
            "population": int(row.get("pbs_total_pop") or 0),
            "children_u5": int(row.get("pbs_children_u5") or 0),
            "elderly": int(row.get("pbs_elderly") or 0),
            "rural_pct": float(row.get("pbs_rural_pop_perc") or 0.0),
            "facilities_count": hospitals + clinics + schools,
            "hospitals_count": hospitals,
        }
    return out


def _extract_geometry(geometry_raw: Any) -> GeoJSONGeometry:
    """Parse geometry from DuckDB json string or dict into GeoJSONGeometry."""
    if isinstance(geometry_raw, str):
        try:
            parsed = json.loads(geometry_raw)
        except Exception:
            return GeoJSONGeometry(type="Polygon", coordinates=[])
    elif isinstance(geometry_raw, dict):
        parsed = geometry_raw
    else:
        return GeoJSONGeometry(type="Polygon", coordinates=[])

    if "geometry" in parsed and isinstance(parsed["geometry"], dict):
        return GeoJSONGeometry(
            type=parsed["geometry"].get("type", "Polygon"),
            coordinates=parsed["geometry"].get("coordinates", []),
        )
    return GeoJSONGeometry(
        type=parsed.get("type", "Polygon"),
        coordinates=parsed.get("coordinates", []),
    )


def _live_health_facilities(
    zone_id: Optional[str] = None,
    types_filter: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """OSM health facilities from the processed warehouse (not sample.facilities)."""
    adm2_list: List[str]
    zone_for_adm2: Dict[str, str] = {}
    if zone_id:
        adm2 = KARACHI_ZONE_MAPPING.get(zone_id.upper())
        if not adm2:
            return []
        adm2_list = [adm2]
        zone_for_adm2[adm2] = zone_id.upper()
    else:
        adm2_list = sorted(set(KARACHI_ZONE_MAPPING.values()))
        for zid, adm2 in KARACHI_ZONE_MAPPING.items():
            # Prefer non-Keamari label when two zones share ADM2
            if adm2 not in zone_for_adm2 or zid != "KHI-KEAMARI":
                zone_for_adm2[adm2] = zid

    placeholders = ", ".join(["?"] * len(adm2_list))
    rows = safe_query(
        f"""
        SELECT id, name, amenity, healthcare, adm2_pcode, lon, lat, row_id
        FROM health_facilities
        WHERE adm2_pcode IN ({placeholders})
          AND lon IS NOT NULL AND lat IS NOT NULL
        ORDER BY name
        LIMIT 2000
        """,
        adm2_list,
    )

    wanted = set(types_filter or [])
    out: List[Dict[str, Any]] = []
    for r in rows:
        amenity = str(r.get("amenity") or "").lower()
        healthcare = str(r.get("healthcare") or "").lower()
        if amenity in ("hospital",) or healthcare == "hospital":
            ftype = "hospital"
        elif amenity in ("clinic", "doctors", "dentist") or healthcare in (
            "clinic",
            "doctor",
            "centre",
            "center",
        ):
            ftype = "hospital"  # map clinics under hospital filter for UI
        else:
            ftype = "hospital" if "hospital" in amenity or "hospital" in healthcare else "other"

        if wanted and ftype not in wanted and "hospital" not in wanted:
            # school/shelter not in health_facilities — skip rather than invent
            if wanted & {"school", "shelter"} and not (wanted & {"hospital"}):
                continue
            if "hospital" in wanted and ftype != "hospital":
                continue
        if wanted and "hospital" in wanted and ftype != "hospital":
            continue

        adm2 = str(r.get("adm2_pcode") or "")
        zid = zone_for_adm2.get(adm2, zone_id or "")
        out.append(
            {
                "facility_id": str(r.get("id") or r.get("row_id")),
                "type": ftype,
                "name": str(r.get("name") or "Unnamed facility"),
                "zone_id": zid,
                "lat": float(r["lat"]),
                "lon": float(r["lon"]),
            }
        )
    return out


@router.get("/zones", response_model=APIResponse[ZoneGeoJSONFeatureCollection])
def get_map_zones(
    hazard: str = Query(
        "combined",
        description="Hazard type to visualize: heat, rain (or heavy_rain), or combined",
    )
) -> APIResponse[ZoneGeoJSONFeatureCollection]:
    """
    Returns GeoJSON FeatureCollection of Karachi zones with live risk_level / probability
    from Open-Meteo observations + forecast, and PBS/OSM exposure counts from the warehouse.
    """
    now_utc = datetime.now(timezone.utc)
    # Geometry polygons may still come from the attached sample zones table;
    # hazard metrics are live warehouse weather — report sample only if DB mode is sample.
    is_sample = is_sample_database()

    norm_hazard = hazard.lower().strip()
    if norm_hazard in ("rain", "heavy_rain"):
        db_hazard_filter = "heavy_rain"
    elif norm_hazard == "heat":
        db_hazard_filter = "heat"
    else:
        db_hazard_filter = "combined"

    zones_rows = safe_query("SELECT zone_id, name, geometry_geojson FROM zones ORDER BY zone_id;")
    live = _karachi_live_hazards(24)
    district_stats = _district_live_stats()

    live_heat_lvl = str(live["heat_level"])
    live_rain_lvl = str(live["rain_level"])

    features: List[ZoneGeoJSONFeature] = []

    for z in zones_rows:
        zid = str(z["zone_id"])
        zname = z["name"]
        geometry = _extract_geometry(z.get("geometry_geojson"))
        stats = district_stats.get(zid, {})
        pop = int(stats.get("population") or 0)
        fac_cnt = int(stats.get("facilities_count") or 0)

        if db_hazard_filter == "heat":
            risk_level = live_heat_lvl
            prob = float(live["heat_prob"])
            low, high = live["heat_interval"]
            base_val = float(live["heat_baseline"])
            vuln_score = _LEVEL_VULN.get(risk_level, 0.15)
            out_hazard_type = "heat"
        elif db_hazard_filter == "heavy_rain":
            risk_level = live_rain_lvl
            prob = float(live["rain_prob"])
            low, high = live["rain_interval"]
            base_val = float(live["rain_baseline"])
            vuln_score = _LEVEL_VULN.get(risk_level, 0.15)
            out_hazard_type = "rain"
        else:
            heat_p = float(live["heat_prob"])
            rain_p = float(live["rain_prob"])
            prob = min(0.99, round(1.0 - (1.0 - heat_p) * (1.0 - rain_p), 3))
            low = min(float(live["heat_interval"][0]), float(live["rain_interval"][0]))
            high = max(float(live["heat_interval"][1]), float(live["rain_interval"][1]))
            base_val = round(
                (float(live["heat_baseline"]) + float(live["rain_baseline"])) / 2.0, 3
            )
            risk_level = _max_level(live_heat_lvl, live_rain_lvl)
            vuln_score = _LEVEL_VULN.get(risk_level, 0.15)
            out_hazard_type = "combined"

        if risk_level not in ("Low", "Moderate", "High", "Severe"):
            risk_level = "Low"
        if pop <= 0:
            pop = 1

        props = ZoneFeatureProperties(
            zone_id=zid,
            name=zname,
            hazard_type=out_hazard_type,
            risk_level=risk_level,  # type: ignore[arg-type]
            probability=float(prob),
            interval_low=float(low),
            interval_high=float(high),
            interval=[float(low), float(high)],
            exposed_population=pop,
            facilities_count=fac_cnt,
            vulnerability_score=float(vuln_score),
            evidence_strength="high",
            baseline_value=float(base_val),
        )

        features.append(
            ZoneGeoJSONFeature(
                id=zid,
                geometry=geometry,
                properties=props,
            )
        )

    return APIResponse(
        data=ZoneGeoJSONFeatureCollection(features=features),
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/facilities", response_model=APIResponse[FacilityGeoJSONFeatureCollection])
def get_map_facilities(
    types: Optional[str] = Query(
        None,
        description="Comma-separated facility types filter (e.g. hospital,school,shelter)",
    )
) -> APIResponse[FacilityGeoJSONFeatureCollection]:
    """Live OSM health facility points from the processed warehouse."""
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    types_list = None
    if types:
        types_list = [t.strip().lower() for t in types.split(",") if t.strip()]

    rows = _live_health_facilities(types_filter=types_list)

    # If UI asks only for school/shelter and warehouse has none, return empty (no fake pins)
    features: List[FacilityGeoJSONFeature] = []
    for r in rows:
        geom = GeoJSONGeometry(type="Point", coordinates=[r["lon"], r["lat"]])
        props = FacilityFeatureProperties(
            facility_id=r["facility_id"],
            type=r["type"],
            name=r["name"],
            zone_id=r["zone_id"],
            lat=r["lat"],
            lon=r["lon"],
        )
        features.append(
            FacilityGeoJSONFeature(id=r["facility_id"], geometry=geom, properties=props)
        )

    return APIResponse(
        data=FacilityGeoJSONFeatureCollection(features=features),
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/zone/{zone_id}", response_model=APIResponse[ZoneDetailResponseData])
def get_zone_detail(zone_id: str) -> APIResponse[ZoneDetailResponseData]:
    """Zone dossier built from live weather + warehouse PBS/OSM — no seeded exposure ranks."""
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    clean_id = zone_id.strip().upper()

    zone_rows = safe_query(
        "SELECT zone_id, name, geometry_geojson FROM zones WHERE UPPER(zone_id) = ? LIMIT 1;",
        [clean_id],
    )
    if not zone_rows:
        raise HTTPException(
            status_code=404,
            detail=f"Zone with ID '{zone_id}' not found in Karachi municipal registry.",
        )

    zone_row = zone_rows[0]
    zid = zone_row["zone_id"]
    zname = zone_row["name"]
    geometry = _extract_geometry(zone_row.get("geometry_geojson"))

    live = _karachi_live_hazards(24)
    stats = _district_live_stats().get(clean_id, {})
    adm2 = stats.get("adm2") or KARACHI_ZONE_MAPPING.get(clean_id)

    fac_rows = _live_health_facilities(zone_id=clean_id, types_filter=["hospital"])
    # Cap detail drawer list for UI
    facilities_list = [
        Facility(
            facility_id=f["facility_id"],
            type=f["type"],
            name=f["name"],
            zone_id=f["zone_id"],
            lat=f["lat"],
            lon=f["lon"],
        )
        for f in fac_rows[:40]
    ]

    heat_p = float(live["heat_prob"])
    rain_p = float(live["rain_prob"])
    compound_prob = min(0.99, round(1.0 - (1.0 - heat_p) * (1.0 - rain_p), 3))
    heat_low, heat_high = live["heat_interval"]
    rain_low, rain_high = live["rain_interval"]
    comb_low = round(min(float(heat_low), float(rain_low)), 3)
    comb_high = round(max(float(heat_high), float(rain_high)), 3)
    comb_base = round(
        (float(live["heat_baseline"]) + float(live["rain_baseline"])) / 2.0, 3
    )

    heat_lvl = str(live["heat_level"])
    rain_lvl = str(live["rain_level"])
    comb_lvl = _max_level(heat_lvl, rain_lvl)

    if comb_lvl == "Severe":
        warning_label = "Severe Risk (Red Alert)"
    elif comb_lvl == "High":
        warning_label = "High Alert (Orange Notice)"
    elif comb_lvl == "Moderate":
        warning_label = "Moderate Risk (Yellow Advisory)"
    else:
        warning_label = "Low (dry / mild at Karachi observation + forecast)"

    hazard_detail = ZoneHazardDetail(
        hazard_type="combined",
        probability=compound_prob,
        interval_low=comb_low,
        interval_high=comb_high,
        interval=[comb_low, comb_high],
        baseline_value=comb_base,
        heat_probability=heat_p,
        heat_interval=[float(heat_low), float(heat_high)],
        rain_probability=rain_p,
        rain_interval=[float(rain_low), float(rain_high)],
        wbgt_celsius=live.get("temp_c"),  # observed 2m air temp; warehouse has no WBGT
        rainfall_6h_mm=float(live.get("rain_6h_mm") or 0.0),
        warning_label=warning_label,
    )

    exposed_pop = int(stats.get("population") or 0)
    fac_count = int(stats.get("facilities_count") or len(facilities_list))
    demographics = DemographicBreakdown(
        children_under_5=int(stats.get("children_u5") or 0),
        elderly_65_plus=int(stats.get("elderly") or 0),
        informal_settlements_pct=float(stats.get("rural_pct") or 0.0),
    )

    exposure_detail = ZoneExposureDetail(
        exposed_population=max(exposed_pop, 1),
        facilities_count=fac_count,
        demographics=demographics,
        critical_facilities=facilities_list,
    )

    vuln_score = _LEVEL_VULN.get(comb_lvl, 0.15)
    indicators_list: List[ImpactIndicator] = []
    if live.get("max_hour_mm") is not None:
        indicators_list.append(
            ImpactIndicator(
                zone_id=zid,
                impact_area="Meteorology",
                indicator="Max observed precip mm/h (24h Karachi point)",
                value=float(live["max_hour_mm"]),
                evidence_strength="high",
                source="weather_hourly",
                row_ids="karachi_obs_24h",
            )
        )
    if live.get("max_forecast_mm") is not None:
        indicators_list.append(
            ImpactIndicator(
                zone_id=zid,
                impact_area="Meteorology",
                indicator="Max forecast precip mm/h (Open-Meteo)",
                value=float(live["max_forecast_mm"]),
                evidence_strength="high",
                source=str(live.get("forecast_origin") or "open-meteo"),
                row_ids="karachi_fc_24h",
            )
        )
    if live.get("temp_c") is not None:
        indicators_list.append(
            ImpactIndicator(
                zone_id=zid,
                impact_area="Meteorology",
                indicator="Latest observed 2m air temperature °C",
                value=float(live["temp_c"]),
                evidence_strength="high",
                source="weather_hourly",
                row_ids="karachi_temp",
            )
        )

    vulnerability_detail = ZoneVulnerabilityDetail(
        vulnerability_score=vuln_score,
        risk_level=comb_lvl,  # type: ignore[arg-type]
        heat_risk_level=heat_lvl,
        rain_risk_level=rain_lvl,
        chokepoint_notes=None,
        indicators=indicators_list,
    )

    sources_items = [
        EvidenceSourceItem(
            source="Open-Meteo weather_hourly (Karachi)",
            row_ids="weather_hourly|karachi",
            indicator="Observed temperature & precipitation",
            impact_area="Meteorology",
            evidence_strength="high",
        ),
        EvidenceSourceItem(
            source=f"Open-Meteo forecast ({live.get('forecast_origin')})",
            row_ids="live_forecast|karachi",
            indicator="Next-24h temperature & precipitation",
            impact_area="Meteorology",
            evidence_strength="high",
        ),
    ]
    if adm2:
        sources_items.append(
            EvidenceSourceItem(
                source="district_snapshot / PBS + OSM",
                row_ids=str(adm2),
                indicator="District population & facility counts",
                impact_area="Exposure",
                evidence_strength="high",
            )
        )

    evidence_detail = ZoneEvidenceDetail(
        evidence_strength="high",
        sources_count=len(sources_items),
        sources=sources_items,
        model_provenance="Live Open-Meteo obs+forecast; PBS/OSM district_snapshot",
        last_calibrated=now_utc.strftime("%Y-%m-%d %H:%M UTC"),
    )

    return APIResponse(
        data=ZoneDetailResponseData(
            zone_id=zid,
            name=zname,
            geometry=geometry,
            hazard=hazard_detail,
            exposure=exposure_detail,
            vulnerability=vulnerability_detail,
            evidence=evidence_detail,
        ),
        generated_at=now_utc,
        is_sample=is_sample,
    )
