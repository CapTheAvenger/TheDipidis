/**
 * UI-8: die neun Befunde der 6-Perspektiven-Validierung vom 07.08.2026.
 *
 * Stand am 26.09.2026 nachgemessen, bevor gebaut wurde:
 *   (1) n=/duenne Stichprobe am WR-Abzeichen      schon da (stat-badge-nenner, tier-listen-duenn)
 *   (2) Datenraum-Ausweis                         schon da (DsNav .ds-space, data-space jp/gl/past)
 *   (3) JP-Signalfarbe                            schon da (--space-jp Bernstein, nicht Rot)
 *   (4) Oe-Kopien-Verteilung                      HIER — Spanne aus max_count, mehr fuehren die Daten nicht
 *   (5) Tooltips fuer Fachbegriffe                HIER — 8 Kopfzeilen ohne Erklaerung (gemessen)
 *   (6) Rohdaten-Link                             gebaut 26.09., auf Wunsch wieder entfernt 27.09. (UI-30/31)
 *   (7) CSV-Export                                gebaut 26.09., auf Wunsch wieder entfernt 28.09. (UI-41,
 *                                                 Zusicherung in test-ui41-kein-csv.js)
 *   (8) Past-Meta-Vorauswahl                      schon da (defaultFormat = neuestes Fenster)
 *   (9) Deep-Links                                schon da (#current-analysis?deck=…, js/inline-init.js)
 * Die Faelle „schon da" haben eigene Zusicherungen in ihren Dateien; hier
 * stehen die vier, die in diesem Rutsch entstanden sind.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

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

describe('UI-8 (4): die Spanne der Kopien', () => {
    const src = R('js/app-meta-cards.js');
    const code = schneide(src, 'function _kommaZahl(') + '\n' + schneide(src, 'function _anteilHinweis(');
    const hinweis = (card, sprache = 'de') => {
        const ctx = { getLang: () => sprache, window: {} };
        vm.runInNewContext(code + '\nergebnis = _anteilHinweis(karte);', Object.assign(ctx, { karte: card }));
        return ctx.ergebnis;
    };
    it('nennt 1 bis max_count, wenn die Karte gespielt wird', () => {
        assert.match(hinweis({ avgCount: 3.2, avgCountWhenUsed: 3.4, max_count: 4 }), /1 bis 4 Kopien/);
        assert.match(hinweis({ avgCount: 3.2, avgCountWhenUsed: 3.4, max_count: 4 }, 'en'), /1 to 4 copies/);
    });
    it('eine Karte, die nie mehr als einmal liegt, heisst "genau 1"', () => {
        assert.match(hinweis({ avgCount: 0.4, avgCountWhenUsed: 1, max_count: 1 }), /genau 1 Kopie/);
    });
    it('ohne max_count wird keine Spanne erfunden', () => {
        assert.doesNotMatch(hinweis({ avgCount: 3.2, avgCountWhenUsed: 3.4 }), /bis \d+ Kopien/);
    });
});

describe('UI-8 (5): Kopfzeilen mit Erklaerung', () => {
    it('die gemessenen Kopfzeilen tragen ein title (Meta-Prognose-Tabelle entfiel mit FE-17)', () => {
        const cl = ohneKommentare(R('js/app-city-league.js'));
        for (const k of ['cl.tipCount', 'cl.tipAvgPlacement', 'cl.tipVariants']) {
            assert.ok(cl.includes(`title="\${escapeHtml(t('${k}'))}"`), `City League: ${k}`);
        }
        const mc = ohneKommentare(R('js/app-meta-call.js'));
        for (const k of ['mc.tipRecZiel', 'mc.tipRecExpWins', 'mc.tipPlayers']) {
            assert.ok(mc.includes(`title="\${esc(t('${k}'))}"`), `Meta Call: ${k}`);
        }
    });
    it('jede Erklaerung gibt es in beiden Sprachen', () => {
        const i18n = R('js/i18n.js');
        for (const k of ['cl.tipCount', 'cl.tipAvgPlacement', 'cl.tipVariants', 'mc.tipRecZiel', 'mc.tipRecExpWins', 'mc.tipPlayers']) {
            assert.equal((i18n.match(new RegExp(`'${k.replace('.', '\\.')}'\\s*:`, 'g')) || []).length, 2, k);
        }
    });
});

function fakeEl(tag) {
    const el = {
        tagName: tag, kinder: [], attrs: {}, className: '',
        appendChild(k) { this.kinder.push(k); k.parent = this; return k; },
        querySelector(sel) { return this.kinder.find(k => sel === '.' + k.className) || null; },
        closest(sel) { let e = this; while (e) { if (sel === '.' + e.className) return e; e = e.parent; } return null; },
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    };
    return el;
}

/* UI-30/UI-31 (27.09.2026): der Rohdaten-Verweis aus UI-8 (6) ist auf
 * Hausis Wunsch wieder weg. Die Probe fuehrt das Modul aus und zeichnet
 * einen echten Chip — sie liest keinen Quelltext. */
describe('UI-30/UI-31: der Datenstands-Chip zeigt keinen Rohdaten-Verweis', () => {
    function lauf() {
        const chip = fakeEl('span'); chip.className = 'data-freshness-chip';
        chip.classList = { add() {}, remove() {}, toggle() {} };
        const wert = fakeEl('span'); wert.className = 'js-data-freshness';
        wert.setAttribute('data-quelle', 'limitless_online_decks.csv');
        chip.appendChild(wert);
        const erzeugt = [];
        const ctx = {
            window: { getLang: () => 'de' },
            document: {
                readyState: 'complete',
                createElement: (t) => { const e = fakeEl(t); erzeugt.push(e); return e; },
                querySelectorAll: () => [wert],
                addEventListener() {},
            },
            fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({
                dateien: { 'limitless_online_decks.csv': '2026-09-27T02:00:00Z' }, inhalt_bis: {}, leer: [] }) }),
            Date, Promise, Math, isNaN,
        };
        ctx.window.document = ctx.document;
        vm.runInNewContext(R('js/ds-datenstand.js'), ctx);
        return new Promise(r => setTimeout(r, 20)).then(() => ({ chip, wert, erzeugt, ctx }));
    }
    it('der Chip wird gezeichnet, aber ohne Verweis', async () => {
        const { chip, wert, erzeugt } = await lauf();
        assert.match(String(wert.textContent), /2026/, 'der Chip wurde gar nicht gezeichnet — die Probe waere blind');
        assert.equal(erzeugt.filter(e => e.tagName === 'a').length, 0, 'es wurde ein Verweis erzeugt');
        assert.equal(chip.kinder.length, 1, 'am Chip haengt mehr als der Datumswert');
    });
    it('das Modul bietet keinen Verweis-Helfer mehr an', async () => {
        const { ctx } = await lauf();
        assert.ok(ctx.window.DsDatenstand, 'Modul nicht geladen');
        assert.equal(ctx.window.DsDatenstand.rohdatenVerweis, undefined);
    });
});
