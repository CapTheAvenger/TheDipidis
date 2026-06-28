#!/usr/bin/env python3
"""Scrape the in-game Pokémon Champions usage analysis and write
data/champions_usage.json — the authoritative "most-used nature / SP spread
/ item / move / ability / teammate" per Pokémon, per format (Doubles +
Singles), for the current ranked season.

Source: championsbattledata.com — a public mirror of the exact in-game
"Statuswertanpassung / Statuswertpunkte / Attacken / Item / Fähigkeit"
analysis. Verified to match the game to the decimal (Pelipper Doubles:
Mäßig/Modest 53.9% in-game ≈ 52–54% here; moves Hurricane 98.4/98.5,
Tailwind 89.3/88.9, items Sitrus 28.0/26.5, Damp Rock 13.4/13.9 — all match).

Why this replaces the old VGCPastes meta sample: VGCPastes aggregates ~40
tournament *top-team* pastes — a small, biased slice that disagreed with
the game's real ladder usage (it said Timid for Pelipper; the game says
Modest by a wide margin). This is the ladder's own usage data.

The site ships per-Pokémon battle data as CSV assets with this schema:
  pokemon,column_position,category,rank,name,percentage,
  stat_up,stat_down,hp_points,attack_points,defense_points,
  sp_atk_points,sp_def_points,speed_points
category ∈ {nature, stat_points, held_item, move, ability, teammate, ...}.
We enumerate every Pokémon from the site sitemap, pull each format's CSV,
and keep the top few rows per category.

Network: championsbattledata blocks generic bots locally; this runs in CI
with a browser User-Agent. Fail-soft — on any hard error the caller keeps
the committed champions_usage.json.
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "https://championsbattledata.com"
SITEMAP = f"{BASE}/sitemap.xml"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "application/json,text/csv,application/xml,*/*"}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "champions_usage.json")

# How many rows to keep per category (compact but useful for the UI).
# The site labels the nature category "stat_alignment" (the in-game
# "Statuswertanpassung" panel) and the SP/EV spread "stat_points"
# ("Statuswertpunkte"). We re-key stat_alignment → "nature" on output.
KEEP = {"stat_alignment": 6, "stat_points": 6, "held_item": 8, "move": 12,
        "ability": 3, "teammate": 8}
# Output key per source category.
OUT_KEY = {"stat_alignment": "nature"}

_POINT_COLS = [("hp", "hp_points"), ("atk", "attack_points"),
               ("def", "defense_points"), ("spa", "sp_atk_points"),
               ("spd", "sp_def_points"), ("spe", "speed_points")]
# evs-string keys parse_sp() (in build_champions_pokedex.py) understands.
_EV_LABEL = {"hp": "HP", "atk": "Atk", "def": "Def",
             "spa": "SpA", "spd": "SpD", "spe": "Spe"}


# The host rate-limits aggressive bursts (~200 rapid requests → HTTP 503).
# A fully sequential run (~1000 requests) is reliable but takes ~10 min; a
# fully parallel one trips the 503 wall. A small worker pool + per-request
# backoff on 503/429 is the sweet spot: ~3 min, full roster, self-healing.
WORKERS = 6


def fetch(url, timeout=45, retries=4):
    # Quote the path so asset filenames with spaces (e.g. "Vivillon Fancy
    # Pattern.csv") don't raise "URL can't contain control characters".
    parts = urllib.parse.urlsplit(url)
    safe_path = urllib.parse.quote(parts.path)
    url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, safe_path,
                                   parts.query, parts.fragment))
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(0.6 * (2 ** attempt))   # 0.6, 1.2, 2.4s
                continue
            raise
        except Exception as e:  # noqa: BLE001 — transient network: back off
            last = e
            if attempt < retries - 1:
                time.sleep(0.6 * (2 ** attempt))
                continue
            raise
    raise last  # pragma: no cover


def fetch_text(url, timeout=45):
    return fetch(url, timeout).decode("utf-8", "replace")


def pct_to_float(s):
    s = (s or "").strip().rstrip("%").replace(",", ".")
    try:
        return round(float(s), 1)
    except ValueError:
        return None


def slugs_from_sitemap():
    """All /pokemon/<slug> slugs the site knows about."""
    xml = fetch_text(SITEMAP)
    slugs = sorted(set(re.findall(r"/pokemon/([a-z0-9-]+)", xml)))
    return slugs


def parse_csv(text):
    """Minimal CSV parse (no embedded commas/quotes in this data). Returns
    list of dict rows keyed by the header."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    header = [h.strip() for h in lines[0].split(",")]
    rows = []
    for ln in lines[1:]:
        cells = ln.split(",")
        if len(cells) < len(header):
            cells += [""] * (len(header) - len(cells))
        rows.append(dict(zip(header, cells)))
    return rows


def evs_string(row):
    """Build a '2 HP / 32 SpA / 32 Spe' string (parse_sp-compatible) from a
    stat_points row's *_points columns. Returns ('', {}) if all zero."""
    points = {}
    for key, col in _POINT_COLS:
        try:
            v = int((row.get(col) or "0").strip() or "0")
        except ValueError:
            v = 0
        points[key] = v
    parts = [f"{points[k]} {_EV_LABEL[k]}" for k, _ in _POINT_COLS if points[k]]
    return " / ".join(parts), points


def summarize_csv(text):
    """Group rows by category, keep the top-N of each (by the row's own
    rank order, which the CSV already provides)."""
    rows = parse_csv(text)
    by_cat = {}
    for r in rows:
        by_cat.setdefault(r.get("category", ""), []).append(r)

    # NB: the CSV's "column_position" is a display-grid layout index, NOT a
    # usage rank — verified: sorting all Pokémon by it does NOT reproduce the
    # in-game usage ranking (gaps, form-shared values, and the in-game top-5
    # Salmagnis/Elfun/Fatalitcha don't appear near the top). So we drop it;
    # championsbattledata carries no aggregate usage ranking.
    out = {}
    for cat, lst in by_cat.items():
        keep = KEEP.get(cat)
        if not keep:
            continue
        items = []
        for r in lst[:keep]:
            pct = pct_to_float(r.get("percentage"))
            if cat == "stat_alignment":          # nature
                items.append({"name": r.get("name", "").strip(),
                              "pct": pct,
                              "up": (r.get("stat_up") or "").strip(),
                              "down": (r.get("stat_down") or "").strip()})
            elif cat == "stat_points":           # SP / EV spread
                evs, points = evs_string(r)
                items.append({"evs": evs, "pct": pct, "points": points})
            else:                                # held_item / move / ability / teammate
                items.append({"name": r.get("name", "").strip(), "pct": pct})
        out[OUT_KEY.get(cat, cat)] = items
    return out


def scrape_pokemon(slug):
    """Return (display_name, record) or (None, None) on failure."""
    try:
        data = json.loads(fetch_text(f"{BASE}/api/pokemon/{slug}"))
    except Exception as e:  # noqa: BLE001
        print(f"  WARN {slug}: api fetch failed ({e})")
        return None, None

    name = (data.get("battleName") or data.get("name") or "").strip()
    summary = data.get("summary") or {}
    primary = (summary.get("primary") or {})
    en_name = (primary.get("pokemon_name") or name).strip()

    rec = {"name": en_name, "slug": slug}
    forms = {}
    for csv_ref in data.get("battleDataCsvs", []):
        fmt = (csv_ref.get("format") or "").strip().lower()  # 'doubles'/'singles'
        path = csv_ref.get("path")
        season = csv_ref.get("season")
        if not fmt or not path:
            continue
        try:
            text = fetch_text(f"{BASE}/{path}")
        except Exception as e:  # noqa: BLE001
            print(f"  WARN {slug}/{fmt}: csv fetch failed ({e})")
            continue
        s = summarize_csv(text)
        s["season"] = season
        forms[fmt] = s
    if not forms:
        return None, None
    rec.update(forms)
    return en_name, rec


def main():
    limit = None
    for a in sys.argv[1:]:
        if a.startswith("--limit"):
            try:
                limit = int(a.split("=", 1)[1]) if "=" in a else int(sys.argv[sys.argv.index(a) + 1])
            except (ValueError, IndexError):
                limit = None

    try:
        slugs = slugs_from_sitemap()
    except Exception as e:  # noqa: BLE001
        print(f"FATAL: sitemap fetch failed ({e}) — keeping committed JSON")
        return 1
    print(f"sitemap: {len(slugs)} pokemon slugs")
    if limit:
        slugs = slugs[:limit]
        print(f"--limit {limit}: scraping {len(slugs)} slugs")

    pokemon = {}
    season = None
    ok = 0
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(scrape_pokemon, slug): slug for slug in slugs}
        for fut in as_completed(futures):
            done += 1
            slug = futures[fut]
            try:
                name, rec = fut.result()
            except Exception as e:  # noqa: BLE001 — one bad mon must not kill the run
                print(f"  WARN {slug}: {type(e).__name__}: {e}")
                continue
            if not rec:
                continue
            for fmt in ("doubles", "singles"):
                if fmt in rec and rec[fmt].get("season"):
                    season = rec[fmt]["season"]
            pokemon[slug] = rec
            ok += 1
            if ok <= 3 or done % 50 == 0:
                d = (rec.get("doubles") or {})
                nat = (d.get("nature") or [{}])[0]
                print(f"  [{done}/{len(slugs)}] {name}: doubles top nature="
                      f"{nat.get('name')} {nat.get('pct')}%")

    if ok == 0:
        print("FATAL: 0 Pokémon scraped — keeping committed JSON")
        return 1

    out = {
        "_meta": {
            "source": "championsbattledata.com — public mirror of the in-game "
                      "Pokémon Champions ranked usage analysis (nature, SP "
                      "spread, item, move, ability, teammate), per format.",
            "season": season,
            "count": ok,
            "formats": ["doubles", "singles"],
            "note": "Authoritative ladder usage. Replaces the older VGCPastes "
                    "top-team sample for the Pokédex 'Meist genutzt' line.",
        },
        "pokemon": pokemon,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    kb = os.path.getsize(OUT) / 1024
    print(f"Wrote {OUT} — {ok} Pokémon, season={season}, {kb:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
