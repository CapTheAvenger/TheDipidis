"""Die eine Regel, nach der `is_ace_spec` gesetzt wird.

Sie steht hier, damit der Scraper (backend/core/limitless_dated.py) und
die Bestandsreparatur (scripts/repariere_ace_spec.py) nicht auseinander
laufen koennen. Die ausfuehrliche Begruendung mit den gemessenen Zahlen
steht im Kopf von scripts/repariere_ace_spec.py.

Kurz: es wird nicht geraten. Drei Werte, jeder mit Beleg.

    "Yes"  Name steht in data/ace_specs.json
           (limitlesstcg.com/cards?q=is:ace, Stand 18.02.2026).
    "No"   Die Karte wurde nachweislich mit mehr als einer Kopie in
           einem Deck gefuehrt — das verbietet die Deckregel fuer ACE
           SPEC — ODER sie tritt nur als Pokemon bzw. Basis-Energie auf.
    ""     Weder das eine noch das andere. Die Liste wird von Hand
           gepflegt; ob seit Februar ACE SPECs dazugekommen sind, laesst
           sich im Repo nicht feststellen (data/ace_specs.json,
           Feld _hinweis). Leer heisst "unbekannt" und ist wahr.
"""

import json
import os

POKEMON_TYPEN = frozenset({"Basic", "Stage 1", "Stage 2", "VSTAR", "VMAX", "V-UNION"})
KEINE_ACE_TYPEN = POKEMON_TYPEN | {"Basic Energy"}

_LISTE_CACHE = {}


def _repo_wurzel():
    hier = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(hier))


def lade_ace_liste(pfad=None) -> set:
    """Die kanonische Namensliste, klein geschrieben. Leere Menge, wenn die
    Datei fehlt — der Aufrufer entscheidet dann bewusst nichts (leeres
    Feld) statt still "No" zu schreiben."""
    pfad = pfad or os.path.join(_repo_wurzel(), "data", "ace_specs.json")
    if pfad in _LISTE_CACHE:
        return _LISTE_CACHE[pfad]
    namen = set()
    try:
        with open(pfad, encoding="utf-8") as f:
            roh = json.load(f).get("ace_specs") or []
        namen = {str(n).strip().lower() for n in roh if str(n).strip()}
    except (OSError, ValueError):
        namen = set()
    _LISTE_CACHE[pfad] = namen
    return namen


def _zahl(wert):
    try:
        return float(str(wert).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


def entscheide_zeile(name, ace, max_count=None, typ=None) -> str:
    """Entscheidung aus dem, was in EINER Zeile steht."""
    n = (name or "").strip().lower()
    if not n:
        return ""
    if n in ace:
        return "Yes"
    m = _zahl(max_count)
    if m is not None and m > 1:
        return "No"
    t = (typ or "").strip()
    if t and t in KEINE_ACE_TYPEN:
        return "No"
    return ""


def entscheide(name, ace, mehrfach=None, typen=None, typ=None) -> str:
    """Entscheidung mit Belegen aus dem gesamten Bestand: `mehrfach` ist die
    Menge der Namen, die IRGENDWO mehrfach gespielt wurden, `typen` bildet
    Name -> alle je beobachteten type-Werte ab. Das ist strenger als die
    zeilenweise Form: eine Karte, die in dieser einen Zeile einmal liegt,
    anderswo aber zweimal, wird auch hier zu "No".

    `typ` ist der Typ AUS DER ZEILE, die gerade geschrieben wird.

    WARUM ER GEBRAUCHT WIRD (gemessen 11.09.2026)
    ---------------------------------------------
    Der Bestand wird VOR dem Schreiben gelesen. Eine Karte, die zum
    ersten Mal ueberhaupt in einer Liste auftaucht, steht deshalb in
    `typen` noch nicht — `ts` ist None, und die Regel schwieg, obwohl in
    derselben Zeile "Stage 1" stand. Gefunden an genau einer Zeile:
    Iono's Electrode (JTG 48), Stage 1, erste und einzige Nennung, aus
    dem Wochenlauf vom 11.09.2026 06:52 UTC. Der Deploy stand daran.
    `entscheide_zeile` haette sie entschieden, `entscheide` nicht — die
    STAERKERE Regel war an dieser Stelle die schwaechere.

    Der Zeilentyp kommt zu den beobachteten dazu, er ersetzt sie nicht.
    Widersprechen sich beide (Bestand sagt "Item", die Zeile "Stage 1"),
    ist die Vereinigung kein Teil von KEINE_ACE_TYPEN und die Regel
    schweigt weiter — das ist die vorsichtige Seite und die richtige."""
    n = (name or "").strip().lower()
    if not n:
        return ""
    if n in ace:
        return "Yes"
    if mehrfach and n in mehrfach:
        return "No"
    ts = set((typen or {}).get(n) or ())
    t = (typ or "").strip()
    if t:
        ts.add(t)
    if ts and ts <= KEINE_ACE_TYPEN:
        return "No"
    return ""

# ── Belege aus dem gesamten Bestand ──────────────────────────────────
#
# WARUM DAS HIER STEHT UND NICHT NUR IM REPARATURSKRIPT
#
# Bis zum 10.09.2026 schrieben die Scraper mit `entscheide_zeile` (nur
# die eine Zeile bekannt), der spaetere Abgleich rechnete mit
# `entscheide` (ganzer Bestand bekannt). Beide waren fuer sich richtig —
# und die Differenz meldete sich bei JEDEM Wochenlauf als "Drift":
#
#     10.09.2026: 5276 Felder abweichend, verteilt auf genau zwei Dateien
#         current_meta_card_data.csv         770 von 4501 Zeilen
#         online_tournament_dated_cards.csv 4506 von 29153 Zeilen
#     alle uebrigen ~20 Dateien: 0
#
# Nur diese beiden werden bei jedem Lauf VOLLSTAENDIG aus dem aktuellen
# Ausschnitt neu geschrieben. Wissen aus frueheren Formaten ("Karte X
# wurde vor drei Formaten zweimal gespielt") ging dabei jedes Mal
# verloren und tauchte beim naechsten Abgleich wieder als Drift auf.
#
# Seit 10.09.2026 holen sich beide Scraper die Belege des gesamten
# Bestands hier ab und schreiben gleich den starken Wert. Damit gibt es
# nichts mehr nachzurechnen — die Ursache ist weg, nicht die Meldung.
#
# Der Bestand wird EINMAL je Prozess gelesen und gemerkt.

_BELEGE_CACHE = {}


def _belege_spalten(kopf):
    idx = {str(n or '').strip().lower(): i for i, n in enumerate(kopf)}
    return (idx.get('card_name'),
            idx.get('type'),
            idx.get('max_count', idx.get('count')))


def sammle_belege(dateien):
    """(mehrfach, typen) aus den angegebenen CSV-Dateien.

    mehrfach — Namen, die IRGENDWO mit mehr als einer Kopie im Deck
               standen. Die Deckregel verbietet das fuer ACE SPEC, also
               ist die Karte belegt KEIN ACE SPEC.
    typen    — Name -> alle je beobachteten `type`-Werte.
    """
    import csv as _csv
    mehrfach = set()
    typen = {}
    for pfad in dateien:
        try:
            with open(pfad, encoding='utf-8-sig', newline='') as fh:
                probe = fh.read(4096)
                fh.seek(0)
                trenner = ';' if probe.count(';') > probe.count(',') else ','
                leser = _csv.reader(fh, delimiter=trenner)
                try:
                    kopf = next(leser)
                except StopIteration:
                    continue
                i_name, i_typ, i_max = _belege_spalten(kopf)
                if i_name is None:
                    continue
                for zeile in leser:
                    if len(zeile) <= i_name:
                        continue
                    name = (zeile[i_name] or '').strip().lower()
                    if not name:
                        continue
                    if i_typ is not None and len(zeile) > i_typ:
                        t = (zeile[i_typ] or '').strip()
                        if t:
                            typen.setdefault(name, set()).add(t)
                    if i_max is not None and len(zeile) > i_max:
                        m = _zahl(zeile[i_max])
                        if m is not None and m > 1:
                            mehrfach.add(name)
        except OSError:
            continue
    return mehrfach, typen


def belege_aus_bestand(ordner=None):
    """Die Belege ueber ALLE ausgelieferten CSVs mit einer `card_name`-Spalte.

    Wird je Prozess einmal gelesen. Fehlt der Ordner, kommt ein leeres
    Paar zurueck — dann entscheidet `entscheide` genau wie
    `entscheide_zeile`, also ohne zu raten.
    """
    import glob as _glob
    ordner = ordner or os.path.join(_repo_wurzel(), 'data')
    schluessel = os.path.abspath(ordner)
    if schluessel in _BELEGE_CACHE:
        return _BELEGE_CACHE[schluessel]
    dateien = []
    for pfad in sorted(_glob.glob(os.path.join(ordner, '*.csv'))):
        try:
            with open(pfad, encoding='utf-8-sig') as fh:
                kopf = fh.readline()
        except OSError:
            continue
        if 'card_name' in kopf:
            dateien.append(pfad)
    ergebnis = sammle_belege(dateien)
    _BELEGE_CACHE[schluessel] = ergebnis
    return ergebnis
