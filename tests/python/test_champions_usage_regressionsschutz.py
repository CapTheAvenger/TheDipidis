"""Der Regressionsschutz darf eine geschrumpfte Quelle nicht als Ausfall lesen.

BEFUND (25.08.2026): der Lauf `Champions Usage Refresh` war sieben Mal in
Folge rot, und data/champions_usage.json stand seit dem 17.07. — 39 Tage.
Der Schutz hat jedes Mal korrekt nach seiner damaligen Regel gehandelt und
die committete Datei behalten. Nur konnte die Regel nie wieder erfuellt
werden. Gemessen an der Quelle am 25.08.2026:

    Sitemap                 358 Slugs
    davon mit API-Eintrag   238
    davon 404               120   — ausnahmslos Zierformen: Alcremie-Cremes,
                                    Castform-Wetterformen, Florges-Bluetenfarben,
                                    Furfrou-Schnitte, Aegislash-Klingenform.
                                    Kein einziges Basis-Pokemon fehlt.

Die committete Datei trug 353 Eintraege; 92 % davon sind 325. Die Quelle
kann 325 nicht mehr liefern. Aus einem Schutz gegen duenne Scrapes war
damit eine Dauersperre geworden — unsichtbar, weil ein haltender Schutz
genau so aussieht wie ein Schutz, der gerade etwas Gutes tut.

Der erste Lauf mit der neuen Regel (25.08.2026, 17:54 UTC) rechnete 115
entfallene Schluessel heraus, kam auf einen Erwartungswert von 238, holte
238 und schrieb die Datei zum ersten Mal seit 39 Tagen neu.

Die Regel jetzt: ein 404 ist eine Aussage der Quelle ("diese Seite gibt es
nicht") und wird aus dem Vergleichswert herausgerechnet. Eine Drosselung
meldet sich mit 429/503 oder einem Zeitueberlauf und zaehlt weiterhin voll
— dafuer wurde der Schutz gebaut, und dafuer bleibt er scharf.
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
QUELLE = open(os.path.join(ROOT, "scripts", "scrape_champions_usage.py"),
              encoding="utf-8").read()


def _ohne_kommentar(text):
    """Kommentare raus, bevor eine Zusicherung nach Code sucht — sonst
    stolpert der Test ueber die Erklaerung des alten Verhaltens, die das
    alte Verhalten zitiert."""
    return re.sub(r'(?m)^\s*#.*$', '', text)


CODE = _ohne_kommentar(QUELLE)


def test_ein_404_wird_von_einem_ausfall_unterschieden():
    assert re.search(r"except urllib\.error\.HTTPError as e:\s*\n\s*if e\.code == 404:", CODE), (
        "scrape_pokemon unterscheidet 404 nicht mehr von einem Netzfehler — "
        "dann zaehlt eine geloeschte Seite wieder wie eine Drosselung"
    )


def test_der_vergleichswert_rechnet_entfallene_eintraege_heraus():
    assert "erwartet = prev - len(entfallen)" in CODE, (
        "der Vergleichswert ist wieder die rohe alte Gesamtzahl — damit "
        "sperrt jede dauerhafte Verkleinerung der Quelle den Lauf fuer immer"
    )
    assert "entfallen = frueher_da & nicht_vorhanden" in CODE
    assert not re.search(r"ok < prev \* 0\.92", CODE), (
        "der alte Vergleich gegen prev steht wieder im Code"
    )
    assert re.search(r"ok < erwartet \* 0\.9", CODE), (
        "es wird gar nicht mehr gegen einen Erwartungswert geprueft"
    )


def test_die_schwelle_ist_nicht_aufgeweicht_worden():
    """Der Fund rechtfertigt einen richtigeren Nenner, keinen laxeren Bruch."""
    m = re.search(r"ok < erwartet \* (0\.\d+)", CODE)
    assert m, "die Schwelle ist nicht mehr auffindbar"
    assert float(m.group(1)) >= 0.92, (
        f"die Schwelle steht auf {m.group(1)} — unter 0.92 kaeme ein "
        f"gedrosselter Lauf wieder durch"
    )


def test_404_slugs_werden_nicht_dreimal_nachgeholt():
    """Vier Durchlaeufe ueber 120 Seiten, die es nicht gibt, kosten 480
    Anfragen und Wartezeit aus genau dem Budget, das die echten
    Drosselungen brauchen."""
    marke = "nicht_vorhanden.add(slug)"
    assert marke in CODE
    # Zwischen dem Vermerk und der naechsten Fehlerbehandlung muss ein
    # continue stehen — sonst landet der Slug zusaetzlich in `failed` und
    # damit in der Wiederholungsliste.
    schwanz = CODE[CODE.index(marke):CODE.index("if not rec:", CODE.index(marke))]
    assert "continue" in schwanz, "ein 404-Slug landet wieder in der Wiederholungsliste"
    assert "failed.append" not in schwanz


def test_ein_404_liefert_wirklich_die_fehlt_marke(monkeypatch):
    """Nicht nur der Quelltext — das Verhalten.

    Ein 404 muss `fehlt=True` ergeben, ein 503 nicht. Genau an diesem
    Unterschied haengt der ganze Fund.
    """
    import importlib.util
    import urllib.error

    pfad = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")
    spec = importlib.util.spec_from_file_location("champ_usage", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    def wirf(code):
        def _f(url, timeout=45):
            raise urllib.error.HTTPError(url, code, "x", None, None)
        return _f

    monkeypatch.setattr(mod, "fetch_text", wirf(404))
    assert mod.scrape_pokemon("furfrou-kabuki-trim") == (None, None, True)

    monkeypatch.setattr(mod, "fetch_text", wirf(503))
    assert mod.scrape_pokemon("pelipper") == (None, None, False), (
        "eine Drosselung wird als 'gibt es nicht' verbucht — dann rechnet "
        "der Schutz sie aus dem Vergleichswert heraus und ein duenner "
        "Scrape kommt durch"
    )


def test_null_treffer_bleiben_toedlich():
    """Wenn gar nichts ankommt, ist die Quelle weg — das darf nie durch."""
    assert 'if ok == 0:' in CODE
    assert 'FATAL: 0 Pok' in QUELLE


def test_der_scrape_meldet_was_die_quelle_nicht_mehr_kennt():
    """Sonst waere die naechste Verkleinerung wieder unsichtbar."""
    assert "stehen in der Sitemap, aber die" in QUELLE, (
        "der Lauf schweigt ueber 404-Slugs — dann faellt es wieder erst "
        "auf, wenn die Datei Wochen alt ist"
    )
