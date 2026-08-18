/* ds-tutorial.js — die Anleitung nachladen statt mitliefern.
 *
 * Vorher: 543.271 Zeichen Anleitung standen inline in index.html, beide
 * Sprachfassungen gleichzeitig. Das waren 64,8 % des Dokuments —
 * jeder Besucher hat sie geladen, der Parser hat sie gebaut, das Layout
 * hat sie vermessen, und die Haelfte davon war per
 * `display:none !important` ohnehin unsichtbar. Auf Mobil ergab das
 * 61.367 px Inhalt in einem Tab, den die meisten nie oeffnen.
 *
 * Jetzt: index.html traegt eine Huelle, und diese Datei holt genau eine
 * Fassung — beim ersten Oeffnen des Tabs, und noch einmal, wenn jemand
 * die Sprache wechselt.
 *
 * Drei Dinge, die dabei leicht danebengehen und deshalb hier stehen:
 *
 *   1. Der Tab kann ueber vier Wege aufgehen — Pokéball, Hilfe-Knopf,
 *      Hauptnavigation und der Tiefenlink #tutorial / #anleitung aus
 *      js/inline-init.js. Deshalb haengt der Ausloeser an switchTab und
 *      nicht an einem Knopf.
 *   2. Die Bild-Platzhalter im Tutorial werden von einer Sonde befuellt,
 *      die frueher einmalig beim Seitenstart lief (js/app-init.js). Zu
 *      dem Zeitpunkt gibt es die Slots jetzt noch nicht — die Sonde ist
 *      deshalb ein eigener Aufruf geworden und laeuft nach dem Einhaengen.
 *   3. Ein Fehlschlag darf nicht in einem leeren Kasten enden. Es gibt
 *      einen benannten Fehlerzustand mit Wiederholen-Knopf und einem
 *      direkten Link auf die Datei — die ist auch roh lesbar.
 */
(function () {
    'use strict';

    var HOST_ID = 'tutorialHost';
    var cache = {};          /* sprache -> HTML-Text */
    var pending = {};        /* sprache -> Promise */
    var shown = null;        /* welche Sprache haengt gerade drin */

    var TXT = {
        de: {
            loading: 'Anleitung wird geladen …',
            failed:  'Die Anleitung liess sich nicht laden.',
            retry:   'Erneut versuchen',
            direct:  'Direkt oeffnen'
        },
        en: {
            loading: 'Loading the guide …',
            failed:  'The guide could not be loaded.',
            retry:   'Try again',
            direct:  'Open directly'
        }
    };

    function lang() {
        try {
            return (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'de';
        } catch (e) { return 'de'; }
    }
    function T(key) { return (TXT[lang()] || TXT.de)[key]; }

    function url(lg) {
        /* Das ?v= stempelt deploy-pages.yml beim Deploy um — dieselbe
         * Regel wie fuer jedes andere Asset. Ohne den Stempel serviert
         * der Service Worker nach einer Textaenderung die alte Fassung. */
        return 'tutorial/tutorial.' + lg + '.html?v=0';
    }

    function host() { return document.getElementById(HOST_ID); }

    function setStatus(html) {
        var h = host();
        if (h) h.innerHTML = html;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function fetchLang(lg) {
        if (cache[lg]) return Promise.resolve(cache[lg]);
        if (pending[lg]) return pending[lg];
        pending[lg] = fetch(url(lg), { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (txt) {
                cache[lg] = txt;
                delete pending[lg];
                return txt;
            })
            .catch(function (err) {
                delete pending[lg];
                throw err;
            });
        return pending[lg];
    }

    function render(lg) {
        var h = host();
        if (!h) return Promise.resolve(false);
        if (shown === lg && h.dataset.state === 'ready') return Promise.resolve(true);

        h.dataset.state = 'loading';
        setStatus('<p class="ds-tutorial-status">' + esc(T('loading')) + '</p>');

        return fetchLang(lg).then(function (txt) {
            /* Zwischenzeitlicher Sprachwechsel: das Ergebnis eines
             * ueberholten Abrufs darf die neuere Fassung nicht
             * ueberschreiben. */
            if (lang() !== lg) return false;
            h.innerHTML = txt;
            h.dataset.state = 'ready';
            shown = lg;
            hydrateImages(h);
            return true;
        }).catch(function (err) {
            console.warn('[DsTutorial] ' + lg + ' konnte nicht geladen werden:', err && err.message);
            h.dataset.state = 'failed';
            setStatus(
                '<div class="ds-tutorial-error">' +
                '<p>' + esc(T('failed')) + '</p>' +
                '<p><button type="button" class="ds-tutorial-retry">' + esc(T('retry')) + '</button> ' +
                '<a href="' + esc(url(lg)) + '">' + esc(T('direct')) + '</a></p>' +
                '</div>'
            );
            return false;
        });
    }

    /* Bild-Sonde. Lag bis zum 18.08.2026 in js/app-init.js und lief
     * einmalig beim Seitenstart ueber .tutorial-screenshot-frame; seit
     * das Tutorial nachgeladen wird, gibt es zu dem Zeitpunkt keinen
     * einzigen Slot. Als benannte Funktion auf window, damit der alte
     * Aufrufer sie weiter benutzen kann. */
    function hydrateImages(root) {
        var scope = root || document;
        scope.querySelectorAll('.tutorial-screenshot-frame[data-tutorial-img]').forEach(function (slot) {
            var src = slot.getAttribute('data-tutorial-img');
            if (!src || slot.classList.contains('tutorial-screenshot-frame-loaded')) return;
            var probe = new Image();
            probe.onload = function () {
                slot.style.backgroundImage = 'url("' + src + '")';
                slot.classList.add('tutorial-screenshot-frame-loaded');
            };
            /* onerror bleibt leer: der Verlauf mit Beschriftung ist der
             * Rueckfall, ein kaputtes Bildsymbol waere schlechter. */
            probe.src = src;
        });
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.ds-tutorial-retry');
        if (!btn) return;
        e.preventDefault();
        shown = null;
        render(lang());
    });

    /* switchTab wird umschlossen statt in app-core.js angefasst —
     * dieselbe Technik wie in js/ds-nav.js, aus demselben Grund. */
    function wire() {
        var orig = window.switchTab;
        if (typeof orig !== 'function' || orig.__dsTutWrapped) return;
        var wrapped = function (tabName) {
            var r = orig.apply(this, arguments);
            if (tabName === 'tutorial') {
                try { render(lang()); } catch (err) { /* die Navigation bleibt heil */ }
            }
            return r;
        };
        wrapped.__dsTutWrapped = true;
        window.switchTab = wrapped;
    }

    function boot() {
        wire();
        window.addEventListener('languageChanged', onLang);
        document.addEventListener('languageChanged', onLang);
        /* Direkteinstieg per #tutorial: der Tab ist beim Booten schon aktiv. */
        var active = document.querySelector('.tab-content.active');
        if (active && active.id === 'tutorial') render(lang());
    }

    function onLang() {
        var h = host();
        if (!h || h.dataset.state === 'idle') return;   /* nie geoeffnet, nichts zu tun */
        shown = null;
        render(lang());
    }

    window.DsTutorial = {
        show: function () { return render(lang()); },
        hydrateImages: hydrateImages,
        /* Fuer Tests und fuer alles, was wissen will, ob schon geladen wurde. */
        state: function () {
            var h = host();
            return { shown: shown, state: h ? h.dataset.state : null, cached: Object.keys(cache) };
        }
    };
    window.hydrateTutorialImages = hydrateImages;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
