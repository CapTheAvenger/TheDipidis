#!/usr/bin/env python3
"""
Scrape authoritative German↔English NAME maps from the German wikis and
write data/de_name_overrides.json. Used by build_champions_resources.py
as the highest-confidence German-name source (above PokeAPI and the
hand-verified files), so names stay correct + current automatically.

Sources (both reachable from GitHub Actions — NOT from the locked-down
build sandbox, so this only runs in CI):
  • Moves: PokeWiki "Liste der Attackennamen in anderen Sprachen" via the
    MediaWiki API (wikitext table; cells may read "OLD (vor <gen>) NEW
    (ab <gen>)" → we take the current / "ab" name).
  • Items: pokemonexperte.de/items/ (HTML <li><a>DE</a> (EN)</li>; the
    page is windows-1252 encoded).

Fail-soft: if a source can't be fetched/parsed, that section is left
empty and the caller keeps the previously-committed overrides.

DIE ENTSCHEIDUNGSDATEI HAT DAS LETZTE WORT
==========================================
BEFUND (04.09.2026, ein roter Deploy). Der Lauf um 04:09 UTC hat diese
Datei neu geschrieben und dabei ACHT von Hand geprüfte Namen wieder auf
die falschen Werte der Quelle gesetzt — "Schwerschwf." statt
Schwerschweif, "Hackattack" statt Spitzer Schnabel, "Gesteinjuwel" statt
Gesteinsjuwel. Samt der Notiz, die das festhielt.

Das war kein Zufall, sondern der Aufbau: PR #651 hat die Werte in eine
ERZEUGTE Datei geschrieben. Der nächste Lauf musste sie überschreiben.
Danach war `main` rot (test-Job), `build` und `deploy` übersprungen, und
die Seite hing auf dem alten Stand — sichtbar wurde es erst am nächsten
Deploy, eine Stunde später.

pokemonexperte.de führt teils abgekürzte In-Game-Beschriftungen
("Schwerschwf.") und Namen aus der Zeit vor Schwert und Schild
("Hackattack"). Die Quelle ist also nicht falsch benutzt, sie ist an
diesen Stellen schlicht nicht die beste.

Deshalb gilt hier jetzt dieselbe Ordnung wie in
build_champions_pokedex.py und build_champions_resources.py:

    Quelle  →  vorheriger Stand (fail-soft)  →  ENTSCHEIDUNGSDATEI

data/champions_namen_entschieden.json trägt je Name den Beleg
(PokeWiki-Infobox, Name_de UND Name_en geprüft). Wer dort etwas ändert,
ändert es überall; wer hier etwas von Hand einträgt, verliert es beim
nächsten Lauf.
"""

import json
import os
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
DATEN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUT = os.path.join(DATEN, "de_name_overrides.json")
ENTSCHIEDEN = os.path.join(DATEN, "champions_namen_entschieden.json")
POKEWIKI_API = ("https://www.pokewiki.de/api.php?action=parse&format=json&prop=wikitext"
                "&page=Liste_der_Attackennamen_in_anderen_Sprachen")
POKEMONEXPERTE = "https://pokemonexperte.de/items/"


def fetch(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def _clean(c):
    c = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", c)   # [[a|b]] -> b
    c = re.sub(r"\{\{[^}]*\}\}", "", c)
    c = re.sub(r"<[^>]+>", "", c)
    return c


def _current(cell):
    """Take the current name from an "OLD (vor) NEW (ab)" cell."""
    cell = _clean(cell)
    if "(ab" in cell:
        cur = cell.split("(ab")[0].split(")")[-1]
        return cur.strip(" .,\n\t")
    cell = re.sub(r"\(vor[^)]*\)?", "", cell)
    return cell.strip(" .,\n\t")


def scrape_moves():
    out = {}
    try:
        wt = json.loads(fetch(POKEWIKI_API).decode("utf-8", "replace"))["parse"]["wikitext"]["*"]
    except Exception as e:
        print("  moves: fetch/parse failed:", e)
        return out
    for row in wt.split("\n|-"):
        cells = re.split(r"\|\||\n\|", row)
        cells = [_current(c.lstrip("|")) for c in cells if c.strip() and not c.lstrip().startswith("!")]
        cells = [c for c in cells if c]
        if len(cells) >= 2:
            de, en = cells[0], cells[1]
            if de and en and len(en) < 40 and re.fullmatch(r"[A-Za-z0-9 .,'\-:!]+", en) and not de.startswith("{"):
                out[en] = de
    print(f"  moves: {len(out)} pairs")
    return out


def scrape_items():
    out = {}
    try:
        html = fetch(POKEMONEXPERTE).decode("cp1252", "replace")
    except Exception as e:
        print("  items: fetch failed:", e)
        return out
    for m in re.finditer(r"<li>\s*<a[^>]*>([^<]+)</a>\s*\(([^)]+)\)\s*</li>", html):
        de, en = m.group(1).strip(), m.group(2).strip()
        if de and en and len(en) < 40 and re.fullmatch(r"[A-Za-z0-9 .,'\-:!]+", en):
            out[en] = de
    print(f"  items: {len(out)} pairs")
    return out


def main():
    print("Scraping German name maps …")
    moves = scrape_moves()
    items = scrape_items()

    prev = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            prev = {}

    # Fail-soft: keep the previous section if a scrape returned nothing.
    if not moves:
        moves = prev.get("moves", {})
        print("  moves: kept previous (scrape empty)")
    if not items:
        items = prev.get("items", {})
        print("  items: kept previous (scrape empty)")

    # Die Entscheidungsdatei zuletzt: sie schlägt die Quelle UND den
    # vorherigen Stand. Fehlt sie oder ist sie kaputt, läuft der Rest
    # weiter — aber laut, denn dann fehlen geprüfte Namen.
    entschieden = {"moves": 0, "items": 0}
    try:
        namen = json.load(open(ENTSCHIEDEN, encoding="utf-8")).get("namen") or {}
        for abschnitt, ziel in (("moves", moves), ("items", items)):
            for en, eintrag in (namen.get(abschnitt) or {}).items():
                de = (eintrag or {}).get("de")
                if de and ziel.get(en) != de:
                    ziel[en] = de
                    entschieden[abschnitt] += 1
        print(f"  entschieden angewandt: moves={entschieden['moves']}, "
              f"items={entschieden['items']}")
    except Exception as e:  # noqa: BLE001
        print(f"  WARN: {ENTSCHIEDEN} nicht lesbar ({e}) — geprüfte Namen "
              f"fehlen in dieser Ausgabe")

    out = {
        "_meta": {
            "description": "Authoritative DE↔EN name maps (move/item) for "
                           "build_champions_resources.py. Current in-game German names.",
            "sources": {"moves": "PokeWiki (Liste der Attackennamen in anderen Sprachen)",
                        "items": "pokemonexperte.de/items",
                        "letztes_wort": "data/champions_namen_entschieden.json"},
            "counts": {"moves": len(moves), "items": len(items)},
            # Wie viele Namen die Entscheidungsdatei diesmal korrigiert
            # hat. Steht die Zahl auf 0, obwohl die Datei Eintraege hat,
            # greift die Anwendung nicht mehr.
            "aus_entscheidungsdatei": entschieden,
        },
        "moves": dict(sorted(moves.items())),
        "items": dict(sorted(items.items())),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"Wrote {OUT}  (moves={len(moves)}, items={len(items)})")


if __name__ == "__main__":
    main()
