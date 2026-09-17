"""Die Gegenstands-Icons — und die Liste derer, die keines haben.

ANLASS (Betreiber, 16.09.2026): „koennen wir bei den items auch noch den
Champions sprite anzeigen. WEil mir sagt nicht automatisch jeder Name
was aber die Optik schon".

WAS HIER SCHIEFGEHEN KANN

1. EIN NAME IM MANIFEST OHNE DATEI. Die Oberflaeche zeichnet dann ein
   kaputtes Bild — und zwar genau dort, wo der Betreiber auf das Bild
   schaut statt auf den Namen.
2. EINE DATEI OHNE EINTRAG. Toter Ballast im Verzeichnis; beim naechsten
   Spiegellauf faellt niemandem auf, dass sie niemand mehr braucht.
3. EIN ERSATZBILD FUER EINEN GEGENSTAND, DEN ES IN DER HAUPTREIHE NICHT
   GIBT. Champions erfindet Mega-Steine (Staraptite, Glimmoranite …);
   ein fremdes Stein-Bild dafuer waere ein Bild, das etwas anderes
   behauptet, als es zeigt. Sie stehen deshalb NAMENTLICH in
   _meta.ohne_sprite — und diese Liste wird in BEIDE Richtungen
   geprueft (CLAUDE.md, „Eine Karenz gehoert an einen Beleg"):
   ein Name darin darf keine Datei haben, und keine Datei darf fehlen,
   ohne darin zu stehen.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")
BILDER = os.path.join(ROOT, "images", "champions-items")
MANIFEST = os.path.join(DATA, "champions_item_sprites.json")


def _json(pfad):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def manifest():
    return _json(MANIFEST)


@pytest.fixture(scope="module")
def benutzte():
    """Jeder Gegenstand, den die Oberflaeche zur Auswahl stellt."""
    namen = set()
    for _k, v in (_json(os.path.join(DATA, "champions_usage.json")).get("pokemon") or {}).items():
        for modus in ("doubles", "singles"):
            for it in ((v.get(modus) or {}).get("held_item") or []):
                n = str((it or {}).get("name") or "").strip()
                if n:
                    namen.add(n)
    return namen


def test_jeder_eintrag_hat_eine_datei(manifest):
    fehlend = [f"{en} -> {datei}" for en, datei in manifest["sprites"].items()
               if not os.path.isfile(os.path.join(BILDER, datei))]
    assert not fehlend, ("Das Manifest verweist auf Dateien, die es nicht gibt — "
                         "die Liste zeigt dort ein kaputtes Bild: " + ", ".join(fehlend))


def test_jede_datei_steht_im_manifest(manifest):
    gefuehrt = set(manifest["sprites"].values())
    da = {f for f in os.listdir(BILDER) if f.endswith(".png")}
    verwaist = sorted(da - gefuehrt)
    assert not verwaist, ("Dateien ohne Eintrag im Manifest: " + ", ".join(verwaist))


def test_jede_datei_ist_ein_png(manifest):
    for datei in sorted(set(manifest["sprites"].values())):
        with open(os.path.join(BILDER, datei), "rb") as f:
            kopf = f.read(4)
        assert kopf == b"\x89PNG", f"{datei} ist kein PNG"


def test_ohne_sprite_hat_wirklich_keines(manifest):
    """Richtung 1: ein Name auf der Liste darf kein Bild haben."""
    doch = [n for n in manifest["_meta"]["ohne_sprite"] if n in manifest["sprites"]]
    assert not doch, ("Diese Namen stehen als „ohne Bild“ und haben eins — die Zeile "
                      "gehoert weg: " + ", ".join(doch))


def test_wer_kein_bild_hat_steht_auf_der_liste(manifest, benutzte):
    """Richtung 2: kein stilles Loch.

    Waechst die Liste, hat niemand nachgeschlagen; schrumpft sie, gehoert
    der Name weg. Beides faellt nur auf, wenn sie in beide Richtungen
    geprueft wird.
    """
    ohne = set(manifest["_meta"]["ohne_sprite"])
    still = sorted(n for n in benutzte if n not in manifest["sprites"] and n not in ohne)
    assert not still, ("Diese benutzten Gegenstaende haben weder Bild noch einen Eintrag "
                       "in _meta.ohne_sprite: " + ", ".join(still))


def test_die_abdeckung_ist_kein_zufall(manifest, benutzte):
    """Eine Zahl, damit ein stiller Einbruch auffaellt.

    Gemessen am 16.09.2026: 126 von 166 gewuenschten Gegenstaenden haben
    ein Bild, 120 der 160 wirklich benutzten. Faellt die Abdeckung unter
    zwei Drittel, stimmt etwas mit der Quelle nicht — dann ist die Liste
    wieder eine Namensliste, und genau das war der Anlass.
    """
    mit = sum(1 for n in benutzte if n in manifest["sprites"])
    assert mit >= 0.66 * len(benutzte), (
        f"nur {mit} von {len(benutzte)} benutzten Gegenstaenden haben ein Bild")


def test_das_manifest_nennt_seine_quelle(manifest):
    meta = manifest["_meta"]
    assert "PokeAPI" in meta["quelle"] or "pokeapi" in meta["quelle"].lower()
    assert meta.get("rechte"), "keine Angabe, wem die Bilder gehoeren"
    assert meta.get("ohne_sprite_grund"), "kein Grund fuer die Luecken hinterlegt"
