/**
 * Durable whitelist storage (Firestore).
 *
 * Runtime access grants ("✅ Freigeben") used to live only in memory, so every
 * Render restart — a deploy, or the Free dyno spinning down after 15 min idle —
 * wiped them and admins had to re-approve everyone. This module persists grants
 * to Firestore so they survive restarts automatically.
 *
 * Auth: set FIREBASE_SERVICE_ACCOUNT on Render to the JSON of a Firebase service
 * account key (Project Settings → Service accounts → Generate new private key).
 * Paste the whole JSON as one value. Without it, persistence is simply disabled
 * and the bot behaves exactly as before (in-memory only) — never crashes.
 *
 * Data model: one document `bot/whitelist` with a `granted` string array, updated
 * atomically via arrayUnion / arrayRemove.
 */

import admin from 'firebase-admin';

let _db = null;
let _initTried = false;

function db() {
    if (_initTried) return _db;
    _initTried = true;

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw || !raw.trim()) {
        console.info('[store] FIREBASE_SERVICE_ACCOUNT not set — whitelist persistence disabled (in-memory only).');
        return null;
    }
    try {
        const creds = JSON.parse(raw);
        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(creds) });
        }
        _db = admin.firestore();
        console.info('[store] Firestore whitelist persistence enabled.');
    } catch (err) {
        console.warn('[store] failed to init Firestore (persistence off):', err?.message || err);
        _db = null;
    }
    return _db;
}

function doc() {
    const d = db();
    return d ? d.collection('bot').doc('whitelist') : null;
}

export function persistenceEnabled() {
    return !!db();
}

// Read the persisted granted IDs. Returns [] when persistence is off or on error
// so the caller degrades to whatever env vars provide.
export async function loadPersistedGrants() {
    const ref = doc();
    if (!ref) return [];
    try {
        const snap = await ref.get();
        const granted = snap.exists ? (snap.data().granted || []) : [];
        return granted.map(String);
    } catch (err) {
        console.warn('[store] load failed:', err?.message || err);
        return [];
    }
}

export async function persistGrant(userId) {
    const ref = doc();
    if (!ref) return;
    try {
        await ref.set({ granted: admin.firestore.FieldValue.arrayUnion(String(userId)) }, { merge: true });
    } catch (err) {
        console.warn('[store] persistGrant failed:', err?.message || err);
    }
}

export async function persistRevoke(userId) {
    const ref = doc();
    if (!ref) return;
    try {
        await ref.set({ granted: admin.firestore.FieldValue.arrayRemove(String(userId)) }, { merge: true });
    } catch (err) {
        console.warn('[store] persistRevoke failed:', err?.message || err);
    }
}
