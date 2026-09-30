"""is_ace_spec: die Scraper schreiben mit dem Wissen des GANZEN Bestands.

WARUM ES DIESE DATEI GIBT
-------------------------
Der Wochenlauf meldete am 10.09.2026:

    is_ace_spec driftet wieder: 5276 Felder in den ausgelieferten CSVs
    sind anders belegt als die Regel es vorgibt.

Die Untersuchung ergab: kein Scraper-Fehler. Beide betroffenen Scraper
schrieben exakt nach `entscheide_zeile` — der Form, die nur die EINE
Zeile kennt. Der Abgleich rechnet dagegen mit `entscheide`, das den
ganzen Bestand kennt. Beide Formen sind fuer sich richtig; die Differenz
war strukturell und kam bei jedem Lauf wieder:

    current_meta_card_data.csv          770 von  4501 Zeilen
    online_tournament_dated_cards.csv  4506 von 29153 Zeilen
    alle uebrigen ~20 Dateien            0

Genau diese zwei Dateien werden bei jedem Lauf VOLLSTAENDIG aus dem
aktuellen Ausschnitt neu geschrieben — das Wissen aus frueheren Formaten
ging dabei jedes Mal verloren.

Der Betreiber hat am 10.09.2026 entschieden: Ursache im Scraper beheben,
nicht die Meldung wegautomatisieren. Seither holen sich beide Stellen die
Belege des Gesamtbestands ueber `belege_aus_bestand()` und schreiben
gleich den starken Wert.

Diese Datei haelt fest, dass es dabei bleibt — und dass die beiden
Umsetzungen der Belegsammlung (Regelmodul und Reparaturskript) nicht
auseinanderlaufen koennen.
"""

import importlib.util
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "backend"))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

from core import ace_spec_regel as regel  # noqa: E402

DATEN = os.path.join(WURZEL, "data")


def _reparaturskript():
    pfad = os.path.join(WURZEL, "scripts", "repariere_ace_spec.py")
    spec = importlib.util.spec_from_file_location("_rep_ace", pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def test_beide_schreibstellen_nutzen_den_ganzen_bestand():
    """Der Kern der Entscheidung vom 10.09.2026."""
    for datei, wo in (
        ("backend/core/card_scraper_shared.py", "current_meta_card_data.csv"),
        ("backend/core/limitless_dated.py", "online_tournament_dated_cards.csv"),
    ):
        with open(os.path.join(WURZEL, datei), encoding="utf-8-sig") as f:
            q = f.read()
        assert "belege_aus_bestand" in q, (
            f"{datei} schreibt {wo} wieder ohne die Belege des Gesamtbestands "
            "— dann meldet der naechste Lauf die Drift erneut.")
        assert "entscheide_zeile(" not in q, (
            f"{datei} benutzt wieder die zeilenweise Form. Sie kennt nur die "
            "eine Zeile, und weil diese Datei bei jedem Lauf komplett neu "
            "geschrieben wird, geht das Wissen aelterer Formate verloren.")


def test_der_wochenlauf_berichtigt_seit_30_09():
    """Bis 30.09.2026 stand hier „die Regel 'melden statt reparieren'
    bleibt". Hausi hat am 30.09. anders entschieden (DA-22): die Drift kam
    nach jedem neuen JP-Set wieder, weil eine neue Karte beim Schreiben
    noch keinen Beleg hat. Der Wochenlauf faehrt seitdem --schreiben —
    Reihenfolge und Meldung prueft
    tests/python/test_ace_spec_wochenlauf_berichtigt.py."""
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    with open(pfad, encoding="utf-8") as f:
        w = f.read()
    ruf = re.search(r"^\s*python3 scripts/repariere_ace_spec\.py.*$", w, re.M)
    assert ruf, "der Wochenlauf rechnet is_ace_spec nicht mehr nach"
    assert "--schreiben" in ruf.group(0) and "--melden" not in ruf.group(0), ruf.group(0)


def test_die_beiden_belegsammlungen_stimmen_ueberein():
    """Regelmodul und Reparaturskript duerfen nicht auseinanderlaufen.

    Sonst schreibt der Scraper nach der einen Sammlung und der Abgleich
    rechnet mit der anderen — und die Drift waere zurueck, nur an einer
    anderen Stelle.
    """
    rep = _reparaturskript()
    dateien = rep.dateien_mit_spalte(DATEN)
    if not dateien:
        pytest.skip("keine ausgelieferten CSVs mit card_name vorhanden")
    mehrfach_a, typen_a = regel.sammle_belege(dateien)
    mehrfach_b, typen_b, _ = rep.sammle_belege(dateien)

    nur_a = sorted(mehrfach_a - mehrfach_b)[:10]
    nur_b = sorted(mehrfach_b - mehrfach_a)[:10]
    assert mehrfach_a == mehrfach_b, (
        "Die Mengen 'irgendwo mehrfach gespielt' unterscheiden sich. "
        f"nur im Regelmodul: {nur_a} · nur im Reparaturskript: {nur_b}")

    abweichend = [n for n in set(typen_a) | set(typen_b)
                  if set(typen_a.get(n, ())) != set(typen_b.get(n, ()))]
    assert not abweichend, (
        f"{len(abweichend)} Namen mit abweichenden type-Werten, z.B. "
        f"{sorted(abweichend)[:8]}")


def test_der_bestand_wird_nur_einmal_gelesen():
    """Ohne Zwischenspeicher laese jede Zeile den ganzen Bestand neu."""
    regel._BELEGE_CACHE.clear()
    erste = regel.belege_aus_bestand(DATEN)
    zweite = regel.belege_aus_bestand(DATEN)
    assert erste is zweite, (
        "belege_aus_bestand liefert jedes Mal ein neues Ergebnis — das "
        "liest bei 29153 Zeilen den kompletten Bestand 29153 Mal.")


def test_die_belege_sind_nicht_leer():
    """Ein leerer Bestand wuerde `entscheide` still auf `entscheide_zeile`
    zurueckfallen lassen — genau die Lage vor dem 10.09.2026."""
    regel._BELEGE_CACHE.clear()
    mehrfach, typen = regel.belege_aus_bestand(DATEN)
    assert len(mehrfach) > 100, (
        f"nur {len(mehrfach)} mehrfach gespielte Namen gefunden — am "
        "10.09.2026 waren es 833. Der Bestand wird nicht gelesen.")
    assert len(typen) > 100, f"nur {len(typen)} Namen mit type-Werten"


def test_die_strenge_form_entscheidet_mehr_als_die_zeilenweise():
    """Der Grund, warum der Wechsel ueberhaupt etwas bringt."""
    regel._BELEGE_CACHE.clear()
    mehrfach, typen = regel.belege_aus_bestand(DATEN)
    ace = regel.lade_ace_liste()
    name = sorted(mehrfach)[0]
    # In DIESER Zeile einmal gespielt, kein Typ bekannt:
    assert regel.entscheide_zeile(name, ace, 1, "") == "", (
        f"'{name}' ist zeilenweise bereits entschieden — dann taugt er "
        "nicht als Beispiel")
    assert regel.entscheide(name, ace, mehrfach, typen) == "No", (
        f"'{name}' wurde im Bestand nachweislich mehrfach gespielt, wird "
        "aber nicht als 'No' entschieden")
