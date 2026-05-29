/**
 * /start — sets up the persistent reply keyboard.
 *
 * Telegram reply keyboards live below the chat input until the bot
 * explicitly removes them, so a single /start parks the two main
 * actions ("Meta Call" / "Deck Builder") on the user's keyboard
 * row forever. From then on the user just taps a button — no need
 * to remember slash commands, no need to scroll back through chat
 * history to find an inline keyboard.
 *
 * The tapped button sends the label as a normal text message; the
 * router (index.js) intercepts those labels and routes to the same
 * handler as the slash command. Inline keyboards stay reserved for
 * contextual actions on specific messages (e.g. "Neu rendern" next
 * to a rendered photo).
 */

import { Markup } from 'telegraf';

export const MENU_LABEL_METACALL = '📊 Meta Call';
export const MENU_LABEL_DECK = '🃏 Deck Builder';

export const MENU_KEYBOARD = Markup.keyboard([
    [MENU_LABEL_METACALL],
    [MENU_LABEL_DECK],
])
    .resize()       // compact button rows
    .persistent();  // sticks around even when the soft keyboard opens

export function registerStart(bot) {
    bot.start((ctx) =>
        ctx.reply(
            'Tippe direkt auf einen Button unten 👇',
            MENU_KEYBOARD,
        ),
    );
    bot.command('menu', (ctx) =>
        ctx.reply('👇', MENU_KEYBOARD),
    );
    bot.action('menu:open', async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.reply('👇', MENU_KEYBOARD);
    });
}

/**
 * Apply once on boot — Telegram caches /-commands per bot, so this
 * only fires the network call when something changed. Registering
 * /metacall and /deck here means they also show up in the slash-
 * command picker (the "/" pop-up) as a secondary way to fire the
 * same actions, useful for power users.
 */
export async function installBotCommands(bot) {
    try {
        await bot.telegram.setMyCommands([
            { command: 'metacall', description: 'Meta Call Dashboard rendern' },
            { command: 'deck', description: 'Deck Builder + Tech-Cards' },
            { command: 'menu', description: 'Buttons-Tastatur wieder einblenden' },
        ]);
    } catch (err) {
        console.warn('[boot] setMyCommands failed:', err && err.message);
    }
}
