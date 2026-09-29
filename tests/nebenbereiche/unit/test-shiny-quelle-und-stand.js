/**
 * "KEIN VEROEFFENTLICHTES SHINY" — SEIT WANN?
 *
 * WAS BEHAUPTET WIRD, UND WO
 * --------------------------
 * js/app-side-quest-pokedex.js zeichnet im Herkunftsblock jeder Art
 * einen von zwei Saetzen:
 *
 *     "Shiny ist veröffentlicht"      (Treffer in data/pokemon_go_shiny.json)
 *     "Kein veröffentlichtes Shiny"   (kein Treffer)
 *
 * GEMESSEN 10.09.2026 — WOHER DIE ANGABE STAMMT
 * ---------------------------------------------
 * data/pokemon_go_shiny.json fuehrt ihre Herkunft vollstaendig:
 *   quelle       https://leekduck.com/shiny/pms.json
 *   quelle_name  LeekDuck Shiny Checklist
 *   stand        2026/09/10
 *   Umfang       852 Grundformen, 56 Megaformen, 50 Regionalformen
 *                (alola 18, galar 18, hisui 12, paldea 2)
 *   angekuendigt_uebersprungen  12 — Eintraege mit einem
 *                Veroeffentlichungsdatum in der Zukunft fliegen beim Bau
 *                raus, sonst behauptete die Seite Fangbarkeit fuer etwas,
 *                das es noch nicht gibt.
 * Die Angabe ist also BELEGT — sie steht nicht ohne Quelle da.
 *
 * DER BEFUND, DEN DIESE DATEI SCHLIESST
 * -------------------------------------
 * Der Quell-URL stand auf dem Schirm, das DATUM nicht. Die Datei selbst
 * schreibt in `_meta.lesart_kein_treffer` woertlich "zum Stand der
 * Quelle" — genau dieser Vorbehalt fehlte in der Anzeige. Eine
 * Verneinung ohne Datum liest sich als Aussage ueber heute, und
 * scripts/scrape_pokemon_go_shiny.py laeuft nicht taeglich. Der
 * Nachbarblock (GO-Artenliste) zeigt seinerseits die Veraltet-Warnung
 * seiner Quelle; der Shiny-Block zeigte nichts.
 *
 * Seit dem 10.09.2026 steht das Datum daneben:
 *     "Quelle: https://leekduck.com/shiny/pms.json · Stand: 10.09.2026"
 *
 * WAS HIER NICHT GEPRUEFT WIRD
 * ----------------------------
 * Ob leekduck.com die Liste heute noch so ausliefert, und ob die 852
 * Grundformen stimmen. Der Sandkasten hat keinen Netzweg dorthin
 * (dieselbe Lage wie bei limitlesstcg.com und cardmarket.com). Geprueft
 * wird, dass die Seite die Herkunft VOLLSTAENDIG anschreibt — nicht,
 * dass die Herkunft recht hat.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');

const DEX   = lies('js', 'app-side-quest-pokedex.js');
const SHINY = JSON.parse(lies('data', 'pokemon_go_shiny.json'));

/** standLesbar() aus der ausgelieferten Datei, an der Klammer gezaehlt. */
function funktion(quelle, kopf) {
    const a = quelle.indexOf(kopf);
    assert.ok(a >= 0, `nicht gefunden: ${kopf}`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', a); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    throw new Error('unbalancierte Klammern');
}
const standLesbar = new Function(
    funktion(DEX, 'function standLesbar(') + '; return standLesbar;')();

describe('die Shiny-Angabe traegt ihre Herkunft in der Datei', () => {

    it('Quelle, Quellname und Stand stehen im _meta', () => {
        const m = SHINY._meta;
        assert.ok(m, 'data/pokemon_go_shiny.json hat keinen _meta-Block');
        assert.match(String(m.quelle), /^https?:\/\//,
            'die Quelle ist keine abrufbare Adresse — dann kann sie niemand nachschlagen');
        assert.ok(String(m.quelle_name || '').trim(), 'die Quelle hat keinen Namen');
        assert.match(String(m.stand), /^\d{4}[-/]\d{2}[-/]\d{2}$/,
            `_meta.stand ist kein lesbares Datum: ${JSON.stringify(m.stand)}`);
    });

    it('die Lesart der VERNEINUNG steht dabei — sie ist die heiklere', () => {
        /* Ein Treffer ist selbsterklaerend. Ein fehlender Eintrag kann
           "gibt es nicht" oder "wissen wir nicht" heissen, und nur die
           Datei kann sagen, welches von beiden. */
        const m = SHINY._meta;
        assert.ok(String(m.lesart_kein_treffer || '').trim(),
            'ohne lesart_kein_treffer ist "Kein veröffentlichtes Shiny" nicht einzuordnen');
        assert.match(m.lesart_kein_treffer, /Stand der Quelle/,
            'die Lesart nennt nicht mehr, dass die Verneinung am Stand der Quelle haengt — '
            + 'dann darf sie auch nicht mehr als belastbar gelten');
    });

    it('angekuendigte, noch nicht fangbare Shinys sind ausgezaehlt', () => {
        assert.equal(typeof SHINY._meta.angekuendigt_uebersprungen, 'number',
            'ohne diese Zahl weiss niemand, ob der Datumsfilter beim Bau gegriffen hat');
        assert.ok(SHINY._meta.angekuendigt_uebersprungen >= 0);
    });
});

describe('die Herkunft erreicht auch den Bildschirm — Quelle UND Stand', () => {

    it('der Quell-URL wird an die Shiny-Zeile geschrieben', () => {
        assert.match(DEX, /sqp-herkunft-quelle[\s\S]{0,200}_shiny\._meta\.quelle/,
            'die Shiny-Zeile nennt ihre Quelle nicht mehr');
    });

    it('das Standdatum steht daneben — sonst ist die Verneinung undatiert', () => {
        assert.ok(/_shiny\._meta\.stand/.test(DEX),
            'BEFUND 10.09.2026 ist zurueck: "Kein veröffentlichtes Shiny" steht '
            + 'wieder ohne Datum da, obwohl _meta.stand in der Datei liegt. Eine '
            + 'undatierte Verneinung liest sich als Aussage ueber heute.');
        assert.ok(/standLabel/.test(DEX), 'es gibt keine Beschriftung fuer das Datum');
        assert.match(DEX, /standLabel: 'Stand:'/, 'die deutsche Beschriftung fehlt');
        assert.match(DEX, /standLabel: 'As of:'/, 'die englische Beschriftung fehlt');
    });

    it('beide Saetze der Behauptung stehen weiter woertlich da', () => {
        assert.match(DEX, /shinyJa: 'Shiny ist veröffentlicht'/);
        assert.match(DEX, /shinyNein: 'Kein veröffentlichtes Shiny'/);
    });
});

describe('das Datum wird gelesen, nicht geraten', () => {

    it('beide Schreibweisen der Datei ergeben dasselbe deutsche Datum', () => {
        /* Die Datei schreibt "2026/09/10" mit Schraegstrichen, andere
           Datenstaende im Projekt ISO mit Bindestrich. Beide muessen
           gehen, sonst haengt die Anzeige an einer Schreibweise. */
        assert.equal(standLesbar('2026/09/10'), '10.09.2026');
        assert.equal(standLesbar('2026-09-10'), '10.09.2026');
    });

    it('der echte Stand der Datei laesst sich lesen', () => {
        assert.match(standLesbar(SHINY._meta.stand), /^\d{2}\.\d{2}\.\d{4}$/,
            `_meta.stand ${JSON.stringify(SHINY._meta.stand)} ergibt kein Datum — `
            + 'dann faellt die Zeile stillschweigend auf "nur Quelle" zurueck');
    });

    it('unlesbares oder fehlendes ergibt NICHTS, kein halbes Datum', () => {
        /* CLAUDE.md: report, don't silently repair. Lieber gar kein
           Datum als ein zurechtgebogenes. */
        for (const murks of ['', null, undefined, 'Mai 2026', '2026/9/1',
                             '10.09.2026', '2026/13/40x', 42]) {
            assert.equal(standLesbar(murks), '',
                `${JSON.stringify(murks)} haette nichts ergeben muessen, `
                + `ergab aber "${standLesbar(murks)}"`);
        }
    });
});

describe('NICHT GEPRUEFT — ausdruecklich', () => {
    it('ob leekduck.com die Liste heute noch so ausliefert', () => {
        /* Kein Netzweg aus dem Sandkasten. Diese Zusicherung steht hier,
           damit die Luecke einen Namen hat und nicht als Abdeckung
           durchgeht. Was hier geprueft werden KANN, ist nur, dass die
           Adresse ueberhaupt noch dasteht. */
        assert.equal(SHINY._meta.quelle, 'https://leekduck.com/shiny/pms.json',
            'die Quelladresse hat sich geaendert — dann gilt der Umfang oben '
            + 'nicht mehr und die Zahlen im Kopf dieser Datei muessen neu '
            + 'gemessen werden');
    });
});
