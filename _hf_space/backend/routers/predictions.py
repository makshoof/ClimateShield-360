"""
Predictions router for ClimateShield 360 Karachi.
Follows all conventions from doc/AGENT_RULES.md:
- Rule 5: Always show uncertainty intervals and the baseline comparison where predictions appear.
- Standard envelope: {data, generated_at, is_sample}
- Read-only DuckDB access
"""

from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Query

from db import is_sample_database, safe_query
from schemas import (
    APIResponse,
    Prediction,
    ModelEval,
)

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.get("", response_model=APIResponse[List[Prediction]])
def list_predictions(
    zone_id: Optional[str] = Query(None, description="Filter by Karachi Zone ID (e.g. KHI-SOUTH)"),
    hazard_type: Optional[str] = Query(None, description="Filter by hazard (heat or heavy_rain)"),
    limit: int = Query(100, ge=1, le=500),
) -> APIResponse[List[Prediction]]:
    """
    Returns probabilistic predictions with uncertainty intervals [interval_low, interval_high]
    and the declared baseline comparison value (Rule 5).
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    where_clauses = []
    params = []

    if zone_id:
        where_clauses.append("zone_id = ?")
        params.append(zone_id)
    if hazard_type:
        where_clauses.append("hazard_type = ?")
        params.append(hazard_type)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    query = f"""
        SELECT 
            zone_id,
            forecast_time,
            hazard_type,
            probability,
            interval_low,
            interval_high,
            baseline_value
        FROM predictions
        {where_sql}
        ORDER BY forecast_time ASC, zone_id ASC
        LIMIT ?;
    """
    params.append(limit)

    rows = safe_query(query, params)
    data: List[Prediction] = []
    for r in rows:
        data.append(
            Prediction(
                zone_id=r["zone_id"],
                forecast_time=r["forecast_time"],
                hazard_type=r["hazard_type"],
                probability=float(r["probability"]),
                interval_low=float(r["interval_low"]),
                interval_high=float(r["interval_high"]),
                baseline_value=float(r["baseline_value"]),
            )
        )

    return APIResponse(
        data=data,
        generated_at=now_utc,
        is_sample=is_sample,
    )
