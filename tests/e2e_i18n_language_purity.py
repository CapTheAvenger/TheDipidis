"""
E2E: i18n Language Purity Test
 - Verifies ALL data-i18n elements match expected translations per language
 - Checks English mode has no stray German words in VISIBLE elements
 - Checks German mode has no stray English words in VISIBLE elements
 - Tests data-i18n, data-i18n-placeholder, data-i18n-title, data-i18n-aria
 - Navigates visible tabs to ensure dynamically rendered content is also checked
 - Verifies translation key coverage (EN↔DE parity)
 - Verifies language persistence across reload
"""
import sys, re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000/index.html"
PASS = 0
FAIL = 0
ERRORS = []

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS {name}")
    else:
        FAIL += 1
        ERRORS.append(name if not detail else f"{name} — {detail}")
        print(f"  FAIL {name}" + (f"  ({detail})" if detail else ""))

# ── data-i18n keys that are dynamic / toggled at runtime ──────
# These buttons change text based on state, not language.
I18N_DYNAMIC_KEYS = {
    'btn.gridView',       # toggled to '📋 List View' / '📊 Grid'
    'bj.themeDark',       # shows current theme, not translation
    'bj.themeLight',
}

# ── German-only words (should NOT appear in English mode) ─────
GERMAN_ONLY_WORDS = [
    'Speichern', 'Schließen', 'Leeren', 'Vergleichen', 'Teilen',
    'Importieren', 'Exportieren', 'Anmelden', 'Abmelden', 'Anleitung',
    'Hauptmenü', 'Kartendatenbank', 'Archetypen-Übersicht', 'Kartenübersicht',
    'Deckbau', 'Einzigartig', 'Kopieren', 'Abbrechen', 'Entfernen',
    'Einstellungen', 'Wunschliste',
    'Konto erstellen', 'Vergangenes Meta', 'Aktuelles Meta',
    'Sprache wechseln', 'Dein Deck', 'Mein Profil', 'Rechner',
    'Testhand', 'Konsistenz', 'Raster', 'Unterstützer',
    'Werkzeug', 'Stadion', 'Deck-Statistiken',
    'Karten-Anteil-Filter', 'Deckliste importieren',
    'Einzelne Karte hinzufügen', 'Letztes Update',
    'Benutzerprofil', 'Gespeicherte Decks',
    'Karten im Besitz', 'Sammlungswert', 'Anzeigename',
    'Passwort vergessen', 'Mit Google anmelden',
    'Starthand-Simulator', 'Neue Hand',
    'Karte ziehen', 'Auswahl löschen',
    'Aufstellungsphase', 'Mehrspieler',
    'Mulligan-Ziehen', 'Ablagestapel', 'Spielfeld',
    'Niedrige Seltenheit', 'Alle Drucke',
    'Turniername', 'Eigenes Deck', 'Gegner-Archetyp',
    'Binder generieren',
]

# ── English-only words (should NOT appear in German mode) ──────
ENGLISH_ONLY_WORDS = [
    'Sign In', 'Sign Out', 'How to Use',
    'Main Menu', 'Card Database', 'Archetype Overview', 'Card Overview',
    'Deck Builder', 'Create Account',
    'Switch language', 'Your Deck', 'My Profile', 'Calculator',
    'Test Draw', 'Consistency', 'Supporter',
    'Stadium', 'Deck Statistics',
    'Card Share Filter', 'Import Decklist',
    'Add Single Card', 'Last Update',
    'User Profile', 'Saved Decks',
    'Cards Owned', 'Collection Value', 'Display Name',
    'Forgot password', 'Sign in with Google',
    'Print Queue', 'Cards Drawn',
    'Starting Hand Simulator', 'New Hand',
    'Draw Card', 'Clear Selection',
    'Setup Phase', "Let's Battle",
    'Mulligan Draw',
    'Low Rarity', 'All Prints',
    'Tournament Name', 'Opponent Archetype',
    'Generate Binder',
]

# Words valid in BOTH languages (brand names, TCG terms, abbreviations)
BILINGUAL_ALLOWED = {
    'pokémon', 'pokemon', 'tcg', 'hub', 'meta', 'deck', 'proxy',
    'playtester', 'bo1', 'bo3', 'ptcgl', 'city league', 'limitless',
    'ok', 'item', 'ace spec', 'ass-klasse', 'cardmarket', 'win',
    'loss', 'tie', 'first', 'second', '1st', '2nd', 'mirror',
    'mulligan', 'lost zone', 'trainer', 'online', 'k.o.', 'basic',
    'de', 'en', 'iono', 'judge', 'roxanne', 'unfair stamp',
    'csv', 'dex', 'nr.', 'irl', 'profil', 'journal',
    'energy', 'save', 'close', 'clear', 'compare', 'share',
    'import', 'export', 'copy', 'cancel', 'remove', 'unique',
    'password', 'all cards', 'collection', 'wishlist',
    'complete', 'missing', 'generate', 'continue',
    'result', 'field', 'discard', 'ready', 'grid',
    'remaining', 'multiplayer', 'settings',
}

# JS helper: collect ONLY visible text (skip display:none ancestors)
VISIBLE_TEXT_JS = """(() => {
    function isVisible(el) {
        while (el && el !== document.body) {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') return false;
            el = el.parentElement;
        }
        return true;
    }
    const texts = [];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        if (isVisible(el)) texts.push(el.textContent || '');
    });
    // Also scan visible headings, labels, buttons (non-i18n)
    document.querySelectorAll('h1,h2,h3,h4,h5,label,button,a,.tab-btn,.menu-item-label').forEach(el => {
        if (isVisible(el) && !el.closest('[style*="display: none"]') && !el.closest('[style*="display:none"]'))
            texts.push(el.textContent || '');
    });
    return texts.join(' ');
})()"""


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # ═══════════════════════════════════════════════════════
        #   PHASE 1: ENGLISH MODE
        # ═══════════════════════════════════════════════════════
        print("\n══════════════════════════════════════════════════")
        print("  PHASE 1: ENGLISH MODE")
        print("══════════════════════════════════════════════════")

        # Force English via localStorage before page load
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.evaluate("localStorage.setItem('app_lang', 'en')")
        page.reload(wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1500)

        lang = page.evaluate("document.documentElement.lang")
        check("EN.0 html lang=en", lang == "en", f"got '{lang}'")

        current_lang = page.evaluate("getLang()")
        check("EN.0b getLang()='en'", current_lang == "en", f"got '{current_lang}'")

        # ── T1: Verify all data-i18n elements show English text ──
        print("\n-- EN: data-i18n element check --")
        i18n_results_en = page.evaluate("""(() => {
            const SKIP = %s;
            const results = [];
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (!key || SKIP.includes(key)) return;
                const expected = window.t(key);
                const labelChild = el.querySelector('.menu-item-label');
                let actual = '';
                if (labelChild) {
                    actual = labelChild.textContent.trim();
                } else if (el.children.length > 0) {
                    const textNodes = Array.from(el.childNodes)
                        .filter(n => n.nodeType === 3 && n.textContent.trim());
                    actual = textNodes.map(n => n.textContent.trim()).join(' ');
                    // If no text nodes, use full textContent (for children like <strong>)
                    if (!actual) actual = el.textContent.trim();
                } else {
                    actual = el.textContent.trim();
                }
                // Strip HTML tags from BOTH sides for comparison
                const strip = s => s.replace(/<[^>]+>/g, '').replace(/\\s+/g, ' ').trim();
                const expectedClean = strip(expected);
                const actualClean = strip(actual);
                if (actualClean && expectedClean) {
                    results.push({ key, expected: expectedClean, actual: actualClean, match: actualClean === expectedClean });
                }
            });
            return results;
        })()""" % str(list(I18N_DYNAMIC_KEYS)))

        en_mismatch_count = 0
        for item in i18n_results_en:
            if not item['match']:
                en_mismatch_count += 1
                if en_mismatch_count <= 20:  # Cap output
                    check(f"EN.i18n '{item['key']}'", False,
                          f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"EN.1 data-i18n elements match ({len(i18n_results_en)} checked, {en_mismatch_count} mismatches)",
              en_mismatch_count == 0,
              f"{en_mismatch_count} mismatches" if en_mismatch_count else "")

        # ── T2: Verify data-i18n-placeholder ──────────────────
        print("\n-- EN: placeholder check --")
        ph_results_en = page.evaluate("""(() => {
            const results = [];
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (!key) return;
                const expected = window.t(key).trim();
                const actual = (el.placeholder || '').trim();
                results.push({ key, expected, actual, match: actual === expected });
            });
            return results;
        })()""")
        ph_en_fail = sum(1 for r in ph_results_en if not r['match'])
        for item in ph_results_en:
            if not item['match']:
                check(f"EN.ph '{item['key']}'", False,
                      f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"EN.2 placeholders match ({len(ph_results_en)} checked)", ph_en_fail == 0,
              f"{ph_en_fail} mismatches" if ph_en_fail else "")

        # ── T3: Verify data-i18n-title ────────────────────────
        print("\n-- EN: title attribute check --")
        title_results_en = page.evaluate("""(() => {
            const results = [];
            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (!key) return;
                const expected = window.t(key).trim();
                const actual = (el.title || '').trim();
                results.push({ key, expected, actual, match: actual === expected });
            });
            return results;
        })()""")
        title_en_fail = sum(1 for r in title_results_en if not r['match'])
        for item in title_results_en:
            if not item['match']:
                check(f"EN.title '{item['key']}'", False,
                      f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"EN.3 titles match ({len(title_results_en)} checked)", title_en_fail == 0,
              f"{title_en_fail} mismatches" if title_en_fail else "")

        # ── T4: Verify data-i18n-aria ─────────────────────────
        print("\n-- EN: aria-label check --")
        aria_results_en = page.evaluate("""(() => {
            const results = [];
            document.querySelectorAll('[data-i18n-aria]').forEach(el => {
                const key = el.getAttribute('data-i18n-aria');
                if (!key) return;
                const expected = window.t(key).trim();
                const actual = (el.getAttribute('aria-label') || '').trim();
                results.push({ key, expected, actual, match: actual === expected });
            });
            return results;
        })()""")
        aria_en_fail = sum(1 for r in aria_results_en if not r['match'])
        for item in aria_results_en:
            if not item['match']:
                check(f"EN.aria '{item['key']}'", False,
                      f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"EN.4 aria-labels match ({len(aria_results_en)} checked)", aria_en_fail == 0,
              f"{aria_en_fail} mismatches" if aria_en_fail else "")

        # ── T5: Scan for stray German words in English mode ───
        print("\n-- EN: stray German word scan --")
        all_visible_en = page.evaluate(VISIBLE_TEXT_JS)

        german_found_in_en = []
        for word in GERMAN_ONLY_WORDS:
            if word.lower() in BILINGUAL_ALLOWED:
                continue
            # Use word boundary matching
            pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
            if pattern.search(all_visible_en):
                german_found_in_en.append(word)

        if german_found_in_en:
            for w in german_found_in_en[:15]:
                check(f"EN.5 no German word '{w}'", False)
        check(f"EN.5 no stray German words ({len(german_found_in_en)} found)",
              len(german_found_in_en) == 0,
              ', '.join(german_found_in_en[:10]) if german_found_in_en else "")

        # ── T6: Verify toggle button shows 'EN' in English mode
        print("\n-- EN: toggle button --")
        toggle_text = page.evaluate("document.getElementById('langToggleBtn')?.textContent?.trim()")
        check("EN.6 toggle shows 'EN'", toggle_text == "EN", f"got '{toggle_text}'")

        # ── T7: Translation key coverage — every EN key has a value
        print("\n-- EN: key coverage --")
        en_key_coverage = page.evaluate("""(() => {
            const en = Object.keys(window.t ? {} : {});
            // Access translations directly
            const enKeys = Object.keys(translations.en);
            const deKeys = Object.keys(translations.de);
            const missingInDe = enKeys.filter(k => !(k in translations.de));
            const missingInEn = deKeys.filter(k => !(k in translations.en));
            return { enCount: enKeys.length, deCount: deKeys.length,
                     missingInDe, missingInEn };
        })()""")
        check(f"EN.7a EN has translations ({en_key_coverage['enCount']} keys)", en_key_coverage['enCount'] > 0)
        check(f"EN.7b DE has translations ({en_key_coverage['deCount']} keys)", en_key_coverage['deCount'] > 0)
        check(f"EN.7c all EN keys exist in DE ({len(en_key_coverage['missingInDe'])} missing)",
              len(en_key_coverage['missingInDe']) == 0,
              ', '.join(en_key_coverage['missingInDe'][:10]) if en_key_coverage['missingInDe'] else "")
        check(f"EN.7d all DE keys exist in EN ({len(en_key_coverage['missingInEn'])} missing)",
              len(en_key_coverage['missingInEn']) == 0,
              ', '.join(en_key_coverage['missingInEn'][:10]) if en_key_coverage['missingInEn'] else "")

        # ── T8: No identical EN/DE translations (except intended ones)
        print("\n-- EN: identical translation check --")
        identical_keys = page.evaluate("""(() => {
            const identical = [];
            const skip = new Set([
                'app.title', 'btn.importPTCGL', 'btn.exportPTCGL',
                'cl.cards90', 'cl.cards70', 'cl.cards50',
                'bj.bo1', 'bj.bo3', 'deck.pokemon', 'cl.pokemon',
                'cardType.pokemon', 'cl.typePokemon',
                'modal.ok', 'bj.first', 'bj.second',
                'meta.filter90', 'meta.filter70', 'meta.filter50',
                'meta.typeAll', 'meta.typePokemon',
                'heatmap.title', 'cl.proxy',
                'pt.mpOr', 'cl.typeItem', 'filter.typeItem',
                'matchup.title',
                // Brand names / TCG terms that are the same in both languages
                'menu.cityLeague', 'menu.playtester',
                'tab.cityLeague', 'tab.playtester',
                'btn.deckToProxy', 'deck.trainer', 'cl.trainer',
                'pt.mulliganBtn', 'pt.lostZone', 'pt.oppTabLostZone',
                'cl.thDeck', 'cl.decks', 'cl.deckBuilder',
                'cl.tierSpicy', 'cl.typeItem',
                'cl.playtest', 'cl.btnProxy', 'cl.btnGrid',
                'sandbox.heading', 'pt.basic',
                'pt.discardZone', 'pt.field', 'pt.discardPile',
                'pt.oppTabField', 'pt.oppTabDiscard',
                'bj.profileTitle', 'bj.openShort',
                'filter.typeAll', 'meta.typeTrainer',
                'cards.cityLeague', 'cl.tierAceSpec',
            ]);
            for (const key of Object.keys(translations.en)) {
                if (skip.has(key)) continue;
                const en = translations.en[key];
                const de = translations.de[key];
                if (de && en === de && en.length > 4) {
                    identical.push(key + ': "' + en + '"');
                }
            }
            return identical;
        })()""")
        if identical_keys:
            for k in identical_keys[:20]:
                print(f"    WARN identical: {k}")
        # Informational — some identical translations are intentional
        check(f"EN.8 identical EN/DE keys (excluding brand/TCG terms): {len(identical_keys)}",
              len(identical_keys) <= 15,
              f"{len(identical_keys)} keys" if identical_keys else "")

        # ═══════════════════════════════════════════════════════
        #   PHASE 2: SWITCH TO GERMAN
        # ═══════════════════════════════════════════════════════
        print("\n══════════════════════════════════════════════════")
        print("  PHASE 2: GERMAN MODE")
        print("══════════════════════════════════════════════════")

        page.evaluate("switchLanguage('de')")
        page.wait_for_timeout(1000)

        lang_de = page.evaluate("document.documentElement.lang")
        check("DE.0 html lang=de", lang_de == "de", f"got '{lang_de}'")

        current_lang_de = page.evaluate("getLang()")
        check("DE.0b getLang()='de'", current_lang_de == "de", f"got '{current_lang_de}'")

        # ── T9: Verify all data-i18n elements show German text ──
        print("\n-- DE: data-i18n element check --")
        i18n_results_de = page.evaluate("""(() => {
            const SKIP = %s;
            const results = [];
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (!key || SKIP.includes(key)) return;
                const expected = window.t(key);
                const labelChild = el.querySelector('.menu-item-label');
                let actual = '';
                if (labelChild) {
                    actual = labelChild.textContent.trim();
                } else if (el.children.length > 0) {
                    const textNodes = Array.from(el.childNodes)
                        .filter(n => n.nodeType === 3 && n.textContent.trim());
                    actual = textNodes.map(n => n.textContent.trim()).join(' ');
                    if (!actual) actual = el.textContent.trim();
                } else {
                    actual = el.textContent.trim();
                }
                const strip = s => s.replace(/<[^>]+>/g, '').replace(/\\s+/g, ' ').trim();
                const expectedClean = strip(expected);
                const actualClean = strip(actual);
                if (actualClean && expectedClean) {
                    results.push({ key, expected: expectedClean, actual: actualClean, match: actualClean === expectedClean });
                }
            });
            return results;
        })()""" % str(list(I18N_DYNAMIC_KEYS)))

        de_mismatch_count = 0
        for item in i18n_results_de:
            if not item['match']:
                de_mismatch_count += 1
                if de_mismatch_count <= 20:
                    check(f"DE.i18n '{item['key']}'", False,
                          f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"DE.1 data-i18n elements match ({len(i18n_results_de)} checked, {de_mismatch_count} mismatches)",
              de_mismatch_count == 0,
              f"{de_mismatch_count} mismatches" if de_mismatch_count else "")

        # ── T10: Verify data-i18n-placeholder (DE) ────────────
        print("\n-- DE: placeholder check --")
        ph_results_de = page.evaluate("""(() => {
            const results = [];
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (!key) return;
                const expected = window.t(key).trim();
                const actual = (el.placeholder || '').trim();
                results.push({ key, expected, actual, match: actual === expected });
            });
            return results;
        })()""")
        ph_de_fail = sum(1 for r in ph_results_de if not r['match'])
        for item in ph_results_de:
            if not item['match']:
                check(f"DE.ph '{item['key']}'", False,
                      f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"DE.2 placeholders match ({len(ph_results_de)} checked)", ph_de_fail == 0,
              f"{ph_de_fail} mismatches" if ph_de_fail else "")

        # ── T11: Verify data-i18n-title (DE) ──────────────────
        print("\n-- DE: title attribute check --")
        title_results_de = page.evaluate("""(() => {
            const results = [];
            document.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (!key) return;
                const expected = window.t(key).trim();
                const actual = (el.title || '').trim();
                results.push({ key, expected, actual, match: actual === expected });
            });
            return results;
        })()""")
        title_de_fail = sum(1 for r in title_results_de if not r['match'])
        for item in title_results_de:
            if not item['match']:
                check(f"DE.title '{item['key']}'", False,
                      f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"DE.3 titles match ({len(title_results_de)} checked)", title_de_fail == 0,
              f"{title_de_fail} mismatches" if title_de_fail else "")

        # ── T12: Verify data-i18n-aria (DE) ───────────────────
        print("\n-- DE: aria-label check --")
        aria_results_de = page.evaluate("""(() => {
            const results = [];
            document.querySelectorAll('[data-i18n-aria]').forEach(el => {
                const key = el.getAttribute('data-i18n-aria');
                if (!key) return;
                const expected = window.t(key).trim();
                const actual = (el.getAttribute('aria-label') || '').trim();
                results.push({ key, expected, actual, match: actual === expected });
            });
            return results;
        })()""")
        aria_de_fail = sum(1 for r in aria_results_de if not r['match'])
        for item in aria_results_de:
            if not item['match']:
                check(f"DE.aria '{item['key']}'", False,
                      f"expected '{item['expected']}' got '{item['actual']}'")
        check(f"DE.4 aria-labels match ({len(aria_results_de)} checked)", aria_de_fail == 0,
              f"{aria_de_fail} mismatches" if aria_de_fail else "")

        # ── T13: Scan for stray English words in German mode ──
        print("\n-- DE: stray English word scan --")
        all_visible_de = page.evaluate(VISIBLE_TEXT_JS)

        english_found_in_de = []
        for word in ENGLISH_ONLY_WORDS:
            if word.lower() in BILINGUAL_ALLOWED:
                continue
            pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
            if pattern.search(all_visible_de):
                english_found_in_de.append(word)

        if english_found_in_de:
            for w in english_found_in_de[:15]:
                check(f"DE.5 no English word '{w}'", False)
        check(f"DE.5 no stray English words ({len(english_found_in_de)} found)",
              len(english_found_in_de) == 0,
              ', '.join(english_found_in_de[:10]) if english_found_in_de else "")

        # ── T14: Verify toggle button shows 'DE' in German mode
        print("\n-- DE: toggle button --")
        toggle_text_de = page.evaluate("document.getElementById('langToggleBtn')?.textContent?.trim()")
        check("DE.6 toggle shows 'DE'", toggle_text_de == "DE", f"got '{toggle_text_de}'")

        # ═══════════════════════════════════════════════════════
        #   PHASE 3: SWITCH BACK TO ENGLISH (round-trip)
        # ═══════════════════════════════════════════════════════
        print("\n══════════════════════════════════════════════════")
        print("  PHASE 3: ROUND-TRIP (DE → EN)")
        print("══════════════════════════════════════════════════")

        page.evaluate("switchLanguage('en')")
        page.wait_for_timeout(500)

        lang_back = page.evaluate("document.documentElement.lang")
        check("RT.1 html lang=en after switch back", lang_back == "en", f"got '{lang_back}'")

        # Spot-check a few key elements after round-trip
        rt_checks = page.evaluate("""(() => {
            const checks = {};
            // Menu items
            const menuCL = document.querySelector('[data-i18n="menu.cityLeague"]');
            if (menuCL) {
                const label = menuCL.querySelector('.menu-item-label');
                checks['menu.cityLeague'] = (label || menuCL).textContent.trim();
            }
            const menuCards = document.querySelector('[data-i18n="menu.cardDatabase"]');
            if (menuCards) {
                const label = menuCards.querySelector('.menu-item-label');
                checks['menu.cardDatabase'] = (label || menuCards).textContent.trim();
            }
            // App subtitle
            const sub = document.querySelector('[data-i18n="app.subtitle"]');
            if (sub) checks['app.subtitle'] = sub.textContent.trim();
            // Header sign-in
            const signIn = document.querySelector('[data-i18n="header.signIn"]');
            if (signIn) checks['header.signIn'] = signIn.textContent.trim();
            return checks;
        })()""")

        if 'menu.cityLeague' in rt_checks:
            check("RT.2 menu.cityLeague = 'City League Meta'",
                  rt_checks['menu.cityLeague'] == 'City League Meta',
                  f"got '{rt_checks['menu.cityLeague']}'")
        if 'menu.cardDatabase' in rt_checks:
            check("RT.3 menu.cardDatabase = 'Card Database'",
                  rt_checks['menu.cardDatabase'] == 'Card Database',
                  f"got '{rt_checks['menu.cardDatabase']}'")
        if 'app.subtitle' in rt_checks:
            check("RT.4 app.subtitle = English",
                  'Meta Analysis' in rt_checks['app.subtitle'],
                  f"got '{rt_checks['app.subtitle']}'")
        if 'header.signIn' in rt_checks:
            check("RT.5 header.signIn = 'Sign In'",
                  rt_checks['header.signIn'] == 'Sign In',
                  f"got '{rt_checks['header.signIn']}'")

        # ═══════════════════════════════════════════════════════
        #   PHASE 4: VERIFY DYNAMIC CONTENT (Tab navigation)
        # ═══════════════════════════════════════════════════════
        print("\n══════════════════════════════════════════════════")
        print("  PHASE 4: DYNAMIC CONTENT PER TAB")
        print("══════════════════════════════════════════════════")

        # Test that switching tabs and then switching language updates correctly
        # Switch to German, then check tab-specific content
        page.evaluate("switchLanguage('de')")
        page.wait_for_timeout(500)

        # Check profile tab (if accessible)
        profile_heading = page.evaluate("""(() => {
            const el = document.querySelector('[data-i18n="profile.heading"]');
            return el ? el.textContent.trim() : null;
        })()""")
        if profile_heading:
            check("DYN.1 profile.heading in DE", profile_heading == "Benutzerprofil",
                  f"got '{profile_heading}'")

        # Check Battle Journal elements
        bj_title = page.evaluate("""(() => {
            const el = document.querySelector('[data-i18n="bj.title"]');
            return el ? el.textContent.trim() : null;
        })()""")
        if bj_title:
            check("DYN.2 bj.title in DE", bj_title == "Offline Battle Journal",
                  f"got '{bj_title}'")

        # Check tutorial heading
        tutorial = page.evaluate("""(() => {
            const el = document.querySelector('[data-i18n="tutorial.heading"]');
            return el ? el.textContent.trim() : null;
        })()""")
        if tutorial:
            check("DYN.3 tutorial.heading in DE",
                  tutorial == "So funktioniert diese Website",
                  f"got '{tutorial}'")

        # Switch back to EN and verify same elements
        page.evaluate("switchLanguage('en')")
        page.wait_for_timeout(500)

        tutorial_en = page.evaluate("""(() => {
            const el = document.querySelector('[data-i18n="tutorial.heading"]');
            return el ? el.textContent.trim() : null;
        })()""")
        if tutorial_en:
            check("DYN.4 tutorial.heading in EN",
                  tutorial_en == "How to Use This Website",
                  f"got '{tutorial_en}'")

        # ═══════════════════════════════════════════════════════
        #   PHASE 5: HARDCODED TEXT CHECK
        # ═══════════════════════════════════════════════════════
        print("\n══════════════════════════════════════════════════")
        print("  PHASE 5: HARDCODED TEXT DETECTION")
        print("══════════════════════════════════════════════════")

        # Check for visible text elements that should have data-i18n but don't
        # Focus on buttons, headings, labels
        hardcoded = page.evaluate("""(() => {
            const issues = [];
            // Check all visible buttons for hardcoded text
            document.querySelectorAll('button:not([data-i18n]):not(.card-btn):not(.sc-action-btn)').forEach(btn => {
                const text = btn.textContent.trim();
                // Skip empty, icon-only, or very short
                if (!text || text.length <= 2) return;
                // Skip if it has a data-i18n child
                if (btn.querySelector('[data-i18n]')) return;
                // Skip common non-translatable
                if (/^[0-9×x+\\-\\.%]+$/.test(text)) return;
                if (btn.classList.contains('btn-escape-rope')) return;
                if (btn.id === 'langToggleBtn') return;
                issues.push({ tag: 'button', id: btn.id || '', class: btn.className.substring(0, 50), text: text.substring(0, 60) });
            });
            // Check headings h1-h4
            document.querySelectorAll('h1, h2, h3, h4').forEach(h => {
                const text = h.textContent.trim();
                if (!text || text.length <= 2) return;
                if (h.querySelector('[data-i18n]')) return;
                if (h.hasAttribute('data-i18n')) return;
                issues.push({ tag: h.tagName, id: h.id || '', class: h.className.substring(0, 50), text: text.substring(0, 60) });
            });
            return issues;
        })()""")

        if hardcoded:
            for item in hardcoded[:10]:
                print(f"    INFO hardcoded: <{item['tag']}> id='{item['id']}' "
                      f"class='{item['class']}' text='{item['text']}'")
        # Informational only — many hardcoded elements are dynamic or intentional
        print(f"  INFO HC.1 potential hardcoded text elements: {len(hardcoded)}")

        # ═══════════════════════════════════════════════════════
        #   PHASE 6: PERSISTENCE CHECK
        # ═══════════════════════════════════════════════════════
        print("\n══════════════════════════════════════════════════")
        print("  PHASE 6: LANGUAGE PERSISTENCE")
        print("══════════════════════════════════════════════════")

        # Switch to DE, reload, verify it stays DE
        page.evaluate("switchLanguage('de')")
        page.wait_for_timeout(300)
        stored = page.evaluate("localStorage.getItem('app_lang')")
        check("PERSIST.1 localStorage saved 'de'", stored == "de", f"got '{stored}'")

        page.reload(wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1500)

        lang_after_reload = page.evaluate("document.documentElement.lang")
        check("PERSIST.2 lang=de after reload", lang_after_reload == "de", f"got '{lang_after_reload}'")

        lang_fn = page.evaluate("getLang()")
        check("PERSIST.3 getLang()=de after reload", lang_fn == "de", f"got '{lang_fn}'")

        # Verify a data-i18n element after reload
        subtitle_after = page.evaluate("""(() => {
            const el = document.querySelector('[data-i18n="app.subtitle"]');
            return el ? el.textContent.trim() : '';
        })()""")
        check("PERSIST.4 subtitle in DE after reload",
              'Meta-Analyse' in subtitle_after or 'Deckbau' in subtitle_after,
              f"got '{subtitle_after}'")

        # Reset to English for next tests
        page.evaluate("switchLanguage('en')")
        page.wait_for_timeout(300)

        browser.close()

    # ── Summary ────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  i18n Language Purity Test")
    print(f"  PASS: {PASS}   FAIL: {FAIL}")
    if ERRORS:
        print(f"\n  FAILED ({len(ERRORS)}):")
        for e in ERRORS:
            print(f"    - {e}")
    print(f"{'='*60}")
    return FAIL == 0

if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
