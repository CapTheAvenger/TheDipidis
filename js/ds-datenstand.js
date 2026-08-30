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
            .then(function (j) {
                return { dateien: (j && j.dateien) || {},
                         inhalt: (j && j.inhalt_bis) || {},
                         leer: (j && j.leer) || [] };
            })
            .catch(function () { return { dateien: {}, inhalt: {}, leer: [] }; });
        return MANIFEST;
    }

    /**
     * Wie weit reicht der INHALT dieser Datei? ISO-Tag oder null.
     *
     * GEMESSEN am 29.08.2026: labs_tournament_decks.csv wurde am 25.08.
     * neu geschrieben, das juengste Turnier darin ist vom 12.06. — 74 Tage
     * Abstand. Der Betreiber hat bestaetigt: seitdem war Sommerpause, die
     * Daten stimmen also.
     *
     * EHRLICH DAZU: heute zeigt KEIN Chip diese Datei an (die fuenf
     * data-quelle-Angaben in index.html nennen andere Dateien), und der
     * Meta Call nennt das Turnieralter bereits selbst richtig
     * ("Juengstes Turnier: … — vor N Tagen"). Es war also kein sichtbarer
     * Fehler. Es war eine offene Flanke: zeigt irgendwann ein Chip auf
     * eine Datei, deren Inhalt hinter ihrem Schreibdatum zurueckliegt,
     * stuende dort dasselbe falsche Versprechen wie damals beim Datum des
     * BESUCHS — nur eine Ebene tiefer. Diese Ebene wird hier geschlossen,
     * bevor sie jemand aufmacht.
     *
     * Deshalb: wo der Inhalt ein eigenes Datum hat und es SPUERBAR
     * zurueckliegt, nennt der Chip den Inhalt. Die Dateiaenderung bleibt
     * im Tooltip — beides ist wahr, aber die Frage "wie aktuell sind
     * diese Zahlen" beantwortet der Inhalt.
     */
    function inhaltStand(datei) {
        return manifest().then(function (m) {
            var iso = m.inhalt && m.inhalt[datei];
            if (!iso) return null;
            var d = new Date(iso + 'T00:00:00Z');
            return isNaN(d.getTime()) ? null : d;
        });
    }

    /* Ab wann gilt der Abstand als spuerbar? Eine Woche. Darunter ist der
       Unterschied zwischen "Datei" und "Inhalt" Rauschen und wuerde den
       Chip nur unruhig machen. */
    var ABSTAND_TAGE = 7;

    /**
     * Stand einer Datendatei als Date, oder null.
     *
     * Kein Ersatzwert. Fehlt der Eintrag, ist der Stand unbekannt, und
     * das sagt der Chip dann auch. Ein geratenes Datum ist schlimmer als
     * gar keins, weil man ihm nicht ansieht, dass es geraten ist.
     */
    function stand(datei) {
        return manifest().then(function (m) {
            var iso = m.dateien[datei];
            if (!iso) return null;
            var d = new Date(iso);
            return isNaN(d.getTime()) ? null : d;
        });
    }

    /* Hat die Datei ueberhaupt Zeilen?
     *
     * BEFUND (Schlussabnahme 30.08.2026): der Chip der City League zeigte
     * "Daten: 31.7.2026" — den Schreibzeitpunkt von
     * city_league_analysis.csv. Diese Datei hat 0 Datenzeilen; die
     * gezeigten Zahlen stammen aus einer anderen Datei vom 6. Juni.
     * Daneben stand "Verfuegbar: 6.6.2026". Zwei Daten, acht Wochen
     * auseinander, und das aeltere war das richtige.
     *
     * Ein Datum an einer leeren Datei ist kein Stand, sondern der
     * Zeitpunkt, an dem zuletzt nichts hineingeschrieben wurde. Das ist
     * dieselbe Sorte Halbwahrheit wie das Datum des BESUCHS, gegen das
     * dieses Modul ueberhaupt gebaut wurde. */
    function istLeer(datei) {
        return manifest().then(function (m) {
            return (m.leer || []).indexOf(datei) !== -1;
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
            Promise.all([stand(datei), inhaltStand(datei), istLeer(datei)]).then(function (paar) {
                var dDatei = paar[0];
                var dInhalt = paar[1];
                var leer = paar[2];

                if (leer) {
                    el.textContent = de() ? 'keine Daten' : 'no data';
                    var e0 = el.closest ? el.closest('.data-freshness-chip') : null;
                    if (e0) {
                        e0.classList.add('is-unbekannt');
                        e0.classList.remove('is-alt');
                        e0.setAttribute('title', de()
                            ? datei + ' enthaelt zurzeit keine Datenzeilen. Das Datum '
                              + 'daran waere der Zeitpunkt, an dem zuletzt nichts '
                              + 'hineingeschrieben wurde — die angezeigten Zahlen '
                              + 'stammen aus einer anderen Quelle.'
                            : datei + ' currently holds no data rows. A date on it would '
                              + 'be the moment nothing was last written to it — the '
                              + 'numbers shown come from another source.');
                    }
                    return;
                }

                /* Der Inhalt gewinnt, wenn er spuerbar aelter ist als die
                   Datei. Sonst bleibt es beim Dateidatum — dann sagen beide
                   dasselbe und eine zweite Zahl waere nur Laerm. */
                var abstand = (dDatei && dInhalt)
                    ? (dDatei.getTime() - dInhalt.getTime()) / 86400000 : 0;
                var zeigeInhalt = dInhalt && abstand > ABSTAND_TAGE;
                var d = zeigeInhalt ? dInhalt : dDatei;

                el.textContent = alsText(d);
                var tage = alterTage(d);
                var eltern = el.closest ? el.closest('.data-freshness-chip') : null;
                if (eltern) {
                    eltern.classList.toggle('is-alt', tage !== null && tage > 14);
                    eltern.classList.toggle('is-unbekannt', d === null);
                    var titel;
                    if (!d) {
                        titel = de() ? 'Fuer ' + datei + ' ist kein Stand hinterlegt'
                                     : 'no recorded date for ' + datei;
                    } else if (zeigeInhalt) {
                        /* Beides nennen: der Inhalt beantwortet "wie aktuell
                           sind die Zahlen", die Dateiaenderung beantwortet
                           "wann wurde zuletzt nachgesehen". */
                        titel = de()
                            ? 'Juengster Eintrag in ' + datei + ': ' + alsText(dInhalt)
                              + ' — vor ' + Math.floor(tage) + ' Tagen.'
                              + ' Zuletzt nachgesehen am ' + alsText(dDatei) + '.'
                            : 'newest entry in ' + datei + ': ' + alsText(dInhalt)
                              + ' — ' + Math.floor(tage) + ' days ago.'
                              + ' Last checked ' + alsText(dDatei) + '.';
                    } else {
                        titel = de()
                            ? 'Letzte Aenderung von ' + datei
                              + (tage !== null ? ' — vor ' + Math.floor(tage) + ' Tagen' : '')
                            : 'last change to ' + datei
                              + (tage !== null ? ' — ' + Math.floor(tage) + ' days ago' : '');
                    }
                    eltern.setAttribute('title', titel);
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
