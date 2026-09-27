#!/usr/bin/env python3
"""Leere Zwischenraeume einer Ansicht — aus dem GEZEICHNETEN Schirm.

UI-29 (Backlog 27.09.2026): Hausi hat auf fuenf Handyfotos der Ansicht
„Aktuelles Meta" leere Stellen rot eingekreist. Das Werkzeug misst sie,
statt sie zu schaetzen, damit der naechste Rutsch dieselbe Zahl bekommt.

WIE GEMESSEN WIRD
-----------------
1. Seite in Chromium laden (Playwright), Ansicht per `switchTab()` oeffnen,
   Breite wie angegeben (Standard 390 px = Handy).
2. Alles, was der Leser SIEHT, als Rechteck sammeln: Textzeilen (ueber
   Range.getClientRects, nicht das Elternrechteck — ein Absatz mit viel
   Innenabstand waere sonst „voll"), Bilder, Canvas, SVG, Knoepfe,
   Eingabefelder. Unsichtbares (display:none, visibility, Deckkraft 0,
   Groesse 0) zaehlt nicht.
3. Die senkrechten Intervalle zu einer Vereinigung zusammenlegen; jede
   Luecke zwischen zwei Intervallen ist ein leerer Streifen ueber die ganze
   Breite. Gemeldet wird jede Luecke ab --ab Pixeln (Standard 32), mit dem
   letzten Text davor und dem ersten danach.

Rahmen und Hintergrundflaechen zaehlen bewusst NICHT als Inhalt: eine leere
Karte mit Rahmen ist fuer den Leser genauso leer.

AUFRUF
------
    python3 -m http.server 8000 --bind 127.0.0.1 &      # aus der Repo-Wurzel
    python3 scripts/messe_leerraum.py --ansicht current-meta
    python3 scripts/messe_leerraum.py --ansicht past-meta --breite 1280 --ab 48

Ausgabe: je Luecke eine Zeile „<hoehe> px  <davor>  ⟶  <danach>", am Ende
die Summe. Mit --json DATEI alle Luecken als Liste. Rueckgabe 0 — das
Werkzeug misst, es urteilt nicht.
"""
import argparse
import json
import sys

SAMMLER = r"""
(ansicht) => {
  const wurzel = document.getElementById(ansicht);
  if (!wurzel) return {fehler: 'Ansicht ' + ansicht + ' nicht gefunden'};
  const sy = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const sichtbar = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  };
  const kasten = [];
  const nimm = (r, text) => {
    if (r.width < 1 || r.height < 1) return;
    kasten.push({o: r.top + sy, u: r.bottom + sy, t: (text || '').slice(0, 60)});
  };
  const walker = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, ' ').trim();
    if (!text || !n.parentElement || !sichtbar(n.parentElement)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) nimm(r, text);
  }
  wurzel.querySelectorAll('img, canvas, svg, video, input, select, textarea, button').forEach((el) => {
    if (!sichtbar(el)) return;
    const r = el.getBoundingClientRect();
    nimm(r, el.tagName.toLowerCase() + (el.alt ? ':' + el.alt : '') + (el.textContent ? ' ' + el.textContent.replace(/\s+/g, ' ').trim() : ''));
  });
  const w = wurzel.getBoundingClientRect();
  return {kasten, oben: w.top + sy, unten: w.bottom + sy};
}
"""


def luecken(kasten, ab):
    kasten = sorted(kasten, key=lambda k: k["o"])
    raus = []
    if not kasten:
        return raus
    bis = kasten[0]["u"]
    letzter = kasten[0]["t"]
    for k in kasten[1:]:
        if k["o"] - bis >= ab:
            raus.append({"hoehe": round(k["o"] - bis), "ab_y": round(bis),
                         "davor": letzter, "danach": k["t"]})
        if k["u"] >= bis:
            bis = k["u"]
            letzter = k["t"]
    return raus


def oeffne(seite, ansicht, breite):
    seite.set_viewport_size({"width": breite, "height": 900})
    for _ in range(4):
        try:
            seite.evaluate("a => window.switchTab && window.switchTab(a)", ansicht)
        except Exception:
            # gemessen 27.09.: gelegentlich laedt die Seite nach dem ersten
            # Aufruf neu (Service Worker) — dann einfach nochmal.
            seite.wait_for_timeout(3000)
            continue
        seite.wait_for_timeout(6000)   # gemessen 27.09.: die Tier-Liste kommt erst nach ~5 s
        if seite.evaluate("a => { const e = document.getElementById(a); "
                          "return !!e && getComputedStyle(e).display !== 'none'; }", ansicht):
            return True
    return False


def main():
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--ansicht", required=True)
    ap.add_argument("--breite", type=int, default=390)
    ap.add_argument("--ab", type=int, default=32)
    ap.add_argument("--vorher-js", default="", help="JS, das nach dem Oeffnen laeuft (z. B. einen Filter setzen)")
    ap.add_argument("--sprache", default="de", choices=["de", "en"])
    ap.add_argument("--json")
    a = ap.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        seite = browser.new_page()
        seite.add_init_script("try { localStorage.setItem('app_lang', '%s'); } catch (e) {}" % a.sprache)
        seite.goto(a.url, wait_until="load", timeout=60000)
        seite.wait_for_timeout(2000)
        if not oeffne(seite, a.ansicht, a.breite):
            print("Ansicht %s liess sich nicht oeffnen" % a.ansicht)
            return 0
        if a.vorher_js:
            seite.evaluate(a.vorher_js)
            seite.wait_for_timeout(2500)
        erg = seite.evaluate(SAMMLER, a.ansicht)
        browser.close()
    if "fehler" in erg:
        print(erg["fehler"])
        return 0
    raus = luecken(erg["kasten"], a.ab)
    for l in raus:
        print("%5d px  bei y=%-6d %s  ⟶  %s" % (l["hoehe"], l["ab_y"], l["davor"][:45], l["danach"][:45]))
    print("%s @ %d px: %d Luecke(n) ab %d px, zusammen %d px (Ansicht %d px hoch)"
          % (a.ansicht, a.breite, len(raus), a.ab, sum(l["hoehe"] for l in raus),
             round(erg["unten"] - erg["oben"])))
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(raus, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
