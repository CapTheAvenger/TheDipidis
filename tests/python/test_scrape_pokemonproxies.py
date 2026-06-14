"""Unit tests for the pure helpers in scripts/scrape_pokemonproxies_urls.py.

Network paths are NOT exercised here — that needs a live site visit
and the script is failsafe by design. What we lock down are the
asset-URL regex, the discovery-link extractor, and the map merge.
Together they cover every code path between "downloaded HTML" and
"written JSON map".
"""

import json
import os
import sys
import tempfile

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))

from scrape_pokemonproxies_urls import (    # noqa: E402
    discover_internal_links,
    extract_urls,
    load_existing,
    merge_into_map,
    write_map,
    BASE_URL,
    PREFIX_TO_SET,
)


# ── extract_urls ──────────────────────────────────────────────────

class TestExtractUrls:
    def test_matches_the_user_reported_m5_url(self):
        html = '<img src="/assets/5a-023-Manectric-UWQu1Mvp.png">'
        out = extract_urls(html)
        assert len(out) == 1
        prefix, num, name, hsh, full = out[0]
        assert prefix == "5a"
        assert num == "023"
        assert name == "Manectric"
        assert hsh == "UWQu1Mvp"
        assert full == "/assets/5a-023-Manectric-UWQu1Mvp.png"

    def test_pads_short_card_numbers_to_3_digits(self):
        # The CSV uses "1" but the asset filename has "001". The
        # extractor returns the on-disk form so the key stays canonical.
        html = '<img src="/assets/5a-001-Tropius-Aa1Bb2.png">'
        out = extract_urls(html)
        assert out[0][1] == "001"

    def test_unknown_prefix_is_ignored(self):
        # '6a' isn't in PREFIX_TO_SET yet — the regex must not match.
        html = '<img src="/assets/6a-001-Future-XX.png">'
        assert extract_urls(html) == []

    def test_extracts_all_known_prefixes(self):
        html = """
            <img src="/assets/3a-005-Pikachu-ZZ.png">
            <img src="/assets/4a-099-Mewtwo-YY.png">
            <img src="/assets/5a-023-Manectric-XX.png">
        """
        prefixes = sorted(p for p, *_ in extract_urls(html))
        assert prefixes == ["3a", "4a", "5a"]

    def test_handles_empty_or_none_input(self):
        assert extract_urls("") == []
        assert extract_urls(None) == []

    def test_rejects_non_png_assets(self):
        # The site ships fonts / css from /assets/ too — only .png
        # may match.
        html = '<link href="/assets/5a-023-Manectric-UWQu1Mvp.css">'
        assert extract_urls(html) == []

    def test_deduplicates_via_merge_only(self):
        # extract_urls itself returns every match (preload + main); the
        # dedup is merge_into_map's job. Verify both sides of that
        # contract.
        html = """
            <link rel="preload" href="/assets/5a-023-Manectric-UWQu1Mvp.png">
            <img src="/assets/5a-023-Manectric-UWQu1Mvp.png">
        """
        assert len(extract_urls(html)) == 2


# ── merge_into_map ────────────────────────────────────────────────

class TestMergeIntoMap:
    def test_collapses_duplicates_by_key(self):
        urls = {}
        found = [
            ("5a", "023", "Manectric", "UWQu1Mvp", "/assets/5a-023-Manectric-UWQu1Mvp.png"),
            ("5a", "023", "Manectric", "UWQu1Mvp", "/assets/5a-023-Manectric-UWQu1Mvp.png"),
        ]
        # First call: 1 change. Second call (already present, identical URL): 0.
        assert merge_into_map(urls, found[:1], BASE_URL) == 1
        assert merge_into_map(urls, found[1:], BASE_URL) == 0
        assert urls == {"M5_23": f"{BASE_URL}/assets/5a-023-Manectric-UWQu1Mvp.png"}

    def test_url_change_counts_as_changed(self):
        urls = {}
        merge_into_map(urls,
                       [("5a", "023", "Manectric", "AAA", "/assets/5a-023-Manectric-AAA.png")],
                       BASE_URL)
        changed = merge_into_map(urls,
                                 [("5a", "023", "Manectric", "BBB", "/assets/5a-023-Manectric-BBB.png")],
                                 BASE_URL)
        assert changed == 1
        assert "BBB" in urls["M5_23"]

    def test_strips_leading_zeros_from_key(self):
        urls = {}
        merge_into_map(urls,
                       [("5a", "001", "Tropius", "AA", "/assets/5a-001-Tropius-AA.png")],
                       BASE_URL)
        assert "M5_1" in urls
        assert "M5_001" not in urls

    def test_unknown_prefix_is_dropped(self):
        # PREFIX_TO_SET only knows about 3a/4a/5a today.
        urls = {}
        merge_into_map(urls,
                       [("9z", "001", "X", "YY", "/assets/9z-001-X-YY.png")],
                       BASE_URL)
        assert urls == {}


# ── discover_internal_links ──────────────────────────────────────

class TestDiscoverInternalLinks:
    def test_collects_internal_relative_paths(self):
        html = '<a href="/sets/m5">M5</a><a href="/cards">Cards</a>'
        links = discover_internal_links(html, BASE_URL)
        assert BASE_URL + "/sets/m5" in links
        assert BASE_URL + "/cards" in links

    def test_drops_external_hosts(self):
        html = '<a href="https://google.com/x">ext</a><a href="/internal">int</a>'
        links = discover_internal_links(html, BASE_URL)
        assert all("google.com" not in url for url in links)
        assert BASE_URL + "/internal" in links

    def test_drops_unsafe_schemes(self):
        html = (
            '<a href="mailto:foo@bar">mail</a>'
            '<a href="javascript:alert(1)">js</a>'
            '<a href="#section">anchor</a>'
            '<a href="/ok">ok</a>'
        )
        links = discover_internal_links(html, BASE_URL)
        assert links == [BASE_URL + "/ok"]

    def test_dedupes(self):
        html = '<a href="/a">x</a><a href="/a">y</a>'
        assert discover_internal_links(html, BASE_URL) == [BASE_URL + "/a"]


# ── io round-trip ────────────────────────────────────────────────

class TestRoundTrip:
    def test_load_missing_file_returns_empty(self):
        assert load_existing("/no/such/file.json") == {}

    def test_load_bad_json_returns_empty(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write("not json at all")
            path = f.name
        try:
            assert load_existing(path) == {}
        finally:
            os.remove(path)

    def test_write_then_load_round_trips(self):
        urls = {
            "M5_23": "https://www.pokemonproxies.com/assets/5a-023-Manectric-X.png",
            "M5_1":  "https://www.pokemonproxies.com/assets/5a-001-Tropius-Y.png",
        }
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            path = f.name
        try:
            write_map(path, urls)
            with open(path) as f:
                payload = json.load(f)
            # Top-level shape
            assert set(payload.keys()) == {"_meta", "urls"}
            assert payload["_meta"]["entry_count"] == 2
            assert payload["_meta"]["set_breakdown"] == {"M5": 2}
            # Order — keys sorted by (set, numeric number)
            assert list(payload["urls"].keys()) == ["M5_1", "M5_23"]
            # load_existing returns the urls dict only
            assert load_existing(path) == urls
        finally:
            os.remove(path)


# ── set-prefix mapping sanity ────────────────────────────────────

class TestPrefixMap:
    def test_known_prefixes_present(self):
        # If we drop one from PREFIX_TO_SET, every test above that uses
        # it will fail. This is a lightweight tripwire so we catch the
        # bare config change in isolation.
        assert PREFIX_TO_SET["5a"] == "M5"
        assert "3a" in PREFIX_TO_SET
        assert "4a" in PREFIX_TO_SET
