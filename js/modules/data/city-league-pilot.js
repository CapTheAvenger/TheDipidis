// @ts-check
/**
 * data/city-league-pilot.js — visible demo of the DuckDB-WASM + R2
 * data path on the city-league dataset.
 *
 * Purpose
 * -------
 * First half of the DuckDB-WASM pilot is the data side (Parquet build
 * + R2 upload — see R2_SETUP.md). This module is the user-visible
 * proof that the chain works end-to-end:
 *
 *   - Pilot opt-in via ?duckdb=1 in the URL
 *   - On City League tab open, fetch the Parquet snapshot from R2
 *   - Run a query against it directly in the browser (HTTP-Range,
 *     column-pruning, predicate-pushdown — no full download)
 *   - Show row count + top archetypes + query latency for tangible
 *     before/after comparison against the existing CSV-from-repo path
 *
 * The legacy CSV-driven city-league rendering stays untouched. Once
 * this pilot is signed off, follow-up commits migrate specific
 * production query paths one by one.
 */

import { ddQuery, getDataBaseUrl, isDuckDbPilotEnabled } from './duckdb-loader.js';

const PANEL_ID = 'city-league-duckdb-pilot';
const PARQUET_FILENAME = 'city_league_analysis.parquet';

let _ranOnce = false;

/**
 * Mount the pilot panel inside the City League tab IF the user opted
 * in via ?duckdb=1. Idempotent — safe to call multiple times.
 */
export function mountCityLeaguePilot() {
    if (!isDuckDbPilotEnabled()) return;

    const host = document.getElementById('city-league');
    if (!host) return;
    if (document.getElementById(PANEL_ID)) return; // already mounted

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'duckdb-pilot-panel';
    panel.innerHTML = `
        <h3 class="duckdb-pilot-title">⚡ DuckDB-WASM + R2 Pilot</h3>
        <p class="duckdb-pilot-subtitle">
            Querying <code>${PARQUET_FILENAME}</code> directly from
            <code>${escapeHtml(getDataBaseUrl())}</code> via DuckDB-WASM.
            Initial load fetches the ~12 MB WASM bundle from jsDelivr; subsequent
            queries reuse the same connection.
        </p>
        <button type="button" class="duckdb-pilot-btn" id="${PANEL_ID}-run">Run pilot query</button>
        <div class="duckdb-pilot-status" id="${PANEL_ID}-status"></div>
        <pre class="duckdb-pilot-output" id="${PANEL_ID}-output"></pre>
    `;
    host.appendChild(panel);

    const runBtn = document.getElementById(`${PANEL_ID}-run`);
    if (runBtn) runBtn.addEventListener('click', runPilotQuery);
}

async function runPilotQuery() {
    const statusEl = document.getElementById(`${PANEL_ID}-status`);
    const outputEl = document.getElementById(`${PANEL_ID}-output`);
    if (!statusEl || !outputEl) return;

    /**
     * @param {string} msg
     * @param {string} [kind]
     */
    const setStatus = (msg, kind) => {
        statusEl.textContent = msg;
        statusEl.className = 'duckdb-pilot-status' + (kind ? ' duckdb-pilot-status-' + kind : '');
    };

    const url = `${getDataBaseUrl()}/${PARQUET_FILENAME}`;
    const sqlPath = url.replace(/'/g, "''"); // escape single quotes for SQL literal

    setStatus(_ranOnce ? 'Running query…' : 'Bootstrapping DuckDB-WASM (~12 MB on first call)…');
    outputEl.textContent = '';

    const tQueryStart = performance.now();
    try {
        // SELECT 1 just to wake the engine cleanly + surface CSP / CORS
        // errors early with a clear message before the real query runs.
        if (!_ranOnce) {
            await ddQuery("SELECT 1");
            setStatus('Engine ready. Querying R2…');
        }

        const rowCountRes = await ddQuery(
            `SELECT COUNT(*) AS n FROM read_parquet('${sqlPath}')`
        );
        const rowCount = Number(rowCountRes.toArray()[0]?.n ?? 0);

        const topRes = await ddQuery(`
            SELECT archetype, COUNT(*) AS rows, SUM(deck_inclusion_count) AS inclusions
            FROM read_parquet('${sqlPath}')
            GROUP BY archetype
            ORDER BY inclusions DESC NULLS LAST
            LIMIT 10
        `);
        const top = topRes.toArray().map((r) => ({
            archetype: String(r.archetype),
            rows: Number(r.rows),
            inclusions: Number(r.inclusions),
        }));

        const tElapsed = (performance.now() - tQueryStart) / 1000;
        _ranOnce = true;
        setStatus(`OK — ${rowCount.toLocaleString('de-DE')} rows scanned in ${tElapsed.toFixed(2)} s`, 'ok');

        const lines = [
            `Source: ${url}`,
            `Rows total: ${rowCount.toLocaleString('de-DE')}`,
            `Query time: ${tElapsed.toFixed(2)} s (includes the WASM bootstrap on first call)`,
            '',
            'Top 10 archetypes by total deck-inclusion count:',
            '',
        ];
        const pad = (s, n) => String(s).padEnd(n);
        lines.push(`  ${pad('#', 4)}${pad('archetype', 32)}${pad('rows', 10)}inclusions`);
        lines.push(`  ${'-'.repeat(4 + 32 + 10 + 12)}`);
        top.forEach((row, i) => {
            lines.push(`  ${pad(i + 1, 4)}${pad(row.archetype, 32)}${pad(row.rows.toLocaleString('de-DE'), 10)}${row.inclusions.toLocaleString('de-DE')}`);
        });
        outputEl.textContent = lines.join('\n');
    } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        setStatus(`Failed: ${msg}`, 'err');
        outputEl.textContent = [
            'DuckDB pilot query failed.',
            '',
            'Most common causes:',
            '  1. R2 bucket not yet configured — see R2_SETUP.md and verify',
            `     ${url} returns 200 in your browser`,
            '  2. CORS not configured on the R2 bucket — Range + ETag headers',
            '     must be in AllowedHeaders, see Step 3 of R2_SETUP.md',
            '  3. CSP blocking the connect — check devtools console',
            '',
            'Full error:',
            msg,
            (err && err.stack) ? '\n' + err.stack : '',
        ].join('\n');
    }
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Mount on DOMContentLoaded so the city-league div is in the DOM.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountCityLeaguePilot, { once: true });
    } else {
        mountCityLeaguePilot();
    }
}
