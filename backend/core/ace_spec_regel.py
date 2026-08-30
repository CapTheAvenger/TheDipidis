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


def entscheide(name, ace, mehrfach=None, typen=None) -> str:
    """Entscheidung mit Belegen aus dem gesamten Bestand: `mehrfach` ist die
    Menge der Namen, die IRGENDWO mehrfach gespielt wurden, `typen` bildet
    Name -> alle je beobachteten type-Werte ab. Das ist strenger als die
    zeilenweise Form: eine Karte, die in dieser einen Zeile einmal liegt,
    anderswo aber zweimal, wird auch hier zu "No"."""
    n = (name or "").strip().lower()
    if not n:
        return ""
    if n in ace:
        return "Yes"
    if mehrfach and n in mehrfach:
        return "No"
    ts = (typen or {}).get(n)
    if ts and set(ts) <= KEINE_ACE_TYPEN:
        return "No"
    return ""
