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

ZWEI PRÜFUNGEN, DIE VERSCHIEDENES SICHERN
-----------------------------------------
1. ECHTHEIT (`lies_qr`): Game8s Muster ist ein verzierter QR-Code, den
   kein einzelner Leseweg zuverlässig knackt. Es wird deshalb auf fünf
   Wegen gelesen, und ein Inhalt gilt erst, wenn MINDESTENS ZWEI
   dasselbe ergeben; widersprechen sie sich, gilt keiner.

2. DARSTELLBARKEIT (`probe`): der Reiter rendert den Code selbst. Also
   wird geprüft, dass er unsere eigene Darstellung übersteht — erzeugen,
   wieder auslesen, vergleichen.

Die zweite Prüfung sagt NICHTS über die Echtheit — Game8s Bild kommt
darin nicht vor. Das ist am 04.09.2026 in der Abnahme richtiggestellt
worden, nachdem der Kopf hier das Gegenteil nahegelegt hatte.

Wer eine der beiden Prüfungen nicht besteht, kommt NICHT in die Datei;
er wird gemeldet. Das ist dieselbe Hausregel wie überall hier:
"Report, don't silently repair."

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


def _anker(href):
    """Der Abschnitt, auf den ein Tier-Eintrag zeigt: `#hm_103`.

    Eine Deck-Seite trägt mehrere Decks; der Anker sagt welches. Die
    Set-Tabelle verlinkt ohne Anker — dort ist es die Seite als Ganzes.
    """
    m = re.search(r"#(hm_\d+)", href or "")
    return m.group(1) if m else None


def lies_tabelle(tab):
    """[(name, stufe, archiv_id, anker)] aus einer Game8-Deck-Tabelle.

    Der Name aus dem alt-Text ist NUR ein Behelf — er ist bei jedem Deck
    mit Apostroph abgeschnitten (siehe deck_abschnitte). Der richtige
    Name kommt später von der Deck-Seite. Hier steht er, damit ein
    Ausfall einen Namen tragen kann, den man wiedererkennt.
    """
    raus, stufe = [], None
    for tr in tab.find_all("tr"):
        abzeichen = tr.find("img", alt=re.compile(r"\bTier$"))
        # NUR ein Abzeichen, das IM th HAENGT, ist eine Stufenzeile.
        #
        # BEFUND (dritte Abnahme, 04.09.2026): hier stand
        # `if abzeichen and tr.find("th")`. Die letzte Zeile der
        # Set-Tabelle hat nur drei Decks und fuellt die vierte Zelle mit
        # `<th colspan="4"></th>` auf. Sie traegt Abzeichen (in den td)
        # UND ein th — also wurde die ganze Zeile uebersprungen:
        #
        #     Zeile 9  Zellen ['td','td','td','th']  Abzeichen: ja
        #     -> 562129 (Whimsicott ex), 571731 (Ariados),
        #        532008 (Sylveon ex) fielen heraus
        #
        # 562129 und 532008 standen danach weder in der Datendatei noch
        # unter den gemeldeten Ausfaellen. Sie waren weg, bevor sammle()
        # sie ueberhaupt gezaehlt hat — deshalb konnte auch die Schwelle
        # nichts davon sehen.
        if abzeichen and abzeichen.find_parent("th") is not None:
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
                         aid,
                         _anker(a["href"])))
    return raus


def lies_seite(html):
    """Die Tier-Liste und die Set-Decks aus der Übersichtsseite."""
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "lxml")
    tabellen = suppe.find_all("table")

    def mit_decks(pruef):
        """ALLE passenden Tabellen, nicht die erste.

        Hier stand `treffer[0]`. Solange Game8 die Tier-Liste in EINE
        Tabelle schreibt, ist das dasselbe — teilt die Seite sie eines
        Tages in sechs (je Stufe eine), liefert die alte Fassung
        klaglos die drei bis fuenf Decks der ersten und meldet dabei
        100 % Quote. Ein stiller Verlust dieser Groesse darf nicht
        moeglich sein (dritte Abnahme, 04.09.2026).
        """
        return [t for t in tabellen
                if pruef(t)
                and len(t.find_all("a", href=re.compile(r"/archives/\d+"))) > 2]

    # WORAN DIE BEIDEN TABELLEN ZU UNTERSCHEIDEN SIND
    # ----------------------------------------------
    # BEFUND (04.09.2026, erster Lauf gegen die ECHTE Seite): beide
    # Suchen fanden dieselbe Tabelle — die Set-Tabelle —, und heraus kamen
    # 24 Decks, die fuenfmal "Team Rocket" hiessen. Die alte Regel
    # ("irgendwo ein Tier-Abzeichen UND irgendwo ein th") trifft auf beide
    # zu, und die Set-Tabelle steht auf der Seite zuerst.
    #
    # Der Unterschied sitzt darin, WO das Abzeichen haengt:
    #
    #   Tier-Tabelle   <tr><th><img alt="S Tier"></th></tr>      <- im th,
    #                  <tr><td> drei Deck-Links </td></tr>          je Stufe
    #                                                               eines
    #   Set-Tabelle    <tr><th>New … Decks</th></tr>
    #                  <tr><td><a>Deck</a><hr><img alt="S Tier"></td>…
    #                                                            <- im td,
    #                                                               je Deck
    #                                                               eines
    #
    # Gezaehlt auf der Seite vom 04.09.: Tier-Tabelle 5 Abzeichen auf 25
    # Links, Set-Tabelle 27 auf 27. Deshalb wird jetzt am th
    # unterschieden, nicht am Vorkommen.
    #
    # Diese Verwechslung ist mir nur deshalb entgangen, weil der
    # Ausschnitt in tests/fixtures/ von mir selbst zurechtgeschnitten war:
    # er enthielt beide Tabellen sauber getrennt. Ein Ausschnitt, den man
    # selbst baut, belegt die eigene Annahme, nicht die Seite.
    tier_tab = mit_decks(lambda t: any(
        th.find("img", alt=re.compile(r"\bTier$")) for th in t.find_all("th")))
    # Beim th nachgesehen und nicht im ganzen Tabellentext: heute macht
    # das keinen Unterschied (auf der Seite vom 04.09.2026 trifft beides
    # genau eine Tabelle), aber die Ueberschrift ist die Stelle, an der
    # Game8 diese Tabelle BENENNT. Der Tabellentext enthaelt auch jeden
    # Decknamen, und ein Deck, das eines Tages "New Something Decks"
    # heisst, wuerde die Suche sonst auf die falsche Tabelle ziehen.
    set_tab = mit_decks(lambda t: any(
        re.search(r"New .+ Decks", th.get_text(" ", strip=True) or "")
        for th in t.find_all("th")))

    if not tier_tab:
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
    if not set_tab:
        # HARTER BEFUND, keine Warnung (zweite Abnahme, 04.09.2026).
        #
        # Vorher wurde nur gewarnt und weitergelaufen: 24 Decks fielen
        # weg, die Schwelle sah davon nichts (sie kennt nur die
        # angegangenen Eintraege), die Datei wurde ueberschrieben und
        # der Lauf gab 0 zurueck.
        #
        # Der Reiter verspricht zwei Abschnitte. Eine Datei mit nur
        # einem davon ist kein halber Erfolg, sondern ein stiller
        # Verlust — und der Zeitpunkt, an dem ein Mensch hinsehen soll.
        raise RuntimeError(
            "keine Set-Tabelle gefunden (gesucht nach einer Überschrift "
            "'New … Decks'). Die Decks des aktuellen Sets fehlen damit "
            "vollständig. Heißt der Abschnitt bei Game8 jetzt anders? "
            "Weiterzulaufen hiesse, die halbe Datei als ganze auszuliefern")
    def alle_zeilen(tabellen_liste):
        raus = []
        for t in tabellen_liste:
            raus.extend(lies_tabelle(t))
        return raus

    return alle_zeilen(tier_tab), alle_zeilen(set_tab)


# ── Der Scan-Code ─────────────────────────────────────────────────────

# EINE DECK-SEITE TRÄGT MEHRERE 2D-MUSTER — EINES JE VARIANTE
# -----------------------------------------------------------
# BEFUND (04.09.2026, an der echten Seite). Die Seite 597145 zeigt vier
# Muster: Greninja, EW Butterfree, Teal Mask Ogerpon ex, Pheromosa. Wer
# "das erste Muster der Seite" nimmt, liefert für drei von vier Decks den
# Code eines FREMDEN Decks aus — der Nutzer scannt, bekommt ein anderes
# Deck, und niemand merkt woran es lag. Genau der Fehler, gegen den die
# Gegenprobe unten gebaut ist, nur eine Ebene höher.
#
# Die Tier-Liste verlinkt deshalb nicht nur die Seite, sondern den
# Abschnitt: `/archives/597145#hm_103`. Auf der Seite steht über jedem
# Muster die Überschrift des Decks. Beides zusammen ergibt die Zuordnung.
#
# WARUM DER NAME AUS DER ÜBERSCHRIFT KOMMT UND NICHT AUS DEM alt-TEXT
# -------------------------------------------------------------------
# Game8 schreibt Namen mit Apostroph kaputt ins Markup. Im Rohtext steht
#
#     alt="Team Rocket" s articuno ex data-src="…"
#
# — der Apostroph ist als Anführungszeichen ausgegeben, das Attribut
# endet danach, und der Rest wird zu leeren Attributen (`s`, `articuno`,
# `ex`). JEDER regelkonforme Parser liest hier "Team Rocket"; das ist
# kein Fehler von lxml, sondern kaputtes HTML. Der Rest kommt obendrein
# kleingeschrieben an, wäre also selbst beim Zusammensetzen falsch.
#
# Gezählt auf der Seite vom 04.09.: von 25 Decks der Tier-Liste hießen
# fünf schlicht "Team Rocket". Überschriften sind Elementtext und
# deshalb heil.


def deck_abschnitte(html):
    """[(name, adresse)] — jedes 2D-Muster der Seite mit seinem Deck.

    Gelesen wird am ROHEN HTML, nicht am Baum: die alt-Texte der Muster
    sind aus demselben Grund kaputt wie die der Vorschaubilder, und die
    Adresse steht in `data-src` (Game8 lädt verzögert; in `src` sitzt
    ein 1x1-Platzhalter).
    """
    # Kommentare und Skripte spielen hier keine Rolle.
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S | re.I)

    raus = []
    gesehen = set()
    for m in re.finditer(r"2D Pattern", html):
        # DIE ADRESSE MUSS AUS DEMSELBEN <img>-TAG STAMMEN.
        #
        # Vorher wurde einfach das nächste `data-src` innerhalb von 400
        # Zeichen genommen. Die zweite Abnahme (04.09.2026) hat zwei
        # Wege gezeigt, auf denen das danebengreift: "2D Pattern" im
        # Fließtext oder Inhaltsverzeichnis erzeugte einen erfundenen
        # Abschnitt mit der Adresse des nächsten beliebigen Bildes, und
        # eine gedrehte Attributreihenfolge hätte die Adresse des
        # FOLGENDEN Bildes geliefert — Name und Code wären
        # auseinandergefallen, ohne Meldung.
        #
        # Jetzt werden die Grenzen des umschließenden Tags bestimmt.
        # Steht "2D Pattern" nicht in einem <img>-Tag, ist es kein
        # Muster.
        auf = html.rfind("<", 0, m.start())
        zu = html.find(">", m.end())
        if auf < 0 or zu < 0:
            continue
        tag = html[auf:zu + 1]
        if not tag.lower().startswith("<img"):
            continue
        # Ein Tag zaehlt einmal. Steht "2D Pattern" darin zweimal (etwa
        # in alt UND title), stand der Abschnitt vorher doppelt in der
        # Liste — und jede Eindeutigkeitspruefung in waehle_abschnitt
        # schlug fehl, obwohl es nur ein Muster gab (dritte Abnahme,
        # 04.09.2026).
        if auf in gesehen:
            continue
        gesehen.add(auf)
        adr = re.search(r"data-src=['\"]([^'\"]+)['\"]", tag)
        if not adr:
            continue
        # Der Name: die letzte Überschrift davor.
        ueb = None
        for u in re.finditer(r"<h[2-4][^>]*>(.*?)</h[2-4]>", html[:m.start()], re.S):
            ueb = u
        if not ueb:
            continue
        # Entitäten auflösen: die Überschrift trägt den Apostroph als
        # `&#39;`, und ein Deck namens "Team Rocket&#39;s Articuno ex"
        # stünde sonst genau so auf dem Reiter.
        import html as _html
        name = _html.unescape(re.sub(r"<[^>]+>", "", ueb.group(1)))
        name = re.sub(r"\s+", " ", name).strip()
        name = re.sub(r"\s*Deck$", "", name).strip()
        if name:
            raus.append((name, adr.group(1).split("?")[0]))
    return raus


# `qr_adresse()` stand hier bis zum 04.09.2026 und wurde von niemandem
# mehr gerufen — `sammle` benutzt `waehle_abschnitt`. Die Abnahme hat sie
# als Falle benannt: ihr Namensvergleich war beidseitig und kannte weder
# die Mehrdeutigkeitsprüfung noch den Anker. Wer sie eines Tages wieder
# in den Lauf genommen hätte, bekäme bei "Team Rocket" das erstbeste
# Deck. Toter Code mit einer LOCKERREN Regel als der lebende ist
# schlimmer als kein Code.


def _knapp(s):
    """Namen vergleichbar machen: Kleinschrift, nur Buchstaben und Ziffern."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


# KEIN numpy. zxing-cpp nimmt ein PIL-Bild unmittelbar entgegen; der
# Umweg über np.array() kostete eine weitere Abhängigkeit — und genau die
# hat am 04.09.2026 den Deploy angehalten: der Testschritt in
# deploy-pages.yml installiert nur pytest, beautifulsoup4, requests und
# lxml, also fiel `import numpy` dort um, während er hier durchlief.
# Nachgemessen: mit PIL-Bild und mit np.array() liest zxing-cpp denselben
# Inhalt.


# DAS 2D-MUSTER IST EIN VERZIERTER QR-CODE
# ----------------------------------------
# BEFUND (04.09.2026, am echten Bild). Game8 liefert 298x300 Graustufen,
# und zxing-cpp liest daraus GAR NICHTS. Angesehen: es ist ein
# QR-Code, aber gestaltet — runde Punkte mit Lücken dazwischen, runde
# Ecken, und in der Mitte ein Booster-Symbol über den Datenfeldern. Das
# Abtastraster sieht zwischen den Punkten Weiß und gibt auf.
#
# Was hilft, ist die Lücken zu schließen: verkleinern oder weichzeichnen,
# dann schwellen. Nachgemessen an einem echten Muster:
#
#     roh              nichts        Verkleinern /4   nichts
#     Verkleinern /3   gelesen       Weichzeichnen 2  nichts
#     MinFilter 3      gelesen       Blur 1,0 + 160   gelesen
#     Blur 1,5 + 160   gelesen       Blur 2,0 + 160   nichts
#
# Kein Weg allein ist verlässlich, also werden mehrere gegangen — und
# das Ergebnis gilt erst, wenn MINDESTENS ZWEI davon dasselbe lesen.
# Ein einzelner Treffer könnte eine Fehldeutung sein, und ein falscher
# Code ist schlimmer als kein Code: der Nutzer scannt und bekommt
# entweder nichts oder ein fremdes Deck.

def _varianten(bild):
    """Dasselbe Muster auf mehreren Wegen lesbar machen."""
    from PIL import Image, ImageFilter
    yield "verkleinert/3", bild.resize(
        (max(1, bild.width // 3), max(1, bild.height // 3)), Image.LANCZOS)
    yield "minfilter/3", bild.filter(ImageFilter.MinFilter(3))
    for radius in (1.0, 1.5):
        yield f"blur{radius}", bild.filter(
            ImageFilter.GaussianBlur(radius)).point(lambda x: 0 if x < 160 else 255)
    yield "roh", bild


def lies_qr(daten, mindestens=2):
    """Den Inhalt eines 2D-Musters auslesen. None, wenn unsicher.

    `mindestens` ist die Zahl der Wege, die dasselbe lesen müssen. Der
    Test setzt sie herunter, um den Einzelfall prüfen zu können.
    """
    import zxingcpp
    from PIL import Image
    bild = Image.open(io.BytesIO(daten)).convert("L")
    zaehler = {}
    for _wie, b in _varianten(bild):
        try:
            treffer = zxingcpp.read_barcodes(b)
        except Exception:  # noqa: BLE001
            continue
        if treffer:
            zaehler[treffer[0].text] = zaehler.get(treffer[0].text, 0) + 1
    if not zaehler:
        return None
    text, wie_oft = max(zaehler.items(), key=lambda kv: kv[1])
    if len(zaehler) > 1:
        # Zwei verschiedene Lesungen desselben Bildes: dann stimmt etwas
        # nicht, und Raten wäre hier das Schlimmste.
        return None
    return text if wie_oft >= mindestens else None


def probe(inhalt, erzeuge=None):
    """Übersteht dieser Inhalt UNSERE eigene Darstellung?

    WAS DIESE PROBE IST — UND WAS SIE NICHT IST
    -------------------------------------------
    Die Abnahme am 04.09.2026 hat zu Recht bemängelt, dass hier zu viel
    behauptet wurde. Nachgemessen:

        probe("voelliger Unsinn 12345") -> True

    Das Bild von Game8 kommt in dieser Funktion NICHT vor. Sie kann
    also grundsätzlich nicht bemerken, dass ein Code falsch ausgelesen
    wurde. Wer sie als Echtheitsprüfung liest, liest sie falsch.

    Was sie wirklich prüft, ist trotzdem nötig: der Reiter rendert den
    Code SELBST, in unserer Größe und in unseren Farben. Diese Probe
    stellt sicher, dass genau das gelingt — erzeugen, wieder auslesen,
    Zeichen für Zeichen vergleichen. Ein Inhalt, der unsere eigene
    Darstellung nicht übersteht (zu lang für die Fehlerklasse, Zeichen
    außerhalb des Vorrats), fliegt hier raus, statt beim Nutzer als
    unlesbares Bild zu landen.

    DIE ECHTHEIT sichert eine andere Stelle: `lies_qr` liest dasselbe
    Game8-Bild auf fünf Wegen und verlangt, dass mindestens zwei
    übereinstimmen; widersprechen sie sich, gilt keiner. DAS ist die
    Prüfung gegen die Quelle, und sie steht dort, nicht hier.

    `erzeuge` gibt es nur für die Prüfung dieser Funktion selbst: der
    Test schiebt eine Erzeugung unter, die absichtlich etwas anderes
    kodiert, und erwartet False. Ohne diesen Griff ließe sich nicht
    belegen, dass die Probe einen Unterschied ÜBERHAUPT bemerkt.
    """
    import segno
    import zxingcpp
    from PIL import Image
    puffer = io.BytesIO()
    (erzeuge or segno.make)(inhalt, error="m").save(
        puffer, kind="png", scale=8, border=4)
    puffer.seek(0)
    treffer = zxingcpp.read_barcodes(Image.open(puffer).convert("L"))
    return bool(treffer) and treffer[0].text == inhalt


# ── Lauf ──────────────────────────────────────────────────────────────

def name_zum_anker(html, anker):
    """Der Deckname, auf den ein `#hm_NNN`-Anker zeigt.

    DIE STELLE, AN DER DAS SCHON EINMAL SCHIEFGING (04.09.2026)
    -----------------------------------------------------------
    Hier stand eine Suche NACH VORN ab der Fundstelle der id:

        m  = re.search(r"id=['\"]<anker>['\"]", html)
        nx = re.search(r"<h[2-4][^>]*>(.*?)</h[2-4]>", html[m.start():])

    Game8 hängt die id an die Überschrift SELBST:

        <h3 class='a-header--3' id='hm_104'>Mega Altaria ex and Greninja Deck</h3>

    `m.start()` steht damit MITTEN im öffnenden `<h3`-Tag — das `<h3`
    liegt davor. Die Suche konnte die eigene Überschrift also nie
    finden und nahm immer die NÄCHSTE. Jeder Anker lieferte den Namen
    des Decks danach.

    Folge in der ausgelieferten Datei: 15 von 24 Tier-Einträgen trugen
    Namen und Code des Nachbardecks. Der Code passte jeweils zum
    angezeigten Namen — ein Nutzer scannte also nicht das falsche Deck —,
    aber die EINSTUFUNG hing am falschen Deck, und Decks, die Game8
    wirklich einstuft, fehlten ganz. Gefunden von der Abnahme, nicht von
    den Tests: der Test schrieb den Versatz sogar als Sollwert fest.

    Deshalb wird jetzt vom Anker aus RÜCKWÄRTS zum öffnenden `<h` des
    eigenen Tags gegangen.
    """
    if not anker:
        return None
    # ZWEITE ABNAHME (04.09.2026): die id wurde als blosser Text im ganzen
    # Dokument gesucht. Getroffen wurde damit auch, was gar keine id ist:
    #
    #   <h3 id='hm_105' data-id='hm_103'>Deck A</h3>   -> "Deck A"
    #   <!-- <h3 id='hm_103'>Alte Fassung</h3> -->     -> "Alte Fassung"
    #   <script>var t="<h3 id='hm_103'>…"</script>     -> "Platzhalter"
    #
    # Deshalb: Kommentare und Skripte erst entfernen, und die id muss im
    # oeffnenden Tag der Ueberschrift selbst stehen — `\sid=` trifft
    # `data-id=` nicht.
    sauber = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    sauber = re.sub(r"<(script|style)\b.*?</\1>", "", sauber, flags=re.S | re.I)
    nx = re.search(
        r"<h([2-4])[^>]*\sid=['\"]" + re.escape(anker) + r"['\"][^>]*>(.*?)</h\1>",
        sauber, re.S)
    if not nx:
        # Die id sitzt nicht an einer Ueberschrift (z. B. an einem div).
        # Dann sagt sie nichts ueber ein Deck, und Raten waere schlimmer
        # als der gemeldete Ausfall.
        return None
    import html as _html
    name = _html.unescape(re.sub(r"<[^>]+>", "", nx.group(2)))
    return re.sub(r"\s*Deck$", "", re.sub(r"\s+", " ", name).strip()).strip()


def waehle_abschnitt(seite, anker, behelfsname):
    """(name, adresse, grund) — welches Muster gehört zu diesem Eintrag?

    Drei Wege, in dieser Reihenfolge, und jeder darf scheitern:

    1. **Der Anker.** `#hm_103` zeigt auf eine Überschrift. Trägt der
       Abschnitt darunter ein Muster, ist die Sache klar.

       Aber nicht jeder Anker zeigt auf ein Deck: gemessen am 04.09.2026
       landeten sieben von 49 auf "… Deck Strategy Guide", "Alternate
       Card Suggestions" oder "Other Mega Altaria ex Decks" — Abschnitte
       der Seite, keine Decks. Dann geht es weiter.

    2. **Der Behelfsname aus der Übersicht.** Er ist bei Apostroph-Decks
       abgeschnitten ("Team Rocket"), taugt also nur, wenn er GENAU EINEN
       Abschnitt trifft. "Team Rocket" passt auf sechs — dann sagt er
       nichts, und ein Treffer auf gut Glück wäre der falsche Code.

    3. **Ohne Anker und mit mehreren Teiltreffern:** das erste Deck der
       Seite, das dieses Pokémon wirklich spielt. Die Set-Tabelle meint
       die Seite als Ganzes; welche Variante, sagt sie nicht — aber sie
       meint sicher keine, in der das Pokémon gar nicht vorkommt.

    4. **Die Seite hat nur ein Muster.** Dann ist es dieses.

    Sonst: kein Code. Ein gemeldeter Ausfall ist wiederherstellbar, ein
    geratener Code führt den Nutzer beim Scannen ins Leere.
    """
    abschnitte = deck_abschnitte(seite)
    if not abschnitte:
        return None, None, "kein 2D-Muster auf der Seite"

    if anker:
        name = name_zum_anker(seite, anker)
        if name:
            k = _knapp(name)
            for n, adr in abschnitte:
                if _knapp(n) == k:
                    return n, adr, None

    if behelfsname:
        k = _knapp(behelfsname)
        genau = [(n, a) for n, a in abschnitte if _knapp(n) == k]
        if len(genau) == 1:
            return genau[0][0], genau[0][1], None
        teil = [(n, a) for n, a in abschnitte if k and k in _knapp(n)]
        if len(teil) == 1:
            return teil[0][0], teil[0][1], None
        if len(teil) > 1 and anker:
            # Mit Anker war ein bestimmtes Deck gemeint. Wenn weder der
            # Anker noch der Name es benennen, ist das ein Befund.
            return None, None, (f"'{behelfsname}' passt auf {len(teil)} Decks "
                                f"dieser Seite — Raten wäre hier der falsche Code")
        if len(teil) > 1:
            # OHNE ANKER und mehrere Treffer: das ERSTE Deck der Seite,
            # DAS DIESES POKEMON WIRKLICH ENTHAELT.
            #
            # BEFUND (dritte Abnahme, 04.09.2026): hier fiel der Eintrag
            # frueher bis ans Ende der Funktion durch und bekam
            # `abschnitte[0]` — das erste Muster der Seite, egal wovon.
            # Gemessen an der Seite vom 04.09.:
            #
            #   562115 "Mega Absol ex" (A+) -> "Hoopa ex and Darkrai ex"
            #   577125 "Teal Mask Ogerpon ex" (A+)
            #                       -> "Magnezone ex and Pom-Pom Oricorio"
            #
            # Die Seite heisst "Best Mega Absol ex Decks" und fuehrt mit
            # einem Hoopa-Deck — die alte Begruendung ("Game8 stellt sein
            # Hauptvorschlag-Deck nach oben") stimmt schlicht nicht.
            #
            # Der Name blieb dabei zwar richtig (er kommt aus demselben
            # Abschnitt wie der Code), aber die STUFE nicht: sie kommt
            # aus der Set-Zeile und blieb am Eintrag haengen. Damit stand
            # Mega Absols A+ neben einem Hoopa-Deck. Und weil dasselbe
            # Muster schon zu 613775 gehoerte, verschwand der Eintrag
            # anschliessend beim Zusammenlegen ganz.
            #
            # Von 15 ankerlosen Eintraegen mit mehreren Teiltreffern lag
            # die alte Regel bei 13 zufaellig richtig und bei 2 falsch.
            # Die neue liegt bei allen 15 auf einem Deck, das das
            # gesuchte Pokemon tatsaechlich spielt.
            return teil[0][0], teil[0][1], None

    if len(abschnitte) == 1:
        return abschnitte[0][0], abschnitte[0][1], None

    # KEIN BEZUG ZWISCHEN NAME UND ABSCHNITT: kein Code.
    #
    # Hier stand fuer ankerlose Eintraege `abschnitte[0]` — das erste
    # Muster der Seite, ohne jeden Bezug zum gesuchten Deck. Ein
    # gemeldeter Ausfall ist wiederherstellbar; eine Stufe neben einem
    # fremden Deck sieht niemand.
    if not anker:
        return None, None, (f"'{behelfsname}' kommt in keinem der "
                            f"{len(abschnitte)} Deck-Abschnitte dieser Seite "
                            f"vor — welches Muster gemeint ist, sagt die "
                            f"Seite nicht")

    return None, None, (f"der Anker {anker} zeigt auf keinen Deck-Abschnitt, "
                        f"und der Name '{behelfsname}' trifft keinen der "
                        f"{len(abschnitte)} Abschnitte eindeutig")


def sammle(tier, set_decks, nur=None, still=False):
    """Je Deck den Scan-Code holen. Gibt (decks, ausfaelle) zurück.

    WAS EIN DECK EINDEUTIG MACHT (Befund 04.09.2026)
    ------------------------------------------------
    Nicht die Archiv-Nummer. Die Seite 597145 trägt vier Decks, und die
    Tier-Liste führt zwei davon getrennt — unter derselben Nummer, aber
    mit verschiedenen Ankern (`#hm_103`, `#hm_104`). Die erste Fassung
    legte die Decks in einem Wörterbuch nach Nummer ab; damit fielen
    Varianten still zusammen und bekamen den Code der jeweils anderen.

    Der Schlüssel ist deshalb (Nummer, Anker). Die Set-Tabelle verlinkt
    ohne Anker — dort ist die Seite als Ganzes gemeint, und es zählt ihr
    erstes Muster.
    """
    alle = {}

    def eintrag(name, stufe, aid, anker, woher):
        schluessel = (aid, anker)
        d = alle.get(schluessel)
        if d is None:
            alle[schluessel] = {"name": name, "tier": stufe, "archiv": aid,
                                "anker": anker, "quelle_liste": woher}
            return
        if d["quelle_liste"] != woher:
            d["quelle_liste"] = "beide"
        if not d.get("tier"):
            d["tier"] = stufe

    for name, stufe, aid, anker in tier:
        eintrag(name, stufe, aid, anker, "tier")
    for name, stufe, aid, anker in set_decks:
        # Ein Set-Deck ohne Anker und ein Tier-Deck mit Anker zeigen auf
        # dieselbe Seite. Zusammengeführt wird später über den Namen, den
        # beide erst von der Deck-Seite bekommen.
        eintrag(name, stufe, aid, anker, "set")

    reihe = list(alle.values())
    if nur is not None:
        # `is not None`: `--nur 0` soll null Decks angehen, nicht alle.
        reihe = reihe[:nur]

    seiten = {}
    fertig, ausfaelle = [], []
    for i, d in enumerate(reihe, 1):
        kennung = d["name"] + (f" [{d['anker']}]" if d.get("anker") else "")
        url = f"{BASIS}/games/Pokemon-TCG-Pocket/archives/{d['archiv']}"
        try:
            if d["archiv"] not in seiten:
                seiten[d["archiv"]] = hole(url)
                time.sleep(PAUSE_S)
            seite = seiten[d["archiv"]]

            echter, adresse, grund = waehle_abschnitt(
                seite, d.get("anker"), d["name"])
            if echter:
                d["name"] = echter
                kennung = echter
            if not adresse:
                ausfaelle.append((kennung, grund))
                continue

            inhalt = lies_qr(hole(adresse, binaer=True))
            time.sleep(PAUSE_S)
            if not inhalt:
                ausfaelle.append((kennung, "2D-Muster nicht sicher lesbar"))
                continue
            if not probe(inhalt):
                ausfaelle.append((kennung, "Gegenprobe fehlgeschlagen — neu "
                                           "erzeugt ergibt einen anderen Inhalt"))
                continue
            d["code"] = inhalt
            fertig.append(d)
            if not still:
                print(f"  [{i}/{len(reihe)}] {d['name'][:44]:46} {len(inhalt):4} Zeichen")
        except Exception as e:  # noqa: BLE001
            ausfaelle.append((kennung, str(e)[:90]))

    # `versucht` ist die Zahl der ANGEGANGENEN Eintraege — vor dem
    # Zusammenlegen. Ohne sie rechnet die Schwelle in main() auf einem
    # Ergebnis, das durch das Zusammenlegen kleiner geworden ist, und ein
    # Lauf mit vielen Verlusten sieht dann gut aus (zweite Abnahme,
    # 04.09.2026).
    zusammen, zusammengelegt = _zusammenfuehren(fertig)
    return zusammen, ausfaelle, len(reihe), zusammengelegt


def _zusammenfuehren(decks):
    """Dasselbe Deck aus beiden Tabellen zu einem Eintrag machen.

    DER SCHLÜSSEL IST DER CODE, NICHT DER NAME
    ------------------------------------------
    Die erste Fassung dieser Funktion legte über den Namen zusammen. Die
    zweite Abnahme (04.09.2026) hat gezeigt, was das anrichtet, und zwar
    an einem Fehler, den erst diese Reparatur eingebaut hatte:

        ("Mega Sceptile ex", "S", Seite 111, hm_101, Code A)
        ("Mega Sceptile ex", "D", Seite 222, hm_103, Code B)
        ->  {"tier": "D", "archiv": "111", "anker": "hm_103", "code": A}

    Stufe und Anker der einen Seite landeten neben Archiv und Code der
    anderen. Der entstehende Verweis `/archives/111#hm_103` zeigt auf
    einen Abschnitt, den es auf Seite 111 nicht gibt — und das zweite
    Deck war spurlos weg.

    Der Scan-Code IST das Deck: er trägt seinen Inhalt. Zwei Einträge mit
    demselben Code sind dasselbe Deck, zwei mit verschiedenem Code sind
    es nicht — egal, wie sie heißen. Damit fällt auch die
    Schreibweisen-Falle weg ("X and Y" gegen "X & Y" wurde vorher nicht
    zusammengelegt, obwohl es dasselbe Deck ist).

    Die Tier-Stufe gewinnt: sie ist die Rangliste. Die Set-Tabelle sagt
    nur, dass das Deck zum aktuellen Set gehört — das wird als
    `quelle_liste: "beide"` festgehalten, nicht als Stufe.
    """
    nach_code = {}
    reihe = []
    zusammengelegt = []
    for d in decks:
        vorhanden = nach_code.get(d["code"])
        if vorhanden is None:
            nach_code[d["code"]] = d
            reihe.append(d)
            continue

        # WAS HIER GERADE VERSCHWINDET, MUSS AUFGESCHRIEBEN WERDEN
        # -------------------------------------------------------
        # BEFUND (dritte Abnahme, 04.09.2026): 47 gelesene Eintraege
        # ergaben 31 Zeilen. Die 16 dazwischen fielen still weg — weder
        # im Protokoll noch in `_meta`, und `_meta` meldete 31 + 2, so
        # dass ein Leser auf 33 statt auf 49 Eintraege schloss.
        #
        # Zwei Faelle, und sie bedeuten Verschiedenes:
        #
        #   "erwartet"  — derselbe Eintrag aus beiden Tabellen. Genau
        #                 dafuer ist diese Funktion da.
        #   "Kollision" — alles andere: zwei Set-Eintraege, zwei
        #                 Tier-Eintraege, oder ein DRITTER Eintrag zu
        #                 einem Paar, das schon zusammengelegt ist.
        #                 Entweder verlinkt Game8 dasselbe Deck mehrfach,
        #                 oder wir haben zweimal dasselbe Muster
        #                 gegriffen. Beides ist ein Befund und gehoert
        #                 ins Protokoll. Gemessen am 04.09.2026: 17
        #                 Zusammenlegungen, davon 6 Kollisionen — alle
        #                 sechs echte Mehrfachverlinkungen bei Game8.
        art = ("erwartet"
               if {vorhanden.get("quelle_liste"), d.get("quelle_liste")}
               == {"tier", "set"}
               else "Kollision")
        zusammengelegt.append({
            "art": art,
            "behalten": vorhanden["name"],
            "aufgegangen_in": f"{vorhanden['archiv']}"
                              + (f"#{vorhanden['anker']}" if vorhanden.get("anker") else ""),
            "verloren": d["name"],
            "verlorene_stelle": f"{d['archiv']}"
                                + (f"#{d['anker']}" if d.get("anker") else ""),
            "verlorene_stufe": d.get("tier"),
        })

        if vorhanden.get("quelle_liste") != d.get("quelle_liste"):
            vorhanden["quelle_liste"] = "beide"
        # Nur der Tier-Eintrag darf Stufe UND Anker setzen, und dann
        # beide zusammen mit seiner Archivnummer — sonst zeigt der
        # Verweis ins Leere.
        if d.get("quelle_liste") == "tier" and vorhanden.get("quelle_liste") != "tier":
            vorhanden["tier"] = d.get("tier") or vorhanden.get("tier")
            vorhanden["anker"] = d.get("anker")
            vorhanden["archiv"] = d.get("archiv")
        elif not vorhanden.get("tier") and art == "erwartet":
            # Eine fremde Stufe darf nur uebernehmen, wer nachweislich
            # dasselbe Deck ist. Bei einer Kollision waere sie geraten.
            vorhanden["tier"] = d.get("tier")
    return reihe, zusammengelegt


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--nur", type=int,
                   help="nur die ersten N Decks (Probelauf; schreibt NICHT)")
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
        for n, st, _i, _ank in tier[:8]:
            print(f"  {st or '?':3} {n}")
        return 0

    fertig, ausfaelle, versucht, zusammengelegt = sammle(tier, set_decks, nur=a.nur)

    for name, grund in ausfaelle:
        print(f"::warning::{name}: {grund}")

    # DIE RECHNUNG MUSS AUFGEHEN, UND ZWAR SICHTBAR
    # ---------------------------------------------
    # angegangen = ausgeliefert + ohne Code + zusammengelegt. Steht das
    # nicht da, liest man aus "31 Decks, 2 ohne" ein Ergebnis von 33 —
    # und uebersieht 16 Eintraege (dritte Abnahme, 04.09.2026).
    kollisionen = [z for z in zusammengelegt if z["art"] == "Kollision"]
    for z in zusammengelegt:
        print(f"  zusammengelegt ({z['art']}): {z['verloren']} "
              f"[{z['verlorene_stelle']}] -> {z['behalten']} "
              f"[{z['aufgegangen_in']}]")
    for z in kollisionen:
        print(f"::warning::{z['verloren']} [{z['verlorene_stelle']}] trägt "
              f"denselben Scan-Code wie {z['behalten']} "
              f"[{z['aufgegangen_in']}] — und das lässt sich nicht als "
              f"Tier-/Set-Paar desselben Decks erklären. Verlinkt Game8 "
              f"dasselbe Deck mehrfach, oder haben wir zweimal dasselbe "
              f"Muster gegriffen?")

    print(f"\n{versucht} Einträge angegangen: {len(fertig)} ausgeliefert, "
          f"{len(ausfaelle)} ohne Code, {len(zusammengelegt)} zusammengelegt "
          f"(davon {len(kollisionen)} Kollisionen)")
    fehlt = versucht - len(fertig) - len(ausfaelle) - len(zusammengelegt)
    if fehlt:
        print(f"::error::{fehlt} Einträge sind auf keinem der drei Wege "
              f"abgeblieben. Die Rechnung geht nicht auf — irgendwo "
              f"verschwindet etwas still.")
        return 1

    if not fertig:
        print("::error::kein einziger Scan-Code gelesen — ein leeres Ergebnis "
              "ist kein Erfolg")
        return 1

    # EIN TEILAUSFALL IST KEIN ERFOLG (Abnahme 04.09.2026)
    # ----------------------------------------------------
    # Vorher brach der Lauf nur bei NULL Codes ab. Nachgestellt: mit
    # einem Netz, das nach vier Abrufen abweist, schrieb er "3 Decks mit
    # geprüftem Scan-Code, 46 ohne", ersetzte die gute Datei durch eine
    # mit drei Einträgen und gab 0 zurück. Der Ablauf hätte das
    # committet.
    #
    # Die Schwelle liegt bei zwei Dritteln: darunter ist etwas
    # grundsätzlich passiert (Bot-Schutz, Umbau der Seite), und die
    # vorhandene Datei ist mehr wert als eine frische Lücke.
    # Gerechnet wird auf den ANGEGANGENEN Eintraegen, nicht auf dem
    # zusammengelegten Ergebnis: sonst schrumpft der Nenner mit jedem
    # Zusammenlegen und ein Lauf mit vielen Verlusten meldet eine hohe
    # Quote (zweite Abnahme, 04.09.2026 — 44 verlorene Decks als "80 %").
    geschafft = versucht - len(ausfaelle)
    anteil = geschafft / max(1, versucht)
    if anteil < 0.66:
        print(f"::error::nur {geschafft} von {versucht} angegangenen Decks "
              f"({anteil:.0%}) haben einen Code — das ist kein Lauf, das ist "
              f"ein Ausfall. Die vorhandene Datei bleibt stehen.")
        return 1

    # Und eine zweite Bremse: viele Decks, die alle denselben Code
    # tragen, sind kein Ergebnis, sondern ein kaputter Leser.
    if versucht >= 10 and len(fertig) < versucht * 0.3:
        print(f"::error::{versucht} Decks angegangen, aber nur {len(fertig)} "
              f"verschiedene Scan-Codes dabei. So viele echte Doppelungen gibt "
              f"es nicht — vermutlich liest der Musterleser Unsinn.")
        return 1

    if a.nur is not None:
        # Ein Probelauf darf die Produktionsdatei nicht ersetzen. Vorher
        # tat er das: wer im Actions-Dialog "nur 3" setzte und die
        # Trocken-Box übersah, kürzte die Tier-Liste auf drei Decks.
        #
        # `is not None` und nicht `if a.nur`: mit `--nur 0` war die
        # Bedingung falsch, der Lauf ging ueber ALLE Decks und schrieb
        # anschliessend (dritte Abnahme, 04.09.2026). Wer 0 eintippt,
        # meint das Gegenteil von "alles schreiben".
        print(f"Probelauf über {a.nur} Decks — es wird nichts geschrieben.")
        return 0

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
                            "2D-Musters, nicht Game8s Bild. Gelesen wurde jedes "
                            "Muster auf fünf Wegen; übernommen nur, wenn "
                            "mindestens zwei denselben Inhalt ergaben und "
                            "keiner widersprach. Danach wurde geprüft, dass der "
                            "Inhalt unsere eigene Darstellung übersteht — neu "
                            "erzeugt und wieder ausgelesen ergibt denselben "
                            "Inhalt. Das Zweite sagt nichts über die Echtheit, "
                            "nur über die Darstellbarkeit; die Echtheit sichert "
                            "das Erste.",
            "abgerufen": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "anzahl": len(fertig),
            # DIE HERKUNFT DER ZAHL, NICHT NUR DIE ZAHL
            # ----------------------------------------
            # `anzahl` allein laesst sich nicht pruefen. Wer 31 Zeilen
            # sieht und daneben "2 ohne Code" liest, schliesst auf 33
            # Eintraege — auf der Seite standen 52 (dritte Abnahme,
            # 04.09.2026). Diese vier Zahlen gehen auf:
            #     angegangen = anzahl + ohne_code + zusammengelegt
            "uebersicht": {
                "tier_tabelle": len(tier),
                "set_tabelle": len(set_decks),
                "angegangen": versucht,
            },
            "ohne_code": [{"name": n, "grund": g} for n, g in ausfaelle],
            "zusammengelegt": zusammengelegt,
        },
        "decks": fertig,
    }
    if a.trocken:
        print(json.dumps(aus["_meta"], ensure_ascii=False, indent=2))
        return 0
    os.makedirs(DATEN, exist_ok=True)
    # Erst daneben schreiben, dann umbenennen. `open(..., "w")` kürzt die
    # vorhandene Datei, BEVOR geschrieben wird — ein Abbruch mitten im
    # Schreiben (der Ablauf hat ein 20-Minuten-Limit) hinterließe
    # unvollständiges JSON, und der Commit-Schritt committet es.
    vorlaeufig = AUSGABE + ".tmp"
    with open(vorlaeufig, "w", encoding="utf-8") as f:
        json.dump(aus, f, ensure_ascii=False, indent=1)
    os.replace(vorlaeufig, AUSGABE)
    print(f"geschrieben: {os.path.relpath(AUSGABE, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
