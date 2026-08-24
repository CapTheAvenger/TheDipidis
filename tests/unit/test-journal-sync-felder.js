/**
 * Ein Journaleintrag muss die Synchronisierung überleben — vollständig.
 *
 * `syncBattleJournalEntry` baut ein Nutzlast-Objekt, das die Felder
 * EINZELN aufzählt. Wer in `buildBattleJournalEntry` ein Feld ergänzt und
 * diese Liste vergisst, verliert es beim Schreiben nach Firestore. Ohne
 * angemeldetes Konto fällt das nicht auf, weil die Outbox dann nie
 * geleert wird — der Eintrag liegt im localStorage und sieht vollständig
 * aus.
 *
 * Genau so ist es am 24.08.2026 passiert: der automatisch eingefrorene
 * `deckSnapshot` wurde beim Loggen geschrieben, überlebte die
 * Synchronisierung nicht und war nach dem nächsten Laden verschwunden.
 * Das Turnierbild hätte dann wieder ohne Kartengitter dagestanden — mit
 * einem Hinweis, die Liste zu verknüpfen, die längst verknüpft war.
 *
 * Dieser Test liest beide Feldlisten aus dem Quelltext und vergleicht
 * sie. Er prüft nicht, was die Felder bedeuten, sondern nur, dass keins
 * unterwegs verloren geht — das ist der Fehler, der wirklich auftritt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JOURNAL = fs.readFileSync(path.join(ROOT, 'js', 'battle-journal.js'), 'utf8');

/** Die Feldnamen aus einem Objektliteral — auch die aus einem Spread. */
function felderAus(block) {
    const direkt = [...block.matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
    const ausSpread = [...block.matchAll(/\{\s*(\w+):\s*[\w.]+\s*\}\s*:\s*\{\}/g)].map(m => m[1]);
    return new Set(direkt.concat(ausSpread));
}

function bauBlock() {
    const m = JOURNAL.match(/function buildBattleJournalEntry\(values\) \{[\s\S]*?\n        return \{([\s\S]*?)\n        \};/);
    assert.ok(m, 'buildBattleJournalEntry ist nicht mehr auffindbar');
    return m[1];
}

function syncBlock() {
    const m = JOURNAL.match(/async function syncBattleJournalEntry\(entry, user\) \{\s*const payload = \{([\s\S]*?)\n        \};/);
    assert.ok(m, 'syncBattleJournalEntry ist nicht mehr auffindbar');
    return m[1];
}

describe('Battle Journal: kein Feld geht bei der Synchronisierung verloren', () => {
    /* Diese drei sind absichtlich nicht in der Nutzlast:
     *   id      — steht im Dokumentpfad
     *   userId  — steht im Dokumentpfad (users/{uid}/…)
     *   games   — nur ein Zwischenwert des Formulars, gespeichert wird bo3Games
     * Wer hier etwas hinzufügt, muss begründen, warum es nicht mitmuss. */
    const ABSICHTLICH_LOKAL = new Set(['id', 'userId', 'games']);

    it('jedes gebaute Feld steht auch in der Nutzlast', () => {
        const gebaut = felderAus(bauBlock());
        const sync = felderAus(syncBlock());
        const fehlend = [...gebaut].filter(f => !sync.has(f) && !ABSICHTLICH_LOKAL.has(f));
        assert.deepEqual(fehlend, [],
            `diese Felder werden geschrieben, aber nicht synchronisiert: ${fehlend.join(', ')}`);
    });

    it('der Schnappschuss ist dabei', () => {
        // Der konkrete Fall, der den Test ausgelöst hat.
        assert.match(syncBlock(), /deckSnapshot: entry\.deckSnapshot/,
            'der eingefrorene Deckschnappschuss überlebt die Synchronisierung nicht');
    });

    it('die Platzierung ist dabei', () => {
        // Sie hängt am Turnier und wird per Sammelupdate geschrieben — ein
        // offline bearbeiteter Eintrag trägt sie aber schon vorher.
        assert.match(syncBlock(), /placement: entry\.placement/,
            'die Platzierung überlebt die Synchronisierung nicht');
    });

    it('leere Felder werden weggelassen statt auf null gesetzt', () => {
        // set({merge:true}) mit null LÖSCHT eine bestehende Angabe auf dem
        // Server. Ein Eintrag ohne Liste würde damit die Liste eines
        // früheren Schreibvorgangs überschreiben.
        const block = syncBlock();
        assert.match(block, /\.\.\.\(entry\.deckSnapshot \? \{ deckSnapshot: entry\.deckSnapshot \} : \{\}\)/);
        assert.match(block, /\.\.\.\(entry\.placement \? \{ placement: entry\.placement \} : \{\}\)/);
    });

    it('geschrieben wird mit merge, nicht ersetzend', () => {
        // Ohne merge würde ein Nachtrag alles überschreiben, was der
        // Turnierdialog per batch.update ergänzt hat.
        const m = JOURNAL.match(/async function syncBattleJournalEntry[\s\S]*?\n    \}/);
        assert.match(m[0], /\.set\(payload, \{ merge: true \}\)/);
    });
});
