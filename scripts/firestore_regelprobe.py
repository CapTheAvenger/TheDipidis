#!/usr/bin/env python3
"""Firestore-Regelprobe von aussen (WZ-3, 26.09.2026).

Ersetzt den Handgriff in der Firebase Console: statt die veroeffentlichten
Regeln anzusehen, fragt diese Probe die Produktivdatenbank UNANGEMELDET
ueber die REST-Schnittstelle und prueft, was sie herausgibt.

Warum es sie gibt: am 21.08.2026 lieferte `publicProfiles` jedem
eingeloggten Nutzer alle Konten samt E-Mail-Adresse (`allow read` statt
`get`). `tests/python/test_firestore_list_gesperrt.py` prueft die Datei
`firestore.rules` — aber nicht, ob DIESE Datei veroeffentlicht ist. Das
kann nur eine Abfrage gegen die echte Datenbank.

Die Abfragen, gemessen am 27.09.2026 im Browser gegen thedipidis.app:

    list publicProfiles          403 PERMISSION_DENIED   Soll
    list emailIndex              403 PERMISSION_DENIED   Soll
    list shared_decks            403 PERMISSION_DENIED   Soll
    list testingGroupInvites     403 PERMISSION_DENIED   Soll
    list ZZgibtesnicht           403 PERMISSION_DENIED   Kontrolle 1
    get  shared_decks/ZZZZZZ     404 NOT_FOUND           Kontrolle 2

Die zwei Kontrollen machen die Antworten erst lesbar:
  * Kontrolle 1 — eine Sammlung, die es nicht gibt, muss VERWEIGERT
    werden. Kommt dort etwas anderes, erreichen die Abfragen die Regeln
    gar nicht (falsches Projekt, Netz, Dienst), und ein 403 oben beweist
    nichts.
  * Kontrolle 2 — ein Einzelabruf per ID ist erlaubt (so liest das
    Frontend) und findet nichts: 404. Kommt dort 403, sind die Regeln
    zu streng geworden und das Teilen von Decks ist kaputt; kommt 404
    auch bei den Listen oben, heisst das nicht „gesperrt", sondern
    „nicht gemessen".

Aufruf:
    python3 scripts/firestore_regelprobe.py --projekt <projectId>
    FIREBASE_CONFIG='<Inhalt von js/firebase-credentials.js>' \\
        python3 scripts/firestore_regelprobe.py
Rueckgabe: 0 = alles wie Soll, 1 = Befund (offen oder zu streng),
           2 = nicht gemessen (Kontrolle 1 fehlgeschlagen, kein Projekt).
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

# Sammlungen, deren Dokument-ID die Berechtigung ist: lesen per ID ja,
# aufzaehlen nein. Dieselbe Liste wie NUR_PER_ID in
# tests/python/test_firestore_list_gesperrt.py (eine Zusicherung haelt
# beide gleich).
NUR_PER_ID = ("publicProfiles", "emailIndex", "shared_decks", "testingGroupInvites")

KONTROLLE_LISTE = "ZZgibtesnicht"
KONTROLLE_GET = "shared_decks/ZZZZZZ"

BASIS = "https://firestore.googleapis.com/v1/projects/{p}/databases/(default)/documents/"


def abfragen(projekt):
    """[(was, pfad, soll)] — was die Probe fragt und was herauskommen muss."""
    ziele = [("list", s, 403) for s in NUR_PER_ID]
    ziele.append(("list", KONTROLLE_LISTE, 403))
    ziele.append(("get", KONTROLLE_GET, 404))
    return ziele


def urteil(ergebnisse):
    """ergebnisse: {pfad: statuscode}. Liefert (code, [zeilen]).

    Kontrolle 1 zuerst: ohne sie ist kein anderes Ergebnis lesbar."""
    zeilen = []
    k1 = ergebnisse.get(KONTROLLE_LISTE)
    if k1 != 403:
        return 2, ["NICHT GEMESSEN: list %s gab %s statt 403 — die Abfragen "
                   "erreichen die Regeln nicht" % (KONTROLLE_LISTE, k1)]
    code = 0
    for s in NUR_PER_ID:
        st = ergebnisse.get(s)
        if st == 200:
            zeilen.append("OFFEN: list %s gab 200 — die Sammlung laesst sich "
                          "unangemeldet aufzaehlen" % s)
            code = 1
        elif st != 403:
            zeilen.append("NICHT GEMESSEN: list %s gab %s" % (s, st))
            code = max(code, 1)
    k2 = ergebnisse.get(KONTROLLE_GET)
    if k2 == 403:
        zeilen.append("ZU STRENG: get %s gab 403 — Lesen per ID ist gesperrt, "
                      "geteilte Decks oeffnen nicht mehr" % KONTROLLE_GET)
        code = 1
    elif k2 != 404:
        zeilen.append("NICHT GEMESSEN: get %s gab %s statt 404" % (KONTROLLE_GET, k2))
        code = max(code, 1)
    return code, zeilen


def projekt_aus_konfig(text):
    m = re.search(r"""projectId["']?\s*:\s*["']([^"']+)""", text or "")
    return m.group(1) if m else None


def holen(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, OSError):
        return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--projekt")
    a = ap.parse_args(argv)
    projekt = a.projekt or projekt_aus_konfig(os.environ.get("FIREBASE_CONFIG"))
    if not projekt or projekt.startswith("PLACEHOLDER"):
        print("NICHT GEMESSEN: kein Firebase-Projekt (FIREBASE_CONFIG leer?)")
        return 2
    basis = BASIS.format(p=projekt)
    ergebnisse = {}
    for was, pfad, soll in abfragen(projekt):
        url = basis + pfad + ("?pageSize=1" if was == "list" else "")
        ergebnisse[pfad] = holen(url)
        print("%-4s %-24s %s (Soll %s)" % (was, pfad, ergebnisse[pfad], soll))
    code, zeilen = urteil(ergebnisse)
    for z in zeilen:
        print(("::error::" if code else "") + z)
    print("ERGEBNIS " + ({0: "wie Soll", 1: "BEFUND", 2: "NICHT GEMESSEN"}[code]))
    print(json.dumps(ergebnisse, sort_keys=True))
    return code


if __name__ == "__main__":
    sys.exit(main())
