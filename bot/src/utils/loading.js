/**
 * UX helpers — "the bot heard you and is working" feedback.
 *
 * Long-running handlers (image rendering, prerender fetches, deck-
 * index cold loads) can leave the user staring at a silent chat for
 * 5–30s. Telegram offers three indicator surfaces; we use whichever
 * fits the moment:
 *
 *   1. answerCbQuery(text)
 *      Pops a toast right where the user tapped an inline button.
 *      ~200 chars, ~5s on screen. Best for the very first "I got
 *      your tap" beat — fires in <100ms before any other work.
 *
 *   2. sendChatAction(action)
 *      Shows "Bot is typing…" / "Bot is sending a photo…" at the top
 *      of the chat. Telegram clears it after 5s, so we rebroadcast
 *      every 4s on a heartbeat until the handler resolves.
 *
 *   3. reply('🔄 …') + delete
 *      Strong visible signal. Only fires after a delay so sub-second
 *      ops don't flicker a banner; auto-deleted when work completes
 *      so the chat doesn't fill with stale loaders.
 *
 * The `withLoading()` wrapper composes (2) + (3); call it around any
 * await chain that takes more than a second or two.
 */

// Telegram clears a sendChatAction after ~5s, so refresh just before
// that. Faster wastes API calls; slower leaves visible gaps.
const HEARTBEAT_MS = 4000;

/**
 * Keep a chat-action indicator alive until the returned stop()
 * function is called. Fire-and-forget — failures are swallowed
 * because a missing typing indicator is never worth aborting a
 * handler over.
 *
 * Telegram action strings we use: 'typing', 'upload_photo',
 * 'upload_document'. Full list:
 * https://core.telegram.org/bots/api#sendchataction
 */
export function startChatActionHeartbeat(ctx, action = 'typing') {
    ctx.sendChatAction(action).catch(() => {});
    const handle = setInterval(() => {
        ctx.sendChatAction(action).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(handle);
}

/**
 * Run `work()` while keeping a loading indicator visible.
 *
 *   chatAction    — which typing indicator to broadcast on the
 *                   heartbeat. Default 'typing'.
 *   statusText    — when set, a visible "🔄 …" message is sent
 *                   after `bannerDelayMs` and deleted when work
 *                   completes. Skip the option for short ops where
 *                   the chat-action alone is enough.
 *   bannerDelayMs — gate so quick operations never flicker a banner.
 *                   Default 1500ms.
 *
 * Returns whatever `work()` returns (or re-throws on failure).
 */
export async function withLoading(ctx, opts, work) {
    const {
        chatAction = 'typing',
        statusText = null,
        bannerDelayMs = 1500,
    } = opts || {};

    const stopHeartbeat = startChatActionHeartbeat(ctx, chatAction);

    // workDone flips to true in the finally below. The banner callback
    // checks it before calling ctx.reply so a fast-completing work()
    // can't leave an orphan "🔄 …" message in the chat — the timer
    // might have fired between clearTimeout being unable to cancel
    // it (already in the macrotask queue) and our cleanup running.
    let banner = null;
    let bannerTimer = null;
    let workDone = false;
    if (statusText) {
        bannerTimer = setTimeout(async () => {
            if (workDone) return;
            try {
                const sent = await ctx.reply(statusText);
                // workDone may have flipped while ctx.reply was in
                // flight — in that case the cleanup below already
                // ran and missed this message because banner was
                // still null. Delete it here so the chat stays tidy.
                if (workDone) {
                    ctx.deleteMessage(sent.message_id).catch(() => {});
                } else {
                    banner = sent;
                }
            } catch (err) {
                // Banner failure is non-fatal — the heartbeat is still
                // doing its job. Log so we notice if it's a pattern.
                console.warn('[loading] banner send failed:', err?.message || err);
            }
        }, bannerDelayMs);
    }

    try {
        return await work();
    } finally {
        workDone = true;
        stopHeartbeat();
        if (bannerTimer) clearTimeout(bannerTimer);
        if (banner) {
            ctx.deleteMessage(banner.message_id).catch(() => {});
        }
    }
}
