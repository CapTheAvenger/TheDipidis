/**
 * Die sechs Befunde der Live-Pruefung von Meta Call am 07.09.2026.
 *
 * Alle sechs waren im Browser auf thedipidis.app sichtbar und in keiner
 * Zusicherung. Was sie verbindet: die Seite tat jeweils etwas anderes
 * als das, was auf ihr stand — und schwieg dazu.
 *
 *   M1  Quellen-Umschalter ohne Wirkung. Der Knopf "Vergangenes Meta"
 *       ruft _setMetaSource('past') OHNE Format-Schluessel; die Funktion
 *       leerte daraufhin die Feldtabelle (51 Zeilen -> 0), statt ein
 *       Meta zu zeigen. Und im eingefrorenen Past-Meta blendete
 *       renderAll die ganze Konfigurationskachel aus — samt dem Weg
 *       zurueck.
 *   M2  Zahleneingaben klemmten nicht. Spielerzahl 1 und 10000,
 *       Day-2-Punkte 99: alle drei blieben stehen, die Feldtabelle
 *       rechnete mit 10000 weiter ("Dragapult 1.476 Spieler").
 *   M3  Geleerte Schaetzung wurde nicht zurueckgenommen. Ursache war
 *       nicht die Rechnung, sondern der Fokus: refreshResults tauscht
 *       den ganzen <tbody> und riss das Eingabefeld unter dem Cursor
 *       weg (activeElement ging von INPUT auf BODY). Die folgenden
 *       Backspaces kamen nie an.
 *   M4  "Mein Deck" und der Brick-Filter ohne sichtbare Wirkung. Beide
 *       arbeiten — aber nur bei exaktem Deck-Treffer bzw. nur mit
 *       Journalpartien. Ohne Auskunft ist das von kaputt nicht zu
 *       unterscheiden.
 *   M5  Day-2-Bild. Die Funktion ist vollstaendig; ihr Knopf steht in
 *       der Ergebniskachel, die es ohne gewaehltes Deck nicht gibt.
 *       Der Abbruch war stumm.
 *   M6  Das Szenario des Betreibers (26.09.2026 Frankfurt, TEF-PBL,
 *       ~2.700 Spieler, Mega Excadrill, Ziel Day 2) muss eingebbar sein
 *       UND die Prognose muss ihre Stichprobe anschreiben.
 *
 * Die Datei prueft VERHALTEN: die betroffenen Funktionen werden aus der
 * Quelle geschnitten und mit Attrappen ausgefuehrt. Nur dort, wo das
 * Verhalten selbst eine Template-Zeile IST (welcher Baustein in
 * renderAll steht, welches Attribut am Eingabefeld haengt), wird die
 * Zeile geprueft — dort ist sie das Verhalten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

/* Schneidet von `von` bis EINSCHLIESSLICH `bis`. */
function schnitt(von, bis, ab) {
    const a = SRC.indexOf(von, ab || 0);
    assert.ok(a > -1, `Schnittanfang nicht gefunden: ${von}`);
    const b = SRC.indexOf(bis, a + von.length);
    assert.ok(b > a, `Schnittende nicht gefunden: ${bis}`);
    return SRC.slice(a, b + bis.length);
}

/* Schneidet von `von` bis AUSSCHLIESSLICH `bis`. */
function schnittOhne(von, bis, ab) {
    const a = SRC.indexOf(von, ab || 0);
    assert.ok(a > -1, `Schnittanfang nicht gefunden: ${von}`);
    const b = SRC.indexOf(bis, a + von.length);
    assert.ok(b > a, `Schnittende nicht gefunden: ${bis}`);
    return SRC.slice(a, b);
}

/* Schneidet eine ganze Funktion ueber Klammernzaehlung — robuster als
   ein Endmarker, wenn im Rumpf geschachtelte Bloecke stehen. */
function funktion(kopf) {
    const a = SRC.indexOf(kopf);
    assert.ok(a > -1, `Funktion nicht gefunden: ${kopf}`);
    let i = SRC.indexOf('{', a), tiefe = 0, ende = -1;
    for (; i < SRC.length; i++) {
        if (SRC[i] === '{') tiefe++;
        else if (SRC[i] === '}') { tiefe--; if (tiefe === 0) { ende = i; break; } }
    }
    assert.ok(ende > a, `Funktionsende nicht gefunden: ${kopf}`);
    return SRC.slice(a, ende + 1);
}

/* Deutsche Tausenderpunkte — dieselbe Rolle wie window.zahlLokal. */
const zahlLokal = (n) => new Intl.NumberFormat('de-DE').format(n);

// ───────────────────────────────────────────────────────────────────
// M1 — der Quellen-Umschalter
// ───────────────────────────────────────────────────────────────────
describe('M1 — "Vergangenes Meta" waehlt ein Format, statt die Tabelle zu leeren', () => {
    /* Baut den Kopf von _setMetaSource nach: alles bis zu der Zeile, die
       bei Gleichstand abbricht. Genau dort steht die Entscheidung, um
       die es geht. */
    function baueKopf() {
        const roh = schnittOhne(
            'async function _setMetaSource(source, formatKey) {',
            'if (nextSource === _metaSource && nextKey === _pastMetaFormatKey) return;');
        const rumpf = roh.replace('async function _setMetaSource(source, formatKey) {', '');
        return new Function('source', 'formatKey', '_pastMetaFormatKey', '_pastMetaAvailableFormats',
            rumpf + '\nreturn { nextSource: nextSource, nextKey: nextKey };');
    }

    const KATALOG = [
        { key: 'TEF-CRI', maxDate: '2026-07-20' },
        { key: 'TEF-POR', maxDate: '2026-05-11' },
        { key: 'SVI-JTG', maxDate: '2026-02-02' },
    ];

    it('Pillenklick ohne Schluessel nimmt das juengste verfuegbare Format', () => {
        const kopf = baueKopf();
        const r = kopf('past', undefined, null, KATALOG);
        assert.equal(r.nextSource, 'past');
        assert.equal(r.nextKey, 'TEF-CRI',
            'ohne Rueckfall bleibt nextKey null — genau der Zustand, der die Feldtabelle leerte');
    });

    it('ein bereits gewaehltes Format bleibt beim Pillenklick stehen', () => {
        const kopf = baueKopf();
        assert.equal(kopf('past', undefined, 'SVI-JTG', KATALOG).nextKey, 'SVI-JTG');
    });

    it('das Auswahlfeld darf weiterhin ausdruecklich abwaehlen (leerer String)', () => {
        const kopf = baueKopf();
        // Das <select> uebergibt this.value — auch den leeren String.
        // Der Rueckfall darf diese Wahl NICHT ueberschreiben.
        assert.equal(kopf('past', '', 'TEF-POR', KATALOG).nextKey, 'TEF-POR');
        assert.equal(kopf('past', '', null, KATALOG).nextKey, null);
    });

    it('ein ausdruecklich uebergebenes Format schlaegt den Rueckfall', () => {
        const kopf = baueKopf();
        assert.equal(kopf('past', 'SVI-JTG', null, KATALOG).nextKey, 'SVI-JTG');
    });

    it('ohne Katalog bleibt es beim bisherigen Verhalten', () => {
        const kopf = baueKopf();
        assert.equal(kopf('past', undefined, null, []).nextKey, null);
    });

    it('ein Fehler beim Neuzeichnen wird gemeldet, nicht geschluckt', () => {
        /* Ein leerer catch-Zweig macht einen fehlgeschlagenen Umschalter
           von einem wirkungslosen Knopf ununterscheidbar: Markierung
           steht, Tabelle steht, Konsole schweigt. Genau so sah der
           Befund M1 aus. */
        const ganz = funktion('async function _setMetaSource(source, formatKey) {');
        const catchZweige = ganz.match(/catch\s*\(\s*_?e\s*\)\s*\{[^}]*\}/g) || [];
        const stumme = catchZweige.filter(z => !/console\.(error|warn)/.test(z));
        assert.deepEqual(stumme, [],
            'in _setMetaSource steht wieder ein catch-Zweig ohne Meldung');
        assert.ok(ganz.includes('renderAll nach Quellenwechsel fehlgeschlagen'),
            'der Fehler beim Neuzeichnen muss benannt werden');
    });

    it('Current Meta traegt nie einen Format-Schluessel', () => {
        const kopf = baueKopf();
        const r = kopf('current', undefined, 'TEF-CRI', KATALOG);
        assert.equal(r.nextSource, 'current');
        assert.equal(r.nextKey, null);
    });
});

describe('M1 — im eingefrorenen Past-Meta bleibt der Weg zurueck stehen', () => {
    it('renderAll setzt dort die Quellenkachel, nicht den leeren String', () => {
        assert.ok(
            SRC.includes("${_inFrozenPastMode() ? _renderFrozenSourceOnlyPanel() : _renderCombinedConfigPanel(dateBanner)}"),
            'renderAll blendet die Konfigurationskachel im eingefrorenen Blick wieder komplett aus — '
            + 'dann gibt es keine Pille "Current Meta" mehr und kein Zurueck ohne Neuladen');
    });

    it('_renderFrozenSourceOnlyPanel liefert die Quellenzeile in einer Kachel', () => {
        const quelle = funktion('function _renderFrozenSourceOnlyPanel() {');
        const fn = new Function('renderMetaSourcePanel',
            quelle + '\nreturn _renderFrozenSourceOnlyPanel;')(() => '<div id="QUELLENZEILE"></div>');
        const html = fn();
        assert.match(html, /QUELLENZEILE/);
        assert.match(html, /metacall-panel/);
    });

    it('ohne Past-Meta-Katalog bleibt die Kachel leer statt eine leere Huelle zu zeigen', () => {
        const quelle = funktion('function _renderFrozenSourceOnlyPanel() {');
        const fn = new Function('renderMetaSourcePanel',
            quelle + '\nreturn _renderFrozenSourceOnlyPanel;')(() => '');
        assert.equal(fn(), '');
    });

    it('Modus und Datenquellen bleiben im eingefrorenen Blick weiterhin aus', () => {
        // Das war Absicht und bleibt Absicht — nur die QUELLE kehrt zurueck.
        const quelle = funktion('function _renderFrozenSourceOnlyPanel() {');
        assert.ok(!quelle.includes('renderMetaCallModePanel'));
        assert.ok(!quelle.includes('renderSourcesPanel'));
    });
});

// ───────────────────────────────────────────────────────────────────
// M2 — die Zahleneingaben klemmen
// ───────────────────────────────────────────────────────────────────
describe('M2 — Spielerzahl, Runden und Punkteziel werden geklemmt', () => {
    function baueKlemme(settings) {
        const quelle = schnitt('const SETTING_GRENZEN = {', '};')
            + '\n' + funktion('function _klemmeEinstellung(key, val, nurMax) {');
        return new Function('zahlLokal', '_settings',
            quelle + '\nreturn _klemmeEinstellung;')(zahlLokal, settings);
    }

    it('Spielerzahl 1 wird beim Verlassen des Feldes auf 2 gehoben', () => {
        const k = baueKlemme({ rounds: 8 })('totalPlayers', 1, false);
        assert.equal(k.wert, 2);
        assert.equal(k.geklemmt, true);
        assert.match(k.grund, /Mindestwert/);
    });

    it('beim Tippen bleibt die Untergrenze in Ruhe — sonst zerschiesst sie "2700"', () => {
        const k = baueKlemme({ rounds: 8 })('totalPlayers', 2, true);
        assert.equal(k.wert, 2);
        assert.equal(k.geklemmt, false);
        const k1 = baueKlemme({ rounds: 8 })('totalPlayers', 1, true);
        assert.equal(k1.wert, 1, 'die Untergrenze darf mitten im Tippen nicht greifen');
    });

    it('Spielerzahl 10000 wird auf 9999 geklemmt — auch schon beim Tippen', () => {
        const k = baueKlemme({ rounds: 8 })('totalPlayers', 10000, true);
        assert.equal(k.wert, 9999);
        assert.equal(k.geklemmt, true);
        assert.match(k.grund, /10\.000/);
        assert.match(k.grund, /9\.999/);
    });

    it('Day-2-Punkte 99 sind in 8 Runden nicht erreichbar — Deckel bei 24', () => {
        const k = baueKlemme({ rounds: 8 })('day2Points', 99, true);
        assert.equal(k.wert, 24, 'ein Sieg zaehlt 3, also 8 x 3 = 24');
        assert.equal(k.geklemmt, true);
        assert.match(k.grund, /nicht erreichbar/);
    });

    it('der Punktedeckel folgt der Rundenzahl', () => {
        assert.equal(baueKlemme({ rounds: 9 })('day2Points', 99, true).wert, 27);
        assert.equal(baueKlemme({ rounds: 5 })('day2Points', 99, true).wert, 15);
    });

    it('das Markup-Maximum bleibt die harte Obergrenze', () => {
        // 20 Runden x 3 = 60, aber mc-day2pts traegt max=45.
        assert.equal(baueKlemme({ rounds: 20 })('day2Points', 99, true).wert, 45);
    });

    it('gueltige Werte bleiben unangetastet', () => {
        const k = baueKlemme({ rounds: 8 });
        assert.equal(k('totalPlayers', 2700, false).geklemmt, false);
        assert.equal(k('day2Points', 16, false).geklemmt, false);
        assert.equal(k('rounds', 8, false).geklemmt, false);
    });

    it('ein Schluessel ohne Grenzen geht unveraendert durch', () => {
        const k = baueKlemme({ rounds: 8 })('topCutSize', 4, false);
        assert.equal(k.wert, 4);
        assert.equal(k.geklemmt, false);
    });

    it('_onSetting klemmt wirklich — der gespeicherte Wert ist der geklemmte', () => {
        const roh = schnittOhne('function _onSetting(key, val) {', '_settings[key] = val;');
        const rumpf = roh.replace('function _onSetting(key, val) {', '');
        const settings = { rounds: 8, totalPlayers: 2000, day2Points: 16 };
        const hinweise = [];
        const fn = new Function(
            '_klemmeEinstellung', 'SETTING_GRENZEN', 'document', '_zeigeKlemmHinweis', '_settings', 'key', 'val',
            rumpf + '\n_settings[key] = val;\nreturn _settings[key];');
        const klemme = baueKlemme(settings);
        const doc = { getElementById: () => ({ value: '' }) };
        assert.equal(
            fn(klemme, { totalPlayers: { feld: 'mc-players' } }, doc, (t) => hinweise.push(t), settings, 'totalPlayers', 10000),
            9999);
        assert.ok(hinweise.some(h => /9\.999/.test(h)),
            'die Klemmung muss sichtbar gemeldet werden, nicht still korrigieren');
    });
});

describe('M2 — die Eingabefelder sind auch verdrahtet', () => {
    /* NACHGESCHAERFT (07.09.2026, Befund B5 der unabhaengigen Abnahme):
       die alte Fassung suchte je Schluessel EIN Textvorkommen. Damit war
       sie schon erfuellt, wenn irgendein Feld das onchange trug — und
       der bei Regional, Worlds und International wirklich gerenderte
       mc-rounds-<select> trug keins. Die Zusicherung war staerker als
       die Wirklichkeit. Jetzt wird JEDES gerenderte Bedienelement
       geprueft, nicht das erste. */
    it('jedes gerenderte Zahlenfeld meldet das Verlassen an _onSettingCommit', () => {
        const felder = { totalPlayers: 'mc-players', rounds: 'mc-rounds', day2Points: 'mc-day2pts' };
        Object.entries(felder).forEach(([k, id]) => {
            const tags = SRC.match(new RegExp('<(?:input|select)\\b[^>]*\\bid="' + id + '"[^>]*>', 'g')) || [];
            assert.ok(tags.length > 0, `kein Bedienelement mit id="${id}" gefunden`);
            tags.forEach(tag => {
                assert.ok(tag.includes(`MetaCall._onSettingCommit('${k}', this)`),
                    `ein Bedienelement fuer ${k} ohne onchange — dann greift dort die Untergrenze nie: ${tag.slice(0, 90)}`);
            });
        });
    });

    it('der Major-Zweig rendert wirklich ein zweites Rundenfeld — sonst prueft die Zeile darueber nur eins', () => {
        const tags = SRC.match(/<(?:input|select)\b[^>]*\bid="mc-rounds"[^>]*>/g) || [];
        assert.equal(tags.length, 2, 'input (Challenge/Cup) und select (Major) — beide muessen geprueft werden');
        assert.ok(tags.some(x => x.startsWith('<select')));
        assert.ok(tags.some(x => x.startsWith('<input')));
    });

    it('_onSettingCommit ist nach aussen sichtbar', () => {
        assert.match(SRC, /^\s*_onSettingCommit,\s*$/m,
            'ohne Export laeuft das onchange-Attribut in einen TypeError');
    });

    it('es gibt eine Stelle, an der die Rueckmeldung erscheint', () => {
        assert.ok(SRC.includes('id="mc-grenzen-hinweis"'));
        assert.ok(SRC.includes("getElementById('mc-grenzen-hinweis')"));
    });
});

// ───────────────────────────────────────────────────────────────────
// M3 — der Fokus ueberlebt den Tabellentausch
// ───────────────────────────────────────────────────────────────────
describe('M3 — refreshResults reisst das Schaetzfeld nicht mehr unter dem Cursor weg', () => {
    /* Der Ausschnitt aus refreshResults, der den <tbody> tauscht — mit
       einer Attrappen-DOM. Ohne die Rettung steht der Fokus danach
       nirgends, und genau das war der Befund. */
    function laufe({ mitAuswahlbereich }) {
        const quelle = schnittOhne(
            'const aktivVorher = document.activeElement;',
            "const neuerKopf = tmp.querySelector('#mc-mct-kopf');");

        const protokoll = { fokussiert: 0, bereich: null, wertNeuGesetzt: 0, tbodyGesetzt: 0 };
        const neuesFeld = {
            value: '50',
            focus() { protokoll.fokussiert += 1; },
            setSelectionRange(a, b) {
                if (!mitAuswahlbereich) throw new Error('InvalidStateError');
                protokoll.bereich = [a, b];
            },
        };
        Object.defineProperty(neuesFeld, 'value', {
            get() { return this._v === undefined ? '50' : this._v; },
            set(v) { this._v = v; protokoll.wertNeuGesetzt += 1; },
        });

        const altesFeld = {
            classList: { contains: (c) => c === 'mc-personal-input' },
            getAttribute: (n) => (n === 'data-deck' ? 'Dragapult' : null),
            selectionStart: mitAuswahlbereich ? 1 : null,
            selectionEnd: mitAuswahlbereich ? 1 : null,
        };
        const fieldTbody = {
            contains: () => true,
            set innerHTML(v) { protokoll.tbodyGesetzt += 1; },
            get innerHTML() { return ''; },
            querySelector: (sel) => (/mc-personal-input/.test(sel) ? neuesFeld : null),
        };
        const document = {
            activeElement: altesFeld,
            createElement: () => ({
                innerHTML: '',
                querySelector: (sel) => (sel === 'tbody' ? { innerHTML: '<tr></tr>' } : null),
            }),
        };
        new Function('document', 'fieldTbody', 'renderFieldPanel', 'field', 'window', 'CSS', quelle)(
            document, fieldTbody, () => '<table><tbody><tr></tr></tbody></table>', [], {}, undefined);
        return protokoll;
    }

    it('nach dem Tausch steht der Fokus wieder im Schaetzfeld desselben Decks', () => {
        assert.equal(laufe({ mitAuswahlbereich: false }).fokussiert, 1);
    });

    it('bei type=number landet der Cursor am Ende — sonst loescht Backspace nichts', () => {
        const p = laufe({ mitAuswahlbereich: false });
        assert.equal(p.wertNeuGesetzt, 2,
            'der Wert muss geleert und neu gesetzt werden; blosses focus() setzt den Cursor VOR die Zahl');
    });

    it('wo es einen Auswahlbereich gibt, bleibt die Cursorstelle erhalten', () => {
        const p = laufe({ mitAuswahlbereich: true });
        assert.deepEqual(p.bereich, [1, 1]);
        assert.equal(p.wertNeuGesetzt, 0, 'dann darf der Wert nicht angefasst werden');
    });

    it('der <tbody> wird trotzdem noch getauscht — die Zahlen bleiben aktuell', () => {
        assert.equal(laufe({ mitAuswahlbereich: false }).tbodyGesetzt, 1);
    });
});

// ───────────────────────────────────────────────────────────────────
// M4 — "Mein Deck" und der Brick-Filter sagen, worauf sie wirken
// ───────────────────────────────────────────────────────────────────
describe('M4 — der Brick-Filter schreibt an, worauf er wirkt', () => {
    function baue(settings, journal) {
        const quelle = funktion('function _journalFilterTitel() {');
        return new Function('_settings', '_journalStats', 'zahlLokal', 'esc',
            quelle + '\nreturn _journalFilterTitel;')(settings, journal, zahlLokal, (s) => String(s));
    }

    it('ohne Deck sagt er, dass er noch nicht wirkt', () => {
        assert.match(baue({ myDeck: '' }, {})(), /Wirkt erst, wenn ein Deck gewählt ist/);
    });

    it('ohne Journalpartien sagt er genau das — statt stumm nichts zu tun', () => {
        const html = baue({ myDeck: 'Mega Excadrill' }, {})();
        assert.match(html, /Keine Journal-Matches für dieses Deck/);
    });

    it('die Zeile haengt auch wirklich neben dem Umschalter', () => {
        // Ohne diese Zusicherung ueberlebt das Entfernen des Aufrufs im
        // Markup: die Funktion waere geprueft, aber niemand riefe sie.
        const kachel = schnitt('<div class="mc-brick-filter-wrap">', '</div>');
        /* UI-62 (02.10.2026): die Angabe steht nicht mehr als Zeile neben dem
           Umschalter, sondern als Hinweistext (title) am Umschalter. */
        const auswahl = schnitt('<select class="mc-brick-filter-select"', '>');
        assert.ok(auswahl.includes('_journalFilterTitel()'),
            'der Journal-Umschalter steht wieder ohne Angabe da, worauf er wirkt');
    });

    it('mit Journalpartien nennt er die gemessene Zahl', () => {
        const html = baue({ myDeck: 'Mega Excadrill' },
            { Dragapult: { total: 7 }, Crustle: { total: 3 }, Slowking: { total: 0 } })();
        assert.match(html, /10 Journalpartie\(n\)/);
        assert.match(html, /gegen 2 Deck\(s\)/);
    });
});

describe('M4 — "Mein Deck" schweigt nicht mehr, wenn die Eingabe nicht passt', () => {
    function baue(shareList, settings) {
        const quelle = funktion('function _onMyDeckInput(val) {');
        const protokoll = { uebernommen: [], status: [] };
        const fn = new Function('_shareList', '_settings', '_onMyDeck', '_setzeMyDeckStatus', 'zahlLokal',
            quelle + '\nreturn _onMyDeckInput;')(
            shareList, settings,
            (n) => { protokoll.uebernommen.push(n); settings.myDeck = n; },
            (t) => protokoll.status.push(t),
            zahlLokal);
        return { fn, protokoll };
    }

    const FELD = [{ name: 'Mega Excadrill' }, { name: 'Mega Lucario' }, { name: 'Dragapult' }];

    it('ein exakter Treffer wird uebernommen — wie bisher', () => {
        const { fn, protokoll } = baue(FELD, { myDeck: '' });
        fn('Mega Excadrill');
        assert.deepEqual(protokoll.uebernommen, ['Mega Excadrill']);
    });

    it('ein Teilstueck schlaegt die passenden Decks vor, statt nichts zu tun', () => {
        const { fn, protokoll } = baue(FELD, { myDeck: '' });
        fn('Mega Exc');
        assert.deepEqual(protokoll.uebernommen, []);
        assert.equal(protokoll.status.length, 1);
        assert.match(protokoll.status[0], /Mega Excadrill/);
    });

    it('ein Name, den es nicht gibt, wird als solcher benannt', () => {
        const { fn, protokoll } = baue(FELD, { myDeck: '' });
        fn('Blubb');
        assert.deepEqual(protokoll.uebernommen, []);
        assert.equal(protokoll.status.length, 1);
        assert.match(protokoll.status[0], /steht nicht im prognostizierten Feld/);
        assert.match(protokoll.status[0], /3 Decks/);
    });

    it('das geleerte Feld nimmt die Wahl zurueck', () => {
        const { fn, protokoll } = baue(FELD, { myDeck: 'Dragapult' });
        fn('');
        assert.deepEqual(protokoll.uebernommen, ['']);
    });

    it('die Statuszeile steht auch wirklich in der Kachel', () => {
        assert.ok(SRC.includes('id="mc-my-deck-status"'));
        assert.ok(SRC.includes("getElementById('mc-my-deck-status')"));
        assert.ok(SRC.includes('>${_myDeckStatusText()}</p>'),
            'die Zeile stuende leer da — der gewaehlte Zustand waere wieder unsichtbar');
    });

    it('_myDeckStatusText sagt beide Zustaende an', () => {
        const q = funktion('function _myDeckStatusText() {');
        const fn = (settings) => new Function('_settings', 'esc',
            q + '\nreturn _myDeckStatusText;')(settings, (x) => String(x))();
        /* UI-62 (02.10.2026): die Dauerzeile ist weg — der Status meldet sich
           nur noch beim Tippen (_setzeMyDeckStatus), nicht als Erklaertext. */
        assert.equal(fn({ myDeck: '' }), '');
        assert.equal(fn({ myDeck: 'Mega Excadrill' }), '');
    });
});

// ───────────────────────────────────────────────────────────────────
// M5 — das Day-2-Bild
// ───────────────────────────────────────────────────────────────────
describe('M5 — exportDay2ShareImage bricht nicht mehr stumm ab', () => {
    function laufe(settings, shareList) {
        const quelle = schnittOhne('function exportDay2ShareImage() {', 'const field = buildField();');
        const rumpf = quelle.replace('function exportDay2ShareImage() {', '');
        const protokoll = { warn: [], status: [] };
        const fn = new Function('_shareList', '_settings', 'console', '_setzeMyDeckStatus',
            rumpf + '\nreturn "WEITER";');
        return {
            ergebnis: fn(shareList, settings,
                { warn: (...a) => protokoll.warn.push(a.join(' ')) },
                (t) => protokoll.status.push(t)),
            protokoll,
        };
    }

    it('ohne gewaehltes Deck sagt er, dass das Deck fehlt', () => {
        const { ergebnis, protokoll } = laufe({ myDeck: '' }, [{ name: 'Dragapult' }]);
        assert.equal(ergebnis, undefined, 'ohne Deck darf kein Bild gemalt werden');
        assert.equal(protokoll.status.length, 1);
        assert.match(protokoll.status[0], /Day-2-Bild/);
        assert.equal(protokoll.warn.length, 1);
    });

    it('mit Deck laeuft er weiter', () => {
        const { ergebnis, protokoll } = laufe({ myDeck: 'Mega Excadrill' }, [{ name: 'Dragapult' }]);
        assert.equal(ergebnis, 'WEITER');
        assert.deepEqual(protokoll.status, []);
    });

    it('der Knopf haengt weiterhin an der Funktion — sie wird nicht entfernt', () => {
        assert.ok(SRC.includes('onclick="MetaCall.exportDay2ShareImage()"'),
            'ENTSCHEIDUNG 07.09.2026: verdrahten, nicht entfernen — die Funktion malt dieselbe Vorschau wie die drei anderen Exporte');
        assert.match(SRC, /^\s*exportDay2ShareImage,\s*$/m);
    });

    it('sie endet in derselben Vorschau wie die anderen Bild-Exporte', () => {
        const ganz = schnitt('function exportDay2ShareImage() {', '_showSharePreview(canvas,');
        assert.ok(ganz.includes('_showSharePreview(canvas,'));
    });
});

// ───────────────────────────────────────────────────────────────────
// M6 — das Szenario des Betreibers
// ───────────────────────────────────────────────────────────────────
describe('M6 — Frankfurt, 26.09.2026, TEF-PBL, 2.700 Spieler, Mega Excadrill', () => {
    function baueKlemme(settings) {
        const quelle = schnitt('const SETTING_GRENZEN = {', '};')
            + '\n' + funktion('function _klemmeEinstellung(key, val, nurMax) {');
        return new Function('zahlLokal', '_settings',
            quelle + '\nreturn _klemmeEinstellung;')(zahlLokal, settings);
    }

    it('2.700 Spieler gehen ohne Umweg durch', () => {
        const k = baueKlemme({ rounds: 8 })('totalPlayers', 2700, false);
        assert.equal(k.wert, 2700);
        assert.equal(k.geklemmt, false);
    });

    it('sein Ziel — 5 Siege plus ein Unentschieden, also 16 Punkte in 8 Runden — geht durch', () => {
        const k = baueKlemme({ rounds: 8 })('day2Points', 16, false);
        assert.equal(k.wert, 16);
        assert.equal(k.geklemmt, false);
        // 6 Siege = 18 Punkte, ebenfalls im Rahmen.
        assert.equal(baueKlemme({ rounds: 8 })('day2Points', 18, false).geklemmt, false);
    });

    it('sein Format TEF-PBL ist das laufende und darum NICHT im Past-Meta-Katalog', () => {
        // _loadPastMetaCatalog schneidet den current_set-Suffix heraus —
        // TEF-PBL gehoert unter "Current Meta", nicht unter "Vergangenes".
        const quelle = schnitt(
            "if (currentSet) {", "}", SRC.indexOf('const seenKeys = new Set();'));
        assert.ok(quelle.includes("upper.endsWith('-' + currentSet)"),
            'ohne den Suffix-Schnitt stuende das laufende Format doppelt in der Auswahl');
    });
});

describe('M6 — die Prognose schreibt ihre Stichprobe an', () => {
    /* Der Dateiname der Umfangsdatei steht seit dem 07.09.2026 in einer
       Konstante (Befund B1: im Tooltip stand ein Pfad, den es nicht
       gibt). Der Wert wird HIER AUS DER QUELLE gelesen, damit die
       Attrappe nicht ihre eigene Wahrheit mitbringt. */
    const FENSTER_META_DATEI = (SRC.match(/const FENSTER_META_DATEI = '([^']+)';/) || [])[1];

    function baue(metaSource, fenster) {
        const quelle = schnitt('const stichprobe = (() => {', '})();');
        return new Function('_metaSource', '_fensterMeta', 'zahlLokal', 'FENSTER_META_DATEI',
            quelle + '\nreturn stichprobe;')(metaSource, fenster, zahlLokal, FENSTER_META_DATEI);
    }

    const FENSTER = {
        decks_im_fenster: 10330,
        fenster_tage: 15,
        fenster_von: '2026-08-22',
        fenster_bis: '2026-09-06',
    };

    it('Umfang, Zeitraum und Spanne stehen im Banner', () => {
        const html = baue('current', FENSTER);
        assert.match(html, /10\.330 Decks/);
        assert.match(html, /15 Tagen/);
        assert.match(html, /22\.08\.2026–06\.09\.2026/);
    });

    it('ohne gueltiges Tagesfenster steht die duenne Datenlage da — statt gar nichts', () => {
        const html = baue('current', null);
        assert.match(html, /kein gültiges Tagesfenster/);
        assert.match(html, /Kumulativstand/);
    });

    it('ein Fenster ohne Umfang zaehlt nicht als Fenster', () => {
        assert.match(baue('current', { decks_im_fenster: 0, fenster_tage: 15 }), /kein gültiges Tagesfenster/);
    });

    it('im Past-Meta bleibt die Angabe aus — dort gibt es kein Online-Fenster', () => {
        assert.equal(baue('past', FENSTER), '');
    });

    it('beide Banner-Zweige tragen die Angabe wirklich', () => {
        const b = schnitt('mc-predictor-banner mc-predictor-banner-b', '</div>`;');
        assert.ok(b.includes('${stichprobe}'),
            'der Mode-B-Zweig laesst die Stichprobe weg');
        const a = schnitt('mc-predictor-banner mc-predictor-banner-a', '</div>`;');
        assert.ok(a.includes('${stichprobe}'),
            'der Mode-A-Zweig laesst die Stichprobe weg — ausgerechnet der duennere');
    });

    it('die Zahlen kommen aus der geladenen Datei, nicht aus einer Rechnung', () => {
        const quelle = schnitt('const stichprobe = (() => {', '})();');
        assert.ok(quelle.includes('_fensterMeta.decks_im_fenster'));
        // Keine Hochrechnung, keine Schaetzung: nur Lesen und Formatieren.
        assert.ok(!/[*/]\s*\d/.test(quelle.replace(/\/\*[\s\S]*?\*\//g, '')),
            'im Stichproben-Block wird gerechnet — die Angabe muss aus der Datei kommen');
    });
});
