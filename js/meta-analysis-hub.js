// @ts-check
// Meta & Deck Analysis Hub
// Provides a unified entry point for the meta/deck-analysis sub-tabs.
// - Mode 1 (Entry State): tile grid, shown when the hub tab is opened from the top nav.
// - Mode 2 (Active State): selected sub-tab with persistent sub-nav at the top.

(function () {
    'use strict';

    // Meta Call lives inside the Profile top-level tab as a sub-section,
    // not as a standalone top-level tab. The `profileSubTab` field tells
    // enterSubTab() to first switch to Profile, then activate the
    // profile sub-tab via switchProfileTab(). All other tiles still
    // map 1:1 to a top-level tab via switchTab().
    const SUB_TABS = [
        { id: 'city-league',          tileKey: 'cityLeague' },
        { id: 'city-league-analysis', tileKey: 'cityLeagueAnalysis' },
        { id: 'current-meta',         tileKey: 'currentMeta' },
        { id: 'current-analysis',     tileKey: 'currentMetaAnalysis' },
        { id: 'past-meta',            tileKey: 'pastMeta' },
        { id: 'meta-call',            tileKey: 'metaCall', topTab: 'profile', profileSubTab: 'metacall' }
    ];

    const SUB_NAV_HOST_ID = 'metaHubSubNavHost';

    function t(key, fallback) {
        if (typeof window.t === 'function') {
            const val = window.t(key);
            if (val && val !== key) return val;
        }
        return fallback;
    }

    function getTileBullets(tileKey) {
        // i18n returns either an array (preferred) or a comma-separated string;
        // fall back to English defaults if the key is missing.
        const fallbacks = {
            cityLeague: [
                'Aktuelle Meta-Verteilung aus japanischen Cardshop-Turnieren',
                'Wöchentliche Trends und Tier-Bewegungen',
                'Schnellster Frühindikator vor internationalen Major-Turnieren'
            ],
            cityLeagueAnalysis: [
                'Tiefenanalyse einzelner Decks aus der City League',
                'Karten-Verteilung, Standard-Listen und häufige Tech-Picks',
                'Matchup-Win-Rates aus japanischen Turnieren'
            ],
            currentMeta: [
                'Online-Turnier-Auswertung von play.limitlesstcg.com',
                'Top-8 / Top-16-Conversion pro Deck',
                'Globale Sicht, näher am EU/US-Wettbewerbsumfeld'
            ],
            currentMetaAnalysis: [
                'Tiefenanalyse globaler Online-Decks',
                'Karten-Listen, Hand-Stats und Win-Rates',
                'Detail-Sicht für Spieler, die international antreten'
            ],
            pastMeta: [
                'Historische Major-Turnier-Daten (Regionals, IC, Worlds)',
                'Ergebnisse vergangener Standard-Formate',
                'Lerne aus der Geschichte für zukünftige Meta-Calls'
            ],
            metaCall: [
                'Vorhersage der Meta-Verteilung für dein nächstes Turnier',
                'Eigene Schätzungen mit Online-Daten kombinieren',
                'Erwartete Begegnungen pro Runde inkl. Matchup-Übersicht'
            ]
        };
        const key = `metaHub.tile.${tileKey}.bullets`;
        if (typeof window.t === 'function') {
            const val = window.t(key);
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val !== key && val.includes('|')) {
                return val.split('|').map(s => s.trim()).filter(Boolean);
            }
        }
        return fallbacks[tileKey] || [];
    }

    function renderTiles() {
        const grid = document.getElementById('metaHubTileGrid');
        if (!grid) return;

        const html = SUB_TABS.map(({ id, tileKey }) => {
            const titleKey = `metaHub.tile.${tileKey}.title`;
            const fallbackTitle = t(`tab.${tileKey}`, id);
            const title = t(titleKey, fallbackTitle);
            const bullets = getTileBullets(tileKey);
            const bulletsHtml = bullets
                .map(b => `<li>${escapeHtml(b)}</li>`)
                .join('');
            return `
                <button type="button" class="meta-hub-tile" data-sub-tab="${id}" aria-label="${escapeHtml(title)}">
                    <span class="meta-hub-tile-title">${escapeHtml(title)}</span>
                    <ul class="meta-hub-tile-bullets">${bulletsHtml}</ul>
                </button>
            `;
        }).join('');

        grid.innerHTML = html;

        grid.querySelectorAll('.meta-hub-tile').forEach(btn => {
            btn.addEventListener('click', () => {
                const subTabId = btn.getAttribute('data-sub-tab');
                if (subTabId) enterSubTab(subTabId);
            });
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureSubNavHost(targetTabEl) {
        if (!targetTabEl) return null;
        let host = targetTabEl.querySelector(`#${SUB_NAV_HOST_ID}`);
        if (host) return host;
        host = document.createElement('div');
        host.id = SUB_NAV_HOST_ID;
        host.className = 'meta-hub-subnav-host';
        targetTabEl.insertBefore(host, targetTabEl.firstChild);
        return host;
    }

    function clearAllSubNavHosts() {
        document.querySelectorAll('.meta-hub-subnav-host').forEach(el => el.remove());
    }

    function buildSubNav(activeId) {
        const backLabel = t('metaHub.backToOverview', '← Übersicht');
        const items = SUB_TABS.map(({ id, tileKey }) => {
            const label = t(`metaHub.tile.${tileKey}.title`, t(`tab.${tileKey}`, id));
            const activeClass = id === activeId ? ' active' : '';
            return `<button type="button" class="meta-hub-subnav-btn${activeClass}" data-sub-tab="${id}">${escapeHtml(label)}</button>`;
        }).join('');
        return `
            <nav class="meta-hub-subnav" aria-label="Meta &amp; Deck Analysis sub-navigation">
                <button type="button" class="meta-hub-subnav-back" id="metaHubBackBtn">${escapeHtml(backLabel)}</button>
                <div class="meta-hub-subnav-items">${items}</div>
            </nav>
        `;
    }

    // Resolve the DOM container that should host the sub-nav for a given
    // sub-tab. For top-level tabs that's the tab element itself; for the
    // Meta Call entry, which lives inside the Profile sub-tab, it's the
    // profile-metacall container.
    function _hostElementFor(subTabId) {
        const def = SUB_TABS.find(s => s.id === subTabId);
        if (def && def.profileSubTab) {
            return document.getElementById('profile-' + def.profileSubTab);
        }
        return document.getElementById(subTabId);
    }

    function injectSubNav(subTabId) {
        clearAllSubNavHosts();
        const tabEl = _hostElementFor(subTabId);
        if (!tabEl) return;
        const host = ensureSubNavHost(tabEl);
        if (!host) return;
        host.innerHTML = buildSubNav(subTabId);

        host.querySelectorAll('.meta-hub-subnav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-sub-tab');
                if (targetId && targetId !== subTabId) enterSubTab(targetId);
            });
        });

        const backBtn = host.querySelector('#metaHubBackBtn');
        if (backBtn) backBtn.addEventListener('click', exitToHub);
    }

    function setSideMenuActive(tabId) {
        document.querySelectorAll('.menu-item[data-tab-id]').forEach(btn => btn.classList.remove('active'));
        const sideBtn = document.getElementById('menu-btn-' + tabId);
        if (sideBtn) sideBtn.classList.add('active');
    }

    function enterSubTab(subTabId) {
        const def = SUB_TABS.find(s => s.id === subTabId);
        if (!def) return;
        if (def.profileSubTab) {
            // Meta Call route: switch to Profile top-level tab, then
            // activate the profile sub-tab, then inject our sub-nav at
            // the top of the profile-metacall container.
            const topTab = def.topTab || 'profile';
            if (typeof window.switchTab === 'function') {
                window.switchTab(topTab);
            }
            if (typeof window.switchProfileTab === 'function') {
                window.switchProfileTab(def.profileSubTab);
            }
            injectSubNav(subTabId);
            setSideMenuActive(topTab);
            return;
        }
        if (typeof window.switchTab === 'function') {
            window.switchTab(subTabId);
        }
        // switchTab is hooked to call injectSubNav, but call here too to be safe.
        injectSubNav(subTabId);
        setSideMenuActive(subTabId);
    }

    function exitToHub() {
        clearAllSubNavHosts();
        if (typeof window.switchTab === 'function') {
            window.switchTab('meta-analysis-hub');
        }
        // No side-menu entry for the hub itself — clear all sub-item highlights.
        document.querySelectorAll('.menu-item[data-tab-id]').forEach(btn => btn.classList.remove('active'));
    }

    function isSubTab(tabId) {
        return SUB_TABS.some(s => s.id === tabId);
    }

    function onTabSwitched(tabId) {
        if (tabId === 'meta-analysis-hub') {
            clearAllSubNavHosts();
            renderTiles();
            return;
        }
        if (isSubTab(tabId)) {
            injectSubNav(tabId);
            return;
        }
        // Switched to an unrelated tab — clean up sub-nav.
        clearAllSubNavHosts();
    }

    function refreshLanguage() {
        // Re-render tiles & any active sub-nav after a language switch.
        // For top-level sub-tabs, the host IS the .tab-content with
        // class 'active' when visible. For Meta Call, the host is
        // #profile-metacall which also carries 'active' when shown via
        // switchProfileTab. Either way, .active is the reliable marker.
        renderTiles();
        const activeSub = SUB_TABS.find(s => {
            const el = _hostElementFor(s.id);
            return el && el.classList.contains('active');
        });
        if (activeSub) injectSubNav(activeSub.id);
    }

    // Public API
    window.MetaAnalysisHub = {
        renderTiles,
        enterSubTab,
        exitToHub,
        injectSubNav,
        clearAllSubNavHosts,
        onTabSwitched,
        isSubTab,
        refreshLanguage,
        SUB_TABS
    };

    document.addEventListener('DOMContentLoaded', () => {
        renderTiles();
        // If the hub is the initially-active tab, nothing else is needed.
        // Re-render on language change.
        document.addEventListener('languageChanged', refreshLanguage);
    });
})();
