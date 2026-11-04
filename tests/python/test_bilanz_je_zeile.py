"""Eine 0-0-0-Bilanz bei einem Day-2-Spieler ist keine Bilanz, sondern eine Luecke.

BEFUND (07.09.2026, gemessen an data/tournament_decklists_per_player.csv):
100 von 1.201 Decklisten trugen `wins=0, losses=0, ties=0` — Turin (0069)
40 von 383, NAIC (0070) 32 von 675, Worlds (0071) 28 von 143. Worlds ist
das einzige Turnier im laufenden Format TEF-PBL; dort war also fast jede
fuenfte Liste ohne Bilanz. Betroffen war unter anderem Platz 53, Benjamin
Pham, Mega Excadrill.

Die richtigen Zahlen lagen die ganze Zeit im Repo. player_continuity.csv
fuehrt fuer 0071 alle 797 Spieler und nennt fuer Platz 53 die Bilanz
8-3-1. Der Rueckfall in per_decklist_scraper.py griff aus zwei Gruenden
nicht, und beide sind hier festgenagelt:

  1. Er fragte `all_zero` — feuerte also nur, wenn der GANZE Stapel
     genullt war. Bei 28 von 143 blieb er stumm.
  2. Er verglich die Namen zeichengenau. Der Bestand fuehrt
     `Benjamin Pham`, player_continuity.csv `benjamin pham`. Treffer
     zeichengenau: 0 von 100. Kleingeschrieben: 84 von 100.
     Zusaetzlich entakzentuiert: 86 von 100.
"""

import collections
import csv
import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")
BESTAND = os.path.join(WURZEL, "data")   # SC-45: Ordner mit den Auszuegen

# SC-45 (04.11.2026): der Bestand liegt als Auszuege je Format und Monat
sys.path.insert(0, os.path.join(WURZEL, "scripts"))
import per_player_auszuege as _ppa  # noqa: E402
KONTINUITAET = os.path.join(WURZEL, "data", "player_continuity.csv")

BILANZSPALTEN = ("wins", "losses", "ties")


@pytest.fixture(scope="module")
def modul():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("pds_bilanz_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _zahl(wert):
    try:
        return int(str(wert).strip() or 0)
    except ValueError:
        return 0


def _ist_genullt(z):
    werte = [str(z.get(k, "")).strip() for k in BILANZSPALTEN]
    if any(v == "" for v in werte):
        return False
    return sum(_zahl(v) for v in werte) == 0


@pytest.fixture(scope="module")
def bestand():
    if not _ppa.quelle_vorhanden(BESTAND):
        pytest.skip("data/tournament_decklists_per_player_*.csv fehlt")
    return list(_ppa.quelle_zeilen(BESTAND))


@pytest.fixture(scope="module")
def decklisten(bestand):
    """Eine Deckliste ist (Turnier, Platz, Spieler) — nicht die Kartenzeile.

    NUR PAPIERZEILEN. Seit dem Wochenlauf #135 (10.09.2026) schreibt
    auch backend/scrapers/limitless_online_decklist_scraper.py in diese
    Datei. Dessen Quelle ist die Standings-Seite von
    play.limitlesstcg.com, nicht data/player_continuity.csv — die
    Zusicherungen hier unten pruefen den PAPIERWEG und wuerden fuer
    Online-Zeilen etwas verlangen, das es dort nicht gibt.
    Fuer die Online-Seite steht ein eigener Waechter am Dateiende.
    """
    listen = collections.OrderedDict()
    for z in bestand:
        if (z.get("quelle") or "").strip() == "online":
            continue
        listen.setdefault(
            (z["tournament_id"], z["place"], z["player_name"]), z)
    return listen


@pytest.fixture(scope="module")
def online_listen(bestand):
    """Dasselbe fuer die Online-Zeilen, ueber die Limitless-Kennung."""
    listen = collections.OrderedDict()
    for z in bestand:
        if (z.get("quelle") or "").strip() != "online":
            continue
        listen.setdefault(
            (z["limitless_tournament_id"], z["place"], z["player_name"]), z)
    return listen


# ─────────────────────────────────────────────────────────────────────
# 1. Der Schluessel
# ─────────────────────────────────────────────────────────────────────

def test_namensschluessel_ist_nicht_grossschreibungsempfindlich(modul):
    """DER Befund. Ohne diese Zeile: 0 von 100 Treffern."""
    assert (modul._bilanz_namensschluessel("Benjamin Pham")
            == modul._bilanz_namensschluessel("benjamin pham")
            == modul._bilanz_namensschluessel("  BENJAMIN   PHAM  ")), (
        "player_continuity.csv fuehrt die Namen kleingeschrieben, der "
        "Bestand gross. Wird der Schluessel nicht beidseitig normalisiert, "
        "trifft der Rueckfall keine einzige der 100 Luecken.")


def test_namensschluessel_faltet_akzente(modul):
    """Bringt zwei der 100 Treffer — gemessen, nicht vermutet."""
    assert (modul._bilanz_namensschluessel("Octavio González")
            == modul._bilanz_namensschluessel("Octavio Gonzalez"))
    assert (modul._bilanz_namensschluessel("Jesper S.H Eriksen")
            == modul._bilanz_namensschluessel("Jesper S. H. Eriksen"))


def test_namensschluessel_wirft_keine_namen_zusammen(modul):
    """Normalisieren heisst nicht raten. Zwei Menschen bleiben zwei."""
    assert (modul._bilanz_namensschluessel("Marco Cifuentes")
            != modul._bilanz_namensschluessel("Marco Garcia"))
    assert (modul._bilanz_namensschluessel("Benjamin Pham")
            != modul._bilanz_namensschluessel("Benjamin Pha"))


def test_der_platzweg_verlangt_zwei_gemeinsame_namensteile(modul):
    """Ein geteilter Vorname beweist bei 797 Spielern nichts."""
    assert modul._namen_meinen_denselben(
        "Marco Aurelio Fernandes Garcia", "Marco Garcia")
    assert modul._namen_meinen_denselben("Seungrim Kim", "KIM SEUNGRIM")
    assert modul._namen_meinen_denselben(
        "Kelvin Ching Kay Feng", "Kay Feng Kelvin Ching")
    assert not modul._namen_meinen_denselben("Marco Cifuentes", "Marco Garcia")
    assert not modul._namen_meinen_denselben("Diego Varea", "Diego Martinez")
    assert not modul._namen_meinen_denselben("Benjamin Pham", "")


# ─────────────────────────────────────────────────────────────────────
# 2. Der Rueckfall feuert je Zeile, nicht je Stapel
# ─────────────────────────────────────────────────────────────────────

def _bilanzen(modul, eintraege):
    """Kontinuitaetsbilanzen von Hand — ohne Datei, ohne Netz."""
    nach_name, nach_platz = {}, {}
    for tid, platz, name, bilanz in eintraege:
        nach_name[(tid, platz, modul._bilanz_namensschluessel(name))] = bilanz
        nach_platz.setdefault((tid, platz), []).append((name, bilanz))
    return modul.Kontinuitaetsbilanzen(nach_name, nach_platz)


def test_rueckfall_feuert_auch_bei_nur_teilweise_genulltem_stapel(modul):
    """Der eigentliche Grund, warum 100 Luecken stehenblieben.

    Der alte Code fragte `all_zero` ueber den ganzen Stapel. Bei Worlds
    waren 28 von 143 Zeilen genullt — eine einzige heile Zeile genuegte,
    und der Rueckfall schwieg.
    """
    bil = _bilanzen(modul, [
        ("0071", "53", "benjamin pham", (8, 3, 1)),
        ("0071", "1", "juan pablo", (13, 2, 1)),
    ])
    stapel = [
        {"place": "1", "player_name": "Juan Pablo", "wins": 13, "losses": 2, "ties": 1},
        {"place": "53", "player_name": "Benjamin Pham", "wins": 0, "losses": 0, "ties": 0},
    ]
    z = modul.bilanz_rueckfall_je_zeile(stapel, "0071", bil)

    assert z["aus_name"] == 1, (
        "Die genullte Zeile wurde nicht gefuellt — der Rueckfall haengt "
        "wieder an einer Bedingung ueber den GANZEN Stapel.")
    assert (stapel[1]["wins"], stapel[1]["losses"], stapel[1]["ties"]) == (8, 3, 1)


def test_vorhandene_bilanz_wird_nicht_ueberschrieben(modul):
    """Der Rueckfall fuellt Luecken. Er korrigiert nicht."""
    bil = _bilanzen(modul, [("0071", "1", "Juan Pablo", (1, 1, 1))])
    stapel = [{"place": "1", "player_name": "Juan Pablo",
               "wins": 13, "losses": 2, "ties": 1}]
    z = modul.bilanz_rueckfall_je_zeile(stapel, "0071", bil)
    assert z == {"aus_name": 0, "aus_platz": 0, "unbekannt": 0}
    assert (stapel[0]["wins"], stapel[0]["losses"]) == (13, 2)


def test_ohne_quelle_bleibt_das_feld_leer_und_wird_nicht_null(modul):
    """Kein Fund heisst kein Wert — keine erfundene 0."""
    bil = _bilanzen(modul, [("0071", "1", "Juan Pablo", (13, 2, 1))])
    stapel = [{"place": "999", "player_name": "Niemand Bekanntes",
               "wins": 0, "losses": 0, "ties": 0}]
    z = modul.bilanz_rueckfall_je_zeile(stapel, "0071", bil)
    assert z["unbekannt"] == 1
    assert stapel[0]["wins"] == "" and stapel[0]["losses"] == "" \
        and stapel[0]["ties"] == "", (
        "Eine 0 an dieser Stelle liest die Seite als '0 Siege' — genau die "
        "Falschaussage, die repariert werden sollte.")


def test_der_platzweg_greift_nur_bei_eindeutigem_platz(modul):
    """Zwei Eintraege unter demselben Platz: dann lieber keine Bilanz."""
    nach_platz = {("0071", "7"): [("Anna Beispiel", (9, 3, 0)),
                                  ("Bea Beispiel", (8, 4, 0))]}
    bil = modul.Kontinuitaetsbilanzen({("0071", "7", "x"): (1, 1, 1)}, nach_platz)
    assert bil.finde("0071", "7", "Anna Beispiel") is None


def test_der_platzweg_meldet_sich_als_eigener_weg(modul):
    """`Marco Cifuentes Meta` im Bestand, `Marco Cifuentes` in der Quelle."""
    bil = _bilanzen(modul, [("0071", "23", "Marco Cifuentes", (9, 3, 0))])
    assert bil.finde("0071", "23", "Marco Cifuentes Meta") == ((9, 3, 0), "platz")
    assert bil.finde("0071", "23", "Marco Cifuentes") == ((9, 3, 0), "name")


# ─────────────────────────────────────────────────────────────────────
# 3. Die Quelle
# ─────────────────────────────────────────────────────────────────────

def test_kontinuitaet_liefert_niemals_eine_null_bilanz(modul):
    """0-0-0 aus der Quelle waere kein Fund, sondern dieselbe Luecke."""
    if not os.path.exists(KONTINUITAET):
        pytest.skip("data/player_continuity.csv fehlt")
    bil = modul.load_player_continuity_records()
    assert len(bil) > 0, "player_continuity.csv gibt keine einzige Bilanz her"
    assert all(sum(b) > 0 for b in bil.nach_name.values())


def test_eine_echte_null_bilanz_gibt_es_nicht():
    """Belegt, dass der Rueckfall nichts Echtes ueberschreiben kann.

    Wer mit einem Platz in einer Standings-Tabelle steht, hat gespielt.
    Gemessen an allen 21.247 Eintraegen mit Platz.
    """
    if not os.path.exists(KONTINUITAET):
        pytest.skip("data/player_continuity.csv fehlt")
    with open(KONTINUITAET, newline="", encoding="utf-8") as f:
        mit_platz = [r for r in csv.DictReader(f)
                     if (r.get("place") or "").strip()]
    assert mit_platz
    genullt = [r for r in mit_platz
               if sum(_zahl(r[k]) for k in BILANZSPALTEN) == 0]
    assert genullt == [], (
        f"{len(genullt)} Eintraege mit Platz tragen 0-0-0 — dann waere "
        f"0-0-0 kein sicheres Kennzeichen fuer eine Luecke mehr, und der "
        f"Rueckfall duerfte nicht mehr blind auf 0-0-0 anspringen.")


# ─────────────────────────────────────────────────────────────────────
# 4. Der Bestand
# ─────────────────────────────────────────────────────────────────────

def test_keine_deckliste_traegt_mehr_null_null_null(decklisten):
    genullt = [k for k, z in decklisten.items() if _ist_genullt(z)]
    je_turnier = collections.Counter(k[0] for k in genullt)
    assert genullt == [], (
        f"{len(genullt)} von {len(decklisten)} Decklisten tragen 0-0-0 "
        f"({dict(je_turnier)}). Bei Day-2-Spielern ist das unmoeglich — "
        f"nachtragen mit: python backend/scrapers/per_decklist_scraper.py "
        f"--bilanzen-nachtragen")


def test_worlds_ist_vollstaendig(decklisten):
    """0071 ist das einzige Turnier im laufenden Format. Vorher: 28 von 143."""
    w = {k: z for k, z in decklisten.items() if k[0] == "0071"}
    assert w, "Turnier 0071 fehlt im Bestand"
    assert [k for k, z in w.items() if _ist_genullt(z)] == []


def test_mega_excadrill_bei_worlds_hat_bilanzen(decklisten):
    """Das Deck des Nutzers, im einzigen Turnier des laufenden Formats."""
    me = {k: z for k, z in decklisten.items()
          if k[0] == "0071" and "excadrill" in z["deck_archetype"].lower()}
    assert me, "keine Mega-Excadrill-Liste bei 0071 im Bestand"
    ohne = [k for k, z in me.items()
            if _ist_genullt(z) or any(str(z[s]).strip() == "" for s in BILANZSPALTEN)]
    assert ohne == [], ohne


def test_platz_53_traegt_die_bilanz_aus_der_quelle(decklisten):
    """Der Einzelfall aus dem Befund, gegen die Quelle geprueft."""
    treffer = [z for k, z in decklisten.items()
               if k[0] == "0071" and k[1] == "53"]
    assert treffer, "0071 Platz 53 fehlt im Bestand"
    z = treffer[0]
    assert z["player_name"] == "Benjamin Pham"
    assert (z["wins"], z["losses"], z["ties"]) == ("8", "3", "1")


def test_jede_bilanz_im_bestand_steht_so_in_player_continuity(decklisten):
    """Keine Zahl stammt aus diesem Reparaturlauf selbst.

    Verbunden wird ueber (Turnier, Platz); dass diese Verbindung traegt,
    ist gemessen: alle 1.201 Listen finden dort genau einen Eintrag, und
    kein einziger Name ist ein fremder.
    """
    if not os.path.exists(KONTINUITAET):
        pytest.skip("data/player_continuity.csv fehlt")
    quelle = {}
    with open(KONTINUITAET, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            platz = (r.get("place") or "").strip()
            if not platz:
                continue
            quelle.setdefault(((r.get("tournament_id") or "").strip(), platz),
                              []).append(r)
    erfunden = []
    for (tid, platz, name), z in decklisten.items():
        if any(str(z[s]).strip() == "" for s in BILANZSPALTEN):
            continue                       # als "keine Quelle" gekennzeichnet
        kand = quelle.get((tid, platz)) or []
        if len(kand) != 1:
            erfunden.append((tid, platz, name, "kein eindeutiger Eintrag"))
            continue
        r = kand[0]
        if tuple(_zahl(z[s]) for s in BILANZSPALTEN) != \
           tuple(_zahl(r[s]) for s in BILANZSPALTEN):
            erfunden.append((tid, platz, name,
                             f"{z['wins']}-{z['losses']}-{z['ties']} statt "
                             f"{r['wins']}-{r['losses']}-{r['ties']}"))
    assert erfunden == [], erfunden[:10]


# ─────────────────────────────────────────────────────────────────────
# 5. Der Nachtrag-Lauf
# ─────────────────────────────────────────────────────────────────────

def test_nachtragen_faesst_nur_die_bilanzspalten_an(modul):
    zeilen = [
        {"tournament_id": "0071", "place": "53", "player_name": "Benjamin Pham",
         "deck_archetype": "Mega Excadrill", "card_name": "Excadrill",
         "wins": "0", "losses": "0", "ties": "0", "scraped_at": "x"},
        {"tournament_id": "0071", "place": "53", "player_name": "Benjamin Pham",
         "deck_archetype": "Mega Excadrill", "card_name": "Nest Ball",
         "wins": "0", "losses": "0", "ties": "0", "scraped_at": "x"},
        {"tournament_id": "0071", "place": "1", "player_name": "Juan Pablo",
         "deck_archetype": "Dragapult", "card_name": "Dreepy",
         "wins": "13", "losses": "2", "ties": "1", "scraped_at": "y"},
    ]
    vorher = [{k: v for k, v in z.items() if k not in BILANZSPALTEN}
              for z in zeilen]
    bil = _bilanzen(modul, [("0071", "53", "benjamin pham", (8, 3, 1))])
    z = modul.bilanzen_nachtragen(zeilen, bil)

    assert z["listen"] == 2 and z["genullt"] == 1 and z["aus_name"] == 1
    assert z["zeilen_geaendert"] == 2, (
        "beide Kartenzeilen derselben Liste muessen dieselbe Bilanz "
        "bekommen — eine halb gefuellte Liste waere schlimmer als gar keine")
    nachher = [{k: v for k, v in y.items() if k not in BILANZSPALTEN}
               for y in zeilen]
    assert nachher == vorher, "ausserhalb von wins/losses/ties wurde etwas veraendert"
    assert (zeilen[0]["wins"], zeilen[1]["wins"]) == ("8", "8")
    assert zeilen[2]["wins"] == "13"


def test_nachtragen_geht_ueber_leere_felder_hinweg(modul):
    """Ein leeres Feld ist ein Ergebnis, kein Rest. Es wird nicht erneut
    angefasst — sonst verschleiert der naechste Lauf, wie viele Luecken
    wirklich offen sind."""
    zeilen = [{"tournament_id": "0071", "place": "999",
               "player_name": "Niemand", "wins": "", "losses": "", "ties": ""}]
    bil = _bilanzen(modul, [("0071", "999", "Niemand", (1, 2, 3))])
    z = modul.bilanzen_nachtragen(zeilen, bil)
    assert z["genullt"] == 0 and z["zeilen_geaendert"] == 0
    assert zeilen[0]["wins"] == ""


def test_der_schalter_ist_da_und_braucht_kein_netz():
    with open(QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    assert "--bilanzen-nachtragen" in quelle
    stelle = quelle.index("if args.bilanzen_nachtragen:")
    vor_kartendatenbank = quelle.index("card_db = CardDatabaseLookup()")
    assert stelle < vor_kartendatenbank, (
        "der Nachtrag-Lauf muss VOR der Kartendatenbank aussteigen — er "
        "braucht weder sie noch das Netz, und limitlesstcg.com ist im "
        "Pruefcontainer gesperrt")


def test_nachtragen_schreibt_atomar():
    with open(QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    block = quelle[quelle.index("def _schreibe_atomar("):
                   quelle.index("def _ist_genullt(")]
    assert "os.replace(" in block and "'.tmp'" in block, (
        "open(pfad, 'w') kuerzt die Datei vor dem Schreiben — ein Abbruch "
        "mittendrin hinterliesse eine halbe CSV, und der Commit-Schritt "
        "committet sie")


# ─────────────────────────────────────────────────────────────────────
# 6. Die Online-Seite — eigene Quelle, eigener Waechter
# ─────────────────────────────────────────────────────────────────────

def test_online_listen_tragen_ganz_ueberwiegend_eine_bilanz(online_listen):
    """WAS AM 10.09.2026 GEMESSEN WURDE

    Nach dem ersten Wochenlauf mit Online-Zeilen standen 663 von 1.319
    Online-Listen auf 0-0-0. Ursache war KEIN Datenloch: die
    Bilanzzelle traegt bei ausgestiegenen Spielern einen Vermerk

        <td class="secondary">6 - 2 - 0<span class="drop">drop</span></td>

    und `get_text(strip=True)` klebte daraus "6 - 2 - 0drop", was das
    anker-feste Muster ablehnte. Am lebenden Dokument nachgezaehlt
    (Amyverse PTCG Live Weekly #12, 6a98f8ef…): 100 von 155 Zeilen
    tragen den Vermerk; mit der Reparatur sind es 0 ohne Bilanz.

    Der Bestand heilt erst mit dem naechsten Lauf — deshalb steht hier
    eine Obergrenze und keine Null. Sinkt sie nach dem Lauf nicht
    deutlich, greift die Reparatur nicht.
    """
    if not online_listen:
        pytest.skip("keine Online-Zeilen im Bestand")
    genullt = [k for k, z in online_listen.items() if _ist_genullt(z)]
    anteil = len(genullt) / len(online_listen)
    assert anteil <= 0.55, (
        f"{len(genullt)} von {len(online_listen)} Online-Listen tragen "
        f"0-0-0 ({anteil * 100:.1f} %). Der Grundstand vor der Reparatur "
        f"war 50,3 % (663/1.319); mehr heisst, dass der Drop-Vermerk "
        f"wieder frisst oder ein neuer Vermerk dazugekommen ist.")


def test_online_listen_tragen_ueberhaupt_einen_platz(online_listen):
    """Der Platz ist die Zahl, an der die Gewichtung haengt — anders als
    die Bilanz darf er nicht fehlen."""
    if not online_listen:
        pytest.skip("keine Online-Zeilen im Bestand")
    ohne = [k for k in online_listen
            if not str(k[1]).strip().isdigit() or int(k[1]) < 1]
    assert ohne == [], ohne[:10]
