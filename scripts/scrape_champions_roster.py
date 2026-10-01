#!/usr/bin/env python3
"""Refresh data/champions_roster_extra.json — the Champions roster
additions that aren't yet in the otterlyclueless M-A dataset (e.g. the
Regulation M-B Pokémon + new Mega Evolutions). The Pokédex build reads
this file and resolves each name's stats/types from Smogon.

Base species come from pokebase.app's Champions dex (the live list of
which Pokémon are in the game). The new Mega Evolutions are a curated
list from official M-B coverage. Every entry is kept only if it resolves
in the committed Smogon data (data/pokemon_battle_data.json), so a bad
scrape can never inject an unbacked Pokémon.

Network: pokebase blocks generic bots locally; this runs in CI with a
browser User-Agent. Fail-soft — the caller keeps the committed JSON.
"""

import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SMOGON_PATH = os.path.join(ROOT, "data", "pokemon_battle_data.json")
OUT = os.path.join(ROOT, "data", "champions_roster_extra.json")
POKEBASE = "https://pokebase.app/pokemon-champions/pokemon"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36"}

# New Mega Evolutions introduced in Regulation M-B (Smogon keys). From
# official coverage (pokemon.com / Serebii / Game8). Megas are rarely
# discoverable from a dex list, so they stay curated; add to this list
# when a future regulation introduces more.
NEW_MEGAS = [
    "Sceptile-Mega", "Blaziken-Mega", "Swampert-Mega", "Mawile-Mega",
    "Metagross-Mega", "Staraptor-Mega", "Scolipede-Mega", "Scrafty-Mega",
    "Eelektross-Mega", "Pyroar-Mega", "Malamar-Mega", "Barbaracle-Mega",
    "Dragalge-Mega", "Falinks-Mega", "Raichu-Mega-X", "Raichu-Mega-Y",
]

# Formen, die pokebase zwar fuehrt, deren Slug aber nicht auf einen
# Smogon-Schluessel abbildet.
#
# BEFUND (31.08.2026): pokebase listet die drei Paldea-Tauros als
# "tauros-paldea-aqua-breed" / "tauros-paldea-blaze-breed"; daraus macht
# slug_to_smogon "Tauros-Paldea-Aqua-Breed", was Smogon nicht kennt
# ("Tauros-Paldea-Aqua"). Sie fielen deshalb still aus der Liste — und
# die Gefechtvariante kam ueber den otterlyclueless-Roster herein und
# trug den Namen aller drei.
#
# Wichtiger als der Fall selbst ist die Stelle: diese Datei wird von
# champions-replica-scrape.yml taeglich NEU geschrieben. Wer die
# Schluessel nur in data/champions_roster_extra.json eintraegt, verliert
# sie beim naechsten Lauf — mit rotem Test und angehaltenem Deploy.
# Kuratierte Zugaenge gehoeren hierher, wie NEW_MEGAS.
EXTRA_FORMEN = [
    "Tauros-Paldea-Blaze",   # pokebase: tauros-paldea-blaze-breed, Kampf/Feuer
    "Tauros-Paldea-Aqua",    # pokebase: tauros-paldea-aqua-breed,  Kampf/Wasser
]

TEAMS_PATH = os.path.join(ROOT, "data", "champions_replica_teams.json")
USAGE_PATH = os.path.join(ROOT, "data", "champions_usage.json")
POKEDEX_PATH = os.path.join(ROOT, "data", "champions_pokedex.json")

# Teamnamen, die eine Form meinen, die der Pokedex unter der Grundform
# fuehrt. Ohne diese Zeilen wuerden sie als "fehlt" gelesen und ein
# zweites Mal angelegt. Dieselben zwei Faelle kennt auch
# js/app-side-quest-pokedex.js (TEAM_AUSNAHMEN) — dort fuer die
# Auftrittszaehlung, hier fuer die Kaderergaenzung.
TEAM_UNTER_GRUNDFORM = {
    "Floette-Eternal": "Floette",
    "Maushold-Four": "Maushold",
}


def _lade(pfad):
    try:
        with open(pfad, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:  # noqa: BLE001
        print("WARN: %s nicht lesbar (%s)" % (pfad, e), file=sys.stderr)
        return None


def team_arten(teams):
    """Die Smogon-Namen aller Pokemon aus den Replica-Teams."""
    raus = []
    for t in (teams or {}).get("teams", []):
        for p in t.get("pokemon", []):
            nm = str((p or {}).get("name") or "").strip()
            if not nm:
                continue
            nm = TEAM_UNTER_GRUNDFORM.get(nm, nm)
            if nm not in raus:
                raus.append(nm)
    return raus


def aus_teams(vorhanden, smogon, teams):
    """WER IN DEN TOP-TEAMS STEHT, GEHOERT IN DEN KADER.

    BEFUND 15.09.2026: der Pokedex meldete selbst "9 Pokémon aus den
    aktuellen Replica-Teams fehlen hier noch" — darunter Indeedee-F mit
    23 Auftritten, das zweithaeufigste der fehlenden. Der Hinweis war
    ehrlich, aber er wartete auf eine Quelle, die nicht nachzieht.

    Dieselbe Regel wie bei aus_mega() darueber, nur mit einem anderen
    Beleg: die Replica-Teams sind echte Top-Teams aus dem Spielbetrieb
    (data/champions_replica_teams.json, taeglich gescrapt). Wer dort
    gespielt wird, ist im Spiel. Die Basiswerte kommen aus derselben
    Smogon-Datei wie bei jedem anderen Schluessel; wer dort fehlt, kommt
    NICHT herein, sondern wird gemeldet.

    Die Regel haengt an ihrer Bedingung, nicht an einer Namensliste:
    zieht die Kaderquelle nach, findet die Art sich ohnehin schon in
    `vorhanden` und wird nicht doppelt angelegt.
    """
    neu, ohne = [], []
    for nm in team_arten(teams):
        if nm in vorhanden or nm in neu:
            continue
        if nm in smogon and "baseStats" in smogon[nm]:
            neu.append(nm)
        else:
            ohne.append(nm)
    return neu, ohne


def geschlechtsformen(vorhanden, smogon, usage):
    """MAENNLICH UND WEIBLICH SIND ZWEI VIECHER, WENN DIE DATEN ES SAGEN.

    Bestellt am 15.09.2026: "bei Salmagnis müssen wir einen unterschied
    zwischen männlich und weiblich machen. Generell da wo männlich und
    weiblich unterschiedliche Statuswerte und entsprechend
    unterschiedliche Nutzung haben."

    Gemessen in data/pokemon_battle_data.json und
    data/champions_usage.json:

        Basculegion-F   Atk 112 -> 92, SpA 80 -> 100   eigene Nutzungszeile
        Indeedee-F      KP 60 -> 70, SpA 105 -> 95     eigene Nutzungszeile
        Meowstic-F      Werte gleich                   eigene Nutzungszeile
        Oinkologne-F    Werte anders                   KEINE Nutzungszeile

    Aufgenommen wird, WER EINE EIGENE NUTZUNGSZEILE HAT. Das ist der
    belegbare Teil von "unterschiedliche Nutzung": championsbattledata.com
    fuehrt die Form getrennt, also wird sie getrennt gespielt. Ob die
    Werte dazu auch abweichen, entscheidet nicht ueber die Aufnahme —
    Meowstic-F hat dieselben Werte und trotzdem eigene Faehigkeiten,
    Attacken und Wesen (Modest 51 % gegen Adamant 57 % beim maennlichen
    Salmagnis). Eine gemeinsame Zeile wuerde die eine Haelfte davon
    verschweigen.

    Oinkologne-F bleibt draussen: ohne Nutzungszeile ist nicht belegt,
    dass die Form in Champions ueberhaupt spielbar ist.
    """
    zeilen = set((usage or {}).get("pokemon", {}).keys())
    neu = []
    for k in list(vorhanden):
        for endung in ("-F", "-M"):
            form = k + endung
            if form in vorhanden or form in neu:
                continue
            if form not in smogon or "baseStats" not in smogon[form]:
                continue
            if form.lower() not in zeilen:
                continue
            neu.append(form)
    # ZWEITER WEG, OHNE DEN KADER DER QUELLE (01.10.2026).
    #
    # BEFUND: Der Replica-Lauf vom 01.10. (04:02 UTC, Lauf #139, und der
    # Neulauf um 07:40) hielt am Tor: "nur 2 Geschlechtsformen im Pokedex",
    # "Psiaugon-Eintraege fehlen". Meowstic-F stand im Kader nur, weil die
    # Top-Teams es spielten (aus_teams) — nicht, weil diese Funktion es
    # fand. Der Grund: `vorhanden` kennt nur, was pokebase listet. pokebase
    # fuehrt Indeedee als "indeedee-female/-male" und Meowstic gar nicht,
    # die Grundform kam aus dem otterlyclueless-Roster, den diese Datei
    # nicht sieht. Wechselten die Teams, fiel die Form heraus und mit ihr
    # der Test — ein Pendel nach den Teams, dieselbe Bauart wie SC-1.
    #
    # Dieselbe Bedingung, anderer Beleg: hat die Form eine eigene
    # Nutzungszeile UND die Grundform ebenfalls, wird beides gespielt, und
    # die Grundform muss nicht in `vorhanden` stehen. Basiswerte weiterhin
    # nur aus Smogon; wer dort fehlt, kommt nicht herein.
    for schluessel in sorted(zeilen):
        for endung in ("-f", "-m"):
            if not schluessel.endswith(endung):
                continue
            if schluessel[:-len(endung)] not in zeilen:
                continue
            form = slug_to_smogon(schluessel)
            if form in vorhanden or form in neu:
                continue
            if form not in smogon or "baseStats" not in smogon[form]:
                continue
            neu.append(form)
    return neu


# Nutzungsschluessel, die sich NICHT durch Grossschreiben der Teile in
# einen Smogon-Namen verwandeln lassen. Beide tragen ein Zeichen, das
# der Schluessel nicht hergibt (typografischer Apostroph, Punkt).
# Nachgeschlagen in data/pokemon_battle_data.json am 16.09.2026, nicht
# geraten — dort stehen sie woertlich als "Farfetch’d" und "Mr. Mime".
SLUG_SONDERFALL = {
    "farfetch-d": "Farfetch’d",
    "mr-mime": "Mr. Mime",
    "mr-mime-galar": "Mr. Mime-Galar",
    "mime-jr": "Mime Jr.",
    "sirfetch-d": "Sirfetch’d",
}


def als_schluessel(name):
    """Smogon-Name oder Anzeigename -> Form eines Nutzungsschluessels.

    "Rotom-Fan" und "Rotom (Fan)" werden beide "rotom-fan",
    "Farfetch’d" wird "farfetch-d", "Mr. Mime" wird "mr-mime".
    """
    return re.sub(r"[^a-z0-9]+", "-", str(name or "").lower()).strip("-")


def pokedex_schluessel(pokedex, ohne=()):
    """Alles, woran der Pokedex einen Eintrag wiedererkennt.

    Zwei Schreibweisen, weil beide vorkommen: `meta.slug` ist der
    Nutzungsschluessel ("rotom-wash"), `en` der Anzeigename
    ("Rotom (Wash)"). Der Anzeigename wird auf dieselbe Form gebracht
    wie ein Nutzungsschluessel, damit ein Vergleich ueberhaupt moeglich
    ist.

    `ohne`: Smogon-Namen, deren Eintraege NICHT mitzaehlen — die Formen,
    die diese Datei beim letzten Lauf selbst ergaenzt hat (siehe
    nutzungsformen, "Das Pendel").
    """
    ausnehmen = {als_schluessel(n) for n in (ohne or ())}
    raus = set()
    for e in (pokedex or {}).get("entries", []):
        slug = str(((e or {}).get("meta") or {}).get("slug") or "").lower()
        en = als_schluessel((e or {}).get("en"))
        if ausnehmen and (slug in ausnehmen or en in ausnehmen):
            continue
        if slug:
            raus.add(slug)
        if en:
            raus.add(en)
    return raus


def nutzungsformen(vorhanden, smogon, usage, pokedex, eigene=()):
    """FORMEN, DIE GESPIELT WERDEN UND IM POKEDEX FEHLEN.

    ANLASS (Betreiber, 16.09.2026): "es sind nicht alle Rotoms waehlbar
    beim Gegner gerade gesehen".

    Er hat recht, und es betraf nicht nur Rotom. GEMESSEN am Stand vom
    16.09.2026 gegen data/champions_pokedex.json: 27 Schluessel aus
    data/champions_usage.json haben dort keinen Eintrag. Die Oberflaeche
    kann sie deshalb gar nicht anbieten — der Rechner baut seine Liste
    aus dem Pokedex (buildRoster in js/app-side-quest-matchups.js).

        rotom-heat, rotom-frost, rotom-fan, rotom-mow   (rotom-wash war da)
        arboliva, inteleon, persian, persian-alola, grapploct, qwilfish,
        vileplume, squawkabilly(+yellow), swalot, musharna, wigglytuff,
        perrserker, mabosstiff, lycanroc-midnight, toxtricity-low-key,
        gourgeist-small/large/super, farfetch-d, mr-mime

    Das ist dieselbe Luecke, die seit dem 08.09.2026 als "17 Arten ohne
    Pokedex-Eintrag" in den Projektberichten steht — nur vollstaendig
    gemessen statt geschaetzt.

    AUFGENOMMEN WIRD, WER ZWEI BELEGE HAT — genau wie bei den
    Geschlechtsformen eine Funktion darueber:

      1. Eine EIGENE Nutzungszeile in data/champions_usage.json.
         championsbattledata.com fuehrt die Form getrennt, sie wird also
         getrennt gespielt. Das ist der Beleg dafuer, dass es sie in
         Champions ueberhaupt gibt.
      2. Basiswerte in data/pokemon_battle_data.json (Smogon). Ohne die
         waere der Eintrag eine Zeile ohne Zahlen, und der Rechner
         koennte mit ihm nichts anfangen.

    Fehlt der zweite, bleibt die Form draussen und wird GEMELDET, nicht
    ergaenzt. Geraten wird nichts.

    WARUM GEGEN DEN POKEDEX UND NICHT GEGEN roster.json: die Frage ist
    woertlich "was kann die Oberflaeche anbieten", und das entscheidet
    der Pokedex. roster.json fuehrt Anzeigenamen ("Mega Venusaur"), die
    erst uebersetzt werden muessten — eine Uebersetzung, die hier
    danebenliegen und die Art dann doppelt anlegen koennte. Der Pokedex
    fuehrt beide Schreibweisen selbst mit.

    DAS PENDEL (SC-1, gemessen 26.09.2026). Hier stand bis dahin: „Der
    Vergleich gegen den ZULETZT GEBAUTEN Pokedex heilt sich selbst." Er
    heilte nicht, er PENDELTE. Der Pokedex enthaelt die Formen, die diese
    Funktion beim letzten Lauf ergaenzt hat. Beim naechsten Lauf standen
    sie deshalb in `da`, wurden NICHT mehr ergaenzt, fielen beim
    Pokedex-Bau heraus — und der uebernaechste Lauf ergaenzte sie wieder.
    Zwei Laeufe am Tag (champions-replica-scrape 04:00 UTC,
    champions-usage-refresh 05:00 UTC) machten daraus jeden Morgen
    142 -> 166 Kaderschluessel und 319 -> 343 Pokedex-Eintraege; eine
    Stunde lang fehlten 24 Formen und test_champions_sprites.py hielt den
    Deploy an.

    Deshalb zaehlen die Eintraege, die aus `eigene` (dem letzten
    `_meta.aus_nutzung` dieser Datei) stammen, beim Abgleich NICHT mit.
    Die Antwort haengt damit nur noch an den anderen Quellen des Kaders,
    nicht an ihrem eigenen Echo — sie ist bei jedem Lauf dieselbe.
    Faellt die Nutzungszeile einer Form weg, faellt sie auch hier
    heraus: `eigene` nimmt nur aus dem Abgleich, es haelt nichts fest.
    """
    da = pokedex_schluessel(pokedex, ohne=eigene)
    neu, ohne_werte = [], []
    for schluessel in sorted((usage or {}).get("pokemon", {}).keys()):
        if schluessel in da:
            continue
        nm = slug_to_smogon(schluessel)
        if nm in vorhanden or nm in neu:
            continue
        if TEAM_UNTER_GRUNDFORM.get(nm):
            continue
        if nm not in smogon or "baseStats" not in smogon[nm]:
            ohne_werte.append(schluessel)
            continue
        neu.append(nm)
    return neu, ohne_werte


def slug_to_smogon(slug):
    """pokebase slug → Smogon species name. 'ninetales-alola' →
    'Ninetales-Alola'; 'kommo-o' → 'Kommo-o' (the trailing 'o' stays
    lowercase as it's part of the name, not a form)."""
    if slug in SLUG_SONDERFALL:
        return SLUG_SONDERFALL[slug]
    parts = slug.split("-")
    out = [parts[0].capitalize()]
    for p in parts[1:]:
        out.append("o" if p == "o" else p.capitalize())
    return "-".join(out)


def main():
    smogon = json.load(open(SMOGON_PATH, encoding="utf-8"))
    try:
        req = urllib.request.Request(POKEBASE, headers=UA)
        html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
        slugs = sorted(set(re.findall(r"/pokemon-champions/pokemon/([a-z0-9-]+)", html)))
    except Exception as e:  # noqa: BLE001
        print(f"ERROR fetching pokebase: {e}", file=sys.stderr)
        return 1

    base = []
    for s in slugs:
        if s.startswith("page-"):        # JS chunk filename, not a Pokémon
            continue
        nm = slug_to_smogon(s)
        if nm in smogon and "baseStats" in smogon[nm]:
            base.append(nm)
    if len(base) < 40:
        print(f"ERROR: only {len(base)} base species parsed — refusing to overwrite",
              file=sys.stderr)
        return 1

    megas = [m for m in NEW_MEGAS if m in smogon]
    formen = [f for f in EXTRA_FORMEN if f in smogon]
    fehlend = [f for f in EXTRA_FORMEN if f not in smogon]
    if fehlend:
        print(f"WARN: kuratierte Formen ohne Smogon-Eintrag: {fehlend}", file=sys.stderr)
    # ── OHNE GRUNDFORM KEINE MEGA-FORM ──────────────────────────────
    #
    # BEFUND 15.09.2026, gemeldet vom Betreiber: "wieso wird Tandrak bei
    # Pokemon nicht angezeigt? weil ohne Tandrak kein Mega Tandrak".
    #
    # Er hat recht, und zwar nicht als Geschmacksfrage: eine Mega-Form
    # ENTSTEHT aus ihrer Grundform. Wer Mega-Tandrak spielt, hat Tandrak.
    # Der Pokedex fuehrte trotzdem acht Mega-Formen ohne ihre Grundform:
    #
    #   Sceptile-Mega, Scolipede-Mega, Eelektross-Mega, Pyroar-Mega,
    #   Malamar-Mega, Barbaracle-Mega, Dragalge-Mega, Falinks-Mega
    #
    # Ursache ist die Quelle, nicht wir: pokebase.app fuehrt die
    # Mega-Seiten, die Grundform-Seiten aber (noch) nicht. Aus der Liste
    # der gelesenen Slugs fielen sie deshalb heraus.
    #
    # GERATEN WIRD HIER NICHTS. Zwei unabhaengige Belege, beide am
    # 15.09.2026 gemessen:
    #   1. Die Spielmechanik: eine Mega-Form ohne Grundform gibt es nicht.
    #   2. data/champions_usage.json — championsbattledata.com fuehrt fuer
    #      ALLE ACHT Grundformen echte Nutzungszeilen aus dem Ranglisten-
    #      betrieb. Sie werden also gespielt, nicht nur abgeleitet.
    # Die Basiswerte kommen aus derselben Smogon-Datei, aus der auch jeder
    # andere Schluessel dieser Liste seine bezieht; wer dort fehlt, kommt
    # NICHT herein.
    #
    # Die Regel haengt bewusst an ihrer Bedingung und nicht an einer Liste
    # von acht Namen: der Kader der Quelle dreht sich woechentlich
    # (CLAUDE.md, "Eine Regel gehoert an ihre Bedingung"). Eine Handliste
    # waere in einer Woche falsch — in beide Richtungen.
    vorhanden = set(base) | set(megas) | set(formen)
    aus_mega = []
    ohne_werte = []
    for k in megas + base:
        if "-Mega" not in k:
            continue
        grundform = k.split("-Mega")[0]
        if grundform in vorhanden or grundform in aus_mega:
            continue
        if grundform in smogon and "baseStats" in smogon[grundform]:
            aus_mega.append(grundform)
        else:
            ohne_werte.append((k, grundform))
    if aus_mega:
        print("Grundformen aus vorhandenen Mega-Formen ergaenzt (%d): %s"
              % (len(aus_mega), ", ".join(sorted(aus_mega))))
    if ohne_werte:
        # Nicht still uebergehen: hier fehlt eine Grundform, die es geben
        # MUSS, und wir haben keine Werte dafuer.
        print("WARN: Mega-Form ohne Grundform UND ohne Smogon-Werte: %s"
              % ", ".join("%s -> %s" % t for t in ohne_werte), file=sys.stderr)

    # Was die Top-Teams spielen und der Kader noch nicht fuehrt.
    vorhanden = vorhanden | set(aus_mega)
    teams_neu, teams_ohne = aus_teams(vorhanden, smogon, _lade(TEAMS_PATH))
    if teams_neu:
        print("Aus den Replica-Teams ergaenzt (%d): %s"
              % (len(teams_neu), ", ".join(sorted(teams_neu))))
    if teams_ohne:
        # Benannt, nicht verschwiegen: hier wird etwas gespielt, wofuer
        # keine Basiswerte vorliegen.
        print("WARN: in Teams gespielt, ohne Smogon-Werte: %s"
              % ", ".join(sorted(teams_ohne)), file=sys.stderr)

    # Geschlechtsformen mit eigener Nutzungszeile.
    vorhanden = vorhanden | set(teams_neu)
    geschlecht = geschlechtsformen(vorhanden, smogon, _lade(USAGE_PATH))
    if geschlecht:
        print("Geschlechtsformen mit eigener Nutzungszeile (%d): %s"
              % (len(geschlecht), ", ".join(sorted(geschlecht))))

    # Formen mit eigener Nutzungszeile, die der Pokedex nicht fuehrt.
    vorhanden = vorhanden | set(geschlecht)
    # Was diese Datei beim letzten Lauf selbst ergaenzt hat — gegen das
    # Pendel, siehe nutzungsformen().
    frueher = ((_lade(OUT) or {}).get("_meta") or {}).get("aus_nutzung") or []
    nutzung_neu, nutzung_ohne = nutzungsformen(
        vorhanden, smogon, _lade(USAGE_PATH), _lade(POKEDEX_PATH), eigene=frueher)
    if nutzung_neu:
        print("Formen mit eigener Nutzungszeile, im Pokedex bisher ohne Eintrag (%d): %s"
              % (len(nutzung_neu), ", ".join(sorted(nutzung_neu))))
    if nutzung_ohne:
        # Benannt, nicht verschwiegen: hier wird etwas gespielt, wofuer
        # keine Basiswerte vorliegen. Ein Eintrag ohne Zahlen waere im
        # Rechner eine Zeile, die nichts rechnen kann.
        print("WARN: eigene Nutzungszeile, aber keine Smogon-Werte: %s"
              % ", ".join(sorted(nutzung_ohne)), file=sys.stderr)

    # Stable, de-duplicated key list (base first, then megas, then forms).
    seen, keys = set(), []
    for k in base + aus_mega + teams_neu + geschlecht + nutzung_neu + megas + formen:
        if k not in seen:
            seen.add(k)
            keys.append(k)

    out = {
        "_meta": {
            "description": "Champions roster additions not in the otterlyclueless "
                           "M-A dataset. Base species from pokebase.app Champions dex; "
                           "new Mega Evolutions from official M-B coverage. Stats/types "
                           "resolved from Smogon; German names from PokéAPI. "
                           "Kuratierte Einzelformen (EXTRA_FORMEN in "
                           "scripts/scrape_champions_roster.py), deren pokebase-Slug "
                           "nicht auf einen Smogon-Schluessel abbildet, kommen zuletzt.",
            "sources": [POKEBASE, "official M-B Mega coverage", "Smogon (pokemon-showdown)"],
            "base_count": len(base),
            "aus_mega_count": len(aus_mega),
            "mega_count": len(megas),
            "form_count": len(formen),
            "aus_mega": sorted(aus_mega),
            "aus_teams": sorted(teams_neu),
            "aus_teams_count": len(teams_neu),
            "aus_teams_ohne_werte": sorted(teams_ohne),
            "geschlechtsformen": sorted(geschlecht),
            "geschlechtsformen_count": len(geschlecht),
            "aus_nutzung": sorted(nutzung_neu),
            "aus_nutzung_count": len(nutzung_neu),
            "aus_nutzung_ohne_werte": sorted(nutzung_ohne),
        },
        "smogonKeys": keys,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Wrote {OUT} — {len(base)} base + {len(aus_mega)} aus Mega-Formen "
          f"+ {len(teams_neu)} aus Teams + {len(geschlecht)} Geschlechtsformen "
          f"+ {len(megas)} mega + {len(formen)} Formen = {len(keys)} keys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
