#!/usr/bin/env python3
"""
Build data/champions_resources.json — the bilingual (DE+EN) reference that
the Side Quest "Nachschlagen / Look up" tab consumes.

Why this exists
---------------
There is no public, comprehensive, machine-readable *Champions-specific*
dataset for item / ability / move / field-effect mechanics. The only
comprehensive, bilingual, machine-readable source is PokéAPI's CSV dump
(mirrored on GitHub, so it's reachable from the locked-down build env),
which carries the OFFICIAL in-game German AND English names + flavour
text. That is mainline mechanics, not guaranteed Champions-accurate —
so the hand-verified Champions references (data/champions_*_reference
.json) are layered on top as authoritative OVERRIDES, and every entry is
tagged `verified` (Champions-checked) vs not (mainline official text).

Source: https://github.com/PokeAPI/pokeapi  (data/v2/csv/*.csv, CC-BY)
Run:    python3 scripts/build_champions_resources.py
"""

import csv
import io
import json
import os
import re
import sys
import urllib.request

CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, "data")
OUT = os.path.join(DATA, "champions_resources.json")

LANG_DE, LANG_EN = 6, 9

# Competitively-relevant held-item categories (PokéAPI item_categories
# identifiers). Everything else — Poké Balls, TMs, key items, picnic
# ingredients, candies … — is dropped so the lookup isn't drowned in
# overworld clutter. Verified Champions items are unioned in regardless.
ITEM_CATEGORIES = {
    "held-items", "mega-stones", "choice", "type-enhancement", "species-specific",
    "plates", "jewels", "memories", "stat-boosts", "bad-held-items", "scarves",
    "type-protection", "in-a-pinch", "picky-healing", "other", "effort-drop",
    "medicine", "status-cures",
}

# Field / "stadium" effects — weather, terrain, rooms, screens, tailwind,
# gravity — that beginners need as one group. Matched on PokéAPI
# identifiers (hyphenated) per category so future entries are caught too.
FIELD_RE = {
    "move": re.compile(
        r"(terrain|trick-room|magic-room|wonder-room|tailwind|gravity|"
        r"sunny-day|rain-dance|sandstorm|hail|snowscape|chilly-reception|"
        r"light-screen|reflect|aurora-veil)$"),
    "ability": re.compile(
        r"(drought|drizzle|sand-stream|snow-warning|.+-surge|orichalcum-pulse|"
        r"hadron-engine|desolate-land|primordial-sea|delta-stream|sand-spit|"
        r"protosynthesis|quark-drive)$"),
    "item": re.compile(
        r"(heat-rock|damp-rock|smooth-rock|icy-rock|light-clay|terrain-extender|.+-seed)$"),
}


def fetch_csv(name):
    url = f"{CSV_BASE}/{name}.csv"
    req = urllib.request.Request(url, headers={"User-Agent": "TheDipidisChampionsBot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode("utf-8"))))


def names_map(rows):
    """id -> {de, en} from a *_names.csv (keyed on the first column)."""
    out = {}
    idkey = None
    for r in rows:
        if idkey is None:
            idkey = list(r.keys())[0]
        lang = int(r["local_language_id"])
        if lang in (LANG_DE, LANG_EN):
            out.setdefault(int(r[idkey]), {})[lang] = r["name"]
    return out


def clean(text):
    return re.sub(r"\s+", " ", (text or "").replace("\x0c", " ")).strip()


def flavor_map(rows, idkey):
    """id -> {de, en}: latest (highest version_group_id) flavour per language."""
    best = {}
    for r in rows:
        lang = int(r["language_id"])
        if lang not in (LANG_DE, LANG_EN):
            continue
        i = int(r[idkey])
        vg = int(r["version_group_id"])
        key = (i, lang)
        if key not in best or vg > best[key][0]:
            best[key] = (vg, clean(r["flavor_text"]))
    out = {}
    for (i, lang), (_, txt) in best.items():
        out.setdefault(i, {})[lang] = txt
    return out


def load_verified():
    """Hand-verified Champions overrides, keyed by EN name -> {de, effect, type}."""
    out = {"item": {}, "ability": {}, "move": {}}
    files = {
        "item":    ("champions_items_reference.json", "items"),
        "ability": ("champions_abilities_reference.json", "abilities"),
        "move":    ("champions_moves_reference.json", "moves"),
    }
    for cat, (fn, sub) in files.items():
        path = os.path.join(DATA, fn)
        if not os.path.exists(path):
            continue
        coll = json.load(open(path, encoding="utf-8")).get(sub, {})
        for en, v in coll.items():
            out[cat][en] = v
    return out


def main():
    print("Fetching PokéAPI CSVs from GitHub …")
    moves      = fetch_csv("moves")
    move_names = names_map(fetch_csv("move_names"))
    move_flav  = flavor_map(fetch_csv("move_flavor_text"), "move_id")
    abilities  = fetch_csv("abilities")
    abil_names = names_map(fetch_csv("ability_names"))
    abil_flav  = flavor_map(fetch_csv("ability_flavor_text"), "ability_id")
    items      = fetch_csv("items")
    item_names = names_map(fetch_csv("item_names"))
    item_flav  = flavor_map(fetch_csv("item_flavor_text"), "item_id")
    types      = {int(r["id"]): r["identifier"] for r in fetch_csv("types")}
    item_cats  = {int(r["id"]): r["identifier"] for r in fetch_csv("item_categories")}

    # Hand-checked bilingual effects for newest Gen-9 competitive items
    # PokéAPI's CSV dump has no flavour text for yet. Names still come
    # from PokéAPI; we only fill the effect. Marked verified.
    SUPPLEMENT = {
        # EN name: (DE name, DE effect, EN effect)
        "Ability Shield":  ("Fähigkeitsschutz",
                            "Schützt den Träger davor, dass seine Fähigkeit geändert, kopiert oder unterdrückt wird.",
                            "Protects the holder from having its Ability changed, copied or suppressed."),
        "Clear Amulet":    ("Reinheitsplakette",
                            "Verhindert, dass die Werte des Trägers durch Gegner gesenkt werden.",
                            "Prevents the holder's stats from being lowered by other Pokémon."),
        "Covert Cloak":    ("Schleiermantel",
                            "Schützt den Träger vor den Zusatzeffekten gegnerischer Attacken (z. B. Zurückzucken, Werte-Senkung).",
                            "Protects the holder from the additional effects of attacks (e.g. flinching, stat drops)."),
        "Loaded Dice":     ("Trickwürfel",
                            "Mehrfach-Attacken treffen mindestens 4-mal (z. B. Eiszapfhagel, Felsschleuder, Schuppensalve).",
                            "Multi-hit moves hit at least 4 times (e.g. Icicle Spear, Rock Blast, Scale Shot)."),
        "Mirror Herb":     ("Spiegelkraut",
                            "Einmalig: Kopiert sofort sämtliche Werteerhöhungen eines Gegners.",
                            "One-time use: immediately copies any stat boosts an opponent gains."),
        "Punching Glove":  ("Schlaghandschuh",
                            "Schlag-Attacken machen 10 % mehr Schaden und verursachen keinen Kontakt mehr.",
                            "Boosts the power of punching moves by 10% and stops them making contact."),
        "Legend Plate":    ("Legendentafel",
                            "Erhöht den Schaden ALLER Typ-Attacken des Trägers um 20 % (Arceus-Item).",
                            "Boosts the power of all of the holder's moves by 20%, of every type (Arceus item)."),
        "Cornerstone Mask":("Fundamentmaske",
                            "Von Ogerpon (Fels-Form) getragen: verstärkt seine Attacken und ermöglicht die Form.",
                            "Worn by Ogerpon (Cornerstone form): powers up its moves and enables its form change."),
        "Hearthflame Mask":("Feuerstellenmaske",
                            "Von Ogerpon (Ofen-Form) getragen: verstärkt seine Attacken und ermöglicht die Form.",
                            "Worn by Ogerpon (Hearthflame form): powers up its moves and enables its form change."),
        "Wellspring Mask": ("Brunnenmaske",
                            "Von Ogerpon (Brunnen-Form) getragen: verstärkt seine Attacken und ermöglicht die Form.",
                            "Worn by Ogerpon (Wellspring form): powers up its moves and enables its form change."),
    }

    verified = load_verified()
    entries = []
    seen = {"item": set(), "ability": set(), "move": set()}

    def cap_type(tid):
        t = types.get(int(tid)) if tid else None
        return t.capitalize() if t else ""

    def add(cat, en, de, en_eff, de_eff, mtype="", field=False, ver=None):
        # Apply verified override. The verified files' value is the
        # Champions-checked EFFECT, so that wins. Names stay on PokéAPI's
        # official localisation (more reliable than the hand-typed
        # de_name — e.g. the curated file had Shuca Berry → "Babiribeere"
        # by mistake); the verified de_name is only a fallback for
        # Champions-custom items PokéAPI doesn't have (Floettite …).
        v = ver if ver is not None else verified[cat].get(en)
        is_ver = v is not None
        if is_ver:
            if not de or de == en:
                de = v.get("de_name") or de or en
            de_eff = v.get("effect") or de_eff
            if not en_eff:
                en_eff = v.get("effect") or ""
            if cat == "move" and v.get("type"):
                mtype = v["type"]
        # Fill PokéAPI flavour-text (and name) gaps for key new items.
        if cat == "item" and not de_eff.strip() and not en_eff.strip() and en in SUPPLEMENT:
            sde, de_eff, en_eff = SUPPLEMENT[en]
            if (not de or de == en) and sde:
                de = sde
            is_ver = True
        entries.append({
            "cat": cat,
            "en": en,
            "de": de or en,
            "type": mtype,
            "en_effect": en_eff or "",
            "de_effect": de_eff or "",
            "field": bool(field),
            "verified": is_ver,
        })
        seen[cat].add(en)

    # ── Moves (all battle moves) ──────────────────────────────────────
    for r in moves:
        mid = int(r["id"])
        nm = move_names.get(mid, {})
        en = nm.get(LANG_EN)
        if not en:
            continue
        fl = move_flav.get(mid, {})
        field = bool(FIELD_RE["move"].search(r["identifier"]))
        add("move", en, nm.get(LANG_DE, en),
            fl.get(LANG_EN, ""), fl.get(LANG_DE, ""),
            mtype=cap_type(r["type_id"]), field=field)

    # ── Abilities (main-series only) ──────────────────────────────────
    # PokéAPI's abilities.csv also lists spin-off "abilities" (Pokémon
    # GO/Masters passives like "Black Hole", "Bodyguard") that aren't
    # real battle abilities and carry no flavour text. is_main_series
    # filters them out.
    for r in abilities:
        if r.get("is_main_series") not in ("1",):
            continue
        aid = int(r["id"])
        nm = abil_names.get(aid, {})
        en = nm.get(LANG_EN)
        if not en:
            continue
        fl = abil_flav.get(aid, {})
        field = bool(FIELD_RE["ability"].search(r["identifier"]))
        add("ability", en, nm.get(LANG_DE, en),
            fl.get(LANG_EN, ""), fl.get(LANG_DE, ""), field=field)

    # ── Items (competitive held-item categories only) ─────────────────
    verified_item_names = set(verified["item"].keys())
    for r in items:
        cat_id = int(r["category_id"])
        iid = int(r["id"])
        nm = item_names.get(iid, {})
        en = nm.get(LANG_EN)
        if not en:
            continue
        keep = item_cats.get(cat_id) in ITEM_CATEGORIES or en in verified_item_names
        if not keep:
            continue
        fl = item_flav.get(iid, {})
        field = bool(FIELD_RE["item"].search(r["identifier"]))
        add("item", en, nm.get(LANG_DE, en),
            fl.get(LANG_EN, ""), fl.get(LANG_DE, ""), field=field)

    # ── Verified-only entries not present in PokéAPI (Champions-custom,
    #    e.g. Floettite and other Champions mega stones) ───────────────
    for cat in ("item", "ability", "move"):
        for en, v in verified[cat].items():
            if en in seen[cat]:
                continue
            field = bool(FIELD_RE[cat].search(en.lower().replace(" ", "-")))
            add(cat, en, v.get("de_name") or en, v.get("effect") or "",
                v.get("effect") or "", mtype=v.get("type", ""), field=field, ver=v)

    entries.sort(key=lambda e: (e["cat"], e["de"].lower()))
    counts = {"item": 0, "ability": 0, "move": 0, "field": 0, "verified": 0}
    for e in entries:
        counts[e["cat"]] += 1
        if e["field"]:
            counts["field"] += 1
        if e["verified"]:
            counts["verified"] += 1

    out = {
        "_meta": {
            "version": 1,
            "format": "Pokémon Champions · bilingual reference",
            "description": (
                "Items, abilities, moves and field effects for the Side Quest "
                "look-up tab. Base data = PokéAPI (official in-game DE+EN names "
                "+ flavour text, mainline mechanics). Hand-verified Champions "
                "entries override the base and are flagged `verified`."
            ),
            "source_base": "PokéAPI CSV dump (github.com/PokeAPI/pokeapi, CC-BY)",
            "source_overrides": "data/champions_*_reference.json (hand-verified)",
            "counts": counts,
        },
        "entries": entries,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUT}")
    print(f"  entries: {len(entries)}  {counts}")


if __name__ == "__main__":
    sys.exit(main())
