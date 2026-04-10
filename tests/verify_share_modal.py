"""Verify Share Image Modal exists and JS functions are exposed."""
from playwright.sync_api import sync_playwright
import json, sys

p = sync_playwright().start()
b = p.chromium.launch(headless=True)
pg = b.new_page(viewport={"width": 1280, "height": 800})
pg.goto("http://127.0.0.1:8000/index.html", wait_until="networkidle", timeout=30000)

errors = []

# 1) Modal HTML exists
modal = pg.evaluate("() => !!document.getElementById('shareImageModal')")
print(f"shareImageModal exists: {modal}")
if not modal:
    errors.append("shareImageModal not found in DOM")

# 2) JS functions exposed
for fn in ["openShareImageModal", "closeShareImageModal", "shareImageDownload", "shareImageNative"]:
    exists = pg.evaluate(f"() => typeof window.{fn} === 'function'")
    status = "OK" if exists else "FAIL"
    if not exists:
        errors.append(f"{fn} not exposed on window")
    print(f"  window.{fn}: {status}")

# 3) Trigger button changed
btn_text = pg.evaluate("""() => {
    const modal = document.getElementById('imageViewModal');
    if (!modal) return 'no imageViewModal';
    const btn = modal.querySelector('.image-view-export');
    return btn ? btn.getAttribute('onclick') : 'no button';
}""")
print(f"imageViewModal export button onclick: {btn_text}")
if "openShareImageModal" not in str(btn_text):
    errors.append(f"Export button not wired to openShareImageModal: {btn_text}")

# 4) Modal structure
structure = pg.evaluate("""() => {
    const m = document.getElementById('shareImageModal');
    if (!m) return null;
    return {
        role: m.getAttribute('role'),
        ariaModal: m.getAttribute('aria-modal'),
        hasPreview: !!m.querySelector('#shareImagePreview'),
        hasSaveBtn: !!m.querySelector('[onclick*="shareImageDownload"]'),
        hasShareBtn: !!m.querySelector('[onclick*="shareImageNative"]'),
        hasCloseBtn: !!m.querySelector('[onclick*="closeShareImageModal"]'),
    };
}""")
print(f"Modal structure: {json.dumps(structure, indent=2)}")
if structure:
    if not structure.get("hasPreview"):
        errors.append("Missing #shareImagePreview")
    if not structure.get("hasSaveBtn"):
        errors.append("Missing save button")
    if not structure.get("hasCloseBtn"):
        errors.append("Missing close button")

# 5) Check for JS errors on page load
js_errors = pg.evaluate("() => window._jsErrors || []")
if js_errors:
    print(f"JS Errors: {js_errors}")

b.close()
p.stop()

if errors:
    print(f"\nFAILURES ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("\nALL SHARE IMAGE MODAL CHECKS PASSED")
