/* UI-156: Kartendatenbank-Filter "Stage" und "Regulation Mark".
   Verhalten wird AUSGEFUEHRT (Funktionen aus der Datei geschnitten), nicht als Text geprueft;
   nur der Einbau in die Filterkette ist Text, mit herausgeschnittenen Kommentaren. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const root = require('path').join(__dirname, '..', '..');
const quelle = fs.readFileSync(root + '/js/app-cards-db.js', 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function schneide(src, name) {
    const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
    assert.ok(m, 'Funktion fehlt: ' + name);
    let tiefe = 0;
    for (let i = src.indexOf('{', m.index); i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}' && --tiefe === 0) return src.slice(m.index, i + 1);
    }
    throw new Error('Klammer offen: ' + name);
}
const code = ['cardStageOf', 'regMarkOfCard', 'regMarkIndexKontext'].map(n => schneide(quelle, n)).join('\n');
const sb = vm.createContext({});
vm.runInContext(code + '\nthis.cardStageOf=cardStageOf;this.regMarkOfCard=regMarkOfCard;this.regMarkIndexKontext=regMarkIndexKontext;', sb);

// Stage
const stufe = (type) => sb.cardStageOf({ type });
assert.strictEqual(stufe('Basic'), 'basic');
assert.strictEqual(stufe('Stage 1'), 'stage1');
assert.strictEqual(stufe('Stage 2'), 'stage2');
assert.strictEqual(stufe('DBasic'), 'basic');
assert.strictEqual(stufe('MStage 2'), 'stage2');
['Supporter', 'Item', 'Basic Energy', 'VMAX', 'Mega Evolution', 'Stage 3', '', undefined].forEach(tp =>
    assert.strictEqual(stufe(tp), null, 'keine Stufe: ' + tp));
assert.strictEqual(sb.cardStageOf(null), null);

// Regulation Mark: Verbindung nur ueber (Set, Nummer)
const daten = { marks: { G: { AAA: '1-10' }, H: { BBB: '5,7' } } };
const lib = {
    kontext: (d, set) => (set === 'AAA' ? { index: { AAA: { '3': 'G' }, BBB: { '5': 'H' } } } : null),
    druckMarke: (k, id) => { const [s, ...r] = id.split('-'); return (k.index[s] && k.index[s][r.join('-')]) || null; }
};
const k = sb.regMarkIndexKontext(daten, lib);
assert.ok(k, 'Kontext muss gefunden werden, auch wenn das erste Set keinen liefert');
assert.strictEqual(sb.regMarkOfCard({ set: 'aaa', number: '3', name: 'x' }, k, lib.druckMarke), 'G');
assert.strictEqual(sb.regMarkOfCard({ set: 'BBB', number: '5', name: 'x' }, k, lib.druckMarke), 'H');
assert.strictEqual(sb.regMarkOfCard({ set: 'BBB', number: '99' }, k, lib.druckMarke), null);
assert.strictEqual(sb.regMarkOfCard({ set: 'BBB', number: '5' }, null, lib.druckMarke), null);
assert.strictEqual(sb.regMarkIndexKontext(null, lib), null);

// Einbau in die Filterkette
const t = ohneKommentare(quelle);
assert.ok(t.length > quelle.length * 0.3, 'Ausschneiden hat zu viel entfernt');
assert.match(t, /selectedStages\.includes\(stufe\)/);
assert.match(t, /selectedRegMarks\.includes\(marke\)/);
assert.match(t, /selectedStages,\s*selectedRegMarks,/, 'beide gehoeren in die Signatur');
assert.match(t, /populateStageFilter\(\);\s*populateRegMarkFilter\(\)/);
const html = fs.readFileSync(root + '/index.html', 'utf8');
assert.match(html, /id="filter-stage"/); assert.match(html, /id="filter-reg-mark"/);
const i18n = fs.readFileSync(root + '/js/i18n.js', 'utf8');
['cdb.filterStage', 'cdb.filterRegMark', 'cdb.stageBasic'].forEach(key =>
    assert.strictEqual((i18n.match(new RegExp("'" + key + "'", 'g')) || []).length, 2, key + ' in DE und EN'));
console.log('ok test-ui156-stage-regmark');
