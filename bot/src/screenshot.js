/**
 * Bot-side fetcher for the pre-rendered Meta Call PNG.
 *
 * The image is rendered once per deploy in CI (see
 * prerender/prerender-meta-call.js) and lives at a stable
 * URL on GitHub Pages. The bot just fetches it — no Puppeteer,
 * no Chromium, no 40 s warm-up. Render Free's 512 MB is now
 * irrelevant: this process is just Node + Telegraf + Express.
 *
 * Cache-buster: we append a daily-rounded `?v=` so Telegram
 * (and any CDN between us and GitHub Pages) treats every fresh
 * deploy as a new image instead of serving a stale cached
 * download. Within the same day we want repeat requests to hit
 * any cache the network has built up — the snapshot doesn't
 * change between deploys anyway.
 */

const SNAPSHOT_URL =
    process.env.SNAPSHOT_URL ||
    'https://thedipidis.app/data/meta-call-snapshot.png';

const FETCH_TIMEOUT_MS = 15_000;

export async function captureMetaCallImage() {
    const cacheBuster = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const url = `${SNAPSHOT_URL}?v=${cacheBuster}`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'User-Agent': 'thedipidis-bot/0.1' },
        });
        if (response.status === 404) {
            // The PNG hasn't been written yet — most likely the
            // current GitHub Pages deploy didn't run (or hasn't
            // finished) the prerender step. Surface that distinctly
            // so the user knows to retry rather than chasing a real
            // outage.
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
        return buf;
    } finally {
        clearTimeout(t);
    }
}

/**
 * No-op kept so index.js's SIGTERM handler keeps the same shape.
 * The bot no longer owns a Chromium browser process to tear down.
 */
export async function shutdown() {}
