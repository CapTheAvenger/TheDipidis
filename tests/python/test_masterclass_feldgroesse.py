"""Der Satz unter den Online-Listen und die Grenze im Erzeuger.

BEFUND (Wochenlauf 156, 25.09.2026):

  Unter der Gruppe „Online · letzte 7 Tage" in
  masterclass/mega-stalobor.de.html steht seit dem 22.09.2026, die
  Listen kaemen aus Online-Turnieren **ab 100 Spielern**.

  build_masterclass_listen() hat diese Grenze nie angewandt. Am
  22.09. stimmte der Satz zufaellig: die fuenf besten Listen kamen aus
  Feldern von 124 bis 386 Spielern. Drei Tage spaeter schrieb der Lauf
  „Nicollas Tavares · 1. von 26" in die Liste — und der Satz darunter
  war falsch.

  Gefunden hat es keine Textpruefung, sondern eine Zusicherung, die die
  ZAHL im Chip gegen den SATZ gehalten hat.

CLAUDE.md, 13.09.2026: „Ein Oberflaechentext, der eine Tatsache ueber
die Datenlage behauptet, braucht eine Zusicherung, die ihn GEGEN DIE
DATEN haelt — nicht gegen sich selbst."

Hier ist die Form: der Satz im Stueck und die Konstante im Erzeuger
muessen dieselbe Zahl nennen. Wer eine aendert, muss die andere
mitaendern.
"""

import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
ERZEUGER = os.path.join(WURZEL, "backend", "scrapers",
                        "current_meta_analysis_scraper.py")
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")


def _quelle(pfad):
    with open(pfad, encoding="utf-8-sig") as f:
        return f.read()


def _ohne_kommentare(text):
    return re.sub(r"(?m)^\s*#.*$", "", text)


def test_der_erzeuger_kennt_eine_grenze():
    quelle = _ohne_kommentare(_quelle(ERZEUGER))
    treffer = re.search(r"^MASTERCLASS_MIN_SPIELER\s*=\s*(\d+)", quelle, re.M)
    assert treffer, (
        "build_masterclass_listen hat keine benannte Untergrenze fuer die "
        "Feldgroesse — dann ist der Satz im Stueck eine Behauptung")
    assert int(treffer.group(1)) > 0


def test_die_grenze_wird_wirklich_angewandt():
    """Verhalten, nicht Wortlaut: die Konstante muss im Filter stehen."""
    quelle = _ohne_kommentare(_quelle(ERZEUGER))
    assert re.search(r"feld\s*<\s*MASTERCLASS_MIN_SPIELER", quelle), (
        "die Konstante steht da, wird aber nirgends gegen die Feldgroesse "
        "geprueft")
    assert len(quelle) > len(_quelle(ERZEUGER)) * 0.3, (
        "das Ausschneiden der Kommentare hat zu viel entfernt")


def test_satz_und_grenze_nennen_dieselbe_zahl():
    quelle = _ohne_kommentare(_quelle(ERZEUGER))
    grenze = int(re.search(r"^MASTERCLASS_MIN_SPIELER\s*=\s*(\d+)",
                           quelle, re.M).group(1))
    stueck = _quelle(STUECK)
    satz = re.search(r"ab\s+(\d+)\s+Spielern", stueck)
    assert satz, (
        "im Stueck steht kein Satz ueber die Grundgesamtheit der "
        "Online-Listen — dann weiss der Leser nicht, was ein Platz wert ist")
    assert int(satz.group(1)) == grenze, (
        f"das Stueck verspricht ab {satz.group(1)} Spielern, der Erzeuger "
        f"laesst ab {grenze} durch")


def test_jeder_online_chip_haelt_den_satz_ein():
    """Die Gegenprobe an den Daten selbst, nicht am Code."""
    stueck = _quelle(STUECK)
    grenze = int(re.search(r"ab\s+(\d+)\s+Spielern", stueck).group(1))
    chips = re.findall(r'data-mcl-liste="\d+"[^>]*>([^<]+)<', stueck)
    online = [c for c in chips if re.search(r"·\s*\d+\.\s*von\s*\d+", c)]
    assert online, "keine Online-Chips im Stueck"
    zu_klein = []
    for c in online:
        m = re.search(r"·\s*(\d+)\.\s*von\s*(\d+)", c)
        platz, feld = int(m.group(1)), int(m.group(2))
        if feld < grenze:
            zu_klein.append(f"{c.strip()} ({feld} < {grenze})")
        assert platz <= feld, f"Platz {platz} bei nur {feld} Spielern: {c}"
    assert zu_klein == [], (
        "diese Online-Listen widersprechen dem Satz unter der Gruppe:\n  "
        + "\n  ".join(zu_klein))


def test_weniger_listen_sind_kein_fehler():
    """Wenn in einer ruhigen Woche keine fuenf Turniere die Grenze
    erreichen, zeigt die Gruppe weniger — und sagt es im Protokoll."""
    quelle = _quelle(ERZEUGER)
    assert "::warning::Masterclass-Listen: nur %d von %d" in quelle, (
        "ein zu kurzes Ergebnis verschwindet still")
