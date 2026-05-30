/**
 * Bot-side fetcher for the pre-rendered Meta Call PNGs.
 *
 * Two variants are rendered at deploy time
 * (see prerender/prerender-meta-call.js):
 *   • meta-call-snapshot-current.png  — current rotation
 *   • meta-call-snapshot-past.png     — the most-recent finished
 *                                       rotation (frozen labs data)
 *
 * Plus a tiny meta-call-info.json next to them with the format keys
 * (e.g. "TEF-CRI", "TEF-POR") so the bot can label its inline
 * keyboard without having to parse format_window.json itself.
 *
 * Per-day cache buster on the URL — the snapshots only change on
 * deploy, and Telegram aggressively caches photos by URL.
 */

const SITE_BASE =
    process.env.SITE_BASE || 'https://thedipidis.app';

const FETCH_TIMEOUT_MS = 15_000;
const INFO_FALLBACK = {
    current: { key: 'TEF-CRI', file: 'meta-call-snapshot-current.png' },
    past:    { key: 'TEF-POR', file: 'meta-call-snapshot-past.png' },
};

let _infoCache = null;
let _infoCachedAt = 0;
const INFO_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch the info JSON with a short TTL — calling code can read this
 * cheaply on every command. Falls back to a hardcoded shape if the
 * file isn't available (e.g. an old deploy that didn't run the
 * prerender step).
 */
export async function getMetaCallInfo() {
    const now = Date.now();
    if (_infoCache && now - _infoCachedAt < INFO_TTL_MS) return _infoCache;
    const url = `${SITE_BASE}/data/meta-call-info.json?v=${new Date().toISOString().slice(0, 10)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'User-Agent': 'thedipidis-bot/0.2' },
        });
        if (resp.ok) {
            _infoCache = await resp.json();
            _infoCachedAt = now;
            return _infoCache;
        }
    } catch (err) {
        console.warn('[metacall info] fetch failed, using fallback:', err.message);
    } finally {
        // Always clear the abort timer — when fetch rejected (network
        // error before timeout fired) we'd otherwise leave a pending
        // setTimeout that aborts something else later.
        clearTimeout(t);
    }
    return INFO_FALLBACK;
}

export async function captureMetaCallImage(variant = 'current') {
    if (variant !== 'current' && variant !== 'past') {
        throw new Error(`unknown variant: ${variant}`);
    }
    const info = await getMetaCallInfo();
    const entry = info[variant] || INFO_FALLBACK[variant];
    const cacheBuster = new Date().toISOString().slice(0, 10);
    const url = `${SITE_BASE}/data/${entry.file}?v=${cacheBuster}`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'User-Agent': 'thedipidis-bot/0.2' },
        });
        if (response.status === 404) {
            throw new Error(
                'Snapshot ist noch nicht im Deploy. ' +
                'Wenn gerade Daten gescrapt wurden, läuft der GitHub-Pages-Build noch — bitte in 2-3 Minuten nochmal probieren.',
            );
        }
        if (!response.ok) {
            throw new Error(`Snapshot fetch failed: HTTP ${response.status} ${response.statusText}`);
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.length < 200) {
            throw new Error(`Snapshot too small (${buf.length} bytes) — probably an error page`);
        }
        return { buffer: buf, key: entry.key };
    } finally {
        clearTimeout(t);
    }
}

/**
 * No-op kept so index.js's SIGTERM handler keeps the same shape.
 */
export async function shutdown() {}
