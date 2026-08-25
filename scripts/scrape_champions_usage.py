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

import datetime as dt
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
MAX_PASSES = 4   # main pass + up to 3 retry passes for slugs dropped to 503s
# Hard wall-clock budget. When the host is *sustained*-rate-limiting (e.g.
# after a burst of CI runs), retries can't recover and would otherwise grind
# for 10+ min per failing request set. Stop after this and let the regression
# guard keep the committed snapshot; the daily safety-net run retries later.
BUDGET_S = 420


def fetch(url, timeout=30, retries=3):
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

        # Items quirk: the source leaves the #1 held item's % blank. A
        # Pokémon holds exactly one item, so item shares sum to ~100% —
        # derive the missing value from the FULL list (sum of all the
        # others), not just the displayed top-N. Verified vs in-game:
        # Pelipper Focus Sash 100 − Σ(others) ≈ 45.9% (in-game 45.9%).
        derived_pct = {}   # row id() -> derived %
        if cat == "held_item":
            parsed = [(r, pct_to_float(r.get("percentage"))) for r in lst]
            blanks = [r for r, p in parsed if p is None and r.get("name", "").strip()]
            known = sum(p for _, p in parsed if p is not None)
            if len(blanks) == 1:
                derived_pct[id(blanks[0])] = round(max(0.0, 100.0 - known), 1)

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
            elif cat == "held_item":
                entry = {"name": r.get("name", "").strip(), "pct": pct}
                if pct is None and id(r) in derived_pct:
                    entry["pct"] = derived_pct[id(r)]
                    entry["derived"] = True   # computed, not source-reported
                items.append(entry)
            else:                                # move / ability / teammate
                items.append({"name": r.get("name", "").strip(), "pct": pct})
        out[OUT_KEY.get(cat, cat)] = items

    pruefe_plausibel(out)
    return out


# Wie weit darf eine Anteilsliste ueber 100 % liegen, bevor sie als kaputt
# gilt? Die Quelle rundet auf eine Nachkommastelle und zeigt eine gekuerzte
# Liste; 105 % laesst dafuer reichlich Luft. Gemessen am Datenstand vom
# 20.08.2026 liegt kein gesunder Eintrag ueber 101,4 %.
SUMMEN_GRENZE = 105.0

# Nur die Kategorien, in denen sich die Anteile auf ~100 % addieren MUESSEN.
# Attacken tun das nicht (ein Pokemon hat vier), Teamkameraden auch nicht.
SUMMEN_KATEGORIEN = ("held_item", "nature", "ability")


def pruefe_plausibel(block):
    """Meldet und entschaerft unmoegliche Anteilslisten — repariert nichts.

    Zwei Befunde vom 20.08.2026, beide in data/champions_usage.json:

      * Acht Item-Listen summieren sich auf bis zu 139,1 %, und in JEDER
        steht an Position 6 exakt 53,9 % — bei fuenf verschiedenen Items
        (Leftovers, Wise Glasses, Magnet …). Ein konstanter Wert an fester
        Position ueber neun voneinander unabhaengige Pokemon ist keine
        Nutzungszahl, sondern ein Wert aus einer anderen Spalte.
      * Sechs Wesens-Listen fuehren dieselbe Zeile zweimal (Flareon
        'Adamant', Rotom 'Bold' …); rotom-fan kommt damit auf 105,4 %.

    Was hier NICHT passiert: den richtigen Wert erraten. Er steht nur an
    der Quelle, und die ist aus dem Build heraus nicht nachpruefbar. Der
    unmoegliche Wert wird auf None gesetzt und die Liste bekommt einen
    Vermerk — eine gemeldete Luecke ist heilbar, eine falsche Zahl sieht
    richtig aus. Die Oberflaeche kann mit pct = None seit jeher umgehen.
    """
    meldungen = []

    for kat in SUMMEN_KATEGORIEN:
        liste = block.get(kat) or []
        if not liste:
            continue

        # 1. Dieselbe Zeile zweimal.
        gesehen, doppelt = set(), []
        entdoppelt = []
        for e in liste:
            n = (e.get("name") or "").strip()
            if n and n in gesehen:
                doppelt.append(n)
                continue
            gesehen.add(n)
            entdoppelt.append(e)
        if doppelt:
            meldungen.append(f"{kat}: doppelte Zeile(n) {', '.join(sorted(set(doppelt)))}")
            block[kat] = liste = entdoppelt

        # 2. Summe ueber der Grenze -> welcher Wert kann es nicht sein?
        summe = sum(e.get("pct") or 0 for e in liste)
        if summe > SUMMEN_GRENZE:
            # Die Quelle liefert diese Listen ABSTEIGEND sortiert. Ein Wert,
            # der groesser ist als sein Vorgaenger, bricht die Ordnung der
            # Quelle — und genau das tun alle acht gefundenen Faelle: die
            # 53,9 steht jeweils an Position 6 zwischen 6,7 und 5,4.
            #
            # Das ist der bessere Verdaechtige als "der Wert, dessen
            # Entfernen die Summe rettet". Bei Passimian (128,2 %) waeren
            # das ZWEI Werte: die 53,9 und der fuehrende Choice Scarf mit
            # 23,3 % — und ein fuehrender Anteil von 23 % ist voellig
            # normal. Die Ordnung zeigt eindeutig auf die 53,9.
            ausserDerReihe = []
            vorher = None
            for e in liste:
                p = e.get("pct")
                if p is None:
                    continue
                if vorher is not None and p > vorher + 0.05:
                    ausserDerReihe.append(e)
                else:
                    vorher = p
            kandidaten = [e for e in ausserDerReihe
                          if (summe - (e.get("pct") or 0)) <= SUMMEN_GRENZE]
            if len(kandidaten) == 1:
                schuld = kandidaten[0]
                roh = schuld["pct"]          # VOR dem Nullen merken
                meldungen.append(
                    f"{kat}: Summe {summe:.1f} % — '{schuld.get('name')}' "
                    f"({roh} %) auf unbekannt gesetzt")
                schuld["pct"] = None
                schuld["unplausibel"] = (
                    f"Quelle meldete {roh} %; die Liste summierte sich damit "
                    f"auf {summe:.1f} %.")
            else:
                meldungen.append(
                    f"{kat}: Summe {summe:.1f} % — kein einzelner Ausreisser, "
                    f"Liste unveraendert markiert")
            block.setdefault("_warnungen", []).append(
                f"{kat}: Anteile summierten sich auf {summe:.1f} %")

    if meldungen:
        block.setdefault("_warnungen", [])
        print("      ! " + " | ".join(meldungen))
    return block


# Kategorien, deren Anteile sich auf hoechstens ~100 % summieren muessen:
# ein Pokemon traegt EIN Item, hat EIN Wesen, hat EINE Faehigkeit. Bei
# Attacken und Mitstreitern ist eine Summe ueber 100 % normal (vier
# Attacken, fuenf Mitstreiter je Team).
# SUMMEN_KATEGORIEN und SUMMEN_GRENZE stehen schon weiter oben — dieselbe
# Regel, dieselbe Grenze. Hier kommt nur die Liste ALLER Kategorien dazu,
# denn die Doppelzeilen-Regel gilt auch fuer Attacken und Mitstreiter.
ALLE_KATEGORIEN = ("held_item", "nature", "ability", "move", "teammate")


def unmoegliche_bloecke(pokemon):
    """Welche Bloecke verletzen die Regeln, die die Daten selbst tragen?

    Zwei Regeln, beide nicht verhandelbar:

      * eine Anteilsliste einer eindeutigen Kategorie summiert sich nicht
        deutlich ueber 100 %,
      * keine Liste fuehrt dieselbe Zeile zweimal.

    Am 25.08.2026 verletzte der frische Stand beide: 16 Listen ueber 105 %
    (absol/doubles/nature 111,5 %; abomasnow/doubles/nature 117,5 %) und
    zwei doppelte Attackenzeilen. Der committete Stand davor hatte von
    beidem null. Diese Daten standen anschliessend im Deploy-Gate und
    hielten drei Auslieferungen an — deshalb prueft der Scraper das jetzt
    selbst und behaelt im Zweifel den alten Stand.

    `pruefe_plausibel` bleibt daneben bestehen: sie faengt den EINZELNEN
    Ausreisser an der gebrochenen Sortierung und markiert ihn. Diese
    Pruefung hier faengt den Fall, fuer den es keinen einzelnen
    Schuldigen gibt.
    """
    befunde = []
    for slug, eintrag in (pokemon or {}).items():
        for fmt in ("doubles", "singles"):
            block = eintrag.get(fmt)
            if not isinstance(block, dict):
                continue
            for kat in SUMMEN_KATEGORIEN:
                summe = sum(z.get("pct") or 0 for z in (block.get(kat) or []))
                if summe > SUMMEN_GRENZE:
                    befunde.append(f"{slug}/{fmt}/{kat} = {summe:.1f} %")
            for kat in ALLE_KATEGORIEN:
                namen = [str(z.get("name") or "").strip() for z in (block.get(kat) or [])]
                if len(namen) != len(set(namen)):
                    befunde.append(f"{slug}/{fmt}/{kat}: doppelte Zeile")
    return befunde


def scrape_pokemon(slug):
    """Return (display_name, record, fehlt) — fehlt=True heisst: die Quelle
    kennt diesen Slug nicht (HTTP 404).

    Der Unterschied traegt den Regressionsschutz weiter unten. Eine
    Drosselung liefert 429/503 oder einen Zeitueberlauf; ein 404 ist eine
    Aussage der Quelle: diese Seite gibt es nicht. Beides als "fehlgeschlagen"
    zu zaehlen hat den Lauf am 25.08.2026 dauerhaft blockiert — siehe die
    Erklaerung am Schutz selbst.
    """
    try:
        data = json.loads(fetch_text(f"{BASE}/api/pokemon/{slug}"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, None, True
        print(f"  WARN {slug}: api fetch failed ({e})")
        return None, None, False
    except Exception as e:  # noqa: BLE001
        print(f"  WARN {slug}: api fetch failed ({e})")
        return None, None, False

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
        return None, None, False
    rec.update(forms)

    # Mega ability: summary.forms lists each form (Base / Mega / Mega X / Y)
    # with its abilities. For a "mega-…" slug, grab the matching Mega form's
    # fixed ability — the only reliable source for it (the usage ability is
    # the PRE-mega base ability, and roster.json lacks the new M-B megas).
    slug_norm = re.sub(r"[^a-z0-9]", "", slug.lower())
    for f in (summary.get("forms") or []):
        if "mega" not in (f.get("form_kind") or "").lower():
            continue
        if re.sub(r"[^a-z0-9]", "", (f.get("saved_name") or "").lower()) == slug_norm:
            mab = (f.get("abilities") or "").split("|")[0].strip()
            if mab:
                rec["megaAbility"] = mab
            break

    return en_name, rec, False


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

    # Scrape in passes: the host rate-limits bursts, so a single pass can
    # silently drop dozens of Pokémon to 503s (observed: 302/356). Retry the
    # slugs that failed, with fewer workers + a cooldown each pass, until none
    # fail or we run out of passes. Deterministic full coverage matters more
    # than speed here.
    pokemon = {}
    season = None
    pending = list(slugs)
    # Slugs, die die API mit 404 beantwortet. Getrennt von `pending`, weil
    # sie nicht fehlgeschlagen sind — es gibt sie schlicht nicht.
    nicht_vorhanden = set()
    start = time.time()
    for attempt in range(MAX_PASSES):
        if not pending:
            break
        if time.time() - start > BUDGET_S:
            print(f"WARN: scrape budget ({BUDGET_S}s) exceeded — host likely "
                  f"rate-limiting; stopping with {len(pokemon)} so far")
            break
        if attempt > 0:
            print(f"retry pass {attempt}: {len(pending)} slugs still missing")
            time.sleep(6.0)   # let the rate limit cool down
        workers = WORKERS if attempt == 0 else 3
        failed, done = [], 0
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(scrape_pokemon, slug): slug for slug in pending}
            for fut in as_completed(futures):
                done += 1
                slug = futures[fut]
                fehlt = False
                try:
                    name, rec, fehlt = fut.result()
                except Exception as e:  # noqa: BLE001 — never let one kill the run
                    print(f"  WARN {slug}: {type(e).__name__}: {e}")
                    rec = None
                if fehlt:
                    # Die Quelle kennt den Slug nicht. Ein zweiter, dritter und
                    # vierter Versuch aendert daran nichts — er kostet nur
                    # Zeit aus dem Budget, das die echten Drosselungen
                    # brauchen.
                    nicht_vorhanden.add(slug)
                    continue
                if not rec:
                    failed.append(slug)
                    continue
                for fmt in ("doubles", "singles"):
                    if fmt in rec and rec[fmt].get("season"):
                        season = rec[fmt]["season"]
                pokemon[slug] = rec
                if attempt == 0 and (len(pokemon) <= 3 or done % 50 == 0):
                    d = (rec.get("doubles") or {})
                    nat = (d.get("nature") or [{}])[0]
                    print(f"  [{done}/{len(pending)}] {name}: doubles top nature="
                          f"{nat.get('name')} {nat.get('pct')}%")
        pending = failed
    ok = len(pokemon)
    if nicht_vorhanden:
        print(f"{len(nicht_vorhanden)} Slugs stehen in der Sitemap, aber die "
              f"API kennt sie nicht (404) — z. B. "
              f"{sorted(nicht_vorhanden)[:5]}")
    if pending:
        print(f"WARN: {len(pending)} slugs never resolved after {MAX_PASSES} "
              f"passes: {pending[:20]}")

    if ok == 0:
        print("FATAL: 0 Pokémon scraped — keeping committed JSON")
        return 1

    # Regression guard: never let a rate-limited thin scrape overwrite a good
    # snapshot. If we got noticeably fewer than last time, keep the committed
    # file (the workflow's fail-soft restores it on a non-zero exit).
    try:
        frueher_da = set(json.load(open(OUT, encoding="utf-8")).get("pokemon") or {})
    except Exception:  # noqa: BLE001
        frueher_da = set()
    prev = len(frueher_da)
    # Der Vergleichswert ist nicht die alte Gesamtzahl, sondern die alte
    # Gesamtzahl OHNE die Eintraege, die es an der Quelle nicht mehr gibt.
    #
    # Warum: am 25.08.2026 war dieser Lauf sieben Mal in Folge rot, und die
    # Datei stand seit dem 17.07. Gemessen an der Quelle:
    #
    #     Sitemap            358 Slugs
    #     davon mit API-Eintrag  238
    #     davon 404              120   — ausnahmslos Zierformen
    #                                    (Alcremie-Cremes, Castform-Wetter,
    #                                    Florges-Bluetenfarben, Furfrou-Schnitte,
    #                                    Aegislash-Klingenform)
    #
    # Die committete Datei trug 353 Eintraege. 92 % davon sind 325 — eine
    # Zahl, die die Quelle nicht mehr liefern KANN. Der erste Lauf mit der
    # neuen Regel (25.08.2026, 17:54 UTC) rechnete 115 entfallene Schluessel
    # heraus, kam auf einen Erwartungswert von 238, holte 238 und schrieb die
    # Datei zum ersten Mal seit 39 Tagen neu.
    #
    # Der Schutz hat also nicht
    # eine Drosselung abgefangen, sondern eine dauerhafte Verkleinerung der
    # Quelle in eine Dauersperre verwandelt: die Datei konnte nie wieder
    # frisch werden, und niemand sah es, weil der Schutz genau dafuer da ist,
    # dass nichts Duennes durchkommt.
    #
    # Ein 404 ist eine Aussage der Quelle, kein Ausfall. Eine Drosselung
    # meldet sich mit 429/503 oder einem Zeitueberlauf und faellt weiterhin
    # voll in den Vergleich — der Schutz bleibt fuer den Fall scharf, fuer den
    # er gebaut wurde.
    entfallen = frueher_da & nicht_vorhanden
    erwartet = prev - len(entfallen)
    if entfallen:
        print(f"{len(entfallen)} frueher vorhandene Slugs liefern jetzt 404 — "
              f"Vergleichswert {prev} -> {erwartet}")
    if erwartet and ok < erwartet * 0.92:
        print(f"FATAL: scraped {ok} Pokémon < 92% of expected {erwartet} "
              f"(previous {prev}, {len(entfallen)} von der Quelle entfernt) — "
              f"likely rate-limited; keeping committed JSON")
        return 1

    # Zweiter Schutz, andere Frage: nicht "ist es genug?", sondern "kann es
    # stimmen?". Ein Stand, der die eigenen Regeln verletzt, darf nicht in
    # die Auslieferung — dort haelt er sonst den ganzen Deploy an, so wie am
    # 25.08.2026 dreimal hintereinander. Auch hier wird nichts geraten: der
    # alte Stand bleibt stehen, der Lauf wird rot und sagt, was er gesehen hat.
    unmoeglich = unmoegliche_bloecke(pokemon)
    if unmoeglich:
        print(f"FATAL: {len(unmoeglich)} Bloecke verletzen die Plausibilitaets"
              f"regeln — der committete Stand bleibt stehen. Die ersten zehn:")
        for zeile in unmoeglich[:10]:
            print(f"  {zeile}")
        return 1

    out = {
        "_meta": {
            "source": "championsbattledata.com — public mirror of the in-game "
                      "Pokémon Champions ranked usage analysis (nature, SP "
                      "spread, item, move, ability, teammate), per format.",
            # Zeitstempel jedes ERFOLGREICHEN Laufs. Bis 21.08.2026 trug die
            # Datei kein Datum, und die Seite zeigte die Zahlen trotzdem als
            # "Saison: Current" — am 21.08. waren sie 35 Tage alt, weil
            # championsbattledata.com den Scrape aus CI-IPs drosselt und der
            # Job zwar rot wurde, aber nichts mehr committete.
            #
            # Ohne dieses Feld laesst sich Frische nicht pruefen: das
            # Git-Datum der Datei taugt nicht, weil Fremd-Aenderungen (z. B.
            # eine Plausibilitaetskorrektur) sie anfassen und damit frisch
            # aussehen lassen. Nur der Scraper selbst weiss, wann er zuletzt
            # wirklich Daten geholt hat.
            #
            # Das Feld entsteht erst mit dem naechsten erfolgreichen Lauf.
            # data_guardian und Frontend behandeln sein Fehlen deshalb als
            # "Stand unbekannt", nicht als Fehler.
            "scraped_at": dt.datetime.now(dt.timezone.utc)
                            .replace(microsecond=0).isoformat(),
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
