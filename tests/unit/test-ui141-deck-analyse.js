/**
 * UI-141 (Hausi 15.10.2026, sechs iPhone-Screenshots, Deck-Analyse):
 * „Der Startbereich sieht nicht geil aus … die Matchup-Tabelle ist zu lang,
 * Top 3 Threats und den Rest aufklappbar … die Karten sind zu groß, man muss
 * ewig scrollen … wie unten im Deck, drei Bilder nebeneinander und die Daten
 * auf den Karten drauf."
 *
 * GEMESSEN VORHER (Playwright 390 px, Sharpedo Toxtricity): Kopf 632 px bis zur
 * ersten Zahl, Matchups 4.440 px (27 Kartenlisten), Kartenuebersicht 8.342 px
 * (2 je Zeile), Deck Builder bei 14.506 px. NACHHER: Kopf ~400 px, Matchups
 * ~1.500 px (3 Zeilen + Knopf), Karten ~2.900 px (3 je Zeile), Deck Builder bei
 * ~5.800 px.
 *
 * ZUSICHERUNG: (1) matchupTableHtml wird AUSGEFUEHRT: mit vorschauZeilen tragen
 * Rahmen und Knopf die Kuerzung, alle Zeilen bleiben im DOM, muRestUmschalten
 * klappt um; (2) die 3 steht in JS und CSS gleich; (3) die Filterleiste und
 * die Kartenfilter sind Pillen (.ds-filter-btn), ohne .btn-primary; (4) das
 * Kartengitter der Deck-Analyse hat am Telefon drei Spalten und die Daten
 * AUF dem Bild; (5) die alten Teiltabellen bleiben am Telefon unsichtbar.
 * Jede Textregel hat ihre Verfaelschungsprobe.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');
const ohneKommentare = (s) => s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CARD_SRC = lies('js/app-archetype-card.js');
const CSS_ROH = lies('css/deck-analyse.css');
const CSS = ohneKommentare(CSS_ROH);
assert.ok(CSS.length > CSS_ROH.length * 0.3, 'das Ausschneiden hat zu viel entfernt (CSS)');
const HTML = ohneKommentare(lies('index.html'));
const kopf = () => {
    const a = HTML.indexOf('<div id="current-analysis"');
    return HTML.slice(a, HTML.indexOf('id="currentAnalysisEmptyState"', a));
};
const kartenKopf = () => {
    const a = HTML.indexOf('id="currentMetaCardsSection"');
    return HTML.slice(a, HTML.indexOf('<details class="ds-legend">', a));
};

/* ── Die Matchup-Funktion, ausgefuehrt (wie test-fe62-matchups-deckanalyse.js) ── */
function laden(src, mitRegister) {
    const register = {};
    const sb = {
        console,
        document: { addEventListener() {}, getElementById: () => null,
            createElement: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
            body: { classList: { add() {}, remove() {} }, appendChild() {} } },
        getLang: () => 'de', t: (k) => k,
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/',
    };
    if (mitRegister) {
        sb.DsAbschnittInfo = { melde: (id, e) => { register[id] = e; }, hat: (id) => !!register[id], knopfHtml: () => '<button class="ds-abschnitt-info"></button>' };
    }
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(src, sb);
    sb._matchupRegistry = { Dragapult: {
        A: { opponent_deck: 'Alakazam', win_rate_numeric: 61.8, record: '267 - 165 - 6', total_games: 438 },
        B: { opponent_deck: 'Crustle', win_rate_numeric: 40.0, record: '40 - 60 - 0', total_games: 100 },
        C: { opponent_deck: 'Slowking', win_rate_numeric: 52.0, record: '5 - 4 - 0', total_games: 9 },
        D: { opponent_deck: 'Gengar', win_rate_numeric: 45.0, record: '45 - 55 - 0', total_games: 100 },
        E: { opponent_deck: 'Greninja', win_rate_numeric: 58.0, record: '58 - 42 - 0', total_games: 100 },
    } };
    return { api: sb._archetypeCardInternals, register };
}
const gegner = (html) => [...html.matchAll(/<td class="arc-mu-opp">([^<]*)<\/td>/g)].map(m => m[1]);

describe('UI-141: Matchups — die schlechtesten 3, der Rest hinter einem Knopf', () => {
    const { api } = laden(CARD_SRC, false);
    const html = api.matchupTableHtml('Dragapult', { sortierbar: true, schlechtesteOben: true, variante: 'embed', vorschauZeilen: api.MU_VORSCHAU_ZEILEN });

    it('die Vorschau ist 3 Zeilen lang — in JS und im CSS (nth-child(n+4))', () => {
        assert.equal(api.MU_VORSCHAU_ZEILEN, 3);
        assert.match(CSS, /\.arc-mu-vorschau table\.arc-mu-table:not\(\.arc-mu-alle\) tbody tr:nth-child\(n\+4\) \{ display: none; \}/);
    });
    it('alle fuenf Zeilen stehen im DOM, schlechteste oben; Rahmen und Knopf tragen die Kuerzung', () => {
        assert.deepEqual(gegner(html), ['Crustle', 'Gengar', 'Slowking', 'Greninja', 'Alakazam']);
        assert.match(html, /<div class="mobile-table-scroll arc-mu-vorschau" data-vorschau="3">/);
        assert.match(html, /<button type="button" class="arc-mu-mehr-zeilen" aria-expanded="false"[^>]*>Alle 5 Matchups anzeigen<\/button>/);
        assert.match(html, /data-weniger="Nur die 3 schlechtesten"/);
        // die Tabellenklasse bleibt, wie FE-62 sie verlangt
        assert.match(html, /<table class="arc-mu-table arc-mu-sortierbar">/);
    });
    it('ohne vorschauZeilen (Tier-Karte, Ueberlagerung) gibt es keinen Knopf und keine Kuerzung', () => {
        const tier = api.matchupTableHtml('Dragapult', { sortierbar: true, schlechtesteOben: true, variante: 'embed' });
        assert.doesNotMatch(tier, /arc-mu-vorschau|arc-mu-mehr-zeilen/);
    });
    it('mit 3 oder weniger Matchups wird nichts gekuerzt', () => {
        const { api: a3 } = laden(CARD_SRC.replace("E: { opponent_deck: 'Greninja'", "E_weg: { opponent_deck: 'Greninja'"), false);
        a3.setData && 0;
        const wenig = api.matchupTableHtml('Dragapult', { variante: 'embed', vorschauZeilen: 5 });
        assert.doesNotMatch(wenig, /arc-mu-vorschau|arc-mu-mehr-zeilen/);
    });
    it('muRestUmschalten klappt auf und zu — an der Tabelle, damit kein-querscroll.js die Liste neu baut (ausgefuehrt)', () => {
        const klassen = new Set(['arc-mu-table', 'arc-mu-sortierbar']);
        const tabelle = { classList: { contains: (k) => klassen.has(k), toggle: (k) => { if (klassen.has(k)) { klassen.delete(k); return false; } klassen.add(k); return true; } } };
        const rahmenKlassen = new Set(['mobile-table-scroll', 'arc-mu-vorschau']);
        const rahmen = { classList: { contains: (k) => rahmenKlassen.has(k) }, querySelector: (s) => s === 'table.arc-mu-table' ? tabelle : null };
        const attr = { 'data-alle': 'Alle 5 Matchups anzeigen', 'data-weniger': 'Nur die 3 schlechtesten', 'aria-expanded': 'false' };
        const knopf = { previousElementSibling: rahmen, getAttribute: (k) => attr[k], setAttribute: (k, v) => { attr[k] = v; }, textContent: attr['data-alle'] };
        assert.equal(api.muRestUmschalten(knopf), true);
        assert.ok(klassen.has('arc-mu-alle'));
        assert.equal(knopf.textContent, 'Nur die 3 schlechtesten');
        assert.equal(attr['aria-expanded'], 'true');
        assert.equal(api.muRestUmschalten(knopf), false);
        assert.ok(!klassen.has('arc-mu-alle'));
        assert.equal(knopf.textContent, 'Alle 5 Matchups anzeigen');
        assert.ok(!rahmenKlassen.has('arc-mu-alle'), 'der Rahmen bleibt unberuehrt');
        // ein Knopf ohne Vorschau-Rahmen davor tut nichts
        assert.equal(api.muRestUmschalten({ previousElementSibling: null }), false);
        // die Signatur von kein-querscroll.js liest table.className — gelesen
        assert.match(ohneKommentare(lies('js/kein-querscroll.js')), /var teile = \[table\.className\];/);
    });
    it('Legende und Hinweise gehen ans Register, wenn es eines gibt — sonst bleiben sie stehen', () => {
        const { api: mit, register } = laden(CARD_SRC, true);
        const h = mit.matchupTableHtml('Dragapult', { variante: 'embed', vorschauZeilen: 3 });
        assert.doesNotMatch(h, /arc-mu-legende|arc-mu-note/, 'die Absaetze stehen trotz Register unter der Tabelle');
        assert.ok(register[mit.MU_HINWEISE_ID], 'nichts gemeldet');
        assert.match(register[mit.MU_HINWEISE_ID].html, /arc-mu-legende/);
        assert.match(html, /arc-mu-legende/, 'ohne Register fehlt die Legende ganz');
        // die Deck-Analyse setzt den Knopf in die Ueberschrift
        const cm = ohneKommentare(lies('js/app-current-meta-analysis.js'));
        assert.match(cm, /AI\.hat\('arc-mu-hinweise-embed'\)[\s\S]{0,200}titel\.insertAdjacentHTML\('beforeend', ' ' \+ AI\.knopfHtml\('arc-mu-hinweise-embed'/);
    });
    it('die Deck-Analyse ruft die Tabelle mit der Vorschau auf', () => {
        assert.match(ohneKommentare(CARD_SRC), /matchupTableHtml\(name, \{ sortierbar: true, schlechtesteOben: true, variante: 'embed', vorschauZeilen: MU_VORSCHAU_ZEILEN \}\)/);
    });
    it('Verfaelschungsprobe: Kuerzung im CSS auf 4 Zeilen → die JS/CSS-Kopplung faellt um', () => {
        const kaputt = CSS.replace('tr:nth-child(n+4)', 'tr:nth-child(n+5)');
        assert.notEqual(kaputt, CSS);
        assert.throws(() => assert.match(kaputt, /tbody tr:nth-child\(n\+4\) \{ display: none; \}/));
    });
    it('Verfaelschungsprobe: ohne die Klasse am Rahmen gaebe es keinen Umschalter', () => {
        const k = CARD_SRC.replace("' arc-mu-vorschau' : ''", "'' : ''");
        assert.notEqual(k, CARD_SRC);
        const h = laden(k, false).api.matchupTableHtml('Dragapult', { variante: 'embed', vorschauZeilen: 3 });
        assert.throws(() => assert.match(h, /class="mobile-table-scroll arc-mu-vorschau"/));
    });
});

/* ── Filterleiste und Kartenfilter: Pillen ─────────────────────────── */
describe('UI-141: Kopf der Deck-Analyse', () => {
    const k = kopf();
    it('Deckwahl allein, Filterleiste danach, ohne Speichern-Knopf', () => {
        assert.ok(k.indexOf('class="controls cm-deckwahl"') < k.indexOf('class="cm-filterleiste cm-nach-wahl"'));
        assert.doesNotMatch(k, /btn-deck-uebernehmen|deckUebernehmen/);
        assert.doesNotMatch(k, /class="controls cm-filterleiste/, 'mit .controls werden die Pillen 100 % breit (styles.css, 480 px)');
        assert.doesNotMatch(k, /class="[^"]*\bds-filter\b[^"]*cm-filterleiste/, 'js/ds-filter.js ersetzt ein .ds-filter-Geschwister');
    });
    it('Ansicht, Turniere und Seltenheit/Typ sind Pillen (.ds-filter-btn) — kein btn-primary mehr', () => {
        for (const id of ['cmViewModeVanillaBtn', 'cmViewModeDeepDiveBtn', 'currentMetaFilterAll', 'currentMetaFilterLive', 'currentMetaFilterPlay']) {
            const m = k.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`)) || k.match(new RegExp(`<button[^>]*(?=[^>]*id="${id}")[^>]*>`));
            assert.ok(m, id);
            assert.match(m[0], /class="[^"]*\bds-filter-btn\b/, id + ' ist keine Pille');
            assert.doesNotMatch(m[0], /btn-primary|btn-secondary/, id);
        }
        const kk = kartenKopf();
        for (const id of ['currentMetaOverviewTypeAll', 'currentMetaOverviewRarityMin', 'currentMetaOverviewRarityAll']) {
            const m = kk.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`)) || kk.match(new RegExp(`<button[^>]*(?=[^>]*id="${id}")[^>]*>`));
            assert.ok(m, id);
            assert.match(m[0], /class="[^"]*\bds-filter-btn\b/, id);
            assert.doesNotMatch(m[0], /btn-toggle-item|btn-success/, id);
        }
        assert.match(k, /<div class="ds-filter-seg current-meta-format-btns">/);
        assert.match(kk, /class="current-meta-cards-type-filter ds-filter-seg"/);
        assert.match(kk, /class="current-meta-cards-rarity-toggle ds-filter-seg"/);
    });
    it('die Umschaltfunktionen setzen is-on statt btn-primary (gelesen)', () => {
        const cm = ohneKommentare(lies('js/app-current-meta-analysis.js'));
        assert.match(cm, /btn\.classList\.remove\('btn-secondary', 'btn-primary'\);\s*btn\.classList\.toggle\('is-on', isActive\);/);
        assert.doesNotMatch(cm, /btn\.classList\.toggle\('btn-primary'/);
        assert.match(cm, /vanillaBtn\.classList\.toggle\('is-on', next === 'vanilla'\)/);
        assert.match(cm, /deepBtn\.classList\.toggle\('is-on', next === 'deepDive'\)/);
    });
    it('die Pille kennt die Zustandsklassen der Umschalter (css/components.css)', () => {
        const comp = ohneKommentare(lies('css/components.css'));
        assert.match(comp, /\.ds-filter-btn\.btn-active,\s*\.ds-filter-btn\.active,\s*\.ds-filter-btn\.is-active \{/);
        assert.match(comp, /\.ds-filter-btn\.btn-inactive \{/);
    });
    it('Statuszeilen bleiben im DOM, aber unsichtbar', () => {
        assert.match(k, /id="currentMetaFilterStatus"[^>]*hidden/);
        assert.match(CSS, /#current-analysis #currentMetaFilterStatus,\s*#current-analysis #currentMetaDateStatus \{ display: none; \}/);
    });
});

/* ── Kartenkacheln: drei je Zeile, Daten auf dem Bild ──────────────── */
describe('UI-141: Kartenuebersicht am Telefon', () => {
    const mobil = () => {
        const i = CSS.indexOf('.card-grid.deck-grid-skeleton-grid');
        assert.ok(i > 0); return CSS.slice(i);
    };
    it('drei Spalten unter 480 px, Infoleiste absolut auf dem Bild, Name/Set/Zaehler weg', () => {
        const m = mobil();
        assert.match(m, /@media \(max-width: 480px\) \{\s*\.card-grid\.deck-grid-skeleton-grid,\s*\.deck-grid-skeleton-grid \{\s*grid-template-columns: repeat\(3, 1fr\) !important;/);
        assert.match(m, /\.deck-grid-skeleton-grid \.card-item \.city-league-card-info-bottom \{[^}]*position: absolute !important;[^}]*bottom: 4px !important;/);
        assert.match(m, /\.deck-grid-skeleton-grid \.city-league-card-title-mobile,\s*\.deck-grid-skeleton-grid \.city-league-card-set-mobile,\s*\.deck-grid-skeleton-grid \.city-league-card-deck-stats-mobile \{ display: none !important; \}/);
        // Prozent und Ø bleiben — das ist das Band „100,0% Ø 3,43x" wie in „Dein Deck"
        assert.match(m, /\.deck-grid-skeleton-grid \.city-league-card-stats-mobile,\s*\.deck-grid-skeleton-grid \.city-league-card-avg-mobile \{\s*display: inline;/);
    });
    it('die Knopf-Legende spannt ueber alle Spalten', () => {
        assert.match(CSS, /#currentMetaDeckGrid \.karten-knopf-legende \{ grid-column: 1 \/ -1;/);
    });
    it('die alten Teiltabellen bleiben auch am Telefon unsichtbar (!important gegen mobile-responsive.css)', () => {
        const mu = ohneKommentare(lies('css/current-meta-matchups.css'));
        assert.match(mu, /#currentMetaMatchupsSection \.current-meta-matchups-grid-container\[hidden\] \{ display: none !important; \}/);
    });
    it('Verfaelschungsprobe: zwei Spalten oder Infoleiste im Fluss fallen auf', () => {
        const zwei = CSS.replace('grid-template-columns: repeat(3, 1fr) !important;', 'grid-template-columns: repeat(2, 1fr) !important;');
        assert.notEqual(zwei, CSS);
        assert.throws(() => assert.match(zwei, /repeat\(3, 1fr\) !important;/));
        const fluss = CSS.replace('position: absolute !important;', 'position: relative !important;');
        assert.notEqual(fluss, CSS);
        assert.throws(() => assert.match(fluss, /city-league-card-info-bottom \{[^}]*position: absolute !important;/));
    });
    it('das Stylesheet ist eingebunden und im Service Worker', () => {
        assert.match(lies('index.html'), /<link rel="stylesheet" href="css\/deck-analyse\.css\?v=/);
        assert.match(lies('service-worker.js'), /'\.\/css\/deck-analyse\.css'/);
    });
});
