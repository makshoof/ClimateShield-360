"""
Main FastAPI Application for ClimateShield 360 Karachi.
Follows all conventions specified in doc/AGENT_RULES.md:
- Read-only DuckDB access
- Timestamps in UTC, display in PKT (UTC+5)
- Standard envelope: {data, generated_at, is_sample}
- Standard errors: {error, detail}
- CORS for local dev origin
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os
from pathlib import Path

import duckdb
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from db import (
    get_connection,
    get_data_as_of,
    get_db_path,
    get_last_run_summary,
    get_next_run_time,
    get_sources_freshness_meta,
    is_sample_database,
    safe_query,
)
from hourly_supervisor import start_hourly_supervisor, stop_hourly_supervisor
from schemas import (
    APIResponse,
    HealthData,
    LastRunSummary,
    MetaData,
    SourceMetaInfo,
)

# Import routers
from routers.overview import router as overview_router
from routers.freshness import router as freshness_router
from routers.quality import router as quality_router
from routers.predictions import router as predictions_router
from routers.map import router as map_router
from routers.impacts import router as impacts_router
from routers.insight import router as insight_router
from routers.forecast import router as forecast_router
from routers.model import router as model_router
from routers.planner import router as planner_router
from routers.methodology import router as methodology_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """On API start: catch up stale hourly weather and keep refreshing while the app runs."""
    start_hourly_supervisor()
    try:
        yield
    finally:
        stop_hourly_supervisor()


app = FastAPI(
    title="ClimateShield 360 API",
    description="Extreme-weather decision support API for Karachi, Pakistan (Sindh PDMA / KMC)",
    version="0.1.0",
    lifespan=lifespan,
)

# Local + deployed frontends (Render free subdomain climateshield-360.onrender.com)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8002",
    "http://127.0.0.1:8002",
    "https://climateshield-360.onrender.com",
]
_extra_origins = os.getenv("CLIMATESHIELD_CORS_ORIGINS", "")
if _extra_origins.strip():
    origins.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=(
        r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$|"
        r"^https://climateshield-360\.onrender\.com$|"
        r"^https://[a-z0-9-]+\.onrender\.com$|"
        r"^https://[a-z0-9-]+\.trycloudflare\.com$|"
        r"^https://[a-z0-9-]+\.containers\.snapdeploy\.app$|"
        r"^https://[a-z0-9-]+\.hf\.space$|"
        r"^https://huggingface\.co$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure all unhandled exceptions adhere to {error, detail} convention."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
        },
    )


# --- Core System Endpoints ---

@app.get("/api/live")
def live() -> dict:
    """Instant liveness for Render health checks (no DuckDB I/O)."""
    return {"status": "ok"}


@app.get("/api/health", response_model=APIResponse[HealthData])
def health_check() -> APIResponse[HealthData]:
    """
    Health check endpoint returning system and database connectivity status.
    Envelope: {data, generated_at, is_sample}
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    tables: list[str] = []
    db_connected = False

    try:
        conn = get_connection()
        try:
            res = conn.execute("SHOW TABLES;").fetchall()
            tables = [r[0] for r in res]
            db_connected = True
        finally:
            conn.close()
    except Exception as e:
        print(f"[health_check error] {e}")
        db_connected = False

    health_data = HealthData(
        status="ok" if db_connected else "degraded",
        db_connected=db_connected,
        duckdb_version=duckdb.__version__,
        tables_found=tables,
    )

    return APIResponse(
        data=health_data,
        generated_at=now_utc,
        is_sample=is_sample,
    )


@app.get("/api/meta", response_model=APIResponse[MetaData])
def get_meta() -> APIResponse[MetaData]:
    """
    Metadata endpoint returning app info, sample state, latest pipeline run,
    data_as_of, next run, per-source freshness, and is_live (hourly warehouse).
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    last_run_raw = get_last_run_summary()

    last_run = None
    last_run_at = None
    last_run_status = None
    if last_run_raw:
        s_at = last_run_raw.get("started_at")
        f_at = last_run_raw.get("finished_at")
        last_run_at = f_at or s_at
        last_run_status = last_run_raw.get("status")
        last_run = LastRunSummary(
            run_id=last_run_raw.get("run_id"),
            started_at=s_at,
            finished_at=f_at,
            status=last_run_status,
            notes=last_run_raw.get("notes"),
        )

    data_as_of = get_data_as_of()
    next_run_at = get_next_run_time()
    raw_sources, is_live = get_sources_freshness_meta()
    source_meta_items = [
        SourceMetaInfo(
            source_name=s["source_name"],
            age_minutes=s["age_minutes"],
            status=s["status"],
            expected_every_minutes=s["expected_every_minutes"],
            publisher=s.get("publisher"),
            licence=s.get("licence"),
            last_fetched_at=s.get("last_fetched_at"),
            last_data_timestamp=s.get("last_data_timestamp"),
        )
        for s in raw_sources
    ]

    meta = MetaData(
        app_name="ClimateShield 360 Karachi",
        version="0.1.0",
        is_sample=is_sample,
        timezone_stored="UTC",
        timezone_display="PKT (UTC+5)",
        db_path=str(get_db_path()),
        last_run=last_run,
        data_as_of=data_as_of,
        last_run_at=last_run_at,
        last_run_status=last_run_status,
        next_run_at=next_run_at,
        sources=source_meta_items,
        is_live=is_live,
    )

    return APIResponse(
        data=meta,
        generated_at=now_utc,
        is_sample=is_sample,
    )


# Mount feature routers under /api
app.include_router(overview_router, prefix="/api")
app.include_router(freshness_router, prefix="/api")
app.include_router(quality_router, prefix="/api")
app.include_router(predictions_router, prefix="/api")
app.include_router(map_router, prefix="/api")
app.include_router(impacts_router, prefix="/api")
app.include_router(insight_router, prefix="/api")
app.include_router(forecast_router, prefix="/api")
app.include_router(model_router, prefix="/api")
app.include_router(planner_router, prefix="/api")
app.include_router(methodology_router, prefix="/api")

# Production: serve Vite build from the same origin as /api (Render / tunnel hosts)
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    _assets = _FRONTEND_DIST / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/")
    def spa_index():
        return FileResponse(_FRONTEND_DIST / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        """SPA routes — never shadow /api/* (registered above)."""
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse(status_code=404, content={"error": "Not Found", "detail": full_path})
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")
