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

Aufruf: python3 scripts/masterclass_zahlen_nachziehen.py [--probe]
        --probe schreibt nichts und meldet nur, was auseinanderlaeuft.
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
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")

ONLINE_JETZT = os.path.join(DATEN, "online_api_matchups_TEF-30C.csv")
ONLINE_DAVOR = os.path.join(DATEN, "online_api_matchups_TEF-PBL.csv")
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
    """Das Format der Majors-Zeilen \u2014 aus derselben Spalte `meta`, aus der
    auch die Zahlen kommen."""
    csv.field_size_limit(10 ** 7)
    metas = set()
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["my_deck_slug"] != EIGEN or r["day_filter"] != "overall":
                continue
            if not (r["vs_wins"] or "").strip():
                continue
            metas.add(r["meta"])
    if len(metas) != 1:
        raise SystemExit(f"::error::die Majors-Zeilen mischen Formate: {sorted(metas)}")
    return metas.pop()


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
    csv.field_size_limit(10 ** 7)
    z = {}
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["my_deck_slug"] != EIGEN or r["day_filter"] != "overall":
                continue
            if not (r["vs_wins"] or "").strip():
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


def nachziehen(roh, quellen, slugs):
    """Gibt (neuer Text, Liste der Aenderungen, Namen ohne Schluessel).

    `quellen` ist {Spaltenkopf: {slug: [w, l, t]}}. Eine Zelle, deren Kopf
    dort nicht steht (die Tim-Spalte), bleibt unberuehrt \u2014 sie traegt keine
    gerechnete Zahl, sondern eine Einschaetzung.
    """
    aenderungen = []
    ohne_slug = []

    def block_ersetzen(m):
        en, block = m.group(1), m.group(2)
        name = html.unescape(en).strip().lower()
        slug = slugs.get(name)
        if not slug:
            ohne_slug.append(en)
            return m.group(0)

        def zelle_ersetzen(z):
            klasse_alt, titel_alt, kopf, wert_alt, nenner_alt = z.groups()
            if kopf not in quellen:
                return z.group(0)          # Tim oder eine neue Spalte
            klasse, titel, wert, nenner = soll_zelle(
                quellen[kopf].get(slug, [0, 0, 0]), klasse_alt, titel_alt)
            neu = (f'<span class="{klasse}" title="{titel}">'
                   f'<em>{kopf}</em><b>{wert}</b>{nenner}</span>')
            if neu != z.group(0):
                aenderungen.append(
                    f"{html.unescape(en)} / {kopf}: {wert_alt!r}{nenner_alt or ''} "
                    f"-> {wert!r}{nenner}")
            return neu

        return m.group(0).replace(block, ZELLE.sub(zelle_ersetzen, block))

    return BLOCK.sub(block_ersetzen, roh), aenderungen, ohne_slug


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


def stand_nachziehen(text):
    """Die Standzeile des Stuecks an die Dateien nachziehen."""
    aend = []
    for pfad in (ONLINE_JETZT, ONLINE_DAVOR):
        name = os.path.basename(pfad)
        neu = _stand(pfad)
        muster = re.compile(
            r"(<code>data/" + re.escape(name) + r"</code>, Stand )(\d{4}-\d\d-\d\d)")
        treffer = muster.search(text)
        if treffer and treffer.group(2) != neu:
            aend.append(f"Stand {name}: {treffer.group(2)} -> {neu}")
            text = muster.sub(lambda m: m.group(1) + neu, text, count=1)
    return text, aend


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true",
                    help="nichts schreiben, nur melden")
    args = ap.parse_args()

    if not os.path.exists(STUECK):
        print(f"::warning::{STUECK} liegt nicht im Baum — nichts zu tun")
        return 0

    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()

    k = koepfe()
    if k["jetzt"] == k["davor"]:
        print("::error::beide Online-Spalten traegen denselben Kopf "
              f"({k['jetzt']}) \u2014 es wird NICHTS geschrieben")
        return 1
    quellen = {
        k["jetzt"]: _online(ONLINE_JETZT),
        k["davor"]: _online(ONLINE_DAVOR),
        k["majors"]: _majors(),
    }
    neu, aenderungen, ohne_slug = nachziehen(roh, quellen, _slugs())
    neu, stand_aend = stand_nachziehen(neu)
    aenderungen += stand_aend

    # GEGEN EIN LEERES BESTEHEN: findet das Muster die Bloecke ueberhaupt?
    # Ohne diese Zeile koennte das Skript "0 Aenderungen" melden, weil es
    # nichts gefunden hat — und genau so bliebe der Fehler unsichtbar.
    gefunden = len(BLOCK.findall(roh))
    # JE SPALTE zaehlen, nicht in Summe. Wechselte nur EINE der drei
    # Beschriftungen, bliebe die Summe ueber jeder Grenze und das Skript
    # meldete "alle Zahlen stehen wie die Rohdaten" — ohne eine einzige
    # Zelle dieser Spalte angesehen zu haben. Gemessen am 23.09.2026 in
    # der Verfaelschungsprobe, nachdem die Spalten von Jetzt/Davor/Majors
    # auf die Metanamen umgestellt worden waren.
    alle = ZELLE.findall(roh)
    je_kopf = {kopf: sum(1 for z in alle if z[2] == kopf) for kopf in quellen}
    duenn = sorted(k for k, n in je_kopf.items() if n < 20)
    if gefunden < 20 or duenn:
        vorhanden = sorted({z[2] for z in alle})
        print(f"::error::{gefunden} Matchup-Bloecke, Zellen je Spalte "
              f"{je_kopf}. Zu wenige fuer: {duenn or 'die Bloecke selbst'}. "
              f"Im Stueck stehen die Koepfe {vorhanden}. "
              "Es wird NICHTS geschrieben.")
        return 1

    if ohne_slug:
        print("::warning::ohne Archetyp-Schluessel, unveraendert gelassen: "
              + ", ".join(sorted(set(ohne_slug))))

    if not aenderungen:
        print(f"masterclass/mega-stalobor.de.html: {gefunden} Matchups, "
              "alle Zahlen stehen wie die Rohdaten.")
        return 0

    print(f"masterclass/mega-stalobor.de.html: {len(aenderungen)} Zellen "
          f"nachgezogen (von {gefunden} Matchups)")
    for a in aenderungen:
        print("  " + a)

    if args.probe:
        print("--probe: nichts geschrieben.")
        return 0

    tmp = STUECK + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(neu)
    os.replace(tmp, STUECK)
    return 0


if __name__ == "__main__":
    sys.exit(main())
