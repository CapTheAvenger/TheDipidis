"""Paldea-Tauros: drei Varianten, drei Eintraege, drei Ladder-Datensaetze.

BEFUND (31.08.2026, letzter offener Punkt der Lueckeninventur):
`data/champions_usage.json` fuehrt drei Ladder-Datensaetze
(`paldean-tauros-combat-breed`, `-blaze-breed`, `-aqua-breed`), der
Roster von otterlyclueless dagegen nur einen Eintrag "Paldean Tauros" —
reiner Kampf-Typ, 75/110/105/30/70/100. Das IST die Gefechtvariante; sie
trug aber den Namen aller drei, und die beiden anderen fehlten ganz.
Ergebnis im Admin-Bereich: "Tauros (Paldea) — kein Nutzungsdatensatz",
weil kein Ladder-Slug auf den Sammelnamen passt.

Zwei unabhaengige Quellen, beide am 31.08.2026 geprueft:
  * pokebase.app Champions-Dex listet alle drei Formen mit den Typen
    Kampf / Kampf-Feuer / Kampf-Wasser und identischen Basiswerten.
  * data/pokemon_battle_data.json (Smogon) fuehrt Tauros-Paldea-Combat,
    -Blaze und -Aqua mit denselben Typen und denselben Basiswerten.
Deutsche Formnamen von pokewiki.de/Tauros: Gefechtvariante,
Flammenvariante, Flutenvariante.

Der englische Name traegt hier zugleich die Verknuepfung: normalisiert
ist "Paldean Tauros (Combat Breed)" genau "paldean-tauros-combat-breed".
Wer den Namen wieder zusammenfasst, reisst die Verknuepfung mit ab —
genau das haelt diese Datei fest.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


def _lies(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def dex():
    return _lies("champions_pokedex.json")


@pytest.fixture(scope="module")
def usage():
    return _lies("champions_usage.json")


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


VARIANTEN = {
    "Paldean Tauros (Combat Breed)": ("Tauros (Paldea, Gefechtvariante)",
                                      "Fighting", "", "paldean-tauros-combat-breed"),
    "Paldean Tauros (Blaze Breed)": ("Tauros (Paldea, Flammenvariante)",
                                     "Fighting", "Fire", "paldean-tauros-blaze-breed"),
    "Paldean Tauros (Aqua Breed)": ("Tauros (Paldea, Flutenvariante)",
                                    "Fighting", "Water", "paldean-tauros-aqua-breed"),
}


def test_alle_drei_varianten_stehen_im_pokedex(dex):
    da = {e["en"] for e in dex["entries"]}
    fehlen = sorted(set(VARIANTEN) - da)
    assert fehlen == [], f"Varianten fehlen im Pokedex: {fehlen}"


def test_der_sammelname_ist_verschwunden(dex):
    """"Paldean Tauros" ohne Variante meint drei verschiedene Pokemon."""
    da = {e["en"] for e in dex["entries"]}
    assert "Paldean Tauros" not in da, (
        "der Sammelname ist zurueck — er passt auf keinen Ladder-Slug "
        "und beschriftet drei Formen als eine")


@pytest.mark.parametrize("en", sorted(VARIANTEN))
def test_deutscher_name_und_typen(dex, en):
    de, t1, t2, _slug = VARIANTEN[en]
    e = next(x for x in dex["entries"] if x["en"] == en)
    assert e["de"] == de
    assert e["t1"] == t1
    assert e["t2"] == t2, f"{en}: Zweittyp {e['t2']!r} statt {t2!r}"
    assert e["form"] == "Regional"


@pytest.mark.parametrize("en", sorted(VARIANTEN))
def test_jede_variante_haengt_an_ihrem_eigenen_ladder_satz(dex, usage, en):
    _de, _t1, _t2, slug = VARIANTEN[en]
    assert slug in usage["pokemon"], f"Ladder-Slug {slug} fehlt in champions_usage.json"
    e = next(x for x in dex["entries"] if x["en"] == en)
    meta = e.get("meta") or {}
    assert meta, f"{en} hat keinen Nutzungsdatensatz — genau die Luecke von damals"
    assert meta.get("slug") == slug, (
        f"{en} zeigt {meta.get('slug')!r} statt {slug!r} — eine Variante "
        "traegt die Werte einer anderen")


@pytest.mark.parametrize("en", sorted(VARIANTEN))
def test_der_name_normalisiert_auf_den_slug(en):
    """Die Verknuepfung haengt am Namen. Ohne diese Gleichheit findet der
    Bauer den Datensatz nicht mehr, ohne dass irgendetwas rot wird."""
    _de, _t1, _t2, slug = VARIANTEN[en]
    assert _norm(en) == _norm(slug)


def test_basiswerte_stimmen_mit_smogon_ueberein(dex):
    """Alle drei teilen sich die Basiswerte — abweichende Werte waeren ein
    stiller Datenfehler, den im Pokedex niemand sieht."""
    smogon = _lies("pokemon_battle_data.json")
    paare = [("Paldean Tauros (Combat Breed)", "Tauros-Paldea-Combat"),
             ("Paldean Tauros (Blaze Breed)", "Tauros-Paldea-Blaze"),
             ("Paldean Tauros (Aqua Breed)", "Tauros-Paldea-Aqua")]
    for en, key in paare:
        e = next(x for x in dex["entries"] if x["en"] == en)
        st = smogon[key]["baseStats"]
        for k in ("hp", "atk", "def", "spa", "spd", "spe"):
            assert e[k]["base"] == st[k], f"{en}.{k}: {e[k]['base']} statt {st[k]}"
        assert smogon[key]["types"][0] == e["t1"]
        assert (smogon[key]["types"][1] if len(smogon[key]["types"]) > 1 else "") == e["t2"]


def test_kein_pokedex_eintrag_ohne_nutzungsdatensatz(dex):
    """Der Grund, warum es diese Datei gibt: die Inventur stand auf 1."""
    ohne = [e["en"] for e in dex["entries"] if not e.get("meta")]
    assert ohne == [], f"{len(ohne)} Eintraege ohne Nutzungsdatensatz: {ohne[:5]}"


# ── Der Bauer selbst, nicht nur sein Ergebnis ──────────────────────
#
# Die Zusicherungen oben lesen die committete JSON. Sie bleiben gruen,
# wenn jemand die Logik im Bauer zurueckbaut — bis der naechste CI-Lauf
# die Datei neu erzeugt und der Deploy steht. Darum hier zusaetzlich die
# beiden Funktionen direkt.

def _bauer():
    import importlib.util
    pfad = os.path.join(ROOT, "scripts", "build_champions_pokedex.py")
    spec = importlib.util.spec_from_file_location("bauer_tauros", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize("key,en,de_label", [
    ("Tauros-Paldea-Blaze", "Paldean Tauros (Blaze Breed)", "Paldea, Flammenvariante"),
    ("Tauros-Paldea-Aqua", "Paldean Tauros (Aqua Breed)", "Paldea, Flutenvariante"),
])
def test_parse_smogon_kennt_region_plus_variante(key, en, de_label):
    mod = _bauer()
    en_ist, basis, label, art = mod.parse_smogon(key)
    assert en_ist == en
    assert basis == "Tauros"
    assert label == de_label
    assert art == "Regional", "eine Regionalform darf nicht als Grundform gelten"


def test_parse_smogon_laesst_andere_dreiteiler_in_ruhe():
    """Nur Region PLUS bekannte Variante darf in den neuen Zweig fallen.

    In data/pokemon_battle_data.json stehen weitere dreiteilige Namen
    (Totem- und Zen-Formen). Sie duerfen sich nicht veraendern.
    """
    mod = _bauer()
    for key in ("Raticate-Alola-Totem", "Marowak-Alola-Totem", "Darmanitan-Galar-Zen"):
        en, basis, label, art = mod.parse_smogon(key)
        rest = key.split("-", 1)[1]
        assert en == f"{key.split('-')[0]} ({rest})", f"{key} wurde umgedeutet: {en}"
        assert art == "Base"


def test_parse_smogon_bleibt_fuer_alle_smogon_schluessel_stabil():
    """Gegenprobe ueber den ganzen Schluesselraum: genau die drei
    Tauros-Schluessel duerfen sich gegenueber der alten Regel aendern."""
    mod = _bauer()
    smogon = _lies("pokemon_battle_data.json")

    def alt(nm):
        """Die Regel vor dem 31.08.2026 — ohne den Variantenzweig."""
        if nm.endswith("-Mega-X"):
            b = nm[:-7]; return (f"Mega {b} X", b, "Mega X", "Mega")
        if nm.endswith("-Mega-Y"):
            b = nm[:-7]; return (f"Mega {b} Y", b, "Mega Y", "Mega")
        if nm.endswith("-Mega"):
            b = nm[:-5]; return (f"Mega {b}", b, "Mega", "Mega")
        if "-" in nm and nm not in mod.HYPHEN_BASE:
            b, suf = nm.split("-", 1)
            if suf in mod.REGION_SUFFIX:
                pre, de, kind = mod.REGION_SUFFIX[suf]
                return (f"{pre} {b}", b, de, kind)
            return (f"{b} ({suf})", b, suf, "Base")
        return (nm, nm, "", "Base")

    anders = sorted(k for k in smogon if alt(k) != mod.parse_smogon(k))
    assert anders == ["Tauros-Paldea-Aqua", "Tauros-Paldea-Blaze",
                      "Tauros-Paldea-Combat"], (
        f"unerwartete Aenderungen: {anders}")


def test_die_umbenennung_des_sammelnamens_steht_im_bauer():
    """Der Roster liefert weiter "Paldean Tauros"; ohne diese Tabelle
    kommt der Sammelname beim naechsten Bau zurueck."""
    mod = _bauer()
    assert "Paldean Tauros" in mod.ROSTER_UMBENENNUNG
    en, de = mod.ROSTER_UMBENENNUNG["Paldean Tauros"]
    assert en == "Paldean Tauros (Combat Breed)"
    assert de == "Tauros (Paldea, Gefechtvariante)"
    assert _norm(en) == _norm("paldean-tauros-combat-breed"), (
        "der neue Name muss auf den Ladder-Slug normalisieren, sonst "
        "bleibt die Luecke trotz Umbenennung offen")


def test_die_beiden_varianten_stehen_kuratiert_im_scraper():
    """WICHTIGSTE Zusicherung dieser Datei.

    data/champions_roster_extra.json wird von
    champions-replica-scrape.yml TAEGLICH neu geschrieben
    (scripts/scrape_champions_roster.py). Wer die zwei Smogon-Schluessel
    nur in die erzeugte Datei eintraegt, verliert sie beim naechsten
    Lauf: Blaze und Aqua fallen aus dem Pokedex, die Zusicherungen oben
    werden rot, und deploy-pages.yml haelt die ganze Auslieferung an.
    Genau derselbe Fehlermodus, den dieser Durchgang fuer die
    entschiedenen Namen beseitigt hat.
    """
    with open(os.path.join(ROOT, "scripts", "scrape_champions_roster.py"),
              encoding="utf-8") as f:
        quelle = f.read()
    assert "EXTRA_FORMEN" in quelle, "die kuratierte Liste fehlt"
    for key in ("Tauros-Paldea-Blaze", "Tauros-Paldea-Aqua"):
        assert key in quelle, f"{key} steht nicht in scrape_champions_roster.py"
    # Gelesen UND in die Ausgabe uebernommen.
    assert re.search(r"formen\s*=\s*\[f for f in EXTRA_FORMEN", quelle)
    assert re.search(r"base\s*\+\s*megas\s*\+\s*formen", quelle), (
        "die kuratierten Formen landen nicht in der Schluesselliste")


def test_die_erzeugte_datei_passt_zur_kuratierten_liste():
    """Und die committete Datei enthaelt sie auch wirklich."""
    extra = _lies("champions_roster_extra.json")
    for key in ("Tauros-Paldea-Blaze", "Tauros-Paldea-Aqua"):
        assert key in extra["smogonKeys"]
    assert extra["_meta"].get("form_count") == 2
