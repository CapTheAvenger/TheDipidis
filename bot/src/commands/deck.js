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
import { MENU_KEYBOARD, MENU_LABEL_DECK } from './start.js';

const PAGE_SIZE = 8;

const SOURCE_LABELS = {
    'current-meta': 'Current Meta',
    'past-tef-por': 'Past Meta',
    'city-league':  'City League',
};

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
        await ctx.answerCbQuery();
        return showSourcePicker(ctx, ctx.match[1]);
    });

    bot.action(/^deck:src:([^:]+):(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
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
        const fk = src?.format_key ? ` · ${src.format_key}` : '';
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
    const index = await fetchDeckIndex();
    const deck = index.decks?.[deckKey];
    const src = deck?.sources?.[sourceKey];
    if (!deck || !src) {
        return ctx.reply(`Keine Daten für ${escapeHtml(deckKey)} / ${escapeHtml(sourceKey)}.`, { parse_mode: 'HTML' });
    }

    const cardCount = src.card_count ?? 0;
    const uniqueCount = src.card_count_unique ?? src.cards?.length ?? 0;
    const sourceLabel = SOURCE_LABELS[sourceKey] || sourceKey;
    const fk = src.format_key ? ` · ${src.format_key}` : '';

    // Header message: deck name + meta. No <pre>, no inline buttons —
    // its only job is context. Keeping the header OUT of the code
    // block guarantees that when the user taps the </> copy icon on
    // the decklist message they get nothing but the cards.
    //
    // We attach the persistent reply keyboard here as a side effect:
    // Telegram only re-shows a collapsed reply keyboard when a fresh
    // message arrives with reply_markup of that type, so every
    // "completed action" message gets a chance to bring the menu
    // back. Since the header message has no inline keyboard of its
    // own, this is a free slot for the reply keyboard.
    await ctx.reply(
        `<b>${escapeHtml(deck.name)}</b>\n` +
        `${escapeHtml(sourceLabel)}${escapeHtml(fk)} · ${cardCount} Karten (${uniqueCount} unique)`,
        { parse_mode: 'HTML', ...MENU_KEYBOARD },
    );

    // Decklist message: only the list, wrapped in a plain <pre>
    // code block so monospace alignment holds. Ace-Spec lines are
    // re-encoded in Unicode mathematical-bold characters by the
    // formatter — that's how we get visible emphasis past Telegram's
    // strip-formatting-inside-pre behaviour (HTML <b> tags and ANSI
    // escapes both get eaten there).
    const list = formatDecklistAsPTCGL(src, { emphasizeAceSpec: true });
    return ctx.reply(
        `<pre>${escapeHtml(list)}</pre>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Andere Quelle', `deck:pick:${deckKey}`)],
                [Markup.button.callback('📋 Deck-Liste', 'deck:back')],
            ]),
        },
    );
}
