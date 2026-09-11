/**
 * Die Meistgespielten je Kartenart — und warum die Liste kürzer sein darf
 * ======================================================================
 *
 * GEMELDET am 10.09.2026: "koennen wir Most played noch mal also Option
 * geben Top 10 Pokemon, Top 10 Supporter, Top 10 Items, Top 10 Tools,
 * Top 10 Stadion und Top 10 Special Energie. Wichtig ist hier nicht
 * einfach immer Top 10 zu zeigen wenn halt nur 3 relevant sind dann halt
 * auch nur 3 Anzeigen."
 *
 * DAS IST DER KERN. Diese Liste zeigt nicht die haeufigsten Karten,
 * sondern die Karten, die VIELE ARCHETYPEN teilen — der Prozentwert
 * unter jeder Karte ist der Anteil der Archetypen. Eine Liste, die immer
 * auf zehn auffuellt, behauptet zehn geteilte Karten, wo es zwei gibt.
 *
 * DIE SCHWELLE: 25 % der Archetypen, vom Betreiber gewaehlt. Gemessen an
 * data/current_meta_card_data.csv, Stand 10.09.2026 (62 Archetypen,
 * 519 verschiedene Karten ohne Basis-Energie):
 *
 *     Pokemon 17 · Item 17 · Supporter 14 · Stadion 4 · Energie 3 · Tool 2
 *
 * Zum Vergleich, damit die Wahl nachvollziehbar bleibt: bei 10 % kaeme
 * fast jede Art auf volle zehn (Pokemon 50, Item 32, Supporter 25), bei
 * 50 % blieben Stadion und Spezial-Energie ganz leer.
 *
 * WAS HIER GEPRUEFT WIRD — und was NICHT
 * --------------------------------------
 * Geprueft wird die AUSWAHLREGEL an gesetzten Daten: Schwelle, Deckel,
 * Reihenfolge, und dass eine leere Art keinen Knopf bekommt.
 *
 * NICHT geprueft wird, ob heute genau 17 Pokemon ueber der Schwelle
 * liegen. Das ist ein Wochenwert; er steht oben als Beleg fuer die Wahl
 * der Schwelle, nicht als Zusicherung. Eine Zusicherung darauf waere
 * genau die Bauart, an der der Deploy in diesem Projekt schon zweimal
 * hing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-tier-meta.js'), 'utf8');

/** Einen Block woertlich aus der Quelle schneiden. */
function schneide(start, ende) {
    const a = QUELLE.indexOf(start);
    assert.ok(a > -1, 'Anker nicht gefunden: ' + start);
    const b = QUELLE.indexOf(ende, a);
    assert.ok(b > a, 'Endanker nicht gefunden: ' + ende);
    return QUELLE.slice(a, b);
}

/* Die Auswahlregeln aus der echten Datei — Konstanten und beide
   Funktionen, woertlich. Keine Nachbildung: eine Kopie der Regel hier
   wuerde gruen bleiben, waehrend die Seite etwas anderes tut. */
const REGELN = schneide('const STAPLES_ART_SCHWELLE', 'function staplesAnzahl()');

function lade() {
    const kasten = { Number, String, Object, Array, Math, localStorage: null };
    vm.createContext(kasten);
    vm.runInContext(REGELN + `
        this._schwelle = STAPLES_ART_SCHWELLE;
        this._max = STAPLES_ART_MAX;
        this._arten = STAPLES_ARTEN;
        this._waehle = staplesNachArt;
        this._zaehl = staplesArtZaehlung;`, kasten);
    return kasten;
}

/** Gesetzte Karten: Name, Art, Anteil der Archetypen. */
function karte(name, type, share) {
    return { name, type, global_share: share, deck_inclusion_count: 9 };
}

describe('Die Auswahlregel je Kartenart', () => {
    const R = lade();

    it('die sechs Arten des Betreibers sind da, in seiner Reihenfolge — und ACE SPEC dahinter', () => {
        /* Am 11.09.2026 kam eine siebte Schaltflaeche dazu, und sie ist
           bewusst KEINE siebte Kartenart: ACE SPEC waehlt ueber ein
           Kennzeichen aus und schneidet die anderen sechs, statt sie
           auszuschliessen (Item, Ausruestung, Stadion, Spezial-Energie).
           Deshalb steht sie hinten, und deshalb prueft die Schleife
           darunter `typen` nur fuer die sechs. */
        assert.deepEqual(R._arten.map(a => a.id),
            ['pokemon', 'supporter', 'item', 'tool', 'stadion', 'energie', 'ace']);
        R._arten.forEach(a => {
            assert.ok(a.de && a.en, 'Beschriftung fehlt bei ' + a.id);
            if (a.kennzeichen) {
                assert.ok(!a.typen,
                    a.id + ' waehlt ueber ein Kennzeichen UND ueber Typen — eines von beidem');
                return;
            }
            assert.ok(Array.isArray(a.typen) && a.typen.length, 'keine Typen bei ' + a.id);
        });
    });

    it('Pokémon fasst alle Stufen, nicht nur Basic', () => {
        /* Sonst faende "Top 10 Pokémon" keine Stage-1- und
           Stage-2-Karten — und genau die sind die Angreifer, um die es
           in einem Deck geht. */
        const p = R._arten.filter(a => a.id === 'pokemon')[0].typen;
        ['Basic', 'Stage 1', 'Stage 2'].forEach(t => {
            assert.ok(p.indexOf(t) !== -1, 'Pokémon-Art kennt "' + t + '" nicht');
        });
    });

    it('unter der Schwelle faellt raus, darueber bleibt drin', () => {
        const s = R._schwelle;
        const daten = [
            karte('knapp drueber', 'Item', s),
            karte('knapp drunter', 'Item', s - 0.1),
            karte('deutlich drueber', 'Item', 90)
        ];
        const treffer = R._waehle(daten, 'item').map(c => c.name);
        assert.deepEqual(treffer, ['knapp drueber', 'deutlich drueber'],
            'Die Schwelle ist einschliesslich (>=), und darunter wird nichts gezeigt.');
    });

    it('hoechstens zehn, auch wenn es mehr gaebe', () => {
        const daten = [];
        for (let i = 0; i < 25; i++) daten.push(karte('K' + i, 'Item', 90 - i));
        assert.equal(R._waehle(daten, 'item').length, R._max);
    });

    it('WENIGER als zehn, wenn es weniger gibt — das ist der ganze Punkt', () => {
        const daten = [
            karte('Air Balloon', 'Tool', 71),
            karte('Hero’s Cape', 'Tool', 42),
            karte('Randnotiz', 'Tool', 3)
        ];
        const treffer = R._waehle(daten, 'tool');
        assert.equal(treffer.length, 2,
            'Die Liste darf NICHT auf zehn aufgefuellt werden. Der Prozentwert '
            + 'ist der Anteil der Archetypen — zehn Zeilen behaupten zehn '
            + 'geteilte Karten, wo es zwei gibt.');
    });

    it('eine Art ganz ohne Treffer gibt ein leeres Feld, keinen Rueckfall', () => {
        const daten = [karte('Nur eine Randkarte', 'Stadium', 5)];
        assert.deepEqual(R._waehle(daten, 'stadion'), [],
            'Bei null Treffern darf nicht heimlich auf eine andere Art '
            + 'ausgewichen werden.');
    });

    it('eine unbekannte Art liefert leer statt zu werfen', () => {
        assert.deepEqual(R._waehle([karte('x', 'Item', 90)], 'gibtsnicht'), []);
    });

    it('die Zaehlung nennt jede Art, auch die leeren', () => {
        const daten = [karte('Ultra Ball', 'Item', 94), karte('Air Balloon', 'Tool', 71)];
        const z = R._zaehl(daten);
        assert.equal(z.item, 1);
        assert.equal(z.tool, 1);
        assert.equal(z.stadion, 0,
            'Eine leere Art muss in der Zaehlung als 0 stehen — die '
            + 'Knopfzeile entscheidet daran, ob sie den Knopf weglaesst.');
        assert.equal(Object.keys(z).length, R._arten.length);
    });

    it('die Reihenfolge der Daten bleibt die Reihenfolge der Liste', () => {
        /* Die Daten kommen nach global_share absteigend sortiert an
           (calculateGlobalCardStats). Wird hier noch einmal sortiert,
           entstehen zwei Sortierregeln fuer dieselbe Liste. */
        const daten = [karte('A', 'Item', 90), karte('B', 'Item', 80), karte('C', 'Item', 70)];
        assert.deepEqual(R._waehle(daten, 'item').map(c => c.name), ['A', 'B', 'C']);
    });
});

describe('Die Knopfzeile im Widget', () => {
    const WIDGET = schneide('function renderTopCardsWidget(topCards)',
                            '\n        async function ');

    function render(art, daten) {
        const attrappen = {
            t: (k) => k,
            getLang: () => 'de',
            fmtPct: (v) => String(v) + '%',
            escapeHtml: (s) => String(s == null ? '' : s),
            escapeJsStr: (s) => String(s == null ? '' : s),
            escapeHtmlAttr: (s) => String(s == null ? '' : s),
            ladeStaplesAnzahl: () => 15,
            staplesAnzahl: () => 15,
            STAPLES_STUFEN: [15, 30],
            ladeStaplesArt: () => art,
            staplesArt: () => art,
            staplesNachArt: (d, id) => lade()._waehle(d, id),
            staplesArtZaehlung: (d) => lade()._zaehl(d),
            STAPLES_ARTEN: lade()._arten,
            /* Seit dem 11.09.2026 trifft EINE Funktion die Auswahl fuer
               das Markup und fuer die Bilder — vorher liefen beide
               auseinander und die Kacheln zeigten fremde Bilder
               (tests/unit/test-staples-bild-und-name.js). Die Attrappe
               bildet sie mit denselben Attrappen nach. */
            staplesAuswahl: (d) => (art ? lade()._waehle(d, art) : (d || []).slice(0, 15))
        };
        return new Function(...Object.keys(attrappen),
            WIDGET + '\nreturn renderTopCardsWidget;')(...Object.values(attrappen))(daten);
    }

    const DATEN = [
        karte('Night Stretcher', 'Item', 100),
        karte('Boss’s Orders', 'Supporter', 95),
        karte('Air Balloon', 'Tool', 71),
        karte('Randkarte', 'Stadium', 4)
    ];

    it('eine Art ohne Treffer bekommt keinen Knopf', () => {
        const html = render(null, DATEN);
        assert.ok(/setStaplesArt\('item'\)/.test(html), 'Item fehlt');
        assert.ok(/setStaplesArt\('tool'\)/.test(html), 'Tool fehlt');
        assert.ok(!/setStaplesArt\('stadion'\)/.test(html),
            'Stadion hat keine Karte ueber der Schwelle und darf keinen Knopf '
            + 'bekommen. Ein Knopf auf eine leere Liste ist die Enttaeuschung, '
            + 'die diese Aenderung vermeiden soll.');
        assert.ok(!/setStaplesArt\('energie'\)/.test(html), 'Energie darf fehlen');
    });

    it('die Zahl steht am Knopf, damit "2" nicht wie ein Fehler aussieht', () => {
        const html = render(null, DATEN);
        assert.match(html, /top-cards-artzahl/);
    });

    it('"Alle" ist ohne Auswahl aktiv, mit Auswahl nicht', () => {
        assert.match(render(null, DATEN), /setStaplesArt\(null\)"[^>]*>Alle/);
        const ohne = render(null, DATEN);
        const mit = render('item', DATEN);
        assert.ok(/aria-pressed="true"[^>]*onclick="setStaplesArt\(null\)"|onclick="setStaplesArt\(null\)"/.test(ohne));
        assert.ok(mit.indexOf('active') !== -1, 'die gewaehlte Art muss markiert sein');
    });

    it('bei gewaehlter Art verlieren die Stufen 15/30 ihre Markierung', () => {
        /* Sonst stuende "Top 15" aktiv ueber einer Liste mit zwei
           Karten — eine Beschriftung, die der Liste widerspricht. */
        const mit = render('tool', DATEN);
        assert.ok(!/class="btn-toggle-item active" id="staplesAnzahl-15"/.test(mit),
            'Top 15 darf bei gewaehlter Art nicht als aktiv markiert sein.');
    });

    it('die gewaehlte Art bestimmt, welche Karten gezeichnet werden', () => {
        const nurTool = render('tool', DATEN);
        assert.ok(nurTool.indexOf('Air Balloon') !== -1);
        assert.ok(nurTool.indexOf('Night Stretcher') === -1,
            'Ein Item darf in der Tool-Liste nicht auftauchen.');
    });
});
