# Deploy ClimateShield-360 on Hugging Face Spaces (free, stable)

Judges want an HF Space. This repo’s root `Dockerfile` is Spaces-ready (listens on **7860**).

## One-time login (you)

1. Create a free account: https://huggingface.co/join  
2. Create a token (write access): https://huggingface.co/settings/tokens  
3. In PowerShell from the project root:

```powershell
huggingface-cli login
# paste the token when asked
```

Or non-interactive:

```powershell
huggingface-cli login --token "hf_YOUR_TOKEN_HERE"
```

## Create + push the Space

```powershell
# From climateshield-360 root (after login)
huggingface-cli repo create ClimateShield-360 --type space --space_sdk docker --private false

git remote add hf https://huggingface.co/spaces/YOUR_HF_USERNAME/ClimateShield-360
git push hf main:main
```

Replace `YOUR_HF_USERNAME` with your HF username.

Space URL will be:

**https://YOUR_HF_USERNAME-ClimateShield-360.hf.space**

First build takes 10–20 minutes (frontend npm + DuckDB image).

## What judges see

Same app as local: Overview, status (freshness / quality / last run), Risk Map, Forecast, etc. on one URL.
