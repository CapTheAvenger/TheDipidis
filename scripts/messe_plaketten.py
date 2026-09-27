#!/usr/bin/env python3
"""Form und Groesse aller Plaketten auf den Kartenkacheln.

UI-37 (Backlog 27.09.2026, Entscheidung Hausi: „rund wie im Deck Builder"):
alle Plaketten — Max-Anzahl, Anzahl im Deck, Wunschliste, andere Drucke,
Anzahl im gebauten Deck — sollen in allen Bereichen dieselbe Form und
Groesse haben. Das Werkzeug misst je Plakettenart die GEZEICHNETE Form:
Breite x Hoehe, Eckenradius und ob ein clip-path sie zu etwas anderem
schneidet (das Sechseck war ein clip-path).

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_plaketten.py --ansicht past-meta --breiten 390,1280
"""
import argparse
import json
import sys

QUELLE = {"past-meta": ("pastMeta", "pastMetaDeckSelect"),
          "current-analysis": ("currentMeta", "currentMetaDeckSelect"),
          "city-league": ("cityLeague", "cityLeagueDeckSelect")}
ARTEN = [".city-league-card-badge-max", ".city-league-card-badge-deck", ".wishlist-heart-badge",
         ".city-league-other-print-sparkle", ".card-max-count"]

MESSUNG = r"""
([ansicht, arten]) => {
  const w = document.getElementById(ansicht); const out = {};
  for (const a of arten) {
    const formen = {};
    w.querySelectorAll(a).forEach(e => {
      const r = e.getBoundingClientRect(); if (r.width === 0) return;
      const cs = getComputedStyle(e);
      const rund = parseFloat(cs.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 0.5
                   || cs.borderTopLeftRadius.endsWith('%') && parseFloat(cs.borderTopLeftRadius) >= 50;
      const k = Math.round(r.width) + 'x' + Math.round(r.height) + (rund ? ' rund' : ' eckig(' + cs.borderTopLeftRadius + ')')
              + (cs.clipPath && cs.clipPath !== 'none' ? ' clip' : '');
      formen[k] = (formen[k] || 0) + 1;
    });
    out[a] = formen;
  }
  // Lage: liegen zwei Plaketten derselben Kachel aufeinander?
  let ueber = 0, kacheln = 0;
  const sel = arten.join(',');
  new Set([...w.querySelectorAll(sel)].map(e => e.parentElement)).forEach(k => {
    const r = [...k.children].filter(e => e.matches(sel)).map(e => e.getBoundingClientRect()).filter(r => r.width);
    if (r.length > 1) kacheln++;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
      if (r[i].left < r[j].right - 0.5 && r[j].left < r[i].right - 0.5 && r[i].top < r[j].bottom - 0.5 && r[j].top < r[i].bottom - 0.5) ueber++;
  });
  out['ueberlappungen'] = {kacheln_mit_mehreren: kacheln, paare: ueber};
  return out;
}
"""


def main():
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--ansicht", default="past-meta", choices=sorted(QUELLE))
    ap.add_argument("--breiten", default="390,1280")
    a = ap.parse_args()
    quelle, auswahl = QUELLE[a.ansicht]
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
        s.evaluate("""id => { const sel = document.getElementById(id);
            const o = [...sel.options].find(o => o.value && !/alle|all/i.test(o.textContent));
            sel.value = o.value; sel.dispatchEvent(new Event('change', {bubbles: true})); }""", auswahl)
        s.wait_for_timeout(12000)
        s.evaluate("q => { try { autoCompleteConsistency(q, 'min'); } catch (e) {} }", quelle)
        s.wait_for_timeout(15000)
        for w in [int(x) for x in a.breiten.split(",")]:
            s.set_viewport_size({"width": w, "height": 900})
            s.wait_for_timeout(1500)
            e = s.evaluate(MESSUNG, [a.ansicht, ARTEN])
            formen = set()
            for art, f in e.items():
                if art == "ueberlappungen":
                    continue
                for k in f:
                    formen.add(k)
            print("%s @ %4d px: %d Formen — %s" % (a.ansicht, w, len(formen), json.dumps(e, ensure_ascii=False)))
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
