# R2 Setup Guide — TheDipidis DuckDB-WASM Pilot

This guide walks you through setting up Cloudflare R2 so the
Weekly Full Update workflow can upload `city_league_analysis.parquet`
and make it available at `https://data.thedipidis.app/`.

---

## Step 1 — Cloudflare Account

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign in
   (or create a free account).
2. Note your **Account ID** — visible in the right sidebar of the main
   dashboard. You'll need it later.

---

## Step 2 — Create the R2 Bucket

1. In the Cloudflare dashboard sidebar click **R2 Object Storage**.
2. Click **Create bucket**.
3. Bucket name: `thedipidis-data`  (or any name — just note it for the secret)
4. Location: leave as default (**Automatic**).
5. Click **Create bucket**.

---

## Step 3 — Enable Public Access + Custom Domain

1. Open the bucket you just created.
2. Go to **Settings** tab → **Public access**.
3. Click **Allow access** under *R2.dev subdomain* (for quick testing).
4. Under **Custom Domains**, click **Connect Domain**.
5. Enter `data.thedipidis.app` and follow the prompts.
   - Cloudflare will add a CNAME record automatically if your domain
     (`thedipidis.app`) is already proxied through Cloudflare.

---

## Step 4 — CORS Policy

Still in the bucket **Settings** tab, scroll to **CORS policy** and
click **Add CORS policy**. Paste the following JSON:

```json
[
  {
    "AllowedOrigins": [
      "https://thedipidis.app",
      "https://www.thedipidis.app"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Click **Save**.

---

## Step 5 — Create an API Token

1. Go to **My Profile → API Tokens** (top-right avatar menu).
2. Click **Create Token**.
3. Use the **"Edit Cloudflare Workers"** template, or click
   **Create Custom Token** and set:
   - **Token name:** `TheDipidis R2 Upload`
   - **Permissions:**
     - Account → R2 Storage → **Edit**
   - **Account resources:** your account
4. Click **Continue to summary** → **Create Token**.
5. **Copy the token secret immediately** — it's shown only once.
   Also note the **Access Key ID** shown on the next screen.

> Alternatively use **R2 API Tokens** directly from the R2 bucket page:
> Bucket → Settings → R2 API Tokens → Create API token (Object Read & Write).
> This gives you both the Access Key ID and Secret Access Key in one place.

---

## Step 6 — Add GitHub Secrets

Go to your GitHub repo:
**Settings → Secrets and variables → Actions → New repository secret**

Add these four secrets:

| Secret name            | Value                                   |
|------------------------|-----------------------------------------|
| `R2_ACCESS_KEY_ID`     | The Access Key ID from Step 5           |
| `R2_SECRET_ACCESS_KEY` | The secret token from Step 5            |
| `R2_ACCOUNT_ID`        | Your Cloudflare Account ID (Step 1)     |
| `R2_BUCKET`            | `thedipidis-data` (or your bucket name) |

---

## Step 7 — Run the Workflow

1. In GitHub go to **Actions → Weekly Full Update**.
2. Click **Run workflow** → **Run workflow**.
3. Wait for the job to complete (~3–5 min).
4. Check the *"Build Parquet + Upload to R2"* step in the logs.

---

## Step 8 — Verify

Open in your browser:

```
https://data.thedipidis.app/city_league_analysis.parquet
```

Your browser should download a `.parquet` file (not a 403/404 page).

---

## Step 9 — Test the DuckDB Pilot

1. Open [https://thedipidis.app/?duckdb=1](https://thedipidis.app/?duckdb=1)
2. Switch to the **City League** tab.
3. Scroll to the bottom — you'll see the ⚡ **DuckDB-WASM + R2 Pilot** panel.
4. Click **Run pilot query**.
   - First click: Bundle-Bootstrap (~12 MB from jsDelivr, once) + Query → ~5–10 s
   - Second click: Query only → <1 s
5. Output shows ~180 000 rows + Top-10 archetypes.

---

## Troubleshooting

If the pilot panel shows an error, check the Diagnosis checklist in the
panel itself. Common issues:

- **403 Forbidden** — Public access not enabled on the bucket (Step 3).
- **CORS error** — CORS policy missing or wrong origins (Step 4).
- **File not found** — Workflow hasn't run yet, or secrets are wrong (Step 6–7).
- **Secrets not set** — The workflow step is skipped if any of the four secrets
  are missing. Check **Actions → Weekly Full Update → latest run** for the step.

---

## Architecture

```
GitHub Actions (weekly-full-update.yml)
  └─► scripts/build_parquet.py    converts CSV → Parquet (pyarrow/snappy)
  └─► scripts/upload_to_r2.py     uploads via boto3 S3-compatible API

Cloudflare R2 (thedipidis-data bucket)
  └─► city_league_analysis.parquet  (public, served at data.thedipidis.app)

Browser (js/duckdb-pilot.js, only when ?duckdb=1)
  └─► DuckDB-WASM (lazy-loaded from jsDelivr)
  └─► parquet_scan('city_league.parquet')  — HTTP range requests
  └─► SQL query → results rendered in panel
```
