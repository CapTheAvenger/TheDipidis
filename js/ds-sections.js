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

    var SECTIONS = [
        { id: 'top',     auf: true,  nimm: ['section.tier-hero-section', 'div.ds-stat-row', 'div.tier-search-row'],
          de: ['Die stärksten Decks', 'Meta-Anteil und Top-8-Quote, mit Nenner'],
          en: ['The strongest decks', 'Share and top-8 rate, with denominators'] },
        // "Matchups untereinander — wer schlaegt wen, jede Zelle mit
        // Matchzahl" war eine Beschreibung der Tabelle, kein Titel. So
        // spricht in der Szene niemand, und die Zeile erklaerte etwas,
        // das die Tabelle darunter in einer Sekunde selbst zeigt.
        { id: 'heatmap', auf: true,  nimm: ['#matchupHeatmapContainer'],
          de: ['Matchups', 'wer schlägt wen'],
          en: ['Matchups', 'who beats whom'] },
        { id: 'cards',   auf: true,  nimm: ['div.top-cards-container'],
          de: ['Karten, die fast jedes Deck spielt', 'Format-Staples'],
          en: ['Cards nearly every deck plays', 'format staples'] },
        { id: 'ev',      auf: false, nimm: ['div.ds-ev-block'],
          de: ['Gegen welches Meta?', 'was dein Deck über ein ganzes Turnier holt'],
          en: ['Against which field?', 'what your deck scores across a whole tournament'] },
        { id: 'tiers',   auf: false, nimm: ['__tiers__'],
          de: ['Tier-Liste', 'alle Archetypen nach Stärke gruppiert'],
          en: ['Tier list', 'all archetypes grouped by strength'] },
        { id: 'rang',    auf: false, nimm: ['div.cm-rangliste-block'],
          de: ['Meta-Performance', 'Listen, Win Rate und Top-8-Quote je Deck — sortierbar'],
          en: ['Meta performance', 'lists, win rate and top-8 rate per deck — sortable'] },
        { id: 'movers',  auf: false, nimm: ['div.tier-movers-row', 'div.matchups-grid-container'],
          de: ['Auf- und Absteiger', 'Bewegung gegenüber der Vorwoche'],
          en: ['Climbers and fallers', 'movement against last week'] },
    ];

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    function texte(s) { return de() ? s.de : s.en; }

    function gemerkt() {
        try {
            var v = JSON.parse(localStorage.getItem(STORE));
            if (Array.isArray(v)) return v;
        } catch (e) { /* kein Speicher, kein Problem */ }
        return null;
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

    function kopf(s, aufgeklappt) {
        var t = texte(s);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ds-sec-hd';
        b.setAttribute('aria-expanded', String(aufgeklappt));
        b.innerHTML =
            '<span class="ds-sec-arrow" aria-hidden="true">▸</span>' +
            '<span class="ds-sec-t"></span>' +
            '<span class="ds-sec-sub"></span>';
        b.querySelector('.ds-sec-t').textContent = t[0];
        b.querySelector('.ds-sec-sub').textContent = t[1];
        return b;
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
                var hd = kopf(s, auf);
                var body = document.createElement('div');
                body.className = 'ds-sec-body';
                sec.appendChild(hd);
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
            sec.querySelector('.ds-sec-sub').textContent = t[1];
        });
        zeichneReset(host);
    }

    function start() {
        sektionieren();
        beobachte();
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
        zustand: function () { return (offen || []).slice(); }
    };
})();
