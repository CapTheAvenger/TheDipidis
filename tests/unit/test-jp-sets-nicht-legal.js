/**
 * Japanische Sets sind nie international legal.
 *
 * BEFUND (23.08.2026, vom Betreiber aufgedeckt): M4, M5, M6 sind
 * JAPANISCHE Setcodes. Die Karten daraus erscheinen international unter
 * einem anderen Setnamen — M4 als Chaos Rising (CRI), M5 als Pitch Black
 * (PBL). Nachgemessen an den Kartenlisten: 95 % bzw. 94 %
 * Namensueberdeckung. Es sind dieselben Karten, nur anders etikettiert.
 *
 * data/sets.json fuehrt sie mitten im internationalen Bereich:
 *     POR 151 · M4 152 · M5 153 · CRI 154 · PBL 155 · M6 156
 *
 * getFormatLegalSetCodes() baute die Legalitaetsmenge ueber einen reinen
 * Rangbereich und zog M4 und M5 damit als "legal" herein. In den
 * ausgelieferten Chunks stehen 83 M4-, 81 M5- und 76 M6-Karten; sie
 * erschienen im Standardformat der Kartendatenbank — doppelt, denn
 * dieselben Karten stehen unter CRI und PBL schon drin.
 *
 * M6 fiel bisher nur zufaellig heraus, weil PBL gerade das neueste
 * internationale Set ist. Beim naechsten internationalen Set waere es
 * mitgerutscht. Deshalb keine Sperrliste, sondern eine Regel:
 *
 *     Ein Set, dessen Karten AUSNAHMSLOS jp_only tragen, ist japanisch.
 *
 * Gemessen an den Kartendaten trennt diese Regel sauber: genau M4, M5 und
 * M6 sind zu 100 % jp_only, waehrend die beidseitigen Promo-Sets gemischt
 * sind (SMP 31 %, SVP 22 %, SP 11 %, HSP 22 %) und legal bleiben.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');

/** Nur die beiden Funktionen aus der Datei holen, ohne den Rest auszufuehren. */
function lade(fenster) {
    const anfang = QUELLE.indexOf('let _jpOnlySetCache = null;');
    const ende = QUELLE.indexOf('function filterAndRenderCards');
    assert.ok(anfang > 0 && ende > anfang, 'Fundstellen im Quelltext verschoben');
    const kontext = { window: fenster, console };
    kontext.globalThis = kontext;
    vm.createContext(kontext);
    vm.runInContext(QUELLE.slice(anfang, ende), kontext);
    return kontext;
}

const SET_ORDER = {
    TEF: 136, TWM: 137, SFA: 138, SCR: 139, SSP: 140, PRE: 141, JTG: 142,
    DRI: 143, WHT: 144, BLK: 145, MEP: 146, MEE: 147, MEG: 148, PFL: 149,
    ASC: 150, POR: 151, M4: 152, M5: 153, CRI: 154, PBL: 155, M6: 156,
    SVP: 100, SVE: 101,
};

function karten() {
    const out = [];
    const rein = (code, n, jp) => {
        for (let i = 0; i < n; i++) out.push({ set: code, name: `${code}-${i}`, jp_only: jp });
    };
    rein('TEF', 5, false); rein('POR', 5, false); rein('CRI', 5, false); rein('PBL', 5, false);
    rein('M4', 4, true); rein('M5', 4, true); rein('M6', 4, true);   // rein japanisch
    rein('SVP', 3, false); rein('SVP', 1, true);                     // gemischtes Promo-Set
    return out;
}

describe('japanische Sets gelten nicht als international legal', () => {
    it('erkennt genau die rein japanischen Sets', () => {
        const f = { setOrderMap: SET_ORDER, allCardsData: karten() };
        const k = lade(f);
        const jp = k.getJapaneseOnlySetCodes();
        assert.deepEqual([...jp].sort(), ['M4', 'M5', 'M6'],
            'nur Sets, deren Karten AUSNAHMSLOS jp_only sind, duerfen gesperrt werden');
    });

    it('M4 und M5 fallen aus dem Format TEF-PBL heraus', () => {
        const f = { setOrderMap: SET_ORDER, allCardsData: karten() };
        const k = lade(f);
        const legal = k.getFormatLegalSetCodes('TEF-PBL');
        assert.ok(!legal.has('M4'), 'M4 ist ein japanisches Set und nie international legal');
        assert.ok(!legal.has('M5'), 'M5 ist ein japanisches Set und nie international legal');
        assert.ok(!legal.has('M6'), 'M6 ebenfalls');
    });

    it('die internationalen Sets bleiben vollstaendig drin', () => {
        const f = { setOrderMap: SET_ORDER, allCardsData: karten() };
        const k = lade(f);
        const legal = k.getFormatLegalSetCodes('TEF-PBL');
        for (const code of ['TEF', 'POR', 'CRI', 'PBL', 'MEG', 'ASC']) {
            assert.ok(legal.has(code), `${code} muss legal bleiben`);
        }
    });

    it('gemischte Promo-Sets bleiben legal', () => {
        // SVP hat jp_only- UND internationale Karten. Es darf nicht in die
        // Sperre laufen, sonst verschwinden internationale Promos.
        const f = { setOrderMap: SET_ORDER, allCardsData: karten() };
        const k = lade(f);
        assert.ok(!k.getJapaneseOnlySetCodes().has('SVP'));
        assert.ok(k.getFormatLegalSetCodes('TEF-PBL').has('SVP'));
    });

    it('ohne geladene Kartendaten wird nichts gesperrt', () => {
        // Fail open: lieber das alte Verhalten als eine leere Kartenliste.
        const f = { setOrderMap: SET_ORDER, allCardsData: [] };
        const k = lade(f);
        assert.equal(k.getJapaneseOnlySetCodes().size, 0);
    });

    it('die Regel haelt auch beim naechsten internationalen Set', () => {
        // M6 (156) liegt heute nur zufaellig ueber PBL (155). Sobald
        // international ein Set mit hoeherem Rang erscheint, wuerde ein
        // reiner Rangfilter M6 hereinziehen — die jp_only-Regel nicht.
        const order = { ...SET_ORDER, NEU: 157 };
        const daten = karten();
        for (let i = 0; i < 5; i++) daten.push({ set: 'NEU', name: `NEU-${i}`, jp_only: false });
        const k = lade({ setOrderMap: order, allCardsData: daten });
        const legal = k.getFormatLegalSetCodes('TEF-NEU');
        assert.ok(legal.has('NEU'));
        assert.ok(!legal.has('M6'), 'M6 darf auch dann nicht legal werden');
    });
});
