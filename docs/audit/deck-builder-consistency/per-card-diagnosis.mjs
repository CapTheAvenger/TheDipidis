#!/usr/bin/env node
// =====================================================================
// Per-Card Diagnosis — Lucario Hariyama + Maximum Belt
//
// USAGE: node docs/audit/deck-builder-consistency/per-card-diagnosis.mjs
//
// Goal: produce a single table that shows, for EVERY card that appears
// in any Lucario Hariyama bucket (Online or Major), what each data
// source says vs what the algorithm picks vs what the user's ground-
// truth tournament breakdown says — so we can see ALL discrepancies in
// one pass before any more code changes.
//
// Replicates the exact code paths in js/app-deck-builder.js:
//   - _recencyWeight                       (line 4423)
//   - _aceSpecConditionalAvgsMulti         (line 6069)   ← post-Fix-C
//   - Per-bucket avgs from the CSVs
//   - Math.round of the multi-source ACE-cond avg = Stage-1 floor
//   - Energy Floor target = sum(round(per-card)) clipped to [7, 11]
//                                                  (line 5325)
//   - Energy Ceiling target = same                  (line 5439)
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── CSV-Parser ────────────────────────────────────────────────────────
function loadCsv(relPath) {
    const full = path.join(REPO_ROOT, relPath);
    const text = fs.readFileSync(full, 'utf8');
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const header = lines[0].split(';');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const cols = line.split(';');
        const row = {};
        for (let j = 0; j < header.length; j++) {
            row[header[j]] = cols[j] != null ? cols[j] : '';
        }
        rows.push(row);
    }
    return rows;
}

// ── Algorithm primitives (verbatim from app-deck-builder.js) ─────────
function recencyWeight(ageDays) {
    if (!Number.isFinite(ageDays) || ageDays < 0) return 1.0;
    if (ageDays <= 7) return 1.0;
    if (ageDays <= 21) return 1.0 - ((ageDays - 7) / 14) * 0.6;
    if (ageDays <= 42) return 0.4 - ((ageDays - 21) / 21) * 0.3;
    return 0.05;
}

function parseDateMs(s) {
    if (!s) return null;
    const cleaned = String(s).replace(/(\d+)(st|nd|rd|th)/g, '$1');
    const d = new Date(cleaned);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function stripPriceTag(s) {
    return String(s || '').replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '').trim();
}

// Match _aceSpecConditionalAvgsMulti (line 6069) but also return per-
// bucket detail so we can show WHICH tournaments contributed.
function aceSpecConditionalAvgsMulti(sources, archetypeKey, aceSpecLower, todayMs, opts = {}) {
    const archKey = String(archetypeKey).trim().toLowerCase();
    const aceSpec = String(aceSpecLower).trim().toLowerCase();

    const buckets = new Map();
    const bucketDates = new Map();
    const bucketSourceWeight = new Map();
    const bucketSourceLabel = new Map();

    for (const src of sources) {
        if (!src || !Array.isArray(src.rows) || src.rows.length === 0) continue;
        const sourceWeight = Number.isFinite(src.sourceWeight) && src.sourceWeight > 0
            ? src.sourceWeight : 1.0;
        const normalizer = src.archetypeFieldNormalizer;
        for (const r of src.rows) {
            const archRaw = String(r.archetype || '');
            const archNorm = normalizer ? normalizer(archRaw) : archRaw;
            if (archNorm.trim().toLowerCase() !== archKey) continue;
            const tid = r.tournament_id || '';
            const cn = String(r.card_name || '').trim().toLowerCase();
            if (!tid || !cn) continue;
            const avgRaw = parseFloat(String(r.average_count || '0').replace(',', '.'));
            if (!Number.isFinite(avgRaw) || avgRaw <= 0) continue;
            const k = `${sourceWeight}|${tid}|${archNorm}`;
            if (!buckets.has(k)) buckets.set(k, new Map());
            buckets.get(k).set(cn, avgRaw);
            if (!bucketDates.has(k)) {
                const ms = parseDateMs(r.tournament_date);
                if (ms) bucketDates.set(k, ms);
            }
            bucketSourceWeight.set(k, sourceWeight);
            if (!bucketSourceLabel.has(k)) {
                bucketSourceLabel.set(k, `${src.label || '?'}/${r.tournament_name || tid}`);
            }
        }
    }

    const matching = [];
    for (const [k, cards] of buckets.entries()) {
        if (!cards.has(aceSpec)) continue;
        matching.push({
            key: k,
            cards,
            dateMs: bucketDates.get(k),
            sourceWeight: bucketSourceWeight.get(k) || 1.0,
            label: bucketSourceLabel.get(k) || '?',
        });
    }
    if (matching.length === 0) return { conditionalAvgs: new Map(), bucketCount: 0, matching: [] };

    const sums = new Map();
    const weights = new Map();
    const presence = new Map();
    const perCardBuckets = new Map(); // cn → [{label, avg, recency, sourceWeight, totalW}]
    for (const { cards, dateMs, sourceWeight, label } of matching) {
        let recency = 1.0;
        if (Number.isFinite(dateMs)) {
            const ageDays = Math.max(0, Math.floor((todayMs - dateMs) / 86400000));
            recency = recencyWeight(ageDays);
        }
        const w = recency * sourceWeight;
        for (const [cn, avg] of cards) {
            sums.set(cn, (sums.get(cn) || 0) + avg * w);
            weights.set(cn, (weights.get(cn) || 0) + w);
            presence.set(cn, (presence.get(cn) || 0) + 1);
            if (!perCardBuckets.has(cn)) perCardBuckets.set(cn, []);
            perCardBuckets.get(cn).push({ label, avg, recency, sourceWeight, w });
        }
    }
    const conditionalAvgs = new Map();
    for (const [cn, sum] of sums) {
        const w = weights.get(cn) || 1;
        conditionalAvgs.set(cn, {
            avg: sum / w,
            presence: presence.get(cn) || 0,
            buckets: perCardBuckets.get(cn) || [],
        });
    }
    return { conditionalAvgs, bucketCount: matching.length, matching };
}

// ── Same, but WITHOUT the ACE-SPEC filter — baseline reference. ──────
function unconditionalAvgsMulti(sources, archetypeKey, todayMs) {
    const archKey = String(archetypeKey).trim().toLowerCase();
    const buckets = new Map();
    const bucketDates = new Map();
    const bucketSourceWeight = new Map();
    for (const src of sources) {
        if (!src || !Array.isArray(src.rows) || src.rows.length === 0) continue;
        const sourceWeight = Number.isFinite(src.sourceWeight) && src.sourceWeight > 0
            ? src.sourceWeight : 1.0;
        const normalizer = src.archetypeFieldNormalizer;
        for (const r of src.rows) {
            const archRaw = String(r.archetype || '');
            const archNorm = normalizer ? normalizer(archRaw) : archRaw;
            if (archNorm.trim().toLowerCase() !== archKey) continue;
            const tid = r.tournament_id || '';
            const cn = String(r.card_name || '').trim().toLowerCase();
            if (!tid || !cn) continue;
            const avgRaw = parseFloat(String(r.average_count || '0').replace(',', '.'));
            if (!Number.isFinite(avgRaw) || avgRaw <= 0) continue;
            const k = `${sourceWeight}|${tid}|${archNorm}`;
            if (!buckets.has(k)) buckets.set(k, new Map());
            buckets.get(k).set(cn, avgRaw);
            if (!bucketDates.has(k)) {
                const ms = parseDateMs(r.tournament_date);
                if (ms) bucketDates.set(k, ms);
            }
            bucketSourceWeight.set(k, sourceWeight);
        }
    }
    const matching = [];
    for (const [k, cards] of buckets.entries()) {
        matching.push({ cards, dateMs: bucketDates.get(k), sourceWeight: bucketSourceWeight.get(k) || 1.0 });
    }
    const sums = new Map();
    const weights = new Map();
    const presence = new Map();
    for (const { cards, dateMs, sourceWeight } of matching) {
        const ageDays = dateMs ? Math.max(0, Math.floor((todayMs - dateMs) / 86400000)) : 0;
        const w = recencyWeight(ageDays) * sourceWeight;
        for (const [cn, avg] of cards) {
            sums.set(cn, (sums.get(cn) || 0) + avg * w);
            weights.set(cn, (weights.get(cn) || 0) + w);
            presence.set(cn, (presence.get(cn) || 0) + 1);
        }
    }
    const out = new Map();
    for (const [cn, sum] of sums) {
        const w = weights.get(cn) || 1;
        out.set(cn, { avg: sum / w, presence: presence.get(cn) || 0 });
    }
    return { conditionalAvgs: out, bucketCount: matching.length };
}

// ── Per-source raw avgs (for debugging which source is pulling) ──────
function perSourceBucketAvgs(rows, archetypeKey, aceSpecLower, archetypeFieldNormalizer, todayMs) {
    const archKey = String(archetypeKey).trim().toLowerCase();
    const aceSpec = aceSpecLower ? String(aceSpecLower).trim().toLowerCase() : null;
    const buckets = new Map(); // tid → { date, cards: Map<cn, avg>, name }
    for (const r of rows) {
        const archRaw = String(r.archetype || '');
        const archNorm = archetypeFieldNormalizer ? archetypeFieldNormalizer(archRaw) : archRaw;
        if (archNorm.trim().toLowerCase() !== archKey) continue;
        const tid = r.tournament_id || '';
        const cn = String(r.card_name || '').trim().toLowerCase();
        if (!tid || !cn) continue;
        const avgRaw = parseFloat(String(r.average_count || '0').replace(',', '.'));
        if (!Number.isFinite(avgRaw) || avgRaw <= 0) continue;
        const bk = `${tid}|${archNorm}`;
        if (!buckets.has(bk)) {
            buckets.set(bk, {
                tid,
                name: r.tournament_name || tid,
                date: r.tournament_date || '',
                dateMs: parseDateMs(r.tournament_date),
                cards: new Map(),
            });
        }
        buckets.get(bk).cards.set(cn, avgRaw);
    }
    const all = Array.from(buckets.values());
    const aceFiltered = aceSpec ? all.filter(b => b.cards.has(aceSpec)) : all;
    return { all, aceFiltered };
}

// ─────────────────────────────────────────────────────────────────────
// 1. Load data sources
// ─────────────────────────────────────────────────────────────────────
const onlineDated = loadCsv('data/online_tournament_dated_cards.csv');
const majorDated = loadCsv('data/tournament_cards_data_cards_TEF-POR.csv');

const ARCHETYPE = 'Lucario Hariyama';
const ACE_SPEC = 'Maximum Belt';
const TODAY = new Date('2026-05-23T00:00:00Z').getTime();
const SOURCE_WEIGHT_ONLINE = 1.0;
const SOURCE_WEIGHT_MAJOR = 1.5;

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`PER-CARD DIAGNOSIS — ${ARCHETYPE} + ${ACE_SPEC}`);
console.log(`Today = 2026-05-23 | SOURCE_WEIGHT_ONLINE=${SOURCE_WEIGHT_ONLINE}, SOURCE_WEIGHT_MAJOR=${SOURCE_WEIGHT_MAJOR}`);
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────
// 2. Per-source bucket inspection (so we can show which tournaments)
// ─────────────────────────────────────────────────────────────────────
const onlineBuckets = perSourceBucketAvgs(onlineDated, ARCHETYPE, ACE_SPEC, null, TODAY);
const majorBuckets = perSourceBucketAvgs(majorDated, ARCHETYPE, ACE_SPEC, stripPriceTag, TODAY);

console.log(`ONLINE buckets — all: ${onlineBuckets.all.length}, with ${ACE_SPEC}: ${onlineBuckets.aceFiltered.length}`);
for (const b of onlineBuckets.aceFiltered) {
    const age = Math.floor((TODAY - (b.dateMs || TODAY)) / 86400000);
    console.log(`  • ${b.date} (${age}d, w=${recencyWeight(age).toFixed(2)}) — ${b.name}`);
}
console.log();
console.log(`MAJOR buckets — all: ${majorBuckets.all.length}, with ${ACE_SPEC}: ${majorBuckets.aceFiltered.length}`);
for (const b of majorBuckets.aceFiltered) {
    const age = Math.floor((TODAY - (b.dateMs || TODAY)) / 86400000);
    console.log(`  • ${b.date} (${age}d, w=${recencyWeight(age).toFixed(2)}) — ${b.name}`);
}
console.log();

// ─────────────────────────────────────────────────────────────────────
// 3. Multi-source ACE-conditional + unconditional baseline
// ─────────────────────────────────────────────────────────────────────
const sources = [
    { rows: onlineDated, sourceWeight: SOURCE_WEIGHT_ONLINE, archetypeFieldNormalizer: null, label: 'Online' },
    { rows: majorDated, sourceWeight: SOURCE_WEIGHT_MAJOR, archetypeFieldNormalizer: stripPriceTag, label: 'Major' },
];

const ace = aceSpecConditionalAvgsMulti(sources, ARCHETYPE, ACE_SPEC, TODAY);
const uncon = unconditionalAvgsMulti(sources, ARCHETYPE, TODAY);

console.log(`Multi-source ACE-cond buckets: ${ace.bucketCount} (= Online ${onlineBuckets.aceFiltered.length} + Major ${majorBuckets.aceFiltered.length})`);
console.log(`Unconditional baseline buckets: ${uncon.bucketCount}\n`);

// ─────────────────────────────────────────────────────────────────────
// 4. Ground-truth tournament data (from fixture)
// ─────────────────────────────────────────────────────────────────────
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/lucario-baseline.json'), 'utf8'));
const gt = fixture.ground_truth_major_tournaments;

// Map limitless field names to lowercase card names from CSV
const groundTruth = {
    "wally's compassion":          { utrecht: gt.Utrecht.wallys_compassion_avg, campinas: gt.Campinas.wallys_compassion_avg, la: gt.LA.wallys_compassion_avg, prague: gt.Prague.wallys_compassion_avg },
    "maximum belt":                { utrecht: gt.Utrecht.maximum_belt_avg,      campinas: gt.Campinas.maximum_belt_avg,      la: gt.LA.maximum_belt_avg,      prague: gt.Prague.maximum_belt_avg },
    "fighting energy":             { utrecht: gt.Utrecht.fighting_energy_avg,   campinas: gt.Campinas.fighting_energy_avg,   la: gt.LA.fighting_energy_avg,   prague: gt.Prague.fighting_energy_avg },
    "rocky fighting energy":       { utrecht: gt.Utrecht.rocky_fighting_energy_avg, campinas: gt.Campinas.rocky_fighting_energy_avg, la: gt.LA.rocky_fighting_energy_avg, prague: gt.Prague.rocky_fighting_energy_avg },
    "night stretcher":             { utrecht: gt.Utrecht.night_stretcher_avg,   campinas: gt.Campinas.night_stretcher_avg,   la: gt.LA.night_stretcher_avg,   prague: gt.Prague.night_stretcher_avg },
    "riolu":                       { utrecht: gt.Utrecht.riolu_avg,             campinas: gt.Campinas.riolu_avg,             la: gt.LA.riolu_avg,             prague: gt.Prague.riolu_avg },
    "gravity mountain":            { utrecht: gt.Utrecht.gravity_mountain_avg,  campinas: gt.Campinas.gravity_mountain_avg,  la: gt.LA.gravity_mountain_avg,  prague: gt.Prague.gravity_mountain_avg },
};
// Weighted-by-deck-count GT avg (matches Limitless overall-avg method)
function gtWeighted(cn) {
    const g = groundTruth[cn]; if (!g) return null;
    const tot =
        g.utrecht  * gt.Utrecht.total_decks +
        g.campinas * gt.Campinas.total_decks +
        g.la       * gt.LA.total_decks +
        g.prague   * gt.Prague.total_decks;
    const den = gt.Utrecht.total_decks + gt.Campinas.total_decks + gt.LA.total_decks + gt.Prague.total_decks;
    return den > 0 ? tot / den : null;
}

// ─────────────────────────────────────────────────────────────────────
// 5. Build per-card universe (union of all card-names across both
//    sources' ACE-filtered buckets) + classify likely tier from card_name
// ─────────────────────────────────────────────────────────────────────
const allCards = new Set();
for (const { cards } of [...onlineBuckets.aceFiltered, ...majorBuckets.aceFiltered]) {
    for (const cn of cards.keys()) allCards.add(cn);
}

// Approximate per-source ACE-cond avg (NOT multi-blended) — for debug
function perSourceAceCondAvg(bucketList, cn, todayMs) {
    let sum = 0, w = 0, presence = 0;
    for (const b of bucketList) {
        if (!b.cards.has(cn)) continue;
        const age = b.dateMs ? Math.max(0, Math.floor((todayMs - b.dateMs) / 86400000)) : 0;
        const rw = recencyWeight(age);
        sum += b.cards.get(cn) * rw;
        w += rw;
        presence += 1;
    }
    return w > 0 ? { avg: sum / w, presence } : null;
}

// ─────────────────────────────────────────────────────────────────────
// 6. Per-card discrepancy table
// ─────────────────────────────────────────────────────────────────────
const rows = [];
for (const cn of allCards) {
    const onlineOnly = perSourceAceCondAvg(onlineBuckets.aceFiltered, cn, TODAY);
    const majorOnly  = perSourceAceCondAvg(majorBuckets.aceFiltered, cn, TODAY);
    const aceCond    = ace.conditionalAvgs.get(cn);
    const unconBase  = uncon.conditionalAvgs.get(cn);
    const gtAvg      = gtWeighted(cn);

    rows.push({
        card: cn,
        onlineAvg: onlineOnly ? onlineOnly.avg : null,
        onlinePresence: onlineOnly ? onlineOnly.presence : 0,
        majorAvg: majorOnly ? majorOnly.avg : null,
        majorPresence: majorOnly ? majorOnly.presence : 0,
        multiAceAvg: aceCond ? aceCond.avg : null,
        multiAcePresence: aceCond ? aceCond.presence : 0,
        unconAvg: unconBase ? unconBase.avg : null,
        unconPresence: unconBase ? unconBase.presence : 0,
        gtAvg,
    });
}

// Sort: cards with the largest |multi-ACE-cond − GT| first (= biggest mismatch)
rows.sort((a, b) => {
    const da = (a.multiAceAvg != null && a.gtAvg != null) ? Math.abs(a.multiAceAvg - a.gtAvg) : -1;
    const db = (b.multiAceAvg != null && b.gtAvg != null) ? Math.abs(b.multiAceAvg - b.gtAvg) : -1;
    if (db !== da) return db - da;
    return (b.multiAceAvg || 0) - (a.multiAceAvg || 0);
});

// ── Render ────────────────────────────────────────────────────────────
function fmt(x, w = 5, p = 2) {
    if (x == null || !Number.isFinite(x)) return '  —  '.padStart(w);
    return x.toFixed(p).padStart(w);
}
function padCard(s, w = 30) {
    if (s.length > w) return s.slice(0, w - 1) + '…';
    return s.padEnd(w);
}

console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('PER-CARD TABLE — sorted by |multi-source ACE-cond − ground-truth| (biggest mismatch first)');
console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════');
console.log('Card                          | Online ACE  | Major ACE   | MULTI ACE   | NoACE base  | GroundTruth | Round | Δ vs GT');
console.log('                              |  avg  pres  |  avg  pres  |  avg  pres  |  avg  pres  |  weighted   | (use) | (round)');
console.log('-------------------------------------------------------------------------------------------------------------------');

for (const r of rows) {
    const round = (r.multiAceAvg != null && Number.isFinite(r.multiAceAvg))
        ? Math.round(r.multiAceAvg)
        : null;
    const delta = (r.multiAceAvg != null && r.gtAvg != null)
        ? r.multiAceAvg - r.gtAvg
        : null;
    const roundGt = r.gtAvg != null ? Math.round(r.gtAvg) : null;
    const roundDelta = (round != null && roundGt != null) ? (round - roundGt) : null;
    const flag = (roundDelta != null && Math.abs(roundDelta) >= 1)
        ? '  ⚠'
        : (delta != null && Math.abs(delta) >= 0.3 ? '  •' : '');
    console.log(
        `${padCard(r.card)} | ${fmt(r.onlineAvg)}  ${String(r.onlinePresence).padStart(3)}  |` +
        ` ${fmt(r.majorAvg)}  ${String(r.majorPresence).padStart(3)}  |` +
        ` ${fmt(r.multiAceAvg)}  ${String(r.multiAcePresence).padStart(3)}  |` +
        ` ${fmt(r.unconAvg)}  ${String(r.unconPresence).padStart(3)}  |` +
        `   ${fmt(r.gtAvg)}    |` +
        `   ${round != null ? String(round).padStart(2) : ' —'}  |` +
        `  ${fmt(delta, 5, 2)}${flag}`
    );
}

// ─────────────────────────────────────────────────────────────────────
// 7. Energy totals — predict what Energy Floor / Ceiling target is
// ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('ENERGY-TARGET PREDICTION (Energy Floor + Ceiling logic, line 5316/5457)');
console.log('═══════════════════════════════════════════════════════════════════════════');
const energyCardNames = new Set();
for (const r of rows) {
    if (/energy/.test(r.card)) energyCardNames.add(r.card);
}
let perCardSum = 0, perCardSumRaw = 0;
for (const cn of energyCardNames) {
    const r = rows.find(x => x.card === cn);
    if (!r) continue;
    const presence = r.multiAcePresence;
    const avg = r.multiAceAvg;
    if (avg == null || presence < 3) continue;
    const rounded = Math.max(0, Math.round(avg));
    perCardSum += rounded;
    perCardSumRaw += avg;
    console.log(`  ${padCard(cn)}  avg ${avg.toFixed(3)}  presence ${presence}  → round = ${rounded}`);
}
const corridor = Math.max(7, Math.min(11, perCardSum));
console.log(`\n  Sum-of-rounded         = ${perCardSum}`);
console.log(`  Sum-of-raw-avg         = ${perCardSumRaw.toFixed(3)}`);
console.log(`  Corridor-clipped [7,11] = ${corridor}      ← Energy Floor target`);
console.log(`  Algorithm DELIVERED    = 10 (runtime per fixture)`);
console.log(`  Discrepancy            = ${corridor - 10}`);

// ─────────────────────────────────────────────────────────────────────
// 8. Top 5 biggest-discrepancy cards (summary)
// ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('TOP DISCREPANCIES (Math.round(multi) ≠ Math.round(GT))');
console.log('═══════════════════════════════════════════════════════════════════════════');
const offBy = rows.filter(r => {
    const a = r.multiAceAvg != null ? Math.round(r.multiAceAvg) : null;
    const b = r.gtAvg != null ? Math.round(r.gtAvg) : null;
    return a != null && b != null && a !== b;
});
if (offBy.length === 0) {
    console.log('  (none — algorithm matches user ground truth on every card with GT data)');
} else {
    for (const r of offBy) {
        console.log(
            `  • ${padCard(r.card, 24)} multi=${r.multiAceAvg.toFixed(2)} (round ${Math.round(r.multiAceAvg)}) ` +
            `vs GT=${r.gtAvg.toFixed(2)} (round ${Math.round(r.gtAvg)}) — Δ ${(r.multiAceAvg - r.gtAvg).toFixed(2)}`
        );
    }
}

// ─────────────────────────────────────────────────────────────────────
// 9. Cards in ground-truth but NOT in the algorithm's universe
// ─────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('GROUND-TRUTH CARDS MISSING FROM THE MULTI-ACE-COND UNIVERSE');
console.log('═══════════════════════════════════════════════════════════════════════════');
for (const cn of Object.keys(groundTruth)) {
    if (!allCards.has(cn)) {
        console.log(`  ⚠ ${cn} — present in fixture GT but NOT in any ACE-filtered bucket`);
    }
}
console.log('  (cards listed above will get their value from the unconditional path or be missing entirely)');
