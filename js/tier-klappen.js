/* V2-16 (07.10.2026, Hausi): „Es wäre übrigens gut, wenn man die Tierlisten
 * einklappen könnte“ — Entscheidung: alle offen, ein Tipp auf die
 * Überschrift klappt zu (UI-13 „alle Abschnitte immer offen“ bleibt der
 * Startzustand).
 *
 * Der Handler haengt am DOCUMENT: die Tier-Liste wird per innerHTML neu
 * gezeichnet, ein Handler am Element wuerde das nicht ueberleben (siehe
 * js/rangliste-sortieren.js). */
(function () {
    'use strict';
    function kopf(ziel) {
        if (!ziel || !ziel.closest) return null;
        var h = ziel.closest('#current-meta .tier-section > h3');
        return h || null;
    }
    function umschalten(h) {
        var sek = h.parentElement;
        if (!sek) return;
        var zu = sek.classList.toggle('tier-zu');
        h.setAttribute('aria-expanded', zu ? 'false' : 'true');
    }
    function vorbereiten(wurzel) {
        (wurzel || document).querySelectorAll('#current-meta .tier-section > h3:not([data-klapp])').forEach(function (h) {
            h.setAttribute('data-klapp', '');
            h.setAttribute('role', 'button');
            h.setAttribute('tabindex', '0');
            h.setAttribute('aria-expanded', h.parentElement && h.parentElement.classList.contains('tier-zu') ? 'false' : 'true');
            h.classList.add('tier-klapp-kopf');
        });
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
            var h = kopf(e.target);
            if (h) { vorbereiten(); umschalten(h); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var h = kopf(e.target);
            if (h) { e.preventDefault(); umschalten(h); }
        });
        var mo = new MutationObserver(function () { vorbereiten(); });
        var start = function () {
            var w = document.getElementById('current-meta');
            if (w) { vorbereiten(w); mo.observe(w, { childList: true, subtree: true }); }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    }
    if (typeof window !== 'undefined') window._tierKlappen = { umschalten: umschalten, vorbereiten: vorbereiten };
})();
