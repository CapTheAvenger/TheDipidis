/**
 * Eine Startseite, nicht zwei.
 *
 * Befund vom 26.08.2026, vom Nutzer gemeldet: „Wenn ich auf Übersicht
 * drücke, dann komme ich auf eine andere Startseite als wenn ich die Seite
 * generell aufrufe."
 *
 * Gemessen stimmte das:
 *   Aufruf von thedipidis.app  → Tab `current-meta` („Aktuelles Meta (Global)")
 *   Menüpunkt „Übersicht"      → Tab `meta-analysis-hub` (Kachelseite)
 *
 * Der Menüpunkt war als ELTERNEBENE von fünf Unterseiten gedacht — deshalb
 * war er beim Laden auch als aktiv markiert, obwohl die Seite eine Ebene
 * tiefer stand. Aus Nutzersicht sind das trotzdem zwei Antworten auf die
 * Frage „wo ist Zuhause".
 *
 * Entscheidung des Nutzers: „Vll nennen wir Übersicht einfach Startseite und
 * dann gehen wir dahin wo wir halt auch mit der Seite starten."
 *
 * Der Code trug diese Richtung ohnehin schon: der Kommentar in index.html
 * über `#metaAnswerTop` sagt „Seit die Meta-Ansicht die Startseite ist,
 * waere sie sonst der einzige Teil des Hubs, der verloren ginge" — das beste
 * Stück der Kachelseite („Was ist gerade stark?") steht längst auf der
 * Startseite, aus derselben Datei.
 *
 * Diese Zusicherungen halten fest, dass es bei EINER Startseite bleibt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HTML = lies('index.html');
const I18N = lies('js/i18n.js');

// Der Tab, der im Markup die Klasse `active` trägt, ist die Startseite:
// beim Aufruf ohne Hash läuft kein switchTab, die Auszeichnung entscheidet.
function startTab() {
    const m = HTML.match(/<div id="([a-z-]+)" class="tab-content active/);
    return m && m[1];
}

describe('Es gibt genau eine Startseite', () => {
    it('das Markup benennt sie eindeutig', () => {
        const treffer = HTML.match(/class="tab-content active/g) || [];
        assert.equal(treffer.length, 1,
            `${treffer.length} Tabs tragen "active" — dann entscheidet die Reihenfolge im DOM, welcher gewinnt`);
        assert.equal(startTab(), 'current-meta');
    });

    it('der Menüpunkt führt genau dorthin', () => {
        const zeile = HTML.split('\n').find(z => z.includes('id="menu-btn-meta-analysis-hub"'));
        assert.ok(zeile, 'der Menüeintrag fehlt');
        assert.match(zeile, new RegExp(`switchTabAndUpdateMenu\\('${startTab()}'\\)`),
            'der Menüpunkt zeigt woanders hin als die Startseite');
        assert.match(zeile, new RegExp(`data-tab-id="${startTab()}"`),
            'data-tab-id und onclick laufen auseinander — die Menü-Markierung wäre dann falsch');
    });

    it('er heißt auch so, in beiden Sprachen', () => {
        // „Übersicht" war der alte Name und versprach eine Ebene, die es so
        // nicht mehr gibt.
        assert.match(I18N, /'menu\.hub':\s*'Home',/);
        assert.match(I18N, /'menu\.hub':\s*'Startseite',/);
        assert.doesNotMatch(I18N, /'menu\.hub':\s*'Übersicht',/);
        assert.doesNotMatch(I18N, /'menu\.hub':\s*'Overview',/);
    });

    it('kein Knopf führt mehr auf die verwaiste Kachelseite', () => {
        // Fünf „← Übersicht"-Knöpfe in den Werkzeugen zeigten auf den Hub.
        // Wäre der aus dem Menü verschwunden und diese nicht, führten sie
        // auf eine Seite, die man nicht mehr verlassen kann.
        const offen = HTML.split('\n')
            .filter(z => z.includes('tool-back-btn') && z.includes('meta-analysis-hub'));
        assert.deepEqual(offen, [],
            'diese Zurück-Knöpfe zeigen noch auf die Kachelseite');
        const knoepfe = (HTML.match(/tool-back-btn/g) || []).length;
        assert.ok(knoepfe >= 5, `nur ${knoepfe} Zurück-Knöpfe gefunden — wurden welche entfernt?`);
    });

    it('die Zurück-Knöpfe zeigen auf dieselbe Startseite wie das Menü', () => {
        const ziele = new Set(HTML.split('\n')
            .filter(z => z.includes('tool-back-btn'))
            .map(z => (z.match(/switchTabAndUpdateMenu\('([a-z-]+)'\)/) || [])[1]));
        assert.deepEqual([...ziele], [startTab()],
            `Zurück-Knöpfe führen nach ${[...ziele].join('/')} statt zur Startseite`);
    });

    it('die Beschriftung der Zurück-Knöpfe kommt aus derselben Quelle wie der Menüpunkt', () => {
        // Sonst heißt es an einer Stelle „Startseite" und an der anderen
        // weiter „Übersicht", sobald jemand nur eine der beiden pflegt.
        assert.match(I18N, /'metaHub\.backToOverview':\s*'← Startseite',/);
        assert.match(I18N, /'metaHub\.backToOverview':\s*'← Home',/);
    });
});
