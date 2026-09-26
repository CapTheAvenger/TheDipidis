/**
 * UI-8: die neun Befunde der 6-Perspektiven-Validierung vom 07.08.2026.
 *
 * Stand am 26.09.2026 nachgemessen, bevor gebaut wurde:
 *   (1) n=/duenne Stichprobe am WR-Abzeichen      schon da (stat-badge-nenner, tier-listen-duenn)
 *   (2) Datenraum-Ausweis                         schon da (DsNav .ds-space, data-space jp/gl/past)
 *   (3) JP-Signalfarbe                            schon da (--space-jp Bernstein, nicht Rot)
 *   (4) Oe-Kopien-Verteilung                      HIER — Spanne aus max_count, mehr fuehren die Daten nicht
 *   (5) Tooltips fuer Fachbegriffe                HIER — 8 Kopfzeilen ohne Erklaerung (gemessen)
 *   (6) Rohdaten-Link                             HIER — am Datenstands-Chip
 *   (7) CSV-Export                                HIER — js/ds-csv.js
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
    it('die acht gemessenen Kopfzeilen tragen ein title', () => {
        const mp = ohneKommentare(R('js/app-meta-prognose.js'));
        for (const k of ['tipOnline', 'tipErwartet', 'tipBewegung']) {
            assert.match(mp, new RegExp(`<th[^>]*title="\\$\\{esc\\(l\\.${k}\\)\\}"`), `mp-tabelle: ${k}`);
        }
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

describe('UI-8 (6): vom Datenstand zur Quelldatei', () => {
    const src = R('js/ds-datenstand.js');
    const code = src.slice(src.indexOf('var ROHDATEN_BASIS'), src.indexOf('/**\n     * Fuellt alle Chips.'));
    it('der Chip bekommt genau einen Verweis auf die eigene Datei', () => {
        const chip = fakeEl('span'); chip.className = 'data-freshness-chip';
        const wert = fakeEl('span'); wert.className = 'js-data-freshness'; chip.appendChild(wert);
        const ctx = { document: { createElement: fakeEl }, de: () => true };
        vm.runInNewContext(code + '\nrohdatenVerweis(w, "limitless_online_decks.csv"); rohdatenVerweis(w, "limitless_online_decks.csv");', Object.assign(ctx, { w: wert }));
        const links = chip.kinder.filter(k => k.className === 'data-rohdaten');
        assert.equal(links.length, 1, 'zweimal gezeichnet, zwei Verweise');
        assert.equal(links[0].href, 'https://github.com/CapTheAvenger/TheDipidis/blob/main/data/limitless_online_decks.csv');
        assert.equal(links[0].textContent, 'Rohdaten');
    });
    it('ein Dateiname mit Pfadzeichen bekommt keinen Verweis', () => {
        const chip = fakeEl('span'); chip.className = 'data-freshness-chip';
        const wert = fakeEl('span'); chip.appendChild(wert);
        const ctx = { document: { createElement: fakeEl }, de: () => true };
        vm.runInNewContext(code + '\nrohdatenVerweis(w, "../x.csv");', Object.assign(ctx, { w: wert }));
        assert.equal(chip.kinder.length, 1);
    });
});

describe('UI-8 (7): CSV-Export', () => {
    const ctx = {
        window: {}, document: { readyState: 'complete', querySelectorAll: () => [], body: {} },
        setTimeout, URL, Blob: function () {},
    };
    vm.runInNewContext(R('js/ds-csv.js'), ctx);
    const Z = (texte, tag = 'td') => ({ cells: texte.map(t => ({ innerText: t })), querySelector: (s) => (s === 'td' && tag === 'td') ? {} : null });
    it('schreibt, was in der Tabelle steht — Semikolon, Anfuehrungszeichen, deutsche Zahl', () => {
        const tabelle = { rows: [Z(['Deck', 'Anteil'], 'th'), Z(['Dragapult', '9,95 %']), Z(['Basic; Box', 'a "b"'])] };
        assert.equal(ctx.window.DsCsv.alsCsv(tabelle), 'Deck;Anteil\r\nDragapult;9,95 %\r\n"Basic; Box";"a ""b"""');
    });
    it('keine Knoepfe an Tutorial-Abbildungen und an Tabellen ohne Daten', () => {
        const mit = (drin) => ({ getAttribute: () => null, rows: [Z(['a']), Z(['b'])], closest: (s) => (s === '.tab-content' ? {} : (drin ? {} : null)) });
        assert.equal(ctx.window.DsCsv.geeignet(mit(false)), true);
        assert.equal(ctx.window.DsCsv.geeignet(mit(true)), false, 'Tutorial-Abbildung bekam einen CSV-Knopf');
        const leer = { getAttribute: () => null, rows: [Z(['a'], 'th')], closest: (s) => (s === '.tab-content' ? {} : null) };
        assert.equal(ctx.window.DsCsv.geeignet(leer), false);
    });
    it('ist eingebunden und steht in der Liste des Service Workers', () => {
        assert.match(R('index.html'), /<script src="js\/ds-csv\.js\?v=\d+" defer><\/script>/);
        assert.ok(R('service-worker.js').includes("'./js/ds-csv.js'"));
    });
});
