/**
 * Eine Tabelle, die man sortieren kann.
 *
 * Vorher standen in der Meta-Ansicht drei Auswertungen mit denselben Decks:
 * "Wie oft gespielt", "Wie oft Top-8 erreicht" und "Top 8 gegen Erwartung" —
 * dieselben Spalten in anderer Reihenfolge, ueber drei Bildschirmhoehen.
 * Jetzt ist es eine Tabelle, und statt drei vorgegebener Reihenfolgen waehlt
 * man selbst.
 *
 * Der Handler haengt am DOCUMENT, nicht an der Tabelle.
 *
 * Das ist kein Stilfrage, sondern die Lehre aus dem Fehler vom selben Tag:
 * js/app-tier-meta.js:1041 macht `content.innerHTML = html + content.innerHTML`
 * und js/app-meta-cards.js:1406 `currentMetaContent.innerHTML = ...`. Beide
 * lesen vorhandenen Inhalt als Text zurueck und setzen ihn neu — das Markup
 * ueberlebt, jeder daran haengende Handler nicht. Genau daran waren die
 * Abschnittskoepfe gestorben ("wenn ich das aufklappen will, passiert nix").
 * Am Document kann das nicht passieren.
 *
 * Sortiert wird ueber die Werte, die in den Zellen STEHEN, nicht ueber eine
 * zweite Datenhaltung: eine Tabelle und ein Datenmodell, die auseinanderlaufen
 * koennen, sind in diesem Projekt schon oft genug schiefgegangen. Die Zahlen
 * werden dafuer aus dem Text zurueckgelesen — deutsche Schreibweise mit
 * Punkt als Tausender- und Komma als Dezimaltrenner inklusive.
 */
(function () {
    'use strict';

    var AUF = 'auf', AB = 'ab';

    /** "1.234,5 %" -> 1234.5 · "0,8-mal" -> 0.8 · "–" -> null */
    function zahl(text) {
        if (text == null) return null;
        var t = String(text).replace(/ /g, ' ').trim();
        if (!t || t === '–' || t === '-') return null;
        // Nur Ziffern, Trennzeichen und Vorzeichen behalten.
        t = t.replace(/[^\d.,+-]/g, '');
        if (!t) return null;
        // Deutsche Schreibweise: Punkt ist Tausender, Komma ist Dezimal.
        if (t.indexOf(',') > -1) t = t.replace(/\./g, '').replace(',', '.');
        var v = parseFloat(t);
        return isNaN(v) ? null : v;
    }

    function spaltenIndex(tab, schluessel) {
        var kopf = tab.querySelectorAll('thead th');
        for (var i = 0; i < kopf.length; i++) {
            if (kopf[i].getAttribute('data-rang-spalte') === schluessel) return i;
        }
        return -1;
    }

    function sortiere(tab, schluessel) {
        var i = spaltenIndex(tab, schluessel);
        if (i < 0) return;
        var bisher = tab.getAttribute('data-rang-sortiert');
        var richtung;
        if (bisher === schluessel) {
            richtung = tab.getAttribute('data-rang-richtung') === AB ? AUF : AB;
        } else {
            // Neue Spalte: Zahlen fangen gross an, Text fängt bei A an.
            var probe = tab.querySelector('tbody tr td:nth-child(' + (i + 1) + ')');
            richtung = (probe && zahl(probe.textContent) !== null) ? AB : AUF;
        }

        var koerper = tab.tBodies[0];
        if (!koerper) return;
        var zeilen = Array.prototype.slice.call(koerper.rows);
        zeilen.sort(function (a, b) {
            var za = a.cells[i], zb = b.cells[i];
            var ta = za ? za.textContent : '', tb = zb ? zb.textContent : '';
            var na = zahl(ta), nb = zahl(tb);
            var v;
            if (na === null && nb === null) {
                v = String(ta).localeCompare(String(tb), 'de');
            } else if (na === null) {
                return 1;              // Leerwerte immer ans Ende, egal wie herum
            } else if (nb === null) {
                return -1;
            } else {
                v = na - nb;
            }
            return richtung === AB ? -v : v;
        });

        // Rangspalte neu durchzaehlen: sie nummeriert die ANZEIGE, nicht das
        // Deck. Bliebe sie stehen, saehe die sortierte Tabelle aus wie eine
        // kaputte Rangliste (3, 17, 5, ...).
        zeilen.forEach(function (tr, n) {
            var rang = tr.querySelector('.ds-rank');
            if (rang) rang.textContent = String(n + 1);
            koerper.appendChild(tr);
        });

        tab.setAttribute('data-rang-sortiert', schluessel);
        tab.setAttribute('data-rang-richtung', richtung);
        tab.querySelectorAll('thead th[data-rang-spalte]').forEach(function (th) {
            var ist = th.getAttribute('data-rang-spalte') === schluessel;
            th.setAttribute('aria-sort', ist ? (richtung === AB ? 'descending' : 'ascending') : 'none');
        });
    }

    function ausloeser(ziel) {
        if (!ziel || !ziel.closest) return null;
        var th = ziel.closest('th[data-rang-spalte]');
        if (!th) return null;
        var tab = th.closest('table.cm-rangliste');
        return tab ? { tab: tab, schluessel: th.getAttribute('data-rang-spalte') } : null;
    }

    document.addEventListener('click', function (ev) {
        var a = ausloeser(ev.target);
        if (a) sortiere(a.tab, a.schluessel);
    });

    // Mit der Tastatur bedienbar: die Kopfzellen tragen tabindex und role.
    document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
        var a = ausloeser(ev.target);
        if (!a) return;
        ev.preventDefault();
        sortiere(a.tab, a.schluessel);
    });

    window.DsRangliste = { sortiere: sortiere, zahl: zahl };
}());
