(function () {
    'use strict';

    const CB_STORAGE_KEY = 'customBinderArchetypesV1';
    const CB_CACHE_KEY = 'customBinderCacheV1';

    let cbSelectedArchetypes = []; // [{name, source}]
    let cbAllArchetypes = [];      // [{name, source, label}]
    let cbArchetypesLoaded = false;
    let cbFilter = 'all';
    let _cbSkipNextClose = false;

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
        cbRenderDropdownList();
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

        // ── Tier list from Meta Binder (only when not searching) ──
        if (!query) {
            let tierGroups = Array.isArray(window._metaBinderArchetypeGroups) && window._metaBinderArchetypeGroups.length > 0
                ? window._metaBinderArchetypeGroups
                : null;

            // Fallback: build top decks from cbAllArchetypes if Meta Binder hasn't been opened yet
            if (!tierGroups) {
                const topBySource = {};
                cbAllArchetypes.forEach(a => {
                    if (!topBySource[a.source]) topBySource[a.source] = [];
                    if (topBySource[a.source].length < 20) topBySource[a.source].push(a);
                });
                const fallbackGroups = [];
                if (topBySource['current-meta']?.length) fallbackGroups.push({ title: 'Top Current Meta', source: 'current-meta', items: topBySource['current-meta'].map(a => ({ name: a.name, source: a.source })) });
                if (topBySource['city-current']?.length) fallbackGroups.push({ title: 'Top City League', source: 'city-current', items: topBySource['city-current'].map(a => ({ name: a.name, source: a.source })) });
                if (topBySource['city-past']?.length) fallbackGroups.push({ title: 'Top City League Past', source: 'city-past', items: topBySource['city-past'].map(a => ({ name: a.name, source: a.source })) });
                if (fallbackGroups.length) tierGroups = fallbackGroups;
            }

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
        const delta = cbComputeDelta(binderMap, shared);
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
    function cbComputeDelta(binderMap, shared) {
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

        const delta = shared.computeDelta(binderMap);

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
                                        <span class="stat-badge rank-performance-hint" style="background:#fff3e0;color:#e65100;">🏆 ${currentMetaLabel}: ${rankText}</span>
                                        <span class="stat-badge">📊 ${currentMetaLabel}: ${shareText}</span>
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
                    <button class="meta-binder-filter-btn active" data-filter="all" onclick="cbSetFilter('all')">Alle (${totalUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="missing" onclick="cbSetFilter('missing')">❌ Fehlend (${missingUnique})</button>
                    <button class="meta-binder-filter-btn" data-filter="new" onclick="cbSetFilter('new')">🆕 Neu (${newCount})</button>
                </div>
                <div class="filter-group">
                    <select id="cbFilterType" onchange="cbApplyFilter()" class="select-system">
                        <option value="all">Alle Typen</option>
                        <option value="Pokemon-Grass">Pokemon: Pflanze</option>
                        <option value="Pokemon-Fire">Pokemon: Feuer</option>
                        <option value="Pokemon-Water">Pokemon: Wasser</option>
                        <option value="Pokemon-Lightning">Pokemon: Elektro</option>
                        <option value="Pokemon-Psychic">Pokemon: Psycho</option>
                        <option value="Pokemon-Fighting">Pokemon: Kampf</option>
                        <option value="Pokemon-Darkness">Pokemon: Unlicht</option>
                        <option value="Pokemon-Metal">Pokemon: Metall</option>
                        <option value="Pokemon-Dragon">Pokemon: Drache</option>
                        <option value="Pokemon-Colorless">Pokemon: Farblos</option>
                        <option value="Supporter">Unterstützer</option>
                        <option value="Item">Item</option>
                        <option value="Tool">Ausrüstung</option>
                        <option value="Stadium">Stadion</option>
                        <option value="Special Energy">Spezial-Energie</option>
                        <option value="Basic Energy">Basis-Energie</option>
                        <option value="ACE SPEC">ACE SPEC</option>
                    </select>
                    <select id="cbFilterSet" onchange="cbApplyFilter()" class="select-system">
                        <option value="all">Alle Sets</option>
                    </select>
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
            '<option value="all">Alle Sets</option>',
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

        const sorted = shared.sortMetaCards([...filtered]);

        if (sorted.length === 0) {
            grid.innerHTML = `<p class="color-grey">${cbText('mb.empty', 'No cards found for current filter.')}</p>`;
            return;
        }

        grid.innerHTML = sorted.map(card => {
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

            return `
                <div class="meta-binder-card ${statusClass}" data-type="${escapeHtml(typeMeta.type)}" data-set="${escapeHtml(String(card.set || ''))}" data-supertype="${escapeHtml(typeMeta.supertype)}" data-is-ace-spec="${typeMeta.isAceSpec ? 'true' : 'false'}" data-name="${safeName}" data-pokedex="${String(dexNumber)}" data-set-order="${String(setOrder)}" data-number-sort="${String(numberSort)}" title="Decks: ${deckList}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        <div class="deck-indicator-count">${card.decks.length} Decks</div>
                        ${countLabel}
                    </div>
                </div>`;
        }).join('');
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
    // Defer chip rendering until DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cbRenderChips);
    } else {
        cbRenderChips();
    }

    // ── Expose ──
    window.buildCustomBinder = buildCustomBinder;
    window.cbAddArchetype = cbAddArchetype;
    window.cbToggleArchetype = cbToggleArchetype;
    window.cbRemoveArchetype = cbRemoveArchetype;
    window.cbToggleArchetypeDropdown = cbToggleArchetypeDropdown;
    window.cbFilterArchetypeList = cbFilterArchetypeList;
    window.cbSetFilter = cbSetFilter;
    window.cbApplyFilter = cbApplyFilter;
    window.cbAddMissingToWishlist = cbAddMissingToWishlist;
    window.cbSendMissingToProxy = cbSendMissingToProxy;
})();
