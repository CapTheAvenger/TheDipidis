/**
 * Audit 2, Gruppe A — F21: Das Top-Cards-Widget teilt durch die Zahl der
 * ARCHETYPEN (gemessen 21.08.2026: 60), beschriftet die Prozente aber mit
 * "der Decks" / "Decks" — was 26.319 Decklisten suggeriert. Die Berechnung
 * bleibt; die Beschriftung muss "Archetypen" heissen und den Nenner (60)
 * einmal ausweisen.
 *
 * renderTopCardsWidget wird wörtlich aus der Quelle geschnitten und mit
 * Attrappen ausgeführt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');

const a = SRC.indexOf('function renderTopCardsWidget(topCards)');
const b = SRC.indexOf('async function renderCurrentMetaTopCards');
assert.ok(a > -1 && b > a, 'renderTopCardsWidget-Schnitt fehlgeschlagen');
const fnSrc = SRC.slice(a, b);

function build(lang) {
    const globals = {
        t: (k) => (k === 'tier.mostUsedCards' ? 'Meistgespielte Karten' : k),
        getLang: () => lang,
        fmtPct: (v) => String(v) + '%',
        escapeHtml: (s) => String(s == null ? '' : s),
        escapeJsStr: (s) => String(s == null ? '' : s),
        // Seit dem Druck-Umschalter liest das Widget zwei weitere freie
        // Namen: die Zahl der gezeigten Karten und den gemerkten Modus.
        ladeStaplesAnzahl: () => 15,
        staplesAnzahl: () => 15,
        STAPLES_STUFEN: [15, 30],
        ladeStaplesModus: () => 'gespielt',
        // Seit dem 01.09.2026 meldet das Widget seinen Nenner an den
        // Datenumfang, statt ihn selbst als Untertitel zu drucken.
        window: { DsDatenumfang: { ergaenze: (d) => gemeldet.push(d) } },
    };
    // Als Ausdruck bauen, damit die Attrappen als Parameter im Gültigkeits-
    // bereich der Funktion liegen (die Funktion nutzt sie als freie Namen).
    const factory = new Function(
        ...Object.keys(globals),
        fnSrc + '\nreturn renderTopCardsWidget;'
    );
    return factory(...Object.values(globals));
}

const gemeldet = [];

function cards() {
    const arr = [
        { name: 'Night Stretcher', global_share: 100.0, deck_inclusion_count: 60, set_code: 'SVI', set_number: '157' },
        { name: 'Ultra Ball', global_share: 96.7, deck_inclusion_count: 58, set_code: 'SVI', set_number: '196' },
    ];
    arr.totalArchetypes = 60; // der echte Nenner
    return arr;
}

describe('F21 — Top-Cards nennen Archetypen, nicht Decks', () => {
    it('deutsch: "der Archetypen" / "Archetypen" und der Nenner steht', () => {
        const render = build('de');
        const html = render(cards());
        assert.match(html, /der Archetypen/, 'Prozent-Label sagt nicht "der Archetypen"');
        assert.match(html, /58 Archetypen/, 'Zähl-Label sagt nicht "Archetypen"');
        // DER NENNER STEHT SEIT DEM 01.09.2026 NICHT MEHR IM WIDGET.
        // Gemeldet: "Und ich glaube, dieses 'von 60 Archetypen mit
        // Decklists', das brauchen wir auch nicht."
        // Er darf die Flaeche verlassen, aber nicht die Seite: die Seite
        // weist an anderer Stelle 133 Archetypen aus, und ohne die 60
        // daneben liest sich "100 % der Archetypen" als 133 von 133.
        // Also wird er an den Datenumfang gemeldet und erscheint unter
        // Quellen & Methodik. Geprueft wird beides — weg von hier UND
        // angekommen dort.
        assert.ok(!/von 60 Archetypen/.test(html), 'der Untertitel ist zurueck');
        assert.ok(gemeldet.some(d => d && d.staplesArchetypen === 60),
            'der Nenner wird nicht mehr an den Datenumfang gemeldet');
        // Die alte, irreführende Beschriftung darf nicht mehr auftauchen.
        assert.ok(!/der Decks/.test(html), 'noch "der Decks"');
        assert.ok(!/\d+ Decks/.test(html), 'noch "<n> Decks"');
    });

    it('englisch: "of archetypes" / "archetypes" und der Nenner steht', () => {
        const render = build('en');
        const html = render(cards());
        assert.match(html, /of archetypes/);
        assert.match(html, /58 archetypes/);
        assert.ok(!/of 60 archetypes/.test(html));
        assert.ok(!/of decks/.test(html));
        assert.ok(gemeldet.some(d => d && d.staplesArchetypen === 60));
    });
});
