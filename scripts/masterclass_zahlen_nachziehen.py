#!/usr/bin/env python3
"""Zieht die Matchup-Zahlen der Masterclass-Aufbereitung an die Rohdaten nach.

BEFUND 23.09.2026 — DER ERZEUGER FEHLTE.

masterclass/mega-stalobor.de.html traegt je Matchup drei Zahlen: das
aktuelle Online-Meta, das Meta davor und die letzten Majors. Sie sind am
21.09.2026 von Hand aus den Rohbilanzen gerechnet und in die Datei
geschrieben worden.

tests/python/test_masterclass_kartennamen.py rechnet sie nach und
vergleicht Zeichen fuer Zeichen — zu Recht: eine Zahl im Stueck, die nicht
in den Daten steht, ist eine Behauptung. Nur gab es niemanden, der das
Stueck nachzieht, wenn die Daten wachsen. Am 23.09.2026 standen im Stueck
52 Partien gegen Dragapult, in data/online_api_matchups_TEF-30C.csv
inzwischen 66 — sechzehn Zellen auseinander, Deploy blockiert, und die
Reparatur waere sechzehnmal Kopfrechnen gewesen.

Dieses Skript ist der fehlende Erzeuger. Es rechnet mit DENSELBEN
Formeln wie die Zusicherung (die Konvention aus js/win-rate-konvention.js,
(3S+U)/(3n)) und schreibt nur die Zellen, die sich geaendert haben.

ES ERFINDET NICHTS. Ein Matchup ohne Bilanz bekommt einen Gedankenstrich,
eine Bilanz unter 30 Partien bleibt eine Bilanz (S-N-U) statt einer
Quote — genau die Regel, die das Stueck selbst ausspricht.

UMZUG 17.10.2026 — DAS STUECK LIEGT IM KONTO, DIE ZAHLEN IN DER JSON.

Die Ausarbeitung liegt seit dem 17.10.2026 nur noch in Hausis Konto
(Firestore), das Repo ist oeffentlich. Dieses Skript schreibt deshalb
nicht mehr in eine HTML-Datei, sondern den Schluessel `matchups` in
data/masterclass_live/mega-stalobor.json (scripts/masterclass_live.py).
Formeln und Regeln sind dieselben; js/ds-masterclass.js setzt die Werte
beim Oeffnen in die markierten Zellen (data-live-slug / data-live-spalte).
Das Umstellen der Spaltenkoepfe bei einem Set- oder Majorswechsel
(frueher online_umstellen/majors_umstellen) passiert jetzt beim Einsetzen:
die JSON nennt die Koepfe, die Seite benennt die Spalten danach.

Aufruf: python3 scripts/masterclass_zahlen_nachziehen.py [--probe]
        --probe schreibt nichts und meldet nur, was sich aendern wuerde.
"""
import argparse
import csv
import datetime as dt
import html
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEN = os.path.join(WURZEL, "data")
GUIDE_ID = "mega-stalobor"

def _formatfenster(pfad=None):
    """(jetzt, davor) aus data/format_window.json: "TEF-30C" und "TEF-PBL".

    DA-20 (01.10.2026): die beiden Dateinamen standen hier fest. Beim
    naechsten Setwechsel haette das Skript still das alte Fenster
    nachgezogen. Jetzt kommt das laufende Fenster aus oldest_legal_set und
    current_set, das vorige aus previous_format_key — dieselben Felder,
    aus denen die Scraper ihre Dateinamen bilden. Fehlt eines, bricht das
    Skript ab, statt zu raten."""
    import json
    pfad = pfad or os.path.join(DATEN, "format_window.json")
    with open(pfad, encoding="utf-8") as f:
        fw = json.load(f)
    aelt, neu, davor = fw.get("oldest_legal_set"), fw.get("current_set"), fw.get("previous_format_key")
    if not (aelt and neu and davor):
        raise SystemExit(f"::error::format_window.json ohne oldest_legal_set/current_set/previous_format_key ({pfad})")
    return f"{aelt}-{neu}", str(davor)


_JETZT, _DAVOR = _formatfenster()
ONLINE_JETZT = os.path.join(DATEN, f"online_api_matchups_{_JETZT}.csv")
ONLINE_DAVOR = os.path.join(DATEN, f"online_api_matchups_{_DAVOR}.csv")
LABS_MU = os.path.join(DATEN, "labs_tournament_matchups.csv")
ARCHETYPEN = os.path.join(DATEN, "online_api_archetypes.csv")

MINDEST_PARTIEN = 30
EIGEN = "mega-excadrill-ex"

# Der Block je Matchup: englischer Name aus der Kachel, dann die Zellen.
BLOCK = re.compile(
    r'<span class="mcl-nm">[^<]*<em>([^<]*)</em></span>'
    r'([\s\S]*?<span class="mcl-wr3">[\s\S]*?</span></span>)')
# Eine Datenzelle samt Klasse und Sprechblase. Die Beschriftung wird NICHT
# aufgezaehlt: sie kommt seit dem 23.09.2026 aus den Daten (Formatfenster
# aus dem Dateinamen, Majors-Format aus der Spalte `meta`) und hiess davor
# Jetzt/Davor/Majors. Eine Liste hier waere die naechste auswendig gelernte
# Schreibweise.
ZELLE = re.compile(
    r'<span class="(mcl-wrz[^"]*)" title="([^"]*)">'
    r'<em>([^<]+)</em><b>([^<]+)</b>(<i>\([\d.]+\)</i>)?</span>')

# Woerter, die nur die Form benennen: aus "TEF-30C" im Dateinamen wird
# "TEF\u201330C" im Kopf (Halbgeviertstrich), genau wie in der Zusicherung.
def _kopf(text):
    return str(text).replace("-", "\u2013")


def _fenster_aus_dateiname(pfad):
    """online_api_matchups_TEF-30C.csv -> TEF-30C."""
    m = re.search(r"matchups_([A-Za-z0-9]+-[A-Za-z0-9]+)\.csv$", os.path.basename(pfad))
    if not m:
        raise SystemExit(f"::error::kein Formatfenster im Dateinamen {pfad}")
    return m.group(1)


def _majors_meta():
    """Das Format der LETZTEN Majors \u2014 aus derselben Spalte `meta`, aus der
    auch die Zahlen kommen.

    NACHGETRAGEN 29.09.2026 (Wochenlauf #168, Tor rot). Bis heute verlangte
    diese Funktion, dass alle Majors-Zeilen EIN Format tragen, und brach
    sonst ab. Das hielt genau so lange, bis das erste Major des neuen
    Formats kam: Brisbane und Frankfurt (26.09.2026) brachten TEF-30C-Zeilen
    neben die TEF-PBL-Zeilen, das Skript brach ab, die Masterclass blieb
    stehen und das Tor fand ihre Meta-Anteile veraltet.

    Bestellt sind "die letzten Majors". Das ist das Format, dessen Zeilen
    das juengste Turnier enthalten \u2014 labs vergibt die Turniernummern
    fortlaufend, `tournaments_used` nennt sie je Zeile.
    """
    csv.field_size_limit(10 ** 7)
    juengstes = {}
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["my_deck_slug"] != EIGEN or r["day_filter"] != "overall":
                continue
            if not (r["vs_wins"] or "").strip():
                continue
            nummern = [int(t) for t in re.findall(r"\d+", r.get("tournaments_used") or "")]
            if not nummern:
                raise SystemExit(f"::error::Majors-Zeile ohne tournaments_used ({r['meta']})")
            juengstes[r["meta"]] = max(juengstes.get(r["meta"], 0), max(nummern))
    if not juengstes:
        raise SystemExit("::error::keine Majors-Zeilen fuer " + EIGEN)
    return max(juengstes, key=juengstes.get)


LABS_DECKS = os.path.join(DATEN, "labs_tournament_decks.csv")


def _kurzname(name):
    """"Regional Championship Brisbane" -> "Brisbane", "World Championship
    San Francisco" -> "Worlds" — so, wie das Stueck die Turniere nennt."""
    n = str(name or "").strip()
    if n.lower().startswith("world championship"):
        return "Worlds"
    for vorn in ("Regional Championship ", "International Championship ",
                 "Special Event "):
        if n.startswith(vorn):
            rest = n[len(vorn):]
            return ("IC " + rest) if vorn.startswith("International") else rest
    return n


def _majors_turniere(meta):
    """Die Turniernummern der Majors-Zeilen dieses Formats, aufsteigend,
    und ihre Kurznamen aus labs_tournament_decks.csv."""
    csv.field_size_limit(10 ** 7)
    nummern = set()
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if (r["my_deck_slug"] != EIGEN or r["day_filter"] != "overall"
                    or r["meta"] != meta or not (r["vs_wins"] or "").strip()):
                continue
            nummern.update(int(t) for t in re.findall(r"\d+", r.get("tournaments_used") or ""))
    namen = {}
    if os.path.exists(LABS_DECKS):
        with open(LABS_DECKS, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                t = (r.get("tournament_id") or "").strip().lstrip("0")
                if t.isdigit() and int(t) in nummern:
                    namen[int(t)] = _kurzname(r.get("tournament_name"))
    reihe = sorted(nummern)
    return reihe, [namen.get(t, "Turnier %d" % t) for t in reihe]


def _und(teile):
    teile = list(teile)
    if len(teile) <= 1:
        return "".join(teile)
    return ", ".join(teile[:-1]) + " und " + teile[-1]



def majors_texte(meta_neu, laufend):
    """Die Texte, die die Majors-Spalte BENENNEN: Sprechblasenanfang,
    Legendensatz und die Turniernummern der Quellenzeile — dieselben
    Saetze, die bis zum Umzug majors_umstellen ins Stueck schrieb."""
    nummern, namen = _majors_turniere(meta_neu)
    if not nummern:
        raise SystemExit("::error::keine Turniere fuer Majors (%s)" % meta_neu)
    turniere = _und(namen)
    kopf_neu = _kopf(meta_neu)
    if meta_neu == laufend:
        satz = ("sind die letzten Präsenzturniere (%s), schon im laufenden Format."
                % turniere)
    else:
        satz = ("sind die letzten Präsenzturniere (%s) — die liefen noch im Format %s."
                % (turniere, kopf_neu))
    return {
        "praefix": "Letzte Präsenzturniere (%s), Format %s: " % (turniere, kopf_neu),
        "satz": satz,
        "turniere": _und(str(x) for x in nummern),
    }


def koepfe():
    """Die drei Spaltenkoepfe, so wie sie im Stueck stehen muessen."""
    return {
        "jetzt": _kopf(_fenster_aus_dateiname(ONLINE_JETZT)),
        "davor": _kopf(_fenster_aus_dateiname(ONLINE_DAVOR)),
        "majors": "Majors (%s)" % _kopf(_majors_meta()),
    }


def _matchpunkte(w, l, t):
    n = w + l + t
    return (3 * w + t) / (3 * n) * 100 if n else None


def _online(pfad):
    csv.field_size_limit(10 ** 7)
    z = {}
    with open(pfad, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["archetype_id"] != EIGEN:
                continue
            e = z.setdefault(r["opponent_id"], [0, 0, 0])
            e[0] += int(r["wins"])
            e[1] += int(r["losses"])
            e[2] += int(r["ties"])
    return z


def _majors():
    meta = _majors_meta()
    csv.field_size_limit(10 ** 7)
    z = {}
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["my_deck_slug"] != EIGEN or r["day_filter"] != "overall":
                continue
            if not (r["vs_wins"] or "").strip():
                continue
            if r["meta"] != meta:
                continue
            z[r["opponent_deck_slug"]] = [
                int(r["vs_wins"]), int(r["vs_losses"]), int(r["vs_ties"] or 0)]
    return z


def _slugs():
    csv.field_size_limit(10 ** 7)
    k = {}
    with open(ARCHETYPEN, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            k.setdefault(r["archetype_name"].strip().lower(), r["archetype_id"])
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            k.setdefault((r["opponent_deck_name"] or "").strip().lower(),
                         r["opponent_deck_slug"])
    return k


def _tausender(n):
    """1234 -> "1.234" — dieselbe Schreibweise, die im Stueck steht."""
    return f"{n:,}".replace(",", ".")


def soll_zelle(bilanz, klasse_alt, titel_alt):
    """(Klasse, Titel, Wert, Nenner-HTML) fuer eine Bilanz. Erfindet nichts.

    Der ANFANG der Sprechblase bleibt stehen \u2014 er benennt die Spalte
    ("Online-Meta TEF\u201330C (laufendes Format): ") und ist Text, den
    dieses Skript nicht geschrieben hat. Neu gerechnet wird nur, was hinter
    dem Doppelpunkt steht. So \u00fcberlebt eine Umformulierung der Spalten\u00fcber-
    schrift diesen Erzeuger, ohne dass hier eine Zeile nachgezogen wird.
    """
    kopf = titel_alt.partition(": ")[0] + ": "
    grund = klasse_alt.split()[0]          # "mcl-wrz", Zusaetze kommen aus dem Fall
    w, l, t = bilanz
    n = w + l + t
    if n == 0:
        return (grund + " mcl-wrz-leer", kopf + "keine Partien in den Daten", "\u2014", "")
    bilanztext = f"{w}\u2013{l}\u2013{t}"
    if n < MINDEST_PARTIEN:
        # Wie stark eine einzelne Partie die Quote verschiebt: ein Sieg statt
        # einer Niederlage sind drei der 3n Punkte, also 100/n Prozentpunkte.
        verschiebung = f"{100.0 / n:.1f}"
        titel = (f"{kopf}Bilanz {bilanztext} (S\u2013N\u2013U) aus {_tausender(n)} Partien. "
                 f"Unter {MINDEST_PARTIEN} Partien steht hier keine Quote \u2014 eine "
                 f"einzelne Partie verschiebt sie um {verschiebung} Punkte.")
        return (grund + " mcl-wrz-duenn", titel, bilanztext, f"<i>({_tausender(n)})</i>")
    # Das Leerzeichen vor dem Prozentzeichen ist ein GEWOEHNLICHES \u2014
    # so steht es im Stueck.
    quote = ("%.1f" % _matchpunkte(w, l, t)).replace(".", ",") + " %"
    titel = (f"{kopf}{quote} Win % nach Matchpunkten, aus {_tausender(n)} Partien, "
             f"Bilanz {bilanztext} (S\u2013N\u2013U)")
    return (grund, titel, quote, f"<i>({_tausender(n)})</i>")


ONLINE_FELD = os.path.join(DATEN, "limitless_online_decks.csv")

def _feldanteile():
    """deck_name -> Meta-Anteil als Text ("8,54"). Quelle ist die Datei,
    aus der auch die Meta-Seite ihre Anteile nimmt."""
    csv.field_size_limit(10 ** 7)
    aus = {}
    if not os.path.exists(ONLINE_FELD):
        return aus
    with open(ONLINE_FELD, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            name = (r.get("deck_name") or "").strip()
            anteil = (r.get("share") or "").replace("%", "").strip()
            if name and anteil:
                aus[name.lower()] = anteil.replace(".", ",")
    return aus


def _stand(pfad):
    """Der jüngste Zeitpunkt, den data_stand.json fuer die Datei kennt —
    sonst die Änderungszeit der Datei. Kein geratenes Datum."""
    import json
    name = os.path.basename(pfad)
    try:
        with open(os.path.join(DATEN, "data_stand.json"), encoding="utf-8") as f:
            zeit = (json.load(f).get("dateien") or {}).get(name)
        if zeit:
            return str(zeit)[:10]
    except (OSError, ValueError):
        pass
    return dt.datetime.fromtimestamp(
        os.path.getmtime(pfad), dt.timezone.utc).date().isoformat()



def live_daten():
    """Alles, was die Matchup-Seite der Masterclass aus den Daten braucht.

    zellen[slug][spalte] = [Klasse, Sprechblase OHNE Spaltenanfang, Wert,
    Nenner-HTML] — genau das, was soll_zelle liefert. Ein Gegner ohne
    Eintrag bekommt beim Einsetzen die Zelle `leer` (kein Wert erfunden).
    """
    k = koepfe()
    if k["jetzt"] == k["davor"]:
        raise SystemExit("::error::beide Online-Spalten tragen denselben Kopf "
                         f"({k['jetzt']}) \u2014 es wird NICHTS geschrieben")
    quellen = {"jetzt": _online(ONLINE_JETZT), "davor": _online(ONLINE_DAVOR),
               "majors": _majors()}
    zellen = {}
    for spalte, q in quellen.items():
        for slug, bilanz in sorted(q.items()):
            klasse, titel, wert, nenner = soll_zelle(bilanz, "mcl-wrz", "X: ")
            zellen.setdefault(slug, {})[spalte] = [klasse, titel[3:], wert, nenner]
    klasse, titel, wert, nenner = soll_zelle([0, 0, 0], "mcl-wrz", "X: ")
    laufend = _fenster_aus_dateiname(ONLINE_JETZT)
    mt = majors_texte(_majors_meta(), laufend)
    werte = {
        "kopf-jetzt": k["jetzt"],
        "kopf-davor": k["davor"],
        "kopf-majors": k["majors"],
        "majors-satz": mt["satz"],
        "majors-turniere": mt["turniere"],
        "datei-online-jetzt": "data/" + os.path.basename(ONLINE_JETZT),
        "datei-online-davor": "data/" + os.path.basename(ONLINE_DAVOR),
        "stand-online-jetzt": _stand(ONLINE_JETZT),
        "stand-online-davor": _stand(ONLINE_DAVOR),
    }
    return {
        "koepfe": k,
        "majors_praefix": mt["praefix"],
        "werte": werte,
        "zellen": zellen,
        "leer": [klasse, titel[3:], wert, nenner],
        "anteile": _feldanteile(),
        "mindest_partien": MINDEST_PARTIEN,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true",
                    help="nichts schreiben, nur melden")
    args = ap.parse_args()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import masterclass_live as LIVE

    daten = live_daten()
    # GEGEN EIN LEERES BESTEHEN: je Spalte zaehlen, nicht in Summe
    # (Verfaelschungsprobe 23.09.2026). Unter 20 Gegnern in einer Spalte
    # stimmt etwas mit den Eingaben nicht — dann wird nichts geschrieben.
    je_spalte = {s: sum(1 for z in daten["zellen"].values() if s in z)
                 for s in ("jetzt", "davor", "majors")}
    duenn = sorted(s for s, n in je_spalte.items() if n < 20)
    if duenn:
        print(f"::error::zu wenige Gegner je Spalte {je_spalte} ({duenn}) — "
              "es wird NICHTS geschrieben.")
        return 1
    alt = (LIVE.lesen(GUIDE_ID).get("matchups") or {})
    if alt == daten:
        print(f"{LIVE.pfad(GUIDE_ID)}: Matchups stehen wie die Rohdaten ({je_spalte}).")
        return 0
    geaendert = sum(1 for slug, z in daten["zellen"].items()
                    if (alt.get("zellen") or {}).get(slug) != z)
    print(f"Matchups: {geaendert} Gegner mit neuen Zahlen, Gegner je Spalte {je_spalte}")
    if args.probe:
        print("--probe: nichts geschrieben.")
        return 0
    LIVE.schreibe_teil(GUIDE_ID, "matchups", daten)
    return 0


if __name__ == "__main__":
    sys.exit(main())
