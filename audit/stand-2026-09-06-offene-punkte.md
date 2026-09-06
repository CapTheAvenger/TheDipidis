# Stand 06.09.2026 — was steht, was offen ist

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

## 3. Nachtrag vom Abend: beide Entscheidungen umgesetzt

Der Betreiber hat beide offenen Punkte entschieden — **Labs-Scraper laufen
lassen** und **NAIC/Turin nachziehen**. Beides ist durch und nachgemessen.

### 3.1 Druckherkunft: von 3.699 auf 30.459 Zeilen

| | vorher | nachher |
| --- | ---: | ---: |
| Zeilen mit `druck_quelle = seite` | 3.699 | **30.459** |
| Zeilen ohne Herkunft | 26.760 | **0** |

Der erste Versuch (Lauf #18) lief grün und tat nichts: ich hatte das
Datumsfeld **geleert**, weil die Beschreibung „leer = Filter aus" sagt.
GitHub setzte für das leere Feld den Vorgabewert `auto` ein — und `auto`
heißt 31.07.2026. NAIC (12.06.) und Turin (06.06.) liegen davor, also
passte kein Turnier. 30.459 rein, 30.459 raus, grüner Haken. Mit einem
ausdrücklichen Datum (`2026-01-01`) lief es.

Der **zweite** Lauf war nötig, weil beim ersten sechs von 675
NAIC-Spielern nicht geholt wurden (156 Zeilen). Ihre alten Zeilen blieben
unverändert stehen — richtig so, der Schreibweg ersetzt je
(Turnier × Spieler × Deck) und wirft nichts weg. Nach dem zweiten Lauf: 0.

### 3.2 Regional Orlando: von 512 auf 2.745 Zeilen

Die Ursache war nicht der Lauf, sondern die **Einstellung** — und ein
zweiter Mechanismus, den erst die unabhängige Prüfung fand.

`data/labs_tournaments.json` pendelte wochenlang zwischen acht und elf
Einträgen. Der Filter (`from_date: 2026-04-24`, `tournament_types` ohne
`special`) ließ nur acht durch; der **Gap-Fill** (`:2306-2318`) sammelte
aus dem Fenster `[max_tid-10 .. max_tid+5]` nachträglich wieder ein, ohne
Datums- und Typfilter. Solange `max_tid` 0070 war, fing das Fenster 0060
Orlando mit auf. Mit 0071 Worlds rutschte es heraus.

**PR #692** setzt `from_date` auf `2026-04-01` und ergänzt `special`.
Die Zahl ist nicht gegriffen: der Wochenlauf fährt den Continuity-Scraper
seit jeher mit `--from-date 2026-04-01`; diese Einstellung war die einzige
Stelle, die davon abwich.

| | vorher | nachher |
| --- | ---: | ---: |
| Turniere in `labs_tournaments.json` | 8 | **12** |
| Zeilen in `player_continuity.csv` | 19.066 | **21.299** |
| Zeilen ohne `player_id` | 512 | **0** |
| 0060 Orlando | 512 | **2.745** |

### 3.3 Drei rote Tests, die den Deploy anhielten

Nach den Datenläufen war `main` rot — und weil der Deploy an grünen Tests
hängt, hing die Seite auf dem alten Stand, ohne dass etwas kaputt aussah.

1. **`test-schluessel-und-schreibweg.js`** verlangte, dass NAIC eine
   **leere** `tournament_id` hat — die Umgehung, die es dafür gab. Der
   Neulauf hat sie gefüllt (0070/0069/0071, 0 leere Zeilen). Der Fall
   prüft jetzt den geheilten Zustand; die Brücke im Deckbauer bleibt als
   Rückfallschutz.
2. **`test-nenner-und-rundung.js`** verglich eine Rekonstruktion aus
   gerundeten Anteilen mit einer festen Schranke von **5**. Nachgerechnet:
   die Quelle rundet auf zwei Nachkommastellen, allein daraus ergibt sich
   für das stärkste Deck (7,62 %, n = 3.138) ein Band von **±27**. Eine 5
   war bei 41.193 Spielern rechnerisch nicht einhaltbar; sie stimmte nur,
   solange das Feld klein war. Die Schranke wird jetzt **aus den Daten
   abgeleitet** (hier 28, also 0,068 % des Feldes) — ein Drift von 0,1 %
   fällt weiterhin um.
3. **`test-online-fenster-verdrahtung.js`** hielt einen **datierten
   Kommentar** („Gemessen am 05.09.2026") gegen die Datei von heute. Das
   muss jede Woche scheitern. Zum dritten Mal derselbe Mechanismus: zweimal
   wurde die Zahl nachgezogen, beim dritten Mal ist die Prüfung auf die
   **Eigenschaft** umgestellt — Verdrahtung steht, Kommentar nennt sein
   Messdatum, und die Aussage selbst (Toucannon liegt im Fenster deutlich
   unter kumulativ) gilt an den heutigen Daten.

### 3.4 `is_ace_spec`

Beide Datenläufe lösten die bekannte Drift aus (9.437 bzw. 5.158 Felder).
Zweimal den Workflow „Daten reparieren" mit `schreiben=true` gefahren —
der ist wiederholbar und rührt nur diese eine Spalte an.

### 3.5 Endstand

* **Wächter: 0 CRITICAL, 9 WARN** (vorher 11) — beide Scraper-Warnungen weg.
* Suiten: Python **1396**, JS **4038**.
* Live `202609061738-b964228`: 21.299 Kontinuitätszeilen, 12 Turniere in
  der Liste, Orlando dabei. PC und Telefon (375 × 812) geprüft, acht
  Routen ohne Querlauf, keine Konsolenfehler.

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
