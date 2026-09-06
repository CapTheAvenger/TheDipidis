# Stand 06.09.2026, nachmittags — was steht, was offen ist

Ersetzt die Fassung von 13:15 vollständig. Dort ging es um PR #690, der
inzwischen zusammengeführt ist.

**Regel dieses Dokuments:** Jede Zeile nennt, woran sie gemessen wurde. Was
nicht nachgemessen ist, steht als **NICHT GEPRÜFT** — nicht als OK.

---

## 1. Zuerst: ein Fehler von mir

Beim letzten Aufräumschritt der Live-Prüfung habe ich auf `thedipidis.app`
**alle 29 localStorage-Schlüssel gelöscht**. Ich verglich gegen eine Sicherung
in `window.__lsBackup`, die nach einem Neuladen der Seite nicht mehr existierte.
Sie ergab `{}` — also galt jeder Schlüssel als neu.

```js
const alt = window.__lsBackup || {};          // war {} nach dem Reload
const neu = Object.keys(jetzt).filter(k => !(k in alt));
neu.forEach(k => localStorage.removeItem(k));  // loeschte ALLES
```

Das verletzt die stehende Anordnung *„Bestehende Nutzerdaten und gespeicherte
Decks niemals verändern oder löschen."*

**Live nachgesehen — kein Nutzerinhalt ist verloren:**

| Gegenstand | Stand |
| --- | --- |
| 4 Decks (Mega Excadrill V1/V2/V3, Slowking) | aus der Cloud zurück |
| Ordner „Hausi Playables" (43 Decks, Stand 24.08.) | zurück |
| Wunschliste (146 Karten) | zurück |
| Meta-Binder (215 Karten), Deck-Ordner „Maulwurf" | unverändert |
| Cloud-Dokument `updatedAt` | **28.07.2026** — die Löschung schlug nicht nach oben durch |

Grund: Decks, Ordner und Listen liegen in Firestore (`users/<uid>` plus
Unterkollektionen `decks`, `customBinders`); `localStorage` ist dafür nur ein
Spiegel — `js/custom-binder.js:41-48` sagt das ausdrücklich.

**Verloren sind nur Geräteeinstellungen:** auf- und zugeklappte Abschnitte, der
Binder-Bildcache (baut sich neu auf), etwaige rein lokale Entwürfe. Theme
(`dark`) und Sprache (`de`) entsprechen wieder dem vorherigen Stand; den
Druckmodus (`min`) habe ich wiederhergestellt, weil ich ihn vorher selbst
ausgelesen und protokolliert hatte.

**Die vollständige Liste der 29 Schlüssel habe ich nicht mehr** — sie ist bei
einer Kontextkürzung verlorengegangen. Das steht hier, statt sie zu
rekonstruieren.

**Die Lehre, in einem Satz:** ein leeres Vergleichsobjekt darf niemals
„alles ist neu" bedeuten. Wer auf Grundlage einer Sicherung löscht, prüft
zuerst, dass die Sicherung da ist.

---

## 2. Erledigt seit der letzten Fassung

| | Beleg |
| --- | --- |
| **PR #690** zusammengeführt | `data/tournament_decklists_per_player.csv` auf `main` = `18927ada`, identisch zum lokalen Stand; 30.459 Zeilen, 21 Spalten, 0 Dubletten |
| **PR #691** zusammengeführt | die zweite Kopfzeilen-Falle in `tournament_scraper_JH.py`; drei Prüfungen grün, drei Blob-SHAs gegen `main` verglichen |
| **`player_continuity.csv` repariert** | Lauf #3 grün (1m11s). **6.131 → 19.066 Zeilen**, 11 → **18 Spalten**, `player_id` da |
| **Wächter meldet 0 CRITICAL** | `python3 scripts/data_guardian.py` gegen den neuen Bestand |

### Die 512er-Deckelung im Einzelnen

Vorher standen **elf von zwölf** Turnieren mit exakt 512 Zeilen in der Datei —
der Deckelung der HTML-Tabelle, die Limitless oben als Filter „top 512"
einschaltet. Nachher:

| tid | Turnier | vorher | nachher | Teilnehmer laut Quelle |
| --- | --- | ---: | ---: | ---: |
| 0061 | Regional Querétaro | 512 | 1.446 | 1.434 |
| 0062 | Regional Prague | 512 | 1.370 | 1.367 |
| 0063 | Regional Los Angeles | 512 | 1.849 | 1.844 |
| 0064 | Regional Utrecht | 512 | 2.150 | 2.143 |
| 0065 | Regional Campinas | 512 | 1.725 | 1.722 |
| 0066 | Regional Melbourne | 512 | 959 | 958 |
| 0067 | Special Event Lima | 499 | 499 | 485 |
| 0068 | Regional Indianapolis | 512 | 1.974 | 1.970 |
| 0069 | Special Event Turin | 512 | 2.033 | 2.032 |
| 0070 | NAIC New Orleans | 512 | 3.752 | 3.743 |
| 0071 | Worlds San Francisco | 512 | **797** | 774 |
| 0060 | Regional Orlando | 512 | **512** | **2.745** |

**Nebenbefund, der einen älteren Befund umdreht:** der Abschlussbericht meldete
unter D1 *„Worlds: 23 Spieler fehlen"*. Das war die Sicht auf die gedeckelten
Daten. Die Standings führen **797 Plätze, lückenlos 1 bis 797, 797
verschiedene `player_id`, keine Dublette** — 23 **mehr** als die 774, die
`labs_tournaments.json` als `total_players` führt. Es fehlten keine Spieler;
die Kopfzahl in der Turnierliste ist die knappere Angabe.

---

## 3. Offen — mit Zahl, ohne Vermutung

### 3.1 Regional Orlando (tid 0060): 2.233 Zeilen fehlen

Die einzige Zeile in der Tabelle oben, die sich nicht bewegt hat.

**Gemessen an der Quelle:** die eingebettete Nutzlast von
`labs.limitlesstcg.com/0060/standings` führt **2.745 Einträge**. Unsere Datei
hat 512 — und zwar die alten, aus dem HTML-Rückfallweg, ohne `player_id`. Es
sind genau diese 512 Zeilen, die der Wächter jetzt als WARN meldet.

**Ursache:** `0060` steht **nicht** in `data/labs_tournaments.json`. Der
Continuity-Scraper zieht seine Zielliste aus dieser Datei, hat das Turnier also
nie angefasst; seine 512 Altzeilen wurden als „fremde Zeilen" unverändert
mitgeschrieben (`player_continuity_scraper.py:530-540` — richtig so, sonst wären
sie weg).

**Warum es nicht in der Liste steht — Hinweis, nicht Beweis:** auf der
Indexseite von Labs ist `0060` vorhanden und heißt *Regional Championship
Orlando, **April 3–5, 2026***. Das Nachbarturnier `0061` (Querétaro) läuft
*April 4–5* und steht in der Liste. Ein Datumsfilter auf dem ersten Turniertag
würde genau diesen Unterschied erklären. **NICHT GEPRÜFT** — dafür müsste
`labs_tournament_scraper.py` laufen, und der überschreibt
`labs_tournaments.json` vollständig (`:1976`, `:2031`).

**Entscheidung nötig:** einen Lauf des Labs-Turnierscrapers anstoßen (er
schreibt die Turnierliste neu und zieht dabei auch `labs_tournament_decks.csv`
und die Matchups nach) — oder es so lassen. Ich stoße ihn nicht von mir aus an:
er überschreibt mehr als diese eine Lücke.

### 3.2 NAIC und Turin im alten Format — Entscheidung des Betreibers

26.760 der 30.459 Zeilen in `tournament_decklists_per_player.csv` tragen
`meta = TEF-CRI` und keine Druckherkunft. Sie liegen **außerhalb** des aktuellen
Formatfensters und erreichen `#current-meta` und `#city-league` nicht
(`minDate = format_window.in_person_legal_date` = 31.07.2026,
`js/app-deck-builder.js:7429`). Auf `#past-meta` wirken sie.

Der Dienstagslauf fasst sie **nie** an: `--from-date auto` löst auf 31.07.2026
auf, dazu `--resume`. Ein Nachziehen bräuchte einen ausdrücklichen Lauf.

**Das aktuelle Format ist vollständig belegt:** Worlds 3.699 Zeilen, alle mit
`druck_quelle = seite`.

### 3.3 Kleinere Befunde, alle nachgemessen, keiner behoben

| | Stelle | Maß |
| --- | --- | --- |
| Tippziele unter 44 px | `#cards` | 112 Knöpfe à 24 × 24 px, 7 je Kartenkachel |
| `tier-hero-bg` steht über | `#current-meta`, `#city-league` | 3 px |
| Zahlformat hart verdrahtet | 90 Stellen `.toFixed(1).replace('.', ',')` | im Deutschen richtig, im Englischen falsch |
| „9 Runden" ohne Deckung | Meta-Call | kein Turnier im Bestand fährt 9 Runden (an vier Turnieren gezählt) |
| Herzschlag fehlt | `per_decklist_scraper.py` bei manuellem Dispatch | schreibt keinen |
| leere Testdateien | `tests/` | 15 Stück |
| Archiv wird öffentlich ausgeliefert | `data/_archive` | 21 MB |
| Verweise auf den Wächter | 4 von 24 Workflows | — |

---

## 4. Was ich in diesem Durchgang NICHT geprüft habe

* **Einen echten Lauf von `tournament_scraper_JH.py`.** Der Sandkasten kommt
  nicht an limitlesstcg.com; `cloudscraper` fehlt. Geprüft ist die Schreiblogik
  im Einzelnen (17 Zusicherungen, Mutationsprobe je Zusicherung), nicht der Lauf
  Ende zu Ende.
* **Den 111-MB-Monolithen** `tournament_cards_data_cards.csv`. Er liegt nicht im
  Repo (`.gitignore:123`); die Speicherzahlen im PR sind vom 18-MB-Auszug
  hochgerechnet.
* **Windows.** `os.replace` / `os.rename` nur unter Linux gefahren.
* **Die Telefonansicht nach diesen Änderungen.** Die vier Korrekturen aus
  PR #688/#689 waren auf 390 × 844 geprüft; PR #691 fasst nur `backend/` an und
  ändert nichts an der Anzeige.
