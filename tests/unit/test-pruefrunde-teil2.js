/**
 * Prüfrunde vom 18.08.2026 — Teil 2: Meta Call sagt, worauf er beruht,
 * und der Startvorgang lädt nichts zweimal.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const MC = read('js/app-meta-call.js');
const MC_CODE = stripJs(MC);
const CORE = read('js/app-core.js');
const CORE_CODE = stripJs(CORE);
const I18N = read('js/i18n.js');

describe('Meta Call — der Vorhersage-Streifen ist verdrahtet', () => {
    // Er existierte samt Stylesheet (css/meta-call.css:1646) und wurde
    // von keiner Stelle aufgerufen. Nachgemessen: 0 Aufrufe im ganzen
    // Projekt. Ohne ihn verwirft die Maschine still 4.520 von 4.667
    // Turnierzeilen, läuft im reinen Ladder-Modus weiter, und im
    // sichtbaren Text steht davon kein Wort.
    it('renderPredictorBanner wird aufgerufen, nicht nur definiert', () => {
        const aufrufe = (MC_CODE.match(/renderPredictorBanner\(\)/g) || []).length;
        const definitionen = (MC_CODE.match(/function renderPredictorBanner\(\)/g) || []).length;
        assert.strictEqual(definitionen, 1);
        assert.ok(aufrufe >= 2, `nur ${aufrufe} Vorkommen — er wird wieder nicht aufgerufen`);
    });

    it('er steht im Aufbau von renderAll', () => {
        const fn = /function renderAll\(\)[\s\S]*?\n  \}/.exec(MC_CODE);
        assert.ok(fn, 'renderAll nicht gefunden');
        assert.match(fn[0], /renderPredictorBanner\(\)/);
    });

    it('der große Operator-Streifen bleibt aus', () => {
        // Am 12.06.2026 mit Grund abgeschaltet: "Data window: from
        // 2026-05-22 onwards · 4520 of 4585 rows excluded" ist
        // Maschinenzustand, keine Nutzeraussage. Ihn wieder
        // einzuschalten wäre derselbe Fehler.
        const fn = /function renderAll\(\)[\s\S]*?\n  \}/.exec(MC_CODE)[0];
        assert.ok(!/\$\{_renderPredictorStatusBanner\(\)\}/.test(fn));
    });
});

describe('Meta Call — Diagnose ist abschaltbar und aus', () => {
    it('die Diagnose-Marken hängen an einem Schalter', () => {
        assert.match(MC_CODE, /let _showDiagnostics = false;/);
        assert.match(MC_CODE, /const _diag = !!_showDiagnostics;/);
    });

    it('Quelle und aktive Rotation erscheinen nur mit eingeschalteter Diagnose', () => {
        const fn = /function renderPredictorBanner\(\)[\s\S]*?\n  \}/.exec(MC_CODE)[0];
        assert.match(fn, /const sourceTag = !_diag \? ''/);
        assert.match(fn, /const activeTag = \(_diag &&/);
    });

    it('der Schalter ist nach außen gegeben', () => {
        assert.match(MC_CODE, /setDiagnostics:/);
    });
});

describe('Meta Call — die Marken sprechen die Sprache des Nutzers', () => {
    // Der Streifen hätte deutschen Spielern englischen Fachjargon
    // gezeigt: "lag window: PBL online-only · TEF labs ignored".
    const schluessel = ['mc.bannerLagWindow', 'mc.bannerLagWindowHelp',
                        'mc.bannerDataDate', 'mc.bannerDataStale', 'mc.bannerDataHelp'];

    it('jeder neue Schlüssel steht in beiden Sprachen', () => {
        for (const k of schluessel) {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${k} steht ${n}x, erwartet 2`);
        }
    });

    it('kein englischer Festtext mehr in den sichtbaren Marken', () => {
        const fn = /function renderPredictorBanner\(\)[\s\S]*?\n  \}/.exec(MC_CODE)[0];
        assert.ok(!/lag window:/.test(fn), 'englischer Festtext im Lag-Chip');
        assert.ok(!/⚠ STALE/.test(fn), '"STALE" sagt einem Spieler nichts');
        assert.match(fn, /t\('mc\.bannerLagWindow'\)/);
        assert.match(fn, /t\('mc\.bannerDataDate'\)|t\('mc\.bannerDataStale'\)/);
    });

    it('der Alterungshinweis behauptet keine Ursache', () => {
        // Der englische Originaltext sagte "browser is serving cached
        // data — hard-reload to refresh". Nachgemessen stimmt das
        // nicht: labs_tournament_decks.csv trägt scraped_at 2026-07-29
        // und liegt seit dem 31.07. unverändert im Repo. Ein Neuladen
        // ändert daran nichts, und Majors sind ohnehin selten.
        for (const s of ['mc.bannerDataStale', 'mc.bannerDataHelp']) {
            const re = new RegExp("'" + s.replace('.', '\\.') + "':\\s*'([^']*)'", 'g');
            let m;
            while ((m = re.exec(I18N)) !== null) {
                assert.ok(!/cach|zwischengespeichert|hard-reload|Strg\+Umschalt/i.test(m[1]),
                    `${s} behauptet eine Ursache: ${m[1]}`);
            }
        }
    });
});

describe('Startvorgang — die Kartendatenbank lädt genau einmal', () => {
    // Gemessen am 18.08.2026: loadAllCardsDatabase lief zweimal
    // gleichzeitig — einmal aus dem Startablauf, einmal aus
    // ensureProxyManualSearchReady. Beide sahen eine leere Liste,
    // beide luden dieselben drei Pakete:
    //   standard 3,1 MB bei 1249 und 1250 ms
    //   extended 3,4 MB bei 1371 und 1472 ms
    //   legacy   9,3 MB bei 1620 und 1634 ms
    // 16,3 von 17,0 MB, die der Start umsonst überträgt.
    it('es gibt eine Wache gegen den zweiten gleichzeitigen Lauf', () => {
        assert.match(CORE_CODE, /let _cardDbLaeuft = null;/);
        assert.match(CORE_CODE, /if \(!force && _cardDbLaeuft\) return _cardDbLaeuft;/);
    });

    it('die eigentliche Arbeit liegt in einer eigenen Funktion', () => {
        assert.match(CORE_CODE, /async function _loadAllCardsDatabaseImpl\(options\)/);
        assert.match(CORE_CODE, /_loadAllCardsDatabaseImpl\(options\)/);
    });

    it('die Wache gibt sich nach dem Lauf wieder frei', () => {
        // Sonst liefert ein späterer Aufruf ewig dasselbe alte Ergebnis.
        assert.match(CORE_CODE, /\.finally\(function \(\) \{ if \(_cardDbLaeuft === lauf\) _cardDbLaeuft = null; \}\)/);
    });

    it('force: true umgeht sie — der Aktualisieren-Knopf soll wirklich laden', () => {
        assert.match(CORE_CODE, /const force = !!\(options && options\.force\);/);
        assert.match(CORE_CODE, /if \(!force\) _cardDbLaeuft = lauf;/);
        assert.match(CORE_CODE, /loadAllCardsDatabase\(\{ force: true \}\)/);
    });

    it('window.cardDBReady ist ein Versprechen, auf das andere warten können', () => {
        assert.match(CORE_CODE, /window\.cardDBReady = new Promise/);
        assert.match(CORE_CODE, /_resolveCardDBReady\(true\)/);
    });
});

describe('Meta Call — die Spalte heisst, was sie zeigt', () => {
    // Sie hiess "Online %" und zeigte d.onlineShare — das ist seit
    // js/app-meta-call.js:3916 (d.onlineShare = d.predictedShare) die
    // Modellausgabe, nicht der rohe Anteil. Gemessen am 18.08.2026,
    // Zeile Dragapult: Spalte 13,10 %, Detailzeile derselben Zeile
    // "Online-Share heute 7,1 %", Quelldatei limitless_online_decks.csv
    // 7,06 %. Faktor 1,86. Der Tooltip nannte sie dabei "die Basisdaten".
    it('der Spaltenkopf heisst nicht mehr "Online %"', () => {
        for (const m of I18N.matchAll(/'mc\.headerOnline':\s*'([^']*)'/g)) {
            assert.notStrictEqual(m[1].trim(), 'Online %');
        }
    });

    it('er steht in beiden Sprachen und meint eine Prognose', () => {
        const werte = [...I18N.matchAll(/'mc\.headerOnline':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(werte.length, 2);
        for (const w of werte) assert.match(w, /Prognose|Predicted|Forecast/i);
    });

    it('der Tooltip behauptet nicht mehr, es seien die Basisdaten', () => {
        for (const m of I18N.matchAll(/'mc\.headerOnlineTooltip':\s*'([^']*)'/g)) {
            assert.ok(!/baseline data point|die Basisdaten\.?'?$/i.test(m[1]),
                'Tooltip nennt die Modellausgabe weiter Basisdaten');
            assert.match(m[1], /NOT the raw|NICHT der rohe/,
                'der Tooltip muss den Unterschied benennen, sonst bleibt die Verwechslung');
        }
    });
});
