"""Project paths, licences, and documented gazetteer lookups."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP_ARCHIVE = ROOT / "Pakistan_MultiSource_Datasets_Collection.zip"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
RAW_DATASETS = RAW_DIR / "collected_datasets"
RAW_HOURLY_DIR = RAW_DIR / "hourly_ingest"
CLEANED_DIR = DATA_DIR / "cleaned"
PROCESSED_DIR = DATA_DIR / "processed"
WAREHOUSE_PATH = PROCESSED_DIR / "climateshield.duckdb"
REPORTS_DIR = ROOT / "reports"
MANIFEST_PATH = DATA_DIR / "manifest.csv"
HOURLY_MANIFEST_PATH = DATA_DIR / "hourly_manifest.csv"
QUALITY_REPORT_PATH = REPORTS_DIR / "quality_report.json"
QUALITY_LOGS_PATH = REPORTS_DIR / "quality_logs.csv"
INVENTORY_PATH = REPORTS_DIR / "dataset_inventory.json"
INITIAL_QUALITY_PATH = REPORTS_DIR / "initial_quality_report.json"
CLEANING_RULES_PATH = REPORTS_DIR / "cleaning_rules.json"
HOURLY_STATUS_PATH = REPORTS_DIR / "hourly_ingest_status.json"
HOURLY_LOG_PATH = REPORTS_DIR / "hourly_ingest_log.csv"
INGEST_INTERVAL_SECONDS = 3600
HTTP_TIMEOUT_SECONDS = 30
HTTP_RETRIES = 3
HTTP_RATE_LIMIT_SECONDS = 0.35
USER_AGENT = "ClimateShield360/0.1 (HackInsight 2026; research; local pipeline)"

CUSEC_TO_CMS = 0.028316846592  # 1 cubic foot per second -> cubic metres per second
PKT_OFFSET_HOURS = 5

# Documented HDX/COD-style ADM2 prefix -> region. This is a label lookup, not a
# population or hazard estimate.
PCODE_REGION = {
    "PK1": {"region_name": "Gilgit-Baltistan", "region_code": "GB"},
    "PK2": {"region_name": "Balochistan", "region_code": "BA"},
    "PK3": {"region_name": "Azad Jammu and Kashmir", "region_code": "AJK"},
    "PK4": {"region_name": "Islamabad Capital Territory", "region_code": "ICT"},
    "PK5": {"region_name": "Khyber Pakhtunkhwa", "region_code": "KP"},
    "PK6": {"region_name": "Punjab", "region_code": "PB"},
    "PK7": {"region_name": "Sindh", "region_code": "SD"},
}

PROVINCE_LABELS = {
    "KPK": "Khyber Pakhtunkhwa",
    "AJK": "Azad Jammu and Kashmir",
    "Punjab": "Punjab",
    "Sindh": "Sindh",
}

SOURCE_LICENCES = {
    "01_open_meteo_heat_rainfall": {
        "publisher": "Open-Meteo",
        "source_url": "https://open-meteo.com/",
        "licence": "CC-BY-4.0",
        "independence": "Independent weather reanalysis/forecast API (not on the OSM/PBS/NDMA stack).",
    },
    "02_openstreetmap_geofabrik": {
        "publisher": "OpenStreetMap contributors / Geofabrik / oex (HOT-style export)",
        "source_url": "https://www.openstreetmap.org/",
        "licence": "ODbL-1.0",
        "independence": "Volunteer-mapped infrastructure and settlements.",
    },
    "03_ndma_pmd_hazards_warnings": {
        "publisher": "NDMA and Pakistan Meteorological Department",
        "source_url": "https://ndma.gov.pk/ ; https://www.pmd.gov.pk/",
        "licence": "licence_unspecified_official_publication",
        "independence": "Official Pakistani hazard and river-threshold publications.",
    },
    "04_pakistan_bureau_of_statistics": {
        "publisher": "Pakistan Bureau of Statistics",
        "source_url": "https://www.pbs.gov.pk/",
        "licence": "licence_unspecified_official_statistics",
        "independence": "Official census/statistics tables (not on the Open-Meteo track list).",
    },
}

OPEN_METEO_CITIES = {
    "faisalabad": "Faisalabad",
    "gilgit": "Gilgit",
    "gwadar": "Gwadar",
    "hyderabad": "Hyderabad",
    "islamabad": "Islamabad",
    "karachi": "Karachi",
    "lahore": "Lahore",
    "multan": "Multan",
    "peshawar": "Peshawar",
    "quetta": "Quetta",
    "rawalpindi": "Rawalpindi",
    "sukkur": "Sukkur",
}

# Coordinates taken from the collected Open-Meteo JSON files / city_locations.csv.
OPEN_METEO_CITY_POINTS = {
    "faisalabad": {"city": "Faisalabad", "latitude": 31.458698, "longitude": 73.11828},
    "gilgit": {"city": "Gilgit", "latitude": 35.95782, "longitude": 74.28201},
    "gwadar": {"city": "Gwadar", "latitude": 25.202108, "longitude": 62.300217},
    "hyderabad": {"city": "Hyderabad", "latitude": 25.413004, "longitude": 68.353195},
    "islamabad": {"city": "Islamabad", "latitude": 33.63796, "longitude": 73.0273},
    "karachi": {"city": "Karachi", "latitude": 24.850615, "longitude": 66.992485},
    "lahore": {"city": "Lahore", "latitude": 31.528997, "longitude": 74.38995},
    "multan": {"city": "Multan", "latitude": 30.123022, "longitude": 71.49533},
    "peshawar": {"city": "Peshawar", "latitude": 34.059753, "longitude": 71.549995},
    "quetta": {"city": "Quetta", "latitude": 30.193321, "longitude": 66.94737},
    "rawalpindi": {"city": "Rawalpindi", "latitude": 33.56766, "longitude": 73.048325},
    "sukkur": {"city": "Sukkur", "latitude": 27.732864, "longitude": 68.865166},
}

OPEN_METEO_HOURLY_VARS = (
    "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,rain,"
    "surface_pressure,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm,"
    "wind_speed_10m,wind_direction_10m,cloud_cover,weather_code"
)
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
OPEN_METEO_FLOOD_DAILY_VARS = (
    "river_discharge,river_discharge_mean,river_discharge_median,river_discharge_max"
)
GEOFABRIK_PBF_MD5_URL = "https://download.geofabrik.de/asia/pakistan-latest.osm.pbf.md5"
NDMA_HOME_URL = "https://ndma.gov.pk/"
PMD_FFD_URL = "https://ffd.pmd.gov.pk/"
PBS_HOME_URL = "https://www.pbs.gov.pk/"

IMPACT_AREAS = (
    "physical",
    "environmental",
    "producers",
    "economic",
    "public_health",
    "infrastructure",
    "social",
    "emergency",
)

# Physically implausible bounds for Pakistan 2 m air temperature. Values outside
# this range are flagged, never discarded. Genuine heat (40-54 C) is in range.
TEMP_C_HARD_MIN = -40.0
TEMP_C_HARD_MAX = 55.0
HUMIDITY_MIN = 0.0
HUMIDITY_MAX = 100.0
PRECIP_HARD_MAX_MM = 500.0  # hourly; above this is flagged, not removed
