'use strict';
/**
 * UI-138 (13.10.2026): das Wording-Lexikon haelt die Oberflaeche.
 *
 * docs/wording-lexikon.md traegt am Ende eine maschinenlesbare Sperrliste
 * (Block ```sperrliste): je Zeile ein Regex, der Ersatz und der Geltungs-
 * bereich. Diese Datei liest die Liste und prueft
 *   - `de`:   die Werte des deutschen Woerterbuchs in js/i18n.js und den
 *             Text von tutorial/tutorial.de.html,
 *   - `alle`: dazu jedes String-Literal in js/*.js, das ein Nutzer sehen
 *             kann — Kommentare, Regex-Literale, Bezeichner, Protokoll-
 *             zeilen (console.*, devLog) und Literale, die mit „[" beginnen,
 *             zaehlen nicht.
 *
 * Warum ein Tokenizer und nicht ein Regex ueber die ganze Datei: ein
 * Kommentar, der die alte Schreibweise zitiert („hiess bis 13.10. Piloten"),
 * ist kein Fehler — und ein Regex ueber die ganze Datei wuerde ihn als einen
 * melden. Eine Verfaelschungsprobe unten zeigt, dass der Tokenizer Kommentare
 * wirklich auslaesst und Literale wirklich findet.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Sperrliste lesen ─────────────────────────────────────────────────── */

function sperrliste(md) {
    const m = md.match(/```sperrliste\n([\s\S]*?)```/);
    assert.ok(m, 'docs/wording-lexikon.md hat keinen Block ```sperrliste');
    return m[1].split('\n')
        .map(z => z.trim())
        .filter(z => z && !z.startsWith('#'))
        .map(z => {
            // Getrennt durch „ | " MIT Leerzeichen: ein | ohne Leerzeichen gehoert zum Regex.
            const teile = z.split(' | ').map(s => s.trim());
            assert.strictEqual(teile.length, 3, 'Sperrzeile hat nicht drei Spalten: ' + z);
            const [muster, ersatz, wo] = teile;
            assert.ok(wo === 'de' || wo === 'alle', 'Geltungsbereich unbekannt: ' + z);
            return { muster, regex: new RegExp(muster, 'g'), ersatz, wo };
        });
}

/* ── Tokenizer: String-Literale im Code, ohne Kommentare und Regex ─────── */

function regexMoeglich(src, i) {
    let k = i - 1;
    while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
    if (k < 0) return true;
    // Nach einem Operator oder einer oeffnenden Klammer beginnt ein Regex,
    // nach einem Wert eine Division. „>" steht fuer den Pfeil „=>" (gemessen
    // 13.10.2026: ohne ihn liest der Tokenizer js/app-deck-builder.js:7401
    // falsch — zwei Scheinliterale aus Code, das echte '' verpasst).
    return '(,=:[!&|?{};\n>+-*%<~^'.includes(src[k]) || src.slice(k - 5, k + 1) === 'return';
}

const PROTOKOLL_AUFRUF = /^(console\.\w+|devLog|_devLog)$/;

/**
 * Liefert je Literal [start, ende, protokoll]: protokoll ist wahr, wenn das
 * Literal in einem Aufruf von console.*, devLog oder _devLog steht — das
 * entscheidet der Stapel offener Klammern mit dem Namen davor, nicht eine
 * Heuristik ueber das letzte Semikolon (die irrte in beide Richtungen,
 * Pruefung 13.10.2026).
 */
function literale(src) {
    const aus = [];
    const n = src.length;
    const klammern = [];              // Namen vor jeder offenen „("

    const imProtokoll = () => klammern.some(name => PROTOKOLL_AUFRUF.test(name));

    function nameVor(j) {             // Bezeichner unmittelbar vor src[j] = '('
        let k = j - 1;
        while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
        let a = k;
        while (a >= 0 && /[\w$.]/.test(src[a])) a--;
        return src.slice(a + 1, k + 1);
    }

    function template(j) {           // j zeigt hinter das oeffnende `
        let start = j;
        while (j < n) {
            const c = src[j];
            if (c === '\\') { j += 2; continue; }
            if (c === '`') { aus.push([start, j, imProtokoll()]); return j + 1; }
            if (c === '$' && src[j + 1] === '{') {
                aus.push([start, j, imProtokoll()]);
                j = code(j + 2, true);
                start = j;
                continue;
            }
            j++;
        }
        return n;
    }

    function code(j, inTemplate) {    // laeuft bis zum Ende bzw. zur schliessenden }
        let tiefe = 1;
        const klammerBasis = klammern.length;
        while (j < n) {
            const c = src[j];
            if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); j = e < 0 ? n : e; continue; }
            if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
            if (c === '\'' || c === '"') {
                let k = j + 1;
                while (k < n && src[k] !== c && src[k] !== '\n') { if (src[k] === '\\') k++; k++; }
                aus.push([j + 1, k, imProtokoll()]);
                j = k + 1;
                continue;
            }
            if (c === '`') { j = template(j + 1); continue; }
            if (c === '/' && regexMoeglich(src, j)) {
                let k = j + 1, klasse = false;
                while (k < n && src[k] !== '\n') {
                    if (src[k] === '\\') { k += 2; continue; }
                    if (src[k] === '[') klasse = true;
                    else if (src[k] === ']') klasse = false;
                    else if (src[k] === '/' && !klasse) break;
                    k++;
                }
                j = k + 1;
                continue;
            }
            if (c === '(') klammern.push(nameVor(j));
            else if (c === ')' && klammern.length > klammerBasis) klammern.pop();
            if (inTemplate) {
                if (c === '{') tiefe++;
                else if (c === '}') { tiefe--; if (tiefe === 0) return j + 1; }
            }
            j++;
        }
        return n;
    }

    code(0, false);
    return aus.filter(([s, e]) => e > s);
}

/** Gegenprobe zum Tokenizer: ein '…'/"…"-Literal endet an seinem Anfuehrungszeichen, nie am Zeilenende. */
function literalEndenSauber(src) {
    return literale(src)
        .filter(([s]) => src[s - 1] === '\'' || src[s - 1] === '"')
        .filter(([s, e]) => src[e] !== src[s - 1])
        .map(([s]) => zeileVon(src, s));
}

function zeileVon(src, pos) {
    let z = 1;
    for (let i = 0; i < pos; i++) if (src[i] === '\n') z++;
    return z;
}

/* ── Quellen ──────────────────────────────────────────────────────────── */

function deWoerterbuch(i18n) {
    const a = i18n.indexOf('\n  de: {');
    const e = i18n.indexOf('\n  }\n};', a);
    assert.ok(a > 0 && e > a, 'den de-Block in js/i18n.js nicht gefunden');
    return { text: i18n.slice(a, e), versatz: a };
}

function tutorialText(html) {
    return html.replace(/<!--[\s\S]*?-->/g, '');
}

function treffer(regeln, quellen) {
    const funde = [];
    for (const q of quellen) {
        for (const r of regeln) {
            if (r.wo === 'de' && q.bereich !== 'de') continue;
            for (const [s, e, prot] of q.literale) {
                // HTML-Kommentare in einem Template (<!-- … -->) sieht kein Nutzer.
                const t = q.src.slice(s, e).replace(/<!--[\s\S]*?-->/g, '');
                if (q.bereich === 'alle' && (t.startsWith('[') || prot)) continue;
                r.regex.lastIndex = 0;
                const m = r.regex.exec(t);
                if (m) funde.push(`${q.datei}:${zeileVon(q.src, s)}  „${m[0]}" → ${r.ersatz}  (${t.slice(0, 70).replace(/\n/g, ' ')})`);
            }
        }
    }
    return funde;
}

/* ── Die Pruefung ─────────────────────────────────────────────────────── */

describe('UI-138 — das Wording-Lexikon haelt die Oberflaeche', () => {
    const MD = lies('docs/wording-lexikon.md');
    const REGELN = sperrliste(MD);

    it('die Sperrliste ist da und jede Zeile ist ein gueltiger Regex', () => {
        assert.ok(REGELN.length >= 30, 'nur ' + REGELN.length + ' Regeln');
        for (const r of REGELN) assert.ok(r.regex instanceof RegExp, r.muster);
    });

    it('das deutsche Woerterbuch und das Tutorial kennen keine gesperrte Schreibweise', () => {
        const i18n = lies('js/i18n.js');
        const de = deWoerterbuch(i18n);
        const tut = tutorialText(lies('tutorial/tutorial.de.html'));
        const funde = treffer(REGELN, [
            { datei: 'js/i18n.js (de)', src: i18n, bereich: 'de',
              literale: literale(de.text).map(([s, e]) => [s + de.versatz, e + de.versatz]) },
            { datei: 'tutorial/tutorial.de.html', src: tut, bereich: 'de', literale: [[0, tut.length]] },
        ]);
        assert.deepEqual(funde, [], 'gesperrte Schreibweisen:\n' + funde.join('\n'));
    });

    it('kein sichtbares String-Literal unter js/ traegt eine gesperrte Schreibweise (Bereich „alle")', () => {
        // Champions, Pocket und Side Quest sind Nebenbereiche (CLAUDE.md 29.09.2026:
        // der Kern haengt nicht an ihnen) und haben eigene Begriffe (Champions-„Feld").
        const NEBENBEREICH = /^(app-side-quest|champions-|ds-pocket|pocket-)/;
        const dateien = fs.readdirSync(path.join(ROOT, 'js'))
            .filter(f => f.endsWith('.js') && f !== 'i18n.js' && !NEBENBEREICH.test(f));
        const quellen = dateien.map(f => {
            const src = lies('js/' + f);
            return { datei: 'js/' + f, src, bereich: 'alle', literale: literale(src) };
        });
        const funde = treffer(REGELN.filter(r => r.wo === 'alle'), quellen);
        assert.deepEqual(funde, [], 'gesperrte Schreibweisen:\n' + funde.join('\n'));
    });

    /* ── Verfaelschungsproben: beisst die Pruefung ueberhaupt? ─────────── */

    it('Probe: ein Literal mit „Piloten" faellt auf, ein Kommentar damit nicht', () => {
        const src = [
            '// hiess bis 13.10. „Piloten" — Kommentar, kein Fehler',
            '/* auch Siege und Unentschieden im Blockkommentar sind erlaubt */',
            "const a = 'von 32 Piloten';",
            'const b = `${x} Antritte · Paarung`;',
            "console.log('[Meta] 3 Siege'); devLog('Niederlage');",
            "const c = '[MetaCall] Prognose fehlt';",
            "const d = s.replace(/Siege/g, 'Wins');",
            // Pfeilfunktion mit Regex, der ein Anfuehrungszeichen traegt (app-deck-builder.js:7401)
            "const e = liste.some(e => /^hero'?s cape$/i.test(e.name || ''));",
            // mehrzeiliger console-Aufruf ueber 240 Zeichen, mit ; im Argument: bleibt Protokoll
            "console.warn('a;' +",
            "  '" + 'x'.repeat(260) + "' +",
            "  `Prognose ${y}`);",
            // ein Kommentar mit console.log( macht die naechste Zeile NICHT zum Protokoll
            "// console.log(",
            "el.textContent = 'Niederlage';",
        ].join('\n');
        const funde = treffer(REGELN.filter(r => r.wo === 'alle'),
            [{ datei: 'probe.js', src, bereich: 'alle', literale: literale(src) }]);
        const woerter = funde.map(f => f.match(/„([^"]+)"/)[1]).sort();
        assert.deepEqual(woerter, ['Antritte', 'Niederlage', 'Paarung', 'Piloten'],
            'erwartet genau die vier Literal-Treffer, gefunden: ' + funde.join(' | '));
        assert.deepEqual(literalEndenSauber(src), [], 'ein Literal endete am Zeilenende statt am Anfuehrungszeichen');
    });

    it('Gegenprobe am echten Code: kein Literal unter js/ endet am Zeilenende statt an seinem Anfuehrungszeichen', () => {
        const schief = [];
        for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
            const zeilen = literalEndenSauber(lies('js/' + f));
            if (zeilen.length) schief.push(f + ':' + zeilen.slice(0, 5).join(','));
        }
        assert.deepEqual(schief, [], 'der Tokenizer ist aus dem Takt (Regex/Division/Template): ' + schief.join(' | '));
    });

    it('Probe: der Tokenizer uebersteht Regex mit Anfuehrungszeichen und verschachtelte Templates', () => {
        const src = 'const a = `x ${name.replace(/"/g, \'&quot;\')} y ${b ? `in ${c}` : "out"}`;\n// Piloten\nconst z = "Piloten";';
        const lits = literale(src).map(([s, e]) => src.slice(s, e));
        assert.ok(lits.includes('&quot;'), 'das Literal im Template-Ausdruck fehlt: ' + JSON.stringify(lits));
        assert.ok(lits.includes('Piloten'), 'das letzte Literal fehlt: ' + JSON.stringify(lits));
        assert.ok(!lits.some(l => l.includes('// Piloten')), 'ein Kommentar wurde als Literal gelesen');
    });

    it('Probe: die Sperrliste kennt die Entscheidungen vom 13.10.2026', () => {
        const probe = (wort) => REGELN.some(r => { r.regex.lastIndex = 0; return r.regex.test(wort); });
        for (const w of ['Piloten', 'Antritten', 'Präsenzturnier', 'Lokaler Cup', 'Day-2-Quote',
                         'Top-8-Quote', 'Paarung', 'Siege', 'Niederlagen', 'Unentschieden',
                         'Siegquote', 'Prognose', 'Vorhersage', 'Testgruppen', 'Konter', 'Decklist',
                         'Alle Drucke', 'S/(S+N)', 'Online Top 8-Quote', 'Partien', 'Siegen', 'Papier',
                         'Präsenz', 'Day-2-Rate', 'Winrate', 'anderer Druck']) {
            assert.ok(probe(w), 'die Sperrliste faengt „' + w + '" nicht');
        }
        for (const w of ['Proxy-Druck', 'Druckliste', 'zum Drucken', 'ohneUnentschieden', 'Sieger',
                         'Prognosedatei', 'Eingabefeld', 'Variante', 'Anteil', 'Grundgesamtheit']) {
            assert.ok(!probe(w), 'die Sperrliste faengt faelschlich „' + w + '"');
        }
    });

    it('das Lexikon nennt die Entscheidung je Frage, nicht nur die Liste', () => {
        for (const s of ['Share', 'Liste / Listen', 'vor Ort', 'League Cup', 'Day-2-Conversion',
                         'Top-8-Conversion', 'Matchup', 'Win / Loss / Tie', 'WR\\*', 'Print',
                         'Prediction', 'Testing Groups']) {
            assert.ok(MD.includes(s), 'im Lexikon fehlt: ' + s);
        }
    });
});
