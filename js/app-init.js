// app-init.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        document.addEventListener('DOMContentLoaded', async () => {
            try {
                const lastUpdate = localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString('de-DE');
                const lastUpdateEl = document.getElementById('last-update');
                if (lastUpdateEl) {
                    lastUpdateEl.textContent = lastUpdate;
                }
                
                // Initialize City League format dropdowns
                const savedFormat = localStorage.getItem('cityLeagueFormat') || 'M4';
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
            } catch (e) {
                console.error('[init] App initialization failed:', e);
            } finally {
                hideAppLoadingOverlay();
                runAppLoadingWatchdog();
            }
        });
        
        // ========================================================================