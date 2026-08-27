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

    var HOST_ID = 'currentMetaContent';
    var BLOCK   = 'ds-ev-block';
    var STORE   = 'ds_ev_wahl_v1';

    /* Feldbilder. "Ganzes Feld" ist die Messung; die beiden anderen sind
       Was-waere-wenn und als solche beschriftet. */
    var FELDER = [
        { id: 'alle',  de: 'Das ganze Meta',      en: 'The whole field',
          deSub: 'gewichtet nach gemessenem Anteil', enSub: 'weighted by measured share' },
        /* Hiess "Nur Top 8 Archetypes". Genommen werden aber die acht
           groessten Gegner MIT DATEN, nicht die acht groessten des Feldes
           — bei 25 von 100 Decks ist das nicht dieselbe Menge, und 16
           Decks haben ueberhaupt keine acht Gegner mit Daten, drei nur
           drei. Der Name sagt das jetzt, und wenn es weniger als acht
           sind, steht die echte Zahl in der Zeile darunter. */
        { id: 'top8',  de: 'Die größten Gegner mit Daten', en: 'Largest opponents with data',
          deSub: 'die acht größten, zu denen Paarungen vorliegen, untereinander gewichtet',
          enSub: 'the eight largest we have pairings for, weighted among themselves' },
        { id: 'gleich', de: 'Jedes Deck gleich oft', en: 'Every deck equally likely',
          deSub: 'ignoriert den Anteil — zeigt die reine Kartenstärke',
          enSub: 'ignores share — shows raw matchup strength' },
    ];

    var RUNDEN_STD = 9;

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

    function balken(beitrag, groesster) {
        var anteil = groesster > 0 ? Math.min(1, Math.abs(beitrag) / groesster) : 0;
        var breite = (anteil * 50).toFixed(1);
        var seite = beitrag >= 0 ? 'is-pos' : 'is-neg';
        return '<span class="ds-bar-track is-diverging">'
             + '<span class="ds-bar-fill ' + seite + '" style="width:' + breite + '%"></span>'
             + '</span>';
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
        var groesster = r.zeilen.reduce(function (m, z) {
            return Math.max(m, Math.abs(z.beitrag)); }, 0);

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
                + EV_MIN_ABDECKUNG + ' % field coverage. The number is shown, but the '
                + 'uncertainty band below it is the part that matters here.')
            : '';

        var kacheln =
            '<div class="ds-stat-row">'
            + '<div class="ds-stat ' + (r.ev >= 50 ? 'is-pos' : 'is-neg')
              + (evDuenn ? ' is-duenn' : '') + '"'
              + (evDuenn ? ' title="' + esc(evDuennTitel) + '"' : '') + '>'
              + '<span class="ds-stat-role">'
              + esc(L('gegen dieses Meta', 'against this meta') + evDuennText) + '</span>'
              + '<span class="ds-stat-label">' + esc(L('Erwartete Win Rate', 'Expected win rate')) + '</span>'
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
                  zahl(siegeUnten, 1) + ' bis ' + zahl(siegeOben, 1) + ' Siege · Runden × Win Rate, kein Turniermodell',
                  zahl(siegeUnten, 1) + ' to ' + zahl(siegeOben, 1) + ' wins · rounds × win rate, not a tournament model'))
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
                        ? ' · this calculation uses only ' + zahl(r.gerechnet, 1) + ' % of the field'
                        : '')))
              + '</span>'
            + '</div>'
            + '</div>';

        var zeilen = r.zeilen.map(function (z) {
            return '<tr class="' + (z.partien < 20 ? 'is-muted' : '') + '">'
                 + '<td>' + esc(z.gegner) + '</td>'
                 + '<td class="ds-num">' + esc(zahl(z.gewicht * 100, 1)) + ' %</td>'
                 + '<td class="ds-num">' + esc(zahl(z.quote, 1)) + ' %</td>'
                 + '<td class="ds-num">' + esc(String(z.partien)) + '</td>'
                 + '<td>' + balken(z.beitrag, groesster) + '</td>'
                 + '<td class="ds-num">' + esc(vorzeichen(z.beitrag, 2)) + '</td>'
                 + '</tr>';
        }).join('');

        var tabelle =
            '<div class="mobile-table-scroll">'
            + '<table class="ds-table ds-ev-tabelle">'
            + '<thead><tr>'
              + '<th>' + esc(L('Gegner-Deck', 'Opponent deck')) + '</th>'
              /* Hier stand "Anteil am Feld" mit dem Untertitel "Wie oft du
                 diesem Deck begegnest". Gerendert wird aber das GEWICHT:
                 der Anteil unter den abgedeckten Gegnern, normiert auf
                 100 %. Bei Terapagos Noctowl (16 % Abdeckung) lagen
                 Beschriftung und Inhalt um den Faktor 6,5 auseinander.
                 Die Zahl bleibt — sie muss auf 100 % summieren, sonst
                 stimmt die Punkte-Spalte daneben nicht mehr. Nur der Name
                 sagt jetzt, was sie ist. */
              + '<th class="ds-num" title="' + esc(L(
                  'Anteil unter den Gegnern, zu denen Daten vorliegen — auf 100 % normiert, weil '
                    + 'fehlende Paarungen weggelassen statt mit 50 % aufgefüllt werden. Der gemessene '
                    + 'Meta-Anteil dieses Decks steht in der Meta-Performance-Tabelle.',
                  'Share among the opponents we have data for — normalised to 100 % because missing '
                    + 'pairings are left out rather than filled in at 50 %. The measured field share '
                    + 'is in the meta performance table.'))
                + '">' + esc(L('Gewicht hier', 'Weight here')) + '</th>'
              + '<th class="ds-num" title="' + esc(L(
                  'Geglättete Quote (k = 20) — ein 3-0 zählt hier nicht als 100 %',
                  'Smoothed rate (k = 20) — a 3-0 does not count as 100 % here'))
                + '">' + esc(L('Deine Win Rate', 'Your win rate')) + '</th>'
              + '<th class="ds-num">' + esc(L('Matches', 'Games')) + '</th>'
              + '<th>' + esc(L('trägt bei', 'contributes')) + '</th>'
              + '<th class="ds-num" title="' + esc(L(
                  'Anteil × (Win Rate − 50). Die Summe dieser Spalte ist genau der Abstand deiner erwarteten Win Rate von 50 %.',
                  'Share × (win rate − 50). This column sums to exactly how far your expected win rate sits from 50 %.'))
                + '">' + esc(L('Punkte', 'Points')) + '</th>'
            + '</tr></thead>'
            + '<tbody>' + zeilen + '</tbody>'
            + '</table></div>';

        return kacheln + tabelle;
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

        return ''
        + '<div class="ds-panel ' + BLOCK + '">'
        + '<h3 class="ds-label">🎯 ' + esc(L('Gegen welches Meta?', 'Against which meta?')) + '</h3>'
        + '<p class="ds-note">' + L(
            'Die Heatmap sagt, wer wen schlägt. Hier steht, was daraus für <em>dich</em> folgt: '
            + 'du wählst dein Deck, und die Seite gewichtet jede Paarung mit dem Anteil, den der '
            + 'Gegner im Meta hat. Heraus kommt die Win Rate, mit der du über ein ganzes Turnier '
            + 'rechnen kannst — nicht gegen ein Deck, sondern gegen alle auf einmal.',
            'The heatmap says who beats whom. This says what that means for <em>you</em>: pick your '
            + 'deck and every matchup is weighted by how much of the field that opponent is. The '
            + 'result is the win rate to expect across a whole tournament — not against one deck, '
            + 'but against all of them at once.') + '</p>'
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
            'Gerechnet wird <strong>Anteil × Win Rate</strong>, aufsummiert über alle Gegner, zu denen '
            + 'Daten vorliegen. Die Quoten sind geglättet (Beta-Binomial, k = 20), damit ein 3-0 nicht '
            + 'als 100 % durchgeht. Das Band ist ±1,96 Standardabweichungen aus der Streuung der '
            + 'einzelnen Paarungen; es nimmt die Meta-Anteile als bekannt an und ist deshalb eher zu '
            + 'schmal als zu breit. Paarungen ohne Daten werden weggelassen, nicht mit 50 % aufgefüllt '
            + '— darum steht die Abdeckung daneben. Datenraum: Global/EN, Limitless Online.',
            'The sum is <strong>share × win rate</strong> over every opponent we have data for. Rates '
            + 'are smoothed (beta-binomial, k = 20) so a 3-0 does not pass as 100 %. The band is ±1.96 '
            + 'standard deviations from the spread of the individual matchups; it treats the field '
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
        block.querySelector('.ds-ev-feldnote').textContent =
            (de() ? f.de : f.en) + ' — ' + sub + '.';

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
