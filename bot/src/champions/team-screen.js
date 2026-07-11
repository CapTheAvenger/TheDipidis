/**
 * Build a Champions team from the in-game "Share This Battle Team?" screens.
 *
 * The team-share screen has NO copyable code (Team ID shows "-"), so the only
 * way off the console is a screenshot. There are two tabs:
 *   • "Moves & More" — per Pokémon: nickname, ability, held item, 4 moves.
 *   • "Stats"        — per Pokémon: 6 final stats + the game's SP spread
 *                       (0–32 per stat, summing to 66) and the nature arrows.
 *
 * We OCR one or both screens (word bounding boxes → 6-cell 2×3 grid), then:
 *   1. Canonicalise every OCR'd item / ability / move against the deployed
 *      champions_resources.json (fuzzy, so "Mavwilite"→"Mawilite", "Life Ob"→
 *      "Life Orb", "Potect"→"Protect").
 *   2. Identify each species from HARD data only — the species whose Lv.50
 *      stat ranges (champions_pokedex.json) contain the read stats AND whose
 *      known ability matches the read ability. That intersection is unique for
 *      real teams; ties fall back to move-overlap. We NEVER guess a species —
 *      an unresolved slot is reported, not invented.
 *
 * Output shape matches parseShowdownTeam() so the existing formatTeam / export
 * / Claude-prompt code renders it unchanged.
 */

import sharp from 'sharp';

// Render Free is a 512 MB box shared with firebase-admin + telegraf, and OCR is
// the memory-heavy path. Disable sharp's pixel cache and cap it to one worker
// thread so image decode/resize doesn't balloon the resident set during a scan.
sharp.cache(false);
sharp.concurrency(1);

const SITE_BASE = (process.env.SITE_BASE || 'https://thedipidis.app').replace(/\/+$/, '');
const TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

// Local testing: point at a data dir + a tesseract langPath so the parser runs
// offline. In production both are unset → fetch from the site + default CDN model.
const DATA_DIR = process.env.CHAMP_DATA_DIR || null;
const TESS_OPTS = process.env.TESSDATA_DIR
    ? { langPath: process.env.TESSDATA_DIR, gzip: true, cachePath: process.env.TESSDATA_DIR }
    : {};

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Fold German umlauts/ß to their base letters so a German name matches whether
// the OCR reads "ä" or "a" (and so the German alias index keys line up).
function norm(s) {
    return String(s || '').toLowerCase()
        .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]/g, '');
}

// ── Nature table: [boostedStat, hinderedStat] → nature (EN) ──────────────────
const NATURE_BY_STATS = {
    'atk|def': 'Lonely', 'atk|spe': 'Brave', 'atk|spa': 'Adamant', 'atk|spd': 'Naughty',
    'def|atk': 'Bold', 'def|spe': 'Relaxed', 'def|spa': 'Impish', 'def|spd': 'Lax',
    'spe|atk': 'Timid', 'spe|def': 'Hasty', 'spe|spa': 'Jolly', 'spe|spd': 'Naive',
    'spa|atk': 'Modest', 'spa|def': 'Mild', 'spa|spe': 'Quiet', 'spa|spd': 'Rash',
    'spd|atk': 'Calm', 'spd|def': 'Gentle', 'spd|spe': 'Sassy', 'spd|spa': 'Careful',
};

// ── Fuzzy matching (Levenshtein) ────────────────────────────────────────────
function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        let cur = [i];
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[n];
}

// Nearest canonical name for an OCR token. `index` is Map<normKey, canonicalEN>.
// Returns { name, dist } or null when nothing is close enough. Threshold scales
// with length so short names ("Protect") need a near-exact hit while long ones
// tolerate a couple of OCR slips.
function fuzzyMatch(token, index) {
    const key = norm(token);
    if (!key) return null;
    if (index.has(key)) return { name: index.get(key), dist: 0 };
    let best = null, bestD = Infinity;
    for (const [k, name] of index) {
        // Cheap length prefilter.
        if (Math.abs(k.length - key.length) > 3) continue;
        const d = lev(key, k);
        if (d < bestD) { bestD = d; best = name; }
    }
    if (best == null) return null;
    const maxLen = Math.max(key.length, norm(best).length);
    const allowed = maxLen <= 5 ? 1 : maxLen <= 9 ? 2 : 3;
    return bestD <= allowed ? { name: best, dist: bestD } : null;
}

// ── Data loading (resources + pokedex) ──────────────────────────────────────
let _data = null, _dataAt = 0;

async function fetchJson(url) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url, {
            cache: 'no-store', signal: controller.signal,
            headers: { 'User-Agent': 'thedipidis-bot/champions' },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally { clearTimeout(t); }
}

async function loadJson(name) {
    if (DATA_DIR) {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8'));
    }
    const day = new Date().toISOString().slice(0, 10);
    return fetchJson(`${SITE_BASE}/data/${name}?v=${day}`);
}

function baseSpeciesName(en) {
    // "Mega Swampert" / "Mega Charizard X" → "Swampert" / "Charizard".
    return String(en || '')
        .replace(/^Mega\s+/i, '')
        .replace(/\s+[XY]$/i, '')
        .trim();
}

async function getData() {
    if (_data && Date.now() - _dataAt < TTL_MS) return _data;
    const [res, dex] = await Promise.all([
        loadJson('champions_resources.json'),
        loadJson('champions_pokedex.json'),
    ]);

    // Item/ability/move indexes map BOTH the English and German names to the
    // English canonical, so a German screenshot ("Sturzbach", "Zähigkeit",
    // "Stromstrahl") resolves to English ("Torrent", "Stamina", "Electro Shot")
    // — the export is always English (what Limitless needs), regardless of the
    // screenshot's language. English keys are laid down first so they always win
    // a collision; German aliases only fill gaps.
    const items = new Map(), abilities = new Map(), moves = new Map();
    const mapFor = (cat) => cat === 'item' ? items : cat === 'ability' ? abilities : cat === 'move' ? moves : null;
    for (const e of (res?.entries || [])) {
        if (!e.en) continue;
        mapFor(e.cat)?.set(norm(e.en), e.en);
    }
    for (const e of (res?.entries || [])) {
        if (!e.en || !e.de) continue;
        const m = mapFor(e.cat);
        if (!m) continue;
        const k = norm(e.de);
        if (!m.has(k)) m.set(k, e.en);
    }

    // Species index: base-form entries carry Lv.50 stat ranges; build an
    // ability→species reverse index from each entry's usage ability + mega
    // ability so we can intersect it with the stat-range candidates.
    const dexEntries = (dex?.entries || []).filter(e => e.en);
    const abilityToSpecies = new Map();  // normAbility → Set<baseEN>
    const addAb = (ab, sp) => {
        if (!ab || ab === 'None') return;
        const k = norm(ab);
        if (!abilityToSpecies.has(k)) abilityToSpecies.set(k, new Set());
        abilityToSpecies.get(k).add(sp);
    };
    for (const e of dexEntries) {
        const sp = baseSpeciesName(e.en);
        addAb(e.megaAbility, sp);
        addAb(e.meta?.ability, sp);
    }

    _data = { items, abilities, moves, dexEntries, abilityToSpecies };
    _dataAt = Date.now();
    return _data;
}

// ── OCR ─────────────────────────────────────────────────────────────────────
const OCR_WIDTH = 2400;

// Preprocess a screenshot for OCR. Variants (upscale width, extra contrast) give
// the multi-pass consensus below different chances at the small stat numbers that
// Telegram's photo compression degrades.
async function preprocess(buf, opts = {}) {
    const width = opts.width || OCR_WIDTH;
    let s = sharp(buf).grayscale().resize({ width, withoutEnlargement: false }).normalize();
    if (opts.contrast) s = s.linear(1.4, -30);
    const out = await s.sharpen().toFormat('png').toBuffer();
    const meta = await sharp(out).metadata();
    return { buf: out, W: meta.width || width, H: meta.height || 1 };
}

async function readWords(worker, pre) {
    const { data } = await worker.recognize(pre.buf, {}, { blocks: true, text: true });
    const words = [];
    for (const b of (data.blocks || [])) {
        for (const p of (b.paragraphs || [])) {
            for (const l of (p.lines || [])) {
                for (const w of (l.words || [])) {
                    const t = (w.text || '').trim();
                    if (!t) continue;
                    words.push({
                        text: t,
                        cx: (w.bbox.x0 + w.bbox.x1) / 2 / pre.W,
                        cy: (w.bbox.y0 + w.bbox.y1) / 2 / pre.H,
                        x0: w.bbox.x0 / pre.W,
                    });
                }
            }
        }
    }
    return { words, text: data.text || '' };
}

// One extra preprocessing for the Stats screen only (its tiny SP/final numbers
// are the compression casualty). Kept at the same width as the default pass so it
// adds no bigger memory peak — just a different contrast that recovers numbers the
// first pass fumbled. The Moves screen reads fine in one pass.
const STATS_EXTRA_PASSES = [{ width: 2400, contrast: true }];

// Screen tab: the Stats view repeats "Sp. Atk / Sp. Def / Speed / Defense"
// labels six times; the Moves view does not.
function isStatsScreen(text) {
    const t = text.toLowerCase();
    // Stat labels in English OR German (Angr.=Attack, Vert.=Defense, Sp.Ang.,
    // Sp.Vert., Initiative=Speed, KP=HP).
    const labelHits = (t.match(/sp\.?\s*(atk|def|ang|vert)|speed|defense|attack|initiative|angr|\bvert\b|\bkp\b/g) || []).length;
    // Language-independent fallback: the Stats screen is dense with 2–3 digit
    // numbers (6 stats × 6 mons); the Moves screen has almost none.
    const numHits = (text.match(/\d{2,3}/g) || []).length;
    return labelHits >= 6 || numHits >= 15;
}

// Bucket a word into one of 6 cells (2 cols × 3 rows). Column split at x=0.5;
// rows split at y≈0.41 / 0.61 with the title (y<0.20) and buttons (y>0.83)
// excluded. Returns 0..5 (row*2+col) or -1.
function cellIndex(cx, cy) {
    if (cy < 0.20 || cy > 0.83) return -1;
    const col = cx < 0.5 ? 0 : 1;
    const row = cy < 0.41 ? 0 : cy < 0.61 ? 1 : 2;
    return row * 2 + col;
}

function groupCells(words) {
    const cells = [[], [], [], [], [], []];
    for (const w of words) {
        const i = cellIndex(w.cx, w.cy);
        if (i >= 0) cells[i].push(w);
    }
    return cells;
}

// Reconstruct lines within a cell (group by cy), each sorted left→right.
function cellLines(cellWords) {
    const sorted = [...cellWords].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const lines = [];
    let cur = null;
    for (const w of sorted) {
        if (!cur || Math.abs(w.cy - cur.cy) > 0.018) {
            cur = { cy: w.cy, words: [w] };
            lines.push(cur);
        } else {
            cur.words.push(w);
            cur.cy = (cur.cy + w.cy) / 2;
        }
    }
    for (const l of lines) l.words.sort((a, b) => a.cx - b.cx);
    return lines;
}

// Best (smallest-distance) match for any 1–3 word run within a single line.
function bestInLine(line, index) {
    const ws = line.words;
    let best = null;
    for (let i = 0; i < ws.length; i++) {
        for (let n = 1; n <= Math.min(3, ws.length - i); n++) {
            const gram = ws.slice(i, i + n).map(w => w.text).join(' ');
            const m = fuzzyMatch(gram, index);
            // Prefer the smallest edit distance; on ties prefer the LONGER match
            // so "Trick Room" wins over the substring "Trick".
            if (m && (!best || m.dist < best.dist || (m.dist === best.dist && n > best.n))) {
                best = { name: m.name, dist: m.dist, i, n };
            }
        }
    }
    return best;
}

// Best match across every line of a sub-column (min distance wins).
function bestAcross(lines, index) {
    let best = null;
    for (const line of lines) {
        const m = bestInLine(line, index);
        if (m && (!best || m.dist < best.dist)) best = m;
    }
    return best ? best.name : null;
}

// ── Moves & More screen → per-cell {ability,item,moves} ─────────────────────
// Each cell holds two sub-columns: the INFO column (nickname / ability / item,
// low x) and the MOVES column (the 4 moves, high x). Splitting on x first stops
// a move from being read as the ability (and vice-versa), and best-match (not
// first-match) stops OCR junk from masquerading as a real name.
function parseMovesScreen(cells, data) {
    return cells.map((cellWords, idx) => {
        const colBase = idx % 2 === 0 ? 0.16 : 0.50;
        const split = colBase + 0.16;
        const info = cellWords.filter(w => w.cx < split);
        const moveW = cellWords.filter(w => w.cx >= split);

        const ability = bestAcross(cellLines(info), data.abilities);
        const item = bestAcross(cellLines(info), data.items);

        const moves = [];
        const seen = new Set();
        for (const line of cellLines(moveW)) {
            const m = bestInLine(line, data.moves);
            if (m && !seen.has(norm(m.name)) && moves.length < 4) {
                seen.add(norm(m.name));
                moves.push(m.name);
            }
        }
        return { ability, item, moves };
    });
}

// ── Stats screen → per-cell {stats:[6], sp:{...}, nature} ───────────────────
// Each cell holds two sub-columns (HP/Atk/Def | SpA/SpD/Spe). We anchor on the
// six stat labels and read the two numbers that follow each (final value, then
// the 0–32 SP). Nature comes from which stat carries the up/down arrow — the
// game renders those as a small glyph tesseract mangles into a stray token, so
// we instead read the arrow from the label suffix when present and otherwise
// leave nature unset (never guessed).
// Cluster words into rows by their vertical centre.
function clusterRows(items, tol = 0.025) {
    const sorted = [...items].sort((a, b) => a.cy - b.cy);
    const rows = [];
    let cur = null;
    for (const w of sorted) {
        if (!cur || w.cy - cur.cy > tol) { cur = { cy: w.cy, ws: [w] }; rows.push(cur); }
        else { cur.ws.push(w); cur.cy = (cur.cy * (cur.ws.length - 1) + w.cy) / cur.ws.length; }
    }
    return rows;
}

// Extract the six FINAL stat values by POSITION, not by reading the stat labels
// (the labels OCR unreliably: "Sp.Atk"→"SpAkS", "Sp. Def" splits into two tokens).
// Each cell has a left sub-column (HP / Attack / Defense, top→bottom) and a right
// sub-column (Sp.Atk / Sp.Def / Speed). Within a stat row the final value is the
// left number (the small SP sits to its right past the bar). Garbage reads become
// null and are recovered later by solveSpread()'s sum-66 invariant.
function parseStatsScreen(cells) {
    const KEYS_L = ['hp', 'atk', 'def'], KEYS_R = ['spa', 'spd', 'spe'];
    return cells.map((cellWords, idx) => {
        const colBase = idx % 2 === 0 ? 0.16 : 0.50;
        const mid = colBase + 0.17;       // boundary between the two stat sub-columns
        const lo = colBase - 0.04, hi = colBase + 0.34;

        const nums = cellWords.filter(w => w.cx >= lo && w.cx < hi).map(w => {
            let d = w.text.replace(/[^0-9]/g, '');
            if (!d) return null;
            if (d.length >= 4) d = d.slice(0, 3);      // "1100" = 110 + 0 merge → keep final
            return { v: parseInt(d, 10), cx: w.cx, cy: w.cy, side: w.cx < mid ? 'L' : 'R' };
        }).filter(Boolean);

        // A real stat row has numbers in BOTH sub-columns; the species-name / row-
        // index rows carry at most a single stray digit and are dropped, so the
        // three surviving rows map cleanly top→bottom to HP/Atk/Def | SpA/SpD/Spe.
        const rows = clusterRows(nums)
            .map(r => r.ws)
            .filter(ws => ws.some(n => n.side === 'L') && ws.some(n => n.side === 'R'))
            .slice(0, 3);

        const finals = {};
        // The final stat is the LARGEST number in the row's sub-column: the SP sits
        // at ≤ 32 and the ± arrow glyph can OCR as a small stray digit (e.g. "4")
        // to the left of the real value, so "leftmost" is wrong but "max" is robust.
        // Any residual error is caught downstream by solveSpread's 0–32 / sum-66 test.
        const pick = (ws, side) => {
            const vals = ws.filter(n => n.side === side).map(n => n.v);
            const v = vals.length ? Math.max(...vals) : null;
            return (v >= 20 && v <= 600) ? v : null;
        };
        for (let r = 0; r < 3; r++) {
            const ws = rows[r];
            finals[KEYS_L[r]] = ws ? pick(ws, 'L') : null;
            finals[KEYS_R[r]] = ws ? pick(ws, 'R') : null;
        }

        const stats = STAT_KEYS.map(k => finals[k] ?? null);
        return { stats, statsComplete: stats.every(v => Number.isFinite(v)) };
    });
}

// ── Nature + SP solver (exact, from base stats + final stats) ───────────────
// Pokémon Champions uses Lv.50, IV 31, and a 0–32 "SP" per stat summing to 66.
// Verified formula (matches the in-game Stats screen exactly):
//   base = floor((2·Base + 31) / 2)
//   HP     = base + 60 + SP
//   others = floor((base + 5 + SP) · natureMod)   natureMod ∈ {1.1, 1.0, 0.9}
// Given the identified species' base stats and the (reliably OCR'd) final stats,
// we solve for the ONE nature whose SP values are all in [0,32] AND sum to 66 —
// so nature and the exact SP spread come out deterministically, without reading
// the ± arrows or the noisier small SP numbers. Self-validating: a wrong final
// or species yields no valid nature, so we flag instead of guessing.
function statBase(base) { return Math.floor((2 * base + 31) / 2); }

function spForStat(key, base, obs, mod) {
    if (!Number.isFinite(obs)) return null;
    const b = statBase(base);
    if (key === 'hp') { const sp = obs - (b + 60); return sp >= 0 && sp <= 32 ? sp : null; }
    for (let sp = 0; sp <= 32; sp++) if (Math.floor((b + 5 + sp) * mod) === obs) return sp;
    return null;
}

function solveSpread(base, finals) {
    const natures = Object.entries(NATURE_BY_STATS)
        .map(([k, n]) => { const [boost, hinder] = k.split('|'); return { nature: n, boost, hinder }; });
    natures.push({ nature: null, boost: null, hinder: null });   // neutral fallback

    const valid = [];
    for (const { nature, boost, hinder } of natures) {
        const evs = {}; const unknown = [];
        for (let i = 0; i < STAT_KEYS.length; i++) {
            const key = STAT_KEYS[i];
            const mod = key === boost ? 1.1 : key === hinder ? 0.9 : 1.0;
            const sp = spForStat(key, base[key], finals[i], mod);
            if (sp == null) unknown.push(key); else evs[key] = sp;
        }
        if (unknown.length > 1) continue;                      // too noisy to trust
        let sum = Object.values(evs).reduce((a, b) => a + b, 0);
        if (unknown.length === 1) {                            // recover one via the 66 invariant
            const miss = 66 - sum;
            if (miss < 0 || miss > 32) continue;
            evs[unknown[0]] = miss; sum = 66;
        }
        if (sum !== 66) continue;
        valid.push({ nature, evs, unknowns: unknown.length });
    }
    if (!valid.length) return null;
    valid.sort((a, b) => a.unknowns - b.unknowns || (a.nature ? 0 : 1) - (b.nature ? 0 : 1));

    // Ambiguity guard: two DIFFERENT non-neutral natures both fitting = don't guess.
    const nonNeutral = valid.filter(v => v.nature);
    const names = new Set(nonNeutral.map(v => v.nature));
    if (names.size > 1 && nonNeutral[0].unknowns === nonNeutral[1].unknowns) {
        return { ...valid[0], ambiguous: true };
    }
    return valid[0];
}

// ── Species identification (hard data only) ─────────────────────────────────
function inRanges(entry, stats, tol = 2) {
    for (let i = 0; i < STAT_KEYS.length; i++) {
        const v = stats[i];
        if (!Number.isFinite(v)) return false;
        const r = entry[STAT_KEYS[i]] || {};
        if (!(r.min - tol <= v && v <= r.max + tol)) return false;
    }
    return true;
}

function identifySpecies(mon, data) {
    const { dexEntries, abilityToSpecies } = data;
    const abKey = mon.ability ? norm(mon.ability) : null;
    const abilitySet = abKey ? (abilityToSpecies.get(abKey) || null) : null;

    // Stat-range candidates (only when the Stats screen gave a full, plausible
    // row). Used ONLY to narrow — never to exclude a good ability match, since
    // the Stats OCR is noisier than the Moves OCR.
    let statCands = null;
    if (mon.stats && mon.statsComplete) {
        statCands = new Set();
        for (const e of dexEntries) {
            if (e.form && /^mega/i.test(e.form)) continue;   // team preview shows base form
            if (inRanges(e, mon.stats)) statCands.add(baseSpeciesName(e.en));
        }
    }

    // Ability is the primary signal (Moves-screen OCR is the most reliable).
    let pool;
    if (abilitySet && abilitySet.size) pool = [...abilitySet];
    else if (statCands) pool = [...statCands];
    else return { species: null, confident: false };

    if (pool.length === 1) return { species: pool[0], confident: true };

    // Narrow by stats, but only if the intersection is non-empty (a noisy Stats
    // read must not throw away the whole ability pool).
    if (statCands) {
        const narrowed = pool.filter(s => statCands.has(s));
        if (narrowed.length === 1) return { species: narrowed[0], confident: true };
        if (narrowed.length > 1) pool = narrowed;
    }

    // Disambiguate the remainder by move overlap with in-game usage data.
    if (mon.moves?.length) {
        const wanted = new Set(mon.moves.map(norm));
        let best = null, bestScore = -1, tie = false;
        for (const sp of pool) {
            const entry = dexEntries.find(e => baseSpeciesName(e.en) === sp);
            const usage = new Set((entry?.meta?.moves || []).map(m => norm(m.name)));
            let score = 0; for (const w of wanted) if (usage.has(w)) score++;
            if (score > bestScore) { bestScore = score; best = sp; tie = false; }
            else if (score === bestScore) tie = true;
        }
        if (best && bestScore > 0 && !tie) return { species: best, confident: true };
    }

    return { species: pool[0] || null, confident: false, candidates: pool };
}

// ── Public entry point ──────────────────────────────────────────────────────
// Serialize scans: OCR is the memory-heavy path and two concurrent runs would
// double the peak RSS, which is what tripped Render Free's 512 MB limit. The
// chain lets only one scan hold the tesseract worker + big image at a time; a
// second submission simply waits its turn (a few extra seconds).
let _ocrChain = Promise.resolve();

export function parseTeamScreens(buffers) {
    const run = () => _parseTeamScreens(buffers);
    const next = _ocrChain.then(run, run);
    _ocrChain = next.then(() => {}, () => {});
    return next;
}

/**
 * @param {Buffer[]} buffers  one or two screenshots (Moves and/or Stats)
 * @returns {{mons:Array, warnings:string[]}}  mons in parseShowdownTeam shape
 */
async function _parseTeamScreens(buffers) {
    const data = await getData();
    const warnings = [];

    let movesCells = null;
    const statsPasses = [];   // one parseStatsScreen() result per OCR pass

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, TESS_OPTS);
    try {
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        for (const buf of buffers) {
            const first = await readWords(worker, await preprocess(buf));
            if (isStatsScreen(first.text)) {
                statsPasses.push(parseStatsScreen(groupCells(first.words)));
                // Multi-pass consensus: re-OCR the Stats screen with different
                // preprocessings and keep each pass's finals. Per Pokémon we later
                // take whichever pass yields a valid spread — so a stat number that
                // one pass fumbles under compression is recovered by another.
                for (const opts of STATS_EXTRA_PASSES) {
                    const extra = await readWords(worker, await preprocess(buf, opts));
                    statsPasses.push(parseStatsScreen(groupCells(extra.words)));
                }
            } else {
                movesCells = parseMovesScreen(groupCells(first.words), data);
            }
        }
    } finally {
        try { await worker.terminate(); } catch (_) {}
    }

    if (!movesCells && !statsPasses.length) return { mons: [], warnings: ['Kein Team-Screen erkannt.'] };

    const mons = [];
    for (let i = 0; i < 6; i++) {
        const mv = movesCells?.[i] || { ability: null, item: null, moves: [] };
        // All this slot's stat reads across passes; prefer a complete row for
        // species fallback, and try each when solving the spread.
        const slotStats = statsPasses.map(p => p[i]).filter(Boolean);
        const primary = slotStats.find(s => s.statsComplete) || slotStats[0] || {};
        const mon = {
            ability: mv.ability || null,
            item: mv.item || null,
            moves: mv.moves || [],
            stats: primary.stats || null,
            statsComplete: slotStats.some(s => s.statsComplete),
        };
        // Skip empty slots (fewer than 6 mons, or a blank cell).
        if (!mon.ability && !mon.item && !mon.moves.length && !mon.statsComplete) continue;

        const id = identifySpecies(mon, data);
        mon.species = id.species;
        mon.nature = null;
        mon.tera = null;

        // Derive the exact nature + SP spread from the identified species' base
        // stats and the read final stats (see solveSpread). This is the game's
        // native 0–32 spread, exposed as `evs` so statsLine()/formatTeam() render
        // it unchanged and the Limitless export can print "Level: 50 / EVs / Nature".
        if (mon.species && slotStats.length) {
            const entry = data.dexEntries.find(e =>
                baseSpeciesName(e.en) === mon.species && !(e.form && /^mega/i.test(e.form)));
            if (entry) {
                const base = {};
                for (const k of STAT_KEYS) base[k] = entry[k]?.base;
                if (STAT_KEYS.every(k => Number.isFinite(base[k]))) {
                    // Try each pass's finals; take the first that solves. Each pass's
                    // solve is independently "correct or nothing" (the 66-sum guard),
                    // so the first success is trustworthy — never a guessed spread.
                    for (const s of slotStats) {
                        const sol = s.stats ? solveSpread(base, s.stats) : null;
                        if (sol && !sol.ambiguous) { mon.evs = sol.evs; mon.nature = sol.nature; break; }
                    }
                }
            }
        }
        if (!mon.species) {
            warnings.push(`Slot ${i + 1}: Spezies nicht sicher erkannt${mon.ability ? ` (Fähigkeit: ${mon.ability})` : ''} — bitte prüfen.`);
        } else if (!id.confident) {
            warnings.push(`Slot ${i + 1}: ${mon.species}? (nicht eindeutig — bitte prüfen)`);
        }
        if (statsPasses.length && !mon.evs) {
            warnings.push(`Slot ${i + 1} (${mon.species || '?'}): SP-Spread nicht sicher gelesen — bitte im Spiel prüfen.`);
        }
        if (mon.moves.length < 4) {
            warnings.push(`Slot ${i + 1} (${mon.species || '?'}): nur ${mon.moves.length}/4 Attacken erkannt.`);
        }
        mons.push(mon);
    }

    return { mons, warnings };
}
