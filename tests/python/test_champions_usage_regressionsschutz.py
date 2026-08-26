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

# ── Der zweite Schutz: kann der Stand ueberhaupt stimmen? ────────────
#
# Am selben Abend zeigte sich, dass "frisch" nicht "richtig" heisst. Der
# erste erfolgreiche Scrape seit 39 Tagen trug 16 Anteilslisten ueber
# 105 % und zwei doppelte Attackenzeilen; der committete Stand davor
# hatte von beidem null. Diese Daten landeten im Deploy-Gate und hielten
# drei Auslieferungen an. Seitdem prueft der Scraper das selbst.


def test_der_scraper_prueft_seinen_eigenen_stand():
    assert "def unmoegliche_bloecke(" in CODE, (
        "die Plausibilitaetspruefung des fertigen Standes fehlt — dann "
        "wandert ein unmoeglicher Scrape wieder bis in den Deploy"
    )
    assert "unmoeglich = unmoegliche_bloecke(pokemon)" in CODE, (
        "die Pruefung ist definiert, aber nicht verdrahtet"
    )


def test_sie_faengt_genau_die_beiden_faelle_von_heute(monkeypatch):
    """Verhalten, nicht Quelltext — mit den echten Zahlen des Fundes."""
    import importlib.util

    pfad = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")
    spec = importlib.util.spec_from_file_location("champ_usage2", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    sauber = {"pelipper": {"doubles": {
        "nature": [{"name": "Modest", "pct": 53.9}, {"name": "Timid", "pct": 30.1}],
        "move": [{"name": "Hurricane", "pct": 98.4}, {"name": "Tailwind", "pct": 89.3}],
    }}}
    assert mod.unmoegliche_bloecke(sauber) == []

    # absol/doubles/nature, wie am 25.08.2026 gescraped: 111,5 %
    zu_hoch = {"absol": {"doubles": {"nature": [
        {"name": "Adamant", "pct": 53.5}, {"name": "Jolly", "pct": 23.2},
        {"name": "Brave", "pct": 10.9}, {"name": "Lonely", "pct": 8.3},
        {"name": "Naive", "pct": 7.9}, {"name": "Timid", "pct": 7.7}]}}}
    befunde = mod.unmoegliche_bloecke(zu_hoch)
    assert len(befunde) == 1 and "111.5" in befunde[0], befunde

    # musharna/doubles/move: dieselbe Zeile zweimal
    doppelt = {"musharna": {"doubles": {"move": [
        {"name": "Yawn", "pct": 60.0}, {"name": "Yawn", "pct": 60.0}]}}}
    befunde = mod.unmoegliche_bloecke(doppelt)
    assert len(befunde) == 1 and "doppelte Zeile" in befunde[0], befunde


def test_sie_schlaegt_nicht_bei_attacken_an(monkeypatch):
    """Vier Attacken summieren sich naturgemaess weit ueber 100 %.
    Eine Pruefung, die dort anschlaegt, ist keine Pruefung, sondern Rauschen."""
    import importlib.util

    pfad = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")
    spec = importlib.util.spec_from_file_location("champ_usage3", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    vier_attacken = {"incineroar": {"doubles": {"move": [
        {"name": "Fake Out", "pct": 95.0}, {"name": "Knock Off", "pct": 88.0},
        {"name": "Parting Shot", "pct": 70.0}, {"name": "Flare Blitz", "pct": 65.0}]}}}
    assert mod.unmoegliche_bloecke(vier_attacken) == []


def test_ein_genullter_ausreisser_zaehlt_nicht_mit(monkeypatch):
    """pruefe_plausibel setzt den Ausreisser auf None und markiert ihn.
    Die Summenpruefung darf ihn dann nicht trotzdem mitrechnen."""
    import importlib.util

    pfad = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")
    spec = importlib.util.spec_from_file_location("champ_usage4", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    markiert = {"passimian": {"doubles": {"held_item": [
        {"name": "Choice Scarf", "pct": 23.3}, {"name": "Sitrus Berry", "pct": 20.0},
        {"name": "Leftovers", "pct": 18.0}, {"name": "Focus Sash", "pct": 15.0},
        {"name": "Life Orb", "pct": 12.0},
        {"name": "Assault Vest", "pct": None, "unplausibel": "53.9 %"}]}}}
    assert mod.unmoegliche_bloecke(markiert) == []


def test_die_summengrenze_bleibt_streng():
    """Eine Grenze, die 111,5 % durchlaesst, haette den Fund nicht gefunden.

    Mutationsprobe: mit SUMMEN_GRENZE = 200 blieben alle Verhaltenstests
    oben gruen, weil kein Beispiel so hoch liegt. Diese Zusicherung
    schliesst die Luecke.
    """
    m = re.search(r"SUMMEN_GRENZE\s*=\s*([\d.]+)", CODE)
    assert m, "SUMMEN_GRENZE ist nicht mehr auffindbar"
    grenze = float(m.group(1))
    assert 100.0 < grenze <= 110.0, (
        f"die Grenze steht auf {grenze} % — unter 100 schlaegt sie bei "
        f"jeder normalen Liste an, ueber 110 laesst sie den Fall vom "
        f"25.08.2026 (111,5 %) durch"
    )
    assert 'SUMMEN_KATEGORIEN = ("held_item", "nature", "ability")' in CODE, (
        "die Liste der Kategorien mit Summenzwang hat sich geaendert"
    )
    assert CODE.count("SUMMEN_GRENZE =") == 1, (
        "die Grenze steht zweimal im Code — dann kann eine der beiden "
        "Stellen still auseinanderlaufen"
    )


# ── Korrektur vom 26.08.2026: der Schutz war ein Daueralarm ──────────
#
# Der Lauf wurde jeden Morgen rot, und die Datei stand bei 40 Tagen —
# obwohl 233 der 238 Pokemon voellig in Ordnung waren. Ursache war nicht
# die Quelle allein, sondern eine zu breite Regel: `unmoegliche_bloecke`
# lehnte den ganzen Stand ab, sobald irgendwo eine Anteilsliste ueber der
# Grenze lag — und ueberstimmte damit `pruefe_plausibel`, die genau diesen
# Fall seit dem 20.08. behandelt und woertlich protokolliert:
# "kein einzelner Ausreisser, Liste unveraendert markiert".
#
# An der Quelle gemessen am 26.08.2026, unveraendert gegenueber dem
# Vortag: 25 Wesenslisten ueber 105 %, 2 Spreads ausserhalb 66/32. Das ist
# kein Ausrutscher, das ist ihr Zustand. Ein Alarm, der daraufhin taeglich
# anschlaegt, ist keiner mehr.


def _mod():
    import importlib.util
    pfad = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")
    spec = importlib.util.spec_from_file_location("champ_usage_korr", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_ein_markierter_block_wird_nicht_zweimal_bewertet():
    """Der Kern der Korrektur.

    Traegt ein Block einen Vermerk, hat die Selbstkontrolle den Fall
    gesehen und behandelt. Ihn hier erneut abzulehnen heisst, ihre
    Entscheidung zu ueberstimmen.
    """
    mod = _mod()
    unmarkiert = {"absol": {"doubles": {"nature": [
        {"name": "Adamant", "pct": 53.5}, {"name": "Jolly", "pct": 23.2},
        {"name": "Brave", "pct": 10.9}, {"name": "Lonely", "pct": 8.3},
        {"name": "Naive", "pct": 7.9}, {"name": "Timid", "pct": 7.7}]}}}
    assert len(mod.unmoegliche_bloecke(unmarkiert)) == 1, (
        "eine unmarkierte unmoegliche Liste muss weiterhin auffallen — sonst "
        "kann sich die Quelle unbemerkt veraendern"
    )

    markiert = {"absol": {"doubles": dict(
        unmarkiert["absol"]["doubles"],
        _warnungen=["nature: Anteile summierten sich auf 111.5 %"])}}
    assert mod.unmoegliche_bloecke(markiert) == [], (
        "ein bereits markierter Block laesst den ganzen Lauf scheitern — "
        "genau der Daueralarm vom 25./26.08."
    )


def test_die_selbstkontrolle_entfernt_unmoegliche_spreads():
    """173 Angriffspunkte lassen sich nicht markieren und trotzdem zeigen —
    der Spread traegt die Endwerte und damit die Speed-Tiers."""
    mod = _mod()
    block = {"stat_points": [
        {"evs": "2 HP / 173 Atk / 2 Def", "points": {"hp": 2, "atk": 173, "def": 2}},
        {"evs": "32 HP / 32 Atk / 2 Def", "points": {"hp": 32, "atk": 32, "def": 2}},
        {"evs": "71 HP / 2 Atk / 32 SpD", "points": {"hp": 71, "atk": 2, "spd": 32}},
    ]}
    mod.pruefe_plausibel(block)
    assert len(block["stat_points"]) == 1, block["stat_points"]
    assert block["stat_points"][0]["evs"] == "32 HP / 32 Atk / 2 Def"
    assert any("Spread" in w for w in block["_warnungen"]), (
        "die Entfernung wird nicht vermerkt — dann ist sie eine stille Reparatur"
    )


def test_doppelte_zeilen_auch_in_attackenlisten():
    """Die Regel lief bis zum 26.08. nur ueber die drei Listen mit
    Summenzwang. Die beiden echten Faelle standen in Attackenlisten."""
    mod = _mod()
    block = {"move": [{"name": "Ally Switch", "pct": 60.0},
                      {"name": "Ally Switch", "pct": 55.0},
                      {"name": "Protect", "pct": 50.0}]}
    mod.pruefe_plausibel(block)
    assert len(block["move"]) == 2
    assert any("doppelte" in w for w in block["_warnungen"])


def test_der_echte_stand_vom_25_08_kommt_jetzt_durch():
    """Der Beweis, dass die Korrektur traegt — an den echten Daten.

    Ohne Selbstkontrolle lehnte der Schutz den Stand ab. Mit ihr bleibt
    nichts uebrig, was den Lauf rechtfertigt abzubrechen.
    """
    import copy
    mod = _mod()
    # Ein Stand mit genau den Fehlerarten des 25.08.
    roh = {
        "absol": {"doubles": {"nature": [
            {"name": "Adamant", "pct": 53.5}, {"name": "Jolly", "pct": 23.2},
            {"name": "Brave", "pct": 10.9}, {"name": "Lonely", "pct": 8.3},
            {"name": "Naive", "pct": 7.9}, {"name": "Timid", "pct": 7.7}]}},
        "araquanid": {"doubles": {"stat_points": [
            {"evs": "2 HP / 173 Atk / 2 Def", "points": {"hp": 2, "atk": 173, "def": 2}},
            {"evs": "32 HP / 32 Def / 2 SpD", "points": {"hp": 32, "def": 32, "spd": 2}}]}},
        "musharna": {"doubles": {"move": [
            {"name": "Yawn", "pct": 60.0}, {"name": "Yawn", "pct": 55.0}]}},
        "pelipper": {"doubles": {"nature": [
            {"name": "Modest", "pct": 53.9}, {"name": "Timid", "pct": 30.1}]}},
    }
    ohne = copy.deepcopy(roh)
    assert len(mod.unmoegliche_bloecke(ohne)) >= 3, (
        "die Testdaten tragen die Fehler nicht mehr"
    )

    mit = copy.deepcopy(roh)
    for rec in mit.values():
        for fmt in ("doubles", "singles"):
            b = rec.get(fmt)
            if isinstance(b, dict):
                mod.pruefe_plausibel(b)
    assert mod.unmoegliche_bloecke(mit) == [], (
        "nach der Entschaerfung bleibt ein Befund stehen — der Lauf waere "
        "wieder rot"
    )
    # Und das Ergebnis ist ehrlich: entfernt, vermerkt, nichts geraten.
    assert len(mit["araquanid"]["doubles"]["stat_points"]) == 1
    assert len(mit["musharna"]["doubles"]["move"]) == 1
    assert mit["pelipper"]["doubles"].get("_warnungen") is None, (
        "ein sauberer Block bekommt einen Vermerk — dann sagt der Vermerk nichts mehr"
    )
