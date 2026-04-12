"""
E2E: Battle Journal Overhaul — 5 Tasks
 1. Meta + tournamentType fields in form & data model
 2. 3-level hierarchy history (Meta → Tournament → Matches)
 3. Improved history item design + tournament share-as-image
 4. Matchup heatmap statistics
 5. Filters for meta + tournament type
"""
import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000/index.html"
PASS = 0
FAIL = 0
ERRORS = []

def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        ERRORS.append(name)
        print(f"  ❌ {name}")

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # ── Task 1: Form Fields ────────────────────────────────
        print("\n── Task 1: Meta + Tournament Type Fields ──")

        # Open battle journal sheet
        page.evaluate("openBattleJournalSheet()")
        page.wait_for_timeout(500)

        # 1a. Meta format select exists
        meta_select = page.locator("#battleJournalMeta")
        check("T1.1 Meta format select exists", meta_select.count() == 1)

        # 1b. Meta select has known options
        options = meta_select.locator("option").all()
        option_values = [o.get_attribute("value") for o in options]
        check("T1.2 Meta select has TEF-POR option", "TEF-POR" in option_values)
        check("T1.3 Meta select has SVI-ASC option", "SVI-ASC" in option_values)

        # 1c. Tournament type hidden input exists
        type_input = page.locator("#battleJournalType")
        check("T1.4 Tournament type hidden input exists", type_input.count() == 1)

        # 1d. Type chip buttons exist
        chips = page.locator(".bj-type-chip")
        check("T1.5 Type chip buttons exist (>=5)", chips.count() >= 5)

        # 1e. Click a type chip and check hidden input
        page.evaluate("selectJournalType('City League')")
        page.wait_for_timeout(200)
        type_val = page.evaluate("document.getElementById('battleJournalType').value")
        check("T1.6 selectJournalType sets hidden input", type_val == "City League")

        # 1f. Chip gets is-selected class
        city_chip = page.locator(".bj-type-chip[data-value='City League']")
        check("T1.7 Chip gets is-selected class", city_chip.evaluate("el => el.classList.contains('is-selected')"))

        # 1g. Meta + type in buildBattleJournalEntry
        page.locator("#battleJournalMeta").select_option("TEF-POR")
        check("T1.8 Meta select can be set to TEF-POR", page.evaluate("document.getElementById('battleJournalMeta').value") == "TEF-POR")

        # 1h. Close and reopen — form should reset
        page.evaluate("closeBattleJournalSheet()")
        page.wait_for_timeout(300)
        page.evaluate("openBattleJournalSheet()")
        page.wait_for_timeout(300)
        meta_after = page.evaluate("document.getElementById('battleJournalMeta').value")
        type_after = page.evaluate("document.getElementById('battleJournalType').value")
        check("T1.9 Form reset clears meta", meta_after == "")
        check("T1.10 Form reset clears type", type_after == "")

        page.evaluate("closeBattleJournalSheet()")
        page.wait_for_timeout(300)

        # ── Task 2 + 5: History Filters ────────────────────────
        print("\n── Task 2 & 5: History Hierarchy + Filters ──")

        # Navigate to profile journal tab
        page.evaluate("switchTab('profile')")
        page.wait_for_timeout(500)

        # Open journal sub-tab
        page.evaluate("switchProfileTab('journal')")
        page.wait_for_timeout(500)

        # 2a. Filter selects exist
        meta_filter = page.locator("#journalFilterMeta")
        check("T2.1 Meta filter select exists", meta_filter.count() == 1)

        type_filter = page.locator("#journalFilterType")
        check("T2.2 Type filter select exists", type_filter.count() == 1)

        tourn_filter = page.locator("#journalFilterTournament")
        check("T2.3 Tournament filter still exists", tourn_filter.count() == 1)

        result_filter = page.locator("#journalFilterResult")
        check("T2.4 Result filter still exists", result_filter.count() == 1)

        # ── Task 4: Matchup Heatmap ────────────────────────────
        print("\n── Task 4: Matchup Heatmap ──")

        matchup_panel = page.locator("#journalMatchupStats")
        check("T4.1 Matchup stats panel exists", matchup_panel.count() == 1)
        check("T4.2 Matchup panel starts hidden", matchup_panel.evaluate("el => el.classList.contains('display-none')"))

        # Toggle button exists
        toggle_btn = page.locator("button:has-text('Matchups')")
        check("T4.3 Matchups toggle button exists", toggle_btn.count() >= 1)

        # Toggle opens the panel
        page.evaluate("toggleMatchupStats()")
        page.wait_for_timeout(200)
        check("T4.4 toggleMatchupStats opens panel", not matchup_panel.evaluate("el => el.classList.contains('display-none')"))

        # Toggle closes it again
        page.evaluate("toggleMatchupStats()")
        page.wait_for_timeout(200)
        check("T4.5 toggleMatchupStats closes panel", matchup_panel.evaluate("el => el.classList.contains('display-none')"))

        # ── Task 3: Share function exists ──────────────────────
        print("\n── Task 3: Share Tournament Summary ──")

        share_fn = page.evaluate("typeof window.shareTournamentSummary === 'function'")
        check("T3.1 shareTournamentSummary is a function", share_fn)

        # ── JS Functions exist ─────────────────────────────────
        print("\n── JS Function Exports ──")

        check("T-FN.1 selectJournalType exported", page.evaluate("typeof window.selectJournalType === 'function'"))
        check("T-FN.2 renderMatchupHeatmap exported", page.evaluate("typeof window.renderMatchupHeatmap === 'function'"))
        check("T-FN.3 toggleMatchupStats exported", page.evaluate("typeof window.toggleMatchupStats === 'function'"))
        check("T-FN.4 renderJournalHistory exported", page.evaluate("typeof window.renderJournalHistory === 'function'"))

        # ── CSS Classes ────────────────────────────────────────
        print("\n── CSS Classes ──")

        css_checks = [
            ("bj-type-chip", ".bj-type-chip"),
            ("bj-meta-folder-header", ".bj-meta-folder-header"),
            ("bj-tournament-block", ".bj-tournament-block"),
            ("bj-matchup-grid", ".bj-matchup-grid"),
        ]
        for label, sel in css_checks:
            has_style = page.evaluate(f"""(() => {{
                for (const ss of document.styleSheets) {{
                    try {{
                        for (const r of ss.cssRules) {{
                            if (r.selectorText && r.selectorText.includes('{sel.replace(".", "")}')) return true;
                        }}
                    }} catch(_) {{}}
                }}
                return false;
            }})()""")
            check(f"CSS.{label} defined in stylesheet", has_style)

        browser.close()

    # ── Summary ────────────────────────────────────────────
    print(f"\n{'='*50}")
    print(f"  PASS: {PASS}   FAIL: {FAIL}")
    if ERRORS:
        print("  FAILED:")
        for e in ERRORS:
            print(f"    - {e}")
    print(f"{'='*50}")
    return FAIL == 0

if __name__ == "__main__":
    ok = run()
    sys.exit(0 if ok else 1)
