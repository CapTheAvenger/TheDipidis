/**
 * Bilingual (DE/EN) name resolution for the Champions team builder.
 *
 * Live maps (cached 30 min) come from the deployed site:
 *   /data/champions_resources.json  → items / abilities / moves (en+de)
 *   /data/pokemon_names_de.json      → species EN→DE (base forms)
 * Natures, stat labels and form suffixes are small + stable, so they're
 * static tables here.
 */

const SITE_BASE = (process.env.SITE_BASE || 'https://thedipidis.app').replace(/\/+$/, '');
const TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

let _cache = null;
let _cachedAt = 0;

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

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

export async function getMaps() {
    if (_cache && Date.now() - _cachedAt < TTL_MS) return _cache;
    const day = new Date().toISOString().slice(0, 10);
    let res = { entries: [] }, species = {};
    try {
        [res, species] = await Promise.all([
            fetchJson(`${SITE_BASE}/data/champions_resources.json?v=${day}`),
            fetchJson(`${SITE_BASE}/data/pokemon_names_de.json?v=${day}`),
        ]);
    } catch (err) {
        console.warn('[champions/i18n] map fetch failed:', err.message);
        if (_cache) return _cache;                 // serve stale on failure
    }
    const item = new Map(), ability = new Map(), move = new Map();
    for (const e of (res?.entries || [])) {
        const m = e.cat === 'item' ? item : e.cat === 'ability' ? ability : e.cat === 'move' ? move : null;
        if (m && e.en) m.set(norm(e.en), e.de || e.en);
    }
    _cache = { item, ability, move, species: species || {} };
    _cachedAt = Date.now();
    return _cache;
}

// ── Static tables ──────────────────────────────────────────────────
const NATURE_DE = {
    Hardy: 'Robust', Lonely: 'Solo', Brave: 'Mutig', Adamant: 'Hart', Naughty: 'Frech',
    Bold: 'Kühn', Docile: 'Zaghaft', Relaxed: 'Locker', Impish: 'Pfiffig', Lax: 'Lasch',
    Timid: 'Scheu', Hasty: 'Hastig', Serious: 'Ernst', Jolly: 'Froh', Naive: 'Naiv',
    Modest: 'Mäßig', Mild: 'Mild', Quiet: 'Ruhig', Bashful: 'Sacht', Rash: 'Hitzig',
    Calm: 'Sanft', Gentle: 'Zart', Sassy: 'Forsch', Careful: 'Vorsichtig', Quirky: 'Kauzig',
};

// EN stat key → [DE label, EN label]
const STAT_LABELS = {
    hp: ['KP', 'HP'], atk: ['Ang', 'Atk'], def: ['Vert', 'Def'],
    spa: ['SpAng', 'SpA'], spd: ['SpVert', 'SpD'], spe: ['Init', 'Spe'],
};
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Regional / special form suffixes → DE label (EN suffix kept exact in
// the EN column anyway, so a reasonable label is enough).
const FORM_DE = {
    Alola: 'Alola', Galar: 'Galar', Hisui: 'Hisui', Paldea: 'Paldea',
    Mega: 'Mega', 'Mega-X': 'Mega X', 'Mega-Y': 'Mega Y', Gmax: 'Gigadynamax',
    Therian: 'Tiergeist', Origin: 'Ur', Crowned: 'Edel', Eternal: 'Ewige Blume',
    Wash: 'Wasch', Heat: 'Hitze', Frost: 'Frost', Fan: 'Wirbel', Mow: 'Schneid',
    Bloodmoon: 'Blutmond', 'Four': 'Vier', 'Family-of-Four': 'Viererpack',
};

const TYPE_DE = {
    Normal: 'Normal', Fire: 'Feuer', Water: 'Wasser', Electric: 'Elektro', Grass: 'Pflanze',
    Ice: 'Eis', Fighting: 'Kampf', Poison: 'Gift', Ground: 'Boden', Flying: 'Flug',
    Psychic: 'Psycho', Bug: 'Käfer', Rock: 'Gestein', Ghost: 'Geist', Dragon: 'Drache',
    Dark: 'Unlicht', Steel: 'Stahl', Fairy: 'Fee',
};

// ── Lookups (return {de, en}) ──────────────────────────────────────
function bi(de, en) { return { de: de || en, en }; }

export function speciesBi(maps, en) {
    if (!en) return bi('', '');
    const direct = maps.species[en];
    if (direct) return bi(direct, en);
    // Form: translate the base species, append a localised form label.
    const parts = en.split('-');
    const base = parts[0];
    const suffix = parts.slice(1).join('-');
    const baseDe = maps.species[base] || base;
    if (!suffix) return bi(baseDe, en);
    const formDe = FORM_DE[suffix] || suffix.replace(/-/g, ' ');
    return bi(`${baseDe} (${formDe})`, en);
}

export function itemBi(maps, en) { return en ? bi(maps.item.get(norm(en)), en) : null; }
export function abilityBi(maps, en) { return en ? bi(maps.ability.get(norm(en)), en) : null; }
export function moveBi(maps, en) { return bi(maps.move.get(norm(en)), en); }
export function natureBi(en) { return en ? bi(NATURE_DE[en], en) : null; }
export function typeBi(en) { return en ? bi(TYPE_DE[en], en) : null; }

export function statsLine(stats) {
    if (!stats) return '';
    return STAT_ORDER
        .filter(k => stats[k] != null && stats[k] !== 0)
        .map(k => `${stats[k]} ${STAT_LABELS[k][0]}/${STAT_LABELS[k][1]}`)
        .join(' · ');
}
