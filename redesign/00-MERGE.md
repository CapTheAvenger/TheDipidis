# 00 · MERGE — die neun Commits sicher einspielen

> Das hier zuerst. Danach `UMBAU-HANDBUCH.md`.

> ## ⚠ Zuerst lesen: main ist rot, die Seite deployt nicht
>
> Gemessen am 18.08.2026, 05:30 UTC: `main` steht auf `8f78f7f` (05:14),
> `thedipidis.app/version.json` liefert noch `202608170816-f3e4e7a` von **gestern 08:16**.
> Rund zehn Datenjobs haben seither gepusht; **kein einziger ist rausgegangen.**
>
> Ursache: `tests/unit/test-conversion-performance.js` behauptet, der geglättete
> Spitzenreiter habe n ≥ 50. Diese Zusicherung gibt der Code nirgends — die Aufrufer filtern
> auf n ≥ 20. Seit heute führt Arboliva Ogerpon mit **n = 35** bei +101 %, der Test ist rot,
> und `deploy-pages.yml:56` bricht bei jedem roten Unit-Test ab.
>
> **Der Test fällt auf reinem `main`, ohne irgendetwas aus diesem Paket.** Commit 1 behebt ihn
> und steht deshalb an erster Stelle. Wenn du nur den Deploy entsperren willst, reicht er
> allein:
>
> ```bash
> git checkout -b deploy-unblock main
> git am /pfad/zu/redesign/0001-*.patch
> git push -u origin deploy-unblock
> ```

## Was eingespielt wird

Neun Commits. **Kein Patch fasst `index.html` an** — das ist der entscheidende Punkt.

`index.html` wird von den Datenjobs mehrmals täglich neu gestempelt (`?v=…`, `APP_VERSION`).
Ein Diff darauf scheitert nicht an den geänderten Zeilen, sondern an den **Kontextzeilen**:
der Nachbar jeder Einfügung ist selbst ein gestempelter Link. Auch `git am -3` löst das nicht,
weil die Einfügung auf einer Zeile sitzt, die der Job verändert hat. Praktisch nachgemessen:
zwischen Bau und Test des Pakets ist `main` dreimal gewandert, und jedes Mal wäre ein
index.html-Patch gescheitert.

Deshalb setzt `apply_index.py` die vier Zeilen beim Einspielen und `merge.sh` faltet sie in
den Navigations-Commit. Das Ergebnis ist derselbe Commit — nur überlebt der Weg dorthin
jeden Stempel.

Die zwei neuen Assets bekommen `?v=0` als Platzhalter. `bump-version.sh` ersetzt
`\?v=[0-9]+`, `deploy-pages.yml` ersetzt `\?v=[^"]*` — beide greifen darauf.

## Weg A — du selbst, ein Befehl (empfohlen)

Im lokalen `TheDipidis`-Ordner:

```bash
bash /pfad/zu/redesign/merge.sh /pfad/zu/redesign
```

Das Skript prüft **vorher** alles, was schiefgehen kann, und lässt das Repo bei Zweifel
unverändert: richtiges Repo · 7 Patches vorhanden · Arbeitsbaum sauber · Branchname frei ·
`main` per Fast-Forward aktuell. Dann legt es `redesign-e0-e2` an, wendet die Patches an,
fährt beide Testsuiten, prüft den `!important`-Zähler und setzt die Datei zurück, die
`pytest` verändert.

**Es pusht nichts.** Am Ende sagt es dir den Push-Befehl.

Getestet auf einem frischen Klon: 7 Commits angewendet, 1010 JS-Tests, 373 Python-Tests,
`!important` 3403 → 3402.

Wenn etwas nicht passt, bricht es ab und nennt die Konfliktdateien plus den Rückweg:

```bash
git am --abort && git checkout main && git branch -D redesign-e0-e2
```

## Weg B — Claude Code macht es

Auf `claude.ai/code`, Repository `CapTheAvenger/TheDipidis` auswählen. **Nur dort hat Claude
Push-Recht** — die GitHub-Karten im Cowork-Projekt sind read-only Wissens-Sync.

Lade **alle** Dateien aus diesem Ordner in die Sitzung hoch: die neun `.patch`-Dateien,
`merge.sh` **und `apply_index.py`**. Ohne die letzten beiden fehlt die index.html-Verdrahtung.
Dann gib diesen Auftrag:

---

**Auftrag: Redesign-Commits einspielen**

Im Anhang liegen neun `git format-patch`-Dateien, ein Skript `merge.sh` und ein Skript
`apply_index.py`. Sie stammen aus einer Audit- und Umbausitzung und sind auf einem frischen
Klon verifiziert.

**Fahre `merge.sh`, statt `git am` von Hand aufzurufen.** Das Skript erledigt einen Schritt,
den die Patches bewusst nicht enthalten: die vier Zeilen in `index.html`. Ein Diff darauf
scheitert an den Kontextzeilen, weil die Datei mehrmals täglich neu gestempelt wird.

1. Lege die Anhänge in einen Ordner, sagen wir `/tmp/redesign`.
2. Im Repo-Wurzelverzeichnis: `bash /tmp/redesign/merge.sh /tmp/redesign`
3. Das Skript prüft vorher alles, wendet an, verdrahtet `index.html`, fährt beide Testsuiten
   und prüft den `!important`-Zähler. **Es pusht nichts.**
4. Erwartete Ausgabe: 9 Commits · `1010 passed, 0 failed` · `373 passed, 5 skipped` ·
   `!important 3403 → 3402` · `Alles grün`.
5. Bricht es ab, **nicht selbst reparieren** — melde mir die Ausgabe. Insbesondere bei
   Patch-Konflikten: die Patches sind stempelfrei, ein Konflikt bedeutet, dass jemand
   dieselben Zeilen angefasst hat, und das will ich sehen.
6. Ändere **nichts** an den Commits. Kein Squash, kein Rebase, kein zusätzlicher
   `bump-version.sh`-Lauf — die Patches sind absichtlich stempelfrei.
7. `git push -u origin redesign-e0-e2` und einen PR öffnen. Titel:
   `Redesign Etappe 0–2: Pipeline, Navigation, Zahlen`. In die Beschreibung die neun
   Commit-Betreffs plus die Testergebnisse.
8. **Nicht mergen.** Das mache ich.

Melde am Ende: angewendete Commits, beide Testergebnisse, den `!important`-Zähler und die
PR-URL.

---

## Die neun Commits

| # | Commit | Kern |
|---|---|---|
| 1 | `test: eine Datenaussage weniger` | **Entsperrt den Deploy.** Fällt auf reinem main. |
| 2 | `guardian: tote Jobs melden, ruhige Quellen nicht` | Alarm nur, wo Alter einen toten Job beweist |
| 3 | `ci: a dead champions scrape must not report success` | Rollback bleibt, der grüne Haken geht |
| 4 | `ci: one push, one Pages deploy` | Kein `cancel-in-progress`-Rennen mehr |
| 5 | `ci: stop committing a version stamp` | ~147 Commits/Monat auf die 845-KB-Datei weg |
| 6 | `firestore: give shared_decks a rule` | Deck-Teilen lief gegen Default-Deny |
| 7 | `nav: eine sichtbare Hauptnavigation` | Sechs Ziele, Datenraum-Ausweis, Leerzustände, roter Banner weg |
| 8 | `zahlen: eine Herleitung je Größe` | 11,9/11,8 aufgelöst, `n` an jeder Rangliste, Formel an der Quote |
| 9 | `docs: Umbau-Handbuch ins Repo` | Damit jede künftige Session den Kontext im Repo findet |

Commit 1 fasst nur eine Testdatei an, Commits 2–6 nur Workflows, Skripte und Regeln.
Commits 7 und 8 ändern `js/` und `css/`; `index.html` verdrahtet `apply_index.py`, nicht ein
Patch. Commit 9 ist reines Markdown in `docs/`.

## Nach dem Merge

**Einen** Deploy abwarten und `https://thedipidis.app/version.json` auf den neuen Stempel
prüfen, bevor der nächste Push kommt — Pages-Deploys sind serialisiert (`CLAUDE.md`).

Dann hart neu laden (`Strg`+`Umschalt`+`R`), sonst serviert der Service Worker die alte
Fassung.

## Was danach passiert

**Der Guardian bleibt still — und das ist die Korrektur, nicht das Ziel.**

In einer früheren Fassung dieses Pakets hätte Commit 1 beim ersten Lauf **drei falsche
CRITICAL** geworfen. Nachgemessen am 18.08.:

| Datei | Alter | alte Schwelle | wäre |
|---|---:|---:|---|
| `price_guide_6.json` | 4 Tage | 3 | falsch CRITICAL |
| `cardmarket_card_images.csv` | 34 Tage | 14 | falsch CRITICAL |
| `prizepack_official_images.csv` | 35 Tage | 14 | falsch CRITICAL |

Ursache: die Prüfung misst das **Alter der Datei**, nicht die Aktualität des **Laufs**.
`price_guide_6.json` wird täglich heruntergeladen, aber nur von `weekly-full-update` (Di+Fr)
committet — eine 3-Tage-Schwelle feuert dort strukturell garantiert jeden Montag und
Dienstag. Und die zwei Bilddateien haben inkrementelle Builds: `CLAUDE.md` sagt „never
re-fetch data you already have", `build_prizepack_official_images.py:356` wiederholt es. Sie
bleiben wochenlang byte-identisch, **während ihr Job grün läuft**, weil die Quelle nichts
Neues hat.

Commit 1 unterscheidet deshalb jetzt zwei Klassen: `REFRESH_DRIVEN` (Alter beweist einen
toten Job → CRITICAL, Schwelle nach der Kadenz des committenden Jobs) und `CONTENT_DRIVEN`
(Alter beweist nichts → WARN nach 60 Tagen, mit dem ausdrücklichen Hinweis, erst den
Workflow-Lauf zu prüfen). Auf dem gemergten Klon: **0 CRITICAL, 1 WARN** — die vorbestehende
Preis-Mapping-Warnung.

Sauber lösen lässt sich das erst mit einem Heartbeat: jeder Job schreibt bei Erfolg einen
Zeitstempel, unabhängig davon, ob sich Inhalt geändert hat. Als `TODO(heartbeat)` im Code
vermerkt, bewusst nicht in diesem Paket — es fasst sechs Workflows an.

**Was weiterhin kommt:** Ab dem 21.08. meldet `check_emptiness` die sieben leeren
`city_league_*.csv` — 21 Tage nach dem M6-Reset vom 31.07. Das ist echt.

**Tier-Zuordnungen können sich verschieben.** Commit 7 lässt die Tier-1-Schwelle erstmals
gleiche Skalen vergleichen; vorher war die Hürde auf der Labs-Seite rund 2,4 Prozentpunkte
weicher. Das ist die Korrektur, nicht ein Nebeneffekt — aber es fällt auf.

## Rückweg

Alle sieben Commits sind additiv und einzeln umkehrbar:

```bash
git revert <sha>            # einzelner Commit
git revert --no-commit ed5cf10^..HEAD && git commit   # alle sieben
```

`css/ds-nav.css` und `js/ds-nav.js` sind neue Dateien und umschließen `switchTab`, statt
`app-core.js` zu verändern. Löscht man beide plus ihre vier Zeilen in `index.html`, ist die
Navigation exakt wie vorher.
