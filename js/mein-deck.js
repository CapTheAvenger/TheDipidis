/* mein-deck.js — „Mein Deck" app-weit (UI-110, IA Etappe 1, 05.10.2026)
 * ---------------------------------------------------------------------
 * Hausi 05.10.2026: Informationsarchitektur Vorschlag A in Etappen. Bis
 * heute gab es „Mein Deck" nur im Meta Call (localStorage
 * `metacall_mydeck_v1`); Journal und Deck-Analyse fragten jeweils neu.
 *
 * Diese Datei ist der EINE Ort dafuer:
 *   MeinDeck.lesen()             → gemerkter Name oder ''
 *   MeinDeck.setzen(name, quelle)→ merkt (leer = vergessen) und meldet
 *                                  'meindeck:geaendert' {name, quelle}
 * Der Schluessel bleibt `metacall_mydeck_v1` — so bleibt die Wahl jedes
 * Nutzers erhalten (nichts wird umgeschrieben).
 *
 * Dazu ein kleiner Knopf im Kopf („★ Mega Excadrill" bzw. „★ Mein Deck"),
 * der eine Auswahl oeffnet. Gelesen wird die Deckliste aus
 * data/limitless_online_decks.csv (dieselbe Datei wie Meta und Tier-Liste,
 * ueber den gemeinsamen Abruf), sortiert nach Anzahl.
 */
(function () {
    'use strict';
    var KEY = 'metacall_mydeck_v1';

    function lesen() {
        try { return String(localStorage.getItem(KEY) || '').trim(); } catch (_e) { return ''; }
    }

    function setzen(name, quelle) {
        var n = String(name || '').trim();
        if (n === lesen()) return n;
        try {
            if (n) localStorage.setItem(KEY, n); else localStorage.removeItem(KEY);
        } catch (_e) { /* privater Modus: dann gilt es nur bis zum Neuladen */ }
        try {
            document.dispatchEvent(new CustomEvent('meindeck:geaendert', { detail: { name: n, quelle: quelle || '' } }));
        } catch (_e) { /* ohne DOM nichts zu melden */ }
        knopfZeichnen();
        return n;
    }

    function de() {
        return (typeof window.getLang !== 'function') || window.getLang() === 'de';
    }

    /* ── Die Deckliste ───────────────────────────────────────────── */
    var _namen = null;
    function namenLaden() {
        if (_namen) return Promise.resolve(_namen);
        /* global BASE_PATH */
        var basis = (typeof BASE_PATH === 'string' && BASE_PATH) ? BASE_PATH : 'data/';
        return fetch(basis + 'limitless_online_decks.csv')
            .then(function (r) { return r.ok ? r.text() : ''; })
            .then(function (txt) {
                var zeilen = String(txt || '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
                if (!zeilen.length) return [];
                var kopf = zeilen[0].split(';');
                var iName = kopf.indexOf('deck_name'), iAnz = kopf.indexOf('count');
                var liste = zeilen.slice(1).map(function (z) {
                    var t = z.split(';');
                    return { name: (t[iName] || '').trim(), n: parseInt(t[iAnz], 10) || 0 };
                }).filter(function (x) { return x.name; });
                liste.sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
                _namen = liste.map(function (x) { return x.name; });
                return _namen;
            })
            .catch(function () { return []; });
    }

    function treffer(namen, q) {
        q = String(q || '').trim().toLowerCase();
        if (!q) return namen.slice(0, 40);
        var alle = namen.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; });
        var vorn = alle.filter(function (n) { return n.toLowerCase().indexOf(q) === 0; });
        return vorn.concat(alle.filter(function (n) { return n.toLowerCase().indexOf(q) !== 0; })).slice(0, 40);
    }

    /* ── Der Kopf-Knopf ──────────────────────────────────────────── */
    function knopfZeichnen() {
        var k = document.getElementById('meinDeckKnopf');
        if (!k) return;
        var n = lesen();
        var txt = k.querySelector('.mein-deck-name');
        if (txt) txt.textContent = n || (de() ? 'Mein Deck' : 'My deck');
        k.classList.toggle('is-leer', !n);
        var titel = n
            ? (de() ? 'Mein Deck: ' + n + ' — gilt für Meta Call, Journal und Deck-Analyse. Antippen zum Ändern.'
                    : 'My deck: ' + n + ' — used by Meta Call, journal and deck analysis. Tap to change.')
            : (de() ? 'Mein Deck wählen — gilt für Meta Call, Journal und Deck-Analyse.'
                    : 'Pick my deck — used by Meta Call, journal and deck analysis.');
        k.title = titel;
        k.setAttribute('aria-label', titel);
    }

    var _offen = null, _ausloeser = null;
    function schliessen() {
        if (!_offen) return;
        _offen.remove();
        _offen = null;
        document.removeEventListener('keydown', _taste, true);
        document.removeEventListener('click', _daneben, true);
        if (_ausloeser) { try { _ausloeser.focus(); } catch (_e) { /* egal */ } }
        var k = document.getElementById('meinDeckKnopf');
        if (k) k.setAttribute('aria-expanded', 'false');
    }
    function _taste(e) { if (e.key === 'Escape') { e.preventDefault(); schliessen(); } }
    function _daneben(e) {
        if (_offen && !_offen.contains(e.target) && !(e.target.closest && e.target.closest('#meinDeckKnopf'))) schliessen();
    }

    function oeffnen() {
        if (_offen) { schliessen(); return; }
        var k = document.getElementById('meinDeckKnopf');
        _ausloeser = k;
        var box = document.createElement('div');
        box.className = 'mein-deck-auswahl';
        box.id = 'meinDeckAuswahl';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', de() ? 'Mein Deck wählen' : 'Pick my deck');
        var feld = document.createElement('input');
        feld.type = 'search';
        feld.className = 'mein-deck-suche';
        feld.placeholder = de() ? 'Deck suchen …' : 'Search deck …';
        feld.setAttribute('aria-label', feld.placeholder);
        var liste = document.createElement('ul');
        liste.className = 'mein-deck-liste';
        liste.setAttribute('role', 'listbox');
        box.appendChild(feld);
        box.appendChild(liste);
        document.body.appendChild(box);
        // Unter dem Knopf, im Fenster gehalten (fixed: der Kopf bleibt stehen).
        if (k && k.getBoundingClientRect) {
            var r = k.getBoundingClientRect();
            var breite = Math.min(320, window.innerWidth - 16);
            box.style.top = Math.round(r.bottom + 6) + 'px';
            box.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - breite - 8))) + 'px';
            box.style.width = breite + 'px';
        }
        _offen = box;
        if (k) k.setAttribute('aria-expanded', 'true');

        function zeichnen(namen) {
            liste.innerHTML = '';
            var aktuell = lesen();
            var eintraege = [''].concat(treffer(namen, feld.value));
            eintraege.forEach(function (n) {
                var li = document.createElement('li');
                li.setAttribute('role', 'option');
                li.tabIndex = 0;
                li.className = 'mein-deck-option' + (n === aktuell ? ' is-aktiv' : '') + (n ? '' : ' is-keins');
                li.setAttribute('aria-selected', String(n === aktuell));
                li.textContent = n || (de() ? 'Kein Deck' : 'No deck');
                var waehle = function () { setzen(n, 'kopf'); schliessen(); };
                li.addEventListener('click', waehle);
                li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); waehle(); } });
                liste.appendChild(li);
            });
        }
        namenLaden().then(function (namen) {
            zeichnen(namen);
            feld.addEventListener('input', function () { zeichnen(namen); });
            feld.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { var erst = liste.querySelector('.mein-deck-option:not(.is-keins)'); if (erst) erst.click(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); var o = liste.querySelector('.mein-deck-option'); if (o) o.focus(); }
            });
        });
        setTimeout(function () { try { feld.focus(); } catch (_e) { /* egal */ } }, 0);
        document.addEventListener('keydown', _taste, true);
        setTimeout(function () { document.addEventListener('click', _daneben, true); }, 0);
    }

    window.MeinDeck = { KEY: KEY, lesen: lesen, setzen: setzen, oeffnen: oeffnen, schliessen: schliessen,
                        knopfZeichnen: knopfZeichnen, _treffer: treffer };

    function start() { knopfZeichnen(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    // Sprache gewechselt → Beschriftung neu
    document.addEventListener('languageChanged', knopfZeichnen);
    // Ein anderer Tab hat gewaehlt
    window.addEventListener('storage', function (e) { if (e.key === KEY) knopfZeichnen(); });
})();
