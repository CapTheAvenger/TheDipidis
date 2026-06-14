#!/usr/bin/env node
// Regenerates data/pokemon_battle_data.json from Smogon's pokedex.ts
// (the canonical open-source pokémon stats/typing dataset). Used by
// the Side Quest "Play this team" panel for Speed-stat calculation
// and type-weakness rendering. Run manually after gen rotations.
//
//   node scripts/fetch_pokemon_battle_data.js
//
// Output: { [SpeciesName]: { types: [...], baseStats: {hp,atk,def,spa,spd,spe} } }
// ~1480 entries incl. mega/regional/paradox/totem variants.

const fs = require('fs');
const https = require('https');
const path = require('path');

const URL = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts';
const OUT = path.join(__dirname, '..', 'data', 'pokemon_battle_data.json');

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve(body));
        }).on('error', reject);
    });
}

(async () => {
    console.log('Fetching', URL);
    const raw = await fetchText(URL);
    // The TS file is essentially a JS object literal wrapped in a TS export.
    // Strip the import-typed export header so plain Node can eval it.
    const stripped = raw.replace(/^export const Pokedex[^=]*=\s*/, 'const Pokedex = ')
                     + '\nmodule.exports = Pokedex;';
    const tmp = path.join(require('os').tmpdir(), 'ps_pokedex_' + Date.now() + '.js');
    fs.writeFileSync(tmp, stripped);
    const dex = require(tmp);
    fs.unlinkSync(tmp);

    const slim = {};
    let count = 0;
    for (const key of Object.keys(dex)) {
        const e = dex[key];
        if (!e || !e.baseStats) continue;
        const name = e.name || key;
        slim[name] = { types: e.types || [], baseStats: e.baseStats };
        count++;
    }
    fs.writeFileSync(OUT, JSON.stringify(slim));
    console.log(`Wrote ${OUT} — ${count} species, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
})();
