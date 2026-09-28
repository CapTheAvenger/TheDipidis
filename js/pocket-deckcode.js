/**
 * pocket-deckcode.js — aus einer Deckliste den Scan-Code von Pokémon TCG
 * Pocket bauen (FE-11, 28.09.2026).
 *
 * ANLASS (Hausi, 27.09.2026): Pocket liest Decks nur als 2D-Muster ein,
 * es gibt keinen Textimport. Wer eine Liste als Text hat („2 Riolu B3 79"
 * je Zeile, dazu „Energy: Fighting"), soll daraus hier ein Muster
 * bekommen, das die App scannt.
 *
 * DAS FORMAT (entschlüsselt 07.09.2026 an 33 echten Codes, unabhängig
 * beschrieben in github.com/KevinGutowski/tcgp-deck-qr, docs/format.md):
 *
 *     [n] n × 3 Byte Trainer (Kennung + 10.000.000, big-endian)
 *     [m] m × 3 Byte Pokémon (Kennung, big-endian)
 *     [k] k × 1 Byte Energie (1 Pflanze … 8 Metall)
 *
 *   als Base64-Text im QR-Code. Die Kennung jeder Karte steht in
 *   data/pocket_karten_ids.json, gebaut von scripts/build_pocket_karten_ids.py.
 *
 * VERBUNDEN WIRD ÜBER (SET, NUMMER), NIE ÜBER DEN NAMEN
 * ---------------------------------------------------
 * Zwei Drucke derselben Karte können verschiedene Kennungen tragen
 * (Charmeleon B1a 12 → 12980, B2b 8 → 16140). Der Name aus der Liste
 * wird nur verglichen: weicht er ab, steht ein Hinweis da, weil eine
 * vertippte Nummer sonst still eine andere Karte ins Deck legt.
 *
 * Reine Funktionen ohne DOM — die Zusicherungen führen sie aus.
 */
(function (global) {
    'use strict';

    var TRAINER_VERSATZ = 10000000;
    var DECKGROESSE = 20;
    var HOECHSTENS_JE_NAME = 2;

    /* Energie → Byte. Drache (10) und Farblos (11) gibt es als Kartentyp,
     * aber nicht als wählbare Deck-Energie; laut tcgp-deck-qr stürzt die
     * App mit Drache im Code ab. Beide werden deshalb abgewiesen. */
    var ENERGIE = {
        grass: 1, pflanze: 1,
        fire: 2, feuer: 2,
        water: 3, wasser: 3,
        lightning: 4, elektro: 4, blitz: 4,
        psychic: 5, psycho: 5,
        fighting: 6, kampf: 6,
        darkness: 7, finsternis: 7, unlicht: 7,
        metal: 8, metall: 8
    };
    var ENERGIE_VERBOTEN = { dragon: 1, drache: 1, colorless: 1, farblos: 1 };
    var ENERGIE_NAME = { 1: 'Grass', 2: 'Fire', 3: 'Water', 4: 'Lightning',
                         5: 'Psychic', 6: 'Fighting', 7: 'Darkness', 8: 'Metal' };

    var ENERGIE_NAME_DE = { 1: 'Pflanze', 2: 'Feuer', 3: 'Wasser', 4: 'Elektro',
                            5: 'Psycho', 6: 'Kampf', 7: 'Finsternis', 8: 'Metall' };

    var SET_SCHREIBWEISEN = { 'PROMO-A': 'P-A', 'PROMOA': 'P-A', 'PA': 'P-A',
                              'PROMO-B': 'P-B', 'PROMOB': 'P-B', 'PB': 'P-B' };

    function normName(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
    }

    /* Liest die Liste. Erkannt werden Kartenzeilen „ANZAHL NAME SET NUMMER"
     * (auch mit „x" hinter der Anzahl oder Klammern um das Set) und eine
     * Energiezeile „Energy: …" / „Energie: …". Überschriften wie
     * „Pokémon: 8" oder „Trainer (12)" werden übergangen, alles Übrige
     * als nicht erkannt gemeldet — nie still verworfen. */
    function leseListe(text) {
        var karten = [], energie = [], fehler = [], zeilenNr = 0;
        String(text || '').split(/\r?\n/).forEach(function (roh) {
            zeilenNr++;
            var z = roh.replace(/ /g, ' ').trim();
            if (!z) return;
            var e = /^(energy|energie|energien|energies)\s*[:：]\s*(.*)$/i.exec(z);
            if (e) {
                e[2].split(/\s*(?:,|\/|&|\+|\band\b|\bund\b)\s*/i).forEach(function (w) {
                    var k = normName(w).replace(/\s*energy$|\s*energie$/, '');
                    if (!k) return;
                    if (ENERGIE_VERBOTEN[k]) {
                        fehler.push({ zeile: zeilenNr, art: 'energie_verboten', text: w.trim() });
                    } else if (ENERGIE[k]) {
                        if (energie.indexOf(ENERGIE[k]) < 0) energie.push(ENERGIE[k]);
                    } else {
                        fehler.push({ zeile: zeilenNr, art: 'energie_unbekannt', text: w.trim() });
                    }
                });
                return;
            }
            if (/^(pok[eé]mon|trainer|trainers|items?|supporter)\b[^0-9]*[:(]?\s*\d*\)?\s*$/i.test(z)) return;
            var m = /^(\d+)\s*[x×]?\s+(.+?)\s+\(?([A-Za-z0-9]+(?:-[A-Za-z])?)\)?\s*[-#]?\s*(\d{1,3})\s*$/.exec(z);
            if (!m) {
                fehler.push({ zeile: zeilenNr, art: 'nicht_erkannt', text: z });
                return;
            }
            karten.push({ zeile: zeilenNr, anzahl: Number(m[1]), name: m[2].trim(),
                          set: m[3], nummer: Number(m[4]) });
        });
        return { karten: karten, energie: energie, fehler: fehler };
    }

    function setSchluessel(tabelle, set) {
        var s = String(set || '').toUpperCase();
        if (SET_SCHREIBWEISEN[s]) s = SET_SCHREIBWEISEN[s];
        var sets = (tabelle && tabelle.sets) || {};
        if (sets[s]) return s;
        var treffer = Object.keys(sets).filter(function (k) { return k.toUpperCase() === s; });
        return treffer.length === 1 ? treffer[0] : null;
    }

    function base64(bytes) {
        var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var s = '', i;
        for (i = 0; i + 2 < bytes.length; i += 3) {
            var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
            s += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + abc[n & 63];
        }
        var rest = bytes.length - i;
        if (rest === 1) {
            var a = bytes[i] << 16;
            s += abc[(a >> 18) & 63] + abc[(a >> 12) & 63] + '==';
        } else if (rest === 2) {
            var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
            s += abc[(b >> 18) & 63] + abc[(b >> 12) & 63] + abc[(b >> 6) & 63] + '=';
        }
        return s;
    }

    function ausBase64(text) {
        var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var clean = String(text || '').replace(/[^A-Za-z0-9+/]/g, '');
        var out = [], puffer = 0, bits = 0;
        for (var i = 0; i < clean.length; i++) {
            puffer = (puffer << 6) | abc.indexOf(clean[i]);
            bits += 6;
            if (bits >= 8) { bits -= 8; out.push((puffer >> bits) & 255); }
        }
        return out;
    }

    /* Code → { trainer: [Kennungen], pokemon: [Kennungen], energie: [Bytes] }. */
    function lese(code) {
        var b = ausBase64(code), i = 0;
        function drei() { var v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]; i += 3; return v; }
        var nt = b[i++], tr = [], pk = [], en = [], j;
        for (j = 0; j < nt; j++) tr.push(drei() - TRAINER_VERSATZ);
        var np = b[i++];
        for (j = 0; j < np; j++) pk.push(drei());
        var ne = b[i++];
        for (j = 0; j < ne; j++) en.push(b[i++]);
        return { trainer: tr, pokemon: pk, energie: en, laenge: b.length, rest: b.length - i };
    }

    /* Liste + Tabelle → { code, pokemon, trainer, fehler, hinweise }.
     * `code` steht nur da, wenn es keinen einzigen Fehler gibt. */
    function baue(liste, tabelle) {
        var fehler = (liste.fehler || []).slice(), hinweise = [];
        var namen = (tabelle && tabelle.namen) || [];
        var pokemon = [], trainer = [], werteT = [], werteP = [], jeName = {}, summe = 0;
        (liste.karten || []).forEach(function (k) {
            if (!(k.anzahl >= 1)) {
                fehler.push({ zeile: k.zeile, art: 'anzahl', text: String(k.anzahl) });
                return;
            }
            var set = setSchluessel(tabelle, k.set);
            var eintrag = set ? (tabelle.sets[set] || [])[k.nummer - 1] : null;
            if (!eintrag) {
                fehler.push({ zeile: k.zeile, art: set ? 'karte_unbekannt' : 'set_unbekannt',
                              text: k.set + ' ' + k.nummer });
                return;
            }
            var wert = eintrag[0], name = namen[eintrag[1]] || '';
            if (normName(name) !== normName(k.name)) {
                hinweise.push({ zeile: k.zeile, art: 'name_weicht_ab',
                                text: k.name, erwartet: name, karte: set + ' ' + k.nummer });
            }
            var schl = normName(name);
            jeName[schl] = jeName[schl] || { name: name, anzahl: 0 };
            jeName[schl].anzahl += k.anzahl;
            summe += k.anzahl;
            var istTrainer = wert >= TRAINER_VERSATZ;
            var karte = { name: name, anzahl: k.anzahl, set: set, nummer: ('00' + k.nummer).slice(-3) };
            (istTrainer ? trainer : pokemon).push(karte);
            for (var i = 0; i < k.anzahl; i++) (istTrainer ? werteT : werteP).push(wert);
        });
        Object.keys(jeName).forEach(function (n) {
            if (jeName[n].anzahl > HOECHSTENS_JE_NAME) {
                fehler.push({ art: 'zu_viele', text: jeName[n].name, anzahl: jeName[n].anzahl });
            }
        });
        if (summe !== DECKGROESSE && !fehler.some(function (f) { return /unbekannt|nicht_erkannt/.test(f.art); })) {
            fehler.push({ art: 'deckgroesse', anzahl: summe });
        }
        if (!werteP.length && (liste.karten || []).length) fehler.push({ art: 'keine_pokemon' });
        var en = liste.energie || [];
        if (!en.length) fehler.push({ art: 'energie_fehlt' });
        if (en.length > 3) fehler.push({ art: 'energie_zu_viele', anzahl: en.length });

        var ergebnis = { pokemon: pokemon, trainer: trainer, fehler: fehler, hinweise: hinweise,
                         energie: en.map(function (e) { return ENERGIE_NAME[e]; }),
                         energieDe: en.map(function (e) { return ENERGIE_NAME_DE[e]; }) };
        if (fehler.length) return ergebnis;

        var bytes = [werteT.length];
        werteT.forEach(function (v) { bytes.push((v >> 16) & 255, (v >> 8) & 255, v & 255); });
        bytes.push(werteP.length);
        werteP.forEach(function (v) { bytes.push((v >> 16) & 255, (v >> 8) & 255, v & 255); });
        bytes.push(en.length);
        en.forEach(function (e) { bytes.push(e); });
        ergebnis.code = base64(bytes);
        return ergebnis;
    }

    global.PocketDeckcode = {
        leseListe: leseListe, baue: baue, lese: lese,
        ENERGIE_NAME: ENERGIE_NAME, TRAINER_VERSATZ: TRAINER_VERSATZ
    };
}(typeof window !== 'undefined' ? window : this));
