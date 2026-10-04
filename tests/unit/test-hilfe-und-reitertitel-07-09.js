/**
 * Zwei Befunde aus js/app-core.js, AUSGEFUEHRT statt gegriffen.
 *
 *   C7 / B13 / F6.1b / F19.1 — DER HILFE-DIALOG WAR EINE SACKGASSE.
 *   Gemessen am 07.09.2026: #helpModal traegt role="dialog" und
 *   aria-modal="true", hatte aber weder einen keydown-Zuhoerer noch
 *   eine Fokusfuehrung. Escape schloss nichts, der Fokus blieb beim
 *   Knopf DAHINTER stehen, und nach dem Schliessen war er verloren.
 *
 *   B12 / A-F0.2b / A-F0.2c — TITEL UND ABZEICHEN SAGTEN VERSCHIEDENES.
 *   Gemessen mit dem echten Titelblock gegen die Menuestruktur aus
 *   index.html:
 *
 *     admin         Titel und Abzeichen behielten den Wert der VORIGEN
 *                   Ansicht (kein Menuepunkt, und die Ueberschrift
 *                   `<h2 id="adminTitel">Datenlücken</h2>` traegt kein
 *                   data-i18n, wonach allein gesucht wurde).
 *     current-meta  Titel "Overview – Pokémon TCG Hub", Abzeichen
 *                   "Current Meta (Global)". Es gibt ZWEI Menuepunkte
 *                   mit data-tab-id="current-meta"; querySelector nimmt
 *                   den ersten, js/inline-init.js nimmt
 *                   `menu-btn-<tabName>` und ueberschreibt danach.
 *
 * KEIN jsdom (CI installiert nur papaparse), KEINE LIVEDATEN.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const CORE = fs.readFileSync(path.join(WURZEL, 'js', 'app-core.js'), 'utf8');
const HTML = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');

function funktion(name) {
    const start = CORE.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name + '() gibt es nicht mehr');
    let tiefe = 0;
    for (let j = CORE.indexOf('{', start); j < CORE.length; j++) {
        if (CORE[j] === '{') tiefe++;
        else if (CORE[j] === '}') { tiefe--; if (tiefe === 0) return CORE.slice(start, j + 1); }
    }
    assert.fail(name + '(): Klammern gehen nicht auf');
}

/* ══ C7/B13 — der Hilfe-Dialog ═════════════════════════════════════ */

function knopf(name) {
    return { _name: name, _fokus: 0, className: '', focus() { this._fokus++; ZUSTAND.fokus = this; },
             getAttribute: () => null, disabled: false };
}
let ZUSTAND = { fokus: null };

/** openTabHelp/closeHelpModal mit einem Ersatz-Dialog laufen lassen. */
function dialog() {
    ZUSTAND = { fokus: null };
    const schliessen = knopf('schliessen');
    const link = knopf('link-im-text');
    const ausloeser = knopf('hilfe-knopf-dahinter');
    const modal = {
        _klassen: new Set(),
        classList: {
            add(c) { modal._klassen.add(c); },
            remove(c) { modal._klassen.delete(c); },
            contains(c) { return modal._klassen.has(c); }
        },
        querySelector: (sel) => {
            if (sel === '.help-modal-title') return { textContent: '' };
            if (sel === '.help-modal-body') return { innerHTML: '' };
            if (sel === '.help-modal-close') return schliessen;
            return null;
        },
        querySelectorAll: () => [schliessen, link],
        contains: (el) => el === schliessen || el === link
    };
    const zuhoerer = [];
    const dok = {
        get activeElement() { return ZUSTAND.fokus; },
        getElementById: (id) => (id === 'helpModal' ? modal : null),
        addEventListener: (art, f, fang) => { if (art === 'keydown') zuhoerer.push({ f, fang }); },
        removeEventListener: (art, f) => {
            const i = zuhoerer.findIndex(z => z.f === f);
            if (i >= 0) zuhoerer.splice(i, 1);
        }
    };
    const inhalt = "const TAB_HELP_CONTENT = { cards: { title: 'Card Database', html: '<p>x</p>' } };\n"
        + 'const TAB_HELP_CONTENT_DE = TAB_HELP_CONTENT;\n';
    const sb = {
        document: dok,
        window: { getLang: () => 'de' },
        Array, Object, String, setTimeout, clearTimeout, console
    };
    const namen = Object.keys(sb);
    // eslint-disable-next-line no-new-func
    const bau = new Function(...namen, inhalt
        + 'let _hilfeVorherFokus = null;\nlet _hilfeTastenZuhoerer = null;\n'
        + funktion('_hilfeFokusierbare') + '\n'
        + funktion('openTabHelp') + '\n'
        + funktion('closeHelpModal') + '\n'
        + 'return { openTabHelp, closeHelpModal };');
    const api = bau(...namen.map(k => sb[k]));
    return { api, modal, schliessen, link, ausloeser, zuhoerer };
}

function taste(zuhoerer, key, shift) {
    let verhindert = 0;
    const e = { key, shiftKey: Boolean(shift), preventDefault() { verhindert++; } };
    zuhoerer.slice().forEach(z => z.f(e));
    return verhindert;
}

describe('C7/B13/F19.1 — der Hilfe-Dialog laesst sich verlassen', () => {
    it('Escape schliesst ihn', () => {
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        assert.ok(d.modal.classList.contains('active'), 'der Dialog ist gar nicht offen');
        const verhindert = taste(d.zuhoerer, 'Escape');
        assert.ok(!d.modal.classList.contains('active'),
            'Escape schliesst nichts — wer keine Maus benutzt, kommt nur ueber Tab bis zum '
            + 'Schliessen-Knopf, und der liegt hinter dem ganzen uebrigen Seiteninhalt');
        assert.equal(verhindert, 1, 'Escape muss die Vorbelegung des Browsers verhindern');
    });

    it('der Fokus geht in den Dialog hinein', () => {
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        assert.equal(ZUSTAND.fokus, d.schliessen,
            'aria-modal="true" behauptet, hinter dem Dialog gaebe es nichts. Bleibt der '
            + 'Fokus draussen, liest eine Sprachausgabe weiter die Seite darunter vor.');
    });

    it('und nach dem Schliessen dorthin zurueck, wo er herkam', () => {
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        d.api.closeHelpModal();
        assert.equal(ZUSTAND.fokus, d.ausloeser,
            'ohne Rueckgabe faengt die naechste Tab-Taste wieder am Seitenanfang an');
    });

    it('Tab bleibt im Dialog gefangen', () => {
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        ZUSTAND.fokus = d.link;                       // letztes Element
        assert.equal(taste(d.zuhoerer, 'Tab'), 1, 'Tab am Ende gibt den Fokus nach draussen ab');
        assert.equal(ZUSTAND.fokus, d.schliessen, 'Tab springt nicht auf das erste Element');

        ZUSTAND.fokus = d.schliessen;                 // erstes Element
        assert.equal(taste(d.zuhoerer, 'Tab', true), 1, 'Shift+Tab gibt den Fokus nach draussen ab');
        assert.equal(ZUSTAND.fokus, d.link, 'Shift+Tab springt nicht auf das letzte Element');
    });

    it('der Zuhoerer wird beim Schliessen wieder abgemeldet', () => {
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        assert.equal(d.zuhoerer.length, 1);
        d.api.closeHelpModal();
        assert.equal(d.zuhoerer.length, 0,
            'ein liegen gebliebener Escape-Zuhoerer faengt Tastendruecke, die dem Dialog '
            + 'nicht mehr gehoeren');
    });

    it('zweimaliges Oeffnen haengt nicht zwei Zuhoerer an', () => {
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        d.api.openTabHelp('cards');
        assert.equal(d.zuhoerer.length, 1, 'Zuhoerer stapeln sich');
    });

    it('zweimaliges Oeffnen verliert den Rueckweg nicht', () => {
        /* BEFUND 07.09.2026: _hilfeVorherFokus wurde bei JEDEM Oeffnen
         * unbedingt neu gesetzt. Beim zweiten openTabHelp() lag der Fokus
         * schon im Dialog, also merkte sich der Dialog seinen eigenen
         * Schliessen-Knopf — und schickte den Fokus beim Schliessen auf
         * ein Element, das dann verdeckt ist. */
        const d = dialog();
        ZUSTAND.fokus = d.ausloeser;
        d.api.openTabHelp('cards');
        assert.equal(ZUSTAND.fokus, d.schliessen, 'Vorbedingung: der Fokus liegt im Dialog');
        d.api.openTabHelp('cards');   // z. B. Hilfe eines anderen Reiters
        d.api.closeHelpModal();
        assert.equal(ZUSTAND.fokus, d.ausloeser,
            'der Fokus landete auf ' + (ZUSTAND.fokus && ZUSTAND.fokus._name)
            + ' statt auf dem Knopf, von dem aus geoeffnet wurde');
    });
});

/* ══ B12 — Fenstertitel und Abzeichen ══════════════════════════════ */

/** Der echte Titelblock aus switchTab(), herausgeschnitten.
 *
 * Geschnitten wird ueber die Klammerbilanz und nicht auf die naechste
 * schliessende Klammer nach dem Ersatztitel: der else-Zweig setzt seit
 * dem 07.09.2026 auch das Abzeichen zurueck, und der alte Schnitt haette
 * mitten in dessen if-Block geendet. */
const TITELBLOCK = (() => {
    const a = CORE.indexOf('const menuKnopfEl = document.getElementById');
    assert.ok(a >= 0, 'der Titelblock sieht anders aus als erwartet');
    const marke = "document.title = 'The Dipidis';";  // UI-79 (03.10.2026): Seitenname
    const e = CORE.indexOf(marke, a);
    assert.ok(e > a, 'der Ersatztitel fehlt');
    let tiefe = 1; // wir stehen im else-Block
    for (let j = e; j < CORE.length; j++) {
        if (CORE[j] === '{') tiefe++;
        else if (CORE[j] === '}') { tiefe--; if (tiefe === 0) return CORE.slice(a, j + 1); }
    }
    assert.fail('der else-Zweig des Titelblocks geht nicht zu');
})();

/** Die Menuepunkte, wie sie wirklich in index.html stehen. */
const MENUE = [...HTML.matchAll(
    /<button id="(menu-btn-[^"]+)"[^>]*class="menu-item[^"]*"[^>]*data-tab-id="([^"]+)"[\s\S]{0,500}?<span class="menu-item-label">([^<]*)<\/span>/g
)].map(m => ({ id: m[1], tab: m[2], label: m[3].trim() }));

/** Die Ueberschrift eines Reiters aus index.html, mit und ohne data-i18n. */
function ueberschrift(tabId, mitI18n) {
    const i = HTML.indexOf('<div id="' + tabId + '" class="tab-content');
    if (i < 0) return null;
    const stueck = HTML.slice(i, i + 5000);
    if (mitI18n) {
        const m = stueck.match(/<h[12][^>]*>[\s\S]{0,800}?<span data-i18n="[^"]*"[^>]*>([^<]*)<\/span>/);
        return m ? m[1] : null;
    }
    const m = stueck.match(/<h[12][^>]*>([^<]+)</);
    return m && m[1].trim() ? m[1] : null;
}

function titelSetzen(tabName, knopfText) {
    const badge = { textContent: 'ABZEICHEN DER VORIGEN ANSICHT', style: {} };
    const dok = {
        title: 'TITEL DER VORIGEN ANSICHT',
        getElementById: (id) => {
            if (id === 'current-tab-title') return badge;
            const e = MENUE.find(m => m.id === id);
            return e ? { querySelector: (s) => (s === '.menu-item-label' ? { textContent: e.label } : null) } : null;
        },
        querySelector: (sel) => {
            let m = sel.match(/^\.menu-item\[data-tab-id="([^"]+)"\] \.menu-item-label$/);
            if (m) {
                const e = MENUE.find(x => x.tab === m[1]);
                return e ? { textContent: e.label } : null;
            }
            m = sel.match(/^#([\w-]+) h2 \[data-i18n\], #[\w-]+ h1 \[data-i18n\]$/);
            if (m) { const t = ueberschrift(m[1], true); return t ? { textContent: t } : null; }
            m = sel.match(/^#([\w-]+) h2, #[\w-]+ h1$/);
            if (m) { const t = ueberschrift(m[1], false); return t ? { textContent: t } : null; }
            return null;
        }
    };
    const sb = { document: dok, String, tabName, activeBtn: knopfText ? { textContent: knopfText } : null };
    const namen = Object.keys(sb);
    // eslint-disable-next-line no-new-func
    new Function(...namen, TITELBLOCK)(...namen.map(k => sb[k]));
    return { titel: dok.title, abzeichen: badge.textContent, abzeichenAnzeige: badge.style.display };
}

/** Die Beschriftung, die js/inline-init.js dem Abzeichen gibt. */
function abzeichenAusInlineInit(tabName) {
    const e = MENUE.find(m => m.id === 'menu-btn-' + tabName);
    return e ? e.label : null;
}

describe('B12/A-F0.2c — Fenstertitel und Abzeichen nennen dieselbe Ansicht', () => {
    it('current-meta: der Titel nimmt denselben Menuepunkt wie das Abzeichen', () => {
        /* URSPRUENGLICH stand hier eine Wache: die Zusicherung pruefe nur
           etwas, SOLANGE es fuer current-meta mehrere Menuepunkte gebe —
           den Punkt der Ansicht selbst und den Rueckweg zur Startseite,
           beide mit data-tab-id="current-meta". Der Ersatzweg in
           js/app-core.js nimmt per querySelector den ersten der beiden,
           und das war der Rueckweg mit der Beschriftung "Startseite".

           Am 07.09.2026 (Befund B3) ist das doppelte Merkmal aus
           index.html entfernt worden — der Rueckweg traegt keins mehr.
           Damit ist die Wache ins Gegenteil zu drehen: es darf nur noch
           EINEN Menuepunkt fuer current-meta geben. Kaeme der zweite
           zurueck, entschiede wieder die Reihenfolge im Markup, welche
           Beschriftung in den Fenstertitel geht — und die Zusicherungen
           darunter fielen. */
        const fuerCurrentMeta = MENUE.filter(m => m.tab === 'current-meta');
        assert.equal(fuerCurrentMeta.length, 1,
            'Fuer current-meta gibt es wieder mehr als einen Menuepunkt mit '
            + 'data-tab-id — dann nimmt der Ersatzweg in js/app-core.js den ersten, '
            + 'nicht unbedingt den richtigen: ' + JSON.stringify(fuerCurrentMeta));
        const r = titelSetzen('current-meta', 'Overview');
        const ausAbzeichen = abzeichenAusInlineInit('current-meta');
        assert.equal(r.abzeichen, ausAbzeichen,
            'js/inline-init.js beschriftet das Abzeichen ueber menu-btn-current-meta und '
            + 'ueberschreibt den hier gesetzten Wert. Zwei Wege, ein Bild, zwei Namen.');
        assert.equal(r.titel, ausAbzeichen + ' – The Dipidis',
            'gemessen stand hier "Overview – Pokémon TCG Hub" neben dem Abzeichen '
            + '"Current Meta (Global)"');
    });

    it('admin: Titel und Abzeichen bleiben nicht auf der vorigen Ansicht stehen', () => {
        assert.equal(MENUE.filter(m => m.tab === 'admin').length, 0,
            'diese Zusicherung setzt voraus, dass admin keinen Menuepunkt hat');
        const r = titelSetzen('admin', null);
        assert.ok(!/VORIGEN/.test(r.titel),
            'der Fenstertitel trug den Namen einer Ansicht, die gar nicht offen ist: ' + r.titel);
        assert.ok(!/VORIGEN/.test(r.abzeichen), 'und das Abzeichen ebenso: ' + r.abzeichen);
    });

    it('admin nimmt seine eigene Ueberschrift, auch ohne data-i18n', () => {
        assert.equal(ueberschrift('admin', true), null,
            'die Voraussetzung des Befunds: die Ueberschrift von admin traegt kein data-i18n');
        const eigene = ueberschrift('admin', false);
        assert.ok(eigene, 'admin hat gar keine Ueberschrift mehr in index.html');
        const r = titelSetzen('admin', null);
        assert.equal(r.titel, eigene.trim() + ' – The Dipidis');
        assert.equal(r.abzeichen, eigene.trim());
    });

    it('ein Reiter mit genau einem Menuepunkt behaelt seine Beschriftung', () => {
        const r = titelSetzen('cards', 'Cards');
        assert.equal(r.abzeichen, abzeichenAusInlineInit('cards'));
        assert.equal(r.titel, abzeichenAusInlineInit('cards') + ' – The Dipidis');
    });

    it('ohne jeden Anhaltspunkt steht der reine Seitenname da, nicht der alte', () => {
        const r = titelSetzen('gibt-es-nicht', null);
        assert.equal(r.titel, 'The Dipidis',
            'den Titel der vorigen Ansicht stehen zu lassen ist die einzige Antwort, die '
            + 'sicher falsch ist — Lesezeichen und Verlauf trugen sonst einen fremden Namen');
    });

    it('und auch das ABZEICHEN behaelt dann nicht den alten Namen', () => {
        /* BEFUND 07.09.2026: der else-Zweig setzte nur document.title
         * zurueck. #current-tab-title trug weiter den Namen der vorher
         * geoeffneten Ansicht — genau die Uneinigkeit zwischen Titel und
         * Abzeichen, gegen die der Zweig gebaut wurde, eine Zeile weiter. */
        const r = titelSetzen('gibt-es-nicht', null);
        assert.ok(!/VORIGEN/.test(r.abzeichen),
            'das Abzeichen nennt eine Ansicht, die nicht offen ist: ' + r.abzeichen);
        assert.equal(r.abzeichen, '',
            'ein Abzeichen ohne bekannten Namen zeigt gar nichts, statt zu raten');
    });

    it('das leere Abzeichen wird ausgeblendet, nicht als leerer Streifen gezeigt', () => {
        const r = titelSetzen('gibt-es-nicht', null);
        assert.equal(r.abzeichenAnzeige, 'none',
            'eine leere Plakette ohne display:none bleibt als farbiger Rest stehen');
    });
});
