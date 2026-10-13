/**
 * BEFUND B4 (07.09.2026, Reiter "City League", Ansicht "Vergangenes Meta"):
 *
 *   Die Seite fuehrt die japanischen Daten unter "City League". Als
 *   einzige Herkunftsangabe stand in der Karte "Datenquelle" die Zahl
 *   "1 Turnier" — welches, wie gross, und ob ueberhaupt eine City
 *   League, stand nirgends.
 *
 *   An der Quelle nachgesehen: config/scraper_settings.json traegt fuer
 *   `city_league_analysis_past` genau ein `additional_tournament_ids:
 *   [568]`. Die Ansicht steht also auf einem EINZELNEN Turnier.
 *
 * WAS DIESER TEST PRUEFT
 *
 *   Die Herkunft wird zur Laufzeit aus den Archetyp-Zeilen gelesen und
 *   NICHT abgeschrieben: Kennung, Ortsangabe, Bezeichnung und die Zahl
 *   der erfassten Platzierungen. Wechseln die Zeilen, wechselt der Satz.
 *   Und was in den Daten NICHT steht — Turniername und Teilnehmerzahl —
 *   wird als fehlend gemeldet statt geraten.
 *
 *   Geprueft wird am gerenderten HTML, nicht am Quelltext: die Karte
 *   "Datenquelle" muss den Satz wirklich tragen.
 *
 * Keine Live-Daten: alle Zeilen setzt der Test.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rendern, nurFunktionen } = require('./lib-cityleague-sandkasten.js');

/** Eine Platzierungszeile, wie city_league_archetypes*.csv sie fuehrt. */
const platz = (o) => Object.assign({
    date: '6th June 2026', tournament_id: '568', prefecture: 'Special Event',
    shop: 'Tournament 568', format: 'City League (JP)', placement: '1',
    player: 'Jemand', archetype: 'A'
}, o);

/** Eine Zeile der Vergleichsdatei. */
const vgl = (o) => Object.assign({
    archetype: 'A', status: 'BESTEHEND', trend: 'STABIL',
    old_count: '2', new_count: '5', count_change: '3',
    old_meta_share: '5,0', new_meta_share: '10,0', meta_share_change: '5,0',
    old_avg_placement: '8,0', new_avg_placement: '6,0', avg_placement_change: '-2,0',
    old_best: '3', new_best: '1'
}, o);

/** Der Inhalt der Karte "Datenquelle". */
function datenquelle(html) {
    const ab = html.indexOf('cl.dataSource');
    assert.notEqual(ab, -1, 'die Karte "Datenquelle" steht nicht mehr im HTML');
    const bis = html.indexOf('</div>', html.indexOf('city-league-info-card-details', ab));
    return html.slice(ab, bis);
}

describe('B4 — die Ansicht sagt, worauf sie beruht', () => {

    it('ein einzelnes Turnier: die Karte nennt Kennung, Ort und erfasste Platzierungen', () => {
        const { html } = rendern({
            vergleich: [vgl({})],
            archetypen: [
                platz({ placement: '1', archetype: 'A' }),
                platz({ placement: '5', archetype: 'B' }),
                platz({ placement: '32', archetype: 'C' })
            ],
            turniere: 1, zeitraum: '6. Juni 2026'
        });
        const karte = datenquelle(html);

        assert.ok(karte.includes('beruht auf einem einzigen Turnier'),
            'die Karte sagt nicht, dass hier ein einzelnes Turnier steht:\n' + karte);
        assert.ok(karte.includes('Kennung 568'), 'die Turnierkennung fehlt:\n' + karte);
        assert.ok(karte.includes('Ortsangabe „Special Event“'),
            'die Ortsangabe aus den Daten fehlt:\n' + karte);
        assert.ok(karte.includes('3 erfasste Platzierungen (Plätze 1 bis 32)'),
            'die Zahl der erfassten Platzierungen fehlt:\n' + karte);
    });

    it('der Name wird GELESEN, nicht abgeschrieben — andere Zeilen, anderer Satz', () => {
        const { html } = rendern({
            vergleich: [vgl({})],
            archetypen: [platz({ tournament_id: '777', shop: 'Kyoto City League #12',
                                 prefecture: 'Kyoto', placement: '1' })],
            turniere: 1
        });
        const karte = datenquelle(html);
        assert.ok(karte.includes('Bezeichnung „Kyoto City League #12“'),
            'die Bezeichnung aus den Daten steht nicht da:\n' + karte);
        assert.ok(karte.includes('Kennung 777'), karte);
        assert.equal(karte.includes('568'), false,
            'die alte Kennung klebt im Satz — sie ist abgeschrieben:\n' + karte);
        assert.equal(karte.includes('Platzhalterbezeichnung'), false,
            'ein vorhandener Name wird faelschlich als fehlend gemeldet:\n' + karte);
    });

    it('fehlt der Name in den Daten, wird das gesagt statt geraten', () => {
        const k = nurFunktionen('de');
        const her = k.cityLeagueTurnierHerkunft([
            platz({ shop: 'Tournament 568' }), platz({ shop: 'Tournament 568', placement: '9' })
        ]);
        assert.equal(her.length, 1);
        assert.equal(her[0].nameFehlt, true,
            '"Tournament <id>" ist der Platzhalter des Scrapers, kein Turniername');

        const satz = k.cityLeagueHerkunftSatz(her, true);
        assert.ok(satz.includes('Einen Turniernamen führt der Datensatz nicht'), satz);
        assert.ok(satz.includes('Eine Spielerzahl steht ebenfalls nicht darin'),
            'die fehlende Feldgroesse muss ausdruecklich dastehen:\n' + satz);
        // Und keine erfundene Zahl: was nicht gelesen wurde, steht nicht da.
        assert.equal(/\b2[.,]?7\d\d\b/.test(satz), false,
            'im Satz steht eine Teilnehmerzahl, die in den Daten nicht vorkommt:\n' + satz);
    });

    it('ab vier Turnieren traegt die Ansicht ihren Namen selbst — dann kein Zusatz', () => {
        const k = nurFunktionen('de');
        const viele = [];
        ['1', '2', '3', '4'].forEach(id => viele.push(platz({ tournament_id: id })));
        assert.equal(k.cityLeagueHerkunftSatz(k.cityLeagueTurnierHerkunft(viele), true), '');
        // drei sind noch eine Aufzaehlung wert
        const drei = viele.slice(0, 3);
        assert.notEqual(k.cityLeagueHerkunftSatz(k.cityLeagueTurnierHerkunft(drei), true), '');
    });

    it('beide Sprachen, und keine der beiden faellt auf die andere zurueck', () => {
        const de = nurFunktionen('de');
        const en = nurFunktionen('en');
        const zeilen = [platz({}), platz({ placement: '9' })];
        const sDe = de.cityLeagueHerkunftSatz(de.cityLeagueTurnierHerkunft(zeilen), true);
        const sEn = en.cityLeagueHerkunftSatz(en.cityLeagueTurnierHerkunft(zeilen), false);
        assert.ok(sDe.includes('erfasste Platzierungen'), sDe);
        assert.ok(sEn.includes('recorded placements'), sEn);
        assert.equal(sEn.includes('Platzierungen'), false, 'der englische Satz ist deutsch:\n' + sEn);
        assert.equal(sDe.includes('recorded'), false, 'der deutsche Satz ist englisch:\n' + sDe);
    });

    it('ohne Archetyp-Zeilen wird nichts behauptet', () => {
        const k = nurFunktionen('de');
        assert.deepEqual(k.cityLeagueTurnierHerkunft([]), []);
        assert.equal(k.cityLeagueHerkunftSatz([], true), '');
        assert.equal(k.cityLeagueHerkunftSatz(null, true), '');
    });
});
