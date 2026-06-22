#!/usr/bin/env python3
"""Build data/champions_pokedex.json — the full roster of Pokémon available
in Pokémon Champions, with German + English names, types and base stats
(plus the Level-50 stat range), for the Side Quest "Pokédex" tab.

Reliable sources only (no guessing):
  • Roster + per-form base stats + types:
      github.com/otterlyclueless/pokemon-champions-data  (CC BY 4.0, the
      Champions-specific dataset cross-checked against Serebii). This is
      authoritative for *which* Pokémon/forms exist in Champions.
  • German species names: data/pokemon_names_de.json (EN→DE, PokéAPI).
  • German type names: the fixed 18-type table below (official).

The "range" shown next to each base stat is the Level-50 final-stat range
computed with the standard Pokémon formula (Champions confirms Level 50 +
the standard formula as its baseline — see the dataset's stat-formula.md):
  min  = IV 0,  EV 0,   hindering nature (other stats ×0.9)
  max  = IV 31, EV 252, beneficial nature (other stats ×1.1)
This matches the per-Pokémon ranges shown on German stat sites
(e.g. Garchomp base 102 Speed → 121–169 at Lv. 50). The bulk values used
for the tank sortings are base KP×Verteidigung and base KP×Spezial-Vert.
"""

import json
import math
import os
import re
import sys
import urllib.request

REPO = "https://raw.githubusercontent.com/otterlyclueless/pokemon-champions-data/main"
ROSTER_URL = f"{REPO}/pokemon/roster.json"
STATS_URL = f"{REPO}/pokemon/base-stats.json"

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
NAMES_DE_PATH = os.path.join(ROOT, "data", "pokemon_names_de.json")
SMOGON_PATH = os.path.join(ROOT, "data", "pokemon_battle_data.json")
DEX_PATH = os.path.join(ROOT, "data", "pokemon_dex_numbers.json")
EXTRA_PATH = os.path.join(ROOT, "data", "champions_roster_extra.json")
OUT_PATH = os.path.join(ROOT, "data", "champions_pokedex.json")

# Official English → German type names (the 18 Champions/VGC types).
TYPE_DE = {
    "Normal": "Normal", "Fire": "Feuer", "Water": "Wasser", "Electric": "Elektro",
    "Grass": "Pflanze", "Ice": "Eis", "Fighting": "Kampf", "Poison": "Gift",
    "Ground": "Boden", "Flying": "Flug", "Psychic": "Psycho", "Bug": "Käfer",
    "Rock": "Gestein", "Ghost": "Geist", "Dragon": "Drache", "Dark": "Unlicht",
    "Steel": "Stahl", "Fairy": "Fee",
}

# Form prefix (EN) → (regex-stripped, German form label). " X"/" Y" mega
# suffixes are handled separately so the base species can be looked up.
FORM_PREFIX_DE = {
    "Mega ": "Mega",
    "Alolan ": "Alola",
    "Hisuian ": "Hisui",
    "Galarian ": "Galar",
    "Paldean ": "Paldea",
}


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "thedipidis/champions-pokedex"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def base_species_and_form(name):
    """('Mega Charizard X') → ('Charizard', 'Mega X'). Base → (name, '')."""
    label = ""
    base = name
    for prefix, de_label in FORM_PREFIX_DE.items():
        if name.startswith(prefix):
            base = name[len(prefix):]
            label = de_label
            break
    # Mega X / Mega Y variants (Charizard, Mewtwo): pull the suffix into label.
    if label == "Mega" and (base.endswith(" X") or base.endswith(" Y")):
        label = "Mega " + base[-1]
        base = base[:-2]
    return base.strip(), label


# Smogon form-suffix → (English display builder, German form label, form kind).
REGION_SUFFIX = {"Alola": ("Alolan", "Alola", "Regional"),
                 "Hisui": ("Hisuian", "Hisui", "Regional"),
                 "Galar": ("Galarian", "Galar", "Regional"),
                 "Paldea": ("Paldean", "Paldea", "Regional")}
# Base species whose canonical name contains a hyphen (not a form suffix).
HYPHEN_BASE = {"Kommo-o", "Hakamo-o", "Jangmo-o", "Ho-Oh", "Porygon-Z",
               "Type-Null", "Mr-Mime", "Mime-Jr", "Mr-Rime",
               "Wo-Chien", "Chi-Yu", "Ting-Lu", "Chien-Pao"}


def parse_smogon(nm):
    """Smogon name → (en_display, base_species, de_form_label, form_kind).
    'Eelektross-Mega' → ('Mega Eelektross','Eelektross','Mega','Mega');
    'Ninetales-Alola' → ('Alolan Ninetales','Ninetales','Alola','Regional');
    'Rotom-Heat' → ('Rotom (Heat)','Rotom','Heat','Base')."""
    if nm.endswith("-Mega-X"):
        b = nm[:-7]; return (f"Mega {b} X", b, "Mega X", "Mega")
    if nm.endswith("-Mega-Y"):
        b = nm[:-7]; return (f"Mega {b} Y", b, "Mega Y", "Mega")
    if nm.endswith("-Mega"):
        b = nm[:-5]; return (f"Mega {b}", b, "Mega", "Mega")
    if "-" in nm and nm not in HYPHEN_BASE:
        b, suf = nm.split("-", 1)
        if suf in REGION_SUFFIX:
            pre, de, kind = REGION_SUFFIX[suf]
            return (f"{pre} {b}", b, de, kind)
        return (f"{b} ({suf})", b, suf, "Base")   # alt form (Rotom-Heat, …)
    return (nm, nm, "", "Base")


def make_entry(en, de, dex, form, t1, t2, st):
    hp, atk, df = st["hp"], st["atk"], st["def"]
    spa, spd, spe = st["spa"], st["spd"], st["spe"]
    return {
        "en": en, "de": de, "dex": dex, "form": form,
        "t1": t1, "t1de": TYPE_DE.get(t1, t1), "t2": t2, "t2de": TYPE_DE.get(t2, t2),
        "hp": stat_block(hp, is_hp=True), "atk": stat_block(atk), "def": stat_block(df),
        "spa": stat_block(spa), "spd": stat_block(spd), "spe": stat_block(spe),
        "total": st.get("total", hp + atk + df + spa + spd + spe),
        "bulkPhys": hp * df, "bulkSpec": hp * spd,
    }


def stat_range(base, is_hp):
    """Level-50 final-stat min/max via the standard formula."""
    if is_hp:
        mn = (2 * base) * 50 // 100 + 50 + 10
        mx = (2 * base + 31 + 63) * 50 // 100 + 50 + 10
    else:
        mn = math.floor(((2 * base) * 50 // 100 + 5) * 0.9)
        mx = math.floor(((2 * base + 31 + 63) * 50 // 100 + 5) * 1.1)
    return mn, mx


def stat_block(base, is_hp=False):
    mn, mx = stat_range(base, is_hp)
    return {"base": base, "min": mn, "max": mx}


def main():
    roster = fetch_json(ROSTER_URL)
    stats = fetch_json(STATS_URL)
    with open(NAMES_DE_PATH, encoding="utf-8") as f:
        names_de = json.load(f)

    # Index base stats by (name) — roster + stats share the same name field.
    stats_by_name = {e["name"]: e for e in stats}

    entries = []
    missing_de = []
    missing_stats = []
    for r in roster:
        name = r["name"]
        st = stats_by_name.get(name)
        if not st:
            missing_stats.append(name)
            continue
        base_en, form_de = base_species_and_form(name)
        base_de = names_de.get(base_en)
        if not base_de:
            missing_de.append(base_en)
            base_de = base_en  # fall back to English rather than guess
        name_de = f"{base_de} ({form_de})" if form_de else base_de

        types = r.get("types") or []
        t1 = types[0] if len(types) > 0 else ""
        t2 = types[1] if len(types) > 1 else ""

        hp, atk, df = st["hp"], st["atk"], st["def"]
        spa, spd, spe = st["spa"], st["spd"], st["spe"]
        entries.append({
            "en": name,
            "de": name_de,
            "dex": r.get("dexNumber"),
            "form": r.get("form", "Base"),
            "t1": t1, "t1de": TYPE_DE.get(t1, t1),
            "t2": t2, "t2de": TYPE_DE.get(t2, t2),
            "hp": stat_block(hp, is_hp=True),
            "atk": stat_block(atk),
            "def": stat_block(df),
            "spa": stat_block(spa),
            "spd": stat_block(spd),
            "spe": stat_block(spe),
            "total": st.get("total", hp + atk + df + spa + spd + spe),
            "bulkPhys": hp * df,
            "bulkSpec": hp * spd,
        })

    # ── M-B (and later) roster additions not yet in the otterlyclueless
    # M-A dataset: base species from pokebase's Champions dex + the new
    # Mega Evolutions, with stats/types resolved from Smogon. Listed in
    # data/champions_roster_extra.json (refreshed in CI). Reliable: every
    # entry has Smogon stats and a PokéAPI German name. ──
    def norm_en(s):
        return re.sub(r"[^a-z0-9]", "", str(s).lower())

    have = {norm_en(e["en"]) for e in entries}
    added = 0
    try:
        smogon = json.load(open(SMOGON_PATH, encoding="utf-8"))
        dexnums = json.load(open(DEX_PATH, encoding="utf-8"))
        extra_keys = json.load(open(EXTRA_PATH, encoding="utf-8")).get("smogonKeys", [])
    except Exception as e:  # noqa: BLE001 — supplement is best-effort
        print(f"WARN: roster supplement skipped ({e})")
        smogon, dexnums, extra_keys = {}, {}, []

    for key in extra_keys:
        sm = smogon.get(key)
        if not sm or "baseStats" not in sm:
            print(f"WARN: extra key {key!r} not in Smogon data — skipped")
            continue
        en, base, label, kind = parse_smogon(key)
        if norm_en(en) in have:
            continue
        base_de = names_de.get(base)
        if not base_de:
            missing_de.append(base)
            base_de = base
        name_de = f"{base_de} ({label})" if label else base_de
        types = sm.get("types") or []
        t1 = types[0] if types else ""
        t2 = types[1] if len(types) > 1 else ""
        dex = dexnums.get(base.lower())
        entries.append(make_entry(en, name_de, dex, kind, t1, t2, sm["baseStats"]))
        have.add(norm_en(en))
        added += 1
    if added:
        print(f"Added {added} M-B roster supplement entries (Smogon stats)")

    # Stable, friendly default order: by total descending, then name.
    entries.sort(key=lambda e: (-(e["total"] or 0), e["en"]))

    out = {
        "_meta": {
            "format": "Pokémon Champions · Pokédex (bilingual base stats + Lv.50 range)",
            "count": len(entries),
            "level": 50,
            "rangeBasis": "Lv. 50 final stat: min = 0 IV / 0 SP / hindering nature, "
                          "max = 31 IV / 252 EV-equiv / beneficial nature (standard formula).",
            "bulk": "bulkPhys = base KP × base Verteidigung; bulkSpec = base KP × base Spezial-Verteidigung.",
            "sources": [
                "otterlyclueless/pokemon-champions-data (CC BY 4.0) — M-A roster, base stats, types",
                "M-B additions: pokebase.app Champions dex + official Mega list; stats/types from Smogon (pokemon-showdown)",
                "PokéAPI — German species names",
            ],
        },
        "entries": entries,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Wrote {OUT_PATH} — {len(entries)} Pokémon, {size_kb:.1f} KB")
    if missing_stats:
        print(f"WARN: {len(missing_stats)} roster entries had no base stats:", missing_stats[:10])
    if missing_de:
        uniq = sorted(set(missing_de))
        print(f"WARN: {len(uniq)} species missing a German name (kept English):", uniq[:20])
    return 0


if __name__ == "__main__":
    sys.exit(main())
