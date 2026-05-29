/**
 * Composite a deck-grid PNG for the Telegram bot.
 *
 * Layout: a stats header at the top followed by a 4-column grid of
 * card art tiles, each overlaid with the card's copy-count in the
 * bottom-right corner. The composite happens at request time using
 * sharp, but the per-card art is pre-fetched at deploy time into
 * `thedipidis.app/data/card-art/{SET}_{NUM}.png` so the bot fetches
 * tiles from the same origin as the deck index — no Limitless CDN
 * round trips, no rate-limit risk.
 *
 * Two LRU caches keep latency down across requests:
 *   • cardCache: per-tile PNG buffers (~25 KB each, capped at 1000)
 *   • deckCache: per-(deck, source) composited PNG buffers
 *     (capped at 32; first hit fills, subsequent hits return instantly)
 *
 * Render Free has 512 MB total — these caps land us around 25 MB
 * with comfortable headroom for the rest of the process.
 */

import sharp from 'sharp';

const SITE_BASE = process.env.SITE_BASE || 'https://thedipidis.app';

// Tile dimensions match the prefetcher's 250×350 PNG output so we
// composite without any per-tile resize at request time.
const TILE_W   = 250;
const TILE_H   = 350;
const COLS     = 4;
const GAP      = 8;
const PAD      = 16;
const HEADER_H = 140;

const BG_R = 20, BG_G = 20, BG_B = 28;

const MAX_DECKS_CACHED = 32;
const MAX_CARDS_CACHED = 1000;
const _deckCache = new Map();
const _cardCache = new Map();

function _lruBump(cache, key) {
    const v = cache.get(key);
    cache.delete(key);
    cache.set(key, v);
    return v;
}

function _lruInsert(cache, key, val, cap) {
    cache.set(key, val);
    while (cache.size > cap) {
        cache.delete(cache.keys().next().value);
    }
}

async function _placeholderTile() {
    // Solid dark-gray tile with a thin border so it visually reads as
    // "missing card" rather than vanishing into the background.
    return sharp({
        create: {
            width: TILE_W, height: TILE_H, channels: 4,
            background: { r: 45, g: 45, b: 55, alpha: 1 },
        },
    }).png().toBuffer();
}

async function _fetchCardArt(setCode, number) {
    const key = `${setCode}_${number}`;
    if (_cardCache.has(key)) return _lruBump(_cardCache, key);

    const url = `${SITE_BASE}/data/card-art/${encodeURIComponent(key)}.png`;
    let buf;
    try {
        const resp = await fetch(url, { headers: { 'User-Agent': 'thedipidis-bot/0.3' } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        buf = Buffer.from(await resp.arrayBuffer());
    } catch (err) {
        console.warn(`[deck-image] missing card art ${key}: ${err.message}`);
        buf = await _placeholderTile();
    }
    _lruInsert(_cardCache, key, buf, MAX_CARDS_CACHED);
    return buf;
}

function _escapeXml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _countBadgeSvg(count) {
    // Bottom-right rounded badge with the count. Sized to comfortably
    // fit one or two digits at 32 px text; transparent everywhere else.
    const w = TILE_W, h = TILE_H;
    const bx = w - 64, by = h - 64, bw = 52, bh = 52;
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
            <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" ry="10" fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
            <text x="${bx + bw / 2}" y="${by + 38}" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${count}</text>
        </svg>`,
    );
}

function _headerSvg(width, deck, source, sourceLabel) {
    // Two-line header: name on top, contextual stats below. Sources
    // beyond current-meta don't carry rank/share/winrate so we adapt
    // the right side to whatever is actually present in the payload.
    const name = _escapeXml(deck.name);
    const formatPart = source?.format_key ? ` · ${_escapeXml(source.format_key)}` : '';

    const stats = [];
    if (typeof source?.card_count === 'number') {
        const uniq = source.card_count_unique ?? (source.cards?.length ?? 0);
        stats.push(`${source.card_count} Karten (${uniq} unique)`);
    }
    if (Number.isFinite(deck?.rank) && deck.rank < 9999 && sourceLabel === 'Current Meta') {
        stats.push(`#${deck.rank}`);
    }
    if (typeof deck?.share_pct === 'number' && sourceLabel === 'Current Meta') {
        stats.push(`${deck.share_pct.toFixed(1).replace('.', ',')}% Share`);
    }
    if (typeof source?.winrate_pct === 'number' && sourceLabel === 'Current Meta') {
        stats.push(`${source.winrate_pct.toFixed(1).replace('.', ',')}% WR`);
    }
    if (typeof source?.sample_decks === 'number' && sourceLabel !== 'Current Meta') {
        stats.push(`${source.sample_decks} Sample-Decks`);
    }
    const subLine = `${_escapeXml(sourceLabel)}${formatPart} · ${stats.join(' · ')}`;

    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEADER_H}">
            <rect width="100%" height="100%" fill="rgb(${BG_R},${BG_G},${BG_B})"/>
            <text x="${PAD}" y="60" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="44" font-weight="800" fill="#ffffff">${name}</text>
            <text x="${PAD}" y="105" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="22" font-weight="400" fill="#bbbbcc">${_escapeXml(subLine)}</text>
        </svg>`,
    );
}

export async function generateDeckImage(deck, source, sourceLabel) {
    const cards = Array.isArray(source?.cards) ? source.cards : [];
    if (!deck || cards.length === 0) return null;

    const cacheKey = `${deck.key || deck.name}:${source.format_key || ''}:${sourceLabel}`;
    if (_deckCache.has(cacheKey)) return _lruBump(_deckCache, cacheKey);

    const rows = Math.ceil(cards.length / COLS);
    const width  = COLS * TILE_W + (COLS - 1) * GAP + 2 * PAD;
    const gridH  = rows * TILE_H + (rows - 1) * GAP;
    const height = HEADER_H + gridH + 2 * PAD;

    // Fetch all card tiles in parallel; first request per card is a
    // network hop, repeats are in-memory.
    const tileBuffers = await Promise.all(
        cards.map((c) => _fetchCardArt((c.set || '').toUpperCase(), c.number || '')),
    );

    // Pre-composite each tile with its count badge — saves us from
    // doing it inside the main composite call (sharp can't nest
    // composites in a single op, so we materialise each badged tile
    // first, then place it on the canvas).
    const badgedTiles = await Promise.all(
        tileBuffers.map((buf, i) =>
            sharp(buf)
                .composite([{ input: _countBadgeSvg(cards[i].count) }])
                .png()
                .toBuffer(),
        ),
    );

    const ops = [];
    for (let i = 0; i < cards.length; i++) {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        ops.push({
            input: badgedTiles[i],
            top:   HEADER_H + PAD + row * (TILE_H + GAP),
            left:  PAD + col * (TILE_W + GAP),
        });
    }
    ops.push({ input: _headerSvg(width, deck, source, sourceLabel), top: 0, left: 0 });

    const finalBuf = await sharp({
        create: {
            width, height, channels: 4,
            background: { r: BG_R, g: BG_G, b: BG_B, alpha: 1 },
        },
    })
        .composite(ops)
        .png({ compressionLevel: 8 })
        .toBuffer();

    _lruInsert(_deckCache, cacheKey, finalBuf, MAX_DECKS_CACHED);
    return finalBuf;
}
