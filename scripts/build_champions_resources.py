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


def pokeapi_move_priority():
    """norm(EN name) -> move priority (int) from PokéAPI moves.csv.

    The CSV keys moves by `identifier` (e.g. "fake-out"); norm() strips the
    hyphen so it lines up with the Champions move name norm() ("Fake Out").
    """
    out = {}
    for r in fetch_csv("moves"):
        try:
            out[norm(r["identifier"])] = int(r["priority"])
        except (KeyError, ValueError, TypeError):
            pass
    return out


# PokéAPI move_target ids that mean "this move hits more than one Pokémon".
#   9  all-other-pokemon   Every other Pokémon on the field (Earthquake)
#   11 all-opponents       All opposing Pokémon (Rock Slide, Heat Wave)
#   14 all-pokemon         Every Pokémon on the field
# In a double battle these take the 0.75 spread reduction; everything else
# does not. The ids and their descriptions come from
# data/v2/csv/move_target_prose.csv in the same PokéAPI dump.
SPREAD_TARGETS = {9, 11, 14}

# Where the hand-verified Champions reference contradicts the mainline
# target, the Champions reference wins — same rule the builder already
# applies to de_effect.
#
# Exactly one move is affected today (checked 20.08.2026 across all 494
# entries): Matcha Gotcha. PokéAPI carries target 10 (selected Pokémon);
# our verified German text says "Trifft beide Gegner", which is correct
# for Champions. Every other disagreement runs the other way — the
# German prose is simply silent about the target, and PokéAPI is right.
SPREAD_OVERRIDE = {
    norm("Matcha Gotcha"): True,
}


def pokeapi_move_target():
    """norm(EN name) -> PokéAPI move_target id (int).

    Same source and keying as pokeapi_move_priority(). Without this the
    damage calculator cannot tell a spread move from a single-target one
    and applies full damage to both — 31 damaging moves in the Champions
    pool are spread moves, among them Earthquake, Rock Slide and Heat
    Wave.
    """
    out = {}
    for r in fetch_csv("moves"):
        try:
            out[norm(r["identifier"])] = int(r["target_id"])
        except (KeyError, ValueError, TypeError):
            pass
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


def waehle_de_name(key, cat, en, ov, vf, pa, korrektur, ergaenzung, bisher, konflikte):
    """Deutscher Name aus den Quellen — ohne Seiteneffekt ausser `konflikte`.

    Reihenfolge: manuelle Korrektur > Mehrheit (>= 2 gleiche Stimmen unter
    PokeWiki `ov` / geprueft `vf` / PokéAPI `pa`) > bei Widerspruch OHNE
    Mehrheit der bisherige Name aus der Datei (`bisher[(cat, en)]`) >
    flagged Rueckfall PokéAPI -> PokeWiki -> geprueft -> Ergaenzung -> EN.

    DER BISHERIGE NAME BLEIBT (07.10.2026, Champions Replica Scrape #147):
    bei Dragon Scale und Macho Brace widersprachen sich PokeWiki
    ("Drachenhaut", "Machoband") und PokéAPI ("Drachenschuppe",
    "Machoschiene") — zwei Quellen, keine Mehrheit. Der Rueckfall nahm
    PokéAPI, der Bau schrieb zwei geprueft-richtige Namen um, und das Tor
    sperrte den ganzen Lauf. Eine Quelle, die sich eines Morgens anders
    aeussert, darf einen bestehenden Namen nicht kippen. Neue Eintraege
    ohne Vorgaenger nehmen weiter den Rueckfall; der Widerspruch bleibt in
    `konflikte` und damit in der Ausgabe stehen.
    """
    if korrektur.get(key):
        return korrektur[key]
    stimmen = [x for x in (ov, vf, pa) if x]
    if not stimmen:
        return ergaenzung.get(key) or en
    from collections import Counter
    zaehler = Counter(re.sub(r"[^a-zäöüß0-9]", "", str(x or "").lower()) for x in stimmen)
    oben, n = zaehler.most_common(1)[0]
    if n >= 2:
        return next(x for x in stimmen
                    if re.sub(r"[^a-zäöüß0-9]", "", str(x or "").lower()) == oben)
    if len(zaehler) > 1:
        konflikte.append((cat, en, {"PokeWiki": ov, "PokeAPI": pa, "verified": vf}))
        if bisher.get((cat, en)):
            return bisher[(cat, en)]
    return pa or ov or vf or ergaenzung.get(key) or en


def main():
    print("Fetching Champions dataset (otterlyclueless/pokemon-champions-data) …")
    champ_items = fetch_json(f"{CHAMP_BASE}/items/items.json")
    champ_abil  = fetch_json(f"{CHAMP_BASE}/abilities/abilities.json")
    champ_moves = fetch_json(f"{CHAMP_BASE}/moves/moves.json")

    print("Fetching PokéAPI German localisation …")
    de_item = pokeapi_de_map("item_names", "item_flavor_text", "item_id")
    de_abil = pokeapi_de_map("ability_names", "ability_flavor_text", "ability_id")
    de_move = pokeapi_de_map("move_names", "move_flavor_text", "move_id")
    prio_move = pokeapi_move_priority()
    ziel_move = pokeapi_move_target()

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

    # ── op.gg als zweite Quelle ───────────────────────────────────────
    # Gebaut von scripts/scrape_opgg_champions_moves.py. Zwei Aufgaben:
    #
    #   1. Deutsche Beschreibungstexte, die PokéAPI nicht fuehrt.
    #      Gemessen am 09.09.2026: 45 unserer Attacken hatten kein
    #      de_effect, op.gg deckt alle 45 ab.
    #   2. Zweiter Beleg fuer den Attackenpool. Bis heute hing der
    #      Nachtrag an einem einzigen Scraper; op.gg fuehrt 581
    #      Attacken und enthaelt alle 500 unserer — eine echte
    #      Obermenge, also als Gegenprobe brauchbar.
    #
    # Fehlt die Datei, laeuft alles wie vorher weiter (nur mit den
    # bekannten Luecken). Eine fehlende Zweitquelle darf keinen Bau
    # verhindern.
    opgg = {}
    opgg_pfad = os.path.join(DATA, "opgg_champions_moves.json")
    if os.path.exists(opgg_pfad):
        roh = json.load(open(opgg_pfad, encoding="utf-8"))
        opgg = {norm(k): v for k, v in (roh.get("attacken") or {}).items()}
        print(f"Loaded opgg_champions_moves: {len(opgg)} Attacken")
    else:
        print("  ! opgg_champions_moves.json fehlt - keine Zweitquelle")

    # Items actually available in Pokémon Champions (Serebii's Champions
    # items list, scraped by scripts/scrape_champions_items.py). The
    # otterlyclueless item list is the *full* held-item set, but Champions
    # only enables a subset (e.g. Choice Scarf yes, Choice Band/Specs no),
    # so we flag each item. Abilities/moves are already Champions-restricted
    # in the dataset. If the list is missing, default everything to available
    # (never hide on missing data).
    champ_avail_items = set()
    avail_path = os.path.join(DATA, "champions_available_items.json")
    if os.path.exists(avail_path):
        av = json.load(open(avail_path, encoding="utf-8"))
        champ_avail_items = {norm(n) for n in (av.get("items") or [])}
        print(f"Loaded champions_available_items: {len(champ_avail_items)} items")

    entries = []
    conflicts = []   # names where the sources disagree (no majority)

    # Bisherige Namen aus der Datei, die dieser Bau gleich ueberschreibt:
    # ohne Mehrheit unter den Quellen gilt der bisherige (waehle_de_name).
    bisher = {}
    try:
        for e in json.load(open(OUT, encoding="utf-8")).get("entries", []):
            if e.get("de"):
                bisher[(e.get("cat"), e.get("en"))] = e["de"]
    except Exception:  # noqa: BLE001 — Altdatei fehlt oder ist kaputt: kein Vorgaenger
        bisher = {}

    def name_key(s):
        return re.sub(r"[^a-zäöüß0-9]", "", str(s or "").lower())

    def pick_de(key, cat, en, v, pk):
        """Quellen gegenpruefen — siehe `waehle_de_name` (Mehrheit, sonst der
        bisherige Name, sonst der markierte Rueckfall)."""
        ov = (ov_move if cat == "move" else ov_item if cat == "item" else {}).get(key)  # PokeWiki
        return waehle_de_name(key, cat, en, ov, (v or {}).get("de_name"),
                              pk.get("de_name"), corr, supp, bisher, conflicts)

    def build(cat, en, en_eff, demap, mtype="", stats=None, nachgetragen=False):
        key = norm(en)
        v = verified.get(key)
        pk = demap.get(key, {})
        de = pick_de(key, cat, en, v, pk)
        # German effect: hand-verified (Champions-correct) wins, else
        # PokéAPI's official German text, else fall back to English in UI.
        de_eff = (v or {}).get("effect") or pk.get("de_eff") or ""
        op = opgg.get(key) if cat == "move" else None
        de_quelle = ""
        if not de_eff.strip() and op and (op.get("text") or "").strip():
            # Dritte Stufe der Kette: hand-geprueft -> PokéAPI -> op.gg.
            # op.gg steht bewusst HINTEN. Es ist die juengste und am
            # wenigsten gepruefte der drei Quellen; sie soll Luecken
            # schliessen, nicht bestehende Texte ersetzen.
            de_eff = op["text"]
            de_quelle = "opgg"
        if v and cat == "move" and v.get("type"):
            mtype = v["type"]
        entry = {
            "cat": cat, "en": en, "de": de, "type": mtype,
            "en_effect": clean(en_eff), "de_effect": clean(de_eff),
            "field": bool(FIELD[cat].search(en)),
            "verified": v is not None,
        }
        # Champions-verified combat stats for moves (power / accuracy / PP /
        # damage class). Only stored when present so status moves stay lean.
        if cat == "move" and stats:
            for src, dst in (("power", "power"), ("accuracy", "accuracy"),
                             ("pp", "pp"), ("damage_class", "damage_class"),
                             ("priority", "priority"), ("target", "target")):
                val = stats.get(src)
                if val is not None and val != "":
                    entry[dst] = val
            # Derived, but derived from a field that is also written out:
            # a reader who disagrees with our resolution can recompute it
            # from `target`. Absent when the target is unknown — then the
            # calculator must say "unknown", not assume single-target.
            tgt = stats.get("target")
            ueber = SPREAD_OVERRIDE.get(norm(en))
            if ueber is not None:
                entry["spread"] = ueber
            elif tgt is not None:
                entry["spread"] = tgt in SPREAD_TARGETS
        if cat == "item":
            entry["group"] = item_group(en)   # Champions item-menu category
            # Only flag as Champions-available if Serebii lists it (held
            # items / Mega Stones / berries). With no list, keep available.
            entry["champ"] = (key in champ_avail_items) if champ_avail_items else True
        else:
            entry["champ"] = True             # abilities/moves already restricted
        # Nachgetragene Attacken: AP und Genauigkeit von op.gg.
        #
        # BELEG (gemessen 09.09.2026 ueber alle 500 Attacken): Staerke
        # stimmt zwischen beiden Quellen in 500 von 500 Faellen ueberein.
        # Bei den AP gibt es sieben Abweichungen — FUENF davon sind
        # nachgetragene Attacken. Und wo sie abweichen, traegt
        # otterlyclueless genau den Mainline-Wert (Goldrausch 5 AP /
        # Genauigkeit 100; in Champions 8 / 95). Der Datensatz pflegt
        # hinter inChampions=false offenbar keine Champions-Werte.
        #
        # Deshalb: NUR fuer nachgetragene Attacken gewinnt op.gg bei
        # diesen zwei Feldern. Bei den 494 regulaeren Attacken wird ein
        # Konflikt gemeldet und NICHTS geaendert — zwei Faelle
        # (Strength Sap, Wish), und welche Quelle dort recht hat, ist
        # nicht belegt.
        if nachgetragen and op:
            uebernommen = 0
            for feld, quelle in (("pp", "pp"), ("accuracy", "accuracy")):
                wert = op.get(quelle)
                if wert is None:
                    continue
                alt_wert = entry.get(feld)
                if alt_wert != wert:
                    print(f"    {en}: {feld} {alt_wert} -> {wert} (op.gg)")
                    entry[feld] = wert
                uebernommen += 1
            # Die Marke NUR setzen, wenn wirklich etwas uebernommen wurde.
            # Beim ersten CI-Lauf am 09.09.2026 stand sie an allen sechs
            # Eintraegen, obwohl op.gg keine einzige Zahl geliefert hatte —
            # eine Herkunftsangabe, die nichts belegt, ist schlimmer als
            # keine. Siehe die Fussnote im Scraper: die Statistikfelder
            # stehen nicht im server-gerenderten HTML.
            if uebernommen:
                entry["stats_quelle"] = "opgg"
        if de_quelle:
            # Sichtbar machen, woher der deutsche Text kommt. Ohne die
            # Marke laesst sich spaeter nicht mehr sagen, welche Texte
            # von der Zweitquelle stammen.
            entry["de_effect_quelle"] = de_quelle
        if nachgetragen:
            # Nicht aus dem inChampions-Filter, sondern nachtraeglich
            # ergaenzt, weil die Champions-Nutzungsdaten die Attacke
            # belegen. Bleibt sichtbar, damit niemand den Eintrag fuer
            # eine Dubletten-Bereinigung haelt.
            entry["nachgetragen"] = True
        entries.append(entry)

    for it in champ_items:
        build("item", it["name"], it.get("description", ""), de_item)
    for ab in champ_abil:
        build("ability", ab["name"], ab.get("description", ""), de_abil)
    def move_stats(mv):
        return {"power": mv.get("power"), "accuracy": mv.get("accuracy"),
                "pp": mv.get("pp"), "damage_class": mv.get("category"),
                "priority": prio_move.get(norm(mv["name"])),
                "target": ziel_move.get(norm(mv["name"]))}

    gebaute_attacken = set()
    for mv in champ_moves:
        if not mv.get("inChampions"):
            continue  # restrict to the actual Champions movepool
        gebaute_attacken.add(norm(mv["name"]))
        build("move", mv["name"], mv.get("description", ""), de_move,
              mtype=mv.get("type", ""), stats=move_stats(mv))

    # ── Nachtrag aus den Nutzungsdaten ───────────────────────────────
    # Der inChampions-Schalter im Quelldatensatz ist unvollstaendig: es
    # gibt Attacken, die Pokémon in Champions nachweislich einsetzen
    # (sie stehen in data/champions_usage.json, gescrapet von der
    # Champions-Nutzungsstatistik) und die trotzdem inChampions=false
    # tragen. Ohne Nachtrag fehlt ihr Eintrag komplett und die Seite
    # zeigt "Typ unbekannt".
    #
    # WIE STARK DER BELEG WIRKLICH IST — nachgemessen 09.09.2026, weil
    # die erste Fassung dieses Kommentars mehr behauptet hat, als der
    # Code haelt:
    #
    #   * `championsVerified` taugt NICHT als zweiter Beleg. Das Flag
    #     steht in der Quelle bei 900 von 900 Attacken auf true, auch
    #     bei allen 406, die zu Recht draussen bleiben. Es trennt
    #     nichts.
    #   * Die Typ-Pruefung unten taugt ebenfalls nicht als zweiter
    #     Beleg. Alle 900 Quellattacken haben einen Typ. Sie bleibt als
    #     Netz stehen, greift heute aber nie.
    #
    # Der einzig wirksame Beleg ist also die Nutzungsdatei. Damit haengt
    # der Nachtrag an genau einem Scraper: schriebe
    # scripts/scrape_champions_usage.py nach einem Layout-Wechsel der
    # Quellseite einen falschen Attackennamen, und traefe der einen der
    # 406 ausgeschlossenen Namen, landete er hier als Champions-Attacke.
    #
    # Dagegen steht die Obergrenze. Ein systematischer Parse-Fehler
    # erzeugt viele falsche Namen, nicht sechs; sechs Ausreisser sind
    # ein Quellfehler, sechzig sind unser Fehler. Reisst die Grenze,
    # wird NICHTS nachgetragen und der Lauf meldet es — lieber wieder
    # "Typ unbekannt" als eine erfundene Champions-Attacke.
    NACHTRAG_OBERGRENZE = 20

    def nutzungs_attacken(nutzung):
        """norm(EN) -> Anzeigename, aus den Nutzungsdaten.

        Defensiv, weil die Datei von einem Scraper kommt: jede Ebene
        wird auf ihren Typ geprueft, statt sich auf .get() zu
        verlassen. Vorher warf eine Liste statt eines Dicts einen
        AttributeError mitten im Lauf — in CI fail-soft abgefangen,
        aber die Meldung war ein Stacktrace statt eines Befunds.
        """
        if not isinstance(nutzung, dict):
            raise ValueError("champions_usage.json: Wurzel ist kein Objekt")
        pokemon = nutzung.get("pokemon")
        if not isinstance(pokemon, dict):
            raise ValueError("champions_usage.json: 'pokemon' ist kein Objekt")
        out = {}
        for eintrag in pokemon.values():
            if not isinstance(eintrag, dict):
                continue
            for modus in ("doubles", "singles"):
                block = eintrag.get(modus)
                if not isinstance(block, dict):
                    continue
                for m in (block.get("move") or []):
                    if isinstance(m, dict) and m.get("name"):
                        out[norm(m["name"])] = m["name"]
        return out

    nutzung_pfad = os.path.join(DATA, "champions_usage.json")
    nachgetragen_n, ohne_quelle = 0, []
    if os.path.exists(nutzung_pfad):
        genutzt = nutzungs_attacken(
            json.load(open(nutzung_pfad, encoding="utf-8")))

        # Eine syntaktisch gueltige, aber leere Nutzungsdatei sah vorher
        # aus wie ein normaler Lauf: keine Meldung, 494 Attacken, rc 0,
        # committet — und die Nachtraege still wieder weg. Das ist ein
        # kaputter Eingang, kein Ergebnis.
        if not genutzt:
            raise ValueError(
                "champions_usage.json enthaelt keine einzige Attacke. "
                "Das ist ein kaputter Eingang, kein leeres Ergebnis — "
                "Abbruch, damit der committete Stand erhalten bleibt.")

        nach_name = {norm(m["name"]): m for m in champ_moves}
        kandidaten, ohne_zweitbeleg = [], []
        for key in sorted(genutzt):
            if key in gebaute_attacken:
                continue
            mv = nach_name.get(key)
            if not mv or not mv.get("type"):
                ohne_quelle.append(genutzt[key])
                continue
            # ZWEITER BELEG (seit 09.09.2026): die Attacke muss auch in
            # der Champions-Attackenliste von op.gg stehen. Vorher hing
            # der Nachtrag an genau einem Scraper — meldete der einmal
            # einen falschen Namen, waere eine Nicht-Champions-Attacke
            # ins Nachschlagewerk gerutscht. Liegt keine Zweitquelle
            # vor, gilt weiter der einfache Beleg plus Obergrenze.
            if opgg and key not in opgg:
                ohne_zweitbeleg.append(mv["name"])
                continue
            kandidaten.append(mv)
        if ohne_zweitbeleg:
            print("  ! in den Nutzungsdaten, aber NICHT bei op.gg gelistet "
                  "(nicht nachgetragen): " + ", ".join(sorted(ohne_zweitbeleg)))

        if len(kandidaten) > NACHTRAG_OBERGRENZE:
            print(f"  ! {len(kandidaten)} Nachtragskandidaten - ueber der "
                  f"Grenze von {NACHTRAG_OBERGRENZE}. Das sieht nach einem "
                  f"Fehler in den Nutzungsdaten aus, nicht nach einer "
                  f"Luecke im inChampions-Schalter. Es wird NICHTS "
                  f"nachgetragen: "
                  + ", ".join(m["name"] for m in kandidaten[:12])
                  + (" …" if len(kandidaten) > 12 else ""))
            kandidaten = []

        for mv in kandidaten:
            build("move", mv["name"], mv.get("description", ""), de_move,
                  mtype=mv["type"], stats=move_stats(mv), nachgetragen=True)
            nachgetragen_n += 1
            print(f"  + nachgetragen aus Nutzungsdaten: {mv['name']} ({mv['type']})")
        if ohne_quelle:
            print("  ! genutzte Attacken ohne Quelleintrag (NICHT ergaenzt): "
                  + ", ".join(sorted(ohne_quelle)))
    else:
        print("  ! champions_usage.json fehlt - kein Nachtrag moeglich")

    entries.sort(key=lambda e: (e["cat"], e["de"].lower()))
    counts = {"item": 0, "ability": 0, "move": 0, "field": 0, "de_effect": 0,
              "spread": 0, "target_unknown": 0, "nachgetragen": nachgetragen_n,
              "de_effect_opgg": 0}
    for e in entries:
        counts[e["cat"]] += 1
        if e["field"]:
            counts["field"] += 1
        if e["de_effect"].strip():
            counts["de_effect"] += 1
        if e.get("de_effect_quelle") == "opgg":
            counts["de_effect_opgg"] += 1
        if e["cat"] == "move" and e.get("power"):
            if e.get("spread"):
                counts["spread"] += 1
            if "spread" not in e:
                counts["target_unknown"] += 1

    # ── Gegenprobe gegen op.gg ───────────────────────────────────────
    # Melden, nicht aufloesen. Wo die beiden Quellen sich widersprechen
    # und die Attacke NICHT nachgetragen ist, bleibt unser Wert stehen
    # und der Widerspruch geht in den Lauf-Bericht. Gemessen am
    # 09.09.2026: Staerke 0 Abweichungen, AP 2, Genauigkeit 0 (nach
    # Abzug der nachgetragenen).
    opgg_konflikte = 0
    if opgg:
        for e in entries:
            if e["cat"] != "move" or e.get("nachgetragen"):
                continue
            o = opgg.get(norm(e["en"]))
            if not o:
                continue
            for feld, oschl in (("power", "power"), ("pp", "pp"),
                                ("accuracy", "accuracy")):
                unser, ihrer = e.get(feld), o.get(oschl)
                if unser is None or ihrer is None or unser is True:
                    continue
                if int(unser) != int(ihrer):
                    opgg_konflikte += 1
                    print(f"  ! op.gg-Abweichung {e['en']}: {feld} "
                          f"unser={unser} opgg={ihrer} (nicht geaendert)")
        fehlt_bei_opgg = [e["en"] for e in entries
                          if e["cat"] == "move" and norm(e["en"]) not in opgg]
        if fehlt_bei_opgg:
            print(f"  ! {len(fehlt_bei_opgg)} unserer Attacken stehen NICHT "
                  f"in der op.gg-Liste: " + ", ".join(sorted(fehlt_bei_opgg)[:10]))

    # Melden, nicht stillschweigend aufloesen: wo die hand-geprüfte
    # deutsche Prosa eine Flaechenwirkung nennt, das PokéAPI-Ziel aber
    # keine, gehoert das in den Lauf-Bericht — sonst faellt der naechste
    # Konflikt niemandem auf.
    import re as _re
    _flaeche_prosa = _re.compile(r"[Tt]rifft (beide|alle)")
    for e in entries:
        if e["cat"] != "move" or not e.get("power"):
            continue
        # Fehlender deutscher Text ist kein Widerspruch. 45 Attacken
        # haben keinen (PokéAPI fuehrt fuer sie keine deutsche
        # Beschreibung), und ohne diese Zeile meldete der Lauf sie als
        # "Prosa sagt Einzelziel" — eine Aussage, die niemand getroffen
        # hat. Aufgefallen 09.09.2026 an Make It Rain.
        if not (e.get("de_effect") or "").strip():
            continue
        prosa = bool(_flaeche_prosa.search(e.get("de_effect") or ""))
        if "spread" in e and prosa != e["spread"] and norm(e["en"]) not in SPREAD_OVERRIDE:
            print(f"  ! Ziel-Widerspruch {e['en']}: Prosa sagt "
                  f"{'Flaeche' if prosa else 'Einzelziel'}, target={e.get('target')}")

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
    # ── Von Hand entschiedene deutsche Namen, ganz zuletzt ────────────
    #
    # BEFUND (03.09.2026): diese Datei ist die VIERTE Quelle deutscher
    # Namen (1.268 Stueck) und war die einzige, die niemand gegen die
    # anderen gehalten hat — der Melder in scripts/datenluecken.py
    # vergleicht nur die drei Referenzdateien gegen
    # champions_names_de.json. Gemessen widersprach sie der Tabelle an
    # 17 Stellen, darunter neun, die schon einmal entschieden waren
    # ("Lichtelit" statt Skelabranit, "Wahlglas" statt Wahlbrille).
    #
    # Der Pokedex-Bauer wendet die Entscheidungsdatei seit dem 31.08.
    # selbst an, aus demselben Grund: eine Korrektur, die ein Neubau
    # ueberschreibt, ist keine Korrektur. Hier fehlte sie noch.
    ent_pfad = os.path.join(DATA, "champions_namen_entschieden.json")
    try:
        ent = json.load(open(ent_pfad, encoding="utf-8")).get("namen") or {}
        nach_kat = {"item": ent.get("items") or {},
                    "ability": ent.get("abilities") or {},
                    "move": ent.get("moves") or {}}
        gesetzt = 0
        for e in entries:
            rec = nach_kat.get(e.get("cat"), {}).get(e.get("en"))
            de = (rec or {}).get("de")
            if de and e.get("de") != de:
                e["de"] = de
                gesetzt += 1
        print(f"Entschiedene deutsche Namen angewandt: {gesetzt} korrigiert "
              f"(von {sum(len(v) for v in nach_kat.values())} belegten)")
    except Exception as ex:  # noqa: BLE001
        print(f"WARN: Entscheidungsdatei nicht lesbar ({ex}) — "
              f"Namen bleiben wie erzeugt")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUT}\n  {len(entries)} entries  {counts}")
    if conflicts:
        print(f"\n⚠ {len(conflicts)} name conflicts (no majority — the name already in the "
              f"file stays, new entries use the flagged fallback; confirm via NAME_CORRECTIONS):")
        for cat, en, srcs in sorted(conflicts):
            print(f"  [{cat}] {en}: " + " | ".join(f"{k}={v}" for k, v in srcs.items() if v))


if __name__ == "__main__":
    main()
