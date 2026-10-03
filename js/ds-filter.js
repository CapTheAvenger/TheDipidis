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
        /* BEFUND DER ABNAHME (02.09.2026): dieser Raum hiess "Vergangen"
           und stand 300 px neben "Vergangenes Meta" aus der
           Zeitraum-Spalte daneben — zwei verschiedene Datensaetze, fast
           derselbe Name. "Vergangen" ist ein anderer KARTENPOOL
           (abgeschlossene Rotationen), "Vergangenes Meta" ein anderer
           ZEITRAUM innerhalb Japans. Der Raum heisst jetzt nach dem,
           was ihn unterscheidet. */
        { key: 'past', tab: 'past-meta',   de: '📦 Vergangene Formate', en: '📦 Past formats',
          quelle: 'pastMetaFormatFilter', zweiteDe: 'Format', zweiteEn: 'Format',
          /* UI-33 (27.09.2026, Hausi): in Rotationen gehoert das Format
             zu Turnier-Filter, Archetyp und Karten-Share — dort steht
             das Original ohnehin. Die Zeile oben traegt nur noch die
             Raumwahl; das Original bleibt sichtbar. */
          formatInSteuerung: true },
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

    /* ── Warum es abgleichen() gibt ──────────────────────────────────
     *
     * BEFUND C2 / F16.3 (Live-Durchgang 07.09.2026), hier nachgemessen
     * mit tests/unit/test-ds-filter-formate.js:
     *
     *   1) direkt nach dem Laden   Knopfleiste mit 1 Knopf:
     *                              "-- Alle Formate --"
     *   2) nach dem Nachfuellen    Knopfleiste mit 1 Knopf:
     *                              "-- Alle Formate --"
     *      waehrend die Quelle #pastMetaFormatFilter 7 Optionen fuehrt.
     *
     * Die Zeile wird EINMAL aus den Optionen der Quelle gebaut. Past
     * Meta fuellt seine sieben Formate aber erst nach, wenn der Reiter
     * geladen hat (js/app-past-meta.js, resetSelectWithPlaceholder +
     * manifest.meta_keys). Ein Nachfuellen loest KEIN change-Ereignis
     * aus — horcheAufQuellen() hoert nur auf `change` und hat davon
     * nichts gemerkt. Ergebnis: oben eine Zeile mit einem toten
     * Platzhalterknopf, unten sieben Formate. Zwei Formatanzeigen, die
     * sich widersprechen, und die obere zieht nicht mit.
     *
     * abgleichen() vergleicht deshalb den ABDRUCK der Quelle (Werte,
     * Beschriftungen, Sperren, aktive Wahl) mit dem, was die gezeichnete
     * Zeile tragt, und zeichnet nur bei Unterschied neu. Angestossen
     * wird es von drei Seiten: vom change-Ereignis, von einem
     * MutationObserver auf der Optionsliste, und ausdruecklich von dem
     * Code, der die Optionen fuellt (window.DsFilter.abgleichen).
     */
    function abdruck(raum) {
        var f = formate(raum);
        if (!f) return raum.key + '\u2016(ohne Auswahl)';
        /* Der GRUND einer Sperre steht mit im Abdruck: er wird als title
           an den Knopf gehaengt, ist also Teil dessen, was gezeichnet
           wurde. Ohne ihn behielte ein Knopf seinen alten Grund, wenn
           die Sperre bleibt und nur die Begruendung wechselt
           (z. B. beim Sprachwechsel). */
        return raum.key + '\u2016' + f.aktiv + '\u2016' + f.opts.map(function (o) {
            return o.wert + '\u241f' + o.text + (o.gesperrt ? '\u241f!' + (o.grund || '') : '');
        }).join('\u241e');
    }

    function baueZeile(raum) {
        var d = de();
        var wrap = document.createElement('div');
        wrap.className = 'ds-filter';

        var g1 = document.createElement('div');
        g1.className = 'ds-filter-group';
        /* UI-13 (27.09.2026, Hausi): die Beschriftung „Datenraum" ist
           weg — „Man muss ja nicht alles noch mal extra benennen." Die
           Knoepfe Japan / Global / Rotationen sprechen fuer sich. Der
           Name bleibt fuer Bildschirmleser als aria-label der Gruppe. */
        var seg = document.createElement('div');
        seg.className = 'ds-filter-seg is-space';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', d ? 'Datenraum' : 'Data space');
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
        g1.appendChild(seg);
        wrap.appendChild(g1);

        var f = formate(raum);
        /* UI-12 (27.09.2026, Hausi): in Global gibt es keine Formatwahl —
           das Feld war nur ein Schild mit demselben Format, das die
           Ueberschrift direkt darueber schon nennt („Aktuelles Meta ·
           TEF–30C"). Gemessen: kein Klick, keine Optionen. Es faellt
           deshalb ganz weg, samt Beschriftung. Japan und Rotationen
           behalten ihre echte Auswahl. */
        if (!f || raum.formatInSteuerung) return wrap;

        var g2 = document.createElement('div');
        g2.className = 'ds-filter-group';
        var l2 = document.createElement('span');
        l2.className = 'ds-filter-lab';
        l2.textContent = d ? raum.zweiteDe : raum.zweiteEn;
        g2.appendChild(l2);

        if (f.opts.length > 4) {
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
                /* BEFUND B8, Zusatz (vorbestehend): im Auswahlfeld-Zweig
                   wurde `o.gesperrt` nicht auf die Kopie uebertragen —
                   ab fuenf Optionen war eine gesperrte Option oben also
                   waehlbar, unten nicht. Die Knopfleiste darunter macht
                   es seit dem 30.08.2026 richtig; hier fehlte es. */
                if (o.gesperrt) {
                    op.disabled = true;
                    if (o.grund) op.title = o.grund;
                }
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
        // Woraus diese Zeile gebaut wurde — abgleichen() liest es zurueck.
        neu.setAttribute('data-ds-abdruck', abdruck(raum));
        if (alt) {
            anker.parentElement.replaceChild(neu, alt);
        } else {
            anker.parentElement.insertBefore(neu, anker.nextSibling);
        }

        /* ── Das Original verstecken, wo die Zeile steht ──────────────
         *
         * Diese Datei sagt im Kopf ausdruecklich: "Sie baut kein zweites
         * Bedienelement neben das vorhandene." Genau das war aber der
         * sichtbare Zustand — BEFUND DER ABNAHME (02.09.2026): auf
         * city-league stand #cityLeagueFormatSelect oben rechts, und
         * 40 px darunter bot die Zeile dieselbe Wahl noch einmal als
         * ZEITRAUM · [Aktuelles Meta] [Vergangenes Meta].
         *
         * Das Auswahlfeld bleibt das Original — es wird weiter gelesen
         * und beschrieben, und es bleibt fuer Hilfsmittel erreichbar.
         * Es wird nur nicht mehr zweimal gezeigt. Faellt diese Datei
         * aus, ist es sofort wieder da: versteckt wird hier, nicht in
         * einer Stilvorlage. */
        RAEUME.forEach(function (r) {
            if (!r.quelle) return;
            var q = document.getElementById(r.quelle);
            if (!q) return;
            /* BEFUND DER ABNAHME (03.09.2026), zweiter Anlauf: das
               Auswahlfeld selbst zu verdecken haelt nicht. Ueber
               `select`, `.control-input` und `.tab-content select`
               liegen mehrere Breitenregeln mit `!important` aus
               verschiedenen Dateien; eine davon zog den absolut
               positionierten Kasten immer wieder auf volle Breite, und
               past-meta scrollte seitlich. Jede einzeln auszunehmen
               waere ein Wettlauf, den man nicht gewinnt.
               Also eine Huelle: ein <span> trifft keine dieser Regeln.
               Sie entsteht einmal und bleibt, damit das Feld beim
               Wechseln nicht durch den Baum wandert. */
            var behaelter = q.closest('.cl-format-container');
            if (!behaelter) {
                behaelter = q.closest('.ds-filter-huelle');
                if (!behaelter) {
                    // Ohne Elternknoten laesst sich nichts umhaengen. Das
                    // Feld bleibt dann sichtbar — lieber zwei sichtbare
                    // Felder als ein Absturz, der die ganze Zeile
                    // mitnimmt (die Ausnahme haette zeichne() beendet).
                    if (!q.parentElement) {
                        if (typeof console !== 'undefined' && console.warn) {
                            console.warn('[ds-filter] "' + r.quelle + '" haengt an keinem Elternknoten \u2014 nicht verdeckt');
                        }
                        return;
                    }
                    behaelter = document.createElement('span');
                    behaelter.className = 'ds-filter-huelle';
                    q.parentElement.insertBefore(behaelter, q);
                    behaelter.appendChild(q);
                }
            }
            var zeigen = (r.key !== raum.key) || !!r.formatInSteuerung;
            behaelter.classList.toggle('ds-filter-verdeckt', !zeigen);
            /* Das Etikett gehoert zum Feld. BEFUND DER ABNAHME
               (03.09.2026): auf past-meta hat das Auswahlfeld keinen
               .cl-format-container, also wurde nur IT selbst aus dem
               Fluss genommen — "Meta/Format Filter:" blieb sichtbar
               ueber einem Loch stehen. Ein Etikett, das auf nichts
               zeigt, ist schlechter als das doppelte Feld. */
            if (behaelter.classList.contains('ds-filter-huelle')) {
                var lab = document.querySelector('label[for="' + r.quelle + '"]');
                if (lab) lab.classList.toggle('ds-filter-verdeckt', !zeigen);
            }
            /* Und es darf den Fokus nicht fangen: ein unsichtbares
               <select> im Tabulator-Lauf, auf dem Pfeiltasten das Format
               wechseln, ist schlimmer als zwei sichtbare Felder. Die
               Filterzeile daneben ist das bedienbare Element. */
            if (!zeigen) {
                if (!q.hasAttribute('data-ds-tabindex-alt')) {
                    q.setAttribute('data-ds-tabindex-alt', q.getAttribute('tabindex') || '');
                }
                q.setAttribute('tabindex', '-1');
                q.setAttribute('aria-hidden', 'true');
            } else if (q.hasAttribute('data-ds-tabindex-alt')) {
                var alt2 = q.getAttribute('data-ds-tabindex-alt');
                if (alt2) q.setAttribute('tabindex', alt2); else q.removeAttribute('tabindex');
                q.removeAttribute('aria-hidden');
                q.removeAttribute('data-ds-tabindex-alt');
            }
        });
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

    /** Den Abgleich anstossen, ohne je den Aufrufer zu blockieren. */
    function planeAbgleich() {
        try { setTimeout(abgleichen, 30); } catch (e) { /* nie blockieren */ }
    }

    /** Der Zugriff fuer `name`, am Objekt selbst oder auf seiner Kette. */
    function eigenschaftZugriff(obj, name) {
        var k = obj;
        while (k) {
            var d = Object.getOwnPropertyDescriptor(k, name);
            if (d) return d;
            k = Object.getPrototypeOf(k);
        }
        return null;
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
                    try { setTimeout(abgleichen, 30); } catch (e) { /* nie die Auswahl blockieren */ }
                });
                /* ── BEFUND B8 (Pruefagent, 07.09.2026) ──────────────────
                 *
                 * Der Beobachter horchte nur auf `childList`. Drei Wege
                 * lagen daneben, jeder einzeln gemessen (Aenderung -> alle
                 * Uhren abarbeiten -> Leiste unveraendert; danach
                 * abgleichen() von Hand -> korrekt):
                 *
                 *   option.disabled = true + title
                 *       js/app-city-league.js sperrt in der Saisonpause
                 *       die Option `current`. Die gesperrte Option blieb
                 *       oben anklickbar.
                 *   option.textContent
                 *       js/i18n.js beschriftet die Optionen beim
                 *       Sprachwechsel um. Die Leiste behielt die alten
                 *       Beschriftungen.
                 *
                 * Beides sind im Browser echte Mutationen — sie brauchen
                 * nur `attributes`, `characterData` und `subtree`, weil sie
                 * an den OPTIONEN haengen, nicht am Auswahlfeld.
                 */
                if (typeof MutationObserver === 'function') {
                    try {
                        new MutationObserver(function () { planeAbgleich(); })
                            .observe(el, {
                                childList: true, subtree: true, characterData: true,
                                /* `attributeFilter` ist kein Feinschliff,
                                   sondern noetig: zeichne() setzt an DIESEM
                                   Feld selbst tabindex und aria-hidden. Ohne
                                   den Filter loeste jeder eigene Zeichenlauf
                                   den naechsten Abgleich aus — eine Schleife
                                   aus Selbstgespraechen, und ein Test haette
                                   dann jede Aenderung "bemerkt", auch eine,
                                   die der Beobachter gar nicht sieht. */
                                attributes: true,
                                attributeFilter: ['disabled', 'title', 'label', 'value']
                            });
                    } catch (e) { /* Beobachter ist Zugabe, kein Muss */ }
                }
                /* Der dritte Weg ist ueberhaupt keine Mutation:
                 *
                 *   select.value = '…'
                 *       js/app-city-league.js (switchCityLeagueFormat) und
                 *       js/app-init.js setzen den Wert per JavaScript. Das
                 *       aendert `selected` an einer Option, loest kein
                 *       `change` aus und ist im Baum nicht sichtbar — kein
                 *       Beobachter der Welt sieht das. Und es ist OHNE
                 *       Zutun am beobachteten Feld erreichbar: aendert der
                 *       Nutzer #cityLeagueFormatSelectAnalysis, setzt
                 *       switchCityLeagueFormat den Wert von
                 *       #cityLeagueFormatSelect still mit. Die Leiste zeigte
                 *       danach den falschen aktiven Knopf.
                 *
                 * Also wird der Schreibzugriff auf `value` an genau diesem
                 * Feld umschlossen — gelesen und geschrieben wird weiter
                 * das Original, es sagt jetzt nur Bescheid. Faellt diese
                 * Datei aus, ist das Feld unveraendert.
                 */
                try {
                    var zugriff = eigenschaftZugriff(el, 'value');
                    if (zugriff && typeof zugriff.set === 'function' && zugriff.configurable !== false) {
                        Object.defineProperty(el, 'value', {
                            configurable: true,
                            enumerable: zugriff.enumerable,
                            get: function () { return zugriff.get.call(this); },
                            set: function (v) { zugriff.set.call(this, v); planeAbgleich(); }
                        });
                    }
                } catch (e) { /* auch das ist Zugabe, kein Muss */ }
            });
    }

    /**
     * Zeichnet die Zeile neu, WENN sich die Quelle veraendert hat.
     * @returns {boolean} true, wenn neu gezeichnet wurde.
     */
    function abgleichen() {
        horcheAufQuellen();
        var tab = aktiverTab();
        var raum = raumFuerTab(tab);
        if (!raum) return false;
        var anker = document.querySelector(ANKER[tab]);
        if (!anker || !anker.parentElement) return false;
        var zeile = anker.parentElement.querySelector(':scope > .ds-filter');
        var jetzt = abdruck(raum);
        if (zeile && zeile.getAttribute('data-ds-abdruck') === jetzt) return false;
        zeichne();
        return true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.DsFilter = { zeichne: zeichne, abgleichen: abgleichen, abdruck: abdruck };
})();
