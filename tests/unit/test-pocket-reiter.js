/**
 * Der Reiter "Side Quest · Pokémon TCG Pocket" — die Verdrahtung.
 *
 * WAS HIER GEPRUEFT WIRD
 * ----------------------
 * Nicht die Darstellung (die ist am 07.09.2026 im Browser geklickt
 * worden: 33 Zeilen, sechs Stufen, Vollbild mit Muster, Dunkelmodus,
 * kein Querscrollen), sondern die vier Stellen, an denen ein neuer
 * Reiter in dieser SPA still ausfaellt:
 *
 *   1. `case 'pocket':` in app-core.js — fehlt er, bleibt der Reiter
 *      beim Tiefllink leer. Genau das ist am 26.08.2026 mit
 *      #side-quest passiert ("Teams komplett leer, waehrend 81 Teams
 *      geladen waren"), und der Kommentar dort protokolliert es.
 *   2. Ein Eintrag in HASH_ALIASES — fehlt er, steigt applyHash()
 *      WORTLOS aus. Der Selbstverweis 'pocket' -> 'pocket' ist noetig,
 *      damit kanonischerHash() eine teilbare Adresse zurueckschreibt.
 *   3. Die neuen Dateien in SHELL_ASSETS — fehlen sie, wird
 *      test-service-worker-shell.js rot und `build`/`deploy`
 *      uebersprungen.
 *   4. Schluessel in BEIDEN Woerterbuechern von i18n.js.
 *
 * Dazu die eine Farbentscheidung, die kein Thema kennt: das QR-Feld ist
 * hart weiss mit schwarzen Modulen. Ein invertierter QR ist nicht
 * verlaesslich scannbar, und der Scan ist der Zweck des Reiters.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const HTML = lies('index.html');
const SW = lies('service-worker.js');
const CORE = lies('js/app-core.js');
const INIT = lies('js/inline-init.js');
const I18N = lies('js/i18n.js');
const CSS = lies('css/ds-pocket.css');
const JS = lies('js/ds-pocket.js');
const NAV = lies('js/ds-nav.js');

describe('Pocket-Reiter: im Dokument', () => {
    it('der Reiter existiert und startet NICHT aktiv', () => {
        const m = HTML.match(/<div id="pocket"([^>]*)>/);
        assert.ok(m, '<div id="pocket"> fehlt in index.html');
        assert.match(m[1], /class="tab-content"/,
            'der Reiter traegt nicht die Klasse tab-content');
        assert.doesNotMatch(m[1], /\bactive\b/,
            'der neue Reiter startet aktiv — test-startseite-meta.js zaehlt, ' +
            'dass genau EINE Ansicht active traegt');
    });

    it('er hat einen Menueintrag mit i18n-Schluessel', () => {
        assert.match(HTML, /id="menu-btn-pocket"[^>]*data-tab-id="pocket"/,
            'der Menueintrag fehlt — und der Betreiber sucht den Reiter im Menue');
        assert.match(HTML, /id="menu-btn-pocket"[^>]*data-i18n="menu\.pocket"/,
            'der Menueintrag haengt an keinem i18n-Schluessel');
    });

    it('die Flaeche fuer das Vollbild ist da und verborgen', () => {
        const m = HTML.match(/<div id="pocketOverlay"([^>]*)>/);
        assert.ok(m, '#pocketOverlay fehlt');
        assert.match(m[1], /\bhidden\b/, 'das Vollbild ist beim Laden sichtbar');
        assert.match(m[1], /role="dialog"/, 'das Vollbild ist kein Dialog');
    });

    it('die drei neuen Dateien werden mit Versionsstempel geladen', () => {
        ['js/qr-svg.js', 'js/ds-pocket.js', 'css/ds-pocket.css'].forEach(f => {
            const re = new RegExp(f.replace(/[/.]/g, '\\$&') + '\\?v=\\d+');
            assert.match(HTML, re,
                `${f} wird ohne ?v= geladen — eine spaetere Korrektur haengt dann ` +
                `im HTTP-Cache fest (bump-version.sh fasst nur gestempelte Pfade an)`);
        });
    });

    it('qr-svg.js steht VOR ds-pocket.js', () => {
        // Beide sind defer, laufen also in Dokumentreihenfolge. ds-pocket
        // ruft window.qrSvg beim Oeffnen des Vollbilds — das ist spaet
        // genug, aber die Reihenfolge festzuhalten kostet nichts und
        // haelt sie stabil, falls jemand defer entfernt.
        assert.ok(HTML.indexOf('js/qr-svg.js') < HTML.indexOf('js/ds-pocket.js'));
    });
});

describe('Pocket-Reiter: die vier stillen Ausfaelle', () => {
    it('app-core kennt den Fall und ruft den Renderer', () => {
        const i = CORE.indexOf("case 'pocket':");
        assert.notEqual(i, -1,
            "case 'pocket' fehlt im switch von app-core — der Tiefllink #pocket " +
            'zeichnet dann einen leeren Reiter (Ausfall vom 26.08.2026)');
        assert.match(CORE.slice(i, i + 900), /window\.dsPocket[\s\S]{0,140}render\(\)/,
            'der Fall ruft nicht window.dsPocket.render()');
    });

    it('HASH_ALIASES enthaelt den Selbstverweis', () => {
        assert.match(INIT, /'pocket':\s*'pocket'/,
            "ohne 'pocket': 'pocket' steigt applyHash wortlos aus und " +
            'kanonischerHash schreibt keine teilbare Adresse zurueck');
    });

    it('kein Alias ist doppelt vergeben', () => {
        // Am 18.08.2026 standen 'metacall' und 'meta-call' zweimal im
        // selben Objektliteral; der spaetere gewann, und #meta-call
        // landete im Profil.
        const block = INIT.slice(INIT.indexOf('const HASH_ALIASES = {'));
        const ende = block.indexOf('\n    };');
        const schluessel = [...block.slice(0, ende).matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]);
        const doppelt = schluessel.filter((s, i) => schluessel.indexOf(s) !== i);
        assert.deepStrictEqual(doppelt, [], `doppelte Aliasse: ${doppelt.join(', ')}`);
    });

    it('die neuen Dateien stehen in SHELL_ASSETS', () => {
        ['./js/qr-svg.js', './js/ds-pocket.js', './css/ds-pocket.css'].forEach(f => {
            assert.ok(SW.includes(`'${f}'`),
                `${f} fehlt in SHELL_ASSETS — test-service-worker-shell.js wird rot ` +
                'und der Deploy wird uebersprungen');
        });
    });

    it('die i18n-Schluessel stehen in BEIDEN Woerterbuechern', () => {
        ['menu.pocket', 'aria.pocketMuster'].forEach(k => {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length;
            assert.equal(n, 2,
                `'${k}' steht ${n}-mal in i18n.js — es braucht genau einen Eintrag ` +
                'je Sprache, sonst faellt die Sprachreinheitspruefung darueber');
        });
    });
});

describe('Pocket-Reiter: die Farbentscheidung und die Leiste', () => {
    it('das QR-Feld nimmt keine Farbe aus einem Token', () => {
        const i = CSS.indexOf('.pk-qr {');
        assert.notEqual(i, -1, '.pk-qr fehlt');
        const block = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(block, /background:\s*#ffffff/,
            'der Grund des QR-Felds ist nicht hart weiss');
        assert.doesNotMatch(block, /var\(--/,
            'eine Farbe kommt aus einem Token — im Dunkelmodus kippt das Muster, ' +
            'und ein invertierter QR ist nicht verlaesslich scannbar');
    });

    it('das Vollbild respektiert den Sicherheitsbereich unten', () => {
        const i = CSS.indexOf('.pk-overlay {');
        const block = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(block, /env\(safe-area-inset-bottom/,
            'ohne env(safe-area-inset-bottom) liegt der Schliessen-Knopf auf dem ' +
            'Home-Indikator');
        assert.match(block, /z-index:\s*10001/,
            'das Vollbild liegt nicht ueber der unteren Leiste (die hat 900)');
    });

    it('Deck-Namen stehen in einem span, nicht in Ueberschrift oder Verweis', () => {
        // sprachreinheit.yml prueft sichtbaren Text in h1..h5, label,
        // button und a auf Sprachreinheit. Deck-Namen sind zwangslaeufig
        // englisch (Game8s Bezeichnungen).
        assert.match(JS, /<span class="pk-name">/,
            'der Deck-Name steht nicht in einem span');
        assert.doesNotMatch(JS, /<h[1-5][^>]*>'\s*\+\s*esc\(d\.name\)/,
            'ein Deck-Name steht in einer Ueberschrift — sprachreinheit.yml liest ' +
            'h1..h5 als Oberflaechentext, und der Name ist zwangslaeufig englisch');
        assert.match(JS, /role="heading" aria-level="2"/,
            'das Vollbild hat keine Ueberschrift mehr — die Rolle muss bleiben, ' +
            'auch wenn kein h-Element mehr benutzt wird');
    });

    it('pocket ist eine EIGENE Gruppe, nicht Teil von Champions', () => {
        /* UMGEDREHT AM 15.09.2026, auf Ansage des Betreibers: "den Platz
           den wir dadurch gewinnen können wir dann neben Champions noch
           Pocket anzeigen."

           Die Zusicherung stand hier vorher andersherum ("pocket steht
           NICHT in den Gruppen"). Sie war richtig fuer den Fehler, den
           sie meinte — am 07.09.2026 war Pocket der Gruppe `champions`
           zugeschlagen, und beim Betreten des Pocket-Reiters leuchtete
           unten CHAMPIONS. Sie war aber zu weit gefasst: verboten war
           nicht "pocket in GROUPS", sondern "pocket leuchtet als
           Champions".

           Genau das wird jetzt geprueft — und zwar so, dass ein
           Rueckfall auffliegt: Pocket hat eine eigene Kennung und einen
           eigenen Reiter, und die Champions-Gruppe traegt ihn nicht mit. */
        const i = NAV.indexOf('var GROUPS = [');
        const block = NAV.slice(i, NAV.indexOf('];', i));
        assert.match(block, /id:\s*'pocket',[\s\S]*?tabs:\s*\['pocket'\]/,
            'pocket fehlt als eigene Gruppe — dann gibt es ausserhalb des '
            + 'Pokeball-Menues wieder keinen sichtbaren Weg dorthin');
        const champ = /\{ id: 'champions'[\s\S]*?\}/.exec(block)[0];
        assert.doesNotMatch(champ, /pocket/,
            'die Champions-Gruppe traegt pocket wieder mit — dann leuchtet beim '
            + 'Betreten des Pocket-Reiters ein Knopf, der ein anderes Spiel benennt');
    });
});

describe('Pocket-Reiter: die Auflagen der Datei', () => {
    it('die Quelle wird angeschrieben, mit Datum aus _meta.abgerufen', () => {
        // _meta.quelle_hinweis verlangt es woertlich: "Die Oberflaeche
        // muss das anschreiben."
        assert.match(JS, /Einstufung von Game8, keine von uns gemessene Zahl/,
            'die Quellenzeile fehlt');
        assert.match(JS, /_meta[\s\S]{0,80}abgerufen|m\.abgerufen/,
            'das Datum kommt nicht aus _meta.abgerufen');
        assert.doesNotMatch(JS, /data_stand\.json/,
            'der Datenstand kommt aus data_stand.json — das laeuft nur woechentlich ' +
            'und stempelt den Laufzeitpunkt statt des Abrufs');
    });

    it('die fehlenden Decks und die Rechnung stehen in der Fusszeile', () => {
        assert.match(JS, /ohne_code/, '_meta.ohne_code wird nicht gelesen');
        assert.match(JS, /zusammengelegt/, '_meta.zusammengelegt wird nicht gelesen');
        assert.match(JS, /uebersicht/, '_meta.uebersicht wird nicht gelesen');
    });

    it('ein Fehler beim Laden wird gemeldet, nicht verschwiegen', () => {
        // Stilles Nichts ist der schlimmste Zustand — der Nutzer liest
        // es als "kaputt". Der Service Worker reicht bei einem Netzfehler
        // ONLINE den Fehler durch, statt einen alten Stand zu liefern.
        assert.match(JS, /is-fehler/, 'es gibt keinen sichtbaren Fehlerzustand');
        assert.match(JS, /konnte nicht geladen werden/,
            'der Fehlerzustand hat keinen deutschen Text');
        assert.match(JS, /cache:\s*'no-store'/,
            "die Daten werden nicht mit cache: 'no-store' geholt");
    });

    it('faellt der QR-Erzeuger aus, kommt wenigstens der Code als Text', () => {
        assert.match(JS, /qrSvg/, 'der QR-Erzeuger wird nicht benutzt');
        assert.match(JS, /Das Muster ließ sich nicht zeichnen/,
            'ohne Rueckfall bleibt bei einem Fehler ein leeres weisses Feld stehen');
    });

    /* Die Geometrie des Rueckwegs.
     *
     * BEFUND (10.09.2026, am Telefon gemeldet): der Schliessknopf lag
     * unter der Statusleiste. Die Polsterung des Overlays beachtete
     * `env(safe-area-inset-bottom)`, aber NICHT den oberen Einzug —
     * jemand hat an Geraeteeinzuege gedacht und nur die Haelfte
     * behandelt. GEMESSEN mit Playwright bei 390 px: Oberkante des
     * Knopfes 20 px, bei einer Dynamic Island (59 px) also darunter.
     * Nach dem Umbau, mit nachgestelltem Einzug: 79 px, und beim
     * Scrollen bis ans Ende bleibt er dort. */
    it('die obere Leiste beachtet den Geraeteeinzug', () => {
        const block = CSS.slice(CSS.indexOf('.pk-leiste {'),
                                CSS.indexOf('.pk-schliessen {'));
        assert.ok(block.length > 50, 'den Block .pk-leiste gibt es nicht');
        assert.match(block, /env\(safe-area-inset-top/,
            'die Leiste beachtet den oberen Geraeteeinzug nicht — dann '
            + 'liegt der Schliessknopf am Telefon unter der Statusleiste');
        assert.match(block, /position:\s*sticky/,
            'die Leiste klebt nicht — dann scrollt der einzige Weg '
            + 'zurueck aus dem Bild');
        assert.match(block, /top:\s*0/, 'ohne top greift sticky nicht');
    });

    it('das Overlay traegt oben KEINE eigene Polsterung mehr', () => {
        /* Sonst schoebe sie die klebende Leiste nach unten, und der
           Bereich unter der Statusleiste bliebe unbedeckt — Inhalt
           wuerde beim Scrollen daran vorbeilaufen. */
        const block = CSS.slice(CSS.indexOf('.pk-overlay {'),
                                CSS.indexOf('.pk-overlay[hidden]'));
        const polster = block.match(/padding:\s*([^;]+);/);
        assert.ok(polster, '.pk-overlay hat keine padding-Angabe mehr');
        assert.match(polster[1], /^0\s/,
            'die obere Polsterung ist zurueck: ' + polster[1].trim());
        assert.match(polster[1], /env\(safe-area-inset-bottom/,
            'der untere Geraeteeinzug ist verlorengegangen');
    });

    it('die Sprites setzen sich gegen die pauschalen Bildregeln durch', () => {
        /* BEFUND live am 10.09.2026, direkt nach dem ersten Deploy: die
           Bilder standen auf 0x0 px. Zwei fremde Regeln greifen auf
           genau diese Adressen:

             ui-components.css:20   img[src*="limitlesstcg"] { width: 100% }
             mobile-responsive.css  img { width: 100% } (<= 768 px)

           Der erste Selektor ist (0,1,1) und schlaegt die blanke Klasse
           .pk-sprite (0,1,0). `width: 100%` eines Elternteils ohne
           eigene Breite ergibt 0.

           Warum die Layout-Probe es nicht fand: sie ersetzte die Bilder
           durch lokale Dateien aus images/champions/ — und die tragen
           "limitlesstcg" nicht im Pfad. Die Ersetzung entfernte genau
           das Merkmal, an dem die fremde Regel haengt.

           css/archetype-icons.css loest dasselbe fuer .tcg-pokemon-icon
           und schreibt den Grund dort auf. Hier steht er auch. */
        const block = CSS.slice(CSS.indexOf('.pk-sprite {'),
                                CSS.indexOf('.pk-sprite + .pk-sprite'));
        assert.ok(block.length > 40, 'den Block .pk-sprite gibt es nicht');
        for (const feld of ['width', 'height', 'max-width', 'max-height']) {
            const m = block.match(new RegExp(feld + ':\\s*[^;]+;'));
            assert.ok(m, `.pk-sprite setzt ${feld} nicht`);
            assert.match(m[0], /!important/,
                `${feld} ohne !important — die pauschale Bildregel gewinnt `
                + 'dann wieder und das Sprite steht auf 0 px');
        }
    });

    it('die fremde Regel, gegen die das noetig ist, gibt es noch', () => {
        /* Faellt sie weg, ist das !important oben unnoetig und gehoert
           entfernt — die Zusicherung sagt dann, dass jemand nachsehen
           soll, statt es stillschweigend mitzuschleppen. */
        const ui = lies('css/ui-components.css');
        assert.match(ui, /img\[src\*="limitlesstcg"\]/,
            'die Regel img[src*="limitlesstcg"] ist verschwunden — dann '
            + 'gehoert das !important in ds-pocket.css ueberprueft');
    });

    it('die Zurueck-Geste des Telefons ist verdrahtet', () => {
        assert.match(JS, /addEventListener\('popstate'/,
            'ohne popstate-Zuhoerer verlaesst die Zurueck-Geste die ganze '
            + 'Anwendung, statt das Vollbild zu schliessen');
        assert.match(JS, /history\.pushState/,
            'ohne Verlaufseintrag gibt es nichts, wohin zurueckgegangen '
            + 'werden koennte');
    });
});
