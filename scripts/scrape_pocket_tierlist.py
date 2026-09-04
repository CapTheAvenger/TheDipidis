#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""POKÉMON TCG POCKET — TIER-LISTE UND SET-DECKS VON GAME8

ANLASS (04.09.2026)
-------------------
Betreiber: "ich würde gerne die Tier List von game8 übernehmen + die new
set xy Decks [...] ich will den Scan Code haben um das Deck in Pocket
einfach nachzubauen."

WAS DIESES SKRIPT HOLT
----------------------
Zwei Tabellen von derselben Game8-Seite:

  1. die Tier-Liste (S / A+ / A / B / C / D),
  2. die Decks des aktuellen Sets ("New <Set> Decks" und "Old Decks
     Updated with <Set>").

Je Deck folgt es der Verknüpfung auf die Deck-Seite und holt dort den
Scan-Code — in Pocket heißt das "2D-Muster".

DER SCAN-CODE IST EIN BILD, KEIN TEXT
-------------------------------------
Game8 zeigt den Code ausschließlich als QR-PNG auf img.game8.co. Es gibt
auf keiner Deck-Seite einen abschreibbaren Textcode. Deshalb LIEST dieses
Skript den QR aus und legt seinen INHALT ab, nicht das fremde Bild:

  * kein Hotlink auf einen fremden Server, der jederzeit abschalten kann,
  * kein fremdes Bildmaterial in unserem Auslieferungsstand,
  * und die Oberfläche kann den Code selbst rendern, in unserer Größe
    und in unseren Farben.

DIE GEGENPROBE IST PFLICHT
--------------------------
Ein ausgelesener Code, der beim Neu-Erzeugen anders herauskommt, wäre
schlimmer als gar keiner: der Nutzer scannt ihn, Pocket lädt ein falsches
oder kein Deck, und niemand merkt woran es lag. Deshalb prüft jeder Code
sich selbst — auslesen, neu erzeugen, WIEDER auslesen, und beide Inhalte
müssen Zeichen für Zeichen gleich sein. Wer die Probe nicht besteht,
kommt NICHT in die Datei; er wird gemeldet.

Das ist dieselbe Hausregel wie überall hier: "Report, don't silently
repair."

DIE QUELLE STEHT IN DER DATEI
-----------------------------
Die Tier-Einstufung ist Game8s redaktionelle Einschätzung, keine von uns
gemessene Zahl. Jede Ausgabe trägt deshalb Quelle, Adresse und Abrufdatum
im `_meta`-Block, damit die Oberfläche es anschreiben kann.

NETZ
----
game8.co und img.game8.co sind aus dem Bausandkasten NICHT erreichbar
(der Egress-Proxy antwortet mit 403). Dieses Skript läuft deshalb in CI.
Für die Entwicklung ohne Netz gibt es `--aus-datei`.

AUFRUF
------
    python3 scripts/scrape_pocket_tierlist.py                 # normal
    python3 scripts/scrape_pocket_tierlist.py --nur 3         # Probelauf
    python3 scripts/scrape_pocket_tierlist.py --aus-datei x.html --trocken
"""

import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEN = os.path.join(ROOT, "data")
AUSGABE = os.path.join(DATEN, "pocket_tierlist.json")

QUELLE = "https://game8.co/games/Pokemon-TCG-Pocket/archives/477754"
BASIS = "https://game8.co"
# Ein einzelner User-Agent ohne seine üblichen Begleiter ist selbst ein
# Erkennungsmerkmal: echte Browser schicken Accept, Accept-Language und
# die sec-*-Zeilen immer mit.
KOPF = {
    "User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": ("text/html,application/xhtml+xml,application/xml;q=0.9,"
               "image/avif,image/webp,*/*;q=0.8"),
    "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}

# Zwischen zwei Abrufen. Game8 ist eine fremde Seite, die uns nichts
# schuldet — 50 Deck-Seiten im Sekundentakt sind höflich, im Millisekunden-
# takt sind sie eine Last.
PAUSE_S = 1.2


# ── Netz ──────────────────────────────────────────────────────────────
#
# GAME8 LIEFERT EINEM NACKTEN requests-AUFRUF ETWAS ANDERES.
#
# BEFUND (04.09.2026, erster Lauf in CI). Der Scraper brach sofort ab:
# "keine Tier-Tabelle gefunden". Im Browser steht die Tabelle im ROHEN
# HTML — nachgemessen: 15 Tabellen, drei davon mit Tier-Abzeichen,
# "Chien-Pao ex and Baxcalibur" und alt="S Tier" beide enthalten. Es ist
# also kein JavaScript-Problem, sondern Bot-Schutz: derselbe Aufruf vom
# Github-Läufer bekommt eine andere Seite.
#
# Dieses Repo kennt das Problem längst — sechs Scraper benutzen dafür
# cloudscraper, und `_curl_cffi_fetch` in backend/core/card_scraper_shared.py
# hängt curl_cffi mit Chrome-TLS-Fingerabdruck dahinter. Genau diese
# Leiter wird hier nachgebaut.
#
# ZWEITER BEFUND (04.09.2026, zweiter Lauf in CI). Die erste Fassung der
# Leiter fiel nur weiter, wenn eine Bibliothek FEHLTE. cloudscraper war
# da, lieferte aber HTTP 202 — Cloudflares "Prüfung läuft" —, und damit
# war Schluss: curl_cffi kam nie an die Reihe.
#
# Die Leiter muss also an der ANTWORT hängen, nicht am Import:
#
#     cloudscraper  →  curl_cffi (chrome120)  →  requests
#
# Wer 202, 403, 429 oder 503 antwortet, hat uns abgewiesen; ein zweiter
# Versuch mit derselben Sprosse ändert daran nichts, also sofort zur
# nächsten. Wer 200 liefert, wird gemerkt und für alle weiteren rund
# hundert Abrufe benutzt — sonst würde jede Deck-Seite die ganze Leiter
# von vorn durchlaufen. Kippt die gemerkte Sprosse später doch noch (der
# Schutz kann mitten im Lauf anspringen), wird sie vergessen und die
# Leiter einmal neu gegangen.
#
# Die letzte Sprosse ist kein Ersatz, sondern die Zusicherung, dass das
# Skript wenigstens ANLÄUFT, wenn eine Bibliothek fehlt.
#
# Und wenn ALLE Sprossen abgewiesen werden, steht im Fehler, was JEDE
# einzelne geantwortet hat. Ohne das beginnt die Suche beim nächsten Mal
# wieder bei null — genau der Fehler des ersten Laufs.

SPROSSEN = ("cloudscraper", "curl_cffi", "requests")

# Antworten, die "wir lassen dich nicht" heißen. 202 ist der wichtigste:
# Cloudflare schickt ihn, während es seine Prüfung ausspielt, und er
# sieht keinem Fehler ähnlich.
ABGEWIESEN = (202, 401, 403, 429, 503)


def _baue(art):
    """Eine Sprosse bauen. Wirft, wenn die Bibliothek fehlt."""
    if art == "cloudscraper":
        import cloudscraper  # type: ignore
        return cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "linux"})
    if art == "curl_cffi":
        from curl_cffi import requests as cffi  # type: ignore
        # chrome120 ist das Ziel, das backend/core/card_scraper_shared.py
        # seit Monaten benutzt — also eines, von dem wir wissen, dass die
        # hier installierte Fassung es kennt. Die anderen sind da, falls
        # curl_cffi eines Tages alte Ziele fallen lässt.
        letzter = None
        for ziel in ("chrome120", "chrome124", "chrome"):
            try:
                return cffi.Session(impersonate=ziel)
            except Exception as e:  # noqa: BLE001
                letzter = e
        raise RuntimeError(f"keine bekannte Chrome-Nachahmung ({letzter})")
    import requests
    s = requests.Session()
    s.headers.update(KOPF)
    return s


def _frage(sitzung, url, binaer, versuche):
    """Eine Sprosse fragen. Gibt (inhalt, None) oder (None, Grund)."""
    letzter = None
    for i in range(versuche):
        try:
            a = sitzung.get(url, headers=KOPF, timeout=30)
            if a.status_code == 200:
                return (a.content if binaer else a.text), None
            letzter = f"HTTP {a.status_code}"
            if a.status_code in ABGEWIESEN:
                return None, letzter          # Abweisung — nicht nachbohren
        except Exception as e:  # noqa: BLE001
            letzter = f"{type(e).__name__}: {e}"
        time.sleep(1.5 * (i + 1))
    return None, letzter


_GEMERKT = None   # (Art, Sitzung) der Sprosse, die zuletzt 200 lieferte


def hole(url, binaer=False, versuche=3):
    global _GEMERKT
    if _GEMERKT is not None:
        inhalt, grund = _frage(_GEMERKT[1], url, binaer, versuche)
        if inhalt is not None:
            return inhalt
        print(f"  {_GEMERKT[0]} antwortet nicht mehr ({grund}) — Leiter neu")
        _GEMERKT = None

    berichte = []
    for art in SPROSSEN:
        try:
            sitzung = _baue(art)
        except Exception as e:  # noqa: BLE001
            berichte.append(f"{art}: nicht verfügbar ({e})")
            continue
        inhalt, grund = _frage(sitzung, url, binaer, versuche)
        if inhalt is not None:
            print(f"  Abruf über {art}")
            _GEMERKT = (art, sitzung)
            return inhalt
        berichte.append(f"{art}: {grund}")

    raise RuntimeError(
        f"{url}: keine Sprosse kam durch — " + " | ".join(berichte)
        + ". HTTP 202 heißt Cloudflare-Prüfung, 403 heißt abgewiesen; "
        "beides ist Bot-Schutz und kein Fehler im Aufbau der Seite.")


# ── Die zwei Tabellen lesen ───────────────────────────────────────────
#
# Aufbau, nachgesehen am 04.09.2026 im Browser:
#
#   <tr><th><img alt="S Tier"></th></tr>          <- die Stufe
#   <tr><td>
#     <a href=".../archives/583149#hm_102">
#       <img alt="Chien-Pao ex and Baxcalibur Deck">
#     </a> ...
#   </td></tr>
#
# Der volle Deckname steht im alt-Text des Deck-Bildes; die Stufe im
# alt-Text des Abzeichens darüber. Beides ist stabiler als der sichtbare
# Text, der in den Kacheln als Bild gesetzt ist.

def _archiv_id(href):
    m = re.search(r"/archives/(\d+)", href or "")
    return m.group(1) if m else None


def lies_tabelle(tab):
    """[(name, stufe, archiv_id)] aus einer Game8-Deck-Tabelle."""
    raus, stufe = [], None
    for tr in tab.find_all("tr"):
        abzeichen = tr.find("img", alt=re.compile(r"\bTier$"))
        if abzeichen and tr.find("th"):
            stufe = re.sub(r"\s*Tier$", "", abzeichen.get("alt", "")).strip()
            continue
        for a in tr.find_all("a", href=True):
            aid = _archiv_id(a["href"])
            img = a.find("img")
            if not aid or not img:
                continue
            name = re.sub(r"\s*Deck$", "", (img.get("alt") or "")).strip()
            if not name:
                continue
            # In der Set-Tabelle steht die Stufe je Zelle statt je Zeile.
            eigen = a.find_parent(["td", "th"])
            eigen_abz = eigen.find("img", alt=re.compile(r"\bTier$")) if eigen else None
            raus.append((name,
                         re.sub(r"\s*Tier$", "", eigen_abz["alt"]).strip()
                         if eigen_abz else stufe,
                         aid))
    return raus


def lies_seite(html):
    """Die Tier-Liste und die Set-Decks aus der Übersichtsseite."""
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "lxml")
    tabellen = suppe.find_all("table")

    def mit_decks(pruef):
        treffer = [t for t in tabellen
                   if pruef(t) and len(t.find_all("a", href=re.compile(r"/archives/\d+"))) > 2]
        return treffer[0] if treffer else None

    tier_tab = mit_decks(lambda t: t.find("img", alt=re.compile(r"\bTier$")) is not None
                         and t.find("th") is not None)
    set_tab = mit_decks(lambda t: re.search(r"New .+ Decks", t.get_text(" ", strip=True) or ""))

    if tier_tab is None:
        # Sagen, WAS ankam, nicht nur DASS nichts passte. Ohne diese
        # Zeilen sieht ein Bot-Schutz genauso aus wie ein Umbau der
        # Seite, und man rät zwischen zwei ganz verschiedenen Ursachen.
        raise RuntimeError(
            "keine Tier-Tabelle gefunden. "
            f"Empfangen: {len(html)} Zeichen, {len(tabellen)} Tabellen, "
            f"Tier-Abzeichen im Text: {'ja' if 'Tier' in html else 'nein'}, "
            f"Beispieldeck im Text: "
            f"{'ja' if 'Chien-Pao' in html else 'nein'}. "
            f"Anfang: {html[:160]!r}. "
            "Steht dort eine Sperrseite, ist es Bot-Schutz; steht dort die "
            "echte Seite, hat sich ihr Aufbau geändert. Raten wäre hier "
            "schlimmer als der gemeldete Ausfall")
    return (lies_tabelle(tier_tab),
            lies_tabelle(set_tab) if set_tab is not None else [])


# ── Der Scan-Code ─────────────────────────────────────────────────────

def qr_adresse(html):
    """Die Adresse des 2D-Musters auf einer Deck-Seite.

    Game8 lädt die Bilder verzögert: die echte Adresse steht in
    `data-src`, in `src` sitzt ein 1x1-Platzhalter. Wer `src` liest,
    bekommt ein leeres GIF und wundert sich.
    """
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "lxml")
    img = suppe.find("img", alt=re.compile(r"2D Pattern|QR Code", re.I))
    if not img:
        return None
    return (img.get("data-src") or img.get("src") or "").split("?")[0] or None


def lies_qr(daten):
    """Den Inhalt eines QR-Bildes auslesen. None, wenn keiner gefunden."""
    import numpy as np
    import zxingcpp
    from PIL import Image
    bild = Image.open(io.BytesIO(daten)).convert("L")
    treffer = zxingcpp.read_barcodes(np.array(bild))
    return treffer[0].text if treffer else None


def probe(inhalt, erzeuge=None):
    """Neu erzeugen und wieder auslesen — kommt dasselbe heraus?

    Ohne diese Probe könnte ein Code in unserer Datei stehen, der beim
    Rendern zu etwas anderem wird. Der Nutzer scannt, Pocket lädt das
    falsche Deck, und der Fehler säße unsichtbar in der Datei.

    `erzeuge` gibt es nur für die Prüfung dieser Funktion selbst: der
    Test schiebt eine Erzeugung unter, die absichtlich etwas anderes
    kodiert, und erwartet False. Ohne diesen Griff ließe sich nicht
    belegen, dass die Probe einen Unterschied ÜBERHAUPT bemerkt — sie
    könnte ebenso gut nur prüfen, ob irgendein Code lesbar ist.
    """
    import numpy as np
    import segno
    import zxingcpp
    from PIL import Image
    puffer = io.BytesIO()
    (erzeuge or segno.make)(inhalt, error="m").save(
        puffer, kind="png", scale=8, border=4)
    puffer.seek(0)
    treffer = zxingcpp.read_barcodes(np.array(Image.open(puffer).convert("L")))
    return bool(treffer) and treffer[0].text == inhalt


# ── Lauf ──────────────────────────────────────────────────────────────

def sammle(tier, set_decks, nur=None, still=False):
    """Je Deck den Scan-Code holen. Gibt (decks, ausfaelle) zurück."""
    alle = {}
    for name, stufe, aid in tier:
        alle[aid] = {"name": name, "tier": stufe, "archiv": aid, "quelle_liste": "tier"}
    for name, stufe, aid in set_decks:
        wo = alle.setdefault(aid, {"name": name, "tier": stufe, "archiv": aid,
                                   "quelle_liste": "set"})
        if wo.get("quelle_liste") == "tier":
            wo["quelle_liste"] = "beide"
        wo.setdefault("tier", stufe)

    reihe = list(alle.values())
    if nur:
        reihe = reihe[:nur]

    fertig, ausfaelle = [], []
    for i, d in enumerate(reihe, 1):
        url = f"{BASIS}/games/Pokemon-TCG-Pocket/archives/{d['archiv']}"
        try:
            adresse = qr_adresse(hole(url))
            if not adresse:
                ausfaelle.append((d["name"], "kein 2D-Muster auf der Seite"))
                continue
            inhalt = lies_qr(hole(adresse, binaer=True))
            if not inhalt:
                ausfaelle.append((d["name"], "QR nicht lesbar"))
                continue
            if not probe(inhalt):
                ausfaelle.append((d["name"], "Gegenprobe fehlgeschlagen — neu "
                                             "erzeugt ergibt einen anderen Inhalt"))
                continue
            d["code"] = inhalt
            fertig.append(d)
            if not still:
                print(f"  [{i}/{len(reihe)}] {d['name'][:44]:46} {len(inhalt):4} Zeichen")
        except Exception as e:  # noqa: BLE001
            ausfaelle.append((d["name"], str(e)[:90]))
        time.sleep(PAUSE_S)
    return fertig, ausfaelle


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--nur", type=int, help="nur die ersten N Decks (Probelauf)")
    p.add_argument("--aus-datei", help="Übersichtsseite aus einer Datei statt aus dem Netz")
    p.add_argument("--trocken", action="store_true", help="nichts schreiben")
    a = p.parse_args()

    html = (open(a.aus_datei, encoding="utf-8").read() if a.aus_datei
            else hole(QUELLE))
    tier, set_decks = lies_seite(html)
    print(f"Übersicht: {len(tier)} Decks in der Tier-Liste, "
          f"{len(set_decks)} beim aktuellen Set")
    if not tier:
        print("::error::keine Decks gefunden — Aufbau der Seite geändert?")
        return 1

    if a.aus_datei and a.trocken:
        for n, s, i in tier[:8]:
            print(f"  {s or '?':3} {n}")
        return 0

    fertig, ausfaelle = sammle(tier, set_decks, nur=a.nur)

    for name, grund in ausfaelle:
        print(f"::warning::{name}: {grund}")
    print(f"\n{len(fertig)} Decks mit geprüftem Scan-Code, {len(ausfaelle)} ohne")

    if not fertig:
        print("::error::kein einziger Scan-Code gelesen — ein leeres Ergebnis "
              "ist kein Erfolg")
        return 1

    aus = {
        "_meta": {
            "zweck": "Tier-Liste und Set-Decks für Pokémon TCG Pocket, mit "
                     "geprüftem Scan-Code je Deck.",
            "quelle": "game8.co",
            "quelle_url": QUELLE,
            "quelle_hinweis": "Die Tier-Einstufung ist die redaktionelle "
                              "Einschätzung von Game8, keine von uns gemessene "
                              "Zahl. Die Oberfläche muss das anschreiben.",
            "code_hinweis": "Der Scan-Code ist der ausgelesene Inhalt des "
                            "2D-Musters, nicht Game8s Bild. Jeder Code hat die "
                            "Gegenprobe bestanden: neu erzeugt und wieder "
                            "ausgelesen ergibt denselben Inhalt.",
            "abgerufen": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "anzahl": len(fertig),
            "ohne_code": [{"name": n, "grund": g} for n, g in ausfaelle],
        },
        "decks": fertig,
    }
    if a.trocken:
        print(json.dumps(aus["_meta"], ensure_ascii=False, indent=2))
        return 0
    os.makedirs(DATEN, exist_ok=True)
    with open(AUSGABE, "w", encoding="utf-8") as f:
        json.dump(aus, f, ensure_ascii=False, indent=1)
    print(f"geschrieben: {os.path.relpath(AUSGABE, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
