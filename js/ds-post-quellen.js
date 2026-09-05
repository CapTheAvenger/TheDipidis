/* ══════════════════════════════════════════════════════════════════════
 * DATENQUELLEN FÜR DIE POST-VORLAGEN
 * ══════════════════════════════════════════════════════════════════════
 *
 * ANLASS (04.09.2026). Betreiber: "können wir die Option für mich geben
 * direkt Daten von der Seite zu ziehen ohne das ich da was live eingeben
 * muss und je nach Thema könnte es dann der Screenshot sein, eine
 * selbsterstellte Liste und co […] nur muss es deutlich flexibler".
 *
 * Diese Datei füllt die Felder von posts/index.html aus den Datendateien
 * der Seite. Sie wird NUR von dort geladen.
 *
 * WARUM EIGENE DATEI UND NICHT IN posts/index.html
 * ------------------------------------------------
 * Die Post-Seite malt. Diese Datei rechnet. Das Malen darf keine Zeile
 * über Semikolon-CSV, Dezimalkomma oder gewichtete Antritte enthalten —
 * sonst wandert der nächste Datenbefund in eine HTML-Datei, die niemand
 * beim Suchen nach Datenlogik aufmacht.
 *
 * WAS HIER GELIEHEN WIRD UND WAS NICHT
 * ------------------------------------
 * Geliehen wird genau eine Rechnung: `window.DsGlaettung` aus
 * js/matchup-glaettung.js. Das Modul laeuft ohne den Anwendungsrahmen
 * und wird von posts/index.html mitgeladen.
 *
 * NICHT geliehen wird `window.CONV_MIN_N` — die Konstante lebt in
 * js/app-utils.js, und diese Seite laedt die Datei nie. Eine Abfrage
 * mit Rueckfall sah nach Kopplung aus und war keine; die Zahl steht
 * jetzt offen im Rezept, und eine Zusicherung vergleicht sie mit der
 * Schwester (Abnahme 04.09.2026).
 *
 * NICHT geliehen wird die ANZEIGESCHICHT. `formatPercent` prüft
 * `typeof getLang === 'function'` und fällt sonst auf Englisch zurück —
 * gemessen bei der Abnahme am 04.09.2026:
 *
 *     ohne getLang:  formatPercent(7.487) -> "7.5%"
 *     mit  getLang:  formatPercent(7.487) -> "7,5 %"
 *
 * Die Post-Seite hat kein i18n. Jede automatisch gefüllte Zahl hätte
 * einen englischen Dezimalpunkt in einem deutschen Post getragen.
 * Deshalb setzt diese Datei `window.getLang` selbst, BEVOR eine
 * App-Datei geladen wird — und formatiert im Übrigen selbst.
 *
 * DIE HAUSREGEL: JEDE QUOTE TRÄGT IHREN NENNER
 * --------------------------------------------
 * Auf einem Bild, das durch Instagram wandert, gibt es keine Fußnote und
 * keinen Tooltip. Der Nenner muss deshalb im Bild stehen. Wohin er
 * gehört, hängt davon ab, ob er sich je Zeile ändert (Abnahme
 * 04.09.2026, gemessene Feldgrenzen):
 *
 *     konstant je Bild   -> Fußzeile         (~48 Zeichen)
 *     wechselt je Zeile  -> Wertspalte       (~10 Zeichen!)
 *     wie viele fehlen   -> Spaltenkopf      (~23 Zeichen)
 *
 * Zehn Zeichen sind die harte Grenze: `malListe` clippt den Wert auf
 * 220 px bei Mono 34/700. "7,49 % · 2.983" hat vierzehn und würde
 * stumm abgeschnitten.
 * ══════════════════════════════════════════════════════════════════ */

(function () {
'use strict';

/* EINE SPRACHE, BEVOR IRGENDETWAS RECHNET. Siehe Kopfkommentar.
 *
 * Seit dem 05.09.2026 ist das ENGLISCH: die Posts gehen auf Instagram,
 * und der Betreiber hat entschieden, dass sie dort englisch laufen.
 * Damit wechselt auch die Zahlenschreibweise — "7.49 %" und "39,842",
 * nicht "7,49 %" und "39.842". Eine englische Ueberschrift ueber
 * deutschen Dezimalkommas liest sich wie ein Tippfehler, und bei
 * Tausendertrennern ist es schlimmer als das: "39.842" heisst fuer
 * einen englischen Leser NEUNUNDDREISSIG KOMMA ACHT, also ein
 * Tausendstel des Nenners. */
if (typeof window.getLang !== 'function') {
    window.getLang = function () { return 'en'; };
}
function _en() { return window.getLang() !== 'de'; }

var WURZEL = '../';

/* ── Lesen ────────────────────────────────────────────────────────────
 *
 * Drei Fallen, alle am 04.09.2026 an den echten Dateien gemessen:
 *
 *   BOM      limitless_online_decks.csv beginnt mit EF BB BF; ohne
 *            Abschneiden heisst der erste Kopfschluessel "﻿rank".
 *   CRLF     dieselbe Datei endet jede Zeile mit \r; ohne /\r?\n/
 *            steht das \r im letzten Feld.
 *   Komma    labs_tournament_decks_*.csv trennt mit KOMMA und hat in
 *            28 von 44 Zeilen ein Feld "dragapult, dusknoir". Naives
 *            split(',') verschiebt ab dort jede Spalte — der Fehler ist
 *            in js/app-archetype-card.js:218 mit dem 404,5-%-Befund
 *            dokumentiert.
 */
function zerlege(zeile, trenn) {
    var raus = [], feld = '', inAnf = false, i;
    for (i = 0; i < zeile.length; i++) {
        var z = zeile[i];
        if (z === '"') {
            if (inAnf && zeile[i + 1] === '"') { feld += '"'; i++; }
            else inAnf = !inAnf;
        } else if (z === trenn && !inAnf) {
            raus.push(feld); feld = '';
        } else feld += z;
    }
    raus.push(feld);
    return raus;
}

function liesCsv(text, trenn) {
    var zeilen = String(text).replace(/^﻿/, '').split(/\r?\n/)
        .filter(function (z) { return z.trim().length; });
    if (!zeilen.length) return [];
    var kopf = zerlege(zeilen[0], trenn);
    return zeilen.slice(1).map(function (z) {
        var t = zerlege(z, trenn), o = {};
        kopf.forEach(function (k, i) { o[k.trim()] = (t[i] || '').trim(); });
        return o;
    });
}

/* Dezimalkomma. `parseFloat('7,42')` gibt 7 — dieser Fehler ist auf der
 * Seite bereits einmal passiert und in
 * tests/unit/test-comparison-csv-comma-parse.js festgehalten. */
function zahlAus(s) {
    if (s == null) return NaN;
    var t = String(s).trim().replace(/%/g, '');
    /* DEUTSCHER TAUSENDERPUNKT ODER ENGLISCHER DEZIMALPUNKT?
     *
     * Das Komma entscheidet. Steht eines im Text, ist der Punkt ein
     * Tausendertrenner und muss weg ("1.234,5" -> 1234.5); steht keines,
     * ist der Punkt das Dezimalzeichen ("7.49" -> 7.49).
     *
     * Die erste Fassung machte `.replace(',', '.')` — das ersetzt nur das
     * ERSTE Vorkommen und liess den Tausenderpunkt stehen:
     * parseFloat("1.234.5") = 1.234. Faktor tausend. Die Form kommt in
     * data/ heute nicht vor, aber total_games steht schon bei 1280, und
     * die limitless-Dateien schreiben deutsch (Abnahme 04.09.2026).
     *
     * Leerzeichen werden nur aussen entfernt, nicht innen: "12 34"
     * klebte sonst zu 1234 zusammen. */
    /* NACHGESCHAERFT AM 05.09.2026, ALS DIE POSTS ENGLISCH WURDEN.
     *
     * `tausend()` schreibt den Tausendertrenner jetzt als KOMMA
     * ("39,842"). Die Regel darueber las genau das als Dezimalkomma und
     * machte daraus 39,842 — ein Tausendstel des Nenners. Gefangen hat
     * es keine Zusage ueber diese Funktion, sondern eine ueber die
     * Glaettung: sie fand ploetzlich null duenne Zeilen, weil jede
     * Partienzahl auf einen Bruchteil geschrumpft war.
     *
     * Die Unterscheidung geht ohne Sprachwissen, weil ein
     * Tausendertrenner IMMER von genau drei Ziffern gefolgt wird und
     * ein Dezimaltrenner (in diesen Daten) nie. "39,842" ist damit ein
     * Trenner, "7,49" ein Dezimalkomma — und "1.234,5" bleibt, was es
     * war. Bleibt der Fall "1,234" mit exakt drei Nachkommastellen
     * mehrdeutig; er kommt in data/ nicht vor, und `ganzzahl()` faengt
     * ihn dort ab, wo ein Zaehler erwartet wird. */
    var dreiNach = /[.,]\d{3}(?!\d)/;
    if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) {
        /* Beide da: der HINTERE ist das Dezimalzeichen. */
        t = (t.lastIndexOf(',') > t.lastIndexOf('.'))
            ? t.replace(/\./g, '').replace(',', '.')
            : t.replace(/,/g, '');
    } else if (t.indexOf(',') >= 0) {
        /* Nur Kommas: Trenner, wenn drei Ziffern folgen. */
        t = dreiNach.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    }
    var n = parseFloat(t);
    return isNaN(n) ? NaN : n;
}

/* ZAEHLER SIND GANZE ZAHLEN — UND DAS WIRD GEPRUEFT.
 *
 * `zahlAus` kann den deutschen Tausenderpunkt nur erkennen, wenn ein
 * Komma danebensteht: "1.234,5" ist eindeutig, "1.970" nicht — das kann
 * 1970 (deutsch) oder 1,97 (englisch) heissen, und beide Formen kommen
 * in data/ vor. Raten waere hier falsch, denn ein Fehlgriff macht aus
 * 1.970 Spielern eine Feldgroesse von zwei und aus einem Anteil
 * 6.091,4 % (zweite Abnahme, 04.09.2026).
 *
 * Also wird nicht geraten, sondern gepruefet: wo ein ZAEHLER erwartet
 * wird — Spieler, Listen, Partien, Antritte —, muss eine ganze Zahl
 * herauskommen. Kommt es das nicht, ist die Spalte anders formatiert
 * als angenommen, und das ist ein Befund und kein Anlass zum Weiterrechnen.
 */
function ganzzahl(s, was) {
    var n = zahlAus(s);
    if (!isFinite(n) || Math.abs(n - Math.round(n)) > 1e-9) throw new Error(
        (was || 'ein Zaehler') + ' ist keine ganze Zahl: ' + JSON.stringify(s) +
        ' — die Spalte ist anders formatiert als erwartet (deutscher ' +
        'Tausenderpunkt?)');
    return Math.round(n);
}

function hole(pfad, alsJson) {
    return fetch(WURZEL + pfad, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(pfad + ' — HTTP ' + r.status);
        return alsJson ? r.json() : r.text();
    });
}

/* ── Schreiben ────────────────────────────────────────────────────── */

function prozent(n, stellen) {
    /* Wie tausend(): ein Gedankenstrich statt einer Quote sieht auf dem
     * Bild aus wie Gestaltung, nicht wie ein Fehler. Prozentwerte sind
     * das, was hier ueberwiegend steht — sie brauchen denselben Riegel
     * (zweite Abnahme, 04.09.2026). */
    if (typeof n !== 'number' || !isFinite(n)) throw new Error(
        'eine Quote fehlt, die auf das Bild soll — die Quelle liefert sie nicht');
    var t = n.toFixed(stellen == null ? 2 : stellen);
    return (_en() ? t : t.replace('.', ',')) + ' %';
}
function tausend(n) {
    /* "NaN" im Bild ist schlimmer als ein gemeldeter Ausfall. Fehlt eine
     * Spalte oder ist die Datei leer, stand vorher "aus NaN Listen" auf
     * dem Post (Abnahme 04.09.2026). */
    if (typeof n !== 'number' || !isFinite(n)) throw new Error(
        'eine Zahl fehlt, die auf das Bild soll — die Quelle liefert sie nicht');
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, _en() ? ',' : '.');
}
/* DER NAME MUSS IN DIE FUSSZEILE PASSEN — JEDER NAME.
 *
 * Die erste Fassung kuerzte genau einen Praefix. Das ging gut, solange
 * der Anker ein Worlds war; mit einem Regional stand
 *
 *     "Regional Championship Indianapolis, 30.05. · 1.970 Spieler"
 *
 * in einer Zeile, die 48 Zeichen fasst — 58 gemessen. Der NENNER faellt
 * dabei vom Bild, und die Zusicherung ueber die Fusszeilenlaenge macht
 * den Deploy rot (zweite Abnahme, 04.09.2026). */
var TURNIER_KURZ = [
    [/^World\s+Championships?\s+/i,        'Worlds '],
    [/^Regional\s+Championships?\s+/i,     'Regional '],
    [/^International\s+Championships?\s+/i, 'IC '],
    [/^Special\s+Events?\s+/i,             'Special Event '],
    [/^League\s+Cup\s+/i,                  'League Cup '],
    [/^League\s+Challenge\s+/i,            'League Challenge ']
];
function kurzTurnier(name) {
    var t = String(name || 'ein Turnier').trim();
    for (var i = 0; i < TURNIER_KURZ.length; i++) {
        if (TURNIER_KURZ[i][0].test(t)) {
            return t.replace(TURNIER_KURZ[i][0], TURNIER_KURZ[i][1]).trim();
        }
    }
    return t;
}

/* Und wenn auch das nicht reicht, wird hart gekuerzt. Ein abgeschnittener
 * Turniername ist unschoen; ein abgeschnittener NENNER ist ein Fehler. */
function passtIn(text, grenze) {
    text = String(text);
    return text.length <= grenze ? text : text.slice(0, grenze - 1).trim() + '…';
}
var FUSS_MAX = 48;
function fussZeile(vorn, hinten) {
    /* `hinten` traegt den Nenner und wird nie gekuerzt. */
    var platz = FUSS_MAX - String(hinten).length - 3;
    return passtIn(vorn, Math.max(6, platz)) + ' · ' + hinten;
}
function kurzDatum(iso) {
    var m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '.' + m[2] + '.' : '';
}
function zeilenText(paare) {
    return paare.map(function (p) { return p[0] + ' | ' + p[1]; }).join('\n');
}

/* HÖCHSTENS ACHT — UND DAS MUSS DASTEHEN.
 *
 * `malListe` schneidet bei acht ab, ohne es zu sagen, und malt dabei
 * 01–08 davor. Das Bild BEHAUPTET damit eine Rangfolge unter den ersten
 * acht von wie vielen auch immer. Wer acht von 131 zeigt, ohne die 131
 * zu nennen, laesst den Leser glauben, das sei das ganze Feld. */
var MAX = 8;

/* NICHT MITTEN IN EINEN GLEICHSTAND SCHNEIDEN.
 *
 * Bei Champions steht auf Rang 8 Sneasler mit 23 Teams — und Sylveon und
 * Venusaur stehen ebenfalls bei 23. Acht Zeilen zeigen einen davon, mit
 * der Ziffer 08 davor, und behaupten damit eine Ordnung, die die Daten
 * nicht haben. Dasselbe Argument, das bei der Pocket-Tier-Liste zu
 * `ohneRang` gefuehrt hat (Abnahme 04.09.2026).
 *
 * Also wird vor der Gleichstandsgruppe geschnitten. Sieben ehrliche
 * Zeilen sind besser als acht, von denen eine erfunden ist. */
function ohneGleichstand(reihe, wert) {
    if (reihe.length <= MAX) return reihe;
    /* VERGLICHEN WIRD DER ANGEZEIGTE WERT, NICHT DER GERECHNETE.
     *
     * Die erste Fassung verglich Rohzahlen. Im Bild steht aber die
     * gerundete Form: bei den Matchups haben 37 von 100 Decks an Stelle
     * acht und neun denselben GEZEIGTEN Wert, aber nur neun denselben
     * gerechneten. In 28 Faellen stand also die Ziffer 08 ueber einem
     * Wert, den ein weggelassener Gegner im Bild identisch getragen
     * haette (zweite Abnahme, 04.09.2026). */
    var grenze = String(wert(reihe[MAX - 1]));
    if (String(wert(reihe[MAX])) !== grenze) return reihe.slice(0, MAX);
    var i = MAX - 1;
    while (i > 0 && String(wert(reihe[i - 1])) === grenze) i--;
    /* KEINE LEERE TAFEL.
     * Sind alle Werte gleich, lief `i` bis 0 und `slice(0, 0)` gab die
     * leere Liste zurueck — `malListe` bricht dann ab, waehrend Titel,
     * Spaltenkopf und Nenner weiter gemalt werden. Genau der Zustand,
     * gegen den die Leere-Datei-Wuerfe geschrieben sind. */
    if (i === 0) throw new Error(
        'alle ' + reihe.length + ' Eintraege tragen denselben Wert (' + grenze +
        ') — eine Rangliste waere hier eine Behauptung, keine Ordnung');
    return reihe.slice(0, i);
}

function kopfMitAnteil(was, gezeigt, gesamt) {
    return gesamt > gezeigt ? was + ' · ' + gezeigt + ' of ' + gesamt
                            : was + ' · all ' + gesamt;
}

/* ── Die Rezepte ──────────────────────────────────────────────────────
 *
 * Jedes gibt dasselbe Objekt zurueck. `vorlagen` sagt, welche Vorlagen
 * es wirklich gefuellt hat — die Oberflaeche markiert danach die Reiter.
 */
var REZEPTE = {};

/* ── 1 · Meistgespielt online ──────────────────────────────────────── */
REZEPTE['meta-online'] = {
    name: 'Most played online',
    gruppe: 'Online meta',
    brauchtDeck: true,
    lade: function () {
        return Promise.all([
            hole('data/limitless_online_decks.csv'),
            hole('data/limitless_meta_stats.json', true)
        ]).then(function (a) {
            var roh = liesCsv(a[0], ';'), stat = a[1];

            /* ZOMBIE-ZEILEN RAUS (Befund 04.09.2026).
             * Vier Zeilen tragen share=0,0 bei count=1. Eine davon —
             * Zoroark Lucario — steht mit 66,67 % Win Rate auf SECHS
             * Partien in der Datei und waere in einer nach Win Rate
             * sortierten Liste Platz 1. Dieselbe Bedingung wie in
             * js/app-current-meta-analysis.js:577. */
            var decks = roh.filter(function (r) {
                return r.deck_name && zahlAus(r.share_numeric) > 0;
            }).map(function (r) {
                return {
                    name: r.deck_name,
                    anteil: zahlAus(r.share_numeric),
                    listen: ganzzahl(r.count, 'count'),
                    /* WIN RATE WIE IN DER DATEI: W/(W+L+U).
                     * Naives W/(W+L) gibt fuer Dragapult 54,73 statt
                     * 53,70. Eine Zahl, zwei Rechnungen, ein Bild. */
                    winrate: zahlAus(r.win_rate_numeric)
                };
            });
            if (!decks.length) throw new Error(
                'limitless_online_decks.csv hat keine Zeile mit einem Anteil ' +
                'ueber null — eine leere Tafel unter einem Nenner ist ' +
                'schlimmer als ein gemeldeter Ausfall');
            decks.sort(function (x, y) { return y.anteil - x.anteil; });

            /* DER NENNER KOMMT AUS DER STATISTIKDATEI, NICHT AUS DER SUMME.
             *
             * Gemessen 04.09.2026: Summe der Spalte `count` = 38.398,
             * erfasste Spieler = 39.842. 1.444 Spieler (3,6 %) stehen in
             * KEINER Deckzeile, und es gibt kein "Other", das sie
             * aufsammelt. Mit der Summe als Nenner zeigt der Post fuer
             * Dragapult 7,77 % — die Seite zeigt 7,49 %.
             *
             * `window.feldGroesseAusAnteilen` rechnet das ebenfalls
             * richtig, landet aber bei 39.841 statt 39.842. Es ist eine
             * Schaetzung aus Anteil und Anzahl; hier liegt die exakte
             * Zahl im Haus. Also die Datei. */
            var nenner = stat && ganzzahl(stat.players, 'players');
            if (!nenner) throw new Error(
                'limitless_meta_stats.json ohne players — ohne diesen Nenner ' +
                'darf keine Quote auf ein Bild');

            var stand = kurzDatum(stat.generated_at);
            var acht = ohneGleichstand(decks, function (d) { return prozent(d.anteil, 2); });
            return {
                zeilen: zeilenText(acht.map(function (d) {
                    return [d.name, prozent(d.anteil, 2)];
                })),
                listeKopf: kopfMitAnteil('Share', acht.length, decks.length),
                kicker: 'Online meta · Limitless',
                titel: 'The most played decks',
                fuss: 'from ' + tausend(nenner) + ' lists · Limitless online · ' + stand,
                caption: 'The ' + acht.length + ' most played decks online — as of ' +
                    stand + ' from ' + tausend(nenner) + ' lists across ' +
                    tausend(stat.tournaments) + ' Turnieren.',
                vorlagen: ['liste', 'zahl'],
                decks: decks.map(function (d) { return d.name; }),
                zahlFuer: function (name) {
                    var d = decks.filter(function (x) { return x.name === name; })[0];
                    if (!d) return null;
                    return {
                        zahl: prozent(d.anteil, 2),
                        titel: d.name,
                        zahlLabel: d.name + "'s share",
                        zahlNenner: tausend(d.listen) + ' of ' + tausend(nenner) +
                            ' lists in the online meta\nWin rate ' +
                            prozent(d.winrate, 1) + ' — Unentschieden zählen mit'
                    };
                }
            };
        });
    }
};

/* ── 2 · Matchups eines Decks ──────────────────────────────────────── */
REZEPTE['matchups-online'] = {
    name: "A deck's matchups (online)",
    gruppe: 'Online meta',
    brauchtDeck: true,
    deckPflicht: true,
    groesse: '88 KB',
    lade: function () {
        return hole('data/limitless_online_decks_matchups.csv').then(function (t) {
            var roh = liesCsv(t, ';');
            if (!window.DsGlaettung || !window.DsGlaettung.ausEintrag) throw new Error(
                'js/matchup-glaettung.js ist nicht geladen — ungeglaettete ' +
                'Matchups duerfen nicht auf ein Bild');
            if (!roh.length) throw new Error('die Matchup-Datei ist leer');
            /* DIE SPALTE, NICHT ZEILE 0.
             * Der erste Waechter las `roh[0].record`. War Zeile 0 leer,
             * schlug er falsch an; waren die UEBRIGEN Zeilen leer, lief
             * er durch und jede Paarung wurde still 50 % — bis auf die
             * eine mit Bilanz, und die stand dann allein im Bild (zweite
             * Abnahme, 04.09.2026). */
            if (!Object.prototype.hasOwnProperty.call(roh[0], 'record')) throw new Error(
                'die Matchup-Datei hat keine Spalte `record` — ohne Bilanz ' +
                'glaettet DsGlaettung nicht, und roh stehen 3-0-Paarungen ' +
                'mit 100 % im Bild');
            var mitBilanz = roh.filter(function (r) {
                return /\d+\s*-\s*\d+/.test(String(r.record || ''));
            }).length;
            if (mitBilanz < roh.length * 0.9) throw new Error(
                'nur ' + mitBilanz + ' von ' + roh.length + ' Matchup-Zeilen ' +
                'tragen eine Bilanz — die uebrigen wuerden still auf 50 % ' +
                'gezogen und aus der Liste fallen');
            var nach = {};
            roh.forEach(function (r) {
                if (!r.deck_name || !r.opponent) return;
                (nach[r.deck_name] = nach[r.deck_name] || []).push({
                    gegner: r.opponent,
                    roh: zahlAus(r.win_rate),
                    /* DIE BILANZ MUSS MIT. Ohne sie glaettet
                     * DsGlaettung nicht — siehe unten. */
                    bilanz: r.record,
                    partien: ganzzahl(r.total_games, 'total_games')
                });
            });
            var namen = Object.keys(nach).sort(function (a, b) {
                return nach[b].length - nach[a].length || a.localeCompare(b, 'de');
            });

            function fuer(deck) {
                var reihe = (nach[deck] || []).map(function (m) {
                    /* GEGLÄTTET, NICHT ROH — UND DIESMAL WIRKLICH.
                     *
                     * BEFUND (Abnahme 04.09.2026): der erste Aufruf lautete
                     *
                     *     ausEintrag({ win_rate: m.roh, total_games: m.partien })
                     *
                     * und griff zweimal daneben. `ausEintrag` liest
                     * `record` und ersatzweise `win_rate_numeric` — beide
                     * Namen kamen nicht an, also gab die Funktion glatt
                     * 50 zurueck. Und sie gibt eine ZAHL zurueck, kein
                     * Objekt: `g.geglaettet` war undefined, `isFinite`
                     * falsch, das Ergebnis wurde verworfen. Im Bild
                     * standen also die ROHWERTE — unter einer Fusszeile,
                     * die "geglaettet k=20" behauptete.
                     *
                     * Gemessen an der echten Datei: Blaziken Zoroark
                     * zeigte "Raging Bolt Ogerpon | 100 % · 3". Genau das
                     * 3-0, gegen das js/matchup-glaettung.js geschrieben
                     * wurde, auf einem Instagram-Bild. 856 der 1.702
                     * Paarungen stehen unter zwanzig Partien; bei 80 von
                     * 100 Decks weicht die rohe Reihenfolge von der
                     * geglaetteten ab.
                     *
                     * Beide naheliegenden Einzeilen-Reparaturen liessen
                     * die Testsuite gruen. Deshalb steht unten eine
                     * Zusicherung, die 3-0 nicht als 100 % durchlaesst. */
                    var w = window.DsGlaettung.ausEintrag({ record: m.bilanz });
                    return { gegner: m.gegner, quote: w, partien: m.partien };
                });
                reihe.sort(function (x, y) { return y.quote - x.quote; });
                var acht = ohneGleichstand(reihe, function (m) {
                    return Math.round(m.quote) + '/' + Math.round(m.partien);
                });
                return {
                    zeilen: zeilenText(acht.map(function (m) {
                        /* ZEHN ZEICHEN. Die Partienzahl schwankt je Zeile
                         * zwischen 3 und 922 und muss deshalb MIT — der
                         * Nachkommastelle geht sie vor. Eine auf zwanzig
                         * Pseudopartien gezogene Quote hat ohnehin keine
                         * belastbare Nachkommastelle. */
                        return [m.gegner, Math.round(m.quote) + ' % · ' + Math.round(m.partien)];
                    })),
                    listeKopf: 'smoothed · ' + acht.length + ' of ' + reihe.length,
                    listeKopfLinks: 'Opponent',
                    kicker: 'Matchups · ' + deck,
                    titel: 'What ' + deck + ' beats',
                    /* 8 VON 20 BEKANNTEN, NICHT 8 VON ALLEN.
                     * Die Datei fuehrt je Deck nur die haeufigsten
                     * Gegner. Ohne diesen Satz haelt der Leser die acht
                     * fuer die besten ueberhaupt. */
                    fuss: 'smoothed k=20 · ' + acht.length + ' of ' + reihe.length +
                        ' erfassten Gegnern',
                    caption: "The best matchups for " + deck +
                        ' online — smoothed, with the game count per row. ' +
                        'Erfasst sind die ' + reihe.length + ' häufigsten Gegner.',
                    vorlagen: ['liste']
                };
            }
            return { decks: namen, proDeck: fuer, vorlagen: ['liste'] };
        });
    }
};

/* ── 3 · Meistgespielt auf den Worlds ──────────────────────────────── */
/* NICHT "Meta-Anteil Präsenz". Die Datei enthaelt genau EIN Turnier.
 * "Präsenz" behauptet eine Klasse von Turnieren; ein Leser vergleicht
 * das mit seiner City League, und ein Worlds-Feld wird nach Punkten
 * eingeladen. Sobald ein zweites Turnier drinsteht, darf die
 * Ueberschrift wachsen — vorher nicht. */
function labsLaden() {
    return hole('data/labs_tournament_decks_TEF-PBL.csv').then(function (t) {
        var roh = liesCsv(t, ',');            /* KOMMA, mit Anfuehrungszeichen */
        if (!roh.length) throw new Error(
            'labs_tournament_decks_TEF-PBL.csv ist leer — ohne Zeilen kein Post');

        /* EIN BILD ZEIGT EIN TURNIER.
         *
         * BEFUND (Abnahme 04.09.2026, der teuerste der Runde): die erste
         * Fassung nahm Nenner, Name und Datum aus ZEILE 0, die Deckzeilen
         * aber aus der ganzen Datei. Heute geht das gut, weil TEF-PBL
         * genau ein Turnier enthaelt — die Epoche hat gerade erst
         * begonnen. ELF DER VIERZEHN Epochendateien im Repo haben zwei
         * bis neun Turniere (labs_tournament_decks_SVI-JTG.csv: neun).
         * Das naechste Regional in diesem Formatbereich kippt es.
         *
         * Nachgestellt mit labs_tournament_decks_TEF-POR.csv (sieben
         * Turniere):
         *
         *     01 Dragapult | 389      Kopf: "Spieler · von 485"
         *     02 Dragapult | 190      Fuss: "Special Event Lima, 23.05."
         *     03 Dragapult | 188
         *
         * 389 stammt aus Indianapolis, 485 ist Limas Feldgroesse.
         * Dragapults echter Anteil in Lima: 20,0 %. Der Post haette
         * 80,2 % behauptet — Faktor vier, mit einem Nenner daneben, der
         * die Zahl beglaubigt. Genau die Fehlerklasse aus
         * js/ds-share.js:520.
         *
         * Genommen wird deshalb das JUENGSTE Turnier der Datei, und nur
         * dessen Zeilen. */
        /* OHNE tournament_id GREIFT DER FILTER NICHT — also erst pruefen.
         * Fehlt die Spalte, ist `jung.tournament_id` undefined und der
         * Vergleich unten wahr fuer JEDE Zeile: die Datei waere wieder
         * ungefiltert, und der Befund von oben stuende wieder da, ohne
         * dass irgendetwas auffiele (zweite Abnahme, 04.09.2026). */
        if (!roh[0].tournament_id) throw new Error(
            'labs_tournament_decks_TEF-PBL.csv hat keine Spalte `tournament_id` — ' +
            'ohne sie laesst sich ein Turnier nicht von den anderen trennen, und ' +
            'ein Bild wuerde Zeilen mehrerer Turniere unter einem Nenner zeigen');
        if (!roh[0].tournament_date) throw new Error(
            'labs_tournament_decks_TEF-PBL.csv hat keine Spalte `tournament_date` — ' +
            'ohne sie ist nicht zu sagen, welches Turnier das juengste ist');

        /* NACH DATUM, DANN NACH KENNUNG.
         * Der Vergleich laeuft ueber ISO-Zeichenketten (JJJJ-MM-TT); eine
         * andere Schreibweise wuerde still falsch sortieren, deshalb wird
         * sie oben zurueckgewiesen. Bei zwei Turnieren am selben Tag —
         * das kommt in neun der vierzehn Epochendateien vor — entscheidet
         * die Kennung, damit die Wahl wiederholbar ist und nicht von der
         * Zeilenreihenfolge abhaengt. */
        roh.forEach(function (r) {
            if (!/^\d{4}-\d{2}-\d{2}/.test(String(r.tournament_date || ''))) {
                throw new Error(
                    'unerwartetes Datumsformat in labs_tournament_decks_TEF-PBL.csv: ' +
                    JSON.stringify(r.tournament_date) + ' — erwartet wird JJJJ-MM-TT, ' +
                    'sonst waehlt die Sortierung das falsche Turnier');
            }
        });
        var jung = roh.slice().sort(function (a, b) {
            var d = String(b.tournament_date).localeCompare(String(a.tournament_date));
            return d || String(b.tournament_id).localeCompare(String(a.tournament_id));
        })[0];
        var id = jung.tournament_id;
        var meins = roh.filter(function (r) { return r.tournament_id === id; });

        var decks = meins.filter(function (r) {
            return r.deck_name && r.deck_name !== 'Other' && zahlAus(r.player_count) > 0;
        });
        if (!decks.length) throw new Error(
            'das juengste Turnier in labs_tournament_decks_TEF-PBL.csv hat ' +
            'keine Deckzeilen');

        var gesamt = ganzzahl(jung.total_players, 'total_players');
        if (gesamt <= 0) throw new Error(
            'total_players ist null — ohne Feldgroesse darf kein Anteil auf ein Bild');

        /* DER KURZE NAME FUER DIE FUSSZEILE.
         * Sie fasst rund 48 Zeichen (Mono 22 auf 640 px). "World
         * Championship San Francisco, 28.08. · 774 Spieler" hat 54 und
         * wuerde stumm abgeschnitten. Der Kicker wird zeichenweise
         * gesperrt und kostet doppelt — auch er nimmt den kurzen. */
        var voll = jung.tournament_name || 'Turnier';
        return {
            decks: decks,
            turnier: voll,
            kurz: kurzTurnier(voll),
            gesamt: gesamt,
            datum: kurzDatum(jung.tournament_date),
            /* Wie viele Turniere die Datei fuehrt — fuer den Fall, dass
             * die Ueberschrift eines Tages wachsen darf. */
            turniere: Object.keys(roh.reduce(function (a, r) {
                if (r.tournament_id) a[r.tournament_id] = 1; return a;
            }, {})).length
        };
    });
}

REZEPTE['worlds-tag1'] = {
    name: 'Most played at Worlds',
    gruppe: 'Events',
    brauchtDeck: true,
    lade: function () {
        return labsLaden().then(function (d) {
            var reihe = d.decks.map(function (r) {
                return {
                    name: r.deck_name,
                    spieler: ganzzahl(r.player_count, 'player_count'),
                    /* DIE SPALTE win_pct IST NICHT DIE SIEGQUOTE.
                     * Sie fuehrt Matchpunkte (3S+U)/3n. Dragapult steht
                     * dort mit 46,41; die Siegquote ist 541/1277 = 42,4.
                     * Vier Punkte, und sie tragen verschiedene
                     * Geschichten. Also selbst rechnen. */
                    siege: zahlAus(r.wins),
                    partien: zahlAus(r.wins) + zahlAus(r.losses) + zahlAus(r.ties)
                };
            });
            reihe.sort(function (x, y) { return y.spieler - x.spieler; });
            var acht = ohneGleichstand(reihe, function (r) { return r.spieler; });
            return {
                zeilen: zeilenText(acht.map(function (r) {
                    /* DIE SPIELERZAHL, NICHT DER PROZENTWERT.
                     * "172" mit dem Kopf "Spieler · von 774" erfuellt die
                     * Hausregel restlos und braucht keine zehn Zeichen.
                     * Wer 172 von 774 sieht, rechnet 22 % im Kopf — und
                     * weiss dabei die ganze Zeit, worauf es sich
                     * bezieht. Ein nackter Prozentwert kann das nie. */
                    return [r.name, String(Math.round(r.spieler))];
                })),
                listeKopf: 'players · of ' + tausend(d.gesamt),
                /* AUS DER DATEI, NICHT FEST VERDRAHTET. Vorher stand hier
                 * 'Worlds San Francisco', waehrend die Fusszeile aus der
                 * Datei kam — beim Nachstellen mit TEF-POR standen zwei
                 * verschiedene Turniere auf einem Bild. */
                kicker: d.kurz,
                titel: d.datum ? d.kurz + ', Tag 1' : d.kurz,
                fuss: fussZeile(d.kurz + ', ' + d.datum, tausend(d.gesamt) + ' players'),
                caption: 'The most played decks at ' + d.turnier + ' on ' + d.datum +
                    ' — ' + tausend(d.gesamt) + ' Spieler, ein Turnier.',
                vorlagen: ['liste', 'zahl'],
                decks: reihe.map(function (r) { return r.name; }),
                zahlFuer: function (name) {
                    var r = reihe.filter(function (x) { return x.name === name; })[0];
                    if (!r) return null;
                    return {
                        zahl: prozent(100 * r.spieler / d.gesamt, 1),
                        titel: name,
                        zahlLabel: name + ' auf den Worlds',
                        /* DER KURZE NAME AUCH HIER.
                         * Mit dem vollen sind es 57 Zeichen; `malZahl`
                         * bricht dann um, und die zweite Zeile
                         * ("Siegquote 42,4 % …") wird Zeile drei und
                         * ohne Auslassungszeichen weggeworfen. Genau die
                         * Zahl, fuer die die win_pct-Reparatur da ist. */
                        zahlNenner: Math.round(r.spieler) + ' of ' + tausend(d.gesamt) +
                            ' players, ' + d.kurz + '\nWin rate ' +
                            prozent(100 * r.siege / r.partien, 1) +
                            ' — Unentschieden zählen mit'
                    };
                }
            };
        });
    }
};

/* ── 4 · Wer es in Tag 2 schaffte ──────────────────────────────────── */
/* Der sauberste Post, den dieses Repository hergibt: ganze Zahlen ueber
 * ganzen Zahlen, ein Turnier, ein Datum, keine Glaettung, kein Modell.
 * Dragapult ist mit 172 Spielern das meistgespielte Deck und bringt 22
 * davon in Tag 2 — 12,8 %, waehrend Alakazam Dudunsparce 14 von 53
 * schafft. Diese Geschichte versteht ein Turnierspieler sofort.
 *
 * ABER: "am zweitschlechtesten" gilt nur ueber einer Schwelle. Ueber
 * alle 44 Zeilen stehen Decks mit 0 % darunter, die einen Tag-1-Spieler
 * hatten. Die Schwelle steht deshalb IM SPALTENKOPF, nicht im Kopf des
 * Betrachters. */
var TAG2_MIN = 30;
REZEPTE['tag2'] = {
    name: 'Who made Day 2',
    gruppe: 'Events',
    lade: function () {
        return labsLaden().then(function (d) {
            var alle = d.decks.map(function (r) {
                return {
                    name: r.deck_name,
                    tag1: ganzzahl(r.day1_players, 'day1_players'),
                    tag2: ganzzahl(r.day2_players, 'day2_players')
                };
            }).filter(function (r) { return isFinite(r.tag1) && r.tag1 > 0; });
            var reihe = alle.filter(function (r) { return r.tag1 >= TAG2_MIN; });
            reihe.sort(function (x, y) {
                return (y.tag2 / y.tag1) - (x.tag2 / x.tag1);
            });
            var acht = ohneGleichstand(reihe, function (r) {
                return Math.round(r.tag2) + '/' + Math.round(r.tag1);
            });
            return {
                zeilen: zeilenText(acht.map(function (r) {
                    /* ZÄHLER UND NENNER IN DER WERTSPALTE — neun Zeichen.
                     * "14 von 53" braucht keinen Prozentwert und keine
                     * Fussnote. */
                    return [r.name, Math.round(r.tag2) + ' of ' + Math.round(r.tag1)];
                })),
                /* NACH QUOTE SORTIERT, ALS BRUCH GEZEIGT — das muss
                 * dastehen. Sonst liest "01 Alakazam 14 von 53" ueber
                 * "07 Dragapult 22 von 172" wie ein Fehler (zweite
                 * Abnahme, 04.09.2026). */
                listeKopf: kopfMitAnteil('by rate', acht.length, reihe.length),
                kicker: d.kurz,
                titel: 'Who made Day 2',
                fuss: fussZeile(d.kurz + ', ' + d.datum, TAG2_MIN + '+ players'),
                /* Die Zeilen sind nach Quote sortiert, aber gezeigt wird
                 * der Bruch — der Spaltenkopf sagt jetzt, wie viele
                 * Decks die Schwelle ueberhaupt genommen haben. */
                caption: 'Who reached the second day at ' + d.turnier + ' — ' +
                    'gezählt ab ' + TAG2_MIN + ' Spielern am Deck, sonst entscheidet ' +
                    'ein einzelner Spieler die Quote.',
                vorlagen: ['liste']
            };
        });
    }
};

/* ── 5 · Wie oft ein Deck in die Top 8 kommt ───────────────────────── */
/* DIE ZAHL, DIE DIE SEITE ZEIGT, DARF NICHT AUF DAS BILD.
 *
 * Befund der Abnahme am 04.09.2026, nachgerechnet an der echten Datei:
 * `window.computeConversionPerformance` liefert `perfPct` — die relative
 * Abweichung vom Feldschnitt, nicht eine Quote.
 *
 *     Dragapult Blaziken   perfPct  +68,0 %
 *                          echte Top-8-Quote  10,7 %   (47,0 von 441,0)
 *                          Feldschnitt         6,1 %
 *
 * Auf der Seite steht die Erklaerung daneben. Auf einem Instagram-Bild
 * liest das jeder als "macht in 68 % der Faelle Top 8" — Faktor sechs,
 * und niemand kann es nachschlagen.
 *
 * Genau dieser Fehler ist diesem Projekt schon einmal passiert;
 * js/ds-share.js:520 traegt den Befund: "META GESAMT 7.178 WAR EINE
 * FALSCHE BESCHRIFTUNG […] Faktor fuenf."
 *
 * Auf das Bild kommt deshalb die ECHTE Quote aus derselben Datei, und
 * der Feldschnitt steht daneben — sonst bedeutet 10,7 % nichts. */
REZEPTE['top8'] = {
    name: 'How often a deck makes Top 8',
    gruppe: 'Events',
    brauchtDeck: true,
    lade: function () {
        return hole('data/online_tournament_top8_decks.csv').then(function (t) {
            var roh = liesCsv(t, ';');
            var zeilen = roh.filter(function (r) { return r.deck_name; }).map(function (r) {
                return {
                    name: r.deck_name,
                    antritte: zahlAus(r.total_brought_weighted),
                    top8: zahlAus(r.top8_count_weighted),
                    gesehen: r.last_seen_date
                };
            });
            var gesamtAntritte = 0, gesamtTop8 = 0;
            zeilen.forEach(function (r) {
                if (isFinite(r.antritte)) gesamtAntritte += r.antritte;
                if (isFinite(r.top8)) gesamtTop8 += r.top8;
            });
            var feldschnitt = gesamtAntritte > 0 ? 100 * gesamtTop8 / gesamtAntritte : 0;

            /* MINDESTSTICHPROBE. Ohne sie steht Jellicent Dusknoir mit
             * 18,2 % auf elf Antritten oben. Dieselbe Schwelle wie in
             * js/app-utils.js (CONV_MIN_N = 20), gerechnet auf den
             * GEWICHTETEN Antritten — halbe Antritte sind hier echt. */
            /* DIE SCHWELLE STEHT HIER, NICHT GELIEHEN.
             * Vorher las diese Zeile `window.CONV_MIN_N` mit Rueckfall
             * auf 20. Die Post-Seite laedt js/app-utils.js aber nie —
             * die Konstante ist dort immer undefined, der Rueckfall
             * greift immer, und die Kopplung war Fiktion: aendert jemand
             * CONV_MIN_N, folgt diese Seite nicht (Abnahme 04.09.2026).
             * Also die Zahl offen hinschreiben, mit dem Verweis, wo ihre
             * Schwester steht — und eine Zusicherung, die beide
             * vergleicht. */
            var MIN = 20;              /* = CONV_MIN_N in js/app-utils.js */
            var reihe = zeilen.filter(function (r) {
                return isFinite(r.antritte) && r.antritte >= MIN;
            }).map(function (r) {
                return {
                    name: r.name,
                    quote: 100 * r.top8 / r.antritte,
                    antritte: r.antritte
                };
            });
            if (!reihe.length) throw new Error(
                'kein Deck in online_tournament_top8_decks.csv erreicht ' +
                MIN + ' gewichtete Antritte');
            reihe.sort(function (x, y) { return y.quote - x.quote; });
            var acht = ohneGleichstand(reihe, function (r) { return prozent(r.quote, 1); });

            /* DIE DATEI HAT KEINEN EINEN STAND. `last_seen_date` streut
             * ueber 28 Tage; nur 37 der 121 Zeilen sind von heute. Der
             * Fuss nennt deshalb die Spanne, nicht ein Datum. */
            var daten = zeilen.map(function (r) { return r.gesehen; })
                .filter(Boolean).sort();
            var spanne = daten.length
                ? kurzDatum(daten[0]) + '–' + kurzDatum(daten[daten.length - 1]) : '';

            return {
                zeilen: zeilenText(acht.map(function (r) {
                    return [r.name, prozent(r.quote, 1)];
                })),
                listeKopf: kopfMitAnteil('Top 8', acht.length, reihe.length),
                kicker: 'Online · Events',
                titel: 'Who makes Top 8',
                fuss: 'Feld: ' + prozent(feldschnitt, 1) + ' · ab ' + MIN +
                    ' Antritten · ' + spanne,
                caption: 'How often a deck makes Top 8 online. The field average ' +
                    'liegt bei ' + prozent(feldschnitt, 1) + ' — gezählt ab ' + MIN +
                    ' Antritten, weil darunter ein einzelnes Turnier die Quote macht.',
                vorlagen: ['liste', 'zahl'],
                decks: reihe.map(function (r) { return r.name; }),
                zahlFuer: function (name) {
                    var r = reihe.filter(function (x) { return x.name === name; })[0];
                    if (!r) return null;
                    return {
                        zahl: prozent(r.quote, 1),
                        titel: name,
                        zahlLabel: name + ' — Top 8',
                        zahlNenner: 'from ' + r.antritte.toFixed(1) +
                            ' gewichteten Antritten online\nDer Feldschnitt liegt bei ' +
                            prozent(feldschnitt, 1)
                    };
                }
            };
        });
    }
};

/* ── 6 · Format-Staples ────────────────────────────────────────────── */
/* DER NENNER HEISST "ARCHETYPEN", NICHT "DECKS".
 *
 * Das ist am 28.08.2026 schon einmal aufgeschlagen und wurde damals im
 * Widget geloest: "Ohne den Zusatz liest sich '100 % der Archetypen' als
 * 133 von 133". Auf einem Bild ohne Kachel daneben gilt das doppelt.
 * Deshalb steht hier "60 von 60" in der Wertspalte und "Archetypen" im
 * Kopf — kein Prozentwert.
 *
 * UND NUR EIN META. Die Datei mischt "Meta Live" (3.248 Zeilen) mit
 * "Meta Play!" (1.154). Ueber beide gezaehlt ist der Nenner eine Zahl,
 * die es nirgends gibt. */
REZEPTE['staples'] = {
    name: 'Format staples',
    gruppe: 'Cards',
    groesse: '788 KB',
    lade: function () {
        return hole('data/current_meta_card_data.csv').then(function (t) {
            var roh = liesCsv(t, ';').filter(function (r) {
                return r.meta === 'Meta Live' && r.archetype && r.archetype !== 'Other'
                    && r.card_name;
            });
            if (!roh.length) throw new Error(
                'current_meta_card_data.csv hat keine Zeilen fuer "Meta Live"');
            var archetypen = {}, karten = {};
            roh.forEach(function (r) {
                archetypen[r.archetype] = 1;
                /* GEZAEHLT WIRD JE NAME, NICHT JE DRUCK.
                 *
                 * Die Frage lautet "in wie vielen Archetypen steckt diese
                 * KARTE" — und auf dem Bild steht ihr Name. Ein zweiter
                 * Druck derselben Karte teilte den Zaehler: Chi-Yu steht
                 * in der Datei dreifach (MEG 31 mit 8, TWM 39 mit 5,
                 * PBL 59 mit 3 Archetypen) und fiel deshalb aus den
                 * ersten acht, obwohl es zusammen 16 sind. 17 Namen sind
                 * heute so gespalten (Abnahme 04.09.2026).
                 *
                 * Das ist NICHT der von CLAUDE.md verbotene
                 * Namens-Join: dort geht es um Identitaet und Preis
                 * ("PBL hat vier Produkte namens Mega Darkrai ex"), hier
                 * um eine Haeufigkeit ueber Archetypen. Zwei Drucke
                 * derselben Karte sind fuer diese Frage dieselbe Karte,
                 * und gezaehlt werden ohnehin ARCHETYPEN, nicht Zeilen —
                 * ein Archetyp mit beiden Drucken zaehlt einmal. */
                if (!karten[r.card_name]) karten[r.card_name] = { name: r.card_name, in: {} };
                karten[r.card_name].in[r.archetype] = 1;
            });
            var gesamt = Object.keys(archetypen).length;
            var reihe = Object.keys(karten).map(function (k) {
                return { name: karten[k].name, zahl: Object.keys(karten[k].in).length };
            });
            reihe.sort(function (x, y) {
                return y.zahl - x.zahl || x.name.localeCompare(y.name, 'de');
            });
            var acht = ohneGleichstand(reihe, function (r) { return r.zahl; });
            return {
                zeilen: zeilenText(acht.map(function (r) {
                    return [r.name, r.zahl + ' of ' + gesamt];
                })),
                listeKopf: 'archetypes · of ' + gesamt,
                listeKopfLinks: 'Card',
                kicker: 'Cards · Format staples',
                titel: 'In almost every deck',
                fuss: 'in how many of ' + gesamt + ' archetypes · Meta Live',
                caption: 'The cards that sit in almost every archetype — counted across ' +
                    gesamt + ' archetypes with a decklist in the current meta.',
                vorlagen: ['liste']
            };
        });
    }
};

/* ── 7 · Champions-Teams ───────────────────────────────────────────── */
/* DER ANTEIL IST 48 VON 114, NICHT 100 %.
 *
 * `rankTeams().share` in js/app-side-quest-usage.js ist `count / max` —
 * eine BALKENLAENGE fuer die Anzeige. Kingambit steht dort bei 1.0; der
 * Anteil ist 48 von 114 Teams = 42,1 %. Wer die Balkenlaenge auf ein
 * Bild malt, schreibt "100 %" ueber ein Pokemon, das in 58 % der Teams
 * NICHT vorkommt. Deshalb wird hier selbst gezaehlt, und in der
 * Wertspalte steht der Bruch.
 *
 * UND DIE 114 TEAMS SIND NICHT EIN TURNIER. Sie stammen aus 25
 * verschiedenen — 68 von den Worlds, der Rest aus Community-Cups mit ein
 * bis vier Teams. Das gehoert in den Fuss, sonst liest sich die Liste
 * als "so sah ein Turnier aus". */
REZEPTE['champions'] = {
    name: 'Champions teams',
    gruppe: 'Champions',
    groesse: '295 KB',
    lade: function () {
        return hole('data/champions_replica_teams.json', true).then(function (d) {
            var teams = d.teams || [], zaehl = {}, turniere = {}, ohneTurnier = 0;
            if (!teams.length) throw new Error(
                'champions_replica_teams.json hat keine Teams');
            teams.forEach(function (t) {
                /* "-" IST KEIN TURNIER.
                 * 13 der 114 Teams tragen den Platzhalter, und die erste
                 * Fassung zaehlte ihn als 25. Turnier mit. Echt sind 24
                 * Turniere plus 13 Teams ohne Angabe. Ein falscher Nenner
                 * in der Fusszeile ist genau das, wogegen die Hausregel
                 * gebaut ist (Abnahme 04.09.2026). */
                var tn = String(t.tournament || '').trim();
                if (tn && tn !== '-') turniere[tn] = 1; else ohneTurnier++;
                var gesehen = {};
                (t.pokemon || []).forEach(function (p) {
                    var n = p.name || p.slug;
                    if (!n || gesehen[n]) return;      /* je Team einmal */
                    gesehen[n] = 1;
                    zaehl[n] = (zaehl[n] || 0) + 1;
                });
            });
            var reihe = Object.keys(zaehl).map(function (n) {
                return { name: n, zahl: zaehl[n] };
            });
            reihe.sort(function (x, y) {
                return y.zahl - x.zahl || x.name.localeCompare(y.name, 'de');
            });
            if (!reihe.length) throw new Error(
                'kein Team in champions_replica_teams.json traegt ein Pokemon');
            var acht = ohneGleichstand(reihe, function (r) { return r.zahl; });
            var n = teams.length, tz = Object.keys(turniere).length;
            var reg = (d._meta && d._meta.current_regulation) || '';
            return {
                zeilen: zeilenText(acht.map(function (r) {
                    return [r.name, r.zahl + ' of ' + n];
                })),
                listeKopf: 'teams · of ' + n,
                listeKopfLinks: 'Pokémon',
                kicker: 'Pokémon Champions' + (reg ? ' · ' + reg : ''),
                titel: 'The most played Pokémon',
                fuss: n + ' Teams, ' + tz + ' Turniere' +
                    (ohneTurnier ? ' + ' + ohneTurnier + ' ohne' : '') +
                    ' · ' + kurzDatum(d._meta && d._meta.last_updated),
                caption: 'The most played Pokémon in ' + n +
                    ' Replica-Teams aus ' + tz + ' Turnieren' +
                    (ohneTurnier ? ' (' + ohneTurnier + ' Teams ohne Turnierangabe)' : '') +
                    ' — von den Worlds bis zu kleinen Community-Cups.',
                vorlagen: ['liste']
            };
        });
    }
};

/* ── 8 · Pocket-Tier-Liste ─────────────────────────────────────────── */
/* KEINE RANGFOLGE UND KEIN ANGESCHNITTENER RANG.
 *
 * Zwei Befunde der Abnahme am 04.09.2026:
 *
 * 1. Innerhalb einer Stufe gibt es KEINE Ordnung. Die Liste-Vorlage
 *    malt sonst 01–08 davor und erfindet damit eine Rangfolge, die in
 *    der Quelle nicht existiert. Deshalb `ohneRang`.
 *
 * 2. Der Achterschnitt faellt mitten in eine Stufe: S=4, A+=5 ergibt
 *    neun. Acht Zeilen liessen ein A+-Deck weg, das genau gleich
 *    eingestuft ist — auf einem Bild ohne Fussnote heisst das "dieses
 *    Deck ist schlechter". Also wird an einer Stufengrenze
 *    geschnitten, nicht bei acht.
 *
 * Dazu die Auflage der Datei selbst (_meta.quelle_hinweis): "Die
 * Tier-Einstufung ist die redaktionelle Einschaetzung von Game8, keine
 * von uns gemessene Zahl. Die Oberflaeche muss das anschreiben." */
var TIER_ORDNUNG = ['S', 'A+', 'A', 'B', 'C', 'D'];
REZEPTE['pocket'] = {
    name: 'Pocket tier list',
    gruppe: 'Pocket',
    lade: function () {
        return hole('data/pocket_tierlist.json', true).then(function (d) {
            var decks = (d.decks || []).slice();
            if (!decks.length) throw new Error('pocket_tierlist.json hat keine Decks');
            /* EINE UNBEKANNTE STUFE DARF NICHT STILL VERSCHWINDEN.
             * Fuehrt Game8 eines Tages "SS" ein, sortierte sie vorher
             * ans Ende und wurde nie genommen: die Ausgabe zeigte "Stufe
             * S", waehrend die hoechste Stufe fehlte — und der Test blieb
             * gruen, weil er nur zaehlt, ob die GEZEIGTEN Stufen ganz
             * sind (Abnahme 04.09.2026). */
            var fremd = decks.map(function (dk) { return dk.tier; })
                .filter(function (t) { return TIER_ORDNUNG.indexOf(t) < 0; });
            if (fremd.length) throw new Error(
                'unbekannte Tier-Stufe in pocket_tierlist.json: ' +
                fremd.slice(0, 3).join(', ') + '. Die Reihenfolge in ' +
                'TIER_ORDNUNG muss ergaenzt werden, sonst faellt die Stufe ' +
                'stumm aus der Liste');
            decks.sort(function (x, y) {
                var a = TIER_ORDNUNG.indexOf(x.tier), b = TIER_ORDNUNG.indexOf(y.tier);
                return (a < 0 ? 99 : a) - (b < 0 ? 99 : b)
                    || String(x.name).localeCompare(String(y.name), 'de');
            });
            /* An der letzten Stufengrenze schneiden, die noch in acht
             * Zeilen passt. */
            var genommen = [], halt = false;
            TIER_ORDNUNG.forEach(function (stufe) {
                if (halt) return;
                var dieser = decks.filter(function (o) { return o.tier === stufe; });
                if (!dieser.length) return;
                if (genommen.length + dieser.length > MAX) { halt = true; return; }
                genommen = genommen.concat(dieser);
            });
            /* KEIN RUECKFALL AUF slice(0, MAX).
             * Der haette die oberste Stufe angeschnitten, sobald sie
             * mehr als acht Decks hat — genau das, was dieses Rezept
             * verhindern soll. Dann lieber ein gemeldeter Ausfall. */
            if (!genommen.length) throw new Error(
                'die oberste Tier-Stufe hat mehr als ' + MAX + ' Decks — eine ' +
                'Achterliste muesste sie anschneiden, und innerhalb einer ' +
                'Stufe gibt es keine Ordnung. Die Vorlage braucht mehr Zeilen ' +
                'oder der Post eine andere Stufe');
            var stufen = [];
            genommen.forEach(function (dk) {
                if (stufen.indexOf(dk.tier) < 0) stufen.push(dk.tier);
            });
            var stand = kurzDatum(d._meta && d._meta.abgerufen);
            return {
                zeilen: zeilenText(genommen.map(function (dk) {
                    return [dk.name, dk.tier];
                })),
                listeKopf: 'Game8 tier · ' + genommen.length + ' of ' + decks.length,
                ohneRang: true,
                kicker: 'Pocket · Game8 tier list',
                titel: 'Tier ' + stufen.join(' and '),
                fuss: 'Game8s Einschätzung, nicht gemessen · ' + stand,
                caption: 'The decks in tier ' + stufen.join(' and ') +
                    ' in Pokémon TCG Pocket — die redaktionelle Einschätzung von ' +
                    'Game8, not a number we measured. As of ' + stand,
                vorlagen: ['liste']
            };
        });
    }
};

/* ── 9 · Day-2-Chance (Prognose) ───────────────────────────────────── */
/* EINE PROGNOSE, UND SIE MUSS SICH SO NENNEN.
 *
 * `rangliste` hat FUENF Eintraege, nicht acht — sie ist bereits bei
 * `min_ankerspieler_anzeige` (30) abgeschnitten. Die vollstaendige
 * Rangliste beginnt mit Crustle (26,93 auf zwanzig Spielern) und ist
 * genau die Falle, gegen die die Schwelle gebaut wurde. Also fuenf
 * Zeilen, und die Schwelle steht im Kopf.
 *
 * Dazu der Vorbehalt, zu dem die Seite selbst gerade verpflichtet ist
 * (js/app-deckempfehlung.js: VORBEHALT_AB = 10, heute 12,09 %): ein
 * Achtel des Onlinefelds ist neu, gegen diese Decks ist der Pick
 * ungetestet. */
REZEPTE['day2-prognose'] = {
    name: 'Day-2 chance (forecast)',
    gruppe: 'Events',
    brauchtDeck: true,
    lade: function () {
        return hole('data/deckempfehlung.json', true).then(function (d) {
            var reihe = (d.rangliste || []).map(function (r) {
                return {
                    name: r.deck,
                    wert: r.day2_geschrumpft,       /* nicht day2_roh */
                    spieler: r.ankerspieler
                };
            });
            var anker = (d.anker || [])[0] || {};
            var unbekannt = d.online_abdeckung && d.online_abdeckung.anteil_unbekannt;
            var schwelle = d.min_ankerspieler_anzeige || 30;
            var vorbehalt = (unbekannt != null)
                ? prozent(unbekannt, 1) + ' des Onlinefelds sind neu — dagegen ungetestet'
                : '';
            if (!reihe.length) throw new Error(
                'deckempfehlung.json hat keine Rangliste ueber der Schwelle');
            /* MAX GILT AUCH HIER.
             * scripts/build_deckempfehlung.py schneidet `rangliste` bei
             * ZEHN ab, nicht bei fuenf — heute sind es fuenf, weil nur
             * fuenf Decks die 30-Spieler-Schwelle nehmen. Bei zehn haette
             * malListe zwei Zeilen stumm weggeworfen und 01–08 davor
             * gemalt (Abnahme 04.09.2026). */
            var gezeigt = ohneGleichstand(reihe, function (r) { return r.wert; });
            return {
                zeilen: zeilenText(gezeigt.map(function (r) {
                    return [r.name, prozent(r.wert, 1)];
                })),
                listeKopf: kopfMitAnteil('Day 2', gezeigt.length, reihe.length),
                kicker: 'Forecast · ' + kurzTurnier(anker.name),
                titel: 'Day-2 chance',
                fuss: fussZeile('Forecast · ' + kurzTurnier(anker.name),
                                'ab ' + schwelle + ' Spielern'),
                caption: 'The estimated Day-2 chance per deck — a model, not a ' +
                    'Messung. Gerechnet ab ' + schwelle + ' Spielern am Deck. ' +
                    (vorbehalt ? vorbehalt + '.' : ''),
                vorlagen: ['liste', 'zahl'],
                decks: reihe.map(function (r) { return r.name; }),
                zahlFuer: function (name) {
                    var r = reihe.filter(function (x) { return x.name === name; })[0];
                    if (!r) return null;
                    return {
                        zahl: prozent(r.wert, 1),
                        titel: name,
                        zahlLabel: 'Day-2-Chance: ' + name,
                        /* Der KURZE Turniername. Die Zeile fasst rund
                         * 56 Zeichen; mit "World Championship San
                         * Francisco" waren es 69, und die dritte Zeile
                         * wirft malZahl ohne Auslassungszeichen weg. */
                        zahlNenner: Math.round(r.spieler) + ' of ' +
                            tausend(anker.spieler || 0) + ' Spielern, ' +
                            kurzTurnier(anker.name) + ', geschrumpft' +
                            (vorbehalt ? '\n' + vorbehalt : '')
                    };
                }
            };
        });
    }
};

/* GLEICHE WERTE, KEINE RANGZIFFERN.
 *
 * Der Gleichstandsschnitt verhindert, dass eine Gruppe an der GRENZE
 * angeschnitten wird. Er sagt nichts ueber Gleichstaende INNERHALB der
 * gezeigten Zeilen — und dort behaupten die Ziffern 01…08 genauso eine
 * Ordnung, die die Daten nicht haben. Live gefunden (zweite Abnahme,
 * 04.09.2026):
 *
 *     03 Basculegion | 41 von 114
 *     04 Charizard   | 41 von 114     <- sortiert nach Alphabet
 *
 * Sortiert wird dort per `localeCompare` — das Alphabet, als Rangfolge
 * gemalt. Also: kommt ein Wert in der Ausgabe zweimal vor, fallen die
 * Ziffern weg. Dieselbe Regel, die die Pocket-Tier-Liste braucht, nur
 * hergeleitet statt von Hand gesetzt.
 *
 * Das steht hier und nicht in jedem Rezept, damit es auch fuer die
 * zehnte Quelle gilt, die noch niemand geschrieben hat. */
function rangPruefen(erg) {
    if (!erg || typeof erg.zeilen !== 'string' || erg.ohneRang) return erg;
    var werte = erg.zeilen.split('\n').filter(Boolean).map(function (z) {
        var t = z.split('|');
        return (t[1] || '').trim();
    });
    if (new Set(werte).size !== werte.length) erg.ohneRang = true;
    return erg;
}

/* ── Nach aussen ──────────────────────────────────────────────────── */
window.DsPostQuellen = {
    REZEPTE: REZEPTE,
    /* Fuer die Tests und fuer die Oberflaeche. */
    liesCsv: liesCsv,
    zerlege: zerlege,
    zahlAus: zahlAus,
    prozent: prozent,
    tausend: tausend,
    kurzTurnier: kurzTurnier,
    MAX: MAX,
    liste: function () {
        return Object.keys(REZEPTE).map(function (id) {
            var r = REZEPTE[id];
            return {
                id: id, name: r.name, gruppe: r.gruppe,
                groesse: r.groesse || null,
                brauchtDeck: !!r.brauchtDeck,
                deckPflicht: !!r.deckPflicht
            };
        });
    },
    rangPruefen: rangPruefen,
    lade: function (id) {
        var r = REZEPTE[id];
        if (!r) return Promise.reject(new Error('unbekannte Quelle: ' + id));
        return r.lade().then(function (erg) {
            if (erg.proDeck) {
                var roh = erg.proDeck;
                erg.proDeck = function (deck) { return rangPruefen(roh(deck)); };
                return erg;
            }
            return rangPruefen(erg);
        });
    }
};

})();
