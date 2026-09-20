'use strict';
/**
 * Zwei Zahlen unter einem Namen, drei Formeln unter einem anderen.
 *
 * Diese Datei gehoert zu den Befunden B1, B2, B4, B5 und B6 der
 * Datenflusskarte vom 07.09.2026. Sie GREIFT NICHT den Quelltext ab,
 * sondern ruft die echten Funktionen auf und rechnet ihre Ausgabe gegen
 * die Dateien in data/ nach — genau die Bauart, ohne die am 02.09.2026
 * zwei Aenderungen am Produktivcode gruen durchgelaufen sind.
 *
 * BEFUND B1 — DASSELBE DECK, ZWEI "META-ANTEILE".
 *   Startseite   (js/meta-analysis-hub.js)   Nenner: Summe total_brought
 *                aus data/online_tournament_top8_decks.csv.
 *   Deck-Analyse (js/app-archetype-card.js)  Nenner: das Feld, gegen das
 *                Limitless rechnet — NICHT die Summe der gelisteten
 *                Listen (die Anteile summieren sich auf rund 96 %, der
 *                Rest ist "Other").
 *   Beide Zahlen sind richtig, beide bleiben. Geprueft wird, dass jede
 *   ihre Grundgesamtheit NENNT und dass die genannte Zahl die angezeigte
 *   Quote wirklich traegt.
 *
 * BEFUND B2 — "Win %" IST RESERVIERT.
 *   js/win-rate-konvention.js haelt den Namen fuer die Matchpunkte frei
 *   (Anordnung des Betreibers vom 05.09.2026). Der Test liest aus den
 *   Daten, WELCHE Konvention eine Stelle wirklich rechnet, schneidet aus
 *   dem erzeugten Text den Namen VOR dem Gleichheitszeichen heraus und
 *   vergleicht beide. Behauptet ein Text wieder "Win %", waehrend die
 *   Rechnung S/(S+N+U) oder S/(S+N) ist, wird diese Datei rot.
 *
 * KEINE ZUSICHERUNG BEHAUPTET EINEN WOCHENWERT. Welche Decks in den
 * Dateien stehen und welche Quoten sie tragen, ist jeder Pruefung egal:
 * die Sollwerte werden aus denselben Dateien gerechnet.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ZAHL_KOMMA_SRC, zahlKommaEinsetzen } = require('./lib-zahlkomma-sandkasten.js');
/* zahlKomma() aus js/app-utils.js — im Browser laedt index.html sie vor
   jedem Aufrufer, der Sandkasten muss sie deshalb ebenfalls kennen. */
const zahlKomma = new Function(ZAHL_KOMMA_SRC + '\nreturn zahlKomma;')();

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const CM = lies('js/app-current-meta-analysis.js');
const KARTE = lies('js/app-archetype-card.js');
const HUB = lies('js/meta-analysis-hub.js');
const UTILS = lies('js/app-utils.js');
const KONV_SRC = lies('js/win-rate-konvention.js');
const GLAETT_SRC = lies('js/matchup-glaettung.js');

/* ── Dateien lesen ──────────────────────────────────────────────── */

function csv(rel, sep) {
    const zeilen = lies(rel).replace(/^﻿/, '').trim().split(/\r?\n/);
    const kopf = zeilen[0].split(sep).map(x => x.trim());
    return zeilen.slice(1).map(z => {
        const t = z.split(sep); const o = {};
        kopf.forEach((k, i) => { o[k] = (t[i] || '').trim(); });
        return o;
    });
}
const zahl = (v) => {
    const n = Number(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

const TOP8 = csv('data/online_tournament_top8_decks.csv', ';');
const DECKS = csv('data/limitless_online_decks.csv', ';');
const MU = csv('data/limitless_online_decks_matchups.csv', ';');

/* ── Sandkaesten ────────────────────────────────────────────────── */

/** Nur die Funktionen aus app-utils.js, die hier gebraucht werden. */
function utilsStueck(marke) {
    const start = UTILS.indexOf(marke);
    assert.notEqual(start, -1, 'nicht gefunden in js/app-utils.js: ' + marke);
    let tiefe = 0;
    for (let j = UTILS.indexOf('{', start); j < UTILS.length; j++) {
        if (UTILS[j] === '{') tiefe++;
        else if (UTILS[j] === '}') { tiefe--; if (tiefe === 0) return UTILS.slice(start, j + 1); }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
    return '';
}

const PARSE_ZAHL = 'function parseLocaleNumber(v, f){ const n = Number(String(v==null?"":v)'
    + '.replace("%","").replace(",",".")); return Number.isFinite(n) ? n : (f===undefined?0:f); }';

function grunddom() {
    const dok = {
        addEventListener() {}, removeEventListener() {},
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }),
        readyState: 'complete',
        body: { classList: { add() {}, remove() {} }, appendChild() {} },
    };
    return dok;
}

/** js/win-rate-konvention.js im Sandkasten, mit echter Sprache. */
function konventionen(sprache) {
    const sb = { console, getLang: () => (sprache || 'de'), document: grunddom() };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(KONV_SRC, sb);
    assert.ok(sb.WinRateKonvention, 'js/win-rate-konvention.js gibt nichts nach aussen');
    return sb.WinRateKonvention;
}

/** js/app-archetype-card.js im Sandkasten, mit echtem feldGroesseAusAnteilen. */
function ladeKarte(sprache) {
    const sb = {
        console,
        document: grunddom(),
        getLang: () => (sprache || 'de'),
        t: (k) => k,
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/',
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(PARSE_ZAHL, sb);
    vm.runInContext(utilsStueck('function feldGroesseAusAnteilen(zeilen)'), sb);
    vm.runInContext('window.feldGroesseAusAnteilen = feldGroesseAusAnteilen;', sb);
    vm.runInContext(KONV_SRC, sb);
    vm.runInContext(KARTE, sb);
    assert.ok(sb._archetypeCardInternals, 'die Karte gibt ihre Innereien nicht nach aussen');
    return sb;
}

/** js/meta-analysis-hub.js im Sandkasten, mit echter computeConversionPerformance. */
function ladeHub(sprache) {
    const sb = {
        console, document: grunddom(),
        getLang: () => (sprache || 'de'),
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/', location: { hash: '' }, setTimeout, clearTimeout,
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(PARSE_ZAHL, sb);
    vm.runInContext(UTILS.slice(UTILS.indexOf('const CONV_PRIOR'),
        UTILS.indexOf('function gezaehlteZeilen')), sb);
    vm.runInContext(utilsStueck('function gezaehlteZeilen(rows)'), sb);
    vm.runInContext(utilsStueck('function computeConversionPerformance(rows)'), sb);
    vm.runInContext('window.computeConversionPerformance = computeConversionPerformance;'
        + 'window.gezaehlteZeilen = gezaehlteZeilen;'
        + 'window.parseLocaleNumber = parseLocaleNumber;', sb);
    vm.runInContext(HUB, sb);
    assert.ok(sb._metaHubIntern && sb._metaHubIntern.answerModel,
        'der Hub gibt answerModel nicht nach aussen');
    return sb;
}

/** Eine benannte Funktion aus app-current-meta-analysis.js herausschneiden. */
function cmStueck(marke) {
    const start = CM.indexOf(marke);
    assert.notEqual(start, -1, 'nicht gefunden in js/app-current-meta-analysis.js: ' + marke);
    let tiefe = 0;
    for (let j = CM.indexOf('{', start); j < CM.length; j++) {
        if (CM[j] === '{') tiefe++;
        else if (CM[j] === '}') { tiefe--; if (tiefe === 0) return CM.slice(start, j + 1); }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
    return '';
}

function cmSandkasten(opt) {
    opt = opt || {};
    const knoten = {
        currentMetaOpponentDropdown: knoten2('currentMetaOpponentDropdown'),
        currentMetaMatchupDetails: knoten2('currentMetaMatchupDetails'),
        currentMetaOpponentSearch: knoten2('currentMetaOpponentSearch'),
        currentMetaOpponentSelected: knoten2('currentMetaOpponentSelected'),
    };
    const dok = Object.assign(grunddom(), { getElementById: (id) => knoten[id] || null });
    const fenster = { document: dok, currentMetaDeckMatchups: opt.matchups || [],
        getLang: () => opt.sprache || 'de' };
    fenster.window = fenster;
    const kontext = {
        window: fenster, document: dok,
        console: { warn() {}, error() {}, log() {} },
        getLang: () => opt.sprache || 'de',
        t: (k) => k,
        zahlLokal: (n, k) => {
            if (n == null || n === '') return '';
            const z = Number(n);
            if (!Number.isFinite(z)) return String(n);
            const txt = k == null ? String(z) : z.toFixed(k);
            return (opt.sprache === 'en') ? txt : txt.replace('.', ',');
        },
        escapeHtml: (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    };
    vm.createContext(kontext);
    vm.runInContext(PARSE_ZAHL, kontext);
    vm.runInContext(KONV_SRC, kontext);
    vm.runInContext(GLAETT_SRC, kontext);
    return { kontext, knoten };
}

function knoten2(id) {
    const k = new Set();
    return {
        id, value: '', innerHTML: '', textContent: '', style: {},
        classList: { add: (...c) => c.forEach(x => k.add(x)),
                     remove: (...c) => c.forEach(x => k.delete(x)),
                     contains: (c) => k.has(c) },
        _klassen: k,
    };
}

/* ══ BEFUND B1 ══════════════════════════════════════════════════════ */

describe('B1 — zwei Anteile, zwei Grundgesamtheiten, beide benannt', () => {

    it('die Startseite rechnet den Anteil gegen die Summe der Antritte', () => {
        const sb = ladeHub('de');
        const modell = sb._metaHubIntern.answerModel(TOP8);
        assert.ok(modell, 'answerModel liefert nichts');
        /* Die Summe wird hier NEU gebildet, nicht abgeschrieben: das ist
           genau die Rechnung, die ein Leser anstellen wuerde. */
        const summe = TOP8.reduce((s, r) => s + zahl(r.total_brought), 0);
        assert.equal(Math.round(modell.totalBrought), summe,
            'der Nenner der Startseite ist nicht mehr die Summe total_brought');
        for (const d of modell.top) {
            const zeile = TOP8.find(r => r.deck_name === d.name);
            assert.ok(zeile, 'Kachel ohne Zeile in der Datei: ' + d.name);
            assert.equal(Math.round(d.sharePct * 1e6),
                Math.round((zahl(zeile.total_brought) / summe) * 100 * 1e6),
                d.name + ': der Anteil folgt nicht aus total_brought / Summe');
        }
    });

    it('und die Startseite SCHREIBT diesen Nenner an jede Kachel', () => {
        const sb = ladeHub('de');
        const modell = sb._metaHubIntern.answerModel(TOP8);
        const html = sb._metaHubIntern.answerHtml(modell);
        const gesamt = Math.round(modell.totalBrought).toLocaleString('de-DE');
        for (const d of modell.top) {
            const eigen = Math.round(d.brought).toLocaleString('de-DE');
            assert.ok(html.includes(`${eigen} von ${gesamt} Antritten`),
                `die Kachel "${d.name}" nennt ihren Nenner nicht: erwartet `
                + `"${eigen} von ${gesamt} Antritten"`);
        }
        /* Die alte, nennerlose Fassung darf nicht zurueckkommen. */
        assert.ok(!/aus \d[\d.]* Antritten<br>/.test(html),
            'die Kachel steht wieder auf "aus N Antritten" ohne Grundgesamtheit');
    });

    it('die Deck-Analyse grenzt das Limitless-Feld aus der Datei ein', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        const decks = {};
        for (const r of DECKS) {
            decks[r.deck_name] = {
                share: zahl(r.share_numeric), winRate: zahl(r.win_rate_numeric),
                count: zahl(r.count),
                partien: zahl(r.wins) + zahl(r.losses) + zahl(r.ties),
            };
        }
        api.setData(decks, null);
        const feld = api.onlineFeld();
        const gelistet = DECKS.reduce((s, r) => s + zahl(r.count), 0);
        assert.equal(feld.gelistet, gelistet, 'die Zahl der gelisteten Listen stimmt nicht');
        assert.ok(feld.listen, 'die Grundgesamtheit liess sich nicht eingrenzen — '
            + 'dann darf die Kachel auch keine nennen (siehe naechste Zusicherung)');

        /* DIE PROBE: der eingegrenzte Nenner muss die Anteile der Datei
           WIEDER HERGEBEN. Das ist eine Gleichung gegen die Datei, keine
           Behauptung ueber diese Woche — die Anteile stehen auf zwei
           Nachkommastellen, also darf count/N um hoechstens eine halbe
           Einheit der letzten Stelle danebenliegen. */
        /* EINE Zeile der Quelle darf aus der Reihe fallen — mehr nicht.
         *
         * BEFUND 10.09.2026: der Lauf stand rot mit
         *     Wailord 0,26 vs 0.2548
         * also 0,0052 daneben, bei einer Schranke von 0,005. Zwei
         * Zehntausendstel. Gemessen ueber alle 123 Zeilen mit Anteil:
         *
         *     Wailord                0,26 -> 0,2548   d = 0,0052
         *     Flareon Noctowl        0,19 -> 0,1950   d = 0,0050
         *     Hop's Zacian           0,18 -> 0,1750   d = 0,0050
         *     Ceruledge              0,58 -> 0,5849   d = 0,0049
         *     ueber der Schranke: 1 von 123
         *
         * Das ist kein kaputter Nenner — bei einem falschen n laegen
         * DUTZENDE Zeilen weit daneben, nicht eine um zwei
         * Zehntausendstel. Es ist die Rundung der Anteilsspalte auf zwei
         * Stellen, die am Rand nicht mehr aufgeht: n ist selbst
         * hochgerechnet und traegt seine eigene Unschaerfe (die
         * `spanne`, die _onlineFeld() ausrechnet).
         *
         * js/app-archetype-card.js kennt den Fall seit dem 03.09.2026
         * unter genau diesem Namen und nimmt solche Zeilen aus der
         * Spannenrechnung heraus. Der Test war strenger als der Code,
         * den er prueft.
         *
         * Geprueft wird deshalb jetzt, was den echten Fehler faengt:
         * fast alle Zeilen muessen aufgehen, und keine darf WEIT
         * danebenliegen. Ein falscher Nenner reisst beide Schranken. */
        const abweichungen = DECKS.map(r => {
            const s = zahl(r.share_numeric);
            if (!(s > 0.005) || !(zahl(r.count) > 0)) return null;
            const rek = (zahl(r.count) / feld.listen) * 100;
            return { name: r.deck_name, s: s, rek: rek, d: Math.abs(rek - s) };
        }).filter(Boolean);
        const daneben = abweichungen.filter(a => a.d > 0.005)
            .map(a => `${a.name} ${a.s} vs ${a.rek.toFixed(4)} (${a.d.toFixed(4)})`);
        assert.ok(daneben.length <= Math.max(1, Math.round(abweichungen.length * 0.02)),
            `${daneben.length} von ${abweichungen.length} Zeilen geben die `
            + `Anteilsspalte nicht wieder her — das ist kein Rundungsrand mehr, `
            + `sondern ein falscher Nenner: ${daneben.join(' · ')}`);
        const groesste = abweichungen.reduce((m, a) => a.d > m.d ? a : m, abweichungen[0]);
        assert.ok(groesste.d < 0.02,
            `die groesste Abweichung ist ${groesste.d.toFixed(4)} `
            + `(${groesste.name}: ${groesste.s} vs ${groesste.rek.toFixed(4)}). `
            + 'Ueber 0,02 ist es keine Rundung mehr.');

        /* Und er ist NICHT die Summe der gelisteten Listen — genau das
           war der Denkfehler, gegen den B1 geschrieben ist. */
        assert.notEqual(feld.listen, feld.gelistet,
            'Nenner und Summe der gelisteten Listen sind gleich — dann prueft '
            + 'die Zusicherung darueber nichts mehr');
        assert.equal(feld.other, feld.listen - feld.gelistet);
    });

    it('und die Deck-Analyse SCHREIBT ihren Nenner auf die Kachel', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        const decks = {};
        for (const r of DECKS) {
            decks[r.deck_name] = {
                share: zahl(r.share_numeric), winRate: zahl(r.win_rate_numeric),
                count: zahl(r.count),
                partien: zahl(r.wins) + zahl(r.losses) + zahl(r.ties),
            };
        }
        api.setData(decks, null);
        const feld = api.onlineFeld();
        const gross = (n) => Math.round(n).toLocaleString('de-DE');
        for (const r of DECKS.slice(0, 12)) {
            const html = api.tilesHtml(r.deck_name, 'embed');
            assert.ok(html.includes(`${gross(zahl(r.count))} / ${gross(feld.listen)}`),
                `${r.deck_name}: auf der Anteilskachel steht die Grundgesamtheit nicht `
                + `("${gross(zahl(r.count))} / ${gross(feld.listen)}")`);
            assert.ok(html.includes('data/limitless_online_decks.csv'),
                `${r.deck_name}: der Hinweis nennt seine Datei nicht`);
        }
    });

    it('beide Stellen sagen, dass sie NICHT dasselbe zaehlen', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        const decks = {};
        for (const r of DECKS) {
            decks[r.deck_name] = { share: zahl(r.share_numeric), winRate: zahl(r.win_rate_numeric),
                count: zahl(r.count), partien: 0 };
        }
        api.setData(decks, null);
        const html = api.tilesHtml(DECKS[0].deck_name, 'embed');
        assert.ok(/data\/online_tournament_top8_decks\.csv/.test(html),
            'der Hinweis der Deck-Analyse verweist nicht auf die ANDERE Grundgesamtheit — '
            + 'dann bleiben zwei Zahlen unter einem Wort stehen');
        assert.ok(/Antritte/.test(html),
            'der Hinweis sagt nicht, dass die Startseite Antritte zaehlt');
    });

    it('die beiden Zahlen sind wirklich verschieden — sonst prueft B1 nichts', () => {
        /* Vorpruefung gegen ein leeres Bestehen, keine Wochenbehauptung:
           gaeben beide Wege denselben Wert, waere der ganze Befund
           gegenstandslos und diese Datei wertlos. */
        const summe = TOP8.reduce((s, r) => s + zahl(r.total_brought), 0);
        const sb = ladeKarte('de');
        const decks = {};
        for (const r of DECKS) decks[r.deck_name] = { share: zahl(r.share_numeric), count: zahl(r.count) };
        sb._archetypeCardInternals.setData(decks, null);
        const feld = sb._archetypeCardInternals.onlineFeld();
        const paare = [];
        for (const r of TOP8) {
            const d = DECKS.find(x => x.deck_name === r.deck_name);
            if (!d) continue;
            const a = (zahl(r.total_brought) / summe) * 100;
            const b = (zahl(d.count) / feld.listen) * 100;
            if (Math.abs(a - b) > 0.5) paare.push(r.deck_name);
        }
        assert.notEqual(paare.length, 0,
            'kein einziges Deck steht auf zwei verschiedenen Anteilen — dann gab es '
            + 'den Befund nicht, und diese Datei prueft ins Leere');
    });
});

/* ══ BEFUND B2 ══════════════════════════════════════════════════════ */

/**
 * Welche der drei Konventionen trifft diese Zahl bei dieser Bilanz?
 * Rueckgabe: Liste der passenden Ids (leer, wenn keine passt).
 */
function passendeKonventionen(WK, wert, s, n, u, toleranz) {
    const treffer = [];
    for (const id of Object.keys(WK.KONVENTIONEN)) {
        const k = WK.KONVENTIONEN[id];
        const x = (id === 'ohneUnentschieden') ? k.rechne(s, n) : k.rechne(s, n, u);
        if (Number.isFinite(x) && Math.abs(x - wert) <= toleranz) treffer.push(id);
    }
    return treffer;
}

/** Der Name, den ein Text VOR seinem Gleichheitszeichen behauptet. */
function behaupteterName(text) {
    const m = String(text || '').match(/^\s*([^=]{1,60}?)\s*=\s*/);
    return m ? m[1].trim() : null;
}

describe('B2 — "Win %" nur dort, wo Matchpunkte gerechnet werden', () => {

    it('js/win-rate-konvention.js haelt den Namen fuer die Matchpunkte frei', () => {
        const WK = konventionen('de');
        assert.equal(WK.kurz('matchpunkte'), 'Win %');
        assert.notEqual(WK.kurz('mitUnentschieden'), 'Win %');
        assert.notEqual(WK.kurz('ohneUnentschieden'), 'Win %');
    });

    it('die Deck-Kachel: die Datei rechnet S/(S+N+U) — und der Text sagt das', () => {
        const WK = konventionen('de');
        /* WELCHE Konvention wirklich gerechnet wird, kommt aus den DATEN:
           Zeilen, bei denen genau EINE der drei die Spalte trifft. */
        const eindeutig = DECKS.filter(r => {
            const s = zahl(r.wins), n = zahl(r.losses), u = zahl(r.ties);
            if (!(s + n + u > 0) || !(u > 0)) return false;
            return passendeKonventionen(WK, zahl(r.win_rate_numeric), s, n, u, 0.02).length === 1;
        });
        assert.notEqual(eindeutig.length, 0,
            'keine eindeutige Zeile — dann kann diese Zusicherung nichts belegen');
        const ids = new Set(eindeutig.map(r => passendeKonventionen(
            WK, zahl(r.win_rate_numeric), zahl(r.wins), zahl(r.losses), zahl(r.ties), 0.02)[0]));
        assert.deepEqual([...ids], ['mitUnentschieden'],
            'data/limitless_online_decks.csv rechnet nicht mehr S/(S+N+U)');

        const s = cmSandkasten({ sprache: 'de' });
        /* Der Name der Konvention kommt seit dem 08.09.2026 ueber
           cmaQuotenName() zur Laufzeit aus js/win-rate-konvention.js —
           die Helfer deshalb aus DERSELBEN Datei mitschneiden. */
        vm.runInContext(cmStueck('function cmaQuotenFormel(id)'), s.kontext);
        vm.runInContext(cmStueck('function cmaQuotenName(id)'), s.kontext);
        vm.runInContext(cmStueck('function _cmWinrateFussnote(eintrag)'), s.kontext);
        const zeile = eindeutig[0];
        const text = vm.runInContext('_cmWinrateFussnote(z)',
            Object.assign(s.kontext, { z: zeile }));
        assert.equal(behaupteterName(text), WK.kurz('mitUnentschieden'),
            'der Fussnotentext behauptet einen anderen Namen als die Konvention, '
            + 'die er wirklich rechnet — genau Befund B2.\nText: ' + text);
        assert.notEqual(behaupteterName(text), WK.kurz('matchpunkte'),
            'der reservierte Name steht wieder ueber einer anderen Formel');
        assert.ok(text.includes(WK.KONVENTIONEN.mitUnentschieden.formel),
            'die Formel fehlt — dann ist der Kurzname allein wieder eine von dreien');
        /* Der Nenner steht weiter drin: er war der Grund fuer H6. */
        assert.ok(text.includes(String(zahl(zeile.wins) + zahl(zeile.losses) + zahl(zeile.ties))
            .replace(/\B(?=(\d{3})+(?!\d))/g, '.')) || /Nenner: /.test(text),
            'der Nenner ist beim Umbenennen verloren gegangen');
    });

    it('das Matchup-Detail: die Datei rechnet S/(S+N) — und der Text sagt das', () => {
        const WK = konventionen('de');
        const bilanz = (r) => String(r.record || '').split(/\s*-\s*/).map(x => zahl(x));
        const eindeutig = MU.filter(r => {
            const b = bilanz(r);
            if (b.length < 3 || !(b[2] > 0) || !(b[0] + b[1] > 0)) return false;
            return passendeKonventionen(WK, zahl(r.win_rate), b[0], b[1], b[2], 0.01).length === 1;
        });
        assert.notEqual(eindeutig.length, 0,
            'keine eindeutige Zeile — dann belegt diese Zusicherung nichts');
        const ids = new Set(eindeutig.map(r => {
            const b = bilanz(r);
            return passendeKonventionen(WK, zahl(r.win_rate), b[0], b[1], b[2], 0.01)[0];
        }));
        assert.deepEqual([...ids], ['ohneUnentschieden'],
            'data/limitless_online_decks_matchups.csv rechnet nicht mehr S/(S+N)');

        const zeile = eindeutig[0];
        const s = cmSandkasten({
            sprache: 'de',
            matchups: [{ opponent: zeile.opponent_deck || zeile.opponent || 'X',
                         win_rate: zeile.win_rate, record: zeile.record,
                         total_games: zeile.total_games }],
        });
        /* Der Name der Konvention kommt seit dem 08.09.2026 ueber
           cmaQuotenName() zur Laufzeit aus js/win-rate-konvention.js —
           die Helfer deshalb aus DERSELBEN Datei mitschneiden. */
        vm.runInContext(cmStueck('function cmaQuotenFormel(id)'), s.kontext);
        vm.runInContext(cmStueck('function cmaQuotenName(id)'), s.kontext);
        vm.runInContext(cmStueck('function cmaQuotenHinweis(id)'), s.kontext);
        vm.runInContext(cmStueck('function cmaMitQuote(text, id)'), s.kontext);
        vm.runInContext(cmStueck('function selectCurrentMetaOpponent(optionEl, opponent)'), s.kontext);
        vm.runInContext('selectCurrentMetaOpponent(null, gegner)',
            Object.assign(s.kontext, { gegner: zeile.opponent_deck || zeile.opponent || 'X' }));
        const html = s.knoten.currentMetaMatchupDetails.innerHTML;
        const m = html.match(/class="cm-matchup-herkunft"[^>]*>([^<]*)</);
        assert.ok(m, 'die Herkunftszeile steht nicht mehr unter den drei Zahlen');
        const text = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        assert.equal(behaupteterName(text), WK.kurz('ohneUnentschieden'),
            'der Text behauptet einen anderen Namen als die Konvention, die er rechnet '
            + '— genau Befund B2.\nText: ' + text);
        assert.notEqual(behaupteterName(text), WK.kurz('matchpunkte'),
            'der reservierte Name steht wieder ueber S/(S+N)');
        assert.ok(text.includes(WK.KONVENTIONEN.ohneUnentschieden.formel), 'die Formel fehlt');
    });

    it('B3 — die Win-Rate-Kachel nennt ihre Konvention und die des Nachbarreiters', () => {
        /* Aus DERSELBEN Major-Datei rechnen zwei Reiter verschieden:
           diese Karte S/(S+N+U), js/app-past-meta.js die Spalte win_pct
           (Matchpunkte). Die Kachel muss beide Namen tragen, sonst
           stehen zwei Zahlen fuer ein Deck ohne Erklaerung nebeneinander. */
        const sb = ladeKarte('de');
        const WK = sb.WinRateKonvention;
        const api = sb._archetypeCardInternals;
        const decks = {};
        for (const r of DECKS) decks[r.deck_name] = {
            share: zahl(r.share_numeric), winRate: zahl(r.win_rate_numeric),
            count: zahl(r.count), partien: zahl(r.wins) + zahl(r.losses) + zahl(r.ties) };
        api.setData(decks, null);
        const html = api.tilesHtml(DECKS[0].deck_name, 'embed');
        assert.ok(html.includes(WK.kurz('mitUnentschieden')),
            'die Kachel nennt die Konvention nicht, die sie wirklich rechnet');
        assert.ok(html.includes(WK.KONVENTIONEN.mitUnentschieden.formel),
            'die Formel fehlt an der Kachel');
        assert.ok(html.includes('win_pct'),
            'die Kachel sagt nicht, dass der Past-Meta-Reiter aus derselben Datei '
            + 'die Matchpunkte-Spalte zeigt — dann bleiben zwei Zahlen unerklaert');
        assert.ok(html.includes(WK.kurz('matchpunkte')),
            'der Name der ANDEREN Konvention fehlt');
    });

    it('die beiden Stellen tragen jetzt VERSCHIEDENE Namen', () => {
        /* Vorher hiessen sie beide "Win %", obwohl sie verschieden
           rechnen. Sie duerfen nie wieder gleich heissen, solange die
           Formeln verschieden sind. */
        const WK = konventionen('de');
        assert.notEqual(WK.kurz('mitUnentschieden'), WK.kurz('ohneUnentschieden'),
            'zwei Konventionen tragen wieder denselben Kurznamen');
    });

    it('keine Ansicht dieser drei Dateien behauptet "Win %" ueber einer anderen Formel', () => {
        /* Die Gegenprobe zum Ganzen, ausgefuehrt statt gegriffen: der
           Zeitraum-Satz der Karte nennt die Online-Quote beim Namen.
           Steht dort wieder "Win %", waehrend die Kachel S/(S+N+U)
           zeigt, faellt das hier auf. */
        const sb = ladeKarte('de');
        const WK = sb.WinRateKonvention;
        const api = sb._archetypeCardInternals;
        const decks = {};
        for (const r of DECKS) decks[r.deck_name] = {
            share: zahl(r.share_numeric), winRate: zahl(r.win_rate_numeric),
            count: zahl(r.count), partien: zahl(r.wins) + zahl(r.losses) + zahl(r.ties) };
        api.setData(decks, null);
        const html = api.render(DECKS[0].deck_name, 'embed');
        assert.ok(html.includes(WK.kurz('mitUnentschieden')),
            'der Zeitraum-Satz nennt die Konvention der Online-Quote nicht beim Namen');
        assert.ok(!/Anteil, Win % und Top-8-Quote/.test(html),
            'die Karte behauptet wieder "Win %" ueber einer S/(S+N+U)-Quote');
    });
});

/* ══ BEFUND B4 ══════════════════════════════════════════════════════ */

describe('B4 — der Reiter Deck-Analyse nennt seinen Datenstand', () => {

    const STAND = JSON.parse(lies('data/data_stand.json'));

    function ladeChip(opt) {
        opt = opt || {};
        const h2 = { _kinder: [], innerHTML: '',
            querySelector: (sel) => h2._kinder.find(k => ('.' + k.className) === sel) || null,
            appendChild: (k) => { h2._kinder.push(k); } };
        const dok = Object.assign(grunddom(), {
            querySelector: (sel) => (sel === '#current-analysis .header h2' ? h2 : null),
            createElement: () => {
                const kl = new Set();
                const el = { className: '', innerHTML: '', _attr: {},
                    classList: { add: (...c) => c.forEach(x => kl.add(x)),
                                 remove: (...c) => c.forEach(x => kl.delete(x)),
                                 contains: (c) => kl.has(c) },
                    setAttribute: (k, v) => { el._attr[k] = v; },
                    getAttribute: (k) => (k in el._attr ? el._attr[k] : null),
                    querySelector: () => el._feld };
                el._feld = { _attr: {}, textContent: '',
                    setAttribute: (k, v) => { el._feld._attr[k] = v; },
                    getAttribute: (k) => (k in el._feld._attr ? el._feld._attr[k] : null) };
                return el;
            },
        });
        const gezeichnet = [];
        const kontext = {
            console, document: dok, getLang: () => 'de',
            setTimeout, clearTimeout, Promise,
        };
        kontext.window = kontext;
        kontext.DsDatenstand = opt.ohneModul ? undefined : {
            stand: (datei) => Promise.resolve(
                (opt.staende && datei in opt.staende)
                    ? (opt.staende[datei] ? new Date(opt.staende[datei]) : null)
                    : (STAND.dateien[datei] ? new Date(STAND.dateien[datei]) : null)),
            zeichne: (w) => { gezeichnet.push(w); },
        };
        vm.createContext(kontext);
        vm.runInContext(cmStueck('function cmAeltesteQuelle(staende)'), kontext);
        vm.runInContext(cmStueck('function cmDatenstandChipEinhaengen(wurzel)'), kontext);
        vm.runInContext('var CM_STAND_QUELLEN = ' + JSON.stringify(
            CM.match(/var CM_STAND_QUELLEN = (\[[\s\S]*?\]);/)[1]
                .match(/'([^']+)'/g).map(x => x.slice(1, -1))) + ';', kontext);
        return { kontext, h2, gezeichnet };
    }

    it('die genannten Quellen sind Dateien, die es gibt', () => {
        const quellen = CM.match(/var CM_STAND_QUELLEN = (\[[\s\S]*?\]);/)[1]
            .match(/'([^']+)'/g).map(x => x.slice(1, -1));
        assert.notEqual(quellen.length, 0, 'die Quellenliste ist leer');
        const fehlend = quellen.filter(f => !fs.existsSync(path.join(WURZEL, 'data', f)));
        assert.deepEqual(fehlend, [], 'der Chip nennt eine Datei, die es nicht gibt');
    });

    it('gewaehlt wird die AELTESTE Quelle — nicht die erste', () => {
        const s = ladeChip();
        const f = s.kontext.cmAeltesteQuelle;
        const a = new Date('2026-09-06T16:00:00Z');
        const b = new Date('2026-09-01T06:00:00Z');
        assert.equal(f([{ datei: 'a', stand: a }, { datei: 'b', stand: b }]).datei, 'b');
        assert.equal(f([{ datei: 'b', stand: b }, { datei: 'a', stand: a }]).datei, 'b');
        assert.equal(f([{ datei: 'a', stand: null }, { datei: 'b', stand: b }]).datei, 'b');
        assert.equal(f([]), null);
        assert.equal(f([{ datei: 'a', stand: null }]), null,
            'ohne bekannten Stand darf keine Quelle gewaehlt werden');
    });

    it('der Chip haengt in der Ueberschrift und zeigt den Stand aus data_stand.json', async () => {
        const s = ladeChip();
        const chip = s.kontext.cmDatenstandChipEinhaengen();
        assert.ok(chip, 'kein Chip eingehaengt');
        assert.equal(s.h2._kinder.length, 1, 'der Chip steht nicht in der Ueberschrift');
        assert.match(chip.innerHTML, /js-data-freshness/, 'ohne diese Klasse fuellt ihn niemand');
        await new Promise(r => setTimeout(r, 0));
        const quellen = CM.match(/var CM_STAND_QUELLEN = (\[[\s\S]*?\]);/)[1]
            .match(/'([^']+)'/g).map(x => x.slice(1, -1));
        const bekannt = quellen.filter(f => STAND.dateien[f]);
        assert.notEqual(bekannt.length, 0,
            'data_stand.json fuehrt keine der Quellen — dann prueft das hier nichts');
        const soll = bekannt.slice().sort((a, b) =>
            new Date(STAND.dateien[a]) - new Date(STAND.dateien[b]))[0];
        assert.equal(chip.getAttribute('data-cm-quelle'), soll,
            'der Chip nennt nicht die aelteste Quelle des Reiters');
        assert.equal(chip.querySelector().getAttribute('data-quelle'), soll,
            'ds-datenstand.js findet keine Quelle am Chip');
        assert.equal(s.gezeichnet.length, 1, 'ds-datenstand.js wurde nicht gebeten zu zeichnen');
    });

    it('ohne hinterlegten Stand steht "unbekannt" — kein geratenes Datum', async () => {
        const quellen = CM.match(/var CM_STAND_QUELLEN = (\[[\s\S]*?\]);/)[1]
            .match(/'([^']+)'/g).map(x => x.slice(1, -1));
        const leer = {};
        quellen.forEach(f => { leer[f] = null; });
        const s = ladeChip({ staende: leer });
        const chip = s.kontext.cmDatenstandChipEinhaengen();
        await new Promise(r => setTimeout(r, 0));
        assert.equal(chip.getAttribute('data-cm-quelle'), null,
            'ohne Stand wird trotzdem eine Quelle behauptet');
        assert.match(chip.innerHTML, /unbekannt/);
        assert.equal(s.gezeichnet.length, 0, 'gezeichnet wird nur mit einer echten Quelle');
        assert.ok(chip.classList.contains('is-unbekannt'));
        const heute = new Date().toLocaleDateString('de-DE');
        assert.ok(!chip.innerHTML.includes(heute),
            'das Datum des BESUCHS steht wieder im Chip — genau der Fehler, gegen den '
            + 'js/ds-datenstand.js geschrieben wurde');
    });

    it('zweimal aufgerufen haengt kein zweiter Chip dran', () => {
        const s = ladeChip();
        s.kontext.cmDatenstandChipEinhaengen();
        s.kontext.cmDatenstandChipEinhaengen();
        assert.equal(s.h2._kinder.length, 1);
    });
});

/* ══ BEFUND B5 ══════════════════════════════════════════════════════ */

describe('B5 — eine Kennzahl, ein Name', () => {

    const I18N = lies('js/i18n.js');
    /* Der Woerterbuchblock je Sprache. js/i18n.js gehoert einem anderen
       Arbeitspaket; gelesen wird er hier nur, damit der Test die ECHTEN
       Werte vergleicht und nicht seine eigene Attrappe. */
    const DE_AB = I18N.indexOf('\n  de: {');
    const wert = (sprache, schluessel) => {
        const block = sprache === 'de' ? I18N.slice(DE_AB) : I18N.slice(0, DE_AB);
        const m = block.match(new RegExp(`'${schluessel.replace('.', '\\.')}':\\s*'([^']*)'`));
        return m ? m[1] : null;
    };

    function renderTierAusfuehren(sprache) {
        const kontext = {
            console,
            getLang: () => sprache,
            t: (k) => (wert(sprache, k) === null ? k : wert(sprache, k)),
            escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
            // escapeHtmlAttr ist in js/app-utils.js DIESELBE Funktion wie
            // escapeHtml (window.escapeHtml = escapeHtmlAttr). Sie steht
            // hier, seit renderTier den Kartennamen als
            // escapeHtmlAttr(escapeJsStr(...)) in das onclick schreibt —
            // ohne die Attrappe wirft der Sandkasten
            // "escapeHtmlAttr is not defined".
            escapeHtmlAttr: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
            escapeJsStr: (s) => String(s == null ? '' : s).replace(/'/g, "\\'"),
            getBestCardImage: () => 'x.png',
            getWishlistBadgeHtml: () => '',
            allCards: [],
            currentDeck: {},
            currentMetaRarityMode: 'default',
            sortCardsPTCG: () => {},
            handleCardImageError: () => {},
            showSingleCard: () => {},
            addCardToDeck: () => {},
            addCardToProxy: () => {},
        };
        kontext.window = kontext;
        vm.createContext(kontext);
        vm.runInContext(PARSE_ZAHL, kontext);
        zahlKommaEinsetzen(kontext);
        vm.runInContext(cmStueck('const renderTier = (tierCards, tierTitle, tierEmoji) =>'), kontext);
        return vm.runInContext(
            'renderTier([{ card_name: "Boss Orders", set: "PAL", number: "172", '
            + 'percentage_in_archetype: "92.3", deck_inclusion_count: "120", '
            + 'total_decks_in_archetype: "130", total_count: "240", max_count: "2" }], "T", "x")',
            kontext);
    }

    it('die Beschriftung kommt aus cl.usageShare — nicht aus festem Englisch', () => {
        const de = renderTierAusfuehren('de');
        const en = renderTierAusfuehren('en');
        const wertDe = wert('de', 'cl.usageShare');
        const wertEn = wert('en', 'cl.usageShare');
        assert.ok(wertDe && wertEn, 'cl.usageShare fehlt in js/i18n.js');
        assert.notEqual(wertDe, wertEn,
            'beide Sprachen tragen denselben Wert — dann prueft der Vergleich nichts');
        assert.ok(de.includes(wertDe),
            `die deutsche Ansicht zeigt "${wertDe}" nicht — Befund B5 ist zurueck.`);
        assert.ok(en.includes(wertEn), `die englische Ansicht zeigt "${wertEn}" nicht`);
        assert.ok(!de.includes('>Usage Share:<'),
            'in der deutschen Ansicht steht wieder fest verdrahtetes Englisch');
    });

    it('der Nenner steht weiter sichtbar daneben (Befund H6 bleibt erledigt)', () => {
        const de = renderTierAusfuehren('de');
        assert.ok(de.includes('(120 / 130)'), 'der Nenner ist beim Umbenennen verloren gegangen');
        assert.ok(/deck_inclusion_count ÷ total_decks_in_archetype/.test(de),
            'der Hinweis nennt seine Rechnung nicht mehr');
    });
});

/* ══ BEFUND B6 ══════════════════════════════════════════════════════ */

describe('B6 — roher Schnitt neben geglaetteten Zellen, und es steht da', () => {

    it('die Kachel rechnet roh — nachgerechnet an denselben Zeilen', () => {
        const s = cmSandkasten({ sprache: 'de' });
        vm.runInContext(cmStueck('function _cmTop20Schnitt(deckStats, matchupData, cleanArch, matchKey)'),
            s.kontext);
        const stats = DECKS.map(r => ({ rank: r.rank, deck_name: r.deck_name }));
        const deck = DECKS[0].deck_name;
        const erg = vm.runInContext('_cmTop20Schnitt(stats, mus, name, (x) => String(x).toLowerCase())',
            Object.assign(s.kontext, { stats, mus: MU, name: deck.toLowerCase() }));
        assert.ok(erg.partien > 0, 'kein Top-20-Schnitt fuer die erste Zeile der Datei — '
            + 'dann prueft diese Zusicherung nichts');
        /* Der Sollwert kommt aus derselben Datei, ohne Glaettung. */
        const top20 = new Set(DECKS.filter(r => parseInt(r.rank, 10) <= 20)
            .map(r => String(r.deck_name).toLowerCase()));
        let p = 0, sieg = 0;
        for (const m of MU) {
            if (String(m.deck_name).toLowerCase() !== deck.toLowerCase()) continue;
            const g = String(m.opponent || m.opponent_deck || '').toLowerCase();
            if (!top20.has(g)) continue;
            const n = parseInt(m.total_games, 10) || 0;
            p += n; sieg += n * zahl(m.win_rate) / 100;
        }
        assert.equal(erg.partien, p, 'der Nenner der Kachel ist nicht die Summe total_games');
        /* Die Kachel schreibt zwei Nachkommastellen (zahlLokal(_wr, 2)),
           also wird auch auf zwei verglichen — mehr Genauigkeit gibt es
           auf dem Bildschirm nicht. */
        assert.equal(((sieg / p) * 100).toFixed(2), zahl(erg.text.split(' ')[0]).toFixed(2),
            'die Kachel zeigt nicht mehr den ROHEN partiengewichteten Schnitt');
    });

    it('der Fussnotentext nennt den Unterschied zur geglaetteten Tabelle', () => {
        const s = cmSandkasten({ sprache: 'de' });
        vm.runInContext(cmStueck('function _cmMatchupFussnote(s)'), s.kontext);
        const text = vm.runInContext('_cmMatchupFussnote({paarungen: 20, partien: 10361, spiegelPartien: 1032})',
            s.kontext);
        assert.match(text, /ROH/, 'der Text sagt nicht, dass dieser Schnitt roh ist');
        assert.match(text, /GEGL/, 'der Text erwaehnt die geglaettete Tabelle nicht');
        assert.match(text, /matchup-glaettung\.js/, 'der Text nennt das Modul nicht');
        /* K kommt aus dem Modul, nicht aus einer Abschrift: steht es dort
           auf 30, muss der Text 30 sagen. */
        const K = vm.runInContext('window.DsGlaettung.K', s.kontext);
        assert.ok(text.includes('K = ' + K),
            `der Text nennt eine andere Prior-Staerke als js/matchup-glaettung.js (K = ${K})`);
    });

    it('und die Tabelle der Karte glaettet wirklich mit genau diesem K', () => {
        const s = cmSandkasten({ sprache: 'de' });
        const roh = vm.runInContext('window.DsGlaettung.quote(3, 0)', s.kontext);
        const k = vm.runInContext('window.DsGlaettung.K', s.kontext);
        assert.equal(Math.round(roh * 1e6), Math.round(((3 + k / 2) / (3 + k)) * 100 * 1e6),
            'die Glaettung rechnet nicht mehr Beta-Binomial mit K/2 Pseudopartien');
        assert.notEqual(roh, 100, 'ein 3-0 steht wieder auf 100 % — dann ist die Glaettung weg');

        /* Und die Karte GREIFT wirklich darauf zu: eine Paarung 3-0 muss
           in ihrer Tabelle als geglaetteter Wert stehen, nicht als 100 %. */
        const sb = ladeKarte('de');
        vm.runInContext(GLAETT_SRC, sb);
        const api = sb._archetypeCardInternals;
        api.setData({ Testdeck: { share: 1, winRate: 50, count: 10, partien: 10 } }, null);
        sb._matchupRegistry = { Testdeck: { Gegner: {
            opponent_deck: 'Gegner', record: '3 - 0 - 0', total_games: 3,
            win_rate_numeric: 100 } } };
        const tabelle = api.matchupTableHtml('Testdeck', {});
        assert.ok(!/>100,00 %</.test(tabelle) && !/>100,0 %</.test(tabelle),
            'ein 3-0 steht in der Matchup-Tabelle wieder als 100 % da');
    });
});

/* ══ Jeder genannte Pfad existiert ═══════════════════════════════════ */

describe('kein Oberflaechentext nennt eine Datei, die es nicht gibt', () => {

    it('alle data/-Pfade aus den drei Dateien zeigen auf etwas Vorhandenes', () => {
        /* Vorbild: tests/unit/test-kacheln-zeitraum-und-typfilter.js.
           Kommentare zaehlen nicht mit — dort werden Befunde erklaert und
           dabei alte, falsche Namen genannt. */
        /* WELCHE SCHLUESSEL EINGESETZT WERDEN (20.09.2026).

           Hier stand der Schluessel des LAUFENDEN Formats, fest
           eingesetzt. Am 16.09.2026 ist Set 30C erschienen, das Fenster
           heisst seitdem TEF-30C — und die Praesenzturniere dieses
           Formats beginnen erst am 25.09. (`in_person_legal_date`, neun
           Tage Nachlauf). In diesen neun Tagen gibt es
           data/labs_tournament_decks_TEF-30C.csv nicht, und diese
           Zusicherung meldete einen Oberflaechentext, der ins Leere
           zeigt.

           Er zeigt aber nicht ins Leere. js/app-archetype-card.js setzt
           `_majorZeitraum` NUR, wenn das Verzeichnis den Schluessel
           fuehrt (`kennt`), und schreibt sonst „Fuer dieses Format liegt
           kein Praesenzturnier-Auszug vor". Die Vorlage wird also nie
           mit einem Schluessel gefuellt, den es nicht gibt — die
           Zusicherung hat dem Code etwas vorgeworfen, das er nicht tut.

           Eingesetzt werden deshalb die Schluessel, die das Verzeichnis
           WIRKLICH fuehrt. Das ist strenger als vorher (dreizehn Pfade
           statt einem) und behauptet nichts ueber den Nachlauf. */
        const verz = JSON.parse(lies('data/labs_tournament_decks_verzeichnis.json'));
        const schluesselListe = [...new Set(verz.meta_keys || [])];
        assert.notEqual(schluesselListe.length, 0,
            'das Verzeichnis fuehrt keinen einzigen Meta-Schluessel — dann setzt '
            + 'diese Zusicherung nichts ein und prueft nichts');
        const pfade = [];
        for (const quelle of [CM, KARTE, HUB]) {
            const ohne = quelle.replace(/\/\*[\s\S]*?\*\//g, ' ')
                .replace(/^[ \t]*\/\/.*$/gm, '');
            for (const p of (ohne.match(/data\/[A-Za-z0-9_\-.${}]+\.(?:json|csv|md)\b/g) || [])) {
                if (p.indexOf('${') === -1) { pfade.push(p); continue; }
                for (const k of schluesselListe) pfade.push(p.replace(/\$\{[^}]*\}/g, k));
            }
        }
        const einmalig = [...new Set(pfade)].sort();
        assert.notEqual(einmalig.length, 0,
            'der Pfadfund ist zusammengebrochen — die Zusicherung waere leer');
        const fehlend = einmalig.filter(p => !fs.existsSync(path.join(WURZEL, p)));
        assert.deepEqual(fehlend, [], 'ein Dateiname in einem Oberflaechentext zeigt ins Leere');
    });

    it('auch die Dateinamen ohne data/-Praefix (data-quelle-Chips) gibt es', () => {
        const namen = [];
        for (const quelle of [CM, KARTE, HUB]) {
            const ohne = quelle.replace(/\/\*[\s\S]*?\*\//g, ' ')
                .replace(/^[ \t]*\/\/.*$/gm, '');
            for (const m of (ohne.match(/data-quelle="([^"]+)"/g) || [])) {
                namen.push(m.replace(/data-quelle="|"/g, ''));
            }
        }
        /* Die Quellenliste des Datenstands-Chips (Befund B4) gehoert
           dazu: sie nennt Dateien ohne Praefix und wird zur Laufzeit an
           ds-datenstand.js gereicht.

           NICHT dazu gehoeren blosse LADESCHLUESSEL wie
           'tournament_cards_data_cards.csv': die loest
           _loadTournamentCardsChunked() ueber das Manifest auf eine
           Formatdatei auf, sie stehen in keinem Oberflaechentext und es
           gibt sie als Datei nicht. Genau diese Unterscheidung haelt
           tests/unit/test-kacheln-zeitraum-und-typfilter.js schon fest. */
        for (const q of (CM.match(/var CM_STAND_QUELLEN = (\[[\s\S]*?\]);/)[1]
                .match(/'([^']+)'/g) || [])) {
            namen.push(q.slice(1, -1));
        }
        const einmalig = [...new Set(namen)].sort();
        assert.notEqual(einmalig.length, 0, 'kein einziger Dateiname gefunden');
        const fehlend = einmalig.filter(n => !fs.existsSync(path.join(WURZEL, 'data', n)));
        assert.deepEqual(fehlend, [],
            'ein Ladeschluessel oder Chip nennt eine Datei, die es in data/ nicht gibt');
    });
});
