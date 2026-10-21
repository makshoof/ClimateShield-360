"""Shared observed-hazard thresholds for Overview and Risk Map.

District colors must follow live weather_hourly at the Karachi point, not the
seeded exposure_index ranks (those have no weather time).
"""

from typing import Optional


def heat_level(temp_c: Optional[float]) -> str:
    """Match the forecast page thresholds. A missing reading is not Severe."""
    if temp_c is None or temp_c < 35:
        return "Low"
    if temp_c < 40:
        return "Moderate"
    if temp_c < 45:
        return "High"
    return "Severe"


def rain_level(max_hour_mm: Optional[float]) -> str:
    """Match the heavy-rain hourly thresholds. A dry window is Low."""
    if max_hour_mm is None or max_hour_mm < 1:
        return "Low"
    if max_hour_mm < 2.5:
        return "Moderate"
    if max_hour_mm < 10:
        return "High"
    return "Severe"
