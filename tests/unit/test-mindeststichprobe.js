/**
 * Keine Mindeststichprobe, und Rangplatz wird als Bewertung gelesen —
 * Gruppe 8 der Pruefrunde vom 20.08.2026.
 *
 * Sieben Befunde, ein gemeinsamer Kern: Zahlen aus einer Handvoll
 * Partien werden in derselben Kachelform gezeigt wie Zahlen aus
 * Tausenden, und "Tier 1" heisst nur "Listenplatz 1 bis 3", nicht "gut".
 *
 * Die Zahlen in dieser Datei sind an den echten Dateien gemessen, nicht
 * gesetzt: 128 von 304 City-League-Archetypen haben genau eine Liste,
 * und 74 von 4.667 Labs-Zeilen tragen eine Day-2-Konversion von 100 %,
 * davon 65 aus einem einzigen Spieler. Wo eine Pruefung die Rohdaten
 * liest, faellt sie mit den Daten — das ist gewollt: die Behauptung im
 * Kommentar soll nicht laenger stehen als ihre Grundlage.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TIER = lies('js/app-tier-meta.js');

function schnitt(quelle, von, bis, was) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anker fehlt (${was}): ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endanker fehlt (${was}): ${bis}`);
    return quelle.slice(a, b + bis.length);
}

const zahl = (v, d = 0) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : d;
};

function csvSemikolon(pfad) {
    const zeilen = lies(pfad).replace(/^﻿/, '').trim().split(/\r?\n/);
    const kopf = zeilen[0].split(';').map(s => s.trim());
    return zeilen.slice(1).map(z => {
        const f = z.split(';');
        const o = {};
        kopf.forEach((k, i) => { o[k] = (f[i] || '').trim(); });
        return o;
    });
}

// ───────────────────────────────────────────────────────────────────
// 1. Die City-League-Tiers sagen jetzt, was sie messen
// ───────────────────────────────────────────────────────────────────
describe('City-League-Tiers: ein Indexschnitt heisst nicht "Beherrschen das Meta"', () => {
    it('die Untertitel beschreiben den Schnitt, nicht die Spielstaerke', () => {
        const tabelle = schnitt(TIER,
            "'tier-1':        { title: 'Tier 1',           subtitle: t('tier.clSub1')",
            "subtitle: t('tier.clSubRogue') }", 'CL-Tiertabelle');
        for (const k of ['clSub1', 'clSub2', 'clSub3', 'clSubRogue']) {
            assert.ok(tabelle.includes(`t('tier.${k}')`), `tier.${k} fehlt`);
        }
        // Die alten Qualitaetsaussagen duerfen in DIESER Tabelle nicht mehr stehen.
        for (const k of ['sub1', 'sub2', 'sub3', 'subRogue']) {
            assert.ok(!tabelle.includes(`t('tier.${k}')`),
                `tier.${k} steht wieder in der City-League-Tabelle`);
        }
    });

    it('und die Texte behaupten keine Spielstaerke mehr', () => {
        const I18N = lies('js/i18n.js');
        const de = I18N.slice(I18N.indexOf("'tier.clSub1':"));
        for (const wort of ['Beherrschen', 'Herausforderer', 'Spielbare']) {
            const zeile = de.slice(0, de.indexOf("'tier.clBasis'"));
            assert.ok(!zeile.includes(wort),
                `"${wort}" steht wieder in einem City-League-Untertitel`);
        }
        assert.ok(/Die 3 meistgespielten/.test(I18N));
        assert.ok(/Ränge 4–10 nach Listenzahl/.test(I18N));
    });

    it('die Behauptung dahinter stimmt an den echten Daten: Tier 2 schlaegt Tier 1', () => {
        // Das ist der Grund fuer die Umbenennung, und er wird hier gemessen,
        // nicht geglaubt.
        const r = csvSemikolon('data/city_league_archetypes_comparison_M3.csv');
        const nachAnzahl = [...r].sort((a, b) => zahl(b.new_count) - zahl(a.new_count));
        const platz = (x) => zahl(x.new_avg_placement, 999);
        const t1 = nachAnzahl.slice(0, 3).map(platz);
        const t2 = nachAnzahl.slice(3, 10).map(platz);
        assert.ok(Math.min(...t2) < Math.min(...t1),
            `das beste Tier-2-Deck (${Math.min(...t2)}) muesste besser stehen als `
            + `das beste Tier-1-Deck (${Math.min(...t1)}) — sonst ist die Begruendung `
            + 'im Kommentar veraltet');
        // Und die Spreizung der gelisteten 20 ist kleiner als ein ganzer Platz.
        const zwanzig = nachAnzahl.slice(0, 20).map(platz);
        const spreizung = Math.max(...zwanzig) - Math.min(...zwanzig);
        assert.ok(spreizung < 3,
            `Spreizung ueber die 20 gelisteten Decks: ${spreizung.toFixed(2)} Plaetze`);
    });

    it('128 von 304 Archetypen bestehen aus genau einer Liste', () => {
        const r = csvSemikolon('data/city_league_archetypes_comparison_M3.csv');
        const einzel = r.filter(x => zahl(x.new_count) === 1).length;
        assert.equal(r.length, 304);
        assert.equal(einzel, 128,
            'die Zahl in Kommentar und Grundlagen-Zeile ist an dieser Datei gemessen');
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Der Rogue-Block sortiert nicht mehr nach einer Zahl aus einer Liste
// ───────────────────────────────────────────────────────────────────
describe('Rogue-Block: nach Listenzahl, nicht nach der Platzierung eines Einzelnen', () => {
    const block = schnitt(TIER,
        "            Object.keys(tierGroups).forEach((tierKey) => {\n                if (tierKey === 'tier-trending')",
        "            });", 'CL-Sortierung');

    function sortiere(decks) {
        const rumpf = `
            const tierGroups = { 'tier-trending': trending.slice(), 'tier-1': tier1.slice() };
            const parseDeckCount = (d) => d.count;
            const parseDeckRank  = (d) => d.rank;
            ${block}
            return tierGroups;
        `;
        // eslint-disable-next-line no-new-func
        return new Function('trending', 'tier1', rumpf)(decks, decks);
    }

    const decks = [
        { name: 'Einzelstueck A', count: 1,  rank: 1.0 },
        { name: 'Einzelstueck B', count: 1,  rank: 1.0 },
        { name: 'Getragen',       count: 81, rank: 6.5 },
        { name: 'Mittel',         count: 40, rank: 8.2 },
    ];

    it('der Rogue-Block stellt die groesste Stichprobe nach oben', () => {
        const g = sortiere(decks);
        assert.deepEqual(g['tier-trending'].map(d => d.name),
            ['Getragen', 'Mittel', 'Einzelstueck A', 'Einzelstueck B'],
            'ein Deck aus einer Liste mit Platzierung 1,0 darf den Block nicht anfuehren');
    });

    it('Tier 1 bis 3 sortieren weiter nach Platzierung', () => {
        const g = sortiere(decks);
        assert.deepEqual(g['tier-1'].map(d => d.rank), [1.0, 1.0, 6.5, 8.2]);
    });

    it('an den echten Daten fuehrten sonst drei Ein-Listen-Decks den Block an', () => {
        const r = csvSemikolon('data/city_league_archetypes_comparison_M3.csv');
        const nachAnzahl = [...r].sort((a, b) => zahl(b.new_count) - zahl(a.new_count));
        const rogue = nachAnzahl.slice(20);
        const nachPlatz = [...rogue]
            .sort((a, b) => zahl(a.new_avg_placement, 999) - zahl(b.new_avg_placement, 999));
        assert.ok(nachPlatz.slice(0, 3).every(x => zahl(x.new_count) === 1),
            'die alte Sortierung stellte Decks mit einer Liste nach oben');
        const nachN = [...rogue].sort((a, b) => zahl(b.new_count) - zahl(a.new_count));
        assert.ok(zahl(nachN[0].new_count) > 50,
            'die neue Sortierung stellt eine tragfaehige Stichprobe nach oben');
        // Und: wie viele Rogue-Decks sahen besser aus als das schlechteste
        // Tier-3-Deck? Das ist die gemeldete Inversion.
        const schlechtestesT3 = Math.max(...nachAnzahl.slice(10, 20)
            .map(x => zahl(x.new_avg_placement, 0)));
        const besser = rogue.filter(x => {
            const p = zahl(x.new_avg_placement, 999);
            return p > 0 && p < schlechtestesT3;
        }).length;
        assert.ok(besser > 100,
            `erwartet wurde eine grosse Inversion, gefunden: ${besser}`);
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Trendpfeile brauchen eine Stichprobe und einen Unterschied
// ───────────────────────────────────────────────────────────────────
describe('Trendpfeile: kein Pfeil auf ein Hundertstel Platz', () => {
    const block = schnitt(TIER,
        '                    if (isM4WithComparison) {',
        '                        shareTrendClass = shareClass;', 'Pfeilblock');

    function pfeile({ jetztRang, vorherRang, jetztN, vorherN, jetztAnteil, vorherAnteil }) {
        const rumpf = `
            const CL_MIN_LISTEN_PFEIL = 20;
            const CL_MIN_DIFF_PFEIL = 0.5;
            const isM4WithComparison = true;
            const parseLocaleNumber = (v, d) => {
                const n = parseFloat(String(v).replace(',', '.'));
                return Number.isFinite(n) ? n : d;
            };
            const parseDeckCount = (d) => (d && d.count) || 0;
            const getLang = () => 'de';
            const m3Deck = { average_placement: vorherRang, share: vorherAnteil, count: vorherN };
            const currentRankValue = jetztRang, currentShareValue = jetztAnteil;
            const listenN = jetztN;
            let rankTrendClass = 'trend-neutral', shareTrendClass = 'trend-neutral';
            let rankIcon = '', shareIcon = '', m3RankDisplay = '', m3ShareDisplay = '';
            ${block}
            }
            return { rankIcon, shareIcon, rankTrendClass, shareTrendClass };
        `;
        // eslint-disable-next-line no-new-func
        return new Function('jetztRang', 'vorherRang', 'jetztN', 'vorherN',
            'jetztAnteil', 'vorherAnteil', rumpf)(
            jetztRang, vorherRang, jetztN, vorherN, jetztAnteil, vorherAnteil);
    }

    const basis = { jetztN: 600, vorherN: 600, jetztAnteil: 5, vorherAnteil: 5 };

    it('ein Hundertstel Platz bekommt keinen Pfeil mehr', () => {
        const r = pfeile({ ...basis, jetztRang: 8.46, vorherRang: 8.47 });
        assert.equal(r.rankIcon, '–', 'erwartet wurde der neutrale Strich');
        assert.equal(r.rankTrendClass, 'trend-neutral');
    });

    it('ein halber Platz bekommt einen', () => {
        const r = pfeile({ ...basis, jetztRang: 8.0, vorherRang: 8.5 });
        assert.equal(r.rankIcon, '▲', 'kleinerer Rang ist besser');
        assert.equal(r.rankTrendClass, 'trend-positive');
        const s = pfeile({ ...basis, jetztRang: 9.0, vorherRang: 8.5 });
        assert.equal(s.rankIcon, '▼');
        assert.equal(s.rankTrendClass, 'trend-negative');
    });

    it('genau an der Grenze: 0,5 zaehlt, 0,49 nicht', () => {
        assert.equal(pfeile({ ...basis, jetztRang: 8.0, vorherRang: 8.5 }).rankIcon, '▲');
        assert.equal(pfeile({ ...basis, jetztRang: 8.01, vorherRang: 8.5 }).rankIcon, '–');
    });

    it('ohne Stichprobe kein Pfeil, egal wie gross der Unterschied', () => {
        // Der Fall aus den Daten: 128 Archetypen mit genau einer Liste.
        const r = pfeile({ jetztRang: 1.0, vorherRang: 12.0, jetztN: 1, vorherN: 1,
            jetztAnteil: 0.1, vorherAnteil: 0.1 });
        assert.equal(r.rankIcon, '–',
            'elf Plaetze Unterschied aus einer einzigen Liste sind kein Trend');
    });

    it('auch eine Seite unter der Schwelle genuegt zum Schweigen', () => {
        assert.equal(pfeile({ jetztRang: 6, vorherRang: 9, jetztN: 600, vorherN: 3,
            jetztAnteil: 5, vorherAnteil: 5 }).rankIcon, '–');
        assert.equal(pfeile({ jetztRang: 6, vorherRang: 9, jetztN: 3, vorherN: 600,
            jetztAnteil: 5, vorherAnteil: 5 }).rankIcon, '–');
    });

    it('der Anteilspfeil hat dieselbe Art von Schwelle', () => {
        assert.equal(pfeile({ ...basis, jetztRang: 8, vorherRang: 8,
            jetztAnteil: 5.04, vorherAnteil: 5.0 }).shareIcon, '–');
        assert.equal(pfeile({ ...basis, jetztRang: 8, vorherRang: 8,
            jetztAnteil: 5.2, vorherAnteil: 5.0 }).shareIcon, '▲');
        assert.equal(pfeile({ ...basis, jetztRang: 8, vorherRang: 8,
            jetztAnteil: 4.8, vorherAnteil: 5.0 }).shareIcon, '▼');
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Die Stichprobe steht auf der Karte
// ───────────────────────────────────────────────────────────────────
describe('Stichproben sind sichtbar', () => {
    it('die City-League-Karte traegt die Listenzahl', () => {
        assert.ok(/tier-listen-n/.test(TIER), 'die Listen-Plakette fehlt im Renderer');
        assert.ok(/const listenN = parseDeckCount\(deck\);/.test(TIER));
        assert.ok(/tier\.clThinSample/.test(TIER), 'die Duenn-Markierung fehlt');
    });

    it('die Grundlagen-Zeile nennt Listen, Archetypen und Einzelstuecke', () => {
        assert.ok(/tier-grundlage/.test(TIER));
        for (const platzhalter of ['{listen}', '{archetypen}', '{einzel}']) {
            assert.ok(lies('js/i18n.js').includes(platzhalter),
                `${platzhalter} fehlt in tier.clBasis`);
        }
        assert.ok(/clGesamtListen = archetypeArray\.reduce/.test(TIER));
        assert.ok(/clEinzelstueck = archetypeArray\.filter/.test(TIER));
    });

    it('die Duenn-Marke ist in beiden Ansichten auch eingefaerbt', () => {
        // Live gesehen: in der Rogue-Kachel blieb "duenn" grau, weil die
        // Regel nur .tier-listen-n traf. Die Kachel dort fuehrt die aeltere
        // Klasse .stat-sample-size — das Wort stand da, die Farbe nicht.
        const CSS = lies('css/styles.css');
        const i = CSS.indexOf('.stat-badge.tier-listen-n.tier-listen-duenn');
        assert.ok(i >= 0, 'die Duenn-Regel fehlt');
        const regel = CSS.slice(i, CSS.indexOf('}', i));
        assert.ok(regel.includes('.stat-badge.stat-sample-size.tier-listen-duenn'),
            'die Rogue-Kachel faellt wieder aus der Einfaerbung');
        assert.ok(regel.includes('var(--vorbehalt)'));
    });

    it('die Rogue-Kachel des aktuellen Metas markiert duenne Zeilen', () => {
        assert.ok(/const ROGUE_MIN_LISTEN = \(typeof CONV_MIN_N === 'number'\) \? CONV_MIN_N : 20;/.test(TIER),
            'die Rogue-Kachel benutzt nicht dieselbe Schwelle wie der Rest der Seite');
        assert.ok(/listenN < ROGUE_MIN_LISTEN \? ' tier-listen-duenn' : ''/.test(TIER));
    });

    it('und sie schreibt keine Punkte mehr in eine deutsche Zahl', () => {
        // "0.5% · 54.6% WR · 126 Decks" auf einer Seite, die daneben
        // "54,0 % Win Rate" schreibt.
        assert.ok(!/\$\{share\.toFixed\(1\)\}% · \$\{zeigWR\.toFixed\(1\)\}% WR/.test(TIER),
            'die Rogue-Kachel formatiert wieder mit Punkt');
        assert.ok(!/Trend over the last 7 days \(previous snapshot/.test(TIER),
            'der englische Chip-Titel ist zurueck');
    });
});

// ───────────────────────────────────────────────────────────────────
// 5. Der EV-Rechner sagt, wenn er duenn steht
// ───────────────────────────────────────────────────────────────────
describe('EV-Rechner: 51 % aus 11 Partien sieht nicht mehr aus wie 51 % aus 5.000', () => {
    const EV = lies('js/ds-ev-rechner.js');
    const block = schnitt(EV,
        '        var EV_MIN_PARTIEN = 30;',
        "uncertainty band below it is the part that matters here.')\n            : '';",
        'EV-Duenn');

    function pruefe(partien, abdeckung) {
        const rumpf = `
            var L = function (de) { return de; };
            var r = { partien: partien, abdeckung: abdeckung };
            ${block}
            return { evDuenn: evDuenn, text: evDuennText, titel: evDuennTitel };
        `;
        // eslint-disable-next-line no-new-func
        return new Function('partien', 'abdeckung', rumpf)(partien, abdeckung);
    }

    it('der gemeldete Fall wird markiert: 11 Partien, 16 % Feld', () => {
        const r = pruefe(11, 16);
        assert.equal(r.evDuenn, true);
        assert.match(r.text, /dünne Grundlage/);
        assert.match(r.titel, /30/);
    });

    it('eine tragfaehige Rechnung bleibt unmarkiert', () => {
        assert.equal(pruefe(5000, 77).evDuenn, false);
        assert.equal(pruefe(5000, 77).text, '');
    });

    it('jede der beiden Bedingungen genuegt fuer sich', () => {
        assert.equal(pruefe(11, 90).evDuenn, true, 'zu wenige Partien');
        assert.equal(pruefe(5000, 16).evDuenn, true, 'zu wenig Feld');
    });

    it('genau an den Grenzen', () => {
        assert.equal(pruefe(30, 25).evDuenn, false, '30 Partien und 25 % reichen');
        assert.equal(pruefe(29, 25).evDuenn, true);
        assert.equal(pruefe(30, 24.9).evDuenn, true);
    });

    it('ohne Rechnung keine Markierung', () => {
        assert.equal(pruefe(0, 0).evDuenn, false,
            'eine leere Auswahl ist nicht "duenn", sie ist leer');
    });
});

// ───────────────────────────────────────────────────────────────────
// 6. Die Day-2-Konversion zeigt ihren Nenner
// ───────────────────────────────────────────────────────────────────
describe('Day-2-Konversion: 100 % aus einem Spieler ist keine Quote', () => {
    const PM = lies('js/app-past-meta.js');

    it('die Rohdaten sind, wie der Kommentar behauptet: 74 Zeilen, 65 aus einem Spieler', () => {
        // RFC4180, nicht split(','): labs_tournament_decks.csv fuehrt
        // Turniernamen mit Komma darin ("Regional Championship Merida, MX").
        // Ein naives split verschiebt dort die ganze Zeile und zaehlte 35
        // statt 74 — derselbe Fehler, den diese Pruefrunde an anderer
        // Stelle schon im Produktivcode gefunden hat.
        const zerlege = (zeile) => {
            const felder = []; let feld = '', drin = false;
            for (let i = 0; i < zeile.length; i++) {
                const c = zeile[i];
                if (drin) {
                    if (c === '"') {
                        if (zeile[i + 1] === '"') { feld += '"'; i++; } else drin = false;
                    } else feld += c;
                } else if (c === '"') drin = true;
                else if (c === ',') { felder.push(feld); feld = ''; }
                else feld += c;
            }
            felder.push(feld);
            return felder;
        };
        const zeilen = lies('data/labs_tournament_decks.csv').trim().split(/\r?\n/);
        const kopf = zerlege(zeilen[0]);
        const iConv = kopf.indexOf('day1_to_day2_conv');
        const iD1 = kopf.indexOf('day1_players');
        assert.ok(iConv >= 0 && iD1 >= 0, 'Spalten day1_to_day2_conv / day1_players erwartet');
        let hundert = 0, einSpieler = 0;
        for (const z of zeilen.slice(1)) {
            const f = zerlege(z);
            const c = parseFloat((f[iConv] || '').replace('%', ''));
            if (!Number.isFinite(c)) continue;
            if (Math.abs(c - 100) < 1e-9 || Math.abs(c - 1) < 1e-9) {
                hundert++;
                if ((parseInt(f[iD1], 10) || 0) <= 1) einSpieler++;
            }
        }
        /* KEINE FESTEN ZAEHLERSTAENDE MEHR (01.09.2026).
         *
         * Hier stand `assert.equal(hundert, 74)` und
         * `assert.equal(einSpieler, 65)`. Beides waren Momentaufnahmen
         * einer Datei, die mit jedem Turnier waechst: der geplante Lauf
         * um 06:34 UTC hat ein Turnier ergaenzt, aus 74 wurden 75, und
         * der Deploy stand rot — ohne dass sich am Befund oder am Code
         * irgendetwas geaendert haette.
         *
         * Der Befund selbst ist unveraendert richtig und wird jetzt als
         * EIGENSCHAFT geprueft: es gibt reichlich 100-%-Zeilen, und die
         * grosse Mehrheit davon steht auf einem einzigen Spieler. Das
         * ist die Aussage, wegen der die Kachel ihren Nenner zeigt —
         * und sie haelt, egal wie viele Turniere dazukommen. */
        assert.ok(hundert >= 40,
            'nur ' + hundert + ' Zeilen mit 100 % Konversion — die Datei hat sich '
            + 'so stark geaendert, dass der Befund nachgeprueft gehoert');
        const anteil = hundert > 0 ? einSpieler / hundert : 0;
        assert.ok(anteil >= 0.7,
            'nur ' + einSpieler + ' von ' + hundert + ' der 100-%-Zeilen stehen auf '
            + 'einem einzigen Spieler (' + (anteil * 100).toFixed(0) + ' %) — wenn das '
            + 'dauerhaft faellt, traegt die Kachel ihren Nenner aus einem anderen Grund');
    });

    it('die Kachel traegt jetzt Zaehler und Nenner', () => {
        assert.ok(/past-meta-stat-nenner/.test(PM), 'die Nenner-Zeile fehlt');
        assert.ok(/\$\{fmtInt\(day2\)\} \/ \$\{fmtInt\(day1\)\}/.test(PM),
            'Zaehler und Nenner stehen nicht in der Kachel');
    });

    it('unter zehn Day-1-Spielern wird sie als duenn ausgewiesen', () => {
        assert.ok(/const DAY2_MIN_SPIELER = 10;/.test(PM));
        assert.ok(/const day2Duenn = day1 > 0 && day1 < DAY2_MIN_SPIELER;/.test(PM));
        assert.ok(/pm\.day2ThinTip/.test(PM));
    });

    it('ohne Day-1-Zahlen steht ein Strich, keine 0,0 %', () => {
        assert.ok(/\$\{day1 > 0 \? fmtPct\(day2Conv\) : '–'\}/.test(PM),
            'ohne Nenner wurde vorher "0,0 %" gezeigt — das ist eine Aussage, wo keine ist');
    });
});

// ───────────────────────────────────────────────────────────────────
// 7. Der Vorbehalt ist eine Farbe, kein Alarm
// ───────────────────────────────────────────────────────────────────
describe('Die Vorbehaltsfarbe steht in den Tokens', () => {
    const TOK = lies('css/tokens.css');

    it('--vorbehalt ist hell und dunkel definiert', () => {
        const treffer = TOK.match(/--vorbehalt:/g) || [];
        assert.equal(treffer.length, 2, 'erwartet: ein Wert fuer hell, einer fuer dunkel');
        const bg = TOK.match(/--vorbehalt-bg:/g) || [];
        assert.equal(bg.length, 2);
    });

    it('sie ist weder --alarm noch --dv-neg', () => {
        // Eine duenne Stichprobe ist kein Fehler und nicht "schlechter".
        const werte = [...TOK.matchAll(/--vorbehalt:\s*([^;]+);/g)].map(m => m[1].trim());
        const alarm = [...TOK.matchAll(/--alarm:\s*([^;]+);/g)].map(m => m[1].trim());
        const neg = [...TOK.matchAll(/--dv-neg:\s*([^;]+);/g)].map(m => m[1].trim());
        for (const w of werte) {
            assert.ok(!alarm.includes(w), `--vorbehalt hat denselben Wert wie --alarm: ${w}`);
            assert.ok(!neg.includes(w), `--vorbehalt hat denselben Wert wie --dv-neg: ${w}`);
        }
    });

    it('die drei Ansichten benutzen den Token, nicht je eine eigene Hex-Zahl', () => {
        for (const datei of ['css/components.css', 'css/city-league.css', 'css/styles.css']) {
            const css = lies(datei);
            assert.ok(!/#92700e/i.test(css), `${datei} traegt die Farbe noch als Hex-Wert`);
        }
        assert.ok(/var\(--vorbehalt\)/.test(lies('css/components.css')));
        assert.ok(/var\(--vorbehalt\)/.test(lies('css/city-league.css')));
    });

    it('und keine der neuen Regeln bringt ein !important mit', () => {
        for (const [datei, klasse] of [
            ['css/components.css', '.ds-stat.is-duenn'],
            ['css/city-league.css', '.past-meta-stat-nenner'],
            ['css/styles.css', '.tier-listen-n'],
            ['css/styles.css', '.tier-grundlage'],
        ]) {
            const css = lies(datei);
            const i = css.indexOf(klasse);
            assert.ok(i >= 0, `${klasse} fehlt in ${datei}`);
            assert.doesNotMatch(css.slice(i, css.indexOf('}', i)), /!important/,
                `${klasse} bringt ein !important mit`);
        }
    });
});
