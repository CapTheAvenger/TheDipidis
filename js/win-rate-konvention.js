/**
 * Eine Bilanz, vier Win Rates — und keine, die sagt, welche sie ist.
 *
 * Am 20.08.2026 zeigte Mega Excadrill an einem Nachmittag vier Werte:
 * 49,5 % (Online-Turniere), 49.46 % (dieselbe Quote, andere Rundung), 47,99 %
 * (ungewichteter Mittelwert ueber 20 Matchups) und 48,2 % (EV). Keine
 * nannte die andere, und keine sagte, wie sie Unentschieden behandelt.
 *
 * Die Ursache ist nicht ein Rechenfehler, sondern eine fehlende Zusage:
 * das Haus hat nie festgelegt, was "Win Rate" heisst. Die Quellen
 * rechnen unterschiedlich — zu Recht, denn sie messen Verschiedenes —,
 * und die Oberflaeche hat das nie hingeschrieben.
 *
 * DREI KONVENTIONEN SIND ECHT. Alle drei wurden gegen die Rohdaten
 * nachgewiesen:
 *
 * BELEG-STAND 07.09.2026 (nachgemessen, nicht abgeschrieben — die
 * Zahlen unten stehen zugleich maschinenlesbar in KONVENTIONEN[id].beleg
 * und werden von tests/unit/test-win-rate-konventionen-belegt.js gegen
 * die Dateien nachgerechnet; laufen sie auseinander, wird der Test rot):
 *
 *   MATCHPUNKTE      (3S + U) / (3 · Partien)      — angezeigt als "Win %"
 *       Was ueber die Platzierung entscheidet. Ein Unentschieden ist
 *       ein Punkt statt drei. So rechnen die Labs-Dateien: ueber alle
 *       4.713 Zeilen von data/labs_tournament_decks.csv weicht deren
 *       Spalte win_pct davon maximal 0,005 Punkte ab (mittlere
 *       Abweichung 0,0023). Ebenso in data/labs_tournament_matchups.csv
 *       (Spalte my_deck_overall_win_pct).
 *
 *   MIT_UNENTSCHIEDEN   S / (S + N + U)
 *       Anteil gewonnener Partien an allen gespielten. So rechnet
 *       data/limitless_online_decks.csv (win_rate_numeric): 135 von 136
 *       Zeilen auf 0,01 Punkte genau, mittlere Abweichung 0,0032. Die
 *       eine Ausnahme (Wailord, 168-267-1, Datei sagt 38,65) trifft
 *       KEINE der drei Konventionen — am naechsten liegt S/(S+N) mit
 *       0,029 Punkten Abstand; das ist ein Datenfehler der Quelle, kein
 *       Konventionsstreit. Das ist die Zahl auf den Tier-Karten und im
 *       Battle Journal.
 *
 *   OHNE_UNENTSCHIEDEN  S / (S + N)
 *       Anteil gewonnener an den entschiedenen Partien. So rechnet
 *       data/limitless_online_decks_matchups.csv: alle 1.716 Zeilen auf
 *       0,005 Punkte genau, mittlere Abweichung 0,0019.
 *
 * DIESELBE FORMEL IST NOCH KEINE VERGLEICHBARKEIT (07.09.2026).
 * MIT_UNENTSCHIEDEN haengt am Unentschieden-Anteil des Feldes, in dem
 * gespielt wurde: online enden 1,29 % der Partien unentschieden
 * (2.322 von 180.414 in data/limitless_online_decks.csv), bei den Worlds
 * in San Francisco 11,05 % (684 von 6.192 in
 * data/labs_tournament_matchups_TEF-PBL.csv). Zwei Decks mit demselben
 * Sieg-Niederlage-Verhaeltnis stehen dort deshalb rund fuenf Punkte
 * auseinander, ohne dass eines besser gespielt haette. Wer eine
 * Online-Quote von einer Papier-Quote ABZIEHT, muss zuvor auf
 * OHNE_UNENTSCHIEDEN umrechnen — das ist die einzige der drei, die den
 * Unentschieden-Anteil herauskuerzt. Dafuer gibt es unten
 * `nachOhneUnentschieden()` und `differenz()`; letztere verweigert die
 * Subtraktion, wenn die beiden Seiten nicht dieselbe Konvention tragen.
 *
 * EINE VIERTE WAR ERFUNDEN: (S + 0,5·U) / Partien. Sie stand bis zum
 * 17.08.2026 in app-tier-meta.js und bis zum 20.08.2026 in
 * app-past-meta.js — beide Male ueber Daten, deren Quelle Matchpunkte
 * rechnet. Median-Abweichung 2,38 Punkte, maximal 12,5. Sie ist hier
 * bewusst NICHT aufgefuehrt: wer sie braucht, soll erklaeren, warum.
 *
 * WOZU DIESES MODUL
 *
 * Nicht, um alles auf eine Zahl zu zwingen — die Quellen messen
 * wirklich Verschiedenes. Sondern damit jede angezeigte Quote sagen
 * kann, welche sie ist, mit derselben Formel und demselben Wortlaut.
 * Eine Zahl ohne ihre Konvention ist an dieser Stelle keine Aussage.
 */
(function () {
    'use strict';

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    /* "LADDER" GIBT ES HIER NICHT (03.09.2026).
       Bis zu diesem Tag stand an mehreren Stellen der Seite "Online-Ladder"
       — als Quelle der Listen, des Anteils und der Win Rate. Das war
       schlicht falsch: die Zahlen stammen von
       play.limitlesstcg.com/decks, und diese Seite schreibt ueber ihre
       eigene Tabelle "536 tournaments, 39181 players, 88857 matches".
       Das Wort "ladder" kommt dort nirgends vor, und play.limitlesstcg.com
       fuehrt auch keine. Gemeldet vom Betreiber: "hier geht es um die Win
       Rate auf Basis der Limitless Online Turniere ... generell geht es
       hier nie um Ladder sondern immer Limitless Online Tournaments."
       Nachgeprueft an der Quelle, bevor das Wort ueberall entfernt wurde.

       Achtung beim Suchen: js/app-side-quest-play.js und
       js/champions-names.js meinen mit "Ladder" die Speed-Ladder des
       Spiels selbst. Das ist ein anderer Begriff und bleibt. */
    var KONVENTIONEN = {
        matchpunkte: {
            id: 'matchpunkte',
            kuerzelDe: 'Win %',
            kuerzelEn: 'Win %',
            formel: '(3S + U) / (3 · Matches)',
            /* DER NAME KOMMT VON DER QUELLE (05.09.2026).
               Bis heute hiess diese Konvention im Haus "Matchpunkte" — richtig
               gerechnet, aber ein Wort, das ausserhalb dieser Seite niemand
               benutzt. Limitless selbst nennt genau diese Spalte "Win %", und
               aus Limitless kommen die Zahlen. Angeordnet vom Betreiber:
               "lass uns einfach ueberall die Bezeichnung von limitless dafuer
               uebernehmen Win % ... matchpunkte klingt naemlich doof".

               Der Name ist damit in beiden Sprachen derselbe — er ist von der
               Quelle uebernommen, nicht uebersetzt. Die Formel bleibt im
               Hinweis stehen, denn "Win %" allein waere im Haus wieder eine
               von drei Konventionen; der Nenner bleibt Pflicht.
               Der interne Bezeichner heisst weiter 'matchpunkte': er steht in
               ueber 30 Kommentaren und in vier Testdateien, und ihn
               umzubenennen aendert keine einzige angezeigte Zahl. */
            kurzDe: 'Win %',
            kurzEn: 'Win %',
            /* Wo diese Konvention herkommt und woran sie nachgerechnet
               ist. `beleg` ist der Pruefauftrag fuer
               tests/unit/test-win-rate-konventionen-belegt.js: die Zahlen
               im Kopf dieser Datei koennen damit nicht veralten, ohne
               dass der Test rot wird. */
            quelle: 'data/labs_tournament_decks.csv (Spalte win_pct)',
            beleg: {
                datei: 'data/labs_tournament_decks.csv',
                trenner: ',',
                spalte: 'win_pct',
                bilanz: ['wins', 'losses', 'ties'],
                zeilen: 4713,
                toleranz: 0.0051,
                treffer: 4713,
            },
            langDe: 'Win % — so nennt Limitless diese Spalte: ein Sieg zaehlt 3, '
                  + 'ein Unentschieden 1, eine Niederlage 0. Das ist, was über die '
                  + 'Platzierung entscheidet. Bei Unentschieden liegt der '
                  + 'Gleichstand deshalb unter 50 %.',
            langEn: 'Win % — the label Limitless uses for this column: a win counts 3, '
                  + 'a tie 1, a loss 0. This is what decides standings. With ties '
                  + 'present, an even record therefore sits below 50 %.',
            rechne: function (s, n, u) {
                var p = (s || 0) + (n || 0) + (u || 0);
                return p > 0 ? ((3 * (s || 0) + (u || 0)) / (3 * p)) * 100 : NaN;
            },
        },
        mitUnentschieden: {
            id: 'mitUnentschieden',
            kuerzelDe: 'WR*',
            kuerzelEn: 'WR*',
            formel: 'S / (S + N + U)',
            /* DIE KURZNAMEN MUESSEN AUSEINANDERZUHALTEN SEIN (07.09.2026).
               Bis heute hiessen die beiden Nicht-Win-%-Konventionen
               "Siege je Match" und "Siege je entschiedenem Match" — zwei
               Namen, die sich um ein Wort in der Mitte unterscheiden und
               damit genau die Verwechslung einladen, gegen die dieses
               Modul geschrieben wurde. Jetzt steht das unterscheidende
               Merkmal — was mit den Unentschieden passiert — im Namen
               selbst und an unterschiedlicher Stelle. "Win %" bleibt der
               Konvention MATCHPUNKTE vorbehalten (Anordnung des
               Betreibers vom 05.09.2026); die anderen beiden duerfen es
               nicht tragen, sonst hiessen wieder drei Groessen gleich. */
            kurzDe: 'Siegquote inkl. Unentschieden',
            kurzEn: 'Win share incl. ties',
            langDe: 'Anteil gewonnener Matches an allen gespielten — Unentschieden '
                  + 'zaehlen im Nenner mit, aber nicht als halber Sieg. Die Zahl '
                  + 'sinkt, je haeufiger unentschieden gespielt wird; zwischen zwei '
                  + 'Feldern mit verschiedener Unentschieden-Quote ist sie deshalb '
                  + 'nicht vergleichbar.',
            langEn: 'Share of games won out of all games played — ties count in the '
                  + 'denominator, but not as half a win. The figure drops as ties get '
                  + 'more common, so it cannot be compared across two fields with '
                  + 'different tie rates.',
            quelle: 'data/limitless_online_decks.csv (Spalte win_rate_numeric)',
            beleg: {
                datei: 'data/limitless_online_decks.csv',
                trenner: ';',
                spalte: 'win_rate_numeric',
                bilanz: ['wins', 'losses', 'ties'],
                zeilen: 136,
                toleranz: 0.01,
                treffer: 135,
                /* Wailord, 168-267-1: die Datei sagt 38,65 und trifft damit
                   KEINE der drei Konventionen (naechste ist S/(S+N) mit
                   0,029 Punkten Abstand). Ein Datenfehler der Quelle. */
                ausnahmen: ['Wailord'],
            },
            rechne: function (s, n, u) {
                var p = (s || 0) + (n || 0) + (u || 0);
                return p > 0 ? ((s || 0) / p) * 100 : NaN;
            },
        },
        ohneUnentschieden: {
            id: 'ohneUnentschieden',
            kuerzelDe: 'WR',
            kuerzelEn: 'WR',
            formel: 'S / (S + N)',
            kurzDe: 'Siegquote ohne Unentschieden',
            kurzEn: 'Win share excluding ties',
            langDe: 'Anteil gewonnener an den entschiedenen Matches — Unentschieden '
                  + 'bleiben ganz aussen vor. Als einzige der drei Konventionen '
                  + 'haengt sie nicht davon ab, wie oft im Feld unentschieden '
                  + 'gespielt wird; nur sie darf zwischen zwei Quellen verrechnet '
                  + 'werden.',
            langEn: 'Share of decided games won — ties are left out entirely. Alone '
                  + 'among the three it does not depend on how often the field draws, '
                  + 'so it is the only one that may be differenced across sources.',
            quelle: 'data/limitless_online_decks_matchups.csv (Spalte win_rate)',
            beleg: {
                datei: 'data/limitless_online_decks_matchups.csv',
                trenner: ';',
                spalte: 'win_rate',
                bilanz: 'record',
                zeilen: 1716,
                toleranz: 0.0051,
                treffer: 1716,
            },
            rechne: function (s, n) {
                var e = (s || 0) + (n || 0);
                return e > 0 ? ((s || 0) / e) * 100 : NaN;
            },
        },
    };

    function hol(id) {
        return KONVENTIONEN[id] || null;
    }

    /** Kurzname fuer eine Spaltenueberschrift. */
    function kurz(id) {
        var k = hol(id);
        if (!k) return '';
        return de() ? k.kurzDe : k.kurzEn;
    }

    /**
     * Das Kuerzel fuer eine ENGE Spaltenueberschrift — nur zulaessig,
     * wenn direkt darunter eine Legende steht, die es aufloest.
     *
     * WARUM ES DAS GIBT (11.09.2026)
     * ------------------------------
     * Der volle Name ist praezise und lang: "Siegquote ohne
     * Unentschieden" fuellt in der EV-Tabelle eine Spalte, die eine Zahl
     * zeigt. Der Betreiber am 11.09.2026: "da auch wieder einfach WR,
     * also Winrate, das haben wir jetzt ja ueberall schon gleich."
     *
     * Die Hausregel dazu steht seit dem 02.09.2026 in
     * tests/unit/test-sprache-win-rate.js: ein Kuerzel ist erlaubt, WENN
     * eine Legende es aufloest — so haelt es die Matchup-Tabelle der
     * Archetyp-Karte mit "WR", "M" und "Major-WR". Ein Kuerzel OHNE
     * Legende faellt dort durch, und das bleibt so.
     *
     * Das Kuerzel steht hier und nicht in der aufrufenden Datei, aus
     * demselben Grund wie der lange Name: es gibt drei Konventionen, und
     * ein abgeschriebenes "WR" wuerde fuer irgendeine von ihnen stehen.
     * Deshalb traegt mitUnentschieden bewusst "WR*" — sie sieht aus wie
     * WR, ist es aber nicht.
     */
    function kuerzel(id) {
        var k = hol(id);
        if (!k) return '';
        return de() ? k.kuerzelDe : k.kuerzelEn;
    }

    /** Vollstaendiger Hinweistext samt Formel — gehoert an jede Quote. */
    function hinweis(id) {
        var k = hol(id);
        if (!k) return '';
        return (de() ? k.langDe : k.langEn) + '  ' + k.formel;
    }

    /**
     * Einzeiler fuer eine Bildkarte oder eine Fussnote: die Formel und
     * genau so viele Worte, wie in eine Zeile passen. Der lange Text von
     * hinweis() sprengt eine Kachel von 300 px.
     */
    function kurzHinweis(id) {
        var k = hol(id);
        if (!k) return '';
        var zusatz = de()
            ? { matchpunkte: 'Win % · Sieg 3, Unentschieden 1',
                mitUnentschieden: 'Unentschieden zählen mit',
                ohneUnentschieden: 'ohne Unentschieden' }
            : { matchpunkte: 'Win % · win 3, tie 1',
                mitUnentschieden: 'ties count in the denominator',
                ohneUnentschieden: 'ties left out' };
        return k.formel + ' · ' + (zusatz[k.id] || '');
    }

    /**
     * MIT_UNENTSCHIEDEN -> OHNE_UNENTSCHIEDEN, ueber den Unentschieden-Anteil.
     *
     * S/(S+N+U) = S/(S+N) · (S+N)/(S+N+U) = ohneU · (1 − u). Die Umkehrung
     * ist deshalb eine Division, keine Schaetzung — vorausgesetzt, `uAnteil`
     * ist an DERSELBEN Grundgesamtheit gemessen wie die Quote.
     *
     * Wozu: zwei MIT_UNENTSCHIEDEN-Quoten aus Feldern mit verschiedener
     * Unentschieden-Quote sind nicht vergleichbar (siehe Kopf dieser Datei).
     * Wer sie voneinander abziehen will, rechnet beide zuerst hierhin.
     *
     * @param {number} prozent  Quote in Prozent, Konvention mitUnentschieden
     * @param {number} uAnteil  Anteil unentschiedener Partien, 0..1
     * @returns {number} Quote in Prozent, Konvention ohneUnentschieden,
     *                   oder NaN wenn die Eingaben das nicht hergeben.
     */
    function nachOhneUnentschieden(prozent, uAnteil) {
        var p = Number(prozent);
        var u = Number(uAnteil);
        if (!isFinite(p) || !isFinite(u) || u < 0 || u >= 1) return NaN;
        return p / (1 - u);
    }

    /** Die Gegenrichtung — OHNE_UNENTSCHIEDEN in ein Feld mit u Unentschieden. */
    function nachMitUnentschieden(prozent, uAnteil) {
        var p = Number(prozent);
        var u = Number(uAnteil);
        if (!isFinite(p) || !isFinite(u) || u < 0 || u >= 1) return NaN;
        return p * (1 - u);
    }

    /**
     * Zwei Quoten voneinander abziehen — aber nur, wenn sie dieselbe
     * Konvention tragen.
     *
     * DAS IST DER PUNKT DES GANZEN MODULS, als Funktion. Am 05.09.2026 zog
     * `_computeMatchupAdjustments` im Meta Call eine Matchpunktquote von
     * einer Siegquote ab; am 07.09.2026 zog dieselbe Stelle zwei
     * MIT_UNENTSCHIEDEN-Quoten aus Feldern mit 1,3 % und 11,0 %
     * Unentschieden voneinander ab. Beide Male war das Ergebnis eine
     * Einheitenumrechnung, die als Spielstaerke gelesen wurde. Wer hier
     * durchgeht, kann diesen Fehler nicht mehr still machen: die
     * Konvention muss dranstehen, und sie muss auf beiden Seiten gleich
     * sein.
     *
     * @param {{wert:number, konvention:string}} a
     * @param {{wert:number, konvention:string}} b
     * @returns {number} a.wert − b.wert in Prozentpunkten
     * @throws {Error} wenn eine Konvention fehlt, unbekannt ist oder die
     *                 beiden Seiten verschiedene tragen.
     */
    function differenz(a, b) {
        if (!a || !b) throw new Error('WinRateKonvention.differenz: Seite fehlt');
        if (!hol(a.konvention)) {
            throw new Error('WinRateKonvention.differenz: unbekannte Konvention "'
                + a.konvention + '"');
        }
        if (!hol(b.konvention)) {
            throw new Error('WinRateKonvention.differenz: unbekannte Konvention "'
                + b.konvention + '"');
        }
        if (a.konvention !== b.konvention) {
            throw new Error('WinRateKonvention.differenz: ' + a.konvention
                + ' minus ' + b.konvention + ' ist keine Zahl, sondern ein Fehler — '
                + 'erst umrechnen (nachOhneUnentschieden), dann abziehen.');
        }
        var x = Number(a.wert), y = Number(b.wert);
        if (!isFinite(x) || !isFinite(y)) return NaN;
        return x - y;
    }

    /** Bilanz als Text, vollstaendig — auch die Unentschieden. */
    function bilanz(s, n, u) {
        var teile = [(s || 0) + 'S', (n || 0) + 'N'];
        if (u != null) teile.push((u || 0) + 'U');
        return teile.join(' · ');
    }

    window.WinRateKonvention = {
        KONVENTIONEN: KONVENTIONEN,
        hol: hol,
        kurz: kurz,
        kuerzel: kuerzel,
        hinweis: hinweis,
        kurzHinweis: kurzHinweis,
        bilanz: bilanz,
        nachOhneUnentschieden: nachOhneUnentschieden,
        nachMitUnentschieden: nachMitUnentschieden,
        differenz: differenz,
    };
})();
