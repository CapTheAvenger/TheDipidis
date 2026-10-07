'use strict';
/* V2-16 (07.10.2026, Hausi): Heatmap am Handy nur noch in der Deck-Analyse,
   Tier-Listen klappbar, Meta-Performance sortiert Win-Rate und Top-8-Quote
   geglaettet, „A–Z" statt „Deck", ein Knopf „Share" statt Listen + Anteil,
   Ordnerwahl im Profil-Builder wie in der Deck-Analyse (N2-10),
   „nicht auf Majors" statt „kein Major", wenn das Format Majors hat. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lies = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
const ohneKomm = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('V2-16 — Win-Rate im Verhältnis zur Nutzung', () => {
    const quelle = lies('js/rangliste-sortieren.js');
    const fn = quelle.match(/function rangGeglaettet\([\s\S]*?\n\}/)[0];
    const rangGeglaettet = new Function(fn + '\nreturn rangGeglaettet;')();
    it('ein Deck mit 32 Listen überholt eines mit 1.588 nicht mehr', () => {
        const k = 0.1 * 1588;   // 10 % des meistgespielten Decks
        const dragapult = rangGeglaettet(53.8, 1588, 50, k);
        const kleinesDeck = rangGeglaettet(60, 32, 50, k);
        assert.ok(dragapult > kleinesDeck, dragapult + ' <= ' + kleinesDeck);
        // Die Glättung ändert ein großes Deck kaum
        assert.ok(Math.abs(dragapult - 53.8) < 0.5);
    });
    it('ohne Mittel oder k bleibt der Rohwert', () => {
        assert.strictEqual(rangGeglaettet(55, 10, null, 100), 55);
        assert.strictEqual(rangGeglaettet(55, 10, 50, 0), 55);
        assert.strictEqual(rangGeglaettet(null, 10, 50, 100), null);
    });
    it('der Sortierer liest den Sortierwert vor dem Zelltext', () => {
        const s = ohneKomm(lies('js/rangliste-sortieren.js'));
        assert.match(s, /getAttribute\('data-sortwert'\)/);
        assert.match(s, /var na = \(sa != null && sa !== ''\) \? parseFloat\(sa\) : zahl\(ta\);/);
    });
    it('die Meta-Performance schreibt den Sortierwert für Win-Rate und Top-8-Quote', () => {
        const s = ohneKomm(lies('js/app-tier-meta.js'));
        assert.match(s, /k === 'wr' && r\.wr != null\) return _glatt\(r\.wr, r\.listen, _wrMittel, _kListen\)/);
        assert.match(s, /k === 'quote' && r\.quote != null\) return _glatt\(r\.quote, r\.antritteGew, _qMittel, _kAntritte\)/);
        assert.match(s, /_kListen = 0\.1 \* Math\.max/);
    });
});

describe('V2-16 — Sortierknöpfe', () => {
    it('„A–Z" statt „Deck", „Share" statt Listen + Anteil', () => {
        const s = ohneKomm(lies('js/app-tier-meta.js'));
        assert.match(s, /k: 'name',\s+de: 'Deck',\s+en: 'Deck',\s+num: false, sortName: 'A–Z'/);
        assert.match(s, /k: 'anteil',\s+de: 'Share'/);
        assert.match(s, /if \(c\.k === 'listen'\) \{\s*return `<th class="ds-num cm-rang-th" data-rang-spalte="\$\{c\.k\}">/);
        assert.match(s, /data-rang-sortiert="anteil"/);
        assert.match(ohneKomm(lies('js/kein-querscroll.js')), /th\.getAttribute\('data-sortier-name'\) \|\| textOhneHilfe\(th\)/);
    });
    it('eine Spalte ohne role=button sortiert nicht', () => {
        assert.match(ohneKomm(lies('js/rangliste-sortieren.js')), /if \(th\.getAttribute\('role'\) !== 'button'\) return null;/);
    });
});

describe('V2-16 — Tier-Listen klappbar, Heatmap am Handy weg', () => {
    it('Tipp auf die Überschrift schaltet tier-zu, CSS blendet den Inhalt aus', () => {
        const js = lies('js/tier-klappen.js');
        // ausführen: Umschalten an einem Attrappen-Element
        const klassen = new Set();
        const sek = { classList: { toggle: (k) => (klassen.has(k) ? (klassen.delete(k), false) : (klassen.add(k), true)), contains: k => klassen.has(k) } };
        const attrs = {};
        const h = { parentElement: sek, setAttribute: (k, v) => { attrs[k] = v; } };
        const fenster = {};
        new Function('window', 'document', 'MutationObserver', js)(fenster, undefined, undefined);
        fenster._tierKlappen.umschalten(h);
        assert.ok(klassen.has('tier-zu'));
        assert.strictEqual(attrs['aria-expanded'], 'false');
        fenster._tierKlappen.umschalten(h);
        assert.ok(!klassen.has('tier-zu'));
        assert.strictEqual(attrs['aria-expanded'], 'true');
        const css = lies('css/knopfsystem.css');
        assert.match(css, /#current-meta \.tier-section\.tier-zu > :not\(h3\) \{ display: none; \}/);
        assert.match(lies('index.html'), /js\/tier-klappen\.js/);
    });
    it('am Handy (≤ 700 px) keine Heatmap auf der Meta-Seite', () => {
        const css = lies('css/knopfsystem.css');
        assert.match(css, /@media \(max-width: 700px\) \{\s*#current-meta \.ds-sec:has\(#matchupHeatmapContainer\) \{ display: none; \}/);
    });
});

describe('V2-16 — Ordnerwahl und „nicht auf Majors"', () => {
    it('Profil-Builder fragt den Ordner wie die Deck-Analyse', () => {
        const s = ohneKomm(lies('js/app-profile-deck-builder.js'));
        assert.match(s, /await ordnerWahl\(\{/);
        assert.match(s, /if \(ordner\) nutzlast\.folder = ordner;/);
        assert.match(s, /const r = saveToAccount\(name, ordner\);/);
    });
    it('„nicht auf Majors", wenn das Format Major-Daten hat', () => {
        const s = ohneKomm(lies('js/app-archetype-card.js'));
        assert.match(s, /const _formatHatMajor = !!\(_major && Object\.keys\(_major\)\.length\);/);
        assert.match(lies('js/i18n.js'), /'arc\.nichtAufMajors':\s+'nicht auf Majors'/);
    });
});
