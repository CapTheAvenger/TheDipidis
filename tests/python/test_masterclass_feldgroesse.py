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

UMZUG 17.10.2026: das Stueck liegt nur noch in Hausis Konto. Der Satz
steht zusaetzlich im Hinweis, den die Live-Datei fuer eine leere Gruppe
mitbringt (LEER_HINWEIS), und die Listen der Woche stehen in
data/masterclass_live/mega-stalobor.json — beide werden hier immer
geprueft; der Satz im Stueck nur, wenn MASTERCLASS_STUECK es nennt.
"""

import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
ERZEUGER = os.path.join(WURZEL, "backend", "scrapers",
                        "current_meta_analysis_scraper.py")
STUECK = os.environ.get("MASTERCLASS_STUECK") or os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
LISTEN_SKRIPT = os.path.join(WURZEL, "scripts", "masterclass_listen_nachziehen.py")
LIVE = os.path.join(WURZEL, "data", "masterclass_live", "mega-stalobor.json")


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


def _grenze():
    quelle = _ohne_kommentare(_quelle(ERZEUGER))
    return int(re.search(r"^MASTERCLASS_MIN_SPIELER\s*=\s*(\d+)", quelle, re.M).group(1))


def test_satz_und_grenze_nennen_dieselbe_zahl():
    grenze = _grenze()
    hinweis = re.search(r"ab\s+(\d+)\s+Spielern", _quelle(LISTEN_SKRIPT))
    assert hinweis, "der Hinweis fuer eine leere Online-Gruppe nennt keine Grenze"
    assert int(hinweis.group(1)) == grenze, (
        f"der Hinweis verspricht ab {hinweis.group(1)} Spielern, der Erzeuger laesst ab {grenze} durch")
    if os.path.exists(LIVE):
        import json
        with open(LIVE, encoding="utf-8") as f:
            ol = json.load(f)["online_listen"]
        assert ol["mindest_spieler"] == grenze
        assert "ab %d Spielern" % grenze in ol["leer_hinweis"]


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck liegt im Konto (MASTERCLASS_STUECK nicht gesetzt)")
def test_der_satz_im_stueck_nennt_dieselbe_zahl():
    satz = re.search(r"ab\s+(\d+)\s+Spielern", _quelle(STUECK))
    assert satz, (
        "im Stueck steht kein Satz ueber die Grundgesamtheit der "
        "Online-Listen — dann weiss der Leser nicht, was ein Platz wert ist")
    assert int(satz.group(1)) == _grenze()


@pytest.mark.skipif(not os.path.exists(LIVE), reason="Live-Datei nicht im Baum")
def test_jede_online_liste_haelt_den_satz_ein():
    """Die Gegenprobe an den Daten selbst, nicht am Code — an den Listen,
    die die Seite einsetzt."""
    import json
    grenze = _grenze()
    with open(LIVE, encoding="utf-8") as f:
        listen = json.load(f)["online_listen"]["listen"]
    zu_klein = []
    for l in listen:
        m = re.search(r"·\s*(\d+)\.\s*von\s*(\d+)", l["name"])
        assert m, "Listenname ohne Platz und Feld: " + l["name"]
        platz, feld = int(m.group(1)), int(m.group(2))
        if feld < grenze:
            zu_klein.append(f"{l['name']} ({feld} < {grenze})")
        assert platz <= feld, f"Platz {platz} bei nur {feld} Spielern: {l['name']}"
    assert zu_klein == [], (
        "diese Online-Listen widersprechen dem Satz unter der Gruppe:\n  "
        + "\n  ".join(zu_klein))


def test_weniger_listen_sind_kein_fehler():
    """Wenn in einer ruhigen Woche keine fuenf Turniere die Grenze
    erreichen, zeigt die Gruppe weniger — und sagt es im Protokoll."""
    quelle = _quelle(ERZEUGER)
    assert "::warning::Masterclass-Listen: nur %d von %d" in quelle, (
        "ein zu kurzes Ergebnis verschwindet still")
