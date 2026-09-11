// ds-sections.js — die Meta-Ansicht als Bausteine statt als Wand.
//
// GEMESSEN am 18.08.2026, bevor es diese Datei gab:
//
//   current-meta        11.364 px Desktop  /  14.046 px Mobil
//                       = 12,6 / 16,6 Bildschirmhoehen
//   Matchup-Heatmap     stand bei y = 6.562 px  (7,3 Bildschirme tief)
//   Most Used Cards     stand bei y = 7.417 px  (8,2 Bildschirme tief)
//   Vollstaendige Tabelle  2.479 px = 22 % der ganzen Seite
//
// Die drei Dinge, wegen derer jemand diese Seite oeffnet — welche Decks
// gewinnen, wie stehen sie zueinander, welche Karten spielen alle —
// lagen ueber 7.400 px verteilt. Dazwischen 4.500 px Tier-Liste.
//
// WAS DIESE DATEI TUT
//
// #currentMetaContent hat zwoelf direkte Kinder, jedes ein sauberer
// Block mit eigener Ueberschrift. Sie werden hier in benannte,
// klappbare Abschnitte gefasst und in eine Reihenfolge gebracht, die
// mit der Antwort beginnt. Der Zustand jedes Abschnitts wird gemerkt.
//
// WAS SIE AUSDRUECKLICH NICHT TUT
//
// Sie nimmt nichts weg. Der heutige Vanilla-Modus in der Deck-Analyse
// tut genau das — gemessen: 4.039 px mit 0 von 46 Bausteinen sichtbar
// gegen 7.691 px mit 45 von 46, und darunter sind die besten und
// schlechtesten Matchups. Ein Abschnitt, der zugeklappt ist, steht
// weiter mit seiner Ueberschrift da. Wer ihn sucht, findet ihn.
//
// Sie schreibt auch keinen Renderer neu. Die Bloecke werden VERSCHOBEN
// (appendChild), nicht neu erzeugt — damit ueberleben alle
// Ereignis-Handler, die app-tier-meta.js, app-current-meta.js und
// app-meta-cards.js daran gehaengt haben. Dieselbe Technik wie
// js/ds-nav.js, das switchTab umschliesst statt app-core.js anzufassen:
// diese Datei ist ohne Rueckbau entfernbar.
(function () {
    'use strict';

    var HOST_ID = 'currentMetaContent';
    var STORE = 'ds_sections_v1';

    // Reihenfolge = Reihenfolge auf der Seite. `auf` ist der
    // Startzustand; wer etwas anders einstellt, bekommt seine
    // Einstellung wieder, nicht diese hier.
    //
    // Die ersten drei beantworten die Eingangsfrage. Alles danach ist
    // Vertiefung und faengt zugeklappt an — sichtbar vorhanden, aber
    // nicht im Weg.
    // Luft ueber dem aufgeklappten Abschnitt. Oben klebt nichts fest,
    // also reicht ein schmaler Rand, damit er nicht an der Kante pickt.
    var ABSTAND_OBEN = 16;

    // ZWEI AENDERUNGEN AM 01.09.2026, beide aus derselben Rueckmeldung.
    //
    // 1. "Die staerksten Decks" war eine Behauptung, die die Daten
    //    darunter nicht decken. Gemeldet: "Wichtig hierbei ist aber,
    //    dass wir vielleicht nicht sagen 'die staerksten Decks',
    //    sondern es sind de facto erstmal nur die meistgenutzten
    //    Decks." Genau so ist es: sortiert wird nach Anteil.
    // 2. Die Unterzeilen wiederholten, was daneben ohnehin steht
    //    ("wer schlaegt wen" unter "Matchups", "Format-Staples" unter
    //    einer Ueberschrift, die das Wort schon traegt). Gemeldet:
    //    "Dieses 'Wer schlaegt wen' kann da weg … ist eine super
    //    sinnlose Bezeichnung." Wo die Unterzeile nichts hinzufuegt,
    //    steht keine mehr.
    //
    // NACHTRAG 10.09.2026, vom Betreiber gemeldet: "Decks" war ungenau.
    // Die Kacheln darunter zeigen ARCHETYPEN mit ihren Varianten
    // ("Dragapult · 7 Varianten"), nicht einzelne Decklisten. Wer
    // "Decks" liest und Decklisten zaehlt, kommt auf eine andere Zahl
    // als die Kachel daneben.
    var SECTIONS = [
        { id: 'top',     auf: true,  nimm: ['section.tier-hero-section'],
          de: ['Die meistgespielten Archetypen', ''],
          en: ['Most played archetypes', ''] },
        { id: 'heatmap', auf: true,  nimm: ['#matchupHeatmapContainer'],
          de: ['Matchups', ''],
          en: ['Matchups', ''] },
        { id: 'cards',   auf: true,  nimm: ['div.top-cards-container'],
          de: ['Meistgespielte Karten', ''],
          en: ['Most played cards', ''] },
        /* Hiess bis zum 11.09.2026 deutsch "Gegen welches Meta?" und
           englisch "Against which field?" — zwei Namen fuer denselben
           Abschnitt, und im Block darunter stand die Frage gleich noch
           einmal. Betreiber: "Feld wird immer und ueberall als Meta
           bezeichnet." Der Name sagt jetzt, was man hier einstellt: sein
           eigenes Deck, und wogegen. */
        /* Der Abschnitt traegt seit dem 11.09.2026 nur noch einen
           Verweis: die Rechnung ist in den Meta Call gezogen und
           gewichtet dort mit dem Anteil, den der Nutzer ERWARTET, statt
           mit dem gemessenen Online-Anteil (js/ds-ev-rechner.js, Kopf).
           Der Untertitel sagt das, damit niemand aufklappt und den
           Rechner sucht, der bis gestern hier stand. */
        { id: 'ev',      auf: false, nimm: ['div.ds-ev-block'],
          de: ['Dein Deck gegen das Meta', 'umgezogen in den Meta Call — dort mit den Anteilen, die du erwartest'],
          en: ['Your deck vs. the meta', 'moved into the Meta Call — there with the shares you expect'] },
        { id: 'tiers',   auf: false, nimm: ['__tiers__'],
          de: ['Tier-Liste', 'alle Archetypen nach Stärke gruppiert'],
          en: ['Tier list', 'all archetypes grouped by strength'] },
        /* Der Untertitel nennt die Kennzahl so, wie die Spalte darunter
           sie nennt. Die Spalte liest new_winrate aus
           data/limitless_online_decks_comparison.csv; das ist
           S/(S+N+U), also `mitUnentschieden` — NICHT die Matchpunkte,
           die Limitless „Win %" nennt (js/win-rate-konvention.js). Der
           Name wird zur Laufzeit geholt, damit hier keine zweite
           Abschrift entsteht, die stehen bleibt, wenn das Modul sich
           aendert. Faellt das Modul aus, steht die Formel da statt
           eines Hausnamens. */
        { id: 'rang',    auf: false, nimm: ['div.cm-rangliste-block'],
          de: ['Meta-Performance', 'Listen, {quote:mitUnentschieden} und Top-8-Quote je Deck — sortierbar'],
          en: ['Meta performance', 'lists, {quote:mitUnentschieden} and top-8 rate per deck — sortable'] },
        // Der Abschnitt "Auf- und Absteiger" stand hier bis zum
        // 01.09.2026. Seine beiden Bloecke werden nicht mehr erzeugt
        // (js/app-tier-meta.js), also gaebe es hier nichts mehr
        // einzusammeln.
    ];

    /* Holt den Namen einer Win-Raten-Konvention zur Laufzeit aus
       js/win-rate-konvention.js (in index.html vor dieser Datei
       geladen). Kein zweiter Name als Rueckfall: fehlt das Modul,
       steht die Formel da — die ist immer richtig. */
    function quotenName(konvention) {
        var K = window.WinRateKonvention;
        if (K && typeof K.kurz === 'function') return K.kurz(konvention);
        return konvention === 'matchpunkte' ? '(3S + U) / (3n)'
             : konvention === 'ohneUnentschieden' ? 'S / (S + N)'
             : 'S / (S + N + U)';
    }

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    /* {quote:<konvention>} wird ERST HIER ersetzt, nicht schon in der
       Liste oben: `kurz()` liefert je nach Sprache einen anderen Namen,
       und die Liste wird nur einmal beim Laden ausgewertet. Eine dort
       eingesetzte Zeichenkette bliebe beim Sprachwechsel stehen. */
    function fuelleQuoten(text) {
        return String(text || '').replace(/\{quote:([A-Za-z]+)\}/g, function (_, k) {
            return quotenName(k);
        });
    }

    function texte(s) {
        var t = de() ? s.de : s.en;
        return [fuelleQuoten(t[0]), fuelleQuoten(t[1])];
    }

    function gemerkt() {
        try {
            var v = JSON.parse(localStorage.getItem(STORE));
            if (Array.isArray(v)) return nurBekannte(v);
        } catch (e) { /* kein Speicher, kein Problem */ }
        return null;
    }

    /* Gespeicherte Abschnitte, die es nicht mehr gibt, fliegen raus.
     *
     * BEFUND (04.09.2026, live auf der Startseite): dort stand
     * "7 von 6 Abschnitten offen". Der Abschnitt "Auf- und Absteiger"
     * ist am 01.09.2026 aus SECTIONS verschwunden, seine ID stand aber
     * weiter im localStorage jedes Besuchers, der die Seite vorher
     * benutzt hatte. Gezaehlt wurde die gespeicherte Liste, verglichen
     * wurde gegen die aktuelle — daher mehr offene Abschnitte als
     * ueberhaupt vorhanden.
     *
     * Zwei Folgen, beide sichtbar: die unsinnige Zahl, und ein
     * "Ansicht zuruecksetzen", das nie wieder verschwindet, weil
     * `gleich` in zeichneReset() mit einer Geister-ID nie zutreffen
     * kann.
     *
     * Der Filter gehoert ans LESEN, nicht ans Schreiben: die alten
     * Eintraege liegen schon in fremden Browsern, und die erreicht man
     * nur beim naechsten Laden. */
    function nurBekannte(ids) {
        var bekannt = SECTIONS.map(function (s) { return s.id; });
        return ids.filter(function (id) { return bekannt.indexOf(id) > -1; });
    }

    function merken(offen) {
        try { localStorage.setItem(STORE, JSON.stringify(offen)); } catch (e) {}
    }

    function standard() {
        return SECTIONS.filter(function (s) { return s.auf; }).map(function (s) { return s.id; });
    }

    var offen = null;

    // Die Tier-Bloecke haengen in einem klassenlosen div. Es ueber die
    // Kinder zu erkennen ist stabiler als ueber die Position: das div
    // ist genau das, welches #cm-tier-1 enthaelt.
    //
    // Der Aufstieg muss an ZWEI Stellen halten: direkt unter dem Host
    // (vor dem Sektionieren) und direkt unter einem .ds-sec-body
    // (danach). Ohne die zweite Bedingung lief er beim zweiten Durchlauf
    // bis zum Abschnitt selbst hinauf, und der sollte dann in seinen
    // eigenen Koerper gehaengt werden:
    //   HierarchyRequestError: The new child element contains the parent.
    function findeTiers(host) {
        var t1 = host.querySelector('#cm-tier-1');
        if (!t1) return null;
        var n = t1;
        while (n && n.parentElement && n.parentElement !== host
               && !n.parentElement.classList.contains('ds-sec-body')) {
            n = n.parentElement;
        }
        return n;
    }

    // Kandidaten sind die direkten Kinder des Hosts — UND die direkten
    // Kinder bereits gebauter Abschnittskoerper.
    //
    // Der zweite Teil ist kein Luxus. Gemessen live am 18.08.2026:
    // .top-cards-container landete im Abschnitt "Ueberblick" statt in
    // seinem eigenen. Ursache ist das Sektionieren selbst — wer seinen
    // Inhalt relativ zu einem anderen Block einfuegt (etwa hinter
    // .stats-grid), fuegt ihn danach in DESSEN Abschnitt ein, weil der
    // Bezugsknoten dorthin gewandert ist. Ohne diesen Zweig bleibt der
    // Block fuer immer am falschen Platz und sein Abschnitt fehlt
    // stillschweigend.
    //
    // Nur Tiefe 1 unter einem Koerper: tiefer zu suchen wuerde bei
    // 'div.section' verschachtelte Treffer greifen und halbe Bloecke
    // herausreissen.
    function kandidaten(host) {
        var out = [];
        var i;
        for (i = 0; i < host.children.length; i++) {
            var c = host.children[i];
            if (c.classList && c.classList.contains('ds-sec')) continue;
            out.push(c);
        }
        var koerper = host.querySelectorAll(':scope > .ds-sec > .ds-sec-body');
        for (i = 0; i < koerper.length; i++) {
            var kids = koerper[i].children;
            for (var j = 0; j < kids.length; j++) out.push(kids[j]);
        }
        return out;
    }

    function sammle(host, muster) {
        var out = [];
        var kand = kandidaten(host);
        muster.forEach(function (m) {
            if (m === '__tiers__') {
                var t = findeTiers(host);
                if (t) out.push(t);
                return;
            }
            kand.forEach(function (c) {
                if (c.matches && c.matches(m) && out.indexOf(c) === -1) out.push(c);
            });
        });
        return out;
    }

    /* Eine leere Unterzeile ist keine Unterzeile.
       Seit dem 01.09.2026 haben drei Abschnitte keine mehr — sie
       wiederholten den Titel daneben. Das leere span stehen zu lassen
       kostet Abstand und liest sich als abgeschnittener Text; es wird
       deshalb ausgeblendet statt nur geleert. */
    function setzeUnterzeile(wurzel, text) {
        var el = wurzel.querySelector('.ds-sec-sub');
        if (!el) return;
        el.textContent = text || '';
        el.hidden = !text;
    }

    /* Die Kopfzeile traegt seit dem 10.09.2026 ZWEI Bedienelemente: den
       Klapp-Knopf und rechts daneben den Professor-Eich-Knopf, hinter
       dem die lange Erklaerung dieser Auswertung steht
       (js/ds-abschnitt-info.js).

       WARUM EINE ZEILE UM DEN KNOPF UND NICHT DER KNOPF IM KNOPF
       ----------------------------------------------------------
       .ds-sec-hd IST ein <button>. Ein zweiter <button> darin waere
       ungueltiges HTML und zwei ineinander geschachtelte
       Bedienelemente — Hilfsmittel geben das nicht verlaesslich aus.
       Nachgemessen in Chromium: `innerHTML` auf einem <button> LAESST
       den inneren <button> stehen (Kinder: SPAN.t, BUTTON.innen,
       SPAN.sub), es faellt also nicht auf. Genau deshalb steht es hier
       ausgeschrieben.

       Der Klapp-Knopf behaelt die ganze Breite (flex: 1), damit die
       Zeile weiter ueberall klickbar ist; der Info-Knopf sitzt am
       rechten Rand, immer an derselben Stelle. */
    function kopf(s, aufgeklappt) {
        var t = texte(s);
        var zeile = document.createElement('div');
        zeile.className = 'ds-sec-kopf';

        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ds-sec-hd';
        b.setAttribute('aria-expanded', String(aufgeklappt));
        b.innerHTML =
            '<span class="ds-sec-arrow" aria-hidden="true">▸</span>' +
            '<span class="ds-sec-t"></span>' +
            '<span class="ds-sec-sub"></span>';
        b.querySelector('.ds-sec-t').textContent = t[0];
        setzeUnterzeile(b, t[1]);
        zeile.appendChild(b);

        /* Der Platz fuer den Info-Knopf. Er bleibt LEER, solange fuer
           diesen Abschnitt nichts gemeldet wurde — `.ds-sec-info:empty`
           blendet ihn dann ganz aus. */
        var platz = document.createElement('span');
        platz.className = 'ds-sec-info';
        zeile.appendChild(platz);
        return zeile;
    }

    /* Nur die Knopfzeile neu zeichnen — NICHT den Abschnitt.
     *
     * Das ist die ganze Vorsicht dieser Funktion: die Inhalte wurden per
     * appendChild aus fremden Renderern VERSCHOBEN (siehe den Kopf
     * dieser Datei). Wer den Abschnitt neu baut, schneidet jeden
     * Ereignis-Handler ab, den app-tier-meta.js, app-current-meta.js und
     * app-meta-cards.js daran gehaengt haben. Geschrieben wird deshalb
     * ausschliesslich in das leere <span class="ds-sec-info">.
     *
     * Und geschrieben wird nur, wenn sich etwas geaendert hat. Der
     * Beobachter unten horcht auf childList im ganzen Teilbaum; ein
     * Schreiben bei jedem Durchlauf loeste die naechste Runde aus. Die
     * Marke haelt fest, was zuletzt drinstand: Abschnitt, ob gemeldet
     * ist, und die Sprache (der Knopf traegt eine uebersetzte
     * Beschriftung). Attribute beobachtet niemand, das Setzen der Marke
     * ist also still. */
    function zeichneInfoKnoepfe(host) {
        host = host || document.getElementById(HOST_ID);
        if (!host) return;
        var A = window.DsAbschnittInfo;
        SECTIONS.forEach(function (s) {
            var sec = host.querySelector('.ds-sec[data-sec="' + s.id + '"]');
            if (!sec) return;
            var platz = sec.querySelector('.ds-sec-info');
            if (!platz) return;
            var hat = !!(A && typeof A.hat === 'function' && A.hat(s.id));
            var marke = s.id + '|' + (hat ? '1' : '0') + '|' + (de() ? 'de' : 'en');
            if (platz.getAttribute('data-info-marke') === marke) return;
            platz.setAttribute('data-info-marke', marke);
            /* knopfHtml() gibt fuer einen Abschnitt ohne Meldung einen
               leeren String zurueck. Ein Knopf, der einen leeren Dialog
               oeffnet, waere schlimmer als kein Knopf. */
            platz.innerHTML = (hat && typeof A.knopfHtml === 'function')
                ? A.knopfHtml(s.id, texte(s)[0])
                : '';
        });
    }

    function zeichneReset(host) {
        var alt = document.getElementById('dsSecReset');
        // Ohne Zustand gibt es nichts zurueckzusetzen. Das passiert
        // wirklich: wer die Sprache wechselt, ohne current-meta je
        // geoeffnet zu haben, kommt hier mit offen === null an —
        // gemessen am 18.08.2026 auf past-meta und city-league,
        // TypeError: Cannot read properties of null (reading 'length').
        if (!offen) { if (alt) alt.remove(); return; }
        var std = standard();
        var gleich = offen.length === std.length && std.every(function (x) { return offen.indexOf(x) > -1; });
        if (gleich) { if (alt) alt.remove(); return; }
        var row = alt || document.createElement('div');
        row.id = 'dsSecReset';
        row.className = 'ds-sec-reset';
        row.innerHTML = '';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ds-sec-reset-btn';
        b.textContent = de() ? 'Ansicht zurücksetzen' : 'Reset view';
        b.addEventListener('click', function () {
            offen = standard();
            merken(offen);
            anwenden(host);
        });
        var n = document.createElement('span');
        n.className = 'ds-sec-reset-n';
        n.textContent = de()
            ? offen.length + ' von ' + SECTIONS.length + ' Abschnitten offen'
            : offen.length + ' of ' + SECTIONS.length + ' sections open';
        row.appendChild(b);
        row.appendChild(n);
        if (!alt) host.insertBefore(row, host.firstChild);
    }

    // Aufklappen, das man auch sieht.
    //
    // GEMESSEN am 19.08.2026 auf der Live-Seite, Fenster 1175 px hoch, mit
    // dem Kopf "Auf- und Absteiger" 44 px ueber der unteren Bildkante — die
    // Lage, in der man zwangslaeufig steht, wenn man die letzten drei
    // Abschnitte aufklappen will:
    //
    //     neuer Inhalt        692 px hoch
    //     davon sichtbar       44 px  =  6 %
    //     Seite gescrollt       0 px
    //
    // Sechs Prozent am unteren Rand sieht aus wie nichts. Darum den
    // Abschnitt nach dem Aufklappen an den oberen Bildrand holen — aber nur,
    // wenn er sonst nicht hineinpasst. Ein Sprung ohne Anlass stoert genauso
    // wie eine ausbleibende Reaktion.
    function insBild(sec) {
        if (!sec || typeof sec.getBoundingClientRect !== 'function') return;
        // Direkt nach dem Umschalten stimmt die Messung noch nicht.
        var rahmen = (typeof requestAnimationFrame === 'function')
            ? requestAnimationFrame
            : function (f) { setTimeout(f, 16); };
        rahmen(function () {
            var r = sec.getBoundingClientRect();
            var sicht = window.innerHeight || document.documentElement.clientHeight;
            if (r.top >= 0 && r.bottom <= sicht) return;   // passt ohnehin
            if (r.top >= 0 && r.top <= ABSTAND_OBEN) return;  // steht schon oben
            var ziel = (window.pageYOffset || document.documentElement.scrollTop || 0)
                     + r.top - ABSTAND_OBEN;
            if (ziel < 0) ziel = 0;
            var sanft = !(window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            try {
                window.scrollTo({ top: ziel, behavior: sanft ? 'smooth' : 'auto' });
            } catch (e) {
                window.scrollTo(0, ziel);
            }
        });
    }

    function anwenden(host) {
        host.querySelectorAll('.ds-sec').forEach(function (sec) {
            var auf = offen.indexOf(sec.getAttribute('data-sec')) > -1;
            sec.classList.toggle('is-open', auf);
            var hd = sec.querySelector('.ds-sec-hd');
            if (hd) hd.setAttribute('aria-expanded', String(auf));
        });
        zeichneReset(host);
    }

    // Schrittweise und wiederholbar.
    //
    // Der Inhalt entsteht aus drei Quellen zu verschiedenen Zeiten:
    // app-tier-meta.js, app-current-meta.js und app-meta-cards.js
    // schreiben nacheinander in denselben Host. Ein einmaliges
    // "fertig"-Kennzeichen war der erste Versuch und war falsch —
    // gemessen: auf dem Schreibtisch waren nach der ersten Welle vier
    // von neun Abschnitten gebaut und sieben Bloecke blieben fuer immer
    // draussen liegen, auf dem Telefon war zufaellig alles da.
    //
    // Diese Fassung laeuft so oft sie will: sie legt fehlende
    // Abschnitte an, holt nachgereichte Bloecke in ihren Abschnitt und
    // ruehrt nichts an, wenn nichts zu tun ist. Nur das Nichtstun macht
    // den Beobachter unten harmlos — sonst loeste jede eigene Aenderung
    // die naechste Runde aus.
    function sektionieren() {
        var host = document.getElementById(HOST_ID);
        if (!host) return false;
        if (!host.querySelector('.tier-hero-section, #matchupHeatmapContainer, .top-cards-container, #cm-tier-1')) {
            return false;
        }
        if (!offen) offen = gemerkt() || standard();

        // EINE Weiche am Host statt eines Handlers je Kopf.
        //
        // Der Grund steht in zwei fremden Zeilen:
        //     js/app-tier-meta.js:1041   content.innerHTML = html + content.innerHTML
        //     js/app-meta-cards.js:1406  currentMetaContent.innerHTML = container.innerHTML
        //
        // Die erste ist die heimtueckische. Sie liest den vorhandenen Inhalt
        // als Text zurueck und setzt ihn neu: das Markup der Abschnitte
        // ueberlebt Zeichen fuer Zeichen, jeder daran haengende Handler
        // nicht. Danach findet sektionieren() die Abschnitte vor, haelt sie
        // fuer fertig und haengt keinen neuen an. Ergebnis sind Koepfe, die
        // aussehen wie Knoepfe und keine mehr sind.
        //
        // GEMESSEN am 19.08.2026, lokal bei 1440 px, Klick auf
        // "Auf- und Absteiger": aria-expanded bleibt false, ds_sections_v1
        // bleibt leer, keine Reset-Zeile. Bei 390 px ging es, weil dort eine
        // andere Renderwelle zuletzt lief. Der Nutzer sitzt am Laptop — er
        // hat genau die kaputte Haelfte gesehen.
        //
        // Der Host selbst wird nie ersetzt, nur sein Inhalt. Ein Handler an
        // IHM ueberlebt jedes innerHTML darunter. Das Kennzeichen sorgt
        // dafuer, dass nicht bei jedem Durchlauf ein weiterer dazukommt.
        if (!host.__dsSecWeiche) {
            host.__dsSecWeiche = true;
            host.addEventListener('click', function (ev) {
                if (!ev.target || !ev.target.closest) return;
                /* DER INFO-KNOPF KLAPPT NICHTS.
                 *
                 * js/ds-abschnitt-info.js ruft in seinem eigenen
                 * Zuhoerer stopPropagation(). Das reicht hier NICHT:
                 * jener Zuhoerer haengt am `document`, diese Weiche am
                 * Host, und der Host liegt im Baum darunter. Ein Klick
                 * blubbert von unten nach oben — diese Weiche ist also
                 * zuerst dran, und wenn der andere die Weitergabe
                 * stoppt, ist hier laengst umgeschaltet.
                 *
                 * LIVE GEMESSEN (10.09.2026, Chromium 1440 x 900, echte
                 * Datei ueber einen lokalen Server, Klick auf den
                 * Info-Knopf des Abschnitts "heatmap"). Drei Faelle:
                 *
                 *   Knopf NEBEN dem Klapp-Knopf, ohne diese Zeile
                 *       aria-expanded true -> true, ds_sections_v1 leer
                 *   Knopf IM Klapp-Knopf, ohne diese Zeile
                 *       aria-expanded true -> FALSE,
                 *       ds_sections_v1 ["top","cards"] — zugeklappt
                 *   Knopf IM Klapp-Knopf, mit dieser Zeile
                 *       aria-expanded true -> true, ds_sections_v1 leer
                 *
                 * Der erste Fall ist der ausgelieferte: weil der Knopf
                 * ein GESCHWISTER von .ds-sec-hd ist, greift
                 * closest('.ds-sec-hd') schon nicht. Die Zeile ist
                 * damit heute wirkungslos — und steht trotzdem hier,
                 * weil der zweite Fall zeigt, was passiert, sobald
                 * jemand den Knopf in die Ueberschrift zieht: der
                 * Dialog geht auf UND der Abschnitt klappt zu, und das
                 * Zuklappen wird auch noch gespeichert. */
                if (ev.target.closest('[data-abschnitt-info]')) return;
                // Der Zuruecksetzen-Knopf haengt am selben Problem: er sitzt
                // im Host und verliert seinen Handler bei jedem fremden
                // innerHTML. Hier mitbehandelt, statt ihn spaeter einzeln
                // wiederzufinden.
                if (ev.target.closest('.ds-sec-reset-btn')) {
                    offen = standard();
                    merken(offen);
                    anwenden(host);
                    return;
                }
                var hd = ev.target.closest('.ds-sec-hd');
                if (!hd || !host.contains(hd)) return;
                var sec = hd.closest('.ds-sec');
                var id = sec && sec.getAttribute('data-sec');
                if (!id) return;
                if (!offen) offen = gemerkt() || standard();
                var jetzt = offen.indexOf(id) > -1;
                offen = jetzt ? offen.filter(function (x) { return x !== id; })
                              : offen.concat([id]);
                merken(offen);
                anwenden(host);
                if (!jetzt) insBild(sec);
            });
        }

        var geaendert = false;

        SECTIONS.forEach(function (s) {
            var teile = sammle(host, s.nimm);
            var sec = host.querySelector(':scope > .ds-sec[data-sec="' + s.id + '"]');

            if (!teile.length) return;                 // Block noch nicht da

            if (!sec) {
                sec = document.createElement('section');
                sec.className = 'ds-sec';
                sec.setAttribute('data-sec', s.id);
                var auf = offen.indexOf(s.id) > -1;
                var kopfzeile = kopf(s, auf);
                var body = document.createElement('div');
                body.className = 'ds-sec-body';
                sec.appendChild(kopfzeile);
                sec.appendChild(body);
                host.appendChild(sec);
                geaendert = true;
            }

            // VERSCHIEBEN, nicht neu erzeugen: appendChild haengt den
            // vorhandenen Knoten um und laesst jeden Ereignis-Handler
            // daran haengen. Ein innerHTML-Umweg schnitte sie alle
            // stillschweigend ab.
            var body2 = sec.querySelector('.ds-sec-body');
            teile.forEach(function (t) {
                if (t.parentElement === body2) return;
                // Guertel und Hosentraeger: ein Knoten, der das Ziel
                // enthaelt, darf niemals hinein. Das waere ein
                // HierarchyRequestError und wuerde den Rest der Runde
                // abbrechen.
                if (t.contains(body2)) return;
                body2.appendChild(t);
                geaendert = true;
            });
        });

        // Reihenfolge herstellen — aber nur, wenn sie abweicht.
        var soll = SECTIONS.map(function (s) { return s.id; })
            .filter(function (id) { return host.querySelector(':scope > .ds-sec[data-sec="' + id + '"]'); });
        var ist = [].slice.call(host.querySelectorAll(':scope > .ds-sec'))
            .map(function (e) { return e.getAttribute('data-sec'); });
        if (soll.join() !== ist.join()) {
            soll.forEach(function (id) {
                host.appendChild(host.querySelector(':scope > .ds-sec[data-sec="' + id + '"]'));
            });
            geaendert = true;
        }

        /* Immer, nicht nur bei `geaendert`: die Erklaerungen werden
           gemeldet, waehrend die Daten nachladen — ein Abschnitt, der
           laengst steht, bekommt seinen Knopf also spaeter. Die Funktion
           schreibt nur, wenn sich wirklich etwas geaendert hat, und
           schaukelt den Beobachter darum nicht auf. */
        zeichneInfoKnoepfe(host);

        if (geaendert) anwenden(host);
        return geaendert;
    }

    // Der Inhalt entsteht aus drei Quellen (app-tier-meta.js,
    // app-current-meta.js, app-meta-cards.js) und zu verschiedenen
    // Zeiten. Statt zu raten, wann alle fertig sind, wird beobachtet —
    // und die Marke MARK sorgt dafuer, dass zweimal Aufraeumen nichts
    // doppelt macht. Ersetzt eine Quelle den Inhalt komplett, faellt
    // die Marke mit weg und es wird neu sektioniert.
    function beobachte() {
        var host = document.getElementById(HOST_ID);
        if (!host) return;
        var timer = null;
        // subtree: true ist noetig, weil spaeter gerenderte Bloecke
        // nicht am Host landen, sondern in dem Abschnitt, neben dessen
        // Inhalt sie eingefuegt werden — live beobachtet an
        // .top-cards-container, das im "Ueberblick" strandete.
        //
        // Aufschaukeln kann es nicht: sektionieren() schreibt nur, wenn
        // es etwas zu tun gibt, und meldet das. Die zweite Runde findet
        // nichts, schreibt nichts, und danach ist Ruhe. Nachgemessen:
        // nach dem vollstaendigen Rendern laeuft es genau zweimal.
        new MutationObserver(function () {
            clearTimeout(timer);
            timer = setTimeout(sektionieren, 220);
        }).observe(host, { childList: true, subtree: true });
    }

    function neuBeschriften() {
        var host = document.getElementById(HOST_ID);
        if (!host) return;
        // Noch nie sektioniert: es gibt keine Ueberschriften, die neu
        // beschriftet werden koennten.
        if (!host.querySelector('.ds-sec')) return;
        SECTIONS.forEach(function (s) {
            var sec = host.querySelector('.ds-sec[data-sec="' + s.id + '"]');
            if (!sec) return;
            var t = texte(s);
            sec.querySelector('.ds-sec-t').textContent = t[0];
            setzeUnterzeile(sec, t[1]);
        });
        /* Der Info-Knopf traegt title und aria-label in der Sprache der
           Seite; ohne diesen Aufruf bliebe seine Beschriftung nach einem
           Sprachwechsel in der alten stehen. */
        zeichneInfoKnoepfe(host);
        zeichneReset(host);
    }

    function start() {
        sektionieren();
        beobachte();
        /* Die Erklaerungen kommen NACH dieser Datei — die Erzeuger
           melden sie erst, wenn ihre Daten da sind. Ohne diese Anmeldung
           bekaeme ein Abschnitt, der spaeter meldet, nie einen Knopf.
           Gezeichnet wird nur die Knopfzeile, nie der Abschnitt. */
        if (window.DsAbschnittInfo
            && typeof window.DsAbschnittInfo.beiAenderung === 'function') {
            window.DsAbschnittInfo.beiAenderung(function () {
                zeichneInfoKnoepfe();
            });
        }
        // i18n verschickt auf document und ohne bubbles — auf window
        // kaeme es nie an. Das war der Fehler aus Block 4.
        document.addEventListener('languageChanged', neuBeschriften);
        window.addEventListener('languageChanged', neuBeschriften);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.DsSections = {
        resektionieren: sektionieren,
        infoKnoepfe: zeichneInfoKnoepfe,
        abschnitte: function () { return SECTIONS.map(function (s) { return s.id; }); },
        zustand: function () { return (offen || []).slice(); }
    };
})();
