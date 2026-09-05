'use strict';
/*
 * Wo der Bau und das Aggregat auseinandergehen — und warum beides stimmt.
 *
 * ANLASS (01.09.2026)
 * -------------------
 * Der Betreiber: „Für Mega Excadrill 18/28 Decks haben ein Stadion gespielt,
 * sprich Stadion an sich spielen ist schon ein Thema, aber bei Max consistency
 * Build ist kein Stadion drin."
 *
 * Beide Zahlen stimmten. Sie zaehlen nur Verschiedenes:
 *
 *     Bau       Praesenzlisten (Worlds)   3 von 8  = 37,5 %
 *     Aggregat  inkl. Online             18 von 28 = 64,3 %
 *
 * Zwei Grundgesamtheiten auf einem Bildschirm, und keine sagt, welche sie ist.
 *
 * WARUM DER BAU TROTZDEM NICHT GEAENDERT WURDE — zwei Messrunden:
 *
 *   1  Sechs Kategorie-Regeln durchgerechnet, gemessen an der Ueberschneidung
 *      mit der meistgespielten echten Liste. Heutiger Bau 56,92 von 60, beste
 *      Variante 56,50. Keine verbessert einen Archetyp, ohne anderswo mehr zu
 *      verlieren.
 *
 *   2  Die Gewichtung Praesenz-gegen-Online durchgefahren, k = 0 bis unendlich
 *      (Rueckhalte-Kreuzvalidierung, 99 Ziele, 9 Archetypen). Die Kurve ist
 *      FLACH: bester Wert 54,47 gegen heute 54,16, 95-%-Bootstrap-Intervall
 *      [-0,02; +0,67] — enthaelt die Null. Die zwei Online-Quellen setzen ihr
 *      Maximum an verschiedene Stellen (k = 1,5 und k = 3); bei einem echten
 *      Optimum staende es an derselben.
 *
 *   Und der entscheidende Satz: bei KEINEM k landet ein Stadion im Bau, auch
 *   nicht bei reinem Online. 15 Listen spielen eines, aber vier verschiedene;
 *   der Erwartungswert bleibt bei 0,8 Karten, die Aufnahmegrenze liegt bei
 *   38,9 %. Es ist kein Gewichtungsproblem.
 *
 * Also aendert sich nicht der Bau, sondern was danebensteht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');

const bau = lies(path.join('js', 'deck-builder-consistency.js'));
const ui  = lies(path.join('js', 'app-deck-builder.js'));

describe('Der Builder liefert die Kategorie-Deckung mit', () => {

    it('build() gibt sie zurueck', () => {
        assert.ok(/kategorien:\s*_kategorieDeckung\(lists, deck\)/.test(ohneKomm(bau)),
            'die Kategorie-Deckung fehlt in der Rueckgabe von build() — dann hat '
            + 'die Oberflaeche nichts zu zeigen');
    });

    it('sie zaehlt LISTEN, nicht Karten', () => {
        // "18 von 28 Decks spielen ein Stadion" ist eine Aussage ueber Listen.
        // Wer Karten zaehlt, bekommt eine andere Zahl und nennt sie gleich.
        const i = ohneKomm(bau).indexOf('function _kategorieDeckung');
        assert.ok(i > 0, '_kategorieDeckung ist verschwunden');
        const rumpf = ohneKomm(bau).slice(i, i + 1600);
        assert.ok(/new Set\(\)/.test(rumpf),
            'die Kategorien werden je Liste nicht mehr entdoppelt — dann zaehlt '
            + 'eine Liste mit vier Items viermal statt einmal');
        assert.ok(/listenMit \+= 1/.test(rumpf),
            'es wird nicht mehr je Liste hochgezaehlt');
    });

    it('der Kategorie-Schnitt folgt dem kanonischen Mapper', () => {
        // js/app-deck-builder.js:1725 getCardTypeCategory ist die Stelle, die
        // alle 30.459 Kartenzeilen trifft. Eine zweite Meinung darueber, was
        // ein Tool ist, waere genau die Sorte Widerspruch, um die es hier geht.
        const i = ohneKomm(bau).indexOf('function _kategorieDeckung');
        const rumpf = ohneKomm(bau).slice(i, i + 1600);
        for (const marke of ['special energy', 'Supporter', 'Item', 'Tool', 'Stadium']) {
            assert.ok(rumpf.indexOf(marke) > 0,
                `die Kategorie "${marke}" fehlt im Schnitt — dann faellt sie still `
                + 'unter Pokemon');
        }
        assert.ok(/special energy[\s\S]{0,120}indexOf\('energy'\)/.test(rumpf),
            'Spezial-Energie wird nicht mehr VOR der allgemeinen Energie geprueft — '
            + 'dann wird jede Spezial-Energie als Basis-Energie gezaehlt');
    });
});

describe('Die Zeile sagt, welche Zahl woher kommt', () => {

    const stelle = (() => {
        const i = ui.indexOf('const katAudit = []');
        assert.ok(i > 0, 'die Kategorie-Zeile ist aus der Oberflaeche verschwunden');
        // 05.09.2026 von 3000 auf 6000 erweitert: davor stand ein
        // Kommentarblock und die neue Meldung fuer den Fall, dass die
        // Typaufloesung nichts liefert (kats._unbestimmt).
        return ui.slice(i, i + 6000);
    })();

    it('beide Zahlen stehen mit ihrem Nenner da', () => {
        assert.ok(/Präsenz \$\{e\.listenMit\}\/\$\{e\.listen\}/.test(stelle),
            'die Praesenzseite steht nicht mehr als "x von y" da — eine Quote '
            + 'ohne Nenner ist auf dieser Seite der Fehler, aus dem alles folgt');
        assert.ok(/online ~\$\{mit\}\/\$\{onlineListen\}/.test(stelle),
            'die Online-Seite steht nicht mehr als "x von y" da');
    });

    it('die Online-Zahl ist als Naeherung gekennzeichnet', () => {
        // Online liegen nur Aggregate vor, keine Listen. Wer zwei Stadien
        // spielt, wird zweimal gezaehlt. Eine Zahl, die genauer aussieht als
        // sie ist, ist schlimmer als keine.
        assert.ok(/~\$\{mit\}/.test(stelle),
            'die Tilde vor der Online-Zahl fehlt — sie ist das einzige Zeichen '
            + 'auf der Flaeche, das sie von der exakten Praesenzzahl unterscheidet');
        assert.ok(/Näherung/.test(stelle),
            'der Hinweis nennt die Online-Zahl nicht mehr eine Näherung');
        assert.ok(/doppelt gezählt/.test(stelle),
            'der Hinweis sagt nicht mehr, WORIN die Näherung besteht');
    });

    it('die Online-Zahl wird auf die Listenzahl gedeckelt', () => {
        // Ohne Deckel steht dort "online ~34/28", und das liest sich wie ein
        // Rechenfehler statt wie eine Naeherung.
        assert.ok(/Math\.min\(roh, onlineListen\)/.test(stelle),
            'die Summe der Einzelanteile wird nicht mehr gedeckelt — sie kann '
            + 'ueber die Listenzahl hinauslaufen');
    });

    it('sie erscheint nur bei echter Abweichung', () => {
        // Sonst steht bei jedem Deck siebenmal dasselbe und niemand liest es.
        assert.ok(/Math\.abs\(pOnline - pMajor\) < 15/.test(stelle),
            'die Schwelle von 15 Prozentpunkten ist weg — gemessen trifft sie '
            + '5 von 63 Zellen, Ø 0,6 Zeilen je Bau. Ohne sie ist die Zeile Rauschen');
    });

    it('der Fall, der den Anstoss gab, wird als Warnung gezeigt', () => {
        // Kategorie ueber der Haelfte, gebaut null: genau Mega Excadrill.
        assert.ok(/e\.gebaut === 0 && pOnline >= 50 \? 'warn' : 'info'/.test(stelle),
            'eine Kategorie, die mehr als die Haelfte der Listen spielt und im '
            + 'Bau gar nicht vorkommt, wird nicht mehr hervorgehoben');
    });

    it('sie kann den Bau nicht umwerfen', () => {
        // Die Zeile ist Zusatz. Faellt sie aus, steht der Bau trotzdem.
        assert.ok(/catch \(_e\) \{[^}]*\}/.test(stelle),
            'die Kategorie-Zeile laeuft ohne Fangnetz — ein Fehler darin '
            + 'nimmt dann den ganzen Warum-Kasten mit');
    });
});

describe('Der Bau selbst bleibt unveraendert', () => {

    it('die Kategorie-Deckung greift nicht in die Auswahl ein', () => {
        // Der ganze Punkt: gemessen bringt keine Kategorie-Regel etwas, also
        // wird beobachtet, nicht eingegriffen. Wer das aendert, soll die
        // Messung dazu neu machen.
        const i = ohneKomm(bau).indexOf('function _kategorieDeckung');
        const ende = ohneKomm(bau).indexOf('\n  function ', i + 10);
        const rumpf = ohneKomm(bau).slice(i, ende > i ? ende : i + 2000);
        assert.ok(!/deck\.push|deck\.splice|\.count\s*=/.test(rumpf),
            '_kategorieDeckung veraendert das Deck — sie soll es nur auszaehlen. '
            + 'Gemessen schlaegt keine Kategorie-Regel den heutigen Bau '
            + '(56,92 gegen 56,50 von 60), und die Gewichtung ist flach '
            + '(Intervall [-0,02; +0,67] enthaelt die Null)');
    });

    it('die Messung steht als Begruendung im Code', () => {
        // Wer die Regel doch einbaut, soll erst lesen, was schon gemessen wurde.
        assert.ok(/flach|56,92|54,47/.test(bau),
            'die Messung, warum hier NICHT eingegriffen wird, ist aus dem Code '
            + 'verschwunden — dann baut der naechste Durchgang sie neu');
    });
});
