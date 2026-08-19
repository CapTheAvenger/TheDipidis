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
        // Sichtbarkeit haengt an der POSITION, nicht an der Zeile: nach dem
        // Sortieren sollen wieder die ersten 25 zu sehen sein, nicht dieselben
        // 25 Decks wie vorher. Sonst sortiert man nach Win Rate und sieht
        // trotzdem die meistgespielten.
        var block = tab.closest('.cm-rangliste-block');
        var knopf = block && block.querySelector('.cm-rang-mehr-btn');
        var allesOffen = !knopf || knopf.getAttribute('aria-expanded') === 'true';
        var grenze = 25;
        zeilen.forEach(function (tr, n) {
            var rang = tr.querySelector('.ds-rank');
            if (rang) rang.textContent = String(n + 1);
            if (!allesOffen) {
                tr.classList.toggle('cm-rang-mehr', n >= grenze);
                if (n >= grenze) tr.setAttribute('hidden', '');
                else tr.removeAttribute('hidden');
            }
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

    /* Der Rest der Liste auf Knopfdruck.
     *
     * Die frueher eigenstaendige "Vollstaendige Tabelle" hiess so, weil sie
     * JEDEN Archetyp zeigte, auch den mit einem einzigen Antritt. Sie ist in
     * diese Tabelle aufgegangen — aber 138 Zeilen als Grundzustand waeren
     * dieselbe Seitenhoehe wie vorher, nur an einer anderen Stelle. Also 25
     * sichtbar, der Rest hinter einem Knopf, der sagt, wie viele es sind.
     *
     * Auch dieser Handler haengt am Document, aus demselben Grund wie die
     * Sortierung: app-tier-meta.js und app-meta-cards.js setzen innerHTML neu
     * und nehmen jeden Handler mit, der weiter unten haengt. */
    function mehrOderWeniger(btn) {
        var block = btn.closest('.cm-rangliste-block');
        if (!block) return;
        var zeilen = block.querySelectorAll('tbody tr.cm-rang-mehr');
        var zu = btn.getAttribute('aria-expanded') !== 'true';
        zeilen.forEach(function (tr) {
            if (zu) tr.removeAttribute('hidden');
            else tr.setAttribute('hidden', '');
        });
        btn.setAttribute('aria-expanded', String(zu));
        var txt = zu ? btn.getAttribute('data-weniger-text') : btn.getAttribute('data-mehr-text');
        if (txt) btn.textContent = txt;
        // Beim Zuklappen zurueck an den Anfang der Tabelle, sonst steht man
        // im Nichts, wo eben noch hundert Zeilen waren.
        if (!zu) {
            var r = block.getBoundingClientRect();
            if (r.top < 0) window.scrollTo({ top: (window.pageYOffset || 0) + r.top - 16, behavior: 'auto' });
        }
    }

    document.addEventListener('click', function (ev) {
        if (ev.target && ev.target.closest) {
            var mehr = ev.target.closest('.cm-rang-mehr-btn');
            if (mehr) { mehrOderWeniger(mehr); return; }
        }
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
