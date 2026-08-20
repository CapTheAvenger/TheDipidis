/**
 * Der 12-px-Boden auf dem Telefon — und wo er aufhoert.
 *
 * MESSREIHE 20.08.2026, 390 px, vier Reiter, vor dem Umbau:
 *
 *   Reiter          Textknoten   <12px   =12px   >12px   ds-Knoten
 *   current-meta         2.367       0   2.347      20         348
 *   cards                  154     118      35       1           0
 *   city-league             13       0      13       0          10
 *   past-meta               14       1      13       0           5
 *
 * Zwei Befunde in entgegengesetzte Richtungen:
 *
 *   1. Wo das Designsystem steht, richtet der Boden nur Schaden an.
 *      339 von 348 Bausteinen lagen auf 12 px — .ds-label (10),
 *      .ds-note (11), .ds-stat-value (30), .arc-tile-value (bis 24):
 *      eine Groesse fuer alles, keine Rangordnung mehr. Unter 12 px lag
 *      dort nichts, der Boden hatte also nichts zu schuetzen.
 *   2. Wo er gebraucht wird, greift er kaum. Auf dem Karten-Reiter liegen
 *      118 von 154 Knoten UNTER 12 px. Gegenprobe mit abgeschaltetem
 *      Boden: 13 von 154 aendern sich, um hoechstens 3 px.
 *
 * Danach: unter 10 px 283 -> 0, alle Formularfelder >= 16 px.
 *
 * Diese Zusagen halten den Umbau fest. Sie pruefen CSS-Text, nicht
 * gerenderte Pixel — die Messung selbst laeuft im Browser (siehe
 * tests/mobile_ux_audit.js), hier steht, was sie festgestellt hat.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKommentar = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const MOBIL  = read('css/mobile-responsive.css');
const M      = ohneKommentar(MOBIL);
const STYLES = ohneKommentar(read('css/styles.css'));
const TOKENS = read('css/tokens.css');
const COMP   = ohneKommentar(read('css/components.css'));

/* Die eine Regel, um die es geht. */
const BODEN = /(\.tab-content [^{]*?)\{\s*font-size: 12px !important;\s*\}/;

describe('Der Boden laesst das Designsystem aus', () => {
    const treffer = BODEN.exec(M);

    it('es gibt ihn noch — er wurde nicht einfach geloescht', () => {
        // Auf dem Karten-Reiter haelt er 13 Knoten oben. Wenig, aber
        // nicht nichts, und dort steht kein Designsystem im Weg.
        assert.ok(treffer, 'die Bodenregel ist nicht mehr auffindbar');
        assert.match(treffer[1], /\.tab-content p/);
        assert.match(treffer[1], /\.tab-content span/);
    });

    it('jeder einzelne Selektor traegt die Ausnahme', () => {
        // Eine vergessene Zeile reicht, damit der Boden wieder in die
        // Karte hineingreift — genau so ist .ds-stat-value einen Tag
        // zuvor durchgerutscht.
        const sel = treffer[1].split(',').map(s => s.trim()).filter(Boolean);
        assert.ok(sel.length > 25, `nur ${sel.length} Selektoren`);
        for (const s of sel) {
            assert.match(s, /:not\(\.ds-panel \*\)/, s);
            assert.match(s, /:not\(\.ds-table \*\)/, s);
            assert.match(s, /:not\(\.ds-stat \*\)/, s);
            assert.match(s, /:not\(\.ds-bar \*\)/, s);
            assert.match(s, /:not\(\.ds-controls \*\)/, s);
            assert.match(s, /:not\(\.arc-card \*\)/, s);
            assert.match(s, /:not\(\[class\^="ds-"\]\)/, s);
            assert.match(s, /:not\(\[class\*=" ds-"\]\)/, s);
        }
    });

    it('die Ausnahme haengt an Behaeltern, nicht an einer Klassenliste', () => {
        // Der Unterschied ist der ganze Zweck: ein kuenftiger Baustein
        // ist von selbst ausgenommen, statt hier nachgetragen zu werden.
        const sel = treffer[1];
        assert.doesNotMatch(sel, /:not\(\.ds-stat-value\)/,
            'eine Ausnahme fuer eine einzelne Komponente ist der alte Weg');
        assert.doesNotMatch(sel, /:not\(\.ds-sec \*\)/,
            '.ds-sec ist nur ein Behaelter fuer Eingesammeltes, kein Baustein — '
            + 'gemessen fielen darin .top-card-name auf 6,4 px, als er ausgenommen war');
    });

    it('Formularfelder haben einen eigenen Wert, keinen geliehenen Boden', () => {
        assert.doesNotMatch(treffer[1], /\.tab-content select/,
            'select gehoert nicht mehr in den Boden');
        assert.doesNotMatch(treffer[1], /\.tab-content input/,
            'input gehoert nicht mehr in den Boden');
        assert.match(M, /body \.tab-content input\[type\][\s\S]{0,120}font-size: 16px !important/,
            '16 px ist die Schwelle, unter der iOS beim Antippen hineinzoomt');
        // [type] ist kein Zierrat: ux-step1.css setzt
        // input[type="text"][id*="search"] auf 15px !important, also (0,2,1).
        assert.match(read('css/ux-step1.css'), /input\[type="text"\]\[id\*="search" i\]/);
    });

    it('die Schrumpf-auf-Passform-Regel bei den Filtern ist weg', () => {
        // 0,82em von 12 px ergab 9,84 px in drei Filtern von Vergangenes Meta.
        assert.doesNotMatch(M, /font-size: 0\.82em/);
    });

    it('die vier toten Ueberschriftenregeln sind weg', () => {
        // Gegenprobe: abgeschaltet, 21 sichtbare Ueberschriften ueber vier
        // Reiter, null Aenderung. Vier Ausrufezeichen fuer nichts.
        for (const h of ['h1', 'h2', 'h3', 'h4']) {
            assert.doesNotMatch(M, new RegExp(`\\.tab-content ${h}\\s*\\{\\s*font-size`),
                `.tab-content ${h} setzt wieder eine Groesse`);
        }
    });
});

describe('Was der Boden bisher verdeckt hat', () => {
    it('--lbl ist auf dem Telefon 11 px, nicht 10', () => {
        // 10 px Grossbuchstaben sind auf dem Schreibtisch ruhig und auf
        // dem Telefon zu klein. Sichtbar wurde es erst, als der Boden sie
        // nicht mehr stillschweigend auf 12 px hob.
        assert.match(TOKENS, /@media \(max-width: 768px\)\s*\{\s*:root \{\s*--lbl: 11px;/);
        assert.match(TOKENS, /--lbl: 10px/, 'der Wert fuer grosse Schirme bleibt');
    });

    it('die Archetyp-Karte faellt auf dem Telefon nicht unter 11 px', () => {
        // Diese Werte wurden gegen einen Boden entworfen, der sie nie
        // wirken liess: 0,5rem sind 8 px, 0,53rem sind 8,48 px.
        const block = STYLES.slice(STYLES.indexOf('@media (max-width: 620px)',
            STYLES.indexOf('.arc-tile-label')));
        const rem = [...block.matchAll(/font-size: ([0-9.]+)rem/g)].map(m => parseFloat(m[1]));
        assert.ok(rem.length >= 4, `nur ${rem.length} Groessen gefunden`);
        for (const r of rem) {
            assert.ok(r * 16 >= 11, `${r}rem sind ${(r * 16).toFixed(2)} px`);
        }
    });

    it('die ds-Tabellen sind aus den Zellenregeln herausgenommen', () => {
        // Dasselbe Muster, das css/current-meta-matchups.css seit Phase 1
        // benutzt: die Komponente konkurriert gar nicht erst.
        // 0,85em von 11 px ergaben 9,35 px in den Kopfzeilen.
        // Geprueft werden nur Regeln, die eine GROESSE setzen. Regeln,
        // die bloss Innenabstand geben, duerfen die ds-Tabellen ruhig
        // mitnehmen — sie streiten um nichts.
        // (?<![\w-]) statt \b: sonst faengt der Griff auch
        // ".tier-movers-table th" ein, und das ist die eigene Regel
        // einer bestimmten Tabelle, kein Rundumschlag ueber alle.
        const zellen = [...STYLES.matchAll(
            /([^{}]*(?<![\w-])table(?::not\([^)]*\))? (?:th|td)\b[^{}]*)\{([^}]*)\}/g)];
        // max(14px, 0.95em) ist selbst schon ein Boden und kann die
        // 9,35 px gar nicht erzeugen — solche Regeln sind ausgenommen.
        const mitGroesse = zellen.filter(m => /font-size/.test(m[2])
            && !/font-size:\s*max\(/.test(m[2]));
        assert.ok(mitGroesse.length >= 4, `nur ${mitGroesse.length} Zellenregeln mit Groesse`);
        for (const m of mitGroesse) {
            assert.match(m[1], /:not\(\.ds-table\)/,
                'Zellenregel ohne Ausnahme: ' + m[1].replace(/\s+/g, ' ').trim().slice(0, 70));
        }
        const n = (STYLES.match(/table:not\(\.ds-table\)/g) || []).length;
        assert.ok(n >= 5, `nur ${n} Ausnahmen, erwartet mindestens 5`);
    });

    it('.ds-table bringt seine Kopfzeilengroesse weiterhin selbst mit', () => {
        assert.match(COMP, /\.ds-table th \{[^}]*font-size: var\(--lbl\)/);
    });
});

describe('Der Ausrufezeichen-Haushalt', () => {
    it('mobile-responsive.css hat weniger als vorher', () => {
        // Stand vor diesem Umbau: 591 in dieser Datei, 3340 ueber alle.
        // Entfernt: vier tote Ueberschriftenregeln, ein Schrumpfen auf
        // Passform. Dazugekommen: eine Regel fuer Formularfelder.
        const n = (MOBIL.match(/!important;/g) || []).length;
        assert.ok(n <= 587, `mobile-responsive.css hat ${n}, erwartet hoechstens 587`);
    });

    it('und die Ausnahmen bringen keine neuen mit', () => {
        // Die ganze Umstellung laeuft ueber Selektoren, nicht ueber mehr
        // Nachdruck. Genau das war der Punkt.
        const treffer = BODEN.exec(M);
        assert.equal((treffer[0].match(/!important/g) || []).length, 1);
    });
});
