# Inhalt dieses Pakets

| Datei | Wofür |
|---|---|
| **`00-MERGE.md`** | **Hier anfangen.** Wie die sieben Commits sicher hineinkommen — als Skript oder als Auftrag an Claude Code. |
| **`UMBAU-HANDBUCH.md`** | Das vollständige Handbuch für Claude Code: Projekt, Regeln, Befunde, was schon erledigt ist, was als Nächstes kommt. |
| `merge.sh` | Prüft alles vorher, wendet an, verdrahtet `index.html`, testet, pusht nichts. |
| `apply_index.py` | Setzt die vier `index.html`-Zeilen. Wird von `merge.sh` aufgerufen — **muss mit hochgeladen werden**, wenn Claude Code es fahren soll. |
| `0001…0009-*.patch` | Die neun Commits. **Keiner fasst `index.html` an** — deshalb passen sie auf jeden `main`, egal wie oft die Datenjobs stempeln. |
| `redesign.bundle` | Dieselben Commits als fertiger Branch, falls `git am` nicht gewollt ist. |
| `prototyp-informationsarchitektur.html` | Die neue Navigation und Startseite, echte Daten, Desktop/Mobil/Dunkelmodus umschaltbar. |
| `prototyp-sharekarten.html` | Die drei Share-Bausteine nach poke_hive-Vorlage. |
| `screenshots/` | Vorher/Nachher aus dem gemergten Klon. |

## Dringend

`main` ist rot und die Seite deployt seit 21 Stunden nicht. Commit 1 behebt das und steht
an erster Stelle — Details oben in `00-MERGE.md`.

## In einem Satz

`bash merge.sh` im TheDipidis-Ordner, dann pushen — oder `00-MERGE.md` Weg B an Claude Code
geben. Für alles, was danach kommt, bekommt Claude Code das `UMBAU-HANDBUCH.md`.
