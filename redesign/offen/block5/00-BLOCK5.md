# Block 5 — das Kartengitter

Zwei Commits. **Setzt auf Block 4 auf** — erst `merge-block4.sh`, dann
das hier. Nichts davon ist gepusht.

```bash
bash redesign/offen/block4/merge-block4.sh .   # falls noch nicht gemergt
bash redesign/offen/block5/merge-block5.sh .
```

## Der Befund

Gemessen am 18.08.2026 in der Deck-Analyse (Global), ein Archetyp, ein
Bildschirm: **37 Karten, 296 Knoepfe**. Jeder 43,7 × 19 px mit 9-px-
Schrift, auf 390 px sogar nur 24 × 22 px. Und sechs gesättigte Farben:

```
  −   #ef4444 rot        L   Indigo-Verlauf
  +   #22c55e grün       P   Orange-Verlauf
  ★   #f59e0b bernstein  €   Petrol-Verlauf
```

Zwei Dinge daran sind falsch.

Die beiden meistbenutzten Knöpfe sind ein **rot-grünes Paar** — und
zwar genau die beiden, deren Verwechslung wehtut: eine Kopie hinzufügen
gegen eine Kopie entfernen. `css/tokens.css` hat das für die ganze
Seite längst entschieden.

Und bei sechs Signalfarben trägt keine mehr ein Signal. Dahinter liegt
das Kartenbild, das eigentlich die Ansicht sein sollte.

## Warum das nicht längst so war

Die Größe dieser sechs Knöpfe wurde an **31 Stellen** gesetzt, verteilt
über `ui-components.css`, `styles.css`, `mobile-responsive.css` und
einen Inline-Block in `index.html`, in Medienabfragen bei 768 / 600 /
480 / 430 / 420 / 412 / 390 / 360 px. Werte bis hinunter zu 15 px Höhe
und **7 px Schrift**.

Gewonnen hat eine Regel, die nie für sie geschrieben wurde:

```css
.card-item [class*="action"] button { min-height: 22px !important }
```

Der Inline-Block in `index.html` hatte am 2026-06-10 genau dieses
Problem schon einmal lösen wollen — 34 `!important`, im Kommentar stand
*„previous values (height 16px, font-size 7px) were below WCAG minimums
… the buttons now hit the 'I can actually tap and read this' bar"*. Er
hat verloren, weil der Attributselektor spezifischer ist als
`body .city-league-card-action-btn`. Zwei Monate lang sah es aus, als
wäre es repariert.

## Was jetzt gilt

Eine ruhige Chip-Familie und **genau zwei Akzente je Karte**: das Plus
trägt die Markenfarbe, weil Hinzufügen die Handlung ist, wegen der man
hier ist; der Preis trägt den stärksten Kontrast, weil er die eine Zahl
ist, auf die geschaut wird, und der einzige Knopf, der die Seite
verlässt. Alles andere unterscheidet sich durch sein Zeichen.

```
Desktop   43,7 × 19 px,  9 px  →  43,7 × 24 px, 11 px
Mobil     24   × 22 px,  9 px  →  24   × 28 px, 12 px
```

Auf dem Telefon bekommt der Preis eine **eigene Zeile**. Neben L und P
bleiben ihm auf einer 94-px-Kachel rund 32 px; bei 12-px-Schrift stünde
dort „4,3". Vorher hat die Regel das mit `min-width: 58px !important;
overflow: visible !important` gelöst — der Knopf ragte über die
Kachelkante hinaus. Eine abgeschnittene Zahl ist das eine, was diese
Seite nicht zeigen darf. Der Umbruch kostet 30 px Kachelhöhe und fällt
von selbst weg, sobald die Kachel breiter wird.

## Was sonst noch dabei rauskam

* **Dreimal exakt dieselben 40 Zeilen** für `#city-league-analysis`,
  `#current-analysis` und `#past-meta`, byte-gleich bis auf das Präfix.
  Jetzt eine gemeinsame Selektorliste.
* **Drei tote Regeln** mit `.city-league-card-action-row:last-child`,
  die der Preiszeile andere Verhältnisse geben wollten. Es gibt *drei*
  Aktionszeilen; die letzte ist die Cooking-Mode-Reihe mit Pin und
  Exclude — ausgeblendet, aber im DOM. Ohne diese Korrektur waren L und
  P sieben Pixel breit, sobald der Rest stimmte.
* **`min-width: 0`** gehört an die Regel, die die Knöpfe besitzt:
  `styles.css` gibt auf Mobil jedem `<button>` 44 px Mindestbreite, und
  drei davon passen nicht in eine 94-px-Kachel.

## Bewusst nicht drin: die Kachelbreite

Drei Spalten auf 390 px ergeben 94 px je Kachel — das ist die Ursache
hinter allem oben. Die Spaltenzahl wird für dieses Gitter an
**dreizehn Stellen** gesetzt, und das Gitter, das die Kacheln wirklich
trägt, ist `.card-grid` — eine Klasse, die auch die Kartensuche und die
Meta-Kartenanalyse benutzen.

Ein Versuch, das hier mitzunehmen, hat auf halbem Weg fünf Spalten zu
60 px erzeugt und ist zurückgenommen worden. Der Befund steht als
Kommentar an der Regel, die ihn auslöst, und ist der erste Posten von
**Block 6 (Mobil)**.

## Geprüft

* Frischer Klon, `merge-block5.sh` durchgelaufen.
* JS **1086 passed, 0 failed** (9 davon neu in
  `tests/unit/test-cardgrid-buttons.js`).
* Python **373 passed, 5 skipped**.
* `!important` **3396 → 3359**, dazu 39 weniger in `index.html`.
* Playwright 1440 × 900 und 390 × 844, Deck-Analyse (Global) mit
  Dragapult: 37 Karten, 296 Knöpfe, Maße wie oben, zwei Akzentfarben,
  keine Inline-Farbe mehr.

`tests/unit/test-cardgrid-buttons.js` hält fest, dass es wieder eine
Stelle ist: höchstens sechs bemessende Regeln, keine unter 24 px bzw.
11 px, kein Inline-Block im `<head>`, keine Wildcard, kein rot-grünes
Paar, höchstens zwei Akzente.
