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


# Exact Pokémon Champions Lv.50 stat formula (IV fixed at 31, Level 50):
#   HP   = Base + StatPoints + 75
#   Stat = floor((Base + StatPoints + 20) × Alignment)   (Atk/Def/SpA/SpD/Spe)
# Alignment: 1.1 boosting nature, 0.9 hindering, 1.0 neutral. SP 0..32 per
# stat. (Documented on Bulbapedia; verified vs in-game: Pelipper Spe 85@0SP
# /117@32SP, HP 135@0SP; Venusaur SpA 167 @100base/32SP/boosting.)
HP_CONST = 75
STAT_CONST = 20
SP_MAX = 32


def champ_stat(base, sp, is_hp, align=1.0):
    if is_hp:
        return base + sp + HP_CONST
    return math.floor((base + sp + STAT_CONST) * align)


def stat_range(base, is_hp):
    """Lv.50 final-stat min/max (Champions formula). Min = 0 SP + hindering
    nature; max = 32 SP + boosting nature. HP nature is always neutral."""
    if is_hp:
        return champ_stat(base, 0, True), champ_stat(base, SP_MAX, True)
    return champ_stat(base, 0, False, 0.9), champ_stat(base, SP_MAX, False, 1.1)


def stat_block(base, is_hp=False):
    mn, mx = stat_range(base, is_hp)
    return {"base": base, "min": mn, "max": mx}


# Nature → (raised stat, lowered stat). Neutral natures (incl. Champions'
# "Serious") raise/lower nothing → all alignments 1.0.
NATURE_EFFECT = {
    "Lonely": ("atk", "def"), "Brave": ("atk", "spe"), "Adamant": ("atk", "spa"), "Naughty": ("atk", "spd"),
    "Bold": ("def", "atk"), "Relaxed": ("def", "spe"), "Impish": ("def", "spa"), "Lax": ("def", "spd"),
    "Timid": ("spe", "atk"), "Hasty": ("spe", "def"), "Jolly": ("spe", "spa"), "Naive": ("spe", "spd"),
    "Modest": ("spa", "atk"), "Mild": ("spa", "def"), "Quiet": ("spa", "spe"), "Rash": ("spa", "spd"),
    "Calm": ("spd", "atk"), "Gentle": ("spd", "def"), "Sassy": ("spd", "spe"), "Careful": ("spd", "spa"),
}
_EV_KEY = {"hp": "hp", "atk": "atk", "def": "def", "spa": "spa", "spd": "spd", "spe": "spe",
           "HP": "hp", "Atk": "atk", "Def": "def", "SpA": "spa", "SpD": "spd", "Spe": "spe"}


def parse_sp(evs):
    """'2 HP / 32 SpA / 32 Spe' → {hp:2, atk:0, …, spa:32, spe:32}."""
    out = {k: 0 for k in ("hp", "atk", "def", "spa", "spd", "spe")}
    for part in str(evs or "").split("/"):
        m = re.match(r"\s*(\d+)\s+(\S+)\s*$", part)
        if m and m.group(2) in _EV_KEY:
            out[_EV_KEY[m.group(2)]] = int(m.group(1))
    return out


def final_stats(base6, sp6, nature):
    """Final Lv.50 stats for a given SP spread + nature, via the Champions
    formula (the now-confirmed exact mapping)."""
    up, down = NATURE_EFFECT.get(nature, (None, None))
    out = {"hp": champ_stat(base6["hp"], sp6["hp"], True)}
    for k in ("atk", "def", "spa", "spd", "spe"):
        align = 1.1 if k == up else 0.9 if k == down else 1.0
        out[k] = champ_stat(base6[k], sp6[k], False, align)
    return out


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def entry_base(en):
    """Pokédex EN name → its base species, e.g. 'Mega Eelektross' →
    'Eelektross', 'Alolan Ninetales' → 'Ninetales', 'Rotom (Heat)' →
    'Rotom'. Used to attach meta EV data (which is per species)."""
    b, _ = base_species_and_form(en)
    return re.sub(r"\s*\(.*\)\s*$", "", b).strip()


def team_base(name):
    """Replica-team species name → base species (Smogon style):
    'Eelektross-Mega' → 'Eelektross', 'Floette-Eternal' → 'Floette'."""
    if name in HYPHEN_BASE:
        return name
    return name.split("-")[0]


def load_meta_spreads():
    """Most-common EV/SP spread + nature per base species, from real
    top-team data (replica teams + the wider speed corpus). Refreshed
    every scrape run, so it tracks the live meta. Returns
    {norm(base): {evs, nature, n, total}}."""
    from collections import Counter
    samples = {}   # norm(base) -> Counter((evs, nature))
    totals = {}    # norm(base) -> total samples seen

    def add(species, evs, nature):
        evs = (evs or "").strip()
        if not species or not evs:
            return
        k = _norm(team_base(species))
        samples.setdefault(k, Counter())[(evs, nature or "")] += 1
        totals[k] = totals.get(k, 0) + 1

    teams_path = os.path.join(ROOT, "data", "champions_replica_teams.json")
    corpus_path = os.path.join(ROOT, "data", "champions_speed_corpus.json")
    try:
        for tm in json.load(open(teams_path, encoding="utf-8")).get("teams", []):
            for p in tm.get("pokemon", []):
                add(p.get("name"), p.get("evs"), p.get("nature"))
    except Exception as e:  # noqa: BLE001
        print(f"WARN: meta spreads — replica teams unavailable ({e})")
    try:
        for s in json.load(open(corpus_path, encoding="utf-8")).get("samples", []):
            add(s.get("species"), s.get("evs"), s.get("nature"))
    except Exception as e:  # noqa: BLE001
        print(f"WARN: meta spreads — speed corpus unavailable ({e})")

    out = {}
    for k, cnt in samples.items():
        (evs, nature), n = cnt.most_common(1)[0]
        out[k] = {"evs": evs, "nature": nature, "n": n, "total": totals.get(k, n)}
    return out


def main():
    roster = fetch_json(ROSTER_URL)
    stats = fetch_json(STATS_URL)
    with open(NAMES_DE_PATH, encoding="utf-8") as f:
        names_de = json.load(f)
    meta_spreads = load_meta_spreads()

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

    # Attach the live-meta "most-common SP spread" to each entry (per base
    # species), so players see what is actually run, not just base stats.
    meta_hits = 0
    for e in entries:
        m = meta_spreads.get(_norm(entry_base(e["en"])))
        if m:
            # Compute the real Lv.50 final stats for this most-used spread,
            # using THIS form's base stats + the spread's SP + nature.
            base6 = {k: e[k]["base"] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
            final = final_stats(base6, parse_sp(m["evs"]), m["nature"])
            e["meta"] = {**m, "final": final}
            meta_hits += 1
    print(f"Attached meta spreads to {meta_hits}/{len(entries)} entries")

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
