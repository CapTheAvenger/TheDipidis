#!/usr/bin/env python3
"""Gemeinsamer Schreiber fuer data/masterclass_live/<id>.json.

UMZUG 17.10.2026 (Hausi): die gekauften Masterclasses liegen nur noch in
seinem Konto (Firestore users/{uid}/masterclasses/<id>). Das Repo ist
oeffentlich — der bezahlte Text gehoert nicht hinein. Die ZAHLEN und
LISTEN darin kommen aber aus oeffentlichen Turnierdaten und sollen weiter
jede Woche frisch sein („die Daten will ich auch in Zukunft live haben …
wenn ich die Master Class oeffne, dass die ganz kurz laedt und sich dann
die aktuellen Daten einzieht“).

Darum schreibt der Wochenlauf nicht mehr in die HTML-Datei, sondern in
eine oeffentliche JSON je Masterclass. js/ds-masterclass.js holt sie beim
Oeffnen und setzt die Werte in die mit data-live markierten Stellen.

REGEL: in diese Datei kommt nur, was aus data/ gerechnet ist — Zahlen,
Formatnamen, Turniernamen, Karten einer Turnierliste. Kein Satz aus der
Ausarbeitung. tests/python/test_masterclass_live.py haelt das fest.

Jeder Erzeuger schreibt NUR seinen eigenen Schluessel (matchups,
online_listen); die anderen bleiben stehen.
"""
import datetime as dt
import json
import os

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDNER = os.path.join(WURZEL, "data", "masterclass_live")


def pfad(guide_id):
    return os.path.join(ORDNER, "%s.json" % guide_id)


def lesen(guide_id):
    try:
        with open(pfad(guide_id), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def schreibe_teil(guide_id, schluessel, daten, jetzt=None):
    """Ersetzt genau einen Schluessel und den Stempel. Gibt True zurueck,
    wenn sich der Inhalt (ohne Stempel) geaendert hat — sonst bleibt die
    Datei unberuehrt, damit der Wochenlauf keinen leeren Commit macht."""
    alt = lesen(guide_id)
    if alt.get(schluessel) == daten:
        return False
    neu = dict(alt)
    neu[schluessel] = daten
    meta = dict(neu.get("_meta") or {})
    meta["id"] = guide_id
    meta["erzeugt_am"] = (jetzt or dt.datetime.now(dt.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta["quelle"] = "data/ (Turnierdaten), erzeugt von scripts/masterclass_zahlen_nachziehen.py und scripts/masterclass_listen_nachziehen.py"
    neu["_meta"] = meta
    os.makedirs(ORDNER, exist_ok=True)
    tmp = pfad(guide_id) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(neu, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, pfad(guide_id))
    return True
