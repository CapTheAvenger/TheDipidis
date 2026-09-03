'use strict';
/*
 * Waehrend geladen wird, sieht man, dass geladen wird.
 *
 * ANLASS (03.09.2026). Betreiber: "wenn ich in Rotationen auf alle Turniere
 * dauert es etwas bis wirklich alle Turniere im Turnier-Filter geladen sind.
 * Das ist natuerlich voll okay, aber wir sollten irgendwie anzeigen, dass hier
 * gerade noch was geladen wird."
 *
 * DER FEHLER WAR NICHT DIE DAUER, SONDERN DIE STILLE. "-- Alle Formate --"
 * laedt 15 Auszuege nacheinander (gemessen). Bis der letzte durch ist, steht
 * im Turnier-Filter die Liste des VORHERIGEN Formats — sie sieht fertig aus.
 * Wer sein Turnier darin nicht findet, schliesst daraus, dass es fehlt.
 *
 * ZWEI DINGE, DIE DIE MESSUNG GEFUNDEN HAT und die man sich nicht ausdenkt:
 *
 *   1. Das durchsuchbare Deckfeld ist ein <div>, kein <select>. `disabled`
 *      auf dem versteckten <select> haelt es nicht auf: im Probelauf liess
 *      es sich waehrend des Ladens aufklappen und zeigte die halb gefuellte
 *      Deckliste — derselbe Fehler eine Spalte weiter. Deshalb zusaetzlich
 *      pointer-events (Maus) und tabIndex -1 (Tastatur).
 *
 *   2. Das FORMATFELD muss mitgesperrt werden. Ein zweiter Wechsel waehrend
 *      des Ladens startet einen zweiten Lauf; das `finally` des ersten
 *      raeumt die Anzeige weg, waehrend der zweite noch laeuft.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const PM = lies(path.join('js', 'app-past-meta.js'));
const HTML = lies('index.html');
const CSS = lies(path.join('css', 'styles.css'));
const I18N = lies(path.join('js', 'i18n.js'));
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '');
const PMK = ohneKomm(PM);

describe('die Anzeige existiert und haengt am Laden', () => {

    it('es gibt eine Stelle, an der sie stehen kann', () => {
        assert.match(HTML, /id="pastMetaLadestand"/,
            'die Zeile fuer den Ladestand fehlt im Markup');
        const block = HTML.slice(HTML.indexOf('id="pastMetaLadestand"') - 400,
                                HTML.indexOf('id="pastMetaLadestand"') + 200);
        assert.match(block, /aria-live="polite"/,
            'ohne aria-live bekommt ein Screenreader den Fortschritt nicht mit');
        assert.match(block, /\bhidden\b/,
            'die Zeile steht ohne hidden dauerhaft im Layout');
    });

    it('sie wird vor dem Laden an- und danach ausgeschaltet', () => {
        const anzahlAn = (PMK.match(/pastMetaLadestand\('an'/g) || []).length;
        const anzahlAus = (PMK.match(/pastMetaLadestand\('aus'\)/g) || []).length;
        assert.ok(anzahlAn >= 2,
            `nur ${anzahlAn} Aufrufe mit 'an' — beide Formatwechsel-Zweige `
            + '(mit und ohne Decks) muessen die Anzeige setzen');
        assert.ok(anzahlAus >= 2, `nur ${anzahlAus} Aufrufe mit 'aus'`);
    });

    it('das Freigeben steht in einem finally', () => {
        /* Bricht ein Auszug ab, waeren die Felder sonst dauerhaft gesperrt —
           aus "es laedt noch" wuerde "es geht nichts mehr". */
        const stellen = [...PMK.matchAll(/finally\s*\{[^}]*pastMetaLadestand\('aus'\)/g)];
        assert.ok(stellen.length >= 2,
            `nur ${stellen.length} von mindestens 2 Freigaben stehen in einem `
            + 'finally — ein Abbruch beim Laden liesse die Felder gesperrt zurueck');
    });
});

describe('der Fortschritt steht in Zahlen', () => {

    it('der Lader meldet jeden fertigen Auszug', () => {
        assert.match(PMK, /function streamPastMetaDeckIndex\([^)]*onFortschritt/,
            'der Streamer nimmt keinen Fortschritts-Rueckruf mehr entgegen');
        // Zwei Meldungen je Ladeweg (Start bei 0 und je fertigem Auszug),
        // zwei Wege: die angegebenen Auszuege und der Weg ueber das Manifest.
        const rufe = (PMK.match(/onFortschritt\(/g) || []).length;
        assert.ok(rufe >= 4,
            `nur ${rufe} Aufrufe von onFortschritt — beide Ladewege (die `
            + 'angegebenen Auszuege und der Weg ueber das Manifest) muessen melden');
        // Und der Zaehler muss WACHSEN, nicht konstant sein.
        assert.match(PMK, /fertig\+\+/, 'der Zaehler wird nicht mehr hochgezaehlt');
    });

    it('die Texte nennen Stand und Gesamtzahl, in beiden Sprachen', () => {
        const werte = (k) => I18N.split('\n')
            .map(z => z.match(/^\s*'([a-zA-Z0-9_.]+)':\s*'((?:[^'\\]|\\.)*)'\s*,\s*$/))
            .filter(m => m && m[1] === k)
            .map(m => m[2]);
        for (const k of ['pm.ladeFortschritt', 'pm.ladeDecks']) {
            const e = werte(k);
            assert.strictEqual(e.length, 2, `${k} fehlt in einer Sprache`);
            for (const s of e) {
                assert.ok(/\{n\}/.test(s) && /\{g\}/.test(s),
                    `${k} nennt nicht beide Zahlen: "${s}" — "laedt ..." ohne Ende `
                    + 'sieht nach Haenger aus, "3 von 15" nicht');
            }
        }
        // Und der Rueckfall fuer den Fall EINES Auszugs.
        for (const k of ['pm.ladeEinzeln', 'pm.ladeDecksEinzeln']) {
            assert.strictEqual(werte(k).length, 2, `${k} fehlt in einer Sprache`);
        }
    });

    it('das Deckfeld bekommt seinen eigenen Satz', () => {
        // Unter der Ueberschrift "Archetyp auswaehlen" ist "Turniere werden
        // geladen" die Antwort auf eine Frage, die dort niemand gestellt hat.
        const i = PMK.indexOf("anzeige.textContent");
        assert.ok(i > 0, 'das durchsuchbare Feld bekommt keinen Text mehr');
        assert.match(PMK.slice(i, i + 160), /pm\.ladeDecks/,
            'das Deckfeld zeigt wieder den Turnier-Satz');
    });
});

describe('gesperrt heisst wirklich gesperrt', () => {

    it('alle drei Felder werden gesperrt, auch das Formatfeld', () => {
        const i = PMK.indexOf('const felder =');
        assert.ok(i > 0, 'die Liste der zu sperrenden Felder ist weg');
        const zeile = PMK.slice(i, PMK.indexOf(';', i));
        for (const f of ['format', 'turnier', 'deck']) {
            assert.ok(zeile.indexOf(f) >= 0,
                `${f} wird nicht mehr mitgesperrt — beim Formatfeld heisst das: `
                + 'ein zweiter Wechsel startet einen zweiten Lauf, und das finally '
                + 'des ersten raeumt die Anzeige weg, waehrend der zweite laeuft');
        }
    });

    it('das durchsuchbare Feld laesst sich weder klicken noch antabben', () => {
        /* GEMESSEN, NICHT ANGENOMMEN: es ist ein <div>. `disabled` auf dem
           versteckten <select> haelt es nicht auf — im Probelauf klappte es
           waehrend des Ladens auf und zeigte die halb gefuellte Deckliste. */
        assert.match(CSS, /\.searchable-select-display\.pm-laedt\s*\{[^}]*pointer-events:\s*none/,
            'die Maus kommt wieder an das durchsuchbare Feld heran');
        assert.match(PMK, /anzeige\.tabIndex = -1/,
            'das Feld ist weiter mit der Tastatur erreichbar');
        assert.match(PMK, /anzeige\.tabIndex = 0/,
            'der Tastaturzugang wird nach dem Laden nicht wiederhergestellt');
        assert.match(PMK, /setAttribute\('aria-disabled', 'true'\)/,
            'ein Screenreader erfaehrt nicht, dass das Feld gerade nicht geht');
    });

    it('das Attribut hidden versteckt die Zeile wirklich', () => {
        /* LIVE GEFUNDEN AM 03.09.2026, in einem Bildschirmfoto bei 390 px —
           nachdem alle Zusicherungen gruen waren.

           Unter dem Turnier-Filter drehte sich ein Ladekreis, dauerhaft,
           ohne Text und ohne dass etwas geladen hat. `hidden` war korrekt
           gesetzt (die Messung sagte hidden=true), nur wirkungslos: das
           Attribut wirkt allein ueber die Voreinstellung des Browsers
           (`display: none`), und die verliert gegen JEDE Autorenregel mit
           `display`. `.pm-ladestand` setzt `display: flex` — also gewann
           flex, und der Ring drehte sich weiter.

           Gemessen vor dem Fix: hidden=true, display=flex, Hoehe 16 px.
           Danach: display=none, Hoehe 0. */
        assert.match(CSS, /\.pm-ladestand\[hidden\]\s*\{[^}]*display:\s*none/,
            'die Regel fuer [hidden] fehlt — dann steht der Ladekreis wieder '
            + 'dauerhaft unter dem Turnier-Filter, weil display:flex das '
            + 'Attribut schlaegt');
        // Und die Regel muss auch gewinnen: gleiche Spezifitaet, aber sie
        // steht als erste in der Datei. Deshalb !important, nicht Reihenfolge.
        const i = CSS.indexOf('.pm-ladestand[hidden]');
        assert.match(CSS.slice(i, CSS.indexOf('}', i)), /!important/,
            'ohne !important entscheidet die Reihenfolge im Stylesheet, und die '
            + 'ist beim naechsten Umsortieren eine andere');
    });

    it('die Anzeige nimmt ihre Farbe aus den Tokens', () => {
        /* Kein eigener Grauton. Genau so ist am 02.09.2026 ein Kontrast von
           3,42:1 entstanden — die Farbe stimmte gegen den Seitengrund und
           nicht gegen die Flaeche, auf der sie wirklich lag. */
        const i = CSS.indexOf('.pm-ladestand {');
        assert.ok(i > 0, 'die Regel fuer die Ladezeile fehlt');
        const rumpf = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(rumpf, /color:\s*var\(--ink-/,
            'die Ladezeile nimmt wieder eine feste Farbe statt eines Tokens');
    });

    it('wer keine Bewegung will, bekommt keine', () => {
        const i = CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)');
        assert.ok(i > 0, 'die Ruecksicht auf reduzierte Bewegung fehlt');
        assert.match(CSS.slice(i), /\.pm-ladestand::before\s*\{[^}]*animation:\s*none/,
            'der Ladekreis dreht sich auch dann, wenn der Nutzer Bewegung abgestellt hat');
    });
});
