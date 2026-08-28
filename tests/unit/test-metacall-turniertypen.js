/**
 * Turniertypen im Meta Call — Weltmeisterschaft, Regional/SPE,
 * International, Challenge, Cup.
 *
 * Der Betreiber hat die Regel am 28.08.2026 vorgegeben:
 *   "Es gilt immer erst mal 8 Runden und dann braucht es 16 Punkte,
 *    um Day Two zu erreichen. Für den Sieg gibt es 3 Punkte, für die
 *    Niederlage 0, für das Unentschieden 1. […] standardmäßig wird
 *    bitte immer mit 8 Runden und 16 Punkten gerechnet."
 * Neun Runden bleiben als Ausnahme waehlbar und brauchen dann 19
 * Punkte (6-2-1) — dieselbe Zahl, die tests/unit/test-turnierbild.js
 * bereits als die alte Neun-Runden-Schwelle protokolliert.
 *
 * Diese Datei prueft die Zahlen an der Quelle, nicht an einer
 * Nachbildung: die Konstanten und _defaultTargetPoints werden aus
 * js/app-meta-call.js herausgeschnitten und ausgefuehrt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC    = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
const I18N  = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const BJ    = fs.readFileSync(path.join(ROOT, 'js', 'battle-journal.js'), 'utf8');
const SHARE = fs.readFileSync(path.join(ROOT, 'js', 'ds-share.js'), 'utf8');
const HTML  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* Schneidet eine Funktion samt Rumpf aus dem Quelltext. Gezaehlt
 * werden geschweifte Klammern ab der ersten — das reicht hier, weil
 * die betroffene Funktion weder Vorlagenliterale noch Klammern in
 * Zeichenketten enthaelt. Findet sie sich nicht, schlaegt der Test
 * fehl statt still eine leere Zeichenkette zu liefern. */
function schneideFunktion(quelle, name) {
    const start = quelle.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    let i = quelle.indexOf('{', start), tiefe = 0;
    for (let j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

function lies(regex, was) {
    const m = MC.match(regex);
    assert.ok(m, `${was} steht nicht mehr in js/app-meta-call.js`);
    return m;
}

describe('Meta Call: die fuenf Turniertypen', () => {
    it('alle fuenf stehen zur Auswahl', () => {
        const m = lies(/const TOURNAMENT_TYPES = \[([^\]]+)\]/, 'TOURNAMENT_TYPES');
        const typen = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
        assert.deepEqual(typen, ['worlds', 'regional', 'international', 'challenge', 'cup']);
    });

    it('die drei grossen Turniere sind als Gruppe benannt', () => {
        const m = lies(/const MAJOR_TYPES = \[([^\]]+)\]/, 'MAJOR_TYPES');
        const typen = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
        assert.deepEqual(typen, ['worlds', 'regional', 'international']);
    });

    it('jeder grosse Typ startet mit acht Runden und 16 Punkten', () => {
        ['worlds', 'regional', 'international'].forEach(typ => {
            const m = lies(
                new RegExp(typ + ':\\s*\\{[^}]*rounds:\\s*(\\d+)[^}]*day2Points:\\s*(\\d+)'),
                `die Voreinstellung fuer ${typ}`,
            );
            assert.equal(Number(m[1]), 8, `${typ} startet nicht mit acht Runden`);
            assert.equal(Number(m[2]), 16, `${typ} startet nicht mit 16 Punkten`);
        });
    });

    it('die lokalen Typen bleiben unangetastet', () => {
        const c = lies(/challenge:\s*\{[^}]*rounds:\s*(\d+)[^}]*day2Points:\s*(\d+)/, 'Challenge');
        assert.equal(Number(c[1]), 5);
        assert.equal(Number(c[2]), 13);
        const p = lies(/cup:\s*\{[^}]*rounds:\s*(\d+)[^}]*day2Points:\s*(\d+)/, 'Cup');
        assert.equal(Number(p[1]), 5);
        assert.equal(Number(p[2]), 12);
    });
});

describe('Meta Call: acht Runden brauchen 16 Punkte, neun brauchen 19', () => {
    // Die echte Funktion, nicht nachgebaut.
    const quelle = [
        "const MAJOR_TYPES = ['worlds','regional','international'];",
        lies(/const MAJOR_DAY2_POINTS = \{[^}]*\};/, 'MAJOR_DAY2_POINTS')[0],
        schneideFunktion(MC, '_defaultTargetPoints'),
        'return _defaultTargetPoints;',
    ].join('\n');
    const zielpunkte = new Function(quelle)();

    it('die Tabelle nennt genau 8 -> 16 und 9 -> 19', () => {
        const m = lies(/const MAJOR_DAY2_POINTS = \{([^}]*)\}/, 'MAJOR_DAY2_POINTS');
        const paare = m[1].split(',').map(x => x.trim()).filter(Boolean);
        assert.deepEqual(paare, ['8: 16', '9: 19']);
    });

    it('acht Runden ergeben 16 Punkte — auf jedem grossen Turnier', () => {
        ['worlds', 'regional', 'international'].forEach(typ => {
            assert.equal(zielpunkte(typ, 8, 8), 16, `${typ} rechnet nicht mit 16`);
        });
    });

    it('neun Runden ergeben 19 Punkte', () => {
        ['worlds', 'regional', 'international'].forEach(typ => {
            assert.equal(zielpunkte(typ, 9, 8), 19, `${typ} rechnet nicht mit 19`);
        });
    });

    it('eine ungewoehnliche Rundenzahl bleibt nicht auf der alten Zahl stehen', () => {
        // 7 Runden gibt es auf grossen Turnieren nicht, aber wenn jemand
        // sie eintraegt, darf die Schwelle nicht bei 16 haengen bleiben.
        assert.equal(zielpunkte('regional', 7, 8), 13);
        assert.notEqual(zielpunkte('regional', 7, 8), 16);
    });

    it('die lokalen Typen rechnen weiter nach ihrer eigenen Regel', () => {
        assert.equal(zielpunkte('challenge', 5, 0), 13);
        assert.equal(zielpunkte('cup', 5, 8), 12);
        assert.equal(zielpunkte('cup', 5, 4), 13);
    });
});

describe('Meta Call: die Runden-Auswahl bietet acht oder neun', () => {
    it('bei grossen Turnieren steht eine Auswahl statt eines Zahlenfelds', () => {
        assert.match(MC, /istMajor[\s\S]{0,200}<select id="mc-rounds"/);
    });

    it('sie bietet genau 8 und 9', () => {
        const block = MC.slice(MC.indexOf('<select id="mc-rounds"'));
        const werte = [...block.slice(0, 600).matchAll(/<option value="(\d+)"/g)].map(m => m[1]);
        assert.deepEqual(werte, ['8', '9']);
    });

    it('eine Rundenaenderung zieht die Punkte nach — auch beim Regional', () => {
        // Vorher lief die Kaskade nur fuer die lokalen Typen; ein
        // Regional blieb auf 16 stehen, auch wenn neun Runden gewaehlt
        // waren. Genau das war der Fehler.
        assert.match(MC, /if \(key === 'rounds'\) \{/);
        assert.doesNotMatch(MC, /if \(key === 'rounds' && _settings\.tournamentType !== 'regional'\)/);
    });
});

describe('Turniertypen: Beschriftungen in beiden Sprachen', () => {
    const SCHLUESSEL = [
        'mc.tournamentTypeWorlds', 'mc.tournamentTypeWorldsDesc',
        'mc.tournamentTypeInternational', 'mc.tournamentTypeInternationalDesc',
        'mc.rounds8', 'mc.rounds9',
    ];
    it('jeder neue Schluessel steht zweimal — einmal EN, einmal DE', () => {
        SCHLUESSEL.forEach(k => {
            const n = I18N.split(`'${k}':`).length - 1;
            assert.equal(n, 2, `${k} steht ${n}-mal statt zweimal in i18n.js`);
        });
    });
    it('die deutschen Beschriftungen nutzen die Szenesprache', () => {
        // "Runden", "Day 2", "Tie" — nicht "Durchgaenge" oder "Unentschieden".
        const de = I18N.slice(I18N.indexOf("'mc.tournamentTypeWorlds':", I18N.indexOf("'mc.tournamentTypeWorlds':") + 10));
        assert.match(de.slice(0, 4000), /'mc\.rounds8':\s*'8 Runden'/);
    });
});

describe('Battle Journal: Worlds und International sind waehlbar', () => {
    ['battleJournalTypeGroup', 'bjEditTournTypeGroup', 'maFilterTypeChips'].forEach(id => {
        it(`${id} bietet Worlds, Regional/SPE und International`, () => {
            const start = HTML.indexOf(`id="${id}"`);
            assert.notEqual(start, -1, `${id} ist nicht mehr in index.html`);
            const block = HTML.slice(start, HTML.indexOf('</div>', start));
            ['Worlds', 'Regional/SPE', 'International'].forEach(wert => {
                assert.ok(
                    block.includes(`data-value="${wert}"`),
                    `${id} hat keinen Knopf fuer ${wert}`,
                );
            });
            assert.ok(
                !block.includes('data-value="Regional/SPE/IC"'),
                `${id} bietet noch den alten Sammeltopf Regional/SPE/IC an`,
            );
        });
    });

    it('Alteintraege wandern beim Lesen nach Regional/SPE', () => {
        assert.match(BJ, /'Regional\/SPE\/IC':\s*'Regional\/SPE'/);
        assert.match(BJ, /'Regional':\s*'Regional\/SPE'/);
        assert.match(BJ, /'Special Event':\s*'Regional\/SPE'/);
    });
});

describe('Turnierbild: der Day-2-Marker kennt die neuen Typwerte', () => {
    it('Worlds, International und Regional/SPE bekommen einen zweiten Tag', () => {
        const m = SHARE.match(/var DAY2_TYPEN = \[([^\]]+)\]/);
        assert.ok(m, 'DAY2_TYPEN ist nicht mehr auffindbar');
        const typen = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
        ['worlds', 'international', 'regional/spe'].forEach(t => {
            assert.ok(typen.includes(t), `${t} fehlt in DAY2_TYPEN`);
        });
    });

    it('der alte Sammelwert bleibt stehen, damit Altbilder stimmen', () => {
        // Eintraege, die noch nicht durch die Lesezeit-Migration gelaufen
        // sind, duerfen ihren Marker nicht verlieren.
        assert.match(SHARE, /'regional\/spe\/ic'/);
    });

    it('Cup und Challenge bekommen weiterhin keinen', () => {
        const m = SHARE.match(/var DAY2_TYPEN = \[([^\]]+)\]/);
        const typen = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
        ['cup', 'challenge', 'online', 'testing'].forEach(t => {
            assert.ok(!typen.includes(t), `${t} steht faelschlich in DAY2_TYPEN`);
        });
    });
});
