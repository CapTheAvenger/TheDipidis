/**
 * Was die Bildkarte zeichnet, muss sie auch bekommen.
 *
 * BEFUND 11.09.2026 — ZWEI FEHLER AUS EINER LUECKE
 * ------------------------------------------------
 * `deckCardCanvas()` in js/ds-share.js liest seit dem 02.09.2026
 * `spec.majorShare`, `spec.majorWinRate`, `spec.majorPartien`,
 * `spec.majorAntritte`, `spec.majorDay2` … und `spec.expected`.
 * `factsFor()` in js/app-archetype-card.js liefert sie alle.
 *
 * Dazwischen steht `collectDeckSpec()`, und das zaehlt jedes Feld
 * EINZELN auf. Die Praesenzfelder und `expected` standen dort nicht.
 * Zwei sichtbare Folgen, beide vom Betreiber gemeldet:
 *
 *   1. `hatMajorShare` und `hatMajorWr` waren immer falsch. Das Bild
 *      zeigte KEINE Praesenzzahlen und behauptete in der Fusszeile
 *      „Praesenzturniere: fuer dieses Deck liegen in diesem Format
 *      keine vor" — waehrend die Kachel daneben auf der Seite
 *      22,3 % aus 178 Antritten zeigte. Gemeldet als „dann haben wir
 *      hier in dem Bild extrem viel Freiraum": drei Zeilen, die nie
 *      gezeichnet wurden.
 *   2. `convFeld` blieb NaN, also stand unter der Top-8-Quote
 *      „189 / 1.289" statt „Schnitt aller Decks 6,4 %" — der Zweig,
 *      der nur greift, wenn der Feldschnitt fehlt.
 *
 * WARUM DIE VORHANDENEN TESTS DAS NICHT FANDEN
 * --------------------------------------------
 * tests/unit/test-bild-online-major.js prueft BEIDE ENDEN: dass
 * factsFor die Felder fuehrt und dass die Zeichenroutine sie liest.
 * Die Uebergabe dazwischen prueft es nicht. Ein Test je Ende kann eine
 * fehlende Bruecke nicht sehen.
 *
 * WAS DIESE DATEI FESTHAELT
 * -------------------------
 * Die Bruecke selbst: JEDES `spec.X`, das deckCardCanvas() liest, muss
 * in collectDeckSpec() gesetzt werden. Das ist keine Liste, die jemand
 * pflegen muss — sie wird aus dem Quelltext gelesen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const SHARE = lies('js/ds-share.js');
const KARTE = lies('js/app-archetype-card.js');

/** Der Rumpf einer Funktion, von ihrem Kopf bis zur Zeile `    }`. */
function rumpf(quelle, kopf) {
    const i = quelle.indexOf(kopf);
    assert.ok(i > -1, 'nicht gefunden: ' + kopf);
    const j = quelle.indexOf('\n    }', i);
    assert.ok(j > i, 'kein Ende gefunden fuer: ' + kopf);
    return quelle.slice(i, j);
}

const CANVAS = rumpf(SHARE, 'function deckCardCanvas(spec, art)');
const SAMMLER = rumpf(SHARE, 'function collectDeckSpec(name, space)');
const FACTS = rumpf(KARTE, 'function factsFor(name)');

describe('Bildkarte — die Uebergabe traegt alles, was gezeichnet wird', () => {

    it('der Leser sieht ueberhaupt etwas (sonst besteht er leer)', () => {
        assert.ok(CANVAS.length > 5000, 'deckCardCanvas() zu kurz — der Schnitt stimmt nicht');
        assert.ok(SAMMLER.length > 400, 'collectDeckSpec() zu kurz — der Schnitt stimmt nicht');
        assert.ok(/spec\.majorShare/.test(CANVAS),
            'ein bekanntes Feld fehlt im Schnitt — der Leser greift danebe' + 'n');
    });

    it('jedes gelesene spec-Feld wird auch gesetzt', () => {
        const gelesen = [...new Set(
            (CANVAS.match(/spec\.([A-Za-z_$][\w$]*)/g) || []).map(x => x.slice(5)))]
            .sort();
        assert.ok(gelesen.length > 15, `nur ${gelesen.length} Felder gefunden`);
        /* shareDeckCard() setzt spec.matchupAuswahl NACH dem Sammler —
           es waehlt die Zeilen aus, BEVOR es ihre Symbole laedt, damit
           jede Zeile ihr eigenes bekommt. Deshalb zaehlt auch dieser
           Schritt als „gesetzt". */
        const RUFER = rumpf(SHARE, 'function shareDeckCard(name, space)');
        const gesetzt = (f) => new RegExp('(^|[^\\w.])' + f + '\\s*:').test(SAMMLER)
            || new RegExp('spec\\.' + f + '\\s*=').test(RUFER);
        const fehlt = gelesen.filter(f => !gesetzt(f));
        assert.deepEqual(fehlt, [],
            'deckCardCanvas() liest diese Felder, collectDeckSpec() setzt sie nicht:\n  '
            + fehlt.join('\n  ')
            + '\n\nGenau so blieben am 11.09.2026 alle Praesenzzeilen und der '
            + 'Feldschnitt leer, ohne dass ein Test anschlug. Wer ein Feld '
            + 'in der Zeichenroutine ergaenzt, ergaenzt es auch im Sammler.');
    });

    it('und factsFor() liefert, was der Sammler von ihm abholt', () => {
        // Die andere Haelfte der Bruecke: `f.X` im Sammler muss es geben.
        const geholt = [...new Set(
            (SAMMLER.match(/\bf\.([A-Za-z_$][\w$]*)/g) || []).map(x => x.slice(2)))]
            .sort();
        assert.ok(geholt.length > 10, `nur ${geholt.length} Felder abgeholt`);
        const fehlt = geholt.filter(f => !new RegExp('(^|[^\\w.])' + f + '\\s*:').test(FACTS));
        assert.deepEqual(fehlt, [],
            'collectDeckSpec() holt Felder, die factsFor() nicht fuehrt: ' + fehlt.join(', '));
    });

    it('die Praesenzfelder sind namentlich dabei', () => {
        // Ausgeschrieben, weil genau diese gefehlt haben — der Test oben
        // faende es auch, aber ein Fehlertext mit Namen spart die Suche.
        ['majorShare', 'majorWinRate', 'majorPartien', 'majorAntritte',
         'majorDay2', 'majorDay2Feld', 'expected'].forEach((f) => {
            assert.match(SAMMLER, new RegExp('\\b' + f + '\\s*:'),
                `${f} fehlt in collectDeckSpec() — das Bild zeigt dann wieder `
                + 'weniger als die Seite daneben');
        });
    });

    it('die Symbole werden fuer die AUSGEWAEHLTEN Zeilen geladen', () => {
        /* Bis zum 11.09.2026 wurden die Symbole der ersten zwoelf nach
           Quote sortierten Paarungen geladen, das Bild adressierte sie
           aber mit dem Index der ausgewaehlten Zeilen (art.mIcons[r]).
           Bei mehr als zehn Paarungen trugen die unteren Zeilen die
           Symbole fremder Decks. */
        const fn = rumpf(SHARE, 'function shareDeckCard(name, space)');
        assert.match(fn, /spec\.matchupAuswahl = sel;/,
            'die Auswahl wird nicht an die Zeichenroutine weitergereicht — '
            + 'dann waehlen beide Stellen getrennt aus und koennen auseinanderlaufen');
        assert.match(fn, /getArchetypeMatchupAuswahl/,
            'die Symbole werden wieder fuer eine andere Liste geladen als gezeichnet wird');
        assert.match(CANVAS, /spec\.matchupAuswahl && spec\.matchupAuswahl\.length/,
            'die Zeichenroutine benutzt die mitgelieferte Auswahl nicht');
    });

    it('die Auswahlregel steht an EINER Stelle', () => {
        // js/app-archetype-card.js haelt sie; ds-share.js holt sie dort ab.
        assert.match(KARTE, /function vorschauAuswahl\(alle, wieViele\)/,
            'die Regel ist aus js/app-archetype-card.js verschwunden');
        assert.match(KARTE, /window\.getArchetypeMatchupAuswahl = function/,
            'die Regel wird nicht nach aussen gegeben');
        assert.ok(!/function vorschauAuswahl/.test(SHARE),
            'js/ds-share.js hat eine zweite Fassung der Auswahlregel — '
            + 'das Bild ist die Fassung, die die Seite VERLAESST, und darf '
            + 'ihr nicht widersprechen');
    });
});
