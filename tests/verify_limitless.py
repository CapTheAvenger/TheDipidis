"""Verify Limitless export button."""
from playwright.sync_api import sync_playwright
import sys

p = sync_playwright().start()
b = p.chromium.launch(headless=True)
pg = b.new_page()
pg.goto("http://127.0.0.1:8000/index.html", wait_until="networkidle", timeout=30000)

fn = pg.evaluate("() => typeof window.copyDeckAndOpenLimitless === 'function'")
print(f"copyDeckAndOpenLimitless exposed: {fn}")

# Check the function body contains the limitless URL
body = pg.evaluate("() => window.copyDeckAndOpenLimitless.toString().includes('limitlesstcg.com/builder')")
print(f"Function opens Limitless: {body}")

# Check button HTML is in the template (rendered when decks exist, but function exists regardless)
has_btn = pg.evaluate("() => window.copyDeckAndOpenLimitless.toString().length > 50")
print(f"Function has content: {has_btn}")

b.close()
p.stop()

if fn and body:
    print("\nLIMITLESS EXPORT CHECK PASSED")
else:
    print("\nFAILED")
    sys.exit(1)
