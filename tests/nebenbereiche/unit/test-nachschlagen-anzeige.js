/**
 * Nachschlagen-Reiter: zwei Anzeigefehler, beide am 09.09.2026 live
 * gefunden — nicht in den Tests, sondern beim Hinsehen auf der Seite.
 *
 * 1. „Genauigkeit true". Der Quelldatensatz schreibt `accuracy: true` fuer
 *    Attacken, die nicht danebengehen koennen — 119 der 900. Bis zu diesem
 *    Tag war keine davon in Champions, also gab die Zeile nie String(true)
 *    aus. Mit dem Attacken-Nachtrag kamen Finalformation und Invertigo
 *    dazu, und die Seite behauptete eine Genauigkeit von „true".
 *
 * 2. Englische Typnamen auf der deutschen Oberflaeche. „Donnerblitz ·
 *    Thunderbolt · Electric" — der Typ blieb englisch, waehrend Name und
 *    Beschreibung uebersetzt waren. Das betraf alle 500 Attacken und ist
 *    aelter als der Nachtrag; aufgefallen ist es erst bei dessen Abnahme.
 *
 * Geprueft wird an den ECHTEN Daten und ueber den echten Renderer, nicht
 * ueber eine Zeichenkettensuche im Quelltext: ein Grep haette „true" nicht
 * als Anzeigefehler erkannt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-resources.js'), 'utf8');
const RES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_resources.json'), 'utf8'));
const moves = RES.entries.filter(e => e.cat === 'move');

// Der Reiter wird nicht gestartet; die Datei laeuft in einer Sandbox und
// die Anzeige-Funktionen kommen ueber window._sqResInternals — derselbe
// Weg, den test-champions-matchups.js seit langem geht. Das ist der
// echte Code, keine Nachbildung.
function lade(lang) {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}) },
        getLang: () => lang,
        localStorage: { getItem: () => lang, setItem() {} },
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    sandbox.navigator = { language: lang };
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox);
    return sandbox._sqResInternals;
}

describe('Genauigkeit: true ist keine Zahl', () => {
    it('die Daten enthalten den Fall ueberhaupt', () => {
        const mitTrue = moves.filter(m => m.accuracy === true);
        assert.ok(mitTrue.length > 0,
            'Keine Attacke mit accuracy===true — dann prueft der Rest nichts. '
            + 'Faellt der Fall aus den Daten, darf diese Datei weg.');
        // Namentlich, damit der Befund nachvollziehbar bleibt.
        const namen = mitTrue.map(m => m.en).sort();
        assert.ok(namen.includes('No Retreat') && namen.includes('Topsy-Turvy'),
            'erwartet u.a. No Retreat und Topsy-Turvy, gefunden: ' + namen.join(', '));
    });

    it('wird auf Deutsch als Text gezeigt, nicht als "true"', () => {
        const api = lade('de');
        const m = moves.find(x => x.accuracy === true);
        const wert = api.genauigkeit(m, api.t());
        assert.notEqual(wert, 'true', 'die Seite zeigt weiterhin "true"');
        assert.equal(wert, 'trifft immer');
    });

    it('und auf Englisch ebenso', () => {
        const api = lade('en');
        const m = moves.find(x => x.accuracy === true);
        const wert = api.genauigkeit(m, api.t());
        assert.notEqual(wert, 'true');
        assert.equal(wert, 'never misses');
    });

    it('normale Genauigkeiten bleiben Zahlen, fehlende bleiben ein Strich', () => {
        const api = lade('de');
        const l = api.t();
        const hundert = moves.find(x => x.accuracy === 100);
        assert.ok(hundert, 'keine Attacke mit accuracy 100 gefunden');
        assert.equal(api.genauigkeit(hundert, l), '100');
        assert.equal(api.genauigkeit({}, l), '—');
        assert.equal(api.genauigkeit({ accuracy: null }, l), '—');
    });

    it('keine gerenderte Statzeile enthaelt das Wort true', () => {
        // Der eigentliche Beweis: ueber ALLE Attacken rendern und
        // nachsehen. Genau das haette den Fehler am 09.09. gefunden,
        // bevor er live ging.
        for (const lang of ['de', 'en']) {
            const api = lade(lang);
            const l = api.t();
            const treffer = moves
                .map(m => ({ en: m.en, html: api.moveStatsHtml(m, l) }))
                .filter(x => /<b>\s*(true|false|undefined|null|NaN)\s*<\/b>/.test(x.html));
            assert.deepEqual(treffer.map(x => x.en), [],
                `[${lang}] Statzeile mit rohem JS-Wert`);
        }
    });
});

describe('Typnamen auf der deutschen Oberflaeche', () => {
    it('alle 18 Typen haben eine deutsche Entsprechung', () => {
        const api = lade('de');
        const typen = [...new Set(moves.map(m => m.type).filter(Boolean))];
        assert.ok(typen.length >= 17, `nur ${typen.length} Typen in den Daten`);
        const englisch = typen.filter(t => api.typName(t) === t && t !== 'Normal');
        assert.deepEqual(englisch, [],
            'diese Typen bleiben auf Deutsch englisch: ' + englisch.join(', '));
    });

    it('uebersetzt die bekannten Faelle richtig', () => {
        const api = lade('de');
        for (const [en, de] of [['Electric', 'Elektro'], ['Steel', 'Stahl'],
            ['Ghost', 'Geist'], ['Dark', 'Unlicht'], ['Fairy', 'Fee'],
            ['Fighting', 'Kampf'], ['Poison', 'Gift']]) {
            assert.equal(api.typName(en), de, `${en} → ${de}`);
        }
    });

    it('laesst Englisch in Ruhe, wenn die Oberflaeche englisch ist', () => {
        const api = lade('en');
        assert.equal(api.typName('Electric'), 'Electric');
        assert.equal(api.typName('Steel'), 'Steel');
    });

    it('die Typfarbe haengt weiter am englischen Namen', () => {
        // Die CSS-Klasse ist sq-play-type-<englisch kleingeschrieben>.
        // Wer sie auf den deutschen Namen umstellt, nimmt jedem Badge
        // seine Farbe — und kein Test wuerde es merken.
        assert.match(SRC, /sq-play-type-\$\{escapeHtml\(type\.toLowerCase\(\)\)\}/,
            'die Typklasse wird nicht mehr aus dem englischen Namen gebaut');
    });
});
