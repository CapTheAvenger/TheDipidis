/**
 * DER ANGEZEIGTE NAME MUSS ZUR GERECHNETEN KONVENTION PASSEN.
 *
 * Der billige Test waere: „irgendein Name steht da". Der faengt genau
 * den Fehler nicht, um den es geht. Am 07.09.2026 stand ueber einer
 * Zahl, die S/(S+N+U) rechnet, das Wort „Win %" — ein Name, den
 * Limitless fuer (3S+U)/(3·Partien) benutzt. Beide Zahlen sind richtig
 * gerechnet, beide tragen einen Namen, und trotzdem ist die Anzeige
 * falsch: sie behauptet eine Groesse, die dort nicht gerechnet wird.
 *
 * DIESER TEST GEHT DESHALB VON DEN DATEN AUS, NICHT VOM QUELLTEXT.
 * Fuer jede geprueft Stelle wird
 *
 *   1. aus der CSV-Datei GEMESSEN, welche der drei Konventionen aus
 *      js/win-rate-konvention.js deren Prozentspalte trifft — Spalte
 *      gegen Bilanz, ueber ALLE Zeilen, nicht an einem Einzelfall;
 *   2. aus dem Quelltext der Anzeige gelesen, welche Konvention sie an
 *      dieser Stelle BEHAUPTET;
 *   3. die Beschriftung mit der EIGENEN Hilfsfunktion der Datei
 *      erzeugt und mit WinRateKonvention.kurz(gemessene Konvention)
 *      verglichen.
 *
 * Erst 1 == 2 == 3 ist gruen. Wer eine S/(S+N+U)-Zahl „Win %" nennt,
 * faellt bei 1 gegen 2 durch, auch wenn im Quelltext alles zueinander
 * passt.
 *
 * KURZFORMEN. „WR", „Major-WR", „Ø WR" duerfen stehenbleiben — aber nur
 * mit einem Hinweis (title / data-hinweis), der den VOLLEN Namen UND
 * die Formel nennt. Ohne ihn ist die Kurzform ein Hausname. Das prueft
 * der letzte Block.
 *
 * ZUM WACHHUND (tests/unit/test-testdaten-wachhund.js): diese Datei
 * liest data/ und ist dort eingetragen. Sie behauptet keinen
 * Wochenwert — jeder Sollwert wird aus derselben Datei gerechnet, gegen
 * die geprueft wird.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { baue } = require('./lib-dom-sandkasten.js');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...teile) => fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');

// ── js/win-rate-konvention.js ausfuehren ─────────────────────────────

function ladeKonventionen(sprache) {
    const fenster = {};
    const ctx = { window: fenster, getLang: () => sprache || 'de', console };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(lies('js', 'win-rate-konvention.js'), ctx,
        { filename: 'js/win-rate-konvention.js' });
    assert.ok(fenster.WinRateKonvention, 'js/win-rate-konvention.js setzt window.WinRateKonvention nicht');
    return fenster.WinRateKonvention;
}

const WK = ladeKonventionen('de');

// ── CSV lesen (nur so viel, wie hier gebraucht wird) ─────────────────

function csv(pfad, trenner) {
    const roh = lies(...pfad.split('/')).replace(/^﻿/, '').trim();
    const zeilen = roh.split(/\r?\n/);
    const kopf = zeilen[0].split(trenner).map(s => s.trim());
    return zeilen.slice(1).map((z) => {
        const teile = z.split(trenner);
        const o = {};
        kopf.forEach((k, i) => { o[k] = teile[i]; });
        return o;
    });
}

const zahl = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};

/**
 * Welche der drei Konventionen trifft diese Spalte?
 *
 * `proben` sind {wert, s, n, u}. Gewinner ist die Konvention, die die
 * meisten Zeilen innerhalb der Toleranz trifft — und sie muss deutlich
 * gewinnen, sonst faellt der Test. Auf kleinen Bilanzen fallen zwei
 * Konventionen rechnerisch zusammen (0 Unentschieden), deshalb der
 * Abstand statt einer harten 100-%-Forderung.
 */
const TOLERANZ_PP = 0.02;      // Rundung der letzten angezeigten Stelle
const MINDESTVORSPRUNG = 0.25; // Anteil der Zeilen, den der Sieger vorn liegen muss

function gemesseneKonvention(proben) {
    assert.notEqual(proben.length, 0, 'keine auswertbaren Zeilen — die Probe liefe leer');
    const treffer = {};
    for (const id of Object.keys(WK.KONVENTIONEN)) {
        const k = WK.KONVENTIONEN[id];
        treffer[id] = proben.filter((p) => {
            const soll = (id === 'ohneUnentschieden')
                ? k.rechne(p.s, p.n)
                : k.rechne(p.s, p.n, p.u);
            return Number.isFinite(soll) && Math.abs(soll - p.wert) <= TOLERANZ_PP;
        }).length;
    }
    const rang = Object.keys(treffer).sort((a, b) => treffer[b] - treffer[a]);
    const erster = rang[0], zweiter = rang[1];

    /* DER VORSPRUNG GEHOERT AUF DIE ZEILEN, DIE IHN ZEIGEN KOENNEN.

       BEFUND 23.09.2026 (Wochenlauf #147). Hier stand der Vorsprung
       gegen ALLE Zeilen. Eine Zeile ohne Unentschieden erfuellt aber
       alle drei Konventionen gleichzeitig — sie kann gar nichts
       unterscheiden und verwaessert den Nenner nur.

       Solange das Fenster acht Wochen gesammelt hatte, fiel das nicht
       auf. Nach der Rotation auf 30C am 16.09.2026 zaehlt der
       Online-Scraper von vorn: 847 statt 1.794 Matchupzeilen, Treffer
       {matchpunkte: 687, mitUnentschieden: 682, ohneUnentschieden: 847}.
       Vorsprung gegen alle Zeilen 0,19 — unter der Schwelle, obwohl der
       Sieger JEDE Zeile trifft und die beiden anderen 160 verfehlen.

       Gerechnet wird der Vorsprung deshalb gegen die Zeilen MIT
       Unentschieden. Das ist dieselbe Aussage, nur ohne die Zeilen, die
       zu ihr nichts beitragen — und sie haengt nicht mehr daran, wie
       lange ein Fenster schon sammelt. */
    const unterscheidbar = proben.filter((p) => (p.u || 0) > 0).length;
    const nenner = unterscheidbar > 0 ? unterscheidbar : proben.length;
    const vorsprung = (treffer[erster] - treffer[zweiter]) / nenner;
    assert.ok(unterscheidbar >= 10 || proben.length < 50,
        `nur ${unterscheidbar} von ${proben.length} Zeilen fuehren Unentschieden — `
        + 'ohne sie fallen zwei Konventionen zusammen und die Probe bestuende leer');
    assert.ok(vorsprung >= MINDESTVORSPRUNG,
        'die Datei laesst sich keiner Konvention eindeutig zuordnen: '
        + JSON.stringify(treffer) + ' bei ' + proben.length + ' Zeilen, davon '
        + unterscheidbar + ' mit Unentschieden');
    return { id: erster, treffer, proben: proben.length };
}

// ── die drei Quellen, aus denen die geprueften Zahlen kommen ─────────

function probenOnlineDecks() {
    return csv('data/limitless_online_decks.csv', ';').map(r => ({
        wert: zahl(r.win_rate_numeric),
        s: zahl(r.wins), n: zahl(r.losses), u: zahl(r.ties),
    })).filter(p => [p.wert, p.s, p.n, p.u].every(Number.isFinite) && (p.s + p.n + p.u) > 0);
}

function probenMatchups() {
    return csv('data/limitless_online_decks_matchups.csv', ';').map((r) => {
        const t = String(r.record || '').split('-').map(x => parseInt(x.trim(), 10));
        return { wert: zahl(r.win_rate), s: t[0], n: t[1], u: Number.isFinite(t[2]) ? t[2] : 0 };
    }).filter(p => [p.wert, p.s, p.n].every(Number.isFinite) && (p.s + p.n) > 0);
}

function probenComparison() {
    // Die Vergleichsdatei fuehrt KEINE Bilanz — sie kommt aus der
    // Deck-Uebersicht daneben, ueber den Decknamen verbunden.
    const bilanz = {};
    for (const r of csv('data/limitless_online_decks.csv', ';')) {
        if (r.deck_name) bilanz[r.deck_name.trim()] = r;
    }
    return csv('data/limitless_online_decks_comparison.csv', ';').map((r) => {
        const b = bilanz[String(r.deck_name || '').trim()];
        if (!b) return null;
        return { wert: zahl(r.new_winrate), s: zahl(b.wins), n: zahl(b.losses), u: zahl(b.ties) };
    }).filter(p => p && [p.wert, p.s, p.n, p.u].every(Number.isFinite) && (p.s + p.n + p.u) > 0);
}

// ── die Hilfsfunktionen der Anzeigedateien, echt ausgefuehrt ─────────

function helferAus(datei, praefix) {
    const namen = praefix
        ? [praefix + 'QuotenName', praefix + 'QuotenFormel',
           praefix + 'MitQuote', praefix + 'QuotenHinweis']
        : ['quotenName', 'quotenFormel', 'mitQuote', 'quotenHinweis'];
    const ctx = baue(datei,
        namen.map(n => 'function ' + n + '('),
        { window: { WinRateKonvention: WK }, getLang: () => 'de' });
    return {
        name:    ctx[namen[0]],
        formel:  ctx[namen[1]],
        fuellen: ctx[namen[2]],
        hinweis: ctx[namen[3]],
    };
}

// ── die deutschen Uebersetzungswerte ─────────────────────────────────

const I18N = lies('js', 'i18n.js');
const DE_BLOCK = I18N.slice(I18N.indexOf('\n  de: {'));

function i18nDe(schluessel) {
    const re = new RegExp("'" + schluessel.replace(/\./g, '\\.')
        + "':\\s*'((?:[^'\\\\]|\\\\.)*)'");
    const m = DE_BLOCK.match(re);
    assert.ok(m, 'Schluessel fehlt im deutschen Block von js/i18n.js: ' + schluessel);
    return m[1].replace(/\\u([0-9a-fA-F]{4})/g,
        (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── die geprueften Stellen ───────────────────────────────────────────
//
// `anker` liest die Konvention, die die Anzeige BEHAUPTET, direkt aus
// der Zeile, die die Beschriftung baut. Verstellt jemand sie dort,
// faellt der Vergleich mit der gemessenen Konvention um.

const STELLEN = [
    {
        name: 'Deck-Analyse: Kachel „Gesamte …" (stats.totalWinrate)',
        datei: 'js/app-current-meta-analysis.js',
        praefix: 'cma',
        anker: /'stats\.totalWinrate':\s*'([A-Za-z]+)'/,
        schluessel: 'stats.totalWinrate',
        proben: probenOnlineDecks,
        quelle: 'data/limitless_online_decks.csv, Spalte win_rate_numeric',
    },
    {
        name: 'Deck-Analyse: Matchup-Feld (matchup.winRate)',
        datei: 'js/app-current-meta-analysis.js',
        praefix: 'cma',
        anker: /'matchup\.winRate':\s*'([A-Za-z]+)'/,
        schluessel: 'matchup.winRate',
        proben: probenMatchups,
        quelle: 'data/limitless_online_decks_matchups.csv, Spalte win_rate',
    },
    {
        name: 'Archetyp-Kachel: die Quoten-Kachel (arc.wrLabel)',
        datei: 'js/app-archetype-card.js',
        praefix: '',
        anker: /tileGeteilt\('wr',[\s\S]{0,80}?mitQuote\(L\('arc\.wrLabel', '\{quote\}'\), '([A-Za-z]+)'\)/,
        schluessel: 'arc.wrLabel',
        proben: probenOnlineDecks,
        quelle: 'data/limitless_online_decks.csv, Spalte win_rate_numeric',
    },
    {
        name: 'Archetyp-Kachel: Spaltenkopf „WR" der Paarungstabelle',
        datei: 'js/app-archetype-card.js',
        praefix: '',
        anker: /data-quote-konvention="([A-Za-z]+)">\$\{esc\(L\('arc\.colWinRate'/,
        schluessel: 'arc.muLegende',
        proben: probenMatchups,
        quelle: 'data/limitless_online_decks_matchups.csv, Spalte win_rate',
    },
    {
        name: 'Heatmap: Legende zu „WR" (heatmap.legendeWr)',
        datei: 'js/app-current-meta.js',
        praefix: 'heatmap',
        anker: /heatmapMitQuote\(t\('heatmap\.legendeWr'\), '([A-Za-z]+)'\)/,
        schluessel: 'heatmap.legendeWr',
        proben: probenMatchups,
        quelle: 'data/limitless_online_decks_matchups.csv, Spalte win_rate',
    },
    {
        name: 'Meta-Performance: Spaltenkopf der Quote',
        datei: 'js/app-tier-meta.js',
        praefix: 'tier',
        anker: /\{ k: 'wr',\s+de: tierQuotenName\('([A-Za-z]+)'\)/,
        schluessel: null,   // der Kopf ist reiner Laufzeitname, kein i18n-Wert
        proben: probenComparison,
        quelle: 'data/limitless_online_decks_comparison.csv, Spalte new_winrate '
              + '(Bilanz aus data/limitless_online_decks.csv)',
    },
    {
        name: 'Tier-Kachel: Plakette „… % WR" (tier.rogueThinTip)',
        datei: 'js/app-tier-meta.js',
        praefix: 'tier',
        anker: /const wrTitel = escapeHtml\(tierQuotenHinweis\('([A-Za-z]+)'\)/,
        schluessel: 'tier.rogueThinTip',
        proben: probenComparison,
        quelle: 'data/limitless_online_decks_comparison.csv, Spalte new_winrate '
              + '(Bilanz aus data/limitless_online_decks.csv)',
    },
];

describe('W1 — der angezeigte Name passt zur gerechneten Konvention', () => {
    it('die drei Konventionen sind ueberhaupt unterscheidbar', () => {
        // Vorpruefung gegen ein leeres Bestehen: waeren zwei Konventionen
        // auf denselben Zahlen gleich, bewiese jeder Vergleich unten nichts.
        const s = 100, n = 80, u = 20;
        const w = WK.KONVENTIONEN;
        const mp = w.matchpunkte.rechne(s, n, u);
        const mit = w.mitUnentschieden.rechne(s, n, u);
        const ohne = w.ohneUnentschieden.rechne(s, n);
        assert.notEqual(mp.toFixed(4), mit.toFixed(4));
        assert.notEqual(mp.toFixed(4), ohne.toFixed(4));
        assert.notEqual(mit.toFixed(4), ohne.toFixed(4));
        assert.notEqual(WK.kurz('matchpunkte'), WK.kurz('mitUnentschieden'));
        assert.notEqual(WK.kurz('matchpunkte'), WK.kurz('ohneUnentschieden'));
        assert.notEqual(WK.kurz('mitUnentschieden'), WK.kurz('ohneUnentschieden'));
    });

    for (const stelle of STELLEN) {
        it(stelle.name, () => {
            // 1. GEMESSEN an der Datei.
            const gemessen = gemesseneKonvention(stelle.proben());

            // 2. BEHAUPTET im Quelltext der Anzeige.
            const treffer = lies(...stelle.datei.split('/')).match(stelle.anker)
                || (stelle.datei === 'js/app-current-meta-analysis.js'
                    ? null : null);
            assert.ok(treffer, 'Anker nicht gefunden in ' + stelle.datei
                + ' — die Beschriftung wurde umgebaut, ohne diesen Test mitzuziehen');
            const behauptet = treffer[1];

            assert.equal(behauptet, gemessen.id,
                `${stelle.name}: die Anzeige nennt „${WK.kurz(behauptet)}" (${behauptet}), `
                + `gerechnet wird aber ${gemessen.id} — gemessen an ${stelle.quelle}, `
                + `${gemessen.proben} Zeilen, Treffer ${JSON.stringify(gemessen.treffer)}`);

            // 3. WAS WIRKLICH DASTEHT — mit der Hilfsfunktion der Datei erzeugt.
            const h = helferAus(stelle.datei, stelle.praefix);
            assert.equal(h.name(behauptet), WK.kurz(gemessen.id),
                'die Datei erzeugt einen anderen Namen als das Modul fuehrt');
            if (stelle.schluessel) {
                const text = h.fuellen(i18nDe(stelle.schluessel), behauptet);
                assert.ok(text.includes(WK.kurz(gemessen.id)),
                    `der Text zu ${stelle.schluessel} traegt den Namen `
                    + `„${WK.kurz(gemessen.id)}" nicht: ${text}`);
                assert.ok(!/\{quote\}|\{formel\}/.test(text),
                    'Platzhalter blieb stehen: ' + text);
            }
        });
    }

    it('„Win %" bleibt den Matchpunkten vorbehalten', () => {
        // Der Kern der Anordnung. Keine der geprueften Stellen rechnet
        // Matchpunkte, also darf keine „Win %" tragen — und „Win %" muss
        // umgekehrt genau dort stehen, wo Matchpunkte gerechnet werden.
        assert.equal(WK.kurz('matchpunkte'), 'Win %');
        for (const stelle of STELLEN) {
            const gemessen = gemesseneKonvention(stelle.proben());
            const h = helferAus(stelle.datei, stelle.praefix);
            assert.notEqual(h.name(gemessen.id), 'Win %',
                stelle.name + ' traegt „Win %", rechnet aber ' + gemessen.id);
        }
    });

    it('kein {quote}-Schluessel wird ungefuellt ausgegeben', () => {
        /* DER PLATZHALTER IST NUR SO GUT WIE SEINE FUELLUNG.
           Steht in js/i18n.js „{quote}" und ruft die Anzeige den
           Schluessel ohne Fueller ab, steht auf der Seite woertlich
           „{quote}" — schlimmer als der Hausname, den er ersetzt hat.
           Geprueft wird deshalb JEDE Verwendung: entweder direkt in einen
           *MitQuote(…)-Aufruf gewickelt, oder — fuer Beschriftungen, die
           als data-i18n im Markup stehen — in der Zuordnungstabelle
           CMA_QUOTEN_SCHLUESSEL eingetragen. */
        const schluessel = [...I18N.matchAll(
            /'([A-Za-z0-9_.]+)':\s*'((?:[^'\\]|\\.)*\{quote\}(?:[^'\\]|\\.)*)'/g)]
            .map(m => m[1]);
        const eindeutig = [...new Set(schluessel)];
        assert.ok(eindeutig.length >= 8,
            'nur ' + eindeutig.length + ' Schluessel mit Platzhalter — die Umstellung '
            + 'ist zurueckgedreht worden, und der Test liefe leer');

        const cmaQuelle = lies('js', 'app-current-meta-analysis.js');
        const tabelle = cmaQuelle.slice(cmaQuelle.indexOf('const CMA_QUOTEN_SCHLUESSEL'),
                                        cmaQuelle.indexOf('};', cmaQuelle.indexOf('const CMA_QUOTEN_SCHLUESSEL')));

        /* NICHT NUR EINE ZUORDNUNGSTABELLE (ergaenzt am 08.09.2026).
           Eine data-i18n-Beschriftung darf ihren Fueller auch im
           eigenen Modul mitbringen, statt in der Tabelle des
           Meta-Reiters zu stehen — js/app-anti-tech.js macht das fuer
           die Legende ueber den Gegner-Pillen (_quotenNamenImDom).
           Gelesen wird deshalb NUR der Rumpf dieser Funktion, nicht die
           ganze Datei: sonst wuerde jedes beliebige t('…') als Fueller
           durchgehen und der Waechter waere wertlos. */
        const atQuelle = lies('js', 'app-anti-tech.js');
        const atStart  = atQuelle.indexOf('function _quotenNamenImDom');
        const atFueller = atStart >= 0
            ? atQuelle.slice(atStart, atQuelle.indexOf('\n    }', atStart))
            : '';
        assert.ok(/querySelectorAll|\{quote\}|_mitQuote/.test(atFueller),
            '_quotenNamenImDom in js/app-anti-tech.js gibt es nicht mehr — dann '
            + 'bleibt in der Anti-Tech-Legende woertlich „{quote}" stehen');
        const zuordnung = tabelle + '\n' + atFueller;

        const offen = [];
        for (const datei of ['js/app-current-meta-analysis.js', 'js/app-current-meta.js',
                             'js/app-archetype-card.js', 'js/app-tier-meta.js',
                             'js/meta-analysis-hub.js']) {
            const q = lies(...datei.split('/'));
            for (const k of eindeutig) {
                const ruf = new RegExp("(\\w*[Mm]itQuote\\(\\s*)?\\b[tL]\\(\\s*'"
                    + k.replace(/\./g, '\\.') + "'", 'g');
                for (const m of q.matchAll(ruf)) {
                    if (!m[1]) offen.push(datei + ' → ' + k);
                }
            }
        }
        // Was im Markup steht statt im Skript, gehoert in die Zuordnung.
        const ausMarkup = eindeutig.filter(k => new RegExp('data-i18n="'
            + k.replace(/\./g, '\\.') + '"').test(lies('index.html')));
        assert.ok(ausMarkup.length >= 2,
            'kein Platzhalter mehr im Markup — dann prueft der naechste Block nichts');
        for (const k of ausMarkup) {
            assert.ok(zuordnung.includes("'" + k + "'") || zuordnung.includes('"' + k + '"'),
                'die Beschriftung ' + k + ' steht als data-i18n im Markup, aber weder in '
                + 'CMA_QUOTEN_SCHLUESSEL noch im Fueller eines eigenen Moduls — dann '
                + 'bleibt dort woertlich „{quote}" stehen');
        }
        assert.deepEqual(offen, [],
            'Platzhalter wird ohne Fueller ausgegeben:\n  ' + offen.join('\n  '));
    });

    it('jede Kurzform traegt einen Hinweis mit vollem Namen UND Formel', () => {
        const KURZFORMEN = [
            {
                name: 'Archetyp-Kachel, Spalte „WR"',
                datei: 'js/app-archetype-card.js', praefix: '', konvention: 'ohneUnentschieden',
                markup: /<th title="\$\{esc\(quotenHinweis\('ohneUnentschieden'\)\)\}"[\s\S]{0,120}?arc\.colWinRate/,
            },
            {
                name: 'Archetyp-Kachel, Spalte „Major-WR"',
                datei: 'js/app-archetype-card.js', praefix: '', konvention: 'ohneUnentschieden',
                markup: /<th title="\$\{esc\(quotenHinweis\('ohneUnentschieden'\) \+ '  ' \+ L\('arc\.colMajorTip'/,
            },
            {
                name: 'Heatmap, Kennzahl „WR" in der Zelle',
                datei: 'js/app-current-meta.js', praefix: 'heatmap', konvention: 'ohneUnentschieden',
                markup: /heatmap-zelle-kennzahl" title="\$\{escAttr\(heatmapQuotenHinweis\('ohneUnentschieden'\)\)\}/,
            },
            {
                name: 'Tier-Kachel, Plakette „… % WR"',
                datei: 'js/app-tier-meta.js', praefix: 'tier', konvention: 'mitUnentschieden',
                markup: /const wrTitel = escapeHtml\(tierQuotenHinweis\('mitUnentschieden'\)/,
            },
            {
                name: 'Startseite, Heldenplakette „WR …"',
                datei: 'js/app-tier-meta.js', praefix: 'tier', konvention: 'mitUnentschieden',
                markup: /const wrTitel = tierQuotenHinweis\('mitUnentschieden'\)/,
            },
            {
                name: 'Labs-Plakette „🏆 … WR"',
                datei: 'js/app-tier-meta.js', praefix: 'tier', konvention: 'mitUnentschieden',
                markup: /const _labsTitle = tierQuotenHinweis\('mitUnentschieden'\)/,
            },
            {
                name: 'Deck-Analyse, Titel „Ø WR"',
                datei: 'js/app-current-meta-analysis.js', praefix: 'cma', konvention: 'ohneUnentschieden',
                markup: /titleEl\.setAttribute\('title', cmaQuotenHinweis\('ohneUnentschieden'\)\)/,
            },
        ];
        for (const k of KURZFORMEN) {
            assert.match(lies(...k.datei.split('/')), k.markup,
                k.name + ': der Hinweis am Kuerzel ist weg — dann steht dort ein Hausname');
            const h = helferAus(k.datei, k.praefix);
            const hinweis = h.hinweis(k.konvention);
            assert.ok(hinweis.includes(WK.kurz(k.konvention)),
                k.name + ': der Hinweis nennt den vollen Namen nicht');
            assert.ok(hinweis.includes(WK.hol(k.konvention).formel),
                k.name + ': der Hinweis nennt die Formel nicht');
        }
    });
});
