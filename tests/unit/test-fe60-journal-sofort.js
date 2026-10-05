/**
 * FE-60 (T3-07, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: Nach „Match speichern“ blieb die Journal-Liste stehen — Server
 * battleJournal 18, Anzeige „17 Matches“ —, bis man den Unterreiter wechselte.
 *
 * ZUSICHERUNG: submitBattleJournalEntry wird AUSGEFUEHRT (mit Ersatz fuer
 * Formular und Speicher) und ruft danach openJournalHistoryTab auf.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

describe('FE-60: gespeicherter Match erscheint sofort', () => {
    for (const fall of ['online', 'offline']) {
        it('nach dem Speichern wird die Liste neu gezeichnet (' + fall + ')', async () => {
            const prot = [];
            const outbox = [];
            const ctx = L.baue('js/battle-journal.js', ['async function submitBattleJournalEntry(event)'], {
                navigator: { onLine: fall === 'online' }, window: { auth: { currentUser: { uid: 'u' } } },
                getBattleJournalFormValues: () => ({ ok: 1 }), localStorage: { removeItem() {} }, BATTLE_JOURNAL_DRAFT_KEY: 'k',
                resetBattleJournalForm: () => {}, playSaveFeedback: () => {},
                validateBattleJournalEntry: () => true, getBattleJournalOutbox: () => outbox,
                saveBattleJournalOutbox: () => prot.push('outbox'), showToast: () => {}, battleJournalText: (k, d) => d,
                flushBattleJournalOutbox: async () => prot.push('flush'), setBattleJournalStatus: () => {},
                renderBattleJournalSummary: () => prot.push('summary'), closeBattleJournalSheet: () => prot.push('close'),
                openJournalHistoryTab: async () => prot.push('liste'),
                copyTextToClipboard: () => {}, formatEntryForClipboard: () => '',
                buildBattleJournalEntry: () => ({ id: 'x' }), createBattleJournalEntry: () => ({ id: 'x' }),
            });
            try { await ctx.submitBattleJournalEntry({ preventDefault() {} }); }
            catch (e) { assert.fail('submitBattleJournalEntry warf: ' + e.message); }
            assert.ok(prot.includes('outbox'), 'Speichern lief nicht bis zur Ablage: ' + prot.join(','));
            assert.equal(prot[prot.length - 1], 'liste', 'die Liste wird nicht neu gezeichnet: ' + prot.join(','));
        });
    }
});
