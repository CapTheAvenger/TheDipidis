(function () {
    'use strict';

    const CB_STORAGE_KEY = 'customBinderArchetypesV1';
    const CB_CACHE_KEY = 'customBinderCacheV1';
    const CB_PRESETS_KEY = 'customBinderPresetsV1';

    let cbSelectedArchetypes = []; // [{name, source}]
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
            if (typeof showToast === 'function') showToast('Keine Archetypes ausgewählt.', 'warning');
            return;
        }
        const name = prompt('Name für diesen Binder:');
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
            bar.classList.add('display-none');
            return;
        }
        bar.classList.remove('display-none');
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
                (typeof loadCSV === 'function' ? loadCSV('city_league_archetypes_comparison_M3.csv').catch(() => []) : [])
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
                return `<span class="custom-binder-chip" title="${escapeHtml(a.source)}">
                    ${safeName} <small class="opacity-60">(${sourceTag})</small>
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
            if (typeof showToast === 'function') showToast('Maximum 30 archetypes.', 'warning');
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
                if (typeof showToast === 'function') showToast('Maximum 30 archetypes.', 'warning');
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

        if (dd.classList.contains('display-none')) {
            cbOpenDropdown();
        } else {
            dd.classList.add('display-none');
        }
    }

    async function cbOpenDropdown() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd) return;

        dd.classList.remove('display-none');
        dd.innerHTML = '<div class="custom-binder-dropdown-loading">Loading archetypes…</div>';

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

                const topCityPast = await shared.getTopCityArchetypes('city_league_archetypes_comparison_M3.csv', cityPastRows, 10);
                if (topCityPast.length) groups.push({ title: 'Top 10 City League Past', source: 'city-past', items: topCityPast.map(n => ({ name: n, source: 'city-past' })) });
            }
        } catch (e) {
            console.warn('[CustomBinder] tier groups fallback error:', e);
        }
        _cbTierGroups = groups.length > 0 ? groups : null;
    }

    function cbRenderDropdownList() {
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd || dd.classList.contains('display-none')) return;

        const searchEl = document.getElementById('cbArchetypeSearch');
        const query = String(searchEl ? searchEl.value : '').trim().toLowerCase();
        const shared = mb();

        // Build set of already-selected keys
        const selectedKeys = new Set(cbSelectedArchetypes.map(a =>
            (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source
        ));

        let items = cbAllArchetypes;
        if (query) {
            items = items.filter(a => a.name.toLowerCase().includes(query));
        }

        if (items.length === 0) {
            dd.innerHTML = '<div class="custom-binder-dropdown-empty">No archetypes found.</div>';
            return;
        }

        let html = '';

        // ── Tier list from Meta Binder or fallback (only when not searching) ──
        if (!query) {
            const tierGroups = _cbTierGroups || (Array.isArray(window._metaBinderArchetypeGroups) && window._metaBinderArchetypeGroups.length > 0
                ? window._metaBinderArchetypeGroups : null);

            if (tierGroups && tierGroups.length > 0) {
                html += '<div class="custom-binder-dropdown-group-label" style="color:var(--accent,#3b4cca);font-weight:900;">⭐ Top Decks</div>';
                const tierSeen = new Set();
                tierGroups.forEach(group => {
                    (group.items || []).forEach((item, idx) => {
                        const name = item.name;
                        const source = item.source || 'current-meta';
                        const tierKey = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(name) : name.toLowerCase()) + '|' + source;
                        if (tierSeen.has(tierKey)) return;
                        tierSeen.add(tierKey);
                        const isSelected = selectedKeys.has(tierKey);
                        const safeName = escapeHtml(name);
                        const safeSource = escapeHtml(source);
                        const sourceTag = source === 'current-meta' ? 'Meta' : (source === 'city-current' ? 'City' : 'Past');
                        const rankText = Number.isFinite(item.currentMetaRank) ? `#${item.currentMetaRank}` : '';
                        html += `<button type="button" class="custom-binder-dropdown-item ${isSelected ? 'is-selected' : ''}" 
                            onclick="cbToggleArchetype('${name.replace(/'/g, "\\'")}','${safeSource}')">
                            <span class="cb-dd-check">${isSelected ? '✓' : ''}</span> ${safeName} <small class="opacity-60">(${sourceTag}${rankText ? ' ' + rankText : ''})</small>
                        </button>`;
                    });
                });
                html += '<div style="border-top:2px solid var(--border-color,#ddd);margin:6px 0;"></div>';
            }
        }

        // ── Group by source (alphabetical) ──
        const groups = {};
        items.forEach(a => {
            if (!groups[a.label]) groups[a.label] = [];
            groups[a.label].push(a);
        });

        for (const [label, archetypes] of Object.entries(groups)) {
            html += `<div class="custom-binder-dropdown-group-label">${escapeHtml(label)}</div>`;
            archetypes.slice(0, 50).forEach(a => {
                const key = (shared.normalizeArchetypeKey ? shared.normalizeArchetypeKey(a.name) : a.name.toLowerCase()) + '|' + a.source;
                const isSelected = selectedKeys.has(key);
                const safeName = escapeHtml(a.name);
                const safeSource = escapeHtml(a.source);
                html += `<button type="button" class="custom-binder-dropdown-item ${isSelected ? 'is-selected' : ''}" 
                    onclick="cbToggleArchetype('${a.name.replace(/'/g, "\\'")}','${safeSource}')">
                    <span class="cb-dd-check">${isSelected ? '✓' : ''}</span> ${safeName}
                </button>`;
            });
        }

        dd.innerHTML = html;
    }

    function cbFilterArchetypeList() {
        if (!cbArchetypesLoaded) {
            cbOpenDropdown();
            return;
        }
        const dd = document.getElementById('cbArchetypeDropdown');
        if (dd && dd.classList.contains('display-none')) {
            dd.classList.remove('display-none');
        }
        cbRenderDropdownList();
    }

    // ── Close dropdown when clicking outside ──
    document.addEventListener('click', function (e) {
        if (_cbSkipNextClose) { _cbSkipNextClose = false; return; }
        const dd = document.getElementById('cbArchetypeDropdown');
        if (!dd || dd.classList.contains('display-none')) return;
        const picker = e.target.closest('.custom-binder-picker');
        if (!picker) dd.classList.add('display-none');
    });

    // ── Build Custom Binder ──
    async function buildCustomBinder() {
        if (cbSelectedArchetypes.length === 0) {
            if (typeof showToast === 'function') showToast('Please select at least one archetype.', 'warning');
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

        // Collect cards (same logic as Meta Binder)
        const binderMap = shared.collectBinderCards(sourceTargets);

        if (binderMap.size === 0) {
            if (typeof showToast === 'function') showToast(cbText('mb.noCards', 'No card data found for the selected archetypes.'), 'warning');
            if (grid) grid.innerHTML = '';
            return;
        }

        // Compute delta with own cache key
        const delta = await cbComputeDelta(binderMap, shared);
        window._cbDelta = delta;

        cbRenderBinder(delta, shared);
        if (typeof showToast === 'function') showToast('Custom Binder generated!', 'success');
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

    // ── Delta with separate cache key ──
    async function cbComputeDelta(binderMap, shared) {
        // Use shared computeDelta but swap cache key temporarily
        const origCache = localStorage.getItem('metaBinderCacheV1');

        // Load CB-specific previous cache
        let previousIds = new Set();
        try {
            const cached = JSON.parse(localStorage.getItem(CB_CACHE_KEY) || '[]');
            previousIds = new Set(cached);
        } catch (_) { /* ignore */ }

        // Temporarily set the cache so computeDelta uses our key
        localStorage.setItem('metaBinderCacheV1', JSON.stringify(Array.from(previousIds)));

        const delta = await shared.computeDelta(binderMap);

        // Save to CB cache, restore original meta binder cache
        localStorage.setItem(CB_CACHE_KEY, JSON.stringify(Array.from(binderMap.keys())));
        if (origCache !== null) {
            localStorage.setItem('metaBinderCacheV1', origCache);
        } else {
            localStorage.removeItem('metaBinderCacheV1');
        }

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

        // Stats
        if (statsEl) {
            statsEl.classList.remove('display-none');
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
                        const currentMetaLabel = escapeHtml(item.currentMetaFormatLabel || 'TEF-POR');
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
                deltaEl.classList.remove('display-none');
                deltaEl.innerHTML = `<div class="meta-binder-archetype-groups">${html}</div>`;
            } else {
                deltaEl.classList.add('display-none');
                deltaEl.innerHTML = '';
            }
        }

        // Filters
        if (filtersEl) {
            filtersEl.classList.remove('display-none');
            filtersEl.innerHTML = `
                <div class="filter-group">
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="cbSetFilter('all')">${cbText('cb.filterAll','All')} (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="owned" onclick="cbSetFilter('owned')">${cbText('cb.filterOwned','In Collection')} (${ownedComplete})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="cbSetFilter('missing')">${cbText('cb.filterMissing','Missing')} (${missingUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="new" onclick="cbSetFilter('new')">🆕 Neu (${newCount})</button>
                </div>
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

        cbFilter = 'all';
        cbRenderGrid(delta, shared);
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

    function cbRenderGrid(delta, shared) {
        const grid = document.getElementById('cbGrid');
        if (!grid) return;

        const { cards } = delta;
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
        } else {
            filtered = cards;
        }

        filtered = filtered.filter(card => {
            const meta = shared.getMetaBinderTypeMeta(card);
            const cardSet = String(card.set || '').toLowerCase();
            if (typeFilter !== 'all' && meta.type !== typeFilter) return false;
            if (setFilter !== 'all' && cardSet !== setFilter) return false;
            return true;
        });

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
            grid.innerHTML = `<p class="color-grey">${cbText('mb.empty', 'No cards found for current filter.')}</p>`;
            return;
        }

        const cardHtmlEntries = sorted.map(card => {
            const imageUrl = shared.findCardImage(card.name, card.set, card.number);
            const statusClass = card.ownershipMode === 'exact'
                ? 'meta-binder-card-owned card-owned'
                : (card.ownershipMode === 'intl-complete'
                    ? 'meta-binder-card-owned-intl card-owned'
                    : 'meta-binder-card-missing card-missing');
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

            return { name: card.name, html: `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${escapeHtml(String(card.set || ''))}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" data-name="${safeName}" data-pokedex="${String(dexNumber)}" data-set-order="${String(setOrder)}" data-number-sort="${String(numberSort)}" data-card-id="${safeCardId}" data-family-refs="${escapeHtml((Array.isArray(card.familyRefs) ? card.familyRefs : []).join(','))}" data-max-count="${String(card.maxCount || 0)}" title="Decks: ${deckList}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}
                    <div class="pos-abs card-action-row-wide card-database-top-actions">
                        <button type="button" data-card-id="${safeCardId}" onclick="addCollectionFromCardDbButton(this)" class="btn-green card-badge" title="Add to collection (${ownedCount}/4)" aria-label="Add ${safeName} to collection">+</button>
                        <button type="button" data-card-id="${safeCardId}" onclick="removeCollectionFromCardDbButton(this)" class="btn-red card-badge" style="color: ${ownedCount > 0 ? '#fff' : '#999'}; background: ${ownedCount > 0 ? '#dc3545' : '#fff'};" title="Remove from collection (${ownedCount}/4)" aria-label="Remove ${safeName} from collection">-</button>
                        <button type="button" data-card-id="${safeCardId}" data-missing="${String(missingCount)}" onclick="toggleWishlistMetaBinder(this)" class="btn-wishlist card-badge" style="color: #fff; background: ${userWantsCard ? '#E91E63' : '#F48FB1'}; border: 2px solid ${userWantsCard ? '#E91E63' : '#F48FB1'};" title="${userWantsCard ? 'Remove from wishlist' : 'Add missing (' + missingCount + ') to wishlist'}" aria-label="${userWantsCard ? 'Remove' : 'Add'} ${safeName} wishlist">${userWantsCard ? '&#9829;' : '&#9825;'}</button>
                    </div>
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>
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

    // ── Quick Actions ──
    function cbAddMissingToWishlist() {
        const delta = window._cbDelta;
        if (!delta || !delta.cards) return;

        if (!window.auth?.currentUser) {
            if (typeof showToast === 'function') showToast('Please sign in to use this feature.', 'warning');
            return;
        }

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            if (typeof showToast === 'function') showToast('All cards are already in your collection!', 'info');
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

        if (typeof showToast === 'function') showToast(`${added} cards added to wishlist.`, 'success');
    }

    function cbSendMissingToProxy() {
        const delta = window._cbDelta;
        if (!delta || !delta.cards) return;

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            if (typeof showToast === 'function') showToast('All cards are already in your collection!', 'info');
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
        if (typeof showToast === 'function') showToast(`${totalAdded} cards sent to Proxy Printer.`, 'success');
    }

    // ── Init: Load previous selections ──
    cbLoadSelections();
    cbLoadPresets();
    // Defer chip rendering until DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { cbRenderChips(); cbRenderPresetBar(); });
    } else {
        cbRenderChips();
        cbRenderPresetBar();
    }

    // ── Ownership Refresh (analog to refreshMetaBinderOwnership) ──
    function refreshCustomBinderOwnership() {
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
})();
