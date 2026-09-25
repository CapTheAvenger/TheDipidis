/**
 * BEFUND (25.09.2026, Reiter "City League", laufendes Meta):
 *
 *   Der Reiter stand leer. Gemessen: /tournaments/jp fuehrt nur City
 *   Leagues, neuester Eintrag dort 06 May 26; die Champions League
 *   Yokohama vom 20.09.2026 (Turnier 569, 10.000 Spieler, Sieger Keiyo
 *   Watanabe mit Mega-Stalobor) steht nur in der Hauptliste
 *   /tournaments. Seit der M6A-Rotation am 16.09.2026 ist sie das
 *   EINZIGE Turnier im laufenden japanischen Fenster.
 *
 *   Der Scraper zieht sie seit dem 25.09.2026 mit. Damit steht in einem
 *   Reiter, der "City League" heisst, moeglicherweise ein Turnier mit
 *   10.000 Teilnehmern — waehrend eine City League typisch 4 bis 16
 *   Platzierungen fuehrt. Ein "Platz 8" heisst in beiden Faellen etwas
 *   voellig anderes.
 *
 * WAS DIESER TEST PRUEFT
 *
 *   Die Turnierklasse aus der Spalte `format` wird GELESEN und genannt,
 *   sobald sie nicht "City League (JP)" ist — und sie wird NICHT genannt,
 *   wenn sie es ist (sonst stuende der Reitername zweimal da).
 *
 *   Geprueft wird das Verhalten der Funktionen, nicht ihr Wortlaut im
 *   Quelltext.
 *
 * Keine Live-Daten: alle Zeilen setzt der Test.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { nurFunktionen } = require('./lib-cityleague-sandkasten.js');

const zeile = (o) => Object.assign({
    date: '20th September 2026', tournament_id: '569', prefecture: 'JP',
    shop: 'Champions League Yokohama', format: 'Champions League (JP)',
    placement: '1', player: 'Keiyo Watanabe', archetype: 'Mega Excadrill'
}, o);

describe('die Turnierklasse wird nicht verschwiegen', () => {

    it('ein Major wird als solcher benannt', () => {
        const k = nurFunktionen('de');
        const her = k.cityLeagueTurnierHerkunft([
            zeile({ placement: '1' }), zeile({ placement: '16', archetype: 'Slowking' })
        ]);
        assert.equal(her.length, 1, 'ein Turnier, eine Herkunft');
        assert.equal(her[0].klasse, 'Champions League (JP)',
            'die Klasse wird nicht aus der Spalte format gelesen');

        const satz = k.cityLeagueHerkunftSatz(her, true);
        assert.ok(satz.includes('Turnierklasse „Champions League (JP)“'),
            'die Turnierklasse steht nicht im Herkunftssatz:\n' + satz);
        assert.ok(satz.includes('keine City League'),
            'dass es KEINE City League ist, muss ausdruecklich dastehen:\n' + satz);
        assert.ok(satz.includes('Bezeichnung „Champions League Yokohama“'), satz);
        assert.ok(satz.includes('Kennung 569'), satz);
    });

    it('eine echte City League bekommt keinen Zusatz — der Reiter heisst schon so', () => {
        const k = nurFunktionen('de');
        const her = k.cityLeagueTurnierHerkunft([
            zeile({ tournament_id: '4270', shop: 'ゲームアーク　丸亀店',
                    prefecture: 'Kagawa', format: 'City League (JP)' })
        ]);
        const satz = k.cityLeagueHerkunftSatz(her, true);
        assert.equal(satz.includes('Turnierklasse'), false,
            'bei einer City League ist der Zusatz nur Laerm:\n' + satz);
        assert.equal(satz.includes('keine City League'), false, satz);
    });

    it('die Klasse wird gelesen, nicht abgeschrieben — andere Zeile, andere Klasse', () => {
        const k = nurFunktionen('de');
        const satz = k.cityLeagueHerkunftSatz(k.cityLeagueTurnierHerkunft([
            zeile({ tournament_id: '567', shop: 'Korean League Final Season',
                    prefecture: 'KR', format: 'Korean League (JP)' })
        ]), true);
        assert.ok(satz.includes('Turnierklasse „Korean League (JP)“'), satz);
        assert.equal(satz.includes('Champions League'), false,
            'die Klasse der vorigen Zeile klebt im Satz:\n' + satz);
    });

    it('auf Englisch genauso', () => {
        const k = nurFunktionen('en');
        const satz = k.cityLeagueHerkunftSatz(
            k.cityLeagueTurnierHerkunft([zeile({})]), false);
        assert.ok(satz.includes('tournament class “Champions League (JP)”'), satz);
        assert.ok(satz.includes('not a City League'), satz);
    });

    it('fehlt die Spalte, wird nichts behauptet', () => {
        const k = nurFunktionen('de');
        const her = k.cityLeagueTurnierHerkunft([zeile({ format: '' })]);
        assert.equal(her[0].klasse, '');
        const satz = k.cityLeagueHerkunftSatz(her, true);
        assert.equal(satz.includes('Turnierklasse'), false,
            'ohne Wert in den Daten darf keine Klasse dastehen:\n' + satz);
    });
});
