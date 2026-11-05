#!/usr/bin/env python3
"""Karten, die es nur in Japan gibt, fuer TCG Showdown — data/showdown_jp_karten.json

Bestellung Hausi, 05.11.2026: Vorlagen aus dem Japan-Meta (Japan ist ein Set
voraus). Entscheidung Hausi: fuer Karten, die es international noch nicht gibt,
die INOFFIZIELLE englische Uebersetzung von Limitless uebernehmen, markiert,
automatisch fuer jedes neue Set.

WELCHE KARTEN
  Jede Karte der Japan-Vorlagen (data/showdown_vorlagen_jp.json), deren Druck
  (Set, Nummer) der Kartenstamm von Showdown (showdown/assets/en-*.json) nicht
  kennt — also kein internationaler Druck. Verbunden wird ueber (Set, Nummer),
  nie ueber den Namen.

WOHER
  https://limitlesstcg.com/cards/jp/<SET>/<NR>?translate=en — Kartenblock
  `.card-text` (dieselben Klassen wie auf den englischen Seiten, s.
  backend/core/kartentext.py). Die Seite sagt selbst: „unofficial translation“.

REGELN
  * Eine einmal geholte Karte wird nie wieder geholt (Limitless schonen).
  * Was nicht gelesen werden kann, fehlt und steht in _meta.fehlend — mit Grund.
  * Jede Karte traegt jp=true und inoffiziell=true; jeder Effekt manual=true
    (die Engine hat fuer eine inoffizielle Uebersetzung keinen eigenen Code;
    Textmuster der Engine koennen trotzdem greifen).

Aufruf: python3 scripts/showdown_jp_karten.py [--ohne-netz] [--html-ordner <ordner mit SET-NR.html>]
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ZIEL = DATA / "showdown_jp_karten.json"
VORLAGEN = DATA / "showdown_vorlagen_jp.json"
URL = "https://limitlesstcg.com/cards/jp/{set}/{nr}?translate=en"
BILD = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/{set}/{set}_{nr}_R_JP_LG.png"

TYP = {"Grass": "grass", "Fire": "fire", "Water": "water", "Lightning": "lightning", "Psychic": "psychic",
       "Fighting": "fighting", "Darkness": "darkness", "Metal": "metal", "Dragon": "dragon", "Colorless": "colorless",
       "Fairy": "fairy"}
SYMBOL = {"G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning", "P": "Psychic", "F": "Fighting",
          "D": "Darkness", "M": "Metal", "N": "Dragon", "C": "Colorless", "Y": "Fairy"}
TRAINER = {"Item": "item", "Supporter": "supporter", "Stadium": "stadium", "Tool": "tool", "Pokémon Tool": "tool"}


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "").replace("é", "e")).strip("-")


def _text(el) -> str:
    """Text eines Elements; Energiesymbole [R] werden zum Wort (wie im offiziellen Englisch)."""
    if el is None:
        return ""
    from bs4 import NavigableString, Tag
    teile: list[str] = []
    for kind in el.descendants:
        if isinstance(kind, NavigableString):
            p = kind.parent
            if isinstance(p, Tag) and "copy-only" in (p.get("class") or []):
                continue  # die eckigen Klammern um ein Symbol
            t = str(kind)
            if isinstance(p, Tag) and p.name == "span" and not p.get("class") and t.strip() in SYMBOL \
                    and isinstance(p.previous_sibling, Tag) and "copy-only" in (p.previous_sibling.get("class") or []):
                t = SYMBOL[t.strip()]
            teile.append(t)
        elif isinstance(kind, Tag) and kind.name == "br":
            teile.append(" ")
    return re.sub(r"\s+", " ", "".join(teile)).strip()


def karte_aus_html(html: str, set_code: str, nummer: str) -> dict:
    """Ein Kartenblock `.card-text` → Eintrag im Format von client/src/karten/en.json (tcgshowdown)."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    block = soup.select_one(".card-text")
    if block is None:
        raise ValueError("kein .card-text auf der Seite")
    name = _text(block.select_one(".card-text-name"))
    if not name:
        raise ValueError("Kartenname leer (Uebersetzung fehlt?)")
    titel = _text(block.select_one(".card-text-title"))
    art = [t.strip() for t in _text(block.select_one(".card-text-type")).split(" - ")]
    basis = {
        "id": f"jp-{set_code.lower()}-{_slug(name)}-{nummer.lower()}",
        "name": name, "setCode": set_code, "number": nummer,
        "imageUrl": BILD.format(set=set_code, nr=nummer),
        "jp": True, "inoffiziell": True,
    }
    if art[0] == "Pokémon":
        m = re.search(r" - (\w+) - (\d+) HP", titel)
        if not m:
            raise ValueError(f"Typ/KP nicht lesbar: {titel!r}")
        stufe = 2 if "Stage 2" in art else 1 if "Stage 1" in art else 0
        d = dict(basis, cardType="pokemon", hp=int(m.group(2)), energyType=TYP.get(m.group(1), "colorless"),
                 stage=stufe, attacks=[])
        evo = re.search(r"Evolves from (.+)$", " - ".join(art))
        if evo:
            d["evolvesFrom"] = evo.group(1).strip()
        fae = block.select_one(".card-text-ability")
        if fae is not None:
            info = _text(fae.select_one(".card-text-ability-info"))
            d["ability"] = {"name": re.sub(r"^Ability:\s*", "", info), "effect": _text(fae.select_one(".card-text-ability-effect")), "manual": True}
        for a in block.select(".card-text-attack"):
            info = a.select_one(".card-text-attack-info")
            sym = info.select_one(".ptcg-symbol") if info else None
            kosten = "".join("*" if ch == "C" else ch for ch in _text(sym).replace(" ", "")) if sym else ""
            if sym:
                sym.extract()
            zeile = _text(info)
            mm = re.match(r"^(.*?)\s+(\d+)([+×x\-]?)$", zeile)
            att = {"name": mm.group(1) if mm else zeile, "cost": kosten, "damage": int(mm.group(2)) if mm else 0}
            if mm and mm.group(3):
                att["damageText"] = mm.group(2) + mm.group(3).replace("x", "×")
            eff = _text(a.select_one(".card-text-attack-effect"))
            if eff:
                att["effect"] = eff
                att["manual"] = True
            d["attacks"].append(att)
        wrr = _text(block.select_one(".card-text-wrr"))
        w = re.search(r"Weakness:\s*(\w+)", wrr)
        r = re.search(r"Resistance:\s*(\w+)", wrr)
        rz = re.search(r"Retreat:\s*(\d+)", wrr)
        if w and w.group(1) in TYP:
            d["weakness"] = TYP[w.group(1)]
        if r and r.group(1) in TYP:
            d["resistance"] = TYP[r.group(1)]
        d["retreatCost"] = "*" * int(rz.group(1)) if rz else ""
        if name.endswith(" ex"):
            d["mechanic"] = "ex"
        if name.startswith("Mega ") and name.endswith(" ex"):
            d["mega"] = True
        if "Tera" in art:
            d["tera"] = True
        return d
    # Trainer / Energie: der Effekt steht im klassenlosen Abschnitt nach dem Kopf
    abschnitte = [s for s in block.select(".card-text-section") if s.get("class") == ["card-text-section"]]
    effekt = _text(abschnitte[1]) if len(abschnitte) > 1 else ""
    if art[0] == "Trainer":
        sub = next((TRAINER[t] for t in art[1:] if t in TRAINER), "item")
        d = dict(basis, cardType="trainer", trainerType=sub, effect=effekt, manual=True)
        if "ACE SPEC" in " ".join(art):
            d["aceSpec"] = True
        return d
    if art[0] == "Energy":
        basic = "Basic" in " ".join(art)
        typ = next((TYP[k] for k in TYP if name.startswith(k + " ")), "colorless")
        d = dict(basis, cardType="energy", energyType=typ, isBasic=basic)
        if not basic:
            d["effect"] = effekt
            d["manual"] = True
        return d
    raise ValueError(f"unbekannte Kartenart {art!r}")


def bekannte_drucke() -> set[tuple[str, str]]:
    """Drucke, die Showdown schon kennt: sein ausgelieferter Kartenstamm
    (showdown/assets/en-*.json); fehlt der, die internationale Kartendatenbank."""
    stamm = sorted((ROOT / "showdown" / "assets").glob("en-*.json"))
    if stamm:
        daten = json.loads(stamm[-1].read_text(encoding="utf-8"))
        return {(str(k["setCode"]).upper(), str(k["number"])) for k in daten.get("karten", [])}
    aus = set()
    with open(DATA / "all_cards_database.csv", encoding="utf-8-sig") as f:
        for z in csv.DictReader(f):
            aus.add((z["set"].upper(), str(z["number"])))
    return aus


def benoetigt() -> list[tuple[str, str, str]]:
    """(Set, Nummer, Name laut Liste) jeder Karte der Japan-Vorlagen ohne internationalen Druck."""
    if not VORLAGEN.exists():
        return []
    intern = bekannte_drucke()
    vorlagen = json.loads(VORLAGEN.read_text(encoding="utf-8")).get("vorlagen", [])
    aus: dict[tuple[str, str], str] = {}
    for v in vorlagen:
        for k in v.get("karten", []):
            key = (str(k["set"]).upper(), str(k["nummer"]))
            if key not in intern:
                aus.setdefault(key, k["name"])
    return sorted((s, n, name) for (s, n), name in aus.items())


HTML_ORDNER: Optional[Path] = None  # --html-ordner: Seiten aus Dateien <SET>-<NR>.html statt aus dem Netz


def holen(set_code: str, nummer: str) -> str:
    if HTML_ORDNER is not None:
        datei = HTML_ORDNER / f"{set_code}-{nummer}.html"
        if not datei.exists():
            raise FileNotFoundError(f"{datei.name} fehlt im HTML-Ordner")
        return datei.read_text(encoding="utf-8")
    import requests
    r = requests.get(URL.format(set=set_code, nr=nummer), timeout=30,
                     headers={"User-Agent": "Mozilla/5.0 (thedipidis.app showdown_jp_karten)"})
    r.raise_for_status()
    return r.text


def main(argv: list[str]) -> int:
    global HTML_ORDNER
    ohne_netz = "--ohne-netz" in argv
    if "--html-ordner" in argv:
        HTML_ORDNER = Path(argv[argv.index("--html-ordner") + 1])
    alt = json.loads(ZIEL.read_text(encoding="utf-8")) if ZIEL.exists() else {"karten": []}
    karten = {(k["setCode"], k["number"]): k for k in alt.get("karten", [])}
    fehlend = []
    for set_code, nr, name in benoetigt():
        if (set_code, nr) in karten:
            continue
        if ohne_netz:
            fehlend.append({"set": set_code, "nummer": nr, "name": name, "grund": "ohne Netz nicht geholt"})
            continue
        try:
            karten[(set_code, nr)] = karte_aus_html(holen(set_code, nr), set_code, nr)
            if HTML_ORDNER is None:
                time.sleep(1.0)
        except Exception as e:  # noqa: BLE001 — jede Ursache wird benannt, nicht verschluckt
            fehlend.append({"set": set_code, "nummer": nr, "name": name, "grund": str(e)[:200]})
            print(f"::warning::JP-Karte {set_code} {nr} ({name}) nicht gelesen: {e}")
    liste = sorted(karten.values(), key=lambda k: (k["setCode"], int(re.sub(r"\D", "", k["number"]) or 0), k["number"]))
    neu = {
        "_meta": {
            "beschreibung": "Karten ohne internationalen Druck fuer TCG Showdown, inoffizielle englische Uebersetzung von limitlesstcg.com (cards/jp, translate=en). Erzeugt von scripts/showdown_jp_karten.py.",
            "quelle": "https://limitlesstcg.com/cards/jp/<SET>/<NR>?translate=en",
            "anzahl": len(liste),
            "fehlend": fehlend,
        },
        "karten": liste,
    }
    ZIEL.write_text(json.dumps(neu, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"JP-Karten: {len(liste)} im Bestand, {len(fehlend)} fehlend")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
