"""Ein deutscher Gegenstandsname kippt nicht, nur weil sich eine Quelle aendert.

Champions Replica Scrape #147 (07.10.2026): fuer Dragon Scale und Macho Brace
widersprachen sich PokeWiki ("Drachenhaut", "Machoband") und PokéAPI
("Drachenschuppe", "Machoschiene"). Zwei Quellen sind keine Mehrheit; der
Rueckfall nahm PokéAPI, schrieb zwei geprueft-richtige Namen um und liess
das Tor den ganzen Lauf sperren.

Hier wird `waehle_de_name` AUSGEFUEHRT (keine Textsuche im Skript).
"""
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _bauer():
    pfad = os.path.join(ROOT, "scripts", "build_champions_resources.py")
    spec = importlib.util.spec_from_file_location("bauer_namen_mehrheit", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _wahl(**kw):
    b = _bauer()
    konflikte = []
    args = dict(key="dragonscale", cat="item", en="Dragon Scale", ov=None, vf=None,
                pa=None, korrektur={}, ergaenzung={}, bisher={}, konflikte=konflikte)
    args.update(kw)
    return b.waehle_de_name(**args), konflikte


def test_ohne_mehrheit_bleibt_der_bisherige_name():
    name, konflikte = _wahl(ov="Drachenhaut", pa="Drachenschuppe",
                            bisher={("item", "Dragon Scale"): "Drachenhaut"})
    assert name == "Drachenhaut"
    # der Widerspruch bleibt sichtbar, er wird nur nicht ueberschrieben
    assert [k[1] for k in konflikte] == ["Dragon Scale"]


def test_der_bisherige_name_gilt_auch_wenn_er_der_pokeapi_name_ist():
    """Die Regel nimmt keine Seite: was in der Datei steht, bleibt."""
    name, _ = _wahl(ov="Drachenhaut", pa="Drachenschuppe",
                    bisher={("item", "Dragon Scale"): "Drachenschuppe"})
    assert name == "Drachenschuppe"


def test_neuer_eintrag_ohne_vorgaenger_nimmt_den_markierten_rueckfall():
    name, konflikte = _wahl(ov="Drachenhaut", pa="Drachenschuppe", bisher={})
    assert name == "Drachenschuppe"      # PokéAPI zuerst, wie bisher
    assert len(konflikte) == 1


def test_eine_mehrheit_schlaegt_den_bisherigen_namen():
    """Zwei Quellen, die sich einig sind, duerfen einen alten Namen ersetzen
    (so kommen echte Umbenennungen an)."""
    name, konflikte = _wahl(ov="Drachenhaut", vf="Drachenhaut", pa="Drachenschuppe",
                            bisher={("item", "Dragon Scale"): "Drachenschuppe"})
    assert name == "Drachenhaut"
    assert konflikte == []


def test_eine_manuelle_korrektur_schlaegt_alles():
    name, _ = _wahl(ov="Drachenhaut", pa="Drachenschuppe",
                    korrektur={"dragonscale": "Drachenhaut"},
                    bisher={("item", "Dragon Scale"): "Drachenschuppe"})
    assert name == "Drachenhaut"
