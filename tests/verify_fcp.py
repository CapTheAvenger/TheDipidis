"""Verify FCP optimization via JS evaluation."""
from playwright.sync_api import sync_playwright
import json

p = sync_playwright().start()
b = p.chromium.launch(headless=True)
pg = b.new_page(viewport={"width": 1280, "height": 800})
pg.goto("http://127.0.0.1:8000/index.html", wait_until="networkidle", timeout=30000)

# Click City League Meta tab via JS (bypasses visibility checks)
pg.evaluate("""
    document.querySelectorAll(".tab-btn").forEach(t => {
        if (t.textContent.includes("City League Meta")) t.click();
    });
""")
pg.wait_for_timeout(12000)

r = pg.evaluate("""() => {
    const bgEl = document.querySelector(".tier-hero-bg");
    return {
        imageMap: window.cityLeagueImageMap ? Object.keys(window.cityLeagueImageMap).length : -1,
        analysisData: window.cityLeagueAnalysisData ? window.cityLeagueAnalysisData.length : -1,
        hero: !!document.querySelector(".tier-hero-section"),
        heroes: document.querySelectorAll(".tier-hero-card").length,
        tiers: document.querySelectorAll(".tier-section").length,
        bgs: document.querySelectorAll(".tier-hero-bg").length,
        firstBg: bgEl ? bgEl.style.backgroundImage.substring(0, 80) : "none"
    };
}""")
print(json.dumps(r, indent=2))
with open("tests/verify_fcp_result.json", "w") as f:
    json.dump(r, f, indent=2)
b.close()
p.stop()
