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

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

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

    const items = new Map(), abilities = new Map(), moves = new Map();
    for (const e of (res?.entries || [])) {
        if (!e.en) continue;
        if (e.cat === 'item') items.set(norm(e.en), e.en);
        else if (e.cat === 'ability') abilities.set(norm(e.en), e.en);
        else if (e.cat === 'move') moves.set(norm(e.en), e.en);
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

async function ocrWords(buf) {
    const pre = await sharp(buf).grayscale()
        .resize({ width: OCR_WIDTH, withoutEnlargement: false })
        .normalize().sharpen().toFormat('png').toBuffer();
    const meta = await sharp(pre).metadata();
    const H = meta.height || 1;

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, TESS_OPTS);
    try {
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        const { data } = await worker.recognize(pre, {}, { blocks: true, text: true });
        const words = [];
        for (const b of (data.blocks || [])) {
            for (const p of (b.paragraphs || [])) {
                for (const l of (p.lines || [])) {
                    for (const w of (l.words || [])) {
                        const t = (w.text || '').trim();
                        if (!t) continue;
                        words.push({
                            text: t,
                            cx: (w.bbox.x0 + w.bbox.x1) / 2 / OCR_WIDTH,
                            cy: (w.bbox.y0 + w.bbox.y1) / 2 / H,
                            x0: w.bbox.x0 / OCR_WIDTH,
                        });
                    }
                }
            }
        }
        return { words, text: data.text || '' };
    } finally {
        try { await worker.terminate(); } catch (_) {}
    }
}

// Screen tab: the Stats view repeats "Sp. Atk / Sp. Def / Speed / Defense"
// labels six times; the Moves view does not.
function isStatsScreen(text) {
    const t = text.toLowerCase();
    const hits = (t.match(/sp\.?\s*(atk|def)|speed|defense|attack/g) || []).length;
    return hits >= 8;
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
const STAT_LABEL_RE = [
    { key: 'hp', re: /^hp$/ },
    { key: 'atk', re: /^attack/ },
    { key: 'def', re: /^defense/ },
    { key: 'spa', re: /^sp\.?atk|^spatk|^sp\.?a$/ },
    { key: 'spd', re: /^sp\.?def|^spdef|^sp\.?d(ef|et)?$/ },
    { key: 'spe', re: /^speed/ },
];

function classifyStatLabel(tok) {
    const t = norm(tok);
    for (const { key, re } of STAT_LABEL_RE) if (re.test(t)) return key;
    return null;
}

function parseStatsScreen(cells) {
    return cells.map(cellWords => {
        const lines = cellLines(cellWords);
        const finals = {}; const sp = {};
        for (const line of lines) {
            const ws = line.words;
            // Walk tokens; when a stat label appears, take the next 1–2 numeric
            // tokens as [final, sp]. Two labels can share a line (left+right col).
            for (let i = 0; i < ws.length; i++) {
                const key = classifyStatLabel(ws[i].text);
                if (!key || finals[key] != null) continue;
                const nums = [];
                for (let j = i + 1; j < ws.length && nums.length < 2; j++) {
                    const cleaned = ws[j].text.replace(/[^0-9]/g, '');
                    if (classifyStatLabel(ws[j].text)) break;   // hit the next label
                    if (cleaned) nums.push(parseInt(cleaned, 10));
                }
                if (nums.length >= 1) finals[key] = nums[0];
                if (nums.length >= 2) sp[key] = nums[1];
            }
        }
        const stats = STAT_KEYS.map(k => finals[k]);
        // Plausible Lv.50 final stats live roughly in [20, 500]; anything outside
        // is an OCR artefact (merged/split digits) and disqualifies the row from
        // stat-range identification.
        const complete = stats.every(v => Number.isFinite(v) && v >= 20 && v <= 500);
        const spSum = STAT_KEYS.reduce((a, k) => a + (sp[k] || 0), 0);
        return { stats, statsComplete: complete, sp, spSum };
    });
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
/**
 * @param {Buffer[]} buffers  one or two screenshots (Moves and/or Stats)
 * @returns {{mons:Array, warnings:string[]}}  mons in parseShowdownTeam shape
 */
export async function parseTeamScreens(buffers) {
    const data = await getData();
    const warnings = [];

    let movesCells = null, statsCells = null;
    for (const buf of buffers) {
        const { words, text } = await ocrWords(buf);
        const cells = groupCells(words);
        if (isStatsScreen(text)) statsCells = parseStatsScreen(cells);
        else movesCells = parseMovesScreen(cells, data);
    }

    if (!movesCells && !statsCells) return { mons: [], warnings: ['Kein Team-Screen erkannt.'] };

    const mons = [];
    for (let i = 0; i < 6; i++) {
        const mv = movesCells?.[i] || { ability: null, item: null, moves: [] };
        const st = statsCells?.[i] || {};
        const mon = {
            ability: mv.ability || null,
            item: mv.item || null,
            moves: mv.moves || [],
            stats: st.stats || null,
            statsComplete: !!st.statsComplete,
            sp: st.sp || null,
            spSum: st.spSum || 0,
        };
        // Skip empty slots (fewer than 6 mons, or a blank cell).
        if (!mon.ability && !mon.item && !mon.moves.length && !mon.statsComplete) continue;

        const id = identifySpecies(mon, data);
        mon.species = id.species;
        // SP spread in the game's 0–32 scale, exposed as `evs` so the existing
        // statsLine()/formatTeam() renders it unchanged — but ONLY when the six
        // numbers checksum to the game's 66-point budget. A wrong sum means the
        // Stats OCR slipped, so we drop it rather than show a made-up spread.
        if (mon.sp && mon.spSum === 66) mon.evs = { ...mon.sp };
        // Nature stays unset here (arrow glyphs are not reliably OCR-able); the
        // build sheet flags it so the user fills it in rather than us guessing.
        mon.nature = null;
        mon.tera = null;

        if (!mon.species) {
            warnings.push(`Slot ${i + 1}: Spezies nicht sicher erkannt${mon.ability ? ` (Fähigkeit: ${mon.ability})` : ''} — bitte prüfen.`);
        } else if (!id.confident) {
            warnings.push(`Slot ${i + 1}: ${mon.species}? (nicht eindeutig — bitte prüfen)`);
        }
        if (statsCells && !mon.evs) {
            warnings.push(`Slot ${i + 1} (${mon.species || '?'}): SP-Spread nicht sicher gelesen — bitte im Spiel prüfen.`);
        }
        if (mon.moves.length < 4) {
            warnings.push(`Slot ${i + 1} (${mon.species || '?'}): nur ${mon.moves.length}/4 Attacken erkannt.`);
        }
        mons.push(mon);
    }

    return { mons, warnings };
}
