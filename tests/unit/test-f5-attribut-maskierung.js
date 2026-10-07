/**
 * MASKIERUNG FUER WERTE, DIE IN EINEM EREIGNISATTRIBUT LANDEN.
 *
 * BEFUND (07.09.2026): zwoelf Stellen in vier Modulen schoben einen
 * Kartennamen mit `escapeJsStr` allein in ein `onclick="fn('...')"`.
 * `escapeJsStr` macht aus `"` ein `\"`. Im HTML ist der Rueckstrich ein
 * gewoehnliches Zeichen — das `"` dahinter beendet den Attributwert,
 * und der Rest der Eingabe steht als EIGENES Attribut im Start-Tag.
 * Der HTML-Zerteiler laeuft vor dem JS-Zerteiler, deshalb muss der
 * HTML-Zerteiler ZULETZT maskieren:
 *
 *     escapeHtmlAttr(escapeJsStr(x))
 *
 * Gemessene Eingabe: `x" onmouseover=alert(1) y="`
 *   vorher   -> Start-Tag mit ZWEITEM Attribut `onmouseover=alert(1)`
 *   nachher  -> ein einziges Attribut, Wert kommt als Zeichenkette an
 *
 * WIE HIER GEMESSEN WIRD — keine Behauptung ueber Zeichenketten,
 * sondern zwei echte Zerteiler hintereinander:
 *
 *  1. HTML: ein Start-Tag-Tokenisierer nach dem WHATWG-Zustandsmodell
 *     (unten, `tokenisiereStartTag`). Er liefert die Attributliste des
 *     Tags. Kommt dort mehr als das erwartete Attribut heraus, ist der
 *     Ausbruch gelungen.
 *  2. JS: der Attributwert — nach Aufloesen der Zeichenverweise, so wie
 *     der Browser ihn dem Ereignis-Handler gibt — geht durch
 *     `node:vm`. Er muss uebersetzbar sein (kein SyntaxError) und beim
 *     Ausfuehren die Attrappe mit dem UNVERAENDERTEN Original aufrufen.
 *
 * Der Rueckweg (Original rein, Original beim Aufruf wieder heraus)
 * faengt beide Fehlreparaturen mit ab: doppelte Maskierung liefert
 * sichtbares `&quot;`, die umgekehrte Reihenfolge liefert SyntaxError
 * oder fuehrt aus. Beides steht unten als eigene Zusicherung.
 *
 * KEINE LIVEDATEN, KEIN jsdom.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// ---------------------------------------------------------------------------
// Die echten Maskierer aus js/app-utils.js — abgeschnitten, nicht
// nachgebaut. Ein Nachbau wuerde die Reparatur nicht pruefen.
// ---------------------------------------------------------------------------
const UTILS = lies('js/app-utils.js');

function funktionsRumpf(name, quelle) {
    const re = new RegExp(`(^|\\n)\\s*function\\s+${name}\\s*\\(`);
    const m = re.exec(quelle);
    if (!m) throw new Error('Funktion nicht gefunden: ' + name);
    const start = quelle.indexOf('function', m.index);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', start); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(start, i + 1);
        }
    }
    throw new Error(name + ': die Klammern gehen nicht auf');
}

// eslint-disable-next-line no-new-func
const maskierer = new Function(
    funktionsRumpf('escapeHtmlAttr', UTILS) + '\n'
    + funktionsRumpf('escapeJsStr', UTILS) + '\n'
    + 'return { escapeHtmlAttr, escapeJsStr };')();
const escapeHtmlAttr = maskierer.escapeHtmlAttr;
const escapeJsStr = maskierer.escapeJsStr;

// Die drei Bauformen: die richtige und die beiden gemessenen Fehlgriffe.
const RICHTIG = (x) => escapeHtmlAttr(escapeJsStr(x));
const NUR_JS = (x) => escapeJsStr(x);                       // der alte Zustand
const UMGEKEHRT = (x) => escapeJsStr(escapeHtmlAttr(x));    // falsche Reihenfolge
const DOPPELT = (x) => escapeHtmlAttr(escapeHtmlAttr(escapeJsStr(x)));

// ---------------------------------------------------------------------------
// ZERTEILER 1 — HTML-Start-Tag nach dem WHATWG-Zustandsmodell.
//
// Kein regulaerer Ausdruck: genau die Zustaende, die der Browser beim
// Lesen eines Start-Tags durchlaeuft. Nur so faellt auf, dass ein `"`
// mitten im Attributwert den Wert beendet und alles danach als NEUES
// Attribut gelesen wird — ein Muster-Vergleich wuerde das verdecken.
// ---------------------------------------------------------------------------
function tokenisiereStartTag(html) {
    let i = 0;
    if (html[i] !== '<') throw new Error('kein Start-Tag: ' + html.slice(0, 40));
    i++;
    let tagName = '';
    while (i < html.length && !/[\s/>]/.test(html[i])) { tagName += html[i]; i++; }
    const attribute = [];
    let zustand = 'vorAttributName';
    let name = '';
    let wert = '';
    let endeGefunden = false;

    while (i <= html.length) {
        const c = html[i];
        if (c === undefined) break;
        switch (zustand) {
            case 'vorAttributName':
                if (/\s/.test(c)) { i++; break; }
                if (c === '/') { i++; break; }
                if (c === '>') { endeGefunden = true; i++; break; }
                name = ''; wert = ''; zustand = 'attributName';
                break;
            case 'attributName':
                if (/\s/.test(c)) { zustand = 'nachAttributName'; i++; break; }
                if (c === '=') { zustand = 'vorAttributWert'; i++; break; }
                if (c === '>') { attribute.push({ name: name.toLowerCase(), wert: '' }); endeGefunden = true; i++; break; }
                if (c === '/') { attribute.push({ name: name.toLowerCase(), wert: '' }); zustand = 'vorAttributName'; i++; break; }
                name += c; i++;
                break;
            case 'nachAttributName':
                if (/\s/.test(c)) { i++; break; }
                if (c === '=') { zustand = 'vorAttributWert'; i++; break; }
                attribute.push({ name: name.toLowerCase(), wert: '' });
                if (c === '>') { endeGefunden = true; i++; break; }
                name = ''; wert = ''; zustand = 'attributName';
                break;
            case 'vorAttributWert':
                if (/\s/.test(c)) { i++; break; }
                if (c === '"') { zustand = 'wertDoppelt'; i++; break; }
                if (c === "'") { zustand = 'wertEinfach'; i++; break; }
                if (c === '>') { attribute.push({ name: name.toLowerCase(), wert: '' }); endeGefunden = true; i++; break; }
                zustand = 'wertOhneAnfuehrung';
                break;
            case 'wertDoppelt':
                if (c === '"') { attribute.push({ name: name.toLowerCase(), wert }); zustand = 'nachWertMitAnfuehrung'; i++; break; }
                wert += c; i++;
                break;
            case 'wertEinfach':
                if (c === "'") { attribute.push({ name: name.toLowerCase(), wert }); zustand = 'nachWertMitAnfuehrung'; i++; break; }
                wert += c; i++;
                break;
            case 'wertOhneAnfuehrung':
                if (/\s/.test(c)) { attribute.push({ name: name.toLowerCase(), wert }); zustand = 'vorAttributName'; i++; break; }
                if (c === '>') { attribute.push({ name: name.toLowerCase(), wert }); endeGefunden = true; i++; break; }
                wert += c; i++;
                break;
            case 'nachWertMitAnfuehrung':
                if (/\s/.test(c)) { zustand = 'vorAttributName'; i++; break; }
                if (c === '>') { endeGefunden = true; i++; break; }
                if (c === '/') { zustand = 'vorAttributName'; i++; break; }
                zustand = 'vorAttributName';
                break;
            default:
                throw new Error('unbekannter Zustand ' + zustand);
        }
        if (endeGefunden) break;
    }
    if (!endeGefunden) throw new Error('Start-Tag endet nicht: ' + html.slice(0, 80));
    return { tagName: tagName.toLowerCase(), attribute, restAbTagende: html.slice(i) };
}

// Zeichenverweise im Attributwert aufloesen — das macht der Browser,
// bevor der Wert als JS gelesen wird. Nur die fuenf, die
// escapeHtmlAttr erzeugt, plus die numerische Schreibweise.
function entwirreVerweise(s) {
    return String(s)
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// ZERTEILER 2 — node:vm. Der aufgeloeste Attributwert ist JS-Quelltext.
// Er muss uebersetzbar sein und darf nur die Attrappe aufrufen.
// ---------------------------------------------------------------------------
function fuehreHandlerAus(quelltext) {
    const protokoll = { aufrufe: [], ausgefuehrt: [] };
    const sandkasten = {
        // die Zielfunktionen der geprueften Bauformen
        addCardToDeck: (...a) => protokoll.aufrufe.push(['addCardToDeck', ...a]),
        addCardToProxy: (...a) => protokoll.aufrufe.push(['addCardToProxy', ...a]),
        removeCardFromDeck: (...a) => protokoll.aufrufe.push(['removeCardFromDeck', ...a]),
        openRaritySwitcher: (...a) => protokoll.aufrufe.push(['openRaritySwitcher', ...a]),
        openCardmarket: (...a) => protokoll.aufrufe.push(['openCardmarket', ...a]),
        togglePinCard: (...a) => protokoll.aufrufe.push(['togglePinCard', ...a]),
        toggleExcludeCard: (...a) => protokoll.aufrufe.push(['toggleExcludeCard', ...a]),
        showSingleCard: (...a) => protokoll.aufrufe.push(['showSingleCard', ...a]),
        showToast: (...a) => protokoll.aufrufe.push(['showToast', ...a]),
        navigateToCurrentMetaWithDeck: (...a) => protokoll.aufrufe.push(['navigateToCurrentMetaWithDeck', ...a]),
        handleCardImageError: (...a) => protokoll.aufrufe.push(['handleCardImageError', ...a]),
        // alles, was ein Angreifer erreichen wollen wuerde
        alert: (...a) => protokoll.ausgefuehrt.push(['alert', ...a]),
        prompt: (...a) => protokoll.ausgefuehrt.push(['prompt', ...a]),
        fetch: (...a) => protokoll.ausgefuehrt.push(['fetch', ...a]),
        event: { stopPropagation() {} },
        this_src: 'bild.png',
    };
    let uebersetzbar = true;
    let fehler = null;
    try {
        vm.runInNewContext(quelltext, sandkasten, { timeout: 1000 });
    } catch (e) {
        // ACHTUNG: ein Fehler aus `vm.runInNewContext` stammt aus einem
        // anderen Realm — `e instanceof SyntaxError` ist dort FALSCH,
        // gemessen an "Boss's Orders". Der Name traegt richtig.
        uebersetzbar = !(e && e.name === 'SyntaxError');
        fehler = e;
    }
    return { protokoll, uebersetzbar, fehler };
}

// ---------------------------------------------------------------------------
// DIE ANGRIFFSFORMEN.
// ---------------------------------------------------------------------------
const ANGRIFFE = [
    ['doppeltes Anfuehrungszeichen', 'x" onmouseover=alert(1) y="'],
    ['einfaches Anfuehrungszeichen', "x' onmouseover=alert(1) y='"],
    ['script-Tag', '<script>alert(1)</script>'],
    ['javascript:-Schema', 'javascript:alert(1)'],
    ['Ereignisattribut angehaengt', 'Pikachu" onfocus="alert(1)'],
    ['Tagabbruch nach Anfuehrung', 'Pikachu" ><img src=x onerror=alert(1)>'],
    // Gemessen: ein blosses ">" beendet einen ANGEFUEHRTEN Attributwert
    // nicht. Es steht trotzdem hier, weil escapeHtmlAttr es maskiert und
    // der Rueckweg zeigen muss, dass es unveraendert ankommt.
    ['Tagabbruch ohne Anfuehrung', 'Pikachu><img src=x onerror=alert(1)>'],
    ['Rueckstrich', 'Pfad\\zum\\Bild'],
    ['Rueckstrich vor Anfuehrung', 'x\\" onmouseover=alert(1) y=\\"'],
    ['kaufmaennisches Und', 'Fire & Water &amp; Grass'],
    ['Zeilenumbruch', 'Zeile1\nZeile2\r\nZeile3'],
    ['JS-Ausbruch mit Klammern', "x'); alert(1); ('"],
    ['echter Genitiv', "Boss's Orders"],
    ['typografischer Genitiv', 'N\u2019s Zoroark ex'],
    ['alles zusammen', 'a"\'<>&\\\n</script><img src=x onerror=alert(1)>'],
];

// ---------------------------------------------------------------------------
// DIE BAUFORMEN, DIE ES IM QUELLTEXT WIRKLICH GIBT.
//
// `beleg` ist der Ausschnitt, der in der genannten Datei stehen MUSS.
// Faellt eine Reparatur zurueck, findet der Beleg sich nicht mehr und
// der Test hier wird rot, bevor irgendetwas gemessen wird. `bauen`
// bildet die Anfuehrungsverschachtelung genau dieser Zeile nach.
// ---------------------------------------------------------------------------
const BAUFORMEN = [
    {
        titel: 'app-features.js:389 — onclick="…(\'…\')", Attribut doppelt, JS einfach',
        datei: 'js/app-features.js',
        beleg: "onclick=\"addCardToProxy('${cardNameEscaped}', '${cardSetEscaped}', '${cardNumberEscaped}', ${proxyCount})\"",
        erwarteteAttribute: ['onclick', 'style'],
        zielFunktion: 'addCardToProxy',
        stelle: 0,
        bauen: (m) => `<button onclick="addCardToProxy('${m}', 'SV1', '025', 1)" style="width:100%;">+Proxy</button>`,
    },
    {
        titel: 'app-past-meta.js:1359 — onclick=\'…("…")\', Attribut einfach, JS doppelt',
        datei: 'js/app-past-meta.js',
        beleg: 'onclick=\'addCardToDeck("pastMeta", "${escapeHtmlAttr(escapeJsStr(cardName))}");\'',
        erwarteteAttribute: ['class', 'onclick', 'style'],
        zielFunktion: 'addCardToDeck',
        stelle: 1,
        bauen: (m) => `<button class="btn btn-primary" onclick='addCardToDeck("pastMeta", "${m}");' style="padding: 6px 12px;">+ Add</button>`,
    },
    {
        titel: 'app-current-meta-analysis.js:5161 — onclick mit event.stopPropagation davor',
        datei: 'js/app-current-meta-analysis.js',
        beleg: "onclick=\"event.stopPropagation(); removeCardFromDeck('currentMeta', '${cardNameEscaped}')\"",
        erwarteteAttribute: ['class', 'onclick', 'title'],
        zielFunktion: 'removeCardFromDeck',
        stelle: 1,
        bauen: (m) => `<button class="city-league-card-action-btn" onclick="event.stopPropagation(); removeCardFromDeck('currentMeta', '${m}')" title="Aus Deck entfernen">-</button>`,
    },
    {
        titel: 'app-current-meta-analysis.js:5163 — derselbe Wert ZWEIMAL im selben Attribut',
        datei: 'js/app-current-meta-analysis.js',
        beleg: "openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')",
        erwarteteAttribute: ['class', 'onclick', 'title'],
        zielFunktion: 'openRaritySwitcher',
        stelle: 0,
        bauen: (m) => `<button class="city-league-card-action-btn" onclick="event.stopPropagation(); openRaritySwitcher('${m}', '${m} (SV1 025)')" title="Druck wechseln">*</button>`,
    },
    {
        titel: 'app-current-meta.js — Heatmap-Zelle: Wert im onclick NEBEN einem title-Attribut',
        datei: 'js/app-current-meta.js',
        beleg: "onclick=\"navigateToCurrentMetaWithDeck('${safeRow}')\"",
        erwarteteAttribute: ['class', 'title', 'onclick'],
        zielFunktion: 'navigateToCurrentMetaWithDeck',
        stelle: 0,
        // V2-13 (07.10.2026): die Zelle fuehrt in die Deck-Analyse statt eine Meldung zu zeigen
        bauen: (m) => `<td class="heatmap-td" title="Bilanz" onclick="navigateToCurrentMetaWithDeck('${m}')">51 %</td>`,
    },
    {
        titel: 'app-past-meta.js:1638 — Marktknopf, Wert neben data-Attributen',
        datei: 'js/app-past-meta.js',
        beleg: "openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')",
        erwarteteAttribute: ['class', 'onclick', 'data-market-bg', 'data-market-cursor', 'title'],
        zielFunktion: 'openCardmarket',
        stelle: 0,
        bauen: (m) => `<button class="city-league-card-market-btn" onclick="openCardmarket('${m}', 'Pikachu')" data-market-bg="linear-gradient(135deg, #777 0%, #999 100%)" data-market-cursor="pointer" title="Preis n/a">0,00 EUR</button>`,
    },
];

describe('die Belege stehen so im Quelltext — sonst misst der Rest nichts', () => {
    for (const b of BAUFORMEN) {
        it(`${b.datei} enthaelt die Bauform aus "${b.titel}"`, () => {
            assert.ok(lies(b.datei).includes(b.beleg),
                `nicht gefunden in ${b.datei}:\n  ${b.beleg}`);
        });
    }
});

describe('jedes escapeJsStr in den vier Modulen steht in einem HTML-Maskierer', () => {
    // Das ist die Zusicherung, die eine einzelne zurueckgedrehte Stelle
    // rot macht: sie zaehlt nicht, sie sieht sich jede an.
    const DATEIEN = [
        'js/app-current-meta-analysis.js',
        'js/app-current-meta.js',
        'js/app-past-meta.js',
        'js/app-features.js',
    ];
    for (const datei of DATEIEN) {
        it(`${datei}`, () => {
            const quelle = lies(datei);
            const zeilen = quelle.split('\n');
            const nackt = [];
            zeilen.forEach((zeile, idx) => {
                let von = 0;
                for (;;) {
                    const p = zeile.indexOf('escapeJsStr(', von);
                    if (p < 0) break;
                    von = p + 1;
                    const davor = zeile.slice(0, p);
                    // Der aeussere Maskierer muss unmittelbar davor stehen.
                    if (/(escapeHtmlAttr|escapeHtml)\($/.test(davor)) continue;
                    nackt.push(`${datei}:${idx + 1}  ${zeile.trim().slice(0, 120)}`);
                }
            });
            assert.deepEqual(nackt, [],
                'escapeJsStr ohne HTML-Maskierer aussen herum:\n' + nackt.join('\n'));

            // Die beiden gemessenen Fehlgriffe stehen hier ebenfalls als
            // Zusicherung — der Test darueber allein liesse sie durch:
            //   escapeHtmlAttr(escapeHtmlAttr(escapeJsStr(x)))  zeigt dem
            //     Nutzer sichtbares &quot; im Kartennamen,
            //   escapeJsStr(escapeHtmlAttr(x))  ist die falsche
            //     Reihenfolge (SyntaxError bzw. Ausbruch).
            const doppelt = [];
            const umgekehrt = [];
            zeilen.forEach((zeile, idx) => {
                if (/escapeHtmlAttr\(\s*escapeHtmlAttr\(/.test(zeile)
                    || /escapeHtml\(\s*escapeHtml\(/.test(zeile)
                    || /escapeHtmlAttr\(\s*escapeHtml\(/.test(zeile)
                    || /escapeHtml\(\s*escapeHtmlAttr\(/.test(zeile)) {
                    doppelt.push(`${datei}:${idx + 1}  ${zeile.trim().slice(0, 120)}`);
                }
                if (/escapeJsStr\(\s*escapeHtml(Attr)?\(/.test(zeile)) {
                    umgekehrt.push(`${datei}:${idx + 1}  ${zeile.trim().slice(0, 120)}`);
                }
            });
            assert.deepEqual(doppelt, [],
                'doppelt maskiert — der Nutzer sieht &quot;:\n' + doppelt.join('\n'));
            assert.deepEqual(umgekehrt, [],
                'falsche Reihenfolge, der HTML-Maskierer muss ZULETZT laufen:\n'
                + umgekehrt.join('\n'));
        });
    }
});

describe('richtige Bauform: escapeHtmlAttr(escapeJsStr(x))', () => {
    for (const b of BAUFORMEN) {
        for (const [name, eingabe] of ANGRIFFE) {
            it(`${b.titel} — ${name}`, () => {
                const html = b.bauen(RICHTIG(eingabe));
                const tag = tokenisiereStartTag(html);

                // 1. HTML-Zerteiler: kein zusaetzliches Attribut.
                const namen = tag.attribute.map(a => a.name);
                assert.deepEqual(namen, b.erwarteteAttribute,
                    `Attributliste im Start-Tag weicht ab.\n  Tag: ${html}\n  gelesen: ${JSON.stringify(namen)}`);
                for (const a of tag.attribute) {
                    if (a.name === 'onclick') continue;
                    assert.ok(!/^on/i.test(a.name), 'zusaetzliches Ereignisattribut: ' + a.name);
                }

                // 2. JS-Zerteiler: der Attributwert ist gueltiges JS …
                const roh = tag.attribute.find(a => a.name === 'onclick').wert;
                const quelltext = entwirreVerweise(roh);
                const lauf = fuehreHandlerAus(quelltext);
                assert.ok(lauf.uebersetzbar,
                    `SyntaxError im Attributwert: ${lauf.fehler && lauf.fehler.message}\n  ${quelltext}`);
                assert.equal(lauf.fehler, null,
                    `Attributwert warf beim Ausfuehren: ${lauf.fehler && lauf.fehler.message}\n  ${quelltext}`);

                // … und er fuehrt nichts aus, was der Angreifer wollte.
                assert.deepEqual(lauf.protokoll.ausgefuehrt, [],
                    'im Handler wurde fremder Code ausgefuehrt: '
                    + JSON.stringify(lauf.protokoll.ausgefuehrt));

                // 3. Der Rueckweg: das Original kommt unveraendert an.
                const aufruf = lauf.protokoll.aufrufe.find(a => a[0] === b.zielFunktion);
                assert.ok(aufruf, `${b.zielFunktion} wurde nicht aufgerufen — ${quelltext}`);
                assert.equal(aufruf[1 + b.stelle], eingabe,
                    'der Wert kam veraendert an (Zeichen verschluckt oder doppelt maskiert)');
            });
        }
    }
});

describe('der alte Zustand — escapeJsStr allein — bricht wirklich aus', () => {
    // Ohne diese Zusicherung waere nicht belegt, dass die Reparatur
    // etwas repariert: sie zeigt den Schaden, den es vorher gab.
    it('x" onmouseover=alert(1) y=" erzeugt ein ZWEITES Ereignisattribut', () => {
        const eingabe = 'x" onmouseover=alert(1) y="';
        const html = BAUFORMEN[2].bauen(NUR_JS(eingabe));
        const tag = tokenisiereStartTag(html);
        const namen = tag.attribute.map(a => a.name);
        assert.ok(namen.includes('onmouseover'),
            'erwartet war der gelungene Ausbruch, gelesen: ' + JSON.stringify(namen));
        // und mit der Reparatur ist es weg
        const heil = tokenisiereStartTag(BAUFORMEN[2].bauen(RICHTIG(eingabe)));
        assert.deepEqual(heil.attribute.map(a => a.name), BAUFORMEN[2].erwarteteAttribute);
    });

    it("x' onmouseover=alert(1) y=' bricht aus dem einfach begrenzten Attribut aus", () => {
        const eingabe = "x' onmouseover=alert(1) y='";
        const tag = tokenisiereStartTag(BAUFORMEN[1].bauen(NUR_JS(eingabe)));
        assert.ok(tag.attribute.map(a => a.name).includes('onmouseover'),
            'gelesen: ' + JSON.stringify(tag.attribute.map(a => a.name)));
        const heil = tokenisiereStartTag(BAUFORMEN[1].bauen(RICHTIG(eingabe)));
        assert.deepEqual(heil.attribute.map(a => a.name), BAUFORMEN[1].erwarteteAttribute);
    });

    it('der Tagabbruch haengt ein ganzes zweites Element an', () => {
        const eingabe = 'Pikachu" ><img src=x onerror=alert(1)>';
        const tag = tokenisiereStartTag(BAUFORMEN[0].bauen(NUR_JS(eingabe)));
        assert.ok(tag.restAbTagende.includes('<img'),
            'nach dem Start-Tag steht: ' + JSON.stringify(tag.restAbTagende.slice(0, 60)));
        const heil = tokenisiereStartTag(BAUFORMEN[0].bauen(RICHTIG(eingabe)));
        assert.ok(!heil.restAbTagende.includes('<img'),
            'nach der Reparatur steht dort noch: ' + heil.restAbTagende.slice(0, 60));
    });
});

describe('die falsche Reihenfolge escapeJsStr(escapeHtmlAttr(x)) ist wirklich falsch', () => {
    it("Boss's Orders ergibt keinen uebersetzbaren Attributwert", () => {
        const html = BAUFORMEN[2].bauen(UMGEKEHRT("Boss's Orders"));
        const roh = tokenisiereStartTag(html).attribute.find(a => a.name === 'onclick').wert;
        const lauf = fuehreHandlerAus(entwirreVerweise(roh));
        assert.equal(lauf.fehler && lauf.fehler.name, 'SyntaxError',
            'erwartet war ein SyntaxError, bekommen: ' + (lauf.fehler || 'gar kein Fehler'));
        assert.equal(lauf.uebersetzbar, false);
        // Zum Vergleich: die richtige Reihenfolge laeuft durch.
        const rohOk = tokenisiereStartTag(BAUFORMEN[2].bauen(RICHTIG("Boss's Orders")))
            .attribute.find(a => a.name === 'onclick').wert;
        const laufOk = fuehreHandlerAus(entwirreVerweise(rohOk));
        assert.equal(laufOk.fehler, null);
        assert.equal(laufOk.protokoll.aufrufe[0][2], "Boss's Orders");
    });

    it("x'); alert(1); (' fuehrt bei umgekehrter Reihenfolge alert aus", () => {
        const eingabe = "x'); alert(1); ('";
        const roh = tokenisiereStartTag(BAUFORMEN[2].bauen(UMGEKEHRT(eingabe)))
            .attribute.find(a => a.name === 'onclick').wert;
        const lauf = fuehreHandlerAus(entwirreVerweise(roh));
        assert.deepEqual(lauf.protokoll.ausgefuehrt, [['alert', 1]],
            'erwartet war der gelungene Ausbruch, protokolliert: '
            + JSON.stringify(lauf.protokoll.ausgefuehrt));
        // Mit der richtigen Reihenfolge passiert nichts davon.
        const rohOk = tokenisiereStartTag(BAUFORMEN[2].bauen(RICHTIG(eingabe)))
            .attribute.find(a => a.name === 'onclick').wert;
        const laufOk = fuehreHandlerAus(entwirreVerweise(rohOk));
        assert.deepEqual(laufOk.protokoll.ausgefuehrt, []);
        assert.equal(laufOk.protokoll.aufrufe[0][2], eingabe);
    });
});

describe('doppelte Maskierung zeigt dem Nutzer sichtbares &quot;', () => {
    it('escapeHtmlAttr(escapeHtmlAttr(escapeJsStr(x))) verstuemmelt den Wert', () => {
        const eingabe = 'Ho-Oh "Legend"';
        const roh = tokenisiereStartTag(BAUFORMEN[2].bauen(DOPPELT(eingabe)))
            .attribute.find(a => a.name === 'onclick').wert;
        const lauf = fuehreHandlerAus(entwirreVerweise(roh));
        assert.equal(lauf.fehler, null);
        const angekommen = lauf.protokoll.aufrufe[0][2];
        assert.ok(angekommen.includes('&quot;'),
            'erwartet war das sichtbare &quot;, angekommen ist: ' + JSON.stringify(angekommen));
        assert.notEqual(angekommen, eingabe);

        // Einfach maskiert kommt genau das Original an.
        const rohOk = tokenisiereStartTag(BAUFORMEN[2].bauen(RICHTIG(eingabe)))
            .attribute.find(a => a.name === 'onclick').wert;
        const laufOk = fuehreHandlerAus(entwirreVerweise(rohOk));
        assert.equal(laufOk.protokoll.aufrufe[0][2], eingabe);
        assert.ok(!laufOk.protokoll.aufrufe[0][2].includes('&quot;'));
    });
});

describe('der Zerteiler selbst taugt etwas', () => {
    // Ein Tokenisierer, der nichts findet, macht jeden Test darueber
    // gruen. Also wird er an Faellen mit bekanntem Ergebnis geprueft.
    it('liest Attribute in allen drei Anfuehrungsformen', () => {
        const t = tokenisiereStartTag('<div a="eins" b=\'zwei\' c=drei d>Rest</div>');
        assert.deepEqual(t.attribute, [
            { name: 'a', wert: 'eins' },
            { name: 'b', wert: 'zwei' },
            { name: 'c', wert: 'drei' },
            { name: 'd', wert: '' },
        ]);
        assert.equal(t.tagName, 'div');
        assert.equal(t.restAbTagende, 'Rest</div>');
    });

    it('erkennt den Ausbruch aus einem doppelt begrenzten Attributwert', () => {
        const t = tokenisiereStartTag('<b onclick="f(\'x\\" onmouseover=alert(1) y=\\"\')">');
        assert.deepEqual(t.attribute.map(a => a.name), ['onclick', 'onmouseover', 'y']);
    });

    it('meldet ein Tag, das nie endet', () => {
        assert.throws(() => tokenisiereStartTag('<div a="offen'), /endet nicht/);
    });
});
