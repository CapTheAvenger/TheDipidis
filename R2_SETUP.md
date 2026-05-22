# R2 Setup — DuckDB-WASM Pilot

This guide walks you through the one-time Cloudflare setup so the
weekly workflow can build Parquet snapshots from the scraped CSVs and
ship them to a public R2 bucket where the frontend can stream them
via HTTP-Range queries.

## What this enables

The DuckDB-WASM pilot streams data via HTTP-Range requests instead of
downloading whole CSVs. The data files need to live on a
range-friendly host with CORS configured for `thedipidis.app`. R2 is
the cheapest fit (10 GB storage + 1 M class-A ops free per month, no
egress fees to the public internet) and speaks the S3 API, so the
existing `scripts/upload_to_r2.py` (boto3) works against it without
any provider-specific glue.

## Prerequisites

- A Cloudflare account (free tier works)
- ~15 min of setup time

## Step 1 — Create the R2 bucket

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**
2. Bucket name: `thedipidis-data` (or whatever you want — set it as a
   secret below)
3. Location hint: **EU** (most TheDipidis users are in Europe)
4. **Create bucket**

## Step 2 — Make the bucket reachable from the browser

Two options. Pick one — the frontend supports both via the
`DATA_BASE_URL_DEFAULT` constant in
`js/modules/data/duckdb-loader.js`.

### Option A — Public read via R2.dev subdomain (quickest, current setup)

1. Bucket settings → **Public access** → enable **R2.dev subdomain**
2. Copy the generated URL: `https://pub-<hash>.r2.dev`
3. Set `DATA_BASE_URL_DEFAULT` in `js/modules/data/duckdb-loader.js`
   to this URL.

Downside: the URL is opaque and Cloudflare reserves the right to
rate-limit `pub-*.r2.dev` traffic. Fine for a pilot; switch to
Option B before promoting out of pilot.

### Option B — Custom domain `data.thedipidis.app` (production)

Requires the apex `thedipidis.app` to be on the same Cloudflare
account as the R2 bucket. If it lives on a different account, stay
on Option A until you migrate the DNS zone (or until you set up a
worker-route proxy from the apex CF account).

1. Bucket settings → **Public access** → **Connect Domain**
2. Enter `data.thedipidis.app`
3. Cloudflare auto-creates the DNS record on the parent zone
4. Wait ~30 s for SSL provisioning to complete
5. Flip `DATA_BASE_URL_DEFAULT` in `js/modules/data/duckdb-loader.js`
   to `https://data.thedipidis.app`.

## Step 3 — CORS configuration

R2 buckets ship CORS-disabled. DuckDB-WASM issues HTTP-Range requests
with the `Range` header + `If-None-Match` for caching — both need
explicit CORS allow-list entries.

In the bucket settings → **CORS Policy**, paste:

```json
[
  {
    "AllowedOrigins": [
      "https://thedipidis.app",
      "https://www.thedipidis.app",
      "http://localhost:8000",
      "http://127.0.0.1:8000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "If-None-Match", "If-Modified-Since"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified"],
    "MaxAgeSeconds": 3600
  }
]
```

The `localhost` entries let you test the pilot from a local dev
server. Trim them before going to production if you prefer a tighter
policy.

## Step 4 — Create an API token with bucket write access

The weekly workflow needs credentials to push the freshly-built
Parquet files into the bucket.

1. R2 → **Manage R2 API Tokens** → **Create API token**
2. Permissions: **Object Read & Write**
3. Specify bucket: `thedipidis-data` (only)
4. TTL: leave at default (no expiry) or set a 1-year cap
5. **Create API Token**
6. **Copy the Access Key ID + Secret Access Key** — Cloudflare only
   shows the secret once.

## Step 5 — Plug the credentials into GitHub Actions

On `github.com/CapTheAvenger/TheDipidis` → **Settings** → **Secrets
and variables** → **Actions** → **New repository secret**, add **four**
secrets:

| Name                   | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| `R2_ACCESS_KEY_ID`     | Access Key ID from Step 4                                 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key from Step 4                             |
| `R2_ACCOUNT_ID`        | Your Cloudflare account ID (R2 dashboard → right sidebar) |
| `R2_BUCKET`            | `thedipidis-data`                                         |

The weekly workflow's "Build Parquet + Upload to R2" step is gated on
all four being present (`env.R2_ACCESS_KEY_ID != '' && …`). Until then
the workflow stays green but skips that step.

## Step 6 — Verify

Manually trigger the workflow:

1. **Actions** tab → **Weekly Full Update** → **Run workflow**
2. Watch for the `Build Parquet + Upload to R2` step. It calls
   `scripts/build_parquet.py` (CSV → Parquet) then
   `scripts/upload_to_r2.py` (boto3 PUT).
3. Test the public URL in your browser. Use whichever URL matches
   the option you picked in Step 2:
   - Option A: `https://pub-<your-hash>.r2.dev/city_league_analysis.parquet`
   - Option B: `https://data.thedipidis.app/city_league_analysis.parquet`

   The browser should download the binary Parquet file. Real size for
   the city-league snapshot is ~1.5 MB (27× smaller than the source
   CSV — Snappy compression on this dataset is excellent).

4. Confirm CORS works for HTTP-Range queries. In the browser devtools
   console while on https://thedipidis.app:
   ```js
   (async () => {
     const r = await fetch('https://pub-<your-hash>.r2.dev/city_league_analysis.parquet', {
       method: 'HEAD',
     });
     console.log(
       'status:',
       r.status,
       '| size:',
       r.headers.get('content-length'),
       '| ranges:',
       r.headers.get('accept-ranges')
     );
   })();
   ```
   Expected: `status: 200`, the byte size, `ranges: bytes`. CORS error
   → re-check Step 3 (origins list must include `https://thedipidis.app`).

## Cost expectation

For the city-league pilot at the current data volume:

- Storage: ~1.5 MB per snapshot, replaced weekly → well under the
  10 GB free tier (would take >5000 weeks to fill).
- Class-A operations (writes): 1 PUT per week → ~4-5/month → far
  below the 1 M free tier.
- Class-B operations (reads): SW caches the Parquet for a week;
  ~1-2 fetches per active user per week. At 10k weekly active users
  you'd be at ~80k reads/month — within the 10 M Class-B free tier.
- Egress: free per R2's pricing model.

Net: **$0/month** at current scale.

## Local dev override

To test against a different host (a local file server, a second R2
bucket, etc.) without changing source:

```bash
# Terminal 1: build the Parquet locally (writes data/*.parquet)
python scripts/build_parquet.py

# Terminal 2: serve the data/ folder
python -m http.server 8000 --directory data
```

Then in the browser devtools console BEFORE the page boots (e.g.
right after opening devtools on a fresh tab on thedipidis.app or your
local SPA):

```js
window.DATA_BASE_URL_OVERRIDE = 'http://localhost:8000';
location.reload();
```

The override beats `DATA_BASE_URL_DEFAULT` from
`js/modules/data/duckdb-loader.js`. To return to the configured
default, just `delete window.DATA_BASE_URL_OVERRIDE` and reload.

## Rollback

If R2 has an outage or the upload breaks:

1. **Without `?duckdb=1`** (the default for every user): the legacy
   CSV-from-repo path runs unchanged. The whole pilot is opt-in;
   nothing user-visible breaks.
2. **With `?duckdb=1` but R2 unreachable**: the visible pilot panel
   inside the City League tab shows a red error message
   ("Failed: …"). The rest of the page renders normally from the CSV
   path. The error message lists the most common causes (R2 not
   configured, CORS missing, CSP blocking, network).
3. To fully disable the pilot: delete the four GH-Actions secrets and
   the weekly workflow stops uploading. Old Parquet files in R2 keep
   serving until you delete them in the dashboard.
