/**
 * Eine Herkunftsangabe darf nicht aelter sein als die Zahl, die sie belegt.
 *
 * GEMESSEN am 20.08.2026: die Kachel auf der Einstiegsseite lautete
 *
 *   GEMELDETE LISTEN  26.319
 *   aus 199 Turnieren · 14.026 Spieler · 31.411 Partien
 *
 * Die 26.319 kamen aus data/limitless_online_decks.csv (Stand 18.08.2026),
 * die drei Zahlen darunter aus data/limitless_meta_stats.json — zuletzt
 * geschrieben am **20.04.2026**. Vier Monate.
 *
 * Ursache: backend/scrapers/limitless_online_scraper.py:133 schreibt die
 * Datei nach get_data_dir() (= backend/core/data/), sie stand aber nicht in
 * SYNC_PATTERNS und kam deshalb nie in data/ an.
 *
 * Zwei Dinge sind dagegen noetig, und dieser Test haelt beide fest:
 *   1. die Datei muss ankommen — sonst bleibt die Ursache bestehen;
 *   2. die Anzeige darf sich nicht darauf verlassen — sonst wiederholt sich
 *      der Schaden beim naechsten ausgefallenen Lauf.
 *
 * Die Partienzahl war zusaetzlich in sich falsch: 119.820 Partie-Eintraege
 * in den Matchup-Daten sind mindestens 59.910 gespielte Partien (jede Partie
 * steht bei zwei Decks), angezeigt wurden 31.411.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TIER   = read('js/app-tier-meta.js');
const CARDS  = read('js/app-meta-cards.js');
const SYNC   = read('backend/core/prepare_card_data.py');
const SCRAPER = read('backend/scrapers/limitless_online_scraper.py');

describe('Die Ursache: die Datei muss in data/ ankommen', () => {
    it('limitless_meta_stats.json steht in SYNC_PATTERNS', () => {
        const block = SYNC.slice(SYNC.indexOf('SYNC_PATTERNS = ['));
        assert.match(block, /"limitless_meta_stats\.json"/);
    });

    it('und der Scraper schreibt einen Stand mit', () => {
        assert.match(SCRAPER, /"generated_at":\s*datetime\.now\(timezone\.utc\)/);
        assert.match(SCRAPER, /from datetime import datetime, timezone/);
    });
});

describe('Der Schaden: ohne frischen Stand wird nichts behauptet', () => {
    it('die Kachel prueft das Alter, bevor sie die Herkunft zeigt', () => {
        assert.match(TIER, /HOECHSTALTER_TAGE\s*=\s*14/);
        assert.match(TIER, /j\.generated_at/);
        // Nur bei frischem Stand wird metaStats ueberhaupt gesetzt.
        assert.match(TIER, /if \(z\(j\.tournaments\) > 0 && frisch\)/);
    });

    it('und schreibt den Stand an die Zahlen, wenn sie erscheinen', () => {
        /* GEAENDERT am 01.09.2026: die Zahlen stehen nicht mehr in einer
           Kachel auf der Startseite, sondern unter Quellen & Methodik.
           Der Stand reist mit — genau darum geht es hier: eine Zahl
           ohne ihr Datum ist die Zahl von irgendwann. Die Weitergabe
           passiert in app-tier-meta.js, der Satz entsteht in
           js/ds-datenumfang.js. */
        assert.match(TIER, /stand: metaStatsStand \? metaStatsStand\.toISOString\(\) : null/,
            'der Stand wird nicht mehr weitergereicht');
        const UMFANG = read('js/ds-datenumfang.js');
        assert.match(UMFANG, /Stand ' \+ dt\.toLocaleDateString\('de-DE'\)/);
        assert.match(UMFANG, /as of ' \+ dt\.toLocaleDateString\('en-GB'\)/);
        // Und ohne Stand steht kein erfundenes Datum da.
        assert.match(UMFANG, /if \(!isNaN\(dt\.getTime\(\)\)\)/);
    });

    it('die zweite Lesestelle prueft dasselbe', () => {
        // Zwei Leser derselben Datei, die sich unterschiedlich verhalten,
        // waeren genau der Fehler, den dieses Projekt schon fuenfmal hatte.
        assert.match(CARDS, /META_STATS_HOECHSTALTER_TAGE\s*=\s*14/);
        assert.match(CARDS, /statsData\.generated_at/);
        assert.match(CARDS, /if \(frisch\)/);
    });

    it('ohne generated_at bleibt die Zeile weg — auch bei gueltigen Zahlen', () => {
        // Die heute ausgelieferte Datei hat kein generated_at. Sie darf
        // deshalb nichts anzeigen, bis der Scraper einmal gelaufen ist.
        const jetzt = Date.now();
        const pruefe = (j) => {
            const stand = j.generated_at ? new Date(j.generated_at) : null;
            return !!(stand && !isNaN(stand.getTime()) && (jetzt - stand.getTime()) / 86400000 <= 14);
        };
        assert.equal(pruefe({ tournaments: 199, players: 14026, matches: 31411 }), false);
        assert.equal(pruefe({ tournaments: 199, generated_at: '2026-04-20T02:44:18+02:00' }), false);
        assert.equal(pruefe({ tournaments: 199, generated_at: new Date(jetzt - 3 * 86400000).toISOString() }), true);
        assert.equal(pruefe({ tournaments: 199, generated_at: 'kaputt' }), false);
    });
});

describe('Die ausgelieferte Datei heute', () => {
    it('traegt einen Stand und in sich stimmige Zahlen', () => {
        // Der Vorgaenger pinnte 199 / 14.026 / 31.411 fest, mit dem Zusatz
        // "bleibt als Beleg stehen, bis der erste Lauf sie ersetzt". Genau das
        // ist am 21.08.2026 passiert: der Wochenlauf hat die seit 2026-04-20
        // eingefrorene Datei zum ersten Mal wieder geschrieben — jetzt
        // 392 Turniere / 29.436 Spieler / 66.656 Partien, generated_at
        // 2026-08-21T06:14:41+00:00.
        //
        // Feste Gleichheit waere hier aber die falsche Zusicherung: die Datei
        // wird dienstags und freitags neu geschrieben, und der Deploy haengt
        // an gruenen Tests (deploy-pages.yml, job `test`). Ein fest verdrahteter
        // Wert macht also ausgerechnet an den Tagen rot, an denen frische Daten
        // live gehen sollen — der Test wuerde seinen eigenen Deploy blockieren.
        // Deshalb: Struktur und Verhaeltnisse pruefen, die Messung steht im
        // Kommentar.
        const j = JSON.parse(read('data/limitless_meta_stats.json'));
        for (const k of ['tournaments', 'players', 'matches']) {
            assert.equal(typeof j[k], 'number', k + ' fehlt oder ist keine Zahl');
            assert.ok(j[k] > 0, k + ' ist ' + j[k]);
        }
        // Ein Turnier hat mehr als einen Spieler, ein Spieler spielt mehr als
        // eine Partie. Faellt eine dieser Ordnungen um, stimmt die Erhebung nicht.
        assert.ok(j.players > j.tournaments, `players ${j.players} <= tournaments ${j.tournaments}`);
        assert.ok(j.matches > j.players, `matches ${j.matches} <= players ${j.players}`);
        // Der Grund, warum die Seite die Zahlen ueberhaupt wieder zeigt: ohne
        // generated_at unterdrueckt sie Zahl UND Herkunftszeile (bewusst —
        // "lieber keine Herkunft als eine falsche").
        assert.ok(j.generated_at, 'ohne generated_at unterdrueckt die Seite die Zahlen');
        assert.ok(!Number.isNaN(Date.parse(j.generated_at)),
            'generated_at ist kein lesbares Datum: ' + j.generated_at);
    });
});
