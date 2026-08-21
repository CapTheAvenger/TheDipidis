/**
 * Zwei kleine Ruecknahmen aus der Rueckmeldung vom 19.08.2026.
 *
 * ── 1. Die Kacheln sagten zweimal dasselbe, und einmal etwas Falsches ──
 *
 * Unter den Top-Archetypen standen drei Kennzahlen:
 *
 *   "Decks im Feld"      26.319
 *   "Archetypen"            131
 *   "Feld-Durchschnitt"   6,20 %
 *
 * Zwei Beanstandungen, beide berechtigt:
 *
 *   "jetzt sind ja nicht 26.000 verschiedene Decks — wir haben zwar
 *    26.000 verschiedene Listen"
 *   "Felddurchschnitt mit den 6,2 % hast Du oben schon stehen, muessen wir
 *    jetzt auch nicht noch mal schreiben"
 *
 * Die erste Kachel hiess falsch: 26.319 sind Decklisten, keine Deckarten —
 * davon gibt es 131, und die stehen direkt daneben. Die dritte wiederholte
 * eine Zahl, die seit demselben Tag schon im Satz darueber steht.
 *
 * Angeboten war "wenn wir fuer die Kacheln keine besseren Informationen
 * haben, dann kriegen die Kacheln weg". Es gab eine bessere: wie eng ist
 * das Feld? Die acht groessten Archetypen sind 52 % aller Listen — das
 * steht sonst nirgends und beantwortet eine echte Frage.
 *
 * ── 2. Fuenfzehn Karten, die nichts anboten ───────────────────────────
 *
 *   "hier muesste man vielleicht nur noch die Moeglichkeit haben, die
 *    direkt auf die Wunschliste zu packen, und dass man die Chance hat,
 *    sich alle verschiedenen Artworks anzeigen zu lassen"
 *
 * Beides war laengst gebaut — addToWishlist() in js/firebase-collection.js,
 * openRaritySwitcherFromDB() in js/app-cards-db.js — und hier nie
 * verdrahtet. Die Kartendaten tragen set_code und set_number ohnehin mit.
 * Wieder dasselbe Muster: das Richtige existiert, eine Ansicht hat es, die
 * andere nicht.
 *
 * Nachgemessen, Desktop 1440 und Mobil 390: 15 von 15 Karten mit beiden
 * Knoepfen, 32 bzw. 36 px hoch, Karten-Kennung "Night Stretcher|ASC|196",
 * kein Seitenfehler beim Klick im abgemeldeten Zustand.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const TIER = stripJs(read('js/app-tier-meta.js'));
const CSS = stripCss(read('css/components.css'));

describe('Kennzahl-Kacheln', () => {
    it('26.319 heissen jetzt Listen, nicht Decks', () => {
        assert.ok(!/'Decks im Feld'/.test(TIER), '"Decks im Feld" ist wieder da');
        assert.match(TIER, /'Gemeldete Listen'/);
        assert.match(TIER, /einzelne Decklisten, nicht Deckarten/);
    });

    it('der Feld-Durchschnitt steht nicht mehr doppelt', () => {
        // Er steht im Antwortsatz darueber (js/meta-analysis-hub.js).
        assert.ok(!/'Feld-Durchschnitt'/.test(TIER),
            'die Kachel wiederholt wieder eine Zahl von weiter oben');
    });

    it('stattdessen etwas, das sonst nirgends steht — in Szene-Sprache', () => {
        // Hiess zuerst "Die acht groessten". Gemeldet: "man wuerde hier von
        // Top 8 Archetypes sprechen … die englischen Woerter, die in der
        // Community benutzt werden, sollten wir schon benutzen."
        assert.match(TIER, /'Top 8 Archetypes'/);
        assert.ok(!/'Die acht größten'/.test(TIER), 'die alte Beschriftung ist zurueck');
    });

    it('und sie rechnet aus fieldConv, nicht aus enriched', () => {
        // enriched steht mit const im try-Block weiter oben und ist an der
        // Kachelstelle nicht mehr im Scope. Beim ersten Versuch stand es
        // hier — das haette die ganze Reihe still gerissen, weil ein
        // try/catch darum liegt.
        const a = TIER.indexOf("'Top 8 Archetypes'");
        assert.ok(a > -1);
        // Nur der Kachel-Block selbst, nicht die Rangliste weiter oben:
        // die darf enriched benutzen, sie steht im try.
        const start = TIER.lastIndexOf('${(() => {', a);
        const block = TIER.slice(start, a);
        assert.match(block, /fieldConv\.decks/);
        assert.ok(!/enriched/.test(block),
            'enriched ist an dieser Stelle nicht im Scope');
    });

    it('die Kachel nennt, woraus die Listen bestehen', () => {
        // Die einzige Angabe aus dem aufgeloesten Abschnitt "Ueberblick", die
        // sonst nirgends stand.
        assert.match(TIER, /limitless_meta_stats\.json/);
        assert.match(TIER, /aus \$\{fmtNumDS\(metaStats\.turniere\)\} Turnieren/);
    });
});

describe('Karten der Format-Staples', () => {
    it('jede Karte bietet Wunschliste und Artworks an', () => {
        assert.match(TIER, /addToWishlist\('\$\{escapeJsStr\(kartenId\)\}'\)/);
        assert.match(TIER, /openRaritySwitcherFromDB\('\$\{escapeJsStr\(card\.name\)\}'/);
    });

    it('die Karten-Kennung hat das Format, das die Wunschliste erwartet', () => {
        // js/app-cards-db.js baut sie als `${name}|${set}|${number}`.
        assert.match(TIER, /kartenId = hatDruck \? `\$\{card\.name\}\|\$\{card\.set_code\}\|\$\{card\.set_number\}`/);
    });

    it('ohne Set und Nummer gibt es keine toten Knoepfe', () => {
        assert.match(TIER, /const hatDruck = !!\(card\.set_code && card\.set_number\)/);
        assert.match(TIER, /hatDruck \? `[\s\S]{0,60}top-card-actions/);
    });

    it('beide Knoepfe sagen auch ohne Blick, was sie tun', () => {
        assert.match(TIER, /aria-label="\$\{escapeHtml\(\(deLbl \? 'Auf die Wunschliste: '/);
        assert.match(TIER, /aria-label="\$\{escapeHtml\(\(deLbl \? 'Artworks: '/);
    });

    it('der Kartenname wird maskiert, in beide Richtungen', () => {
        // escapeJsStr fuer das onclick, escapeHtml fuer Attribut und Text —
        // "N's Zoroark" bricht sonst das eine oder das andere.
        assert.match(TIER, /escapeJsStr\(card\.name\)/);
        assert.match(TIER, /class="top-card-name">\$\{escapeHtml\(card\.name\)\}/);
        assert.match(TIER, /alt="\$\{escapeHtml\(card\.name\)\}"/);
    });

    it('"% Usage" ist uebersetzt und der Nenner heisst Archetypen, nicht Decks', () => {
        // F21 (Audit 2, 21.08.2026): der Nenner der Top-Cards-Prozente ist die
        // Zahl der Archetypen (gemessen 60), nicht der Decklisten. "der Decks"
        // suggerierte 26.319 Listen. Deshalb jetzt "der Archetypen".
        assert.ok(!/% Usage/.test(TIER), '"% Usage" steht wieder da');
        assert.ok(!/\}\s*decks<\/div>/.test(TIER), '"decks" steht wieder fest verdrahtet da');
        assert.match(TIER, /deLbl \? 'der Archetypen' : 'of archetypes'/);
        assert.ok(!/'der Decks' : 'of decks'/.test(TIER), '"der Decks" ist wieder da');
    });

    it('die Prozentzahl laeuft ueber fmtPct', () => {
        // toFixed(1) schrieb "100.0" mit Punkt, mitten in einer deutschen
        // Seite und neben Zahlen, die es anders machen.
        assert.match(TIER, /fmtPct\(card\.global_share\)/);
        assert.ok(!/card\.global_share\.toFixed/.test(TIER));
    });

    it('die Knoepfe sind gross genug fuer einen Daumen', () => {
        const m = CSS.match(/\.top-card-act\s*\{([^}]*)\}/);
        assert.ok(m, '.top-card-act fehlt');
        const px = Number((m[1].match(/min-height:\s*(\d+)px/) || [])[1]);
        assert.ok(px >= 32, 'nur ' + px + ' px hoch');
        assert.match(CSS, /@media \(max-width: 768px\)[\s\S]{0,120}\.top-card-act \{ min-height: 36px; \}/);
        assert.match(CSS, /\.top-card-act:focus-visible/);
        assert.ok(!m[1].includes('!important;'));
    });
});
