/**
 * Die Fussleiste und die eine body-Regel.
 *
 * Zwei Funde vom 2026-08-18, die zusammengehoeren:
 *
 * 1. .footer stand auf color: white. Der Seitenhintergrund ist hell.
 *    Gemessen 1,12:1 - der Text war praktisch unsichtbar. Er lautet
 *    "Letzte Aktualisierung: <Datum>", also die einzige Stelle auf der
 *    ganzen Seite, an der steht, wie frisch die Zahlen sind. Auf
 *    Mobil kam ein font-size: 0.9em obendrauf, das sich gegen die
 *    Elternschrift auf gemessene 10,8px herunterrechnete.
 *
 * 2. Warum die Farbe nie auffiel: css/pokeball-menu.css - eine Datei
 *    ueber ein Menue - erklaerte body { background-color, color,
 *    font-family } fuer die ganze Seite und lud nach styles.css.
 *    Der Seitenhintergrund kam damit aus --bg-body statt aus dem
 *    Token --surface-0, und der Dunkelmodus aus tokens.css konnte den
 *    Hintergrund nie erreichen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS_DIR = path.join(ROOT, 'css');

const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const read = f => strip(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
const cssFiles = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));

// Alle Regeln, deren Selektorliste ein nacktes "body" enthaelt —
// also solche, die die ganze Seite betreffen. "body.foo" oder
// "body .bar" zaehlen nicht mit, die meinen etwas Engeres.
function bodyRules() {
    const out = [];
    for (const f of cssFiles) {
        const src = read(f);
        const re = /(^|[}\s])([^{}]*?)\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            const sels = m[2].split(',').map(s => s.trim()).filter(Boolean);
            if (sels.some(s => s === 'body')) {
                out.push({ file: f, index: m.index, body: m[3] });
            }
        }
    }
    return out;
}

describe('die eine body-Regel', () => {
    it('nur styles.css faerbt den Seitenhintergrund', () => {
        const painting = bodyRules().filter(r => /background(-color)?\s*:/.test(r.body));
        assert.deepStrictEqual(
            painting.map(r => r.file), ['styles.css'],
            'mehr als eine Datei setzt den Seitenhintergrund: ' + painting.map(r => r.file).join(', ')
        );
    });

    it('nur styles.css setzt die Grundtextfarbe', () => {
        const coloring = bodyRules().filter(r => /(^|[;\s])color\s*:/.test(r.body));
        assert.deepStrictEqual(coloring.map(r => r.file), ['styles.css']);
    });

    it('der Seitenhintergrund kommt aus einem Token, nicht aus einer Farbe', () => {
        const [rule] = bodyRules().filter(r => r.file === 'styles.css' && /background-color/.test(r.body));
        assert.ok(rule, 'keine body-Regel in styles.css gefunden');
        assert.match(rule.body, /background-color:\s*var\(--surface-0\)/,
            'sonst erreicht der Dunkelmodus den Hintergrund nie');
    });
});

describe('die Fussleiste ist lesbar', () => {
    const styles = read('styles.css');

    it('.footer steht nicht mehr auf weiss', () => {
        const rules = [...styles.matchAll(/(^|[}\s])\.footer\s*\{([^}]*)\}/g)].map(m => m[2]);
        assert.ok(rules.length > 0, '.footer nicht gefunden');
        for (const body of rules) {
            assert.ok(!/color:\s*(white|#fff(fff)?)\b/i.test(body),
                'weisse Schrift auf hellem Grund: gemessen 1,12:1');
        }
    });

    it('die Grundregel nimmt ihre Farbe aus den Tokens', () => {
        const base = /(^|[}\s])\.footer\s*\{([^}]*)\}/.exec(styles);
        assert.match(base[2], /color:\s*var\(--/);
    });

    it('keine .footer-Regel schrumpft die Schrift relativ (em/%/rem unter 1)', () => {
        // 0.9em rechnet sich gegen die Elternschrift und landete bei
        // 10,8px. Absolute Werte oder gar keine Angabe.
        const bad = [];
        for (const m of styles.matchAll(/(^|[}\s])\.footer\s*\{([^}]*)\}/g)) {
            const fs_ = /font-size:\s*([\d.]+)(em|rem|%)/.exec(m[2]);
            if (fs_) {
                const v = parseFloat(fs_[1]) / (fs_[3] === '%' ? 100 : 1);
                if (v < 1) bad.push(fs_[0]);
            }
        }
        assert.deepStrictEqual(bad, []);
    });

    it('die Grundschrift der Fussleiste ist mindestens 13px', () => {
        const base = /(^|[}\s])\.footer\s*\{([^}]*)\}/.exec(styles);
        const m = /font-size:\s*(\d+)px/.exec(base[2]);
        assert.ok(m, '.footer hat keine absolute Schriftgroesse');
        assert.ok(Number(m[1]) >= 13, `nur ${m[1]}px`);
    });
});
