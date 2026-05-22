// app-init.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                // Reset transient UI/deck state on every full page reload.
                [
                    'autosave_deck',
                    'cityLeagueDeck',
                    'currentMetaDeck',
                    'pastMetaDeck',
                    'cityLeagueFormat',
                    'averageDisplayMode'
                ].forEach(key => {
                    try { localStorage.removeItem(key); } catch (_) {}
                });

                const lastUpdate = localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString('de-DE');
                const lastUpdateEl = document.getElementById('last-update');
                if (lastUpdateEl) {
                    lastUpdateEl.textContent = lastUpdate;
                }
                // Mirror the date into all section-header freshness chips
                // so the user always sees how fresh the data they're
                // looking at is, not just in the footer.
                document.querySelectorAll('.js-data-freshness').forEach(el => {
                    el.textContent = lastUpdate;
                });
                
                // Initialize City League format dropdowns
                const savedFormat = 'M4';
                const formatDropdown = document.getElementById('cityLeagueFormatSelect');
                const analysisFormatDropdown = document.getElementById('cityLeagueFormatSelectAnalysis');
                if (formatDropdown) {
                    formatDropdown.value = savedFormat;
                }
                if (analysisFormatDropdown) {
                    analysisFormatDropdown.value = savedFormat;
                }
                window.currentCityLeagueFormat = savedFormat;

                const startupLoads = [
                    { key: 'all_cards', run: () => loadAllCardsDatabase() },
                    { key: 'ace_specs', run: () => loadAceSpecsList() },
                    { key: 'city_leagues', run: () => loadCityLeagueData() },
                    { key: 'pokedex_numbers', run: () => loadPokedexNumbers() },
                    { key: 'set_mapping', run: () => loadSetMapping() },
                    { key: 'rarity_preferences', run: () => loadRarityPreferences() },
                    { key: 'set_order', run: () => loadSetOrderMap() }
                ];

                const settledLoads = await Promise.allSettled(startupLoads.map(load => load.run()));
                settledLoads.forEach((result, index) => {
                    const loadKey = startupLoads[index].key;
                    if (result.status === 'rejected') {
                        console.error(`[Init] ${loadKey} failed:`, result.reason);
                    }
                });

                window.cityLeagueLoaded = settledLoads[2].status === 'fulfilled';

                window.__appResourcesSettled = true;
                document.documentElement.dataset.appReady = 'true';
                window.dispatchEvent(new CustomEvent('app:resources-settled'));
                window.dispatchEvent(new CustomEvent('app:ui-ready'));
                devLog('[Init] All resources settled. UI is ready.');

                // Preload MetaCall CSV data in background so the tab opens instantly
                setTimeout(() => { window.MetaCall?.preload?.(); }, 1500);
            } catch (e) {
                console.error('[init] App initialization failed:', e);
            } finally {
                hideAppLoadingOverlay();
                runAppLoadingWatchdog();
            }
        });
        
        // ========================================================================