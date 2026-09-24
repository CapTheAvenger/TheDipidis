#!/usr/bin/env python3
"""Beweist nach jedem Lauf, was frisch ist — und was nicht, und warum.

WARUM ES DIESES SKRIPT GIBT
---------------------------
Frage des Betreibers am 10.09.2026: „Erledigt der Lauf eigentlich
wirklich alle Scraper, oder sind danach irgendwelche Daten noch nicht
auf dem aktuellsten Stand?"

Die Antwort liess sich bis dahin nicht geben. `data/data_stand.json`
fuehrt je Datei den Zeitpunkt der letzten INHALTLICHEN Aenderung — und
eine Datei, die seit 41 Tagen unveraendert ist, kann zweierlei heissen:

    (a) der Scraper lief nicht                → ein Fehler
    (b) der Scraper lief, die Quelle hat nichts Neues → kein Fehler

Genau dieser Unterschied fehlte. Am 10.09.2026 sahen vier
City-League-Dateien 41 Tage alt aus; nachgesehen im Browser stand auf
limitlesstcg.com/tournaments/jp der Satz „The current City League season
has concluded" — Fall (b), also in Ordnung. Ohne den Blick in die Quelle
war das aus den Daten nicht zu unterscheiden.

WAS DIESES SKRIPT TUT
---------------------
Es legt beide Quellen nebeneinander:

    data/data_stand.json      wann hat sich der INHALT zuletzt geaendert
    data/_job_heartbeats.json wann lief der ERZEUGER zuletzt erfolgreich

und meldet nur, was wirklich eine Luecke ist:

    STILL   Erzeuger lief nicht in der erwarteten Frist  -> Befund
    RUHIG   Erzeuger lief, Inhalt aendert sich nicht     -> kein Befund,
                                                            wird benannt
    FRISCH  beides aktuell

Ausgabe ist eine Tabelle plus eine Zusammenfassung fuer die
Laufuebersicht. Der Rueckgabewert ist 0, solange kein Erzeuger stumm
ist — gemeldet wird, nicht blockiert (CLAUDE.md: „Report, don't silently
repair").
"""

import argparse
import datetime as dt
import json
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEN = os.path.join(WURZEL, "data")

# Wie oft ein Erzeuger laufen SOLL, in Tagen. Abgeleitet aus den
# Zeitplaenen in .github/workflows/ (Stand 10.09.2026).
#
#   2  -> Di+Fr-Lauf (weekly-full-update.yml, cron '0 6 * * 2,5').
#         Zwischen Freitag und Dienstag liegen vier Tage, deshalb 5 als
#         Frist statt 2 — sonst meldet der Montag jede Woche.
#   1.5-> taeglich (champions-replica-scrape, limitless-api-scrape,
#         daily-price-refresh, data-guardian)
#   9  -> woechentlich (cardmarket-card-images So, prizepack So,
#         verify-cardmarket-mapping Mi)
ERWARTET_TAGE = {
    "taeglich": 1.5,
    "zweimal_woechentlich": 5.0,
    "woechentlich": 9.0,
}

# Erzeuger -> Rhythmus. Die Namen sind die Schluessel aus
# data/_job_heartbeats.json.
RHYTHMUS = {
    # Di + Fr
    "core/update_sets.py": "zweimal_woechentlich",
    "core/prepare_card_data.py": "zweimal_woechentlich",
    "scrapers/all_cards_scraper.py": "zweimal_woechentlich",
    "scrapers/japanese_cards_scraper.py": "zweimal_woechentlich",
    "scrapers/cardmarket_id_mapper.py": "zweimal_woechentlich",
    "scrapers/cardmarket_price_merger.py": "zweimal_woechentlich",
    "scrapers/current_meta_analysis_scraper.py": "zweimal_woechentlich",
    "scrapers/limitless_online_scraper.py": "zweimal_woechentlich",
    "scrapers/online_tournament_scraper.py": "zweimal_woechentlich",
    "scrapers/tournament_scraper_JH.py": "zweimal_woechentlich",
    "scrapers/labs_tournament_scraper.py": "zweimal_woechentlich",
    "scrapers/per_decklist_scraper.py": "zweimal_woechentlich",
    "scrapers/player_continuity_scraper.py": "zweimal_woechentlich",
    "scrapers/limitless_online_decklist_scraper.py": "zweimal_woechentlich",
    "scrapers/city_league_analysis_scraper.py": "zweimal_woechentlich",
    "scrapers/city_league_archetype_scraper.py": "zweimal_woechentlich",
    "scrapers/city_league_past_analysis_scraper.py": "zweimal_woechentlich",
    "scrapers/city_league_past_archetype_scraper.py": "zweimal_woechentlich",
    "scrapers/archetype_icons_scraper.py": "zweimal_woechentlich",
    "scrapers/pokemon_card_text_scraper.py": "zweimal_woechentlich",
    "scrapers/pokemon_card_effects_scraper.py": "zweimal_woechentlich",
    "scrapers/scrape_pokemonproxies_urls.py": "zweimal_woechentlich",
    "scripts/build_online_fenster.py": "zweimal_woechentlich",
    "tools/build_threat_intel.py": "zweimal_woechentlich",
    # taeglich
    "scrapers/champions_replica_scraper.py": "taeglich",
    "scripts/scrape_champions_usage.py": "taeglich",
    "scripts/scrape_champions_roster.py": "taeglich",
    "scripts/scrape_champions_items.py": "taeglich",
    "scripts/scrape_opgg_champions_moves.py": "taeglich",
    "scripts/scrape_pokemon_go_liste.py": "taeglich",
    "scripts/scrape_pokemon_go_shiny.py": "taeglich",
    "scripts/scrape_de_names.py": "taeglich",
    "scripts/scrape_pokemonproxies.py": "taeglich",
    "scripts/build_champions_resources.py": "taeglich",
    "scripts/build_champions_pokedex.py": "taeglich",
    "scripts/build_champions_editionen.py": "taeglich",
    # NACHGETRAGEN 22.09.2026. Diese drei fuehrten einen Herzschlag in
    # data/_job_heartbeats.json, standen aber in KEINER der beiden Listen
    # und konnten damit nie einen Befund ausloesen — weder "stumm" noch
    # "bewusst ohne Zeitplan". Der Satz "Alle Erzeuger mit Zeitplan haben
    # in ihrer Frist gelaufen" war wahr und deckte weniger ab, als er
    # klang. Gegen genau diese Luecke steht jetzt
    # tests/python/test_frischepruefung_deckt_alle_erzeuger.py.
    "scrapers/scrape_kartentexte.py": "zweimal_woechentlich",
    "scripts/build_champions_item_sprites.py": "taeglich",
    "scripts/build_champions_move_flags.py": "taeglich",
    # NACHGETRAGEN 24.09.2026 — UND ES IST DERSELBE FEHLER WIE OBEN.
    # Die beiden Victory-Road-Scraper kamen mit dem Umbau des
    # Champions-Reiters dazu (PR #812), haengen im Wochenlauf und
    # schreiben dort einen Herzschlag. In keiner der beiden Listen zu
    # stehen war beim Bauen als Nebenbefund GEMELDET und nicht behoben —
    # und hat dann den Wochenlauf 150 nach 51 Minuten Scrapen
    # abgebrochen. Ein gemeldeter Befund, der einen Lauf anhaelt, war
    # kein Nebenbefund.
    "scrapers/victory_road_major_scraper.py": "woechentlich",
    "scrapers/victory_road_replika_scraper.py": "woechentlich",
}

# Erzeuger, die BEWUSST keinen Zeitplan haben — mit der Begruendung.
# Sie erscheinen in der Uebersicht, loesen aber nie einen Befund aus.
OHNE_ZEITPLAN = {
    "scripts/scrape_pocket_tierlist.py":
        "Game8 antwortet dem GitHub-Laeufer auf jedem Weg mit HTTP 202 "
        "(Cloudflare). Drei Laeufe am 04.09.2026 gemessen. Ein Zeitplan "
        "erzeugte jede Nacht eine Warnung und nie eine Zeile Daten.",
    "scripts/build_champions_sprites.py":
        "Der Kader aendert sich mit einer Regelrunde, nicht taeglich. "
        "292 Abrufe bei einem ehrenamtlichen Wiki gehoeren nicht in einen "
        "naechtlichen Lauf.",
    "scripts/build_pokepricelab_index.py":
        "Identitaetsquelle, nur auf Zuruf — der Lauf kriecht ueber 271 "
        "Teil-Sitemaps.",
    "scripts/verify_via_pokepricelab.py":
        "Meldet nur, repariert nie. Kartenidentitaet entscheidet kein "
        "Zeitplan.",
}


def _lies(pfad):
    try:
        with open(pfad, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _alter_tage(zeitpunkt, jetzt):
    if not zeitpunkt:
        return None
    try:
        t = dt.datetime.fromisoformat(str(zeitpunkt).replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return (jetzt - t).total_seconds() / 86400.0


# ── Laeuft er, oder LIEFERT er auch? ──────────────────────────────────
#
# BEFUND 23.09.2026. Die Pruefung oben fragt den Herzschlag: IST DER
# ERZEUGER GELAUFEN. Sie hat sieben Tage lang "FRISCH, lief vor 0.1 Tagen"
# fuer scripts/build_champions_move_flags.py gemeldet — und das stimmte.
# Das Ergebnis kam trotzdem nie an: data/champions_move_flags.json fehlte
# in der `git add`-Liste von champions-replica-scrape.yml und wurde nach
# jedem Lauf mit dem Runner weggeworfen. Der Stempel `erzeugt_am` stand
# unveraendert auf dem 16.09., waehrend der Erzeuger ihn jede Nacht neu
# setzte.
#
# Aufgefallen ist es erst, als der Bestand sich aenderte ("Zing Zap" fiel
# aus champions_resources.json) und die Merkmalsdatei nicht mitkam —
# Deploy 3025, 3026 und 3027 rot.
#
# DESHALB WIRD JETZT DER STEMPFEL DES ERGEBNISSES GEGEN DEN LAUF
# GEHALTEN. Die Regel gilt nur fuer Dateien, deren Erzeuger den Stempel
# bei JEDEM Lauf neu setzt — dort ist ein alter Stempel ein Beweis, kein
# Verdacht. Eine Datei, die sich inhaltlich nicht aendert, faellt hier
# nicht auf; sie steht weiter unter "inhaltlich still".
STEMPEL_FELDER = ("erzeugt_am", "scraped_at", "erstellt_am", "generated_at")

# Erzeuger -> Datei, deren Stempel er bei jedem Lauf neu setzt.
# Bewusst von Hand: eine geratene Zuordnung waere eine Behauptung, und
# eine falsche Behauptung ist schlimmer als keine.
ERGEBNIS_MIT_STEMPEL = {
    "scripts/build_champions_move_flags.py": "champions_move_flags.json",
    "scripts/scrape_champions_usage.py": "champions_usage.json",
    # NOCH NICHT die beiden Victory-Road-Scraper (24.09.2026): ihre
    # Ergebnisdateien gibt es im Repo noch gar nicht — der erste
    # Wochenlauf, der sie erzeugt hat, brach vorher ab. Einen Stempel zu
    # bewachen, den es nicht gibt, ist keine Pruefung, sondern ein
    # dauerhaft roter Test. Der Eintrag gehoert hierher, sobald
    # data/victory_road_major_teams.json und
    # data/victory_road_replika_teams.json im Repo liegen.
}

# Wieviel Tage darf der Stempel hinter dem Lauf herhinken, bevor es ein
# Befund ist? Ein Tag Luft fuer Laufzeit und Zeitzone, plus die Frist des
# Rhythmus — sonst meldete ein Erzeuger, der zweimal die Woche laeuft,
# an jedem dritten Tag.
STEMPEL_LUFT_TAGE = 1.0


def nicht_ausgeliefert(jetzt=None):
    """Erzeuger, die LIEFEN, deren Ergebnis aber nicht angekommen ist."""
    jetzt = jetzt or dt.datetime.now(dt.timezone.utc)
    herz = _lies(os.path.join(DATEN, "_job_heartbeats.json"))
    heraus = []
    for job, datei in sorted(ERGEBNIS_MIT_STEMPEL.items()):
        rhythmus = RHYTHMUS.get(job)
        if not rhythmus:
            continue
        eintrag = herz.get(job)
        eintrag = eintrag if isinstance(eintrag, dict) else {}
        lauf = _alter_tage(eintrag.get("zuletzt_erfolgreich"), jetzt)
        if lauf is None:
            continue          # kein Herzschlag — das meldet die Pruefung oben
        inhalt = _lies(os.path.join(DATEN, datei))
        meta = inhalt.get("_meta") if isinstance(inhalt, dict) else None
        if not isinstance(meta, dict):
            continue
        stempel = None
        for feld in STEMPEL_FELDER:
            if meta.get(feld):
                stempel = _alter_tage(meta[feld], jetzt)
                break
        if stempel is None:
            continue
        erlaubt = ERWARTET_TAGE[rhythmus] + STEMPEL_LUFT_TAGE
        if stempel - lauf > erlaubt:
            heraus.append((
                job, datei,
                f"lief vor {lauf:.1f} Tagen, aber der Stempel in "
                f"data/{datei} ist {stempel:.1f} Tage alt — das Ergebnis "
                "kommt nicht an (fehlt die Datei in der `git add`-Liste "
                "ihres Ablaufs?)"))
    return heraus


def pruefe(jetzt=None):
    """Gibt (zeilen, stille) zurueck. `stille` sind die echten Befunde."""
    jetzt = jetzt or dt.datetime.now(dt.timezone.utc)
    herz = _lies(os.path.join(DATEN, "_job_heartbeats.json"))
    stand = _lies(os.path.join(DATEN, "data_stand.json"))
    dateien = stand.get("dateien") or {}

    juengste_datei = None
    for zeitpunkt in dateien.values():
        a = _alter_tage(zeitpunkt, jetzt)
        if a is not None and (juengste_datei is None or a < juengste_datei):
            juengste_datei = a

    zeilen = []
    stille = []
    for job, rhythmus in sorted(RHYTHMUS.items()):
        eintrag = herz.get(job)
        eintrag = eintrag if isinstance(eintrag, dict) else {}
        erfolg = _alter_tage(eintrag.get("zuletzt_erfolgreich"), jetzt)
        frist = ERWARTET_TAGE[rhythmus]
        if erfolg is None:
            zustand = "STILL"
            hinweis = "kein Herzschlag — der Erzeuger lief hier noch nie erfolgreich"
        elif erfolg > frist:
            zustand = "STILL"
            hinweis = (f"letzter Erfolg vor {erfolg:.1f} Tagen, erwartet "
                       f"hoechstens {frist:.1f}")
        else:
            zustand = "FRISCH"
            hinweis = f"lief vor {erfolg:.1f} Tagen"
        zeilen.append((zustand, job, rhythmus, erfolg, hinweis))
        if zustand == "STILL":
            stille.append((job, hinweis))

    for job, grund in sorted(OHNE_ZEITPLAN.items()):
        eintrag = herz.get(job)
        eintrag = eintrag if isinstance(eintrag, dict) else {}
        erfolg = _alter_tage(eintrag.get("zuletzt_erfolgreich"), jetzt)
        zeilen.append(("OHNE PLAN", job, "auf Zuruf", erfolg, grund))

    return zeilen, stille, juengste_datei


def ruhige_dateien(jetzt=None, schwelle=14.0):
    """Dateien, deren Inhalt lange still steht. KEIN Befund fuer sich —
    nur die Liste, die man beim Nachsehen in der Hand haben will."""
    jetzt = jetzt or dt.datetime.now(dt.timezone.utc)
    stand = _lies(os.path.join(DATEN, "data_stand.json"))
    heraus = []
    for name, zeitpunkt in (stand.get("dateien") or {}).items():
        a = _alter_tage(zeitpunkt, jetzt)
        if a is not None and a > schwelle:
            heraus.append((a, name))
    return sorted(heraus, reverse=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--markdown", action="store_true",
                    help="zusaetzlich eine Tabelle fuer die Laufuebersicht")
    args = ap.parse_args()

    zeilen, stille, juengste = pruefe()
    ruhig = ruhige_dateien()

    print("── Frischepruefung ──")
    print(f"{'Zustand':<10} {'Rhythmus':<22} {'Erfolg vor':>11}  Erzeuger")
    print("-" * 88)
    for zustand, job, rhythmus, erfolg, hinweis in zeilen:
        alt = f"{erfolg:11.1f}" if erfolg is not None else "        nie"
        print(f"{zustand:<10} {rhythmus:<22} {alt}  {job}")
        if zustand != "FRISCH":
            print(f"{'':<10} {'':<22} {'':>11}  -> {hinweis}")

    print()
    if ruhig:
        print(f"Inhaltlich still seit mehr als 14 Tagen ({len(ruhig)} Dateien) —")
        print("kein Befund fuer sich: der Erzeuger laeuft, die Quelle liefert nichts Neues.")
        for a, name in ruhig:
            print(f"  {a:6.1f} Tage  {name}")
        print()

    if stille:
        namen = ", ".join(j for j, _ in stille)
        print(f"::warning title=Erzeuger ohne Herzschlag::{len(stille)} Erzeuger "
              f"lief(en) nicht in der erwarteten Frist: {namen}")
    else:
        print("Alle Erzeuger mit Zeitplan haben in ihrer Frist erfolgreich gelaufen.")

    # Der zweite Satz, der frueher fehlte: gelaufen ist nicht geliefert.
    verworfen = nicht_ausgeliefert()
    for job, datei, hinweis in verworfen:
        print(f"::warning title=Ergebnis kommt nicht an::{job}: {hinweis}")
    if not verworfen:
        print(f"Alle {len(ERGEBNIS_MIT_STEMPEL)} gestempelten Ergebnisse sind "
              "so frisch wie ihr Lauf.")

    zusammenfassung = os.environ.get("GITHUB_STEP_SUMMARY")
    if args.markdown and zusammenfassung:
        with open(zusammenfassung, "a", encoding="utf-8") as fh:
            fh.write("\n### Frischepruefung\n\n")
            fh.write(f"- Erzeuger mit Zeitplan: **{len(RHYTHMUS)}**, "
                     f"davon stumm: **{len(stille)}**\n")
            fh.write(f"- Bewusst ohne Zeitplan: **{len(OHNE_ZEITPLAN)}** "
                     "(Begruendung je Eintrag im Protokoll)\n")
            fh.write(f"- Inhaltlich still > 14 Tage: **{len(ruhig)}** Dateien\n\n")
            if stille:
                fh.write("| stummer Erzeuger | Befund |\n| --- | --- |\n")
                for job, hinweis in stille:
                    fh.write(f"| `{job}` | {hinweis} |\n")
            if ruhig:
                fh.write("\n<details><summary>Inhaltlich still</summary>\n\n")
                fh.write("| Datei | Tage |\n| --- | ---: |\n")
                for a, name in ruhig:
                    fh.write(f"| `{name}` | {a:.0f} |\n")
                fh.write("\n</details>\n")

    # Gemeldet, nicht blockiert.
    return 0


if __name__ == "__main__":
    sys.exit(main())
