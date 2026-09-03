"""Tests for the labs.limitlesstcg.com per-archetype matchup parser.

The parser was built defensively from screenshots — the live HTML
hasn't been fetched from the sandbox env (Cloudflare 403 confirmed).
These tests run against a synthetic fixture matching the structure
visible in the user's 2026-05-24 screenshots. First real-scrape run
is the validation step; if the live HTML diverges, defensive
selectors should still parse + we tighten the fixture afterwards.
"""

import os
import sys
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

bs4 = pytest.importorskip("bs4")
labs_scraper = pytest.importorskip("labs_tournament_scraper")

FIXTURE_PATH = os.path.join(REPO_ROOT, "tests", "python", "fixtures",
                            "labs_archetype_matchup_dragapult.html")


@pytest.fixture(scope="module")
def soup():
    assert os.path.isfile(FIXTURE_PATH), f"Fixture missing: {FIXTURE_PATH}"
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return bs4.BeautifulSoup(f.read(), "lxml")


def test_player_summary_parses_screenshot_numbers(soup):
    """Header: 738 players: 2891 wins - 2447 losses - 1004 ties (50.86% WR)"""
    summary = labs_scraper._parse_player_summary(soup)
    assert summary["player_count"] == 738
    assert summary["total_wins"] == 2891
    assert summary["total_losses"] == 2447
    assert summary["total_ties"] == 1004
    assert abs(summary["overall_win_pct"] - 50.86) < 0.01


def test_player_summary_handles_missing_soup():
    assert labs_scraper._parse_player_summary(None) == {
        "player_count": 0,
        "total_wins": 0,
        "total_losses": 0,
        "total_ties": 0,
        "overall_win_pct": 0.0,
    }


# NACHGEBAUTER PARSER ENTFERNT (03.09.2026).
#
# Hier stand eine Kopie des Parsers: derselbe Ablauf, noch einmal
# abgetippt. Ein Test, der eine Kopie prueft, bleibt gruen, waehrend der
# ausgelieferte Code bricht — und genau das ist hier passiert, als der
# echte Parser eine Bilanzspalte dazubekam und diese Datei nichts davon
# mitbekam.
#
# Das Parsen ist deshalb aus scrape_archetype_matchups() herausgeloest
# (es stand hinter einem Netzaufruf, weshalb der Test es ueberhaupt
# nachbauen musste). Ab jetzt ruft der Test dieselbe Funktion auf, die
# auch der Wochenlauf benutzt.


@pytest.fixture(scope="module")
def parsed(soup):
    return labs_scraper.parse_matchup_table(soup)


def test_matchup_row_count(parsed):
    """Fixture has 6 opponent rows."""
    assert len(parsed["matchups"]) == 6


def test_first_matchup_is_dragapult_dusknoir(parsed):
    """Top row matches the screenshot's 456 / 58.92%."""
    first = parsed["matchups"][0]
    assert first["opponent_name"] == "Dragapult Dusknoir"
    assert first["opponent_slug"] == "dragapult-dusknoir"
    assert first["vs_count"] == 456
    assert abs(first["vs_win_pct"] - 58.92) < 0.01


def test_all_matchups_have_required_fields(parsed):
    for m in parsed["matchups"]:
        assert m["opponent_name"], "opponent_name must be non-empty"
        assert m["opponent_slug"], "opponent_slug must be non-empty"
        assert m["vs_count"] > 0, f"{m['opponent_name']} has zero count"
        assert 0.0 <= m["vs_win_pct"] <= 100.0, f"{m['opponent_name']} win % out of range"


def test_lucario_hariyama_matchup_data(parsed):
    """Sanity check on a non-Dragapult opponent row."""
    luc = next((m for m in parsed["matchups"] if m["opponent_slug"] == "lucario-hariyama"), None)
    assert luc is not None
    assert luc["vs_count"] == 238
    assert abs(luc["vs_win_pct"] - 55.18) < 0.01


def test_build_matchup_rows_produces_full_csv_shape():
    """End-to-end: meta + slug + matchups_result → CSV-ready rows.

    Schema shifted with the 2026-05-25 URL fix: matchups are now keyed by
    (meta, deck_slug) — aggregated across all tournaments_used by the
    labs combined view — instead of per-(tid, slug). The row carries
    `tournaments_used` (provenance) + `tournament_count` (convenience)
    instead of the old per-tournament fields."""
    matchups_result = {
        "summary": {
            "player_count": 1598,
            "total_wins": 5417,
            "total_losses": 5534,
            "total_ties": 1802,
            "overall_win_pct": 47.19,
        },
        "matchups": [
            {"opponent_slug": "ns-zoroark", "opponent_name": "N's Zoroark",
             "vs_count": 1224, "vs_win_pct": 42.84},
        ],
        "day_filter": "overall",
        "tournaments_used": ["56", "57", "58", "59", "60", "61"],
    }
    rows = labs_scraper.build_matchup_rows(
        "SVI-ASC", "dragapult-dusknoir", "Dragapult Dusknoir", matchups_result,
    )
    assert len(rows) == 1
    r = rows[0]
    # All CSV header fields except `scraped_at` (which is timestamp-derived)
    # should be present on the row.
    assert set(r.keys()) >= set(labs_scraper.MATCHUP_CSV_HEADER) - {"scraped_at"}
    assert r["meta"] == "SVI-ASC"
    assert r["tournaments_used"] == "56,57,58,59,60,61"
    assert r["tournament_count"] == 6
    assert r["my_deck_slug"] == "dragapult-dusknoir"
    assert r["my_deck_name"] == "Dragapult Dusknoir"
    assert r["my_deck_player_count"] == 1598
    assert r["opponent_deck_slug"] == "ns-zoroark"
    assert r["opponent_deck_name"] == "N's Zoroark"
    assert r["vs_count"] == 1224
    assert abs(r["vs_win_pct"] - 42.84) < 0.01
    assert r["day_filter"] == "overall"


def test_scrape_archetype_matchups_url_format(monkeypatch):
    """Regression: the URL pattern must be
    `/decks/{slug}?tournaments={unpadded_tids_csv}` (the combined-view
    page), NOT the old `/{tid}/decks/{slug}` (which returns players, not
    matchups — see PR #205). Tids must be unpadded ints, sorted."""
    captured_url = {}

    def fake_fetch(url):
        captured_url["url"] = url
        return None  # short-circuit — we just want the URL build

    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", fake_fetch)
    labs_scraper.scrape_archetype_matchups(
        "dragapult-dusknoir", ["0061", "0060", "0059", "0058", "0057", "0056"],
    )
    assert captured_url["url"] == (
        "https://labs.limitlesstcg.com/decks/dragapult-dusknoir"
        "?tournaments=56,57,58,59,60,61"
    )


def test_scrape_archetype_matchups_day_filter_url(monkeypatch):
    """Day filter appends a query flag — user-confirmed `&d2` for Day 2
    (2026-05-25), `&d1` inferred. Overall stays unflagged."""
    captured = {}

    def fake_fetch(url):
        captured.setdefault("urls", []).append(url)
        return None

    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", fake_fetch)

    base = "https://labs.limitlesstcg.com/decks/dragapult-dusknoir?tournaments=56,57,58,59,60,61"
    tids = ["56", "57", "58", "59", "60", "61"]

    labs_scraper.scrape_archetype_matchups("dragapult-dusknoir", tids, day_filter="overall")
    labs_scraper.scrape_archetype_matchups("dragapult-dusknoir", tids, day_filter="day1")
    labs_scraper.scrape_archetype_matchups("dragapult-dusknoir", tids, day_filter="day2")

    assert captured["urls"] == [
        base,
        base + "&d1",
        base + "&d2",
    ]


def test_scrape_archetype_matchups_empty_tid_list(monkeypatch):
    """Empty / all-invalid tids → no fetch, empty result with safe defaults."""
    called = {"fetch": 0}

    def fake_fetch(url):
        called["fetch"] += 1
        return None

    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", fake_fetch)
    result = labs_scraper.scrape_archetype_matchups("dragapult-dusknoir", [])
    assert called["fetch"] == 0
    assert result["matchups"] == []
    assert result["tournaments_used"] == []


# ── Bilanz je Paarung (Befund 03.09.2026) ────────────────────────────
#
# ANLASS: die Oberflaeche zeigte in der Major-Spalte MATCHPUNKTE, wo sie
# eine Win Rate zeigen wollte — weil wir je Paarung nur Anzahl und
# Prozent geholt haben und aus einer Prozentzahl ohne Bilanz keine
# andere Groesse zu rechnen ist.
#
# Dass labs' "Win %" keine Win Rate ist, laesst sich an der Bilanz
# nachrechnen, die auf derselben Seite steht. Drei Paarungen des
# Worlds-Laufs, jedes Mal auf zwei Nachkommastellen exakt die
# Matchpunkte (3S + U) / (3M) und NICHT S/M:
#
#     17-2-1    86,67 %   (S/M waere 85,00)
#     17-5-2    73,61 %   (S/M waere 70,83)
#     34-50-22  38,99 %   (S/M waere 32,08)
#
# Genau diese drei Zeilen stehen in der Vorlage. Damit haelt der Test
# nicht nur den Parser fest, sondern auch den Befund selbst: geht die
# Bilanz verloren, faellt auf, WARUM sie gebraucht wird.

FIXTURE_BILANZ = os.path.join(REPO_ROOT, "tests", "python", "fixtures",
                              "labs_archetype_matchup_mit_bilanz.html")


@pytest.fixture(scope="module")
def soup_bilanz():
    assert os.path.isfile(FIXTURE_BILANZ), f"Vorlage fehlt: {FIXTURE_BILANZ}"
    with open(FIXTURE_BILANZ, encoding="utf-8") as f:
        return bs4.BeautifulSoup(f.read(), "lxml")


@pytest.fixture(scope="module")
def parsed_bilanz(soup_bilanz):
    return labs_scraper.parse_matchup_table(soup_bilanz)


def test_bilanz_wird_gelesen(parsed_bilanz):
    m = {x["opponent_name"]: x for x in parsed_bilanz["matchups"]}
    assert set(m) == {"Mega Excadrill", "Slowking", "Dragapult"}, list(m)
    assert (m["Mega Excadrill"]["vs_wins"], m["Mega Excadrill"]["vs_losses"],
            m["Mega Excadrill"]["vs_ties"]) == (17, 2, 1)
    assert (m["Dragapult"]["vs_wins"], m["Dragapult"]["vs_losses"],
            m["Dragapult"]["vs_ties"]) == (34, 50, 22)


def test_die_bilanz_frisst_nicht_die_partienzahl(parsed_bilanz):
    """Die Bilanz steht VOR der Prozentspalte und beginnt mit einer Zahl.
    Wird sie nicht als Ganzes erkannt, landet ihre erste Zahl in
    vs_count — dann stimmt die Partienzahl nicht mehr."""
    m = {x["opponent_name"]: x for x in parsed_bilanz["matchups"]}
    assert m["Mega Excadrill"]["vs_count"] == 20, "17 statt 20 heisst: Bilanz als Anzahl gelesen"
    assert m["Slowking"]["vs_count"] == 24
    assert m["Dragapult"]["vs_count"] == 106


def test_win_pct_bleibt_die_zahl_der_quelle(parsed_bilanz):
    m = {x["opponent_name"]: x for x in parsed_bilanz["matchups"]}
    assert abs(m["Mega Excadrill"]["vs_win_pct"] - 86.67) < 0.01
    assert abs(m["Dragapult"]["vs_win_pct"] - 38.99) < 0.01


def test_die_quelle_meint_matchpunkte_nicht_win_rate(parsed_bilanz):
    """Der eigentliche Befund, als Rechnung festgehalten: labs' 'Win %'
    trifft (3S+U)/3M und nicht S/M. Sollte die Quelle das eines Tages
    umstellen, faellt es hier auf — und die Oberflaeche muss dann nicht
    mehr selbst rechnen."""
    for x in parsed_bilanz["matchups"]:
        s, n, u = x["vs_wins"], x["vs_losses"], x["vs_ties"]
        m = x["vs_count"]
        matchpunkte = (3 * s + u) / (3 * m) * 100
        winrate = s / m * 100
        assert abs(x["vs_win_pct"] - matchpunkte) < 0.02, (
            f"{x['opponent_name']}: {x['vs_win_pct']} trifft nicht die "
            f"Matchpunkte {matchpunkte:.2f}")
        assert abs(x["vs_win_pct"] - winrate) > 0.5, (
            f"{x['opponent_name']}: Quelle sieht plötzlich wie S/M aus — "
            f"dann ist der Umbau vom 03.09.2026 zu pruefen")


def test_ohne_bilanzspalte_bleibt_es_leer(parsed):
    """Die aeltere Seitenform ohne Record-Spalte muss weiter durchgehen —
    dann steht die Bilanz auf None und die Oberflaeche faellt auf die
    Matchpunkte zurueck, statt eine 0-Bilanz zu erfinden."""
    for x in parsed["matchups"]:
        assert x.get("vs_wins") is None, x
        assert x["vs_count"] > 0


def test_bilanz_wird_auch_vor_der_zaehlung_erkannt():
    """Die Reihenfolge der Spalten ist die der Quelle, nicht unsere.

    Dieser Test ist aus einer widerlegten Behauptung entstanden. Im Code
    stand, die Bilanz muesse VOR der Partienzahl geprueft werden, sonst
    werde ihre erste Zahl als Partienzahl gelesen. Die Mutation dazu —
    Pruefung ans Ende verschoben — blieb gruen. Grund:
    _parse_int_count('17 - 2 - 1') gibt 0 zurueck, weil die bereinigte
    Zeichenkette nicht aus lauter Ziffern besteht.

    Die Begruendung war also falsch, die Unabhaengigkeit von der
    Spaltenreihenfolge aber echt — und ungeprueft. Genau die sichert
    dieser Test jetzt zu: taeuscht die Quelle die Spalten um, bleiben
    Partienzahl und Bilanz richtig zugeordnet.
    """
    html = """
    <table class="data-table">
      <thead><tr><th></th><th>Deck</th><th>Record</th><th>#</th><th>Win %</th></tr></thead>
      <tbody>
        <tr>
          <td></td>
          <td><a href="/decks/mega-excadrill">Mega Excadrill</a></td>
          <td>17 - 2 - 1</td>
          <td>20</td>
          <td>86.67%</td>
        </tr>
      </tbody>
    </table>"""
    s = bs4.BeautifulSoup(html, "lxml")
    m = labs_scraper.parse_matchup_table(s)["matchups"]
    assert len(m) == 1, m
    assert m[0]["vs_count"] == 20, (
        f"vs_count={m[0]['vs_count']} — die Bilanz wurde als Partienzahl gelesen")
    assert (m[0]["vs_wins"], m[0]["vs_losses"], m[0]["vs_ties"]) == (17, 2, 1)
    assert abs(m[0]["vs_win_pct"] - 86.67) < 0.01
