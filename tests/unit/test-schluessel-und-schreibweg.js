/**
 * Gruppe 9 (Schluessel treffen nicht) und Gruppe 3 (der Schreibweg prueft
 * nicht, was er schreibt) — Pruefrunde vom 20.08.2026.
 *
 * Gemeinsamer Nenner: eine Zuordnung greift daneben, und der Fehlschlag
 * wird still zum Vorgabewert. Eine leere Ansicht, eine zweite Zeile, ein
 * halbes Gewicht, ein halber Zahlenwert — nirgends eine Meldung.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAST    = lies('js/app-past-meta.js');
const CITY    = lies('js/app-city-league.js');
const BUILDER = lies('js/deck-builder-consistency.js');

function stueck(quelle, re, was) {
    const m = quelle.match(re);
    if (!m) throw new Error('konnte ' + was + ' nicht herausschneiden');
    return m[0];
}

// ---------------------------------------------------------------------------
// Drei Kennungen fuer dasselbe Turnier
// ---------------------------------------------------------------------------

describe('Past Meta: die Turnier-Kennungen werden uebersetzt', () => {
    // Gemessen: die Schnittmenge der Dropdown-IDs (391…552) mit den
    // Labs-IDs (0001…0070) ist LEER. Bei jeder Einzelturnier-Auswahl
    // blieben Leistungskacheln und Matchup-Tabelle leer, obwohl die Daten
    // im Repo liegen. Die Uebersetzungsspalte labs_tournament_id stand die
    // ganze Zeit in derselben Datei, aus der das Menue gebaut wird.
    const laden = (turniere) => {
        const quelle =
            stueck(PAST, /function pastMetaLabsTid\(limitlessTid\) \{[\s\S]*?\n        \}/, 'labsTid')
            + '\n'
            + stueck(PAST, /function pastMetaTidPasst\(kandidat, tids\) \{[\s\S]*?\n        \}/, 'tidPasst');
        // eslint-disable-next-line no-new-func
        return new Function('pastMetaTournaments',
            quelle + '\nreturn { pastMetaLabsTid, pastMetaTidPasst };')(turniere);
    };
    const turniere = [
        { tournament_id: '540', labs_tournament_id: '0069' },
        { tournament_id: '518', labs_tournament_id: '0070' },
        { tournament_id: '563', labs_tournament_id: '' },
    ];

    it('uebersetzt die Limitless-ID in die Labs-ID', () => {
        const { pastMetaLabsTid } = laden(turniere);
        assert.deepEqual(pastMetaLabsTid('540'), { gepolstert: '0069', roh: '69' });
        assert.deepEqual(pastMetaLabsTid('518'), { gepolstert: '0070', roh: '70' });
    });

    it('meldet ein Turnier ohne Labs-Zuordnung als solches', () => {
        const { pastMetaLabsTid } = laden(turniere);
        assert.equal(pastMetaLabsTid('563'), null);
        assert.equal(pastMetaLabsTid('999'), null);
        assert.equal(pastMetaLabsTid(''), null);
    });

    it('trifft beide Schreibweisen — mit und ohne fuehrende Nullen', () => {
        const { pastMetaLabsTid, pastMetaTidPasst } = laden(turniere);
        const t = pastMetaLabsTid('540');
        assert.ok(pastMetaTidPasst('0069', t), 'labs_tournament_decks schreibt 0069');
        assert.ok(pastMetaTidPasst('69', t), 'tournaments_used schreibt 69');
        assert.ok(pastMetaTidPasst(' 69 ', t));
        assert.ok(!pastMetaTidPasst('70', t));
        assert.ok(!pastMetaTidPasst('540', t), 'die Limitless-ID darf hier NICHT treffen');
        assert.ok(!pastMetaTidPasst('', t));
    });

    it('ohne Auswahl passt alles', () => {
        const { pastMetaTidPasst } = laden(turniere);
        assert.ok(pastMetaTidPasst('0069', null));
    });

    it('die Uebersetzung wird auch wirklich benutzt', () => {
        assert.match(PAST, /const wantedTid = gewaehlt \? pastMetaLabsTid\(gewaehlt\) : null/);
        assert.match(PAST, /pastMetaTidPasst\(r\.tournament_id, wantedTid\)/);
        assert.match(PAST, /used\.some\(x => pastMetaTidPasst\(x, tournamentFilter\)\)/);
        assert.doesNotMatch(PAST, /used\.includes\(String\(tournamentFilter\)\)/);
    });

    it('und die Uebersetzungsspalte steht wirklich in der Datei', () => {
        const kopf = lies('data/tournament_cards_data_overview.csv')
            .replace(/^﻿/, '').split('\n')[0];
        assert.ok(kopf.includes('labs_tournament_id'), kopf);
    });
});

// ---------------------------------------------------------------------------
// Zerrissene Felder
// ---------------------------------------------------------------------------

describe('Zerrissene CSV-Felder werden nicht als Zahl gelesen', () => {
    const ladeZahlFeld = () => {
        const quelle =
            stueck(PAST, /const PM_ZAHL_FORM = [^\n]*\n/, 'form')
            + stueck(PAST, /function pastMetaZahlFeld\(value, fallback = null\) \{[\s\S]*?\n        \}/, 'zahlFeld');
        // eslint-disable-next-line no-new-func
        return new Function('window',
            quelle + '\nreturn pastMetaZahlFeld;')({
                parseLocaleNumber: (v, f) => {
                    const n = parseFloat(String(v).replace(',', '.'));
                    return isFinite(n) ? n : f;
                },
            });
    };

    it('nimmt saubere Werte', () => {
        const f = ladeZahlFeld();
        assert.equal(f('3,50'), 3.5);
        assert.equal(f('100,0'), 100);
        assert.equal(f('4'), 4);
        assert.equal(f(2.5), 2.5);
    });

    it('weist genau die Formen zurueck, die in TEF-CRI stehen', () => {
        const f = ladeZahlFeld();
        // Rohzeile: ...;12;4;3;"4,""['0";3;100', '0;ASC;...;"No']"""
        assert.equal(f('4,"[\'0'), null);
        assert.equal(f("100', '0"), null);
        assert.equal(f("No']\""), null);
        assert.equal(f(''), null);
    });

    it('und der Leseweg benutzt die Pruefung', () => {
        assert.match(PAST, /average_count: zerrissen\(card\.average_count\)/);
        assert.match(PAST, /percentage_in_archetype: zerrissen\(card\.percentage_in_archetype\)/);
        assert.match(PAST, /is_ace_spec: \/\^\(yes\|true\|1\)\$\/i\.test/);
    });

    it('die Datei ist repariert — die Pruefung bleibt trotzdem', () => {
        // Bis zum 21.08.2026 stand hier die Umkehrung: der Chunk MUSSTE
        // kaputt sein, damit die Sonderbehandlung eine Begruendung hat.
        // Die 1.263 Zeilen sind jetzt aus den unversehrten Spalten
        // derselben Zeile nachgerechnet
        // (scripts/repariere_turnier_kartenzeilen.py).
        //
        // Die Pruefung im Leseweg bleibt: sie kostet nichts und faengt den
        // naechsten Schreibfehler ab, bevor er als Zahl auf dem Schirm
        // landet. Genau das sichern die Faelle darueber zu.
        const roh = lies('data/tournament_cards_data_cards_TEF-CRI.csv');
        const treffer = (roh.match(/\['0/g) || []).length;
        assert.equal(treffer, 0,
            `TEF-CRI enthaelt wieder Listen-Text (${treffer} Stellen)`);
    });
});

// ---------------------------------------------------------------------------
// Doppeltes Mega-Praefix
// ---------------------------------------------------------------------------

describe('Der Namensaufloeser faengt das doppelte Mega-Praefix', () => {
    const laden = () => {
        const quelle =
            stueck(CITY, /function _normalizeArchetypeForMatch\([\s\S]*?\n        \}/, 'normalize')
            + '\n'
            + stueck(CITY, /function _normalizeArchetypeNoMega\(name\) \{[\s\S]*?\n        \}/, 'noMega');
        // eslint-disable-next-line no-new-func
        return new Function(quelle + '\nreturn _normalizeArchetypeNoMega;')();
    };

    it('die fuenf gemeldeten Namen loesen jetzt auf ihr sauberes Gegenstueck auf', () => {
        const f = laden();
        const paare = [
            ['Mega Mega Charizard-X Zoroark',              'Mega Charizard-X Zoroark'],
            ['Typhlosion Mega Mega Charizard-X',           'Typhlosion Mega Charizard-X'],
            ['Mega Mega Charizard-X Oricorio',             'Mega Charizard-X Oricorio'],
            ['Mega Mega Charizard-X Dudunsparce',          'Mega Charizard-X Dudunsparce'],
            ['Mega Mega Charizard-X Mega Mega Charizard-Y','Mega Charizard-X Mega Charizard-Y'],
        ];
        for (const [kaputt, sauber] of paare) {
            assert.equal(f(kaputt), f(sauber), kaputt);
        }
    });

    it('und die Mega-Stufe bleibt eine LETZTE Zuflucht, kein Schluessel', () => {
        // Mega Greninja und Greninja sind ZWEI Archetypen, beide mit Zahlen
        // in derselben Datei — gemessen: drei solche Paare allein im
        // globalen Meta (Greninja, Gengar, Feraligatr). Das Streichen des
        // Praefixes darf sie deshalb nie zusammenlegen, solange es einen
        // genauen Treffer gibt. Der Aufloeser prueft in dieser Reihenfolge:
        // exakt, normalisiert, erst dann ohne Mega.
        const quelle =
            stueck(CITY, /function _normalizeArchetypeForMatch\([\s\S]*?\n        \}/, 'normalize')
            + '\n'
            + stueck(CITY, /function _normalizeArchetypeNoMega\(name\) \{[\s\S]*?\n        \}/, 'noMega')
            + '\n'
            + stueck(CITY, /function _resolveArchetypeNames\(targets, dataArchetypes\) \{[\s\S]*?\n        \}/, 'resolve');
        // eslint-disable-next-line no-new-func
        const resolve = new Function('devLog',
            quelle + '\nreturn _resolveArchetypeNames;')(() => {});

        const daten = new Set(['Mega Greninja', 'Greninja', 'Mega Charizard-X Zoroark']);
        assert.deepEqual(resolve(['Mega Greninja'], daten), ['Mega Greninja']);
        assert.deepEqual(resolve(['Greninja'], daten), ['Greninja']);
        // Und der kaputte Name findet sein sauberes Gegenstueck:
        assert.deepEqual(resolve(['Mega Mega Charizard-X Zoroark'], daten),
                         ['Mega Charizard-X Zoroark']);
    });
});

// ---------------------------------------------------------------------------
// Turniergroesse unter der falschen Kennung
// ---------------------------------------------------------------------------

describe('Deck-Builder: die Turniergroesse wird auch unter der Limitless-ID gefunden', () => {
    it('die Bruecke ueber die Uebersichtsdatei ist da', () => {
        assert.match(BUILDER, /tournament_cards_data_overview\.csv/);
        assert.match(BUILDER, /if \(sizes\.has\(labs\)\) sizes\.set\(limitless, sizes\.get\(labs\)\)/);
    });

    it('die leeren Kennungen sind weg — die Bruecke bleibt trotzdem', () => {
        // WAR (bis 06.09.2026): NAIC 2026 stand mit 675 Listen und
        // 3.743 Spielern in der Datei — und `tournament_id` war LEER.
        // Der Fallback griff auf `limitless_tournament_id` '518', das in
        // keiner Labs-Datei steht; _sizeWeight(0) vergab still 0,5.
        //
        // IST: der volle Neulauf am 06.09.2026 hat die Kennungen gefuellt,
        // nachdem `data/labs_tournaments.json` wieder alle zwoelf Turniere
        // fuehrte (PR #692 — vorher fehlten vier, und ohne Eintrag konnte
        // die Aufloesung 518 -> 0070 nicht greifen). Gemessen: 0 Zeilen
        // ohne Kennung, NAIC steht auf '0070', Turin auf '0069',
        // Worlds auf '0071'.
        //
        // Die Bruecke in app-deck-builder.js bleibt: sie kostet nichts,
        // wenn die Kennungen stimmen, und faengt genau diesen Rueckfall
        // ab. Die Zusicherung darauf steht oben und ist unveraendert.
        const zeilen = lies('data/tournament_decklists_per_player.csv').split('\n');
        const kopf = zeilen[0].replace(/^﻿/, '').split(',');
        const iTid = kopf.indexOf('tournament_id');
        const iLim = kopf.indexOf('limitless_tournament_id');
        assert.ok(iTid >= 0 && iLim >= 0);
        const leer = zeilen.slice(1).filter(z => z && z.split(',')[iTid] === '');
        assert.equal(leer.length, 0,
            `${leer.length} Zeile(n) ohne tournament_id — der Rueckfall auf `
            + `limitless_tournament_id ist zurueck und _sizeWeight vergibt `
            + `wieder still 0,5. Erste betroffene Limitless-ID: `
            + (leer.length ? leer[0].split(',')[iLim] : '-'));
        // Und die Zuordnung stimmt inhaltlich, nicht nur formal:
        const naic = zeilen.slice(1).find(z => z && z.split(',')[iLim] === '518');
        assert.ok(naic, 'NAIC (518) ist nicht mehr in der Datei');
        assert.equal(naic.split(',')[iTid], '0070',
            'NAIC traegt eine andere Labs-Kennung als 0070');
    });

    it('und die Uebersetzung 518 -> 0070 ist dokumentiert', () => {
        const ov = JSON.parse(lies('data/labs_tournament_id_overrides.json'));
        assert.equal(ov.overrides['518'].labs_tournament_id, '0070');
        assert.ok(ov.overrides['518'].reason.length > 40);
    });
});

// ---------------------------------------------------------------------------
// Saisonpause gegen fehlenden Schnappschuss
// ---------------------------------------------------------------------------

describe('City League: zwei Faelle, zwei Meldungen', () => {
    const laden = (fenster, ausgewichen) => {
        const quelle =
            'var _clFormatFenster = ' + JSON.stringify(fenster) + ';\n'
            + 'var _clAusgewichen = ' + (ausgewichen ? 'true' : 'false') + ';\n'
            + stueck(CITY, /function cityLeagueTageSeitRotation\(\) \{[\s\S]*?\n\}/, 'tage')
            + '\n'
            + stueck(CITY, /function cityLeagueOffSeasonHtml\(istVergangenheit\) \{[\s\S]*?\n\}/, 'offSeason');
        // eslint-disable-next-line no-new-func
        return new Function('window', 'getLang',
            quelle + '\nreturn cityLeagueOffSeasonHtml;')({}, () => 'de');
    };

    it('das laufende Format bekommt die Pause samt Zahl der Tage', () => {
        const f = laden({ jp_release_date: '2026-07-31' });
        const html = f(false);
        assert.match(html, /Saisonpause in Japan/);
        assert.match(html, /Die Rotation liegt \d+ Tage zurück/);
    });

    it('die Vergangenheit pausiert nicht — dort fehlt der Schnappschuss', () => {
        const f = laden({ jp_release_date: '2026-07-31' });
        const html = f(true);
        assert.match(html, /Kein Vergangenheits-Schnappschuss/);
        assert.doesNotMatch(html, /Saisonpause/);
        assert.match(html, /Die Vergangenheit pausiert nicht/);
    });

    it('ohne Formatfenster wird keine Zahl erfunden', () => {
        const f = laden(null);
        const html = f(false);
        assert.match(html, /Saisonpause in Japan/);
        assert.doesNotMatch(html, /Tage zurück/);
    });

    it('nach dem Ausweichen sagt die Meldung, dass BEIDES fehlt', () => {
        // Wer den laufenden Reiter oeffnet, landet ueber
        // _applyCityLeaguePastFallback im Vergangenheitsformat. Ohne diese
        // Notiz stuende "Kein Vergangenheits-Schnappschuss" ueber einer
        // Ansicht, nach der niemand gefragt hat.
        const f = laden({ jp_release_date: '2026-07-31' }, true);
        const html = f(true);
        assert.match(html, /Keine City-League-Daten/);
        assert.match(html, /Im laufenden Format ist noch kein Turnier gescrapt/);
        assert.match(html, /Vergangenheits-Schnappschuss fehlt ebenfalls/);
        assert.match(html, /die Rotation liegt \d+ Tage zurück/);
    });

    it('und der Aufrufer reicht durch, um welchen Reiter es geht', () => {
        assert.match(CITY, /cityLeagueOffSeasonHtml\(format === 'past'\)/);
        assert.match(CITY, /_clAusgewichen = true;/);
    });
});
