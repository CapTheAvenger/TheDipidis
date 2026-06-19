#!/usr/bin/env python3
"""
Build data/champions_resources.json — the bilingual (DE+EN) reference that
the Side Quest "Nachschlagen / Look up" tab consumes.

Sources
-------
1. pokemon-champions-data (github.com/otterlyclueless/pokemon-champions-data,
   CC BY 4.0) — the Champions-SPECIFIC base: the actual Champions item /
   ability / move pool with Champions effect descriptions (English),
   Champions PP/power/accuracy, and an `inChampions` flag per move. This
   is what makes the data Champions-correct rather than generic mainline.
2. PokéAPI CSV dump (github.com/PokeAPI/pokeapi, mirrored on GitHub so it's
   reachable from the locked-down build env) — used ONLY to add the
   official GERMAN names + German effect text, matched by English name.
3. data/champions_*_reference.json — our hand-verified German effects;
   they win for de_effect and flag the entry as German-verified.

Both #1 and #2 live on GitHub, the only egress this build env has.
Run: python3 scripts/build_champions_resources.py
"""

import csv
import io
import json
import os
import re
import urllib.request

CHAMP_BASE = "https://raw.githubusercontent.com/otterlyclueless/pokemon-champions-data/main"
CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, "data")
OUT = os.path.join(DATA, "champions_resources.json")

LANG_DE, LANG_EN = 6, 9

def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


# ── Item categories (the in-game Champions item-menu groups) ─────────
# Champions sorts held items into Statuswerte / Stärke / Verteidigung /
# Heilung / Effektlänge / Beeren / Megasteine / Anderes. There's no
# published mapping, so this is a best-effort classifier: auto-rules for
# mega stones / berries / extenders, a curated table for the named
# competitive items, everything else → Anderes. Corrections go in here.
ITEM_GROUP_CURATED = {
    'Stärke': {
        'Life Orb', 'Muscle Band', 'Wise Glasses', 'Expert Belt', 'Punching Glove',
        'Metronome', 'Scope Lens', 'Razor Claw', 'Light Ball', 'Thick Club',
        'Deep Sea Tooth', 'Charcoal', 'Mystic Water', 'Magnet', 'Miracle Seed',
        'Never-Melt Ice', 'Black Glasses', 'Sharp Beak', 'Hard Stone', 'Dragon Fang',
        'Spell Tag', 'Poison Barb', 'Soft Sand', 'Silk Scarf', 'Twisted Spoon',
        'Silver Powder', 'Metal Coat', 'Fairy Feather', 'Black Belt', 'Magmarizer',
        'Adamant Orb', 'Lustrous Orb', 'Griseous Orb', 'Adamant Crystal',
        'Lustrous Globe', 'Griseous Core', 'Cornerstone Mask', 'Hearthflame Mask',
        'Wellspring Mask', 'Legend Plate', 'Blank Plate',
    },
    'Statuswerte': {
        'Choice Band', 'Choice Specs', 'Choice Scarf', 'Assault Vest', 'Eviolite',
        'Booster Energy', 'Weakness Policy', 'White Herb', 'Throat Spray',
        'Absorb Bulb', 'Cell Battery', 'Snowball', 'Luminous Moss', 'Room Service',
        'Adrenaline Orb', 'Blunder Policy', 'Electric Seed', 'Grassy Seed',
        'Psychic Seed', 'Misty Seed', 'Weakness Policy',
    },
    'Verteidigung': {
        'Focus Sash', 'Focus Band', 'Rocky Helmet', 'Covert Cloak', 'Clear Amulet',
        'Safety Goggles', 'Eject Button', 'Eject Pack', 'Red Card', 'Air Balloon',
        'Heavy-Duty Boots', 'Bright Powder', 'Lax Incense', 'Protective Pads',
        'Metal Powder', 'Deep Sea Scale', 'Ability Shield',
    },
    'Heilung': {
        'Leftovers', 'Black Sludge', 'Shell Bell', 'Big Root',
    },
    'Effektlänge': {
        'Light Clay', 'Terrain Extender', 'Heat Rock', 'Damp Rock', 'Smooth Rock',
        'Icy Rock', 'Grip Claw', 'Binding Band',
    },
}
# Flatten to en-name → group
_ITEM_GROUP = {}
for _g, _set in ITEM_GROUP_CURATED.items():
    for _n in _set:
        _ITEM_GROUP[norm(_n)] = _g


def is_mega_stone(name):
    n = name.strip()
    return bool(re.search(r'ite( ?[XY])?$', n, re.I)) and not re.match(r'^eviolite$', n, re.I)


def item_group(name):
    if is_mega_stone(name):
        return 'Megasteine'
    if re.search(r'\bberry$', name, re.I):
        return 'Beeren'
    if re.search(r'(Plate|Gem|Memory)$', name):
        return 'Stärke'
    g = _ITEM_GROUP.get(norm(name))
    if g:
        return g
    return 'Anderes'


# Field / "stadium" effects (weather, terrain, rooms, screens, tailwind,
# gravity) matched on the display name per category.
FIELD = {
    "move": re.compile(
        r"(terrain|trick room|magic room|wonder room|tailwind|gravity|sunny day|"
        r"rain dance|sandstorm|hail|snowscape|chilly reception|light screen|"
        r"reflect|aurora veil)", re.I),
    "ability": re.compile(
        r"(drought|drizzle|sand stream|snow warning|surge|orichalcum pulse|"
        r"hadron engine|desolate land|primordial sea|delta stream|sand spit|"
        r"protosynthesis|quark drive)", re.I),
    "item": re.compile(
        r"(heat rock|damp rock|smooth rock|icy rock|light clay|terrain extender|seed)", re.I),
}

# German names for items PokéAPI's dump has no German entry for. These
# MUST be verified (PokéWiki / in-game) before being added — no guessing.
# Empty until verified names are supplied; unverified items fall back to
# their English name rather than a guess.
DE_NAME_SUPPLEMENT = {
    # "EN name": "Verified DE name",   # source: <PokeWiki URL / in-game>
}

# Curated German-name corrections, highest priority — for entries where
# PokéAPI's dump has no German name AND the hand-verified file's name is
# wrong/missing. (Wave Crash had been "Wellenbrecher"; correct is
# "Wellentackle".) Add flagged fixes here.
NAME_CORRECTIONS = {
    "Wave Crash": "Wellentackle",       # verified file had "Wellenbrecher"
    "Venusaurite": "Bisaflornit",       # verified file had "Bisaflorit" (missing n)
    "Matcha Gotcha": "Quirlschuss",     # verified file had "Tee-Verkostung"
}



def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TheDipidisChampionsBot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_csv(name):
    req = urllib.request.Request(f"{CSV_BASE}/{name}.csv",
                                 headers={"User-Agent": "TheDipidisChampionsBot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))


def clean(t):
    return re.sub(r"\s+", " ", (t or "").replace("\x0c", " ")).strip()


def pokeapi_de_map(names_csv, flavor_csv, idkey):
    """norm(EN name) -> {'de_name':…, 'de_eff':…} from PokéAPI."""
    names = {}
    for r in fetch_csv(names_csv):
        i = int(r[list(r.keys())[0]])
        lang = int(r["local_language_id"])
        if lang in (LANG_DE, LANG_EN):
            names.setdefault(i, {})[lang] = r["name"]
    flav = {}
    for r in fetch_csv(flavor_csv):
        if int(r["language_id"]) != LANG_DE:
            continue
        i, vg = int(r[idkey]), int(r["version_group_id"])
        if i not in flav or vg > flav[i][0]:
            flav[i] = (vg, clean(r["flavor_text"]))
    out = {}
    for i, nm in names.items():
        en = nm.get(LANG_EN)
        if not en:
            continue
        out[norm(en)] = {"de_name": nm.get(LANG_DE, ""), "de_eff": flav.get(i, (0, ""))[1]}
    return out


def load_verified():
    """norm(EN) -> {de_name, effect, type} from the hand-verified references."""
    out = {}
    for fn, sub in (("champions_items_reference.json", "items"),
                    ("champions_abilities_reference.json", "abilities"),
                    ("champions_moves_reference.json", "moves")):
        path = os.path.join(DATA, fn)
        if os.path.exists(path):
            for en, v in json.load(open(path, encoding="utf-8")).get(sub, {}).items():
                out[norm(en)] = v
    return out


def main():
    print("Fetching Champions dataset (otterlyclueless/pokemon-champions-data) …")
    champ_items = fetch_json(f"{CHAMP_BASE}/items/items.json")
    champ_abil  = fetch_json(f"{CHAMP_BASE}/abilities/abilities.json")
    champ_moves = fetch_json(f"{CHAMP_BASE}/moves/moves.json")

    print("Fetching PokéAPI German localisation …")
    de_item = pokeapi_de_map("item_names", "item_flavor_text", "item_id")
    de_abil = pokeapi_de_map("ability_names", "ability_flavor_text", "ability_id")
    de_move = pokeapi_de_map("move_names", "move_flavor_text", "move_id")

    verified = load_verified()
    supp = {norm(k): v for k, v in DE_NAME_SUPPLEMENT.items()}
    corr = {norm(k): v for k, v in NAME_CORRECTIONS.items()}

    # Authoritative DE name maps scraped from the German wikis (PokeWiki
    # moves + pokemonexperte items) by scripts/scrape_de_names.py. These
    # are the current in-game German names and win over PokeAPI AND the
    # hand-verified files (which carry occasional typos / outdated names).
    ov_move, ov_item = {}, {}
    ov_path = os.path.join(DATA, "de_name_overrides.json")
    if os.path.exists(ov_path):
        ov = json.load(open(ov_path, encoding="utf-8"))
        ov_move = {norm(k): v for k, v in (ov.get("moves") or {}).items()}
        ov_item = {norm(k): v for k, v in (ov.get("items") or {}).items()}
        print(f"Loaded de_name_overrides: {len(ov_move)} moves, {len(ov_item)} items")

    entries = []

    def build(cat, en, en_eff, demap, mtype=""):
        key = norm(en)
        v = verified.get(key)
        pk = demap.get(key, {})
        ov = (ov_move if cat == "move" else ov_item if cat == "item" else {}).get(key)
        # Name priority: curated correction → scraped wiki override
        # (authoritative, current) → hand-verified name → PokéAPI German →
        # DE-name supplement → English.
        de = corr.get(key) or ov or (v or {}).get("de_name") or pk.get("de_name") or supp.get(key) or en
        # German effect: hand-verified (Champions-correct) wins, else
        # PokéAPI's official German text, else fall back to English in UI.
        de_eff = (v or {}).get("effect") or pk.get("de_eff") or ""
        if v and cat == "move" and v.get("type"):
            mtype = v["type"]
        entry = {
            "cat": cat, "en": en, "de": de, "type": mtype,
            "en_effect": clean(en_eff), "de_effect": clean(de_eff),
            "field": bool(FIELD[cat].search(en)),
            "verified": v is not None,
        }
        if cat == "item":
            entry["group"] = item_group(en)   # Champions item-menu category
        entries.append(entry)

    for it in champ_items:
        build("item", it["name"], it.get("description", ""), de_item)
    for ab in champ_abil:
        build("ability", ab["name"], ab.get("description", ""), de_abil)
    for mv in champ_moves:
        if not mv.get("inChampions"):
            continue  # restrict to the actual Champions movepool
        build("move", mv["name"], mv.get("description", ""), de_move, mtype=mv.get("type", ""))

    entries.sort(key=lambda e: (e["cat"], e["de"].lower()))
    counts = {"item": 0, "ability": 0, "move": 0, "field": 0, "de_effect": 0}
    for e in entries:
        counts[e["cat"]] += 1
        if e["field"]:
            counts["field"] += 1
        if e["de_effect"].strip():
            counts["de_effect"] += 1

    out = {
        "_meta": {
            "version": 2,
            "format": "Pokémon Champions · bilingual reference",
            "description": (
                "Items, abilities, moves and field effects for the Side Quest "
                "look-up tab. Champions-specific base from pokemon-champions-data; "
                "German names/text from PokéAPI; hand-verified German effects on top."
            ),
            "attribution": (
                "Base data: pokemon-champions-data "
                "(github.com/otterlyclueless/pokemon-champions-data, CC BY 4.0). "
                "German localisation: PokéAPI (github.com/PokeAPI/pokeapi)."
            ),
            "counts": counts,
        },
        "entries": entries,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUT}\n  {len(entries)} entries  {counts}")


if __name__ == "__main__":
    main()
