'use strict';
/**
 * Die Decklisten je Spieler liegen im Repo als Auszuege je Format und Monat
 * (SC-45, 04.11.2026): data/tournament_decklists_per_player_<META>_<JJJJ-MM>.csv
 * plus data/tournament_decklists_per_player_verzeichnis.json. Der Monolith
 * (99,5 MiB, mit Puebla/Danzig 106,5 MiB) lag ueber GitHubs 100-MiB-Grenze.
 *
 * Node-Gegenstueck zu scripts/per_player_auszuege.py fuer Skripte und Tests.
 * Das Frontend (js/deck-builder-consistency.js) liest das Verzeichnis selbst.
 *
 *   const ppa = require('./per-player-auszuege');
 *   ppa.pfade(DATA)             // alle Auszuege, Schluessel sortiert
 *   ppa.pfade(DATA, 'TEF-30C')  // nur dieses Format
 *   ppa.text(DATA, 'TEF-30C')   // EIN CSV-Text mit einer Kopfzeile
 */
const fs = require('fs');
const path = require('path');

const PRAEFIX = 'tournament_decklists_per_player';
const MONOLITH = PRAEFIX + '.csv';
const VERZEICHNIS = PRAEFIX + '_verzeichnis.json';
const UNSORTIERT = '_unsorted';

function metaAusSchluessel(key) {
    if (key === UNSORTIERT) return '';
    const m = /^(.+)_(\d{4}-\d{2}|unbekannt)$/.exec(key);
    return m ? m[1] : key;
}

function dateiname(key) { return `${PRAEFIX}_${key}.csv`; }

function istAuszug(name) {
    return name.startsWith(PRAEFIX + '_') && name.endsWith('.csv') && name !== MONOLITH;
}

function verzeichnis(dataDir) {
    const p = path.join(dataDir, VERZEICHNIS);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
}

/** Die Auszuege in fester Reihenfolge; massgeblich ist das Verzeichnis. */
function pfade(dataDir, meta) {
    const vz = verzeichnis(dataDir);
    let keys;
    if (vz && Array.isArray(vz.auszuege)) {
        keys = vz.auszuege.map((a) => a.schluessel).filter(Boolean);
    } else {
        keys = fs.readdirSync(dataDir).filter(istAuszug)
            .map((n) => n.slice(PRAEFIX.length + 1, -'.csv'.length));
    }
    keys = Array.from(new Set(keys)).sort();
    if (meta !== undefined && meta !== null) keys = keys.filter((k) => metaAusSchluessel(k) === meta);
    return keys.map((k) => path.join(dataDir, dateiname(k))).filter((p) => fs.existsSync(p));
}

function metas(dataDir) {
    return Array.from(new Set(pfade(dataDir).map((p) =>
        metaAusSchluessel(path.basename(p).slice(PRAEFIX.length + 1, -'.csv'.length))))).filter(Boolean).sort();
}

/** Alle Auszuege als EIN CSV-Text mit einer Kopfzeile. */
function text(dataDir, meta) {
    const teile = [];
    let kopf = null;
    for (const p of pfade(dataDir, meta)) {
        const inhalt = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
        if (!inhalt) continue;
        const nl = inhalt.indexOf('\n');
        const erste = nl < 0 ? inhalt : inhalt.slice(0, nl);
        const rest = nl < 0 ? '' : inhalt.slice(nl + 1);
        if (kopf === null) { kopf = erste; teile.push(kopf + '\n'); }
        if (rest) teile.push(rest.endsWith('\n') ? rest : rest + '\n');
    }
    return teile.join('');
}

function anzahlZeilen(dataDir, meta) {
    let n = 0;
    for (const p of pfade(dataDir, meta)) {
        const inhalt = fs.readFileSync(p, 'utf8');
        let z = 0;
        for (let i = 0; i < inhalt.length; i++) if (inhalt.charCodeAt(i) === 10) z++;
        if (!inhalt.endsWith('\n') && inhalt.length) z++;
        n += Math.max(0, z - 1);
    }
    return n;
}

module.exports = { PRAEFIX, MONOLITH, VERZEICHNIS, UNSORTIERT, metaAusSchluessel, dateiname,
    istAuszug, verzeichnis, pfade, metas, text, anzahlZeilen };
