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
 *
 * ═══════════════════════════════════════════════════════════════════
 * UMGEZOGEN AM 11.09.2026 — WAS HIER NOCH STEHT UND WARUM
 * ═══════════════════════════════════════════════════════════════════
 *
 * Der Betreiber, mit der Vorlage daneben: „für das dein Deck gegen das
 * Meta Feature kannst du noch mal ein umfassendes Rework machen … Das
 * bestehende Konzept soll nicht länger als isolierter Analysebereich
 * neben der eigentlichen Meta-Analyse bestehen. Stattdessen soll die
 * Funktion in den bestehenden Bereich Meta Call integriert werden."
 *
 * Der Grund ist inhaltlich, nicht baulich. Dieser Block gewichtete jede
 * Paarung mit dem Anteil, den der Gegner im GEMESSENEN Online-Feld hat.
 * Diese Zahl beantwortet „wie stünde ich, wenn heute Abend online
 * gespielt würde". Die Frage vor einem Turnier ist eine andere: gegen
 * das Meta, das ich DORT erwarte. Genau diese Anteile führt der Meta
 * Call in seiner Spalte „Final %" — Prognose, oder die eigene Schätzung
 * des Nutzers, wo er eine eingetragen hat.
 *
 * Die Rechnung ist deshalb dorthin gezogen (renderDeckGegenMetaPanel in
 * js/app-meta-call.js) und rechnet dort mit denselben Grundsätzen:
 * fehlende Paarungen werden weggelassen statt mit 50 % aufgefüllt, die
 * Abdeckung steht daneben, das Band kommt aus derselben Beta-Varianz.
 * Dazu kann sie, was hier nie ging: die eigenen Quoten des Nutzers
 * berücksichtigen und deren Herkunft je Zeile ausweisen.
 *
 * WAS AN DIESER STELLE BLEIBT: ein Verweis. Ersatzlos zu verschwinden
 * wäre für jemanden, der den Abschnitt kennt, dasselbe wie kaputt.
 *
 * WAS IM MODUL BLEIBT: `rechne()`. Sie ist die geprüfte Rechnung gegen
 * ein gemessenes Feld und hängt an nichts, was mit der Darstellung zu
 * tun hat; sie steht weiter unter window.DsEvRechner zur Verfügung.
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

    /* `formel` ist KEINE Funktion des Moduls, sondern ein Feld des
       Eintrags, den hol() liefert (js/win-rate-konvention.js:333 —
       exportiert sind hol/kurz/kuerzel/hinweis/kurzHinweis/bilanz/…). */
    function quotenFormel(konvention) {
        var K = window.WinRateKonvention;
        var e = (K && typeof K.hol === 'function') ? K.hol(konvention || EV_KONVENTION) : null;
        return (e && e.formel) ? e.formel : 'S / (S + N)';
    }

    /* Dieselbe Aussage auf Englisch — und der Grund, warum es zwei
       Funktionen sind statt einer mit L().

       Der deutsche Satz enthaelt den Hausnamen „Win %" WOERTLICH, weil
       er ihn abgrenzt: „das ist NICHT die Groesse, die Limitless Win %
       nennt". tests/unit/test-w3-ev-und-abschnitt.js laesst genau EINE
       solche Fundstelle im Quelltext zu — eine zweite waere keine
       Abgrenzung mehr, sondern eine Beschriftung. Der englische Satz
       holt den Namen deshalb zur Laufzeit aus dem Modul. */
    function quotenHinweisEn(konvention) {
        var K = window.WinRateKonvention;
        var mp = (K && typeof K.kurz === 'function') ? K.kurz('matchpunkte') : 'match points';
        return quotenName(konvention) + ' (' + quotenFormel(konvention) + ')'
            + ', smoothed with k = 20 (js/matchup-glaettung.js). Ties are not in the'
            + ' denominator; this is NOT what Limitless calls "' + mp + '".';
    }

    function quotenHinweis(konvention) {
        return quotenName(konvention) + ' (' + quotenFormel(konvention) + ')'
            + ', geglaettet mit k = 20 (js/matchup-glaettung.js). Unentschieden'
            + ' stehen nicht im Nenner; das ist NICHT die Groesse, die'
            + ' Limitless "Win %" nennt.';
    }


    var HOST_ID = 'currentMetaContent';
    var BLOCK   = 'ds-ev-block';
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

    /* Der Verweis, der an dieser Stelle stehen bleibt.
     *
     * Er benutzt dieselben Bausteine wie der Block vorher (ds-panel,
     * ds-note, ds-controls) und bringt keine eigene Regel mit — die
     * Abnahmebedingung aus der Entwurfsphase gilt fuer einen Verweis
     * genauso wie fuer einen Rechner.
     *
     * Er traegt .ds-btn — den Knopf-Baustein aus css/components.css, den
     * auch die Abschnittskoepfe benutzen. `ds-ev-ziel` steht nur als
     * Griff daneben und hat bewusst keine Regel hinter sich; die
     * Abnahmebedingung dieses Moduls ist „keine eigene CSS-Regel", und
     * ein Verweis ist kein Grund, sie zu brechen.
     *
     * Der Knopf schaltet den Reiter um, statt einen Link zu setzen: die
     * Seite ist eine einzelne Anwendung, und `switchTab` ist der Weg,
     * den auch das Menue nimmt. Faellt die Funktion aus (frueher
     * Ladezustand), bleibt der Anker mit #meta-call stehen — der wird
     * von js/inline-init.js beim naechsten Durchlauf aufgeloest. */
    function verweisHtml() {
        var text = L(
            'Diese Rechnung ist in den <strong>Meta Call</strong> gezogen. Dort gewichtet '
            + 'sie jede Paarung nicht mehr mit dem gemessenen Online-Anteil des Gegners, '
            + 'sondern mit dem Anteil, den du für dein nächstes Turnier erwartest — und sie '
            + 'kennt die Quoten, die du selbst eingetragen hast. Fehlende Paarungen werden '
            + 'dort wie hier weggelassen und nicht mit 50 % aufgefüllt; die Abdeckung steht '
            + 'daneben. Gezeigt wird ' + quotenHinweis(),
            'This calculation has moved into the <strong>Meta Call</strong>. There it weights '
            + 'each pairing not by the opponent\'s measured online share but by the share you '
            + 'expect at your next tournament — and it knows the rates you entered yourself. '
            + 'Pairings without data are left out there as they were here, not filled in at '
            + '50 %; coverage is stated next to the result. The figure shown is '
            + quotenHinweisEn());

        /* Der Erklaersatz hinter dem Info-Knopf der
           Abschnittsueberschrift bleibt gemeldet — ohne ihn traegt der
           Abschnitt eine Ueberschrift ohne Erklaerung. Er nennt den
           Hausnamen der Quote zur Laufzeit (quotenName()) und ist
           deshalb gemeldet und nicht abgeschrieben. */
        var evText = L(
            'Die Heatmap sagt, wer wen schlägt. Was daraus für <em>dich</em> folgt, steht im '
            + 'Meta Call: du wählst dein Deck, und die Seite gewichtet jede Paarung mit dem '
            + 'Anteil, den du für den Gegner erwartest. Heraus kommt die ' + quotenName()
            + ', mit der du über ein ganzes Turnier rechnen kannst — nicht gegen ein Deck, '
            + 'sondern gegen alle auf einmal.',
            'The heatmap says who beats whom. What that means for <em>you</em> is in the Meta '
            + 'Call: pick your deck and every matchup is weighted by the share you expect that '
            + 'opponent to hold. The result is the ' + quotenName() + ' to expect across a '
            + 'whole tournament — not against one deck, but against all of them at once.');
        var evGemeldet = false;
        if (typeof window !== 'undefined' && window.DsAbschnittInfo) {
            window.DsAbschnittInfo.melde('ev', {
                titel: L('Dein Deck gegen das Meta', 'Your deck vs. the meta'),
                html: '<p>' + evText + '</p>'
            });
            evGemeldet = true;
        }

        return ''
        + '<div class="ds-panel ' + BLOCK + '">'
        + (evGemeldet ? '' : '<h3 class="ds-label">🎯 '
            + esc(L('Dein Deck gegen das Meta', 'Your deck vs. the meta')) + '</h3>')
        + '<p class="ds-note">' + text + '</p>'
        + '<div class="ds-controls">'
          + '<a class="ds-btn ds-ev-ziel" href="#meta-call" '
            + 'onclick="if (typeof switchTabAndUpdateMenu === \'function\') '
            + '{ switchTabAndUpdateMenu(\'meta-call\'); return false; } '
            + 'if (typeof switchTab === \'function\') { switchTab(\'meta-call\'); return false; }">'
            + esc(L('Im Meta Call öffnen →', 'Open in the Meta Call →'))
          + '</a>'
        + '</div>'
        + '</div>';
    }

    /* Nur "laeuft gerade", nicht "war schon mal da": ob der Block
       existiert, sagt der Baum, und nur der. Eine Merkvariable dafuer
       waere falsch, sobald app-meta-cards.js den Inhalt der Meta-Ansicht
       ueber innerHTML ersetzt — dann ist der Block weg, die Variable
       sagt weiter "gebaut", und der Abschnitt bliebe fuer den Rest der
       Sitzung leer. */
    var _baut = false;

    function baue() {
        var host = document.getElementById(HOST_ID);
        if (!host) return Promise.resolve(false);
        if (host.querySelector('.' + BLOCK)) return Promise.resolve(false);
        if (_baut) return Promise.resolve(false);   // Aufbau laeuft schon

        /* KEINE Datenbedingung mehr.
         *
         * Bis zum 11.09.2026 wartete der Block auf window._matchupRegistry
         * und window.getArchetypeShares — er rechnete ja selbst. Der
         * Verweis rechnet nichts, und ihn trotzdem von geladenen Daten
         * abhaengig zu machen hiesse: wer mit langsamer Leitung kommt,
         * sieht an dieser Stelle gar nichts und erfaehrt nie, wohin das
         * Feature gezogen ist. */
        _baut = true;
        return Promise.resolve().then(function () {
            /* Zwischen dem Aufruf und hier liegt ein Zug der Warteschlange.
               Wenn in der Zeit jemand anders gebaut hat, nicht zweimal. */
            if (host.querySelector('.' + BLOCK)) { _baut = false; return false; }

            var wrap = document.createElement('div');
            wrap.innerHTML = verweisHtml();
            var block = wrap.firstElementChild;
            host.appendChild(block);

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
