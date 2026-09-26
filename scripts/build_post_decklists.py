#!/usr/bin/env python3
"""
════════════════════════════════════════════════════════════════════════
DIE LISTEN FÜR DIE POST-SEITE
════════════════════════════════════════════════════════════════════════

BESTELLT (Betreiber, 26.09.2026): „Dann die erfolgreichsten Listen der
letzten 7 Tage — dann kann ich im nächsten Filter den Archetype wählen
und in einem weiteren Filter sehe ich dann nur von dem Deck die
erfolgreichsten Listen der letzten 7 Tage. Das gleiche für Last Major,
Archetype wählen und dann noch die von welchem Platz die Platzierung
ist. Da brauchen wir aber nicht mehr anbieten als die Top 32."

WARUM EINE ABGELEITETE DATEI UND NICHT DIE QUELLE
--------------------------------------------------
data/tournament_decklists_per_player.csv ist 45 MB und 202.685 Zeilen
(gemessen 25.09.2026). posts/index.html läuft im Browser des Betreibers,
oft am Telefon. Die Quelle dorthin zu laden wäre kein Ladebalken, sondern
ein Abbruch.

Diese Datei nimmt genau das heraus, was die zwei Ketten brauchen, und
nichts weiter: rund 350 Listen statt 8.000, je Liste Platz, Spielerzahl,
Bilanz und die 60 Karten.

WAS „ERFOLGREICHSTE" HEISST — UND WARUM ES IM BILD STEHT
---------------------------------------------------------
Sortiert wird nach (Platz, dann Feldgröße absteigend, dann Siege). Ein
erster Platz unter 203 Spielern ist mehr als ein erster Platz unter 56 —
beide Zahlen stehen in den Daten, keine ist geschätzt, und BEIDE gehen
mit ins Bild. Die Hausregel „jede Quote trägt ihren Nenner" gilt auch
für eine Platzierung: „1." ohne Feldgröße ist keine Aussage.

WAS NICHT AUFGENOMMEN WIRD
--------------------------
Eine Liste, die nicht 60 Karten zählt, ist keine Deckliste. Limitless
liefert bei einigen Turnieren nur die Teilnehmerliste; die Zeilen fehlen
dann ganz oder bleiben unvollständig. So etwas als „erfolgreichste Liste"
zu zeigen wäre eine Behauptung über Karten, die nie gemessen wurden.
Die Zahl der verworfenen Listen steht im Kopf der Datei.

DAS FENSTER IST DATIERT, NICHT BENANNT
--------------------------------------
Im Kopf stehen `von` und `bis` als Datum. „Letzte 7 Tage" ist eine
Beschreibung, kein Beleg — und diese Datei wird beim Deploy gebaut, also
kann sie älter sein als der Tag, an dem der Post entsteht. Die Post-Seite
zeigt deshalb die Daten, nicht die Beschreibung.

AUFRUF
------
    python3 scripts/build_post_decklists.py [--aus data/post_decklists.json]

Fehlt die Quelle oder ist sie unlesbar, schreibt das Skript eine gültige
leere Datei und endet mit 0. Der Deploy darf daran nicht scheitern: eine
Post-Seite, die „keine Listen vorhanden" sagt, ist besser als eine Seite,
die es gar nicht gibt.
════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import argparse
import csv
import datetime
import json
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUELLE = os.path.join(WURZEL, 'data', 'tournament_decklists_per_player.csv')
KARTEN_DB = os.path.join(WURZEL, 'data', 'all_cards_database.json')
ZIEL = os.path.join(WURZEL, 'data', 'post_decklists.json')

FENSTER_TAGE = 7
JE_ARCHETYP = 8          # so viele Listen je Archetyp im 7-Tage-Fenster
# WAS „ERFOLGREICH" HEISST: EIN TOP-8-PLATZ.
#
# Gemessen im Browser am 26.09.2026 stand in der Auswahl
# „Alakazam — best 163rd of 203". Unter der Ueberschrift „die
# erfolgreichsten Listen der letzten 7 Tage" ist ein 163. Platz keine
# Auskunft, sondern eine falsche Behauptung.
#
# Die Schwelle ist nicht erfunden: die Seite rechnet ihre Online-Erfolge
# seit immer ueber den Top-8-Schnitt (data/online_tournament_top8_decks.csv,
# REZEPTE['top8'] in js/ds-post-quellen.js). Dieselbe Vorstellung von
# Erfolg gilt hier — ein Archetyp ohne Top-8-Lauf im Fenster steht nicht
# in der Auswahl, und das ist richtig so.
ERFOLG_PLATZ = 8
MAJOR_PLAETZE = 32       # „nicht mehr anbieten als die Top 32"
DECKGROESSE = 60

# Fast jede Bildadresse beginnt gleich. Einmal im Kopf, dann je Karte
# nur der Rest — das spart bei 600 Karten rund 50 KB.
PRAEFIX = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/'


def _zahl(x, vorgabe=0):
    try:
        return int(str(x).strip())
    except (TypeError, ValueError):
        return vorgabe


def bilderkarte():
    """set-nummer -> Bildadresse, aus der Kartendatenbank der Seite."""
    if not os.path.exists(KARTEN_DB):
        return {}
    try:
        with open(KARTEN_DB, encoding='utf-8') as f:
            db = json.load(f)
    except (OSError, ValueError):
        return {}
    aus = {}
    for c in (db.get('cards') or []):
        url = (c.get('image_url') or '').strip()
        if not url:
            continue
        s = (c.get('set') or '').strip().upper()
        n = (c.get('number') or '').strip().upper()
        if not s or not n:
            continue
        aus.setdefault(s + '-' + n, url)
    return aus


def listen_lesen(pfad):
    """Eine Zeile je (Turnier, Spieler) mit ihren Karten."""
    listen = {}
    turniere = {}
    with open(pfad, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            # DIE KENNUNG IST NICHT IMMER DIE ERSTE SPALTE.
            #
            # Gemessen am 26.09.2026: `tournament_id` ist bei ALLEN
            # Online-Turnieren leer — nur die Papier-Turniere tragen sie.
            # Wer auf ihr gruppiert, wirft alle Online-Listen eines
            # Spielers in einen Topf: der Schluessel ('', 'Aya') trug 48
            # Zeilen aus zwei Turnieren vom 08.09. und 18.09., Platz 12
            # und Platz 2, zusammen 120 Karten. Genau daran ist der
            # erste Bau gescheitert — er verwarf jede Online-Liste als
            # „nicht 60 Karten" und lieferte null Archetypen.
            tid = ((r.get('tournament_id') or '').strip()
                   or (r.get('limitless_tournament_id') or '').strip())
            spieler = (r.get('player_name') or '').strip()
            if not tid or not spieler:
                continue
            datum = (r.get('tournament_date') or '').strip()
            turniere[tid] = {
                'name': (r.get('tournament_name') or '').strip(),
                'datum': datum,
                'meta': (r.get('meta') or '').strip(),
                'quelle': (r.get('quelle') or '').strip(),
                'spieler': _zahl(r.get('spielerzahl'), 0),
            }
            k = (tid, spieler)
            e = listen.get(k)
            if e is None:
                e = listen[k] = {
                    'tid': tid,
                    'spieler': spieler,
                    'archetyp': (r.get('deck_archetype') or '').strip(),
                    'platz': _zahl(r.get('place'), 0),
                    'w': _zahl(r.get('wins'), 0),
                    'l': _zahl(r.get('losses'), 0),
                    't': _zahl(r.get('ties'), 0),
                    'karten': [],
                    'gesamt': 0,
                }
            anzahl = _zahl(r.get('count'), 0)
            if anzahl <= 0:
                continue
            e['karten'].append([
                (r.get('card_name') or '').strip(),
                (r.get('set_code') or '').strip().upper(),
                (r.get('set_number') or '').strip().upper(),
                anzahl,
            ])
            e['gesamt'] += anzahl
    return listen, turniere


def karten_ordnen(karten):
    """Viele zuerst, dann der Name — dieselbe Lesereihenfolge wie im Bild."""
    zus = {}
    for name, s, n, anzahl in karten:
        k = (name, s, n)
        zus[k] = zus.get(k, 0) + anzahl
    aus = [[k[0], k[1], k[2], v] for k, v in zus.items()]
    aus.sort(key=lambda x: (-x[3], x[0].lower()))
    return aus


def rang(e, feld):
    """(Platz, Feldgröße absteigend, Siege absteigend) — siehe Kopf."""
    platz = e['platz'] if e['platz'] > 0 else 9999
    return (platz, -feld, -e['w'])


def bauen():
    if not os.path.exists(QUELLE):
        return None, 'Quelle fehlt: ' + QUELLE
    listen, turniere = listen_lesen(QUELLE)
    if not listen:
        return None, 'Quelle ohne Listen'

    letztes = max((t['datum'] for t in turniere.values() if t['datum']), default='')
    if not letztes:
        return None, 'Quelle ohne Datum'
    bis = datetime.date.fromisoformat(letztes)
    von = bis - datetime.timedelta(days=FENSTER_TAGE - 1)

    verworfen = 0
    vollstaendig = {}
    for k, e in listen.items():
        if e['gesamt'] != DECKGROESSE:
            verworfen += 1
            continue
        vollstaendig[k] = e

    # ── Die letzten sieben Tage, online ──────────────────────────────
    nach_archetyp = {}
    for e in vollstaendig.values():
        t = turniere[e['tid']]
        if t['quelle'] != 'online':
            continue
        if not t['datum'] or not (von.isoformat() <= t['datum'] <= bis.isoformat()):
            continue
        if not (0 < e['platz'] <= ERFOLG_PLATZ):
            continue
        a = e['archetyp'] or 'Other'
        nach_archetyp.setdefault(a, []).append(e)

    sieben = {}
    for a, gruppe in nach_archetyp.items():
        gruppe.sort(key=lambda e: rang(e, turniere[e['tid']]['spieler']))
        sieben[a] = [{
            'turnier': turniere[e['tid']]['name'],
            'datum': turniere[e['tid']]['datum'],
            'meta': turniere[e['tid']]['meta'],
            'feld': turniere[e['tid']]['spieler'],
            'platz': e['platz'],
            'w': e['w'], 'l': e['l'], 't': e['t'],
            'karten': karten_ordnen(e['karten']),
        } for e in gruppe[:JE_ARCHETYP]]

    # ── Das letzte Major, Top 32 ─────────────────────────────────────
    papier = [(tid, t) for tid, t in turniere.items() if t['quelle'] == 'papier' and t['datum']]
    papier.sort(key=lambda x: x[1]['datum'], reverse=True)
    major = None
    if papier:
        tid, t = papier[0]
        eintraege = [e for e in vollstaendig.values()
                     if e['tid'] == tid and 0 < e['platz'] <= MAJOR_PLAETZE]
        eintraege.sort(key=lambda e: e['platz'])
        # DER NENNER EINER PLATZIERUNG.
        #
        # `spielerzahl` ist bei den Papier-Turnieren leer (gemessen
        # 26.09.2026) — die Spalte fuellt nur der Online-Scraper. Die
        # Feldgroesse steht aber trotzdem in der Datei: Limitless fuehrt
        # bei einem Major die VOLLE Abschlusstabelle, und die Plaetze
        # laufen von 1 bis zur Teilnehmerzahl (Baltimore: 1 bis 559).
        # Gezaehlt wird deshalb, wie viele Spieler das Turnier hier
        # ueberhaupt fuehrt — und die Zahl heisst drueben „of 559",
        # nicht „559 players": es ist die Zahl der GEFUEHRTEN
        # Platzierungen, und mehr behauptet sie nicht.
        gefuehrt = len({s for (k, s) in listen if k == tid})
        major = {
            'name': t['name'], 'datum': t['datum'], 'meta': t['meta'],
            'plaetze': MAJOR_PLAETZE,
            'gefuehrt': gefuehrt,
            'listen': [{
                'platz': e['platz'],
                'archetyp': e['archetyp'] or 'Other',
                'w': e['w'], 'l': e['l'], 't': e['t'],
                'karten': karten_ordnen(e['karten']),
            } for e in eintraege],
        }

    # ── Bildadressen nur für die Karten, die vorkommen ───────────────
    db = bilderkarte()
    gebraucht = set()
    for reihe in sieben.values():
        for L in reihe:
            for name, s, n, _ in L['karten']:
                gebraucht.add(s + '-' + n)
    for L in ((major or {}).get('listen') or []):
        for name, s, n, _ in L['karten']:
            gebraucht.add(s + '-' + n)
    bilder = {}
    for k in sorted(gebraucht):
        url = db.get(k)
        if not url:
            continue
        bilder[k] = url[len(PRAEFIX):] if url.startswith(PRAEFIX) else url

    return {
        'v': 1,
        'gebaut': datetime.datetime.now(datetime.timezone.utc)
                  .strftime('%Y-%m-%dT%H:%M:%SZ'),
        'quelle': 'data/tournament_decklists_per_player.csv',
        'fenster': {'von': von.isoformat(), 'bis': bis.isoformat(),
                    'tage': FENSTER_TAGE, 'erfolg_platz': ERFOLG_PLATZ},
        'verworfen_unvollstaendig': verworfen,
        'je_archetyp': JE_ARCHETYP,
        'bild_praefix': PRAEFIX,
        'bilder': bilder,
        'sieben_tage': sieben,
        'major': major,
    }, None


def leer(grund):
    return {
        'v': 1,
        'gebaut': datetime.datetime.now(datetime.timezone.utc)
                  .strftime('%Y-%m-%dT%H:%M:%SZ'),
        'quelle': 'data/tournament_decklists_per_player.csv',
        'fenster': None, 'verworfen_unvollstaendig': 0,
        'je_archetyp': JE_ARCHETYP,
        'bild_praefix': PRAEFIX, 'bilder': {},
        'sieben_tage': {}, 'major': None,
        'ohne_daten': grund,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--aus', default=ZIEL)
    a = p.parse_args()
    try:
        daten, fehler = bauen()
    except Exception as e:                                # noqa: BLE001
        daten, fehler = None, type(e).__name__ + ': ' + str(e)
    if daten is None:
        print('::warning::post_decklists: ' + str(fehler))
        daten = leer(str(fehler))
    os.makedirs(os.path.dirname(os.path.abspath(a.aus)), exist_ok=True)
    with open(a.aus, 'w', encoding='utf-8') as f:
        json.dump(daten, f, ensure_ascii=False, separators=(',', ':'))
    gr = os.path.getsize(a.aus)
    print('post_decklists: %s — %d Archetypen, %d Major-Listen, %d Bilder, %.0f KB'
          % (a.aus, len(daten['sieben_tage']),
             len((daten.get('major') or {}).get('listen') or []),
             len(daten['bilder']), gr / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
