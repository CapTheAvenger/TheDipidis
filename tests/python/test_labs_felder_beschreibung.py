"""Zwei Zahlen, ein Name — und drei Spalten, die keine Messung sind.

BEFUND A (07.09.2026): `total_players` heisst wie die Teilnehmerzahl,
ist aber die Summe der Decktabelle. An der Quelle gemessen:

    Turnier   Kopf der Quelle   Decksumme   labs_tournament_decks.csv
    0067          499 players        485        total_players = 485
    0068         1974 players       1970        total_players = 1970
    0069         2033 players       2032        total_players = 2032
    0070         3752 players       3743        total_players = 3743

Und nachgerechnet am ganzen Bestand: `total_players` ist in ALLEN 71
Turnieren exakt die Summe der Spalte `player_count`, und `share_pct` ist
in allen 4.713 Zeilen `player_count / total_players * 100`. Die Quelle
rechnet ihre Anteile genauso: 749/3743 = 20,01 %, was labs anzeigt —
749/3752 waeren 19,96 %.

Das ist kein Datenfehler. Es ist eine Namensfalle: wer `total_players`
fuer die Anwesenheit haelt, unterschaetzt sie um 1 bis 40 Spieler.
Die Anwesenheit steht woanders — in `tournament_cards_data_overview.csv`
(Spalte `players`) und in `player_continuity.csv`.

BEFUND B (07.09.2026): `top8_conv_rate`, `top16_conv_rate` und
`top32_conv_rate` stehen in allen 4.713 Zeilen auf 0.0. Das ist keine
gemessene Null — die Quelle fuehrt diese Spalte nicht mehr (siehe
`_CONV_HEADER_KEYS` in labs_tournament_scraper.py). Eine 0.0, die
"nicht erhebbar" bedeutet, sieht aus wie "gemessen: keine".

Keiner der beiden Befunde rechtfertigt es, Werte zu aendern. Beide
rechtfertigen, sie zu beschriften. Diese Suite haelt die Beschriftung
an den Daten fest.
"""

import csv
import collections
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
LABS = os.path.join(DATEN, "labs_tournament_decks.csv")
BESCHREIBUNG = os.path.join(DATEN, "labs_tournament_decks.felder.md")
OVERVIEW = os.path.join(DATEN, "tournament_cards_data_overview.csv")

# Frueher "nicht befuellbar"; seit 09.09.2026 aus den Platzierungen
# gerechnet, wo es welche gibt, und sonst leer. Der Name bleibt,
# damit die Stellen, die ihn nennen, auffindbar bleiben.
NICHT_BEFUELLBAR = ("top8_conv_rate", "top16_conv_rate", "top32_conv_rate")


@pytest.fixture(scope="module")
def zeilen():
    with open(LABS, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def kopf(zeilen):
    return list(zeilen[0].keys())


@pytest.fixture(scope="module")
def beschreibung():
    assert os.path.exists(BESCHREIBUNG), (
        "data/labs_tournament_decks.felder.md fehlt — ohne sie steht "
        "total_players unbeschriftet neben einer gleichnamigen, anderen Zahl")
    with open(BESCHREIBUNG, encoding="utf-8") as f:
        return f.read()


# ── Befund A: was total_players wirklich ist ─────────────────────────────────

def test_total_players_ist_die_decksumme(zeilen):
    """Die Invariante, die den Namen widerlegt. Gilt sie nicht mehr, hat
    die Spalte ihre Bedeutung gewechselt — und die Beschreibung luegt."""
    summe = collections.defaultdict(int)
    gefuehrt = {}
    for r in zeilen:
        t = r["tournament_id"]
        summe[t] += int(r["player_count"] or 0)
        gefuehrt[t] = int(r["total_players"] or 0)
    abweichend = {t: (gefuehrt[t], summe[t])
                  for t in gefuehrt if gefuehrt[t] != summe[t]}
    assert not abweichend, (
        "total_players ist nicht mehr die Summe von player_count: " + str(abweichend))
    assert len(gefuehrt) >= 71, f"nur {len(gefuehrt)} Turniere — Bestand geschrumpft?"


def test_share_pct_rechnet_auf_die_decksumme(zeilen):
    """Der zweite Beleg: die Anteile haengen an total_players, nicht an
    der Anwesenheit. Genau deshalb darf man die Zahl nicht austauschen."""
    daneben = []
    for r in zeilen:
        n = int(r["total_players"] or 0)
        if not n:
            continue
        erwartet = round(int(r["player_count"] or 0) / n * 100, 2)
        if abs(float(r["share_pct"]) - erwartet) > 0.02:
            daneben.append((r["tournament_id"], r["deck_slug"], r["share_pct"], erwartet))
    assert not daneben, f"{len(daneben)} Zeile(n) mit anderer Anteilsbasis: {daneben[:5]}"


def test_die_anwesenheit_liegt_hoeher_und_steht_woanders():
    """Waeren beide Zahlen gleich, gaebe es die Falle nicht. Sie sind es
    nicht: gemessen ueber alle zugeordneten Turniere liegt die
    Anwesenheit fast immer ueber der Decksumme."""
    anwesend = {}
    with open(OVERVIEW, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            lt = (r.get("labs_tournament_id") or "").strip()
            if lt and (r.get("players") or "").strip().isdigit():
                anwesend[lt] = int(r["players"])
    decksumme = {}
    with open(LABS, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            decksumme[r["tournament_id"]] = int(r["total_players"] or 0)

    gemeinsam = sorted(set(anwesend) & set(decksumme))
    assert len(gemeinsam) >= 60, f"nur {len(gemeinsam)} Turniere zugeordnet"
    kleiner = [t for t in gemeinsam if decksumme[t] < anwesend[t]]
    groesser = [t for t in gemeinsam if decksumme[t] > anwesend[t]]
    assert not groesser, (
        "die Decksumme liegt ueber der Anwesenheit — das kann nicht sein: "
        + str(groesser))
    # GEAENDERT 30.09.2026 (WZ-22): hier stand `len(kleiner) >= 50` — rot,
    # sobald die Daten BESSER werden (nachgereichte Decklisten schliessen
    # die Luecke). Die Beschreibung sagt "fast immer hoeher"; das ist die
    # Mehrheit, nicht eine Zahl. Gemessen 30.09.2026: 66 von 69.
    assert len(kleiner) > len(gemeinsam) / 2, (
        f"nur noch {len(kleiner)} von {len(gemeinsam)} Turnieren haben eine "
        "kleinere Decksumme — dann ist diese Beschreibung erklaerungsbeduerftig, "
        "nicht der Bestand")
    # Die vier vom Nutzer an der Quelle gemessenen Paare. Die Anwesenheit
    # ist der Kopf der Turnierseite und steht fest; die Decksumme darf
    # WACHSEN, wenn der Labs-Scraper nachgereichte Listen holt (Wiedervorlage),
    # aber nie ueber die Anwesenheit und nie unter den gemessenen Stand.
    for tid, kopf_der_quelle, deck in (("0067", 499, 485), ("0068", 1974, 1970),
                                       ("0069", 2033, 2032), ("0070", 3752, 3743)):
        assert anwesend[tid] == kopf_der_quelle, (tid, anwesend[tid])
        assert deck <= decksumme[tid] <= kopf_der_quelle, (tid, decksumme[tid])


# ── Befund B: die Spalten, die keine Messung sind ────────────────────────────

def test_die_conv_rate_spalten_tragen_keine_unechte_null(zeilen):
    """Frueher stand hier: „die Spalten sind ueberall 0.0".

    Am 09.09.2026 hat dieser Test genau das getan, wofuer er gebaut war
    — er ist umgefallen, als scripts/fuelle_conv_rate.py die Spalten aus
    den Platzierungen zu fuellen begann, und hat die Ruecknahme der
    Kennzeichnung erzwungen. Die Beschreibung in der felder.md ist
    entsprechend umgeschrieben.

    Was er JETZT haelt, ist die eigentliche Aussage dahinter: es darf
    keine unechte Null mehr geben. Eine Zeile traegt entweder einen
    gerechneten Wert oder gar nichts. „0.0" ist nur zulaessig, wo
    wirklich gemessen wurde, dass kein Spieler dieses Decks den Cut
    erreicht hat — also nur in Turnieren mit Platzierungen.
    """
    mit_plaetzen = _turniere_mit_platzierungen()
    assert mit_plaetzen, "keine Platzierungsdaten gefunden"
    for spalte in NICHT_BEFUELLBAR:
        for r in zeilen:
            wert = r[spalte].strip()
            if r["tournament_id"] in mit_plaetzen:
                assert wert != "", (
                    f"{spalte} ist leer, obwohl fuer Turnier "
                    f"{r['tournament_id']} Platzierungen vorliegen")
                float(wert)   # muss eine Zahl sein
            else:
                assert wert == "", (
                    f"{spalte} traegt {wert!r} fuer Turnier "
                    f"{r['tournament_id']}, fuer das es keine "
                    f"Platzierungen gibt — das waere eine erfundene Zahl")


def test_die_conv_rate_stimmt_mit_den_platzierungen_ueberein(zeilen):
    """Gegenprobe gegen die zweite Datei, nicht gegen sich selbst.

    Wo labs `top8_count` selbst fuehrt, muss die Rate genau
    top8_count / player_count sein. Faellt das um, ist die Zuordnung
    zwischen den beiden Dateien kaputt — und die Rate waere eine Zahl
    ohne Deckung.
    """
    geprueft = 0
    for r in zeilen:
        roh = r.get("top8_count", "").strip()
        rate = r["top8_conv_rate"].strip()
        n = r.get("player_count", "").strip()
        if not roh or not rate or not n or float(n) == 0:
            continue
        erwartet = float(roh) / float(n)
        assert abs(erwartet - float(rate)) < 1e-6, (
            f"{r['tournament_id']}/{r['deck_slug']}: top8_count={roh} von "
            f"{n} ergibt {erwartet:.6f}, in der Datei steht {rate}")
        geprueft += 1
    assert geprueft >= 500, (
        f"nur {geprueft} Zeilen gegengeprueft — zu wenige, um etwas zu "
        f"sichern")


def test_jede_gefuellte_rate_folgt_den_platzierungen(zeilen):
    """Die harte Gegenprobe: JEDE gefuellte Zelle gegen die Plaetze.

    Die Probe oben deckt nur Zeilen ab, in denen labs `top8_count`
    selbst fuehrt — das sind 10 der 12 Turniere. Beim Mutationstest am
    09.09.2026 blieb sie deshalb gruen, als in den Turnieren 0060/0061
    eine Rate verfaelscht wurde. Diese hier rechnet alle drei Spalten
    aus player_continuity.csv nach, ohne Ausnahme.
    """
    import csv as _csv
    treffer = {}
    with open(os.path.join(DATEN, "player_continuity.csv"), encoding="utf-8") as f:
        for z in _csv.DictReader(f):
            slug = (z.get("deck_slug") or "").strip()
            platz = (z.get("place") or "").strip()
            if not slug or not platz:
                continue
            try:
                p = int(platz)
            except ValueError:
                continue
            k = ((z.get("tournament_id") or "").strip(), slug)
            e = treffer.setdefault(k, {8: 0, 16: 0, 32: 0})
            for g in (8, 16, 32):
                if p <= g:
                    e[g] += 1

    geprueft, abweichend = 0, []
    for r in zeilen:
        n = (r.get("player_count") or "").strip()
        if not n or float(n) == 0:
            continue
        k = (r["tournament_id"].strip(), r["deck_slug"].strip())
        for spalte, grenze in (("top8_conv_rate", 8), ("top16_conv_rate", 16),
                               ("top32_conv_rate", 32)):
            wert = r[spalte].strip()
            if not wert:
                continue
            erwartet = treffer.get(k, {8: 0, 16: 0, 32: 0})[grenze] / float(n)
            if abs(erwartet - float(wert)) > 1e-6:
                abweichend.append(f"{k[0]}/{k[1]} {spalte}: "
                                  f"erwartet {erwartet:.6f}, steht {wert}")
            geprueft += 1
    assert not abweichend, ("Raten ohne Deckung in den Platzierungen: "
                            + "; ".join(abweichend[:6]))
    assert geprueft >= 2000, (
        f"nur {geprueft} Zellen gegengeprueft — zu wenige")


def _turniere_mit_platzierungen():
    """Turnier-IDs, fuer die player_continuity.csv Plaetze fuehrt."""
    import csv as _csv
    pfad = os.path.join(DATEN, "player_continuity.csv")
    aus = set()
    with open(pfad, encoding="utf-8") as f:
        for z in _csv.DictReader(f):
            if (z.get("place") or "").strip() and (z.get("deck_slug") or "").strip():
                aus.add((z.get("tournament_id") or "").strip())
    return aus


def test_die_platzierungszaehler_sind_erst_ab_0062_erhoben(zeilen):
    """Leer heisst hier "nicht erhoben" und ist damit ehrlich — anders
    als die 0.0 daneben. Der Schnitt liegt sauber zwischen zwei
    Turnieren, nicht mitten in einem."""
    gefuellt, leer = set(), set()
    for r in zeilen:
        (leer if r["top1_count"].strip() == "" else gefuellt).add(r["tournament_id"])
    assert not (gefuellt & leer), (
        "ein Turnier ist halb gefuellt: " + str(sorted(gefuellt & leer)))
    assert min(gefuellt) == "0062", f"Schnitt liegt bei {min(gefuellt)}"
    assert max(leer) == "0061", f"Schnitt liegt bei {max(leer)}"


# ── Die Beschriftung ─────────────────────────────────────────────────────────

def test_jede_spalte_ist_beschrieben(beschreibung, kopf):
    fehlend = [s for s in kopf if f"`{s}`" not in beschreibung]
    assert not fehlend, f"unbeschriebene Spalte(n): {fehlend}"


def test_total_players_ist_als_decksumme_beschrieben(beschreibung):
    absatz = beschreibung.split("`total_players`", 1)[1][:1400]
    assert "player_count" in absatz, (
        "die Beschreibung von total_players nennt nicht, dass es die Summe "
        "von player_count ist")
    assert "3743" in absatz and "3752" in absatz, (
        "die Beschreibung nennt das gemessene Zahlenpaar nicht — ohne Beleg "
        "ist sie eine Behauptung")
    for quelle in ("tournament_cards_data_overview.csv", "player_continuity.csv"):
        assert quelle in beschreibung, (
            f"die Beschreibung sagt nicht, wo die Anwesenheit steht ({quelle})")


def test_die_nicht_befuellbaren_spalten_sind_so_gekennzeichnet(beschreibung):
    for spalte in NICHT_BEFUELLBAR:
        absatz = beschreibung.split(f"`{spalte}`", 1)[1][:600]
        assert "nicht befuellbar" in absatz.lower() or "nicht befüllbar" in absatz.lower(), (
            f"{spalte} ist nicht als nicht befuellbar gekennzeichnet")


def test_der_scraper_verweist_auf_die_beschreibung():
    """Wer die Spaltenliste aendert, soll ueber die Beschreibung stolpern."""
    quelle = os.path.join(WURZEL, "backend", "scrapers", "labs_tournament_scraper.py")
    with open(quelle, encoding="utf-8-sig") as f:
        text = f.read()
    assert "labs_tournament_decks.felder.md" in text, (
        "labs_tournament_scraper.py verweist nicht auf die Feldbeschreibung")
