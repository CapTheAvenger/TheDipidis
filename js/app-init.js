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

                // Tutorial-Bildsonde. Der Code dafuer liegt seit dem
                // 18.08.2026 in js/ds-tutorial.js und laeuft dort nach
                // dem Nachladen der Anleitung — beim Seitenstart gibt es
                // die Slots noch gar nicht mehr. Der Aufruf hier bleibt
                // fuer den Fall, dass die Anleitung doch schon haengt.
                if (typeof window.hydrateTutorialImages === 'function') {
                    window.hydrateTutorialImages(document);
                }
                
                // Initialize City League format dropdowns.
                //
                // This used to hardcode 'M4', which broke three ways at once:
                // the <select> options are 'current' / 'past', so assigning
                // 'M4' left selectedIndex at -1 and the dropdown rendered
                // BLANK; window.currentCityLeagueFormat became 'M4', which
                // every consumer compares against 'current' / 'past'
                // (app-tier-meta.js:627 etc.) so the current data was rendered
                // through the past-format branch; and it overwrote whatever
                // the user had picked last session (app-city-league.js:116
                // restores it from localStorage, and this ran afterwards).
                //
                // Rotation names must not appear here at all — the set codes
                // move and this file would need an edit every time.
                const LEGACY_FORMAT_ALIASES = { M4: 'current', M3: 'past' };
                let savedFormat = 'current';
                try {
                    const stored = localStorage.getItem('cityLeagueFormat');
                    const resolved = LEGACY_FORMAT_ALIASES[stored] || stored;
                    if (resolved === 'current' || resolved === 'past') savedFormat = resolved;
                } catch (_e) { /* private mode / storage disabled — keep the default */ }

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
                    { key: 'set_order', run: () => loadSetOrderMap() },
                    { key: 'pokemonproxies', run: () => loadPokemonProxiesIndex() },
                    { key: 'prizepack_images', run: () => loadPrizePackImagesIndex() }
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