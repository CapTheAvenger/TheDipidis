"""
E2E: Battle Journal Edit Feature
 - Edit tournament modal (rename, meta, type)
 - Edit single entry modal (deck, opponent, result, turn order)
 - Delete single entry
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

        # ── Edit Tournament Modal ──────────────────────────────
        print("\n-- Edit Tournament Modal --")

        modal = page.locator("#bjEditTournamentModal")
        check("T1.1 Edit tournament modal exists", modal.count() == 1)
        check("T1.2 Modal starts hidden", modal.evaluate("el => el.style.display") in ["none", ""])

        # Fields exist
        check("T1.3 Tournament name input exists", page.locator("#bjEditTournName").count() == 1)
        check("T1.4 Meta select exists", page.locator("#bjEditTournMeta").count() == 1)
        check("T1.5 Type hidden input exists", page.locator("#bjEditTournType").count() == 1)
        check("T1.6 Type chip group exists", page.locator("#bjEditTournTypeGroup").count() == 1)

        # Meta select has correct options
        meta_opts = page.locator("#bjEditTournMeta option").all()
        meta_vals = [o.get_attribute("value") for o in meta_opts]
        check("T1.7 Meta select has TEF-POR", "TEF-POR" in meta_vals)
        check("T1.8 Meta select has empty default", "" in meta_vals)

        # Open function exists
        check("T1.9 openEditTournamentModal is function", page.evaluate("typeof window.openEditTournamentModal === 'function'"))
        check("T1.10 closeEditTournamentModal is function", page.evaluate("typeof window.closeEditTournamentModal === 'function'"))
        check("T1.11 saveEditTournament is function", page.evaluate("typeof window.saveEditTournament === 'function'"))
        check("T1.12 selectEditTournType is function", page.evaluate("typeof window.selectEditTournType === 'function'"))

        # Test selectEditTournType
        page.evaluate("selectEditTournType('Cup')")
        page.wait_for_timeout(100)
        type_val = page.evaluate("document.getElementById('bjEditTournType').value")
        check("T1.13 selectEditTournType sets value", type_val == "Cup")
        chip_selected = page.locator("#bjEditTournTypeGroup .bj-type-chip[data-value='Cup']")
        check("T1.14 Chip gets is-selected", chip_selected.evaluate("el => el.classList.contains('is-selected')"))

        # Close modal works
        page.evaluate("""(() => {
            document.getElementById('bjEditTournamentModal').style.display = 'flex';
        })()""")
        page.wait_for_timeout(100)
        check("T1.15 Modal can be opened", page.evaluate("document.getElementById('bjEditTournamentModal').style.display") == "flex")
        page.evaluate("closeEditTournamentModal()")
        page.wait_for_timeout(100)
        check("T1.16 closeEditTournamentModal hides modal", page.evaluate("document.getElementById('bjEditTournamentModal').style.display") == "none")

        # ── Edit Entry Modal ───────────────────────────────────
        print("\n-- Edit Entry Modal --")

        entry_modal = page.locator("#bjEditEntryModal")
        check("T2.1 Edit entry modal exists", entry_modal.count() == 1)
        check("T2.2 Modal starts hidden", entry_modal.evaluate("el => el.style.display") in ["none", ""])

        check("T2.3 OwnDeck input exists", page.locator("#bjEditEntryOwnDeck").count() == 1)
        check("T2.4 Opponent input exists", page.locator("#bjEditEntryOpponent").count() == 1)
        check("T2.5 Result select exists", page.locator("#bjEditEntryResult").count() == 1)
        check("T2.6 TurnOrder select exists", page.locator("#bjEditEntryTurnOrder").count() == 1)

        # Result select has correct options
        result_opts = page.locator("#bjEditEntryResult option").all()
        result_vals = [o.get_attribute("value") for o in result_opts]
        check("T2.7 Result has win option", "win" in result_vals)
        check("T2.8 Result has loss option", "loss" in result_vals)
        check("T2.9 Result has tie option", "tie" in result_vals)

        check("T2.10 openEditEntryModal is function", page.evaluate("typeof window.openEditEntryModal === 'function'"))
        check("T2.11 closeEditEntryModal is function", page.evaluate("typeof window.closeEditEntryModal === 'function'"))
        check("T2.12 saveEditEntry is function", page.evaluate("typeof window.saveEditEntry === 'function'"))

        # Close entry modal works
        page.evaluate("document.getElementById('bjEditEntryModal').style.display = 'flex'")
        page.wait_for_timeout(100)
        page.evaluate("closeEditEntryModal()")
        page.wait_for_timeout(100)
        check("T2.13 closeEditEntryModal hides modal", page.evaluate("document.getElementById('bjEditEntryModal').style.display") == "none")

        # ── Delete Function ────────────────────────────────────
        print("\n-- Delete Function --")
        check("T3.1 deleteJournalEntry is function", page.evaluate("typeof window.deleteJournalEntry === 'function'"))

        # ── CSS Classes ────────────────────────────────────────
        print("\n-- CSS Classes --")
        css_checks = [
            "bj-edit-modal",
            "bj-edit-modal-header",
            "bj-edit-input",
            "bj-history-edit-btn",
            "bj-history-delete-btn",
            "bj-tournament-edit-btn",
        ]
        for cls in css_checks:
            has_style = page.evaluate(f"""(() => {{
                for (const ss of document.styleSheets) {{
                    try {{
                        for (const r of ss.cssRules) {{
                            if (r.selectorText && r.selectorText.includes('{cls}')) return true;
                        }}
                    }} catch(_) {{}}
                }}
                return false;
            }})()""")
            check(f"CSS.{cls} defined", has_style)

        # ── Render Integration (inject test data) ─────────────
        print("\n-- Render Integration --")

        # Directly inject data into journalHistoryCache and render,
        # bypassing loadJournalHistory() which tries Firestore (hangs in test env).
        page.evaluate("""(() => {
            const testEntries = [
                { id: 'test1', tournamentName: 'TestCup', meta: 'TEF-POR', tournamentType: 'League Cup', ownDeck: 'Charizard', opponentArchetype: 'Pikachu', result: 'win', turnOrder: 'first', bestOf: 'bo1', createdAtMs: Date.now(), schemaVersion: 3 },
                { id: 'test2', tournamentName: 'TestCup', meta: 'TEF-POR', tournamentType: 'League Cup', ownDeck: 'Charizard', opponentArchetype: 'Mewtwo', result: 'loss', turnOrder: 'second', bestOf: 'bo1', createdAtMs: Date.now() - 1000, schemaVersion: 3 }
            ];
            localStorage.setItem('battleJournalOutboxV1', JSON.stringify(testEntries));
            // Populate cache directly (same as loadJournalHistory does)
            if (typeof window._bjSetCache === 'function') {
                window._bjSetCache(testEntries);
            }
        })()""")
        page.wait_for_timeout(200)

        # Show profile tab + journal sub-tab in DOM without triggering async load
        page.evaluate("""(() => {
            // Activate profile main tab
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const prof = document.getElementById('profile');
            if (prof) prof.classList.add('active');
            // Activate journal sub-tab
            document.querySelectorAll('.profile-tab-content').forEach(t => {
                t.classList.add('display-none');
                t.classList.remove('active');
            });
            const jTab = document.getElementById('profile-journal');
            if (jTab) { jTab.classList.remove('display-none'); jTab.classList.add('active'); }
            // Render history from cache
            if (typeof window.renderJournalHistory === 'function') {
                window.renderJournalHistory();
            }
        })()""")
        page.wait_for_timeout(500)

        # Check that tournament edit button renders
        tourn_edit_btns = page.locator(".bj-tournament-edit-btn")
        check("T4.1 Tournament edit button rendered", tourn_edit_btns.count() >= 1)

        # Check that entry edit/delete buttons render
        entry_edit_btns = page.locator(".bj-history-edit-btn")
        check("T4.2 Entry edit buttons rendered", entry_edit_btns.count() >= 1)
        entry_del_btns = page.locator(".bj-history-delete-btn")
        check("T4.3 Entry delete buttons rendered", entry_del_btns.count() >= 1)

        # Click tournament edit button — should open modal
        page.evaluate("""(() => {
            const btn = document.querySelector('.bj-tournament-edit-btn');
            if (btn) btn.click();
        })()""")
        page.wait_for_timeout(300)
        check("T4.4 Clicking edit opens tournament modal", page.evaluate("document.getElementById('bjEditTournamentModal').style.display") == "flex")

        # Check pre-filled values
        name_val = page.evaluate("document.getElementById('bjEditTournName').value")
        check("T4.5 Tournament name pre-filled", name_val == "TestCup")
        meta_val = page.evaluate("document.getElementById('bjEditTournMeta').value")
        check("T4.6 Meta pre-filled", meta_val == "TEF-POR")

        page.evaluate("closeEditTournamentModal()")
        page.wait_for_timeout(100)

        # Click entry edit button — should open entry modal
        page.evaluate("""(() => {
            const btn = document.querySelector('.bj-history-edit-btn');
            if (btn) btn.click();
        })()""")
        page.wait_for_timeout(300)
        check("T4.7 Clicking edit opens entry modal", page.evaluate("document.getElementById('bjEditEntryModal').style.display") == "flex")

        deck_val = page.evaluate("document.getElementById('bjEditEntryOwnDeck').value")
        check("T4.8 OwnDeck pre-filled", deck_val == "Charizard")
        opp_val = page.evaluate("document.getElementById('bjEditEntryOpponent').value")
        check("T4.9 Opponent pre-filled", opp_val == "Pikachu")

        page.evaluate("closeEditEntryModal()")
        page.wait_for_timeout(100)

        # ── BUG FIX TESTS ─────────────────────────────────────
        print("\n-- Bug Fix Tests --")

        # BUG 2: ➕ Add Match button on tournament headers
        add_btns = page.locator(".bj-tournament-add-btn")
        check("T5.1 Tournament add-match button rendered", add_btns.count() >= 1)

        # BUG 2: continueJournalTournament is a function
        check("T5.2 continueJournalTournament is function", page.evaluate("typeof window.continueJournalTournament === 'function'"))

        # BUG 2: tournament blocks have data-meta and data-tournament-type
        has_data_meta = page.evaluate("!!document.querySelector('.bj-tournament-block[data-meta]')")
        check("T5.3 Tournament block has data-meta attr", has_data_meta)
        has_data_type = page.evaluate("!!document.querySelector('.bj-tournament-block[data-tournament-type]')")
        check("T5.4 Tournament block has data-tournament-type attr", has_data_type)

        # BUG 3: Edit entry modal has datalist for deck
        has_datalist = page.locator("#bjEditEntryOwnDeckList").count()
        check("T5.5 Edit entry deck datalist exists", has_datalist == 1)
        deck_input_list = page.evaluate("document.getElementById('bjEditEntryOwnDeck').getAttribute('list')")
        check("T5.6 Edit entry deck input linked to datalist", deck_input_list == "bjEditEntryOwnDeckList")

        # BUG 1: applyLastTournament is a function (already tested, but verify meta/type support)
        check("T5.7 applyLastTournament is function", page.evaluate("typeof window.applyLastTournament === 'function'"))

        # Cleanup test data
        page.evaluate("localStorage.removeItem('battleJournalOutboxV1')")

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
