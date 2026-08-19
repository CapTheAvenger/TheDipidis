/**
 * Ein 3-0 ist keine 100-Prozent-Paarung.
 *
 * GEMESSEN am 19.08.2026 an data/limitless_online_decks_matchups.csv:
 *
 *   Paarungen mit Daten       1.546
 *   Decks                       100
 *   moegliche Paare           9.900   ->  16 % abgedeckt
 *   Median Partien je Paarung    16
 *   unter 20 Partien            858   =  55 %
 *   unter 10 Partien            564   =  36 %
 *
 * Bis hierher stand der Rohwert in der Heatmap und in der Archetyp-Karte:
 *
 *   Sinistcha Ogerpon vs N's Zoroark      3-0   ->  100,0 %
 *   Sylveon           vs Mega Excadrill   0-4   ->    0,0 %
 *
 * Die Antwort darauf ist im Haus schon in Gebrauch, nur eine Etage hoeher:
 * js/app-tier-meta.js glaettet die Deck-Siegquote mit einem 50-Partien-Prior
 * auf 50 %, mit dieser Begruendung im Kommentar — "ein Deck was nur 5x zu
 * nem Turnier geht und alle gewinnt … ist ja kein Tier 1". Auf der
 * Matchup-Ebene war dieselbe Regel nie angewendet.
 *
 * Beta-Binomial, Prior-Staerke k = 20:  (W + k/2) / (W + L + k)
 *
 * Nach dem Einbau im Browser nachgemessen, Heatmap mit allen Decks:
 *
 *   Zellen                      1.526
 *   als duenn markiert            857   = 56 %
 *   Zellen mit 0 % oder 100 %       0   (vorher moeglich in 36 % der Paare)
 *   angezeigte Spanne      24,4 – 75,0 %   (vorher 0 – 100 %)
 *
 * Die Methode stammt von Metagross-EV (reillycooper.com/metagross-ev,
 * MIT-lizenziert). Uebernommen ist die Rechnung, nicht die Zahl: unsere
 * Werte kommen aus Limitless Online, seine aus Trainer Hill.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Das Modul im selben Realm laden, damit Zahlen Zahlen bleiben.
const win = {};
new Function('window', read('js/matchup-glaettung.js'))(win);
const G = win.DsGlaettung;

const REG = stripJs(read('js/app-meta-cards.js'));
const HEAT = stripJs(read('js/app-current-meta.js'));
const KARTE = stripJs(read('js/app-archetype-card.js'));
const CSS = stripCss(read('css/styles.css'));
const HTML = read('index.html');
const SW = read('service-worker.js');

describe('Glaettung — die Rechnung', () => {
    it('k ist 20, dieselbe Groessenordnung wie THIN_GAMES', () => {
        assert.equal(G.K, 20);
        assert.match(KARTE, /THIN_GAMES\s*=\s*20/);
    });

    it('die vier gemessenen Faelle kommen richtig heraus', () => {
        const rund = (w, l) => Number(G.quote(w, l).toFixed(1));
        assert.equal(rund(3, 0), 56.5, 'ein 3-0 muss 56,5 % lesen, nicht 100 %');
        assert.equal(rund(0, 4), 41.7, 'ein 0-4 muss 41,7 % lesen, nicht 0 %');
        assert.equal(rund(0, 3), 43.5);
        assert.equal(rund(60, 40), 58.3, 'belastbare Zahlen bewegen sich kaum');
    });

    it('belastbare Paarungen bewegen sich um weniger als zwei Punkte', () => {
        const roh = 60, geglaettet = G.quote(60, 40);
        assert.ok(Math.abs(roh - geglaettet) < 2,
            'k=20 darf 100 Partien nicht verbiegen, Abweichung: ' + (roh - geglaettet));
    });

    it('ohne Partien kommt 50 heraus, nicht NaN', () => {
        // 84 % aller Deck-Paare haben nie gegeneinander gespielt.
        assert.equal(G.quote(0, 0), 50);
        assert.equal(G.ausEintrag(null), 50);
        assert.equal(G.ausEintrag({ record: '' }), 50);
    });

    it('kaputte Bilanzen geben nie NaN', () => {
        for (const rec of ['', 'abc', '- -', null, undefined, '5', '5 - x - 2']) {
            const v = G.ausEintrag({ record: rec });
            assert.ok(Number.isFinite(v), 'NaN bei record=' + JSON.stringify(rec));
            assert.ok(v >= 0 && v <= 100, 'ausserhalb 0..100 bei ' + JSON.stringify(rec));
        }
    });

    it('die Bilanz wird als W - L - U gelesen', () => {
        assert.deepEqual(G.bilanz('322 - 217 - 8'),
            { siege: 322, niederlagen: 217, unentschieden: 8 });
    });

    it('die Varianz ist da und schrumpft mit mehr Partien', () => {
        assert.ok(G.varianz(3, 0) > G.varianz(300, 200),
            'eine duenne Paarung muss unsicherer sein als eine dicke');
        assert.ok(G.varianz(0, 0) > 0);
    });

    it('k = 0 gibt den Rohwert zurueck', () => {
        assert.equal(G.quote(3, 0, 0), 100);
        assert.equal(G.quote(0, 4, 0), 0);
    });
});

describe('Glaettung — die Formel steht genau einmal', () => {
    it('das Modul wird geladen, und vor allen Lesern', () => {
        const i = HTML.indexOf('js/matchup-glaettung.js');
        assert.ok(i > -1, 'nicht in index.html eingebunden');
        for (const leser of ['js/app-meta-cards.js', 'js/app-current-meta.js', 'js/app-archetype-card.js']) {
            assert.ok(HTML.indexOf(leser) > i, leser + ' wird vor der Glaettung geladen');
        }
    });

    it('der Service Worker kennt die Datei', () => {
        assert.match(SW, /matchup-glaettung\.js/,
            'ohne Eintrag fehlt sie offline und die Seite zeigt wieder Rohwerte');
    });

    it('kein Leser rechnet die Formel selbst nach', () => {
        // Zwei Deklarationen derselben Rechnung laufen auseinander, sobald
        // eine angefasst wird — dieselbe Falle wie bei den tierTitles.
        for (const [name, src] of [['app-meta-cards', REG], ['app-current-meta', HEAT], ['app-archetype-card', KARTE]]) {
            assert.ok(!/\+\s*k\s*\/\s*2/.test(src),
                name + ' enthaelt die Prior-Formel noch einmal');
        }
    });
});

describe('Glaettung — angeschlossen', () => {
    it('das Register legt Bilanz und geglaettete Quote ab', () => {
        for (const feld of ['win_rate_shrunk', 'wins', 'losses', 'ties']) {
            assert.ok(REG.includes(feld + ' '), 'Register ohne ' + feld);
        }
    });

    it('der Rohwert bleibt unter seinem alten Namen erhalten', () => {
        // Tier-Wertung, Anti-Tech und die Bildkarte lesen win_rate_numeric.
        assert.match(REG, /win_rate_numeric:\s*wrNum/,
            'win_rate_numeric muss der Rohwert bleiben');
    });

    it('Heatmap und Karte zeigen die geglaettete Quote', () => {
        assert.match(HEAT, /win_rate_shrunk/, 'Heatmap zeigt noch den Rohwert');
        assert.match(KARTE, /win_rate_shrunk/, 'Archetyp-Karte zeigt noch den Rohwert');
    });

    it('und behalten den Rohwert im Tooltip', () => {
        assert.match(HEAT, /heatmap\.raw/, 'Heatmap-Tooltip ohne Rohwert');
        assert.match(KARTE, /winRateRoh/, 'Karten-Tooltip ohne Rohwert');
    });
});

describe('Duenne Zellen — gestrichelt, nicht blass', () => {
    it('die Schwelle ist 20, nicht mehr 10', () => {
        assert.match(HEAT, /const lowSample = totalGames < 20/,
            'die Heatmap markiert erst ab einer anderen Schwelle als die Karte');
    });

    it('die Zelle bekommt eine Klasse dafuer', () => {
        assert.match(HEAT, /heatmap-td-thin/);
    });

    it('die Klasse ist gestrichelt und nimmt keinen Kontrast weg', () => {
        const m = CSS.match(/\.heatmap-td-thin\s*\{([^}]*)\}/);
        assert.ok(m, '.heatmap-td-thin fehlt in styles.css');
        assert.match(m[1], /outline:[^;]*dashed/, 'die Markierung muss gestrichelt sein');
        assert.ok(!/opacity/.test(m[1]), 'Blaesse war genau das Problem (3,42:1)');
    });

    it('das n-Label ist nicht mehr durchscheinend', () => {
        // Es gibt mehrere .heatmap-td-n-Bloecke (einer davon nur fuer die
        // Schriftgroesse unter 700 px). Keiner darf die Deckkraft senken —
        // opacity 0.65 war die Ursache des Kontrastfehlers von 3,42:1.
        const bloecke = CSS.match(/\.heatmap-td-n[^{}]*\{[^}]*\}/g) || [];
        assert.ok(bloecke.length > 0, 'keine .heatmap-td-n-Regel gefunden');
        for (const b of bloecke) {
            const o = b.match(/opacity:\s*([\d.]+)/);
            if (o) {
                assert.ok(Number(o[1]) >= 1,
                    'senkt die Deckkraft auf ' + o[1] + ': ' + b.slice(0, 60));
            }
        }
        assert.ok(bloecke.some(b => /opacity:\s*1\b/.test(b)),
            'die volle Deckkraft muss ausdruecklich gesetzt sein');
    });
});
