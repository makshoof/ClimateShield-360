"""Declared forecast coverage for the eight impact areas.

This module does not generate forecasts. A future implementation would:

1. Read only fresh rows from ``predictions`` or an external forecast table.
2. Refuse to copy an observed value into a future timestamp.
3. Return ``unsupported`` when no trained model or licensed forecast feed exists.
4. Attach issue time, horizon, units, and a baseline comparison.
"""

from __future__ import annotations

from typing import Literal, TypedDict


ForecastStatus = Literal["working", "partial", "unsupported"]


class ImpactForecastCoverage(TypedDict):
    impact_area: str
    status: ForecastStatus
    horizon: str
    origin: str
    reason: str


def impact_forecast_coverage() -> list[ImpactForecastCoverage]:
    """Return the audited coverage list. Values are statuses, not predictions."""
    return [
        {
            "impact_area": "physical_heavy_rain",
            "status": "partial",
            "horizon": "1 hour",
            "origin": "saved LightGBM quantile model",
            "reason": (
                "src/models/predict.py writes one next-hour rainfall row per city. "
                "It does not produce a 24-hour or 7-day series. A row older than its "
                "forecast time is stale."
            ),
        },
        {
            "impact_area": "physical_heat",
            "status": "unsupported",
            "horizon": "none",
            "origin": "observations and thresholds only",
            "reason": "Heat is compared with 35/40/45°C thresholds. There is no heat forecast model.",
        },
        {
            "impact_area": "environmental",
            "status": "unsupported",
            "horizon": "none",
            "origin": "observations",
            "reason": (
                "Soil moisture is observed. GloFAS discharge is daily. "
                "Open-Meteo forecast hours are fetched and then dropped before the gold table."
            ),
        },
        {
            "impact_area": "producers",
            "status": "unsupported",
            "horizon": "none",
            "origin": "none",
            "reason": "No crop-stress or yield model is trained. Agricultural loss is not forecast.",
        },
        {
            "impact_area": "economic",
            "status": "unsupported",
            "horizon": "none",
            "origin": "none",
            "reason": "No loss, price, or damage model is trained. Rainfall is not converted into money.",
        },
        {
            "impact_area": "public_health",
            "status": "unsupported",
            "horizon": "none",
            "origin": "none",
            "reason": "No health-outcome model. WBGT is not calculated. Weather is not a diagnosis.",
        },
        {
            "impact_area": "infrastructure",
            "status": "unsupported",
            "horizon": "none",
            "origin": "none",
            "reason": "No model declares a road flooded or a facility damaged. OSM exposure is a snapshot.",
        },
        {
            "impact_area": "social",
            "status": "unsupported",
            "horizon": "none",
            "origin": "none",
            "reason": "Census tables are not a forecast of who will be harmed.",
        },
        {
            "impact_area": "emergency",
            "status": "partial",
            "horizon": "1 hour rainfall probability when a model row exists",
            "origin": "exposure ranking plus optional rain model",
            "reason": (
                "The planner ranks stored exposure. It is not an official warning feed. "
                "Heat has no model probability."
            ),
        },
    ]
