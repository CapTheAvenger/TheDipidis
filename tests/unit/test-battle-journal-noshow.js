/**
 * Ein Sieg, der nichts über das Matchup sagt.
 *
 * URSACHE (26.09.2026, Hausi auf dem Turnier): er hat ein Match
 * gewonnen, weil der Gegner nicht erschienen ist. Für die Turnierbilanz
 * sind das drei Punkte wie bei jedem Sieg. Über das Matchup gegen dieses
 * Deck sagt es **nichts** — es wurde keine Partie gespielt. Das Journal
 * kannte nur `win`/`loss`/`tie`, also gab es keinen Weg, das zu
 * unterscheiden, und jeder No-Show hätte die Siegquote gegen ein Deck
 * verbessert, das gar nicht gespielt hat.
 *
 * DIE GEFAHR sitzt nicht im neuen Wert, sondern in der Form, die an neun
 * Stellen dieser Datei steht:
 *
 *     if (e.result === 'win') w++;
 *     else if (e.result === 'loss') l++;
 *     else t++;                      // <- hier landet alles Neue
 *
 * Ein vierter Ergebniswert fällt dort stillschweigend ins
 * Unentschieden. Diese Datei hält fest, dass jede Auswertung, die etwas
 * über ein MATCHUP aussagt, vorher filtert — und dass die BILANZ ihn
 * weiterhin als Sieg zählt.
 *
 * Geprüft wird das Verhalten: die Funktionen werden aus der Quelle
 * geschnitten und ausgeführt, nicht ihr Text durchsucht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const QUELLE = lies('js/battle-journal.js');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(treffer.index, i + 1);
        }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

// Die vier Helfer zusammen in einen Kontext — sie rufen sich gegenseitig.
function helfer() {
    const teile = ['var NO_SHOW = \'noshow\';'];
    for (const n of ['istNoShow', 'alsSiegGewertet', 'nurGespielte', 'deriveOverallResult']) {
        teile.push(schneideFunktion(QUELLE, n));
    }
    const ctx = { module: {} };
    vm.createContext(ctx);
    vm.runInContext(teile.join('\n'), ctx);
    return ctx;
}

const E = (result, extra) => Object.assign({ result, ownDeck: 'A', opponentArchetype: 'B' }, extra || {});

describe('No-Show: die zwei Fragen', () => {
    const h = helfer();

    it('erkennt den Wert am Eintrag und als blanke Zeichenkette', () => {
        assert.equal(h.istNoShow(E('noshow')), true);
        assert.equal(h.istNoShow('noshow'), true);
        assert.equal(h.istNoShow(E('win')), false);
        assert.equal(h.istNoShow(null), false);
        assert.equal(h.istNoShow({}), false);
    });

    it('zählt in der Bilanz als Sieg — das sind drei Punkte', () => {
        assert.equal(h.alsSiegGewertet('noshow'), true);
        assert.equal(h.alsSiegGewertet('win'), true);
        assert.equal(h.alsSiegGewertet('loss'), false);
        assert.equal(h.alsSiegGewertet('tie'), false);
        assert.equal(h.alsSiegGewertet(''), false);
    });

    it('fällt aus jeder Matchup-Auswertung heraus', () => {
        const liste = [E('win'), E('noshow'), E('loss'), E('noshow'), E('tie')];
        const gespielt = h.nurGespielte(liste);
        assert.equal(gespielt.length, 3, 'zwei No-Shows müssen weg sein');
        assert.ok(!gespielt.some(h.istNoShow));
        // Laenge statt deepEqual: das Array kommt aus dem vm-Kontext und
        // hat dort einen eigenen Array-Prototyp.
        assert.equal(h.nurGespielte(null).length, 0, 'verträgt auch nichts');
        assert.equal(h.nurGespielte(undefined).length, 0);
    });

    it('ein No-Show in irgendeinem Game macht das ganze Match dazu', () => {
        // Es wurde nicht gespielt — dann gibt es auch keine Spiele, die
        // man verrechnen könnte.
        assert.equal(h.deriveOverallResult([{ result: 'noshow' }]).result, 'noshow');
        assert.equal(h.deriveOverallResult(
            [{ result: 'noshow' }, { result: '' }, { result: '' }]).result, 'noshow');
        // und er gewinnt gegen alles andere, was in den Zeilen steht
        assert.equal(h.deriveOverallResult(
            [{ result: 'loss' }, { result: 'noshow' }]).result, 'noshow');
    });

    it('ohne No-Show rechnet die Ableitung wie vorher', () => {
        assert.equal(h.deriveOverallResult([{ result: 'win' }]).result, 'win');
        assert.equal(h.deriveOverallResult(
            [{ result: 'win' }, { result: 'win' }]).result, 'win');
        assert.equal(h.deriveOverallResult(
            [{ result: 'win' }, { result: 'loss' }]).result, 'tie');
        assert.equal(h.deriveOverallResult(
            [{ result: 'loss' }, { result: 'loss' }]).result, 'loss');
        assert.equal(h.deriveOverallResult([]).result, '');
    });
});

describe('No-Show: keine Auswertung rechnet ihn still als Unentschieden', () => {
    const rein = ohneKommentare(QUELLE);

    it('das Ausschneiden der Kommentare hat nicht zu viel entfernt', () => {
        assert.ok(rein.length > QUELLE.length * 0.3,
            'ohne diese Gegenprobe prüfen die Zusagen unten nichts');
    });

    it('die vier Matchup-Ansichten filtern, bevor sie zählen', () => {
        // Sie tragen alle dieselbe `else -> tie`-Form. Wer eine neue
        // hinzufügt und das Filtern vergisst, verfälscht eine Siegquote.
        for (const name of ['_renderMASummary', '_renderMAHeatmap',
                            '_renderMARankings', '_renderMABarList']) {
            const koerper = schneideFunktion(rein, name);
            assert.match(koerper, /nurGespielte\(entries\)/,
                `${name} zählt, ohne die No-Shows herauszunehmen — sie landen `
                + 'im else-Zweig und gelten als Unentschieden.');
        }
    });

    it('getBattleJournalWinRates lässt ihn nicht durch', () => {
        const koerper = schneideFunktion(rein, 'getBattleJournalWinRates');
        assert.match(koerper, /istNoShow\(e\)\s*\)\s*return/,
            'die Siegquoten je Gegner nehmen den No-Show mit');
    });

    it('die Bilanzen zählen ihn als Sieg und weisen ihn getrennt aus', () => {
        const verlauf = schneideFunktion(rein, 'renderJournalHistory');
        assert.match(verlauf, /alsSiegGewertet\(e\.result\)/,
            'Turnier- und Meta-Bilanz müssen ihn als Sieg führen');
        assert.match(verlauf, /nurGespielte\(filtered\)/,
            'die Quote oben darf nur über gespielte Partien laufen');
        const bild = schneideFunktion(rein, 'shareTournamentSummary');
        assert.match(bild, /alsSiegGewertet\(e\.result\)/,
            'das Turnierbild zeigt die Bilanz, dort ist er ein Sieg');
    });
});

describe('No-Show: die Oberfläche kennt ihn', () => {
    const rein = ohneKommentare(QUELLE);
    const html = ohneKommentare(lies('index.html'));
    const i18n = lies('js/i18n.js');

    it('es gibt einen vierten Knopf, in der Eingabe und im Bearbeiten-Fenster', () => {
        // Die Klasse allein genügt nicht — ein Knopf, der anders aussieht
        // aber `tie` setzt, ist der schlimmere Fehler. Geprüft wird
        // deshalb, was er SETZT: Datenwert und Aufruf.
        const eingabe = schneideFunktion(rein, 'renderGameRows');
        assert.match(eingabe, /data-value="noshow"[^>]*setGameChoice\(\$\{i\},'result','noshow'\)/,
            'der vierte Knopf in der Eingabe setzt kein noshow');
        const fenster = schneideFunktion(rein, '_renderEditBo3Games');
        assert.match(fenster, /data-edit-value="noshow"[^>]*setEditGameChoice\(\$\{i\},'result','noshow'\)/,
            'der vierte Knopf im Bearbeiten-Fenster setzt kein noshow');
        for (const koerper of [eingabe, fenster]) {
            assert.match(koerper, /battle-journal-choice-noshow/);
            assert.match(koerper, /battle-journal-choice-group-vier/,
                'ohne die Vierer-Klasse bricht die Knopfreihe um');
        }
    });

    it('die Ergebnisfilter kennen ihn in beiden Menüs', () => {
        const treffer = html.match(/value="noshow"/g) || [];
        assert.equal(treffer.length, 2,
            'Verlaufsfilter und Auswahlfeld im Bearbeiten-Fenster');
    });

    it('beide Sprachen haben die Beschriftung', () => {
        for (const key of ['bj.noshow', 'bj.noshowShort', 'bj.noshowToggleTitle',
                           'bj.noshowHint']) {
            const treffer = i18n.match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g')) || [];
            assert.equal(treffer.length, 2, `${key} fehlt in einer der beiden Sprachen`);
        }
    });

    it('die vier Knöpfe bekommen vier Spalten', () => {
        const css = ohneKommentare(lies('css/styles.css'));
        assert.match(css,
            /\.battle-journal-choice-group-result\.battle-journal-choice-group-vier\s*\{[^}]*repeat\(4,\s*1fr\)/,
            'sonst stehen W/L/T/N in drei Spalten und die vierte fällt in die nächste Zeile');
    });
});
