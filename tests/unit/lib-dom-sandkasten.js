/**
 * Ein winziger DOM-Ersatz zum AUSFUEHREN von Oberflaechencode.
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Die Befunde C1, C2, C3 und C11 (Live-Durchgang 07.09.2026) sind alle
 * Laufzeitbefunde: eine Reiter-Kennung, die es im Markup nicht gibt, ein
 * Zaehler mit zwei Schreibern, eine Statistik, die sich versteckt. Ein
 * Quelltext-Grep sieht keinen davon — die Zeichenketten stehen ja alle
 * da. Nur Ausfuehren zeigt es.
 *
 * KEIN jsdom
 * ----------
 * Der Testschritt in .github/workflows/deploy-pages.yml installiert nur
 * papaparse (`npm install --no-save papaparse`). Ein Test, der jsdom
 * braucht, faellt dort um. Vorbild fuer diesen Ersatz sind
 * tests/unit/test-pocket-verhalten.js und
 * tests/unit/lib-tieflink-sandkasten.js — nur ist er hier etwas groesser,
 * weil ds-filter.js Knoten baut, umhaengt und ersetzt.
 *
 * WAS ER AUSDRUECKLICH NICHT KANN
 * -------------------------------
 * `innerHTML` ist KEIN HTML-Parser. Zuweisen merkt sich den Text und
 * leert die Kinder. Die EINE Ausnahme ist die Uebersichtskachel: aus
 * jedem oeffnenden Tag mit `class="card-item` entsteht ein Knoten mit
 * genau den fuenf data-Attributen, die uebersichtKachelnFiltern liest.
 * Mehr wird nicht gelesen — kein verschachtelter Baum, kein Text, keine
 * Ereignisse. Das reicht fuer die Kachelzaehlung und erfindet nichts.
 * Ebenso fehlen Layout, CSS und Ereignis-Blasen ueber mehrere Ebenen.
 *
 * Die Datei heisst bewusst NICHT test-*.js: scripts/run-js-unit-tests.sh
 * fuehrt nur `tests/unit/test-*.js` aus.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');

// ── Auswahlzeichenketten, so weit wie noetig ─────────────────────────

/** Eine einzelne Verbundbedingung wie `div.card-item#x[for="y"]`. */
function passt(knoten, teil) {
    teil = teil.trim();
    if (!teil || teil === '*') return true;
    const marken = teil.match(/^[a-zA-Z][a-zA-Z0-9-]*|\.[^.#\[]+|#[^.#\[]+|\[(?:[^\]"']|"[^"]*"|'[^']*')+\]/g) || [];
    return marken.every(m => {
        if (m[0] === '.') return knoten.classList.contains(m.slice(1));
        if (m[0] === '#') return knoten.id === m.slice(1);
        if (m[0] === '[') {
            // Traegt =, *=, ^= und $= — mehr braucht der gepruefte Code nicht.
            const g = m.slice(1, -1).match(/^([^=*^$]+)([*^$]?)=?(?:["']?([\s\S]*?)["']?)?$/);
            if (!g) return false;
            const wert = knoten.getAttribute(g[1].trim());
            if (g[3] === undefined || g[3] === '') return wert !== null;
            if (wert === null) return false;
            if (g[2] === '*') return wert.indexOf(g[3]) >= 0;
            if (g[2] === '^') return wert.indexOf(g[3]) === 0;
            if (g[2] === '$') return wert.slice(-g[3].length) === g[3];
            return wert === g[3];
        }
        return knoten.tagName === m.toUpperCase();
    });
}

/**
 * Unterstuetzt: Kommalisten, Nachfahren (Leerzeichen), Kindkombinator
 * `>` und den Anker `:scope`. Mehr braucht der gepruefte Code nicht.
 */
function suche(wurzel, auswahl, nurErster) {
    const treffer = [];
    String(auswahl).split(',').forEach(zweig => {
        const stufen = zweig.trim().split(/\s+/).filter(Boolean);
        if (!stufen.length) return;
        // Startmenge: :scope heisst "nur die Kinder von wurzel".
        let ausgang = [wurzel];
        let i = 0;
        if (stufen[0] === ':scope') i = 1;
        for (; i < stufen.length; i++) {
            const stufe = stufen[i];
            if (stufe === '>') {
                const s = stufen[++i];
                ausgang = ausgang.flatMap(k => k.children.filter(c => passt(c, s)));
            } else {
                ausgang = ausgang.flatMap(k => nachfahren(k).filter(c => passt(c, stufe)));
            }
        }
        ausgang.forEach(k => { if (k !== wurzel && !treffer.includes(k)) treffer.push(k); });
    });
    return nurErster ? (treffer[0] || null) : treffer;
}

function nachfahren(knoten) {
    const raus = [];
    (function ab(k) { k.children.forEach(c => { raus.push(c); ab(c); }); })(knoten);
    return raus;
}

// ── Der Knoten ──────────────────────────────────────────────────────

function Knoten(tag, dok) {
    const self = {
        tagName: String(tag || 'div').toUpperCase(),
        children: [],
        parentElement: null,
        style: {},
        dataset: {},
        _attr: {},
        _hoerer: {},
        _innerHTML: '',
        _text: '',
        _value: '',
        _disabled: false,
        selected: false,
        hidden: false,
        _dok: dok,
    };

    /* ── Warum textContent, disabled und title Zugriffe sind ──────────
     *
     * BEFUND B8 (Pruefagent, 07.09.2026): js/ds-filter.js horchte nur auf
     * `childList`. Drei Wege liefen daneben, alle drei ohne Ereignis:
     * `option.disabled = true` + `title` (Saisonpause), `select.value = …`
     * per JavaScript, und `option.textContent` beim Sprachwechsel.
     *
     * Im Browser sind das echte Mutationen: `.disabled` und `.title`
     * setzen Attribute, `.textContent` tauscht den Textknoten. Ein
     * Sandkasten, in dem das stille Feldzuweisungen sind, kann den Befund
     * nicht nachstellen — er wuerde jede Korrektur bestehen lassen.
     * Deshalb verhalten sie sich hier wie im Browser.
     */
    Object.defineProperty(self, 'textContent', {
        get() { return self._text; },
        set(v) {
            self._text = String(v);
            // Im Browser ist das ein Kindtausch am Knoten selbst.
            self._melden('characterData');
            self._melden('childList');
        },
    });
    Object.defineProperty(self, 'disabled', {
        get() { return self._disabled; },
        set(v) {
            self._disabled = !!v;
            if (self._disabled) self._attr.disabled = '';
            else delete self._attr.disabled;
            self._melden('attributes', self, 'disabled');
        },
    });
    Object.defineProperty(self, 'title', {
        get() { return 'title' in self._attr ? String(self._attr.title) : ''; },
        set(v) { self._attr.title = String(v); self._melden('attributes', self, 'title'); },
    });

    /* `value` verhaelt sich bei <select> wie im Browser: gelesen wird der
       Wert der ausgewaehlten Option, geschrieben wird die Auswahl gesetzt.
       Ohne das misst ein Test am Auswahlfeld den Rueckfluss falsch — genau
       die Falle, in die die erste Messung zu Befund C2 gelaufen ist. */
    Object.defineProperty(self, 'value', {
        /* configurable wie im Browser: HTMLSelectElement.prototype.value
           ist ein konfigurierbarer Zugriff. js/ds-filter.js umschliesst ihn
           (Befund B8, "select.value = …" loest kein Ereignis aus); mit
           configurable:false waere das hier stillschweigend unmoeglich und
           der Test haette eine Korrektur gemessen, die es nicht gibt. */
        configurable: true,
        get() {
            if (self.tagName !== 'SELECT') return self._value;
            const gewaehlt = self.options.find(o => o.selected);
            return gewaehlt ? gewaehlt._value : (self.options[0] ? self.options[0]._value : '');
        },
        set(v) {
            if (self.tagName !== 'SELECT') { self._value = String(v); return; }
            let getroffen = false;
            self.options.forEach(o => {
                o.selected = (o._value === String(v));
                if (o.selected) getroffen = true;
            });
            if (!getroffen && self.options.length) self.options[0].selected = true;
        },
    });

    self.classList = {
        add(...k) { k.forEach(x => { if (x) self._klassen().add(x); }); self._klassenZurueck(); },
        remove(...k) { k.forEach(x => self._klassen().delete(x)); self._klassenZurueck(); },
        contains(k) { return self._klassen().has(k); },
        toggle(k, an) {
            const hat = self._klassen().has(k);
            const soll = (an === undefined) ? !hat : !!an;
            if (soll) self.classList.add(k); else self.classList.remove(k);
            return soll;
        },
    };
    self._klassenMenge = new Set();
    self._klassen = () => self._klassenMenge;
    self._klassenZurueck = () => { self._attr.class = [...self._klassenMenge].join(' '); };

    Object.defineProperty(self, 'className', {
        get() { return [...self._klassenMenge].join(' '); },
        set(v) { self._klassenMenge = new Set(String(v).split(/\s+/).filter(Boolean)); self._klassenZurueck(); },
    });
    Object.defineProperty(self, 'id', {
        get() { return self._attr.id || ''; },
        set(v) { self._attr.id = String(v); if (dok) dok._merke(self); },
    });
    Object.defineProperty(self, 'innerHTML', {
        get() { return self._innerHTML; },
        // Zuweisen leert die Kinder. Es wird NICHTS geparst — wer
        // Kacheln zaehlen will, haengt sie als Knoten ein.
        set(v) {
            self._innerHTML = String(v);
            self.children.forEach(c => { c.parentElement = null; });
            self.children = [];
            kachelnAusHtml(self._innerHTML, dok).forEach(k => {
                k.parentElement = self; self.children.push(k);
            });
            self._melden();
        },
    });
    Object.defineProperty(self, 'options', {
        get() { return self.children.filter(c => c.tagName === 'OPTION'); },
    });

    self.getAttribute = (n) => (n in self._attr ? String(self._attr[n]) : null);
    self.setAttribute = (n, v) => {
        self._attr[n] = String(v);
        if (n === 'class') self.className = v;
        if (n === 'id' && dok) dok._merke(self);
        if (n === 'disabled') self._disabled = true;
        self._melden('attributes', self, n);
    };
    self.hasAttribute = (n) => n in self._attr;
    self.removeAttribute = (n) => {
        delete self._attr[n];
        if (n === 'disabled') self._disabled = false;
        self._melden('attributes', self, n);
    };

    self.appendChild = (k) => {
        if (k.parentElement) k.parentElement.removeChild(k);
        k.parentElement = self; self.children.push(k); if (dok) dok._merke(k);
        self._auswahlOrdnen();
        self._melden();
        return k;
    };
    /* Der Baum hat sich geaendert — die Beobachter benachrichtigen.
       Getragen werden childList, attributes und characterData, jeweils
       mit oder ohne `subtree`. Mehr braucht der gepruefte Code nicht,
       und weniger haette Befund B8 nicht nachstellen koennen. */
    self._beobachter = [];
    self._melden = (art, ziel, name) => {
        art = art || 'childList';
        ziel = ziel || self;
        let k = self;
        while (k) {
            (k._beobachter || []).slice().forEach(b => {
                const opts = (b && b.opts) || {};
                if (!opts[art]) return;
                if (k !== ziel && !opts.subtree) return;
                // attributeFilter wie im Browser: nur die genannten Namen.
                if (art === 'attributes' && Array.isArray(opts.attributeFilter)
                    && (!name || opts.attributeFilter.indexOf(name) < 0)) return;
                b.rueckruf([{ type: art, target: ziel, attributeName: name || null }]);
            });
            k = k.parentElement;
        }
    };
    /* Der Ruecksetzlauf des Browsers ("ask for a reset"): in einer
       einfachen Auswahl bleibt hoechstens EINE Option gewaehlt — die
       zuletzt markierte. Ist keine markiert, gilt die erste. Ohne diese
       Regel misst ein Test den Rueckfluss falsch: die erste Messung zu
       Befund C2 las deshalb "all", obwohl die richtige Option markiert
       war. */
    self._auswahlOrdnen = () => {
        if (self.tagName !== 'SELECT') return;
        const opts = self.options;
        if (!opts.length) return;
        const gewaehlt = opts.filter(o => o.selected);
        if (!gewaehlt.length) { opts[0].selected = true; return; }
        gewaehlt.slice(0, -1).forEach(o => { o.selected = false; });
    };
    self.removeChild = (k) => {
        const i = self.children.indexOf(k);
        if (i >= 0) { self.children.splice(i, 1); k.parentElement = null; }
        return k;
    };
    self.insertBefore = (neu, anker) => {
        if (neu.parentElement) neu.parentElement.removeChild(neu);
        const i = anker ? self.children.indexOf(anker) : -1;
        if (i < 0) self.children.push(neu); else self.children.splice(i, 0, neu);
        neu.parentElement = self; if (dok) dok._merke(neu); return neu;
    };
    self.replaceChild = (neu, alt) => {
        const i = self.children.indexOf(alt);
        if (i < 0) throw new Error('replaceChild: Knoten ist kein Kind');
        if (neu.parentElement) neu.parentElement.removeChild(neu);
        self.children[i] = neu; neu.parentElement = self; alt.parentElement = null;
        if (dok) dok._merke(neu);
        return alt;
    };
    Object.defineProperty(self, 'nextSibling', {
        get() {
            if (!self.parentElement) return null;
            const i = self.parentElement.children.indexOf(self);
            return self.parentElement.children[i + 1] || null;
        },
    });

    self.querySelector = (s) => suche(self, s, true);
    self.querySelectorAll = (s) => suche(self, s, false);
    self.closest = (s) => {
        let k = self;
        while (k) { if (passt(k, s)) return k; k = k.parentElement; }
        return null;
    };
    /* Nur einfache Verbundbedingungen, auch durch Komma getrennt —
       js/ds-sections.js (sammle) braucht nicht mehr (UI-13, 27.09.2026). */
    self.matches = (s) => String(s).split(',').some(z => passt(self, z));
    self.contains = (k) => { while (k) { if (k === self) return true; k = k.parentElement; } return false; };

    self.addEventListener = (art, f) => { (self._hoerer[art] = self._hoerer[art] || []).push(f); };
    self.removeEventListener = (art, f) => {
        const l = self._hoerer[art] || [];
        const i = l.indexOf(f); if (i >= 0) l.splice(i, 1);
    };
    self.dispatchEvent = (ev) => {
        const art = ev && ev.type ? ev.type : String(ev);
        (self._hoerer[art] || []).forEach(f => f.call(self, Object.assign({ target: self }, ev || {})));
        return true;
    };
    self.click = () => self.dispatchEvent({ type: 'click' });
    self.focus = () => {};
    self.insertAdjacentElement = (wo, k) => {
        if (!self.parentElement) return k;
        if (wo === 'afterend') self.parentElement.insertBefore(k, self.nextSibling);
        else if (wo === 'beforebegin') self.parentElement.insertBefore(k, self);
        return k;
    };
    self.insertAdjacentHTML = (wo, html) => {
        const neueKacheln = kachelnAusHtml(String(html), dok);
        if (wo === 'beforeend') {
            self._innerHTML += String(html);
            neueKacheln.forEach(k => { k.parentElement = self; self.children.push(k); });
        } else {
            self._innerHTML = String(html) + self._innerHTML;
            neueKacheln.reverse().forEach(k => { k.parentElement = self; self.children.unshift(k); });
        }
        self._melden();
    };
    self.remove = () => { if (self.parentElement) self.parentElement.removeChild(self); };

    return self;
}

// ── Das Dokument ────────────────────────────────────────────────────

/**
 * Der kleinste MutationObserver, der traegt: `childList`, `attributes`
 * und `characterData`, mit und ohne `subtree`. Die Optionen werden
 * WIRKLICH ausgewertet — ein Beobachter, der alles meldet, haette
 * Befund B8 (Sperre, Wertzuweisung und Sprachwechsel am Auswahlfeld)
 * nicht sichtbar machen koennen.
 */
function BeobachterKlasse() {
    return function MutationObserver(rueckruf) {
        return {
            observe(knoten, opts) {
                if (knoten && knoten._beobachter) {
                    knoten._beobachter.push({ rueckruf: rueckruf, opts: opts || {} });
                }
            },
            disconnect() {},
        };
    };
}

function dokument() {
    const nachId = {};
    const dok = {
        readyState: 'complete',
        _hoerer: {},
        _merke(k) { if (k && k.id) nachId[k.id] = k; },
        createElement(tag) { return Knoten(tag, dok); },
        getElementById(id) { return nachId[id] || null; },
        querySelector(s) { return suche(dok.documentElement, s, true); },
        querySelectorAll(s) { return suche(dok.documentElement, s, false); },
        addEventListener(art, f) { (dok._hoerer[art] = dok._hoerer[art] || []).push(f); },
        removeEventListener() {},
        dispatchEvent(ev) {
            const art = ev && ev.type ? ev.type : String(ev);
            (dok._hoerer[art] || []).forEach(f => f(ev));
            return true;
        },
    };
    dok.documentElement = Knoten('html', dok);
    dok.body = Knoten('body', dok);
    dok.documentElement.appendChild(dok.body);
    /** Kurzform: Knoten mit Kennung anlegen und in den Baum haengen. */
    dok.neu = (tag, id, elternteil) => {
        const k = Knoten(tag, dok);
        if (id) k.id = id;
        (elternteil || dok.body).appendChild(k);
        return k;
    };
    return dok;
}

/**
 * Aus HTML die Uebersichtskacheln herausziehen — NICHT parsen, zaehlen.
 * Gesucht wird jedes oeffnende Tag, dessen class-Attribut mit
 * "card-item" beginnt; mitgenommen werden die fuenf data-Attribute, die
 * js/deck-analysis-shared.js liest. Alles andere im HTML ist egal.
 */
function kachelnAusHtml(html, dok) {
    const raus = [];
    const tags = String(html).match(/<[a-zA-Z][^>]*class="card-item[^"]*"[^>]*>/g) || [];
    tags.forEach(tag => {
        const k = Knoten('div', dok);
        const klasse = tag.match(/class="([^"]*)"/);
        k.className = klasse ? klasse[1] : 'card-item';
        ['data-card-name', 'data-card-name-de', 'data-card-set',
         'data-card-number', 'data-card-type'].forEach(name => {
            const m = tag.match(new RegExp(name + '="([^"]*)"'));
            if (m) k.setAttribute(name, m[1]);
        });
        raus.push(k);
    });
    return raus;
}

/** Eine Uebersichtskachel, wie sie renderPastMetaGridView erzeugt. */
function kachel(dok, o) {
    const k = Knoten('div', dok);
    k.className = 'card-item city-league-card-item';
    k.setAttribute('data-card-name', String(o.name || '').toLowerCase());
    k.setAttribute('data-card-name-de', String(o.nameDe || '').toLowerCase());
    k.setAttribute('data-card-set', String(o.set || '').toLowerCase());
    k.setAttribute('data-card-number', String(o.nummer || '').toLowerCase());
    k.setAttribute('data-card-type', String(o.typ || 'Pokemon'));
    return k;
}

// ── Takt: rAF und setTimeout deterministisch abarbeiten ─────────────

function takt() {
    let naechste = 1;
    const rahmen = new Map();
    const uhren = [];
    const zustand = {
        requestAnimationFrame(f) { const id = naechste++; rahmen.set(id, f); return id; },
        cancelAnimationFrame(id) { rahmen.delete(id); },
        setTimeout(f, ms) { const id = naechste++; uhren.push({ id, f, ms: ms || 0 }); return id; },
        clearTimeout(id) { const i = uhren.findIndex(u => u.id === id); if (i >= 0) uhren.splice(i, 1); },
        /** Alles abarbeiten, was ansteht — hoechstens `grenze` Runden. */
        laufen(grenze) {
            let runden = 0;
            const max = grenze || 500;
            while ((rahmen.size || uhren.length) && runden < max) {
                runden++;
                const r = [...rahmen.entries()];
                rahmen.clear();
                r.forEach(([, f]) => f(runden * 16));
                uhren.sort((a, b) => a.ms - b.ms);
                const u = uhren.splice(0, uhren.length);
                u.forEach(x => x.f());
            }
            return { runden, abgebrochen: runden >= max };
        },
        offen() { return { rahmen: rahmen.size, uhren: uhren.length }; },
    };
    return zustand;
}

/** Quelltext einer benannten Funktion per Klammerzaehlung ausschneiden. */
function ausschnitt(quelltext, marke, welcher) {
    let start = -1;
    let ab = 0;
    for (let n = 0; n <= (welcher || 0); n++) {
        start = quelltext.indexOf(marke, ab);
        if (start < 0) throw new Error('nicht gefunden: ' + marke);
        ab = start + 1;
    }
    let tiefe = 0;
    for (let j = quelltext.indexOf('{', start); j < quelltext.length; j++) {
        if (quelltext[j] === '{') tiefe++;
        else if (quelltext[j] === '}') {
            tiefe--;
            if (tiefe === 0) return quelltext.slice(start, j + 1);
        }
    }
    throw new Error(marke + ': die Klammern gehen nicht auf');
}

function lies(...teile) {
    return fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');
}

/**
 * Funktionen aus einer Projektdatei in einem eigenen Kontext ausfuehren.
 * @param {string[]} marken  Funktionskoepfe, z. B. 'function clearDeck(source)'
 * @param {object}   umfeld  Globale, die der Ausschnitt vorfindet
 */
function baue(datei, marken, umfeld) {
    const quelltext = lies(...datei.split('/'));
    const ctx = Object.assign({ console }, umfeld);
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const code = marken.map(m => ausschnitt(quelltext, m)).join('\n') + '\n' +
        marken.map(m => {
            const n = m.match(/function\s+([A-Za-z0-9_$]+)/)[1];
            return `globalThis.${n} = ${n};`;
        }).join('\n');
    vm.runInContext(code, ctx, { filename: datei });
    return ctx;
}

module.exports = { WURZEL, Knoten, dokument, kachel, kachelnAusHtml, takt, ausschnitt, lies, baue, suche, passt, BeobachterKlasse };
