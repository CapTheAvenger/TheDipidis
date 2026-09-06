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


/* Das ECHTE Tor aus app-utils.js, nicht eine Attrappe. Es entscheidet,
   ob die Anzeige die gezaehlten oder die gewichteten Spalten nimmt —
   mit einer Attrappe liefe der Test genau am Verzweigungspunkt vorbei.
   Dieselbe Technik wie bei parseLocaleNumber daneben. */
function echtesTor(pLN) {
    const stueck = UTILS.match(/function gezaehlteZeilen\(rows\) \{[\s\S]*?\n\}/)[0];
    return new Function('parseLocaleNumber', stueck + '\nreturn gezaehlteZeilen;')(pLN);
}

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
            '\nreturn answerModel;')({ gezaehlteZeilen: echtesTor(parseLocaleNumber) });
        assert.equal(model(null), null);
        assert.equal(model([]), null);
    });

    it('stellt das Deck aus der Überschrift voran, dann die meistgespielten', () => {
        // Geändert am 15.08.2026 nach dem Audit: vorher war die Reihe rein nach
        // Anteil sortiert, während die Überschrift nach Erfolg wählte. Unter
        // "Was ist gerade stark?" stand dann als erstes der schwächste
        // Performer, rot eingefasst — alle sieben Prüfer meldeten das unabhängig
        // als Widerspruch. Jetzt führt das Deck aus dem Satz die Reihe an, und
        // jede Kachel sagt über ihre Rolle, warum sie dort steht.
        const stubWindow = {
            parseLocaleNumber,
            gezaehlteZeilen: echtesTor(parseLocaleNumber),
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
        assert.equal(out.headline.name, 'A');
        assert.deepEqual(out.top.map(d => d.name), ['A', 'B', 'C']);
        assert.deepEqual(out.top.map(d => d.role), ['best', 'played', 'played']);
        assert.equal(out.top.length, 3);
    });

    it('kürt kein Deck unter 100 Antritten zum stärksten', () => {
        // Der Auslöser: Toxtricity Box trug die Überschrift mit 53 Antritten
        // (8 Cuts) — 95-%-Intervall rund ±10 Prozentpunkte.
        const stubWindow = {
            parseLocaleNumber,
            gezaehlteZeilen: echtesTor(parseLocaleNumber),
            computeConversionPerformance: () => ({
                expected: 0.06,
                decks: [{ name: 'Klein', perfPct: 80, brought: 53, top8: 8, thin: false }],
            }),
        };
        const model = new Function('window',
            HUB.match(/function answerModel\(rows\) \{[\s\S]*?\n    \}/)[0] +
            '\nreturn answerModel;')(stubWindow);
        const out = model([
            { deck_name: 'Klein', total_brought_weighted: '53', top8_conv_rate: '0.15' },
            { deck_name: 'Gross', total_brought_weighted: '400', top8_conv_rate: '0.07' },
        ]);
        assert.equal(out.headline, null, 'ein Deck mit n=53 darf die Überschrift nicht tragen');
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

    it('macht aus Begriff plus Satz eine Marke mit Hinweis', () => {
        /* GEAENDERT am 01.09.2026: der Text stand als title-Attribut da.
           Ein title erscheint nur beim Verweilen mit der Maus — nie beim
           Klick und auf keinem Telefon. Gemeldet: "wenn ich hier auf
           Fragezeichen druecke, dann passiert nicht mal irgendwas."
           Er steht jetzt in data-hinweis, wird von einer CSS-Sprechblase
           gezeigt (auf :hover UND :focus, und den Fokus setzt der Klick)
           und liegt zusaetzlich im aria-label fuer Vorlesegeraete.
           Das leere title="" ist Absicht: die Marke sitzt oft in einem
           <th>, das selbst ein title traegt, und wuerde ihn sonst erben. */
        const html = termHint('Anteil', 'Wie oft gespielt.');
        assert.match(html, /class="ds-term"/);
        assert.match(html, /data-hinweis="Wie oft gespielt\."/);
        assert.match(html, /title=""/);
        assert.match(html, /aria-label="Anteil: Wie oft gespielt\."/);
        assert.match(html, />Anteil</);
    });

    it('die Sprechblase geht auch bei Tastaturfokus auf, nicht nur beim Verweilen', () => {
        // Das ist der eigentliche Punkt der Aenderung: ohne :focus
        // waere der Text weiterhin fuer jeden unerreichbar, der nicht
        // mit einer Maus darueberfaehrt.
        const block = COMP.slice(COMP.indexOf('.ds-term'), COMP.indexOf('/* ── Fußnote'));
        assert.match(block, /\.ds-term::before,/);
        assert.match(block, /content:\s*attr\(data-hinweis\)/);
        assert.match(block, /\.ds-term:focus::before,/);
        assert.match(block, /\.ds-term:hover::before,/);
        /* Dieselbe Blase traegt seit dem 01.09.2026 auch die Nenner der
           Archetyp-Kacheln. Zwei Sprechblasen mit leicht verschiedenem
           Aussehen waeren derselbe Fehler wie zwei Win Rates fuer ein
           Deck — geprueft wird deshalb, dass es EINE Regel ist. */
        assert.match(block, /\.arc-tile--hinweis::before/);
        assert.match(block, /\.arc-tile--hinweis:focus::before/);
        /* Und der Klick darf nicht bloss die Tabelle darunter sortieren —
           bei den Archetyp-Kacheln waere es schlimmer: die Karte springt
           in die Deck-Analyse und der Hinweis waere nie zu lesen. Der
           Riegel deckt deshalb beide Ziele ab. */
        assert.match(UTILS, /DS_HINWEIS_ZIELE = '\.ds-term, \.arc-tile--hinweis'/);
        assert.match(UTILS, /closest\(DS_HINWEIS_ZIELE\)/);
        assert.match(UTILS, /stopPropagation/);
        // In der Erfassungsphase, sonst greift der Handler der Karte zuerst.
        assert.match(UTILS, /\}, true\);/);
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

    it('Current Meta erklärt jede Spalte, die eine Erklärung hat', () => {
        /* Gezaehlt wurden hier frueher die hintTerm-Aufrufe: erst >= 6
           (drei Tabellen), dann >= 4 (eine Tabelle plus Movers). Seit die
           Movers weg sind (01.09.2026) gibt es genau eine Aufrufstelle,
           die ALLE Spalten beschriftet — die Zahl sagt also nichts mehr
           ueber die Abdeckung.
           Geprueft wird deshalb die Regel statt der Anzahl: jede Spalte,
           die einen Hilfstext mitbringt, muss durch hintTerm laufen, und
           jeder benannte Hilfstext muss es auch geben. */
        assert.match(TIER, /vsField:/);
        assert.match(TIER, /Feld-Durchschnitt/);
        assert.match(TIER, /const hilfstext = c\.hilf \? term\(c\.hilf\)/,
            'Spalten mit hilf holen ihren Text nicht mehr aus TERMS');
        assert.match(TIER, /c\.tip \? \(deR \? c\.tip\.de : c\.tip\.en\)/,
            'Spalten mit tip holen ihren Text nicht mehr aus der Spaltendefinition');
        assert.match(TIER, /const beschriftet = voll \? hintTerm\(txt, voll\) : escapeHtml\(txt\)/,
            'der Hilfstext laeuft nicht mehr durch hintTerm');

        const spalten = TIER.slice(TIER.indexOf('const SPALTEN = ['));
        const block = spalten.slice(0, spalten.indexOf('];'));
        const hilfen = [...block.matchAll(/hilf:\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
        assert.ok(hilfen.length >= 2, `nur ${hilfen.length} Spalten mit Hilfstext`);
        hilfen.forEach(k => assert.match(TIER, new RegExp('\\n\\s+' + k + ':'),
            `TERMS kennt '${k}' nicht — die Marke zeigte undefined`));
        // Und mindestens eine Spalte mit eigenem Tipp statt Sammelbegriff.
        assert.ok((block.match(/tip:\s*\{/g) || []).length >= 2);
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
    it('die Rangliste formatiert über den gemeinsamen Weg', () => {
        /* Hier standen bis zum 01.09.2026 die Movers-Zellen. Der Block
           ist entfernt; geprueft wird jetzt an der Rangliste, dass keine
           Zelle ihre eigene Zahlenschreibweise erfindet. */
        assert.match(TIER, /fmtPct\(r\.anteil\)/);
        assert.match(TIER, /fmtPct\(r\.wr\)/);
        assert.match(TIER, /fmtPct\(r\.quote\)/);
        assert.doesNotMatch(TIER, /toFixed\(1\) \+ ' ?%'/,
            'eine Zelle formatiert wieder an fmtPct vorbei');
    });

    it('die Familienzahl steht genau einmal auf der Kachel', () => {
        // Dragapult stand als 16,0 % (Familie) neben 5,9 % (Archetyp)
        // ohne ein Wort dazu, was wie ein Widerspruch aussah — daher die
        // Beschriftung. Sie stand danach ZWEIMAL auf derselben Kachel:
        // gross als "6 Varianten" und klein als "über 6 Varianten" hinter
        // der Prozentzahl. Gemeldet am 01.09.2026: "einmal das in Groß
        // reicht auf jeden Fall aus."
        assert.match(TIER, /tier-hero-meta">\$\{variantCount\} \$\{variantLabel\}/,
            'die grosse Variantenzahl fehlt jetzt ganz');
        assert.doesNotMatch(TIER, /stat-badge-suffix/,
            'die kleine Wiederholung hinter der Prozentzahl ist zurueck');
        /* PRAEZISIERT AM 06.09.2026. Die Anordnung galt der DOPPELTEN
           Variantenzahl, nicht jedem Zusatz: seit demselben Tag steht
           hinter der Win Rate ihr Nenner (`.stat-badge-nenner`), weil
           "WR 52,4 %" ohne Bezugsmenge gegen die aeltere Hausregel
           verstiess. Das ist keine Wiederholung, sondern die fehlende
           Haelfte. Damit die alte Anordnung trotzdem bewacht bleibt,
           wird hier ausdruecklich geprueft, dass der Nenner NICHT die
           Variantenzahl zeigt. */
        const kachel = TIER.slice(TIER.indexOf('const antritte = Number(item.totalCount)'),
                                  TIER.indexOf('heroHtml +=', TIER.indexOf('const antritte =')));
        assert.doesNotMatch(kachel, /variantCount|variantLabel/,
            'der Nenner hinter der Quote zeigt wieder die Variantenzahl');
        assert.match(kachel, /item\.totalCount/,
            'der Nenner kommt nicht aus der Antrittszahl');
        // Die Erklaerung bleibt — nur eben im Titel, nicht als zweite Zeile.
        assert.match(TIER, /Summe über \$\{variantCount\} Varianten/);
    });
});
