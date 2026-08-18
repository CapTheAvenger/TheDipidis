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
    it('der Scraper schreibt die Ueberschrift nicht mehr', () => {
        const code = SCRAPER.replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/Matchup Analysis - Top 100 Decks/.test(code),
            'backend/scrapers/limitless_online_scraper.py erzeugt den Block wieder. '
            + '1,2 MB HTML fuer 200 Eingabefelder ohne Wirkung.');
    });

    it('die Begruendung steht im Generator', () => {
        assert.match(SCRAPER, /wird nicht mehr\s*\n\s*erzeugt/,
            'Ohne die Notiz baut sie beim naechsten Anfassen jemand wieder ein.');
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
