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
                        ['Win Rate',
                         'Gewonnene Spiele geteilt durch gespielte Spiele, Unentschieden ' +
                         'halb gezählt.'],
                        ['Tier',
                         'Gruppierung nach Anteil und Erfolg. Die Schwellen stehen in der ' +
                         'Tier-Liste selbst.'],
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
                        ['Win rate',
                         'Games won divided by games played, ties counted as half.'],
                        ['Tier',
                         'Grouping by share and success. The thresholds are stated in the ' +
                         'tier list itself.'],
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
