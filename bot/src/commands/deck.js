/**
 * /deck — three-step picker.
 *
 *   1. List all decks the bot has data for (paginated; 8 per page).
 *   2. User taps a deck → list the sources that have data for it
 *      (e.g. Current Meta · TEF-CRI). Past Meta + City League slot
 *      in here once the next phases land.
 *   3. User taps a source → bot sends the decklist as a copy-paste
 *      PTCGL block.
 *
 * Callback-data wire format (Telegram caps payload at 64 bytes —
 * deck keys are slugs so they fit, but we keep room by using short
 * prefixes):
 *
 *   deck:page:<n>            → jump to page n (0-indexed)
 *   deck:pick:<key>          → user picked a deck → show sources
 *   deck:src:<key>:<source>  → user picked a source → send decklist
 *   deck:back                → return to deck picker
 */

import { Markup } from 'telegraf';

import { fetchDeckIndex, formatDecklistAsPTCGL } from '../data-index.js';
import { generateDeckImage, generateTechImage } from '../deck-image.js';
import { startChatActionHeartbeat } from '../utils/loading.js';
import { MENU_KEYBOARD, MENU_LABEL_DECK } from './start.js';

const PAGE_SIZE = 8;

const SOURCE_LABELS = {
    'current-meta': 'Current Meta',
    'past-tef-por': 'Past Meta',
    'city-league':  'City League',
};

// Sources whose label benefits from the format-key suffix. Current
// Meta + Past Meta carry the EN set rotation as user-meaningful
// context ("TEF-CRI", "TEF-POR"). City League data is JP-rotation
// (M3 mapped to EN TEF-POR) and the set code is just noise on the
// picker — the label alone is enough.
const SOURCE_FORMAT_VISIBLE = new Set(['current-meta', 'past-tef-por']);

// Maps the bot's source-key (= which JSON bucket the data lives in)
// to the website tab the deep-link should land on. We point at the
// *-analysis tabs, not the meta-overview tabs — those are the ones
// that actually host the archetype dropdown + decklist view (a.k.a.
// "Deck Analysis Global"). Sending a user from a decklist message
// straight to a meta overview would just dump them on a chart with
// no obvious next click.
// js/inline-init.js's HASH_ALIASES recognises these tab IDs already;
// we append query-style params (?deck=…&format=…) and the handler
// over there routes accordingly.
const SOURCE_WEBSITE_TAB = {
    'current-meta': 'current-analysis',
    'past-tef-por': 'past-meta',           // past-meta hosts its own dropdown — no sibling -analysis tab
    'city-league':  'city-league-analysis',
};
const WEBSITE_BASE_URL = (process.env.WEBSITE_BASE_URL || 'https://thedipidis.app').replace(/\/+$/, '');

function buildDeepLink(sourceKey, deck, src) {
    const tab = SOURCE_WEBSITE_TAB[sourceKey];
    if (!tab || !deck?.name) return null;
    const qs = new URLSearchParams({ deck: deck.name });
    // Past Meta on the website needs the format key too — the page
    // gates archetype availability behind a format dropdown, and the
    // dedicated nav helper only fires when both pieces are present.
    if (sourceKey === 'past-tef-por' && src?.format_key) {
        qs.set('format', src.format_key);
    }
    return `${WEBSITE_BASE_URL}/#${tab}?${qs.toString()}`;
}

export function registerDeck(bot) {
    bot.command('deck', (ctx) => showDeckList(ctx, 0));
    bot.action('deck:list', async (ctx) => {
        await ctx.answerCbQuery();
        return showDeckList(ctx, 0);
    });
    bot.hears(MENU_LABEL_DECK, (ctx) => showDeckList(ctx, 0));

    bot.action(/^deck:page:(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const page = parseInt(ctx.match[1], 10) || 0;
        return showDeckList(ctx, page);
    });

    bot.action(/^deck:pick:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('Lade…');
        return showSourcePicker(ctx, ctx.match[1]);
    });

    bot.action(/^deck:src:([^:]+):(.+)$/, async (ctx) => {
        // Surface "I heard you" right at the tap. The decklist flow
        // below sends multiple messages (deck image + tech image +
        // matchup + decklist), and each replyWithPhoto manages its
        // own upload_photo indicator — but the user-facing toast
        // bridges the gap before any of that fires.
        await ctx.answerCbQuery('🔄 Erstelle Deck-Bild…');
        return sendDecklist(ctx, ctx.match[1], ctx.match[2]);
    });

    bot.action('deck:back', async (ctx) => {
        await ctx.answerCbQuery();
        return showDeckList(ctx, 0);
    });
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Width budget for the matchup table inside a <pre> block. Phones in
// portrait render Telegram's monospace font at ~30 chars wide; this
// layout (opponent + winrate + marker) lands at ~30 chars so it fits
// cleanly without a horizontal scroll bar on most clients.
const MATCHUP_OPP_W = 22;
function _truncate(s, max) {
    s = String(s ?? '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function _padRight(s, w) {
    s = String(s ?? '');
    return s + ' '.repeat(Math.max(0, w - [...s].length));
}
function _padLeft(s, w) {
    s = String(s ?? '');
    return ' '.repeat(Math.max(0, w - [...s].length)) + s;
}

function formatMatchupMatrix(matchups) {
    if (!Array.isArray(matchups) || matchups.length === 0) return null;
    const lines = [];
    lines.push(`${_padRight('Gegner', MATCHUP_OPP_W)} ${_padLeft('WR', 5)}`);
    lines.push('─'.repeat(MATCHUP_OPP_W + 1 + 5));
    for (const m of matchups) {
        const wr = Number.isFinite(m.win_pct) ? m.win_pct : 0;
        // Use the same colour cut-offs as the website's Matchup Matrix:
        // ≥55 is a favourable matchup, ≤45 is unfavourable, the rest
        // sits in the grey band where the bot leaves the line clean.
        let marker = '';
        if (wr >= 55) marker = '🟢';
        else if (wr <= 45) marker = '🔴';
        const wrText = `${wr.toFixed(1).replace('.', ',')}%`;
        lines.push(
            `${_padRight(_truncate(m.opponent, MATCHUP_OPP_W), MATCHUP_OPP_W)} ` +
            `${_padLeft(wrText, 5)}${marker ? ' ' + marker : ''}`,
        );
    }
    return lines.join('\n');
}

function _deckButtonLabel(deck) {
    const rank = deck.rank;
    const prefix = rank && rank < 9999 ? `#${rank} ` : '';
    return `${prefix}${deck.name}`;
}

async function showDeckList(ctx, page) {
    const index = await fetchDeckIndex();
    const allKeys = Object.keys(index.decks || {});

    if (allKeys.length === 0) {
        return ctx.reply(
            '🚧 Noch keine Deck-Daten verfügbar. Bitte später nochmal — der Pages-Build muss erst durchlaufen.',
        );
    }

    const totalPages = Math.max(1, Math.ceil(allKeys.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * PAGE_SIZE;
    const slice = allKeys.slice(start, start + PAGE_SIZE);

    // Keys are already sorted by rank in the JSON so the slice
    // preserves rank order — we just label each button with the rank
    // prefix so the sort is visible on phone screens.
    const deckRows = slice.map((k) => [
        Markup.button.callback(_deckButtonLabel(index.decks[k]), `deck:pick:${k}`),
    ]);

    // Nav row: ← prev / page indicator / next →. We only show the
    // arrows when there's somewhere to go.
    const nav = [];
    if (safePage > 0) nav.push(Markup.button.callback('←', `deck:page:${safePage - 1}`));
    nav.push(Markup.button.callback(`${safePage + 1}/${totalPages}`, 'deck:list'));
    if (safePage < totalPages - 1) nav.push(Markup.button.callback('→', `deck:page:${safePage + 1}`));

    const keyboard = Markup.inlineKeyboard([...deckRows, nav]);

    return ctx.reply(
        `<b>Welches Deck?</b> (${allKeys.length} insgesamt)\n` +
        `<i>Tipp: Tippe einen Deck-Namen oder Teil davon ein, um zu suchen.</i>`,
        {
            parse_mode: 'HTML',
            ...keyboard,
        },
    );
}

/**
 * Free-text search handler. Called from index.js's catch-all text
 * middleware when the user's message isn't a slash-command and
 * doesn't match one of the reply-keyboard labels. Substring match,
 * case-insensitive — fuzzy enough for "drag" → Dragapult* without
 * dragging in a Fuse.js dependency.
 *
 * Returns true if the search produced a meaningful reply, false if
 * the catch-all should fall back to its generic "tap a button"
 * message (e.g. empty query, no matches, index unreachable).
 */
export async function handleDeckSearch(ctx) {
    const raw = (ctx.message?.text || '').trim();
    if (raw.length < 2) return false;

    const index = await fetchDeckIndex();
    const decks = Object.values(index.decks || {});
    if (decks.length === 0) return false;

    const needle = raw.toLowerCase();
    const matches = decks
        .filter((d) => (d.name || '').toLowerCase().includes(needle))
        // Already-rank-sorted from the JSON; this preserves it.
        .slice(0, 12);

    if (matches.length === 0) {
        await ctx.reply(
            `Keine Treffer für "<b>${escapeHtml(raw)}</b>".\n` +
            `Versuch's mit einem kürzeren Suchbegriff oder tippe unten auf <b>${escapeHtml(MENU_LABEL_DECK)}</b>.`,
            { parse_mode: 'HTML' },
        );
        return true;
    }

    const rows = matches.map((d) => [
        Markup.button.callback(_deckButtonLabel(d), `deck:pick:${d.key}`),
    ]);

    await ctx.reply(
        `<b>${matches.length} Treffer für "${escapeHtml(raw)}":</b>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(rows),
        },
    );
    return true;
}

async function showSourcePicker(ctx, deckKey) {
    const index = await fetchDeckIndex();
    const deck = index.decks?.[deckKey];
    if (!deck) {
        return ctx.reply(`Deck "${escapeHtml(deckKey)}" nicht im Index.`, { parse_mode: 'HTML' });
    }

    const sources = Object.keys(deck.sources || {});
    if (sources.length === 0) {
        return ctx.reply(`Keine Quellen für ${escapeHtml(deck.name)}.`, { parse_mode: 'HTML' });
    }

    const rows = sources.map((srcKey) => {
        const src = deck.sources[srcKey];
        const label = SOURCE_LABELS[srcKey] || srcKey;
        const fk = (src?.format_key && SOURCE_FORMAT_VISIBLE.has(srcKey)) ? ` · ${src.format_key}` : '';
        return [Markup.button.callback(`📦 ${label}${fk}`, `deck:src:${srcKey}:${deckKey}`)];
    });
    rows.push([Markup.button.callback('⬅️ Andere Decks', 'deck:back')]);

    return ctx.reply(
        `<b>${escapeHtml(deck.name)}</b>\nQuelle wählen:`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(rows),
        },
    );
}

async function sendDecklist(ctx, sourceKey, deckKey) {
    // Keep "Bot is sending a photo…" visible at the top of the chat
    // for the entire deck-list assembly: main image (slow), tech
    // image (slow), matchup table (instant), decklist (instant).
    // Without this the user sees a 5–10s silent gap between the
    // toast fading and the first photo arriving.
    const stopHeartbeat = startChatActionHeartbeat(ctx, 'upload_photo');
    try {
        return await _sendDecklistInner(ctx, sourceKey, deckKey);
    } finally {
        stopHeartbeat();
    }
}

async function _sendDecklistInner(ctx, sourceKey, deckKey) {
    const index = await fetchDeckIndex();
    const deck = index.decks?.[deckKey];
    const src = deck?.sources?.[sourceKey];
    if (!deck || !src) {
        return ctx.reply(`Keine Daten für ${escapeHtml(deckKey)} / ${escapeHtml(sourceKey)}.`, { parse_mode: 'HTML' });
    }

    const cardCount = src.card_count ?? 0;
    const uniqueCount = src.card_count_unique ?? src.cards?.length ?? 0;
    const sourceLabel = SOURCE_LABELS[sourceKey] || sourceKey;
    const fk = (src.format_key && SOURCE_FORMAT_VISIBLE.has(sourceKey)) ? ` · ${src.format_key}` : '';
    const captionText =
        `<b>${escapeHtml(deck.name)}</b>\n` +
        `${escapeHtml(sourceLabel)}${escapeHtml(fk)} · ${cardCount} Karten (${uniqueCount} unique)`;

    // Main image carries the stock 60-card grid + stats header. Tech
    // image (sent separately, kept under the same caption umbrella) is
    // the 5-30 % inclusion bucket — the cards a player would consider
    // swapping in for a specific meta call. Keeping them as two photos
    // means each one stays readable on a phone screen instead of
    // becoming a 60-tile wall.
    //
    // The persistent reply keyboard rides on the MAIN image's caption
    // so it re-asserts on every full deck view. Tech image goes out
    // with a plain caption so we don't double-attach the keyboard
    // (Telegram only needs it once per outbound flow).
    let sentMainImage = false;
    try {
        const png = await generateDeckImage(deck, src, sourceLabel);
        if (png) {
            await ctx.replyWithPhoto(
                { source: png, filename: `${deck.key || 'deck'}.png` },
                { caption: captionText, parse_mode: 'HTML', ...MENU_KEYBOARD },
            );
            sentMainImage = true;
        }
    } catch (err) {
        console.warn('[deck-image] main composite failed:', err?.message || err);
    }
    if (!sentMainImage) {
        await ctx.reply(captionText, { parse_mode: 'HTML', ...MENU_KEYBOARD });
    }

    if (Array.isArray(src.tech_cards) && src.tech_cards.length > 0) {
        try {
            const techPng = await generateTechImage(deck, src, sourceLabel);
            if (techPng) {
                const techCaption =
                    `<b>${escapeHtml(deck.name)} — Alternativen</b>\n` +
                    `${src.tech_cards.length} Karten · sortiert nach Usage`;
                await ctx.replyWithPhoto(
                    { source: techPng, filename: `${deck.key || 'deck'}-tech.png` },
                    { caption: techCaption, parse_mode: 'HTML' },
                );
            }
        } catch (err) {
            console.warn('[deck-image] tech composite failed:', err?.message || err);
        }
    }

    // Matchup Matrix — same labs-tournament data the website's
    // archetype page shows, rendered as a monospace table inside a
    // <pre> block. Only attached for sources with labs coverage
    // (current-meta + past-meta); city-league stays card-only.
    const matchupTable = formatMatchupMatrix(src.matchups);
    if (matchupTable) {
        await ctx.reply(
            `<b>Matchup-Matrix</b> · ${escapeHtml(src.format_key || sourceLabel)}\n` +
            `<pre>${escapeHtml(matchupTable)}</pre>`,
            { parse_mode: 'HTML' },
        );
    }

    // Decklist message: only the list, wrapped in a plain <pre>
    // code block so monospace alignment holds. Ace-Spec lines are
    // re-encoded in Unicode mathematical-bold characters by the
    // formatter — that's how we get visible emphasis past Telegram's
    // strip-formatting-inside-pre behaviour (HTML <b> tags and ANSI
    // escapes both get eaten there).
    const list = formatDecklistAsPTCGL(src, { emphasizeAceSpec: true });
    const deepLink = buildDeepLink(sourceKey, deck, src);
    const navRows = [
        [Markup.button.callback('⬅️ Andere Quelle', `deck:pick:${deckKey}`)],
        [Markup.button.callback('📋 Deck-Liste', 'deck:back')],
    ];
    if (deepLink) {
        // URL buttons live above the callback rows so the user's eye
        // hits "open on site" first — the navigation-back actions are
        // a fallback, not the primary CTA after we just handed them a
        // fully-formed decklist.
        navRows.unshift([Markup.button.url('🌐 Auf Website öffnen', deepLink)]);
    }
    return ctx.reply(
        `<pre>${escapeHtml(list)}</pre>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(navRows),
        },
    );
}
