/**
 * Whitelist-based access control for the bot.
 *
 * ALLOWED_USER_IDS env var holds a comma-separated list of numeric
 * Telegram user IDs. We strictly check `from.id` on every incoming
 * update; non-matching users get a silent ignore so a public bot
 * link doesn't accidentally leak data to strangers.
 *
 * Telegram user IDs are stable numeric values you can get by
 * messaging @userinfobot or by reading the bot's logs after a
 * /start attempt.
 */

const allowed = new Set(
    String(process.env.ALLOWED_USER_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
);

export function isAllowed(ctx) {
    const id = ctx?.from?.id;
    if (id == null) return false;
    return allowed.has(String(id));
}

export function allowedCount() {
    return allowed.size;
}

/**
 * Drop-in middleware that short-circuits the update for any
 * non-whitelisted sender. Also logs the would-be sender's ID so
 * the operator can copy it into the env var if they want to grant
 * access.
 */
export function whitelistMiddleware(ctx, next) {
    if (isAllowed(ctx)) return next();
    const from = ctx?.from || {};
    console.warn(
        `[auth] denied update from id=${from.id} username=${from.username || '(none)'}`,
    );
    // Silent ignore — no reply, no engagement. A non-whitelisted user
    // shouldn't even learn the bot is alive.
    return Promise.resolve();
}
