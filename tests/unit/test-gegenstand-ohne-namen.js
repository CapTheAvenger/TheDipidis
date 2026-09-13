/**
 * Ein Pseudoname ist keine Angabe.
 *
 * BEFUND 13.09.2026: championsbattledata.com hat aufgehoert, fuer einen
 * Teil der gehaltenen Gegenstaende Namen zu liefern, und schreibt
 * stattdessen "Unknown Item 542". Gemessen: 20 verschiedene Nummern,
 * 174 betroffene Eintraege; am Vortag keine einzige.
 *
 * Die Nummer ist KEINE PokeAPI-Item-ID — die Gegenprobe gegen
 * data/v2/csv/item_names.csv ergibt Poke-Floete, Muschelglocke,
 * Zoomlinse und Kraftguertel. Eine Zuordnung waere geraten.
 *
 * Der Fehler, gegen den diese Datei steht, ist NICHT die Luecke selbst,
 * sondern wie sie sich liest: "Unknown Item 542" sieht aus wie ein
 * Gegenstand, den der Leser nicht kennt, statt wie eine fehlende Angabe.
 *
 * FUENF FLAECHEN zeigen gehaltene Gegenstaende an. Fuenf Kopien der
 * Regel waeren fuenf Wahrheiten — deshalb steht sie EINMAL in
 * js/champions-namen.js, und diese Datei haelt fest, dass alle fuenf
 * sie auch fragen.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const FLAECHEN = [
    'js/app-side-quest-items.js',
    'js/app-side-quest-builder.js',
    'js/app-side-quest-matchups.js',
    'js/app-side-quest-pokedex.js',
    'js/app-side-quest-usage.js',
];

function modul(deutsch) {
    const sb = {
        window: {},
        document: { documentElement: { lang: deutsch ? 'de' : 'en' } },
        localStorage: { getItem: () => (deutsch ? 'de' : 'en'), setItem: () => {} },
        // istDeutsch() fragt window.getLang() — ohne diese Zeile lief der
        // Test am 13.09.2026 beide Sprachen gegen die englische Fassung
        // und haette einen deutschen Fehler nie gesehen.
        navigator: { language: deutsch ? 'de-DE' : 'en-US' },
        fetch: () => Promise.reject(new Error('kein Netz im Test')),
    };
    sb.window.getLang = () => (deutsch ? 'de' : 'en');
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(lies('js/champions-namen.js'), sb);
    return sb.window.ChampionsNamen;
}

describe('Ein Gegenstand ohne Namen wird als Luecke gezeigt, nicht als Name', () => {

    it('erkennt genau die Form, die die Quelle liefert — und nichts sonst', () => {
        const N = modul(true);
        for (const ja of ['Unknown Item 542', 'Unknown Item 1', ' Unknown Item 190 ']) {
            assert.ok(N.istUnbenannt(ja), `${ja} muesste als unbenannt gelten`);
        }
        // Die Gegenprobe ist der wichtigere Teil: ein echter Gegenstand
        // darf niemals in den Platzhalter rutschen.
        for (const nein of ['Leftovers', 'Choice Scarf', 'Unknown Item',
                            'Unknown Item X', 'Focus Sash', '', null, undefined]) {
            assert.ok(!N.istUnbenannt(nein), `${nein} darf NICHT als unbenannt gelten`);
        }
    });

    it('nennt die Luecke beim Namen — in beiden Sprachen, mit der Nummer', () => {
        const de = modul(true).anzeige('Unknown Item 542', 'items');
        const en = modul(false).anzeige('Unknown Item 542', 'items');
        for (const [txt, sprache] of [[de, 'deutsch'], [en, 'englisch']]) {
            assert.ok(!/Unknown Item/.test(txt),
                `${sprache}: der Pseudoname steht weiter da — "${txt}"`);
            assert.ok(/542/.test(txt),
                `${sprache}: die Nummer fehlt, der Eintrag ist nicht mehr `
                + `nachvollziehbar — "${txt}"`);
            assert.ok(txt.length > 15, `${sprache}: zu knapp — "${txt}"`);
        }
        assert.notEqual(de, en, 'beide Sprachen liefern denselben Text');
    });

    it('laesst jeden echten Namen unveraendert', () => {
        // Der teuerste denkbare Fehler waere, dass diese Regel echte
        // Gegenstandsnamen anfasst. Deshalb hier die Breitenprobe gegen
        // die ganze Referenzliste, nicht gegen drei Beispiele.
        const N = modul(false);
        const ref = JSON.parse(lies('data/champions_available_items.json'));
        const namen = ref.items || [];
        assert.ok(namen.length > 50, 'Testvoraussetzung: Referenzliste ist da');
        for (const n of namen) {
            assert.equal(N.anzeige(n, 'items'), n, `${n} wurde veraendert`);
        }
    });

    it('alle fuenf Anzeigeflaechen fragen die gemeinsame Regel', () => {
        /* Ohne diese Zusicherung faellt eine Flaeche beim naechsten Umbau
           still heraus und zeigt wieder "Unknown Item 542" — waehrend die
           anderen vier sauber sind und niemandem etwas auffaellt. */
        for (const datei of FLAECHEN) {
            const js = lies(datei);
            assert.match(js, /ChampionsNamen/,
                `${datei} fragt die gemeinsame Regel nicht`);
        }
    });

    it('keine Flaeche fuehrt eine eigene Kopie der Regel', () => {
        /* Eine zweite Kopie ist schlimmer als keine: sie geht irgendwann
           auseinander, und dann zeigen zwei Ansichten dasselbe anders.

           KORRIGIERT WAEHREND DES SCHREIBENS (13.09.2026): die erste
           Fassung suchte "Unknown Item" im ganzen Dateitext und fiel
           ueber meine eigenen KOMMENTARE um, die erklaeren, warum die
           Regel woanders steht. Sie prueste damit die Schreibweise statt
           den Code — genau der Fehler, den CLAUDE.md unter „Eine
           Zusicherung, die Text liest" beschreibt. Jetzt werden
           Kommentare vorher herausgeschnitten. */
        const ohneKommentare = (js) => js
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        for (const datei of FLAECHEN) {
            const code = ohneKommentare(lies(datei));
            assert.ok(!/Unknown Item/.test(code),
                `${datei} kennt das Muster im CODE — die Regel gehoert `
                + 'ausschliesslich in js/champions-namen.js');
        }
        // Und die Gegenprobe, damit das Ausschneiden nicht einfach alles
        // wegwirft: in champions-namen.js MUSS das Muster stehenbleiben.
        assert.match(ohneKommentare(lies('js/champions-namen.js')), /Unknown Item/,
            'das Ausschneiden hat auch den Code entfernt — dann prueft '
            + 'diese Zusicherung nichts mehr');
    });
});
