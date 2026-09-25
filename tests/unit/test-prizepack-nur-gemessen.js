/* test-prizepack-nur-gemessen.js — ohne Messung kein Stempelbild.
 *
 * BEFUND (Betreiber, 25.09.2026, Bildschirmfoto): im Rarity Switcher von
 * Metang stand als dritte Wahl
 *
 *     „Prize-Pack-Print (gestempelt) · Prize-Pack-Serie 7 · TEF 114"
 *
 * und darunter das Artwork von Benesaru (Munkidori).
 *
 * URSACHE: die Galerienummer, aus der die Bildadresse gebaut wird, kommt
 * aus der ZEILENNUMMER der offiziellen PDF-Kartenliste. Geprueft war das
 * an einer Karte. Eine um eins verschobene Liste hat keine Luecke und
 * sieht richtig aus.
 *
 * Geprueft wird hier das VERHALTEN der Sperre (ausgefuehrt, nicht im
 * Quelltext gesucht) und die Gegenprobe dazu: der Eintrag selbst bleibt
 * stehen, denn Name, Preis und Kaufadresse haengen nicht an der
 * Galerienummer — eine Prize-Pack-Karte in der Sammlung muss weiter
 * auffindbar und bewertbar sein.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const KERN = fs.readFileSync(path.join(WURZEL, 'js', 'app-core.js'), 'utf8');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(treffer.index, i + 1); }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

function ladeSperre() {
    const ktx = { assert, devLog: () => {} };
    vm.createContext(ktx);
    vm.runInContext(schneideFunktion(KERN, 'nurNachgemesseneStempelbilder'), ktx);
    return vm.runInContext('nurNachgemesseneStempelbilder', ktx);
}

const eintrag = (o) => Object.assign({
    series: '7', num: '41', en: 'https://cdn.invalid/EN_41-2x.png',
    de: 'https://cdn.invalid/DE_41-2x.png', name_en: 'Metang', name_de: 'Metang',
    idProduct: '842676', price: 1.31, market_url: 'https://cardmarket.invalid/metang'
}, o);

test('ohne Messung wird das Stempelbild nicht gezeigt', () => {
    const sperre = ladeSperre();
    const idx = sperre({ 'TEF-114': eintrag({}) });
    assert.strictEqual(idx['TEF-114'].en, '', 'ein ungemessenes Bild wird gezeigt');
    assert.strictEqual(idx['TEF-114'].de, '');
});

test('ein nachgemessenes Bild bleibt', () => {
    const sperre = ladeSperre();
    const idx = sperre({ 'TEF-114': eintrag({ geprueft: true, pruefung: 'OK' }) });
    assert.strictEqual(idx['TEF-114'].en, 'https://cdn.invalid/EN_41-2x.png');
});

test('„FALSCH" gilt nicht als Messung, die es zeigen darf', () => {
    const sperre = ladeSperre();
    const idx = sperre({
        'TEF-114': eintrag({ geprueft: false, pruefung: 'FALSCH: Bild 42 passt besser (Versatz +1)' })
    });
    assert.strictEqual(idx['TEF-114'].en, '');
});

test('nur ein echtes true zaehlt — kein „truthy"', () => {
    const sperre = ladeSperre();
    ['ja', 1, 'true', {}, [], 'OK'].forEach((wert) => {
        const idx = sperre({ 'TEF-114': eintrag({ geprueft: wert }) });
        assert.strictEqual(idx['TEF-114'].en, '',
            `geprueft=${JSON.stringify(wert)} hat das Bild durchgelassen`);
    });
});

test('der Eintrag selbst bleibt vollstaendig — Sammlung und Preis haengen nicht am Bild', () => {
    const sperre = ladeSperre();
    const idx = sperre({ 'TEF-114': eintrag({}) });
    const e = idx['TEF-114'];
    assert.strictEqual(e.name_en, 'Metang');
    assert.strictEqual(e.series, '7');
    assert.strictEqual(e.num, '41', 'die Galerienummer wurde stillschweigend berichtigt');
    assert.strictEqual(e.price, 1.31);
    assert.strictEqual(e.idProduct, '842676');
    assert.strictEqual(e.market_url, 'https://cardmarket.invalid/metang');
});

test('gemischt: nur die gemessenen kommen durch', () => {
    const sperre = ladeSperre();
    const idx = sperre({
        'TEF-114': eintrag({ num: '41' }),
        'TWM-95': eintrag({ num: '42', name_en: 'Munkidori', geprueft: true }),
        'SCR-107': eintrag({ num: '1', name_en: 'Archaludon', geprueft: true }),
        'kaputt': null,
    });
    assert.strictEqual(idx['TEF-114'].en, '');
    assert.ok(idx['TWM-95'].en, 'ein gemessenes Bild wurde mitverboten');
    assert.ok(idx['SCR-107'].en);
});

/* Und die Folge im Bestand: die drei Stellen, die ein Stempelbild
 * zeigen, fragen alle nur `e.en || e.de` — eine leere Adresse heisst
 * dort schon „keine Kachel". Das ist kein Textbeweis fuer Verhalten,
 * sondern die Zusicherung, dass die Sperre an der richtigen Stelle
 * sitzt: sie waere wirkungslos, wenn eine dieser Stellen sich das Bild
 * woanders holte. */
test('die Kacheln haengen am Bild des Eintrags, nicht an einer eigenen Adresse', () => {
    const dateien = {
        'js/app-cards-db.js': [/const stamped = e && \(e\.en \|\| e\.de\)/,
                               /const stampedUrl = e\.en \|\| e\.de \|\| ''/],
        'js/app-deck-builder.js': [/_ppsEntry\.en \|\| _ppsEntry\.de \|\| ''/],
    };
    Object.entries(dateien).forEach(([datei, muster]) => {
        const text = fs.readFileSync(path.join(WURZEL, datei), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        muster.forEach((m) => assert.ok(m.test(text),
            `${datei}: ${m} nicht gefunden — holt die Kachel ihr Bild inzwischen woanders?`));
    });
});

test('der Lader legt die Sperre auch tatsaechlich ein', () => {
    /* Ohne diese Zeile waere die Sperre gebaut und wirkungslos — der
     * Index kaeme roh aus der Datei. */
    const text = KERN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    assert.ok(/window\.prizePackImagesIndex = nurNachgemesseneStempelbilder\(json\);/.test(text),
        'der Prize-Pack-Index wird ohne Messung uebernommen');
    assert.ok(!/window\.prizePackImagesIndex = json;/.test(text),
        'es gibt weiterhin einen Weg, den rohen Index zu setzen');
});

test('ein Druck ohne Bild wird trotzdem eingetragen (Sammlung, Preis)', () => {
    /* Der Absatz im Bestand sagt es ausdruecklich: ohne Eintrag im
     * Kartenregister wurde eine besessene Prize-Pack-Karte „gezaehlt,
     * aber nie gezeichnet und mit 0 € bewertet". Die Sperre darf das
     * nicht zurueckholen. */
    const text = KERN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    assert.ok(/if \(!num\) continue;/.test(text),
        'der Eintrag haengt wieder am Bild — besessene Karten waeren mit 0 € bewertet');
    assert.ok(/rows\.push\(\{ ppsSet, num, img: img \|\| '', entry: e, baseSet \}\)/.test(text),
        'die Zeile fuer das Kartenregister fehlt oder hat eine andere Form');
});

/* ── Ein Eintrag, der auf die falsche Karte zeigt ────────────────── */
/*
 * BEFUND (25.09.2026, ohne Netz an den echten Daten gemessen): neun von
 * 225 Eintraegen zeigen auf einen anderen Druck, als ihr Name sagt —
 * sieben mit dem Setcode SHF statt SFA (Shrouded Fable), zwei mit PLF.
 * „Night Stretcher" haengt damit an „Rusted Shield". Bild, Preis und
 * Kaufadresse landen auf der falschen Karte, und das hat mit der
 * Galerienummer gar nichts zu tun.
 */
test('ein Eintrag mit falschem Druck wird gar nicht erst gefuehrt', () => {
    const sperre = ladeSperre();
    const idx = sperre({
        'SHF-61': eintrag({ name_en: 'Night Stretcher', geprueft: true,
                            schluessel: 'FALSCH: die Datenbank fuehrt hier „Rusted Shield“' }),
        'TEF-114': eintrag({ geprueft: true, schluessel: 'OK' })
    });
    assert.ok(!('SHF-61' in idx), 'der falsche Eintrag ist noch da — Preis und Bild '
        + 'haengen dann an einer fremden Karte');
    assert.ok(idx['TEF-114'], 'der richtige Eintrag ist mit verschwunden');
});

test('ein Eintrag ohne Schluesselurteil bleibt — geurteilt wird nur, was gemessen ist', () => {
    const sperre = ladeSperre();
    const idx = sperre({ 'TEF-114': eintrag({ geprueft: true }) });
    assert.ok(idx['TEF-114'], 'ein Eintrag ohne Urteil wurde weggeworfen');
    assert.strictEqual(idx['TEF-114'].en, 'https://cdn.invalid/EN_41-2x.png');
});

test('„UNBEKANNT" ist kein „FALSCH"', () => {
    const sperre = ladeSperre();
    const idx = sperre({
        'XYZ-1': eintrag({ geprueft: true, schluessel: 'UNBEKANNT: dieser Druck steht nicht in der Kartendatenbank' })
    });
    assert.ok(idx['XYZ-1'], 'ein ungeklaerter Eintrag wurde wie ein falscher behandelt');
});
