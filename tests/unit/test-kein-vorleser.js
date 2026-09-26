/**
 * FE-2 (26.09.2026): der Vorleser ist entfernt.
 *
 * Entscheidung Hausi: die Qualitaet der KI-Stimmen taugt nicht. Der
 * Vorleser (PR #816, #818) stand nur in der Masterclass — Knopf, Leiste,
 * Tempo, Sprachausgabe ueber die Web Speech API. Die Kartentexte hatten
 * keinen eigenen; was dort „Vorlesehilfe" heisst, sind aria-label und
 * lang-Attribute fuer Bildschirmleser, und die bleiben.
 *
 * Geprueft wird der AUFRUF der Sprachausgabe, nicht ein Wort: ein
 * Kommentar ueber Bildschirmleser darf stehen bleiben.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

function dateien(dir, endung) {
    return fs.readdirSync(path.join(ROOT, dir))
        .filter((n) => n.endsWith(endung))
        .map((n) => path.join(dir, n));
}

describe('FE-2: kein Vorleser mehr', () => {
    it('kein Skript ruft die Sprachausgabe auf', () => {
        const treffer = [];
        let vorher = 0, nachher = 0;
        for (const f of dateien('js', '.js')) {
            const roh = fs.readFileSync(path.join(ROOT, f), 'utf8');
            const s = ohneKommentare(roh);
            vorher += roh.length; nachher += s.length;
            if (/speechSynthesis|SpeechSynthesisUtterance/.test(s)) treffer.push(f);
        }
        assert.ok(nachher > vorher * 0.3, 'das Ausschneiden hat zu viel entfernt');
        assert.deepEqual(treffer, [], 'Sprachausgabe noch aufgerufen in: ' + treffer.join(', '));
    });

    it('die Masterclass baut keine Vorleseleiste und hat keine Regeln dafuer', () => {
        const js = ohneKommentare(fs.readFileSync(path.join(ROOT, 'js', 'ds-masterclass.js'), 'utf8'));
        const css = fs.readFileSync(path.join(ROOT, 'css', 'masterclass.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(js, /data-mcl-vl|mcl-vorleser|mclVorleseTempo/);
        assert.doesNotMatch(css, /\.mcl-vorleser|\.mcl-vl-/);
    });

    it('die Messung sieht ueberhaupt Skripte', () => {
        assert.ok(dateien('js', '.js').length > 50);
    });
});
