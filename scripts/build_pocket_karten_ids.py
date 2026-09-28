#!/usr/bin/env python3
"""Baut data/pocket_karten_ids.json — die Kennungen, die im Scan-Code stehen.

ANLASS (FE-11, Hausi 27.09.2026): aus einer eingefügten Deckliste
(„2 Riolu B3 79" je Zeile, dazu „Energy: …") einen eigenen Scan-Code
erzeugen, den Pokémon TCG Pocket einliest. Pocket kennt dafür nur das
2D-Muster, keinen Textimport.

WAS IM SCAN-CODE STEHT (entschlüsselt 07.09.2026, siehe
claude/feature-review-pocket-2026-09-07.md, und unabhängig beschrieben in
github.com/KevinGutowski/tcgp-deck-qr, docs/format.md, MIT):

    [n Trainer] n × 3 Byte (Kennung + 10.000.000, big-endian)
    [m Pokémon] m × 3 Byte (Kennung, big-endian)
    [k Energien] k × 1 Byte (1 Pflanze … 8 Metall)

    als Base64 im QR-Code.

Die KENNUNG ist die Nummer aus dem Dateinamen des Kartenbilds im Spiel,
z. B. `cPK_10_015430_00_SEBIE_C.webp` → Pokémon 15430 (Frigibax, B2a 34).
Andere Drucke derselben Karte tragen meist dieselbe Kennung, aber nicht
immer: Charmeleon B1a 12 ist 12980, Charmeleon B2b 8 ist 16140. Deshalb
wird NIE über den Namen verbunden, sondern über (Set, Nummer).

QUELLE
------
github.com/flibustier/pokemon-tcg-pocket-database, `dist/cards.json`
(MIT-Lizenz). Jede Karte trägt dort Set, Nummer, Name und den Bildnamen
aus dem Spiel. Die Datei wird roh geholt und ihre Prüfsumme festgehalten.

GEGENPROBE
----------
Die Tabelle wird gegen alle Decks in data/pocket_tierlist.json gehalten:
Kartenliste der Seite → Kennungen, verglichen mit den Kennungen im
ausgelesenen Scan-Code. Stimmt ein Deck nicht, steht es mit beiden
Seiten in `_meta.gegenprobe.abweichend`. Gemessen 28.09.2026: 31 von 34
gleich; die drei anderen sind Decks, bei denen Game8s Textliste einen
anderen Druck nennt als Game8s eigenes Muster (Charmeleon, Swablu,
ein Trainer) — die Tabelle stimmt, die Quelle widerspricht sich selbst.

NEU IST ERLAUBT, VERLOREN NICHT
-------------------------------
Eine Karte, die in der bisherigen Datei stand und in der neuen Quelle
fehlt, bricht den Lauf ab — sonst würde eine Liste, die gestern noch
einen Code ergab, heute still scheitern. Ändert sich die Kennung einer
bekannten Karte, bricht der Lauf ebenfalls ab.

Aufruf:  python3 scripts/build_pocket_karten_ids.py [--quelle DATEI]
"""

import argparse
import base64
import collections
import datetime
import hashlib
import json
import os
import re
import sys
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
ZIEL = os.path.join(WURZEL, "data", "pocket_karten_ids.json")
DECKS = os.path.join(WURZEL, "data", "pocket_tierlist.json")

QUELLE_URL = ("https://raw.githubusercontent.com/flibustier/"
              "pokemon-tcg-pocket-database/main/dist/cards.json")
QUELLE_SEITE = "https://github.com/flibustier/pokemon-tcg-pocket-database"

# Die Datenbank schreibt die Aktionskarten als PROMO-A/PROMO-B, Game8 und
# unsere Dateien als P-A/P-B.
SET_NAMEN = {"PROMO-A": "P-A", "PROMO-B": "P-B"}

BILD = re.compile(r"^c(PK|TR)_\d\d_(\d{6})_\d\d")
TRAINER_VERSATZ = 10_000_000


def schluessel(set_, nummer):
    return f"{SET_NAMEN.get(set_, set_)}-{int(nummer)}"


def tabelle_aus_quelle(karten):
    """(Set, Nummer) → [Art, Kennung, Name]. Art 'P' Pokémon, 'T' Trainer."""
    tab, ohne = {}, []
    for k in karten:
        m = BILD.match(str(k.get("image") or ""))
        if not m:
            ohne.append(schluessel(k.get("set", "?"), k.get("number", 0)))
            continue
        art = "T" if m.group(1) == "TR" else "P"
        tab[schluessel(k["set"], k["number"])] = [art, int(m.group(2)), k.get("name", "")]
    return tab, ohne


def lies_code(code):
    """Base64-Code → (Trainer-Kennungen, Pokémon-Kennungen, Energien)."""
    b = base64.b64decode(code)
    i = 0
    nt = b[i]; i += 1
    tr = [int.from_bytes(b[i + 3 * j:i + 3 * j + 3], "big") - TRAINER_VERSATZ for j in range(nt)]
    i += 3 * nt
    np_ = b[i]; i += 1
    pk = [int.from_bytes(b[i + 3 * j:i + 3 * j + 3], "big") for j in range(np_)]
    i += 3 * np_
    ne = b[i]
    en = list(b[i + 1:i + 1 + ne])
    if i + 1 + ne != len(b):
        raise ValueError(f"Code hat {len(b)} Byte, erwartet {i + 1 + ne}")
    return tr, pk, en


def lies_tabelle(pfad):
    """data/pocket_karten_ids.json → {"SET-NR": [Art, Kennung, Name]}."""
    d = json.load(open(pfad, encoding="utf-8"))
    tab = {}
    for set_, reihe in d.get("sets", {}).items():
        for i, e in enumerate(reihe):
            if not e:
                continue
            wert, ni = e
            art = "T" if wert >= TRAINER_VERSATZ else "P"
            tab[f"{set_}-{i + 1}"] = [art, wert - (TRAINER_VERSATZ if art == "T" else 0), d["namen"][ni]]
    return tab


def _rest(a, b, art):
    return [f"{art}{x}" for x in sorted((collections.Counter(a) - collections.Counter(b)).elements())]


def code_kennung(code):
    """Kurzer, stabiler Schluessel eines Codes — der Deckname kann sich
    aendern, der Inhalt nicht."""
    return hashlib.sha1(code.encode("ascii")).hexdigest()[:12]


def gegenprobe(tab, decks):
    gleich, abweichend, gleich_codes = 0, [], []
    for d in decks:
        tr, pk, _ = lies_code(d["code"])
        soll_t, soll_p, fehlt = [], [], []
        for c in (d.get("pokemon") or []) + (d.get("trainer") or []):
            e = tab.get(schluessel(c["set"], c["nummer"]))
            if not e:
                fehlt.append(schluessel(c["set"], c["nummer"]))
                continue
            (soll_t if e[0] == "T" else soll_p).extend([e[1]] * int(c["anzahl"]))
        if not fehlt and collections.Counter(soll_t) == collections.Counter(tr) \
                and collections.Counter(soll_p) == collections.Counter(pk):
            gleich += 1
            gleich_codes.append(code_kennung(d["code"]))
            continue
        abweichend.append({
            "deck": d["name"],
            "fehlt_in_tabelle": fehlt,
            "nur_in_liste": _rest(soll_t, tr, "T") + _rest(soll_p, pk, "P"),
            "nur_im_code": _rest(tr, soll_t, "T") + _rest(pk, soll_p, "P"),
        })
    return {"decks": len(decks), "gleich": gleich, "abweichend": abweichend,
            "gleich_codes": sorted(gleich_codes)}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--quelle", help="cards.json aus einer Datei statt aus dem Netz")
    a = ap.parse_args(argv)

    if a.quelle:
        roh = open(a.quelle, "rb").read()
    else:
        with urllib.request.urlopen(QUELLE_URL, timeout=60) as r:
            roh = r.read()
    karten = json.loads(roh)
    tab, ohne = tabelle_aus_quelle(karten)
    if len(tab) < 1000:
        print(f"ABBRUCH: nur {len(tab)} Karten gelesen — die Quelle sieht nicht aus wie erwartet")
        return 1

    alt = lies_tabelle(ZIEL) if os.path.exists(ZIEL) else {}
    verloren = sorted(k for k in alt if k not in tab)
    geaendert = sorted(k for k in alt if k in tab and alt[k][:2] != tab[k][:2])
    if verloren or geaendert:
        print("ABBRUCH: bekannte Karten fehlen oder haben eine andere Kennung —"
              f" verloren {verloren[:10]} ({len(verloren)}), geändert {geaendert[:10]} ({len(geaendert)})")
        return 1

    decks = json.load(open(DECKS, encoding="utf-8")).get("decks", []) if os.path.exists(DECKS) else []
    probe = gegenprobe(tab, decks)

    # KOMPAKT, ABER LESBAR: je Set eine Zeile, Index = Nummer - 1, Eintrag
    # [Codewert, Namensindex]. Der Codewert ist genau die Zahl im
    # Scan-Code (Trainer schon mit +10.000.000), die Namen stehen einmal in
    # `namen`. So bleibt die Datei bei rund 70 KB statt 125 KB, und ein
    # Set-Wechsel ändert eine Zeile, nicht hundert.
    namen = sorted({e[2] for e in tab.values()})
    idx = {n: i for i, n in enumerate(namen)}
    je_set = collections.defaultdict(dict)
    for k, e in tab.items():
        set_, nr = k.rsplit("-", 1)
        je_set[set_][int(nr)] = [e[1] + (TRAINER_VERSATZ if e[0] == "T" else 0), idx[e[2]]]
    sets_zeilen = {}
    for set_ in sorted(je_set):
        hoechste = max(je_set[set_])
        sets_zeilen[set_] = [je_set[set_].get(n) for n in range(1, hoechste + 1)]

    meta = {
        "zweck": "Kennungen im Scan-Code von Pokémon TCG Pocket je (Set, Nummer) — für eigene Scan-Codes aus einer Deckliste (FE-11).",
        "quelle": QUELLE_SEITE,
        "quelle_datei": QUELLE_URL,
        "quelle_lizenz": "MIT",
        "quelle_sha256": hashlib.sha256(roh).hexdigest(),
        "abgerufen": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
        "format": "sets[SET][Nummer-1] = [Codewert, Index in namen] oder null. Codewert = Kennung, bei Trainern + 10.000.000 — genau die 3 Byte im Scan-Code.",
        "anzahl": len(tab),
        "ohne_kennung": ohne,
        "neu_in_diesem_lauf": sorted(k for k in tab if k not in alt) if alt else [],
        "gegenprobe": probe,
    }
    teile = ['{', '"_meta":' + json.dumps(meta, ensure_ascii=False, indent=1) + ',',
             '"namen":' + json.dumps(namen, ensure_ascii=False) + ',', '"sets":{']
    zeilen = [json.dumps(set_, ensure_ascii=False) + ':' + json.dumps(v, separators=(",", ":"))
              for set_, v in sets_zeilen.items()]
    teile.append(",\n".join(zeilen))
    teile.append('}}')
    text = "\n".join(teile) + "\n"
    # Unveraendert heisst: alles gleich ausser dem Abrufzeitpunkt. Sonst
    # meldete die woechentliche Ernte die Datei jede Woche als geaendert,
    # und jeder Lauf trueg 66 KB ohne neuen Inhalt aus.
    if os.path.exists(ZIEL):
        vorher = json.load(open(ZIEL, encoding="utf-8"))
        jetzt = json.loads(text)
        for d_ in (vorher, jetzt):
            d_["_meta"].pop("abgerufen", None)
        if vorher == jetzt:
            print(f"{len(tab)} Karten — unverändert, Datei bleibt stehen")
            return 0
    tmp = ZIEL + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, ZIEL)
    print(f"{len(tab)} Karten in {len(sets_zeilen)} Sets; Gegenprobe {probe['gleich']} von {probe['decks']} Decks gleich,"
          f" {len(probe['abweichend'])} abweichend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
