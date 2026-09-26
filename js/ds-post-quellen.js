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
    /* DER ANHANG DER QUELLE GEHOERT NICHT ZUM NAMEN (26.09.2026).
     *
     * Limitless haengt an jeden Turniernamen seinen eigenen: „Regional
     * Baltimore, MD – Limitless". Live gemessen ergab das im Kicker
     * „BASIC BOX · REGIONAL BALTIMORE, MD – LIM…" — 59 Zeichen in einer
     * Zeile, die 40 fasst, und das Datum fiel vom Bild.
     *
     * Weg kommt zweierlei: der Anhang „– Limitless" und die
     * Bundesstaats-Abkuerzung hinter dem Komma. Beides sagt dem Leser
     * eines Posts nichts, was der Ortsname nicht schon sagt. */
    t = t.replace(/\s*[\u2013\u2014-]\s*Limitless\s*$/i, '').trim();
    t = t.replace(/,\s*[A-Z]{2}$/, '').trim();
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

/* DER KICKER FASST VIERZIG ZEICHEN — GEMESSEN, NICHT GESCHAETZT.
 *
 * `malKopf` in posts/index.html sperrt den Kicker (jedes Zeichen mit
 * einem Leerzeichen dahinter), verkleinert ihn von 24 px bis 15 px und
 * schneidet dann bei 660 px ab. Am 26.09.2026 live an
 * thedipidis.app/posts/ mit der echten Schrift nachgemessen:
 *
 *     40 Zeichen -> 652 px bei 15 px   passt
 *     42 Zeichen -> 685 px bei 15 px   abgeschnitten
 *
 * Gefunden wurde die Grenze, weil sie gerissen war: „MEGA EXCADRILL ·
 * TOP 8 · LAST 7 DAYS · O." stand im Bild, und beim Major fiel das
 * Datum ganz weg. Sie steht jetzt neben FUSS_MAX, damit die naechste
 * Quelle sie nicht wieder selbst herausfinden muss. */
var KICKER_MAX = 40;
function kickerZeile(vorn, hinten) {
    if (!hinten) return passtIn(String(vorn || ''), KICKER_MAX);
    if (!vorn) return passtIn(String(hinten), KICKER_MAX);
    var platz = KICKER_MAX - String(hinten).length - 3;
    return passtIn(String(vorn), Math.max(6, platz)) + ' · ' + hinten;
}
function kurzDatum(iso) {
    var m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '.' + m[2] + '.' : '';
}
function zeilenText(paare) {
    return paare.map(function (p) { return p[0] + ' | ' + p[1]; }).join('\n');
}

/* HÖCHSTENS ZEHN — UND DAS MUSS DASTEHEN.
 *
 * `malListe` schneidet bei zehn ab, ohne es zu sagen, und malt dabei
 * 01–10 davor. Das Bild BEHAUPTET damit eine Rangfolge unter den ersten
 * zehn von wie vielen auch immer. Wer zehn von 131 zeigt, ohne die 131
 * zu nennen, laesst den Leser glauben, das sei das ganze Feld.
 *
 * VON ACHT AUF ZEHN (26.09.2026). Bestellt: „Können wir bei den Most
 * played Decks nicht die Top 10 zeigen? Top 10 ist irgendwie runder als
 * Top 8."
 *
 * Die Acht war nie eine Zahl der Gestaltung, sondern eine Behauptung
 * über die Zeichenfläche — und sie stimmte schon länger nicht mehr:
 * `listeZeilen` in posts/index.html schneidet seit jeher bei ZEHN, der
 * Deckel sass allein hier. Gemessen wurde deshalb, was zehn Zeilen
 * wirklich kosten (gerendert in Chromium, 1080 × 1350):
 *
 *     acht Zeilen, alte Flaeche   82 px hoch, Name 38 px
 *     zehn Zeilen, alte Flaeche   66 px hoch, Name 22 px   <- zu klein
 *     zehn Zeilen, neue Flaeche   78 px hoch, Name 38 px
 *
 * Die neue Fläche beginnt bei 470 statt 540 und endet 50 px tiefer —
 * das Band zwischen Titel und Liste war ohnehin tot. Zehn Zeilen stehen
 * damit in derselben Schriftgröße wie vorher acht; die Tafel-Ansicht
 * bekam dieselbe Behandlung. Nichts wird kleiner, nur die leere Stelle
 * verschwindet. */
var MAX = 10;

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
                tags: hashtags(['metagame', 'decklists', 'onlinetournaments']
                    .concat(acht.slice(0, 5).map(function (d) { return d.name; }))),
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
                    tags: hashtags(['matchups', 'deckguide', deck]
                        .concat(acht.slice(0, 4).map(function (r) { return r.gegner; }))),
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
/* ══ HASHTAGS ══════════════════════════════════════════════════════
 *
 * BESTELLT (Betreiber, 11.09.2026): „Dann fuer die Instagram-Posts, die
 * ich machen will ueber die thedipidis.app/posts/ immer alles mit
 * entsprechenden Beschreibungen und Hashtags."
 *
 * Es gab hier bis dahin KEINE — kein Feld, keine Liste, kein Treffer im
 * ganzen Bestand. Bildunterschriften dagegen schon: jedes Rezept liefert
 * `caption`. Die Hashtags folgen genau demselben Weg.
 *
 * ════════════════════════════════════════════════════════════════════
 * HIER AENDERST DU DEINE BASIS-TAGS — diese eine Liste, sonst nichts.
 * ════════════════════════════════════════════════════════════════════
 * Sie stehen unter JEDEM Beitrag. Entschieden am 11.09.2026: „feste
 * Basis + Inhalt". Die Basis unten ist mein Vorschlag, nicht deine
 * Ansage — du hast mir keine genannt, und einen Satz zu erfinden und als
 * deinen auszugeben waere schlimmer als einer, den du in zehn Sekunden
 * austauschst. Sie sind bewusst breit und englisch: die Beitraege laufen
 * auf Instagram englisch (siehe Sprachweiche oben).
 */
var HASHTAG_BASIS = [
    'pokemontcg', 'ptcg', 'pokemontcgcompetitive', 'tcgmeta',
    'thedipidis'
];

/* Aus Namen Hashtags machen: Kleinschreibung, nur Buchstaben und
 * Ziffern, Umlaute aufgeloest. „N's Zoroark" -> nszoroark,
 * „Mega Excadrill" -> megaexcadrill. Instagram erlaubt keine
 * Satzzeichen im Tag; ein Tag mit Apostroph verlinkt ins Leere. */
function tagAus(text) {
    return String(text == null ? '' : text)
        .toLowerCase()
        .replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue')
        .replace(/\u00df/g, 'ss')
        /* Alles Uebrige mit Akzent auf seinen Grundbuchstaben: sonst
           wird aus „Pokémon" das Tag #pokmon, und das verlinkt ins
           Leere. NFD zerlegt é in e + Akzent, der Bereich danach wirft
           die Akzente weg. */
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/* Die fertige Zeile: Basis zuerst, dann der Inhalt, ohne Dopplungen und
 * ohne Leere. Instagram wertet mehr als 30 Tags als Spam — deshalb die
 * Grenze, und sie schneidet den INHALT ab, nicht die Basis: die Basis
 * ist die Entscheidung des Betreibers, der Rest ist meine Ableitung. */
var HASHTAG_MAX = 25;

function hashtags(inhalt) {
    var raus = [], gesehen = {};
    HASHTAG_BASIS.concat(inhalt || []).forEach(function (t) {
        var tag = tagAus(t);
        if (!tag || tag.length < 3 || gesehen[tag]) return;
        gesehen[tag] = 1;
        raus.push('#' + tag);
    });
    return raus.slice(0, HASHTAG_MAX).join(' ');
}

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
                tags: hashtags(['tournament', 'majors', d.turnier]
                    .concat(acht.slice(0, 4).map(function (x) { return x.name; }))),
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
                tags: hashtags(['day2', 'tournament', d.turnier]),
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
                tags: hashtags(['top8', 'conversion', 'onlinetournaments']),
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
/* ══ DIE KARTENARTEN — EINE LISTE, ZWEI ORTE ══════════════════════
 *
 * Dieselbe Einteilung wie auf der Seite (STAPLES_ARTEN in
 * js/app-tier-meta.js). Sie steht hier ein zweites Mal, und das ist
 * KEINE Nachlaessigkeit: posts/ laeuft bewusst ohne den Rest der
 * Anwendung (kein i18n, kein Login, keine Datenladung — siehe Kopf von
 * posts/index.html). js/app-tier-meta.js zu laden hiesse, die halbe
 * Seite mitzuladen.
 *
 * tests/unit/test-post-kartenfilter.js vergleicht beide Listen Eintrag
 * fuer Eintrag, damit sie nicht auseinanderlaufen.
 *
 * ACE SPEC steht QUER zu den anderen: keine Kartenart, sondern ein
 * Kennzeichen (nur eine je Deck). Karten stehen deshalb in ihrer Art
 * UND hier — genau wie auf der Seite.
 *
 * „Neues Set" ist der Filter vom 11.09.2026: „wir koennen noch einen
 * weiteren Filter machen, All used cards newest Set … damit man alle
 * wichtigen Karten des neuen Sets sieht". Er fragt nicht nach der Art,
 * sondern nach dem Set-Kuerzel, und holt sich das laufende Set zur
 * Laufzeit aus data/format_window.json — ein eingetragenes Kuerzel
 * waere bei der naechsten Rotation falsch. */
var POST_ARTEN = [
    { id: 'pokemon',   name: 'Pokémon',
      typen: ['Basic', 'Stage 1', 'Stage 2', 'V-UNION', 'VMAX', 'VSTAR', 'Level Up'] },
    { id: 'supporter', name: 'Supporters',     typen: ['Supporter'] },
    { id: 'item',      name: 'Items',          typen: ['Item'] },
    { id: 'tool',      name: 'Tools',          typen: ['Tool'] },
    { id: 'stadion',   name: 'Stadiums',       typen: ['Stadium'] },
    { id: 'energie',   name: 'Special Energy', typen: ['Special Energy'] },
    { id: 'acespec',   name: 'ACE SPEC',       aceSpec: true },
    { id: 'neuesSet',  name: 'Newest set',     neuesSet: true }
];

REZEPTE['staples'] = {
    name: 'Format staples',
    gruppe: 'Cards',
    groesse: '788 KB',
    lade: function () {
        return Promise.all([
            hole('data/current_meta_card_data.csv'),
            /* Das laufende Set fuer den Filter „Newest set". Faellt die
               Datei aus, entfaellt NUR dieser Filter — die anderen sieben
               haengen nicht daran. */
            hole('data/format_window.json', true).catch(function () { return null; })
        ]).then(function (a) {
            var t = a[0], fw = a[1] || {};
            var neuesSet = String(fw.current_set || '').trim().toUpperCase();
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
                if (!karten[r.card_name]) karten[r.card_name] = {
                    name: r.card_name, in: {}, typen: {}, sets: {}, ace: false
                };
                var k = karten[r.card_name];
                k.in[r.archetype] = 1;
                /* Art, Set und ACE-SPEC-Kennzeichen sammeln sich ueber
                   ALLE Drucke desselben Namens — aus demselben Grund,
                   aus dem oben die Archetypen je Name gezaehlt werden.
                   Eine Karte, die in einem Druck als ACE SPEC belegt ist,
                   ist eine ACE SPEC. */
                if (r.type) k.typen[String(r.type).trim()] = 1;
                if (r.set_code) k.sets[String(r.set_code).trim().toUpperCase()] = 1;
                if (String(r.is_ace_spec || '').trim().toLowerCase() === 'yes') k.ace = true;
            });
            var gesamt = Object.keys(archetypen).length;

            /* Je Filter EINE fertige Liste. Gerechnet wird einmal, nicht
               bei jedem Klick: die Datei ist 788 KB, und die Auswahl
               soll sich anfuehlen wie auf der Seite. */
            function reiheFuer(pruef) {
                var r = Object.keys(karten).filter(function (k) {
                    return !pruef || pruef(karten[k]);
                }).map(function (k) {
                    return { name: karten[k].name, zahl: Object.keys(karten[k].in).length };
                });
                r.sort(function (x, y) {
                    return y.zahl - x.zahl || x.name.localeCompare(y.name, 'de');
                });
                return r;
            }

            function bau(reihe, artName) {
                if (!reihe.length) throw new Error(
                    'fuer „' + artName + '" steht in current_meta_card_data.csv keine '
                    + 'Karte — eine leere Tafel unter einem Nenner ist schlimmer als '
                    + 'ein gemeldeter Ausfall');
                var acht = ohneGleichstand(reihe, function (r) { return r.zahl; });
                /* GROSS IM BILD STEHT, WAS MAN SIEHT (11.09.2026).
                   Bestellt: „Wenn man den Post generiert ueber einen
                   Filter, dann Format Staples neben das Format schreiben
                   und in gross dann, was man sieht — in meinem Beispiel
                   hier waere es dann ACE SPEC."
                   Also: der Kicker traegt „Format staples" neben dem
                   Format, und die Ueberschrift traegt den Filter. */
                var alle = !artName;
                return {
                    zeilen: zeilenText(acht.map(function (r) {
                        return [r.name, r.zahl + ' of ' + gesamt];
                    })),
                    listeKopf: 'archetypes · of ' + gesamt,
                    listeKopfLinks: 'Card',
                    kicker: 'Format staples' + (neuesSet ? ' · ' + neuesSet : ''),
                    titel: alle ? 'In almost every deck' : artName,
                    /* Der Filtername steht schon gross als Ueberschrift
                       — hier waere er die zweite Abschrift und schoebe
                       die Fusszeile ueber die Klippgrenze. */
                    fuss: 'in how many of ' + gesamt + ' archetypes · Meta Live',
                    caption: (alle
                        ? 'The cards that sit in almost every archetype'
                        : artName + ' — the ones that sit in the most archetypes')
                        + ' — counted across ' + gesamt
                        + ' archetypes with a decklist in the current meta.',
                    tags: hashtags(['staples', 'deckbuilding']
                        .concat(alle ? [] : [artName])
                        .concat(acht.slice(0, 5).map(function (r) { return r.name; }))),
                    vorlagen: ['liste']
                };
            }

            /* Nur Filter anbieten, hinter denen wirklich Karten stehen —
               ein leerer Eintrag in der Auswahl ist ein Versprechen, das
               beim Klick bricht. */
            var verfuegbar = [{ id: '', name: 'All cards' }];
            POST_ARTEN.forEach(function (a) {
                if (a.neuesSet && !neuesSet) return;
                if (reiheFuer(pruefFuer(a)).length) verfuegbar.push({ id: a.id, name: a.name });
            });

            function pruefFuer(a) {
                if (!a) return null;
                if (a.aceSpec) return function (k) { return k.ace; };
                if (a.neuesSet) return function (k) { return k.sets[neuesSet]; };
                var erlaubt = {};
                a.typen.forEach(function (t) { erlaubt[t] = 1; });
                return function (k) {
                    return Object.keys(k.typen).some(function (t) { return erlaubt[t]; });
                };
            }

            var erg = bau(reiheFuer(null), null);
            erg.filter = verfuegbar;
            erg.proFilter = function (id) {
                if (!id) return bau(reiheFuer(null), null);
                var a = POST_ARTEN.filter(function (x) { return x.id === id; })[0];
                if (!a) throw new Error('unbekannter Kartenfilter: ' + id);
                return bau(reiheFuer(pruefFuer(a)), a.name);
            };
            return erg;
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
                tags: hashtags(['pokemonchampions', 'teambuilding']),
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
            /* ZWEI VERSCHIEDENE DINGE, EINE FRUEHERE REGEL (16.09.2026).
               Bis heute war jede Stufe ausserhalb von TIER_ORDNUNG ein
               harter Abbruch. Gedacht war das gegen eine NEUE Stufe
               („SS"), die sonst stumm aus der Liste faellt — und dafuer
               ist es weiter richtig.

               Am 16.09.2026 fuehrte Game8 aber ein Deck GANZ OHNE Stufe
               („Team Rocket's Wobbuffet", auf der Seite als „Untiered"
               bezeichnet). Der Scraper schreibt dafuer `tier: null`, und
               das ist keine unbekannte Stufe, sondern gar keine — ein
               Zustand, den die Quelle ausdruecklich kennt.

               Ein Post ohne Stufe zu erzeugen waere falsch; einen
               ganzen Post-Entwurf daran scheitern zu lassen aber auch.
               Die Decks ohne Stufe fallen deshalb aus der Auswahl (die
               Achterliste ordnet NACH Stufe, dort ist fuer sie kein
               Platz), und der Abbruch bleibt dem vorbehalten, wofuer er
               gebaut wurde: einer Stufe, die es gibt und die wir nicht
               kennen. */
            var ohneStufe = decks.filter(function (dk) {
                return dk.tier === null || dk.tier === undefined || dk.tier === '';
            });
            decks = decks.filter(function (dk) { return ohneStufe.indexOf(dk) < 0; });
            var fremd = decks.map(function (dk) { return dk.tier; })
                .filter(function (t) { return TIER_ORDNUNG.indexOf(t) < 0; });
            if (fremd.length) throw new Error(
                'unbekannte Tier-Stufe in pocket_tierlist.json: ' +
                fremd.slice(0, 3).join(', ') + '. Die Reihenfolge in ' +
                'TIER_ORDNUNG muss ergaenzt werden, sonst faellt die Stufe ' +
                'stumm aus der Liste');
            if (!decks.length) throw new Error(
                'pocket_tierlist.json hat nur Decks ohne Stufe — daraus laesst ' +
                'sich keine nach Stufen geordnete Liste bauen');
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
                tags: hashtags(['pokemontcgpocket', 'tierlist']),
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
                tags: hashtags(['day2', 'forecast', 'tournamentprep']),
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
/* ── 10 · Die Matchup-Heatmap als Gitter ───────────────────────────
 *
 * BESTELLT (Betreiber, 11.09.2026) als eine der vier neuen Beitragsarten.
 *
 * WARUM ACHT UND NICHT ZEHN: bei 1080 px Breite und einer Namensspalte
 * von 220 px bleiben 860 px fuer die Gegner. Acht Spalten sind 107 px je
 * Zelle — genug fuer „51,2" in lesbarer Groesse. Bei zehn waeren es 86,
 * und die Zahl muesste schrumpfen, bis sie auf dem Telefon niemand mehr
 * liest. Die Heatmap auf der Seite kann scrollen; ein Bild nicht.
 *
 * GEZEIGT WIRD DIE GEGLAETTETE QUOTE, wie auf der Seite — dieselbe
 * Rechnung aus js/matchup-glaettung.js, damit Bild und Seite nicht
 * auseinandergehen. Die Diagonale bleibt leer: ein Deck gegen sich
 * selbst ist per Definition 50 % und traegt keine Auskunft.
 */
REZEPTE['heatmap'] = {
    name: 'Matchup heatmap',
    gruppe: 'Online meta',
    groesse: '88 KB',
    lade: function () {
        return Promise.all([
            hole('data/limitless_online_decks.csv'),
            hole('data/limitless_online_decks_matchups.csv')
        ]).then(function (a) {
            var decks = liesCsv(a[0], ';').filter(function (r) {
                return r.deck_name && zahlAus(r.share_numeric) > 0;
            }).map(function (r) {
                return { name: r.deck_name, anteil: zahlAus(r.share_numeric) };
            });
            if (!decks.length) throw new Error(
                'limitless_online_decks.csv hat keine Zeile mit einem Anteil ueber null');
            decks.sort(function (x, y) { return y.anteil - x.anteil; });
            var N = 8;
            var oben = decks.slice(0, N).map(function (d) { return d.name; });
            if (oben.length < 3) throw new Error(
                'weniger als drei Decks mit Anteil — fuer ein Gitter zu wenig');

            var paare = {};
            liesCsv(a[1], ';').forEach(function (r) {
                if (!r.deck_name || !r.opponent) return;
                var G = window.DsGlaettung;
                var quote = (G && typeof G.ausEintrag === 'function')
                    ? G.ausEintrag({ record: r.record, win_rate: r.win_rate,
                                     total_games: r.total_games })
                    : zahlAus(r.win_rate);
                if (quote == null || !isFinite(quote)) return;
                paare[r.deck_name + '\u0001' + r.opponent] = {
                    quote: quote, partien: zahlAus(r.total_games) || 0
                };
            });

            var gitter = oben.map(function (zeile) {
                return {
                    deck: zeile,
                    zellen: oben.map(function (spalte) {
                        if (zeile === spalte) return null;
                        var p = paare[zeile + '\u0001' + spalte];
                        return p ? { quote: p.quote, partien: p.partien } : null;
                    })
                };
            });
            var gefuellt = 0, moeglich = 0;
            gitter.forEach(function (z, i) {
                z.zellen.forEach(function (c, j) {
                    if (i === j) return;
                    moeglich++;
                    if (c) gefuellt++;
                });
            });
            if (!gefuellt) throw new Error(
                'keine einzige Paarung der acht groessten Decks steht in '
                + 'limitless_online_decks_matchups.csv');

            var stand = kurzDatum(new Date().toISOString());
            return {
                gitter: gitter,
                gitterKoepfe: oben,
                kicker: 'Online meta · matchups',
                titel: 'Who beats whom',
                /* KURZ GENUG FUER DIE FUSSZEILE.
                   malFuss() in posts/index.html klippt bei 640 px — in
                   fMono 22 sind das rund fuenfzig Zeichen. Der erste
                   Entwurf war 78 lang und stand als „… 56 of…" da.
                   Was wegfaellt, steht in der Bildunterschrift. */
                fuss: oben.length + ' decks · k=20 · ' + gefuellt + '/' + moeglich
                    + ' measured · ' + stand,
                caption: 'The matchup grid of the ' + oben.length
                    + ' most played decks online. Read it row by row: the row is your '
                    + 'deck, the column is the opponent. Smoothed with k=20, '
                    + gefuellt + ' of ' + moeglich + ' pairings measured.',
                tags: hashtags(['matchups', 'heatmap', 'metagame', 'tournamentprep']
                    .concat(oben.slice(0, 4))),
                vorlagen: ['gitter']
            };
        });
    }
};

/* ── 11 · Ein Deck, seine Zahlen, seine Paarungen ──────────────────
 *
 * BESTELLT (Betreiber, 11.09.2026): „Daten aus Tierlist je Deck, also
 * ich waehle in Posts das Deck, dann wird fuer das Deck Beschreibung und
 * Hashtags generiert. Zu sehen sollte die Image Card von dem Deck sein."
 *
 * NICHT die Bildkarte selbst: die baut js/ds-share.js in 1200 × 675 und
 * braucht den Anwendungsrahmen (i18n, Login, Datenladung) — genau den
 * hat diese Seite mit Absicht nicht. Gebaut wird stattdessen DERSELBE
 * INHALT im Hochformat 1080 × 1350: die vier Kennzahlen oben, die
 * Paarungen darunter.
 *
 * Und mit derselben Auswahlregel wie Karte und Bildkarte seit dem
 * 11.09.2026: je Seite die meistgespielten Paarungen, nicht die besten
 * und schlechtesten. Eine Paarung, die man zweimal trifft, zaehlt fuer
 * die Vorbereitung weniger als eine, die staendig kommt.
 */
REZEPTE['deck-bilanz'] = {
    name: 'A deck vs. the meta',
    gruppe: 'Online meta',
    brauchtDeck: true,
    deckPflicht: true,
    groesse: '88 KB',
    lade: function () {
        return Promise.all([
            hole('data/limitless_online_decks.csv'),
            hole('data/limitless_online_decks_matchups.csv'),
            hole('data/limitless_meta_stats.json', true),
            hole('data/online_tournament_top8_decks.csv').catch(function () { return ''; })
        ]).then(function (a) {
            var decks = {};
            liesCsv(a[0], ';').forEach(function (r) {
                if (!r.deck_name || !(zahlAus(r.share_numeric) > 0)) return;
                decks[r.deck_name] = {
                    name: r.deck_name,
                    anteil: zahlAus(r.share_numeric),
                    listen: zahlAus(r.count),
                    quote: zahlAus(r.win_rate_numeric),
                    partien: (zahlAus(r.wins) || 0) + (zahlAus(r.losses) || 0)
                        + (zahlAus(r.ties) || 0)
                };
            });
            var namen = Object.keys(decks).sort(function (x, y) {
                return decks[y].anteil - decks[x].anteil;
            });
            if (!namen.length) throw new Error(
                'limitless_online_decks.csv hat keine Zeile mit einem Anteil ueber null');

            var stat = a[2] || {};
            var nenner = ganzzahl(stat.players, 'players');
            var stand = kurzDatum(stat.generated_at);

            /* Top-8-Quote je Deck, wenn die Datei da ist. Fehlt sie,
               bleibt die Kachel leer statt geraten. */
            var top8 = {};
            liesCsv(a[3] || '', ';').forEach(function (r) {
                var n = r.deck_name || r.deck || r.archetype;
                var gebracht = zahlAus(r.total_brought), schnitt = zahlAus(r.top8_count);
                if (n && gebracht > 0 && schnitt != null) {
                    top8[n] = { quote: (schnitt / gebracht) * 100, antritte: gebracht };
                }
            });

            var paare = {};
            liesCsv(a[1], ';').forEach(function (r) {
                if (!r.deck_name || !r.opponent) return;
                var G = window.DsGlaettung;
                var quote = (G && typeof G.ausEintrag === 'function')
                    ? G.ausEintrag({ record: r.record, win_rate: r.win_rate,
                                     total_games: r.total_games })
                    : zahlAus(r.win_rate);
                if (quote == null || !isFinite(quote)) return;
                (paare[r.deck_name] = paare[r.deck_name] || []).push({
                    gegner: r.opponent, quote: quote,
                    partien: zahlAus(r.total_games) || 0
                });
            });

            /* Dieselbe Regel wie vorschauAuswahl() in
               js/app-archetype-card.js — je Seite nach Begegnungszahl,
               angezeigt nach Quote. */
            function auswahl(alle, wieViele) {
                if (!alle || alle.length <= wieViele) {
                    return (alle || []).slice().sort(function (x, y) { return y.quote - x.quote; });
                }
                var n = function (m) { return isFinite(m.partien) ? m.partien : 0; };
                var gut = alle.filter(function (m) { return m.quote >= 50; })
                    .sort(function (x, y) { return n(y) - n(x); });
                var schlecht = alle.filter(function (m) { return m.quote < 50; })
                    .sort(function (x, y) { return n(y) - n(x); });
                var h = Math.floor(wieViele / 2);
                var ausGut = gut.slice(0, h), ausSchlecht = schlecht.slice(0, wieViele - h);
                if (ausGut.length + ausSchlecht.length < wieViele) {
                    var fehlt = wieViele - ausGut.length - ausSchlecht.length;
                    if (gut.length > ausGut.length) ausGut = gut.slice(0, ausGut.length + fehlt);
                    else ausSchlecht = schlecht.slice(0, ausSchlecht.length + fehlt);
                }
                return ausGut.concat(ausSchlecht)
                    .sort(function (x, y) { return y.quote - x.quote; });
            }

            var ZEILEN = 10;
            function fuer(name) {
                var d = decks[name];
                if (!d) throw new Error('„' + name + '" steht nicht in limitless_online_decks.csv');
                var alle = paare[name] || [];
                var zeigen = auswahl(alle, ZEILEN);
                var t8 = top8[name] || null;
                return {
                    kacheln: [
                        { wert: prozent(d.anteil, 2), label: 'Share · online',
                          notiz: tausend(d.listen) + ' lists' },
                        { wert: prozent(d.quote, 1), label: 'Win rate · ties count',
                          notiz: tausend(d.partien) + ' games' },
                        t8 ? { wert: prozent(t8.quote, 1), label: 'Top-8 rate · online',
                               notiz: tausend(t8.antritte) + ' entries' }
                           : { wert: '–', label: 'Top-8 rate · online', notiz: 'no data' }
                    ],
                    matchups: zeigen.map(function (m) {
                        return { name: m.gegner, quote: m.quote, partien: m.partien };
                    }),
                    kicker: 'Online meta · ' + name,
                    titel: name,
                    /* Siehe Heatmap: die Fusszeile klippt bei rund
                       fuenfzig Zeichen. Der Nenner steht in der ersten
                       Kachel („3.683 lists"), muss hier also nicht
                       noch einmal. */
                    fuss: zeigen.length + ' of ' + alle.length + ' pairings · k=20'
                        + (stand ? ' · ' + stand : ''),
                    caption: name + ' against the field: ' + prozent(d.anteil, 2)
                        + ' share, ' + prozent(d.quote, 1) + ' win rate over '
                        + tausend(d.partien) + ' games. Shown are the most-played '
                        + 'pairings above and below 50 % — not the best and worst, '
                        + 'because a matchup you meet twice matters less than one you '
                        + 'meet constantly.',
                    tags: hashtags(['deckguide', 'matchups', 'tournamentprep', name]
                        .concat(zeigen.slice(0, 3).map(function (m) { return m.name; }))),
                    vorlagen: ['deckkarte']
                };
            }
            return { decks: namen, proDeck: fuer, vorlagen: ['deckkarte'] };
        });
    }
};

/* ── 14 · Was die App herübergereicht hat ──────────────────────────
 *
 * BESTELLT (Betreiber, 25.09.2026): „ich hätte in My Decks gerne direkt
 * eine Posts Option … oder zumindest auf der Posts Seite, dass ich das
 * Deck dort aufrufen kann und es posten kann … und gleiches gilt für den
 * Battle Journal."
 *
 * WARUM DIESE QUELLE ANDERS IST ALS DIE DREIZEHN DARÜBER
 * ------------------------------------------------------
 * Alle anderen lesen eine Datei aus data/ — Zahlen, die für jeden
 * gelten. Diese hier liest den lokalen Speicher: ein Deck aus „Meine
 * Decks" oder ein Turnier aus dem Battle Journal, beides persönlich und
 * beides im Konto, an das diese Seite nie käme. Die App legt es ab
 * (js/ds-post-uebergabe.js), hier wird es aufgenommen.
 *
 * DIE BILDADRESSEN KOMMEN MIT, SIE WERDEN NICHT GERATEN. Set und
 * Nummer ergäben für japanische Sets, Prize-Pack-Drucke und
 * Proxy-Ersatz die falsche Adresse; die App weiß es und schickt es
 * deshalb mit.
 *
 * OHNE ÜBERGABE STEHT HIER KEIN PLATZHALTER, sondern der Satz, was zu
 * tun ist. Eine Quelle, die leer lädt und so tut, als sei das ein
 * Ergebnis, ist die unangenehmste Sorte Fehler.
 */
function uebergabeKarten(paket) {
    var d = (paket && paket.daten) || {};
    var karten = d.karten || {};
    var bilder = d.bilder || {};
    var liste = Object.keys(karten).map(function (key) {
        var m = String(key).match(/^(.*?)\s*\(([^()\s]+)\s+([^()\s]+)\)\s*$/);
        return {
            name: m ? m[1].trim() : String(key),
            set: m ? m[2].trim() : '',
            nummer: m ? m[3].trim() : '',
            anzahl: parseInt(karten[key], 10) || 0,
            url: bilder[key] || ''
        };
    }).filter(function (k) { return k.anzahl > 0; });
    /* Dieselbe Lesereihenfolge wie auf jeder Deckliste: viele zuerst,
       dann der Name. Eine Sortierung nach Kartenart bräuchte die
       Kartendatenbank, und die hat diese Seite nicht — das wäre geraten. */
    liste.sort(function (a, b) {
        return b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'en');
    });
    return liste;
}

/* DIE SCHEIBEN EINES META CALLS.
 *
 * BESTELLT (Betreiber, 25.09.2026): „diese ganzen Meta Share Daten für
 * ein Turnier will ich gerne als Post haben, sowohl einzeln als auch als
 * Karussell … dann wähle ich noch mein Deck aus, was ich spielen will,
 * und dann kann ich die verschiedenen Posts generieren lassen." Und:
 * „ich brauche als Post 1x Standard Meta Call und meine gespeicherte
 * Prognose."
 *
 * Daraus werden drei Stellschrauben, jede an ihrem eigenen Bedienelement
 * der Seite:
 *
 *     Quelle   welcher Stand — die Modellprognose oder die eigene
 *     Deck     welches Deck ich spiele
 *     Scheibe  welches der fünf Bilder
 *
 * DIE FÜNF SCHEIBEN ergeben zusammen eine Geschichte und stehen einzeln
 * jede für sich:
 *
 *     1 Das Feld            wen erwarte ich, mit welchem Anteil
 *     2 Mein Deck           was heißt das für meine Day-2-Chance
 *     3 Begegnungen         wie oft treffe ich wen in acht Runden
 *     4 Meine Paarungen     wie stehe ich gegen jeden davon
 *     5 Empfehlungen        was stünde in diesem Meta besser
 *
 * JEDE QUOTE TRÄGT IHREN NENNER (Hausregel). Er ist für alle Scheiben
 * derselbe und steht deshalb in der Fußzeile: Spielerzahl, Rundenzahl
 * und die Punkte für Day 2.
 *
 * GERECHNET WIRD HIER NICHTS. Alle Zahlen kommen fertig aus dem Meta
 * Call — und zwar je Stand vollständig: eine Day-2-Chance gehört zu dem
 * Feld, gegen das sie gerechnet wurde. Was nicht übergeben wurde, wird
 * nicht ersetzt: fehlt ein Deck, fehlen die Scheiben 2 bis 4, und das
 * steht dann da, statt dass eine Zahl erscheint, die niemand gerechnet
 * hat.
 */
function metaCallFuss(d) {
    var teile = [];
    if (d.spieler) teile.push(tausend(d.spieler) + ' players');
    if (d.runden) teile.push(d.runden + ' rounds');
    if (d.day2Punkte) teile.push('Day 2: ' + d.day2Punkte + ' pts');
    return teile.join(' \u00b7 ');
}

function metaCallScheiben(d, titel, standName) {
    var stand = ((d.staende || {})[standName]) || null;
    if (!stand) throw new Error('The handover carries no "' + standName + '" state. '
        + 'Open the Meta Call and hand it over again.');
    var feld = stand.feld || [];
    if (!feld.length) throw new Error('The handover carries no field.');
    var fuss = metaCallFuss(d);
    var kicker = [d.art, d.format].filter(Boolean).join(' \u00b7 ');
    /* „MY CALL" NUR, WENN ES EINEN GIBT (Pruefagent, 26.09.2026).
     *
     * `staende.eigen` wird auch dann gerechnet, wenn im Szenario keine
     * einzige eigene Schaetzung steckt — dann stehen dort die Zahlen des
     * Modells. Die Spalte hiess trotzdem „my call %", und der Satz
     * darunter „The field I expect". Das Kennzeichen liegt seit dem
     * 25.09.2026 im Paket (`eigeneSchaetzungen`) und wurde nur fuer die
     * Quellenauswahl benutzt; hier entscheidet es jetzt mit.
     *
     * Fehlt das Kennzeichen ganz (aeltere Uebergabe), gilt der Stand als
     * eigen — so, wie es vorher war. */
    var eigen = standName === 'eigen'
        && (d.eigeneSchaetzungen === undefined || !!d.eigeneSchaetzungen);
    var deckNamen = Object.keys(stand.decks || {});
    var vorgabe = (d.meinDeck && stand.decks && stand.decks[d.meinDeck])
        ? d.meinDeck : (deckNamen[0] || '');

    function schnitt(x) { return (Math.round(x * 100) / 100).toFixed(2); }

    function scheibeFeld() {
        return {
            zeilen: zeilenText(feld.slice(0, MAX).map(function (r) {
                return [r.name, prozent(r.anteil, 1)];
            })),
            listeKopf: eigen ? 'my call %' : 'predicted %',
            listeKopfLinks: 'Deck',
            kicker: kicker,
            titel: titel || 'Meta Call',
            fuss: fuss,
            caption: (eigen
                ? 'The field I expect at ' + (titel || 'this tournament')
                : 'What the model predicts for ' + (titel || 'this tournament'))
                + (d.spieler ? ' (' + tausend(d.spieler) + ' players)' : '') + '.',
            tags: hashtags(['metacall', 'meta']
                .concat(feld.slice(0, 4).map(function (r) { return r.name; }))),
            vorlagen: ['liste']
        };
    }

    function deckStand(deck) {
        var e = (stand.decks || {})[deck];
        if (!e) throw new Error('No numbers for "' + (deck || '—')
            + '". Pick your deck in the Meta Call and hand it over again.');
        return e;
    }

    function scheibeMeinDeck(deck) {
        var e = deckStand(deck);
        var r = e.ergebnis || {};
        return {
            zahl: prozent(r.day2, 1),
            zahlLabel: 'Day 2 chance',
            zahlNenner: deck + ' \u00b7 ' + (d.runden || '?') + ' rounds \u00b7 '
                + (d.day2Punkte || '?') + ' pts \u00b7 ' + prozent(r.quote, 1) + ' win rate',
            /* NUR PARTIEN IN DIESER LISTE — die Balken hängen an der
               Zahl, und drei Werte in Partien sind vergleichbar. Die
               Tagesquote stand hier zuerst mit drin: 44,5 % bekam einen
               langen Balken neben 3,60 Siegen, und der Balken behauptete
               damit einen Vergleich, den es nicht gibt (gerendert
               25.09.2026). Sie steht jetzt im Nenner der großen Zahl. */
            zeilen: zeilenText([
                ['\u00d8 wins', schnitt(r.wins)],
                ['\u00d8 ties', schnitt(r.ties)],
                ['\u00d8 losses', schnitt(r.losses)]
            ]),
            ohneRang: true,
            listeKopf: 'per ' + (d.runden || '?') + ' rounds',
            listeKopfLinks: deck,
            kicker: kicker,
            titel: deck,
            fuss: fuss,
            caption: deck + ' at ' + (titel || 'this tournament') + ': '
                + prozent(r.day2, 1) + ' to make day 2, '
                + prozent(r.quote, 1) + ' win rate over ' + (d.runden || '?') + ' rounds'
                + (eigen ? ', against the field I expect' : ', against the predicted field') + '.',
            tags: hashtags(['metacall', deck]),
            vorlagen: ['zahl', 'liste']
        };
    }

    function scheibeBegegnungen(deck) {
        var b = feld.filter(function (r) { return r.schnitt > 0; });
        if (!b.length) throw new Error('The handover carries no expected encounters.');
        return {
            zeilen: zeilenText(b.slice(0, MAX).map(function (r) {
                return [r.name, '\u00d8 ' + schnitt(r.schnitt)];
            })),
            ohneRang: true,
            listeKopf: 'times in ' + (d.runden || '?') + ' rounds',
            listeKopfLinks: 'Deck',
            kicker: kicker,
            titel: 'Who I expect to face',
            fuss: fuss,
            caption: 'Expected encounters over ' + (d.runden || '?') + ' rounds'
                + (deck ? ' with ' + deck : '') + '.',
            tags: hashtags(['metacall', 'matchups']
                .concat(b.slice(0, 4).map(function (r) { return r.name; }))),
            vorlagen: ['liste']
        };
    }

    function scheibeMatchups(deck) {
        var e = deckStand(deck);
        var quoten = e.quoten || {};
        var b = feld.filter(function (r) {
            /* Der Spiegel bleibt draußen: gegen das eigene Deck sind es
               per Definition 50 %, und eine Zeile ohne Auskunft nimmt
               einer mit Auskunft den Platz weg. */
            return typeof quoten[r.name] === 'number' && isFinite(quoten[r.name])
                && String(r.name).toLowerCase() !== String(deck).toLowerCase();
        });
        if (!b.length) throw new Error('No matchup numbers for "' + deck + '".');
        return {
            zeilen: zeilenText(b.slice(0, MAX).map(function (r) {
                return [r.name, prozent(quoten[r.name], 0)];
            })),
            /* KEINE RANGZIFFERN. Die Reihenfolge ist die des Feldes —
               wen ich am häufigsten treffe —, nicht die der Quoten. Eine
               01 vor Dragapult behauptete sonst, das sei die beste
               Paarung (gerendert 25.09.2026: 01 stand vor 58 %, während
               66 % auf Platz 05 lag). */
            ohneRang: true,
            listeKopf: 'win % (no ties)',
            listeKopfLinks: 'Opponent \u00b7 by share',
            kicker: kicker,
            titel: deck + ' vs the field',
            fuss: fuss,
            caption: deck + ' against the field at ' + (titel || 'this tournament')
                + '. Win % excludes ties (W / (W + L)).',
            tags: hashtags(['metacall', 'matchups', deck]),
            vorlagen: ['liste']
        };
    }

    function scheibeEmpfehlungen() {
        var e = stand.empfehlungen || [];
        if (!e.length) throw new Error('The handover carries no recommendations.');
        return {
            zeilen: zeilenText(e.slice(0, MAX).map(function (r) {
                return [r.name, prozent(r.day2, 1)];
            })),
            listeKopf: 'Day 2 chance',
            listeKopfLinks: 'Deck',
            kicker: kicker,
            titel: 'What would do well here',
            fuss: fuss,
            caption: 'The decks with the best day-2 chance against '
                + (eigen ? 'the field I expect at ' : 'the predicted field at ')
                + (titel || 'this tournament') + '.',
            tags: hashtags(['metacall', 'deckchoice']
                .concat(e.slice(0, 4).map(function (r) { return r.name; }))),
            vorlagen: ['liste']
        };
    }

    var scheiben = [
        { id: 'feld', name: '1 \u00b7 The field', bau: scheibeFeld },
        { id: 'meindeck', name: '2 \u00b7 My deck', bau: scheibeMeinDeck },
        { id: 'begegnungen', name: '3 \u00b7 Expected encounters', bau: scheibeBegegnungen },
        { id: 'matchups', name: '4 \u00b7 My matchups', bau: scheibeMatchups },
        { id: 'empfehlungen', name: '5 \u00b7 What would do well', bau: scheibeEmpfehlungen }
    ];

    function bauen(id, deck) {
        var s = scheiben.filter(function (x) { return x.id === id; })[0];
        if (!s) throw new Error('unknown slide: ' + id);
        var e = s.bau(deck || vorgabe);
        e.filter = verfuegbar;
        e.proFilter = proFilter;
        e.decks = deckNamen;
        e.proDeck = function (name) { return proFilter(id, name); };
        e.karussell = reihe;
        e.gewaehltesDeck = deck || vorgabe;
        return e;
    }
    function proFilter(id, deck) { return bauen(id, deck); }

    /* Nur anbieten, was wirklich dahintersteht — ein Eintrag in der
       Auswahl ist ein Versprechen, das beim Klick bricht. */
    var verfuegbar = scheiben.filter(function (s) {
        try { s.bau(vorgabe); return true; } catch (e) { return false; }
    }).map(function (s) { return { id: s.id, name: s.name }; });
    /* Für den Karussell-Knopf: die Reihenfolge, in der die Bilder
       gehören. Ohne sie wäre „alle" eine Menge ohne Reihenfolge, und die
       Galerie des Telefons sortiert alphabetisch. */
    var reihe = verfuegbar.map(function (s) { return s.id; });
    if (!verfuegbar.length) throw new Error('Nothing in this Meta Call can be drawn.');
    return bauen(verfuegbar[0].id, vorgabe);
}

/* ── EIN STUECK DER UEBERGABE ALS BILD ────────────────────────────────
 *
 * Herausgezogen aus REZEPTE['uebergabe'] am 26.09.2026. Anlass: die
 * Kaskade (siehe BAUM weiter unten) zeigt nicht mehr „das zuletzt
 * uebergebene Stueck", sondern laesst aus ALLEN uebergebenen waehlen.
 * Damit braucht dieselbe Rechnung zwei Aufrufer — und zwei Kopien waeren
 * zwei Bilder, die sich mit der Zeit auseinanderentwickeln. */
function deckScheibe(paket) {
    var d = paket.daten || {};
    var karten = uebergabeKarten(paket);
    var gesamt = karten.reduce(function (s, k) { return s + k.anzahl; }, 0);
    var titel = String(paket.titel || d.titel || '').trim();
    return {
        /* Die Liste trägt hier die Stückzahl, nicht einen Rang:
           vier Karten mit „4" sind kein Gleichstand, sondern
           eine Deckliste. Deshalb ohne Rangnummern. */
        zeilen: zeilenText(karten.slice(0, MAX).map(function (k) {
            return [k.name, k.anzahl + '\u00d7'];
        })),
        ohneRang: true,
        listeKopf: 'Copies',
        listeKopfLinks: 'Card',
        kicker: String(d.archetyp || 'My deck'),
        titel: titel || 'My deck',
        fuss: karten.length + ' different \u00b7 ' + gesamt + ' cards',
        caption: (titel || 'My deck') + ' \u2014 '
            + karten.length + ' different cards, ' + gesamt + ' in total.',
        tags: hashtags(['deck', 'decklist']
            .concat(d.archetyp ? [d.archetyp] : [])
            .concat(karten.slice(0, 4).map(function (k) { return k.name; }))),
        kartenGitter: karten,
        vorlagen: ['deckliste', 'liste']
    };
}

function turnierScheibe(paket) {
    var d = paket.daten || {};
    var karten = uebergabeKarten(paket);
    var titel = String(paket.titel || d.titel || '').trim();
    /* Turnier: die Runden sind die Liste, die eingefrorene
       Deckliste das Gitter. Beides aus derselben Übergabe. */
    var b = d.bilanz || {};
    var bilanz = [b.w, b.l, b.t].map(function (x) { return Number(x) || 0; }).join('-');
    var runden = (d.runden || []).map(function (r) {
        var z = r.result === 'win' ? 'W' : r.result === 'loss' ? 'L'
              : r.result === 'tie' ? 'T' : '\u2013';
        return ['R' + r.n + ' \u00b7 ' + (r.opponent || '\u2013'),
                z + (r.games ? ' ' + r.games : '')];
    });
    return {
        zeilen: zeilenText(runden.slice(0, MAX)),
        ohneRang: true,
        listeKopf: 'Result',
        listeKopfLinks: 'Round \u00b7 opponent',
        kicker: [d.art, d.format].filter(Boolean).join(' \u00b7 '),
        titel: titel || 'Tournament',
        fuss: [bilanz, d.deck, d.datum].filter(Boolean).join(' \u00b7 '),
        caption: (titel || 'Tournament') + ' \u2014 ' + bilanz
            + (d.deck ? ' with ' + d.deck : '')
            + (d.platz ? ', place ' + d.platz : '') + '.',
        tags: hashtags(['tournament', 'battlejournal']
            .concat(d.deck ? [d.deck] : [])
            .concat(d.format ? [d.format] : [])),
        kartenGitter: karten,
        vorlagen: karten.length ? ['liste', 'deckliste'] : ['liste']
    };
}

/* Ein Stueck, gleich welcher Art. */
function uebergabeScheibe(paket, standName) {
    if (!paket) throw new Error('Nothing handed over.');
    if (paket.art === 'deck') return deckScheibe(paket);
    if (paket.art === 'metacall') {
        return metaCallScheiben(paket.daten || {},
            String(paket.titel || (paket.daten || {}).titel || ''),
            standName || 'eigen');
    }
    return turnierScheibe(paket);
}

/* NICHT MEHR IM WAEHLER (26.09.2026) — ABER NICHT TOT.
 *
 * Seit der Kaskade waehlt niemand mehr „From the app": der Weg heisst
 * jetzt Decks → My decks bzw. Battle Journal → Turnier, und beide rufen
 * dieselben Bauer (deckScheibe/turnierScheibe) auf. Die zwei Rezepte
 * bleiben trotzdem stehen, weil sie in der Gruppe „Mine" von
 * tests/unit/test-post-quellen.js und
 * tests/unit/test-post-hashtags-und-filter.js mitlaufen: die beiden
 * Dateien gehen ALLE Rezepte durch und halten sie gegen die Hausregeln
 * (Nenner in der Fusszeile, Breite der Wertspalte, Hashtags). Ohne sie
 * liefe keine dieser Pruefungen mehr ueber ein Deck oder ein Turnier.
 * `gruppe: 'Mine'` steht in keinem Hauptfilter — sie sind also
 * erreichbar fuer die Zusicherungen und unerreichbar im Waehler, und
 * genau das ist gewollt. */
REZEPTE['uebergabe'] = {
    name: 'A handed-over deck or tournament (tests only)',
    gruppe: 'Mine',
    groesse: 'local',
    lade: function () {
        return new Promise(function (aufloesen) {
            var U = window.DsPostUebergabe;
            var paket = (U && typeof U.holen === 'function') ? U.holen() : null;
            if (!paket) {
                throw new Error('Nothing handed over yet. Open a deck in "My decks" '
                    + 'or a tournament in the Battle Journal and choose "Posts page" there.');
            }
            aufloesen(uebergabeScheibe(paket, 'eigen'));
        });
    }
};

/* DIE MODELLPROGNOSE ALS EIGENE QUELLE.
 *
 * BESTELLT (Betreiber, 25.09.2026): „dann brauche ich als Post 1x
 * Standard Meta Call und meine gespeicherte Prognose."
 *
 * Beide stehen in derselben Übergabe; getrennt sind sie hier, weil die
 * Seite genau drei Bedienelemente hat und alle drei schon belegt sind:
 * Quelle, Deck und Scheibe. Der Stand gehört an die Quelle — er ist die
 * Frage „wessen Zahlen zeige ich", und die stellt man einmal, nicht bei
 * jedem Bild neu.
 *
 * Ohne eigene Schätzungen im Meta Call wäre diese Quelle eine Kopie der
 * anderen. Dann sagt sie das, statt zweimal dasselbe anzubieten.
 */
REZEPTE['uebergabe-standard'] = {
    name: 'Meta Call \u2014 model forecast (from the app)',
    gruppe: 'Mine',
    groesse: 'local',
    lade: function () {
        return new Promise(function (aufloesen) {
            var U = window.DsPostUebergabe;
            var paket = (U && typeof U.holen === 'function') ? U.holen() : null;
            if (!paket || paket.art !== 'metacall') {
                throw new Error('No Meta Call handed over yet. Open the Meta Call in the '
                    + 'app and choose "Posts page" there.');
            }
            aufloesen(metaCallScheiben(paket.daten || {},
                String(paket.titel || (paket.daten || {}).titel || ''), 'standard'));
        });
    }
};


/* ══════════════════════════════════════════════════════════════════════
 * DER BAUM: HAUPTFILTER → UNTERFILTER → ERGEBNIS
 * ══════════════════════════════════════════════════════════════════════
 *
 * BESTELLT (Betreiber, 26.09.2026, nach einem Blick auf die Seite am
 * Telefon): „Wenn ich bei Posts auf Decklist bin, zeigt er mir bei Fill
 * from die gleichen Optionen an wie überall auch. Das ergibt ja keinen
 * Sinn. Also der Main-Filter oder die Richtung des Posts sollte schon
 * bestimmen, was ich danach für Optionen habe. […] Und grundsätzlich
 * arbeite einfach durch, dass wir immer einen Hauptfilter haben, und der
 * Hauptfilter führt dann zu Unterfiltern und die Unterfilter dann zum
 * entsprechenden Ergebnis. Aber so wie es jetzt ist, ist es einfach
 * nicht sinnvoll."
 *
 * WAS VORHER FALSCH WAR
 * ---------------------
 * Es gab EINEN Wähler mit dreizehn Einträgen, nach Themen gruppiert, und
 * danach höchstens einen Kartenfilter. „Erfolgreichste Listen der letzten
 * 7 Tage" gab es überhaupt nicht, „meine Decks" hieß „From the app" und
 * zeigte genau das eine Deck, das er zuletzt angeklickt hatte.
 *
 * DER VERTRAG EINES KNOTENS
 * -------------------------
 *     { id, name, frage, optionen, lade }
 *
 *   frage     Beschriftung des Wählers, der zwischen `optionen` wählt.
 *   optionen  Array von Knoten — ODER eine Funktion(pfad), die eines
 *             liefert, auch als Promise. Dynamisch ist der Normalfall:
 *             die Decks stehen im lokalen Speicher, die Archetypen in
 *             einer Datei, die Scheiben im übergebenen Stand.
 *   lade      Funktion(pfad) -> Promise<Bild>. Nur Blätter haben es.
 *
 * Ein Knoten mit `optionen` ist ein Filter, ein Knoten mit `lade` ist ein
 * Ergebnis. Beides zugleich gibt es nicht — das wäre ein Wähler, dessen
 * erste Wahl schon ein Bild ist, und die Oberfläche müsste raten, was
 * gemeint ist.
 *
 * WARUM EINE FUNKTION UND KEINE FESTE LISTE
 * -----------------------------------------
 * Ein Eintrag in einer Auswahl ist ein Versprechen. „Dragapult" darf nur
 * dastehen, wenn dahinter wirklich eine Liste liegt; „Regional
 * Frankfurt" nur, wenn der Meta Call dazu übergeben wurde. Feste Listen
 * hätten beides behauptet, und der Bruch käme erst beim Klick.
 *
 * DIE ERSTE OPTION IST IMMER SCHON GEWÄHLT
 * ----------------------------------------
 * `kaskade()` füllt jede unbeantwortete Stufe mit ihrer ersten Option.
 * Wer „Decks" wählt, sieht sofort ein Bild — nicht drei leere Wähler.
 * Genau das meint „der Hauptfilter führt dann zu Unterfiltern und die
 * Unterfilter dann zum entsprechenden Ergebnis".
 * ══════════════════════════════════════════════════════════════════ */

/* ── Die abgeleiteten Listen ──────────────────────────────────────────
 *
 * data/post_decklists.json entsteht beim Deploy aus
 * data/tournament_decklists_per_player.csv (45 MB, 202.685 Zeilen) —
 * siehe scripts/build_post_decklists.py. Die Quelle selbst hierher zu
 * laden wäre kein Ladebalken, sondern ein Abbruch. */
var _listenVersprechen = null;
function postListen() {
    if (!_listenVersprechen) {
        _listenVersprechen = hole('data/post_decklists.json', true).then(function (j) {
            if (!j || j.v !== 1) throw new Error('post_decklists.json: unbekannte Fassung');
            return j;
        }, function (e) {
            /* EIN FEHLSCHLAG WIRD NICHT GEMERKT (Pruefagent, 26.09.2026).
             *
             * Vorher blieb das abgewiesene Versprechen stehen: ein
             * Funkloch beim ersten Antippen von „Most successful lists",
             * und BEIDE Listen-Ketten waren bis zum Neuladen tot — mit
             * einer Meldung, die auf die Datei zeigte und nicht auf das
             * Netz. Am Telefon, dem bestellten Fall, ist das der
             * Normalfall und nicht die Ausnahme. `hole()` cachet aus
             * demselben Grund gar nichts. */
            _listenVersprechen = null;
            throw e;
        });
    }
    return _listenVersprechen;
}

/* Die Bildadresse einer Karte aus der abgeleiteten Datei. Der gemeinsame
 * Anfang steht einmal im Kopf — bei 615 Karten sind das 50 KB weniger. */
function listenBild(j, set, nummer) {
    var rest = (j.bilder || {})[String(set).toUpperCase() + '-' + String(nummer).toUpperCase()];
    if (!rest) return '';
    return /^https?:/i.test(rest) ? rest : (j.bild_praefix || '') + rest;
}

function listenKarten(j, karten) {
    return (karten || []).map(function (k) {
        return {
            name: k[0], set: k[1], nummer: k[2], anzahl: k[3],
            url: listenBild(j, k[1], k[2])
        };
    });
}

/* Eine Platzierung, wie sie ein englischer Leser erwartet. */
function platzWort(n) {
    var i = parseInt(n, 10) || 0;
    var rest = i % 100;
    if (rest >= 11 && rest <= 13) return i + 'th';
    return i + (['th', 'st', 'nd', 'rd'][i % 10] || 'th');
}

function bilanzWort(L) {
    return [L.w, L.l, L.t].map(function (x) { return Number(x) || 0; }).join('-');
}

/* EINE FREMDE LISTE ALS BILD.
 *
 * DIE PLATZIERUNG TRÄGT IHR FELD. „1." allein ist keine Aussage — ein
 * erster Platz unter 386 Spielern und einer unter 56 sind zwei
 * verschiedene Nachrichten, und beide Zahlen stehen in den Daten. Die
 * Hausregel „jede Quote trägt ihren Nenner" gilt auch hier. */
function fremdeListeScheibe(j, L, opt) {
    var karten = listenKarten(j, L.karten);
    var gesamt = karten.reduce(function (s, k) { return s + k.anzahl; }, 0);
    var archetyp = String(opt.archetyp || L.archetyp || '');

    /* EINE FELDGROESSE, NICHT ZWEI (Pruefagent, 26.09.2026).
     *
     * Bis heute rechnete die Fusszeile mit `opt.von` und die
     * Bildunterschrift mit `L.feld`. Beim Major ist `L.feld` null — die
     * Fusszeile trug also „1st of 559", die Unterschrift „1st at
     * Regional Baltimore" OHNE Zahl. Und genau die Unterschrift ist der
     * Text, der mit nach Instagram geht.
     *
     * Der Nenner ist jetzt EIN Wert, und er steht in beiden. */
    var feld = Number(opt.von || L.feld || 0) || 0;
    var platz = platzWort(L.platz) + (feld ? ' of ' + tausend(feld) : '');

    /* DIE FUSSZEILE GEHT DURCH DEN RIEGEL.
     *
     * `fussZeile` kuerzt vorne und laesst hinten stehen, was zaehlt —
     * `join(' · ')` tat das nicht. Gemessen: „1st of 1,024 · 1,024
     * players · 10-1-1 · 2026-09-19" sind 50 Zeichen bei 48 Platz, und
     * malFuss schneidet das Datum ab. Heute fehlten zwei Zeichen. */
    /* DIE FELDGROESSE STEHT EINMAL, NICHT ZWEIMAL.
     *
     * LIVE GEMESSEN (26.09.2026, nach dem Deploy): im Bild stand
     * „1st of 386 · 386 players · 10-1-1 · 2026-09-19". Die Bedingung
     * hier hiess `if (L.feld && !opt.von)` und traf bei der
     * Sieben-Tage-Kette zu, weil dort `opt.von` leer ist und dieselbe
     * Zahl schon ueber `L.feld` in die Platzierung gewandert war.
     * Der Nenner steht in „1st of 386"; eine zweite Spielerzahl daneben
     * ist dieselbe Zahl und kostet zwoelf Zeichen in einer Zeile, die
     * 48 fasst. */
    var vorn = [platz, bilanzWort(L)];

    return {
        zeilen: zeilenText(karten.slice(0, MAX).map(function (k) {
            return [k.name, k.anzahl + '×'];
        })),
        ohneRang: true,
        /* WIE VIELE FEHLEN, GEHOERT IN DEN SPALTENKOPF — die Hausregel
           ueber MAX. Das Bild zeigt acht von 28 Zeilen; ohne die 28
           liest sich das wie die ganze Liste. */
        listeKopf: 'Copies (' + Math.min(MAX, karten.length) + ' of ' + karten.length + ')',
        listeKopfLinks: 'Card',
        /* OHNE DEN ARCHETYP. Er steht gross als Titel direkt darunter —
           zweimal derselbe Name kostete die Zeichen, an denen dann das
           Datum fehlte (live gemessen 26.09.2026). */
        kicker: passtIn(String(opt.kicker || archetyp), KICKER_MAX),
        titel: opt.titel || archetyp || 'Decklist',
        fuss: fussZeile(vorn.join(' · '), L.datum || ''),
        caption: (archetyp || 'This deck') + ' — ' + platz
            + ' at ' + (L.turnier || opt.turnier || 'the event')
            + ' (' + bilanzWort(L) + '), ' + karten.length + ' different cards, '
            + gesamt + ' in total.',
        tags: hashtags(['decklist', 'pokemontcg']
            .concat(archetyp ? [archetyp] : [])
            .concat(karten.slice(0, 4).map(function (k) { return k.name; }))),
        kartenGitter: karten,
        vorlagen: ['deckliste', 'liste'],
        _gesamt: gesamt
    };
}

/* ── Was die Übergabe hergibt ────────────────────────────────────── */

function bestandListe(art) {
    var U = window.DsPostUebergabe;
    if (!U || typeof U.bestand !== 'function') return { liste: [], gekuerzt: 0 };
    var b = null;
    try { b = U.bestand(); } catch (e) { b = null; }
    return (b && b[art]) || { liste: [], gekuerzt: 0 };
}

/* Aus einem Bestandseintrag wird ein Knoten. Der Index ist die Kennung:
 * zwei Decks dürfen denselben Namen tragen, und dann wäre der Name ein
 * Schlüssel, der zwei Dinge öffnet. */
/* WAS NICHT PASSTE, WIRD GENANNT.
 *
 * Der Bestand ist gedeckelt (700 KB je Art, siehe ds-post-uebergabe.js).
 * Kuerzt er, darf die Auswahl nicht so tun, als waere sie vollstaendig —
 * der Betreiber suchte sonst ein Deck, das es „nicht gibt". Der Eintrag
 * ist waehlbar und sagt beim Laden, was zu tun ist; ein grauer Hinweis
 * ohne Erklaerung waere eine Sackgasse. */
function mitGekuerzt(knoten, b, was) {
    if (!b.gekuerzt) return knoten;
    return knoten.concat([{
        id: 'gekuerzt',
        name: '— ' + b.gekuerzt + ' more ' + was + ' did not fit —',
        lade: function () {
            return Promise.reject(new Error(b.gekuerzt + ' more ' + was
                + ' were left out: the handover is capped so it cannot fill up the '
                + 'browser storage. Open the one you want in the app and choose '
                + '„Posts page" there — it always goes first.'));
        }
    }]);
}

function bestandKnoten(art, bauen) {
    return function () {
        var b = bestandListe(art);
        return b.liste.map(function (e, i) {
            return {
                id: String(i),
                name: e.titel || ('#' + (i + 1)),
                lade: function () {
                    return Promise.resolve(bauen({
                        art: art, titel: e.titel, daten: e.daten
                    }));
                }
            };
        });
    };
}

function nichtsUebergeben(was, wo) {
    return [{
        id: 'leer', name: '— nothing handed over —',
        lade: function () {
            return Promise.reject(new Error('No ' + was + ' handed over yet. Open '
                + wo + ' in the app and choose „Posts page" there.'));
        }
    }];
}

/* ── Die fünf Ketten ─────────────────────────────────────────────── */

/* 1 · MEINE DECKS */
function meineDecks() {
    var k = bestandKnoten('deck', deckScheibe)();
    if (!k.length) return nichtsUebergeben('deck', 'a deck in „My decks"');
    return mitGekuerzt(k, bestandListe('deck'), 'decks');
}

/* 2 · DIE ERFOLGREICHSTEN LISTEN DER LETZTEN SIEBEN TAGE */
function siebenArchetypen() {
    return postListen().then(function (j) {
        var namen = Object.keys(j.sieben_tage || {});
        if (!namen.length) {
            return [{ id: 'leer', name: '— no lists in the window —',
                lade: function () {
                    return Promise.reject(new Error('The derived file carries no lists for '
                        + 'the last ' + (j.fenster ? j.fenster.tage : 7) + ' days'
                        + (j.ohne_daten ? ' (' + j.ohne_daten + ')' : '') + '.'));
                } }];
        }
        /* ALPHABETISCH — UND ZWAR GEMESSEN, NICHT GERATEN.
         *
         * Der erste Bau sortierte nach Zahl der Listen. Im Browser stand
         * dann: „Alakazam Dudunsparce (8) · Alakazam Dusknoir (8) ·
         * Basic Box (8)" — 97 Einträge, fast alle am Deckel von acht.
         * Die Zahl war damit keine Auskunft, sondern Rauschen, und die
         * Reihenfolge war in Wahrheit alphabetisch, nur unerklärt.
         *
         * Jetzt ist sie es ausdrücklich: in einem Auswahlfeld mit 97
         * Einträgen springt ein Tastendruck zum Buchstaben, und der
         * Betreiber sucht SEIN Deck. Statt der Zahl steht im Namen, was
         * dahinter wirklich interessant ist — das beste Ergebnis. */
        namen.sort(function (a, b) { return a.localeCompare(b, 'en'); });
        var sw = ((j.fenster || {}).erfolg_platz) || 0;
        /* DAS FENSTER IST DATIERT, NICHT BENANNT. Der Kopf von
           scripts/build_post_decklists.py verlangt genau das: die Datei
           entsteht beim Deploy, „letzte 7 Tage" altert mit jedem Tag
           danach. Ein fuenf Tage alter Deploy schriebe sonst „last 7
           days" ueber ein Fenster, das vor zwoelf Tagen endete. */
        var f = j.fenster || {};
        var spanne = (f.von && f.bis) ? (kurzDatum(f.von) + '–' + kurzDatum(f.bis))
            : 'last 7 days';
        return namen.map(function (a) {
            var b = j.sieben_tage[a][0];
            return {
                id: a,
                name: a + ' — best ' + platzWort(b.platz)
                    + (b.feld ? ' of ' + tausend(b.feld) : ''),
                /* Die Schwelle steht in der Frage, wie beim Major die
                   Top 32 — sonst wirkt sie stumm, und niemand weiss,
                   warum ein Archetyp fehlt. Sie kommt aus der Datei
                   (scripts/build_post_decklists.py, ERFOLG_PLATZ), nicht
                   aus dieser Zeile. */
                frage: 'List' + (sw ? ' (top ' + sw + ')' : ''),
                optionen: j.sieben_tage[a].map(function (L, i) {
                    return {
                        id: String(i),
                        name: platzWort(L.platz) + ' · '
                            + (L.feld ? tausend(L.feld) + ' players · ' : '')
                            + bilanzWort(L) + ' · ' + L.datum,
                        lade: function () {
                            return Promise.resolve(fremdeListeScheibe(j, L, {
                                archetyp: a,
                                kicker: kickerZeile(
                                    (sw ? 'Top ' + sw + ' · ' : '') + 'online',
                                    spanne),
                                titel: a,
                                turnier: L.turnier
                            }));
                        }
                    };
                })
            };
        });
    });
}

/* 3 · DAS LETZTE MAJOR, TOP 32 */
function majorArchetypen() {
    return postListen().then(function (j) {
        var m = j.major;
        if (!m || !(m.listen || []).length) {
            return [{ id: 'leer', name: '— no major on file —',
                lade: function () {
                    return Promise.reject(new Error('The derived file carries no major.'));
                } }];
        }
        var nach = {};
        m.listen.forEach(function (L) {
            var a = L.archetyp || 'Other';
            if (!nach[a]) nach[a] = [];
            nach[a].push(L);
        });
        var namen = Object.keys(nach);
        /* Nach dem besten Platz: wer das Turnier gewonnen hat, steht oben. */
        namen.sort(function (a, b) {
            return (nach[a][0].platz - nach[b][0].platz) || a.localeCompare(b, 'en');
        });
        return namen.map(function (a) {
            return {
                id: a,
                name: a + ' (' + nach[a].length + ')',
                /* „Da brauchen wir aber nicht mehr anbieten als die Top
                   32." Die Grenze steckt in der Datei (MAJOR_PLAETZE) —
                   hier steht sie in der Frage, damit sie im Bild sichtbar
                   wird und nicht stumm wirkt. */
                frage: 'Placement' + (m.plaetze ? ' (top ' + m.plaetze + ')' : ''),
                optionen: nach[a].map(function (L) {
                    return {
                        id: String(L.platz),
                        name: platzWort(L.platz) + ' place · ' + bilanzWort(L),
                        lade: function () {
                            return Promise.resolve(fremdeListeScheibe(j,
                                {
                                    platz: L.platz, w: L.w, l: L.l, t: L.t,
                                    karten: L.karten, datum: m.datum,
                                    turnier: m.name, feld: 0
                                },
                                {
                                    archetyp: a,
                                    kicker: kickerZeile(kurzTurnier(m.name), m.datum),
                                    titel: a, turnier: m.name,
                                    /* „4th" allein ist keine Aussage — und
                                       „4th of 559" war die FALSCHE Aussage:
                                       559 ist die Zahl der eingereichten
                                       Listen, das Feld hatte 3.119 Spieler
                                       (Pruefagent, 26.09.2026). Der Nenner
                                       kommt jetzt aus derselben Datei, aus
                                       der die Events-Posts ihn nehmen. Ist
                                       er nicht zu treffen, steht keiner da. */
                                    von: m.feld || 0
                                }));
                        }
                    };
                })
            };
        });
    });
}

/* 4 · DER META CALL */
function metaScheibenKnoten(paket, standName) {
    /* Welche Scheiben es gibt, weiß nur der gebaute Stand — und ob er
       sich überhaupt bauen lässt. Wirft er, steht ein Knoten da, der beim
       Klick denselben Satz sagt; eine leere Auswahl wäre stiller. */
    var erg = null, fehler = null;
    try { erg = metaCallScheiben(paket.daten || {}, String(paket.titel || ''), standName); }
    catch (e) { fehler = e; }
    if (!erg) {
        return [{ id: 'leer', name: '— not available —',
            lade: function () { return Promise.reject(fehler); } }];
    }
    var alle = (erg.karussell || []).slice();
    var aus = [];
    /* „ob jetzt alle angezeigt werden sollen im Karussell oder nur ein
       Feature davon" — das Karussell steht zuerst, weil es der Fall ist,
       den er beschrieben hat. Gemalt wird dabei die erste Scheibe; der
       Karussell-Knopf unter der Vorschau erzeugt alle. */
    /* DIE SCHEIBENLISTE WIRD ABGENOMMEN, NICHT WEITERGEGEBEN.
     *
     * `bauen()` haengt an jede Scheibe `filter` — die fuenf Scheiben —,
     * weil die Oberflaeche sie bis zum 25.09.2026 als Kartenfilter
     * anzeigte. Genau dieser Waehler ist jetzt eine Stufe der Kaskade.
     * Bliebe `filter` stehen, stuenden die fuenf Scheiben ZWEIMAL da:
     * einmal als Unterfilter und einmal als „Card filter" darunter.
     *
     * `proFilter`, `decks` und `karussell` bleiben — der Karussell-Knopf
     * und die Deckwahl arbeiten damit. */
    function ohneScheibenfilter(e) {
        if (e) delete e.filter;
        return e;
    }
    if (alle.length > 1) {
        aus.push({
            id: 'alle', name: 'All slides — carousel (' + alle.length + ')',
            lade: function () {
                return Promise.resolve(ohneScheibenfilter(
                    metaCallScheiben(paket.daten || {},
                        String(paket.titel || ''), standName)));
            }
        });
    }
    (erg.filter || []).forEach(function (f) {
        aus.push({
            id: f.id, name: f.name,
            lade: function () {
                var e = metaCallScheiben(paket.daten || {},
                    String(paket.titel || ''), standName);
                return Promise.resolve(ohneScheibenfilter(
                    e.proFilter(f.id, e.gewaehltesDeck)));
            }
        });
    });
    return aus;
}

/* Die Standardprognose: „dann wird halt die angezeigt, die jetzt gerade
 * live auf der Seite ist." Das ist der offene Meta Call der App — also
 * das EINE übergebene Stück, nicht ein gespeichertes Szenario. */
function metaStandard() {
    var U = window.DsPostUebergabe;
    var paket = (U && typeof U.holen === 'function') ? U.holen() : null;
    if (!paket || paket.art !== 'metacall') {
        var b = bestandListe('metacall');
        if (b.liste.length) {
            paket = { art: 'metacall', titel: b.liste[0].titel, daten: b.liste[0].daten };
        }
    }
    if (!paket || paket.art !== 'metacall') {
        return nichtsUebergeben('Meta Call', 'the Meta Call');
    }
    return metaScheibenKnoten(paket, 'standard');
}

/* Die bearbeitete Prognose: „dann bei der bearbeiteten Prognose werden
 * dann meine gespeicherten Metacalls angezeigt." */
function metaEigene() {
    var b = bestandListe('metacall');
    if (!b.liste.length) return nichtsUebergeben('Meta Call', 'the Meta Call');
    return mitGekuerzt(b.liste.map(function (e, i) {
        var paket = { art: 'metacall', titel: e.titel, daten: e.daten };
        return {
            id: String(i),
            name: (e.titel || ('#' + (i + 1)))
                + ((e.daten && e.daten.eigeneSchaetzungen) ? '' : ' — no own estimates'),
            frage: 'Slide',
            optionen: metaScheibenKnoten(paket, 'eigen')
        };
    }), b, 'Meta Calls');
}

/* 5 · DAS BATTLE JOURNAL */
function journalTurniere() {
    var k = bestandKnoten('turnier', turnierScheibe)();
    if (!k.length) return nichtsUebergeben('tournament', 'a tournament in the Battle Journal');
    return mitGekuerzt(k, bestandListe('turnier'), 'tournaments');
}

/* ── Die bestehenden dreizehn Quellen, unter ihre Gruppe einsortiert ──
 *
 * Sie verschwinden nicht: „Weitere Posts Feature mit entsprechender
 * Vorfilterung." Ihre Gruppe IST der Hauptfilter — sie stand bisher schon
 * als `gruppe` in jedem Rezept und war nur eine Zwischenüberschrift im
 * Wähler. Jetzt ist sie die erste Frage.
 *
 * Ihr eigener Filter (`erg.filter`) bleibt, was er ist, und erscheint als
 * LETZTE Stufe — die Oberfläche hängt ihn an, sobald das geladene
 * Ergebnis einen mitbringt. */
var GRUPPEN_ALS_HAUPT = [
    ['meta', 'Online meta'],
    ['events', 'Events'],
    ['karten', 'Cards'],
    ['champions', 'Champions'],
    ['pocket', 'Pocket']
];

function gruppenKnoten(gruppe) {
    return Object.keys(REZEPTE).filter(function (id) {
        return REZEPTE[id].gruppe === gruppe;
    }).map(function (id) {
        var r = REZEPTE[id];
        return {
            id: id,
            name: r.name + (r.groesse ? ' (' + r.groesse + ')' : ''),
            lade: function () { return window.DsPostQuellen.lade(id); }
        };
    });
}

var BAUM = [
    /* Der Meta Call steht oben: „Ja, also Hauptfeature Metacall." */
    {
        id: 'metacall', name: 'Meta Call', frage: 'Forecast',
        optionen: [
            { id: 'standard', name: 'Model forecast — as it stands on the site',
              frage: 'Slide', optionen: metaStandard },
            { id: 'eigen', name: 'My edited forecast — saved Meta Calls',
              frage: 'Saved forecast', optionen: metaEigene }
        ]
    },
    {
        id: 'decks', name: 'Decks', frage: 'Source',
        optionen: [
            { id: 'meine', name: 'My decks', frage: 'Deck', optionen: meineDecks },
            { id: 'sieben', name: 'Most successful lists — last 7 days',
              frage: 'Archetype', optionen: siebenArchetypen },
            { id: 'major', name: 'Last major', frage: 'Archetype', optionen: majorArchetypen }
        ]
    },
    {
        id: 'journal', name: 'Battle Journal', frage: 'Tournament',
        optionen: journalTurniere
    }
].concat(GRUPPEN_ALS_HAUPT.map(function (g) {
    return {
        id: g[0], name: g[1], frage: 'Source',
        optionen: function () { return gruppenKnoten(g[1]); }
    };
}));

/* ── Der Gang durch den Baum ──────────────────────────────────────────
 *
 * `kaskade(pfad)` beantwortet der Oberfläche genau eine Frage: welche
 * Wähler stehen da, was ist darin gewählt, und welches Blatt ist
 * erreicht. Die Oberfläche malt und rechnet nichts.
 *
 * Eine unbeantwortete Stufe wird mit ihrer ersten Option beantwortet —
 * siehe Kopf. Ein Pfad, der ins Leere zeigt (ein gelöschtes Deck, ein
 * Archetyp, der aus dem Fenster gefallen ist), wird ebenso behandelt:
 * die Alternative wäre ein leerer Wähler mit einem Fehler dahinter. */
function optionenVon(knoten, pfad) {
    var o = knoten.optionen;
    var erg;
    if (typeof o === 'function') {
        try { erg = Promise.resolve(o(pfad)); } catch (e) { erg = Promise.reject(e); }
    } else {
        erg = Promise.resolve(o || []);
    }
    /* EIN AUSFALL BLEIBT IM WAEHLER STEHEN, ER FRISST NICHT DIE KETTE.
     *
     * Scheitert das Nachladen einer Stufe — die abgeleitete Datei fehlt,
     * das Netz ist weg —, dann waren vorher der Hauptfilter UND alle
     * Unterfilter weg, und die Meldung stand ueber einer leeren Seite.
     * Der Ausfall gehoert dorthin, wo er passiert ist: ein Eintrag, der
     * beim Laden denselben Satz sagt. Dann sieht man, WELCHE Stufe nicht
     * kann, und die Stufen darueber bleiben bedienbar. */
    return erg.then(function (liste) {
        return (liste && liste.length) ? liste : [{
            id: 'leer', name: '— nothing here —',
            lade: function () {
                return Promise.reject(new Error('This filter has nothing behind it.'));
            }
        }];
    }, function (e) {
        return [{
            id: 'leer', name: '— not available —',
            lade: function () { return Promise.reject(e); }
        }];
    });
}

function kaskade(pfad) {
    pfad = (pfad || []).map(String);
    var stufen = [];
    var tiefe = 0;

    function weiter(knoten, optionen) {
        var wahl = pfad[tiefe];
        var treffer = optionen.filter(function (o) { return String(o.id) === wahl; })[0];
        if (!treffer) treffer = optionen[0] || null;
        stufen.push({
            frage: knoten ? (knoten.frage || 'Source') : 'Post',
            optionen: optionen.map(function (o) { return { id: String(o.id), name: o.name }; }),
            wahl: treffer ? String(treffer.id) : ''
        });
        tiefe++;
        if (!treffer) return Promise.resolve({ stufen: stufen, blatt: null });
        if (treffer.optionen) {
            return optionenVon(treffer, pfad.slice(0, tiefe)).then(function (u) {
                return weiter(treffer, u || []);
            });
        }
        /* DER RANGWAECHTER GEHOERT AUF JEDEN WEG (Pruefagent, 26.09.2026).
         *
         * `rangPruefen` sass nur in `DsPostQuellen.lade` — dem Weg, den
         * die Seite bis zur Kaskade ging. Ein Blatt, das sein `lade`
         * selbst mitbringt, kam daran vorbei. Live nachgestellt: Meta
         * Call → bearbeitete Prognose → „1 · The field" zeigte „Crustle
         * 4.0 %" und „Mega Excadrill 4.0 %" mit den Rangziffern 06 und
         * 07 darueber — das Bild behauptete eine Ordnung, die die Zahlen
         * nicht hergeben. Genau der Fall, den
         * tests/unit/test-post-quellen.js seit dem 04.09.2026 verbietet.
         *
         * Heute faengt jedes neue Blatt das mit `ohneRang: true` selbst
         * ab. Das naechste ohne diese Zeile fiele still durch — deshalb
         * steht der Waechter jetzt an der Stelle, durch die ALLE muessen. */
        var blatt = {
            id: treffer.id, name: treffer.name,
            lade: function (p) {
                return Promise.resolve(treffer.lade(p)).then(rangPruefen);
            }
        };
        return Promise.resolve({ stufen: stufen, blatt: blatt });
    }

    return weiter(null, BAUM);
}

window.DsPostQuellen = {
    REZEPTE: REZEPTE,
    BAUM: BAUM,
    kaskade: kaskade,
    postListen: postListen,
    platzWort: platzWort,
    deckScheibe: deckScheibe,
    turnierScheibe: turnierScheibe,
    uebergabeScheibe: uebergabeScheibe,
    fremdeListeScheibe: fremdeListeScheibe,
    /* Fuer die Tests und fuer die Oberflaeche. */
    liesCsv: liesCsv,
    zerlege: zerlege,
    zahlAus: zahlAus,
    prozent: prozent,
    tausend: tausend,
    kurzTurnier: kurzTurnier,
    MAX: MAX,
    FUSS_MAX: FUSS_MAX,
    KICKER_MAX: KICKER_MAX,
    kickerZeile: kickerZeile,
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
