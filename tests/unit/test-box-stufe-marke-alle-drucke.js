/**
 * 01.10.2026 (Hausi, Screenshot Archetyp-Boxen): Gholdengo, Iron Valiant und
 * Roaring Moon standen gelb ("legal"), obwohl alle ihre Hauptkarten rotiert
 * sind. Ursache: Prismatic Evolutions (PRE) liegt im Standardfenster, die
 * Nachdrucke dort (Gholdengo ex PRE 164, Iron Valiant ex PRE 157, Roaring
 * Moon ex PRE 162) tragen aber Marke G — das SET machte sie legal. Jetzt
 * entscheidet die Marke je Druck. Dazu: "Dudunsparce Control" baut sich um
 * Pidgeot ex, nicht um Dudunsparce. js/archetyp-box.js wird AUSGEFUEHRT, mit
 * der echten Datei data/regulation_marks.json; die Marken eines Drucks aendern
 * sich nie (Belege, keine Wochenwerte).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(ROOT, 'js/archetyp-box.js'), 'utf8');
const DATEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regulation_marks.json'), 'utf8'));

function lade(quelle) {
    const ctx = { module: { exports: {} }, console };
    vm.runInNewContext(quelle, ctx);
    return ctx.module.exports;
}

const fenster = new Set(['TEF', 'TWM', 'SFA', 'SCR', 'SSP', 'PRE', 'JTG', 'DRI', 'BLK', 'WHT', 'PBL', '30C', 'SVP', 'SVE', 'MEP']);
const karte = (name, id, refs, anteil) => ({ name, typ: 'Pokemon', id, refs: refs || [], anteil: anteil == null ? 90 : anteil });
const box = (archetyp, karten) => ({ archetyp, karten });

function stufe(L, b) {
    const jetzt = L.markenKontext(DATEN, 'TEF');
    const ids = (k) => [k.id].concat(k.refs || []);
    const kontext = { aktuell: 'TEF-30C', legalBekannt: true, legal: (k) => L.druckLegal(ids(k), fenster, false, jetzt) };
    // imFormatGespielt: die Box hat im aktuellen Format keinen Anteil
    return L.boxStufe(b, kontext);
}

describe('Box-Stufe: die Marke gilt fuer jeden Druck', () => {
    const L = lade(QUELLE);
    const jetzt = L.markenKontext(DATEN, 'TEF');

    it('Gholdengo ex (PRE 164, PAR 139/231/252, alle Marke G) ist nicht legal', () => {
        assert.equal(L.druckLegal(['PRE-164', 'PAR-139', 'PAR-231', 'PAR-252'], fenster, false, jetzt), false);
    });
    it('Iron Valiant ex und Roaring Moon ex (je PRE + PAR + SVP, alle G) sind nicht legal', () => {
        assert.equal(L.druckLegal(['PRE-157', 'PAR-89', 'PAR-225', 'SVP-68'], fenster, false, jetzt), false);
        assert.equal(L.druckLegal(['PRE-162', 'PAR-124', 'PAR-229', 'SVP-67'], fenster, false, jetzt), false);
    });
    it('Boxen: Gholdengo, Iron Valiant, Roaring Moon Dudunsparce stehen auf "raus"', () => {
        assert.equal(stufe(L, box('__familie__|Gholdengo', [karte('Gholdengo ex', 'PRE-164', ['PAR-139'])])), 'raus');
        assert.equal(stufe(L, box('Iron Valiant Box', [karte('Iron Valiant ex', 'PRE-157', ['PAR-89'])])), 'raus');
        assert.equal(stufe(L, box('Roaring Moon Dudunsparce', [karte('Roaring Moon ex', 'PRE-162', ['PAR-124']), karte('Dudunsparce', 'TWM-128', [])])), 'raus');
    });
    it('ein echter Fenster-Druck ohne Marke macht weiter legal (kein Raten)', () => {
        assert.equal(L.druckLegal(['TEF-1'], fenster, false, L.markenKontext({ marks: { H: {} } }, 'TEF') || null), true);
    });
    it('Dudunsparce Control: die Hauptkarte ist Pidgeot ex (nicht legal), nicht Dudunsparce (legal)', () => {
        const b = box('Dudunsparce Control', [karte('Pidgeot ex', 'OBF-164', ['PAF-221'], 70), karte('Dudunsparce', 'TWM-128', [], 95)]);
        assert.equal(L.hauptkartenDerBox(b)[0].name, 'Pidgeot ex');
        assert.equal(stufe(L, b), 'raus');
        assert.equal(L.hauptkartenDerBox(box('Dudunsparce Control', [karte('Dudunsparce', 'TWM-128', [])]))[0].name, 'Dudunsparce', 'ohne Pidgeot in der Box bleibt die Namensregel');
    });
    it('VERFAELSCHUNG: nur-Promo-Marke bringt Gholdengo wieder auf "legal"', () => {
        const kaputt = QUELLE.replace('        if (!markenK) return null;', '        if (!markenK || !MARKEN_SETS[set]) return null;');
        assert.notEqual(kaputt, QUELLE, 'die Mutation hat nichts geaendert');
        assert.equal(stufe(lade(kaputt), box('__familie__|Gholdengo', [karte('Gholdengo ex', 'PRE-164', ['PAR-139'])])), 'legal');
    });
    it('VERFAELSCHUNG: ohne die Handliste gewinnt Dudunsparce', () => {
        const kaputt = QUELLE.replace("const HAUPTKARTE_PER_HAND = { 'Dudunsparce Control': 'Pidgeot' };", 'const HAUPTKARTE_PER_HAND = {};');
        assert.notEqual(kaputt, QUELLE);
        const b = box('Dudunsparce Control', [karte('Pidgeot ex', 'OBF-164', ['PAF-221'], 70), karte('Dudunsparce', 'TWM-128', [], 95)]);
        assert.equal(lade(kaputt).hauptkartenDerBox(b)[0].name, 'Dudunsparce');
    });
});
