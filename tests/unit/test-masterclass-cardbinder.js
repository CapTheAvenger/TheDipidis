/* test-masterclass-cardbinder.js — der fuenfte Bereich einer Masterclass.
 *
 * ANLASS (Betreiber, 24.09.2026): „Dann nehme ich noch einen Reiter,
 * Cardbinder, wo ich sehe, aus allen, seitdem es den Archetype gibt,
 * alle Karten, die jemals fuer diesen Archetype benutzt worden sind …
 * dass ich den Masterclass-Bereich einfach nicht verlassen moechte."
 * Und: „wenn ich mir zukuenftig neue Masterclasses kaufe, dann soll von
 * Anfang an klar sein, dass das so gemacht werden soll."
 *
 * Daraus folgen drei Dinge, die hier beissen sollen:
 *
 *   1. Der Reiter wird ANGEHAENGT, nicht ins gekaufte Inhaltsstueck
 *      geschrieben — sonst haette die erste Masterclass, die ihn
 *      vergisst, keinen.
 *   2. Gezeigt wird, was in den Daten steht. Keine Zahl wird gerechnet,
 *      wo keine steht; fehlt ein Preis, steht ein Strich und keine 0.
 *   3. Der Metafilter und die Sortierung werden AUSGEFUEHRT, nicht im
 *      Quelltext gesucht.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const JS = fs.readFileSync(path.join(WURZEL, 'js', 'ds-masterclass.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WURZEL, 'css', 'masterclass.css'), 'utf8');
const REGISTER = JSON.parse(fs.readFileSync(
    path.join(WURZEL, 'config', 'masterclass_cardbinder.json'), 'utf8'));

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const JS_NACKT = ohneKommentare(JS);

test('das Kommentar-Ausschneiden entfernt nicht zu viel', () => {
    assert.ok(JS_NACKT.length > JS.length * 0.3,
        `nur noch ${JS_NACKT.length} von ${JS.length} Zeichen uebrig`);
});

/* ── Funktionen ausschneiden und ausfuehren ──────────────────────── */

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(treffer.index, i + 1); }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

function lade(...namen) {
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const ktx = {
        assert,
        /* Nachbarn, die hier nicht geprueft werden. */
        esc: (s) => String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        T: (k) => k,
        bildAdresse: () => ''
    };
    vm.createContext(ktx);
    vm.runInContext(quelle + '\n;({' + namen.join(',') + '})', ktx);
    return vm.runInContext('({' + namen.join(',') + '})', ktx);
}

/* binderKarteHtml traegt seit dem Deckbau (25.09.2026) drei weitere
 * Auskuenfte an der Karte: wie oft das + sie hineinlegt, wie oft sie
 * schon drin ist, und was Tim spielt. Die ersten beiden kommen aus
 * Nachbarfunktionen — die muessen also mitgeladen werden. `window` wird
 * hier LEER gestellt: dann greift in binderMenge der Rueckfall, und der
 * Deckbauer ist nicht da, also ist die Karte nie im Deck. Genau der
 * Zustand, in dem eine Kachel weiterhin richtig aussehen muss. */
function ladeKachel(zusatz) {
    const namen = ['binderKarteHtml', 'binderZahl', 'binderDruck', 'binderMenge',
        'binderImDeck', 'binderDeckKarte', 'deckBauer'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const ktx = Object.assign({
        assert,
        esc: (s) => String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        T: (k) => k,
        bildAdresse: () => '',
        window: {}
    }, zusatz || {});
    vm.createContext(ktx);
    vm.runInContext(quelle + '\n;({' + namen.join(',') + '})', ktx);
    return vm.runInContext('({' + namen.join(',') + '})', ktx);
}

/* Eine Mappe, wie build_masterclass_cardbinder.py sie schreibt. */
const karte = (o) => Object.assign({
    name: 'Drilbur', name_de: 'Rotomurf', set: 'PBL', nummer: '46',
    gruppe: 'pokemon', bild: 'https://example.invalid/pbl046.png',
    preis: { eur: 0.04, eur_niedrig: 0.02, url: 'https://cardmarket.invalid/x', stand: '2026-09-24' },
    je_meta: {
        'TEF-PBL': { listen_mit_karte: 2631, listen_gesamt: 2641, anteil: 99.6, schnitt: 3.9, hoechstzahl: 4, turniere: 220 }
    },
    gesamt: { listen_mit_karte: 2631, listen_gesamt: 2641, anteil: 99.6, schnitt: 3.9, hoechstzahl: 4 },
    quellen: ['online_api']
}, o);

/* ── 1 · Der Reiter haengt sich selbst an ────────────────────────── */

function domErsatz() {
    const nav = { kinder: [], querySelector: () => null, appendChild(k) { this.kinder.push(k); } };
    const letzter = { naechster: null, parentNode: null };
    const abschnitte = [letzter];
    const eingefuegt = [];
    letzter.parentNode = {
        insertBefore(neu) { eingefuegt.push(neu); }
    };
    return {
        nav, eingefuegt,
        querySelector: (sel) => (sel === '.mcl-bereiche' ? nav : null),
        querySelectorAll: () => abschnitte
    };
}

test('binderEinhaengen setzt Knopf und Abschnitt — das Inhaltsstueck bleibt unberuehrt', () => {
    const { binderEinhaengen } = lade('binderEinhaengen');
    const erzeugt = [];
    const ktxDoc = {
        createElement(tag) {
            const e = {
                tagName: tag.toUpperCase(), className: '', textContent: '', type: '',
                hidden: false, _attrs: {},
                setAttribute(k, v) { this._attrs[k] = String(v); },
                getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
            };
            erzeugt.push(e);
            return e;
        }
    };
    const w = domErsatz();
    const alt = global.document;
    global.document = ktxDoc;
    try {
        /* binderEinhaengen nutzt document und T aus dem Modul — beide
         * werden hier gestellt. */
        const fn = new Function('document', 'T', 'return ' +
            schneideFunktion(JS, 'binderEinhaengen'))(ktxDoc, (k) => k);
        fn(w, { id: 'mega-stalobor' });
    } finally { global.document = alt; }

    const knopf = erzeugt.find((e) => e.getAttribute('data-mcl-ziel') === 'binder');
    assert.ok(knopf, 'kein Knopf mit data-mcl-ziel="binder" erzeugt');
    assert.strictEqual(knopf.getAttribute('aria-pressed'), 'false');
    assert.ok(w.nav.kinder.includes(knopf), 'der Knopf haengt nicht in der Bereichsleiste');

    const block = w.eingefuegt[0];
    assert.ok(block, 'kein Abschnitt eingefuegt');
    assert.strictEqual(block.getAttribute('data-mcl-abschnitt'), 'binder');
    assert.strictEqual(block.hidden, true,
        'der Cardbinder darf nicht offen aufgehen — der Spickzettel ist der Einstieg');
});

/* ── 2 · Metafilter und Sortierung ───────────────────────────────── */

test('der Metafilter zeigt nur Karten, die es in diesem Meta gab', () => {
    const { binderSortiert } = lade('binderSortiert', 'binderDruck', 'binderGruppenRang');
    const nurPbl = karte({ name: 'Nur PBL' });
    const nur30c = karte({
        name: 'Nur 30C',
        je_meta: { 'TEF-30C': { listen_mit_karte: 5, listen_gesamt: 171, anteil: 2.9 } },
        gesamt: { listen_mit_karte: 5, listen_gesamt: 171, anteil: 2.9 }
    });
    const alle = binderSortiert([nurPbl, nur30c], 'alle', 'nutzung');
    assert.deepStrictEqual(alle.map((k) => k.name), ['Nur PBL', 'Nur 30C']);

    const pbl = binderSortiert([nurPbl, nur30c], 'TEF-PBL', 'nutzung');
    assert.deepStrictEqual(pbl.map((k) => k.name), ['Nur PBL']);

    const c30 = binderSortiert([nurPbl, nur30c], 'TEF-30C', 'nutzung');
    assert.deepStrictEqual(c30.map((k) => k.name), ['Nur 30C']);
});

test('die Sortierung nach Nutzung gilt IM gewaehlten Meta, nicht insgesamt', () => {
    const { binderSortiert } = lade('binderSortiert', 'binderDruck', 'binderGruppenRang');
    /* A ist insgesamt haeufiger, B ist im neuen Meta haeufiger. Wer im
     * neuen Meta sortiert und A zuerst bekommt, sortiert nach der
     * falschen Zahl. */
    const a = karte({
        name: 'A',
        je_meta: {
            'TEF-PBL': { listen_mit_karte: 900, listen_gesamt: 1000, anteil: 90 },
            'TEF-30C': { listen_mit_karte: 3, listen_gesamt: 100, anteil: 3 }
        },
        gesamt: { listen_mit_karte: 903, listen_gesamt: 1100, anteil: 82.1 }
    });
    const b = karte({
        name: 'B',
        je_meta: { 'TEF-30C': { listen_mit_karte: 80, listen_gesamt: 100, anteil: 80 } },
        gesamt: { listen_mit_karte: 80, listen_gesamt: 100, anteil: 80 }
    });
    assert.deepStrictEqual(binderSortiert([a, b], 'alle', 'nutzung').map((k) => k.name), ['A', 'B']);
    assert.deepStrictEqual(binderSortiert([a, b], 'TEF-30C', 'nutzung').map((k) => k.name), ['B', 'A']);
});

test('nach Preis sortiert steht die teuerste Karte oben, Karten ohne Preis unten', () => {
    const { binderSortiert } = lade('binderSortiert', 'binderDruck', 'binderGruppenRang');
    const billig = karte({ name: 'billig', preis: { eur: 0.04 } });
    const teuer = karte({ name: 'teuer', preis: { eur: 31.5 } });
    const ohne = karte({ name: 'ohne', preis: null });
    const s = binderSortiert([billig, ohne, teuer], 'alle', 'preis').map((k) => k.name);
    assert.deepStrictEqual(s, ['teuer', 'billig', 'ohne']);
});

test('nach Name sortiert wird der DEUTSCHE Name genommen', () => {
    const { binderSortiert } = lade('binderSortiert', 'binderDruck', 'binderGruppenRang');
    /* Englisch waere Drilbur < Zubat; deutsch ist Rotomurf > Zubat
     * nicht — also entscheidet, welcher Name benutzt wird. */
    const a = karte({ name: 'Drilbur', name_de: 'Rotomurf' });
    const b = karte({ name: 'Zubat', name_de: 'Anorith' });
    assert.deepStrictEqual(binderSortiert([a, b], 'alle', 'name').map((k) => k.name),
        ['Zubat', 'Drilbur'],
        'sortiert wurde nach dem englischen Namen');
});

/* ── 3 · Was nicht in den Daten steht, wird nicht behauptet ──────── */

test('eine fehlende Zahl wird zum Strich, nicht zur Null', () => {
    const { binderZahl } = lade('binderZahl');
    assert.strictEqual(binderZahl(null), '–');
    assert.strictEqual(binderZahl(undefined), '–');
    assert.strictEqual(binderZahl(''), '–');
    assert.strictEqual(binderZahl(NaN), '–');
    assert.strictEqual(binderZahl(0), '0', 'eine gemessene Null ist eine Zahl');
    assert.strictEqual(binderZahl(99.57, 1), '99,6');
    assert.strictEqual(binderZahl(2.5, 2), '2,50', 'das Komma ist das deutsche Trennzeichen');
});

test('ohne Preis steht ein Strich und kein Euro-Betrag', () => {
    const { binderKarteHtml } = ladeKachel();
    const html = binderKarteHtml(karte({ preis: null }), 'alle');
    assert.ok(!/\d[,.]\d\d\s*€|\\u20ac/.test(html.replace(/–/g, '')),
        'im HTML steht ein Betrag, obwohl kein Preis in den Daten ist:\n' + html);
    assert.ok(html.includes('mcl-bd-kein'), 'der fehlende Preis ist nicht als fehlend gekennzeichnet');
});

test('die Kachel zeigt den deutschen Namen und den Druck', () => {
    const { binderKarteHtml } = ladeKachel();
    const html = binderKarteHtml(karte({}), 'alle');
    assert.ok(html.includes('Rotomurf'), 'der deutsche Name fehlt:\n' + html);
    assert.ok(html.includes('PBL-46'), 'der Druck fehlt:\n' + html);
    assert.ok(html.includes('2631'), 'die Zahl der Listen fehlt:\n' + html);
});

test('eine Karte ohne deutschen Namen behaelt den englischen', () => {
    const { binderKarteHtml } = ladeKachel();
    const html = binderKarteHtml(karte({ name_de: null, name: 'Jumbo Ice Cream' }), 'alle');
    assert.ok(html.includes('Jumbo Ice Cream'),
        'ohne deutschen Namen steht gar kein Name da:\n' + html);
});

/* ── 4 · Register und Oberflaeche haengen zusammen ───────────────── */

test('jede Masterclass in GUIDES hat einen Eintrag im Cardbinder-Register', () => {
    /* Das ist die Auflage „von Anfang an klar, dass das so gemacht
     * werden soll": wer eine Masterclass ergaenzt und den Cardbinder
     * vergisst, macht diesen Test rot. */
    const ids = [...JS.matchAll(/id:\s*'([a-z0-9-]+)',\s*\n\s*titel:/g)].map((m) => m[1]);
    assert.ok(ids.length >= 1, 'keine Masterclass in GUIDES gefunden');
    const register = Object.keys(REGISTER.masterclasses || {});
    const fehlen = ids.filter((i) => register.indexOf(i) < 0);
    assert.deepStrictEqual(fehlen, [],
        'diese Masterclasses haben keinen Cardbinder-Eintrag in '
        + 'config/masterclass_cardbinder.json');
});

test('jeder Register-Eintrag nennt ein Kopf-Pokemon mit Beleg', () => {
    Object.entries(REGISTER.masterclasses || {}).forEach(([id, e]) => {
        assert.ok(e.kopf_pokemon, `${id}: kein kopf_pokemon`);
        assert.ok(/^[a-z0-9-]+$/.test(e.kopf_pokemon),
            `${id}: kopf_pokemon ${e.kopf_pokemon!==undefined?JSON.stringify(e.kopf_pokemon):''} ist kein Limitless-Slug`);
        assert.ok(e._beleg, `${id}: kein Beleg, woher das Kopf-Pokemon stammt`);
    });
});

test('der Cardbinder hat eigene Regeln im Stilblatt', () => {
    const noetig = ['.mcl-bd-gitter', '.mcl-bd-karte', '.mcl-bd-preis', '.mcl-bd-mus'];
    noetig.forEach((k) => assert.ok(CSS.includes(k), `Regel fehlt: ${k}`));
});

test('die Beschriftungen gibt es in beiden Sprachen', () => {
    const schluessel = ['binder', 'binderLead', 'binderAlle', 'binderSortNutzung',
        'binderMatchups', 'binderTurniere', 'binderOhnePreis', 'binderFehlt'];
    const de = JS.slice(JS.indexOf('de: {'), JS.indexOf('en: {'));
    const en = JS.slice(JS.indexOf('en: {'));
    schluessel.forEach((k) => {
        assert.ok(new RegExp('\\b' + k + ':').test(de), `deutsch fehlt: ${k}`);
        assert.ok(new RegExp('\\b' + k + ':').test(en), `englisch fehlt: ${k}`);
    });
});

/* ── 5 · Standardsortierung ───────────────────────────────────────────
 *
 * BEFUND (Betreiber, 25.09.2026): „bitte auch noch unsere
 * Standardsortierung anbieten --> Pokemon, supporter, Item, Tool,
 * Stadion, Spezial Energie, Basis Energie"
 *
 * Geprueft wird die AUSGEFUEHRTE Sortierung, nicht die Liste im
 * Quelltext: eine Reihenfolge, die nur als Konstante richtig dasteht,
 * aber nicht angewendet wird, waere gruen und falsch.
 */

function ladeSortierung() {
    const namen = ['binderSortiert', 'binderDruck', 'binderGruppenRang'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    /* BINDER_GRUPPEN steht im Modul und wird hier AUS DEM QUELLTEXT
     * geholt, nicht im Test wiederholt — sonst pruefte der Test seine
     * eigene Kopie. */
    const roh = /var BINDER_GRUPPEN = (\[[^\]]*\]);/.exec(JS);
    assert.ok(roh, 'BINDER_GRUPPEN nicht im Quelltext gefunden');
    const ktx = { assert, BINDER_GRUPPEN: JSON.parse(roh[1].replace(/'/g, '"')) };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    return { fn: vm.runInContext('binderSortiert', ktx), gruppen: ktx.BINDER_GRUPPEN };
}

test('die Standardsortierung ist Pokemon, Supporter, Item, Tool, Stadion, Spezial-, Basis-Energie', () => {
    const { fn, gruppen } = ladeSortierung();
    assert.deepStrictEqual(gruppen,
        ['pokemon', 'supporter', 'item', 'tool', 'stadium', 'special-energy', 'basic-energy'],
        'die Reihenfolge im Modul ist nicht die, um die der Betreiber gebeten hat');

    /* Absichtlich verkehrt herum hineingegeben. */
    const ein = gruppen.slice().reverse().map((g, i) => karte({
        name: 'K' + i, name_de: 'K' + i, gruppe: g, set: 'PBL', nummer: String(10 + i)
    }));
    const raus = fn(ein, 'alle', 'standard').map((k) => k.gruppe);
    assert.deepStrictEqual(raus, gruppen);
});

test('innerhalb einer Gruppe steht das Meistgespielte oben', () => {
    const { fn } = ladeSortierung();
    const viel = karte({ name: 'viel', nummer: '1' });
    const wenig = karte({
        name: 'wenig', nummer: '2',
        je_meta: { 'TEF-PBL': { listen_mit_karte: 12, listen_gesamt: 2641, anteil: 0.5 } },
        gesamt: { listen_mit_karte: 12, listen_gesamt: 2641, anteil: 0.5 }
    });
    assert.deepStrictEqual(fn([wenig, viel], 'alle', 'standard').map((k) => k.name),
        ['viel', 'wenig']);
});

test('eine Karte ohne Gruppe steht hinten und faellt nicht heraus', () => {
    const { fn } = ladeSortierung();
    const ohne = karte({ name: 'ohne', gruppe: null, nummer: '9' });
    const pokemon = karte({ name: 'poke', gruppe: 'pokemon', nummer: '8' });
    const raus = fn([ohne, pokemon], 'alle', 'standard').map((k) => k.name);
    assert.deepStrictEqual(raus, ['poke', 'ohne'],
        'eine Karte ohne Gruppenangabe darf nicht verschwinden — sie steht hinten');
});

/* ── 6 · Tims Empfehlungen ───────────────────────────────────────────
 *
 * BEFUND (Betreiber, 25.09.2026): „ich möchte bitte noch eine Option das
 * ich nur nach Tims empfehlungen filtern kann wenn ich innerhalb meiner
 * Masterclass Daten mein Deck bauen will."
 */

/* Ein DOM-Ersatz, der so viel kann, wie timGruppenBloecke/timZaehlung
 * brauchen: querySelectorAll ueber zwei Auswahlausdruecke. */
function stueckErsatz(gruppen, bloecke) {
    const kk = (druck, n) => ({
        getAttribute: (k) => (k === 'data-druck' ? druck : k === 'data-n' ? String(n) : null)
    });
    const blockObj = {};
    Object.entries(bloecke).forEach(([nr, karten]) => {
        blockObj[nr] = { querySelectorAll: () => karten.map(([d, n]) => kk(d, n)) };
    });
    const grpObj = gruppen.map((g) => ({
        querySelector: (sel) => (sel === '.mcl-listgruppe-titel' ? { textContent: g.titel } : null),
        querySelectorAll: () => g.nummern.map((n) => ({ getAttribute: () => String(n) }))
    }));
    return {
        querySelectorAll(sel) {
            if (sel === '.mcl-listgruppe') return grpObj;
            return [];
        },
        querySelector(sel) {
            const m = /\[data-mcl-listenblock="([^"]+)"\]/.exec(sel);
            if (m) return blockObj[m[1]] || null;
            return null;
        }
    };
}

function ladeTim() {
    const namen = ['timGruppenBloecke', 'timZaehlung'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const ktx = { assert };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    return {
        bloecke: vm.runInContext('timGruppenBloecke', ktx),
        zaehlung: vm.runInContext('timZaehlung', ktx)
    };
}

test('die Gruppe mit Tims Listen wird am Autorennamen erkannt', () => {
    const { bloecke } = ladeTim();
    const w = stueckErsatz([
        { titel: 'Tims Listen', nummern: [0, 1, 2] },
        { titel: 'Worlds · Tag 2', nummern: [3, 4] },
        { titel: 'Online · letzte 7 Tage', nummern: [5] }
    ], {});
    assert.deepStrictEqual([...bloecke(w)], ['0', '1', '2']);
});

test('ohne Gruppentitel gilt Block 0 — dieselbe Bezugsliste wie im Erzeuger', () => {
    const { bloecke } = ladeTim();
    /* scripts/masterclass_listen_nachziehen.py nennt sie TIMS_BLOCK = "0". */
    const w = stueckErsatz([], { '0': [['TEF-113', 4]] });
    assert.deepStrictEqual([...bloecke(w)], ['0']);
});

test('ohne Tim-Gruppe und ohne Block 0 gibt es keine Empfehlungen — und nichts wird erfunden', () => {
    const { bloecke } = ladeTim();
    const w = stueckErsatz([{ titel: 'Worlds · Tag 2', nummern: [3] }], {});
    assert.deepStrictEqual([...bloecke(w)], []);
});

test('ueber mehrere Listen zaehlt die HOECHSTE Zahl, nicht die Summe', () => {
    const { zaehlung } = ladeTim();
    const w = stueckErsatz([], {
        '0': [['TEF-113', 4], ['PBL-65', 2]],
        '1': [['TEF-113', 3], ['CRI-61', 1]]
    });
    const z = zaehlung(w, ['0', '1']);
    assert.strictEqual(z['TEF-113'], 4, 'vier plus drei ist keine Kopienzahl');
    assert.strictEqual(z['PBL-65'], 2);
    assert.strictEqual(z['CRI-61'], 1);
});

test('der Tim-Filter laesst nur Karten aus seinen Listen stehen', () => {
    const { fn } = ladeSortierung();
    const seine = karte({ name: 'seine', set: 'TEF', nummer: '113' });
    const fremde = karte({ name: 'fremde', set: 'SSP', nummer: '100' });
    const tim = { 'TEF-113': 4 };
    assert.deepStrictEqual(fn([seine, fremde], 'alle', 'standard', false, tim).map((k) => k.name),
        ['seine', 'fremde'], 'ohne Filter fehlt eine Karte');
    assert.deepStrictEqual(fn([seine, fremde], 'alle', 'standard', true, tim).map((k) => k.name),
        ['seine']);
    assert.deepStrictEqual(fn([seine, fremde], 'alle', 'standard', true, {}).map((k) => k.name),
        [], 'ohne Tim-Zaehlung darf der Filter nicht alles durchlassen');
});

/* ── 7 · Deckbau an der Karte ────────────────────────────────────────
 *
 * BEFUND (Betreiber, 25.09.2026): „So das ich direkt auf der gespielten
 * Karte mit + dann die Karte ins Deck packen kann und am besten wird
 * dann die Karte so oft ins Deck gepackt wird wie sie im Durschnitt
 * gespielt wurde, dazu haben wir ja eine Regel."
 *
 * Die Regel ist _markeZahl() in js/app-city-league.js. Geprueft wird,
 * dass der Cardbinder SIE nimmt — und nicht eine eigene Rechnung.
 */

test('die Menge am + kommt aus _markeZahl und nicht aus einer eigenen Rechnung', () => {
    const namen = ['binderMenge'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const gerufen = [];
    const ktx = {
        assert,
        window: {
            _markeZahl: function (...args) { gerufen.push(args); return 3; }
        }
    };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    const binderMenge = vm.runInContext('binderMenge', ktx);
    const k = karte({});
    assert.strictEqual(binderMenge(k, 'alle'), 3, 'die Hausregel wurde nicht genommen');
    assert.strictEqual(gerufen.length, 1, '_markeZahl wurde nicht gerufen');
    /* Die Reihenfolge der Argumente ist dieselbe wie an den anderen
     * Aufrufstellen: (Gesamtschnitt, Schnitt-wenn-enthalten, Maximum,
     * in-Listen, Listen). Der Cardbinder fuehrt keinen Gesamtschnitt —
     * deshalb 0 an erster Stelle, und der Schnitt an zweiter. */
    assert.deepStrictEqual([...gerufen[0]], [0, 3.9, 4, 2631, 2641]);
});

test('ohne die Hausregel bleibt die Menge mindestens 1 — geklickt ist geklickt', () => {
    const quelle = schneideFunktion(JS, 'binderMenge');
    const ktx = { assert, window: {} };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    const binderMenge = vm.runInContext('binderMenge', ktx);
    /* Keine Zahl in den Daten: dann eine Karte, nie null. */
    const leer = karte({
        je_meta: { 'TEF-PBL': { listen_mit_karte: 0, listen_gesamt: 0, anteil: null, schnitt: null, hoechstzahl: null } },
        gesamt: { listen_mit_karte: 0, listen_gesamt: 0, anteil: null }
    });
    assert.strictEqual(binderMenge(leer, 'alle'), 1);
    assert.strictEqual(binderMenge(karte({}), 'alle'), 4, 'der Rueckfall ist die Hoechstzahl');
});

test('die Kachel traegt Zaehler und + mit der Menge; ohne Karte im Deck ist der Zaehler verborgen', () => {
    const { binderKarteHtml } = ladeKachel();
    const html = binderKarteHtml(karte({}), 'alle');
    assert.ok(/data-mcl-bdzahl="PBL-46"/.test(html), 'kein Zaehler an der Karte:\n' + html);
    assert.ok(/data-mcl-bdzahl="PBL-46"[^>]*hidden/.test(html),
        'der Zaehler steht sichtbar da, obwohl keine Karte im Deck ist');
    assert.ok(/data-mcl-bdplus="PBL-46"/.test(html), 'kein + an der Karte');
    assert.ok(/data-mcl-bdminus="PBL-46"[^>]*hidden/.test(html),
        'das − steht sichtbar da, obwohl nichts herauszunehmen ist');
    assert.ok(/\+ 4×|\+ 4×/.test(html),
        'am + steht nicht, wie viele Kopien es hineinlegt:\n' + html);
});

test('liegt die Karte im Deck, zeigt die Kachel die Zahl', () => {
    /* Der Deckbauer wird gestellt: er sagt, zwei liegen drin. */
    const { binderKarteHtml } = ladeKachel({
        window: {
            ProfileDeckBuilder: {
                addCopies: () => ({ hinzugefuegt: 0 }),
                countOf: () => 2
            }
        }
    });
    const html = binderKarteHtml(karte({}), 'alle');
    assert.ok(/data-mcl-bdzahl="PBL-46"[^>]*>2×|data-mcl-bdzahl="PBL-46"[^>]*>2×/.test(html),
        'die Zahl im Deck steht nicht an der Karte:\n' + html);
    assert.ok(!/data-mcl-bdzahl="PBL-46"[^>]*hidden/.test(html),
        'der Zaehler ist verborgen, obwohl zwei Karten im Deck liegen');
});

test('eine ACE SPEC ist an der Kachel erkennbar', () => {
    const { binderKarteHtml } = ladeKachel();
    assert.ok(binderKarteHtml(karte({ ace: true }), 'alle').includes('mcl-bd-ace'));
    assert.ok(!binderKarteHtml(karte({}), 'alle').includes('mcl-bd-ace'));
});

test('Tims Kopienzahl steht an der Karte, und eine alte Liste sieht anders aus', () => {
    const { binderKarteHtml } = ladeKachel();
    const k = karte({ set: 'TEF', nummer: '113' });
    const jetzt = binderKarteHtml(k, 'alle', { 'TEF-113': 4 }, { 'TEF-113': 4 });
    assert.ok(jetzt.includes('mcl-bd-tim'), 'Tims Zahl fehlt an der Karte');
    assert.ok(!/mcl-bd-tim[^>]*data-alt="1"/.test(jetzt),
        'eine Karte aus Tims AKTUELLER Liste ist als alt gekennzeichnet');
    const alt = binderKarteHtml(k, 'alle', { 'TEF-113': 4 }, {});
    assert.ok(/mcl-bd-tim[^>]*data-alt="1"/.test(alt),
        'eine Karte aus einer aelteren Liste ist nicht unterschieden');
    assert.ok(!binderKarteHtml(k, 'alle', {}, {}).includes('mcl-bd-tim'),
        'Tims Marke steht da, obwohl er die Karte nicht spielt');
});

test('der Deckblock und der Deckbau haben Regeln im Stilblatt', () => {
    ['.mcl-bd-zaehler', '.mcl-bd-plus', '.mcl-bd-minus', '.mcl-bd-deck',
     '.mcl-bd-dwarn', '.mcl-bd-tim', '.mcl-bd-ace', '.mcl-bd-grp']
        .forEach((k) => assert.ok(CSS.includes(k), `Regel fehlt: ${k}`));
});

test('die neuen Beschriftungen gibt es in beiden Sprachen', () => {
    const schluessel = ['binderSortStandard', 'binderNurTim', 'binderDeck', 'binderPlus',
        'binderMinus', 'binderDeckSpeichern', 'binderDeckKopieren', 'binderDeckLeeren',
        'binderWarn60', 'binderWarnAce', 'binderWarnBasis', 'binderGrpStadium',
        'binderGrpSpecialEnergy', 'binderGrpBasicEnergy', 'binderGespeichert'];
    const de = JS.slice(JS.indexOf('de: {'), JS.indexOf('en: {'));
    const en = JS.slice(JS.indexOf('en: {'));
    schluessel.forEach((k) => {
        assert.ok(new RegExp('\\b' + k + ':').test(de), `deutsch fehlt: ${k}`);
        assert.ok(new RegExp('\\b' + k + ':').test(en), `englisch fehlt: ${k}`);
    });
});

test('die Standardsortierung ist die Voreinstellung', () => {
    /* Der Betreiber baut hier sein Deck; eine Deckliste liest man in
     * dieser Reihenfolge. */
    const quelle = schneideFunktion(JS, 'binderStandNeu');
    const ktx = { assert };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    const stand = vm.runInContext('binderStandNeu()', ktx);
    assert.strictEqual(stand.sort, 'standard');
    assert.strictEqual(stand.meta, 'alle');
    assert.strictEqual(stand.nurTim, false);
});

/* ── 8 · Der Deckblock ────────────────────────────────────────────────
 *
 * „Ich möchte insgesamt einfach einfach und Komfortable mein finales Deck
 * bauen mit allem was dazu gehört, vor allem mit allen Informationen die
 * ich brauche." (Betreiber, 25.09.2026)
 *
 * Also: die Zahl gegen 60, die Regelverstoesse benannt, der Kartenwert —
 * und kein erfundener Preis.
 */

function ladeDeckblock(deckKarten, mappe) {
    const namen = ['binderDeckHtml', 'binderDeckKachelHtml', 'binderDeckText',
        'binderDeckKarten', 'binderMappeIndex', 'binderZahl', 'binderDruck', 'deckBauer'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const roh = /var BINDER_GRUPPEN = (\[[^\]]*\]);/.exec(JS);
    const txt = /var BINDER_GRUPPE_TXT = (\{[^}]*\});/.exec(JS);
    assert.ok(roh && txt, 'Gruppenlisten nicht im Quelltext gefunden');
    const ktx = {
        assert,
        esc: (s) => String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        T: (k) => k,
        bildAdresse: (druck) => 'https://example.invalid/' + String(druck || '') + '.png',
        BINDER_GRUPPEN: JSON.parse(roh[1].replace(/'/g, '"')),
        BINDER_GRUPPE_TXT: JSON.parse(txt[1].replace(/'/g, '"').replace(/([,{]\s*)([a-zA-Z-]+)(\s*:)/g, '$1"$2"$3')),
        binderDaten: { probe: { karten: mappe } },
        window: {
            ProfileDeckBuilder: {
                addCopies: () => ({ hinzugefuegt: 0 }),
                countOf: () => 0,
                getDeck: () => ({ name: '', cards: deckKarten })
            }
        }
    };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    return {
        html: vm.runInContext('binderDeckHtml', ktx),
        text: vm.runInContext('binderDeckText', ktx)
    };
}

const G = { id: 'probe', titel: 'Mega-Stalobor-ex' };

test('ein leeres Deck sagt, was das + tut — und rechnet nichts', () => {
    const { html } = ladeDeckblock([], []);
    const s = html(G);
    assert.ok(s.includes('binderDeckLeer'), 'kein Hinweis am leeren Deck:\n' + s);
    assert.ok(!/\d+\s*binderDeckZahl/.test(s), 'am leeren Deck steht eine Kartenzahl');
});

test('der Deckblock zaehlt gegen 60 und benennt die Regelverstoesse', () => {
    const mappe = [
        karte({ name: 'Drilbur', set: 'PBL', nummer: '46', gruppe: 'pokemon' }),
        karte({ name: 'Secret Box', set: 'TWM', nummer: '163', gruppe: 'item', ace: true }),
        karte({ name: 'Prime Catcher', set: 'TEF', nummer: '157', gruppe: 'item', ace: true })
    ];
    const deck = [
        { set: 'PBL', number: '46', name_en: 'Drilbur', type: 'Basic', count: 4 },
        { set: 'TWM', number: '163', name_en: 'Secret Box', type: 'Item', count: 1 },
        { set: 'TEF', number: '157', name_en: 'Prime Catcher', type: 'Item', count: 1 }
    ];
    const s = ladeDeckblock(deck, mappe).html(G);
    assert.ok(/>6 binderDeckZahl</.test(s), 'die Kartenzahl fehlt oder ist falsch:\n' + s);
    assert.ok(s.includes('binderWarn60'), 'sechs Karten sind kein Deck — das muss dastehen');
    assert.ok(s.includes('binderWarnAce'), 'zwei ACE SPEC werden nicht beanstandet');
    assert.ok(!s.includes('binderWarnBasis'),
        'Basis-Pokemon sind da, trotzdem wird sie beanstandet');
});

test('ohne Basis-Pokemon steht der dritte Verstoss da', () => {
    const mappe = [karte({ name: 'Iono', set: 'PAL', nummer: '185', gruppe: 'supporter' })];
    const deck = [{ set: 'PAL', number: '185', name_en: 'Iono', type: 'Supporter', count: 4 }];
    const s = ladeDeckblock(deck, mappe).html(G);
    assert.ok(s.includes('binderWarnBasis'));
});

test('der Kartenwert summiert nur, was einen Preis hat — und sagt, wie viele keinen haben', () => {
    const mappe = [
        karte({ name: 'A', set: 'PBL', nummer: '1', gruppe: 'pokemon', preis: { eur: 2.5 } }),
        karte({ name: 'B', set: 'PBL', nummer: '2', gruppe: 'pokemon', preis: null })
    ];
    const deck = [
        { set: 'PBL', number: '1', name_en: 'A', type: 'Basic', count: 2 },
        { set: 'PBL', number: '2', name_en: 'B', type: 'Basic', count: 3 }
    ];
    const s = ladeDeckblock(deck, mappe).html(G);
    assert.ok(s.includes('5,00'), 'zweimal 2,50 € sind 5,00 € — die Summe fehlt:\n' + s);
    assert.ok(/3 binderDeckOhnePreis/.test(s),
        'die drei Karten ohne Preis werden nicht benannt — dann sieht die Summe '
        + 'vollstaendig aus, ist es aber nicht');
});

test('die Deckliste als Text steht in der Standardreihenfolge', () => {
    const mappe = [
        karte({ name: 'Metal Energy', set: 'SVI', nummer: '134', gruppe: 'basic-energy' }),
        karte({ name: 'Iono', set: 'PAL', nummer: '185', gruppe: 'supporter' }),
        karte({ name: 'Drilbur', set: 'PBL', nummer: '46', gruppe: 'pokemon' })
    ];
    const deck = [
        { set: 'SVI', number: '134', name_en: 'Metal Energy', count: 8 },
        { set: 'PAL', number: '185', name_en: 'Iono', count: 3 },
        { set: 'PBL', number: '46', name_en: 'Drilbur', count: 4 }
    ];
    const zeilen = ladeDeckblock(deck, mappe).text(G).split('\n');
    assert.deepStrictEqual(zeilen, [
        '4 Drilbur PBL 46',
        '3 Iono PAL 185',
        '8 Metal Energy SVI 134'
    ]);
});

test('der Deckblock traegt die Knoepfe zum Speichern, Kopieren und Leeren', () => {
    const mappe = [karte({ name: 'A', set: 'PBL', nummer: '1', gruppe: 'pokemon' })];
    const deck = [{ set: 'PBL', number: '1', name_en: 'A', type: 'Basic', count: 1 }];
    const s = ladeDeckblock(deck, mappe).html(G);
    ['data-mcl-bdspeichern', 'data-mcl-bdkopieren', 'data-mcl-bdleeren', 'data-mcl-bddeckname']
        .forEach((a) => assert.ok(s.includes(a), `${a} fehlt im Deckblock:\n` + s));
});

/* ── 9 · Basis-Energien und Deckzeilen ────────────────────────────────
 *
 * BEFUNDE (Betreiber, 25.09.2026, am Bildschirmfoto der offenen Mappe):
 *
 *   „für Basis Metal brauchen wir nicht verschiede Prints zeigen, eins
 *    reicht"
 *   „beim Deckbau auch noch die möglichkeit mehr kopien einer Karte
 *    zulassen und natürlich auch kleine Bilder anzeigen. Wie im Deck
 *    Builder feature halt"
 */

test('die weiteren Drucke einer Basis-Energie stehen an der Kachel, nicht als eigene', () => {
    const { binderKarteHtml } = ladeKachel();
    const energie = karte({
        name: 'Metal Energy', name_de: 'Metall-Energie', set: 'MEE', nummer: '8',
        gruppe: 'basic-energy',
        weitere_drucke: [
            { set: 'MEE', nummer: '16', listen_mit_karte: 42, schnitt: 15.94 },
            { set: 'EVO', nummer: '98', listen_mit_karte: 8, schnitt: 17.25 }
        ]
    });
    const html = binderKarteHtml(energie, 'alle');
    assert.ok(html.includes('mcl-bd-weitere'), 'die weiteren Drucke werden verschwiegen:\n' + html);
    assert.ok(/\+2 binderWeitereDruckeMz/.test(html), 'die ZAHL der weiteren Drucke fehlt');
    assert.ok(/MEE-16: 42/.test(html), 'der Hinweis nennt den weiteren Druck nicht mit seiner Zahl');
    /* Und keine Summe: 2592 + 42 + 8 waeren 2642 bei 2641 Listen. */
    assert.ok(!html.includes('2642'), 'die Listenzahlen wurden addiert — das zaehlt Listen doppelt');

    const ohne = binderKarteHtml(karte({ gruppe: 'basic-energy' }), 'alle');
    assert.ok(!ohne.includes('mcl-bd-weitere'),
        'eine Energie ohne weitere Drucke traegt trotzdem die Marke');
});

test('eine Deckkachel zeigt das Kartenbild und laesst eine Kopie mehr zu', () => {
    const mappe = [karte({
        name: 'Drilbur', set: 'PBL', nummer: '46', gruppe: 'pokemon',
        bild: 'https://example.invalid/pbl046.png'
    })];
    const deck = [{ set: 'PBL', number: '46', name_en: 'Drilbur', name_de: 'Rotomurf',
        type: 'Basic', count: 3 }];
    const s = ladeDeckblock(deck, mappe).html(G);
    assert.ok(s.includes('city-league-card-image'), 'kein Kartenbild an der Deckkachel:\n' + s);
    assert.ok(s.includes('https://example.invalid/pbl046.png'),
        'das Bild der Mappe wird nicht genommen');
    assert.ok(/data-mcl-bdplus1="PBL-46"/.test(s),
        'aus dem Deck heraus laesst sich keine Kopie mehr hinzufuegen');
    assert.ok(/data-mcl-bdminus="PBL-46"/.test(s), 'das − fehlt');
    assert.ok(/data-mcl-bddruck="PBL-46"/.test(s), 'das Artwork laesst sich nicht tauschen');
    /* Die Kachel traegt die Klassen des Deckbauers — nichts davon ist
     * hier neu gebaut, und das Stilblatt dafuer steht in
     * css/ui-components.css. */
    ['card-item', 'city-league-card-item', 'city-league-card-image-container',
     'city-league-card-badge-deck', 'city-league-card-info-bottom',
     'city-league-card-action-row', 'city-league-card-action-btn']
        .forEach((k) => assert.ok(s.includes(k), `Klasse des Deckbauers fehlt: ${k}`));
    assert.ok(/card-grid[^>]*data-size=/.test(s),
        'die Kacheln stehen nicht im Kartenraster, sondern wieder untereinander');
});

test('das Plus in der Deckzeile legt GENAU eine Karte hinein', () => {
    /* Das + an der Kachel legt die Durchschnittsmenge hinein; das + in
     * der Zeile ist die Feinjustierung. Wuerden beide dasselbe tun,
     * waere die Zeile unbrauchbar. */
    const quelle = schneideFunktion(JS, 'binderPlus');
    const gerufen = [];
    const ktx = {
        assert,
        deckBauer: () => ({ addCopies: (k, n) => { gerufen.push(n); return { hinzugefuegt: n }; } }),
        binderMappeIndex: () => ({ 'PBL-46': karte({}) }),
        binderMenge: () => 4,
        binderDeckKarte: (k) => k,
        binderStand: {},
        binderStandNeu: () => ({ meta: 'alle', sort: 'standard', nurTim: false }),
        binderZaehlerNachziehen: () => {},
        binderMeldung: () => {},
        T: (k) => k
    };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    const binderPlus = vm.runInContext('binderPlus', ktx);
    binderPlus({}, { id: 'probe' }, 'PBL-46');       // Kachel
    binderPlus({}, { id: 'probe' }, 'PBL-46', 1);    // Deckzeile
    assert.deepStrictEqual([...gerufen], [4, 1]);
});

test('die Deckkacheln haben ihre eigenen Regeln, der Rest kommt vom Deckbauer', () => {
    ['.mcl-bd-dgitter', '.mcl-bd-dkachel', '.mcl-bd-weitere']
        .forEach((k) => assert.ok(CSS.includes(k), `Regel fehlt: ${k}`));
    /* Die Regeln der alten Zeilendarstellung duerfen nicht liegen
     * bleiben — tote Regeln sind die naechste Fehlersuche. */
    ['.mcl-bd-dbild', '.mcl-bd-plus1', '.mcl-bd-dgrps']
        .forEach((k) => assert.ok(!CSS.includes(k + ' ') && !CSS.includes(k + ','),
            `Regel der alten Deckzeile steht noch im Stilblatt: ${k}`));
});

test('Basis-Pokemon werden gezaehlt, auch mit Elementbuchstabe davor', () => {
    /* BEFUND (25.09.2026, live): der Deckblock meldete „Ohne
     * Basis-Pokémon ist das Deck nicht spielbar", waehrend drei
     * Rotomurf drin lagen — die Mappe fuehrte als Kartenart die grobe
     * Spalte „pokemon". Seitdem steht dort die feine Art; der Bestand
     * schreibt sie teils mit Elementbuchstabe (MBasic, DBasic). */
    const mappe = [
        karte({ name: 'Drilbur', set: 'PBL', nummer: '46', gruppe: 'pokemon', typ: 'Basic' }),
        karte({ name: 'Metang', set: 'TEF', nummer: '114', gruppe: 'pokemon', typ: 'Stage 1' }),
        karte({ name: 'Beldum', set: 'TEF', nummer: '113', gruppe: 'pokemon', typ: 'MBasic' }),
        karte({ name: 'Metal Energy', set: 'MEE', nummer: '8', gruppe: 'basic-energy', typ: 'Basic Energy' })
    ];
    const deck = [
        { set: 'PBL', number: '46', name_en: 'Drilbur', count: 3 },
        { set: 'TEF', number: '114', name_en: 'Metang', count: 4 },
        { set: 'TEF', number: '113', name_en: 'Beldum', count: 4 },
        { set: 'MEE', number: '8', name_en: 'Metal Energy', count: 8 }
    ];
    const s = ladeDeckblock(deck, mappe).html(G);
    assert.ok(!s.includes('binderWarnBasis'),
        'Basis-Pokemon sind da (Drilbur, Beldum), werden aber nicht gezaehlt:\n' + s);

    /* Der Elementbuchstabe allein: Beldum traegt „MBasic", sonst ist
     * kein Basis-Pokemon im Deck. Eine Pruefung auf Gleichheit
     * (`typ === 'basic'`) sieht es nicht. */
    const nurM = ladeDeckblock([deck[2], deck[3]], [mappe[2], mappe[3]]).html(G);
    assert.ok(!nurM.includes('binderWarnBasis'),
        '„MBasic" wird nicht als Basis-Pokemon erkannt:\n' + nurM);

    /* Gegenprobe: nur Stage 1 und Energie — dann fehlt es wirklich. */
    const ohne = ladeDeckblock(
        [deck[1], deck[3]], [mappe[1], mappe[3]]).html(G);
    assert.ok(ohne.includes('binderWarnBasis'),
        'ohne Basis-Pokemon bleibt der Hinweis aus — dann prueft er nichts');
});

/* ── 10 · Das Artwork tauschen ────────────────────────────────────────
 *
 * BEFUND (Betreiber, 25.09.2026, Bildschirmaufnahme): „Wir haben hier
 * schon den Deck-Builder-Bereich. Da haben wir auch den Deckbau gebaut,
 * um dann die Artworks austauschen zu können und die Mengen verändern zu
 * können mit Plus und Minus … den sollst du einfach in dem Bereich ‚Mein
 * Deck' in der Masterclass beim Cardbinder nachbauen."
 *
 * Der Druckschalter ist gebaut (js/app-cards-db.js). Geprueft wird, dass
 * der Cardbinder IHN nimmt und den Tausch danach im Deck vollzieht — und
 * dass er dabei nicht in die drei fremden Decks greift.
 */

function ladeTausch(deckKarten, mappe) {
    const namen = ['binderDruckTauschen', 'binderDeckKarten', 'binderMappeIndex', 'binderDruck', 'deckBauer'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const rufe = [];
    let deck = deckKarten.slice();
    const ktx = {
        assert, T: (k) => k,
        binderDaten: { probe: { karten: mappe } },
        binderZaehlerNachziehen: () => rufe.push(['nachziehen']),
        binderMeldung: (w, t) => rufe.push(['meldung', t]),
        window: {
            ProfileDeckBuilder: {
                addCopies: (k, n) => { rufe.push(['add', k.set + '-' + k.number, n]); return { hinzugefuegt: n }; },
                removeOne: (s) => rufe.push(['remove', s]),
                countOf: () => 0,
                getDeck: () => ({ cards: deck })
            }
        }
    };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    return { fn: vm.runInContext('binderDruckTauschen', ktx), rufe };
}

test('der Tausch zieht ALLE Kopien des alten Drucks auf den neuen um', () => {
    const mappe = [karte({ name: 'Drilbur', set: 'PBL', nummer: '46', gruppe: 'pokemon', typ: 'Basic' })];
    const deck = [{ set: 'PBL', number: '46', name_en: 'Drilbur', name_de: 'Rotomurf',
        type: 'Basic', count: 3 }];
    const { fn, rufe } = ladeTausch(deck, mappe);
    fn({}, { id: 'probe' }, 'PBL-46', 'PBL', '103');

    const raus = rufe.filter((r) => r[0] === 'remove');
    assert.strictEqual(raus.length, 3, 'es wurden nicht alle drei Kopien herausgenommen');
    raus.forEach((r) => assert.strictEqual(r[1], 'PBL-46'));
    const rein = rufe.filter((r) => r[0] === 'add');
    assert.strictEqual(rein.length, 1, 'der neue Druck wird nicht in EINEM Zug gelegt');
    assert.deepStrictEqual([...rein[0]], ['add', 'PBL-103', 3]);
    assert.ok(rufe.some((r) => r[0] === 'nachziehen'), 'die Kacheln werden nicht nachgezogen');
    assert.ok(rufe.some((r) => r[0] === 'meldung' && /PBL-46/.test(r[1]) && /PBL-103/.test(r[1])),
        'der Tausch wird nicht gemeldet:\n' + JSON.stringify(rufe));
});

test('derselbe Druck ist kein Tausch', () => {
    const mappe = [karte({ set: 'PBL', nummer: '46' })];
    const deck = [{ set: 'PBL', number: '46', name_en: 'Drilbur', count: 3 }];
    const { fn, rufe } = ladeTausch(deck, mappe);
    fn({}, { id: 'probe' }, 'PBL-46', 'PBL', '46');
    assert.deepStrictEqual(rufe, [], 'es wurde etwas getan, obwohl sich nichts aendert');
});

test('eine Karte, die nicht im Deck liegt, wird nicht getauscht', () => {
    const mappe = [karte({ set: 'PBL', nummer: '46' })];
    const { fn, rufe } = ladeTausch([], mappe);
    fn({}, { id: 'probe' }, 'PBL-46', 'PBL', '103');
    assert.deepStrictEqual(rufe, []);
});

test('passt nicht alles, wird das gesagt statt verschluckt', () => {
    /* Zwei Drucke derselben Karte koennen zusammen mehr als vier
     * Kopien halten. Beim Zusammenlegen greift die Spielregel — und
     * was nicht passt, muss dastehen. */
    const mappe = [karte({ set: 'PBL', nummer: '46' })];
    const deck = [{ set: 'PBL', number: '46', name_en: 'Drilbur', count: 6 }];
    const namen = ['binderDruckTauschen', 'binderDeckKarten', 'binderMappeIndex', 'binderDruck', 'deckBauer'];
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const rufe = [];
    const ktx = {
        assert, T: (k) => k,
        binderDaten: { probe: { karten: mappe } },
        binderZaehlerNachziehen: () => {},
        binderMeldung: (w, t) => rufe.push(t),
        window: {
            ProfileDeckBuilder: {
                addCopies: () => ({ hinzugefuegt: 4, grenze: true }),
                removeOne: () => {}, countOf: () => 0,
                getDeck: () => ({ cards: deck })
            }
        }
    };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    vm.runInContext('binderDruckTauschen', ktx)({}, { id: 'probe' }, 'PBL-46', 'PBL', '103');
    assert.ok(rufe.length === 1 && /binderDruckRest/.test(rufe[0]),
        'dass zwei Kopien nicht mitgekommen sind, steht nirgends:\n' + JSON.stringify(rufe));
});

test('der Cardbinder nimmt den vorhandenen Druckschalter — und faellt nicht in fremde Decks', () => {
    const quelle = schneideFunktion(JS, 'binderDruckSchalter');
    const gerufen = [];
    const ktx = {
        assert, T: (k) => k,
        binderMappeIndex: () => ({ 'PBL-46': karte({ name: 'Drilbur', set: 'PBL', nummer: '46' }) }),
        binderDeckKarten: () => [],
        binderDruckWartet: {},
        window: { openRaritySwitcher: (...a) => gerufen.push(a) }
    };
    vm.createContext(ktx);
    vm.runInContext(quelle, ktx);
    vm.runInContext('binderDruckSchalter', ktx)({}, { id: 'probe' }, 'PBL-46');
    assert.strictEqual(gerufen.length, 1, 'der vorhandene Schalter wird nicht gerufen');
    const [name, deckKey, quelleHinweis, ziel] = gerufen[0];
    assert.strictEqual(name, 'Drilbur');
    assert.strictEqual(deckKey, 'Drilbur (PBL 46)');
    assert.strictEqual(quelleHinweis, '',
        'ein Quellenhinweis wuerde den Schalter in cityLeague/currentMeta/pastMeta suchen lassen');
    assert.strictEqual(ziel, 'staples',
        'ohne den Nur-Anzeige-Weg tauscht der Schalter in einem FREMDEN Deck');
    /* Und er merkt sich, worauf die Antwort gehoert. */
    assert.strictEqual(vm.runInContext('binderDruckWartet.probe', ktx), 'PBL-46');
});
