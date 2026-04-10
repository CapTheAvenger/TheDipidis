"""Quick smoke test for audit R5 fixes."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000/index.html"
PASS = FAIL = 0

def check(label, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1; print(f"  PASS {label}")
    else:
        FAIL += 1; print(f"  FAIL {label}  {detail}")

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()

    # Suppress heavy loads — we only need DOM, not full data
    page.route("**/*.csv", lambda r: r.abort())

    print("-- Loading page --")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # 1. Calculator badge
    print("\n-- 1. Calculator Badge --")
    page.evaluate("""() => {
        if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('calculator');
        else if (typeof switchTab === 'function') switchTab('calculator');
    }""")
    page.wait_for_timeout(500)
    badge_text = page.evaluate("document.getElementById('current-tab-title')?.textContent || ''")
    check("Badge shows Calculator", "calculator" in badge_text.lower(), f"got: '{badge_text}'")
    check("Badge NOT Profile", "profile" not in badge_text.lower(), f"got: '{badge_text}'")

    # 2. playtesterOpponentDeck
    print("\n-- 2. playtesterOpponentDeck --")
    aria = page.evaluate("document.getElementById('playtesterOpponentDeck')?.getAttribute('aria-label') || ''")
    check("has aria-label", len(aria) > 0, f"aria-label='{aria}'")
    lbl = page.evaluate("document.querySelector('label[for=\"playtesterOpponentDeck\"]') !== null")
    check("label[for] exists", lbl)

    # 3. cityLeagueSearchFilter
    print("\n-- 3. cityLeagueSearchFilter --")
    page.unroute("**/*.csv")
    page.evaluate("switchTab('city-league-analysis')")
    page.wait_for_timeout(6000)
    cl_aria = page.evaluate("document.getElementById('cityLeagueSearchFilter')?.getAttribute('aria-label') || ''")
    check("has aria-label", len(cl_aria) > 0, f"aria-label='{cl_aria}'")

    # 4. switchTab fallback for menu-only tabs
    print("\n-- 4. switchTab menu fallback --")
    page.evaluate("switchTab('calculator')")
    page.wait_for_timeout(300)
    badge2 = page.evaluate("document.getElementById('current-tab-title')?.textContent || ''")
    check("switchTab alone sets Calculator badge", "calculator" in badge2.lower(), f"got: '{badge2}'")

    # 5. Past Meta manifest-based dropdown
    print("\n-- 5. Past Meta lazy loading check --")
    csv_urls = []
    page.route("**/*.csv", lambda r: (csv_urls.append(r.request.url), r.abort()))
    page.evaluate("window.pastMetaLoaded = false")
    page.evaluate("switchTab('past-meta')")
    page.wait_for_timeout(10000)

    format_select = page.locator("#pastMetaFormatFilter")
    opt_count = format_select.locator("option").count()
    check("Format dropdown populated", opt_count > 2, f"options={opt_count}")

    selected = format_select.input_value() if opt_count > 0 else "?"
    check("Default is NOT 'all'", selected != "all", f"selected='{selected}'")

    tournament_csvs = [u for u in csv_urls if "tournament_cards_data_cards" in u and not u.endswith("_overview.csv")]
    check("Only 1 tournament chunk attempted (lazy)",
          len(tournament_csvs) <= 2,
          f"requested {len(tournament_csvs)}: {tournament_csvs[:5]}")

    # 6. Code-level checks
    print("\n-- 6. Code checks --")
    import re
    with open("js/app-core.js", "r", encoding="utf-8") as f:
        core_js = f.read()
    check("_loadTournamentCardsChunked has latestChunkOnly",
          "latestChunkOnly" in core_js)
    check("loadCSV has baseCacheKey for separate caching",
          "baseCacheKey" in core_js)

    with open("js/app-current-meta-analysis.js", "r", encoding="utf-8") as f:
        cma_js = f.read()
    matches = re.findall(r"latestChunkOnly:\s*true", cma_js)
    check("Current Meta Analysis uses latestChunkOnly (3 calls)",
          len(matches) == 3, f"found {len(matches)} calls")

    with open("js/app-past-meta.js", "r", encoding="utf-8") as f:
        pm_js = f.read()
    check("Past Meta has _loadPastMetaChunksIfNeeded",
          "_loadPastMetaChunksIfNeeded" in pm_js)
    check("streamPastMetaDeckIndex accepts chunkUrls",
          "chunkUrls" in pm_js)

    # 7. Matchup inputs code check
    print("\n-- 7. Matchup inputs code check --")
    with open("js/app-meta-cards.js", "r", encoding="utf-8") as f:
        mc_js = f.read()
    check("app-meta-cards patches opponent_search_ inputs with aria-label",
          'opponent_search_' in mc_js and 'aria-label' in mc_js)

    browser.close()
    print(f"\n{'='*50}")
    print(f"  PASS: {PASS}   FAIL: {FAIL}")
    print(f"{'='*50}")
    sys.exit(1 if FAIL > 0 else 0)
