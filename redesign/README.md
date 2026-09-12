# redesign/

Der Umbau von thedipidis.app, Etappe für Etappe. Was hier liegt, ist
**Arbeitsmaterial**, kein Teil der Seite: `thedipidis.app/redesign/`
gibt 404, der Pages-Build nimmt den Ordner nicht mit.

---

## ⚠ Nichts unter `offen/` ist offen. Kein Merge-Skript ausführen.

**Nachgeprüft am 12.09.2026.** Alle sechs Blöcke unter `offen/` sind
längst auf `main`:

| Block | Beleg |
|---|---|
| 3 | Commit `b64d40e2` ist Vorfahr von `main` |
| 4 | Commit `730d0ab9` ist Vorfahr von `main` |
| 5 | 40 von 40 Stichproben aus den Patches stehen im heutigen Stand; `tests/unit/test-cardgrid-buttons.js` existiert |
| 6 | 40 von 40 Stichproben; `tests/unit/test-mobil.js` und `css/mobile-responsive.css` existieren |
| 7 | Commit `f7a63025` ist Vorfahr von `main` |
| 8 | Commit `91fd8a59` ist Vorfahr von `main` |

Bei 5 und 6 weichen die Commit-Kennungen in den Bundles ab, weil die
Änderungen neu aufgesetzt und nicht als Commit übernommen wurden. Der
Inhalt ist da.

**Warum das eine Warnung und keine Fußnote ist:** dieselbe Datei hat
bis heute dazu aufgefordert, `bash redesign/offen/blockN/merge-blockN.sh .`
auszuführen. Die Patches setzen auf Ständen vom 18.08.2026 auf — über
hundert Commits zurück. Ausgeführt hätten sie entweder in Konflikten
geendet oder, schlimmer, bereits erledigte Änderungen ein zweites Mal
angewandt.

`offen/block8/00-BLOCK8.md` trägt die Korrektur seit dem 02.09.2026 im
eigenen Kopf („ERLEDIGT — nachgeprüft … Nicht ausführen."). Verschoben
wurde die Datei nie, und die Tabelle hier führte Block 8 weiter als
offen. **Ein Hinweis, den man erst findet, nachdem man das Skript
gestartet hat, ist keiner.**

Die 49 Dateien bleiben liegen: die Commit-Nachrichten darin sind
ausführlicher als jede Zusammenfassung und erklären, warum die Seite
aussieht, wie sie aussieht. Wer den Platz braucht (3,7 MB), kann den
Ordner löschen — die Historie hält den Inhalt ohnehin.

---

```
redesign/
├── README.md              diese Datei
├── erledigt/              was auf main ist
│   ├── etappe-0-2/        Pipeline, Navigation, Zahlen (PR #452)
│   └── block3/            teilbare Bilder, Deckansicht, Platzierung (PR #453)
├── offen/                 IRREFÜHRENDER NAME — siehe Warnung oben.
│   └── block3..block8/    alles davon ist auf main
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
| 3 | Teilbare Bilder, Deckansicht, Platzierung | **live** seit 18.08. (PR #453) |
| 4 | Anleitung auslagern, Sprache, Service-Worker-Cache | **live** (`730d0ab9`) |
| 5 | Designsystem Meta + Decks, Kartenlegende | **live** (Inhalt nachgewiesen) |
| 6 | Mobil: Matchup-Heatmap, `mobile-responsive.css` | **live** (Inhalt nachgewiesen) |
| 7 | Meta Call entkoppeln, Kartendatenbank ausgeloggt | **live** (`f7a63025`) |
| 8 | Zusammenlegungen: Deck-Analyse-Shell, Matchup-Komponente | **live** (`91fd8a59`) |

Live heißt: auf `main` **und** deployt. Nachprüfbar an
`thedipidis.app/version.json` — Code auf `main` ist nicht dasselbe wie
Code auf der Seite.

## Wenn es je wieder einen Block gibt

Der Ablauf von damals, zum Nachschlagen — **nicht** für die Ordner, die
jetzt dort liegen:

Ein Blockordner enthält Patches in Reihenfolge, ein Merge-Skript und
eine Beschreibung. Das Skript legt einen Zweig an, wendet die Patches
der Reihe nach an, fährt beide Testläufe und prüft den
`!important`-Zähler. Es **pusht nichts**.

Zwei Regeln, die dabei nicht verhandelbar sind:

* **Bei einem Konflikt abbrechen und nachfragen** — nicht mit `-3`
  weitermachen, nicht squashen, nicht rebasen. Die Reihenfolge der
  Commits trägt die Begründung; ein Squash wirft sie weg.
* **Kein zusätzlicher Versionsstempel.** `deploy-pages.yml` stempelt
  alles in `_site/` beim Deploy neu. Ein von Hand gesetzter Stempel
  erreicht keinen Nutzer und schreibt nur `index.html` (845 KB) in den
  Commit.

Und die Regel, an der diese Datei gescheitert ist: **ein Block, der auf
`main` ist, wird sofort umgetragen.** Ein Ordner namens `offen/`, in
dem nichts offen ist, kostet den nächsten Durchgang eine Stunde — oder
richtet Schaden an.
