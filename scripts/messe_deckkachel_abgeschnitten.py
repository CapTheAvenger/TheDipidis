#!/usr/bin/env python3
"""Wird die Kennzahl-Zeile auf den Kacheln des gebauten Decks abgeschnitten?

UI-42 (Backlog 28.09.2026, Hausi): in `div.deck-card-actions` wird die
untere Zeile („32,5% | Ø 1,20x“) bei schmalerem Fenster (geteilter
Bildschirm) abgeschnitten. Gemessen wird jede Kachel des per Generate
gebauten Decks: steht in `.deck-card-overlay` mehr Text, als sichtbar ist
(scrollWidth > clientWidth), oder ragt ein Teil aus der Kachel, zaehlt sie.

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_deckkachel_abgeschnitten.py --ansicht current-analysis --breiten 390,768,960,1024,1280,1920
"""
import argparse
import sys

QUELLE = {"past-meta": ("pastMeta", "pastMetaDeckSelect", "pastMetaMyDeckGrid"),
          "current-analysis": ("currentMeta", "currentMetaDeckSelect", "currentMetaMyDeckGrid"),
          "city-league": ("cityLeague", "cityLeagueDeckSelect", "cityLeagueMyDeckGrid")}

MESSUNG = r"""
(gitter) => {
  const out = {kacheln: 0, ab: 0, breite: 0, beispiele: []};
  document.querySelectorAll('#' + gitter + ' .deck-card').forEach(k => {
    const o = k.querySelector('.deck-card-overlay');
    if (!o) return;
    const ro = o.getBoundingClientRect(), rk = k.getBoundingClientRect();
    if (ro.height === 0) return;
    out.kacheln++; out.breite = Math.round(rk.width);
    let zuViel = o.scrollWidth - o.clientWidth > 0.5;
    o.querySelectorAll('*').forEach(t => { const r = t.getBoundingClientRect();
      if (r.width && (r.left < ro.left - 0.5 || r.right > ro.right + 0.5)) zuViel = true; });
    if (ro.left < rk.left - 0.5 || ro.right > rk.right + 0.5) zuViel = true;
    if (zuViel) {
      out.ab++;
      if (out.beispiele.length < 2) out.beispiele.push(JSON.stringify(o.textContent.trim()) + ' ' + o.clientWidth + '/' + o.scrollWidth);
    }
  });
  return out;
}
"""


def main():
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--ansicht", default="past-meta", choices=sorted(QUELLE))
    ap.add_argument("--breiten", default="390,768,1024,1280")
    a = ap.parse_args()
    quelle, auswahl, gitter = QUELLE[a.ansicht]
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
            e = s.evaluate(MESSUNG, gitter)
            print("%s @ %4d px: %d Kacheln (je %d px), %d abgeschnitten %s"
                  % (a.ansicht, w, e["kacheln"], e["breite"], e["ab"], "; ".join(e["beispiele"])))
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
