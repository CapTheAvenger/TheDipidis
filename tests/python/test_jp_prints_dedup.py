"""Tests for the "EN beats JP" card dedup:
parse_prints_table (capture JP print links) + the merge suppression.
"""

import sys
from pathlib import Path

from bs4 import BeautifulSoup

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))
sys.path.insert(0, str(_REPO_ROOT / "backend" / "scrapers"))

import all_cards_scraper as acs  # noqa: E402

# Real card-prints HTML from limitlesstcg.com/cards/CRI/1 (maintainer-provided).
SAMPLE = """
<div class="card-prints">
  <table class="card-prints-versions"><tbody>
    <tr><th>Int. Prints</th><th>USD</th><th>EUR</th></tr>
    <tr class="current">
      <td><a>Chaos Rising <span class="prints-table-card-number">#1</span></a></td>
      <td><a class="card-price usd" href="https://tcgplayer/x">$0.10</a></td>
      <td><a class="card-price eur" href="https://www.cardmarket.com/en/Pokemon/Singles/Weedle-CRI001">0.04€</a></td>
    </tr>
    <tr><th colspan="3">JP. Prints</th></tr>
    <tr><td colspan="3"><a href="/cards/jp/M4/1">Ninja Spinner <span class="prints-table-card-number">#1</span></a></td></tr>
  </tbody></table>
</div>
"""


def _table(html):
    return BeautifulSoup(html, "lxml").select_one("table.card-prints-versions") \
        or BeautifulSoup(html, "lxml").select_one("table")


def test_jp_print_is_captured():
    intl, jp, cm = acs.parse_prints_table(
        BeautifulSoup(SAMPLE, "lxml").select_one("table.card-prints-versions"))
    assert jp == {"M4-1"}                       # CRI-1's JP counterpart
    assert all("JP" not in x for x in intl)     # JP never leaks into international
    assert "cardmarket.com" in cm               # EUR link from current row


def test_international_reprint_is_not_jp():
    intl, jp, _ = acs.parse_prints_table(_table(
        '<table class="card-prints-versions"><tr><td><a href="/cards/POR/81">x</a></td></tr></table>'))
    assert "POR-81" in intl
    assert jp == set()


def test_empty_table_is_safe():
    assert acs.parse_prints_table(None) == (set(), set(), "")


def test_en_beats_jp_suppression():
    # Mirrors prepare_card_data.create_merged_database's merge filter.
    english = [{"set": "CRI", "number": "1", "jp_prints": "M4-1"}]
    japanese = [
        {"set": "M4", "number": "1"},    # superseded — EN CRI-1 exists
        {"set": "M5", "number": "23"},   # genuinely JP-only — keep
    ]
    en_keys = {f"{c['set']}_{c['number']}" for c in english}
    superseded = set()
    for c in english:
        for tok in (c.get("jp_prints") or "").split(","):
            if tok.strip():
                superseded.add(tok.strip().upper())
    jp_to_add = [
        c for c in japanese
        if f"{c['set']}_{c['number']}" not in en_keys
        and f"{c['set'].upper()}-{c['number']}" not in superseded
    ]
    kept = {(c["set"], c["number"]) for c in jp_to_add}
    assert ("M4", "1") not in kept    # suppressed: international version exists
    assert ("M5", "23") in kept       # kept: no EN counterpart yet
