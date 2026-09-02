'use strict';
/*
 * Drei Befunde aus der Prüfrunde, alle am 02.09.2026 behoben.
 *
 * Die ursprüngliche Meldung lautete: „'Day 2' bei Turnieren ohne Cut,
 * drei hart verdrahtete Stellen, plus ein intransitiver Vergleicher."
 *
 * Nachgemessen stimmte der erste Teil so nicht: alle 71 Turniere in
 * data/labs_tournament_decks.csv HABEN einen zweiten Tag (0 ohne).
 * Der Day-2-Datentopf ist sauber. Gefunden wurden stattdessen drei
 * andere, echte Fehler.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKomm = (q) => q.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const MC = ohneKomm(lies('js/app-meta-call.js'));
const KARTE = ohneKomm(lies('js/app-archetype-card.js'));
const BILD = ohneKomm(lies('js/ds-share.js'));
const I18N = lies('js/i18n.js');

describe('Befund 1 — der Vergleicher ist transitiv', () => {

    it('kein Toleranzvergleich mehr in der Empfehlungssortierung', () => {
        /* `Math.abs(a - b) > t` ist keine Aequivalenzrelation: A≈B und
           B≈C heisst nicht A≈C. Der Vergleicher war damit nicht
           transitiv, und Array.prototype.sort liefert dann eine
           Reihenfolge, die von der EINGABEreihenfolge abhaengt.

           Nachgerechnet an echten Werten (Majors seit 2026-05-01):
             A Rocket's Honchkrow        conv 0,1665  WR 41,11 %
             B Ogerpon Meganium Arboliva conv 0,1490  WR 42,08 %
             C Tera Box                  conv 0,1000  WR 42,58 %
           |A-B| = 0,0174 ≤ 0,05 → WR → B vor A
           |B-C| = 0,0490 ≤ 0,05 → WR → C vor B
           |A-C| = 0,0665 > 0,05 → conv → A vor C
           Zyklus A < C < B < A. Alle sechs Eingabereihenfolgen ergaben
           VIER verschiedene Ausgaben.

           Und diese Liste wird gegen DAY2_THRESHOLD geschnitten und im
           geteilten Bild veroeffentlicht. */
        const i = MC.indexOf('const raster = (wert, weite)');
        assert.ok(i > 0,
            'die gerundeten Sortierschluessel sind weg — dann stehen dort '
            + 'wieder Toleranzvergleiche, und die Rangliste haengt von der '
            + 'Eingabereihenfolge ab');
        const rumpf = MC.slice(i, i + 500);
        assert.ok(!/Math\.abs\(\s*a\.day2Prob\s*-\s*b\.day2Prob\s*\)/.test(rumpf)
                  && !/Math\.abs\(\s*ac\s*-\s*bc\s*\)/.test(rumpf),
            'der Toleranzvergleich ist zurueck');
        assert.match(rumpf, /raster\(b\.day2Prob, 0\.02\) - raster\(a\.day2Prob, 0\.02\)/,
            'der erste Schluessel wird nicht mehr gerastert');
        assert.match(rumpf, /raster\(b\.empConv, 0\.05\) - raster\(a\.empConv, 0\.05\)/,
            'der zweite Schluessel wird nicht mehr gerastert');
    });

    it('die Ordnung haengt nicht mehr von der Eingabereihenfolge ab', () => {
        // Der echte Vergleicher, aus der Quelle geschnitten und ausgefuehrt.
        const i = MC.indexOf('const raster = (wert, weite)');
        const ende = MC.indexOf('return b.avgWR - a.avgWR;', i);
        assert.ok(ende > i, 'der Vergleicherrumpf ist nicht mehr auffindbar');
        const koerper = MC.slice(i, ende) + 'return b.avgWR - a.avgWR;';
        // eslint-disable-next-line no-new-func
        const cmp = new Function('a', 'b', koerper);

        const A = { n: 'A', day2Prob: 0.5, empConv: 0.1665, avgWR: 41.11 };
        const B = { n: 'B', day2Prob: 0.5, empConv: 0.1490, avgWR: 42.08 };
        const C = { n: 'C', day2Prob: 0.5, empConv: 0.1000, avgWR: 42.58 };
        const perms = [[A,B,C],[A,C,B],[B,A,C],[B,C,A],[C,A,B],[C,B,A]];
        const ausgaben = new Set(
            perms.map(p => [...p].sort(cmp).map(x => x.n).join('>')));
        assert.strictEqual(ausgaben.size, 1,
            `dieselben drei Decks ergeben ${ausgaben.size} verschiedene `
            + `Reihenfolgen, je nachdem wie sie hineingehen: `
            + `${[...ausgaben].join(' / ')}`);

        // Und die Relation selbst ist widerspruchsfrei.
        for (const [x, y, z] of [[A,B,C],[A,C,B],[B,A,C],[B,C,A],[C,A,B],[C,B,A]]) {
            if (cmp(x, y) <= 0 && cmp(y, z) <= 0) {
                assert.ok(cmp(x, z) <= 0,
                    `${x.n} ≤ ${y.n} und ${y.n} ≤ ${z.n}, aber ${x.n} > ${z.n}`);
            }
        }
    });
});

describe('Befund 2 — "Day 2" nur, wo es einen zweiten Tag gibt', () => {

    it('Kopf, Achse und Abzeichen haengen am Turniertyp', () => {
        /* Der Code weiss es selbst: "Die beiden lokalen Typen
           (Challenge, Cup) haben keinen zweiten Tag." Trotzdem stand an
           vier Stellen hart "Day 2" — auf dem Cup-Reiter las man
           "≥12 = Day 2" und "{n} Day-2-faehig", waehrend die Pille
           INNERHALB derselben Tabelle laengst "Top 8" schrieb. */
        assert.match(MC, /function _zielKurz\(\)/,
            'der typbewusste Kurzname ist weg');
        const i = MC.indexOf('function _zielKurz()');
        const rumpf = MC.slice(i, MC.indexOf('\n  }', i));
        assert.match(rumpf, /cup/, '_zielKurz kennt den Cup nicht mehr');
        assert.match(rumpf, /challenge/, '_zielKurz kennt die Challenge nicht mehr');

        for (const stelle of ['mc.histZielLabel', 'mc.recHintZiel',
                              'mc.recBadgeZielCount']) {
            assert.ok(MC.includes(stelle),
                `${stelle} wird nicht mehr benutzt — dann steht dort wieder `
                + 'hart "Day 2"');
        }
        // Die drei Texte setzen das Ziel ein, statt es zu nennen.
        const holen = (sch) => [...I18N.matchAll(
            new RegExp("'" + sch.replace(/\./g, '\\.') + "':\\s*'([^']*)'", 'g'))]
            .map((m) => m[1]);
        for (const sch of ['mc.histZielLabel', 'mc.recHintZiel',
                           'mc.recBadgeZielCount', 'mc.subtitle']) {
            const werte = holen(sch);
            assert.strictEqual(werte.length, 2,
                `${sch} steht ${werte.length}× in i18n.js, erwartet 2`);
            for (const w of werte) {
                assert.ok(w.includes('{ziel}'),
                    `${sch} steht wieder hart auf einem Ziel: "${w}"`);
                assert.ok(!/Day.?2/i.test(w),
                    `${sch} nennt weiter "Day 2": "${w}"`);
            }
        }
    });

    it('die Pille benutzt denselben Schalter, nicht ihren eigenen', () => {
        // Den Rumpf von _zielKurz herausnehmen — dort GEHOERT die
        // Typ-Unterscheidung hin; gesucht wird eine ZWEITE Kopie.
        const iZ = MC.indexOf('function _zielKurz()');
        const ohneZiel = MC.slice(0, iZ) + MC.slice(MC.indexOf('\n  }', iZ));
        /* Gesucht wird der ETIKETTENBAU — eine Vorlagenzeichenkette
           "Top ${...topCutSize...}" — nicht die Einstellungslogik, die
           topCutSize setzt oder ins Formularfeld schreibt. Die erste
           Fassung dieser Zusage war zu breit und traf beides. */
        assert.ok(!/`Top \$\{[^`]*topCutSize/.test(ohneZiel),
            'die Pille hat wieder ihre eigene Kopie der Typ-Unterscheidung — '
            + 'zwei Schalter fuer dieselbe Frage laufen irgendwann auseinander');
        assert.match(MC, /const pillLabel = _zielKurz\(\);/,
            'die Pille haengt nicht mehr am gemeinsamen Schalter');
    });
});

describe('Befund 3 — das Bild widerspricht der Seite nicht mehr', () => {

    it('Kachel und Bild teilen sich eine Schranke', () => {
        /* Die Kachel schwieg unter 5 Antritten ("zu wenige Antritte"),
           das geteilte Bild druckte trotzdem eine harte Prozentzahl.
           Gemessen im aktuellen Format (TEF-PBL, Worlds San Francisco):
           26 von 44 Decks haben 1 bis 4 Antritte — bei 59 % der Decks
           widersprach das Bild also der Seite, von der es stammt.
           Beispiele: Lucario Hariyama "66,7 %" (2 von 3), Mega Chandelure
           "50,0 %" (1 von 2). */
        assert.match(KARTE, /const DAY2_MIN_ANTRITTE = \d+;/,
            'die Schranke hat keinen Namen mehr — dann steht sie wieder '
            + 'zweimal als nackte Zahl da und laeuft auseinander');
        const m = /const DAY2_MIN_ANTRITTE = (\d+);/.exec(KARTE);
        assert.ok(Number(m[1]) >= 3,
            `die Schranke steht auf ${m[1]} Antritten — "2 von 3" sind `
            + '66,7 % und sagen nichts');

        // Die Kachel benutzt sie.
        assert.match(KARTE, /m\.day1 >= DAY2_MIN_ANTRITTE\)\s*\n?\s*\? tile\('day2'/,
            'die Kachel prueft die Schranke nicht mehr');
        // Und das, was ins Bild geht, auch.
        const i = KARTE.indexOf('majorDay2:');
        const rumpf = KARTE.slice(i, i + 260);
        assert.match(rumpf, /m\.day1 >= DAY2_MIN_ANTRITTE/,
            'das Bild bekommt die Day-2-Quote wieder ungefiltert — dann '
            + 'druckt es eine Zahl, wo die Seite daneben schweigt');
        assert.match(KARTE, /majorDay2Antritte:/,
            'die Antrittszahl wird nicht mehr ans Bild durchgereicht — dann '
            + 'kann es "war nicht dabei" nicht von "zu wenige" trennen');
    });

    it('das Bild trennt "zu wenige" von "keine Daten"', () => {
        assert.match(BILD, /zu wenige Antritte/,
            'das Bild sagt bei kleiner Stichprobe wieder "keine Daten" — das '
            + 'ist etwas anderes als "war dabei, aber zu selten"');
        assert.match(BILD, /majorDay2Antritte/,
            'das Bild liest die Antrittszahl nicht mehr');
    });
});
