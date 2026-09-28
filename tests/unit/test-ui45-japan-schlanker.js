/**
 * UI-45 (28.09.2026, Hausi, Video-Review 24:36–25:48): der Japan-Reiter
 * wird schlanker, wie Global und Rotationen.
 *
 *   1. Siegerliste: keine Spalte „Quelle“ und kein Fusstext mehr — die
 *      Zeile zeigt direkt das Deck (siehe test-cl-siegerliste.js).
 *   2. Die Vergleichsrubriken („Seltener/Häufiger gespielt“, „Performance
 *      verbessert/verschlechtert“, neue und verschwundene Archetypen) und
 *      der erklaerende Leerzustandstext sind weg — „wird nicht gelesen“.
 *   3. „Top-Archetypen nach Share“ unter der Seite ist weg.
 *
 * Gemessen vor dem Umbau (live, 28.09.2026, Stand 202609280908): Block
 * „Warum hier keine Vergleichstabellen stehen“ mit Fliesstext, Siegerliste
 * mit Spalte „Quelle“ (569) und Fusstext, darunter „Top-Archetypen nach
 * Share“.
 *
 * Geprueft wird AUSGEFUEHRT: renderCityLeagueTable() laeuft im Sandkasten
 * (lib-cityleague-sandkasten.js) mit Zeilen, die ALLE Rubriken fuellen
 * wuerden — mit Vorzeitraum, Zu- und Abgaengen, Auf- und Absteigern.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rendern, ueberschriften, QUELLE } = require('./lib-cityleague-sandkasten.js');

const vgl = (o) => Object.assign({
    archetype: 'A', status: 'BESTEHEND', trend: 'STABIL',
    old_count: '2', new_count: '5', count_change: '3',
    old_meta_share: '5,0', new_meta_share: '10,0', meta_share_change: '5,0',
    old_avg_placement: '8,0', new_avg_placement: '6,0', avg_placement_change: '-2,0',
    old_best: '3', new_best: '1'
}, o);

const VOLL = [
    vgl({ archetype: 'Aufsteiger', old_count: '2', new_count: '9', count_change: '7' }),
    vgl({ archetype: 'Absteiger', old_count: '9', new_count: '3', count_change: '-6',
          avg_placement_change: '3,0' }),
    vgl({ archetype: 'Neu', status: 'NEU', old_count: '0', new_count: '4', count_change: '4' }),
    vgl({ archetype: 'Weg', status: 'VERSCHWUNDEN', old_count: '4', new_count: '0', count_change: '-4' }),
];

describe('UI-45 — Japan ohne Vergleichsrubriken', () => {
    const { html } = rendern({ vergleich: VOLL, archetypen: [], turniere: 3, zeitraum: 'Sep 2026' });

    it('die Probe rendert wirklich (Karten und Tabellen stehen da)', () => {
        assert.match(html, /cl\.archetypeOverview/);
        assert.match(html, /cl\.fullComparison/);
    });

    it('keine Vergleichsrubrik und kein Leerzustandstext — auch wenn Daten dafuer da sind', () => {
        const titel = ueberschriften(html);
        for (const weg of [/Warum hier keine Vergleich/, /Why no comparison/, /Seltener|Häufiger|Popularity/i,
            /Performance/i, /Neue Archetypen|New Archetypes/, /Verschwundene|Disappeared/]) {
            assert.ok(!titel.some(x => weg.test(x)), `Rubrik steht wieder da: ${titel.join(' | ')}`);
        }
        assert.doesNotMatch(html, /city-league-info-combined-explanation" role="status"/,
            'der Leerzustandsblock ist wieder da');
    });

    it('„Top-Archetypen nach Share“ wird nicht mehr gezeichnet', () => {
        const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
        assert.doesNotMatch(code, /renderMetaChart\(\s*'cityLeague'/);
    });
});
