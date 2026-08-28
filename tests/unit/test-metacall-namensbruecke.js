/**
 * Die Namensbruecke im Meta Call.
 *
 * Der Betreiber am 28.08.2026: "Dhelmise und Dhelmise Banette ist das
 * gleiche Deck, nur kommt Dhelmise Banette aus City League weil wir da
 * die Namen ja von den Bildern ableiten, da es dort keine Decknamen
 * gibt."
 *
 * Bis dahin standen beide als eigene Zeile im prognostizierten Feld —
 * gemessen am 28.08.2026 mit 1,61 % und 1,39 % statt einmal 2,90 %. Das
 * Deck war doppelt gezaehlt und dabei zweimal zu klein, und fiel damit
 * aus den ersten zehn heraus.
 *
 * data/archetype_aliases.json war schon da, wurde aber nur vom
 * Current-Meta-Tab benutzt. Diese Datei haelt fest, dass der Meta Call
 * jetzt DIESELBE gepflegte Datei liest — und dass er nichts dazuerfindet.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT   = path.join(__dirname, '..', '..');
const MC     = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
const TIER   = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
const ALIAS  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'archetype_aliases.json'), 'utf8'));

function schneideFunktion(quelle, name) {
    let start = quelle.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    // 'async' gehoert dazu — sonst faellt es beim Herausschneiden weg
    // und ein await im Rumpf ist ploetzlich ein Syntaxfehler.
    if (quelle.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

// Die echte _kanonName-Funktion, mit der echten Brueckendatei gefuettert.
function kanonMit(paare) {
    const quelle = [
        schneideFunktion(MC, 'normalize'),
        'const _aliasTurnierZuLadder = new Map(' + JSON.stringify(
            paare.map(p => [p.turnier.toLowerCase().replace(/[\s\-'’]/g, ''), p.ladder])
        ) + ');',
        schneideFunktion(MC, '_kanonName'),
        'return _kanonName;',
    ].join('\n');
    return new Function(quelle)();
}

const kanon = kanonMit(ALIAS.turnier_zu_ladder || []);

describe('Namensbruecke: dasselbe Deck, ein Name', () => {
    it('Dhelmise Banette wird zu Dhelmise', () => {
        assert.equal(kanon('Dhelmise Banette'), 'Dhelmise');
    });

    it('jedes gepflegte Paar wird auch angewandt', () => {
        (ALIAS.turnier_zu_ladder || []).forEach(p => {
            assert.equal(kanon(p.turnier), p.ladder, `${p.turnier} wird nicht gebrueckt`);
        });
        assert.notEqual((ALIAS.turnier_zu_ladder || []).length, 0, 'die Bruecke ist leer');
    });

    it('ein unbekannter Name bleibt, wie er ist', () => {
        assert.equal(kanon('Mega Greninja'), 'Mega Greninja');
        assert.equal(kanon('Irgendwas Neues'), 'Irgendwas Neues');
    });

    it('bewusst getrennte Paare bleiben getrennt', () => {
        // "eine falsche Verschmelzung ist schlimmer als eine sichtbare
        // Luecke" — das steht so in der Brueckendatei.
        (ALIAS.bewusst_nicht_verbunden || []).forEach(p => {
            assert.equal(kanon(p.turnier), p.turnier,
                `${p.turnier} wird gebrueckt, obwohl es bewusst getrennt bleiben soll`);
        });
    });

    it('die Schreibweise des Apostrophs macht keinen Unterschied', () => {
        // Die Bruecke schlaegt ueber normalize() nach, nicht ueber den
        // Rohtext — sonst haengt ein Treffer an der Typografie der Quelle.
        assert.equal(kanon('dhelmise  banette'), 'Dhelmise');
        assert.equal(kanon('Dhelmise-Banette'), 'Dhelmise');
    });
});

describe('Namensbruecke: sie wird da eingesetzt, wo Turniernamen hereinkommen', () => {
    it('City League laeuft durch die Bruecke', () => {
        const f = schneideFunktion(MC, '_loadClShares');
        assert.match(f, /_kanonName\(roh\)/);
    });

    it('zwei City-League-Zeilen auf denselben Namen werden addiert', () => {
        // Sonst gewinnt die letzte Zeile und die erste verschwindet.
        const f = schneideFunktion(MC, '_loadClShares');
        assert.match(f, /out\[k\]\s*\?\s*out\[k\]\.share\s*:\s*0/);
    });

    it('die Turnier-Top-8-Statistik laeuft durch die Bruecke', () => {
        assert.match(MC, /_tournamentStats\[normalize\(_kanonName\(r\.deck_name\)\)\]/);
    });

    it('die Bruecke steht, bevor die erste Turnierquelle gelesen wird', () => {
        const laden = MC.indexOf('_aliasTurnierZuLadder = await _loadArchetypeAliases()');
        const erste = MC.indexOf("fetch('data/online_tournament_top8_decks.csv");
        const cl    = MC.indexOf("_loadClShares('data/city_league_archetypes_comparison.csv')");
        assert.notEqual(laden, -1, 'die Bruecke wird nicht geladen');
        assert.ok(laden < erste, 'die Bruecke kommt nach der Turnierquelle');
        assert.ok(laden < cl, 'die Bruecke kommt nach City League');
    });
});

describe('Namensbruecke: eine Datei, zwei Leser', () => {
    it('Meta Call und Current Meta lesen dieselbe Datei', () => {
        assert.match(MC,   /archetype_aliases\.json/);
        assert.match(TIER, /archetype_aliases\.json/);
    });

    it('nichts wird ueber Namensaehnlichkeit geraten', () => {
        const f = schneideFunktion(MC, '_loadArchetypeAliases');
        assert.match(f, /turnier_zu_ladder/);
        assert.doesNotMatch(f, /replace\(\s*\/Mega/i);
        assert.doesNotMatch(f, /startsWith|includes\(/,
            'die Bruecke faengt an, Namen zu vergleichen statt nachzuschlagen');
    });

    it('die Bruecke schluesselt beim Laden ueber normalize', async () => {
        // Sonst haengt der Treffer an der Typografie der Brueckendatei:
        // "N's Zoroark" mit geradem Apostroph faende "N\u2019s Zoroark"
        // nicht. Hier laeuft die ECHTE Ladefunktion gegen ein Stub-fetch.
        const quelle = [
            schneideFunktion(MC, 'normalize'),
            'let _aliasTurnierZuLadder = new Map();',
            schneideFunktion(MC, '_loadArchetypeAliases'),
            schneideFunktion(MC, '_kanonName'),
            'return { laden: _loadArchetypeAliases, kanon: _kanonName,',
            '         setzen: (m) => { _aliasTurnierZuLadder = m; } };',
        ].join('\n');
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const bau = new AsyncFunction('fetch', 'Date', quelle);
        const stub = async () => ({
            ok: true,
            json: async () => ({ turnier_zu_ladder: [{ turnier: 'Dhelmise-Banette', ladder: 'Dhelmise' }] }),
        });
        const api = await bau(stub, Date);
        api.setzen(await api.laden());
        // Andere Schreibweise als in der Datei — muss trotzdem treffen.
        assert.equal(api.kanon('dhelmise banette'), 'Dhelmise');
        assert.equal(api.kanon('Dhelmise Banette'), 'Dhelmise');
    });

    it('faellt die Datei aus, bleibt alles beim Alten', () => {
        const f = schneideFunktion(MC, '_loadArchetypeAliases');
        assert.match(f, /catch/);
        assert.match(f, /if \(!resp\.ok\) return karte;/);
    });
});
