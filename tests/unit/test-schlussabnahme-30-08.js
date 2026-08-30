'use strict';
/*
 * Schlussabnahme, 30.08.2026 — sechs Befunde, fünf davon echt.
 *
 * **„72 von 708 … 10,10 % Cut-Quote".** 72/708 sind 10,17 %. In der
 * Datei stehen 71,5 von 708 — Antritte sind turniergewichtet. Die
 * Startseite zeigte für denselben Wert schon „71,5 von 708"; zwei
 * Ansichten, dieselbe Zahl, zwei Schreibweisen, und nur eine passte zu
 * ihrer eigenen Prozentangabe.
 *
 * **Drei Stellen mit Dezimalpunkt.** „1.9% Coverage" (60-mal pro
 * Seite), „54.05%" Win Rate und „53.90% (20 MU)" — auf demselben
 * Bildschirm, auf dem die Kachel darüber „54,0 %" schreibt. Die
 * Quelldatei führt neben `win_rate` ("54.05%") eine Spalte
 * `win_rate_numeric` ("54,05"), genau dafür.
 *
 * **„Jüngstes Turnier: 2026-06-12"** — rohes ISO-Datum im deutschen
 * Satz, während dieselbe Datei es an anderer Stelle umdreht. Und
 * `mc.junkDecks` stand auch im deutschen Block auf „Others".
 *
 * **Die +/−-Knöpfe der Kartendatenbank standen ausgeloggt bei 2,06:1.**
 * `opacity:.5` mit `saturate(.35)`. Die Absicht — der Knopf soll
 * aussehen, wie er sich verhält — bleibt; sie darf ihn nur nicht
 * unlesbar machen. Grau statt blass: 5,7 statt 2,06.
 *
 * **Gefallen:** der Predictor-Banner sei im Dunkelmodus bei 1,28:1.
 * Nachgemessen mit korrekter Alphakompositierung (die Fläche ist ein
 * Verlauf mit 12 % Deckkraft über dem Panel, nicht das Amber selbst):
 * 5,42 bis 7,22:1 dunkel, 4,79 bis 5,53:1 hell. Der Screenshot
 * bestätigt es. Kein Befund.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('Gewichtete Antritte werden nicht zu ganzen gerundet', () => {
    const AC = lies('js/app-archetype-card.js');

    const bau = () => new Function('isDe',
        AC.match(/function fmtGewichtet\(n\) \{[\s\S]*?\n    \}/)[0] +
        '\nreturn fmtGewichtet;')(() => true);

    it('halbe Werte bleiben halb', () => {
        const f = bau();
        assert.equal(f(71.5), '71,5');
        assert.equal(f(56.5), '56,5');
        assert.equal(f(472.5), '472,5');
    });

    it('ganze Werte bleiben ganz', () => {
        const f = bau();
        assert.equal(f(708), '708');
        assert.equal(f(2158), '2.158');
    });

    it('die Kachel benutzt sie für Zähler UND Nenner', () => {
        const nackt = ohneKomm(AC);
        assert.match(nackt, /\.replace\('\{t\}', fmtGewichtet\(c\.top8\)\)/);
        assert.match(nackt, /\.replace\('\{b\}', fmtGewichtet\(c\.brought\)\)/);
        assert.ok(!/\.replace\('\{[tb]\}', fmtGanz\(/.test(nackt),
            'ein Wert wird wieder auf eine ganze Zahl gerundet');
    });

    it('die Probe: 71,5/708 sind 10,10 %, 72/708 wären 10,17 %', () => {
        assert.equal((71.5 / 708 * 100).toFixed(2), '10.10');
        assert.equal((72 / 708 * 100).toFixed(2), '10.17');
    });
});

describe('Ø-Platzierungen stehen überall mit zwei Nachkommastellen', () => {
    it('auch auf den Tier-Karten', () => {
        // Sie zeigten "Platzierung: 13,7", die Tabelle darunter "13,67".
        const TIER = lies('js/app-tier-meta.js');
        assert.match(TIER, /const currentRank = currentRankValue > 0 \? kommaAus\(currentRankValue, 2\)/);
        assert.ok(!/kommaAus\(currentRankValue, 1\)/.test(TIER), 'wieder eine Nachkommastelle');
    });

    it('und auf der kombinierten Heldenkachel', () => {
        const TIER = lies('js/app-tier-meta.js');
        assert.match(TIER, /\? item\.weightedRank\.toFixed\(2\)/);
    });
});

describe('Dezimalpunkte in deutschen Zahlen', () => {
    it('der Coverage-Balken der Kartendatenbank', () => {
        const CDB = ohneKomm(lies('js/app-cards-db.js'));
        assert.ok(!/\? '<0\.1' : percentage\.toFixed\(1\)/.test(CDB),
            '"1.9% Coverage" mit Punkt ist zurück');
        assert.match(CDB, /_kommaZahl\(percentage, 1\)/);
    });

    it('die Win Rate der Deck-Analyse liest die Zahlenspalte', () => {
        const CMA = ohneKomm(lies('js/app-current-meta-analysis.js'));
        // win_rate traegt "54.05%", win_rate_numeric "54,05".
        assert.ok(!/winrate = deckStatEntry\.win_rate;\s*$/m.test(CMA),
            'die Rohspalte mit Punkt wird wieder direkt angezeigt');
        // Beide Stellen: die Bedingung UND der gelesene Wert.
        const n = (CMA.match(/deckStatEntry\.win_rate_numeric \|\| deckStatEntry\.win_rate/g) || []).length;
        assert.equal(n, 2, 'die Zahlenspalte wird nur an einer der beiden Stellen gelesen');
        assert.match(CMA, /winrate = Number\.isFinite\(zahl\)/);
    });

    it('das Matchup gegen die Top 20 ebenso', () => {
        const CMA = ohneKomm(lies('js/app-current-meta-analysis.js'));
        assert.ok(!/const avgWinrate = \(totalWins \/ totalGames \* 100\)\.toFixed\(2\);/.test(CMA));
        assert.match(CMA, /zahlLokal\(_wr, 2\)/);
    });

    it('die Quelldatei führt beide Spalten — der Test hängt nicht in der Luft', () => {
        const kopf = lies('data/limitless_online_decks.csv').split('\n')[0];
        assert.ok(kopf.includes('win_rate;'), 'win_rate fehlt');
        assert.ok(kopf.includes('win_rate_numeric'), 'win_rate_numeric fehlt');
    });
});

describe('Datum und Restposten im Meta Call', () => {
    const MC = ohneKomm(lies('js/app-meta-call.js'));
    const I18N = lies('js/i18n.js');

    it('das Bannerdatum steht deutsch', () => {
        assert.ok(!/const shortDate = _chipDatum;/.test(MC),
            'das rohe ISO-Datum geht wieder in den deutschen Satz');
        assert.match(MC, /String\(_chipDatum\)\.split\('-'\)\.reverse\(\)\.join\('\.'\)/);
    });

    it('der Sammelposten heißt auf Deutsch Sonstige', () => {
        const zeilen = I18N.split('\n').filter(l => l.includes("'mc.junkDecks'"));
        assert.equal(zeilen.length, 2);
        assert.ok(zeilen[0].includes("'Others'"), 'die englische Fassung fehlt');
        assert.ok(zeilen[1].includes("'Sonstige'"), 'die deutsche steht wieder auf Others');
    });
});

describe('Reitertitel und der letzte englische Knopf', () => {
    it('die Kachelseite bekommt ihren eigenen Titel', () => {
        // Es gibt keinen Menuepunkt mit data-tab-id="meta-analysis-hub" —
        // der Knopf oben zeigt auf current-meta. menuLabelEl war null und
        // `activeBtn` fand den Knopf der VORHERIGEN Ansicht: der
        // Reitertitel blieb bei "Vergangenes Meta" stehen.
        const CORE = ohneKomm(lies('js/app-core.js'));
        assert.match(CORE, /const ueberschriftEl = !menuLabelEl/);
        assert.match(CORE, /ueberschriftEl \? ueberschriftEl\.textContent\.trim\(\)/);
        // Und die Ueberschrift, aus der er sich bedient, gibt es wirklich.
        assert.match(lies('index.html'), /<div id="meta-analysis-hub"[\s\S]{0,600}?<h2><span data-i18n="metaHub\.title"/);
    });

    it('kein fest verdrahteter englischer Knopftitel mehr im Profil-Deck', () => {
        const FC = lies('js/firebase-collection.js');
        assert.ok(!/isWishlisted \? 'Remove from wishlist' : 'Add to wishlist'/.test(FC));
        assert.match(FC, /t\(isWishlisted \? 'akt\.removeWishlist' : 'akt\.addWishlist'\)/);
    });
});

describe('Ausgeloggte Knöpfe bleiben lesbar', () => {
    const CSS = lies('css/components.css');
    const CDB = lies('js/app-cards-db.js');

    it('gedämpft wird über Sättigung, nicht über Deckkraft', () => {
        const block = CSS.match(/html\.is-signed-out \[onclick\*="radelist"\] \{[\s\S]*?\n\}/)[0];
        assert.ok(!/opacity: \.5/.test(block), 'die halbe Deckkraft ist zurück');
        assert.match(block, /filter: grayscale\(\.85\)/);
    });

    it('Wunsch- und Tauschknopf tragen dunklen Text', () => {
        // Weiss auf #F48FB1 sind 2,23:1, auf #a3d9cd sogar 1,57:1.
        assert.ok(!/style="color:#fff; background: \$\{userWantsCard/.test(CDB));
        assert.ok(!/style="color: #fff; background: \$\{userTradesCard/.test(CDB));
        assert.equal((CDB.match(/color:#16233a; background: \$\{user/g) || []).length, 4);
    });

    it('und die gewählten Zustände sind hell genug für dunklen Text', () => {
        const kon = (a, b) => {
            const l = h => {
                const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255)
                    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
                return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
            };
            const [x, y] = [l(a), l(b)];
            return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        for (const bg of ['#F06292', '#F48FB1', '#3fbfa4', '#a3d9cd']) {
            assert.ok(CDB.includes(bg), bg + ' steht nicht mehr im Code');
            assert.ok(kon('#16233a', bg) >= 4.5, bg + ' trägt nur ' + kon('#16233a', bg).toFixed(2));
        }
    });
});
