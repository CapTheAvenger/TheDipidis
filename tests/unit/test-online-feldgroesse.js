/**
 * Online-Zeilen im Deckbauer: die Feldgroesse wird gemessen, nicht geraten
 * ======================================================================
 *
 * WAS AM 10.09.2026 PASSIERT IST
 * ------------------------------
 * Der Wochenlauf #135 hat zum ersten Mal Zeilen aus
 * play.limitlesstcg.com (quelle='online') in
 * data/tournament_decklists_per_player.csv geschrieben — dieselbe Datei,
 * aus der js/deck-builder-consistency.js seine Gewichte baut.
 *
 * Online-Turniere haben keine Labs-Nummer. `_loadTournamentSizes` kannte
 * sie deshalb nicht, `_sizeWeight(0)` fiel auf SIZE_WEIGHT_FLOOR = 0,5.
 *
 * GEMESSEN am Stand c86c3494 (Datei mit 64.368 Zeilen):
 *
 *     Herkunft   Listen   Gewichtsmasse   Anteil
 *     online      1.319          152,8    24,6 %   <- alle zum Notwert
 *     papier      1.201          468,5    75,4 %
 *
 * Ein Wochenturnier mit 39 Leuten stand damit neben einem Regional mit
 * 2.143 — beide bei 0,5 bzw. bis 1,0, ohne dass die Zahl irgendwo
 * herkam.
 *
 * WAS DIESER TEST FESTHAELT
 * -------------------------
 * 1. Die Feldgroesse kommt aus zwei GEMESSENEN Quellen und aus keiner
 *    dritten: der Spalte `spielerzahl` der Zeile (Scraper liest sie aus
 *    `data-players`) und data/online_api_tournaments.csv.
 * 2. Zeilen, fuer die beide Quellen nichts hergeben, werden gezaehlt
 *    und WEGGELASSEN — nicht zum Notwert mitgewogen.
 * 3. Die Zahl der weggelassenen Listen wird gegen einen GRUNDSTAND
 *    gehalten, nicht gegen eine absolute Schwelle (CLAUDE.md).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const BAUER = lies('js/deck-builder-consistency.js');

describe('Der Deckbauer holt die Online-Feldgroesse aus gemessenen Quellen', () => {
    it('liest data/online_api_tournaments.csv', () => {
        // Auf den AUFRUF geprueft, nicht auf den Dateinamen: der steht
        // auch im Kommentar darueber, und eine Probe, die den Aufruf
        // herausnimmt, waere sonst durchgerutscht (10.09.2026 gemessen).
        assert.match(BAUER, /_loadCsv\('data\/online_api_tournaments\.csv'\)/,
            'Die Bruecke ueber die Turnierdatei wird nicht mehr geladen — '
            + 'Online-Turniere haetten wieder keine Feldgroesse.');
    });

    it('bevorzugt die Spalte `spielerzahl` der Zeile selbst', () => {
        assert.match(BAUER, /r\.spielerzahl/,
            'Die Spalte aus der Zeile wird nicht gelesen.');
        // Reihenfolge: erst die Zeile, dann die Bruecke.
        const iZeile = BAUER.indexOf('r.spielerzahl');
        const iFall  = BAUER.indexOf('_tournamentSizes.get(tid) || 0', iZeile);
        assert.ok(iFall > iZeile,
            'Der Rueckfall auf die Turnierdatei steht nicht NACH der Spalte.');
    });

    it('laesst Zeilen ohne bekannte Feldgroesse weg, statt 0,5 zu vergeben', () => {
        assert.match(BAUER, /_ohneFeld\+\+/,
            'Es wird nichts gezaehlt.');
        assert.match(BAUER, /ausgelasseneOnlineZeilen/,
            'Die Zahl ist von aussen nicht abrufbar — ein Test koennte sie '
            + 'nicht gegen einen Grundstand halten.');
    });

    it('der Kopfkommentar behauptet nicht mehr, die Datei sei nur Top Cut', () => {
        assert.match(BAUER, /GILT DAS NICHT MEHR FUER DIE GANZE DATEI/,
            'Spec-Regel 3 im Kopf sagt weiter "die Grundgesamtheit dieser '
            + 'Datei IST der Top Cut". Fuer Online-Zeilen stimmt das nicht.');
    });
});

describe('Wie viele Online-Listen gerade ohne Feldgroesse dastehen', () => {
    /* GRUNDSTAND vom 10.09.2026, Stand c86c3494:
     *   1.319 Online-Listen aus 14 Turnieren.
     *   Davon 305 Listen (7.819 Zeilen) aus 4 Turnieren ohne Feldgroesse:
     *   6a9ed4f6…, 6a9f71b8…, 6aa122db…, 6aa17dba…
     *
     * WARUM DIE VIER FEHLEN — und warum das kein Fehler ist:
     * data/online_api_tournaments.csv wurde am 10.09. um 03:58 UTC
     * gezogen, der Decklisten-Scraper lief um 10:50 und 13:01. Die vier
     * juengsten Turniere gab es zur Zeit des Turnier-Scrapes noch nicht.
     * Sobald die Spalte `spielerzahl` mitlaeuft (ab dem naechsten Lauf,
     * Dienstag/Freitag), verschwindet die Luecke von selbst.
     *
     * GEPRUEFT WIRD DESHALB VERAENDERUNG, NICHT HOEHE: waechst der Anteil
     * deutlich ueber den Grundstand, laeuft etwas anderes schief als eine
     * Zeitverschiebung von sieben Stunden. */
    const GRUNDSTAND_ANTEIL = 305 / 1319;   // 23,1 %
    const OBERGRENZE        = 0.40;          // Grundstand + rund 17 pp Luft

    // SC-45: Auszuege je Format und Monat, als ein Text
    const zeilen = require(path.join(WURZEL, 'scripts', 'per-player-auszuege.js')).text(path.join(WURZEL, 'data')).split('\n');
    const kopf = zeilen[0].replace(/^﻿/, '').split(',');
    const iQ = kopf.indexOf('quelle');
    const iL = kopf.indexOf('limitless_tournament_id');
    const iP = kopf.indexOf('player_name');
    const iS = kopf.indexOf('spielerzahl');

    // data/online_api_tournaments.csv ist semikolongetrennt.
    const turnier = lies('data/online_api_tournaments.csv').split('\n');
    const tKopf = turnier[0].replace(/^﻿/, '').split(';');
    const tId = tKopf.indexOf('tournament_id');
    const tPl = tKopf.indexOf('players');
    const groessen = new Map();
    for (const z of turnier.slice(1)) {
        if (!z.trim()) continue;
        const f = z.split(';');
        const n = parseInt(f[tPl], 10);
        if (f[tId] && Number.isFinite(n) && n > 0) groessen.set(f[tId].trim(), n);
    }

    it('die Spaltennamen stimmen noch', () => {
        assert.ok(iQ >= 0 && iL >= 0 && iP >= 0,
            'quelle / limitless_tournament_id / player_name nicht gefunden');
        assert.ok(tId >= 0 && tPl >= 0,
            'online_api_tournaments.csv fuehrt tournament_id/players nicht mehr');
    });

    it('der Anteil ohne Feldgroesse bleibt beim Grundstand', () => {
        const alle = new Set();
        const ohne = new Set();
        for (const z of zeilen.slice(1)) {
            if (!z) continue;
            const f = z.split(',');
            if (f[iQ] !== 'online') continue;
            const tid = (f[iL] || '').trim();
            const key = tid + '|' + (f[iP] || '');
            alle.add(key);
            const ausZeile = iS >= 0 ? parseInt((f[iS] || '').trim(), 10) : NaN;
            const bekannt = (Number.isFinite(ausZeile) && ausZeile > 0)
                || groessen.has(tid);
            if (!bekannt) ohne.add(key);
        }
        assert.ok(alle.size > 0, 'keine Online-Listen in der Datei');
        const anteil = ohne.size / alle.size;
        assert.ok(anteil <= OBERGRENZE,
            `${ohne.size} von ${alle.size} Online-Listen (${(anteil * 100).toFixed(1)} %) `
            + `haben keine Feldgroesse — Grundstand war `
            + `${(GRUNDSTAND_ANTEIL * 100).toFixed(1)} %. Entweder laeuft `
            + `data/online_api_tournaments.csv dem Decklisten-Scraper weiter `
            + `hinterher, oder die Spalte spielerzahl kommt nicht an.`);
    });
});
