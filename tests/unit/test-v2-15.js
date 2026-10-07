'use strict';
/* V2-15 (07.10.2026): die Kachelseite „Meta & Deck-Analyse" ist weg (Hausi).
   Verfälschungsproben: Menüpunkt zurück, Alias zurück auf den alten Reiter,
   Wache in switchTab entfernt — jede macht hier etwas rot. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lies = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
const ohneKommentare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ohneHtmlKommentare = s => s.replace(/<!--[\s\S]*?-->/g, '');

describe('V2-15 — Kachelseite entfernt', () => {
    const HTML = ohneHtmlKommentare(lies('index.html'));
    it('kein Reiter, kein Menüpunkt, keine Hosts', () => {
        assert.doesNotMatch(HTML, /id="meta-analysis-hub"/);
        assert.doesNotMatch(HTML, /menu-btn-meta-analysis-hub/);
        assert.doesNotMatch(HTML, /id="metaHubAnswer"|id="metaHubTileGrid"/);
    });
    it('alle alten Kurzformen führen auf die Startseite', () => {
        const ii = ohneKommentare(lies('js/inline-init.js'));
        const t = /const HASH_ALIASES = \{([\s\S]*?)\n\s*\};/.exec(ii);
        assert.ok(t, 'HASH_ALIASES nicht gefunden');
        for (const k of ['hub', 'uebersicht', 'overview', 'meta-analysis-hub', 'playtester', 'sandbox']) {
            assert.match(t[1], new RegExp("'" + k + "':\\s*'current-meta'"), '#' + k);
        }
        assert.doesNotMatch(t[1], /:\s*'meta-analysis-hub'/);
    });
    it('switchTab leitet den alten Reiter auf die Startseite um', () => {
        const core = ohneKommentare(lies('js/app-core.js'));
        const m = /function switchTab\(tabName\) \{\s*([^\n]*)/.exec(core);
        assert.ok(m);
        const umleiten = new Function('tabName', m[1] + '\nreturn tabName;');
        assert.strictEqual(umleiten('meta-analysis-hub'), 'current-meta');
        assert.strictEqual(umleiten('cards'), 'cards');
    });
    it('exitToHub springt auf die Startseite', () => {
        const hub = ohneKommentare(lies('js/meta-analysis-hub.js'));
        const f = /function exitToHub\(\) \{[\s\S]*?\n    \}/.exec(hub)[0];
        assert.match(f, /wechsleReiter\('current-meta'\)/);
        assert.match(f, /setSideMenuActive\('current-meta'\)/);
    });
});
