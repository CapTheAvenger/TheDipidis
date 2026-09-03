"""Deutsche Namen, die es bis auf die Seite schaffen muessen.

WAS HIER SCHIEFGEHEN KANN

Die Runde vom 31.08.2026 hat 63 Namen belegt — aber nur die, die sich
zwischen einer Referenzdatei und der grossen Namenstabelle
WIDERSPRACHEN. Zwei Sorten Fehler blieben dadurch unsichtbar:

1. NAMEN, DIE NUR IN DER REFERENZ STEHEN. Die Oberflaeche liest
   ausschliesslich data/champions_names_de.json — js/app-side-quest-pokedex.js
   deName() hat keinen Rueckfall auf das de_name-Feld der Referenzdateien.
   Was in der Tabelle fehlt, steht auf der deutschen Seite englisch da.
   Betroffen waren 23 Eintraege, darunter alle dreizehn Mega-Steine und
   die Beere, die auf jedem zweiten Team liegt.

2. NAMEN, DIE IN BEIDEN DATEIEN GLEICH FALSCH STANDEN. Ein Widerspruch
   entsteht nur, wenn zwei Quellen sich uneinig sind. "Glurakit Y" stand
   nirgends im Streit — es war nur falsch (richtig: Gluraknit Y). Am
   03.09.2026 wurden deshalb alle 204 de_name-Werte einzeln gegen die
   PokeWiki-Infobox geprueft; 20 waren falsch.

Beides wird hier gegen die Dateien gerechnet, nicht behauptet.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

REFERENZEN = (
    ("moves", "champions_moves_reference.json", "moves"),
    ("items", "champions_items_reference.json", "items"),
    ("abilities", "champions_abilities_reference.json", "abilities"),
)


def _json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _ist_mega_stein(en):
    """Charizardite X und Y enden nicht auf "ite" — der Buchstabe haengt
    hinten dran. Ein Filter auf endswith("ite") uebersieht genau die zwei,
    die am 03.09.2026 beide falsch waren."""
    return re.search(r"ite( [XY])?$", en) is not None


def _bauer():
    import importlib.util
    pfad = os.path.join(ROOT, "scripts", "build_champions_pokedex.py")
    spec = importlib.util.spec_from_file_location("bauer_namen_sichtbar", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def tabelle():
    return _json("champions_names_de.json")


# ── 1. Kein Name bleibt in der Referenz stecken ──────────────────────

def test_jeder_referenzname_steht_auch_in_der_tabelle(tabelle):
    """Die Oberflaeche liest nur die Tabelle.

    Ein de_name, der ausschliesslich in einer Referenzdatei steht,
    erreicht keinen Leser — die Karte zeigt dann den englischen Namen.
    Vor dem 03.09.2026 traf das 23 Eintraege, davon 22 Gegenstaende, die
    in echten Teams vorkommen.
    """
    fehlend = []
    for gruppe, datei, schluessel in REFERENZEN:
        ref = _json(datei)[schluessel]
        for en, eintrag in ref.items():
            de = (eintrag or {}).get("de_name")
            if de and not tabelle.get(gruppe, {}).get(en):
                fehlend.append(f"{gruppe}/{en} ({de})")
    assert not fehlend, (
        "Diese deutschen Namen stehen in einer Referenzdatei, aber nicht in "
        "champions_names_de.json — auf der deutschen Seite erscheint dort "
        f"Englisch: {fehlend}")


def test_tabelle_widerspricht_der_referenz_nirgends(tabelle):
    """Zwei Quellen, ein Name. Wo beide etwas sagen, muss es dasselbe sein.

    Das ist die Bedingung, die scripts/datenluecken.py als
    "Namenskonflikt" meldet — hier noch einmal direkt, damit ein
    Widerspruch auch dann auffaellt, wenn jemand den Melder umbaut.
    """
    streit = []
    for gruppe, datei, schluessel in REFERENZEN:
        ref = _json(datei)[schluessel]
        for en, eintrag in ref.items():
            a = (eintrag or {}).get("de_name")
            b = tabelle.get(gruppe, {}).get(en)
            if a and b and a != b:
                streit.append(f"{gruppe}/{en}: Referenz {a!r} vs. Tabelle {b!r}")
    assert not streit, f"Widersprueche zwischen Referenz und Tabelle: {streit}"


# ── 2. Der Bauer macht es selbst, nicht die Handkorrektur ────────────

def test_der_bauer_traegt_die_referenznamen_selbst_nach(tmp_path):
    """Geprueft wird das Ergebnis des Bauers, nicht der Quelltext.

    Ein Test, der nur nach der Zeichenkette "REFERENZ_PFADE" sucht,
    bliebe gruen, wenn die Schleife leer liefe. Deshalb laeuft hier der
    Bauer in eine Wegwerfdatei, und die Mega-Steine muessen darin
    stehen — sie kommen aus keiner anderen Quelle als der Referenz.
    """
    mod = _bauer()
    ziel = tmp_path / "names_de.json"
    mod.NAMES_DE_OUT = str(ziel)
    mod.write_names_de({"Pikachu": "Pikachu"})
    gebaut = json.loads(ziel.read_text(encoding="utf-8"))

    ref_items = _json("champions_items_reference.json")["items"]
    nur_referenz = [en for en, e in ref_items.items()
                    if (e or {}).get("de_name") and _ist_mega_stein(en)]
    assert len(nur_referenz) >= 13, (
        "Erwartet werden mindestens die dreizehn Mega-Steine als Probe; "
        f"gefunden {len(nur_referenz)}")
    fehlend = [en for en in nur_referenz if not gebaut["items"].get(en)]
    assert not fehlend, (
        "Der Bauer hat diese Namen nicht aus der Referenz nachgetragen: "
        f"{fehlend}")


def test_die_referenz_ueberschreibt_nichts(tmp_path):
    """Die Referenz ist Lueckenfueller, nicht Vorrang.

    Sie ist die schwaechere Quelle: ihre Namen sind ungeprueft, solange
    sie nicht in der Entscheidungsdatei stehen. Wo die Tabelle schon
    etwas hat, muss es bleiben — sonst kippt ein Referenzfehler einen
    belegten Namen um.

    Geprueft wird mit einer untergeschobenen Referenzdatei, die fuer eine
    Attacke ausdruecklich etwas Falsches sagt. Ein Test gegen die echten
    Dateien koennte das nicht sehen: dort sind Referenz und Tabelle seit
    dem 03.09.2026 ueberall einig, ein Vorrang faellt also nicht auf.
    """
    mod = _bauer()

    # Eine Attacke, die die Tabelle schon fuehrt und die NICHT in der
    # Entscheidungsdatei steht — sonst gaebe die den Ausschlag.
    tab = _json("champions_names_de.json")["moves"]
    entschieden = _json("champions_namen_entschieden.json")["namen"].get("moves", {})
    opfer = next(en for en in tab if en not in entschieden)
    richtig = tab[opfer]

    falsche_referenz = tmp_path / "moves_falsch.json"
    falsche_referenz.write_text(json.dumps(
        {"_meta": {}, "moves": {opfer: {"de_name": "GEFAELSCHT"}}},
        ensure_ascii=False), encoding="utf-8")
    mod.REFERENZ_PFADE = dict(mod.REFERENZ_PFADE)
    mod.REFERENZ_PFADE["moves"] = (str(falsche_referenz), "moves")

    ziel = tmp_path / "names_de.json"
    mod.NAMES_DE_OUT = str(ziel)
    mod.write_names_de({"Pikachu": "Pikachu"})
    gebaut = json.loads(ziel.read_text(encoding="utf-8"))

    assert gebaut["moves"][opfer] == richtig, (
        f"Die Referenz hat {opfer} von {richtig!r} auf "
        f"{gebaut['moves'][opfer]!r} umgeschrieben — sie darf nur Luecken "
        "fuellen, nicht ueberschreiben.")


def test_die_entscheidungsdatei_gewinnt_auch_gegen_die_referenz(tmp_path):
    """Reihenfolge: Tabelle, dann Referenz als Fueller, dann Entscheidung.

    Wenn der Lueckenfueller NACH der Entscheidungsdatei liefe, koennte ein
    ungeprueftes de_name einen belegten Namen ueberschreiben — und der
    Fehler saehe im Ergebnis genauso aus wie der alte Fall vom 31.08.
    """
    mod = _bauer()
    entschieden = _json("champions_namen_entschieden.json")["namen"]["items"]
    opfer = "Roseli Berry"
    assert opfer in entschieden, "Probe-Eintrag ist nicht mehr belegt"

    falsche_referenz = tmp_path / "items_falsch.json"
    falsche_referenz.write_text(json.dumps(
        {"_meta": {}, "items": {opfer: {"de_name": "Rosolinbeere"}}},
        ensure_ascii=False), encoding="utf-8")
    mod.REFERENZ_PFADE = dict(mod.REFERENZ_PFADE)
    mod.REFERENZ_PFADE["items"] = (str(falsche_referenz), "items")

    ziel = tmp_path / "names_de.json"
    mod.NAMES_DE_OUT = str(ziel)
    mod.write_names_de({"Pikachu": "Pikachu"})
    gebaut = json.loads(ziel.read_text(encoding="utf-8"))

    assert gebaut["items"][opfer] == entschieden[opfer]["de"] == "Hibisbeere"


# ── 3. Die 20 Korrekturen vom 03.09.2026 ─────────────────────────────

# Jeder dieser Namen ist einzeln ueber die PokeWiki-Infobox belegt:
# Name_de und Name_en stehen dort nebeneinander, und Name_en muss genau
# der englische Name sein, unter dem wir suchen. Die Weiterleitung allein
# reicht nicht — "Psychic" leitet auf "Psycho" (den Typ) weiter, nicht auf
# die Attacke "Psychokinese".
KORREKTUREN_2026_09_03 = {
    "items": {
        "Charizardite Y": "Gluraknit Y",
        "Charizardite X": "Gluraknit X",
        "Venusaurite": "Bisaflornit",
        "Floettite": "Floetteonit",
        "Gengarite": "Gengarnit",
        "Aerodactylite": "Aerodactylonit",
        "Chandelurite": "Skelabranit",
        "Delphoxite": "Fennexisnit",
        "Drampanite": "Sen-Longnit",
        "Froslassite": "Frosdedjenit",
        "Glimmoranite": "Lumifloranit",
        "Golurkite": "Golgantesnit",
        "Choice Specs": "Wahlbrille",
        "Eject Pack": "Fluchttasche",
        "Booster Energy": "Energiekapsel",
        "Black Glasses": "Schattenbrille",
        "Fairy Feather": "Feendaune",
        "Terrain Extender": "Feldbeschichtung",
        "Roseli Berry": "Hibisbeere",
    },
    "abilities": {
        "Fairy Aura": "Feenaura",
    },
}


@pytest.mark.parametrize("gruppe,en,de", [
    (g, en, de)
    for g, paare in KORREKTUREN_2026_09_03.items()
    for en, de in paare.items()
])
def test_korrigierter_name_steht_ueberall(gruppe, en, de, tabelle):
    """Der belegte Name muss an allen drei Stellen stehen.

    Referenzdatei, Entscheidungsdatei und ausgelieferte Tabelle. Steht er
    nur an zweien, kippt ihn der naechste Neubau zurueck.
    """
    datei = dict((g, d) for g, d, _ in REFERENZEN)[gruppe]
    schluessel = dict((g, s) for g, _, s in REFERENZEN)[gruppe]
    ref = _json(datei)[schluessel]
    assert ref[en]["de_name"] == de, (
        f"{datei}: {en} steht als {ref[en]['de_name']!r}, belegt ist {de!r}")

    ent = _json("champions_namen_entschieden.json")["namen"][gruppe]
    assert ent[en]["de"] == de
    assert ent[en]["quelle"].startswith("https://pokewiki.de/"), (
        f"{en}: ohne Quelle ist der Name nur eine Behauptung")

    assert tabelle[gruppe][en] == de, (
        f"champions_names_de.json: {en} steht als "
        f"{tabelle[gruppe].get(en)!r}, belegt ist {de!r}")


def test_mega_steine_enden_auf_nit():
    """Die deutsche Endung ist -nit, nicht -it.

    Zwoelf von dreizehn Mega-Steinen waren am 03.09.2026 falsch
    gebildet ("Glurakit Y" statt "Gluraknit Y"). Der Fehler ist
    systematisch und wuerde sich beim naechsten neuen Mega-Stein
    wiederholen, wenn ihn niemand festhaelt.
    """
    ref = _json("champions_items_reference.json")["items"]
    steine = {en: (e or {}).get("de_name") for en, e in ref.items()
              if _ist_mega_stein(en)}
    assert len(steine) >= 13, f"nur {len(steine)} Mega-Steine gefunden"
    falsch = [f"{en} -> {de}" for en, de in steine.items()
              if de and not de.split(" ")[0].endswith("nit")]
    assert not falsch, (
        "Diese Mega-Stein-Namen enden nicht auf -nit: " + str(falsch))


def test_die_bilanz_der_runden_stimmt_mit_den_eintraegen_ueberein():
    """Ohne Quelle ist ein Name eine Behauptung.

    Die _meta-Notiz der zweiten Runde nennt eine Zahl; die muss zu den
    Eintraegen passen, sonst behauptet die Datei etwas ueber sich selbst,
    was nicht stimmt.
    """
    e = _json("champions_namen_entschieden.json")
    zweite = e["_meta"]["zweite_runde_2026_09_03"]
    assert zweite["ergebnis"]["geprueft"] == 204
    assert zweite["ergebnis"]["falsch"] == 20
    assert zweite["ergebnis"]["richtig"] == 184
    assert (zweite["ergebnis"]["falsch"] + zweite["ergebnis"]["richtig"]
            == zweite["ergebnis"]["geprueft"])

    dritte = e["_meta"]["dritte_runde_2026_09_03"]["ergebnis"]
    assert dritte["widersprueche"] == 18
    assert (dritte["tabelle_richtig"] + dritte["ressourcendatei_richtig"]
            == dritte["widersprueche"])

    vierte = e["_meta"]["vierte_runde_2026_09_03"]["ergebnis"]
    assert vierte["ergaenzt"] == vierte["mega_steine"] + vierte["faehigkeiten"], (
        "die Bilanz der vierten Runde geht nicht auf")

    gesamt = sum(len(v) for v in e["namen"].values())
    # Runde 3: neun wurden entschieden, aber nur acht sind NEU. Sharp Beak
    # stand schon seit Runde 1 in der Datei; der falsche Wert sass in
    # de_name_overrides.json und wurde nur ueberdeckt.
    assert dritte["neu_eingetragen"] == dritte["ressourcendatei_richtig"] - 1
    soll = 63 + 20 + dritte["neu_eingetragen"] + vierte["ergaenzt"]
    assert gesamt == soll, (
        f'63 (Runde 1) + 20 (Runde 2) + {dritte["neu_eingetragen"]} (Runde 3) '
        f'+ {vierte["ergaenzt"]} (Runde 4) ergibt {soll}, gezaehlt {gesamt}. '
        f'Wer Namen ergaenzt, zieht die Bilanz in _meta nach.')
    ohne = [f"{g}/{en}" for g, paare in e["namen"].items()
            for en, rec in paare.items()
            if not (rec or {}).get("quelle", "").startswith("https://pokewiki.de/")]
    assert not ohne, f"Namen ohne PokeWiki-Quelle: {ohne}"


def test_gepruefte_referenz_behauptet_nicht_mehr_als_sie_belegt():
    """Der _meta-Vermerk der Referenzdateien war zu gross geraten.

    Er behauptete, jeder Name sei einzeln gegen pokewiki.de geprueft —
    belegt war das nur fuer die 63 Streitfaelle. Seit dem 03.09.2026
    stimmt die Behauptung, weil alle 204 geprueft wurden; der Vermerk
    muss das Datum nennen, damit die naechste Erweiterung weiss, ab wann
    sie gilt.
    """
    for _, datei, _ in REFERENZEN:
        meta = _json(datei)["_meta"]
        vermerk = meta.get("de_namen_geprueft", "")
        assert "03.09.2026" in vermerk, (
            f"{datei}: _meta.de_namen_geprueft nennt das Pruefdatum nicht "
            f"({vermerk[:80]!r})")
        assert "champions_namen_entschieden.json" in vermerk, (
            f"{datei}: der Vermerk verweist nicht auf die Belegdatei")


# ── 4. Die vierte Quelle (dritte Runde, 03.09.2026) ──────────────────

KORREKTUREN_RUNDE_3 = {
    "Focus Band":   "Fokusband",
    "Shell Bell":   "Muschelglocke",
    "Wise Glasses": "Schlaubrille",
    "Ghost Gem":    "Geisterjuwel",
    "Rock Gem":     "Gesteinsjuwel",
    "Grass Gem":    "Pflanzenjuwel",
    "Lagging Tail": "Schwerschweif",
    "Sharp Beak":   "Spitzer Schnabel",
}


def _resources():
    return _json("champions_resources.json")["entries"]


def test_alle_vier_namensquellen_sind_sich_einig():
    """Die entscheidende Zusicherung dieser Runde.

    Es gibt VIER Quellen deutscher Namen: die drei Referenzdateien, die
    Namenstabelle — und champions_resources.json mit 1.268 Eintraegen,
    mehr als jede andere. Die vierte stand bis zum 03.09.2026 in keinem
    Vergleich; gemessen widersprach sie der Tabelle an 18 Stellen.

    Hier wird jede Quelle gegen jede gehalten, nicht drei gegen eine.
    """
    tab = _json("champions_names_de.json")
    ref = {g: _json(d)[s] for g, d, s in REFERENZEN}
    KAT = {"item": "items", "ability": "abilities", "move": "moves"}
    streit = []
    for e in _resources():
        gruppe = KAT.get(e.get("cat"))
        if not gruppe or not e.get("en") or not e.get("de"):
            continue
        t = tab.get(gruppe, {}).get(e["en"])
        if t and t != e["de"]:
            streit.append(f"Ressourcen/Tabelle {gruppe}/{e['en']}: "
                          f"{e['de']!r} vs. {t!r}")
        r = (ref.get(gruppe, {}).get(e["en"]) or {}).get("de_name")
        if r and r != e["de"]:
            streit.append(f"Ressourcen/Referenz {gruppe}/{e['en']}: "
                          f"{e['de']!r} vs. {r!r}")
    assert not streit, ("Die vier Namensquellen widersprechen sich wieder: "
                        + str(streit[:12]))


@pytest.mark.parametrize("en,de", sorted(KORREKTUREN_RUNDE_3.items()))
def test_korrektur_der_dritten_runde_steht_ueberall(en, de, tabelle):
    """Diese acht kamen aus de_name_overrides.json und waren dort falsch.

    Die Quelle der Overrides ist pokemonexperte.de/items — dort stehen
    teils abgeschnittene In-Game-Beschriftungen ("Schwerschwf.") und
    Namen aus der Zeit vor Schwert und Schild ("Hackattack").
    """
    ov = _json("de_name_overrides.json")["items"]
    assert ov[en] == de, f"de_name_overrides.json: {en} steht als {ov[en]!r}"
    ent = _json("champions_namen_entschieden.json")["namen"]["items"]
    assert ent[en]["de"] == de
    assert tabelle["items"][en] == de


def test_kein_name_ist_flachgeklopfte_wiki_auszeichnung():
    """PokeWiki setzt zwei Namen mit <br> untereinander.

    "Name_de=Wandler<br>Verwandler{{tt|...}}" — oben der aktuelle Name,
    darunter der alte. Der Scraper hat beide plus einen Rest der
    tt-Vorlage in EIN Feld gelegt: "Wandler  Verwandler (in )". Ueber
    alle 1.469 Namen der Overrides-Datei war das der einzige Fall; die
    Suchbedingung bleibt trotzdem stehen, weil derselbe Scraper wieder
    laufen wird.
    """
    import re
    ov = _json("de_name_overrides.json")
    kaputt = []
    for gruppe in ("moves", "items"):
        for en, de in (ov.get(gruppe) or {}).items():
            if re.search(r"\s{2,}|\(\s*\)|<|>|\||\[|\]|&[a-z]+;", de or ""):
                kaputt.append(f"{gruppe}/{en}: {de!r}")
    assert not kaputt, ("Diese Werte sind keine Namen, sondern Auszeichnung: "
                        + str(kaputt))


def test_der_melder_kennt_die_vierte_quelle():
    """Ein Melder, der drei von vier Quellen kennt, meldet null Konflikte
    und liegt trotzdem falsch."""
    quelle = open(os.path.join(ROOT, "scripts", "datenluecken.py"),
                  encoding="utf-8").read()
    i = quelle.index("def namenskonflikte():")
    j = quelle.index("\ndef ", i + 10)
    block = quelle[i:j]
    assert "champions_resources.json" in block, (
        "scripts/datenluecken.py vergleicht die vierte Namensquelle nicht mehr")
    assert 'e.get("cat")' in block, (
        "der Vergleich liest die Kategorie der Ressourceneintraege nicht — "
        "dann trifft er die falschen Toepfe gegeneinander")


def test_der_ressourcen_bauer_setzt_die_entschiedenen_namen_selbst():
    """Sonst dreht der naechste Neubau die Korrektur zurueck.

    Genau dieser Fehler ist am 31.08. beim Pokedex-Bauer passiert und
    hat zwei Namen gekostet. Der Ressourcen-Bauer hatte dieselbe Luecke
    bis zum 03.09.2026.
    """
    quelle = open(os.path.join(ROOT, "scripts", "build_champions_resources.py"),
                  encoding="utf-8").read()
    assert "champions_namen_entschieden.json" in quelle, (
        "build_champions_resources.py liest die Entscheidungsdatei nicht — "
        "ein Neubau ueberschreibt jede Korrektur")
    i = quelle.index("champions_namen_entschieden.json")
    j = quelle.index('with open(OUT, "w"', i)
    block = quelle[i:j]
    assert 'e["de"] = de' in block, (
        "die Entscheidungsdatei wird gelesen, aber nicht angewandt")
