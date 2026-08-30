/**
 * Die drei Sprachbefunde der Abschluss-Abnahme vom 30.08.2026.
 *
 * A  Die Matchup-Heatmap folgte dem Sprachwechsel nur, solange sie
 *    sichtbar war. Wer die Startseite verliess, auf EN schaltete und
 *    zurueckkam, sah 130 veraltete Zeilen (7 Beschriftungen, 91x
 *    "Matches" statt "games", 90 Prozentzahlen mit Komma statt Punkt).
 * B  Der Rechner zog die drei Prozentzahlen beim Sprachwechsel nicht
 *    nach: "11,67 %" blieb unter englischen Beschriftungen stehen.
 * C  Die deutsche Anleitung beschriftete ihre Nachbau-Bildschirme
 *    englisch, obwohl die deutsche Oberflaeche dort deutsch schreibt.
 *
 * Alle drei haben dieselbe Form: die Sprachtabelle stimmt, der Weg auf
 * den Bildschirm fuehrt an ihr vorbei. Die Zusagen pruefen deshalb den
 * WEG (A, B als ausgefuehrter Code) und den ABGLEICH mit js/i18n.js (C).
 *
 * Zwei Fallen, die an diesem Tag schon zweimal zugeschnappt sind, und
 * wie sie hier vermieden werden:
 *   - Eine Zusage besteht an einem KOMMENTAR, der den Fehler beschreibt.
 *     Deshalb werden Kommentare vor jeder Suche weggeschnitten.
 *   - Ein Name steckt als Teilzeichenkette in einem anderen. Deshalb
 *     wird in der Anleitung auf GANZE Textknoten (">Text<") geprueft,
 *     nicht auf blosses Vorkommen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CURRENT = lies('js/app-current-meta.js');
const CALC = lies('js/app-calculator.js');
const I18N = lies('js/i18n.js');
const TUT_DE = lies('tutorial/tutorial.de.html');
const TUT_EN = lies('tutorial/tutorial.en.html');

/** JS-Kommentare weg, damit keine Zusage an einer Beschreibung besteht. */
const ohneJsKommentar = (q) => q
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

/** HTML-Kommentare weg — dieselbe Falle, andere Sprache. */
const ohneHtmlKommentar = (q) => q.replace(/<!--[\s\S]*?-->/g, '');

/* ── Sprachtabelle lesen ────────────────────────────────────────────
 * js/i18n.js ist die Quelle der Wahrheit fuer die Begriffe. Beide
 * Bloecke werden getrennt gelesen, damit "de" nicht mit "en" verwechselt
 * wird: der erste Treffer eines Schluessels ist englisch, der zweite
 * deutsch (jeder Schluessel steht genau zweimal). */
function sprachtabelle() {
    const en = {};
    const de = {};
    const re = /^\s*'([A-Za-z0-9_.]+)':\s*'((?:\\.|[^'\\])*)'/gm;
    let m;
    while ((m = re.exec(I18N)) !== null) {
        const key = m[1];
        const wert = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        if (!(key in en)) en[key] = wert;
        else if (!(key in de)) de[key] = wert;
    }
    return { en, de };
}
const TABELLE = sprachtabelle();

/* ══════════════════════════════════════════════════════════════════
   A — Heatmap: der Zuhoerer zieht auch eine VERBORGENE, aber bereits
       gezeichnete Ansicht nach; eine nie geoeffnete laesst er in Ruhe.
   ══════════════════════════════════════════════════════════════════ */
describe('A — die Heatmap folgt dem Sprachwechsel auch aus einem anderen Reiter', () => {

    /** Den Zuhoerer aus der Quelle schneiden und mit Attrappen ausfuehren. */
    function zuhoererAusfuehren({ behaelterDa, sichtbar }) {
        const code = ohneJsKommentar(CURRENT);
        const i = code.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1, 'der Zuhoerer ist verschwunden');
        const j = code.indexOf('});', i);
        assert.ok(j > i, 'der Zuhoerer ist nicht abgeschlossen');
        const quelle = code.slice(i, j + 3);

        let gerufen = 0;
        const zuhoerer = [];
        const dokument = {
            addEventListener: (typ, fn) => { if (typ === 'languageChanged') zuhoerer.push(fn); },
            getElementById: (id) => {
                if (id !== 'matchupHeatmapContainer') return null;
                if (!behaelterDa) return null;
                return { offsetParent: sichtbar ? {} : null };
            }
        };
        const fn = new Function('document', 'renderMatchupHeatmap',
            quelle + '\nreturn null;');
        fn(dokument, () => { gerufen++; });
        assert.equal(zuhoerer.length, 1, 'genau ein Zuhoerer erwartet');
        zuhoerer[0]({ detail: { lang: 'en' } });
        return gerufen;
    }

    it('verborgen, aber schon gezeichnet: wird nachgezogen', () => {
        // Genau der gemessene Fall: auf einem anderen Reiter umschalten.
        // Vorher stand hier 0 — daher die 130 veralteten Zeilen.
        assert.equal(zuhoererAusfuehren({ behaelterDa: true, sichtbar: false }), 1,
            'eine verborgene, bereits gezeichnete Heatmap wird beim Sprachwechsel nicht nachgezogen');
    });

    it('sichtbar: wird weiterhin neu gezeichnet', () => {
        assert.equal(zuhoererAusfuehren({ behaelterDa: true, sichtbar: true }), 1,
            'die sichtbare Heatmap wird nicht mehr neu gezeichnet');
    });

    it('nie geoeffnet: bleibt unangetastet', () => {
        // Ein Sprachwechsel darf keinen nie geoeffneten Reiter befuellen
        // und keine Daten anfordern.
        assert.equal(zuhoererAusfuehren({ behaelterDa: false, sichtbar: false }), 0,
            'ein Sprachwechsel baut eine nie geoeffnete Ansicht auf');
    });

    it('die Sichtbarkeit ist keine Bedingung mehr', () => {
        const code = ohneJsKommentar(CURRENT);
        const i = code.indexOf("document.addEventListener('languageChanged'");
        const block = code.slice(i, i + 800);
        assert.ok(!/offsetParent/.test(block),
            'die Sichtbarkeitspruefung ist zurueck — sie war die Ursache des Befunds');
        assert.match(block, /matchupHeatmapContainer/);
        assert.match(block, /renderMatchupHeatmap\(\)/);
    });
});

/* ══════════════════════════════════════════════════════════════════
   B — Rechner: die drei Prozentzahlen wechseln das Trennzeichen mit.
   ══════════════════════════════════════════════════════════════════ */
describe('B — der Rechner zieht seine Prozentzahlen beim Sprachwechsel nach', () => {

    /** js/app-calculator.js in einer Attrappen-Oberflaeche laufen lassen. */
    function rechnerLaufenLassen() {
        const felder = {
            'calc-deck-size': { value: '60' },
            'calc-copies': { value: '1' },
            'calc-drawn': { value: '7' },
            'calc-in-hand': { value: '0' }
        };
        for (const el of Object.values(felder)) {
            el.classList = { add() {}, remove() {} };
            el.setAttribute = () => {};
            el.removeAttribute = () => {};
            el.addEventListener = () => {};
        }
        const ausgaben = {
            'res-draw': { textContent: '', className: '', classList: { add() {}, remove() {} } },
            'res-prize': { textContent: '', className: '', classList: { add() {}, remove() {} } },
            'res-topdeck': { textContent: '', className: '', classList: { add() {}, remove() {} } },
            'calc-remaining-deck': { textContent: '' }
        };
        const knoten = Object.assign({}, felder, ausgaben);
        const zuhoerer = [];
        let sprache = 'de';
        const dokument = {
            readyState: 'complete',
            getElementById: (id) => knoten[id] || null,
            querySelectorAll: () => [],
            addEventListener: (typ, fn) => { if (typ === 'languageChanged') zuhoerer.push(fn); }
        };
        const kontext = {
            document: dokument,
            window: {},
            console: { warn() {}, error() {} },
            getLang: () => sprache,
            // Der echte Helfer aus js/app-utils.js, woertlich.
            formatPercent: (value, digits = 1) => {
                if (value == null || value === '') return '';
                const n = Number(value);
                if (!Number.isFinite(n)) return '';
                const s = n.toFixed(digits);
                return sprache === 'de' ? s.replace('.', ',') + '\u00a0%' : s + '%';
            },
            setTimeout: () => 0,
            clearTimeout: () => {}
        };
        vm.createContext(kontext);
        vm.runInContext(CALC, kontext);
        return {
            lies: () => [ausgaben['res-draw'].textContent, ausgaben['res-prize'].textContent,
                ausgaben['res-topdeck'].textContent],
            wechsleAuf: (l) => {
                sprache = l;
                assert.ok(zuhoerer.length >= 1, 'der Rechner hoert nicht auf den Sprachwechsel');
                zuhoerer.forEach((fn) => fn({ detail: { lang: l } }));
            }
        };
    }

    it('deutsch geladen: Komma', () => {
        const r = rechnerLaufenLassen();
        assert.deepEqual(r.lies().map((s) => s.replace('\u00a0', ' ')),
            ['11,67 %', '11,32 %', '1,89 %']);
    });

    it('auf Englisch geschaltet: alle drei Zahlen wechseln auf Punkt', () => {
        const r = rechnerLaufenLassen();
        r.wechsleAuf('en');
        assert.deepEqual(r.lies(), ['11.67%', '11.32%', '1.89%'],
            'die Zahlen bleiben im Trennzeichen der abgewaehlten Sprache stehen');
    });

    it('und wieder zurueck auf Deutsch', () => {
        const r = rechnerLaufenLassen();
        r.wechsleAuf('en');
        r.wechsleAuf('de');
        assert.deepEqual(r.lies().map((s) => s.replace('\u00a0', ' ')),
            ['11,67 %', '11,32 %', '1,89 %']);
    });
});

/* ══════════════════════════════════════════════════════════════════
   C — Die Anleitung beschriftet ihre Nachbau-Bildschirme so, wie die
       Oberflaeche in derselben Sprache es tut.
   ══════════════════════════════════════════════════════════════════ */

/* Jede Zeile: [englischer Textknoten von vorher, deutscher Textknoten
 * von jetzt, Schluessel in js/i18n.js oder null].
 * Steht ein Schluessel dabei, MUSS der deutsche Text im Bild genau der
 * deutschen Tabellenzeile entsprechen — nachsehen statt uebersetzen.
 * Die vierte Spalte ist die erwartete ANZAHL. Ohne sie besteht die
 * Zusage schon, wenn die Beschriftung IRGENDWO einmal steht: eine
 * Probemutation, die eines von zwei "Max. Seltenheit" wieder englisch
 * machte, kam ungestraft durch, weil das zweite noch dastand.
 * Wo die Beschriftung im Bild aus mehreren Teilen besteht (Emoji, "Tier
 * 1 · "), steht null und geprueft wird nur der Wortlaut. */
const ANLEITUNG_DE = [
    ['Max Rarity', 'Max. Seltenheit', 'cl.rarityMax', 2],
    ['Test Draw', 'Testhand', 'cl.testDraw', 2],
    ['Save', 'Speichern', 'cl.btnSave', 2],
    ['Compare', 'Vergleichen', 'cl.btnCompare', 1],
    ['Share PNG', 'Teilen', 'cl.btnShare', 1],
    ['Quick Overview', 'Schnellüberblick', 'cm.viewModeVanilla', 1],
    ['Best Matchups', 'Beste Matchups', 'matchup.best', 1],
    ['Worst Matchups', 'Schlechteste Matchups', 'matchup.worst', 1],
    ['Heavy', 'Schwer', 'antiTech.heavyName', 1],
    ['+ Add missing', '+ Fehlende Tech hinzufügen', 'techLab.addMissingBtn', 1],
    ['Test Draw · Eröffnung 7', 'Testhand · Eröffnung 7', null, 1],
    ['Field cov. 78 %', 'Meta-Abdeckung 78 %', null, 1],
    ['Major Tournament Decks ▾', 'Major-Decks ▾', null, 1],
    ['🏆 Tournament Format', '🏆 Turnierformat-Filter', null, 1],
    ['📋 Wishlist', '📋 Wunschliste', null, 1],
    ['🃏 Most Used Cards · Format Staples', '🃏 Meistgespielte Karten (Format-Staples)', null, 1],
    ['🎯 Build vs Specific Decks', '🎯 Bauen gegen spezifische Decks', null, 1],
    ['Quick Picks · nach Impact gerankt', 'Schnellauswahl · nach Impact gerankt', null, 1],
    ['🚫 Non-EX-Attackers', '🚫 Nicht-EX Angreifer', null, 1],
    ['⚔️ Good against', '⚔️ Stark gegen', null, 1],
    ['Beaten by · Card-Text-Bypassers', 'Wird besiegt von · Karten, die den Kartentext umgehen', null, 1],
    ['📊 Deck-Stats', '📊 Deck-Statistiken', null, 1],
    ['Ability ≠ greift', 'Fähigkeit gilt nicht', null, 1],
    ['Tier 1 · Meta Dominators', 'Tier 1 · Beherrschen das Meta', null, 1],
    ['Tier 2 · Strong Contenders', 'Tier 2 · Starke Herausforderer', null, 1],
    ['Tier 3 · Niche Picks', 'Tier 3 · Spielbare Optionen', null, 1]
];

/** Nur die Nachbau-Bildschirme herausschneiden.
 *
 * Der Fliesstext darf einen englischen Knopfnamen tragen, WENN die
 * deutsche Oberflaeche ihn englisch zeigt — der "Save"-Knopf des
 * Wunschlisten-Fensters in index.html hat kein data-i18n. Wuerde hier
 * die ganze Datei durchsucht, waere diese Zusage nicht mehr wahr,
 * sondern nur noch streng. */
function mockupBloecke(html) {
    const bloecke = [];
    const re = /<div[^>]*class="tutorial-mockup"[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        let tiefe = 0;
        let i = m.index;
        const tag = /<div\b|<\/div>/g;
        tag.lastIndex = i;
        let t;
        while ((t = tag.exec(html)) !== null) {
            tiefe += t[0] === '</div>' ? -1 : 1;
            if (tiefe === 0) { bloecke.push(html.slice(i, t.index + 6)); break; }
        }
    }
    return bloecke;
}

describe('C — die deutsche Anleitung zeigt die deutschen Beschriftungen', () => {
    const bloecke = mockupBloecke(ohneHtmlKommentar(TUT_DE));
    const quelle = bloecke.join('\n');
    // ">Text<" statt blossem Vorkommen: ein GANZER Textknoten. Sonst
    // wuerde "Save" in "Save as image" und "Test Draw" in
    // "Test Draw · Eröffnung 7" mitzaehlen — genau die Falle, an der
    // heute schon eine Zusage vorbeigelaufen ist.
    const knoten = (t) => `>${t}<`;

    it('die Nachbau-Bildschirme sind ueberhaupt gefunden worden', () => {
        // Ohne diese Zusage wuerde ein kaputter Schnitt alle Pruefungen
        // unten still bestehen lassen: in einer leeren Zeichenkette
        // steht keine englische Beschriftung.
        assert.equal(bloecke.length, 41,
            `${bloecke.length} Nachbau-Bildschirme gefunden statt 41`);
    });

    const zaehle = (t) => quelle.split(knoten(t)).length - 1;

    for (const [englisch, deutsch, , anzahl] of ANLEITUNG_DE) {
        it(`"${englisch}" heisst ${anzahl}x "${deutsch}"`, () => {
            assert.equal(zaehle(englisch), 0,
                `die englische Beschriftung "${englisch}" steht wieder in einem Nachbau-Bildschirm`);
            assert.equal(zaehle(deutsch), anzahl,
                `"${deutsch}" steht ${zaehle(deutsch)}x statt ${anzahl}x in den Nachbau-Bildschirmen`);
        });
    }

    for (const [, deutsch, schluessel] of ANLEITUNG_DE.filter((r) => r[2])) {
        it(`"${deutsch}" ist woertlich die Zeile aus js/i18n.js`, () => {
            assert.equal(TABELLE.de[schluessel], deutsch,
                `${schluessel} lautet in der Sprachtabelle anders — die Anleitung ist damit wieder falsch`);
        });
    }

    it('was die Oberflaeche selbst englisch schreibt, bleibt englisch', () => {
        // Gegenprobe zur Uebersetzungswut: der Knopf "Grid" der
        // Wunschliste und der Knopf "Save" ihres Uebersichts-Fensters
        // tragen in index.html KEIN data-i18n. Die deutsche Oberflaeche
        // zeigt dort englische Woerter, also muss die Anleitung sie auch
        // englisch nennen. Ebenso "Wishlist-Karte" im Preisalarm-Text,
        // der woertlich so in der deutschen Sprachtabelle steht.
        assert.match(ohneHtmlKommentar(TUT_DE), /<em>Grid<\/em>-Button der Wishlist/,
            'der Grid-Knopf wurde uebersetzt, obwohl die deutsche Oberflaeche "Grid" zeigt');
        assert.match(ohneHtmlKommentar(TUT_DE), /<em>Save<\/em> ein teilbares PNG/,
            'der Save-Knopf wurde uebersetzt, obwohl die deutsche Oberflaeche "Save" zeigt');
        assert.ok(TABELLE.de['profile.priceAlerts.intro'].includes('Wishlist-Karte'),
            'die Sprachtabelle sagt nicht mehr "Wishlist-Karte" — dann darf die Anleitung nachziehen');
    });
});

describe('C — der gespiegelte Fehler in der englischen Anleitung', () => {
    const quelle = ohneHtmlKommentar(TUT_EN);
    it('die Preis-Pille steht englisch da', () => {
        assert.ok(!quelle.includes('Preis Check'),
            'die deutsche Pille "⚠ Preis Check" steht wieder in der englischen Anleitung');
        assert.ok(quelle.includes(`>${TABELLE.en['preis.checkPill']}<`),
            'die englische Pille fehlt in den Nachbau-Bildschirmen');
    });
    it('und sie ist woertlich die Zeile aus js/i18n.js', () => {
        assert.equal(TABELLE.en['preis.checkPill'], '⚠ Price check');
        assert.equal(TABELLE.de['preis.checkPill'], '⚠ Preis Check');
    });
});

describe('jeder Schluessel steht genau zweimal in js/i18n.js', () => {
    const geprueft = new Set(ANLEITUNG_DE.map((r) => r[2]).filter(Boolean)
        .concat(['preis.checkPill', 'profile.priceAlerts.intro']));
    for (const k of geprueft) {
        it(k, () => {
            const n = (I18N.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length;
            assert.equal(n, 2, `${k} steht ${n}x statt 2x (en + de)`);
        });
    }
});
