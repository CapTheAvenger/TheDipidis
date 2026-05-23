// =====================================================================
// DECK BUILDER INSTRUMENTATION — Phase 3.5 Browser-Test
//
// Ziel: Genau identifizieren welcher Code-Pfad Wally's Compassion
// von 1 auf 2 bumpt, und warum Reverse-LRM Riolu/Gravity NICHT trimt.
//
// HOW TO USE:
// 1. Öffne https://thedipidis.app
// 2. Wechsle zu "Deck Analysis (Global)" → Quick Overview
// 3. Wähle Archetype: "Lucario Hariyama"
//    (NICHT auf Generate klicken — erst dieses Snippet ausführen)
// 4. Öffne DevTools Console (F12 → Console-Tab)
// 5. Paste dieses gesamte Snippet rein, Enter
// 6. Klicke "Consistency Generate"
// 7. Warte 2 Sekunden, dann in Console: copy(__dipiAudit)
//    (= kopiert das Audit-JSON in dein Clipboard)
// 8. Schick mir den kopierten Text zurück
//
// Das Snippet patcht die LRM-Funktionen mit Logging, ohne die echte
// Logik zu verändern. Nach dem Build siehst du selbst die wichtigsten
// Findings in der Console.
// =====================================================================

(function() {
    'use strict';

    if (window.__dipiAuditInstalled) {
        console.warn('[DIPI-AUDIT] Already installed. Skipping re-install. To reset, reload page.');
        return;
    }
    window.__dipiAuditInstalled = true;

    const audit = window.__dipiAudit = {
        timestamp: new Date().toISOString(),
        archetype: null,
        formatFilter: null,
        events: [],
        stageDecksBefore: null,
        stageDecksAfter: null,
        lrmForward: null,
        lrmReverse: null,
        bidiSwap: null,
        finalDeck: null,
        wallysTrace: [],
        riolu_gravityTrace: [],
        pinDiagnostics: null,
    };

    const cardKey = (c) => (c && (c.card_name || c.name) || '').toString().trim();
    const lc = (s) => String(s || '').toLowerCase();

    // === Helper: snapshot deck state ===
    function snapshotDeck(entries, label) {
        if (!Array.isArray(entries)) return null;
        const arr = entries.map(e => {
            const c = e && e.card || {};
            return {
                name: cardKey(c),
                count: e && e.count,
                avg: c.avgCountWhenUsed,
                rem: c._lrmRemainder,
                tier: c._cardFunctionTier,
                fn: c._cardFunction,
                score: c.consistencyScore,
                share: c.sharePercent,
                isPinned: !!c._isPinned,
                isAceSpec: !!c._isAceSpec,
                techCounterMax: c._techCounterMaxCount,
                recommendedCount: c._recommendedCount,
            };
        });
        const total = arr.reduce((s, e) => s + (e.count || 0), 0);
        return { label, total, cards: arr };
    }

    // === Patch the three LRM-related functions ===
    function patch(fnName) {
        const orig = window[fnName];
        if (typeof orig !== 'function') {
            console.warn(`[DIPI-AUDIT] window.${fnName} not found — cannot patch`);
            return;
        }
        window[fnName] = function(entries, ...rest) {
            const before = snapshotDeck(entries, `${fnName}:before`);
            const result = orig.call(this, entries, ...rest);
            const after = snapshotDeck(entries, `${fnName}:after`);
            const event = { fn: fnName, before, after, result, returned: result };

            // Compute per-card delta
            event.deltas = [];
            const beforeMap = new Map((before && before.cards || []).map(c => [c.name, c.count]));
            const afterMap  = new Map((after  && after.cards  || []).map(c => [c.name, c.count]));
            const allNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);
            allNames.forEach(n => {
                const b = beforeMap.get(n) || 0;
                const a = afterMap.get(n) || 0;
                if (a !== b) event.deltas.push({ name: n, before: b, after: a, delta: a - b });
            });

            audit.events.push(event);
            console.log(`[DIPI-AUDIT] ${fnName} ran:`,
                `total ${before && before.total} → ${after && after.total}`,
                `(${event.deltas.length} cards changed)`);
            if (event.deltas.length) {
                console.table(event.deltas);
            }
            if (fnName === '_redistributeByLargestRemainder') audit.lrmForward = event;
            if (fnName === '_trimByReverseLrm')                audit.lrmReverse = event;
            if (fnName === '_bidirectionalLrmSwap')            audit.bidiSwap = event;
            return result;
        };
        console.log(`[DIPI-AUDIT] ✓ Patched window.${fnName}`);
    }

    patch('_redistributeByLargestRemainder');
    patch('_trimByReverseLrm');
    patch('_bidirectionalLrmSwap');

    // === Also patch autoCompleteConsistency to capture pre/post state ===
    const origAuto = window.autoCompleteConsistency;
    if (typeof origAuto === 'function') {
        window.autoCompleteConsistency = async function(source, mode, opts) {
            audit.archetype = window.currentMetaArchetype || window.currentCityLeagueArchetype || window.pastMetaCurrentArchetype || null;
            audit.formatFilter = (typeof window.currentMetaFormatFilter !== 'undefined') ? window.currentMetaFormatFilter : null;
            audit.events.length = 0;
            audit.lrmForward = null;
            audit.lrmReverse = null;
            audit.bidiSwap = null;
            const result = await origAuto.call(this, source, mode, opts);
            // After build, capture final state
            audit.pinDiagnostics = window.__lastBuildPinDiagnostics || null;
            const finalDeckObj = source === 'currentMeta' ? (window.currentMetaDeck || {})
                              : source === 'cityLeague'  ? (window.cityLeagueDeck || {})
                              : (window.pastMetaDeck || {});
            audit.finalDeck = Object.entries(finalDeckObj).map(([name, count]) => ({ name, count }));

            // Hunt Wally's trace across all events
            audit.wallysTrace = audit.events.map(e => {
                const beforeCard = e.before && e.before.cards && e.before.cards.find(c => lc(c.name).includes("wally"));
                const afterCard  = e.after  && e.after.cards  && e.after.cards.find(c => lc(c.name).includes("wally"));
                return {
                    fn: e.fn,
                    before: beforeCard,
                    after: afterCard,
                    changed: !!(beforeCard && afterCard && beforeCard.count !== afterCard.count),
                };
            }).filter(t => t.before || t.after);

            // Hunt Riolu + Gravity Mountain trace
            audit.riolu_gravityTrace = ['riolu', 'gravity mountain'].map(target => ({
                target,
                events: audit.events.map(e => {
                    const b = e.before && e.before.cards && e.before.cards.find(c => lc(c.name) === target);
                    const a = e.after && e.after.cards && e.after.cards.find(c => lc(c.name) === target);
                    return { fn: e.fn, before: b && b.count, after: a && a.count };
                }).filter(t => t.before != null || t.after != null),
            }));

            // Print verdict
            console.log('═══════════════════════════════════════════════════════');
            console.log('[DIPI-AUDIT] BUILD COMPLETE');
            console.log('═══════════════════════════════════════════════════════');
            console.log('Archetype:', audit.archetype);
            console.log('Format filter:', audit.formatFilter);
            console.log('Pinned cards (from diagnostics):', audit.pinDiagnostics && audit.pinDiagnostics.pinned);
            console.log('Tech-slots (from diagnostics):', audit.pinDiagnostics && audit.pinDiagnostics.techSlots);
            console.log('Final deck:', audit.finalDeck);
            console.log('Wally\'s Compassion across LRM events:');
            console.table(audit.wallysTrace.map(t => ({
                fn: t.fn,
                before_count: t.before && t.before.count,
                after_count: t.after && t.after.count,
                rem: t.before && t.before.rem,
                tier: t.before && t.before.tier,
                fn_class: t.before && t.before.fn,
                isPinned: t.before && t.before.isPinned,
                score: t.before && t.before.score,
            })));
            console.log('Riolu + Gravity Mountain across LRM events:');
            console.table(audit.riolu_gravityTrace.flatMap(t => t.events.map(e => ({
                card: t.target,
                fn: e.fn,
                before_count: e.before,
                after_count: e.after,
            }))));
            console.log('───────────────────────────────────────────────────────');
            console.log('To export full audit: copy(__dipiAudit)');
            console.log('Then paste back to the audit conversation.');

            return result;
        };
        console.log('[DIPI-AUDIT] ✓ Patched window.autoCompleteConsistency');
    } else {
        console.warn('[DIPI-AUDIT] window.autoCompleteConsistency not found');
    }

    console.log('[DIPI-AUDIT] All patches installed.');
    console.log('[DIPI-AUDIT] Now click "Consistency Generate" on the page.');
})();
