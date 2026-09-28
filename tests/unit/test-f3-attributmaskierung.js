/**
 * MASKIERUNG IN DER RICHTIGEN REIHENFOLGE — HTML VOR JS.
 *
 * WORUM ES GEHT
 * -------------
 * Die Karten- und Deckknoepfe setzen einen Namen in ein onclick ein.
 * Der Name steht dort in ZWEI Sprachen gleichzeitig: er ist Teil einer
 * JS-Zeichenkette, und diese JS-Zeichenkette ist Teil eines
 * HTML-Attributwerts.
 *
 *   <button onclick="addCardToProxy('NAME', '', '', 1)">
 *                    └───────── HTML-Attributwert ─────────┘
 *                                 └ JS-Zeichenkette ┘
 *
 * Der Browser zerteilt in dieser Reihenfolge: erst HTML, dann JS. Wer
 * nur fuer JS maskiert, maskiert zu spaet.
 *
 * BEFUND (07.09.2026), hier behoben
 * ---------------------------------
 * An 38 Stellen in vier Modulen stand `escapeJsStr(name)` allein in
 * einem HTML-Attribut. escapeJsStr macht aus " ein \" — im HTML ist der
 * Rueckstrich aber ein gewoehnliches Zeichen, und das " danach BEENDET
 * das Attribut.
 *
 *   Eingabe   cardName = 'x" onmouseover=alert(1) y="'
 *   erwartet  ein einziges onclick-Attribut im Tag
 *   gemessen  <button onclick="addCardToProxy('x\" onmouseover=alert(1) y=\"', …)">
 *             vier " statt zwei; der Tag traegt ein ZWEITES Attribut
 *             onmouseover mit dem Wert alert(1).
 *
 * WELCHE REIHENFOLGE — GEMESSEN, NICHT GERATEN
 * --------------------------------------------
 * Beide Verschachtelungen ergeben genau zwei " im Tag. Am Zaehlen der
 * Anfuehrungszeichen ist die Frage also NICHT zu entscheiden. Erst wenn
 * man beide Zerteiler nacheinander laufen laesst, trennt sich das:
 *
 *   Eingabe "Boss's Orders"
 *     A escapeHtmlAttr(escapeJsStr(x))  -> Boss\&#39;s Orders
 *       HTML loest &#39; auf -> 'Boss\'s Orders'  -> JS liest Boss's Orders  ✓
 *     B escapeJsStr(escapeHtmlAttr(x))  -> Boss&#39;s Orders
 *       escapeJsStr findet kein ' mehr und tut nichts. HTML loest &#39;
 *       DANACH auf -> 'Boss's Orders' -> SyntaxError.                      ✗
 *
 * B ist also nicht nur unsauber, sondern bricht an jedem gewoehnlichen
 * Kartennamen mit Apostroph. Richtig ist A: erst JS, dann HTML — der
 * aeussere Zerteiler maskiert zuletzt.
 *
 * KEIN jsdom, KEINE LIVEDATEN
 * ---------------------------
 * .github/workflows/deploy-pages.yml installiert nur papaparse. Die
 * beiden Zerteiler unten sind deshalb selbst gebaut: `startTagAttribute`
 * liest einen Start-Tag so, wie der HTML-Zerteiler ihn liest
 * (Anfuehrungszeichen begrenzen, Entitaeten aufloesen), und die
 * JS-Stufe laeuft in node:vm — echtes JS, keine Nachbildung. Jede
 * Eingabe setzt der Test selbst.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, 'js', datei), 'utf8');

/** Eine Funktionsdeklaration per Namen aus `src` schneiden. */
function funktion(src, name, datei) {
    const re = new RegExp(`(^|\\n)\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`);
    const m = re.exec(src);
    assert.ok(m, `Funktion nicht mehr in js/${datei}: ${name}`);
    const start = src.indexOf('function', m.index);
    let tiefe = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}' && --tiefe === 0) return src.slice(start, i + 1);
    }
    throw new Error(name + ': die Klammern gehen nicht auf');
}

// Die beiden Masken kommen aus der echten Datei, nicht aus einer Abschrift.
const UTILS = lies('app-utils.js');
const MASKEN = (() => {
    const kasten = { String };
    vm.createContext(kasten);
    vm.runInContext(
        funktion(UTILS, 'escapeHtmlAttr', 'app-utils.js') + '\n'
        + funktion(UTILS, 'escapeJsStr', 'app-utils.js'), kasten);
    return kasten;
})();
const escapeHtmlAttr = MASKEN.escapeHtmlAttr;
const escapeJsStr = MASKEN.escapeJsStr;

// ══════════════════════════════════════════════════════════════════
// STUFE 1 — der HTML-Zerteiler
// ══════════════════════════════════════════════════════════════════

/** Die fuenf Entitaeten aufloesen, die escapeHtmlAttr erzeugt. */
function entitaetenAuf(roh) {
    return String(roh)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/**
 * Die Attribute des ERSTEN Start-Tags lesen — so, wie der HTML-Zerteiler
 * sie liest. Ein Anfuehrungszeichen im Wert beendet den Wert; was danach
 * kommt, ist ein NEUES Attribut. Genau daran erkennt der Test den
 * Ausbruch, statt Anfuehrungszeichen zu zaehlen.
 *
 * Rueckgabe: Array aus { name, wert }, Werte mit aufgeloesten Entitaeten.
 */
function startTagAttribute(markup) {
    const auf = markup.indexOf('<');
    assert.ok(auf >= 0, 'kein Start-Tag im Markup');
    let i = auf + 1;
    while (i < markup.length && /[^\s/>]/.test(markup[i])) i++;   // Tagname
    const attrs = [];
    while (i < markup.length) {
        while (i < markup.length && /\s/.test(markup[i])) i++;
        if (i >= markup.length || markup[i] === '>' || markup[i] === '/') break;
        let n = '';
        while (i < markup.length && !/[\s=/>]/.test(markup[i])) n += markup[i++];
        while (i < markup.length && /\s/.test(markup[i])) i++;
        if (markup[i] !== '=') { attrs.push({ name: n, wert: '' }); continue; }
        i++;                                                       // das =
        while (i < markup.length && /\s/.test(markup[i])) i++;
        let w = '';
        if (markup[i] === '"' || markup[i] === "'") {
            const grenze = markup[i++];
            while (i < markup.length && markup[i] !== grenze) w += markup[i++];
            i++;                                                   // Grenze zu
        } else {
            while (i < markup.length && !/[\s>]/.test(markup[i])) w += markup[i++];
        }
        attrs.push({ name: n, wert: entitaetenAuf(w) });
    }
    return attrs;
}

// ══════════════════════════════════════════════════════════════════
// STUFE 2 — der JS-Zerteiler (echtes JS, node:vm)
// ══════════════════════════════════════════════════════════════════

/** Den Attributwert als JS ausfuehren und aufzeichnen, was ankam. */
function jsLauf(code) {
    const gesehen = [];
    let fehler = null;
    const kasten = {
        addCardToProxy: (...a) => gesehen.push(['addCardToProxy', ...a]),
        addCardToDeck: (...a) => gesehen.push(['addCardToDeck', ...a]),
        removeCardFromDeck: (...a) => gesehen.push(['removeCardFromDeck', ...a]),
        openRaritySwitcher: (...a) => gesehen.push(['openRaritySwitcher', ...a]),
        openRaritySwitcherFromDB: (...a) => gesehen.push(['openRaritySwitcherFromDB', ...a]),
        openCardmarket: (...a) => gesehen.push(['openCardmarket', ...a]),
        addToWishlist: (...a) => gesehen.push(['addToWishlist', ...a]),
        showSingleCard: (...a) => gesehen.push(['showSingleCard', ...a]),
        selectCardName: (...a) => gesehen.push(['selectCardName', ...a]),
        jumpToCardAnalysis: (...a) => gesehen.push(['jumpToCardAnalysis', ...a]),
        openArchetypeCard: (...a) => gesehen.push(['openArchetypeCard', ...a]),
        analyzeCombinedArchetype: (...a) => gesehen.push(['analyzeCombinedArchetype', ...a]),
        navigateToAnalysisWithDeck: (...a) => gesehen.push(['navigateToAnalysisWithDeck', ...a]),
        navigateToCMAnalysisWithCombinedDeck: (...a) => gesehen.push(['navigateToCMAnalysisWithCombinedDeck', ...a]),
        alert: (...a) => gesehen.push(['alert', ...a]),
        event: { stopPropagation() {} },
        decodeURIComponent, JSON,
    };
    vm.createContext(kasten);
    try { vm.runInContext(code, kasten, { timeout: 1000 }); }
    catch (e) { fehler = e.constructor.name; }
    return { gesehen, fehler };
}

/** Beide Zerteiler hintereinander — so, wie der Browser es tut. */
function durchBeideZerteiler(markup, attrName = 'onclick') {
    const attrs = startTagAttribute(markup);
    const treffer = attrs.filter(a => a.name.toLowerCase() === attrName);
    assert.equal(treffer.length, 1, `${attrName} genau einmal erwartet`);
    return { attrs, ...jsLauf(treffer[0].wert) };
}

const ereignisAttribute = (attrs) =>
    attrs.map(a => a.name.toLowerCase()).filter(n => n.startsWith('on'));

// Die Angriffsformen, die durch jede reparierte Stelle laufen.
const ANGRIFFE = [
    ['Attributausbruch ueber "',      'x" onmouseover=alert(1) y="'],
    ['Attributausbruch mit \\"',      'x\\" onmouseover=alert(1) y=\\"'],
    ['Zeichenkettenausbruch ueber \'', "x'); alert(1); ('"],
    ['Tag-Einschleusung',             '<script>alert(1)</script>'],
    ['Adresse mit javascript:',       'javascript:alert(1)'],
    ['Ereignisattribut im Namen',     '" onerror="alert(1)'],
    ['Tagabbruch',                    '"><img src=x onerror=alert(1)>'],
    ['Rueckstrich am Ende',           'Ende\\'],
    ['kaufmaennisches Und',           'Farfetch&d &quot; &amp;'],
    ['Zeilenumbruch',                 'a\nb\rc'],
    ['gewoehnlicher Genitiv',         "Boss's Orders"],
    ['typografischer Genitiv',        'N’s Zoroark ex'],
];

// ══════════════════════════════════════════════════════════════════
// (1) DIE REIHENFOLGE — welche Verschachtelung ist die richtige
// ══════════════════════════════════════════════════════════════════

describe('die Reihenfolge der Maskierung — gemessen, nicht behauptet', () => {
    it('escapeJsStr ALLEIN bricht aus dem Attribut aus (der Befund)', () => {
        const name = 'x" onmouseover=alert(1) y="';
        const markup = `<button onclick="addCardToProxy('${escapeJsStr(name)}', '', '', 1)">P</button>`;
        const attrs = startTagAttribute(markup);
        // Der Tag traegt jetzt ZWEI Ereignisattribute statt einem.
        assert.deepEqual(ereignisAttribute(attrs), ['onclick', 'onmouseover'],
            'genau das ist der Befund: ein zweiter Ereignishaken entsteht');
        assert.equal(attrs.find(a => a.name === 'onmouseover').wert, 'alert(1)');
    });

    it('A = escapeHtmlAttr(escapeJsStr(x)) — ein Attribut, Name kommt heil an', () => {
        const name = 'x" onmouseover=alert(1) y="';
        const markup = `<button onclick="addCardToProxy('${escapeHtmlAttr(escapeJsStr(name))}', '', '', 1)">P</button>`;
        const { attrs, gesehen, fehler } = durchBeideZerteiler(markup);
        assert.equal(fehler, null);
        assert.deepEqual(ereignisAttribute(attrs), ['onclick'], 'nur ein Ereignishaken');
        assert.deepEqual(gesehen, [['addCardToProxy', name, '', '', 1]],
            'die Funktion bekommt den Namen unveraendert');
    });

    it('B = escapeJsStr(escapeHtmlAttr(x)) ist FALSCH HERUM — Beleg an "Boss\'s Orders"', () => {
        // Zwei " im Tag hat B auch. Der Unterschied zeigt sich erst,
        // wenn der HTML-Zerteiler &#39; aufloest — DANACH laeuft kein
        // JS-Maskierer mehr, und das ' beendet die Zeichenkette.
        const name = "Boss's Orders";
        const markupB = `<button onclick="addCardToProxy('${escapeJsStr(escapeHtmlAttr(name))}', '', '', 1)">P</button>`;
        assert.equal((markupB.match(/"/g) || []).length, 2,
            'am Zaehlen der Anfuehrungszeichen ist B nicht zu erkennen');
        const b = durchBeideZerteiler(markupB);
        assert.equal(b.fehler, 'SyntaxError', 'B zerbricht an einem gewoehnlichen Kartennamen');
        assert.deepEqual(b.gesehen, []);

        const markupA = `<button onclick="addCardToProxy('${escapeHtmlAttr(escapeJsStr(name))}', '', '', 1)">P</button>`;
        const a = durchBeideZerteiler(markupA);
        assert.equal(a.fehler, null);
        assert.deepEqual(a.gesehen, [['addCardToProxy', "Boss's Orders", '', '', 1]]);
    });

    it('B laesst sich mit einem Apostroph auch zum Einschleusen missbrauchen', () => {
        const name = "x'); alert(1); ('";
        const markupB = `<button onclick="addCardToProxy('${escapeJsStr(escapeHtmlAttr(name))}', '', '', 1)">P</button>`;
        const b = durchBeideZerteiler(markupB);
        assert.ok(b.gesehen.some(e => e[0] === 'alert'),
            'B fuehrt den eingeschleusten alert(1) aus — genau der Fehler, der behoben werden sollte');

        const markupA = `<button onclick="addCardToProxy('${escapeHtmlAttr(escapeJsStr(name))}', '', '', 1)">P</button>`;
        const a = durchBeideZerteiler(markupA);
        assert.equal(a.gesehen.some(e => e[0] === 'alert'), false, 'A nicht');
        assert.deepEqual(a.gesehen, [['addCardToProxy', name, '', '', 1]]);
    });

    it('DOPPELT maskieren zeigt dem Nutzer &amp;quot; — deshalb nicht zweimal escapeHtmlAttr', () => {
        // Die andere Falle: escapeHtmlAttr auf einen bereits maskierten
        // Wert. Aus " wird &quot;, daraus &amp;quot;, und der Nutzer
        // liest den Entitaetentext im Titel statt des Zeichens.
        const einfach = escapeHtmlAttr('Farfetch"d');
        const doppelt = escapeHtmlAttr(escapeHtmlAttr('Farfetch"d'));
        assert.equal(einfach, 'Farfetch&quot;d');
        assert.equal(doppelt, 'Farfetch&amp;quot;d');
        const [attr] = startTagAttribute(`<div title="${doppelt}"></div>`);
        assert.equal(attr.wert, 'Farfetch&quot;d', 'der Nutzer saehe die Entitaet als Text');
        // Die richtige Reihenfolge tut das NICHT.
        const [ok] = startTagAttribute(`<div title="${escapeHtmlAttr('Farfetch"d')}"></div>`);
        assert.equal(ok.wert, 'Farfetch"d');
    });

    it('escapeHtmlAttr ist umkehrbar — der Name geht durch das HTML nicht verloren', () => {
        for (const [, name] of ANGRIFFE) {
            assert.equal(entitaetenAuf(escapeHtmlAttr(name)), name,
                `Rueckweg gebrochen bei ${JSON.stringify(name)}`);
        }
    });
});

// ══════════════════════════════════════════════════════════════════
// (2) EINSCHLEUSUNGSVERSUCHE DURCH JEDE REPARIERTE FORM
// ══════════════════════════════════════════════════════════════════

/**
 * Die Bauformen, die in den vier Modulen wirklich vorkommen. Jede Form
 * ist woertlich aus dem Modul uebernommen, nur die Umgebung ist gekuerzt.
 */
const FORMEN = [
    {
        name: 'Proxy-Knopf (app-city-league.js, app-deck-builder.js, app-meta-cards.js)',
        bau: (n) => `<button class="btn btn-red" onclick="addCardToProxy('${escapeHtmlAttr(escapeJsStr(n))}', 'SVI', '196', 1)" title="Proxy">P</button>`,
        erwartet: (n) => [['addCardToProxy', n, 'SVI', '196', 1]],
    },
    {
        name: 'Deck-Knopf mit Quelle, Set und Nummer',
        bau: (n) => `<button onclick="addCardToDeck('cityLeague', '${escapeHtmlAttr(escapeJsStr(n))}', 'SVI', '196')">+</button>`,
        erwartet: (n) => [['addCardToDeck', 'cityLeague', n, 'SVI', '196']],
    },
    {
        name: 'Entfernen-Knopf mit event.stopPropagation()',
        bau: (n) => `<button onclick="event.stopPropagation(); removeCardFromDeck('cityLeague', '${escapeHtmlAttr(escapeJsStr(n))}')">-</button>`,
        erwartet: (n) => [['removeCardFromDeck', 'cityLeague', n]],
    },
    {
        name: 'Artwork-Wechsel, derselbe Wert ZWEIMAL im selben Attribut',
        bau: (n) => `<button onclick="openRaritySwitcher('${escapeHtmlAttr(escapeJsStr(n))}', '${escapeHtmlAttr(escapeJsStr(n))} (SVI 196)')">★</button>`,
        erwartet: (n) => [['openRaritySwitcher', n, n + ' (SVI 196)']],
    },
    {
        name: 'Artwork-Wechsel aus der Datenbank, VIER Werte',
        bau: (n) => `<button onclick="openRaritySwitcherFromDB('${escapeHtmlAttr(escapeJsStr(n))}', '${escapeHtmlAttr(escapeJsStr('SVI'))}', '${escapeHtmlAttr(escapeJsStr('196'))}', 'staples')">★</button>`,
        erwartet: (n) => [['openRaritySwitcherFromDB', n, 'SVI', '196', 'staples']],
    },
    {
        name: 'Wunschlisten-Knopf (zusammengesetzte Kennung mit |)',
        bau: (n) => `<button onclick="addToWishlist('${escapeHtmlAttr(escapeJsStr(n + '|SVI|196'))}')">♡</button>`,
        erwartet: (n) => [['addToWishlist', n + '|SVI|196']],
    },
    {
        name: 'Bildvergroesserung — Wert MITTEN in einem groesseren Text',
        bau: (n) => `<img src="x.png" onclick="showSingleCard(this.src, '${escapeHtmlAttr(escapeJsStr(n))} (SVI 196)')">`,
        erwartet: (n) => [['showSingleCard', undefined, n + ' (SVI 196)']],
        vorbereiten: (k) => { k.this = { src: undefined }; },
    },
    {
        name: 'Archetyp-Sprung (app-city-league.js, app-meta-cards.js)',
        bau: (n) => `<a href="javascript:void(0)" onclick="jumpToCardAnalysis('${escapeHtmlAttr(escapeJsStr(n))}', 'cityLeague')" class="archetype-jump-link">x</a>`,
        erwartet: (n) => [['jumpToCardAnalysis', n, 'cityLeague']],
    },
    {
        name: 'Archetypkarte (app-tier-meta.js)',
        bau: (n) => `<div class="deck-banner-card" data-deck-name="${escapeHtmlAttr(String(n).toLowerCase())}" onclick="openArchetypeCard('${escapeHtmlAttr(escapeJsStr(n))}')">x</div>`,
        erwartet: (n) => [['openArchetypeCard', n]],
    },
    {
        name: 'Sammelarchetyp mit JSON-Nutzlast im zweiten Wert',
        bau: (n) => `<td onclick="analyzeCombinedArchetype('${escapeHtmlAttr(escapeJsStr(n))}', '${escapeHtmlAttr(escapeJsStr(encodeURIComponent(JSON.stringify([n, 'B']))))}')">x</td>`,
        erwartet: (n) => [['analyzeCombinedArchetype', n, encodeURIComponent(JSON.stringify([n, 'B']))]],
    },
    {
        name: 'Cardmarket-Knopf (Adresse UND Name im selben Attribut)',
        bau: (n) => `<button onclick="openCardmarket('${escapeHtmlAttr(escapeJsStr('https://x.invalid/' + n))}', '${escapeHtmlAttr(escapeJsStr(n))}')" data-market-cursor="pointer">€</button>`,
        erwartet: (n) => [['openCardmarket', 'https://x.invalid/' + n, n]],
    },
    {
        name: 'Kartenliste anklicken (app-meta-cards.js)',
        bau: (n) => `<div onclick="selectCardName('${escapeHtmlAttr(escapeJsStr(n))}', 'currentMeta')" class="meta-card-list-item">x</div>`,
        erwartet: (n) => [['selectCardName', n, 'currentMeta']],
    },
    {
        name: 'Tastatur-Zwilling: onclick UND onkeydown (app-tier-meta.js:1329/1330)',
        bau: (n) => `<div onclick="navigateToAnalysisWithDeck('${escapeHtmlAttr(escapeJsStr(n))}')" onkeydown="if(event.key==='Enter'){navigateToAnalysisWithDeck('${escapeHtmlAttr(escapeJsStr(n))}');}">x</div>`,
        erwartet: (n) => [['navigateToAnalysisWithDeck', n]],
        ereignisse: ['onclick', 'onkeydown'],
    },
];

describe('Einschleusungsversuche durch jede reparierte Bauform', () => {
    for (const form of FORMEN) {
        for (const [was, name] of ANGRIFFE) {
            it(`${form.name} — ${was}`, () => {
                const markup = form.bau(name);
                const attrs = startTagAttribute(markup);

                // (a) Der Tag traegt GENAU die Ereignisattribute, die er
                //     tragen soll — kein eingeschmuggeltes dazu.
                assert.deepEqual(ereignisAttribute(attrs), form.ereignisse || ['onclick'],
                    'ein Ereignisattribut ist dazugekommen: ' + markup);

                // (b) Keine Adresse traegt etwas aus dem NAMEN. Das
                //     feste href="javascript:void(0)" der Sprunglinks ist
                //     erlaubt — es steht so im Modul; alles andere nicht.
                for (const a of attrs) {
                    if (!['href', 'src', 'xlink:href'].includes(a.name.toLowerCase())) continue;
                    assert.equal(a.wert.includes(name), false,
                        `${a.name} traegt den Namen — dort gehoert er nicht hin`);
                    if (/^\s*javascript:/i.test(a.wert)) {
                        assert.equal(a.wert, 'javascript:void(0)',
                            `${a.name} traegt eine fremde javascript:-Adresse`);
                    }
                }

                // (c) Kein <script> und kein zusaetzlicher Tag entstanden.
                assert.equal(/<script/i.test(markup), false, 'ein <script> ist entstanden');
                assert.equal((markup.match(/</g) || []).length,
                             (markup.match(/>/g) || []).length,
                             'Tagklammern gehen nicht mehr auf');

                // (d) Beide Zerteiler laufen lassen: kein SyntaxError,
                //     und die Funktion bekommt genau den Namen zurueck.
                const wert = attrs.find(a => a.name === 'onclick').wert;
                const gesehen = [];
                let fehler = null;
                const kasten = {
                    addCardToProxy: (...a) => gesehen.push(['addCardToProxy', ...a]),
                    addCardToDeck: (...a) => gesehen.push(['addCardToDeck', ...a]),
                    removeCardFromDeck: (...a) => gesehen.push(['removeCardFromDeck', ...a]),
                    openRaritySwitcher: (...a) => gesehen.push(['openRaritySwitcher', ...a]),
                    openRaritySwitcherFromDB: (...a) => gesehen.push(['openRaritySwitcherFromDB', ...a]),
                    openCardmarket: (...a) => gesehen.push(['openCardmarket', ...a]),
                    addToWishlist: (...a) => gesehen.push(['addToWishlist', ...a]),
                    showSingleCard: (...a) => gesehen.push(['showSingleCard', ...a]),
                    selectCardName: (...a) => gesehen.push(['selectCardName', ...a]),
                    jumpToCardAnalysis: (...a) => gesehen.push(['jumpToCardAnalysis', ...a]),
                    openArchetypeCard: (...a) => gesehen.push(['openArchetypeCard', ...a]),
                    analyzeCombinedArchetype: (...a) => gesehen.push(['analyzeCombinedArchetype', ...a]),
                    navigateToAnalysisWithDeck: (...a) => gesehen.push(['navigateToAnalysisWithDeck', ...a]),
                    alert: (...a) => gesehen.push(['alert', ...a]),
                    event: { stopPropagation() {}, key: 'x' },
                };
                if (form.vorbereiten) form.vorbereiten(kasten);
                vm.createContext(kasten);
                try { vm.runInContext(wert, kasten, { timeout: 1000 }); }
                catch (e) { fehler = e.constructor.name + ': ' + e.message; }

                assert.equal(fehler, null, 'das onclick ist kein gueltiges JS mehr');
                assert.equal(gesehen.some(e => e[0] === 'alert'), false,
                    'ein eingeschleustes alert(1) wurde ausgefuehrt');
                assert.deepEqual(gesehen, form.erwartet(name),
                    'der Name kommt nicht unveraendert an');
            });
        }
    }
});

// ══════════════════════════════════════════════════════════════════
// (3) DIE QUELLEN — keine nackte escapeJsStr in einem HTML-Attribut
// ══════════════════════════════════════════════════════════════════

/*
 * Die Zusicherungen oben pruefen die BAUFORM. Diese hier prueft, dass
 * die vier Module sie auch wirklich benutzen — und zwar an JEDER Stelle.
 * Wird eine einzige Stelle zurueckgedreht, faellt sie um.
 *
 * Die Zahlen stammen aus dem Bestand am 07.09.2026, nachgezaehlt:
 *   js/app-city-league.js  12   js/app-deck-builder.js   6
 *   (City League 16 -> 12: UI-45, 28.09.2026, die Vergleichsrubriken sind weg)
 *   js/app-meta-cards.js    5   js/app-tier-meta.js     10
 * Kommt eine Stelle dazu, muss sie hier eingetragen werden — und das
 * ist Absicht: der Eintrag zwingt zum Hinsehen.
 */
const ERWARTET = {
    'app-city-league.js': 12,
    'app-deck-builder.js': 6,
    'app-meta-cards.js': 5,
    'app-tier-meta.js': 10,
};

describe('die vier Module maskieren an jeder Stelle in beiden Sprachen', () => {
    for (const [datei, anzahl] of Object.entries(ERWARTET)) {
        it(`${datei} — jede escapeJsStr steckt in einer escapeHtmlAttr`, () => {
            // Kommentarzeilen zaehlen nicht mit; in app-tier-meta.js steht
            // escapeJsStr auch in einer Erklaerung.
            const zeilen = lies(datei).split('\n')
                .filter(z => !/^\s*(\/\/|\*|\/\*)/.test(z));
            const code = zeilen.join('\n');
            const alle = (code.match(/escapeJsStr\(/g) || []).length;
            const gehuellt = (code.match(/escapeHtmlAttr\(escapeJsStr\(/g) || []).length;
            assert.equal(alle, anzahl, `Anzahl der Stellen hat sich geaendert (${alle})`);
            assert.equal(gehuellt, anzahl,
                `${alle - gehuellt} Stelle(n) maskieren nur fuer JS — der HTML-Zerteiler laeuft davor`);
            // Die andere Richtung: EINMAL zu viel maskiert. Der Nutzer
            // liest dann &amp;quot; im Text statt des Zeichens. Genau
            // deshalb wird nicht nur "irgendwie maskiert" geprueft.
            assert.equal((code.match(/escapeHtmlAttr\(\s*escapeHtmlAttr\(/g) || []).length, 0,
                'doppelt maskiert — der Nutzer saehe die Entitaet als Text');
            assert.equal((code.match(/escapeHtmlAttr\(\s*escapeHtml\(/g) || []).length, 0,
                'escapeHtml ist derselbe Aufruf wie escapeHtmlAttr — doppelt maskiert');
            assert.equal((code.match(/escapeJsStr\(\s*escapeJsStr\(/g) || []).length, 0,
                "zweimal fuer JS maskiert — ein Rueckstrich zu viel");
        });
    }

    it('data-deck-name ist ein gewoehnliches Attribut — dort gehoert KEIN escapeJsStr hin', () => {
        // js/app-tier-meta.js:2702. Der Wert wird nie als JS gelesen,
        // sondern nur verglichen. escapeJsStr wuerde aus einem Apostroph
        // \' machen und den Vergleich verfaelschen — und ein " wuerde
        // aus dem Attribut ausbrechen.
        const quelle = lies('app-tier-meta.js');
        const m = /data-deck-name="\$\{([^}]*)\}"/.exec(quelle);
        assert.ok(m, 'data-deck-name nicht mehr gefunden');
        assert.equal(/escapeJsStr/.test(m[1]), false,
            'data-deck-name maskiert wieder fuer JS statt fuer HTML');
        assert.equal(/escapeHtmlAttr\(/.test(m[1]), true);
    });

    it('ein Deckname mit " bricht aus data-deck-name nicht aus', () => {
        const name = 'Zoroark" onmouseover="alert(1)';
        const markup = `<div class="deck-banner-card" data-deck-name="${escapeHtmlAttr(String(name).toLowerCase())}" onclick="openArchetypeCard('${escapeHtmlAttr(escapeJsStr(name))}')">x</div>`;
        const attrs = startTagAttribute(markup);
        assert.deepEqual(ereignisAttribute(attrs), ['onclick']);
        assert.equal(attrs.find(a => a.name === 'data-deck-name').wert,
            'zoroark" onmouseover="alert(1)', 'der Wert bleibt vollstaendig lesbar');
    });
});
