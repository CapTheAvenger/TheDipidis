# redesign/

Der Umbau von thedipidis.app, Etappe für Etappe. Was hier liegt, ist
**Arbeitsmaterial**, kein Teil der Seite: `thedipidis.app/redesign/`
gibt 404, der Pages-Build nimmt den Ordner nicht mit.

```
redesign/
├── README.md              diese Datei
├── erledigt/              was auf main ist
│   └── etappe-0-2/        Pipeline, Navigation, Zahlen (PR #452)
├── offen/                 was noch nicht auf main ist
│   └── block3/            teilbare Bilder, Deckansicht, Platzierung
└── prototypen/            Klickmuster zum Anschauen im Browser
```

Die vollständige Anleitung liegt **nicht** hier, sondern als
[`docs/UMBAU-HANDBUCH.md`](../docs/UMBAU-HANDBUCH.md) — dort findet sie
Claude Code, ohne dass man den Pfad nennen muss.

## Stand

| Etappe | Was | Stand |
|--------|-----|-------|
| 0 | Datenpipeline: Guardian, tote Jobs, Deploy-Stau | **live** seit 18.08. |
| 1 | Sichtbare Hauptnavigation, Datenraum-Ausweis | **live** seit 18.08. |
| 2 | Eine Herleitung je Größe, `n` an jeder Rangliste | **live** seit 18.08. |
| 3 | Teilbare Bilder, Deckansicht, Platzierung | **offen** — `offen/block3/` |
| 4 | Designsystem über die 16 Ansichten, Aufräumen, Zusammenlegungen | **offen** — noch nicht gebaut |

Live heißt: auf `main` **und** deployt. Nachprüfbar an
`thedipidis.app/version.json` — Code auf `main` ist nicht dasselbe wie
Code auf der Seite.

## Wie ein Block angewendet wird

Jeder Ordner unter `offen/` enthält Patches in Reihenfolge, ein
Merge-Skript und eine Beschreibung. Zum Beispiel:

```bash
bash redesign/offen/block3/merge-block3.sh .
```

Das Skript legt einen Zweig an, wendet die Patches der Reihe nach an,
fährt beide Testläufe und prüft den `!important`-Zähler. Es **pusht
nichts**.

Zwei Regeln, die dabei nicht verhandelbar sind:

* **Bei einem Konflikt abbrechen und nachfragen** — nicht mit `-3`
  weitermachen, nicht squashen, nicht rebasen. Die Reihenfolge der
  Commits trägt die Begründung; ein Squash wirft sie weg.
* **Kein zusätzlicher Versionsstempel.** `deploy-pages.yml` stempelt
  alles in `_site/` beim Deploy neu. Ein von Hand gesetzter Stempel
  erreicht keinen Nutzer und schreibt nur `index.html` (845 KB) in den
  Commit.

Nach dem Merge: warten, bis `thedipidis.app/version.json` den neuen
Zeitstempel zeigt. Erst dann ist es live.

## Wenn ein Block erledigt ist

Ordner von `offen/` nach `erledigt/` verschieben und die Zeile in der
Tabelle oben umstellen. Die Patches bleiben liegen — sie sind das
Protokoll, warum etwas so aussieht, wie es aussieht, und die
Commit-Nachrichten darin sind ausführlicher als jede Zusammenfassung.
