/**
 * Erst das Bild sehen, dann entscheiden.
 *
 * Der Wunsch stand seit dem Bau des Meta-Call-Exports so im Code:
 * "decide to share/download or just close. Matches the user flow: erst das
 * Bild selbst sehen, dann teilen". Dort war er umgesetzt. Die Tier-Liste
 * hatte ihn nie — ihr Knopf "Bild" schob die Datei sofort in den
 * Download-Ordner, ohne sie je zu zeigen.
 *
 * Am 19.08.2026 erneut gemeldet, fuer die Tier-Liste:
 *   "wenn man da auf Bild generieren drueckt, dann bekommt man 'n schoenes
 *    Bild. Warum zeigen wir das nicht direkt in der Seite an? … dann waer's
 *    vielleicht cool, wenn sich 'n Modal direkt mit dem Bild oeffnet."
 *
 * Statt die Vorschau ein zweites Mal zu bauen, ist sie hier heraus­geloest.
 * Zwei Umsetzungen desselben Fensters waeren genau das Muster, an dem diese
 * Seite schon oft genug haengengeblieben ist — zuletzt an zwei
 * tierTitles-Tabellen, die sich nicht einig waren.
 *
 * Markup und CSS sind unveraendert die des Meta-Call-Fensters, nur neutral
 * benannt (.ds-bildvorschau-*, css/components.css). Es sah dort schon
 * richtig aus; es noch einmal zu entwerfen haette es nur anders gemacht.
 */
(function () {
    'use strict';

    var ID = 'dsBildvorschau';

    function de() {
        try {
            if (typeof getLang === 'function') return getLang() === 'de';
        } catch (e) { /* getLang noch nicht da */ }
        return true;
    }
    function L(d, e) { return de() ? d : e; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function speichern(blob, dateiname) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = dateiname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /**
     * @param {HTMLCanvasElement} canvas  fertig gezeichnet
     * @param {{dateiname:string, titel?:string, text?:string, alt?:string}} opt
     * @returns {Promise<boolean>} erfuellt sich, sobald das Fenster zu ist
     */
    function zeige(canvas, opt) {
        var o = opt || {};
        var dateiname = o.dateiname || 'thedipidis.png';
        if (!canvas || typeof canvas.toDataURL !== 'function') return Promise.resolve(false);

        var alt = document.getElementById(ID);
        if (alt) alt.remove();

        var modal = document.createElement('div');
        modal.id = ID;
        modal.className = 'ds-bildvorschau-modal';
        // navigator.share kann Dateien nicht ueberall. Steht der Knopf da,
        // ohne zu funktionieren, ist das schlechter als kein Knopf.
        var kannTeilen = !!(navigator.share);
        modal.innerHTML =
            '<div class="ds-bildvorschau-backdrop"></div>' +
            '<div class="ds-bildvorschau-content" role="dialog" aria-modal="true" aria-label="' +
                esc(o.titel || L('Vorschau', 'Preview')) + '">' +
              '<div class="ds-bildvorschau-header">' +
                '<h3>' + esc(o.titel || L('Vorschau', 'Preview')) + '</h3>' +
                '<button type="button" class="ds-bildvorschau-close" aria-label="' +
                    esc(L('Schließen', 'Close')) + '">×</button>' +
              '</div>' +
              '<div class="ds-bildvorschau-body">' +
                '<img src="' + canvas.toDataURL('image/png') + '" class="ds-bildvorschau-img" alt="' +
                    esc(o.alt || o.titel || L('Vorschau', 'Preview')) + '">' +
              '</div>' +
              '<div class="ds-bildvorschau-actions">' +
                (kannTeilen ? '<button type="button" class="ds-bildvorschau-btn-share">📤 ' +
                    esc(L('Teilen', 'Share')) + '</button>' : '') +
                '<button type="button" class="ds-bildvorschau-btn-download">💾 ' +
                    esc(L('Speichern', 'Save')) + '</button>' +
                '<button type="button" class="ds-bildvorschau-btn-secondary">' +
                    esc(L('Schließen', 'Close')) + '</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(modal);

        return new Promise(function (fertig) {
            var vorher = document.activeElement;
            function zu() {
                document.removeEventListener('keydown', taste, true);
                modal.remove();
                // Fokus zurueck auf den Knopf, der das Fenster geoeffnet hat.
                // Ohne das steht er nach dem Schliessen am Seitenanfang.
                if (vorher && typeof vorher.focus === 'function') {
                    try { vorher.focus({ preventScroll: true }); } catch (e) { vorher.focus(); }
                }
                fertig(true);
            }
            function taste(ev) {
                if (ev.key === 'Escape') { ev.preventDefault(); zu(); }
            }
            document.addEventListener('keydown', taste, true);
            modal.querySelector('.ds-bildvorschau-backdrop').addEventListener('click', zu);
            modal.querySelector('.ds-bildvorschau-close').addEventListener('click', zu);
            modal.querySelector('.ds-bildvorschau-btn-secondary').addEventListener('click', zu);

            modal.querySelector('.ds-bildvorschau-btn-download').addEventListener('click', function () {
                canvas.toBlob(function (blob) {
                    if (blob) speichern(blob, dateiname);
                    zu();
                }, 'image/png');
            });

            var teilen = modal.querySelector('.ds-bildvorschau-btn-share');
            if (teilen) {
                teilen.addEventListener('click', function () {
                    canvas.toBlob(function (blob) {
                        if (!blob) { zu(); return; }
                        var datei = new File([blob], dateiname, { type: 'image/png' });
                        navigator.share({ files: [datei], title: o.titel || dateiname, text: o.text || '' })
                            .catch(function () {
                                // Abgebrochen oder nicht unterstuetzt: dann eben
                                // speichern, statt den Klick ins Leere laufen zu lassen.
                                speichern(blob, dateiname);
                            })
                            .then(zu, zu);
                    }, 'image/png');
                });
            }

            // Der Schliessen-Knopf bekommt den Fokus, damit Escape und Tab
            // sofort im Fenster greifen.
            var erster = modal.querySelector('.ds-bildvorschau-close');
            if (erster) { try { erster.focus({ preventScroll: true }); } catch (e) { erster.focus(); } }
        });
    }

    window.DsBildvorschau = { zeige: zeige };
}());
