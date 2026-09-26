/**
 * DA-8: im Vergangenen Meta gilt bei gewaehltem Turnier die Matrix DIESES
 * Turniers, sobald sie vorliegt; sonst der Formatschnitt mit Vorbehalt.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const PM = fs.readFileSync(path.join(ROOT, 'js', 'app-past-meta.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

function schneide(quelle, kopf) {
    const start = quelle.indexOf(kopf);
    assert.ok(start >= 0, `${kopf} fehlt`);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', start); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(start, i + 1);
    }
    throw new Error('Klammern');
}

describe('DA-8: Matchups je Turnier', () => {
    const ctx = {};
    vm.runInNewContext(schneide(PM, 'function pastMetaTidPasst(') + '\n'
        + schneide(PM, 'function _pmZeilenDiesesTurniers(') + '\nthis.f = _pmZeilenDiesesTurniers;', ctx);
    const tid = { gepolstert: '0070', roh: '70' };
    const zeilen = [
        { my_deck_name: 'Dragapult', day_filter: 'overall', tournament_count: '1', tournaments_used: '70', opponent_deck_name: 'A' },
        { my_deck_name: 'Dragapult', day_filter: 'overall', tournament_count: '1', tournaments_used: '69', opponent_deck_name: 'B' },
        { my_deck_name: 'Dragapult', day_filter: 'overall', tournament_count: '2', tournaments_used: '69,70', opponent_deck_name: 'C' },
        { my_deck_name: 'Dragapult', day_filter: 'day2', tournament_count: '1', tournaments_used: '70', opponent_deck_name: 'D' },
        { my_deck_name: 'Gardevoir', day_filter: 'overall', tournament_count: '1', tournaments_used: '70', opponent_deck_name: 'E' },
    ];

    it('nimmt nur Zeilen genau dieses Turniers, dieses Decks, Overall', () => {
        assert.deepEqual(ctx.f(zeilen, 'Dragapult', tid).map(z => z.opponent_deck_name), ['A']);
    });

    it('ein Formatschnitt, der das Turnier nur enthaelt, zaehlt nicht', () => {
        const nur = zeilen.filter(z => z.tournament_count === '2');
        assert.deepEqual(ctx.f(nur, 'Dragapult', tid), []);
    });

    it('der Vorbehaltssatz behauptet nicht mehr, Labs habe keine Daten je Turnier', () => {
        assert.doesNotMatch(I18N, /Labs publishes matchups per format, not per event/);
        assert.doesNotMatch(I18N, /Labs veröffentlicht Matchups je Format, nicht je Veranstaltung/);
    });

    it('die Matrix nimmt die Zeilen je Turnier, bevor sie den Vorbehalt setzt', () => {
        const matrix = schneide(PM, 'async function _renderPastMetaMatchupMatrix(');
        const iJe = matrix.indexOf('_pmZeilenDiesesTurniers(await _pmLadeJeTurnier(formatKey)');
        const iVorbehalt = matrix.indexOf('const _muFormatweit = !!tournamentFilter && !_muJeTurnier');
        assert.ok(iJe > 0 && iVorbehalt > iJe, 'die Matrix je Turnier wird nicht benutzt oder zu spaet');
    });
});
