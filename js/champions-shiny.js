/* Welche Champions-Pokemon der Nutzer schon als Shiny besitzt.
 *
 * Ein Stern je Eintrag, mehr nicht — so vom Betreiber am 09.09.2026
 * entschieden ("nur Shiny im Besitz", nicht zusaetzlich normal gefangen
 * oder eine Wunschliste).
 *
 * ZWEI SPEICHER, UND ZWAR IN DIESER REIHENFOLGE:
 *
 *   1. localStorage — immer. Der Stern muss auch ohne Anmeldung und ohne
 *      Netz sofort haften; wer im Zug durch das Raster tippt, will nicht
 *      erst ein Konto anlegen.
 *   2. Das Nutzerdokument in Firestore — nur wenn angemeldet, ueber
 *      window.updateUserDoc({ championsShiny: [...] }). Das ist ein
 *      update() auf GENAU dieses eine Feld; Sammlung, Wunschliste,
 *      Tradelist und Decks werden dabei nicht angefasst.
 *
 * BEIM ANMELDEN WIRD VEREINIGT, NICHT ERSETZT. Wer auf dem Telefon zehn
 * Sterne setzt und sich danach am Rechner anmeldet, haette bei einem
 * "Wolke gewinnt" zehn Sterne verloren. Ein Stern ist eine Aussage ueber
 * die Wirklichkeit ("ich habe das Vieh"), und die verschwindet nicht,
 * weil ein zweites Geraet nichts davon weiss. Loeschen geht deshalb nur
 * ueber den bewussten Klick auf einen gesetzten Stern.
 *
 * SCHLUESSEL: "<dex>|Base" fuer eine Art samt ALLEN ihren Mega-Formen,
 * "<dex>|R:<englischer Name>" fuer eine Regionalform.
 *
 * WARUM MEGA MIT DER GRUNDFORM ZUSAMMENFAELLT (15.09.2026)
 * -------------------------------------------------------
 * Der Betreiber hat es entschieden, und die Begruendung ist die des
 * Spiels: "sobald ich eine Form markiere soll das automatisch fuer alle
 * gelten, da es ja das gleiche Pokemon ist und sich nur durch ein Item
 * entwickelt". Eine Mega-Form faengt man nicht — man entwickelt sie aus
 * der Art, die man schon hat. Wer Mega-Tandrak besitzt, besitzt Tandrak.
 *
 * Der Stern beantwortet "habe ich das Vieh", und darauf gibt es je Art
 * genau eine Antwort. Das ist nicht bloss Bequemlichkeit: der Filter
 * "noch offen" soll sagen, was man BESORGEN muss — und eine Mega-Form
 * besorgt man nicht.
 *
 * WARUM REGIONAL- UND GESCHLECHTSFORMEN NICHT ZUSAMMENFALLEN
 * ---------------------------------------------------------
 * Alola-Vulnona ist kein Vulnona, das man mit einem Item umwandelt; es
 * ist ein eigenes Vieh, das man eigens besorgen muss. Dieselbe
 * Pokedex-Nummer, andere Sache. Die drei Paldea-Tauros teilen sich sogar
 * Nummer UND Form-Kennung ("128|Regional") — deshalb steht bei
 * Regionalformen der Name im Schluessel und nicht die Form-Kennung.
 *
 * Seit dem 15.09.2026 gilt dasselbe fuer Geschlechtsformen. Ein
 * weibliches Salmagnis entsteht nicht aus einem maennlichen: es hat
 * eigene Basiswerte (Angriff 92 statt 112, Spezial-Angriff 100 statt 80)
 * und eine eigene Zeile in der Ranglistenauswertung. Wer beide besitzen
 * will, muss beide besorgen — also zwei Sterne.
 *
 * MESSUNG, die dem zugrunde liegt (Stand 306 Eintraege):
 *   form "Base"      213   darunter die drei Mega-Z-Eintraege, die schon
 *                          vorher mit ihrer Grundform zusammenfielen
 *   form "Mega"       78   KEINER davon traegt einen Regionalnamen — das
 *                          Zusammenfallen kann also keine Regionalform
 *                          verschlucken
 *   form "Regional"   15   davon drei Paldea-Tauros auf einer Nummer
 *
 * Seit dem 15.09.2026 kommt form "Geschlecht" dazu (3 Eintraege:
 * Salmagnis, Servol und Psiaugon je weiblich); der Pokedex fuehrt
 * seither 316 Eintraege.
 */
(function () {
    'use strict';

    var SCHLUESSEL = 'championsShinyV1';
    var FELD = 'championsShiny';

    var _set = null;          // Set<string> — null solange nicht geladen
    var _wolkeGelesen = false;

    /* FORMEN, DIE MAN EIGENS BESORGEN MUSS.
     *
     * Regionalform: Alola-Vulnona ist kein Vulnona mit Item.
     * Geschlechtsform: ein weibliches Salmagnis wird nicht aus einem
     *   maennlichen; es hat eigene Basiswerte (Angriff 92 statt 112,
     *   Spezial-Angriff 100 statt 80) und eine eigene Nutzungszeile.
     *   Aufgenommen am 15.09.2026 mit der Trennung der Geschlechter.
     *
     * Beide tragen deshalb ihren NAMEN im Schluessel — nicht die
     * Form-Kennung. Die drei Paldea-Tauros teilen sich Nummer UND
     * Kennung; ueber die Kennung waeren sie ein einziger Stern. */
    var EIGENE_ART = { Regional: 1, Geschlecht: 1 };

    function eintragSchluessel(e) {
        if (!e) return '';
        var dex = (e.dex != null) ? e.dex : '';
        var form = e.form || 'Base';
        if (EIGENE_ART[form]) return dex + '|R:' + (e.en || '');
        // Alles andere — Grundform, Mega, Mega X/Y/Z — ist dieselbe Art.
        return dex + '|Base';
    }

    /* ALTE STERNE MITNEHMEN, NICHT WEGWERFEN.
     *
     * Bis zum 15.09.2026 hiess der Schluessel "<dex>|<form>". Wer die
     * Sterne einfach neu schluesselt, ohne die alten umzuschreiben,
     * loescht den Bestand — und ein Stern ist eine Aussage ueber die
     * Wirklichkeit ("ich habe das Vieh"), die nicht verschwindet, weil
     * sich ein Datenformat geaendert hat (siehe Kopf dieser Datei).
     *
     *   "<dex>|Base"      bleibt, wie es ist
     *   "<dex>|Mega"      wird zu "<dex>|Base"  — genau die Regel, die
     *                     der Betreiber bestellt hat
     *   "<dex>|Regional"  laesst sich OHNE den Pokedex nicht aufloesen;
     *                     welche Regionalform gemeint war, steht im alten
     *                     Schluessel nicht drin. Er bleibt deshalb stehen
     *                     und wird von aufloesen() nachgezogen, sobald
     *                     der Pokedex da ist.
     */
    var ALT_MEGA = /^(\d+)\|Mega$/;
    var ALT_REGIONAL = /^(\d+)\|Regional$/;

    function wandleAlte(s) {
        var geaendert = false;
        [...s].forEach(function (k) {
            var m = ALT_MEGA.exec(k);
            if (!m) return;
            s.delete(k);
            s.add(m[1] + '|Base');
            geaendert = true;
        });
        return geaendert;
    }

    /* Die verbliebenen "<dex>|Regional" aufloesen, sobald der Pokedex
     * vorliegt. Eine Nummer kann mehrere Regionalformen tragen (128 traegt
     * drei); dann galten vorher ALLE als markiert, weil sie sich einen
     * Schluessel teilten. Genau das wird uebernommen — der Nutzer hat
     * diesen Zustand gesehen, und ihm hier still einen Stern wegzunehmen
     * waere schlimmer als einer zu viel. */
    function aufloesen(eintraege) {
        var s = lies();
        var geaendert = false;
        [...s].forEach(function (k) {
            var m = ALT_REGIONAL.exec(k);
            if (!m) return;
            var nummer = Number(m[1]);
            var treffer = (eintraege || []).filter(function (e) {
                return e && Number(e.dex) === nummer && (e.form || 'Base') === 'Regional';
            });
            if (!treffer.length) return;   // ohne Treffer bleibt der alte Schluessel stehen
            s.delete(k);
            treffer.forEach(function (e) { s.add(eintragSchluessel(e)); });
            geaendert = true;
        });
        if (geaendert) { schreibeLokal(); schreibeWolke(); }
        return geaendert;
    }

    function lies() {
        if (_set) return _set;
        _set = new Set();
        try {
            var roh = localStorage.getItem(SCHLUESSEL);
            if (roh) {
                var arr = JSON.parse(roh);
                if (Array.isArray(arr)) arr.forEach(function (k) { _set.add(String(k)); });
            }
        } catch (_e) { /* privater Modus, geleerter Speicher — leer ist ok */ }
        if (wandleAlte(_set)) schreibeLokal();
        return _set;
    }

    function schreibeLokal() {
        try {
            localStorage.setItem(SCHLUESSEL, JSON.stringify([...lies()]));
        } catch (_e) { /* Speicher voll oder gesperrt: der Stern bleibt fuer diese Sitzung */ }
    }

    function schreibeWolke() {
        if (typeof window.updateUserDoc !== 'function') return Promise.resolve(false);
        var auth = window.auth || (window.firebase && window.firebase.auth && window.firebase.auth());
        if (!auth || !auth.currentUser) return Promise.resolve(false);
        var payload = {};
        payload[FELD] = [...lies()];
        return Promise.resolve(window.updateUserDoc(payload))
            .then(function () { return true; })
            .catch(function (err) {
                // Nicht verschlucken: der Stern steht lokal, aber der Nutzer
                // soll wissen, dass er nicht am zweiten Geraet ankommt.
                console.warn('[champions-shiny] Wolke nicht geschrieben:', err && err.message);
                return false;
            });
    }

    function hat(e) { return lies().has(eintragSchluessel(e)); }

    function umschalten(e) { return umschaltenSchluessel(eintragSchluessel(e)); }

    /* Umschalten ueber den fertigen Schluessel.
     *
     * Die Oberflaeche traegt ihn ohnehin am Sternknopf (data-sqp-stern) —
     * und sie MUSS ihn tragen: seit eine Regionalform ihren Namen im
     * Schluessel hat, laesst er sich aus "<dex>|<form>" nicht mehr
     * zurueckrechnen. Wer ihn aus zwei Bruchstuecken neu baut, erzeugt
     * fuer jede Regionalform "<dex>|R:" ohne Namen — einen Schluessel, der
     * auf alles und nichts passt. */
    function umschaltenSchluessel(k) {
        if (!k) return false;
        var s = lies();
        if (s.has(k)) s.delete(k); else s.add(k);
        schreibeLokal();
        schreibeWolke();
        try {
            document.dispatchEvent(new CustomEvent('championsShinyChanged',
                { detail: { schluessel: k, gesetzt: s.has(k), anzahl: s.size } }));
        } catch (_e) { /* ohne DOM (Testlauf) gibt es nichts zu melden */ }
        return s.has(k);
    }

    function anzahl() { return lies().size; }

    /* Einmal je Sitzung aus dem Nutzerdokument nachladen und VEREINIGEN. */
    function ausWolkeLaden() {
        if (_wolkeGelesen) return Promise.resolve(anzahl());
        var auth = window.auth || (window.firebase && window.firebase.auth && window.firebase.auth());
        var db = window.db;
        if (!auth || !auth.currentUser || !db) return Promise.resolve(anzahl());
        _wolkeGelesen = true;
        return db.collection('users').doc(auth.currentUser.uid).get()
            .then(function (doc) {
                var d = doc && doc.exists ? doc.data() : null;
                var fern = (d && Array.isArray(d[FELD])) ? d[FELD] : [];
                var s = lies();
                var vorher = s.size;
                fern.forEach(function (k) { s.add(String(k)); });
                // Ein zweites Geraet kann noch mit dem alten Stand laufen
                // und alte Schluessel schicken; die werden hier genauso
                // umgeschrieben wie die aus dem lokalen Speicher.
                wandleAlte(s);
                if (s.size !== vorher) {
                    schreibeLokal();
                    try {
                        document.dispatchEvent(new CustomEvent('championsShinyChanged',
                            { detail: { schluessel: null, gesetzt: null, anzahl: s.size } }));
                    } catch (_e) { /* ohne DOM nichts zu melden */ }
                }
                // Was nur lokal stand, gehoert jetzt auch in die Wolke.
                if (s.size !== fern.length) schreibeWolke();
                return s.size;
            })
            .catch(function (err) {
                console.warn('[champions-shiny] Wolke nicht gelesen:', err && err.message);
                return anzahl();
            });
    }

    window.ChampionsShiny = {
        schluessel: eintragSchluessel,
        hat: hat,
        umschalten: umschalten,
        umschaltenSchluessel: umschaltenSchluessel,
        anzahl: anzahl,
        alle: function () { return [...lies()]; },
        aufloesen: aufloesen,
        ausWolkeLaden: ausWolkeLaden,
        _speicherSchluessel: SCHLUESSEL,
        _feld: FELD,
    };
})();
