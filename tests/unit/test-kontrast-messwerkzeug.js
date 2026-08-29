/**
 * Das Muster, an dem eine ganze Messung gescheitert ist.
 *
 * Am 29.08.2026 wurde gemeldet: "Kontrastfehler in beiden Modi auf 0".
 * Das war falsch, und zwar nicht wegen der Seite, sondern wegen des
 * Messwerkzeugs. Es enthielt diese Zeile INNERHALB eines
 * Template-Literals, das an den Browser geschickt wurde:
 *
 *     const NUR = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u;
 *
 * In einem Template-Literal sind \p und \s keine gueltigen Escapes.
 * JavaScript wirft den Backslash weg. Im Browser kam an:
 *
 *     /[p{Emoji_Presentation}p{Extended_Pictographic}s...]+/u
 *
 * — eine Buchstabenklasse aus p, E, m, o, j, i, _, P, r, s, n, t, a,
 * x, d, c, g, h, { und }. Damit galt JEDES Wort, das nur aus diesen
 * Buchstaben besteht, als reines Zeichen und fiel aus der Messung:
 * "Proxy", "Standard", "Meta" und viele mehr. Der Proxy-Knopf der
 * Kartendatenbank stand 60-mal pro Seite auf 3,71:1 und wurde nie
 * gezaehlt.
 *
 * Die Lehre ist nicht "besser hinsehen", sondern: ein Messwerkzeug,
 * das nichts findet, muss beweisen, dass es etwas finden KANN. Diese
 * Datei haelt das Muster fest, damit es nicht zurueckkommt — und
 * prueft, dass die Seite die Stellen, die damals durchrutschten,
 * heute wirklich in Ordnung hat.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── WCAG-Kontrast ──────────────────────────────────────────────────
function leuchte({ r, g, b }) {
    const f = (c) => {
        const x = c / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function hex(h) {
    const s = h.replace('#', '');
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
function verhaeltnis(a, b) {
    const la = leuchte(hex(a)); const lb = leuchte(hex(b));
    const hi = Math.max(la, lb); const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}

describe('Das Muster, das die Messung blind gemacht hat', () => {
    it('\\p und \\s ueberleben ein Template-Literal nicht', () => {
        // Der Beweis, warum die Regel unten noetig ist — ohne ihn
        // klingt sie nach Aberglaube.
        const imLiteral = `[\p{Emoji_Presentation}\s]`;
        assert.ok(!imLiteral.includes('\\p'),
            'Wenn \\p hier ueberlebt, hat sich die Sprache geaendert und diese '
            + 'Zusage darf weg. Bis dahin gilt: nicht im Template-Literal.');
        assert.equal(imLiteral, '[p{Emoji_Presentation}s]',
            'das ist genau der Text, der damals im Browser ankam');
    });

    it('gegenprobe: ueber den Konstruktor gebaut kommt es heil an', () => {
        const re = new RegExp('^[\\p{Emoji_Presentation}\\p{Extended_Pictographic}\\s]+$', 'u');
        assert.ok(!re.test('Proxy'), 'Proxy ist ein Wort, kein Zeichen');
        assert.ok(!re.test('Standard'), 'Standard ist ein Wort, kein Zeichen');
        assert.ok(re.test('👍'), 'ein Emoji soll uebersprungen werden');
    });
});

describe('Die Stellen, die damals durchrutschten', () => {
    const UX = lies('css/ux-step1.css');
    const MC = lies('css/meta-call.css');
    const HOWTO = lies('css/profile-howto-info.css');

    function farbeAus(quelle, muster, was) {
        const m = quelle.match(muster);
        assert.ok(m, `${was} nicht mehr auffindbar`);
        return m[1];
    }

    it('der Gefahr-Knopf traegt weisse Schrift (jeder .btn-danger, .btn-gradient-red)', () => {
        // 60 Vorkommen allein in der Kartendatenbank, in BEIDEN Modi.
        const c = farbeAus(UX, /--ui-danger-start:\s*(#[0-9a-fA-F]{6})/, '--ui-danger-start');
        const v = verhaeltnis(c, '#ffffff');
        assert.ok(v >= 4.5, `weiss auf ${c} ergibt ${v.toFixed(2)}:1, noetig sind 4,5`);
    });

    it('die Rangfarben der Empfehlungstabelle tragen in BEIDEN Modi', () => {
        // Gold und Bronze sind Medaillenfarben — auf Weiss zu hell, im
        // Dunkelmodus zu dunkel. Es gibt keinen Wert, der beides kann;
        // deshalb muss es zwei geben.
        const hellGold = farbeAus(MC, /tr:nth-child\(1\) \.mc-rec-rank \{ color: (#[0-9a-fA-F]{6})/, 'Gold hell');
        const hellBronze = farbeAus(MC, /tr:nth-child\(3\) \.mc-rec-rank \{ color: (#[0-9a-fA-F]{6})/, 'Bronze hell');
        assert.ok(verhaeltnis(hellGold, '#ffffff') >= 4.5, `Gold hell: ${verhaeltnis(hellGold, '#ffffff').toFixed(2)}:1`);
        assert.ok(verhaeltnis(hellBronze, '#ffffff') >= 4.5, `Bronze hell: ${verhaeltnis(hellBronze, '#ffffff').toFixed(2)}:1`);
        assert.match(MC, /:root\[data-theme="dark"\] \.mc-rec-table tr:nth-child\(1\) \.mc-rec-rank/,
            'im Dunkelmodus fehlt die Gegenfarbe fuer Gold');
        assert.match(MC, /:root\[data-theme="dark"\] \.mc-rec-table tr:nth-child\(3\) \.mc-rec-rank/,
            'im Dunkelmodus fehlt die Gegenfarbe fuer Bronze');
    });

    it('Schrift und Flaeche des Tabellenkopfs gehoeren zusammen', () => {
        // Eine Regel, zwei Gruende — je nach Schachtelung mass dieselbe
        // Zeile einmal auf hellem, einmal auf dunklem Grund. Wer nur die
        // Schrift festlegt, ueberlaesst den Rest dem Zufall.
        const i = MC.indexOf('.mc-rec-table th {');
        assert.notEqual(i, -1, '.mc-rec-table th ist verschwunden');
        const block = MC.slice(i, MC.indexOf('}', i));
        assert.match(block, /background:/,
            'das th legt seine Schrift fest, aber nicht seinen Grund');
        assert.match(block, /color:/);
    });

    it('die Abzeichen der Anleitungs-Insel tragen weisse Schrift', () => {
        // Die Insel bleibt im Dunkelmodus absichtlich hell — ein zu
        // heller Abzeichengrund ist deshalb in BEIDEN Modi falsch.
        const faelle = [
            [/\.mockup-wt-card-art-actions span\.is-trade\s*\{ background: (#[0-9a-fA-F]{6})/, 'Tausch-Plus'],
            [/\.mockup-builder-btn--accent \.mockup-builder-btn-num \{ background: (#[0-9a-fA-F]{6})/, 'Builder-Zahl'],
        ];
        for (const [muster, name] of faelle) {
            const c = farbeAus(HOWTO, muster, name);
            const v = verhaeltnis(c, '#ffffff');
            assert.ok(v >= 4.5, `${name}: weiss auf ${c} ergibt ${v.toFixed(2)}:1`);
        }
    });
});
