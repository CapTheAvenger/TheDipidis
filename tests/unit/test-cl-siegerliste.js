/* test-cl-siegerliste.js — die Sieger der japanischen Majors.
 *
 * ANLASS (Betreiber, 25.09.2026): „es fehlt noch die City Champions
 * League Sieger Liste".
 *
 * Seit dem 25.09.2026 zieht backend/scrapers/city_league_archetype_scraper.py
 * die japanischen Majors mit (Champions League, Regional League, Japan
 * Championships, Korean League, Premier Ball League). Sie stehen in
 * derselben Datei wie die City Leagues, unterscheidbar an der Spalte
 * `format`.
 *
 * WAS HIER BEISSEN SOLL
 * ---------------------
 *   1. Eine City League darf NICHT als Major durchgehen. Eine City League
 *      hat 4 bis 16 Spieler, die Champions League Yokohama vom 20.09.2026
 *      hatte 10.000 — ein Sieg heisst in beiden Faellen etwas voellig
 *      anderes, und genau davor warnt der Kommentar in
 *      cityLeagueHerkunftSatz() schon.
 *   2. Liegt kein Major im Fenster, wird das GESAGT und nicht mit
 *      City-League-Siegern aufgefuellt.
 *   3. Was der Datensatz nicht fuehrt — Teilnehmerzahl, Deckliste — wird
 *      nicht behauptet.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-city-league.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WURZEL, 'css', 'ui-components.css'), 'utf8');

function funktion(name) {
    const re = new RegExp(`(^|\\n)\\s*function\\s+${name}\\s*\\(`);
    const m = re.exec(QUELLE);
    assert.ok(m, 'Funktion nicht gefunden: ' + name);
    const start = QUELLE.indexOf('function', m.index);
    let tiefe = 0;
    for (let i = QUELLE.indexOf('{', start); i < QUELLE.length; i++) {
        if (QUELLE[i] === '{') tiefe++;
        else if (QUELLE[i] === '}') { tiefe--; if (tiefe === 0) return QUELLE.slice(start, i + 1); }
    }
    throw new Error(name + ': die Klammern gehen nicht auf');
}

function lade() {
    const ktx = {
        escapeHtml: (s) => String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        Map, Date, Number, isNaN, String, Array
    };
    vm.createContext(ktx);
    vm.runInContext(funktion('cityLeagueSiegerListe') + '\n' + funktion('cityLeagueSiegerHtml'), ktx);
    return {
        liste: vm.runInContext('cityLeagueSiegerListe', ktx),
        html: vm.runInContext('cityLeagueSiegerHtml', ktx)
    };
}

const zeile = (o) => Object.assign({
    date: '6th June 2026', tournament_id: 'jp-001', prefecture: 'Tokyo',
    shop: 'Kanda', format: 'City League (JP)', placement: '1',
    player: 'Takuya S.', archetype: 'Dragapult Dusknoir'
}, o);

test('nur Platz 1 zaehlt als Sieger', () => {
    const { liste } = lade();
    const raus = liste([
        zeile({ placement: '2', player: 'Zweiter' }),
        zeile({ placement: '1', player: 'Erster' }),
        zeile({ placement: '8', player: 'Achter' })
    ]);
    assert.strictEqual(raus.length, 1);
    assert.strictEqual(raus[0].spieler, 'Erster');
});

test('eine City League ist kein Major', () => {
    const { liste } = lade();
    const raus = liste([zeile({})]);
    assert.strictEqual(raus.length, 1);
    assert.strictEqual(raus[0].istMajor, false,
        'eine City League mit 4 bis 16 Spielern darf nicht als Major gelten');
});

test('Champions League, Regional League und Co. sind Majors', () => {
    const { liste } = lade();
    ['Champions League (JP)', 'Regional League (JP)', 'Japan Championships (JP)',
     'Korean League (JP)', 'Premier Ball League (JP)', 'Sonstiges (JP)'].forEach((klasse, i) => {
        const raus = liste([zeile({ format: klasse, tournament_id: 'm' + i })]);
        assert.strictEqual(raus[0].istMajor, true, klasse + ' gilt nicht als Major');
    });
});

test('Majors stehen oben, danach das neuere Turnier zuerst', () => {
    const { liste } = lade();
    const raus = liste([
        zeile({ tournament_id: 'cl', date: '24th September 2026' }),
        zeile({ tournament_id: 'alt', format: 'Regional League (JP)', date: '1st August 2026' }),
        zeile({ tournament_id: 'neu', format: 'Champions League (JP)', date: '20th September 2026' })
    ]);
    assert.deepStrictEqual([...raus.map((e) => e.id)], ['neu', 'alt', 'cl']);
});

test('das ISO-Datum wird genauso sortiert wie das englische', () => {
    const { liste } = lade();
    const raus = liste([
        zeile({ tournament_id: 'a', format: 'Champions League (JP)', date: '2026-08-01' }),
        zeile({ tournament_id: 'b', format: 'Champions League (JP)', date: '2026-09-20' })
    ]);
    assert.deepStrictEqual([...raus.map((e) => e.id)], ['b', 'a']);
});

test('die Quelle ist die Turnierseite, die der Scraper selbst abruft', () => {
    const { liste } = lade();
    const raus = liste([zeile({ tournament_id: 'jp-77', format: 'Champions League (JP)' })]);
    assert.strictEqual(raus[0].url, 'https://limitlesstcg.com/tournaments/jp-77');
});

test('ein Turnier ohne Kennung faellt heraus — ohne Kennung gibt es keine Quelle', () => {
    const { liste } = lade();
    assert.strictEqual(liste([zeile({ tournament_id: '' })]).length, 0);
});

test('ohne Major sagt die Ansicht das, statt City-League-Sieger zu zeigen', () => {
    const { liste, html } = lade();
    const nurCl = liste([zeile({ tournament_id: 'cl1' }), zeile({ tournament_id: 'cl2' })]);
    const s = html(nurCl, true);
    assert.ok(s.includes('data-cl-sieger="leer"'), 'der Leerzustand ist nicht gekennzeichnet');
    assert.ok(!s.includes('Takuya'),
        'ein City-League-Sieger steht unter der Ueberschrift „Sieger der japanischen Majors“:\n' + s);
    assert.ok(/2 City-League-Turnier/.test(s),
        'es steht nicht da, was stattdessen im Datensatz liegt:\n' + s);
    assert.ok(s.includes('Champions League'),
        'der Leerzustand nennt nicht, worauf gewartet wird');
});

test('mit Major steht der Sieger mit Datum, Klasse, Deck und Quelle da', () => {
    const { liste, html } = lade();
    const raus = liste([zeile({
        tournament_id: '6ab0f1', format: 'Champions League (JP)',
        date: '20th September 2026', prefecture: 'JP',
        player: 'Keiyo Watanabe', archetype: 'Mega Excadrill'
    })]);
    const s = html(raus, true);
    assert.ok(s.includes('data-cl-sieger="voll"'));
    assert.ok(s.includes('Keiyo Watanabe'));
    assert.ok(s.includes('Champions League (JP)'));
    assert.ok(s.includes('Mega Excadrill'));
    assert.ok(s.includes('https://limitlesstcg.com/tournaments/6ab0f1'));
    assert.ok(s.includes('20th September 2026'));
});

test('was der Datensatz nicht fuehrt, wird nicht behauptet', () => {
    const { liste, html } = lade();
    const raus = liste([zeile({
        tournament_id: 'x', format: 'Champions League (JP)', player: '', archetype: ''
    })]);
    const s = html(raus, true);
    assert.ok(s.includes('nicht im Datensatz'),
        'ein fehlender Spielername wird nicht als fehlend gekennzeichnet:\n' + s);
    /* Keine Teilnehmerzahl: die Spalte gibt es in der Quelle nicht. */
    assert.ok(!/\bSpieler\b\s*<\/th>/.test(s),
        'eine Spalte „Spieler(zahl)“ steht da, obwohl die Quelle keine fuehrt');
    assert.ok(s.includes('Teilnehmerzahl und Deckliste fuehrt der Datensatz nicht')
        || s.includes('fuehrt der Datensatz nicht'),
        'der Fusstext sagt nicht, was fehlt:\n' + s);
});

test('die englische Fassung ist englisch', () => {
    const { liste, html } = lade();
    const raus = liste([zeile({ tournament_id: 'x', format: 'Champions League (JP)' })]);
    const s = html(raus, false);
    assert.ok(s.includes('Winners of the Japanese majors'));
    assert.ok(!/Datum<\/th>|Sieger<\/th>/.test(s), 'deutsche Spaltenkoepfe in der englischen Fassung');
    const leer = html([], false);
    assert.ok(leer.includes('No Japanese major'));
});

test('der Text wird maskiert — ein Spielername ist Fremdtext', () => {
    const { liste, html } = lade();
    const raus = liste([zeile({
        tournament_id: 'x', format: 'Champions League (JP)',
        player: '<img src=x onerror=alert(1)>'
    })]);
    const s = html(raus, true);
    assert.ok(!s.includes('<img src=x'), 'ein Name aus der Quelle steht unmaskiert im HTML');
    assert.ok(s.includes('&lt;img'));
});

test('die Siegerliste wird auch gezeichnet und nicht nur gerechnet', () => {
    /* Eine Funktion, die niemand aufruft, waere gruen und unsichtbar. */
    assert.ok(/html \+= cityLeagueSiegerHtml\(\s*cityLeagueSiegerListe\(/.test(QUELLE),
        'cityLeagueSiegerHtml() wird nirgends in die Ausgabe gehaengt');
});

test('die Siegerliste hat eigene Regeln im Stilblatt', () => {
    ['.city-league-sieger', '.city-league-sieger-tabelle', '.city-league-sieger-leer',
     '.city-league-sieger-fuss']
        .forEach((k) => assert.ok(CSS.includes(k), `Regel fehlt: ${k}`));
});

test('zwei Sieger in einem Turnier werden gezaehlt, nicht doppelt gezeigt', () => {
    const { liste } = lade();
    const raus = liste([
        zeile({ tournament_id: 'x', format: 'Champions League (JP)', player: 'A' }),
        zeile({ tournament_id: 'x', format: 'Champions League (JP)', player: 'B' })
    ]);
    assert.strictEqual(raus.length, 1, 'ein Turnier hat einen Sieger');
    assert.strictEqual(raus[0].zeilen, 2,
        'die zweite Platz-1-Zeile wird verschluckt, statt gezaehlt zu werden');
});

test('die Zeilen liegen VOR dem Zeichnen bereit', () => {
    /* BEFUND (25.09.2026, live geprueft): die Siegerliste zeigte „kein
     * japanisches Major im Datensatz", waehrend die Champions League
     * Yokohama mit Sieger Keiyo Watanabe in der Datei stand und
     * window.cityLeagueArchetypesData 29 Zeilen fuehrte.
     *
     * Grund: das Ablegen stand VIER ZEILEN NACH dem Zeichnen. Beim
     * ersten Aufbau war der Speicher leer; erst ein zweites Zeichnen
     * haette die Liste gefuellt.
     *
     * Geprueft wird die Reihenfolge im Quelltext, weil genau dort der
     * Fehler sass — und weil renderCityLeagueTable() die Zeilen an zwei
     * Stellen von dort liest. */
    const ablegen = QUELLE.indexOf('window.cityLeagueArchetypesData = archetypesData');
    const zeichnen = QUELLE.indexOf('renderCityLeagueTable(tournamentCount, dateRange');
    assert.ok(ablegen > 0, 'window.cityLeagueArchetypesData wird nirgends gesetzt');
    assert.ok(zeichnen > 0, 'renderCityLeagueTable wird nirgends aus dem Laden gerufen');
    assert.ok(ablegen < zeichnen,
        'die Zeilen werden ERST NACH dem Zeichnen abgelegt — die Siegerliste '
        + 'und der Herkunftssatz lesen dann ins Leere');
});

test('die Siegerliste liest dieselben Zeilen, die abgelegt werden', () => {
    /* Ein zweiter Speicher waere derselbe Fehler mit einem anderen
     * Namen. */
    assert.ok(/cityLeagueSiegerListe\(window\.cityLeagueArchetypesData \|\| \[\]\)/.test(QUELLE),
        'die Siegerliste liest nicht window.cityLeagueArchetypesData');
});
