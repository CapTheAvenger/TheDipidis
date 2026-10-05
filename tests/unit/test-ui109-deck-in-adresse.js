/**
 * UI-109 (UI-99-Rest, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND (Phase 0): #current-analysis?deck=Dragapult im offenen Tab (ohne
 * Neuladen) laedt kein Deck — Auswahl leer, 776 px; erst nach Neuladen
 * Dragapult. Ein Reiterwechsel ueber das Menue schrieb '#current-analysis'
 * ohne ?deck=.
 *
 * ZUSICHERUNG: pendingDeckEinloesen (app-current-meta-analysis.js) und
 * schreibeHash (inline-init.js) werden AUSGEFUEHRT.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

function auswahl(werte) {
    const opts = werte.map(v => ({ value: v }));
    return { options: opts, value: '' };
}

describe('UI-109: Deck folgt der Adresse', () => {
    it('Wunsch wird bei stehender Auswahl sofort eingeloest', () => {
        const geladen = [];
        const sel = auswahl(['', 'Dragapult', 'Mega Excadrill']);
        const window = { pendingCurrentMetaDeckSelection: 'dragapult' };
        const ctx = L.baue('js/app-current-meta-analysis.js', ['function pendingDeckEinloesen(doc)'], {
            window, document: { getElementById: (id) => (id === 'currentMetaDeckSelect' ? sel : null) },
            loadCurrentMetaDeckData: (a) => geladen.push(a), syncSearchableSelectDisplay() {},
        });
        assert.equal(ctx.pendingDeckEinloesen(), true);
        assert.equal(sel.value, 'Dragapult');
        assert.deepEqual(geladen, ['Dragapult']);
        assert.equal(window.pendingCurrentMetaDeckSelection, null);
    });
    it('bei leerer Auswahl bleibt der Wunsch fuer den ersten Aufbau liegen', () => {
        const window = { pendingCurrentMetaDeckSelection: 'Dragapult' };
        const ctx = L.baue('js/app-current-meta-analysis.js', ['function pendingDeckEinloesen(doc)'], {
            window, document: { getElementById: () => auswahl(['']) }, loadCurrentMetaDeckData() { throw new Error('zu frueh'); },
        });
        assert.equal(ctx.pendingDeckEinloesen(), false);
        assert.equal(window.pendingCurrentMetaDeckSelection, 'Dragapult');
    });
    it('Reiterwechsel schreibt das gewaehlte Deck in die Adresse', () => {
        const geschrieben = [];
        const window = { currentMetaArchetype: "N's Zoroark", location: { pathname: '/', search: '', hash: '#current-meta' },
            history: { pushState: (s, t, u) => geschrieben.push(u), replaceState: (s, t, u) => geschrieben.push(u) } };
        const ctx = L.baue('js/inline-init.js', ['function schreibeHash(tabId, ersetzen)'], {
            window, routetGerade: false, kanonischerHash: (t) => t,
        });
        ctx.schreibeHash('current-analysis');
        assert.deepEqual(geschrieben, ['/#current-analysis?deck=' + encodeURIComponent("N's Zoroark")]);
    });
    it('applyHash ruft die Einloesung nach dem Reiterwechsel', () => {
        const q = L.lies('js', 'inline-init.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
        const i = q.indexOf('window.__dsTieflinkGeroutet = true;');
        assert.match(q.slice(i, i + 900).split('\n').map(z => z.replace(/\/\/.*$/, '')).join('\n'), /window\.pendingDeckEinloesen\(\)/);
    });
});
