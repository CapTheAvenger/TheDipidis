/**
 * N4 — Reiterwechsel schrieb die Adresse nicht fort.
 *
 * GEMESSEN AM 07.09.2026, im Browser (Chromium, playwright, lokal
 * ausgeliefertes index.html):
 *
 *   von #hub aus auf die Kachel "City League Meta" geklickt
 *     -> Reiter city-league, Adresse weiterhin #hub          FALSCH
 *   auf #current-meta auf die Held-Kachel "Dragapult" geklickt
 *     (QA-C FEHLER-8)
 *     -> Reiter current-analysis, Adresse weiterhin #current-meta  FALSCH
 *
 * Folge in beiden Faellen: der Zustand ist nicht verlinkbar, nicht als
 * Lesezeichen speicherbar, und der Zurueck-Knopf des Browsers fuehrt
 * woandershin — er kennt den Wechsel gar nicht.
 *
 * URSACHE, EINMAL: window.switchTab() schaltet nur um. Die Adresse
 * schreibt switchTabAndUpdateMenu() (js/inline-init.js) ueber
 * kanonischerHash(). jumpToCardAnalysis() geht diesen Weg seit dem
 * 30.08.2026; die sechs Hub-Kacheln und die beiden Held-Kachel-Wege
 * waren die letzten, die ihn nicht gingen.
 *
 * Geprueft wird der WEG, nicht das Ergebnis einer Messung: dass beide
 * Stellen den vorhandenen Weg nehmen und einen Rueckfall haben, wenn
 * es ihn nicht gibt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const HUB  = fs.readFileSync(path.join(ROOT, 'js', 'meta-analysis-hub.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');

function funktion(src, name) {
    const start = src.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name + '() gibt es nicht mehr');
    let tiefe = 0;
    for (let j = src.indexOf('{', start); j < src.length; j++) {
        if (src[j] === '{') tiefe++;
        else if (src[j] === '}') { tiefe--; if (tiefe === 0) return src.slice(start, j + 1); }
    }
    assert.fail(name + '(): Klammern gehen nicht auf');
}

function ohneKommentare(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Ein Wechsler in der Sandbox laufen lassen: einmal mit
// switchTabAndUpdateMenu, einmal ohne.
function pruefeWechsler(quelle, name) {
    const mit = [];
    const s1 = { console };
    s1.window = {
        switchTabAndUpdateMenu: (t) => mit.push(['menu', t]),
        switchTab: (t) => mit.push(['nur-tab', t]),
    };
    s1.switchTabAndUpdateMenu = s1.window.switchTabAndUpdateMenu;
    s1.switchTab = s1.window.switchTab;
    vm.createContext(s1);
    vm.runInContext(funktion(quelle, name), s1, { filename: name + '.js' });
    s1[name]('current-analysis');
    assert.deepStrictEqual(mit, [['menu', 'current-analysis']],
        name + '() nimmt nicht den Weg, der die Adresse mitschreibt');

    const ohne = [];
    const s2 = { console };
    s2.window = { switchTab: (t) => ohne.push(['nur-tab', t]) };
    s2.switchTab = s2.window.switchTab;
    vm.createContext(s2);
    vm.runInContext(funktion(quelle, name), s2, { filename: name + '.js' });
    s2[name]('current-analysis');
    assert.deepStrictEqual(ohne, [['nur-tab', 'current-analysis']],
        name + '() hat keine Rueckfallebene — ein Ladefehler in '
        + 'js/inline-init.js wuerde die Kacheln ganz stilllegen');
}

describe('N4 — die sechs Kacheln auf der Kachelseite', () => {
    it('wechseln ueber switchTabAndUpdateMenu, mit Rueckfall auf switchTab', () => {
        pruefeWechsler(HUB, 'wechsleReiter');
    });

    it('enterSubTab und exitToHub rufen switchTab nicht mehr selbst auf', () => {
        for (const name of ['enterSubTab', 'exitToHub']) {
            const rumpf = ohneKommentare(funktion(HUB, name));
            assert.ok(!/window\.switchTab\s*\(/.test(rumpf),
                name + '() schaltet wieder an der Adresse vorbei um');
            assert.match(rumpf, /wechsleReiter\(/,
                name + '() nimmt den gemeinsamen Weg nicht');
        }
    });

    it('der Rueckweg (seit V2-15 zur Startseite) schreibt die Adresse ebenfalls fort', () => {
        // Sonst stuende nach "← Uebersicht" die Adresse der Unteransicht
        // ueber der Kachelseite — dieselbe Luege, nur umgekehrt.
        assert.match(ohneKommentare(funktion(HUB, 'exitToHub')),
            /wechsleReiter\('current-meta'\)/);
    });
});

describe('N4 — die Held-Kachel in der Meta-Ansicht (QA-C FEHLER-8)', () => {
    it('wechselt ueber switchTabAndUpdateMenu, mit Rueckfall auf switchTab', () => {
        pruefeWechsler(CORE, 'wechsleZuAnalyse');
    });

    it('beide Navigationswege zur Deck-Analyse nehmen ihn', () => {
        for (const name of ['navigateToCurrentMetaWithDeck',
                            'navigateToCMAnalysisWithCombinedDeck']) {
            const start = CORE.indexOf(name);
            assert.ok(start >= 0, name + ' gibt es nicht mehr');
            // Nur der Kopf der Funktion bis zur Wartschleife interessiert:
            // dort stand der Reiterwechsel.
            const ausschnitt = ohneKommentare(CORE.slice(start, start + 1400));
            assert.match(ausschnitt, /wechsleZuAnalyse\('current-analysis'\)/,
                name + ' schaltet wieder an der Adresse vorbei um');
            assert.ok(!/\bswitchTab\('current-analysis'\)/.test(ausschnitt),
                name + ' ruft switchTab weiterhin direkt auf');
        }
    });
});
