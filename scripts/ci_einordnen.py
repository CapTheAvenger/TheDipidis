"""Entscheidet im `test`-Job von deploy-pages.yml, ob rote Zusicherungen sperren.

SC-50 (09.11.2026), Befund B2 des Pruefagenten: seit der festen Sperrliste
schieben die Datenlaeufe Daten nach main, auch wenn eine nicht sperrende
Zusicherung rot ist (Tor-Befund). Fuhr der Deploy-Test die Suiten weiter
hart, hielte JEDER Befund auf main den Deploy an — und jeden PR, weil die
Tests die echten Daten lesen. Das waere schlimmer als vorher: frueher hielt
nur eine Datenfamilie an, dann die ganze Seite.

Zwei Regeln, je nach Ausloeser:

  push / workflow_dispatch (main): DIESELBE Regel wie das Tor
      (scripts/tor_sperrliste.py) — was ein Datenlauf als Befund
      durchgelassen hat, haelt den Deploy nicht an; was auf der Sperrliste
      steht oder sich nicht zuordnen laesst, schon.

  pull_request / code: ALTBEFUND-Regel — eine rote Zusicherung sperrt, ausser sie
      ist auf main GENAUSO rot (dort schon ein Befund, nicht vom PR
      verursacht). Gegengeprueft wird nur, was im PR rot ist, in einem
      Arbeitsbaum von main. Ein Code-PR, der eine Zusicherung bricht, wird
      also weiter rot — unabhaengig von der Sperrliste.
      "code" setzt der Ablauf fuer einen Push auf main, der mehr als data/
      und images/ aendert (Patch-Weg, Web-Editor; Pruefagent S-B): Basis ist
      dann der Vorgaenger-Commit. Nur Datenlaeufe bekommen die Sperrliste.

  Ein Absturz im Basis-Baum ist KEIN Altbefund (Pruefagent S-A): als "auf
  main rot" zaehlt nur, was dort mit Ergebnis rot endet.

Aufruf:  python3 scripts/ci_einordnen.py <protokollordner> <ereignis> [<basis-baum>]
Rueckgabewert 0: Deploy/PR darf weiter. 1: sperrt.
"""
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tor_sperrliste as TS  # noqa: E402


def rot_auf_basis(basis: str, py: list, js: list) -> set:
    """Welche der Zusicherungen sind im Baum `basis` ebenfalls rot — MIT
    Ergebnis? Stirbt der Lauf dort (Abbruch, OOM, fehlendes Modul), zaehlt
    nichts als Altbefund; dann sperrt die Zusicherung (S-A, 09.11.2026)."""
    rot = set()
    umgebung = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=4096"}
    if py:
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider",
                            "--tb=no", *py], cwd=basis, capture_output=True, text=True)
        # 0/1 = gelaufen; 2-5 und Signale = kein verwertbares Ergebnis.
        # Gibt es eine Zusicherung auf main gar nicht, endet pytest mit 4: NEU.
        if r.returncode in (0, 1):
            rot |= set(re.findall(r"^FAILED (\S+?::.+?)(?: - .*)?$", r.stdout, re.M))
    for datei in js:
        if not os.path.exists(os.path.join(basis, datei)):
            continue
        r = subprocess.run(["node", "--test", datei], cwd=basis, capture_output=True,
                           text=True, env=umgebung)
        bestanden = re.search(r"^# pass \d+", r.stdout, re.M)
        m = re.search(r"^# fail (\d+)", r.stdout, re.M)
        # node meldet einen gestorbenen Prozess als "not ok <datei>" mit
        # "exitCode: N" — das ist kein Testergebnis.
        gestorben = re.search(r"^\s+exitCode: \d+", r.stdout, re.M)
        if bestanden and m and int(m.group(1)) > 0 and not gestorben:
            rot.add(datei)
    return rot


def entscheide(ordner: str, ereignis: str, basis: str = "") -> int:
    sperrend, befunde, unlesbar = TS.einordnen(ordner)
    for z in unlesbar:
        print(f"::error::nicht zuordenbar: {z}")
    if unlesbar:
        return 1
    alle = sperrend + befunde
    if not alle:
        print("alle Suiten gruen")
        return 0
    if ereignis in ("pull_request", "code"):
        if not basis:
            print("::error::ohne Basis-Baum — jede rote Zusicherung sperrt")
            return 1
        py = [z for z in alle if "::" in z]
        js = [z for z in alle if "::" not in z]
        alt = rot_auf_basis(basis, py, js)
        neu = [z for z in alle if z not in alt]
        for z in sorted(alt):
            print(f"::warning::Altbefund (in der Basis ebenso rot, sperrt nicht): {z}")
        for z in neu:
            print(f"::error::neu rot (in der Basis gruen oder ohne Ergebnis): {z}")
        return 1 if neu else 0
    for z in sperrend:
        print(f"::error::sperrend: {z} — {TS.SPERRLISTE[TS.datei_von(z)]}")
    for z in befunde:
        print(f"::warning::Tor-Befund auf main (nicht sperrend): {z}")
    return 1 if sperrend else 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Aufruf: ci_einordnen.py <protokolle> <ereignis> [<basis>]", file=sys.stderr)
        sys.exit(2)
    sys.exit(entscheide(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ""))
