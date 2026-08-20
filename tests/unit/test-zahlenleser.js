/**
 * Deutsche Zahlen, englischer Parser — die teuerste Fehlerklasse dieses Projekts.
 *
 * GEMESSEN am 20.08.2026 live auf thedipidis.app: ein Klick auf die Spalte
 * "Listen" der Meta-Performance-Tabelle ergab
 *
 *   vorher   Mega Excadrill 2.121 · Dragapult 1.931 · Festival Lead 1.841
 *   danach   Toucannon 908 an der Spitze, Mega Excadrill nicht mehr sichtbar
 *
 * weil "2.121" als 2,121 gelesen wurde. Dieselbe Klasse traf
 * js/app-tier-meta.js, wo parseFloat("23,08") die Nachkommastellen abschnitt:
 * 143 falsche Oe-Platzierungen und 114 falsche Anteile am letzten
 * vollstaendigen Datenstand.
 *
 * Der Kern der Sache ist eine Unterscheidung, die man leicht uebersieht:
 *
 *   ANGEZEIGTER TEXT  "2.121" heisst zweitausendeinhunderteinundzwanzig
 *   DATEIWERT         "0.101" heisst null Komma eins null eins
 *
 * Deshalb gibt es hier ZWEI Leser, und dieser Test haelt beide auseinander.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

function hole(datei, muster, name) {
    const src = read(datei);
    const m = muster.exec(src);
    assert.ok(m, `${name} in ${datei} nicht gefunden`);
    return new Function('return (' + m[0].replace(new RegExp('function ' + name), 'function') + ')')();
}

const zahl = hole('js/rangliste-sortieren.js', /function zahl\(text\)[\s\S]*?\n    }/, 'zahl');
const parseLocaleNumber = hole('js/app-utils.js', /function parseLocaleNumber[\s\S]*?\n}/, 'parseLocaleNumber');

describe('Der Leser fuer angezeigten Text (Ranglisten-Sortierung)', () => {
    it('liest den Tausenderpunkt als Gruppierung, nicht als Komma', () => {
        // Der eigentliche Fehler. Ohne diese Zeile sortiert 2.121 zwischen 1 und 2.
        assert.equal(zahl('2.121'), 2121);
        assert.equal(zahl('1.931'), 1931);
        assert.equal(zahl('1.234.567'), 1234567);
    });

    it('und in der englischen Oberflaeche das Tausenderkomma', () => {
        assert.equal(zahl('2,121'), 2121);
        assert.equal(zahl('26,319'), 26319);
    });

    it('behaelt echte Nachkommastellen in beiden Sprachen', () => {
        assert.equal(zahl('7,8 %'), 7.8);
        assert.equal(zahl('7.8 %'), 7.8);
        assert.equal(zahl('49,5 %'), 49.5);
        assert.equal(zahl('0,8-mal'), 0.8);
        assert.equal(zahl('0,0 %'), 0);
    });

    it('kommt mit beiden Trennzeichen in einer Zahl zurecht', () => {
        assert.equal(zahl('1.234,5'), 1234.5);
        assert.equal(zahl('1,234.5'), 1234.5);
    });

    it('gibt fuer "keine Angabe" null zurueck, nie 0', () => {
        // Eine 0 fuer eine fehlende Zahl waere eine Messung, die es nicht gibt.
        assert.equal(zahl('–'), null);
        assert.equal(zahl('-'), null);
        assert.equal(zahl(''), null);
        assert.equal(zahl(null), null);
    });

    it('sortiert die zehn groessten Decks wieder nach vorn', () => {
        // Die Werte, die live falsch sortiert haben.
        const zellen = ['2.121', '1.931', '1.841', '1.645', '1.463', '1.448',
                        '1.424', '1.406', '1.272', '1.123', '908', '499', '1'];
        const sortiert = zellen.slice().sort((a, b) => zahl(b) - zahl(a));
        assert.equal(sortiert[0], '2.121', 'das groesste Deck gehoert nach oben');
        assert.equal(sortiert[sortiert.length - 1], '1');
        assert.deepEqual(sortiert.slice(0, 3), ['2.121', '1.931', '1.841']);
        // Toucannon (908) darf nicht mehr an der Spitze stehen.
        assert.notEqual(sortiert[0], '908');
    });
});

describe('Der Leser fuer Dateiwerte (parseLocaleNumber)', () => {
    it('liest deutsche Dezimalkommas aus den CSVs', () => {
        // city_league_archetypes_comparison.csv, geschrieben von
        // js/app-city-league.js:303 mit .replace('.', ',')
        assert.equal(parseLocaleNumber('23,08', 0), 23.08);
        assert.equal(parseLocaleNumber('14,83', 0), 14.83);
    });

    it('und laesst englische Dateiwerte mit drei Nachkommastellen in Ruhe', () => {
        // GENAU HIER duerfen die beiden Leser nicht zusammengelegt werden:
        // data/online_tournament_top8_decks.csv fuehrt top8_conv_rate=0.101,
        // data/labs_tournament_decks.csv day1_share_pct=18.973. Die Regel des
        // Anzeigelesers ("drei Ziffern dahinter = Gruppierung") wuerde daraus
        // 101 und 18973 machen.
        assert.equal(parseLocaleNumber('0.101', 0), 0.101);
        assert.equal(parseLocaleNumber('18.973', 0), 18.973);
        assert.equal(parseLocaleNumber('455.5', 0), 455.5);
    });

    it('die beiden Leser sind bewusst verschieden — das ist kein Versehen', () => {
        assert.equal(zahl('0.101'), 101);              // Anzeige: gruppiert
        assert.equal(parseLocaleNumber('0.101', 0), 0.101); // Datei: Dezimal
    });
});

describe('Kein parseFloat mehr auf Werten mit deutschem Komma', () => {
    it('die Tier-Karten benutzen den Locale-Leser', () => {
        const src = read('js/app-tier-meta.js');
        assert.match(src, /const zahlAus =[\s\S]{0,120}parseLocaleNumber/);
        assert.match(src, /const currentRankValue = zahlAus\(/);
        assert.match(src, /const currentShareValue = zahlAus\(/);
        assert.doesNotMatch(src, /parseFloat\(\s*\n\s*isCurrentFormat/);
    });

    it('und niemand liest new_meta_share oder new_avg_placement mit parseFloat', () => {
        // Die Felder, die das deutsche Komma tragen. Dritter Fundort derselben
        // Klasse — deshalb steht die Regel jetzt hier.
        const FELDER = ['new_meta_share', 'new_avg_placement', 'meta_share_change',
                        'avg_placement_change', 'old_meta_share', 'old_avg_placement'];
        for (const datei of ['js/app-tier-meta.js', 'js/app-city-league.js', 'js/app-past-meta.js']) {
            const src = read(datei);
            for (const feld of FELDER) {
                const treffer = new RegExp(`parseFloat\\([^)]{0,80}\\b${feld}\\b`, 'g');
                const gefunden = src.match(treffer) || [];
                assert.deepEqual(gefunden, [],
                    `${datei}: parseFloat auf ${feld} — ${gefunden.join(' | ')}`);
            }
        }
    });
});
