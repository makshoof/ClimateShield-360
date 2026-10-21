# ClimateShield 360 — single free-tier image (API + built React UI)
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Same-origin /api when served by FastAPI
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM python:3.11-slim-bookworm
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
COPY pipeline/requirements.txt /app/pipeline/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt \
    && pip install --no-cache-dir -r /app/pipeline/requirements.txt

COPY backend/ /app/backend/
COPY warehouse/ /app/warehouse/
COPY pipeline/climateshield/ /app/pipeline/climateshield/
COPY pipeline/data/processed/climateshield.duckdb /app/pipeline/data/processed/climateshield.duckdb
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV PYTHONUNBUFFERED=1 \
    CLIMATESHIELD_DB=/app/pipeline/data/processed/climateshield.duckdb \
    CLIMATESHIELD_AUTO_INGEST=1 \
    CLIMATESHIELD_INGEST_STALE_MINUTES=50 \
    CLIMATESHIELD_INGEST_CHECK_SECONDS=180 \
    PYTHONPATH=/app/pipeline \
    PORT=8000

WORKDIR /app/backend
# Render/Railway set $PORT; Hugging Face Docker Spaces historically used 7860
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
