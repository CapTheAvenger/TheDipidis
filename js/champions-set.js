// Champions-Sets: die Zahlen und die Umrechnung, an einer Stelle
// ============================================================================
// Pokémon Champions rechnet Statuswertpunkte anders als die Hauptreihe:
// 0–32 pro Wert, Summe hoechstens 66. Showdown und die Hauptreihe rechnen
// mit EVs: 0–252 pro Wert. Der Faktor zwischen beiden ist 8
// (32 · 8 = 256, gedeckelt auf 252).
//
// Diese Zahlen lagen bisher an drei Stellen verstreut:
//   js/app-side-quest-matchups.js  SP_MAX / SP_BUDGET   (Rechner)
//   js/app-side-quest-play.js      CHAMPIONS_EV_SCALE / MAX_EV_MAINLINE
//   scripts/scrape_champions_usage.py  SP_BUDGET / SP_MAX (Scraper)
// und der Export kannte keine davon — er schrieb die rohen 0–32 unter das
// Etikett "EVs:". Fuer Limitless ist das richtig (deren Teamsheet nimmt die
// spielinterne Verteilung), fuer Showdown ist es um den Faktor 8 daneben.
//
// Deshalb hier: eine Quelle fuer die Zahlen und beide Serialisierungen.
(function () {
    'use strict';

    var SP_BUDGET = 66;   // Summe aller sechs Werte
    var SP_MAX = 32;      // je Einzelwert
    var EV_SCALE = 8;     // Champions-SP → Showdown-EV
    var EV_MAX = 252;     // Deckel der Hauptreihe

    // Reihenfolge wie im Spiel und in den Quelldaten.
    var KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    var LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
    // Deutsche Kuerzel fuer die Anzeige — die Paste bleibt englisch, weil
    // Showdown und Limitless nur die englischen Kuerzel lesen.
    var LABEL_DE = { hp: 'KP', atk: 'ANG', def: 'VER', spa: 'SPA', spd: 'SPV', spe: 'INI' };

    function leer() { return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }; }

    function zahl(v) {
        var n = Number(v);
        return isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }

    // Deckelt eine Verteilung auf das Erlaubte. Der Ueberschuss wird
    // abgeschnitten, nicht umverteilt: wer 40 auf Angriff schiebt, soll die
    // 8 verlorenen Punkte sehen und selbst entscheiden, wohin sie gehen.
    // Die Reihenfolge ist dabei bewusst KEYS und nicht "groesster zuerst" —
    // sonst haengt das Ergebnis davon ab, in welcher Reihenfolge der Nutzer
    // die Regler bewegt hat.
    function clampSpread(roh) {
        var out = leer(), rest = SP_BUDGET;
        for (var i = 0; i < KEYS.length; i++) {
            var k = KEYS[i];
            var v = Math.min(zahl(roh && roh[k]), SP_MAX, rest);
            out[k] = v;
            rest -= v;
        }
        return out;
    }

    function spreadTotal(s) {
        var sum = 0;
        for (var i = 0; i < KEYS.length; i++) sum += zahl(s && s[KEYS[i]]);
        return sum;
    }

    // "2 HP / 32 Atk / 32 Spe" → { hp:2, atk:32, … }. Versteht die englischen
    // Kuerzel aus der Quelle und die deutschen aus dem Telegram-Bauplan.
    var ALIAS = {
        hp: 'hp', kp: 'hp',
        atk: 'atk', ang: 'atk', att: 'atk',
        def: 'def', ver: 'def',
        spa: 'spa', spatk: 'spa', 'sp.atk': 'spa', spezialangriff: 'spa',
        spd: 'spd', spv: 'spd', spdef: 'spd', 'sp.def': 'spd',
        spe: 'spe', ini: 'spe', spd_: 'spe', speed: 'spe'
    };
    function parseSpread(text) {
        var out = leer();
        String(text || '').split('/').forEach(function (teil) {
            var m = String(teil).trim().match(/^(\d+)\s+(.+)$/);
            if (!m) return;
            var key = ALIAS[m[2].replace(/[\s.]/g, '').toLowerCase()]
                   || ALIAS[m[2].trim().toLowerCase()];
            if (key) out[key] = zahl(m[1]);
        });
        return out;
    }

    // Rohe Champions-Punkte, so wie Limitless sie im Teamsheet erwartet.
    function toChampionsText(s) {
        var teile = [];
        for (var i = 0; i < KEYS.length; i++) {
            var k = KEYS[i], v = zahl(s && s[k]);
            if (v) teile.push(v + ' ' + LABEL[k]);
        }
        return teile.join(' / ');
    }

    // Dieselbe Verteilung als Showdown-EVs: mal 8, gedeckelt bei 252.
    function toShowdownText(s) {
        var teile = [];
        for (var i = 0; i < KEYS.length; i++) {
            var k = KEYS[i], v = zahl(s && s[k]);
            if (v) teile.push(Math.min(v * EV_SCALE, EV_MAX) + ' ' + LABEL[k]);
        }
        return teile.join(' / ');
    }

    // Showdown deckelt die Summe aller EVs bei 510. Champions' 66 Punkte
    // ergeben mal 8 aber bis zu 528 — ein voll ausgereizter Champions-Bau
    // ist in Showdown schlicht nicht legal. Wir rechnen trotzdem ehrlich um
    // und melden den Ueberschuss, statt still irgendwo Punkte abzuziehen:
    // welcher Wert geopfert wird, ist eine Spielentscheidung, keine
    // Rundungsfrage. (Hausregel: melden, nicht heimlich reparieren.)
    var EV_TOTAL_MAX = 510;
    function showdownUeberschuss(s) {
        var sum = 0;
        for (var i = 0; i < KEYS.length; i++) {
            sum += Math.min(zahl(s && s[KEYS[i]]) * EV_SCALE, EV_MAX);
        }
        return Math.max(0, sum - EV_TOTAL_MAX);
    }

    window.ChampionsSet = {
        EV_TOTAL_MAX: EV_TOTAL_MAX,
        showdownUeberschuss: showdownUeberschuss,
        SP_BUDGET: SP_BUDGET,
        SP_MAX: SP_MAX,
        EV_SCALE: EV_SCALE,
        EV_MAX: EV_MAX,
        KEYS: KEYS,
        LABEL: LABEL,
        LABEL_DE: LABEL_DE,
        leer: leer,
        clampSpread: clampSpread,
        spreadTotal: spreadTotal,
        parseSpread: parseSpread,
        toChampionsText: toChampionsText,
        toShowdownText: toShowdownText
    };
})();
