#!/usr/bin/env python3
"""Die Infoleiste unter den Kartenbildern der Kartenuebersicht.

UI-36 (Backlog, Hausi 27.09.2026): „Rotationen, Kartenuebersicht: Optik
wirkt nicht clean, Preis-Button ist relativ gross." Das Werkzeug misst
je Ansicht die Leiste unter dem Kartenbild: wie hoch sie im Verhaeltnis
zum Bild ist, wie hoch und breit das Preisschild gegen die Nachbarknoepfe
ist und welche Schriftgroessen dort vorkommen. So laesst sich Rotationen
gegen die beiden anderen Analysen halten, die dieselben Klassen nutzen.

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_kartenleiste.py --ansicht past-meta --breiten 390,1280
    python3 scripts/messe_kartenleiste.py --ansicht past-meta --bild /tmp/k.png
"""
import argparse
import json
import sys

QUELLE = {"past-meta": "pastMetaDeckSelect",
          "current-analysis": "currentMetaDeckSelect",
          "city-league-analysis": "cityLeagueDeckSelect"}

MESSUNG = r"""
(ansicht) => {
  const w = document.getElementById(ansicht);
  const kacheln = [...w.querySelectorAll('.city-league-card-item')].filter(k => k.getBoundingClientRect().width > 0);
  if (!kacheln.length) return {kacheln: 0};
  const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? Math.round(a[a.length >> 1] * 10) / 10 : null; };
  let abgeschnitten = 0;
  const bildH = [], leisteH = [], preisH = [], preisB = [], knopfH = [], knopfB = [], zeileB = [], schriften = {};
  kacheln.forEach(k => {
    const img = k.querySelector('.city-league-card-image-container');
    const leiste = k.querySelector('.city-league-card-info-bottom');
    if (img) bildH.push(img.getBoundingClientRect().height);
    if (leiste) {
      leisteH.push(leiste.getBoundingClientRect().height);
      leiste.querySelectorAll('*').forEach(e => {
        if (!e.childElementCount && e.textContent.trim() && e.getBoundingClientRect().width) {
          const f = getComputedStyle(e).fontSize; schriften[f] = (schriften[f] || 0) + 1; }
      });
    }
    const p = k.querySelector('.city-league-card-market-btn');
    if (p && p.scrollWidth > p.clientWidth + 0.5) abgeschnitten++;
    if (p) { const r = p.getBoundingClientRect(); preisH.push(r.height); preisB.push(r.width);
      zeileB.push(p.parentElement.getBoundingClientRect().width); }
    k.querySelectorAll('.city-league-card-action-btn:not(.city-league-card-market-btn)').forEach(b => {
      const r = b.getBoundingClientRect(); if (r.width) { knopfH.push(r.height); knopfB.push(r.width); } });
  });
  return {kacheln: kacheln.length, bild_h: med(bildH), leiste_h: med(leisteH),
          leiste_anteil_prozent: Math.round(med(leisteH) / med(bildH) * 1000) / 10,
          preis: med(preisB) + 'x' + med(preisH), preis_anteil_zeile_prozent: Math.round(med(preisB) / med(zeileB) * 1000) / 10,
          knopf: med(knopfB) + 'x' + med(knopfH), preis_abgeschnitten: abgeschnitten, schriften};
}
"""


def main():
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--ansicht", default="past-meta", choices=sorted(QUELLE))
    ap.add_argument("--breiten", default="390,1280")
    ap.add_argument("--bild", help="Ausschnitt der ersten vier Kacheln als PNG (bei der letzten Breite)")
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch()
        s = b.new_page(viewport={"width": 1280, "height": 900})
        s.add_init_script("try { localStorage.setItem('app_lang', 'de'); } catch (e) {}")
        s.goto(a.url, wait_until="load", timeout=60000)
        s.wait_for_timeout(3000)
        for _ in range(4):
            try:
                s.evaluate("a => window.switchTab && window.switchTab(a)", a.ansicht)
            except Exception:
                s.wait_for_timeout(3000)
                continue
            s.wait_for_timeout(7000)
            if s.evaluate("a => getComputedStyle(document.getElementById(a)).display !== 'none'", a.ansicht):
                break
        s.evaluate("""id => { const sel = document.getElementById(id); if (!sel) return;
            const o = [...sel.options].find(o => o.value && !/alle|all/i.test(o.textContent));
            if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', {bubbles: true})); } }""", QUELLE[a.ansicht])
        s.wait_for_timeout(15000)
        for w in [int(x) for x in a.breiten.split(",")]:
            s.set_viewport_size({"width": w, "height": 900})
            s.wait_for_timeout(1500)
            print("%s @ %4d px: %s" % (a.ansicht, w, json.dumps(s.evaluate(MESSUNG, a.ansicht), ensure_ascii=False)))
        if a.bild:
            k = s.locator("#%s .city-league-card-item" % a.ansicht)
            k.first.scroll_into_view_if_needed()
            r0 = k.nth(0).bounding_box(); r3 = k.nth(min(3, k.count() - 1)).bounding_box()
            s.screenshot(path=a.bild, clip={"x": r0["x"] - 4, "y": r0["y"] - 4,
                                            "width": r3["x"] + r3["width"] - r0["x"] + 8, "height": r0["height"] + 8})
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
