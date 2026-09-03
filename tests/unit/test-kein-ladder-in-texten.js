'use strict';
/*
 * "Ladder" steht in keinem sichtbaren Text — es gibt dort keine.
 *
 * ANLASS (03.09.2026). Der Betreiber ueber den Tooltip der Win-Rate-Spalte:
 * "dann bei Win Rate hinzuschreiben gewonnene Matches auf der Ladder ist
 * falsch. hier geht es um die Win Rate auf Basis der Limitless Online
 * Turniere ... also generell geht es hier nie um Ladder sondern immer
 * Limitless Online Tournaments."
 *
 * AN DER QUELLE NACHGEPRUEFT, bevor das Wort entfernt wurde:
 * play.limitlesstcg.com/decks?game=PTCG&format=STANDARD schreibt ueber
 * seine eigene Tabelle
 *
 *     "536 tournaments, 39181 players, 88857 matches"
 *
 * Das Wort "ladder" kommt auf der Seite nicht vor, und die Navigation
 * kennt "Tournaments" und "Decks", aber keine Ladder. Genau diese Seite
 * liest backend/scrapers/limitless_online_scraper.py; daraus entstehen
 * Listen, Anteil und Win Rate. Der Tooltip benannte also vier Monate lang
 * eine Quelle, die es nicht gibt.
 *
 * WAS DIESER TEST NICHT VERBIETET
 *
 * Bezeichner im Code (ladderPct, _aliasTurnierZuLadder) und den Schluessel
 * `turnier_zu_ladder` in data/archetype_aliases.json — letzterer ist laut
 * data/_consumers.md eine veroeffentlichte Schnittstelle. Und die
 * Speed-Ladder des Spiels selbst (js/app-side-quest-play.js,
 * js/champions-names.js): das ist ein anderer Begriff und bleibt.
 *
 * Geprueft werden die WERTE der Uebersetzungsdatei — das ist genau die
 * Menge dessen, was ein Leser zu sehen bekommt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');

/* Die Zeile 'schluessel': 'wert', — Wert in einfachen Anfuehrungszeichen.
   Gesucht wird NUR im Wert: der Schluessel 'mc.badgeLadder' heisst weiter
   so (tests/unit/test-sprache-win-rate.js verlangt ausdruecklich, dass
   Uebersetzungsschluessel unangetastet bleiben — wer sie mitumbenennt,
   bricht jede Stelle, die sie aufruft). */
const ZEILE = /^\s*'([a-zA-Z0-9_.]+)':\s*'((?:[^'\\]|\\.)*)'\s*,\s*$/;

function werte() {
    return lies(path.join('js', 'i18n.js')).split('\n')
        .map((z, i) => [i + 1, ZEILE.exec(z)])
        .filter(([, m]) => m)
        .map(([nr, m]) => ({ nr, schluessel: m[1], wert: m[2] }));
}

describe('kein sichtbarer Text nennt eine Ladder', () => {

    it('die Uebersetzungsdatei kommt ohne das Wort aus', () => {
        const treffer = werte().filter(e => /ladder/i.test(e.wert));
        assert.deepEqual(treffer.map(e => `${e.nr}: ${e.schluessel} — ${e.wert.slice(0, 80)}`), [],
            'Diese Anzeigetexte nennen eine Ladder. play.limitlesstcg.com fuehrt '
            + 'keine: die Deck-Uebersicht dort schreibt "536 tournaments, 39181 '
            + 'players, 88857 matches". Gemeint sind die Limitless-Online-Turniere.');
    });

    it('und es steht wirklich etwas an der Stelle', () => {
        // Sonst waere der Test auch gruen, wenn die Datei leer ist oder das
        // Muster nicht mehr passt. Beides ist schon vorgekommen.
        const alle = werte();
        assert.ok(alle.length > 2000,
            `nur ${alle.length} Uebersetzungswerte gefunden — das Muster passt `
            + 'nicht mehr auf die Datei, und der Test darueber prueft nichts');
        const online = alle.filter(e => /Online-Turnier|online tournament/i.test(e.wert));
        assert.ok(online.length >= 6,
            `nur ${online.length} Texte nennen die Online-Turniere — die Quelle `
            + 'wird nicht mehr benannt, und "Win Rate" steht ohne Herkunft da');
    });

    it('die sichtbaren Texte der Meta-Tabelle nennen die richtige Quelle', () => {
        /* Diese Texte stehen nicht in i18n.js, sondern inline in
           app-tier-meta.js — die Spalten-Tooltips und der Absatz ueber der
           Tabelle. Der beanstandete Tooltip war genau einer davon. */
        const tier = lies(path.join('js', 'app-tier-meta.js'));
        // Kommentare weg: der Namenshinweis darf das Wort nennen.
        const ohneKomm = tier.replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/^[ \t]*\/\/.*$/gm, '');
        const zeilen = ohneKomm.split('\n')
            .map((z, i) => [i + 1, z])
            .filter(([, z]) => /['"`][^'"`]*[Ll]adder/.test(z)
                && !/console\.(info|warn|log|error)/.test(z));
        assert.deepEqual(zeilen.map(([nr, z]) => `${nr}: ${z.trim().slice(0, 90)}`), [],
            'Diese Zeilen in app-tier-meta.js schreiben "Ladder" in einen Text, '
            + 'der auf der Seite landet');
        assert.ok(/Limitless-Online-Turnieren/.test(tier),
            'app-tier-meta.js benennt die Quelle nicht mehr');
    });

    it('Quellen & Methodik und die Umfangszeile ebenso', () => {
        for (const datei of ['js/app-quellen.js', 'js/ds-datenumfang.js']) {
            const t = lies(datei).replace(/\/\*[\s\S]*?\*\//g, ' ')
                .replace(/^[ \t]*\/\/.*$/gm, '');
            assert.ok(!/[Ll]adder/.test(t), `${datei} nennt weiter eine Ladder`);
        }
    });
});
