/**
 * Rutsch R6/R7 (03.10.2026, Tiefenanalyse UI/UX): Politur-Punkte, jeder
 * AUSGEFUEHRT, wo es eine Funktion gibt (Kommentare vorher entfernt).
 *   UI-87  Meta Binder: Leerzustand nennt den gespeicherten Binder
 *   UI-89  Journal: Format vorbelegt, TEF-PBL/TEF-CRI in der Liste
 *   UI-88  Profil-Builder: Set-Knoepfe mit Setnamen
 *   UI-93  Archetyp-Box: nach „Box anlegen" zur neuen Box
 *   FE-46  Testhand: 6 Preiskarten beiseite, Mulligan wird benannt
 *   FE-44  Meta Call: „Mein Deck" wird gemerkt
 *   FE-48  Meine Decks: Sammlungsknopf sieht anders aus als „+ Anzahl"
 *   UI-86  Heatmap-Legende: 45 steht in genau einer Stufe
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = path.join(__dirname, '..', '..');
const roh = (p) => fs.readFileSync(path.join(W, p), 'utf8');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const schnitt = (q, von, bis) => {
    const a = q.indexOf(von);
    const b = q.indexOf(bis, a + von.length);
    assert.ok(a > -1 && b > a, `nicht gefunden: ${von}`);
    return q.slice(a, b);
};

function knoten(attrs) {
    const k = Object.assign({ textContent: '', dataset: {}, parentNode: null, kinder: [] }, attrs || {});
    const klassen = new Set((k.klasse || '').split(' ').filter(Boolean));
    k.classList = { add: (c) => klassen.add(c), remove: (c) => klassen.delete(c), contains: (c) => klassen.has(c) };
    k.klassen = klassen;
    return k;
}

describe('UI-87: Meta Binder nennt den gespeicherten Binder', () => {
    const Q = ohne(roh('js/meta-binder.js'));
    const f = Function('getLang', 'mbText',
        schnitt(Q, 'function leerzustandSetzen(', 'async function metaBinderLeerzustand(') + '\nreturn leerzustandSetzen;')(
        () => 'de', (k, fb) => ({ 'mb.savedTitle': 'Gespeicherter Binder vorhanden', 'mb.savedText': '{n} Karten, gespeichert am {datum}.' })[k] || fb);
    function grid() {
        const eltern = { reihe: [], insertBefore(a, b) { this.reihe = this.reihe.filter((x) => x !== a); this.reihe.splice(this.reihe.indexOf(b), 0, a); } };
        const bauen = knoten({ klasse: 'btn btn-primary', parentNode: eltern });
        const laden = knoten({ klasse: 'btn btn-outline', parentNode: eltern });
        eltern.reihe = [bauen, laden];
        const titel = knoten(); const text = knoten();
        const leer = knoten({ querySelector: (s) => ({ '.deck-builder-empty-title': titel, '.deck-builder-empty-text': text,
            '[onclick^="loadSavedMetaBinder"]': laden, '[onclick^="buildMetaBinder"]': bauen })[s] || null });
        return { g: { querySelector: (s) => (s === '.deck-builder-empty-state' ? leer : null) }, titel, text, laden, bauen, eltern, leer };
    }
    it('mit gespeichertem Binder: Titel, Datum, Kartenzahl, Laden ist Hauptknopf und steht vorn', () => {
        const x = grid();
        assert.equal(f(x.g, { anzahl: 215, datum: '2026-09-30T10:00:00Z' }), true);
        assert.equal(x.titel.textContent, 'Gespeicherter Binder vorhanden');
        assert.equal(x.text.textContent, '215 Karten, gespeichert am 30.9.2026.');
        assert.ok(x.laden.klassen.has('btn-primary') && !x.laden.klassen.has('btn-outline'));
        assert.ok(x.bauen.klassen.has('btn-outline') && !x.bauen.klassen.has('btn-primary'));
        assert.equal(x.eltern.reihe[0], x.laden);
    });
    it('ohne gespeicherten Binder bleibt alles, wie es ist', () => {
        const x = grid();
        assert.equal(f(x.g, { anzahl: 0 }), false);
        assert.equal(x.titel.textContent, '');
    });
    it('der Profil-Unterreiter ruft es beim Oeffnen auf', () => {
        assert.match(ohne(roh('js/firebase-collection.js')),
            /tabName === 'metabinder' && typeof window\.metaBinderLeerzustand === 'function'\) \{\s*window\.metaBinderLeerzustand\(\);/);
    });
});

describe('UI-89: Journal', () => {
    const Q = ohne(roh('js/battle-journal.js'));
    const vorbelegen = (live, liste, wert) => {
        const w = { getCurrentMetaFormat: () => live, KNOWN_META_FORMAT_CODES: liste };
        const sel = { value: wert || '', options: liste.map((v) => ({ value: v })) };
        Function('window', schnitt(Q, 'function formatVorbelegen(', 'window._journalFormatVorbelegen') + '\nreturn formatVorbelegen;')(w)(sel);
        return sel.value;
    };
    it('leeres Format wird mit dem laufenden vorbelegt', () => {
        assert.equal(vorbelegen('TEF-30C', ['TEF-30C', 'TEF-PBL']), 'TEF-30C');
    });
    it('eine Wahl bleibt; ein unbekanntes Format wird nicht gesetzt', () => {
        assert.equal(vorbelegen('TEF-30C', ['TEF-30C', 'TEF-PBL'], 'TEF-PBL'), 'TEF-PBL');
        assert.equal(vorbelegen('XYZ', ['TEF-30C']), '');
    });
    it('das Eintragen-Fenster ruft es nach dem Leeren auf', () => {
        assert.match(Q, /resetBattleJournalForm\(\);\s*formatVorbelegen\(document\.getElementById\('battleJournalMeta'\)\);/);
    });
    it('TEF-PBL und TEF-CRI stehen in der Formatliste, nach Datum geordnet', () => {
        const m = roh('js/app-core.js').match(/const KNOWN_META_FORMAT_CODES = \[([\s\S]*?)\];/);
        const liste = m[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));
        assert.deepEqual(liste.slice(0, 3), ['TEF-PBL', 'TEF-CRI', 'TEF-POR']);
    });
    it('der Leerzustand der Warteschlange behauptet kein „erstes Match"', () => {
        const de = roh('js/i18n.js').match(/'bj\.emptyStateDesc':\s*'([^']*)'/g);
        assert.ok(de.every((z) => !/erstes Match|first match/.test(z)), de.join(' | '));
    });
});

describe('UI-88: Set-Knoepfe tragen den Setnamen', () => {
    const SRC = roh('js/app-profile-deck-builder.js');
    const f = Function(schnitt(ohne(SRC), 'function setNamenAusCsv(', 'function _setNamenLaden(') + '\nreturn setNamenAusCsv;')();
    it('liest set_code,set_name', () => {
        assert.deepEqual(f('\uFEFFset_code,set_name\nCRI,Chaos Rising\npor,Perfect Order\n\n'), { CRI: 'Chaos Rising', POR: 'Perfect Order' });
    });
    it('der Knopf bekommt den Namen als Titel', () => {
        assert.match(SRC, /data-set-code="\$\{escapeHtml\(s\)\}"\$\{_setNamen && _setNamen\[s\] \? ` title="\$\{escapeHtml\(_setNamen\[s\]\)\}"` : ''\}/);
    });
    it('die Zuordnungsdatei hat die Spalten, die gelesen werden', () => {
        assert.equal(roh('data/pokemon_sets_mapping.csv').split(/\r?\n/)[0].replace(/^\uFEFF/, ''), 'set_code,set_name');
    });
});

describe('UI-93: nach „Box anlegen" zur neuen Box', () => {
    const Q = ohne(roh('js/archetyp-box.js'));
    it('klappt das Listenfeld auf, scrollt hin und setzt den Fokus', () => {
        const d = { open: false };
        const ruf = [];
        const liste = { closest: () => d, scrollIntoView: (o) => ruf.push(['scroll', o.block]), focus: () => ruf.push(['fokus']) };
        const f = Function('el', 'setTimeout', schnitt(Q, 'function zurNeuenBox(', 'async function listeEinfuegen(') + '\nreturn zurNeuenBox;')(
            (id) => (id === 'abxListe' ? liste : null), (fn) => fn());
        assert.equal(f(), true);
        assert.equal(d.open, true);
        assert.deepEqual(ruf, [['scroll', 'center'], ['fokus']]);
    });
    it('eigeneAnlegen ruft es nach dem Zeichnen auf', () => {
        assert.match(Q, /zeichnen\(\);\s*zurNeuenBox\(\);/);
    });
});

describe('FE-46: Testhand wie am Tisch', () => {
    function sim() {
        const els = {};
        const grid = { innerHTML: '', appendChild() {}, parentNode: { insertBefore(n) { els.simulatorMulligan = n; } }, nextSibling: null };
        els.simulatorHandGrid = grid;
        els.simulatorDeckCount = { innerText: '' };
        const ctx = {
            console, Math,
            document: { getElementById: (id) => els[id] || null, createElement: () => ({ textContent: '', style: {} }) },
            t: (k) => ({ 'draw.mulliganHinweis': 'MULLIGAN', 'draw.preisHinweis': 'PREIS' })[k] || k,
            showToast() {},
        };
        ctx.window = ctx;
        vm.createContext(ctx);
        vm.runInContext(roh('js/draw-simulator.js'), ctx);
        return { ctx, els };
    }
    it('60 Karten: 7 auf der Hand, 6 Preiskarten, 47 im Deck; gezogen wird Karte 14', () => {
        const s = sim();
        vm.runInContext(`_simulatorDeck = Array.from({ length: 60 }, (_, i) => ({ name: 'K' + i, basis: true }));
            _shuffleFisherYates = () => {}; drawNewHand();`, s.ctx);
        assert.equal(s.els.simulatorDeckCount.innerText, 47);
        vm.runInContext('drawExtraCard();', s.ctx);
        assert.equal(vm.runInContext('_simulatorHand[7].name', s.ctx), 'K13');
        assert.equal(s.els.simulatorDeckCount.innerText, 46);
        assert.equal(s.els.simulatorMulligan.textContent, 'PREIS');
    });
    it('Hand ohne Basis-Pokemon wird als Mulligan benannt; unbekannt bleibt unbenannt', () => {
        const s = sim();
        assert.equal(s.ctx._simMulliganLage(Array(7).fill({ basis: false })), 'mulligan');
        assert.equal(s.ctx._simMulliganLage([{ basis: true }].concat(Array(6).fill({ basis: false }))), 'ok');
        assert.equal(s.ctx._simMulliganLage(Array(7).fill({ basis: null })), null);
        vm.runInContext(`_simulatorDeck = Array.from({ length: 60 }, (_, i) => ({ name: 'K' + i, basis: false }));
            _shuffleFisherYates = () => {}; drawNewHand();`, s.ctx);
        assert.equal(s.els.simulatorMulligan.textContent, 'MULLIGAN PREIS');
    });
});

describe('FE-44: Meta Call merkt „Mein Deck"', () => {
    const Q = ohne(roh('js/app-meta-call.js'));
    it('gemerkt wird beim Waehlen, geholt beim Start, vergessen wenn das Deck fehlt', () => {
        const speicher = {};
        const ls = { setItem: (k, v) => { speicher[k] = v; }, removeItem: (k) => { delete speicher[k]; }, getItem: (k) => speicher[k] || null };
        const merken = Function('localStorage', schnitt(Q, "const MEIN_DECK_KEY = 'metacall_mydeck_v1';", 'try {\n    const gemerkt')
            + '\nreturn { merken: _meinDeckMerken, KEY: MEIN_DECK_KEY };')(ls);
        merken.merken('Dragapult');
        assert.equal(speicher[merken.KEY], 'Dragapult');
        merken.merken('');
        assert.equal(speicher[merken.KEY], undefined);
        // FE-59 (05.10.2026): „Gegen das Meta“ waehlt als Vorschau und merkt nicht.
        assert.match(Q, /function _onMyDeck\(val, opts\) \{\s*_settings\.myDeck = val;\s*if \(!\(opts && opts\.vorschau\)\) _meinDeckMerken\(val\);/);
        assert.match(Q, /const gemerkt = localStorage\.getItem\(MEIN_DECK_KEY\);\s*if \(gemerkt\) _settings\.myDeck = gemerkt;/);
        assert.match(Q, /_bekannteDeckNamen\(\)\.indexOf\(_settings\.myDeck\) === -1\) \{\s*_settings\.myDeck = '';\s*_meinDeckMerken\(''\);/);
    });
});

describe('FE-48 und UI-86', () => {
    it('der Sammlungsknopf traegt das Kistensymbol, der Deckknopf nicht', () => {
        const Q = ohne(roh('js/firebase-collection.js'));
        assert.match(Q, /const collLabel\s*= ownedCount > 0 \? `\\u\{1F4E6\} \$\{ownedCount\}\/4` : '\\u\{1F4E6\}\+';/);
    });
    it('die Heatmap-Legende ordnet 45 genau einer Stufe zu, wie die Zelle', () => {
        const Q = roh('js/app-current-meta.js');
        assert.match(Q, /\$\{t\('heatmap\.even'\)\} \(45,1–54,9 %\)/);
        assert.match(Q, /\$\{t\('heatmap\.unfavorable'\)\} \(≤ 45 %\)/);
        assert.match(Q, /\} else if \(winRate <= 45\.0\) \{/);
    });
});
