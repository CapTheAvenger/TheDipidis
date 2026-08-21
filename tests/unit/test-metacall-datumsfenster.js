/**
 * Das Datumsfenster der Meta Call sprach zwei Sprachen zugleich.
 *
 * Drei Befunde an einem Bedienelement:
 *   1. Der Hinweis darunter zeigte das Datum als ISO-Zeichenkette
 *      ("Aktives Fenster: Daten ≥ 2026-07-24"), waehrend jede andere
 *      Datumsangabe der Seite in der Sprachkonvention steht.
 *   2. Das Feld trug keinen Format-Titel — die drei anderen
 *      Datumsfelder (City League von/bis, Aktuelles Meta) tragen alle
 *      data-i18n-title="tip.dateFormat".
 *   3. Der Knopf daneben hiess hart "Clear", mitten in einer deutschen
 *      Oberflaeche.
 *
 * Was der Browser selbst in das <input type="date"> zeichnet, laesst
 * sich nicht steuern — ein englisch eingestellter Browser zeigt dort
 * mm/dd/yyyy. Genau deshalb muss alles DANEBEN eindeutig sein.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MC = lies('js/app-meta-call.js');

function datumLesbar(sprache) {
    // Den Formatierer aus der Quelle ziehen und wirklich ausfuehren.
    const a = MC.indexOf('const _datumLesbar = (iso) => {');
    assert.ok(a >= 0, '_datumLesbar nicht gefunden');
    const b = MC.indexOf('\n    };', a);
    assert.ok(b > a, 'Ende von _datumLesbar nicht gefunden');
    const quelle = MC.slice(a, b + 7);
    // eslint-disable-next-line no-new-func
    return new Function('getLang', quelle + '\nreturn _datumLesbar;')(() => sprache);
}

describe('Meta Call — Datumsfenster', () => {

    it('schreibt das Datum im Hinweis in der Seitensprache', () => {
        assert.equal(datumLesbar('de')('2026-07-24'), '24.07.2026');
        assert.equal(datumLesbar('en')('2026-07-24'), '24/07/2026');
    });

    it('reicht unbrauchbare Werte unveraendert durch, statt etwas zu erfinden', () => {
        const f = datumLesbar('de');
        assert.equal(f(''), '');
        assert.equal(f(null), '');
        assert.equal(f('demnaechst'), 'demnaechst');
    });

    it('der Hinweistext nutzt den Formatierer und nicht mehr die ISO-Kette', () => {
        assert.match(MC, /dateWindowActive'\)\.replace\('\{date\}', _datumLesbar\(_dateValue\)\)/);
        assert.match(MC, /dateWindowAuto'\)\.replace\('\{date\}', _datumLesbar\(_autoCutoff\)\)/);
    });

    it('das Feld traegt denselben Format-Titel wie die anderen Datumsfelder', () => {
        const feld = /<input type="date" id="metacallDateFrom"[\s\S]*?>/.exec(MC);
        assert.ok(feld, 'Datumsfeld nicht gefunden');
        assert.match(feld[0], /data-i18n-title="tip\.dateFormat"/);

        // Gegenprobe: alle vier Datumsfelder der Seite tragen ihn.
        const html = lies('index.html');
        const felder = [...html.matchAll(/<input type="date"[^>]*>/g)].map(m => m[0]);
        assert.ok(felder.length >= 3, `nur ${felder.length} Datumsfelder in index.html`);
        felder.forEach(f => assert.match(f, /data-i18n-title="tip\.dateFormat"/,
            `Datumsfeld ohne Format-Titel: ${f}`));
    });

    it('der Knopf daneben ist uebersetzt', () => {
        assert.doesNotMatch(MC, /metacall-date-clear[\s\S]{0,240}>Clear<\/button>/,
            'der harte englische Text steht noch da');
        assert.match(MC, /metacall-date-clear[\s\S]{0,240}\$\{esc\(t\('btn\.clear'\)\)\}<\/button>/);
        const i18n = lies('js/i18n.js');
        assert.match(i18n, /'btn\.clear':\s*'Leeren',/, 'deutsche Entsprechung fehlt');
    });
});
