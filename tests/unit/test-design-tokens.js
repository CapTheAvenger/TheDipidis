/**
 * Designsystem, Phase 0 — die Tokenschicht.
 *
 * Gemessen am 14.08.2026 über css/*.css (38.629 Zeilen): 225
 * verschiedene font-size-Werte, 74 Radien, 752 Hex-Farben, 484
 * box-shadow-Deklarationen, 3.446 !important. Mit 752 Farben und 225
 * Schriftgrößen kann keine Seite ruhig wirken, egal wie viel Sorgfalt
 * in die einzelne Ansicht fließt.
 *
 * Diese Tests halten fest, was Phase 0 dagegen aufgestellt hat, und
 * verhindern die drei Rückfälle, die am wahrscheinlichsten sind:
 *
 *  - tokens.css rutscht in der Ladereihenfolge nach hinten und die
 *    Variablen sind für die Datei darüber nicht definiert;
 *  - der !important-Berg wächst weiter;
 *  - eine neue divergierende Skala wird wieder grün↔rot.
 *
 * Der !important-Zähler ist bewusst als "darf nie steigen" formuliert
 * und nicht als Zielwert: 3.445 Stück auf einmal anzufassen wäre ein
 * Wochenende im Refactor, das niemand bezahlt bekommt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TOKENS = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
const STYLES = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const MOBILE = fs.readFileSync(path.join(ROOT, 'css', 'mobile-responsive.css'), 'utf8');
const CM = fs.readFileSync(path.join(ROOT, 'css', 'current-meta-matchups.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const CSS_FILES = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(f => f.endsWith('.css')).sort();

// Kommentare zählen nicht mit: diese Datei erklärt den Berg, sie baut
// ihn nicht auf.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function countImportant() {
    return CSS_FILES.reduce((n, f) => {
        const txt = stripComments(fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'));
        return n + (txt.match(/!important/g) || []).length;
    }, 0);
}

describe('tokens.css ist der Vorrat', () => {
    it('wird als erste CSS-Datei geladen', () => {
        const links = [...HTML.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(css\/[^"?]+)/g)]
            .map(m => m[1]);
        assert.ok(links.length > 10, `nur ${links.length} lokale Stylesheets gefunden`);
        assert.equal(links[0], 'css/tokens.css',
            `erste Datei ist ${links[0]} — alles danach darf sich auf die Variablen verlassen`);
    });

    it('ist cache-gebustet wie jede andere Datei', () => {
        assert.match(HTML, /css\/tokens\.css\?v=\d{12}/);
    });

    it('steht in der Shell-Liste des Service Workers', () => {
        // Fehlt sie dort, holt der Offline-Start alle Farben und Größen
        // nicht aus dem Cache — die Seite käme ohne Tokens hoch.
        const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
        assert.match(sw, /'\.\/css\/tokens\.css'/);
    });

    it('führt genau sechs Schriftgrößen plus das Label', () => {
        // Größen kennt nur der helle Satz — der dunkle ändert Farben.
        const sizes = ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-hero'];
        sizes.forEach(v => assert.match(TOKENS, new RegExp(`${v}:`), `${v} fehlt`));
        assert.match(TOKENS, /--lbl:/);
        const declared = (TOKENS.match(/--fs-[a-z]+:/g) || []).length;
        assert.equal(declared, sizes.length, 'eine siebte Schriftgröße ist eine Stufe zu viel');
    });

    it('führt die Abstände als Vielfache von 4', () => {
        const spacing = TOKENS.match(/--s-\d+:\s*(\d+)px/g) || [];
        assert.ok(spacing.length >= 6, `nur ${spacing.length} Abstände`);
        spacing.forEach(d => {
            const px = Number(d.match(/(\d+)px/)[1]);
            assert.equal(px % 4, 0, `${d} ist kein Vielfaches von 4`);
        });
    });

    it('führt drei Radien und zwei Schatten, nicht mehr', () => {
        // Der dunkle Satz definiert dieselben Namen ein zweites Mal —
        // gezählt wird deshalb nur der helle Block.
        const lightOnly = TOKENS.slice(0, TOKENS.indexOf(':root[data-theme="dark"]'));
        assert.equal((lightOnly.match(/--r-[a-z]+:/g) || []).length, 3);
        assert.equal((lightOnly.match(/--e-\d:/g) || []).length, 2);
    });

    it('führt Flächen, Text, Marke und die divergierende Skala', () => {
        ['--surface-0', '--surface-1', '--surface-2', '--line', '--line-strong',
         '--ink', '--ink-2', '--ink-3', '--brand', '--gold', '--alarm',
         '--dv-pos', '--dv-neg', '--dv-zero', '--bar-track', '--bar-fill', '--font-num']
            .forEach(v => assert.match(TOKENS, new RegExp(`${v}:`), `${v} fehlt`));
    });

    it('die divergierende Skala ist blau↔rot, nicht grün↔rot', () => {
        // Rot-Grün ist die häufigste Farbsehschwäche. Der positive Pol
        // muss ein Blau sein: mehr Blau als Grün und mehr Blau als Rot.
        const hex = TOKENS.match(/--dv-pos:\s*#([0-9a-fA-F]{6})/);
        assert.ok(hex, '--dv-pos ist keine Hex-Farbe');
        const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
        assert.ok(b > g && b > r, `--dv-pos #${hex[1]} ist kein Blau (r${r} g${g} b${b})`);
    });

    it('enthält keine Komponenten, nur Werte', () => {
        // Alles außerhalb von :root wäre eine Komponente — die gehören ab
        // Phase 1 nach components.css.
        const outside = stripComments(TOKENS)
            .replace(/:root(\[data-theme="dark"\])?\s*\{[\s\S]*?\n\}/g, '').trim();
        assert.equal(outside, '', `tokens.css enthält Regeln außerhalb von :root: ${outside.slice(0, 80)}`);
    });
});

describe('der !important-Berg wächst nicht weiter', () => {
    it('bleibt unter dem Stand vor Phase 0', () => {
        // Stand auf main vor diesem PR, Kommentare abgezogen: 3446.
        // Die Regel lautet: jede Datei, die in einer Phase ohnehin
        // angefasst wird, verlässt sie mit weniger als vorher.
        const BASELINE = 3446;
        const now = countImportant();
        assert.ok(now <= BASELINE,
            `!important ist von ${BASELINE} auf ${now} gestiegen`);
    });

    it('tokens.css selbst kommt ohne aus', () => {
        assert.equal((stripComments(TOKENS).match(/!important/g) || []).length, 0);
    });
});

describe('Phase 0: was sofort sichtbar ist', () => {
    it('der Seitenhintergrund trägt kein gekacheltes Muster mehr', () => {
        const body = STYLES.match(/\n\s*body\s*\{[\s\S]*?\n\s*\}/);
        assert.ok(body, 'body-Regel nicht gefunden');
        assert.doesNotMatch(body[0], /background-image/,
            'das Pokéball-Muster lief unter jeder Tabelle durch');
        assert.match(body[0], /background-color:\s*var\(--surface-0\)/);
    });

    it('die Kopfzeile trägt keinen roten Verlaufsbanner mehr', () => {
        const header = STYLES.match(/\n\s*\.header\s*\{[\s\S]*?\n\s*\}/);
        assert.ok(header, '.header-Regel nicht gefunden');
        assert.doesNotMatch(header[0], /--pokemon-red/,
            'gemessene 82px roter Banner, der genau einen Titel trug');
        assert.match(header[0], /min-height:\s*48px/);
        assert.match(header[0], /border-image:\s*var\(--rule\)/, 'der 2px-Signaturstrich fehlt');
    });

    it('die Überschrift der Kopfzeile gewinnt gegen .tab-content h2', () => {
        // .tab-content h2 steht später in derselben Datei und hat dieselbe
        // Spezifität — ohne den zweiten Selektor gäbe es wieder 24px,
        // 16px Abstand und einen roten 3px-Strich.
        const idxHeader = STYLES.indexOf('.tab-content .header h1, .tab-content .header h2');
        const idxTab = STYLES.indexOf('.tab-content h2 {');
        assert.ok(idxHeader > -1, 'der spezifischere Selektor fehlt');
        assert.ok(idxTab > -1);
        assert.match(STYLES.slice(idxHeader, idxHeader + 400), /font-size:\s*var\(--fs-xl\)/);
    });

    it('es gibt eine Inhaltsbreite, und sie zieht die Rinne nicht doppelt ab', () => {
        const c = STYLES.match(/\n\s*\.container\s*\{[\s\S]*?\n\s*\}/);
        assert.ok(c);
        assert.match(c[0], /width:\s*min\(1440px,\s*100%\)/);
        assert.doesNotMatch(c[0], /max-width:\s*1400px/);
        // body trägt das Polster; ein zweiter Abzug im Container hat auf
        // 390px die Archetyp-Karten übereinandergeschoben.
        assert.doesNotMatch(STYLES, /body > \.container \{\s*width: min\(1440px, 100% - 32px\)/);
    });
});

describe('Phase 0: die beiden Layoutfehler', () => {
    it('die Climbers/Fallers-Tabelle hungert keine Spalte mehr aus', () => {
        // Vorher: table-layout: fixed und 46% + 24% + 30% für drei
        // Spalten, während die Tabelle vier rendert (Deck | Rank | Count
        // | Win Rate). Die vierte bekam 0px, ihr Inhalt endete bei 1280px
        // Fensterbreite auf 1301px — der horizontale Überlauf.
        // Phase 1 hat :not(.ds-table) an die Elternregel gehängt, damit
        // die Komponente nicht dagegen anschreiben muss.
        assert.match(CM, /#currentMetaContent \.section table(:not\(\.ds-table\))? \{[\s\S]*?table-layout:\s*auto/);
        assert.doesNotMatch(CM, /#currentMetaContent \.section table[^\n]*td:nth-child\(3\) \{\s*\n\s*width:\s*30%/);
    });

    it('die Änderungs-Plakette wird nach Klasse angesprochen, nicht nach Spaltennummer', () => {
        assert.match(CM, /#currentMetaContent \.section table(:not\(\.ds-table\))? td \.negative/);
        assert.doesNotMatch(CM, /table(:not\(\.ds-table\))? td:nth-child\(3\) \.negative/);
    });

    it('die Karten auf dem Handy behalten den Platz für ihre Kopfzeile', () => {
        // .archetype-card-header ist absolut gesetzt; ein pauschales
        // padding: 8px hat den Platz kassiert und "5 Varianten" stand
        // mitten im Decknamen.
        const rule = MOBILE.match(/\.tier-hero-card \.tier-hero-content \{[\s\S]*?\}/);
        assert.ok(rule, 'die mobile Regel fehlt');
        const top = rule[0].match(/padding:\s*(\d+)px/);
        assert.ok(top && Number(top[1]) >= 34,
            `oberes Polster ist ${top ? top[1] : '?'}px, die Kopfzeile braucht ~38px`);
    });
});

describe('grün↔rot verschwindet dort, wo ohnehin gearbeitet wurde', () => {
    it('Auf-/Absteiger im Current Meta nutzen die divergierende Skala', () => {
        assert.match(CM, /#currentMetaContent \.rank-up \{\s*\n\s*color:\s*var\(--dv-pos\)/);
        assert.match(CM, /#currentMetaContent \.rank-down \{\s*\n\s*color:\s*var\(--dv-neg\)/);
        assert.match(CM, /#currentMetaContent \.positive \{\s*\n\s*color:\s*var\(--dv-pos\)/);
        assert.match(CM, /#currentMetaContent \.negative \{\s*\n\s*color:\s*var\(--dv-neg\)/);
    });

    it('die alten Grüntöne stehen nicht mehr in dieser Datei', () => {
        assert.doesNotMatch(CM, /#16a34a|#27ae60/);
    });
});
