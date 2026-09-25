"""Ein gestempeltes Prize-Pack-Bild gilt erst, wenn es NACHGEMESSEN ist.

BEFUND (Betreiber, 25.09.2026, Bildschirmfoto)
----------------------------------------------
Im Rarity Switcher von Metang stand unter

    „Prize-Pack-Print (gestempelt) · Prize-Pack-Serie 7 · TEF 114“

das Artwork von Benesaru (Munkidori).

URSACHE: die Galerienummer, aus der die Bildadresse gebaut wird, stammt
aus der ZEILENNUMMER der offiziellen PDF-Kartenliste. Geprueft war das an
einer einzigen Karte (SE9 #19). Eine um eins verschobene Liste hat keine
Luecke und sieht bis zum Schluss richtig aus — der Fehler wird erst am
Bild sichtbar, und zwar dem Nutzer.

Gepruft wird hier deshalb die MESSUNG, nicht die Absicht:

  1. der PNG-Leser (ohne Pillow — der Ablauf installiert es nicht),
     gegen ein unabhaengig gerechnetes Raster, fuer alle fuenf
     PNG-Filter;
  2. das Urteil: richtig zugeordnet -> OK, verschoben -> FALSCH mit dem
     Versatz, uneindeutig -> NICHT GEPRUEFT (nie OK);
  3. dass ein Urteil den taeglichen Preislauf ueberlebt — und bei
     geaenderter Bildadresse NICHT.
"""
import importlib.util
import json
import os
import struct
import sys
import zlib

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPTE = os.path.join(ROOT, "scripts")


def _lade(name):
    pfad = os.path.join(SKRIPTE, name + ".py")
    if not os.path.exists(pfad):
        pytest.skip("%s nicht im Baum" % name)
    if SKRIPTE not in sys.path:
        sys.path.insert(0, SKRIPTE)
    spec = importlib.util.spec_from_file_location(name, pfad)
    modul = importlib.util.module_from_spec(spec)
    sys.modules[name] = modul
    spec.loader.exec_module(modul)
    return modul


PP = _lade("pruefe_prizepack_galerie")


# ── PNG bauen, mit jedem Filter ──────────────────────────────────────

def _stueck(typ, koerper):
    return (struct.pack(">I", len(koerper)) + typ + koerper
            + struct.pack(">I", zlib.crc32(typ + koerper) & 0xFFFFFFFF))


def png(breit, hoch, farbe, filter_typ=0, kanaele=3):
    """Ein PNG mit genau dem gewuenschten Zeilenfilter — das ist der Teil
    des Lesers, der schweigend falsch sein kann."""
    art = {1: 0, 3: 2, 4: 6}[kanaele]
    roh = []
    for y in range(hoch):
        roh.append(bytes(bytearray(
            [farbe(x, y, k) for x in range(breit) for k in range(kanaele)])))
    aus = bytearray()
    vorher = bytes(breit * kanaele)
    for zeile in roh:
        aus.append(filter_typ)
        gefiltert = bytearray(len(zeile))
        for i, wert in enumerate(zeile):
            links = zeile[i - kanaele] if i >= kanaele else 0
            oben = vorher[i]
            oben_links = vorher[i - kanaele] if i >= kanaele else 0
            if filter_typ == 0:
                vor = 0
            elif filter_typ == 1:
                vor = links
            elif filter_typ == 2:
                vor = oben
            elif filter_typ == 3:
                vor = (links + oben) >> 1
            else:
                p = links + oben - oben_links
                pa, pb, pc = abs(p - links), abs(p - oben), abs(p - oben_links)
                vor = links if (pa <= pb and pa <= pc) else (oben if pb <= pc else oben_links)
            gefiltert[i] = (wert - vor) & 0xFF
        aus += gefiltert
        vorher = zeile
    kopf = struct.pack(">IIBBBBB", breit, hoch, 8, art, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + _stueck(b"IHDR", kopf)
            + _stueck(b"IDAT", zlib.compress(bytes(aus))) + _stueck(b"IEND", b""))


def raster_von_hand(breit, hoch, farbe, kanaele=3, r=None):
    """Dasselbe Raster, unabhaengig gerechnet — ohne den Leser."""
    r = r or PP.RASTER
    summe = [0.0] * (r * r)
    zahl = [0] * (r * r)
    for y in range(hoch):
        for x in range(breit):
            werte = [farbe(x, y, k) for k in range(kanaele)]
            if kanaele >= 3:
                w = (werte[0] * 299 + werte[1] * 587 + werte[2] * 114) // 1000
            else:
                w = werte[0]
            k = ((y * r) // hoch) * r + ((x * r) // breit)
            summe[k] += w
            zahl[k] += 1
    werte = [summe[i] / zahl[i] for i in range(len(summe))]
    m = sum(werte) / len(werte) or 1.0
    return [v / m for v in werte]


MUSTER = {
    "streifen": lambda x, y, k: (x * 3 + y * 5 + k * 17) % 256,
    "flecken": lambda x, y, k: ((x // 7) * 31 + (y // 5) * 13 + k * 3) % 256,
    "rand": lambda x, y, k: 250 if (x < 4 or y < 4) else (x * y + k) % 200,
}


@pytest.mark.parametrize("filter_typ", [0, 1, 2, 3, 4])
def test_der_png_leser_stimmt_bei_jedem_filter(filter_typ):
    breit, hoch, farbe = 73, 101, MUSTER["streifen"]
    gelesen = PP.png_grau_raster(png(breit, hoch, farbe, filter_typ))
    assert gelesen is not None, "PNG mit Filter %d nicht gelesen" % filter_typ
    soll = raster_von_hand(breit, hoch, farbe)
    weit = max(abs(a - b) for a, b in zip(gelesen, soll))
    assert weit < 1e-9, ("Filter %d falsch entfiltert (max. Abweichung %.6f) — "
                         "ein falsch gelesenes Bild urteilt ueber die falsche Karte"
                         % (filter_typ, weit))


@pytest.mark.parametrize("kanaele", [1, 3, 4])
def test_grau_rgb_und_rgba_ergeben_dasselbe_raster(kanaele):
    breit, hoch, farbe = 64, 64, MUSTER["flecken"]
    gelesen = PP.png_grau_raster(png(breit, hoch, farbe, 1, kanaele))
    assert gelesen is not None
    soll = raster_von_hand(breit, hoch, farbe, kanaele)
    assert max(abs(a - b) for a, b in zip(gelesen, soll)) < 1e-9


def test_was_kein_lesbares_png_ist_gibt_keine_aussage():
    """Ein nicht lesbares Bild ist eine Luecke, kein Urteil."""
    assert PP.png_grau_raster(b"") is None
    assert PP.png_grau_raster(b"\x89PNG\r\n\x1a\nkaputt") is None
    assert PP.png_grau_raster(b"\xff\xd8\xff\xe0JPEG") is None
    voll = png(32, 32, MUSTER["streifen"], 0)
    assert PP.png_grau_raster(voll[:len(voll) // 2]) is None, "halbes PNG gilt als gelesen"


# ── Das Urteil ───────────────────────────────────────────────────────

def _welt(paare):
    """paare: {adresse: (breit, hoch, muster)} -> Abrufer wie http_get."""
    bilder = {a: png(b, h, MUSTER[m], 1) for a, (b, h, m) in paare.items()}
    return lambda url, **kw: bilder.get(url)


def _index(drei):
    """drei: [(schluessel, nummer, galerieadresse)] in Serie 7."""
    return {k: {"series": "7", "num": n, "en": a, "de": a,
                "name_en": k, "name_de": k} for k, n, a in drei}


KARTEN = {
    "TEF-114": ("streifen", 733, 1024),
    "TWM-95": ("flecken", 733, 1024),
    "SCR-107": ("rand", 733, 1024),
}


def _basis(monkeypatch):
    monkeypatch.setattr(PP, "basisbilder", lambda: {
        ("TEF", "114"): "basis/tef114", ("TWM", "95"): "basis/twm95",
        ("SCR", "107"): "basis/scr107"})


def _welt_der_drei(zuordnung):
    """zuordnung: Galerienummer -> Kartenschluessel (WELCHES Bild dort
    wirklich liegt). Die Basisbilder tragen immer ihr eigenes Muster."""
    paare = {}
    for nummer, karte in zuordnung.items():
        m, b, h = KARTEN[karte]
        paare["galerie/%s" % nummer] = (b, h, m)
    for karte, (m, b, h) in KARTEN.items():
        paare["basis/%s" % karte.replace("-", "").lower()] = (b, h, m)
    return _welt(paare)


def test_richtig_zugeordnet_heisst_ok(monkeypatch):
    _basis(monkeypatch)
    monkeypatch.setattr(PP, "http_get", _welt_der_drei(
        {"41": "TEF-114", "42": "TWM-95", "1": "SCR-107"}))
    monkeypatch.setattr(PP.time, "sleep", lambda *_: None)
    index = _index([("TEF-114", "41", "galerie/41"), ("TWM-95", "42", "galerie/42"),
                    ("SCR-107", "1", "galerie/1")])
    urteile = PP.pruefe(index, ausgabe=lambda m: None)
    assert {k: u["urteil"] for k, u in urteile.items()} == {
        "TEF-114": PP.OK, "TWM-95": PP.OK, "SCR-107": PP.OK}


def test_ein_verschobenes_bild_wird_benannt_und_nicht_berichtigt(monkeypatch):
    """Genau der Befund: unter Nummer 41 liegt Munkidori, unter 42 Metang."""
    _basis(monkeypatch)
    monkeypatch.setattr(PP, "http_get", _welt_der_drei(
        {"41": "TWM-95", "42": "TEF-114", "1": "SCR-107"}))
    monkeypatch.setattr(PP.time, "sleep", lambda *_: None)
    index = _index([("TEF-114", "41", "galerie/41"), ("TWM-95", "42", "galerie/42"),
                    ("SCR-107", "1", "galerie/1")])
    urteile = PP.pruefe(index, ausgabe=lambda m: None)
    assert urteile["TEF-114"]["urteil"] == PP.FALSCH
    assert "42" in urteile["TEF-114"]["grund"] and "+1" in urteile["TEF-114"]["grund"]
    assert urteile["TWM-95"]["urteil"] == PP.FALSCH
    assert "-1" in urteile["TWM-95"]["grund"]
    PP.eintragen(index, urteile)
    assert index["TEF-114"]["geprueft"] is False
    # Die Nummer selbst bleibt unangetastet — geraten wird nicht.
    assert index["TEF-114"]["num"] == "41"
    assert index["TEF-114"]["en"] == "galerie/41"


def test_ein_nicht_lesbares_bild_ist_nicht_geprueft_nicht_ok(monkeypatch):
    _basis(monkeypatch)
    welt = _welt_der_drei({"41": "TEF-114", "42": "TWM-95", "1": "SCR-107"})
    monkeypatch.setattr(PP, "http_get", lambda url, **kw: (
        None if url == "basis/tef114" else welt(url)))
    monkeypatch.setattr(PP.time, "sleep", lambda *_: None)
    index = _index([("TEF-114", "41", "galerie/41"), ("TWM-95", "42", "galerie/42"),
                    ("SCR-107", "1", "galerie/1")])
    urteile = PP.pruefe(index, ausgabe=lambda m: None)
    assert urteile["TEF-114"]["urteil"] == PP.OFFEN
    PP.eintragen(index, urteile)
    assert index["TEF-114"]["geprueft"] is False


def test_zwei_gleiche_bilder_ergeben_kein_urteil(monkeypatch):
    """Ohne Vorsprung gibt es keine Aussage — auch nicht die richtige."""
    _basis(monkeypatch)
    monkeypatch.setattr(PP, "http_get", _welt_der_drei(
        {"41": "TEF-114", "42": "TEF-114", "1": "SCR-107"}))
    monkeypatch.setattr(PP.time, "sleep", lambda *_: None)
    index = _index([("TEF-114", "41", "galerie/41"), ("TWM-95", "42", "galerie/42"),
                    ("SCR-107", "1", "galerie/1")])
    urteile = PP.pruefe(index, ausgabe=lambda m: None)
    assert urteile["TEF-114"]["urteil"] == PP.OFFEN
    assert urteile["TEF-114"]["grund"] == "kein klarer Treffer"


def test_ein_urteil_wird_nicht_jede_woche_neu_bezahlt(monkeypatch):
    """Zwei Bilder je Eintrag — ein bestehendes Urteil an derselben
    Adresse wird nicht erneut geladen."""
    _basis(monkeypatch)
    gerufen = []
    welt = _welt_der_drei({"41": "TEF-114", "42": "TWM-95", "1": "SCR-107"})
    monkeypatch.setattr(PP, "http_get", lambda url, **kw: (gerufen.append(url), welt(url))[1])
    monkeypatch.setattr(PP.time, "sleep", lambda *_: None)
    index = _index([("TEF-114", "41", "galerie/41"), ("TWM-95", "42", "galerie/42"),
                    ("SCR-107", "1", "galerie/1")])
    PP.eintragen(index, PP.pruefe(index, ausgabe=lambda m: None))
    gerufen.clear()
    zweite = PP.pruefe(index, ausgabe=lambda m: None)
    assert zweite == {}, "der zweite Lauf urteilt erneut"
    assert gerufen == [], "der zweite Lauf hat wieder Bilder geladen"

    # Eine NEUE Bildadresse macht das Urteil hinfaellig.
    index["TEF-114"]["en"] = "galerie/42"
    index["TEF-114"]["de"] = "galerie/42"
    dritte = PP.pruefe(index, ausgabe=lambda m: None)
    assert "TEF-114" in dritte, "die geaenderte Bildadresse wurde nicht neu geprueft"


def test_die_bilanz_zaehlt_die_drei_zustaende():
    index = {
        "A-1": {"geprueft": True, "pruefung": "OK"},
        "B-2": {"geprueft": False, "pruefung": "FALSCH: Bild 3 passt besser (Versatz +1)"},
        "C-3": {"geprueft": False, "pruefung": "NICHT GEPRUEFT: kein klarer Treffer"},
        "D-4": {},
    }
    assert PP.bilanz(index) == {"geprueft": 1, "falsch": 1, "offen": 2}


# ── Das Urteil ueberlebt den taeglichen Preislauf ─────────────────────

def test_der_preislauf_wirft_die_bildurteile_nicht_weg(tmp_path, monkeypatch):
    bau = _lade("build_prizepack_official_images")
    ziel = tmp_path / "prizepack.json"
    ziel.write_text(json.dumps({
        "TEF-114": {"series": "7", "num": "41", "en": "bild/41", "de": "bild/41",
                    "name_en": "Metang", "name_de": "Metang",
                    "geprueft": True, "pruefung": "OK", "pruefadresse": "bild/41",
                    "pruefstand": "2026-09-25"},
        "TWM-95": {"series": "7", "num": "42", "en": "bild/42", "de": "bild/42",
                   "name_en": "Munkidori", "name_de": "Benesaru",
                   "geprueft": False, "pruefung": "FALSCH: Bild 41 passt besser",
                   "pruefadresse": "bild/42", "pruefstand": "2026-09-25"},
    }), encoding="utf-8")
    monkeypatch.setattr(bau, "load_pps_cardmarket_products", lambda: {})
    monkeypatch.setattr(bau, "load_price_guide", lambda: {})
    zeilen = [
        {"series": "7", "gallery_number": "41", "set_code": "TEF", "set_number": "114",
         "name_de": "Metang", "name_en": "Metang",
         "image_url_de": "bild/41", "image_url_en": "bild/41"},
        {"series": "7", "gallery_number": "42", "set_code": "TWM", "set_number": "95",
         "name_de": "Benesaru", "name_en": "Munkidori",
         "image_url_de": "bild/42", "image_url_en": "bild/42"},
    ]
    neu = bau.write_json_index(zeilen, str(ziel))
    assert neu["TEF-114"]["geprueft"] is True, (
        "das Urteil ist weg — die Oberflaeche wuerde das Bild verbergen, "
        "obwohl es nachgemessen ist")
    assert neu["TWM-95"]["pruefung"].startswith("FALSCH")

    # Und bei einer NEUEN Bildadresse gilt es nicht mehr.
    zeilen[0]["image_url_en"] = "bild/99"
    neu2 = bau.write_json_index(zeilen, str(ziel))
    assert "geprueft" not in neu2["TEF-114"], (
        "ein Urteil wurde auf eine andere Bildadresse uebertragen")


# ── Die beiden Leser muessen dasselbe sagen ──────────────────────────

def _weich(versatz):
    """Ein weiches Motiv ohne harte Kanten — einem Kartenbild naeher als
    ein Streifenmuster, und im Gegensatz zu ihm ohne Sprungstellen, an
    denen sich zwei Skalierungen streiten koennen."""
    return lambda x, y, k: min(255, max(0,
        (x * 140) // 240 + (y * 90) // 330 + versatz + k * 4))


def test_beide_leser_faellen_dasselbe_urteil():
    """BEFUND (25.09.2026, erster Lauf im Ablauf): der Lauf war nach 7
    Minuten gruen und hatte KEIN einziges Urteil geschrieben. Das
    Entfiltern eines PNG kostet in reinem Python Millionen von
    Schleifendurchlaeufen; 266 Bilder passen in keine Frist.

    Seitdem holt sich das Skript Pillow, wenn es kann, und behaelt den
    eigenen Leser als Rueckfall. Zwei Leser sind nur dann unbedenklich,
    wenn sie dasselbe URTEIL faellen. Geprueft wird deshalb die
    Entscheidung, die das Skript wirklich trifft: welches der drei
    Galeriebilder gehoert zu diesem Basisdruck?

    Der „Basisdruck" ist hier dasselbe Motiv, nur heller und leicht
    verschoben — so wie sich ein gestempelter Druck vom Basisdruck
    unterscheidet."""
    pytest.importorskip("PIL", reason="ohne Pillow gibt es nur einen Leser")
    breit, hoch = 240, 330
    vorlagen = {'a': _weich(0), 'b': _weich(70), 'c': _weich(150)}
    for leser in (PP.png_grau_raster, PP.bild_raster):
        galerie = {n: leser(png(breit, hoch, f, 4)) for n, f in vorlagen.items()}
        assert all(galerie.values()), "ein Bild wurde nicht gelesen"
        for name, f in vorlagen.items():
            gestoert = leser(png(breit, hoch,
                                 lambda x, y, k: min(255, f(x, y, k) + 12), 1))
            naechster = min(galerie, key=lambda n: PP.abstand(galerie[n], gestoert))
            assert naechster == name, (
                "%s haelt %s fuer %s" % (leser.__name__, name, naechster))


def test_auf_einem_weichen_motiv_sind_sich_die_leser_auch_im_wert_einig():
    """Auf die Zahl genau muessen sie sich nicht ueberall einigen: ein
    hartkantiges Streifenmuster trennt die Kastenraender anders und
    weicht dann um bis zu 0,5 ab. Auf einem weichen Motiv — und auf
    echten Kartenbildern, dort gemessen 0,011 — stimmen sie ueberein."""
    pytest.importorskip("PIL", reason="ohne Pillow gibt es nur einen Leser")
    roh = png(240, 330, _weich(0), 1)
    a = PP.png_grau_raster(roh)
    b = PP.bild_raster(roh)
    weit = max(abs(x - y) for x, y in zip(a, b))
    assert weit < 0.05, "die beiden Leser sind sich um %.3f uneinig" % weit


def test_mit_pillow_wird_der_langsame_leser_nicht_mehr_angefasst(monkeypatch):
    """Der Rueckfall darf ein Rueckfall bleiben. Laeuft er trotz Pillow
    mit, ist die Frist wieder das Problem, das den ersten Lauf leer
    zurueckgab — und nichts davon waere zu sehen: das Ergebnis stimmt ja,
    es dauert nur zwanzigmal so lange (gemessen an einem echten
    Kartenbild: 1,47 s gegen 0,05 s)."""
    pytest.importorskip("PIL", reason="ohne Pillow gibt es nur einen Leser")
    def nicht_anfassen(*a, **k):
        raise AssertionError("der eigene PNG-Leser lief, obwohl Pillow da ist")
    monkeypatch.setattr(PP, "png_grau_raster", nicht_anfassen)
    PP._PIL = None                      # die Erkennung frisch laufen lassen
    raster = PP.bild_raster(png(64, 64, MUSTER["flecken"], 1))
    assert raster and len(raster) == PP.RASTER * PP.RASTER


def test_der_schnelle_weg_wird_auch_genommen():
    """Ohne diese Zeile waere die Bibliothek installiert und ungenutzt —
    und der Lauf liefe wieder in seine Frist."""
    with open(os.path.join(SKRIPTE, "pruefe_prizepack_galerie.py"), encoding="utf-8") as f:
        text = f.read()
    assert "bild_raster(http_get(url))" in text, "die Galeriebilder gehen nicht ueber bild_raster"
    assert "bild_raster(http_get(basisurl))" in text, "die Basisbilder gehen nicht ueber bild_raster"
    assert "getattr(Image, \"BOX\"" in text, (
        "Pillow skaliert nicht mit derselben Kastenmittelung wie der eigene Leser")


# ── Zeigt der Eintrag auf die Karte, die er behauptet? ───────────────

def test_die_schluesselpruefung_benennt_den_falschen_druck():
    """BEFUND (25.09.2026): neun von 225 Eintraegen zeigen auf einen
    anderen Druck, als ihr Name sagt (SHF statt SFA, dazu zwei PLF).
    „Night Stretcher" haengt damit an „Rusted Shield" — Bild, Preis und
    Kaufadresse auf der falschen Karte.

    Das laesst sich OHNE NETZ messen: die Kartendatenbank liegt im Baum.
    Berichtigt wird nichts — welcher Druck gemeint war, sagt nur die
    Quelle."""
    bau = _lade("build_prizepack_official_images")
    index = {
        "SFA-61": {"name_en": "Night Stretcher"},
        "SHF-61": {"name_en": "Night Stretcher"},
        "SVE-16": {"name_en": "Basic Metal Energy"},
        "XYZ-1": {"name_en": "Gibt Es Nicht"},
    }
    db = {("SFA", "61"): "Night Stretcher", ("SHF", "61"): "Rusted Shield",
          ("SVE", "16"): "Metal Energy"}
    import unittest.mock as mock
    with mock.patch.object(bau, "_kartendatenbank", lambda: db):
        zahl = bau.schluesselpruefung(index)
    assert index["SFA-61"]["schluessel"] == "OK"
    assert index["SHF-61"]["schluessel"].startswith("FALSCH")
    assert "Rusted Shield" in index["SHF-61"]["schluessel"]
    # „Basic Metal Energy" und „Metal Energy" sind dieselbe Karte.
    assert index["SVE-16"]["schluessel"] == "OK", "die Energie gilt als falscher Druck"
    assert index["XYZ-1"]["schluessel"].startswith("UNBEKANNT"), (
        "ein Druck, den die Datenbank nicht kennt, ist kein FALSCH — "
        "sonst verschwaende er aus der Oberflaeche, obwohl nichts gegen ihn spricht")
    assert zahl == {"ok": 2, "falsch": 1, "unbekannt": 1}


def test_ohne_kartendatenbank_wird_nicht_geurteilt():
    """Eine leere Datenbank wuerde JEDEN Eintrag zum Unbekannten machen.
    Dann lieber gar kein Urteil als 225 falsche."""
    bau = _lade("build_prizepack_official_images")
    index = {"SFA-61": {"name_en": "Night Stretcher"}}
    import unittest.mock as mock
    with mock.patch.object(bau, "_kartendatenbank", dict):
        zahl = bau.schluesselpruefung(index)
    assert "schluessel" not in index["SFA-61"]
    assert zahl == {"ohne_datenbank": 1}


def test_an_den_echten_daten_sind_es_genau_diese_neun():
    """Der Anlass selbst, an der echten Datei — und zwar als OBERGRENZE:
    werden es mehr, ist etwas Neues kaputt; werden es weniger, hat jemand
    die Quelle berichtigt und diese Zeile gehoert nachgezogen."""
    pfad = os.path.join(ROOT, "data", "prizepack_official_images.json")
    if not os.path.exists(pfad):
        pytest.skip("keine Prize-Pack-Daten im Baum")
    bau = _lade("build_prizepack_official_images")
    with open(pfad, encoding="utf-8") as f:
        index = json.load(f)
    if not bau._kartendatenbank():
        pytest.skip("keine Karten-Chunks im Baum")
    zahl = bau.schluesselpruefung(index)
    assert zahl["falsch"] <= 9, (
        "mehr Eintraege als bisher zeigen auf eine fremde Karte: %s" % zahl)
    assert zahl["ok"] >= 200, (
        "kaum noch Eintraege gelten als richtig — dann prueft die Regel "
        "nicht mehr das, was sie soll: %s" % zahl)
