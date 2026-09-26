"""SC-3: der Deckname kommt aus der Standings-Zeile, nicht aus zwei Sprites.

Gemessen 26.09.2026: Basic Box stand mit 4,84 % auf der Ladder und fehlte in
data/online_tournament_top8_decks.csv ganz. Ursache: die Turnierzeile wurde
ueber ihr Sprite-Paar benannt, und ogerpon+clefairy gehoert in
data/archetype_icons.json zu "Clefairy Ogerpon", "Ogerpon Clefairy" UND
"Basic Box". Die 554 Antritte des Paares landeten unter "Clefairy Ogerpon"
(33 Ladder-Listen). Gleich bei ogerpon+hydrapple.

Live gemessen an play.limitlesstcg.com/tournament/6a9db100ab080c8c957fc12b/
standings: jede Zeile traegt `<a href=".../metagame/<deck-id>">` mit
`<span data-tooltip="<Deckname>">`. Der Aufbau unten ist dieser Zeile
nachgebaut (Namen und Pfade, keine fremden Inhalte).
"""
import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

ots = pytest.importorskip("online_tournament_scraper")
bs4 = pytest.importorskip("bs4")

ZEILE = """<table><tr data-placing="{platz}"><td>{platz}</td><td><a href="/tournament/t/player/p">P</a></td>
<td></td><td class="secondary">24</td><td class="secondary">6 - 2 - 0</td>
<td class="secondary">55.00%</td><td class="secondary">60.00%</td>
<td><a href="/tournament/t/metagame/{deck_id}"><span data-tooltip="{name}">{bilder}</span></a></td>
<td><a href="/tournament/t/player/p/decklist"></a></td></tr></table>"""

BILD = '<img class="pokemon" src="https://r2.limitlesstcg.net/pokemon/gen9/{slug}.png">'


def _zeile(name, deck_id, slugs, platz=1):
    html = ZEILE.format(platz=platz, deck_id=deck_id, name=name,
                        bilder="".join(BILD.format(slug=s) for s in slugs))
    return bs4.BeautifulSoup(html, "html.parser").find("tr")


@pytest.mark.parametrize("name,deck_id,slugs", [
    ("Basic Box", "basic-box-m", ["ogerpon", "clefairy"]),
    ("Clefairy Ogerpon", "clefairy-ogerpon", ["clefairy", "ogerpon"]),
    ("Ogerpon Meganium Hydrapple", "ogerpon-meganium-hydrapple", ["ogerpon", "hydrapple"]),
    ("Dhelmise", "dhelmise-pbl", ["dhelmise", "banette"]),
])
def test_der_name_der_seite_gewinnt(name, deck_id, slugs):
    assert ots._archetype_from_row(_zeile(name, deck_id, slugs)) == name


def test_gleiches_sprite_paar_zwei_decks_bleiben_getrennt():
    """Genau der Befund: dasselbe Paar, zwei Decks — zwei Namen."""
    a = ots._archetype_from_row(_zeile("Basic Box", "basic-box-m", ["ogerpon", "clefairy"]))
    b = ots._archetype_from_row(_zeile("Clefairy Ogerpon", "clefairy-ogerpon", ["ogerpon", "clefairy"]))
    assert a != b


def test_ohne_decknamen_rechnet_der_aufrufer_aus_den_sprites():
    html = ('<table><tr><td>3</td><td></td><td></td><td>1</td>'
            '<td><img class="pokemon" src="https://r2.limitlesstcg.net/pokemon/gen9/dragapult.png"></td></tr></table>')
    zeile = bs4.BeautifulSoup(html, "html.parser").find("tr")
    assert ots._archetype_from_row(zeile) == ""
    assert ots._slugs_from_row(zeile) == ["dragapult"]


def test_fetch_standings_nimmt_den_namen_der_seite(monkeypatch):
    """Verhalten, nicht Schreibweise: _fetch_standings wird ausgefuehrt."""
    html = ("<table><tr><th>#</th></tr>"
            + str(_zeile("Basic Box", "basic-box-m", ["ogerpon", "clefairy"], platz=1))
            + str(_zeile("Clefairy Ogerpon", "clefairy-ogerpon", ["ogerpon", "clefairy"], platz=2))
            + "</table>")
    monkeypatch.setattr(ots, "fetch_page_bs4", lambda url: bs4.BeautifulSoup(html, "html.parser"))
    zeilen = ots._fetch_standings("t")
    assert [z["archetype"] for z in zeilen] == ["Basic Box", "Clefairy Ogerpon"]
    assert [z["placement"] for z in zeilen] == [1, 2]
