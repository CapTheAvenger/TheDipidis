#!/usr/bin/env python3
"""Dateien ueber GitHubs 100-MiB-Grenze vor dem Commit zuruecksetzen — laut.

BEFUND (Wochenlauf #196, 03.11.2026, Lauf 41703978231): das Tor war gruen,
der Push scheiterte dreimal am pre-receive-Hook von GitHub:

    remote: error: File data/tournament_decklists_per_player.csv is
    106.51 MB; this exceeds GitHub's file size limit of 100.00 MB

Mit Puebla (9.512 Zeilen) und Danzig (8.221) war die Decklistendatei ueber
die Grenze gewachsen (auf main 104.351.587 Byte, frisch 111.180.554).
Der Ablauf las die Ablehnung als "origin/main churns too fast", versuchte
es dreimal (je ein Tor nach dem Rebase, 39 Minuten) und verwarf dann den
ganzen Wochenstand — auch die Labs-Dateien, die gar nichts damit zu tun
hatten.

Dieses Skript laeuft VOR dem Tor: jede Datei unter data/, die groesser ist
als die Grenze, geht auf den Stand von main zurueck (eine neue Datei wird
entfernt) und wird als ::error:: benannt — der Lauf bleibt gruen, der Rest
wird gepusht, und der Data Guardian sieht die alte Datei (Frischepruefung).
Das ist Bestandsschutz, keine Loesung: die Loesung ist der Auszug je
Format wie bei den Labs-Dateien (offen.md, SC-45).

Lauf: python3 scripts/github_dateigrenze.py [ordner]   (Vorgabe: data)
Umgebung: GITHUB_DATEIGRENZE_BYTES ueberschreibt die Grenze (fuer Proben).
"""
import os
import subprocess
import sys

GRENZE = 100 * 1024 * 1024  # 100 MiB, GitHubs Grenze je Datei


def grenze() -> int:
    roh = os.environ.get("GITHUB_DATEIGRENZE_BYTES")
    return int(roh) if roh else GRENZE


def zu_grosse_dateien(ordner: str, limit: int):
    aus = []
    for wurzel, _dirs, namen in os.walk(ordner):
        for n in sorted(namen):
            p = os.path.join(wurzel, n)
            try:
                groesse = os.path.getsize(p)
            except OSError:
                continue
            if groesse > limit:
                aus.append((p, groesse))
    return aus


def ist_verfolgt(pfad: str) -> bool:
    r = subprocess.run(["git", "ls-files", "--error-unmatch", pfad],
                       capture_output=True, text=True)
    return r.returncode == 0


def zuruecksetzen(pfad: str) -> str:
    """Stand von HEAD wiederherstellen; eine neue Datei wird entfernt."""
    if ist_verfolgt(pfad):
        subprocess.run(["git", "checkout", "--", pfad], check=True)
        return "auf HEAD zurueckgesetzt"
    os.remove(pfad)
    return "entfernt (nicht verfolgt)"


def main(argv) -> int:
    ordner = argv[1] if len(argv) > 1 else "data"
    limit = grenze()
    treffer = zu_grosse_dateien(ordner, limit)
    if not treffer:
        print("github_dateigrenze: keine Datei ueber %d Byte unter %s" % (limit, ordner))
        return 0
    for pfad, groesse in treffer:
        was = zuruecksetzen(pfad)
        print("::error::github_dateigrenze: %s ist %.2f MiB (Grenze %.2f MiB) — %s; "
              "der Rest des Laufs wird gepusht, diese Datei bleibt auf dem alten Stand "
              "(SC-45: Auszug je Format bauen)"
              % (pfad, groesse / 2**20, limit / 2**20, was), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
