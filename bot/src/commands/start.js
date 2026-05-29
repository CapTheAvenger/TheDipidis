/**
 * /start — entry point shown to whitelisted users on first contact
 * and any time they want the main menu back.
 *
 * Surfaces the two top-level actions (Meta Call snapshot, Deck Builder
 * snapshot) as inline keyboard buttons. Tapping a button fires a
 * callback that the index.js router resolves into a follow-up
 * command — keeps the slash-command surface minimal while still
 * letting users navigate without remembering syntax.
 *
 * Uses HTML parse_mode rather than MarkdownV2: V2 reserves so many
 * characters (`-`, `.`, `!`, `=`, `|`, etc.) that the static copy
 * below was crashing on hyphens like "Dark-Horse Picks". HTML's
 * escape surface is tiny (`<`, `>`, `&`) so escaping is reliable.
 */

import { Markup } from 'telegraf';

export function registerStart(bot) {
    bot.start((ctx) => sendMenu(ctx, /* greeting */ true));
    bot.command('menu', (ctx) => sendMenu(ctx, false));
    bot.action('menu:open', async (ctx) => {
        await ctx.answerCbQuery();
        return sendMenu(ctx, false);
    });
}

async function sendMenu(ctx, withGreeting) {
    const name = ctx.from?.first_name || 'Trainer';
    const lines = [];
    if (withGreeting) {
        lines.push(`Hi ${escapeHtml(name)} 👋`);
        lines.push('');
    }
    lines.push('<b>Was brauchst du?</b>');
    lines.push('');
    lines.push('• Meta Call — Field-Composition, Recommended Decks, Dark-Horse Picks');
    lines.push('• Deck Builder — Decklist + Tech-Cards für ein einzelnes Deck');

    return ctx.reply(lines.join('\n'), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Meta Call', 'metacall:list')],
            [Markup.button.callback('🃏 Deck Builder', 'deck:list')],
        ]),
    });
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
