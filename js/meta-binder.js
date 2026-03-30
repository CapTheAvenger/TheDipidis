(function () {
    'use strict';

    const META_BINDER_CACHE_KEY = 'metaBinderCacheV1';

    function mbText(key, fallback) {
        if (typeof t === 'function') {
            const translated = t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    // ── Gather top archetype names from the <select> dropdowns ──
    function getTopArchetypesFromSelect(selectId, limit) {
        const select = document.getElementById(selectId);
        if (!select) return [];
        return Array.from(select.querySelectorAll('option'))
            .map(o => String(o.value || '').trim())
            .filter(Boolean)
            .slice(0, limit);
    }

    // ── Gather cards for one archetype from available analysis data ──
    function getCardsForArchetype(archetype) {
        // Try current meta analysis data first, then city league
        const sources = [
            window.currentMetaAnalysisData,
            window.cityLeagueAnalysisData
        ];

        for (const data of sources) {
            if (!Array.isArray(data)) continue;
            const cards = data.filter(row =>
                String(row.archetype || '').trim().toLowerCase() === archetype.toLowerCase()
            );
            if (cards.length > 0) return cards;
        }

        // Fallback: tournament cards data
        if (Array.isArray(window.currentMetaTournamentCardsData)) {
            const cards = window.currentMetaTournamentCardsData.filter(row => {
                const rowArch = typeof normalizeCurrentMetaTournamentArchetypeName === 'function'
                    ? normalizeCurrentMetaTournamentArchetypeName(row.archetype)
                    : String(row.archetype || '').trim();
                return rowArch.toLowerCase() === archetype.toLowerCase();
            });
            if (cards.length > 0) return cards;
        }
        return [];
    }

    // ── Build canonical cardId matching collection format ──
    function buildCardId(name, set, number) {
        return `${String(name || '').trim()}|${String(set || '').trim()}|${String(number || '').trim()}`;
    }

    // ── Core: collect max card counts across all target decks ──
    function collectBinderCards(archetypes) {
        // Map<cardId, { name, set, number, maxCount, decks: string[] }>
        const binderMap = new Map();

        archetypes.forEach(archetype => {
            const rows = getCardsForArchetype(archetype);
            // Deduplicate by card_name within this archetype (take highest max_count)
            const deckCardMap = new Map();
            rows.forEach(row => {
                const name = String(row.card_name || row.full_card_name || '').trim();
                const set = String(row.set_code || row.set || '').trim();
                const number = String(row.set_number || row.number || '').trim();
                if (!name) return;
                const key = `${name}|${set}|${number}`;
                const count = parseInt(row.max_count || row.count || 0, 10);
                const existing = deckCardMap.get(key);
                if (!existing || count > existing.count) {
                    deckCardMap.set(key, { name, set, number, count });
                }
            });

            deckCardMap.forEach(({ name, set, number, count }, key) => {
                const cardId = buildCardId(name, set, number);
                const entry = binderMap.get(cardId);
                if (entry) {
                    entry.maxCount = Math.max(entry.maxCount, count);
                    entry.decks.push(archetype);
                } else {
                    binderMap.set(cardId, {
                        name, set, number,
                        maxCount: count,
                        decks: [archetype]
                    });
                }
            });
        });

        return binderMap;
    }

    // ── Delta: compare with collection and cached previous binder ──
    function computeDelta(binderMap) {
        const collection = window.userCollection || new Set();
        const collectionCounts = window.userCollectionCounts || new Map();

        // Load previous binder from cache
        let previousIds = new Set();
        try {
            const cached = JSON.parse(localStorage.getItem(META_BINDER_CACHE_KEY) || '[]');
            previousIds = new Set(cached);
        } catch (_) { /* ignore */ }

        const results = [];
        binderMap.forEach((entry, cardId) => {
            const owned = collectionCounts.get(cardId) || 0;
            const needed = entry.maxCount;
            const missing = Math.max(0, needed - owned);
            const wasInPrevious = previousIds.has(cardId);
            results.push({
                cardId,
                name: entry.name,
                set: entry.set,
                number: entry.number,
                maxCount: needed,
                owned,
                missing,
                isNew: !wasInPrevious,
                decks: entry.decks
            });
        });

        // Cards that were in the previous binder but no longer needed
        const currentIds = new Set(binderMap.keys());
        const droppedCards = [];
        previousIds.forEach(oldId => {
            if (!currentIds.has(oldId)) {
                const [name, set, number] = oldId.split('|');
                droppedCards.push({ cardId: oldId, name: name || oldId, set: set || '', number: number || '' });
            }
        });

        // Save current binder as new cache
        localStorage.setItem(META_BINDER_CACHE_KEY, JSON.stringify(Array.from(binderMap.keys())));

        return { cards: results, droppedCards };
    }

    // ── Look up card image URL from the allCardsDatabase ──
    function findCardImage(name, set, number) {
        if (typeof window.getIndexedCardBySetNumber === 'function') {
            const card = window.getIndexedCardBySetNumber(set, number)
                || window.getIndexedCardBySetNumber(set, String(parseInt(number, 10) || number));
            if (card && card.image_url) return card.image_url;
        }
        const allCards = window.allCardsDatabase || [];
        const found = allCards.find(c =>
            c.name === name && c.set === set && String(c.number) === String(number)
        );
        return found ? (found.image_url || found.image || '') : '';
    }

    // ── Render ──
    function renderMetaBinder(delta) {
        const grid = document.getElementById('metaBinderGrid');
        const statsEl = document.getElementById('metaBinderStats');
        const deltaEl = document.getElementById('metaBinderDelta');
        if (!grid) return;

        const { cards, droppedCards } = delta;
        const totalUnique = cards.length;
        const totalCopies = cards.reduce((s, c) => s + c.maxCount, 0);
        const missingUnique = cards.filter(c => c.missing > 0).length;
        const missingCopies = cards.reduce((s, c) => s + c.missing, 0);
        const ownedComplete = cards.filter(c => c.missing === 0).length;

        // Stats bar
        if (statsEl) {
            statsEl.classList.remove('display-none');
            statsEl.innerHTML = `
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalUnique}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.uniqueCards', 'Unique Cards')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value">${totalCopies}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.totalCopies', 'Total Copies')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-green">${ownedComplete}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.complete', 'Complete')}</span>
                </div>
                <div class="meta-binder-stat">
                    <span class="meta-binder-stat-value meta-binder-stat-red">${missingUnique} / ${missingCopies}</span>
                    <span class="meta-binder-stat-label">${mbText('mb.missing', 'Missing (Cards / Copies)')}</span>
                </div>`;
        }

        // Dropped cards delta info
        if (deltaEl) {
            if (droppedCards.length > 0) {
                deltaEl.classList.remove('display-none');
                const droppedNames = droppedCards.map(c => escapeHtml(c.name)).join(', ');
                deltaEl.innerHTML = `<p class="meta-binder-delta-text">
                    <span class="meta-binder-delta-badge meta-binder-delta-dropped">${mbText('mb.dropped', 'Dropped')}</span>
                    ${mbText('mb.droppedInfo', 'No longer in top meta decks:')} ${droppedNames}
                </p>`;
            } else {
                deltaEl.classList.add('display-none');
            }
        }

        // Enable action buttons if there are missing cards
        const wishlistBtn = document.getElementById('metaBinderAddWishlist');
        const proxyBtn = document.getElementById('metaBinderSendProxy');
        if (wishlistBtn) wishlistBtn.disabled = missingCopies === 0;
        if (proxyBtn) proxyBtn.disabled = missingCopies === 0;

        // Sort: missing first, then by deck count desc, then alphabetical
        const sorted = [...cards].sort((a, b) => {
            const aMiss = a.missing > 0 ? 0 : 1;
            const bMiss = b.missing > 0 ? 0 : 1;
            if (aMiss !== bMiss) return aMiss - bMiss;
            if (b.decks.length !== a.decks.length) return b.decks.length - a.decks.length;
            return a.name.localeCompare(b.name);
        });

        if (sorted.length === 0) {
            grid.innerHTML = `<p class="color-grey">${mbText('mb.empty', 'No meta card data found. Make sure Current Meta or City League data is loaded.')}</p>`;
            return;
        }

        grid.innerHTML = sorted.map(card => {
            const imageUrl = findCardImage(card.name, card.set, card.number);
            const statusClass = card.missing > 0 ? 'meta-binder-card-missing' : 'meta-binder-card-owned';
            const newBadge = card.isNew ? `<span class="meta-binder-badge-new">${mbText('mb.new', 'NEW')}</span>` : '';
            const safeImage = escapeHtml(imageUrl);
            const safeName = escapeHtml(card.name);
            const deckList = card.decks.map(d => escapeHtml(d)).join(', ');
            const countLabel = card.missing > 0
                ? `<span class="meta-binder-count-missing">${card.owned}/${card.maxCount}</span>`
                : `<span class="meta-binder-count-ok">${card.owned}/${card.maxCount} ✓</span>`;

            return `
                <div class="meta-binder-card ${statusClass}" title="${safeName} — ${deckList}">
                    ${imageUrl
                        ? `<img src="${safeImage}" alt="${safeName}" class="meta-binder-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                           <div class="meta-binder-card-fallback" style="display:none">${safeName}</div>`
                        : `<div class="meta-binder-card-fallback">${safeName}<br><small>${escapeHtml(card.set)} ${escapeHtml(card.number)}</small></div>`}
                    <div class="meta-binder-card-info">
                        ${newBadge}
                        <span class="meta-binder-card-need">${card.maxCount}x</span>
                        ${countLabel}
                    </div>
                </div>`;
        }).join('');
    }

    // ── Main: build the binder ──
    function buildMetaBinder() {
        const currentMetaArchetypes = getTopArchetypesFromSelect('currentMetaDeckSelect', 20);
        const cityLeagueArchetypes = getTopArchetypesFromSelect('cityLeagueDeckSelect', 10);

        // Merge, deduplicate
        const seen = new Set();
        const allArchetypes = [];
        [...currentMetaArchetypes, ...cityLeagueArchetypes].forEach(name => {
            const lower = name.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                allArchetypes.push(name);
            }
        });

        if (allArchetypes.length === 0) {
            showToast(mbText('mb.noData', 'No meta data loaded yet. Please visit Current Meta or City League first.'), 'warning');
            return;
        }

        const binderMap = collectBinderCards(allArchetypes);
        if (binderMap.size === 0) {
            showToast(mbText('mb.noCards', 'No card data found for the selected archetypes.'), 'warning');
            return;
        }

        const delta = computeDelta(binderMap);

        // Store on window for the action buttons
        window._metaBinderDelta = delta;

        renderMetaBinder(delta);
        showToast(mbText('mb.generated', 'Meta Binder generated!'), 'success');
    }

    // ── Quick-Action: Add missing to wishlist ──
    function metaBinderAddMissingToWishlist() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        if (!window.auth?.currentUser) {
            showToast(mbText('mb.signInRequired', 'Please sign in to use this feature.'), 'warning');
            return;
        }

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            showToast(mbText('mb.nothingMissing', 'All cards are already in your collection!'), 'info');
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

        showToast(mbText('mb.wishlistDone', '{count} cards added to wishlist.').replace('{count}', String(added)), 'success');
    }

    // ── Quick-Action: Send missing to proxy printer ──
    function metaBinderSendMissingToProxy() {
        const delta = window._metaBinderDelta;
        if (!delta || !delta.cards) return;

        const missingCards = delta.cards.filter(c => c.missing > 0);
        if (missingCards.length === 0) {
            showToast(mbText('mb.nothingMissing', 'All cards are already in your collection!'), 'info');
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
        showToast(mbText('mb.proxyDone', '{count} cards sent to Proxy Printer.').replace('{count}', String(totalAdded)), 'success');
    }

    // ── Expose ──
    window.buildMetaBinder = buildMetaBinder;
    window.metaBinderAddMissingToWishlist = metaBinderAddMissingToWishlist;
    window.metaBinderSendMissingToProxy = metaBinderSendMissingToProxy;
})();
