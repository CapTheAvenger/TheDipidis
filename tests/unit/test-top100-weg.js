/**
 * Der Block "Matchup Analysis - Top 100 Decks".
 *
 * Gemessen am 18.08.2026 auf 1440 px im Tab "Aktuelles Meta (Global)":
 *
 *     Tabhoehe gesamt        16.950 px
 *     davon dieser Block      5.556 px   = 33 %
 *     Suchfelder darin           200, davon funktionsfaehig:  0
 *     Tabellen darin             200, Zeilen: 1.033
 *     outerHTML              1.199.003 Zeichen
 *
 * Die 200 Suchfelder waren tot, seit die Seite die eingebetteten
 * <script>-Bloecke des Scrapers nicht mehr ausfuehrt: ihre Handler
 * haengen als inline-oninput am Markup, und _sanitizeScraperHtml()
 * entfernt jedes on*-Attribut, bevor der Block eingesetzt wird (F-006).
 * Sie nahmen Text an und taten nichts.
 *
 * Die Zahlen selbst gibt es zweimal woanders und beide Male besser: in
 * der Matchup-Heatmap (mit Partienzahl je Zelle) und in der
 * Archetyp-Karte (beste UND schlechteste Matchups mit n und Bilanz).
 *
 * Nach dem Entfernen: 11.364 px statt 16.950, drei Eingabefelder statt
 * 203, 23 Tabellen statt 223.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const jsCode = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const CARDS = R('js/app-meta-cards.js');
const SCRAPER = R('backend/scrapers/limitless_online_scraper.py');

describe('Top-100-Matchupblock: erzeugt wird er nicht mehr', () => {
    it('die Ueberschrift steht nur noch in Kommentarzeilen', () => {
        // Frueher wurde hier pauschal jeder <!-- --> Block weggeschnitten und
        // dann nach der Phrase gesucht. Das gruente auch, als die Begruendung
        // als HTML-Kommentar MITTEN IM f-String stand und damit an jeden
        // Besucher ausgeliefert wurde (gemessen 21.08.2026: 1.430 Zeichen
        // ueber 26 Zeilen in der frisch erzeugten Datei).
        //
        // Deshalb jetzt genauer: die Phrase DARF vorkommen, aber ausschliesslich
        // auf Python-Kommentarzeilen. Sobald der Generator sie wieder in
        // Markup schreibt, steht sie auf einer Zeile ohne fuehrendes '#'.
        const treffer = SCRAPER.split('\n')
            .filter(l => /Matchup Analysis - Top 100 Decks/.test(l));
        assert.ok(treffer.length > 0,
            'die Begruendung ist ganz verschwunden — dann baut sie jemand wieder ein');
        for (const l of treffer) {
            assert.match(l.trim(), /^#/,
                'backend/scrapers/limitless_online_scraper.py erzeugt den Block wieder: '
                + l.trim().slice(0, 90));
        }
    });

    it('die Begruendung steht im Generator, aber nicht in der Nutzlast', () => {
        assert.match(SCRAPER, /#\s*Der Block "Matchup Analysis - Top 100 Decks" wird nicht mehr/,
            'Ohne die Notiz baut sie beim naechsten Anfassen jemand wieder ein.');
        // Blockweise pruefen, nicht mit einem Muster ueber die ganze Datei:
        // ein <!-- ... --> am Anfang und eines am Ende umspannen sonst alles
        // dazwischen und die Zusicherung feuert grundlos.
        for (const k of (SCRAPER.match(/<!--[\s\S]*?-->/g) || [])) {
            assert.ok(!/Matchup Analysis/.test(k),
                'die Begruendung steht wieder als HTML-Kommentar im Template — '
                + 'dann laedt sie jeder Besucher mit: ' + k.slice(0, 60));
        }
    });

    it('die Matchup-Daten selbst bleiben unangetastet', () => {
        // Der Block war eine Darstellung, keine Quelle. Die Zahlen kommen
        // aus der CSV und werden von buildMatchupRegistryFromCsv gelesen.
        assert.match(CARDS, /buildMatchupRegistryFromCsv/);
        assert.ok(fs.existsSync(path.join(ROOT, 'data', 'limitless_online_decks_matchups.csv')),
            'Die Matchup-CSV fehlt — dann waere der Block doch die Quelle gewesen.');
    });
});

describe('Top-100-Matchupblock: eingesetzt wird er auch nicht', () => {
    it('die Seite wirft ihn raus, bevor er in den Baum kommt', () => {
        // Die alte Datei liegt bis zum naechsten Scrape noch auf dem
        // Server — ohne diesen Schritt waere die Aenderung erst in
        // Stunden sichtbar.
        assert.match(CARDS, /function _dropTop100MatchupSection\(root\)/);
        assert.match(jsCode(CARDS), /_dropTop100MatchupSection\(container\);\s*\n\s*\/\/|_dropTop100MatchupSection\(container\);/);
        const call = jsCode(CARDS).indexOf('_dropTop100MatchupSection(container)');
        const sanitize = jsCode(CARDS).indexOf('_sanitizeScraperHtml(container)');
        assert.ok(call > 0 && call < sanitize,
            'Der Block muss VOR dem Einsetzen fallen, nicht danach.');
    });

    it('die aria-Schleife fuer die toten Felder ist weg', () => {
        assert.ok(!/input\[id\^="opponent_search_"\]/.test(jsCode(CARDS)),
            'Ein beschriftetes totes Eingabefeld ist schlechter als keins.');
    });
});
