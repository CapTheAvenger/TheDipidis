/* ds-datenumfang.js — worauf die Zahlen der Meta-Ansicht beruhen.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Auf der Startseite stand bis zum 01.09.2026 eine Kachelreihe:
 * "Gemeldete Listen 26.319 · Archetypen 138 · Top 8 Archetypes 61 %".
 * Gemeldet: "Ich weiss nicht, ob diese Aussage tatsaechlich irgendeinen
 * Mehrwert hat. … koennen wir das bei Quelle mit angeben? Okay, die
 * Daten berufen sich auf so und so viele gemeldete Listen, so und so
 * viele Turniere, so und so viele Spieler."
 *
 * Die Zahlen sind richtig und gehoeren nicht geloescht — sie gehoeren
 * an die Stelle, an der jemand fragt, wie belastbar das ist. Das ist
 * Quellen & Methodik.
 *
 * WARUM EIN EIGENES MODUL UND KEIN ZWEITER RECHENWEG
 *
 * Die Zahlen kennt nur js/app-tier-meta.js: es ist die einzige Stelle,
 * die beide Nenner gleichzeitig hat (die Decklisten der Online-Ladder
 * und die gewichteten Turnier-Antritte) und die weiss, wie viel
 * Limitless als "Other" wegfallen laesst. Sie dort noch einmal zu
 * rechnen, waere ein zweiter Rechenweg fuer dieselbe Groesse — und
 * genau davon hatte diese Seite schon einmal vier Win Rates fuer ein
 * Deck auf einem Bildschirm.
 *
 * Also: app-tier-meta.js rechnet und meldet hier an, app-quellen.js
 * liest hier ab. Zwischengespeichert wird in sessionStorage, damit die
 * Quellenseite auch dann etwas zeigt, wenn sie direkt ueber einen Link
 * geoeffnet wurde und die Meta-Ansicht in dieser Sitzung noch nicht
 * gerechnet hat.
 *
 * REGEL: keine Zahl ohne Herkunft. Fehlt eine Angabe, bleibt sie weg —
 * geschaetzt wird nichts.
 */
(function () {
    'use strict';

    var SPEICHER = 'ds_datenumfang_v1';

    /* Aelter als das, und die Zahlen gehoeren nicht mehr zum heutigen
       Stand. Lieber gar keine Angabe als die von vorletzter Woche. */
    var HOECHSTALTER_MS = 24 * 60 * 60 * 1000;

    var _umfang = null;

    /* Nachtraege, die kommen koennen, BEVOR der erste vollstaendige Stand
       da ist — oder die ein neuer Stand sonst wegwischen wuerde.
       Warum das noetig ist, steht bei ergaenze(). */
    var _nachtrag = {};

    /* Felder, die NICHT aus dem Lauf der Tier-Liste stammen und einen
       neuen Stand deshalb ueberleben muessen. */
    var NACHTRAGSFELDER = ['staplesArchetypen'];

    function zahl(v) {
        var n = Number(v);
        return (isFinite(n) && n > 0) ? n : null;
    }

    function schreibe(u) {
        _umfang = u;
        try { sessionStorage.setItem(SPEICHER, JSON.stringify(u)); } catch (e) { /* kein Speicher, kein Problem */ }
        return u;
    }

    /* Nimmt entgegen, was app-tier-meta.js gerechnet hat. Alles, was
       keine brauchbare Zahl ist, faellt hier heraus und nicht erst in
       der Anzeige — so kann keine 0 als "null Turniere" durchrutschen. */
    function setzen(d) {
        if (!d || typeof d !== 'object') return null;
        var u = {
            listen:     zahl(d.listen),
            archetypen: zahl(d.archetypen),
            antritte:   zahl(d.antritte),
            top8Anteil: (typeof d.top8Anteil === 'number' && d.top8Anteil > 0) ? d.top8Anteil : null,
            feldGesamt: zahl(d.feldGesamt),
            restAnteil: (typeof d.restAnteil === 'number' && d.restAnteil > 0) ? d.restAnteil : null,
            turniere:   zahl(d.turniere),
            spieler:    zahl(d.spieler),
            partien:    zahl(d.partien),
            stand:      d.stand || null,
            gemessen:   Date.now(),
        };
        /* BEFUND (Review 01.09.2026): setzen() ersetzte den ganzen Stand
           und warf damit staplesArchetypen weg. Beim ERSTEN Aufbau fiel
           das nicht auf, weil die Tier-Liste vor dem Staples-Widget
           laeuft. Beim SPRACHWECHSEL dreht sich die Reihenfolge:
           staplesWidgetNeuBeschriften() zeichnet sofort und meldet den
           Nenner, renderCurrentMetaTierList() kommt erst nach seinen
           await-Punkten an und loeschte ihn wieder. Gemessen: nach dem
           ersten Klick auf DE fehlte die Zeile ueber die Kartenanteile
           dauerhaft — genau die Zahl, die die Flaeche verlassen durfte,
           aber nicht die Seite.
           Ein Nachtrag gehoert nicht zu diesem Lauf, also raeumt ein
           neuer Lauf ihn auch nicht weg. */
        var frueher = lesen();
        NACHTRAGSFELDER.forEach(function (f) {
            var v = zahl(_nachtrag[f]) || (frueher ? zahl(frueher[f]) : null);
            if (v) u[f] = v;
        });
        return schreibe(u);
    }

    /* Ergaenzt eine Angabe, die woanders anfaellt, ohne den Rest zu
       ueberschreiben. Genau ein Fall bisher: die Zahl der Archetypen mit
       vollstaendiger Deckliste — sie ist der Nenner der Kartenanteile,
       und sie kennt nur das Staples-Widget. setzen() darf das nicht
       leisten: dort ist Ersetzen richtig, weil ein neuer Lauf einen
       ganzen Stand bringt.

       Gibt es noch keinen Stand, wird NICHTS geschrieben — sonst stuende
       unter Quellen & Methodik ein Umfang, der aus einer einzigen Zeile
       ueber Kartenanteile besteht und von Listen, Antritten und
       Turnieren schweigt. Das saehe aus wie eine Antwort und waere eine
       Luecke. Der Nachtrag wartet stattdessen auf den naechsten Stand. */
    function ergaenze(d) {
        if (!d || typeof d !== 'object') return null;
        NACHTRAGSFELDER.forEach(function (f) {
            if (zahl(d[f])) _nachtrag[f] = zahl(d[f]);
        });
        var u = lesen();
        if (!u) return null;
        NACHTRAGSFELDER.forEach(function (f) {
            if (_nachtrag[f]) u[f] = _nachtrag[f];
        });
        return schreibe(u);
    }

    function lesen() {
        if (_umfang) return _umfang;
        try {
            var v = JSON.parse(sessionStorage.getItem(SPEICHER));
            if (v && typeof v === 'object'
                && Date.now() - (v.gemessen || 0) < HOECHSTALTER_MS) {
                _umfang = v;
                return v;
            }
        } catch (e) { /* nichts gemerkt */ }
        return null;
    }

    /* Die Saetze fuer Quellen & Methodik. Rueckgabe ist eine Liste von
       Zeilen; jede Zeile steht nur da, wenn ihre Zahl bekannt ist. */
    function saetze(de) {
        var u = lesen();
        if (!u) return [];
        var loc = de ? 'de-DE' : 'en-US';
        var g = function (n) { return Math.round(n).toLocaleString(loc); };
        var z = [];

        if (u.listen) {
            var s = de
                ? g(u.listen) + ' gemeldete Decklisten von der Online-Ladder'
                : g(u.listen) + ' reported decklists from the online ladder';
            if (u.archetypen) {
                s += de ? ', verteilt auf ' + g(u.archetypen) + ' Archetypen'
                        : ', across ' + g(u.archetypen) + ' archetypes';
            }
            z.push(s + '.');
        }
        if (u.feldGesamt && u.restAnteil) {
            z.push(de
                ? 'Das sind ' + (100 - u.restAnteil).toFixed(1).replace('.', ',') + ' % des Feldes. '
                  + 'Die übrigen ' + g(u.feldGesamt - u.listen) + ' Listen führt Limitless als '
                  + '„Other“ und meldet sie nicht einzeln.'
                : 'That is ' + (100 - u.restAnteil).toFixed(1) + ' % of the field. The remaining '
                  + g(u.feldGesamt - u.listen) + ' lists are filed as "Other" by Limitless and '
                  + 'not reported individually.');
        }
        if (u.antritte) {
            z.push(de
                ? g(u.antritte) + ' gewichtete Turnier-Antritte — die zweite, unabhängige '
                  + 'Zählung desselben Metas. Aus ihr kommen Antritte und Top-8-Quoten.'
                : g(u.antritte) + ' weighted tournament entries — the second, independent count '
                  + 'of the same field. Entries and top-8 rates come from it.');
        }
        if (u.top8Anteil) {
            z.push(de
                ? 'Auf die acht größten Archetypen — in der Szene die Top 8 Archetypes — '
                  + 'entfallen ' + u.top8Anteil.toFixed(0) + ' % des Feldes. Daran lässt sich '
                  + 'ablesen, wie eng das Meta gerade ist.'
                : 'The eight largest archetypes — the top 8 archetypes — account for '
                  + u.top8Anteil.toFixed(0) + ' % of the field. That is how concentrated the '
                  + 'meta currently is.');
        }
        if (u.staplesArchetypen) {
            z.push(de
                ? 'Die Kartenanteile unter „Meistgespielte Karten“ zählen anders: ihr Nenner '
                  + 'sind die ' + g(u.staplesArchetypen) + ' Archetypen, zu denen vollständige '
                  + 'Decklisten vorliegen — nur in denen lässt sich nachsehen, welche Karte '
                  + 'drinsteckt.'
                : 'The card shares under "Most played cards" count differently: their denominator '
                  + 'is the ' + g(u.staplesArchetypen) + ' archetypes with complete decklists — '
                  + 'only in those can a card be looked up.');
        }
        if (u.turniere || u.spieler || u.partien) {
            var teile = [];
            if (u.turniere) teile.push(g(u.turniere) + (de ? ' Turniere' : ' tournaments'));
            if (u.spieler)  teile.push(g(u.spieler)  + (de ? ' Spieler'  : ' players'));
            if (u.partien)  teile.push(g(u.partien)  + (de ? ' Partien'  : ' games'));
            var satz = (de ? 'Ausgewertet wurden ' : 'Evaluated: ') + teile.join(' · ');
            if (u.stand) {
                var dt = new Date(u.stand);
                if (!isNaN(dt.getTime())) {
                    satz += de ? ' (Stand ' + dt.toLocaleDateString('de-DE') + ')'
                               : ' (as of ' + dt.toLocaleDateString('en-GB') + ')';
                }
            }
            z.push(satz + '.');
        }
        return z;
    }

    window.DsDatenumfang = { setzen: setzen, ergaenze: ergaenze, lesen: lesen, saetze: saetze };
}());
