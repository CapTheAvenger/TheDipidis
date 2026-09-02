/**
 * Drei Spalten standen auf Strich — zwei zu Recht, eine aus Versehen.
 *
 * Gemeldet am 02.09.2026, mit Bild: in der Meta-Performance-Tabelle war
 * unter "Tournament entries", "Top 8" UND "vs. average" in JEDER Zeile
 * nur ein Gedankenstrich. Dazu die Frage:
 *
 *   "Wenn die Zahlen da leer sind brauchen wir die Spalten denn ueberhaupt?"
 *
 * ZWEI VERSCHIEDENE URSACHEN.
 *
 * (1) "Turnier-Antritte" und "Top 8" sind leer, WEIL die Datei die
 *     gezaehlten Starts noch nicht fuehrt. Am 01.09. wurde beschlossen,
 *     dort lieber nichts als die gewichtete Summe zu zeigen ("halb
 *     teilnehmen geht nicht"). Das war richtig — aber eine Spalte, die in
 *     allen 138 Zeilen schweigt, ist keine Information, sondern Breite.
 *     Also faellt sie weg, solange sie nichts zu sagen hat, und kommt
 *     zurueck, sobald eine einzige Zeile eine gezaehlte Zahl traegt.
 *
 * (2) "ggue. Schnitt" war leer aus einem Fehler von mir. Dieselbe
 *     Variable, die auf null gesetzt wurde, um die halbe Zahl von der
 *     ANZEIGE fernzuhalten, trug auch die STATISTISCHEN SCHWELLEN:
 *
 *         if (!(r.antritte >= CONV_MIN_N)) return '-';
 *         duenn: !(antritte >= CONV_THIN_N)
 *
 *     `null >= 20` ist false. Also schwieg der Faktor bei jedem Deck, und
 *     jede Zeile galt als duenn und wurde blass gezeichnet. Anzeige und
 *     Schwelle sind zwei Fragen: was auf dem Schirm steht, muss gezaehlt
 *     sein; ob die Stichprobe traegt, entscheidet der gewichtete Wert.
 *
 * Die Pruefungen unten fuehren den ausgelieferten Ausdruck wirklich aus
 * (er wird aus der Datei geschnitten und mit new Function gebaut), statt
 * nur nach Text zu suchen. Ein Text kann richtig aussehen und falsch
 * rechnen — genau das war hier der Fall.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(ROOT, 'js/app-tier-meta.js'), 'utf8');
const OHNE_KOMMENTAR = QUELLE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

/** Schneidet den Filter aus der Datei und macht ihn ausfuehrbar. */
function filterAusQuelle() {
    const m = OHNE_KOMMENTAR.match(
        /const hatWert = ([\s\S]*?);\s*const SPALTEN_SICHTBAR = ([\s\S]*?);\s*\n/);
    assert.ok(m, 'hatWert/SPALTEN_SICHTBAR nicht mehr in js/app-tier-meta.js gefunden');
    return new Function('SPALTEN', 'reihen',
        'const hatWert = ' + m[1] + ';'
        + 'const SPALTEN_SICHTBAR = ' + m[2] + ';'
        + 'return SPALTEN_SICHTBAR.map(c => c.k);');
}

/** Schneidet die Faktor-Schwelle aus der Datei und macht sie ausfuehrbar. */
function faktorSchwelleAusQuelle() {
    const m = OHNE_KOMMENTAR.match(/if \(!\((r\.[A-Za-z]+) >= CONV_MIN_N\)\)/);
    assert.ok(m, 'die Faktor-Schwelle steht nicht mehr in js/app-tier-meta.js');
    return new Function('r', 'CONV_MIN_N',
        'return !(' + m[1] + ' >= CONV_MIN_N);');
}

/** Schneidet die duenn-Schwelle aus der Datei und macht sie ausfuehrbar. */
function duennSchwelleAusQuelle() {
    const m = OHNE_KOMMENTAR.match(/duenn: !\(([A-Za-z]+) >= CONV_THIN_N\)/);
    assert.ok(m, 'die duenn-Schwelle steht nicht mehr in js/app-tier-meta.js');
    return new Function('antritte', 'antritteGew', 'CONV_THIN_N',
        'return !(' + m[1] + ' >= CONV_THIN_N);');
}

const SPALTEN_STUB = [
    { k: 'name' }, { k: 'listen' }, { k: 'anteil' }, { k: 'wr' },
    { k: 'antritte' }, { k: 'cuts' }, { k: 'quote' }, { k: 'faktor' },
];

describe('Leere Spalten fallen weg, Schwellen rechnen weiter', () => {

    it('ohne gezaehlte Starts verschwinden genau zwei Spalten', () => {
        const sichtbar = filterAusQuelle()(SPALTEN_STUB, [
            { antritte: null, cuts: null, listen: 2849, quote: 3.0, faktor: 0.8 },
            { antritte: null, cuts: null, listen: 2754, quote: 11.1, faktor: 1.7 },
        ]);
        assert.deepEqual(sichtbar,
            ['name', 'listen', 'anteil', 'wr', 'quote', 'faktor'],
            'die leeren Spalten stehen wieder in der Tabelle');
    });

    it('die Quote und der Faktor bleiben stehen — die brauchen keine Zaehlung', () => {
        const sichtbar = filterAusQuelle()(SPALTEN_STUB, [
            { antritte: null, cuts: null, quote: 3.0, faktor: 0.8 },
        ]);
        assert.ok(sichtbar.includes('quote'), 'Top-8-Quote ist mit weggefallen');
        assert.ok(sichtbar.includes('faktor'), 'ggue. Schnitt ist mit weggefallen');
    });

    it('EINE gezaehlte Zeile holt beide Spalten zurueck', () => {
        const sichtbar = filterAusQuelle()(SPALTEN_STUB, [
            { antritte: null, cuts: null },
            { antritte: null, cuts: null },
            { antritte: 641, cuts: 71 },
        ]);
        assert.ok(sichtbar.includes('antritte'),
            'die Spalte kommt nach dem Wochenlauf nicht zurueck');
        assert.ok(sichtbar.includes('cuts'),
            'die Top-8-Spalte kommt nach dem Wochenlauf nicht zurueck');
    });

    it('eine Zeile mit 0 ist eine Aussage und zaehlt als Wert', () => {
        const sichtbar = filterAusQuelle()(SPALTEN_STUB, [
            { antritte: null, cuts: null },
            { antritte: 12, cuts: 0 },
        ]);
        assert.ok(sichtbar.includes('cuts'),
            '"null Cuts" wurde als "kein Wert" gelesen — 0 ist aber ein Ergebnis');
    });

    it('der Faktor haengt am gewichteten Wert, nicht an der Anzeige', () => {
        const schweigt = faktorSchwelleAusQuelle();
        // Genau der ausgelieferte Zustand: keine gezaehlte Zahl da,
        // aber 640,5 gewichtete Antritte — weit ueber der Schwelle.
        assert.equal(schweigt({ antritte: null, antritteGew: 640.5 }, 20), false,
            'der Faktor schweigt wieder, obwohl die Stichprobe traegt');
        // Und er schweigt weiterhin, wo die Stichprobe wirklich zu klein ist.
        assert.equal(schweigt({ antritte: null, antritteGew: 4 }, 20), true,
            'der Faktor redet jetzt auch bei vier Antritten');
        assert.equal(schweigt({ antritte: null, antritteGew: null }, 20), true,
            'ohne jeden Wert muss der Faktor schweigen');
    });

    it('duenn haengt am gewichteten Wert, nicht an der Anzeige', () => {
        const istDuenn = duennSchwelleAusQuelle();
        assert.equal(istDuenn(null, 640.5, 50), false,
            'jede Zeile wird wieder blass gezeichnet');
        assert.equal(istDuenn(null, 8, 50), true,
            'eine Zeile mit acht Antritten gilt nicht mehr als duenn');
    });

    it('die Anzeige zeigt die gezaehlte Zahl, die Schwelle die gewichtete', () => {
        assert.match(OHNE_KOMMENTAR, /const antritte = t \? t\.broughtAnzeige : null;/,
            'die Anzeige nimmt wieder die gewichtete Summe');
        assert.match(OHNE_KOMMENTAR, /const antritteGew = t \? t\.brought : null;/,
            'die Schwelle nimmt wieder den Anzeigewert');
    });

    it('der Einleitungstext nennt keine Spalte, die nicht da ist', () => {
        /* Der Text stand fest verdrahtet und versprach vier Spalten,
           von denen zwei fehlten. Wer "Turnier-Antritte" liest und keine
           findet, sucht den Fehler bei sich. */
        assert.match(OHNE_KOMMENTAR, /const zaehlungDa = hatWert\('antritte'\);/,
            'der Hinweistext haengt nicht mehr davon ab, was die Tabelle zeigt');
        // Und er muss sagen, dass die Zahlen noch kommen.
        /* Nicht nur "kommen mit dem naechsten Datenlauf" suchen: derselbe
           Satz steht auch im Tooltip der Spalte. Gepruft wird der Halbsatz,
           der NUR im Einleitungstext steht — sonst bleibt die Zusicherung
           gruen, wenn der Einleitungstext den Hinweis verliert. */
        assert.match(OHNE_KOMMENTAR,
            /kommen mit dem nächsten Datenlauf; die Quoten stimmen schon jetzt\./,
            'der Einleitungstext sagt nicht, dass die Zahlen noch kommen — dann '
            + 'sieht es aus, als gaebe es sie nie');
        assert.match(OHNE_KOMMENTAR, /They arrive with the next data run/,
            'der englische Text sagt nicht, dass die Zahlen noch kommen');
    });

    it('Kopf und Koerper zeichnen dieselbe Spaltenliste', () => {
        const kopf = OHNE_KOMMENTAR.match(/const kopfZellen = ([A-Z_]+)\.map/);
        const koerper = OHNE_KOMMENTAR.match(/\$\{([A-Z_]+)\.map\(c => `<td/);
        assert.ok(kopf && koerper, 'Kopf oder Koerper nicht gefunden');
        assert.equal(kopf[1], 'SPALTEN_SICHTBAR',
            'die Ueberschriften kommen aus der ungefilterten Liste — '
            + 'dann steht ueber jeder Zelle die falsche Spalte');
        assert.equal(koerper[1], 'SPALTEN_SICHTBAR',
            'die Zellen kommen aus der ungefilterten Liste — '
            + 'dann hat der Koerper mehr Spalten als der Kopf');
        assert.equal(kopf[1], koerper[1]);
    });
});
