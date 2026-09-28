/**
 * UI-43 (28.09.2026, Hausi, Video-Review 19:12–19:36): die Überschrift der
 * Deck-Analyse (Global) soll das Format nennen statt „aktuelles Meta“, und
 * der Zusatz darunter („Daten: 27.9.2026 (älteste von 3 Quellen)“) kann weg —
 * der Stand steht auf „Aktuelles Meta“.
 *
 * Gemessen vor dem Umbau (live, Stand 202609280908): Überschrift
 * „Deck-Analyse: aktuelles Meta“, darunter der Chip „Daten: 27.9.2026
 * (älteste von 3 Quellen)“.
 *
 * Die Formatmarke wird AUSGEFÜHRT (formatMarke/formatFor aus js/ds-nav.js
 * in einem vm-Kontext), nicht im Quelltext gesucht.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKommentare = (s) => s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

function schneide(quelle, kopf) {
    const start = quelle.indexOf(kopf);
    assert.ok(start >= 0, `${kopf} nicht gefunden`);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', start); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(start, i + 1);
    }
    throw new Error('Klammern gehen nicht auf');
}

const INDEX = R('index.html');
const kopfDerAnalyse = () => {
    const a = INDEX.indexOf('<div id="current-analysis"');
    assert.ok(a >= 0, 'Reiter #current-analysis fehlt');
    const h2 = INDEX.indexOf('<h2>', a);
    return INDEX.slice(h2, INDEX.indexOf('</h2>', h2));
};

describe('UI-43 — Deck-Analyse nennt das Format', () => {
    it('die Überschrift trägt den Platz für die Formatmarke', () => {
        assert.match(ohneKommentare(kopfDerAnalyse()), /id="cmAnalysisFormatLabel"/);
    });

    it('formatMarke schreibt das Format in beide Überschriften', () => {
        const NAV = R('js/ds-nav.js');
        const code = schneide(NAV, 'function fw()') + '\n'
            + schneide(NAV, 'function fmtDate(') + '\n'
            + schneide(NAV, 'function formatFor(') + '\n'
            + schneide(NAV, 'function formatMarke(');
        const els = { cmFormatLabel: { textContent: '' }, cmAnalysisFormatLabel: { textContent: '' } };
        const ctx = {
            window: { _formatWindow: { current_set: '30C', oldest_legal_set: 'TEF' } },
            document: { getElementById: (id) => els[id] || null },
        };
        vm.runInNewContext(code + '\nformatMarke();', ctx);
        assert.equal(els.cmAnalysisFormatLabel.textContent, ' \u00b7 TEF\u201330C');
        assert.equal(els.cmFormatLabel.textContent, ' \u00b7 TEF\u201330C');
    });

    it('der Titel sagt nicht mehr „aktuelles Meta“ — in keiner Sprache', () => {
        const I18N = R('js/i18n.js');
        const werte = [...I18N.matchAll(/'cm\.analysisHeading':\s*'([^']*)'/g)].map(m => m[1]);
        assert.equal(werte.length, 2, 'Schlüssel fehlt in einer Sprache');
        for (const w of werte) {
            assert.doesNotMatch(w, /aktuelles Meta|Current Meta/i, `Titel „${w}“`);
        }
    });

    it('kein Frische-Chip mehr in dieser Überschrift', () => {
        assert.doesNotMatch(kopfDerAnalyse(), /data-freshness-chip/);
        const CM = ohneKommentare(R('js/app-current-meta-analysis.js'));
        assert.doesNotMatch(CM, /#current-analysis \.header h2/,
            'ein Skript hängt wieder etwas in die Überschrift der Deck-Analyse');
    });
});
