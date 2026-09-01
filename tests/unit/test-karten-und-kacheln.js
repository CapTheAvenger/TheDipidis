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

describe('Der Datenumfang — von der Startseite nach Quellen & Methodik', () => {
    /* HIER STANDEN BIS ZUM 01.09.2026 FUENF PRUEFUNGEN AN DREI
       KENNZAHL-KACHELN ("Gemeldete Listen", "Archetypen", "Top 8
       Archetypes"), die ueber den Decks hingen.
       Gemeldet: "Ich weiss nicht, ob diese Aussage tatsaechlich
       irgendeinen Mehrwert hat. … koennen wir das bei Quelle mit
       angeben? Okay, die Daten berufen sich auf so und so viele
       gemeldete Listen, so und so viele Turniere, so und so viele
       Spieler."
       Die Kacheln sind weg, die Zahlen nicht. Diese Pruefungen decken
       jetzt den Weg ab, den sie nehmen — denn ein Umzug, bei dem am
       Zielort nichts ankommt, ist eine Loeschung mit besserer Presse. */
    const UMFANG = stripJs(read('js/ds-datenumfang.js'));
    const QUELLEN = stripJs(read('js/app-quellen.js'));

    it('die Kachelreihe ist von der Startseite verschwunden', () => {
        assert.ok(!/'Gemeldete Listen'/.test(TIER), 'die Kachelreihe ist zurueck');
        assert.ok(!/'Top 8 Archetypes'/.test(TIER));
        assert.ok(!/'Decks im Feld'/.test(TIER), '"Decks im Feld" ist wieder da');
    });

    it('gerechnet wird sie weiter dort, wo beide Nenner bekannt sind', () => {
        // Ein zweiter Rechenweg fuer dieselbe Groesse ist der Fehler,
        // aus dem diese Seite einmal vier Win Rates fuer ein Deck auf
        // einem Bildschirm hatte.
        assert.match(TIER, /limitless_meta_stats\.json/);
        assert.match(TIER, /window\.DsDatenumfang\.setzen\(\{/);
        for (const feld of ['listen', 'archetypen', 'antritte', 'turniere', 'spieler', 'partien']) {
            assert.match(TIER, new RegExp('\\n\\s+' + feld + ':'), `${feld} wird nicht gemeldet`);
        }
        assert.ok(!/function saetze/.test(TIER),
            'app-tier-meta.js formuliert die Saetze selbst — das ist der zweite Weg');
    });

    it('und sie kommt bei Quellen & Methodik an', () => {
        assert.match(QUELLEN, /umfang: true/);
        assert.match(QUELLEN, /window\.DsDatenumfang[\s\S]{0,120}saetze\(de\(\)\)/);
        // In beiden Sprachen, sonst ist die Kuerzung fuer die eine ein Verlust.
        assert.match(QUELLEN, /Worauf die Zahlen beruhen/);
        assert.match(QUELLEN, /What the numbers rest on/);
    });

    it('fehlt der Umfang, wird er nicht geschaetzt', () => {
        // Der Kern der Datenregeln dieses Projekts: eine Luecke wird
        // benannt, nicht gefuellt.
        assert.match(QUELLEN, /leer:/);
        assert.match(UMFANG, /if \(!u\) return \[\]/);
        assert.match(UMFANG, /HOECHSTALTER_MS/,
            'ein alter Stand wuerde als heutiger ausgegeben');
    });

    it('jede Zeile faellt weg, wenn ihre Zahl fehlt', () => {
        // Sonst stuende "null Turniere · undefined Spieler" da.
        const F = new Function('window', 'sessionStorage', 'Date',
            UMFANG + '\nreturn window.DsDatenumfang;');
        const w = {};
        F(w, { getItem: () => null, setItem: () => {} }, Date);
        const api = w.DsDatenumfang;
        api.setzen({ listen: 26319, archetypen: 138 });
        const z = api.saetze(true).join(' | ');
        assert.match(z, /26\.319 gemeldete Decklisten/);
        assert.match(z, /138 Archetypen/);
        assert.ok(!/Turniere/.test(z), 'eine unbekannte Zahl wurde trotzdem gedruckt');
        assert.ok(!/null|undefined|NaN/.test(z), z);
    });

    it('ein Nachtrag ueberlebt den naechsten Stand', () => {
        /* BEFUND aus dem Review (01.09.2026): setzen() ersetzte den
           ganzen Stand und warf staplesArchetypen weg. Beim ERSTEN
           Aufbau fiel das nicht auf (Tier-Liste vor Staples-Widget);
           beim SPRACHWECHSEL dreht sich die Reihenfolge, und die Zeile
           ueber die Kartenanteile verschwand dauerhaft.
           Genau diese Reihenfolge wird hier nachgestellt. */
        const F = new Function('window', 'sessionStorage', 'Date',
            UMFANG + '\nreturn window.DsDatenumfang;');
        const w = {};
        let gemerkt = null;
        F(w, { getItem: () => gemerkt, setItem: (k, v) => { gemerkt = v; } }, Date);
        const api = w.DsDatenumfang;

        api.setzen({ listen: 100, archetypen: 10 });
        api.ergaenze({ staplesArchetypen: 60 });
        assert.equal(api.lesen().staplesArchetypen, 60);

        // Der Sprachwechsel: Staples zuerst, Tier-Liste danach.
        api.ergaenze({ staplesArchetypen: 60 });
        api.setzen({ listen: 101, archetypen: 10 });
        assert.equal(api.lesen().staplesArchetypen, 60,
            'der neue Stand hat den Nachtrag weggewischt');
        assert.match(api.saetze(true).join(' | '), /60 Archetypen, zu denen vollständige/);
    });

    it('ein Nachtrag allein ist noch kein Umfang', () => {
        /* Sonst stuende unter Quellen & Methodik ein Umfang aus einer
           einzigen Zeile ueber Kartenanteile — das saehe aus wie eine
           Antwort und waere eine Luecke. */
        const F = new Function('window', 'sessionStorage', 'Date',
            UMFANG + '\nreturn window.DsDatenumfang;');
        const w = {};
        let gemerkt = null;
        F(w, { getItem: () => gemerkt, setItem: (k, v) => { gemerkt = v; } }, Date);
        const api = w.DsDatenumfang;
        api.ergaenze({ staplesArchetypen: 60 });
        assert.equal(api.lesen(), null, 'ein halber Stand wurde gespeichert');
        assert.deepEqual(api.saetze(true), [], 'aus einem Nachtrag allein wurden Saetze');
        // Und er ist nicht verloren: der naechste echte Stand nimmt ihn mit.
        api.setzen({ listen: 100, archetypen: 10 });
        assert.equal(api.lesen().staplesArchetypen, 60);
    });

    it('mit allen Zahlen stehen alle Zeilen da', () => {
        const F = new Function('window', 'sessionStorage', 'Date',
            UMFANG + '\nreturn window.DsDatenumfang;');
        const w = {};
        F(w, { getItem: () => null, setItem: () => {} }, Date);
        const api = w.DsDatenumfang;
        api.setzen({ listen: 26319, archetypen: 138, antritte: 8130,
                     feldGesamt: 27357, restAnteil: 3.8,
                     turniere: 475, spieler: 14026, partien: 59910,
                     stand: '2026-08-28T00:00:00Z' });
        api.ergaenze({ staplesArchetypen: 60 });
        const z = api.saetze(true).join(' | ');
        assert.match(z, /26\.319 gemeldete Decklisten/);
        assert.match(z, /8\.130 gewichtete Turnier-Antritte/);
        assert.match(z, /475 Turniere/);
        assert.match(z, /14\.026 Spieler/);
        assert.match(z, /59\.910 Partien/);
        assert.match(z, /60 Archetypen, zu denen vollständige/);
        assert.ok(!/null|undefined|NaN/.test(z), z);
    });

    it('und der Feldanteil der acht groessten ist mitgezogen, nicht geloescht', () => {
        /* Die dritte Kachel der entfernten Reihe. Sie ist die einzige
           der drei, deren Zahl sonst nirgends stand — sie zu loeschen
           waere keine Kuerzung, sondern ein Verlust gewesen. Der Review
           hat genau das beanstandet, weil docs/geparkte-features.md
           "das ist kein Parken, das ist ein Umzug" behauptete. */
        assert.match(TIER, /top8Anteil/, 'der Anteil wird nicht mehr gerechnet');
        assert.match(TIER, /\.slice\(0, 8\)/);
        const F = new Function('window', 'sessionStorage', 'Date',
            UMFANG + '\nreturn window.DsDatenumfang;');
        const w = {};
        F(w, { getItem: () => null, setItem: () => {} }, Date);
        w.DsDatenumfang.setzen({ listen: 100, archetypen: 10, top8Anteil: 61.4 });
        const z = w.DsDatenumfang.saetze(true).join(' | ');
        assert.match(z, /acht größten Archetypen/);
        assert.match(z, /Top 8 Archetypes/);
        assert.match(z, /61 % des Feldes/);
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
