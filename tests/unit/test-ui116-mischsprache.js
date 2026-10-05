'use strict';
/*
 * UI-116 (05.10.2026): Mischsprache-Rest. Szenesprache bleibt englisch
 * (Win/Loss/Tie, Share, Meta, Tier, ACE SPEC …); Bedienelemente sind
 * deutsch. Geprueft wird ueber die ECHTEN Woerterbuecher aus js/i18n.js
 * (ausgefuehrt), nicht ueber Textsuche im Markup.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { lies } = require('./lib-dom-sandkasten.js');

function woerter() {
    const ctx = vm.createContext({ window: {}, document: { addEventListener() {}, documentElement: {}, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'de' }, console });
    ctx.window = ctx;
    vm.runInContext(lies('js', 'i18n.js') + '\n;globalThis.__tr = translations;', ctx);
    return ctx.__tr;
}

describe('UI-116: deutsche Bedienwoerter', () => {
    const t = woerter();
    it('Woerterbuch geladen', () => { assert.ok(t && t.de && t.en, 'translations nicht gefunden'); });
    const SOLL = {
        'profile.tradelist': 'Tauschliste', 'tg.title': 'Testgruppen', 'menu.groupMeta': 'Meta & Tier-Listen',
        'a11y.skip': 'Zum Inhalt springen', 'cardType.aceSpec': 'ACE SPEC',
        'bj.editEntry': 'Bearbeiten', 'bj.deleteEntry': 'Löschen', 'bj.copyEntry': 'Kopieren',
    };
    for (const [k, v] of Object.entries(SOLL)) {
        it(k + ' = ' + v, () => { assert.equal(t.de[k], v); assert.ok(t.en[k], 'englisch fehlt'); });
    }
    it('Journal-Knoepfe zeigen den uebersetzten Text, nicht „Edit/Del/Copy"', () => {
        const bj = lies('js', 'battle-journal.js');
        assert.ok(!/>Edit<\/button>|>Del<\/button>|>Copy<\/button>/.test(bj));
    });
    it('Markup traegt die Schluessel', () => {
        const html = lies('index.html');
        assert.match(html, /data-i18n="menu\.groupMeta"/);
        assert.match(html, /class="skip-to-content" data-i18n="a11y\.skip"/);
    });
});
