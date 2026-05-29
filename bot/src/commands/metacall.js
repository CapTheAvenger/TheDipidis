/**
 * /metacall — pulls the Meta Call dashboard from thedipidis.app
 * via Puppeteer and sends it as a photo.
 *
 * Phase 2 (this commit) ships the simplest cut: one tap → one
 * screenshot of the latest Meta Call dashboard. The "pick a
 * tournament" inline-keyboard from the original plan moves to a
 * later phase — surfacing the tournament list requires either
 * parsing the app's tournament selector or driving the same
 * Firestore reads the PWA does, both of which need more plumbing.
 *
 * Cold-start budget:
 *   • Render Free wake          ~30 s (one-time per idle window)
 *   • Chromium launch (first)   ~3-5 s
 *   • Page open + data load     ~5-10 s
 *   • Canvas render + read      <1 s
 *   Total first request:        ~40 s
 *   Warm subsequent requests:   ~8-12 s
 */

import { Markup } from 'telegraf';

import { captureMetaCallImage } from '../screenshot.js';

export function registerMetaCall(bot) {
    bot.command('metacall', (ctx) => handle(ctx));
    bot.action('metacall:list', async (ctx) => {
        // answerCbQuery stops the spinning indicator on the inline button
        // so the user knows we received the tap. Empty text = no toast.
        await ctx.answerCbQuery();
        return handle(ctx);
    });
}

async function handle(ctx) {
    // Telegram limits messages so we send a "working on it" first.
    // editMessage lets us replace it with the image when ready instead
    // of leaving the status hanging in the chat.
    const status = await ctx.reply(
        '📊 Meta Call wird gerendert… (kann beim ersten Mal nach längerer Pause bis zu 40 s dauern)',
    );

    const started = Date.now();
    try {
        const png = await captureMetaCallImage();
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);

        await ctx.replyWithPhoto(
            { source: png },
            {
                caption: `Meta Call — gerendert in ${elapsed}s`,
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Neu rendern', 'metacall:list')],
                    [Markup.button.callback('⬅️ Menü', 'menu:open')],
                ]),
            },
        );

        // Clean up the status message — we replaced it with the photo.
        await ctx.deleteMessage(status.message_id).catch(() => {});
    } catch (err) {
        console.error('[metacall] render failed:', err);
        await ctx.telegram
            .editMessageText(
                status.chat.id,
                status.message_id,
                undefined,
                `❌ Render fehlgeschlagen: ${err.message || err}`,
            )
            .catch(() => {
                // Edit failed (maybe the original message is too old) —
                // just send a fresh error reply so the user sees something.
                ctx.reply(`❌ Render fehlgeschlagen: ${err.message || err}`);
            });
    }
}
