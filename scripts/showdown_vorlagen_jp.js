#!/usr/bin/env node
/**
 * Japan-Vorlagen fuer TCG Showdown — data/showdown_vorlagen_jp.json
 *
 * Bestellung Hausi, 05.11.2026: „Das Japan-Meta ist uns ja immer ein Set
 * voraus … darunter Vorlagen Japan, aus dem aktuellen Japan-Meta von Tier 1
 * bis Tier 3 von jedem Deck eine Vorlage.“ Laeuft im Wochenlauf nach
 * scripts/showdown_vorlagen.js.
 *
 * WOHER JEDE ZAHL KOMMT
 *   Tier 1–3   genau die Einteilung der Seite „City League“ (js/app-tier-meta.js,
 *              renderCityLeagueTierList): Archetypen aus
 *              city_league_archetypes_comparison.csv, Schreibwege zusammengelegt
 *              mit legeSchreibwegeZusammen (js/app-utils.js, ausgefuehrt, nicht
 *              abgeschrieben), absteigend nach new_count; Rang 1–3 Tier 1,
 *              4–10 Tier 2, 11–20 Tier 3.
 *   Liste      eine vollstaendige Einzelliste: city_league_analysis.csv, Zeilen
 *              eines Turniers und Archetyps mit total_decks_in_archetype = 1
 *              (genau ein Deck dieses Archetyps im Turnier) und 60 Karten.
 *              Platz und Datum aus city_league_archetypes.csv. Gewaehlt wird der
 *              beste Platz, bei Gleichstand das juengste Turnier.
 *   Karten     (Set, Nummer) wie in der Quelle. Drucke ohne internationalen
 *              Druck holt scripts/showdown_jp_karten.py (inoffizielle
 *              Uebersetzung) — nie ueber den Namen.
 *   Fehlt eine Liste, steht der Archetyp in _meta.ohne_liste — mit Grund.
 *
 * Aufruf: node scripts/showdown_vorlagen_jp.js [--pruefen]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const V = require('./showdown_vorlagen.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ZIEL = path.join(DATA, 'showdown_vorlagen_jp.json');
const lies = (d) => fs.readFileSync(path.join(DATA, d), 'utf8').replace(/^﻿/, '');
const zahl = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function schneideFunktion(quelle, name) {
    const start = quelle.indexOf('function ' + name + '(');
    if (start === -1) throw new Error(`${name} ist in der Quelle nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    throw new Error(`${name} hat keine schliessende Klammer`);
}

/** Die beiden Helfer der Seite, ausgefuehrt aus js/app-utils.js. */
function schreibwegHelfer() {
    const UT = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
    return new Function([
        schneideFunktion(UT, 'archetypSchreibwegSchluessel'),
        schneideFunktion(UT, 'legeSchreibwegeZusammen'),
        'return { archetypSchreibwegSchluessel, legeSchreibwegeZusammen };',
    ].join('\n'))();
}

const MONAT = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
/** „02 Nov 26“ → „2026-11-02“ */
function isoDatum(t) {
    const m = /^(\d{1,2}) (\w{3}) (\d{2})$/.exec(String(t || '').trim());
    return m && MONAT[m[2]] ? `20${m[3]}-${MONAT[m[2]]}-${m[1].padStart(2, '0')}` : '';
}

/** Tier 1–3 wie auf der Seite „City League“: Rangliste nach Listenzahl. */
function tierEinteilung(comparison, helfer) {
    const zahlVon = (r) => parseInt(String(r.new_count || r.count || r.old_count || 0).replace(',', '.'), 10) || 0;
    const kopie = comparison.map((r) => ({ ...r }));
    const { zeilen } = helfer.legeSchreibwegeZusammen(kopie, zahlVon, (ziel, quelle) => {
        ziel.new_count = String(zahlVon(ziel) + zahlVon(quelle));
    });
    return zeilen
        .sort((a, b) => zahlVon(b) - zahlVon(a))
        .slice(0, 20)
        .map((r, i) => ({ archetyp: String(r.archetype).trim(), tier: i <= 2 ? 1 : i <= 9 ? 2 : 3, listen: zahlVon(r), rang: i + 1 }));
}

/**
 * Zweiter Schluessel ohne das Wort „Mega“: die Platzierungsdatei schreibt
 * „Lucario Hariyama“, die Kartendatei „Mega Lucario Hariyama“ (gemessen
 * 05.11.2026). Er gilt nur als Rueckfall und nur, wenn er im selben Turnier
 * genau EINEN Treffer hat — sonst bleibt die Liste ohne Platz (und faellt weg).
 */
const ohneMega = (k) => k.split(' ').filter((w) => w !== 'mega').join(' ');

/** Beste Einzelliste je Schreibweg-Schluessel. */
function besteListen(analyse, archetypen, helfer) {
    const platz = new Map();
    const lose = new Map(); // tid|ohneMega → Eintraege
    for (const a of archetypen) {
        const schl = helfer.archetypSchreibwegSchluessel(a.archetype);
        const k = `${a.tournament_id}|${schl}`;
        const p = parseInt(a.placement, 10) || 999;
        const eintrag = { platz: p, datum: isoDatum(a.date), spieler: a.player || null, name: a.archetype };
        const alt = platz.get(k);
        if (!alt || p < alt.platz) platz.set(k, eintrag);
        const kl = `${a.tournament_id}|${ohneMega(schl)}`;
        if (!lose.has(kl)) lose.set(kl, new Map());
        lose.get(kl).set(schl, eintrag);
    }
    const platzFuer = (tid, schl) => {
        const genau = platz.get(`${tid}|${schl}`);
        if (genau) return genau;
        const kand = lose.get(`${tid}|${ohneMega(schl)}`);
        return kand && kand.size === 1 ? [...kand.values()][0] : null;
    };
    const gruppen = new Map();
    for (const z of analyse) {
        if (String(z.total_decks_in_archetype).trim() !== '1') continue;
        const k = `${z.tournament_id}|${helfer.archetypSchreibwegSchluessel(z.archetype)}`;
        if (!gruppen.has(k)) gruppen.set(k, { turnier: z.tournament_id, archetypRoh: z.archetype, karten: [] });
        gruppen.get(k).karten.push({ anzahl: parseInt(z.total_count, 10) || 0, name: z.card_name, set: z.set_code, nummer: String(z.set_number), typ: z.type || '' });
    }
    const beste = new Map();
    for (const [k, g] of gruppen) {
        if (g.karten.reduce((s, c) => s + c.anzahl, 0) !== 60) continue;
        const schl = k.slice(k.indexOf('|') + 1);
        const p = platzFuer(g.turnier, schl);
        if (!p) continue;
        const alt = beste.get(schl);
        const besser = !alt || p.platz < alt.platz || (p.platz === alt.platz && p.datum > alt.datum);
        if (besser) beste.set(schl, { ...p, turnier: g.turnier, archetypRoh: g.archetypRoh, karten: g.karten });
    }
    // Rueckfall-Index ohne „Mega“, nur eindeutige
    const ohne = new Map();
    for (const [schl, m] of beste) { const k = ohneMega(schl); ohne.set(k, ohne.has(k) ? null : m); }
    beste.ohneMega = ohne;
    return beste;
}

function erzeuge() {
    const helfer = schreibwegHelfer();
    const fw = JSON.parse(lies('format_window.json'));
    const tiers = tierEinteilung(V.csv(lies('city_league_archetypes_comparison.csv'), ';'), helfer);
    const beste = besteListen(V.csv(lies('city_league_analysis.csv'), ';'), V.csv(lies('city_league_archetypes.csv'), ';'), helfer);
    const vorlagen = [], ohneListe = [];
    for (const t of tiers) {
        const schl = helfer.archetypSchreibwegSchluessel(t.archetyp);
        const m = beste.get(schl) || beste.ohneMega.get(ohneMega(schl)) || null;
        if (!m) { ohneListe.push({ archetyp: t.archetyp, tier: t.tier, grund: 'keine vollstaendige Einzelliste (60 Karten, ein Deck im Turnier) mit Platzierung' }); continue; }
        vorlagen.push({
            archetyp: t.archetyp, tier: t.tier, quelle: 'city-league', turnier: 'City League (JP)', turnier_id: m.turnier,
            datum: m.datum, platz: m.platz, spieler: m.spieler, archetyp_liste: m.archetypRoh,
            titel: V.titelkarte(t.archetyp, m.karten),
            karten: m.karten.map(({ anzahl, name, set, nummer }) => ({ anzahl, name, set, nummer })),
        });
    }
    return {
        _meta: {
            beschreibung: 'Deckvorlagen fuer TCG Showdown aus dem Japan-Meta: Tier 1–3 wie die Seite „City League“, je Archetyp die bestplatzierte (bei Gleichstand juengste) vollstaendige Einzelliste. Erzeugt von scripts/showdown_vorlagen_jp.js.',
            format_jp: fw.current_set_jp || null,
            tier_quelle: 'js/app-tier-meta.js renderCityLeagueTierList (Rang 1–3 / 4–10 / 11–20 nach Listenzahl, Schreibwege zusammengelegt)',
            ohne_liste: ohneListe,
            anzahl: vorlagen.length,
        },
        vorlagen,
    };
}

if (require.main === module) {
    const neu = erzeuge();
    const text = JSON.stringify(neu, null, 1) + '\n';
    if (process.argv.includes('--pruefen')) {
        const alt = fs.existsSync(ZIEL) ? fs.readFileSync(ZIEL, 'utf8') : '';
        if (alt !== text) { console.error('data/showdown_vorlagen_jp.json ist nicht aktuell — node scripts/showdown_vorlagen_jp.js'); process.exit(1); }
        console.log('data/showdown_vorlagen_jp.json ist aktuell');
    } else {
        fs.writeFileSync(ZIEL, text);
        console.log(`Japan-Vorlagen: ${neu._meta.anzahl} (JP-Format ${neu._meta.format_jp})`);
        for (const o of neu._meta.ohne_liste) console.log(`::warning::keine Japan-Vorlage fuer ${o.archetyp} (Tier ${o.tier}): ${o.grund}`);
    }
}

module.exports = { erzeuge, tierEinteilung, besteListen, isoDatum, schreibwegHelfer, ohneMega };
