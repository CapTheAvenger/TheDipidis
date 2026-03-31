(function() {
    const OVERRIDES_KEY = 'archetypeTooltipOverridesV1';
    const CACHE_KEY = 'archetypeTooltipCacheV1';
    const REMOTE_OVERRIDES_COLLECTION = 'appOverrides';
    const REMOTE_OVERRIDES_DOC = 'archetypeTooltips';

    let actionDataPromise = null;
    let lastRenderedArchetype = '';
    let overridesHydratedUserId = '';

    function tipText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    function parseJson(raw, fallback) {
        try {
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function getOverrides() {
        const parsed = parseJson(localStorage.getItem(OVERRIDES_KEY), {});
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    function setOverrides(overrides) {
        localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides || {}));
    }

    function getCache() {
        const parsed = parseJson(localStorage.getItem(CACHE_KEY), {});
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    function setCache(cache) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache || {}));
    }

    function getTooltipElements() {
        return {
            card: document.getElementById('currentMetaBeginnerTooltipCard'),
            source: document.getElementById('currentMetaTooltipSource'),
            text: document.getElementById('currentMetaBeginnerTooltipText'),
            adminArchetype: document.getElementById('tooltipAdminArchetype'),
            adminText: document.getElementById('tooltipAdminText')
        };
    }

    function normalize(value) {
        return String(value || '').trim();
    }

    function getCurrentUserId() {
        const user = window.auth && window.auth.currentUser;
        return normalize(user && user.uid ? user.uid : '');
    }

    function getSelectedArchetype() {
        const select = document.getElementById('currentMetaDeckSelect');
        return normalize(select ? select.value : '') || normalize(window.currentCurrentMetaArchetype || '');
    }

    function getCurrentMetaRows(archetype) {
        const safeArchetype = normalize(archetype).toLowerCase();
        const rows = Array.isArray(window.currentMetaAnalysisData) ? window.currentMetaAnalysisData : [];
        return rows.filter(row => normalize(row.archetype).toLowerCase() === safeArchetype);
    }

    function parseFloatSafe(raw) {
        if (raw === null || raw === undefined) return 0;
        return parseFloat(String(raw).replace(',', '.')) || 0;
    }

    function parseIntSafe(raw) {
        return parseInt(String(raw || '').replace(',', '.'), 10) || 0;
    }

    function aggregateCards(rows) {
        const byName = new Map();
        rows.forEach(row => {
            const name = normalize(row.card_name);
            if (!name) return;
            const deckInclusion = parseIntSafe(row.deck_inclusion_count);
            const totalDecks = parseIntSafe(row.total_decks_in_archetype);
            const percentage = parseFloatSafe(row.percentage_in_archetype);
            const maxCount = parseIntSafe(row.max_count);
            const type = normalize(row.type);

            const existing = byName.get(name) || {
                name,
                type,
                maxCount: 0,
                percentage: 0,
                deckInclusion: 0,
                totalDecks: totalDecks || 0
            };

            existing.maxCount = Math.max(existing.maxCount, maxCount);
            existing.percentage = Math.max(existing.percentage, percentage);
            existing.deckInclusion = Math.max(existing.deckInclusion, deckInclusion);
            existing.totalDecks = Math.max(existing.totalDecks, totalDecks);
            if (!existing.type && type) existing.type = type;
            byName.set(name, existing);
        });

        return Array.from(byName.values()).sort((a, b) => {
            if (b.percentage !== a.percentage) return b.percentage - a.percentage;
            if (b.maxCount !== a.maxCount) return b.maxCount - a.maxCount;
            return a.name.localeCompare(b.name);
        });
    }

    async function ensureActionData() {
        if (window._ptCardActionsData && (Array.isArray(window._ptCardActionsData.abilities) || Array.isArray(window._ptCardActionsData.trainers))) {
            return window._ptCardActionsData;
        }

        if (actionDataPromise) return actionDataPromise;

        actionDataPromise = fetch('data/card_actions.json')
            .then(response => {
                if (!response.ok) throw new Error('card_actions.json not reachable');
                return response.json();
            })
            .then(data => {
                window._ptCardActionsData = data;
                return data;
            })
            .catch(error => {
                console.warn('[Tooltip] Could not load card_actions.json:', error);
                return { abilities: [], trainers: [] };
            });

        return actionDataPromise;
    }

    async function buildEvidenceMap() {
        const data = await ensureActionData();
        const map = new Map();
        const combined = []
            .concat(Array.isArray(data.abilities) ? data.abilities : [])
            .concat(Array.isArray(data.trainers) ? data.trainers : []);

        combined.forEach(entry => {
            const cardName = normalize(entry.cardName).toLowerCase();
            const description = normalize(entry.description);
            if (!cardName || !description) return;
            if (!map.has(cardName)) map.set(cardName, description);
        });

        return map;
    }

    function getCardTypeHint(cards) {
        const counts = { pokemon: 0, trainer: 0, energy: 0 };
        cards.forEach(card => {
            const type = normalize(card.type).toLowerCase();
            if (type.includes('energy')) counts.energy += 1;
            else if (['supporter', 'item', 'stadium', 'tool'].some(token => type.includes(token))) counts.trainer += 1;
            else counts.pokemon += 1;
        });

        if (counts.trainer >= counts.pokemon && counts.trainer >= counts.energy) return tipText('tip.shellTrainerHeavy', 'trainer-heavy consistency shell');
        if (counts.energy >= counts.pokemon && counts.energy >= counts.trainer) return tipText('tip.shellEnergyHeavy', 'energy-focused shell');
        return tipText('tip.shellPokemonCore', 'Pokemon-centered shell');
    }

    function makeCacheSignature(archetype, cards) {
        const top = cards.slice(0, 6).map(card => `${card.name}:${card.maxCount}:${Math.round(card.percentage * 10) / 10}`).join('|');
        return `${archetype}::${top}`;
    }

    function setSourceLabel(label) {
        const els = getTooltipElements();
        if (els.source) els.source.textContent = label;
    }

    function setTooltipText(text) {
        const els = getTooltipElements();
        if (els.text) els.text.textContent = text;
    }

    // ── All known archetype names (cached after first population) ──
    let allAdminArchetypes = [];

    function getAdminArchetypeOptions() {
        // Collect from all available select dropdowns
        const names = new Set();
        ['currentMetaDeckSelect', 'cityLeagueDeckSelect'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            Array.from(select.querySelectorAll('option')).forEach(option => {
                const v = normalize(option.value);
                if (v) names.add(v);
            });
        });
        // Also scan loaded analysis data arrays
        [window.currentMetaAnalysisData, window.cityLeagueAnalysisData].forEach(data => {
            if (!Array.isArray(data)) return;
            data.forEach(row => {
                const v = normalize(row.archetype);
                if (v) names.add(v);
            });
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    async function ensureAdminArchetypesLoaded() {
        // If we already have archetypes, skip
        if (allAdminArchetypes.length > 0) return;
        const initial = getAdminArchetypeOptions();
        if (initial.length > 0) { allAdminArchetypes = initial; return; }

        // Try loading data
        const promises = [];
        if (!window.currentMetaAnalysisLoaded) {
            if (typeof loadCurrentAnalysis === 'function') {
                promises.push(loadCurrentAnalysis().catch(() => {}));
            } else if (typeof loadCurrentMetaAnalysis === 'function') {
                promises.push(loadCurrentMetaAnalysis().catch(() => {}));
            } else if (typeof loadCSV === 'function') {
                promises.push(loadCSV('current_meta_card_data.csv').then(data => {
                    if (data && data.length) window.currentMetaAnalysisData = data;
                }).catch(() => {}));
            }
        }
        if (!window.cityLeagueAnalysisLoaded) {
            if (typeof loadCityLeagueAnalysis === 'function') {
                promises.push(loadCityLeagueAnalysis().catch(() => {}));
            } else if (typeof loadCSV === 'function') {
                promises.push(loadCSV('city_league_analysis.csv').then(data => {
                    if (data && data.length) window.cityLeagueAnalysisData = data;
                }).catch(() => {}));
            }
        }
        if (promises.length > 0) await Promise.all(promises);
        allAdminArchetypes = getAdminArchetypeOptions();
    }

    function populateAdminArchetypeOptions(activeArchetype, filterText) {
        const els = getTooltipElements();
        if (!els.adminArchetype) return;

        let values = allAdminArchetypes.length > 0 ? allAdminArchetypes : getAdminArchetypeOptions();
        if (!values.length) {
            els.adminArchetype.innerHTML = '<option value="">Loading archetypes…</option>';
            return;
        }

        // Apply search filter
        if (filterText) {
            const lower = filterText.toLowerCase();
            values = values.filter(v => v.toLowerCase().includes(lower));
        }

        if (values.length === 0) {
            els.adminArchetype.innerHTML = '<option value="">No match</option>';
            return;
        }

        const selected = normalize(activeArchetype);
        const current = normalize(els.adminArchetype.value);
        const target = selected || current || values[0];
        els.adminArchetype.innerHTML = values
            .map(value => {
                const isSelected = value === target;
                return `<option value="${escapeHtml(value)}" ${isSelected ? 'selected' : ''}>${escapeHtml(value)}</option>`;
            })
            .join('');
    }

    function filterTooltipAdminArchetypes() {
        const searchInput = document.getElementById('tooltipAdminSearch');
        const filterText = searchInput ? searchInput.value.trim() : '';
        populateAdminArchetypeOptions('', filterText);
    }

    async function hydrateAdminFields(archetype) {
        const els = getTooltipElements();
        const overrides = getOverrides();
        await ensureAdminArchetypesLoaded();
        populateAdminArchetypeOptions(archetype);
        if (els.adminArchetype) els.adminArchetype.value = archetype || '';
        if (els.adminText) els.adminText.value = archetype && overrides[archetype] ? String(overrides[archetype]) : '';
    }

    async function loadOverridesRemoteForUser(force = false) {
        const userId = getCurrentUserId();
        if (!userId || !window.db || typeof window.db.collection !== 'function') return false;
        if (!force && userId === overridesHydratedUserId) return false;

        try {
            const doc = await window.db
                .collection('users')
                .doc(userId)
                .collection(REMOTE_OVERRIDES_COLLECTION)
                .doc(REMOTE_OVERRIDES_DOC)
                .get();

            const remoteTooltips = doc && doc.exists && doc.data() && typeof doc.data().tooltips === 'object'
                ? doc.data().tooltips
                : null;

            if (remoteTooltips) {
                const local = getOverrides();
                const merged = { ...local, ...remoteTooltips };
                setOverrides(merged);
            }

            overridesHydratedUserId = userId;
            return !!remoteTooltips;
        } catch (error) {
            console.warn('[Tooltip] Remote override load failed:', error);
            return false;
        }
    }

    async function generateTooltip(archetype) {
        const rows = getCurrentMetaRows(archetype);
        if (rows.length === 0) {
            return {
                text: tipText('tip.noDeckSelected', 'Select a deck to see a beginner tooltip.'),
                source: tipText('tip.sourceWaiting', 'Waiting for deck data')
            };
        }

        const cards = aggregateCards(rows);
        if (cards.length === 0) {
            return {
                text: tipText('tip.noCardRows', 'No card rows found for this archetype.'),
                source: tipText('tip.sourceMetaOnly', 'Meta rows only')
            };
        }

        const cache = getCache();
        const signature = makeCacheSignature(archetype, cards);
        const cached = cache[archetype];
        if (cached && cached.signature === signature && cached.text) {
            return {
                text: String(cached.text),
                source: tipText('tip.sourceCache', 'Local cache (validated)')
            };
        }

        const evidenceMap = await buildEvidenceMap();
        const topCards = cards.slice(0, 5);
        const shellHint = getCardTypeHint(topCards);

        const evidenceLines = topCards
            .map(card => {
                const pct = Number.isFinite(card.percentage) ? card.percentage.toFixed(1) : '0.0';
                const description = evidenceMap.get(card.name.toLowerCase());
                const quantityHint = card.maxCount > 0 ? `${card.maxCount}x max` : 'tech slot';
                if (!description) {
                    return `- ${card.name}: ${pct}% inclusion (${quantityHint}).`;
                }
                return `- ${card.name}: ${pct}% inclusion (${quantityHint}); local action note: ${description}.`;
            })
            .slice(0, 4)
            .join('\n');

        const text = [
            `${archetype} usually plays as a ${shellHint}.`,
            tipText('tip.generatedEvidencePrefix', 'Evidence from local meta rows + local card action descriptions:'),
            evidenceLines,
            tipText('tip.generatedLimit', 'Only local evidence is used; unknown card text is intentionally omitted.')
        ].join('\n');

        cache[archetype] = { signature, text, updatedAtMs: Date.now() };
        setCache(cache);

        return {
            text,
            source: tipText('tip.sourceGenerated', 'Generated from local data')
        };
    }

    async function renderArchetypeTooltip() {
        const els = getTooltipElements();
        if (!els.card || !els.text) return;

        const archetype = getSelectedArchetype();
        if (!archetype) {
            setTooltipText(tipText('tip.noDeckSelected', 'Select a deck to see a beginner tooltip.'));
            setSourceLabel(tipText('tip.sourceWaiting', 'Waiting for deck data'));
            hydrateAdminFields('');
            lastRenderedArchetype = '';
            return;
        }

        if (archetype === lastRenderedArchetype) {
            hydrateAdminFields(archetype);
            return;
        }
        lastRenderedArchetype = archetype;

        const overrides = getOverrides();
        if (overrides[archetype]) {
            setTooltipText(String(overrides[archetype]));
            setSourceLabel(tipText('tip.sourceOverride', 'Admin override'));
            hydrateAdminFields(archetype);
            return;
        }

        setTooltipText(tipText('tip.generating', 'Building beginner tooltip from local data...'));
        setSourceLabel(tipText('tip.sourceGenerating', 'Generating...'));

        try {
            const generated = await generateTooltip(archetype);
            if (getSelectedArchetype() !== archetype) return;
            setTooltipText(generated.text);
            setSourceLabel(generated.source);
            hydrateAdminFields(archetype);
        } catch (error) {
            console.error('[Tooltip] render failed:', error);
            setTooltipText(tipText('tip.error', 'Could not generate tooltip right now.'));
            setSourceLabel(tipText('tip.sourceError', 'Generation error'));
            hydrateAdminFields(archetype);
        }
    }

    async function persistOverridesRemote(overrides) {
        const user = window.auth && window.auth.currentUser;
        if (!user || !window.db || typeof window.db.collection !== 'function') return;

        try {
            await window.db
                .collection('users')
                .doc(user.uid)
                .collection(REMOTE_OVERRIDES_COLLECTION)
                .doc(REMOTE_OVERRIDES_DOC)
                .set({
                    tooltips: overrides,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
        } catch (error) {
            console.warn('[Tooltip] Remote override save failed:', error);
        }
    }

    async function saveArchetypeTooltipOverride() {
        const els = getTooltipElements();
        const archetype = normalize(els.adminArchetype && els.adminArchetype.value ? els.adminArchetype.value : getSelectedArchetype());
        const text = normalize(els.adminText ? els.adminText.value : '');

        if (!archetype) {
            showToast(tipText('tip.adminNeedArchetype', 'Choose an archetype first.'), 'warning');
            return;
        }

        if (!text) {
            showToast(tipText('tip.adminNeedText', 'Please enter override text.'), 'warning');
            return;
        }

        const overrides = getOverrides();
        overrides[archetype] = text;
        setOverrides(overrides);
        await persistOverridesRemote(overrides);

        showToast(tipText('tip.adminSaved', 'Tooltip override saved.'), 'success');
        lastRenderedArchetype = '';
        renderArchetypeTooltip();
    }

    async function resetArchetypeTooltipOverride() {
        const els = getTooltipElements();
        const archetype = normalize(els.adminArchetype && els.adminArchetype.value ? els.adminArchetype.value : getSelectedArchetype());

        if (!archetype) {
            showToast(tipText('tip.adminNeedArchetype', 'Choose an archetype first.'), 'warning');
            return;
        }

        const overrides = getOverrides();
        if (!overrides[archetype]) {
            showToast(tipText('tip.adminAlreadyDefault', 'No override found for this archetype.'), 'info');
            return;
        }

        delete overrides[archetype];
        setOverrides(overrides);
        await persistOverridesRemote(overrides);

        if (els.adminText) els.adminText.value = '';
        showToast(tipText('tip.adminReset', 'Tooltip override reset.'), 'success');
        lastRenderedArchetype = '';
        renderArchetypeTooltip();
    }

    function attachHooks() {
        const select = document.getElementById('currentMetaDeckSelect');
        if (select && !select.__tooltipHooked) {
            select.addEventListener('change', () => {
                lastRenderedArchetype = '';
                renderArchetypeTooltip();
            });
            select.__tooltipHooked = true;
        }

        const els = getTooltipElements();
        if (els.adminArchetype && !els.adminArchetype.__tooltipAdminHooked) {
            els.adminArchetype.addEventListener('change', () => {
                const overrides = getOverrides();
                const archetype = normalize(els.adminArchetype.value);
                if (els.adminText) els.adminText.value = overrides[archetype] ? String(overrides[archetype]) : '';
            });
            els.adminArchetype.__tooltipAdminHooked = true;
        }
    }

    function attachAuthHooks() {
        if (window.__tooltipAuthHooksAttached) return;
        window.__tooltipAuthHooksAttached = true;

        const originalSignedIn = window.onUserSignedIn;
        if (typeof originalSignedIn === 'function') {
            window.onUserSignedIn = async function(user) {
                originalSignedIn(user);
                overridesHydratedUserId = '';
                await loadOverridesRemoteForUser(true);
                lastRenderedArchetype = '';
                renderArchetypeTooltip();
            };
        }

        const originalSignedOut = window.onUserSignedOut;
        if (typeof originalSignedOut === 'function') {
            window.onUserSignedOut = function() {
                originalSignedOut();
                overridesHydratedUserId = '';
                lastRenderedArchetype = '';
                renderArchetypeTooltip();
            };
        }
    }

    async function initArchetypeTooltips() {
        attachHooks();
        attachAuthHooks();
        await loadOverridesRemoteForUser(false);
        renderArchetypeTooltip();
    }

    function importGeneratedTooltips() {
        const generated = {
            "Dragapult Meowth": "Dragapult ex nutzt Phantom Dive (200 Schaden + 3× 30 auf die Bank) als Hauptangriff. Meowth münzt die Bankmarken in KOs um: Flying Entry (beim Aufsetzen 2 Marken → 60) und Pay Day liefern Chip-Damage. Typischer Spielplan: T2 Phantom Dive auf den aktiven Gegner, Schadensmarken auf 2–3 Bankpokémon verteilen, dann mit Meowth oder erneutem Phantom Dive die geschwächten Pokémon aufräumen. Achte darauf, die 30er-Marken so zu platzieren, dass du nächste Runde möglichst viele Knock-outs erreichst. Die Stärke des Decks liegt in der Flächenkontrolle – du zwingst den Gegner, seine Bank zu schützen, während dein Hauptangreifer vorne Druck macht.",
            "Mega Lucario Hariyama": "Mega Lucario ist ein reines Angriffsdeck: Lucario ex trifft hart (Aura Sphere: 160 + 30 Bank), und Hariyama liefert mit Slap Down massive Durchschlagskraft. Das Deck setzt auf schnelle Energiebeschleunigung (z. B. über Unterstützerkarten oder Stadien) und will ab T2 jeden Zug ein Knock-out landen. Spielplan: Lucario früh angreifen lassen, Bankschaden verteilen, Hariyama als Closer nachlegen. Die Stärke liegt in der konstant hohen Schadensausgabe und einfachen Strategie – kein kompliziertes Setup, einfach angreifen und tauschen. Schwäche: wenig Erholung, wenn der Angreifer fällt.",
            "Dragapult Dusknoir": "Dragapult ex verteilt mit Phantom Dive Flächenschaden (200 + 3× 30 auf die Bank), während Dusknoir mit Cursed Blast gezielt geschwächte Bankpokémon eliminiert. Spielplan: Phantom Dive aufbauen, Schadensmarken strategisch auf die Bank verteilen, dann Dusknoir einsetzen, um die angesammelten Marken in Knock-outs umzuwandeln. Die Synergie liegt darin, dass Dragapult den Schaden vorbereitet und Dusknoir ihn verwertet. Achte darauf, die Marken nicht zu streuen, sondern gezielt auf 2–3 Ziele zu konzentrieren. Das Deck kontrolliert das Spiel über Bankdruck und bestraft Gegner, die zu viele Pokémon aufbauen.",
            "Zoroark Darmanitan": "Zoroark nutzt seine Wandlungsfähigkeit (Illusion-Ability), um als Kopie gegnerischer oder eigener Pokémon anzugreifen, während Darmanitan als Glaskanone massive Einmal-Treffer (OHKOs) liefert. Spielplan: Zoroark flexibel einsetzen – je nach Matchup kopiert es den besten verfügbaren Angriff. Darmanitan kommt rein, wenn ein großer Knock-out nötig ist. Das Deck lebt von Überraschungsmomenten und Anpassungsfähigkeit. Stärke: unberechenbar für den Gegner, hoher Burst-Schaden. Schwäche: beide Angreifer sind fragil – wenn der Gegner schneller zuschlägt, fehlt die Erholung. Tipp: Immer einen Backup-Angreifer auf der Bank vorbereiten."
        };

        const existing = getOverrides();
        let added = 0;
        let skipped = 0;
        for (const [archetype, text] of Object.entries(generated)) {
            if (existing[archetype]) {
                skipped++;
            } else {
                existing[archetype] = text;
                added++;
            }
        }
        setOverrides(existing);
        console.log(`[importGeneratedTooltips] Added: ${added}, Skipped (already exist): ${skipped}`);
        return { added, skipped, total: Object.keys(existing).length };
    }

    window.renderArchetypeTooltip = renderArchetypeTooltip;
    window.saveArchetypeTooltipOverride = saveArchetypeTooltipOverride;
    window.resetArchetypeTooltipOverride = resetArchetypeTooltipOverride;
    window.filterTooltipAdminArchetypes = filterTooltipAdminArchetypes;
    window.importGeneratedTooltips = importGeneratedTooltips;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initArchetypeTooltips, { once: true });
    } else {
        initArchetypeTooltips();
    }

    window.addEventListener('app:ui-ready', initArchetypeTooltips);
    document.addEventListener('languageChanged', () => {
        lastRenderedArchetype = '';
        renderArchetypeTooltip();
    });
})();
