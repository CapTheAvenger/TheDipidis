/**
 * duckdb-pilot.js
 * ⚡ DuckDB-WASM + R2 Pilot Panel
 *
 * Activated only when URL contains ?duckdb=1
 * Injects a demo panel at the bottom of the City-League tab that
 * runs a sample DuckDB-SQL query against the Parquet file hosted on
 * Cloudflare R2.
 *
 * Bundle bootstrap (~12 MB from jsDelivr) is loaded lazily on first
 * "Run pilot query" click so normal users are completely unaffected.
 */

(function () {
  'use strict';

  const R2_URL = 'https://data.thedipidis.app/city_league_analysis.parquet';
  const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@latest/dist';

  // Only activate when ?duckdb=1 is present
  const params = new URLSearchParams(window.location.search);
  if (!params.has('duckdb')) return;

  let _db = null;
  let _bootstrapping = false;

  // ------------------------------------------------------------------ //
  // Panel HTML
  // ------------------------------------------------------------------ //
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'duckdb-pilot-panel';
    panel.style.cssText = [
      'margin: 24px 0',
      'padding: 16px 20px',
      'border: 2px dashed #3b82f6',
      'border-radius: 8px',
      'background: #eff6ff',
      'font-family: system-ui, sans-serif',
      'font-size: 14px',
    ].join(';');

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:18px;">⚡</span>
        <strong style="color:#1d4ed8;font-size:15px;">DuckDB-WASM + R2 Pilot</strong>
        <span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:11px;">
          ?duckdb=1
        </span>
      </div>
      <p style="margin:0 0 12px;color:#374151;">
        Pilot query: Top 10 archetypes by total tournament appearances
        from the full city-league Parquet (~180 k rows) via DuckDB-WASM.
      </p>
      <button id="duckdb-pilot-run"
        style="background:#2563eb;color:#fff;border:none;padding:8px 18px;
               border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
        ▶ Run pilot query
      </button>
      <span id="duckdb-pilot-status"
        style="margin-left:12px;color:#6b7280;font-size:12px;"></span>
      <div id="duckdb-pilot-error"
        style="display:none;margin-top:12px;padding:10px;background:#fef2f2;
               border:1px solid #fca5a5;border-radius:6px;color:#dc2626;font-size:12px;">
      </div>
      <div id="duckdb-pilot-result" style="display:none;margin-top:14px;">
        <div id="duckdb-pilot-meta" style="color:#6b7280;font-size:12px;margin-bottom:8px;"></div>
        <table id="duckdb-pilot-table"
          style="border-collapse:collapse;width:100%;font-size:12px;">
        </table>
      </div>
    `;
    return panel;
  }

  // ------------------------------------------------------------------ //
  // Bootstrap DuckDB-WASM (lazy, once)
  // ------------------------------------------------------------------ //
  async function bootstrapDuckDB() {
    if (_db) return _db;
    if (_bootstrapping) throw new Error('Already bootstrapping');
    _bootstrapping = true;

    // Dynamically import the ES module bundle
    const mod = await import(`${JSDELIVR_BASE}/duckdb-browser-mvp.module.js`);
    const duckdb = mod;

    const DUCKDB_CONFIG = {
      locateFile: (f) => `${JSDELIVR_BASE}/${f}`,
    };

    const bundle = await duckdb.selectBundle(DUCKDB_CONFIG);
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    _db = db;
    return db;
  }

  // ------------------------------------------------------------------ //
  // Run the pilot query
  // ------------------------------------------------------------------ //
  async function runQuery() {
    const btn = document.getElementById('duckdb-pilot-run');
    const status = document.getElementById('duckdb-pilot-status');
    const errorDiv = document.getElementById('duckdb-pilot-error');
    const resultDiv = document.getElementById('duckdb-pilot-result');
    const metaDiv = document.getElementById('duckdb-pilot-meta');
    const table = document.getElementById('duckdb-pilot-table');

    btn.disabled = true;
    errorDiv.style.display = 'none';
    resultDiv.style.display = 'none';
    const t0 = performance.now();

    try {
      status.textContent = _db ? 'Querying…' : 'Bootstrapping DuckDB (~12 MB, once)…';

      const db = await bootstrapDuckDB();

      status.textContent = 'Fetching Parquet from R2…';
      const conn = await db.connect();

      // Register the remote Parquet file
      await db.registerFileURL('city_league.parquet', R2_URL, 4 /* HTTP */, false);

      status.textContent = 'Running SQL…';
      const result = await conn.query(`
        SELECT
          archetype_name,
          COUNT(*) AS appearances,
          ROUND(AVG(CAST(final_standing AS DOUBLE)), 1) AS avg_standing
        FROM parquet_scan('city_league.parquet')
        WHERE archetype_name IS NOT NULL
          AND archetype_name != ''
        GROUP BY archetype_name
        ORDER BY appearances DESC
        LIMIT 10
      `);

      await conn.close();

      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      const rows = result.toArray();
      const totalRows = await (async () => {
        const c2 = await db.connect();
        const r = await c2.query("SELECT COUNT(*) as n FROM parquet_scan('city_league.parquet')");
        await c2.close();
        return Number(r.toArray()[0].n);
      })();

      // Render meta
      metaDiv.textContent = `${totalRows.toLocaleString()} total rows · query in ${elapsed}s`;

      // Render table
      const cols = ['archetype_name', 'appearances', 'avg_standing'];
      table.innerHTML = `
        <thead>
          <tr style="background:#dbeafe;">
            ${cols.map(c => `<th style="padding:6px 10px;text-align:left;border-bottom:2px solid #93c5fd;">${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => `
            <tr style="background:${i % 2 ? '#f0f9ff' : '#fff'};">
              ${cols.map(c => `<td style="padding:5px 10px;border-bottom:1px solid #e0e7ef;">${row[c] ?? ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      `;

      status.textContent = `✅ ${elapsed}s`;
      resultDiv.style.display = 'block';

    } catch (err) {
      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      status.textContent = `❌ failed after ${elapsed}s`;
      errorDiv.innerHTML = `
        <strong>Error:</strong> ${err.message}<br><br>
        <strong>Diagnosis checklist:</strong><br>
        • R2 Bucket public? → Cloudflare R2 → Settings → Public access enabled<br>
        • Custom domain data.thedipidis.app configured in R2?<br>
        • CORS policy allows GET from thedipidis.app?<br>
        • Parquet file uploaded? Run workflow → Weekly Full Update first.<br>
        • GitHub Secrets set? R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET
      `;
      errorDiv.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------ //
  // Inject panel when City-League tab is visible
  // ------------------------------------------------------------------ //
  function injectPanel() {
    if (document.getElementById('duckdb-pilot-panel')) return;

    // Find the city-league content container
    const container =
      document.querySelector('#city-league-content') ||
      document.querySelector('[data-tab="city-league"]') ||
      document.querySelector('.city-league-tab-content') ||
      document.querySelector('#tab-city-league');

    if (!container) return;

    const panel = createPanel();
    container.appendChild(panel);

    document.getElementById('duckdb-pilot-run').addEventListener('click', runQuery);
  }

  // ------------------------------------------------------------------ //
  // Watch for tab switches (app uses custom tab routing)
  // ------------------------------------------------------------------ //
  function watchForCityLeagueTab() {
    // Try immediately
    injectPanel();

    // Also watch for DOM changes (tab content loaded dynamically)
    const observer = new MutationObserver(() => injectPanel());
    observer.observe(document.body, { childList: true, subtree: true });

    // Also listen for hashchange / popstate
    window.addEventListener('hashchange', injectPanel);
    window.addEventListener('popstate', injectPanel);
  }

  // Start watching after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForCityLeagueTab);
  } else {
    watchForCityLeagueTab();
  }
})();
