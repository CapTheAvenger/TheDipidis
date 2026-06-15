#!/usr/bin/env node
// Regenerates data/pokemon_names_de.json from PokeAPI's open CSV
// dump (mirrored on GitHub, sandbox-reachable). Used by the Side
// Quest "Play this team" sprite picker so users can type
// "Knakrack" / "Glurak" / etc. and find the Showdown-name match.
//
// Output: { "Garchomp": "Knakrack", "Charizard": "Glurak", ... }
// — base-species only (1025 entries). Hyphen-suffixed Showdown
// names (Garchomp-Mega, Ninetales-Alola) match via base-species
// fallback on the frontend side.
//
//   node scripts/fetch_pokemon_names_de.js

const fs = require('fs');
const https = require('https');
const path = require('path');

const NAMES_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const OUT = path.join(__dirname, '..', 'data', 'pokemon_names_de.json');
const LANG_DE = 6;
const LANG_EN = 9;

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => { body += c; });
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
}

(async () => {
    console.log('Fetching', NAMES_URL);
    const csv = await fetchText(NAMES_URL);
    const rows = csv.split('\n').slice(1);
    // species_id → { de, en }
    const map = new Map();
    for (const row of rows) {
        if (!row.trim()) continue;
        // The names CSV is quoted-safe enough for split on the first
        // 3 commas (species_id, language_id, name, genus). Genus may
        // contain commas — we don't use it.
        const m = row.match(/^(\d+),(\d+),([^,]*),/);
        if (!m) continue;
        const sid = parseInt(m[1], 10);
        const lang = parseInt(m[2], 10);
        const name = m[3].replace(/^"|"$/g, '').trim();
        if (!name) continue;
        if (!map.has(sid)) map.set(sid, {});
        if (lang === LANG_DE) map.get(sid).de = name;
        else if (lang === LANG_EN) map.get(sid).en = name;
    }
    // Pair EN ↔ DE keyed by species_id
    const out = {};
    let count = 0;
    for (const { en, de } of map.values()) {
        if (en && de) {
            out[en] = de;
            count++;
        }
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
    console.log(`Wrote ${OUT} — ${count} EN→DE pairs, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
})();
