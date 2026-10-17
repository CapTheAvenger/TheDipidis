#!/usr/bin/env python3
"""Der Block „Aktuelle Daten“ fuer JEDE Masterclass — Online und vor Ort.

BESTELLUNG (Hausi, 17.10.2026): „… dass die Masterclasses, die ich gekauft
habe oder die wir hier anlegen, ob über Video oder nicht, … wirklich immer
mit aktuellen Daten nachgeliefert werden. … In-Personendaten und
Online-Daten gehen immer so ein bisschen auseinander. … Die Wahrheit liegt
wahrscheinlich irgendwo dazwischen, aber man kann es ja beides aufzeigen.
… damit ich alle Daten auf einen Blick habe.“

Dieses Skript schreibt den Schluessel `aktuell` in
data/masterclass_live/<id>.json (scripts/masterclass_live.py) fuer jede
Masterclass in DECKS. js/ds-masterclass.js baut daraus beim Oeffnen den
Block „Aktuelle Daten“ (Online neben vor Ort) und je Matchup die Zeile
„Online … · Vor Ort …“ neben der Einschaetzung des Autors.

EINE NEUE MASTERCLASS KOSTET EINE ZEILE IN DECKS (id -> Archetyp-Slug).
Der Slug ist derselbe in den Online-Daten (online_api_*) und den
Vor-Ort-Daten (labs_*), gemessen 17.10.2026 an den 25 groessten Decks.

ES ERFINDET NICHTS. Jede Zahl ist gezaehlt; was fehlt, fehlt (leere
Bilanz, keine Liste). Die Quote rechnet die Seite aus der Bilanz
(Matchpunkte, (3S+U)/(3n)); unter 20 Matches zeigt sie die Bilanz
(Festlegung DA-50).

REGEL wie bei allen Live-Dateien: nur Gerechnetes, kein Satz aus einer
Ausarbeitung (tests/python/test_masterclass_live.py).

Aufruf: python3 scripts/masterclass_aktuell.py [--probe]
Laeuft im Wochenlauf und im Limitless-Lauf als Teil von
scripts/masterclass_zahlen_nachziehen.py (kein eigener Ablaufschritt).
"""
import argparse
import csv
import datetime as dt
import json
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEN = os.path.join(WURZEL, "data")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# id der Masterclass (Firestore users/{uid}/masterclasses/<id>) -> Archetyp
DECKS = {
    "mega-stalobor": "mega-excadrill-ex",
    "mega-tohaido": "sharpedo-toxtricity",
    "hide-n-sneak": "dhelmise-pbl",
}

TAGE_KURZ = 7          # „letzte 7 Tage“ online
VOR_ORT_LISTEN = 2     # bestplatzierte Vor-Ort-Listen je Deck

ONLINE_ARCH = os.path.join(DATEN, "online_api_archetypes.csv")
LABS_DECKS = os.path.join(DATEN, "labs_tournament_decks.csv")
LABS_MU = os.path.join(DATEN, "labs_tournament_matchups.csv")
FENSTER = os.path.join(DATEN, "limitless_online_fenster.csv")
FENSTER_META = os.path.join(DATEN, "limitless_online_fenster_meta.json")
BESTE_ONLINE = os.path.join(DATEN, "online_best_decklists.json")
LISTEN_VOR_ORT = os.path.join(DATEN, "tournament_decklists_per_player.csv")

csv.field_size_limit(10 ** 9)


def _kopf(text):
    return str(text).replace("-", "–")


def _komma(x, stellen=2):
    return ("%%.%df" % stellen % x).replace(".", ",")


def _datum(iso):
    """2026-10-09 -> 09.10.2026"""
    t = str(iso or "")[:10]
    m = re.match(r"^(\d{4})-(\d\d)-(\d\d)$", t)
    return "%s.%s.%s" % (m.group(3), m.group(2), m.group(1)) if m else t


def laufendes_format(pfad=None):
    with open(pfad or os.path.join(DATEN, "format_window.json"), encoding="utf-8") as f:
        fw = json.load(f)
    a, n = fw.get("oldest_legal_set"), fw.get("current_set")
    if not (a and n):
        raise SystemExit("::error::format_window.json ohne oldest_legal_set/current_set")
    return "%s-%s" % (a, n)


def _kurzname(name):
    import masterclass_zahlen_nachziehen as Z  # dieselben Kurznamen wie die Majors-Spalte
    return Z._kurzname(name)


# ── Online ──────────────────────────────────────────────────────────────

def online(laufend):
    """Je Deck: Bilanz und Listen im laufenden Format und in den letzten
    TAGE_KURZ Tagen; je Gegner die Bilanz im laufenden Format. Quelle sind
    die Online-Turniere mit Paarungen (online_api_*)."""
    with open(ONLINE_ARCH, encoding="utf-8-sig") as f:
        alle = list(csv.DictReader(f, delimiter=";"))
    zeilen = [r for r in alle if r["meta"] == laufend]
    if not zeilen and alle:
        # SETWECHSEL (scripts/simuliere_setwechsel.py): in den ersten Tagen
        # eines neuen Formats gibt es noch keine Online-Turniere. Dann gilt
        # das juengste Format, das in den Daten steht — und der Block nennt
        # es beim Namen (online.format). Ohne diesen Rueckfall hielte das
        # erste neue Set den Wochenlauf an.
        laufend = max(alle, key=lambda r: r["date"])["meta"]
        zeilen = [r for r in alle if r["meta"] == laufend]
        print("::warning::masterclass_aktuell: noch keine Online-Zeilen im neuen Format — nehme %s" % laufend)
    if not zeilen:
        raise SystemExit("::error::keine Online-Zeilen in %s" % ONLINE_ARCH)
    bis = max(r["date"] for r in zeilen)
    von_kurz = (dt.date.fromisoformat(bis) - dt.timedelta(days=TAGE_KURZ - 1)).isoformat()
    seit = min(r["date"] for r in zeilen)
    namen, listen_format, turniere_format = {}, {}, {}
    gesamt = {"format": [0, set()], "kurz": [0, set()]}
    je = {}
    for r in zeilen:
        slug = r["archetype_id"]
        namen.setdefault(slug, r["archetype_name"])
        n = int(r["lists"] or 0)
        bil = [int(r["wins"] or 0), int(r["losses"] or 0), int(r["ties"] or 0)]
        bereiche = ["format"] + (["kurz"] if r["date"] >= von_kurz else [])
        for b in bereiche:
            e = je.setdefault((slug, b), {"listen": 0, "bilanz": [0, 0, 0], "turniere": set()})
            e["listen"] += n
            e["turniere"].add(r["tournament_id"])
            for i in range(3):
                e["bilanz"][i] += bil[i]
            if r["tournament_id"] not in gesamt[b][1]:
                gesamt[b][1].add(r["tournament_id"])
                gesamt[b][0] += int(r["lists_total"] or 0)
    mu = {}
    pfad = os.path.join(DATEN, "online_api_matchups_%s.csv" % laufend)
    if os.path.exists(pfad):
        with open(pfad, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f, delimiter=";"):
                e = mu.setdefault(r["archetype_id"], {}).setdefault(r["opponent_id"], [0, 0, 0])
                e[0] += int(r["wins"])
                e[1] += int(r["losses"])
                e[2] += int(r["ties"])
    else:
        print("::warning::masterclass_aktuell: %s fehlt — Online-Matchups leer" % pfad)
    return {"format": laufend, "bis": bis, "von_kurz": von_kurz, "seit": seit, "namen": namen, "je": je,
            "gesamt": {b: g[0] for b, g in gesamt.items()},
            "turniere": {b: len(g[1]) for b, g in gesamt.items()}, "mu": mu}


def fenster_anteile():
    """deck_name -> (Anteil 14 Tage, Trend) aus limitless_online_fenster.csv
    — dieselbe Zahl, die die Meta-Seite zeigt."""
    aus = {}
    if not os.path.exists(FENSTER):
        return aus, {}
    with open(FENSTER, encoding="utf-8-sig") as f:
        zeilen = [z for z in f if not z.startswith("#")]
    for r in csv.DictReader(zeilen, delimiter=";"):
        aus[(r.get("deck_name") or "").strip().lower()] = (
            (r.get("share_fenster") or "").strip(), (r.get("trend_fenster") or "").strip())
    meta = {}
    try:
        with open(FENSTER_META, encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, ValueError):
        pass
    return aus, meta


# ── Vor Ort (Majors) ────────────────────────────────────────────────────

def vor_ort():
    """Je Deck: die Turniere des juengsten Formats, in dem das Deck vor Ort
    gespielt wurde, mit Anteil, Bilanz, Day 2, Top 8, Sieg."""
    je = {}
    with open(LABS_DECKS, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            t = (r.get("tournament_id") or "").strip()
            if not t.isdigit():
                continue
            je.setdefault(r["deck_slug"], []).append(r)
    return je


def vor_ort_mu(slug, meta):
    z = {}
    with open(LABS_MU, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if (r["my_deck_slug"] != slug or r["day_filter"] != "overall" or r["meta"] != meta
                    or not (r["vs_wins"] or "").strip()):
                continue
            z[r["opponent_deck_slug"]] = [int(r["vs_wins"]), int(r["vs_losses"]), int(r["vs_ties"] or 0)]
    return z


def _int(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return 0


def vor_ort_block(zeilen):
    if not zeilen:
        return None
    juengst = max(zeilen, key=lambda r: int(r["tournament_id"]))
    meta = juengst["meta"]
    turniere = sorted((r for r in zeilen if r["meta"] == meta), key=lambda r: int(r["tournament_id"]), reverse=True)
    reihe, summe = [], {"spieler": 0, "decks": 0, "bilanz": [0, 0, 0], "day2": 0, "top8": 0, "sieg": 0}
    for r in turniere:
        e = {
            "name": _kurzname(r["tournament_name"]),
            "datum": _datum(r["tournament_date"]),
            "spieler": _int(r["total_players"]),
            "decks": _int(r["player_count"]),
            "anteil": _komma(float(r["share_pct"] or 0)),
            "bilanz": [_int(r["wins"]), _int(r["losses"]), _int(r["ties"])],
            "day2": _int(r["day2_players"]),
            "top8": _int(r["top8_count"]),
            "sieg": _int(r["top1_count"]),
        }
        reihe.append(e)
        summe["spieler"] += e["spieler"]
        summe["decks"] += e["decks"]
        for i in range(3):
            summe["bilanz"][i] += e["bilanz"][i]
        for k in ("day2", "top8", "sieg"):
            summe[k] += e[k]
    summe["anteil"] = _komma(100.0 * summe["decks"] / summe["spieler"]) if summe["spieler"] else ""
    return {"format": _kopf(meta), "meta": meta, "turniere": reihe, "summe": summe}


# ── Listen ──────────────────────────────────────────────────────────────

def _karte(c):
    return [int(c.get("count") or 0), str(c.get("name") or ""), str(c.get("set_code") or ""),
            str(c.get("set_number") or "")]


def beste_online(name):
    try:
        with open(BESTE_ONLINE, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    x = d.get(name)
    if not x or not x.get("cards"):
        return None
    return {"platz": int(x.get("place_rank") or 0), "von": int(x.get("total_players") or 0),
            "bilanz": str(x.get("score") or "").replace(" ", ""), "turnier": str(x.get("tournament_name") or "")[:80],
            "datum": _datum(x.get("tournament_date")), "spieler": str(x.get("player") or "")[:40],
            "karten": [_karte(c) for c in x["cards"]]}


def beste_vor_ort(wuensche, turniere=None):
    """wuensche: {(deck_name_lower, meta): id}. Die VOR_ORT_LISTEN
    bestplatzierten Papier-Listen je Deck im Format, eine Zeile je Karte in
    tournament_decklists_per_player.csv (86 MB, einmal gelesen)."""
    gef = {}
    with open(LISTEN_VOR_ORT, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r.get("quelle") != "papier":
                continue
            k = ((r.get("deck_archetype") or "").strip().lower(), r.get("meta"))
            if k not in wuensche:
                continue
            platz = _int(r.get("place"))
            if not platz:
                continue
            sl = (r["tournament_id"], r["player_name"])
            # Name und Spielerzahl aus labs_tournament_decks.csv (dieselbe
            # Turniernummer) — die Listen-Datei schreibt „Regional Lousville,
            # KY – Limitless“ und laesst die Spielerzahl oft leer.
            tn = (turniere or {}).get(r["tournament_id"]) or {}
            e = gef.setdefault(wuensche[k], {}).setdefault(sl, {
                "platz": platz, "turnier": tn.get("name") or _kurzname(r["tournament_name"]),
                "datum": _datum(r["tournament_date"]), "spieler": (r["player_name"] or "")[:40],
                "bilanz": "%s-%s-%s" % (_int(r["wins"]), _int(r["losses"]), _int(r["ties"])),
                "von": tn.get("spieler") or _int(r.get("spielerzahl")), "karten": []})
            e["karten"].append([_int(r["count"]), r["card_name"], r["set_code"], r["set_number"]])
    aus = {}
    for gid, listen in gef.items():
        reihe = sorted(listen.values(), key=lambda e: (e["platz"], e["datum"][6:] + e["datum"][3:5] + e["datum"][:2]))
        aus[gid] = [e for e in reihe if sum(k[0] for k in e["karten"]) == 60][:VOR_ORT_LISTEN]
    return aus


# ── Zusammenbau ────────────────────────────────────────────────────────

def baue(decks=None):
    decks = decks or DECKS
    laufend = laufendes_format()
    on = online(laufend)
    anteile14, fmeta = fenster_anteile()
    vo_alle = vor_ort()
    bloecke = {}
    for gid, slug in decks.items():
        name = on["namen"].get(slug)
        vo = vor_ort_block(vo_alle.get(slug, []))
        if not name and vo:
            name = vo_alle[slug][0]["deck_name"]
        if not name:
            print("::warning::%s: Archetyp %s weder online noch vor Ort in den Daten" % (gid, slug))
            continue
        fmt = on["je"].get((slug, "format"), {"listen": 0, "bilanz": [0, 0, 0]})
        kurz = on["je"].get((slug, "kurz"), {"listen": 0, "bilanz": [0, 0, 0]})
        a14, trend = anteile14.get(name.lower(), ("", ""))
        online_teil = {
            "format": _kopf(on["format"]),
            "seit": _datum(on["seit"]),
            "bis": _datum(on["bis"]),
            "listen": fmt["listen"],
            "anteil": _komma(100.0 * fmt["listen"] / on["gesamt"]["format"]) if on["gesamt"]["format"] else "",
            "bilanz": fmt["bilanz"],
            "turniere": on["turniere"]["format"],
            "kurz_von": _datum(on["von_kurz"]),
            "kurz_listen": kurz["listen"],
            "kurz_anteil": _komma(100.0 * kurz["listen"] / on["gesamt"]["kurz"]) if on["gesamt"]["kurz"] else "",
            "kurz_bilanz": kurz["bilanz"],
            "kurz_turniere": on["turniere"]["kurz"],
            "anteil14": a14,
            "trend14": trend,
            "fenster14": "%s–%s" % (_datum(fmeta.get("fenster_von"))[:6], _datum(fmeta.get("fenster_bis"))) if fmeta.get("fenster_von") else "",
        }
        # Gegner: alle mit Online- oder Vor-Ort-Bilanz, nach Online-Listen im Format
        mu_on = on["mu"].get(slug, {})
        mu_vo = vor_ort_mu(slug, vo["meta"]) if vo else {}
        gegner = []
        for g in set(mu_on) | set(mu_vo):
            if g in (slug, "other"):
                continue
            listen_g = on["je"].get((g, "format"), {"listen": 0})["listen"]
            gegner.append({"slug": g, "name": on["namen"].get(g) or g,
                           "anteil": _komma(100.0 * listen_g / on["gesamt"]["format"]) if on["gesamt"]["format"] else "",
                           "online": mu_on.get(g, [0, 0, 0]), "vor_ort": mu_vo.get(g, [0, 0, 0]),
                           "_n": listen_g})
        gegner.sort(key=lambda e: (-e["_n"], e["slug"]))
        for e in gegner:
            del e["_n"]
        if vo:
            vo = dict(vo)
            vo.pop("meta", None)
        bloecke[gid] = {
            "deck": slug, "name": name,
            "online": online_teil, "vor_ort": vo, "gegner": gegner,
            "liste_online": beste_online(name), "listen_vor_ort": [],
            "_wunsch": (name.lower(), (vo_alle.get(slug) and max(vo_alle[slug], key=lambda r: int(r["tournament_id"]))["meta"])),
        }
    wuensche = {b["_wunsch"]: gid for gid, b in bloecke.items() if b["_wunsch"][1]}
    turniere = {}
    for zeilen in vo_alle.values():
        for r in zeilen:
            turniere.setdefault(r["tournament_id"], {"name": _kurzname(r["tournament_name"]),
                                                     "spieler": _int(r["total_players"])})
    listen = beste_vor_ort(wuensche, turniere) if wuensche else {}
    for gid, b in bloecke.items():
        b.pop("_wunsch")
        b["listen_vor_ort"] = listen.get(gid, [])
    return bloecke


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true", help="nichts schreiben, nur melden")
    args = ap.parse_args(argv)
    import masterclass_live as LIVE
    bloecke = baue()
    for gid, b in sorted(bloecke.items()):
        # GEGEN EIN LEERES BESTEHEN: unter 10 Gegnern stimmt mit den
        # Eingaben etwas nicht — dann bleibt die Datei, wie sie ist.
        if len(b["gegner"]) < 10:
            print("::warning::%s: nur %d Gegner — aktuell wird nicht geschrieben" % (gid, len(b["gegner"])))
            continue
        alt = LIVE.lesen(gid).get("aktuell")
        print("%s: %s, online %d Listen, vor Ort %s, %d Gegner%s" % (
            gid, b["name"], b["online"]["listen"],
            ("%d Turniere" % len(b["vor_ort"]["turniere"])) if b["vor_ort"] else "keine",
            len(b["gegner"]), "" if alt != b else " (unveraendert)"))
        if not args.probe:
            LIVE.schreibe_teil(gid, "aktuell", b)
    return 0


if __name__ == "__main__":
    sys.exit(main())
