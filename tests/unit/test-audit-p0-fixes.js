/**
 * Regressionstests für die P0-Fixes aus dem 7-Perspektiven-Audit (15.08.2026).
 *
 * Diese Tests prüfen bewusst die QUELLDATEIEN und nicht nachgebaute Kopien der
 * Logik. Das Audit hat gezeigt, wohin Spiegel-Reimplementierungen führen: die
 * 13 Meta-Call-Unit-Tests waren grün, während eine der geprüften Funktionen im
 * Produktivcode seit Monaten auskommentiert war.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let bestanden = 0;
function pruefe(name, fn) {
    try {
        fn();
        bestanden++;
    } catch (err) {
        console.error(`FAIL: ${name}\n  ${err.message}`);
        process.exitCode = 1;
    }
}

// ---------------------------------------------------------------------------
// 1. Startseiten-Hero: Überschrift und erste Kachel dürfen sich nicht
//    widersprechen, und die Überschrift braucht eine tragfähige Stichprobe.
// ---------------------------------------------------------------------------
const hub = read('js/meta-analysis-hub.js');

pruefe('Hero: Mindeststichprobe für die Überschrift ist >= 100', () => {
    const m = hub.match(/HEADLINE_MIN_BROUGHT\s*=\s*(\d+)/);
    assert.ok(m, 'HEADLINE_MIN_BROUGHT nicht gefunden');
    assert.ok(Number(m[1]) >= 100,
        `Mindeststichprobe ${m[1]} zu niedrig — Toxtricity Box wurde mit 53 Antritten zum "stärksten Deck" gekürt`);
});

pruefe('Hero: die Überschrift nennt die Stichprobe', () => {
    // Geprueft wird die Aussage, nicht der Variablenname: der Satz muss die
    // Zahl der Antritte nennen. Seit dem 19.08.2026 nennt er zusaetzlich die
    // absolute Zahl der Top-8-Plaetze ("78 von 772"), weil "n = 772" als
    // Rechnerjargon beanstandet wurde.
    assert.ok(/von \$\{\w+\} Antritten/.test(hub), 'deutscher Satz nennt die Antritte nicht');
    assert.ok(/of \$\{\w+\} entries/.test(hub), 'englischer Satz nennt die Antritte nicht');
    assert.ok(/\$\{cuts\} von/.test(hub), 'die absolute Zahl der Top-8-Plaetze fehlt');
    assert.ok(!/n = \$\{/.test(hub), '"n = " ist wieder da — bitte ausschreiben');
});

pruefe('Hero: das Deck aus der Überschrift steht als erste Kachel', () => {
    assert.ok(/const headline = \(conv\.decks \|\| \[\]\)/.test(hub), 'headline wird nicht bestimmt');
    assert.ok(/role: 'best'/.test(hub), 'erste Kachel wird nicht als "best" markiert');
    assert.ok(/role: 'played'/.test(hub), 'übrige Kacheln werden nicht als "played" markiert');
});

pruefe('Hero: jede Kachel trägt eine Rollen-Zeile', () => {
    assert.ok(/ds-stat-role/.test(hub), 'Rollen-Zeile fehlt im Markup');
    assert.ok(/ds-stat-role/.test(read('css/components.css')), 'Rollen-Zeile hat kein CSS');
});

// ---------------------------------------------------------------------------
// 2. Top-8-Panel: sortiert nach der Zahl, die es anzeigt.
// ---------------------------------------------------------------------------
const tier = read('js/app-tier-meta.js');

// Diese Prüfung hing an `top8Top` — einer von drei Ranglisten, die am
// 19.08.2026 in der Meta-Performance-Tabelle aufgegangen sind. Die
// Variablen blieben als toter Code stehen, die Prüfung blieb grün, und
// die Schranke, die sie bezeugte, wirkte in keiner gerenderten Zeile
// mehr. Am 20.08. sind die toten Variablen weg; geprüft wird jetzt die
// Tabelle, die es wirklich gibt.
pruefe('Meta-Performance: sortierbar nach jeder angezeigten Spalte', () => {
    const m = tier.match(/const SPALTEN = \[[\s\S]*?\n                    \];/);
    assert.ok(m, 'SPALTEN-Definition nicht gefunden');
    for (const k of ['listen', 'anteil', 'wr', 'antritte', 'cuts', 'quote', 'faktor']) {
        assert.ok(m[0].includes(`k: '${k}'`), `Spalte ${k} fehlt`);
    }
    assert.ok(/data-rang-spalte="\$\{c\.k\}"/.test(tier),
        'die Spaltenköpfe tragen keinen Sortierschlüssel');
});

pruefe('Meta-Performance: keine Faktor-Zahl unter der Mindeststichprobe', () => {
    assert.ok(!/const (top8Top|convTop|overallTop)\s*=/.test(tier),
        'die toten Ranglisten sind zurück — mit ihnen ein Test auf Code, der nichts rendert');
    const zelle = tier.match(/const zelle = \(r, k\) => \{[\s\S]*?\n                    \};/);
    assert.ok(zelle, 'Zellenfunktion nicht gefunden');
    assert.ok(/if \(!\(r\.antritte >= CONV_MIN_N\)\)/.test(zelle[0]),
        'die Faktor-Spalte kennt keine Untergrenze — 23 Decks ohne einen Cut zeigten "1,0-mal"');
});

// ---------------------------------------------------------------------------
// 3. Sitzungswechsel: alle Nutzer-Globals werden zurückgesetzt.
// ---------------------------------------------------------------------------
const globals = read('js/firebase-globals.js');

pruefe('clearUserData: setzt auch die Tradelist-Globals zurück', () => {
    const m = globals.match(/const USER_STATE_SLOTS = \{[\s\S]*?\n\};/);
    assert.ok(m, 'USER_STATE_SLOTS nicht gefunden');
    const tabelle = m[0];
    for (const key of ['userTradelist', 'userTradelistCounts', 'userTradelistMinPrices']) {
        assert.ok(tabelle.includes(key),
            `${key} fehlt — nach dem Abmelden blieben die Tausch-Marker des Vorbenutzers stehen`);
    }
});

pruefe('clearUserData: kennt jedes window.user*-Global aus dem Quellcode', () => {
    const jsDir = path.join(ROOT, 'js');
    const dateien = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    const gefunden = new Set();
    for (const f of dateien) {
        const inhalt = fs.readFileSync(path.join(jsDir, f), 'utf8');
        for (const m of inhalt.matchAll(/window\.(user[A-Za-z]+)/g)) gefunden.add(m[1]);
    }
    // userDataLoaded ist ein Ladezustand, kein Nutzerinhalt — es wird separat
    // zurückgesetzt und steht bewusst nicht in der Tabelle.
    gefunden.delete('userDataLoaded');
    const tabelle = globals.match(/const USER_STATE_SLOTS = \{[\s\S]*?\n\};/)[0];
    const fehlend = [...gefunden].filter(k => !tabelle.includes(k));
    assert.deepStrictEqual(fehlend, [],
        `nicht zurückgesetzte Nutzer-Globals: ${fehlend.join(', ')}`);
    assert.ok(/window\.userDataLoaded = false/.test(globals),
        'userDataLoaded wird nicht zurückgesetzt');
});

// ---------------------------------------------------------------------------
// 4. Dex-Import: kann die Sammlung nicht mehr unbemerkt löschen.
// ---------------------------------------------------------------------------
const collection = read('js/firebase-collection.js');

pruefe('Dex-Import: bricht ab, solange die Nutzerdaten nicht geladen sind', () => {
    const m = collection.match(/async function dexImportExecute\(mode\)[\s\S]{0,2000}?showNotification\([^)]*Importiere/);
    assert.ok(m, 'dexImportExecute nicht gefunden');
    assert.ok(/window\.userDataLoaded !== true/.test(m[0]),
        'kein userDataLoaded-Guard — ein Import vor dem Laden überschreibt die Sammlung serverseitig');
});

pruefe('Dex-Import: "Ersetzen" fragt vorher nach', () => {
    const m = collection.match(/async function dexImportExecute\(mode\)[\s\S]{0,2500}?modal\.remove\(\)/);
    assert.ok(m, 'dexImportExecute nicht gefunden');
    assert.ok(/mode === 'replace'[\s\S]{0,600}?confirm\(/.test(m[0]),
        'kein confirm() vor dem Ersetzen — clearCollection() fragt für denselben Effekt nach');
});

// ---------------------------------------------------------------------------
// 5. PTCGL-Knöpfe: auf Touch unterscheidbar (kein Tooltip ohne Hover).
// ---------------------------------------------------------------------------
pruefe('PTCGL: Import- und Export-Knopf tragen verschiedene Beschriftungen', () => {
    const i18n = read('js/i18n.js');
    const imp = [...i18n.matchAll(/'btn\.importPTCGL':\s*'([^']*)'/g)].map(m => m[1]);
    const exp = [...i18n.matchAll(/'btn\.exportPTCGL':\s*'([^']*)'/g)].map(m => m[1]);
    assert.ok(imp.length && exp.length, 'PTCGL-Keys nicht gefunden');
    imp.forEach((label, i) => {
        assert.notStrictEqual(label, exp[i],
            'Import und Export heißen gleich — auf Mobil gibt es keinen Tooltip, und einer der beiden ersetzt das Deck');
    });
});

// ---------------------------------------------------------------------------
// 6. Battle Journal: keine Quote ohne Spiele.
// ---------------------------------------------------------------------------
pruefe('Journal: zeigt bei 0 Spielen "—" statt "0 %"', () => {
    const bj = read('js/battle-journal.js');
    assert.ok(/const winRateLabel = total > 0 \?[^:]*: '—'/.test(bj),
        '0/0 wird weiterhin als 0 % dargestellt');
});

// ---------------------------------------------------------------------------
// 7. CSP: der Host, den das Frontend per fetch() anspricht, ist erlaubt.
// ---------------------------------------------------------------------------
pruefe('CSP: pokemonproxies.com steht in connect-src', () => {
    const html = read('index.html');
    const csp = html.match(/connect-src[^;]*/);
    assert.ok(csp, 'connect-src nicht gefunden');
    assert.ok(/pokemonproxies\.com/.test(csp[0]),
        'Host fehlt — die Konsole füllt sich in Produktion mit "Refused to connect"');
});

console.log(`\nAudit-P0-Fixes: ${bestanden} Prüfungen bestanden${process.exitCode ? ' (mit Fehlern)' : ''}`);
