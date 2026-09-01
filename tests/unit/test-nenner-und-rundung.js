/**
 * Nenner, Rundung und Glaettung — die Gruppen 5, 6 und 7 der Pruefrunde
 * vom 20.08.2026.
 *
 * Der gemeinsame Nenner (das Wortspiel ist unvermeidlich) dieser drei
 * Gruppen: die Rechnungen der Seite stimmen, ihre Etiketten nicht. Eine
 * Prozentzahl wird gegen den Bildausschnitt gebildet und "Anteil am Feld"
 * genannt; ein halber gewichteter Antritt wird als ganzer gedruckt und die
 * Zeile widerspricht sich selbst; ein geglaetteter Wert steht neben einem
 * rohen, ohne dass es dransteht.
 *
 * Diese Datei prueft die Stellen, an denen das behoben wurde — und zwar
 * moeglichst durch AUSFUEHREN. Der Vorlaeufer dieser Pruefungen war eine
 * Regex auf totem Code: gruen, und trotzdem falsch.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const FEATURES = lies('js/app-features.js');
const TIER     = lies('js/app-tier-meta.js');
const PAST     = lies('js/app-past-meta.js');
const EV       = lies('js/ds-ev-rechner.js');
const HUB      = lies('js/meta-analysis-hub.js');
// Die Texte in app-quellen.js sind ueber mehrere Quellzeilen
// zusammengesetzt ('… deck ' + 'with a recognised archetype'). Geprueft
// wird der Satz, den der Leser sieht, nicht wo der Umbruch steht — also
// werden die Nahtstellen vorher zusammengezogen.
const QUELLEN  = lies('js/app-quellen.js').replace(/'\s*\+\s*\n\s*'/g, '');
const CURRENT  = lies('js/app-current-meta-analysis.js');

function stueck(quelle, re, was) {
    const m = quelle.match(re);
    if (!m) throw new Error('konnte ' + was + ' nicht herausschneiden');
    return m[0];
}

// ---------------------------------------------------------------------------
// Gruppe 5 — der Nenner ist der, den die Ueberschrift nennt
// ---------------------------------------------------------------------------

describe('Donut: der Anteil steht auf dem ganzen Feld', () => {
    // Gemessen am 20.08.2026: der Tooltip teilte durch die Summe der
    // gezeigten zwoelf Segmente. Mega Excadrill las sich als 12,4 %,
    // die Tabelle daneben zeigte 7,75 % — Faktor 1,54. In der City
    // League war es Faktor 1,98 (Dragapult Meowth 25,4 statt 12,81 %).
    it('teilt nicht mehr durch die Summe der zwoelf Segmente', () => {
        assert.doesNotMatch(FEATURES, /const total = counts\.reduce/,
            'der alte Nenner ist zurueck');
        assert.match(FEATURES, /const gesamtRoh = alle\.reduce/);
        assert.match(FEATURES, /ctx\.parsed \/ gesamt/);
    });

    it('weist den Rest als eigenes Segment aus, damit der Kreis aufgeht', () => {
        assert.match(FEATURES, /const rest = gesamt - counts\.reduce/);
        assert.match(FEATURES, /donutLabels = rest > 0/);
        assert.match(FEATURES, /chart\.otherShare/);
    });

    it('nennt den Nenner im Tooltip, statt ihn dem Leser zu ueberlassen', () => {
        const cb = stueck(FEATURES, /tooltip: \{ callbacks: \{ label: \(ctx\) => \{[\s\S]*?\}\}\}/, 'Tooltip');
        assert.match(cb, /gesamt\.toLocaleString/);
    });

    it('das globale Meta reicht die echte Feldgroesse durch', () => {
        // Der Scraper wirft die "Other"-Zeile weg; die gelisteten Anteile
        // summieren sich deshalb auf 96,19 %. Ohne den echten Nenner zeigte
        // der Donut 8,1 %, die Tabelle 7,75 %.
        assert.match(CURRENT, /renderMetaChart\('currentMeta', chartData, feldGesamt\)/);
        assert.match(CURRENT, /window\.feldGroesseAusAnteilen/);
    });

    it('feldGroesseAusAnteilen trifft den echten Nenner der Livedaten', () => {
        const UTILS = lies('js/app-utils.js');
        const quelle = stueck(UTILS,
            /function feldGroesseAusAnteilen\(zeilen\) \{[\s\S]*?\n\}/, 'feldGroesse');
        // eslint-disable-next-line no-new-func
        const fn = new Function(quelle + '\nreturn feldGroesseAusAnteilen;')();

        const csv = fs.readFileSync(path.join(ROOT, 'data', 'limitless_online_decks.csv'), 'utf8')
            .replace(/^\uFEFF/, '').trim().split('\n');
        const kopf = csv[0].split(';');
        const zeilen = csv.slice(1).map(l => {
            const f = l.split(';');
            const o = {};
            kopf.forEach((k, i) => { o[k] = f[i]; });
            return { anteil: parseFloat(String(o.share_numeric).replace(',', '.')),
                     anzahl: parseInt(o.count, 10) };
        }).filter(z => z.anzahl > 0);

        const gelistet = zeilen.reduce((a, z) => a + z.anzahl, 0);
        const n = fn(zeilen);

        // Frueher stand hier die feste Eingrenzung N ∈ [27356; 27359] und
        // gelistet === 26319 aus der Pruefung vom 20.08.2026. Der Wochenlauf
        // vom 21.08.2026 machte daraus N = 29.437 und gelistet = 28.324 — der
        // Test wurde rot, obwohl die Rechnung stimmte. Da der Deploy an gruenen
        // Tests haengt, blockierte das den Lauf, der die frischen Daten
        // ausliefern sollte.
        //
        // Der bessere Beleg ist ohnehin kein fester Wert, sondern ein Quercheck
        // gegen eine UNABHAENGIGE Quelle: limitless_meta_stats.json zaehlt die
        // Spieler direkt, statt sie aus gerundeten Anteilen zu rekonstruieren.
        // Gemessen 21.08.2026: rekonstruiert 29.437, gemeldet 29.436 — eine
        // Person Unterschied auf 29.000, also rund 0,003 %.
        const stats = JSON.parse(fs.readFileSync(
            path.join(ROOT, 'data', 'limitless_meta_stats.json'), 'utf8'));
        assert.ok(Math.abs(n - stats.players) <= 5,
            `rekonstruiert ${n}, limitless_meta_stats.json meldet ${stats.players}`);

        // Der Nenner muss groesser sein als die gelisteten Decks — die Differenz
        // ist die weggeworfene "Other"-Zeile. Gemessen 21.08.2026: 1.113 von
        // 29.437, also 3,8 %.
        assert.ok(n > gelistet, `Feldgroesse ${n} <= gelistet ${gelistet}`);
        const other = n - gelistet;
        assert.ok(other > 0 && other < n * 0.15, 'Other: ' + Math.round(other));

        // Und die Probe, um derentwillen das Ganze existiert — datengetrieben
        // statt auf ein bestimmtes Deck verdrahtet: fuer das groesste Deck muss
        // count/N genau den Anteil ergeben, den die Tabelle nennt.
        const groesstes = zeilen.reduce((a, z) => (z.anzahl > a.anzahl ? z : a));
        assert.ok(Math.abs(groesstes.anzahl / n * 100 - groesstes.anteil) < 0.01,
            `der Donut muss dieselben ${groesstes.anteil} % zeigen wie die Tabelle, `
            + `rechnet aber ${(groesstes.anzahl / n * 100).toFixed(2)} %`);
    });

    it('ohne brauchbare Eingrenzung wird nichts behauptet', () => {
        const UTILS = lies('js/app-utils.js');
        const quelle = stueck(UTILS,
            /function feldGroesseAusAnteilen\(zeilen\) \{[\s\S]*?\n\}/, 'feldGroesse');
        // eslint-disable-next-line no-new-func
        const fn = new Function(quelle + '\nreturn feldGroesseAusAnteilen;')();
        assert.equal(fn([]), 0);
        assert.equal(fn(null), 0);
        // Anteile, die schon auf 100 gehen: es fehlt nichts.
        assert.equal(fn([{ anteil: 50, anzahl: 50 }, { anteil: 50, anzahl: 50 }]), 0);
        // Widerspruechliche Zeilen: kein Schnitt, keine Zahl.
        assert.equal(fn([{ anteil: 90, anzahl: 90 }, { anteil: 5, anzahl: 500 }]), 0);
    });

    it('die City League braucht keine: dort IST die Summe das Feld', () => {
        assert.match(lies('js/app-city-league.js'), /renderMetaChart\('cityLeague', sorted\)/);
    });
});

describe('Der "Other"-Eimer wird ausgewiesen', () => {
    /* Die gelisteten Anteile summieren sich auf 96,19 %, nicht auf 100.
       Limitless fuehrt alles unterhalb seiner Namensschwelle als "Other"
       und meldet es nicht einzeln. Keine angezeigte Zahl ist dadurch
       falsch — nur passte der Nenner der Prozentzahl zu keiner
       sichtbaren Groesse, solange er nirgends stand.

       Er stand ab dem 20.08.2026 in der Kachel "Gemeldete Listen" und
       steht seit dem 01.09.2026 unter Quellen & Methodik (die Kachel
       ist entfernt, siehe docs/geparkte-features.md). Gerechnet wird er
       unveraendert in app-tier-meta.js; formuliert wird der Satz in
       js/ds-datenumfang.js. Beide Haelften werden hier geprueft —
       einzeln waere jede von ihnen wertlos. */
    const UMFANG = lies('js/ds-datenumfang.js');

    it('der Nenner wird weiter gerechnet und weitergereicht', () => {
        assert.match(TIER, /window\.feldGroesseAusAnteilen/);
        assert.match(TIER, /feldGesamt: feldGesamt \|\| 0/);
        assert.match(TIER, /restAnteil: \(typeof restAnteil|restAnteil: restAnteil \|\| 0/);
    });

    it('nur wenn wirklich etwas fehlt', () => {
        assert.match(TIER, /const restAnteil = feldGesamt > totalEntries/);
        // Ohne Rest keine Zeile: "0 Listen fuehrt Limitless als Other"
        // waere eine Aussage ueber nichts.
        assert.match(UMFANG, /if \(u\.feldGesamt && u\.restAnteil\)/);
        assert.match(UMFANG, /d\.restAnteil > 0\) \? d\.restAnteil : null/);
    });

    it('und der Satz sagt es in beiden Sprachen, mit Umlauten', () => {
        // NACHTRAG (Abnahmerunde 30.08.2026): hier stand die Zeichenkette
        // mit ASCII-Ersatzschreibung ("uebrigen", "fuehrt"). Der Satz wird
        // dem Nutzer ANGEZEIGT — in einem deutschen Satz stehen Umlaute.
        assert.match(UMFANG, /„Other“ und meldet sie nicht einzeln/);
        assert.match(UMFANG, /filed as "Other" by Limitless/);
        assert.ok(!/uebrigen/.test(UMFANG), 'die ASCII-Ersatzschreibung ist zurueck');
    });
});

describe('EV-Rechner: die Spalte heisst, was sie zeigt', () => {
    it('nicht mehr "Anteil am Feld"', () => {
        assert.doesNotMatch(EV, /'Anteil am Feld'/);
        assert.match(EV, /'Gewicht hier', 'Weight here'/);
    });
    it('der Tooltip nennt die Normierung', () => {
        assert.match(EV, /auf 100 % normiert/);
    });
    it('die Abdeckungs-Kachel nennt den wirklich gerechneten Ausschnitt', () => {
        assert.match(EV, /gerechnet: feldSumme > 0/);
        assert.match(EV, /in dieser Rechnung nur/);
    });
    it('"Top 8" heisst jetzt, was es ist: die groessten Gegner MIT DATEN', () => {
        assert.doesNotMatch(EV, /'Nur Top 8 Archetypes'/);
        assert.match(EV, /'Die größten Gegner mit Daten'/);
        assert.match(EV, /r\.gegner < 8/);
    });
});

describe('EV-Rechner: die Bedienung ueberlebt ein innerHTML darunter', () => {
    // Gemessen am 20.08.2026 im Browser: Deckwahl, Feldbild und Rundenzahl
    // waren tot. Der Block hing seine Handler an sich selbst, und
    // js/app-meta-cards.js setzt currentMetaContent.innerHTML neu — das
    // Markup ueberlebt, die Handler nicht. Seit 05:49 desselben Tages live.
    it('haengt nicht mehr am Block selbst', () => {
        assert.doesNotMatch(EV, /block\.addEventListener/);
    });
    it('sondern delegiert am Dokument', () => {
        assert.match(EV, /document\.addEventListener\('change', reagiere\)/);
        assert.match(EV, /document\.addEventListener\('input', reagiere\)/);
        assert.match(EV, /ziel\.closest\('\.' \+ BLOCK\)/);
    });
    it('und nur einmal', () => {
        assert.match(EV, /if \(_delegiert\) return;/);
    });
});

describe('Meta-Performance: die Spalte "Anteil" nennt beide Herkuenfte', () => {
    it('der Glossartext beschreibt nicht mehr nur den Nenner von 7 der 138 Zeilen', () => {
        assert.doesNotMatch(TIER, /gemessen an allen gewichteten Antritten des Zeitraums/);
        assert.match(TIER, /Anteil an den gemeldeten Listen der Online-Ladder/);
    });
    it('die Turnier-Anteile sind in der Zelle markiert', () => {
        assert.match(TIER, /anteilAusTurnier: !l && !!t/);
        assert.match(TIER, /r\.anteilAusTurnier/);
    });
});

describe('Der Meta-Durchschnitt sagt, worauf er steht', () => {
    it('nennt die Bedingung "mit erkanntem Archetyp"', () => {
        // Der Vergleichswert ("…-mal so oft wie der Schnitt") steht NICHT
        // ueber allen Decks, sondern nur ueber denen mit erkanntem
        // Archetyp. Ohne diese Bedingung ist die Zahl eine andere Zahl.
        //
        // Bis zum 30.08.2026 stand die Bedingung in der Fussnote unter
        // der Kachel — zusammen mit fuenf weiteren Erklaerungszeilen,
        // direkt unter der ersten Zahl der Startseite. Der Text ist nach
        // Quellen & Methodik umgezogen. Die Zusage folgt ihm: sie darf
        // nicht dadurch erfuellt sein, dass die Bedingung nirgends mehr
        // steht.
        assert.match(QUELLEN, /mit erkanntem Archetyp/,
            'die Bedingung fehlt auf der Methodikseite — dann steht sie nirgends');
        assert.match(QUELLEN, /with a recognised archetype/,
            'die englische Fassung fehlt');
    });

    it('und die Kachel fuehrt dorthin', () => {
        // Eine Erklaerung, die niemand findet, ist keine. Der Weg von
        // der Zahl zur Bedingung muss ein Klick sein.
        assert.match(HUB, /href="#quellen"/,
            'die Kachel verweist nicht mehr auf die Methodikseite — ' +
            'dann ist die Bedingung von der Zahl aus unerreichbar');
        // Der Nenner selbst bleibt an der Zahl: er ist die Bezugsgroesse,
        // keine Methodik.
        assert.match(HUB, /gewichteten Antritten/);
        assert.match(HUB, /weighted entries/);
    });
    it('der Kommentar behauptet nicht mehr, roh und geglaettet fielen zusammen', () => {
        assert.doesNotMatch(HUB, /roher und geglaetteter Wert hier zusammen/);
        assert.match(HUB, /GENAU EIN Deck/);
    });
});

// ---------------------------------------------------------------------------
// Gruppe 6 — Rundung und Boeden erfinden keine Zaehlungen mehr
// ---------------------------------------------------------------------------

describe('Karten im Deck: 60, nicht 124', () => {
    // Gemessen an data/tournament_cards_data_cards_TEF-CRI.csv, Dragapult:
    // 89 verschiedene Karten, 323 Listen. 65 der 89 haben einen echten
    // Mittelwert unter 0,5 Kopien; mit dem Anzeigeboden max(1, …) summierte
    // die Kachel auf 124 Karten fuer ein 60-Karten-Deck.
    const laden = () => {
        const quelle =
            stueck(PAST, /function getPastMetaRepresentativeCardCopies\(card\) \{[\s\S]*?\n        \}/, 'repraesentativ')
            + '\n'
            + stueck(PAST, /function getPastMetaDisplayCount\(card\) \{[\s\S]*?\n        \}/, 'anzeige')
            + '\n'
            + stueck(PAST, /function getPastMetaSummaryTotalCount\(cards\) \{[\s\S]*?\n        \}/, 'summe');
        // eslint-disable-next-line no-new-func
        return new Function('parsePastMetaNumber', 'pastMetaCurrentScope',
            quelle + '\nreturn { getPastMetaSummaryTotalCount, getPastMetaDisplayCount };')(
            (v, f) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : f; },
            { totalDecklists: 323 });
    };

    it('die Summe nimmt die ungerundeten Mittelwerte', () => {
        const { getPastMetaSummaryTotalCount } = laden();
        const karten = [
            { card_count: 4, max_count: 4 }, { card_count: 4, max_count: 4 },
            { card_count: 3.2, max_count: 4 }, { card_count: 2.9, max_count: 3 },
            { card_count: 0.4, max_count: 1 }, { card_count: 0.2, max_count: 1 },
            { card_count: 0.05, max_count: 1 }, { card_count: 0.01, max_count: 1 },
        ];
        const summe = getPastMetaSummaryTotalCount(karten);
        assert.ok(Math.abs(summe - 14.76) < 1e-9, 'Summe: ' + summe);
    });

    it('Karten ohne Mittelwert zaehlen als 0, nicht als 1', () => {
        // 16 der 89 Karten des Chunks TEF-CRI haben einen Mittelwert von
        // exakt 0 (total_count fehlt). Der Anzeigeboden gibt fuer sie "1"
        // zurueck — in der Summe waeren das 16 erfundene Karten, und die
        // Kachel meldete 76 statt 60.
        const { getPastMetaSummaryTotalCount, getPastMetaDisplayCount } = laden();
        const karten = [{ card_count: 4, max_count: 4, deck_count: 300 },
                        { card_count: 0, max_count: 1, deck_count: 300 }];
        assert.equal(getPastMetaSummaryTotalCount(karten), 4);
        // Auf dem Kaertchen bleibt der Boden trotzdem stehen.
        assert.equal(getPastMetaDisplayCount(karten[1]), 1);
    });

    it('die einzelne Karte behaelt ihren Boden von 1', () => {
        const { getPastMetaDisplayCount } = laden();
        assert.equal(getPastMetaDisplayCount({ card_count: 0.01, max_count: 1 }), 1);
        assert.equal(getPastMetaDisplayCount({ card_count: 3.6, max_count: 4 }), 4);
    });

    it('die Kachel heisst nicht mehr "Total"', () => {
        assert.match(lies('index.html'), /data-i18n="pm\.cardsInDeck"/);
        assert.match(lies('js/i18n.js'), /'pm\.cardsInDeck':\s+'Karten im Deck \(verschiedene \/ Ø-Liste\)'/);
    });
});

describe('Halbe gewichtete Antritte werden als halbe gedruckt', () => {
    it('fmtHalb existiert und wird fuer Antritte UND Cuts benutzt', () => {
        assert.match(TIER, /const fmtHalb = \(n\) => \{/);
        assert.match(TIER, /k === 'antritte'\) return r\.antritte == null \? '–' : fmtHalb/);
        assert.match(TIER, /k === 'cuts'\)\s+return r\.cuts\s+== null \? '–' : fmtHalb/);
    });
    it('der Spaltenkopf erklaert, warum es halbe Antritte gibt', () => {
        // Stand bis zum 01.09.2026 im Blocktext ueber der Tabelle — in
        // einem Absatz von 918 Zeichen. Jetzt am Spaltenkopf, an dem die
        // halben Zahlen stehen.
        assert.match(TIER, /nach Turniergröße gewichtet — halbe Werte sind deshalb echt/);
    });
});

// ---------------------------------------------------------------------------
// Gruppe 7 — geglaettet steht nicht mehr unbeschriftet neben roh
// ---------------------------------------------------------------------------

describe('Glaettung wird benannt', () => {
    it('der Spaltenkopf traegt den Glossartext, nicht den kurzen Tooltip', () => {
        assert.match(TIER, /k: 'faktor',[\s\S]{0,120}hilf: 'vsField'/);
        assert.match(TIER, /vsField: '1,6-mal heißt[\s\S]*?geglättet \(k = 50\)/);
    });
    it('der rohe Wert steht in der Zelle', () => {
        assert.match(TIER, /faktorRoh: rohVon\.has\(name\)/);
        assert.match(TIER, /roh \$\{einsNK\(r\.faktorRoh\)\}-mal/);
    });
    it('der Meta-Durchschnitt steht an der Spalte, die mit ihm vergleicht', () => {
        // Stand bis zum 01.09.2026 im Blocktext. Ohne ihn hat "0,8-mal"
        // keinen Bezugspunkt — er darf also umziehen, aber nicht gehen.
        assert.match(TIER, /zusatz: deR/);
        assert.match(TIER, /Der Meta-Durchschnitt liegt bei \$\{fmtPct\(conv\.expected \* 100, 1\)\} Top-8-Quote/);
        assert.match(TIER, /The field average is \$\{fmtPct\(conv\.expected \* 100, 1\)\} top-8 rate/);
        // Und er muss auch wirklich in die Marke wandern.
        assert.match(TIER, /voll = hilfstext \+ \(c\.zusatz \? ' ' \+ c\.zusatz : ''\)/);
    });
    it('die Tier-Banner zeigen die geglaettete Win Rate', () => {
        assert.match(TIER, /const zeigWR = \(sc && isFinite\(sc\.adjWR\)\) \? sc\.adjWR : winRate/);
        assert.match(TIER, /roh \$\{winRate\.toFixed\(1\)\} % aus \$\{listenN\} Listen/);
    });
});

describe('Vergangenes Meta: die Grundgesamtheit ist benannt', () => {
    it('"total decklists" heisst jetzt "Tag-2-Decklisten"', () => {
        assert.doesNotMatch(PAST, /\$\{totalDecklists\} total decklists\)`;/);
        assert.match(PAST, /Tag-2-Decklisten/);
        assert.match(PAST, /day-2 decklists/);
    });
    it('und die Verzerrung steht im Titel der Kachel', () => {
        assert.match(PAST, /Limitless veroeffentlicht Decklisten erst ab Tag 2/);
    });
});
