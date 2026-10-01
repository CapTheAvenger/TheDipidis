'use strict';
/*
 * UI-54 (01.10.2026): In "Alle Drucke + Meta" entscheidet die Regulierungs-
 * marke je Druck, nicht die Pauschale fuer SVP/SVE. _regPromoPasst wird aus
 * js/app-cards-db.js geschnitten und AUSGEFUEHRT, gegen die echten Marken-
 * Daten (data/regulation_marks.json) und die echte Rechnung aus
 * js/archetyp-box.js (markenKontext, druckMarke).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DB = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');
const ABX = fs.readFileSync(path.join(ROOT, 'js', 'archetyp-box.js'), 'utf8');
const DATEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regulation_marks.json'), 'utf8'));

function schneide(quelle, kopf, ende) {
    const i = quelle.indexOf(kopf);
    assert.ok(i >= 0, kopf + ' fehlt');
    return quelle.slice(i, quelle.indexOf(ende, i) + ende.length);
}

function bauen(dbQuelle) {
    const promo = schneide(dbQuelle, 'const _REG_PROMO_SETS', '\n');
    const fn = schneide(dbQuelle, 'function _regPromoPasst(', '\n        }\n');
    // eslint-disable-next-line no-new-func
    return new Function(promo + fn + '\nreturn _regPromoPasst;')();
}

function marken() {
    const code = schneide(ABX, 'const MARKEN_REIHE', '\n')
        + schneide(ABX, 'const MARKEN_SETS', '\n')
        + schneide(ABX, 'function markenIndex(', '\n    }\n')
        + schneide(ABX, 'function markeDesSets(', '\n    }\n')
        + schneide(ABX, 'function markenKontext(', '\n    }\n')
        + schneide(ABX, 'function druckMarke(', '\n    }\n');
    // eslint-disable-next-line no-new-func
    return new Function(code + '\nreturn { kontext: markenKontext, druckMarke: druckMarke };')();
}

describe('UI-54 Promo-Drucke nach Marke', () => {
    const lib = marken();
    const passt = bauen(DB);
    const ktx = [lib.kontext(DATEN, 'TEF')];   // Standard seit TEF: Marken H, I, J
    const karte = (set, number) => ({ set, number });

    it('Kontext ist da (TEF -> H, I, J)', () => {
        assert.ok(ktx[0], 'kein Kontext fuer TEF');
        assert.deepStrictEqual(Array.from(ktx[0].legal).sort(), ['H', 'I', 'J', 'K', 'L'].filter((m) => ktx[0].legal.has(m)));
        assert.ok(ktx[0].legal.has('H') && !ktx[0].legal.has('G'));
    });

    it('Iono SVP 124 (Marke G) faellt heraus, SVP 87 (H) und SVP 181 (I) bleiben', () => {
        assert.strictEqual(passt(karte('SVP', '124'), ktx, lib.druckMarke), false);
        assert.strictEqual(passt(karte('SVP', '87'), ktx, lib.druckMarke), true);
        assert.strictEqual(passt(karte('SVP', '181'), ktx, lib.druckMarke), true);
    });

    it('Karten aus normalen Sets sind unberuehrt', () => {
        assert.strictEqual(passt(karte('TEF', '1'), ktx, lib.druckMarke), true);
        assert.strictEqual(passt(karte('OBF', '125'), ktx, lib.druckMarke), true);   // Set-Filter entscheidet dort
    });

    it('ein Druck ohne bekannte Marke bleibt bei der alten Regel', () => {
        assert.strictEqual(passt(karte('SVP', '99999'), ktx, lib.druckMarke), true);
    });

    it('ohne Kontexte (Daten nicht geladen) bleibt alles wie bisher', () => {
        assert.strictEqual(passt(karte('SVP', '124'), null, lib.druckMarke), true);
        assert.strictEqual(passt(karte('SVP', '124'), [], lib.druckMarke), true);
    });

    it('mehrere Formate: legal, sobald eines die Marke traegt', () => {
        const alt = lib.kontext(DATEN, 'SVI');   // aelteres Fenster: G, H, I, J
        assert.strictEqual(passt(karte('SVP', '124'), ktx.concat([alt]), lib.druckMarke), alt.legal.has('G'));
    });

    it('VERFAELSCHUNG: ohne die Marken-Pruefung bleibt Iono SVP 124 drin', () => {
        const kaputt = DB.replace('if (!m) return true;                 // keine Marke bekannt: alte Regel\n                markiert = true;\n                if (k.legal.has(m)) return true;',
            'return true;');
        assert.notStrictEqual(kaputt, DB, 'die Mutation hat nichts geaendert');
        assert.strictEqual(bauen(kaputt)(karte('SVP', '124'), ktx, lib.druckMarke), true);
    });

    it('der Filter ruft die Pruefung auf', () => {
        assert.ok(/metaLegalSets && metaMarkenKontexte && !_regPromoPasst\(card, metaMarkenKontexte, metaMarkenDruck\)/.test(DB));
    });
});
