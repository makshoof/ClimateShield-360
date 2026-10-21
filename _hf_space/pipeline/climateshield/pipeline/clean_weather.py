"""Clean Open-Meteo heat and rainfall files."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from climateshield.config import (
    CLEANED_DIR,
    HUMIDITY_MAX,
    HUMIDITY_MIN,
    OPEN_METEO_CITIES,
    PKT_OFFSET_HOURS,
    PRECIP_HARD_MAX_MM,
    RAW_DATASETS,
    RAW_HOURLY_DIR,
    TEMP_C_HARD_MAX,
    TEMP_C_HARD_MIN,
)
from climateshield.io_utils import write_table
from climateshield.quality.agent import DataQualityAgent


SRC = RAW_DATASETS / "01_open_meteo_heat_rainfall"
OUT = CLEANED_DIR / "01_open_meteo_heat_rainfall"
DATASET = "01_open_meteo_heat_rainfall"


def _flatten_city_json(path: Path, city: str) -> pd.DataFrame:
    payload = json.loads(path.read_text(encoding="utf-8"))
    hourly = payload["hourly"]
    frame = pd.DataFrame(hourly)
    frame["city"] = city
    frame["latitude"] = payload.get("latitude")
    frame["longitude"] = payload.get("longitude")
    frame["elevation_m"] = payload.get("elevation")
    frame["source_timezone"] = payload.get("timezone")
    frame["timestamp_utc"] = pd.to_datetime(frame["time"], utc=True)
    frame["timestamp_pkt"] = frame["timestamp_utc"] + pd.Timedelta(hours=PKT_OFFSET_HOURS)
    rename = {
        "temperature_2m": "temperature_2m_c",
        "relative_humidity_2m": "relative_humidity_pct",
        "dew_point_2m": "dew_point_c",
        "precipitation": "precipitation_mm",
        "rain": "rain_mm",
        "surface_pressure": "surface_pressure_hpa",
        "soil_moisture_0_to_7cm": "soil_moisture_0_to_7cm_m3m3",
        "soil_moisture_7_to_28cm": "soil_moisture_7_to_28cm_m3m3",
        "wind_speed_10m": "wind_speed_10m_kmh",
        "wind_direction_10m": "wind_direction_10m_deg",
        "cloud_cover": "cloud_cover_pct",
        "weather_code": "weather_code_wmo",
    }
    frame = frame.rename(columns=rename)
    keep = [
        "city",
        "timestamp_utc",
        "timestamp_pkt",
        "latitude",
        "longitude",
        "elevation_m",
        "temperature_2m_c",
        "relative_humidity_pct",
        "dew_point_c",
        "precipitation_mm",
        "rain_mm",
        "surface_pressure_hpa",
        "soil_moisture_0_to_7cm_m3m3",
        "soil_moisture_7_to_28cm_m3m3",
        "wind_speed_10m_kmh",
        "wind_direction_10m_deg",
        "cloud_cover_pct",
        "weather_code_wmo",
        "source_timezone",
    ]
    return frame[keep]


def _flag_ranges(frame: pd.DataFrame, agent: DataQualityAgent) -> pd.DataFrame:
    frame = frame.copy()
    if "quality_flags" not in frame.columns:
        frame["quality_flags"] = ""
    else:
        frame["quality_flags"] = frame["quality_flags"].fillna("")
    temp = frame["temperature_2m_c"]
    impossible_temp = temp.notna() & ((temp < TEMP_C_HARD_MIN) | (temp > TEMP_C_HARD_MAX))
    frame = agent.append_flags(frame, impossible_temp, "temp_outside_physical_bounds")
    agent.decide("WX.RANGE_FLAGS", DATASET, int(impossible_temp.sum()), column="temperature_2m_c")

    extreme_heat = temp.notna() & (temp >= 40) & ~impossible_temp
    frame = agent.append_flags(frame, extreme_heat, "extreme_heat_ge_40c_kept")
    agent.decide(
        "GLOBAL.NO_EXTREME_DISCARD",
        DATASET,
        int(extreme_heat.sum()),
        column="temperature_2m_c",
        details="Kept all observations with temperature >= 40 C.",
    )

    humidity = frame["relative_humidity_pct"]
    bad_humidity = humidity.notna() & ((humidity < HUMIDITY_MIN) | (humidity > HUMIDITY_MAX))
    frame = agent.append_flags(frame, bad_humidity, "humidity_outside_0_100")
    agent.decide("WX.RANGE_FLAGS", DATASET, int(bad_humidity.sum()), column="relative_humidity_pct")

    precip = frame["precipitation_mm"]
    negative_precip = precip.notna() & (precip < 0)
    huge_precip = precip.notna() & (precip > PRECIP_HARD_MAX_MM)
    frame = agent.append_flags(frame, negative_precip, "negative_precipitation")
    frame = agent.append_flags(frame, huge_precip, "hourly_precip_over_500mm")
    agent.decide("WX.RANGE_FLAGS", DATASET, int(negative_precip.sum() + huge_precip.sum()), column="precipitation_mm")

    dry = precip.notna() & (precip == 0)
    agent.decide("WX.ZERO_PRECIP_IS_DRY", DATASET, int(dry.sum()), column="precipitation_mm")
    return frame


def _flag_coverage_and_gaps(frame: pd.DataFrame, agent: DataQualityAgent) -> pd.DataFrame:
    parts = []
    for city, group in frame.groupby("city", sort=False):
        group = group.sort_values("timestamp_utc").copy()
        expected = pd.date_range(group["timestamp_utc"].min(), group["timestamp_utc"].max(), freq="h", tz="UTC")
        missing_n = int(len(expected) - group["timestamp_utc"].nunique())
        if city == "Peshawar":
            group = agent.append_flags(group, pd.Series(True, index=group.index), "coverage_starts_2023_not_2021")
            agent.decide("WX.PESHAWAR_COVERAGE", DATASET, int(len(group)), column="timestamp_utc")
        if missing_n > 0:
            group = agent.append_flags(group, pd.Series(True, index=group.index), "internal_hourly_gaps_in_city_series")
            agent.decide("WX.NO_GAP_FILL", DATASET, missing_n, column="timestamp_utc", details=f"{city} missing {missing_n} hours")
        else:
            agent.decide("WX.NO_GAP_FILL", DATASET, 0, column="timestamp_utc", details=f"{city} has no internal hourly gaps")
        parts.append(group)
    return pd.concat(parts, ignore_index=True)


def clean_weather(agent: DataQualityAgent) -> dict[str, pd.DataFrame]:
    OUT.mkdir(parents=True, exist_ok=True)
    agent.decide("WX.PARSE_UTC", DATASET, 0, column="timestamp_utc")
    agent.decide("WX.FLATTEN_HOURLY_JSON", DATASET, 0)

    frames = []
    city_meta = []
    for slug, city in OPEN_METEO_CITIES.items():
        path = SRC / f"weather_{slug}_raw.json"
        city_frame = _flatten_city_json(path, city)
        frames.append(city_frame)
        city_meta.append(
            {
                "city": city,
                "latitude": city_frame["latitude"].iloc[0],
                "longitude": city_frame["longitude"].iloc[0],
                "elevation_m": city_frame["elevation_m"].iloc[0],
                "n_hours": int(len(city_frame)),
                "start_utc": str(city_frame["timestamp_utc"].min()),
                "end_utc": str(city_frame["timestamp_utc"].max()),
            }
        )
    for path in sorted(RAW_HOURLY_DIR.rglob("weather_*_raw.json")) if RAW_HOURLY_DIR.exists() else []:
        slug = path.name.removeprefix("weather_").removesuffix("_raw.json")
        city = OPEN_METEO_CITIES.get(slug)
        if not city:
            continue
        ingest_frame = _flatten_city_json(path, city)
        ingest_frame["quality_flags"] = "hourly_ingest"
        frames.append(ingest_frame)

    hourly = pd.concat(frames, ignore_index=True)
    hourly["timestamp_utc"] = pd.to_datetime(hourly["timestamp_utc"], utc=True)
    hourly = hourly.sort_values(["city", "timestamp_utc"]).drop_duplicates(
        subset=["city", "timestamp_utc"], keep="first"
    )
    hourly = _flag_ranges(hourly, agent)
    hourly = _flag_coverage_and_gaps(hourly, agent)
    hourly = agent.fill_short_hourly_gaps(hourly, dataset=DATASET)
    hourly["timestamp_utc"] = pd.to_datetime(hourly["timestamp_utc"], utc=True)
    hourly["timestamp_pkt"] = hourly["timestamp_utc"] + pd.Timedelta(hours=PKT_OFFSET_HOURS)
    hourly["row_id"] = hourly["city"] + "|" + hourly["timestamp_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    write_table(OUT / "weather_hourly", hourly, csv=False)

    sample = pd.read_csv(SRC / "pakistan_cities_hourly_heat_rainfall_sample.csv")
    sample["timestamp_utc"] = pd.to_datetime(sample["timestamp_utc"], utc=True)
    sample["timestamp_pkt"] = sample["timestamp_utc"] + pd.Timedelta(hours=PKT_OFFSET_HOURS)
    sample["cadence"] = "6-hourly"
    sample["quality_flags"] = "cadence_is_6_hourly_not_hourly"
    sample = agent.append_flags(sample, sample["temperature_2m_c"] >= 40, "extreme_heat_ge_40c_kept")
    sample["row_id"] = "sample|" + sample["city"] + "|" + sample["timestamp_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    agent.decide("WX.SAMPLE_IS_6HOURLY", DATASET, int(len(sample)), column="timestamp_utc")
    json_max = float(hourly["temperature_2m_c"].max())
    sample_max = float(sample["temperature_2m_c"].max())
    agent.decide(
        "WX.SAMPLE_UNDERSAMPLES_PEAKS",
        DATASET,
        int(len(sample)),
        column="temperature_2m_c",
        details=f"sample_max={sample_max}; hourly_json_max={json_max}",
    )
    write_table(OUT / "weather_6h_sample", sample, csv=False)

    stats = pd.read_csv(SRC / "pakistan_cities_heat_and_rainfall_stats.csv")
    stats["quality_flags"] = ""
    stats = agent.append_flags(stats, stats["city"] == "Peshawar", "incomplete_period_vs_other_cities")
    stats = agent.append_flags(stats, stats["extreme_heat_hours_ge_40c"] == 0, "zero_extreme_heat_hours_is_climate_not_missing")
    stats["row_id"] = "city_stats|" + stats["city"]
    write_table(OUT / "weather_city_stats", stats)

    locations = pd.DataFrame(city_meta)
    locations["row_id"] = "city|" + locations["city"]
    write_table(OUT / "city_locations", locations)

    return {"weather_hourly": hourly, "weather_6h_sample": sample, "weather_city_stats": stats, "city_locations": locations}
