// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:8000';
const TAB_SWITCH_WAIT = 4000;
const ENRICHMENT_WAIT = 12000; // Time for Phase 2 enrichment (playable cards, coverage, etc.)
const FILTER_RENDER_WAIT = 2000;

/**
 * Navigate to the cards tab and wait for Phase 1 (basic render) to complete.
 */
async function openCardsTab(page) {
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => switchTab('cards'));
    await page.waitForTimeout(TAB_SWITCH_WAIT);
    // Wait until cards are loaded (Phase 1)
    await page.waitForFunction(() => window.cardsLoaded === true, { timeout: 30000 });
}

/**
 * Wait for enrichment data (Phase 2) to be fully loaded.
 */
async function waitForEnrichment(page) {
    await page.waitForFunction(() => {
        return window.playableCardsSet && window.playableCardsSet.size > 0;
    }, { timeout: ENRICHMENT_WAIT });
}

/**
 * Get the current number of filtered cards from the results info text.
 */
async function getFilteredCount(page) {
    const text = await page.locator('#cardResultsInfo').textContent();
    // e.g. "1234 cards found" or "Showing 63 of 1234 cards"
    const match = text.match(/(\d[\d,]*)\s*cards/i) || text.match(/of\s+(\d[\d,]*)/i);
    if (!match) return -1;
    return parseInt(match[1].replace(/,/g, ''), 10);
}

/**
 * Reset all filters to default state (Total checked).
 */
async function resetFilters(page) {
    await page.evaluate(() => resetCardFilters());
    await page.waitForTimeout(FILTER_RENDER_WAIT);
}

/**
 * Toggle a filter section open by clicking its header.
 */
async function openFilterSection(page, filterId) {
    const isCollapsed = await page.evaluate((id) => {
        const el = document.getElementById(id);
        return el && el.classList.contains('collapsed');
    }, filterId);
    if (isCollapsed) {
        await page.evaluate((id) => toggleCardFilter(id), filterId);
        await page.waitForTimeout(300);
    }
}

/**
 * Check a checkbox in a filter section by its value.
 */
async function checkFilterOption(page, containerId, value) {
    await openFilterSection(page, containerId);
    await page.evaluate(({ containerId, value }) => {
        const cb = document.querySelector(`#${containerId} input[value="${value}"]`);
        if (cb && !cb.checked) {
            cb.checked = true;
            // Trigger inline onchange handler if present
            if (cb.onchange) cb.onchange();
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Always ensure filter runs
        if (typeof filterAndRenderCards === 'function') filterAndRenderCards();
    }, { containerId, value });
    await page.waitForTimeout(FILTER_RENDER_WAIT);
}

/**
 * Uncheck a checkbox in a filter section by its value.
 */
async function uncheckFilterOption(page, containerId, value) {
    await page.evaluate(({ containerId, value }) => {
        const cb = document.querySelector(`#${containerId} input[value="${value}"]`);
        if (cb && cb.checked) {
            cb.checked = false;
            if (cb.onchange) cb.onchange();
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (typeof filterAndRenderCards === 'function') filterAndRenderCards();
    }, { containerId, value });
    await page.waitForTimeout(FILTER_RENDER_WAIT);
}

// ═══════════════════════════════════════════════════════════════
//  TEST SUITE: Card Database Filters
// ═══════════════════════════════════════════════════════════════

test.describe('Card Database Filters', () => {

    // ───────────────────────────────────────────────────────────
    //  1. Initial state: Total filter (all cards)
    // ───────────────────────────────────────────────────────────
    test('Initial load shows all cards with "Total" checked', async ({ page }) => {
        await openCardsTab(page);

        // "Total" radio should be checked by default
        const totalChecked = await page.evaluate(() => {
            const cb = document.querySelector('#metaFormatOptions input[value="total"]');
            return cb ? cb.checked : false;
        });
        expect(totalChecked).toBe(true);

        const count = await getFilteredCount(page);
        expect(count).toBeGreaterThan(500); // Should have many cards
        console.log(`[Total] ${count} cards`);
    });

    // ───────────────────────────────────────────────────────────
    //  2. Meta/Format: All Playables filter
    // ───────────────────────────────────────────────────────────
    test('All Playables filter shows only playable cards', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        // Get total count first
        const totalCount = await getFilteredCount(page);

        // Verify playableCardsSet is loaded
        const playableSetSize = await page.evaluate(() => window.playableCardsSet ? window.playableCardsSet.size : 0);
        console.log(`[Enrichment] playableCardsSet has ${playableSetSize} entries`);
        expect(playableSetSize).toBeGreaterThan(0);

        // Select "All Playables" radio (auto-deselects Total)
        await checkFilterOption(page, 'metaFormatOptions', 'all_playables');

        const playableCount = await getFilteredCount(page);
        console.log(`[All Playables] ${playableCount} cards (Total was ${totalCount})`);
        expect(playableCount).toBeGreaterThan(0);
        expect(playableCount).toBeLessThan(totalCount);
    });

    // ───────────────────────────────────────────────────────────
    //  3. Meta/Format: City League Only filter
    // ───────────────────────────────────────────────────────────
    test('City League Only filter shows fewer cards than All Playables', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        // Select City League radio (auto-deselects Total)
        await checkFilterOption(page, 'metaFormatOptions', 'city_league');

        const cityLeagueCount = await getFilteredCount(page);
        console.log(`[City League] ${cityLeagueCount} cards`);
        expect(cityLeagueCount).toBeGreaterThan(0);

        // Verify cityLeagueCardsSet is loaded
        const cityLeagueSetSize = await page.evaluate(() => window.cityLeagueCardsSet ? window.cityLeagueCardsSet.size : 0);
        expect(cityLeagueSetSize).toBeGreaterThan(0);

        // City League should be <= All Playables
        await checkFilterOption(page, 'metaFormatOptions', 'all_playables');
        const playableCount = await getFilteredCount(page);
        expect(cityLeagueCount).toBeLessThanOrEqual(playableCount);
    });

    // ───────────────────────────────────────────────────────────
    //  4. Category: Supporter filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Supporter shows only Supporters', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'supporter');

        const count = await getFilteredCount(page);
        console.log(`[Category: Supporter] ${count} cards`);
        expect(count).toBeGreaterThan(10);

        // Verify all visible cards have Supporter type
        const allSupporters = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 50);
            return cards.every(c => (c.type || '').includes('Supporter'));
        });
        expect(allSupporters).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  5. Category: Item filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Item shows only Items (no Tools)', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'item');

        const count = await getFilteredCount(page);
        console.log(`[Category: Item] ${count} cards`);
        expect(count).toBeGreaterThan(10);

        // Verify: type includes Item but NOT Tool
        const allItems = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 50);
            return cards.every(c => {
                const t = c.type || '';
                return t.includes('Item') && !t.includes('Tool');
            });
        });
        expect(allItems).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  6. Category: Pokemon (All) filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Pokemon (All) shows only Pokemon', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'pokemon_all');

        const count = await getFilteredCount(page);
        console.log(`[Category: Pokemon All] ${count} cards`);
        expect(count).toBeGreaterThan(100);

        // Verify none of these are trainer/energy
        const noneTrainer = await page.evaluate(() => {
            const pokemonTypes = ['Basic', 'Stage 1', 'Stage 2', 'VSTAR', 'VMAX', 'VUNION', 'V', 'GX', 'EX', 'ex', 'BREAK'];
            const cards = window.filteredCardsData.slice(0, 100);
            return cards.every(c => {
                const t = c.type || '';
                return pokemonTypes.some(pt => t === pt || t.includes(pt)) && !['Item', 'Supporter', 'Stadium', 'Tool', 'Energy'].some(k => t.includes(k));
            });
        });
        expect(noneTrainer).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  7. Category: Basic Energy filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Basic Energy shows only Basic Energy', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'basic_energy');

        const count = await getFilteredCount(page);
        console.log(`[Category: Basic Energy] ${count} cards`);
        expect(count).toBeGreaterThanOrEqual(0); // May be 0 depending on data

        if (count > 0) {
            const allBasicEnergy = await page.evaluate(() => {
                const cards = window.filteredCardsData.slice(0, 50);
                return cards.every(c => (c.type || '') === 'Basic Energy');
            });
            expect(allBasicEnergy).toBe(true);
        }
    });

    // ───────────────────────────────────────────────────────────
    //  8. Category: Stadium filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Stadium shows only Stadiums', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'stadium');

        const count = await getFilteredCount(page);
        console.log(`[Category: Stadium] ${count} cards`);
        expect(count).toBeGreaterThan(3);

        const allStadiums = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 50);
            return cards.every(c => (c.type || '').includes('Stadium'));
        });
        expect(allStadiums).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  9. Category: Tool filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Pokemon Tool shows only Tools', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'tool');

        const count = await getFilteredCount(page);
        console.log(`[Category: Tool] ${count} cards`);
        expect(count).toBeGreaterThan(2);

        const allTools = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 50);
            return cards.every(c => (c.type || '').includes('Tool'));
        });
        expect(allTools).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  10. Category: Special Energy filter
    // ───────────────────────────────────────────────────────────
    test('Category filter: Special Energy shows only Special Energy', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'categoryFilterOptions', 'special_energy');

        const count = await getFilteredCount(page);
        console.log(`[Category: Special Energy] ${count} cards`);
        expect(count).toBeGreaterThan(1);

        const allSpecialEnergy = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 50);
            return cards.every(c => (c.type || '').includes('Special Energy'));
        });
        expect(allSpecialEnergy).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  10b. Element type filter
    // ───────────────────────────────────────────────────────────
    test('Element type filter: Fire shows only Fire-type Pokemon', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'elementTypeFilterOptions', 'Fire');

        const count = await getFilteredCount(page);
        console.log(`[Element Type: Fire] ${count} cards`);
        expect(count).toBeGreaterThan(1);

        // Verify all displayed cards have Fire element type
        const allFire = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 50);
            return cards.every(c => {
                const dex = String(c.pokedex_number);
                const typeMap = window.pokemonTypeMap || {};
                return typeMap[dex] === 'Fire';
            });
        });
        expect(allFire).toBe(true);
    });

    test('Element type filter: multiple types show union', async ({ page }) => {
        await openCardsTab(page);

        await checkFilterOption(page, 'elementTypeFilterOptions', 'Fire');
        const fireCount = await getFilteredCount(page);

        await checkFilterOption(page, 'elementTypeFilterOptions', 'Water');
        const combinedCount = await getFilteredCount(page);

        console.log(`[Element Type: Fire+Water] Fire=${fireCount}, Combined=${combinedCount}`);
        expect(combinedCount).toBeGreaterThan(fireCount);
    });

    // ───────────────────────────────────────────────────────────
    //  11. Set filter
    // ───────────────────────────────────────────────────────────
    test('Set filter limits cards to selected set', async ({ page }) => {
        await openCardsTab(page);

        // Get first available set option
        const firstSetValue = await page.evaluate(() => {
            const cb = document.querySelector('#setFilterOptions input[type="checkbox"]');
            return cb ? cb.value : null;
        });
        expect(firstSetValue).not.toBeNull();

        await checkFilterOption(page, 'setFilterOptions', firstSetValue);

        const count = await getFilteredCount(page);
        console.log(`[Set: ${firstSetValue}] ${count} cards`);
        expect(count).toBeGreaterThan(0);

        // All filtered cards must belong to the selected set
        const allSameSet = await page.evaluate((setVal) => {
            return window.filteredCardsData.every(c => c.set === setVal);
        }, firstSetValue);
        expect(allSameSet).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  12. Rarity filter
    // ───────────────────────────────────────────────────────────
    test('Rarity filter limits cards to selected rarity', async ({ page }) => {
        await openCardsTab(page);

        // Get first rarity option
        const firstRarityValue = await page.evaluate(() => {
            const cb = document.querySelector('#rarityFilterOptions input[type="checkbox"]');
            return cb ? cb.value : null;
        });
        expect(firstRarityValue).not.toBeNull();

        await checkFilterOption(page, 'rarityFilterOptions', firstRarityValue);

        const count = await getFilteredCount(page);
        console.log(`[Rarity: ${firstRarityValue}] ${count} cards`);
        expect(count).toBeGreaterThan(0);

        const allSameRarity = await page.evaluate((rarity) => {
            return window.filteredCardsData.every(c => c.rarity === rarity);
        }, firstRarityValue);
        expect(allSameRarity).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  13. Search filter (omni-search)
    // ───────────────────────────────────────────────────────────
    test('Search filter finds cards by name', async ({ page }) => {
        await openCardsTab(page);

        // Search for "Pikachu"
        await page.evaluate(() => {
            const input = document.getElementById('cardSearch');
            if (input) {
                input.value = 'pikachu';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const count = await getFilteredCount(page);
        console.log(`[Search: pikachu] ${count} cards`);
        expect(count).toBeGreaterThan(0);

        // Verify all results contain pikachu in name
        const allMatchSearch = await page.evaluate(() => {
            return window.filteredCardsData.every(c => {
                const nameEn = (c.name_en || c.name || '').toLowerCase();
                const nameDe = (c.name_de || '').toLowerCase();
                const baseName = (c.name || '').toLowerCase();
                return nameEn.includes('pikachu') || nameDe.includes('pikachu') || baseName.includes('pikachu');
            });
        });
        expect(allMatchSearch).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  14. Combined filters: Category + Set
    // ───────────────────────────────────────────────────────────
    test('Combined filters: Category + Set intersect correctly', async ({ page }) => {
        await openCardsTab(page);

        // Get first set
        const firstSetValue = await page.evaluate(() => {
            const cb = document.querySelector('#setFilterOptions input[type="checkbox"]');
            return cb ? cb.value : null;
        });
        expect(firstSetValue).not.toBeNull();

        // First: Set only
        await checkFilterOption(page, 'setFilterOptions', firstSetValue);
        const setCount = await getFilteredCount(page);

        // Then add Supporter category
        await checkFilterOption(page, 'categoryFilterOptions', 'supporter');
        const combinedCount = await getFilteredCount(page);

        console.log(`[Combined] Set ${firstSetValue}: ${setCount}, + Supporter: ${combinedCount}`);
        expect(combinedCount).toBeLessThanOrEqual(setCount);
        expect(combinedCount).toBeGreaterThanOrEqual(0);

        // All remaining cards must match both
        if (combinedCount > 0) {
            const allMatch = await page.evaluate((setVal) => {
                return window.filteredCardsData.every(c =>
                    c.set === setVal && (c.type || '').includes('Supporter')
                );
            }, firstSetValue);
            expect(allMatch).toBe(true);
        }
    });

    // ───────────────────────────────────────────────────────────
    //  15. Reset filters restores default state
    // ───────────────────────────────────────────────────────────
    test('Reset filters restores all cards with Total checked', async ({ page }) => {
        await openCardsTab(page);
        const initialCount = await getFilteredCount(page);

        // Apply some filter
        await checkFilterOption(page, 'categoryFilterOptions', 'supporter');
        const filteredCount = await getFilteredCount(page);
        expect(filteredCount).toBeLessThan(initialCount);

        // Reset
        await resetFilters(page);

        const afterResetCount = await getFilteredCount(page);
        expect(afterResetCount).toBe(initialCount);

        // Total should be checked again
        const totalChecked = await page.evaluate(() => {
            const cb = document.querySelector('#metaFormatOptions input[value="total"]');
            return cb ? cb.checked : false;
        });
        expect(totalChecked).toBe(true);

        // Supporter should be unchecked
        const supporterChecked = await page.evaluate(() => {
            const cb = document.querySelector('#categoryFilterOptions input[value="supporter"]');
            return cb ? cb.checked : false;
        });
        expect(supporterChecked).toBe(false);
    });

    // ───────────────────────────────────────────────────────────
    //  16. Deck Coverage filter (requires enrichment)
    // ───────────────────────────────────────────────────────────
    test('Deck Coverage filter shows only high-coverage cards', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        // Wait for deck coverage data
        await page.waitForFunction(() => {
            return window.cardDeckCoverageMap && window.cardDeckCoverageMap.size > 0;
        }, { timeout: ENRICHMENT_WAIT });

        // Switch to All Playables radio (auto-deselects Total)
        await checkFilterOption(page, 'metaFormatOptions', 'all_playables');
        const playableCount = await getFilteredCount(page);

        // Apply >= 50% coverage filter (global) — this should reduce the card count
        await openFilterSection(page, 'deckCoverageFilterOptions');
        await page.evaluate(() => {
            const radio = document.querySelector('#deckCoverageFilterOptions input[value="50"]');
            if (radio) {
                radio.checked = true;
                if (radio.onchange) radio.onchange();
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (typeof filterAndRenderCards === 'function') filterAndRenderCards();
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const coverageCount = await getFilteredCount(page);
        console.log(`[Deck Coverage >= 50%] ${coverageCount} of ${playableCount} playable cards`);
        // Coverage filter should reduce the count (even to 0 is valid since global coverage is spread across many archetypes)
        expect(coverageCount).toBeLessThan(playableCount);

        // Deselect the radio — count should return to playable count
        await page.evaluate(() => {
            const radio = document.querySelector('#deckCoverageFilterOptions input[value="50"]');
            if (radio) {
                radio.checked = false;
                radio.dataset.wasChecked = 'false';
            }
            if (typeof filterAndRenderCards === 'function') filterAndRenderCards();
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const resetCount = await getFilteredCount(page);
        console.log(`[Deck Coverage reset] ${resetCount} cards (expected ~${playableCount})`);
        expect(resetCount).toBe(playableCount);
    });

    // ───────────────────────────────────────────────────────────
    //  17. Main Pokemon filter (requires enrichment)
    // ───────────────────────────────────────────────────────────
    test('Main Pokemon filter shows cards belonging to decks with that Pokemon', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        // Wait for mainPokemonCardsMap
        await page.waitForFunction(() => {
            return window.mainPokemonCardsMap && window.mainPokemonCardsMap.size > 0;
        }, { timeout: ENRICHMENT_WAIT });

        const totalCount = await getFilteredCount(page);

        // Get first available main pokemon
        const firstMainPokemon = await page.evaluate(() => {
            const cb = document.querySelector('#mainPokemonList input[type="checkbox"]');
            return cb ? cb.value : null;
        });

        if (firstMainPokemon) {
            await checkFilterOption(page, 'mainPokemonList', firstMainPokemon);

            const count = await getFilteredCount(page);
            console.log(`[Main Pokemon: ${firstMainPokemon}] ${count} cards (Total: ${totalCount})`);
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(totalCount);
        } else {
            console.log('[Main Pokemon] No main pokemon options available - skipping');
        }
    });

    // ───────────────────────────────────────────────────────────
    //  18. Archetype filter (requires enrichment)
    // ───────────────────────────────────────────────────────────
    test('Archetype filter shows cards from selected archetype', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        // Wait for archetypeCardsMap
        await page.waitForFunction(() => {
            return window.archetypeCardsMap && window.archetypeCardsMap.size > 0;
        }, { timeout: ENRICHMENT_WAIT });

        const totalCount = await getFilteredCount(page);

        // Get first available archetype
        const firstArchetype = await page.evaluate(() => {
            const cb = document.querySelector('#archetypeList input[type="checkbox"]');
            return cb ? cb.value : null;
        });

        if (firstArchetype) {
            await checkFilterOption(page, 'archetypeList', firstArchetype);

            const count = await getFilteredCount(page);
            console.log(`[Archetype: ${firstArchetype}] ${count} cards (Total: ${totalCount})`);
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(totalCount);

            // Verify cards belong to this archetype
            const allMatchArch = await page.evaluate((arch) => {
                if (!window.archetypeCardsMap || !window.archetypeCardsMap.has(arch)) return false;
                const cardsForArch = window.archetypeCardsMap.get(arch);
                return window.filteredCardsData.every(c => {
                    const norm = typeof normalizeCardName === 'function' ? normalizeCardName(c.name) : (c.name || '').toLowerCase();
                    return cardsForArch.has(norm);
                });
            }, firstArchetype);
            expect(allMatchArch).toBe(true);
        } else {
            console.log('[Archetype] No archetype options available - skipping');
        }
    });

    // ───────────────────────────────────────────────────────────
    //  19. Sort order: by Pokédex No.
    // ───────────────────────────────────────────────────────────
    test('Sort by Pokedex sorts Pokemon by dex number', async ({ page }) => {
        await openCardsTab(page);

        // Change sort to pokedex
        await page.evaluate(() => {
            const select = document.getElementById('cardSortOrder');
            if (select) {
                select.value = 'pokedex';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        // Check first 20 Pokemon cards have non-decreasing dex numbers
        const sorted = await page.evaluate(() => {
            const cards = window.filteredCardsData.slice(0, 20);
            let lastDex = 0;
            for (const c of cards) {
                const dex = parseInt(c.pokedex_number || '0') || 0;
                if (dex > 0) {
                    if (dex < lastDex) return false;
                    lastDex = dex;
                }
            }
            return true;
        });
        expect(sorted).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  20. Standard Print / All Prints toggle
    // ───────────────────────────────────────────────────────────
    test('All Prints toggle shows more cards than Standard Print', async ({ page }) => {
        await openCardsTab(page);

        // Standard Print (default) count
        const standardCount = await getFilteredCount(page);

        // Switch to All Prints
        await page.evaluate(() => {
            const btn = document.getElementById('btnAllPrints');
            if (btn) btn.click();
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const allPrintsCount = await getFilteredCount(page);
        console.log(`[Print Toggle] Standard: ${standardCount}, All Prints: ${allPrintsCount}`);
        expect(allPrintsCount).toBeGreaterThanOrEqual(standardCount);

        // Switch back to Standard
        await page.evaluate(() => {
            const btn = document.getElementById('btnStandardPrint');
            if (btn) btn.click();
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const backToStandard = await getFilteredCount(page);
        expect(backToStandard).toBe(standardCount);
    });

    // ───────────────────────────────────────────────────────────
    //  21. Multiple categories combine as OR
    // ───────────────────────────────────────────────────────────
    test('Multiple categories combine as OR (union)', async ({ page }) => {
        await openCardsTab(page);

        // Supporter only
        await checkFilterOption(page, 'categoryFilterOptions', 'supporter');
        const supporterCount = await getFilteredCount(page);

        // Add Item
        await checkFilterOption(page, 'categoryFilterOptions', 'item');
        const combinedCount = await getFilteredCount(page);

        console.log(`[Multi-Category] Supporter: ${supporterCount}, Supporter+Item: ${combinedCount}`);
        expect(combinedCount).toBeGreaterThan(supporterCount);
    });

    // ───────────────────────────────────────────────────────────
    //  22. Meta Filter (meta:XXX periods) requires enrichment
    // ───────────────────────────────────────────────────────────
    test('Meta period filter shows cards from that meta', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        // Check if any meta: options exist
        const metaOptionValue = await page.evaluate(() => {
            const cb = document.querySelector('#metaFormatOptions input[type="checkbox"][value^="meta:"]');
            return cb ? cb.value : null;
        });

        if (metaOptionValue) {
            const totalCount = await getFilteredCount(page);
            
            // Check this meta period checkbox (Total radio stays selected, meta is additive)
            await checkFilterOption(page, 'metaFormatOptions', metaOptionValue);

            const metaCount = await getFilteredCount(page);
            console.log(`[Meta: ${metaOptionValue}] ${metaCount} cards (Total: ${totalCount})`);
            expect(metaCount).toBeGreaterThan(0);
            expect(metaCount).toBeLessThanOrEqual(totalCount);
        } else {
            console.log('[Meta Filter] No meta: options available - skipping');
        }
    });

    // ───────────────────────────────────────────────────────────
    //  23. Search by set+number
    // ───────────────────────────────────────────────────────────
    test('Search by set code + number finds specific card', async ({ page }) => {
        await openCardsTab(page);

        // Get info about the first card to search for it
        const cardInfo = await page.evaluate(() => {
            const card = window.allCardsData[0];
            return card ? { set: card.set, number: card.number, name: card.name } : null;
        });
        expect(cardInfo).not.toBeNull();

        const searchTerm = `${cardInfo.set} ${cardInfo.number}`;
        await page.evaluate((term) => {
            const input = document.getElementById('cardSearch');
            if (input) {
                input.value = term;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, searchTerm);
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const count = await getFilteredCount(page);
        console.log(`[Search: "${searchTerm}"] ${count} cards`);
        expect(count).toBeGreaterThan(0);
    });

    // ───────────────────────────────────────────────────────────
    //  24. Empty search shows all cards
    // ───────────────────────────────────────────────────────────
    test('Empty search shows all cards', async ({ page }) => {
        await openCardsTab(page);
        const initialCount = await getFilteredCount(page);

        // Type something
        await page.evaluate(() => {
            const input = document.getElementById('cardSearch');
            if (input) {
                input.value = 'pikachu';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        // Clear search
        await page.evaluate(() => {
            const input = document.getElementById('cardSearch');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(FILTER_RENDER_WAIT);

        const afterClear = await getFilteredCount(page);
        expect(afterClear).toBe(initialCount);
    });

    // ───────────────────────────────────────────────────────────
    //  25. Filter sections collapse/expand
    // ───────────────────────────────────────────────────────────
    test('Filter sections toggle collapse/expand', async ({ page }) => {
        await openCardsTab(page);

        // metaFormatOptions should start collapsed
        const isCollapsed = await page.evaluate(() => {
            const el = document.getElementById('metaFormatOptions');
            return el ? el.classList.contains('collapsed') : null;
        });
        expect(isCollapsed).toBe(true);

        // Expand it
        await page.evaluate(() => toggleCardFilter('metaFormatOptions'));
        await page.waitForTimeout(300);

        const isExpanded = await page.evaluate(() => {
            const el = document.getElementById('metaFormatOptions');
            return el ? !el.classList.contains('collapsed') : null;
        });
        expect(isExpanded).toBe(true);

        // Collapse it again
        await page.evaluate(() => toggleCardFilter('metaFormatOptions'));
        await page.waitForTimeout(300);

        const isCollapsedAgain = await page.evaluate(() => {
            const el = document.getElementById('metaFormatOptions');
            return el ? el.classList.contains('collapsed') : null;
        });
        expect(isCollapsedAgain).toBe(true);
    });

    // ───────────────────────────────────────────────────────────
    //  26. Multiple set filter combines as OR
    // ───────────────────────────────────────────────────────────
    test('Multiple sets combine as OR', async ({ page }) => {
        await openCardsTab(page);

        // Get first two set options
        const setValues = await page.evaluate(() => {
            const cbs = document.querySelectorAll('#setFilterOptions input[type="checkbox"]');
            return cbs.length >= 2 ? [cbs[0].value, cbs[1].value] : [];
        });

        if (setValues.length >= 2) {
            await checkFilterOption(page, 'setFilterOptions', setValues[0]);
            const firstSetCount = await getFilteredCount(page);

            await checkFilterOption(page, 'setFilterOptions', setValues[1]);
            const bothSetsCount = await getFilteredCount(page);

            console.log(`[Multi-Set] Set1: ${firstSetCount}, Set1+Set2: ${bothSetsCount}`);
            expect(bothSetsCount).toBeGreaterThanOrEqual(firstSetCount);
        }
    });

    // ───────────────────────────────────────────────────────────
    //  27. Enrichment sets are populated correctly
    // ───────────────────────────────────────────────────────────
    test('Enrichment: playableCardsSet and cityLeagueCardsSet are populated', async ({ page }) => {
        await openCardsTab(page);
        await waitForEnrichment(page);

        const data = await page.evaluate(() => ({
            playableSize: window.playableCardsSet ? window.playableCardsSet.size : 0,
            cityLeagueSize: window.cityLeagueCardsSet ? window.cityLeagueCardsSet.size : 0,
            coverageSize: window.cardDeckCoverageMap ? window.cardDeckCoverageMap.size : 0,
        }));

        console.log(`[Enrichment] playable: ${data.playableSize}, cityLeague: ${data.cityLeagueSize}, coverage: ${data.coverageSize}`);
        expect(data.playableSize).toBeGreaterThan(0);
        expect(data.cityLeagueSize).toBeGreaterThan(0);
        // City League should be subset of All Playables
        expect(data.cityLeagueSize).toBeLessThanOrEqual(data.playableSize);
    });
});
