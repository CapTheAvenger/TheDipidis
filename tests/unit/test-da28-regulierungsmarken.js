/**
 * DA-28 (30.09.2026): Promo-Legalitaet ueber die Regulierungsmarke.
 * js/archetyp-box.js wird AUSGEFUEHRT, mit der echten Datei
 * data/regulation_marks.json (Stand 30.09.2026, limitlesstcg.com).
 * Hausi: Basis-Energien immer legal, ausser Fairy; JP ist fuer das Feature
 * nicht relevant.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const ctx = { module: { exports: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/archetyp-box.js'), 'utf8'), ctx);
const L = ctx.module.exports;
const DATEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regulation_marks.json'), 'utf8'));

const fenster = new Set(['TEF', 'PBL', '30C', 'SVP', 'SVE', 'MEP']);
const jetzt = L.markenKontext(DATEN, 'TEF');   // TEF ist H -> H, I, J

describe('DA-28: Marken-Fenster', () => {
    it('das aelteste legale Set bestimmt die Marken: TEF -> H/I/J, SVI -> G/H/I/J', () => {
        const ok = (k) => JSON.parse(JSON.stringify([...k.legal]));
        assert.deepEqual(ok(jetzt).slice(0, 3), ['H', 'I', 'J']);
        assert.ok(!jetzt.legal.has('G'), 'G ist rotiert');
        assert.ok(L.markenKontext(DATEN, 'SVI').legal.has('G'));
        assert.equal(L.markenKontext(DATEN, 'GIBTESNICHT'), null);
        assert.equal(L.markenKontext(null, 'TEF'), null);
    });
});

describe('DA-28: Promo nach Marke', () => {
    it('Marke H/I/J = legal, Marke G = nicht legal (Iono SVP 124 ist G)', () => {
        assert.equal(L.druckLegal(['SVP-87'], fenster, false, jetzt), true);   // H
        assert.equal(L.druckLegal(['SVP-181'], fenster, false, jetzt), true);  // I
        assert.equal(L.druckLegal(['PAF-80', 'SVP-124'], fenster, false, jetzt), false); // G
        assert.equal(L.druckLegal(['SVP-56'], fenster, true, jetzt), false, 'auch mit Beleg: G bleibt G');
    });
    it('Nullen vorn und MEP zaehlen wie in den Daten', () => {
        assert.equal(L.druckLegal(['SVP-087'], fenster, false, jetzt), true);
        assert.equal(L.druckLegal(['MEP-5'], fenster, false, jetzt), true);   // MEP 1-29 ist I
    });
    it('ein Druck im echten Fenster-Set macht die Karte legal, auch neben einem G-Promo', () => {
        assert.equal(L.druckLegal(['PBL-12', 'SVP-124'], fenster, false, jetzt), true);
    });
    it('vor der Rotation (SVI-Fenster) ist G noch legal', () => {
        const vor = L.markenKontext(DATEN, 'SVI');
        assert.equal(L.druckLegal(['SVP-124'], fenster, false, vor), true);
    });
    it('ohne Marke in den Daten gilt die alte Regel weiter (kein Raten)', () => {
        assert.equal(L.druckLegal(['SVP-290'], fenster, false, jetzt), null);
        assert.equal(L.druckLegal(['SVP-290'], fenster, true, jetzt), true);
        assert.equal(L.druckLegal(['PAF-80', 'SVP-124'], fenster, false, null), false, 'ohne Markendatei: DA-18-Regel');
    });
    it('Namen werden nie verbunden: ein Name als Kennung wird nicht legal', () => {
        assert.equal(L.druckLegal(['Iono'], fenster, false, jetzt), false);
    });
});

describe('DA-28: Basis-Energien', () => {
    it('immer legal, ausser Fairy; andere Karten: null', () => {
        assert.equal(L.basisEnergieRegel({ type: 'Basic Energy', name_en: 'Grass Energy' }), true);
        assert.equal(L.basisEnergieRegel({ type: 'Basic Energy', name_en: 'Fairy Energy' }), false);
        assert.equal(L.basisEnergieRegel({ type: 'Special Energy', name_en: 'Double Turbo Energy' }), null);
        assert.equal(L.basisEnergieRegel(null), null);
    });
});
