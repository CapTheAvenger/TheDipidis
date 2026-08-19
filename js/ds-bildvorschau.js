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

    /* Kurze Rueckmeldung. showToast gehoert der Seite; fehlt es, sagt die
       Konsole Bescheid, statt dass gar nichts passiert. */
    function melde(text) {
        if (typeof window.showToast === 'function') window.showToast(text, 'success', 2500);
        else console.info('[Bildvorschau]', text);
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
        // Der Knopf heisst jetzt "Kopieren" und tut auch genau das. Ob er
        // erscheint, haengt nicht mehr an navigator.share — er faellt zur Not
        // auf Speichern zurueck und sagt das auch.
        var kannTeilen = true;
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
                (kannTeilen ? '<button type="button" class="ds-bildvorschau-btn-kopieren">📋 ' +
                    esc(L('Kopieren', 'Copy')) + '</button>' : '') +
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

            var teilen = modal.querySelector('.ds-bildvorschau-btn-kopieren');
            if (teilen) {
                teilen.addEventListener('click', function () {
                    /* Kopieren statt Teilen-Menue.
                     *
                     * Gemeldet am 19.08.2026: "cool waer, wenn ich auf Teilen
                     * druecke, dass dann nicht 'n extra Menue aufgeht, sondern
                     * dass es automatisch in die Zwischenablage kopiert wird und
                     * ich dann irgendwo anders hingehen kann — beim Speichern
                     * wird's ja schon in die Fotomediathek gespeichert."
                     *
                     * Genau so: der eine Knopf legt das Bild in die
                     * Zwischenablage, der andere auf die Platte. Das
                     * System-Teilen-Menue war ein dritter Weg, der beides
                     * konnte und keins davon direkt.
                     *
                     * navigator.clipboard.write mit ClipboardItem kann nicht
                     * jeder Browser und braucht einen sicheren Kontext. Wo es
                     * nicht geht, wird gespeichert — ein Knopf, der nichts tut,
                     * waere schlechter. */
                    canvas.toBlob(function (blob) {
                        if (!blob) { zu(); return; }
                        var kannKopieren = !!(navigator.clipboard
                            && window.ClipboardItem
                            && typeof navigator.clipboard.write === 'function');
                        if (!kannKopieren) {
                            speichern(blob, dateiname);
                            melde(L('Kopieren geht hier nicht — gespeichert.',
                                    'Copying is not available here — saved instead.'));
                            zu();
                            return;
                        }
                        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
                            .then(function () {
                                melde(L('Bild in der Zwischenablage.', 'Image copied to clipboard.'));
                            })
                            .catch(function () {
                                speichern(blob, dateiname);
                                melde(L('Kopieren abgelehnt — gespeichert.',
                                        'Copy was refused — saved instead.'));
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
