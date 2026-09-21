/**
 * "Kartentext auf Englisch" — steht das an JEDER Anzeigestelle dran?
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Die Kartendatenbank fuehrt Namen zweisprachig (`name_en`, `name_de`),
 * den Kartentext aber nur einmal: `card_text`, englisch. Der Betreiber
 * hat am 10.09.2026 entschieden: "Englisch zeigen, sichtbar
 * gekennzeichnet."
 *
 * Eine Kennzeichnung ist genau so viel wert wie ihre schwaechste
 * Stelle. Heute zeigt EINE Stelle in js/ den Kartentext an
 * (openZoomModal in js/app-profile-deck-builder.js). Morgen sind es
 * zwei, und die zweite wird vergessen — das ist im Projekt schon
 * passiert, deshalb pruefen die Zusagen hier nicht die eine bekannte
 * Stelle, sondern ERHEBEN die Stellen aus dem Quelltext und verlangen
 * von jeder gefundenen die Kennzeichnung.
 *
 * WIE ERHOBEN WIRD
 * ----------------
 * Jede Datei direkt unter js/ (ohne js/vendor — Fremdcode) wird von
 * Kommentaren befreit und nach dem Feldnamen `card_text` durchsucht.
 * Jeder Fund wird einsortiert:
 *
 *   Zeichenkette  'card_text' als Wert, z.B. der Musterbereich in
 *                 js/card-capability-engine.js — kein Feldzugriff.
 *   Uebernahme    `card_text:` als Schluessel, also Umbau/Zusammenbau
 *                 eines Kartenobjekts — der Text wird durchgereicht,
 *                 nicht gezeigt.
 *   Suche         Feldzugriff zusammen mit toLowerCase + indexOf:
 *                 der Suchfilter liest den Text, zeigt ihn aber nicht.
 *   Anzeige       alles Uebrige. Diese Stellen MUESSEN
 *                 window.KartentextHinweis aufrufen.
 *
 * GRENZE DER ERHEBUNG, ausdruecklich benannt: wer den Wert erst in eine
 * Variable legt und die Variable in eine andere Funktion reicht, faellt
 * durch das Raster — der Feldzugriff steht dann in der Funktion, die
 * nichts anzeigt. Dagegen hilft kein Grep, sondern nur der Aufbau: die
 * Kennzeichnung liegt in EINER Datei (js/kartentext-hinweis.js), und
 * die Laufzeitzusagen weiter unten messen das erzeugte HTML.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const HTML   = lies('index.html');
const SW     = lies('service-worker.js');
const CSS    = lies('css/kartentext-hinweis.css');

// ── Quelltext-Erhebung ───────────────────────────────────────────────

/**
 * Blendet Kommentare aus (Zeichen fuer Zeichen ersetzt, damit alle
 * Positionen erhalten bleiben). Mit `auchZeichenketten` werden auch
 * Zeichenketten- und Regex-INHALTE geleert — das braucht die
 * Klammerzaehlung weiter unten, damit ein `{` in einem Text die
 * Funktionsgrenze nicht verschiebt.
 *
 * Regex-Literale werden erkannt, sonst verschluckt sich der Leser an
 * `.replace(/'/g, ...)` in js/app-profile-deck-builder.js: das
 * einzelne Anfuehrungszeichen im Muster wuerde als Zeichenkettenanfang
 * gelesen und der Rest der Datei liefe verschoben. GEMESSEN: mit dem
 * naiven Leser galten die Kommentarzeilen 364/365 derselben Datei als
 * Code.
 */
function blanke(q, auchZeichenketten) {
    const raus = q.split('');
    const loesche = (a, b) => {
        for (let k = a; k < b && k < q.length; k++) if (q[k] !== '\n') raus[k] = ' ';
    };
    let i = 0;
    const n = q.length;
    let letztes = '';
    const regexMoeglich = () => letztes === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(letztes) >= 0;
    while (i < n) {
        const c = q[i], d = q[i + 1];
        if (c === '/' && d === '/') {
            const a = i;
            while (i < n && q[i] !== '\n') i++;
            loesche(a, i);
            continue;
        }
        if (c === '/' && d === '*') {
            const a = i;
            while (i < n && !(q[i] === '*' && q[i + 1] === '/')) i++;
            i += 2;
            loesche(a, i);
            letztes = ' ';
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            const a = i;
            i++;
            while (i < n) {
                if (q[i] === '\\') { i += 2; continue; }
                if (q[i] === c) { i++; break; }
                i++;
            }
            if (auchZeichenketten) loesche(a + 1, i - 1);
            letztes = 'x';
            continue;
        }
        if (c === '/' && regexMoeglich()) {
            const a = i;
            i++;
            let klasse = false;
            while (i < n) {
                if (q[i] === '\\') { i += 2; continue; }
                if (q[i] === '[') klasse = true;
                else if (q[i] === ']') klasse = false;
                else if (q[i] === '/' && !klasse) { i++; break; }
                else if (q[i] === '\n') break;
                i++;
            }
            if (auchZeichenketten) loesche(a, i);
            letztes = 'x';
            continue;
        }
        if (!/\s/.test(c)) letztes = c;
        i++;
    }
    return raus.join('');
}

/** Die Funktion, in der eine Fundstelle steht — Name und Rumpf. */
function funktionsRumpf(quelle, index) {
    const geblankt = blanke(quelle, true);
    let start = -1;
    let p = geblankt.lastIndexOf('function', index);
    while (p >= 0) {
        const vor  = p > 0 ? quelle[p - 1] : ' ';
        const nach = quelle[p + 8];
        if (!/[A-Za-z0-9_$]/.test(vor) && !/[A-Za-z0-9_$]/.test(nach)) { start = p; break; }
        p = geblankt.lastIndexOf('function', p - 1);
    }
    if (start === -1) return null;
    const auf = geblankt.indexOf('{', geblankt.indexOf(')', start));
    if (auf === -1) return null;
    let tiefe = 0, ende = -1;
    for (let k = auf; k < geblankt.length; k++) {
        if (geblankt[k] === '{') tiefe++;
        else if (geblankt[k] === '}') { tiefe--; if (tiefe === 0) { ende = k + 1; break; } }
    }
    if (ende === -1 || ende <= index) return null;
    const name = (quelle.slice(start, auf).match(/function\s+([A-Za-z0-9_$]*)/) || [])[1] || '(anonym)';
    return { name, rumpf: quelle.slice(start, ende) };
}

function jsDateien() {
    const verz = path.join(WURZEL, 'js');
    return fs.readdirSync(verz)
        .filter(f => f.endsWith('.js'))
        .filter(f => fs.statSync(path.join(verz, f)).isFile())
        .sort();
}

function erhebung() {
    const gruppen = { zeichenkette: [], uebernahme: [], suche: [],
                      auswahl: [], anzeige: [] };
    for (const datei of jsDateien()) {
        const roh    = lies(path.join('js', datei));
        const code   = blanke(roh, false);
        const zeilen = roh.split('\n');
        let i = code.indexOf('card_text');
        while (i !== -1) {
            const vor  = i > 0 ? roh[i - 1] : '';
            // BEIDE FELDER (21.09.2026). Seit es `card_text_de` gibt,
            // darf die Erhebung nicht mehr nur `card_text` kennen:
            // sonst waere eine neue Anzeigestelle, die den DEUTSCHEN
            // Text zeigt, fuer diesen Test unsichtbar — und genau die
            // Sorte Luecke soll er ja finden. Die Kennzeichnungspflicht
            // gilt fuer beide: bei deutschem Text heisst sie „kein
            // Abzeichen und lang=de", und auch das entscheidet
            // js/kartentext-hinweis.js und nicht die Anzeigestelle.
            const istDe = roh.startsWith('card_text_de', i);
            const feld  = istDe ? 'card_text_de' : 'card_text';
            const nach  = roh[i + feld.length] || '';
            // Wortgrenze: `pokemon_card_text` und `card_text_scraper`
            // sind Dateinamen, kein Feld.
            if (/[A-Za-z0-9_$]/.test(vor) || /[A-Za-z0-9_$]/.test(nach)) {
                i = code.indexOf('card_text', i + 1);
                continue;
            }
            const nr    = roh.slice(0, i).split('\n').length;
            const zeile = zeilen[nr - 1];
            const e = { datei, nr, zeile: zeile.trim(), index: i, quelle: roh };
            if (vor === "'" || vor === '"')                        gruppen.zeichenkette.push(e);
            else if (nach === ':')                                 gruppen.uebernahme.push(e);
            else if (/toLowerCase/.test(zeile) &&
                     /(indexOf|includes|match)/.test(zeile))       gruppen.suche.push(e);
            else if (/card_text(_de)?\s*:/.test(zeile))            gruppen.uebernahme.push(e);
            // Auswahl: die Kennzeichnungsdatei SELBST. Seit dem
            // 21.09.2026 entscheidet `waehlen()` dort, ob ein deutscher
            // oder ein englischer Text gezeigt wird — sie liest dafuer
            // beide Felder. Von ihr zu verlangen, sie moege
            // `KartentextHinweis` aufrufen, waere ein Zirkel: sie IST
            // die Kennzeichnung. Die Gruppe steht hier trotzdem und
            // wird gezaehlt, damit eine zweite Fundstelle in dieser
            // Datei nicht unbemerkt durchrutscht.
            else if (datei === 'kartentext-hinweis.js')            gruppen.auswahl.push(e);
            else                                                   gruppen.anzeige.push(e);
            i = code.indexOf('card_text', i + 1);
        }

        // ── Der Umweg zaehlt auch als Anzeigestelle (21.09.2026) ──
        //
        // Seit `waehlen()` entscheidet, welcher der beiden Texte
        // gezeigt wird, fasst die Anzeigestelle im Deckbauer das Feld
        // `card_text` nicht mehr selbst an — sie nimmt, was `waehlen`
        // zurueckgibt. Ohne diese Schleife faende die Erhebung darueber
        // KEINE Anzeigestelle mehr und der Test liefe gruen ins Leere,
        // obwohl unveraendert ein Kartentext auf dem Schirm steht.
        if (datei !== 'kartentext-hinweis.js') {
            let w = code.indexOf('KartentextHinweis.waehlen');
            while (w !== -1) {
                const nr = roh.slice(0, w).split('\n').length;
                gruppen.anzeige.push({ datei, nr, zeile: zeilen[nr - 1].trim(),
                                       index: w, quelle: roh });
                w = code.indexOf('KartentextHinweis.waehlen', w + 1);
            }
        }
    }
    return gruppen;
}

const ERHEBUNG = erhebung();
const ort = (e) => `js/${e.datei}:${e.nr}  ${e.zeile}`;

// ── Die Module laden ─────────────────────────────────────────────────

function ladeModule() {
    const vorher = {
        document: global.document,
        localStorage: global.localStorage,
        fetch: global.fetch,
    };
    global.window = global.window || {};
    global.document = {
        addEventListener: () => {},
        removeEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
    };
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    global.fetch = async () => ({ ok: false });
    try {
        vm.runInThisContext(lies('js/kartentext-hinweis.js'),
                            { filename: 'js/kartentext-hinweis.js' });
        vm.runInThisContext(lies('js/app-profile-deck-builder.js'),
                            { filename: 'js/app-profile-deck-builder.js' });
    } finally {
        global.document     = vorher.document;
        global.localStorage = vorher.localStorage;
        global.fetch        = vorher.fetch;
    }
    return { H: global.window.KartentextHinweis, PDB: global.window.ProfileDeckBuilder };
}

const { H, PDB } = ladeModule();

/**
 * Oeffnet das Zoom-Fenster gegen einen DOM-Ersatz und gibt das
 * ERZEUGTE HTML zurueck. Kein jsdom (der Testschritt in
 * deploy-pages.yml installiert nur papaparse) — der Ersatz kann genau
 * das, was openZoomModal anfasst.
 */
function zoomHtml(karte, sprache) {
    const vorher = { document: global.document, getLang: global.window.getLang };
    let erfasst = null;
    const kind = () => ({ addEventListener: () => {}, focus: () => {} });
    global.document = {
        addEventListener: () => {},
        removeEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
        createElement: () => {
            erfasst = {
                id: '', className: '', innerHTML: '',
                addEventListener: () => {},
                classList: { add: () => {}, remove: () => {} },
                querySelector: () => kind(),
                remove: () => {},
            };
            return erfasst;
        },
        body: { appendChild: () => {} },
    };
    global.window.getLang = () => sprache;
    try {
        PDB.openZoomModal(karte);
    } finally {
        global.document = vorher.document;
        global.window.getLang = vorher.getLang;
    }
    return erfasst ? erfasst.innerHTML : '';
}

const KARTE = {
    name_en: 'Oddish', name_de: 'Myrapla', set: 'OBF', number: '1',
    type: 'Basic', energy_type: 'Grass', hp: '50',
    image_url: 'https://example.invalid/oddish.png',
    card_text: "C Feelin' Fine || Draw a card. || G Stampede 10",
};
const KARTE_OHNE_TEXT = Object.assign({}, KARTE, { card_text: '' });

// ═════════════════════════════════════════════════════════════════════

describe('Erhebung: jede Anzeigestelle von card_text traegt die Kennzeichnung', () => {

    it('es gibt ueberhaupt Anzeigestellen — sonst prueft der Test nichts', () => {
        assert.ok(ERHEBUNG.anzeige.length >= 1,
            'Kein einziger anzeigender Zugriff auf card_text gefunden. Entweder ist die ' +
            'Anzeige verschwunden, oder die Erhebung greift ins Leere — beides muss ' +
            'auffallen, sonst ist diese Datei ein gruener Test ohne Gegenstand.');
    });

    for (const e of ERHEBUNG.anzeige) {
        it(`${ort(e)} ruft die Kennzeichnung auf`, () => {
            const fn = funktionsRumpf(e.quelle, e.index);
            assert.ok(fn, `Zu ${ort(e)} liess sich keine umgebende Funktion bestimmen — ` +
                          'die Erhebung kann die Kennzeichnung dort nicht pruefen.');
            assert.match(fn.rumpf, /KartentextHinweis/,
                `${ort(e)}\nliegt in ${fn.name}() und zeigt einen englischen Kartentext, ` +
                'ohne window.KartentextHinweis aufzurufen.\n\n' +
                'Der Betreiber hat am 10.09.2026 entschieden: "Englisch zeigen, sichtbar ' +
                'gekennzeichnet". Die Kennzeichnung wird NICHT an der Anzeigestelle neu ' +
                'gebaut, sondern aus js/kartentext-hinweis.js geholt:\n' +
                '    window.KartentextHinweis.umhuellen(<fertiges HTML>, <sprache>)\n\n' +
                'Ist die Fundstelle in Wahrheit keine Anzeige (Suche, Umbau), dann gehoert ' +
                'sie in die passende Gruppe der Erhebung oben — und die Inventur unten ' +
                'zaehlt entsprechend um.');
        });
    }

    it('die Inventur aller card_text-Zugriffe stimmt', () => {
        // Gemessen am 10.09.2026 ueber alle 91 Dateien direkt unter js/.
        // Diese Zahlen sind KEIN Selbstzweck: eine neue Fundstelle
        // veraendert genau eine davon, und wer sie hochzaehlt, hat die
        // Stelle angesehen und einsortiert. Genau das ist der Zweck.
        const ist = {
            zeichenkette: ERHEBUNG.zeichenkette.length,
            uebernahme:   ERHEBUNG.uebernahme.length,
            suche:        ERHEBUNG.suche.length,
            auswahl:      ERHEBUNG.auswahl.length,
            anzeige:      ERHEBUNG.anzeige.length,
        };
        // 21.09.2026, nachgezaehlt nach dem Umbau auf zwei Sprachen.
        // Die Erhebung kennt jetzt BEIDE Feldnamen, deshalb steigen
        // die Zahlen ueberall dort, wo der Deckbauer das deutsche
        // Gegenstueck mitfuehrt:
        //   uebernahme  6 -> 12  (vier Stellen, je doppelt gezaehlt,
        //                         weil `blanke` Zuweisung und Lesen
        //                         auf derselben Zeile getrennt findet)
        //   suche       2 ->  4  (die zweite Zeile sucht im DE-Text)
        //   auswahl     -  ->  4  (die beiden Lesezugriffe in waehlen)
        //   anzeige     1 ->  1  (unveraendert eine Stelle, jetzt ueber
        //                         KartentextHinweis.waehlen gefunden)
        const soll = { zeichenkette: 1, uebernahme: 12, suche: 4,
                       auswahl: 4, anzeige: 1 };
        const liste = ['zeichenkette', 'uebernahme', 'suche', 'auswahl', 'anzeige']
            .map(k => `  ${k}: ${ist[k]} (erwartet ${soll[k]})\n` +
                      ERHEBUNG[k].map(e => '      ' + ort(e)).join('\n'))
            .join('\n');
        assert.deepEqual(ist, soll,
            'Die Zahl der card_text-Zugriffe in js/ hat sich veraendert:\n' + liste +
            '\n\nNeue Anzeigestelle? Dann Kennzeichnung einbauen und hier hochzaehlen.');
    });
});

describe('Das Zoom-Fenster im Profil-Deckbauer, ausgefuehrt', () => {

    it('deutsche Oberflaeche: Abzeichen, Erklaerung und der englische Text', () => {
        const html = zoomHtml(KARTE, 'de');
        assert.match(html, /class="kartentext-hinweis"/, 'kein Abzeichen im erzeugten HTML');
        assert.match(html, /Kartentext auf Englisch/, 'die Beschriftung fehlt');
        assert.match(html, /title="Die Quelle liefert Kartentexte nur auf Englisch\."/,
            'die title-Erklaerung fehlt');
        assert.match(html, />EN</, 'der EN-Chip fehlt');
        assert.ok(html.indexOf('Draw a card.') !== -1,
            'der Kartentext selbst ist bei der Kennzeichnung verloren gegangen');
    });

    it('das Abzeichen steht VOR dem Text, nicht irgendwo darunter', () => {
        const html = zoomHtml(KARTE, 'de');
        assert.ok(html.indexOf('kartentext-hinweis') < html.indexOf('Draw a card.'),
            'die Kennzeichnung steht hinter dem Text — dann liest sie niemand vorher');
    });

    it('der englische Text steht in einem Traeger mit lang="en"', () => {
        const html = zoomHtml(KARTE, 'de');
        assert.match(html, /<div class="kartentext-original" lang="en">/,
            'ohne lang="en" liest jede Vorlesehilfe den englischen Text deutsch vor');
    });

    it('alle Textbloecke der Karte bleiben erhalten', () => {
        const html = zoomHtml(KARTE, 'de');
        // Drei Bloecke, getrennt durch das Limitless-' || '.
        assert.ok(html.indexOf('Feelin&#39; Fine') !== -1, 'erster Block fehlt (oder ist unmaskiert)');
        assert.ok(html.indexOf('Draw a card.') !== -1, 'zweiter Block fehlt');
        assert.ok(html.indexOf('G Stampede 10') !== -1, 'dritter Block fehlt');
    });

    it('englische Oberflaeche: dieselbe Kennzeichnung, englisch beschriftet', () => {
        const html = zoomHtml(KARTE, 'en');
        assert.match(html, /class="kartentext-hinweis"/);
        assert.match(html, /Card text in English/);
        assert.ok(html.indexOf('Kartentext auf Englisch') === -1,
            'deutsche Beschriftung in der englischen Oberflaeche');
    });

    it('ohne Kartentext kein Abzeichen — es gaebe nichts zu kennzeichnen', () => {
        const html = zoomHtml(KARTE_OHNE_TEXT, 'de');
        assert.ok(html.indexOf('kartentext-hinweis') === -1,
            'Abzeichen ohne Kartentext: kennzeichnet die Abwesenheit von Text');
        assert.match(html, /Kein Kartentext verf/, 'der Ersatzsatz fehlt');
    });
});

describe('Die Kennzeichnung selbst', () => {

    it('umhuellen maskiert das uebergebene HTML NICHT noch einmal', () => {
        // Die Anzeigestelle hat schon maskiert und in <p> zerlegt. Ein
        // zweiter Durchgang wuerde daraus sichtbares &lt;p&gt; machen.
        const html = H.umhuellen('<p>Draw a card.</p>', 'de');
        assert.ok(html.indexOf('<p>Draw a card.</p>') !== -1);
        assert.ok(html.indexOf('&lt;p&gt;') === -1, 'doppelt maskiert');
    });

    it('die Erklaerung im title ist maskiert', () => {
        const roh = lies('js/kartentext-hinweis.js');
        assert.match(roh, /title="' \+\s*\n?\s*esc\(l\.titel\)/,
            'der title-Wert geht unmaskiert ins Markup');
    });

    it('eine unbekannte Sprachangabe faellt auf Englisch zurueck, nicht auf undefined', () => {
        const vorher = global.window.getLang;
        global.window.getLang = undefined;
        try {
            const html = H.abzeichen('klingonisch');
            assert.match(html, /Card text in English/);
            assert.ok(html.indexOf('undefined') === -1);
        } finally {
            global.window.getLang = vorher;
        }
    });

    it('ohne Vorgabe entscheidet window.getLang', () => {
        const vorher = global.window.getLang;
        global.window.getLang = () => 'de';
        try {
            assert.match(H.abzeichen(), /Kartentext auf Englisch/);
        } finally {
            global.window.getLang = vorher;
        }
    });
});

describe('Vertraeglich mit der Sprachreinheitspruefung', () => {

    // tests/e2e_i18n_language_purity.py liest sichtbaren Text aus
    // [data-i18n] sowie aus h1..h5, label, button, a, .tab-btn und
    // .menu-item-label. Steht englischer Kartentext in einem dieser
    // Traeger, meldet die Pruefung zu Recht Fremdtext in der deutschen
    // Oberflaeche. Dieselbe Ueberlegung steht in js/ds-pocket.js bei
    // den englischen Game8-Decknamen (role="heading" statt <h3>).

    const GEPRUEFTE_TRAEGER = /<\s*(h[1-5]|label|button|a)\b/i;

    it('das Abzeichen benutzt keinen der geprueften Traeger', () => {
        assert.doesNotMatch(H.abzeichen('de'), GEPRUEFTE_TRAEGER);
        assert.doesNotMatch(H.abzeichen('en'), GEPRUEFTE_TRAEGER);
    });

    it('der englische Kartentext steht in keinem der geprueften Traeger', () => {
        const html = zoomHtml(KARTE, 'de');
        // Genau den Traeger des Kartentextes herausschneiden, nicht den
        // Rest des Fensters: darunter steht der Knopf "Ins Deck", und
        // der ist ein <button> mit deutschem Text — er hat mit dem
        // englischen Kartentext nichts zu tun.
        const treffer = html.match(/<div class="kartentext-original" lang="en">([\s\S]*?)<\/div>/);
        assert.ok(treffer, 'der Traeger des Kartentextes ist nicht auffindbar');
        assert.doesNotMatch(treffer[1], GEPRUEFTE_TRAEGER,
            'der englische Kartentext steckt in einem Traeger, den die ' +
            'Sprachreinheitspruefung liest — dort faellt er zu Recht als Fremdtext auf');
    });

    it('das Abzeichen traegt kein data-i18n — es baut seinen Text selbst', () => {
        assert.ok(H.abzeichen('de').indexOf('data-i18n') === -1,
            'mit data-i18n wuerde der Renderer den Text ueberschreiben und die ' +
            'Sprachtabelle braeuchte zwei weitere Schluessel');
    });
});

describe('Ausgeliefert wird die Kennzeichnung auch', () => {

    it('index.html laedt kartentext-hinweis.js VOR app-profile-deck-builder.js', () => {
        const helfer = HTML.indexOf('js/kartentext-hinweis.js');
        const nutzer = HTML.indexOf('js/app-profile-deck-builder.js');
        assert.ok(helfer !== -1, 'js/kartentext-hinweis.js ist nicht eingebunden');
        assert.ok(nutzer !== -1, 'js/app-profile-deck-builder.js ist nicht eingebunden');
        assert.ok(helfer < nutzer,
            'Die Anzeigestelle ruft window.KartentextHinweis ohne Rueckfall auf. ' +
            'Steht der Helfer dahinter, ist er beim Aufruf nicht da und das ' +
            'Zoom-Fenster bleibt leer.');
    });

    it('beide neuen Dateien sind cache-gebustet', () => {
        assert.match(HTML, /js\/kartentext-hinweis\.js\?v=\d{12}/);
        assert.match(HTML, /css\/kartentext-hinweis\.css\?v=\d{12}/);
    });

    it('der Service Worker kennt beide — sonst fehlt die Kennzeichnung offline', () => {
        assert.match(SW, /'\.\/js\/kartentext-hinweis\.js'/);
        assert.match(SW, /'\.\/css\/kartentext-hinweis\.css'/);
    });

    it('die Stilklassen des Abzeichens sind auch wirklich gestaltet', () => {
        for (const k of ['kartentext-hinweis', 'kartentext-hinweis-chip',
                         'kartentext-hinweis-text', 'kartentext-original']) {
            assert.ok(CSS.indexOf('.' + k) !== -1, `.${k} fehlt in css/kartentext-hinweis.css`);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
//
// ZWEI SPRACHEN (21.09.2026)
// ==========================
// Bis zum 20.09.2026 fuehrte die Kartendatenbank den Kartentext nur auf
// Englisch, und das Abzeichen hat das zu Recht behauptet.
// backend/scrapers/scrape_kartentexte.py fuellt seitdem `card_text_de`
// fuer Standard und Extended — gemessene Abdeckung 96,5 % bzw. 99,9 %;
// Legacy bleibt leer, weil limitlesstcg.com dort nur 60,4 % uebersetzt
// fuehrt.
//
// Damit wird aus einer festen Aussage eine Frage an die Daten. Genau
// dafuer gibt es in CLAUDE.md die Regel „EIN SATZ, DER EINE TATSACHE
// BEHAUPTET, IST CODE": der Hinweis darf nicht mehr behaupten, es gebe
// nur Englisch, sobald fuer DIESE Karte ein deutscher Text vorliegt.
//
// ═════════════════════════════════════════════════════════════════════

const KARTE_DE = Object.assign({}, KARTE, {
    card_text_de: '[Ability] Kollateraler Kopfstoss || Wirf 1 Muenze. || FF Krawallhammer 150',
});

describe('Der Kartentext folgt der Datenlage, nicht einer Annahme', () => {

    it('deutscher Text vorhanden + deutsche Oberflaeche: er wird gezeigt', () => {
        const w = H.waehlen(KARTE_DE, 'de');
        assert.equal(w.textsprache, 'de');
        assert.equal(w.gekennzeichnet, false);
        assert.ok(w.text.indexOf('Krawallhammer') !== -1,
            'der deutsche Text ist nicht durchgereicht worden');
    });

    it('deutscher Text vorhanden, aber Oberflaeche auf Englisch: englischer Text', () => {
        const w = H.waehlen(KARTE_DE, 'en');
        assert.equal(w.textsprache, 'en');
        assert.equal(w.gekennzeichnet, true,
            'auf englischer Oberflaeche ist der englische Text der richtige — ' +
            'gekennzeichnet wird trotzdem, denn er IST die englische Quelle');
        assert.ok(w.text.indexOf('Stampede') !== -1);
    });

    it('kein deutscher Text (Legacy): Rueckfall auf Englisch MIT Abzeichen', () => {
        const w = H.waehlen(KARTE, 'de');
        assert.equal(w.textsprache, 'en');
        assert.equal(w.gekennzeichnet, true);
    });

    it('gar kein Text: nichts zu kennzeichnen', () => {
        const w = H.waehlen(KARTE_OHNE_TEXT, 'de');
        assert.equal(w.text, '');
        assert.equal(w.gekennzeichnet, false,
            'ein Abzeichen ueber einer leeren Flaeche behauptet einen Text, ' +
            'den es nicht gibt');
    });

    it('eine Karte ohne jedes Feld bringt waehlen nicht um', () => {
        const w = H.waehlen(undefined, 'de');
        assert.equal(w.text, '');
        assert.equal(w.gekennzeichnet, false);
    });

    it('das Zoom-Fenster zeigt den deutschen Text OHNE Abzeichen', () => {
        const html = zoomHtml(KARTE_DE, 'de');
        assert.ok(html.indexOf('Krawallhammer') !== -1,
            'der deutsche Kartentext steht nicht im erzeugten HTML');
        assert.ok(html.indexOf('Stampede') === -1,
            'der englische Text steht daneben — dann waeren es zwei Kartentexte');
        assert.ok(html.indexOf('kartentext-hinweis') === -1,
            'Das Abzeichen „Kartentext auf Englisch" steht ueber einem DEUTSCHEN ' +
            'Text. Genau diese Sorte Satz meint CLAUDE.md mit „ein Satz, der eine ' +
            'Tatsache behauptet, ist Code".');
    });

    it('und setzt lang="de" — sonst liest die Vorlesesoftware Deutsch englisch', () => {
        const html = zoomHtml(KARTE_DE, 'de');
        assert.match(html, /class="kartentext-original" lang="de"/);
    });

    it('ohne deutschen Text bleibt alles wie bisher: Abzeichen und lang="en"', () => {
        const html = zoomHtml(KARTE, 'de');
        assert.match(html, /class="kartentext-hinweis"/);
        assert.match(html, /class="kartentext-original" lang="en"/);
    });

    it('die Suche findet auch den deutschen Text', () => {
        // Sonst sucht ein deutscher Nutzer nach einem Wort, das er auf
        // der Karte vor sich sieht, und bekommt nichts.
        const quelle = lies('js/app-profile-deck-builder.js');
        const fn = quelle.slice(quelle.indexOf('function matchesSearch'));
        const rumpf = fn.slice(0, fn.indexOf('\n    }') + 6);
        assert.match(rumpf, /card_text_de/,
            'matchesSearch durchsucht card_text, aber nicht card_text_de');
    });
});
