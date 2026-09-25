"""Die gespiegelten Champions-Icons: Zuordnung, Adressen, Eindeutigkeit.

WORUM ES GEHT

Bis zum 31.08.2026 kamen die Sprites von r2.limitlesstcg.net. Fuer neun
Champions-eigene Mega-Formen liefert Limitless nichts, und der Rest kam
in 35-41 px, obwohl es sich um Icons aus der HAUPTREIHE handelt — die
Side Quest bildet aber Pokémon Champions nach. PokeWiki fuehrt dafuer
eigene 128-px-Icons ("CMP") fuer alle 292.

DIE GEFAEHRLICHE STELLE

Der MediaWiki-Pfad wird aus dem Dateinamen gerechnet, der Dateiname aus
Pokédex-Nummer und Formkuerzel. Ein falsches Formkuerzel liefert ein
Bild, das LAEDT und trotzdem das falsche Pokémon zeigt — kein Fehler,
kein leeres Feld, nur eine stille Luege in der Tabelle. Genau davor
schuetzen die Zusicherungen hier: sie halten die Rechnung fest, die
Eindeutigkeit, und die zwei Adressen, an denen der Betreiber das
Verfahren ueberhaupt erst gezeigt hat.
"""
import importlib.util
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


@pytest.fixture(scope="module")
def mod():
    pfad = os.path.join(ROOT, "scripts", "build_champions_sprites.py")
    spec = importlib.util.spec_from_file_location("sprites_unter_test", pfad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope="module")
def dex():
    with open(os.path.join(DATA, "champions_pokedex.json"), encoding="utf-8") as f:
        return json.load(f)["entries"]


# ── Die Adressrechnung ─────────────────────────────────────────────

def test_die_zwei_belegten_adressen_kommen_exakt_heraus(mod):
    """Der Betreiber hat am 31.08.2026 zwei fertige Adressen geschickt.

    An ihnen ist das ganze Verfahren aufgehaengt: MediaWiki legt die
    Datei unter /images/<h[0]>/<h[0:2]>/ ab, wobei h der MD5 des
    Dateinamens ist. Stimmt diese Rechnung nicht mehr, sind alle 292
    Adressen falsch — und zwar auf einen Schlag.
    """
    assert mod.quelle("026m1") == (
        "https://www.pokewiki.de/images/f/f9/Pok%C3%A9mon-Icon_026m1_CMP.png")
    assert mod.quelle("026m2") == (
        "https://www.pokewiki.de/images/7/72/Pok%C3%A9mon-Icon_026m2_CMP.png")


def test_die_adresse_haengt_am_dateinamen(mod):
    """Gegenprobe: ein anderer Name muss in einem anderen Verzeichnis
    landen. Ein fest verdrahteter Pfad wuerde oben mit durchrutschen."""
    a, b = mod.quelle("026m1"), mod.quelle("026m2")
    assert a.rsplit("/", 1)[0] != b.rsplit("/", 1)[0]
    assert mod.quelle("887").endswith("/Pok%C3%A9mon-Icon_887_CMP.png")


def test_der_umlaut_wird_kodiert(mod):
    """'é' roh in der URL ergibt bei manchen Zwischenschichten 404."""
    for key in ("026m1", "887", "128a"):
        u = mod.quelle(key)
        assert "Pok%C3%A9mon" in u, u
        assert "é" not in u


# ── Die Formzuordnung ──────────────────────────────────────────────

def test_jeder_eintrag_bekommt_einen_schluessel(mod, dex):
    ohne = [e["en"] for e in dex if mod.schluessel(e) is None]
    assert ohne == [], (
        "ohne belegte Zuordnung darf nichts gespiegelt werden: " + str(ohne))


def test_keine_zwei_eintraege_teilen_sich_ein_bild(mod, dex):
    """Der teuerste denkbare Fehler: zwei Formen, ein Icon — die Tabelle
    zeigt dann zweimal dasselbe Pokémon und sieht dabei richtig aus."""
    belegt = {}
    doppelt = []
    for e in dex:
        k = mod.schluessel(e)
        if k in belegt:
            doppelt.append(f"{e['en']} und {belegt[k]} -> {k}")
        belegt[k] = e["en"]
    assert doppelt == [], doppelt


def test_lokale_dateinamen_sind_eindeutig(mod, dex):
    namen = [mod.lokal_name(e["en"]) for e in dex]
    assert len(set(namen)) == len(namen), "zwei Eintraege wuerden dieselbe Datei schreiben"
    assert all(n and n == n.strip("-") for n in namen)


@pytest.mark.parametrize("en,erwartet", [
    ("Dragapult", "887"),
    ("Mega Metagross", "376m1"),
    ("Mega Raichu X", "026m1"),
    ("Mega Raichu Y", "026m2"),
    ("Alolan Ninetales", "038a"),
    ("Galarian Slowbro", "080a"),
    ("Hisuian Zoroark", "571a"),
])
def test_die_regel_je_formart(mod, dex, en, erwartet):
    e = next(x for x in dex if x["en"] == en)
    assert mod.schluessel(e) == erwartet


@pytest.mark.parametrize("en,erwartet", [
    # pokewiki.de/Liste_der_Pokémon_in_Pokémon_Champions nennt die drei
    # Varianten namentlich.
    ("Paldean Tauros (Combat Breed)", "128a"),
    ("Paldean Tauros (Blaze Breed)", "128b"),
    ("Paldean Tauros (Aqua Breed)", "128c"),
    # pokewiki.de/Rotom/Sprites_und_3D-Modelle
    # (Rotom (Heat) stand hier bis zum 13.09.2026 — die Quelle fuehrt die
    #  Form nicht mehr; der Schluessel liegt in mod.AUSGESCHIEDEN und wird
    #  von test_ausgeschiedene_formen_bleiben_ausgeschieden geprueft.)
    ("Rotom (Wash)", "479b"),
    # pokewiki.de/Wolwerock/Sprites_und_3D-Modelle
    ("Lycanroc (Dusk)", "745b"),
    # pokewiki.de/Floette — fuer Champions gibt es dort nur 670e und 670m1
    ("Floette", "670e"),
])
def test_die_belegten_sonderformen(mod, dex, en, erwartet):
    """Diese sieben sind NICHT aus der Regel ableitbar.

    PokeWiki nummeriert Formen durch und kodiert keine Region, also
    entscheidet bei mehreren Alternativformen die Reihenfolge. Jede
    Zeile hier ist einzeln nachgeschlagen; der Kommentar nennt die
    Seite. Wer sie aendert, muss eine Quelle mitliefern.
    """
    e = next(x for x in dex if x["en"] == en)
    assert mod.schluessel(e) == erwartet


def test_eine_unbelegte_klammerform_bricht_ab(mod):
    """Lieber lauter Abbruch als ein plausibles falsches Bild."""
    assert mod.schluessel({"en": "Ledian (Erfunden)", "dex": 166}) is None
    # Und die Gegenprobe: ohne Klammer greift die Regel.
    assert mod.schluessel({"en": "Ledian", "dex": 166}) == "166"


def test_eine_ungenutzte_uebersteuerung_haelt_keinen_lauf_an(mod, dex, capsys):
    """DIESE ZUSICHERUNG HAT ZWEIMAL AN EINEM TAG DIE KETTE ANGEHALTEN.

    Sie verlangte frueher, dass JEDE Zeile in FORM_UEBERSTEUERUNG gerade
    einen Eintrag im Pokedex hat. Gemessen am 25.09.2026:

        04:11 UTC  champions_pokedex.json  319 Eintraege
        05:14 UTC  champions_pokedex.json  343 Eintraege

    Dieselben acht Alternativformen (Gourgeist Large/Small/Super,
    Lycanroc Midnight, Rotom Fan/Frost, Squawkabilly Yellow, Toxtricity
    Low-Key) waren erst weg und Stunden spaeter wieder da. Die Datei
    wird aus Nutzungsdaten neu gebaut — sie atmet.

    Folge: Deploy 3048 rot, weil acht Schluessel ins Leere zeigten. Dann
    die Reparatur (Schluessel nach AUSGESCHIEDEN). Dann der PR rot, weil
    dieselben acht wieder im Pokedex standen. Zweimal Stillstand, ohne
    dass irgendjemand etwas kaputtgemacht hat.

    Die Tabelle IST ein Nachschlagewerk. Ein Eintrag, auf den der Kader
    gerade nicht zeigt, richtet keinen Schaden an — er wartet. Gefaehrlich
    sind die drei anderen Richtungen, und die bleiben hart:

        test_jeder_eintrag_bekommt_einen_schluessel   (kein Eintrag ohne Bild)
        test_keine_zwei_eintraege_teilen_sich_ein_bild
        test_keine_form_verschwindet_aus_BEIDEN_listen (kein Verlust)

    Hier wird der ungenutzte Rest nur noch BENANNT.
    """
    da = {e["en"] for e in dex}
    ungenutzt = sorted(set(mod.FORM_UEBERSTEUERUNG) - da)
    if ungenutzt:
        print("HINWEIS: %d nachgeschlagene Formen fuehrt der Kader gerade "
              "nicht: %s. Das ist kein Fehler — die Schluessel warten."
              % (len(ungenutzt), ungenutzt))
    # Was hart bleibt: die Tabelle darf nicht zur Haelfte ins Leere
    # zeigen. Dann stimmt nicht der Kader nicht mehr, sondern die Datei.
    assert len(ungenutzt) <= len(mod.FORM_UEBERSTEUERUNG) // 2, (
        "%d von %d Uebersteuerungen zeigen ins Leere — das ist kein "
        "Kaderatmen mehr, da stimmt die Pokedex-Datei nicht."
        % (len(ungenutzt), len(mod.FORM_UEBERSTEUERUNG)))


def test_keine_form_verschwindet_aus_BEIDEN_listen(mod):
    """Der Papierkorb-Schutz hatte selbst ein Loch (gemessen 25.09.2026).

    Die Zusicherung darunter faengt: Schluessel aus FORM_UEBERSTEUERUNG
    geloescht statt nach AUSGESCHIEDEN verschoben. Sie faengt NICHT:
    Schluessel aus AUSGESCHIEDEN geloescht. In der Verfaelschungsprobe
    liess sich "Rotom (Fan)" spurlos entfernen — die Suite blieb gruen,
    und die nachgeschlagene Quelle waere weg gewesen. Genau das, was der
    Kommentar an AUSGESCHIEDEN ausschliessen will: "Ein Verlust ist ein
    Befund, kein Aufraeumen."

    Deshalb eine UNTERGRENZE ueber beide Listen zusammen. Sie ist `>=`:
    neue Formen und neue Ausscheider sind kein Fehler, nur das
    Verschwinden ist einer. Eine Form, die aus AUSGESCHIEDEN zurueck nach
    FORM_UEBERSTEUERUNG wandert, laesst die Summe unveraendert.
    """
    MINDESTENS = 19     # Stand 25.09.2026: 19 gefuehrt + 0 ausgeschieden
    gesamt = len(mod.FORM_UEBERSTEUERUNG) + len(mod.AUSGESCHIEDEN)
    assert gesamt >= MINDESTENS, (
        "zusammen nur noch %d nachgeschlagene Formen (vorher mindestens %d) — "
        "es wurde eine geloescht statt verschoben. Der Schluessel gehoert "
        "MIT Datum und Beleg nach AUSGESCHIEDEN." % (gesamt, MINDESTENS))


def test_keine_form_steht_in_beiden_listen(mod):
    """Sonst gilt sie gleichzeitig als gefuehrt und als ausgeschieden,
    und welche der beiden Zeilen angewandt wird, entscheidet die
    Reihenfolge im Quelltext."""
    doppelt = sorted(set(mod.FORM_UEBERSTEUERUNG) & set(mod.AUSGESCHIEDEN))
    assert doppelt == [], "%s steht in beiden Listen" % doppelt


def test_ausgeschiedene_formen_bleiben_ausgeschieden(mod, dex):
    """Die Gegenrichtung: taucht eine ausgeschiedene Form wieder im
    Pokedex auf, muss ihr Schluessel zurueck in die Uebersteuerung.

    Ohne diese Zusicherung waere AUSGESCHIEDEN ein Friedhof, an dem
    niemand mehr vorbeikommt — und die zurueckgekehrte Form bekaeme
    still das nach der Regel gebaute (falsche) Bild.
    """
    da = {e["en"] for e in dex}
    zurueck = sorted(set(mod.AUSGESCHIEDEN) & da)
    # Seit dem 25.09.2026 ist die Liste leer und soll es bleiben: das
    # Kaderatmen fuehrt nicht mehr hierher (siehe
    # test_eine_ungenutzte_uebersteuerung_haelt_keinen_lauf_an). Was hier
    # einmal landet, kam aus einem ANDEREN Grund — und dann gilt die
    # Gegenrichtung unveraendert.
    assert zurueck == [], (
        f"{zurueck} steht wieder im Pokedex — Schluessel aus AUSGESCHIEDEN "
        "zurueck nach FORM_UEBERSTEUERUNG holen."
    )
    for name, wert in mod.AUSGESCHIEDEN.items():
        assert isinstance(wert, tuple), f"{name}: erwartet (Schluessel, Grund)"
        # Eine falsche Laenge faellt beim Entpacken von selbst um. Absicht:
        # ein `len(wert) == 2` waere fuer den Wachhund in
        # test_eingefrorene_datenwerte_wachhund.py ein eingefrorener
        # Datenwert — und er hat recht, Formpruefungen gehoeren nicht als
        # Zahlenvergleich geschrieben.
        schluessel, grund = wert
        assert schluessel, f"{name}: kein Schluessel aufbewahrt"
        assert len(grund) > 30, f"{name}: Begruendung zu duenn — Datum und Quelle nennen"
        assert name not in mod.FORM_UEBERSTEUERUNG, (
            f"{name} steht in BEIDEN Tabellen — das ist ein Widerspruch"
        )


# ── Die Dateipruefung ──────────────────────────────────────────────

def test_nur_echte_pngs_werden_uebernommen(mod):
    """Eine Fehlerseite ist auch eine Antwort. Ohne diese Pruefung
    landet HTML als .png im Repo und das Bild bleibt fuer immer leer."""
    assert mod.png_masse(b"<!DOCTYPE html><html>Fehler 404") is None
    assert mod.png_masse(b"") is None
    assert mod.png_masse(b"\x89PNG\r\n\x1a\n" + b"\x00" * 4) is None  # zu kurz
    echt = (b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0d" + b"IHDR"
            + (128).to_bytes(4, "big") + (128).to_bytes(4, "big") + b"\x08\x06\x00\x00\x00")
    assert mod.png_masse(echt) == (128, 128)


def test_das_skript_geht_freundlich_mit_dem_wiki_um(mod):
    """292 Abrufe bei einem ehrenamtlichen Wiki ohne Pause und ohne
    erkennbaren Absender waeren schlicht unhoeflich."""
    assert mod.PAUSE_S >= 0.25, "zu schnell hintereinander"
    assert "thedipidis.app" in mod.UA, "der Absender muss erkennbar sein"


def test_die_rechtelage_steht_im_skript():
    """Die Icons stehen NICHT unter der CC-BY-SA des Wikitexts. Wer das
    verwechselt, verbreitet eine falsche Zusicherung mit."""
    with open(os.path.join(ROOT, "scripts", "build_champions_sprites.py"),
              encoding="utf-8") as f:
        q = f.read()
    assert "§ 51 UrhG" in q
    assert "CC-BY-SA" in q
    assert "Nintendo" in q
