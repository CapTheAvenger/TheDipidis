/**
 * "Gegen welches Feld?" — der Erwartungswert eines Decks im heutigen Meta.
 *
 * Die Heatmap beantwortet "wer schlaegt wen". Die offene Frage davor ist
 * eine andere und wird vor jedem Turnier gestellt: wenn ich MIT DIESEM
 * DECK antrete und das Feld sieht aus wie jetzt — wie viele Partien
 * gewinne ich?
 *
 * Das ist kein neues Datum, sondern eine Gewichtung vorhandener:
 *
 *     EV = Σ_i  w_i · p_i
 *
 * p_i ist die geglaettete Quote gegen Deck i (js/matchup-glaettung.js,
 * k = 20), w_i sein Anteil im Feld, normiert auf die Gegner, zu denen
 * ueberhaupt Daten vorliegen.
 *
 * DREI DINGE, DIE HIER BEWUSST NICHT PASSIEREN:
 *
 * 1. Fehlende Paarungen werden NICHT als 50 % eingesetzt. 84 % aller
 *    Deck-Paare haben nie gegeneinander gespielt; wer sie mit 50 %
 *    auffuellt, zieht jedes Ergebnis zur Mitte und nennt das Praezision.
 *    Stattdessen wird ueber die abgedeckten Gegner normiert und die
 *    Abdeckung danebengeschrieben — bei 60 % Abdeckung ist die Zahl
 *    eine Aussage ueber 60 % des Feldes, und das muss man sehen.
 *
 * 2. Es gibt kein Ergebnis ohne Band. Die Beta-Varianz jeder Paarung
 *    (varianz() in js/matchup-glaettung.js) traegt mit w_i² bei:
 *
 *        Var(EV) = Σ_i  w_i² · Var_i        SD = √Var
 *
 *    Das Band ist ±1,96 SD. Es behandelt die Feldgewichte als bekannt —
 *    das sind sie nicht, deshalb ist es eher zu schmal als zu breit, und
 *    genau das steht auch in der Fussnote.
 *
 * 3. Die Punkte-Prognose ist eine Ableitung, keine zweite Messung:
 *    Runden × EV. Kein Turniermodell, keine Paarungslogik. Wer mehr
 *    behauptet, verkauft eine Simulation als Statistik.
 *
 * Vorbild ist Metagross-EV (reillycooper.com/metagross-ev, Quellcode
 * MIT). Uebernommen ist die Rechnung, nicht die Zahl: dort Trainer Hill,
 * hier Limitless Online. Zwei Quellen in einem Ergebnis zu mischen waere
 * ein Bruch der Hausregel — und in einem Feld, in dem dieselbe Paarung
 * je nach Quelle 8 Punkte auseinanderliegt, kein kleiner.
 *
 * Gebaut ausschliesslich aus den Bausteinen in css/components.css. Keine
 * neue CSS-Regel, kein !important. Das war die Abnahmebedingung der
 * Entwurfsphase und ist hier zum ersten Mal ein echter Test.
 */
(function () {
    'use strict';

    /* WELCHE KONVENTION HIER GERECHNET WIRD — nachgemessen, nicht geraten.
       quote() in js/matchup-glaettung.js rechnet (S + k/2) / (S + N + k):
       Unentschieden stehen NICHT im Nenner. Das ist `ohneUnentschieden`
       = S / (S + N) aus js/win-rate-konvention.js, geglaettet mit k = 20.
       Die Rohquoten kommen aus data/limitless_online_decks_matchups.csv,
       Feld win_rate — dieselbe Konvention (ueber alle 1.716 Zeilen gegen
       das Feld record nachgerechnet, groesste Abweichung 0,005 pp).
       Sie ist damit NICHT die Groesse, die Limitless "Win %" nennt; jene
       sind die Matchpunkte (3S + U) / (3n). Deshalb steht hier der Name
       der Konvention und nicht der Hausname "Win Rate".

       Der Name wird zur Laufzeit geholt, damit hier keine zweite
       Abschrift entsteht. Faellt js/win-rate-konvention.js aus, steht
       die Formel da — die ist immer richtig, ein Hausname nie. */
    var EV_KONVENTION = 'ohneUnentschieden';

    function quotenName(konvention) {
        var K = window.WinRateKonvention;
        if (K && typeof K.kurz === 'function') return K.kurz(konvention || EV_KONVENTION);
        return 'S / (S + N)';
    }

    /* Das Kuerzel fuer die enge Spaltenueberschrift. Es kommt aus
       demselben Modul wie der lange Name — ein abgeschriebenes Kuerzel
       stuende fuer irgendeine der drei Konventionen. Erlaubt ist es nur,
       weil unter der Tabelle eine Legende steht, die es aufloest
       (Hausregel seit 02.09.2026, tests/unit/test-sprache-win-rate.js).
       Faellt das Modul aus, steht dort die Formel — die ist immer
       richtig, ein Kuerzel nie. */
    function quotenKuerzel(konvention) {
        var K = window.WinRateKonvention;
        if (K && typeof K.kuerzel === 'function') {
            var k = K.kuerzel(konvention || EV_KONVENTION);
            if (k) return k;
        }
        return quotenFormel(konvention);
    }

    /* Der Formatschluessel fuer die Beschriftung des Meta-Bildes
       ("Ganzes Meta TEF–PBL"). Er kommt aus derselben Quelle wie ueberall
       sonst auf der Seite (data/format_window.json ueber
       window._formatWindow) — abgeschrieben waere er nach der naechsten
       Rotation falsch, und zwar still. */
    function metaSchluessel() {
        var fw = (typeof window !== 'undefined' && window._formatWindow) || {};
        var a = String(fw.oldest_legal_set || '').toUpperCase();
        var b = String(fw.current_set || '').toUpperCase();
        return (a && b) ? (a + '\u2013' + b) : '';
    }

    /* `formel` ist KEINE Funktion des Moduls, sondern ein Feld des
       Eintrags, den hol() liefert (js/win-rate-konvention.js:333 —
       exportiert sind hol/kurz/kuerzel/hinweis/kurzHinweis/bilanz/…). */
    function quotenFormel(konvention) {
        var K = window.WinRateKonvention;
        var e = (K && typeof K.hol === 'function') ? K.hol(konvention || EV_KONVENTION) : null;
        return (e && e.formel) ? e.formel : 'S / (S + N)';
    }

    function quotenHinweis(konvention) {
        return quotenName(konvention) + ' (' + quotenFormel(konvention) + ')'
            + ', geglaettet mit k = 20 (js/matchup-glaettung.js). Unentschieden'
            + ' stehen nicht im Nenner; das ist NICHT die Groesse, die'
            + ' Limitless "Win %" nennt.';
    }


    var HOST_ID = 'currentMetaContent';
    var BLOCK   = 'ds-ev-block';
    /* v2 seit dem 01.09.2026, und der Sprung ist der Zweck.
     *
     * Der Startwert der Rundenzahl ist von 9 auf 8 gefallen (siehe
     * RUNDEN_STD). Ein Startwert greift aber nur bei jemandem, der noch
     * nie hier war — wer den Rechner schon einmal geoeffnet hatte, trug
     * die 9 in localStorage und haette sie behalten. LIVE NACHGEMESSEN
     * am 01.09.2026 nach dem Deploy: die Seite zeigte weiter 9, obwohl
     * der Startwert auf 8 stand. Der Betreiber, der die Aenderung
     * gemeldet hat, gehoert zu genau dieser Gruppe — fuer ihn haette
     * sich nichts geaendert, und die Meldung waere zu Recht ein zweites
     * Mal gekommen.
     *
     * Ein neuer Schluessel setzt die gemerkte Wahl einmalig zurueck. Das
     * kostet jeden eine erneute Einstellung von Deck und Feldbild — der
     * Preis dafuer, dass die korrigierte Zahl auch bei denen ankommt,
     * die die Seite schon kennen. Wer weiter mit 9 Runden rechnet, traegt
     * sie einmal ein und behaelt sie. */
    var STORE   = 'ds_ev_wahl_v2';

    /* Die drei Meta-Bilder. "Ganzes Meta" ist die Messung; die beiden
       anderen sind Was-waere-wenn und als solche beschriftet.

       WORTWAHL (Betreiber, 11.09.2026): "Feld wird immer und ueberall als
       Meta bezeichnet." Stimmt — und in diesem Abschnitt stand bis dahin
       beides nebeneinander: die deutsche Ueberschrift sagte "Meta", die
       englische "field", die erste Auswahl "Das ganze Meta", ihre
       Erlaeuterung "the whole field". Ein Leser musste raten, ob das
       dasselbe ist. Es heisst jetzt durchgehend Meta / meta.

       ZUM NAMEN DER ZWEITEN: sie hiess einmal "Nur Top 8 Archetypes".
       Genommen werden aber die acht groessten Gegner MIT DATEN, nicht die
       acht groessten des Metas — bei 25 von 100 Decks ist das nicht
       dieselbe Menge, und 16 Decks haben ueberhaupt keine acht Gegner mit
       Daten, drei nur drei. Die Zahl steht deshalb im Namen, der Zusatz
       "mit Paarungsdaten" bleibt, und wenn es weniger als acht sind,
       sagt es die Zeile darunter. */
    var FELDER = [
        { id: 'alle',  de: 'Ganzes Meta',      en: 'The whole meta',
          deSub: 'alle Gegner, zu denen Paarungen vorliegen — jeder mit dem Anteil, '
               + 'den er im gemessenen Meta wirklich hat',
          enSub: 'every opponent we have pairings for — each weighted by the share it '
               + 'actually holds in the measured meta' },
        { id: 'top8',  de: 'Nur die 8 größten Gegner mit Paarungsdaten',
          en: 'Only the 8 largest opponents with pairing data',
          deSub: 'Was-wäre-wenn für einen harten Tisch: nur diese acht, untereinander gewichtet',
          enSub: 'what-if for a hard table: only those eight, weighted among themselves' },
        { id: 'gleich', de: 'Jedes Deck gleich oft', en: 'Every deck equally likely',
          deSub: 'Was-wäre-wenn: ignoriert den Anteil — zeigt die reine Kartenstärke',
          enSub: 'what-if: ignores share — shows raw matchup strength' },
    ];

    /* Acht, nicht neun.
     *
     * Neun war eine Annahme aus der Rundenformel grosser Turniere; sie
     * stimmt fuer Felder ab 513 Spielern. Gemeldet vom Betreiber am
     * 01.09.2026: "Fakt ist eins, dass wir auf Turnieren, wie gesagt,
     * immer 8 Runden spielen, deswegen muss hier die Kalkulation bitte
     * auf 8 Runden sein und nicht auf 9."
     *
     * Die Zahl ist ein Startwert, kein Gesetz — das Feld bleibt
     * aenderbar, und wer eine andere Zahl eintraegt, bekommt sie beim
     * naechsten Besuch wieder. Aber der Startwert soll das Turnier
     * abbilden, das dieser Nutzerkreis tatsaechlich spielt. */
    var RUNDEN_STD = 8;

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }
    function L(d, e) { return de() ? d : e; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function zahl(v, n) {
        if (v === null || v === undefined || !isFinite(v)) return '–';
        var d = (n === undefined) ? 1 : n;
        return Number(v).toLocaleString(de() ? 'de-DE' : 'en-GB',
            { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    function vorzeichen(v, n) {
        if (v === null || v === undefined || !isFinite(v)) return '–';
        return (v >= 0 ? '+' : '−') + zahl(Math.abs(v), n);
    }

    /* ── Rechnung ─────────────────────────────────────────────────── */

    /**
     * @param deck    Name des eigenen Decks
     * @param shares  { deckname: {share, count} } — Feldanteile
     * @param feld    'alle' | 'top8' | 'gleich'
     * @returns null, wenn zu diesem Deck keine einzige Paarung vorliegt
     */
    function rechne(deck, shares, feld) {
        var reg = (window._matchupRegistry || {})[deck];
        if (!reg) {
            /* Die Tier-Liste kleinschreibt ihre Decknamen. */
            var alle = window._matchupRegistry || {};
            var k = Object.keys(alle).find(function (x) {
                return x.toLowerCase() === String(deck).toLowerCase();
            });
            if (!k) return null;
            reg = alle[k];
        }
        var G = window.DsGlaettung;
        if (!G) return null;

        /* Anteil eines Gegners, unabhaengig von Gross-/Kleinschreibung. */
        var anteilVon = {};
        Object.keys(shares || {}).forEach(function (k2) {
            anteilVon[k2.toLowerCase()] = shares[k2];
        });

        var kandidaten = Object.keys(reg).map(function (gegner) {
            var e = reg[gegner];
            var s = anteilVon[String(gegner).toLowerCase()];
            var w = s && isFinite(s.share) ? s.share : 0;
            var siege = isFinite(e.wins) ? e.wins : G.bilanz(e.record).siege;
            var nied  = isFinite(e.losses) ? e.losses : G.bilanz(e.record).niederlagen;
            return {
                gegner: gegner,
                /* feldAnteil ist der gemessene Wert und wird nie angefasst.
                   anteil ist die Gewichtungsgrundlage und darf vom
                   gewaehlten Feldbild ueberschrieben werden. Beides in
                   einem Feld zu fuehren war der erste Entwurf — dann
                   meldete 'Jedes Deck gleich oft' eine Abdeckung von
                   400 %, weil die Abdeckung auf denselben Zahlen sass. */
                feldAnteil: w,
                anteil: w,
                partien: parseInt(e.total_games, 10) || 0,
                siege: siege,
                niederlagen: nied,
                quote: isFinite(Number(e.win_rate_shrunk))
                    ? Number(e.win_rate_shrunk) : G.quote(siege, nied),
                roh: Number(e.win_rate_numeric) || 0,
                varianz: G.varianz(siege, nied),
            };
        });

        /* Das gewaehlte Feldbild bestimmt nur die Gewichte, nie die
           Quoten. Deshalb steht die Auswahl hier und nicht weiter oben. */
        var genommen = kandidaten.filter(function (k3) { return k3.anteil > 0; });
        if (feld === 'top8') {
            genommen = genommen.slice().sort(function (a, b) { return b.anteil - a.anteil; }).slice(0, 8);
        } else if (feld === 'gleich') {
            genommen = kandidaten.slice();
            genommen.forEach(function (k4) { k4.anteil = 1; });
        }

        var summe = genommen.reduce(function (s, k5) { return s + k5.anteil; }, 0);
        if (!genommen.length || summe <= 0) return null;

        genommen.forEach(function (k6) { k6.gewicht = k6.anteil / summe; });

        var ev = genommen.reduce(function (s, k7) { return s + k7.gewicht * k7.quote; }, 0);
        /* Varianz in Anteilen, EV in Prozent — deshalb der Faktor 100
           erst auf der Standardabweichung. */
        var varSumme = genommen.reduce(function (s, k8) {
            return s + k8.gewicht * k8.gewicht * k8.varianz;
        }, 0);
        var sd = Math.sqrt(varSumme) * 100;

        /* Abdeckung IMMER gegen das echte Feld, auch bei 'gleich' und
           'top8' — sonst behauptet die Zahl eine Vollstaendigkeit, die
           nur aus der eigenen Auswahl stammt. */
        var feldSumme = Object.keys(shares || {}).reduce(function (s, k9) {
            var v = shares[k9];
            return s + (v && isFinite(v.share) ? v.share : 0);
        }, 0);
        var abgedeckt = kandidaten.reduce(function (s, k10) { return s + k10.feldAnteil; }, 0);
        /* Was in DIESE Rechnung eingeht, ist bei 'top8' etwas anderes als
           das, was abgedeckt waere: acht Gegner statt aller, gemessen
           48,5 % statt 77 %. Die Kachel "Wovon die Zahl kommt" nannte
           trotzdem beide Male 77 % — sie beantwortete eine andere Frage
           als ihre Rolle behauptet. Beide Zahlen stehen jetzt da. */
        var gerechnet = genommen.reduce(function (s, k14) { return s + (k14.feldAnteil || 0); }, 0);

        genommen.forEach(function (k11) {
            k11.beitrag = k11.gewicht * (k11.quote - 50);
        });
        genommen.sort(function (a, b) { return b.beitrag - a.beitrag; });

        return {
            deck: deck,
            ev: ev,
            sd: sd,
            unten: Math.max(0, ev - 1.96 * sd),
            oben: Math.min(100, ev + 1.96 * sd),
            zeilen: genommen,
            gegner: genommen.length,
            abdeckung: feldSumme > 0 ? (abgedeckt / feldSumme) * 100 : 0,
            gerechnet: feldSumme > 0 ? (gerechnet / feldSumme) * 100 : 0,
            feldbild: feld,
            duenn: genommen.filter(function (k12) { return k12.partien < 20; }).length,
            partien: genommen.reduce(function (s, k13) { return s + k13.partien; }, 0),
        };
    }

    /* ── Darstellung ──────────────────────────────────────────────── */

    function wahl() {
        try {
            var v = JSON.parse(localStorage.getItem(STORE));
            if (v && typeof v === 'object') return v;
        } catch (e) { /* kein Speicher, kein Problem */ }
        return {};
    }
    function merke(v) {
        try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) {}
    }

    /**
     * Die zwei Zeilen ueber der Tabelle: worauf du dich vorbereiten
     * solltest, und was fuer dich laeuft.
     *
     * WARUM SIE DIE SPALTEN "traegt bei" UND "Punkte" ERSETZEN
     * -------------------------------------------------------
     * Betreiber am 11.09.2026: "Traegt bei, da ist jetzt son komisches
     * Diagramm, versteh ich nicht, brauch ich nicht. Und Punkte versteh
     * ich nicht, brauch ich auch nicht. Also das soll ja irgendwie eine
     * tiefen Analyse sein, um sich son bisschen vorzubereiten."
     *
     * Die Groesse dahinter war richtig und heisst `beitrag`:
     * Anteil x (Quote - 50). Sie beantwortet "welche Paarung zieht mein
     * Ergebnis am staerksten" — das ist genau die Vorbereitungsfrage.
     * Falsch war nur, sie als Zahl mit zwei Nachkommastellen und einen
     * Balken ohne Skala hinzustellen: beides sagt einem Leser nichts.
     *
     * Hier wird dieselbe Groesse benutzt, aber nie gezeigt. Sie sortiert
     * nur, und was dasteht, sind die Zahlen, die der Leser ohnehin
     * versteht: wie oft du dem Deck begegnest und wie du gegen es stehst.
     *
     * Gezeigt werden hoechstens drei je Seite, und nur Paarungen, die
     * ueberhaupt in eine Richtung ziehen (Quote != 50). Ein Deck, gegen
     * das es 50:50 steht, gehoert in keine der beiden Zeilen.
     */
    var VORBEREITUNG_MAX = 3;

    function vorbereitungHtml(zeilen) {
        if (!zeilen || !zeilen.length) return '';

        function satz(liste) {
            return liste.map(function (z) {
                return '<strong>' + esc(z.gegner) + '</strong> ('
                     + esc(quotenKuerzel()) + ' ' + esc(zahl(z.quote, 0)) + ' %, '
                     + esc(zahl(z.gewicht * 100, 1)) + ' %)';
            }).join(', ');
        }

        /* Eigene Kopie, eigene Sortierung. Die Tabelle darunter steht
           nach "wie oft"; sich auf deren Reihenfolge zu verlassen waere
           genau die stille Kopplung, die diesen Abschnitt schon einmal
           auseinandergebracht hat. */
        var nachBeitrag = zeilen.slice().sort(function (a, b) {
            return b.beitrag - a.beitrag;
        });
        var schlecht = nachBeitrag.filter(function (z) { return z.beitrag < 0; })
                                  .slice(-VORBEREITUNG_MAX).reverse();
        var gut = nachBeitrag.filter(function (z) { return z.beitrag > 0; })
                             .slice(0, VORBEREITUNG_MAX);

        var teile = [];
        if (schlecht.length) {
            teile.push('<p class="ds-note ds-ev-warauf"><span class="ds-stat-label">'
                + esc(L('Darauf vorbereiten', 'Prepare for these')) + '</span> '
                + satz(schlecht) + '</p>');
        }
        if (gut.length) {
            teile.push('<p class="ds-note ds-ev-laeuft"><span class="ds-stat-label">'
                + esc(L('Das läuft für dich', 'These run in your favour')) + '</span> '
                + satz(gut) + '</p>');
        }
        if (!teile.length) return '';
        /* Die Klammerzahlen brauchen dieselbe Aufloesung wie die Tabelle
           darunter — sonst steht hier ein Kuerzel ohne Legende. */
        teile.push('<p class="ds-note ds-ev-vorblegende">' + esc(L(
            'In Klammern: ' + quotenKuerzel() + ' gegen dieses Deck und wie oft du ihm '
              + 'in diesem Meta-Bild begegnest. Sortiert danach, wie stark die Paarung '
              + 'dein Ergebnis zieht — also beides zusammen, nicht nur die Quote.',
            'In brackets: ' + quotenKuerzel() + ' against that deck and how often you meet it in '
              + 'this picture of the meta. Sorted by how strongly the pairing pulls your '
              + 'result — both together, not one of the two alone.')) + '</p>');
        return teile.join('');
    }

    function ergebnisHtml(r, runden) {
        if (!r) {
            return '<p class="ds-note">' + esc(L(
                'Zu diesem Deck liegen keine Paarungen vor — für das Meta, das wir messen, hat es noch nicht gespielt.',
                'No matchups on record for this deck yet.')) + '</p>';
        }
        var siege = (r.ev / 100) * runden;
        var siegeUnten = (r.unten / 100) * runden;
        var siegeOben  = (r.oben / 100) * runden;
        /* Nur zeigen, wenn die Rechnung wirklich auf einem engeren
           Ausschnitt steht als die Abdeckung behauptet. Bei "Jedes Deck
           gleich oft" sind die Gewichte ohnehin kuenstlich, und die Zeile
           unter der Auswahl sagt das. */
        var engerAusschnitt = isFinite(r.gerechnet)
            && r.gerechnet > 0 && (r.abdeckung - r.gerechnet) >= 1;

        /* Eine duenne Rechnung sieht aus wie eine dicke (20.08.2026).

           Das Unsicherheitsband unter der Zahl ist rechnerisch in Ordnung —
           es traegt die Varianz jedes Gegners gewichtet weiter. Aber die
           Zahl selbst steht in derselben Groesse da, ob 11 Partien oder
           5.000 dahinterstehen, und ein Band liest sich anders als eine
           Warnung. Gemeldet wurde genau dieser Fall: 51,0 % aus 11 Partien
           bei 16 % Meta-Abdeckung.

           Die Kachel bekommt deshalb einen Vorbehalt an der Rolle, wenn
           entweder zu wenige Partien gezaehlt oder zu wenig Feld gerechnet
           wurde. 30 Partien ist bewusst niedrig angesetzt: es geht nicht
           darum, die Zahl zu verstecken, sondern darum, dass sie nicht
           aussieht wie eine gesicherte. */
        var EV_MIN_PARTIEN = 30;
        var EV_MIN_ABDECKUNG = 25;
        var evDuenn = (r.partien > 0 && r.partien < EV_MIN_PARTIEN)
            || (isFinite(r.abdeckung) && r.abdeckung > 0 && r.abdeckung < EV_MIN_ABDECKUNG);
        var evDuennText = evDuenn
            ? L(' · dünne Grundlage', ' · thin basis')
            : '';
        var evDuennTitel = evDuenn
            ? L('Weniger als ' + EV_MIN_PARTIEN + ' gezählte Matches oder unter '
                + EV_MIN_ABDECKUNG + ' % Meta-Abdeckung. Die Zahl steht da, aber das '
                + 'Unsicherheitsband darunter ist hier der wichtigere Teil.',
                'Fewer than ' + EV_MIN_PARTIEN + ' games counted, or under '
                + EV_MIN_ABDECKUNG + ' % meta coverage. The number is shown, but the '
                + 'uncertainty band below it is the part that matters here.')
            : '';

        var kacheln =
            '<div class="ds-stat-row">'
            + '<div class="ds-stat ' + (r.ev >= 50 ? 'is-pos' : 'is-neg')
              + (evDuenn ? ' is-duenn' : '') + '"'
              + (evDuenn ? ' title="' + esc(evDuennTitel) + '"' : '') + '>'
              + '<span class="ds-stat-role">'
              + esc(L('gegen dieses Meta', 'against this meta') + evDuennText) + '</span>'
              + '<span class="ds-stat-label">' + esc(L('Erwartete ' + quotenName(), 'Expected ' + quotenName())) + '</span>'
              + '<span class="ds-stat-value">' + esc(zahl(r.ev, 1)) + '<span class="ds-stat-unit"> %</span></span>'
              + '<span class="ds-stat-context">' + esc(L(
                  'Unsicherheitsband ' + zahl(r.unten, 1) + ' bis ' + zahl(r.oben, 1) + ' %',
                  'uncertainty band ' + zahl(r.unten, 1) + ' to ' + zahl(r.oben, 1) + ' %'))
              + '</span>'
            + '</div>'
            + '<div class="ds-stat">'
              + '<span class="ds-stat-role">' + esc(L('bei ' + runden + ' Runden', 'over ' + runden + ' rounds')) + '</span>'
              + '<span class="ds-stat-label">' + esc(L('Erwartete Siege', 'Expected wins')) + '</span>'
              + '<span class="ds-stat-value">' + esc(zahl(siege, 1)) + '</span>'
              + '<span class="ds-stat-context">' + esc(L(
                  zahl(siegeUnten, 1) + ' bis ' + zahl(siegeOben, 1) + ' Siege · Runden × ' + quotenName() + ', kein Turniermodell',
                  zahl(siegeUnten, 1) + ' to ' + zahl(siegeOben, 1) + ' wins · rounds × ' + quotenName() + ', not a tournament model'))
              + '</span>'
            + '</div>'
            + '<div class="ds-stat">'
              + '<span class="ds-stat-role">' + esc(L('Wovon die Zahl kommt', 'What the number rests on')) + '</span>'
              + '<span class="ds-stat-label">' + esc(L('Abdeckung des Metas', 'Meta coverage')) + '</span>'
              + '<span class="ds-stat-value">' + esc(zahl(r.abdeckung, 0)) + '<span class="ds-stat-unit"> %</span></span>'
              + '<span class="ds-stat-context">' + esc(L(
                  r.gegner + ' Gegner-Decks · ' + r.partien.toLocaleString('de-DE') + ' gezählte Matches'
                    + (r.duenn ? ' · ' + r.duenn + ' davon unter 20 Matches' : '')
                    + (engerAusschnitt
                        ? ' · in dieser Rechnung nur ' + zahl(r.gerechnet, 1) + ' % des Metas'
                        : ''),
                  r.gegner + ' opponent decks · ' + r.partien.toLocaleString('en-GB') + ' games counted'
                    + (r.duenn ? ' · ' + r.duenn + ' of them under 20 games' : '')
                    + (engerAusschnitt
                        ? ' · this calculation uses only ' + zahl(r.gerechnet, 1) + ' % of the meta'
                        : '')))
              + '</span>'
            + '</div>'
            + '</div>';

        /* SORTIERT NACH "wie oft" — nicht mehr nach dem Beitrag.
           Bis zum 11.09.2026 stand die Tabelle in der Reihenfolge der
           Spalte "Punkte". Die ist weggefallen, und damit waere die
           Reihenfolge eine, die der Leser nirgends mehr ablesen kann:
           Crustle stuende auf Platz 4, obwohl es 1,6 % des Metas ist.
           Eine Sortierung, deren Schluessel nicht in der Tabelle steht,
           sieht aus wie keine. Jetzt steht oben, wem man am haeufigsten
           begegnet — und wer am staerksten zieht, steht in den zwei
           Zeilen darueber. */
        var zeilen = r.zeilen.slice().sort(function (a, b) {
            return b.gewicht - a.gewicht;
        }).map(function (z) {
            return '<tr class="' + (z.partien < 20 ? 'is-muted' : '') + '">'
                 + '<td>' + esc(z.gegner) + '</td>'
                 + '<td class="ds-num">' + esc(zahl(z.gewicht * 100, 1)) + ' %</td>'
                 + '<td class="ds-num">' + esc(zahl(z.quote, 1)) + ' %</td>'
                 + '<td class="ds-num">' + esc(String(z.partien)) + '</td>'
                 + '</tr>';
        }).join('');

        /* VIER SPALTEN, DAZU EINE LEGENDE — und warum nicht mehr.
           Die Tabelle trug bis zum 11.09.2026 sechs Spalten, zwei davon
           hat der Betreiber als unverstaendlich gemeldet ("trägt bei",
           "Punkte"). Was sie zeigten, steht jetzt als Satz ueber der
           Tabelle (vorbereitungHtml) — dieselbe Groesse, nur lesbar.

           Die drei verbliebenen Zahlenspalten tragen Kuerzel. Das ist
           erlaubt, weil die Legende direkt darunter sie aufloest — die
           Hausregel dazu (tests/unit/test-sprache-win-rate.js) hat der
           Betreiber am 02.09.2026 selbst vorgeschlagen, und die
           Matchup-Tabelle der Archetyp-Karte haelt es genauso.

           "wie oft" statt frueher "Gewicht hier": gerendert wird der
           Anteil unter den GERECHNETEN Gegnern, auf 100 % normiert. Das
           ist genau die Frage, die der Betreiber dazu gestellt hat
           ("Geht's darum, wie oft man erwartet es zu treffen?") — ja,
           innerhalb dieses Meta-Bildes. Der gemessene Meta-Anteil des
           Decks steht in der Meta-Performance-Tabelle und kann davon
           abweichen; die Legende sagt das. */
        var tabelle =
            '<div class="mobile-table-scroll">'
            + '<table class="ds-table ds-ev-tabelle">'
            + '<thead><tr>'
              + '<th>' + esc(L('Gegner-Deck', 'Opponent deck')) + '</th>'
              + '<th class="ds-num" title="' + esc(L(
                  'Anteil unter den Gegnern, mit denen hier gerechnet wird — auf 100 % normiert, weil '
                    + 'fehlende Paarungen weggelassen statt mit 50 % aufgefüllt werden. Der gemessene '
                    + 'Meta-Anteil dieses Decks steht in der Meta-Performance-Tabelle.',
                  'Share among the opponents this calculation uses — normalised to 100 % because missing '
                    + 'pairings are left out rather than filled in at 50 %. The measured meta share '
                    + 'is in the meta performance table.'))
                + '">' + esc(L('wie oft', 'how often')) + '</th>'
              + '<th class="ds-num" title="' + esc(L(
                  quotenHinweis() + ' Ein 3-0 zählt hier deshalb nicht als 100 %.',
                  quotenHinweis() + ' A 3-0 therefore does not count as 100 % here.'))
                + '">' + esc(quotenKuerzel()) + '</th>'
              + '<th class="ds-num" title="' + esc(L(
                  'Gezählte Matches zwischen deinem Deck und diesem Gegner. Darauf beruht die Quote daneben.',
                  'Games counted between your deck and this opponent. The rate next to it rests on them.'))
                + '">' + esc(L('M', 'G')) + '</th>'
            + '</tr></thead>'
            + '<tbody>' + zeilen + '</tbody>'
            + '</table></div>'
            + '<p class="ds-note ds-ev-legende">' + esc(L(
                'wie oft = Anteil dieses Gegners an den Runden, mit denen hier gerechnet wird · '
                  + quotenKuerzel() + ' = ' + quotenName() + ', ' + quotenFormel() + ' · '
                  + 'M = gezählte Matches, auf denen diese Quote beruht. '
                  + 'Blasse Zeilen stehen auf weniger als 20 Matches.',
                'how often = this opponent\u2019s share of the rounds this calculation uses · '
                  + quotenKuerzel() + ' = ' + quotenName() + ', ' + quotenFormel() + ' · '
                  + 'G = games counted behind that rate. '
                  + 'Faded rows rest on fewer than 20 games.'))
            + '</p>';

        return kacheln + vorbereitungHtml(r.zeilen) + tabelle;
    }

    function rahmenHtml(decks, gewaehlt, feld, runden) {
        var deckOpt = decks.map(function (d) {
            return '<option value="' + esc(d) + '"' + (d === gewaehlt ? ' selected' : '') + '>'
                 + esc(d) + '</option>';
        }).join('');
        /* Nur der kurze Name in die Auswahl. Die Erlaeuterung stand
           zuerst mit im <option>-Text — auf 390 px war davon
           "Das ganze Meta — gewichtet nach geme…" uebrig, und der Teil,
           der etwas erklaert, war genau der abgeschnittene. Sie steht
           jetzt als Zeile unter der Auswahl und wechselt mit ihr. */
        var feldOpt = FELDER.map(function (f) {
            return '<option value="' + f.id + '"' + (f.id === feld ? ' selected' : '') + '>'
                 + esc(de() ? f.de : f.en) + '</option>';
        }).join('');

        /* Der Erklaersatz wandert hinter den Info-Knopf der
           Abschnittsueberschrift (10.09.2026). Er nennt den Hausnamen
           der Quote zur Laufzeit (quotenName()) — deshalb gemeldet und
           nicht abgeschrieben. Ohne Register bleibt er stehen, wo er
           war: eine Erklaerung ersatzlos zu verlieren waere schlimmer
           als eine Zeile zu viel. */
        var evText = L(
            'Die Heatmap sagt, wer wen schlägt. Hier steht, was daraus für <em>dich</em> folgt: '
            + 'du wählst dein Deck, und die Seite gewichtet jede Paarung mit dem Anteil, den der '
            + 'Gegner im Meta hat. Heraus kommt die ' + quotenName() + ', mit der du über ein ganzes Turnier '
            + 'rechnen kannst — nicht gegen ein Deck, sondern gegen alle auf einmal.',
            'The heatmap says who beats whom. This says what that means for <em>you</em>: pick your '
            + 'deck and every matchup is weighted by how much of the meta that opponent is. The '
            + 'result is the ' + quotenName() + ' to expect across a whole tournament — not against one deck, '
            + 'but against all of them at once.');
        var evGemeldet = false;
        if (typeof window !== 'undefined' && window.DsAbschnittInfo) {
            window.DsAbschnittInfo.melde('ev', {
                titel: L('Dein Deck gegen das Meta', 'Your deck vs. the meta'),
                html: '<p>' + evText + '</p>'
            });
            evGemeldet = true;
        }

        return ''
        /* Die eigene Ueberschrift ist am 11.09.2026 weggefallen.
           Der Abschnitt traegt seit der Umstellung auf ds-sections.js
           bereits eine Ueberschrift ("Dein Deck gegen das Meta"); diese
           hier stand direkt darunter und sagte fast dasselbe noch einmal.
           Betreiber: "der Untertext gegen welches Meta kann weg, das
           ergibt doch an der Stelle keinen erhoehten Mehrwert."

           Der Rueckfall bleibt: ohne ds-sections (alte Ansicht, Test,
           kaputtes Register) gaebe es sonst gar keine Ueberschrift. */
        + '<div class="ds-panel ' + BLOCK + '">'
        + (evGemeldet ? '' : '<h3 class="ds-label">🎯 '
            + esc(L('Dein Deck gegen das Meta', 'Your deck vs. the meta')) + '</h3>')
        + (evGemeldet ? '' : '<p class="ds-note">' + evText + '</p>')
        + '<div class="ds-controls">'
          + '<label class="ds-field is-wide"><span class="ds-stat-label">'
            + esc(L('Dein Deck', 'Your deck')) + '</span>'
            + '<select class="ds-select ds-ev-deck">' + deckOpt + '</select></label>'
          + '<label class="ds-field is-wide"><span class="ds-stat-label">'
            + esc(L('Das Meta', 'The meta')) + '</span>'
            + '<select class="ds-select ds-ev-feldwahl">' + feldOpt + '</select></label>'
          + '<label class="ds-field is-narrow"><span class="ds-stat-label">'
            + esc(L('Runden', 'Rounds')) + '</span>'
            + '<input class="ds-number ds-ev-runden" type="number" min="1" max="20" step="1" value="'
            + runden + '"></label>'
        + '</div>'
        + '<p class="ds-note ds-ev-feldnote"></p>'
        + '<div class="ds-ev-ergebnis"></div>'
        + '<p class="ds-note ds-ev-fuss"></p>'
        + '</div>';
    }

    function fussHtml(r) {
        if (!r) return '';
        return L(
            'Gerechnet wird <strong>Anteil × ' + quotenName() + '</strong> (' + quotenFormel() + '), aufsummiert über alle Gegner, zu denen '
            + 'Daten vorliegen. Die Quoten sind geglättet (Beta-Binomial, k = 20), damit ein 3-0 nicht '
            + 'als 100 % durchgeht. Das Band ist ±1,96 Standardabweichungen aus der Streuung der '
            + 'einzelnen Paarungen; es nimmt die Meta-Anteile als bekannt an und ist deshalb eher zu '
            + 'schmal als zu breit. Paarungen ohne Daten werden weggelassen, nicht mit 50 % aufgefüllt '
            + '— darum steht die Abdeckung daneben. Datenraum: Global/EN, Limitless Online.',
            'The sum is <strong>share × ' + quotenName() + '</strong> (' + quotenFormel() + ') over every opponent we have data for. Rates '
            + 'are smoothed (beta-binomial, k = 20) so a 3-0 does not pass as 100 %. The band is ±1.96 '
            + 'standard deviations from the spread of the individual matchups; it treats the meta '
            + 'shares as known and is therefore narrow rather than wide. Pairings without data are '
            + 'left out, not filled in at 50 % — which is why coverage is stated. Data space: '
            + 'Global/EN, Limitless Online.');
    }

    function zeichne(block, shares) {
        var deck   = block.querySelector('.ds-ev-deck').value;
        var feld   = block.querySelector('.ds-ev-feldwahl').value;
        var rEl    = block.querySelector('.ds-ev-runden');
        var runden = Math.max(1, Math.min(20, parseInt(rEl.value, 10) || RUNDEN_STD));
        if (String(runden) !== rEl.value) rEl.value = runden;

        var f = FELDER.filter(function (x) { return x.id === feld; })[0] || FELDER[0];
        var r = rechne(deck, shares, feld);
        var sub = (de() ? f.deSub : f.enSub);
        if (feld === 'top8' && r && r.gegner < 8) {
            sub = de()
                ? 'nur ' + r.gegner + ' Gegner haben Paarungen mit diesem Deck — mehr gibt es nicht'
                : 'only ' + r.gegner + ' opponents have pairings with this deck — there are no more';
        }
        /* Der Formatschluessel gehoert an das GEMESSENE Meta-Bild, nicht
           an die beiden Was-waere-wenn. Betreiber am 11.09.2026: "hier
           steht jetzt zwar das ganze Meta, aber was genau heisst es?"
           Ab jetzt: "Ganzes Meta TEF–PBL — alle Gegner, zu denen …".
           Fehlt window._formatWindow (frueher Ladezustand), bleibt der
           Name ohne Schluessel stehen statt mit einem falschen. */
        var name = (de() ? f.de : f.en);
        if (feld === 'alle') {
            var schluessel = metaSchluessel();
            if (schluessel) name += ' ' + schluessel;
        }
        block.querySelector('.ds-ev-feldnote').textContent = name + ' — ' + sub + '.';

        block.querySelector('.ds-ev-ergebnis').innerHTML = ergebnisHtml(r, runden);
        block.querySelector('.ds-ev-fuss').innerHTML = fussHtml(r);
        merke({ deck: deck, feld: feld, runden: runden });
    }

    /* ── Einhängen ────────────────────────────────────────────────── */

    /* Nur "laeuft gerade", nicht "war schon mal da": ob der Block
       existiert, sagt der Baum, und nur der. Eine Merkvariable dafuer
       waere falsch, sobald app-meta-cards.js den Inhalt der Meta-Ansicht
       ueber innerHTML ersetzt — dann ist der Block weg, die Variable
       sagt weiter "gebaut", und der Abschnitt bliebe fuer den Rest der
       Sitzung leer. */
    var _baut = false;

    /* Die Feldanteile liegen beim Bauen vor, gebraucht werden sie bei
       jedem Klick. Weil die Bedienung ueber das Dokument delegiert wird
       (siehe unten), muss der Handler sie irgendwo finden. */
    var _shares = null;

    /* EINMAL am Dokument, nicht am Block.
     *
     * Der Block hing seine beiden Handler an sich selbst. Das haelt genau
     * so lange, bis jemand den Inhalt der Meta-Ansicht als Text neu setzt
     * — und das passiert: js/app-meta-cards.js ersetzt
     * currentMetaContent.innerHTML, js/app-tier-meta.js liest an einer
     * Stelle den vorhandenen Inhalt zurueck und schreibt ihn wieder hin.
     * Das Markup ueberlebt Zeichen fuer Zeichen, jeder daran haengende
     * Handler nicht. js/ds-sections.js traegt denselben Befund schon im
     * Kopfkommentar und loest ihn genauso.
     *
     * Gemessen am 20.08.2026 im Browser: Deckwahl, Feldbild und
     * Rundenzahl waren allesamt tot — die Auswahl sprang um, die Zahlen
     * darunter blieben stehen. Der Block war seit dem 20.08. 05:49 live.
     *
     * Delegation am Dokument ueberlebt jedes innerHTML darunter, weil das
     * Dokument selbst nie ersetzt wird.
     */
    var _delegiert = false;
    function delegiere() {
        if (_delegiert) return;
        _delegiert = true;
        var reagiere = function (e) {
            var ziel = e.target;
            if (!ziel || typeof ziel.closest !== 'function') return;
            var block = ziel.closest('.' + BLOCK);
            if (!block || !_shares) return;
            if (e.type === 'input' && !ziel.classList.contains('ds-ev-runden')) return;
            zeichne(block, _shares);
        };
        document.addEventListener('change', reagiere);
        document.addEventListener('input', reagiere);
    }

    function baue() {
        var host = document.getElementById(HOST_ID);
        if (!host) return Promise.resolve(false);
        if (host.querySelector('.' + BLOCK)) return Promise.resolve(false);
        if (_baut) return Promise.resolve(false);   // Aufbau laeuft schon
        if (!window._matchupRegistry || !Object.keys(window._matchupRegistry).length) {
            return Promise.resolve(false);          // Register noch nicht da
        }
        if (typeof window.getArchetypeShares !== 'function') return Promise.resolve(false);

        _baut = true;
        return window.getArchetypeShares().then(function (shares) {
            _shares = shares;
            var reg = window._matchupRegistry || {};
            /* Auswahlliste nach Feldanteil, nicht alphabetisch: das
               meistgespielte Deck steht oben, weil es am haeufigsten
               gesucht wird. */
            var anteilVon = {};
            Object.keys(shares || {}).forEach(function (k) {
                anteilVon[k.toLowerCase()] = (shares[k] && shares[k].share) || 0;
            });
            var decks = Object.keys(reg).sort(function (a, b) {
                var d = (anteilVon[b.toLowerCase()] || 0) - (anteilVon[a.toLowerCase()] || 0);
                return d !== 0 ? d : a.localeCompare(b);
            });
            if (!decks.length) { _baut = false; return false; }
            /* Zwischen dem Aufruf und hier liegt ein await. Wenn in der
               Zeit jemand anders gebaut hat, nicht zweimal. */
            if (host.querySelector('.' + BLOCK)) { _baut = false; return false; }

            var w = wahl();
            var deck = decks.indexOf(w.deck) > -1 ? w.deck : decks[0];
            var feld = FELDER.some(function (f) { return f.id === w.feld; }) ? w.feld : 'alle';
            var runden = (w.runden >= 1 && w.runden <= 20) ? w.runden : RUNDEN_STD;

            var wrap = document.createElement('div');
            wrap.innerHTML = rahmenHtml(decks, deck, feld, runden);
            var block = wrap.firstElementChild;
            host.appendChild(block);

            delegiere();
            zeichne(block, shares);

            /* Die Abschnitte werden von js/ds-sections.js gebildet; der
               Block muss nur existieren, damit er eingesammelt wird. */
            if (window.DsSections && typeof window.DsSections.resektionieren === 'function') {
                window.DsSections.resektionieren();
            }
            _baut = false;
            return true;
        }).catch(function (e) {
            _baut = false;
            console.warn('[ds-ev-rechner] konnte nicht bauen:', e && e.message);
            return false;
        });
    }

    /* Der Inhalt der Meta-Ansicht entsteht aus drei Quellen zu
       verschiedenen Zeiten. Statt zu raten, wann das Matchup-Register
       steht, wird beobachtet — dieselbe Loesung wie in ds-sections.js,
       und aus demselben Grund: ein einmaliger Versuch traf je nach
       Netzgeschwindigkeit mal zu frueh, mal genau richtig. */
    function beobachte() {
        var host = document.getElementById(HOST_ID);
        if (!host) return;
        baue();
        var mo = new MutationObserver(function () { baue(); });
        mo.observe(host, { childList: true, subtree: true });
        /* Nach zwei Minuten hoert das Beobachten auf: wenn bis dahin
           kein Register da ist, kommt auch keines mehr. */
        setTimeout(function () { mo.disconnect(); }, 120000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', beobachte);
    } else {
        beobachte();
    }

    document.addEventListener('languageChanged', function () {
        var host = document.getElementById(HOST_ID);
        var alt = host && host.querySelector('.' + BLOCK);
        if (!alt) return;
        var eltern = alt.parentElement;
        alt.remove();
        baue().then(function (ok) {
            /* Neu gebaut wird an den Host gehaengt; zurueck in den
               Abschnitt, aus dem er kam. */
            var neu = host.querySelector('.' + BLOCK);
            if (ok && neu && eltern && eltern !== host) eltern.appendChild(neu);
        });
    });

    window.DsEvRechner = {
        rechne: rechne,
        FELDER: FELDER,
        RUNDEN_STD: RUNDEN_STD,
        baue: baue,
    };
}());
