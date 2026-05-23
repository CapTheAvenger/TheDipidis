// =====================================================================
// PER-CARD INSTRUMENTATION — captures EVERY card's complete state so we
// can cross-check the Node-side per-card-diagnosis.mjs predictions vs
// the actual runtime allocation, in ONE shot, for ALL ~23 deck cards
// (not just Wally / Riolu / Gravity).
//
// USAGE
//   1. https://thedipidis.app → "Deck Analysis (Global)" → Quick Overview
//   2. Pick archetype "Lucario Hariyama". DO NOT click Generate yet.
//   3. F12 → Console. Paste this entire file. Enter.
//   4. Click "Consistency Generate".
//   5. Wait until the build finishes (~1-2s).
//   6. In console: copy(__dipiAuditFull)
//   7. Paste the JSON back into the audit conversation.
//
// What it captures per card:
//   - card_name
//   - final_count                  (= what the algorithm delivered)
//   - score                        (= consistencyScore, drives Stage gating)
//   - tier                         (CORE / MID / TECH)
//   - card_function                (= the tier's source classifier)
//   - effective_avg                (= card.avgCountWhenUsed AT END, post all overrides)
//   - base_avg                     (= card._aceSpecConditionalBaseAvg, the pre-override)
//   - ace_spec_conditional_avg    (= card._aceSpecConditionalAvg, post-override)
//   - ace_spec_conditional_shift  (= cond - base, signed)
//   - major_blended_avg           (= card._majorBlendedAvg)
//   - major_avg                   (= card._majorAvg, raw latestMajor avg)
//   - online_avg                  (= card._onlineAvg, pre-major-blend)
//   - lrm_remainder               (= card._lrmRemainder at end)
//   - is_pinned / is_ace_spec / is_tech_counter
//   - legal_max                   (= card._legalMax)
//   - allocation_reason           (= ACE-SPEC / Major-Blend / Stage-1 / Stage-2 / Floor / Fallback / Pin)
//   - share_percent               (= card.sharePercent)
//   - recommended_count           (= card._recommendedCount)
//
// Plus deck-level:
//   - basic_energy_total          (= count of Basic Energy cards)
//   - special_energy_total
//   - energy_floor_target / before / after
//   - energy_ceiling_target / before / after
//   - ace_spec_pick               (which Ace-Spec was selected)
//   - all LRM event deltas        (Forward, Reverse, Bidi) — already captured
// =====================================================================

(function() {
    'use strict';

    if (window.__dipiAuditFullInstalled) {
        console.warn('[DIPI-FULL] Already installed. Reload page to reset.');
        return;
    }
    window.__dipiAuditFullInstalled = true;

    const audit = window.__dipiAuditFull = {
        timestamp: new Date().toISOString(),
        archetype: null,
        format_filter: null,
        ace_spec_pick: null,
        deck_summary: null,
        cards: [],           // per-card full snapshot
        lrm_events: [],      // forward + reverse + bidi
        floor_result: null,
        ceiling_result: null,
        pin_diagnostics: null,
    };

    const lc = (s) => String(s || '').toLowerCase().trim();
    const num = (x) => Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null;

    // ── Snapshot one card with EVERYTHING the algorithm tagged on it ──
    function snapshotCard(card, count) {
        if (!card) return null;
        return {
            name: card.card_name || card.name || '?',
            set: card.set_code || card.setCode || null,
            number: card.set_number || card.cardNumber || null,
            type: card.type || card.card_type || null,
            final_count: count,
            score: num(card.consistencyScore),
            tier: card._cardFunctionTier || null,
            card_function: card._cardFunction || null,
            effective_avg: num(card.avgCountWhenUsed),
            base_avg: num(card._aceSpecConditionalBaseAvg),
            ace_spec_conditional_avg: num(card._aceSpecConditionalAvg),
            ace_spec_conditional_shift: num(card._aceSpecConditionalShift),
            major_blended_avg: num(card._majorBlendedAvg),
            major_avg: num(card._majorAvg),
            online_avg: num(card._onlineAvg),
            lrm_remainder: num(card._lrmRemainder),
            is_pinned: !!card._isPinned,
            is_ace_spec: !!card._isAceSpec,
            tech_counter_max: card._techCounterMaxCount,
            legal_max: card._legalMax,
            share_percent: num(card.sharePercent),
            recommended_count: card._recommendedCount,
            // Predicted Stage-1 allocation if Math.round was applied to effective_avg:
            predicted_stage1_round: Number.isFinite(card.avgCountWhenUsed) ? Math.round(card.avgCountWhenUsed) : null,
            predicted_stage1_floor: Number.isFinite(card.avgCountWhenUsed) ? Math.floor(card.avgCountWhenUsed) : null,
        };
    }

    function snapshotEntries(entries, label) {
        if (!Array.isArray(entries)) return null;
        const arr = entries.map(e => snapshotCard(e && e.card, e && e.count)).filter(Boolean);
        return { label, total: arr.reduce((s, c) => s + (c.final_count || 0), 0), cards: arr };
    }

    // ── Patch the LRM functions ──────────────────────────────────────
    function patchLrm(fnName) {
        const orig = window[fnName];
        if (typeof orig !== 'function') {
            console.warn(`[DIPI-FULL] window.${fnName} not found — skipping patch`);
            return;
        }
        window[fnName] = function(entries, ...rest) {
            const before = snapshotEntries(entries, `${fnName}:before`);
            const result = orig.call(this, entries, ...rest);
            const after = snapshotEntries(entries, `${fnName}:after`);
            const ev = { fn: fnName, before_total: before && before.total, after_total: after && after.total, deltas: [] };
            const bMap = new Map((before.cards || []).map(c => [c.name, c.final_count]));
            const aMap = new Map((after.cards || []).map(c => [c.name, c.final_count]));
            const names = new Set([...bMap.keys(), ...aMap.keys()]);
            names.forEach(n => {
                const b = bMap.get(n) || 0, a = aMap.get(n) || 0;
                if (a !== b) ev.deltas.push({ name: n, before: b, after: a, delta: a - b });
            });
            audit.lrm_events.push(ev);
            console.log(`[DIPI-FULL] ${fnName}: total ${ev.before_total} → ${ev.after_total} (${ev.deltas.length} cards changed)`);
            if (ev.deltas.length) console.table(ev.deltas);
            return result;
        };
        console.log(`[DIPI-FULL] ✓ Patched ${fnName}`);
    }
    patchLrm('_redistributeByLargestRemainder');
    patchLrm('_trimByReverseLrm');
    patchLrm('_bidirectionalLrmSwap');

    // ── Patch the Floor + Ceiling so we capture target/before/after ──
    function patchFloorCeiling(fnName, storeKey) {
        const orig = window[fnName];
        if (typeof orig !== 'function') return;
        window[fnName] = function(entries, condAvgs, helpers) {
            const beforeSnap = snapshotEntries(entries, `${fnName}:before`);
            const result = orig.call(this, entries, condAvgs, helpers);
            const afterSnap = snapshotEntries(entries, `${fnName}:after`);
            audit[storeKey] = {
                ...result,
                before_snapshot: beforeSnap,
                after_snapshot: afterSnap,
            };
            console.log(`[DIPI-FULL] ${fnName}:`, result);
            return result;
        };
        console.log(`[DIPI-FULL] ✓ Patched ${fnName}`);
    }
    patchFloorCeiling('_enforceEnergyFloor', 'floor_result');
    patchFloorCeiling('_enforceEnergyCeiling', 'ceiling_result');

    // ── Patch autoCompleteConsistency to capture final per-card state ──
    const origAuto = window.autoCompleteConsistency;
    if (typeof origAuto === 'function') {
        window.autoCompleteConsistency = async function(source, mode, opts) {
            audit.archetype = window.currentMetaArchetype || window.currentCityLeagueArchetype || window.pastMetaCurrentArchetype || null;
            audit.format_filter = (typeof window.currentMetaFormatFilter !== 'undefined') ? window.currentMetaFormatFilter : null;
            audit.lrm_events.length = 0;
            audit.cards = [];
            audit.floor_result = null;
            audit.ceiling_result = null;

            const result = await origAuto.call(this, source, mode, opts);

            // After build → pull the final-deck entries with full per-card data
            // The builder exposes its full entry array via a few possible locations:
            //   - window.__lastBuildEntries   (if instrumentation added it)
            //   - window.currentMetaDeck      (name → count map only)
            // Fallback: read from the DOM-rendered card-tiles which have card data.
            const finalEntries = window.__lastBuildEntries
                              || window.__consistencyDeckEntries
                              || null;

            if (Array.isArray(finalEntries)) {
                audit.cards = finalEntries.map(e => snapshotCard(e && e.card, e && e.count)).filter(Boolean);
            } else {
                // Fallback: name+count from the final-deck object, no per-card metadata
                const finalDeckObj = source === 'currentMeta' ? (window.currentMetaDeck || {})
                                  : source === 'cityLeague'  ? (window.cityLeagueDeck || {})
                                  : (window.pastMetaDeck || {});
                audit.cards = Object.entries(finalDeckObj).map(([name, count]) => ({
                    name, final_count: count, _note: 'fallback: no per-card metadata available',
                }));
            }

            // Try to discover the Ace-Spec pick
            const aceCard = audit.cards.find(c => c.is_ace_spec);
            audit.ace_spec_pick = aceCard ? aceCard.name : null;

            audit.pin_diagnostics = window.__lastBuildPinDiagnostics || null;

            // Deck summary
            const totalCards = audit.cards.reduce((s, c) => s + (c.final_count || 0), 0);
            const basicEnergy = audit.cards.filter(c => /energy/i.test(c.name) && !/special/i.test(c.type || '')).reduce((s, c) => s + (c.final_count || 0), 0);
            const allEnergy = audit.cards.filter(c => /energy/i.test(c.name)).reduce((s, c) => s + (c.final_count || 0), 0);
            audit.deck_summary = {
                total_cards: totalCards,
                energy_total: allEnergy,
                basic_energy_total: basicEnergy,
                card_count: audit.cards.length,
            };

            // ── Print the per-card discrepancy view in console ─────────
            console.log('═══════════════════════════════════════════════════════');
            console.log('[DIPI-FULL] BUILD COMPLETE — per-card snapshot below');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Archetype:', audit.archetype, '| Ace-Spec:', audit.ace_spec_pick, '| Total:', totalCards);
            console.log('Energies (all):', allEnergy, '| Basic:', basicEnergy);
            console.log('Floor:', audit.floor_result);
            console.log('Ceiling:', audit.ceiling_result);

            // One row per card, showing the values that drive Stage-1
            console.table(audit.cards.map(c => ({
                name: c.name,
                count: c.final_count,
                eff_avg: c.effective_avg,
                base_avg: c.base_avg,
                ace_cond: c.ace_spec_conditional_avg,
                major: c.major_avg,
                online: c.online_avg,
                round: c.predicted_stage1_round,
                rem: c.lrm_remainder,
                tier: c.tier,
                score: c.score,
                pin: c.is_pinned ? 'Y' : '',
                ace: c.is_ace_spec ? 'Y' : '',
            })));

            console.log('───────────────────────────────────────────────────────');
            console.log('To export: copy(__dipiAuditFull)');
            console.log('Then paste back into the audit conversation.');

            return result;
        };
        console.log('[DIPI-FULL] ✓ Patched autoCompleteConsistency');
    }

    console.log('[DIPI-FULL] All patches installed.');
    console.log('[DIPI-FULL] Now click "Consistency Generate".');
})();
