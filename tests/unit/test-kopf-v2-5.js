'use strict';
/*
 * V2-5 Kopf (Abfragerunde 06.10.2026, claude/festlegungen.md Teil B):
 * „Pokéball = Menü, ‚The Dipidis‘ mit kleiner Kirschblüte, keine Pille,
 * kein Untertitel. Kurzwahl oben 6 Knöpfe: Journal, Meine Decks,
 * Wunschliste, Datenbank, Tauschliste, Profil. Hell/Dunkel und Sprache im
 * Menü.“ Hausi 06.10.: neben dem Pokéball stand ein zweiter Knopf, der
 * dasselbe Menü öffnete. Gelesen wird index.html OHNE Kommentare.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { lies } = require('./lib-dom-sandkasten.js');

const ohne = (q) => q.replace(/<!--[\s\S]*?-->/g, '');
const HTML = ohne(lies('index.html'));

function teile(html) {
    const kopfA = html.indexOf('<header class="header cards-header">');
    const kopfB = html.indexOf('</header>', kopfA);
    const kopf = html.slice(kopfA, kopfB);
    const mA = kopf.indexOf('id="mainMenuDropdown"');
    const mB = kopf.indexOf('<h1 class="header-title">');
    return { kopf, menue: kopf.slice(mA, mB), ausserMenue: kopf.slice(0, mA) + kopf.slice(mB) };
}

function pruefe(html) {
    const t = teile(html);
    const oeffner = (t.ausserMenue.match(/onclick="toggleMainMenu\(\)"/g) || []).length;
    assert.equal(oeffner, 1, 'genau EIN Menue-Oeffner im Kopf (der Pokeball), gefunden ' + oeffner);
    assert.match(t.ausserMenue, /id="mainMenuTrigger"[^>]*onclick="toggleMainMenu\(\)"/);
    for (const ziel of [/openBattleJournalSheet\(\)/, /openProfileSection\('decks'\)/, /openProfileSection\('wishlist'\)/,
        /openProfileSection\('tradelist'\)/, /switchTabAndUpdateMenu\('cards'\)/, /switchTabAndUpdateMenu\('profile'\)/]) {
        assert.match(t.ausserMenue, ziel, 'Kurzwahl fehlt: ' + ziel);
    }
    assert.match(t.menue, /id="themeToggleBtn"/, 'Hell/Dunkel gehoert ins Menue');
    assert.match(t.menue, /id="langToggleBtn"/, 'Sprache gehoert ins Menue');
    assert.doesNotMatch(t.ausserMenue, /id="themeToggleBtn"|id="langToggleBtn"/);
    assert.doesNotMatch(t.kopf, /class="header-subtitle"/, 'kein Untertitel');
    assert.match(t.kopf, /id="current-tab-title" class="current-tab-badge" hidden/, 'keine sichtbare Pille');
    assert.match(t.kopf, /class="kopf-bluete"/, 'kleine Kirschbluete neben dem Namen');
}

describe('V2-5 Kopf: ein Menue, sechs Kurzwahlknoepfe, Schalter im Menue', () => {
    it('index.html haelt die Festlegung', () => pruefe(HTML));
    it('VERFAELSCHUNG: ein zweiter Oeffner neben dem Pokeball faellt auf', () => {
        const kaputt = HTML.replace('<div id="mainMenuDropdown"', '<button class="x" onclick="toggleMainMenu()">☰</button><div id="mainMenuDropdown"');
        assert.notEqual(kaputt, HTML);
        assert.throws(() => pruefe(kaputt), /genau EIN Menue-Oeffner/);
    });
    it('VERFAELSCHUNG: Sprachknopf zurueck im Kopf faellt auf', () => {
        const ohneLang = HTML.replace(/<button id="langToggleBtn"[^]*?<\/button>/, '');
        const kaputt = ohneLang.replace('<button id="battleJournalFab"', '<button id="langToggleBtn">EN</button><button id="battleJournalFab"');
        assert.notEqual(kaputt, HTML);
        assert.throws(() => pruefe(kaputt));
    });
    it('CSS: Beschriftungen der Kurzwahl nur fuer Vorleser, Grossbluete aus', () => {
        const css = lies('css', 'cards-header.css').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.match(css, /#main-content > \.cards-header \.header-icon-label \{[^}]*clip: rect\(0, 0, 0, 0\)/);
        assert.match(css, /#main-content > \.cards-header::after \{ display: none; \}/);
    });
});
