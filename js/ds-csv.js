/**
 * CSV-Export der Tabellen (UI-8 (7), 26.09.2026).
 *
 * Aus der 6-Perspektiven-Validierung vom 07.08.2026: wer mit den Zahlen
 * weiterrechnen will, musste sie abschreiben. Jede Datentabelle einer
 * Ansicht bekommt deshalb einen kleinen Knopf „CSV", der GENAU das
 * exportiert, was in der Tabelle steht — keine zweite Rechnung, kein
 * eigener Datenweg (siehe WZ-4: kein weiterer unabhaengiger
 * CSV-Konsument). Die Rohdateien selbst verlinkt der Datenstands-Chip
 * (js/ds-datenstand.js, „Rohdaten").
 *
 * Tabellen entstehen hier fast alle erst im Skript. Statt zwanzig
 * Zeichner anzufassen, sieht ein MutationObserver nach, ob eine neue
 * Tabelle dasteht, und haengt den Knopf EINMAL davor. Ausgenommen:
 * Tabellen mit weniger als zwei Datenzeilen und die Abbildungen im
 * Tutorial (das sind Bilder einer Oberflaeche, keine Daten).
 *
 * Trennzeichen `;` und UTF-8 mit BOM: so oeffnet Excel eine deutsche
 * Zahl mit Komma ohne Umweg als Zahl.
 */
(function () {
    'use strict';

    function de() {
        return !(typeof window.getLang === 'function' && window.getLang() === 'en');
    }

    function zelle(text) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function alsCsv(tabelle) {
        var zeilen = [];
        Array.prototype.forEach.call(tabelle.rows || [], function (tr) {
            var z = [];
            Array.prototype.forEach.call(tr.cells || [], function (c) {
                z.push(zelle(c.innerText != null ? c.innerText : c.textContent));
            });
            if (z.some(function (x) { return x !== ''; })) zeilen.push(z.join(';'));
        });
        return zeilen.join('\r\n');
    }

    function dateiname(tabelle) {
        var ansicht = (tabelle.closest && tabelle.closest('.tab-content')) || null;
        var teil = (ansicht && ansicht.id) || 'tabelle';
        var alle = ansicht ? ansicht.querySelectorAll('table') : [];
        var nr = Array.prototype.indexOf.call(alle, tabelle) + 1;
        var heute = new Date().toISOString().slice(0, 10);
        return 'thedipidis-' + teil + (nr > 0 ? '-' + nr : '') + '-' + heute + '.csv';
    }

    function herunterladen(tabelle) {
        var blob = new Blob(['﻿' + alsCsv(tabelle)], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = dateiname(tabelle);
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
    }

    function datenzeilen(tabelle) {
        var n = 0;
        Array.prototype.forEach.call(tabelle.rows || [], function (tr) {
            if (tr.querySelector('td')) n++;
        });
        return n;
    }

    function geeignet(tabelle) {
        if (tabelle.getAttribute('data-csv') === 'nein') return false;
        if (!tabelle.closest || !tabelle.closest('.tab-content')) return false;
        if (tabelle.closest('#tutorial, .tutorial-mockup')) return false;
        return datenzeilen(tabelle) >= 2;
    }

    function knopfDavor(tabelle) {
        if (tabelle.__dsCsv) return;
        tabelle.__dsCsv = true;
        var leiste = document.createElement('div');
        leiste.className = 'ds-csv-leiste';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ds-csv-knopf';
        b.textContent = 'CSV';
        b.title = de() ? 'Diese Tabelle als CSV-Datei speichern' : 'Save this table as a CSV file';
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            herunterladen(tabelle);
        });
        leiste.appendChild(b);
        tabelle.parentNode.insertBefore(leiste, tabelle);
    }

    function durchsuchen(wurzel) {
        var tabellen = (wurzel || document).querySelectorAll('.tab-content table');
        Array.prototype.forEach.call(tabellen, function (t) {
            if (!t.__dsCsv && t.parentNode && geeignet(t)) knopfDavor(t);
        });
    }

    var geplant = false;
    function planen() {
        if (geplant) return;
        geplant = true;
        setTimeout(function () { geplant = false; durchsuchen(); }, 400);
    }

    function start() {
        durchsuchen();
        if (typeof MutationObserver === 'function') {
            new MutationObserver(planen).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.DsCsv = { alsCsv: alsCsv, geeignet: geeignet, dateiname: dateiname, durchsuchen: durchsuchen };
}());
