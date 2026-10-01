'use strict';
/*
 * UI-55 (01.10.2026): In der Archetyp-Auswahl bekommen Zeilen mit eigener
 * Archetyp-Box einen Haken (data-box). Die Funktion wird aus
 * js/app-past-meta.js geschnitten und mit einer Attrappe der Auswahl und der
 * Box-Bibliothek AUSGEFUEHRT. Verbunden wird ueber den Auswahlwert, nicht
 * ueber den Text.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PM = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-past-meta.js'), 'utf8');
const ABX = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'archetyp-box.js'), 'utf8');

function schneide(quelle, name) {
    const m = new RegExp('\\n {8}function ' + name + '\\(').exec(quelle);
    assert.ok(m, name + ' fehlt');
    const ende = quelle.indexOf('\n        }\n', m.index + 1);
    return quelle.slice(m.index, ende + 10);
}
function setzen(quelle) {
    // eslint-disable-next-line no-new-func
    return new Function('window', schneide(quelle, '_pmBoxMarkenSetzen') + '\nreturn _pmBoxMarkenSetzen;');
}
const opt = (value, famWert) => ({ value, dataset: famWert ? { famWert } : {} });
const auswahl = () => ({ options: [opt(''), opt('__familie__|Banette'), opt('Banette Dusknoir', '__familie__|Banette'),
    opt('Banette Gardevoir', '__familie__|Banette'), opt('Dragapult'), opt('Decklist')] });
const lib = (...werte) => ({ hatBox: (w) => werte.indexOf(w) >= 0 });

describe('UI-55 Haken in der Archetyp-Auswahl', () => {
    it('eigene Box markiert genau ihre Zeile', () => {
        const sel = auswahl();
        const n = setzen(PM)({ ArchetypBox: lib('Dragapult') })(sel);
        assert.strictEqual(n, 1);
        assert.deepStrictEqual(sel.options.map((o) => o.dataset.box || ''), ['', '', '', '', 'eigen', '']);
    });

    it('eine Familienbox markiert die Familie selbst und ihre Varianten', () => {
        const sel = auswahl();
        setzen(PM)({ ArchetypBox: lib('__familie__|Banette') })(sel);
        assert.deepStrictEqual(sel.options.map((o) => o.dataset.box || ''), ['', 'eigen', 'familie', 'familie', '', '']);
    });

    it('eigene Variantenbox schlaegt die Familienmarke', () => {
        const sel = auswahl();
        setzen(PM)({ ArchetypBox: lib('__familie__|Banette', 'Banette Dusknoir') })(sel);
        assert.strictEqual(sel.options[2].dataset.box, 'eigen');
        assert.strictEqual(sel.options[3].dataset.box, 'familie');
    });

    it('ohne Boxen bzw. ohne Bibliothek keine Haken, alte Marken verschwinden', () => {
        const sel = auswahl();
        sel.options[4].dataset.box = 'eigen';
        setzen(PM)({ ArchetypBox: lib() })(sel);
        assert.strictEqual(sel.options[4].dataset.box, undefined);
        setzen(PM)({})(sel);
        assert.ok(sel.options.every((o) => !o.dataset.box));
    });

    it('hatBox in der Bibliothek: nur mit Anmeldung und geladenen Boxen', () => {
        const kopf = ABX.match(/function hatBox\(wert\) \{[\s\S]*?\n    \}\n/);
        assert.ok(kopf, 'hatBox fehlt in archetyp-box.js');
        // eslint-disable-next-line no-new-func
        const bauen = (geladenFuer, nutzer, boxen) => new Function('geladenFuer', 'nutzer', 'boxen', kopf[0] + '\nreturn hatBox;')(geladenFuer, nutzer, boxen);
        const boxen = [{ archetyp: 'Dragapult' }];
        assert.strictEqual(bauen('u1', () => ({}), boxen)('Dragapult'), true);
        assert.strictEqual(bauen('u1', () => ({}), boxen)('Banette'), false);
        assert.strictEqual(bauen(null, () => ({}), boxen)('Dragapult'), false);
        assert.strictEqual(bauen('u1', () => null, boxen)('Dragapult'), false);
    });

    it('VERFAELSCHUNG: ohne die Pruefung auf famWert keine Familienmarke', () => {
        const kaputt = PM.replace("else if (opt.dataset.famWert && lib.hatBox(opt.dataset.famWert))", "else if (false)");
        assert.notStrictEqual(kaputt, PM, 'die Mutation hat nichts geaendert');
        const sel = auswahl();
        setzen(kaputt)({ ArchetypBox: lib('__familie__|Banette') })(sel);
        assert.strictEqual(sel.options[2].dataset.box, undefined);
    });
});
