import re
import os

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'app.js')
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

# Find boundaries
start_idx = None  # first line to REPLACE (after "After aggregation" log)
end_idx = None    # first line to KEEP after the replaced block

for i, line in enumerate(lines):
    if "autoCompleteConsistency] After aggregation:" in line:
        start_idx = i + 1   # keep the log line, replace everything after it
    if start_idx and i > start_idx and "updateDeckDisplay(source)" in line:
        end_idx = i + 3      # include updateDeckDisplay + closing "}" x2
        break

print(f"start_idx={start_idx} (1-based line {start_idx+1})")
print(f"end_idx={end_idx}    (1-based line {end_idx+1})")
print("--- START LINE ---")
print(repr(lines[start_idx]))
print("--- LAST 3 REPLACED LINES ---")
for l in lines[end_idx-3:end_idx]:
    print(repr(l))

# The new algorithm block to inject (12-space indent = function body level)
NEW_BLOCK = '''\
            
            // Step 2: Compute per-card statistics
            deckCards.forEach(card => {
                const sharePercent = parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.'));
                const totalCount = parseFloat(card.total_count) || 1;
                const deckCount = parseInt(card.deck_count) || 1;
                const avgCountWhenUsed = totalCount / deckCount;
                const metaShare = getMetaShareForCard(card.card_name, source);
                card.sharePercent = sharePercent;
                card.avgCountWhenUsed = avgCountWhenUsed;
                card.metaShare = metaShare;
                // Score: archetype share dominates; meta share breaks ties
                card.score = sharePercent + (metaShare * 0.1);
            });

            // Step 3: STRICT 5% CUTOFF -- ignore cards used in <5% of archetype decks
            // This eliminates noise like a 3.5% Darkness Energy that nobody actually plays
            let filtered = deckCards.filter(card => card.sharePercent >= 5);

            // Step 4: Target count = Math.round(avgCountWhenUsed) -- pure data, no heuristics
            filtered.forEach(card => {
                let count = Math.round(card.avgCountWhenUsed);
                // Staple guarantee: if >50% of decks play it, include at least 1
                if (count === 0 && card.sharePercent >= 50) count = 1;
                // ACE SPEC rule: max 1 per deck
                if (isAceSpec(card)) count = Math.min(count, 1);
                card.targetCount = count;
            });
            filtered = filtered.filter(card => card.targetCount > 0);

            // Step 5: Sort by score -- highest archetype share first
            filtered.sort((a, b) => b.score - a.score);
            console.log(`[autoCompleteConsistency] ${filtered.length} eligible cards after 5% cutoff`);

            // Step 6: Fill deck to 60 in score order
            let cardsToAdd = [];
            let aceSpecAdded = false;
            for (const card of filtered) {
                if (currentTotal >= 60) break;
                if (isAceSpec(card)) {
                    if (aceSpecAdded) continue;
                    aceSpecAdded = true;
                }
                const amountToAdd = Math.min(card.targetCount, 60 - currentTotal);
                cardsToAdd.push({ ...card, addCount: amountToAdd });
                currentTotal += amountToAdd;
                console.log(`[autoCompleteConsistency]   + ${amountToAdd}x ${card.card_name} (Arch: ${card.sharePercent.toFixed(1)}% @ ${card.avgCountWhenUsed.toFixed(2)}x) -- Total: ${currentTotal}/60`);
            }

            // Step 7: Rare Candy guarantee for Stage 2 decks (ex / VMAX / GX)
            const hasStage2ex = cardsToAdd.some(c => /\\s+(ex|vmax|vstar|gx|break)\\b/i.test(c.card_name));
            if (hasStage2ex) {
                const CANDY_MIN = 3;
                const candyEntry = cardsToAdd.find(c => c.card_name === 'Rare Candy');
                if (candyEntry && candyEntry.addCount < CANDY_MIN) {
                    const bump = CANDY_MIN - candyEntry.addCount;
                    if (currentTotal + bump <= 60) {
                        candyEntry.addCount = CANDY_MIN;
                        currentTotal += bump;
                        console.log(`[autoCompleteConsistency] Rare Candy bumped to ${CANDY_MIN}x (Stage 2 deck) -- Total: ${currentTotal}/60`);
                    }
                }
            }

            // Step 8: Fallback fill -- reach 60 with the dominant Basic Energy
            if (currentTotal < 60) {
                const spaceLeft = 60 - currentTotal;
                const primaryEnergy = filtered
                    .filter(c => isBaseEnergy(c))
                    .sort((a, b) => b.sharePercent - a.sharePercent)[0];
                if (primaryEnergy) {
                    const existing = cardsToAdd.find(c => c.card_name === primaryEnergy.card_name);
                    if (existing) {
                        existing.addCount += spaceLeft;
                    } else {
                        cardsToAdd.push({ ...primaryEnergy, addCount: spaceLeft });
                    }
                    currentTotal += spaceLeft;
                    console.log(`[autoCompleteConsistency] Fallback: +${spaceLeft}x ${primaryEnergy.card_name} -- Total: ${currentTotal}/60`);
                }
            }

            console.log(`[autoCompleteConsistency] Deck complete: ${currentTotal}/60`);

            // Build confirm summary
            let summary = `MAX CONSISTENCY Deck (${currentTotal} cards):\\n`;
            summary += `Algorithm: Math.round(avgCountWhenUsed), 5% cutoff, no phase heuristics\\n\\n`;
            cardsToAdd.forEach(c => {
                summary += `${c.addCount}x ${c.card_name} (${c.sharePercent.toFixed(0)}% archetype)\\n`;
            });
            summary += `\\nContinue?`;

            if (confirm(summary)) {
                cardsToAdd.forEach(card => {
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(card.card_name, originalSetCode, originalSetNumber);
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                    } else {
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                    }
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, card.card_name, setCode, setNumber);
                    }
                });

                console.log('[autoCompleteConsistency] Consistency deck completed with rarity mode:', globalRarityPreference);

                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }

                updateDeckDisplay(source);
            }
        }
'''

new_lines = lines[:start_idx] + [NEW_BLOCK] + lines[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Done! Wrote", len(new_lines), "lines (was", len(lines), ")")
