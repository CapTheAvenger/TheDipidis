/**
 * /matchups — picker that surfaces matchup data for an archetype
 * WITHOUT building a deck list or rendering deck images.
 *
 * The /deck command already attaches a blended matchup matrix below
 * the rendered deck image. That's the right shape when the user
 * wants the full deck-builder output. But sometimes the user just
 * wants to scan how an archetype is performing against the field —
 * no deck composition, no card art, no sharp composites. /matchups
 * is the lightweight path for that case.
 *
 * Three tables per pick (kept as separate Telegram messages so each
 * one stays inside the iOS monospace-width budget of ~30 chars):
 *
 *   1. Title — "Matchup Spread · {deck} · #{rank} · {share}%"
 *      (echoes the deck-picker label so the user knows what they tapped)
 *   2. "Online Matchups" — pure Limitless TCG online data, untouched
 *      by the labs blend. Source: matchups_online on each
 *      current-meta source entry of the bot index JSON.
 *   3. "Majors · {format} · Day-2 Conv X% · N Turniere" — labs
 *      major-tournament data, sample-weighted day1→day2 conversion
 *      and tournament count in the title so the user can read off
 *      both deck performance and matchup spread in one glance.
 *
 * Callback wire format (Telegram caps payload at 64 bytes):
 *
 *   mu:page:<n>     → jump to picker page n (0-indexed)
 *   mu:pick:<key>   → user picked a deck → render the three tables
 *   mu:back         → return to picker
 */

import { Markup } from 'telegraf';

import { fetchDeckIndex } from '../data-index.js';
import { formatCombinedMatchupMatrix } from './deck.js';
import { MENU_KEYBOARD, MENU_LABEL_MATCHUPS } from './start.js';

const PAGE_SIZE = 8;

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

// Only show decks that actually have current-meta matchup data —
// the /matchups command is meaningless without numbers to display.
// Past-meta-only archetypes (rotated-out decks the index still
// carries) get filtered out here; users searching for them get a
// clear "no current data" reply from sendMatchupView instead of an
// empty picker entry.
function _hasMatchupData(deck) {
    const src = deck?.sources?.['current-meta'];
    if (!src) return false;
    const online = Array.isArray(src.matchups_online) ? src.matchups_online.length : 0;
    const majors = Array.isArray(src.matchups_majors) ? src.matchups_majors.length : 0;
    return online > 0 || majors > 0;
}

async function showMatchupList(ctx, page) {
    const index = await fetchDeckIndex();
    // Pre-filter keys to those with any matchup data — saves the user
    // a tap on dead entries and keeps the picker tight.
    const allKeys = Object.keys(index.decks || {}).filter((k) =>
        _hasMatchupData(index.decks[k]),
    );

    if (allKeys.length === 0) {
        return ctx.reply(
            '🚧 Noch keine Matchup-Daten verfügbar. Sobald die wöchentlichen Scraper-Daten geladen sind, erscheinen die Decks hier.',
        );
    }

    const totalPages = Math.max(1, Math.ceil(allKeys.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const start = safePage * PAGE_SIZE;
    const slice = allKeys.slice(start, start + PAGE_SIZE);

    const deckRows = slice.map((k) => [
        Markup.button.callback(_deckButtonLabel(index.decks[k]), `mu:pick:${k}`),
    ]);

    const nav = [];
    if (safePage > 0) nav.push(Markup.button.callback('←', `mu:page:${safePage - 1}`));
    nav.push(Markup.button.callback(`${safePage + 1}/${totalPages}`, 'mu:back'));
    if (safePage < totalPages - 1) nav.push(Markup.button.callback('→', `mu:page:${safePage + 1}`));

    const keyboard = Markup.inlineKeyboard([...deckRows, nav]);

    return ctx.reply(
        `<b>Matchup Spread — welches Deck?</b> (${allKeys.length} mit Daten)\n` +
        `<i>Tipp: Tippe einen Deck-Namen oder Teil davon ein, um zu suchen.</i>`,
        {
            parse_mode: 'HTML',
            ...keyboard,
        },
    );
}

function _fmtPct(n, dec = 1) {
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(dec).replace('.', ',')}%`;
}

async function sendMatchupView(ctx, deckKey) {
    const index = await fetchDeckIndex();
    const deck = index.decks?.[deckKey];
    const src = deck?.sources?.['current-meta'];
    if (!deck || !src) {
        return ctx.reply(
            `Keine Current-Meta-Matchup-Daten für ${escapeHtml(deckKey)}.`,
            { parse_mode: 'HTML' },
        );
    }

    const formatKey = src.format_key || 'aktuelles Format';
    const rank = deck.rank && deck.rank < 9999 ? ` · #${deck.rank}` : '';
    const share = Number.isFinite(deck.share_pct)
        ? ` · ${_fmtPct(deck.share_pct)} Share`
        : '';

    // Combined Online + Major view — one message, two WR columns per
    // row, so the user doesn't have to scroll between two separate
    // messages just to compare the same opponent across sources. The
    // header carries both contexts: format key for Major + Day-2
    // conversion line + tournament/player counts.
    //
    // Persistent reply keyboard rides on this message so the menu
    // re-asserts even after a long inline-keyboard navigation chain.
    const combined = formatCombinedMatchupMatrix(
        src.matchups_online,
        src.matchups_majors,
    );

    const day2    = Number.isFinite(src.majors_day2_conv_avg) ? src.majors_day2_conv_avg : 0;
    const nTours  = src.majors_tournament_count || 0;
    const players = src.majors_total_day1_players || 0;

    const titleLine = `<b>Matchup Spread · ${escapeHtml(deck.name)}</b>${escapeHtml(rank)}${escapeHtml(share)}`;
    const contextBits = [];
    contextBits.push(`<i>Onl = Limitless Online · Maj = ${escapeHtml(formatKey)}</i>`);
    if (nTours > 0) {
        const majorMeta = [`Day-2 Conv ${_fmtPct(day2)}`,
                           `${nTours} Turnier${nTours === 1 ? '' : 'e'}`];
        if (players > 0) majorMeta.push(`${players} Day-1 Spieler`);
        contextBits.push(`<i>${escapeHtml(majorMeta.join(' · '))}</i>`);
    }

    if (combined) {
        await ctx.reply(
            `${titleLine}\n${contextBits.join('\n')}\n<pre>${escapeHtml(combined)}</pre>`,
            { parse_mode: 'HTML', ...MENU_KEYBOARD },
        );
    } else {
        // Both sources empty — surface a single explanation message
        // so the user knows it's a data gap, not a bot error.
        await ctx.reply(
            `${titleLine}\n<i>Keine Matchup-Daten verfügbar (weder Online noch Major).</i>`,
            { parse_mode: 'HTML', ...MENU_KEYBOARD },
        );
    }

    // Back-nav button so the user can pick another deck without
    // retyping /matchups.
    return ctx.reply('—', Markup.inlineKeyboard([
        [Markup.button.callback('← Anderes Deck', 'mu:back')],
    ]));
}

export function registerMatchups(bot) {
    bot.command('matchups', (ctx) => showMatchupList(ctx, 0));
    if (MENU_LABEL_MATCHUPS) {
        bot.hears(MENU_LABEL_MATCHUPS, (ctx) => showMatchupList(ctx, 0));
    }
    bot.action('mu:back', async (ctx) => {
        await ctx.answerCbQuery();
        return showMatchupList(ctx, 0);
    });
    bot.action(/^mu:page:(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const page = parseInt(ctx.match[1], 10) || 0;
        return showMatchupList(ctx, page);
    });
    bot.action(/^mu:pick:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('📊 Lade Matchups …');
        return sendMatchupView(ctx, ctx.match[1]);
    });
}
