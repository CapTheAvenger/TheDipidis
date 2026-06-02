"""Tests for Past Meta brought-share aggregation.

These mirror the JS aggregator that Meta Call's new Past Meta source
runs in the browser. They lock in the share-derivation contract:

- Per archetype: sum total_decks_in_archetype across all distinct
  tournaments in the format chunk (deduped on (tournament_id, archetype)).
- Total field size: sum of those per-archetype counts.
- Per-archetype share %: 100 * count / total.

Test fixture: data/tournament_cards_data_cards_TEF-POR.csv.

These tests lock the aggregation CONTRACT (algorithm correctness) rather
than absolute snapshot counts — the TEF-POR chunk grows as the scraper
backfills more events, so exact-value asserts rot. Each test uses a
bounded range (or relative property) wide enough to absorb expected
data growth, narrow enough to flag a regression in the algorithm.
"""

import csv
import os
import re
from collections import defaultdict

import pytest


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEF_POR = os.path.join(REPO_ROOT, "data", "tournament_cards_data_cards_TEF-POR.csv")
SVI_PFL = os.path.join(REPO_ROOT, "data", "tournament_cards_data_cards_SVI-PFL.csv")

# Same regex js/app-deck-builder.js and the Meta Call past-meta loader
# use to strip price-tag suffixes (e.g. "Alakazam Dudunsparce20.09$13.60€"
# → "Alakazam Dudunsparce"). Some past-meta chunks carry these suffixes
# from a historical scraper bug; the aggregator must normalize them or
# the archetype count explodes.
_PRICE_TAG_RE = re.compile(r"\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$")


def _strip_price_tag(name):
    return _PRICE_TAG_RE.sub("", name or "").strip()


def _aggregate_past_meta_shares(csv_path):
    """Mirror of the JS aggregator. Returns dict[archetype] -> count."""
    arch_total = defaultdict(int)
    seen = set()
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for r in reader:
            arch_clean = _strip_price_tag(r["archetype"])
            if not arch_clean:
                continue
            key = (r["tournament_id"], arch_clean)
            if key in seen:
                continue
            seen.add(key)
            try:
                cnt = int(r["total_decks_in_archetype"] or 0)
            except (ValueError, TypeError):
                continue
            if cnt <= 0:
                continue
            arch_total[arch_clean] += cnt
    return dict(arch_total)


@pytest.fixture(scope="module")
def tef_por_shares():
    assert os.path.isfile(TEF_POR), f"TEF-POR fixture missing: {TEF_POR}"
    return _aggregate_past_meta_shares(TEF_POR)


def test_archetype_count(tef_por_shares):
    """Distinct archetypes in TEF-POR sits in a stable band — too few means
    the price-tag strip over-collapsed, too many means it under-collapsed."""
    n = len(tef_por_shares)
    assert 30 <= n <= 80, f"archetype count {n} outside expected band"


def test_total_field_size(tef_por_shares):
    """Sum of per-archetype decks for the Day-2-qualifying field. Grows as
    the scraper backfills more TEF-POR events; the band guards against
    aggregation bugs (double-count blowups or accidental row drops)."""
    total = sum(tef_por_shares.values())
    assert 1200 <= total <= 5000, f"total field {total} outside expected band"


def test_dragapult_lead_share(tef_por_shares):
    """Pure Dragapult is the largest single archetype of the TEF-POR meta."""
    ranked = sorted(tef_por_shares.items(), key=lambda x: -x[1])
    top_arch, top_count = ranked[0]
    assert top_arch == "Dragapult", f"expected Dragapult #1, got {top_arch}"
    total = sum(tef_por_shares.values())
    pct = 100 * top_count / total
    assert 10.0 <= pct <= 20.0, f"Dragapult share {pct:.2f}% outside expected band"


def test_dragapult_family_combined_share(tef_por_shares):
    """Dragapult variants combined account for the bulk of the field's
    Day-2 / cut representation. The cards-CSV the fixture reads from
    over-samples top-cut submissions (the labs Day-2 conversion data
    shows pure Dragapult at 29 %, family at 43 % within the cut), so
    this share is higher than the Day-1 brought share would suggest.

    The band is wide enough to absorb each new TEF-POR regional the
    scraper adds — Indianapolis pushed the family from ~37 % to
    ~38.8 %, and the next regional could nudge it past 40 % if pure
    Dragapult keeps consolidating into the cut.
    """
    total = sum(tef_por_shares.values())
    family = [
        "Dragapult",
        "Dragapult Dusknoir",
        "Dragapult Dudunsparce",
        "Dragapult Blaziken",
    ]
    family_total = sum(tef_por_shares.get(a, 0) for a in family)
    pct = 100 * family_total / total
    assert 34 <= pct <= 44, f"Dragapult family {pct:.2f}% out of range"


def test_top_archetypes_match_known_meta(tef_por_shares):
    """Top 10 archetypes by share match the known TEF-POR meta shape."""
    ranked = sorted(tef_por_shares.items(), key=lambda x: -x[1])
    top10 = [a for a, _ in ranked[:10]]
    expected_subset = {
        "Dragapult",
        "Raging Bolt Ogerpon",
        "Rocket's Mewtwo",
        "N's Zoroark",
        "Festival Lead",
    }
    missing = expected_subset - set(top10)
    assert not missing, f"Expected archetypes missing from top 10: {missing}"


def test_shares_sum_to_100(tef_por_shares):
    """Per-archetype shares must sum to exactly 100% (modulo float epsilon)."""
    total = sum(tef_por_shares.values())
    pct_sum = sum(100 * v / total for v in tef_por_shares.values())
    assert abs(pct_sum - 100.0) < 0.001


def test_no_negative_or_zero_counts(tef_por_shares):
    """Aggregator must drop 0/negative deck-counts (data hygiene)."""
    for arch, cnt in tef_por_shares.items():
        assert cnt > 0, f"{arch} has non-positive count {cnt}"


def test_strip_price_tag_basic():
    """Price-tag regex collapses suffix variants down to the bare archetype."""
    assert _strip_price_tag("Alakazam Dudunsparce20.09$13.60€") == "Alakazam Dudunsparce"
    assert _strip_price_tag("Charizard Pidgeot43.03$27.11€") == "Charizard Pidgeot"
    # Clean strings should pass through unchanged
    assert _strip_price_tag("Lucario Hariyama") == "Lucario Hariyama"
    assert _strip_price_tag("Dragapult") == "Dragapult"


@pytest.mark.skipif(not os.path.isfile(SVI_PFL), reason="SVI-PFL fixture missing")
def test_svi_pfl_price_tag_collapses_archetype_count():
    """SVI-PFL chunk has price-tag-polluted archetypes (~2200 distinct strings
    pre-clean). With the aggregator's strip, count must drop to a realistic
    meta size (well under 200 archetypes for a single rotation period).
    Locks the regression where the past-meta loader didn't strip tags."""
    shares = _aggregate_past_meta_shares(SVI_PFL)
    n = len(shares)
    assert n < 150, f"SVI-PFL archetype count {n} too high — price-tag strip broken?"
    assert n > 20, f"SVI-PFL archetype count {n} too low — over-collapsed?"


@pytest.mark.skipif(not os.path.isfile(SVI_PFL), reason="SVI-PFL fixture missing")
def test_svi_pfl_no_dollar_signs_in_keys():
    """After strip, no archetype name may contain $ or € (price-tag residue)."""
    shares = _aggregate_past_meta_shares(SVI_PFL)
    polluted = [a for a in shares if "$" in a or "€" in a]
    assert not polluted, f"Price-tag residue in {len(polluted)} archetype(s): {polluted[:3]}"
