/**
 * ds-pocket.js — Reiter "Side Quest · Pokémon TCG Pocket".
 *
 * WAS ER ZEIGT
 * ------------
 * Eine Tier-Liste für Pokémon TCG Pocket aus den Ergebnissen der
 * Online-Turniere auf Limitless (seit 29.09.2026; vorher Game8), je Deck
 * mit einer gespielten Liste, ihrem 2D-Muster zum Scannen und dem Code
 * als Text. Die Daten kommen aus data/pocket_tierlist.json
 * (scripts/scrape_pocket_limitless.py, täglich); das Muster zeichnet
 * js/qr-svg.js selbst aus dem Feld `code`.
 *
 * WARUM EIN EIGENER REITER
 * ------------------------
 * Der vorhandene `#side-quest` heißt in Überschrift, Menü und i18n
 * ausdrücklich "Pokémon Champions", und js/ds-nav.js:19 schreibt die
 * Trennung als Zweck auf: "Pokémon Champions ist ein anderes Spiel".
 * TCG Pocket ist ein drittes.
 *
 * WAS DIE DATEN VERLANGEN, NICHT VORSCHLAGEN
 * ------------------------------------------
 * `_meta.quelle_hinweis`: Anteil und Siegquote sind gezählt, die STUFE
 * ist unsere Regel über diese beiden Zahlen. Deshalb steht die Regel
 * unter der Überschrift — gebaut aus `_meta.stufenregel`, nicht als
 * Satz im Code, damit sie nie etwas anderes sagt als die Datei — und
 * die Quelle mit Datum steht auch im Vollbild: der Screenshot verlässt
 * die Seite.
 *
 * WAS ANGESCHRIEBEN WIRD
 * ----------------------
 * 1. Decks ohne Scan-Code (`code` null, Grund in `code_fehlt`): sie stehen
 *    in der Liste, das Vollbild nennt den Grund statt eines Musters, und
 *    die Fußzeile nennt ihre Namen.
 * 2. Archetypen unter `_meta.min_listen`: gezählt in der Fußzeile.
 * 3. Laufende Turniere (`_meta.offene_turniere`): gezählt in der Fußzeile.
 *
 * DAS ALTER
 * ---------
 * Der Ablauf .github/workflows/pocket-tierlist.yml läuft täglich. Ab
 * PLAUSIBEL_TAGE ohne Auffrischung steht eine sichtbare Warnung da —
 * derselbe Wert wie in scripts/data_guardian.py check_pocket_frische().
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
    /* FE-11: die Kennungen fuer eigene Scan-Codes. Erst beim ersten Klick
       auf "Scan-Code erzeugen" geholt — die Tier-Liste braucht sie nicht. */
    var KARTEN_QUELLE = 'data/pocket_karten_ids.json';
    var kartenTabelle = null;
    var eigenText = '';
    var setNamen = null;
    var HOST = 'pocket';
    // Rueckfall, falls eine Datei keine Stufenregel traegt. Massgeblich
    // ist `_meta.stufenregel` (siehe stufenOrdnung()).
    var TIER_ORDNUNG = ['S', 'A', 'B', 'C'];
    // Der Lauf ist taeglich; drei Tage ohne Auffrischung heisst, er ist
    // zweimal ausgefallen.
    var PLAUSIBEL_TAGE = 3;

    var daten = null;
    var geladen = false;
    var laeuft = null;
    var wachschloss = null;


    /* ── Sprites vor dem Deck-Namen ──────────────────────────────────
     *
     * Vom Betreiber am 10.09.2026 gewuenscht. Die Schwierigkeit liegt
     * nicht im Zeichnen, sondern darin, aus einem Deck-Namen die
     * richtigen Pokemon zu bekommen — Game8 schrieb dort (bis 29.09.2026) Set-Kuerzel
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

    function stufenOrdnung() {
        var r = ((daten && daten._meta) || {}).stufenregel;
        return (r && r.length) ? r.map(function (x) { return x.stufe; }) : TIER_ORDNUNG;
    }

    /* Prozent in der Schreibweise der Sprache: „8,2 %" / "8.2 %". */
    function prozent(x) {
        if (typeof x !== 'number' || isNaN(x)) return '–';
        var v = (x * 100).toFixed(1);
        return (t(v.replace('.', ','), v)) + ' %';
    }

    /* Der Name der Siegquote kommt aus js/win-rate-konvention.js, nicht
       aus diesem Reiter (tests/unit/test-w2-hausnamen.js): die Datei rechnet
       S / (S + N + U), Konvention „mitUnentschieden". Fehlt das Modul,
       bleibt das Kuerzel mit der Formel. */
    function wr() {
        var K = window.WinRateKonvention, id = (daten && daten._meta && daten._meta.quoten_konvention) || 'mitUnentschieden';
        return {
            kuerzel: (K && K.kuerzel(id)) || 'WR*',
            lang: (K && K.kurz(id)) || '',
            formel: (K && K.kurzHinweis && K.kurzHinweis(id)) ||
                    ((daten && daten._meta && daten._meta.quoten_formel) || 'S / (S + N + U)')
        };
    }

    function wrTitel() {
        var w = wr();
        return w.kuerzel + ': ' + (w.lang ? w.lang + ' · ' : '') + w.formel;
    }

    function bilanzText(d) {
        return d.siege + '-' + d.niederlagen + '-' + d.unentschieden;
    }

    function meldung(text, istFehler) {
        return '<div class="pk-meldung' + (istFehler ? ' is-fehler' : '') +
               '" role="status">' + esc(text) + '</div>';
    }

    /* Die Stufenregel, gebaut aus der Datei. Ein Satz über die Regel im
       Code würde irgendwann etwas anderes sagen als die Datei. */
    function regelText(m) {
        var zeilen = (m.stufenregel || []).map(function (r) {
            var teile = [];
            if (r.anteil_ab != null) teile.push(t('Anteil ab ', 'share from ') + prozent(r.anteil_ab));
            if (r.quote_ab != null) teile.push(wr().kuerzel + t(' ab ', ' from ') + prozent(r.quote_ab));
            return r.stufe + ': ' + (teile.length ? teile.join(t(' und ', ' and '))
                                                 : t('alle übrigen ab ', 'all others from ') +
                                                   (m.min_listen || '?') + t(' Listen', ' lists'));
        });
        return zeilen.join(' · ');
    }

    function kopf() {
        var m = daten._meta || {};
        var stand = kurzDatum(m.abgerufen);
        var tage = tageSeit(m.abgerufen);
        var f = m.fenster || {};
        var s = '';
        s += '<div class="header">';
        s += '<h2 role="heading" aria-level="1">' + esc(t('Side Quest · Pokémon TCG Pocket',
                            'Side Quest · Pokémon TCG Pocket')) + '</h2>';
        /* UI-90 (03.10.2026, Tiefenanalyse N-18): ein Satz Einordnung —
           Pocket ist ein eigenes Handyspiel, und der Musterweg war unklar. */
        s += '<p>' + esc(t('Pokémon TCG Pocket ist ein eigenes Handyspiel mit eigenen Karten und Regeln. ' +
                           'Hier stehen die meistgespielten Decks der Online-Turniere auf Limitless, ' +
                           'letzte ' + (f.tage || '?') + ' Tage. Tippe ein Deck an: es zeigt ein Muster, ' +
                           'das du mit dem Handy, auf dem Pocket läuft, scannst.',
                           'Pokémon TCG Pocket is a separate mobile game with its own cards and rules. ' +
                           'These are the most played decks of the online tournaments on Limitless, last ' +
                           (f.tage || '?') + ' days. Tap a deck: it shows a pattern you scan with the ' +
                           'phone that runs Pocket.')) + '</p>';
        s += '</div>';

        var w = wr();
        s += '<p class="pk-quelle">' +
             esc(t('Gezählt aus ' + (m.turniere || 0) + ' Turnieren mit ' + (m.listen || 0) + ' Listen',
                   'Counted from ' + (m.turniere || 0) + ' tournaments with ' + (m.listen || 0) + ' lists')) +
                 /* N2-06 (07.10.2026): „S" stand hier fuer Siege und gleich danach fuer
                    die Stufe S. Die Formel wird ausgeschrieben. */
                 esc(' · ' + w.kuerzel + ' = ' + (w.lang ? w.lang + ', ' : '') +
                     t('Siege ÷ alle Spiele (mit Unentschieden)', 'wins ÷ all games (incl. ties)') + ' · ' +
                     t('Stufe nach unserer Regel', 'tier by our rule'));
        if (m.quelle_url) {
            s += ' · <a href="' + esc(m.quelle_url) + '" target="_blank" rel="noopener">limitlesstcg.com</a>';
        }
        if (stand) s += ' · ' + esc(t('Stand ', 'as of ')) + esc(stand);
        s += '</p>';
        if ((m.stufenregel || []).length) {
            s += '<p class="pk-quelle pk-regel">' + esc(t('So entsteht die Stufe: ', 'How the tier is set: ')) +
                 esc(regelText(m)) + '</p>';
        }

        if (tage !== null && tage >= PLAUSIBEL_TAGE) {
            s += '<p class="pk-alt">' + esc(
                t('Seit ' + tage + ' Tagen nicht aufgefrischt — der tägliche Lauf ist ausgefallen.',
                  'Not refreshed for ' + tage + ' days — the daily run has failed.')) + '</p>';
        }
        return s;
    }

    var ENERGIE_DE = { Grass: 'Pflanze', Fire: 'Feuer', Water: 'Wasser', Lightning: 'Elektro',
                       Psychic: 'Psycho', Fighting: 'Kampf', Darkness: 'Finsternis', Metal: 'Metall' };
    // Reihenfolge der Typen wie im Spiel; nur Typen, die in der Datei vorkommen, werden gezeigt.
    var ENERGIE_REIHE = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];

    /* FE-65 (Hausi 08./09.10.2026): Filter nach Energietyp. Quelle ist das
       gespeicherte Feld `energie` je Deck (dieselbe Zeile „Energie: …“ wie
       im Deck-Dialog). Ein Deck mit zwei Energien steht unter beiden Typen
       (gemessen 09.10.: 3 von 42 Decks). Farblos/Drache kommen als
       Deck-Energie nicht vor (Pocket-Regel, siehe energie_verboten). */
    var energieFilter = null;

    function energieChips() {
        var decks = daten.decks || [];
        var zahl = {};
        decks.forEach(function (d) { (d.energie || []).forEach(function (e) { zahl[e] = (zahl[e] || 0) + 1; }); });
        var typen = ENERGIE_REIHE.filter(function (e) { return zahl[e]; })
            .concat(Object.keys(zahl).filter(function (e) { return ENERGIE_REIHE.indexOf(e) < 0; }));
        if (!typen.length) return '';
        if (energieFilter && !zahl[energieFilter]) energieFilter = null;
        function chip(wert, text, n) {
            var an = (wert || null) === energieFilter;
            return '<button type="button" class="pk-chip' + (an ? ' is-an' : '') + '" data-pk-energie="' + esc(wert) +
                '" aria-pressed="' + (an ? 'true' : 'false') + '">' + esc(text) +
                ' <span class="pk-chip-zahl">' + n + '</span></button>';
        }
        return '<div class="pk-chips" role="group" aria-label="' + esc(t('Nach Energie filtern', 'Filter by energy')) + '">' +
            chip('', t('Alle', 'All'), decks.length) +
            typen.map(function (e) { return chip(e, t(ENERGIE_DE[e] || e, e), zahl[e]); }).join('') +
            '</div>';
    }

    function passtZumFilter(d) {
        return !energieFilter || (d.energie || []).indexOf(energieFilter) >= 0;
    }

    /* EINE DECKZEILE. */
    function zeile(d) {
        var i = (daten.decks || []).indexOf(d);
        var s = '<button type="button" class="pk-zeile" data-pk-deck="' + i + '">';
        s += '<span class="pk-marke">' + esc(d.tier || '?') + '</span>';
        s += spriteHtml(d);
        s += '<span class="pk-name">' + esc(d.name);
        var erg = (d.energie || []).map(function (e) { return t(ENERGIE_DE[e] || e, e); }).join('/');
        var fuss = (erg ? [erg] : []).concat([prozent(d.anteil) + t(' der Listen', ' of lists'),
                    wr().kuerzel + ' ' + prozent(d.quote),
                    d.listen + t(' Listen', ' lists')]);
        if (!d.code) fuss.push(t('ohne Scan-Code', 'no scan code'));
        s += '<span class="pk-fussnote" title="' + esc(wrTitel()) + '">' + esc(fuss.join(' · ')) + '</span>';
        s += '</span><span class="pk-pfeil" aria-hidden="true">›</span></button>';
        return s;
    }

    function liste() {
        var decks = (daten.decks || []).filter(passtZumFilter);
        var ordnung = stufenOrdnung();
        var s = energieChips();
        ordnung.forEach(function (stufe) {
            // Die Reihenfolge innerhalb einer Stufe kommt aus der Datei:
            // nach Anteil, gezählt — keine erfundene Rangfolge.
            var teil = decks.filter(function (d) { return d.tier === stufe; });
            if (!teil.length) return;
            s += '<section class="pk-stufe">';
            s += '<h3>' + esc(t('Stufe ', 'Tier ')) + esc(stufe) +
                 ' <span class="pk-stufe-zahl">' + teil.length + '</span></h3>';
            teil.forEach(function (d) { s += zeile(d); });
            s += '</section>';
        });

        // EINE UNBEKANNTE STUFE DARF NICHT STILL VERSCHWINDEN (07.09.2026).
        // Die Regel steht in der Datei; ein Deck, dessen Stufe dort nicht
        // vorkommt, ist ein Fehler des Erzeugers — gezeigt wird es trotzdem,
        // nur angeschrieben. Weglassen wäre die stille Reparatur.
        var fremd = decks.filter(function (d) { return ordnung.indexOf(d.tier) < 0; });
        if (fremd.length) {
            var stufen = fremd.map(function (d) {
                return d.tier === null || d.tier === undefined || d.tier === ''
                    ? t('ohne Angabe', 'not given') : String(d.tier);
            }).filter(function (v, i, a) { return a.indexOf(v) === i; });
            s += '<section class="pk-stufe">';
            s += '<h3>' + esc(t('Ohne bekannte Stufe', 'Tier not recognised')) +
                 ' <span class="pk-stufe-zahl">' + fremd.length + '</span></h3>';
            s += '<p class="pk-alt">' + esc(t(
                'Diese Stufe kennt die Regel der Datei nicht (' + stufen.join(', ') +
                '). Die Decks stehen trotzdem da — weglassen wäre die stillere, ' +
                'aber schlechtere Lösung.',
                'The rule in the file does not know this tier (' + stufen.join(', ') +
                '). The decks are shown anyway — dropping them would be the ' +
                'quieter but worse option.')) + '</p>';
            fremd.forEach(function (d) { s += zeile(d); });
            s += '</section>';
        }
        return s;
    }

    function rechnung() {
        var m = daten._meta || {};
        var unter = m.unter_min_listen || {};
        var ohne = m.ohne_code || [];
        var offen = m.offene_turniere || [];
        var s = '<div class="pk-rechnung">';
        s += '<strong>' + (daten.decks || []).length + ' Decks</strong> ' +
             esc(t('ab ' + (m.min_listen || '?') + ' Listen im Fenster.',
                   'with ' + (m.min_listen || '?') + ' lists or more in the window.'));
        if (unter.archetypen) {
            s += ' ' + esc(t('Darunter nicht gezeigt: ' + unter.archetypen + ' weitere Archetypen mit ' +
                             'zusammen ' + unter.listen + ' Listen.',
                             'Not shown below that: ' + unter.archetypen + ' more archetypes with ' +
                             unter.listen + ' lists in total.'));
        }
        if (ohne.length) {
            s += '<br>' + esc(t('Ohne Scan-Code: ', 'Without scan code: ')) +
                 ohne.map(function (o) { return esc(o.name) + ' (' + esc(o.grund) + ')'; }).join('; ') +
                 '. ' + esc(t('Ein falscher Code ist schlimmer als keiner.',
                              'A wrong code is worse than none.'));
        }
        if (offen.length) {
            s += '<br>' + esc(t(offen.length + ' Turniere sind noch nicht dabei (laufen noch oder ' +
                                'waren nicht abrufbar) und kommen beim nächsten Lauf dazu.',
                                offen.length + ' tournaments are not included yet (still running ' +
                                'or not retrievable) and will be added in the next run.'));
        }
        s += '</div>';
        return s;
    }

    /* ── Eigenes Deck als Scan-Code (FE-11, 28.09.2026) ───────────────
     *
     * Pocket liest Decks nur als 2D-Muster ein. Wer eine Liste als Text
     * hat, fügt sie hier ein und bekommt dasselbe Vollbild wie bei den
     * Decks der Liste. Gebaut wird in js/pocket-deckcode.js; verbunden wird
     * über Set und Nummer, nie über den Namen. */
    function eigenesDeck() {
        return '<section class="pk-eigen" aria-labelledby="pkEigenTitel">' +
            '<div class="pk-eigen-titel" id="pkEigenTitel" role="heading" aria-level="3">' +
            esc(t('Eigenes Deck als Scan-Code', 'Your own deck as a scan code')) + '</div>' +
            '<p class="pk-hell">' + esc(t(
                'Eine Karte je Zeile mit Anzahl, Name, Set und Nummer, dazu eine Zeile mit der Energie. ' +
                'Beispiel: „2 Riolu B3 79" und „Energy: Fighting".',
                'One card per line with count, name, set and number, plus a line with the energy. ' +
                'Example: "2 Riolu B3 79" and "Energy: Fighting".')) + '</p>' +
            '<textarea id="pkEigenListe" class="pk-eigen-liste" rows="10" spellcheck="false" ' +
            'aria-label="' + esc(t('Deckliste', 'Deck list')) + '" placeholder="2 Riolu B3 79&#10;2 Lucario B3 80&#10;…&#10;Energy: Fighting">' +
            esc(eigenText) + '</textarea>' +
            '<button type="button" class="pk-kopieren pk-eigen-knopf" data-pk-eigen="1">' +
            esc(t('Scan-Code erzeugen', 'Create scan code')) + '</button>' +
            '<div id="pkEigenMeldung" aria-live="polite"></div>' +
            '</section>';
    }

    function eigenFehlerText(f) {
        var z = f.zeile ? t('Zeile ', 'Line ') + f.zeile + ': ' : '';
        switch (f.art) {
        case 'nicht_erkannt': return z + t('nicht erkannt — erwartet „Anzahl Name Set Nummer": ', 'not recognised — expected "count name set number": ') + f.text;
        case 'set_unbekannt': return z + t('Set unbekannt: ', 'unknown set: ') + f.text;
        case 'karte_unbekannt': return z + t('diese Nummer gibt es in unserer Kartentabelle nicht: ', 'this number is not in our card table: ') + f.text;
        case 'anzahl': return z + t('Anzahl fehlt oder ist 0', 'count missing or 0');
        case 'energie_verboten': return z + t('Drache und Farblos sind keine wählbare Deck-Energie: ', 'Dragon and Colorless cannot be chosen as deck energy: ') + f.text;
        case 'energie_unbekannt': return z + t('Energie unbekannt: ', 'unknown energy: ') + f.text;
        case 'energie_fehlt': return t('Es fehlt die Zeile mit der Energie, z. B. „Energy: Fighting".', 'The energy line is missing, e.g. "Energy: Fighting".');
        case 'energie_zu_viele': return t('Höchstens drei Energien — hier sind es ', 'At most three energies — found ') + f.anzahl + '.';
        case 'zu_viele': return t('Höchstens zwei Karten gleichen Namens: ', 'At most two cards with the same name: ') + f.text + ' (' + f.anzahl + ')';
        case 'deckgroesse': return t('Ein Deck hat genau 20 Karten — hier sind es ', 'A deck has exactly 20 cards — found ') + f.anzahl + '.';
        case 'keine_pokemon': return t('Das Deck enthält kein Pokémon.', 'The deck contains no Pokémon.');
        default: return z + f.art;
        }
    }

    function eigenMeldung(html) {
        var m = document.getElementById('pkEigenMeldung');
        if (m) m.innerHTML = html;
    }

    function eigenErzeugen() {
        var feld = document.getElementById('pkEigenListe');
        if (feld) eigenText = feld.value;
        if (!window.PocketDeckcode) {
            eigenMeldung(meldung(t('Der Baustein für eigene Codes fehlt.', 'The own-code module is missing.'), true));
            return Promise.resolve();
        }
        var tabelle = kartenTabelle ? Promise.resolve(kartenTabelle)
            : fetch(KARTEN_QUELLE, { cache: 'no-store' }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function (j) { kartenTabelle = j; return j; });
        return tabelle.then(function (tab) {
            var P = window.PocketDeckcode;
            var erg = P.baue(P.leseListe(eigenText), tab);
            var hinweise = erg.hinweise.map(function (h) {
                return t('Zeile ', 'Line ') + h.zeile + ': ' +
                       t('„' + h.text + '" steht in ' + h.karte + ' als „' + h.erwartet + '" — bitte Set und Nummer prüfen.',
                         '"' + h.text + '" is "' + h.erwartet + '" in ' + h.karte + ' — please check set and number.');
            });
            if (!erg.code) {
                eigenMeldung('<div class="pk-meldung is-fehler"><ul>' +
                    erg.fehler.map(function (f) { return '<li>' + esc(eigenFehlerText(f)) + '</li>'; }).join('') +
                    hinweise.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div>');
                return;
            }
            eigenMeldung(hinweise.length
                ? '<div class="pk-meldung pk-eigen-hinweis"><ul>' +
                  hinweise.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div>'
                : '');
            zeigeVollbild({
                name: t('Eigenes Deck', 'Your deck'), code: erg.code,
                pokemon: erg.pokemon, trainer: erg.trainer
            }, t('Aus deiner Liste · Energie: ' + erg.energieDe.join(', '),
                 'From your list · Energy: ' + erg.energie.join(', ')));
        }).catch(function (e) {
            eigenMeldung(meldung(t('Die Kartentabelle ließ sich nicht laden. Bist du gerade offline?',
                                   'The card table could not be loaded. Are you offline?'), true));
            if (window.console) console.warn('[pocket]', e);
        });
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
        var energie = (d.energie || []).map(function (e) { return t(ENERGIE_DE[e] || e, e); });
        return '<div class="pk-karten">' +
               block(t('Pokémon', 'Pokémon'), d.pokemon) +
               block(t('Trainer', 'Trainer'), d.trainer) +
               (energie.length ? '<p class="pk-hell">' + esc(t('Energie: ', 'Energy: ')) +
                                 esc(energie.join(', ')) + '</p>' : '') +
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
        if (!d) return;
        var stand = kurzDatum((daten._meta || {}).abgerufen);
        var teile = [t('Stufe ', 'Tier ') + d.tier,
                     prozent(d.anteil) + t(' der Listen', ' of lists'),
                     wr().kuerzel + ' ' + prozent(d.quote) + ' (' + bilanzText(d) + ')'];
        var lv = d.liste_von;
        if (lv) {
            teile.push(t('Liste: ', 'List: ') + (lv.platz ? t('Platz ', 'place ') + lv.platz + ', ' : '') +
                       lv.bilanz.join('-') + ', ' + lv.turnier +
                       (kurzDatum(lv.datum) ? ' (' + kurzDatum(lv.datum) + ')' : ''));
        }
        teile.push('Limitless' + (stand ? ' · ' + t('Stand ', 'as of ') + stand : ''));
        zeigeVollbild(d, teile.join(' · '));
    }

    function zeigeVollbild(d, unterzeile) {
        var host = document.getElementById('pocketOverlay');
        if (!d || !host) return;
        var bild;
        if (!d.code) {
            /* Kein Code ist kein Zeichenfehler: der Grund steht in der
               Datei (`code_fehlt`) und wird genannt, statt ein leeres
               Muster oder „null" als Code zu zeigen. */
            bild = '<div class="pk-meldung is-fehler">' +
                   esc(t('Für dieses Deck gibt es keinen Scan-Code: ', 'There is no scan code for this deck: ')) +
                   esc(d.code_fehlt || t('ohne Angabe', 'not given')) + '</div>';
        } else try {
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
        // KEIN <h3>. Der Deck-Name ist die englische Bezeichnung der Quelle, und
        // .github/workflows/sprachreinheit.yml prueft sichtbaren Text in
        // h1..h5, label, button und a auf Sprachreinheit. Die Rolle
        // bleibt erhalten, die Sprachpruefung greift hier nicht mehr.
        s += '<div class="pk-overlay-name" role="heading" aria-level="2">' +
             esc(d.name) + '</div>';
        s += '<p' + (typeof d.quote === 'number' ? ' title="' + esc(wrTitel()) + '"' : '') + '>' +
             esc(unterzeile) + '</p>';
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
        host.innerHTML = kopf() + liste() + rechnung() + eigenesDeck();
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
            var chip = ev.target.closest('[data-pk-energie]');
            if (chip) { energieFilter = chip.getAttribute('data-pk-energie') || null; zeichne(); return; }
            var z = ev.target.closest('[data-pk-deck]');
            if (z) { oeffne(Number(z.getAttribute('data-pk-deck'))); return; }
            var k = ev.target.closest('[data-pk-kopieren]');
            if (k) { kopiere(k, k.getAttribute('data-pk-kopieren')); return; }
            var eigen = ev.target.closest('[data-pk-eigen]');
            if (eigen) { eigenErzeugen(); return; }
            var zu = ev.target.closest('[data-pk-zu]');
            if (zu) schliesse();
        });
        // Der eingefuegte Text ueberlebt das Neuzeichnen (Set-Namen, Sprites).
        reiter.addEventListener('input', function (ev) {
            if (ev.target && ev.target.id === 'pkEigenListe') eigenText = ev.target.value;
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
                        eigenErzeugen: eigenErzeugen,
                        _intern: { benannteArten: benannteArten } };
}());
