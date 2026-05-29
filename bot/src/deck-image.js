/**
 * Composite deck-grid PNGs for the Telegram bot.
 *
 * Two flavours, same layout primitives:
 *   • Main image  — header + stock 60-card grid, each tile overlaid
 *                   with inclusion % (top-left) + count (bottom-right)
 *   • Tech image  — same layout against the (up to 10) tech-card list
 *                   that sits between 5–30 % inclusion. Shipped
 *                   separately so the main image stays focused.
 *
 * Per-card art is pre-fetched at deploy time into
 * `thedipidis.app/data/card-art/{SET}_{NUM}.png` so the bot fetches
 * tiles same-origin — no Limitless CDN round trips, no rate-limit risk.
 *
 * LRU caches:
 *   • cardCache: per-tile PNG buffers (~25 KB each, capped at 1000)
 *   • imageCache: per-(deck, source, mode) composited PNG buffers
 *     (capped at 64; first hit fills, subsequent hits return instantly)
 *
 * Render Free has 512 MB total — these caps land us around 25 MB
 * with comfortable headroom for the rest of the process.
 */

import sharp from 'sharp';

const SITE_BASE = process.env.SITE_BASE || 'https://thedipidis.app';

const TILE_W   = 250;
const TILE_H   = 350;
const COLS     = 4;
const GAP      = 8;
const PAD      = 16;
const HEADER_H = 140;

const BG_R = 20, BG_G = 20, BG_B = 28;

const MAX_IMAGES_CACHED = 64;
const MAX_CARDS_CACHED  = 1000;
const _imageCache = new Map();
const _cardCache  = new Map();

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

function _fmtPct(n) {
    if (!Number.isFinite(n)) return '';
    // Drop the decimal for clean numbers; keep one for fractional ones.
    return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1).replace('.', ',')}%`;
}

function _tileOverlaysSvg(card) {
    // Top-left badge stacks inclusion-% on top of the average count;
    // bottom-right badge stays as the rounded copy-count we put in the
    // list. Same dimensions, same rounded corners — visually paired so
    // the two stats read as a matching corner-set rather than two
    // mismatched stickers.
    const w = TILE_W, h = TILE_H;
    const inclusion = _fmtPct(card.inclusion_pct);
    const avgRaw = (Number.isFinite(card.avg_count) && card.avg_count > 0)
        ? card.avg_count.toFixed(1).replace('.', ',')
        : '';
    const showTop = Boolean(inclusion || avgRaw);

    const tbX = 8, tbY = 8, tbW = 64, tbH = 52;
    const countBx = w - 64, countBy = h - 64, countBw = 52, countBh = 52;

    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
            ${showTop ? `
            <rect x="${tbX}" y="${tbY}" width="${tbW}" height="${tbH}" rx="10" ry="10"
                  fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
            ${inclusion ? `<text x="${tbX + tbW / 2}" y="${tbY + 22}"
                  font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"
                  font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">${_escapeXml(inclusion)}</text>` : ''}
            ${avgRaw ? `<text x="${tbX + tbW / 2}" y="${tbY + 44}"
                  font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"
                  font-size="14" font-weight="400" fill="#c8c8d6" text-anchor="middle">⌀ ${_escapeXml(avgRaw)}</text>` : ''}
            ` : ''}
            <rect x="${countBx}" y="${countBy}" width="${countBw}" height="${countBh}" rx="10" ry="10"
                  fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
            <text x="${countBx + countBw / 2}" y="${countBy + 38}"
                  font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"
                  font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${card.count}</text>
        </svg>`,
    );
}

function _headerSvg(width, titleText, subLine) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEADER_H}">
            <rect width="100%" height="100%" fill="rgb(${BG_R},${BG_G},${BG_B})"/>
            <text x="${PAD}" y="60" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="44" font-weight="800" fill="#ffffff">${_escapeXml(titleText)}</text>
            <text x="${PAD}" y="105" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-size="22" font-weight="400" fill="#bbbbcc">${_escapeXml(subLine)}</text>
        </svg>`,
    );
}

function _mainHeaderLines(deck, source, sourceLabel) {
    const title = deck.name;
    const formatPart = source?.format_key ? ` · ${source.format_key}` : '';
    const bits = [];
    if (typeof source?.card_count === 'number') {
        const uniq = source.card_count_unique ?? (source.cards?.length ?? 0);
        bits.push(`${source.card_count} Karten (${uniq} unique)`);
    }
    if (Number.isFinite(deck?.rank) && deck.rank < 9999 && sourceLabel === 'Current Meta') {
        bits.push(`#${deck.rank}`);
    }
    if (typeof deck?.share_pct === 'number' && sourceLabel === 'Current Meta') {
        bits.push(`${deck.share_pct.toFixed(1).replace('.', ',')}% Share`);
    }
    if (typeof source?.winrate_pct === 'number' && sourceLabel === 'Current Meta') {
        bits.push(`${source.winrate_pct.toFixed(1).replace('.', ',')}% WR`);
    }
    if (typeof source?.sample_decks === 'number' && sourceLabel !== 'Current Meta') {
        bits.push(`${source.sample_decks} Sample-Decks`);
    }
    return { title, sub: `${sourceLabel}${formatPart} · ${bits.join(' · ')}` };
}

function _techHeaderLines(deck, source, sourceLabel, techCount) {
    const formatPart = source?.format_key ? ` · ${source.format_key}` : '';
    return {
        title: `${deck.name} — Tech-Karten`,
        sub: `${sourceLabel}${formatPart} · ${techCount} Optionen · 5–30 % Usage`,
    };
}

async function _compose(cards, headerLines) {
    if (!Array.isArray(cards) || cards.length === 0) return null;

    const rows = Math.ceil(cards.length / COLS);
    const width  = COLS * TILE_W + (COLS - 1) * GAP + 2 * PAD;
    const gridH  = rows * TILE_H + (rows - 1) * GAP;
    const height = HEADER_H + gridH + 2 * PAD;

    const tileBuffers = await Promise.all(
        cards.map((c) => _fetchCardArt((c.set || '').toUpperCase(), c.number || '')),
    );
    // Pre-composite each tile with its overlays — sharp can't nest
    // composites in a single op, so we materialise each badged tile
    // first, then place it on the canvas.
    const badgedTiles = await Promise.all(
        tileBuffers.map((buf, i) =>
            sharp(buf)
                .composite([{ input: _tileOverlaysSvg(cards[i]) }])
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
    ops.push({ input: _headerSvg(width, headerLines.title, headerLines.sub), top: 0, left: 0 });

    return sharp({
        create: {
            width, height, channels: 4,
            background: { r: BG_R, g: BG_G, b: BG_B, alpha: 1 },
        },
    })
        .composite(ops)
        .png({ compressionLevel: 8 })
        .toBuffer();
}

export async function generateDeckImage(deck, source, sourceLabel) {
    if (!deck || !Array.isArray(source?.cards) || source.cards.length === 0) return null;
    const cacheKey = `main:${deck.key || deck.name}:${source.format_key || ''}:${sourceLabel}`;
    if (_imageCache.has(cacheKey)) return _lruBump(_imageCache, cacheKey);
    const buf = await _compose(source.cards, _mainHeaderLines(deck, source, sourceLabel));
    if (buf) _lruInsert(_imageCache, cacheKey, buf, MAX_IMAGES_CACHED);
    return buf;
}

export async function generateTechImage(deck, source, sourceLabel) {
    if (!deck) return null;
    const tech = Array.isArray(source?.tech_cards) ? source.tech_cards : [];
    if (tech.length === 0) return null;
    const cacheKey = `tech:${deck.key || deck.name}:${source.format_key || ''}:${sourceLabel}`;
    if (_imageCache.has(cacheKey)) return _lruBump(_imageCache, cacheKey);
    const buf = await _compose(tech, _techHeaderLines(deck, source, sourceLabel, tech.length));
    if (buf) _lruInsert(_imageCache, cacheKey, buf, MAX_IMAGES_CACHED);
    return buf;
}
