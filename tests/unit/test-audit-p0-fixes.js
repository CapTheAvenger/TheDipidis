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
    assert.ok(/von \$\{n\} Antritten/.test(hub), 'deutscher Satz nennt n nicht');
    assert.ok(/of \$\{n\} entries/.test(hub), 'englischer Satz nennt n nicht');
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

pruefe('Top-8-Panel: sortiert nach der angezeigten Quote, nicht nach Absolutzahl', () => {
    const m = tier.match(/const top8Top\s*=[\s\S]{0,400}?\.slice\(0, 12\)/);
    assert.ok(m, 'top8Top-Definition nicht gefunden');
    const block = m[0];
    assert.ok(/\.sort\(\(a, b\) => b\.top8ConvPct - a\.top8ConvPct/.test(block),
        'sortiert nicht primär nach top8ConvPct — genau der Fall, der wie ein kaputtes Ranking aussah');
    assert.ok(/CONV_MIN_N/.test(block),
        'keine Mindeststichprobe — 2-Antritts-Decks mit 50 % würden die Liste anführen');
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
