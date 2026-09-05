/**
 * Was der Bauer nicht unterbringt, muss er sagen.
 *
 * BEFUND 05.09.2026, live gefunden von einem Turnierspieler, der die
 * gebaute Mega-Excadrill-Liste gegen die acht Worlds-Listen hielt:
 *
 *   „Brock's Scouting steht in 5 von 8 Listen mit Ø 2,8 Kopien — und
 *    taucht im Build gar nicht auf."
 *
 * Nachgerechnet stimmte das. Die Tech-Auswahl in
 * js/deck-builder-consistency.js endete mit einem `break`, sobald die
 * Slots voll waren, und hinterliess keine Spur. Der Bericht nannte, was
 * gewaehlt wurde, nie was daneben lag.
 *
 * Dazu kam ein zweiter Fehler in derselben Schleife: bei identischem
 * `weightedShare` entschied die REIHENFOLGE DER CSV-ZEILEN, welche
 * Gruppe zuerst drankam — `Array.prototype.sort` ist stabil, also gewann,
 * wer weiter oben stand. Vier Karten mit exakt 0,625 Anteil bewarben sich
 * um drei Slots, und die Datei entschied.
 *
 * WAS HIER BEWUSST NICHT GEAENDERT WURDE: welche der vier Karten gewinnt.
 * Ausprobiert wurde die Regel „bei gleichem Anteil zaehlen mehr Kopien" —
 * dann kommt Brock's Scouting mit 3 hinein, und dafuer fallen Ultra Ball
 * UND Fezandipiti ex heraus. Fezandipiti ex ist ein BASIS-Pokemon; es
 * wegzulassen hebt die Mulligan-Quote, und die zu senken ist der ganze
 * Zweck dieses Bauers. Welche Karte gehen soll, ist eine Deckbau-Frage
 * und keine Sortierfrage — ein Werkzeug, das sie still beantwortet, hat
 * genau einmal Brock's Scouting verschluckt. Es beantwortet sie jetzt
 * nicht mehr still, sondern legt den Gleichstand offen.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf-8');

const BAU   = lies('js/deck-builder-consistency.js');
const BUILD = lies('js/app-deck-builder.js');
const I18N  = lies('js/i18n.js');
const CSS   = lies('css/ui-components.css');

describe('Die Tech-Auswahl führt Buch', () => {
    it('sammelt, was nicht mehr in die Slots passt', () => {
        assert.match(BAU, /const nichtPlatziert = \[\];/,
            'die Sammelliste fehlt — dann verschwinden die Karten wieder spurlos');
        assert.match(BAU, /decision: 'tech_nicht_platziert'/,
            'kein Spureintrag für die nicht platzierten Karten');
        // Beide Abbruchstellen müssen buchführen: die volle Slotzahl UND
        // der Fall "Gruppe passt nicht ganz".
        const treffer = [...BAU.matchAll(/nichtPlatziert\.push\(/g)];
        assert.strictEqual(treffer.length, 2,
            `nichtPlatziert.push steht ${treffer.length}x, erwartet 2 — eine `
            + 'der beiden Abbruchstellen führt kein Buch');
    });

    it('jeder Eintrag sagt, wie viele Kopien fehlen und warum', () => {
        assert.match(BAU, /wunschAnzahl:/,
            'ohne die Wunschanzahl weiss der Leser nicht, ob eine oder drei '
            + 'Kopien fehlen — das ist der Unterschied zwischen Randslot und '
            + 'Suchlinie');
        assert.match(BAU, /grund: `braucht \$\{cnt\}, frei sind noch/,
            'der knappe Fall nennt nicht, wie knapp er war');
    });

    it('der Gleichstand wird benannt, mit beiden Seiten', () => {
        assert.match(BAU, /decision: 'tech_gleichstand'/,
            'ein Gleichstand, der nicht protokolliert wird, sieht aus wie eine '
            + 'Wertung');
        assert.match(BAU, /drin,\s*raus/,
            'der Eintrag nennt nicht beide Seiten — nur zu wissen, wer '
            + 'draussen ist, erklärt nichts');
    });

    it('die Reihenfolge bei Gleichstand ist ausdrücklich, nicht zufällig', () => {
        assert.match(BAU, /\.map\(\(g, i\) => \(\{ \.\.\.g, _idx: i \}\)\)/,
            'der Index wird nicht mehr mitgeführt');
        assert.match(BAU, /\(b\.score - a\.score\) \|\| \(a\._idx - b\._idx\)/,
            'die Sortierung verlässt sich wieder auf die Stabilität von sort() '
            + '— das ist dieselbe unbenannte Regel wie vorher, nur unsichtbar');
    });
});

describe('Der Bericht zeigt es dem Spieler', () => {
    it('die Spur landet im Bericht', () => {
        assert.match(BUILD, /near_misses: \(result\.trace \|\| \[\]\)/,
            'die nicht platzierten Karten erreichen den Bericht nicht');
        assert.match(BUILD, /gleichstaende: \(result\.trace \|\| \[\]\)/,
            'die Gleichstände erreichen den Bericht nicht');
    });

    it('der "Warum?"-Dialog rendert sie', () => {
        assert.match(BUILD, /build-info-near-misses/,
            'kein Abschnitt im Dialog — dann steht die Information nur in '
            + 'der Konsole, und dort liest sie kein Spieler');
        assert.match(BUILD, /nearMisses\.slice\(0, 5\)/,
            'entweder gar keine Begrenzung oder eine andere — die Liste hat '
            + 'einen langen Schwanz mit Anteilen um 12 %, den niemand liest');
        assert.match(BUILD, /build-info-gleichstand/,
            'der Gleichstand wird nicht gerendert');
    });

    it('die Texte stehen in beiden Sprachen', () => {
        for (const k of ['buildInfo.nearMissTitle', 'buildInfo.nearMissIntro']) {
            const n = [...I18N.matchAll(new RegExp("'" + k.replace('.', '\\.') + "':", 'g'))].length;
            assert.strictEqual(n, 2, `${k} steht ${n}x in i18n.js, erwartet 2`);
        }
    });

    it('der neue Kasten sieht nicht aus wie eine Empfehlung', () => {
        /* Daneben steht "Alternative Anzahl basierend auf Performance" in
           Gold — das IST ein Ratschlag. Dieser Kasten ist eine Offenlegung.
           Zwei verschiedene Aussagen dürfen nicht gleich aussehen. */
        assert.match(CSS, /\.build-info-near-misses \{[^}]*background: rgba\(70, 110, 180/,
            'der neue Kasten hat nicht seinen eigenen Ton');
        assert.match(CSS, /\.build-info-near-misses h4 \{[^}]*color: #7fa8dd/,
            'die Überschrift trägt die Farbe des Ratschlags daneben');
    });
});

describe('Die Regel steht als Begründung im Quelltext', () => {
    it('der Befund und der verworfene Gegenentwurf sind festgehalten', () => {
        assert.match(BAU, /Brock's Scouting/,
            'der Befund, der das ausgelöst hat, ist nicht dokumentiert');
        assert.match(BAU, /Fezandipiti ex ist ein BASIS-Pokemon/,
            'warum die naheliegende Regel "mehr Kopien gewinnen" NICHT '
            + 'genommen wurde, steht nirgends — dann probiert es der '
            + 'nächste wieder aus und wundert sich');
        assert.match(BAU, /ist eine Deckbau-Frage und[\s\S]{0,20}keine Sortierfrage/,
            'die Begründung fehlt');
    });
});
