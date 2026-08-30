'use strict';
/*
 * Die Startseite erklaerte mehr, als sie sagte.
 *
 * BEFUND (30.08.2026, vom Betreiber an neun Screenshots gezeigt): auf
 * dem ersten Bildschirm der Meta-Ansicht standen sechs erklaerende
 * Textbloecke — der Trennungssatz unter jedem Datenausweis, die
 * sechszeilige Definition von Anteil und Top-8-Quote unter der ersten
 * Kachel, ein fuenfzeiliger Vorbehalt ueber neue Online-Decks, ein
 * aufklappbarer Beleg-Kasten "Wie zuverlaessig ist das?" mit drei
 * Absaetzen, und die Ueberschrift nannte statt des Formats die Quelle
 * ("Limitless Online Vergleich"). Dazu stand "TEF-PBL" viermal auf
 * demselben Bildschirm.
 *
 * Jeder einzelne Text war richtig. Das ist der Punkt: sie sind deshalb
 * nicht geloescht, sondern nach Quellen & Methodik umgezogen. Diese
 * Datei haelt beide Enden fest — die Seite bleibt kurz, UND die
 * Erklaerung bleibt erreichbar. Nur eines von beiden zu pruefen waere
 * die Zusage, die man durch Loeschen erfuellt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');

const HTML     = lies('index.html');
const QUELLEN  = lies('js/app-quellen.js');
const NAV      = lies('js/ds-nav.js');
const SECTIONS = lies('js/ds-sections.js');
const HUB      = lies('js/meta-analysis-hub.js');
const EMPF     = lies('js/app-deckempfehlung.js');
const I18N     = lies('js/i18n.js');
const CORE     = lies('js/app-core.js');
const INIT     = lies('js/inline-init.js');
const SW       = lies('service-worker.js');
const CSS      = lies('css/quellen.css');

// Die Texte in app-quellen.js sind ueber Quellzeilen zusammengesetzt.
// Geprueft wird der Satz, den der Leser sieht.
const Q_TEXT = QUELLEN.replace(/'\s*\+\s*\n\s*'/g, '');

describe('Die Seite ist die Erklaerungen los', () => {
    const WEG = [
        ['der Trennungssatz unter jedem Ausweis',
         NAV, /werden getrennt geführt und nie mit diesen Zahlen gemischt/],
        ['der englische Trennungssatz',
         NAV, /are kept separate and never mixed into these numbers/],
        ['die Definition von Anteil unter der ersten Kachel',
         HUB, /Anteil = wie oft ein Deck gespielt wurde/],
        ['die englische Definition',
         HUB, /Share = how often a deck was played/],
        ['die Herleitung des Vergleichswerts an der Kachel',
         HUB, /Der Vergleichswert ist geglättet/],
        ['der aufklappbare Beleg-Kasten',
         EMPF, /<details class="de-beleg">/],
        ['die Nachrechnung im Beleg-Kasten',
         EMPF, /wer dieser Regel gefolgt wäre/],
        ['die Beschreibung der Heatmap als Titel',
         SECTIONS, /jede Zelle mit Matchzahl/],
    ];

    for (const [was, quelle, muster] of WEG) {
        it(`weg: ${was}`, () => {
            assert.doesNotMatch(quelle, muster,
                'steht wieder auf der Seite statt unter Quellen & Methodik');
        });
    }

    it('das Format steht nicht mehr zusaetzlich im Ausweis', () => {
        // Viermal dasselbe Kuerzel auf einem Bildschirm: Ausweis,
        // Datenraum-Filter, Ueberschrift, Kopf der Empfehlung. Der
        // Filter zeigt es gross und ist bedienbar — der Ausweis
        // wiederholte es nur.
        assert.ok(!NAV.includes('ds-space-format'),
            'der Ausweis baut das Format wieder ein');
        assert.match(NAV, /function formatFor\(/,
            'formatFor wird noch gebraucht: die Ueberschrift holt das Kuerzel von dort');
    });
});

describe('Die Ueberschrift nennt das Meta, nicht die Quelle', () => {
    it('"Limitless Online Vergleich" ist raus, in beiden Sprachen', () => {
        assert.doesNotMatch(I18N, /'Limitless Online Vergleich'/);
        assert.doesNotMatch(I18N, /'Limitless Online Comparison'/);
        const treffer = [...I18N.matchAll(/'cm\.limitlessHeading':\s*'([^']*)'/g)].map(m => m[1]);
        assert.deepEqual(treffer, ['Current meta', 'Aktuelles Meta'],
            `die Ueberschrift heisst jetzt: ${treffer.join(' / ')}`);
    });

    it('das Formatkuerzel kommt aus der Rotation, nicht aus dem HTML', () => {
        // Ein festes "TEF-PBL" im Markup waere nach der naechsten
        // Rotation falsch — und zwar still.
        assert.match(HTML, /id="cmFormatLabel"/, 'der Platz fuer das Kuerzel fehlt');
        const i = HTML.indexOf('id="cmFormatLabel"');
        const umfeld = HTML.slice(i, i + 200);
        assert.doesNotMatch(umfeld, /TEF|PBL/,
            'das Kuerzel steht fest im HTML und ueberlebt die Rotation nicht');
        assert.match(NAV, /function formatMarke\(\)/, 'niemand fuellt das Kuerzel');
        assert.match(NAV, /getElementById\('cmFormatLabel'\)/);
        // Und es muss auch beim Sprachwechsel wieder gesetzt werden.
        assert.match(NAV, /languageChanged'?,\s*formatMarke/,
            'nach einem Sprachwechsel bliebe das Kuerzel stehen wie es war');
    });
});

describe('Nichts ist verschwunden — alles ist umgezogen', () => {
    // Fuer jeden entfernten Text: der Inhalt muss auf der Quellenseite
    // ankommen, in BEIDEN Sprachen. Sonst ist die Kuerzung ein Verlust.
    const UMGEZOGEN = [
        ['die Trennung der drei Datenraeume',
         /Japan, Global und Past werden getrennt geführt/,
         /Japan, Global and Past are kept separate/],
        ['die Definition von Anteil',
         /Wie oft ein Deck gespielt wurde/,
         /How often a deck was played/],
        ['die Bedingung am Vergleichswert',
         /mit erkanntem Archetyp/,
         /with a recognised archetype/],
        ['die Glaettung kleiner Stichproben',
         /Richtung Durchschnitt korrigiert/,
         /pulled towards the average/],
        ['dass eine Empfehlung keine Zusage ist',
         /keine Zusage/,
         /not a promise/],
        ['der Vorbehalt gegen neue Decks',
         /stecken in keiner dieser Zahlen/,
         /are in none\s*of these numbers/],
        ['die Regel gegen erfundene Zahlen',
         /Eine erfundene Zahl wäre schlimmer/,
         /An invented number would be/],
    ];

    for (const [was, de, en] of UMGEZOGEN) {
        it(`umgezogen: ${was}`, () => {
            assert.match(Q_TEXT, de, 'die deutsche Fassung fehlt auf der Quellenseite');
            assert.match(Q_TEXT, en, 'die englische Fassung fehlt auf der Quellenseite');
        });
    }

    it('jeder Abschnitt gibt es in beiden Sprachen', () => {
        const zaehl = (block) => {
            const i = Q_TEXT.indexOf(block);
            assert.ok(i > -1, `Sprachblock ${block} fehlt`);
            const ende = Q_TEXT.indexOf('        en: {', i + 5);
            const teil = Q_TEXT.slice(i, ende > i ? ende : undefined);
            return [...teil.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
        };
        const d = zaehl('        de: {');
        const e = zaehl('        en: {');
        assert.ok(d.length >= 5, `nur ${d.length} Abschnitte erkannt — die Erkennung greift nicht`);
        assert.deepEqual(d, e, 'die Sprachen fuehren verschiedene Abschnitte');
    });
});

describe('Der Weg zur Erklaerung ist ein Klick', () => {
    it('jede Stelle, an der Text wegfiel, verweist auf die Seite', () => {
        for (const [name, quelle] of [['Ausweis', NAV], ['Kachel', HUB], ['Empfehlung', EMPF]]) {
            assert.match(quelle, /href="#quellen"/,
                `${name}: der Text ist weg und kein Weg zur Erklaerung da`);
        }
    });

    it('die Seite existiert wirklich und ist erreichbar', () => {
        assert.match(HTML, /id="quellen" class="tab-content"/, 'der Reiter fehlt');
        assert.match(HTML, /id="quellenHost"/, 'der Platz fuer den Inhalt fehlt');
        assert.match(HTML, /id="menu-btn-quellen"/, 'kein Eintrag im Pokeball-Menue');
        assert.match(HTML, /js\/app-quellen\.js\?/, 'das Modul wird nicht geladen');
        assert.match(HTML, /css\/quellen\.css\?/, 'das Stylesheet wird nicht geladen');
    });

    it('der Reiter zeichnet sich beim Oeffnen', () => {
        // Ohne diesen Fall bleibt die Seite leer — genau der Fehler,
        // den side-quest am 26.08.2026 hatte.
        const start = CORE.indexOf('function switchTab(tabName)');
        const ende = CORE.indexOf('// Notify the Meta & Deck Analysis Hub', start);
        const block = CORE.slice(start, ende);
        assert.match(block, /case 'quellen':/, 'switchTab kennt den Reiter nicht');
        const fall = block.slice(block.indexOf("case 'quellen':"));
        assert.match(fall.slice(0, 500), /window\.Quellen[\s\S]{0,200}\.render\(\)/,
            'der Fall existiert, zeichnet aber nichts');
    });

    it('der Anker #quellen landet auch wirklich dort', () => {
        // Die Verweise oben sind href="#quellen". Ohne Eintrag in der
        // Alias-Tabelle blendet switchTab jeden Reiter aus und keinen
        // ein — eine leere Seite, kein Fehler.
        assert.match(INIT, /'quellen':\s*'quellen'/,
            'der Anker ist nicht als Ziel eingetragen');
    });

    it('der Sprachwechsel laesst die Seite nicht stehen', () => {
        assert.match(QUELLEN, /addEventListener\('languageChanged'/,
            'nach einem Sprachwechsel bliebe die Seite in der alten Sprache');
        // Und er darf keinen verborgenen Reiter befuellen.
        assert.match(QUELLEN, /host\.children\.length/,
            'zeichnet auch, wenn die Seite nie geoeffnet wurde');
    });

    it('offline ist sie auch da', () => {
        assert.match(SW, /'\.\/js\/app-quellen\.js'/, 'das Modul fehlt im Offline-Vorrat');
        assert.match(SW, /'\.\/css\/quellen\.css'/, 'das Stylesheet fehlt im Offline-Vorrat');
    });
});

describe('Die Quellenseite haelt sich an die eigenen Regeln', () => {
    it('jede Klasse, die das Modul erzeugt, gibt es auch', () => {
        const benutzt = new Set([...QUELLEN.matchAll(/class="(qu-[a-z-]+)"/g)].map(m => m[1]));
        assert.ok(benutzt.size >= 5, `nur ${benutzt.size} Klassen erkannt`);
        const fehlen = [...benutzt].filter(k => !CSS.includes('.' + k));
        assert.deepEqual(fehlen, [], `ohne Regel bleibt der Abschnitt ungestaltet: ${fehlen}`);
    });

    it('sie faerbt nichts fest, was der Dunkelmodus umstellen muesste', () => {
        // Farben kommen aus tokens.css. Ein fester Hex-Wert waere im
        // Dunkelmodus entweder unsichtbar oder grell — beides ist
        // schon vorgekommen.
        const feste = [...CSS.matchAll(/^\s*(color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb)/gm)]
            .map(m => m[0].trim());
        assert.deepEqual(feste, [], `feste Farbe statt Token: ${feste}`);
    });

    it('die Abschnitte sind tippbar', () => {
        assert.match(CSS, /\.qu-sum \{[^}]*min-height:\s*44px/,
            'unter 44px trifft ein Daumen die Zeile nicht zuverlaessig');
    });

    it('genau ein Abschnitt steht offen', () => {
        // Alle offen waere wieder die Textwand, die diese Seite
        // aufloesen soll; keiner offen sieht aus wie eine leere Seite.
        for (const block of ['        de: {', '        en: {']) {
            const i = Q_TEXT.indexOf(block);
            const ende = Q_TEXT.indexOf('        en: {', i + 5);
            const teil = Q_TEXT.slice(i, ende > i ? ende : undefined);
            const offen = (teil.match(/auf: true/g) || []).length;
            assert.equal(offen, 1, `${block.trim()} hat ${offen} offene Abschnitte statt einem`);
        }
    });
});
