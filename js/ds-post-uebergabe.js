/* ══════════════════════════════════════════════════════════════════════
 * DIE ÜBERGABE AN DIE POST-SEITE
 * ══════════════════════════════════════════════════════════════════════
 *
 * BESTELLT (Betreiber, 25.09.2026): „ich hätte in My Decks gerne direkt
 * eine Posts Option, damit ich es bei Instagram posten kann in meinem
 * festgelegten Design oder zumindest auf der Posts Seite, dass ich das
 * Deck dort aufrufen kann und es posten kann … und gleiches gilt für den
 * Battle Journal."
 *
 * WARUM EINE ÜBERGABE UND KEIN AUFRUF MIT PARAMETERN
 * ---------------------------------------------------
 * posts/index.html ist eine eigenständige Seite ohne Anmeldung. Das Deck
 * und das Turnier liegen im Konto des Betreibers (Firestore) — die Seite
 * käme nie daran. Beide liegen aber im selben Ursprung
 * (thedipidis.app), und damit ist der lokale Speicher der kürzeste
 * ehrliche Weg: die App legt ab, die Post-Seite nimmt auf.
 *
 * Eine Adresse mit Parametern schied aus. Eine Deckliste sind rund 25
 * Schlüssel mit Set und Nummer; das wären über 800 Zeichen in der URL,
 * die in jedem Verlauf, jedem Protokoll und jeder Weitergabe stehen —
 * und die Sicherheitsregel dieses Hauses sagt ausdrücklich, dass keine
 * persönlichen Daten in Adressparameter gehören.
 *
 * WAS ÜBERGEBEN WIRD
 * ------------------
 * Nur das, was das Bild braucht: Titel, Archetyp, Kartenschlüssel mit
 * Stückzahl — beim Turnier zusätzlich Ergebnis und Format. KEINE
 * Kennungen aus dem Konto, keine Adresse, kein Name des Nutzers. Die
 * Post-Seite soll ein Bild malen, keine Akte führen.
 *
 * WAS SIE NICHT TUT
 * -----------------
 * Sie veröffentlicht nichts. Direkt bei Instagram posten kann eine Seite
 * ohne Server und ohne Instagram-Business-Konto nicht; wer etwas anderes
 * behauptet, hat es nicht versucht. Der Weg ist: Bild erzeugen →
 * Teilen-Dialog des Geräts → Instagram. Genau dafür zeigt
 * js/ds-bildvorschau.js das Bild erst an, statt es wortlos zu speichern.
 * ══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var SCHLUESSEL = 'dipidis.post.uebergabe.v1';
    var FASSUNG = 1;
    /* Ein Deck sind wenige Kilobyte. Die Grenze ist kein Sparzwang,
     * sondern ein Riegel: was hier nicht hineinpasst, ist nicht das,
     * wofür die Übergabe gedacht ist. Der lokale Speicher liegt je nach
     * Browser bei 5 MB für den ganzen Ursprung — den soll ein Post
     * nicht auffressen. */
    var HOECHSTENS = 200 * 1024;
    var ARTEN = { deck: true, turnier: true, metacall: true };

    function jetzt() {
        try { return new Date().toISOString(); } catch (e) { return ''; }
    }

    function speicher() {
        /* Im privaten Fenster wirft schon der Zugriff. Dann gibt es eben
         * keine Übergabe — das wird gesagt, nicht verschluckt. */
        try {
            var s = window.localStorage;
            if (!s) return null;
            s.setItem(SCHLUESSEL + '.probe', '1');
            s.removeItem(SCHLUESSEL + '.probe');
            return s;
        } catch (e) { return null; }
    }

    function legen(art, titel, daten) {
        if (!ARTEN[art]) return { ok: false, grund: 'art' };
        var s = speicher();
        if (!s) return { ok: false, grund: 'kein-speicher' };
        var paket;
        try {
            paket = JSON.stringify({
                v: FASSUNG, art: art, stand: jetzt(),
                titel: String(titel || ''), daten: daten || {}
            });
        } catch (e) { return { ok: false, grund: 'nicht-darstellbar' }; }
        if (paket.length > HOECHSTENS) return { ok: false, grund: 'zu-gross' };
        try { s.setItem(SCHLUESSEL, paket); } catch (e) {
            return { ok: false, grund: 'speicher-voll' };
        }
        return { ok: true, groesse: paket.length };
    }

    function holen(opt) {
        opt = opt || {};
        var s = speicher();
        if (!s) return null;
        var roh = null;
        try { roh = s.getItem(SCHLUESSEL); } catch (e) { return null; }
        if (!roh) return null;
        var p = null;
        try { p = JSON.parse(roh); } catch (e) { p = null; }
        /* Eine Übergabe aus einer anderen Fassung wird NICHT gedeutet.
         * Ein halb verstandenes Paket malt ein halb richtiges Bild. */
        if (!p || p.v !== FASSUNG || !ARTEN[p.art]) return null;
        if (opt.loeschen) { try { s.removeItem(SCHLUESSEL); } catch (e) { /* egal */ } }
        return p;
    }

    function vergessen() {
        var s = speicher();
        if (!s) return false;
        try { s.removeItem(SCHLUESSEL); return true; } catch (e) { return false; }
    }

    /* Die Adresse der Post-Seite, von der App aus gerechnet. Kein fester
     * Pfad: die Seite liegt unter /posts/ neben index.html, und eine
     * absolute Adresse wäre beim ersten Umzug falsch. */
    function postSeite() {
        try {
            return new URL('posts/index.html#uebergabe', window.location.href).href;
        } catch (e) {
            return 'posts/index.html#uebergabe';
        }
    }

    function oeffnen(art, titel, daten) {
        var erg = legen(art, titel, daten);
        if (!erg.ok) return erg;
        try {
            var w = window.open(postSeite(), '_blank', 'noopener');
            /* Ein blockiertes Pop-up ist kein stiller Fehlschlag: die
             * Übergabe liegt, nur das Fenster fehlt. Der Aufrufer sagt
             * dann, wo sie zu finden ist. */
            if (!w) return { ok: true, fenster: false, adresse: postSeite() };
        } catch (e) {
            return { ok: true, fenster: false, adresse: postSeite() };
        }
        return { ok: true, fenster: true, adresse: postSeite() };
    }

    /* DIE BILDADRESSEN GEHEN MIT.
     *
     * Die Post-Seite hat die Kartendatenbank nicht — sie koennte eine
     * Adresse nur aus Set und Nummer RATEN, und bei japanischen Sets,
     * Prize-Pack-Drucken und Proxy-Ersatz raet sie falsch. Die App weiss
     * es (getUnifiedCardImage), also schickt sie es mit. Fehlt eine
     * Adresse, traegt die Kachel drueben den Namen — das ist der Fall,
     * den die Kachel ohnehin kennt. */
    function bildAdressen(karten) {
        var aus = {};
        var f = window.getUnifiedCardImage;
        if (typeof f !== 'function') return aus;
        Object.keys(karten || {}).forEach(function (k) {
            var m = String(k).match(/^(.*?)\s*\(([^()\s]+)\s+([^()\s]+)\)\s*$/);
            if (!m) return;
            var url = '';
            try { url = f(m[2], m[3]) || ''; } catch (e) { url = ''; }
            if (url) aus[k] = url;
        });
        return aus;
    }

    /* Aus einem gespeicherten Deck („Meine Decks") wird das, was das Bild
     * braucht — und nichts weiter. */
    function ausDeck(deck) {
        if (!deck || !deck.cards) return null;
        var karten = {};
        Object.keys(deck.cards).forEach(function (k) {
            var n = parseInt(deck.cards[k], 10) || 0;
            if (n > 0) karten[k] = n;
        });
        if (!Object.keys(karten).length) return null;
        return {
            titel: String(deck.name || deck.archetype || ''),
            archetyp: String(deck.archetype || ''),
            karten: karten,
            bilder: bildAdressen(karten),
            gesamt: Object.keys(karten).reduce(function (s, k) { return s + karten[k]; }, 0)
        };
    }

    window.DsPostUebergabe = {
        SCHLUESSEL: SCHLUESSEL,
        FASSUNG: FASSUNG,
        HOECHSTENS: HOECHSTENS,
        legen: legen,
        holen: holen,
        vergessen: vergessen,
        oeffnen: oeffnen,
        ausDeck: ausDeck,
        bildAdressen: bildAdressen,
        postSeite: postSeite
    };
})();
