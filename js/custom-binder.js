(function () {
    'use strict';

    const CB_STORAGE_KEY = 'customBinderArchetypesV1';
    const CB_CACHE_KEY = 'customBinderCacheV1';          // legacy: ids only, superseded by V2
    const CB_CACHE_KEY_V2 = 'customBinderCacheV2';       // {ids, cards, date}
    const CB_PRESETS_KEY = 'customBinderPresetsV1';
    const CB_PRINTED_LS_KEY = 'printedProxiesV1';        // mirror / guest storage
    const CB_THRESHOLD_KEY = 'customBinderThresholdV1';

    let cbSelectedArchetypes = []; // [{name, source}]
    let _cbSessionBaseline = null; // previous-binder baseline, stable per session

    // ── Print-status state (Druckliste mode) ──
    // "printed" is a GLOBAL per-card state (the proxy physically exists in
    // the user's box), keyed by cardId = name|set|number of the displayed
    // print and matched family-wide — NOT per binder and NOT related to
    // MyDex ownership. Stored as an ARRAY of ids (never a map: 185 card
    // names contain '.', and dotted keys are Firestore field paths).
    let cbMode = 'collection';     // 'collection' | 'print'
    let cbThreshold = 70;          // 0 | 30 | 70 (ACE SPECs always bypass)
    let _cbPrintedSet = null;      // Set<cardId>
    let _cbPrintedLoadPromise = null;
    let _cbPrintedSaveTimer = null;
    let _cbPrintedOwner = undefined;   // uid (or null for guest) the cached set belongs to
    let _cbPrintedRemoteOk = false;    // signed-in: did the Firestore read ever succeed?
    let _cbPrintedDirty = false;       // pending debounced write exists
    let cbAllArchetypes = [];      // [{name, source, label}]
    let cbArchetypesLoaded = false;
    let cbFilter = 'all';
    let cbAllPrints = false;
    let _cbSkipNextClose = false;
    let _cbTierGroups = null; // cached tier groups for dropdown
    let cbPresets = []; // [{id, name, archetypes: [{name, source}]}]

    // ── Helpers ──
    function mb() { return window._mbShared || {}; }

    function cbText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    // ── Persistence ──
    function cbSaveSelections() {
        try {
            localStorage.setItem(CB_STORAGE_KEY, JSON.stringify(
                cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source }))
            ));
        } catch (_) { /* ignore */ }
    }

    function cbLoadSelections() {
        try {
            const raw = JSON.parse(localStorage.getItem(CB_STORAGE_KEY) || '[]');
            if (Array.isArray(raw)) {
                cbSelectedArchetypes = raw
                    .filter(a => a && a.name)
                    .map(a => ({ name: String(a.name), source: String(a.source || 'current-meta') }));
            }
        } catch (_) { cbSelectedArchetypes = []; }
    }

    // ── Preset Persistence ──
    function cbLoadPresets() {
        try {
            const raw = JSON.parse(localStorage.getItem(CB_PRESETS_KEY) || '[]');
            cbPresets = Array.isArray(raw) ? raw.filter(p => p && p.id && p.name && Array.isArray(p.archetypes)) : [];
        } catch (_) { cbPresets = []; }
    }

    function cbSavePresets() {
        try { localStorage.setItem(CB_PRESETS_KEY, JSON.stringify(cbPresets)); } catch (_) { /* ignore */ }
    }

    function cbSaveCurrentAsPreset() {
        if (cbSelectedArchetypes.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.noArchetypesSelected', 'No archetypes selected.'), 'warning');
            return;
        }
        const name = prompt(cbText('cb.promptPresetName', 'Name for this binder:'));
        if (!name || !name.trim()) return;
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        cbPresets.push({ id, name: name.trim(), archetypes: cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source })) });
        cbSavePresets();
        cbRenderPresetBar();
        if (typeof showToast === 'function') showToast(cbText('cb.presetSaved', 'Binder saved.').replace('{name}', name.trim()), 'success');
    }

    function cbLoadPreset(id) {
        const preset = cbPresets.find(p => p.id === id);
        if (!preset) return;
        cbSelectedArchetypes = preset.archetypes.map(a => ({ name: a.name, source: a.source }));
        cbSaveSelections();
        cbRenderChips();
        cbRenderDropdownList();
        cbRenderPresetBar();
        if (typeof showToast === 'function') showToast(t('binder.loaded').replace('{name}', preset.name), 'info');
    }

    function cbDeletePreset(id) {
        const preset = cbPresets.find(p => p.id === id);
        if (!preset) return;
        if (!confirm(t('binder.deleteConfirm').replace('{name}', preset.name))) return;
        cbPresets = cbPresets.filter(p => p.id !== id);
        cbSavePresets();
        cbRenderPresetBar();
        if (typeof showToast === 'function') showToast(t('binder.deleted').replace('{name}', preset.name), 'info');
    }

    function cbRenderPresetBar() {
        const bar = document.getElementById('cbPresetBar');
        if (!bar) return;
        if (cbPresets.length === 0) {
            bar.innerHTML = '';
            bar.classList.add('d-none');
            return;
        }
        bar.classList.remove('d-none');
        bar.innerHTML = cbPresets.map(p => {
            const safeName = escapeHtml(p.name);
            const safeId = escapeHtml(p.id);
            return `<span class="cb-preset-chip">
                <button type="button" class="cb-preset-load" onclick="cbLoadPreset('${safeId}')" title="${cbText('cb.load','Load')}: ${safeName}">${safeName} <small class="opacity-60">(${p.archetypes.length})</small></button>
                <button type="button" class="cb-preset-delete" onclick="cbDeletePreset('${safeId}')" title="${cbText('cb.delete','Delete')}">&times;</button>
            </span>`;
        }).join('');
    }

    // ── Load all available archetypes from all data sources ──
    async function cbEnsureArchetypeList() {
        if (cbArchetypesLoaded && cbAllArchetypes.length > 0) return;

        const shared = mb();
        if (shared.ensureMetaDataLoaded) await shared.ensureMetaDataLoaded();

        const seen = new Set();
        const result = [];

        function addFromRows(rows, source, label) {
            if (!Array.isArray(rows)) return;
            rows.forEach(row => {
                const name = String(row.archetype || row.deck_name || '').trim();
                if (!name) return;
                const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
                if (seen.has(key)) return;
                seen.add(key);
                result.push({ name, source, label });
            });
        }

        // Current meta
        const currentMeta = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        addFromRows(currentMeta, 'current-meta', 'Current Meta');

        // City league current
        const cityCurrent = Array.isArray(window.cityLeagueAnalysisDataCurrent)
            ? window.cityLeagueAnalysisDataCurrent
            : (Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData : []);
        addFromRows(cityCurrent, 'city-current', 'City League');

        // City league past
        const cityPast = Array.isArray(window.cityLeagueAnalysisDataPast)
            ? window.cityLeagueAnalysisDataPast
            : (Array.isArray(window.cityLeagueAnalysisM3Data) ? window.cityLeagueAnalysisM3Data : []);
        addFromRows(cityPast, 'city-past', 'City League Past');

        // Also load comparison CSV for better archetype names
        try {
            const [cmpCurrent, cmpCity, cmpCityPast] = await Promise.all([
                (typeof loadCSV === 'function' ? loadCSV('limitless_online_decks_comparison.csv').catch(() => []) : []),
                (typeof loadCSV === 'function' ? loadCSV('city_league_archetypes_comparison.csv').catch(() => []) : []),
                (typeof loadCSV === 'function' ? loadCSV('city_league_archetypes_past_comparison.csv').catch(() => []) : [])
            ]);
            addFromRows(cmpCurrent, 'current-meta', 'Current Meta');
            addFromRows(cmpCity, 'city-current', 'City League');
            addFromRows(cmpCityPast, 'city-past', 'City League Past');
        } catch (_) { /* ignore */ }

        // Sort: Current Meta first, then City League, then alphabetically
        const sourceOrder = { 'current-meta': 0, 'city-current': 1, 'city-past': 2 };
        result.sort((a, b) => {
            const so = (sourceOrder[a.source] || 0) - (sourceOrder[b.source] || 0);
            if (so !== 0) return so;
            return a.name.localeCompare(b.name);
        });

        cbAllArchetypes = result;
        cbArchetypesLoaded = true;
    }

    // ── UI: Archetype Picker ──
    function cbRenderChips() {
        const el = document.getElementById('cbSelectedChips');
        if (!el) return;

        if (cbSelectedArchetypes.length === 0) {
            el.innerHTML = '<span class="color-grey fs-85">No archetypes selected.</span>';
        } else {
            el.innerHTML = cbSelectedArchetypes.map((a, i) => {
                const safeName = escapeHtml(a.name);
                const sourceTag = a.source === 'current-meta' ? 'Meta' : (a.source === 'city-current' ? 'City' : 'Past');
                const sourceCls = a.source === 'current-meta' ? 'cb-src-meta'
                                : (a.source === 'city-current' ? 'cb-src-city' : 'cb-src-past');
                const icon = (typeof window.ArchetypeIcons !== 'undefined')
                    ? window.ArchetypeIcons.getIconHtml(a.name, { size: 'sm', layout: 'inline' })
                    : '';
                return `<span class="custom-binder-chip ${sourceCls}" title="${escapeHtml(a.source)}">
                    ${icon}${safeName} <small class="cb-src-tag">${sourceTag}</small>
                    <button type="button" class="custom-binder-chip-remove" onclick="cbRemoveArchetype(${i})" aria-label="Remove">&times;</button>
                </span>`;
            }).join('');
        }

        // Update generate button state
        const btn = document.getElementById('cbGenerateBtn');
        if (btn) btn.disabled = cbSelectedArchetypes.length === 0;
    }

    function cbAddArchetype(name, source) {
        const shared = mb();
        const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
        const exists = cbSelectedArchetypes.some(a => {
            const aKey = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
            return aKey === key;
        });
        if (exists) return;

        if (cbSelectedArchetypes.length >= 30) {
            if (typeof showToast === 'function') showToast(cbText('cb.maxArchetypes', 'Maximum 30 archetypes.'), 'warning');
            return;
        }

        cbSelectedArchetypes.push({ name, source });
        cbSaveSelections();
        cbRenderChips();
        cbRenderDropdownList();
    }

    function cbToggleArchetype(name, source) {
        const shared = mb();
        const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
        const idx = cbSelectedArchetypes.findIndex(a => {
            const aKey = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
            return aKey === key;
        });
        if (idx >= 0) {
            cbSelectedArchetypes.splice(idx, 1);
        } else {
            if (cbSelectedArchetypes.length >= 30) {
                if (typeof showToast === 'function') showToast(cbText('cb.maxArchetypes', 'Maximum 30 archetypes.'), 'warning');
                return;
            }
            cbSelectedArchetypes.push({ name, source });
        }
        cbSaveSelections();
        cbRenderChips();
        // Re-render dropdown without closing it
        _cbSkipNextClose = true;
        cbRenderDropdownList();
    }

    function cbRemoveArchetype(index) {
        cbSelectedArchetypes.splice(index, 1);
        cbSaveSelections();
        cbRenderChips();
        cbRenderDropdownList();
    }

    function cbToggleArchetypeDropdown() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd) return;

        if (dd.classList.contains('d-none')) {
            cbOpenDropdown();
        } else {
            dd.classList.add('d-none');
        }
    }

    async function cbOpenDropdown() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd) return;

        dd.classList.remove('d-none');
        dd.innerHTML = `<div class="custom-binder-dropdown-loading">${cbText('cb.loadingArchetypes','Loading archetypes…')}</div>`;

        await cbEnsureArchetypeList();
        await cbEnsureTierGroups();
        cbRenderDropdownList();
    }

    async function cbEnsureTierGroups() {
        // If Meta Binder already built the groups, use those
        if (Array.isArray(window._metaBinderArchetypeGroups) && window._metaBinderArchetypeGroups.length > 0) {
            _cbTierGroups = window._metaBinderArchetypeGroups;
            return;
        }
        // Already loaded our own fallback
        if (_cbTierGroups && _cbTierGroups.length > 0) return;

        const shared = mb();
        const groups = [];
        try {
            // Use same ranking functions as Meta Binder
            if (shared.getTopCurrentMetaArchetypes) {
                const top20 = await shared.getTopCurrentMetaArchetypes(20);
                if (top20.length) groups.push({ title: 'Top 20 Current Meta', source: 'current-meta', items: top20.map(n => ({ name: n, source: 'current-meta' })) });
            }

            const cityCurrentRows = Array.isArray(window.cityLeagueAnalysisDataCurrent)
                ? window.cityLeagueAnalysisDataCurrent
                : (Array.isArray(window.cityLeagueAnalysisData) ? window.cityLeagueAnalysisData : []);
            const cityPastRows = Array.isArray(window.cityLeagueAnalysisDataPast)
                ? window.cityLeagueAnalysisDataPast
                : (Array.isArray(window.cityLeagueAnalysisM3Data) ? window.cityLeagueAnalysisM3Data : []);

            if (shared.getTopCityArchetypes) {
                const topCity = await shared.getTopCityArchetypes('city_league_archetypes_comparison.csv', cityCurrentRows, 10);
                if (topCity.length) groups.push({ title: 'Top 10 City League', source: 'city-current', items: topCity.map(n => ({ name: n, source: 'city-current' })) });

                const topCityPast = await shared.getTopCityArchetypes('city_league_archetypes_past_comparison.csv', cityPastRows, 10);
                if (topCityPast.length) groups.push({ title: 'Top 10 City League Past', source: 'city-past', items: topCityPast.map(n => ({ name: n, source: 'city-past' })) });
            }
        } catch (e) {
            console.warn('[CustomBinder] tier groups fallback error:', e);
        }
        _cbTierGroups = groups.length > 0 ? groups : null;
    }

    // ── Helper: extract main pokemon key from archetype name ──
    function cbGetMainPokemon(name) {
        const raw = String(name || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw.startsWith('mega ')) return raw.split(' ').slice(0, 2).join(' ');
        if (raw.startsWith('alolan ') || raw.startsWith('galarian ') || raw.startsWith('hisuian ')) return raw.split(' ').slice(0, 2).join(' ');
        // Group every "<Trainer>'s X" under its owner token via the shared
        // helper (N's, Rocket's, Hop's, Cynthia's, \u2026). Was a hardcoded
        // rocket's/n's/ethan's list that missed every other trainer.
        const owner = (typeof window !== 'undefined' && window.stripTrainerOwnerPrefix)
            ? window.stripTrainerOwnerPrefix(raw).owner : '';
        if (owner) return owner;
        return raw.split(' ')[0];
    }

    function cbTitleCase(s) {
        return String(s || '').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    function cbRenderDropdownList() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd || dd.classList.contains('d-none')) return;

        const searchEl = document.getElementById('cbArchetypeSearch');
        const query = String(searchEl ? searchEl.value : '').trim().toLowerCase();
        const shared = mb();

        // Build set of already-selected keys
        const selectedKeys = new Set(cbSelectedArchetypes.map(a =>
            (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source
        ));

        // Get ranking map for sorting
        const exactMap = window._metaBinderCurrentMetaExactMap instanceof Map
            ? window._metaBinderCurrentMetaExactMap : null;

        // Helper: get rank for an archetype name
        const getRank = (name) => {
            if (!exactMap) return 9999;
            const entry = exactMap.get(String(name).trim().toLowerCase());
            return (entry && Number.isFinite(entry.rank)) ? entry.rank : 9999;
        };
        const getShare = (name) => {
            if (!exactMap) return 0;
            const entry = exactMap.get(String(name).trim().toLowerCase());
            return (entry && Number.isFinite(entry.share)) ? entry.share : 0;
        };

        let items = cbAllArchetypes;
        if (query) {
            items = items.filter(a => a.name.toLowerCase().includes(query));
        }

        if (items.length === 0) {
            dd.innerHTML = `<div class="custom-binder-dropdown-empty">${cbText('cb.noArchetypesFound','No archetypes found.')}</div>`;
            return;
        }

        let html = '';

        // ── Top 5 Main Pokemon quick-select (only when not searching) ──
        if (!query) {
            // Build main pokemon groups from current-meta items
            const currentMetaItems = items.filter(a => a.source === 'current-meta');
            const mainGroupMap = new Map();
            currentMetaItems.forEach(a => {
                const mainKey = cbGetMainPokemon(a.name);
                if (!mainKey) return;
                if (!mainGroupMap.has(mainKey)) {
                    mainGroupMap.set(mainKey, { key: mainKey, label: cbTitleCase(mainKey), variants: [], totalShare: 0 });
                }
                const g = mainGroupMap.get(mainKey);
                g.variants.push(a);
                g.totalShare += getShare(a.name);
            });

            const topMainGroups = Array.from(mainGroupMap.values())
                .filter(g => g.variants.length > 0)
                .sort((a, b) => b.totalShare - a.totalShare)
                .slice(0, 5);

            if (topMainGroups.length > 0) {
                html += `<div class="custom-binder-dropdown-group-label" style="color:var(--accent,#3b4cca);font-weight:900;">${cbText('cb.topMainPokemon','🏆 Top Main Pokémon')}</div>`;
                html += '<div class="cb-main-pokemon-grid">';
                topMainGroups.forEach((g, idx) => {
                    // Check if all variants are already selected
                    const allSelected = g.variants.every(a => {
                        const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
                        return selectedKeys.has(key);
                    });
                    const shareText = g.totalShare > 0 ? g.totalShare.toFixed(1) + '%' : '';
                    const variantCount = g.variants.length;
                    const variantNames = g.variants.map(v => v.name.replace(/'/g, "\\'")).join('|||');
                    // Top-5 button shows the main Pokémon's icon (uses first
                    // variant's name since the group label might itself be
                    // the raw Pokémon slug — getIconHtml falls back to []
                    // either way if no match is found).
                    const icon = (typeof window.ArchetypeIcons !== 'undefined')
                        ? (window.ArchetypeIcons.getIconHtml(g.label, { size: 'md' })
                           || window.ArchetypeIcons.getIconHtml(g.variants[0] && g.variants[0].name, { size: 'md' }))
                        : '';
                    html += `<button type="button" class="cb-main-pokemon-btn ${allSelected ? 'is-selected' : ''}"
                        onclick="cbToggleMainPokemonGroup('${variantNames}','current-meta')" title="${g.variants.map(v => v.name).join(', ')}">
                        <span class="cb-mpg-rank">#${idx + 1}</span>
                        ${icon}
                        <span class="cb-mpg-name">${escapeHtml(g.label)}</span>
                        <span class="cb-mpg-meta">${variantCount} ${variantCount === 1 ? 'Deck' : 'Decks'}${shareText ? ' · ' + shareText : ''}</span>
                    </button>`;
                });
                html += '</div>';
                html += '<div style="border-top:2px solid var(--border-color,#ddd);margin:6px 0;"></div>';
            }
        }

        // ── All decks sorted by Current Meta ranking ──
        // Group by source, sort each group by rank
        const groups = {};
        items.forEach(a => {
            if (!groups[a.label]) groups[a.label] = [];
            groups[a.label].push(a);
        });

        // Preferred source order: Current Meta first, then City League, then Past
        const sourceOrder = ['Current Meta', 'City League', 'City League Past'];
        const sortedLabels = Object.keys(groups).sort((a, b) => {
            const ia = sourceOrder.indexOf(a);
            const ib = sourceOrder.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        for (const label of sortedLabels) {
            const archetypes = groups[label];
            // Sort by meta rank (ascending), unranked last, then alphabetically
            archetypes.sort((a, b) => {
                const ra = getRank(a.name);
                const rb = getRank(b.name);
                if (ra !== rb) return ra - rb;
                return a.name.localeCompare(b.name);
            });

            html += `<div class="custom-binder-dropdown-group-label">${escapeHtml(label)}</div>`;
            archetypes.slice(0, 60).forEach((a, idx) => {
                const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
                const isSelected = selectedKeys.has(key);
                const safeName = escapeHtml(a.name);
                const rank = getRank(a.name);
                const share = getShare(a.name);
                const rankBadge = rank < 9999 ? `<span class="cb-dd-rank">#${rank}</span>` : '';
                const shareText = share > 0 ? `<small class="opacity-60">${share.toFixed(1)}%</small>` : '';
                const icon = (typeof window.ArchetypeIcons !== 'undefined')
                    ? window.ArchetypeIcons.getIconHtml(a.name, { size: 'sm', layout: 'inline' })
                    : '';
                html += `<button type="button" class="custom-binder-dropdown-item ${isSelected ? 'is-selected' : ''}"
                    onclick="cbToggleArchetype('${a.name.replace(/'/g, "\\'")}','${escapeHtml(a.source)}')">
                    <span class="cb-dd-check">${isSelected ? '✓' : ''}</span>${rankBadge}${icon} ${safeName} ${shareText}
                </button>`;
            });
        }

        dd.innerHTML = html;
    }

    // ── Toggle all variants of a main pokemon group ──
    function cbToggleMainPokemonGroup(variantNamesStr, source) {
        const names = variantNamesStr.split('|||');
        const shared = mb();
        // Check if all are already selected → deselect all, else select all
        const allSelected = names.every(name => {
            const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
            return cbSelectedArchetypes.some(a =>
                ((shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source) === key
            );
        });

        if (allSelected) {
            // Remove all variants
            names.forEach(name => {
                const normKey = shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase();
                cbSelectedArchetypes = cbSelectedArchetypes.filter(a =>
                    !((shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) === normKey && a.source === source)
                );
            });
        } else {
            // Add missing variants (respect 30-deck limit)
            names.forEach(name => {
                const normKey = shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase();
                const already = cbSelectedArchetypes.some(a =>
                    (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) === normKey && a.source === source
                );
                if (!already) {
                    if (cbSelectedArchetypes.length >= 30) return;
                    cbSelectedArchetypes.push({ name, source });
                }
            });
        }

        cbSaveSelections();
        cbRenderChips();
        _cbSkipNextClose = true;
        cbRenderDropdownList();
    }
    window.cbToggleMainPokemonGroup = cbToggleMainPokemonGroup;

    function cbFilterArchetypeList() {
        if (!cbArchetypesLoaded) {
            cbOpenDropdown();
            return;
        }
        const dd = document.getElementById('cbArchetypeDropdown');
        if (dd && dd.classList.contains('d-none')) {
            dd.classList.remove('d-none');
        }
        cbRenderDropdownList();
    }

    // ── Close dropdown when clicking outside ──
    document.addEventListener('click', function (e) {
        if (_cbSkipNextClose) { _cbSkipNextClose = false; return; }
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd || dd.classList.contains('d-none')) return;
        const picker = e.target.closest('.custom-binder-picker');
        if (!picker) dd.classList.add('d-none');
    });

    // ── Build Custom Binder ──
    async function buildCustomBinder() {
        if (cbSelectedArchetypes.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.selectAtLeastOne','Please select at least one archetype.'), 'warning');
            return;
        }

        const shared = mb();
        const grid = document.getElementById('cbGrid');
        if (grid) grid.innerHTML = `<p class="color-grey">${cbText('mb.loading', 'Loading meta data…')}</p>`;

        await shared.ensureMetaDataLoaded();

        // Build source targets from user selection
        const sourceTargets = cbSelectedArchetypes.map(a => ({ name: a.name, source: a.source }));

        // Load format label
        const currentMetaRows = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        window._metaBinderCurrentMetaLabel = shared.getCurrentMetaFormatLabelFromRows(currentMetaRows);

        // Gather archetype groups for display
        const metricMaps = await shared.loadMetaBinderArchetypeMetricMaps();
        const groupDefs = buildCbGroupDefs();
        window._cbArchetypeGroups = shared.buildMetaBinderArchetypeGroups(groupDefs, metricMaps);

        // Collect cards (same logic as Meta Binder, user-chosen threshold;
        // ACE SPECs always bypass the threshold — floor, never cap)
        const binderMap = shared.collectBinderCards(sourceTargets, { thresholdPercent: cbThreshold });

        if (binderMap.size === 0) {
            if (typeof showToast === 'function') showToast(cbText('mb.noCards', 'No card data found for the selected archetypes.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        // Compute delta with own cache key
        const delta = await cbComputeDelta(binderMap, shared);
        window._cbDelta = delta;

        if (cbMode === 'print') await cbLoadPrintedSet();
        cbRenderBinder(delta, shared);
        if (typeof showToast === 'function') showToast(cbText('cb.generated','Custom Binder generated!'), 'success');
    }

    function buildCbGroupDefs() {
        const groups = { 'current-meta': [], 'city-current': [], 'city-past': [] };
        cbSelectedArchetypes.forEach(a => {
            if (groups[a.source]) groups[a.source].push(a.name);
        });

        const defs = [];
        if (groups['current-meta'].length > 0) defs.push({ title: 'Current Meta (Custom)', source: 'current-meta', names: groups['current-meta'] });
        if (groups['city-current'].length > 0) defs.push({ title: 'City League (Custom)', source: 'city-current', names: groups['city-current'] });
        if (groups['city-past'].length > 0) defs.push({ title: 'City League Past (Custom)', source: 'city-past', names: groups['city-past'] });
        return defs;
    }

    // ── Delta with the Custom Binder's OWN baseline ──
    // The old version swapped the 'metaBinderCacheV1' localStorage key
    // around shared.computeDelta — but that key was never read by anything,
    // while computeDelta read AND wrote the Meta Binder's Firestore snapshot.
    // Result: every Custom Binder generation destroyed the Meta Binder's
    // "what's new" baseline (and vice versa). computeDelta is now pure;
    // the CB keeps its baseline (ids + card objects for the dropped-diff)
    // in localStorage, per device.
    async function cbComputeDelta(binderMap, shared) {
        let previous = { ids: new Set(), cards: [], date: null, hasProfile: false };
        try {
            const cachedV2 = JSON.parse(localStorage.getItem(CB_CACHE_KEY_V2) || 'null');
            // A baseline generated at a DIFFERENT threshold is not comparable:
            // diffing a 70%-binder against an all-cards binder flags hundreds
            // of cards as "new"/"no longer in the meta" that never changed.
            const thresholdMatches = cachedV2
                && (cachedV2.threshold === undefined || cachedV2.threshold === cbThreshold);
            if (cachedV2 && Array.isArray(cachedV2.ids) && thresholdMatches) {
                previous = {
                    ids: new Set(cachedV2.ids),
                    cards: Array.isArray(cachedV2.cards) ? cachedV2.cards : [],
                    date: cachedV2.date || null,
                    hasProfile: true
                };
            } else if (cachedV2 && Array.isArray(cachedV2.ids)) {
                // Threshold changed → no comparison this run; the save below
                // records the new threshold so the NEXT run compares cleanly.
            } else {
                // Legacy v1 cache: ids only (no card objects — dropped
                // entries from it show the raw id until the next save).
                const cachedV1 = JSON.parse(localStorage.getItem(CB_CACHE_KEY) || '[]');
                if (Array.isArray(cachedV1) && cachedV1.length > 0) {
                    previous = { ids: new Set(cachedV1), cards: [], date: null, hasProfile: true };
                }
            }
        } catch (_) { /* ignore */ }

        // Baseline stays stable within the session (repeated Generate
        // clicks diff against the same reference, not against themselves).
        if (_cbSessionBaseline) previous = _cbSessionBaseline;
        else _cbSessionBaseline = previous;

        const delta = await shared.computeDelta(binderMap, { previous });

        try {
            localStorage.setItem(CB_CACHE_KEY_V2, JSON.stringify({
                ids: Array.from(binderMap.keys()),
                // familyRefs included so "Aus Binder laden" (proxy tab)
                // answers "is it printed?" family-wide, same as the grid.
                cards: delta.cards.map(c => ({
                    cardId: c.cardId, name: c.name, set: c.set,
                    number: c.number, maxCount: c.maxCount,
                    familyRefs: Array.isArray(c.familyRefs) ? c.familyRefs : []
                })),
                threshold: cbThreshold,
                date: new Date().toISOString()
            }));
            localStorage.removeItem(CB_CACHE_KEY);
        } catch (_) { /* storage full/blocked — next diff just reuses the old baseline */ }

        return delta;
    }

    // ── Render (mirrors meta-binder renderMetaBinder but targets CB DOM) ──
    function cbRenderBinder(delta, shared) {
        const grid = document.getElementById('cbGrid');
        const statsEl = document.getElementById('cbStats');
        const deltaEl = document.getElementById('cbDelta');
        const filtersEl = document.getElementById('cbFilters');
        if (!grid) return;

        const { cards, droppedCards } = delta;
        window._cbDroppedCards = droppedCards;
        const totalUnique = cards.length;
        const totalCopies = cards.reduce((s, c) => s + c.maxCount, 0);
        const missingUnique = cards.filter(c => c.missing > 0).length;
        const missingCopies = cards.reduce((s, c) => s + c.missing, 0);
        const ownedComplete = cards.filter(c => c.missing === 0).length;
        const newCount = cards.filter(c => c.isNew).length;

        // Stats (mode-dependent: ownership vs print status)
        if (statsEl) {
            statsEl.classList.remove('d-none');
            if (cbMode === 'print') {
                cbRenderPrintStats();
            } else {
                statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalUnique}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${ownedComplete}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.complete', 'Complete')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${missingUnique} / ${missingCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.missing', 'Missing (Cards / Copies)')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value" style="color:#3B4CCA">${newCount}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.newThisWeek', 'New This Week')}</span>
                </div>`;
            }
        }

        // Archetype groups
        if (deltaEl) {
            const groups = Array.isArray(window._cbArchetypeGroups) ? window._cbArchetypeGroups : [];
            if (groups.length > 0) {
                const html = groups.map(group => {
                    const cardsHtml = group.items.map(item => {
                        const safeName = escapeHtml(item.name || 'Unknown');
                        const safeImage = escapeHtml(item.imageUrl || '');
                        const escapedJsName = shared.escapeArchetypeForJs(item.name || '');
                        const navFn = item.source === 'current-meta' ? 'navigateToCurrentMetaWithDeck' : 'navigateToAnalysisWithDeck';
                        const currentMetaLabel = escapeHtml(item.currentMetaFormatLabel || (typeof window.getCurrentMetaFormat === 'function' && window.getCurrentMetaFormat()) || 'TEF-POR');
                        const rankText = shared.formatMetaBinderMetric(item.currentMetaRank, 1);
                        const shareText = Number.isFinite(item.currentMetaShare) ? `${item.currentMetaShare.toFixed(1)}%` : '—';
                        const cityCurrentText = shared.formatMetaBinderMetric(item.cityCurrentAvgRank, 1);
                        const cityPastText = shared.formatMetaBinderMetric(item.cityPastAvgRank, 1);
                        return `
                            <div class="deck-banner-card" onclick="${navFn}('${escapedJsName}')">
                                ${item.imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${safeImage}')"></div>` : ''}
                                <div class="deck-banner-content">
                                    <div class="deck-banner-name">${safeName}</div>
                                    <div class="deck-banner-stats" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">
                                        <span class="stat-badge rank-performance-hint" style="background:#fff3e0;color:#e65100;">${currentMetaLabel}: ${rankText}</span>
                                        <span class="stat-badge">${currentMetaLabel}: ${shareText}</span>
                                        <span class="stat-badge">City current: ${cityCurrentText}</span>
                                        <span class="stat-badge">City past: ${cityPastText}</span>
                                    </div>
                                </div>
                            </div>`;
                    }).join('');

                    return `
                        <div class="meta-binder-archetype-group">
                            <details class="meta-binder-archetype-panel" open>
                                <summary class="meta-binder-archetype-summary">
                                    <h3 class="meta-binder-archetype-title">${escapeHtml(group.title)}</h3>
                                    <span class="meta-binder-archetype-count">${group.items.length}</span>
                                </summary>
                                <div class="meta-binder-archetype-grid">${cardsHtml}</div>
                            </details>
                        </div>`;
                }).join('');
                deltaEl.classList.remove('d-none');
                deltaEl.innerHTML = `<div class="meta-binder-archetype-groups">${html}</div>`;
            } else {
                deltaEl.classList.add('d-none');
                deltaEl.innerHTML = '';
            }
        }

        // Filters — the chip row is the mode's main navigation. In print
        // mode the chips ARE the binder comparison (to print / printed /
        // no longer in the meta) — no extra modal flow needed.
        const droppedCount = Array.isArray(droppedCards) ? droppedCards.length : 0;
        const printedCount = cards.filter(c => cbIsPrinted(c)).length;
        const toPrintCount = totalUnique - printedCount;
        const chipRow = cbMode === 'print'
            ? `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="cbSetFilter('all')">${cbText('cb.filterAll','All')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="toprint" onclick="cbSetFilter('toprint')">${cbText('cb.filterToPrint','To print')} (${toPrintCount})</button>
                    <button class="meta-binder-filter-btn" data-filter="printed" onclick="cbSetFilter('printed')">${cbText('cb.filterPrinted','Printed')} ✓ (${printedCount})</button>
                    <button class="meta-binder-filter-btn" data-filter="dropped" onclick="cbOpenDroppedModal()">${cbText('cb.filterDropped','No longer in the meta')} (${droppedCount})</button>
                </div>`
            : `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="cbSetFilter('all')">${cbText('cb.filterAll','All')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="owned" onclick="cbSetFilter('owned')">${cbText('cb.filterOwned','In Collection')} (${ownedComplete})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="cbSetFilter('missing')">${cbText('cb.filterMissing','Missing')} (${missingUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="new" onclick="cbSetFilter('new')">🆕 ${cbText('cb.filterNew','New')} (${newCount})</button>
                </div>`;
        if (filtersEl) {
            filtersEl.classList.remove('d-none');
            filtersEl.innerHTML = `${chipRow}
                <div class="filter-group">
                    <select id="cbFilterType" onchange="cbApplyFilter()" class="select-system">
                        <option value="all">${cbText('cb.filterAllTypes','All Types')}</option>
                        <option value="Pokemon-Grass">${cbText('profile.filterPokemonGrass','Pokémon: Grass')}</option>
                        <option value="Pokemon-Fire">${cbText('profile.filterPokemonFire','Pokémon: Fire')}</option>
                        <option value="Pokemon-Water">${cbText('profile.filterPokemonWater','Pokémon: Water')}</option>
                        <option value="Pokemon-Lightning">${cbText('profile.filterPokemonLightning','Pokémon: Lightning')}</option>
                        <option value="Pokemon-Psychic">${cbText('profile.filterPokemonPsychic','Pokémon: Psychic')}</option>
                        <option value="Pokemon-Fighting">${cbText('profile.filterPokemonFighting','Pokémon: Fighting')}</option>
                        <option value="Pokemon-Darkness">${cbText('profile.filterPokemonDarkness','Pokémon: Darkness')}</option>
                        <option value="Pokemon-Metal">${cbText('profile.filterPokemonMetal','Pokémon: Metal')}</option>
                        <option value="Pokemon-Dragon">${cbText('profile.filterPokemonDragon','Pokémon: Dragon')}</option>
                        <option value="Pokemon-Colorless">${cbText('profile.filterPokemonColorless','Pokémon: Colorless')}</option>
                        <option value="Supporter">${cbText('profile.filterSupporter','Supporter')}</option>
                        <option value="Item">${cbText('profile.filterItem','Item')}</option>
                        <option value="Tool">${cbText('profile.filterTool','Tool')}</option>
                        <option value="Stadium">Stadium</option>
                        <option value="Special Energy">${cbText('profile.filterSpecialEnergy','Special Energy')}</option>
                        <option value="Basic Energy">${cbText('profile.filterBasicEnergy','Basic Energy')}</option>
                        <option value="ACE SPEC">ACE SPEC</option>
                    </select>
                    <select id="cbFilterSet" onchange="cbApplyFilter()" class="select-system">
                        <option value="all">${cbText('cb.filterAllSets','All Sets')}</option>
                    </select>
                </div>
                <div class="filter-group">
                    <button id="cbBtnStandardPrint" class="meta-binder-filter-btn active" onclick="cbSetPrintView(false)">${cbText('mb.standardPrint','Standard Print')}</button>
                    <button id="cbBtnAllPrints" class="meta-binder-filter-btn" onclick="cbSetPrintView(true)">${cbText('mb.allPrints','All Prints')}</button>
                </div>`;

            // Populate set filter
            cbUpdateSetFilter(cards);
        }

        // Enable action buttons
        const wishlistBtn = document.getElementById('cbAddWishlist');
        const proxyBtn = document.getElementById('cbSendProxy');
        if (wishlistBtn) wishlistBtn.disabled = missingCopies === 0;
        if (proxyBtn) proxyBtn.disabled = missingCopies === 0;
        const unprintedBtn = document.getElementById('cbSendUnprinted');
        const bulkBtn = document.getElementById('cbBulkMarkPrinted');
        if (unprintedBtn) unprintedBtn.disabled = false;
        if (bulkBtn) bulkBtn.disabled = false;
        cbUpdateActionButtons();

        cbFilter = 'all';
        cbRenderGrid(delta, shared);
    }

    // Print-mode stats: printed vs to-print, copies included.
    function cbRenderPrintStats() {
        if (cbMode !== 'print') return;
        const statsEl = document.getElementById('cbStats');
        const delta = window._cbDelta;
        if (!statsEl || !delta || !Array.isArray(delta.cards)) return;
        const cards = delta.cards;
        const printed = cards.filter(c => cbIsPrinted(c));
        const printedCopies = printed.reduce((s, c) => s + (c.maxCount || 0), 0);
        const totalCopies = cards.reduce((s, c) => s + (c.maxCount || 0), 0);
        statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${cards.length}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${printed.length}</span>
                    <span class="meta-binder-stat-label">${cbText('cb.statPrinted', 'Printed')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${cards.length - printed.length} / ${totalCopies - printedCopies}</span>
                    <span class="meta-binder-stat-label">${cbText('cb.statToPrint', 'To print (Cards / Copies)')}</span>
                </div>`;
    }

    function cbUpdateSetFilter(cards) {
        const setSelect = document.getElementById('cbFilterSet');
        if (!setSelect) return;

        const setOrderMap = window.setOrderMap || {};
        const setCodes = [...new Set(cards.map(c => String(c.set || '').trim()).filter(Boolean))]
            .sort((a, b) => {
                const orderA = setOrderMap[a] || setOrderMap[a.toLowerCase()] || 0;
                const orderB = setOrderMap[b] || setOrderMap[b.toLowerCase()] || 0;
                if (orderA !== orderB) return orderB - orderA;
                return a.localeCompare(b);
            });

        setSelect.innerHTML = [
            `<option value="all">${cbText('cb.filterAllSets','All Sets')}</option>`,
            ...setCodes.map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`)
        ].join('');
    }

    function cbSetFilter(filter) {
        cbFilter = filter;
        const filtersEl = document.getElementById('cbFilters');
        if (filtersEl) {
            filtersEl.querySelectorAll('.meta-binder-filter-btn').forEach(btn => {
                // Buttons without data-filter (Standard Print / All Prints)
                // carry independent state — never strip their highlight.
                if (!btn.dataset.filter) return;
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
        }
        cbApplyFilter();
    }

    function cbSetPrintView(showAll) {
        cbAllPrints = showAll;
        const btnStd = document.getElementById('cbBtnStandardPrint');
        const btnAll = document.getElementById('cbBtnAllPrints');
        if (btnStd) btnStd.classList.toggle('active', !showAll);
        if (btnAll) btnAll.classList.toggle('active', showAll);
        cbApplyFilter();
    }

    function cbApplyFilter() {
        const delta = window._cbDelta;
        if (!delta) return;
        cbRenderGrid(delta, mb());
    }

    // The filtered list BEFORE the All-Prints expansion — bulk actions
    // must run on this (the expansion invents per-print ids that don't
    // exist as binder entries).
    function cbComputeFilteredCards() {
        const delta = window._cbDelta;
        const shared = mb();
        if (!delta || !Array.isArray(delta.cards)) return [];
        const cards = delta.cards;
        const typeFilterEl = document.getElementById('cbFilterType');
        const setFilterEl = document.getElementById('cbFilterSet');
        const typeFilter = typeFilterEl ? String(typeFilterEl.value || 'all') : 'all';
        const setFilter = setFilterEl ? String(setFilterEl.value || 'all').toLowerCase() : 'all';

        let filtered;
        if (cbFilter === 'new') {
            filtered = cards.filter(c => c.isNew);
        } else if (cbFilter === 'missing') {
            filtered = cards.filter(c => c.missing > 0);
        } else if (cbFilter === 'owned') {
            filtered = cards.filter(c => c.missing === 0);
        } else if (cbFilter === 'toprint') {
            filtered = cards.filter(c => !cbIsPrinted(c));
        } else if (cbFilter === 'printed') {
            filtered = cards.filter(c => cbIsPrinted(c));
        } else {
            filtered = cards;
        }

        return filtered.filter(card => {
            const meta = shared.getMetaBinderTypeMeta(card);
            const cardSet = String(card.set || '').toLowerCase();
            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;
            if (setFilter !== 'all' && cardSet !== setFilter) return false;
            // Print mode: basic energies are hidden by default — nobody
            // proxies them, and 8 energy tiles are pure noise in a print
            // list. Explicitly selecting the type filter still shows them.
            if (cbMode === 'print' && typeFilter === 'all' && meta.type === 'Basic Energy') return false;
            return true;
        });
    }

    function cbRenderGrid(delta, shared) {
        const grid = document.getElementById('cbGrid');
        if (!grid) return;

        let filtered = cbComputeFilteredCards();

        // All Prints expansion
        if (cbAllPrints) {
            const collectionCounts = window.userCollectionCounts || new Map();
            const expanded = [];
            filtered.forEach(card => {
                const refs = Array.isArray(card.familyRefs) ? card.familyRefs : [];
                if (refs.length <= 1) { expanded.push(card); return; }
                refs.forEach(ref => {
                    const parsed = shared.parseIntlPrintRef(ref);
                    if (!parsed.set || !parsed.number) return;
                    const printCardId = shared.buildCardId(card.name, parsed.set, parsed.number);
                    const ownedExact = collectionCounts.get(printCardId) || 0;
                    expanded.push({
                        ...card,
                        set: parsed.set, number: parsed.number,
                        cardId: printCardId, ownedExact, owned: ownedExact,
                        ownedIntlTotal: ownedExact,
                        missing: Math.max(0, card.maxCount - ownedExact),
                        ownershipMode: ownedExact >= card.maxCount ? 'exact' : 'missing',
                        familyRefs: refs, _isPrintExpansion: true
                    });
                });
            });
            filtered = expanded;
        }

        const sorted = cbAllPrints
            ? shared.sortMetaCardsAllPrints([...filtered])
            : shared.sortMetaCards([...filtered]);

        if (sorted.length === 0) {
            // "Everything printed" is success, not an error-looking empty state.
            grid.innerHTML = (cbMode === 'print' && cbFilter === 'toprint')
                ? `<p class="cb-all-printed">✓ ${cbText('cb.allPrinted', 'Everything printed — your binder is complete.')}</p>`
                : `<p class="color-grey">${cbText('mb.empty', 'No cards found for current filter.')}</p>`;
            return;
        }

        const isPrintMode = cbMode === 'print';
        const cardHtmlEntries = sorted.map(card => {
            const imageUrl = shared.findCardImage(card.name, card.set, card.number);
            // Print mode: the frame colour means PRINT status, never
            // ownership — one axis at a time, so green stays unambiguous.
            const isPrinted = isPrintMode && cbIsPrinted(card);
            const statusClass = isPrintMode
                ? (isPrinted ? 'meta-binder-card-printed' : 'meta-binder-card-toprint')
                : (card.ownershipMode === 'exact'
                    ? 'meta-binder-card-owned card-owned'
                    : (card.ownershipMode === 'intl-complete'
                        ? 'meta-binder-card-owned-intl card-owned'
                        : 'meta-binder-card-missing card-missing'));
            const newBadge = card.isNew ? `<span class="meta-binder-badge-new">NEW</span>` : '';
            const safeImage = escapeHtml(imageUrl);
            const safeName = escapeHtml(card.name);
            const deckList = card.decks.map(d => escapeHtml(d)).join(', ');
            const typeMeta = shared.getMetaBinderTypeMeta(card);
            const cardDb = shared.findCardRecord(card.name, card.set, card.number);
            const sortCategory = shared.getMetaBinderSortCategory(typeMeta);
            const dexNumber = sortCategory === 'Pokemon' ? shared.getMetaBinderPokemonDex(card, cardDb) : Number.MAX_SAFE_INTEGER;
            const setOrder = shared.getMetaBinderSetOrderValue(card.set);
            const numberSort = shared.parseCardNumberForSort(card.number);
            const countLabel = card.ownershipMode === 'exact'
                ? `<span class="meta-binder-count-ok">${card.ownedExact}/${card.maxCount} ✓</span>`
                : (card.ownershipMode === 'intl-complete'
                    ? `<span class="meta-binder-count-intl">${card.ownedIntlTotal}/${card.maxCount} ✓</span>`
                    : `<span class="meta-binder-count-missing">${card.ownedIntlTotal}/${card.maxCount}</span>`);

            const safeCardId = escapeHtml(card.cardId);
            const ownedCount = card.ownedExact || 0;
            const userWantsCard = window.userWishlist && window.userWishlist.has(card.cardId);
            const missingCount = Math.max(0, card.maxCount - ownedCount);

            // Print mode: no collection +/-/wishlist micro-badges (other
            // axis, and 21px targets), instead a full-width 44px toggle
            // bar under the image. Ownership only as a grey side note.
            const topActions = isPrintMode ? '' : `
                    <div class="pos-abs card-action-row-wide card-database-top-actions">
                        <button type="button" data-card-id="${safeCardId}" onclick="addCollectionFromCardDbButton(this)" class="btn-green card-badge" title="Add to collection (${ownedCount}/4)" aria-label="Add ${safeName} to collection">+</button>
                        <button type="button" data-card-id="${safeCardId}" onclick="removeCollectionFromCardDbButton(this)" class="btn-red card-badge" style="color: ${ownedCount > 0 ? '#fff' : '#999'}; background: ${ownedCount > 0 ? '#dc3545' : '#fff'};" title="Remove from collection (${ownedCount}/4)" aria-label="Remove ${safeName} from collection">-</button>
                        <button type="button" data-card-id="${safeCardId}" data-missing="${String(missingCount)}" onclick="toggleWishlistMetaBinder(this)" class="btn-wishlist card-badge" style="color: #fff; background: ${userWantsCard ? '#E91E63' : '#F48FB1'}; border: 2px solid ${userWantsCard ? '#E91E63' : '#F48FB1'};" title="${userWantsCard ? 'Remove from wishlist' : 'Add missing (' + missingCount + ') to wishlist'}" aria-label="${userWantsCard ? 'Remove' : 'Add'} ${safeName} wishlist">${userWantsCard ? '&#9829;' : '&#9825;'}</button>
                    </div>`;
            const infoBlock = isPrintMode ? `
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        <span class="cb-owned-line">${card.ownedIntlTotal || 0} ${cbText('cb.ownedLine', 'in collection')}</span>
                    </div>
                    <button type="button" class="cb-print-toggle ${isPrinted ? 'is-printed' : ''}" onclick="cbTogglePrintedBtn(this)" aria-pressed="${isPrinted ? 'true' : 'false'}" aria-label="${isPrinted ? cbText('cb.ariaUnmarkPrinted', 'Mark as not printed') : cbText('cb.ariaMarkPrinted', 'Mark as printed')}: ${safeName}">
                        ${isPrinted ? `${cbText('cb.printedBadge', 'Printed')} ✓` : cbText('cb.toPrintBadge', 'To print')}
                    </button>` : `
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>`;

            return { name: card.name, html: `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${escapeHtml(String(card.set || ''))}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" data-name="${safeName}" data-pokedex="${String(dexNumber)}" data-set-order="${String(setOrder)}" data-number-sort="${String(numberSort)}" data-card-id="${safeCardId}" data-family-refs="${escapeHtml((Array.isArray(card.familyRefs) ? card.familyRefs : []).join(','))}" data-max-count="${String(card.maxCount || 0)}" title="Decks: ${deckList}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}${topActions}${infoBlock}
                </div>` };
        });

        // In All Prints mode: group same-name cards into horizontal rows
        if (cbAllPrints) {
            const groups = [];
            let currentGroup = null;
            cardHtmlEntries.forEach(entry => {
                if (!currentGroup || currentGroup.name !== entry.name) {
                    currentGroup = { name: entry.name, cards: [] };
                    groups.push(currentGroup);
                }
                currentGroup.cards.push(entry.html);
            });
            grid.innerHTML = '<style>.cb-print-group{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin-bottom:16px;padding:10px;background:rgba(0,0,0,0.03);border-radius:10px;border:1px solid rgba(0,0,0,0.06)}.cb-print-group .meta-binder-card{margin:0}</style>'
                + groups.map(g => g.cards.length > 1
                    ? `<div class="cb-print-group">${g.cards.join('')}</div>`
                    : g.cards[0]
                ).join('');
        } else {
            grid.innerHTML = cardHtmlEntries.map(e => e.html).join('');
        }
        refreshCustomBinderOwnership();
    }

    // ── Print status: load / persist / query / toggle ──
    async function cbLoadPrintedSet() {
        const uid = window.auth?.currentUser?.uid ?? null;
        // The cached set belongs to ONE account. Sign-out/sign-in without a
        // reload must not leak user A's printed list into user B's doc.
        if (_cbPrintedSet && _cbPrintedOwner !== uid) {
            _cbPrintedSet = null;
            _cbPrintedLoadPromise = null;
            _cbPrintedRemoteOk = false;
        }
        if (_cbPrintedSet) return _cbPrintedSet;
        if (_cbPrintedLoadPromise) return _cbPrintedLoadPromise;
        _cbPrintedLoadPromise = (async () => {
            let entries = null;
            _cbPrintedRemoteOk = false;
            if (uid && window.db) {
                try {
                    const doc = await window.db.collection('users').doc(uid)
                        .collection('binders').doc('printedProxies').get();
                    // The read SUCCEEDED — remote is authoritative from here,
                    // whether or not the doc exists yet. Merging in the local
                    // mirror could resurrect un-marked cards from a stale
                    // mirror on another device.
                    _cbPrintedRemoteOk = true;
                    if (doc.exists) {
                        const data = doc.data() || {};
                        entries = Array.isArray(data.entries) ? data.entries : [];
                    } else {
                        entries = [];
                    }
                } catch (e) {
                    // Read FAILED: fall back to the mirror for display, but
                    // cbPersistPrintedSet refuses the Firestore write in this
                    // state — a full-doc set() based on a possibly-empty
                    // mirror would wipe the server's good data.
                    console.warn('[CustomBinder] printed-status load failed — read-only fallback to local mirror', e);
                }
            }
            if (entries === null) {
                try { entries = JSON.parse(localStorage.getItem(CB_PRINTED_LS_KEY) || '[]'); }
                catch (_) { entries = []; }
            }
            _cbPrintedSet = new Set((entries || [])
                .map(e => (typeof e === 'string' ? e : (e && e.cardId)))
                .filter(Boolean));
            _cbPrintedOwner = uid;
            return _cbPrintedSet;
        })().finally(() => { _cbPrintedLoadPromise = null; });
        return _cbPrintedLoadPromise;
    }

    function cbPersistPrintedSet() {
        const arr = Array.from(_cbPrintedSet || []);
        try { localStorage.setItem(CB_PRINTED_LS_KEY, JSON.stringify(arr)); } catch (_) { /* mirror only */ }
        const uid = window.auth?.currentUser?.uid ?? null;
        if (!uid || !window.db) return;
        if (uid !== _cbPrintedOwner) {
            // Account changed underneath us — never write one user's list
            // into another user's document.
            console.warn('[CustomBinder] printed-status save skipped: account changed');
            return;
        }
        if (!_cbPrintedRemoteOk) {
            // The remote read never succeeded this session: a full-doc set()
            // would overwrite good server data with the local fallback.
            if (typeof showToast === 'function') {
                showToast(cbText('cb.printedSyncOffline', 'Print status saved on this device only — cloud sync is currently unavailable.'), 'warning');
            }
            return;
        }
        _cbPrintedDirty = true;
        clearTimeout(_cbPrintedSaveTimer);
        _cbPrintedSaveTimer = setTimeout(() => cbFlushPrintedSet(uid), 800);
    }

    function cbFlushPrintedSet(uid) {
        if (!_cbPrintedDirty || !_cbPrintedSet) return;
        const targetUid = uid || (window.auth?.currentUser?.uid ?? null);
        if (!targetUid || !window.db || targetUid !== _cbPrintedOwner || !_cbPrintedRemoteOk) return;
        _cbPrintedDirty = false;
        clearTimeout(_cbPrintedSaveTimer);
        window.db.collection('users').doc(targetUid)
            .collection('binders').doc('printedProxies')
            .set({ entries: Array.from(_cbPrintedSet), updatedAt: new Date().toISOString() })
            .catch(e => {
                _cbPrintedDirty = true;
                console.warn('[CustomBinder] printed-status save failed (kept in local mirror)', e);
            });
    }

    // Flush the debounced write before the page goes away — marking the
    // last card and closing the tab inside the 800ms window must not
    // silently revert on the next load (the remote doc wins over the mirror).
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') cbFlushPrintedSet();
        });
        window.addEventListener('pagehide', () => cbFlushPrintedSet());
    }

    // Family-aware: a proxy printed as any print of the card counts —
    // it is the same piece of paper in the box.
    function cbPrintedIdsForCard(card) {
        const shared = mb();
        const ids = [String(card.cardId || '')];
        const refs = Array.isArray(card.familyRefs) ? card.familyRefs : [];
        refs.forEach(ref => {
            const p = typeof shared.parseIntlPrintRef === 'function' ? shared.parseIntlPrintRef(ref) : null;
            if (p && p.set && p.number && typeof shared.buildCardId === 'function') {
                ids.push(shared.buildCardId(card.name, p.set, p.number));
            }
        });
        return ids.filter(Boolean);
    }

    function cbIsPrinted(card) {
        if (!_cbPrintedSet) return false;
        return cbPrintedIdsForCard(card).some(id => _cbPrintedSet.has(id));
    }

    function cbTogglePrintedBtn(btn) {
        const cardEl = btn.closest('.meta-binder-card');
        if (!cardEl || !_cbPrintedSet) return;
        const cardId = cardEl.getAttribute('data-card-id') || '';
        const name = cardEl.getAttribute('data-name') || '';
        const familyRefs = (cardEl.getAttribute('data-family-refs') || '').split(',').filter(Boolean);
        const card = { cardId, name, familyRefs };
        if (cbIsPrinted(card)) {
            cbPrintedIdsForCard(card).forEach(id => _cbPrintedSet.delete(id));
        } else {
            _cbPrintedSet.add(cardId);
        }
        cbPersistPrintedSet();
        // Grid frames + stats + chip counts all show the same numbers.
        cbApplyFilter();
        cbRenderPrintStats();
        cbUpdatePrintChipCounts();
    }

    // The chips live in #cbFilters, which only cbRenderBinder rewrites —
    // and calling that resets cbFilter to 'all'. Patch the counts in place
    // instead so toggling cards doesn't leave "Noch drucken (40)" next to
    // a stats block saying 0.
    function cbUpdatePrintChipCounts() {
        if (cbMode !== 'print') return;
        const delta = window._cbDelta;
        const filtersEl = document.getElementById('cbFilters');
        if (!delta || !Array.isArray(delta.cards) || !filtersEl) return;
        const printedCount = delta.cards.filter(c => cbIsPrinted(c)).length;
        const toPrint = filtersEl.querySelector('[data-filter="toprint"]');
        const printed = filtersEl.querySelector('[data-filter="printed"]');
        if (toPrint) toPrint.textContent = `${cbText('cb.filterToPrint', 'To print')} (${delta.cards.length - printedCount})`;
        if (printed) printed.textContent = `${cbText('cb.filterPrinted', 'Printed')} ✓ (${printedCount})`;
    }

    // ── Mode & threshold ──
    function cbSetMode(mode) {
        const next = mode === 'print' ? 'print' : 'collection';
        if (next === cbMode) return;
        cbMode = next;
        const btnColl = document.getElementById('cbModeCollection');
        const btnPrint = document.getElementById('cbModePrint');
        if (btnColl) btnColl.classList.toggle('active', cbMode === 'collection');
        if (btnPrint) btnPrint.classList.toggle('active', cbMode === 'print');
        cbUpdateActionButtons();
        const rerender = () => {
            const delta = window._cbDelta;
            if (delta) cbRenderBinder(delta, mb());
        };
        if (cbMode === 'print') { cbLoadPrintedSet().then(rerender); } else { rerender(); }
    }

    function cbSetThreshold(value) {
        const v = Number(value);
        const changed = ((v === 0 || v === 30) ? v : 70) !== cbThreshold;
        cbThreshold = (v === 0 || v === 30) ? v : 70;
        try { localStorage.setItem(CB_THRESHOLD_KEY, String(cbThreshold)); } catch (_) { /* ignore */ }
        document.querySelectorAll('#cbThresholdSegment .cb-seg-btn').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.threshold) === cbThreshold);
        });
        // A binder is already on screen: tapping the segment must change it,
        // not silently wait for another Generate press.
        if (changed && window._cbDelta && cbSelectedArchetypes.length > 0) {
            buildCustomBinder();
        }
    }

    function cbLoadThreshold() {
        try {
            const v = Number(localStorage.getItem(CB_THRESHOLD_KEY));
            if (v === 0 || v === 30 || v === 70) cbThreshold = v;
        } catch (_) { /* ignore */ }
    }

    function cbUpdateActionButtons() {
        const isPrint = cbMode === 'print';
        const toggleEl = (id, show) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('d-none', !show);
        };
        toggleEl('cbAddWishlist', !isPrint);
        toggleEl('cbSendProxy', !isPrint);
        toggleEl('cbSendUnprinted', isPrint);
        toggleEl('cbBulkMarkPrinted', isPrint);
    }

    // ── Print-mode quick actions ──
    function cbUnprintedCards() {
        const delta = window._cbDelta;
        if (!delta || !Array.isArray(delta.cards)) return [];
        return delta.cards.filter(c => !cbIsPrinted(c));
    }

    async function cbSendUnprintedToProxy() {
        // The printed set may still be loading right after a mode switch —
        // without this await every card counts as unprinted and the whole
        // binder floods the queue.
        await cbLoadPrintedSet();
        const unprinted = cbUnprintedCards();
        if (unprinted.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.allPrinted', 'Everything printed — your binder is complete.'), 'info');
            return;
        }
        let copies = 0;
        unprinted.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.maxCount, true);
                copies += card.maxCount;
            }
        });
        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        if (typeof showToast === 'function') {
            showToast(cbText('cb.unprintedSent', '{n} proxies added to the print list (Proxy Printer tab). Note: the print list is per device — on another device, use "Load from binder" there.').replace('{n}', String(copies)), 'success');
        }
    }

    function cbMarkFilteredPrinted() {
        if (!_cbPrintedSet) return;
        // Uses the PRE-expansion filtered list: the All-Prints expansion
        // creates per-print ids that don't exist as binder entries.
        const filtered = cbComputeFilteredCards();
        const toMark = filtered.filter(c => !cbIsPrinted(c));
        if (toMark.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.nothingToMark', 'All shown cards are already marked as printed.'), 'info');
            return;
        }
        const msg = cbText('cb.bulkMarkConfirm', 'Mark {n} shown cards as printed?').replace('{n}', String(toMark.length));
        if (!window.confirm(msg)) return;
        toMark.forEach(c => _cbPrintedSet.add(c.cardId));
        cbPersistPrintedSet();
        cbApplyFilter();
        cbRenderPrintStats();
        cbUpdatePrintChipCounts();
        if (typeof showToast === 'function') showToast(cbText('cb.bulkMarked', '{n} cards marked as printed.').replace('{n}', String(toMark.length)), 'success');
    }

    // ── "Top 10 of the meta" one-tap selection ──
    async function cbAddTopMetaArchetypes() {
        const shared = mb();
        if (typeof shared.getTopCurrentMetaArchetypes !== 'function') return;
        try {
            await shared.ensureMetaDataLoaded();
            const names = await shared.getTopCurrentMetaArchetypes(10);
            if (!Array.isArray(names) || names.length === 0) {
                if (typeof showToast === 'function') showToast(cbText('mb.noData', 'No meta data loaded yet.'), 'warning');
                return;
            }
            names.forEach(n => cbAddArchetype(n, 'current-meta'));
        } catch (e) {
            console.warn('[CustomBinder] top-meta selection failed', e);
        }
    }

    // ── Proxy-tab entry: load unprinted binder cards into the queue ──
    // Works from the SAVED binder (localStorage cache), so the user can
    // fill the queue on the PC without re-generating first.
    async function cbLoadBinderIntoProxy() {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(CB_CACHE_KEY_V2) || 'null'); } catch (_) { /* ignore */ }
        const cards = cached && Array.isArray(cached.cards) ? cached.cards : [];
        if (cards.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.noBinderSaved', 'No saved binder on this device — generate one under Profile → Custom Binder first.'), 'warning');
            return;
        }
        await cbLoadPrintedSet();
        const unprinted = cards.filter(c => !cbIsPrinted(c));
        if (unprinted.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.allPrinted', 'Everything printed — your binder is complete.'), 'info');
            return;
        }
        let copies = 0;
        unprinted.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.maxCount || 1, true);
                copies += card.maxCount || 1;
            }
        });
        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        if (typeof showToast === 'function') {
            showToast(cbText('cb.binderProxyLoaded', '{n} unprinted proxies loaded from your binder.').replace('{n}', String(copies)), 'success');
        }
    }

    // ── Dropped-cards modal (print mode "no longer in the meta") ──
    // One renderer for both binders: the Meta Binder modal takes an
    // override list, so this stays a two-liner instead of a drifting copy.
    function cbOpenDroppedModal() {
        if (typeof window.openMetaBinderDroppedModal !== 'function') return;
        window.openMetaBinderDroppedModal(Array.isArray(window._cbDroppedCards) ? window._cbDroppedCards : []);
    }

    // ── Quick Actions ──
    function cbAddMissingToWishlist() {
        const delta = window._cbDelta;
        if (!delta || !delta.cards) return;

        if (!window.auth?.currentUser) {
            if (typeof showToast === 'function') showToast(cbText('cb.signInRequired','Please sign in to use this feature.'), 'warning');
            return;
        }

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.nothingMissing','All cards are already in your collection!'), 'info');
            return;
        }

        let added = 0;
        missingCards.forEach(card => {
            if (!window.userWishlist || !window.userWishlist.has(card.cardId)) {
                if (typeof addToWishlist === 'function') {
                    addToWishlist(card.cardId);
                    added++;
                }
            }
        });

        if (typeof showToast === 'function') showToast(cbText('cb.wishlistDone','{n} cards added to wishlist.').replace('{n}', added), 'success');
    }

    function cbSendMissingToProxy() {
        const delta = window._cbDelta;
        if (!delta || !delta.cards) return;

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            if (typeof showToast === 'function') showToast(cbText('cb.nothingMissing','All cards are already in your collection!'), 'info');
            return;
        }

        let totalAdded = 0;
        missingCards.forEach(card => {
            if (typeof addCardToProxy === 'function') {
                addCardToProxy(card.name, card.set, card.number, card.missing, true);
                totalAdded += card.missing;
            }
        });

        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        if (typeof showToast === 'function') showToast(cbText('cb.proxyDone','{n} cards sent to Proxy Printer.').replace('{n}', totalAdded), 'success');
    }

    // ── Init: Load previous selections ──
    cbLoadSelections();
    cbLoadPresets();
    cbLoadThreshold();
    // Defer chip rendering until DOM is ready
    function _cbInitDom() {
        cbRenderChips();
        cbRenderPresetBar();
        cbUpdateActionButtons();
        cbSetThreshold(cbThreshold); // paint the persisted segment state
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _cbInitDom);
    } else {
        _cbInitDom();
    }

    // ── Ownership Refresh (analog to refreshMetaBinderOwnership) ──
    function refreshCustomBinderOwnership() {
        // Print mode renders print-status frames and no ownership badges —
        // rewriting classes here would repaint the grid in the wrong axis.
        if (cbMode === 'print') return;
        const grid = document.getElementById('cbGrid');
        if (!grid) return;
        const t = window.userCollectionCounts || new Map();
        grid.querySelectorAll('.meta-binder-card[data-card-id]').forEach(e => {
            const n = e.getAttribute('data-card-id');
            if (!n) return;
            const needEl = e.querySelector('.meta-binder-card-need');
            const a = needEl && parseInt(needEl.textContent, 10) || 1;
            const i = t.get(n) || 0;
            const s = e.getAttribute('data-family-refs') || '';
            const o = e.getAttribute('data-name') || '';
            let c = 0;
            if (s && o) {
                s.split(',').forEach(ref => {
                    const pos = ref.indexOf('-');
                    if (pos < 0) return;
                    const set = ref.substring(0, pos).trim();
                    const num = ref.substring(pos + 1).trim();
                    c += t.get(o + '|' + set + '|' + num) || 0;
                });
            } else {
                c = i;
            }
            const l = i >= a, d = !l && c >= a, u = !l && !d;
            e.classList.toggle('meta-binder-card-owned', l);
            e.classList.toggle('card-owned', l || d);
            e.classList.toggle('meta-binder-card-owned-intl', d);
            e.classList.toggle('meta-binder-card-missing', u);
            e.classList.toggle('card-missing', u);
            const m = e.querySelector('.meta-binder-count-ok') ||
                      e.querySelector('.meta-binder-count-intl') ||
                      e.querySelector('.meta-binder-count-missing');
            if (m) {
                if (l) { m.className = 'meta-binder-count-ok'; m.textContent = i + '/' + a + ' \u2713'; }
                else if (d) { m.className = 'meta-binder-count-intl'; m.textContent = c + '/' + a + ' \u2713'; }
                else { m.className = 'meta-binder-count-missing'; m.textContent = i + '/' + a; }
            }
            const y = e.querySelector('.btn-wishlist[data-card-id]');
            if (y) {
                const missing = Math.max(0, a - i);
                y.setAttribute('data-missing', String(missing));
                y.style.background = window.userWishlist && window.userWishlist.has(n) ? '#E91E63' : '#F48FB1';
                y.style.borderColor = y.style.background;
                y.innerHTML = window.userWishlist && window.userWishlist.has(n) ? '&#9829;' : '&#9825;';
            }
        });
    }

    // ── Expose ──
    window.buildCustomBinder = buildCustomBinder;
    window.refreshCustomBinderOwnership = refreshCustomBinderOwnership;
    window.cbAddArchetype = cbAddArchetype;
    window.cbToggleArchetype = cbToggleArchetype;
    window.cbRemoveArchetype = cbRemoveArchetype;
    window.cbToggleArchetypeDropdown = cbToggleArchetypeDropdown;
    window.cbFilterArchetypeList = cbFilterArchetypeList;
    window.cbSetFilter = cbSetFilter;
    window.cbSetPrintView = cbSetPrintView;
    window.cbApplyFilter = cbApplyFilter;
    window.cbAddMissingToWishlist = cbAddMissingToWishlist;
    window.cbSendMissingToProxy = cbSendMissingToProxy;
    window.cbSaveCurrentAsPreset = cbSaveCurrentAsPreset;
    window.cbLoadPreset = cbLoadPreset;
    window.cbDeletePreset = cbDeletePreset;
    window.cbSetMode = cbSetMode;
    window.cbSetThreshold = cbSetThreshold;
    window.cbTogglePrintedBtn = cbTogglePrintedBtn;
    window.cbSendUnprintedToProxy = cbSendUnprintedToProxy;
    window.cbMarkFilteredPrinted = cbMarkFilteredPrinted;
    window.cbAddTopMetaArchetypes = cbAddTopMetaArchetypes;
    window.cbLoadBinderIntoProxy = cbLoadBinderIntoProxy;
    window.cbOpenDroppedModal = cbOpenDroppedModal;
})();
