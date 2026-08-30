'use strict';
/*
 * Drei UI-Befunde der Durchsicht vom 30.08.2026, alle am selben Tag
 * live gemessen.
 *
 * 1) KONTRAST DER GRUENEN KNOEPFE. Weisse Schrift auf dem Verlauf
 *    #2fac67 -> #1f9255 ergibt 2,91:1 am hellen und 3,96:1 am dunklen
 *    Ende. Beide unter 4,5. Betrifft .btn-secondary, .btn-green,
 *    .btn-gradient-green und .btn-modern.success — 19 Stellen im HTML
 *    plus die JS-erzeugten.
 *
 *    Das Aergerliche daran: der Rot-Ton daneben wurde am 29.08. aus
 *    genau diesem Grund korrigiert, und in css/tokens.css steht seit
 *    damals `--solid-ok: #1d7f46` mit dem Vermerk "weiss darauf
 *    5,03:1". Die flache Farbe war richtig, der Verlauf blieb falsch.
 *
 * 2) TIPPZIELE. 288 von 1206 klickbaren Elementen waren auf 390 px
 *    unter 44 x 44 px — keine Einzelfaelle, sondern eine Familie:
 *    Knoepfe, Auswahlfelder und Eingaben stehen ueber ein Dutzend
 *    Dateien verteilt auf min-height 36 oder 38 px.
 *
 * 3) DER PROXY-KOPF RAGTE UEBER DEN BILDSCHIRM. `.proxy-header-row`
 *    trug `margin: -14px`, waehrend mobile-responsive.css dem
 *    Container `padding: 0 !important` gab. Gemessen: 404 px breit bei
 *    einem Container von 364 px.
 *
 *    Auffaellig war es nie, und das ist der eigentliche Befund:
 *    `html`/`body` tragen `overflow-x: hidden`, der Ueberhang wird
 *    also weggeschnitten statt scrollbar. Ein Detektor ueber
 *    `scrollWidth` kann einen Ueberlauf hier grundsaetzlich nicht
 *    sehen — mit einem absichtlich 250 px zu breiten Element gemessen:
 *    scrollWidth waechst um 0.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');

const UX1    = lies('css/ux-step1.css');
const KOMP   = lies('css/components.css');
// Die 44-px-Regel steht in einer eigenen Datei: sie braucht
// !important, und components.css kommt ausdruecklich ohne aus
// (drei Zusicherungen bewachen das).
const TIPP   = lies('css/tippziele.css');
const UIC    = lies('css/ui-components.css');
const CITY   = lies('css/city-league.css');
const MOBILE = lies('css/mobile-responsive.css');
const I18N   = lies('js/i18n.js');

/** Kontrast nach WCAG. */
function leuchtdichte(hex) {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function kontrast(a, b) {
    const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
    return (hell + 0.05) / (dunkel + 0.05);
}

function token(css, name) {
    const m = css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
    assert.ok(m, `Token --${name} nicht gefunden`);
    return m[1];
}

describe('Weisse Schrift haelt 4,5:1 auf jedem Knopf-Verlauf', () => {
    // Alle Verlaufspaare, auf denen weisse Schrift steht.
    const PAARE = [
        ['ui-primary-start',   'ui-primary-end',   'blau (Hauptknopf)'],
        ['ui-secondary-start', 'ui-secondary-end', 'gruen (Bestaetigen)'],
        ['ui-danger-start',    'ui-danger-end',    'rot (Loeschen)'],
    ];

    for (const [a, b, was] of PAARE) {
        it(`${was}: beide Enden`, () => {
            for (const name of [a, b]) {
                const farbe = token(UX1, name);
                const k = kontrast('#ffffff', farbe);
                assert.ok(k >= 4.5,
                    `--${name} = ${farbe} ergibt ${k.toFixed(2)}:1 mit weisser ` +
                    `Schrift. Noetig sind 4,5:1 (WCAG AA fuer normalen Text).`);
            }
        });
    }

    it('der Rand ist nicht heller als der Verlauf', () => {
        // Ein heller Rand um einen dunklen Knopf laesst ihn kleiner
        // wirken und traegt selbst keinen Kontrast.
        for (const [a, , was] of PAARE) {
            const rand = token(UX1, a.replace('-start', '-border'));
            const start = token(UX1, a);
            assert.ok(leuchtdichte(rand) <= leuchtdichte(start) + 0.01,
                `${was}: der Rand ${rand} ist heller als der Verlauf ${start}`);
        }
    });

    it('der flache Token und der Verlauf sagen dasselbe', () => {
        // css/tokens.css:253 fuehrt --solid-ok als die "richtige"
        // gruene Flaeche. Liefen die beiden wieder auseinander, waere
        // genau das passiert, was diesen Befund erzeugt hat.
        const TOK = lies('css/tokens.css');
        const flach = token(TOK, 'solid-ok');
        const start = token(UX1, 'ui-secondary-start');
        const kFlach = kontrast('#ffffff', flach);
        const kStart = kontrast('#ffffff', start);
        assert.ok(kFlach >= 4.5 && kStart >= 4.5,
            `--solid-ok ${flach} (${kFlach.toFixed(2)}:1) und ` +
            `--ui-secondary-start ${start} (${kStart.toFixed(2)}:1) — ` +
            `einer von beiden haelt 4,5 nicht`);
    });
});

describe('Tippziele: eine Regel statt einer Regel pro Datei', () => {
    it('es gibt die Regel fuer grobe Zeigegeraete', () => {
        assert.match(TIPP, /@media \(pointer: coarse\)/,
            'die Regel ist weg — dann greift wieder jede Datei fuer sich, ' +
            'und die naechste neue Schaltflaeche wird vergessen');
        const i = TIPP.indexOf('@media (pointer: coarse)');
        const block = TIPP.slice(i, i + 900);
        assert.match(block, /min-height:\s*44px\s*!important/,
            'die Mindesthoehe steht nicht mehr auf 44px');
        for (const el of ['button', 'select', 'input']) {
            assert.ok(block.includes(el + ':not('),
                `${el} ist nicht mehr erfasst`);
        }
    });

    it('sie gilt NUR fuer grobe Zeigegeraete', () => {
        // Auf der Maus waren 36 px nie ein Problem, und 44 px wuerden
        // dichte Werkzeugleisten unnoetig aufblasen.
        const i = TIPP.indexOf('min-height: 44px !important');
        assert.ok(i > -1);
        const davor = TIPP.slice(Math.max(0, i - 1200), i);
        const iMedia = davor.lastIndexOf('@media');
        assert.ok(iMedia > -1 && /pointer:\s*coarse/.test(davor.slice(iMedia)),
            'die 44px stehen ausserhalb der pointer-coarse-Abfrage');
    });

    it('die drei Ausnahmen sind begruendet, nicht bequem', () => {
        // Jede Ausnahme hat einen Grund, und der steht daneben. Eine
        // Ausnahmeliste ohne Begruendung waere nur eine Kapitulation
        // mit Kommentarzeichen davor.
        const i = TIPP.indexOf('@media (pointer: coarse)');
        const kopf = TIPP.slice(Math.max(0, i - 3000), i);
        for (const [was, wort] of [
            ['.card-badge', 'card-badge'],
            ['Seitenzahlen', 'pagination'],
            ['Knoepfe auf dem Kartenbild', 'card-proxy-btn'],
        ]) {
            assert.ok(kopf.includes(wort),
                `die Ausnahme "${was}" ist nicht mehr begruendet`);
        }
        // Und die Ausgenommenen bekommen stattdessen eine unsichtbare
        // Flaeche — sonst waere die Ausnahme ein Verzicht.
        assert.match(UIC, /\.card-badge::after/,
            '.card-badge hat keine vergroesserte Trefferflaeche mehr');
        assert.match(TIPP, /\.card-proxy-btn::after/,
            '.card-proxy-btn hat keine vergroesserte Trefferflaeche mehr');
    });

    it('der Datenraum-Schalter ist tippbar', () => {
        assert.match(KOMP, /\.ds-filter-btn \{[^}]*min-height:\s*44px/,
            'der Schalter "Japan / Global / Vergangen" steht wieder unter 44px — ' +
            'er ist auf jeder Datenseite das erste Bedienelement');
    });
});

describe('Der Proxy-Kopf kann nicht mehr ueber den Rand ragen', () => {
    it('Innenabstand und Randspiegelung teilen sich eine Variable', () => {
        assert.match(CITY, /--proxy-pad:\s*16px/,
            'der Innenabstand steht wieder als feste Zahl da');
        assert.match(CITY, /padding:\s*var\(--proxy-pad\)/,
            '.proxy-container benutzt die Variable nicht');
        assert.match(CITY, /margin:\s*calc\(var\(--proxy-pad[^)]*\)\s*\*\s*-1\)/,
            '.proxy-header-row spiegelt den Abstand nicht mehr ueber die Variable — ' +
            'dann koennen die beiden wieder auseinanderlaufen');
    });

    it('kein Stylesheet setzt den Innenabstand an der Variablen vorbei', () => {
        // Genau das war der Fehler: mobile-responsive.css setzte
        // `padding: 0 !important`, waehrend der Rand bei -14px blieb.
        // Kommentare vorher wegschneiden: die Begruendung daneben nennt
        // `padding: 0 !important` als das, was NICHT mehr dasteht, und
        // eine Textsuche kann die beiden nicht auseinanderhalten.
        const ohneKomm = MOBILE.replace(/\/\*[\s\S]*?\*\//g, '');
        const treffer = [...ohneKomm.matchAll(/\.proxy-container[^{}]*\{[^}]*\}/g)]
            .map(m => m[0])
            .filter(b => /(^|[;{\s])padding\s*:/.test(b));
        assert.deepEqual(treffer, [],
            'mobile-responsive.css setzt padding direkt auf .proxy-container: ' +
            treffer.join(' | '));
        assert.match(MOBILE, /\.proxy-container \{\s*--proxy-pad:/,
            'die mobile Fassung setzt die Variable nicht');
    });

    it('der waagerechte Riegel ist als Verdeckung benannt', () => {
        // html/body { overflow-x: hidden } macht jeden Ueberlauf
        // unsichtbar — auch fuer jede kuenftige Messung. Wer das nicht
        // weiss, misst mit scrollWidth und findet garantiert nichts.
        const STYLES = lies('css/styles.css');
        assert.match(STYLES, /overflow-x:\s*hidden/,
            'der Riegel ist weg — dann aendert sich das Messverfahren, und ' +
            'diese Zusage gehoert ueberarbeitet');
        assert.match(CITY, /overflow-x: hidden|scrollWidth/,
            'die Begruendung am Proxy-Kasten nennt den Riegel nicht mehr — ' +
            'ohne diesen Hinweis misst der naechste Durchgang wieder ins Leere');
    });
});

describe('Das Beispiel im Proxy-Drucker nennt einen Druck, den es gibt', () => {
    it('SVI 186 ist raus', () => {
        // SVI 186 ist Pokegear 3.0, nicht Buddy-Buddy Poffin. Die
        // Anleitung lehrte einen Druck, den es nicht gibt — und das an
        // der Stelle, an der jemand gerade eine Eingabe abtippt.
        assert.ok(!/Buddy-Buddy Poffin SVI 186/.test(I18N),
            'das falsche Beispiel steht wieder da');
    });

    it('der genannte Druck steht in den Kartendaten', () => {
        const m = I18N.match(/Buddy-Buddy Poffin ([A-Z]{2,4}) (\d+)/);
        assert.ok(m, 'das Beispiel nennt keinen Druck mehr');
        const [, set, nr] = m;
        // Der Abgleich laeuft ueber die ganze Zeile, nicht ueber
        // Spaltenindizes: die Datei traegt ein BOM, `kopf[0]` heisst
        // deshalb '\ufeffname_en' und jeder indexOf('name_en') scheitert.
        const csv = lies('data/all_cards_merged.csv');
        const zeilen = csv.split('\n');
        const treffer = zeilen.some(z =>
            z.startsWith('Buddy-Buddy Poffin,') &&
            z.split(',').slice(0, 6).includes(set) &&
            z.split(',').slice(0, 6).includes(nr));
        assert.ok(treffer,
            `${set} ${nr} ist kein Buddy-Buddy-Poffin-Druck — das Beispiel ` +
            `lehrt wieder eine Eingabe, die ins Leere laeuft`);
    });
});
