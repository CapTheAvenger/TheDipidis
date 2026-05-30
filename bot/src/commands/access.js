/**
 * Self-service access flow.
 *
 * A non-whitelisted user sending /start kicks off:
 *   1. Friendly "warte auf Freigabe" reply to the requester
 *   2. DM to every admin (ADMIN_USER_IDS) with the requester's
 *      name / username / id and inline ✅ / ❌ buttons
 *   3. On ✅: id joins the runtime allow set, requester gets a
 *      "freigegeben" DM, admin sees the full whitelist string for
 *      pasting into Render's ALLOWED_USER_IDS env var (= the
 *      persistence step, since Render Free wipes memory on idle)
 *   4. On ❌: silent for the requester, just an ack to the admin
 *
 * /whitelist (admin-only) re-prints the current allow set for the
 * same paste-into-env workflow.
 */

import { Markup } from 'telegraf';

import {
    getAllAllowed,
    isAdmin,
    listAdmins,
    revokeAccess,
    tryGrantAccess,
} from '../auth.js';

// In-memory record of access requests that have already been
// finalised this dyno lifetime. Lets parallel admin taps converge
// on a single "already handled" message instead of double-spamming
// the requester. Cleared by a dyno restart, same as _runtimeAllowed
// itself — acceptable because the underlying grant is what matters.
const _handledRequests = new Set();

function _escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function _formatWhitelistString() {
    return [...getAllAllowed()].sort((a, b) => Number(a) - Number(b)).join(',');
}

export async function handleAccessRequest(ctx) {
    const from = ctx?.from;
    if (!from?.id) return;

    const admins = listAdmins();
    if (admins.length === 0) {
        // No admins configured: tell the user the bot isn't accepting
        // new users so they don't sit waiting on a request that goes
        // nowhere. Also log loudly so the operator sees the gap.
        console.warn('[access] request from id=' + from.id + ' ignored: no ADMIN_USER_IDS configured');
        await ctx.reply(
            '🔒 Dieser Bot ist aktuell nicht für neue User offen. ' +
            'Wenn du Zugriff brauchst, melde dich beim Betreiber.',
        );
        return;
    }

    await ctx.reply(
        '🔒 <b>Zugriff angefragt</b>\n' +
        'Deine Anfrage liegt jetzt bei den Admins. Sobald du freigegeben bist, bekommst du hier Bescheid.',
        { parse_mode: 'HTML' },
    );

    const username    = from.username    ? `@${from.username}` : '(kein Username)';
    const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || '(kein Name)';
    const reqId       = from.id;
    const notice =
        '🔔 <b>Zugriffsanfrage</b>\n' +
        `Name: <code>${_escapeHtml(displayName)}</code>\n` +
        `User: <code>${_escapeHtml(username)}</code>\n` +
        `ID:   <code>${reqId}</code>`;
    const buttons = Markup.inlineKeyboard([[
        Markup.button.callback('✅ Freigeben', `access:grant:${reqId}`),
        Markup.button.callback('❌ Ablehnen',  `access:deny:${reqId}`),
    ]]);

    for (const adminId of admins) {
        try {
            await ctx.telegram.sendMessage(adminId, notice, { parse_mode: 'HTML', ...buttons });
        } catch (err) {
            console.warn(`[access] failed to notify admin ${adminId}: ${err?.message || err}`);
        }
    }
}

export function registerAccess(bot) {
    bot.action(/^access:grant:(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx)) {
            await ctx.answerCbQuery('Nur Admins');
            return;
        }
        const userId = ctx.match[1];
        // tryGrantAccess returns false when the user was already on
        // the allow list — second admin tapped after the first one's
        // grant landed. Acknowledge the tap with a hint instead of
        // re-running the full grant flow (would re-DM the requester
        // and spam another whitelist string at every admin chat).
        const firstGrant = tryGrantAccess(userId);
        if (!firstGrant || _handledRequests.has(userId)) {
            await ctx.answerCbQuery('Schon freigegeben');
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
            return;
        }
        _handledRequests.add(userId);
        await ctx.answerCbQuery('Freigegeben');
        // Strip the buttons off the original request so other admins
        // (or repeat taps) don't double-handle it.
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

        const whitelist = _formatWhitelistString();
        await ctx.reply(
            `✅ User <code>${userId}</code> freigegeben.\n\n` +
            `Für Persistenz: setze in Render <code>ALLOWED_USER_IDS</code> auf:\n` +
            `<pre>${_escapeHtml(whitelist)}</pre>`,
            { parse_mode: 'HTML' },
        );

        try {
            await ctx.telegram.sendMessage(
                userId,
                '✅ Zugriff freigegeben — tippe /start oder /menu.',
            );
        } catch (err) {
            console.warn(`[access] failed to notify granted user ${userId}: ${err?.message || err}`);
        }
    });

    bot.action(/^access:deny:(\d+)$/, async (ctx) => {
        if (!isAdmin(ctx)) {
            await ctx.answerCbQuery('Nur Admins');
            return;
        }
        const userId = ctx.match[1];
        // Same first-handler-wins lock as the grant path so the second
        // admin sees "schon erledigt" instead of triggering a second
        // "abgelehnt" ack in admin chat.
        if (_handledRequests.has(userId)) {
            await ctx.answerCbQuery('Schon bearbeitet');
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
            return;
        }
        _handledRequests.add(userId);
        await ctx.answerCbQuery('Abgelehnt');
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
        await ctx.reply(`❌ User <code>${userId}</code> abgelehnt.`, { parse_mode: 'HTML' });
    });

    bot.command('whitelist', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const whitelist = _formatWhitelistString();
        const all = [...getAllAllowed()];
        await ctx.reply(
            `📋 Whitelist (${all.length} IDs):\n` +
            `<pre>${_escapeHtml(whitelist)}</pre>`,
            { parse_mode: 'HTML' },
        );
    });

    bot.command('revoke', async (ctx) => {
        if (!isAdmin(ctx)) return;
        const arg = (ctx.message?.text || '').split(/\s+/)[1];
        if (!arg || !/^\d+$/.test(arg)) {
            await ctx.reply('Nutzung: <code>/revoke 123456789</code>', { parse_mode: 'HTML' });
            return;
        }
        revokeAccess(arg);
        await ctx.reply(
            `🗑 Runtime-Grant für <code>${arg}</code> entfernt.\n` +
            `(Wenn der User in ALLOWED_USER_IDS steht, dort manuell rausnehmen.)`,
            { parse_mode: 'HTML' },
        );
    });
}
