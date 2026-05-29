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
import { MENU_LABEL_METACALL } from './start.js';

export function registerMetaCall(bot) {
    bot.command('metacall', (ctx) => handle(ctx));
    bot.action('metacall:list', async (ctx) => {
        // answerCbQuery stops the spinning indicator on the inline button
        // so the user knows we received the tap. Empty text = no toast.
        await ctx.answerCbQuery();
        return handle(ctx);
    });
    // Persistent reply-keyboard taps come in as plain text messages.
    // Match the exact label set by start.js.
    bot.hears(MENU_LABEL_METACALL, (ctx) => handle(ctx));
}

async function handle(ctx) {
    // The PNG is pre-rendered at deploy time and lives on GitHub
    // Pages — fetching it is fast enough (~1 s) that we skip the
    // "wird gerendert…" interstitial entirely. If the fetch ever
    // does take a while we can add it back as an editMessageText
    // flow, but optimizing for the common case keeps the chat clean.
    const started = Date.now();
    try {
        const png = await captureMetaCallImage();
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);

        await ctx.replyWithPhoto(
            { source: png },
            {
                caption: `Meta Call · ${elapsed}s`,
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Neu laden', 'metacall:list')],
                ]),
            },
        );
    } catch (err) {
        console.error('[metacall] fetch failed:', err);
        await ctx.reply(`❌ Meta Call konnte nicht geladen werden: ${err.message || err}`);
    }
}
