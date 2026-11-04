"""Zwei Spalten heissen `deck_slug` und meinen nicht dasselbe.

BEFUND (10.09.2026). Beide Dateien fuehren eine Spalte dieses Namens:

    tournament_decklists_per_player.csv   24442, 25592, 26263  (Kennung)
    labs_tournament_decks.csv             alakazam-dudunsparce (Namensschluessel)

Ein Verbund darueber ergibt 0 Treffer — 934 verschiedene Werte gegen 267,
Schnittmenge leer. Und genau das ist die Falle: eine leere Ergebnismenge
sieht aus wie "diese Woche gab es keine Uebereinstimmung" und nicht wie
"diese beiden Spalten sind nicht dasselbe Ding".

Der Verbund, der traegt, laeuft ueber die Namen:

    decklists.deck_archetype  ==  labs.deck_name        52 von 53

Ein Umbenennen waere sauberer und ist genau das, was data/_consumers.md
verbietet: die Spaltennamen sind veroeffentlicht, ein anderes Projekt
liest sie. Also steht die Warnung dort, und diese Datei haelt sie fest.

WAS HIER NICHT GEPRUEFT WIRD: welche Archetypen es diese Woche sind und
wie viele. Geprueft werden zwei Eigenschaften — dass die
gleichnamigen Spalten sich weiterhin NICHT ueberschneiden, und dass der
Namensverbund weiterhin die grosse Mehrheit trifft. Faellt die erste,
hat sich eine Quelle geaendert und die Warnung gehoert ueberdacht statt
repariert; das steht so im Fehlertext.
"""

import csv
import io
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOK = os.path.join(WURZEL, "data", "_consumers.md")


def _lies(name):
    pfad = os.path.join(WURZEL, "data", name)
    with io.open(pfad, encoding="utf-8-sig", newline="") as fh:
        kopf = fh.readline()
        trenn = ";" if kopf.count(";") > kopf.count(",") else ","
        fh.seek(0)
        return list(csv.DictReader(fh, delimiter=trenn))


sys.path.insert(0, os.path.join(WURZEL, "scripts"))
import per_player_auszuege as _ppa  # noqa: E402  (SC-45: Auszuege je Format und Monat)
DECKLISTEN = list(_ppa.zeilen(os.path.join(WURZEL, "data")))
LABS = _lies("labs_tournament_decks.csv")


def _menge(zeilen, spalte):
    return {(z.get(spalte) or "").strip() for z in zeilen} - {""}


def test_beide_dateien_haben_ueberhaupt_zeilen():
    """Vorpruefung gegen ein leeres Bestehen."""
    assert len(DECKLISTEN) > 100, f"nur {len(DECKLISTEN)} Decklisten-Zeilen"
    assert len(LABS) > 100, f"nur {len(LABS)} Labs-Zeilen"


def _nach_quelle(quelle):
    return _menge([z for z in DECKLISTEN
                   if (z.get("quelle") or "").strip() == quelle], "deck_slug")


def test_papierzeilen_fuehren_zahlen_online_zeilen_namen():
    """SEIT DEM 10.09.2026 SIND ES DREI BEDEUTUNGEN, NICHT ZWEI.

    Der Wochenlauf #135 hat Online-Zeilen dazugeschrieben, und deren
    `deck_slug` ist ein NAMENSSCHLUESSEL ("alakazam-dusknoir") — dieselbe
    Bauart wie in labs_tournament_decks.csv, waehrend die Papierzeilen
    eine Zahlenkennung fuehren ("28752").

    Geprueft wird die FORM je Herkunft. Eine Vermischung innerhalb einer
    Herkunft waere der eigentliche Befund: dann hat eine Quelle ihre
    Schreibweise geaendert, und data/_consumers.md gehoert nachgezogen.
    """
    papier = _nach_quelle("papier")
    online = _nach_quelle("online")
    assert papier, "keine Papier-deck_slugs"
    keine_zahl = sorted(w for w in papier if not w.isdigit())
    assert not keine_zahl, (
        f"{len(keine_zahl)} Papier-deck_slug(s) sind keine Zahl: "
        f"{keine_zahl[:5]}")
    if online:
        zahlen = sorted(w for w in online if w.isdigit())
        assert not zahlen, (
            f"{len(zahlen)} Online-deck_slug(s) sind eine Zahl: {zahlen[:5]}")


def test_eine_ueberschneidung_kommt_nur_ueber_online_zustande():
    """Die Papierhaelfte darf die Labs-Werte weiterhin NICHT treffen.

    Genau das war der urspruengliche Befund: ein Verbund ueber
    `deck_slug` ergab 0 Treffer und sah aus wie "diese Woche nichts
    gefunden". Fuer die Papierhaelfte gilt das unveraendert; die
    Online-Haelfte trifft jetzt (gemessen 10.09.2026: 79 Werte), und
    genau deshalb ist der Verbund ueber die NAMEN der richtige — er
    gilt fuer beide Herkuenfte.
    """
    labs = _menge(LABS, "deck_slug")
    assert labs, "labs deck_slug ist leer"
    gemeinsam_papier = _nach_quelle("papier") & labs
    assert not gemeinsam_papier, (
        f"die Papierzeilen ueberschneiden sich jetzt mit den Labs-Werten "
        f"in {len(gemeinsam_papier)} Faellen. Eine Quelle hat ihre "
        f"Schreibweise geaendert — data/_consumers.md gehoert ueberdacht. "
        f"Beispiele: {sorted(gemeinsam_papier)[:3]}")


def test_der_namensverbund_traegt():
    archetypen = _menge(DECKLISTEN, "deck_archetype")
    namen = _menge(LABS, "deck_name")
    assert archetypen, "deck_archetype ist leer"
    treffer = archetypen & namen
    # Eine Gleichung gegen die Dateien selbst, kein Wochenwert: der
    # Verbund muss die grosse Mehrheit treffen, sonst ist er auch keiner.
    # Welche Archetypen das sind, ist der Pruefung egal.
    anteil = len(treffer) / len(archetypen)
    assert anteil >= 0.9, (
        f"der Namensverbund trifft nur {len(treffer)} von {len(archetypen)} "
        f"Archetypen ({anteil:.0%}) — dann ist er als empfohlener Weg nicht "
        f"mehr haltbar. Ohne Gegenstueck: "
        f"{sorted(archetypen - namen)[:5]}"
    )


def test_die_warnung_steht_in_der_schnittstellenbeschreibung():
    """data/_consumers.md ist die veroeffentlichte Schnittstelle. Wer die
    Dateien von aussen liest, sieht nur sie."""
    with io.open(DOK, encoding="utf-8") as f:
        text = f.read()
    assert "deck_slug" in text, (
        "_consumers.md warnt nicht mehr vor den zwei gleichnamigen Spalten"
    )
    assert "deck_archetype" in text and "deck_name" in text, (
        "_consumers.md nennt den Verbund nicht, der stattdessen traegt"
    )
