/**
 * Die wenigen echten Rechenfehler — Gruppe 12 der Pruefrunde vom
 * 20.08.2026.
 *
 * An diesen Stellen war nicht die Beschriftung falsch, sondern die Formel
 * selbst. Sie sitzen fast alle in den Nebenrechnern, und jede einzelne
 * laesst sich gegen eine unabhaengige Rechnung pruefen — genau das tut
 * diese Datei. Wo eine Formel eine geschlossene Loesung hat, steht die
 * geschlossene Loesung als Referenz daneben; wo sie eine Simulation ist,
 * wird sie gegen ihre analytische Kennzahl gehalten.
 *
 * Fixpunkte aus der Messung, die hier festgehalten werden:
 *   * K.O.-Chance: 53,3 % der geprueften Kombinationen wichen ab, bis zu
 *     43,8 Prozentpunkte. Basis 13 in 45 KP las "4HKO 50 %", richtig
 *     sind 93,8 %.
 *   * 332 von 21.336 Kombinationen meldeten "5+HKO 0 %", obwohl schon
 *     der niedrigste Wurf fuenfmal toetet.
 *   * 32 Schadensattacken im Champions-Pool sind Flaechenattacken.
 *   * Mulligan-Regel: senkt eine Kombo-Wahrscheinlichkeit um 1,4 bis
 *     3,0 Prozentpunkte — in die Richtung, die niemand erwartet.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function schnitt(quelle, von, bis, was) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anker fehlt (${was}): ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endanker fehlt (${was}): ${bis}`);
    return quelle.slice(a, b + bis.length);
}

function ladeChampions() {
    const w = {};
    // eslint-disable-next-line no-new-func
    new Function('window', lies('js/champions-damage.js'))(w);
    return w.ChampionsDamage;
}

// ───────────────────────────────────────────────────────────────────
// 1. Die K.O.-Wahrscheinlichkeit rechnet mit unabhaengigen Wuerfen
// ───────────────────────────────────────────────────────────────────
describe('K.O.-Chance: n Treffer sind n Wuerfe, nicht ein Wurf mal n', () => {
    const CD = ladeChampions();

    /**
     * Unabhaengige Referenz: die Verteilung der Summe aus n Wuerfen,
     * exakt per Faltung. Absichtlich naiv geschrieben — sie soll leicht
     * nachzulesen sein, nicht schnell.
     */
    function referenz(rolls, hp, maxN) {
        let v = new Map([[0, 1]]);
        const p = 1 / rolls.length;
        for (let n = 1; n <= maxN; n++) {
            const w = new Map();
            for (const [s, q] of v) for (const r of rolls) w.set(s + r, (w.get(s + r) || 0) + q * p);
            v = w;
            let c = 0;
            for (const [s, q] of v) if (s >= hp) c += q;
            if (c > 0) return { hits: n, chance: c > 1 - 1e-9 ? 1 : c };
        }
        return { hits: null, chance: 0 };
    }
    const wuerfe = (basis) => CD.ROLLS.map(r => Math.max(1, Math.floor(basis * r)));

    it('stimmt ueber 25.000 Kombinationen exakt mit der Referenz ueberein', () => {
        let n = 0, abw = 0, maxD = 0;
        for (let bs = 3; bs <= 60; bs++) {
            const rolls = wuerfe(bs);
            for (let hp = 20; hp <= 450; hp++) {
                n++;
                const a = CD.koChance(rolls, hp);
                const b = referenz(rolls, hp, CD.KO_MAX_HITS);
                if (a.hits !== b.hits) abw++;
                else maxD = Math.max(maxD, Math.abs(a.chance - b.chance));
            }
        }
        assert.ok(n > 24000, 'zu wenige Kombinationen geprueft');
        assert.equal(abw, 0, 'Trefferzahl weicht ab');
        assert.ok(maxD < 1e-12, `groesste Abweichung der Chance: ${maxD}`);
    });

    it('der gemeldete Fall: Basis 13 in 45 KP ist 4HKO zu 93,8 %, nicht zu 50 %', () => {
        const ko = CD.koChance(wuerfe(13), 45);
        assert.equal(ko.hits, 4);
        assert.equal(Math.round(ko.chance * 1000) / 10, 93.8);
        // Der alte Weg zaehlte EINZELWUERFE und kam deshalb nur auf
        // Sechzehntel: 8 von 16 = 50 %.
        const alt = wuerfe(13).filter(r => r * 4 >= 45).length / 16;
        assert.equal(alt, 0.5, 'die Gegenprobe auf das alte Verhalten stimmt nicht mehr');
    });

    it('die Chance ist kein Vielfaches von 1/16 mehr', () => {
        // Das war das sichtbare Merkmal des Fehlers: bei zwei, drei oder
        // vier Treffern konnte nur 6,25 %, 12,5 %, 18,75 % … herauskommen,
        // weil immer nur 16 Einzelwuerfe gezaehlt wurden.
        let nichtSechzehntel = 0, mehrfach = 0;
        for (let bs = 8; bs <= 40; bs++) {
            for (let hp = 40; hp <= 200; hp++) {
                const ko = CD.koChance(wuerfe(bs), hp);
                if (!ko || ko.hits == null || ko.hits < 2 || ko.chance >= 1) continue;
                mehrfach++;
                if (Math.abs(ko.chance * 16 - Math.round(ko.chance * 16)) > 1e-9) nichtSechzehntel++;
            }
        }
        assert.ok(mehrfach > 100, 'zu wenige Mehrfach-K.O. im Pruefbereich');
        assert.ok(nichtSechzehntel / mehrfach > 0.8,
            `nur ${nichtSechzehntel} von ${mehrfach} sind keine Sechzehntel — `
            + 'die alte Zaehlung ueber Einzelwuerfe ist zurueck');
    });

    it('ein garantierter 5HKO ist eine Garantie, kein "0 %"', () => {
        // 21.336 Kombinationen geprueft, 332 davon meldeten frueher
        // "5+HKO 0 %", obwohl der NIEDRIGSTE Wurf fuenfmal toetet.
        //
        // Die Bedingung ist ZWEISEITIG, und die zweite Seite ist die,
        // die man beim Schreiben des Tests zuerst falsch hinschreibt:
        //   * fuenf NIEDRIGSTE Wuerfe toeten  -> fuenf Treffer sind sicher
        //   * vier HOECHSTE Wuerfe toeten nicht -> vier reichen NIE
        // Nur wenn beides gilt, ist die Antwort "5HKO, garantiert". Steht
        // nur die erste Haelfte da, faengt man auch die Faelle ein, in
        // denen vier Treffer mit Glueck reichen — und dort ist hits = 4
        // mit einer Teilchance richtig.
        let garantiert = 0, falsch = 0;
        for (let bs = 5; bs <= 60; bs++) {
            const rolls = wuerfe(bs);
            const min = rolls[0], max = rolls[rolls.length - 1];
            for (let hp = 20; hp <= 400; hp++) {
                if (!(min * 5 >= hp && max * 4 < hp)) continue;
                garantiert++;
                const ko = CD.koChance(rolls, hp);
                if (!(ko.hits === 5 && ko.chance === 1)) falsch++;
            }
        }
        assert.ok(garantiert > 100, `zu wenige garantierte 5HKO im Pruefbereich: ${garantiert}`);
        assert.equal(falsch, 0, `${falsch} von ${garantiert} garantierten 5HKO falsch gemeldet`);
    });

    it('sie rechnet bis neun Treffer', () => {
        assert.equal(CD.KO_MAX_HITS, 9);
        // Sehr schwacher Angriff gegen viele KP: irgendwo zwischen 6 und 9.
        const ko = CD.koChance(wuerfe(20), 150);
        assert.ok(ko.hits >= 6 && ko.hits <= 9, JSON.stringify(ko));
    });

    it('und meldet ehrlich, wenn es keinen K.O. gibt', () => {
        const ko = CD.koChance(wuerfe(1), 400);
        assert.equal(ko.hits, null, 'ohne K.O. darf keine Trefferzahl behauptet werden');
        assert.equal(ko.chance, 0);
    });

    it('ohne KP oder ohne Wuerfe gibt es kein Ergebnis', () => {
        assert.equal(CD.koChance(wuerfe(20), 0), null);
        assert.equal(CD.koChance([], 100), null);
    });

    it('bleibt schnell genug fuer ein volles Matchup-Gitter', () => {
        const t0 = process.hrtime.bigint();
        let n = 0;
        for (let bs = 10; bs <= 50; bs += 2) {
            const rolls = wuerfe(bs);
            for (let hp = 100; hp <= 300; hp += 5) { CD.koChance(rolls, hp); n++; }
        }
        const us = Number(process.hrtime.bigint() - t0) / 1000 / n;
        assert.ok(us < 500, `${us.toFixed(0)} us pro Aufruf — zu langsam fuers Gitter`);
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Flaechenattacken im Doppelkampf
// ───────────────────────────────────────────────────────────────────
describe('Doppelmodus: der 0,75-Abzug fuer Flaechenattacken', () => {
    const RES = JSON.parse(lies('data/champions_resources.json'));
    const attacken = RES.entries.filter(e => e.cat === 'move');

    it('die Attackendaten fuehren jetzt ein Zielfeld', () => {
        const ohneZiel = attacken.filter(m => m.power && typeof m.spread !== 'boolean');
        assert.equal(ohneZiel.length, 0,
            'Schadensattacken ohne Zielangabe: ' + ohneZiel.map(m => m.en).slice(0, 8).join(', '));
        assert.ok(attacken.every(m => !m.power || Number.isInteger(m.target)),
            'target fehlt bei mindestens einer Schadensattacke');
    });

    it('die bekannten Flaechenattacken sind als solche markiert', () => {
        // Nicht die vollstaendige Liste — nur die, bei denen ein Irrtum
        // sofort auffiele.
        for (const n of ['Earthquake', 'Rock Slide', 'Heat Wave', 'Blizzard',
            'Surf', 'Discharge', 'Dazzling Gleam', 'Hyper Voice', 'Muddy Water']) {
            const m = attacken.find(x => x.en === n);
            assert.ok(m, `${n} fehlt in den Attackendaten`);
            assert.equal(m.spread, true, `${n} ist nicht als Flaechenattacke markiert`);
        }
    });

    it('und Einzelziel-Attacken sind es nicht', () => {
        for (const n of ['Thunderbolt', 'Close Combat', 'Sucker Punch',
            'Knock Off', 'Iron Head', 'Burn Up']) {
            const m = attacken.find(x => x.en === n);
            assert.ok(m, `${n} fehlt`);
            assert.equal(m.spread, false, `${n} ist faelschlich als Flaeche markiert`);
        }
    });

    it('spread folgt dem Zielfeld — ausser wo die geprüfte Quelle widerspricht', () => {
        // Ableitung: target in {9, 11, 14}. Genau eine Ausnahme, und die
        // steht mit Begruendung im Builder: Matcha Gotcha traegt in der
        // Mainline-Quelle target 10, ist in Champions aber eine
        // Flaechenattacke — unsere hand-geprüfte deutsche Beschreibung
        // sagt das ausdruecklich.
        const FLAECHE = new Set([9, 11, 14]);
        const abweichend = attacken.filter(m =>
            typeof m.spread === 'boolean' && Number.isInteger(m.target)
            && m.spread !== FLAECHE.has(m.target)).map(m => m.en);
        assert.deepEqual(abweichend, ['Matcha Gotcha'],
            'unerwartete Abweichung zwischen target und spread');
        const mg = attacken.find(m => m.en === 'Matcha Gotcha');
        assert.match(mg.de_effect, /Trifft beide Gegner/,
            'die Begruendung der Ausnahme steht nicht mehr in den Daten');
    });

    it('32 Schadensattacken sind Flaechenattacken', () => {
        const n = attacken.filter(m => m.power && m.spread).length;
        assert.equal(n, 32);
        assert.equal(RES._meta.counts.spread, 32, 'die Zaehlung im _meta passt nicht dazu');
        assert.equal(RES._meta.counts.target_unknown, 0);
    });

    it('damageRange zieht bei spread genau ein Viertel ab', () => {
        const CD = ladeChampions();
        const gemein = {
            move: { power: 100, damage_class: 'Physical', type: 'Ground' },
            attackerStats: { atk: 200, spa: 150 },
            defenderStats: { def: 150, spd: 150, hp: 300 },
            attackerTypes: ['Steel'],
            effectiveness: 1,
        };
        const einzel = CD.damageRange(Object.assign({}, gemein, { spread: false }));
        const flaeche = CD.damageRange(Object.assign({}, gemein, { spread: true }));
        assert.ok(einzel && flaeche);
        // Bodenweise abgerundet, deshalb kein exaktes Verhaeltnis — aber
        // jeder Wurf muss der abgerundeten Dreiviertel-Zahl entsprechen.
        for (let i = 0; i < einzel.rolls.length; i++) {
            assert.equal(flaeche.rolls[i], Math.max(1, Math.floor(einzel.rolls[i] * 0.75)),
                `Wurf ${i}: ${flaeche.rolls[i]} statt ${Math.floor(einzel.rolls[i] * 0.75)}`);
        }
        assert.ok(flaeche.max < einzel.max);
    });

    it('die Matchup-Ansicht gibt den Modus weiter, statt fest false zu senden', () => {
        const MU = lies('js/app-side-quest-matchups.js');
        assert.ok(!/spread: false,/.test(MU),
            'der Aufruf steht wieder auf fest false');
        assert.ok(/spread: _format === 'doubles' && flaeche === true/.test(MU),
            'der Modus wird nicht durchgereicht');
        assert.ok(/zielUnbekannt/.test(MU),
            'eine Attacke ohne Zielangabe wird nicht ausgewiesen');
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Die Mulligan-Regel
// ───────────────────────────────────────────────────────────────────
describe('Starthand-Simulator: eine Hand ohne Basis-Pokemon gibt es nicht', () => {
    const SRC = lies('js/draw-simulator.js');
    const block = schnitt(SRC,
        'const KOMBO_ITERATIONEN = 10000;',
        "if (typeof window !== 'undefined') {", 'Kombo-Simulation');
    // eslint-disable-next-line no-new-func
    const sim = new Function(block.replace(/if \(typeof window[\s\S]*$/, '')
        + '; return _komboSimulation;')();

    function deck(N, basics, ziele) {
        const namen = [], basis = [];
        for (let i = 0; i < basics; i++) { namen.push('Basis' + i); basis.push(true); }
        for (let i = 0; i < ziele; i++) { namen.push('Ziel'); basis.push(false); }
        while (namen.length < N) { namen.push('x' + namen.length); basis.push(false); }
        return { namen, basis };
    }
    // Analytische Mulligan-Rate: C(N-B,7)/C(N,7).
    function rateAnalytisch(N, B) {
        const c = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
        return c(N - B, 7) / c(N, 7) * 100;
    }

    it('die gemessene Mulligan-Rate trifft die analytische', () => {
        for (const B of [6, 9, 14]) {
            const d = deck(60, B, 4);
            const e = sim(d.namen, d.basis, ['Ziel'], 120000);
            const soll = rateAnalytisch(60, B);
            assert.ok(Math.abs(e.mulliganRate - soll) < 1.0,
                `${B} Basics: gemessen ${e.mulliganRate.toFixed(2)} %, analytisch ${soll.toFixed(2)} %`);
        }
    });

    it('die Regel senkt die Kombo-Chance — und zwar messbar', () => {
        // Die Richtung ueberrascht: eine Hand, die ein Basis-Pokemon
        // enthalten MUSS, hat einen Platz weniger fuer die Zielkarte.
        const d = deck(60, 9, 4);
        const mit = parseFloat(sim(d.namen, d.basis, ['Ziel'], 200000).chance);
        const ohne = parseFloat(sim(d.namen, d.basis.map(() => null), ['Ziel'], 200000).chance);
        assert.ok(mit < ohne, `mit Regel ${mit} %, ohne ${ohne} % — die Regel wirkt nicht`);
        const diff = ohne - mit;
        assert.ok(diff > 1.5 && diff < 4,
            `erwartet wurden rund 2,5 pp Unterschied, gemessen ${diff.toFixed(2)} pp`);
    });

    it('weniger Basics heisst groesserer Unterschied', () => {
        const paare = [[6, null], [14, null]];
        for (const p of paare) {
            const d = deck(60, p[0], 4);
            const mit = parseFloat(sim(d.namen, d.basis, ['Ziel'], 200000).chance);
            const ohne = parseFloat(sim(d.namen, d.basis.map(() => null), ['Ziel'], 200000).chance);
            p[1] = ohne - mit;
        }
        assert.ok(paare[0][1] > paare[1][1],
            `6 Basics: ${paare[0][1].toFixed(2)} pp, 14 Basics: ${paare[1][1].toFixed(2)} pp`);
    });

    it('ohne Kartendaten wird die Regel nicht angewendet — und das steht in der Antwort', () => {
        const d = deck(60, 9, 4);
        const e = sim(d.namen, d.basis.map(() => null), ['Ziel'], 5000);
        assert.equal(e.mulliganAngewendet, false);
        assert.equal(e.grund, 'kartendaten-fehlen');
    });

    it('ein Deck ohne Basis-Pokemon laeuft nicht endlos', () => {
        const d = deck(60, 0, 4);
        const e = sim(d.namen, d.basis, ['Ziel'], 5000);
        assert.equal(e.mulliganAngewendet, false);
        assert.equal(e.grund, 'keine-basis');
        assert.ok(parseFloat(e.chance) > 0);
    });

    it('der Worker haengt an keinem <script>-Tag', () => {
        // Er lief bis zum 20.08.2026 zusaetzlich als normales Skript auf
        // der Hauptseite. Dort setzt `self.onmessage` einen Empfaenger auf
        // window, der jede fremde postMessage entgegennimmt — und die
        // Konstante im Dateikopf kollidierte mit derselben Konstante im
        // Simulator: "Identifier 'MULLIGAN_MAX' has already been
        // declared". Damit brach der ganze Skriptblock ab. Gefunden, weil
        // die Seite gefahren wurde, nicht weil der Quelltext gelesen wurde.
        assert.ok(!/combo-worker\.js/.test(lies('index.html')),
            'combo-worker.js steht wieder in index.html');
        assert.ok(/new Worker\('js\/combo-worker\.js'/.test(SRC),
            'der Worker wird gar nicht mehr geladen');
        assert.ok(/window\.APP_VERSION \? '\?v=' \+ window\.APP_VERSION/.test(SRC),
            'ohne Versionsstempel bekommt der Worker nie einen Cache-Bruch');
        // Und keine Deklaration mehr im Dateikopf, die kollidieren koennte.
        assert.ok(!/^const /m.test(lies('js/combo-worker.js')),
            'der Worker deklariert wieder etwas auf oberster Ebene');
    });

    it('der Web Worker rechnet dasselbe wie der Hauptthread', () => {
        // Zwei Umsetzungen derselben Formel sind genau die Konstellation,
        // in der eine von beiden still veraltet. Geprueft wird deshalb,
        // dass beide dieselbe Regel und dieselbe Obergrenze tragen.
        const W = lies('js/combo-worker.js');
        assert.ok(/MULLIGAN_MAX/.test(W), 'der Worker kennt die Mulligan-Regel nicht');
        assert.ok(/mulliganAngewendet/.test(W) && /kartendaten-fehlen/.test(W)
            && /keine-basis/.test(W), 'der Worker meldet den Grund nicht zurueck');
        assert.ok(/payload\.basis/.test(W), 'der Worker bekommt die Basis-Marken nicht');
        assert.ok(/basis: basis/.test(SRC), 'der Aufrufer schickt die Basis-Marken nicht mit');
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Binomial statt Poisson
// ───────────────────────────────────────────────────────────────────
describe('Begegnungen: dieselbe Verteilung wie die Day-2-Kette daneben', () => {
    const MC = lies('js/app-meta-call.js');
    const block = schnitt(MC, '  function binomialP(k, n, p) {',
        "  if (typeof window !== 'undefined') window._mcBinomialP = binomialP;", 'binomialP');
    // eslint-disable-next-line no-new-func
    const binom = new Function(block.replace(/\n\s*if \(typeof window[\s\S]*$/, '')
        + '; return binomialP;')();

    const ref = (k, n, p) => {
        const c = (n2, k2) => { let r = 1; for (let i = 1; i <= k2; i++) r = r * (n2 - k2 + i) / i; return r; };
        return c(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
    };

    it('stimmt mit der geschlossenen Form ueberein', () => {
        let max = 0;
        for (let n = 1; n <= 12; n++) {
            for (let k = 0; k <= n; k++) {
                for (let pi = 1; pi < 100; pi++) {
                    max = Math.max(max, Math.abs(binom(k, n, pi / 100) - ref(k, n, pi / 100)));
                }
            }
        }
        assert.ok(max < 1e-12, `groesste Abweichung: ${max}`);
    });

    it('die Randfaelle sind sauber', () => {
        assert.equal(binom(0, 9, 0), 1);
        assert.equal(binom(1, 9, 0), 0);
        assert.equal(binom(9, 9, 1), 1);
        assert.equal(binom(0, 9, 1), 0);
        assert.equal(binom(3, 2, 0.5), 0, 'mehr Treffer als Runden ist unmoeglich');
        assert.equal(binom(-1, 9, 0.5), 0);
    });

    it('summiert sich ueber alle Trefferzahlen auf eins', () => {
        for (const [n, p] of [[8, 0.1], [9, 0.25], [4, 0.4]]) {
            let s = 0;
            for (let k = 0; k <= n; k++) s += binom(k, n, p);
            assert.ok(Math.abs(s - 1) < 1e-12, `n=${n} p=${p}: Summe ${s}`);
        }
    });

    it('und weicht dort von Poisson ab, wo es der Befund sagt', () => {
        const poisson = (k, lam) => {
            let lp = -lam + k * Math.log(lam);
            for (let i = 1; i <= k; i++) lp -= Math.log(i);
            return Math.exp(lp);
        };
        // 9 Runden, Anteil 10 %: 36,6 % gegen 38,7 %.
        assert.equal(Math.round(binom(1, 9, 0.10) * 1000) / 10, 38.7);
        assert.equal(Math.round(poisson(1, 0.9) * 1000) / 10, 36.6);
        // Junk mit 40 % Feldanteil: 9,8 % gegen 6,0 %.
        assert.equal(Math.round(binom(1, 9, 0.40) * 1000) / 10, 6.0);
        assert.equal(Math.round(poisson(1, 3.6) * 1000) / 10, 9.8);
    });

    it('die Begegnungsliste ruft binomialP, nicht mehr poissonP', () => {
        const zeile = schnitt(MC, "      const pRunde =", "binomialP(2, _settings.rounds, pRunde) * 100;", 'Zeile');
        assert.ok(zeile.includes('binomialP(1,') && zeile.includes('binomialP(2,'));
        assert.ok(!zeile.includes('poissonP'));
    });

    it('und die Ueberschrift nennt die Verteilung, die gerechnet wird', () => {
        const I = lies('js/i18n.js');
        assert.ok(!/Poisson-Approximation/.test(I), 'die alte Ueberschrift ist zurueck');
        assert.match(I, /Erwartete Begegnungen \(binomial, \{r\} Runden\)/);
        assert.match(I, /Expected encounters \(binomial, \{r\} rounds\)/);
        assert.ok(/t\('mc\.encounters'\)\.replace\('\{r\}'/.test(MC),
            'der Platzhalter {r} wird nicht gefuellt');
    });
});

// ───────────────────────────────────────────────────────────────────
// 5. Zaehler und Nenner beschreiben dieselbe Menge
// ───────────────────────────────────────────────────────────────────
describe('Ø-Platzierung: fehlende Platzierungen zaehlen nirgends mit', () => {
    const CL = lies('js/app-city-league.js');

    it('deriveCityLeagueComparisonData teilt durch die gueltigen, nicht durch alle', () => {
        assert.ok(/placementCount: 0,/.test(CL), 'placementCount fehlt');
        assert.ok(/entry\.placementCount \+= 1;/.test(CL), 'placementCount wird nicht gezaehlt');
        assert.ok(/entry\.placementSum \/ entry\.placementCount/.test(CL),
            'geteilt wird wieder durch entry.count');
        assert.ok(!/entry\.count > 0 \? \(entry\.placementSum \/ entry\.count\)/.test(CL));
    });

    it('und der Mittelwert stimmt, wenn eine Zeile keine Platzierung hat', () => {
        const block = schnitt(CL, '            const grouped = new Map();',
            '            const totalCount = Array.from(grouped.values())', 'Gruppierung');
        const rumpf = `
            ${block}
            const e = grouped.get('A');
            return { count: e.count, sum: e.placementSum, pc: e.placementCount,
                     avg: e.placementCount > 0 ? e.placementSum / e.placementCount : 0 };
        `;
        // eslint-disable-next-line no-new-func
        const f = new Function('archetypesData', rumpf);
        // Vier Decks, zwei ohne Platzierung. Ø der gueltigen ist 3.
        const r = f([
            { archetype: 'A', placement: '2' },
            { archetype: 'A', placement: '4' },
            { archetype: 'A', placement: '' },
            { archetype: 'A', placement: null },
        ]);
        assert.equal(r.count, 4, 'alle vier Decks zaehlen als Decks');
        assert.equal(r.pc, 2, 'nur zwei tragen eine Platzierung');
        assert.equal(r.avg, 3, `Ø sollte 3 sein, war ${r.avg}`);
        // Der alte Weg haette 6/4 = 1,5 gerechnet — also eine deutlich
        // bessere Platzierung, als die Daten hergeben.
        assert.equal(r.sum / r.count, 1.5, 'die Gegenprobe auf den alten Weg stimmt nicht');
    });

    it('getCityLeagueArchetypeStats rechnet keine Null als Platzierung ein', () => {
        assert.ok(!/parseInt\(row\.placement \|\| 0, 10\)/.test(CL),
            '`row.placement || 0` ist zurueck — ein leeres Feld wird wieder zu Platz 0');
        assert.ok(/const platzierungen = matches/.test(CL));
        const block = schnitt(CL, '            const platzierungen = matches',
            "                : '-';", 'Archetyp-Mittelwert');
        const rumpf = `
            const matches = eingabe;
            ${block}
            return avgPlacement;
        `;
        // eslint-disable-next-line no-new-func
        const f = new Function('eingabe', rumpf);
        assert.equal(f([{ placement: '2' }, { placement: '4' }, { placement: '' }]), '3.00',
            'ein leeres Feld zieht den Mittelwert wieder nach unten');
        assert.equal(f([{ placement: '' }, { placement: null }]), '-',
            'ohne eine einzige Platzierung darf keine Zahl dastehen');
        assert.equal(f([]), '-');
    });
});

// ───────────────────────────────────────────────────────────────────
// 6. Geklemmte Eingaben werden sichtbar geklemmt
// ───────────────────────────────────────────────────────────────────
describe('Wahrscheinlichkeitsrechner: was dasteht, ist womit gerechnet wird', () => {
    const CALC = lies('js/app-calculator.js');
    const block = schnitt(CALC, '    function leseUndKlemme(id, fallback, min, max) {',
        '        return wert;\n    }', 'leseUndKlemme');

    function baue(feldwert) {
        const el = { value: String(feldwert), _klassen: new Set(), _attr: {},
            classList: { add(c) { el._klassen.add(c); }, remove(c) { el._klassen.delete(c); } },
            setAttribute(k, v) { el._attr[k] = v; }, removeAttribute(k) { delete el._attr[k]; } };
        const rumpf = `
            const document = { getElementById: () => el };
            const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
            const getInputNumber = (id, fb) => {
                const p = parseInt(el.value, 10);
                return Number.isNaN(p) ? fb : p;
            };
            const getLang = () => 'de';
            const setTimeout = () => 0;
            const clearTimeout = () => {};
            ${block}
            return leseUndKlemme;
        `;
        // eslint-disable-next-line no-new-func
        return { f: new Function('el', rumpf)(el), el };
    }

    it('0 Kopien werden auf 1 gezogen — und das Feld zeigt die 1', () => {
        const { f, el } = baue(0);
        assert.equal(f('calc-copies', 1, 1, 60), 1);
        assert.equal(el.value, '1', 'das Feld zeigt weiter die 0, gerechnet wird mit 1');
        assert.ok(el._klassen.has('calc-input-geklemmt'));
        assert.match(el._attr.title, /1–60/);
    });

    it('Deck 0 ebenso', () => {
        const { f, el } = baue(0);
        assert.equal(f('calc-deck-size', 60, 1, 99), 1);
        assert.equal(el.value, '1');
    });

    it('ein gueltiger Wert wird nicht angefasst', () => {
        const { f, el } = baue(4);
        assert.equal(f('calc-copies', 1, 1, 60), 4);
        assert.equal(el.value, '4');
        assert.equal(el._klassen.size, 0);
        assert.equal(el._attr.title, undefined);
    });

    it('ein leeres Feld bleibt leer — dort tippt gerade jemand', () => {
        const { f, el } = baue('');
        assert.equal(f('calc-copies', 1, 1, 60), 1);
        assert.equal(el.value, '', 'ein leeres Feld darf nicht ueberschrieben werden');
        assert.equal(el._klassen.size, 0);
    });

    it('nach oben gilt dasselbe', () => {
        const { f, el } = baue(500);
        assert.equal(f('calc-deck-size', 60, 1, 99), 99);
        assert.equal(el.value, '99');
        assert.ok(el._klassen.has('calc-input-geklemmt'));
    });

    it('und der Rechner ruft es fuer alle vier Felder auf', () => {
        for (const id of ['calc-deck-size', 'calc-copies', 'calc-drawn', 'calc-in-hand']) {
            assert.ok(new RegExp(`leseUndKlemme\\('${id}'`).test(CALC),
                `${id} wird weiterhin still geklemmt`);
        }
        assert.ok(!/clamp\(getInputNumber\(/.test(CALC),
            'das stille Klemmen ist zurueck');
    });
});
