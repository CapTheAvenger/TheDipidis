/**
 * DA-46 (D3-06, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: city_league_archetypes.csv schreibt „20 Sep 26“ … „29 Sep 26“.
 * Der Datumsleser verlangte ein vierstelliges Jahr, las nichts, und die
 * Japan-Seite zeigte „Zeitraum: 27 Sep 26“ (eine beliebige Zeile).
 *
 * ZUSICHERUNG: _clDatumLesen wird AUSGEFUEHRT — zwei- und vierstellige
 * Jahre, Ordnungsendungen, Sortierschluessel richtig.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

const ctx = L.baue('js/app-city-league.js', ['function _clDatumLesen(d)'], {});

describe('DA-46: City-League-Datum mit zweistelligem Jahr', () => {
    it('„29 Sep 26“ -> 2026-09-29', () => {
        const r = ctx._clDatumLesen('29 Sep 26');
        assert.equal(r.comparable, '20260929');
        assert.equal(r.datum.toISOString().slice(0, 10), '2026-09-29');
    });
    it('„6th June 2026“ bleibt lesbar', () => {
        assert.equal(ctx._clDatumLesen('6th June 2026').comparable, '20260606');
    });
    it('Spanne ueber eine echte Dateiauswahl', () => {
        const d = ['27 Sep 26', '20 Sep 26', '29 Sep 26'].map(ctx._clDatumLesen);
        const min = d.reduce((a, b) => (a.comparable < b.comparable ? a : b));
        const max = d.reduce((a, b) => (a.comparable > b.comparable ? a : b));
        assert.equal(min.original, '20 Sep 26');
        assert.equal(max.original, '29 Sep 26');
    });
    it('Unsinn bleibt Unsinn', () => {
        assert.equal(ctx._clDatumLesen('irgendwann').datum, null);
    });
});
