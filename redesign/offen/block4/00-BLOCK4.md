# Block 4 — die Anleitung raus, die Sprache richtig

Vier Commits auf `main` (Stand `730d0ab9`, 18.08.2026 09:44 UTC, also
nach dem Merge von Block 3 / PR #453). Nichts davon ist gepusht.

## Anwenden

```bash
bash redesign/offen/block4/merge-block4.sh .
```

Legt `block4-anleitung` an, wendet die vier Patches der Reihe nach an,
prüft dass die Anleitung im Deploy landet, fährt beide Testläufe und
prüft den `!important`-Zähler. Pusht nichts. Bei einem Konflikt
abbrechen und nachfragen — nicht mit `-3`, nicht squashen.

Falls `main` stark abgewichen ist, gibt es den Zweig auch fertig:

```bash
git fetch redesign/offen/block4/block4.bundle block4:block4-anleitung
```

## Die vier Commits

| # | Commit | Kern |
|---|--------|------|
| 1 | `nav: der Sprachwechsel kam nie an` | Listener auf `window`, Ereignis auf `document` |
| 2 | `sw: die Shell-Liste war 37 Dateien hinterher` | Offline-Cache kannte die halbe Seite nicht |
| 3 | `sprache: eine deutschsprachige Seite startet nicht auf Englisch` | Standardsprache, Rückfall, Umschalter |
| 4 | `anleitung: 64,8 % von index.html werden nachgeladen` | Der große Schnitt |

### 1 · Der Sprachwechsel kam nie an

`js/ds-nav.js` hing auf `window`:

```js
window.addEventListener('languageChanged', ...)
```

`js/i18n.js:3943` verschickt aber auf `document`, und ohne `bubbles`:

```js
document.dispatchEvent(new CustomEvent('languageChanged', {...}))
```

Ein `CustomEvent` ohne `bubbles` steigt nicht auf. Der Listener hat seit
dem 17.08. kein einziges Mal ausgelöst — nach einem Sprachwechsel stand
die Hauptnavigation weiter auf Start / Meta / Decks / Turnier / Karten,
während die Seite darunter englisch wurde. Auf Mobil dieselbe Leiste
unten.

Gefunden beim Auslagern der Anleitung, nicht gesucht: der neue Loader
hört auf beide, und im Vergleich fiel auf, dass die Leiste nicht
mitzieht.

### 2 · Die Shell-Liste war 37 Dateien hinterher

Der Kommentar über `SHELL_ASSETS` sagte: *„the list changes <1×/quarter
so the build infra isn't worth it yet"*. Gemessen am 18.08.: **37 von 95
Assets fehlten** — `app-meta-call.js` (das größte Modul der Seite), alle
sechs Side-Quest-Dateien, `firebase-auth.js`, `firebase-globals.js`, die
Archetyp-Karte, der Hub, der Ladebildschirm.

Warum das mehr ist als „der allererste Offline-Start": `CACHE_NAME`
trägt den Deploy-Stempel. Jeder Deploy — mehrere am Tag — installiert
einen neuen Cache, und der `activate`-Handler löscht den alten.
Vorgecacht wird beim Install nur `SHELL_ASSETS`; alles andere landet
erst wieder im Cache, wenn der Nutzer es das nächste Mal online abruft.
Wer zwischen Deploy und nächstem Abruf das Netz verliert, dem fehlen
genau die Dateien, die nicht auf der Liste stehen. Wie das aussieht,
steht im Repo schon als Kommentar an `firebase-globals.js`: *„user
appeared signed out and saw empty tabs (2026-05-28)"*.

`tests/unit/test-service-worker-shell.js` vergleicht die Liste jetzt bei
jedem Lauf mit `index.html`. Zwei begründete Ausnahmen:
`js/firebase-credentials.js` (steht in `.gitignore`, wird im Deploy aus
einem Secret geschrieben) und die Tutorial-Fragmente (546 KB, bewusst
nicht im Shell).

### 3 · Die Sprache

Drei Dinge, die zusammen dafür sorgten, dass ein deutscher Erstbesucher
auf Englisch landete und keinen Weg zurück sah:

* `I18N_DEFAULT_LANG` stand hart auf `'en'`. Jetzt entscheidet
  `navigator.languages`, sonst Deutsch. Eine gespeicherte Wahl schlägt
  weiterhin beides.
* Derselbe Wert diente als Rückfall für fehlende Schlüssel. Das sind
  zwei Fragen. Der Rückfall heißt jetzt `I18N_FALLBACK_LANG` und bleibt
  Englisch. Faktisch ändert das nichts: beide Wörterbücher haben exakt
  1.745 Schlüssel und decken sich vollständig.
* Der Umschalter zeigte die **aktive** Sprache. Ein deutscher Nutzer sah
  „DE" und hatte keinen Hinweis, dass ein Klick nach Englisch führt.
  Jetzt steht dort das Ziel, und der Titel sagt es aus.

Nebenbei: der Untertitel der Anleitung behauptete „v46 (Mai 2026)", zwei
Zeilen darunter stand im Hero „v47 · Juni 2026". Im selben
Bildausschnitt.

### 4 · Die Anleitung

```
index.html                  838.814 → 299.109 Zeichen   (−64,3 %)
tutorial/tutorial.de.html   301.384 Zeichen, fällt beim Öffnen an
tutorial/tutorial.en.html   242.083 Zeichen, fällt beim Öffnen an
```

Beide Sprachfassungen lagen gleichzeitig im DOM, eine davon per
`display:none !important` versteckt. Jeder Besucher hat sie geladen, der
Parser hat sie gebaut, das Layout hat sie vermessen. Auf Mobil 61.367 px
in einem Tab, den die meisten nie öffnen.

Der Text ist Zeichen für Zeichen derselbe — geschnitten, nicht
umformatiert. In den Fragmenten stehen 64 `<code>`-Elemente, und dort
zählen Leerzeichen.

`js/ds-tutorial.js` holt genau eine Fassung, beim ersten Öffnen des Tabs
und noch einmal bei jedem Sprachwechsel. Vier Stellen, an denen so eine
Auslagerung still kaputtgeht, alle im Code kommentiert und alle im Test:

1. **Der Deploy.** `_site` wird aus einer Positivliste gebaut. Ohne
   `cp -r tutorial _site/tutorial` läge die Anleitung im Repo und nicht
   auf der Seite — auffallen würde es erst in Produktion. Genau das
   passiert `redesign/`, das deshalb 404 gibt.
2. **Die Bildsonde** für `.tutorial-screenshot-frame` lief einmalig beim
   Seitenstart. Zu dem Zeitpunkt gibt es keinen Slot mehr.
3. **Der überholte Abruf.** Zwei Sprachwechsel kurz hintereinander: die
   ältere Antwort darf die neuere nicht überschreiben.
4. **Der Fehlerfall.** Benannter Zustand mit Wiederholen-Knopf und
   direktem Link auf die Datei — bewusst kein roter Kasten, das ist
   meistens eine schlechte Verbindung und kein Defekt.

Der Tab geht über vier Wege auf: Pokéball, Hilfe-Knopf, Hauptnavigation
und die Tiefenlinks `#tutorial` / `#anleitung` / `#hilfe`. Der Auslöser
hängt deshalb an `switchTab`, nicht an einem Knopf.

**Patch 0004 ist 1,1 MB groß.** Das ist kein Fehler — er verschiebt
543.271 Zeichen. Der Bundle daneben tut dasselbe in 23 KB.

## Geprüft

* Frischer Klon auf `730d0ab9`, `merge-block4.sh` durchgelaufen.
* JS **1077 passed, 0 failed** (17 davon neu in `test-tutorial.js`,
  4 in `test-service-worker-shell.js`).
* Python **373 passed, 5 skipped**.
* `!important` **3399 → 3396**.
* Playwright 1440 × 900 und 390 × 844:
  - Beim Start ist `#tutorialHost` 388 Zeichen groß, `data-state="idle"`.
    Nichts wird geladen.
  - Nach `switchTab('tutorial')`: 300.885 Zeichen, 15 `<section>`, Hero
    da, `data-state="ready"`, keine Konsolenfehler.
  - Nach `switchLanguage('en')`: englischer Hero, beide Fassungen im
    Speicher, kein zweiter Abruf.
  - Mit blockiertem Fragment **und** ohne Service Worker: Fehlerzustand
    mit Wiederholen-Knopf.
  - Mit blockiertem Fragment und aktivem Service Worker: die Anleitung
    erscheint trotzdem — der Netzwerk-zuerst-Zweig fällt auf den Cache
    zurück. Genau so ist es gedacht.
  - Browsersprache `de-DE` → Seite startet deutsch, Umschalter zeigt
    „EN" mit Titel „Auf Englisch umschalten". Browsersprache `en-US` →
    Seite startet englisch.

## Noch offen aus Block 4

Die **Karten-Legende A–K** vom Hub (734 px, 45 % der Hub-Höhe, erklärt
Bedienelemente, die es auf dem Hub nicht gibt) wandert in Block 5 mit —
sie gehört in die Kartendatenbank, und die ist dort ohnehin dran.
