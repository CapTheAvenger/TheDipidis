#!/usr/bin/env python3
"""Prueft, ob jede Adresse in data/archetype_icons.json wirklich laedt.

WARUM ES DIESES SKRIPT GIBT

Am 31.08.2026 luden zehn der 203 kuratierten Slugs nicht — seit dem
05.05.2026. Vier Monate lang hat es niemand gemerkt, und das war kein
Zufall: ein fehlschlagendes Archetyp-Icon versteckt sich im Frontend
per <img onerror> lautlos. Kein Fehler, keine Luecke, nur ein Deckname
ohne Bild daneben, was auch so aussehen kann wie Absicht.

Die Slugs stammten aus einem einmaligen Backfill, der sie AUS DEN
NAMEN ABLEITETE, statt sie wie der Scraper aus Limitless' eigenen
<img src> zu lesen. Abgeleitet und nie nachgesehen — genau die
Bauart, die sich hier nicht von selbst meldet.

tests/python/test_archetyp_icons.py haelt die FORM fest (Reihenfolge
des Formzusatzes, kein Formwort als Art, ...) und haette neun der
zehn Faelle gefangen. Den zehnten nicht: `ogerpon-teal-mask` sieht
tadellos aus, es gibt die Datei bei Limitless nur nicht. Dafuer
braucht es einen echten Abruf, und der gehoert nach CI.

AUFRUF
    python3 scripts/pruefe_archetyp_icons.py            # meldet und faellt
    python3 scripts/pruefe_archetyp_icons.py --nur-warnen
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PFAD = os.path.join(ROOT, "data", "archetype_icons.json")

UA = ("TheDipidis-Icon-Check/1.0 (+https://thedipidis.app; "
      "prueft nur die eigenen Verweise)")
PAUSE_S = 0.15
ZEIT_S = 20


def erreichbar(url):
    """(ok, hinweis). Netzfehler sind NICHT dasselbe wie 404 — ein
    Aussetzer der Leitung darf nicht als kaputter Slug gelten."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=ZEIT_S) as r:
            roh = r.read(8)
        if roh[:8] != b"\x89PNG\r\n\x1a\n":
            return False, "Antwort ist kein PNG"
        return True, ""
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False, "404"
        return None, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return None, f"nicht erreichbar ({type(e).__name__})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nur-warnen", action="store_true",
                    help="Befund melden, aber mit 0 enden")
    args = ap.parse_args()

    with open(PFAD, encoding="utf-8") as f:
        d = json.load(f)
    meta = d.get("_meta") or {}
    praefix = meta.get("urlPrefix") or ""
    suffix = meta.get("urlSuffix") or ".png"
    arch = d.get("archetypes") or {}

    # Ein Slug kann von vielen Archetypen benutzt werden — einmal pruefen,
    # aber alle Nutzer melden, damit der Befund handhabbar ist.
    nutzer = {}
    for name, slugs in arch.items():
        if not isinstance(slugs, list):
            continue
        for s in slugs:
            nutzer.setdefault(s, []).append(name)

    if not nutzer:
        print("FEHLER: keine Slugs gefunden — ist die Datei leer?", file=sys.stderr)
        return 1

    kaputt, unklar = [], []
    for i, slug in enumerate(sorted(nutzer), 1):
        ok, hinweis = erreichbar(praefix + slug + suffix)
        if ok is False:
            kaputt.append((slug, hinweis))
        elif ok is None:
            unklar.append((slug, hinweis))
        time.sleep(PAUSE_S)

    print(f"{len(nutzer)} Slugs geprueft: {len(nutzer)-len(kaputt)-len(unklar)} laden, "
          f"{len(kaputt)} kaputt, {len(unklar)} unklar")

    for slug, hinweis in unklar:
        print(f"::warning::Icon-Slug '{slug}' nicht pruefbar ({hinweis})")

    if not kaputt:
        return 0

    print()
    for slug, hinweis in kaputt:
        wer = nutzer[slug]
        print(f"::error::Icon-Slug '{slug}' laedt nicht ({hinweis}) — "
              f"benutzt von {len(wer)} Archetyp(en): {', '.join(wer[:5])}"
              + (" ..." if len(wer) > 5 else ""))
    print("\nDer richtige Slug steht in Limitless' eigener Deckliste "
          "(<img class=\"pokemon\">). Nicht aus dem Namen ableiten — genau "
          "so sind diese Faelle entstanden.", file=sys.stderr)

    return 0 if args.nur_warnen else 1


if __name__ == "__main__":
    sys.exit(main())
