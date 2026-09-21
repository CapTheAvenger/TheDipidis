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

/* Reiter, die ABSICHTLICH keinen Menuepunkt haben.
 *
 * `admin` (Datenluecken) ist der einzige. js/app-admin.js sagt es
 * selbst: "diese Seite steht nicht im Menü, ist aber über #admin für
 * jeden erreichbar", und tests/unit/test-hilfe-und-reitertitel-07-09.js
 * haelt fest, dass es fuer `admin` keinen Menuepunkt geben darf — den
 * Namen der Ansicht traegt dort ihre eigene Ueberschrift in Titel und
 * Abzeichen, nicht das Menue.
 *
 * Alles ANDERE, was hier nicht steht und keinen Punkt hat, ist ein
 * Befund und meldet sich unten. */
const REITER_OHNE_MENUEPUNKT = ['admin'];

/**
 * Der Menuepunkt eines Reiters — die EINE Stelle, die das entscheidet.
 *
 * BEFUND (07.09.2026, Runde 3): den Punkt schlugen zwei Stellen
 * unabhaengig voneinander ueber `menu-btn-<Reitername>` nach
 * (hier und js/meta-analysis-hub.js setSideMenuActive). Fehlt der
 * Punkt, entfernen beide erst jede Markierung und setzen dann keine —
 * das Menue sagt dann "du bist nirgends", und zwar lautlos. Genau das
 * war fuer `meta-analysis-hub` der Zustand, nachdem dessen Kennung an
 * die Startseite ging: gemessen 0 markierte Punkte.
 *
 * Beide Stellen fragen jetzt hier. Und ein Reiter ohne Punkt, der
 * nicht in REITER_OHNE_MENUEPUNKT steht, wird gemeldet statt
 * verschwiegen — der naechste neue Reiter faellt damit beim ersten
 * Oeffnen auf, nicht erst in einer Abnahme.
 *
 * @returns {Element|null} der Menuepunkt, oder null wenn es keinen gibt
 */
function menuepunktFuerReiter(tabId) {
    const punkt = document.getElementById('menu-btn-' + tabId);
    if (punkt) return punkt;
    if (REITER_OHNE_MENUEPUNKT.indexOf(tabId) === -1
        && typeof console !== 'undefined' && console && console.warn) {
        console.warn('[menue] Reiter "' + tabId + '" hat keinen Menuepunkt '
            + '(erwartet: id="menu-btn-' + tabId + '") — das Menue bleibt '
            + 'unmarkiert. Entweder fehlt der Punkt, oder der Reiter gehoert '
            + 'in REITER_OHNE_MENUEPUNKT (js/inline-init.js).');
    }
    return null;
}
window.__dsMenuepunktFuerReiter = menuepunktFuerReiter;

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

/* Die Hoehe des Pokeball-Menues an den Platz anpassen, der wirklich da ist.
 *
 * BEFUND (31.08.2026, gemessen bei 1440x700 auf der Startseite): der
 * letzte sichtbare Eintrag war waagerecht durchgeschnitten. Das
 * Stylesheet deckelt das Menue mit `max-height: calc(100vh - 90px)` —
 * also gegen die GANZE Bildhoehe. Das Menue haengt aber absolut im
 * Kopfbereich und scrollt mit: sobald die Seite ein Stueck gescrollt
 * ist, beginnt es oberhalb des sichtbaren Bereichs. Gemessen lag sein
 * oberer Rand bei -23 px, waehrend der Deckel 610 px erlaubte — die
 * letzten 23 px fielen unten heraus, und `overflow-y: auto` machte
 * daraus einen Rollbalken in einem 280 px schmalen Kasten, den man
 * uebersieht.
 *
 * Gerechnet wird deshalb ab der TATSAECHLICHEN Position. Und wenn das
 * Menue oben aus dem Bild ragt, waere sein oberer Teil ohnehin
 * unerreichbar — dann wird ein Stueck zurueckgescrollt, statt unten
 * abzuschneiden.
 */
function menueHoeheAnpassen(drop) {
    if (!drop) return;
    drop.style.maxHeight = '';        // erst zuruecksetzen, sonst misst man den alten Deckel
    let r = drop.getBoundingClientRect();
    if (r.top < 8) {
        window.scrollBy(0, Math.round(r.top) - 8);
        r = drop.getBoundingClientRect();
    }
    const oben = Math.max(r.top, 8);

    /* SICHTBARE Hoehe, nicht window.innerHeight.
     *
     * BEFUND (06.09.2026, vom Betreiber mit Bildschirmfoto gemeldet):
     * auf dem iPhone lief das Menue unten aus dem Bild und die letzten
     * vier Eintraege (Mein Profil, Side Quest, Anleitung, Quellen &
     * Methodik) lagen ueber dem Seiteninhalt statt im Kasten.
     *
     * `window.innerHeight` meldet in Safari auf iOS die GROSSE
     * Ansichtshoehe — die, die gaelte, wenn die Adresszeile und die
     * untere Browserleiste eingeklappt sind. Wer nach unten gescrollt
     * hat, sieht genau das; tippt er dann auf das Menue, fahren die
     * Leisten wieder aus und es bleiben rund 100px weniger uebrig. Der
     * Deckel war da schon gesetzt und blieb zu gross.
     *
     * `visualViewport.height` meldet, was WIRKLICH zu sehen ist, und
     * aendert sich mit den Leisten. Der Rueckfall bleibt innerHeight
     * fuer Browser ohne visualViewport.
     *
     * Dazu die eigene Tableiste: sie ist fixiert und liegt ueber dem
     * Seitenende. Ohne sie abzuziehen endet das Menue unter ihr.
     */
    const sicht = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const leiste = document.getElementById('dsTabbarHost');
    const leisteHoch = (leiste && getComputedStyle(leiste).display !== 'none')
        ? Math.round(leiste.getBoundingClientRect().height)
        : 0;
    // 240 als Boden: lieber ein rollbares Menue als ein zweizeiliges.
    const platz = Math.max(240, Math.round(sicht - oben - leisteHoch - 8));
    drop.style.maxHeight = platz + 'px';

    /* Auf eine ganze Zeile abrunden.
     *
     * Reicht der Platz nicht fuer alle Eintraege, rollt das Menue — das
     * ist richtig. Falsch waere, dabei eine Zeile in der Mitte
     * durchzuschneiden: genau das sah aus wie ein kaputtes Menue und
     * war der gemeldete Fehler. Der Deckel wandert deshalb auf die
     * naechste Zeilenkante darunter. Dann sieht man eine Zeile ganz
     * oder gar nicht, und dass unten mehr kommt, zeigt der Rollbalken.
     */
    /* Auf eine ganze Zeile abrunden — gemessen, nicht gerechnet.
     *
     * Reicht der Platz nicht fuer alle Eintraege, rollt das Menue. Das
     * ist richtig. Falsch waere, dabei eine Zeile in der Mitte
     * durchzuschneiden: genau das sah aus wie ein kaputtes Menue und
     * war der gemeldete Fehler.
     *
     * Drei Anlaeufe ueber das Box-Modell (Zeilenkanten, Rahmenbreite,
     * border-box) landeten daneben, weil `max-height` die Aussenkante
     * meint und die Zeilenkanten im Inhaltsraum liegen — und weil ein
     * geaenderter Deckel den Rollbalken erscheinen laesst, was die
     * Breite und damit den Umbruch aendert. Deshalb wird jetzt nicht
     * mehr vorausberechnet, sondern korrigiert: schneidet die Unterkante
     * eine Zeile, wird der Deckel auf deren OBERKANTE gezogen und neu
     * gemessen. Zwei Durchgaenge reichen; der dritte ist die Reserve.
     */
    for (let versuch = 0; versuch < 3; versuch++) {
        const kasten = drop.getBoundingClientRect();
        let schnittBei = null;
        const zeilen = drop.querySelectorAll('.menu-header, .menu-item');
        for (let i = 0; i < zeilen.length; i++) {
            const el = zeilen[i];
            if (!el.getClientRects().length) continue;
            const zr = el.getBoundingClientRect();
            if (zr.top < kasten.bottom - 1 && zr.bottom > kasten.bottom + 1) {
                schnittBei = (schnittBei === null) ? zr.top : Math.min(schnittBei, zr.top);
            }
        }
        if (schnittBei === null) break;
        const neueHoehe = Math.round(kasten.height - (kasten.bottom - schnittBei));
        if (neueHoehe < 240 || neueHoehe >= Math.round(kasten.height)) break;
        drop.style.maxHeight = neueHoehe + 'px';
    }
}
window.menueHoeheAnpassen = menueHoeheAnpassen;

/* Nachrechnen, wenn sich der INHALT aendert — nicht nach Zeitplan.
 *
 * Die Hoehe aendert sich, wenn ein Untermenue auf- oder zuklappt, und
 * das laeuft mit Uebergang. Drei Anlaeufe mit requestAnimationFrame,
 * setTimeout(320) und transitionend haben das Rennen jeweils in
 * einzelnen Faellen verloren (gemessen bei 1440x700: "Mein Profil"
 * blieb halb). Ein ResizeObserver auf die Untermenues gewinnt es
 * immer: er feuert genau dann, wenn die Hoehe wirklich steht.
 *
 * Beobachtet werden nur die Untermenues, nicht der Kasten selbst —
 * sonst loest die eigene Hoehenaenderung die naechste Runde aus.
 */
var _menueBeobachter = null;
function menueBeobachtungStarten(drop) {
    if (typeof ResizeObserver !== 'function') return;
    menueBeobachtungBeenden();
    _menueBeobachter = new ResizeObserver(function () {
        requestAnimationFrame(function () {
            if (drop.classList.contains('show')) menueHoeheAnpassen(drop);
        });
    });
    drop.querySelectorAll('.menu-submenu').forEach(function (el) {
        _menueBeobachter.observe(el);
    });
}
function menueBeobachtungBeenden() {
    if (_menueBeobachter) { _menueBeobachter.disconnect(); _menueBeobachter = null; }
    _sichtBeobachtungBeenden();
}

/* Nachrechnen, wenn sich die SICHTBARE Hoehe aendert.
 *
 * Auf iOS fahren Adresszeile und untere Leiste beim Tippen und Rollen
 * ein und aus; visualViewport meldet das, window.resize NICHT. Ohne
 * dieses Nachrechnen bliebe der Deckel auf dem Wert stehen, der beim
 * Oeffnen galt — genau der Fall aus dem Bildschirmfoto vom 06.09.2026.
 *
 * Beendet wird die Beobachtung beim Schliessen, sonst rechnet sie
 * weiter fuer ein Menue, das niemand sieht.
 */
var _sichtHandler = null;
function _sichtBeobachtungStarten(drop) {
    if (!window.visualViewport) return;
    _sichtBeobachtungBeenden();
    _sichtHandler = function () {
        if (drop.classList.contains('show')) menueHoeheAnpassen(drop);
    };
    window.visualViewport.addEventListener('resize', _sichtHandler);
    window.visualViewport.addEventListener('scroll', _sichtHandler);
}
function _sichtBeobachtungBeenden() {
    if (!_sichtHandler || !window.visualViewport) { _sichtHandler = null; return; }
    window.visualViewport.removeEventListener('resize', _sichtHandler);
    window.visualViewport.removeEventListener('scroll', _sichtHandler);
    _sichtHandler = null;
}

function toggleMainMenu() {
    const drop = document.getElementById('mainMenuDropdown');
    const trig = document.getElementById('mainMenuTrigger');
    const open = drop.classList.toggle('show');
    if (open) { menueHoeheAnpassen(drop); menueBeobachtungStarten(drop); _sichtBeobachtungStarten(drop); }
    else { menueBeobachtungBeenden(); }
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
    /* Nachgeschlagen wird ueber __dsMenuepunktFuerReiter() — dieselbe
       Stelle, die auch js/meta-analysis-hub.js fragt, damit zwei Wege
       nicht zwei Menuezustaende ergeben (siehe dort setSideMenuActive).
       Gefragt wird ueber `window`, wie ein paar Zeilen weiter oben schon
       bei __dsSchreibeTabHash: dann verhaelt sich diese Funktion auch
       dann noch wie frueher, wenn sie ohne den Rest der Datei laeuft. */
    const activeBtn = typeof window.__dsMenuepunktFuerReiter === 'function'
        ? window.__dsMenuepunktFuerReiter(tabId)
        : document.getElementById('menu-btn-' + tabId);
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
/* BEFUND (07.09.2026, im Browser gemessen): "Meine Decks", "Wunschliste"
   und der Menuepunkt "Deck Builder" oeffneten zwar den Reiter `profile`,
   der aktive Untertab blieb aber "Meine Sammlung". Nachgestellt mit
   Playwright auf 127.0.0.1: bei einem Erstbesuch, bei dem der Service
   Worker die Seite einmal neu laedt, endete der Klick auf "Wunschliste"
   bei `#profile` + `profile-collection` (4 von 7 Laeufen); nach dem
   Neuladen war es reproduzierbar richtig. `switchProfileTab('wishlist')`
   direkt aufgerufen hat immer funktioniert.

   ZWEI URSACHEN, BEIDE HIER:

   1. Die ADRESSE trug den Untertab nicht. switchTabAndUpdateMenu()
      schreibt ueber kanonischerHash() nur `#profile` — und `#profile`
      sagt nichts darueber, welche Unteransicht gemeint war. Jedes
      Neuladen (der Service Worker macht genau eines beim Erstbesuch),
      jeder Zurueck-Schritt und jeder geteilte Link fielen deshalb auf
      den Standarduntertab zurueck. Das ist der gemessene Fall.
   2. Der Umschaltbefehl hing an EINEM requestAnimationFrame mit einer
      typeof-Wache. War switchProfileTab in genau diesem einen Bild noch
      nicht geladen, fiel der Befehl wortlos aus — kein Fehler, keine
      Spur, der Nutzer sieht seine Sammlung.

   Behoben wird beides: die Adresse nennt den Untertab (die
   Tieflink-Tabelle weiter unten kennt ihn ohnehin, #wishlist & Co.
   funktionieren seit Juni), und umgeschaltet wird so lange versucht,
   bis die Funktion da ist — hoechstens eine Sekunde. */
function openProfileSection(subTab) {
    /* BEFUND (Nachabnahme 07.09.2026): ein Klick hier kostete ZWEI
       Verlaufseintraege — erst '#profile' aus switchTabAndUpdateMenu(),
       dann die Kurzform. Gemessen bei bereits offenem #wishlist:
       history.length 3 -> 4, Hash unveraendert, und der erste
       Zurueck-Druck aenderte nichts Sichtbares.
       Die Marke sagt schreibeHash(), dass gleich eine genauere Adresse
       folgt; geschrieben wird dann genau einmal, naemlich unten. Nur
       setzen, wenn es die Untertab-Schreibfunktion wirklich gibt —
       sonst bliebe die Adresse bei einer aelteren Fassung von
       js/inline-init.js ganz ohne Eintrag stehen. */
    const schreibtUnter = typeof window.__dsSchreibeProfilHash === 'function';
    if (schreibtUnter) window.__dsProfilHashFolgt = true;
    try {
        switchTabAndUpdateMenu('profile');
    } finally {
        window.__dsProfilHashFolgt = false;
    }
    // Schreibt die Kurzform, die den Untertab mitnennt — sonst ist der
    // Zustand nicht verlinkbar und ueberlebt kein Neuladen.
    if (schreibtUnter) {
        window.__dsSchreibeProfilHash(subTab);
    }
    let versuche = 0;
    (function schalten() {
        if (typeof window.switchProfileTab === 'function') {
            window.switchProfileTab(subTab);
            return;
        }
        if (++versuche > 60) return;   // ~1 s bei 60 Hz, dann aufgeben
        requestAnimationFrame(schalten);
    })();
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

/* Ein aufgeklapptes Untermenue macht das Menue laenger, ein Drehen des
 * Geraets macht das Bild kuerzer. Beides ohne Nachrechnen heisst wieder
 * abgeschnitten. */
document.addEventListener('click', function (e) {
    const menu = document.getElementById('mainMenuDropdown');
    if (!menu || !menu.classList.contains('show')) return;
    if (!menu.contains(e.target)) return;
    // Nach dem Aufklappen messen, nicht davor — und nicht nur einmal:
    // ein Untermenue klappt MIT UEBERGANG auf. Wer nur im naechsten
    // Bild misst, misst die Hoehe von vorher, und der Deckel passt zum
    // alten Inhalt. Gemessen bei 1440x700: "Quellen & Methodik" blieb
    // dadurch halb geschnitten, obwohl die Kantenrechnung stimmte.
    requestAnimationFrame(function () { menueHoeheAnpassen(menu); });
    setTimeout(function () { menueHoeheAnpassen(menu); }, 320);
});

// Der Uebergang selbst ist das verlaesslichste Signal: wenn er fertig
// ist, steht die Hoehe fest.
document.addEventListener('transitionend', function (e) {
    const menu = document.getElementById('mainMenuDropdown');
    if (!menu || !menu.classList.contains('show')) return;
    if (!menu.contains(e.target) || e.target === menu) return;
    menueHoeheAnpassen(menu);
}, true);
['resize', 'orientationchange'].forEach(function (ev) {
    window.addEventListener(ev, function () {
        const menu = document.getElementById('mainMenuDropdown');
        if (menu && menu.classList.contains('show')) menueHoeheAnpassen(menu);
    });
});

document.addEventListener('click', function(e) {
    const menu    = document.getElementById('mainMenuDropdown');
    const trigger = document.getElementById('mainMenuTrigger');
    if (menu && trigger && menu.classList.contains('show')) {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            menu.classList.remove('show');
            trigger.classList.remove('open');
            menueBeobachtungBeenden();
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

/* ── Tote Verweise im Anleitungstext ─────────────────────────
 *
 * BEFUND (07.09.2026, live gemessen; QA-B F8.5b): im Reiter `tutorial`
 * stehen neun Verweise mit `href="#"` und ohne `onclick` — achtmal
 * "🛒 Cardmarket", einmal "@TheDipidisBot". Nachgemessen: ein Klick auf
 * den ersten setzt den Hash auf leer (""), der popstate-Zuhoerer unten
 * schickt die Anwendung auf die Startseite, und der Leser verliert
 * seine Stelle in einem 89.000 Zeichen langen Dokument.
 *
 * Der Text selbst (tutorial/tutorial.de.html) und index.html werden
 * hier NICHT angefasst — abgefangen wird der Klick.
 *
 * WARUM ZWEIERLEI BEHANDLUNG — die Entscheidung, begruendet:
 *
 *   • "@TheDipidisBot" ist EINDEUTIG. Die Handle benennt einen realen
 *     Bot, und dieselbe Datei verlinkt ihn 23 Zeilen weiter oben schon
 *     korrekt auf https://t.me/TheDipidisBot; README.md und
 *     js/i18n.js ('profile.priceAlerts.chatIdHelp') nennen dieselbe
 *     Adresse. Es gibt also ein Ziel, das nicht geraten ist — es wird
 *     eingetragen, und der Verweis funktioniert danach auch beim
 *     Ueberfahren und beim Oeffnen in neuem Reiter.
 *
 *   • Die acht "🛒 Cardmarket" sind es NICHT. Sie stehen in
 *     `.mockup-tg`, einem NACHBAU einer Telegram-Nachricht mit
 *     erfundenen Beispielkarten und Beispielpreisen ("Beedrill ex
 *     (CRI 98) · Markt 3,96 € · Ziel 4,50 €"). Den echten Link baut der
 *     Bot pro Zeile aus Set und Kartennummer der WUNSCHLISTE DES
 *     NUTZERS. Ein hier eingetragenes Ziel waere geraten — eine
 *     Cardmarket-Suche nach einer Karte, die nur im Beispielbild
 *     vorkommt. Die Regel dieses Projekts ("keine Zahl ohne Quelle,
 *     keine Behauptung ohne Nachweis", js/app-quellen.js) gilt auch
 *     fuer Verweise. Also: der Klick wird unschaedlich gemacht — kein
 *     Hash-Wechsel, kein Sprung — und der Leser bekommt gesagt, WARUM
 *     nichts passiert, statt es stillschweigend hinzunehmen. Zusaetzlich
 *     bekommt der Verweis beim ersten Anfassen einen Titel und einen
 *     Pfeil-Zeiger, damit die zweite Begegnung schon vorher spricht.
 */
function tutorialToterVerweis(e) {
    const ziel = e && e.target;
    if (!ziel || typeof ziel.closest !== 'function') return;
    const a = ziel.closest('#tutorial a[href="#"]');
    if (!a) return;

    // In JEDEM Fall zuerst: der leere Hash ist der eigentliche Schaden.
    e.preventDefault();

    const deutsch = !(typeof getLang === 'function' && getLang() === 'en');
    const text = (a.textContent || '');

    if (/TheDipidisBot/i.test(text)) {
        const url = 'https://t.me/TheDipidisBot';
        a.setAttribute('href', url);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        try { window.open(url, '_blank', 'noopener'); } catch (_e) { /* Popup-Blocker */ }
        return;
    }

    a.setAttribute('title', deutsch
        ? 'Beispielbild — der echte Cardmarket-Link steht in der Telegram-Nachricht'
        : 'Example screenshot — the real Cardmarket link is in the Telegram message');
    a.style.cursor = 'default';
    if (typeof showNotification === 'function') {
        showNotification(deutsch
            ? 'Das ist ein Beispielbild einer Telegram-Nachricht. Den echten Cardmarket-Link baut der Bot aus Set und Nummer deiner eigenen Wunschlisten-Karte — er steht in der Nachricht, die du bekommst.'
            : 'This is an example screenshot of a Telegram message. The real Cardmarket link is built by the bot from the set and number of your own wishlist card — it is in the message you receive.',
            'info');
    }
}
// Fangphase: der Verweis darf nicht erst dann unschaedlich werden, wenn
// ein anderer Zuhoerer ihn schon weitergereicht hat.
document.addEventListener('click', tutorialToterVerweis, true);
window.tutorialToterVerweis = tutorialToterVerweis;

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
        // Tieflinks in einen einzelnen Abschnitt. Ohne Eintrag hier
        // steigt applyHash() wortlos aus, und der Verweis fuehrt
        // nirgendwohin — derselbe Fehler wie frueher bei #side-quest.
        'quellen-quellen':       'quellen',
        'quellen-begriffe':      'quellen',
        'quellen-zuverlaessig':  'quellen',
        'quellen-trennung':      'quellen',
        'quellen-stand':         'quellen',
        'quellen-rechtliches':   'quellen',
        /* BEFUND (07.09.2026, live gemessen): der Abschnitt "Umfang" hat
           in js/app-quellen.js seit dem 02.09. die Kennung `umfang` und
           damit im Markup `id="qu-umfang"`, aber weder hier einen Alias
           noch weiter unten einen Weisslisteneintrag. `#quellen-umfang`
           stieg deshalb in applyHash() an `if (!tabId) return` aus: der
           Reiter wechselte nicht, der Abschnitt klappte nicht auf, die
           falsche Adresse blieb in der Zeile stehen — nachgemessen von
           #hub aus, Ergebnis: Reiter meta-analysis-hub, Hash
           #quellen-umfang. Die sechs Geschwister funktionierten.
           tests/unit/test-quellen-tieflinks.js vergleicht die
           Abschnittskennungen aus app-quellen.js jetzt bei jedem Lauf
           gegen diese Tabelle und gegen die Weissliste. */
        'quellen-umfang':        'quellen',
        /* 10.09.2026: die langen Erklaerungen der Meta-Ansicht stehen
           seither hinter dem Professor-Eich-Knopf; der Abschnitt
           `erklaerungen` in js/app-quellen.js sagt, wo. Alias und
           Weissliste unten sind derselbe Handgriff wie bei `umfang` am
           07.09. — tests/unit/test-tieflink-overview-und-quellen-07-09.js
           vergleicht beide bei jedem Lauf gegen Quellen.ids(). */
        'quellen-erklaerungen':  'quellen',
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
        // Selbstverweis, sonst schreibt kanonischerHash() keinen Hash
        // zurueck und der Reiter hat keine teilbare Adresse.
        'pocket':                'pocket',
        'tcg-pocket':            'pocket',
        'pocket-decks':          'pocket',
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
        /* BEFUND (07.09.2026, live gemessen): #hub und #uebersicht
           oeffneten die Kachelseite, das englische #overview tat gar
           nichts — der vorher offene Reiter blieb stehen (gemessen von
           #tutorial aus: Reiter tutorial, Hash #overview). Die drei
           standen naemlich nur in PROFILE_SUBTAB_FOR_HASH, und diese
           Tabelle wird in applyHash() erst NACH `const tabId =
           HASH_ALIASES[rawTab]; if (!tabId) return;` gelesen — ein
           Eintrag dort allein erreicht nie eine Zeile Code.
           Widerspruchsfrei heisst hier: alle drei Kurzformen stehen in
           HASH_ALIASES (der Tabelle, die entscheidet), und keine steht
           in PROFILE_SUBTAB_FOR_HASH (die Tabelle fuer Profil-Untertabs
           — 'meta-analysis-hub' ist keiner). */
        'overview':              'meta-analysis-hub',
        // Admin — Datenluecken. Der EINZIGE Weg dorthin: die Seite steht
        // in keinem Menue. Kein Zugangsschutz, und die Seite sagt das
        // auch — sie zeigt nur, was uns fehlt.
        'admin':                 'admin',
        'datenluecken':          'admin',
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
        // 07.09.2026: die beiden fehlten, und genau sie stehen hinter
        // zwei der drei Kopfzeilen-Verknuepfungen ("Meine Decks",
        // "Deck Builder"). Ohne Kurzform kann openProfileSection() die
        // Unteransicht nicht in die Adresse schreiben.
        'decks':                 'profile',
        'deckbuilder':           'profile',
        'tradelist':             'profile',
        'trade-list':            'profile',
        'collection':            'profile',
        /* BEFUND (Nachabnahme 07.09.2026): "Deck-Vergleich" und
           "Einstellungen" sind echte .profile-tab-content mit eigenem
           Knopf in der Profil-Leiste (index.html), hatten aber als
           einzige zwei von elf Untertabs keinen Tieflink. Gemessen: Hash
           von Hand auf #deckcompare bzw. #settings gesetzt -> Reiter
           blieb stehen, der aktive Untertab blieb profile-collection.
           Neun von elf loesten auf, diese zwei nicht. Ein Untertab ohne
           Adresse ueberlebt kein Neuladen und laesst sich nicht teilen —
           genau der Befund, an dem "Meine Decks" schon gescheitert ist.
           tests/unit/test-profil-untertabs-tieflink.js prueft die REGEL:
           jede id "profile-X" im Markup braucht beide Eintraege. */
        'deckcompare':           'profile',
        'deck-compare':          'profile',
        'settings':              'profile',
        'einstellungen':         'profile',
        /* 21.09.2026: zwoelfter Untertab "Meine Masterclasses". Ohne
           diesen Eintrag steigt applyHash() an `if (!tabId) return` aus
           und #masterclass laesst den zuletzt offenen Untertab stehen —
           genau der Befund von B3 in
           tests/unit/test-tieflink-nachabnahme-07-09.js, der die REGEL
           prueft und nicht die einzelnen Nachzuegler. */
        'masterclass':           'profile',
        'meisterklasse':         'profile',
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
        'decks':          'decks',
        'deckbuilder':    'deckbuilder',
        // 07.09.2026 nachgezogen, siehe Kommentar in HASH_ALIASES.
        'deckcompare':    'deckcompare',
        'deck-compare':   'deckcompare',
        'settings':       'settings',
        'einstellungen':  'settings',
        // 21.09.2026 zusammen mit HASH_ALIASES nachgezogen.
        'masterclass':    'masterclass',
        'meisterklasse':  'masterclass',
        // HIER STANDEN 'hub', 'uebersicht' UND 'overview'.
        //
        // Die Kachelseite hatte bis zum 26.08.2026 den Menuepunkt
        // "Uebersicht"; der heisst jetzt "Startseite", und damit die
        // Kachelseite nicht unerreichbar wird (Zusage vom 18.08.:
        // "geloescht wird nichts"), behaelt sie einen Deep-Link. Der
        // Deep-Link gehoert aber in HASH_ALIASES — DIESE Tabelle
        // beantwortet nur die Anschlussfrage "welcher PROFIL-Untertab",
        // und sie wird erst gelesen, wenn HASH_ALIASES den Reiter
        // 'profile' ergeben hat. 'meta-analysis-hub' ist kein
        // Profil-Untertab; die drei Zeilen konnten hier nie wirken.
        //
        // Gemessen am 07.09.2026: #hub und #uebersicht funktionierten,
        // weil sie ZUSAETZLICH in HASH_ALIASES stehen. #overview stand
        // nur hier — und tat gar nichts. Beide Richtungen stehen jetzt
        // widerspruchsfrei in HASH_ALIASES, keine mehr hier.
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
        let tabId = HASH_ALIASES[rawTab];
        /* BEFUND (Nachabnahme 07.09.2026): ein Anker auf einen Abschnitt, den
           es nicht gibt — #quellen-tippfehler — wechselte nicht einmal den
           Reiter. Gemessen von #hub aus: Reiter blieb meta-analysis-hub, die
           falsche Adresse blieb stehen. Der Kommentar weiter unten sagt aber
           seit der Einfuehrung, ein unbekannter Anker solle "die Seite oeffnen
           und in Ruhe lassen". Verhalten und Zusage gingen auseinander, weil
           applyHash() schon hier an `if (!tabId) return` aussteigt.
           Der Praefix "quellen-" benennt den Reiter eindeutig; der Abschnitt
           dahinter wird weiter unten geprueft und, wenn unbekannt, benannt
           statt verschwiegen. */
        if (!tabId && rawTab.indexOf('quellen-') === 0) tabId = 'quellen';
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

        /* Quellen & Methodik: ein Anker klappt seinen Abschnitt auf.
         *
         * BEFUND (Agentenrunde 31.08.2026): js/app-quellen.js hat dafuer
         * seit dem Umzug der Erklaerungen eine Funktion `open(id)` — mit
         * einem Kommentar, der genau diesen Zweck beschreibt. Sie hatte
         * keinen einzigen Aufrufer. Ein Verweis wie #quellen-begriffe
         * haette die Seite geoeffnet und sonst nichts getan: der
         * Abschnitt bleibt zu, es wird nicht gescrollt, und niemand
         * merkt, dass der Link nicht ankam.
         *
         * Erlaubt sind nur die Abschnitts-Kennungen, die es gibt — ein
         * unbekannter Anker soll die Seite oeffnen und in Ruhe lassen,
         * nicht ins Leere scrollen.
         */
        if (tabId === 'quellen' && window.Quellen && typeof window.Quellen.open === 'function') {
            // 07.09.2026: `umfang` fehlte hier — die Weissliste war eine
            // von Hand gefuehrte Zweitschrift der Abschnittsliste in
            // js/app-quellen.js und lief ihr hinterher. Erste Wahl ist
            // deshalb jetzt die Liste aus der Quelle selbst; die
            // Aufzaehlung bleibt als Rueckfallebene, falls Quellen.ids()
            // fehlt (aeltere zwischengespeicherte Fassung der Datei).
            const ABSCHNITTE = { quellen: 1, erklaerungen: 1, umfang: 1,
                                 begriffe: 1, zuverlaessig: 1, trennung: 1,
                                 stand: 1, rechtliches: 1 };
            let erlaubt = ABSCHNITTE;
            try {
                if (typeof window.Quellen.ids === 'function') {
                    const liste = window.Quellen.ids();
                    if (Array.isArray(liste) && liste.length) {
                        erlaubt = {};
                        liste.forEach(function (x) { erlaubt[x] = 1; });
                    }
                }
            } catch (_e) { erlaubt = ABSCHNITTE; }
            const teil = rawTab.indexOf('quellen-') === 0 ? rawTab.slice(8) : '';
            const bekannt = !teil || !!erlaubt[teil];
            /* ZUSATZBEFUND (Nachabnahme 07.09.2026): fehlte eine Kennung in
               Quellen.ids(), blieb der Abschnitt einfach zu — 0 Meldungen,
               0 console.warn. Wer den Verweis geteilt hat, erfaehrt nie, dass
               er nicht ankam, und wer ihn oeffnet, haelt die zugeklappte Seite
               fuer das Ziel. Stille Ausfaelle sind in diesem Projekt verboten:
               der Reiter oeffnet trotzdem (siehe oben), aber der Fehlschlag
               wird benannt — in der Konsole immer, sichtbar wenn die
               Meldungsleiste schon geladen ist. */
            if (!bekannt) {
                console.warn('[deep-link] Quellen & Methodik: Abschnitt "' + teil
                    + '" gibt es nicht — bekannt sind: '
                    + Object.keys(erlaubt).join(', '));
                if (typeof showNotification === 'function') {
                    const deutsch = typeof getLang === 'function' && getLang() === 'de';
                    setTimeout(function () {
                        showNotification(deutsch
                            ? 'Den Abschnitt „' + teil + '" gibt es in Quellen & Methodik nicht — '
                              + 'die Seite ist offen, der Abschnitt bleibt zu.'
                            : 'Section "' + teil + '" does not exist in Sources & Method — '
                              + 'the page is open, the section stays closed.',
                            'error');
                    }, 600);
                }
            }
            try { window.Quellen.open(bekannt ? teil : ''); } catch (_e) { /* tolerate */ }
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
        /* BEFUND (Nachabnahme 07.09.2026): ein Klick auf eine
           Kopfzeilen-Verknuepfung erzeugte ZWEI Verlaufseintraege.
           Gemessen bei bereits offenem #wishlist: history.length 3 -> 4 bei
           unveraendertem #wishlist — der erste Zurueck-Druck aenderte nichts
           Sichtbares. Ursache: openProfileSection() ruft erst
           switchTabAndUpdateMenu('profile'), das hier '#profile' per pushState
           schiebt, und danach schreibeProfilHash(), das es nur ersetzt.
           '#profile' ist in diesem Ablauf kein Zustand, den jemand besucht
           hat — es steht keine Millisekunde in der Zeile. Ein Verlaufseintrag
           dafuer ist eine Sackgasse. Deshalb setzt openProfileSection() diese
           Marke: der Untertab schreibt gleich selbst, genau einmal. */
        if (window.__dsProfilHashFolgt && tabId === 'profile') return;
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

    /* 07.09.2026 — Adresse fuer einen PROFIL-UNTERTAB.
     *
     * kanonischerHash() kennt nur Reiter, und der Reiter heisst hier
     * immer 'profile'. Fuer die Kopfzeilen-Verknuepfungen ist das zu
     * grob: '#profile' laesst offen, welche Unteransicht gemeint war,
     * und faellt beim naechsten Laden auf die Sammlung zurueck (genau
     * der gemessene Befund, siehe openProfileSection()).
     *
     * Geschrieben wird nur die Kurzform, die BEIDE Tabellen schon
     * kennen und die auf sich selbst zeigt — also dieselbe Adresse,
     * die applyHash() anschliessend wieder aufloesen kann.
     *
     * KORREKTUR 07.09.2026 (Nachabnahme, Befund "doppelter
     * Verlaufseintrag"): hier stand frueher replaceState mit der
     * Begruendung, das '#profile' von switchTabAndUpdateMenu() solle
     * keinen eigenen Verlaufseintrag bekommen. Gemessen traf das nicht
     * zu — der Eintrag war da, bevor er ersetzt werden konnte
     * (history.length 3 -> 4 bei unveraendertem #wishlist). Ersetzen
     * kommt eine Stufe zu spaet. Unterdrueckt wird jetzt der
     * '#profile'-Eintrag selbst (Marke __dsProfilHashFolgt in
     * schreibeHash), und DIESE Funktion schiebt den einen Eintrag, den
     * der Klick verdient. Ist die Adresse schon die richtige, wird gar
     * nichts geschoben — ein Klick auf den bereits offenen Untertab
     * kostet keinen Verlaufseintrag. */
    function schreibeProfilHash(subTab) {
        if (routetGerade) return;
        const k = String(subTab || '');
        /* Untertab ohne eigene Kurzform (oder eine Kurzform, die nicht auf
           sich selbst zeigt — sonst haette dieselbe Ansicht zwei Adressen,
           dieselbe Regel wie in kanonischerHash()): dann wenigstens
           '#profile' schreiben. Ohne diesen Rueckfall bliebe die Adresse der
           VORIGEN Ansicht ueber dem Profil stehen, seit der '#profile'-Eintrag
           oben unterdrueckt wird. */
        if (HASH_ALIASES[k] !== 'profile' || PROFILE_SUBTAB_FOR_HASH[k] !== k) {
            schreibeHash('profile');
            return;
        }
        if (window.location.hash === '#' + k) return;
        const ziel = window.location.pathname + window.location.search + '#' + k;
        try {
            window.history.pushState({ tab: 'profile', unter: k }, '', ziel);
        } catch (_e) { /* file:// und aehnliche Faelle */ }
    }
    window.__dsSchreibeProfilHash = schreibeProfilHash;

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
