"""Dokumentleichen: Saetze, die ueber den Code etwas behaupten, was nicht mehr stimmt.

WARUM DIESE DATEI EXISTIERT (12.09.2026)

Vier Fundstellen an einem Tag, alle derselben Bauart: ein Dokument
beschreibt einen Zustand des Codes, der Code hat sich geaendert, das
Dokument nicht. Das ist teurer als eine fehlende Doku — eine fehlende
liest niemand, eine falsche glaubt man.

  1. docs/UMBAU-HANDBUCH.md sagte, der Heartbeat sei "als
     `TODO(heartbeat)` im Code vermerkt — bewusst nicht in diesem Paket".
     Tatsaechlich stehen HEARTBEAT_DATEI und check_heartbeat() seit dem
     04./06.09.2026 in scripts/data_guardian.py und laufen im Hauptlauf.
  2. docs/sessions/00-project-state.md wird als Wiedereinstiegsanker
     gefuehrt ("read this file first"), ist aber vom 15./16.06.2026 und
     fuehrt Erledigtes als offen sowie einen toten Zweig.
  3. docs/online-datenbasis-ausbau.md sagte "vorerst keinen Zeitplan",
     waehrend .github/workflows/limitless-api-scrape.yml seit dem
     08.09.2026 (Commit 44647bbf) `cron: '40 3 * * *'` traegt.
  4. js/app-deck-builder.js verwies auf "commit 9XXXXXX" — einen
     Platzhalter, der nie ersetzt wurde.

WAS DIESE DATEI HAELT

Nicht den Wortlaut der Dokumente, sondern den WIDERSPRUCH: sie prueft
jeweils den Code UND das Dokument und faellt, wenn beide wieder
auseinanderlaufen. Ein Test, der nur einen Satz abzaehlt, wuerde beim
naechsten Umformulieren rot und beim naechsten Codewandel gruen bleiben —
also genau falsch herum.
"""

import os
import re

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _lies(*teile):
    with open(os.path.join(WURZEL, *teile), encoding="utf-8") as f:
        return f.read()


# ─────────────────────────────────────────────────────────────────────
# 1. Der Heartbeat ist gebaut — also darf ihn kein Dokument als TODO fuehren
# ─────────────────────────────────────────────────────────────────────

def test_kein_dokument_nennt_den_heartbeat_eine_offene_aufgabe():
    waechter = _lies("scripts", "data_guardian.py")
    gebaut = ("HEARTBEAT_DATEI" in waechter
              and "def check_heartbeat(" in waechter
              and re.search(r"^\s*check_heartbeat\(findings\)", waechter, re.M))
    assert gebaut, (
        "Vorpruefung: der Heartbeat ist nicht mehr im Waechter. Dann ist "
        "dieser Test gegenstandslos und die Dokumente duerfen ihn wieder "
        "als offene Aufgabe fuehren.")

    handbuch = _lies("docs", "UMBAU-HANDBUCH.md")
    # `TODO(heartbeat)` darf nur noch ZITIERT werden — in einem
    # Blockzitat der Richtigstellung. Steht es als glatte Aussage im
    # Fliesstext, behauptet das Handbuch wieder eine offene Aufgabe.
    behauptend = [z for z in handbuch.splitlines()
                  if "TODO(heartbeat)" in z and not z.lstrip().startswith(">")]
    assert behauptend == [], (
        "docs/UMBAU-HANDBUCH.md fuehrt den Heartbeat wieder als "
        f"`TODO(heartbeat)`, obwohl check_heartbeat() im Hauptlauf laeuft: "
        f"{behauptend}")
    # Die Richtigstellung muss dastehen, sonst ist der Satz nur geloescht
    # und der naechste Leser weiss nicht, dass es ihn gab.
    assert re.search(r"Richtiggestellt 12\.09\.2026", handbuch), (
        "die Richtigstellung zum Heartbeat fehlt in docs/UMBAU-HANDBUCH.md")
    assert "check_heartbeat()" in handbuch, (
        "das Handbuch nennt die Funktion nicht, die die Aufgabe erledigt hat")


# ─────────────────────────────────────────────────────────────────────
# 2. Der Wiedereinstiegsanker sagt, wie alt er ist
# ─────────────────────────────────────────────────────────────────────

ANKER = ("docs", "sessions", "00-project-state.md")


def test_der_wiedereinstiegsanker_traegt_einen_stand_vermerk():
    """"read this file first" ohne Altersangabe ist eine Falle: der Leser
    haelt eine Momentaufnahme vom Juni fuer den heutigen Zustand."""
    text = _lies(*ANKER)
    assert re.search(r"read this file first", text, re.I), (
        "Vorpruefung: das Dokument gibt sich nicht mehr als Anker aus — "
        "dann braucht es diesen Vermerk nicht")
    kopf = text[:2500]
    assert "STAND-VERMERK" in kopf, (
        "der Stand-Vermerk steht nicht am Anfang von "
        "docs/sessions/00-project-state.md — weiter unten liest ihn "
        "niemand, der oben schon angefangen hat zu glauben")
    assert re.search(r"12\.09\.2026", kopf), "der Vermerk nennt kein Pruefdatum"
    assert "CLAUDE.md" in kopf, (
        "der Vermerk muss sagen, wo die heute gepflegten Hausregeln stehen")


def test_der_anker_erklaert_den_toten_zweig():
    """Der als "Active dev branch" gefuehrte Zweig ist nicht in main und
    seit Juli tot. Wer ihn auscheckt, arbeitet an einem Seitenarm."""
    text = _lies(*ANKER)
    if "claude/dipidis-project-overview-cf6b95" not in text:
        return  # Zweig nicht mehr erwaehnt — nichts zu halten
    stelle = text.index("claude/dipidis-project-overview-cf6b95")
    umfeld = text[stelle:stelle + 900]
    assert "toter Zweig" in umfeld, (
        "der Zweig steht wieder unkommentiert als aktiver Arbeitszweig da")


# ─────────────────────────────────────────────────────────────────────
# 3. "Kein Zeitplan" gegen den cron im Ablauf
# ─────────────────────────────────────────────────────────────────────

def test_kein_dokument_leugnet_den_zeitplan_des_api_laufs():
    ablauf_pfad = os.path.join(WURZEL, ".github", "workflows",
                               "limitless-api-scrape.yml")
    if not os.path.exists(ablauf_pfad):
        return
    with open(ablauf_pfad, encoding="utf-8") as f:
        ablauf = f.read()
    cron = re.search(r"^\s*-\s*cron:\s*'([^']+)'", ablauf, re.M)
    dok = _lies("docs", "online-datenbasis-ausbau.md")
    if not cron:
        return  # kein Zeitplan — dann darf das Dokument das sagen
    # Es gibt einen cron. Der Satz "vorerst keinen Zeitplan" darf dann
    # nicht mehr als geltende Aussage dastehen.
    for treffer in re.finditer(r"keinen Zeitplan", dok):
        zeile_anfang = dok.rfind("\n", 0, treffer.start()) + 1
        absatz = dok[max(0, treffer.start() - 400):treffer.end() + 400]
        gestrichen = "~~" in dok[zeile_anfang - 300:treffer.end() + 300]
        assert gestrichen and "Richtiggestellt" in absatz, (
            "docs/online-datenbasis-ausbau.md sagt 'vorerst keinen "
            f"Zeitplan', aber der Ablauf traegt cron '{cron.group(1)}' — "
            "der Satz muss als ueberholt gekennzeichnet sein")
    assert cron.group(1) in dok, (
        f"der tatsaechliche Zeitplan '{cron.group(1)}' steht nicht im "
        "Dokument — dann weiss der Leser nur, dass der alte Satz falsch "
        "war, aber nicht, was stattdessen gilt")


# ─────────────────────────────────────────────────────────────────────
# 4. Keine Platzhalter-Hashes
# ─────────────────────────────────────────────────────────────────────

def test_kein_platzhalter_statt_eines_commits():
    """`commit 9XXXXXX` ist schlimmer als gar kein Verweis: es sieht aus
    wie eine Quelle und ist keine."""
    fund = []
    for ordner in ("js", "scripts", "backend", "docs"):
        wurzel = os.path.join(WURZEL, ordner)
        for pfad, _, dateien in os.walk(wurzel):
            if "node_modules" in pfad:
                continue
            for d in dateien:
                if not d.endswith((".js", ".py", ".md")):
                    continue
                voll = os.path.join(pfad, d)
                try:
                    with open(voll, encoding="utf-8") as f:
                        inhalt = f.read()
                except (OSError, UnicodeDecodeError):
                    continue
                # Nur Platzhalter, die sich als COMMIT ausgeben. Ein
                # `/XXXX/standings` in einem URL-Muster ist eine
                # Schablone und kein falscher Beleg — das erste Netz
                # fing am 12.09.2026 genau diese drei harmlosen Stellen.
                # `[\s/*#>]` statt nur `\s`: der Verweis steht in aller
                # Regel in einem mehrzeiligen Kommentar, das Wort
                # "commit" am Zeilenende und der Platzhalter hinter dem
                # `//` der naechsten Zeile. Ein reines `\s+` hat genau
                # deshalb den echten Fund vom 12.09.2026 NICHT gesehen —
                # aufgefallen bei der Verfaelschungsprobe.
                for m in re.finditer(
                        r"(?i)\bcommit[\s/*#>]{1,16}([0-9a-f]*X{3,}[0-9a-f]*)\b",
                        inhalt):
                    fund.append(f"{os.path.relpath(voll, WURZEL)}: {m.group(0)}")
    assert fund == [], (
        "Platzhalter statt eines echten Commit-Hashes: " + ", ".join(fund))
