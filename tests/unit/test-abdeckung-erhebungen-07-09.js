/**
 * Die Abdeckungsplakette der Kartendatenbank — eine Zahl, EINE Erhebung.
 *
 * BEFUND (07.09.2026, in der LIVE-Konfiguration gegen die echten Dateien
 * gemessen, also mit window.getCurrentMetaFormat wie index.html es setzt):
 * auf denselben Formatschluessel TEF-PBL fallen drei getrennte Erhebungen —
 *
 *   Tournament / TEF-PBL        27 Archetypen,  143 Decks
 *   Current Meta / Meta Live    60 Archetypen, 1187 Decks
 *   Current Meta / Meta Play!   34 Archetypen,  253 Decks
 *
 * 32 von 66 Archetypen melden darin verschieden viele Decks (Dragapult
 * 22 / 20 / 46). Der Zaehler wurde ueber die Erhebungen SUMMIERT und erst
 * beim Lesen an den groessten Nenner geklemmt. Ergebnis: von 948
 * Karte-Archetyp-Paaren mit mehr als einer Erhebung standen 243 UEBER
 * jeder Einzelerhebung (175 davon ohne jede Marke) und 12 DARUNTER (alle
 * ohne Marke); der hoechste Rohwert war 270,0 %.
 *
 * Gerechnet wird seither je Erhebung. Diese Datei haelt das fest:
 * ohne die Korrektur wird jede Zusicherung hier rot.
 *
 * KEIN jsdom (CI installiert nur papaparse), KEINE LIVEDATEN: jede Zeile,
 * die hier eingelesen wird, steht in dieser Datei. Der Wachhund
 * (test-testdaten-wachhund.js) sieht sie deshalb bewusst nicht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(WURZEL, 'js', 'app-cards-db.js'), 'utf8');

/** Eine Funktion mitsamt ihrem Rumpf aus dem Quelltext schneiden. */
function funktion(name, asyncFn) {
    const kopf = (asyncFn ? 'async function ' : 'function ') + name + '(';
    const start = SRC.indexOf(kopf);
    assert.ok(start >= 0, name + '() gibt es nicht mehr');
    let runde = 0;
    let j = SRC.indexOf('(', start);
    for (; j < SRC.length; j++) {
        if (SRC[j] === '(') runde++;
        else if (SRC[j] === ')') { runde--; if (runde === 0) break; }
    }
    let tiefe = 0;
    for (j = SRC.indexOf('{', j); j < SRC.length; j++) {
        if (SRC[j] === '{') tiefe++;
        else if (SRC[j] === '}') { tiefe--; if (tiefe === 0) return SRC.slice(start, j + 1); }
    }
    assert.fail(name + '(): Klammern gehen nicht auf');
}

/** Ein Stueck Quelltext zwischen zwei Markierungen. */
function stueck(von, bis) {
    const a = SRC.indexOf(von);
    assert.ok(a >= 0, 'Anfang nicht gefunden: ' + von);
    const b = SRC.indexOf(bis, a);
    assert.ok(b >= 0, 'Ende nicht gefunden: ' + bis);
    return SRC.slice(a, b);
}

// ── Die kleinste Umgebung, die traegt ────────────────────────────────

function umgebung(quellen, wahl) {
    const gewaehlt = wahl || {};
    const dok = {
        getElementById: () => null,
        querySelectorAll: (sel) => {
            const bau = (v) => (v || []).map(x => ({ value: x }));
            if (sel.indexOf('#mainPokemonList') === 0) return bau(gewaehlt.haupt);
            if (sel.indexOf('#archetypeList') === 0) return bau(gewaehlt.archetypen);
            if (sel.indexOf('#metaFormatOptions') === 0) return bau((gewaehlt.metas || []).map(m => 'meta:' + m));
            return [];
        }
    };
    const sb = {
        console: { warn() {}, error() {} },
        Math, Date, Number, String, Array, Map, Set, JSON, Boolean, Object, Error,
        parseInt, parseFloat, isNaN, Promise, RegExp, setTimeout,
        document: dok,
        devLog: () => {},
        stripTrainerOwnerPrefix: (n) => {
            const m = String(n || '').trim().match(/^(.+?['’]s)\s+(.+)$/);
            return m ? { owner: m[1], base: m[2] } : { owner: '', base: String(n || '').trim() };
        },
        normalizeCardName: (n) => String(n || '').toLowerCase().trim(),
        isBasicEnergy: () => false,
        sanitizeTournamentArchetypeName: (a) => String(a || '').trim(),
        /* Dieselbe Abbildung wie live: index.html setzt
         * window.getCurrentMetaFormat, und normalizeTournamentFormatLabel
         * loest "Meta Live" UND "Meta Play!" darueber auf denselben Code
         * auf. Genau daran fallen zwei Erhebungen auf einen Schluessel —
         * ohne diese Zeile misst der Test das Falsche. */
        normalizeTournamentFormatLabel: (meta) => {
            const roh = String(meta || '').trim().toLowerCase();
            if (roh === 'meta live' || roh === 'meta play!') return 'TEF-PBL';
            return String(meta || '').trim();
        },
        parseTournamentDate: () => null,
        getCardReleaseDate: () => null,
        SET_RELEASE_DATES: { DEFAULT: '2000-01-01' },
    };
    sb.window = sb;
    sb._fetchAndParseCsvCached = (datei) => Promise.resolve(quellen[datei] || []);
    return sb;
}

const HAUPT_KONST = (() => {
    const a = SRC.indexOf('const HAUPT_FORMWORTE');
    assert.ok(a >= 0, 'HAUPT_FORMWORTE gibt es nicht mehr');
    return SRC.slice(a, SRC.indexOf('\n', a));
})();

async function laden(quellen, wahl) {
    const sb = umgebung(quellen, wahl);
    const quelltext = [
        HAUPT_KONST,
        funktion('hauptPokemonAusArchetyp'),
        'window.hauptPokemonAusArchetyp = hauptPokemonAusArchetyp;',
        funktion('loadDeckCoverageStats', true),
        funktion('calculateDynamicCoverage'),
        'window.loadDeckCoverageStats = loadDeckCoverageStats;',
        'window.calculateDynamicCoverage = calculateDynamicCoverage;'
    ].join('\n\n');
    const namen = Object.keys(sb);
    // eslint-disable-next-line no-new-func
    const bau = new Function(...namen, quelltext + '\nreturn window;');
    const w = bau(...namen.map(k => sb[k]));
    await w.loadDeckCoverageStats();
    return w;
}

/** Eine Zeile, wie die drei CSV-Quellen sie liefern. */
function zeile(meta, archetyp, karte, set, deckMitKarte, decksImArchetyp) {
    return {
        meta: meta,
        archetype: archetyp,
        card_name: karte,
        set_code: set,
        set_number: '1',
        deck_inclusion_count: String(deckMitKarte),
        total_decks_in_archetype: String(decksImArchetyp),
        max_count: '4'
    };
}

/* Der live gemessene Fall, auf das Noetigste eingedampft: DREI Erhebungen
 * auf demselben Schluessel TEF-PBL|Dragapult, mit 22, 20 und 46 Decks —
 * genau die drei Zahlen, die live nebeneinanderstehen. */
const DREI_ERHEBUNGEN = {
    'tournament_cards_data_cards.csv': [
        zeile('TEF-PBL', 'Dragapult', 'Dreepy', 'POR', 11, 22),
        zeile('TEF-PBL', 'Dragapult', 'Meowth ex', 'POR', 22, 22),
    ],
    'current_meta_card_data.csv': [
        zeile('Meta Live', 'Dragapult', 'Dreepy', 'TWM', 5, 20),
        zeile('Meta Play!', 'Dragapult', 'Dreepy', 'ASC', 46, 46),
    ]
};

/* ══ Die Ursache: nicht mehr ueber Erhebungen summieren ═════════════ */

describe('Abdeckung — eine Zahl stammt aus EINER Erhebung', () => {
    it('die drei Erhebungen werden getrennt gefuehrt, nicht verschmolzen', async () => {
        const w = await laden(DREI_ERHEBUNGEN);
        const ids = Array.from(w.erhebungen.keys()).sort();
        assert.deepEqual(ids, [
            'Current Meta / Meta Live',
            'Current Meta / Meta Play!',
            'Tournament / TEF-PBL'
        ], 'Ohne die Trennung nach Quelle UND rohem Label fallen "Meta Live" und '
            + '"Meta Play!" auf denselben Eintrag — genau der Fehler, der live '
            + '243 Werte ueber jede Einzelquelle gehoben hat.');
        assert.equal(w.erhebungen.get('Tournament / TEF-PBL').decksGesamt, 22);
        assert.equal(w.erhebungen.get('Current Meta / Meta Live').decksGesamt, 20);
        assert.equal(w.erhebungen.get('Current Meta / Meta Play!').decksGesamt, 46);
    });

    it('gezeigt wird die groesste Erhebung, mit ihrem eigenen Nenner', async () => {
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.ok(r, 'kein Ergebnis');
        assert.equal(r.erhebung, 'Current Meta / Meta Play!',
            'die groesste Erhebung hat 46 Decks; gezeigt wurde: ' + r.erhebung);
        assert.equal(r.totalDecks, 46, 'der Nenner muss der DIESER Erhebung sein');
        assert.equal(r.deckCount, 46, 'und der Zaehler aus derselben Erhebung');
        assert.equal(r.percentage, 100);
    });

    it('der Zaehler ist keine Summe ueber die Erhebungen', async () => {
        /* Meowth ex steht nur in der Turnier-Erhebung, mit 22 von 22 Decks.
         * Die alte Summe waere 22 gewesen, geklemmt gegen den groessten
         * Nenner 46 — also "47,8 %", eine Zahl, die in keiner Quelle steht.
         * Gezeigt wird jetzt die groesste Erhebung (Meta Play!, 46 Decks),
         * in der die Karte nicht vorkommt: 0 von 46. */
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Meowth ex');
        assert.notEqual(Math.round(r.percentage * 10) / 10, 47.8,
            'das ist genau der Wert aus der alten Summe: ' + r.deckCount + '/' + r.totalDecks);
        assert.equal(r.deckCount, 0);
        assert.equal(r.totalDecks, 46);
        const turnier = r.weitereErhebungen.find(x => x.name === 'Tournament / TEF-PBL');
        assert.ok(turnier, 'die Erhebung, die die Karte kennt, muss genannt werden: '
            + JSON.stringify(r.weitereErhebungen));
        assert.equal(turnier.deckCount, 22);
        assert.equal(turnier.totalDecks, 22);
    });

    it('welche Erhebung gezeigt wird, haengt an den Filtern und nicht an der Karte', async () => {
        /* Sonst waere die Seite systematisch zu hoch: je Karte die Erhebung
         * zu nehmen, in der sie am besten dasteht, ist eine Auswahl nach dem
         * Ergebnis. Alle Karten desselben Filterzustands stammen deshalb aus
         * derselben Erhebung. */
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        const a = w.calculateDynamicCoverage('Dreepy');
        const b = w.calculateDynamicCoverage('Meowth ex');
        assert.equal(a.erhebung, b.erhebung,
            'zwei Karten derselben Seite, zwei Erhebungen: ' + a.erhebung + ' / ' + b.erhebung);
        assert.equal(a.totalDecks, b.totalDecks, 'und damit auch derselbe Nenner');
    });

    it('eine Erhebung ohne diese Karte meldet 0, nicht "unbekannt"', async () => {
        /* In beiden Quelldateien steht keine einzige Zeile mit 0 Decks
         * (gemessen 07.09.2026: 0 von 879 und 0 von 4.484). Eine nicht
         * gespielte Karte fehlt einfach. Die Erhebung bleibt damit
         * waehlbar, und ihr Wert ist eine gemessene Null. */
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Meowth ex');
        assert.equal(r.erhebung, 'Current Meta / Meta Play!', 'die groesste Erhebung');
        assert.equal(r.totalDecks, 46);
        assert.equal(r.deckCount, 0);
        assert.equal(r.percentage, 0);
    });

    it('kein Wert liegt ueber 100 %, auch bei widersprechenden Erhebungen', async () => {
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        ['Dreepy', 'Meowth ex'].forEach(k => {
            const r = w.calculateDynamicCoverage(k);
            assert.ok(r.percentage <= 100,
                k + ': ' + r.deckCount + ' von ' + r.totalDecks + ' = ' + r.percentage + ' %');
        });
    });

    it('auch ueber MEHRERE Archetypen bleibt der Share bei hoechstens 100 %', async () => {
        /* Der frueher hier stehende zweite Gurt `Math.min(100, ...)` ist
         * entfallen: die Schranke folgt jetzt aus dem Bau, weil jeder
         * Zaehler gegen die Groesse SEINES Archetyps in DERSELBEN Erhebung
         * geklemmt wird. Diese Zusicherung haelt das fest — sie faellt,
         * sobald jemand die Klemmung je Schluessel entfernt. */
        const w = await laden({
            'tournament_cards_data_cards.csv': [
                // In jedem der drei Archetypen zaehlen zwei Drucke doppelt.
                zeile('TEF-PBL', 'Slowking', 'Nest Ball', 'PAL', 9, 10),
                zeile('TEF-PBL', 'Slowking', 'Nest Ball', 'BRS', 8, 10),
                zeile('TEF-PBL', 'Crustle', 'Nest Ball', 'PAL', 5, 6),
                zeile('TEF-PBL', 'Crustle', 'Nest Ball', 'BRS', 6, 6),
                zeile('TEF-PBL', 'Hydrapple', 'Nest Ball', 'PAL', 2, 2),
                zeile('TEF-PBL', 'Hydrapple', 'Nest Ball', 'BRS', 2, 2),
            ]
        });
        const r = w.calculateDynamicCoverage('Nest Ball');
        assert.equal(r.totalDecks, 18, '10 + 6 + 2 Decks');
        assert.equal(r.deckCount, 18, 'jeder Archetyp einzeln gedeckelt: 10 + 6 + 2');
        assert.equal(r.percentage, 100);
        assert.equal(r.gedeckelt, true);
    });

    it('der angezeigte Bruch steht so in einer Quelle', async () => {
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        const erlaubt = [[11, 22], [5, 20], [46, 46], [0, 22], [0, 20], [0, 46]];
        assert.ok(erlaubt.some(([z, n]) => z === r.deckCount && n === r.totalDecks),
            'gezeigt: ' + r.deckCount + '/' + r.totalDecks + ' — dieser Bruch steht in '
            + 'keiner Erhebung. Genau so entstand live "90,0 %" aus 25,0 / 45,0 / 46,7 %.');
    });
});

/* ══ Die Nennung statt der Marke ═══════════════════════════════════ */

describe('Abdeckung — abweichende Erhebungen werden beim Namen genannt', () => {
    it('jede abweichende Erhebung steht mit Bruch und Share im Ergebnis', async () => {
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        const namen = r.weitereErhebungen.map(x => x.name).sort();
        assert.deepEqual(namen, ['Current Meta / Meta Live', 'Tournament / TEF-PBL'],
            'Die beiden anderen Erhebungen sagen 11/22 und 5/20 — wer das '
            + 'verschweigt, laesst 100 % wie eine unstrittige Zahl aussehen.');
        const turnier = r.weitereErhebungen.find(x => x.name === 'Tournament / TEF-PBL');
        assert.equal(turnier.deckCount, 11);
        assert.equal(turnier.totalDecks, 22);
        assert.ok(Math.abs(turnier.percentage - 50) < 1e-9, 'Share: ' + turnier.percentage);
    });

    it('Erhebungen, die dasselbe sagen, werden nicht aufgezaehlt', async () => {
        const w = await laden({
            'tournament_cards_data_cards.csv': [
                zeile('TEF-PBL', 'Dragapult', 'Dreepy', 'POR', 5, 10),
            ],
            'current_meta_card_data.csv': [
                zeile('Meta Live', 'Dragapult', 'Dreepy', 'TWM', 10, 20),
            ]
        }, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.equal(r.percentage, 50);
        assert.deepEqual(r.weitereErhebungen, [],
            'beide Erhebungen sagen 50,0 % — drei Zeilen mit derselben Zahl machen '
            + 'die echte Abweichung unsichtbar');
    });

    it('eine einzige Erhebung nennt niemanden und traegt keine Marke', async () => {
        const w = await laden({
            'current_meta_card_data.csv': [
                zeile('Meta Live', 'Dragapult', 'Dreepy', 'TWM', 18, 20),
            ]
        }, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Dreepy');
        assert.equal(r.erhebung, 'Current Meta / Meta Live');
        assert.equal(r.deckCount, 18);
        assert.equal(r.totalDecks, 20);
        assert.deepEqual(r.weitereErhebungen, []);
        assert.equal(r.gedeckelt, false);
    });
});

/* ══ Die Marke bedeutet jetzt genau eine Sache ══════════════════════ */

describe('Abdeckung — die ≤-Marke steht nur fuer eine echte Obergrenze', () => {
    it('mehrere Prints IN EINER Erhebung ueber der Archetypgroesse: Marke', async () => {
        /* Live gemessen: 9 von 5.351 Erhebung-Karte-Archetyp-Faellen, alle
         * in "Tournament / TEF-PBL" (z. B. Slowking / slowpoke 12 bei 11
         * Decks). Ein Deck spielt zwei Drucke und zaehlt zweimal. */
        const w = await laden({
            'tournament_cards_data_cards.csv': [
                zeile('TEF-PBL', 'Slowking', 'Slowpoke', 'PAL', 7, 11),
                zeile('TEF-PBL', 'Slowking', 'Slowpoke', 'BRS', 5, 11),
            ]
        }, { archetypen: ['Slowking'] });
        const r = w.calculateDynamicCoverage('Slowpoke');
        assert.equal(r.deckCount, 11, '12 Decks bei 11 Decks im Archetyp gibt es nicht');
        assert.equal(r.totalDecks, 11);
        assert.equal(r.gedeckelt, true,
            'ohne die Marke steht dort ein glattes 100 %, obwohl der wahre Wert '
            + 'zwischen 7 und 11 liegt');
    });

    it('bloss verschiedene Erhebungen bekommen KEINE Marke', async () => {
        /* Genau der Befund vom 07.09.2026: die Marke hing an der Klemmung
         * und behauptete "Obergrenze" — fuer 12 zu niedrige Werte war das
         * nachweislich das Gegenteil. Jetzt haengt sie an der einen Sache,
         * fuer die sie stimmt. */
        const w = await laden(DREI_ERHEBUNGEN, { archetypen: ['Dragapult'] });
        assert.equal(w.calculateDynamicCoverage('Dreepy').gedeckelt, false);
        assert.equal(w.calculateDynamicCoverage('Meowth ex').gedeckelt, false);
    });

    it('mehrere Prints unterhalb der Archetypgroesse zaehlen weiter zusammen', async () => {
        const w = await laden({
            'current_meta_card_data.csv': [
                zeile('Meta Live', 'Dragapult', 'Boss’s Orders', 'PAL', 6, 20),
                zeile('Meta Live', 'Dragapult', 'Boss’s Orders', 'BRS', 5, 20),
            ]
        }, { archetypen: ['Dragapult'] });
        const r = w.calculateDynamicCoverage('Boss’s Orders');
        assert.equal(r.deckCount, 11, 'die beiden Prints muessen zusammengezaehlt werden');
        assert.equal(r.totalDecks, 20);
        assert.equal(r.gedeckelt, false);
    });
});

/* ══ Was an der Plakette steht ═════════════════════════════════════ */

/** Den Plakettenblock aus createCardDatabaseItem ausfuehren. */
function plakette(coverageStats, sprache) {
    const rumpf = stueck("            let coverageDisplay = '';",
                         '            const limitlessButton =');
    const sb = {
        Math, Number, String, Array, Object, Boolean, JSON,
        card: { name: 'Dreepy' },
        calculateDynamicCoverage: () => coverageStats,
        getLang: () => (sprache || 'de'),
        escapeHtml: (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        _zahlNachSprache: (wert, stellen) => {
            const txt = Number(wert || 0).toFixed(stellen);
            return (sprache === 'en') ? txt : txt.replace('.', ',');
        },
    };
    const namen = Object.keys(sb);
    // eslint-disable-next-line no-new-func
    const bau = new Function(...namen, rumpf + '\nreturn coverageDisplay;');
    return bau(...namen.map(k => sb[k]));
}

const PLAKETTE_STATS = {
    percentage: 45,
    deckCount: 9,
    archetypeCount: 1,
    totalDecks: 20,
    maxCount: 4,
    erhebung: 'Current Meta / Meta Live',
    weitereErhebungen: [
        { name: 'Tournament / TEF-PBL', deckCount: 2, totalDecks: 8, percentage: 25 },
        { name: 'Current Meta / Meta Play!', deckCount: 7, totalDecks: 15, percentage: 46.666666 }
    ],
    gedeckelt: false
};

describe('Abdeckung — der Wortlaut der Plakette', () => {
    it('der Bruch und die Erhebung stehen SICHTBAR auf der Plakette', () => {
        const html = plakette(PLAKETTE_STATS, 'de');
        /* Gelesen wird der SICHTBARE Text, nicht das title-Attribut: der
         * Satz im title erreicht nur, wer mit der Maus darauf zeigt, und
         * eine Probe gegen das ganze HTML wuerde ihn faelschlich als
         * Beleg nehmen. */
        const sichtbar = html.replace(/<[^>]*>/g, ' ');
        assert.match(sichtbar, /9\/20/,
            'eine Prozentzahl ohne Nenner laesst "1 von 1 Deck" wie 100 % '
            + 'Verbreitung aussehen. Sichtbar: ' + JSON.stringify(sichtbar));
        assert.match(sichtbar, /Current Meta \/ Meta Live/,
            'die Plakette sagt sichtbar nicht, aus welcher Erhebung ihre Zahl stammt. '
            + 'Sichtbar: ' + JSON.stringify(sichtbar));
        assert.match(sichtbar, /45,0% Coverage/, 'Share fehlt oder traegt einen Punkt: ' + sichtbar);
    });

    it('der Titel nennt Erhebung und Nenner im Satz, auf Deutsch', () => {
        const html = plakette(PLAKETTE_STATS, 'de');
        assert.match(html, /Erhebung: Current Meta \/ Meta Live — 9 von 20 Decks/, html);
    });

    it('und auf Englisch denselben Satz auf Englisch', () => {
        const html = plakette(PLAKETTE_STATS, 'en');
        assert.match(html, /Survey: Current Meta \/ Meta Live — 9 of 20 decks/, html);
        assert.ok(!/Erhebung:/.test(html), 'deutscher Satz im englischen Modus: ' + html);
        assert.match(html, /45\.0% Coverage/, 'englischer Modus mit Komma: ' + html);
    });

    it('die abweichenden Erhebungen werden mit Bruch und Share genannt', () => {
        const de = plakette(PLAKETTE_STATS, 'de');
        assert.match(de, /Weitere Erhebungen:/, de);
        assert.match(de, /Tournament \/ TEF-PBL 2\/8 \(25,0 %\)/,
            'ohne diese Nennung sieht 45,0 % unstrittig aus, obwohl eine andere '
            + 'Erhebung 25,0 % sagt: ' + de);
        assert.match(de, /Current Meta \/ Meta Play! 7\/15 \(46,7 %\)/, de);
        const en = plakette(PLAKETTE_STATS, 'en');
        assert.match(en, /Other surveys:/, en);
        assert.ok(!/Weitere Erhebungen/.test(en), en);
    });

    it('die ≤-Marke steht genau dann, wenn gedeckelt wurde', () => {
        const ohne = plakette(PLAKETTE_STATS, 'de');
        assert.ok(!/≤/.test(ohne),
            'eine Marke ohne Anlass behauptet eine Obergrenze, die es nicht gibt: ' + ohne);
        const mit = plakette(Object.assign({}, PLAKETTE_STATS, {
            gedeckelt: true, percentage: 100, deckCount: 11, totalDecks: 11
        }), 'de');
        assert.match(mit, /≤/, 'die Marke fehlt, obwohl gedeckelt wurde: ' + mit);
        assert.match(mit, /≤ 100,0% Coverage/,
            'die Marke steht nicht vor der Zahl, auf die sie sich bezieht: ' + mit);
        assert.match(mit, /Mehrere Prints dieser Karte wurden zusammengezählt/, mit);
        assert.match(mit, /Obergrenze/, mit);
    });

    it('der Satz zur Obergrenze nennt den Grund, nicht nur das Wort', () => {
        const mit = plakette(Object.assign({}, PLAKETTE_STATS, { gedeckelt: true }), 'de');
        assert.match(mit, /mindestens ein Deck spielt zwei Prints/,
            '"Obergrenze" allein sagt nicht, warum: ' + mit);
        const en = plakette(Object.assign({}, PLAKETTE_STATS, { gedeckelt: true }), 'en');
        assert.match(en, /at least one deck plays two prints/, en);
    });
});

/* ══ Das Haupt-Pokémon: die Kartentyp-Endung ═══════════════════════ */

describe('Haupt-Pokémon — die Kartentyp-Endung gehoert nicht in die Liste', () => {
    it('aus "Dragapult ex" wird "Dragapult", nicht "Dragapult ex"', async () => {
        /* Der Wortanfang "Dragapult ex" wird vom Kartennamen "dragapult ex"
         * belegt und deshalb gewaehlt — genau dann muss die Endung fallen.
         * Ohne den Schnitt stuenden "Dragapult" und "Dragapult ex" als zwei
         * Eintraege nebeneinander und der Filter waere doppelt besetzt. */
        const w = await laden({
            'current_meta_card_data.csv': [
                zeile('Meta Live', 'Dragapult ex', 'Dragapult ex', 'TWM', 10, 20),
                zeile('Meta Live', 'Dragapult', 'Dreepy', 'TWM', 10, 20),
            ]
        });
        const liste = Array.from(w.allMainPokemons).sort();
        assert.deepEqual(liste, ['Dragapult'],
            '"ex" ist der Kartentyp, kein Pokémon-Name. Liste: ' + JSON.stringify(liste));
    });

    it('auch die Endungen vstar/vmax/gx fallen', async () => {
        const w = await laden({
            'current_meta_card_data.csv': [
                zeile('Meta Live', 'Arceus VSTAR', 'Arceus VSTAR', 'BRS', 5, 10),
                zeile('Meta Live', 'Charizard VMAX', 'Charizard VMAX', 'BRS', 5, 10),
                zeile('Meta Live', 'Mewtwo GX', 'Mewtwo GX', 'BRS', 5, 10),
            ]
        });
        const liste = Array.from(w.allMainPokemons).sort();
        assert.deepEqual(liste, ['Arceus', 'Charizard', 'Mewtwo'],
            'Liste: ' + JSON.stringify(liste));
    });

    it('ein Name, der zufaellig auf "ex" endet, bleibt ganz', async () => {
        // "Annihilape" endet nicht auf ein eigenstaendiges Wort "ex";
        // geschnitten wird nur eine abgetrennte Endung.
        const w = await laden({
            'current_meta_card_data.csv': [
                zeile('Meta Live', 'Annihilape', 'Annihilape', 'PAR', 5, 10),
            ]
        });
        assert.ok(Array.from(w.allMainPokemons).includes('Annihilape'),
            JSON.stringify(Array.from(w.allMainPokemons)));
    });
});
