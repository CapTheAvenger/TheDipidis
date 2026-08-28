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

describe('die gesperrte Kopfzeile', () => {
    const KOPF = schneide('function malMetaCallKopf(ctx, spec, logo)', '\n    function malMetaCallFuss');

    /* Eine Leinwand-Attrappe, die nur misst: gesperrte Monoschrift,
     * Breite = Zeichen x 0.62 x Schriftgroesse. Nah genug am echten
     * Verhalten, um die Schrumpfschleife zu pruefen. */
    function malen(kicker) {
        const rufe = [];
        const ctx = {
            _px: 24,
            set font(v) { const m = String(v).match(/(\d+)px/); if (m) this._px = +m[1]; },
            get font() { return this._px + 'px'; },
            measureText: (t) => ({ width: String(t).length * 0.62 * ctx._px }),
            fillText: (t) => { rufe.push({ t: t, px: ctx._px }); },
            textBaseline: '', fillStyle: '',
        };
        const attrappen = {
            MC_FARBEN: { holz: '#E3B276', creme: '#F7EFE4' },
            fMono: (g) => g + 'px mono', fSans: (g) => g + 'px sans',
            clip: (c, t, w) => (c.measureText(t).width <= w
                ? t : t.slice(0, Math.floor(w / (0.62 * c._px))) + '\u2026'),
            malLogo: () => {}, MP: { W: 1080 },
        };
        const fn = new Function(...Object.keys(attrappen), KOPF + '\nreturn malMetaCallKopf;')(...Object.values(attrappen));
        fn(ctx, { kicker: kicker, titel: 'x' }, null);
        // Der erste Aufruf ist die Kopfzeile, der zweite der Titel.
        return { gemalt: rufe[0].t, groesse: rufe[0].px };
    }

    it('schneidet ein langes Format nicht ab, sondern verkleinert', () => {
        // "TEF-PBL · FORMAT-STAPLES" wurde zu "FORMAT-STA…".
        const r = malen('TEF-PBL \u00b7 FORMAT-STAPLES');
        assert.ok(!/\u2026/.test(r.gemalt), 'die Kopfzeile ist abgeschnitten: ' + r.gemalt);
        assert.ok(r.groesse < 24, 'sie wurde nicht verkleinert');
        assert.ok(r.groesse >= 15, 'sie wurde unter die Lesbarkeit verkleinert');
    });

    it('verkleinert auch den Untertitel, statt ihn zu schneiden', () => {
        // Der Untertitel teilt sich die Zeile mit der Modus-Pille. Steht
        // dort eine Spanne ("Gespielter Druck · 16–30"), wird die Pille
        // breiter und der Satz lief in ein "…".
        const KOPF2 = schneide('function staplesPostCanvas(spec, bilder)', '\n    /* Oeffentlicher Weg. Die Kartenbilder');
        assert.match(KOPF2, /while \(ctx\.measureText\(untertitel\)\.width > frei && utGr > \d+\)/,
            'der Untertitel verkleinert sich nicht');
        assert.match(KOPF2, /var frei = MP\.W - 112 - modusB - 16;/,
            'die Breite der Modus-Pille wird nicht abgezogen');
    });

    it('laesst eine kurze Kopfzeile in voller Groesse', () => {
        const r = malen('WORLDS 2026');
        assert.equal(r.groesse, 24);
        assert.ok(!/\u2026/.test(r.gemalt));
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

    it('setzt Format und Format-Staples in die Kopfzeile', async () => {
        // Der Titel im Bild ist kurz ("Meistgespielte Karten"); die
        // Klammer "(Format-Staples)" der Seitenueberschrift lief dort
        // unter das Logo, weil der Kopf nur 560 px breit ist. Sie steht
        // jetzt in der Kopfzeile darueber, zusammen mit dem Format.
        let gesehen = null;
        const w = bau({});
        const alt = w;
        // staplesPostCanvas ist eine Attrappe; die Spezifikation kommt
        // ueber den Zaehler nicht heraus, darum hier ein eigener Bau.
        const QUELLE2 = QUELLE;
        const attrappen = {
            toast: () => {}, L: (de) => de,
            spaceFacts: () => ({ format: 'TEF-PBL', source: 'Limitless Online', stamp: '28.08.2026' }),
            activeSpace: () => 'gl', today: () => '28.08.2026',
            markenBild: () => Promise.resolve(null), MC_BLUETEN: [],
            loadImage: () => Promise.resolve({}),
            staplesPostCanvas: (spec) => { gesehen = spec; return {}; },
            deliver: () => true, safeName: (s) => s, console: { error: () => {} },
        };
        const fn = new Function(...Object.keys(attrappen), QUELLE2 + '\nreturn shareStaplesPost;')(...Object.values(attrappen));
        await fn({ karten: karten(15), titel: 'Meistgespielte Karten' });
        assert.equal(gesehen.kicker, 'TEF-PBL \u00b7 FORMAT-STAPLES');
        assert.equal(gesehen.titel, 'Meistgespielte Karten');
        assert.ok(!/Format-Staples/.test(gesehen.titel), 'die Klammer steht wieder im Titel');
        assert.ok(alt);
    });

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

/* ─────────────────────────────────────────────────────────────────────
 * Top 30: zwei Bilder statt eines
 *
 * 30 Kacheln passen rechnerisch auf 1080 x 1350 — dann ist eine Karte
 * 105 px breit und auf dem Telefon rund 40 px. Da erkennt niemand mehr,
 * welche Karte das ist, und genau darum geht es hier ("weil teilweise ja
 * Karten gleich heissen"). Diese Datei haelt fest, dass die Aufteilung
 * nicht dem Zufall ueberlassen ist.
 * ───────────────────────────────────────────────────────────────────── */
describe('Top 30 wird auf zwei Bilder geteilt', () => {
    const TIER = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');
    const a = TIER.indexOf('async function staplesBildErzeugen()');
    const b = TIER.indexOf('window.staplesBildErzeugen', a);
    assert.ok(a > -1 && b > a, 'staplesBildErzeugen-Schnitt fehlgeschlagen');
    const QUELLE = TIER.slice(a, b);

    function bau(anzahl) {
        const rufe = [];
        const liste = Array.from({ length: anzahl }, (_, i) =>
            ({ rang: i + 1, name: 'K' + i, share: 90 - i }));
        const attrappen = {
            staplesListe: () => liste,
            showToast: () => {},
            getLang: () => 'de',
            t: (k) => k,
            window: {
                DsShare: {
                    shareStaplesPost: (spec) => { rufe.push(spec); return Promise.resolve(true); },
                },
            },
            _staplesModus: 'gespielt',
            _staplesDaten: Object.assign([], { totalArchetypes: 60 }),
        };
        const fn = new Function(...Object.keys(attrappen),
            QUELLE + '\nreturn staplesBildErzeugen;')(...Object.values(attrappen));
        return { fn, rufe };
    }

    it('macht aus 15 Karten ein Bild', async () => {
        const w = bau(15);
        await w.fn();
        assert.equal(w.rufe.length, 1);
        assert.equal(w.rufe[0].karten.length, 15);
    });

    it('macht aus 30 Karten zwei Bilder zu je 15', async () => {
        const w = bau(30);
        await w.fn();
        assert.equal(w.rufe.length, 2, 'es entstand kein Karussell');
        assert.equal(w.rufe[0].karten.length, 15);
        assert.equal(w.rufe[1].karten.length, 15);
    });

    it('schneidet dabei keine Karte weg und wiederholt keine', async () => {
        const w = bau(30);
        await w.fn();
        const namen = w.rufe[0].karten.concat(w.rufe[1].karten).map(k => k.name);
        assert.equal(new Set(namen).size, 30, 'Karten doppelt oder verloren');
        assert.equal(namen[0], 'K0');
        assert.equal(namen[29], 'K29');
    });

    it('schreibt die Spanne ins Bild und in den Dateinamen', async () => {
        // Zwei Bilder ohne Beschriftung sind zweimal dasselbe Bild.
        const w = bau(30);
        await w.fn();
        assert.match(w.rufe[0].modus, /1–15/);
        assert.match(w.rufe[1].modus, /16–30/);
        assert.notEqual(w.rufe[0].dateiname, w.rufe[1].dateiname);
    });
});
