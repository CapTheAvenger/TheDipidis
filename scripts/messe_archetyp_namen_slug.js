#!/usr/bin/env node
/**
 * DA-32 Messwerkzeug (03.10.2026): Welche Archetypnamen aus
 * data/current_meta_card_data.csv stehen NICHT in data/limitless_online_decks.csv
 * (dem Namen auf der Seite) — vorher und nach der Slug-Angleichung, die
 * js/app-core.js (archetypNamenNachSlug) beim Laden macht.
 * Aufruf: node scripts/messe_archetyp_namen_slug.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const W = path.join(__dirname, '..');
const lies = (f) => fs.readFileSync(path.join(W, 'data', f), 'utf8').replace(/^﻿/, '');
function csv(text, sep) {
  const L = text.trim().split(/\r?\n/); const h = L[0].split(sep);
  return L.slice(1).map((l) => { const v = l.split(sep); const o = {}; h.forEach((k, i) => { o[k] = v[i]; }); return o; });
}
const core = fs.readFileSync(path.join(W, 'js', 'app-core.js'), 'utf8');
const a = core.indexOf('function slugAusArchetypName(');
const b = core.indexOf('window.slugAusArchetypName', a);
// eslint-disable-next-line no-new-func
const { archetypNamenNachSlug } = Function(core.slice(a, b) + '\nreturn { slugAusArchetypName, archetypNamenNachSlug };')();
const karten = csv(lies('current_meta_card_data.csv'), ';');
const seite = new Set(csv(lies('limitless_online_decks.csv'), ';').map((r) => r.deck_name));
const map = {}; csv(lies('labs_tournament_decks.csv'), ',').forEach((r) => { if (r.deck_slug) map[r.deck_slug] = r.deck_name; });
const fehlt = (rows) => [...new Set(rows.map((r) => r.archetype))].filter((n) => n && n !== 'Other' && !seite.has(n)).sort();
console.log('vorher fehlen auf der Seite:', fehlt(karten));
const r = archetypNamenNachSlug(karten, map);
console.log('umbenannt:', r.umbenannt);
console.log('nachher fehlen auf der Seite:', fehlt(r.rows));
