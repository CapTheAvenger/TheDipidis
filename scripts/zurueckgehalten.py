#!/usr/bin/env python3
"""Welche Daten haelt das Tor seit mehr als einem Lauf zurueck? (SC-37)

ANLASS (17.10.2026, Notfall Champions Replica #161). Vom 13. bis 17.10.
liefen acht Champions-Laeufe GRUEN durch und rollten dabei die ganze
Champions-Familie zurueck (`Tor: data/... bleibt auf dem alten Stand`).
Der Lauf war gruen, also kam keine Mail; die Seite zeigte drei Tage lang
den Stand vom 14.10. Rot wurde es erst am dritten Tag, ueber einen Umweg
(Frischepruefung) und mit irrefuehrender Meldung.

Ein einzelnes Zurueckrollen ist Bestandsschutz und genau richtig: die
Quelle hat sich bewegt, main behaelt den guten Stand, der Lauf bleibt
gruen. ZWEIMAL IN FOLGE dieselbe Datei heisst aber: die Ursache liegt
nicht im Zufall eines Tages, und die Daten stehen still. Das muss jemand
erfahren — ohne dass der Lauf rot wird.

Dieses Skript liest die letzten Laeufe jedes Ablaufs auf main ueber die
GitHub-API (Annotationen des Tors) und meldet jede Datei, die der juengste
UND der vorherige abgeschlossene Lauf zurueckgehalten haben. Der Data
Guardian schreibt die Zeilen als CRITICAL in sein rollendes Issue und
kommentiert, wenn eine neue dazukommt (eine Issue-Aenderung allein
verschickt keine Mail).

Aufruf:  python3 scripts/zurueckgehalten.py [--laeufe 4] > befunde.md
Rueckgabewert 0 immer; die Zahl der Befunde steht in der letzten Zeile
`anzahl=<n>` auf stderr und als GITHUB_OUTPUT `anzahl`.
"""
import json
import os
import re
import subprocess
import sys
from urllib.parse import quote

REPO = os.environ.get("GITHUB_REPOSITORY", "CapTheAvenger/TheDipidis")

# Wortlaut aus scripts/tor_vor_dem_push.sh — beide Seiten haelt
# tests/python/test_zurueckgehalten.py zusammen.
GEHALTEN = re.compile(r"^Tor: (\S+) bleibt auf dem alten Stand")
# Die Sammelzeile kommt vor allen anderen Warnungen des Schritts — GitHub nimmt
# hoechstens 10 je Schritt an, Einzelzeilen koennen wegfallen (Replica #160).
SAMMEL = re.compile(r"^Tor hielt zurueck: (.*?) \| Bilder: \d+$")
ERSTLAUF = re.compile(r"^Tor, erster Durchlauf: (.+)$")


def ablaeufe_mit_tor(ordner=".github/workflows"):
    """Jeder Ablauf, der das Tor faehrt UND nach main schiebt — aus den Dateien,
    nicht aus einer Liste. Dieselbe Bedingung wie tor_rollback.ausgabeordner():
    die Setwechsel-Probe rollt im Wegwerf-Baum zurueck und pusht nie."""
    raus = []
    for name in sorted(os.listdir(ordner)):
        if name.endswith((".yml", ".yaml")):
            with open(os.path.join(ordner, name), encoding="utf-8") as f:
                text = f.read()
            if "tor_vor_dem_push.sh" in text and re.search(
                    r"git push|push_nach_rebase\.sh|daten_pushen\.sh", text):
                raus.append(name)
    return raus


def gehalten_aus(annotationen):
    """Dateinamen aus den Annotationstexten eines Laufs (Sammelzeile + Einzelzeilen)."""
    raus = []
    for text in annotationen:
        text = (text or "").strip()
        m = SAMMEL.match(text)
        if m:
            raus += [w for w in m.group(1).split() if w.startswith("data/") and not w.endswith("/")]
        m = GEHALTEN.match(text)
        if m:
            raus.append(m.group(1))
    return sorted(set(raus))


def befunde(laeufe, zuletzt_geliefert=None):
    """laeufe: {ablauf: [lauf, ...]} je Ablauf NEUESTER zuerst, nur abgeschlossene
    Laeufe auf main. lauf = {"id", "nummer", "zeit", "url", "gehalten": [dateien],
    "erstlauf": [zeilen]}.

    Ein Befund ist eine Datei, die im juengsten Lauf UND im Lauf davor
    zurueckgehalten wurde. Gezaehlt wird die ununterbrochene Serie ab dem
    juengsten Lauf; `seit` ist die Zeit des aeltesten Laufs der Serie.

    zuletzt_geliefert: {datei: Zeit des letzten Commits auf main, der sie
    beruehrt}. Hat ein ANDERER Ablauf die Datei nach dem juengsten
    zurueckhaltenden Lauf geliefert, steht sie nicht mehr still — kein
    Befund (17.10.: Usage #125 hielt zurueck, Replica #162 lieferte danach).
    """
    zuletzt_geliefert = zuletzt_geliefert or {}
    raus = []
    for ablauf, liste in sorted(laeufe.items()):
        if len(liste) < 2:
            continue
        for datei in sorted(set(liste[0].get("gehalten") or [])):
            serie = 0
            for lauf in liste:
                if datei in (lauf.get("gehalten") or []):
                    serie += 1
                else:
                    break
            if serie < 2:
                continue
            geliefert = zuletzt_geliefert.get(datei) or ""
            if geliefert and geliefert > (liste[0].get("zeit") or ""):
                continue
            raus.append({
                "ablauf": ablauf, "datei": datei, "serie": serie,
                "seit": liste[serie - 1].get("zeit"),
                "voll": serie == len(liste),
                "lauf": liste[0].get("url"), "nummer": liste[0].get("nummer"),
                "ursache": (liste[0].get("erstlauf") or [])[:3],
            })
    return raus


def als_markdown(funde):
    zeilen = []
    for f in funde:
        mehr = "+" if f["voll"] else ""
        ursache = "; ".join(f["ursache"]) or "keine Zusicherung benannt"
        zeilen.append(
            f"- **CRITICAL** `{f['ablauf']}`: `{f['datei']}` wird seit "
            f"{f['seit']} zurueckgehalten ({f['serie']}{mehr} Laeufe in Folge, "
            f"Lauf gruen, Daten still) — erster Durchlauf rot: {ursache} — "
            f"[Lauf #{f['nummer']}]({f['lauf']})")
    return "\n".join(zeilen)


def _gh(pfad):
    r = subprocess.run(["gh", "api", pfad], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"gh api {pfad}: {r.stderr.strip()[:200]}")
    return json.loads(r.stdout)


def hole(ablaeufe, anzahl):
    laeufe = {}
    for ablauf in ablaeufe:
        daten = _gh(f"repos/{REPO}/actions/workflows/{ablauf}/runs"
                    f"?branch=main&status=completed&per_page={anzahl}")
        liste = []
        for lauf in daten.get("workflow_runs", []):
            # Abgebrochene/uebersprungene Laeufe haben keine Tor-Annotation und
            # wuerden eine Serie still unterbrechen.
            if lauf.get("conclusion") not in ("success", "failure"):
                continue
            texte = []
            for job in _gh(f"repos/{REPO}/actions/runs/{lauf['id']}/jobs").get("jobs", []):
                texte += [(a.get("message") or "") for a in
                          _gh(f"repos/{REPO}/check-runs/{job['id']}/annotations?per_page=100")]
            gehalten = gehalten_aus(texte)
            erst = [m.group(1)[:160] for m in (ERSTLAUF.match(t.strip()) for t in texte) if m]
            liste.append({"id": lauf["id"], "nummer": lauf.get("run_number"),
                          "zeit": (lauf.get("run_started_at") or lauf.get("created_at") or "")[:16],
                          "url": lauf.get("html_url"), "gehalten": gehalten, "erstlauf": erst})
        laeufe[ablauf] = liste
    return laeufe


def geliefert(dateien):
    raus = {}
    for d in sorted(set(dateien)):
        c = _gh(f"repos/{REPO}/commits?sha=main&path={quote(d)}&per_page=1")
        if c:
            raus[d] = (c[0].get("commit", {}).get("committer", {}).get("date") or "")[:16]
    return raus


def main(argv):
    anzahl = 4
    if "--laeufe" in argv:
        anzahl = int(argv[argv.index("--laeufe") + 1])
    try:
        laeufe = hole(ablaeufe_mit_tor(), anzahl)
        kandidat = [d for l in laeufe.values() if l for d in (l[0].get("gehalten") or [])]
        funde = befunde(laeufe, geliefert(kandidat))
    except Exception as e:  # noqa: BLE001
        # Nicht schweigen: ein Ausfall der Pruefung ist selbst ein Befund.
        print(f"- **CRITICAL** Zurueckhalte-Pruefung ausgefallen: {e}")
        funde = [None]
    else:
        text = als_markdown(funde)
        if text:
            print(text)
    for f in funde:
        if f:
            print(f"::error title=Daten still::{f['ablauf']}: {f['datei']} seit {f['seit']} "
                  f"zurueckgehalten ({f['serie']} Laeufe in Folge)", file=sys.stderr)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as fh:
            fh.write(f"anzahl={len(funde)}\n")
    print(f"anzahl={len(funde)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
