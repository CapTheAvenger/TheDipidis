#!/usr/bin/env python3
"""Ueberlappen sich Kennzahl-Band und Knoepfe auf den Kacheln des gebauten Decks?

UI-38 (Backlog 27.09.2026): `div.deck-card-overlay` (Anteil | Ø) und
`div.deck-card-actions` (−/★/+, L/P/Preis) ueberlappen sich „manchmal".
Gemessen wird jede Kachel des per Generate gebauten Decks: schneiden sich
die Rechtecke der beiden, zaehlt sie. Dazu die Hoehe der Ueberlappung.

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_deckkachel_ueberlappung.py --ansicht past-meta --breiten 390,768,1024,1280
"""
import argparse
import sys

QUELLE = {"past-meta": ("pastMeta", "pastMetaDeckSelect", "pastMetaMyDeckGrid"),
          "current-analysis": ("currentMeta", "currentMetaDeckSelect", "currentMetaMyDeckGrid"),
          "city-league": ("cityLeague", "cityLeagueDeckSelect", "cityLeagueMyDeckGrid")}

MESSUNG = r"""
(gitter) => {
  const out = {kacheln: 0, ueber: 0, max: 0, beispiele: []};
  document.querySelectorAll('#' + gitter + ' .deck-card').forEach(k => {
    // Gegen die KNOPFZEILEN messen, nicht gegen den Behaelter: seit UI-38
    // liegt das Band selbst im Behaelter der Knoepfe.
    const o = k.querySelector('.deck-card-overlay');
    const zeilen = [...k.querySelectorAll('.deck-card-action-row')];
    if (!o || !zeilen.length) return;
    const ro = o.getBoundingClientRect();
    if (ro.height === 0) return;
    out.kacheln++;
    let h = 0;
    zeilen.forEach(z => { const ra = z.getBoundingClientRect();
      if (ra.height === 0 || Math.min(ro.right, ra.right) <= Math.max(ro.left, ra.left)) return;
      h = Math.max(h, Math.min(ro.bottom, ra.bottom) - Math.max(ro.top, ra.top)); });
    if (h > 0.5) {
      out.ueber++; out.max = Math.max(out.max, Math.round(h * 10) / 10);
      if (out.beispiele.length < 3) out.beispiele.push((k.title || '').slice(0, 30) + ' ' + Math.round(h) + 'px');
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
            print("%s @ %4d px: %d Kacheln, %d ueberlappen (max %s px) %s"
                  % (a.ansicht, w, e["kacheln"], e["ueber"], e["max"], "; ".join(e["beispiele"])))
        b.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
