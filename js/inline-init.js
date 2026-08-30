/**
 * Inline Init - Extracted from index.html inline <script> blocks
 * to allow removing 'unsafe-inline' from Content-Security-Policy.
 */

window.CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";

/* ── Dunkelmodus umschalten ──────────────────────────────────────
 *
 * Der Zustand steht auf <html data-theme>. Gesetzt wird er zweimal:
 * einmal ganz oben in index.html, bevor die erste Stilvorlage laedt
 * (sonst blitzt es weiss), und einmal hier, wenn jemand den Knopf
 * drueckt. Gemerkt wird die Wahl in localStorage — sie schlaegt ab
 * dann die Einstellung des Betriebssystems, denn wer einmal gewaehlt
 * hat, will nicht beim naechsten Sonnenaufgang etwas anderes sehen. */
function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
    const dunkel = theme === 'dark';
    if (dunkel) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.setAttribute('aria-pressed', String(dunkel));
    try { localStorage.setItem('theme', dunkel ? 'dark' : 'light'); }
    catch (_) { /* privater Modus — die Wahl gilt dann nur diese Sitzung */ }
}

function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

// Beim Laden den Knopf auf den Zustand stellen, den das Kopf-Skript
// schon gesetzt hat.
document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
});

function toggleMenuCluster(clusterId) {
    const submenu = document.getElementById('menu-submenu-' + clusterId);
    const trigger = document.getElementById('menu-group-' + clusterId);
    if (!submenu || !trigger) return;

    const isOpen = submenu.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(isOpen));
}

const MENU_CLUSTERS = {
    meta:  ['meta-analysis-hub', 'city-league', 'city-league-analysis',
            'current-meta', 'current-analysis', 'past-meta'],
    tools: ['proxy', 'calculator'],
};

function syncMenuClustersForTab(tabId) {
    Object.entries(MENU_CLUSTERS).forEach(([cluster, tabs]) => {
        const submenu = document.getElementById('menu-submenu-' + cluster);
        const group = document.getElementById('menu-group-' + cluster);
        if (!submenu || !group) return;
        const shouldOpen = tabs.indexOf(tabId) !== -1;
        submenu.classList.toggle('open', shouldOpen);
        group.setAttribute('aria-expanded', String(shouldOpen));
    });
}

function toggleMainMenu() {
    const drop = document.getElementById('mainMenuDropdown');
    const trig = document.getElementById('mainMenuTrigger');
    const open = drop.classList.toggle('show');
    trig.classList.toggle('open', open);
    // aria-expanded stand fest auf "false" im Markup und wurde nie
    // nachgezogen. Ein Menue, das sich nicht ansagt, ist fuer eine
    // Sprachausgabe dauerhaft geschlossen.
    trig.setAttribute('aria-expanded', String(open));
}

// Der Pokeball ist ein div mit onclick. Bis zum 18.08.2026 hatte er
// weder tabindex noch role — gemessen: 19 Tabstopps auf der Startseite,
// der Pokeball in keinem davon. Auf dem Telefon fuehrt er als einziger
// Weg zu Side Quest, Anleitung, Druckliste, Rechner und Profil; die
// untere Leiste kennt nur fuenf Ziele. Wer nicht zeigen kann, sondern
// tippt, fuer den existierten diese fuenf Bereiche schlicht nicht.
//
// Markup traegt jetzt role="button" tabindex="0"; ein Knopf muss auf
// Enter UND Leertaste reagieren, sonst ist die Rolle eine Behauptung.
document.addEventListener('DOMContentLoaded', function () {
    const trig = document.getElementById('mainMenuTrigger');
    if (!trig) return;
    trig.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();          // sonst scrollt die Leertaste die Seite
        toggleMainMenu();
    });
});

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

    /* BEFUND (Schlussabnahme 30.08.2026): die Adresszeile stand bei
       jedem Ansichtswechsel still. Gemessen ueber sechs Wechsel blieb
       `history.length` konstant bei 2 und die URL bei
       "thedipidis.app/" — der Zurueck-Knopf des Browsers hat also die
       SEITE VERLASSEN statt eine Ansicht zurueckzugehen, und eine
       geoeffnete Ansicht liess sich nicht verlinken. Die Tieflinks
       (#meta-call & Co.) gab es die ganze Zeit, sie wurden nur nie
       geschrieben.
       Geschrieben wird mit pushState, nicht ueber location.hash —
       pushState loest kein hashchange aus, es kann also keine
       Schleife mit applyHash() geben. */
    if (typeof window.__dsSchreibeTabHash === 'function') {
        window.__dsSchreibeTabHash(tabId);
    }

    document.querySelectorAll('.menu-item.active').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('menu-btn-' + tabId);
    const badge = document.getElementById('current-tab-title');
    if (activeBtn) {
        activeBtn.classList.add('active');
        const labelEl = activeBtn.querySelector('.menu-item-label');
        const text = labelEl ? labelEl.textContent.trim() : activeBtn.innerText.trim();
        if (badge) badge.innerText = text;
    }
    // Hide the section badge on the Meta & Deck Analysis Hub overview —
    // the tile grid IS the navigation here, so a "CITY LEAGUE META" pill
    // next to "Pokémon TCG Hub" misled users into thinking they were
    // already inside that sub-tab.
    if (badge) badge.style.display = tabId === 'meta-analysis-hub' ? 'none' : '';

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

// Point the menu highlight + header badge at a menu entry by id. Used by
// switchProfileTab so that a profile sub-tab which has its OWN top-level
// entry (Deck Builder) owns the highlight, and every other sub-tab hands it
// back to "My Profile" — otherwise the badge kept reading "Deck Builder"
// while the user was clicking around in Wunschliste.
function setMenuHighlight(menuBtnId) {
    const btn = document.getElementById(menuBtnId);
    if (!btn) return;
    document.querySelectorAll('.menu-item.active').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const badge = document.getElementById('current-tab-title');
    if (!badge) return;
    const labelEl = btn.querySelector('.menu-item-label');
    badge.innerText = labelEl ? labelEl.textContent.trim() : btn.innerText.trim();
    badge.style.display = '';
}
window.setMenuHighlight = setMenuHighlight;

document.addEventListener('click', function(e) {
    const menu    = document.getElementById('mainMenuDropdown');
    const trigger = document.getElementById('mainMenuTrigger');
    if (menu && trigger && menu.classList.contains('show')) {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.classList.remove('show');
            trigger.classList.remove('open');
        }
    }
});

document.addEventListener('languageChanged', function() {
    // No [data-tab-id] filter: Deck Builder is a top-level entry that opens a
    // profile SUB-tab and therefore has no data-tab-id, and filtering on it
    // left the badge un-translated on that entry.
    const activeBtn = document.querySelector('.menu-item.active');
    const badge = document.getElementById('current-tab-title');
    const labelEl = activeBtn ? activeBtn.querySelector('.menu-item-label') : null;
    if (activeBtn && badge) badge.innerText = labelEl ? labelEl.textContent.trim() : activeBtn.innerText.trim();
    // Keep the badge hidden whenever the hub overview is the active tab —
    // even after a language switch reruns the badge update.
    const hubActive = !!document.querySelector('#meta-analysis-hub.tab-content.active');
    if (badge) badge.style.display = hubActive ? 'none' : '';
});

// Initial page-load state: the hub is the default landing tab via the
// `active` class baked into index.html, so neither switchTab nor
// switchTabAndUpdateMenu runs at boot — the badge would otherwise sit
// at its HTML default "City League Meta" and mislead the user.
document.addEventListener('DOMContentLoaded', function () {
    const badge = document.getElementById('current-tab-title');
    const hubActive = !!document.querySelector('#meta-analysis-hub.tab-content.active');
    if (badge && hubActive) badge.style.display = 'none';
});

// ── Deep-linking via URL hash ────────────────────────────────
// Bis Firebase antwortet, gilt: nicht angemeldet. Ohne diese Zeile
// blitzen die Sammlungsknoepfe beim Laden kurz im aktiven Zustand auf.
// js/firebase-config.js korrigiert die Klasse, sobald der Zustand steht.
try { document.documentElement.classList.add('is-signed-out'); } catch (e) {}

// Users arriving via share-links like https://thedipidis.app/#tutorial
// should land directly on that tab. Also supports friendlier aliases
// in both languages so we can share URLs that read naturally.
(function setupHashDeepLink() {
    const HASH_ALIASES = {
        'meta-call':             'meta-call',
        'metacall':              'meta-call',
        'metacall-tab':          'meta-call',
        'tutorial':              'tutorial',
        'quellen':               'quellen',
        'sources':               'quellen',
        'methodik':              'quellen',
        'method':                'quellen',
        'impressum':             'quellen',
        'how-to-use':            'tutorial',
        'howto':                 'tutorial',
        'help':                  'tutorial',
        'hilfe':                 'tutorial',
        'anleitung':             'tutorial',
        'city-league':           'city-league',
        'city-league-analysis':  'city-league-analysis',
        'current-meta':          'current-meta',
        'current-analysis':      'current-analysis',
        'deck-analysis':         'current-analysis', // friendly alias for the bot's "Auf Website öffnen" CTA
        'past-meta':             'past-meta',
        'cards':                 'cards',
        'proxy':                 'proxy',
        // The in-app playtester was retired in favour of the TCG Showdown
        // handoff, and #playtester / #sandbox kept pointing at a tab id that
        // no longer has an element. switchTab then hid every tab and showed
        // none, so a shared link landed the user on a blank page. Send them
        // to the overview and say where the playtester went.
        'playtester':            'meta-analysis-hub',
        'sandbox':               'meta-analysis-hub',
        'calculator':            'calculator',
        'probability':           'calculator',
        'wahrscheinlichkeit':    'calculator',
        'profile':               'profile',
        // HIER STANDEN 'metacall' UND 'meta-call' EIN ZWEITES MAL.
        //
        // Gefunden am 18.08.2026: dasselbe Objektliteral vergab beide
        // Schluessel doppelt — oben auf 'meta-call' (Block 7 hat den
        // Tab herausgeloest), hier unten noch einmal auf 'profile'.
        // In einem Objektliteral gewinnt der SPAETERE. thedipidis.app/#meta-call
        // landete deshalb weiter im Profil, also hinter der Anmeldewand,
        // die Block 7 gerade beseitigt hatte. Der Fix war da, er kam nur
        // nie an. Nachgemessen vorher: #meta-call -> profile.
        //
        // tests/unit/test-tieflinks.js prueft jetzt bei jedem Lauf, dass
        // kein Schluessel in dieser Tabelle zweimal vorkommt.
        'journal':               'profile',    // Battle Journal too
        // Ohne Eintrag steigt applyHash() wortlos aus und der Besucher
        // landet irgendwo. Diese drei fehlten:
        'side-quest':            'side-quest',
        'sidequest':             'side-quest',
        'champions':             'side-quest',
        'meta-analysis-hub':     'meta-analysis-hub',
        'hub':                   'meta-analysis-hub',
        'uebersicht':            'meta-analysis-hub',
        // Per-profile-sub-tab deep links — added 2026-06 so the screenshot
        // tutorial can drive directly into a specific profile sub-tab via
        // the same hash routing mechanism the Telegram bot uses for deep-
        // linking. Each one needs a matching entry in PROFILE_SUBTAB_FOR_HASH
        // below to actually fire the sub-tab switch.
        'metabinder':            'profile',
        'meta-binder':           'profile',
        'custombinder':          'profile',
        'custom-binder':         'profile',
        'testinggroups':         'profile',
        'testing-groups':        'profile',
        'wishlist':              'profile',
        'tradelist':             'profile',
        'trade-list':            'profile',
        'collection':            'profile',
    };

    // For hash aliases that target Profile, we also want to auto-switch
    // to the right sub-tab (Meta Call / Battle Journal). switchProfileTab
    // is the same function the in-page buttons use, so behaviour stays
    // identical regardless of how the user arrived.
    const PROFILE_SUBTAB_FOR_HASH = {
        // 'metacall' und 'meta-call' standen hier, seit Block 7 aber
        // gegenstandslos: Meta Call ist ein eigener Tab und kein
        // Profil-Untertab mehr.
        'journal':        'journal',
        'metabinder':     'metabinder',
        'meta-binder':    'metabinder',
        'custombinder':   'custombinder',
        'custom-binder':  'custombinder',
        'testinggroups':  'testinggroups',
        'testing-groups': 'testinggroups',
        'wishlist':       'wishlist',
        'tradelist':      'tradelist',
        'trade-list':     'tradelist',
        'collection':     'collection',
        // Die Kachelseite hatte bis zum 26.08.2026 den Menuepunkt
        // "Uebersicht". Der heisst jetzt "Startseite" und fuehrt dorthin,
        // wo die Anwendung auch startet — auf Wunsch des Nutzers, weil zwei
        // verschiedene Antworten auf "wo ist Zuhause" verwirren.
        // Damit die Kachelseite nicht unerreichbar wird (Zusage vom
        // 18.08.: "geloescht wird nichts"), behaelt sie einen Deep-Link.
        'hub':            'meta-analysis-hub',
        'uebersicht':     'meta-analysis-hub',
        'overview':       'meta-analysis-hub',
    };

    // Waehrend applyHash() laeuft, ruft es switchTabAndUpdateMenu — und
    // das wuerde den Hash zurueckschreiben, den wir gerade lesen.
    let routetGerade = false;

    function applyHash() {
        const rawFull = (window.location.hash || '').replace(/^#/, '').trim();
        if (!rawFull) return;

        // Hash can carry query-style params for pre-filtering, e.g.
        //   #current-meta?deck=Dragapult%20Dusknoir
        //   #past-meta?deck=Dragapult%20Dusknoir&format=TEF-POR
        //   #city-league?deck=Charizard%20ex
        // The Telegram bot uses this to land the user directly on the
        // archetype they just looked at in chat. Tab alias is matched
        // case-insensitive; param values keep their original casing
        // because the deck-select option values are case-sensitive
        // strings (the lookup itself is case-insensitive though).
        const qIdx = rawFull.indexOf('?');
        const rawTab = (qIdx >= 0 ? rawFull.slice(0, qIdx) : rawFull).toLowerCase();
        const tabId = HASH_ALIASES[rawTab];
        if (!tabId) return;
        // A hash that resolves to a tab id with no element in the DOM must
        // not be routed: switchTab deactivates every tab and then finds
        // nothing to activate, leaving a blank page with no way back except
        // editing the URL. Retired tabs are the way this happens.
        if (!document.getElementById(tabId)) {
            console.warn('[deep-link] no tab element for', tabId, '— ignoring hash');
            return;
        }
        const RETIRED_HASHES = { playtester: 1, sandbox: 1 };
        if (RETIRED_HASHES[rawTab] && typeof showNotification === 'function') {
            const de = typeof getLang === 'function' && getLang() === 'de';
            setTimeout(() => showNotification(de
                ? 'Der Playtester läuft jetzt extern über TCG Showdown — im Menü unter „Werkzeuge".'
                : 'The playtester now runs externally on TCG Showdown — in the menu under "Tools".',
                'info'), 600);
        }
        const params = qIdx >= 0
            ? new URLSearchParams(rawFull.slice(qIdx + 1))
            : null;
        const deck = params?.get('deck')?.trim();
        const format = params?.get('format')?.trim();

        // Past Meta has its own dedicated nav helper (set format first,
        // then poll the deck dropdown after the chunk loads). Reuse it
        // when both pieces are present — the manual fallback below
        // can't drive the format-change chunk reload reliably.
        if (tabId === 'past-meta' && deck && typeof window.navigateToPastMetaWithDeck === 'function') {
            try { window.navigateToPastMetaWithDeck(deck, format || ''); return; } catch (_e) { /* fall through */ }
        }

        // Pre-seed the pending-selection globals BEFORE switchTab fires
        // so the tab's populate*DeckSelect handler picks them up on its
        // first pass (same hook jumpToCardAnalysis uses internally).
        // The dropdown lives on the *-analysis tab — accept the overview
        // tab IDs too so links from older callers keep working.
        if (deck) {
            if (tabId === 'current-analysis' || tabId === 'current-meta') {
                window.pendingCurrentMetaDeckSelection = deck;
                window.currentMetaArchetype = deck;
            } else if (tabId === 'city-league-analysis' || tabId === 'city-league') {
                window.pendingCityLeagueDeckSelection = deck;
            }
        }

        // Merker fuer setupInitialTabLoad weiter unten: hier wurde
        // wirklich auf eine Ansicht geroutet. Der Merker ersetzt die
        // fruehere Pruefung `if (window.location.hash) return` — seit
        // die Anwendung den Hash selbst schreibt, ist "es gibt einen
        // Hash" kein Beleg mehr dafuer, dass ein Tieflink lief.
        window.__dsTieflinkGeroutet = true;
        if (typeof switchTabAndUpdateMenu === 'function') {
            switchTabAndUpdateMenu(tabId);
        } else if (typeof switchTab === 'function') {
            switchTab(tabId);
        }

        // Profile is a fan-out tab with its own sub-tab system. Aliases
        // like #metacall and #journal need that extra hop or the user
        // lands on whichever profile sub-tab was last open (Collection
        // by default). switchProfileTab itself bails on no-op cases,
        // so calling it unconditionally for known aliases is safe.
        const profileSub = PROFILE_SUBTAB_FOR_HASH[rawTab];
        if (tabId === 'profile' && profileSub && typeof window.switchProfileTab === 'function') {
            try { window.switchProfileTab(profileSub); } catch (_e) { /* tolerate */ }
        }

        // focusCard=<set>|<number> deep-link (driven by the Telegram
        // price-alert messages). Scrolls to the matching card row in
        // the wishlist / tradelist grid and flashes a highlight so
        // the user can spot which card the bot pinged about. The
        // wishlist/tradelist render is async (Firestore + cards DB
        // load), so we poll for the element to appear before giving
        // up. 5 s is plenty for a warm cache; cold loads usually
        // finish in ~2 s.
        const focusCard = params?.get('focusCard')?.trim();
        if (focusCard) {
            const tryFocus = (attempt = 0) => {
                if (attempt > 50) return; // ~5 s @ 100 ms
                const grids = (profileSub === 'tradelist')
                    ? [document.getElementById('tradelist-grid')]
                    : (profileSub === 'wishlist')
                        ? [document.getElementById('wishlist-grid')]
                        : [document.getElementById('wishlist-grid'), document.getElementById('tradelist-grid')];
                const grid = grids.find(g => g && g.children.length > 0);
                if (!grid) {
                    setTimeout(() => tryFocus(attempt + 1), 100);
                    return;
                }
                // Cards' input[aria-label] carries the card name; we
                // match by Cardmarket URL slug because both wishlist
                // + tradelist embed it in the price chip. Simpler +
                // robust to name punctuation.
                const [setCode, number] = focusCard.split('|');
                const selector = `[alt*="${number}"], [title*="${setCode} ${number}"]`;
                // Walk children, find the one whose text contains the set+number
                let target = null;
                for (const child of grid.children) {
                    const text = child.textContent || '';
                    if (text.includes(`${setCode} ${number}`)) {
                        target = child;
                        break;
                    }
                }
                if (!target) {
                    setTimeout(() => tryFocus(attempt + 1), 100);
                    return;
                }
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash highlight — 3 second amber ring
                target.style.transition = 'box-shadow 0.4s ease';
                target.style.boxShadow = '0 0 0 4px rgba(255, 203, 5, 0.85), 0 4px 18px rgba(15, 23, 42, 0.18)';
                setTimeout(() => {
                    target.style.boxShadow = '';
                }, 3000);
            };
            setTimeout(() => tryFocus(0), 400);
        }
    }

    // ── Adresszeile und Verlauf ─────────────────────────────────
    // Nur Kennungen, die in HASH_ALIASES auf sich selbst zeigen, sind
    // eine kanonische Schreibweise. Alles andere (Kurzformen wie
    // 'hub', 'journal', 'deck-analysis') bleibt lesbar, wird aber
    // nicht geschrieben — sonst haette dieselbe Ansicht zwei URLs.
    function kanonischerHash(tabId) {
        if (!tabId || HASH_ALIASES[tabId] !== tabId) return null;
        return tabId;
    }

    function schreibeHash(tabId, ersetzen) {
        if (routetGerade) return;          // applyHash ruft switchTab — nicht zurueckschreiben
        const h = kanonischerHash(tabId);
        if (!h) return;
        const ziel = window.location.pathname + window.location.search + '#' + h;
        if (window.location.hash === '#' + h && !ersetzen) return;
        try {
            if (ersetzen) window.history.replaceState({ tab: h }, '', ziel);
            else window.history.pushState({ tab: h }, '', ziel);
        } catch (_e) { /* file:// und aehnliche Faelle: lieber nichts als ein Absturz */ }
    }
    window.__dsSchreibeTabHash = schreibeHash;

    function routeMitSperre() {
        routetGerade = true;
        try { applyHash(); } finally { routetGerade = false; }
    }

    // Damit der erste Verlaufseintrag schon eine Ansicht benennt. Ohne
    // ihn fuehrt der erste Zurueck-Schritt auf eine URL ohne Hash, und
    // applyHash haette nichts, worauf es zeigen koennte.
    function stempleStartansicht() {
        if (window.location.hash) return;
        const aktiv = document.querySelector('.tab-content.active');
        if (aktiv && aktiv.id) schreibeHash(aktiv.id, true);
    }

    // Fire once on initial load, after the app is ready
    if (window.__appResourcesSettled) {
        routeMitSperre();
        stempleStartansicht();
    } else {
        window.addEventListener('app:ui-ready', function () {
            routeMitSperre();
            stempleStartansicht();
        }, { once: true });
    }

    // Also respond to hash changes while the user is already on the page
    window.addEventListener('hashchange', routeMitSperre);

    // Zurueck/Vorwaerts im Browser. pushState allein aendert die Ansicht
    // nicht zurueck — ohne diesen Zuhoerer stuende nach einem Zurueck
    // die alte URL ueber der neuen Ansicht.
    window.addEventListener('popstate', function () {
        if (window.location.hash) { routeMitSperre(); return; }
        // Kein Hash mehr: zurueck auf die Ansicht, mit der die
        // Anwendung startet, statt auf der letzten stehenzubleiben.
        const start = document.getElementById('current-meta') ? 'current-meta' : null;
        if (!start || typeof switchTabAndUpdateMenu !== 'function') return;
        routetGerade = true;
        try { switchTabAndUpdateMenu(start); } finally { routetGerade = false; }
    });
})();

// ── Initial-page-load data trigger ──────────────────────────
// PR #168 batch 1 removed js/modules/meta-view/bootstrap.js (whose
// init() used to call switchTab('current-meta') on DOMContentLoaded)
// and made <div id="current-meta"> the HTML default-active tab. But
// data-loading for the active tab only happens inside the switch-case
// in app-core.js's switchTab(). With no boot-time switchTab() call,
// the default-landing tab renders but its loader (loadCurrentMeta /
// loadCityLeagueData / loadPastMeta / …) never fires — the user sees
// the tab header and empty skeleton cards forever.
//
// This is the missing bootstrap step: re-fire switchTab() on the
// already-active tab once the app is ready. Gated on hash so it
// doesn't fight the hash deep-link handler above — that branch
// already runs switchTab(target) for the deep-linked tab.
//
// Note: switchTab() removes 'active' from all tabs then re-adds it
// to the target — that briefly toggles, but since target === already
// active there's no visible flicker. The win is the loader switch-case
// firing once.
(function setupInitialTabLoad() {
    function triggerInitialTabLoad() {
        if (window.__dsTieflinkGeroutet) return;  // hash branch already ran switchTab
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || !activeTab.id) return;
        if (typeof switchTab === 'function') {
            try { switchTab(activeTab.id); } catch (_) { /* swallow */ }
        }
    }
    if (window.__appResourcesSettled) {
        triggerInitialTabLoad();
    } else {
        window.addEventListener('app:ui-ready', triggerInitialTabLoad, { once: true });
    }
})();

// Wrap all DOM event logic in DOMContentLoaded for safety
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // All event listeners and DOM manipulations above this line should be moved here for safety if needed
    });
}
