/**
 * Bild und Name derselben Kachel gehoeren zu DERSELBEN Karte.
 *
 * BEFUND (Betreiber, 11.09.2026, mit Bildschirmfoto): nach dem
 * Umschalten der Kartenart auf "Pokémon" standen unter den Kacheln die
 * richtigen Namen — Shaymin, Meowth ex, Fezandipiti ex, Budew — und
 * darueber die Bilder von Night Stretcher, Boss's Orders, Lillie's
 * Determination, Poké Pad. Also die Karten der UNGEFILTERTEN Liste.
 *
 * URSACHE
 * -------
 * Die Auswahl wurde an zwei Stellen getroffen:
 *
 *   renderTopCardsWidget()  zeichnet die Kacheln  -> beruecksichtigte die Art
 *   staplesListe()          liefert die Bilder    -> tat es NICHT
 *
 * und zeichneStaplesBilderNeu() paart beide **nach Position**:
 * `liste[i]` zur i-ten Kachel. Solange beide dieselbe Auswahl trafen,
 * ging das gut. Am 10.09.2026 kam die Artenzeile dazu und nur die eine
 * Seite wurde nachgezogen — von da an bekam jede Kachel das Bild einer
 * fremden Karte. Dieselbe Liste speist auch die Bildkarte
 * (staplesBildErzeugen), also stand es auch dort falsch.
 *
 * WAS DIESER TEST FESTHAELT
 * -------------------------
 * Nicht den Bauplan, sondern die Zusicherung: die Namen in der Reihe
 * der Kacheln und die Namen in staplesListe() sind dieselben, in
 * derselben Reihenfolge — mit und ohne Filter. Beide werden woertlich
 * aus js/app-tier-meta.js geschnitten; wer die Auswahl wieder
 * auseinanderlaufen laesst, faellt hier auf.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');

function schneide(kopf, bis) {
    const a = SRC.indexOf(kopf);
    const b = SRC.indexOf(bis, a);
    assert.ok(a > -1 && b > a, `Schnitt fehlgeschlagen: ${kopf}`);
    return SRC.slice(a, b);
}

const AUSWAHL = schneide('function staplesAuswahl(daten)', '\n        /** Wie viele Karten');
const NACH_ART = schneide('function staplesNachArt(daten, artId)', '\n        /** Wie viele Karten');
const WIDGET = schneide('function renderTopCardsWidget(topCards)',
                        '/**\n         * Render and inject Top Cards Widget');
const LISTE = schneide('function staplesListe()', '\n        /* Der guenstigste Druck');

/* Die echten Arten aus der Quelle — nicht abgeschrieben, sonst prueft
   der Test seine eigene Kopie. */
const ARTEN = (() => {
    const a = SRC.indexOf('const STAPLES_ARTEN = [');
    const b = SRC.indexOf('\n        ];', a);
    assert.ok(a > -1 && b > a, 'STAPLES_ARTEN nicht gefunden');
    return new Function(SRC.slice(a, b + 10) + '\nreturn STAPLES_ARTEN;')();
})();
const SCHWELLE = (() => {
    const m = /const STAPLES_ART_SCHWELLE\s*=\s*(\d+)/.exec(SRC);
    assert.ok(m, 'STAPLES_ART_SCHWELLE nicht gefunden');
    return Number(m[1]);
})();
const ART_MAX = (() => {
    const m = /const STAPLES_ART_MAX\s*=\s*(\d+)/.exec(SRC);
    assert.ok(m, 'STAPLES_ART_MAX nicht gefunden');
    return Number(m[1]);
})();

/* Ein Feld, in dem die ersten Plaetze Trainer sind und die Pokemon
   dahinter stehen — genau die Lage aus dem Bildschirmfoto. */
function karten() {
    const arr = [
        { name: 'Night Stretcher',        type: 'Item',      global_share: 100.0, deck_inclusion_count: 60, set_code: 'ASC', set_number: '196' },
        { name: "Boss's Orders",          type: 'Supporter', global_share: 96.8,  deck_inclusion_count: 58, set_code: 'ASC', set_number: '183' },
        { name: "Lillie's Determination", type: 'Supporter', global_share: 90.3,  deck_inclusion_count: 56, set_code: 'ASC', set_number: '192' },
        { name: 'Shaymin',                type: 'Basic',     global_share: 80.6,  deck_inclusion_count: 50, set_code: 'JTG', set_number: '10' },
        { name: 'Meowth ex',              type: 'Basic',     global_share: 77.4,  deck_inclusion_count: 48, set_code: 'MEG', set_number: '77' },
        { name: 'Fezandipiti ex',         type: 'Basic',     global_share: 77.4,  deck_inclusion_count: 48, set_code: 'SFA', set_number: '38' },
        { name: 'Munkidori',              type: 'Basic',     global_share: 48.4,  deck_inclusion_count: 30, set_code: 'TWM', set_number: '95' },
        { name: 'Poké Pad',               type: 'Item',      global_share: 45.0,  deck_inclusion_count: 28, set_code: 'ASC', set_number: '198' },
    ];
    arr.totalArchetypes = 62;
    return arr;
}

/* Der Sandkasten fuehrt die drei echten Funktionen zusammen aus, mit
   einem echten _staplesArt — genau das, was auf der Seite passiert. */
function bau(art, anzahl) {
    let _staplesArt = art;
    const attrappen = {
        t: (k) => k,
        getLang: () => 'de',
        fmtPct: (v) => String(v) + '%',
        escapeHtml: (s) => String(s == null ? '' : s),
        /* escapeJsStr muss hier WIRKLICH schuetzen: "Boss's Orders"
           steht in einem einfach gequoteten onclick-Argument. Eine
           Identitaets-Attrappe zerlegt den Aufruf und der Test liest
           danach "Boss" statt "Boss's Orders" — ein Fehler, den es auf
           der Seite nicht gibt. */
        escapeJsStr: (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
        escapeHtmlAttr: (s) => String(s == null ? '' : s),
        STAPLES_STUFEN: [15, 30],
        STAPLES_ARTEN: ARTEN,
        STAPLES_ART_SCHWELLE: SCHWELLE,
        STAPLES_ART_MAX: ART_MAX,
        ladeStaplesAnzahl: () => anzahl,
        staplesAnzahl: () => anzahl,
        ladeStaplesArt: () => _staplesArt,
        staplesArt: () => _staplesArt,
        staplesArtZaehlung: () => ({}),
        /* Die Druckwahl ist hier nicht die Sache: sie gibt den Druck
           aus der Karte zurueck, damit der Vergleich die AUSWAHL misst
           und nicht die Bildaufloesung. */
        staplesDruckFuer: (card) => ({
            set: String(card.set_code || ''), number: String(card.set_number || ''),
            url: 'bild/' + card.name,
        }),
        STAPLES_DRUCK: 'min',
        _staplesDaten: null,
    };
    const fabrik = new Function(...Object.keys(attrappen),
        NACH_ART + AUSWAHL + WIDGET + LISTE +
        '\nreturn { render: renderTopCardsWidget, liste: staplesListe,' +
        '  setzeDaten: (d) => { _staplesDaten = d; } };');
    const g = fabrik(...Object.values(attrappen));
    return g;
}

/* Die Namen in der Reihenfolge, in der die Kacheln stehen. Gelesen
   wird das Attribut, das der Stern-Knopf traegt — es ist die einzige
   Stelle, an der der Kartenname unverkuerzt im Markup steht. */
function namenAusMarkup(html) {
    const out = [];
    const re = /openRaritySwitcherFromDB\('((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[1].replace(/\\(.)/g, '$1'));
    return out;
}

describe('Top-Karten: die Kachel zeigt das Bild ihrer eigenen Karte', () => {

    it('ohne Filter decken sich Markup und Bildliste', () => {
        const g = bau(null, 15);
        g.setzeDaten(karten());
        const imMarkup = namenAusMarkup(g.render(karten()));
        const inListe = g.liste().map(x => x.name);
        assert.deepEqual(inListe, imMarkup);
    });

    it('mit dem Filter "Pokémon" decken sie sich auch — der gemeldete Fall', () => {
        const g = bau('pokemon', 15);
        g.setzeDaten(karten());
        const imMarkup = namenAusMarkup(g.render(karten()));
        const inListe = g.liste().map(x => x.name);
        assert.deepEqual(inListe, imMarkup,
            'Bild und Name laufen wieder auseinander. Genau so sah es am '
            + '11.09.2026 auf der Seite aus: unter dem Bild von Night Stretcher '
            + 'stand "Shaymin".');
        // Vorpruefung: der Filter greift ueberhaupt, sonst misst der
        // Vergleich oben zwei identische ungefilterte Listen.
        assert.ok(imMarkup.length > 0, 'der Filter liefert nichts — dann prueft der Vergleich nichts');
        assert.ok(!imMarkup.includes('Night Stretcher'),
            'ein Item steht unter dem Pokémon-Filter — der Filter greift nicht');
        assert.ok(imMarkup.includes('Shaymin'), 'Shaymin fehlt unter dem Pokémon-Filter');
    });

    it('jede Art fuer sich: Markup und Bildliste bleiben deckungsgleich', () => {
        for (const a of ARTEN) {
            const g = bau(a.id, 15);
            g.setzeDaten(karten());
            const imMarkup = namenAusMarkup(g.render(karten()));
            const inListe = g.liste().map(x => x.name);
            assert.deepEqual(inListe, imMarkup, 'Art ' + a.id);
        }
    });

    it('die Bildliste haelt sich an den Filter, nicht an die Stufe', () => {
        /* Der eigentliche Fehler in einem Satz: staplesListe() nahm
           `daten.slice(0, staplesAnzahl())` — die Stufe 15/30 — und sah
           die Art nie. */
        const g = bau('supporter', 15);
        g.setzeDaten(karten());
        const namen = g.liste().map(x => x.name);
        assert.deepEqual(namen, ["Boss's Orders", "Lillie's Determination"]);
    });
});
