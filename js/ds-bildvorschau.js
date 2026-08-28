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

    /* Auf iPhone und iPad speichert <a download> NICHT in die
     * Fotomediathek. Je nach Safari-Einstellung landet die Datei in
     * "Dateien", oeffnet sich in einem neuen Tab oder es passiert
     * sichtbar gar nichts. Gemeldet am 28.08.2026 mit Bildschirmfoto:
     * "wenn ich auf Speichern druecke, dann wird's nicht immer in der
     * Foto Mediathek gespeichert."
     *
     * Der einzige Weg vom Web in die Fotomediathek ist das Teilen-Blatt
     * des Systems: navigator.share mit einer Datei, dort dann "Bild
     * sichern". Auf dem Rechner waere ein Teilen-Blatt der Umweg — dort
     * bleibt der Download.
     *
     * iPadOS meldet sich seit Version 13 als "Macintosh"; die
     * Beruehrungspunkte verraten es trotzdem. */
    function istApfelTouch() {
        try {
            var ua = navigator.userAgent || '';
            if (/iPad|iPhone|iPod/.test(ua)) return true;
            return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
        } catch (e) { return false; }
    }

    function machDatei(blob, dateiname) {
        try {
            if (typeof File !== 'function') return null;
            return new File([blob], dateiname, { type: blob.type || 'image/png' });
        } catch (e) { return null; }
    }

    function kannDateiTeilen(datei) {
        try {
            return !!(datei && navigator.share && navigator.canShare
                && navigator.canShare({ files: [datei] }));
        } catch (e) { return false; }
    }

    function alsDownload(blob, dateiname) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = dateiname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /* Gibt zurueck, ob das Fenster danach zugehen soll. Beim Teilen-Blatt
     * bleibt es offen: bricht jemand ab, soll das Bild noch da sein. */
    function speichern(blob, dateiname) {
        if (istApfelTouch()) {
            var datei = machDatei(blob, dateiname);
            if (kannDateiTeilen(datei)) {
                return navigator.share({ files: [datei] })
                    .then(function () { return true; })
                    .catch(function (e) {
                        /* Abbruch ist kein Fehler — dann wollte man eben
                         * nicht. Alles andere faellt auf den Download
                         * zurueck, damit der Knopf nie ins Leere greift. */
                        if (e && e.name === 'AbortError') return false;
                        alsDownload(blob, dateiname);
                        return true;
                    });
            }
        }
        alsDownload(blob, dateiname);
        return Promise.resolve(true);
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

        /* Das PNG wird sofort gebaut, nicht erst beim Klick.
         *
         * navigator.share darf nur aus einer Nutzergeste heraus laufen.
         * canvas.toBlob ist asynchron — wer erst im Klick damit anfaengt,
         * ruft share() nach dem Ende der Geste auf, und Safari lehnt das
         * mit NotAllowedError ab. Das Fenster steht ohnehin Sekunden offen,
         * bevor jemand tippt; bis dahin liegt der Blob bereit. */
        var fertigerBlob = null;
        try {
            canvas.toBlob(function (b) { fertigerBlob = b; }, 'image/png');
        } catch (e) { /* dann eben erst beim Klick */ }

        function mitBlob(weiter) {
            if (fertigerBlob) { weiter(fertigerBlob); return; }
            canvas.toBlob(function (b) { fertigerBlob = b; weiter(b); }, 'image/png');
        }

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
                mitBlob(function (blob) {
                    if (!blob) { zu(); return; }
                    /* Bricht jemand das Teilen-Blatt ab, bleibt das Fenster
                     * offen — sonst waere das Bild weg, ohne dass es
                     * irgendwo gelandet ist. */
                    speichern(blob, dateiname).then(function (erledigt) {
                        if (erledigt) zu();
                    }, zu);
                });
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
                    mitBlob(function (blob) {
                        if (!blob) { zu(); return; }
                        var kannKopieren = !!(navigator.clipboard
                            && window.ClipboardItem
                            && typeof navigator.clipboard.write === 'function');
                        if (!kannKopieren) {
                            melde(L('Kopieren geht hier nicht — gespeichert.',
                                    'Copying is not available here — saved instead.'));
                            speichern(blob, dateiname).then(zu, zu);
                            return;
                        }
                        navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
                            .then(function () {
                                melde(L('Bild in der Zwischenablage.', 'Image copied to clipboard.'));
                            })
                            .catch(function () {
                                melde(L('Kopieren abgelehnt — gespeichert.',
                                        'Copy was refused — saved instead.'));
                                return speichern(blob, dateiname);
                            })
                            .then(zu, zu);
                    });
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
