/**
 * Ein gruener Haken ueber einer Pruefung, die nicht stattgefunden hat.
 *
 * BEFUND 05.09.2026, drei Faelle derselben Form:
 *
 *   1. `Visual Fullpage Coverage` lief seit dem 22.05.2026 jede Nacht
 *      um 03:00 UTC ueber eine 0-Byte-Spec und meldete gruen — der
 *      Aufrufer gab `--pass-with-no-tests` mit. Rund 105 Naechte.
 *   2. `champions-replica-scrape` liess acht Schritte per `set +e ...
 *      exit 0` scheitern, ohne dass irgendwo Buch darueber gefuehrt
 *      wurde, und warf ausserdem `champions_speed_corpus.json` jede
 *      Nacht weg, weil sie in der `git add`-Liste fehlte.
 *   3. `Per-Decklist Scrape` lief zehnmal 50 Sekunden lang, committete
 *      nichts und meldete gruen — es liess sich nicht unterscheiden, ob
 *      es nichts Neues gab oder ob der Scraper nicht ansprang.
 *
 * Gemeinsam ist allen drei: nicht falsch gerechnet, sondern gar nicht
 * gerechnet, und die gruene Meldung machte genau das unsichtbar. Am
 * teuersten war Fall 1 — dreieinhalb Monate, in denen jede Nacht ein
 * Haken unter einer leeren Datei stand.
 *
 * Diese Datei haelt die Regel fest: ein Lauf darf nicht gruen melden,
 * ohne etwas getan zu haben. Sie liest Aufrufer und Workflows als Text
 * — was ein Test liest, ist Code (CLAUDE.md).
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf-8');

/* Die Aufrufer der e2e-Suiten und die Spec-Dateien, die sie fahren. */
const AUFRUFER = [
    { datei: 'tests/e2e/run-visual-fullpage-ci.js',
      specs: ['tests/e2e/visual-full-page-coverage.spec.js'] },
    { datei: 'tests/e2e/run-visual-nonmeta-ci.js',
      specs: ['tests/e2e/visual-regression.spec.js',
              'tests/e2e/city-league-hero-combined-navigation.e2e.spec.js'] },
];

function hatTest(pfad) {
    let inhalt;
    try {
        inhalt = lies(pfad);
    } catch (_) {
        return false;
    }
    if (inhalt.trim() === '') return false;
    return /\btest\s*\(|\btest\.describe\s*\(/.test(inhalt);
}

describe('Kein gruener Haken ohne Pruefung', () => {
    it('--pass-with-no-tests steht nur ueber Suiten, die auch Tests haben', () => {
        /* Das Kernstueck. `--pass-with-no-tests` ist nicht per se falsch:
           ein Aufrufer, der mehrere Specs fahren will und einzelne davon
           optional halten muss, braucht es. Falsch ist es genau dann,
           wenn KEINE der gefahrenen Specs einen Test enthaelt — dann
           prueft der Lauf nichts und sagt trotzdem "gut". */
        for (const { datei, specs } of AUFRUFER) {
            const quelle = lies(datei);
            /* Nur der echte Aufrufparameter zaehlt, nicht das Wort im
               Kommentar daneben — der Kommentar, der erklaert, warum die
               Fahne WEG ist, darf diese Zusicherung nicht ausloesen. */
            if (!/'--pass-with-no-tests'/.test(quelle)) continue;
            const mitTests = specs.filter(hatTest);
            assert.ok(mitTests.length > 0,
                `${datei} gibt --pass-with-no-tests mit, und KEINE der `
                + `Specs (${specs.join(', ')}) enthaelt einen Test. Dieser `
                + `Lauf meldet gruen, ohne etwas geprueft zu haben — genau `
                + `der Zustand, in dem die Ganzseiten-Suite 105 Naechte lang `
                + `stand.`);
        }
    });

    it('die Ganzseiten-Suite meldet nicht mehr gruen, wenn sie leer ist', () => {
        const quelle = lies('tests/e2e/run-visual-fullpage-ci.js');
        assert.doesNotMatch(quelle, /'--pass-with-no-tests'/,
            'der Ganzseiten-Aufrufer gibt --pass-with-no-tests wieder mit');
        assert.match(quelle, /process\.exitCode = 1/,
            'der Aufrufer bricht bei leerer Suite nicht mehr mit 1 ab');
        assert.match(quelle, /visual-full-page-coverage\.spec\.js/,
            'der Aufrufer prueft nicht mehr, welche Datei er eigentlich faehrt');
    });

    it('eine leere Suite hat keinen naechtlichen Lauf', () => {
        /* Wenn die Suite leer ist, darf der Workflow nicht per cron
           starten: er waere ab sofort jede Nacht rot, und eine Meldung,
           an der niemand etwas tun kann, wird nach drei Naechten nicht
           mehr gelesen. Hat die Suite Inhalt, DARF der cron zurueck —
           diese Zusicherung dreht sich dann von selbst um. */
        const wf = lies('.github/workflows/visual-fullpage.yml');
        const cronAktiv = /^\s*schedule:/m.test(wf)
            && /^\s*-\s*cron:/m.test(wf);
        const gefuellt = hatTest('tests/e2e/visual-full-page-coverage.spec.js');
        if (!gefuellt) {
            assert.ok(!cronAktiv,
                'visual-full-page-coverage.spec.js enthaelt keinen Test, aber '
                + 'der Workflow laeuft weiter naechtlich. Entweder die Suite '
                + 'bekommt Inhalt, oder der cron bleibt weg.');
            assert.match(wf, /workflow_dispatch/,
                'ohne cron und ohne workflow_dispatch waere der Lauf gar nicht '
                + 'mehr ausloesbar');
        }
    });

    it('der Grund steht in den geparkten Features, nicht nur im Kopf', () => {
        const parken = lies('docs/geparkte-features.md');
        assert.match(parken, /Ganzseiten-Suite/,
            'die abgeschaltete Ganzseiten-Suite ist nirgends festgehalten — '
            + 'in drei Monaten baut sie jemand ein zweites Mal von vorn');
    });
});

describe('Nicht blockierende Schritte fuehren Buch', () => {
    /* Die YAML-Seite dieser Regel prueft tests/python/test_wochenlauf_bilanz.py
       fuer weekly-full-update.yml und champions-replica-scrape.yml. Hier
       steht nur die Zusicherung, dass kein WEITERER Workflow unbemerkt in
       denselben Zustand rutscht: wer `set +e` mit `exit 0` kombiniert,
       braucht eine Bilanz. */
    const AUSNAHMEN = new Set([
        // Reine Bildlaeufe ohne eigene Daten — sie schreiben nichts, das
        // still veralten koennte.
        'visual-fullpage.yml',
        'visual-nonmeta.yml',
        // Haelt nur den Bot wach; ein Fehlschlag ist beim naechsten Lauf
        // in 15 Minuten wieder da.
        'bot-keepalive.yml',
        // Der Deploy selbst: er faellt bei einem echten Fehler ohnehin um,
        // und seine `set +e`-Stellen sind Aufraeumschritte.
        'deploy-pages.yml',
        // Geprueft am 05.09.2026: der Pocket-Lauf faellt bei einem
        // Scraperfehler ausdruecklich HART um (der Kommentar "WARUM
        // DIESER SCHRITT JETZT ROT WERDEN DARF" steht in der Datei).
        // Seine `exit 0`-Stellen sind der Commit-Schritt, der nichts
        // zu committen hat — das ist kein verschluckter Fehler.
        'pocket-tierlist.yml',
    ]);

    it('jeder Workflow mit set +e und exit 0 hat eine Bilanz oder eine Ausnahme', () => {
        const dir = path.join(WURZEL, '.github', 'workflows');
        const offen = [];
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
            if (AUSNAHMEN.has(name)) continue;
            const inhalt = fs.readFileSync(path.join(dir, name), 'utf-8');
            if (!/^\s*set \+e\s*$/m.test(inhalt)) continue;
            if (!/^\s*exit 0\b/m.test(inhalt)) continue;
            // Buch fuehren heisst: entweder eine rc-Bilanz, oder der
            // Schritt meldet ausdruecklich, dass er nichts getan hat.
            const fuehrtBuch = /rc_extra\.txt/.test(inhalt)
                || /_job_heartbeats\.json/.test(inhalt)
                || /GITHUB_STEP_SUMMARY/.test(inhalt);
            if (!fuehrtBuch) offen.push(name);
        }
        assert.deepStrictEqual(offen, [],
            'diese Workflows koennen scheitern, ohne dass es irgendwo steht: '
            + offen.join(', ') + '. Entweder eine Bilanz einbauen (Vorbild: '
            + '"Bilanz der nicht blockierenden Schritte (S5)" in '
            + 'weekly-full-update.yml) oder mit Grund in AUSNAHMEN eintragen.');
    });
});
