/**
 * Wann wurden diese Daten erhoben? Bisher: geraten.
 *
 * GEMESSEN am 20.08.2026: jeder Frische-Chip der Seite ("Daten: 20.8.2026")
 * zeigte den Tag des BESUCHS. Der Wert kam aus
 *
 *     localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString()
 *
 * und der linke Teil ist immer leer: 'lastScraperUpdate' wird nirgends im
 * Repo geschrieben — kein Scraper, kein Workflow, keine Zeile JavaScript.
 * Es lief also immer der Ersatzwert. Fuenf Reiter, deren Daten bis zu
 * 19 Tage auseinanderliegen, trugen dasselbe Datum, und das war deins.
 *
 * Fuer einen Head Judge ist das der teuerste Mangel der ganzen Seite: ohne
 * Erhebungsdatum ist jede Zahl darunter als Beleg wertlos, egal wie sauber
 * sie gerechnet ist.
 *
 * DER NAHELIEGENDE WEG TRAEGT NICHT. `Last-Modified` waere gratis zu
 * haben — GEMESSEN am 20.08.2026 gegen thedipidis.app liefert GitHub
 * Pages dort aber die DEPLOY-Zeit, fuer alle Dateien dieselbe:
 *
 *     all_cards_database.csv         Thu, 20 Aug 2026 07:34:39 GMT
 *     limitless_online_decks.csv     Thu, 20 Aug 2026 07:34:38 GMT
 *     city_league_archetypes.csv     KEIN Last-Modified
 *
 * Das haette das geratene Datum nur durch ein anderes ersetzt, das
 * genauso falsch ist und glaubwuerdiger aussieht.
 *
 * Der Stand steht an genau einer verlaesslichen Stelle: im Git-Verlauf.
 * scripts/build_data_stand.py liest ihn dort ab und legt ihn im Deploy
 * als data/data_stand.json neben die Daten. Dieses Modul liest nur noch
 * diese eine Datei.
 *
 * ZWEI REGELN, DIE HIER WICHTIGER SIND ALS DIE BEQUEMLICHKEIT:
 *
 *   1. Jeder Chip nennt den Stand SEINER Ansicht, nicht einen globalen.
 *      Der japanische Datenraum und das globale Meta werden von
 *      verschiedenen Laeufen befuellt und duerfen nicht so tun, als waeren
 *      sie gleich alt.
 *   2. Ist der Stand unbekannt, steht "unbekannt" da — nicht das heutige
 *      Datum. Ein geratenes Datum ist schlimmer als gar keins, weil man
 *      ihm ansieht, dass es eins ist.
 */
(function () {
    'use strict';

    var MANIFEST = null;     /* Promise<{datei: ISO}> */

    function basis() {
        return (typeof window.BASE_PATH === 'string') ? window.BASE_PATH : 'data/';
    }

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    /** Das Verzeichnis der Staende, einmal geladen. */
    function manifest() {
        if (MANIFEST) return MANIFEST;
        MANIFEST = fetch(basis() + 'data_stand.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r && r.ok ? r.json() : null; })
            .then(function (j) { return (j && j.dateien) || {}; })
            .catch(function () { return {}; });
        return MANIFEST;
    }

    /**
     * Stand einer Datendatei als Date, oder null.
     *
     * Kein Ersatzwert. Fehlt der Eintrag, ist der Stand unbekannt, und
     * das sagt der Chip dann auch. Ein geratenes Datum ist schlimmer als
     * gar keins, weil man ihm nicht ansieht, dass es geraten ist.
     */
    function stand(datei) {
        return manifest().then(function (m) {
            var iso = m[datei];
            if (!iso) return null;
            var d = new Date(iso);
            return isNaN(d.getTime()) ? null : d;
        });
    }

    function alsText(d) {
        if (!d) return de() ? 'unbekannt' : 'unknown';
        return d.toLocaleDateString(de() ? 'de-DE' : 'en-GB');
    }

    /** Wie alt ist der Stand in Tagen? null, wenn unbekannt. */
    function alterTage(d) {
        if (!d) return null;
        return (Date.now() - d.getTime()) / 86400000;
    }

    /**
     * Fuellt alle Chips. Jeder Chip nennt seine Quelle selbst ueber
     * data-quelle; ohne Angabe bleibt "unbekannt" stehen, statt dass ein
     * fremdes Datum einspringt.
     */
    function zeichne(wurzel) {
        var host = wurzel || document;
        var chips = host.querySelectorAll ? host.querySelectorAll('.js-data-freshness') : [];
        Array.prototype.forEach.call(chips, function (el) {
            var datei = el.getAttribute('data-quelle');
            if (!datei) { el.textContent = alsText(null); return; }
            stand(datei).then(function (d) {
                el.textContent = alsText(d);
                var tage = alterTage(d);
                var eltern = el.closest ? el.closest('.data-freshness-chip') : null;
                if (eltern) {
                    eltern.classList.toggle('is-alt', tage !== null && tage > 14);
                    eltern.classList.toggle('is-unbekannt', d === null);
                    eltern.setAttribute('title', d
                        ? (de()
                            ? 'Letzte Aenderung von ' + datei
                              + (tage !== null ? ' — vor ' + Math.floor(tage) + ' Tagen' : '')
                            : 'last change to ' + datei
                              + (tage !== null ? ' — ' + Math.floor(tage) + ' days ago' : ''))
                        : (de() ? 'Fuer ' + datei + ' ist kein Stand hinterlegt'
                                : 'no recorded date for ' + datei));
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { zeichne(); });
    } else {
        zeichne();
    }
    document.addEventListener('languageChanged', function () { zeichne(); });

    window.DsDatenstand = {
        stand: stand,
        alsText: alsText,
        alterTage: alterTage,
        zeichne: zeichne,
    };
}());
