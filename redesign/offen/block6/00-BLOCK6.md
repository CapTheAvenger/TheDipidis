# Block 6 — was auf dem Telefon passiert

Drei Commits. **Setzt auf Block 5 auf** (und damit auf Block 4). Nichts
davon ist gepusht.

```bash
bash redesign/offen/block4/merge-block4.sh .
bash redesign/offen/block5/merge-block5.sh .
bash redesign/offen/block6/merge-block6.sh .
```

Alle drei Befunde haben dieselbe Form: eine Entscheidung, die einmal
getroffen wurde, hat sich als Regel festgesetzt, und alles danach war
Schadensbegrenzung.

## 1 · Die Kachelbreite

Die Spaltenzahl der Kartengitter wird an **46 Stellen** gesetzt,
verteilt über `styles.css`, `city-league.css`, `meta-card-analysis.css`,
`ui-components.css`, `mobile-responsive.css` und zwei Inline-Blöcke in
`index.html`. Für das Gitter der Deck-Analyse gewann
`repeat(3, 1fr) !important` — drei Spalten, egal wie breit das Gerät
ist. Auf 390 px sind das 94 px je Kachel.

Alles, was Block 5 abgeräumt hat, war die Folge dieser einen Zahl. Der
Kommentar an der Regel sagte es sogar selbst: *„uses minmax(120px)
which gives only 2 cards per row. **Fix:** Override to always show 3
cards per row"*.

Jetzt steht sie einmal, und als **Mindestbreite statt Anzahl**: die
Kachel bestimmt, wie viele hineinpassen, nicht umgekehrt.

```
Kachelbreite auf 390 px    94 px  →  143 px
Knöpfe                     24×28  →  40×28
Preis                      eigene Zeile  →  zurück in die Zeile
Infoleiste                155 px  →  124 px
```

Der Schreibtisch bleibt bei 145 px unverändert.

Dafür mussten fünf `!important` auf `.card-grid`-Böden in `styles.css`
weichen — sonst bräuchte die eine neue Regel selbst eines, und dann
wären es wieder zwei, die sich streiten.

## 2 · Die Matchup-Heatmap

```css
/* Hide heatmap on mobile — table not usable on small screens */
@media (max-width: 768px) { .heatmap-container { display: none !important; } }
```

Gemessen: **0 px**, ersatzlos, ohne Hinweis, dass es sie gibt. Das ist
die Ansicht, die man zwischen zwei Runden auf dem Telefon aufmacht.

Die Tabelle war die ganze Zeit bedienbar — `.heatmap-table-scroll` hat
`overflow-x: auto`. Gefehlt hat die Orientierung: sobald die Deckspalte
aus dem Bild läuft, weiß man nicht mehr, welche Zeile man liest. Sie
klebt jetzt und ist auf 116 statt 170 px geschrumpft.

**Und sie war rot-grün.** Die dritte Stelle auf der Seite mit dieser
Skala, und die schlimmste: hier steht die Farbe *für* die Aussage, nicht
neben ihr.

```
rgba(76, 175, 80, …)  →  rgba(42, 120, 214, …)   --dv-pos
rgba(244, 67, 54, …)  →  rgba(227, 73, 72, …)    --dv-neg
rgba(241, 196, 15,.2) →  var(--surface-2)        Nullpunkt
```

Dazu: die Schrift schaltete ab 65 % bzw. 35 % auf Weiß um, machte den
Kontrast also von der Zahl abhängig. Und drei Regeln in
`ui-components.css` setzten sie zusätzlich mit `!important` auf grün /
rot / grau — stärker als der Wert, den der Renderer je Zelle mitgibt.
Jetzt: getönte Zelle, feste Textfarbe.

Die Legende bestand aus den Wörtern „Green", „Gray" und „Red" in genau
diesen Farben. Ein Farbwort hilft niemandem, der die Farbe nicht sieht;
jetzt steht dort das Feld selbst.

**Eine Ausnahme, bewusst:** die Breitenangaben in
`current-meta-matchups.css` behalten ihr `!important`, und die mobile
Regel bekommt eines dazu. Entschärft man sie, läuft die Tabelle auf dem
Schreibtisch auseinander — die erste Spalte nimmt dann die ganze Breite,
weil `table-layout: fixed` ohne feste Spaltenbreiten anders rechnet.
Gemessen: 152.174 px. Der Grund steht als Kommentar daneben.

## 3 · Die Karten-Legende

```
Hub-Höhe Schreibtisch   1.691 px, davon Legende   764 px  = 45 %
Hub-Höhe Telefon        3.499 px, davon Legende 1.640 px  = 47 %
```

Sie erklärt Anzahl-Plakette, Wunschzettel-Herz, Inklusionsrate und die
sechs Aktionsknöpfe. **Keines dieser Elemente gibt es auf dem Hub.** Wer
zum ersten Mal auf der Seite landet, liest eine halbe Bildschirmseite
über Knöpfe, die er noch nicht gesehen hat — und scrollt an den Kacheln
vorbei, die der Hub eigentlich anbietet.

Jetzt liegt sie in der Deck-Analyse, direkt über dem Kartengitter, und
eingeklappt: 44 px statt 764, einen Klick entfernt.

```
Hub-Höhe Schreibtisch   1.691 px  →    895 px
Hub-Höhe Telefon        3.499 px  →  1.836 px
```

### Anmerkung zum Umbau-Handbuch

Dort steht: *„sie gehört in die Kartendatenbank, wo die Knöpfe
tatsächlich stehen."* Nachgemessen stimmt das nicht. Die Kartendatenbank
rendert `.card-database-item` und hat weder Plaketten noch
Aktionsknöpfe — nur Bild, Name und Preis. Die Elemente, die die Legende
erklärt, gibt es ausschließlich im Kartengitter der Deck-Analyse.

## Geprüft

* Frischer Klon, `merge-block6.sh` durchgelaufen.
* JS **1098 passed, 0 failed** (12 davon neu in `tests/unit/test-mobil.js`).
* Python **373 passed, 5 skipped**.
* `!important` **3359 → 3356**.
* Playwright 390 × 844 und 1440 × 900: Kachelbreite 94 → 143 px,
  Heatmap-Container 0 → 944 px mit klebender Deckspalte bei 141 px,
  Zellhintergrund `rgba(42,120,214,.2)`, Schrift `rgb(22,26,35)`,
  Hub-Höhe 3.499 → 1.836 px bzw. 1.691 → 895 px. Schreibtisch in allen
  drei Punkten unverändert.

## Danach offen

* Block 7 — Meta Call aus `#profile-content` lösen (10.827 Zeilen ohne
  einen einzigen `currentUser`-Treffer, nur wegen des Containers
  ausgeloggt unsichtbar), Kartendatenbank ausgeloggt (216
  Sammlungs-Bedienelemente, die nichts tun).
* Block 8 — die Zusammenlegungen: eine Deck-Analyse-Shell statt drei
  kopierter Ansichten, eine Matchup-Komponente.
* Die verbleibenden 44 Stellen, an denen eine Spaltenzahl gesetzt wird.
  Block 6 hat die eine geordnet, die die Deck-Analyse trägt; die
  Tier-Listen-Gitter (`.tier-deck-grid`, 3 Spalten zu 82 px) und
  `.top-cards-grid` (4 Spalten zu 69 px) haben dasselbe Problem.
