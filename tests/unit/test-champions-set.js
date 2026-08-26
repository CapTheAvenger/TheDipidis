/**
 * js/champions-set.js — die Zahlen und die Umrechnung, an einer Stelle.
 *
 * Pokémon Champions rechnet Statuswertpunkte anders als die Hauptreihe:
 * 0–32 je Wert, Summe hoechstens 66. Showdown rechnet EVs: 0–252, Summe
 * hoechstens 510. Der Faktor ist 8.
 *
 * Bis zum 26.08.2026 lagen diese Zahlen an drei Stellen verstreut (Rechner,
 * Play-Overlay, Scraper) — und der Export kannte keine davon. Er schrieb die
 * rohen 0–32 unter das Etikett "EVs:". Fuer Limitless ist das richtig, fuer
 * Showdown um den Faktor 8 daneben: ein Bau mit "32 Atk" spielte dort mit
 * einem Achtel des gemeinten Angriffs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'champions-set.js'), 'utf8'), sandbox);
const CS = sandbox.window.ChampionsSet;
const rein = v => JSON.parse(JSON.stringify(v));

describe('ChampionsSet: die Zahlen', () => {
    it('haengt sich an window und traegt die vier Konstanten', () => {
        assert.ok(CS);
        assert.equal(CS.SP_BUDGET, 66);
        assert.equal(CS.SP_MAX, 32);
        assert.equal(CS.EV_SCALE, 8);
        assert.equal(CS.EV_MAX, 252);
        assert.equal(CS.EV_TOTAL_MAX, 510);
    });

    it('die sechs Werte stehen in Spielreihenfolge', () => {
        assert.deepEqual(rein(CS.KEYS), ['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
    });
});

describe('ChampionsSet: klemmen', () => {
    it('deckelt je Wert bei 32', () => {
        assert.equal(CS.clampSpread({ atk: 99 }).atk, 32);
    });

    it('deckelt die Summe bei 66 und schneidet ab, statt umzuverteilen', () => {
        // Bewusst abschneiden: wer 40 auf Angriff schiebt, soll die
        // verlorenen Punkte sehen und selbst entscheiden, wohin sie gehen.
        const s = CS.clampSpread({ hp: 40, atk: 40, spe: 40 });
        assert.equal(CS.spreadTotal(s), 66);
        assert.deepEqual(rein(s), { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 2 });
    });

    it('das Ergebnis haengt nicht an der Reihenfolge der Eingabe', () => {
        // Waere hier "groesster zuerst" verdrahtet, haette dieselbe Eingabe
        // je nach Reglerbewegung ein anderes Ergebnis.
        const a = CS.clampSpread({ spe: 32, atk: 32, hp: 32 });
        const b = CS.clampSpread({ hp: 32, atk: 32, spe: 32 });
        assert.deepEqual(rein(a), rein(b));
    });

    it('Unsinn wird zu null, nicht zu NaN', () => {
        const s = CS.clampSpread({ hp: 'viel', atk: -5, def: null, spa: 1.9 });
        assert.deepEqual(rein(s), { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 });
    });
});

describe('ChampionsSet: lesen und schreiben', () => {
    it('liest die englischen Kuerzel der Quelle', () => {
        assert.deepEqual(rein(CS.parseSpread('2 HP / 32 Atk / 32 Spe')),
            { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
    });

    it('liest auch die deutschen aus dem Telegram-Bauplan', () => {
        assert.deepEqual(rein(CS.parseSpread('2 KP / 32 ANG / 32 INI')),
            { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
    });

    it('geht verlustfrei hin und zurueck', () => {
        const t = '2 HP / 32 Atk / 1 SpD / 31 Spe';
        assert.equal(CS.toChampionsText(CS.parseSpread(t)), t);
    });

    it('schreibt keine Nullen mit', () => {
        assert.equal(CS.toChampionsText({ hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 }),
            '32 Atk');
        assert.equal(CS.toChampionsText(CS.leer()), '');
    });
});

describe('ChampionsSet: die beiden Zahlenwelten', () => {
    it('Showdown bekommt dieselbe Verteilung mal acht, gedeckelt bei 252', () => {
        const s = CS.parseSpread('2 HP / 32 Atk / 32 Spe');
        // 32 x 8 = 256 → 252. 2 x 8 = 16.
        assert.equal(CS.toShowdownText(s), '16 HP / 252 Atk / 252 Spe');
    });

    it('meldet, wenn der Bau Showdowns 510er-Budget sprengt', () => {
        // Champions' 66 Punkte ergeben mal 8 bis zu 528: ein voll
        // ausgereizter Bau ist in Showdown schlicht nicht legal. Gemeldet,
        // nicht heimlich beschnitten — welcher Wert geopfert wird, ist eine
        // Spielentscheidung.
        assert.equal(CS.showdownUeberschuss(CS.parseSpread('2 HP / 32 Atk / 32 Spe')), 10);
        assert.equal(CS.showdownUeberschuss(CS.parseSpread('32 Atk / 30 Spe')), 0);
    });

    it('rechnet nichts still weg', () => {
        // Der Ueberschuss steht im Text unveraendert drin — wer 252/252
        // exportiert, sieht 252/252 und die Warnung dazu.
        const s = CS.parseSpread('32 Atk / 32 Spe / 2 HP');
        assert.match(CS.toShowdownText(s), /252 Atk/);
        assert.match(CS.toShowdownText(s), /252 Spe/);
    });
});
