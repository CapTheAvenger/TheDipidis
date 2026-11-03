#!/usr/bin/env node
/**
 * Vorlagen fuer TCG Showdown (thedipidis.app/showdown/) — data/showdown_vorlagen.json
 *
 * Bestellung Hausi, 02.11.2026: „Von dem aktuellen internationalen Meta die
 * Archetypes von Tier 1 bis Tier 3 nehmen und dann vom letzten aktuellen Major
 * die beste Liste dort als Vorlage hinterlegen. Ist ein Deck dort nicht dabei,
 * die beste letzte Online-Liste." Laeuft im Wochenlauf (Dienstag/Freitag); ein
 * neues Major wird dadurch automatisch zur Quelle.
 *
 * WOHER JEDE ZAHL KOMMT
 *   Tier 1–3   genau die Einteilung der Seite „Aktuelles Meta“: die Funktionen
 *              computeTierScore / aggregateLabsRowsByDeck und die Grenzen
 *              (T1_MAX, T1_MIN_WR …) werden aus js/app-tier-meta.js gelesen und
 *              ausgefuehrt, nicht abgeschrieben. Eingaben wie dort:
 *              limitless_online_decks_comparison.csv, limitless_online_decks.csv,
 *              labs_tournament_decks_<Format>.csv.
 *   Major      juengstes Turnier aus labs_tournaments.json, fuer das
 *              tournament_decklists_per_player.csv Listen im laufenden Format
 *              fuehrt. Ein juengeres Major OHNE Listen wird in
 *              _meta.majors_ohne_listen benannt, nicht uebersprungen verschwiegen.
 *   Liste      bestplatzierte Liste des Archetyps auf diesem Major; Turniernamen
 *              werden ueber die Namensbruecke der Seite (_kanonName,
 *              archetype_aliases.json) auf die Ladder-Namen gebracht.
 *   Rueckfall  online_best_decklists.json (beste Online-Liste je Archetyp).
 *   Fehlt beides, steht der Archetyp in _meta.ohne_liste — mit Grund.
 *
 * Aufruf: node scripts/showdown_vorlagen.js [--pruefen]
 *   --pruefen  schreibt nichts, meldet nur Abweichung zur vorhandenen Datei (Exit 1)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ZIEL = path.join(DATA, 'showdown_vorlagen.json');

// ── Hilfen ──────────────────────────────────────────────────────────────
function lies(datei) { return fs.readFileSync(path.join(DATA, datei), 'utf8').replace(/^﻿/, ''); }

/** CSV mit Anfuehrungszeichen; liefert Objekte je Zeile. */
function csv(text, trenner) {
    const zeilen = [];
    let feld = '', zeile = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inQ = false; }
            else feld += c;
        } else if (c === '"') inQ = true;
        else if (c === trenner) { zeile.push(feld); feld = ''; }
        else if (c === '\n') { zeile.push(feld.replace(/\r$/, '')); zeilen.push(zeile); zeile = []; feld = ''; }
        else feld += c;
    }
    if (feld !== '' || zeile.length) { zeile.push(feld.replace(/\r$/, '')); zeilen.push(zeile); }
    const kopf = zeilen.shift() || [];
    return zeilen.filter((z) => z.length > 1).map((z) => Object.fromEntries(kopf.map((k, i) => [k, z[i] ?? ''])));
}

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

function schneideKonstante(quelle, name) {
    const m = new RegExp('const ' + name + '\\s*=\\s*([^;]+);').exec(quelle);
    if (!m) throw new Error(`Konstante ${name} ist in der Quelle nicht mehr auffindbar`);
    return m[1].trim();
}

function schneideObjektKonstante(quelle, name) {
    const start = quelle.indexOf('const ' + name + ' = Object.freeze(');
    if (start === -1) throw new Error(`Konstante ${name} ist in der Quelle nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = quelle.indexOf('(', start); j < quelle.length; j++) {
        if (quelle[j] === '(') tiefe++;
        else if (quelle[j] === ')') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1) + ';'; }
    }
    throw new Error(`${name} hat keine schliessende Klammer`);
}

// ── 1. Tier 1–3 wie auf der Seite ───────────────────────────────────────
function tierEinteilung(formatKey) {
    const TIER = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
    const grenzen = {};
    for (const k of ['T1_MAX', 'T2_MAX', 'T3_MAX', 'T1_MIN_SHARE', 'T1_MIN_WR', 'MINDEST_ANTEIL_GROESSTER']) {
        grenzen[k] = Number(schneideKonstante(TIER, k));
        if (!Number.isFinite(grenzen[k])) throw new Error(`Grenze ${k} ist keine Zahl`);
    }
    const fabrik = new Function([
        schneideObjektKonstante(TIER, 'TIER_SCORE'),
        schneideFunktion(TIER, 'computeTierScore'),
        schneideFunktion(TIER, 'aggregateLabsRowsByDeck'),
        'return { computeTierScore, aggregateLabsRowsByDeck };',
    ].join('\n'));
    const { computeTierScore, aggregateLabsRowsByDeck } = fabrik();

    const bilanz = {};
    for (const r of csv(lies('limitless_online_decks.csv'), ';')) {
        const k = String(r.deck_name || '').trim();
        if (k) bilanz[k] = { s: parseInt(r.wins, 10) || 0, n: parseInt(r.losses, 10) || 0 };
    }
    const decks = csv(lies('limitless_online_decks_comparison.csv'), ';').map((d) => {
        const name = String(d.deck_name || '').trim();
        const b = bilanz[name];
        const ohneU = b && (b.s + b.n) > 0 ? b.s / (b.s + b.n) * 100 : null;
        return {
            archetype: name,
            share: zahl(d.new_share),
            winrate: ohneU != null ? ohneU : zahl(d.new_winrate),
            new_count: parseInt(d.new_count || 0, 10) || 0,
        };
    }).filter((d) => d.archetype);
    decks.sort((a, b) => b.share - a.share);

    let labs = null;
    const labsDatei = `labs_tournament_decks_${formatKey}.csv`;
    if (fs.existsSync(path.join(DATA, labsDatei))) labs = aggregateLabsRowsByDeck(csv(lies(labsDatei), ','));

    decks.forEach((d) => { d._s = computeTierScore(d, labs); });
    decks.sort((a, b) => b._s.score - a._s.score);
    const groesste = decks.reduce((m, d) => Math.max(m, d.new_count || 0), 0);
    const mindest = groesste * grenzen.MINDEST_ANTEIL_GROESSTER;
    const tiers = [];
    let t1 = 0, t2 = 0, t3 = 0;
    for (const d of decks) {
        const genug = (d.new_count || 0) >= mindest;
        const labsWR = (d._s.labsHit && labs && labs[d.archetype]) ? (labs[d.archetype].winPct || 0) : 0;
        const wrOK = d._s.adjWR >= grenzen.T1_MIN_WR || labsWR >= grenzen.T1_MIN_WR;
        if (t1 < grenzen.T1_MAX && genug && d.share >= grenzen.T1_MIN_SHARE && wrOK) { tiers.push({ archetyp: d.archetype, tier: 1, anteil: d.share }); t1++; }
        else if (t2 < grenzen.T2_MAX && genug) { tiers.push({ archetyp: d.archetype, tier: 2, anteil: d.share }); t2++; }
        else if (t3 < grenzen.T3_MAX && genug) { tiers.push({ archetyp: d.archetype, tier: 3, anteil: d.share }); t3++; }
    }
    return { tiers, labs: !!labs, grenzen };
}

// ── 2. Namensbruecke der Seite (Turniername → Ladder-Name) ──────────────
function namensbruecke() {
    const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
    const alias = JSON.parse(lies('archetype_aliases.json'));
    const paare = alias.turnier_zu_ladder || [];
    return new Function([
        schneideFunktion(MC, 'normalize'),
        'const _aliasTurnierZuLadder = new Map(' + JSON.stringify(
            paare.map((p) => [p.turnier.toLowerCase().replace(/[\s\-'’]/g, ''), p.ladder])) + ');',
        schneideFunktion(MC, '_kanonName'),
        'return _kanonName;',
    ].join('\n'))();
}

// ── 3. Listen der Majors ────────────────────────────────────────────────
/** Juengstes Major mit Listen; juengere ohne Listen werden mitgenannt. */
function waehleMajor(majors, jeTurnier) {
    const sortiert = majors.filter((t) => t.tournament_id && t.tournament_date)
        .slice().sort((a, b) => String(b.tournament_date).localeCompare(String(a.tournament_date)));
    const ohneListen = [];
    for (const t of sortiert) {
        if (jeTurnier.has(t.tournament_id)) return { major: t, zeilen: jeTurnier.get(t.tournament_id), ohneListen };
        ohneListen.push({ id: t.tournament_id, name: t.tournament_name, datum: t.tournament_date });
        if (ohneListen.length > 6) break;
    }
    return { major: null, zeilen: [], ohneListen };
}

function majorListen(formatKey) {
    const majors = JSON.parse(lies('labs_tournaments.json'));
    const jeTurnier = new Map();
    for (const r of csv(lies('tournament_decklists_per_player.csv'), ',')) {
        if (!r.tournament_id || r.meta !== formatKey) continue; // Online-Listen haben keine tournament_id
        if (!jeTurnier.has(r.tournament_id)) jeTurnier.set(r.tournament_id, []);
        jeTurnier.get(r.tournament_id).push(r);
    }
    return waehleMajor(majors, jeTurnier);
}

function bestenJeArchetyp(zeilen, kanon) {
    // Spieler-Listen zusammensetzen: (Platz, Spieler) → Karten
    const listen = new Map();
    for (const r of zeilen) {
        const k = r.place + '|' + r.player_name;
        if (!listen.has(k)) listen.set(k, {
            platz: parseInt(r.place, 10) || 9999, spieler: r.player_name, archetypRoh: r.deck_archetype,
            archetyp: kanon(r.deck_archetype), spielerzahl: parseInt(r.spielerzahl, 10) || null,
            bilanz: `${r.wins}-${r.losses}-${r.ties}`, karten: [],
        });
        listen.get(k).karten.push({ anzahl: parseInt(r.count, 10) || 0, name: r.card_name, set: r.set_code, nummer: r.set_number, typ: r.type });
    }
    const beste = new Map();
    for (const l of listen.values()) {
        const summe = l.karten.reduce((s, c) => s + c.anzahl, 0);
        if (summe !== 60) continue; // unvollstaendige Liste ist keine Vorlage
        const alt = beste.get(l.archetyp);
        if (!alt || l.platz < alt.platz) beste.set(l.archetyp, l);
    }
    return beste;
}

/** Titelkarte: das Pokémon, dessen Name am besten zum Archetyp passt
 *  (erstes Wort zaehlt doppelt, dann ex/Mega, dann Phase 2, dann Anzahl). */
function titelkarte(archetyp, karten) {
    const woerter = archetyp.toLowerCase().replace(/'s\b/g, '').split(/\s+/).filter((w) => w.length > 2);
    const pokemon = karten.filter((c) => !/energy$/i.test(c.name) && (!c.typ || /basic|stage|mega|pok/i.test(c.typ)));
    const wertung = (c) => {
        const n = c.name.toLowerCase().replace(/'s\b/g, '');
        let w = 0;
        woerter.forEach((x, i) => { if (n.split(/\s+/).includes(x)) w += i === 0 ? 20 : 10; });
        if (/ ex$/i.test(c.name)) w += 3;
        if (/^mega /i.test(c.name)) w += 2;
        if (/stage 2/i.test(c.typ || '')) w += 1;
        return w + c.anzahl / 100;
    };
    const wahl = pokemon.slice().sort((a, b) => wertung(b) - wertung(a))[0] || karten[0];
    return wahl ? { name: wahl.name, set: wahl.set, nummer: wahl.nummer } : null;
}

// ── 4. Standard-legale Drucke (fuer „Meine Decks“ im Simulator) ──────────
/** Bereiche wie "1-206,252,CC30" → Pruefung je Nummer. */
function bereiche(text) {
    const teile = String(text).split(',').map((t) => t.trim()).filter(Boolean);
    return (nr) => teile.some((t) => {
        const m = /^(\d+)-(\d+)$/.exec(t);
        if (m) { const n = Number(nr); return String(n) === String(nr).replace(/^0+(?=\d)/, '') && n >= +m[1] && n <= +m[2]; }
        return t.toUpperCase() === String(nr).toUpperCase().replace(/^0+(?=\d)/, '');
    });
}

/**
 * Ein Druck ist Standard-legal, wenn er selbst ODER ein Druck seiner
 * Nachdruck-Gruppe (Spalte international_prints in all_cards_database.csv —
 * die Gruppierung der Seite, nicht der Name) eine erlaubte Regulierungsmarke
 * traegt. Erlaubt sind die Marke der Karte Nr. 1 des aeltesten legalen Sets
 * (format_window.json) und alle spaeteren.
 */
function legaleDrucke(rm, fw, karten) {
    const tab = {};
    for (const [b, sets] of Object.entries(rm.marks || {})) {
        tab[b] = {};
        for (const [set, ber] of Object.entries(sets)) tab[b][set.toUpperCase()] = bereiche(ber);
    }
    const marke = (set, nr) => { for (const b of Object.keys(tab)) if (tab[b][set]?.(nr)) return b; return null; };
    const ab = marke(String(fw.oldest_legal_set).toUpperCase(), '1');
    if (!ab) throw new Error(`Regulierungsmarke von ${fw.oldest_legal_set} Nr. 1 unbekannt`);
    const erlaubt = Object.keys(tab).filter((b) => b >= ab).sort();
    const legal = new Set();
    for (const k of karten) {
        const eigener = `${String(k.set).toUpperCase()}-${k.number}`;
        const gruppe = String(k.international_prints || '').split(',').map((x) => x.trim()).filter(Boolean);
        if (!gruppe.includes(eigener)) gruppe.push(eigener);
        const ok = gruppe.some((g) => { const i = g.lastIndexOf('-'); const b = marke(g.slice(0, i).toUpperCase(), g.slice(i + 1)); return b && erlaubt.includes(b); });
        if (ok) gruppe.forEach((g) => legal.add(g.toUpperCase()));
    }
    return { erlaubt, drucke: [...legal].sort() };
}

// ── Hauptlauf ───────────────────────────────────────────────────────────
function erzeuge() {
    const fw = JSON.parse(lies('format_window.json'));
    const formatKey = `${String(fw.oldest_legal_set).toUpperCase()}-${String(fw.current_set).toUpperCase()}`;
    const { tiers, labs, grenzen } = tierEinteilung(formatKey);
    const kanon = namensbruecke();
    const { major, zeilen, ohneListen } = majorListen(formatKey);
    const beste = bestenJeArchetyp(zeilen, kanon);
    const online = JSON.parse(lies('online_best_decklists.json'));

    const vorlagen = [], ohneListe = [];
    for (const t of tiers) {
        const m = beste.get(t.archetyp);
        if (m) {
            vorlagen.push({
                archetyp: t.archetyp, tier: t.tier, quelle: 'major',
                turnier: major.tournament_name, datum: major.tournament_date, turnier_id: major.tournament_id,
                platz: m.platz, spieler: m.spieler, bilanz: m.bilanz, archetyp_turnier: m.archetypRoh,
                titel: titelkarte(t.archetyp, m.karten),
                karten: m.karten.map(({ anzahl, name, set, nummer }) => ({ anzahl, name, set, nummer })),
            });
            continue;
        }
        const o = online[t.archetyp];
        const karten = o && Array.isArray(o.cards)
            ? o.cards.map((c) => ({ anzahl: c.count, name: c.name, set: c.set_code, nummer: String(c.set_number), typ: c.type }))
            : [];
        if (karten.length && karten.reduce((s, c) => s + c.anzahl, 0) === 60) {
            vorlagen.push({
                archetyp: t.archetyp, tier: t.tier, quelle: 'online',
                turnier: o.tournament_name, datum: o.tournament_date, platz: o.place_rank ?? null,
                platz_text: o.place || null, spieler: o.player || null, bilanz: o.score || null,
                titel: titelkarte(t.archetyp, karten),
                karten: karten.map(({ anzahl, name, set, nummer }) => ({ anzahl, name, set, nummer })),
            });
        } else {
            ohneListe.push({ archetyp: t.archetyp, tier: t.tier,
                grund: karten.length ? 'Online-Liste hat nicht 60 Karten' : 'weder auf dem Major noch online eine Liste' });
        }
    }
    vorlagen.sort((a, b) => a.tier - b.tier); // stabil: innerhalb des Tiers Reihenfolge der Seite
    return {
        _meta: {
            beschreibung: 'Deckvorlagen fuer TCG Showdown: Tier 1–3 des aktuellen Metas, je Archetyp die bestplatzierte Liste des juengsten Majors mit Listen, sonst die beste Online-Liste. Erzeugt von scripts/showdown_vorlagen.js.',
            format: formatKey,
            tier_quelle: 'js/app-tier-meta.js (computeTierScore, gleiche Grenzen)' + (labs ? ' mit Labs-Auszug' : ' ohne Labs-Auszug'),
            grenzen,
            major: major ? { id: major.tournament_id, name: major.tournament_name, datum: major.tournament_date } : null,
            majors_ohne_listen: ohneListen,
            ohne_liste: ohneListe,
            anzahl: vorlagen.length,
        },
        vorlagen,
    };
}

const ZIEL_LEGAL = path.join(DATA, 'showdown_legal.json');
function erzeugeLegal() {
    const fw = JSON.parse(lies('format_window.json'));
    const { erlaubt, drucke } = legaleDrucke(JSON.parse(lies('regulation_marks.json')), fw, csv(lies('all_cards_database.csv'), ','));
    return {
        _meta: {
            beschreibung: 'Standard-legale Drucke (SET-NUMMER) fuer TCG Showdown: eigene Marke oder ein Nachdruck der Gruppe (international_prints) mit erlaubter Regulierungsmarke. Basis-Energie ist immer legal. Erzeugt von scripts/showdown_vorlagen.js.',
            format: `${String(fw.oldest_legal_set).toUpperCase()}-${String(fw.current_set).toUpperCase()}`,
            erlaubte_marken: erlaubt,
            anzahl: drucke.length,
        },
        drucke,
    };
}

if (require.main === module) {
    fs.writeFileSync(ZIEL_LEGAL, JSON.stringify(erzeugeLegal()) + '\n');
    const neu = erzeuge();
    const text = JSON.stringify(neu, null, 1) + '\n';
    if (process.argv.includes('--pruefen')) {
        const alt = fs.existsSync(ZIEL) ? fs.readFileSync(ZIEL, 'utf8') : '';
        if (alt !== text) { console.error('data/showdown_vorlagen.json ist nicht aktuell — node scripts/showdown_vorlagen.js'); process.exit(1); }
        console.log('data/showdown_vorlagen.json ist aktuell');
    } else {
        fs.writeFileSync(ZIEL, text);
        const m = neu._meta;
        console.log(`Vorlagen: ${m.anzahl} (Format ${m.format}, Major ${m.major ? m.major.name + ' ' + m.major.datum : 'keins'})`);
        if (m.majors_ohne_listen.length) console.log('::warning::Major ohne Listen im Bestand: ' + m.majors_ohne_listen.map((x) => `${x.name} (${x.datum})`).join(', '));
        for (const o of m.ohne_liste) console.log(`::warning::keine Vorlage fuer ${o.archetyp} (Tier ${o.tier}): ${o.grund}`);
    }
}

module.exports = { erzeuge, csv, titelkarte, bestenJeArchetyp, waehleMajor, legaleDrucke, erzeugeLegal };
