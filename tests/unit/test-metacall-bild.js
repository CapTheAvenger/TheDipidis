/**
 * "Bild generieren" im Meta Call.
 *
 * Der Betreiber am 28.08.2026: "dann kannst du ja vielleicht einfach die
 * Moeglichkeit geben auf der Webseite, dass man den Turniernamen eingibt
 * und die Anzahl Teilnehmer [...] und dann drueckt man auf 'Bild
 * generieren' und dann wird das Bild, wie fuer unseren Instagram-Post
 * besprochen, generiert."
 *
 * Zwei Dinge sichert diese Datei ab:
 *
 *  1. Das Bild hat dasselbe Format und dieselbe Bluetenlage wie die
 *     freigegebenen Posts (B1). Wandert eine Bluete, faellt das hier auf
 *     und nicht erst, wenn zwei Bilder nebeneinander auf Instagram
 *     stehen.
 *  2. Der Turniername geht in KEINE Rechnung ein. Er steht auf dem Bild
 *     und im Dateinamen — sonst nichts. Landete er versehentlich in der
 *     Prognose, wuerde ein Tippfehler im Namen die Zahlen aendern.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT  = path.join(__dirname, '..', '..');
const SHARE = fs.readFileSync(path.join(ROOT, 'js', 'ds-share.js'), 'utf8');
const MC    = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
const I18N  = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const CSS   = fs.readFileSync(path.join(ROOT, 'css', 'meta-call.css'), 'utf8');

/* Ein 2D-Zusammenhang, der nichts malt, sondern mitschreibt. Damit
 * laesst sich pruefen, was das Bild enthaelt, ohne ein Bild zu
 * erzeugen. */
function schreiber() {
    const buch = { text: [], bilder: [], rechtecke: [], modi: [] };
    const ctx = {
        canvas: null,
        globalAlpha: 1, globalCompositeOperation: 'source-over',
        fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic',
        shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
        save() {}, restore() {}, translate() {}, rotate() {}, clip() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {},
        fill() {}, stroke() {},
        measureText(t) { return { width: String(t).length * 9 }; },
        fillText(t, x, y) { buch.text.push({ t: String(t), x, y, farbe: this.fillStyle, font: this.font }); },
        fillRect(x, y, w, h) { buch.rechtecke.push({ x, y, w, h, farbe: this.fillStyle }); },
        drawImage(img, x, y, w, h) {
            buch.bilder.push({ id: img && img._id, x, y, w, h, modus: this.globalCompositeOperation, alpha: this.globalAlpha });
            if (this.globalCompositeOperation !== 'source-over') buch.modi.push(this.globalCompositeOperation);
        },
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
    };
    return { ctx, buch };
}

function ladeShare() {
    let letzteLeinwand = null;
    const zaehler = { leinwaende: 0 };
    const sandbox = {
        console, Math, JSON, Date, Intl, Number, String, Object, Array,
        isFinite, parseInt, parseFloat, setTimeout, clearTimeout, Promise, URL,
        encodeURIComponent, Image: function () {},
        document: {
            documentElement: { lang: 'de' },
            createElement: () => {
                zaehler.leinwaende += 1;
                const s = schreiber();
                letzteLeinwand = { width: 0, height: 0, getContext: () => s.ctx, _buch: s.buch };
                s.ctx.canvas = letzteLeinwand;
                return letzteLeinwand;
            },
            getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
            body: { appendChild() {}, removeChild() {} },
        },
        location: { href: 'https://thedipidis.app/', origin: 'https://thedipidis.app' },
        navigator: { language: 'de-DE' },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SHARE, sandbox);
    return { I: sandbox.DsShare._internals, oeffentlich: sandbox.DsShare, letzte: () => letzteLeinwand, zaehler };
}

const { I, oeffentlich, zaehler } = ladeShare();

const BILD = (id) => ({ _id: id, width: 200, height: 150 });

function maleBeispiel(spec) {
    const decks = (spec && spec.decks) || [
        { name: 'Dragapult', wert: '13,88 %' },
        { name: 'Dragapult Blaziken', wert: '6,83 %' },
        { name: 'Slowking', wert: '5,32 %' },
    ];
    const cv = I.metaCallPostCanvas(Object.assign({
        titel: 'Meta Call', kicker: 'Worlds 2026',
        spalteLinks: 'Deck', spalteRechts: 'Prognose %',
        fuss: '800 Spieler · 8 R. · 16 P.',
    }, spec, { decks }), {
        logo: BILD('logo'),
        blueten: I.MC_BLUETEN.map((b) => BILD(b[0])),
        sprites: decks.map(() => [BILD('sprite')]),
    });
    return { cv, buch: cv._buch };
}

describe('Bild generieren: Format und Bluetenlage wie in den Posts', () => {
    it('das Bild ist 1080 auf 1350 — Instagram-Hochkant', () => {
        assert.equal(I.MP.W, 1080);
        assert.equal(I.MP.H, 1350);
        const { cv } = maleBeispiel();
        assert.equal(cv.width, 1080);
        assert.equal(cv.height, 1350);
    });

    it('die sieben Blueten der freigegebenen Lage B1 stehen fest', () => {
        assert.equal(I.MC_BLUETEN.length, 7);
        // Erste und letzte als Anker — verrutscht die Lage, faellt es auf.
        assert.deepEqual(Array.from(I.MC_BLUETEN[0]), ['b0', 812, -46, 234, -12, 0.95]);
        assert.deepEqual(Array.from(I.MC_BLUETEN[6]), ['p4', 386, 214, 44, -34, 0.30]);
        I.MC_BLUETEN.forEach((b) => {
            assert.equal(b.length, 6, `${b[0]} hat nicht sechs Werte`);
            assert.ok(b[5] > 0 && b[5] <= 1, `${b[0]} hat eine unmoegliche Deckung`);
        });
    });

    it('jede Bluete wird auch wirklich gezeichnet', () => {
        const { buch } = maleBeispiel();
        I.MC_BLUETEN.forEach((b) => {
            assert.ok(buch.bilder.some(x => x.id === b[0]), `${b[0]} fehlt im Bild`);
        });
    });

    it('die Blueten sitzen im Kopfbereich, nicht ueber der Tafel', () => {
        // Die Tafel beginnt bei 580. Eine Bluete, die dort hineinragt,
        // liegt auf der Tabelle und macht Zahlen unlesbar.
        I.MC_BLUETEN.forEach((b) => {
            assert.ok(b[2] < 400, `${b[0]} startet bei y=${b[2]} und rutscht Richtung Tafel`);
        });
    });

    it('das Logo wird mit screen gezeichnet, damit sein Schwarz verschwindet', () => {
        const { buch } = maleBeispiel();
        const logo = buch.bilder.find(x => x.id === 'logo');
        assert.ok(logo, 'das Logo fehlt im Bild');
        assert.equal(logo.modus, 'screen');
    });
});

describe('Bild generieren: der Inhalt steht drauf', () => {
    it('Kicker, Titel und Adresse stehen im Bild', () => {
        const { buch } = maleBeispiel();
        const alles = buch.text.map(x => x.t.replace(/\s+/g, '')).join('|');
        assert.match(alles, /WORLDS2026/);
        assert.match(alles, /MetaCall/);
        assert.match(alles, /thedipidis\.app/);
    });

    it('jedes Deck steht mit Namen und Wert da', () => {
        const { buch } = maleBeispiel();
        const alles = buch.text.map(x => x.t).join('|');
        ['Dragapult', 'Dragapult Blaziken', 'Slowking'].forEach(n => {
            assert.ok(alles.includes(n), `${n} fehlt`);
        });
        ['13,88 %', '6,83 %', '5,32 %'].forEach(w => {
            assert.ok(alles.includes(w), `${w} fehlt`);
        });
    });

    it('zehn Decks passen genauso hinein wie drei', () => {
        const decks = Array.from({ length: 10 }, (_, i) => ({ name: 'Deck ' + i, wert: (10 - i) + ',00 %' }));
        const { buch } = maleBeispiel({ decks });
        const alles = buch.text.map(x => x.t).join('|');
        decks.forEach(d => assert.ok(alles.includes(d.name), `${d.name} fehlt`));
        // Nichts darf unter den Fuss rutschen.
        const unterste = Math.max(...buch.rechtecke.map(r => r.y + r.h).filter(Number.isFinite));
        assert.ok(unterste <= I.MP.H, `die Tafel reicht bis ${unterste} und damit ueber den Rand`);
    });

    it('ohne Decks entsteht kein Bild', () => {
        // Nicht nur "kommt false zurueck": es darf gar keine Leinwand
        // angelegt werden. Sonst faellt eine entfernte Pruefung nicht auf,
        // weil sie spaeter woanders in einen Fehler laeuft.
        const vorher = zaehler.leinwaende;
        return oeffentlich.shareMetaCallPost({ decks: [] }).then(ok => {
            assert.equal(ok, false);
            assert.equal(zaehler.leinwaende, vorher, 'es wurde trotzdem eine Leinwand angelegt');
        });
    });

    it('ohne Spezifikation entsteht kein Bild', () => {
        const vorher = zaehler.leinwaende;
        return oeffentlich.shareMetaCallPost(null).then(ok => {
            assert.equal(ok, false);
            assert.equal(zaehler.leinwaende, vorher);
        });
    });
});

describe('Bild generieren: der Turniername rechnet nicht mit', () => {
    it('_onTournamentName merkt nur, es rechnet nicht neu', () => {
        const m = MC.match(/function _onTournamentName\(val\) \{[\s\S]*?\n  \}/);
        assert.ok(m, '_onTournamentName ist nicht mehr auffindbar');
        assert.doesNotMatch(m[0], /refreshResults|_runPredictor|renderAll/,
            'der Turniername loest eine Neuberechnung aus');
    });

    it('der Name wird auf 60 Zeichen begrenzt', () => {
        const m = MC.match(/function _onTournamentName\(val\) \{[\s\S]*?\n  \}/);
        assert.match(m[0], /slice\(0, 60\)/);
    });

    it('der Knopf und das Feld stehen im Einstellungsblock', () => {
        assert.match(MC, /id="mc-turniername"/);
        assert.match(MC, /MetaCall\.generateTournamentImage\(\)/);
        assert.match(MC, /MetaCall\._onTournamentName\(this\.value\)/);
    });

    it('beide sind nach aussen sichtbar', () => {
        assert.match(MC, /^\s*_onTournamentName,$/m);
        assert.match(MC, /^\s*generateTournamentImage,$/m);
    });

    it('fehlt das Bild-Modul, sagt der Knopf das statt nichts zu tun', () => {
        const m = MC.match(/function generateTournamentImage\(\) \{[\s\S]*?\n  \}/);
        assert.ok(m, 'generateTournamentImage ist nicht mehr auffindbar');
        assert.match(m[0], /window\.DsShare/);
        assert.match(m[0], /mc\.generateImageMissing/);
    });

    it('das Bild zeigt hoechstens zehn Decks und keinen Restposten', () => {
        const m = MC.match(/function generateTournamentImage\(\) \{[\s\S]*?\n  \}/);
        assert.match(m[0], /slice\(0, 10\)/);
        // 30.08.2026: der _junk-Filter stand frueher hier drin. Er ist in
        // _prognostiziertesFeld() gewandert — dieselbe Rechnung, die jetzt
        // auch die Aussenschnittstelle benutzt, nachdem der Knopf mit
        // einem ReferenceError auf eine Funktion zeigte, die es im Modul
        // gar nicht gab. Der Test folgt dem Weg, statt eine Zeichenkette
        // an ihrer alten Stelle zu suchen.
        assert.match(m[0], /_prognostiziertesFeld\(\)/,
            'der Knopf holt das Feld nicht mehr ueber _prognostiziertesFeld()');
        const f = MC.match(/function _prognostiziertesFeld\(\) \{[\s\S]*?\n  \}/);
        assert.ok(f, '_prognostiziertesFeld() ist nicht auffindbar');
        assert.match(f[0], /'_junk'/,
            'der Restposten wird nirgends mehr herausgefiltert');
    });
});

describe('Bild generieren: Beschriftung und Gestaltung', () => {
    const SCHLUESSEL = [
        'mc.labelTournamentName', 'mc.tournamentNamePlaceholder',
        'mc.generateImage', 'mc.generateImageHint',
        'mc.generateImageEmpty', 'mc.generateImageMissing',
        'mc.imageTitle', 'mc.colDeck', 'mc.colPrediction',
    ];
    it('jeder Schluessel steht einmal auf Englisch und einmal auf Deutsch', () => {
        SCHLUESSEL.forEach(k => {
            const n = I18N.split(`'${k}':`).length - 1;
            assert.equal(n, 2, `${k} steht ${n}-mal statt zweimal`);
        });
    });
    it('der Knopf heisst auf Deutsch "Bild generieren"', () => {
        assert.match(I18N, /'mc\.generateImage':\s*'Bild generieren'/);
    });
    it('es gibt Gestaltung fuer Knopf und Namensfeld', () => {
        assert.match(CSS, /\.mc-bild-btn\s*\{/);
        assert.match(CSS, /\.mc-turnier-name\s*\{/);
    });
});
