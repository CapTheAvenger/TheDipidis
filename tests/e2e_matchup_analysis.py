"""
E2E: Matchup Analysis Modal
 - Modal open/close
 - Filter selects (My Deck, Meta, Type, Tournament)
 - Summary stats rendering
 - Heatmap rendering
 - Ranking lists rendering
 - Bar list rendering
 - CSS classes defined
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000/index.html"
PASS = 0
FAIL = 0
ERRORS = []

def check(name, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS {name}")
    else:
        FAIL += 1
        ERRORS.append(name)
        print(f"  FAIL {name}")

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # ── Modal Structure ──────────────────────────────────
        print("\n-- Modal Structure --")

        modal = page.locator("#matchupAnalysisModal")
        check("T1.1 Modal exists", modal.count() == 1)
        check("T1.2 Modal starts hidden", modal.evaluate("el => el.style.display") in ["none", ""])

        # Filter selects
        check("T1.3 maFilterDeck exists", page.locator("#maFilterDeck").count() == 1)
        check("T1.4 maFilterMeta exists", page.locator("#maFilterMeta").count() == 1)
        check("T1.5 maFilterType exists", page.locator("#maFilterType").count() == 1)
        check("T1.6 maFilterTournament exists", page.locator("#maFilterTournament").count() == 1)

        # Content sections
        check("T1.7 maSummaryStats exists", page.locator("#maSummaryStats").count() == 1)
        check("T1.8 maHeatmapWrap exists", page.locator("#maHeatmapWrap").count() == 1)
        check("T1.9 maRankBest exists", page.locator("#maRankBest").count() == 1)
        check("T1.10 maRankWorst exists", page.locator("#maRankWorst").count() == 1)
        check("T1.11 maBarList exists", page.locator("#maBarList").count() == 1)
        check("T1.12 maSubtitle exists", page.locator("#maSubtitle").count() == 1)

        # ── JS Functions ──────────────────────────────────────
        print("\n-- JS Functions --")

        check("T2.1 openMatchupAnalysisModal is function", page.evaluate("typeof window.openMatchupAnalysisModal === 'function'"))
        check("T2.2 closeMatchupAnalysisModal is function", page.evaluate("typeof window.closeMatchupAnalysisModal === 'function'"))
        check("T2.3 renderMatchupAnalysis is function", page.evaluate("typeof window.renderMatchupAnalysis === 'function'"))
        check("T2.4 toggleMatchupStats is function", page.evaluate("typeof window.toggleMatchupStats === 'function'"))
        check("T2.5 renderMatchupHeatmap is function", page.evaluate("typeof window.renderMatchupHeatmap === 'function'"))

        # ── CSS Classes ───────────────────────────────────────
        print("\n-- CSS Classes --")

        css_classes = [
            "ma-modal-shell", "ma-modal-header", "ma-modal-title",
            "ma-modal-close", "ma-filter-bar", "ma-filter-select",
            "ma-summary-stats", "ma-stat", "ma-section",
            "ma-heatmap-table", "ma-heatmap-cell", "ma-heatmap-good",
            "ma-heatmap-mid", "ma-heatmap-bad", "ma-rank-item",
            "ma-rank-name", "ma-rank-wr"
        ]
        for cls in css_classes:
            has_style = page.evaluate(f"""(() => {{
                for (const sheet of document.styleSheets) {{
                    try {{
                        for (const rule of sheet.cssRules) {{
                            if (rule.selectorText && rule.selectorText.includes('.{cls}')) return true;
                        }}
                    }} catch(_) {{}}
                }}
                return false;
            }})()""")
            check(f"CSS.{cls} defined", has_style)

        # ── Render Integration ────────────────────────────────
        print("\n-- Render Integration --")

        # Inject test data
        page.evaluate("""(() => {
            const testEntries = [
                { id: 't1', tournamentName: 'Cup Alpha', meta: 'TEF-POR', tournamentType: 'League Cup', ownDeck: 'Charizard', opponentArchetype: 'Pikachu', result: 'win', turnOrder: 'first', bestOf: 'bo1', createdAtMs: Date.now(), schemaVersion: 3 },
                { id: 't2', tournamentName: 'Cup Alpha', meta: 'TEF-POR', tournamentType: 'League Cup', ownDeck: 'Charizard', opponentArchetype: 'Mewtwo', result: 'loss', turnOrder: 'second', bestOf: 'bo1', createdAtMs: Date.now() - 1000, schemaVersion: 3 },
                { id: 't3', tournamentName: 'Cup Alpha', meta: 'TEF-POR', tournamentType: 'League Cup', ownDeck: 'Charizard', opponentArchetype: 'Pikachu', result: 'win', turnOrder: 'first', bestOf: 'bo1', createdAtMs: Date.now() - 2000, schemaVersion: 3 },
                { id: 't4', tournamentName: 'Regional Beta', meta: 'SVI-ASC', tournamentType: 'Regional', ownDeck: 'Gardevoir', opponentArchetype: 'Pikachu', result: 'loss', turnOrder: 'second', bestOf: 'bo3', createdAtMs: Date.now() - 3000, schemaVersion: 3 },
                { id: 't5', tournamentName: 'Regional Beta', meta: 'SVI-ASC', tournamentType: 'Regional', ownDeck: 'Gardevoir', opponentArchetype: 'Charizard', result: 'win', turnOrder: 'first', bestOf: 'bo3', createdAtMs: Date.now() - 4000, schemaVersion: 3 },
                { id: 't6', tournamentName: 'Regional Beta', meta: 'SVI-ASC', tournamentType: 'Regional', ownDeck: 'Gardevoir', opponentArchetype: 'Pikachu', result: 'win', turnOrder: 'first', bestOf: 'bo3', createdAtMs: Date.now() - 5000, schemaVersion: 3 }
            ];
            if (typeof window._bjSetCache === 'function') {
                window._bjSetCache(testEntries);
            }
        })()""")
        page.wait_for_timeout(200)

        # Open modal
        page.evaluate("openMatchupAnalysisModal()")
        page.wait_for_timeout(500)
        check("T3.1 Modal opens", page.evaluate("document.getElementById('matchupAnalysisModal').style.display") == "flex")

        # Check subtitle
        subtitle = page.evaluate("document.getElementById('maSubtitle').textContent")
        check("T3.2 Subtitle shows match count", "6" in subtitle)

        # Check summary stats rendered
        stats_html = page.evaluate("document.getElementById('maSummaryStats').innerHTML")
        check("T3.3 Summary stats rendered", "Matches" in stats_html)
        check("T3.4 Summary shows wins", "Wins" in stats_html)

        # Check filter selects populated
        deck_opts = page.evaluate("Array.from(document.getElementById('maFilterDeck').options).map(o => o.value)")
        check("T3.5 Deck filter has Charizard", "Charizard" in deck_opts)
        check("T3.6 Deck filter has Gardevoir", "Gardevoir" in deck_opts)

        meta_opts = page.evaluate("Array.from(document.getElementById('maFilterMeta').options).map(o => o.value)")
        check("T3.7 Meta filter has TEF-POR", "TEF-POR" in meta_opts)
        check("T3.8 Meta filter has SVI-ASC", "SVI-ASC" in meta_opts)

        type_opts = page.evaluate("Array.from(document.getElementById('maFilterType').options).map(o => o.value)")
        check("T3.9 Type filter has League Cup", "League Cup" in type_opts)
        check("T3.10 Type filter has Regional", "Regional" in type_opts)

        tourn_opts = page.evaluate("Array.from(document.getElementById('maFilterTournament').options).map(o => o.value)")
        check("T3.11 Tournament filter has Cup Alpha", "Cup Alpha" in tourn_opts)

        # Check heatmap rendered (2 decks: Charizard + Gardevoir)
        heatmap_html = page.evaluate("document.getElementById('maHeatmapWrap').innerHTML")
        check("T3.12 Heatmap table rendered", "ma-heatmap-table" in heatmap_html)
        check("T3.13 Heatmap has cells", "ma-heatmap-cell" in heatmap_html)

        # Check rankings rendered
        best_html = page.evaluate("document.getElementById('maRankBest').innerHTML")
        check("T3.14 Best rankings rendered", "ma-rank-item" in best_html)

        # Check bar list rendered
        bar_html = page.evaluate("document.getElementById('maBarList').innerHTML")
        check("T3.15 Bar list rendered", "bj-matchup-grid" in bar_html)
        check("T3.16 Bar list has Pikachu", "Pikachu" in bar_html)

        # ── Filter interaction ────────────────────────────────
        print("\n-- Filter Interaction --")

        # Filter by deck
        page.evaluate("document.getElementById('maFilterDeck').value = 'Charizard'; renderMatchupAnalysis()")
        page.wait_for_timeout(200)
        subtitle2 = page.evaluate("document.getElementById('maSubtitle').textContent")
        check("T4.1 Deck filter applied (subtitle)", "3" in subtitle2 and "Charizard" in subtitle2)

        # With single deck, heatmap might say 'Need at least 2'
        hm2 = page.evaluate("document.getElementById('maHeatmapWrap').textContent")
        check("T4.2 Heatmap adapts to single deck", "2" in hm2 or "ma-heatmap" in page.evaluate("document.getElementById('maHeatmapWrap').innerHTML"))

        # Reset filter
        page.evaluate("document.getElementById('maFilterDeck').value = ''; renderMatchupAnalysis()")
        page.wait_for_timeout(200)

        # Filter by meta
        page.evaluate("document.getElementById('maFilterMeta').value = 'SVI-ASC'; renderMatchupAnalysis()")
        page.wait_for_timeout(200)
        subtitle3 = page.evaluate("document.getElementById('maSubtitle').textContent")
        check("T4.3 Meta filter applied", "3" in subtitle3)

        page.evaluate("document.getElementById('maFilterMeta').value = ''; renderMatchupAnalysis()")
        page.wait_for_timeout(100)

        # ── Close Modal ───────────────────────────────────────
        print("\n-- Close Modal --")
        page.evaluate("closeMatchupAnalysisModal()")
        page.wait_for_timeout(200)
        check("T5.1 Modal closed", page.evaluate("document.getElementById('matchupAnalysisModal').style.display") == "none")

        # Test toggleMatchupStats opens modal
        page.evaluate("toggleMatchupStats()")
        page.wait_for_timeout(300)
        check("T5.2 toggleMatchupStats opens modal", page.evaluate("document.getElementById('matchupAnalysisModal').style.display") == "flex")
        page.evaluate("closeMatchupAnalysisModal()")

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
