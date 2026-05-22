// @ts-check
/**
 * data/duckdb-loader.js — lazy singleton bootstrapper for DuckDB-WASM.
 *
 * Why this exists
 * ---------------
 * Part of the DuckDB-WASM pilot. The aim is to stream queryable data
 * from Parquet snapshots hosted on R2 instead of downloading whole
 * CSVs into memory. Parquet via HTTP-Range gets column-pruning + row-
 * group skipping; on the city-league 40 MB CSV that compresses to a
 * ~1.5 MB Parquet, with queries only fetching the bytes they need.
 *
 * Lazy + singleton: the ~12 MB DuckDB-WASM bundle is only fetched the
 * first time getDuckDB() is called, so users without the ?duckdb=1
 * pilot flag never pay the cost. The bundle ships from jsDelivr's
 * +esm endpoint — same pattern as Chart.js / PapaParse / localForage
 * (existing CDN libs) so esbuild doesn't have to embed it.
 *
 * Errors don't poison the cache permanently: if instantiate() rejects
 * (network blip, CSP violation, browser missing WebAssembly support)
 * the promise stays rejected for the current call but the slot is
 * cleared so a future getDuckDB() can retry.
 */

// Pinned to the npm `latest` dist-tag as of 2026-05-22. duckdb-wasm
// only publishes dev versions to npm — there is no stable 1.x.x — so
// this looks like a pre-release pin but it IS the recommended channel
// per the npm dist-tags. Bump this constant + the cache-bump script
// when upstream cuts a newer dev that we want to track.
const DUCKDB_VERSION = '1.33.1-dev45.0';
const JSDELIVR_BASE = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}`;

/** @type {Promise<{ db: any, conn: any }> | null} */
let _instance = null;

/**
 * Returns a connected DuckDB-WASM instance. Subsequent calls return
 * the same instance.
 *
 * @returns {Promise<{ db: any, conn: any }>}
 */
export function getDuckDB() {
    if (!_instance) {
        _instance = bootstrap().catch((err) => {
            // Clear the cached rejection so a future call can retry
            // (e.g. user toggles the network back on, CSP fix shipped).
            _instance = null;
            throw err;
        });
    }
    return _instance;
}

async function bootstrap() {
    // Dynamic ESM import — webpack/esbuild leaves this as-is, the
    // browser performs the actual fetch against jsDelivr.
    /** @type {any} */ const duckdb = await import(/* @vite-ignore */ `${JSDELIVR_BASE}/+esm`);

    // The jsDelivr bundle catalog lists `mvp`/`eh`/`coi` variants.
    // selectBundle picks the best one supported by the current browser
    // without us having to feature-detect WASM-EH / threading.
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    // The worker script lives on jsDelivr too. We can't `new Worker(url)`
    // it directly because Workers must originate from the same origin
    // — wrap it in a same-origin blob: URL that just importScripts()'s
    // the remote script. CSP needs `worker-src 'self' blob:`.
    const workerSource = `importScripts("${bundle.mainWorker}");`;
    const workerBlob = new Blob([workerSource], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    try {
        const worker = new Worker(workerUrl);
        const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
        const db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        const conn = await db.connect();
        return { db, conn };
    } finally {
        URL.revokeObjectURL(workerUrl);
    }
}

/**
 * Convenience wrapper: opens (or reuses) the connection and runs a
 * SQL query. Returns an Apache Arrow Table. Use `.toArray()` on the
 * result if you want plain JS objects.
 *
 * @param {string} sql
 * @returns {Promise<any>}
 */
export async function ddQuery(sql) {
    const { conn } = await getDuckDB();
    return conn.query(sql);
}

/**
 * Resolve the base URL where Parquet snapshots live. Order:
 *   1. window.DATA_BASE_URL_OVERRIDE if set (dev escape hatch).
 *   2. The configured pilot host below.
 *
 * Pilot host is the Cloudflare R2 public dev URL (pub-*.r2.dev). It's
 * account-specific and per-bucket so the hash here is fine to hard-code
 * — anyone forking this repo would need their own R2 bucket and would
 * swap this constant anyway. When the production custom domain
 * (data.thedipidis.app) gets wired up on the same Cloudflare account
 * that owns the apex, flip DATA_BASE_URL_DEFAULT to that and ship —
 * the URL change is fully backwards-compatible (R2 keeps serving both).
 *
 * @returns {string}
 */
const DATA_BASE_URL_DEFAULT = 'https://pub-c006f834c8e04fc3a12707e34789801b.r2.dev';
// Future production switch (once data.thedipidis.app is on the same CF account):
//   const DATA_BASE_URL_DEFAULT = 'https://data.thedipidis.app';

export function getDataBaseUrl() {
    try {
        /** @type {any} */ const w = window;
        if (w && typeof w.DATA_BASE_URL_OVERRIDE === 'string' && w.DATA_BASE_URL_OVERRIDE) {
            return /** @type {string} */ (w.DATA_BASE_URL_OVERRIDE).replace(/\/+$/, '');
        }
    } catch (_) { /* SSR / non-DOM contexts — fall through */ }
    return DATA_BASE_URL_DEFAULT;
}

/**
 * Is the DuckDB pilot enabled for this session? URL-only opt-in, same
 * pattern as the IA-refactor flag — closing+reopening the tab returns
 * the user to the safe default (CSV-from-repo path).
 *
 * @returns {boolean}
 */
export function isDuckDbPilotEnabled() {
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get('duckdb') === '1';
    } catch (_) {
        return false;
    }
}
