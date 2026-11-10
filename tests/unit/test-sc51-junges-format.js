/* SC-51 (10.11.2026): die Duenne-Pruefungen setzen nur in den ersten
   28 Tagen nach Erscheinen des Sets aus — davor und danach greifen sie.
   Geprueft am Verhalten von jungesFormat() in einem Wegwerf-Ordner. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { jungesFormat, FRIST_TAGE } = require('./lib-junges-format.js');

function baum(fw) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sc51-'));
    fs.mkdirSync(path.join(d, 'data'));
    fs.writeFileSync(path.join(d, 'data', 'format_window.json'), JSON.stringify(fw));
    return d;
}
const FW = { current_set: 'DLR', oldest_legal_set: 'TEF', set_release_date: '2026-11-06' };
const tag = (s) => new Date(s + 'T12:00:00Z');

test('die Frist ist vier Wochen', () => {
    assert.strictEqual(FRIST_TAGE, 28);
});

test('am Erscheinungstag und am letzten Tag der Frist ist das Format jung', () => {
    const d = baum(FW);
    assert.strictEqual(jungesFormat(d, tag('2026-11-06')).jung, true);
    assert.strictEqual(jungesFormat(d, tag('2026-12-03')).jung, true);
});

test('ab Tag 28 greifen die Pruefungen wieder', () => {
    const d = baum(FW);
    const j = jungesFormat(d, tag('2026-12-04'));
    assert.strictEqual(j.jung, false);
    assert.strictEqual(jungesFormat(d, tag('2027-02-01')).jung, false);
});

test('vor dem Erscheinen oder ohne Datum setzt nichts aus', () => {
    assert.strictEqual(jungesFormat(baum(FW), tag('2026-11-05')).jung, false);
    assert.strictEqual(jungesFormat(baum({ current_set: 'DLR' }), tag('2026-11-07')).jung, false);
    assert.strictEqual(jungesFormat(baum({ ...FW, set_release_date: 'bald' }), tag('2026-11-07')).jung, false);
});

test('der Grund nennt Alter und Enddatum — das steht im Protokoll', () => {
    const j = jungesFormat(baum(FW), tag('2026-11-10'));
    assert.match(j.grund, /4 Tag\(e\) alt/);
    assert.match(j.grund, /bis 2026-12-04/);
    assert.match(j.grund, /SC-51/);
});

test('die vier Duenne-Pruefungen nutzen die Regel und nur sie', () => {
    const wurzel = path.join(__dirname, '..', '..');
    const dateien = ['test-anteile-und-konventionen-07-09.js', 'test-heatmap-major.js',
        'test-online-major-merge.js', 'test-post-hashtags-und-filter.js'];
    for (const f of dateien) {
        const q = fs.readFileSync(path.join(wurzel, 'tests', 'unit', f), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.match(q, /jungesFormat\(/, `${f} nutzt jungesFormat nicht`);
        // Aussetzen nur zusammen mit dem Duenne-Befund, nie pauschal.
        for (const m of q.matchAll(/if \(([^)]*?\)?[^)]*?)\) (?:\{\s*)?return t\.skip/g)) {
            assert.match(m[1], /jf\.jung/, `${f}: Aussetzen ohne Frist-Pruefung`);
            assert.match(m[1], /&&/, `${f}: Aussetzen ohne Duenne-Bedingung`);
        }
    }
});
