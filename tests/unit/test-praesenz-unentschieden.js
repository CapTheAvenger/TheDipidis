/**
 * DIE TAG-2-RECHNUNG LIEF MIT DER ONLINE-UNENTSCHIEDEN-QUOTE.
 *
 * BEFUND (Agententeam B, 06.09.2026). `calcDay2` rechnet ein
 * PRÄSENZTURNIER — alle fünf Turniertypen des Meta Call sind
 * Veranstaltungen auf Papier. Die Unentschieden-Quote kam aber aus der
 * Online-Matrix bzw. aus `MAJOR_MATCHUP_TIE_RATE = 0.02`. Gemessen:
 *
 *     Limitless Online       1,28 %   (2.248 von 174.954)
 *     Worlds SF (TEF-PBL)   10,95 %   (aus labs_tournament_matchups_TEF-PBL.csv)
 *     alle Majors zusammen  15,30 %
 *
 * WIE GROSS DIE WIRKUNG IST — und warum die erste Schätzung dazu falsch
 * war. Der Befund kam mit der Rechnung "15,0 % werden rund 21 %".
 * Nachgerechnet über dieselbe Markow-Kette (8 Runden, 16 Punkte):
 *
 *     Unentschieden nur aus Niederlagen (pWin fest 0,47): 12,9 % -> 20,5 %
 *     Unentschieden aus beidem (S:N bleibt, wie gemessen): 12,9 % -> 14,0 %
 *
 * Die erste Zeile hebt die erwarteten Punkte je Runde von 1,430 auf
 * 1,520 — sie modelliert nicht, sie verschenkt Punkte. Eine Partie läuft
 * auch dann aus der Zeit, wenn man vorne liegt.
 *
 * Diese Zusicherungen halten BEIDES fest: dass die gemessene Quote
 * benutzt wird, und dass sie das Verhältnis Sieg zu Niederlage nicht
 * verschiebt. Und sie halten die ehrliche Größe des Gewinns fest, damit
 * niemand später wieder +8 pp daraus macht.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const MC   = lies('js', 'app-meta-call.js');
const I18N = lies('js', 'i18n.js');
const CSS  = lies('css', 'meta-call.css');

/** Den Umsteller aus dem Quelltext greifen und wirklich laufen lassen. */
function ladeUmsteller() {
    const anfang = MC.indexOf('function _mitPraesenzUnentschieden(m, quote) {');
    assert.ok(anfang >= 0, '_mitPraesenzUnentschieden wurde nicht gefunden');
    const ende = MC.indexOf('\n  }', anfang);
    const stueck = MC.slice(anfang, ende + 4);
    return new Function(stueck + ' return _mitPraesenzUnentschieden;')();
}

/** Dieselbe Kette wie calcDay2, für die Wirkungsprüfung. */
function kette(pWin, pTie, runden, ziel) {
    let dp = new Float64Array(runden * 3 + 1);
    dp[0] = 1;
    for (let r = 0; r < runden; r++) {
        const n = new Float64Array(runden * 3 + 1);
        for (let p = 0; p <= r * 3; p++) {
            if (dp[p] < 1e-15) continue;
            n[p + 3] += dp[p] * pWin;
            n[p + 1] += dp[p] * pTie;
            n[p]     += dp[p] * (1 - pWin - pTie);
        }
        dp = n;
    }
    let s = 0;
    for (let i = ziel; i <= runden * 3; i++) s += dp[i];
    return s;
}

describe('Die Unentschieden-Quote der Tag-2-Rechnung', () => {

    it('das Verhältnis Sieg zu Niederlage bleibt unangetastet', () => {
        const um = ladeUmsteller();
        const vorher = { pWin: 0.47, pTie: 0.02, pLoss: 0.51 };
        const nachher = um(vorher, 0.1095);
        const vorherSN = vorher.pWin / (vorher.pWin + vorher.pLoss);
        const nachherSN = nachher.pWin / (nachher.pWin + nachher.pLoss);
        assert.ok(Math.abs(vorherSN - nachherSN) < 1e-9,
            `S:N verschoben: ${vorherSN} -> ${nachherSN}`);
    });

    it('die Wahrscheinlichkeiten summieren sich auf eins', () => {
        const um = ladeUmsteller();
        for (const q of [0, 0.0128, 0.1095, 0.153, 0.4]) {
            const m = um({ pWin: 0.47, pTie: 0.02, pLoss: 0.51 }, q);
            const summe = m.pWin + m.pTie + m.pLoss;
            assert.ok(Math.abs(summe - 1) < 1e-9, `Summe ${summe} bei q=${q}`);
            assert.ok(Math.abs(m.pTie - q) < 1e-9, `pTie ${m.pTie} statt ${q}`);
        }
    });

    it('eine Paarung ohne Sieg und ohne Niederlage wird nicht durch null geteilt', () => {
        const um = ladeUmsteller();
        const m = um({ pWin: 0, pTie: 1, pLoss: 0 }, 0.1095);
        assert.ok(Number.isFinite(m.pWin) && Number.isFinite(m.pLoss), JSON.stringify(m));
        assert.ok(Math.abs(m.pWin + m.pTie + m.pLoss - 1) < 1e-9);
    });

    it('die Quote wird gedeckelt, damit ein kaputter Datentag nichts umwirft', () => {
        const um = ladeUmsteller();
        const m = um({ pWin: 0.47, pTie: 0.02, pLoss: 0.51 }, 0.9);
        assert.ok(m.pTie <= 0.5, `pTie ${m.pTie} über der Deckelung`);
        assert.ok(m.pWin >= 0 && m.pLoss >= 0);
    });

    it('DER GEMESSENE GEWINN: rund +1 pp, nicht +8', () => {
        /* Die Zahl, gegen die dieser Test geschrieben ist. Wer hier
           später 20,5 % misst, hat die Unentschieden wieder nur von den
           Niederlagen abgezogen. */
        const um = ladeUmsteller();
        const roh = { pWin: 0.47, pTie: 0.02, pLoss: 0.51 };
        const online = um(roh, 0.02);
        const papier = um(roh, 0.1095);
        const a = kette(online.pWin, online.pTie, 8, 16) * 100;
        const b = kette(papier.pWin, papier.pTie, 8, 16) * 100;
        assert.ok(Math.abs(a - 12.9) < 0.3, `Ausgangswert ${a.toFixed(1)} statt 12,9`);
        assert.ok(Math.abs(b - 14.0) < 0.3, `Ergebnis ${b.toFixed(1)} statt 14,0`);
        assert.ok(b - a > 0.5 && b - a < 2.0,
            `Der Gewinn ist ${(b - a).toFixed(1)} pp — erwartet rund +1,1`);
    });

    it('die widerlegte Rechnung bleibt widerlegt', () => {
        /* Hält fest, WARUM +8 pp herauskommt, wenn man es falsch macht:
           die erwarteten Punkte je Runde steigen, das Deck wird durch
           die Annahme besser statt nur unentschiedener. */
        const fest = kette(0.47, 0.11, 8, 16) * 100;
        assert.ok(fest > 20 && fest < 21,
            `die falsche Annahme liefert ${fest.toFixed(1)} % — erwartet rund 20,5`);
        const punkteFest = 3 * 0.47 + 1 * 0.11;
        const um = ladeUmsteller();
        const p = um({ pWin: 0.47, pTie: 0.02, pLoss: 0.51 }, 0.1095);
        const punkteRichtig = 3 * p.pWin + 1 * p.pTie;
        assert.ok(punkteFest > 1.5, `${punkteFest}`);
        assert.ok(punkteRichtig < 1.43,
            `die richtige Umstellung darf keine Punkte schenken: ${punkteRichtig}`);
    });

    it('mehr Unentschieden ist nicht immer besser', () => {
        /* Nicht monoton — mehr Unentschieden verschmälert die Verteilung
           (hilft) und senkt den Mittelwert (schadet). Wer das übersieht,
           baut die nächste zu optimistische Konstante. */
        const um = ladeUmsteller();
        const roh = { pWin: 0.47, pTie: 0.02, pLoss: 0.51 };
        const bei = (q) => { const m = um(roh, q); return kette(m.pWin, m.pTie, 8, 16) * 100; };
        assert.ok(bei(0.1095) > bei(0.02), 'bei 11 % müsste es höher liegen');
        assert.ok(bei(0.153) < bei(0.1095),
            'bei 15,3 % müsste es wieder fallen — sonst stimmt das Modell nicht');
    });
});

describe('Die Quote wird gemessen, nicht gesetzt', () => {

    it('sie wird nur aus den overall-Zeilen gezählt', () => {
        assert.match(MC, /if \(dayFilter === 'overall'\) \{\s*\n\s*if \(!aggUnentschieden\[meta\]\)/,
            'die Unentschieden werden nicht mehr auf overall beschränkt — '
            + 'day1 und day2 wären dieselben Partien ein zweites Mal');
    });

    it('die Partienzahl wird halbiert, weil jede Partie zweimal in der Datei steht', () => {
        assert.match(MC, /partien: Math\.round\(ges \/ 2\)/,
            'der Nenner, den der Leser sieht, wäre doppelt so groß wie die Wirklichkeit');
    });

    it('ohne Messung bleibt der Rückfall und wird als solcher ausgewiesen', () => {
        assert.match(MC, /gemessen: false/, 'der Rückfall ist nicht als solcher gekennzeichnet');
        assert.match(I18N, /'mc\.day2UnentschiedenLeer'/, 'der Rückfalltext fehlt');
        for (const k of ['mc.day2Unentschieden', 'mc.day2UnentschiedenLeer']) {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${k} steht ${n}-mal statt zweimal (EN und DE)`);
        }
    });

    it('die Annahme steht unter der Zahl, nicht nur im Quelltext', () => {
        assert.match(MC, /<div class="mc-day2-sub mc-day2-unentschieden">\$\{_uqText\}<\/div>/,
            'die Unentschieden-Zeile wird nicht gerendert');
        assert.match(CSS, /\.mc-day2-unentschieden/,
            'die Zeile hat keine eigene Gestalt und klebt an der darüber');
    });

    it('calcDay2 reicht die benutzte Quote nach außen', () => {
        assert.match(MC, /return \{ day2Prob, dp, expWin, expTie, expLoss, unentschieden: uq \};/,
            'die Anzeige müsste die Quote sonst ein zweites Mal berechnen');
        assert.match(MC, /const \{ day2Prob, dp, expWin, expTie, expLoss, unentschieden \} = calcDay2\(field\);/,
            'die Anzeige nimmt die Quote nicht entgegen');
    });

    it('die Spiegelpartie geht durch dieselbe Umstellung', () => {
        /* Sonst bliebe genau eine Paarung je Runde auf der alten festen
           Quote — die gegen das eigene Deck, also die häufigste im Feld. */
        const treffer = (MC.match(/_stelleUm\(\{ pWin: 0\.45, pTie: 0\.10, pLoss: 0\.45 \}\)/g) || []).length;
        assert.strictEqual(treffer, 2,
            `die Spiegelnäherung steht ${treffer}-mal umgestellt statt zweimal`);
    });

    it('ohne Messung bleibt die Kette unangetastet', () => {
        /* Die Kette soll das Punktesystem anwenden, nicht ihre Eingaben
           umschreiben. Ein Rückfallwert wäre eine Behauptung — und die
           Zusicherungen zur Kette selbst (test-metacall-day2-kette.js)
           setzen eigene Paarungen ein und müssen sie wiederfinden. */
        assert.match(MC, /const _stelleUm = \(uq\.gemessen && typeof _mitPraesenzUnentschieden === 'function'\)/,
            'die Umstellung hängt nicht mehr daran, dass wirklich gemessen wurde');
        assert.match(MC, /\? \(m\) => _mitPraesenzUnentschieden\(m, uq\.quote\)\s*\n\s*: \(m\) => m;/,
            'der Durchlassfall fehlt');
    });

    it('der Befund und seine Widerlegung stehen im Quelltext', () => {
        assert.ok(MC.includes('10,95'), 'die gemessene Präsenzquote wird nicht genannt');
        assert.ok(MC.includes('1,430') && MC.includes('1,520'),
            'die Punkte-je-Runde-Gegenprobe fehlt — ohne sie liest sich die '
            + 'widerlegte Rechnung wieder plausibel');
    });
});
