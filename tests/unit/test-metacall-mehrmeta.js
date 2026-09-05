/**
 * Predictor 6.2 — Mehrmeta-Leistung.
 *
 * Der Betreiber am 28.08.2026: "ein Deck, was ueber mehrere Meta gut
 * performt, wie Dragapult zum Beispiel, zeigt ja auch, dass es
 * natuerlich weiter gespielt wird."
 *
 * Predictor 5.5 zog aus dem geschlossenen Format bisher nur den
 * Anteil. 6.2 spreizt den Bodenfaktor zusaetzlich nach Win Rate und
 * Day-2-Quote desselben Formats. Gemessen am 28.08.2026 in TEF-CRI:
 * Schnitt 47,10 % Win Rate / 19,0 % Day-2-Quote; Dragapult stand bei
 * 53,5 % / 32 %, Mega Greninja bei 37,9 % / 5,7 %.
 *
 * Geprueft wird die echte Funktion aus js/app-meta-call.js, nicht
 * eine Nachbildung.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function schneideFunktion(quelle, name) {
    const start = quelle.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

function konstante(name) {
    const m = MC.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+)'));
    assert.ok(m, `${name} steht nicht mehr in js/app-meta-call.js`);
    return Number(m[1]);
}

const BASIS   = konstante('PREDICTOR_5_5_FLOOR_FACTOR');
const STARK   = konstante('PREDICTOR_6_2_STARK_FAKTOR');
const SCHWACH = konstante('PREDICTOR_6_2_SCHWACH_FAKTOR');

// Die echte Funktion, mit gesetzten Formatschnitten ausgefuehrt.
function faktorMit(schnittWr, schnittD2) {
    const quelle = [
        `const PREDICTOR_5_5_FLOOR_FACTOR = ${BASIS};`,
        `const PREDICTOR_6_2_STARK_FAKTOR = ${STARK};`,
        `const PREDICTOR_6_2_SCHWACH_FAKTOR = ${SCHWACH};`,
        `let _lastMetaAvgWinRate = ${schnittWr};`,
        `let _lastMetaAvgDay2Conv = ${schnittD2};`,
        schneideFunktion(MC, '_floorFaktorMehrmeta'),
        'return _floorFaktorMehrmeta;',
    ].join('\n');
    return new Function(quelle)();
}

// Die am 28.08.2026 gemessenen Schnitte aus TEF-CRI.
const f = faktorMit(47.10, 0.190);

describe('Predictor 6.2: der Boden folgt der Leistung im alten Meta', () => {
    it('die drei Faktoren stehen in der richtigen Reihenfolge', () => {
        assert.ok(SCHWACH < BASIS, 'der schwache Faktor liegt nicht unter dem Basiswert');
        assert.ok(BASIS < STARK,   'der starke Faktor liegt nicht ueber dem Basiswert');
        assert.ok(STARK <= 1.0,    'der Boden darf den alten Anteil nicht uebersteigen');
    });

    it('Dragapult-Form: ueber Schnitt in beidem -> hoher Boden', () => {
        assert.equal(f({ winRate: 53.49, day2Conv: 0.3204 }), STARK);
    });

    it('Mega-Greninja-Form: unter Schnitt in beidem -> niedriger Boden', () => {
        assert.equal(f({ winRate: 37.89, day2Conv: 0.0569 }), SCHWACH);
    });

    it('gemischt bleibt beim bisherigen Boden', () => {
        // Win Rate ueber Schnitt, Day-2-Quote darunter.
        assert.equal(f({ winRate: 54.40, day2Conv: 0.10 }), BASIS);
        // und andersherum
        assert.equal(f({ winRate: 44.00, day2Conv: 0.25 }), BASIS);
    });

    it('genau auf dem Schnitt zaehlt als stark, nicht als schwach', () => {
        // Die Grenze muss auf einer Seite liegen; ">=" ist die
        // wohlwollende Lesart und haelt den Boden bei 0.70 oder hoeher.
        assert.equal(f({ winRate: 47.10, day2Conv: 0.190 }), STARK);
    });

    it('ohne Messung wird nicht geraten', () => {
        assert.equal(f({ winRate: 0, day2Conv: 0.32 }), BASIS);
        assert.equal(f({ winRate: 53, day2Conv: 0 }), BASIS);
        assert.equal(f({}), BASIS);
        assert.equal(f(null), BASIS);
    });

    it('ohne Formatschnitt bleibt alles beim Alten', () => {
        // Ein Format ohne Win-Rate-Spalte darf die Einstufung nicht
        // auf "alle schwach" kippen.
        const ohne = faktorMit(0, 0);
        assert.equal(ohne({ winRate: 53.49, day2Conv: 0.32 }), BASIS);
        assert.equal(ohne({ winRate: 37.89, day2Conv: 0.05 }), BASIS);
    });
});

describe('Predictor 6.2: die Zahlen kommen aus den Daten, nicht aus der Luft', () => {
    it('der Vergleichswert ist der spielergewichtete Formatschnitt', () => {
        assert.match(MC, /_lastMetaAvgWinRate\s*=\s*wP > 0 \? wS \/ wP : 0/);
        assert.match(MC, /_lastMetaAvgDay2Conv\s*=\s*dP > 0 \? dS \/ dP : 0/);
    });

    it('Zeilen ohne Messung ziehen den Schnitt nicht nach unten', () => {
        // Seit dem 05.09.2026 kann `wr` auch null sein — dann fehlt die
        // Bilanz in der Zeile, und null ist etwas anderes als 0.
        assert.match(MC, /if \(wr != null && wr > 0\) \{ lastMetaAgg\[k\]\.wSum \+= wr \* players/);
        assert.match(MC, /if \(d2c > 0\) \{ lastMetaAgg\[k\]\.dSum \+= d2c \* players/);
    });

    it('die Win Rate kommt aus der Bilanz, nicht aus win_pct', () => {
        // win_pct in labs_tournament_decks.csv ist die MATCHPUNKTQUOTE
        // (3S+U)/3n — gemessen 05.09.2026 ueber alle 4.711 Zeilen:
        // 0,0025 Punkte Abweichung davon, 2,1476 von S/(S+N).
        // Der Formatschnitt darf deshalb nicht aus dieser Spalte kommen.
        assert.match(MC, /const wr = _labsDeckWr\(r, ''\);/);
        assert.doesNotMatch(MC, /const wr = parseEU\(r\.win_pct/);
        // Und die Spalten duerfen ueberhaupt nicht mehr direkt als
        // Quote gelesen werden.
        assert.doesNotMatch(MC, /parseEU\(r\.win_pct \|\| '0'\)/);
        assert.doesNotMatch(MC, /parseEU\(r\.day1_win_pct \|\| '0'\)/);
        assert.doesNotMatch(MC, /parseEU\(r\.day2_win_pct \|\| '0'\)/);
    });

    it('Win Rate und Day-2-Quote landen am Deck', () => {
        assert.match(MC, /winRate:\s*a\.wP > 0 \? a\.wSum \/ a\.wP : 0/);
        assert.match(MC, /day2Conv:\s*a\.dP > 0 \? a\.dSum \/ a\.dP : 0/);
    });

    it('der Faktor wird im Boden auch benutzt', () => {
        assert.match(MC, /const floorFaktor = _floorFaktorMehrmeta\(lastMetaEntry\);/);
        assert.match(MC, /const floorPct = lastMetaEntry\.share \* floorFaktor \* growth;/);
    });

    it('der Boden hebt nur an, er senkt nie', () => {
        // Das ist die Sicherung: faellt 6.2 falsch aus, bleibt
        // schlimmstenfalls die Online-Basis stehen.
        assert.match(MC, /if \(predicted < floorPct\) \{/);
    });

    it('die Herkunft steht am Deck, damit die Karte sie zeigen kann', () => {
        assert.match(MC, /faktor:\s*floorFaktor/);
        assert.match(MC, /prevWinRate:/);
        assert.match(MC, /prevDay2Conv:/);
    });

    it('beim Neuladen werden die Schnitte zurueckgesetzt', () => {
        assert.match(MC, /_lastMetaAvgWinRate\s*=\s*0;/);
        assert.match(MC, /_lastMetaAvgDay2Conv\s*=\s*0;/);
    });
});
