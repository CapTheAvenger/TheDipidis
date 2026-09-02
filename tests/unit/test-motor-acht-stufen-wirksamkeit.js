'use strict';
/*
 * DIE ACHT STUFEN OHNE JEDE ZUSAGE
 * ================================
 *
 * BEFUND (02.09.2026). Nach der Runde, die sieben abschaltbare
 * Konstanten des Prognosemotors abgesichert hat
 * (test-motor-stufen-wirksamkeit.js), blieben von den 23 Stufen ACHT
 * uebrig, die keine einzige Zusage trugen:
 *
 *   2.0   Grundprognose (Modus A/B, Normierung, ausgelieferte Zahl)
 *   3.0   Verlaufssignale (Trendfaktor, Top-8-Quotenverstaerkung)
 *   4.1   Formatfenster (Zeitfilter + Rezenzrampe der Labs-Zeilen)
 *   4.2   Ladder-Bias-Daempfer
 *   4.4   Familienbewusster Labs-Anker
 *   4.4b  Rueckfall auf das Day-1-zu-Day-2-Verhaeltnis
 *   5.1   Day-2-Qualitaetsmultiplikator
 *   5.3   Piloten-Daempfer + Matchup-WR-Korrektur
 *
 * Dieselbe Machart wie die Vorlage: KEINE Zahl des Motors steht hier
 * als Literal. Jede kommt per Regex aus js/app-meta-call.js, und jede
 * Stufe wird nicht beschrieben, sondern AUSGEFUEHRT — der echte
 * Quelltextblock wird herausgeschnitten und in einem vm-Kontext
 * gerechnet. Die Literale, die hier doch stehen, sind BEGRUENDETE
 * SCHRANKEN ("mindestens so gross", "hoechstens so gross") mit der
 * Messung daneben, die sie traegt.
 *
 * ZWEI SACHVERHALTE, DIE HIER NICHT ALS FEHLER GELESEN WERDEN DUERFEN
 * ------------------------------------------------------------------
 * a) Seit dem 28.08.2026 gilt in Modus B `predicted = _kernWert` (der
 *    gemessene Prognosekern). Die gewichtete Modus-B-Formel und alles,
 *    was in sie einfliesst, tragen seither nur noch den Rueckfallzweig.
 *    Die Stufen 3.0, 4.2, 4.4 und 4.4b rechnen aber WEITER — in Modus A
 *    vollstaendig (dort gibt es keinen Kern), in Modus B im
 *    Rueckfallzweig. Deshalb wird hier die Rechnung selbst geprueft und
 *    nicht behauptet, sie erreiche jede Prognose.
 * b) Der gemeldete, bewusst nicht reparierte Einheitenfehler an `n`
 *    (siehe "GEMELDET, NICHT REPARIERT" im Motor und
 *    test-stufen-inventur.js) engt das Tor von 5.1 ein. Diese Datei
 *    sichert deshalb BEIDES zu: dass die Stufe oberhalb des Tores
 *    wirkt, und dass das Tor genau so eng steht, wie es dokumentiert
 *    ist. Wer den Einheitenfehler behebt, macht hier eine Zusage rot —
 *    das ist gewollt: die Behebung ist eine Verhaltensaenderung und
 *    braucht ihre eigene Messung.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const QUELLE = path.join(__dirname, '..', '..', 'js', 'app-meta-call.js');
const SRC = fs.readFileSync(QUELLE, 'utf8');

// ── Werkzeug: alles kommt aus der Quelle ────────────────────────────

/* Jede numerische Konstante des Motors, aus dem Quelltext gelesen. */
const KONSTANTEN = (() => {
    const aus = Object.create(null);
    const re = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g;
    let m;
    while ((m = re.exec(SRC)) !== null) aus[m[1]] = Number(m[2]);
    return aus;
})();

function zahl(name) {
    assert.ok(Object.prototype.hasOwnProperty.call(KONSTANTEN, name),
        `${name} steht nicht mehr als numerische Konstante in js/app-meta-call.js — `
        + 'entweder umbenannt oder in einen Ausdruck verwandelt. Beides macht '
        + 'diese Pruefung blind, deshalb bricht sie hier ab.');
    return KONSTANTEN[name];
}

/* Zahlen, die im Motor als LITERAL in einer Formel stehen (kein
 * benannter const). Auch die werden gelesen, nicht abgeschrieben —
 * sonst prueft der Test seine eigene Kopie. Bricht ab, wenn die Stelle
 * sich geaendert hat: eine blinde Pruefung ist schlimmer als keine. */
function literale(regex, was) {
    const m = SRC.match(regex);
    assert.ok(m, `${was}: die Stelle ist in js/app-meta-call.js nicht mehr `
        + 'auffindbar. Der Test kann die Zahlen dann nicht mehr aus der Quelle '
        + 'lesen und wuerde ab hier nur noch sich selbst pruefen.');
    return m.slice(1).map(Number);
}

/* Schneidet eine benannte Funktion per Klammerzaehlung aus der Quelle. */
function funktionAusQuelle(name) {
    const i = SRC.indexOf(`function ${name}(`);
    assert.notEqual(i, -1, `function ${name} nicht gefunden`);
    const auf = SRC.indexOf('{', i);
    let tiefe = 0;
    for (let k = auf; k < SRC.length; k++) {
        if (SRC[k] === '{') tiefe++;
        else if (SRC[k] === '}') { tiefe--; if (tiefe === 0) return SRC.slice(i, k + 1); }
    }
    assert.fail(`function ${name}: keine schliessende Klammer gefunden`);
}

/* Schneidet einen Anweisungsblock zwischen zwei Textmarken heraus. */
function blockAusQuelle(vonMarke, bisMarke, abIndex) {
    const i = SRC.indexOf(vonMarke, abIndex || 0);
    assert.notEqual(i, -1, `Startmarke nicht gefunden: ${vonMarke}`);
    const j = SRC.indexOf(bisMarke, i);
    assert.notEqual(j, -1, `Endmarke nicht gefunden: ${bisMarke}`);
    return SRC.slice(i, j);
}

/* Fuehrt Quelltext in einem Kontext aus, der ALLE Motorkonstanten
 * traegt. `ueberschreiben` erlaubt die Gegenprobe "dieselbe Rechnung,
 * Konstante neutral". */
function inKontext(code, extras, ueberschreiben) {
    const ctx = Object.assign(
        { Math, Object, Map, Set, Array, Number, Date, JSON, console: { log() {}, info() {}, warn() {} } },
        KONSTANTEN, extras || {}, ueberschreiben || {});
    vm.createContext(ctx);
    new vm.Script(code).runInContext(ctx);
    return ctx;
}

const CLIP = funktionAusQuelle('_clip');

/* Der Quelltext ohne Kommentare. Braucht, wer PRUEFT, ob eine
 * Schreibweise im Code steht — ein Kommentar, der sie zitiert, ist
 * sonst der Treffer. */
const OHNE_KOMM = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

// ════════════════════════════════════════════════════════════════════
// STUFE 2.0 — Grundprognose: Modus, Mischung, Normierung
// ════════════════════════════════════════════════════════════════════

describe('Stufe 2.0 — die Grundprognose: aus der Leiter wird eine Prognose', () => {

    // Die Modus-A-Grundformel, aus der Quelle geschnitten (nicht per
    // Gewichts-Regex — sonst faende der Schnitt eine geaenderte Formel
    // nicht mehr und der Test liefe leer weiter).
    const FORMEL = (() => {
        const i = SRC.indexOf('// Mode A baseline 3.2 (no TG, no explicit CL toggle, no labs).');
        assert.notEqual(i, -1, 'die Modus-A-Grundformel ist nicht mehr auffindbar');
        const j = SRC.indexOf('predicted = ', i);
        const k = SRC.indexOf(';', j);
        return SRC.slice(j, k + 1);
    })();

    const NORMIERUNG = blockAusQuelle(
        'const predictedSum = _shareList.reduce',
        '// Predictor 5.5.5');

    const MODUSZEILE = (() => {
        const m = SRC.match(/_predictorMode = _labsMajorRows > 0 \? '[AB]' : '[AB]';/);
        assert.ok(m, 'die Modusweiche `_labsMajorRows > 0 ? B : A` ist verschwunden — '
            + 'ohne sie entscheidet nichts mehr, ob Labs-Majors ueberhaupt gelesen werden');
        return m[0];
    })();

    /* Ein Feld aus drei Decks durch die Grundformel und die Normierung. */
    function lauf(decks, ueberschreiben) {
        const code = 'globalThis.__f = function (liste) {\n'
            + '  liste.forEach(function (d) {\n'
            + '    const ladderPctDamped = d.ladderPctDamped;\n'
            + '    const broughtPct = d.broughtPct;\n'
            + '    const top8Boost = d.top8Boost;\n'
            + '    const weeklySignal = d.weeklySignal;\n'
            + '    let predicted;\n'
            + FORMEL + '\n'
            + '    d.predictedShareRaw = Math.max(0, predicted);\n'
            + '  });\n'
            + '  const _shareList = liste;\n'
            + NORMIERUNG + '\n'
            + '  return liste;\n};';
        const ctx = inKontext(code, {}, ueberschreiben);
        const liste = decks.map(d => Object.assign({}, d));
        ctx.__f(liste);
        const nach = {};
        liste.forEach(d => { nach[d.name] = d; });
        return nach;
    }

    it('die vier Gewichte der Grundformel stehen in der Quelle, keines auf null', () => {
        // Ein Gewicht auf 0 loescht ein ganzes Signal aus der Prognose,
        // ohne dass die Ausgabe auffaellig wird: die Normierung zieht
        // hinterher ohnehin auf 100 %, jede Liste sieht danach richtig
        // aus (derselbe Befund wie in test-metacall-gewichte-reihenfolge.js).
        const gewichte = (FORMEL.match(/0\.\d+ \*/g) || []).map(x => Number(x.slice(0, -2)));
        assert.equal(gewichte.length, 4,
            `die Grundformel hat ${gewichte.length} Summanden statt vier`);
        gewichte.forEach((g, i) => assert.ok(g > 0,
            `Gewicht ${i + 1} der Grundformel steht auf ${g} — der zugehoerige `
            + 'Signalstrom ist damit aus der Prognose entfernt'));
        const summe = gewichte.reduce((s, x) => s + x, 0);
        assert.ok(Math.abs(summe - 1) < 1e-9,
            `die Gewichte summieren auf ${summe} statt 1`);
    });

    it('nachgerechnet: die Prognose folgt NICHT der Online-Leiter', () => {
        // Genau das ist der Zweck der Stufe. Casual-Deck: 8 % Leiter,
        // aber kaum Turniererfolg. Wettkampfdeck: 5 % Leiter, dafuer
        // hohe Top-8-Quote. Sagt die Prognose dieselbe Reihenfolge wie
        // die Leiter, hat die ganze Stufe nichts getan.
        const nach = lauf([
            { name: 'casual',      ladderPctDamped: 8.0, broughtPct: 2.0, top8Boost: 1.0,  weeklySignal: 8.0 },
            { name: 'wettkampf',   ladderPctDamped: 5.0, broughtPct: 6.0, top8Boost: 12.0, weeklySignal: 5.0 },
            { name: 'mitlaeufer',  ladderPctDamped: 3.0, broughtPct: 3.0, top8Boost: 3.0,  weeklySignal: 3.0 },
        ]);
        assert.ok(nach.wettkampf.predictedShare > nach.casual.predictedShare,
            `das Casual-Deck (8 % Leiter, Top-8-Boost 1,0) liegt mit `
            + `${nach.casual.predictedShare.toFixed(2)} % vor dem Wettkampfdeck `
            + `(5 % Leiter, Top-8-Boost 12,0) mit ${nach.wettkampf.predictedShare.toFixed(2)} % — `
            + 'die Grundformel reicht die Leiterreihenfolge durch');
        // Der Abstand ist kein Rundungsrest: mindestens 5 pp.
        assert.ok(nach.wettkampf.predictedShare - nach.casual.predictedShare > 5,
            'der Vorsprung des Wettkampfdecks ist so klein, dass ihn jede '
            + 'nachfolgende Stufe wieder umdreht');
    });

    it('nachgerechnet: die ausgelieferte Liste summiert auf 100 %', () => {
        const nach = lauf([
            { name: 'a', ladderPctDamped: 8.0, broughtPct: 2.0, top8Boost: 1.0,  weeklySignal: 8.0 },
            { name: 'b', ladderPctDamped: 5.0, broughtPct: 6.0, top8Boost: 12.0, weeklySignal: 5.0 },
            { name: 'c', ladderPctDamped: 3.0, broughtPct: 3.0, top8Boost: 3.0,  weeklySignal: 3.0 },
        ]);
        const summe = ['a', 'b', 'c'].reduce((s, n) => s + nach[n].predictedShare, 0);
        assert.ok(Math.abs(summe - 100) < 1e-9,
            `die Prognoseliste summiert auf ${summe} statt 100 — die gesamte `
            + 'Feldrechnung darunter (Begegnungszahlen, Day-2-Kette) rechnet '
            + 'dann mit einem Feld, das es nicht gibt');
    });

    it('die ausgelieferte Zahl ist die Prognose, nicht mehr der Leiteranteil', () => {
        // `onlineShare` traegt nach dem Lauf die PROGNOSE. Der Motor
        // warnt an zwei Stellen ausdruecklich davor, ihn danach noch
        // als Leiteranteil zu lesen (Befund S6, Predictor 4.7). Faellt
        // diese Zuweisung weg, rechnet das halbe Modul weiter mit der
        // rohen Leiter und niemand sieht es.
        const nach = lauf([
            { name: 'a', ladderPctDamped: 8.0, broughtPct: 2.0, top8Boost: 1.0,  weeklySignal: 8.0 },
            { name: 'b', ladderPctDamped: 5.0, broughtPct: 6.0, top8Boost: 12.0, weeklySignal: 5.0 },
        ]);
        assert.equal(nach.a.onlineShare, nach.a.predictedShare,
            'onlineShare traegt nach dem Lauf nicht mehr die Prognose');
        assert.notEqual(nach.a.onlineShare, 8.0,
            'onlineShare ist der rohe Leiteranteil geblieben');
    });

    it('die Modusweiche haengt an vorhandenen Labs-Zeilen', () => {
        const ctx = inKontext('globalThis.__f = function (_labsMajorRows) {\n'
            + '  let _predictorMode;\n  ' + MODUSZEILE + '\n  return _predictorMode;\n};');
        assert.equal(ctx.__f(0), 'A',
            'ohne Labs-Major muesste Modus A laufen (reine Online-Leiter)');
        assert.equal(ctx.__f(1), 'B',
            'mit Labs-Majors muesste Modus B laufen — sonst werden die '
            + 'Turnierdaten gelesen und dann nicht benutzt');
    });

    it('Gegenprobe: ohne den Top-8-Term faellt die Prognose auf die Leiterreihenfolge zurueck', () => {
        // Dieselbe Rechnung, nur der dominante Summand entfernt. Sie
        // zeigt, was die Zusicherung darueber eigentlich verhindert.
        const ohneT8 = FORMEL.replace(/0\.\d+ \* top8Boost/, '0.00 * top8Boost');
        assert.notEqual(ohneT8, FORMEL, 'der Top-8-Summand ist nicht mehr auffindbar');
        const code = 'globalThis.__f = function (d) {\n'
            + '  const ladderPctDamped = d.ladderPctDamped, broughtPct = d.broughtPct,'
            + ' top8Boost = d.top8Boost, weeklySignal = d.weeklySignal;\n'
            + '  let predicted;\n' + ohneT8 + '\n  return predicted;\n};';
        const ctx = inKontext(code);
        const casual = ctx.__f({ ladderPctDamped: 8.0, broughtPct: 2.0, top8Boost: 1.0, weeklySignal: 8.0 });
        const wettkampf = ctx.__f({ ladderPctDamped: 5.0, broughtPct: 6.0, top8Boost: 12.0, weeklySignal: 5.0 });
        assert.ok(casual > wettkampf,
            'ohne den Top-8-Term muesste das Casual-Deck wieder vorne liegen');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 3.0 — Verlaufssignale: Trendfaktor und Top-8-Quotenverstaerkung
// ════════════════════════════════════════════════════════════════════

describe('Stufe 3.0 — die Verlaufssignale: Momentum und Schnittleistung', () => {

    const TREND = CLIP + '\n' + funktionAusQuelle('_trendSignal')
        + '\nglobalThis.__f = _trendSignal;';

    // Der Quotenblock traegt BEIDE Zweige: den Vorrang von 3.0
    // (top8_conv_rate) und den Rueckfall von 4.4b. Hier interessiert
    // der erste, weiter unten der zweite — derselbe Schnitt.
    const QUOTE = blockAusQuelle(
        'const convStats3 = _labsConvByDeck[k];',
        '// Predictors 4.0a + 4.5');

    function trend(anteilJetzt, basis, ueberschreiben) {
        return inKontext(TREND, {}, ueberschreiben).__f(anteilJetzt, basis);
    }

    function quote(conv, qualitaet) {
        const code = CLIP + '\nglobalThis.__f = function (k, _labsConvByDeck, _labsQualityByDeck) {\n'
            + QUOTE + '\n  return labsT8Boost;\n};';
        return inKontext(code).__f('deck',
            { deck: { sum: conv, n: 1 } },
            qualitaet ? { deck: qualitaet } : {});
    }

    it('das Momentum-Gewicht und die Schranken stehen in der Quelle', () => {
        // MOMENTUM_WEIGHT auf 0 macht _trendSignal zur Identitaet: das
        // Signal ist dann exakt der Leiteranteil, und die beiden
        // Trendsummanden der Grundformel (0,15 Post-Major + 0,10
        // Woche in Modus B, 0,10 Woche in Modus A) tragen dieselbe
        // Zahl wie der Leitersummand daneben — dreimal dasselbe
        // Signal, das wie drei aussieht.
        const gewicht = zahl('MOMENTUM_WEIGHT');
        assert.ok(gewicht > 0,
            `MOMENTUM_WEIGHT steht auf ${gewicht} — der Trendfaktor ist dann `
            + 'konstant 1 und das Signal gleich dem Leiteranteil');
        const [lo, hi] = literale(
            /return currentSharePct \* _clip\(1 \+ factor \* MOMENTUM_WEIGHT, ([\d.]+), ([\d.]+)\);/,
            'die Schranken des Trendfaktors');
        assert.ok(lo < 1 && hi > 1,
            `die Schranken [${lo}, ${hi}] schliessen die 1 nicht mehr ein — `
            + 'der Faktor koennte dann nicht mehr in beide Richtungen wirken');
        assert.ok(hi <= 1.5 && lo >= 0.5,
            `die Schranken [${lo}, ${hi}] sind ueber das dokumentierte Mass `
            + 'hinaus geoeffnet ("keep the predictor well-behaved when a deck '
            + 'moves dramatically in a single window")');
    });

    it('nachgerechnet: ein Aufsteiger wird angehoben, ein Absteiger gedaempft', () => {
        // 2,0 % -> 3,0 % ist +50 % relativ; der Faktor laeuft in die
        // obere Schranke. 3,0 % -> 2,0 % ist -33 %; der Faktor faellt
        // in die untere.
        const [lo, hi] = literale(
            /return currentSharePct \* _clip\(1 \+ factor \* MOMENTUM_WEIGHT, ([\d.]+), ([\d.]+)\);/,
            'die Schranken des Trendfaktors');
        const auf = trend(3.0, 2.0);
        const ab  = trend(2.0, 3.0);
        assert.ok(Math.abs(auf - 3.0 * hi) < 1e-9,
            `der Aufsteiger sollte 3,0 x ${hi} ergeben, gerechnet ${auf}`);
        assert.ok(Math.abs(ab - 2.0 * lo) < 1e-9,
            `der Absteiger sollte 2,0 x ${lo} ergeben, gerechnet ${ab}`);
        assert.ok(auf > 3.0 && ab < 2.0,
            'das Signal bewegt sich nicht mehr gegenueber dem rohen Anteil');
    });

    it('ohne Vergleichspunkt bleibt der Anteil unangetastet', () => {
        // Erste Installation, kein Verlauf: die Stufe darf dann nichts
        // erfinden.
        assert.equal(trend(4.0, 0), 4.0);
        assert.equal(trend(4.0, null), 4.0);
    });

    it('nachgerechnet: die Top-8-Quote verstaerkt den Labs-Term um das Doppelte', () => {
        // Der Anker 0,25 ist die natuerliche Schnittquote eines
        // Top-8-Cuts in einem 32er-Feld: ein Deck, das genau so oft
        // schneidet wie das Feld, bekommt exakt 1,0.
        const [anker, lo, hi] = literale(
            /labsT8Boost = _clip\(t8ConvAvg \/ ([\d.]+), ([\d.]+), ([\d.]+)\);/,
            'die Top-8-Quotenverstaerkung');
        assert.ok(anker > 0 && lo < 1 && hi > 1,
            `Anker ${anker}, Schranken [${lo}, ${hi}] — so kann die Verstaerkung `
            + 'nicht mehr in beide Richtungen wirken');
        assert.ok(Math.abs(quote(anker) - 1.0) < 1e-9,
            'ein Deck auf der Feld-Schnittquote muss exakt 1,0 bekommen');
        assert.ok(Math.abs(quote(anker * 2) - hi) < 1e-9,
            'die doppelte Schnittquote muss in die obere Schranke laufen');
        assert.ok(Math.abs(quote(anker / 2) - lo) < 1e-9,
            'die halbe Schnittquote muss in die untere Schranke laufen');
    });

    it('Gegenprobe: ohne Momentum-Gewicht ist das Trendsignal der blanke Anteil', () => {
        assert.equal(trend(3.0, 2.0, { MOMENTUM_WEIGHT: 0 }), 3.0,
            'mit Gewicht 0 muesste das Signal exakt der Anteil sein — genau '
            + 'das ist die Mutation, gegen die die Zusage oben steht');
        assert.equal(trend(2.0, 3.0, { MOMENTUM_WEIGHT: 0 }), 2.0);
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 4.1 — Formatfenster: Zeitfilter und Rezenzrampe
// ════════════════════════════════════════════════════════════════════

describe('Stufe 4.1 — das Formatfenster: was zaehlt und wie schwer', () => {

    const FILTER = blockAusQuelle(
        'const _rowMatchesCurrentFormat = (r) => {',
        'if (cutoffISO || currentSetCode) {');

    const RAMPE = CLIP + '\n' + blockAusQuelle(
        'const formatLifeDays = cutoffISO',
        '// Pass 1 (filtered)');

    function filtere(zeilen, { cutoff, aktivesSet }) {
        const code = 'globalThis.__f = function (labsRowsAll, effectiveCutoffISO, activeSetCode) {\n'
            + '  const _rowISO = (r) => r.tournament_date || "";\n'
            + FILTER + '\n  return labsRows;\n};';
        return inKontext(code).__f(zeilen, cutoff, aktivesSet);
    }

    function gewicht(zeilendatum, { start, heute }, ersetzen) {
        let code = 'globalThis.__f = function (cutoffISO, todayISO_, rowISO) {\n'
            + RAMPE + '\n  return _recencyWeight(rowISO);\n};';
        code = code.replace('const todayISO_ = _todayISO();', '');
        if (ersetzen) {
            assert.ok(code.includes(ersetzen[0]), 'die Rampenformel ist nicht mehr auffindbar');
            code = code.replace(ersetzen[0], ersetzen[1]);
        }
        return inKontext(code).__f(start, heute, zeilendatum);
    }

    it('die Rezenzrampe steht in der Quelle: halbes Gewicht am Formatanfang, volles heute', () => {
        // BELEG (Motor, Predictor 4.1): "Tournaments at the start of a
        // format carry less signal because deck choices are still being
        // figured out; late-format events carry full weight." Ohne
        // Steigung waere ein Turnier aus der ersten Formatwoche genauso
        // schwer wie das von gestern — und die erste Woche ist genau
        // die, in der noch niemand weiss, was gut ist.
        const [start, spanne, lo, hi] = literale(
            /return _clip\(([\d.]+) \+ ([\d.]+) \* \(tDays \/ formatLifeDays\), ([\d.]+), ([\d.]+)\);/,
            'die Rezenzrampe');
        assert.ok(spanne > 0,
            `die Steigung der Rampe steht auf ${spanne} — dann wiegt jedes `
            + 'Turnier des Formats gleich schwer und die Stufe ist abgeschaltet');
        assert.ok(Math.abs(start + spanne - 1) < 1e-9,
            `Anfang ${start} + Steigung ${spanne} ergibt ${start + spanne} statt 1 — `
            + 'ein Turnier von heute bekaeme damit nicht mehr das volle Gewicht');
        assert.ok(start >= 0.4 && start <= 0.6,
            `das Anfangsgewicht steht auf ${start}. Der Motor beziffert es mit `
            + 'einem halben Gewicht; darunter verschwaende man das erste Major, '
            + 'darueber traegt Woche-1-Rauschen fast wie eine reife Formatlage.');
        assert.ok(lo === start && hi === start + spanne,
            'die Schranken passen nicht mehr zur Rampe');
    });

    it('nachgerechnet: Formatanfang halb, Mitte drei Viertel, heute voll', () => {
        const [start, spanne] = literale(
            /return _clip\(([\d.]+) \+ ([\d.]+) \* \(tDays \/ formatLifeDays\), ([\d.]+), ([\d.]+)\);/,
            'die Rezenzrampe');
        const fenster = { start: '2026-05-01', heute: '2026-07-01' };  // 61 Tage
        assert.ok(Math.abs(gewicht('2026-05-01', fenster) - start) < 1e-9,
            'das Turnier am Formatstart bekommt nicht das Anfangsgewicht');
        assert.ok(Math.abs(gewicht('2026-07-01', fenster) - (start + spanne)) < 1e-9,
            'das Turnier von heute bekommt nicht das volle Gewicht');
        const mitte = gewicht('2026-05-31', fenster);
        assert.ok(mitte > start && mitte < start + spanne,
            `die Rampe ist keine Rampe: Mitte ergibt ${mitte}`);
        // Ohne Formatfenster (Datei fehlt) darf nichts umgewichtet werden.
        assert.equal(gewicht('2026-05-01', { start: '', heute: '2026-07-01' }), 1.0,
            'ohne format_window.json muss die Stufe folgenlos bleiben (back-compat)');
    });

    it('nachgerechnet: der Zeitfilter wirft Zeilen vor der In-Person-Legalitaet weg', () => {
        const zeilen = [
            { tournament_date: '2026-04-01', meta: 'TEF-POR' },  // vor dem Fenster
            { tournament_date: '2026-05-10', meta: 'TEF-POR' },  // drin
            { tournament_date: '2026-05-20', meta: 'TEF-CRI' },  // falsches Format
            { tournament_date: '2026-05-21', meta: '' },         // ohne Meta
            { tournament_date: '2026-05-22', meta: '_UNSORTED' },
        ];
        const behalten = filtere(zeilen, { cutoff: '2026-05-01', aktivesSet: 'POR' });
        const daten = behalten.map(r => r.tournament_date);
        assert.deepEqual(daten, ['2026-05-10'],
            `behalten wurden ${JSON.stringify(daten)}. Erwartet ist genau die eine `
            + 'Zeile, die BEIDE Tore passiert — Datum ab In-Person-Legalitaet und '
            + 'Meta-Suffix des aktiven Formats.');
    });

    it('Zeilen ohne Meta fallen raus — der San-Juan-Befund', () => {
        // BELEG (Motor, 2026-06): 96 Zeilen mit leerer Meta-Spalte und
        // leerem Datum, Anteile aus der BRS-Zeit (Lugia Archeops 40 %).
        // Predictor 5.5 las sie als "aktuelle Labs-Praesenz" und legte
        // fuer diese Decks einen Boden von 5-12 % in die laufende
        // Prognose.
        const behalten = filtere(
            [{ tournament_date: '', meta: '' }, { tournament_date: '2026-05-10', meta: 'TEF-POR' }],
            { cutoff: '2026-05-01', aktivesSet: 'POR' });
        assert.equal(behalten.length, 1,
            'eine Zeile ohne Meta-Angabe wandert wieder in den aktiven Bestand');
    });

    it('ohne Formatfenster filtert die Stufe nichts weg', () => {
        const zeilen = [{ tournament_date: '2020-01-01', meta: 'ALT' }];
        assert.equal(filtere(zeilen, { cutoff: '', aktivesSet: '' }).length, 1,
            'ohne format_window.json muss der Filter folgenlos bleiben — sonst '
            + 'loescht eine fehlende Datei den gesamten Labs-Bestand');
    });

    it('Gegenprobe: ohne Steigung wiegt das erste Major so schwer wie das letzte', () => {
        const fenster = { start: '2026-05-01', heute: '2026-07-01' };
        const flach = gewicht('2026-05-01', fenster,
            ['0.5 + 0.5 * (tDays / formatLifeDays)', '1.0 + 0.0 * (tDays / formatLifeDays)']);
        assert.equal(flach, 1.0,
            'genau das ist die Mutation, gegen die die Rampen-Zusage steht');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 4.2 — Ladder-Bias-Daempfer
// ════════════════════════════════════════════════════════════════════

describe('Stufe 4.2 — der Ladder-Bias-Daempfer: Casual-Decks verlieren Leitergewicht', () => {

    const BLOCK = CLIP + '\n' + blockAusQuelle(
        'const _dampLo = _predictorMode',
        '// Predictor 4.4 — Variant-Family-Aware Labs Anchor');

    function daempfe(modus, deckConv, feldConv, leiter, ueberschreiben) {
        const code = BLOCK.replace(/^/, 'globalThis.__f = function (_predictorMode, top8Conv, meanConv, ladderPct) {\n')
            + '\n  return { ladderDamp, ladderPctDamped };\n};';
        return inKontext(code, {}, ueberschreiben).__f(modus, deckConv, feldConv, leiter);
    }

    it('die Schranken stehen in der Quelle und schliessen die 1 ein', () => {
        // ANLASS (Motor): "Pre-Prague backtest had them over-predicted
        // by 1.7-3.1 pp each" — Alakazam, Starmie, Grimmsnarl. Stehen
        // beide Schranken auf 1, ist der Daempfer die Identitaet und
        // der Leitersummand traegt wieder den vollen Casual-Bias.
        const lo = zahl('PREDICTOR_4_2_LADDER_DAMP_LO');
        const hi = zahl('PREDICTOR_4_2_LADDER_DAMP_HI');
        assert.ok(lo < 1, `PREDICTOR_4_2_LADDER_DAMP_LO steht auf ${lo} — es wird nichts mehr gedaempft`);
        assert.ok(hi > 1, `PREDICTOR_4_2_LADDER_DAMP_HI steht auf ${hi} — Wettkampfdecks bekommen nichts mehr dazu`);
        assert.ok(lo >= 0.5 && hi <= 1.5,
            `[${lo}, ${hi}] ist keine Nachjustierung mehr. Der Motor haelt `
            + 'ausdruecklich fest: "we only want to nudge the ladder term, not '
            + 'steamroll it" — der Labs-Term ist der starke, nicht dieser.');
    });

    it('die Modus-A-Schranken liegen enger als die von Modus B', () => {
        // BEGRUENDUNG (Motor, Predictor 5.4): in Modus A stammen die
        // Quotenwerte aus denselben Online-Turnieren wie der
        // Leiteranteil. Daempfen hiesse dort, ein Signal mit sich
        // selbst zu daempfen — das benachteiligt junge Decks, die noch
        // keine Quotenstichprobe haben.
        const [aLo, aHi] = literale(
            /const _dampLo = _predictorMode === 'B' \? PREDICTOR_4_2_LADDER_DAMP_LO : ([\d.]+);\s*\n\s*const _dampHi = _predictorMode === 'B' \? PREDICTOR_4_2_LADDER_DAMP_HI : ([\d.]+);/,
            'die Modus-A-Schranken des Daempfers');
        assert.ok(aLo > zahl('PREDICTOR_4_2_LADDER_DAMP_LO'),
            `die Modus-A-Untergrenze ${aLo} ist nicht mehr enger als die von Modus B`);
        assert.ok(aHi < zahl('PREDICTOR_4_2_LADDER_DAMP_HI'),
            `die Modus-A-Obergrenze ${aHi} ist nicht mehr enger als die von Modus B`);
        assert.ok(aLo < 1 && aHi > 1, 'in Modus A daempft die Stufe gar nicht mehr');
    });

    it('nachgerechnet: ein Casual-Deck mit halber Schnittquote verliert Leitergewicht', () => {
        const lo = zahl('PREDICTOR_4_2_LADDER_DAMP_LO');
        const r = daempfe('B', 0.10, 0.20, 8.0);   // halbe Feldquote
        assert.ok(Math.abs(r.ladderDamp - lo) < 1e-9,
            `die halbe Schnittquote muesste in die untere Schranke laufen, ergab ${r.ladderDamp}`);
        assert.ok(r.ladderPctDamped < 8.0,
            'der Leiteranteil des Casual-Decks bleibt ungedaempft');
        assert.ok(Math.abs(r.ladderPctDamped - 8.0 * lo) < 1e-9,
            `8,0 % x ${lo} erwartet, gerechnet ${r.ladderPctDamped}`);
    });

    it('nachgerechnet: ein Wettkampfdeck mit doppelter Schnittquote gewinnt', () => {
        const hi = zahl('PREDICTOR_4_2_LADDER_DAMP_HI');
        const r = daempfe('B', 0.40, 0.20, 5.0);
        assert.ok(Math.abs(r.ladderPctDamped - 5.0 * hi) < 1e-9,
            `5,0 % x ${hi} erwartet, gerechnet ${r.ladderPctDamped}`);
    });

    it('ein Deck ohne Quotendaten bleibt exakt unangetastet', () => {
        // Der Motor nennt das ausdruecklich: frische Decks duerfen vom
        // Daempfer nicht getroffen werden, sonst bestraft er sie
        // dafuer, dass es sie noch nicht lange gibt.
        const r = daempfe('B', 0, 0.20, 6.0);
        assert.equal(r.ladderDamp, 1.0);
        assert.equal(r.ladderPctDamped, 6.0);
    });

    it('Gegenprobe: mit Untergrenze 1,0 verliert das Casual-Deck nichts mehr', () => {
        const r = daempfe('B', 0.10, 0.20, 8.0, { PREDICTOR_4_2_LADDER_DAMP_LO: 1.0 });
        assert.equal(r.ladderPctDamped, 8.0,
            'genau das ist die Mutation, gegen die die Zusagen oben stehen');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 4.4 — Familienbewusster Labs-Anker
// ════════════════════════════════════════════════════════════════════

describe('Stufe 4.4 — der Labs-Anker auf Familienebene statt auf einer Variante', () => {

    // Die Marke `const family = ...` steht auch in Predictor 4.5.
    // Deshalb erst ab dem 4.4-Kommentar suchen — sonst schneidet der
    // Test eine andere Stufe aus und prueft sie unter falschem Namen.
    const BLOCK = blockAusQuelle(
        'const family = _familyKeyForDeck(d.name);',
        'let predicted;',
        SRC.indexOf('// Predictor 4.4 — Variant-Family-Aware Labs Anchor. Replace the'));

    function anker(d, welt, ersetzen) {
        let code = 'globalThis.__f = function (d, k, labsTotalShare, _labsRowsByDeck,'
            + ' _familyLabsTotal, _familyOnlineTotal) {\n'
            + BLOCK + '\n  return { labsPct, rawVariantLabsPct };\n};';
        if (ersetzen) {
            assert.ok(code.includes(ersetzen[0]), 'die Umverteilung ist nicht mehr auffindbar');
            code = code.replace(ersetzen[0], ersetzen[1]);
        }
        const ctx = inKontext(code, { _familyKeyForDeck: n => String(n).split(' ')[0] });
        return ctx.__f(d, welt.k || 'deck', welt.labsTotalShare, welt.labsRows,
            welt.famLabs, welt.famOnline);
    }

    // Die Querétaro-Lage aus dem Motorkommentar: EIN Major hat eine
    // Variante der Familie stark ueberzeichnet (Dusknoir 17 %),
    // waehrend die Online-Leiter die Familie heute ganz anders
    // aufteilt. Labs-Gesamtsumme 100 -> Prozente sind hier direkt die
    // Rohanteile.
    const WELT = {
        labsTotalShare: 100,
        labsRows: {
            dusknoir: { share: 17 },
            pur:      { share: 6 },
            blaziken: { share: 7 },
        },
        famLabs:   { Dragapult: 30 },
        famOnline: { Dragapult: 25 },
    };

    it('nachgerechnet: die ueberzeichnete Variante wird auf ihren heutigen Leiteranteil zurueckgeholt', () => {
        const r = anker({ name: 'Dragapult Dusknoir', ladderShare: 5 },
                        Object.assign({ k: 'dusknoir' }, WELT));
        assert.equal(r.rawVariantLabsPct, 17,
            'der Rohanteil der Variante wird nicht mehr aus der Labs-Zeile gelesen');
        // Familienanteil 30 % x Variantengewicht 5/25 = 6 %.
        assert.ok(Math.abs(r.labsPct - 6) < 1e-9,
            `der Anker steht bei ${r.labsPct} statt bei 6 — die Umverteilung `
            + 'findet nicht statt und der Motor ankert weiter auf der einen '
            + 'Variante, die ein einzelnes Major ueberzeichnet hat');
        assert.ok(r.labsPct < r.rawVariantLabsPct,
            'die ueberzeichnete Variante behaelt ihren vollen Rohanteil');
    });

    it('nachgerechnet: die Umverteilung erhaelt die Familiensumme', () => {
        // Das ist die eigentliche Zusage der Stufe: "die Familie haelt
        // 30 % des Feldes" bleibt stehen, nur die Aufteilung darin
        // kommt von der heutigen Leiter.
        const teile = [
            ['dusknoir', 'Dragapult Dusknoir', 5],
            ['pur',      'Dragapult ex',       15],
            ['blaziken', 'Dragapult Blaziken', 5],
        ].map(([k, name, leiter]) =>
            anker({ name, ladderShare: leiter }, Object.assign({ k }, WELT)).labsPct);
        const summe = teile.reduce((s, x) => s + x, 0);
        assert.ok(Math.abs(summe - 30) < 1e-9,
            `die Varianten summieren auf ${summe} statt auf die 30 % der Familie — `
            + 'die Stufe erfindet oder verliert Feldanteil');
        // Die Summe bleibt, die Aufteilung nicht: Dusknoir gibt ab
        // (17 -> 6), das pure Dragapult bekommt es (6 -> 18). Genau das
        // ist gemeint mit "lets today's online ladder decide which
        // sub-variant carries that share".
        assert.ok(teile[0] < 17 - 5 && teile[1] > 6 + 5,
            `die Aufteilung innerhalb der Familie hat sich kaum bewegt `
            + `(${teile.map(x => x.toFixed(2)).join(' / ')}) — die Stufe reicht `
            + 'die Verteilung des einen Majors durch');
    });

    it('ohne Familiendaten faellt der Anker auf die Variante zurueck', () => {
        // Solodeck oder Familie ohne Online-Praesenz: die Stufe darf
        // dann nichts erfinden, sonst verschwindet der Anteil.
        const ohneOnline = anker({ name: 'Crustle Solo', ladderShare: 4 },
            Object.assign({ k: 'crustle' }, WELT, {
                labsRows: { crustle: { share: 3 } },
                famLabs: { Crustle: 3 }, famOnline: {},
            }));
        assert.equal(ohneOnline.labsPct, 3);
        const ohneLeiter = anker({ name: 'Dragapult Dusknoir', ladderShare: 0 },
            Object.assign({ k: 'dusknoir' }, WELT));
        assert.equal(ohneLeiter.labsPct, 17,
            'eine Variante ohne Leiterpraesenz muss ihren Rohanteil behalten');
    });

    it('Gegenprobe: ohne Umverteilung ankert der Motor wieder auf der einen Variante', () => {
        const r = anker({ name: 'Dragapult Dusknoir', ladderShare: 5 },
            Object.assign({ k: 'dusknoir' }, WELT),
            ['labsPct = familyLabsPct * variantWeight;', 'labsPct = rawVariantLabsPct;']);
        assert.equal(r.labsPct, 17,
            'genau das ist die Mutation, gegen die die Zusagen oben stehen');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 4.4b — Rueckfall auf das Day-1-zu-Day-2-Verhaeltnis
// ════════════════════════════════════════════════════════════════════

describe('Stufe 4.4b — der Rueckfall, der den Labs-Term am Leben haelt', () => {

    const QUOTE = blockAusQuelle(
        'const convStats3 = _labsConvByDeck[k];',
        '// Predictors 4.0a + 4.5');

    function boost(conv, qualitaet, ersetzen) {
        let code = CLIP + '\nglobalThis.__f = function (k, _labsConvByDeck, _labsQualityByDeck) {\n'
            + QUOTE + '\n  return labsT8Boost;\n};';
        if (ersetzen) {
            assert.ok(code.includes(ersetzen[0]), 'der Rueckfallzweig ist nicht mehr auffindbar');
            code = code.replace(ersetzen[0], ersetzen[1]);
        }
        return inKontext(code).__f('deck',
            conv > 0 ? { deck: { sum: conv, n: 1 } } : {},
            qualitaet ? { deck: qualitaet } : {});
    }

    it('der Rueckfall steht in der Quelle und ist an 1,0 verankert', () => {
        // ANLASS (Motor): "the live labs scraper currently does not
        // populate top8_conv_rate (rows are 0 in the labs CSV).
        // Without the fallback, the labs term would lose its quality
        // amplification entirely." Der Vorrangzweig ist also in der
        // Produktion der TOTE, und dieser hier der lebende — deshalb
        // haengt der ganze Labs-Term von ihm ab.
        const [lo, hi] = literale(
            /labsT8Boost = \(q && q\.d1 > 0\) \? _clip\(q\.d2 \/ q\.d1, ([\d.]+), ([\d.]+)\) : 1\.0;/,
            'der 4.4b-Rueckfall');
        assert.ok(lo < 1 && hi > 1,
            `die Schranken [${lo}, ${hi}] lassen keine Ueber- oder `
            + 'Unterperformance mehr durch');
        // Anders als der Vorrangzweig (Anker 0,25) ist das Verhaeltnis
        // von Natur aus auf 1,0 normiert: "a deck holds its
        // representation in the cut".
        assert.ok(Math.abs(boost(0, { d1: 10, d2: 10 }) - 1.0) < 1e-9,
            'ein Deck, das seinen Anteil in den Cut traegt, muss exakt 1,0 bekommen');
    });

    it('nachgerechnet: ohne top8_conv_rate uebernimmt das Day1/Day2-Verhaeltnis', () => {
        const [lo, hi] = literale(
            /labsT8Boost = \(q && q\.d1 > 0\) \? _clip\(q\.d2 \/ q\.d1, ([\d.]+), ([\d.]+)\) : 1\.0;/,
            'der 4.4b-Rueckfall');
        // 6 % am Tag 1, 9 % am Tag 2: das Deck gewinnt Anteil im Cut.
        assert.ok(Math.abs(boost(0, { d1: 6, d2: 9 }) - 1.5) < 1e-9,
            'der Ueberperformer bekommt seine 1,5 nicht');
        assert.ok(boost(0, { d1: 6, d2: 3 }) < 1.0,
            'der Unterperformer wird nicht gedaempft');
        assert.ok(Math.abs(boost(0, { d1: 6, d2: 30 }) - hi) < 1e-9,
            'ein Ausreisser muss in die obere Schranke laufen');
        assert.ok(Math.abs(boost(0, { d1: 6, d2: 0.6 }) - lo) < 1e-9,
            'ein Einbruch muss in die untere Schranke laufen');
    });

    it('der Vorrang bleibt beim echten Quotenwert, wo es ihn gibt', () => {
        // Reihenfolge zaehlt: liegt top8_conv_rate vor, darf das
        // Verhaeltnis NICHT dazwischenfunken.
        const mitBeidem = boost(0.5, { d1: 6, d2: 3 });
        assert.ok(mitBeidem > 1.0,
            'der Rueckfall ueberschreibt den echten Quotenwert — dann ist die '
            + 'Priorisierung im Motorkommentar falsch beschrieben');
    });

    it('ohne beides bleibt der Labs-Term unverstaerkt', () => {
        assert.equal(boost(0, null), 1.0);
        assert.equal(boost(0, { d1: 0, d2: 5 }), 1.0);
    });

    it('Gegenprobe: ohne den Rueckfall verliert der Labs-Term jede Qualitaetsstufe', () => {
        const r = boost(0, { d1: 6, d2: 9 },
            ['_clip(q.d2 / q.d1, 0.5, 2.0) : 1.0;', '1.0 : 1.0;']);
        assert.equal(r, 1.0,
            'genau das ist die Mutation, gegen die die Zusagen oben stehen');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 5.1 — Day-2-Qualitaetsmultiplikator (mit 5.3 im selben Block)
// ════════════════════════════════════════════════════════════════════

describe('Stufe 5.1 — der Day-2-Qualitaetsmultiplikator', () => {

    const BLOCK = CLIP + '\n' + funktionAusQuelle('_rankWeightedConv') + '\n'
        + blockAusQuelle('const _day2Q = _labsDay2ConvByDeck[k];', '// TG share for this deck')
        + blockAusQuelle('// Predictor 5.1 — apply the Day-2 conversion quality multiplier.',
                         '// Online-Hype-Damper');

    function lauf({ conv, n, feldMittel, piloten, quelle }, ueberschreiben) {
        const code = 'globalThis.__f = function (k, d, predicted, _labsDay2ConvByDeck,'
            + ' _meanDay2Conv, _lastMajorByDeck, _metaSource) {\n'
            + BLOCK + '\n  return { predicted, day2Boost, d };\n};';
        const ctx = inKontext(code, {}, ueberschreiben);
        const d = {};
        return ctx.__f('deck', d, 5.0,
            { deck: { sum: conv * n, n, samples: [{ tid: 't1', conv, date: '2026-05-10' }] } },
            feldMittel,
            piloten ? { deck: { day1Players: piloten } } : {},
            quelle || 'current');
    }

    it('die Schranken und die Vertrauensstufen stehen in der Quelle', () => {
        // BELEG (Motor, Predictor 5.2): die Schranken wurden von
        // [0,85; 1,20] auf [0,80; 1,40] geweitet, weil starke Varianten
        // (Dragapult Dusknoir 32,9 % Day-2-Quote, Dudunsparce 30,3 %)
        // an der engen Obergrenze abgeschnitten wurden. Stehen beide
        // Schranken auf 1, ist der Multiplikator die Eins und die Stufe
        // rechnet fuer jedes Deck genau nichts.
        const [lo, hi] = literale(/day2Boost = _clip\(tempered, ([\d.]+), ([\d.]+)\);/,
            'die Schranken des Day-2-Multiplikators');
        assert.ok(lo < 1 && hi > 1,
            `die Schranken [${lo}, ${hi}] schliessen die 1 nicht mehr ein — `
            + 'der Multiplikator kann nicht mehr in beide Richtungen wirken');
        assert.ok(hi <= 1.5 && lo >= 0.7,
            `[${lo}, ${hi}]: weiter als das gemessene Mass. Der Motor haelt fest, `
            + 'dass eine einzelne Major-Stichprobe die Prognose nicht allein '
            + 'bewegen darf ("no steamroll").');
        const [voll, mittel] = literale(
            /const trust = _day2Q\.n >= ([\d.]+) \? 1\.00 : \(_day2Q\.n >= ([\d.]+) \? 0\.80 : 0\.50\);/,
            'die Vertrauensstufen');
        assert.ok(voll > mittel,
            `die Vertrauensstufen (${voll} / ${mittel}) stehen nicht mehr in Reihenfolge`);
        // BELEG (test-stufen-inventur.js): `_day2Q.n === 2` war eine
        // exakte Gleichheit auf einer Gleitkommasumme und wurde ueber
        // 379 Deck-Epochen nie getroffen — der mittlere Vertrauensgrad
        // war unerreichbar. Jetzt eine Spanne, keine Punktgleichheit.
        assert.ok(!/_day2Q\.n\s*===\s*\d/.test(OHNE_KOMM),
            'die Vertrauensstufe haengt wieder an exakter Gleitkomma-Gleichheit');
    });

    it('nachgerechnet: ein Deck mit ueberdurchschnittlicher Day-2-Quote wird angehoben', () => {
        // Grimmsnarl/Froslass in Seattle, aus dem Motorkommentar: eine
        // Day-2-Quote klar ueber dem Feldmittel bei mittlerem Anteil.
        // 0,35 gegen Feldmittel 0,25 = Faktor 1,4, volles Vertrauen.
        const [, hi] = literale(/day2Boost = _clip\(tempered, ([\d.]+), ([\d.]+)\);/,
            'die Schranken des Day-2-Multiplikators');
        const r = lauf({ conv: 0.35, n: 3, feldMittel: 0.25, piloten: 60 });
        assert.ok(Math.abs(r.day2Boost - hi) < 1e-9,
            `Faktor 1,4 muss die Obergrenze treffen, gerechnet ${r.day2Boost}`);
        assert.ok(Math.abs(r.predicted - 5.0 * hi) < 1e-9,
            `die Prognose muesste 5,0 x ${hi} sein, ist aber ${r.predicted} — `
            + 'der Multiplikator wird berechnet und dann nicht angewandt');
        assert.equal(r.d.day2Boost, Math.round(hi * 100) / 100,
            'die Marke day2Boost fehlt — daran haengt die Konsolenmeldung 5.1');
    });

    it('nachgerechnet: ein Deck unter dem Feldmittel wird gedaempft', () => {
        const [lo] = literale(/day2Boost = _clip\(tempered, ([\d.]+), ([\d.]+)\);/,
            'die Schranken des Day-2-Multiplikators');
        const r = lauf({ conv: 0.10, n: 3, feldMittel: 0.25, piloten: 60 });
        assert.ok(Math.abs(r.day2Boost - lo) < 1e-9,
            `eine 40-%-Quote des Feldmittels muss in die Untergrenze laufen, gerechnet ${r.day2Boost}`);
        assert.ok(r.predicted < 5.0, 'die Daempfung erreicht die Prognose nicht');
    });

    it('im Past-Meta-Modus bleibt der Multiplikator aus', () => {
        // BEGRUENDUNG (Motor): rueckwirkend gegen dasselbe Labs-Aggregat
        // angewandt, aus dem er gerechnet wurde, verteilt der Faktor nur
        // Anteil von der Familienspitze weg (Dragapult-Familie 29 % ->
        // ~20 %).
        const r = lauf({ conv: 0.35, n: 3, feldMittel: 0.25, piloten: 60, quelle: 'past' });
        assert.equal(r.day2Boost, 1.0);
        assert.equal(r.predicted, 5.0);
    });

    it('das Tor steht so eng, wie es der Motor dokumentiert — eine Stichprobe reicht nicht', () => {
        // GEMELDET, NICHT REPARIERT (01.09.2026): `n` ist eine
        // Rezenz-GEWICHTSSUMME, kein Stichprobenzaehler. `n >= 1`
        // bedeutet deshalb faktisch "es gibt ein ZWEITES Turnier".
        // Diese Zusage haelt den gemeldeten Zustand fest, damit seine
        // Behebung eine bewusste Verhaltensaenderung bleibt und nicht
        // nebenbei passiert.
        assert.ok(/GEMELDET, NICHT REPARIERT/.test(SRC) && /REZENZ-GEWICHTSSUMME/.test(SRC),
            'die Meldung zum Einheitenfehler an `n` ist aus dem Motor verschwunden');
        assert.match(SRC, /_day2Q && _day2Q\.n >= 1\)/,
            'das Tor von 5.1 ist nicht mehr `n >= 1` — wenn das Absicht war, '
            + 'gehoert die Messung je Tor daneben (siehe die Notiz im Motor)');
        const einTurnier = lauf({ conv: 0.35, n: 0.9, feldMittel: 0.25, piloten: 60 });
        assert.equal(einTurnier.day2Boost, 1.0,
            'ein einzelnes rezenzgewichtetes Turnier passiert das Tor jetzt doch — '
            + 'das ist der gemeldete Einheitenfehler, und seine Behebung braucht '
            + 'eine eigene Messung gegen die Rueckwaertsstrecke');
    });

    it('Gegenprobe: mit Schranken auf 1,0 verschwindet die ganze Stufe', () => {
        const code = 'globalThis.__f = function (k, d, predicted, _labsDay2ConvByDeck,'
            + ' _meanDay2Conv, _lastMajorByDeck, _metaSource) {\n'
            + BLOCK.replace('_clip(tempered, ', '_clip(tempered, 1.00, 1.00); void (')
            + '\n  return { predicted, day2Boost };\n};';
        const ctx = inKontext(code);
        const r = ctx.__f('deck', {}, 5.0,
            { deck: { sum: 1.05, n: 3, samples: [{ conv: 0.35, date: '2026-05-10' }] } },
            0.25, {}, 'current');
        assert.equal(r.predicted, 5.0,
            'genau das ist die Mutation, gegen die die Zusagen oben stehen');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 5.3 — Piloten-Daempfer und Matchup-WR-Korrektur
// ════════════════════════════════════════════════════════════════════

describe('Stufe 5.3 — der Piloten-Daempfer: kleine Pilotenpools zaehlen weniger', () => {

    const BLOCK = CLIP + '\n' + funktionAusQuelle('_rankWeightedConv') + '\n'
        + blockAusQuelle('const _day2Q = _labsDay2ConvByDeck[k];', '// TG share for this deck');

    function lauf(piloten, ersetzen) {
        let code = 'globalThis.__f = function (k, d, _labsDay2ConvByDeck,'
            + ' _meanDay2Conv, _lastMajorByDeck, _metaSource) {\n'
            + BLOCK + '\n  return { day2Boost, d };\n};';
        if (ersetzen) {
            assert.ok(code.includes(ersetzen[0]), 'der Piloten-Daempfer ist nicht mehr auffindbar');
            code = code.replace(ersetzen[0], ersetzen[1]);
        }
        const ctx = inKontext(code);
        const d = {};
        return ctx.__f('deck', d,
            { deck: { sum: 1.05, n: 3, samples: [{ conv: 0.35, date: '2026-05-10' }] } },
            0.25,
            { deck: { day1Players: piloten } },
            'current');
    }

    it('die Pilotenschwelle steht in der Quelle und daempft nicht bis auf null', () => {
        // ANLASS (Motor): "A high conv ratio from a tiny pilot pool can
        // mean 'this deck genuinely works' OR 'two elite pilots got
        // lucky.' We can't distinguish from data alone." Heute
        // betroffen (Inventur 01.09.): Ogerpon Meganium Hydrapple mit
        // 12 Piloten, Clefairy Ogerpon mit 10.
        const [schwelle] = literale(/if \(pilotPool > 0 && pilotPool < (\d+)\) \{/,
            'die Pilotenschwelle');
        const [nenner, dLo, dHi] = literale(
            /const pilotDamp = _clip\(pilotPool \/ (\d+), ([\d.]+), ([\d.]+)\);/,
            'der Pilotenfaktor');
        assert.ok(schwelle >= 10,
            `die Schwelle steht auf ${schwelle} Piloten. Unter zehn traegt ein `
            + 'Day-2-Quotient gar keine Aussage mehr — zwei Piloten mit einem '
            + 'guten Tag ergaeben denselben Wert wie ein durchgetestetes Deck.');
        assert.equal(nenner, schwelle,
            'Schwelle und Nenner des Daempfungsfaktors sind auseinandergelaufen — '
            + 'dann springt der Faktor an der Schwelle statt stetig zu laufen');
        assert.ok(dLo > 0 && dLo < 1 && dHi === 1,
            `[${dLo}, ${dHi}]: der Faktor daempft entweder gar nicht mehr oder `
            + 'loescht den Schub vollstaendig statt ihn zu halbieren');
    });

    it('nachgerechnet: zwoelf Piloten halbieren den Schub nicht, sie kuerzen ihn anteilig', () => {
        const [schwelle] = literale(/if \(pilotPool > 0 && pilotPool < (\d+)\) \{/, 'die Pilotenschwelle');
        const gross = lauf(schwelle * 3);
        const klein = lauf(12);
        assert.ok(klein.day2Boost < gross.day2Boost,
            `zwoelf Piloten bekommen denselben Schub (${klein.day2Boost}) wie ein `
            + 'grosser Pilotenpool — der Daempfer greift nicht');
        const erwartet = 1.0 + (gross.day2Boost - 1.0) * (12 / schwelle);
        assert.ok(Math.abs(klein.day2Boost - erwartet) < 1e-9,
            `erwartet ${erwartet} aus den Quellzahlen, gerechnet ${klein.day2Boost}`);
        assert.ok(klein.d.pilotSkillDamped && klein.d.pilotSkillDamped.pilotPool === 12,
            'die Marke pilotSkillDamped fehlt — daran haengt die Konsolenmeldung 5.3');
    });

    it('ein grosser Pilotenpool bleibt unangetastet', () => {
        const [schwelle] = literale(/if \(pilotPool > 0 && pilotPool < (\d+)\) \{/, 'die Pilotenschwelle');
        const r = lauf(schwelle);
        assert.equal(r.d.pilotSkillDamped, undefined,
            'ein Deck genau auf der Schwelle wird gedaempft — die Grenze ist verrutscht');
    });

    it('ohne Major-Daten wird nicht gedaempft', () => {
        // Frueher Formatstand: kein letztes Major, also auch kein
        // Pilotenpool. Die Stufe darf dann nicht raten.
        const r = lauf(0);
        assert.equal(r.d.pilotSkillDamped, undefined);
    });

    it('Gegenprobe: ohne Schwelle bekommt das Zwoelf-Piloten-Deck den vollen Schub', () => {
        const [schwelle] = literale(/if \(pilotPool > 0 && pilotPool < (\d+)\) \{/, 'die Pilotenschwelle');
        const ohne = lauf(12, [`pilotPool < ${schwelle}`, 'pilotPool < 0']);
        assert.ok(ohne.day2Boost > lauf(12).day2Boost,
            'genau das ist die Mutation, gegen die die Zusagen oben stehen');
    });
});

describe('Stufe 5.3 — die Matchup-Korrektur: Turnierpiloten statt Online-Enthusiasten', () => {

    const RECHNUNG = CLIP + '\n' + funktionAusQuelle('_computeMatchupAdjustments')
        + '\nglobalThis.__f = _computeMatchupAdjustments;';

    const ANWENDUNG = CLIP + '\n' + blockAusQuelle(
        'const adjA = _deckWRAdjustment[a] || 0;',
        'return { pWin, pTie, pLoss };')
        + 'return { pWin, pTie, pLoss };';

    function rechne(decks, letzteMajors, ersetzen) {
        let code = RECHNUNG;
        if (ersetzen) {
            assert.ok(code.includes(ersetzen[0]), 'die Klammer der Korrektur ist nicht mehr auffindbar');
            code = code.replace(ersetzen[0], ersetzen[1]);
        }
        const ctx = inKontext(code, {
            _deckWRAdjustment: {},
            _shareList: decks,
            _lastMajorByDeck: letzteMajors,
            normalize: s => String(s).trim().toLowerCase(),
        });
        ctx.__f();
        return ctx._deckWRAdjustment;
    }

    function wende(basis, korrekturen) {
        const code = ANWENDUNG.replace(/^/,
            'globalThis.__f = function (a, b, base, _deckWRAdjustment) {\n')
            + '\n};';
        return inKontext(code).__f('a', 'b', basis, korrekturen);
    }

    it('die Klammer und die Tore stehen in der Quelle', () => {
        // ANLASS (Motor): Crustle steht online mit 67 % gegen
        // Dragapult, am LA-Regional waren es 43,3 %. Ohne Korrektur
        // rechnet die Empfehlung mit der Online-Zahl — also mit dem,
        // was Enthusiasten schaffen, nicht mit dem, was Turnierpiloten
        // schaffen.
        const [lo, hi] = literale(
            /const delta = _clip\(lm\.winPct - onlineWr, (-?\d+), (\d+)\);/,
            'die Klammer der WR-Korrektur');
        assert.ok(hi > 0 && lo === -hi,
            `die Klammer [${lo}, ${hi}] ist nicht mehr symmetrisch — eine `
            + 'einseitige Korrektur verschiebt das ganze Feld in eine Richtung');
        assert.ok(hi <= 15,
            `die Klammer steht auf ${hi} pp. Darueber kann ein einzelnes `
            + 'Ausreisser-Major den Simulator beliebig verdrehen ("so a freak '
            + 'outlier major can\'t swing the simulator wildly").');
        const [minPiloten] = literale(/if \(!lm \|\| !\(lm\.day1Players >= (\d+)\)/,
            'der Pilotenboden der WR-Korrektur');
        assert.ok(minPiloten >= 20,
            `der Pilotenboden steht auf ${minPiloten} — unter 20 Day-1-Piloten `
            + 'ist die Labs-WR selbst das Rauschen, das sie korrigieren soll');
    });

    it('nachgerechnet: Crustle wird um die volle Klammer nach unten korrigiert', () => {
        const [lo] = literale(/const delta = _clip\(lm\.winPct - onlineWr, (-?\d+), (\d+)\);/,
            'die Klammer der WR-Korrektur');
        const map = rechne(
            [{ name: 'Crustle', onlineWinPct: 67 }],
            { crustle: { day1Players: 40, winPct: 43.3 } });
        assert.equal(map.crustle, lo,
            `die Korrektur fuer Crustle steht bei ${map.crustle} statt bei der `
            + 'Klammer — 43,3 % Labs gegen 67 % online sind 23,7 pp Abstand');
    });

    it('nachgerechnet: die Korrektur erreicht den Simulator', () => {
        const basis = { pWin: 0.60, pTie: 0.02, pLoss: 0.38 };
        const r = wende(basis, { a: -12 });
        assert.ok(Math.abs(r.pWin - 0.48) < 1e-9,
            `die korrigierte Gewinnquote steht bei ${r.pWin} statt 0,48 — die `
            + 'Korrektur wird gerechnet und dann nicht angewandt');
        assert.ok(Math.abs(r.pWin + r.pTie + r.pLoss - 1) < 1e-9,
            'die drei Wahrscheinlichkeiten summieren nicht mehr auf 1');
        // Ohne Korrektur bleibt die Basis unangetastet — Objektidentitaet.
        assert.equal(wende(basis, {}), basis);
    });

    it('kleine Stichproben und kleine Abstaende werden verworfen', () => {
        const [minAbstand] = literale(/if \(Math\.abs\(delta\) < ([\d.]+)\) return;/,
            'der Mindestabstand der WR-Korrektur');
        const zuKlein = rechne(
            [{ name: 'Winzling', onlineWinPct: 60 }],
            { winzling: { day1Players: 5, winPct: 40 } });
        assert.deepEqual(zuKlein, {},
            'ein Major mit fuenf Piloten korrigiert wieder den Simulator');
        const knapp = rechne(
            [{ name: 'Knapp', onlineWinPct: 50 }],
            { knapp: { day1Players: 40, winPct: 50 + minAbstand / 2 } });
        assert.deepEqual(knapp, {},
            `ein Abstand unter ${minAbstand} pp wird wieder eingetragen — die `
            + 'Karte fuellt sich dann mit Rauschen');
    });

    it('Gegenprobe: mit Klammer auf null verschwindet die Korrektur', () => {
        const map = rechne(
            [{ name: 'Crustle', onlineWinPct: 67 }],
            { crustle: { day1Players: 40, winPct: 43.3 } },
            ['_clip(lm.winPct - onlineWr, -12, 12)', '_clip(lm.winPct - onlineWr, 0, 0)']);
        assert.deepEqual(map, {},
            'genau das ist die Mutation, gegen die die Zusagen oben stehen');
    });
});

// ════════════════════════════════════════════════════════════════════
// Querschnitt: die acht Stufen sind da und rechnen
// ════════════════════════════════════════════════════════════════════

describe('Querschnitt — keine der acht Stufen verschwindet unbemerkt', () => {

    it('jede der acht Stufen ist im Motor noch benannt', () => {
        // Eine geloeschte Stufe ist schlimmer als eine stillgelegte:
        // mit ihr geht die Messung weg, die belegt, warum es sie gab
        // (dieselbe Regel wie in test-stufen-inventur.js).
        for (const [stufe, marke] of [
            ['2.0',  'Predictor 2.0 — runnable on demand'],
            ['3.0',  'Predictor 3.0 — history-aware trend signals'],
            ['4.1',  'Predictor 4.1 — Format-Window'],
            ['4.2',  'Predictor 4.2 — Ladder-Bias-Damper'],
            ['4.4',  'Predictor 4.4 — Variant-Family-Aware Labs Anchor'],
            ['4.4b', 'Predictor 4.4b fallback'],
            ['5.1',  'Predictor 5.1 — Day-2 conversion quality boost'],
            ['5.3',  'Predictor 5.3 — Pilot-Skill-Proxy'],
        ]) {
            assert.ok(SRC.includes(marke),
                `Stufe ${stufe} ist nicht mehr auffindbar (gesucht: "${marke}")`);
        }
    });

    it('keine der acht haengt an einem Abschalter, der auf false steht', () => {
        // Die drei stillgelegten Stufen (4.0a/4.5, 5.2, 6.1) tragen
        // ihren Schalter im Code. Taucht einer der acht dort auf, ist
        // diese Datei die falsche Zusage — dann gehoert die Stufe in
        // die Inventur der stillgelegten, nicht hierher.
        for (const schalter of ['META_DYN_AKTIV', 'HYPE_DAMPER_AKTIV', 'LIVE_SHARE_FLOOR_AKTIV']) {
            const gesetzt = new RegExp(`const\\s+${schalter}\\s*=\\s*false`).test(SRC);
            assert.ok(gesetzt,
                `${schalter} steht nicht mehr auf false — dann ist eine stillgelegte `
                + 'Stufe wieder scharf, ohne dass sie je gemessen wurde');
        }
    });
});
