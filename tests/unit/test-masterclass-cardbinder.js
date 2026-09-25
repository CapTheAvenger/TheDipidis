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

/* Eine Mappe, wie build_masterclass_cardbinder.py sie schreibt. */
const karte = (o) => Object.assign({
    name: 'Drilbur', name_de: 'Rotomurf', set: 'PBL', nummer: '46',
    gruppe: 'pokemon', bild: 'https://example.invalid/pbl046.png',
    preis: { eur: 0.04, eur_niedrig: 0.02, url: 'https://cardmarket.invalid/x', stand: '2026-09-24' },
    je_meta: {
        'TEF-PBL': { listen_mit_karte: 2631, listen_gesamt: 2641, anteil: 99.6, schnitt: 3.9, hoechstzahl: 4, turniere: 220 }
    },
    gesamt: { listen_mit_karte: 2631, listen_gesamt: 2641, anteil: 99.6 },
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
    const { binderSortiert } = lade('binderSortiert');
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
    const { binderSortiert } = lade('binderSortiert');
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
    const { binderSortiert } = lade('binderSortiert');
    const billig = karte({ name: 'billig', preis: { eur: 0.04 } });
    const teuer = karte({ name: 'teuer', preis: { eur: 31.5 } });
    const ohne = karte({ name: 'ohne', preis: null });
    const s = binderSortiert([billig, ohne, teuer], 'alle', 'preis').map((k) => k.name);
    assert.deepStrictEqual(s, ['teuer', 'billig', 'ohne']);
});

test('nach Name sortiert wird der DEUTSCHE Name genommen', () => {
    const { binderSortiert } = lade('binderSortiert');
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
    const { binderKarteHtml } = lade('binderKarteHtml', 'binderZahl');
    const html = binderKarteHtml(karte({ preis: null }), 'alle');
    assert.ok(!/\d[,.]\d\d\s*€|\\u20ac/.test(html.replace(/–/g, '')),
        'im HTML steht ein Betrag, obwohl kein Preis in den Daten ist:\n' + html);
    assert.ok(html.includes('mcl-bd-kein'), 'der fehlende Preis ist nicht als fehlend gekennzeichnet');
});

test('die Kachel zeigt den deutschen Namen und den Druck', () => {
    const { binderKarteHtml } = lade('binderKarteHtml', 'binderZahl');
    const html = binderKarteHtml(karte({}), 'alle');
    assert.ok(html.includes('Rotomurf'), 'der deutsche Name fehlt:\n' + html);
    assert.ok(html.includes('PBL-46'), 'der Druck fehlt:\n' + html);
    assert.ok(html.includes('2631'), 'die Zahl der Listen fehlt:\n' + html);
});

test('eine Karte ohne deutschen Namen behaelt den englischen', () => {
    const { binderKarteHtml } = lade('binderKarteHtml', 'binderZahl');
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
