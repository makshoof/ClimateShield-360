# Free deploy — ClimateShield-360

## Live now (no cloud API key)

Repo: [makshoof/ClimateShield-360](https://github.com/makshoof/ClimateShield-360)

GitHub Actions workflow **Host ClimateShield-360** builds the SPA + API and publishes a public Cloudflare quick-tunnel URL. The current URL is written to the `live` branch (`live/URL.txt`) and set as the repo homepage. The job relaunches about every 5 hours (Actions max ~6h).

Trigger manually: Actions → Host ClimateShield-360 → Run workflow.

## Optional: Render named subdomain

**https://climateshield-360.onrender.com**

1. Sign up at [render.com](https://render.com) with GitHub (free).
2. Open **Blueprints** → **New Blueprint Instance**.
3. Select repo `makshoof/ClimateShield-360` (branch `main`).
4. Apply `render.yaml` — service name is `climateshield-360`.
5. Wait for the Docker build (~10–15 min first time).

Or use Render’s “New Web Service” → connect this repo → **Docker** → name `climateshield-360` → plan **Free**.

## What you get

| Piece | Behavior on free tier |
| --- | --- |
| React UI + FastAPI | Same URL (`/api` + SPA) |
| DuckDB warehouse | Baked into the image |
| Hourly ingest | Off by default (`CLIMATESHIELD_AUTO_INGEST=0`) — free instances sleep when idle |
| Cold start | First request after idle can take ~30–60s |

## Local Docker check

```bash
docker build -t climateshield-360 .
docker run --rm -p 8000:8000 climateshield-360
```

Open http://127.0.0.1:8000

## Notes

- Map tiles: set `VITE_CARTO_API_KEY` as a Docker build-arg / Render build env if you want Carto basemap in production.
- Re-enable ingest only if you accept ephemeral disk writes: `CLIMATESHIELD_AUTO_INGEST=1`.
