/**
 * Eine Bilanz, vier Win Rates — und keine, die sagt, welche sie ist.
 *
 * Am 20.08.2026 zeigte Mega Excadrill an einem Nachmittag vier Werte:
 * 49,5 % (Ladder), 49.46 % (dieselbe Quote, andere Rundung), 47,99 %
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
 *   MATCHPUNKTE      (3S + U) / (3 · Partien)
 *       Was ueber die Platzierung entscheidet. Ein Unentschieden ist
 *       ein Punkt statt drei. So rechnen die Labs-Dateien: ueber alle
 *       4.667 Zeilen von data/labs_tournament_decks.csv weicht deren
 *       Spalte win_pct davon maximal 0,005 Punkte ab.
 *
 *   MIT_UNENTSCHIEDEN   S / (S + N + U)
 *       Anteil gewonnener Partien an allen gespielten. So rechnet
 *       data/limitless_online_decks.csv (win_rate_numeric): mittlere
 *       Abweichung 0,0033 Punkte. Das ist die Zahl auf den Tier-Karten
 *       und im Battle Journal.
 *
 *   OHNE_UNENTSCHIEDEN  S / (S + N)
 *       Anteil gewonnener an den entschiedenen Partien. So rechnet
 *       data/limitless_online_decks_matchups.csv: in 0 von 1.546 Zeilen
 *       weicht deren win_rate davon ab.
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

    var KONVENTIONEN = {
        matchpunkte: {
            id: 'matchpunkte',
            formel: '(3S + U) / (3 · Matches)',
            kurzDe: 'Matchpunkte',
            kurzEn: 'Match points',
            langDe: 'Matchpunkte: ein Sieg zaehlt 3, ein Unentschieden 1, '
                  + 'eine Niederlage 0 — das ist, was über die Platzierung entscheidet. '
                  + 'Bei Unentschieden liegt der Gleichstand deshalb unter 50 %.',
            langEn: 'Match points: a win counts 3, a tie 1, a loss 0 — this is what '
                  + 'decides standings. With ties present, an even record therefore '
                  + 'sits below 50 %.',
            rechne: function (s, n, u) {
                var p = (s || 0) + (n || 0) + (u || 0);
                return p > 0 ? ((3 * (s || 0) + (u || 0)) / (3 * p)) * 100 : NaN;
            },
        },
        mitUnentschieden: {
            id: 'mitUnentschieden',
            formel: 'S / (S + N + U)',
            kurzDe: 'Siege je Match',
            kurzEn: 'Wins per game',
            langDe: 'Anteil gewonnener Matches an allen gespielten — Unentschieden '
                  + 'zaehlen im Nenner mit, aber nicht als halber Sieg.',
            langEn: 'Share of games won out of all games played — ties count in the '
                  + 'denominator, but not as half a win.',
            rechne: function (s, n, u) {
                var p = (s || 0) + (n || 0) + (u || 0);
                return p > 0 ? ((s || 0) / p) * 100 : NaN;
            },
        },
        ohneUnentschieden: {
            id: 'ohneUnentschieden',
            formel: 'S / (S + N)',
            kurzDe: 'Siege je entschiedenem Match',
            kurzEn: 'Wins per decided game',
            langDe: 'Anteil gewonnener an den entschiedenen Matches — Unentschieden '
                  + 'bleiben ganz aussen vor.',
            langEn: 'Share of decided games won — ties are left out entirely.',
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
            ? { matchpunkte: 'Sieg 3, Unentschieden 1',
                mitUnentschieden: 'Unentschieden zählen mit',
                ohneUnentschieden: 'ohne Unentschieden' }
            : { matchpunkte: 'win 3, tie 1',
                mitUnentschieden: 'ties count in the denominator',
                ohneUnentschieden: 'ties left out' };
        return k.formel + ' · ' + (zusatz[k.id] || '');
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
        hinweis: hinweis,
        kurzHinweis: kurzHinweis,
        bilanz: bilanz,
    };
})();
