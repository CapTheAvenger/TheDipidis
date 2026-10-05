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

    it('die Seite zählt ihn überall gleich: getrennt, nie als Sieg (FE-61)', () => {
        /* FE-61 (T3-09, 05.10.2026): Kopf, Turniergruppe und Meta-Ordner
           zeigten drei Zählweisen (Kopf ohne, Gruppe als Sieg UND als N).
           Jetzt EINE: W = gespielte Siege, No-Show als eigene Zahl. Nur die
           Bilder zeigen die Turnierbilanz wie die Turnierleitung. */
        const verlauf = schneideFunktion(rein, 'renderJournalHistory');
        assert.doesNotMatch(verlauf, /alsSiegGewertet\(e\.result\)/,
            'Turnier- und Meta-Zeile dürfen ihn nicht als Sieg führen');
        assert.match(verlauf, /const tW = entries\.filter\(e => e\.result === 'win'\)/);
        assert.match(verlauf, /const mW = metaEntries\.filter\(e => e\.result === 'win'\)/);
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

    it('der Schalter steht VOR dem Gegnerfeld-Zwang, nicht in einer Game-Zeile', () => {
        // Der erste Anlauf haengte den No-Show an eine Game-Zeile. Das
        // Formular verlangt aber einen Gegner-Archetyp, und den gibt es
        // nicht, wenn niemand erschienen ist — der Eintrag liess sich
        // nicht speichern. Der Schalter gehoert an den Match.
        assert.match(html, /id="battleJournalNoShowBtn"[\s\S]{0,200}onclick="toggleNoShow\(\)"/,
            'der No-Show-Schalter fehlt im Formular');
        assert.match(html, /id="battleJournalNoShow"[^>]*type="hidden"/,
            'ohne das versteckte Feld überlebt der Zustand keinen Entwurf');
        const vorGegner = html.indexOf('id="battleJournalNoShowBtn"');
        const bestOf = html.indexOf('id="battleJournalBestOfRow"');
        assert.ok(vorGegner > -1 && bestOf > vorGegner,
            'der Schalter muss über „Best of" stehen — er blendet es aus');
    });

    it('es gibt nur EINEN Weg: kein No-Show mehr in den Game-Zeilen', () => {
        // Zwei Wege, dasselbe zu sagen, sind ein Fehler in Wartestellung:
        // der Weg über die Game-Zeile liesse sich nicht speichern.
        assert.ok(!/battle-journal-choice-noshow/.test(rein),
            'in den Game-Zeilen steht wieder ein No-Show-Knopf');
        const eingabe = schneideFunktion(rein, 'renderGameRows');
        assert.ok(!/noshow/.test(eingabe),
            'renderGameRows kennt den No-Show wieder');
    });

    it('die Prüfung verlangt keinen Gegner, wenn niemand erschienen ist', () => {
        const pruef = schneideFunktion(rein, 'validateBattleJournalEntry');
        assert.match(pruef, /values\.result === NO_SHOW\)\s*return true/,
            'ohne diesen Ausstieg kann Hausi den Eintrag nicht speichern — '
            + 'genau der Befund vom 26.09.');
        const ausstieg = pruef.indexOf('NO_SHOW');
        const gegnerZwang = pruef.indexOf('validationOpponent');
        assert.ok(ausstieg > -1 && ausstieg < gegnerZwang,
            'der Ausstieg muss VOR der Gegnerprüfung stehen');
    });

    it('ein No-Show speichert nichts, was niemand beobachtet hat', () => {
        const werte = schneideFunktion(rein, 'getBattleJournalFormValues');
        assert.match(werte, /opponentArchetype: nichtErschienen \? ''/,
            'ein Gegnerdeck, das niemand gesehen hat, darf nicht gespeichert werden');
        assert.match(werte, /bestOf: nichtErschienen \? ''/,
            'ohne Partie gibt es kein Best of');
        assert.match(werte, /games = nichtErschienen \? \[\]/,
            'ohne Partie gibt es keine Spiele');
        assert.match(werte, /result: NO_SHOW/);
    });

    it('das Bearbeiten-Fenster lässt den Gegner ebenfalls leer', () => {
        const speichern = schneideFunktion(rein, 'saveEditEntry');
        // Die Variable allein genuegt nicht — sie muss die Bedingung auch
        // entschaerfen. Sonst steht sie da und wirkt nicht.
        assert.match(speichern, /\(!newOpponent && !bleibtNoShow\)/,
            'im Bearbeiten-Fenster greift sonst wieder der Gegnerzwang');
        assert.match(html, /value="noshow"/,
            'das Auswahlfeld im Bearbeiten-Fenster kennt den Wert nicht');
    });

    it('ohne Partie zeigt die Zeile weder BO noch Zugreihenfolge', () => {
        const treffer = rein.match(/istNoShow\(entry\) \? '\\u2013'/g) || [];
        assert.ok(treffer.length >= 2,
            'BO1/1st würde eine Partie behaupten, die es nicht gab');
    });

    it('die Ergebnisfilter kennen ihn in beiden Menüs', () => {
        const treffer = html.match(/value="noshow"/g) || [];
        assert.equal(treffer.length, 2,
            'Verlaufsfilter und Auswahlfeld im Bearbeiten-Fenster');
    });

    it('beide Sprachen haben alle Beschriftungen', () => {
        for (const key of ['bj.noshow', 'bj.noshowShort', 'bj.noshowHint',
                           'bj.noshowButton', 'bj.noshowButtonHint']) {
            const treffer = i18n.match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g')) || [];
            assert.equal(treffer.length, 2, `${key} fehlt in einer der beiden Sprachen`);
        }
    });

    it('der Schalter hat eine eigene Fläche, die den Zustand zeigt', () => {
        const css = ohneKommentare(lies('css/styles.css'));
        assert.match(css, /\.bj-noshow-btn\s*\{[^}]*var\(--surface-1\)/,
            'der Schalter faerbt nicht über Tokens — im Dunkelmodus wäre er weiss');
        assert.match(css, /\.bj-noshow-btn\.is-active\s*\{/,
            'ohne eingeschalteten Zustand sieht man nicht, dass er an ist');
    });
});

/**
 * BEFUND 26.09.2026 — gefunden hat es der Betreiber, nicht ein Test.
 *
 * Nach PR #841/#842 war der No-Show im Formular, in der Bilanz und in
 * den Matchups richtig. Er war es nicht in den BILDERN, und von denen
 * gibt es vier: shareTournamentSummary() hier und drei in js/ds-share.js.
 * Dazu kam die Turnierzeile im Ordner, deren Quote den No-Show im Zähler
 * führte.
 *
 * Die Lehre steht in claude/no-show-battle-journal-2026-09-26.md: ein
 * neuer Ergebniswert ist nicht fertig, wenn die Eingabe geht — er ist
 * fertig, wenn jede Stelle, die Ergebnisse ZÄHLT oder ZEICHNET, ihn
 * kennt. Und davon gibt es mehr als eine.
 */
describe('No-Show: die Quote bleibt gespielten Partien vorbehalten', () => {
    const rein = ohneKommentare(lies('js/battle-journal.js'));

    /* DA-47/FE-61 (05.10.2026): tW zaehlt nur gespielte Siege, die Quote
       ist S/(S+N) aus bjQuote (ausgefuehrt in test-da47-journal-quote.js). */
    it('die Turnierzeile rechnet die Quote ohne den No-Show', () => {
        assert.match(rein, /const tWinRate = bjQuoteText\(tW, tL\);/,
            'die Turnierzeile rechnet die Quote nicht mehr ueber bjQuote');
        assert.doesNotMatch(rein, /tW - tN|tTotal\)/,
            'der No-Show steht wieder in einem der beiden Brueche');
    });

    it('die Turnierzeile weist den No-Show neben der Bilanz aus', () => {
        assert.match(rein, /\$\{tN > 0 \? ` \\u00b7 \$\{tN\} \$\{escapeHtml\(battleJournalText\('bj\.noshow', 'No-Show'\)\)\}` : ''\}/,
            'ohne Ausweis haelt der Leser die Siegzahl fuer gespielte Siege');
    });

    it('das Journal-Turnierbild rechnet die Quote ohne den No-Show', () => {
        assert.match(rein, /const _bildQ = bjQuote\(wins - noShows, losses\);/,
            'das Bild trennt gespielte Partien nicht ab');
    });

    it('das Journal-Turnierbild schreibt No-Show aus, nicht als N', () => {
        // Unter der Bilanzzeile steht die Formel S / (S + N + U). Dort
        // ist N die Niederlage — ein blankes N waere zweideutig.
        assert.match(rein, /\$\{noShows\}\\u00d7 No-Show/,
            'die Bilanzzeile des Bildes benennt den No-Show nicht');
    });

    it('kein Zeichner in js/ds-share.js deutet ein Matchergebnis selbst', () => {
        // Genau das war der Fehler: drei Zeichner, jeder mit eigener
        // Kette, und `noshow` fiel in allen drei durchs `else`. Ab jetzt
        // gibt es vier Funktionen (rundenZeichen, rundenFarbe,
        // rundenRahmen, rundenPunkte) und niemand sonst fragt m.result
        // nach einem Wert. Der Riegel gilt gegen die VIERTE Kopie.
        const share = ohneKommentare(lies('js/ds-share.js'));
        // (?<![\w$]): `gm.result` in der BO3-Spieleliste ist etwas
        // anderes — das sind EINZELSPIELE, und ein einzelnes Spiel kann
        // kein No-Show sein (der Schalter sitzt am Match, PR #842).
        const ketten = share.match(/(?<![\w$])m\.result === '[a-z]+'/g) || [];
        assert.equal(ketten.length, 0,
            `${ketten.length} eigene Ergebnisdeutung(en) in js/ds-share.js: `
            + `${(ketten || []).join(', ')} — dort faellt der naechste `
            + 'neue Wert wieder durchs else');
    });
});
