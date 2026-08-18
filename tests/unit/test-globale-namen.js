/**
 * Ein globaler Name, eine Funktion.
 *
 * Gefunden am 2026-08-18: 633 Funktionen liegen in js/ auf oberster
 * Ebene, also alle im selben globalen Namensraum. Drei Namen waren
 * doppelt vergeben — und weil ein Skript, das spaeter laedt, das
 * frueher geladene still ueberschreibt, war jedes Mal genau eine der
 * beiden Fassungen unerreichbar. Zweimal war es die, fuer die der
 * aufrufende Code geschrieben war:
 *
 *   getEmptyStateHtml   app-utils.js (Optionen)  <- verloren
 *                       app-city-league.js (ohne Argumente)
 *     Folge: die leere Wunschliste und die leere Tauschliste sagten
 *     "Fuer diese Filterkombination liegen aktuell keine Turnierdaten
 *     vor." Sie riefen window.getEmptyStateHtml({title, body, cta})
 *     auf und bekamen eine Funktion, die alles davon ignoriert.
 *
 *   escapeHtml          app-utils.js (3 Zeichen, null -> '')  <- verloren
 *                       app-current-meta-analysis.js (5 Zeichen, null -> "null")
 *
 *   filterPastMetaCards app-meta-cards.js  <- verloren, dazu tot
 *                       app-past-meta.js
 *
 * Ein Linter faellt darauf nicht herein, weil jede Datei fuer sich
 * gueltig ist. Nur der Blick ueber alle Dateien zeigt es.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

// Sammelt jede Funktionsdeklaration auf Klammertiefe 0 — genau die,
// die im globalen Namensraum landen. Die Tiefe wird grob ueber
// geschweifte Klammern gezaehlt; das reicht, weil eine Fehlzaehlung
// hoechstens zu einem uebersehenen Namen fuehrt, nie zu einem
// erfundenen.
function topLevelFunctions() {
    const found = new Map();
    for (const f of fs.readdirSync(JS_DIR).filter(n => n.endsWith('.js'))) {
        const src = stripComments(fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
        let depth = 0;
        src.split('\n').forEach((line, i) => {
            const m = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
            if (m && depth === 0) {
                if (!found.has(m[1])) found.set(m[1], []);
                found.get(m[1]).push(`${f}:${i + 1}`);
            }
            depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            if (depth < 0) depth = 0;
        });
    }
    return found;
}

describe('globale Namen — keiner ist doppelt vergeben', () => {
    const fns = topLevelFunctions();

    it('js/ hat ueberhaupt globale Funktionen zu pruefen', () => {
        // Wenn die Zaehlung kaputtgeht, soll dieser Test es sagen und
        // nicht der naechste stillschweigend gruen bleiben.
        assert.ok(fns.size > 400, `nur ${fns.size} gefunden — Zaehlung defekt?`);
    });

    it('kein Funktionsname wird in zwei Dateien auf oberster Ebene vergeben', () => {
        const dups = [...fns.entries()]
            .filter(([, where]) => where.length > 1)
            .map(([name, where]) => `${name}: ${where.join(', ')}`);
        assert.deepStrictEqual(
            dups, [],
            'doppelt vergeben — die spaeter geladene Datei gewinnt still:\n' + dups.join('\n')
        );
    });
});

describe('globale Namen — die drei Faelle von 2026-08-18 bleiben geloest', () => {
    const read = f => fs.readFileSync(path.join(JS_DIR, f), 'utf8');

    it('getEmptyStateHtml gibt es nur in app-utils.js', () => {
        const fns = topLevelFunctions();
        assert.deepStrictEqual(fns.get('getEmptyStateHtml'), ['app-utils.js:' + (
            stripComments(read('app-utils.js')).split('\n')
                .findIndex(l => /^\s*function\s+getEmptyStateHtml\s*\(/.test(l)) + 1
        )]);
    });

    it('kein Aufruf von getEmptyStateHtml ohne Argumente', () => {
        // Ohne Argumente liefert die Fassung aus app-utils.js eine
        // leere Box. Wer sie ruft, muss sagen, was drinstehen soll.
        const bad = [];
        for (const f of fs.readdirSync(JS_DIR).filter(n => n.endsWith('.js'))) {
            const src = stripComments(read(f));
            src.split('\n').forEach((line, i) => {
                if (/\bgetEmptyStateHtml\s*\(\s*\)/.test(line)) bad.push(`${f}:${i + 1}`);
            });
        }
        assert.deepStrictEqual(bad, []);
    });

    it('escapeHtml maskiert fuenf Zeichen und macht aus null keinen Text', () => {
        const src = stripComments(read('app-utils.js'));
        const m = /function escapeHtml\(s\) \{([\s\S]*?)\n\}/.exec(src);
        assert.ok(m, 'escapeHtml nicht gefunden');
        const body = m[1];
        for (const ch of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) {
            assert.ok(body.includes(ch), `escapeHtml maskiert ${ch} nicht`);
        }
        assert.ok(/\?\?\s*''/.test(body), 'escapeHtml faengt null/undefined nicht ab');

        // Und einmal wirklich ausfuehren, statt es nur zu lesen.
        // eslint-disable-next-line no-new-func
        const fn = new Function(m[0] + '\nreturn escapeHtml;')();
        assert.strictEqual(fn(null), '');
        assert.strictEqual(fn(undefined), '');
        assert.strictEqual(fn(`<a href="x">O'Brien & co</a>`),
            '&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; co&lt;/a&gt;');
    });

    it('filterPastMetaCards gibt es nur in app-past-meta.js', () => {
        const fns = topLevelFunctions();
        const where = fns.get('filterPastMetaCards') || [];
        assert.strictEqual(where.length, 1);
        assert.ok(where[0].startsWith('app-past-meta.js:'), where[0]);
    });

    it('die vier neuen Leerzustands-Texte gibt es in beiden Sprachen', () => {
        const i18n = read('i18n.js');
        for (const k of ['cm.noCardsInDeck', 'cm.noCardsInDeckDesc',
                         'mc.noCardsForFilter', 'mc.noCardsForFilterDesc']) {
            const n = (i18n.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${k} steht ${n}x in i18n.js, erwartet 2 (de + en)`);
        }
    });
});
