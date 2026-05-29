/**
 * Data-index fetcher for the Telegram bot.
 *
 * Right now the only index we read is `bot-deck-index.json` —
 * generated at deploy time by `scripts/generate-bot-deck-index.py`.
 * Future sources (e.g. matchup tables, tournament rosters) can hang
 * off this same cached-fetch helper.
 *
 * 5-minute in-memory TTL keeps repeat menu opens cheap without
 * letting users sit on stale data across deploys. Falls back to an
 * empty shape if the URL 404s so callers can render a friendly
 * "noch nicht verfügbar" instead of crashing.
 */

const SITE_BASE = process.env.SITE_BASE || 'https://thedipidis.app';
const INDEX_URL = `${SITE_BASE}/data/bot-deck-index.json`;
const FETCH_TIMEOUT_MS = 15_000;
const TTL_MS = 5 * 60 * 1000;

const FALLBACK_INDEX = {
    generated_at: null,
    sources: {},
    decks: {},
};

let _cached = null;
let _cachedAt = 0;

export async function fetchDeckIndex({ force = false } = {}) {
    const now = Date.now();
    if (!force && _cached && now - _cachedAt < TTL_MS) return _cached;

    const cacheBuster = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const url = `${INDEX_URL}?v=${cacheBuster}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'User-Agent': 'thedipidis-bot/0.3' },
        });
        if (!resp.ok) {
            // 404 means the prerender step hasn't deployed yet — return
            // the cached value if any, else the empty fallback.
            if (resp.status === 404 && _cached) return _cached;
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        _cached = data;
        _cachedAt = now;
        return data;
    } catch (err) {
        console.warn('[deck-index] fetch failed:', err.message);
        return _cached || FALLBACK_INDEX;
    } finally {
        clearTimeout(t);
    }
}

/**
 * Format a deck's card list as a copy-paste-ready PTCGL decklist.
 * Header lines are skipped so the user can drop it directly into
 * the in-game importer.
 *
 * When `colorize` is true we wrap Ace-Spec lines in ANSI magenta
 * escape sequences. Telegram's <pre><code class="language-ansi">
 * block renders these as actual colour on modern clients — on
 * older/non-supporting clients the escape codes are simply visible
 * but the line is still parseable as a normal decklist entry, so
 * users can copy-paste either way.
 */
const ESC                 = String.fromCharCode(27);
const ANSI_ACE_SPEC_OPEN  = ESC + '[1;35m';
const ANSI_RESET          = ESC + '[0m';

export function formatDecklistAsPTCGL(deck, { colorize = false } = {}) {
    if (!deck || !Array.isArray(deck.cards)) return '';
    return deck.cards
        .map((c) => {
            const line = `${c.count} ${c.name} ${c.set} ${c.number}`;
            if (colorize && c.ace_spec) {
                return `${ANSI_ACE_SPEC_OPEN}${line}${ANSI_RESET}`;
            }
            return line;
        })
        .join('\n');
}
