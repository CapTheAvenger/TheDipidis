/**
 * Drei Befunde der Abnahme vom 07.09.2026, ausgefuehrt statt gegriffen.
 *
 *   A-F4.7   Das Datenfenster „Daten ab“ wirkt auf die Archetyp-Kacheln
 *            nicht. Gemessen: Anteil, Win %, Top-8 und Day-2 bleiben bei
 *            jedem Fensterwechsel identisch, und `grep currentMetaDateFrom`
 *            in js/app-archetype-card.js findet 0 Treffer. Nachgesehen,
 *            warum: data/limitless_online_decks.csv fuehrt kein Datum je
 *            Zeile. Also der zweite zulaessige Weg — es steht an den
 *            Kacheln dran. Diese Datei prueft, DASS es dransteht und dass
 *            die Zahlen wirklich unveraendert bleiben.
 *
 *   H6       Kennzahlen ohne Nenner und ohne Quelle. Geprueft werden die
 *            beiden Fussnoten der Deck-Statistik-Kacheln: Nenner, Datei,
 *            Feld, Zeitraum.
 *
 *   A2-Zw.   Der Wechsel des Seltenheitsmodus zeichnet das Kachelgitter
 *            neu und verliert dabei den Typfilter, waehrend dessen
 *            Schaltflaeche aktiv markiert bleibt.
 *
 * KEIN jsdom (CI installiert nur papaparse). KEINE LIVEDATEN: alle
 * Eingaben setzt der Test, alle Sollwerte folgen aus genau diesen Zahlen.
 * Deshalb steht diese Datei nicht im Register von
 * tests/unit/test-testdaten-wachhund.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const KARTE = fs.readFileSync(path.join(WURZEL, 'js', 'app-archetype-card.js'), 'utf8');
const CM = fs.readFileSync(path.join(WURZEL, 'js', 'app-current-meta-analysis.js'), 'utf8');
const GETEILT = fs.readFileSync(path.join(WURZEL, 'js', 'deck-analysis-shared.js'), 'utf8');
const CORE = fs.readFileSync(path.join(WURZEL, 'js', 'app-core.js'), 'utf8');

/** Quelltext ohne Kommentare — sonst faengt eine Zusicherung den Satz,
 *  der die Zusicherung begruendet. */
function nurCode(q) {
    return q.replace(/\/\*[\s\S]*?\*\//g, ' ')
            .split('\n').map(z => z.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
}
const KARTE_CODE = nurCode(KARTE);

function ausschnittAus(quelle, datei, marke) {
    const start = quelle.indexOf(marke);
    // notEqual statt einer Ungleichung: tests/unit/test-testdaten-wachhund.js
    // zaehlt `assert.ok(... >= n)` in Dateien, die aus data/ lesen, und diese
    // Wache gilt dem QUELLTEXT, nicht den Daten.
    assert.notEqual(start, -1, 'nicht gefunden in ' + datei + ': ' + marke);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(start, j + 1);
        }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
}
const ausCm = (m) => ausschnittAus(CM, 'js/app-current-meta-analysis.js', m);
const ausCore = (m) => ausschnittAus(CORE, 'js/app-core.js', m);

/* Das ECHTE Manifest und das ECHTE Formatfenster — als STRUKTUR, nicht
   als Wochenwert: geprueft wird nur, dass der aufgeloeste Pfad existiert,
   nicht welcher es diese Woche ist. Und die ECHTE Auswahlfunktion aus
   js/app-core.js, damit der Test nicht eine zweite Regel prueft. */
const MANIFEST = JSON.parse(fs.readFileSync(
    path.join(WURZEL, 'data', 'tournament_cards_manifest.json'), 'utf8'));
const FENSTER = JSON.parse(fs.readFileSync(
    path.join(WURZEL, 'data', 'format_window.json'), 'utf8'));
const WAEHLE = new Function('return ' + ausCore('function waehleAktuellenChunk(manifest, currentSet)'))();

// ── A-F4.7 ───────────────────────────────────────────────────────────

/* Die Archetyp-Karte in einer Ersatzumgebung. Genau so wie in
   tests/unit/test-archetype-card.js, nur laden wir hier ueber die echte
   fetch-Kette, damit _majorZeitraum aus wirklich geparsten Zeilen kommt. */
function ladeKarte(dateien) {
    const sandbox = {
        console: { warn() {}, error() {}, log() {} },
        document: {
            addEventListener() {},
            getElementById: () => null,
            createElement: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
            body: { classList: { add() {}, remove() {} }, appendChild() {} },
        },
        getLang: () => 'de',
        t: (k) => k,
        BASE_PATH: 'data/',
        fetch: (pfad) => {
            const name = String(pfad).split('?')[0].replace('data/', '');
            const inhalt = dateien[name];
            if (inhalt === undefined) return Promise.resolve({ ok: false, text: () => Promise.resolve(''), json: () => Promise.resolve(null) });
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(inhalt),
                json: () => Promise.resolve(JSON.parse(inhalt)),
            });
        },
    };
    sandbox.window = sandbox;
    sandbox.parseLocaleNumber = (v, f) => {
        const z = parseFloat(String(v == null ? '' : v).replace('%', '').replace(',', '.'));
        return Number.isFinite(z) ? z : (f === undefined ? 0 : f);
    };
    /* GESETZT: 10 von 100 Antritten in die Top 8, Feldschnitt 10 %.
       Die Kachel muss daraus 10,0 % machen — mehr prueft der Test hier
       nicht, die Rechnung selbst haengt in tests/unit/test-archetype-card.js. */
    sandbox.computeConversionPerformance = () => ({
        expected: 0.1,
        decks: [{ name: 'Dragapult', brought: 100, top8: 10, perfPct: 0, thin: false }],
    });
    sandbox.gezaehlteZeilen = (rows) => ({ zeilen: rows, hatRoh: true });
    sandbox._formatWindow = { oldest_legal_set: 'TEF', current_set: 'PBL' };
    vm.createContext(sandbox);
    vm.runInContext(KARTE, sandbox);
    return sandbox;
}

/* GESETZTE Daten. Dragapult: 300 Listen, 100 Siege aus 200 Partien.
   Die Sollwerte unten sind aus genau diesen Zahlen gerechnet. */
const DECKS_CSV = [
    'rank;deck_name;count;share;share_numeric;wins;losses;ties;win_rate;win_rate_numeric',
    '1;Dragapult;300;7.62%;7,62;100;90;10;50.00%;50,00',
].join('\n');
const TOP8_CSV = [
    'deck_name;tournaments_seen;total_brought_weighted;top8_count_weighted;top16_count_weighted;top8_conv_rate;top16_conv_rate;avg_winrate_in_top8;last_seen_date;source_format;total_brought;top8_count;top16_count',
    'Dragapult;10;100;10;20;0.1;0.2;20;2026-09-06;PBL;100;10;20',
].join('\n');
const VERZ = JSON.stringify({ meta_keys: ['TEF-PBL'] });
const LABS_CSV = [
    'tournament_id,tournament_name,tournament_date,deck_name,player_count,share_pct,wins,losses,ties,day1_players,day2_players',
    '0071,Worlds,2026-08-28,Dragapult,178,22.33,553,601,162,178,22',
    '0072,Regional,2026-07-04,Dragapult,50,10.00,100,100,10,50,5',
].join('\n');

const DATEIEN = {
    'limitless_online_decks.csv': DECKS_CSV,
    'online_tournament_top8_decks.csv': TOP8_CSV,
    'labs_tournament_decks_verzeichnis.json': VERZ,
    'labs_tournament_decks_TEF-PBL.csv': LABS_CSV,
};

describe('A-F4.7 — die Kacheln sagen, welchen Zeitraum sie zeigen', () => {

    it('die Datei rechnet kein Datumsfenster — belegt, nicht behauptet', () => {
        /* Wuerde jemand ein Fenster einbauen, ohne die Zahlen wirklich zu
           filtern, faellt das hier auf: dann steht der Name im Code, und
           die Zusage "das Fenster wirkt hier nicht" waere falsch. */
        assert.doesNotMatch(KARTE_CODE, /currentMetaDateFrom/,
            'js/app-archetype-card.js fasst jetzt das Datenfenster an — dann darf '
            + 'der Zeitraumsatz nicht mehr sagen, dass es hier nicht wirkt');
    });

    it('die Quelldateien tragen wirklich kein Datum je Zeile', () => {
        /* Der Satz an der Kachel begruendet sich mit den Spalten der
           Dateien. Wenn eine Datumsspalte dazukommt, muss der Satz weg —
           und dann faellt dieser Test. Gelesen wird nur die KOPFZEILE,
           keine Zahl; das ist Struktur, kein Wochenwert. */
        const kopf = (datei) => fs.readFileSync(path.join(WURZEL, 'data', datei), 'utf8')
            .replace(/^﻿/, '').split(/\r?\n/)[0].split(';').map(x => x.trim());
        const decks = kopf('limitless_online_decks.csv');
        assert.ok(!decks.some(sp => /date|datum/i.test(sp)),
            'limitless_online_decks.csv hat jetzt eine Datumsspalte: ' + decks.join(', '));
        const top8 = kopf('online_tournament_top8_decks.csv');
        const datumsSpalten = top8.filter(sp => /date/i.test(sp));
        assert.equal(datumsSpalten.join(','), 'last_seen_date',
            'online_tournament_top8_decks.csv fuehrt andere Datumsspalten als nur last_seen_date');
    });

    it('der Zeitraum steht an den Kacheln, mit Datei und Zeitspanne', async () => {
        const w = ladeKarte(DATEIEN);
        const ok = await w._archetypeCardInternals.render && w.renderInlineArchetypeCards;
        assert.ok(ok);
        // load() ueber die oeffentliche Kette anstossen.
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');
        assert.match(wirt.innerHTML, /class="arc-zeitraum"/,
            'die Zeitraumzeile fehlt an den Kacheln');
        assert.match(wirt.innerHTML, /limitless_online_decks\.csv/,
            'die Online-Quelldatei wird nicht genannt');
        assert.match(wirt.innerHTML, /labs_tournament_decks_TEF-PBL\.csv/,
            'die Major-Quelldatei wird nicht genannt');
        // Die Spanne kommt aus den beiden gesetzten Turnierzeilen.
        assert.match(wirt.innerHTML, /2026-07-04/, 'der Beginn des Major-Zeitraums fehlt');
        assert.match(wirt.innerHTML, /2026-08-28/, 'das Ende des Major-Zeitraums fehlt');
        assert.match(wirt.innerHTML, /2 Turniere vom/, 'die Zahl der Turniere fehlt');
    });

    it('die eingebettete Fassung sagt ausdruecklich, dass das Datenfenster nicht wirkt', async () => {
        const w = ladeKarte(DATEIEN);
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');   // Variante 'embed'
        assert.match(wirt.innerHTML, /Daten ab/,
            'der Satz zum Datenfenster fehlt genau dort, wo das Bedienelement steht');
        /* IN DER TIERLISTE STEHT DER SATZ SEIT DEM 11.09.2026 GAR NICHT
           MEHR AUF DER KARTE.
           Er beschreibt das Format, nicht das Deck, und stand deshalb
           wortgleich unter jeder der 29 Karten. Gemeldet: „die
           Zeitraumbeschreibung, die kann auf jeden Fall komplett weg,
           und dann wuerd ich lieber gucken, dass wir den freigewordenen
           Platz irgendwie sinnvoller nutzen." Er ist nicht geloescht,
           sondern hinter dem Info-Knopf des Abschnitts „Tier-Liste"
           gelandet — getGetArchetypeErklaerung() liefert ihn dorthin,
           js/app-tier-meta.js haengt ihn an seine Meldung.

           In der EINGEBETTETEN Fassung bleibt er, und das ist der Grund:
           dort steht das Bedienelement „Daten ab", auf das er sich
           bezieht, und es gibt keinen Abschnitts-Info-Knopf. */
        const inline = w._archetypeCardInternals.render('Dragapult', 'inline');
        assert.doesNotMatch(inline, /class="arc-zeitraum"/,
            'der Zeitraumsatz steht wieder unter jeder Karte der Tier-Liste');
        const erkl = w.getArchetypeErklaerung();
        assert.match(erkl, /limitless_online_decks\.csv/,
            'der Text ist nicht hinter dem Info-Knopf gelandet, sondern verschwunden');
        assert.match(erkl, /labs_tournament_decks_TEF-PBL\.csv/);
        assert.doesNotMatch(erkl, /Daten ab/,
            'die Abschnitts-Fassung spricht von einem Bedienelement, das dort nicht existiert');
    });

    it('ohne Praesenz-Auszug wird kein Zeitraum erfunden', async () => {
        const ohneMajor = Object.assign({}, DATEIEN);
        delete ohneMajor['labs_tournament_decks_TEF-PBL.csv'];
        delete ohneMajor['labs_tournament_decks_verzeichnis.json'];
        const w = ladeKarte(ohneMajor);
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');
        assert.match(wirt.innerHTML, /kein Präsenzturnier-Auszug/,
            'ohne Auszug muss das dastehen, nicht ein leeres Datum');
        assert.doesNotMatch(wirt.innerHTML, /vom\s+bis/);
    });

    it('die Zahlen selbst sind aus den Rohdaten nachvollziehbar', async () => {
        /* Der Weg 2 verlangt: keine erfundene gefilterte Zahl. Also muss
           jede Zahl auf der Kachel aus den gesetzten Zeilen folgen.
             Anteil online   = share_numeric          -> 7,6 %
             Win % online    = win_rate_numeric       -> 50,0 %
             Nenner online   = wins+losses+ties = 200
             Top-8-Quote     = 10 / 100               -> 10,0 %
             Anteil Major    = share_pct 22,33+10,00  -> 32,3 %
             Day-2-Quote     = (22+5) / (178+50)      -> 11,8 % */
        const w = ladeKarte(DATEIEN);
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');
        const h = wirt.innerHTML;
        assert.match(h, /7,6 %/, 'Anteil online');
        assert.match(h, /50,0 %/, 'Win % online');
        assert.match(h, /200/, 'Nenner der Online-Win-%');
        assert.match(h, /10,0 %/, 'Top-8-Quote');
        assert.match(h, /32,3 %/, 'Anteil Major (Summe der beiden Zeilen)');
        const d2 = (22 + 5) / (178 + 50) * 100;
        assert.match(h, new RegExp(d2.toFixed(1).replace('.', ',') + ' %'), 'Day-2-Quote');
    });

    it('zwei verschiedene Datenfenster ergeben dieselbe Kachel — genau das sagt die Zeile', async () => {
        /* Die Probe zum Befund: das Fenster ist gesetzt, die Kacheln
           aendern sich nicht. Das ist kein Mangel mehr, sondern das, was
           die Zeitraumzeile ankuendigt. Sagte sie etwas anderes, waere sie
           falsch — und dieser Test macht den Widerspruch sichtbar. */
        const w = ladeKarte(DATEIEN);
        const a = { innerHTML: '' };
        w.currentMetaDateFrom = '2026-01-01';
        await w.renderArchetypeCardInto(a, 'Dragapult');
        const b = { innerHTML: '' };
        w.currentMetaDateFrom = '2026-08-01';
        await w.renderArchetypeCardInto(b, 'Dragapult');
        assert.equal(a.innerHTML, b.innerHTML,
            'die Kacheln reagieren jetzt doch auf das Fenster — dann muss die '
            + 'Zeitraumzeile umgeschrieben und die Zahl belegt werden');
        assert.match(a.innerHTML, /wirkt auf diese vier Kacheln nicht/);
    });
});

// ── M18 / M17: der Zeitraum-Satz der Major-Kacheln ───────────────────

describe('M18/M17 — Turnierzahl und Zeitspanne halten einer Mutation stand', () => {

    /* WARUM ES DIESE VORLAGE BRAUCHT (07.09.2026).
       Die bisherige Vorlage hatte ZWEI Zeilen in ZWEI Turnieren. Damit
       ist "Zahl der Zeilen" gleich "Zahl der Turniere": die Mutation
       "_turniere.size durch die Zeilenzahl ersetzen" (M18) blieb
       unbemerkt. Mit echten Daten schreibt sie "46 Turniere vom
       2026-08-28" statt "1 Turnier".
       Und sie hatte zwar zwei Daten, aber die Zusicherung suchte beide
       nur EINZELN — vertauschte Grenzen (M17) blieben deshalb gruen.
       Diese Vorlage hat DREI Zeilen in ZWEI Turnieren und drei Daten,
       und die Zusicherung prueft die REIHENFOLGE. */
    const LABS_MEHR = [
        'tournament_id,tournament_name,tournament_date,deck_name,player_count,share_pct,wins,losses,ties,day1_players,day2_players',
        '0071,Worlds,2026-08-28,Dragapult,100,20.00,300,300,20,100,10',
        '0071,Worlds,2026-08-28,Gardevoir,50,10.00,150,150,10,50,5',
        '0072,Regional,2026-07-04,Dragapult,40,8.00,120,120,8,40,4',
        '0072,Regional,2026-07-04,Gardevoir,20,4.00,60,60,4,20,2',
        '0072,Regional,2026-07-04,Charizard,10,2.00,30,30,2,10,1',
    ].join('\n');
    const DATEIEN_MEHR = Object.assign({}, DATEIEN, {
        'labs_tournament_decks_TEF-PBL.csv': LABS_MEHR,
    });

    it('M18 — gezaehlt werden TURNIERE, nicht Zeilen', async () => {
        const w = ladeKarte(DATEIEN_MEHR);
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');
        assert.match(wirt.innerHTML, /2 Turniere vom/,
            'die Kachel zaehlt Zeilen statt Turniere — 5 Zeilen, 2 Turniere');
        assert.doesNotMatch(wirt.innerHTML, /5 Turniere/,
            'die Zeilenzahl steht als Turnierzahl da');
        assert.doesNotMatch(wirt.innerHTML, /\b[34] Turniere/,
            'die Turnierzahl folgt weder den Zeilen noch den Turnieren');
    });

    it('M17 — die Zeitspanne laeuft vom aeltesten zum juengsten Datum', async () => {
        const w = ladeKarte(DATEIEN_MEHR);
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');
        assert.match(wirt.innerHTML, /vom 2026-07-04 bis 2026-08-28/,
            'die Grenzen des Zeitraums stehen in der falschen Reihenfolge');
        assert.doesNotMatch(wirt.innerHTML, /vom 2026-08-28 bis/,
            'Beginn und Ende sind vertauscht — "vom Ende bis zum Anfang"');
    });

    it('M17/M18 — ein einziges Turnier bleibt ein einziges Turnier', async () => {
        const eins = Object.assign({}, DATEIEN, {
            'labs_tournament_decks_TEF-PBL.csv': [
                'tournament_id,tournament_name,tournament_date,deck_name,player_count,share_pct,wins,losses,ties,day1_players,day2_players',
                '0071,Worlds,2026-08-28,Dragapult,100,20.00,300,300,20,100,10',
                '0071,Worlds,2026-08-28,Gardevoir,50,10.00,150,150,10,50,5',
                '0071,Worlds,2026-08-28,Charizard,25,5.00,75,75,5,25,2',
            ].join('\n'),
        });
        const w = ladeKarte(eins);
        const wirt = { innerHTML: '' };
        await w.renderArchetypeCardInto(wirt, 'Dragapult');
        assert.match(wirt.innerHTML, /1 Turnier vom 2026-08-28/,
            'drei Zeilen aus EINEM Turnier ergeben nicht "1 Turnier vom ..."');
        assert.doesNotMatch(wirt.innerHTML, /1 Turniere|3 Turnier/,
            'Einzahl und Mehrzahl haengen nicht mehr an der Zahl');
        assert.doesNotMatch(wirt.innerHTML, /2026-08-28 bis 2026-08-28/,
            'bei einem einzigen Datum wird eine Spanne behauptet');
    });
});

// ── H6: die Fussnoten der Deck-Statistik ─────────────────────────────

function kennzahlSandkasten(sprache) {
    const kontext = {
        console: { warn() {}, error() {}, log() {} },
        getLang: () => sprache || 'de',
        parseLocaleNumber: (v, f) => {
            const z = parseFloat(String(v == null ? '' : v).replace('%', '').replace(',', '.'));
            return Number.isFinite(z) ? z : (f === undefined ? 0 : f);
        },
        zahlLokal: (n, k) => Number(n).toFixed(k).replace('.', ','),
    };
    kontext.window = kontext;
    vm.createContext(kontext);
    vm.runInContext(
        /* Der Fussnotentext holt den Namen der Konvention seit dem
           08.09.2026 ueber cmaQuotenName() aus js/win-rate-konvention.js.
           Der Helfer kommt aus DERSELBEN Datei, nicht als Attrappe. */
        ausCm('function cmaQuotenFormel(id)') + '\n' +
        ausCm('function cmaQuotenName(id)') + '\n' +
        ausCm('function _cmWinrateFussnote(eintrag)') + '\n' +
        ausCm('function _cmTop20Schnitt(deckStats, matchupData, cleanArch, matchKey)') + '\n' +
        ausCm('function _cmMatchupFussnote(s)') + '\n',
        kontext, { filename: 'kennzahlen.js' });
    return kontext;
}

describe('H6 — jede Kennzahl nennt Nenner, Quelle und Zeitraum', () => {

    it('Win %: Nenner ist die Bilanz derselben Zeile', () => {
        const k = kennzahlSandkasten('de');
        // 7943 + 6642 + 276 = 14861 — die Zahl, die niemand sah.
        const text = k._cmWinrateFussnote({ wins: '7943', losses: '6642', ties: '276' });
        assert.match(text, /14\.?861 Matches|14861 Matches/, 'der Nenner fehlt');
        assert.match(text, /7\.?943–6\.?642–276|7943–6642–276/, 'die Bilanz fehlt');
        assert.match(text, /limitless_online_decks\.csv/, 'die Quelldatei fehlt');
        assert.match(text, /win_rate_numeric/, 'das Feld fehlt');
        assert.match(text, /Zeitraum/, 'der Zeitraum fehlt');
        assert.match(text, /Win %/, 'die Limitless-Bezeichnung "Win %" fehlt');
    });

    it('Win %: fehlt die Bilanz, wird kein Nenner erfunden', () => {
        const k = kennzahlSandkasten('de');
        const text = k._cmWinrateFussnote({ wins: null, losses: null, ties: null });
        assert.match(text, /Bilanzspalten dieser Zeile fehlen/);
        assert.doesNotMatch(text, /\d+ Matches \(/);
    });

    it('Matchup vs Top 20: Paarungen UND Partien stehen da', () => {
        const k = kennzahlSandkasten('de');
        // Der Live-Befund lautete "47,05 % (20 MU)" fuer Mega Excadrill;
        // die 10.361 Partien dahinter standen nirgends.
        const text = k._cmMatchupFussnote({ paarungen: 20, partien: 10361, spiegelPartien: 0 });
        assert.match(text, /20 Paarungen/, 'die Zahl der Paarungen fehlt');
        assert.match(text, /10\.?361 Matches/, 'der Nenner in Partien fehlt');
        assert.match(text, /total_games/, 'das Feld des Nenners fehlt');
        assert.match(text, /limitless_online_decks_matchups\.csv/, 'die Quelldatei fehlt');
        assert.match(text, /Spalte rank/, 'die Quelle der Raenge 1-20 fehlt');
        assert.match(text, /Ränge 1–20/, 'gegen wen gezaehlt wurde, steht nicht da');
    });

    it('Matchup vs Top 20: ohne Paarung wird nichts behauptet', () => {
        const k = kennzahlSandkasten('de');
        const text = k._cmMatchupFussnote({ paarungen: 0, partien: 0, spiegelPartien: 0 });
        assert.match(text, /Keine Paarung/);
        assert.match(text, /limitless_online_decks_matchups\.csv/);
        assert.doesNotMatch(text, /Schnitt über/);
    });

    it('englisch bleibt englisch', () => {
        const k = kennzahlSandkasten('en');
        assert.match(k._cmMatchupFussnote({ paarungen: 20, partien: 10361, spiegelPartien: 0 }),
            /Game-weighted average/);
        assert.match(k._cmWinrateFussnote({ wins: '1', losses: '1', ties: '0' }), /Denominator/);
    });

    // ── M1 / M2 ─────────────────────────────────────────────────

    /* Die GESETZTEN Zeilen fuer den Top-20-Schnitt. Sechs Paarungen,
       davon zwei ausserhalb der Raenge 1-20 und eine eines fremden
       Decks. Alle Sollwerte unten folgen aus genau diesen Zahlen. */
    const DECK_STATS = [
        { rank: '1', deck_name: 'Dragapult' },
        { rank: '2', deck_name: 'Mega Excadrill' },
        { rank: '3', deck_name: 'Toucannon' },
        { rank: '25', deck_name: 'Feraligatr' },
    ];
    const MU_ZEILEN = [
        // 100 Partien zu 40 % -> 40 Siege
        { deck_name: 'Mega Excadrill', opponent: 'Dragapult',      win_rate: '40,00', total_games: '100' },
        // 300 Partien zu 60 % -> 180 Siege
        { deck_name: 'Mega Excadrill', opponent: 'Toucannon',      win_rate: '60,00', total_games: '300' },
        // Der Spiegel: 100 Partien zu 50 % -> 50 Siege
        { deck_name: 'Mega Excadrill', opponent: 'Mega Excadrill', win_rate: '50,00', total_games: '100' },
        // Rang 25 — zaehlt nicht mit
        { deck_name: 'Mega Excadrill', opponent: 'Feraligatr',     win_rate: '90,00', total_games: '900' },
        // fremdes Deck — zaehlt nicht mit
        { deck_name: 'Dragapult',      opponent: 'Toucannon',      win_rate: '10,00', total_games: '999' },
    ];
    const MK = (n) => String(n || '').trim();

    it('M1/M2 — Kachel und Nenner kommen aus EINEM Aufruf und passen zusammen', () => {
        const k = kennzahlSandkasten('de');
        const s2 = k._cmTop20Schnitt(DECK_STATS, MU_ZEILEN, 'Mega Excadrill', MK);
        // 3 Paarungen, 500 Partien, 270 Siege -> 54,00 %
        assert.equal(s2.paarungen, 3);
        assert.equal(s2.partien, 500);
        assert.equal(s2.text, '54,00 % (3 MU)');
        const fuss = k._cmMatchupFussnote(s2);
        /* DIE MUTATION, DIE HIER ROT WIRD: die beiden Nenner vertauschen.
           Dann stuende "3 Matches" neben "(3 MU)" bzw. "500 Paarungen". */
        assert.match(fuss, /über 3 Paarungen/, 'die Zahl der Paarungen stimmt nicht mit der Kachel ueberein');
        assert.match(fuss, /Nenner: 500 Matches/, 'der Nenner in Partien ist nicht die Summe total_games');
        assert.doesNotMatch(fuss, /Nenner: 3 Matches/,
            'Paarungen und Partien sind vertauscht — genau Mutation M1');
        assert.doesNotMatch(fuss, /über 500 Paarungen/, 'ebenso, andersherum');
    });

    it('M1/M2 — der Spiegel zaehlt mit, und das steht auch da', () => {
        const k = kennzahlSandkasten('de');
        const s2 = k._cmTop20Schnitt(DECK_STATS, MU_ZEILEN, 'Mega Excadrill', MK);
        assert.equal(s2.spiegelPartien, 100, 'die Spiegelpaarung wird nicht erkannt');
        const fuss = k._cmMatchupFussnote(s2);
        assert.match(fuss, /Spiegelpaarung zählt mit: 100 der 500 Matches/,
            'dass der Spiegel im Schnitt steckt, steht nicht im Text');
        /* Und die Gegenprobe: ohne Spiegel darf der Satz nicht dastehen. */
        const ohne = k._cmTop20Schnitt(DECK_STATS,
            MU_ZEILEN.filter(m => m.opponent !== 'Mega Excadrill'), 'Mega Excadrill', MK);
        assert.equal(ohne.spiegelPartien, 0);
        assert.equal(ohne.partien, 400);
        assert.match(k._cmMatchupFussnote(ohne), /Eine Spiegelpaarung ist nicht dabei/);
    });

    it('M1/M2 — ohne Paarung bleibt der Strich, und der Nenner bleibt null', () => {
        const k = kennzahlSandkasten('de');
        const s2 = k._cmTop20Schnitt(DECK_STATS, MU_ZEILEN, 'Gibt es nicht', MK);
        assert.equal(s2.text, '-');
        assert.equal(s2.partien, 0);
        assert.match(k._cmMatchupFussnote(s2), /Keine Paarung/);
    });

    it('die Fussnote landet sichtbar an der Kachel, nicht nur im title', () => {
        /* Ein reines title-Attribut erscheint nur beim Verweilen mit der
           Maus — auf dem Telefon also nie. Dieselbe Begruendung wie in
           js/app-archetype-card.js ueber tile(). */
        const angelegt = [];
        const kachel = {
            _attr: {},
            setAttribute(k, v) { this._attr[k] = v; },
            appendChild(el) { angelegt.push(el); },
        };
        const wert = { closest: () => kachel, parentElement: kachel };
        const knoten = { currentMetaStatWinrate: wert };
        const kontext = {
            document: {
                getElementById: (id) => knoten[id] || null,
                createElement: () => {
                    const el = { setAttribute(k, v) { this[k === 'style' ? '_style' : k] = v; } };
                    return el;
                },
            },
            console: { warn() {} },
        };
        kontext.window = kontext;
        vm.createContext(kontext);
        vm.runInContext(ausCm('function _cmKennzahlHinweis(wertId, text)'), kontext,
            { filename: 'hinweis.js' });
        const fuss = kontext._cmKennzahlHinweis('currentMetaStatWinrate', 'Nenner: 200 Matches.');
        assert.ok(fuss, 'es wurde keine Fussnote angelegt');
        assert.equal(fuss.textContent, 'Nenner: 200 Matches.');
        assert.equal(angelegt.length, 1, 'die Fussnote haengt nicht an der Kachel');
        assert.equal(kachel._attr.title, 'Nenner: 200 Matches.');
        assert.equal(kachel._attr['aria-label'], 'Nenner: 200 Matches.');
        // Zweiter Aufruf: derselbe Knoten, nicht ein zweiter.
        knoten.currentMetaStatWinrateFussnote = fuss;
        kontext._cmKennzahlHinweis('currentMetaStatWinrate', 'Neuer Text.');
        assert.equal(angelegt.length, 1, 'bei jedem Deckwechsel waechst eine Fussnote nach');
        assert.equal(fuss.textContent, 'Neuer Text.');
    });

    it('die Kacheln bekommen ihre Fussnote wirklich zugewiesen', () => {
        const rumpf = CM.slice(CM.indexOf('updateDeckStatsByIds({'));
        assert.match(rumpf, /_cmKennzahlHinweis\('currentMetaStatWinrate'/,
            'die Win-%-Kachel bekommt keinen Hinweis mehr');
        assert.match(rumpf, /_cmKennzahlHinweis\('currentMetaStatMatchup'/,
            'die Matchup-Kachel bekommt keinen Hinweis mehr');
    });

    /* Ein Sandkasten fuer renderCurrentMetaTop256(), mitsamt der
       Aufloesung des Ladeschluessels (Befund B1). Das Manifest und das
       Formatfenster kommen ueber ein gestelltes fetch — die Auswahl
       selbst macht die ECHTE waehleAktuellenChunk() aus js/app-core.js,
       genau die, die auch der Lader benutzt. */
    function top256Sandkasten(o) {
        o = o || {};
        const listEl = { innerHTML: '' };
        const titelEl = { _attr: {}, setAttribute(k, v) { this._attr[k] = v; } };
        const abschnitt = { classList: { add() {}, remove() {} } };
        const knoten = {
            currentMetaTop256Section: abschnitt,
            currentMetaTop256List: listEl,
        };
        const dateien = Object.assign({
            'format_window.json': JSON.stringify({ oldest_legal_set: 'TEF', current_set: 'PBL' }),
            'tournament_cards_manifest.json': JSON.stringify(MANIFEST),
        }, o.dateien);
        const kontext = {
            document: {
                getElementById: (id) => knoten[id] || null,
                querySelector: (sel) => (sel === '.current-meta-top256-title' ? titelEl : null),
            },
            console: { warn() {}, error() {}, log() {} },
            getLang: () => o.sprache || 'de',
            BASE_PATH: 'data/',
            escapeHtml: (x) => String(x == null ? '' : x)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
            normalizeCurrentMetaTournamentArchetypeName: (x) => String(x || '').trim(),
            loadCSV: () => Promise.resolve([]),
            filterTournamentRowsByMetaDate: (r) => r,
            fetch: (pfad) => {
                const name = String(pfad).split('?')[0].replace('data/', '');
                if (!(name in dateien)) {
                    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(dateien[name])) });
            },
        };
        kontext.window = kontext;
        kontext.waehleAktuellenChunk = WAEHLE;
        vm.createContext(kontext);
        vm.runInContext(
            'let _cmFormatFenster = null;\nlet _cmTurnierDatei = undefined;\n'
            + ausCm('async function _cmHoleFormatFenster()') + '\n'
            + ausCm('async function _cmFormatSchluessel()') + '\n'
            + ausCm('async function _cmTurnierKartenDatei()') + '\n'
            + ausCm('async function renderCurrentMetaTop256(archetype)'),
            kontext, { filename: 'top256.js' });
        return { kontext, listEl, titelEl };
    }

    it('"Used in Top 256" schreibt Datei, Feld und Zeitraum wirklich in die Liste', async () => {
        /* AUSGEFUEHRT, nicht gegriffen: eine Zusicherung auf den Quelltext
           blieb gruen, als der sichtbare Hinweis-Knoten entfernt wurde —
           der Text stand ja weiter in der Variablen. */
        const s = top256Sandkasten();
        /* GESETZT: ein Turnier, elf Listen. 11 ist die Zahl, die vorne
           stehen muss, und 1 die Zahl der Turniere im Zeitraum-Satz. */
        s.kontext.currentMetaTournamentCardsData = [
            { archetype: 'Dragapult', tournament_name: 'Worlds', tournament_date: '2026-08-28', total_decks_in_archetype: '11' },
            { archetype: 'Dragapult', tournament_name: 'Worlds', tournament_date: '2026-08-28', total_decks_in_archetype: '11' },
            { archetype: 'Anderes',   tournament_name: 'Worlds', tournament_date: '2026-08-28', total_decks_in_archetype: '5' },
        ];
        await s.kontext.renderCurrentMetaTop256('Dragapult');
        const h = s.listEl.innerHTML;
        assert.match(h, /11\u00d7|11×/, 'die Zahl der Listen steht nicht vorn');
        assert.match(h, /total_decks_in_archetype/, 'das Feld fehlt in der Liste');
        assert.match(h, /1 Turnier im aktuellen Meta-Fenster/, 'die Zahl der Turniere im Zeitraum fehlt');
        assert.match(h, /11 Listen/, 'die Gesamtzahl der Listen fehlt');
        assert.match(h, /Datenfenster/, 'der Vorbehalt zum Datenfenster fehlt');
        assert.equal(s.titelEl._attr.title, s.titelEl._attr['aria-label']);
        assert.match(s.titelEl._attr.title || '', /tournament_cards_data_cards_TEF-PBL\.csv/,
            'die Ueberschrift traegt keinen Hinweis');
    });

    // ── B1 ──────────────────────────────────────────────────────────

    it('B1 — die genannte Quelle ist die Datei, die der Lader wirklich holt', async () => {
        /* DER BEFUND: hier stand "Quelle: data/tournament_cards_data_cards.csv".
           Diese Datei gibt es nicht — der Name ist ein Ladeschluessel, den
           _loadTournamentCardsChunked() ueber das Manifest und current_set
           auf eine der 16 Formatdateien aufloest. */
        const s = top256Sandkasten();
        s.kontext.currentMetaTournamentCardsData = [
            { archetype: 'Dragapult', tournament_name: 'Worlds', tournament_date: '2026-08-28', total_decks_in_archetype: '11' },
        ];
        await s.kontext.renderCurrentMetaTop256('Dragapult');
        const h = s.listEl.innerHTML;
        assert.match(h, /data\/tournament_cards_data_cards_TEF-PBL\.csv/,
            'die aufgeloeste Formatdatei steht nicht in der Liste');
        assert.doesNotMatch(h, /data\/tournament_cards_data_cards\.csv/,
            'der Ladeschluessel steht wieder als Dateiname da — diese Datei gibt es nicht');
        // Und sie existiert wirklich.
        const genannt = (h.match(/data\/[A-Za-z0-9_\-.]+\.csv/g) || []);
        assert.notEqual(genannt.length, 0, 'in der Liste steht ueberhaupt kein Pfad mehr');
        const fehlend = genannt.filter(x => !fs.existsSync(path.join(WURZEL, x)));
        assert.deepEqual(fehlend, [], 'ein genannter Pfad zeigt ins Leere');
    });

    it('B1 — laesst sich die Datei nicht aufloesen, wird KEINE genannt', async () => {
        /* Ein geratener Name waere derselbe Fehler noch einmal. Ohne
           Manifest darf deshalb gar kein data/-Pfad dieser Sorte
           dastehen — aber der Leser muss erfahren, warum. */
        const s = top256Sandkasten({ dateien: { 'tournament_cards_manifest.json': undefined } });
        s.kontext.currentMetaTournamentCardsData = [
            { archetype: 'Dragapult', tournament_name: 'Worlds', tournament_date: '2026-08-28', total_decks_in_archetype: '11' },
        ];
        await s.kontext.renderCurrentMetaTop256('Dragapult');
        const h = s.listEl.innerHTML;
        assert.doesNotMatch(h, /data\/tournament_cards_data_cards/,
            'ohne Manifest wird ein Dateiname geraten');
        assert.match(h, /nicht auflösen|nicht aufl&#246;sen/,
            'der Grund fehlt — dann sieht die fehlende Quelle wie Nachlaessigkeit aus');
    });

    it('B1 — jeder Pfad, den die beiden Dateien im Oberflaechentext nennen, existiert', () => {
        /* Vorbild: tests/unit/test-metacall-befunde-fix6-07-09.js, gleiche
           Fehlerklasse. Kommentare zaehlen nicht — dort wird der Befund
           erklaert und dabei der falsche alte Name genannt. Vorlagen mit
           ${...} werden gegen das laufende Format aufgeloest, denn genau
           dieser Pfad entsteht zur Laufzeit. */
        const schluessel = `${FENSTER.oldest_legal_set}-${FENSTER.current_set}`;
        const pfade = [];
        for (const quelle of [CM, KARTE]) {
            const ohne = quelle.replace(/\/\*[\s\S]*?\*\//g, ' ')
                .replace(/^[ \t]*\/\/.*$/gm, '');
            for (const p of (ohne.match(/data\/[A-Za-z0-9_\-.${}]+\.(?:json|csv|md)\b/g) || [])) {
                pfade.push(p.replace(/\$\{[^}]*\}/g, schluessel));
            }
        }
        const einmalig = [...new Set(pfade)].sort();
        assert.notEqual(einmalig.length, 0,
            'der Pfadfund ist zusammengebrochen — die Zusicherung waere leer und wertlos');
        const fehlend = einmalig.filter(p => !fs.existsSync(path.join(WURZEL, p)));
        assert.deepEqual(fehlend, [],
            'ein Dateiname in einem Oberflaechentext zeigt ins Leere — genau Befund B1');
    });

    it('"Usage Share" nennt Datei und Nenner, und der Nenner steht sichtbar daneben', () => {
        assert.match(CM, /Anteil der Listen dieses Archetyps/, 'Usage Share ohne Erklaerung');
        assert.match(CM, /deck_inclusion_count ÷ total_decks_in_archetype/,
            'Usage Share nennt seinen Nenner nicht');
        assert.match(CM, /\$\{decksWithCardDisplay\} \/ \$\{totalDecksDisplay\}\)<\/span>/,
            'der Nenner steht nicht SICHTBAR neben der Quote');
        assert.match(CM, /title="\$\{escapeHtml\(_shareHinweis\)\}"/,
            'die Zelle traegt keinen title mehr');
    });
});

// ── A2-Zwilling ──────────────────────────────────────────────────────

describe('A2-Zwilling — der Typfilter ueberlebt den Neuaufbau des Gitters', () => {

    /** Eine Kachel, wie renderCurrentMetaDeckGrid sie erzeugt. */
    function kachel(name, typ) {
        const k = new Set();
        return {
            _attr: { 'data-card-name': name, 'data-card-name-de': name, 'data-card-type': typ,
                     'data-card-set': 'tef', 'data-card-number': '1' },
            getAttribute(a) { return this._attr[a] || ''; },
            classList: {
                add: (...c) => c.forEach(x => k.add(x)),
                remove: (...c) => c.forEach(x => k.delete(x)),
                contains: (c) => k.has(c),
            },
            _sichtbar: () => !k.has('d-none'),
        };
    }

    /* Der echte Filter (js/deck-analysis-shared.js, IIFE am Stueck), der
       echte Reiter-Filter und der echte Nachzieher aus
       js/app-current-meta-analysis.js — nichts davon ist nachgebaut. */
    function baue(typFilter, o) {
        o = o || {};
        const kacheln = [kachel('rare candy', 'Item'), kachel('boss', 'Supporter'),
                         kachel('dragapult', 'Pokemon')];
        const gitterAttr = {};
        const knoten = {
            currentMetaOverviewSearch: { value: o.suche || '' },
            currentMetaDeckGrid: {
                querySelectorAll: () => kacheln,
                getAttribute: (a) => (a in gitterAttr ? gitterAttr[a] : null),
                setAttribute: (a, v) => { gitterAttr[a] = String(v); },
                removeAttribute: (a) => { delete gitterAttr[a]; },
            },
            currentMetaCardCount: { textContent: '', setAttribute() {}, removeAttribute() {} },
            currentMetaCardCountSummary: { textContent: '' },
        };
        const kontext = {
            document: { getElementById: (id) => knoten[id] || null },
            console: { warn() {}, error() {}, log() {} },
            t: (k) => (k === 'cl.cards' ? 'Karten' : k),
            devLog() {},
            currentMetaOverviewCardTypeFilter: typFilter,
            _currentMetaRenderGen: 7,
        };
        kontext.window = kontext;
        kontext.getLang = () => 'de';
        vm.createContext(kontext);
        vm.runInContext(GETEILT, kontext, { filename: 'deck-analysis-shared.js' });
        vm.runInContext(
            ausCm('function filterCurrentMetaOverviewCards()') + '\n' +
            ausCm('function _currentMetaFilterNachziehen(renderGen)') + '\n',
            kontext, { filename: 'typfilter.js' });
        return { kontext, knoten, kacheln, gitterAttr,
                 sichtbare: () => kacheln.filter(k => k._sichtbar()).length };
    }

    it('ohne Typfilter bleibt alles sichtbar und der Zaehler stimmt', () => {
        const b = baue('all');
        assert.equal(b.kontext._currentMetaFilterNachziehen(7), true);
        assert.equal(b.sichtbare(), 3);
        assert.equal(b.knoten.currentMetaCardCount.textContent, '3 Karten');
    });

    it('ein gesetzter Typfilter greift nach dem Neuzeichnen wieder', () => {
        /* DIE MUTATION, DIE HIER ROT WIRD: den Aufruf von
           filterCurrentMetaOverviewCards() aus _currentMetaFilterNachziehen()
           entfernen. Dann stehen alle drei Kacheln da, waehrend die
           Schaltflaeche "Item" aktiv markiert bleibt. */
        const b = baue('Item');
        b.kontext._currentMetaFilterNachziehen(7);
        assert.equal(b.sichtbare(), 1,
            'nach dem Neuzeichnen stehen wieder alle Kacheln da, obwohl "Item" gewaehlt ist');
        assert.equal(b.knoten.currentMetaCardCount.textContent, '1 Karten',
            'der Zaehler zeigt die ungefilterte Zahl');
    });

    it('das Suchfeld wirkt nach dem Neuzeichnen weiter', () => {
        const b = baue('all', { suche: 'boss' });
        b.kontext._currentMetaFilterNachziehen(7);
        assert.equal(b.sichtbare(), 1, 'die Suche verpufft beim Neuzeichnen');
    });

    it('ein veralteter Lauf filtert nicht mehr', () => {
        /* Ohne diese Wache schreibt ein abgebrochener Deckwechsel seine
           Zahl ueber die des neuen — dieselbe Falle, gegen die der
           Zeichner schon `renderGen !== _currentMetaRenderGen` prueft. */
        const b = baue('Item');
        assert.equal(b.kontext._currentMetaFilterNachziehen(6), false);
        assert.equal(b.sichtbare(), 3, 'ein veralteter Lauf hat trotzdem gefiltert');
        assert.equal(b.knoten.currentMetaCardCount.textContent, '');
    });

    it('der Zeichner zieht erst nach dem LETZTEN Schub nach', () => {
        /* Die Kacheln kommen in Schueben von zwoelf je Frame. Wer sofort
           nach dem ersten Schub filtert, filtert zwoelf von siebzig und
           schreibt "12 Karten" — Befund C3 in js/deck-analysis-shared.js. */
        const zeichner = ausCm('function renderCurrentMetaDeckGrid(cards)');
        assert.match(zeichner, /UEBERSICHT_ZAEHLER_MARKE[^;]*String\(cardHtmls\.length\)/,
            'das Raster sagt nicht mehr an, wie viele Kacheln es tragen wird');
        assert.match(zeichner,
            /offset >= flatHtmls\.length\s*\)\s*\{\s*_currentMetaFilterNachziehen\(renderGen\);/,
            'der Nachzieher haengt nicht mehr am Ende der Schubschleife');
        assert.equal((zeichner.match(/_currentMetaFilterNachziehen\(renderGen\)/g) || []).length, 3,
            'einer der drei Zeichenwege (letzter Schub / kurze Liste / Skelett) zieht nicht nach');
    });

    it('ein leeres Raster nimmt seine Ansage zurueck', () => {
        const zeichner = ausCm('function renderCurrentMetaDeckGrid(cards)');
        const leerZweig = zeichner.slice(zeichner.indexOf('cards.length === 0'));
        const bisEnde = leerZweig.slice(0, leerZweig.indexOf('return;'));
        assert.match(bisEnde, /removeAttribute\(\s*\n?\s*window\.UEBERSICHT_ZAEHLER_MARKE/,
            'die Kachelansage bleibt stehen und meldet einen Aufbau, der nie kommt');
    });
});

// ── B4: der Zaehler hat genau EINEN Schreiber ───────────────────────

describe('B4 — updateCurrentMetaCardCounts schreibt nicht am gemeinsamen Zaehler vorbei', () => {

    /* DER BEFUND, gemessen: bei aktivem Typfilter "Item" stand fuenf
       Frames lang "70 Karten" statt "24 Karten" — und ohne den Vorbehalt
       "Raster wird noch aufgebaut", den uebersichtZaehlerSchreiben()
       setzt. Ursache war ein zweiter Schreiber: countEl.textContent
       direkt aus dieser Funktion.

       js/deck-analysis-shared.js gehoert einem anderen Arbeitspaket. Der
       Schreiber wird hier deshalb nach seinem VERTRAG nachgebildet, nicht
       nach seinem Quelltext. */
    function zaehlerSandkasten(o) {
        o = o || {};
        const knoten = {};
        const mach = (id, klassen) => (knoten[id] = {
            textContent: '', _attr: {},
            classList: {
                _s: new Set(klassen || []),
                contains(c) { return this._s.has(c); },
                add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            },
            setAttribute(k, v) { this._attr[k] = v; },
            removeAttribute(k) { delete this._attr[k]; },
        });
        mach('currentMetaCardCount');
        mach('currentMetaCardCountSummary');
        mach('currentMetaDeckTableView', o.tabelleAktiv ? [] : ['d-none']);
        if (!o.ohneGitter) mach('currentMetaDeckGrid');
        if (!o.ohneSuchfeld) mach('currentMetaOverviewSearch');
        if (!o.ohneGitter) knoten.currentMetaDeckGrid._attr['data-kacheln-soll'] = '70';

        const spuren = { filter: 0, schreiber: [] };
        const kontext = {
            console: { warn() {}, error() {}, log() {} },
            document: { getElementById: (id) => knoten[id] || null },
            t: (k) => k,
            getLang: () => 'de',
            filterCurrentMetaOverviewCards: () => { spuren.filter++; },
        };
        kontext.window = kontext;
        kontext.UEBERSICHT_ZAEHLER_MARKE = 'data-kacheln-soll';
        kontext.uebersichtZaehlerSchreiben = (id, opt) => {
            spuren.schreiber.push({ zaehlerId: id, ...opt });
            const el = knoten[id];
            if (el) el.textContent = `${opt.anzahl} ${opt.kartenWort}`;
        };
        vm.createContext(kontext);
        vm.runInContext(ausCm('function updateCurrentMetaCardCounts(uniqueCount, filteredTotal, allTotal)'),
            kontext, { filename: 'zaehler.js' });
        return { kontext, knoten, spuren };
    }

    it('Rasteransicht: der Zaehler geht ueber den Kachelfilter, nicht ueber diese Funktion', () => {
        const s = zaehlerSandkasten({ tabelleAktiv: false });
        s.kontext.updateCurrentMetaCardCounts(70, 60, 60);
        assert.equal(s.spuren.filter, 1,
            'der Kachelfilter wird nicht mehr angestossen — dann steht bei aktivem '
            + 'Typfilter wieder die ungefilterte Zahl da');
        assert.equal(s.knoten.currentMetaCardCount.textContent, '',
            'diese Funktion schreibt den Zaehler wieder selbst — genau Befund B4');
        assert.equal(s.spuren.schreiber.length, 0);
        // Die Summe daneben ist eine ANDERE Zahl und bleibt hier.
        assert.equal(s.knoten.currentMetaCardCountSummary.textContent, '/ 60 cl.total');
    });

    it('Tabellenansicht: dort gibt es keine Kacheln, also der gemeinsame Schreiber', () => {
        const s = zaehlerSandkasten({ tabelleAktiv: true });
        s.kontext.updateCurrentMetaCardCounts(24, 60, 60);
        assert.equal(s.spuren.filter, 0, 'in der Tabelle wuerden 0 Kacheln gezaehlt');
        assert.equal(s.spuren.schreiber.length, 1,
            'der Zaehler laeuft nicht ueber uebersichtZaehlerSchreiben');
        assert.equal(s.spuren.schreiber[0].zaehlerId, 'currentMetaCardCount');
        assert.equal(s.spuren.schreiber[0].anzahl, 24);
        assert.equal(s.knoten.currentMetaCardCount.textContent, '24 cl.cards');
    });

    it('Tabellenansicht: die Ansage des Rasters wird zurueckgenommen', () => {
        /* Sonst meldete der naechste Filterlauf einen Aufbau, der nie
           kommt (Vorbild js/app-past-meta.js). */
        const s = zaehlerSandkasten({ tabelleAktiv: true });
        assert.equal(s.knoten.currentMetaDeckGrid._attr['data-kacheln-soll'], '70');
        s.kontext.updateCurrentMetaCardCounts(24, 60, 60);
        assert.equal(s.knoten.currentMetaDeckGrid._attr['data-kacheln-soll'], undefined);
    });

    it('ohne Suchfeld bleibt der Zaehler nicht stehen', () => {
        /* uebersichtKachelnFiltern() steigt ohne Suchfeld wortlos aus.
           Dann muss diese Funktion den gemeinsamen Schreiber selbst
           rufen — sonst bliebe eine alte Zahl stehen. */
        const s = zaehlerSandkasten({ tabelleAktiv: false, ohneSuchfeld: true });
        s.kontext.updateCurrentMetaCardCounts(12, 60, 60);
        assert.equal(s.spuren.filter, 0);
        assert.equal(s.spuren.schreiber.length, 1);
        assert.equal(s.knoten.currentMetaCardCount.textContent, '12 cl.cards');
    });

    it('die Funktion fasst textContent des Zaehlers nirgends mehr direkt an', () => {
        /* Die Gegenprobe zum Verhalten oben: der Name des Knotens taucht
           in dieser Funktion nur noch als Argument des gemeinsamen
           Schreibers auf. */
        const rumpf = ausCm('function updateCurrentMetaCardCounts(uniqueCount, filteredTotal, allTotal)');
        assert.doesNotMatch(rumpf, /countEl\s*\.\s*textContent/,
            'der zweite Schreiber ist zurueck');
        assert.match(rumpf, /uebersichtZaehlerSchreiben\('currentMetaCardCount'/);
    });
});
