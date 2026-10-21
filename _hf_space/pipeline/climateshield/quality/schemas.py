"""Pandera schemas the Data Quality Agent runs on gold tables."""

from __future__ import annotations

from pandera.pandas import Check, Column, DataFrameSchema

weather_hourly_schema = DataFrameSchema(
    {
        "row_id": Column(str, unique=True, nullable=False),
        "city": Column(str, nullable=False),
        "timestamp_utc": Column(nullable=False),
        "temperature_2m_c": Column(float, nullable=True, coerce=True),
        "precipitation_mm": Column(float, Check.ge(0), nullable=True, coerce=True),
        "relative_humidity_pct": Column(
            float, Check.in_range(0, 100), nullable=True, coerce=True
        ),
        "quality_flags": Column(str, nullable=True),
    },
    coerce=True,
    strict=False,
)

district_schema = DataFrameSchema(
    {
        "row_id": Column(str, unique=True, nullable=False),
        "ADM2_PCODE": Column(str, unique=True, nullable=False),
        "region_name": Column(str, nullable=False),
        "pbs_total_pop": Column("int64", Check.ge(0), coerce=True, nullable=True),
    },
    coerce=True,
    strict=False,
)

river_schema = DataFrameSchema(
    {
        "row_id": Column(str, unique=True, nullable=False),
        "station_name": Column(str, nullable=False),
        "low_flood_cusecs": Column("int64", Check.gt(0), coerce=True),
        "low_flood_cms": Column(float, Check.gt(0), coerce=True),
    },
    coerce=True,
    strict=False,
)

facility_schema = DataFrameSchema(
    {
        "row_id": Column(str, unique=True, nullable=False),
        "ADM2_PCODE": Column(str, unique=True, nullable=False),
        "education_count": Column("int64", Check.ge(0), coerce=True),
        "hospitals_count": Column("int64", Check.ge(0), coerce=True),
    },
    coerce=True,
    strict=False,
)

SCHEMAS = {
    "weather_hourly": weather_hourly_schema,
    "district_snapshot": district_schema,
    "pmd_river_danger_levels": river_schema,
    "osm_emergency_facilities": facility_schema,
}
