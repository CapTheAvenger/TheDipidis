/* test-masterclass.js — Zusicherungen fuer den Masterclass-Untertab.
 *
 * Drei Dinge sollen hier beissen:
 *
 *   1. VERHALTEN. Die Umschalter (Bereich, Matchup-Filter, Listenwahl)
 *      und die Auszeichnung der Begruendungen werden AUSGEFUEHRT, nicht
 *      im Quelltext gesucht. Eine Textzusicherung haette am 12.09.2026
 *      schon einmal nicht gebissen, weil der eigene Kommentar das
 *      gesuchte Muster enthielt.
 *   2. DATENLAGE. Das nachgeladene Stueck behauptet Zahlen — 60 Karten
 *      je Liste, genau ein ACE SPEC, Siegquoten mit Nenner. Das wird
 *      gegen die Datei gerechnet, nicht geglaubt.
 *   3. SPRACHE. Die Oberflaechen-Beschriftungen des Regals muessen in
 *      beiden Sprachen existieren; der Inhalt selbst ist erklaertermassen
 *      nur deutsch und traegt dafuer einen Hinweis.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const JS = fs.readFileSync(path.join(WURZEL, 'js', 'ds-masterclass.js'), 'utf8');
const FRAGMENT = fs.readFileSync(path.join(WURZEL, 'masterclass', 'mega-stalobor.de.html'), 'utf8');
const CSS = fs.readFileSync(path.join(WURZEL, 'css', 'masterclass.css'), 'utf8');
const INDEX = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(WURZEL, 'js', 'i18n.js'), 'utf8');
const SWITCH = fs.readFileSync(path.join(WURZEL, 'js', 'firebase-collection.js'), 'utf8');

/* Kommentare heraus, bevor Quelltext nach Zeichenketten durchsucht wird.
 * Ohne das macht der eigene Kommentar die Verfaelschungsprobe blind
 * (CLAUDE.md, 13./14.09.2026). */
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const JS_NACKT = ohneKommentare(JS);

/* Gegenprobe zum Ausschneiden selbst. */
test('das Kommentar-Ausschneiden entfernt nicht zu viel', () => {
    assert.ok(JS_NACKT.length > JS.length * 0.3,
        `nur noch ${JS_NACKT.length} von ${JS.length} Zeichen uebrig`);
});

/* ── Funktionen aus der Datei schneiden und wirklich ausfuehren ── */

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(treffer.index, i + 1);
        }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

function lade(...namen) {
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const ktx = { assert };
    vm.createContext(ktx);
    vm.runInContext(quelle + '\n;({' + namen.join(',') + '})', ktx);
    return vm.runInContext('({' + namen.join(',') + '})', ktx);
}

/* Ein winziger DOM-Ersatz: genau die vier Methoden, die die Umschalter
 * benutzen. Kein jsdom im Repo, und fuer drei Schleifen braucht es keins. */
function knoten(attrs, tag) {
    const a = Object.assign({}, attrs);
    return {
        tagName: tag || 'DIV',
        hidden: false,
        getAttribute: (k) => (k in a ? a[k] : null),
        setAttribute: (k, v) => { a[k] = String(v); },
        _attrs: a
    };
}
function wurzelMit(liste) {
    return {
        querySelectorAll: (sel) => liste.filter((n) => {
            const m = /^\[([^\]=]+)\]$/.exec(sel);
            if (m) return n.getAttribute(m[1]) !== null;
            const k = /^\.([\w-]+)$/.exec(sel);
            if (k) return (n._attrs.class || '').split(/\s+/).includes(k[1]);
            return false;
        })
    };
}

test('bereichWechseln zeigt genau einen Abschnitt und druckt genau einen Knopf', () => {
    const { bereichWechseln } = lade('bereichWechseln');
    const abschnitte = ['spick', 'matchups', 'listen', 'doku']
        .map((z) => knoten({ 'data-mcl-abschnitt': z }));
    const knoepfe = ['spick', 'matchups', 'listen', 'doku']
        .map((z) => knoten({ 'data-mcl-ziel': z }));
    bereichWechseln(wurzelMit(abschnitte.concat(knoepfe)), 'listen');
    assert.deepStrictEqual(abschnitte.map((a) => a.hidden), [true, true, false, true]);
    assert.deepStrictEqual(knoepfe.map((b) => b.getAttribute('aria-pressed')),
        ['false', 'false', 'true', 'false']);
});

test('matchupFilter blendet genau die andere Einstufung aus, "alle" zeigt wieder alles', () => {
    const { matchupFilter } = lade('matchupFilter');
    const mus = ['gut', 'schlecht', 'even', 'gut']
        .map((s) => knoten({ 'data-s': s, class: 'mcl-mu' }));
    const chips = ['alle', 'gut', 'even', 'schlecht']
        .map((f) => knoten({ 'data-mcl-filter': f }));
    const w = wurzelMit(mus.concat(chips));
    matchupFilter(w, 'gut');
    assert.deepStrictEqual(mus.map((m) => m.hidden), [false, true, true, false]);
    assert.strictEqual(chips[1].getAttribute('aria-pressed'), 'true');
    assert.strictEqual(chips[0].getAttribute('aria-pressed'), 'false');
    matchupFilter(w, 'alle');
    assert.deepStrictEqual(mus.map((m) => m.hidden), [false, false, false, false]);
});

test('listeWechseln zeigt genau einen Listenblock', () => {
    const { listeWechseln } = lade('listeWechseln');
    const bloecke = [0, 1, 2, 3, 4, 5].map((i) => knoten({ 'data-mcl-listenblock': String(i) }));
    const chips = [0, 1, 2, 3, 4, 5].map((i) => knoten({ 'data-mcl-liste': String(i) }));
    listeWechseln(wurzelMit(bloecke.concat(chips)), 4);
    assert.deepStrictEqual(bloecke.map((b) => b.hidden), [true, true, true, true, false, true]);
    assert.strictEqual(chips[4].getAttribute('aria-pressed'), 'true');
});

test('markiere maskiert HTML und laesst nur Fett und Kursiv durch', () => {
    const { markiere } = lade('markiere', 'esc');
    assert.strictEqual(markiere('**fett** und *kursiv*'), '<b>fett</b> und <i>kursiv</i>');
    const boese = markiere('<img src=x onerror="alert(1)">');
    assert.ok(!boese.includes('<img'), `HTML durchgelassen: ${boese}`);
    assert.ok(boese.includes('&lt;img'), `nicht maskiert: ${boese}`);
});

/* ── Was das Inhaltsstueck behauptet, muss darin auch stehen ── */

test('jede der sechs Listen fuehrt genau 60 Karten und genau ein ACE SPEC', () => {
    const bloecke = FRAGMENT.match(/data-mcl-listenblock="\d+"[\s\S]*?<\/div>\s*<p class="mcl-quelle">/g) || [];
    assert.strictEqual(bloecke.length, 6, `${bloecke.length} Listenbloecke gefunden, erwartet 6`);
    const ACE = ['Heldenumhang', 'Edler Rollwagen', 'Geheime Box'];
    bloecke.forEach((b, i) => {
        const anzahlen = [...b.matchAll(/data-n="(\d+)"/g)].map((m) => Number(m[1]));
        const summe = anzahlen.reduce((a, n) => a + n, 0);
        assert.strictEqual(summe, 60, `Liste ${i} hat ${summe} Karten`);
        const aces = ACE.filter((a) => b.includes(`data-de="${a}"`)).length;
        assert.strictEqual(aces, 1, `Liste ${i} hat ${aces} ACE SPEC`);
        const zuViel = [...b.matchAll(/data-de="([^"]+)" data-en="[^"]*" data-druck="[^"]*" data-n="(\d+)"/g)]
            .filter((m) => Number(m[2]) > 4 && !/Energie|Energy/.test(m[1]));
        assert.strictEqual(zuViel.length, 0,
            `Liste ${i}: mehr als 4 Kopien von ${zuViel.map((m) => m[1]).join(', ')}`);
    });
});

test('jede Siegquote im Stueck nennt ihren Nenner, oder sie nennt gar keine Zahl', () => {
    const zeilen = FRAGMENT.match(/<span class="mcl-wr">[\s\S]*?<\/span>/g) || [];
    assert.ok(zeilen.length >= 20, `nur ${zeilen.length} Matchup-Zeilen`);
    zeilen.forEach((z) => {
        const hatQuote = /\d+,\d+\s*%/.test(z);
        const hatNenner = /aus\s[\d.]+\sMatches/.test(z);
        const sagtOhne = z.includes('keine Ladder-Daten');
        assert.ok(hatQuote ? hatNenner : sagtOhne,
            `Zeile ohne Nenner und ohne Hinweis: ${z.slice(0, 120)}`);
    });
});

test('das Stueck nennt seine Quellen und behauptet keine eigenen Zahlen', () => {
    assert.ok(FRAGMENT.includes('limitless_online_decks_matchups.csv'),
        'die Matchup-Quelle fehlt');
    assert.ok(FRAGMENT.includes('limitless_online_decks.csv'),
        'die Feldanteil-Quelle fehlt');
});

/* ── Einbindung und Sprache ── */

test('index.html traegt Huelle, Knopf, CSS und Skript', () => {
    assert.ok(/id="profile-masterclass"/.test(INDEX), 'Huelle fehlt');
    assert.ok(/id="masterclassHost"/.test(INDEX), 'Host-Knoten fehlt');
    assert.ok(/switchProfileTab\('masterclass'\)/.test(INDEX), 'Knopf fehlt');
    assert.ok(/css\/masterclass\.css\?v=/.test(INDEX), 'CSS nicht eingebunden');
    assert.ok(/js\/ds-masterclass\.js\?v=/.test(INDEX), 'Skript nicht eingebunden');
});

test('switchProfileTab zeichnet das Regal', () => {
    const fn = schneideFunktion(SWITCH, 'switchProfileTab');
    const nackt = ohneKommentare(fn);
    assert.ok(nackt.includes("tabName === 'masterclass'"),
        'der Einstieg fehlt in switchProfileTab');
    assert.ok(nackt.includes('DsMasterclass'), 'DsMasterclass wird nicht gerufen');
});

test('die Beschriftungen des Regals gibt es in beiden Sprachen', () => {
    ['mcl.tab', 'mcl.title'].forEach((k) => {
        const n = (I18N.match(new RegExp(`'${k.replace('.', '\\.')}'`, 'g')) || []).length;
        assert.strictEqual(n, 2, `${k} kommt ${n}-mal vor, erwartet 2 (en und de)`);
    });
    const txt = JS_NACKT.slice(JS_NACKT.indexOf('var TXT'), JS_NACKT.indexOf('function lang'));
    const de = (txt.match(/de:\s*\{[\s\S]*?\}/) || [''])[0];
    const en = (txt.match(/en:\s*\{[\s\S]*?\}/) || [''])[0];
    const schluessel = (b) => (b.match(/(\w+):\s*'/g) || []).map((x) => x.replace(/:\s*'$/, ''));
    assert.deepStrictEqual(schluessel(de).sort(), schluessel(en).sort(),
        'die Beschriftungen unterscheiden sich zwischen de und en');
    assert.ok(schluessel(de).length >= 12, `nur ${schluessel(de).length} Beschriftungen`);
});

test('die nur-deutsche Aufbereitung sagt das auch, statt es zu verschweigen', () => {
    assert.ok(JS_NACKT.includes('nurDe'), 'der Hinweis fehlt');
    assert.ok(/sprachen:\s*\['de'\]/.test(JS_NACKT),
        'der Guide gibt seine Sprachen nicht an');
    assert.ok(JS_NACKT.includes("g.sprachen.indexOf(lang()) === -1"),
        'der Hinweis haengt an keiner Bedingung');
});

test('die CSS kommt ohne !important aus und faerbt ueber Tokens', () => {
    /* Die Kommentare muessen raus, BEVOR gezaehlt wird: der Kopfkommentar
     * dieser CSS-Datei sagt selbst "Kein !important in dieser Datei" und
     * haette die Zusicherung sonst rot gemacht, ohne dass eine Regel
     * !important benutzt. Genau die Falle aus CLAUDE.md, nur andersherum. */
    const cssNackt = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(cssNackt.length > CSS.length * 0.3,
        `das Ausschneiden hat zu viel entfernt: ${cssNackt.length} von ${CSS.length}`);
    assert.strictEqual((cssNackt.match(/!important/g) || []).length, 0,
        '!important in css/masterclass.css');
    assert.ok(cssNackt.includes(':root[data-theme="dark"] #masterclassHost'),
        'kein Dunkelmodus fuer die Ampelfarben');
    ['--surface-1', '--line', '--ink-2', '--r-md'].forEach((t) => {
        assert.ok(cssNackt.includes(`var(${t})`), `Token ${t} wird nicht benutzt`);
    });
});
