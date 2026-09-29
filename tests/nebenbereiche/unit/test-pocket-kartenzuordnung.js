/**
 * GIBT ES EINE BELASTBARE ZUORDNUNG VON "POCKET-ID" AUF KARTENNAME?
 *
 * DIE MESSUNG ZUERST (10.09.2026)
 * -------------------------------
 * Gesucht wurde in js/ nach `pocket.*id` und `pk_id`. Ergebnis: es gibt
 * im ganzen Projekt KEINE Pocket-ID. Die Treffer waren durchweg etwas
 * anderes — `menu.pocket` (der Reitername) und "9-Pocket-Grid" (das
 * Binder-Layout, ein Sleeve-Raster). data/pocket_tierlist.json fuehrt
 * ebenfalls kein Feld "id", "card_id", "pk_id" oder "pocket_id"
 * (gezaehlt ueber den gesamten JSON-Text: je 0 Treffer).
 *
 * Was es STATTDESSEN gibt, ist eine Zuordnung ueber Set-Kuerzel und
 * Kartennummer. Gemessen ueber alle 33 Decks:
 *
 *   Karteneintraege (pokemon + trainer)   : 435
 *   verschiedene (set, nummer)            : 172
 *   Set-Kuerzel                           :  22 — A1..B4a (20 regulaere)
 *                                           plus die Promo-Sets P-A, P-B
 *   Nummern, die nicht rein numerisch sind:   0
 *   (set, nummer) mit MEHR als einem Namen:   0
 *   Eintraege ohne set oder ohne nummer   :   0
 *   Namen mit zwei Drucken                :   3
 *       Swablu (A4a/064, B1/196), Froakie (A1/087, B1/071),
 *       Alolan Vulpix (A3/040, B2/028)
 *
 * Die Zuordnung ist also EINDEUTIG in der Richtung, in der sie benutzt
 * wird: ein (Set, Nummer) traegt genau einen Namen. Die Gegenrichtung
 * ist mehrdeutig, aber das ist keine Luecke, sondern der Normalfall —
 * dieselbe Karte in zwei Sets.
 *
 * WARUM DAS UEBERHAUPT ZAEHLT
 * ---------------------------
 * js/ds-pocket.js zeichnet seit dem 10.09.2026 Sprites vor dem
 * Deck-Namen und loest dafuer aus dem Deck-NAMEN Pokemon auf. Der
 * Quelltext schreibt dort ausdruecklich "GERATEN WIRD NICHTS": ein
 * Pokemon bekommt nur dann ein Bild, wenn es im Deck-Namen steht UND
 * als Karte im Deck gefuehrt ist. Genau diese Karteliste ist die
 * Zuordnung, die hier gemessen wird. Traegt ein (Set, Nummer) zwei
 * Namen, ist die Grundlage der Aufloesung weg.
 *
 * WAS NICHT GEPRUEFT WIRD
 * -----------------------
 * Ob (Set, Nummer) auf die Karte zeigt, die die Quelle meint. Seit dem
 * Wechsel auf Limitless (29.09.2026) haelt
 * tests/nebenbereiche/python/test_pocket_limitless.py dafuer jeden Code
 * gegen seine Liste und die Kennungstabelle. Hier wird die INNERE
 * Stimmigkeit der Datei geprueft — dass sie sich nicht selbst
 * widerspricht.
 *
 * Ebenfalls NICHT geprueft: die Sprite-Aufloesung in js/ds-pocket.js
 * selbst. Die Datei wird gerade umgebaut (Sprites, Stand 10.09.2026);
 * ein Test auf ihren Wortlaut wuerde diesen Umbau behindern, ohne mehr
 * zu sichern als die Zusicherung hier.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..', '..');
const POCKET = JSON.parse(
    fs.readFileSync(path.join(WURZEL, 'data', 'pocket_tierlist.json'), 'utf8'));

function alleKarten() {
    const heraus = [];
    (POCKET.decks || []).forEach((d, di) => {
        for (const feld of ['pokemon', 'trainer']) {
            (d[feld] || []).forEach((k, ki) => {
                heraus.push({ ...k, _wo: `decks[${di}].${feld}[${ki}] (${d.name})` });
            });
        }
    });
    return heraus;
}

describe('es gibt keine Pocket-ID — die Zuordnung laeuft ueber Set und Nummer', () => {

    it('kein Karteneintrag traegt ein ID-Feld, das jemand fuer eine Kennung halten koennte', () => {
        /* Stuende hier eine "id", muesste jemand entscheiden, ob sie die
           Kennung ist oder nur eine laufende Nummer. Solange es sie
           nicht gibt, ist die Frage beantwortet. */
        const verdacht = [];
        for (const k of alleKarten()) {
            for (const f of ['id', 'card_id', 'pk_id', 'pocket_id']) {
                if (k[f] !== undefined) verdacht.push(`${k._wo}: ${f}`);
            }
        }
        assert.deepStrictEqual(verdacht, [],
            'es gibt jetzt doch ID-Felder. Dann muss jemand entscheiden, ob die '
            + 'Zuordnung ueber sie oder weiter ueber (set, nummer) laeuft:\n  '
            + verdacht.join('\n  '));
    });

    it('jeder Karteneintrag traegt Name, Set und Nummer — vollstaendig', () => {
        const luecken = [];
        for (const k of alleKarten()) {
            if (!String(k.name || '').trim())   luecken.push(`${k._wo}: kein name`);
            if (!String(k.set || '').trim())    luecken.push(`${k._wo}: kein set`);
            if (!String(k.nummer || '').trim()) luecken.push(`${k._wo}: keine nummer`);
        }
        assert.deepStrictEqual(luecken, [],
            'ohne Set oder Nummer ist der Eintrag nicht mehr nachschlagbar:\n  '
            + luecken.join('\n  '));
    });
});

describe('die Zuordnung widerspricht sich nicht selbst', () => {

    it('ein (Set, Nummer) traegt genau einen Namen', () => {
        /* DAS IST DIE EIGENTLICHE AUSSAGE. Traegt dieselbe Kartennummer
           zwei Namen, ist eine der beiden Angaben falsch — und welche,
           kann die Datei nicht sagen. Gemeldet, nicht repariert. */
        const nachSchluessel = new Map();
        for (const k of alleKarten()) {
            const s = `${k.set}/${k.nummer}`;
            if (!nachSchluessel.has(s)) nachSchluessel.set(s, new Map());
            nachSchluessel.get(s).set(k.name, k._wo);
        }
        const streit = [];
        for (const [s, namen] of nachSchluessel) {
            if (namen.size > 1) {
                streit.push(`${s} -> ${[...namen.keys()].join(' / ')}  (${[...namen.values()].join('; ')})`);
            }
        }
        assert.deepStrictEqual(streit, [],
            'dieselbe Kartennummer traegt verschiedene Namen. Eine der Angaben ist '
            + 'falsch, und die Datei sagt nicht welche:\n  ' + streit.join('\n  '));
    });

    it('die Nummern sehen aus wie Nummern und die Sets wie Sets', () => {
        const schief = [];
        for (const k of alleKarten()) {
            if (!/^\d{1,4}$/.test(String(k.nummer))) schief.push(`${k._wo}: nummer "${k.nummer}"`);
            /* Zwei Formen, beide am 10.09.2026 in der Datei gezaehlt:
               die 20 regulaeren Sets A1..B4a (Buchstabe, Zahl, optional
               ein kleiner Buchstabe) und die zwei Promo-Sets P-A und
               P-B. Andere Formen gab es nicht. */
            if (!/^[A-Z]\d+[a-z]?$/.test(String(k.set))
                && !/^P-[A-Z]$/.test(String(k.set))) schief.push(`${k._wo}: set "${k.set}"`);
        }
        assert.deepStrictEqual(schief, [],
            'Set oder Nummer haben eine andere Form als bisher — dann stimmt '
            + 'vermutlich die Zerlegung beim Einlesen nicht mehr:\n  ' + schief.join('\n  '));
    });

    it('jedes Deck fuehrt ueberhaupt Karten — sonst kann der Namensaufloeser nichts', () => {
        /* js/ds-pocket.js gibt einem Pokemon nur dann ein Bild, wenn es
           in der KARTENLISTE des Decks steht. Ein Deck ohne Karten
           bekommt also nie ein Bild — das darf sein, muss aber auffallen. */
        const leer = (POCKET.decks || [])
            .filter(d => !((d.pokemon || []).length))
            .map(d => d.name);
        assert.deepStrictEqual(leer, [],
            'diese Decks fuehren kein einziges Pokemon; der Namensaufloeser in '
            + 'js/ds-pocket.js kann fuer sie nichts finden: ' + leer.join(', '));
    });
});

describe('die Quelle der Pocket-Daten steht in der Datei', () => {

    it('Quelle, Adresse und Abrufdatum sind gefuehrt', () => {
        const m = POCKET._meta;
        assert.ok(m, 'kein _meta-Block');
        assert.ok(String(m.quelle || '').trim(), 'die Quelle ist nicht benannt');
        assert.match(String(m.quelle_url || ''), /^https?:\/\//, 'keine abrufbare Adresse');
        assert.ok(String(m.abgerufen || '').trim(), 'kein Abrufdatum');
    });

    it('die Stufe ist ausdruecklich als UNSERE Regel gekennzeichnet, die Regel steht dabei', () => {
        /* Seit 29.09.2026 (Limitless): Anteil und Siegquote sind gezaehlt,
           die Stufe ist unsere Regel darueber. Ohne diesen Hinweis liest
           sich die Stufe wie eine Angabe der Quelle. */
        assert.match(String(POCKET._meta.quelle_hinweis || ''), /UNSERE Regel/,
            'der Hinweis, dass die Stufe unsere Regel ist, fehlt');
        assert.ok((POCKET._meta.stufenregel || []).length, 'die Regel selbst fehlt');
    });
});
