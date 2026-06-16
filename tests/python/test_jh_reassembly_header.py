"""Regression test for the JH monolith reassembly crash.

A single chunk shipped with a stray trailing comma on its last column
("is_ace_spec,") made csv.DictWriter raise "dict contains fields not in
fieldnames", which aborted the JH scraper at startup — silently, so NO new
tournament (NAIC included) ever reached tournament_cards_data. The reassembly
must now normalize such headers instead of crashing.
"""

import csv
import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))
sys.path.insert(0, str(_REPO_ROOT / "backend" / "scrapers"))

import tournament_scraper_JH as jh  # noqa: E402


def _write(path, header, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(header + "\n")
        for r in rows:
            f.write(r + "\n")


def test_reassembly_survives_corrupted_header(tmp_path):
    d = str(tmp_path)
    _write(os.path.join(d, "tournament_cards_data_cards_AAA.csv"),
           "tournament_id;card_name;is_ace_spec", ["1;Pikachu;No"])
    # The corrupted chunk: trailing comma on the last column — the real bug.
    _write(os.path.join(d, "tournament_cards_data_cards_BBB.csv"),
           "tournament_id;card_name;is_ace_spec,", ["2;Raichu;Yes"])

    monolith = os.path.join(d, "tournament_cards_data_cards.csv")
    n = jh._reassemble_monolith_from_chunks(monolith, d)

    assert n == 2  # no crash — both rows written
    with open(monolith, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        fields = reader.fieldnames
        rows = list(reader)
    assert "is_ace_spec" in fields and "is_ace_spec," not in fields  # normalized
    assert {r["card_name"] for r in rows} == {"Pikachu", "Raichu"}
    # the corrupted chunk's value survived under the cleaned key
    raichu = next(r for r in rows if r["card_name"] == "Raichu")
    assert raichu["is_ace_spec"] == "Yes"


def test_reassembly_clean_headers_unchanged(tmp_path):
    d = str(tmp_path)
    _write(os.path.join(d, "tournament_cards_data_cards_AAA.csv"),
           "tournament_id;card_name;is_ace_spec", ["1;Pikachu;No", "1;Bolt;No"])
    monolith = os.path.join(d, "tournament_cards_data_cards.csv")
    assert jh._reassemble_monolith_from_chunks(monolith, d) == 2
