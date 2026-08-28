/**
 * Das Post-Bild der Format-Staples.
 *
 * Gemeldet am 28.08.2026: "wenn wir ueber Karten reden muessen wir immer
 * die Kartenbilder mit anzeigen weil teilweise ja Karten gleich heissen
 * und man schneller sieht um welche Karte es geht und was die kann."
 * Ein Balken mit "Judge 75,0 %" sagt nicht, welche Judge gemeint ist.
 *
 * Zwei Dinge werden hier festgehalten:
 *
 *  1. Das Gitter bricht 15 Karten in drei volle Zeilen (fuenf Spalten).
 *     Sechs Spalten waeren 6+6+3 und lesen sich wie ein Rest.
 *  2. Faellt zu viel Kartenkunst aus, entsteht KEIN Bild. Der Abruf laeuft
 *     ueber einen einzigen Proxy; ohne diese Grenze koennte ein halb
 *     leeres Bild wortlos zum Speichern angeboten werden.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'ds-share.js'), 'utf8');

function schneide(kopf, bis) {
    const a = SRC.indexOf(kopf);
    assert.ok(a > -1, `Kopf nicht gefunden: ${kopf}`);
    const b = SRC.indexOf(bis, a);
    assert.ok(b > a, `Ende nicht gefunden: ${bis}`);
    return SRC.slice(a, b);
}

const GITTER = schneide('function staplesGitter(anzahl, breite, hoehe)',
                        '/* Der Streifen am Fuss jeder Kachel');
const staplesGitter = new Function(GITTER + '\nreturn staplesGitter;')();

describe('das Gitter der Staples-Kacheln', () => {
    it('legt 15 Karten in fuenf Spalten und drei volle Zeilen', () => {
        const m = staplesGitter(15, 1000, 760);
        assert.equal(m.spalten, 5);
        assert.equal(m.zeilen, 3);
        assert.equal(m.letzteZeile, 5, 'die letzte Zeile ist angebrochen');
    });

    it('haelt das echte Kartenformat ein', () => {
        const m = staplesGitter(15, 1000, 760);
        const verhaeltnis = m.kh / m.kb;
        assert.ok(Math.abs(verhaeltnis - 342 / 245) < 0.03,
            `Seitenverhaeltnis ${verhaeltnis.toFixed(3)} statt ${(342 / 245).toFixed(3)}`);
    });

    it('bleibt in der gegebenen Flaeche', () => {
        const m = staplesGitter(15, 1000, 760);
        assert.ok(m.spalten * m.kb + (m.spalten - 1) * m.gap <= 1000, 'zu breit');
        assert.ok(m.zeilen * m.kh + (m.zeilen - 1) * m.gap <= 760, 'zu hoch');
    });

    it('traegt auch 30 Karten, dann eben kleiner', () => {
        const klein = staplesGitter(30, 1000, 760);
        const gross = staplesGitter(15, 1000, 760);
        assert.ok(klein, '30 Karten passen gar nicht');
        assert.ok(klein.zeilen * klein.kh + (klein.zeilen - 1) * klein.gap <= 760);
        assert.notEqual(klein.kb, gross.kb);
        assert.ok(klein.kb < gross.kb, 'mehr Karten muessten kleinere Kacheln geben');
    });

    it('gibt nichts zurueck, wenn die Kacheln unter die Erkennbarkeit fallen', () => {
        // Lieber kein Gitter als 40 Karten in 20 px Breite.
        assert.equal(staplesGitter(40, 200, 90), null);
    });
});

describe('der Abbruch bei fehlender Kartenkunst', () => {
    const QUELLE = schneide('function shareStaplesPost(spec)', '\n    window.DsShare = {');

    function bau(bilder) {
        const gemeldet = [];
        const zaehler = { leinwaende: 0, ausgeliefert: 0 };
        const attrappen = {
            toast: (text, art) => gemeldet.push({ text, art }),
            L: (de) => de,
            spaceFacts: () => ({ format: 'TEF-PBL', source: 'Limitless Online', stamp: '28.08.2026' }),
            activeSpace: () => 'gl',
            today: () => '28.08.2026',
            markenBild: () => Promise.resolve(null),
            MC_BLUETEN: [],
            loadImage: (url) => Promise.resolve(bilder[url] === undefined ? {} : bilder[url]),
            staplesPostCanvas: () => { zaehler.leinwaende++; return {}; },
            deliver: () => { zaehler.ausgeliefert++; return true; },
            safeName: (s) => s,
            console: { error: () => {} },
        };
        const fabrik = new Function(...Object.keys(attrappen),
            QUELLE + '\nreturn shareStaplesPost;');
        return { fn: fabrik(...Object.values(attrappen)), gemeldet, zaehler };
    }

    const karten = (n) => Array.from({ length: n }, (_, i) =>
        ({ rang: i + 1, name: 'Karte ' + i, share: 50, url: 'u' + i }));

    it('macht ohne Karten gar nichts', async () => {
        const w = bau({});
        assert.equal(await w.fn({ karten: [] }), false);
        assert.equal(w.zaehler.leinwaende, 0, 'es wurde trotzdem gezeichnet');
        assert.equal(w.gemeldet.length, 1);
    });

    it('zeichnet bei vollstaendigen Bildern', async () => {
        const w = bau({});
        await w.fn({ karten: karten(15), titel: 'x' });
        assert.equal(w.zaehler.leinwaende, 1);
        assert.equal(w.zaehler.ausgeliefert, 1);
        assert.equal(w.gemeldet.length, 0, 'unnoetige Meldung');
    });

    it('nennt einzelne Luecken, liefert aber', async () => {
        const w = bau({ u3: null, u7: null });
        await w.fn({ karten: karten(15), titel: 'x' });
        assert.equal(w.zaehler.ausgeliefert, 1);
        assert.equal(w.gemeldet.length, 1);
        assert.equal(w.gemeldet[0].art, 'warning');
    });

    it('liefert nicht, wenn zu viel fehlt', async () => {
        const fehlt = {};
        for (let i = 0; i < 9; i++) fehlt['u' + i] = null;
        const w = bau(fehlt);
        assert.equal(await w.fn({ karten: karten(15), titel: 'x' }), false);
        assert.equal(w.zaehler.leinwaende, 0, 'es wurde trotzdem gezeichnet');
        assert.equal(w.zaehler.ausgeliefert, 0);
        assert.equal(w.gemeldet[0].art, 'error');
    });
});
