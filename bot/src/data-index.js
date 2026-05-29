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
 *
 * When `emphasizeAceSpec` is true, Ace-Spec lines get re-encoded
 * with Unicode mathematical-bold codepoints (U+1D400 block). The
 * reason for this contortion: Telegram's <pre><code> block strips
 * all nested formatting tags — <b>, <i>, etc. all disappear inside
 * a code block, and the ANSI escape route we tried first doesn't
 * render on iOS. Mathematical-bold characters survive the strip
 * because they're literal codepoints, not formatting, and they
 * display visually bold on every Telegram client.
 *
 * Tradeoff: Ace-Spec lines won't be importable into PTCGL via the
 * copy-paste flow because the card name is now in a different
 * Unicode range. That's a known cost — Ace Specs are 1-2 cards per
 * deck and users typically pay extra attention to them anyway. The
 * regular cards (vast majority of the list) copy-paste cleanly.
 */
const _BOLD_UPPER_A = 0x1D400;  // 𝐀
const _BOLD_LOWER_A = 0x1D41A;  // 𝐚
const _BOLD_ZERO    = 0x1D7CE;  // 𝟎

function _toUnicodeBold(s) {
    let out = '';
    for (const ch of s) {
        const code = ch.codePointAt(0);
        if (code >= 0x41 && code <= 0x5A) {
            out += String.fromCodePoint(_BOLD_UPPER_A + code - 0x41);
        } else if (code >= 0x61 && code <= 0x7A) {
            out += String.fromCodePoint(_BOLD_LOWER_A + code - 0x61);
        } else if (code >= 0x30 && code <= 0x39) {
            out += String.fromCodePoint(_BOLD_ZERO + code - 0x30);
        } else {
            out += ch;
        }
    }
    return out;
}

export function formatDecklistAsPTCGL(deck, { emphasizeAceSpec = false } = {}) {
    if (!deck || !Array.isArray(deck.cards)) return '';
    return deck.cards
        .map((c) => {
            const line = `${c.count} ${c.name} ${c.set} ${c.number}`;
            if (emphasizeAceSpec && c.ace_spec) return _toUnicodeBold(line);
            return line;
        })
        .join('\n');
}
