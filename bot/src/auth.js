/**
 * Whitelist-based access control for the bot.
 *
 * Two env vars drive who can do what:
 *   • ALLOWED_USER_IDS — comma-separated Telegram numeric IDs that
 *     can use the bot.
 *   • ADMIN_USER_IDS   — comma-separated Telegram numeric IDs that
 *     can approve / deny access requests. Admins are implicitly
 *     allowed too (no need to list them in both).
 *
 * Runtime grants live in an in-memory Set populated when an admin
 * taps "Freigeben" on an access-request DM (see commands/access.js).
 * They survive for the dyno's lifetime — Render Free spins down
 * after 15 min idle and wipes memory, so admins get a copy-paste
 * string after every grant for permanent persistence via the
 * ALLOWED_USER_IDS env var.
 *
 * Telegram user IDs are stable numeric values you can get by
 * messaging @userinfobot or by reading the bot's logs after a
 * /start attempt — which now triggers the request flow automatically.
 */

function _parseIds(raw) {
    return new Set(
        String(raw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    );
}

const _envAllowed = _parseIds(process.env.ALLOWED_USER_IDS);
const _adminIds   = _parseIds(process.env.ADMIN_USER_IDS);
// Admins are implicitly allowed — saves the operator from having
// to repeat their ID in both env vars.
for (const id of _adminIds) _envAllowed.add(id);

const _runtimeAllowed = new Set();

export function isAllowed(ctx) {
    const id = ctx?.from?.id;
    if (id == null) return false;
    const s = String(id);
    return _envAllowed.has(s) || _runtimeAllowed.has(s);
}

export function isAdmin(ctx) {
    const id = ctx?.from?.id;
    if (id == null) return false;
    return _adminIds.has(String(id));
}

export function listAdmins() {
    return [..._adminIds];
}

export function grantAccess(userId) {
    _runtimeAllowed.add(String(userId));
}

/**
 * Atomic "grant if not already granted". Returns true when the call
 * actually added the id, false when it was already allowed (env or
 * runtime). Lets callers distinguish first-grant from a duplicate
 * tap without a separate has/add race.
 */
export function tryGrantAccess(userId) {
    const s = String(userId);
    if (_envAllowed.has(s) || _runtimeAllowed.has(s)) return false;
    _runtimeAllowed.add(s);
    return true;
}

export function revokeAccess(userId) {
    _runtimeAllowed.delete(String(userId));
}

export function getAllAllowed() {
    return new Set([..._envAllowed, ..._runtimeAllowed]);
}

export function allowedCount() {
    return getAllAllowed().size;
}
