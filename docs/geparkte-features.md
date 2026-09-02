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
* **Statusstufen bei Champions** dort erklären, wo „steigt stark" und
  „sinkt drastisch" stehen: +1/+2/+3 sind 150/200/250 %, Maximum +6 =
  400 %; −1/−2/−3 sind 66/50/40 %, Minimum −6 = 25 %.
* **Showdown-Paste** gegen die 32-Punkte-Skala prüfen, die der
  Limitless-Paste bereits verwendet.
* **Alle übrigen Reiter** mit derselben Aufräumbrille durchgehen.
