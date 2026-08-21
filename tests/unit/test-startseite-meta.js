/**
 * Die Meta-Ansicht IST die Startseite.
 *
 * Bis zum 18.08.2026 landete jeder Besucher auf einem Hub: sechs
 * Kacheln, benannt nach ihren Datenquellen, plus ein Antwortblock. Der
 * Hub war eine Seite, die auf die Antwort zeigt — also ein Klick VOR
 * der Antwort.
 *
 * Seit die Meta-Ansicht ihre Bausteine klappt (js/ds-sections.js:
 * 11.364 -> 2.545 px) und eine Filterzeile traegt (js/ds-filter.js),
 * zeigte der Hub auf etwas, das man ohnehin sofort sieht.
 *
 * Gemessen nach der Umstellung, Erstaufruf ohne Klick:
 *
 *   Desktop  current-meta, 2.878 px, 9 Abschnitte, Filter da
 *   Mobil    current-meta, 4.088 px, 9 Abschnitte, Filter da
 *   Navi     Meta · Decks · Turnier · Karten · Champions (beide Breiten)
 *
 * Der Hub-Reiter bleibt bestehen und ist ueber das Pokeball-Menue
 * erreichbar — geloescht wird nichts, er ist nur kein eigener
 * Navigationspunkt mehr.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const HTML = read('index.html');
const NAV = stripJs(read('js/ds-nav.js'));
const HUB = stripJs(read('js/meta-analysis-hub.js'));

describe('Startseite — die Meta-Ansicht empfaengt', () => {
    it('current-meta traegt active, der Hub nicht mehr', () => {
        // class-Liste statt exakter Zeichenfolge: seit Audit 3 traegt der
        // Reiter zusaetzlich .fs-scale (Ausstieg aus dem 12-px-Boden, Etappe 1).
        // Geprueft wird, was gemeint ist — dass genau dieser Reiter aktiv ist —,
        // nicht die zufaellige Reihenfolge seiner Klassen.
        const cm = HTML.match(/<div id="current-meta" class="([^"]*)"/);
        assert.ok(cm, '#current-meta nicht gefunden');
        const klassen = cm[1].trim().split(/\s+/);
        assert.ok(klassen.includes('tab-content'), 'tab-content fehlt: ' + cm[1]);
        assert.ok(klassen.includes('active'), 'active fehlt: ' + cm[1]);
        assert.match(HTML, /<div id="meta-analysis-hub" class="tab-content">/);
    });

    it('genau ein Reiter ist beim Laden aktiv', () => {
        const n = (HTML.match(/class="tab-content active(?:[ "])/g) || []).length;
        assert.strictEqual(n, 1);
    });

    it('der Hub-Reiter existiert weiter', () => {
        // Nichts loeschen. Er ist ueber das Pokeball-Menue erreichbar.
        assert.match(HTML, /id="meta-analysis-hub"/);
        assert.match(HTML, /data-tab-id="meta-analysis-hub"/);
    });
});

describe('Navigation — fuenf Ziele, auf beiden Breiten dieselben', () => {
    it('"Start" ist kein Navigationspunkt mehr', () => {
        const g = /var GROUPS = \[([\s\S]*?)\n    \];/.exec(NAV)[1];
        assert.ok(!/id:\s*'start'/.test(g));
    });

    it('die fuenf heissen Meta, Decks, Turnier, Karten, Champions', () => {
        const g = /var GROUPS = \[([\s\S]*?)\n    \];/.exec(NAV)[1];
        const ids = [...g.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
        assert.deepStrictEqual(ids, ['meta', 'decks', 'turnier', 'karten', 'champions']);
    });

    it('der Hub gehoert jetzt zur Gruppe Meta', () => {
        // Sonst leuchtet kein Knopf, wenn man ueber das Menue dorthin geht.
        const g = /var GROUPS = \[([\s\S]*?)\n    \];/.exec(NAV)[1];
        assert.match(g, /id:\s*'meta',[\s\S]*?'meta-analysis-hub'/);
    });

    it('Champions steht endlich auch in der Mobil-Leiste', () => {
        // Vorher belegte "Start" den fuenften Platz, und es gab null
        // sichtbare Wege zu side-quest ausserhalb des Pokeball-Menues.
        assert.ok(!/GROUPS\.filter\(function \(g\) \{ return !g\.alt; \}\)\.map/.test(NAV),
            'die Mobil-Leiste filtert Champions noch heraus');
        assert.match(NAV, /bar\.innerHTML = GROUPS\.map/);
    });

    it('kein Label heisst mehr "Start" oder "Home"', () => {
        assert.ok(!/start:\s*'(Start|Home)'/.test(NAV));
    });
});

describe('Startseite — der Antwortblock geht nicht verloren', () => {
    it('die Meta-Ansicht hat einen eigenen Host dafuer', () => {
        assert.match(HTML, /id="metaAnswerTop"/);
        const iAns = HTML.indexOf('id="metaAnswerTop"');
        const iCon = HTML.indexOf('id="currentMetaContent"');
        assert.ok(iAns < iCon, 'die Antwort gehoert ueber die Bausteine');
    });

    it('beide Hosts werden aus DERSELBEN Funktion gefuellt', () => {
        // Zwei Herleitungen waeren zwei Wahrheiten — diese Seite hatte
        // schon einmal vier Siegquoten fuer ein Deck auf einem Schirm.
        assert.match(HUB, /const ANSWER_HOSTS = \[ANSWER_HOST_ID, 'metaAnswerTop'\]/);
        const fn = /async function renderAnswer\(\) \{[\s\S]*?\n    \}/.exec(HUB)[0];
        assert.match(fn, /hosts\.forEach/);
        assert.strictEqual((fn.match(/answerModel\(/g) || []).length, 1,
            'nur ein Modell fuer beide Hosts');
    });

    it('er wird auch beim Wechsel auf die Meta-Ansicht gefuellt', () => {
        // Beim Seitenstart erledigt das DOMContentLoaded, beim Wechsel
        // sonst niemand.
        assert.match(HUB, /if \(tabId === 'current-meta'\) renderAnswer\(\);/);
    });
});

describe('Startseite — keine dritte Navigationsebene', () => {
    it('die Hub-Unterleiste wird nicht mehr eingesetzt', () => {
        // Sie listete "← Uebersicht · City League Meta · Deck-Analyse
        // (Japan) · Aktuelles Meta (Global) · …" ueber jeder dieser
        // Ansichten — zwischen Hauptnavigation und Filterzeile, und die
        // ersten drei Eintraege sind genau das, was der Datenraum-Filter
        // eine Zeile tiefer anbietet.
        const fn = /function injectSubNav\([^)]*\) \{[\s\S]{0,400}/.exec(HUB)[0];
        assert.match(fn, /if \(true\) return null;/);
    });

    it('die Funktion bleibt samt Aufrufern stehen', () => {
        // Ein frueher Ausstieg statt geloeschter Aufrufe: eine Zeile
        // zurueck, und die Leiste ist wieder da.
        assert.match(HUB, /function injectSubNav/);
        assert.match(HUB, /clearAllSubNavHosts/);
    });
});
