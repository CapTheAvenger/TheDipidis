'use strict';
/**
 * ZWEI ZAHLEN AM RUECKFALL AUF DIE LEGACY-STUFEN.
 *
 * B2 — DIE AUFTEILUNG WAR ABGESCHRIEBEN.
 *   js/app-deck-builder.js sagte an der Ablehnung "elf mit EINER Liste,
 *   vier mit zweien". Nachgezaehlt an
 *   data/tournament_decklists_per_player.csv (Feld deck_archetype,
 *   Listenschluessel tournament_id|player_name|place wie in _loadAll,
 *   Fenstergrenze ueber Feld tournament_date gegen in_person_legal_date
 *   aus data/format_window.json) sind es ZEHN und FUENF. Die Zahl war
 *   einmal gemessen und danach stehen geblieben.
 *
 *   Sie wird jetzt zur Laufzeit gezaehlt
 *   (MostConsistencyBuilder.bestandsLage) und im Warum?-Kasten mit
 *   Datei und Feldern genannt. Dieser Test rechnet die Zaehlung gegen
 *   dieselbe Datei nach — als GLEICHUNG, nicht als Wochenwert: welche
 *   Archetypen dort diese Woche stehen, ist jeder Zusicherung egal.
 *
 * B3 — `Number(null)` IST 0.
 *   `Number.isFinite(Number(mv.schwelle))` liess eine fehlende Schwelle
 *   als Zahl durch, und auf dem Bildschirm stand "nötig sind 0".
 *   Geprueft wird jetzt der Wert selbst; fehlt er, sagt der Text das.
 *
 * Kein jsdom. Die Textproben laufen auf GESETZTEN Werten; nur die
 * Zaehlung von B2 liest data/ — und auch die nur gegen sich selbst.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { baue } = require('./lib-dom-sandkasten.js');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const BAUER = 'js/app-deck-builder.js';
const KONS  = 'js/deck-builder-consistency.js';

/** _duenneBasisBefund samt seinem Helfer, ausfuehrbar. */
function befund(sprache) {
    /* _bestandsLageSatz steht bewusst INNERHALB von _duenneBasisBefund:
       tests/unit/test-skalen-und-quellen-07-09.js schneidet diese eine
       Funktion heraus und fuehrt sie allein aus. Ein Helfer daneben
       waere dort undefiniert — der Befund darf keine zweite Datei
       mitbringen muessen. */
    return baue(BAUER, ['function _duenneBasisBefund(mv)'],
        { getLang: () => (sprache || 'de') });
}

/** Das echte Bauer-Modul in einem Kontext, ohne Netz und ohne DOM. */
function modul() {
    const sb = { console, setTimeout: () => {}, window: undefined };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(lies(KONS), sb, { filename: KONS });
    assert.ok(sb.MostConsistencyBuilder, KONS + ' gibt nichts nach aussen');
    return sb.MostConsistencyBuilder;
}

/* ══ B3 ═══════════════════════════════════════════════════════════ */

describe('B3 — eine fehlende Schwelle ist keine Schwelle von 0', () => {

    const OHNE = [
        ['null', null],
        ['undefined', undefined],
        ['leerer String', ''],
        ['Leerzeichen', '   '],
        ['NaN', NaN],
        ['Text', 'drei'],
        ['0', 0],
        ['-1', -1],
    ];

    for (const [name, wert] of OHNE) {
        it(`schwelle = ${name}: kein "nötig sind 0"`, () => {
            const f = befund('de')._duenneBasisBefund;
            const b = f({ archetyp: 'Mega Chandelure', n_lists: 1, schwelle: wert });
            assert.ok(b, 'ohne Schwelle faellt der ganze Befund weg — er soll bleiben');
            assert.ok(!/nötig sind 0\b/.test(b.message),
                'die Oberflaeche behauptet weiter "nötig sind 0": ' + b.message);
            assert.ok(!/nötig sind (NaN|-1|undefined|null)/.test(b.message),
                'ein Nichtwert steht als Zahl im Text: ' + b.message);
            assert.ok(b.message.includes('keine Schwelle hinterlegt'),
                'der Ersatztext fehlt: ' + b.message);
            assert.ok(b.message.includes('nur 1 Tag-2-Liste'),
                'die gemessene Listenzahl fehlt: ' + b.message);
        });
    }

    it('englisch ebenso', () => {
        const f = befund('en')._duenneBasisBefund;
        const b = f({ archetyp: 'Crustle', n_lists: 2, schwelle: null });
        assert.ok(!/0 are required/.test(b.message), b.message);
        assert.ok(b.message.includes('no threshold on record'), b.message);
    });

    it('eine echte Schwelle steht weiterhin da', () => {
        const de = befund('de')._duenneBasisBefund(
            { archetyp: 'Crustle', n_lists: 2, schwelle: 3 });
        assert.ok(de.message.includes('nötig sind 3'), de.message);
        assert.ok(!de.message.includes('keine Schwelle hinterlegt'), de.message);
        const en = befund('en')._duenneBasisBefund(
            { archetyp: 'Crustle', n_lists: 2, schwelle: 3 });
        assert.ok(en.message.includes('3 are required'), en.message);
    });

    it('auch eine Schwelle als Zeichenkette wird gelesen, nicht verworfen', () => {
        const b = befund('de')._duenneBasisBefund(
            { archetyp: 'Crustle', n_lists: 2, schwelle: '3' });
        assert.ok(b.message.includes('nötig sind 3'), b.message);
    });

    it('der Aufrufer reicht die Schwelle des Moduls durch, nicht eine Kopie', () => {
        const q = lies(BAUER);
        assert.ok(q.includes('builder.MIN_WEIGHTED_LISTS'),
            'die Schwelle wird nicht mehr aus dem Modul geholt');
        assert.equal(modul().MIN_WEIGHTED_LISTS, 3,
            'die Stichprobenuntergrenze im Modul ist nicht mehr 3 — dann sind '
            + 'die Beispielzahlen in diesem Test nachzuziehen');
    });
});

/* ══ B2 ═══════════════════════════════════════════════════════════ */

/* Der Listenschluessel von _loadAll, hier noch einmal gebaut — der Test
   soll die Zaehlung des Moduls gegen die DATEI pruefen, nicht gegen
   sich selbst. Deshalb wird die CSV eigenstaendig gelesen. */
function csvZeilen(text) {
    const rows = [];
    let i = 0, feld = '', zeile = [], inQ = false;
    while (i < text.length) {
        const c = text[i];
        if (inQ) {
            if (c === '"') {
                if (text[i + 1] === '"') { feld += '"'; i += 2; continue; }
                inQ = false; i++; continue;
            }
            feld += c; i++; continue;
        }
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ',') { zeile.push(feld); feld = ''; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { zeile.push(feld); rows.push(zeile); zeile = []; feld = ''; i++; continue; }
        feld += c; i++;
    }
    if (feld || zeile.length) { zeile.push(feld); rows.push(zeile); }
    const kopf = rows.shift();
    return rows.filter(r => r.length > 1).map(r => {
        const o = {};
        kopf.forEach((k, j) => { o[k] = r[j]; });
        return o;
    });
}

/** Die Listen der Datei, mit demselben Schluessel wie _loadAll. */
function listenAusDatei() {
    const rows = csvZeilen(lies('data/tournament_decklists_per_player.csv'));
    const proListe = new Map();
    for (const r of rows) {
        const arch = (r.deck_archetype || '').trim();
        if (!arch) continue;
        const tid = (r.tournament_id || r.limitless_tournament_id || '').trim();
        const ply = (r.player_name || '').trim();
        const place = parseInt(r.place || '999', 10) || 999;
        const key = `${tid}|${ply}|${place}`;
        if (!proListe.has(key)) {
            proListe.set(key, {
                deck_archetype: arch,
                tournament_date: r.tournament_date || '',
            });
        }
    }
    return [...proListe.values()];
}

describe('B2 — die Aufteilung wird gezaehlt, nicht abgeschrieben', () => {

    const M = modul();
    const FW = JSON.parse(lies('data/format_window.json'));
    const listen = listenAusDatei();

    it('die Datei liefert ueberhaupt Listen (sonst besteht alles leer)', () => {
        assert.notEqual(listen.length, 0,
            'data/tournament_decklists_per_player.csv ergibt keine einzige Liste — '
            + 'dann prueft dieser Block nichts');
        assert.equal(typeof FW.in_person_legal_date, 'string',
            'data/format_window.json fuehrt kein in_person_legal_date mehr');
    });

    it('bestandsLageAus zaehlt genau das, was in der Datei steht', () => {
        const grenze = FW.in_person_legal_date;
        const lage = M.bestandsLageAus(listen, grenze);
        assert.ok(lage, 'bestandsLageAus gibt nichts zurueck');

        // Sollwerte aus derselben Datei — eine Gleichung, kein Wochenwert.
        const imFenster = listen.filter(l => {
            const d = String(l.tournament_date || '').trim().slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
            return d >= grenze;
        });
        const proArch = new Map();
        for (const l of imFenster) {
            proArch.set(l.deck_archetype, (proArch.get(l.deck_archetype) || 0) + 1);
        }
        const sollVerteilung = {};
        let sollUnter = 0;
        for (const anzahl of proArch.values()) {
            if (anzahl >= M.MIN_WEIGHTED_LISTS) continue;
            sollUnter += 1;
            sollVerteilung[anzahl] = (sollVerteilung[anzahl] || 0) + 1;
        }

        assert.equal(lage.listen_gesamt, listen.length);
        assert.equal(lage.listen_im_fenster, imFenster.length);
        assert.equal(lage.archetypen, proArch.size);
        assert.equal(lage.unter_schwelle, sollUnter);
        assert.equal(lage.erreichen, proArch.size - sollUnter);
        /* Ueber JSON, weil das Objekt aus einem anderen vm-Kontext kommt:
           deepStrictEqual vergleicht sonst die Prototypen und faellt, obwohl
           die Zahlen gleich sind. */
        assert.deepEqual(JSON.parse(JSON.stringify(lage.verteilung)), sollVerteilung);
        assert.equal(lage.quelle, 'data/tournament_decklists_per_player.csv');
        assert.deepEqual(Array.from(lage.felder), ['deck_archetype', 'tournament_date']);
        assert.equal(lage.min_date, grenze);
        assert.equal(lage.schwelle, M.MIN_WEIGHTED_LISTS);
    });

    it('das Fenster wirkt: ohne Grenze bleiben mehr Listen stehen', () => {
        const mit  = M.bestandsLageAus(listen, FW.in_person_legal_date);
        const ohne = M.bestandsLageAus(listen, null);
        assert.equal(ohne.listen_im_fenster, listen.length);
        assert.equal(ohne.min_date, null);
        assert.notEqual(mit.listen_im_fenster, ohne.listen_im_fenster,
            'die Fenstergrenze aendert nichts — dann prueft die naechste '
            + 'Zusicherung das Tor nicht mehr');
    });

    it('eine Liste ohne ISO-Datum wird behalten, nicht geraten', () => {
        const lage = M.bestandsLageAus([
            { deck_archetype: 'A', tournament_date: '' },
            { deck_archetype: 'A', tournament_date: 'irgendwann' },
            { deck_archetype: 'B', tournament_date: '2020-01-01' },
        ], '2026-07-31');
        assert.equal(lage.listen_im_fenster, 2);
        assert.equal(lage.archetypen, 1);
    });

    it('ohne geladene Daten wird keine 0 erfunden', () => {
        assert.equal(modul().bestandsLage('2026-07-31'), null);
        assert.equal(M.bestandsLageAus(null, null), null);
    });

    /* DIE FENSTERGRENZE DARF NICHT DIE DES LAUFENDEN FORMATS SEIN
       (20.09.2026).

       Hier stand `FW.in_person_legal_date`. Am 16.09.2026 ist Set 30C
       erschienen; die Praesenzturniere des neuen Fensters beginnen erst
       am 25.09. Neun Tage lang liegen damit NULL Listen im Fenster, und
       diese Zusicherung fiel um — ohne dass irgendetwas kaputt war: der
       Text faellt dann bewusst weg (`_bestandsLageSatz` gibt '' zurueck,
       wenn `archetypen` 0 ist), statt eine alte Zahl zu behaupten.

       Geprueft wird deshalb mit einer Grenze, die aus den DATEN kommt
       und garantiert Listen stehen laesst — und der leere Fall bekommt
       eine eigene Zusicherung darunter. Beide Seiten sind damit
       bewacht, und keine haengt mehr am Kalender. */
    const grenzeMitListen = (() => {
        const tage = listen
            .map(l => String(l.tournament_date || '').trim())
            .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t))
            .sort();
        assert.notEqual(tage.length, 0,
            'keine einzige Liste traegt ein ISO-Datum — dann laesst sich keine '
            + 'Fenstergrenze aus den Daten bilden');
        return tage[0];          // der aelteste Tag: alles liegt im Fenster
    })();

    it('der Warum?-Kasten schreibt die gezaehlten Zahlen samt Datei hin', () => {
        const lage = M.bestandsLageAus(listen, grenzeMitListen);
        assert.notEqual(lage.archetypen, 0,
            'die gewaehlte Grenze laesst kein einziges Deck stehen — dann '
            + 'prueft diese Zusicherung den leeren Fall statt des vollen');
        const b = befund('de')._duenneBasisBefund(
            { archetyp: 'Mega Chandelure', n_lists: 1, schwelle: 3, lage });
        assert.ok(b.hint.includes(String(lage.listen_im_fenster) + ' von '
            + String(lage.listen_gesamt)), b.hint);
        assert.ok(b.hint.includes('auf ' + lage.archetypen + ' Archetypen'), b.hint);
        assert.ok(b.hint.includes(lage.unter_schwelle + ' davon'), b.hint);
        assert.ok(b.hint.includes('data/tournament_decklists_per_player.csv'),
            'die Datenquelle steht nicht im Text: ' + b.hint);
        assert.ok(b.hint.includes('deck_archetype') && b.hint.includes('tournament_date'),
            'die Felder stehen nicht im Text: ' + b.hint);
        assert.ok(b.hint.includes('data/format_window.json'),
            'die Herkunft der Fenstergrenze fehlt: ' + b.hint);
        // Die Aufteilung selbst, aus der Verteilung gebaut.
        for (const [k, v] of Object.entries(lage.verteilung)) {
            const stueck = Number(k) === 1 ? `${v} auf einer Liste` : `${v} auf ${k} Listen`;
            assert.ok(b.hint.includes(stueck),
                `die Aufteilung "${stueck}" fehlt im Text: ` + b.hint);
        }
    });

    it('ein leeres Fenster behauptet keine Zahl, sondern schweigt', () => {
        /* Der Zustand vom 16.-25.09.2026: das Format ist gewechselt, die
           Praesenzturniere haben noch nicht angefangen. Frueher war
           dieser Fall ungeprueft — er kam in den Daten nie vor, und als
           er kam, fiel die Zusicherung darueber um. */
        const leer = M.bestandsLageAus(listen, '2099-01-01');
        assert.equal(leer.listen_im_fenster, 0, 'die Probe ist nicht leer');
        const b = befund('de')._duenneBasisBefund(
            { archetyp: 'Mega Chandelure', n_lists: 1, schwelle: 3, lage: leer });
        assert.ok(!/Tag-2-Listen/.test(b.hint),
            'bei leerem Fenster steht trotzdem ein Bestandssatz da: ' + b.hint);
        assert.ok(b.hint.length > 0,
            'bei leerem Fenster faellt der ganze Befund weg statt nur des Satzes');
    });

    it('die Aufteilung steht NICHT mehr fest im angezeigten Text', () => {
        const b = befund('de')._duenneBasisBefund({
            archetyp: 'X', n_lists: 1, schwelle: 3,
            lage: {
                quelle: 'data/tournament_decklists_per_player.csv',
                felder: ['deck_archetype', 'tournament_date'],
                min_date: '2026-07-31', schwelle: 3,
                listen_gesamt: 9, listen_im_fenster: 7, archetypen: 3,
                unter_schwelle: 2, erreichen: 1, verteilung: { 1: 2 },
            },
        });
        assert.ok(b.hint.includes('7 von 9 Tag-2-Listen'),
            'der Satz zeigt nicht die uebergebene Messung: ' + b.hint);
        assert.ok(b.hint.includes('2 auf einer Liste'), b.hint);
        assert.ok(!/elf mit|vier mit|11 auf|15 davon/.test(b.hint),
            'eine feste Zahl aus dem Jahr 2026 steht wieder im Text: ' + b.hint);
    });

    it('ohne Messung faellt der Satz weg, statt eine alte Zahl zu behaupten', () => {
        const f = befund('de')._duenneBasisBefund;
        const ohne = f({ archetyp: 'X', n_lists: 1, schwelle: 3 });
        const leer = f({ archetyp: 'X', n_lists: 1, schwelle: 3,
                         lage: { archetypen: 0, verteilung: {} } });
        assert.ok(!ohne.hint.includes('tournament_decklists_per_player'), ohne.hint);
        assert.ok(!leer.hint.includes('tournament_decklists_per_player'), leer.hint);
        assert.ok(ohne.hint.length > 50, 'der uebrige Hinweis ist mitverschwunden');
    });

    it('der Aufrufer reicht die Messung wirklich durch', () => {
        const q = lies(BAUER);
        assert.ok(/lage:\s*\(typeof builder\.bestandsLage === 'function'\)/.test(q),
            'duennerBestand traegt keine Messung mehr — dann steht im '
            + 'Warum?-Kasten wieder nichts ueber den Bestand');
        assert.ok(q.includes('builder.bestandsLage((_fw && _fw.in_person_legal_date) || null)'),
            'die Messung bekommt nicht dieselbe Fenstergrenze wie der Bau');
    });
});
