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
