/**
 * ds-pocket.js — Reiter "Side Quest · Pokémon TCG Pocket".
 *
 * WAS ER ZEIGT
 * ------------
 * Game8s Tier-Liste für Pokémon TCG Pocket plus die Decks des aktuellen
 * Sets, je mit dem 2D-Muster zum Scannen und der Kartenliste. Die Daten
 * kommen aus data/pocket_tierlist.json; das Muster zeichnet
 * js/qr-svg.js selbst aus dem Feld `code` — kein Hotlink auf Game8s
 * Bildserver.
 *
 * WARUM EIN EIGENER REITER
 * ------------------------
 * Der vorhandene `#side-quest` heißt in Überschrift, Menü und i18n
 * ausdrücklich "Pokémon Champions", und js/ds-nav.js:19 schreibt die
 * Trennung als Zweck auf: "Pokémon Champions ist ein anderes Spiel".
 * TCG Pocket ist ein drittes. Ein achter Unterreiter dort stünde unter
 * einer Überschrift, die etwas anderes verspricht.
 *
 * WAS DIE DATEN VERLANGEN, NICHT VORSCHLAGEN
 * ------------------------------------------
 * `_meta.quelle_hinweis` sagt wörtlich: "Die Tier-Einstufung ist die
 * redaktionelle Einschätzung von Game8, keine von uns gemessene Zahl.
 * Die Oberfläche muss das anschreiben." Deshalb steht die Quelle mit
 * Datum unter der Überschrift UND im Vollbild — der Screenshot verlässt
 * die Seite, und was nicht im Bild steht, existiert für den Empfänger
 * nicht.
 *
 * DREI EHRLICHKEITSLÖCHER, DIE ANGESCHRIEBEN WERDEN
 * -------------------------------------------------
 * 1. `_meta.ohne_code`: zwei Decks stehen NICHT in `decks`. Wer nur die
 *    Liste zeichnet, zeigt 33 von 35 und sagt nirgends, dass zwei
 *    fehlen. Ihre Namen stehen deshalb in der Fußzeile.
 * 2. `_meta.zusammengelegt`: 17 Einträge. Zwei davon tragen eine ANDERE
 *    Stufe als das behaltene Deck — Game8 führt dasselbe Deck an zwei
 *    Stellen verschieden ein. Diese zwei bekommen eine Fußnote, die
 *    übrigen 15 nicht (sie sind stufengleich).
 * 3. `quelle_liste === 'set'`: bei diesen Decks stammt die Stufe aus
 *    der Zelle der Set-Tabelle, nicht aus der Rangliste. Zwei Maße in
 *    einer Liste; das Kennzeichen sagt es.
 *
 * DAS ALTER
 * ---------
 * Der Ablauf .github/workflows/pocket-tierlist.yml läuft nur auf
 * Knopfdruck — Game8 weist GitHub-Läufer mit HTTP 202 ab. Die Datei
 * altert also. Ab PLAUSIBEL_TAGE steht eine sichtbare Warnung da; das
 * bloße Datum liest niemand nach.
 */
(function () {
    'use strict';

    var QUELLE = 'data/pocket_tierlist.json';
    /* DIE SET-NAMEN (16.09.2026).
       ANLASS (Betreiber): „können wir bei den Details von den Karten
       auch den Set Namen schreiben weil mit B3 und A2 und so kann ich
       nichts anfangen. Aber wenn ich weiß wie das set heißt kann ich
       noch schnell fehlende Karten besorgen."

       Die Kennung ist der Sortierschluessel des Spiels, kein Name, den
       man in einem Laden nennen kann. Die Tabelle steht in einer
       EIGENEN Datei: sie aendert sich mit den Erweiterungen, nicht mit
       den Decks, und der naechtliche Decklauf soll sie nicht
       ueberschreiben.

       Faellt sie aus, bleibt die blanke Kennung stehen — der Reiter
       laeuft weiter. Ein erfundener Set-Name schickt den Betreiber in
       den Laden nach etwas, das es nicht gibt. */
    var SET_QUELLE = 'data/pocket_sets.json';
    var setNamen = null;
    var HOST = 'pocket';
    var TIER_ORDNUNG = ['S', 'A+', 'A', 'B', 'C', 'D'];
    // Ein neues Pocket-Set erscheint etwa im Monatsabstand; danach ist
    // eine Bestenliste eine Momentaufnahme von gestern.
    var PLAUSIBEL_TAGE = 28;

    var daten = null;
    var geladen = false;
    var laeuft = null;
    var filter = 'alle';
    var wachschloss = null;


    /* ── Sprites vor dem Deck-Namen ──────────────────────────────────
     *
     * Vom Betreiber am 10.09.2026 gewuenscht. Die Schwierigkeit liegt
     * nicht im Zeichnen, sondern darin, aus einem Deck-Namen die
     * richtigen Pokemon zu bekommen — Game8 schreibt dort Set-Kuerzel
     * ("PD Espeon", "RS Heliolisk", "TRA Garchomp"), Kartenzusaetze
     * ("ex"), Formworte ("Mega", "Alolan", "Teal Mask") und Beiwerk
     * ("and 18 Trainers") bunt durcheinander.
     *
     * GERATEN WIRD NICHTS. Jedes Deck traegt seine Kartenliste selbst
     * (`pokemon`), und nur ein Pokemon, das BEIDES ist — im Deck-Namen
     * genannt UND als Karte im Deck — bekommt ein Bild. Damit fallen
     * die Kuerzel von allein weg: "TRA" ist keine Karte, "Garchomp"
     * schon.
     *
     * GEMESSEN am 10.09.2026 ueber alle 33 Decks: 30 ergeben zwei
     * Bilder, drei ergeben eins ("Flygon ex", "Team Rocket's Moltres
     * ex" und "Team Rocket's Articuno ex and 18 Trainers" nennen auch
     * nur ein Pokemon), keines geht leer aus. Die 48 entstehenden
     * Slugs wurden einzeln im Browser gegen r2.limitlesstcg.net
     * geprueft — alle 48 laden.
     *
     * Zwei Feinheiten, beide an echten Namen aufgefallen:
     *   * Der LAENGERE Treffer an derselben Stelle gewinnt, sonst
     *     schlaegt "Lucario" das "Mega Lucario ex", in dem es steckt.
     *   * Eine schon getroffene Stelle im Namen ist verbraucht — sonst
     *     lieferte "Mega Lucario ex and Hitmonlee" zweimal Lucario
     *     statt Lucario und Hitmonlee.
     */
    var SPRITE_HOECHSTZAHL = 2;

    function ohneApostroph(v) {
        return String(v || '').toLowerCase().replace(/['\u2018\u2019]/g, '');
    }

    /** Die Pokemon eines Decks, die sein Name wirklich nennt. */
    function benannteArten(d) {
        var name = ohneApostroph(d && d.name);
        if (!name) return [];
        var kandidaten = [];
        (d.pokemon || []).forEach(function (p) {
            var kurz = ohneApostroph(p && p.name);
            if (!kurz) return;
            var pos = name.indexOf(kurz);
            if (pos < 0) return;
            kandidaten.push({ name: p.name, pos: pos, len: kurz.length });
        });
        // Nach Stellung im Namen, bei Gleichstand der laengere zuerst.
        kandidaten.sort(function (a, b) { return a.pos - b.pos || b.len - a.len; });
        var belegt = [];
        var heraus = [];
        kandidaten.forEach(function (k) {
            if (heraus.length >= SPRITE_HOECHSTZAHL) return;
            var drin = belegt.some(function (r) { return k.pos >= r[0] && k.pos < r[1]; });
            if (drin) return;
            belegt.push([k.pos, k.pos + k.len]);
            heraus.push(k.name);
        });
        return heraus;
    }

    /** Bilder zu einem Deck — leer, wenn der Namensauflöser nichts hergibt. */
    function spriteHtml(d) {
        var api = window.ArchetypeIcons;
        if (!api || typeof api.getIconUrls !== 'function') return '';
        var gesehen = {};
        var bilder = [];
        benannteArten(d).forEach(function (art) {
            var urls = api.getIconUrls(art) || [];
            if (!urls.length) return;
            var url = urls[0];
            if (gesehen[url]) return;
            gesehen[url] = 1;
            /* alt bleibt leer: der Deck-Name steht unmittelbar daneben,
               eine Vorlesehilfe wuerde ihn sonst doppelt ansagen.
               onerror versteckt ein Bild, das die Quelle nicht hat —
               dann steht der Name allein da, statt einer Luecke.

               KEIN loading="lazy". GEMESSEN live am 10.09.2026: mit dem
               Attribut luden 3 von 63 Bildern, die uebrigen 60 blieben
               dauerhaft auf naturalWidth 0 — auch nach dem Scrollen, und
               ohne dass onerror feuerte. Uebrig blieb auf jeder Zeile
               eine leere Luecke von 26 px, also schlimmer als gar keine
               Bilder. Dieselben Bilder ohne das Attribut: 63 von 63,
               null Fehler.

               Der Grund duerfte die zweite Zeichnung sein (siehe
               spritesNachziehen): die Bilder entstehen erst, wenn die
               Symboldatei liegt, und Chrome bewertet die Verzoegerung
               fuer nachtraeglich eingefuegte Bilder offenbar nicht neu.
               Das nachzuweisen waere Aufwand ohne Ertrag — es geht um
               66 Sprites von je ein bis drei Kilobyte, von einem
               Server, den die Seite ohnehin fuer jedes Archetyp-Symbol
               benutzt. Die Verzoegerung spart hier nichts und kostet
               die ganze Anzeige. */
            bilder.push('<img class="pk-sprite" src="' + esc(url) + '" alt="" ' +
                        'onerror="this.style.display=\'none\'">');
        });
        if (!bilder.length) return '';
        return '<span class="pk-sprites" aria-hidden="true">' + bilder.join('') + '</span>';
    }


    function t(de, en) {
        return (typeof getLang === 'function' && getLang() === 'en') ? en : de;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function kurzDatum(iso) {
        if (!iso) return null;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        return ('0' + d.getDate()).slice(-2) + '.' +
               ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
    }

    function tageSeit(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        return Math.floor((Date.now() - d.getTime()) / 86400000);
    }

    /* Welche Decks tragen laut _meta.zusammengelegt eine abweichende
     * Stufe? Die Bindung läuft nur über den Namen — das ist die einzige,
     * die die Datei hergibt. Ein Treffer, der nicht eindeutig ist, wird
     * still übergangen: lieber keine Fußnote als eine an der falschen
     * Zeile. */
    function abweichendeStufen(meta, decks) {
        var raus = {};
        var nachName = {};
        decks.forEach(function (d) {
            nachName[d.name] = (nachName[d.name] === undefined) ? d : null;
        });
        (meta.zusammengelegt || []).forEach(function (z) {
            var deck = nachName[z.behalten];
            if (!deck || !z.verlorene_stufe) return;
            if (z.verlorene_stufe === deck.tier) return;
            (raus[z.behalten] = raus[z.behalten] || []).push(z.verlorene_stufe);
        });
        return raus;
    }

    function meldung(text, istFehler) {
        return '<div class="pk-meldung' + (istFehler ? ' is-fehler' : '') +
               '" role="status">' + esc(text) + '</div>';
    }

    function kopf() {
        var m = daten._meta || {};
        var stand = kurzDatum(m.abgerufen);
        var tage = tageSeit(m.abgerufen);
        var s = '';
        s += '<div class="header">';
        s += '<h2>' + esc(t('Side Quest · Pokémon TCG Pocket',
                            'Side Quest · Pokémon TCG Pocket')) + '</h2>';
        s += '<p>' + esc(t('Game8s Tier-Liste und die Decks des neuen Sets. Deck antippen, ' +
                           'Muster zeigen, zweites Gerät scannt.',
                           'Game8’s tier list and the new set decks. Tap a deck, show the ' +
                           'pattern, scan it with a second device.')) + '</p>';
        s += '</div>';

        s += '<p class="pk-quelle">' +
             esc(t('Einstufung von Game8, keine von uns gemessene Zahl',
                   'Game8’s own assessment, not a figure we measured'));
        if (m.quelle_url) {
            s += ' · <a href="' + esc(m.quelle_url) + '" target="_blank" rel="noopener">game8.co</a>';
        }
        if (stand) s += ' · ' + esc(t('Stand ', 'as of ')) + esc(stand);
        s += '</p>';

        if (tage !== null && tage >= PLAUSIBEL_TAGE) {
            s += '<p class="pk-alt">' + esc(
                t('Seit ' + tage + ' Tagen nicht aufgefrischt — nach einem neuen Set kann ' +
                  'sich die Einstufung deutlich verschoben haben.',
                  'Not refreshed for ' + tage + ' days — after a new set the ratings may ' +
                  'have shifted considerably.')) + '</p>';
        }
        return s;
    }

    function filterleiste() {
        var knoepfe = [
            ['alle',  t('Alle', 'All')],
            ['tier',  t('Tier-Liste', 'Tier list')],
            ['set',   t('Neues Set', 'New set')]
        ];
        return '<div class="pk-filter" role="group" aria-label="' +
            esc(t('Auswahl', 'Filter')) + '">' +
            knoepfe.map(function (k) {
                return '<button type="button" data-pk-filter="' + k[0] + '"' +
                       (filter === k[0] ? ' class="is-active" aria-pressed="true"'
                                        : ' aria-pressed="false"') +
                       '>' + esc(k[1]) + '</button>';
            }).join('') + '</div>';
    }

    function passt(d) {
        if (filter === 'alle') return true;
        if (filter === 'tier') return d.quelle_liste === 'tier' || d.quelle_liste === 'beide';
        return d.quelle_liste === 'set' || d.quelle_liste === 'beide';
    }

    /* EINE DECKZEILE — in beiden Gruppierungen dieselbe. */
    function zeile(d, streit) {
        var i = (daten.decks || []).indexOf(d);
        var s = '<button type="button" class="pk-zeile" data-pk-deck="' + i + '">';
        s += '<span class="pk-marke">' + esc(d.tier || '?') + '</span>';
        s += spriteHtml(d);
        s += '<span class="pk-name">' + esc(d.name);
        var fuss = [];
        if (d.quelle_liste === 'set') {
            fuss.push(t('Stufe aus der Set-Tabelle', 'tier from the set table'));
        }
        if (streit && streit[d.name]) {
            fuss.push(t('Game8 nennt auch ' + streit[d.name].join('/'),
                        'Game8 also lists ' + streit[d.name].join('/')));
        }
        if (fuss.length) {
            s += '<span class="pk-fussnote">' + esc(fuss.join(' · ')) + '</span>';
        }
        s += '</span><span class="pk-pfeil" aria-hidden="true">›</span></button>';
        return s;
    }

    /* „NEUES SET" IST KEINE STUFENLISTE (16.09.2026).
       ANLASS (Betreiber): „bei neues Set sollten ja nur die New Team
       Rocket's Ambition Decks und Old Decks Updated with Team Rocket's
       Ambition inklusive der Tiers".

       Und: „bei Pocket ändert der Filter Alle, Tier-List, Neues Set
       quasi nichts." Gemessen am 16.09.2026 gegen die echte Seite
       stimmte das fast — der Filter greift (23 gegen 21 von 33 Decks),
       aber er SIEHT nicht danach aus, weil elf Decks in beiden Listen
       stehen und die Gruppierung in beiden Faellen dieselbe war.

       Game8 teilt die Set-Tabelle in ZWEI Abschnitte, und die sagen
       etwas, das die Stufe nicht sagt: ob ein Deck mit dem Set NEU ist
       oder ein bestehendes, das durch das Set besser wurde. Genau danach
       wird hier gruppiert; die Stufe steht weiter an jeder Zeile. */
    function nachAbschnitten(decks, streit, ordnung) {
        var gruppen = [], zuordnung = {};
        decks.forEach(function (d) {
            var a = d.set_abschnitt || '';
            if (!zuordnung[a]) { zuordnung[a] = []; gruppen.push(a); }
            zuordnung[a].push(d);
        });
        /* DIE REIHENFOLGE KOMMT AUS DER QUELLE — NICHT AUS DEM ZUFALL.

           Hier stand „die Abschnitte in der Reihenfolge der Quelle
           lassen". Das war FALSCH und bei der Live-Abnahme am 16.09.2026
           auch zu sehen: geordnet wurde nach erstem Auftreten in der
           nach Stufe sortierten Deckliste, und weil das staerkste Deck
           zufaellig ein aktualisiertes war, stand „Old Decks Updated …"
           ueber „New … Decks". Game8 zeigt es andersherum.

           Die Reihenfolge kennt nur die Quellseite; sie steht deshalb
           seit dem 16.09.2026 in `_meta.set_abschnitte`. Fehlt sie
           (aeltere Datei), bleibt es beim ersten Auftreten — schlechter
           als die Quelle, aber besser als eine erfundene Regel im Code.
           Ohne Abschnitt geht ans Ende: diese Decks brauchen eine
           Auskunft, keine Ueberschrift. */
        var rangA = function (a) {
            if (!a) return 1e6;
            var i = (ordnung || []).indexOf(a);
            return i < 0 ? 1e5 + gruppen.indexOf(a) : i;
        };
        gruppen.sort(function (a, b) { return rangA(a) - rangA(b); });
        var s = '';
        gruppen.forEach(function (a) {
            var teil = zuordnung[a];
            /* `indexOf` gibt fuer eine unbekannte Stufe -1 — damit
               stuende ein Deck OHNE Stufe ganz oben, noch vor S. Es
               gehoert ans Ende. */
            var rang = function (t) {
                var i = TIER_ORDNUNG.indexOf(t);
                return i < 0 ? TIER_ORDNUNG.length : i;
            };
            teil.sort(function (x, y) {
                return rang(x.tier) - rang(y.tier) || x.name.localeCompare(y.name, 'de');
            });
            s += '<section class="pk-stufe">';
            s += '<h3>' + esc(a || t('Ohne Abschnitt', 'No section')) +
                 ' <span class="pk-stufe-zahl">' + teil.length + '</span></h3>';
            if (!a) {
                s += '<p class="pk-alt">' + esc(t(
                    'Diese Decks stehen in der Set-Tabelle, ohne dass der Lauf '
                    + 'ihre Überschrift zuordnen konnte. Sie stehen trotzdem da.',
                    'These decks are in the set table, but the run could not '
                    + 'assign their heading. They are shown anyway.')) + '</p>';
            }
            teil.forEach(function (d) { s += zeile(d, streit); });
            s += '</section>';
        });
        return s;
    }

    function liste() {
        var decks = (daten.decks || []).filter(passt);
        if (!decks.length) {
            return meldung(t('Für diese Auswahl steht kein Deck in der Liste.',
                             'No deck in the list matches this filter.'));
        }
        var streit = abweichendeStufen(daten._meta || {}, daten.decks || []);
        if (filter === 'set') {
            return nachAbschnitten(decks, streit,
                (daten._meta || {}).set_abschnitte || []);
        }
        var s = '';
        TIER_ORDNUNG.forEach(function (stufe) {
            var teil = decks.filter(function (d) { return d.tier === stufe; });
            if (!teil.length) return;
            // Innerhalb einer Stufe alphabetisch — Game8 vergibt dort
            // keine Rangfolge, und eine Nummerierung würde eine erfinden.
            teil.sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
            s += '<section class="pk-stufe">';
            s += '<h3>' + esc(t('Stufe ', 'Tier ')) + esc(stufe) +
                 ' <span class="pk-stufe-zahl">' + teil.length + '</span></h3>';
            teil.forEach(function (d) { s += zeile(d, streit); });
            s += '</section>';
        });

        // EINE UNBEKANNTE STUFE DARF NICHT STILL VERSCHWINDEN.
        //
        // js/ds-post-quellen.js:1024 traegt dieselbe Reihenfolge und
        // davor genau diesen Riegel, mit dem Kommentar vom 04.09.2026:
        // fuehrt Game8 eines Tages "SS" ein, sortierte sie vorher ans
        // Ende und wurde nie genommen — die Ausgabe zeigte "Stufe S",
        // waehrend die hoechste Stufe fehlte.
        //
        // Hier war das Array kopiert und der Riegel nicht (Abnahme
        // 07.09.2026, nachgestellt): ein Deck mit tier 'S+' oder null
        // fiel aus der Liste, waehrend die Fusszeile weiter 33 von 52
        // behauptete. Und `tier: null` ist ueber den Kollisionsweg des
        // Scrapers schon heute erreichbar
        // (tests/python/test_pocket_tierlist.py haelt es fest); in den
        // aktuellen Daten stehen sechs Kollisionen.
        //
        // Gezeigt wird es trotzdem — nur angeschrieben. Ein Deck
        // wegzulassen waere die stille Reparatur, die dieses Projekt
        // ueberall verbietet.
        var fremd = decks.filter(function (d) {
            return TIER_ORDNUNG.indexOf(d.tier) < 0;
        });
        if (fremd.length) {
            var stufen = fremd.map(function (d) {
                return d.tier === null || d.tier === undefined || d.tier === ''
                    ? t('ohne Angabe', 'not given') : String(d.tier);
            }).filter(function (v, i, a) { return a.indexOf(v) === i; });
            s += '<section class="pk-stufe">';
            s += '<h3>' + esc(t('Ohne bekannte Stufe', 'Tier not recognised')) +
                 ' <span class="pk-stufe-zahl">' + fremd.length + '</span></h3>';
            s += '<p class="pk-alt">' + esc(t(
                'Game8 führt hier eine Einstufung, die wir nicht kennen (' +
                stufen.join(', ') + '). Die Decks stehen trotzdem da — ' +
                'weglassen wäre die stillere, aber schlechtere Lösung.',
                'Game8 uses a tier we do not know (' + stufen.join(', ') +
                '). The decks are shown anyway — dropping them would be the ' +
                'quieter but worse option.')) + '</p>';
            /* DIESELBE ZEILE WIE UEBERALL (16.09.2026).
               Hier stand eine eigene, magere Fassung ohne Sprites. Das
               fiel drei Wochen nicht auf, weil nie ein Deck in diesem
               Zweig landete — bis Game8 am 16.09.2026 „Team Rocket's
               Wobbuffet" als Untiered fuehrte. Dann stand es als
               einziges Deck der Liste ohne Bild da.

               Ein Sonderweg, den nichts je betritt, ist kein Sonderweg,
               sondern eine Falle mit Zeitzuender. */
            fremd.sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
            fremd.forEach(function (d) { s += zeile(d, streit); });
            s += '</section>';
        }
        return s;
    }

    function rechnung() {
        var m = daten._meta || {};
        var u = m.uebersicht || {};
        var ohne = m.ohne_code || [];
        var zus = m.zusammengelegt || [];
        var s = '<div class="pk-rechnung">';
        if (u.angegangen) {
            s += '<strong>' + (daten.decks || []).length + ' ' +
                 esc(t('von ', 'of ')) + u.angegangen + '</strong> ' +
                 esc(t('Einträgen bei Game8 — ' + ohne.length + ' ohne lesbares Muster, ' +
                       zus.length + ' als Dublette zusammengelegt.',
                       'entries at Game8 — ' + ohne.length + ' without a readable pattern, ' +
                       zus.length + ' merged as duplicates.'));
        }
        if (ohne.length) {
            s += '<br>' + esc(t('Diese Decks fehlen hier: ', 'Missing here: ')) +
                 ohne.map(function (o) {
                     return esc(String(o.name).replace(/\s*\[[^\]]+\]\s*$/, ''));
                 }).join(', ') + '. ' +
                 esc(t('Ihr Muster ließ sich keinem Deck-Abschnitt eindeutig zuordnen — ' +
                       'ein falscher Code ist schlimmer als keiner.',
                       'Their pattern could not be matched to a deck section — a wrong ' +
                       'code is worse than none.'));
        }
        s += '</div>';
        return s;
    }

    /* ── Vollbild ────────────────────────────────────────────────── */

    function wachHalten() {
        // Der Bildschirm darf während des Scannens nicht dunkel werden.
        // Fehlt die Schnittstelle oder wird sie abgelehnt, passiert
        // nichts — der Hinweistext bleibt trotzdem stehen, weil die
        // Helligkeit sich vom Web aus nicht setzen lässt.
        try {
            if (navigator.wakeLock && navigator.wakeLock.request) {
                navigator.wakeLock.request('screen').then(function (l) {
                    wachschloss = l;
                }, function () { });
            }
        } catch (e) { /* nichts */ }
    }

    function wachFreigeben() {
        try { if (wachschloss) wachschloss.release(); } catch (e) { /* nichts */ }
        wachschloss = null;
    }

    function kartenliste(d) {
        // `[]` ist wahr — mit `!d.pokemon` allein bliebe bei einer leeren
        // Liste ein leerer Kasten stehen statt des Grundes (Abnahme
        // 07.09.2026).
        var hatKarten = (d.pokemon && d.pokemon.length) ||
                        (d.trainer && d.trainer.length);
        if (!hatKarten) {
            return d.karten_hinweis
                ? '<p class="pk-hell">' + esc(t('Keine Kartenliste: ', 'No card list: ')) +
                  esc(d.karten_hinweis) + '</p>'
                : '';
        }
        function block(titel, karten) {
            if (!karten || !karten.length) return '';
            var stueck = karten.reduce(function (a, k) { return a + k.anzahl; }, 0);
            return '<h4>' + esc(titel) + ' <span>(' + stueck + ')</span></h4><ul>' +
                karten.map(function (k) {
                    var nr = k.set && k.nummer ? k.set + '-' + k.nummer : '';
                    var name = k.set && setNamen ? setNamen[k.set] : '';
                    /* Der Name steht VOR der Kennung und traegt sie im
                       Titel: der Name ist das, wonach man sucht, die
                       Kennung das, was auf der Karte steht. Fehlt der
                       Name, bleibt die Kennung allein — sichtbar
                       unvollstaendig statt still erfunden. */
                    return '<li><span>' + k.anzahl + '× ' + esc(k.name) + '</span>' +
                           '<span class="pk-karte-set" title="' + esc(nr) + '">' +
                           (name ? '<b>' + esc(name) + '</b> ' : '') +
                           esc(nr) + '</span></li>';
                }).join('') + '</ul>';
        }
        return '<div class="pk-karten">' +
               block(t('Pokémon', 'Pokémon'), d.pokemon) +
               block(t('Trainer', 'Trainer'), d.trainer) +
               '</div>';
    }

    /* ── Der Code zum Mitnehmen ──────────────────────────────────────
     *
     * Das Muster ist der Hauptweg: zweites Geraet scannt. Das setzt ein
     * zweites Geraet voraus. Wer Pocket auf DEMSELBEN Telefon offen hat,
     * hat nichts zum Scannen — er braucht den Code als Text. Der Knopf
     * ist dieser zweite Weg; vom Betreiber am 10.09.2026 angeordnet.
     *
     * ZWEI WEGE, WEIL EINER NICHT REICHT
     * ----------------------------------
     * `navigator.clipboard` gibt es nur im sicheren Kontext. Die Seite
     * laeuft auch anderswo — lokal ueber http beim Entwickeln, in einem
     * eingebetteten Rahmen ohne die Berechtigung. Dort ist die
     * Schnittstelle schlicht nicht da, und ein Knopf, der wortlos
     * nichts tut, ist schlimmer als kein Knopf. Der Rueckfall ueber ein
     * kurzlebiges <textarea> und document.execCommand('copy') ist der
     * einzige Weg, den es dort noch gibt. Er greift auch, wenn
     * writeText zwar existiert, aber ABLEHNT (fehlende Berechtigung,
     * Dokument nicht im Vordergrund) — deshalb haengt er im
     * Fehlerzweig des Versprechens, nicht nur am fehlenden Objekt.
     */
    var KOPIER_RUECKMELDUNG_MS = 1500;
    var kopierUhr = null;

    function kopierText() { return t('Code kopieren', 'Copy code'); }
    function kopierLabel() {
        return t('Deck-Code in die Zwischenablage kopieren',
                 'Copy deck code to clipboard');
    }

    /** Der Rueckfall. Gibt zurueck, ob es geklappt hat. */
    function ersatzKopie(text) {
        var feld = null;
        try {
            feld = document.createElement('textarea');
            feld.value = text;
            feld.setAttribute('readonly', '');
            /* NICHT display:none und nicht hidden: ein Feld, das nicht
               dargestellt wird, laesst sich nicht markieren, und ohne
               Markierung kopiert execCommand nichts. Also aus dem Bild
               schieben statt entfernen. */
            feld.style.position = 'fixed';
            feld.style.top = '-1000px';
            feld.style.opacity = '0';
            document.body.appendChild(feld);
            feld.select();
            if (typeof feld.setSelectionRange === 'function') {
                // iOS beachtet select() auf einem readonly-Feld nicht.
                feld.setSelectionRange(0, String(text).length);
            }
            var ok = !!(document.execCommand && document.execCommand('copy'));
            return ok;
        } catch (e) {
            return false;
        } finally {
            try { if (feld && feld.parentNode) feld.parentNode.removeChild(feld); }
            catch (e2) { /* dann bleibt ein unsichtbares Feld stehen */ }
        }
    }

    /** Gibt ein Versprechen auf `true`/`false` — nie einen Fehler. */
    function inZwischenablage(text) {
        var api = null;
        try { api = navigator && navigator.clipboard; } catch (e) { api = null; }
        if (api && typeof api.writeText === 'function') {
            try {
                return Promise.resolve(api.writeText(text)).then(
                    function () { return true; },
                    function () { return ersatzKopie(text); });
            } catch (e) { /* faellt unten auf den Ersatz */ }
        }
        return Promise.resolve(ersatzKopie(text));
    }

    /* Die Rueckmeldung sitzt AM KNOPF, nicht daneben: der Daumen steht
       beim Tippen genau dort, und eine Meldung am anderen Ende des
       Bildschirms sieht am Telefon niemand. `aria-live` steht fest im
       Markup, damit eine Vorlesehilfe den Wechsel ansagt; das
       aria-label wandert mit, sonst hoerte sie weiter den Ruhetext. */
    function kopierRueckmeldung(knopf, ok) {
        if (!knopf) return;
        var neu = ok ? t('Kopiert!', 'Copied!')
                     : t('Kopieren klappte nicht', 'Copy failed');
        if (kopierUhr) { clearTimeout(kopierUhr); kopierUhr = null; }
        knopf.textContent = neu;
        if (knopf.setAttribute) knopf.setAttribute('aria-label', neu);
        if (knopf.classList) {
            if (ok) knopf.classList.remove('is-fehler');
            else knopf.classList.add('is-fehler');
        }
        kopierUhr = setTimeout(function () {
            kopierUhr = null;
            knopf.textContent = kopierText();
            if (knopf.setAttribute) knopf.setAttribute('aria-label', kopierLabel());
            if (knopf.classList) knopf.classList.remove('is-fehler');
        }, KOPIER_RUECKMELDUNG_MS);
    }

    function kopiere(knopf, code) {
        return inZwischenablage(code).then(function (ok) {
            kopierRueckmeldung(knopf, ok);
            return ok;
        });
    }

    /* Der Code steht IM Knopf, nicht in einer Modulvariablen: das
       Vollbild kann jederzeit ein anderes Deck tragen, und eine
       Variable daneben waere die zweite Wahrheit. */
    function kopierzeile(d) {
        if (!d.code) return '';
        return '<div class="pk-kopierzeile">' +
               '<button type="button" class="pk-kopieren" data-pk-kopieren="' +
               esc(d.code) + '" aria-live="polite" aria-label="' +
               esc(kopierLabel()) + '">' + esc(kopierText()) + '</button>' +
               '<span class="pk-kopier-hinweis">' +
               esc(t('Kein zweites Gerät? Code kopieren und in Pocket einfügen.',
                     'No second device? Copy the code and paste it in Pocket.')) +
               '</span></div>';
    }

    function oeffne(index) {
        var d = (daten.decks || [])[index];
        var host = document.getElementById('pocketOverlay');
        if (!d || !host) return;

        var stand = kurzDatum((daten._meta || {}).abgerufen);
        var bild;
        try {
            if (!window.qrSvg || typeof window.qrSvg.svg !== 'function') {
                throw new Error('qrSvg fehlt');
            }
            bild = '<div class="pk-qr">' +
                   window.qrSvg.svg(d.code, { stufe: 'M', titel: d.name }) + '</div>';
        } catch (e) {
            // Stilles Nichts wäre der schlimmste Zustand. Wenigstens der
            // Code als markierbarer Text, damit der Weg nicht ganz
            // zuläuft.
            bild = '<div class="pk-meldung is-fehler">' +
                   esc(t('Das Muster ließ sich nicht zeichnen. Der Code lautet:',
                         'The pattern could not be drawn. The code is:')) +
                   '<br><code style="word-break:break-all">' + esc(d.code) + '</code></div>';
        }

        var s = '';
        // Der Knopf steht in einer klebenden Leiste, nicht frei im Fluss.
        // Warum, steht in css/ds-pocket.css bei .pk-leiste — kurz: frei
        // im Fluss lag er unter der Statusleiste und scrollte weg.
        s += '<div class="pk-leiste">';
        s += '<button type="button" class="pk-schliessen" data-pk-zu="1" aria-label="' +
             esc(t('Schließen', 'Close')) + '">✕</button>';
        s += '</div>';
        // Name, Stufe und Quelle stehen IM Bild, nicht darüber: das
        // Bildschirmfoto ist das Lieferstück.
        s += '<div class="pk-overlay-kopf">';
        // KEIN <h3>. Der Deck-Name ist Game8s englische Bezeichnung, und
        // .github/workflows/sprachreinheit.yml prueft sichtbaren Text in
        // h1..h5, label, button und a auf Sprachreinheit. Die Rolle
        // bleibt erhalten, die Sprachpruefung greift hier nicht mehr.
        s += '<div class="pk-overlay-name" role="heading" aria-level="2">' +
             esc(d.name) + '</div>';
        s += '<p>' + esc(t('Stufe ', 'Tier ') + d.tier) + ' · Game8' +
             (stand ? ' · ' + esc(t('Stand ', 'as of ') + stand) : '') + '</p>';
        s += '</div>';
        s += bild;
        s += '<p class="pk-hell">' + esc(
            t('Bildschirm hell stellen und in Pocket abscannen.',
              'Turn the screen brightness up and scan it in Pocket.')) + '</p>';
        s += kopierzeile(d);
        s += kartenliste(d);

        host.innerHTML = s;
        host.hidden = false;
        if (window.HintergrundSperre) window.HintergrundSperre.sperren('pocket-vollbild');
        var zu = host.querySelector('[data-pk-zu]');
        if (zu) zu.focus();
        wachHalten();
        verlaufsMarkeSetzen();
    }

    /* Die Zurueck-Geste soll das Vollbild schliessen, nicht die Seite
       verlassen.
     *
     * BEFUND (10.09.2026): am Telefon gab es genau einen Weg zurueck —
     * den Knopf, und der lag unter der Statusleiste. Escape gibt es dort
     * nicht, und ohne Verlaufseintrag warf die Zurueck-Geste den Leser
     * aus der ganzen Anwendung.
     *
     * Der Eintrag aendert die Adresse NICHT: der Hash bleibt stehen,
     * damit der Routenzuhoerer in inline-init.js weiter denselben Reiter
     * sieht und nicht auf die Startansicht springt. Die Marke im Zustand
     * sagt uns, dass der Eintrag von uns stammt. */
    var VERLAUFSMARKE = 'pocketOverlay';
    var eigenerEintrag = false;

    function verlaufsMarkeSetzen() {
        if (eigenerEintrag) return;
        try {
            history.pushState({ dsPocket: VERLAUFSMARKE }, '');
            eigenerEintrag = true;
        } catch (e) {
            // Kein Verlauf verfuegbar (etwa in einem Rahmen ohne Rechte).
            // Der Knopf bleibt der Weg zurueck; das ist kein Grund, das
            // Vollbild gar nicht erst zu zeigen.
            eigenerEintrag = false;
        }
    }

    function verlaufsMarkeAufloesen() {
        if (!eigenerEintrag) return;
        eigenerEintrag = false;
        try { history.back(); } catch (e) { /* siehe oben */ }
    }

    function schliesse(ausDemVerlauf) {
        var host = document.getElementById('pocketOverlay');
        if (!host || host.hidden) return;
        host.hidden = true;
        host.innerHTML = '';
        if (window.HintergrundSperre) window.HintergrundSperre.freigeben('pocket-vollbild');
        wachFreigeben();
        // Kam der Schliessbefehl SELBST aus dem Verlauf, ist der Eintrag
        // schon verbraucht — ein history.back() darauf wuerde eine
        // Ansicht zu weit zurueckspringen.
        if (ausDemVerlauf) { eigenerEintrag = false; return; }
        verlaufsMarkeAufloesen();
    }

    /* ── Zeichnen ────────────────────────────────────────────────── */

    function zeichne() {
        var host = document.getElementById('pocketListe');
        if (!host) return;
        if (!daten) {
            host.innerHTML = meldung(t('Lädt…', 'Loading…'));
            return;
        }
        if (!(daten.decks || []).length) {
            host.innerHTML = meldung(t('Die Tier-Liste ist leer.', 'The tier list is empty.'));
            return;
        }
        host.innerHTML = kopf() + filterleiste() + liste() + rechnung();
        spritesNachziehen(host);
    }

    /* Die Bilder brauchen data/archetype_icons.json, und die Tierliste
     * ist oft frueher da. `getIconUrls` gibt ohne geladene Datei eine
     * leere Liste zurueck — dann stuenden die Namen dauerhaft ohne
     * Bild, ohne dass etwas kaputt waere. Also einmal nachziehen,
     * sobald die Datei liegt.
     *
     * Nur EINMAL: `_pkSpritesDa` merkt sich, dass schon gezeichnet
     * wurde, sonst haengt an jedem Filterklick ein weiterer Durchlauf. */
    var _spritesGeholt = false;
    function spritesNachziehen(host) {
        if (_spritesGeholt) return;
        var api = window.ArchetypeIcons;
        if (!api || typeof api.preload !== 'function') return;
        if (host.querySelector('.pk-sprite')) { _spritesGeholt = true; return; }
        _spritesGeholt = true;
        Promise.resolve(api.preload()).then(function () {
            var jetzt = document.getElementById('pocketListe');
            // Nur zeichnen, wenn seither niemand anderes uebernommen
            // hat — sonst ueberschreibt der Nachzug ein Vollbild oder
            // eine Fehlermeldung.
            if (jetzt && jetzt.querySelector('.pk-zeile')) zeichne();
        }).catch(function () { /* ohne Bilder bleibt die Liste lesbar */ });
    }

    function fehler(e) {
        var host = document.getElementById('pocketListe');
        if (!host) return;
        host.innerHTML = meldung(
            t('Die Tier-Liste konnte nicht geladen werden. ' +
              'Bist du gerade offline?',
              'The tier list could not be loaded. Are you offline?'), true);
        if (window.console) console.warn('[pocket]', e);
    }

    function laden() {
        if (laeuft) return laeuft;
        // Der Service Worker reicht bei einem Netzfehler ONLINE den
        // Fehler durch, statt einen alten Stand zu liefern. Ohne diesen
        // Fangarm bliebe der Reiter leer und ohne Erklärung — genau der
        // Ausfall vom 26.08.2026 an #side-quest.
        laeuft = fetch(QUELLE, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (j) {
                daten = j;
                geladen = true;
                zeichne();
                // NACH dem Zeichnen und ohne Wartezeit davor: die
                // Deckliste ist ohne Set-Namen vollstaendig bedienbar,
                // und eine zweite Datei darf den Reiter nicht aufhalten.
                fetch(SET_QUELLE, { cache: 'no-store' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (sj) {
                        if (sj && sj.sets) { setNamen = sj.sets; zeichne(); }
                    })
                    .catch(function () { /* blanke Kennung bleibt */ });
            })
            .catch(function (e) {
                laeuft = null;
                fehler(e);
            });
        return laeuft;
    }

    function render() {
        if (!geladen) {
            zeichne();          // "Lädt…" zeigen, bevor das Netz antwortet
            laden();
            return;
        }
        zeichne();
    }

    function verdrahten() {
        var reiter = document.getElementById(HOST);
        if (!reiter || reiter.dataset.pkVerdrahtet) return;
        reiter.dataset.pkVerdrahtet = '1';

        reiter.addEventListener('click', function (ev) {
            var f = ev.target.closest('[data-pk-filter]');
            if (f) {
                filter = f.getAttribute('data-pk-filter');
                zeichne();
                return;
            }
            var z = ev.target.closest('[data-pk-deck]');
            if (z) { oeffne(Number(z.getAttribute('data-pk-deck'))); return; }
            var k = ev.target.closest('[data-pk-kopieren]');
            if (k) { kopiere(k, k.getAttribute('data-pk-kopieren')); return; }
            var zu = ev.target.closest('[data-pk-zu]');
            if (zu) schliesse();
        });

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') schliesse();
        });

        // Die Zurueck-Geste des Telefons. Sie ist dort der Reflex, und
        // ohne diesen Zuhoerer verliess sie die ganze Anwendung.
        window.addEventListener('popstate', function () {
            var host = document.getElementById('pocketOverlay');
            if (host && !host.hidden) schliesse(true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', verdrahten);
    } else {
        verdrahten();
    }

    window.dsPocket = { render: render, oeffne: oeffne, schliesse: schliesse,
                        /* Fuer die Abnahme: die Namensaufloesung wird
                           AUSGEFUEHRT geprueft, nicht im Test
                           nachgebaut. Ein Nachbau haette bewiesen, dass
                           der Nachbau stimmt. */
                        _intern: { benannteArten: benannteArten } };
}());
