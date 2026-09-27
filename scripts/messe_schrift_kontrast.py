#!/usr/bin/env python3
"""Schriftgroesse und Kontrast je Ansicht — aus dem GEZEICHNETEN Schirm.

WZ-1 (Backlog 26.09.2026): „Kontrast-Messwerkzeug ins Repo: Pixelmessung aus
dem gezeichneten Schirm, Emoji und font-size: 0 ausgenommen,
Vorfahren-Deckkraft beruecksichtigt. Einmal bauen, danach ein Befehl."

Gebaut in Rutsch 2 fuer UI-4 (Schriftskala `fs-scale`), weil beide Fragen an
denselben Knoten haengen: wie gross ist die Schrift, und hebt sie sich ab.

WIE GEMESSEN WIRD
-----------------
1. Die Seite wird in Chromium geladen (Playwright), die Ansicht per
   `switchTab()` geoeffnet, Breite und Farbwelt wie angegeben.
2. Jeder sichtbare Textknoten wird gesammelt: Schriftgroesse (berechnet),
   Schriftfarbe (rgba), Deckkraft ALLER Vorfahren multipliziert.
   Ausgenommen: font-size 0, reine Emoji/Symbole, unsichtbares.
3. Der Hintergrund kommt NICHT aus dem CSS (Verlaeufe, Bilder, halbdurch-
   sichtige Flaechen luegen dort), sondern aus Bildschirmfotos, auf denen
   alle Schrift durchsichtig gestellt ist: je Knoten die haeufigste Farbe
   in seinem Rechteck. Fotografiert wird Bildschirm fuer Bildschirm beim
   Scrollen, NICHT als Ganzseitenfoto — das vergroessert das Fenster auf
   die volle Hoehe, und alles, was an 100vh haengt, verrutscht (gemessen
   26.09.2026: weisse Schrift auf den farbigen Ergebniskarten des Rechners
   wurde gegen WEISS gemessen, 1,0:1).
4. Vordergrund = Schriftfarbe mit (Alpha x Vorfahren-Deckkraft) ueber diesen
   Hintergrund gemischt; Kontrast nach WCAG 2.x.

AUFRUF
------
    python3 -m http.server 8000 --bind 127.0.0.1 &      # aus der Repo-Wurzel
    python3 scripts/messe_schrift_kontrast.py --ansicht cards --breite 390
    python3 scripts/messe_schrift_kontrast.py --alle --breite 390 --dunkel
    python3 scripts/messe_schrift_kontrast.py --ansicht cards --mit-klasse fs-scale

`--mit-klasse fs-scale` haengt die Klasse zur LAUFZEIT an die Ansicht — die
Nachher-Messung fuer UI-4, bevor eine Zeile HTML geaendert ist.

Ausgabe: je Ansicht eine Zeile Zusammenfassung; mit `--json DATEI` alle
Knoten. Rueckgabe 0, auch wenn Befunde da sind — das Werkzeug misst, es
urteilt nicht.
"""
import argparse
import io
import json
import sys
from collections import Counter

ANSICHTEN = [
    "meta-analysis-hub", "city-league", "city-league-analysis", "current-meta",
    "current-analysis", "past-meta", "meta-call", "cards", "proxy", "tutorial",
    "quellen", "admin", "side-quest", "pocket", "calculator", "profile",
]

SAMMLER = r"""
(ansicht) => {
  const wurzel = document.getElementById(ansicht);
  if (!wurzel) return [];
  const emoji = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{S}\p{P}\s‍️\d]*$/u;
  const raus = [];
  const deckkraft = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity || '1'); return o; };
  // filter: brightness() eines Vorfahren dimmt die Schrift GENAUSO wie den
  // Grund. Der Grund kommt aus dem Bildschirmfoto (schon gedimmt), die
  // Schriftfarbe aus dem CSS (ungedimmt) — ohne diesen Faktor misst das
  // Werkzeug im Dunkelmodus der Anleitung zu schwache Kontraste
  // (Rutsch 6, 27.09.2026: 3 von 4 Befunden waren nur dieser Fehler).
  const helligkeit = (el) => { let h = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const f = getComputedStyle(e).filter || ''; const m = f.match(/brightness\(([\d.]+)\)/); if (m) h *= parseFloat(m[1]); } return h; };
  const walker = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  const gesehen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || gesehen.has(el)) continue;
    gesehen.add(el);
    if (emoji.test(text) && !/[A-Za-zÄÖÜäöüß]/.test(text)) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (!fs) continue;
    if (cs.visibility !== 'visible' || cs.display === 'none') continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rect = r.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const op = deckkraft(el);
    if (op < 0.05) continue;
    el.dataset.wz1 = String(raus.length);
    raus.push({
      text: text.slice(0, 50), klasse: (el.className && el.className.baseVal === undefined ? el.className : '') || el.tagName.toLowerCase(),
      fs, gewicht: parseInt(cs.fontWeight, 10) || 400, farbe: cs.color, deckkraft: op, helligkeit: helligkeit(el),
      x: rect.left + scrollX, y: rect.top + scrollY, b: rect.width, h: rect.height,
    });
  }
  return raus;
}
"""

SEITE_RECHTECKE = r"""
(y) => {
  // behavior 'instant': die Seite scrollt sonst weich (scroll-behavior:
  // smooth), und die Rechtecke wuerden vor dem Ziel gemessen.
  for (const e of [window, document.documentElement, document.body]) e.scrollTo({ top: y, left: 0, behavior: 'instant' });
  const raus = [];
  for (const el of document.querySelectorAll('[data-wz1]')) {
    let n = null;
    for (const c of el.childNodes) if (c.nodeType === 3 && c.textContent.trim()) { n = c; break; }
    if (!n) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const q = r.getBoundingClientRect();
    if (!(q.top >= 0 && q.bottom <= innerHeight && q.left >= 0 && q.right <= innerWidth && q.width > 1)) continue;
    // Verdeckt? Die untere Navigationsleiste ist fixed und weiss; wer
    // darunter liegt, wuerde gegen IHRE Farbe gemessen (26.09.2026: die
    // Ergebniskarten des Rechners, 1,0:1). Dann auf dem naechsten Bildschirm.
    const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) continue;
    raus.push({ i: +el.dataset.wz1, x: q.left, y: q.top, b: q.width, h: q.height });
  }
  return raus;
}
"""

UNSICHTBARE_SCHRIFT = ("*{color:transparent!important;-webkit-text-fill-color:transparent!important;"
                       "text-shadow:none!important;caret-color:transparent!important}")


def rgba(s):
    teile = s[s.index("(") + 1:s.index(")")].replace("/", ",").split(",")
    z = [float(t) for t in teile if t.strip()]
    return (z[0], z[1], z[2], z[3] if len(z) > 3 else 1.0)


def leucht(rgb):
    def k(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b)


def kontrast(a, b):
    la, lb = sorted((leucht(a), leucht(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def hintergrund(bild, k):
    x0, y0 = max(0, int(k["x"])), max(0, int(k["y"]))
    x1, y1 = min(bild.width, int(k["x"] + k["b"])), min(bild.height, int(k["y"] + k["h"]))
    if x1 <= x0 or y1 <= y0:
        return None
    feld = bild.crop((x0, y0, x1, y1)).convert("RGB")
    feld.thumbnail((40, 40))
    punkte = list(feld.get_flattened_data() if hasattr(feld, "get_flattened_data") else feld.getdata())
    # Auf einem Farbverlauf ist jedes Pixel anders; die haeufigste EXAKTE
    # Farbe waere dann eine 1-px-Trennlinie (26.09.2026: Herkunftssatz auf
    # der blauen Karte gegen WEISS gemessen). Deshalb in Faecher von 24
    # Stufen je Kanal sortieren, das volle Fach nehmen, darin mitteln.
    faecher = {}
    for p in punkte:
        faecher.setdefault(tuple(c // 24 for c in p), []).append(p)
    voll = max(faecher.values(), key=len)
    return tuple(round(sum(p[i] for p in voll) / len(voll)) for i in range(3))


def messe(seite, ansicht, breite, dunkel, klasse):
    from PIL import Image
    seite.set_viewport_size({"width": breite, "height": 900})
    seite.evaluate("""([a, dunkel, klasse]) => {
        document.documentElement.dataset.theme = dunkel ? 'dark' : 'light';
        if (typeof window.switchTab === 'function') window.switchTab(a);
        else document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === a));
        if (klasse) { const w = document.getElementById(a); if (w) w.classList.add(klasse); }
    }""", [ansicht, dunkel, klasse])
    seite.wait_for_timeout(1500)
    # Gemessen 26.09.2026: der ERSTE switchTab('meta-analysis-hub') nach dem
    # Laden laesst die Ansicht auf display:none — erst der zweite oeffnet
    # sie. Deshalb nachsehen statt annehmen.
    for _ in range(3):
        if seite.evaluate("a => { const e = document.getElementById(a); "
                          "return !!e && getComputedStyle(e).display !== 'none'; }", ansicht):
            break
        seite.evaluate("a => window.switchTab && window.switchTab(a)", ansicht)
        seite.wait_for_timeout(1500)
    knoten = seite.evaluate(SAMMLER, ansicht)
    stil = seite.add_style_tag(content=UNSICHTBARE_SCHRIFT)
    seite.wait_for_timeout(150)
    hoehe = seite.evaluate("() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)")
    offen = {i for i in range(len(knoten))}
    y = 0
    while offen and y < hoehe + 900:
        rechtecke = seite.evaluate(SEITE_RECHTECKE, y)
        bild = Image.open(io.BytesIO(seite.screenshot()))
        for r in rechtecke:
            i = r["i"]
            if i in offen:
                knoten[i]["_bg"] = hintergrund(bild, r)
                offen.discard(i)
        y += 800
    seite.evaluate("() => { for (const e of [window, document.documentElement, document.body]) e.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }")
    stil.evaluate("s => s.remove()")
    for k in knoten:
        bg = k.pop("_bg", None)
        r, g, b, a = rgba(k["farbe"])
        a *= k["deckkraft"]
        if bg is None:
            k["kontrast"] = None
            continue
        hf = k.get("helligkeit", 1.0)
        vg = tuple(a * min(255.0, c * hf) + (1 - a) * h for c, h in zip((r, g, b), bg))
        k["hintergrund"] = "#%02x%02x%02x" % bg
        k["kontrast"] = round(kontrast(vg, bg), 2)
        gross = k["fs"] >= 24 or (k["fs"] >= 18.66 and k["gewicht"] >= 700)
        k["soll"] = 3.0 if gross else 4.5
    return knoten


def zusammenfassung(ansicht, knoten):
    groessen = sorted(k["fs"] for k in knoten)
    gemessen = [k for k in knoten if k.get("kontrast") is not None]
    zu_schwach = [k for k in gemessen if k["kontrast"] < k["soll"]]
    if not groessen:
        return f"{ansicht:22} keine Textknoten"
    verteilung = Counter(round(g) for g in groessen)
    haeufig = ", ".join(f"{g}px×{n}" for g, n in verteilung.most_common(3))
    ungemessen = len(knoten) - len(gemessen)
    return (f"{ansicht:22} Knoten {len(groessen):4}  min {groessen[0]:.1f}px  "
            f"<11px {sum(g < 11 for g in groessen):4}  <12px {sum(g < 12 for g in groessen):4}  "
            f"häufigste {haeufig}  Kontrast<Soll {len(zu_schwach):3}  ohne Kontrastmessung {ungemessen}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--ansicht", action="append", default=[])
    ap.add_argument("--alle", action="store_true")
    ap.add_argument("--breite", type=int, default=390)
    ap.add_argument("--dunkel", action="store_true")
    ap.add_argument("--mit-klasse", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args(argv)
    ansichten = ANSICHTEN if a.alle else (a.ansicht or ["current-meta"])
    from playwright.sync_api import sync_playwright
    alles = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        seite = browser.new_page()
        # Fremde Hosts (Bilder-CDN, Firebase, Schriften) werden nicht
        # abgewartet: sie aendern weder Schriftgroesse noch Farbe, halten
        # aber `networkidle` ewig offen. Kartenbilder fehlen damit — wo ein
        # Text AUF einem Bild steht, misst das Werkzeug gegen den Grund
        # darunter; das steht im Bericht dazu.
        eigen = a.url.split("/")[2]
        seite.route("**/*", lambda r: r.continue_() if r.request.url.split("/")[2] == eigen
                    else r.abort())
        seite.goto(a.url, wait_until="load", timeout=60000)
        seite.wait_for_timeout(2500)
        for ans in ansichten:
            # Die Seite laedt sich nach dem ersten Aufruf gelegentlich einmal
            # neu (Service Worker); eine Messung, die dabei ihren Kontext
            # verliert, wird wiederholt statt abgebrochen.
            for versuch in range(3):
                try:
                    knoten = messe(seite, ans, a.breite, a.dunkel, a.mit_klasse)
                    break
                except Exception as fehler:  # noqa: BLE001
                    if "Execution context was destroyed" not in str(fehler) or versuch == 2:
                        raise
                    seite.wait_for_load_state("load")
                    seite.wait_for_timeout(2500)
            alles[ans] = knoten
            print(zusammenfassung(ans, knoten))
        browser.close()
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(alles, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
