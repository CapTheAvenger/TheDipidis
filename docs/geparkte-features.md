# Geparkte Features

Was von der Seite genommen wurde, warum, und was davon es wert ist,
später in besserer Form zurückzukommen. Diese Datei ist **intern** — sie
wird nicht ausgeliefert und steht in keiner Ansicht.

Sie existiert, weil „wir nehmen das raus" und „die Idee war schlecht"
zwei verschiedene Sätze sind. Ohne diese Datei wird aus dem ersten in
drei Monaten der zweite, und jemand baut es ein zweites Mal von vorn.

Regel für jeden Eintrag: **was** stand da, **warum** ist es weg, **was
war gut daran**, und **was müsste anders sein**, damit es zurückkommen
kann. Ohne die letzte Zeile ist ein Eintrag nur ein Nachruf.

---

## 01.09.2026 — Aufräumrunde Startseite

Auslöser war eine Rückmeldung mit zwölf Bildschirmfotos. Der Satz, an
dem die ganze Runde hängt: *„Aber ich glaube, wir verlieren uns gerade
so ein bisschen in Unübersichtlichkeit, und das war nie der Plan."*

### 1. „Unser Pick fürs Turnier"

**Was:** Ein Block ganz oben auf der Startseite mit einem empfohlenen
Deck, seiner Day-2-Aussicht, dem Feldschnitt daneben und einem
Vorbehalt zum ungetesteten Feldanteil.
Code: `js/app-deckempfehlung.js`, Daten: `data/deckempfehlung.json` aus
`scripts/build_deckempfehlung.py`. Beides steht unverändert im Baum, nur
der Platz im HTML ist weg.

**Warum weg:** *„unser Pick fürs Turnier finde ich als Aussage erstmal
grundsätzlich komisch, weil wer ist unser? Also ich selber spiele zum
Beispiel keinen Dragapult."* Der Block sprach im Namen der Seite eine
Empfehlung aus, hinter der niemand steht — und stand dabei über den
Daten, aus denen sich jeder seine eigene Meinung bilden soll.

**Was gut war:** Die Rechnung dahinter ist die ehrlichste auf der
ganzen Seite. Sie schrumpft kleine Stichproben, weist den Feldschnitt
als Vergleich aus und sagt von sich aus, dass es in den meisten
Turnieren trotzdem nicht reicht.

**Was anders sein müsste:** Kein „unser". Die Rechnung beantwortet
nicht „was sollst du spielen", sondern „welches Deck hatte im
ausgewerteten Feld die beste Day-2-Aussicht" — und so müsste sie auch
heißen. Am besten nicht als Aushang auf der Startseite, sondern als
Antwort auf eine Frage, die der Nutzer stellt: im Meta Call, neben
seinem eigenen Deck, mit seinem eigenen Feld.

### 2. „Was gerade läuft"

**Was:** Ein Satz plus drei Kacheln (meistgespieltes, erfolgreichstes
und ein drittes Deck) mit Feldanteil, Top-8-Quote und dem Vielfachen
gegenüber dem Schnitt. Code: `js/meta-analysis-hub.js`, `answerHtml()`.

**Warum weg von der Startseite:** *„Und was gerade läuft ist genau so
ein komischer Block."* Er stand direkt über der Kachelreihe der
meistgespielten Decks und sagte dasselbe noch einmal, nur in Prosa.

**Nicht gelöscht:** Der Block zeichnet unverändert im Meta-&-Deck-Hub,
wo die Frage „was ist gerade stark" tatsächlich gestellt wird. Ein
zweiter Platz ist eine Zeile Änderung — `ANSWER_HOSTS` in
`js/meta-analysis-hub.js`.

**Was anders sein müsste:** Er darf nicht neben dem stehen, was er
zusammenfasst. Entweder er ersetzt die Kachelreihe, oder er steht
woanders.

### 3. Kachelreihe „Gemeldete Listen / Archetypen / Top 8 Archetypes"

**Was:** Drei Kennzahl-Kacheln über den Decks, mit der Zahl gemeldeter
Decklisten, der Zahl der Archetypen und dem Feldanteil der acht
größten.

**Warum weg:** *„Ich weiß nicht, ob diese Aussage tatsächlich irgendeinen
Mehrwert hat. … können wir das bei Quelle mit angeben?"*

**Wo es jetzt steht:** Unter *Quellen & Methodik*, Abschnitt „Worauf die
Zahlen beruhen" — alle drei Kacheln, auch der Feldanteil der acht
größten Archetypen. Gerechnet wird es weiter in `js/app-tier-meta.js` —
das ist die einzige Stelle, die beide Nenner kennt — und über
`js/ds-datenumfang.js` weitergereicht. **Das ist kein Parken, das ist
ein Umzug.**

*Nachtrag vom selben Tag:* die erste Fassung dieser Änderung hat den
Feldanteil der acht größten tatsächlich gelöscht, während dieser
Absatz „Umzug" behauptete. Ein Review hat es gefunden. Die Rechnung ist
wiederhergestellt; die Lehre steht hier, weil sie sich wiederholen
wird: **wer „zieht um" schreibt, muss am Zielort nachsehen.**

### 4. Deck-Suche über der Tier-Liste

**Was:** Ein Suchfeld, das live `.deck-banner-card` filterte.

**Warum weg:** *„darunter ist auch noch eine Suchleiste, die überhaupt
gar keine Funktion hat."* Stimmte — seit dem Umbau in klappbare
Abschnitte (18.08.2026) stehen alle Deck-Karten im Abschnitt
„Tier-Liste", und der fängt zugeklappt an. Wer oben tippte, filterte
etwas Unsichtbares.

**Was anders sein müsste:** Das Feld gehört **in** den Abschnitt
Tier-Liste, nicht darüber. Dann ist es sofort nützlich — 138 Decks sind
zu viele zum Scrollen. Der Filter selbst
(`window.filterTierDeckCards`) war korrekt und ist mit dem Feld
zusammen entfernt worden; er ist zehn Zeilen.

### 5. „Auf- und Absteiger"

**Was:** Zwei Tabellen mit je bis zu fünf Decks, deren Feldanteil sich
gegenüber dem Vergleichsfenster um mindestens 0,4 Prozentpunkte bewegt
hat.

**Warum weg:** *„ganz unten auf der Seite haben wir noch den Auf- und
Absteiger. Ich glaube, das ist mittlerweile auch eine Sache, die wir
wegnehmen können."* Dazu kam ein Problem, das der Block nie losgeworden
ist: an den meisten Tagen bewegt sich nichts über der Schwelle, und
dann standen zwei leere Kästen mit einem Zettel-Symbol da.

**Was gut war:** Bewegung ist die einzige Größe auf der Seite, die eine
Richtung hat statt nur einen Stand.

**Was anders sein müsste:** Nicht als eigener Block, der an ruhigen
Tagen nichts sagt, sondern als Eigenschaft der Decks selbst — die
Pfeile an den Tier-Karten machen das bereits. Wenn Bewegung einen
eigenen Platz bekommen soll, dann über ein längeres Fenster (vier
Wochen statt einer) und mit einer Grafik statt einer Tabelle. Dann hat
sie an jedem Tag etwas zu zeigen.

---

## Offene Ideen aus derselben Rückmeldung

Nicht entfernt, sondern noch nicht gebaut — hier notiert, damit sie
nicht in einem Gesprächsverlauf verschwinden.

* ~~**Damage Calculator** nach dem Vorbild von
  `nerd-of-now.github.io/NCP-VGC-Damage-Calculator/`, mit dem eigenen
  Team und den sechs des Gegners, von denen man die vier tatsächlich
  mitgebrachten aktiv schaltet; Übergabe direkt aus dem Team-Bereich.~~
  **Gebaut am 02.09.2026.** Champions → Matchups → „Team-Rechner öffnen",
  oder direkt aus dem Team-Builder über „Im Rechner öffnen". Die Matrix
  zeigt je Paar beide Richtungen mit Spanne, K.-o.-Zahl, Attackenname und
  Initiative; ein Klick auf eine Zelle öffnet das Paar einzeln mit allen
  Attacken und dem Set-Editor. Gerechnet wird über dasselbe
  `bestMove()`/`ChampionsDamage` wie die Einzelansicht — ein zweiter
  Rechenweg wäre der sichere Weg zu zwei Antworten auf dieselbe Frage.
* ~~**Statusstufen bei Champions** dort erklären, wo „steigt stark" und
  „sinkt drastisch" stehen: +1/+2/+3 sind 150/200/250 %, Maximum +6 =
  400 %; −1/−2/−3 sind 66/50/40 %, Minimum −6 = 25 %.~~
  **Gebaut am 02.09.2026.** Die Tabelle stand seit dem 01.09. im Reiter
  „Statuszustände"; von den Attackentexten aus war sie nicht zu finden.
  Jetzt trägt die Stufenangabe im Text selbst ihren Faktor („by 2 stages
  +2 · 200 %", „stark erhöht +2 · 200 %") und führt per Klick zur ganzen
  Tabelle. Genauigkeit, Fluchtwert und Volltrefferquote bleiben
  ausdrücklich unmarkiert — die folgen laut den Daten einer eigenen,
  flacheren Tabelle, deren Zwischenwerte nicht belegt sind.
* ~~**Showdown-Paste** gegen die 32-Punkte-Skala prüfen, die der
  Limitless-Paste bereits verwendet.~~
  **Erledigt am 01.09.2026** und am 02.09. nachgeprüft: Showdowns
  Champions-Formate rechnen selbst in Statuspunkten (`evLimit = 66`,
  Deckel 32, belegt im Kopf von `js/champions-set.js`). `toShowdownText()`
  und `showdownUeberschuss()` sind ersatzlos entfallen — es gibt nur noch
  EINE Serialisierung für beide Ziele.
* ~~**Alle übrigen Reiter** mit derselben Aufräumbrille durchgehen.~~
  **Erledigt am 02./03.09.2026.** Zwei Prüfagenten über zwölf Reiter,
  34 Befunde; eine dritte Runde über das Ergebnis noch einmal 19,
  darunter drei Regressionen aus dem Reparieren selbst. Zwei Muster
  zogen sich durch und stehen jetzt als Regel im Test, nicht als
  Einzelfall: Formularelemente erben `color` nicht (fünf Stellen
  zwischen 1,10:1 und 1,19:1 im Dunkelmodus), und eine
  Kurzform-Eigenschaft im Mobilblock löscht eine gezielte Angabe aus
  einer anderen Datei (`padding: 9px` nahm der Lupe ihren Platz,
  `min-height: 38px !important` machte aus einem Boden einen Deckel).

## Der Post-Baukasten (`ds-post.js`)

**Was geplant war:** die fünf Bildpainter aus `js/ds-share.js` zu einem
Baukasten mit sieben austauschbaren Körpern zusammenzufassen —
Kartengitter (Staples / Deck / Deck+Tech), Tafel (Meta Call / Day 2 /
Battle Journal), Heatmap-Bild, Archetyp-Karte.

**Warum nicht gebaut:** die drei Vorlagen, die der Auftraggeber benannt
hat (Deck-Analysekarte nach @poke_hive, Decklisten-Darstellung,
Ergebnisbild ohne Foto), sind alle drei gebaut, verdrahtet und am
03.09.2026 einzeln nachgemessen: `deckCardCanvas` 1200×675,
`metaCallPostCanvas` und `staplesPostCanvas` 1080×1350,
`resultCardCanvas` 1080×1080, `postCardCanvas` 1080×1350 — alle
erzeugen ein gefülltes Bild. Die Abnahme aus dem Handbuch ist erfüllt:
jede Quote auf der Karte trägt ihren Nenner (`2.846 Listen`,
`120 / 1.172`, `S/(S+N+U)`, `Antritte mit Top-8-Schnitt 12.590`).

Die „sieben Körper" waren eine Zerlegung des Umbaus, kein zusätzliches
Können. Sie zusammenzulegen ist ein Umbau ohne sichtbaren Gewinn an
einer Stelle, die funktioniert — und das ist genau die Sorte Arbeit,
die diese Datei sonst als Grund zum Weglassen nennt.

**Was gut daran war:** die Beobachtung stimmt. Fünf Painter teilen sich
Kopf, Fuß, Blüten, Logo und Sprite-Fallback bereits über gemeinsame
Funktionen (`malPostKopf`, `malMetaCallFuss`, `malGrund`, `sprite`) —
der Rest ist je Bild verschieden, und das ist er zu Recht.

**Was anders sein müsste, damit es zurückkommt:** ein *sechster* Körper,
der wirklich gebraucht wird. Kandidaten aus dem Handbuch: das
Heatmap-Bild (die Ansicht, die auf dem Telefon heute gar nicht
existiert) und die Day-2-Tafel. Sobald zwei neue Körper anstehen, lohnt
der Baukasten; für den fünften allein lohnt er nicht.

**In derselben Runde trotzdem gemacht:** die Aufräumbrille auf die
Bildkarte selbst. Ohne Präsenzdaten standen dort dreimal „Major: keine
Daten" und einmal „Day 2 (Major): keine Daten" untereinander — vier
Zeilen, die dasselbe sagen, auf einem Bild, das durch Discord wandert.
Jetzt sagt es ein Satz im Fuß.

## Die Zusammenlegungen aus Aufgabe #16 (03.09.2026)

Aufgabe #16 nannte vier Zusammenlegungen: „eine Deck-Analyse-Shell statt
drei kopierter Renderer, eine Matchup-Komponente, ein Builder-Template,
Meta Binder + Custom Binder". Statt sie nacheinander zu bauen, wurde
erst gemessen — Funktionsrümpfe normalisiert (Präfixe `cityLeague` /
`currentMeta` / `pastMeta` und die i18n-Namensräume neutralisiert), dann
blockweise verglichen.

**Gebaut wurde genau eine davon**, und zwar die kleinste:
`filterOverviewCards`, `filterCurrentMetaOverviewCards` und
`filterPastMetaOverviewCards` waren zu 88–95 % wortgleich (3 × 43
normalisierte Zeilen, nur zwei bzw. vier abweichende Stellen). Sie liegen
jetzt als `uebersichtKachelnFiltern` in `js/deck-analysis-shared.js`; die
drei Reiter reichen nur noch ihre Kennungen und ihren Typfilter hinein.
Rund 180 Zeilen weniger.

Mitgenommen wurde dabei ein echter Unterschied: Current Meta versteckte
Kacheln per `card.style.display = 'none'`, die beiden anderen per
`classList.add('d-none')`. Ein Live-Bug war das nicht — auf `.card-item`
liegt in keiner der beiden CSS-Dateien eine `display`-Regel —, aber es
war die einzige Stelle im Projekt, die Kacheln per Inline-Stil versteckt,
und genau dieses Muster steht in `app-city-league.js` (Z. 535 ff.) als
Falle notiert. Jetzt benutzen alle drei die Klasse.

Was in derselben Messung als **schon erledigt** herauskam: Meta Binder
und Custom Binder teilen sich längst 23 von 27 Funktionen über
`window._mbShared`, an 79 Stellen. Es bleiben 4,4 % bzw. 4,7 %
Blockdeckung; der größte verbliebene Paar-Kandidat ist zu 50 % ähnlich.

Und was **ersatzlos wegfällt**, weil die Messung die Annahme nicht
stützt: über sechs Matchup-Dateien (13.657 Zeilen) und drei
Builder-Dateien (12.419 Zeilen) findet die Fenstersuche **null**
gemeinsame Achtzeilen-Blöcke. Auch innerhalb einer Datei sind die vier
Matchup-Renderer verschieden (höchste Paarähnlichkeit 32 %). „Eine
Matchup-Komponente" und „ein Builder-Template" sind aus Aufgabe #16
gestrichen, nicht vertagt.

Zwei Nebenbefunde: `showDeckSections` / `hideDeckSections` in
`deck-analysis-shared.js` hatten seit ihrer Anlage null Aufrufer und sind
entfernt. Und `app-current-meta-analysis.js` parst dasselbe Feld
`total_decks_in_archetype` an zwei Stellen mit zwei verschiedenen Parsern
(`safeParseFloat` im Raster, `parseLocaleNumber` in der Tabelle) —
gemeldet, nicht repariert: welcher richtig ist, hängt vom Zahlenformat
der Quelle ab und braucht eine eigene Messung.

### Die Zusammenlegung von `renderDeckGrid`

**Was geplant war:** `renderCityLeagueDeckGrid` und
`renderCurrentMetaDeckGrid` zu einer Funktion machen. 220 normalisierte
Zeilen sind identisch — der größte Einzelposten der ganzen Messung.

**Warum weg:** die 220 gleichen Zeilen sind 30 Divergenz-Blöcke mit acht
echten Verhaltensunterschieden. City League hat einen Vorrang-Nenner
(`window.currentCityLeagueTotalDecks`), einen Trend-Indikator und die rote
Marke über `_markeZahl`; Current Meta hat den
`__effectiveAvgMap`-Override mit Grundlinie, Pin- und Exclude-Marken, den
Festpreis für Basisenergie und einen eigenen Leerzustand. Sie lesen sogar
verschiedene Prozentfelder (`rawPercentage` gegen `resolvedPercentage`).
Das Ergebnis wäre eine 400-Zeilen-Funktion mit acht Schaltern — mehr
Verzweigung als heute.

Dazu das Risiko: von 31 Dubletten-Kandidaten sind nur 11 überhaupt in
einer Zusicherung genannt. Eine Zusammenlegung, die den Nenner-Vorrang
verliert, würde von **keiner einzigen** Zusicherung bemerkt — der Schaden
landete still im Kartenraster.

**Was anders sein müsste, damit es zurückkommt:** die acht
Verhaltensunterschiede müssten erst einzeln gepinnt sein. Wer die
Zusammenlegung will, schreibt zuerst Zusicherungen für Nenner-Vorrang,
Prozentfeld, Pin-/Exclude-Zeile und Leerzustand je Reiter — dann ist der
Umbau eine Refaktorierung statt eines Blindflugs. **Nicht gelöscht:**
beide Funktionen stehen unverändert da.

### Die Zusammenlegung von `copyDeckOverview`

**Was geplant war:** `copyDeckOverview` und `copyCurrentMetaDeckOverview`
zusammenlegen; 148 normalisierte Zeilen sind gleich.

**Warum weg:** `copyPastMetaDeckOverview` gehört trotz Namensfamilie
nicht dazu — 18 Zeilen, keine Set-Codes, keine Gruppierung, keine
60-Karten-Prüfung. Es bliebe ein Zweierpaar mit rund 150 Zeilen Ersparnis
bei null Zusicherungen auf beiden Seiten.

**Was anders sein müsste, damit es zurückkommt:** eine Zusicherung, die
das Ausgabeformat selbst prüft — nicht die Funktionsnamen. Die gibt es
seit dem 03.09.2026 zum Teil: `tests/unit/test-decklisten-kopf.js` pinnt
den Kopf. Sobald auch Reihenfolge, Gruppierung und die 60-Karten-Meldung
gepinnt sind, ist die Zusammenlegung sicher. **Nicht gelöscht:** beide
Funktionen stehen unverändert da.

**In derselben Runde trotzdem gemacht:** der Vergleich hat einen echten
Fehler ans Licht gebracht. Die beiden Fassungen schrieben verschiedene
Köpfe in die Zwischenablage — City League übersetzte sie, schrieb auf
Deutsch also „Energie: 11", und die Meldung darunter sagt „vor dem Import
nachsehen". An der Quelle nachgesehen (limitlesstcg.com, Deckliste 22076,
„Copy to Clipboard"): derselbe englische Kopf, auch wenn man die Seite
auf Deutsch stellt. Der Kopf gehört zum Austauschformat und wird nicht
lokalisiert.

---

## 05.09.2026 — Der naechtliche Lauf, der nichts geprueft hat

### Die naechtliche Ganzseiten-Suite

**Was:** Der Workflow `Visual Fullpage Coverage`
(`.github/workflows/visual-fullpage.yml`) lief jede Nacht um 03:00 UTC,
installierte Node und Chromium und rief
`tests/e2e/visual-full-page-coverage.spec.js` auf.

**Warum weg:** Die Spec-Datei ist seit dem **22.05.2026 null Byte
gross**. Playwright bricht auf einer Datei ohne Test normalerweise ab —
`--pass-with-no-tests` im Aufrufer hat genau das unterdrückt. Rund 105
Nächte lang setzte der Lauf also einen grünen Haken unter eine Prüfung,
die es nicht gab. Das ist nicht „falsch gerechnet", sondern „gar nicht
gerechnet" — und die grüne Meldung machte es unsichtbar. Der Aufrufer
weigert sich seitdem, auf einer leeren Suite grün zu melden; damit wäre
der cron ab sofort jede Nacht rot, und eine Meldung, an der niemand
etwas tun kann, wird nach drei Nächten ohnehin nicht mehr gelesen. Der
Lauf bleibt von Hand auslösbar.

**Was gut war:** Die Idee dahinter fehlt der Seite wirklich. Die
Schwester-Suite (`visual-regression.spec.js`) vergleicht **Ausschnitte** —
Knopfreihen, ein Dropdown, eine Tabelle — und ihre Pixelvergleiche laufen
ausserdem nur unter Windows (`RUN_PIXEL_SNAPSHOTS = platform === 'win32'`),
weil die Grundbilder auf einem anderen System entstanden sind. Was
niemand prüft, ist die **ganze Seite je Reiter**: rendert das Panel
überhaupt, läuft die Seite seitlich über, ragt etwas aus dem Sichtfeld.
Genau das war am 02.09. und am 04.09.2026 zweimal ein echter Befund.

**Was anders sein müsste, damit es zurückkommt:** Zwei Dinge, und beide
sind am 05.09.2026 beim Versuch aufgelaufen, die Suite eben schnell zu
schreiben:

1. **Ein verlässlicher Weg, einen Reiter anzusteuern.** `window.switchTab`
   ist es nicht: `switchTab('meta-analysis-hub')` verlässt die Seite (danach
   ist `window.switchTab` undefiniert), und ein Aufruf mit `#<tab-id>` in
   der Adresse aktiviert das Panel nicht — gemessen über alle 15
   `.tab-content`-Knoten. Ohne diesen Weg misst die Suite ein Panel, das
   gar nicht offen ist, und meldet „leer" über etwas Funktionierendes.
2. **Eine Konsolenprüfung, die im Bausatz überhaupt möglich ist.** Der
   Sandkasten erreicht keine externen Hosts; jeder Reiter liefert dort
   `ERR_TUNNEL_CONNECTION_FAILED`. Eine Zusicherung „die Konsole bleibt
   still" ist dort nicht prüfbar und müsste die Netzfehler sauber von den
   eigenen trennen — sonst ist sie entweder immer rot oder eine
   Generalamnestie.

Eine Suite ohne diese zwei Punkte wäre schlechter als die leere Datei:
sie sähe nach Prüfung aus und wäre wieder nur eine Behauptung.

