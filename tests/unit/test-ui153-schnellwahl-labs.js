/**
 * UI-153 (Hausi, 27.10.2026): (1) Deck-Analyse: Sprites der Tier-1-bis-3-Decks als Schnellwahl-Knoepfe;
 * (2) "Day-2-Listen je Turnier": der Turniername fuehrt auf die Limitless-Labs-Seite des Decks
 * (labs.limitlesstcg.com/<Nr.>/decks/<slug>). Die Funktionen werden AUSGEFUEHRT (vm), nicht als Text geprueft.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKommentare = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

const JS = lies('js/app-current-meta-analysis.js');
const JS_TIER = lies('js/app-tier-meta.js');
const CSS = lies('css/deck-analyse.css');
const HTML = lies('index.html');

function schneide(quelle, name) {
    const t = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(t, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', t.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(t.index, i + 1);
    }
    throw new Error('Klammer nicht geschlossen: ' + name);
}
function laden(quelle, namen, extra = {}) {
    const ctx = vm.createContext(Object.assign({ window: {}, Date, Map, Set, Array, String, Math, isNaN, encodeURIComponent }, extra));
    vm.runInContext(namen.map((n) => schneide(quelle, n)).join('\n'), ctx);
    return ctx;
}
const NAMEN_QUICK = ['cmQuickWahlKnoepfe'];
const NAMEN_LABS = ['cmLabsReferenzenBauen', 'cmLabsTurnierName', 'cmLabsDatumIso', 'cmLabsLinkFuer'];

/* Das Datum liest die Seite mit parseEnglishTournamentDate; hier dieselbe Form: "24th October 2026". */
const MONATE = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const parseEnglishTournamentDate = (s) => {
    const m = /(\d+)(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})/i.exec(String(s || ''));
    return m ? new Date(+m[3], MONATE.indexOf(m[2].toLowerCase()), +m[1]) : null;
};
const TURNIERE = [
    { tournament_id: '0078', tournament_name: 'Regional Championship Puebla', tournament_date: '2026-10-24' },
    { tournament_id: '0077', tournament_name: 'Regional Championship Nice', tournament_date: '2026-10-17' },
    { tournament_id: '0076', tournament_name: 'Regional Championship Louisville', tournament_date: '2026-10-09' },
    { tournament_id: '0074', tournament_name: 'Regional Championship Frankfurt', tournament_date: '2026-09-26' },
    { tournament_id: '0073', tournament_name: 'Regional Championship Brisbane', tournament_date: '2026-09-26' }
];
const DECKS = [
    { deck_name: 'Sharpedo Toxtricity', deck_slug: 'sharpedo-toxtricity' },
    { deck_name: 'Okidogi', deck_slug: 'okidogi-ex' }, { deck_name: 'Okidogi', deck_slug: 'okidogi-twm' }
];

describe('UI-153 Schnellwahl: Knoepfe aus Tier-Einteilung und Auswahlfeld', () => {
    const c = laden(JS, NAMEN_QUICK);
    const gruppen = [
        { tier: 'tier-1', namen: ['Dragapult', 'Basic Box'] },
        { tier: 'tier-2', namen: ['Sharpedo Toxtricity', 'Gibt Es Nicht'] },
        { tier: 'tier-3', namen: ['Dragapult'] }
    ];
    it('nur Decks, die im Auswahlfeld stehen; Tier-Reihenfolge; keine Doppelten', () => {
        const k = c.cmQuickWahlKnoepfe(gruppen, ['Basic Box', 'Dragapult', 'Sharpedo Toxtricity'], '');
        assert.equal(JSON.stringify(k.map((x) => [x.wert, x.tier])), JSON.stringify([['Dragapult', 1], ['Basic Box', 1], ['Sharpedo Toxtricity', 2]]));
    });
    it('Schreibweise des Auswahlfelds gilt (Gross/Klein), das gewaehlte Deck ist aktiv', () => {
        const k = c.cmQuickWahlKnoepfe(gruppen, ['dragapult'], 'DRAGAPULT');
        assert.equal(k.length, 1);
        assert.equal(k[0].wert, 'dragapult');
        assert.equal(k[0].aktiv, true);
    });
    it('ohne Tier-Einteilung oder ohne Optionen: nichts', () => {
        assert.equal(c.cmQuickWahlKnoepfe(undefined, ['A'], '').length, 0);
        assert.equal(c.cmQuickWahlKnoepfe(gruppen, [], '').length, 0);
    });
});

describe('UI-153 Labs-Link: Turnier und Deck-Slug', () => {
    const c = laden(JS, NAMEN_LABS, { parseEnglishTournamentDate });
    const ref = c.cmLabsReferenzenBauen(TURNIERE, DECKS);
    it('Puebla + Sharpedo Toxtricity = der Link aus Hausis Auftrag', () => {
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional Puebla – Limitless', '24th October 2026', 'Sharpedo Toxtricity'),
            'https://labs.limitlesstcg.com/0078/decks/sharpedo-toxtricity');
    });
    it('zwei Turniere am selben Tag: der Name entscheidet', () => {
        assert.match(c.cmLabsLinkFuer(ref, 'Regional Frankfurt – Limitless', '26th September 2026', 'Sharpedo Toxtricity'), /\/0074\//);
        assert.match(c.cmLabsLinkFuer(ref, 'Regional Brisbane – Limitless', '26th September 2026', 'Sharpedo Toxtricity'), /\/0073\//);
    });
    it('ein Tag Abweichung (Limitless 10.10., Labs 09.10.) und Tippfehler im Namen: eindeutiger Treffer', () => {
        assert.match(c.cmLabsLinkFuer(ref, 'Regional Lousville, KY – Limitless', '10th October 2026', 'Sharpedo Toxtricity'), /\/0076\/decks\/sharpedo-toxtricity$/);
    });
    it('Deck-Name mit ZWEI Slugs: Turnier-Deckliste statt eines geratenen Slugs; unbekanntes Deck ebenso', () => {
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional Nice – Limitless', '17th October 2026', 'Okidogi'), 'https://labs.limitlesstcg.com/0077/decks');
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional Nice – Limitless', '17th October 2026', 'Unbekannt'), 'https://labs.limitlesstcg.com/0077/decks');
    });
    it('kein Turnier zum Datum, mehrdeutig ohne Namenstreffer, kaputtes Datum: kein Link', () => {
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional X', '1st March 2026', 'Okidogi'), '');
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional Irgendwo', '26th September 2026', 'Okidogi'), '');
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional Nice', 'kein Datum', 'Okidogi'), '');
        assert.equal(c.cmLabsLinkFuer({ turniere: [], slugs: new Map() }, 'Regional Nice', '17th October 2026', 'Okidogi'), '');
    });
});

describe('UI-153 Verdrahtung (Text, nur wo es WIRKLICH Text ist)', () => {
    it('Tier-Einteilung wird abgelegt und gemeldet', () => {
        const t = ohneKommentare(JS_TIER);
        assert.ok(/window\._cmTierGruppen\s*=/.test(t));
        assert.ok(/dispatchEvent\(new CustomEvent\('cm:tierGruppen'\)\)/.test(t));
    });
    it('Schnellwahl-Host im Markup, Knoepfe nicht voll breit, mindestens 44 px', () => {
        assert.ok(/id="cmQuickWahl"/.test(ohneKommentare(HTML)));
        const css = ohneKommentare(CSS);
        assert.ok(/#cmQuickWahl \.cm-qw-btn\s*\{[^}]*width:\s*auto\s*!important/.test(css));
        assert.ok(/#cmQuickWahl \.cm-qw-btn\s*\{[^}]*min-height:\s*44px/.test(css));
    });
    it('Labs-Link oeffnet in neuem Tab, ohne Opener', () => {
        const j = ohneKommentare(JS);
        assert.ok(/top256-labs-link[^`]*target="_blank" rel="noopener noreferrer"/.test(j));
    });
    it('Verfaelschungsprobe: ohne die Datums-Toleranz faellt Louisville durch', () => {
        const kaputt = JS.replace('Math.abs(d - t0) <= 86400000', 'false');
        assert.notEqual(kaputt, JS, 'Probe hat nichts ersetzt');
        const c = laden(kaputt, NAMEN_LABS, { parseEnglishTournamentDate });
        const ref = c.cmLabsReferenzenBauen(TURNIERE, DECKS);
        assert.equal(c.cmLabsLinkFuer(ref, 'Regional Lousville, KY – Limitless', '10th October 2026', 'Okidogi'), '');
    });
});
