/* Quellen & Methodik — der Ort, an dem die Erklaerungen stehen.
 *
 * WARUM ES DIESE SEITE GIBT
 *
 * Bis zum 30.08.2026 stand die Methodik dort, wo sie erklaerte: ein
 * Trennungshinweis unter jedem Datenausweis, eine sechszeilige Fussnote
 * unter der Tier-Liste, ein aufklappbares "Wie zuverlaessig ist das?"
 * unter der Deckempfehlung, ein Absatz ueber neue Online-Decks daneben.
 * Jeder Text fuer sich war richtig. Zusammen standen auf der
 * Einstiegsseite mehr erklaerende als aussagende Zeilen — und wer eine
 * Seite zum ersten Mal oeffnet, liest keine Fussnote, sondern geht.
 *
 * Die Texte sind deshalb nicht geloescht, sondern umgezogen. Auf der
 * Seite steht die Aussage, hier steht der Beleg. Wer nachrechnen will,
 * findet alles an einem Ort; wer nur wissen will, was gerade stark ist,
 * wird nicht mehr damit aufgehalten.
 *
 * Regel fuer diese Datei: keine Zahl ohne Quelle, keine Behauptung ohne
 * Nachweis. Wo eine Angabe fehlt, steht das da — nicht eine Naeherung.
 */
(function () {
    'use strict';

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ── Inhalt ───────────────────────────────────────────────────────
     *
     * Aufbau: jeder Abschnitt hat eine kurze Ueberschrift und darunter
     * entweder Absaetze (`p`), eine Definitionsliste (`dl`) oder eine
     * Quellenzeile (`src`). Der erste Abschnitt steht offen, alle
     * anderen zugeklappt — die Seite soll beim Oeffnen kurz aussehen.
     */
    var INHALT = {
        de: {
            titel: 'Quellen & Methodik',
            unter: 'Woher jede Zahl auf dieser Seite kommt, und wie sie gerechnet ist.',
            zurueck: '← Startseite',
            abschnitte: [
                {
                    id: 'quellen', auf: true,
                    h: 'Woher die Zahlen kommen',
                    p: ['Jede Ansicht nennt ihre Quelle im Ausweis über der Tabelle. ' +
                        'Hier stehen sie vollständig.'],
                    src: [
                        ['🌐 Global · Online + Majors',
                         'Limitless Online (limitlesstcg.com) — gemeldete Online-Turniere und ' +
                         'Präsenzturniere ab Regional-Größe.'],
                        ['🇯🇵 Japan · City League',
                         'limitlesstcg.com/jp — gemeldete City-League-Ergebnisse.'],
                        ['📦 Past · eingefrorene Formate',
                         'Limitless Labs — abgeschlossene Formate, Stand eingefroren.'],
                        ['Preise',
                         'Cardmarket. Verknüpft wird über Set und Kartennummer oder die ' +
                         'Cardmarket-Produkt-ID, nie über den Namen — Namen sind innerhalb ' +
                         'eines Sets nicht eindeutig.'],
                        ['Kartenbilder',
                         'Pokémon Company (play.pokemon.com) und Cardmarket.'],
                        ['Pokémon Champions',
                         'Roster und Basiswerte: otterlyclueless/pokemon-champions-data ' +
                         '(CC BY 4.0). Nutzungsdaten aus dem Spiel: championsbattledata.com. ' +
                         'Deutsche Namen: PokéAPI. Ergänzungen: Serebii, Smogon.'],
                    ],
                },
                {
                    id: 'umfang', auf: false,
                    h: 'Worauf die Zahlen beruhen',
                    /* BEFUND DER ABNAHME (02.09.2026): der Satz endete auf
                       "Beide Nenner stehen hier." — und direkt darunter
                       stand der Leerzustand "Der Umfang steht erst zur
                       Verfuegung, wenn die Meta-Ansicht in dieser
                       Sitzung einmal geladen wurde." Wer diese Seite
                       oeffnet, ohne vorher auf der Meta-Ansicht gewesen
                       zu sein — also der Regelfall — las beides
                       nacheinander. Der Leerzustand selbst ist gut; der
                       Satz davor machte ihn zum Widerspruch. Jetzt
                       verspricht der Satz nichts, was der Abschnitt
                       vielleicht nicht halten kann. */
                    p: ['Die Meta-Ansicht zählt zweimal unabhängig voneinander — beide Male ' +
                        'aus den Limitless-Online-Turnieren: einmal die gemeldeten Decklisten, ' +
                        'wie Limitless sie auf seiner Deck-Übersicht ausweist, einmal die ' +
                        'gewichteten Antritte, die wir selbst aus den Endständen der einzelnen ' +
                        'Turniere zählen.'],
                    umfang: true,
                    leer: 'Der Umfang steht erst zur Verfügung, wenn die Meta-Ansicht in ' +
                          'dieser Sitzung einmal geladen wurde. Geschätzt wird hier nichts.',
                },
                {
                    id: 'begriffe', auf: false,
                    h: 'Was die Begriffe heißen',
                    dl: [
                        ['Anteil',
                         'Wie oft ein Deck gespielt wurde, gemessen an allen gewichteten ' +
                         'Antritten im Zeitfenster.'],
                        ['Gewichteter Antritt',
                         'Ein Turnierstart, gewichtet nach Größe des Turniers. Ein Regional ' +
                         'zählt mehr als ein Online-Cup mit 20 Leuten.'],
                        ['Top-8-Quote',
                         'Wie oft ein Deck aus diesen Antritten in die Top 8 kam.'],
                        ['„…-mal so oft wie der Schnitt“',
                         'Die Top-8-Quote des Decks im Vergleich zu der eines ' +
                         'durchschnittlichen Decks mit erkanntem Archetyp. Der ' +
                         'Vergleichswert ist geglättet, die Quote daneben ist roh — bei ' +
                         'kleinen Stichproben gehen beide Zahlen deshalb auseinander.'],
                        // FALSCH BIS ZUM 01.09.2026. Hier stand: "Unentschieden
                        // halb gezählt", also (S + 0,5·U) / Partien. Das ist
                        // genau die vierte, erfundene Konvention, die
                        // js/win-rate-konvention.js am 20.08. entfernt hat und
                        // ausdrücklich NICHT aufführt ("wer sie braucht, soll
                        // erklären, warum").
                        //
                        // Die Stelle, die den bekanntesten Widerspruch der Seite
                        // auflösen soll, beschrieb ihn also selbst — mit einer
                        // Formel, die keine einzige angezeigte Zahl benutzt.
                        // Nachgemessen über limitless_online_decks.csv (134
                        // Zeilen): die angezeigte Quote weicht von S/(S+N+U) um
                        // 0,003 pp ab, von der Glossarformel um 0,49 pp im
                        // Median und 8,33 pp im Maximum.
                        //
                        // Der Beleg, den der Betreiber am 01.09. geschickt hat,
                        // steht jetzt als Rechnung dabei: Limitless zeigt für
                        // Mega Excadrill die Bilanz 6430-6666-110 und daneben
                        // 48,69 %. 6430 / 13.206 = 48,69. Unentschieden stehen
                        // im Nenner, nicht als halber Sieg im Zähler.
                        ['Win Rate',
                         'Gewonnene Matches geteilt durch alle gespielten. ' +
                         'Unentschieden zählen im Nenner mit, aber nicht als ' +
                         'halber Sieg. Beispiel: eine Bilanz von 6.430 Siegen, ' +
                         '6.666 Niederlagen und 110 Unentschieden sind 13.206 ' +
                         'Matches und damit 48,7 % — dieselbe Rechnung wie bei ' +
                         'Limitless.'],
                        ['Tier',
                         'Gruppierung nach Anteil und Erfolg. Die Schwellen stehen in der ' +
                         'Tier-Liste selbst.'],
                        // Am 31.08.2026 von der Startseite hierher gezogen:
                        // dort standen sie als Erklaersaetze mitten zwischen
                        // den Zahlen, an der Stelle, an der jemand gerade
                        // eine Entscheidung trifft.
                        ['Unser Pick',
                         'Das Deck, das die Empfehlung für das nächste Turnier ausgibt. ' +
                         'Es ist der Vorschlag mit der besten Day-2-Aussicht im aktuellen ' +
                         'Feld — keine Zusage, sondern die beste Wette, die die Daten hergeben.'],
                        ['„schafft Day 2“',
                         'Wie oft ein Spieler mit diesem Deck über den ersten Tag hinauskommt, ' +
                         'gerechnet über die ausgewerteten Präsenzturniere. Daneben steht ' +
                         'derselbe Wert für ein beliebiges Deck — ohne diesen Vergleich sagt ' +
                         'die Zahl nichts.'],
                        ['„Day-2-Rate bisher“',
                         'Der tatsächlich beobachtete Wert dieses Decks, geschrumpft: Decks mit ' +
                         'wenigen Spielern werden Richtung Durchschnitt korrigiert. Deshalb ' +
                         'weicht er von der Aussicht daneben ab.'],
                        ['„min. 30 pro Deck“',
                         'Ein Deck taucht in der Auswertung erst auf, wenn mindestens so viele ' +
                         'Spieler es gespielt haben. Darunter ist die Quote Rauschen. Die ' +
                         'Schwelle hängt am Format und steht deshalb bei der Empfehlung selbst.'],
                        ['„% vom Feld sind neu“',
                         'Der Anteil des Feldes, für den es noch keine Präsenzdaten gibt — ' +
                         'meist frisch gebaute Decks aus dem Online-Fenster. Gegen sie ist der ' +
                         'Pick ungetestet, weil sie in keinem ausgewerteten Turnier vorkamen.'],
                    ],
                },
                {
                    id: 'zuverlaessig', auf: false,
                    h: 'Wie zuverlässig das ist',
                    p: ['Decks mit wenigen Spielern werden Richtung Durchschnitt korrigiert. ' +
                        'Ohne das stünde ein Deck mit sechs Spielern und einem Glückstreffer ' +
                        'auf Rang 1.',
                        'Unterhalb einer Mindestzahl ausgewerteter Spieler taucht ein Deck ' +
                        'gar nicht erst auf. Wie hoch die Grenze im laufenden Format ' +
                        'liegt, steht bei der Empfehlung selbst — sie hängt am Format.',
                        'Eine Empfehlung ist keine Zusage. Auch das jeweils stärkste Deck ' +
                        'verfehlt in vielen Turnieren Day 2 — das liegt am Format, nicht an ' +
                        'der Rechnung.',
                        'Neue Decks, die es zum Zeitpunkt der ausgewerteten Turniere noch ' +
                        'nicht gab, stecken in keiner dieser Zahlen. Wie sich eine Empfehlung ' +
                        'gegen sie schlägt, weiß die Rechnung nicht — dafür ist der Meta Call da.'],
                },
                {
                    id: 'trennung', auf: false,
                    h: 'Was getrennt bleibt',
                    p: ['Japan, Global und Past werden getrennt geführt und nie miteinander ' +
                        'gemischt. Es sind verschiedene Kartenpools, verschiedene Spielerfelder ' +
                        'und verschiedene Zeiträume; eine gemeinsame Zahl daraus wäre keine.',
                        'Jede Ansicht sagt im Ausweis, in welchem dieser drei Räume sie steht.'],
                },
                {
                    id: 'stand', auf: false,
                    h: 'Wie aktuell das ist',
                    p: ['Jede Ansicht trägt ihren eigenen Stand im Ausweis — das Datum der ' +
                        'jüngsten ausgewerteten Änderung, nicht das des Seitenaufrufs.',
                        'Fehlt eine Angabe, bleibt sie weg. Eine erfundene Zahl wäre schlimmer ' +
                        'als eine fehlende. Dasselbe gilt für Lücken in den Daten: sie werden ' +
                        'benannt, nicht geschätzt.'],
                },
                {
                    id: 'rechtliches', auf: false,
                    h: 'Rechtliches',
                    p: ['Diese Seite ist ein privates Projekt und steht in keiner Verbindung ' +
                        'zu The Pokémon Company, Nintendo, Creatures oder Game Freak. ' +
                        'Pokémon und alle zugehörigen Namen und Bilder sind Marken ihrer ' +
                        'jeweiligen Inhaber.',
                        'Kartenbilder und Preise gehören den oben genannten Quellen und werden ' +
                        'hier nur dargestellt, nicht angeboten.'],
                },
            ],
        },
        en: {
            titel: 'Sources & Method',
            unter: 'Where every number on this site comes from, and how it is calculated.',
            zurueck: '← Home',
            abschnitte: [
                {
                    id: 'quellen', auf: true,
                    h: 'Where the numbers come from',
                    p: ['Every view names its source in the badge above the table. ' +
                        'Here they are in full.'],
                    src: [
                        ['🌐 Global · Online + Majors',
                         'Limitless Online (limitlesstcg.com) — reported online tournaments ' +
                         'and in-person events from regional size upwards.'],
                        ['🇯🇵 Japan · City League',
                         'limitlesstcg.com/jp — reported City League results.'],
                        ['📦 Past · frozen formats',
                         'Limitless Labs — completed formats, frozen as they ended.'],
                        ['Prices',
                         'Cardmarket. Joined on set and card number or the Cardmarket product ' +
                         'ID, never on the name — names are not unique within a set.'],
                        ['Card images',
                         'The Pokémon Company (play.pokemon.com) and Cardmarket.'],
                        ['Pokémon Champions',
                         'Roster and base stats: otterlyclueless/pokemon-champions-data ' +
                         '(CC BY 4.0). In-game usage: championsbattledata.com. German names: ' +
                         'PokéAPI. Supplements: Serebii, Smogon.'],
                    ],
                },
                {
                    id: 'umfang', auf: false,
                    h: 'What the numbers rest on',
                    p: ['The meta view counts twice, independently — both times from the ' +
                        'Limitless online tournaments: once the reported decklists as Limitless ' +
                        'lists them on its deck breakdown, once the weighted entries we count ' +
                        'ourselves from the standings of each event.'],
                    umfang: true,
                    leer: 'The scope becomes available once the meta view has loaded in this ' +
                          'session. Nothing here is estimated.',
                },
                {
                    id: 'begriffe', auf: false,
                    h: 'What the terms mean',
                    dl: [
                        ['Share',
                         'How often a deck was played, measured against all weighted entries ' +
                         'in the window.'],
                        ['Weighted entry',
                         'One tournament entry, weighted by the size of the event. A regional ' +
                         'counts for more than a 20-player online cup.'],
                        ['Top-8 rate',
                         'How often a deck reached the top 8 out of those entries.'],
                        ['“…× as often as average”',
                         'The deck’s top-8 rate compared to that of an average deck with a ' +
                         'recognised archetype. The comparison value is smoothed, the rate ' +
                         'beside it is raw — on small samples the two diverge.'],
                        /* BEFUND DER ABNAHME (02.09.2026): hier stand "ties
                           counted as half" — genau die Variante, die
                           js/win-rate-konvention.js als die ERFUNDENE
                           vierte fuehrt und ausdruecklich nicht
                           auffuehrt ("wer sie braucht, soll erklaeren,
                           warum"; Medianabweichung 2,38 Punkte, maximal
                           12,5). Die deutsche Fassung daneben sagte das
                           Gegenteil und rechnete es vor. Zwei Sprachen,
                           zwei Definitionen derselben Groesse — und die
                           englische beschrieb eine Rechnung, die das
                           Haus verworfen hat. Jetzt woertlich dieselbe
                           Aussage samt Beleg. */
                        ['Win rate',
                         'Matches won divided by all matches played. Ties count in the ' +
                         'denominator, not as half a win. Example: a record of 6,430 wins, ' +
                         '6,666 losses and 110 ties is 13,206 matches and therefore 48.7 % — ' +
                         'the same arithmetic Limitless uses.'],
                        ['Tier',
                         'Grouping by share and success. The thresholds are stated in the ' +
                         'tier list itself.'],
                        ['Our pick',
                         'The deck the recommendation puts forward for the next event. It is ' +
                         'the best Day 2 prospect in the current field — not a promise, but the ' +
                         'best bet the data supports.'],
                        ['“makes Day 2”',
                         'How often a player with this deck gets past day one, across the ' +
                         'evaluated in-person tournaments. Next to it stands the same value for ' +
                         'an arbitrary deck — without that comparison the number says nothing.'],
                        ['“Day 2 rate so far”',
                         'The value actually observed for this deck, shrunk: decks with few ' +
                         'players are pulled towards the average. That is why it differs from ' +
                         'the prospect beside it.'],
                        ['“min. 30 per deck”',
                         'A deck only enters the evaluation once at least that many players ran ' +
                         'it. Below that the rate is noise. The threshold depends on the format ' +
                         'and therefore stands with the recommendation itself.'],
                        ['“% of the field is new”',
                         'The share of the field with no in-person data yet — mostly freshly ' +
                         'built decks from the online window. The pick is untested against them ' +
                         'because they appeared in none of the evaluated tournaments.'],
                    ],
                },
                {
                    id: 'zuverlaessig', auf: false,
                    h: 'How reliable this is',
                    p: ['Decks with few players are pulled towards the average. Without that, ' +
                        'a deck with six players and one lucky run would rank first.',
                        'Below a minimum number of evaluated players a deck is not listed at ' +
                        'all. The threshold for the current format is stated at the ' +
                        'recommendation itself — it depends on the format.',
                        'A recommendation is not a promise. Even the strongest deck misses ' +
                        'Day 2 at many tournaments — that is the format, not the maths.',
                        'New decks that did not exist at the tournaments evaluated are in none ' +
                        'of these numbers. How a recommendation fares against them is not ' +
                        'something this calculation knows — that is what the Meta Call is for.'],
                },
                {
                    id: 'trennung', auf: false,
                    h: 'What is kept apart',
                    p: ['Japan, Global and Past are kept separate and never mixed. They are ' +
                        'different card pools, different player fields and different periods; ' +
                        'a shared number would not be one.',
                        'Every view states in its badge which of the three spaces it sits in.'],
                },
                {
                    id: 'stand', auf: false,
                    h: 'How current this is',
                    p: ['Every view carries its own timestamp in the badge — the date of the ' +
                        'most recent evaluated change, not of your page load.',
                        'If a figure is unknown it is left out. An invented number would be ' +
                        'worse than a missing one. The same goes for gaps in the data: they ' +
                        'are named, not estimated.'],
                },
                {
                    id: 'rechtliches', auf: false,
                    h: 'Legal',
                    p: ['This site is a private project and is not affiliated with The Pokémon ' +
                        'Company, Nintendo, Creatures or Game Freak. Pokémon and all related ' +
                        'names and images are trademarks of their respective owners.',
                        'Card images and prices belong to the sources named above and are ' +
                        'displayed here, not offered for sale.'],
                },
            ],
        },
    };

    function absatz(t) { return '<p class="qu-p">' + esc(t) + '</p>'; }

    function abschnittHtml(a) {
        var teile = [];
        (a.p || []).forEach(function (t) { teile.push(absatz(t)); });
        /* Der einzige Abschnitt mit lebenden Zahlen. Sie kommen aus
           js/ds-datenumfang.js, gerechnet von js/app-tier-meta.js —
           hier wird nichts nachgerechnet, damit es keine zweite
           Wahrheit fuer dieselbe Groesse gibt. Fehlt der Umfang, steht
           das da; eine Naeherung waere schlimmer als eine Luecke. */
        if (a.umfang) {
            var zeilen = (window.DsDatenumfang
                && typeof window.DsDatenumfang.saetze === 'function')
                ? window.DsDatenumfang.saetze(de()) : [];
            if (zeilen.length) {
                teile.push('<ul class="qu-umfang">' + zeilen.map(function (z) {
                    return '<li>' + esc(z) + '</li>';
                }).join('') + '</ul>');
            } else if (a.leer) {
                teile.push('<p class="qu-p qu-leer">' + esc(a.leer) + '</p>');
            }
        }
        if (a.src && a.src.length) {
            teile.push('<dl class="qu-src">' + a.src.map(function (z) {
                return '<dt>' + esc(z[0]) + '</dt><dd>' + esc(z[1]) + '</dd>';
            }).join('') + '</dl>');
        }
        if (a.dl && a.dl.length) {
            teile.push('<dl class="qu-dl">' + a.dl.map(function (z) {
                return '<dt>' + esc(z[0]) + '</dt><dd>' + esc(z[1]) + '</dd>';
            }).join('') + '</dl>');
        }
        return '<details class="qu-sec" id="qu-' + esc(a.id) + '"' + (a.auf ? ' open' : '') + '>' +
               '<summary class="qu-sum">' + esc(a.h) + '</summary>' +
               '<div class="qu-body">' + teile.join('') + '</div>' +
               '</details>';
    }

    function render() {
        var host = document.getElementById('quellenHost');
        if (!host) return false;
        var c = INHALT[de() ? 'de' : 'en'];
        host.innerHTML =
            '<p class="qu-lead">' + esc(c.unter) + '</p>' +
            c.abschnitte.map(abschnittHtml).join('');
        // Ueberschrift und Rueckweg liegen im HTML und werden hier
        // mitgezogen, damit ein Sprachwechsel nicht die halbe Seite
        // umstellt und die andere Haelfte stehen laesst.
        var h = document.getElementById('quellenTitel');
        if (h) h.textContent = c.titel;
        var b = document.getElementById('quellenZurueck');
        if (b) b.textContent = c.zurueck;
        return true;
    }

    // Ein Anker wie #quellen-begriffe soll den Abschnitt aufklappen und
    // anspringen — sonst zeigt ein Verweis von der Seite auf eine
    // zugeklappte Zeile.
    function oeffne(id) {
        render();
        if (!id) return;
        var el = document.getElementById('qu-' + id);
        if (!el) return;
        el.open = true;
        try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {
            el.scrollIntoView();
        }
    }

    document.addEventListener('languageChanged', function () {
        var host = document.getElementById('quellenHost');
        // Nur neu zeichnen, wenn die Seite ueberhaupt schon gezeichnet
        // wurde — sonst baut ein Sprachwechsel auf einer anderen Seite
        // still Inhalt in einen verborgenen Reiter.
        if (host && host.children.length) render();
    });

    window.Quellen = { render: render, open: oeffne };
})();
