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
function aceSpecConditionalAvgs(rows, archetypeKey, aceSpecLower, todayMs) {
    const archKey = String(archetypeKey).trim().toLowerCase();
    const aceSpec = String(aceSpecLower).trim().toLowerCase();

    const buckets = new Map();
    const bucketDates = new Map();
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
    }

    const matching = [];
    for (const [k, cards] of buckets.entries()) {
        if (!cards.has(aceSpec)) continue;
        matching.push({ cards, dateMs: bucketDates.get(k), key: k });
    }
    if (matching.length === 0) return { conditionalAvgs: new Map(), bucketCount: 0 };

    const sums = new Map();
    const weights = new Map();
    const presence = new Map();
    for (const { cards, dateMs } of matching) {
        let w = 1.0;
        if (Number.isFinite(dateMs)) {
            const ageDays = Math.max(0, Math.floor((todayMs - dateMs) / 86400000));
            w = recencyWeight(ageDays);
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
    const bucketSourceWeight = new Map();
    for (const src of sources) {
        if (!src || !Array.isArray(src.rows) || src.rows.length === 0) continue;
        const sourceWeight = Number.isFinite(src.sourceWeight) && src.sourceWeight > 0 ? src.sourceWeight : 1.0;
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
        if (!cards.has(aceSpec)) continue;
        matching.push({ cards, dateMs: bucketDates.get(k), sourceWeight: bucketSourceWeight.get(k) || 1.0 });
    }
    const sums = new Map();
    const weights = new Map();
    const presence = new Map();
    for (const { cards, dateMs, sourceWeight } of matching) {
        const ageDays = dateMs ? Math.max(0, Math.floor((todayMs - dateMs) / 86400000)) : null;
        const recency = recencyWeight(ageDays);
        const w = recency * sourceWeight;
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

// Single-source (pre-Fix-C behavior)
const result = aceSpecConditionalAvgs(
    onlineDated,
    fixture._meta.archetype,
    fixture._meta.ace_spec_pick,
    todayMs
);
console.log(`✓ Single-source ACE-conditional: ${result.bucketCount} matching buckets`);

// Multi-source (post-Fix-C, with Major + Online blend)
const SOURCE_WEIGHT_ONLINE = 1.0;
const SOURCE_WEIGHT_MAJOR = 1.5;
const resultMulti = aceSpecConditionalAvgsMulti(
    [
        { rows: onlineDated, sourceWeight: SOURCE_WEIGHT_ONLINE, archetypeFieldNormalizer: null },
        { rows: majorDated, sourceWeight: SOURCE_WEIGHT_MAJOR, archetypeFieldNormalizer: stripPriceTag },
    ],
    fixture._meta.archetype,
    fixture._meta.ace_spec_pick,
    todayMs
);
console.log(`✓ Multi-source ACE-conditional: ${resultMulti.bucketCount} matching buckets\n`);

// ── Assertions ────────────────────────────────────────────────────────
const wally = result.conditionalAvgs.get("wally's compassion");
const expectedWally = fixture.current_runtime_state.wallys_compassion.avgCountWhenUsed_at_stage1;
expect(
    "Wally's Compassion ACE-conditional avg matches runtime (1.9216)",
    wally ? wally.avg : null,
    expectedWally,
    0.01,
);

// Fighting Energy ACE-conditional avg
const fight = result.conditionalAvgs.get('fighting energy');
expect(
    "Fighting Energy ACE-conditional avg matches runtime",
    fight ? fight.avg : null,
    fixture.current_runtime_state.fighting_energy.avgCountWhenUsed_at_bidi_entry,
    0.05,
);

// Riolu ACE-conditional
const riolu = result.conditionalAvgs.get('riolu');
expect(
    "Riolu ACE-conditional avg matches runtime",
    riolu ? riolu.avg : null,
    fixture.current_runtime_state.riolu.avgCountWhenUsed_at_bidi_entry,
    0.05,
);

// Math.round preserves the bump
expect(
    "Math.round(Wally ACE-cond) = 2",
    wally ? Math.round(wally.avg) : null,
    2,
);

// AC5: display ≠ allocation (= bug we want to fix)
const wallyDelta = fixture.current_runtime_state.ui_vs_allocation_delta.wallys_compassion;
expect(
    "AC5 violation: Wally's display (1.26) != allocation source (1.92)",
    Math.abs(wallyDelta.displayed - wallyDelta.used) > 0.5,
    true,
);

// Post-Fix-C: Multi-source ACE-conditional should give an avg closer to the
// cross-source baseline (~1.26-1.35), NOT the online-subset-only 1.92.
const wallyMulti = resultMulti.conditionalAvgs.get("wally's compassion");
expect(
    "Post-Fix-C: Wally's multi-source avg is < 1.5 (Major dominance)",
    wallyMulti ? (wallyMulti.avg < 1.5) : false,
    true,
);
expect(
    "Post-Fix-C: Math.round(Wally multi-source avg) = 1",
    wallyMulti ? Math.round(wallyMulti.avg) : null,
    1,
);

// Multi-source should also include Major buckets (= more matching buckets)
expect(
    "Post-Fix-C: matching bucket count > single-source bucket count",
    resultMulti.bucketCount > result.bucketCount,
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
