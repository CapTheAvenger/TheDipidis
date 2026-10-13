/**
 * Zwei Decklisten nebeneinander — der Vergleich als Liste, nicht als Prosa.
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Der Deckvergleich unter "Meine Decks" (js/firebase-collection.js,
 * showDeckComparison) hatte zwei Ansichten:
 *
 *   "Nur Aenderungen"  Kartenbilder, raus/rein, als Umbauanleitung.
 *   "Volle Liste"      vier UNTEREINANDER stehende Textbloecke
 *                      (Only in A / Only in B / Different counts / Same).
 *
 * In der vollen Liste steht keine der beiden Listen als Liste da. Wer
 * wissen will "was steht bei mir an dieser Stelle, was beim anderen",
 * muss vier Bloecke im Kopf wieder zusammensetzen. Der Betreiber hat
 * deshalb entschieden: zwei Listen nebeneinander.
 *
 * DIE ZUORDNUNG LAEUFT UEBER (set, nummer) — NIE UEBER DEN NAMEN
 * -------------------------------------------------------------
 * CLAUDE.md, "Data rules": Namen sind innerhalb eines Sets nicht
 * eindeutig. PBL fuehrt vier Produkte namens *Mega Darkrai ex*. Ein
 * Vergleich, der ueber den Namen zusammenfasst, zeigt drei Kopien einer
 * Karte, die es so nicht gibt, und verschweigt genau den Unterschied,
 * wegen dem jemand den Vergleich geoeffnet hat.
 *
 * Deshalb ist der Schluessel hier ausschliesslich `DRUCK:SET-NUMMER`,
 * gebildet aus dem Decklistenschluessel `Name (SET NUMMER)`, aus
 * `{set, number}` oder aus `card_identifier` ("SET NUMMER", so wie
 * js/app-current-meta-analysis.js:601 es schreibt). Der Name wandert
 * nur in die Anzeige.
 *
 * Zwei Normalisierungen, beide auf DENSELBEN Bezeichner, keine
 * Zusammenfassung ueber Karten hinweg:
 *   • Set und Nummer in Grossbuchstaben ("mew" und "MEW" sind ein Set).
 *   • Fuehrende Nullen bei rein numerischen Nummern ("006" == "6").
 *     Der Deckbauer schreibt `getCanonicalDeckKey` mit der Nummer, wie
 *     sie kommt (js/app-utils.js:440), der Limitless-/PTCGL-Einfuegepfad
 *     mit der Nummer aus der Zeile. Ohne diese Regel stuenden dieselbe
 *     Karte aus dem gespeicherten Deck und aus der eingefuegten Liste
 *     als zwei Zeilen nebeneinander — der haeufigste Fall ueberhaupt.
 *     Ein Set mit "6" UND "006" als zwei verschiedenen Karten gibt es
 *     nicht; alphanumerische Nummern (TG12, 184a) bleiben unangetastet.
 *
 * Eintraege OHNE Druckangabe (blosser Name, kommt bei handgetippten
 * Decks vor) werden NICHT auf Namensgleichheit mit einem Druck
 * gezogen. Sie bekommen einen eigenen Schluessel `OHNE-DRUCK:<name>`,
 * werden in der Ansicht als "ohne Druckangabe" gekennzeichnet und
 * bleiben damit sichtbar unsicher — melden statt still reparieren.
 *
 * MOBIL
 * -----
 * Nebeneinander nur, wo Platz ist. Die Spaltenaufteilung und der
 * Umbruch unter 700 px stehen in css/styles.css unter
 * `.dvn-spalten` — dort auch die Regel, die die Fehlt-Platzhalter im
 * gestapelten Zustand ausblendet: sie halten die Zeilen nur dann in
 * einer Hoehe, wenn wirklich zwei Spalten nebeneinander stehen.
 *
 * BARRIEREFREIHEIT
 * ----------------
 * Jede Unterschiedsklasse traegt ein ZEICHEN und einen TEXT, nicht nur
 * eine Farbe: "=" gleich, "≠" andere Anzahl, "◀" nur links, "▶" nur
 * rechts. Dazu drei unterscheidbare Kantenformen (durchgezogen,
 * gestrichelt, doppelt/gepunktet). Wer die Farben nicht trennen kann,
 * liest die Klasse trotzdem ab.
 */
(function () {
    'use strict';

    var KLASSEN = ['gleich', 'nurA', 'nurB', 'abweichend'];

    function sicher(text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Nummer vereinheitlichen: Grossbuchstaben, fuehrende Nullen nur bei reinen Zahlen. */
    function nummerNormalisieren(rohNummer) {
        var n = String(rohNummer === null || rohNummer === undefined ? '' : rohNummer)
            .toUpperCase().trim();
        if (/^\d+$/.test(n)) return String(parseInt(n, 10));
        return n;
    }

    function setNormalisieren(rohSet) {
        return String(rohSet === null || rohSet === undefined ? '' : rohSet)
            .toUpperCase().trim();
    }

    /**
     * Einen Decklisteneintrag in {name, set, nummer} zerlegen.
     * Traegt drei Schreibweisen: den Schluessel "Name (SET NUMMER)",
     * ein Objekt {name, set, number} und `card_identifier` ("SET NUMMER").
     */
    function eintragLesen(rohSchluessel, wert) {
        var name = '';
        var set = '';
        var nummer = '';

        if (wert && typeof wert === 'object') {
            name = wert.name || wert.card_name || '';
            set = wert.set || wert.set_code || '';
            nummer = wert.number || wert.set_number || '';
            if ((!set || !nummer) && wert.card_identifier) {
                var ident = String(wert.card_identifier).trim()
                    .match(/^([A-Z0-9-]{2,})\s+([A-Z0-9-]+)$/i);
                if (ident) { set = ident[1]; nummer = ident[2]; }
            }
        }

        var roh = String(rohSchluessel === null || rohSchluessel === undefined ? '' : rohSchluessel).trim();
        if (!set || !nummer) {
            var m = roh.match(/^(.+?)\s*\(([A-Z0-9-]{2,})\s+([A-Z0-9-]+)\)$/i);
            if (m) {
                if (!name) name = m[1].trim();
                set = m[2];
                nummer = m[3];
            } else if (!name) {
                name = roh;
            }
        }
        if (!name) name = roh;

        set = setNormalisieren(set);
        nummer = nummerNormalisieren(nummer);

        return {
            name: String(name).trim(),
            set: set,
            nummer: nummer,
            /* Der Schluessel. Der Name kommt hier NICHT vor — siehe Kopf. */
            schluessel: (set && nummer)
                ? ('DRUCK:' + set + '-' + nummer)
                : ('OHNE-DRUCK:' + String(name).trim().toLowerCase()),
            ohneDruck: !(set && nummer)
        };
    }

    function anzahlLesen(wert) {
        if (wert && typeof wert === 'object') {
            return parseInt(wert.count !== undefined ? wert.count : wert.anzahl, 10) || 0;
        }
        return parseInt(wert, 10) || 0;
    }

    /**
     * Eine Deckliste in eine Karte schluessel -> {anzahl, name, set, nummer}.
     * Nimmt `{ "Name (SET NR)": 4 }`, `{ key: {count, set, number} }`
     * und ein Feld von Objekten.
     */
    function listeLesen(karten) {
        var raus = new Map();
        if (!karten) return raus;

        var paare = Array.isArray(karten)
            ? karten.map(function (k) { return ['', k]; })
            : Object.keys(karten).map(function (k) { return [k, karten[k]]; });

        paare.forEach(function (paar) {
            var anzahl = anzahlLesen(paar[1]);
            if (anzahl <= 0) return;
            var e = eintragLesen(paar[0], paar[1]);
            var vorhanden = raus.get(e.schluessel);
            if (vorhanden) {
                vorhanden.anzahl += anzahl;
            } else {
                raus.set(e.schluessel, {
                    schluessel: e.schluessel,
                    name: e.name,
                    set: e.set,
                    nummer: e.nummer,
                    ohneDruck: e.ohneDruck,
                    anzahl: anzahl
                });
            }
        });
        return raus;
    }

    function klasseVon(anzahlA, anzahlB) {
        if (anzahlA > 0 && anzahlB === 0) return 'nurA';
        if (anzahlB > 0 && anzahlA === 0) return 'nurB';
        if (anzahlA !== anzahlB) return 'abweichend';
        return 'gleich';
    }

    /* Unterschiede zuerst — deswegen oeffnet man den Vergleich. */
    var RANG = { nurA: 0, nurB: 1, abweichend: 2, gleich: 3 };

    /**
     * Der Vergleich. Reine Rechnung, kein DOM.
     * Gibt Zeilen (Vereinigung beider Listen) und die Kennzahlen zurueck.
     */
    function vergleiche(deckA, deckB) {
        var a = listeLesen(deckA && deckA.cards ? deckA.cards : deckA);
        var b = listeLesen(deckB && deckB.cards ? deckB.cards : deckB);

        var schluessel = [];
        a.forEach(function (_, k) { schluessel.push(k); });
        b.forEach(function (_, k) { if (!a.has(k)) schluessel.push(k); });

        var zeilen = schluessel.map(function (k) {
            var ea = a.get(k);
            var eb = b.get(k);
            var quelle = ea || eb;
            var anzahlA = ea ? ea.anzahl : 0;
            var anzahlB = eb ? eb.anzahl : 0;
            return {
                schluessel: k,
                name: quelle.name,
                set: quelle.set,
                nummer: quelle.nummer,
                ohneDruck: quelle.ohneDruck,
                anzahlA: anzahlA,
                anzahlB: anzahlB,
                klasse: klasseVon(anzahlA, anzahlB)
            };
        });

        zeilen.sort(function (x, y) {
            if (RANG[x.klasse] !== RANG[y.klasse]) return RANG[x.klasse] - RANG[y.klasse];
            var n = String(x.name).localeCompare(String(y.name), 'de');
            if (n !== 0) return n;
            return String(x.schluessel).localeCompare(String(y.schluessel));
        });

        var kennzahlen = {
            gleich: 0, nurA: 0, nurB: 0, abweichend: 0,
            zeilen: zeilen.length,
            kartenA: 0, kartenB: 0,
            ohneDruck: 0
        };
        zeilen.forEach(function (z) {
            kennzahlen[z.klasse] += 1;
            kennzahlen.kartenA += z.anzahlA;
            kennzahlen.kartenB += z.anzahlB;
            if (z.ohneDruck) kennzahlen.ohneDruck += 1;
        });

        return { zeilen: zeilen, kennzahlen: kennzahlen };
    }

    // ── Anzeige ──────────────────────────────────────────────────────

    var TEXTE = {
        de: {
            gleich: 'gleich',
            nurA: 'nur links',
            nurB: 'nur rechts',
            abweichend: 'andere Anzahl',
            fehlt: 'nicht enthalten',
            karten: 'Karten',
            drucke: 'Prints',
            ohneDruck: 'ohne Print-Angabe',
            kopf: 'Zugeordnet wird über Set und Nummer, nie über den Kartennamen — '
                + 'gleichnamige Karten aus verschiedenen Sets bleiben getrennte Zeilen.',
            ohneDruckHinweis: 'Zeile(n) ohne Set und Nummer: nur mit einem gleich '
                + 'geschriebenen Eintrag der anderen Liste zusammengeführt, sonst getrennt.',
            leer: 'Beide Listen sind leer.'
        },
        en: {
            gleich: 'same',
            nurA: 'left only',
            nurB: 'right only',
            abweichend: 'different count',
            fehlt: 'not included',
            karten: 'cards',
            drucke: 'prints',
            ohneDruck: 'no print given',
            kopf: 'Cards are matched on set and number, never on the card name — '
                + 'same-named cards from different sets stay separate rows.',
            ohneDruckHinweis: 'Row(s) without set and number: merged only with an '
                + 'identically spelled entry of the other list, kept apart otherwise.',
            leer: 'Both lists are empty.'
        }
    };

    /* Zeichen UND Text, nicht nur Farbe. */
    var ZEICHEN = { gleich: '=', abweichend: '≠', nurA: '◀', nurB: '▶' };

    function texte(sprache) {
        return TEXTE[sprache === 'en' ? 'en' : 'de'];
    }

    function zeileHtml(zeile, seite, t) {
        var eigene = seite === 'a' ? zeile.anzahlA : zeile.anzahlB;
        var fremde = seite === 'a' ? zeile.anzahlB : zeile.anzahlA;

        var druck = zeile.ohneDruck
            ? '<span class="dvn-ohne-druck">' + sicher(t.ohneDruck) + '</span>'
            : '<span class="dvn-druck">' + sicher(zeile.set + ' ' + zeile.nummer) + '</span>';

        if (eigene === 0) {
            return '<li class="dvn-zeile dvn-leer">'
                + '<span class="dvn-marke" aria-hidden="true">·</span>'
                + '<span class="dvn-anzahl">—</span>'
                + '<span class="dvn-name">' + sicher(zeile.name) + ' <span class="dvn-fehlt">('
                + sicher(t.fehlt) + ')</span></span>'
                + druck
                + '</li>';
        }

        var marke = ZEICHEN[zeile.klasse];
        var beschriftung = t[zeile.klasse];
        var anzahlHtml = (zeile.klasse === 'abweichend')
            ? '<span class="dvn-anzahl">' + eigene + '<span class="dvn-pfeil"> → ' + fremde + '</span></span>'
            : '<span class="dvn-anzahl">' + eigene + '</span>';

        return '<li class="dvn-zeile dvn-' + zeile.klasse + '">'
            + '<span class="dvn-marke" title="' + sicher(beschriftung) + '">'
            + '<span aria-hidden="true">' + marke + '</span>'
            + '<span class="dvn-marke-text">' + sicher(beschriftung) + '</span></span>'
            + anzahlHtml
            + '<span class="dvn-name">' + sicher(zeile.name) + '</span>'
            + druck
            + '</li>';
    }

    function kennzahlHtml(klasse, wert, t) {
        return '<span class="dvn-kennzahl dvn-' + klasse + '">'
            + '<span class="dvn-marke" aria-hidden="true">' + ZEICHEN[klasse] + '</span>'
            + '<b>' + wert + '</b> ' + sicher(t[klasse])
            + '</span>';
    }

    /**
     * Zwei Listen nebeneinander, mit Kopfzeile.
     * `optionen`: { nameA, nameB, sprache }
     */
    function rendere(vergleich, optionen) {
        var opt = optionen || {};
        var t = texte(opt.sprache);
        var k = vergleich.kennzahlen;
        var nameA = sicher(opt.nameA || 'Deck A');
        var nameB = sicher(opt.nameB || 'Deck B');

        if (!vergleich.zeilen.length) {
            return '<div class="dvn-wrap"><p class="dvn-hinweis">' + sicher(t.leer) + '</p></div>';
        }

        var kopf = '<div class="dvn-kennzahlen">'
            + kennzahlHtml('gleich', k.gleich, t)
            + kennzahlHtml('nurA', k.nurA, t)
            + kennzahlHtml('nurB', k.nurB, t)
            + kennzahlHtml('abweichend', k.abweichend, t)
            + '</div>';

        var spalte = function (seite, name, anzahlKarten) {
            return '<section class="dvn-spalte dvn-spalte-' + seite + '">'
                + '<h4 class="dvn-titel">' + name
                + ' <span class="dvn-summe">' + anzahlKarten + ' ' + sicher(t.karten) + '</span></h4>'
                + '<ul class="dvn-liste">'
                + vergleich.zeilen.map(function (z) { return zeileHtml(z, seite, t); }).join('')
                + '</ul></section>';
        };

        return '<div class="dvn-wrap">'
            + kopf
            + '<p class="dvn-hinweis">' + sicher(t.kopf) + '</p>'
            + (k.ohneDruck > 0
                ? '<p class="dvn-hinweis dvn-hinweis-warn">' + k.ohneDruck + ' '
                    + sicher(t.ohneDruckHinweis) + '</p>'
                : '')
            + '<div class="dvn-spalten">'
            + spalte('a', nameA, k.kartenA)
            + spalte('b', nameB, k.kartenB)
            + '</div></div>';
    }

    var api = {
        KLASSEN: KLASSEN,
        ZEICHEN: ZEICHEN,
        eintragLesen: eintragLesen,
        listeLesen: listeLesen,
        vergleiche: vergleiche,
        rendere: rendere
    };

    if (typeof window !== 'undefined') window.DeckVergleichNebeneinander = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}());
