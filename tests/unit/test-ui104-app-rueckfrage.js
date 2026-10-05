/**
 * UI-104 (N3-02, T3-13, G3-08, M3-11; UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: Loeschen (Deck, Ordner, Deck leeren, Box, Karte, Journal,
 * Szenario, Testgruppe, Binder, Proxy-Liste) lief ueber natives confirm();
 * im Hintergrund-Tab fror der Tab ein (Agent 1), ohne ARIA, ohne Namen.
 *
 * ZUSICHERUNG: (1) zeigeBestaetigung aus js/app-core.js wird AUSGEFUEHRT:
 * Rolle alertdialog, Fokus bei Loeschfragen auf „Abbrechen“, Klick auf den
 * Bestaetigen-Knopf -> true, Esc -> false, Fokus zurueck zum Ausloeser.
 * (2) In js/ steht kein confirm()/prompt() mehr ausserhalb der Rueckfall-
 * form neben zeigeBestaetigung bzw. showInputModal (Kommentare entfernt).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib-dom-sandkasten.js');

function el(tag) {
    const e = {
        tagName: tag.toUpperCase(), children: [], parentElement: null, attrs: {}, dataset: {}, style: {},
        _text: '', className: '', value: '', hoerer: {},
        get textContent() { return this._text || this.children.map(c => c.textContent).join(''); },
        set textContent(v) { this._text = String(v); this.children = []; },
        set innerHTML(v) { this.children = []; this._text = ''; },
        get classList() {
            const self = this;
            const teile = () => self.className.split(/\s+/).filter(Boolean);
            const cl = {
                add: (c) => { if (!teile().includes(c)) self.className = (self.className + ' ' + c).trim(); },
                remove: (c) => { self.className = teile().filter(x => x !== c).join(' '); },
                contains: (c) => teile().includes(c),
                toggle: (c, an) => { (an ? cl.add : cl.remove)(c); },
            };
            return cl;
        },
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
        removeAttribute(k) { delete this.attrs[k]; },
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
        insertBefore(c, ref) { c.parentElement = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; },
        remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); },
        contains(x) { for (let k = x; k; k = k.parentElement) if (k === this) return true; return false; },
        alle() { const r = []; (function ab(n) { n.children.forEach(c => { r.push(c); ab(c); }); })(this); return r; },
        querySelectorAll(sel) {
            if (sel.startsWith('.')) return this.alle().filter(n => n.classList.contains(sel.slice(1)));
            return this.alle().filter(n => n.tagName === sel.toUpperCase());
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        addEventListener(t, f) { (this.hoerer[t] = this.hoerer[t] || []).push(f); },
        removeEventListener() {},
        dispatchEvent(ev) { (this.hoerer[ev.type] || []).forEach(f => f(ev)); return true; },
        focus() { doc.activeElement = this; },
        getBoundingClientRect() { return { left: 10, bottom: 40, width: 300 }; },
        scrollIntoView() {},
    };
    return e;
}

function umgebung() {
    const doc = { activeElement: null, hoerer: {}, createElement: (t) => { const e = el(t); e.focus = function () { doc.activeElement = this; }; return e; },
        addEventListener(t, f) { (this.hoerer[t] = this.hoerer[t] || []).push(f); },
        removeEventListener(t, f) { this.hoerer[t] = (this.hoerer[t] || []).filter(x => x !== f); } };
    doc.body = doc.createElement('body');
    const ausloeser = doc.createElement('button'); doc.body.appendChild(ausloeser); ausloeser.focus();
    const ctx = L.baue('js/app-core.js', ['function zeigeBestaetigung(opts)'], {
        document: doc, window: {}, t: (k) => ({ 'modal.cancel': 'Abbrechen', 'modal.ok': 'OK' }[k] || k), getLang: () => 'de',
    });
    return { ctx, doc, ausloeser };
}
const finde = (doc, kl) => doc.body.alle().find(n => n.classList.contains(kl));

describe('UI-104: App-Rueckfrage statt confirm()', () => {
    it('Loeschfrage: Rolle, Text, Fokus auf Abbrechen, Bestaetigen -> true', async () => {
        const u = umgebung();
        const p = u.ctx.zeigeBestaetigung({ text: 'Deck „ZZ“ löschen?', gefaehrlich: true });
        const dlg = finde(u.doc, 'modal-dialog');
        assert.equal(dlg.getAttribute('role'), 'alertdialog');
        assert.equal(dlg.getAttribute('aria-modal'), 'true');
        assert.ok(dlg.textContent.includes('Deck „ZZ“ löschen?'));
        const nein = finde(u.doc, 'modal-btn-cancel'), ja = finde(u.doc, 'modal-btn-ok');
        assert.equal(u.doc.activeElement, nein, 'Fokus muss bei Loeschfragen auf Abbrechen stehen');
        assert.ok(ja.classList.contains('modal-btn-gefahr'));
        assert.equal(ja.textContent, 'Löschen');
        ja.onclick();
        assert.equal(await p, true);
        assert.equal(finde(u.doc, 'modal-dialog'), undefined, 'Dialog bleibt stehen');
        assert.equal(u.doc.activeElement, u.ausloeser, 'Fokus nicht zurueck');
    });
    it('Esc und Abbrechen ergeben false', async () => {
        let u = umgebung();
        let p = u.ctx.zeigeBestaetigung({ text: 'x' });
        u.doc.hoerer.keydown.forEach(f => f({ key: 'Escape', preventDefault() {} }));
        assert.equal(await p, false);
        u = umgebung();
        p = u.ctx.zeigeBestaetigung({ text: 'x' });
        finde(u.doc, 'modal-btn-cancel').onclick();
        assert.equal(await p, false);
    });
    it('in js/ steht kein natives confirm()/prompt() mehr ausser dem Rueckfall', () => {
        const dir = path.join(L.WURZEL, 'js');
        const funde = [];
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'i18n.js')) {
            const q = L.lies('js', f).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
                .map(z => z.replace(/(^|[^:'"\\])\/\/.*$/, '$1'));
            q.forEach((z, i) => {
                if (!/(^|[^\w.])(window\.)?(confirm|prompt)\(/.test(z)) return;
                if (/zeigeBestaetigung|showInputModal|typeof window\.confirm === 'function' && !window\.confirm/.test(z)) return;
                funde.push(f + ':' + (i + 1) + ' ' + z.trim().slice(0, 80));
            });
        }
        assert.deepEqual(funde, []);
    });
});
