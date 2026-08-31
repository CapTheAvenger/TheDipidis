"""Das Luecken-Inventar und die belegten Mega-Faehigkeiten.

WAS HIER SCHIEFGEHEN KANN

Zwei Fehler, die niemand sieht, weil beide gruen aussehen:

1. `data/datenluecken.json` treibt vom Erzeuger weg. Jemand aendert die
   Daten, laesst scripts/datenluecken.py nicht laufen, und der
   Admin-Bereich zeigt eine Luecke, die es nicht mehr gibt — oder
   verschweigt eine neue. Eine Liste, die nicht stimmt, ist schlimmer
   als keine.

2. Die Einstufung "eindeutig" wird vergeben, obwohl sie nicht traegt.
   "eindeutig" heisst genau eines: der Wert steht NICHT in der
   Faehigkeitenliste der Grundform und kann deshalb kein Rueckfall auf
   sie sein. Wer das aufweicht, traegt am Ende geratene Werte ein — und
   die stehen dann als Tatsache in der Oberflaeche.

Beides wird hier gegen die Dateien selbst gerechnet, nicht behauptet.
"""
import json
import os
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")
SCRIPTS = os.path.join(ROOT, "scripts")


def _json(pfad):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def inventar():
    return _json(os.path.join(DATA, "datenluecken.json"))


@pytest.fixture(scope="module")
def quellen():
    return _json(os.path.join(DATA, "champions_mega_faehigkeiten.json"))


@pytest.fixture(scope="module")
def pokedex():
    return _json(os.path.join(DATA, "champions_pokedex.json"))


# ── Das Inventar ───────────────────────────────────────────────────

def test_inventar_stimmt_mit_dem_erzeuger_ueberein(inventar):
    """Neu gerechnet muss dasselbe herauskommen — bis auf den Zeitstempel."""
    sys.path.insert(0, SCRIPTS)
    try:
        import datenluecken  # noqa: PLC0415
        frisch = datenluecken.baue()
    finally:
        sys.path.remove(SCRIPTS)
    assert frisch["luecken"] == inventar["luecken"], (
        "data/datenluecken.json ist veraltet — neu erzeugen mit "
        "'python3 scripts/datenluecken.py'"
    )
    assert frisch["_meta"]["jeKlasse"] == inventar["_meta"]["jeKlasse"]


def test_jede_kennung_kommt_genau_einmal_vor(inventar):
    ids = [l["id"] for l in inventar["luecken"]]
    doppelt = sorted({i for i in ids if ids.count(i) > 1})
    assert not doppelt, "doppelte Kennungen: " + ", ".join(doppelt)


def test_jede_luecke_traegt_die_pflichtfelder(inventar):
    for l in inventar["luecken"]:
        for feld in ("id", "klasse", "titel", "titelEn", "wo"):
            assert (l.get(feld) or "").strip(), f"{l.get('id')}: {feld} fehlt"
        assert l["klasse"] in inventar["_meta"]["klassen"], (
            f"{l['id']}: Klasse {l['klasse']} hat keine Beschriftung"
        )


def test_jede_klasse_hat_beide_sprachen(inventar):
    for name, texte in inventar["_meta"]["klassen"].items():
        assert (texte.get("de") or "").strip(), f"{name}: deutsch fehlt"
        assert (texte.get("en") or "").strip(), f"{name}: englisch fehlt"


def test_anzahl_und_zaehler_passen_zur_liste(inventar):
    assert inventar["_meta"]["anzahl"] == len(inventar["luecken"])
    gezaehlt = {}
    for l in inventar["luecken"]:
        gezaehlt[l["klasse"]] = gezaehlt.get(l["klasse"], 0) + 1
    assert gezaehlt == inventar["_meta"]["jeKlasse"]


# ── Die Einstufung ─────────────────────────────────────────────────

def test_eindeutig_heisst_wirklich_nicht_bei_der_grundform(quellen):
    """Die Regel, an der alles haengt — hier wird sie nachgerechnet."""
    for name, e in quellen["eintraege"].items():
        if e["einstufung"] != "eindeutig":
            continue
        basis = e.get("basisFaehigkeiten") or []
        assert basis, f"{name}: als eindeutig eingestuft, aber ohne Basisliste"
        assert e["wert"] not in basis, (
            f"{name}: '{e['wert']}' steht in der Faehigkeitenliste von "
            f"{e.get('grundform')} — das ist nicht eindeutig"
        )


def test_mehrdeutig_heisst_wirklich_auch_bei_der_grundform(quellen):
    for name, e in quellen["eintraege"].items():
        if e["einstufung"] != "mehrdeutig":
            continue
        basis = e.get("basisFaehigkeiten") or []
        assert e["wert"] in basis, (
            f"{name}: als mehrdeutig eingestuft, aber '{e['wert']}' steht "
            f"gar nicht bei {e.get('grundform')} — dann waere es eindeutig"
        )


def test_uebernommen_wird_nur_mit_beleg_oder_bestaetigung(quellen):
    """Die Regel, die am 31.08.2026 erweitert wurde — und ihre Grenze.

    Bis zur Bestaetigung galt: uebernommen wird nur, was EINZELN traegt
    (der Wert kommt bei der Grundform nicht vor). Seit der Betreiber die
    zwoelf mehrdeutigen Faelle bestaetigt hat, gilt: uebernommen wird,
    was eindeutig belegt ODER vom Betreiber bestaetigt ist.

    Die Einstufung "mehrdeutig" bleibt bei diesen zwoelf stehen. Sie
    beschreibt, was der Einzelbeleg hergibt, und daran hat die
    Bestaetigung nichts geaendert — sie hat eine zweite, unabhaengige
    Quelle danebengestellt. Wer die Einstufung nachtraeglich auf
    "eindeutig" umschreibt, loescht genau diese Unterscheidung.
    """
    for name, e in quellen["eintraege"].items():
        if not e.get("uebernommen"):
            continue
        if e["einstufung"] == "eindeutig":
            continue
        b = e.get("bestaetigt") or {}
        assert b.get("von") and b.get("am"), (
            f"{name}: uebernommen und {e['einstufung']}, aber ohne "
            f"Bestaetigung — dann fehlt der zweite Beleg"
        )


def test_eine_bestaetigung_ersetzt_keine_einstufung(quellen):
    """Gegenprobe: nichts wird als eindeutig ausgegeben, was es nicht ist."""
    for name, e in quellen["eintraege"].items():
        if not e.get("bestaetigt"):
            continue
        basis = e.get("basisFaehigkeiten") or []
        assert e["wert"] in basis, (
            f"{name}: traegt eine Bestaetigung, obwohl der Wert bei der "
            f"Grundform gar nicht vorkommt — dann waere er eindeutig und "
            f"braeuchte sie nicht"
        )


def test_jeder_eintrag_traegt_quelle_und_begruendung(quellen):
    for name, e in quellen["eintraege"].items():
        assert (e.get("wert") or "").strip(), f"{name}: kein Wert"
        assert (e.get("slug") or "").strip(), f"{name}: kein Quellen-Slug"
        assert (e.get("begruendung") or "").strip(), f"{name}: keine Begruendung"
        assert e["einstufung"] in ("eindeutig", "mehrdeutig"), (
            f"{name}: unbekannte Einstufung {e['einstufung']!r}"
        )
    assert (quellen["_meta"].get("gelesen_am") or "").strip()


# ── Der Durchgriff auf die Daten ───────────────────────────────────

def test_uebernommene_werte_stehen_im_pokedex(quellen, pokedex):
    nach_name = {e["en"]: e for e in pokedex["entries"]}
    for name, q in quellen["eintraege"].items():
        assert name in nach_name, f"{name} steht in keinem Pokedex-Eintrag"
        e = nach_name[name]
        if q.get("uebernommen"):
            assert e.get("megaAbility") == q["wert"], (
                f"{name}: Pokedex fuehrt {e.get('megaAbility')!r}, "
                f"Quelldatei {q['wert']!r}"
            )
            assert e.get("megaAbilityQuelle") == "pokebase"
        else:
            assert not (e.get("megaAbility") or "").strip(), (
                f"{name}: nicht uebernommen, steht aber trotzdem im Pokedex"
            )


def test_alle_sechzehn_megas_sind_belegt(quellen, pokedex):
    """Der Stand, den der 31.08.2026 hergestellt hat.

    Waechst die Zahl der offenen wieder, ist entweder eine Form
    dazugekommen oder eine Uebernahme zurueckgenommen worden. Beides
    soll auffallen.
    """
    assert len(quellen["eintraege"]) == 16
    offen = [n for n, e in quellen["eintraege"].items() if not e.get("uebernommen")]
    assert offen == [], "wieder ohne Beleg: " + ", ".join(offen)
    assert pokedex["_meta"]["megaAbilityMissing"] == []
    assert len(pokedex["_meta"]["megaAbilityBelegt"]) == 16


def test_offene_megas_stehen_im_inventar_die_belegten_nicht(inventar, quellen):
    im_inventar = {
        l["id"].split("/", 1)[1]
        for l in inventar["luecken"] if l["klasse"] == "mega-faehigkeit"
    }
    for name, q in quellen["eintraege"].items():
        kennung = name.lower().replace(" ", "-")
        if q.get("uebernommen"):
            assert kennung not in im_inventar, (
                f"{name} ist belegt, steht aber noch als Luecke im Inventar"
            )
        else:
            assert kennung in im_inventar, (
                f"{name} ist offen, fehlt aber im Inventar"
            )


def test_namenskonflikte_nennen_beide_werte(inventar):
    """Die Klasse, die am 31.08.2026 dazukam.

    Hier ist ausdruecklich KEINE Seite im Recht: bei Sitrus Berry hat
    die Referenzdatei zwei Beeren vertauscht, bei Throat Chop steht in
    der Namenstabelle ein englischer Name im deutschen Feld. Eine
    Luecke, die nur einen der beiden Werte nennt, waere deshalb ein
    Urteil, das wir nicht faellen koennen — sie muss beide zeigen.
    """
    konflikte = [l for l in inventar["luecken"] if l["klasse"] == "namenskonflikt"]
    assert konflikte, "Testvoraussetzung: mindestens ein Konflikt"
    for l in konflikte:
        v = l["vorschlag"]
        assert (v.get("wert") or "").strip(), l["id"]
        b = v.get("begruendung") or ""
        assert "Referenzdatei" in b and "Namenstabelle" in b, (
            f"{l['id']}: die Begruendung nennt nicht beide Seiten"
        )
        # Beide Werte muessen wirklich dastehen, nicht nur die Rollen.
        assert b.count("\u201e") == 2, (
            f"{l['id']}: es steht nicht genau ein Wert je Seite in der Begruendung"
        )
        assert v["quelle"].startswith("https://pokewiki.de/"), l["id"]
        assert " vs.  " in l["wo"], (
            f"{l['id']}: 'wo' muss beide Dateien nennen"
        )


def test_jede_offene_mega_luecke_traegt_ihren_vorschlag(inventar):
    for l in inventar["luecken"]:
        if l["klasse"] != "mega-faehigkeit":
            continue
        v = l.get("vorschlag")
        assert v, f"{l['id']}: kein Vorschlag — dann fehlt der Admin-Bereich der Sinn"
        assert v["quelle"].startswith("https://pokebase.app/"), l["id"]
        assert not v["quelle"].endswith("/"), (
            f"{l['id']}: Quellen-Slug fehlt, die Adresse endet auf /"
        )
        assert v["einstufung"] in ("eindeutig", "mehrdeutig"), l["id"]


def test_pokedex_meta_nennt_dieselbe_luecke_wie_das_inventar(pokedex, inventar):
    aus_meta = set(pokedex["_meta"]["megaAbilityMissing"])
    aus_inventar = {
        l["titel"].split(" — ")[0] for l in inventar["luecken"]
        if l["klasse"] == "mega-faehigkeit"
    }
    # _meta fuehrt englische Namen, das Inventar deutsche — verglichen
    # wird deshalb die Anzahl und die Herkunft, nicht der Wortlaut.
    assert len(aus_meta) == len(aus_inventar), (
        f"_meta.megaAbilityMissing: {len(aus_meta)}, Inventar: {len(aus_inventar)}"
    )
    assert set(pokedex["_meta"]["megaAbilityBelegt"]).isdisjoint(aus_meta)


def test_kein_ascii_ersatz_in_den_deutschen_texten(inventar):
    """ae/oe/ue statt Umlaut ist hier schon zweimal live gegangen.

    Der Quelltext dieses Projekts schreibt in Kommentaren bewusst ASCII.
    Was der Nutzer LIEST, darf das nicht — "Mega-Faehigkeit ohne Beleg"
    stand am 31.08.2026 in der gemessenen Oberflaeche, weil die
    Klassenbeschriftung aus einem solchen Kommentarumfeld stammte.
    """
    verdaechtig = ("Faehigkeit", "Uebersicht", "Zustaende", "fuehrt",
                   "uebernommen", "waehlen", "koennen", "muessen",
                   "Luecke", "Luecken", "naechst", "Groesse")
    treffer = []

    def pruefe(wo, text):
        for w in verdaechtig:
            if w in (text or ""):
                treffer.append(f"{wo}: {w!r} in {text[:70]!r}")

    for name, texte in inventar["_meta"]["klassen"].items():
        pruefe("klassen." + name, texte.get("de"))
    for l in inventar["luecken"]:
        pruefe(l["id"] + ".titel", l.get("titel"))
        pruefe(l["id"] + ".notiz", l.get("notiz"))
        v = l.get("vorschlag") or {}
        pruefe(l["id"] + ".begruendung", v.get("begruendung"))
    assert not treffer, "ASCII-Ersatz in sichtbarem Text:\n  " + "\n  ".join(treffer)


# ── Das Build-Skript ───────────────────────────────────────────────

def test_build_skript_liest_die_quelldatei_und_nur_das_uebernommene():
    pfad = os.path.join(SCRIPTS, "build_champions_pokedex.py")
    with open(pfad, encoding="utf-8") as f:
        src = f.read()
    assert "MEGA_ABILITY_PATH" in src
    assert "champions_mega_faehigkeiten.json" in src
    assert 'q.get("uebernommen")' in src, (
        "Das Build-Skript muss die Freigabe pruefen — sonst wandern auch "
        "unbestaetigte Vorschlaege in die Daten."
    )
    assert "keine oeffentliche Quelle" not in src, (
        "Der Satz war der Befund vom 30.08. und ist seit dem 31.08. "
        "widerlegt; er darf nicht zurueckkommen."
    )


def test_inventar_skript_laeuft_durch():
    # Das Skript schreibt data/datenluecken.json. Der Stand wird vorher
    # gesichert und hinterher zurueckgelegt — sonst repariert dieser Test
    # still die Drift, die der erste Test in dieser Datei aufdecken soll,
    # und die Reihenfolge der Tests entschiede ueber das Ergebnis.
    pfad = os.path.join(DATA, "datenluecken.json")
    with open(pfad, encoding="utf-8") as f:
        vorher = f.read()
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "datenluecken.py")],
            capture_output=True, text=True, cwd=ROOT,
        )
        assert r.returncode == 0, r.stderr
        assert "Datenluecken:" in r.stdout
    finally:
        with open(pfad, "w", encoding="utf-8") as f:
            f.write(vorher)
