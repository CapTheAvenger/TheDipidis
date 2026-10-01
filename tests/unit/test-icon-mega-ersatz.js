'use strict';
/* DA-21 (01.10.2026): faellt ein "-mega"-Icon aus (golisopod-mega gibt es auf
 * dem Limitless-CDN nicht), wird einmal die Grundform versucht, danach
 * versteckt sich das Bild. Der onerror-Text wird AUSGEFUEHRT. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const q = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'archetype-icons.js'), 'utf8');
const m = /const ICON_FEHLER = ("(?:[^"\\]|\\.)*");/.exec(q);
assert.ok(m, 'ICON_FEHLER fehlt');
const code = eval(m[1]);

function lauf(src, fb) {
    const el = { src, dataset: fb ? { fb: '1' } : {}, style: {} };
    new Function(code).call(el);
    return el;
}

describe('DA-21: Ersatz fuer fehlende Mega-Icons', () => {
    it('versucht die Grundform genau einmal', () => {
        const a = lauf('https://x/golisopod-mega.png');
        assert.strictEqual(a.src, 'https://x/golisopod.png');
        assert.notStrictEqual(a.style.display, 'none');
        const b = lauf(a.src, false);
        b.dataset = a.dataset; // Markierung bleibt am Element
        assert.strictEqual(lauf('https://x/golisopod.png', true).style.display, 'none');
    });
    it('versteckt ein anderes fehlendes Bild sofort', () => {
        assert.strictEqual(lauf('https://x/foo.png').style.display, 'none');
    });
    it('beide Bild-Erzeuger benutzen den Text', () => {
        assert.strictEqual((q.match(/onerror="\$\{ICON_FEHLER\}"/g) || []).length, 2);
    });
    it('Verfaelschungsprobe: ohne Ersatzlogik bliebe src unveraendert', () => {
        const el = { src: 'https://x/golisopod-mega.png', dataset: {}, style: {} };
        new Function("this.style.display='none'").call(el);
        assert.strictEqual(el.src, 'https://x/golisopod-mega.png');
    });
});
