'use strict';
/*
 * UI-117 (Abfragerunde 06.10.2026, „Filter erst nach der Wahl"): vor der
 * Deckwahl zeigt die Deck-Analyse nur die Archetyp-Wahl. Die Funktion
 * loadCurrentMetaDeckData setzt das Merkmal — der Abschnitt wird
 * ausgeschnitten und AUSGEFUEHRT; Markup und CSS werden gelesen.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { lies } = require('./lib-dom-sandkasten.js');

const ohne = (q) => q.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const HTML = ohne(lies('index.html'));
const CSS = ohne(lies('css', 'meta-card-analysis.css'));
const JS = lies('js', 'app-current-meta-analysis.js');

function merkmalNachLaden(src, archetyp) {
    const a = src.indexOf("const _tab = document.getElementById('current-analysis');");
    const b = src.indexOf('}\n', src.indexOf("else _tab.removeAttribute('data-cm-gewaehlt');", a)) + 2;
    const attr = {};
    const tab = { setAttribute: (k) => { attr[k] = true; }, removeAttribute: (k) => { delete attr[k]; } };
    new Function('document', 'archetype', src.slice(a, b))({ getElementById: () => tab }, archetyp);
    return !!attr['data-cm-gewaehlt'];
}

describe('UI-117: Filter erst nach der Deckwahl', () => {
    it('die Filterleiste traegt cm-nach-wahl — und mit ihr alle fuenf Bedienbloecke', () => {
        /* UI-141 (15.10.2026): Ansicht, Turniere, Fusion, Share und Datum
           stehen in EINEM Kasten (.cm-filterleiste); der traegt die Klasse,
           nicht mehr jeder Block einzeln. Alle fuenf muessen darin liegen. */
        const a = HTML.indexOf('<div id="current-analysis"'), b = HTML.indexOf('id="currentAnalysisEmptyState"', a);
        const kopf = HTML.slice(a, b);
        assert.equal((kopf.match(/cm-nach-wahl/g) || []).length, 1);
        const l = kopf.indexOf('class="cm-filterleiste cm-nach-wahl"');
        assert.ok(l > 0, 'Filterleiste fehlt');
        const leiste = kopf.slice(l);
        for (const id of ['cmViewModeVanillaBtn', 'currentMetaFilterAll', 'currentMetaDeckSelectSecondary', 'currentMetaFilterSelect', 'currentMetaDateFrom']) {
            assert.ok(leiste.indexOf(`id="${id}"`) > 0, id + ' liegt nicht in der Filterleiste');
        }
        // und die Deckwahl liegt davor, ausserhalb
        assert.ok(kopf.indexOf('id="currentMetaDeckSelect"') < l);
    });
    it('CSS blendet sie ohne Wahl aus', () => {
        assert.match(CSS, /#current-analysis:not\(\[data-cm-gewaehlt\]\) \.cm-nach-wahl \{ display: none; \}/);
    });
    it('Laden mit Deck setzt das Merkmal, ohne Deck nicht', () => {
        assert.equal(merkmalNachLaden(JS, 'Dragapult'), true);
        assert.equal(merkmalNachLaden(JS, ''), false);
    });
    it('VERFAELSCHUNG: ohne setAttribute blieben die Filter nach der Wahl versteckt', () => {
        const kaputt = JS.replace("if (archetype) _tab.setAttribute('data-cm-gewaehlt', '');", 'if (archetype) {}');
        assert.notEqual(kaputt, JS);
        assert.equal(merkmalNachLaden(kaputt, 'Dragapult'), false);
    });
});

describe('UI-117: PTCGL-Import neben Max Consistency', () => {
    function pruefe(html) {
        for (const q of ['cityLeague', 'currentMeta', 'pastMeta']) {
            const cta = html.indexOf("autoCompleteConsistency('" + q + "', 'min')\" title=");
            const imp = html.indexOf("importFromPTCGL('" + q + "')");
            assert.ok(cta > 0 && imp > cta, q + ': Import fehlt hinter dem Hauptknopf');
            const zwischen = html.slice(cta, imp);
            assert.equal((zwischen.match(/<button/g) || []).length, 1, q + ': Import steht nicht direkt daneben');
            assert.equal(html.split("importFromPTCGL('" + q + "')").length - 1, 1, q + ': genau EIN Import-Knopf');
        }
    }
    it('je Quelle direkt hinter „Max Consistency“, nur einmal', () => pruefe(HTML));
    it('VERFAELSCHUNG: ein zweiter Import-Knopf faellt auf', () => {
        assert.throws(() => pruefe(HTML + "<button onclick=\"importFromPTCGL('pastMeta')\">"));
    });
});
