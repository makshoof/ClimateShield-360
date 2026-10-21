"""Proposed cleaning rules. Loaded and logged before any transform is applied."""

from __future__ import annotations

from typing import Any, Literal

Action = Literal["fix", "fill", "flag", "remove", "keep"]

RULES: list[dict[str, Any]] = [
    {
        "rule_id": "GLOBAL.RAW_IMMUTABLE",
        "dataset": "all",
        "action": "keep",
        "what": "Never overwrite, edit, or delete files under data/raw/.",
        "why": "Raw files are evidence. Every cleaned value must be recoverable from code plus originals.",
    },
    {
        "rule_id": "GLOBAL.NO_INVENTED_VALUES",
        "dataset": "all",
        "action": "flag",
        "what": "Do not invent missing values. Do not treat a missing report as zero incidents.",
        "why": "Zeros and nulls have different meanings in OSM mapping, weather sensors, and official bulletins.",
    },
    {
        "rule_id": "GLOBAL.NO_EXTREME_DISCARD",
        "dataset": "all",
        "action": "keep",
        "what": "Do not drop genuine extreme heat or rainfall as statistical outliers.",
        "why": "Pakistan records air temperatures above 50 C and intense monsoon bursts. Outlier filters would erase the signal.",
    },
    {
        "rule_id": "GLOBAL.NO_INCOMPATIBLE_MERGE",
        "dataset": "all",
        "action": "keep",
        "what": "Join only tables that share keys, units, timestamps, geography, and meaning.",
        "why": "City hourly weather is not a district census. River thresholds in cusecs are not rainfall millimetres.",
    },
    {
        "rule_id": "WX.PARSE_UTC",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "fix",
        "what": "Parse Open-Meteo timestamps as UTC. Add timestamp_pkt only as a display column (UTC+5).",
        "why": "Files are labelled GMT/UTC. Merging later in PKT without conversion would shift hours by 5.",
    },
    {
        "rule_id": "WX.FLATTEN_HOURLY_JSON",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "fix",
        "what": "Flatten each weather_*_raw.json hourly object into a typed table. Keep publisher units from hourly_units.",
        "why": "JSON arrays are not analysis-ready. Units are already Celsius, mm, percent, hPa, km/h.",
    },
    {
        "rule_id": "WX.PESHAWAR_COVERAGE",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "flag",
        "what": "Flag Peshawar as starting 2023-01-01. Do not back-fill 2021-2022.",
        "why": "The city is truncated, not gappy. Filling would invent two years of heat and rain.",
    },
    {
        "rule_id": "WX.SAMPLE_IS_6HOURLY",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "fix",
        "what": "Label the CSV sample cadence as 6-hourly (00/06/12/18 UTC), not hourly.",
        "why": "The filename says hourly but timestamps only contain four hours of the day.",
    },
    {
        "rule_id": "WX.SAMPLE_UNDERSAMPLES_PEAKS",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "flag",
        "what": "Flag that 6-hourly maxima can be lower than true hourly maxima (sample 49.0 C vs JSON 50.1 C).",
        "why": "Using the sample for extreme-heat hours would under-count risk.",
    },
    {
        "rule_id": "WX.ZERO_PRECIP_IS_DRY",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "keep",
        "what": "Keep precipitation_mm = 0 as a dry hour. Do not recode to null.",
        "why": "A measured zero is not a missing sensor.",
    },
    {
        "rule_id": "WX.RANGE_FLAGS",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "flag",
        "what": "Flag temperature outside [-40, 55] C, humidity outside [0, 100], or negative rain. Do not delete the row.",
        "why": "Impossible values should be visible. Heat near 50 C is possible and must remain.",
    },
    {
        "rule_id": "WX.SHORT_GAP_FILL",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "fill",
        "what": "Fill only internal gaps of at most 6 hours in smooth hourly series (temperature, humidity, pressure, wind, cloud, soil moisture). Mark value_was_filled. Never interpolate precipitation or rain.",
        "why": "The guide allows a marked fill for a short gap in a smooth series. Rain is not smooth, so missing rain stays missing.",
    },
    {
        "rule_id": "WX.NO_GAP_FILL",
        "dataset": "01_open_meteo_heat_rainfall",
        "action": "flag",
        "what": "If an internal hourly gap is longer than 6 hours, or the series is truncated (Peshawar 2021-2022), leave hours missing and flag. Do not interpolate.",
        "why": "Long gaps and missing years are not a smooth interpolation problem. Filling them would invent heat and rain.",
    },
    {
        "rule_id": "OSM.MAPPED_ZERO_NOT_ABSENCE",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "flag",
        "what": "Flag district facility counts of 0 as 'none mapped', not 'none exist'.",
        "why": "OSM is incomplete, especially in Balochistan and remote districts.",
    },
    {
        "rule_id": "OSM.CROP_FLOOD_ALL_ZERO",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "flag",
        "what": "Flag all RP*_crops_* columns as source-unavailable. Exclude them from gold joins. Do not interpret as zero crop exposure.",
        "why": "Every crop-flood cell is 0.0 across 160 districts, which is not a credible floodplain result.",
    },
    {
        "rule_id": "OSM.REDUNDANT_ADM_PCODE",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "fix",
        "what": "Drop ADM_PCODE where it is identical to ADM2_PCODE. Keep ADM2_PCODE.",
        "why": "Duplicate key columns invite silent Cartesian joins.",
    },
    {
        "rule_id": "OSM.RURAL_DIVIDE_BY_ZERO",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "flag",
        "what": "Flag PK702 and PK712 missing rural_access_dependency_ratio (urban districts with 0 rural population).",
        "why": "A blank ratio is a divide-by-zero, not a missing census. Do not fill with 0 or the national mean.",
    },
    {
        "rule_id": "OSM.UNNAMED_FEATURES",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "flag",
        "what": "Keep unnamed OSM features. Flag missing name/name_en/name_latin.",
        "why": "Dropping unnamed hospitals or settlements would bias coverage toward well-mapped places.",
    },
    {
        "rule_id": "OSM.TAG_ERRORS",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "flag",
        "what": "Flag health features whose amenity is toilets/organization or whose name is 'Parking Area'.",
        "why": "These are likely tagging mistakes. They stay in the table so they can be reviewed.",
    },
    {
        "rule_id": "OSM.CENTROID",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "fix",
        "what": "Add lon/lat centroid for points (the point itself) and a simple ring-mean for polygons. Flag polygon centroids as approximate.",
        "why": "Analysis tables need coordinates. Original geometries remain in raw GeoJSON.",
    },
    {
        "rule_id": "OSM.POPULATION_SPARSE",
        "dataset": "02_openstreetmap_geofabrik",
        "action": "flag",
        "what": "Do not fill OSM population tags from PBS. 98% of populated_places lack population.",
        "why": "OSM population is a volunteer tag, not a census.",
    },
    {
        "rule_id": "PMD.UNITS_CUSECS",
        "dataset": "03_ndma_pmd_hazards_warnings",
        "action": "fix",
        "what": "Keep original cusecs columns. Add parallel *_cms columns using 1 cusec = 0.028316846592 m3/s.",
        "why": "Thresholds are published in cusecs. A conversion is certain; replacing the original would hide the publisher unit.",
    },
    {
        "rule_id": "PMD.PROVINCE_LABELS",
        "dataset": "03_ndma_pmd_hazards_warnings",
        "action": "fix",
        "what": "Add standardized_province (KPK -> Khyber Pakhtunkhwa, AJK -> Azad Jammu and Kashmir).",
        "why": "Label alignment only. Does not change thresholds.",
    },
    {
        "rule_id": "PMD.PDF_NO_INVENTED_NUMBERS",
        "dataset": "03_ndma_pmd_hazards_warnings",
        "action": "flag",
        "what": "Catalog PDFs as documents. Do not scrape unverified numbers into gold tables in this pass.",
        "why": "Scanned advisories need a dedicated extractor and human check before any figure is trusted.",
    },
    {
        "rule_id": "PBS.LOGICAL_DUPLICATE",
        "dataset": "04_pakistan_bureau_of_statistics",
        "action": "keep",
        "what": "Keep all three CSVs in raw. Treat vulnerability_dependency_ratios as the already-joined copy of the other two.",
        "why": "Byte hashes differ, but every shared column matches exactly. Gold uses one canonical join.",
    },
    {
        "rule_id": "PBS.REDUNDANT_ADM",
        "dataset": "04_pakistan_bureau_of_statistics",
        "action": "fix",
        "what": "Drop ADM_PCODE where identical to ADM2_PCODE.",
        "why": "Same duplicate-key risk as the OSM district tables.",
    },
    {
        "rule_id": "PBS.URBAN_ZERO_RURAL",
        "dataset": "04_pakistan_bureau_of_statistics",
        "action": "flag",
        "what": "Flag PK702 and PK712 rural population = 0 as likely fully urban, not missing people.",
        "why": "Filling rural population with a mean would fabricate residents.",
    },
    {
        "rule_id": "PBS.REGION_FROM_PCODE",
        "dataset": "04_pakistan_bureau_of_statistics",
        "action": "fix",
        "what": "Add region_name from the ADM2 prefix (PK1..PK7). Add district_name from OSM adm2 attributes when the code matches.",
        "why": "PBS CSVs have codes and no names. Prefix->region is a documented gazetteer, not an imputed count.",
    },
    {
        "rule_id": "JOIN.DISTRICT_SNAPSHOT",
        "dataset": "processed",
        "action": "keep",
        "what": "District gold join is allowed across PBS + OSM district CSVs on ADM2_PCODE (160/160 match). Prefix every column by source. Exclude all-zero crop-flood fields.",
        "why": "Same geography, same grain, snapshot indicators. Meanings stay separated by prefixes.",
    },
    {
        "rule_id": "JOIN.NO_WEATHER_DISTRICT",
        "dataset": "processed",
        "action": "keep",
        "what": "Do not attach city weather to districts until a reviewed city-to-district spatial assignment exists.",
        "why": "A city point is not a district polygon. Nearest-name matching would be a guess.",
    },
    {
        "rule_id": "JOIN.NO_RAIN_TO_CUSECS",
        "dataset": "processed",
        "action": "keep",
        "what": "Do not convert rainfall mm into river discharge. Keep thresholds as a lookup table only.",
        "why": "No hydrograph or catchment model is in the archive.",
    },
]


def rules_for_dataset(dataset: str) -> list[dict[str, Any]]:
    return [rule for rule in RULES if rule["dataset"] in {dataset, "all", "processed"}]


def rules_payload() -> dict[str, Any]:
    return {
        "title": "ClimateShield 360 proposed cleaning rules",
        "principle": "Fix only certain, reversible corrections. Fill only marked short gaps (<= 6 hours) in smooth hourly series; never interpolate rain or truncated years. Flag uncertainty. Remove only exact duplicate rows or redundant identical columns.",
        "rules": RULES,
    }
