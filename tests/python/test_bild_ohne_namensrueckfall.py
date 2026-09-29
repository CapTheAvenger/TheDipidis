"""Ein unbekannter Druck bekommt KEIN Bild eines gleichnamigen anderen Drucks.

ANLASS (29.09.2026, Wochenlauf #168, Tor rot)
---------------------------------------------
tests/python/test_set_nummern_und_maxcount.py::test_bilder_zeigen_die_karte_der_zeile
zaehlte 679 Zeilen mit dem Bild einer anderen Karte, Deckel 663. Die 16 neuen
Zeilen kamen aus data/city_league_analysis.csv: Smoliv MEM 6 und Dolliv MEM 7
(JP-Set vom 31.07.2026, nicht in der Kartendatenbank) trugen die Bilder
DRI_021 und DRI_022. `_resolve_card_info` fiel fuer das Bild auf
`get_card_info(name)` zurueck — ein Namens-Join (CLAUDE.md, Data rules).

Die Zusicherung FUEHRT `_resolve_card_info` aus, mit einer gesetzten
Kartendatenbank.
"""
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

import card_scraper_shared as css  # noqa: E402


class Datenbank:
    """Kennt Smoliv nur als DRI 21 — wie die echte Kartendatenbank."""
    DRI = {"set": "DRI", "number": "21", "rarity": "Common", "type": "Basic",
           "image_url": "https://example.invalid/tpci/DRI/DRI_021_R_EN_LG.png"}

    def get_card_info(self, name):
        return dict(self.DRI) if name == "Smoliv" else None

    def get_card(self, satz, nummer):
        return dict(self.DRI) if (satz, str(nummer)) == ("DRI", "21") else None


def test_unbekannter_druck_bekommt_kein_fremdes_bild():
    info = css._resolve_card_info("Smoliv", {("MEM", "6"): 2}, Datenbank())
    assert (info["set_code"], info["number"]) == ("MEM", "6")
    assert info["image_url"] == "", (
        "der Druck MEM 6 traegt das Bild %r — das ist DRI 21, eine andere Karte, "
        "ueber den Namen geholt" % info["image_url"])


def test_bekannter_druck_behaelt_sein_bild():
    info = css._resolve_card_info("Smoliv", {("DRI", "21"): 2}, Datenbank())
    assert info["image_url"].endswith("DRI_021_R_EN_LG.png"), (
        "der bekannte Druck hat sein eigenes Bild verloren")


def test_ohne_druckangabe_bleibt_der_namensweg():
    """Zeilen ganz ohne Set/Nummer haben nur den Namen — dort ist der
    Rueckfall die einzige Quelle und bleibt, wie er war."""
    info = css._resolve_card_info("Smoliv", {}, Datenbank())
    assert info["image_url"].endswith("DRI_021_R_EN_LG.png")
