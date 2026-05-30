/**
 * /metacall — sends a pre-rendered dashboard PNG.
 *
 * Two variants exist (see prerender/prerender-meta-call.js):
 *
 *   📊 Current — the active rotation, including the still-running
 *      online + Major data the predictor blends.
 *   📜 Past    — the frozen labs-only view of the previous rotation,
 *      no predictor concentration counters or hype-damper applied.
 *
 * On the first tap we show a two-button sub-menu so the user picks
 * which one they want — labels include the format key
 * (e.g. "TEF-CRI", "TEF-POR") pulled from meta-call-info.json so the
 * rotation labels stay accurate without code changes.
 */

import { Markup } from 'telegraf';

import { captureMetaCallImage, getMetaCallInfo } from '../screenshot.js';
import { withLoading } from '../utils/loading.js';
import { MENU_LABEL_METACALL } from './start.js';

// Same env override pattern as commands/deck.js — lets us point at a
// staging Pages URL when testing without redeploying the bot.
const WEBSITE_BASE_URL = (process.env.WEBSITE_BASE_URL || 'https://thedipidis.app').replace(/\/+$/, '');
// The Meta Call dashboard on the website is a sub-tab of Profile, so
// both bot variants (current / past PNG) link to the same #metacall
// alias — the site only renders the live current-rotation dashboard
// there. The past PNG is a bot-exclusive snapshot; on the site you'd
// browse #past-meta for archived archetype analysis instead.
const METACALL_DEEP_LINK = `${WEBSITE_BASE_URL}/#metacall`;

export function registerMetaCall(bot) {
    bot.command('metacall', (ctx) => showVariantMenu(ctx));
    bot.action('metacall:list', async (ctx) => {
        await ctx.answerCbQuery();
        return showVariantMenu(ctx);
    });
    bot.hears(MENU_LABEL_METACALL, (ctx) => showVariantMenu(ctx));

    bot.action('metacall:current', async (ctx) => {
        // Toast right at the tap site — shows even before the chat-
        // action heartbeat kicks in. answerCbQuery can only fire once
        // per callback, so we pack the loading text in here instead of
        // calling it twice.
        await ctx.answerCbQuery('🔄 Lade Meta Call…');
        return sendVariant(ctx, 'current');
    });
    bot.action('metacall:past', async (ctx) => {
        await ctx.answerCbQuery('🔄 Lade Meta Call…');
        return sendVariant(ctx, 'past');
    });
}

async function showVariantMenu(ctx) {
    const info = await getMetaCallInfo();
    const currentKey = info.current?.key || '—';
    const pastKey = info.past?.key || '—';
    return ctx.reply(
        '<b>Welches Meta?</b>',
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`📊 Current · ${currentKey}`, 'metacall:current')],
                [Markup.button.callback(`📜 Past · ${pastKey}`,       'metacall:past')],
            ]),
        },
    );
}

async function sendVariant(ctx, variant) {
    const started = Date.now();
    const variantLabel = variant === 'current' ? 'Current' : 'Past';
    try {
        // Heartbeat 'upload_photo' so the chat-header shows
        // "sending a photo…" the whole time we're fetching the PNG.
        // Banner only fires after 1.5s — covers the case where the
        // toast has already faded and the PNG is still rendering.
        const { buffer, key } = await withLoading(
            ctx,
            {
                chatAction: 'upload_photo',
                statusText: `🔄 Lade Meta Call (${variantLabel})… kann ein paar Sekunden dauern`,
            },
            () => captureMetaCallImage(variant),
        );
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        const rows = [
            [Markup.button.url('🌐 Auf Website öffnen', METACALL_DEEP_LINK)],
            [Markup.button.callback('🔄 Neu laden', `metacall:${variant}`)],
            [Markup.button.callback('⬅️ Andere Variante', 'metacall:list')],
        ];
        await ctx.replyWithPhoto(
            { source: buffer },
            {
                caption: `Meta Call · ${variantLabel} · ${key} · ${elapsed}s`,
                ...Markup.inlineKeyboard(rows),
            },
        );
    } catch (err) {
        console.error(`[metacall:${variant}] fetch failed:`, err);
        await ctx.reply(`❌ Meta Call (${variant}) konnte nicht geladen werden: ${err.message || err}`);
    }
}
