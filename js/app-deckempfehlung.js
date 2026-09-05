/**
 * Die Deckempfehlung — welches Deck man zum naechsten Turnier mitbringt.
 *
 * WO SIE STEHT UND WARUM NICHT IM META CALL
 *
 * Die erste Fassung sass oben im Meta Call. Das war falsch: der Meta Call hat
 * mit renderRecommendationsPanel() bereits eine eigene Day-2-Rangliste, aus
 * einem voellig anderen Verfahren (simulierte Matchups gegen ein prognostiziertes
 * Feld). Zwei nummerierte Listen mit derselben Ueberschrift, verschiedenen
 * Siegern und nichts, was den Unterschied erklaert — der Leser haette keine
 * Moeglichkeit gehabt zu wissen, welcher er folgen soll.
 *
 * Darum steht die Empfehlung auf der Startseite, ueber der beschreibenden
 * Meta-Uebersicht: erst die Entscheidung, darunter die Belege. Der Meta Call
 * bleibt der Simulator und behaelt seine eigene Liste. Eine Rangliste zeigt
 * dieses Modul bewusst NICHT — dafuer gibt es den Link dorthin.
 *
 * WELCHE ZAHL GROSS DASTEHT
 *
 * Nicht die Anker-Quote des empfohlenen Decks. Die lag fuer Dragapult bei
 * 28,5 % und liest sich wie "so oft schaffst du Day 2" — sie ist aber die
 * historische Quote des Decks im Anker, nicht die gemessene Trefferquote der
 * Regel. Gross steht, was die Regel in der laufenden Betriebsart tatsaechlich
 * gebracht hat, mit dem Feldschnitt daneben. Und darunter der Satz, der am
 * meisten wert ist: dass es in den meisten Turnieren trotzdem nicht reicht.
 *
 * WAS HIER NICHT PASSIERT
 *
 * Nichts wird gerechnet und nichts geschaetzt. Fehlt eine Zahl, steht
 * "unbekannt" da — dafuer sorgt pz(), und zwar an jeder Ausgabestelle.
 *
 * Datenquelle: data/deckempfehlung.json aus scripts/build_deckempfehlung.py.
 */
(function () {
    'use strict';

    var DATEI = 'deckempfehlung.json';

    /* Ab so viel unbekanntem Online-Feld bekommt der Vorbehalt eigene Flaeche. */
    var VORBEHALT_AB = 10;

    var DATEN = null;   /* Promise<object|null>, nur bei Erfolg gemerkt */

    function basis() {
        /* BASE_PATH ist in app-core.js ein top-level const und liegt damit im
           lexikalischen Geltungsbereich, NICHT auf window — deshalb die bare
           Abfrage. ds-datenstand.js fragt window ab und faellt immer durch. */
        if (typeof BASE_PATH === 'string') return BASE_PATH;
        return 'data/';
    }

    function de() {
        return !(typeof getLang === 'function' && getLang() === 'en');
    }

    function sicher(s) {
        if (typeof escapeHtml === 'function') return escapeHtml(s);
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** Prozentzahl. Fehlt sie, steht das da — nie "null" und nie "undefined". */
    function pz(wert, stellen) {
        if (typeof wert !== 'number' || !isFinite(wert)) return de() ? 'unbekannt' : 'unknown';
        var s = wert.toFixed(typeof stellen === 'number' ? stellen : 1);
        return de() ? s.replace('.', ',') : s;
    }

    /** Ganze Zahl mit Tausenderpunkt. */
    function gz(wert) {
        if (typeof wert !== 'number' || !isFinite(wert)) return de() ? 'unbekannt' : 'unknown';
        return Math.round(wert).toLocaleString(de() ? 'de-DE' : 'en-GB');
    }

    /** ISO-Datum als 23.08.2026 — die Seite zeigt sonst nirgends ISO an. */
    function datum(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return de() ? 'unbekannt' : 'unknown';
        return de() ? m[3] + '.' + m[2] + '.' + m[1] : m[3] + '/' + m[2] + '/' + m[1];
    }

    function laden() {
        if (DATEN) return DATEN;
        var p = fetch(basis() + DATEI + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) {
                if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
                return r.json();
            })
            .catch(function (e) {
                console.warn('[Deckempfehlung] ' + DATEI + ' nicht ladbar:', e);
                /* Einen Fehlschlag NICHT merken: sonst bleibt die Startseite
                   fuer den Rest der Sitzung leer, weil einmal das Netz zuckte. */
                DATEN = null;
                return null;
            });
        DATEN = p;
        return p;
    }

    /* ---------- Saetze ---------- */

    function satzAnker(d) {
        var namen = (d.anker || []).map(function (t) { return sicher(t.name); });
        if (!namen.length) return '';
        var sp = gz(d.ankerspieler_gesamt);
        var wieviel = namen.length <= 3
            ? namen.join(de() ? ' und ' : ' and ')
            : (de() ? namen.length + ' Präsenzturniere' : namen.length + ' in-person tournaments');
        // Die Mindestspielerzahl haengt am Format und gehoert deshalb
        // hierher, nicht auf die Methodikseite: sie ist der Nenner
        // dieser Empfehlung, keine allgemeine Regel.
        var grenze = d.min_ankerspieler_anzeige;
        var zusatz = grenze
            ? (de() ? ' (min. ' + gz(grenze) + ' pro Deck)'
                    : ' (min. ' + gz(grenze) + ' per deck)')
            : '';
        if (d.betriebsart === 'B') {
            // Zwei Saetze fuer eine Angabe. Der Grund ("es gab noch
            // kein Praesenzturnier") und die Folge ("also die davor")
            // sind dieselbe Aussage, einmal gesagt reicht.
            return (de()
                ? sicher(d.format) + ' hatte noch kein Präsenzturnier. Basis: '
                  + wieviel + ' aus den Formaten davor, ' + sp + ' Spieler'
                : 'No in-person tournament in ' + sicher(d.format) + ' yet. Basis: '
                  + wieviel + ' from the formats before, ' + sp + ' players') + zusatz + '.';
        }
        return (de()
            ? 'Basis: ' + wieviel + ' aus ' + sicher(d.format) + ', ' + sp + ' Spieler'
            : 'Basis: ' + wieviel + ' from ' + sicher(d.format) + ', ' + sp + ' players')
            + zusatz + '.';
    }

    function satzNuechtern(v) {
        /* Der wichtigste Satz der ganzen Karte. Wer ihn nicht liest, haelt eine
           Empfehlung fuer eine Zusage. */
        if (!v || !v.turniere || typeof v.empfehlung_mittel !== 'number') return '';
        // Frueher stand hier ein gerundeter Zwischenwert `scheitert`, der
        // nirgends benutzt wurde — die Anzeige unten rechnet aus dem
        // Rohwert. Ein toter, halbgerundeter Wert neben einer Anzeige ist
        // genau das Konstrukt, das beim naechsten Umbau versehentlich
        // scharfgeschaltet und dann doppelt gerundet wird. Geblieben ist
        // die Pruefung, die er eigentlich leistete.
        if (!isFinite(Number(v.empfehlung_mittel))) return '';
        // Drei Saetze waren zwei zu viel. Die Aussage ist eine: auch
        // das beste Deck reicht meistens nicht. Wer wissen will, warum
        // das am Format liegt und nicht an der Rechnung, findet es unter
        // Quellen & Methodik.
        /* DIE GRUNDGESAMTHEIT WAR VERTAUSCHT — FAKTOR 33 (05.09.2026).
           Hier stand "in 75 % der TURNIERE ist nach Day 1 Schluss".
           `empfehlung_mittel` ist aber keine Turnierquote:
           scripts/build_deckempfehlung.py:196 setzt
           `out[k] = zahl(r.get("day1_to_day2_conv")) * 100.0`, also den
           Anteil der SPIELER dieses Decks, die Day 2 erreichen —
           gemittelt ueber 44 nachgerechnete Turniere.

           Die Datei sagt im selben Objekt, wie die Turnierzahl wirklich
           aussieht: `day2_ueberhaupt_erreicht: 43` von `turniere: 44`.
           In 2,3 % der Turniere war fuer das empfohlene Deck nach Day 1
           Schluss, nicht in 75 %. Der Satz war um den Faktor 33 falsch —
           und er ist ausdruecklich "der wichtigste Satz der ganzen
           Karte".

           Jetzt steht die Quote an ihrer eigenen Grundgesamtheit, und
           der Nenner steht daneben. */
        return de()
            ? 'Und trotzdem: von je vier Spielern dieses Decks scheitern rund '
              + gz(Math.round((100 - v.empfehlung_mittel) / 25)) + ' an Day 1 — '
              + pz(100 - v.empfehlung_mittel, 0) + ' % der Antritte, gemittelt über '
              + gz(v.turniere) + ' Turniere.'
            : 'And still: about ' + gz(Math.round((100 - v.empfehlung_mittel) / 25))
              + ' in 4 players on this deck fall short of Day 2 — '
              + pz(100 - v.empfehlung_mittel, 0) + ' % of entries, averaged over '
              + gz(v.turniere) + ' tournaments.';
    }

    // satzBeleg() stand hier bis zum 30.08.2026: die Nachrechnung
    // ("wer dieser Regel gefolgt waere, kam im Schnitt auf X % Day 2 …").
    // Sie war der Inhalt des aufklappbaren Beleg-Kastens, und der ist
    // nach Quellen & Methodik umgezogen. Die Funktion hatte danach
    // keinen Aufrufer mehr; ein toter Textbaustein ist schlimmer als
    // gar keiner, weil ihn beim naechsten Mal jemand fuer benutzt haelt.

    function blockVorbehalt(oa) {
        /* Bis zum 30.08.2026 standen hier fuenf Zeilen: der Anteil, was
           er bedeutet, das groesste unbekannte Deck mit eigener Zahl, was
           die Rechnung darueber nicht weiss, wo man es nachsieht, und das
           Datum des Online-Schnappschusses. Alles davon stimmt — und
           alles davon steht direkt unter der Empfehlung, also an der
           Stelle, an der jemand gerade eine Entscheidung trifft.

           Der Vorbehalt bleibt, weil er die Aussage darueber begrenzt;
           ihn wegzulassen waere unehrlich. Er passt aber in einen Satz.
           Die Herleitung steht unter Quellen & Methodik. */
        if (!oa || typeof oa.anteil_unbekannt !== 'number') return '';
        if (oa.anteil_unbekannt < VORBEHALT_AB) return '';
        var text = de()
            ? '<strong>' + pz(oa.anteil_unbekannt) + ' % vom Feld sind neu.</strong> '
              + 'Gegen die Decks ist der Pick ungetestet — '
              + '<a href="#meta-call">im Meta Call nachsehen</a>.'
            : '<strong>' + pz(oa.anteil_unbekannt) + ' % of the field is new.</strong> '
              + 'The pick is untested against those decks — '
              + '<a href="#meta-call">check the Meta Call</a>.';
        return '<p class="de-vorbehalt">' + text + '</p>';
    }

    /* ---------- Aufbau ---------- */

    function baue(d) {
        if (!d || !d.empfehlung) {
            return '<section class="ds-panel de-empfehlung"><p class="ds-note">'
                + (de() ? 'Für dieses Format liegt noch keine Empfehlung vor.'
                        : 'No recommendation available for this format yet.')
                + '</p></section>';
        }
        var e = d.empfehlung;
        var v = d.vertrauen || {};
        /* BEFUND (31.08.2026, vom Betreiber angestrichen): "Was du mitnehmen
   solltest" liest sich wie eine Packliste. Gemeint ist das Deck, das
   wir fuer das naechste Turnier empfehlen — und genau so heisst es
   jetzt. "Pick" ist das Wort, das die Szene ohnehin benutzt. */
        var kopf = de() ? 'Unser Pick fürs Turnier' : 'Our pick for the event';

        return ''
        + '<section class="ds-panel de-empfehlung" aria-labelledby="deEmpfehlungTitel">'
        +   '<h3 class="ds-label" id="deEmpfehlungTitel">' + sicher(kopf)
        +     '<span class="ds-label-note">' + sicher(d.format) + ' · '
              + datum(d.erzeugt) + '</span>'
        +   '</h3>'

        +   '<p class="de-deck">' + sicher(e.deck) + '</p>'

        +   '<div class="ds-stat-row">'
        +     '<div class="ds-stat is-pos">'
        +       '<div class="ds-stat-value">' + pz(v.empfehlung_mittel) + ' %</div>'
        +       '<div class="ds-stat-label">'
                  + (de() ? 'schafft Day 2' : 'makes Day 2') + '</div>'
        +       '<div class="ds-stat-context">'
                  + (de() ? 'Schnitt aller Decks ' : 'average across all decks ') + pz(v.feld_mittel) + ' %</div>'
        +     '</div>'
        +     '<div class="ds-stat">'
        +       '<div class="ds-stat-value">' + pz(e.day2_geschrumpft) + ' %</div>'
        +       '<div class="ds-stat-label">'
                  + (de() ? 'Day-2-Rate bisher' : 'Day 2 rate so far') + '</div>'
        +       '<div class="ds-stat-context">'
                  + (de() ? 'aus ' : 'from ') + gz(e.ankerspieler) + ' '
                  + (de() ? 'Spielern' : 'players') + '</div>'
        +     '</div>'
        +   '</div>'

        +   '<p class="ds-note">' + satzNuechtern(v) + '</p>'
        +   blockVorbehalt(d.online_abdeckung)

        // Der aufklappbare Beleg-Kasten "Wie zuverlaessig ist das?"
        // stand hier bis zum 30.08.2026 mit drei Absaetzen: Nachrechnung,
        // Ankerturniere, Glaettung und Mindestspielerzahl. Er ist nicht
        // geloescht, sondern umgezogen — die allgemeinen Teile stehen
        // unter Quellen & Methodik, die zwei Angaben, die NUR fuer diese
        // Empfehlung gelten (welche Turniere, wie viele Spieler), bleiben
        // hier als eine Zeile. Sie sind der Nenner der Zahlen darueber,
        // keine Methodik.
        +   '<p class="ds-note de-beleg-zeile">' + satzAnker(d) + ' '
        +     '<a class="qu-verweis" href="#quellen">'
        +     (de() ? 'Wie zuverlässig ist das? →' : 'How reliable is this? →')
        +     '</a></p>'

        +   '<p class="ds-note"><a href="#meta-call" class="de-mehr">'
        +     (de() ? 'Alternativen & Matchups im Meta Call →' : 'Alternatives & matchups in the Meta Call →')
        +   '</a></p>'
        + '</section>';
    }

    function zeichne() {
        var host = document.getElementById('deckempfehlungHost');
        if (!host) return Promise.resolve(false);
        return laden().then(function (d) {
            host.innerHTML = baue(d);
            return true;
        }).catch(function (e) {
            console.warn('[Deckempfehlung] Rendern fehlgeschlagen:', e);
            return false;
        });
    }

    function init() { return zeichne(); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { zeichne(); });
    } else {
        zeichne();
    }
    document.addEventListener('languageChanged', function () {
        var host = document.getElementById('deckempfehlungHost');
        if (host && host.innerHTML) zeichne();
    });

    window.Deckempfehlung = { init: init, zeichne: zeichne, _baue: baue };
}());
