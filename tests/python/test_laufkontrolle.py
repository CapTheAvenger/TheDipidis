"""Der rote Lauf, den niemand sah.

Befund vom 31.08.2026: "Champions Usage Refresh" war mehrere Tage rot (zu
scharfer Regressionsschutz in scrape_champions_usage.py, behoben in PR #518),
ohne dass es auffiel. Davor liefen 31 Laeufe *gruen*, waehrend
champions_usage.json seit dem 17.07. stillstand — die Seite zeigte 35 Tage
alte Zahlen als "Saison: Current".

Die Stillstand-Haelfte faengt seither check_champions_freshness() im Guardian
ab. Die Rot-Haelfte hatte keinen Kanal: GitHub schickt eine Mail, und Mails
gehen unter. Ueberbrueckt wurde das mit einer taeglichen Kontrolle von Hand,
die jeden Morgen eine Freigabe verlangte — also mit Aufmerksamkeit, genau der
Waehrung, die knapp ist.

Jetzt prueft der Data Guardian die Laeufe selbst und meldet sie in dasselbe
rollende Issue wie alles andere. Dieser Test haelt drei Dinge fest:

1. Die Pruefung existiert und traegt die Workflows, um die es geht.
2. Sie meldet ihren *eigenen* Ausfall (fehlendes `gh`) als Befund, statt
   stumm "alles gruen" zu behaupten — die Bauart, die den Befund oben erst
   moeglich gemacht hat.
3. Die Meldung beruecksichtigt die Funde der Laufkontrolle, nicht nur die des
   Guardian-Skripts. Ohne das oeffnet ein roter Lauf allein kein Issue.
"""

import os
import re

import pytest

yaml = pytest.importorskip("yaml")

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WF_DIR = os.path.join(WURZEL, ".github", "workflows")
GUARDIAN = os.path.join(WF_DIR, "data-guardian.yml")

# Nicht ueberwacht, mit Grund:
#   bot-keepalive     — alle 5 Minuten, waere nur Rauschen
#   visual-fullpage   — Bildvergleich, keine Daten
#   data-guardian     — der Lauf, der die Pruefung selbst ausfuehrt
NICHT_UEBERWACHT = {"bot-keepalive.yml", "visual-fullpage.yml", "data-guardian.yml"}


def _guardian():
    with open(GUARDIAN, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _schritt(name):
    for s in _guardian()["jobs"]["guard"]["steps"]:
        if s.get("name") == name:
            return s
    raise AssertionError(f"Schritt {name!r} fehlt in data-guardian.yml")


def _geplante_workflows():
    """Jeder Workflow mit einem cron, nach Dateiname."""
    aus = set()
    for name in os.listdir(WF_DIR):
        if not name.endswith((".yml", ".yaml")):
            continue
        with open(os.path.join(WF_DIR, name), encoding="utf-8") as f:
            if re.search(r"^\s*-\s*cron:", f.read(), re.M):
                aus.add(name)
    return aus


def test_pruefung_existiert():
    s = _schritt("Datenlaeufe auf Rot pruefen")
    assert s.get("id") == "laeufe", "die Meldung liest steps.laeufe.outputs.rot"
    assert "gh run list" in s["run"], "die Pruefung fragt die Laeufe nicht mehr ab"


def test_jeder_geplante_datenlauf_wird_ueberwacht():
    """Wer einen geplanten Workflow anlegt, soll ihn bewusst ein- oder
    aussortieren — nicht stillschweigend aus der Aufsicht fallen."""
    lauf = _schritt("Datenlaeufe auf Rot pruefen")["run"]
    offen = sorted(
        w for w in _geplante_workflows()
        if w not in NICHT_UEBERWACHT and w not in lauf
    )
    assert not offen, (
        "geplante Workflows ohne Aufsicht: " + ", ".join(offen)
        + " — entweder in die Liste in data-guardian.yml aufnehmen oder hier "
          "in NICHT_UEBERWACHT mit Begruendung eintragen"
    )


def test_wachliste_nennt_nur_workflows_die_es_gibt():
    """Ein umbenannter Workflow soll auffallen, nicht leise durchrutschen:
    `gh run list` antwortet fuer einen unbekannten Namen leer, und die
    Schleife haelt ihn dann fuer 'noch nie gelaufen'."""
    lauf = _schritt("Datenlaeufe auf Rot pruefen")["run"]
    genannt = set(re.findall(r"^\s+([a-z0-9-]+\.yml)$", lauf, re.M))
    assert genannt, "die Wachliste ist leer"
    fehlend = sorted(w for w in genannt if not os.path.exists(os.path.join(WF_DIR, w)))
    assert not fehlend, "Wachliste nennt Workflows, die es nicht gibt: " + ", ".join(fehlend)


def test_fehlendes_gh_wird_gemeldet_nicht_verschwiegen():
    lauf = _schritt("Datenlaeufe auf Rot pruefen")["run"]
    assert "command -v gh" in lauf, "ohne diese Pruefung meldet der Schritt stumm alles gruen"
    kopf = lauf.split("WORKFLOWS=")[0]
    assert "::error::" in kopf and "rot=1" in kopf, (
        "der Ausfall der Pruefung muss selbst ein Befund sein"
    )
    assert "exit 0" in kopf, (
        "der Schritt darf nicht hart abbrechen — sonst laeuft 'Report findings' "
        "nicht und verschluckt die Funde des Guardian-Skripts mit"
    )


def test_meldung_zaehlt_die_laufkontrolle_mit():
    s = _schritt("Report findings")
    assert "steps.laeufe.outputs.rot" in (s.get("env") or {}).get("ROT", ""), \
        "die Meldung kennt das Ergebnis der Laufkontrolle nicht"
    assert re.search(r'\$\(\(\s*\$\{CRIT:-0\}\s*\+\s*\$\{ROT:-0\}\s*\)\)', s["run"]), \
        "ein roter Lauf allein oeffnet dann kein Issue"


def test_laufkontrolle_steht_vor_der_meldung():
    namen = [s.get("name") for s in _guardian()["jobs"]["guard"]["steps"]]
    assert namen.index("Datenlaeufe auf Rot pruefen") < namen.index("Report findings"), \
        "die Befunde muessen in /tmp/findings.md stehen, bevor die Meldung sie liest"
