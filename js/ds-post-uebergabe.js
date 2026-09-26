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
 *
 * ══════════════════════════════════════════════════════════════════
 * DER BESTAND (26.09.2026) — EIN STÜCK GENÜGT NICHT MEHR
 * ══════════════════════════════════════════════════════════════════
 *
 * BESTELLT (Betreiber): „Wenn ich also auf Decks, dann sollte danach die
 * nächste Option My Decks sein. Dann zeigt er mir im nächsten Filter
 * genau meine Decks an, aus denen ich wählen kann. […] Hauptfeature
 * Metacall, und da habe ich dann die Möglichkeit zu wählen zwischen
 * Standardprognose oder bearbeiteter Prognose, und dann bei der
 * bearbeiteten Prognose werden dann meine gespeicherten Metacalls
 * angezeigt. […] Battle Journal, und da kann ich dann einfach das
 * entsprechende Turnier auswählen."
 *
 * Bis heute übergab die App EIN Stück: das angeklickte Deck, das
 * angeklickte Turnier, den offenen Meta Call. Eine Auswahlliste auf der
 * Post-Seite kann daraus nicht entstehen — sie hätte genau einen
 * Eintrag, und der Betreiber müsste für jedes zweite Deck in die App
 * zurück und wieder auf „Post-Seite" drücken.
 *
 * Deshalb liegt neben dem EINEN Stück jetzt der BESTAND: je Art eine
 * Liste. Drei getrennte Schlüssel, nicht einer — ein Meta Call ist
 * hundertmal so groß wie ein Deck, und wenn die Meta Calls den Platz
 * sprengen, sollen die Decks trotzdem dastehen.
 *
 * Der alte Schlüssel bleibt unverändert und behält seine Bedeutung
 * („das hier wollte er gerade"). Er entscheidet weiter, was die
 * Post-Seite beim Öffnen vorschlägt.
 *
 * WAS PASSIERT, WENN ES NICHT PASST: die Liste wird gekürzt, und die
 * Zahl der weggelassenen Einträge steht als `gekuerzt` daneben. Die
 * Post-Seite sagt es dann — ein stilles Fehlen wäre eine Auswahl, die
 * behauptet, vollständig zu sein.
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

    /* Der Bestand je Art unter eigenem Schluessel — siehe Kopf. */
    var BESTAND = 'dipidis.post.bestand.v1.';
    /* Gemessen am 26.09.2026: ein Deck rund 3,5 KB (25 Schluessel plus
     * Bildadressen), ein Turnier rund 3 KB, ein gerechneter Meta-Call-
     * Stand rund 10 KB. 700 KB je Art tragen damit ~200 Decks, ~230
     * Turniere oder ~35 Meta Calls — mehr, als der Betreiber hat, und
     * zusammen unter der Haelfte der ueblichen 5-MB-Grenze des
     * Ursprungs, in dem auch die Szenarien und die Anmeldung liegen. */
    var BESTAND_HOECHSTENS = 700 * 1024;

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

    /* ── DER BESTAND ──────────────────────────────────────────────────
     *
     * `legen` bleibt, was es war: EIN Stueck, der Vorschlag beim
     * Oeffnen. `bestandLegen` ist die Liste, aus der die Post-Seite
     * waehlen laesst. Beides zugleich ist der Normalfall — die App weiss
     * in dem Moment ohnehin alles.
     *
     * GEKUERZT WIRD VON HINTEN. Der Aufrufer uebergibt in der Reihenfolge,
     * in der die App die Stuecke zeigt (zuletzt geaendert zuerst). Wer
     * kuerzen muss, laesst also das weg, was am weitesten unten stand. */
    function bestandLegen(art, liste) {
        if (!ARTEN[art]) return { ok: false, grund: 'art' };
        var s = speicher();
        if (!s) return { ok: false, grund: 'kein-speicher' };
        var rein = (liste || []).filter(function (e) {
            return e && e.daten && typeof e.daten === 'object';
        }).map(function (e) {
            return { titel: String(e.titel || ''), daten: e.daten };
        });

        var gekuerzt = 0;
        var paket = null;
        while (true) {
            try {
                paket = JSON.stringify({
                    v: FASSUNG, stand: jetzt(), gekuerzt: gekuerzt, liste: rein
                });
            } catch (e) { return { ok: false, grund: 'nicht-darstellbar' }; }
            if (paket.length <= BESTAND_HOECHSTENS || !rein.length) break;
            rein = rein.slice(0, rein.length - 1);
            gekuerzt++;
        }
        try { s.setItem(BESTAND + art, paket); } catch (e) {
            return { ok: false, grund: 'speicher-voll' };
        }
        return { ok: true, groesse: paket.length, anzahl: rein.length, gekuerzt: gekuerzt };
    }

    function bestandEiner(art) {
        var s = speicher();
        if (!s || !ARTEN[art]) return { liste: [], gekuerzt: 0, stand: '' };
        var roh = null;
        try { roh = s.getItem(BESTAND + art); } catch (e) { return { liste: [], gekuerzt: 0, stand: '' }; }
        if (!roh) return { liste: [], gekuerzt: 0, stand: '' };
        var p = null;
        try { p = JSON.parse(roh); } catch (e) { p = null; }
        /* Dieselbe Strenge wie bei `holen`: eine fremde Fassung wird
         * nicht gedeutet. Ein halb verstandener Bestand ergibt eine
         * Auswahlliste mit Loechern, und die faellt erst beim Klick auf. */
        if (!p || p.v !== FASSUNG || !Array.isArray(p.liste)) {
            return { liste: [], gekuerzt: 0, stand: '' };
        }
        return {
            liste: p.liste.filter(function (e) { return e && e.daten; }),
            gekuerzt: parseInt(p.gekuerzt, 10) || 0,
            stand: String(p.stand || '')
        };
    }

    function bestand() {
        return {
            deck: bestandEiner('deck'),
            turnier: bestandEiner('turnier'),
            metacall: bestandEiner('metacall')
        };
    }

    /* Ein Zug: Bestand hinlegen, das gewaehlte Stueck als Vorschlag
     * daneben, Fenster auf. Die drei Aufrufer in der App taten das
     * vorher in drei Zeilen, und die dritte davon fehlte zweimal. */
    function oeffnenMitBestand(art, titel, daten, liste) {
        var b = bestandLegen(art, liste);
        var erg = oeffnen(art, titel, daten);
        erg.bestand = b;
        return erg;
    }

    window.DsPostUebergabe = {
        SCHLUESSEL: SCHLUESSEL,
        BESTAND: BESTAND,
        BESTAND_HOECHSTENS: BESTAND_HOECHSTENS,
        bestandLegen: bestandLegen,
        bestand: bestand,
        oeffnenMitBestand: oeffnenMitBestand,
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
