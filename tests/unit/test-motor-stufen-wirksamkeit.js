'use strict';
/*
 * SIEBEN STUFEN, DIE SICH AUF NULL SETZEN LIESSEN
 * ===============================================
 *
 * BEFUND (02.09.2026). Eine Mutationspruefung hat sieben Konstanten des
 * Prognosemotors auf null gesetzt — jede einzelne schaltet eine ganze
 * Predictor-Stufe ab — und die JS-Suite blieb bei allen sieben gruen:
 *
 *   DAY2_MIN_ANKER                    30   -> 0
 *   PREDICTOR_5_4_BOOST_PER_PP        0.4  -> 0.0
 *   PREDICTOR_5_9_NEW_BOOST_PP_MAX    2.0  -> 0.0
 *   PREDICTOR_5_9_RISING_BOOST_PP_MAX 1.5  -> 0.0
 *   PREDICTOR_57_BOOST_PP_MAX         1.5  -> 0.0
 *   PREDICTOR_56_CONSOLIDATION_RATE   0.40 -> 0.00
 *   PREDICTOR_46_SUPPRESS_PER_PP      0.30 -> 0.00
 *   PREDICTOR_4_7_BOOST_PP_MAX        1.0  -> 0.0
 *
 * Zwei Ursachen, beide dieselbe Gestalt — der Test kennt die Zahl,
 * statt sie zu lesen:
 *
 *   A) Die Konstante wurde als LITERAL in den vm-Kontext geschoben
 *      (test-meta-call-prognosekern.js bei DAY2_MIN_ANKER). Der Motor
 *      durfte sich aendern, der Test rechnete weiter mit 30.
 *
 *   B) Der Test fuehrte eine EIGENE KOPIE der Konstanten und der Formel
 *      (test-meta-call-p57-antileader.js, -p56-consolidation.js,
 *      -predictor-4-7.js, -underdog-growth.js). Im Kopf dieser Dateien
 *      steht "Constants mirror js/app-meta-call.js — keep in lockstep";
 *      durchgesetzt wurde der Gleichlauf von nichts. Die Kopien pruefen
 *      sich selbst.
 *
 * WAS DIESE DATEI ANDERS MACHT
 * ----------------------------
 * Jede Zahl kommt aus js/app-meta-call.js, keine steht hier als Literal
 * (ausser als BEGRUENDETE SCHRANKE — "mindestens so gross", nie "genau
 * so gross wie im Test notiert"). Und jede Stufe wird nicht beschrieben,
 * sondern AUSGEFUEHRT: der echte Quelltextblock wird aus der Datei
 * herausgeschnitten und in einem vm-Kontext gerechnet. Wer die Konstante
 * auf null setzt, aendert damit das Rechenergebnis hier — nicht nur eine
 * Zeichenkette.
 *
 * Die Datei ersetzt die Spiegel-Dateien nicht. Die tragen jetzt
 * zusaetzlich eine Gleichlauf-Zusicherung (Kopie == Quelle), damit ein
 * Auseinanderlaufen dort auffaellt, wo die Kopie steht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const QUELLE = path.join(__dirname, '..', '..', 'js', 'app-meta-call.js');
const SRC = fs.readFileSync(QUELLE, 'utf8');

// ── Werkzeug: alles kommt aus der Quelle ────────────────────────────

/* Jede numerische Konstante des Motors, aus dem Quelltext gelesen.
 * Der vm-Kontext bekommt sie vollstaendig — so kann kein Beispiel
 * unten versehentlich auf einem Literal stehen. */
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
function blockAusQuelle(vonMarke, bisMarke) {
    const i = SRC.indexOf(vonMarke);
    assert.notEqual(i, -1, `Startmarke nicht gefunden: ${vonMarke}`);
    const j = SRC.indexOf(bisMarke, i);
    assert.notEqual(j, -1, `Endmarke nicht gefunden: ${bisMarke}`);
    return SRC.slice(i, j);
}

/* Fuehrt Quelltext in einem Kontext aus, der ALLE Motorkonstanten
 * traegt, und gibt den Kontext zurueck. `ueberschreiben` erlaubt die
 * Gegenprobe "dieselbe Rechnung, Konstante auf null". */
function inKontext(code, extras, ueberschreiben) {
    const ctx = Object.assign(
        { Math, Object, Map, Array, Number, Date, JSON, console: { log() {} } },
        KONSTANTEN, extras || {}, ueberschreiben || {});
    vm.createContext(ctx);
    new vm.Script(code).runInContext(ctx);
    return ctx;
}

// ════════════════════════════════════════════════════════════════════
// STUFE 1 — Day-2-Mindeststichprobe (DAY2_MIN_ANKER, app-meta-call.js)
// ════════════════════════════════════════════════════════════════════

describe('Stufe 1 — Day-2-Mindeststichprobe: das Tor gegen Geisterempfehlungen', () => {

    const KERN = funktionAusQuelle('_day2Schrumpfung')
        + '\nglobalThis.__f = _day2Schrumpfung;';

    function rechne(ueberschreiben) {
        // Ein dickes Deck mit solider Quote gegen zwei hauchduenne mit
        // Gluecksquote — genau die Lage, aus der die Geisterempfehlungen
        // kamen.
        const ctx = inKontext(KERN, {
            _majorSharesByDeck: {
                dick:  [{ tid: 't1', day1Players: 1000 }],
                duenn: [{ tid: 't1', day1Players: 6 }],
                hauch: [{ tid: 't1', day1Players: 2 }],
            },
            _labsDay2ConvByDeck: {
                dick:  { samples: [{ tid: 't1', conv: 0.30 }] },
                duenn: { samples: [{ tid: 't1', conv: 1.00 }] },
                hauch: { samples: [{ tid: 't1', conv: 1.00 }] },
            },
        }, ueberschreiben);
        return ctx.__f();
    }

    it('die Schwelle steht in der Quelle und ist nicht null', () => {
        // OHNE das Tor empfahl der Motor in 25 von 44 Turnieren ein Deck,
        // das gar nicht angetreten war (Messung im Motor, app-meta-call.js
        // ueber DAY2_MIN_ANKER). Die Schrumpfung allein reicht nicht: bei
        // k=30 landen sechs Spieler mit 100 % Quote rechnerisch bei 0,42
        // und schlagen damit ein solides 30-%-Deck.
        const anker = zahl('DAY2_MIN_ANKER');
        assert.ok(anker >= 30,
            `DAY2_MIN_ANKER steht auf ${anker}. Unter 30 ausgewerteten Spielern `
            + 'traegt die geschrumpfte Quote keine Empfehlung — dieselbe Schwelle '
            + 'wie MIN_ANZEIGE in scripts/build_deckempfehlung.py.');
    });

    it('nachgerechnet: zwei und sechs Spieler bekommen keinen Rang, tausend schon', () => {
        // Der Anker wird NICHT als Literal gesetzt — er kommt ueber
        // KONSTANTEN aus der Quelle. Steht er dort auf 0, faellt das Tor
        // und die beiden duennen Decks tauchen hier auf.
        const r = rechne();
        assert.equal(r.get('hauch'), undefined,
            'ein Deck mit zwei ausgewerteten Spielern wird wieder empfohlen — '
            + 'genau daher kamen die Empfehlungen fuer Decks, die nicht antraten');
        assert.equal(r.get('duenn'), undefined,
            'ein Deck mit sechs ausgewerteten Spielern wird wieder empfohlen');
        assert.ok(typeof r.get('dick') === 'number',
            'das Deck mit tausend Spielern hat seinen Rang verloren');
        assert.ok(Math.abs(r.get('dick') - 0.30) < 0.02,
            'ein Deck mit tausend Spielern darf von der Schrumpfung kaum bewegt werden');
    });

    it('Gegenprobe: ohne das Tor schlaegt das Zwei-Spieler-Deck das Tausend-Spieler-Deck', () => {
        // Dieselbe Rechnung, nur der Anker auf 0. Sie zeigt, was die
        // Zusicherung darueber eigentlich verhindert.
        const r = rechne({ DAY2_MIN_ANKER: 0 });
        assert.ok(typeof r.get('hauch') === 'number',
            'ohne Anker muesste das Zwei-Spieler-Deck einen Rang bekommen');
        assert.ok(r.get('hauch') > r.get('dick'),
            'die Geisterempfehlung entsteht genau hier: das Zwei-Spieler-Deck '
            + 'rangiert vor dem Tausend-Spieler-Deck');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 2 — Predictor 5.4, Wachstums-Schub (PREDICTOR_5_4_BOOST_PER_PP)
// ════════════════════════════════════════════════════════════════════

describe('Stufe 2 — Predictor 5.4: der Wachstums-Schub hebt wirklich an', () => {

    const BLOCK = blockAusQuelle(
        'const growthAgg = _labsShareGrowthByDeck[k];',
        '// Predictor 4.6 — Underdog-Champion-Boost.');

    function schub(wachstumPP, ueberschreiben) {
        const code = 'globalThis.__f = function (k, d, predicted, _labsShareGrowthByDeck) {\n'
            + BLOCK + '\n  return { predicted, d };\n};';
        const ctx = inKontext(code, {}, ueberschreiben);
        const d = {};
        const r = ctx.__f('deck', d, 5.0, { deck: { sum: wachstumPP, n: 1 } });
        return { zuwachs: r.predicted - 5.0, d };
    }

    it('die Konstanten stehen in der Quelle und sind nicht null', () => {
        // BELEG (test-stufen-inventur.js): "Am 01.09. hob er 12 von 43
        // Decks an, bis +3,33 pp." Diese Stufe ist die einzige wirksame,
        // die keine Konsolenmeldung hatte — beim Auszaehlen der toten
        // Stufen stand sie deshalb faelschlich auf der Liste der stummen.
        // Sie ist nicht stumm, sie ist nur leise.
        const proPP = zahl('PREDICTOR_5_4_BOOST_PER_PP');
        const deckel = zahl('PREDICTOR_5_4_BOOST_PP_MAX');
        const boden  = zahl('PREDICTOR_5_4_MIN_GROWTH_PP');
        assert.ok(proPP > 0,
            `PREDICTOR_5_4_BOOST_PER_PP steht auf ${proPP} — bei 0 liefert die `
            + 'Stufe fuer JEDES Deck 0,00 pp und ist damit abgeschaltet');
        assert.ok(proPP <= 0.6,
            `PREDICTOR_5_4_BOOST_PER_PP steht auf ${proPP}. Ueber 0,4 war `
            + 'gemessen zu viel: 0,6 injizierte +1,2 pp in Online-Hype-Decks '
            + '(Festival Lead, Slowking), die in Person nicht erschienen, und '
            + 'schob die Prognose ueber die naive Grundlinie von 1,83 pp MAE.');
        assert.ok(deckel > 0 && deckel <= 1.5,
            `PREDICTOR_5_4_BOOST_PP_MAX steht auf ${deckel} — ohne Deckel `
            + 'dominiert ein einzelnes Glücks-Major die ganze Prognose');
        assert.ok(boden > 0,
            'ohne PREDICTOR_5_4_MIN_GROWTH_PP wird Rauschen als Wachstum gelesen');
    });

    it('nachgerechnet: +1,5 pp Wachstum (Lillie’s Clefairy, Indianapolis) hebt sichtbar an', () => {
        // Day 1 3,8 % -> Day 2 5,3 % = +1,5 pp. Der Block kommt aus der
        // Quelle, die Konstanten auch — hier wird nichts nachgebaut.
        const { zuwachs, d } = schub(1.5);
        const erwartet = Math.min(zahl('PREDICTOR_5_4_BOOST_PP_MAX'),
                                  1.5 * zahl('PREDICTOR_5_4_BOOST_PER_PP'));
        assert.ok(Math.abs(zuwachs - erwartet) < 1e-9,
            `der Motorblock rechnet ${zuwachs}, die Quellkonstanten ergeben ${erwartet}`);
        assert.ok(zuwachs >= 0.4,
            `+1,5 pp Wachstum brachten nur ${zuwachs.toFixed(3)} pp Schub — `
            + 'unter 0,4 pp ist die Stufe faktisch abgeschaltet');
        assert.ok(d.day2GrowthBoostPP > 0,
            'die Marke day2GrowthBoostPP bleibt leer — daran haengt die '
            + 'Konsolenmeldung, die test-stufen-inventur.js verlangt');
    });

    it('nachgerechnet: die gemessene Spitze von +3,33 pp laeuft in den Deckel', () => {
        const { zuwachs } = schub(3.33);
        assert.ok(Math.abs(zuwachs - zahl('PREDICTOR_5_4_BOOST_PP_MAX')) < 1e-9,
            `+3,33 pp Wachstum muessen den Deckel treffen, ergaben aber ${zuwachs}`);
    });

    it('Rauschen unter dem Boden bleibt folgenlos', () => {
        assert.equal(schub(zahl('PREDICTOR_5_4_MIN_GROWTH_PP') - 0.01).zuwachs, 0);
        assert.equal(schub(-1.0).zuwachs, 0);
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 3 — Predictor 5.9, Neu-/Aufsteiger-Schub
// ════════════════════════════════════════════════════════════════════

describe('Stufe 3 — Predictor 5.9: Neu- und Aufsteiger-Decks werden angehoben', () => {

    const BLOCK = blockAusQuelle(
        'const porShare = por ? por.share : 0;',
        "kind = 'RISING';");

    function migration(por, cur, ueberschreiben) {
        // Der Block endet mitten in der else-if-Kette; die Kette wird
        // hier mit ihrem eigenen letzten Zweig geschlossen, damit der
        // Schnitt syntaktisch gueltig ist.
        const code = 'globalThis.__f = function (por, cur) {\n'
            + BLOCK + "kind = 'RISING';\n        }\n"
            + '  return { boost, kind };\n};';
        const ctx = inKontext(code, {}, ueberschreiben);
        return ctx.__f(por, cur);
    }

    it('die Obergrenzen stehen in der Quelle und sind nicht null', () => {
        // 5.9 ist die einzige Stufe, die ein Deck erfasst, das es in der
        // Vorepoche praktisch nicht gab. Steht die Obergrenze auf 0,
        // kappt Math.min JEDEN Wert auf 0 — das Format-Migrations-Signal
        // verschwindet vollstaendig, ohne dass ein Tor zumacht.
        const neu = zahl('PREDICTOR_5_9_NEW_BOOST_PP_MAX');
        const auf = zahl('PREDICTOR_5_9_RISING_BOOST_PP_MAX');
        assert.ok(neu > 0, `PREDICTOR_5_9_NEW_BOOST_PP_MAX steht auf ${neu} — Stufe tot`);
        assert.ok(auf > 0, `PREDICTOR_5_9_RISING_BOOST_PP_MAX steht auf ${auf} — Stufe tot`);
        // Ein neues Deck traegt mehr Ueberraschung als ein wachsendes.
        assert.ok(neu > auf,
            'der Neu-Deckel muss ueber dem Aufsteiger-Deckel liegen');
        // Beide Zweige kappen ZULETZT (siehe test-motor-rechenfehler.js
        // S8). Der wrFactor laeuft bis 1,5 — kappte man davor, waere die
        // echte Obergrenze 3,0 statt 2,0 pp.
        assert.ok(neu <= 2.5 && auf <= 2.0,
            'die Obergrenzen sind ueber das gemessene Mass hinaus angehoben worden');
    });

    it('nachgerechnet: ein neues Deck mit guter Winrate bekommt einen echten Schub', () => {
        // Vorepoche 0,2 % (praktisch nicht vorhanden), jetzt 3,0 % bei
        // 56 % Winrate.
        const r = migration({ share: 0.2, wr: 50 }, { share: 3.0, wr: 56 });
        assert.equal(r.kind, 'NEW', 'der NEU-Zweig greift nicht mehr');
        assert.ok(r.boost > 0.5,
            `der Neu-Schub lieferte ${r.boost.toFixed(3)} pp — unter 0,5 pp ist `
            + 'die Stufe faktisch abgeschaltet');
        assert.ok(r.boost <= zahl('PREDICTOR_5_9_NEW_BOOST_PP_MAX') + 1e-9);
    });

    it('nachgerechnet: ein Aufsteiger 2,0 % -> 5,0 % laeuft in seinen Deckel', () => {
        const r = migration({ share: 2.0, wr: 50 }, { share: 5.0, wr: 56 });
        assert.equal(r.kind, 'RISING', 'der AUFSTEIGER-Zweig greift nicht mehr');
        assert.ok(Math.abs(r.boost - zahl('PREDICTOR_5_9_RISING_BOOST_PP_MAX')) < 1e-9,
            `+3 pp Zuwachs bei 56 % WR muessen den Deckel treffen, ergaben ${r.boost}`);
    });

    it('eine mittelmaessige Winrate bekommt gar nichts', () => {
        // WR-neutral: unter PREDICTOR_5_9_WR_NEUTRAL ist wrFactor 0.
        const r = migration({ share: 0.2, wr: 50 },
                            { share: 3.0, wr: zahl('PREDICTOR_5_9_WR_NEUTRAL') });
        assert.equal(r.boost, 0,
            'die 2026-06-08 nachgezogene WR-Neutrale ist wieder offen — sie kam '
            + 'aus der Beedrill-Ueberpumpung (50,45 % WR ergab +0,8 pp)');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 4 — Predictor 5.7, Anti-Leader-Tech-Schub
// ════════════════════════════════════════════════════════════════════

describe('Stufe 4 — Predictor 5.7: der Konter gegen das dominante Deck', () => {

    const FN = funktionAusQuelle('_computeAntiLeaderTechBoost')
        + '\nglobalThis.__f = _computeAntiLeaderTechBoost;';

    function lauf(ueberschreiben) {
        // TEF-POR-Lage: Dragapult-Familie bei ~29 % (ueber der
        // Dominanzschwelle), dazu ein kleiner Konter mit 60 % gegen die
        // Leitvariante und ein zweiter, der die Winrate-Schwelle reisst.
        const liste = [
            { name: 'Dragapult ex',        predictedShareRaw: 10.4 },
            { name: 'Dragapult Dusknoir',  predictedShareRaw: 7.5 },
            { name: 'Dragapult Blaziken',  predictedShareRaw: 6.2 },
            { name: 'Dragapult Dudunsparce', predictedShareRaw: 5.4 },
            { name: 'Lucario Konter',      predictedShareRaw: 0.9 },
            { name: 'Alakazam Mitlaeufer', predictedShareRaw: 0.9 },
        ];
        // Das Restfeld wird auf acht Familien verteilt, damit die
        // Dominanzschwelle nur von Dragapult gerissen wird — ein einziger
        // Fuellblock waere selbst die Leitfamilie und die Stufe pruefte
        // dann etwas anderes, als hier gemeint ist.
        for (let i = 0; i < 8; i++) {
            liste.push({ name: `Fuell${i} Feld`, predictedShareRaw: 68.7 / 8 });
        }
        const ctx = inKontext(FN, {
            _shareList: liste,
            _familyKeyForDeck: n => n.split(' ')[0],
            _lastMajorInfo: null,
            _antiLeaderLastLogId: null,
            getBaseMatchup: (deck, leiter) => {
                if (leiter !== 'Dragapult ex') return null;
                if (deck === 'Lucario Konter')      return { pWin: 0.60 };
                if (deck === 'Alakazam Mitlaeufer') return { pWin: 0.50 };
                return null;
            },
        }, ueberschreiben);
        ctx.__f();
        const nach = {};
        liste.forEach(d => { nach[d.name] = d; });
        return nach;
    }

    it('die Obergrenze und die Tore stehen in der Quelle und sind nicht null', () => {
        // ANLASS: Indianapolis 2026-05-29. Die Anti-Dragapult-Techwelle
        // (Hydrapple, Mega Lucario, Basic Box) wurde systematisch um
        // 1,5-3,5 pp unterschaetzt, weil der Online-Ladder-Anteil die
        // erwartete Dragapult-Konsolidierung nicht abbildete. Steht die
        // Obergrenze auf 0, kappt Math.min jeden Schub auf 0, das
        // anschliessende `if (boost <= 0.05) return;` wirft ihn weg — und
        // die Unterschaetzung ist zurueck.
        const deckel = zahl('PREDICTOR_57_BOOST_PP_MAX');
        assert.ok(deckel > 0,
            `PREDICTOR_57_BOOST_PP_MAX steht auf ${deckel} — jeder Schub wird `
            + 'auf 0 gekappt und von der 0,05-Schranke verworfen');
        assert.ok(deckel <= 3.5,
            'ueber der gemessenen Unterschaetzung von 3,5 pp waere der Schub '
            + 'groesser als der Fehler, den er ausgleichen soll');
        assert.ok(zahl('PREDICTOR_57_BOOST_SCALE') > 0, 'die Steigung ist null');
        assert.ok(zahl('PREDICTOR_57_COUNTER_WR_THRESHOLD') > 0.5,
            'die Konter-Schwelle liegt nicht mehr ueber dem Muenzwurf');
        assert.ok(zahl('PREDICTOR_57_LEADER_DOMINANCE_THRESHOLD') > 0,
            'ohne Dominanzschwelle gilt jede Familie als Leitfamilie');
    });

    it('nachgerechnet: der kleine Konter mit 60 % gegen den Leiter wird angehoben', () => {
        const nach = lauf();
        const konter = nach['Lucario Konter'];
        assert.ok(typeof konter.antiLeaderBoostPp === 'number' && konter.antiLeaderBoostPp > 0,
            'der Konter bekommt keinen Schub — entweder ist die Leitfamilie nicht '
            + 'mehr erkannt worden oder die Obergrenze steht auf 0');
        assert.ok(konter.predictedShareRaw > 0.9,
            `der Rohanteil des Konters blieb bei ${konter.predictedShareRaw} — `
            + 'die Stufe hat nichts bewegt');
        // wrEdge 0,10 x SCALE 8,0 = 0,8 pp, unter dem Deckel 1,5.
        const erwartet = Math.min(zahl('PREDICTOR_57_BOOST_PP_MAX'),
                                  0.10 * zahl('PREDICTOR_57_BOOST_SCALE'));
        assert.ok(Math.abs(konter.antiLeaderBoostPp - erwartet) < 1e-9,
            `die Quelle rechnet ${konter.antiLeaderBoostPp}, die Quellkonstanten `
            + `ergeben ${erwartet}`);
    });

    it('ein Deck genau auf dem Muenzwurf bleibt unangetastet', () => {
        const nach = lauf();
        assert.equal(nach['Alakazam Mitlaeufer'].antiLeaderBoostPp, undefined,
            '50 % gegen den Leiter ist kein Konter — die Winrate-Schwelle ist offen');
    });

    it('Gegenprobe: mit Obergrenze 0 verschwindet der Schub vollstaendig', () => {
        const nach = lauf({ PREDICTOR_57_BOOST_PP_MAX: 0 });
        assert.equal(nach['Lucario Konter'].antiLeaderBoostPp, undefined,
            'genau das war die Mutation, die keinen Test rot machte');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 5 — Predictor 5.6, Familien-Konsolidierung
// ════════════════════════════════════════════════════════════════════

describe('Stufe 5 — Predictor 5.6: die Leitvariante zieht die Familie zusammen', () => {

    const FN = funktionAusQuelle('_computeFormatLeaderConsolidation')
        + '\nglobalThis.__f = _computeFormatLeaderConsolidation;';

    function lauf(ueberschreiben) {
        const liste = [
            { name: 'Dragapult ex',          predictedShareRaw: 10.4 },
            { name: 'Dragapult Dusknoir',    predictedShareRaw: 7.5 },
            { name: 'Dragapult Blaziken',    predictedShareRaw: 6.2 },
            { name: 'Dragapult Dudunsparce', predictedShareRaw: 5.4 },
            { name: 'Fuellmaterial Feld',    predictedShareRaw: 70.5 },
        ];
        const ctx = inKontext(FN, {
            _shareList: liste,
            _familyKeyForDeck: n => n.split(' ')[0],
            _lastMajorInfo: null,
            _consolidationLastLogId: null,
        }, ueberschreiben);
        ctx.__f();
        const nach = {};
        liste.forEach(d => { nach[d.name] = d; });
        return nach;
    }

    it('die Konsolidierungsrate steht in der Quelle und ist nicht null', () => {
        // ANLASS: Indianapolis 2026-05-29. Die Dragapult-Familie ging von
        // 29,34 % (TEF-POR-Labs) auf 32,12 % (Indy real), und INNERHALB
        // der Familie sprang das pure Dragapult von 35,4 % auf 61,5 %
        // Familienanteil. Der Motor unterschaetzte pures Dragapult um
        // 9,45 pp, weil keine Stufe diese Konsolidierung abbildete.
        // Bei Rate 0 verteilt die Stufe nichts um — die 9,45 pp sind
        // zurueck, waehrend die Familienwachstums-Zugabe die Stufe
        // weiterhin "aktiv" aussehen laesst.
        const rate = zahl('PREDICTOR_56_CONSOLIDATION_RATE');
        assert.ok(rate > 0,
            `PREDICTOR_56_CONSOLIDATION_RATE steht auf ${rate} — es wird nichts `
            + 'mehr zur Leitvariante verschoben');
        assert.ok(rate <= 0.5,
            `PREDICTOR_56_CONSOLIDATION_RATE steht auf ${rate}. Hoehere Raten `
            + '(0,60) kommen dem Leiter naeher, zerdruecken aber Dusknoir, das '
            + 'in Indy real bei 6,29 % hielt. 0,40 ist die gemessene Mitte.');
        assert.ok(zahl('PREDICTOR_56_MIN_VARIANTS') >= 3,
            'unter drei Varianten gibt es keine Konsolidierung zu messen');
        assert.ok(zahl('PREDICTOR_56_FAMILY_DOMINANCE_THRESHOLD') > 0,
            'ohne Dominanzschwelle konsolidiert jede beliebige Familie');
    });

    it('nachgerechnet: die Leitvariante gewinnt, die Untervarianten geben ab', () => {
        const nach = lauf();
        const leiter = nach['Dragapult ex'];
        assert.ok(leiter.consolidationBoostPp > 0,
            'die Leitvariante bekommt keine Umverteilung mehr — genau das war '
            + 'die Mutation, die keinen Test rot machte');
        // 40 % des Untervarianten-Pools (7,5 + 6,2 + 5,4 = 19,1).
        const erwartet = 19.1 * zahl('PREDICTOR_56_CONSOLIDATION_RATE');
        assert.ok(Math.abs(leiter.consolidationBoostPp - erwartet) < 1e-9,
            `die Quelle verteilt ${leiter.consolidationBoostPp} um, die `
            + `Quellkonstanten ergeben ${erwartet}`);
        for (const name of ['Dragapult Dusknoir', 'Dragapult Blaziken', 'Dragapult Dudunsparce']) {
            assert.ok(nach[name].consolidationDecayPp < 0,
                `${name} gibt nichts ab — die Umverteilung findet nicht statt`);
        }
        assert.ok(nach['Dragapult Dusknoir'].predictedShareRaw < 7.5,
            'Dusknoir behaelt seinen vollen Anteil');
    });

    it('die Familienwachstums-Zugabe allein taeuscht keine Konsolidierung vor', () => {
        // Wichtig: bei Rate 0 bekommt die Leitvariante trotzdem
        // PREDICTOR_56_FAMILY_GROWTH_BOOST_PP. Wer nur "Leiter ist
        // gewachsen" prueft, sieht die abgeschaltete Stufe nicht.
        const nach = lauf({ PREDICTOR_56_CONSOLIDATION_RATE: 0 });
        assert.ok(nach['Dragapult ex'].predictedShareRaw > 10.4,
            'auch mit Rate 0 waechst der Leiter um die Familienzugabe — deshalb '
            + 'darf diese Pruefung nicht am Leiterwachstum haengen');
        assert.equal(nach['Dragapult Dusknoir'].predictedShareRaw, 7.5,
            'ohne Rate darf keine Untervariante abgeben');
    });

    it('eine Familie mit zwei Varianten konsolidiert nicht', () => {
        const liste = [
            { name: 'Ogerpon Hydrapple', predictedShareRaw: 12.0 },
            { name: 'Ogerpon Arboliva',  predictedShareRaw: 11.0 },
            { name: 'Fuellmaterial Feld', predictedShareRaw: 77.0 },
        ];
        const ctx = inKontext(FN, {
            _shareList: liste,
            _familyKeyForDeck: n => n.split(' ')[0],
            _lastMajorInfo: null,
            _consolidationLastLogId: null,
        });
        ctx.__f();
        assert.equal(liste[0].predictedShareRaw, 12.0);
        assert.equal(liste[1].predictedShareRaw, 11.0);
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 6 — Predictor 4.6, Familien-Deckel (Feld-Unterdrueckung)
// ════════════════════════════════════════════════════════════════════

describe('Stufe 6 — Predictor 4.6: der Deckel auf die uebergrosse Familie', () => {

    const FN = funktionAusQuelle('_computeFieldSuppression')
        + '\nglobalThis.__f = _computeFieldSuppression;';

    function lauf(ueberschreiben) {
        // Utrecht-Lage: Dragapult-Familie bei 31,3 % des Feldes.
        const liste = [
            { name: 'Dragapult ex',       predictedShareRaw: 20.0 },
            { name: 'Dragapult Dusknoir', predictedShareRaw: 11.3 },
        ];
        // Das Restfeld auf vier Familien verteilt: jede unter dem
        // Familienboden, damit nur Dragapult unterdrueckt wird.
        for (let i = 0; i < 4; i++) {
            liste.push({ name: `Fuell${i} Feld`, predictedShareRaw: 68.7 / 4 });
        }
        const ctx = inKontext(FN, {
            _shareList: liste,
            _metaCallMode: 'counter',
            _familyKeyForDeck: n => n.split(' ')[0],
            _lastMajorInfo: null,
            _fieldSuppressionLastLogId: null,
        }, ueberschreiben);
        ctx.__f();
        const nach = {};
        liste.forEach(d => { nach[d.name] = d; });
        return nach;
    }

    it('die Unterdrueckungsrate steht in der Quelle und ist nicht null', () => {
        // ANLASS (2026-05-16): PER_PP=0,10 mit CAP=3,0 bewegte die
        // Dragapult-Familie in Utrecht nur von 31,3 % auf ~30 % prognos-
        // tiziert, real erwartet waren ~25 %. Zwei aufeinanderfolgende
        // 30-%-Dragapult-Regionals loesen eine Gegenanpassung der Spieler
        // aus, die die Online-Leiter noch nicht zeigt. Deshalb 0,30/6,0:
        // bei 31,3 % ergibt das min(6,0; 11,3 x 0,30) = 3,39 pp.
        // Bei 0 faellt der Deckel komplett aus — `if (suppressPp <= 0)
        // return;` steigt sofort aus, und die Prognose folgt wieder
        // ungebremst der Online-Leiter.
        const proPP = zahl('PREDICTOR_46_SUPPRESS_PER_PP');
        assert.ok(proPP > 0,
            `PREDICTOR_46_SUPPRESS_PER_PP steht auf ${proPP} — der Deckel `
            + 'unterdrueckt nichts mehr');
        assert.ok(proPP >= 0.2,
            `PREDICTOR_46_SUPPRESS_PER_PP steht auf ${proPP}. Der Vorgaengerwert `
            + '0,10 war gemessen zu schwach: 31,3 % -> ~30 % statt ~25 %.');
        assert.ok(zahl('PREDICTOR_46_SUPPRESS_CAP_PP') > 0,
            'ohne Deckel-Obergrenze kann die Unterdrueckung die Familie ausloeschen');
        assert.ok(zahl('PREDICTOR_46_FAMILY_FLOOR_PCT') > 0,
            'ohne Familienboden wird jede Familie unterdrueckt');
    });

    it('nachgerechnet: eine Familie bei 31,3 % verliert 3,39 pp', () => {
        const nach = lauf();
        const gesamt = nach['Dragapult ex'].fieldSuppressionPp
                     + nach['Dragapult Dusknoir'].fieldSuppressionPp;
        const ueberschuss = 31.3 - zahl('PREDICTOR_46_FAMILY_FLOOR_PCT');
        const erwartet = Math.min(zahl('PREDICTOR_46_SUPPRESS_CAP_PP'),
                                  ueberschuss * zahl('PREDICTOR_46_SUPPRESS_PER_PP'));
        assert.ok(erwartet > 0, 'die Quellkonstanten ergeben keine Unterdrueckung');
        assert.ok(Math.abs(gesamt - erwartet) < 1e-9,
            `die Quelle unterdrueckt ${gesamt} pp, die Quellkonstanten ergeben ${erwartet} pp`);
        assert.ok(nach['Dragapult ex'].predictedShareRaw < 20.0,
            'die groesste Variante der Familie verliert nichts — der Deckel ist tot');
        assert.ok(nach['Dragapult Dusknoir'].predictedShareRaw < 11.3,
            'die zweite Variante verliert nichts');
        // Groessere Varianten geben mehr ab.
        assert.ok((20.0 - nach['Dragapult ex'].predictedShareRaw)
                > (11.3 - nach['Dragapult Dusknoir'].predictedShareRaw),
            'die Verteilung ist nicht mehr anteilig');
    });

    it('das Fuellmaterial ausserhalb der Familie bleibt unangetastet', () => {
        const nach = lauf();
        assert.equal(nach['Fuell0 Feld'].predictedShareRaw, 68.7 / 4);
        assert.equal(nach['Fuell0 Feld'].fieldSuppressionPp, 0);
    });

    it('Gegenprobe: mit Rate 0 bleibt die Familie unangetastet', () => {
        const nach = lauf({ PREDICTOR_46_SUPPRESS_PER_PP: 0 });
        assert.equal(nach['Dragapult ex'].predictedShareRaw, 20.0,
            'genau das war die Mutation, die keinen Test rot machte');
    });
});

// ════════════════════════════════════════════════════════════════════
// STUFE 7 — Predictor 4.7, Online-Turniersieg (Underdog)
// ════════════════════════════════════════════════════════════════════

describe('Stufe 7 — Predictor 4.7: der Online-Turniersieg als Fruehsignal', () => {

    const BLOCK = blockAusQuelle(
        'const onlineWin = _onlineWinsByDeck[k];',
        'd.predictedShareRaw = Math.max(0, predicted);');

    function schub(fall, ueberschreiben) {
        const code = 'globalThis.__f = function (k, d, predicted, _onlineWinsByDeck, _todayISO) {\n'
            + BLOCK + '\n  return { predicted, d };\n};';
        const ctx = inKontext(code, {}, ueberschreiben);
        const d = { ladderShare: fall.onlineAnteil };
        const heute = new Date('2026-06-01T00:00:00Z');
        const sieg = new Date(heute.getTime() - fall.alterTage * 86400000);
        const r = ctx.__f('deck', d, 5.0,
            { deck: { date: sieg.toISOString().slice(0, 10), players: fall.spieler } },
            () => '2026-06-01');
        return { zuwachs: r.predicted - 5.0, d };
    }

    it('die Obergrenze und die Tore stehen in der Quelle und sind nicht null', () => {
        // ANLASS: Der Indianapolis-Nachbericht nennt Ogerpon Meganium
        // Hydrapple mit Online-Siegen bei 341, 194 und 70 Spielern —
        // alle VOR dem Regional-Sprung. Bei Obergrenze 0 ist `bonus`
        // immer 0, die Schranke `if (bonus > 0.01)` schluckt ihn, und
        // das Fruehsignal ist weg, ohne dass ein Tor zumacht.
        const deckel = zahl('PREDICTOR_4_7_BOOST_PP_MAX');
        assert.ok(deckel > 0,
            `PREDICTOR_4_7_BOOST_PP_MAX steht auf ${deckel} — jeder Bonus faellt `
            + 'unter die 0,01-Schranke und wird verworfen');
        // Ein Online-Sieg ist ein schwaecheres Signal als ein Regional-
        // Titel: der Deckel muss klar unter dem von 4.6 liegen.
        assert.ok(deckel < zahl('PREDICTOR_4_6_BOOST_PP_MAX'),
            'Online-Siege duerfen nicht so stark wiegen wie ein Regional-Titel');
        assert.ok(zahl('PREDICTOR_4_7_MIN_PLAYERS') >= 150,
            'unter 150 Teilnehmern ist ein Online-Turnier Discord-Rauschen '
            + '(der 70-Spieler-Sieg im Nachbericht faellt genau deshalb raus)');
        assert.ok(zahl('PREDICTOR_4_7_ZERO_DECAY_DAYS')
                < zahl('PREDICTOR_4_6_ZERO_DECAY_DAYS'),
            'Online-Turniere laufen woechentlich — ihr Fenster muss enger sein '
            + 'als das der Regionals, sonst zaehlt derselbe Sieg mehrfach');
    });

    it('nachgerechnet: der 341-Spieler-Sieg von Hydrapple bringt ~0,44 pp', () => {
        //   freshness  = 1 - (8-7)/(21-7)      = 0,929
        //   underrated = (5,0 - 1,85)/5,0      = 0,63
        //   sizeMult   = min(2; sqrt(341/150)) = 1,508
        //   bonus      = 1,0 x 0,929 x 0,63 x 1,508 x 0,5 = 0,441
        const { zuwachs, d } = schub({ onlineAnteil: 1.85, spieler: 341, alterTage: 8 });
        assert.ok(zuwachs > 0.3,
            `der Online-Sieg brachte ${zuwachs.toFixed(3)} pp — unter 0,3 pp ist `
            + 'die Stufe faktisch abgeschaltet');
        assert.ok(Math.abs(zuwachs - 0.441) < 0.01,
            `erwartet ~0,44 pp aus den Quellkonstanten, gerechnet ${zuwachs.toFixed(3)}`);
        assert.ok(d.onlineWin && d.onlineWin.boostPP > 0,
            'die Marke onlineWin bleibt leer — die Oberflaeche zeigt den Sieg nicht');
    });

    it('der Deckel haelt auch im Extremfall', () => {
        const { zuwachs } = schub({ onlineAnteil: 0, spieler: 6000, alterTage: 0 });
        assert.ok(Math.abs(zuwachs - zahl('PREDICTOR_4_7_BOOST_PP_MAX')) < 1e-9,
            `alle Faktoren am Anschlag muessen genau den Deckel ergeben, `
            + `gerechnet ${zuwachs}`);
    });

    it('die Tore im Rechenblock schliessen wie gemessen', () => {
        // Deck schon etabliert: kein Underdog mehr.
        assert.equal(schub({ onlineAnteil: 5.5, spieler: 300, alterTage: 3 }).zuwachs, 0);
        assert.equal(schub({ onlineAnteil: zahl('PREDICTOR_4_7_MAX_SHARE_PCT'),
                             spieler: 300, alterTage: 3 }).zuwachs, 0);
        // Sieg aelter als das Fenster.
        assert.equal(schub({ onlineAnteil: 2.0, spieler: 200, alterTage: 30 }).zuwachs, 0);
        assert.equal(schub({ onlineAnteil: 2.0,  spieler: 200,
                             alterTage: zahl('PREDICTOR_4_7_ZERO_DECAY_DAYS') }).zuwachs, 0);
    });

    it('der Spielerboden steht beim Laden, nicht im Rechenblock', () => {
        // GENAU NACHGEMESSEN: der Rechenblock kennt PREDICTOR_4_7_MIN_PLAYERS
        // nur als Nenner von sizeMult. Ein 70-Spieler-Sieg brachte dort
        // 0,205 pp — er wird nicht hier, sondern schon beim Einlesen von
        // data/online_tournament_winners.csv verworfen. Wer diese Zeile
        // entfernt, oeffnet den Discord-Boden, ohne dass der Rechenblock
        // sich aendert.
        assert.match(SRC, /if \(players < PREDICTOR_4_7_MIN_PLAYERS\) continue;/,
            'der Spielerboden beim Einlesen ist verschwunden — dann zaehlen '
            + 'wieder 70-Spieler-Turniere mit');
        const { zuwachs } = schub({ onlineAnteil: 2.0, spieler: 70, alterTage: 3 });
        assert.ok(zuwachs > 0,
            'der Rechenblock filtert kleine Turniere doch selbst — dann ist die '
            + 'Zusicherung oben ueberfluessig geworden und die Begruendung falsch');
    });

    it('Gegenprobe: mit Obergrenze 0 verschwindet das Fruehsignal', () => {
        const { zuwachs, d } = schub({ onlineAnteil: 1.85, spieler: 341, alterTage: 8 },
                                     { PREDICTOR_4_7_BOOST_PP_MAX: 0 });
        assert.equal(zuwachs, 0, 'genau das war die Mutation, die keinen Test rot machte');
        assert.equal(d.onlineWin, null);
    });
});

// ════════════════════════════════════════════════════════════════════
// Querschnitt: keine der sieben Zahlen darf still auf null fallen
// ════════════════════════════════════════════════════════════════════

describe('Querschnitt — die sieben abschaltbaren Konstanten', () => {

    it('alle sieben stehen in der Quelle und sind von null verschieden', () => {
        // Diese Liste ist die Buchfuehrung ueber den Befund vom
        // 02.09.2026. Wer eine Stufe wirklich stilllegen will, tut das
        // wie 4.0a/5.2/6.1: mit einem benannten Schalter und der Messung
        // daneben (siehe test-stufen-inventur.js) — nicht, indem er eine
        // Konstante auf 0 setzt und die Stufe weiter rechnen laesst.
        for (const name of [
            'DAY2_MIN_ANKER',
            'PREDICTOR_5_4_BOOST_PER_PP',
            'PREDICTOR_5_9_NEW_BOOST_PP_MAX',
            'PREDICTOR_5_9_RISING_BOOST_PP_MAX',
            'PREDICTOR_57_BOOST_PP_MAX',
            'PREDICTOR_56_CONSOLIDATION_RATE',
            'PREDICTOR_46_SUPPRESS_PER_PP',
            'PREDICTOR_4_7_BOOST_PP_MAX',
        ]) {
            assert.notEqual(zahl(name), 0,
                `${name} steht auf 0 — die zugehoerige Predictor-Stufe rechnet `
                + 'weiter, liefert aber fuer jedes Deck genau nichts');
        }
    });
});
