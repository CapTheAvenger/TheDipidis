#!/usr/bin/env python3
"""data/champions_move_flags.json — die Merkmale der Champions-Attacken.

WARUM ES DIESE DATEI GIBT

Der Schadensrechner (js/champions-damage.js) konnte am 16.09.2026 acht
gemessene Faehigkeiten NICHT rechnen, alle aus demselben Grund: die
Attackendaten in data/champions_resources.json fuehren Typ, Staerke,
Klasse, Genauigkeit, AP, Vorrang und Ziel — aber kein einziges MERKMAL.
Ohne "ist eine Faustattacke" laesst sich Eisenfaust nicht anwenden, ohne
"macht Kontakt" nicht Krallenwucht, ohne "hat einen Zusatzeffekt" nicht
Rabauke.

Der Rechner hat das ausgewiesen statt geraten (`unbelegt`). Der Betreiber
am 16.09.2026: *"genau geraten wird nicht, aber dann muessen wir die Daten
dringend belegen"*. Das ist dieser Lauf.

QUELLE

    https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts

Der Kampfsimulator von Pokemon Showdown (MIT-Lizenz), die Datei, aus der
er selbst rechnet. Sie ist die vollstaendigste oeffentliche Aufstellung
dieser Merkmale; die PokeAPI fuehrt sie nicht.

WARUM EIN TEXTPARSER UND KEIN `require`

moves.ts ist TypeScript, und zwar nicht nur der Form nach: 23 Stellen
tragen echte Typangaben im Rumpf (`const targets: Pokemon[] = []`,
`onResidual(target: Pokemon)`). Ein `eval` als JavaScript faellt daran um.
Geparst wird deshalb ueber die Struktur: Eintraege stehen auf genau einer
Tabulator-Ebene, ihre Felder auf zweien. Das ist stabil, solange die
Datei mit Tabulatoren eingerueckt ist — und es wird geprueft, statt
angenommen (siehe `pruefe()`).

WAS HIER *NICHT* PASSIERT

Die Datei uebernimmt NUR Attacken, die der Champions-Bestand schon
fuehrt. Sie ergaenzt keine Attacke, korrigiert keine Staerke und
ueberschreibt nichts. Wer eine Abweichung zwischen beiden Quellen
sucht, findet sie in `_meta.ohne_eintrag`.
"""

import datetime
import json
import os
import re
import sys
import urllib.request

QUELLE = ("https://raw.githubusercontent.com/smogon/pokemon-showdown/"
          "master/data/moves.ts")

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESSOURCEN = os.path.join(WURZEL, "data", "champions_resources.json")
ZIEL = os.path.join(WURZEL, "data", "champions_move_flags.json")

# Uebernommen werden nur die Merkmale, die der Rechner WIRKLICH braucht.
# Showdown fuehrt 30 Stueck; die uebrigen 23 (metronome, snatch,
# failcopycat …) betreffen Regeln, die dieser Rechner nicht abbildet, und
# waeren Ballast, den niemand liest.
GEBRAUCHT = ("contact", "punch", "bite", "slicing", "sound", "pulse", "bullet")


def hole(url: str) -> str:
    kopf = {"User-Agent": "thedipidis.app move-flag sync (github.com/CapTheAvenger/TheDipidis)"}
    with urllib.request.urlopen(urllib.request.Request(url, headers=kopf), timeout=90) as r:
        return r.read().decode("utf-8")


def bloecke(text: str):
    """(Name, Rumpf) je Attacke. Der Rumpf ist der geklammerte Block."""
    kopf = re.compile(r'^\t(?:"([^"]+)"|([A-Za-z0-9_]+)):\s*\{', re.M)
    for m in kopf.finditer(text):
        start = text.index("{", m.start())
        tiefe = 0
        ende = -1
        for j in range(start, len(text)):
            if text[j] == "{":
                tiefe += 1
            elif text[j] == "}":
                tiefe -= 1
                if tiefe == 0:
                    ende = j
                    break
        if ende < 0:
            continue
        rumpf = text[start:ende + 1]
        name = re.search(r'\n\t\tname:\s*"([^"]*)"', rumpf)
        if name:
            yield name.group(1), rumpf


def merkmale(rumpf: str) -> dict:
    f = re.search(r"\n\t\tflags:\s*\{([^{}]*)\}", rumpf, re.S)
    gesetzt = set(re.findall(r"(\w+):\s*1", f.group(1))) if f else set()
    return {
        "flags": sorted(x for x in gesetzt if x in GEBRAUCHT),
        # Rueckstoss steht bei Showdown NICHT als Merkmal, sondern als
        # Feld `recoil: [x, y]` — und Bruchpiloten (Fassungslos,
        # Sprungfeder) als `hasCrashDamage`. Achtlos verstaerkt beides.
        "recoil": bool(re.search(r"\n\t\trecoil:\s*\[", rumpf))
                  or bool(re.search(r"\n\t\thasCrashDamage:\s*true", rumpf)),
        # Rabauke fragt nicht nach einem Merkmal, sondern danach, OB die
        # Attacke einen Zusatzeffekt hat. `secondary: null` heisst
        # ausdruecklich "keiner" und zaehlt deshalb nicht.
        "zusatzeffekt": bool(re.search(r"\n\t\tsecondar(?:y|ies):\s*(?!null)", rumpf)),
    }


def pruefe(gefunden: int, text: str) -> None:
    """Der Parser prueft SICH SELBST, bevor er etwas schreibt.

    Ohne das faellt eine Umstellung der Einrueckung nicht auf: der
    Parser faende null Eintraege, schriebe eine leere Datei, und der
    Rechner verloere still acht Faehigkeiten. Eine leere Ernte ist ein
    Fehler, keine Auskunft.
    """
    if gefunden < 800:
        raise SystemExit(
            f"::error::build_champions_move_flags: nur {gefunden} Attacken geparst "
            f"(erwartet >= 800). Hat Showdown die Einrueckung geaendert? "
            f"Es wird NICHTS geschrieben.")
    if "\n\t\tname:" not in text:
        raise SystemExit("::error::build_champions_move_flags: die Struktur der "
                         "Quelle passt nicht mehr — es wird NICHTS geschrieben.")


def main() -> int:
    with open(RESSOURCEN, encoding="utf-8") as f:
        eintraege = json.load(f)["entries"]
    champ = {e["en"] for e in eintraege if e.get("cat") == "move"}
    if not champ:
        raise SystemExit("::error::champions_resources.json fuehrt keine Attacken")

    text = hole(QUELLE)
    alle = dict(bloecke(text))
    pruefe(len(alle), text)

    heraus = {}
    for name in sorted(champ):
        if name in alle:
            heraus[name] = merkmale(alle[name])
    ohne = sorted(champ - set(alle))

    stand = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    zaehlung = {}
    for f in GEBRAUCHT:
        zaehlung[f] = sum(1 for v in heraus.values() if f in v["flags"])
    zaehlung["recoil"] = sum(1 for v in heraus.values() if v["recoil"])
    zaehlung["zusatzeffekt"] = sum(1 for v in heraus.values() if v["zusatzeffekt"])

    daten = {
        "_meta": {
            "quelle": QUELLE,
            "lizenz": "Pokemon Showdown, MIT",
            "erzeugt_am": stand,
            "erzeuger": "scripts/build_champions_move_flags.py",
            "attacken_im_bestand": len(champ),
            "davon_belegt": len(heraus),
            "zaehlung": zaehlung,
            "uebernommene_merkmale": list(GEBRAUCHT),
            "hinweis": (
                "Nur Attacken, die data/champions_resources.json schon fuehrt. "
                "Diese Datei ergaenzt keine Attacke und korrigiert keine Staerke."),
            # BENANNT UND DATIERT, in BEIDE Richtungen gelesen: waechst
            # die Liste, kennt Showdown eine Champions-Attacke nicht —
            # dann ist entweder der Name anders geschrieben oder die
            # Attacke neu. Schrumpft sie auf null, gehoert die Zeile weg.
            "ohne_eintrag": ohne,
            "ohne_eintrag_stand": stand[:10],
        },
        "attacken": heraus,
    }
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")
    print(f"champions_move_flags.json: {len(heraus)} von {len(champ)} Attacken belegt, "
          f"{len(ohne)} ohne Eintrag")
    print("  " + " · ".join(f"{k} {v}" for k, v in zaehlung.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
