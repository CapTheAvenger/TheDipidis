/**
 * Ein 3-0 ist keine 100-Prozent-Paarung.
 *
 * GEMESSEN am 19.08.2026 an data/limitless_online_decks_matchups.csv:
 *
 *   Paarungen mit Daten      1.546
 *   Decks                      100
 *   moegliche Paare          9.900   ->  16 % abgedeckt
 *   Median Partien je Paarung   16
 *   unter 20 Partien           858   =  55 %
 *   unter 10 Partien           564   =  36 %
 *
 * Bis hierher zeigte die Seite den Rohwert. Damit stand in der Heatmap und
 * in der Archetyp-Karte woertlich:
 *
 *   Sinistcha Ogerpon vs N's Zoroark      3-0   ->  100,0 %
 *   Sylveon           vs Mega Excadrill   0-4   ->    0,0 %
 *
 * Blass dargestellt und mit n=3 daneben, aber eben hingeschrieben.
 *
 * Die Loesung ist im Haus schon in Gebrauch, nur eine Etage hoeher:
 * js/app-tier-meta.js glaettet die Deck-Win-Rate seit jeher mit einem
 * 50-Partien-Prior auf 50 %, und zwar mit genau dieser Begruendung im
 * Kommentar — "ein Deck was nur 5x zu nem Turnier geht und alle gewinnt
 * … ist ja kein Tier 1". Dasselbe Argument gilt fuer Matchups. Auf der
 * Matchup-Ebene war es nie angewendet.
 *
 * Beta-Binomial mit Prior-Staerke k, k/2 Pseudo-Siege und k/2
 * Pseudo-Niederlagen:
 *
 *     alpha = W + k/2
 *     beta  = L + k/2
 *     Quote = alpha / (alpha + beta)
 *
 * Mit k = 20 liest sich ein 3-0 als 56,5 % und ein 0-4 als 41,7 %. Ein
 * 60-40 auf 100 Partien bewegt sich um weniger als einen Punkt: 60,0 ->
 * 58,3 %. Die Glaettung fasst also genau das an, was zu duenn ist, und
 * laesst belastbare Zahlen praktisch in Ruhe.
 *
 * Der Rohwert geht nicht verloren — er steht weiter im Tooltip, zusammen
 * mit der Bilanz. Wer die Rohzahl sehen will, sieht sie.
 *
 * Die Methode stammt von Metagross-EV (reillycooper.com/metagross-ev,
 * Quellcode MIT-lizenziert, github.com/reillyowencooper/metagross-ev).
 * Uebernommen ist die Rechnung, nicht die Zahl: unsere Werte kommen
 * weiter aus Limitless Online, seine aus Trainer Hill. Zwei Quellen in
 * einem Bild zu mischen waere ein Bruch der Hausregel.
 */
(function () {
    'use strict';

    /* Dieselbe Schwelle, ab der die Karte eine Paarung als duenn
       markiert (js/app-archetype-card.js THIN_GAMES). k in derselben
       Groessenordnung zu waehlen ist kein Zufall: der Prior soll genau
       dort spuerbar sein, wo wir die Zahl ohnehin nicht glauben. */
    var K = 20;

    function zahl(v) {
        var n = typeof v === 'number' ? v : parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    /**
     * "61 - 28 - 3" -> { siege: 61, niederlagen: 28, unentschieden: 3 }
     * Fehlende oder kaputte Bilanz gibt Nullen zurueck, nie NaN.
     */
    function bilanz(record) {
        var teile = String(record == null ? '' : record).split(/\s*-\s*/);
        return {
            siege:         zahl(teile[0]),
            niederlagen:   zahl(teile[1]),
            unentschieden: zahl(teile[2]),
        };
    }

    /**
     * Geglaettete Win Rate in Prozent.
     * Ohne entscheidende Partien (0-0) kommt 50 heraus — das ist die
     * ehrliche Antwort fuer die 84 % der Deck-Paare, die nie gegeneinander
     * gespielt haben.
     */
    function quote(siege, niederlagen, k) {
        var kk = (typeof k === 'number' && k >= 0) ? k : K;
        var w = zahl(siege), l = zahl(niederlagen);
        var nenner = w + l + kk;
        if (nenner <= 0) return 50;
        return ((w + kk / 2) / nenner) * 100;
    }

    /**
     * Varianz der Beta-Verteilung hinter dieser Quote, als Anteil (nicht
     * Prozent). Wird hier noch nicht angezeigt; sie ist die Grundlage fuer
     * Konfidenzintervalle und den geplanten "Gegen welches Feld?"-Rechner.
     */
    function varianz(siege, niederlagen, k) {
        var kk = (typeof k === 'number' && k >= 0) ? k : K;
        var a = zahl(siege) + kk / 2;
        var b = zahl(niederlagen) + kk / 2;
        var n = a + b;
        if (n <= 0) return 1 / 12;
        return (a * b) / (n * n * (n + 1));
    }

    /** Bequemer Aufruf direkt auf einem Registereintrag. */
    function ausEintrag(eintrag, k) {
        if (!eintrag) return 50;
        var b = bilanz(eintrag.record);
        if (b.siege + b.niederlagen === 0) {
            /* Keine Bilanz im CSV, aber vielleicht eine Rohquote und eine
               Partienzahl. Dann die Bilanz daraus rekonstruieren, statt
               die Glaettung stillschweigend auszulassen. */
            var n = zahl(eintrag.total_games);
            var roh = parseFloat(eintrag.win_rate_numeric);
            if (n > 0 && Number.isFinite(roh)) {
                var w = Math.round((roh / 100) * n);
                return quote(w, n - w, k);
            }
            return 50;
        }
        return quote(b.siege, b.niederlagen, k);
    }

    window.DsGlaettung = {
        K: K,
        bilanz: bilanz,
        quote: quote,
        varianz: varianz,
        ausEintrag: ausEintrag,
    };
}());
