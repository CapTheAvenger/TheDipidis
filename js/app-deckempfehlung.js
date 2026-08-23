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
        if (d.betriebsart === 'B') {
            return de()
                ? 'Im Format ' + sicher(d.format) + ' gab es noch kein Präsenzturnier. Die Empfehlung '
                  + 'stützt sich deshalb auf ' + wieviel + ' aus den Formaten davor — zusammen '
                  + sp + ' Spieler.'
                : 'There has been no in-person tournament in ' + sicher(d.format) + ' yet, so the '
                  + 'recommendation rests on ' + wieviel + ' from the formats before it — '
                  + sp + ' players in total.';
        }
        return de()
            ? 'Ausgewertet: ' + wieviel + ' aus dem laufenden Format ' + sicher(d.format)
              + ' — zusammen ' + sp + ' Spieler.'
            : 'Evaluated: ' + wieviel + ' from the current format ' + sicher(d.format)
              + ' — ' + sp + ' players in total.';
    }

    function satzNuechtern(v) {
        /* Der wichtigste Satz der ganzen Karte. Wer ihn nicht liest, haelt eine
           Empfehlung fuer eine Zusage. */
        if (!v || !v.turniere || typeof v.empfehlung_mittel !== 'number') return '';
        var scheitert = Math.round((100 - v.empfehlung_mittel) / 100 * 10) / 10;
        if (!isFinite(scheitert)) return '';
        return de()
            ? 'Das heißt nicht, dass es reicht: In rund ' + pz(100 - v.empfehlung_mittel, 0)
              + ' % der Turniere schafft es auch das empfohlene Deck nicht in Day 2. '
              + 'Das liegt am Format, nicht an der Rechnung.'
            : 'That does not mean it is enough: in about ' + pz(100 - v.empfehlung_mittel, 0)
              + ' % of tournaments even the recommended deck misses Day 2. '
              + 'That is the format, not the maths.';
    }

    function satzBeleg(v, art) {
        if (!v || !v.turniere) return '';
        var wo = (art === 'B')
            ? (de() ? 'an ' + v.turniere + ' vergangenen Kaltstarts' : 'against ' + v.turniere + ' past cold starts')
            : (de() ? 'an ' + v.turniere + ' vergangenen Turnieren' : 'against ' + v.turniere + ' past tournaments');
        var se = (typeof v.vorsprung_standardfehler === 'number')
            ? (de() ? ' (± ' + pz(v.vorsprung_standardfehler) + ' pp)' : ' (± ' + pz(v.vorsprung_standardfehler) + ' pp)')
            : '';
        return de()
            ? 'Nachgerechnet ' + wo + ': wer dieser Regel gefolgt wäre, kam im Schnitt auf '
              + pz(v.empfehlung_mittel) + ' % Day 2, ein beliebiges Deck auf ' + pz(v.feld_mittel)
              + ' %. Vorsprung ' + pz(v.vorsprung) + ' pp' + se + ', besser in '
              + v.ueber_feldschnitt + ' von ' + v.turniere + ' Fällen. Die im Nachhinein beste '
              + 'Wahl kam auf ' + pz(v.bestmoeglich_mittel) + ' %.'
            : 'Replayed ' + wo + ': following this rule averaged ' + pz(v.empfehlung_mittel)
              + ' % Day 2, an arbitrary deck ' + pz(v.feld_mittel) + ' %. Margin '
              + pz(v.vorsprung) + ' pp' + se + ', better in ' + v.ueber_feldschnitt + ' of '
              + v.turniere + ' cases. The best pick in hindsight reached '
              + pz(v.bestmoeglich_mittel) + ' %.';
    }

    function blockVorbehalt(oa) {
        if (!oa || typeof oa.anteil_unbekannt !== 'number') return '';
        if (oa.anteil_unbekannt < VORBEHALT_AB) return '';
        var gross = (oa.groesste_unbekannte || [])[0];
        var text = de()
            ? '<strong>' + pz(oa.anteil_unbekannt) + ' % des Online-Feldes ist neu.</strong> '
              + 'So viele der heute online gespielten Decks gab es bei den ausgewerteten Turnieren '
              + 'noch nicht'
              + (gross ? ' — darunter ' + sicher(gross.deck) + ' mit ' + pz(gross.anteil)
                          + ' % Anteil' : '')
              + '. Wie sich die Empfehlung gegen diese Decks schlägt, sagt die Rechnung nicht. '
              + 'Prüf das im Meta Call, bevor du dich festlegst. Online-Stand: '
              + datum(oa.schnappschuss) + '.'
            : '<strong>' + pz(oa.anteil_unbekannt) + ' % of the online field is new.</strong> '
              + 'That many decks played online today did not exist at the tournaments evaluated here'
              + (gross ? ' — among them ' + sicher(gross.deck) + ' at ' + pz(gross.anteil) + ' %' : '')
              + '. How the recommendation fares against them is not something this calculation knows. '
              + 'Check it in the Meta Call before committing. Online snapshot: '
              + datum(oa.schnappschuss) + '.';
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
        var kopf = de() ? 'Was du mitnehmen solltest' : 'What to bring';

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
                  + (de() ? 'so oft reicht es für Day 2' : 'how often this reaches Day 2') + '</div>'
        +       '<div class="ds-stat-context">'
                  + (de() ? 'beliebiges Deck ' : 'arbitrary deck ') + pz(v.feld_mittel) + ' %</div>'
        +     '</div>'
        +     '<div class="ds-stat">'
        +       '<div class="ds-stat-value">' + pz(e.day2_geschrumpft) + ' %</div>'
        +       '<div class="ds-stat-label">'
                  + (de() ? 'Day-2-Quote des Decks bisher' : 'the deck’s Day 2 rate so far') + '</div>'
        +       '<div class="ds-stat-context">' + gz(e.ankerspieler) + ' '
                  + (de() ? 'Spieler ausgewertet' : 'players evaluated') + '</div>'
        +     '</div>'
        +   '</div>'

        +   '<p class="ds-note">' + satzNuechtern(v) + '</p>'
        +   blockVorbehalt(d.online_abdeckung)

        +   '<details class="de-beleg">'
        +     '<summary>' + (de() ? 'Wie zuverlässig ist das?' : 'How reliable is this?') + '</summary>'
        +     '<p class="ds-note">' + satzBeleg(v, d.betriebsart) + '</p>'
        +     '<p class="ds-note">' + satzAnker(d) + '</p>'
        +     '<p class="ds-note">'
        +       (de()
                  ? 'Decks mit wenigen Spielern werden Richtung Durchschnitt korrigiert, sonst '
                    + 'stünde ein Deck mit sechs Spielern und einem Glückstreffer auf Rang 1. '
                    + 'Unter ' + gz(d.min_ankerspieler_anzeige) + ' ausgewerteten Spielern taucht '
                    + 'ein Deck hier gar nicht erst auf.'
                  : 'Decks with few players are pulled towards the average, otherwise a deck with '
                    + 'six players and one lucky run would rank first. Below '
                    + gz(d.min_ankerspieler_anzeige) + ' evaluated players a deck is not listed at all.')
        +     '</p>'
        +   '</details>'

        +   '<p class="ds-note"><a href="#meta-call" class="de-mehr">'
        +     (de() ? 'Alternativen und Matchups im Meta Call →' : 'Alternatives and matchups in the Meta Call →')
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
