"""E2E – Mobile Audit verification (deck layout, grid preview modal, profile tabs)."""
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

    # Mobile viewport
    ctx = browser.new_context(viewport={"width": 430, "height": 690})
    page = ctx.new_page()

    # Block heavy CSVs
    page.route("**/*tournament_cards*.csv", lambda r: r.abort())

    print("-- Loading page --")
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    # ── 1. Profile Sub-Tabs scrollable ────────────────────
    print("\n-- 1. Profile Sub-Tabs --")
    page.evaluate("switchTab('profile')")
    page.wait_for_timeout(1000)

    nav = page.locator("#profile-tab-nav")
    check("profile-tab-nav has id", nav.count() > 0)

    if nav.count() > 0:
        overflow = nav.evaluate("el => getComputedStyle(el).overflowX")
        check("overflow-x is auto", overflow == "auto", f"got: {overflow}")

        wrap = nav.evaluate("el => getComputedStyle(el).flexWrap")
        check("flex-wrap is nowrap", wrap == "nowrap", f"got: {wrap}")

        # Tabs should not wrap — container height should be small
        nav_height = nav.evaluate("el => el.getBoundingClientRect().height")
        check("Tab nav height < 80px (no wrapping)", nav_height < 80, f"height={nav_height}px")

    # ── 2. Deck Grid Preview Modal HTML present ───────────
    print("\n-- 2. Deck Grid Preview Modal --")
    modal = page.locator("#deckGridPreviewModal")
    check("deckGridPreviewModal exists in DOM", modal.count() > 0)

    title_el = page.locator("#deckGridPreviewTitle")
    check("deckGridPreviewTitle exists", title_el.count() > 0)

    cards_el = page.locator("#deckGridPreviewCards")
    check("deckGridPreviewCards container exists", cards_el.count() > 0)

    save_btn = page.locator("#deckGridSaveBtn")
    check("deckGridSaveBtn exists", save_btn.count() > 0)

    # Check modal is initially hidden
    display = modal.evaluate("el => el.style.display")
    check("Modal initially hidden", display == "none", f"display={display}")

    # ── 3. Code checks: class names in firebase-collection.js ─────
    print("\n-- 3. Code structure checks --")
    with open("js/firebase-collection.js", "r", encoding="utf-8") as f:
        fc_js = f.read()
    check("deck-header-row class in template", "deck-header-row" in fc_js)
    check("deck-name-col class in template", "deck-name-col" in fc_js)
    check("deck-action-buttons class in template", "deck-action-buttons" in fc_js)

    with open("js/app-deck-builder.js", "r", encoding="utf-8") as f:
        db_js = f.read()
    check("exportSavedDeckAsImage opens deckGridPreviewModal",
          "deckGridPreviewModal" in db_js and "deckGridPreviewTitle" in db_js)
    check("closeDeckGridPreview function exists", "closeDeckGridPreview" in db_js)
    check("saveDeckGridAsImage function exists", "saveDeckGridAsImage" in db_js)
    check("_currentPreviewDeckIndex variable", "_currentPreviewDeckIndex" in db_js)

    # ── 4. Mobile CSS checks ──────────────────────────────
    print("\n-- 4. Mobile CSS --")
    with open("css/mobile-responsive.css", "r", encoding="utf-8") as f:
        css = f.read()
    check("deck-header-row in mobile CSS", ".deck-header-row" in css)
    check("deck-action-buttons in mobile CSS", ".deck-action-buttons" in css)
    check("profile-tab-nav in CSS", "#profile-tab-nav" in css)
    check("webkit-scrollbar hidden for tabs", "profile-tab-nav::-webkit-scrollbar" in css)

    # ── 5. Function callable checks ───────────────────────
    print("\n-- 5. JS function availability --")
    has_export = page.evaluate("typeof exportSavedDeckAsImage === 'function'")
    check("exportSavedDeckAsImage is a function", has_export)

    has_close = page.evaluate("typeof closeDeckGridPreview === 'function'")
    check("closeDeckGridPreview is a function", has_close)

    has_save = page.evaluate("typeof saveDeckGridAsImage === 'function'")
    check("saveDeckGridAsImage is a function", has_save)

    browser.close()
    print(f"\n{'='*50}")
    print(f"  PASS: {PASS}   FAIL: {FAIL}")
    print(f"{'='*50}")
    sys.exit(1 if FAIL > 0 else 0)
