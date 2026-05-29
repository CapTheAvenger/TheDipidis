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

import { allowedCount, whitelistMiddleware } from './auth.js';
import { registerStart } from './commands/start.js';
import { registerMetaCall } from './commands/metacall.js';
import { registerDeck } from './commands/deck.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = parseInt(process.env.PORT || '3000', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

if (!BOT_TOKEN) {
    console.error('[boot] BOT_TOKEN env var is required. Get one from @BotFather.');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Whitelist runs before anything else so denied users never touch
// the command handlers below.
bot.use(whitelistMiddleware);

registerStart(bot);
registerMetaCall(bot);
registerDeck(bot);

// Catch-all so an unknown command doesn't leave the user staring at
// silence. Lives at the end so it only fires when nothing else
// matched.
bot.on('text', (ctx) =>
    ctx.reply('Unbekannter Befehl. Tippe /menu für die Auswahl.'),
);

bot.catch((err, ctx) => {
    console.error(
        `[bot] handler error for update id=${ctx.update?.update_id}:`,
        err,
    );
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
    console.info(`[boot] whitelist: ${allowedCount()} user id(s) allowed`);
}

start().catch((err) => {
    console.error('[boot] failed to start bot:', err);
    process.exit(1);
});

// Graceful shutdown — Render sends SIGTERM before recycling the dyno.
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
        console.info(`[boot] received ${sig}, shutting down…`);
        bot.stop(sig);
        server.close(() => process.exit(0));
    });
}
