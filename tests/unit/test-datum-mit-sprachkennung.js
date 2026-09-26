/**
 * UI-6: kein Datum und kein Text halb auf Englisch.
 *
 * Gefunden 26.09.2026: `toLocaleDateString()` ohne Kennung auf dem
 * geteilten Meta-Call-Bild und `toLocaleString()` im Protokoll der
 * Testgruppen — beide nahmen die Sprache des BROWSERS. Dazu stand im
 * deutschen Woerterbuch "Others-Spieler".
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'js');
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

describe('UI-6: Datum mit Sprachkennung', () => {
    it('kein toLocale*String() ohne Kennung in js/', () => {
        const funde = [];
        let roh_ = 0, ohne_ = 0;
        for (const f of fs.readdirSync(JS).filter(n => n.endsWith('.js'))) {
            const roh = fs.readFileSync(path.join(JS, f), 'utf8');
            const s = ohneKommentare(roh);
            roh_ += roh.length; ohne_ += s.length;
            for (const m of s.matchAll(/\.toLocale(Date|Time)?String\(\s*\)/g)) funde.push(`${f}: ${m[0]}`);
        }
        assert.ok(ohne_ > roh_ * 0.3, 'das Ausschneiden hat zu viel entfernt');
        assert.deepEqual(funde, [], 'nimmt die Sprache des Browsers, nicht der Seite');
    });

    it('seitenLocale folgt der eingestellten Sprache', () => {
        const quelle = fs.readFileSync(path.join(JS, 'app-utils.js'), 'utf8');
        const start = quelle.indexOf('function seitenLocale()');
        assert.ok(start > 0, 'seitenLocale fehlt');
        const ende = quelle.indexOf('\n}', start) + 2;
        for (const [sprache, erwartet] of [['en', 'en-US'], ['de', 'de-DE']]) {
            const ctx = { getLang: () => sprache };
            vm.runInNewContext(quelle.slice(start, ende) + '\nergebnis = seitenLocale();', ctx);
            assert.equal(ctx.ergebnis, erwartet);
        }
    });

    it('kein "Others" im deutschen Woerterbuch', () => {
        const i18n = fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8');
        const de = i18n.slice(i18n.indexOf("'mc.labelJunkPlayers'", i18n.indexOf("'mc.labelJunkPlayers'") + 10));
        const zeile = de.slice(0, de.indexOf('\n'));
        assert.doesNotMatch(zeile, /Others/, zeile);
    });
});
