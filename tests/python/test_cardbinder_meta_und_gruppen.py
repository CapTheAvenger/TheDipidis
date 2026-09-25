"""Kein Kartentopf ohne Namen, und keine Karte ohne Gruppe.

ZWEI BEFUNDE DES BETREIBERS VOM 25.09.2026, BEIDE AN EINEM
BILDSCHIRMFOTO DES CARDBINDERS
--------------------------------------------------------------

  „was genau ist denn Online ohne Meta, das kann ja nicht sein."

  data/online_tournament_dated_cards.csv traegt in ALLEN 24.555 Zeilen
  die Meta-Angabe „Online Dated“ (backend/core/limitless_dated.py,
  DATED_META_LABEL). Das ist kein Format, sondern der Name der Datei.
  Der Chip sagte „Online, ohne Meta-Angabe 2“ — und die zwei Turniere
  dahinter haben selbstverstaendlich ein Format gespielt.

  „bitte auch noch unsere Standardsortierung anbieten --> Pokemon,
   supporter, Item, Tool, Stadion, Spezial Energie, Basis Energie"

  Dafuer braucht jede Karte eine FEINE Art. Die Online-API fuehrt nur
  pokemon/trainer/energy und steht in der Rangfolge vorn — bei 105 von
  228 Karten stand deshalb „trainer“, und Supporter, Item, Tool und
  Stadion waren nicht zu trennen.

WAS HIER BEISST
---------------
Die Ableitung der Meta aus dem Datum ist erlaubt, weil online das
Format am Set-Release wechselt und genau dieses Fenster im Bestand
steht. Sie ist aber NICHT dasselbe wie eine gefuehrte Angabe — und darf
sich deshalb nicht als eine ausgeben. Geprueft wird beides: dass sie
stimmt, und dass sie gekennzeichnet ist.
"""

import glob
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATA = os.path.join(WURZEL, "data")
MAPPEN = os.path.join(DATA, "masterclass_cardbinder")

sys.path.insert(0, os.path.join(WURZEL, "scripts"))
sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))

import kartengruppe  # noqa: E402

# ZWEI STICHPROBENSCHWELLEN, KEINE DATENZAHLEN
#
# Beide gehoeren zu einem pytest.skip und koennen einen Lauf nicht rot
# machen: sie sagen nur, ab wann ein Vergleich ueberhaupt etwas
# aussagt. Unter 50 gefuehrten Turnieren waere eine Quote aus einer
# Handvoll Zeilen Zufall — bei 3 Turnieren und einem Umschalttag stuende
# da 67 % und der Lauf waere rot, ohne dass etwas kaputt ist.
#
# Sie stehen als Konstanten hier oben und nicht als Zahl im Rumpf, damit
# tests/python/test_livedaten_wachhund.py sie nicht fuer eine
# festgenagelte Datenzahl haelt — was sie nicht sind.
MINDESTENS_VERGLEICHBAR = 50
MINDESTENS_KARTEN = 100


def _mappen():
    pfade = sorted(glob.glob(os.path.join(MAPPEN, "*.json")))
    if not pfade:
        pytest.skip("keine gebaute Kartenmappe im Baum")
    aus = []
    for p in pfade:
        with open(p, encoding="utf-8") as fh:
            aus.append((os.path.basename(p), json.load(fh)))
    return aus


# ── 1 · Die Meta ──────────────────────────────────────────────────────

def test_kein_topf_heisst_noch_online_dated():
    """Der Befund selbst, an der gebauten Datei."""
    for name, d in _mappen():
        ids = [m["id"] for m in d.get("metas") or []]
        assert "Online Dated" not in ids, (
            "%s fuehrt weiter den Platzhalter „Online Dated“" % name)
        for k in d.get("karten") or []:
            assert "Online Dated" not in (k.get("je_meta") or {}), (
                "%s: die Karte %s haengt weiter am Platzhalter"
                % (name, k.get("name")))


def test_abgeleitete_metas_sagen_es():
    """Eine abgeleitete Zahl, die sich als gemessen ausgibt, waere
    schlimmer als der namenlose Topf von vorher."""
    for name, d in _mappen():
        for m in d.get("metas") or []:
            n = m.get("turniere_abgeleitet")
            assert n is not None, (
                "%s / %s: es steht nicht da, wie viele Turniere ihre Meta "
                "aus dem Datum bekommen haben" % (name, m["id"]))
            assert n <= m["turniere"], (
                "%s / %s: %d abgeleitete von %d Turnieren"
                % (name, m["id"], n, m["turniere"]))
            if n:
                hinweis = m.get("hinweis") or ""
                assert "abgeleitet" in hinweis.lower(), (
                    "%s / %s: %d Turniere sind abgeleitet, der Hinweis sagt es "
                    "aber nicht: %r" % (name, m["id"], n, hinweis[:120]))
                assert "format_window.json" in hinweis, (
                    "%s / %s: der Hinweis nennt die Quelle des Fensters nicht"
                    % (name, m["id"]))


def test_die_ableitung_stimmt_mit_den_gefuehrten_angaben_ueberein():
    """Die Gegenprobe an den Daten, nicht am Wortlaut.

    Ueber alle Turniere, die ihre Meta SELBST fuehren, wird die
    Ableitung nachgerechnet. Sie muss fast immer dasselbe sagen — und wo
    nicht, muss es am Rand eines Fensters liegen. Das ist eine
    EIGENSCHAFT und keine festgenagelte Zahl: die Turniere rotieren
    wochentlich.
    """
    import csv
    from limitless_api_scraper import formatfenster, formatschluessel

    pfad = os.path.join(DATA, "online_api_tournaments.csv")
    if not os.path.exists(pfad):
        pytest.skip("online_api_tournaments.csv fehlt im Baum")
    with open(pfad, newline="", encoding="utf-8-sig") as fh:
        zeilen = list(csv.DictReader(fh, delimiter=";"))
    if len(zeilen) < MINDESTENS_VERGLEICHBAR:
        pytest.skip("zu wenige Turniere fuer eine Gegenprobe (%d)" % len(zeilen))

    starts = {start for _, start in formatfenster(DATA)}
    gleich = []
    anders = []
    for z in zeilen:
        gefuehrt = (z.get("meta") or "").strip()
        tag = (z.get("date") or "")[:10]
        if not gefuehrt or not tag:
            continue
        (gleich if formatschluessel(tag, DATA) == gefuehrt else anders).append(tag)

    n = len(gleich) + len(anders)
    assert n >= MINDESTENS_VERGLEICHBAR, "nur %d vergleichbare Turniere" % n
    anteil = len(gleich) / n
    assert anteil >= 0.95, (
        "die Ableitung aus dem Datum trifft nur %.1f %% der %d gefuehrten "
        "Angaben — dann ist das Fenster in data/format_window.json oder "
        "data/sets_metadata.json nicht mehr der Stand" % (100 * anteil, n))

    # Und die Abweichungen liegen am Umschalttag, nicht irgendwo.
    import datetime as dt
    weit = []
    for tag in anders:
        abstand = min(
            abs((dt.date.fromisoformat(tag) - dt.date.fromisoformat(s)).days)
            for s in starts) if starts else 99
        if abstand > 3:
            weit.append((tag, abstand))
    assert not weit, (
        "diese Turniere weichen ab, liegen aber NICHT am Rand eines "
        "Formatfensters — dann ist die Ableitung nicht nur am Umschalttag "
        "unscharf: %s" % weit[:10])


def test_der_index_gewinnt_gegen_die_ableitung():
    """Verhalten, ausgefuehrt: eine gefuehrte Angabe wird nicht
    ueberschrieben."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_unter_test", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    index = {"T1": ("TEF-PBL", "online_api_tournaments.csv")}
    # Ein Turnier, dessen Datum ins NEUE Fenster faellt, dessen Quelle
    # aber das alte Format fuehrt. Der Index muss gewinnen.
    meta, abgeleitet, quelle = mod.loese_meta("Online Dated", "T1", "2026-09-22", index)
    assert meta == "TEF-PBL"
    assert abgeleitet is False
    assert quelle == "online_api_tournaments.csv"

    # Unbekanntes Turnier: das Fenster fuellt die Luecke, gekennzeichnet.
    meta2, abgeleitet2, quelle2 = mod.loese_meta("Online Dated", "T9", "2026-09-22", index)
    assert meta2 and meta2 != "Online Dated"
    assert abgeleitet2 is True
    assert "format_window.json" in (quelle2 or "")

    # Eine echte Angabe wird nicht angefasst.
    assert mod.loese_meta("TEF-30C", "T9", "2026-09-22", index) == ("TEF-30C", False, None)

    # Ohne Datum wird nichts erfunden.
    assert mod.loese_meta("Online Dated", "T9", "", index)[0] == "Online Dated"


def test_kein_turnier_liegt_in_zwei_metas():
    """Die Umsortierung darf keine Doppelzaehlung erzeugen."""
    for name, d in _mappen():
        summe = sum(m["turniere"] for m in d.get("metas") or [])
        gesamt = (d.get("_meta") or {}).get("turniere_gesamt")
        assert gesamt == summe, (
            "%s: %d Turniere ueber alle Metas, aber die Metas summieren sich "
            "auf %d — dann steht dasselbe Turnier in zwei Toepfen"
            % (name, gesamt, summe))


# ── 2 · Die Gruppen ───────────────────────────────────────────────────

def test_jede_karte_hat_eine_der_sieben_gruppen():
    for name, d in _mappen():
        ohne = [k["name"] for k in d.get("karten") or [] if not k.get("gruppe")]
        assert ohne == [], (
            "%s: diese Karten haben keine Gruppe und koennen in der "
            "Standardsortierung nicht einsortiert werden: %s"
            % (name, ohne[:10]))
        fremd = sorted({k["gruppe"] for k in d.get("karten") or []}
                       - set(kartengruppe.ORDNUNG))
        assert fremd == [], "%s: unbekannte Gruppen %s" % (name, fremd)


def test_die_gruppen_sind_nicht_alle_dieselbe():
    """Gegenprobe: eine Mappe, in der alles „pokemon“ heisst, wuerde die
    Zusicherung darueber bestehen und die Sortierung waere sinnlos."""
    for name, d in _mappen():
        vorhanden = {k["gruppe"] for k in d.get("karten") or []}
        assert len(vorhanden) >= 5, (
            "%s fuehrt nur %d verschiedene Gruppen (%s) — bei 60 Karten in "
            "einem Deck sind mindestens Pokemon, Supporter, Item und zwei "
            "Energiearten zu erwarten" % (name, len(vorhanden), sorted(vorhanden)))
        # Trainer muessen aufgetrennt sein: genau das war der Befund.
        for feine in ("supporter", "item"):
            assert feine in vorhanden, (
                "%s hat keine Karte der Gruppe %r — dann steckt der grobe "
                "Wert „trainer“ noch drin" % (name, feine))


def test_die_reihenfolge_ist_die_vom_betreiber_genannte():
    assert list(kartengruppe.ORDNUNG) == [
        "pokemon", "supporter", "item", "tool", "stadium",
        "special-energy", "basic-energy"]
    assert kartengruppe.rang("pokemon") < kartengruppe.rang("supporter")
    assert kartengruppe.rang("special-energy") < kartengruppe.rang("basic-energy")
    assert kartengruppe.rang(None) > kartengruppe.rang("basic-energy")


def test_der_ganze_bestand_loest_sich_auf():
    """Jede Karte im Bestand bekommt eine Gruppe — sonst faellt in der
    Standardsortierung irgendwann eine heraus."""
    ohne = []
    gesamt = 0
    for pfad in sorted(glob.glob(os.path.join(DATA, "cards_chunk_*.json"))):
        with open(pfad, encoding="utf-8") as fh:
            karten = json.load(fh)
        if not isinstance(karten, list):
            continue
        for k in karten:
            gesamt += 1
            if kartengruppe.gruppe(k.get("type"), k.get("name_en")) is None:
                ohne.append((k.get("set"), k.get("number"), k.get("type")))
    if gesamt < MINDESTENS_KARTEN:
        pytest.skip("zu wenige Karten im Baum (%d)" % gesamt)
    assert ohne == [], (
        "%d von %d Karten im Bestand bekommen keine Gruppe: %s"
        % (len(ohne), gesamt, ohne[:10]))


def test_die_grobe_spalte_wird_nicht_geraten():
    """„trainer“ und „energy“ sagen nicht, welche Gruppe gemeint ist —
    und werden deshalb NICHT beantwortet."""
    assert kartengruppe.gruppe("trainer") is None
    assert kartengruppe.gruppe("energy") is None
    assert kartengruppe.gruppe("pokemon") == "pokemon"


def test_die_zusammengesetzte_kartenart_landet_richtig():
    """Der Anlass fuer das gemeinsame Modul: 25 Karten im Bestand tragen
    „Item/Technical Machine“."""
    assert kartengruppe.gruppe("Item/Technical Machine") == "item"
    assert kartengruppe.gruppe("Basic Energy") == "basic-energy"
    assert kartengruppe.gruppe("Special Energy") == "special-energy"
    assert kartengruppe.gruppe("Basic") == "pokemon"
    assert kartengruppe.gruppe("Pokémon Tool") == "tool"


def test_es_gibt_nur_eine_regel():
    """scripts/generate-bot-deck-index.py hatte dieselbe Zuordnung ein
    zweites Mal ausgeschrieben und war schon abgedriftet. Eine Kopie
    mehr waere derselbe Fehler."""
    import ast
    pfad = os.path.join(WURZEL, "scripts", "generate-bot-deck-index.py")
    with open(pfad, encoding="utf-8") as fh:
        quelle = fh.read()
    baum = ast.parse(quelle)
    fn = next((k for k in ast.walk(baum)
               if isinstance(k, ast.FunctionDef) and k.name == "_classify_card_type"), None)
    assert fn is not None, "_classify_card_type() nicht gefunden"

    koerper = list(fn.body)
    if koerper and isinstance(koerper[0], ast.Expr) and \
            isinstance(koerper[0].value, ast.Constant) and \
            isinstance(koerper[0].value.value, str):
        koerper = koerper[1:]           # Docstring raus
    modul = ast.Module(body=koerper, type_ignores=[])
    namen = {getattr(k, "id", None) for k in ast.walk(modul)}
    assert "kartengruppe" in namen, (
        "_classify_card_type() fragt die gemeinsame Regel nicht — dann gibt "
        "es wieder zwei Zuordnungen, die auseinanderlaufen koennen")
    texte = [k.value for k in ast.walk(modul)
             if isinstance(k, ast.Constant) and isinstance(k.value, str)]
    assert "Supporter" not in texte and "Stadium" not in texte, (
        "im Koerper stehen wieder Typnamen — das ist die zweite Kopie: %s" % texte)

    # Und das Verhalten, ausgefuehrt.
    import importlib.util
    spec = importlib.util.spec_from_file_location("bot_unter_test", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod._classify_card_type("Item/Technical Machine", "") == "item"
    assert mod._classify_card_type("Supporter", "") == "supporter"
    assert mod._classify_card_type("", "") == "pokemon"


# ── 3 · Was der Deckbau aus der Mappe braucht ────────────────────────

def test_die_gesamtzahlen_tragen_schnitt_und_hoechstzahl():
    """Ohne sie kann die Ansicht „Alle Metas“ nicht sagen, wie viele
    Kopien ins Deck gehoeren — das + legte dort immer genau eine hinein
    (gemessen 25.09.2026)."""
    for name, d in _mappen():
        karten = d.get("karten") or []
        assert karten, "%s fuehrt keine Karte" % name
        mit_schnitt = [k for k in karten
                       if (k.get("gesamt") or {}).get("schnitt") is not None]
        assert len(mit_schnitt) >= len(karten) * 0.8, (
            "%s: nur %d von %d Karten haben einen Gesamtschnitt"
            % (name, len(mit_schnitt), len(karten)))
        for k in karten:
            g = k.get("gesamt") or {}
            je = [v for v in (k.get("je_meta") or {}).values()]
            hoechst_je = [v.get("hoechstzahl") for v in je if v.get("hoechstzahl")]
            if hoechst_je:
                assert g.get("hoechstzahl") == max(hoechst_je), (
                    "%s / %s: die Gesamt-Hoechstzahl %r passt nicht zu den "
                    "Metas %s" % (name, k["name"], g.get("hoechstzahl"), hoechst_je))
            schnitte = [v.get("schnitt") for v in je if v.get("schnitt")]
            if schnitte and g.get("schnitt") is not None:
                assert min(schnitte) - 0.01 <= g["schnitt"] <= max(schnitte) + 0.01, (
                    "%s / %s: der Gesamtschnitt %.2f liegt ausserhalb der "
                    "Einzelschnitte %s — dann ist er nicht gewichtet, sondern "
                    "gerechnet" % (name, k["name"], g["schnitt"], schnitte))


def test_die_ace_spec_marke_stimmt_mit_dem_register():
    with open(os.path.join(DATA, "ace_specs.json"), encoding="utf-8") as fh:
        register = {str(n).lower().replace("’", "'")
                    for n in (json.load(fh) or {}).get("ace_specs") or []}
    assert len(register) >= 20, "das Register fuehrt nur %d Karten" % len(register)
    for name, d in _mappen():
        falsch, fehlt = [], []
        for k in d.get("karten") or []:
            n = str(k.get("name") or "").strip().lower().replace("’", "'")
            if k.get("ace") and n not in register:
                falsch.append(n)
            if n in register and not k.get("ace"):
                fehlt.append(n)
        assert falsch == [], "%s: als ACE SPEC markiert, nicht im Register: %s" % (name, falsch)
        assert fehlt == [], "%s: im Register, aber nicht markiert: %s" % (name, fehlt)


def test_die_turnierklasse_ersetzt_das_pauschale_city_league():
    """BEFUND (Betreiber, 25.09.2026, am Bildschirmfoto): der Chip hiess
    „City League (Japan) 2“, dahinter stand die Champions League
    Yokohama mit 10.000 Spielern. Eine City League hat 4 bis 16.

    Die Kartenauswertung stempelt jeder Zeile `meta = "City League"` auf;
    die Klasse steht in der Archetypdatei desselben Fensters.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_klassen", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    klassen = {"569": "Champions League (JP)", "42": "City League (JP)"}
    meta, abgeleitet, quelle = mod.loese_meta("City League", "569", "2026-09-20", {}, klassen)
    assert meta == "Champions League (JP)", (
        "die Champions League Yokohama heisst weiter „City League“")
    assert abgeleitet is False, "die Klasse steht in der Quelle, sie ist nicht abgeleitet"
    assert quelle == "city_league_archetypes.csv"

    # Eine echte City League bleibt eine.
    assert mod.loese_meta("City League", "42", "2026-09-20", {}, klassen)[0] == "City League (JP)"

    # Unbekanntes Turnier: die pauschale Angabe bleibt stehen, geraten
    # wird nichts.
    assert mod.loese_meta("City League", "999", "2026-09-20", {}, klassen)[0] == "City League"

    # Und der Klarname ist deutsch und nennt die Klasse.
    assert mod.META_KLARNAME["Champions League (JP)"] == "Champions League (Japan)"


def test_die_turnierklassen_kommen_aus_der_archetypdatei():
    """Die Tabelle wird wirklich gelesen — und nicht im Skript gepflegt."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_klassen2", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tab = mod.turnierklassen()
    pfad = os.path.join(DATA, "city_league_archetypes.csv")
    if not os.path.exists(pfad):
        pytest.skip("city_league_archetypes.csv fehlt")
    import csv as _csv
    with open(pfad, newline="", encoding="utf-8-sig") as fh:
        zeilen = list(_csv.DictReader(fh, delimiter=";"))
    if not zeilen:
        pytest.skip("die Archetypdatei ist leer (Saisonpause)")
    for z in zeilen[:20]:
        t = (z.get("tournament_id") or "").strip()
        k = (z.get("format") or "").strip()
        if t and k:
            assert tab.get(t) == k, (
                "Turnier %s fuehrt in der Datei %r, die Tabelle sagt %r"
                % (t, k, tab.get(t)))


# ── 4 · Basis-Energien ────────────────────────────────────────────────

def test_jede_basis_energieart_steht_genau_einmal():
    """BEFUND (Betreiber, 25.09.2026): „für Basis Metal brauchen wir
    nicht verschiede Prints zeigen, eins reicht“.

    Die Mappe fuehrte drei Metall-Kacheln (MEE-8 mit 2592 Listen, MEE-16
    mit 42, EVO-98 mit 8). Fuer den Deckbau sind Basis-Energien
    austauschbar.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_energie", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    for name, d in _mappen():
        arten = {}
        for k in d.get("karten") or []:
            if k.get("gruppe") != "basic-energy":
                continue
            art = mod._energieart(k.get("name"))
            arten.setdefault(art, []).append(k["set"] + "-" + k["nummer"])
        doppelt = {a: v for a, v in arten.items() if len(v) > 1}
        assert doppelt == {}, (
            "%s zeigt mehrere Kacheln derselben Energieart: %s" % (name, doppelt))


def test_der_gezeigte_druck_ist_der_meistgespielte_und_die_anderen_stehen_daneben():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_energie2", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    def e(nummer, listen):
        return {"name": "Metal Energy", "set": "MEE", "nummer": nummer,
                "gruppe": "basic-energy",
                "gesamt": {"listen_mit_karte": listen, "schnitt": 15.0},
                "preis": {"eur": 0.02}}

    # Absichtlich in falscher Reihenfolge: der kleinste zuerst.
    raus = mod.energien_zusammenfassen([e("16", 42), e("8", 2592), e("98", 8)])
    assert len(raus) == 1, "die Drucke wurden nicht zusammengefasst"
    assert raus[0]["nummer"] == "8", (
        "gezeigt wird nicht der meistgespielte Druck, sondern %s" % raus[0]["nummer"])
    weitere = [w["nummer"] for w in raus[0]["weitere_drucke"]]
    assert weitere == ["16", "98"], (
        "die anderen Drucke fehlen oder stehen in falscher Reihenfolge: %s" % weitere)
    # Und keine Summe.
    assert raus[0]["gesamt"]["listen_mit_karte"] == 2592, (
        "die Listenzahlen wurden addiert — 2592+42+8 sind 2642 bei 2641 Listen, "
        "also zaehlte das Listen doppelt")


def test_basic_und_ohne_basic_sind_dieselbe_energieart():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_energie3", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod._energieart("Basic Metal Energy") == mod._energieart("Metal Energy")
    assert mod._energieart("Metal Energy") != mod._energieart("Psychic Energy")


def test_nur_basis_energien_werden_zusammengefasst():
    """Zwei Drucke desselben Supporters sind NICHT austauschbar — der
    Kartentext kann sich unterscheiden, und die Deckliste nennt den
    Druck."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cb_energie4", os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    karten = [
        {"name": "Iono", "set": "PAL", "nummer": "185", "gruppe": "supporter",
         "gesamt": {"listen_mit_karte": 100}},
        {"name": "Iono", "set": "PAF", "nummer": "80", "gruppe": "supporter",
         "gesamt": {"listen_mit_karte": 20}},
    ]
    assert len(mod.energien_zusammenfassen(karten)) == 2


def test_die_kartenart_ist_fein_und_nicht_die_grobe_spalte():
    """BEFUND (25.09.2026, live geprueft): fuer Rotomurf (PBL-46) stand
    in der Mappe `typ = "pokemon"` — die grobe Spalte der Online-API.

    Der Deckblock zaehlte damit kein einziges Basis-Pokemon und meldete
    „Ohne Basis-Pokémon ist das Deck nicht spielbar“, waehrend drei
    Rotomurf drin lagen. Dieselbe Angabe geht an den Deckbauer im
    Profil, dessen Mulligan-Rechnung an genau diesem Feld haengt.
    """
    grob = {"pokemon", "trainer", "energy"}
    for name, d in _mappen():
        karten = d.get("karten") or []
        assert karten, "%s fuehrt keine Karte" % name
        ohne = [k["name"] for k in karten if not k.get("typ")]
        assert ohne == [], "%s: diese Karten haben keine Kartenart: %s" % (name, ohne[:8])
        grobe = [(k["name"], k["typ"]) for k in karten
                 if str(k["typ"]).strip().lower() in grob]
        assert grobe == [], (
            "%s: diese Karten tragen die GROBE Spalte als Kartenart — damit "
            "laesst sich kein Basis-Pokemon erkennen: %s" % (name, grobe[:8]))
        # Und mindestens ein Basis-Pokemon muss erkennbar sein: ohne eines
        # waere kein Deck spielbar.
        basis = [k for k in karten
                 if str(k["typ"]).strip().lower().endswith("basic")]
        assert basis, (
            "%s: keine einzige Karte ist als Basis-Pokemon erkennbar" % name)
