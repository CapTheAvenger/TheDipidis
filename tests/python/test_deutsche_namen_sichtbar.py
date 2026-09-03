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


def test_jeder_entschiedene_name_der_zweiten_runde_traegt_seine_quelle():
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

    gesamt = sum(len(v) for v in e["namen"].values())
    assert gesamt == 63 + 20, (
        f"63 aus der ersten Runde plus 20 aus der zweiten ergibt 83, "
        f"gezaehlt {gesamt}")
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
