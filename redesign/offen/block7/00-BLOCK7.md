# Block 7 — zwei Stellen, an denen die Anmeldung im Weg stand

Zwei Commits, aufsetzend auf Block 6 (`main` = `f7a63025`). Nichts
davon ist gepusht.

```bash
bash redesign/offen/block7/merge-block7.sh .
```

## 1 · Meta Call lag hinter der Anmeldung

`js/app-meta-call.js` hat **10.839 Zeilen**. Treffer für `currentUser`,
`getCurrentUser` oder `window.auth`: **null**. Die Szenarien liegen in
`localStorage`, die Felddaten in `data/`. Das Modul braucht die
Anmeldung nicht — es lag nur im falschen Container:

```html
<div id="profile-content" class="display-none">
  …
  <div id="profile-metacall" class="profile-tab-content …">
```

`#profile-content` ist ausgeloggt versteckt. Damit war das Werkzeug, das
die Frage *„welche Decks treffe ich am Samstag"* beantwortet, für jeden
unsichtbar, der noch kein Konto hat — also für jeden, der die Seite zum
ersten Mal aufmacht.

Jetzt ein eigener Tab `#meta-call` mit `#metaCallHost`. Sonst hat sich
nichts geändert: dieselbe `init()`, dieselben drei Container-Aufrufe,
nur ein anderer Knoten.

**Die eine Stelle, die Angemeldetes liest**, ist der Journal-Blend über
`window.getBattleJournalWinRates()`. Der liest `journalHistoryCache`,
und der ist ausgeloggt leer — die Funktion liefert `{}`, die Vorhersage
läuft ohne den Blend weiter. Kein Sonderfall nötig, nachgeprüft.

Mitgezogen: `switchTab()` initialisiert den Tab, `switchProfileTab()`
hat seinen `metacall`-Zweig verloren, der Knopf in der Profil-Leiste
bleibt stehen und führt in den neuen Tab, Testing Groups springt nach
einem Import ebenfalls dorthin, Pokéball-Menü und Tiefenlinks
(`#meta-call` / `#metacall`) sind ergänzt.

Und `js/ds-nav.js` zeigt unter „Turnier" jetzt direkt darauf. Der
Sonderfall in `groupForTab()`, der den aktiven Profil-Untertab abfragen
musste, um Meta Call von der Wunschliste zu unterscheiden, kennt nur
noch das Battle Journal.

## 2 · 180 Knöpfe, die eine Fehlermeldung waren

Gezählt in der Kartendatenbank, ohne Anmeldung: **180 von 291 Knöpfen**
gehören zur Sammlung, zur Wunschliste oder zur Tauschliste. Jeder
antwortete auf einen Klick mit

```js
showNotification('Please sign in to use this feature', 'error')
```

Drei Dinge daran sind falsch. Es ist **kein Fehler, sondern eine
Voraussetzung** — Rot ist auf dieser Seite die Farbe für „das ging
schief". Die Meldung stand nur **auf Englisch**, auf einer
deutschsprachigen Seite. Und sie ließ den Nutzer stehen, wo er war: er
weiß jetzt, dass er sich anmelden muss, und darf den Weg dahin selbst
suchen — an neun Stellen im Code, alle mit demselben Satz.

Jetzt öffnet derselbe Klick die Anmeldung. Wer sie wegklickt, ist da, wo
er vorher war. Der Wächter heißt `requireSignIn()` und steht einmal in
`js/firebase-collection.js`.

**Ausblenden wäre die falsche Antwort** — wer die Funktion nie sieht,
sucht sie auch nicht. Die Knöpfe bleiben stehen und sehen aus, wie sie
sich verhalten: gedämpft, und ein Klick führt zur Anmeldung. Dafür trägt
`<html>` jetzt `is-signed-out` bzw. `is-signed-in`, gesetzt beim
Auth-Wechsel; `inline-init.js` setzt `is-signed-out` schon beim Start,
sonst blitzen die Knöpfe kurz im aktiven Zustand auf.

## Geprüft

* Frischer Klon, `merge-block7.sh` durchgelaufen.
* JS **1110 passed, 0 failed** (12 davon neu in
  `tests/unit/test-metacall-entkoppelt.js`).
* Python **373 passed, 5 skipped**.
* `!important` unverändert bei 3356.
* Playwright, **ausgeloggt**, 1440 × 900 und 390 × 844: Meta-Call-Tab
  aktiv, 51 Zeilen in der Prognosetabelle, kein Ladefehler, keine
  Konsolenfehler, Hauptnavigation hebt „Turnier" hervor. In der
  Kartendatenbank 180 von 291 Knöpfen bei `opacity 0.5`, Klick auf
  „zur Sammlung hinzufügen" öffnet das Anmeldefenster.

## Danach offen

Block 8 — die Zusammenlegungen aus dem Handbuch: eine Deck-Analyse-Shell
statt drei kopierter Ansichten (Block 5 hat die CSS-Kopien
zusammengeführt, die Renderer stehen noch dreifach), eine
Matchup-Komponente, ein Builder-Template, Meta Binder + Custom Binder.
