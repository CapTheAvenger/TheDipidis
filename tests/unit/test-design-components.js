/**
 * Designsystem, Phase 1 — die fünf Komponenten.
 *
 * Die Abnahme der Phase lautet: ein neuer Screen lässt sich ohne eine
 * einzige neue CSS-Regel bauen. Diese Tests halten die Bedingungen
 * dafür fest:
 *
 *  - components.css besteht ausschließlich aus Tokens. Eine rohe
 *    Hex-Farbe oder eine px-Schriftgröße hier wäre der 753. Farbwert
 *    und die 226. Schriftgröße;
 *  - kein !important. Der Grund, warum die alten Tabellenregeln 30
 *    davon brauchten, war #currentMetaContent .section table
 *    (Spezifität 1,1,1). Diese Elternregel nimmt .ds-table jetzt per
 *    :not() aus — die Komponente konkurriert gar nicht erst;
 *  - Current Meta benutzt die Komponenten wirklich, statt sie nur zu
 *    definieren.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const COMP = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const TOKENS = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
const STYLES = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const CM = fs.readFileSync(path.join(ROOT, 'css', 'current-meta-matchups.css'), 'utf8');
const TIER = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const BODY = stripComments(COMP);

describe('components.css ist aus Tokens gebaut', () => {
    it('enthält keine einzige rohe Hex-Farbe', () => {
        const hex = BODY.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
        assert.deepEqual(hex, [], `rohe Farben: ${hex.join(', ')}`);
    });

    it('enthält keine px-Schriftgröße', () => {
        const px = BODY.match(/font-size:\s*[^;]*\d+px/g) || [];
        assert.deepEqual(px, [], `px-Schriftgrößen: ${px.join(', ')}`);
    });

    it('benutzt für jede Schriftgröße ein Token', () => {
        const sizes = BODY.match(/font-size:\s*([^;]+);/g) || [];
        assert.ok(sizes.length > 8, `nur ${sizes.length} font-size-Deklarationen`);
        sizes.forEach(d => assert.match(d, /var\(--(fs-[a-z]+|lbl)\)/, `kein Token: ${d.trim()}`));
    });

    it('kommt ohne !important aus', () => {
        assert.equal((BODY.match(/!important/g) || []).length, 0);
    });

    it('jede benutzte Variable ist in tokens.css definiert', () => {
        const used = [...new Set((BODY.match(/var\((--[a-z0-9-]+)\)/g) || [])
            .map(v => v.replace(/var\(|\)/g, '')))];
        assert.ok(used.length > 15, `nur ${used.length} Tokens benutzt`);
        const missing = used.filter(v => !TOKENS.includes(`${v}:`));
        assert.deepEqual(missing, [], `nicht in tokens.css: ${missing.join(', ')}`);
    });

    it('führt alle fünf Komponenten', () => {
        ['.ds-panel', '.ds-stat', '.ds-bar', '.ds-table', '.ds-chip']
            .forEach(c => assert.ok(BODY.includes(c + ' ') || BODY.includes(c + '\n')
                || BODY.includes(c + ','), `${c} fehlt`));
    });

    it('wird direkt nach tokens.css geladen', () => {
        const links = [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(css\/[^"?]+)/g)]
            .map(m => m[1]);
        assert.equal(links[0], 'css/tokens.css');
        assert.equal(links[1], 'css/components.css');
    });

    it('steht in der Shell-Liste des Service Workers', () => {
        const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
        assert.match(sw, /'\.\/css\/components\.css'/);
    });
});

describe('die Datentabelle braucht kein !important mehr', () => {
    it('die Elternregel nimmt .ds-table aus', () => {
        // Ohne das :not() gewinnt #currentMetaContent .section table
        // (1,1,1) gegen .ds-table (0,1,0) — genau der Grund für die 30
        // !important, die vorher in styles.css standen.
        const parentRules = CM.match(/#currentMetaContent \.section table[^\s{,]*/g) || [];
        assert.ok(parentRules.length > 20, `nur ${parentRules.length} Elternregeln gefunden`);
        const leaking = parentRules.filter(r => !r.includes(':not(.ds-table)'));
        assert.deepEqual(leaking, [], `diese Regeln greifen noch auf .ds-table: ${leaking.join(', ')}`);
    });

    it('die alten Tabellenregeln samt ihrer !important sind weg', () => {
        assert.doesNotMatch(STYLES, /\.cm-vs-top8-table th \{/);
        assert.doesNotMatch(STYLES, /\.cm-vt-rank\s/);
        assert.doesNotMatch(STYLES, /\.cm-conv-fill\.is-up/);
    });

    it('der !important-Zähler sinkt weiter', () => {
        // 3.445 nach Phase 0. Phase 1 nimmt die Tabellenregeln mit.
        const files = fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css'));
        const total = files.reduce((n, f) => n + (stripComments(
            fs.readFileSync(path.join(ROOT, 'css', f), 'utf8')).match(/!important/g) || []).length, 0);
        assert.ok(total <= 3402, `!important steht bei ${total}, erwartet <= 3402`);
    });
});

describe('Current Meta benutzt die Komponenten wirklich', () => {
    it('die Rangliste ist .ds-table in .ds-panel', () => {
        // Waren zwei Tabellen nebeneinander (🌐 "Wie oft gespielt" und
        // 🏆 "Wie oft Top-8 erreicht") plus eine dritte darunter. Alle drei
        // zeigten dieselben Decks mit denselben Spalten in anderer
        // Reihenfolge; seit dem 19.08.2026 ist es eine sortierbare Tabelle.
        assert.match(TIER, /<div class="ds-panel cm-rangliste-block">\s*\n\s*<h3 class="ds-label">🏆/);
        assert.ok(!/<h3 class="ds-label">🌐/.test(TIER),
            'die zweite Rangliste ist wieder da');
        const tabellen = (TIER.match(/class="ds-table[^"]*"/g) || []);
        assert.equal(tabellen.length, 2,
            'erwartet: die Rangliste und die Movers-Tabelle — gefunden: ' + tabellen.join(', '));
        assert.ok(tabellen.some(t => t.indexOf('cm-rangliste') > -1),
            'die Rangliste traegt ihre eigene Klasse nicht');
    });

    it('die Balkenzeile lebt jetzt in der Rangliste', () => {
        // Sie stand im eigenen Block "Top 8 vs. Erwartung". Der Block ist am
        // 19.08.2026 in die sortierbare Rangliste aufgegangen, der Balken ist
        // mitgewandert — er zeigt auf einen Blick, wer ueber dem Schnitt liegt.
        assert.match(TIER, /ds-bar-track is-diverging/);
        assert.match(TIER, /ds-bar-fill \$\{posi \? 'is-pos' : 'is-neg'\}/);
        assert.match(TIER, /cm-rangliste/, 'der Balken haengt nicht an der Rangliste');
    });

    it('die Datenbasis erscheint als Kennzahl-Kacheln', () => {
        assert.match(TIER, /class="ds-stat-row/);
        assert.match(TIER, /class="ds-stat-value"/);
        assert.match(TIER, /class="ds-stat-label"/);
    });

    it('Zahlenspalten sind als solche markiert', () => {
        assert.match(TIER, /<td class="ds-num"/);
        assert.match(TIER, /<td class="ds-rank">/);
    });
});

describe('eine Prozentzahl, ein Format', () => {
    const F = new Function('getLang',
        UTILS.match(/function formatPercent\(value, digits = 1\) \{[\s\S]*?\n\}/)[0] + '\n' +
        UTILS.match(/function formatPercentSigned\(value, digits = 1\) \{[\s\S]*?\n\}/)[0] + '\n' +
        'return { formatPercent, formatPercentSigned };');
    const de = F(() => 'de');
    const en = F(() => 'en');

    it('deutsch: Komma und geschütztes Leerzeichen vor dem Zeichen', () => {
        assert.equal(de.formatPercent(6.32, 2), '6,32 %');
        assert.equal(de.formatPercent(8), '8,0 %');
    });

    it('englisch: Punkt und kein Leerzeichen', () => {
        assert.equal(en.formatPercent(6.32, 2), '6.32%');
        assert.equal(en.formatPercent(8), '8.0%');
    });

    it('immer eine Nachkommastelle — keine Integer-Rundung mehr', () => {
        // Die Improvers-Tabelle rundete 6,0 auf 5,0 und zeigte Δ +1,0 %.
        assert.equal(de.formatPercent(6.04), '6,0 %');
        assert.equal(de.formatPercent(5.96), '6,0 %');
    });

    it('das Vorzeichen wird immer geschrieben', () => {
        assert.equal(de.formatPercentSigned(12.3), '+12,3 %');
        assert.equal(de.formatPercentSigned(-12.3), '−12,3 %');
        assert.equal(de.formatPercentSigned(0), '+0,0 %');
    });

    it('unbrauchbare Eingaben ergeben nichts statt NaN', () => {
        assert.equal(de.formatPercent(null), '');
        assert.equal(de.formatPercent(undefined), '');
        assert.equal(de.formatPercent(NaN), '');
        assert.equal(de.formatPercentSigned('abc'), '');
    });

    it('ist als window.formatPercent veröffentlicht', () => {
        assert.match(UTILS, /window\.formatPercent = formatPercent;/);
        assert.match(UTILS, /window\.formatPercentSigned = formatPercentSigned;/);
    });
});
