"""Clean OSM / Geofabrik exports."""

from __future__ import annotations

import json

import pandas as pd

from climateshield.config import CLEANED_DIR, PCODE_REGION, RAW_DATASETS
from climateshield.io_utils import write_csv, write_table
from climateshield.pipeline.geo import centroid_lon_lat
from climateshield.quality.agent import DataQualityAgent

SRC = RAW_DATASETS / "02_openstreetmap_geofabrik"
OUT = CLEANED_DIR / "02_openstreetmap_geofabrik"
DATASET = "02_openstreetmap_geofabrik"


def _region_from_pcode(code: str) -> str:
    prefix = str(code)[:3]
    return PCODE_REGION.get(prefix, {}).get("region_name", "unknown")


def _drop_redundant_adm(frame: pd.DataFrame, agent: DataQualityAgent, name: str) -> pd.DataFrame:
    if "ADM_PCODE" in frame.columns and "ADM2_PCODE" in frame.columns:
        identical = int((frame["ADM_PCODE"].astype(str) == frame["ADM2_PCODE"].astype(str)).sum())
        frame = frame.drop(columns=["ADM_PCODE"])
        agent.decide("OSM.REDUNDANT_ADM_PCODE", DATASET, identical, column="ADM_PCODE", details=name)
    return frame


def _add_region(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["region_name"] = frame["ADM2_PCODE"].map(_region_from_pcode)
    return frame


def _geojson_to_frame(path, agent: DataQualityAgent, dataset_name: str) -> pd.DataFrame:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for feat in payload.get("features") or []:
        props = dict(feat.get("properties") or {})
        geom = feat.get("geometry") or {}
        lon, lat, approx = centroid_lon_lat(geom)
        props["geometry_type"] = geom.get("type")
        props["lon"] = lon
        props["lat"] = lat
        props["centroid_is_approximate"] = bool(approx)
        rows.append(props)
    frame = pd.DataFrame(rows)
    frame["quality_flags"] = ""
    if "name" in frame.columns:
        unnamed = frame["name"].isna()
        if "name_en" in frame.columns:
            unnamed = unnamed & frame["name_en"].isna()
        if "name_latin" in frame.columns:
            unnamed = unnamed & frame["name_latin"].isna()
        frame = agent.append_flags(frame, unnamed, "unnamed_feature")
        agent.decide("OSM.UNNAMED_FEATURES", DATASET, int(unnamed.sum()), details=dataset_name)
    approx = frame["centroid_is_approximate"].eq(True)
    frame = agent.append_flags(frame, approx, "approximate_polygon_centroid")
    agent.decide("OSM.CENTROID", DATASET, int(approx.sum()), details=dataset_name)
    missing_adm = frame["adm2_pcode"].isna() if "adm2_pcode" in frame.columns else pd.Series(False, index=frame.index)
    frame = agent.append_flags(frame, missing_adm, "missing_adm2")
    return frame


def clean_osm(agent: DataQualityAgent) -> dict[str, pd.DataFrame]:
    OUT.mkdir(parents=True, exist_ok=True)

    facilities = pd.read_csv(SRC / "osm_pak_emergency_facilities_infrastructure.csv")
    facilities = _drop_redundant_adm(facilities, agent, "emergency_facilities")
    facilities = _add_region(facilities)
    facilities["quality_flags"] = ""
    zero_all = (
        (facilities["education_count"] == 0)
        & (facilities["hospitals_count"] == 0)
        & (facilities["primary_healthcare_count"] == 0)
    )
    facilities = agent.append_flags(facilities, zero_all, "osm_mapped_zero_not_confirmed_absence")
    agent.decide("OSM.MAPPED_ZERO_NOT_ABSENCE", DATASET, int(zero_all.sum()), details="emergency_facilities")
    facilities["row_id"] = "osm_facilities|" + facilities["ADM2_PCODE"].astype(str)
    write_table(OUT / "osm_emergency_facilities", facilities)

    access = pd.read_csv(SRC / "osm_pak_hospital_travel_access_times.csv")
    access = _drop_redundant_adm(access, agent, "hospital_access")
    access = _add_region(access)
    access["quality_flags"] = ""
    zero_access = (access.select_dtypes("number") == 0).all(axis=1)
    access = agent.append_flags(access, zero_access, "zero_modelled_access_population")
    agent.decide(
        "OSM.MAPPED_ZERO_NOT_ABSENCE",
        DATASET,
        int(zero_access.sum()),
        details="hospital_access: zeros may mean no mapped facility or no modelled population, not official zero access",
    )
    access["row_id"] = "osm_access|" + access["ADM2_PCODE"].astype(str)
    write_table(OUT / "osm_hospital_access", access)

    flood = pd.read_csv(SRC / "osm_pak_road_network_flood_exposure.csv")
    flood = _add_region(flood)
    crop_cols = [c for c in flood.columns if "crops" in c]
    all_zero_crop = all(bool((flood[c] == 0).all()) for c in crop_cols)
    flood["quality_flags"] = ""
    if all_zero_crop:
        flood = agent.append_flags(flood, pd.Series(True, index=flood.index), "crop_flood_layer_all_zero_source_unavailable")
        agent.decide(
            "OSM.CROP_FLOOD_ALL_ZERO",
            DATASET,
            int(len(flood)),
            column=",".join(crop_cols),
        )
    flood["row_id"] = "osm_flood|" + flood["ADM2_PCODE"].astype(str)
    write_table(OUT / "osm_flood_exposure", flood)

    rural = pd.read_csv(SRC / "osm_pak_rural_access_index_roads.csv")
    rural = _add_region(rural)
    rural["quality_flags"] = ""
    missing_ratio = rural["rural_access_dependency_ratio"].isna()
    rural = agent.append_flags(rural, missing_ratio, "rural_dependency_undefined_zero_rural_pop")
    agent.decide("OSM.RURAL_DIVIDE_BY_ZERO", DATASET, int(missing_ratio.sum()), column="rural_access_dependency_ratio")
    rural["row_id"] = "osm_rai|" + rural["ADM2_PCODE"].astype(str)
    write_table(OUT / "osm_rural_access", rural)

    health = _geojson_to_frame(SRC / "health_facilities.geojson", agent, "health_facilities")
    if "amenity" in health.columns:
        tag_mask = health["amenity"].isin(["toilets", "organization"])
        if "name" in health.columns:
            tag_mask = tag_mask | health["name"].fillna("").str.contains("Parking Area", case=False)
        health = agent.append_flags(health, tag_mask, "possible_osm_tag_error")
        agent.decide("OSM.TAG_ERRORS", DATASET, int(tag_mask.sum()), column="amenity")
    health["row_id"] = "health|" + health["id"].astype(str)
    write_table(OUT / "health_facilities", health, csv=False)

    places = _geojson_to_frame(SRC / "populated_places.geojson", agent, "populated_places")
    if "population" in places.columns:
        missing_pop = places["population"].isna()
        places = agent.append_flags(places, missing_pop, "osm_population_tag_missing_not_census")
        agent.decide("OSM.POPULATION_SPARSE", DATASET, int(missing_pop.sum()), column="population")
    unusual_geom = places["geometry_type"].isin(["LineString", "GeometryCollection"])
    places = agent.append_flags(places, unusual_geom, "unusual_geometry_type")
    places["row_id"] = "place|" + places["id"].astype(str)
    write_table(OUT / "populated_places", places, csv=False)

    lookup_parts = []
    for frame, src_name in ((health, "health_facilities"), (places, "populated_places")):
        if "adm2_pcode" not in frame.columns:
            continue
        subset = frame.dropna(subset=["adm2_pcode"])[["adm2_pcode", "adm2_name", "adm1_pcode", "adm1_name"]].drop_duplicates()
        subset["source_layer"] = src_name
        lookup_parts.append(subset)
    lookup = pd.concat(lookup_parts, ignore_index=True).drop_duplicates(subset=["adm2_pcode", "adm2_name"])
    lookup = lookup.rename(columns={"adm2_pcode": "ADM2_PCODE"})
    lookup["region_name"] = lookup["ADM2_PCODE"].map(_region_from_pcode)
    write_csv(OUT / "district_name_lookup.csv", lookup)

    return {
        "osm_emergency_facilities": facilities,
        "osm_hospital_access": access,
        "osm_flood_exposure": flood,
        "osm_rural_access": rural,
        "health_facilities": health,
        "populated_places": places,
        "district_name_lookup": lookup,
        "crop_cols": crop_cols,
    }
