/* ══════════════════════════════════════════════════════════════════════
 * TECH-IDEEN — Karten AUSSERHALB des Archetyps, die laut Kartentext
 * gegen ein schlechtes Matchup helfen könnten
 * ══════════════════════════════════════════════════════════════════════
 *
 * ANLASS (05.09.2026). Der Betreiber zu den Tech-Vorschlägen des Bauers:
 *
 *     "naja wenn es nichts gibt dann gibt es nichts aber vorschlagen
 *      kann man ja trotzdem Karten weil vll kommt man ja so auf Ideen
 *      für eine Deck Anpassung"
 *
 * und auf die Rückfrage, wie weit gesucht werden soll:
 *
 *     "Auch formatweit vorschlagen"
 *
 * DIE TRENNUNG IST DER GANZE PUNKT
 * ---------------------------------
 * Es gibt jetzt ZWEI Blöcke, und sie dürfen nie zu einem werden:
 *
 *   (1) BELEG — "Knapp nicht hineingepasst" im Warum-Dialog des Bauers.
 *       Karten, die andere Spieler in DIESEM Archetyp auf einem Major
 *       gespielt haben, mit Anteil und Platzierung. Das ist gemessen.
 *
 *   (2) IDEE — dieser Baustein. Karten, die im Archetyp NIEMAND spielt
 *       und für die es folglich KEINEN Beleg gibt. Was hier steht, ist
 *       eine Ableitung aus Kartentext: "diese Fähigkeit schaltet jene
 *       Fähigkeit ab". Ob die Karte ins Deck passt, ob die Energie
 *       reicht, ob der Platz da ist — all das weiß dieser Baustein
 *       nicht und behauptet es auch nicht.
 *
 * Wer die beiden Blöcke zusammenzieht, macht aus einer Idee einen Beleg.
 * Deshalb tragen die Vorschläge hier ausdrücklich KEINEN Anteil, KEINE
 * Platzierung und KEINE Siegquote: es gibt keine. Eine Zahl daneben
 * würde genau die Belegkraft vortäuschen, die fehlt.
 *
 * WORAUF DIE ABLEITUNG BERUHT
 * ---------------------------
 * Auf `js/card-capability-engine.js` — derselben Maschine, die im
 * Current-Meta-Tab die "erkannten Tech-Interaktionen" im EIGENEN Deck
 * findet. Sie liest Kartentexte über Muster
 * (data/card_capability_patterns.json) und schlägt Paare in
 * data/card_capability_interactions.json nach.
 *
 * NEU ist nur die Richtung: statt "welche meiner Karten schlägt etwas
 * beim Gegner" fragt dieser Baustein "welche Karte DES FORMATS würde
 * etwas beim Gegner schlagen, das meine noch nicht schlagen".
 *
 * DIE GRENZEN, UND SIE STEHEN AUCH IN DER OBERFLÄCHE
 * ---------------------------------------------------
 * `card_capability_interactions.json` trägt Version 0.1 vom 15.05.2026
 * und kennt genau FÜNF Paarungen. Das ist keine Formatabdeckung, das
 * ist ein Anfang. Wer hier nichts findet, hat deshalb nicht "keine
 * Optionen" — er hat "keine Optionen, die diese fünf Regeln kennen".
 * `datenstand()` gibt Version und Datum heraus, damit die Oberfläche
 * das hinschreiben kann statt es zu verschweigen.
 *
 * Der Kandidatenkreis ist ebenfalls bewusst eng: nur Karten, die im
 * laufenden Format tatsächlich GESPIELT werden
 * (data/current_meta_card_data.csv, 517 Stück). Die 20.419 Karten aus
 * pokemon_card_effects.json wären zwar mehr, aber die meisten sind im
 * Format nicht legal — ein Vorschlag, den man nicht spielen darf, ist
 * schlechter als keiner.
 */
(function () {
'use strict';

var STAND = { version: null, datum: null, interaktionen: 0 };

/* Wieviele Vorschläge je Gegner. Mehr als drei liest niemand, und ab
   dem vierten steht ohnehin die schwächste Ableitung da. */
var PRO_GEGNER = 3;

/* Ab welcher Siegquote ein Matchup als schlecht gilt. 47 % und nicht
   50 %: bei 48-49 % entscheidet die Spielstärke, nicht die Kartenwahl,
   und ein Vorschlag dort wäre Rauschen. */
var SCHLECHT_AB = 47.0;

/* Wie viele Partien hinter einem Matchup stehen müssen, damit es
   überhaupt zählt. Unter 30 ist die Quote Zufall — dieselbe Schwelle,
   die auch die Heatmap kursiv setzt (dort: 10) mal drei, weil hier
   eine EMPFEHLUNG daran hängt und nicht nur eine Anzeige. */
var MIN_PARTIEN = 30;

function _text(pfad) {
    return fetch(pfad, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(pfad + ' — HTTP ' + r.status);
        return r.text();
    });
}

/* Ein CSV mit ';' und deutschem Dezimalkomma, wie der Rest der
   data/-Dateien. Absichtlich kein eigener Parser für Anführungszeichen:
   diese beiden Dateien haben keine. */
function _csv(text) {
    var zeilen = String(text).replace(/^﻿/, '').split('\n').filter(function (z) { return z.trim(); });
    if (!zeilen.length) return [];
    var kopf = zeilen[0].replace(/\r$/, '').split(';');
    return zeilen.slice(1).map(function (z) {
        var t = z.replace(/\r$/, '').split(';'), o = {};
        kopf.forEach(function (k, i) { o[k] = t[i]; });
        return o;
    });
}

/* DIE ARCHETYPNAMEN DER BEIDEN DATEIEN SIND NICHT DIESELBEN.
 *
 * BEFUND (05.09.2026, beim ersten Lauf): `current_meta_card_data.csv`
 * schreibt "Toucannon Pbl", "Dhelmise Pbl", "Basic Box M",
 * "Beedrill Ex Cri" — mit Set-Kürzel am Ende. Die Matchup-Datei
 * schreibt "Toucannon", "Dhelmise", "Basic Box". Ein Vergleich auf
 * Gleichheit findet die Hälfte nicht, und zwar STILL: der Gegner fällt
 * einfach aus der Liste, und das sieht aus wie "keine Idee gefunden".
 *
 * Geraten wird hier nichts. `window.normalizeArchetypeForMatch` ist
 * die Brücke, die die Seite für genau diesen Zweck schon führt
 * (js/app-meta-cards.js) — sie streicht Apostrophe, das "ex" und die
 * bekannten Set-Kürzel. Fehlt sie, fällt dieser Baustein auf einen
 * Vergleich der Rohnamen zurück und findet dann eben weniger; er
 * erfindet keine eigene Ähnlichkeitsregel. */
function _normArch(name) {
    var roh = String(name || '').trim();
    if (!roh) return '';
    if (typeof window.normalizeArchetypeForMatch === 'function') {
        try { return window.normalizeArchetypeForMatch(roh); } catch (_e) { /* Rueckfall */ }
    }
    return roh.toLowerCase();
}

function _zahl(s) {
    var n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
    return isFinite(n) ? n : NaN;
}

/* SET|nummer — der Schlüssel, unter dem pokemon_card_effects.json
   liegt. NIEMALS über den Namen verbinden: die Hausregel in CLAUDE.md
   steht dort, weil PBL vier Produkte "Mega Darkrai ex" führt. Der Name
   dient hier nur als Rückfall für Karten ohne Set-Angabe, und der
   Rückfall ist in der Engine, nicht hier. */
function _schluessel(zeile) {
    var set = String(zeile.set_code || '').toUpperCase().trim();
    var nr  = String(zeile.set_number || '').trim();
    return (set && nr) ? (set + '|' + nr) : '';
}

/* Wieviele Gegner höchstens gezeigt werden. Drei Überschriften mit je
   drei Karten sind neun Zeilen — mehr liest im Warum-Dialog niemand,
   der eigentlich seine Liste ansehen wollte. */
var MAX_GEGNER = 3;

/* Trägt dieser Gegner überhaupt eine Karte, an der eine Regel greifen
   könnte? Die Antwort wird je Gegner einmal gerechnet und behalten. */
var _ansatz = new Map();
function _hatAnsatzpunkt(daten, gegnerKey) {
    if (_ansatz.has(gegnerKey)) return _ansatz.get(gegnerKey);
    var E = window.CardCapabilityEngine;
    var karten = daten.proArchetyp.get(gegnerKey) || [];
    var ja = false;
    for (var i = 0; i < karten.length && !ja; i++) {
        var c = karten[i];
        var rec = daten.effekte.bySetNumber.get(c.key)
               || daten.effekte.byName.get(c.name.toLowerCase());
        if (!rec) continue;
        var tags = E.extractTags(rec, c.key);
        for (var j = 0; j < tags.length; j++) {
            if (daten.verteidiger.has(tags[j].tag)) { ja = true; break; }
        }
    }
    _ansatz.set(gegnerKey, ja);
    return ja;
}

var _cache = null;

function _laden() {
    if (_cache) return _cache;
    _cache = Promise.all([
        _text('data/current_meta_card_data.csv'),
        _text('data/limitless_online_decks_matchups.csv'),
        (window.CardCapabilityEngine && window.CardCapabilityEngine.load)
            ? window.CardCapabilityEngine.load() : Promise.resolve(null),
        (typeof window._loadCardEffectsIndex === 'function')
            ? window._loadCardEffectsIndex() : Promise.resolve(null),
        fetch('data/card_capability_interactions.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
    ]).then(function (a) {
        var karten = _csv(a[0]), matchups = _csv(a[1]);

        /* Karten je Archetyp, und der Formatpool als Ganzes.
           Ein Kartenname kann in mehreren Archetypen stehen — dann
           gehört er in beide Mengen, und die Ausschlussprüfung unten
           greift für den, der ihn schon spielt. */
        var proArchetyp = new Map();
        var pool = new Map();      // schluessel -> {key, name}
        karten.forEach(function (z) {
            var name = String(z.card_name || '').trim();
            var k = _schluessel(z);
            if (!name || !k) return;
            var eintrag = { key: k, name: name };
            if (!pool.has(k)) pool.set(k, eintrag);
            var arch = _normArch(z.archetype);
            if (!arch) return;
            if (!proArchetyp.has(arch)) proArchetyp.set(arch, []);
            proArchetyp.get(arch).push(eintrag);
        });

        var mu = new Map();        // deck -> [{gegner, quote, partien}]
        matchups.forEach(function (z) {
            var d = String(z.deck_name || '').trim();
            var g = String(z.opponent || '').trim();
            if (!d || !g) return;
            d = _normArch(d);
            if (!mu.has(d)) mu.set(d, []);
            mu.get(d).push({
                /* Der ANZEIGENAME bleibt der aus der Matchup-Datei —
                   der Nutzer kennt "Toucannon", nicht "toucannon pbl".
                   Verglichen wird über den Schlüssel daneben. */
                gegner: g,
                gegnerKey: _normArch(g),
                quote: _zahl(z.win_rate),
                partien: _zahl(z.total_games)
            });
        });

        /* Die Verteidiger-Seite der Regelbasis. Direkt aus der Datei,
           nicht aus der Engine — die hält ihre Daten privat, und ein
           zweiter Abruf einer 3-KB-Datei ist billiger als ein Griff in
           fremde Innereien. */
        var verteidiger = new Set();
        (a[4] && a[4].interactions || []).forEach(function (ix) {
            if (ix && ix.result === 'attacker_wins' && ix.defender) verteidiger.add(ix.defender);
        });

        return {
            proArchetyp: proArchetyp, pool: pool, matchups: mu,
            effekte: a[3], verteidiger: verteidiger
        };
    });
    return _cache;
}

/* Die schlechten Matchups eines Archetyps, das schlechteste zuerst.
   Nur solche mit genug Partien — eine 20-%-Quote auf sieben Partien
   ist keine Schwäche, sondern eine Stichprobe.
   OHNE KAPPUNG: welche davon überhaupt einen Vorschlag hergeben,
   entscheidet sich erst nach der Prüfung — siehe unten. */
function _schlechteGegner(daten, archetyp) {
    var reihe = daten.matchups.get(_normArch(archetyp)) || [];
    return reihe.filter(function (m) {
        return isFinite(m.quote) && m.quote < SCHLECHT_AB
            && isFinite(m.partien) && m.partien >= MIN_PARTIEN
            && daten.proArchetyp.has(m.gegnerKey);
    }).sort(function (a, b) { return a.quote - b.quote; });
}

/* ── Der öffentliche Weg ─────────────────────────────────────────────
 *
 * ideen({archetyp, eigeneKarten, lang}) -> Promise<{
 *     stand: {version, datum, interaktionen},
 *     gegner: [{name, quote, partien, vorschlaege: [{
 *         karte, quelle, gegenKarte, gegenQuelle, sicherheit, satz
 *     }]}]
 * }>
 *
 * `eigeneKarten` sind die Karten, die schon im Deck stehen — sie
 * fallen als Vorschlag weg, sonst schlägt der Baustein vor, was der
 * Nutzer bereits spielt.
 */
function ideen(opts) {
    opts = opts || {};
    var archetyp = String(opts.archetyp || '').trim();
    var lang = opts.lang || 'de';
    if (!archetyp) return Promise.resolve({ stand: STAND, gegner: [] });

    return _laden().then(function (daten) {
        var E = window.CardCapabilityEngine;
        if (!E || !daten.effekte || !daten.effekte.size) {
            return { stand: STAND, gegner: [] };
        }

        /* AUSSCHLUSSMENGE: alles, was der Archetyp ohnehin spielt, plus
           alles, was im Deck des Nutzers schon steht. Ein Vorschlag,
           den man bereits gezogen hat, ist kein Vorschlag. */
        var drin = new Set();
        (daten.proArchetyp.get(_normArch(archetyp)) || []).forEach(function (c) { drin.add(c.key); });
        (opts.eigeneKarten || []).forEach(function (c) {
            if (c && c.key) drin.add(String(c.key).toUpperCase().trim());
            if (c && c.name) drin.add('name:' + String(c.name).toLowerCase().trim());
        });
        var istDrin = function (c) {
            return drin.has(c.key) || drin.has('name:' + c.name.toLowerCase());
        };

        var kandidaten = [];
        daten.pool.forEach(function (c) { if (!istDrin(c)) kandidaten.push(c); });

        /* ERST PRUEFEN, DANN KAPPEN — nicht umgekehrt.
         *
         * BEFUND (05.09.2026, erster Lauf gegen echte Daten): die erste
         * Fassung nahm die DREI schlechtesten Matchups und suchte nur
         * dort. Für Mega Excadrill sind das Alakazam Dudunsparce
         * (24,97 %), Rocket's Honchkrow (34,15 %) und Mega Lucario
         * (35 %) — und keiner dieser drei führt eine Karte, gegen die
         * die Regelbasis etwas kennt. Ergebnis: leer.
         *
         * Der einzige Gegner mit einem Ansatzpunkt ist Toucannon
         * (38,03 % auf 358 Partien, Pikachu ex mit KO-Schutz) — und der
         * stand auf Platz SECHS und wurde nie geprüft. Die Kappung
         * hat also nicht die schwächsten Vorschläge weggelassen,
         * sondern die einzigen.
         *
         * Jetzt werden alle schlechten Matchups geprüft, und gekappt
         * wird das Ergebnis. Damit das bezahlbar bleibt, wird vorher
         * je Gegner nachgesehen, ob seine Karten überhaupt einen Tag
         * tragen, den eine Regel kennt — das spart die teuren Läufe
         * für die Gegner, bei denen ohnehin nichts herauskommen kann. */
        var gegner = _schlechteGegner(daten, archetyp)
            .filter(function (g) { return _hatAnsatzpunkt(daten, g.gegnerKey); })
            .slice(0, MAX_GEGNER);
        if (!gegner.length || !kandidaten.length) return { stand: STAND, gegner: [] };

        /* Für jeden schlechten Gegner EINEN Lauf der Engine, mit dem
           Formatpool als "eigenem Deck". Die Engine liefert dann alle
           Paarungen Kandidat -> Gegnerkarte; wir behalten die, bei
           denen der Kandidat gewinnt. */
        var laeufe = gegner.map(function (g) {
            var karte = new Map();
            karte.set(g.gegner, daten.proArchetyp.get(g.gegnerKey) || []);
            return E.detectMatchups({
                userDeckCards: kandidaten,
                archetypeCardMap: karte,
                cardEffectsIndex: daten.effekte,
                lang: lang
            }).then(function (erg) {
                var treffer = (erg.get(g.gegner) || []).filter(function (d) {
                    return d.result === 'attacker_wins';
                });
                /* Beste Sicherheit zuerst, dann der höhere Matchup-Wert.
                   Bei Gleichstand entscheidet der Kartenname, damit die
                   Reihenfolge zwischen zwei Aufrufen stabil bleibt —
                   eine Liste, die bei jedem Öffnen anders aussieht,
                   liest niemand als Empfehlung. */
                var rang = { high: 3, medium: 2, low: 1 };
                treffer.sort(function (a, b) {
                    return (rang[b.confidence] || 0) - (rang[a.confidence] || 0)
                        || (b.matchupValue || 0) - (a.matchupValue || 0)
                        || String(a.attackerCard).localeCompare(String(b.attackerCard));
                });
                /* Je Karte nur EINE Zeile: dieselbe Karte kann drei
                   Gegnerkarten schlagen, und dreimal derselbe
                   Kartenname sieht aus wie drei Vorschläge. */
                var gesehen = new Set(), aus = [];
                treffer.forEach(function (d) {
                    if (gesehen.has(d.attackerCard)) return;
                    gesehen.add(d.attackerCard);
                    /* WAS DIE KARTE UEBERHAUPT IST, GEHOERT DAZU.
                     *
                     * BEFUND beim ersten echten Lauf (05.09.2026): gegen
                     * Toucannon schlug der Baustein "Crustle",
                     * "Dudunsparce ex" und "Iron Crown ex" vor — alles
                     * ANGREIFER, keine Tech-Karten. Einem Mega-Excadrill-
                     * Spieler "spiel Crustle" zu sagen heisst nicht
                     * "tausch eine Karte", sondern "spiel ein anderes
                     * Deck", und das steht in einer Liste, die nach
                     * Deckanpassung aussieht.
                     *
                     * Verschwiegen wird es trotzdem nicht — manche
                     * Archetypen spielen genau EINEN Fremdangreifer als
                     * Tech, und die Idee kann richtig sein. Aber der
                     * Leser muss sie einordnen koennen, und dafuer
                     * braucht er Kartenart und Energie. Beides steht im
                     * Effektsatz, den die Engine ohnehin gelesen hat. */
                    var rec = daten.effekte.bySetNumber.get(String(d.attackerKey || '').toUpperCase())
                           || daten.effekte.byName.get(String(d.attackerCard || '').toLowerCase());
                    aus.push({
                        karte: d.attackerCard,
                        art: rec ? (rec.card_type || '') : '',
                        energie: rec ? (rec.energy_type || '') : '',
                        quelle: d.attackerSource,
                        gegenKarte: d.defenderCard,
                        gegenQuelle: d.defenderSource,
                        sicherheit: d.confidence,
                        satz: d.narrative
                    });
                });
                return {
                    name: g.gegner, quote: g.quote, partien: g.partien,
                    vorschlaege: aus.slice(0, PRO_GEGNER)
                };
            });
        });

        return Promise.all(laeufe).then(function (reihe) {
            return {
                stand: STAND,
                /* Gegner ohne einen einzigen Vorschlag fallen raus. Eine
                   Überschrift über einer leeren Liste ist genau der
                   Fehler, der am 05.09.2026 in den erkannten
                   Tech-Interaktionen gefunden wurde: 16 von 19 Gegnern
                   mit leerer Liste und einem Minus, das niemand
                   erklären konnte. */
                gegner: reihe.filter(function (g) { return g.vorschlaege.length > 0; })
            };
        });
    }).catch(function (e) {
        console.warn('[TechIdeen] nicht gerechnet:', e && e.message);
        return { stand: STAND, gegner: [] };
    });
}

/* Version und Datum der Regelbasis. Die Oberfläche schreibt sie hin —
   fünf Paarungen aus dem Mai sind eine Aussage über die Abdeckung, und
   wer sie nicht kennt, hält ein leeres Ergebnis für "es gibt nichts". */
function datenstand() {
    return fetch('data/card_capability_interactions.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
            if (!d) return STAND;
            STAND = {
                version: d.version || null,
                datum: d.generated_at || null,
                interaktionen: Array.isArray(d.interactions) ? d.interactions.length : 0
            };
            return STAND;
        })
        .catch(function () { return STAND; });
}

window.TechIdeen = {
    ideen: ideen,
    datenstand: datenstand,
    /* Für die Tests — die Schwellen sind Entscheidungen, keine Magie. */
    SCHLECHT_AB: SCHLECHT_AB,
    MIN_PARTIEN: MIN_PARTIEN,
    PRO_GEGNER: PRO_GEGNER
};

})();
