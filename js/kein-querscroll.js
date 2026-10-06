/*
 * Kein seitliches Scrollen am Handy (Festlegung A, 06.10.2026)
 * ------------------------------------------------------------
 * Hausi, 06.10.2026: „Kein nach links und rechts scrollen. Hoch und runter
 * scrollen, okay. Links und rechts scrollen, nein. Nirgendwo, niemals."
 *
 * Gemessen bei 390 px (scripts/messe_390.js, 06.10.2026): seitlich wischbar
 * waren die Heatmap (364 → 1.671 px), 23 Matchup-Tabellen der Deck-Karten
 * (359 → 404), die Meta-Rangliste (518 → 621) und die Japan-Siegertabelle
 * (329 → 367). Jede Tabelle einzeln umzubauen hiesse, Dutzende Regeln mit
 * Ausrufezeichen zu ueberstimmen — und die naechste neue Tabelle haette
 * dasselbe Problem wieder.
 *
 * Deshalb allgemein und gemessen statt aufgezaehlt: Ist das Fenster
 * hoechstens 700 px breit und ragt eine sichtbare Tabelle ueber ihren
 * Bildlaufbereich hinaus, wird sie ausgeblendet und direkt dahinter als
 * Kartenliste gezeigt — je Zeile eine Karte, je Spalte eine Zeile
 * „Ueberschrift: Wert". Nur hoch und runter. Klicks in einer Karte gehen an
 * das Original weiter (gleiche Stelle in der Zelle), sortierbare
 * Spaltenkoepfe stehen als Knoepfe ueber den Karten. Aendert sich die
 * Tabelle (Sortieren, „Alle zeigen", neu zeichnen), wird die Liste neu gebaut.
 */
(function () {
    'use strict';

    var GRENZE = 700;

    /* ---- reine Hilfen (Tests: tests/unit/test-kein-querscroll.js) ---- */

    /* Spaltenueberschrift je Spaltenposition; colspan belegt mehrere. */
    function qsSpaltenTitel(kopf) {
        var aus = [];
        (kopf || []).forEach(function (z) {
            var n = Math.max(1, parseInt(z && z.colspan, 10) || 1);
            for (var i = 0; i < n; i++) aus.push(String((z && z.text) || '').replace(/\s+/g, ' ').trim());
        });
        return aus;
    }

    /* Welche Zellen bilden den Kartentitel? Die erste Zelle mit Buchstaben
       (der Name), davor hoechstens die erste Zelle, wenn sie eine Zahl ist
       (der Rang: „1 · Dragapult"). Hat keine Zelle Buchstaben: die erste. */
    function qsTitelZellen(zellTexte) {
        var hatBuchstaben = function (t) { return /[A-Za-zÄÖÜäöüß]/.test(String(t || '')); };
        for (var i = 0; i < zellTexte.length; i++) {
            if (!hatBuchstaben(zellTexte[i])) continue;
            if (i === 0) return [0];
            return /^\s*\d+\s*$/.test(String(zellTexte[0] || '')) ? [0, i] : [i];
        }
        return zellTexte.length ? [0] : [];
    }

    /* Karte aus einer Zeile: Titel-Zellindizes und die uebrigen Zeilen
       mit Ueberschrift. Leere Zellen fallen weg. */
    function qsKartenModell(titel, zellen) {
        var pos = [], p = 0;
        zellen.forEach(function (z) {
            pos.push(p);
            p += Math.max(1, parseInt(z.colspan, 10) || 1);
        });
        var titelZellen = qsTitelZellen(zellen.map(function (z) { return z.text; }));
        var zeilen = [];
        for (var i = 0; i < zellen.length; i++) {
            if (titelZellen.indexOf(i) >= 0) continue;
            /* Leer, „-", „–" (keine Daten) und „\" (Spiegelduell) tragen in
               der Karte nichts — sie fallen weg statt eine Zeile zu belegen. */
            if (/^\s*(?:[-–\\]\s*)?$/.test(String(zellen[i].text || ''))) continue;
            zeilen.push({ zelle: i, label: titel[pos[i]] || '' });
        }
        return { titel: titelZellen, zeilen: zeilen };
    }

    function qsHash(s) {
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        return String(h) + ':' + s.length;
    }

    /* ---- DOM ---- */

    var ersetzt = new Map();   // table -> { liste, sig }

    function sichtbar(el) {
        return !!(el && el.isConnected && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function zeilenSichtbar(tr) {
        if (tr.hidden) return false;
        var cs = window.getComputedStyle(tr);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
    }

    function signatur(table) {
        var teile = [table.className];
        Array.prototype.forEach.call(table.rows, function (tr) {
            teile.push(tr.className + '|' + (tr.hidden ? 'h' : '') + '|' + (tr.style.display || '') + '|' + tr.textContent);
        });
        Array.prototype.forEach.call(table.querySelectorAll('thead th'), function (th) {
            teile.push(th.getAttribute('aria-sort') || '');
        });
        return qsHash(teile.join('\u0001'));
    }

    function bildlaufVorfahr(el) {
        var a = el.parentElement;
        while (a && a !== document.body && a !== document.documentElement) {
            var ox = window.getComputedStyle(a).overflowX;
            if (ox === 'auto' || ox === 'scroll') return a;
            a = a.parentElement;
        }
        return null;
    }

    function ragtHinaus(table) {
        if (!sichtbar(table)) return false;
        /* Live 06.10. gemessen: die Japan-Siegertabelle ist SELBST der
           Bildlaufbereich (display: block; overflow-x: auto) — 329 breit,
           Inhalt 367. Dann zaehlt ihr eigener Inhalt, nicht ihr Rahmen. */
        var eigen = window.getComputedStyle(table).overflowX;
        if ((eigen === 'auto' || eigen === 'scroll') && table.scrollWidth > table.clientWidth + 1) return true;
        var breite = table.getBoundingClientRect().width;
        var s = bildlaufVorfahr(table);
        var platz = s ? s.clientWidth : document.documentElement.clientWidth;
        return breite > platz + 1;
    }

    function kopfZeile(table) {
        var thead = table.tHead;
        if (thead && thead.rows.length) return thead.rows[thead.rows.length - 1];
        return null;
    }

    function textOhneHilfe(el) {
        var c = el.cloneNode(true);
        Array.prototype.forEach.call(c.querySelectorAll('[aria-hidden="true"], .sr-only, .visually-hidden'), function (x) { x.remove(); });
        return c.textContent.replace(/\s+/g, ' ').trim();
    }

    /* Pfad eines Elements innerhalb seiner Zelle (Kind-Indizes). */
    function pfadIn(wurzel, el) {
        var pfad = [];
        while (el && el !== wurzel) {
            var p = el.parentNode;
            if (!p) return null;
            pfad.unshift(Array.prototype.indexOf.call(p.children, el));
            el = p;
        }
        return el === wurzel ? pfad : null;
    }
    function folgePfad(wurzel, pfad) {
        var el = wurzel;
        for (var i = 0; i < pfad.length && el; i++) el = el.children[pfad[i]];
        return el || wurzel;
    }

    function weiterleiten(kopie, original) {
        /* Fangphase: das Klon-Element selbst bekommt den Klick nicht
           (sonst liefe ein onclick-Attribut doppelt), das Original schon. */
        kopie.addEventListener('click', function (e) {
            var pfad = pfadIn(kopie, e.target);
            if (!pfad) return;
            var ziel = folgePfad(original, pfad);
            var a = e.target.closest && e.target.closest('a[href]');
            if (a && kopie.contains(a) && !a.hasAttribute('onclick')) return; // Links laufen nativ
            e.preventDefault();
            e.stopPropagation();
            if (ziel && typeof ziel.click === 'function') ziel.click();
        }, true);
    }

    function baueListe(table) {
        var de = (document.documentElement.lang || 'de').indexOf('en') !== 0;
        var kopf = kopfZeile(table);
        var kopfZellen = kopf ? Array.prototype.slice.call(kopf.cells) : [];
        var titel = qsSpaltenTitel(kopfZellen.map(function (th) {
            return { text: textOhneHilfe(th), colspan: th.colSpan };
        }));

        var liste = document.createElement('div');
        liste.className = 'qs-karten';
        liste.setAttribute('data-qs-karten', '');

        var sortierbar = kopfZellen.filter(function (th) {
            return th.getAttribute('role') === 'button' || th.hasAttribute('aria-sort') && th.hasAttribute('tabindex');
        });
        if (sortierbar.length) {
            var leiste = document.createElement('div');
            leiste.className = 'qs-sortieren';
            var lab = document.createElement('span');
            lab.className = 'qs-sortieren-label';
            lab.textContent = de ? 'Sortieren nach:' : 'Sort by:';
            leiste.appendChild(lab);
            sortierbar.forEach(function (th) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'qs-sortieren-btn';
                var st = th.getAttribute('aria-sort');
                b.textContent = textOhneHilfe(th) + (st === 'descending' ? ' ▼' : st === 'ascending' ? ' ▲' : '');
                if (st === 'descending' || st === 'ascending') b.setAttribute('aria-pressed', 'true');
                b.addEventListener('click', function () { th.click(); });
                leiste.appendChild(b);
            });
            liste.appendChild(leiste);
        }

        Array.prototype.forEach.call(table.tBodies, function (tb) {
            Array.prototype.forEach.call(tb.rows, function (tr) {
                if (!zeilenSichtbar(tr)) return;
                var zellen = Array.prototype.slice.call(tr.cells);
                var modell = qsKartenModell(titel, zellen.map(function (c) {
                    return { text: c.textContent, colspan: c.colSpan };
                }));
                var karte = document.createElement('div');
                karte.className = 'qs-karte' + (tr.className ? ' ' + tr.className.split(/\s+/).map(function (k) { return 'qs-z-' + k; }).join(' ') : '');
                if (modell.titel.length) {
                    var t = document.createElement('div');
                    t.className = 'qs-karte-titel';
                    modell.titel.forEach(function (i, n) {
                        if (n) t.appendChild(document.createTextNode(' · '));
                        var k = document.createElement('span');
                        k.innerHTML = zellen[i].innerHTML;
                        weiterleiten(k, zellen[i]);
                        t.appendChild(k);
                    });
                    karte.appendChild(t);
                }
                var dl = document.createElement('dl');
                dl.className = 'qs-karte-werte';
                modell.zeilen.forEach(function (z) {
                    var zelle = zellen[z.zelle];
                    var dt = document.createElement('dt');
                    dt.textContent = z.label;
                    var dd = document.createElement('dd');
                    /* Farbklassen mitnehmen, Breitenklassen der Tabelle nicht
                       (die setzen Mindestbreiten mit Ausrufezeichen). */
                    dd.className = zelle.className.split(/\s+/).filter(function (k) {
                        return k && !/^(heatmap-t[dh]|heatmap-col|ds-num|ds-rank)/.test(k);
                    }).join(' ');
                    dd.innerHTML = zelle.innerHTML;
                    /* Zellfarbe nur, wenn die Zelle ihre eigene Farbe traegt
                       (Inline-Stil). Die Heatmap setzt dort --heatmap-bg und
                       faerbt per Klasse — darum die BERECHNETE Farbe, nicht
                       die Klasse (live 06.10.: sonst waren alle Felder grau). */
                    if (zelle.getAttribute && zelle.getAttribute('style')) {
                        var cs = window.getComputedStyle(zelle);
                        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') dd.style.backgroundColor = cs.backgroundColor;
                        if (cs.color) dd.style.color = cs.color;
                    }
                    weiterleiten(dd, zelle);
                    dl.appendChild(dt);
                    dl.appendChild(dd);
                });
                karte.appendChild(dl);
                liste.appendChild(karte);
            });
        });
        return liste;
    }

    function ersetze(table) {
        var alt = ersetzt.get(table);
        var liste = baueListe(table);
        if (alt && alt.liste.isConnected) alt.liste.replaceWith(liste);
        else table.insertAdjacentElement('afterend', liste);
        table.style.setProperty('display', 'none', 'important');
        table.setAttribute('data-qs-ersetzt', '');
        ersetzt.set(table, { liste: liste, sig: signatur(table) });
    }

    function zurueck(table) {
        var e = ersetzt.get(table);
        if (e && e.liste.isConnected) e.liste.remove();
        if (table.isConnected) {
            table.style.removeProperty('display');
            table.removeAttribute('data-qs-ersetzt');
        }
        ersetzt.delete(table);
    }

    var laeuft = false;
    function pruefe() {
        if (laeuft) return;
        laeuft = true;
        try {
            var schmal = window.innerWidth <= GRENZE;
            ersetzt.forEach(function (e, table) {
                if (!table.isConnected) { if (e.liste.isConnected) e.liste.remove(); ersetzt.delete(table); return; }
                if (!schmal) { zurueck(table); return; }
                if (!e.liste.isConnected || signatur(table) !== e.sig) ersetze(table);
            });
            if (!schmal) return;
            Array.prototype.forEach.call(document.querySelectorAll('table:not([data-qs-ersetzt])'), function (t) {
                if (ragtHinaus(t)) ersetze(t);
            });
        } finally {
            laeuft = false;
        }
    }

    var geplant = 0;
    function planen() {
        if (geplant) return;
        geplant = setTimeout(function () { geplant = 0; pruefe(); }, 120);
    }

    function start() {
        pruefe();
        try {
            new MutationObserver(function (liste) {
                for (var i = 0; i < liste.length; i++) {
                    var z = liste[i].target;
                    /* Eigene Aenderungen in den Kartenlisten loesen nichts aus. */
                    if (z && z.closest && z.closest('[data-qs-karten]')) continue;
                    planen();
                    return;
                }
            }).observe(document.body, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-sort']
            });
        } catch (e) { /* ohne Beobachter bleibt die Pruefung beim Laden und bei Groessenwechsel */ }
        window.addEventListener('resize', planen);
        window.addEventListener('orientationchange', planen);
    }

    window.DsKeinQuerscroll = {
        qsSpaltenTitel: qsSpaltenTitel,
        qsTitelZellen: qsTitelZellen,
        qsKartenModell: qsKartenModell,
        pruefe: pruefe,
        GRENZE: GRENZE
    };

    if (typeof document !== 'undefined' && document.body) start();
    else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', start);
})();
