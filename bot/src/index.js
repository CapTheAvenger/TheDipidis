/**
 * Entry point — boots an Express server (so Render keeps the dyno
 * alive on its HTTP health check) and a Telegraf bot side-by-side.
 *
 * The bot uses long-polling by default. Webhook mode is a single
 * environment-variable flip away (set WEBHOOK_URL) once we have a
 * stable public URL on Render.
 *
 * Architecture decisions:
 *   • One process owns both the HTTP service and the bot — Render
 *     Free Tier only runs one dyno per service and webhook/polling
 *     overhead is negligible at our traffic.
 *   • Whitelist middleware runs first so blocked users never reach
 *     the command handlers (avoids noise in logs + accidental
 *     data leaks via reply-on-error paths).
 *   • Commands are split per file under commands/ so each one can
 *     evolve independently in later phases.
 */

import express from 'express';
import { Telegraf } from 'telegraf';

import { allowedCount, isAdmin, isAllowed, listAdmins } from './auth.js';
import { installBotCommands, registerStart } from './commands/start.js';
import { registerMetaCall } from './commands/metacall.js';
import { registerDeck, handleDeckSearch } from './commands/deck.js';
import { handleAccessRequest, registerAccess } from './commands/access.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = parseInt(process.env.PORT || '3000', 10);
// Render injects RENDER_EXTERNAL_URL automatically with the public
// HTTPS URL of the web service. We fall back to it when WEBHOOK_URL
// isn't set explicitly — without this auto-detection the bot would
// poll-only on Render Free, which doesn't work because the dyno
// sleeps after 15 min idle and polling can't wake it back up. With
// webhook mode, Telegram pushes the update to our URL, the inbound
// HTTP request wakes Render, the bot processes the update.
const WEBHOOK_URL = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '';

if (!BOT_TOKEN) {
    console.error('[boot] BOT_TOKEN env var is required. Get one from @BotFather.');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Whitelist runs before anything else so denied users never touch
// the command handlers below. An outsider's `/start` is the one
// exception: it routes into the self-service access-request flow
// (commands/access.js) so admins can approve from chat instead of
// editing the env var by hand. Everything else from non-whitelisted
// users stays a silent ignore so the bot doesn't even announce its
// presence to strangers.
bot.use((ctx, next) => {
    if (isAdmin(ctx) || isAllowed(ctx)) return next();
    const from = ctx?.from || {};
    console.warn(`[auth] denied update from id=${from.id} username=${from.username || '(none)'}`);
    const text = ctx.message?.text || '';
    if (text === '/start' || text.startsWith('/start ')) {
        return handleAccessRequest(ctx).catch((err) =>
            console.warn('[access] request crashed:', err?.message || err),
        );
    }
    return Promise.resolve();
});

registerStart(bot);
registerAccess(bot);
registerMetaCall(bot);
registerDeck(bot);

// Catch-all for truly unrecognised text (anything that isn't a slash
// command we registered and isn't the persistent keyboard's button
// label). Lives at the end so it only fires when nothing else
// matched. We skip messages that begin with "/" — those are commands
// we don't recognise yet and Telegram clients render them visually
// distinct already; replying for every typo just adds noise.
//
// Otherwise we try a free-text deck search first — anything resembling
// a deck name surfaces a tappable result list. Only if that produces
// nothing useful (empty index, too-short query, no matches) do we
// fall back to the generic "tap a button" nudge.
bot.on('text', async (ctx) => {
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return;
    let handled;
    try {
        handled = await handleDeckSearch(ctx);
    } catch (err) {
        // Distinguish a crash from a legitimate "no match" — the
        // generic "tap a button" nudge is the wrong message when the
        // search itself broke. Tell the user the search hiccuped so
        // they know to retry instead of giving up on the bot.
        console.warn('[deck-search] crashed:', err);
        await ctx.reply(
            '⚠️ Deck-Suche aktuell nicht verfügbar — bitte gleich nochmal versuchen oder einen Button unten antippen.',
        ).catch(() => {});
        return;
    }
    if (handled) return;
    return ctx.reply('Tippe auf einen Button unten 👇 oder gib einen Deck-Namen ein.');
});

bot.catch((err, ctx) => {
    // Last-resort handler: when a command/action handler throws and
    // doesn't catch its own error, this fires. We log the full
    // stack for ops and send the user a short ack so the chat
    // doesn't go silent — without this they'd think the bot
    // crashed and have to guess whether their tap registered.
    console.error(
        `[bot] handler error for update id=${ctx.update?.update_id}:`,
        err,
    );
    // Best-effort reply; ignore failures here because we're already
    // in an error path — a second reply failure isn't worth bubbling
    // up. Inline-callback errors are answered separately so the
    // tapped button doesn't stay in its loading-pulse state forever.
    if (ctx?.callbackQuery) {
        ctx.answerCbQuery('⚠️ Fehler — bitte nochmal versuchen').catch(() => {});
    } else if (ctx?.reply) {
        ctx.reply('⚠️ Da ist was schiefgelaufen — bitte gleich nochmal versuchen.').catch(() => {});
    }
});

// HTTP side — Render polls / and /health to decide if the service
// is alive. We answer both with a short JSON body.
const app = express();

app.get('/', (_req, res) => {
    res.json({
        service: 'thedipidis-bot',
        status: 'ok',
        allowedUsers: allowedCount(),
    });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Webhook endpoint — only mounted when WEBHOOK_URL is set so we
// don't accidentally double-process updates while running polling.
if (WEBHOOK_URL) {
    const path = '/telegraf/' + bot.secretPathComponent();
    app.use(bot.webhookCallback(path));
}

const server = app.listen(PORT, () => {
    console.info(`[boot] HTTP listening on :${PORT}`);
});

async function start() {
    if (WEBHOOK_URL) {
        const path = '/telegraf/' + bot.secretPathComponent();
        const url = WEBHOOK_URL.replace(/\/+$/, '') + path;
        await bot.telegram.setWebhook(url);
        console.info(`[boot] webhook registered: ${url}`);
    } else {
        await bot.launch();
        console.info('[boot] long-polling started');
    }
    // Populate the slash-command picker so /metacall, /deck, /menu
    // are discoverable from the "/" pop-up. setMyCommands is
    // idempotent — Telegram only stores the new list, no per-user
    // state — so it's safe to call on every boot.
    await installBotCommands(bot);
    console.info(`[boot] whitelist: ${allowedCount()} user id(s) allowed`);
    const _admins = listAdmins();
    if (_admins.length === 0) {
        // Loudly surface the missing-admin config — the access-request
        // flow silently no-ops when no admin is around to receive the
        // ✅ / ❌ DM, and the requester just sees "Bot nicht für neue
        // User offen". Operator misses that there's no one being
        // notified at all.
        console.warn(
            '[boot] ADMIN_USER_IDS is empty — /start requests from new users will be ' +
            'rejected with the "Bot nicht offen" message and NO admin DM will be sent. ' +
            'Set ADMIN_USER_IDS=<your_telegram_id> in env to enable approvals.',
        );
    } else {
        console.info(`[boot] admins: ${_admins.length} configured`);
    }
}

start().catch((err) => {
    console.error('[boot] failed to start bot:', err);
    process.exit(1);
});

// Graceful shutdown — Render sends SIGTERM before recycling the dyno.
// We stop the bot's polling/webhook loop and close the HTTP server
// before exiting so the dyno doesn't leave half-finished requests.
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, async () => {
        console.info(`[boot] received ${sig}, shutting down…`);
        bot.stop(sig);
        server.close(() => process.exit(0));
    });
}
