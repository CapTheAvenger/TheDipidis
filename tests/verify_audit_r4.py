"""Verify Audit Round 4 fixes."""
from playwright.sync_api import sync_playwright
import json, sys

p = sync_playwright().start()
b = p.chromium.launch(headless=True)
pg = b.new_page(viewport={"width": 1280, "height": 800})
pg.goto("http://127.0.0.1:8000/index.html", wait_until="networkidle", timeout=30000)

errors = []

# 1) Test switchTab badge update
pg.evaluate("""document.querySelectorAll('.tab-btn').forEach(t => {
    if (t.textContent.includes('Current Meta')) t.click();
});""")
pg.wait_for_timeout(2000)
badge = pg.evaluate("() => document.getElementById('current-tab-title')?.textContent?.trim()")
title = pg.evaluate("() => document.title")
print(f"Badge after Current Meta click: [{badge}]")
print(f"Title: [{title}]")
if "Current Meta" not in (badge or ""):
    errors.append(f"Badge not updated: got [{badge}]")

# 2) Check aria-labels
checks = {
    "cityLeagueFormatSelect": "Meta format",
    "proxyDecklistInput": "Paste decklist for proxy print",
    "sandboxImportP1": "Player 1 deck import",
    "sandboxImportP2": "Player 2 deck import",
    "journalFilterTournament": "Filter by tournament",
    "journalFilterResult": "Filter by result",
    "oldDeckListInput": "Old decklist for comparison",
    "mpDeckSelect": "Select deck for multiplayer match",
    "mpDeckInput": "Paste decklist for multiplayer match",
}
for eid, expected in checks.items():
    val = pg.evaluate(f"() => document.getElementById('{eid}')?.getAttribute('aria-label')")
    status = "OK" if val == expected else "FAIL"
    if status == "FAIL":
        errors.append(f"{eid}: expected [{expected}], got [{val}]")
    print(f"  {eid}: [{val}] {status}")

# 3) Check playtest labels have for= attribute
for sel_id in ["myDeckSelectP1", "myDeckSelectP2"]:
    has_for = pg.evaluate(f"() => {{ const lbl = document.querySelector('label[for=\"{sel_id}\"]'); return !!lbl; }}")
    status = "OK" if has_for else "FAIL"
    if not has_for:
        errors.append(f"No label[for={sel_id}]")
    print(f"  label[for={sel_id}]: {status}")

# 4) Check filter expanders - need to switch to Cards tab first
pg.evaluate("""document.querySelectorAll('.tab-btn').forEach(t => {
    if (t.textContent.includes('Cards')) t.click();
});""")
pg.wait_for_timeout(3000)
fh = pg.evaluate("""() => {
    const headers = document.querySelectorAll('.cards-filter-header');
    if (!headers.length) return 'no filter headers found';
    const first = headers[0];
    return {
        count: headers.length,
        role: first.getAttribute('role'),
        tabindex: first.getAttribute('tabindex'),
        expanded: first.getAttribute('aria-expanded')
    };
}""")
print(f"Filter headers: {json.dumps(fh)}")
if isinstance(fh, dict):
    if fh.get("role") != "button":
        errors.append(f"Filter header missing role=button, got: {fh.get('role')}")
    if fh.get("tabindex") != "0":
        errors.append(f"Filter header missing tabindex=0, got: {fh.get('tabindex')}")
    if fh.get("expanded") != "false":
        errors.append(f"Filter header missing aria-expanded=false, got: {fh.get('expanded')}")
else:
    errors.append(f"Filter headers: {fh}")

# 5) Check for JS errors
js_errors = pg.evaluate("""() => {
    return window._jsErrors || [];
}""")
if js_errors:
    print(f"JS Errors: {js_errors}")

b.close()
p.stop()

if errors:
    print(f"\n FAILURES ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("\n ALL AUDIT R4 CHECKS PASSED")
