/**
 * Englische Ueberschriften auf einer deutschen Seite.
 *
 * GESEHEN am 19.08.2026 in der Live-Ansicht, Sprache Deutsch:
 *
 *   "Top Archetypes"                    Ueberschrift ueber den Top-Decks
 *   "Matchup Heatmap"                   Ueberschrift der Heatmap
 *   "Most Used Cards (Format Staples)"  Ueberschrift der Kartenliste
 *   "Search archetype…"                 Platzhalter im Suchfeld
 *   "Tier 1 Meta Dominators"            Banner der Tier-Liste
 *
 * Die Ursachen waren zwei verschiedene, und das ist der Punkt dieser Datei:
 *
 * 1. FEST VERDRAHTET. "Most Used Cards (Format Staples)", der Platzhalter,
 *    das aria-label und alle vier Tier-Untertitel standen als Literale in
 *    js/app-tier-meta.js und liefen nie durch t(). Sie konnten in keiner
 *    Sprache etwas anderes werden.
 *
 *    Die Tier-Untertitel standen dabei ZWEIMAL im selben File, in zwei
 *    getrennten tierTitles-Tabellen (Zeile 826 und Zeile 1290), und die
 *    beiden waren sich nicht einig: 'Meta Definition' gegen
 *    'Meta Dominators' fuer Tier 1. Gerendert hat die spaetere.
 *
 * 2. UEBERSETZT, ABER NICHT UEBERSETZT. 'heatmap.title' und
 *    'currentMeta.topArchetypes' hatten im de-Block denselben englischen
 *    Wert wie im en-Block.
 *
 * Der Abgleich beider Tabellen ergab sonst: 1748 Schluessel in en,
 * 0 davon fehlen in de. Das Uebersetzungssystem ist gesund — es wurde nur
 * an diesen Stellen umgangen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const I18N_SRC = read('js/i18n.js');
const TIER = stripJs(read('js/app-tier-meta.js'));

function tabelle(name) {
    const start = I18N_SRC.indexOf('\n  ' + name + ': {');
    assert.ok(start > -1, 'Block ' + name + ' nicht gefunden');
    const rest = I18N_SRC.slice(start);
    const ende = rest.indexOf('\n  },');
    const block = rest.slice(0, ende > -1 ? ende : rest.length);
    const out = {};
    for (const m of block.matchAll(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)'/gm)) out[m[1]] = m[2];
    return out;
}
const EN = tabelle('en');
const DE = tabelle('de');

describe('Uebersetzungstabellen', () => {
    it('kein Schluessel aus en fehlt in de', () => {
        const fehlt = Object.keys(EN).filter(k => !(k in DE));
        assert.deepEqual(fehlt, [], 'fehlende de-Schluessel: ' + fehlt.slice(0, 10).join(', '));
    });

    it('die fuenf gemeldeten Ueberschriften sind auf Deutsch', () => {
        const soll = {
            'heatmap.title': /Heatmap/,
            'currentMeta.topArchetypes': /Archetypen/,
            'tier.mostUsedCards': /Meistgespielte/,
            'tier.searchPlaceholder': /suchen/,
            'tier.sub1': /Meta/,
        };
        for (const [k, re] of Object.entries(soll)) {
            assert.ok(k in DE, 'Schluessel fehlt: ' + k);
            assert.match(DE[k], re, k + ' ist nicht deutsch: ' + DE[k]);
            assert.notEqual(DE[k], EN[k], k + ' ist in de und en identisch');
        }
    });

    it('kein de-Wert traegt noch eine der gemeldeten englischen Phrasen', () => {
        const verboten = /Top Archetypes|Most Used Cards|Matchup Heatmap|Search archetype|Meta Dominators|Meta Definition|Strong Contenders|Viable Options|Emerging Archetypes/;
        const treffer = Object.entries(DE).filter(([, v]) => verboten.test(v));
        assert.deepEqual(treffer, [], 'noch englisch: ' + JSON.stringify(treffer.slice(0, 5)));
    });
});

describe('js/app-tier-meta.js — nichts mehr fest verdrahtet', () => {
    const phrasen = [
        'Meta Dominators', 'Meta Definition', 'Strong Contenders',
        'Viable Options', 'Emerging Archetypes',
        'Search archetype', 'Most Used Cards', 'Clear filter', 'Filter deck cards',
    ];
    for (const ph of phrasen) {
        it('"' + ph + '" steht nicht mehr im Renderer', () => {
            assert.ok(!TIER.includes(ph),
                ph + ' ist ein Literal im Renderer und kann nie uebersetzt werden');
        });
    }

    it('beide tierTitles-Tabellen holen ihre Untertitel aus t()', () => {
        const tabellen = TIER.match(/const tierTitles = \{[\s\S]*?\};/g) || [];
        assert.equal(tabellen.length, 2,
            'erwartet werden genau die zwei bekannten Tabellen, gefunden: ' + tabellen.length);
        for (const [i, tb] of tabellen.entries()) {
            for (const key of ['tier.sub1', 'tier.sub2', 'tier.sub3', 'tier.subRogue']) {
                assert.ok(tb.includes("t('" + key + "')"),
                    'Tabelle ' + (i + 1) + ' benutzt ' + key + ' nicht');
            }
        }
    });

    it('und sie sagen jetzt beide dasselbe', () => {
        // Vorher: 'Meta Definition' gegen 'Meta Dominators' fuer denselben Tier.
        const tabellen = TIER.match(/const tierTitles = \{[\s\S]*?\};/g) || [];
        const norm = s => s.replace(/\s+/g, ' ').trim();
        assert.equal(norm(tabellen[0]), norm(tabellen[1]),
            'die zwei Tabellen weichen wieder voneinander ab');
    });
});
