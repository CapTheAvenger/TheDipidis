#!/usr/bin/env python3
"""FE-7: welche Abschnitte zeigt Rotationen bei Multi-Format und bei einem Format?

Entscheidung Hausi (27.09.2026): bei „Multi-Format" (Formatfilter „all")
sind „Turnier-Performance" und „Erfolgreichste Deckliste" beide aus.
Das Werkzeug waehlt einen Archetyp, schaltet den Formatfilter auf „all"
und auf das erste Einzelformat und meldet je Zustand, ob die beiden
Abschnitte sichtbar sind.

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_multiformat_abschnitte.py
"""
import json
import sys

ABSCHNITTE = ["pastMetaPerformanceSection", "pastMetaMostSuccessfulSection"]
SICHTBAR = """ids => Object.fromEntries(ids.map(i => { const e = document.getElementById(i);
    return [i, !!e && !e.classList.contains('d-none') && e.getBoundingClientRect().height > 0]; }))"""


def main():
    from playwright.sync_api import sync_playwright
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/index.html"
    with sync_playwright() as p:
        b = p.chromium.launch()
        s = b.new_page(viewport={"width": 1280, "height": 900})
        s.add_init_script("try { localStorage.setItem('app_lang', 'de'); } catch (e) {}")
        s.goto(url, wait_until="load", timeout=60000)
        s.wait_for_timeout(3000)
        for _ in range(4):
            try:
                s.evaluate("() => window.switchTab && window.switchTab('past-meta')")
            except Exception:
                s.wait_for_timeout(3000)
                continue
            s.wait_for_timeout(7000)
            if s.evaluate("() => getComputedStyle(document.getElementById('past-meta')).display !== 'none'"):
                break
        ergebnis = {}
        formate = s.evaluate("() => [...document.getElementById('pastMetaFormatFilter').options].map(o => o.value)")
        einzel = next((f for f in formate if f and f != "all"), None)
        for fmt in ["all", einzel]:
            if fmt is None:
                continue
            s.evaluate("""f => { const x = document.getElementById('pastMetaFormatFilter'); x.value = f;
                x.dispatchEvent(new Event('change', {bubbles: true})); }""", fmt)
            s.wait_for_timeout(6000)
            s.evaluate("""() => { const sel = document.getElementById('pastMetaDeckSelect');
                const o = [...sel.options].find(o => o.value && !o.value.startsWith('__'));
                if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', {bubbles: true})); } }""")
            s.wait_for_timeout(12000)
            ergebnis[fmt] = s.evaluate(SICHTBAR, ABSCHNITTE)
        print(json.dumps(ergebnis, ensure_ascii=False))
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
