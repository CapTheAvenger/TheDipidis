# -*- coding: utf-8 -*-
"""Welcher DRUCK einer Karte in der Masterclass steht.

Zwei Regeln, zwei Zwecke (Hausi, 22.09.2026):

  * In den LISTEN der neueste guenstige Druck — die werden verschickt
    und nachgebaut. ("In den Listen selbst bitte den aktuellsten
    Low-Rarity-Print benutzen, das macht es beim Teilen einfacher.")
  * Im KARTENDETAIL und auf der Regalkachel der hochwertigste Druck aus
    dem Formatfenster — den sieht man sich an.

Die Rangfolge ist die von js/app-utils.js getRarityPriority. EIN
Unterschied, und der ist Absicht: dort bekommt eine Karte OHNE
Raritaetsangabe 999 und wird in der "min"-Wahl ausgefiltert. Hier
zaehlt sie als guenstigster Druck, weil genau das die Grundenergien
sind. Nachgerechnet am 23.09.2026: mit der 999-Regel waere die
Metall-Energie der Listen SFA-99 (Secret Rare, 30,61 EUR) statt MEE-8
(2 Cent) — und MEE-8 ist der Druck, den alle vier echten
Mega-Stalobor-Listen auf Limitless registriert haben.

Dieses Modul stand bis zum 23.09.2026 nur im Scratchpad. Seit die
Masterclass am Wochenlauf haengt, braucht der Nachzieher es im Repo:
eine Liste kann eine Karte enthalten, die im Stueck noch nicht
vorkommt.
"""
import csv, datetime, json, os, re

BASIS = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(BASIS)
csv.field_size_limit(10 ** 7)

_rows = list(csv.DictReader(open(os.path.join(REPO, 'data', 'all_cards_database.csv'), encoding='utf-8-sig')))
_idx = {}
for _r in _rows:
    _idx.setdefault((_r['set'], _r['number']), _r)

_meta = json.load(open(os.path.join(REPO, 'data', 'sets_metadata.json'), encoding='utf-8'))
_fw = json.load(open(os.path.join(REPO, 'data', 'format_window.json'), encoding='utf-8'))
_von = _meta[_fw['oldest_legal_set']]['order']
_bis = _meta[_fw['current_set']]['order']

FENSTER = f"{_fw['oldest_legal_set']}-{_fw['current_set']}"
STAND = datetime.date.today().isoformat()



def im_fenster(setcode):
    m = _meta.get(setcode)
    return bool(m) and _von <= m['order'] <= _bis


def rang(rarity, setcode=''):
    if not rarity:
        return 8 if setcode in ('MEP', 'SVP', 'SP', 'SMP', 'XYP', 'BWP', 'HSP', 'DPP', 'NP', 'WP') else 0
    r = rarity.lower()
    if 'uncommon' in r: return 2
    if 'common' in r: return 1
    if 'secret rare' in r: return 16
    if 'rainbow rare' in r: return 15
    if 'special art rare' in r or 'special illustration rare' in r: return 14
    if 'ultra rare' in r: return 13
    if 'shiny rare' in r: return 12
    if 'character super rare' in r: return 11
    if 'character holo rare' in r or 'art rare' in r or 'illustration rare' in r: return 10
    if 'amazing rare' in r: return 9
    if 'radiant rare' in r: return 8
    if 'triple rare' in r: return 7
    if 'double rare' in r: return 6
    if 'holo rare' in r: return 5
    if 'rare' in r: return 3
    return 0


def hoechster_druck(druck):
    """druck: 'SET-NUM'. Gibt (druck, zeile) des hoechstwertigen Drucks
    derselben Karte im Formatfenster zurueck — oder den Ausgangsdruck."""
    basis = _idx.get(tuple(druck.split('-')))
    if not basis:
        return druck, None
    pool = [p.strip() for p in (basis.get('international_prints') or '').split(',') if p.strip()]
    if druck not in pool:
        pool.append(druck)
    kandidaten = []
    for p in pool:
        if '-' not in p:
            continue
        s, n = p.rsplit('-', 1)
        z = _idx.get((s, n))
        if not z or not (z.get('image_url') or '').strip():
            continue
        if not im_fenster(s):
            continue
        kandidaten.append((rang(z['rarity'], s), s == basis['set'], _meta[s]['order'], z['number'], p, z))
    if not kandidaten:
        return druck, basis
    kandidaten.sort(key=lambda k: (k[0], k[1], k[2], k[3]), reverse=True)
    best = kandidaten[0]
    return best[4], best[5]



def kandidaten(druck):
    """Alle Drucke DERSELBEN Karte im Formatfenster, die ein Bild haben."""
    basis = _idx.get(tuple(druck.split('-')))
    if not basis:
        return [], None
    pool = [p.strip() for p in (basis.get('international_prints') or '').split(',') if p.strip()]
    if druck not in pool:
        pool.append(druck)
    aus = []
    for p in pool:
        if '-' not in p:
            continue
        s, n = p.rsplit('-', 1)
        z = _idx.get((s, n))
        if not z or not (z.get('image_url') or '').strip() or not im_fenster(s):
            continue
        aus.append((p, z, rang(z['rarity'], s), _meta[s]['order'], int(re.sub(r'\D', '', n) or 0)))
    return aus, basis


def neuester_billiger_druck(druck):
    """Der GUENSTIGSTE Druck derselben Karte aus dem NEUESTEN Set, in dem
    es ihn guenstig gibt — die Regel, nach der die uebrige Seite ihre
    Standarddrucke waehlt (js/app-core.js: 'min' = Lowest rarity from
    newest set). Fuer die Listen, die Hausi verschickt: der Druck, den
    jeder in der Hand hat."""
    aus, basis = kandidaten(druck)
    if not aus:
        return druck, basis
    kleinster = min(k[2] for k in aus)
    eng = [k for k in aus if k[2] == kleinster]
    eng.sort(key=lambda k: (-k[3], k[4]))
    return eng[0][0], eng[0][1]
