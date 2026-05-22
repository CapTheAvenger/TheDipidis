// @ts-check
/**
 * Inline Init - Extracted from index.html inline <script> blocks
 * to allow removing 'unsafe-inline' from Content-Security-Policy.
 */

window.CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";

function toggleMenuCluster(clusterId) {
    const submenu = document.getElementById('menu-submenu-' + clusterId);
    const trigger = document.getElementById('menu-group-' + clusterId);
    if (!submenu || !trigger) return;

    const isOpen = submenu.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(isOpen));
}

function syncMenuClustersForTab(tabId) {
    // The "Meta & Tier Lists" cluster expands when any of its
    // sub-items is active.
    const metaTabs = new Set([
        'city-league', 'city-league-analysis',
        'current-meta', 'current-analysis', 'past-meta',
    ]);
    const metaSubmenu = document.getElementById('menu-submenu-meta');
    const metaGroup = document.getElementById('menu-group-meta');

    if (metaSubmenu && metaGroup) {
        const shouldOpen = metaTabs.has(tabId);
        metaSubmenu.classList.toggle('open', shouldOpen);
        metaGroup.setAttribute('aria-expanded', String(shouldOpen));
    }
}

function toggleMainMenu() {
    document.getElementById('mainMenuDropdown').classList.toggle('show');
    document.getElementById('mainMenuTrigger').classList.toggle('open');
}

function switchTabAndUpdateMenu(tabId) {
    if (typeof switchTab === 'function') {
        switchTab(tabId);
    }

    // Defensive backup: if switchTab somehow didn't activate the target
    // tab (e.g. older bundle, race during init), force-show the target
    // and hide siblings so the menu click never silently no-ops on a
    // visually wrong tab. Verified target-vs-sibling so we don't re-toggle
    // a correctly-active tab.
    const target = document.getElementById(tabId);
    if (target && target.classList.contains('tab-content') && !target.classList.contains('active')) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        target.classList.add('active');
    }

    document.querySelectorAll('.menu-item[data-tab-id]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('menu-btn-' + tabId);
    const badge = document.getElementById('current-tab-title');
    if (activeBtn) {
        activeBtn.classList.add('active');
        const labelEl = activeBtn.querySelector('.menu-item-label');
        const text = labelEl ? labelEl.textContent.trim() : activeBtn.innerText.trim();
        if (badge) badge.innerText = text;
    }
    if (badge) badge.style.display = '';

    syncMenuClustersForTab(tabId);

    const menuDd = document.getElementById('mainMenuDropdown');
    const menuTr = document.getElementById('mainMenuTrigger');
    if (menuDd) menuDd.classList.remove('show');
    if (menuTr) menuTr.classList.remove('open');
}

// Header shortcut: jump straight to a profile sub-tab (My Decks, Wishlist, …)
// without forcing the user to first open the profile and then click the
// sub-tab pill. switchProfileTab is defined in firebase-collection.js and
// loaded later, so we wait one rAF for the profile DOM to be visible
// before activating the sub-tab — otherwise the .profile-tab-content show
// runs against an unrendered tree.
function openProfileSection(subTab) {
    switchTabAndUpdateMenu('profile');
    requestAnimationFrame(() => {
        if (typeof switchProfileTab === 'function') {
            switchProfileTab(subTab);
        }
    });
}

document.addEventListener('click', function(e) {
    const menu    = document.getElementById('mainMenuDropdown');
    const trigger = document.getElementById('mainMenuTrigger');
    if (menu && trigger && menu.classList.contains('show')) {
        const target = /** @type {Node | null} */ (e.target);
        if (!menu.contains(target) && !trigger.contains(target)) {
            menu.classList.remove('show');
            trigger.classList.remove('open');
        }
    }
});

document.addEventListener('languageChanged', function() {
    const activeBtn = document.querySelector('.menu-item.active[data-tab-id]');
    const badge = document.getElementById('current-tab-title');
    const labelEl = activeBtn ? activeBtn.querySelector('.menu-item-label') : null;
    if (activeBtn && badge) badge.innerText = labelEl ? (labelEl.textContent || '').trim() : /** @type {HTMLElement} */ (activeBtn).innerText.trim();
});

// ── Deep-linking via URL hash ────────────────────────────────
// Users arriving via share-links like https://thedipidis.app/#tutorial
// should land directly on that tab. Also supports friendlier aliases
// in both languages so we can share URLs that read naturally.
(function setupHashDeepLink() {
    // Aliases that point to a legacy meta tab. These route directly to
    // the tab IDs — no reparenting, no store pivot needed.
    const META_ALIASES = {
        'city-league': 'city-league',
        'current-meta': 'current-meta',
        'past-meta': 'past-meta',
    };
    const HASH_ALIASES = {
        'tutorial':          'tutorial',
        'how-to-use':        'tutorial',
        'howto':             'tutorial',
        'help':              'tutorial',
        'hilfe':             'tutorial',
        'anleitung':         'tutorial',
        'city-league':       'city-league',
        'current-meta':      'current-meta',
        'past-meta':         'past-meta',
        'cards':             'cards',
        'proxy':             'proxy',
        'playtester':        'sandbox',
        'sandbox':           'sandbox',
        'calculator':        'calculator',
        'probability':       'calculator',
        'wahrscheinlichkeit':'calculator',
        'profile':           'profile',
    };
    // Profile sub-section aliases. Route to #profile + the named
    // sub-tab via openProfileSection() rather than to a top-level
    // tab — Battle Journal / Meta Call / Testing Groups are
    // sub-sections of the Profile tab, not standalone tabs.
    const PROFILE_SECTION_ALIASES = {
        'metacall':       'metacall',
        'meta-call':      'metacall',
        'journal':        'journal',
        'battle-journal': 'journal',
        'testinggroups':  'testinggroups',
        'testing-groups': 'testinggroups',
    };

    function applyHash() {
        const raw = (window.location.hash || '').replace(/^#/, '').toLowerCase().trim();
        if (!raw) return;

        // Profile sub-section deep-links (#metacall, #journal,
        // #testinggroups and variants).
        if (PROFILE_SECTION_ALIASES[raw]) {
            openProfileSection(PROFILE_SECTION_ALIASES[raw]);
            return;
        }

        // Legacy meta-tab hash aliases (#current-meta, #city-league,
        // #past-meta) route directly to the legacy tab.
        if (META_ALIASES[raw]) {
            const tabId = META_ALIASES[raw];
            if (typeof switchTabAndUpdateMenu === 'function') {
                switchTabAndUpdateMenu(tabId);
            } else if (typeof switchTab === 'function') {
                switchTab(tabId);
            }
            return;
        }

        const tabId = HASH_ALIASES[raw];
        if (!tabId) return;
        if (typeof switchTabAndUpdateMenu === 'function') {
            switchTabAndUpdateMenu(tabId);
        } else if (typeof switchTab === 'function') {
            switchTab(tabId);
        }
    }

    // Fire once on initial load, after the app is ready
    if (window.__appResourcesSettled) {
        applyHash();
    } else {
        window.addEventListener('app:ui-ready', applyHash, { once: true });
    }

    // Also respond to hash changes while the user is already on the page
    window.addEventListener('hashchange', applyHash);
})();

// Wrap all DOM event logic in DOMContentLoaded for safety
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // All event listeners and DOM manipulations above this line should be moved here for safety if needed
    });
}
