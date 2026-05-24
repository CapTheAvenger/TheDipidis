#!/usr/bin/env node
// =====================================================================
// PHASE 5 — Baseline-Verifikation für Deck-Builder Consistency Audit
//
// USAGE: node docs/audit/deck-builder-consistency/verify-baseline.mjs
//
// Was es macht:
//   1. Lädt die echten CSVs (Online + Major)
//   2. Repliziert die ACE-conditional-Berechnung aus _aceSpecConditionalAvgs
//      (line 5976-6048 in js/app-deck-builder.js)
//   3. Vergleicht mit den Werten im fixture (lucario-baseline.json)
//   4. Druckt Pass/Fail pro Assertion
//
// Vor Fix:  alle "current_runtime_state" Assertions PASS,
//           "expected_after_fix" Assertions FAIL (= Spec verletzt)
// Nach Fix: "expected_after_fix" Assertions PASS,
//           current-state-Vergleich zeigt was sich geändert hat
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── CSV-Parser (semicolon-separated, with header) ─────────────────────
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

// ── _recencyWeight from js/app-deck-builder.js:4423 ──────────────────
function recencyWeight(ageDays) {
    if (!Number.isFinite(ageDays) || ageDays < 0) return 1.0;
    if (ageDays <= 7) return 1.0;
    if (ageDays <= 21) return 1.0 - ((ageDays - 7) / 14) * 0.6;
    if (ageDays <= 42) return 0.4 - ((ageDays - 21) / 21) * 0.3;
    return 0.05;
}

// ── W3 Phase 1 — Online attendance weight ────────────────────────────
// Mirrors window._onlineAttendanceWeight in app-deck-builder.js.
// ≥250 players → 0.8; <250 (incl. unknown 0) → 0.2.
function onlineAttendanceWeight(totalPlayers, threshold = 250) {
    const n = parseInt(totalPlayers, 10) || 0;
    return n >= threshold ? 0.8 : 0.2;
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

// ── Replikat von _aceSpecConditionalAvgs (line 5976-6048) ────────────
// W3 Phase 1 — Single-source variant now also captures per-bucket
// total_players so we can apply attendance weighting (Online tier
// 0.8/0.2) the same way the runtime does.
function aceSpecConditionalAvgs(rows, archetypeKey, aceSpecLower, todayMs, applyAttendance = false) {
    const archKey = String(archetypeKey).trim().toLowerCase();
    const aceSpec = String(aceSpecLower).trim().toLowerCase();

    const buckets = new Map();
    const bucketDates = new Map();
    const bucketTotalPlayers = new Map();
    for (const r of rows) {
        const archRaw = stripPriceTag(r.archetype || '');
        if (archRaw.toLowerCase() !== archKey) continue;
        const tid = r.tournament_id || '';
        const cn = String(r.card_name || '').trim().toLowerCase();
        if (!tid || !cn) continue;
        const avgRaw = parseFloat(String(r.average_count || '0').replace(',', '.'));
        if (!Number.isFinite(avgRaw) || avgRaw <= 0) continue;
        const k = `${tid}|${archRaw}`;
        if (!buckets.has(k)) buckets.set(k, new Map());
        buckets.get(k).set(cn, avgRaw);
        if (!bucketDates.has(k)) {
            const ms = parseDateMs(r.tournament_date);
            if (ms) bucketDates.set(k, ms);
        }
        if (!bucketTotalPlayers.has(k)) {
            bucketTotalPlayers.set(k, parseInt(r.total_players || '0', 10) || 0);
        }
    }

    const matching = [];
    for (const [k, cards] of buckets.entries()) {
        if (!cards.has(aceSpec)) continue;
        const attMult = applyAttendance
            ? onlineAttendanceWeight(bucketTotalPlayers.get(k))
            : 1.0;
        matching.push({ cards, dateMs: bucketDates.get(k), key: k, attMult });
    }
    if (matching.length === 0) return { conditionalAvgs: new Map(), bucketCount: 0 };

    const sums = new Map();
    const weights = new Map();
    const presence = new Map();
    for (const { cards, dateMs, attMult } of matching) {
        let w = 1.0 * (attMult || 1.0);
        if (Number.isFinite(dateMs)) {
            const ageDays = Math.max(0, Math.floor((todayMs - dateMs) / 86400000));
            w = recencyWeight(ageDays) * (attMult || 1.0);
        }
        for (const [cn, avg] of cards) {
            sums.set(cn, (sums.get(cn) || 0) + avg * w);
            weights.set(cn, (weights.get(cn) || 0) + w);
            presence.set(cn, (presence.get(cn) || 0) + 1);
        }
    }
    const conditionalAvgs = new Map();
    for (const [cn, sum] of sums) {
        const w = weights.get(cn) || 1;
        conditionalAvgs.set(cn, { avg: sum / w, presence: presence.get(cn) || 0 });
    }
    return { conditionalAvgs, bucketCount: matching.length, matchingBuckets: matching };
}

// ── Test runner ──────────────────────────────────────────────────────
const tests = [];
function expect(name, actual, expected, tolerance = 0.001) {
    const pass = typeof actual === 'number' && typeof expected === 'number'
        ? Math.abs(actual - expected) < tolerance
        : actual === expected;
    tests.push({ name, actual, expected, pass });
}

// ── Multi-source variant (Fix C, PR2) ──────────────────────────────
function aceSpecConditionalAvgsMulti(sources, archetypeKey, aceSpecLower, todayMs) {
    const archKey = String(archetypeKey).trim().toLowerCase();
    const aceSpec = String(aceSpecLower).trim().toLowerCase();

    const buckets = new Map();
    const bucketDates = new Map();
    const bucketEffectiveWeight = new Map();
    for (const src of sources) {
        if (!src || !Array.isArray(src.rows) || src.rows.length === 0) continue;
        const sourceWeight = Number.isFinite(src.sourceWeight) && src.sourceWeight > 0 ? src.sourceWeight : 1.0;
        const normalizer = src.archetypeFieldNormalizer;
        // W3 Phase 1 — per-source attendance weighting toggle.
        const applyAttendance = Boolean(src.applyAttendanceWeight);
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
            if (!bucketEffectiveWeight.has(k)) {
                const attMult = applyAttendance ? onlineAttendanceWeight(r.total_players) : 1.0;
                bucketEffectiveWeight.set(k, sourceWeight * attMult);
            }
        }
    }
    const matching = [];
    for (const [k, cards] of buckets.entries()) {
        if (!cards.has(aceSpec)) continue;
        matching.push({ cards, dateMs: bucketDates.get(k), effectiveWeight: bucketEffectiveWeight.get(k) || 1.0 });
    }
    const sums = new Map();
    const weights = new Map();
    const presence = new Map();
    for (const { cards, dateMs, effectiveWeight } of matching) {
        const ageDays = dateMs ? Math.max(0, Math.floor((todayMs - dateMs) / 86400000)) : null;
        const recency = recencyWeight(ageDays);
        const w = recency * effectiveWeight;
        for (const [cn, avg] of cards) {
            sums.set(cn, (sums.get(cn) || 0) + avg * w);
            weights.set(cn, (weights.get(cn) || 0) + w);
            presence.set(cn, (presence.get(cn) || 0) + 1);
        }
    }
    const conditionalAvgs = new Map();
    for (const [cn, sum] of sums) {
        const w = weights.get(cn) || 1;
        conditionalAvgs.set(cn, { avg: sum / w, presence: presence.get(cn) || 0 });
    }
    return { conditionalAvgs, bucketCount: matching.length };
}

// ── Load fixture + data ───────────────────────────────────────────────
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/lucario-baseline.json'), 'utf8'));
console.log(`▶ Verify baseline for archetype: ${fixture._meta.archetype}`);
console.log(`▶ Ace-Spec pick: ${fixture._meta.ace_spec_pick}\n`);

const onlineDated = loadCsv('data/online_tournament_dated_cards.csv');
const majorDated = loadCsv('data/tournament_cards_data_cards_TEF-POR.csv');
console.log(`✓ Loaded ${onlineDated.length} online rows + ${majorDated.length} major rows`);

const todayMs = new Date('2026-05-23T00:00:00Z').getTime();

// Single-source (Online only, with W3 Phase 1 attendance weighting)
const result = aceSpecConditionalAvgs(
    onlineDated,
    fixture._meta.archetype,
    fixture._meta.ace_spec_pick,
    todayMs,
    true,  // applyAttendance — Online tier 0.8/0.2
);
console.log(`✓ Single-source ACE-conditional (Online, with attendance): ${result.bucketCount} matching buckets`);

// Multi-source (Online + Major blend, with W3 Phase 1 weights)
const SOURCE_WEIGHT_ONLINE = 1.0;
const SOURCE_WEIGHT_MAJOR = 3.0;  // W3 Phase 1 — was 1.5
const resultMulti = aceSpecConditionalAvgsMulti(
    [
        {
            rows: onlineDated,
            sourceWeight: SOURCE_WEIGHT_ONLINE,
            archetypeFieldNormalizer: null,
            applyAttendanceWeight: true,  // W3 Phase 1 — Online tier 0.8/0.2
        },
        {
            rows: majorDated,
            sourceWeight: SOURCE_WEIGHT_MAJOR,
            archetypeFieldNormalizer: stripPriceTag,
            // Major rows have no total_players; relies on source-weight only
        },
    ],
    fixture._meta.archetype,
    fixture._meta.ace_spec_pick,
    todayMs
);
console.log(`✓ Multi-source ACE-conditional (Online + Major, Phase 1 weights): ${resultMulti.bucketCount} matching buckets\n`);

// ── Assertions ────────────────────────────────────────────────────────
//
// W3 Phase 1 changes the expected values vs. the captured pre-Phase-1
// fixture state. Tests reflect post-Phase-1 reality. The fixture file
// (lucario-baseline.json) remains as a historical record of the buggy
// state we set out to fix.

const wally = result.conditionalAvgs.get("wally's compassion");
// Post-Phase-1: single-source Online with attendance weighting brings
// Wally's avg way below the pre-Phase-1 1.92 outlier. The big Online
// event with ≥250 players (TOURNAMENT OF DOOM) gets 0.8× while small
// events with <250 get 0.2× — so the "5 small ML lists run Wally @ 3"
// noise no longer dominates.
expect(
    "W3-P1: Wally single-source avg is below 2.0 (attendance weighting tames outlier)",
    wally ? (wally.avg < 2.0) : false,
    true,
);

// Fighting Energy ACE-conditional avg — fixture target stays valid
// because the Fighting count tends to be uniform across attendance tiers.
const fight = result.conditionalAvgs.get('fighting energy');
expect(
    "Fighting Energy ACE-conditional avg matches runtime (tolerant)",
    fight ? fight.avg : null,
    fixture.current_runtime_state.fighting_energy.avgCountWhenUsed_at_bidi_entry,
    0.5,  // wider tolerance — attendance reweighting shifts this too
);

// Riolu ACE-conditional — Riolu count is part of the line lock so
// it should remain close to 3.5-4 across attendance scenarios.
const riolu = result.conditionalAvgs.get('riolu');
expect(
    "Riolu ACE-conditional avg is between 3.0 and 4.5",
    riolu ? (riolu.avg >= 3.0 && riolu.avg <= 4.5) : false,
    true,
);

// Math.round(Wally) = 1 is the Phase 1 fix target — was 2 pre-Phase-1.
expect(
    "W3-P1 GOAL: Math.round(Wally single-source) = 1 (was 2 pre-Phase-1)",
    wally ? Math.round(wally.avg) : null,
    1,
);

// AC5 framework still valid as a historical anchor
const wallyDelta = fixture.current_runtime_state.ui_vs_allocation_delta.wallys_compassion;
expect(
    "Historical AC5: pre-Phase-1 fixture's display (1.26) != allocation (1.92)",
    Math.abs(wallyDelta.displayed - wallyDelta.used) > 0.5,
    true,
);

// Multi-source: 3.0× Major weight × empty Major data (cleared by previous
// rotation reset) means Major contributes nothing → multi-source equals
// single-source for now. After CRI regionals exist, Major will dominate.
const wallyMulti = resultMulti.conditionalAvgs.get("wally's compassion");
expect(
    "W3-P1: Wally multi-source avg < 1.5 (Major-or-attendance-weighted Online dominates)",
    wallyMulti ? (wallyMulti.avg < 1.5) : false,
    true,
);
expect(
    "W3-P1 GOAL: Math.round(Wally multi-source) = 1",
    wallyMulti ? Math.round(wallyMulti.avg) : null,
    1,
);

// Bucket-count comparison still meaningful: multi-source picks up
// every Online bucket plus (potentially) Major buckets.
expect(
    "Multi-source matching buckets >= single-source",
    resultMulti.bucketCount >= result.bucketCount,
    true,
);

// ──────────────────────────────────────────────────────────────────────
// W3 Phase 2 — STRUCTURAL SKELETON-LOCK VERIFICATION
//
// Replicate _detectStructuralSkeleton from app-deck-builder.js against
// the TEF-POR Lucario fixture data. The 4 POR-format regionals all ran
// Maximum-Belt Lucario lists — for the structural staples (Riolu,
// Fighting Energy, Ultra Ball, Lillie's Determination) inclusion is
// 100% with avg ≥ 3.5, so they should all qualify as skeleton.
// ──────────────────────────────────────────────────────────────────────
const SKELETON_INCLUSION = 0.90;
const SKELETON_AVG = 3.5;
const SKELETON_MIN_BUCKETS = 3;
function detectStructuralSkeleton(majorRows, archetypeKey, aceSpecLower, todayMs) {
    // Mirrors app-deck-builder.js _detectStructuralSkeleton — energies
    // (basic + special) are excluded so Phase 3's Energy-Budget owns
    // them; only structural Pokémon and trainers reach skeleton-lock.
    const skeleton = new Set();
    if (!Array.isArray(majorRows) || majorRows.length === 0) return skeleton;
    const archKey = String(archetypeKey).trim().toLowerCase();
    const aceSpec = String(aceSpecLower).trim().toLowerCase();
    const buckets = new Map();
    for (const r of majorRows) {
        const archNorm = stripPriceTag(r.archetype || '').toLowerCase().trim();
        if (archNorm !== archKey) continue;
        const tid = r.tournament_id || '';
        const cn = String(r.card_name || '').trim().toLowerCase();
        if (!tid || !cn) continue;
        const typeRaw = String(r.type || '').toLowerCase().trim();
        if (/\b(basic|special)\s*energy\b/.test(typeRaw)) continue;
        const avg = parseFloat(String(r.average_count || '0').replace(',', '.'));
        if (!Number.isFinite(avg) || avg <= 0) continue;
        const k = `${tid}|${archNorm}`;
        if (!buckets.has(k)) {
            const ms = parseDateMs(r.tournament_date);
            buckets.set(k, { cards: new Map(), dateMs: ms });
        }
        buckets.get(k).cards.set(cn, avg);
    }
    const matching = [...buckets.values()].filter(b => b.cards.has(aceSpec));
    if (matching.length < SKELETON_MIN_BUCKETS) return skeleton;
    const stats = new Map();
    let total = 0;
    for (const b of matching) {
        let rec = 1.0;
        if (Number.isFinite(b.dateMs) && Number.isFinite(todayMs)) {
            const age = Math.max(0, Math.floor((todayMs - b.dateMs) / 86400000));
            rec = recencyWeight(age);
        }
        total += rec;
        for (const [cn, avg] of b.cards) {
            if (cn === aceSpec) continue;
            if (!stats.has(cn)) stats.set(cn, { p: 0, s: 0 });
            const s = stats.get(cn);
            s.p += rec;
            s.s += avg * rec;
        }
    }
    if (total === 0) return skeleton;
    for (const [cn, s] of stats) {
        if (s.p / total >= SKELETON_INCLUSION && s.s / s.p >= SKELETON_AVG) skeleton.add(cn);
    }
    return skeleton;
}

const skeletonSet = detectStructuralSkeleton(
    majorDated, fixture._meta.archetype, fixture._meta.ace_spec_pick, todayMs
);
console.log(`\n✓ Skeleton-lock detection: ${skeletonSet.size} card(s) qualify as structural skeleton`);
console.log(`  members: ${[...skeletonSet].join(', ')}`);

// Structural NON-ENERGY staples that should appear in EVERY POR Lucario
// list at 4-of. Energies (Fighting Energy, Rocky) are intentionally
// EXCLUDED from skeleton — Phase 3's Energy-Budget owns them.
const expectedSkeletonStaples = ['riolu', 'ultra ball', "lillie's determination"];
for (const card of expectedSkeletonStaples) {
    expect(
        `W3-P2: "${card}" is a structural skeleton card (≥90% inc, ≥3.5 avg)`,
        skeletonSet.has(card),
        true,
    );
}
expect(
    "W3-P3 hand-off: Fighting Energy NOT in skeleton (energies routed to Phase 3 budget)",
    skeletonSet.has('fighting energy'),
    false,
);

// Variable-count cards that should NOT be skeleton (avg < 3.5 or
// inclusion < 90%). Poké Pad at avg 3.28 was the original audit case
// — flexible count across builds, should NOT be skeleton.
expect(
    "W3-P2: Wally's Compassion is NOT skeleton (avg 1.16, far below 3.5)",
    skeletonSet.has("wally's compassion"),
    false,
);
expect(
    "W3-P2: Poké Pad is NOT skeleton (avg 3.28 < 3.5 threshold)",
    skeletonSet.has("poké pad"),
    false,
);
expect(
    "W3-P2: skeleton size in sane range (3-10 staples for Lucario+MaxBelt)",
    skeletonSet.size >= 3 && skeletonSet.size <= 10,
    true,
);

// ──────────────────────────────────────────────────────────────────────
// W3 Phase 3 — ENERGY-BUDGET VERIFICATION
//
// Replicates _allocateEnergyBudget against the multi-source ACE-
// conditional aggregate. For Lucario+MaxBelt the TEF-POR Major data
// gives Fighting Energy avg ≈ 9.5 and Rocky Special Energy avg ≈ 1.95.
// Phase 3 should sum-round to 11 budget and distribute via LRM to
// Fighting 9 + Rocky 2 (Rocky's 0.95 frac beats Fighting's 0.50 frac
// for the +1 redistribution slot).
// ──────────────────────────────────────────────────────────────────────
const ENERGY_CORRIDOR_MIN = 7;
const ENERGY_CORRIDOR_MAX = 11;
const ENERGY_DATA_FLOOR = 6.5;
const BASIC_ENERGY_NAMES = ['grass energy','fire energy','water energy','lightning energy','psychic energy','fighting energy','darkness energy','metal energy'];
function isEnergyCardEntry(c) {
    if (!c) return false;
    const n = String(c.card_name || '').trim().toLowerCase();
    if (BASIC_ENERGY_NAMES.includes(n)) return true;
    const t = String(c.type || c.card_type || '').toLowerCase().trim();
    return /\b(basic|special)\s*energy\b/.test(t);
}
function allocateEnergyBudget(deckCards, conditionalAvgs) {
    if (!Array.isArray(deckCards) || !conditionalAvgs) return null;
    const byName = new Map();
    for (const c of deckCards) {
        if (!isEnergyCardEntry(c)) continue;
        const cn = String(c.card_name || '').trim().toLowerCase();
        if (!cn) continue;
        const stat = conditionalAvgs.get(cn);
        if (!stat || !Number.isFinite(stat.avg) || stat.avg <= 0) continue;
        if (stat.presence < 3) continue;
        if (!byName.has(cn)) byName.set(cn, { card: c, avg: stat.avg, count: 0, frac: 0 });
    }
    const items = Array.from(byName.values());
    if (items.length === 0) return null;
    const totalAvg = items.reduce((s, it) => s + it.avg, 0);
    if (totalAvg < ENERGY_DATA_FLOOR) return null;
    const budget = Math.max(ENERGY_CORRIDOR_MIN, Math.min(ENERGY_CORRIDOR_MAX, Math.round(totalAvg)));
    let baseline = 0;
    for (const it of items) { it.count = Math.floor(it.avg); it.frac = it.avg - it.count; baseline += it.count; }
    let remaining = budget - baseline;
    if (remaining < 0) {
        const asc = items.slice().sort((a, b) => a.frac - b.frac);
        for (let i = 0; i < -remaining && i < asc.length; i++) if (asc[i].count > 0) asc[i].count -= 1;
    } else if (remaining > 0) {
        const desc = items.slice().sort((a, b) => b.frac - a.frac);
        for (let i = 0; i < remaining && i < desc.length; i++) desc[i].count += 1;
    }
    return { placements: items.map(it => ({ name: it.card.card_name.toLowerCase(), count: it.count })), totalAvg, budget };
}

// Build synthetic deckCards from the conditional aggregate so Energy
// Budget has cards to look up. We tag a fake type='basic energy' for
// the basic-name list and 'special energy' for Rocky.
const _energyDeckCards = [];
for (const [cn, stat] of resultMulti.conditionalAvgs) {
    const isBasic = BASIC_ENERGY_NAMES.includes(cn);
    const isSpecial = /\benergy\b/.test(cn) && !isBasic && stat.presence >= 3;
    if (isBasic || isSpecial) {
        _energyDeckCards.push({
            card_name: cn,
            type: isBasic ? 'basic energy' : 'special energy',
            consistencyScore: 80,
        });
    }
}
const energyBudget = allocateEnergyBudget(_energyDeckCards, resultMulti.conditionalAvgs);
console.log(`\n✓ Energy-budget allocation: ${energyBudget ? `${energyBudget.placements.length} energy card(s), totalAvg=${energyBudget.totalAvg.toFixed(2)} → budget=${energyBudget.budget}` : 'null (no data)'}`);
if (energyBudget) {
    for (const p of energyBudget.placements) console.log(`  ${p.count}x ${p.name}`);
}

const eBudget = energyBudget;
expect(
    "W3-P3: Energy-budget allocator returned a result (TEF-POR Lucario has energy data)",
    eBudget !== null,
    true,
);
expect(
    "W3-P3: Budget capped to corridor [7, 11]",
    eBudget && eBudget.budget >= 7 && eBudget.budget <= 11,
    true,
);
expect(
    "W3-P3: Lucario+MaxBelt budget = 11 (Fighting 9.5 + Rocky 1.95 = 11.45 → round 11)",
    eBudget && eBudget.budget === 11,
    true,
);
const fightingPlaced = eBudget && eBudget.placements.find(p => p.name === 'fighting energy');
expect(
    "W3-P3: Fighting Energy placed at 9 (floor of 9.5)",
    fightingPlaced && fightingPlaced.count === 9,
    true,
);
const rockyPlaced = eBudget && eBudget.placements.find(p => p.name === 'rocky fighting energy');
expect(
    "W3-P3: Rocky Fighting Energy placed at 2 (0.95 frac wins LRM remainder)",
    rockyPlaced && rockyPlaced.count === 2,
    true,
);
const totalEnergy = eBudget ? eBudget.placements.reduce((s, p) => s + p.count, 0) : 0;
expect(
    "W3-P3: Sum of energy placements equals budget (11)",
    totalEnergy === 11,
    true,
);

// ──────────────────────────────────────────────────────────────────────
// W3 Phase 4 — STADIUM-BUDGET VERIFICATION
//
// Replicates _allocateStadiumBudget against the multi-source ACE-
// conditional aggregate. For Lucario+MaxBelt the TEF-POR Major data
// has Gravity Mountain (~1.55 avg, 100% inc) and Team Rocket's
// Watchtower (~1.0 avg, 100% inc in MaxBelt-filtered buckets). Sum
// rounds to 3, distributed LRM to 2+1.
// ──────────────────────────────────────────────────────────────────────
const STADIUM_MIN = 0, STADIUM_MAX = 3;
function isStadiumCardEntry(c) {
    if (!c) return false;
    const t = String(c.type || c.card_type || '').toLowerCase().trim();
    return /\bstadium\b/.test(t);
}
function allocateStadiumBudget(deckCards, conditionalAvgs) {
    if (!Array.isArray(deckCards) || !conditionalAvgs) return null;
    const byName = new Map();
    for (const c of deckCards) {
        if (!isStadiumCardEntry(c)) continue;
        const cn = String(c.card_name || '').trim().toLowerCase();
        if (!cn) continue;
        const stat = conditionalAvgs.get(cn);
        if (!stat || !Number.isFinite(stat.avg) || stat.avg <= 0) continue;
        if (stat.presence < 3) continue;
        if (!byName.has(cn)) byName.set(cn, { card: c, avg: stat.avg, count: 0, frac: 0 });
    }
    const items = Array.from(byName.values());
    if (items.length === 0) return null;
    const totalAvg = items.reduce((s, it) => s + it.avg, 0);
    if (totalAvg <= 0) return null;
    const budget = Math.max(STADIUM_MIN, Math.min(STADIUM_MAX, Math.round(totalAvg)));
    if (budget === 0) return null;
    let baseline = 0;
    for (const it of items) { it.count = Math.floor(it.avg); it.frac = it.avg - it.count; baseline += it.count; }
    let rem = budget - baseline;
    if (rem < 0) {
        const asc = items.slice().sort((a, b) => a.frac - b.frac);
        for (let i = 0; i < -rem && i < asc.length; i++) if (asc[i].count > 0) asc[i].count -= 1;
    } else if (rem > 0) {
        const desc = items.slice().sort((a, b) => b.frac - a.frac);
        for (let i = 0; i < rem && i < desc.length; i++) desc[i].count += 1;
    }
    return {
        placements: items.filter(it => it.count > 0).map(it => ({ name: it.card.card_name.toLowerCase(), count: it.count })),
        totalAvg, budget,
    };
}

// Build synthetic stadium deck-cards by scanning the conditional aggregate.
// Cards whose name contains "mountain", "watchtower", "tower", "stadium" etc.
// (rough heuristic) are tagged type='stadium' so the helper picks them up.
const _stadiumDeckCards = [];
for (const [cn, stat] of resultMulti.conditionalAvgs) {
    // Heuristic for the test fixture (TEF-POR has these two named stadiums).
    // The real runtime uses the type field from the card metadata, not
    // name-matching — this is just to drive the verify-baseline replica.
    if (cn === 'gravity mountain' || cn === "team rocket's watchtower") {
        _stadiumDeckCards.push({ card_name: cn, type: 'stadium', consistencyScore: 70 });
    }
}
const stadiumBudget = allocateStadiumBudget(_stadiumDeckCards, resultMulti.conditionalAvgs);
console.log(`\n✓ Stadium-budget allocation: ${stadiumBudget ? `${stadiumBudget.placements.length} stadium(s), totalAvg=${stadiumBudget.totalAvg.toFixed(2)} → budget=${stadiumBudget.budget}` : 'null'}`);
if (stadiumBudget) for (const p of stadiumBudget.placements) console.log(`  ${p.count}x ${p.name}`);

expect(
    "W3-P4: Stadium-budget allocator returned a result for Lucario fixture",
    stadiumBudget !== null,
    true,
);
expect(
    "W3-P4: Budget capped to corridor [0, 3]",
    stadiumBudget && stadiumBudget.budget >= 0 && stadiumBudget.budget <= 3,
    true,
);
expect(
    "W3-P4: Lucario stadium budget = 3 (1.55 + 1.0 = 2.55 → round 3)",
    stadiumBudget && stadiumBudget.budget === 3,
    true,
);
const gravityPlaced = stadiumBudget && stadiumBudget.placements.find(p => p.name === 'gravity mountain');
expect(
    "W3-P4: Gravity Mountain placed at 2 (0.55 frac wins LRM)",
    gravityPlaced && gravityPlaced.count === 2,
    true,
);
const watchtowerPlaced = stadiumBudget && stadiumBudget.placements.find(p => p.name === "team rocket's watchtower");
expect(
    "W3-P4: Team Rocket's Watchtower placed at 1",
    watchtowerPlaced && watchtowerPlaced.count === 1,
    true,
);
const totalStadium = stadiumBudget ? stadiumBudget.placements.reduce((s, p) => s + p.count, 0) : 0;
expect(
    "W3-P4: Sum of stadium placements equals budget (3)",
    totalStadium === 3,
    true,
);
expect(
    "W3-P4 hand-off: Gravity Mountain NOT in skeleton (stadiums routed to Phase 4 budget)",
    skeletonSet.has('gravity mountain'),
    false,
);

// ──────────────────────────────────────────────────────────────────────
// W3 Phase 5 — POKÉMON-LINE-LOCK VERIFICATION
//
// Replicates _lockPokemonLines against the TEF-POR Lucario+MaxBelt
// buckets. Every Pokémon (Basic/Stage 1/Stage 2/Mega/V-family) with
// presence ≥ 3 in matched buckets gets locked to round(avg). The
// evolution line ratios emerge from per-card rounding — no explicit
// line grouping needed.
// ──────────────────────────────────────────────────────────────────────
const POKEMON_TYPE_RE = /^(basic(?!\s+energy)|stage [12]|mega|v[-\s]?union|vstar|vmax|tera)\b/i;

// Rebuild per-card type-aware bucket aggregate from the raw majorDated
// rows, since the multi-source `resultMulti` doesn't carry types and
// the Major chunk does have them.
const _typeByCard = new Map();
const _majorBuckets = new Map();
for (const r of majorDated) {
    const archNorm = stripPriceTag(r.archetype || '').toLowerCase().trim();
    if (archNorm !== fixture._meta.archetype.toLowerCase()) continue;
    const tid = r.tournament_id || '';
    const cn = String(r.card_name || '').trim().toLowerCase();
    if (!tid || !cn) continue;
    const avg = parseFloat(String(r.average_count || '0').replace(',', '.'));
    if (!Number.isFinite(avg) || avg <= 0) continue;
    if (!_majorBuckets.has(tid)) _majorBuckets.set(tid, new Map());
    _majorBuckets.get(tid).set(cn, avg);
    if (!_typeByCard.has(cn)) _typeByCard.set(cn, String(r.type || '').trim());
}
const _majorMatching = [...(_majorBuckets.values())]
    .filter(b => b.has(fixture._meta.ace_spec_pick.toLowerCase()));

const _majorOnlyCondAvgs = new Map();
for (const b of _majorMatching) {
    for (const [cn, avg] of b) {
        if (cn === fixture._meta.ace_spec_pick.toLowerCase()) continue;
        if (!_majorOnlyCondAvgs.has(cn)) _majorOnlyCondAvgs.set(cn, { p: 0, s: 0 });
        const s = _majorOnlyCondAvgs.get(cn);
        s.p += 1; s.s += avg;
    }
}
const _condForLock = new Map();
for (const [cn, s] of _majorOnlyCondAvgs) {
    _condForLock.set(cn, { avg: s.s / s.p, presence: s.p });
}

function lockPokemonLines(condAvgs, typeMap) {
    const placements = new Map();
    for (const [cn, stat] of condAvgs) {
        const t = typeMap.get(cn) || '';
        if (!POKEMON_TYPE_RE.test(t)) continue;
        if (stat.presence < 3) continue;
        const count = Math.round(stat.avg);
        if (count < 1) continue;
        placements.set(cn, { count, avg: stat.avg });
    }
    return placements;
}

const lockedLines = lockPokemonLines(_condForLock, _typeByCard);
console.log(`\n✓ Pokémon-line-lock: ${lockedLines.size} card(s) locked`);
for (const [cn, p] of lockedLines) console.log(`  ${p.count}x ${cn} (avg ${p.avg.toFixed(2)})`);

expect(
    "W3-P5: Riolu locked at 4 (round 3.55)",
    lockedLines.get('riolu')?.count === 4,
    true,
);
expect(
    "W3-P5: Mega Lucario ex locked at 3 (round 3.02 — below Phase 2 skeleton threshold)",
    lockedLines.get('mega lucario ex')?.count === 3,
    true,
);
expect(
    "W3-P5: Riolu/Mega ratio = 4-3 line",
    lockedLines.get('riolu')?.count === 4 && lockedLines.get('mega lucario ex')?.count === 3,
    true,
);
expect(
    "W3-P5: Makuhita/Hariyama ratio = 2-2 line (Stage 1 + Basic, equal counts)",
    lockedLines.get('makuhita')?.count === 2 && lockedLines.get('hariyama')?.count === 2,
    true,
);
expect(
    "W3-P5: Solrock/Lunatone ratio = 3-2 line",
    lockedLines.get('solrock')?.count === 3 && lockedLines.get('lunatone')?.count === 2,
    true,
);
expect(
    "W3-P5: Fighting Energy NOT locked (Basic Energy ≠ Basic Pokémon — negative lookahead)",
    lockedLines.has('fighting energy'),
    false,
);
expect(
    "W3-P5: Gravity Mountain NOT locked (Stadium, routed to Phase 4)",
    lockedLines.has('gravity mountain'),
    false,
);
expect(
    "W3-P5: Ultra Ball / Lillie's Determination NOT locked (Item/Supporter)",
    lockedLines.has('ultra ball') || lockedLines.has("lillie's determination"),
    false,
);
const totalLockedCopies = [...lockedLines.values()].reduce((s, p) => s + p.count, 0);
expect(
    `W3-P5: Total locked Pokémon copies (got ${totalLockedCopies}) in sane range [12, 22]`,
    totalLockedCopies >= 12 && totalLockedCopies <= 22,
    true,
);

// ── Report ────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════');
console.log('TEST RESULTS');
console.log('═══════════════════════════════════════════════════════════');
let passed = 0, failed = 0;
for (const t of tests) {
    const mark = t.pass ? '✓' : '✗';
    const detail = t.pass ? '' : `   expected ${t.expected}, got ${t.actual}`;
    console.log(`  ${mark} ${t.name}${detail}`);
    if (t.pass) passed++; else failed++;
}
console.log(`\nResult: ${passed} passed, ${failed} failed of ${tests.length}`);
process.exit(failed > 0 ? 1 : 0);
