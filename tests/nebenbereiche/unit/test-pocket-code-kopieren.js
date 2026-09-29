/**
 * Der Kopierknopf im Pocket-Vollbild — AUSGEFUEHRT.
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Das Vollbild zeigt den Deck-Code als 2D-Muster. Das setzt ein zweites
 * Geraet voraus. Wer Pocket auf DEMSELBEN Telefon offen hat, hat nichts
 * zum Scannen. Der Betreiber hat am 10.09.2026 entschieden:
 * "Kopierknopf einbauen".
 *
 * Ein Knopf, der die Zwischenablage anfasst, faellt genau dort aus, wo
 * ihn niemand ausprobiert:
 *
 *   * `navigator.clipboard` gibt es NUR im sicheren Kontext. Lokal ueber
 *     http oder in einem eingebetteten Rahmen ist das Objekt gar nicht
 *     da — ohne Rueckfall tut der Knopf dann wortlos nichts.
 *   * `writeText` kann auch DA SEIN und trotzdem ablehnen (fehlende
 *     Berechtigung, Dokument nicht im Vordergrund). Ein Rueckfall, der
 *     nur am fehlenden Objekt haengt, greift in diesem Fall nicht.
 *   * Ohne sichtbare Rueckmeldung sieht niemand, ob etwas passiert ist.
 *     Die Zwischenablage ist unsichtbar; der Knopf ist der einzige Ort,
 *     an dem der Erfolg auftauchen kann.
 *
 * Alle drei werden hier am ECHTEN Modul gemessen, nicht an seinem
 * Quelltext: ein Grep auf `navigator.clipboard` sieht nicht, ob der
 * Rueckfall wirklich laeuft.
 *
 * KEIN jsdom — aus demselben Grund wie in
 * tests/unit/test-pocket-verhalten.js: der Testschritt in
 * deploy-pages.yml installiert nur papaparse. Der Ersatz unten kann
 * genau das, was ds-pocket.js anfasst, und nichts weiter.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..', '..');
const DATEN = JSON.parse(fs.readFileSync(
    path.join(WURZEL, 'data', 'pocket_tierlist.json'), 'utf8'));
const CSS = fs.readFileSync(path.join(WURZEL, 'css', 'ds-pocket.css'), 'utf8');

// ── Der kleinste Ersatz, der traegt ──────────────────────────────────

function element(id) {
    return {
        id: id,
        innerHTML: '',
        hidden: true,
        dataset: {},
        style: {},
        _hoerer: {},
        addEventListener(art, f) { (this._hoerer[art] = this._hoerer[art] || []).push(f); },
        querySelector() { return { focus() {} }; },
        querySelectorAll() { return []; }
    };
}

/** Ein Textfeld, so echt wie der Rueckfall es anfasst. */
function textfeld(protokoll) {
    const feld = {
        tag: 'textarea',
        value: '',
        style: {},
        attribute: {},
        parentNode: null,
        markiert: false,
        bereich: null,
        setAttribute(n, w) { this.attribute[n] = String(w); },
        select() { this.markiert = true; },
        setSelectionRange(a, b) { this.bereich = [a, b]; }
    };
    protokoll.felder.push(feld);
    return feld;
}

/**
 * @param {object} wahl
 *   clipboard   – Ersatz fuer navigator.clipboard (null = gar keiner)
 *   kopierErfolg – was document.execCommand('copy') zurueckgibt
 */
function umgebung(daten, wahl) {
    wahl = wahl || {};
    const knoten = {
        pocket: element('pocket'),
        pocketListe: element('pocketListe'),
        pocketOverlay: element('pocketOverlay')
    };
    const protokoll = {
        felder: [],          // jedes vom Rueckfall erzeugte <textarea>
        angehaengt: [],      // was am Koerper landete
        entfernt: [],        // und was wieder wegging
        befehle: [],         // document.execCommand(...)
        geschrieben: [],     // navigator.clipboard.writeText(...)
        uhren: []            // offene setTimeout-Auftraege
    };
    const koerperKlassen = new Set();
    const dok = {
        readyState: 'complete',
        body: {
            style: {},
            classList: {
                add(k) { koerperKlassen.add(k); },
                remove(k) { koerperKlassen.delete(k); },
                contains(k) { return koerperKlassen.has(k); }
            },
            appendChild(k) { protokoll.angehaengt.push(k); k.parentNode = dok.body; return k; },
            removeChild(k) { protokoll.entfernt.push(k); k.parentNode = null; return k; }
        },
        documentElement: { style: {}, scrollTop: 0 },
        _hoerer: {},
        createElement(tag) {
            if (tag !== 'textarea') throw new Error('unerwartetes Element: ' + tag);
            return textfeld(protokoll);
        },
        execCommand(befehl) {
            protokoll.befehle.push(befehl);
            return wahl.kopierErfolg === undefined ? true : wahl.kopierErfolg;
        },
        getElementById(id) { return knoten[id] || null; },
        addEventListener(art, f) { (this._hoerer[art] = this._hoerer[art] || []).push(f); },
        querySelector() { return null; }
    };
    const verlauf = {
        eintraege: [],
        pushState(zustand) { this.eintraege.push(zustand); },
        back() { this.eintraege.pop(); }
    };
    const navigator = {};
    if (wahl.clipboard) navigator.clipboard = wahl.clipboard;

    const fenster = {
        document: dok,
        navigator: navigator,
        history: verlauf,
        _hoerer: {},
        addEventListener(art, f) { (this._hoerer[art] = this._hoerer[art] || []).push(f); },
        fetch(pfad, w) {
            fenster._geholt = { pfad: pfad, wahl: w };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(daten) });
        },
        getLang: () => wahl.sprache || 'de',
        console: { warn() {} },
        pageYOffset: 0,
        scrollTo() {}
    };
    fenster.window = fenster;

    /* Eine Uhr, die STILLSTEHT, bis der Test sie weiterdreht.
       Sonst muesste dieser Test 1,5 Sekunden echt warten, um zu
       sehen, dass die Rueckmeldung wieder verschwindet — und ein Test,
       der wartet, wird irgendwann abgeschaltet. */
    const uhr = {
        naechste: 1,
        setTimeout(f, ms) {
            const id = uhr.naechste++;
            protokoll.uhren.push({ id, f, ms });
            return id;
        },
        clearTimeout(id) {
            protokoll.uhren = protokoll.uhren.filter(u => u.id !== id);
        },
        /** Alle offenen Auftraege ausfuehren. */
        weiter() {
            const offen = protokoll.uhren;
            protokoll.uhren = [];
            offen.forEach(u => u.f());
        }
    };
    return { fenster, dok, knoten, verlauf, protokoll, navigator, uhr };
}

/** ds-pocket.js in der Ersatzumgebung laufen lassen. */
function laden(daten, wahl) {
    const u = umgebung(daten, wahl);
    const quelle = fs.readFileSync(path.join(WURZEL, 'js', 'ds-pocket.js'), 'utf8');
    u.fenster.qrSvg = require(path.join(WURZEL, 'js', 'qr-svg.js'));

    // Die ECHTE Hintergrund-Sperre dazu, wie in test-pocket-verhalten.js.
    new Function('window', 'document',
                 fs.readFileSync(path.join(WURZEL, 'js', 'hintergrund-sperre.js'), 'utf8')
    )(u.fenster, u.dok);

    /* setTimeout/clearTimeout kommen als Parameter herein, damit die
       Uhr oben sie ersetzen kann. Im Browser sind es dieselben Namen
       aus dem globalen Bereich — das Modul merkt keinen Unterschied. */
    const f = new Function('window', 'document', 'navigator', 'fetch', 'getLang',
                           'console', 'history', 'setTimeout', 'clearTimeout',
                           quelle + '\n;return window.dsPocket;');
    const holen = function () { return u.fenster.fetch.apply(u.fenster, arguments); };
    u.api = f(u.fenster, u.dok, u.navigator, holen, u.fenster.getLang, u.fenster.console,
              u.verlauf, u.uhr.setTimeout, u.uhr.clearTimeout);
    return u;
}

/** Ein Knopf, so echt wie die Rueckmeldung ihn anfasst. */
function knopfAttrappe(attribute) {
    const klassen = new Set(['pk-kopieren']);
    return {
        textContent: attribute.text || '',
        attribute: Object.assign({}, attribute.attr),
        getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attribute, n)
            ? this.attribute[n] : null; },
        setAttribute(n, w) { this.attribute[n] = String(w); },
        classList: {
            add(k) { klassen.add(k); },
            remove(k) { klassen.delete(k); },
            contains(k) { return klassen.has(k); }
        },
        closest(w) { return w === '[data-pk-kopieren]' ? this : null; }
    };
}

/** Das Modul zeichnen und das Vollbild fuer ein Deck oeffnen. */
async function mitOffenemDeck(wahl, index) {
    const u = laden(DATEN, wahl);
    u.api.render();
    await new Promise(r => setTimeout(r, 0));
    u.api.oeffne(index === undefined ? 0 : index);
    return u;
}

/** Den Knopf aus dem gezeichneten Markup holen und antippen. */
function tippeKopieren(u) {
    const html = u.knoten.pocketOverlay.innerHTML;
    const code = (html.match(/data-pk-kopieren="([^"]*)"/) || [])[1];
    const label = (html.match(/class="pk-kopieren"[^>]*aria-label="([^"]*)"/) || [])[1];
    const text = (html.match(/class="pk-kopieren"[^>]*>([^<]*)</) || [])[1];
    assert.ok(code, 'im Vollbild steht kein data-pk-kopieren — es gibt keinen Knopf');
    const knopf = knopfAttrappe({
        text: text,
        attr: { 'data-pk-kopieren': code, 'aria-label': label }
    });
    (u.knoten.pocket._hoerer.click || []).forEach(h => h({ target: knopf }));
    return knopf;
}

/** Auf die Versprechenskette des Kopierwegs warten. */
const durchatmen = () => new Promise(r => setTimeout(r, 0));

// ────────────────────────────────────────────────────────────────────

describe('Pocket-Vollbild: der Kopierknopf steht da', () => {

    it('das Vollbild traegt einen Knopf mit dem Code des offenen Decks', async () => {
        const u = await mitOffenemDeck({ clipboard: null });
        const html = u.knoten.pocketOverlay.innerHTML;
        assert.match(html, /class="pk-kopieren"/, 'kein Kopierknopf im Vollbild');
        assert.ok(html.includes('data-pk-kopieren="' + DATEN.decks[0].code + '"'),
            'der Knopf traegt nicht den Code des offenen Decks');
        assert.match(html, /<button type="button" class="pk-kopieren"/,
            'der Kopierknopf ist kein <button type="button"> — in einem Formular '
            + 'wuerde er die Seite neu laden');
    });

    it('jedes Deck der Datei bekommt seinen eigenen Code an den Knopf', async () => {
        // Faengt einen fest verdrahteten oder aus einer Modulvariablen
        // gelesenen Code: der zweite Aufruf zeigte dann noch den ersten.
        for (const i of [0, 1, DATEN.decks.length - 1]) {
            const u = await mitOffenemDeck({ clipboard: null }, i);
            assert.ok(u.knoten.pocketOverlay.innerHTML.includes(
                'data-pk-kopieren="' + DATEN.decks[i].code + '"'),
                `Deck ${i} (${DATEN.decks[i].name}) traegt einen fremden Code am Knopf`);
        }
    });

    it('der Knopf ist beschriftet und angeschrieben — deutsch', async () => {
        const u = await mitOffenemDeck({ clipboard: null });
        const html = u.knoten.pocketOverlay.innerHTML;
        assert.match(html, /class="pk-kopieren"[^>]*aria-label="[^"]+"/,
            'ohne aria-label sagt eine Vorlesehilfe nur "Schaltflaeche"');
        assert.match(html, /class="pk-kopieren"[^>]*>Code kopieren</,
            'der Knopf traegt nicht die deutsche Beschriftung');
        assert.match(html, /class="pk-kopieren"[^>]*aria-live="polite"/,
            'ohne aria-live bleibt der Wechsel auf "Kopiert!" fuer eine '
            + 'Vorlesehilfe unhoerbar');
    });

    it('auf Englisch steht die englische Beschriftung da', async () => {
        const u = await mitOffenemDeck({ clipboard: null, sprache: 'en' });
        const html = u.knoten.pocketOverlay.innerHTML;
        assert.match(html, /class="pk-kopieren"[^>]*>Copy code</,
            'im englischen Modus steht die deutsche Beschriftung am Knopf');
        assert.doesNotMatch(html, /aria-label="Deck-Code/,
            'das aria-label bleibt auch auf Englisch deutsch');
    });

    it('das Tippziel misst mindestens 44 px in beide Richtungen', () => {
        const i = CSS.indexOf('.pk-kopieren {');
        assert.notEqual(i, -1, 'den Block .pk-kopieren gibt es nicht');
        const block = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(block, /min-height:\s*44px/,
            'der Knopf ist niedriger als 44 px — am Telefon trifft ihn kein Daumen');
        assert.match(block, /min-width:\s*44px/,
            'der Knopf ist schmaler als 44 px');
    });

    it('er hat einen sichtbaren Fokusring', () => {
        assert.match(CSS, /\.pk-kopieren:focus-visible\s*\{[^}]*outline:\s*2px solid/,
            'ohne Fokusring sieht niemand, wo die Tastatur gerade steht');
    });
});

describe('Pocket-Vollbild: der Klick kopiert wirklich', () => {

    it('mit navigator.clipboard geht der Code genau dorthin', async () => {
        const geschrieben = [];
        const u = await mitOffenemDeck({
            clipboard: { writeText: (t) => { geschrieben.push(t); return Promise.resolve(); } }
        });
        tippeKopieren(u);
        await durchatmen();
        assert.deepEqual(geschrieben, [DATEN.decks[0].code],
            'writeText bekam nicht genau den Code des offenen Decks');
        assert.equal(u.protokoll.felder.length, 0,
            'der Rueckfall lief zusaetzlich — dann kopiert die Seite zweimal');
    });

    it('OHNE navigator.clipboard greift der Rueckfall ueber <textarea>', async () => {
        // DIE Zusicherung fuer den unsicheren Kontext: dort gibt es das
        // Objekt gar nicht, und ohne diesen Weg tut der Knopf nichts.
        const u = await mitOffenemDeck({ clipboard: null });
        tippeKopieren(u);
        await durchatmen();
        assert.equal(u.protokoll.felder.length, 1,
            'ohne Zwischenablage-Schnittstelle entstand kein Textfeld — '
            + 'der Knopf tut in einem unsicheren Kontext wortlos nichts');
        const feld = u.protokoll.felder[0];
        assert.equal(feld.value, DATEN.decks[0].code, 'im Feld stand nicht der Code');
        assert.equal(feld.markiert, true, 'ohne Markierung kopiert execCommand nichts');
        assert.deepEqual(u.protokoll.befehle, ['copy'],
            'document.execCommand("copy") wurde nicht aufgerufen');
        assert.deepEqual(u.protokoll.entfernt, [feld],
            'das Hilfsfeld blieb im Dokument stehen');
    });

    it('lehnt writeText AB, greift der Rueckfall trotzdem', async () => {
        // Der Fall, den ein Rueckfall am fehlenden Objekt nicht faengt:
        // die Schnittstelle ist da und sagt nein.
        const u = await mitOffenemDeck({
            clipboard: { writeText: () => Promise.reject(new Error('nicht erlaubt')) }
        });
        tippeKopieren(u);
        await durchatmen();
        await durchatmen();
        assert.equal(u.protokoll.felder.length, 1,
            'nach der Ablehnung passierte gar nichts mehr');
        assert.equal(u.protokoll.felder[0].value, DATEN.decks[0].code);
        assert.deepEqual(u.protokoll.befehle, ['copy']);
    });

    it('wirft writeText sofort, faellt der Knopf nicht um', async () => {
        const u = await mitOffenemDeck({
            clipboard: { writeText: () => { throw new Error('kaputt'); } }
        });
        const knopf = tippeKopieren(u);
        await durchatmen();
        await durchatmen();
        assert.equal(u.protokoll.felder.length, 1, 'der Rueckfall lief nicht');
        assert.equal(knopf.textContent, 'Kopiert!',
            'nach einem Wurf blieb die Rueckmeldung aus');
    });
});

describe('Pocket-Vollbild: die Rueckmeldung', () => {

    it('der Knopf sagt "Kopiert!" und kehrt danach zurueck', async () => {
        const u = await mitOffenemDeck({
            clipboard: { writeText: () => Promise.resolve() }
        });
        const knopf = tippeKopieren(u);
        assert.equal(knopf.textContent, 'Code kopieren',
            'die Rueckmeldung stand schon vor dem Kopieren da');
        await durchatmen();
        assert.equal(knopf.textContent, 'Kopiert!',
            'nach dem Kopieren steht keine sichtbare Rueckmeldung am Knopf');
        assert.equal(knopf.getAttribute('aria-label'), 'Kopiert!',
            'das aria-label blieb auf dem Ruhetext — eine Vorlesehilfe hoert '
            + 'den Wechsel dann nicht');

        // Und wieder zurueck, sonst behauptet der Knopf dauerhaft einen
        // Erfolg, der laengst vorbei ist.
        assert.equal(u.protokoll.uhren.length, 1, 'kein Ruecksetzer bestellt');
        assert.equal(u.protokoll.uhren[0].ms, 1500,
            'die Rueckmeldung steht nicht rund 1,5 s');
        u.uhr.weiter();
        assert.equal(knopf.textContent, 'Code kopieren',
            'die Rueckmeldung bleibt fuer immer stehen');
        assert.equal(knopf.getAttribute('aria-label'), 'Deck-Code in die Zwischenablage kopieren',
            'das aria-label kam nicht zurueck');
    });

    it('auf Englisch heisst die Rueckmeldung "Copied!"', async () => {
        const u = await mitOffenemDeck({
            clipboard: { writeText: () => Promise.resolve() }, sprache: 'en'
        });
        const knopf = tippeKopieren(u);
        await durchatmen();
        assert.equal(knopf.textContent, 'Copied!');
    });

    it('klappt es NICHT, behauptet der Knopf keinen Erfolg', async () => {
        // execCommand meldet false: der Rueckfall lief, kopiert hat er
        // nichts. Ein "Kopiert!" waere hier eine Luege.
        const u = await mitOffenemDeck({ clipboard: null, kopierErfolg: false });
        const knopf = tippeKopieren(u);
        await durchatmen();
        assert.equal(knopf.textContent, 'Kopieren klappte nicht',
            'der Knopf meldet Erfolg, obwohl nichts kopiert wurde');
        assert.equal(knopf.classList.contains('is-fehler'), true,
            'der Fehlzustand ist nicht angeschrieben');
        u.uhr.weiter();
        assert.equal(knopf.classList.contains('is-fehler'), false,
            'der Fehlzustand bleibt am Knopf haengen');
    });

    it('zweimal tippen setzt die Uhr neu, statt zwei laufen zu lassen', async () => {
        const u = await mitOffenemDeck({
            clipboard: { writeText: () => Promise.resolve() }
        });
        tippeKopieren(u);
        await durchatmen();
        const knopf = tippeKopieren(u);
        await durchatmen();
        assert.equal(u.protokoll.uhren.length, 1,
            `${u.protokoll.uhren.length} Ruecksetzer offen — der erste wuerde die `
            + 'zweite Rueckmeldung vorzeitig loeschen');
        assert.equal(knopf.textContent, 'Kopiert!');
    });
});

describe('Pocket-Vollbild: der Knopf steht dem Bestehenden nicht im Weg', () => {

    it('das Muster und der Schliessknopf sind weiter da', async () => {
        const u = await mitOffenemDeck({ clipboard: null });
        const html = u.knoten.pocketOverlay.innerHTML;
        assert.match(html, /<svg /, 'das Muster ist verschwunden');
        assert.match(html, /data-pk-zu="1"/, 'der Schliessknopf ist verschwunden');
    });

    it('ein Klick auf den Kopierknopf schliesst das Vollbild nicht', async () => {
        const u = await mitOffenemDeck({
            clipboard: { writeText: () => Promise.resolve() }
        });
        assert.equal(u.knoten.pocketOverlay.hidden, false);
        tippeKopieren(u);
        await durchatmen();
        assert.equal(u.knoten.pocketOverlay.hidden, false,
            'das Kopieren hat das Vollbild geschlossen');
    });
});
