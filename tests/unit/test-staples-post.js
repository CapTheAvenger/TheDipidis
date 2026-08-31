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

const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

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

/* Zeichnet staplesPostCanvas mit Attrappen und gibt zurueck, wo Logo und
 * Kacheln gelandet sind. Nur Geometrie — nichts wird wirklich gemalt. */
const POST = schneide('function staplesPostCanvas(spec, bilder)',
                      '\n    /* Oeffentlicher Weg. Die Kartenbilder');
/* Der echte Kopf laeuft im Harness mit — er zeichnet das Logo, und genau
   dessen Unterkante ist die Groesse, die hier geprueft wird. Ein
   weggemockter Kopf wuerde die Attrappe pruefen, nicht die Auslieferung. */
const KOPF_QUELLE = schneide('function malPostKopf(ctx, spec, logo)',
                             '\n    function malMetaCallFuss');

function zeichneStaples(logoMasse, anzahl) {
    const kacheln = [];
    let logo = null;
    const ctx = {
        _px: 24,
        set font(v) { const m = String(v).match(/(\d+)px/); if (m) this._px = +m[1]; },
        get font() { return this._px + 'px'; },
        measureText: (t) => ({ width: String(t).length * 0.62 * ctx._px }),
        fillText: () => {}, textBaseline: '', fillStyle: '',
    };
    const attrappen = {
        MP: { W: 1080, H: 1350 },
        MC_FARBEN: { holz: '#E3B276' },
        MC_BLUETEN: [],
        malGrund: () => {}, malBluete: () => {}, malMetaCallFuss: () => {},
        fMono: (g) => g + 'px mono',
        clip: (c, t) => t,
        malLogo: (c, img, x, y, w) => { logo = { x, y, w }; },
        fSans: (g) => g + 'px sans',
        clip: (c, t) => t,
        staplesGitter: staplesGitter,
        malStapleKachel: (c, k, x, y, b, h) => { kacheln.push({ x, y, b, h }); },
        document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) },
    };
    const fn = new Function(...Object.keys(attrappen),
        KOPF_QUELLE + '\n' + POST + '\nreturn staplesPostCanvas;')(
        ...Object.values(attrappen));
    const karten = Array.from({ length: anzahl }, (_, i) => ({ rang: i + 1, name: 'X', share: 1 }));
    fn({ kicker: 'TEF-PBL \u00b7 FORMAT-STAPLES', karten: karten, fuss: 'Stand' },
       { logo: { width: logoMasse.breite, height: logoMasse.hoehe }, blueten: [] });
    return { logo: logo, kacheln: kacheln };
}

describe('die gesperrte Kopfzeile', () => {
    const KOPF = schneide('function malPostKopf(ctx, spec, logo)', '\n    function malMetaCallFuss');

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
        const fn = new Function(...Object.keys(attrappen), KOPF + '\nreturn malPostKopf;')(...Object.values(attrappen));
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

    it('benutzt denselben Kopf wie der Meta-Call-Post', () => {
        // Betreiber am 28.08.2026, mit Titel und Untertitel eingekringelt:
        // "format staples als Text reicht, rest kann weg." Dazu: "der
        // gespielter Druck Banner muss im Bild noch weg."
        // Ohne Kommentare messen: ein Kommentar, der eine Funktion
        // NENNT, ist kein Aufruf.
        const K = ohneKommentare(schneide('function staplesPostCanvas(spec, bilder)', '\n    /* Oeffentlicher Weg. Die Kartenbilder'));
        assert.ok(!/spec\.modus/.test(K), 'die Modus-Pille wird wieder gezeichnet');
        assert.ok(!/modusB/.test(K), 'ihr Platz wird noch freigehalten');
        assert.ok(!/spec\.titel/.test(K), 'der Titel ist zurueck');
        assert.ok(!/spec\.untertitel/.test(K), 'der Untertitel ist zurueck');
        /* Betreiber am 28.08.2026, mit der gesperrten Zeile eingekringelt:
           "warum steht das Format Staples noch da oben? Koennen wir mal
           bitte ein Format durchziehen, die anderen waren doch super."
           Also EIN Kopf fuer beide Bilder, kein zweiter Nachbau. */
        assert.match(K, /malPostKopf\(ctx, spec, bilder\.logo\)/,
            'das Staples-Bild zeichnet seinen Kopf wieder selbst');
        assert.ok(!/fillText/.test(K),
            'im Staples-Bild wird wieder eigener Kopftext gesetzt');
        assert.ok(!/malLogo\(/.test(K),
            'das Logo wird zusaetzlich zum Kopf noch einmal gezeichnet');
    });

    it('laesst das Gitter erst unter dem Logo anfangen', () => {
        /* Am 28.08.2026 fiel der Titel weg und der Gitteranfang wurde auf
         * eine feste 380 gesetzt. Das Logo reicht aber bis 459 hinunter:
         * es stand danach mitten in der ersten Kartenreihe. Gemeldet mit
         * Bild: "was zur Hoelle ist da mit dem Logo passiert."
         *
         * Der alte Test hier fragte nur, ob der Anfang KLEINER als vorher
         * ist — genau die Annahme, die den Fehler verursacht hat. Diese
         * Fassung misst statt dessen die wirkliche Geometrie: keine Kachel
         * darf ueber die Unterkante des Logos ragen. */
        const echt = { breite: 760, hoehe: 423 };   // images/marke/logo.webp
        const gemalt = zeichneStaples(echt, 15);
        const logoUnten = gemalt.logo.y + gemalt.logo.w * (echt.hoehe / echt.breite);
        assert.ok(gemalt.kacheln.length > 0, 'es wurde keine Kachel gezeichnet');
        const obersteKachel = Math.min(...gemalt.kacheln.map(k => k.y));
        assert.ok(obersteKachel >= logoUnten,
            `die oberste Kachel beginnt bei ${obersteKachel.toFixed(0)}, das Logo `
            + `reicht bis ${logoUnten.toFixed(0)} — sie ueberdecken sich`);
    });

    it('verschenkt ueber dem Gitter auch keine halbe Seite', () => {
        // Die Gegenrichtung: der Anfang soll dem Logo folgen, nicht weit
        // darunter stehenbleiben. Sonst waere die Ueberdeckung zwar weg,
        // die Kacheln aber wieder unnoetig klein.
        const echt = { breite: 760, hoehe: 423 };
        const gemalt = zeichneStaples(echt, 15);
        const logoUnten = gemalt.logo.y + gemalt.logo.w * (echt.hoehe / echt.breite);
        const obersteKachel = Math.min(...gemalt.kacheln.map(k => k.y));
        assert.ok(obersteKachel - logoUnten <= 80,
            `zwischen Logo und erster Kachel liegen ${(obersteKachel - logoUnten).toFixed(0)} px`);
    });

    it('folgt einem hoeheren Logo nach unten', () => {
        // Der Beweis, dass die Zahl gerechnet und nicht geraten ist.
        const flach = zeichneStaples({ breite: 760, hoehe: 423 }, 15);
        const hoch  = zeichneStaples({ breite: 760, hoehe: 700 }, 15);
        const a = Math.min(...flach.kacheln.map(k => k.y));
        const b = Math.min(...hoch.kacheln.map(k => k.y));
        assert.ok(b > a, 'ein hoeheres Logo schiebt das Gitter nicht nach unten');
    });

    it('laesst der Meta-Call-Post seinen Titel', () => {
        // Die beiden Bilder teilen sich Grund, Blueten und Fuss — aber
        // nicht den Kopf. Der Meta Call braucht seinen Titel weiter.
        const MC = schneide('function metaCallPostCanvas(spec, bilder)', '\n    /* Oeffentlicher Weg: Spezifikation rein');
        assert.match(MC, /malPostKopf\(ctx, spec, bilder\.logo\)/,
            'dem Meta-Call-Post wurde der Kopf mit weggenommen');
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

    it('trennt Format (Kicker) und Titel wie der Meta-Call-Post', async () => {
        // Kicker = Format, Titel = worum es geht. Vorher stand beides in
        // der gesperrten Zeile und lief ueber die halbe Bildbreite.
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
        await fn({ karten: karten(15) });
        assert.equal(gesehen.kicker, 'TEF-PBL',
            'der Kicker traegt wieder mehr als das Format');
        assert.equal(gesehen.titel, 'Format-Staples',
            'der Titel fehlt — dann steht das Wort wieder in der gesperrten Zeile');
        assert.equal(gesehen.untertitel, undefined, 'der Untertitel ist zurueck');
        // Unten links nur das Datum: "Meta steht ja schon oben und
        // Limitless Online ist egal."
        assert.equal(gesehen.fuss, 'Stand 28.08.2026');
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

    it('gibt den beiden Bildern verschiedene Dateinamen', async () => {
        // Ohne das ueberschreibt das zweite Bild beim Speichern das erste.
        // Im Bild selbst steht die Spanne nicht mehr — sie steht als
        // Rangziffer auf jeder Kachel (1–15 hier, 16–30 dort).
        const w = bau(30);
        await w.fn();
        assert.notEqual(w.rufe[0].dateiname, w.rufe[1].dateiname);
        assert.match(w.rufe[0].dateiname, /1-15/);
        assert.match(w.rufe[1].dateiname, /16-30/);
        assert.equal(w.rufe[0].modus, undefined, 'der Modus wandert wieder ins Bild');
        assert.equal(w.rufe[1].modus, undefined);
        assert.equal(w.rufe[0].karten[0].rang, 1);
        assert.equal(w.rufe[1].karten[0].rang, 16, 'die Rangziffer unterscheidet die Bilder nicht');
    });
});

/* ═══════════════════════════════════════════════════════════════════
 * Die Rangmuenze auf der Kachel
 *
 * Am 31.08.2026 im Livebild aufgefallen: die Muenze sass oben links —
 * genau dort, wo jede Pokemon-Karte ihren gedruckten Namen traegt. Rang 1
 * las sich als "Stretcher" statt "Night Stretcher", Rang 2 als "Ball",
 * Rang 3 als "Determination". Sie gehoert ins dunkle Band unten rechts,
 * wo sie nichts zudeckt.
 * ═══════════════════════════════════════════════════════════════════ */

const KACHEL = schneide('function malStapleKachel(ctx, k, x, y, kb, kh)',
                        '\n    function staplesPostCanvas');

function zeichneKachel(karte, x, y, kb, kh) {
    const kreise = [];
    const texte = [];
    const clipBreiten = [];
    const ctx = {
        _px: 12,
        set font(v) { const m = String(v).match(/(\d+)px/); if (m) this._px = +m[1]; },
        get font() { return this._px + 'px'; },
        save: () => {}, restore: () => {}, clip: () => {},
        beginPath: () => {}, fill: () => {}, stroke: () => {},
        fillRect: () => {}, drawImage: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        measureText: (t) => ({ width: String(t).length * 6 }),
        arc: (cx, cy, r) => { kreise.push({ cx, cy, r }); },
        fillText: (t, tx, ty) => { texte.push({ t: String(t), x: tx, y: ty }); },
        textAlign: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
    };
    const attrappen = {
        MC_FARBEN: { holz: '#E3B276', creme: '#F5E9DC', matt: '#9A8AA5' },
        rr: () => {},
        fSans: (g) => g + 'px sans',
        fMono: (g) => g + 'px mono',
        num: (v, n) => Number(v).toFixed(n).replace('.', ','),
        clip: (c, t, b) => { clipBreiten.push(b); return t; },
    };
    const fn = new Function(...Object.keys(attrappen),
        KACHEL + '\nreturn malStapleKachel;')(...Object.values(attrappen));
    fn(ctx, karte, x, y, kb, kh);
    return { kreise, texte, clipBreiten, ctx };
}

describe('die Rangmuenze auf der Staples-Kachel', () => {
    const X = 100, Y = 200, KB = 150, KH = 209;
    const karte = { rang: 7, name: 'Night Stretcher', share: 88.3, bild: {} };

    it('liegt in der unteren Haelfte der Kachel, nicht ueber dem Kartennamen', () => {
        const { kreise } = zeichneKachel(karte, X, Y, KB, KH);
        assert.equal(kreise.length, 1, 'genau eine Muenze je Kachel');
        const m = kreise[0];
        assert.ok(m.cy - m.r > Y + KH * 0.5,
            `Muenze beginnt bei ${m.cy - m.r}, muss unter ${Y + KH * 0.5} liegen — `
            + 'oben steht der gedruckte Kartenname');
    });

    it('liegt an der rechten Kante, nicht ueber Name und Prozentzeile', () => {
        const { kreise } = zeichneKachel(karte, X, Y, KB, KH);
        const m = kreise[0];
        assert.ok(m.cx - m.r > X + KB * 0.5,
            `Muenze beginnt bei x=${m.cx - m.r}, links stehen Name und Anteil`);
        assert.ok(m.cx + m.r <= X + KB,
            `Muenze ragt bis ${m.cx + m.r} ueber die Kachelkante ${X + KB} hinaus`);
        assert.ok(m.cy + m.r <= Y + KH,
            `Muenze ragt bis ${m.cy + m.r} unter die Kachelkante ${Y + KH}`);
    });

    it('traegt die Rangziffer in ihrer Mitte', () => {
        const { kreise, texte } = zeichneKachel(karte, X, Y, KB, KH);
        const m = kreise[0];
        const ziffer = texte.find((t) => t.t === '7');
        assert.ok(ziffer, 'die Rangziffer fehlt');
        assert.ok(Math.abs(ziffer.x - m.cx) <= 1,
            `Ziffer bei x=${ziffer.x}, Muenze bei ${m.cx}`);
        assert.ok(Math.abs(ziffer.y - m.cy) <= 2,
            `Ziffer bei y=${ziffer.y}, Muenze bei ${m.cy}`);
    });

    it('nimmt Name und Prozentzeile den Platz der Muenze ab', () => {
        const { kreise, clipBreiten } = zeichneKachel(karte, X, Y, KB, KH);
        const m = kreise[0];
        const frei = m.cx - m.r - (X + 7);
        assert.ok(clipBreiten.length >= 2, 'Name und Anteil werden beide beschnitten');
        clipBreiten.forEach((b) => {
            assert.ok(b <= frei + 1,
                `Textbreite ${b} laeuft unter die Muenze (frei sind ${frei})`);
        });
    });

    it('setzt Textausrichtung und Grundlinie wieder zurueck', () => {
        const { ctx } = zeichneKachel(karte, X, Y, KB, KH);
        assert.equal(ctx.textAlign, 'left', 'textAlign bleibt auf center stehen');
        assert.equal(ctx.textBaseline, 'alphabetic', 'textBaseline bleibt auf middle stehen');
    });
});
