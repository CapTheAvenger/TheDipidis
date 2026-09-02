/**
 * Der gemessene Prognosekern, der die 46 Vorhersagestufen ersetzt.
 *
 * Diese Tests halten fest, was an einer leckfreien Rueckwaertsstrecke ueber
 * 54 Turniere aus zehn Formatepochen gemessen wurde (tools/prognose_strecke.py):
 *
 *   ausgelieferter Motor bisher   1,714 pp
 *   Mittel der letzten zwei       1,376 pp   <- er war schlechter als nichts
 *   dieser Kern                   1,256 pp
 *   Orakel mit Kenntnis der Zukunft 1,020 pp <- die harte Untergrenze
 *
 * Sie pruefen NICHT die Zahlen nach — dafuer ist die Strecke da. Sie halten
 * die Entscheidungen fest, damit niemand sie versehentlich zurueckdreht:
 * kein Konzentrations-Exponent, keine Online-Leiter im Anteilsterm, keine
 * Trendfortschreibung, Alterung nach Rang statt nach Datum.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

const ohneKommentar = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

/** Den Kern samt Konstanten in einen eigenen Kontext heben und ausfuehrbar machen. */
function ladeKern(majorShares) {
    const teile = [];
    for (const name of ['PROGNOSE_LAMBDA', 'PROGNOSE_GAMMA', 'PROGNOSE_DELTA',
                        'PROGNOSE_UNTEN', 'PROGNOSE_NT']) {
        const m = SRC.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+)'));
        assert.ok(m, `Konstante ${name} fehlt`);
        teile.push(`const ${name} = ${m[1]};`);
    }
    for (const fn of ['_prognoseTurniere', '_prognoseKern']) {
        const m = SRC.match(new RegExp('  function ' + fn + '\\(\\) \\{[\\s\\S]*?\\n  \\}\\n'));
        assert.ok(m, `Funktion ${fn} nicht herausloesbar`);
        teile.push(m[0]);
    }
    const ctx = { _majorSharesByDeck: majorShares, Math: Math, Object: Object,
                  Array: Array, Map: Map, console: console };
    vm.createContext(ctx);
    new vm.Script(teile.join('\n') + '\nglobalThis.__kern = _prognoseKern;').runInContext(ctx);
    return ctx.__kern;
}

function turnier(tid, datum, decks) {
    // decks: {key: [anteil, winrate, koepfe]}
    const aus = {};
    Object.keys(decks).forEach(k => {
        const [a, w, n] = decks[k];
        aus[k] = { tid, date: datum, day1Share: a, day1WinPct: w, day1Players: n, share: a, winPct: w, players: n };
    });
    return aus;
}

function baue(turniere) {
    const nach = {};
    turniere.forEach(t => Object.keys(t).forEach(k => {
        (nach[k] = nach[k] || []).push(t[k]);
    }));
    return nach;
}

describe('Prognosekern: er rechnet ueberhaupt', () => {
    it('aus einem Turnier kommen die Anteile dieses Turniers', () => {
        const kern = ladeKern(baue([turnier('1', '2026-01-01', { a: [50, 55, 100], b: [50, 45, 100] })]));
        const r = kern();
        assert.ok(r.get('a') > 0 && r.get('b') > 0);
    });

    it('ohne Daten kommt eine leere Antwort, kein Absturz', () => {
        assert.equal(ladeKern({})().size, 0);
    });
});

describe('Prognosekern: das juengste Turnier wiegt mehr', () => {
    it('ein Deck, das zuletzt gross war, wird hoeher geschaetzt als der Schnitt', () => {
        const kern = ladeKern(baue([
            turnier('1', '2026-01-01', { steigt: [10, 50, 100], faellt: [40, 50, 400] }),
            turnier('2', '2026-01-08', { steigt: [40, 50, 400], faellt: [10, 50, 100] })
        ]));
        const r = kern();
        assert.ok(r.get('steigt') > r.get('faellt'),
            'das zuletzt grosse Deck muss vorne liegen — sonst wirkt die Rezenz nicht');
    });

    it('die Alterung geht nach Turnierrang, nicht nach Datum', () => {
        // Zwei Laeufe mit identischer Reihenfolge, aber voellig anderen Abstaenden.
        // Gemessen ist Datumsalterung durchweg schlechter (Halbwert 30 Tage:
        // 1,448 pp gegen 1,376 pp Grundlinie), darum darf das Datum nichts aendern.
        const decks1 = { a: [30, 50, 300], b: [20, 50, 200] };
        const decks2 = { a: [20, 50, 200], b: [30, 50, 300] };
        const eng = ladeKern(baue([turnier('1', '2026-01-01', decks1), turnier('2', '2026-01-02', decks2)]));
        const weit = ladeKern(baue([turnier('1', '2025-01-01', decks1), turnier('2', '2026-01-02', decks2)]));
        const a = eng(), b = weit();
        assert.ok(Math.abs(a.get('a') - b.get('a')) < 1e-9,
            'der zeitliche Abstand veraendert das Ergebnis — es wird nach Datum gealtert');
    });
});

describe('Prognosekern: Mittelwertrueckkehr drueckt die Spitze', () => {
    it('grosse Anteile werden gestaucht, kleine angehoben', () => {
        const kern = ladeKern(baue([turnier('1', '2026-01-01',
            { gross: [40, 50, 400], klein: [4, 50, 40] })]));
        const r = kern();
        // Nach dem Exponenten muss das Verhaeltnis kleiner sein als vorher 10:1
        assert.ok(r.get('gross') / r.get('klein') < 10,
            'ohne Rueckkehr bliebe das Verhaeltnis 10:1');
        assert.ok(r.get('gross') > r.get('klein'), 'die Reihenfolge muss bleiben');
    });

    it('der Exponent liegt im gemessenen Plateau', () => {
        const m = SRC.match(/const PROGNOSE_GAMMA\s*=\s*([0-9.]+)/);
        const g = parseFloat(m[1]);
        assert.ok(g >= 0.86 && g <= 1.00,
            `GAMMA=${g} liegt ausserhalb des gemessenen Plateaus 0,86-1,00 — `
            + 'darunter und darueber faellt das Modell unter die Grundlinie zurueck');
    });
});

describe('Prognosekern: Leistung hebt, aber begrenzt', () => {
    it('ein Deck mit besserer Siegquote wird hoeher geschaetzt', () => {
        const gleich = baue([turnier('1', '2026-01-01', { a: [20, 50, 200], b: [20, 50, 200] })]);
        const besser = baue([turnier('1', '2026-01-01', { a: [20, 58, 200], b: [20, 50, 200] })]);
        const ra = ladeKern(gleich)(), rb = ladeKern(besser)();
        assert.ok(Math.abs(ra.get('a') - ra.get('b')) < 1e-9, 'bei gleicher Quote gleich');
        assert.ok(rb.get('a') > rb.get('b'), 'die bessere Quote muss heben');
    });

    it('der Leistungsfaktor kann nicht beliebig tief druecken', () => {
        // Ein katastrophal schlechtes Deck darf nicht auf null fallen — der
        // Term traegt gemessen nur 0,08 pp und ist entsprechend gedeckelt.
        const kern = ladeKern(baue([turnier('1', '2026-01-01',
            { mies: [20, 5, 200], gut: [20, 95, 200] })]));
        const r = kern();
        assert.ok(r.get('mies') > 0, 'ein schlechtes Deck verschwindet nicht');
        const u = SRC.match(/const PROGNOSE_UNTEN\s*=\s*([0-9.]+)/);
        assert.ok(parseFloat(u[1]) > 0.5, 'die Untergrenze fehlt oder ist zu tief');
    });
});

describe('Prognosekern: was gemessen nichts beitraegt, ist auch nicht drin', () => {
    it('der Konzentrations-Exponent ist entfernt', () => {
        const code = ohneKommentar(SRC);
        assert.ok(!/CONCENTRATION_EXP_BASE/.test(code),
            'der Exponent ist zurueck — gemessen kostete er +0,361 pp und war '
            + 'in 52 von 54 Turnieren schlechter');
        assert.ok(/concentrationExp = 1\.00/.test(code),
            'das Feld muss weiter gesetzt werden, die Oberflaeche liest es');
    });

    it('der Kern liest die Online-Leiter nicht', () => {
        const i = SRC.indexOf('function _prognoseKern()');
        const koerper = SRC.slice(i, SRC.indexOf('\n  }\n', i));
        for (const verboten of ['ladderShare', 'onlineShare', '_snapshotAtMajor', 'ladderPct']) {
            assert.ok(!koerper.includes(verboten),
                `der Kern liest ${verboten} — die Leiter wurde als ueberangepasst verworfen`);
        }
    });

    it('der Kern schreibt keine Trendfortschreibung', () => {
        const i = SRC.indexOf('function _prognoseKern()');
        const koerper = SRC.slice(i, SRC.indexOf('\n  }\n', i));
        assert.ok(!/vorletzt|trend|momentum/i.test(koerper),
            'Trendfortschreibung ist gemessen wertlos, das Optimum liegt bei Glaettung');
    });
});

describe('Prognosekern: die Verdrahtung haelt', () => {
    it('er wird genau einmal je Lauf gerechnet, nicht je Deck', () => {
        const code = ohneKommentar(SRC);
        assert.match(code, /const _prognoseKernCache = .*_prognoseKern\(\)/,
            'kein Zwischenspeicher — der Kern liefe je Deck neu');
        // Die Definition nicht mitzaehlen — nur echte Aufrufstellen.
        const aufrufe = (code.match(/(?<!function )_prognoseKern\(\)/g) || []).length;
        assert.equal(aufrufe, 1, `der Kern wird ${aufrufe}-mal aufgerufen, erwartet 1`);
    });

    it('ohne Kernwert gibt es einen Rueckfall statt einer Null', () => {
        const i = SRC.indexOf('const _kernWert');
        const block = SRC.slice(i, i + 500);
        assert.match(block, /else if \(_predictorMode === 'B'\)/,
            'ein Deck ohne Praesenzhistorie faellt auf nichts zurueck');
    });
});

describe('Day-2-Empfehlung: die Schrumpfung ordnet, nicht die Markow-Kette', () => {
    it('die geschrumpfte Quote existiert und traegt ihr k', () => {
        assert.match(SRC, /function _day2Schrumpfung\(\)/,
            'die gemessene Empfehlungsgrundlage fehlt');
        const m = SRC.match(/const DAY2_SCHRUMPFUNG_K\s*=\s*(\d+)/);
        assert.ok(m, 'die Schrumpfungsstaerke k fehlt');
        assert.equal(parseInt(m[1], 10), 30, 'k=30 war der gemessene Wert');
    });

    it('die Mindeststichprobe existiert und ist nicht null', () => {
        // BEFUND (02.09.2026): der Test unten schob DAY2_MIN_ANKER als
        // LITERAL 30 in den vm-Kontext. Der Motor durfte die Zahl auf 0
        // setzen — das Tor fiel, die Geisterempfehlungen kamen zurueck,
        // und hier blieb alles gruen, weil der Kontext weiter mit 30
        // rechnete. Seitdem wird die Zahl gelesen, nicht gewusst.
        //
        // Wofuer das Tor da ist, steht im Motor: ohne es empfahl der
        // Motor in 25 von 44 Turnieren ein Deck, das gar nicht antrat.
        const m = SRC.match(/const DAY2_MIN_ANKER\s*=\s*(\d+)/);
        assert.ok(m, 'die Mindeststichprobe DAY2_MIN_ANKER fehlt');
        assert.ok(parseInt(m[1], 10) >= 30,
            `DAY2_MIN_ANKER steht auf ${m[1]} — unter 30 ausgewerteten Spielern `
            + 'traegt die geschrumpfte Quote keine Empfehlung (dieselbe Schwelle '
            + 'wie MIN_ANZEIGE in scripts/build_deckempfehlung.py)');
    });

    it('sie zieht duenne Decks kraeftig zum Feldmittel', () => {
        const m = SRC.match(/function _day2Schrumpfung\(\)[\s\S]*?\n  \}\n/);
        assert.ok(m, 'Funktion nicht herausloesbar');
        function rechne(faelle) {
            // Beide Konstanten kommen AUS DER QUELLE. Ein Literal hier
            // machte die Zusicherungen unten blind gegen jede Aenderung
            // am Motor — genau daran lief die Mutationspruefung vom
            // 02.09.2026 gruen durch.
            const kAus = SRC.match(/const DAY2_SCHRUMPFUNG_K\s*=\s*(-?[\d.]+)/);
            const ankerAus = SRC.match(/const DAY2_MIN_ANKER\s*=\s*(-?[\d.]+)/);
            assert.ok(kAus && ankerAus, 'DAY2_SCHRUMPFUNG_K / DAY2_MIN_ANKER fehlen in der Quelle');
            const ctx = { Math, Object, Map, Array,
                DAY2_SCHRUMPFUNG_K: Number(kAus[1]), DAY2_MIN_ANKER: Number(ankerAus[1]),
                _majorSharesByDeck: faelle.anteile, _labsDay2ConvByDeck: faelle.conv };
            vm.createContext(ctx);
            new vm.Script(m[0] + '\nglobalThis.__f = _day2Schrumpfung;').runInContext(ctx);
            return ctx.__f();
        }
        const r = rechne({
            anteile: { dick: [{ tid: 't1', day1Players: 1000 }],
                       duenn: [{ tid: 't1', day1Players: 6 }],
                       hauch: [{ tid: 't1', day1Players: 2 }] },
            conv: { dick:  { samples: [{ tid: 't1', conv: 0.30 }] },
                    duenn: { samples: [{ tid: 't1', conv: 1.00 }] },
                    hauch: { samples: [{ tid: 't1', conv: 1.00 }] } }
        });
        // Die Rohquote ist bei beiden duennen Decks 100 %. Die Schrumpfung
        // muss sie deutlich herunterziehen — und zwar umso staerker, je
        // duenner die Datenlage ist.
        // Bei k=30 landen 6 Spieler mit 100 % rechnerisch bei 0,42 und
        // schluegen damit ein solides 30-%-Deck. Deshalb greift ZUSAETZLICH
        // die Mindestgroesse — Schrumpfung allein reicht nicht.
        assert.equal(r.get('hauch'), undefined,
            'ein Deck mit zwei Spielern darf gar nicht erst empfohlen werden');
        assert.equal(r.get('duenn'), undefined,
            'ein Deck mit sechs Spielern darf gar nicht erst empfohlen werden');
        // Und das dicke Deck bleibt praktisch bei seinem Messwert.
        assert.ok(Math.abs(r.get('dick') - 0.30) < 0.02,
            'ein Deck mit tausend Spielern darf kaum bewegt werden');
    });

    it('die beiden schaedlichen Multiplikatoren wirken nicht mehr', () => {
        const code = ohneKommentar(SRC);
        assert.ok(!/adjustedDay2 = blendedDay2 \* d2WrMult/.test(code),
            'der d2WR-Multiplikator wirkt wieder — gemessen nimmt er den Gewinn weg '
            + '(+8,68 auf +7,04 pp)');
        assert.ok(!/adjustedDay2 \*= p46RecoMult/.test(code),
            'der Underdog-Multiplikator wirkt wieder — gemessen wirkungslos');
        // Beide muessen weiter BERECHNET werden, die Oberflaeche zeigt sie an.
        assert.match(code, /const d2WrMult = _d2WrMultiplier/, 'd2WrMult wird nicht mehr berechnet');
        assert.match(code, /p46RecoMult = 1\.0 \+ 0\.50/, 'p46RecoMult wird nicht mehr berechnet');
    });

    it('day2Prob wird aus der Schrumpfung gespeist, nicht aus der Markow-Kette', () => {
        // Die Liste wird nach day2Prob sortiert. Steht dort wieder der
        // Markow-Wert, ist der ganze Umbau wirkungslos — die Zahl aendert
        // sich, die Reihenfolge nicht.
        assert.match(SRC, /day2Prob: _rang,/,
            'day2Prob kommt nicht aus dem Schrumpfungsrang');
        assert.match(SRC, /const _rang = \(typeof _schrumpf === 'number' && _schrumpf > 0\) \? _schrumpf : adjustedDay2;/,
            'der Rang faellt nicht sauber auf den alten Wert zurueck');
    });

    it('die Markow-Zahl bleibt sichtbar, statt still zu verschwinden', () => {
        assert.match(SRC, /markowDay2Prob: adjustedDay2/,
            'die Markow-Zahl wird nicht mehr mitgegeben');
        assert.match(SRC, /simDay2Prob: r\.day2Prob/,
            'die rohe Simulation wird nicht mehr mitgegeben');
    });

    it('die Schrumpfung wird einmal je Aufruf gerechnet, nicht je Deck', () => {
        const code = ohneKommentar(SRC);
        assert.match(code, /const _day2SchrumpfCache = _day2Schrumpfung\(\)/,
            'kein Zwischenspeicher');
        const aufrufe = (code.match(/(?<!function )_day2Schrumpfung\(\)/g) || []).length;
        assert.equal(aufrufe, 1, `${aufrufe} Aufrufe, erwartet 1`);
    });
});
