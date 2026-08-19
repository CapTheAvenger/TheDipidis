/**
 * 1,91 MB, die der Browser laedt und sofort wegwirft.
 *
 * data/limitless_online_decks_comparison.html ist die Quelle der
 * Meta-Ansicht. js/app-meta-cards.js:1378 laedt sie und ruft danach
 * _dropTop100MatchupSection() auf — das entfernt den Abschnitt
 * "Matchup Analysis - Top 100 Decks", bevor irgendetwas gerendert wird.
 * Heruntergeladen wurde er trotzdem, jedes Mal, von jedem Besucher.
 *
 * GEMESSEN am 19.08.2026 an der ausgelieferten Datei:
 *
 *   Datei gesamt              1,94 MB
 *   davon der tote Abschnitt  1,91 MB   = 98,4 %
 *   <table> darin                200 von 204
 *   <input> darin                200 von 200 — alle ohne Wirkung
 *
 * Die Eingabefelder waren tot, seit die Seite die eingebetteten
 * <script>-Bloecke nicht mehr ausfuehrt: ihre Handler hingen als
 * inline-oninput am Markup, und _sanitizeScraperHtml (F-006) entfernt
 * jedes on*-Attribut. Sie nahmen Text an und taten nichts.
 *
 * Der Generator wurde am 18.08.2026 um 14:18 UTC repariert
 * (backend/scrapers/limitless_online_scraper.py, "top 100: 1,2 MB HTML
 * fuer zweihundert Eingabefelder ohne Wirkung"). Die ausgelieferte Datei
 * stammte aber vom selben Tag um 06:19 UTC — acht Stunden VOR dem Fix.
 * Der weekly-full-update laeuft dienstags und freitags (cron 0 6 * * 2,5),
 * die naechste Regeneration waere also erst Freitag gewesen. Bis dahin
 * haette jeder Besucher die 1,91 MB weiter mitgeladen.
 *
 * Darum ist hier dieselbe Entfernung von Hand auf die Datei angewendet
 * worden, die der Generator jetzt ohnehin vornimmt — nach genau der Regel,
 * die auch der Client benutzt: das <div class="section">, dessen <h2>
 * "Matchup Analysis" enthaelt.
 *
 * Gegengeprueft im Browser, 1440 px, alle Abschnitte offen, beide Dateien
 * durch dieselbe Seite gerendert:
 *
 *              alt         neu
 *   Bytes      1.942.773   30.619    (98 % weniger)
 *   Hoehe      2.816       2.816
 *   DOM-Knoten 3.051       3.051
 *   Tabellen   23          23
 *   Text       zeichengleich (3.227 Zeichen)
 *
 * Die Matchup-Zahlen selbst sind unberuehrt: sie kommen aus
 * data/limitless_online_decks_matchups.csv ueber
 * buildMatchupRegistryFromCsv(). Hier fiel nur eine dritte, schlechtere
 * HTML-Darstellung derselben Daten weg.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATEI = path.join(ROOT, 'data', 'limitless_online_decks_comparison.html');
const HTML = fs.readFileSync(DATEI, 'utf8');
const GEN = fs.readFileSync(
    path.join(ROOT, 'backend', 'scrapers', 'limitless_online_scraper.py'), 'utf8');

describe('comparison.html — was ausgeliefert wird, wird auch gebraucht', () => {
    it('der tote Top-100-Abschnitt ist nicht mehr drin', () => {
        assert.ok(!/Matchup Analysis/i.test(HTML),
            'der Abschnitt ist wieder da — der Client wirft ihn weg, der Besucher laedt ihn trotzdem');
    });

    it('die drei echten Abschnitte stehen noch', () => {
        for (const h of ['Biggest Rank Climbers', 'Biggest Rank Fallers', 'Full Comparison Table']) {
            assert.ok(HTML.includes(h), 'Abschnitt fehlt: ' + h);
        }
    });

    it('keine Eingabefelder ohne Wirkung mehr', () => {
        const inputs = (HTML.match(/<input/g) || []).length;
        assert.equal(inputs, 0,
            inputs + ' <input> im Scraper-HTML — die Handler haengen inline und werden entfernt');
    });

    it('die Datei bleibt klein genug, dass niemand sie bemerkt', () => {
        const kb = Buffer.byteLength(HTML) / 1024;
        assert.ok(kb < 200, 'Datei ist ' + Math.round(kb) + ' KB (Grenze 200, gemessen 30)');
    });

    it('der Generator erzeugt den Abschnitt auch nicht mehr', () => {
        // Sonst waechst die Datei beim naechsten weekly-full-update
        // (cron 0 6 * * 2,5) sofort wieder auf 1,9 MB.
        assert.match(GEN, /Der Block "Matchup Analysis - Top 100 Decks" wird nicht mehr/,
            'ohne den Generator-Fix ist diese Datei am Freitag wieder gross');
        assert.ok(!/<h2>[^<]*Matchup Analysis/.test(GEN),
            'der Generator schreibt die Ueberschrift wieder');
    });
});
