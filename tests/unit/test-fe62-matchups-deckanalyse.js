'use strict';
/*
 * FE-62 (Abfragerunde 06.10.2026): in der Deck-Analyse stehen alle
 * Matchups des gewaehlten Decks in EINER Tabelle, schlechteste oben,
 * Koepfe sortierbar. Die Funktion matchupTableHtml wird AUSGEFUEHRT.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');
const CARD_SRC = lies('js/app-archetype-card.js');
const ohne = (q) => q.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function laden(src) {
    const sb = {
        console,
        document: { addEventListener() {}, getElementById: () => null,
            createElement: () => ({ classList: { add() {}, remove() {} }, addEventListener() {} }),
            body: { classList: { add() {}, remove() {} }, appendChild() {} } },
        getLang: () => 'de', t: (k) => k,
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/',
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(src, sb);
    sb._matchupRegistry = { Dragapult: {
        A: { opponent_deck: 'Alakazam', win_rate_numeric: 61.8, record: '267 - 165 - 6', total_games: 438 },
        B: { opponent_deck: 'Crustle', win_rate_numeric: 40.0, record: '40 - 60 - 0', total_games: 100 },
        C: { opponent_deck: 'Slowking', win_rate_numeric: 52.0, record: '5 - 4 - 0', total_games: 9 },
    } };
    return sb._archetypeCardInternals;
}
const gegnerReihenfolge = (html) => [...html.matchAll(/<td class="arc-mu-opp">([^<]*)<\/td>/g)].map(m => m[1]);

describe('FE-62: Matchups in der Deck-Analyse', () => {
    const api = laden(CARD_SRC);
    const html = api.matchupTableHtml('Dragapult', { sortierbar: true, schlechtesteOben: true, variante: 'embed' });
    it('alle Paarungen, schlechteste oben', () => {
        assert.deepEqual(gegnerReihenfolge(html), ['Crustle', 'Slowking', 'Alakazam']);
    });
    it('Koepfe sind Sortierknoepfe, WR startet aufsteigend', () => {
        assert.match(html, /<table class="arc-mu-table arc-mu-sortierbar">/);
        const koepfe = html.match(/<th class="arc-mu-sort" role="button" tabindex="0" data-spalte="\d+"/g) || [];
        assert.ok(koepfe.length >= 6, 'Koepfe: ' + koepfe.length);
        assert.match(html, /data-spalte="1" aria-sort="ascending"/);
    });
    it('Tier-Karte bleibt beste-zuerst und ohne Sortierknoepfe', () => {
        const tier = api.matchupTableHtml('Dragapult', {});
        assert.equal(gegnerReihenfolge(tier)[0], 'Alakazam');
        assert.doesNotMatch(tier, /arc-mu-sort/);
    });
    it('kleine Stichproben bleiben grau markiert (Slowking, 9 Matches)', () => {
        assert.match(html, /<td class="arc-mu-n arc-mu-n-low">9<\/td>/);
    });
    it('Zellwerte: Prozent, Tausender, Strich', () => {
        const td = (t) => ({ textContent: t });
        assert.equal(api.zellWert(td('45,5 %')), 45.5);
        assert.equal(api.zellWert(td('1.234')), 1234);
        assert.equal(api.zellWert(td('–')), null);
        assert.equal(api.zellWert(td('Crustle')), 'crustle');
    });
    it('Verdrahtung: Deck-Analyse ruft die Tabelle, Abschnitt in beiden Ansichten', () => {
        const cm = ohne(lies('js/app-current-meta-analysis.js'));
        assert.match(cm, /renderCurrentMetaMatchups\(archetype\);\s*zeigeCmMatchupTabelle\(archetype\);/);
        const idx = ohne(lies('index.html'));
        assert.match(idx, /<div id="currentMetaMatchupsSection" class="d-none mb-40 bg-light px-30 br-8">/);
        assert.match(idx, /id="currentMetaMatchupTabelle"/);
    });
    it('VERFAELSCHUNG: ohne schlechteste-oben steht das beste Matchup vorn', () => {
        const kaputt = CARD_SRC.replace('all.slice().sort((a, b) => a.winRate - b.winRate)', 'all');
        assert.notEqual(kaputt, CARD_SRC);
        const k = laden(kaputt).matchupTableHtml('Dragapult', { sortierbar: true, schlechtesteOben: true });
        assert.throws(() => assert.deepEqual(gegnerReihenfolge(k), ['Crustle', 'Slowking', 'Alakazam']));
    });
});
