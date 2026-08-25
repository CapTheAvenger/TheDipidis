"""Die Firestore-Standarddatenbank heisst "(default)" — mit Klammern.

Am 25.08.2026 schlug der Preisalarm-Lauf fehl:

    INVALID_ARGUMENT: Invalid database id %28default%29

Nach vierzehn gruenen Laeufen in Folge, ohne eine einzige Aenderung im
Repo. Die Ursache lag ausserhalb: google-api-core 2.35.0, veroeffentlicht
am Abend zuvor, kodiert seitdem in `path_template._expand_variable_match`
jeden eingesetzten Wert mit `urllib.parse.quote(val, safe="/")`. Aus
`(default)` wird damit `%28default%29`, und der Firestore-Server lehnt den
Namen ab.

Reproduziert (die Zeile ist der ganze Fehler):

    expand('projects/{project}/databases/{database}/documents',
           project='dipidis', database='(default)')

    2.34.0 -> projects/dipidis/databases/(default)/documents
    2.35.0 -> projects/dipidis/databases/%28default%29/documents

requirements.txt schliesst deshalb genau diese Version aus — nicht den
ganzen Zweig, damit eine behobene 2.35.1 wieder hereindarf.

Die beiden Tests hier greifen an unterschiedlichen Stellen, und das ist
Absicht: der Deploy-Test-Job installiert google-api-core gar nicht (nur
pytest, beautifulsoup4, requests, lxml). Dort haelt nur die Pruefung der
requirements.txt. Wo die echten Abhaengigkeiten liegen — im Tageslauf —
greift zusaetzlich die Messung am installierten Paket.
"""

import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_requirements_schliesst_die_kaputte_version_aus():
    """Ohne diese Zeile holt sich der naechste Lauf 2.35.0 wieder."""
    quelle = open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8").read()
    zeilen = [
        z.split("#")[0].strip()
        for z in quelle.splitlines()
        if z.split("#")[0].strip().startswith("google-api-core")
    ]
    assert zeilen, (
        "google-api-core steht nicht mehr in requirements.txt — dann loest pip "
        "wieder frei auf und zieht 2.35.0 nach"
    )
    assert any("!=2.35.0" in z for z in zeilen), (
        f"die Ausschlussmarke fehlt: {zeilen}"
    )


def test_der_datenbankname_ueberlebt_die_pfadvorlage():
    """Der Fehlerfall selbst, gemessen am tatsaechlich installierten Paket.

    Faellt hier etwas um, ist der Preisalarm am naechsten Morgen tot —
    dieser Test sagt es vorher.
    """
    pt = pytest.importorskip(
        "google.api_core.path_template",
        reason="google-api-core ist in diesem Job nicht installiert",
    )
    pfad = pt.expand(
        "projects/{project}/databases/{database}/documents",
        project="dipidis",
        database="(default)",
    )
    assert pfad == "projects/dipidis/databases/(default)/documents", (
        f"der Datenbankname wird kodiert ({pfad!r}) — Firestore antwortet "
        f"darauf mit INVALID_ARGUMENT und der Preisalarm-Lauf bricht ab"
    )
    assert "%28" not in pfad and "%29" not in pfad
