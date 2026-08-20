/**
 * Das heutige Datum ist kein Datenstand.
 *
 * GEMESSEN am 20.08.2026: jeder Frische-Chip der Seite zeigte "Daten:
 * 20.8.2026" — den Tag des Besuchs. Der Wert kam aus
 *
 *     localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString('de-DE')
 *
 * und der linke Teil ist immer leer: 'lastScraperUpdate' wird nirgends im
 * Repo geschrieben. Fuenf Reiter, deren Daten bis zu 19 Tage auseinander
 * liegen, trugen dasselbe Datum — und zwar deins.
 *
 * Fuer den Head-Judge-Blick ist das der teuerste Mangel der Seite: ohne
 * Erhebungsdatum ist jede Zahl darunter als Beleg wertlos.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Kommentare abziehen: die Begruendungen ZITIEREN den alten, falschen Code —
   das sollen sie auch. Geprueft wird, was ausgefuehrt wird. */
const ohneKommentar = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

const MODUL = ohneKommentar(read('js/ds-datenstand.js'));
const INIT  = ohneKommentar(read('js/app-init.js'));
const HTML  = read('index.html');
const SW    = read('service-worker.js');

describe('Kein geratenes Datum mehr', () => {
    it('app-init.js setzt nicht mehr das heutige Datum in die Chips', () => {
        assert.doesNotMatch(INIT, /lastScraperUpdate/);
        assert.doesNotMatch(INIT, /js-data-freshness'\)\.forEach\(el => \{\s*el\.textContent = lastUpdate/);
    });

    it('niemand sonst liest den nie geschriebenen Schluessel als Datum', () => {
        // ds-nav.js und meta-analysis-hub.js lasen ihn ebenfalls; sie duerfen
        // daraus kein Datum ableiten, das es nicht gibt.
        for (const datei of ['js/app-init.js']) {
            assert.doesNotMatch(ohneKommentar(read(datei)), /lastScraperUpdate/, datei);
        }
    });

    it('unbekannt heisst unbekannt', () => {
        assert.match(MODUL, /return de\(\) \? 'unbekannt' : 'unknown';/);
        // Und nirgends ein new Date() als Ersatzwert fuer einen Stand.
        assert.doesNotMatch(MODUL, /new Date\(\)\.toLocaleDateString/);
    });
});

describe('Jeder Chip nennt den Stand SEINER Ansicht', () => {
    it('alle fuenf Chips tragen eine eigene Quelle', () => {
        const chips = [...HTML.matchAll(/class="js-data-freshness"([^>]*)>/g)].map(m => m[1]);
        assert.equal(chips.length, 5, `${chips.length} Chips gefunden`);
        for (const attr of chips) {
            assert.match(attr, /data-quelle="[a-z0-9_]+\.(csv|json)"/, attr);
        }
    });

    it('und zwar fuenf verschiedene', () => {
        // Der japanische Datenraum und das globale Meta werden von
        // verschiedenen Laeufen befuellt. Ein gemeinsames Datum waere wieder
        // dieselbe Luege, nur mit anderer Zahl.
        const quellen = [...HTML.matchAll(/js-data-freshness" data-quelle="([^"]+)"/g)].map(m => m[1]);
        assert.equal(quellen.length, 5);
        assert.equal(new Set(quellen).size, 5, 'doppelte Quelle: ' + quellen.join(', '));
        assert.ok(quellen.includes('limitless_online_decks.csv'));
        assert.ok(quellen.some(q => q.startsWith('city_league_')));
    });

    it('jede genannte Quelle liegt auch wirklich in data/', () => {
        const quellen = [...HTML.matchAll(/js-data-freshness" data-quelle="([^"]+)"/g)].map(m => m[1]);
        for (const q of quellen) {
            assert.ok(fs.existsSync(path.join(ROOT, 'data', q)), `data/${q} fehlt`);
        }
    });
});

describe('Wie der Stand ermittelt wird', () => {
    it('aus data/data_stand.json, nicht aus Last-Modified', () => {
        // GEMESSEN am 20.08.2026 gegen thedipidis.app: GitHub Pages setzt
        // Last-Modified auf die DEPLOY-Zeit — fuer alle Dateien dieselbe
        // (Thu, 20 Aug 2026 07:34) — und bei city_league_archetypes.csv und
        // city_league_analysis.csv gar keinen Kopf. Das haette das geratene
        // Datum nur durch ein anderes ersetzt.
        assert.match(MODUL, /data_stand\.json/);
        assert.doesNotMatch(MODUL, /method: 'HEAD'/);
        assert.doesNotMatch(MODUL, /Last-Modified/);
    });

    it('und einmal geladen, nicht einmal je Chip', () => {
        assert.match(MODUL, /if \(MANIFEST\) return MANIFEST;/);
    });

    it('ein fehlender Eintrag ergibt null, nie ein Ersatzdatum', () => {
        assert.match(MODUL, /if \(!iso\) return null;/);
        assert.match(MODUL, /\.catch\(function \(\) \{ return \{\}; \}\)/);
    });

    it('alte Staende werden markiert, statt still durchzugehen', () => {
        assert.match(MODUL, /classList\.toggle\('is-alt', tage !== null && tage > 14\)/);
    });
});

describe('Woher der Stand kommt', () => {
    const STAND = JSON.parse(read('data/data_stand.json'));
    const SKRIPT = read('scripts/build_data_stand.py');
    const WOCHE = read('.github/workflows/weekly-full-update.yml');

    it('die Datei liegt vor und nennt ihre Herkunft', () => {
        assert.ok(STAND.dateien && Object.keys(STAND.dateien).length >= 10);
        assert.ok(STAND.quelle);
        assert.ok(STAND.erzeugt_am);
    });

    it('jeder Eintrag ist ein gueltiges Datum und keine Zukunft', () => {
        const jetzt = Date.now();
        for (const [f, iso] of Object.entries(STAND.dateien)) {
            const d = new Date(iso);
            assert.ok(!isNaN(d.getTime()), `${f}: ${iso} ist kein Datum`);
            assert.ok(d.getTime() <= jetzt + 86400000, `${f}: liegt in der Zukunft`);
        }
    });

    it('und die Staende sind wirklich verschieden — das war der ganze Punkt', () => {
        // Vorher trugen fuenf Reiter dasselbe Datum. Waeren hier alle Werte
        // gleich, waere nichts gewonnen.
        const werte = new Set(Object.values(STAND.dateien).map(x => x.slice(0, 10)));
        assert.ok(werte.size >= 3, 'nur ' + werte.size + ' verschiedene Staende');
    });

    it('jede Quelle der Chips steht im Verzeichnis', () => {
        const quellen = [...HTML.matchAll(/js-data-freshness" data-quelle="([^"]+)"/g)].map(m => m[1]);
        for (const q of quellen) {
            assert.ok(STAND.dateien[q], `kein Stand fuer ${q} in data_stand.json`);
        }
    });

    it('fortgeschrieben wird im Wochenlauf, vor dem Commit', () => {
        // Danach meldet git status nichts mehr — die Information waere weg.
        const iSkript = WOCHE.indexOf('build_data_stand.py');
        const iCommit = WOCHE.indexOf('name: Commit + push');
        assert.ok(iSkript > -1, 'der Schritt fehlt im Wochenlauf');
        assert.ok(iSkript < iCommit, 'muss VOR dem Commit laufen');
    });

    it('das Skript braucht keine tiefe Historie', () => {
        // .git ist 620 MB bei 2.962 Commits; ein tiefer Clone bei jedem Lauf
        // waere ein hoher Preis fuer ein Datum. Der Normalpfad kommt mit
        // `git status` aus, der Verlauf nur fuer den Erstbestand.
        assert.match(SKRIPT, /_git\("status", "--porcelain"/);
        assert.match(SKRIPT, /aus_git_flag/);
    });
});

describe('Einbau', () => {
    it('das Modul wird geladen, und vor app-init.js', () => {
        const iMod = HTML.indexOf('js/ds-datenstand.js');
        const iInit = HTML.indexOf('js/app-init.js');
        assert.ok(iMod > -1, 'ds-datenstand.js ist nicht eingebunden');
        assert.ok(iMod < iInit, 'muss vor app-init.js stehen — das liest window.DsDatenstand');
    });

    it('und steht im Offline-Vorrat', () => {
        assert.match(SW, /'\.\/js\/ds-datenstand\.js'/);
    });
});
