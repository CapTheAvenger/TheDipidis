/**
 * /start — entry point shown to whitelisted users on first contact
 * and any time they want the main menu back.
 *
 * Minimal surface: one-line prompt + the two inline-keyboard
 * buttons. Telegram requires *some* text on a message that carries
 * a reply_markup, so we send a one-word header and let the buttons
 * carry the meaning. Cuts the chat noise drastically vs. the
 * earlier multi-line greeting + bullet list.
 */

import { Markup } from 'telegraf';

const MENU_TEXT = '<b>Wähle:</b>';

const MENU_KEYBOARD = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Meta Call', 'metacall:list')],
    [Markup.button.callback('🃏 Deck Builder', 'deck:list')],
]);

export function registerStart(bot) {
    bot.start((ctx) => sendMenu(ctx));
    bot.command('menu', (ctx) => sendMenu(ctx));
    bot.action('menu:open', async (ctx) => {
        await ctx.answerCbQuery();
        return sendMenu(ctx);
    });
}

function sendMenu(ctx) {
    return ctx.reply(MENU_TEXT, {
        parse_mode: 'HTML',
        ...MENU_KEYBOARD,
    });
}
