/* neu-hier.js — das „Neu hier?"-Band auf der Startseite (UI-113, 05.10.2026)
 * Befund (Agent 1, 10-Sekunden-Test): die Startseite begann mit Daten, ohne
 * einen Satz, was die Seite ist. Das Band zeigt sich, bis es weggeklickt
 * wird; gemerkt wird das nur im Browser (`neu_hier_weg_v1`).
 */
(function () {
    'use strict';
    var KEY = 'neu_hier_weg_v1';
    function istWeg() {
        try { return localStorage.getItem(KEY) === '1'; } catch (_e) { return false; }
    }
    function zeigen() {
        var b = document.getElementById('neuHierBand');
        if (b) b.classList.toggle('d-none', istWeg());
    }
    function weg() {
        try { localStorage.setItem(KEY, '1'); } catch (_e) { /* privater Modus: nur bis zum Neuladen */ }
        zeigen();
    }
    window.NeuHier = { weg: weg, zeigen: zeigen, istWeg: istWeg, KEY: KEY };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zeigen);
    else zeigen();
})();
