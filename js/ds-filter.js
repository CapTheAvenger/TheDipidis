// ds-filter.js — Datenraum und Format als Filter statt als Reiter.
//
// AUSGANGSLAGE, gemessen am 18.08.2026:
//
//   Reiter oberster Ebene                                     13
//   current-meta          11.364 px Desktop / 14.046 px Mobil
//   city-league              441 px   Saisonpause
//   city-league-analysis     400 px   leeres Auswahlformular
//   current-analysis         768 px   leeres Auswahlformular
//   past-meta                400 px   leeres Auswahlformular
//
// Es gibt keine fuenf Meta-Ansichten, sondern eine riesige und vier
// Dropdowns. Wer zwischen Japan, Global und Vergangen wechseln will,
// klickt heute durch Reiter, deren Unterschied nirgends steht.
//
// WAS DIESE DATEI TUT
//
// Sie setzt ueber jede der drei Meta-Ansichten dieselbe Zeile:
//
//   DATENRAUM  [🇯🇵 Japan] [🌐 Global] [📦 Vergangen]   FORMAT  [TEF–PBL] …
//
// Der Datenraum wechselt den Reiter — fuer den Nutzer sieht es aus wie
// ein Filter, weil die Zeile ueberall gleich aussieht und stehen bleibt.
//
// WAS SIE AUSDRUECKLICH NICHT TUT
//
// Sie baut kein zweites Bedienelement neben das vorhandene. Die
// Formatwahl gibt es bereits: #cityLeagueFormatSelect fuer Japan
// (current/past) und #pastMetaFormatFilter fuer Vergangen (sieben
// abgeschlossene Fenster). Diese Zeile ist ihr Gesicht — sie liest
// deren Optionen und setzt deren Wert. Ein zweites System waere eine
// zweite Wahrheit, und genau davon hat diese Seite genug.
//
// Global hat gar keine Formatwahl: dort gilt immer das laufende
// Fenster. Deshalb steht dort ein Schild, kein Schalter. Ein Knopf,
// der nichts zu waehlen hat, ist eine Luege ueber die Daten.
//
// DIE ABHAENGIGKEIT IST DER EIGENTLICHE GEWINN
//
// Die Formate, die zur Auswahl stehen, gehoeren immer zum gewaehlten
// Datenraum. Damit wird aus der Projektregel "Japan, Global und Past
// werden nie in einer Zahl gemischt" ein Versprechen im Ausweis eine
// bauliche Tatsache: man kann die Raeume nicht mehr vermischen, weil
// die Auswahl es nicht hergibt.
(function () {
    'use strict';

    var RAEUME = [
        // `zweite` ist die Beschriftung der zweiten Spalte. Sie ist
        // NICHT ueberall "Format": bei Japan stehen dort "Aktuelles
        // Meta" und "Vergangenes Meta", das ist ein Zeitraum. Die
        // Spalte so zu nennen, wie sie heisst, kostet nichts.
        { key: 'jp',   tab: 'city-league', de: '🇯🇵 Japan',     en: '🇯🇵 Japan',
          quelle: 'cityLeagueFormatSelect', zweiteDe: 'Zeitraum', zweiteEn: 'Period' },
        { key: 'gl',   tab: 'current-meta', de: '🌐 Global',    en: '🌐 Global',
          quelle: null, zweiteDe: 'Format', zweiteEn: 'Format' },
        { key: 'past', tab: 'past-meta',   de: '📦 Vergangen', en: '📦 Past',
          quelle: 'pastMetaFormatFilter', zweiteDe: 'Format', zweiteEn: 'Format' },
    ];

    // Wo die Zeile in den jeweiligen Reiter kommt. Sie sitzt direkt
    // unter der Ueberschrift, damit sie an derselben Stelle steht,
    // egal in welchem Raum man ist — sonst springt sie beim Wechseln
    // und liest sich nicht mehr als dieselbe Zeile.
    var ANKER = {
        'city-league':  '#city-league .city-league-header',
        'current-meta': '#current-meta .header',
        'past-meta':    '#past-meta .header',
    };

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    function raumFuerTab(tab) {
        for (var i = 0; i < RAEUME.length; i++) if (RAEUME[i].tab === tab) return RAEUME[i];
        return null;
    }

    function aktiverTab() {
        var el = document.querySelector('.tab-content.active');
        return el ? el.id : null;
    }

    // Die Optionen kommen aus dem vorhandenen Select. Fehlt es noch
    // (der Reiter wurde nie geoeffnet), bleibt die Formatzeile leer —
    // erfundene Formatnamen waeren schlimmer als keine.
    function formate(raum) {
        if (!raum.quelle) return null;
        var sel = document.getElementById(raum.quelle);
        if (!sel || !sel.options || !sel.options.length) return null;
        var out = [];
        for (var i = 0; i < sel.options.length; i++) {
            var o = sel.options[i];
            // BEFUND (Schlussabnahme 30.08.2026): der Knopf "Aktuelles
            // Meta" sah bedienbar aus und tat nichts. Waehrend der
            // Saisonpause sperrt js/app-city-league.js die Option
            // `current` in BEIDEN Auswahlfeldern — diese Knopfleiste
            // baut sich aber aus denselben Optionen und hat die
            // Sperre nie mitgelesen. Gemessen: Textlaenge der Ansicht
            // vor dem Klick 3154 Zeichen, vier Sekunden danach 3154.
            // Kein Hinweis, kein disabled, kein aria-disabled.
            out.push({ wert: o.value, text: (o.textContent || o.value).trim(),
                       gesperrt: !!o.disabled, grund: o.title || '' });
        }
        return { sel: sel, opts: out, aktiv: sel.value };
    }

    function baueZeile(raum) {
        var d = de();
        var wrap = document.createElement('div');
        wrap.className = 'ds-filter';

        var g1 = document.createElement('div');
        g1.className = 'ds-filter-group';
        var l1 = document.createElement('span');
        l1.className = 'ds-filter-lab';
        l1.textContent = d ? 'Datenraum' : 'Data space';
        var seg = document.createElement('div');
        seg.className = 'ds-filter-seg is-space';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', l1.textContent);
        RAEUME.forEach(function (r) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ds-filter-btn' + (r.key === raum.key ? ' is-on' : '');
            b.setAttribute('data-space', r.key);
            b.setAttribute('aria-pressed', String(r.key === raum.key));
            b.textContent = d ? r.de : r.en;
            b.addEventListener('click', function () {
                if (r.key === raum.key) return;
                if (typeof window.switchTabAndUpdateMenu === 'function') {
                    window.switchTabAndUpdateMenu(r.tab);
                } else if (typeof window.switchTab === 'function') {
                    window.switchTab(r.tab);
                }
            });
            seg.appendChild(b);
        });
        g1.appendChild(l1);
        g1.appendChild(seg);
        wrap.appendChild(g1);

        var g2 = document.createElement('div');
        g2.className = 'ds-filter-group';
        var l2 = document.createElement('span');
        l2.className = 'ds-filter-lab';
        l2.textContent = d ? raum.zweiteDe : raum.zweiteEn;
        g2.appendChild(l2);

        var f = formate(raum);
        if (!f) {
            // Global: das laufende Fenster, ohne Wahl. Ein Schild.
            var chip = document.createElement('span');
            chip.className = 'ds-filter-fixed';
            chip.textContent = (window.DsNav && typeof window.DsNav.getFacts === 'function'
                && (window.DsNav.getFacts(raum.key) || {}).format) || (d ? 'laufendes Fenster' : 'current window');
            g2.appendChild(chip);
            /* HIER STAND EIN ERKLAERSATZ BIS ZUM 01.09.2026.
               Erst "hier gibt es nur das laufende Format", dann — nach
               der ersten Rueckmeldung — "Global laeuft immer im
               aktuellen Format." Beide Fassungen erklaerten dasselbe
               Feld, das direkt daneben steht und "TEF-PBL" sagt.
               Gemeldet: "Okay, den Zusatz kannst du aber rauslassen.
               Lieber dieses TEF-bis-PBL-Feld optisch den anderen
               anpassen." Genau das ist passiert — der Satz ist weg, das
               Schild sieht jetzt aus wie ein gesetzter Knopf
               (css/components.css, .ds-filter-fixed). Wo eine Anzeige
               fuer sich spricht, braucht sie keine Bildunterschrift. */
        } else if (f.opts.length > 4) {
            // Sechzehn Knoepfe mit Beschriftungen wie "Scarlet & Violet
            // → Phantasmal Flames (SVI-PFL)" waeren eine Wand, keine
            // Auswahl. Ab fuenf Optionen ein Auswahlfeld — das ist
            // ausserdem mit der Tastatur bedienbar, und genau das fehlt
            // laut Audit an zwei von drei Deck-Auswahlen.
            var sl = document.createElement('select');
            sl.className = 'ds-filter-select';
            sl.setAttribute('aria-label', l2.textContent);
            f.opts.forEach(function (o) {
                var op = document.createElement('option');
                op.value = o.wert;
                op.textContent = o.text;
                if (o.wert === f.aktiv) op.selected = true;
                sl.appendChild(op);
            });
            sl.addEventListener('change', function () {
                f.sel.value = sl.value;
                f.sel.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof f.sel.onchange === 'function') f.sel.onchange({ target: f.sel });
                setTimeout(zeichne, 400);
            });
            g2.appendChild(sl);
        } else {
            var seg2 = document.createElement('div');
            seg2.className = 'ds-filter-seg';
            seg2.setAttribute('role', 'group');
            seg2.setAttribute('aria-label', l2.textContent);
            f.opts.forEach(function (o) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'ds-filter-btn' + (o.wert === f.aktiv ? ' is-on' : '')
                                              + (o.gesperrt ? ' is-gesperrt' : '');
                b.setAttribute('aria-pressed', String(o.wert === f.aktiv));
                b.textContent = o.text;
                if (o.gesperrt) {
                    // Gesperrt heisst gesperrt: sichtbar, nicht anklickbar,
                    // und mit dem Grund daran. Ein Knopf, der aussieht wie
                    // ein Knopf und nichts tut, ist schlimmer als keiner.
                    b.disabled = true;
                    b.setAttribute('aria-disabled', 'true');
                    if (o.grund) b.title = o.grund;
                }
                b.addEventListener('click', function () {
                    if (o.gesperrt) return;
                    // Den vorhandenen Select bedienen, nicht ersetzen:
                    // an ihm haengt die ganze Ladelogik.
                    f.sel.value = o.wert;
                    f.sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof f.sel.onchange === 'function') f.sel.onchange({ target: f.sel });
                    setTimeout(zeichne, 400);
                });
                seg2.appendChild(b);
            });
            g2.appendChild(seg2);
        }
        wrap.appendChild(g2);
        return wrap;
    }

    function zeichne() {
        horcheAufQuellen();
        var tab = aktiverTab();
        var raum = raumFuerTab(tab);
        if (!raum) return;
        var anker = document.querySelector(ANKER[tab]);
        if (!anker || !anker.parentElement) return;
        var alt = anker.parentElement.querySelector(':scope > .ds-filter');
        var neu = baueZeile(raum);
        if (alt) {
            anker.parentElement.replaceChild(neu, alt);
        } else {
            anker.parentElement.insertBefore(neu, anker.nextSibling);
        }
    }

    function start() {
        zeichne();
        // switchTab umschliessen statt anfassen — dieselbe Technik wie
        // js/ds-nav.js. Diese Datei ist ohne Rueckbau entfernbar.
        var orig = window.switchTab;
        if (typeof orig === 'function' && !orig.__dsFilterWrapped) {
            var wrapped = function () {
                var r = orig.apply(this, arguments);
                try { setTimeout(zeichne, 60); } catch (e) { /* nie die Navigation blockieren */ }
                return r;
            };
            wrapped.__dsFilterWrapped = true;
            window.switchTab = wrapped;
        }
        document.addEventListener('languageChanged', zeichne);
        window.addEventListener('languageChanged', zeichne);

        /* BEFUND (Abnahmerunde 30.08.2026): die Kopie oben und das
           Original unten liefen auseinander. Das eigene Menue schreibt
           in die Quell-Auswahl zurueck (Zeile 179), umgekehrt gab es
           nichts: wer das Format unten im "Meta/Format-Filter" aenderte,
           sah oben weiter das alte. Zwei widerspruechliche Formatangaben
           gleichzeitig auf einem Bildschirm.
           Gehorcht wird der Quelle — sie ist das Original. */
        horcheAufQuellen();
    }

    // Wird bei jedem zeichne() erneut aufgerufen: die Auswahlfelder
    // entstehen teils erst, wenn der Reiter das erste Mal geladen hat.
    // Der Merker verhindert Doppelanmeldungen.
    function horcheAufQuellen() {
        RAEUME.map(function (r) { return r.quelle; }).filter(Boolean)
            .forEach(function (id) {
                var el = document.getElementById(id);
                if (!el || el.__dsFilterHorcht) return;
                el.__dsFilterHorcht = true;
                el.addEventListener('change', function () {
                    try { setTimeout(zeichne, 30); } catch (e) { /* nie die Auswahl blockieren */ }
                });
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.DsFilter = { zeichne: zeichne };
})();
