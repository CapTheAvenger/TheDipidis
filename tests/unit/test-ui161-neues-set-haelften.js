/* UI-161 (Hausi, 10.11.2026): (1) Legendary-Stadien kommen immer als Paar — zeigt „Neues Set“ eine Haelfte,
   steht die andere daneben, erkannt an (Set, Nummer); (2) „Neues Set“ zeigt bis zu 30 Karten; (3) ein volles
   Herz heisst „steht auf der Wunschliste“. Die Funktionen werden AUSGEFUEHRT (vm), Kommentare vorher entfernt. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const roh = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-tier-meta.js'), 'utf8');
const rohU = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-utils.js'), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const SRC = ohneKommentare(roh), UT = ohneKommentare(rohU);
assert.ok(SRC.length > roh.length * 0.3 && UT.length > rohU.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
function schneide(q, kopf, bis) {
    const a = q.indexOf(kopf), b = q.indexOf(bis, a);
    assert.ok(a > -1 && b > a, 'Schnitt fehlgeschlagen: ' + kopf);
    return q.slice(a, b);
}
const FENSTER = { current_set: 'DLR', neuestes_set: 'DLR', neuestes_set_release_date: '2026-01-01' };
function lade(extra) {
    const kasten = Object.assign({ Number, String, Object, Array, Math, Date, localStorage: null,
        window: Object.assign({ _formatWindow: FENSTER }, (extra && extra.window) || {}) }, extra || {});
    vm.createContext(kasten);
    const nummern = /const LEGENDARY_STADIEN_NUMMERN = \{[^}]*\};/.exec(UT)[0].replace('const ', 'var ');
    vm.runInContext(nummern + '\n' + schneide(UT, 'function legendaryPartnerNummer', '\n        function legendaryHaelftenAufteilen')
        + '\n' + schneide(UT, 'function istLegendaryStadion', '\n        function legendaryFaktor'), kasten);
    vm.runInContext(schneide(SRC, 'const STAPLES_ART_SCHWELLE', 'function staplesAnzahl()')
        + '\nthis._waehle = staplesNachArt; this._max = STAPLES_NEUES_SET_MAX;', kasten);
    return kasten;
}
const kachel = (name, set, nr, n, typ) => ({ name, set_code: set, set_codes: [set], set_number: nr, type: typ || 'Item',
    deck_inclusion_count: n, global_share: n, image_url: `https://x/${set}/${set}_${String(nr).padStart(3, '0')}_R_EN_LG.png` });

describe('UI-161 Legendary-Stadien als Paar', () => {
    it('die andere Haelfte wird aus (Set, Nummer) gefunden, nicht aus dem Namen', () => {
        const R = lade();
        assert.equal(R.legendaryPartnerNummer('94', 'DLR'), '95');
        assert.equal(R.legendaryPartnerNummer('095', 'DLR'), '94');
        assert.equal(R.legendaryPartnerNummer('99', 'DLR'), '98');
        assert.equal(R.legendaryPartnerNummer('75', 'M6'), '76');
        assert.equal(R.legendaryPartnerNummer('93', 'DLR'), '');
        assert.equal(R.legendaryPartnerNummer('94', 'PBL'), '');
    });
    it('Neues Set zeigt beide Haelften nebeneinander, mit denselben Zahlen und dem Bild der zweiten Nummer', () => {
        const R = lade();
        const daten = [kachel('A', 'DLR', '1', 20), kachel('Legendary Pyroduct', 'DLR', '94', 11, 'Stadium'), kachel('B', 'DLR', '2', 5)];
        const t = R._waehle(daten, 'neuesSet');
        assert.equal(Array.from(t).map(c => c.name + ' ' + c.set_number).join(','), 'A 1,Legendary Pyroduct 94,Legendary Pyroduct 95,B 2');
        assert.equal(t[2].deck_inclusion_count, 11);
        assert.match(t[2].image_url, /DLR_095_/);
        assert.match(t[1].image_url, /DLR_094_/);
        assert.equal(t[2].haelfteZwei, true);
        assert.ok(!t[1].haelfteZwei);
    });
    it('steht die HOEHERE Haelfte in den Daten, kommt trotzdem die kleinere Nummer zuerst', () => {
        const R = lade();
        const t = R._waehle([kachel('Legendary Summit', 'DLR', '97', 6, 'Stadium')], 'neuesSet');
        assert.equal(Array.from(t).map(c => c.set_number).join(','), '96,97');
    });
    it('fuehren die Daten beide Nummern schon, entsteht keine doppelte Kachel', () => {
        const R = lade();
        const t = R._waehle([kachel('Legendary Summit', 'DLR', '96', 6, 'Stadium'), kachel('Legendary Summit', 'DLR', '97', 6, 'Stadium')], 'neuesSet');
        assert.equal(Array.from(t).map(c => c.set_number).join(','), '96,97');
    });
    it('das Limit zaehlt Kacheln: 30 Kacheln, auch mit Paar', () => {
        const R = lade();
        const daten = [kachel('Legendary Pyroduct', 'DLR', '94', 50, 'Stadium')];
        for (let i = 0; i < 40; i++) daten.push(kachel('K' + i, 'DLR', String(i + 1), 40 - i));
        const t = R._waehle(daten, 'neuesSet');
        assert.equal(R._max, 30);
        assert.equal(t.length, 30);
        assert.equal(Array.from(t).slice(0, 2).map(c => c.set_number).join(','), '94,95');
    });
    it('eine Karte ohne Legendary-Nummer bleibt allein', () => {
        const R = lade();
        const t = R._waehle([kachel('Gym', 'DLR', '93', 5, 'Stadium')], 'neuesSet');
        assert.equal(t.length, 1);
    });
});

describe('UI-161 Nummernliste gegen die Kartendatenbank', () => {
    it('DLR 94–99: sechs Stadien „Legendary …“, paarweise gleicher Name (Kopf nach Spaltennamen gelesen)', () => {
        const zeilen = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'all_cards_database.csv'), 'utf8').split(/\r?\n/);
        const kopf = zeilen[0].replace(/^\uFEFF/, '').split(',');
        const iN = kopf.indexOf('name_en'), iS = kopf.indexOf('set'), iZ = kopf.indexOf('number'), iT = kopf.indexOf('type');
        assert.ok(iN > -1 && iS > -1 && iZ > -1 && iT > -1);
        const liste = /DLR: \[([^\]]*)\]/.exec(UT)[1].match(/\d+/g);
        assert.ok(liste && liste.length);
        const namen = liste.map((nr) => {
            const r = zeilen.map((l) => l.split(',')).find((x) => x[iS] === 'DLR' && x[iZ] === nr);
            assert.ok(r, 'DLR ' + nr + ' fehlt');
            assert.match(r[iN], /^Legendary /);
            assert.match(r[iT], /Stadium/);
            return r[iN];
        });
        for (let k = 0; k < liste.length; k += 2) assert.equal(namen[k], namen[k + 1]);
    });
});

describe('UI-161 Herz', () => {
    const FN = schneide(SRC, 'function staplesAufWunschliste', 'function staplesMitHaelften');
    function knopf(id) {
        const k = { id, cls: new Set(), attr: {}, textContent: '♡',
            getAttribute(n) { return n === 'data-wunsch-id' ? id : this.attr[n]; },
            setAttribute(n, v) { this.attr[n] = v; },
            classList: { toggle: (c, an) => { an ? k.cls.add(c) : k.cls.delete(c); } } };
        return k;
    }
    function bau(liste, knoepfe) {
        const k = { window: { userWishlist: liste }, document: { querySelectorAll: () => knoepfe } };
        vm.createContext(k);
        vm.runInContext(FN + '\nthis._f = staplesHerzenAbgleichen; this._a = staplesAufWunschliste;', k);
        return k;
    }
    it('Karte auf der Wunschliste → volles Herz, sonst leeres', () => {
        const a = knopf('Talonflame ex|M6|62'), b = knopf('Aarune|DLR|50');
        const k = bau(new Set(['Aarune|DLR|50']), [a, b]);
        k._f();
        assert.equal(a.textContent, '♡'); assert.ok(!a.cls.has('ist-gewuenscht')); assert.equal(a.attr['aria-pressed'], 'false');
        assert.equal(b.textContent, '♥'); assert.ok(b.cls.has('ist-gewuenscht')); assert.equal(b.attr['aria-pressed'], 'true');
    });
    it('ohne Wunschliste (nicht angemeldet) bleiben alle leer, ohne Fehler', () => {
        const a = knopf('X|A|1');
        const k = bau(undefined, [a]);
        k._f();
        assert.equal(a.textContent, '♡');
    });
    it('das Widget zeichnet das Herz aus der Wunschliste, und updateWishlistUI gleicht ab', () => {
        assert.match(SRC, /\$\{aufWunschliste \? '♥' : '♡'\}/);
        assert.match(SRC, /const aufWunschliste = hatDruck && staplesAufWunschliste\(kartenId\)/);
        const fc = ohneKommentare(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'firebase-collection.js'), 'utf8'));
        assert.match(fc, /function updateWishlistUI\([^)]*\) \{\s*if \(typeof window\.staplesHerzenAbgleichen === 'function'\) window\.staplesHerzenAbgleichen\(\);/);
    });
});
