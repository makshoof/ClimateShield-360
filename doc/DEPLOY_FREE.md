# Free deploy — ClimateShield-360 on Render

## Live URL

**https://climateshield-360.onrender.com**

## Deploy (free)

1. Open: https://render.com/deploy?repo=https://github.com/makshoof/ClimateShield-360  
2. Sign in with GitHub (free — no card required for the free web service).  
3. Confirm Blueprint / Docker service name `climateshield-360`.  
4. Wait for the first build (~10–15 minutes).

Or: [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select `makshoof/ClimateShield-360` → apply `render.yaml`.

## What you get

| Piece | Free tier |
| --- | --- |
| React UI + FastAPI | Same origin (`/` + `/api`) |
| DuckDB warehouse | Baked into the Docker image |
| Hourly ingest | `CLIMATESHIELD_AUTO_INGEST=1` while the instance is awake |
| Cold start | First request after idle ~30–60s |

## Local Docker check

```bash
docker build -t climateshield-360 .
docker run --rm -p 8000:8000 climateshield-360
```

Open http://127.0.0.1:8000
