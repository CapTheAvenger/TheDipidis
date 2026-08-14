/**
 * Designsystem, Phase 2 — Tiefe, Erklärung, Zahlenformat.
 *
 * Der Kern dieser Phase ist ein Fehler, der beim Vereinheitlichen der
 * Zahlenformatierung aufgefallen ist:
 *
 *   data/limitless_online_decks_comparison.csv schreibt deutsche
 *   Dezimalkommas ("7,76"), und der Code las sie mit parseFloat.
 *   parseFloat("7,76") ist 7 — es schneidet am Komma ab.
 *
 * Sichtbar war das als
 *   - Mega Excadrill 7,0 % statt 7,8 %, Dragapult Blaziken 5,0 % statt
 *     5,88 % (genau der Widerspruch zu den Rohdaten, über den das
 *     Review gestolpert ist);
 *   - vier Decks in der falschen Tier-Stufe, weil 1,6 % zu 1,0 % wurde
 *     und damit unter die 1,5-%-Grenze fiel;
 *   - ±1,0-Sprünge in Improvers/Decliners, weil dort die Differenz
 *     zweier abgeschnittener Ganzzahlen stand.
 *
 * Die Tests hier prüfen die Ursache (kein parseFloat mehr auf diesen
 * Feldern) und den Beleg (die Datei hat wirklich Kommas), nicht die
 * Symptome — die wandern mit jedem Cron.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TIER = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
const HUB = fs.readFileSync(path.join(ROOT, 'js', 'meta-analysis-hub.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
const COMP = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const CSV = path.join(ROOT, 'data', 'limitless_online_decks_comparison.csv');

function csvRows() {
    const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(';');
    return lines.slice(1).map(l => Object.fromEntries(l.split(';').map((c, i) => [head[i], c])));
}

const parseLocaleNumber = new Function(
    UTILS.match(/function parseLocaleNumber\(input, fallback = 0\) \{[\s\S]*?\n\}/)[0] +
    '\nreturn parseLocaleNumber;')();

describe('die Vergleichsdatei wird gelesen, wie sie geschrieben ist', () => {
    const rows = csvRows();

    it('sie schreibt wirklich deutsche Dezimalkommas', () => {
        // Ohne diesen Beleg wäre der Rest dieser Datei eine Behauptung.
        const withComma = rows.filter(r => String(r.new_share || '').includes(','));
        assert.ok(withComma.length > 10,
            `nur ${withComma.length} Zeilen mit Komma — Format geändert, Test prüfen`);
    });

    it('parseFloat würde diese Werte abschneiden', () => {
        const broken = rows.filter(r => {
            const a = parseFloat(r.new_share);
            const b = parseLocaleNumber(r.new_share, 0);
            return Number.isFinite(a) && Math.abs(a - b) > 0.01;
        });
        assert.ok(broken.length > 50,
            `nur ${broken.length} Werte betroffen — der Fehler war größer`);
        // Ein konkreter Fall, damit die Größenordnung im Test steht.
        const worst = broken
            .map(r => ({ n: r.deck_name, d: Math.abs(parseFloat(r.new_share) - parseLocaleNumber(r.new_share, 0)) }))
            .sort((a, b) => b.d - a.d)[0];
        assert.ok(worst.d > 0.5, `größte Abweichung nur ${worst.d}`);
    });

    it('app-tier-meta liest die Felder nicht mehr mit parseFloat', () => {
        const offenders = (TIER.match(/parseFloat\(\s*deck\.[a-z_]+/gi) || []);
        assert.deepEqual(offenders, [], `noch abgeschnitten: ${offenders.join(', ')}`);
        assert.match(TIER, /share: parseLocaleNumber\(deck\.new_share, 0\)/);
        assert.match(TIER, /old_share: parseLocaleNumber\(deck\.old_share, 0\)/);
        assert.match(TIER, /winrate: parseLocaleNumber\(deck\.new_winrate, 0\)/);
    });

    it('die Tier-Einstufung hängt an der ungekürzten Zahl', () => {
        // Vier Decks lagen mit 1,6–1,7 % über der 1,5-%-Grenze und
        // fielen abgeschnitten auf 1,0 % — also aus der Liste.
        const tier = (s) => (s >= 8 ? 1 : s >= 4 ? 2 : s >= 1.5 ? 3 : 0);
        const moved = rows.filter(r => {
            const t = parseFloat(r.new_share), real = parseLocaleNumber(r.new_share, 0);
            return Number.isFinite(t) && tier(t) !== tier(real);
        });
        assert.ok(moved.length > 0,
            'Testannahme veraltet: kein Deck wechselt mehr die Stufe');
        assert.match(TIER, /const share = parseLocaleNumber\(shareRaw, 0\)/);
    });
});

describe('Ebene 1 auf der Einstiegsseite', () => {
    it('der Host steht im HTML, vor den Kacheln', () => {
        const answer = HTML.indexOf('id="metaHubAnswer"');
        const tiles = HTML.indexOf('id="metaHubTileGrid"');
        assert.ok(answer > -1, 'kein Host für die Antwort');
        assert.ok(answer < tiles, 'die Antwort muss über den Kacheln stehen');
    });

    it('rechnet über denselben Weg wie Current Meta', () => {
        // Zwei Rechenwege sind der Grund, warum ein Deck auf der
        // Startseite anders dasteht als eine Ebene tiefer.
        assert.match(HUB, /window\.computeConversionPerformance/);
        assert.match(HUB, /online_tournament_top8_decks\.csv/);
        assert.match(HUB, /window\.parseLocaleNumber/);
    });

    it('zeigt nichts statt Platzhalter, wenn die Datei fehlt', () => {
        const model = new Function('window',
            HUB.match(/function answerModel\(rows\) \{[\s\S]*?\n    \}/)[0] +
            '\nreturn answerModel;')({});
        assert.equal(model(null), null);
        assert.equal(model([]), null);
    });

    it('nimmt die drei meistgespielten Decks', () => {
        const stubWindow = {
            parseLocaleNumber,
            computeConversionPerformance: () => ({
                expected: 0.06,
                decks: [{ name: 'A', perfPct: 10, brought: 100, top8: 10, thin: false }],
            }),
        };
        const model = new Function('window',
            HUB.match(/function answerModel\(rows\) \{[\s\S]*?\n    \}/)[0] +
            '\nreturn answerModel;')(stubWindow);
        const rows = [
            { deck_name: 'A', total_brought_weighted: '100', top8_conv_rate: '0.10' },
            { deck_name: 'B', total_brought_weighted: '300', top8_conv_rate: '0.08' },
            { deck_name: 'C', total_brought_weighted: '200', top8_conv_rate: '0.05' },
            { deck_name: 'D', total_brought_weighted: '50', top8_conv_rate: '0.04' },
        ];
        const out = model(rows);
        assert.deepEqual(out.top.map(d => d.name), ['B', 'C', 'A']);
        assert.equal(Math.round(out.top[0].sharePct), 46);   // 300 von 650
        assert.equal(out.top.length, 3);
    });

    it('der Satz nennt das erfolgreichste, nicht das häufigste Deck', () => {
        // "Am häufigsten" und "am erfolgreichsten" sind zwei Fragen, und
        // die zweite ist die interessantere.
        assert.match(HUB, /sort\(\(a, b\) => b\.perfPct - a\.perfPct\)/);
        assert.match(HUB, /erfolgreichste Deck/);
    });
});

describe('Fachbegriffe erklären sich dort, wo die Zahl steht', () => {
    const termHint = new Function(
        UTILS.match(/function termHint\(label, explanation\) \{[\s\S]*?\n\}/)[0] +
        '\nreturn termHint;')();

    it('macht aus Begriff plus Satz eine Marke mit Titel', () => {
        const html = termHint('Anteil', 'Wie oft gespielt.');
        assert.match(html, /class="ds-term"/);
        assert.match(html, /title="Wie oft gespielt\."/);
        assert.match(html, />Anteil</);
    });

    it('ohne Erklärung bleibt es der blanke Begriff', () => {
        assert.equal(termHint('Anteil', ''), 'Anteil');
        assert.equal(termHint('Anteil'), 'Anteil');
    });

    it('escapet, was in ein Attribut wandert', () => {
        const html = termHint('N\'s Zoroark', 'a "quote" & <tag>');
        assert.doesNotMatch(html, /a "quote"/);
        assert.match(html, /&quot;quote&quot;/);
        assert.match(html, /&amp;/);
        assert.match(html, /&lt;tag&gt;/);
    });

    it('ist per Tastatur erreichbar', () => {
        assert.match(termHint('x', 'y'), /tabindex="0"/);
    });

    it('die Marke ist gestylt und benutzt Tokens', () => {
        const block = COMP.slice(COMP.indexOf('.ds-term'), COMP.indexOf('/* ── Fußnote'));
        assert.match(block, /cursor: help/);
        assert.match(block, /var\(--/);
        assert.doesNotMatch(block, /#[0-9a-f]{3,6}/i);
    });

    it('Current Meta erklärt Anteil, Top-8 und vs. Feld', () => {
        assert.match(TIER, /hintTerm\(/);
        assert.match(TIER, /vsField:/);
        assert.match(TIER, /Feld-Durchschnitt/);
        assert.ok((TIER.match(/hintTerm\(/g) || []).length >= 6,
            'zu wenige Begriffe erklärt');
    });

    it('der Helfer heißt nicht `hint` — der Name war schon vergeben', () => {
        // renderConversionBlock führt eine lokale Variable `hint` (den
        // Hinweistext). Sie hat den Helfer überdeckt, der try/catch hat
        // den Fehler geschluckt, und drei Tabellen verschwanden
        // wortlos von der Seite.
        assert.doesNotMatch(TIER, /const hint = \(label, text\)/);
        assert.match(TIER, /const hintTerm = \(label, text\)/);
    });

    it('der try/catch schluckt den Fehler nicht mehr', () => {
        assert.doesNotMatch(TIER, /catch \(_e\) \{ \/\* CSV missing/);
        assert.match(TIER, /Top-8-Block konnte nicht gerendert werden/);
    });
});

describe('dieselbe Zahl, dasselbe Format', () => {
    it('Movers und Kacheln formatieren über den gemeinsamen Weg', () => {
        assert.match(TIER, /window\.formatPercentSigned\(m\.delta\)/);
        assert.match(TIER, /fmtPct\(m\.share\)/);
        assert.match(TIER, /fmtPct\(m\.oldShare\)/);
    });

    it('die Familienzahl ist als solche beschriftet', () => {
        // Dragapult stand als 16,0 % (Familie) neben 5,9 % (Archetyp)
        // ohne ein Wort dazu, was wie ein Widerspruch aussah.
        assert.match(TIER, /über \$\{variantCount\} Varianten/);
        assert.match(TIER, /Summe über \$\{variantCount\} Varianten/);
    });
});
