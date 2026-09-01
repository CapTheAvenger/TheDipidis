// Champions-Sets: die Zahlen und die Umrechnung, an einer Stelle
// ============================================================================
// Pokémon Champions rechnet Statuswertpunkte anders als die Hauptreihe:
// 0–32 pro Wert, Summe hoechstens 66. Die Hauptreihe rechnet mit EVs:
// 0–252 pro Wert, Summe 510. Der Faktor zwischen beiden ist 8
// (32 · 8 = 256, gedeckelt auf 252) — das gilt fuer die STATUSFORMEL.
//
// Fuer den TEAM-PASTE gilt er NICHT: Showdown hat eigene
// Champions-Formate und rechnet dort selbst in Statuspunkten. Warum das
// hier so ausfuehrlich steht, erklaert der naechste Block.
//
// Diese Zahlen lagen bisher an drei Stellen verstreut:
//   js/app-side-quest-matchups.js  SP_MAX / SP_BUDGET   (Rechner)
//   js/app-side-quest-play.js      CHAMPIONS_EV_SCALE / MAX_EV_MAINLINE
//   scripts/scrape_champions_usage.py  SP_BUDGET / SP_MAX (Scraper)
// Deshalb hier: eine Quelle fuer die Zahlen.
//
// ── DER PASTE BRAUCHT KEINE UMRECHNUNG (nachgeprueft 01.09.2026) ──────────
//
// Am 26.08.2026 bekam der Showdown-Export eine Umrechnung mal 8: die
// Annahme war, dass Showdown Champions-Baue als gewoehnliche EVs liest und
// "32 Atk" dort einem Achtel des gemeinten Angriffs entspraeche.
//
// Der Betreiber hat das bezweifelt — "showdown arbeitet doch sicher
// mittlerweile auch mit den max 32 wie beim Limitless paste oder?" — und
// hatte recht. Showdown hat inzwischen eigene Champions-Formate, und die
// rechnen in Statuspunkten. Belegt an der Quelle
// (github.com/smogon/pokemon-showdown, Stand 01.09.2026):
//
//   sim/dex-formats.ts       if (format.mod.startsWith('champions'))
//                                this.evLimit = 66;
//   sim/team-validator.ts    const useStatPoints =
//                                dex.currentMod.startsWith('champions');
//                            ... set.evs[stat] > 32 ->
//                                "has more than 32 Stat Points in ..."
//   data/aliases.ts          cou: "[Gen 9 Champions] OU", ...
//
// Das Etikett der Zeile bleibt "EVs:" (sim/teams.ts schreibt es so, der
// Importer liest es so), aber die Zahl dahinter IST der Statuspunkt. Ein
// umgerechneter Bau wird von Showdown abgelehnt: "252 Atk" sind dort 252
// Statuspunkte, also mehr als 32 je Wert und weit ueber dem Budget von 66.
//
// Damit gibt es nur noch EINE Serialisierung — dieselbe fuer Showdown und
// fuer Limitless. toShowdownText() und showdownUeberschuss() sind
// ersatzlos entfallen, und mit ihnen die Warnung ueber das 510er-Budget:
// Showdown deckelt Champions-Baue bei 66, und darunter bleibt
// clampSpread() ohnehin.
(function () {
    'use strict';

    var SP_BUDGET = 66;   // Summe aller sechs Werte
    var SP_MAX = 32;      // je Einzelwert
    /* Diese beiden gelten weiter — aber fuer die STATUSRECHNUNG, nicht
       fuer den Paste. js/app-side-quest-play.js fuettert damit die
       Hauptreihen-Formel, um aus Champions-Punkten einen Initiative-Wert
       zu machen. Fuer das Schreiben eines Teams werden sie nicht mehr
       gebraucht; siehe den Kopf dieser Datei. */
    var EV_SCALE = 8;     // Champions-SP → EV, nur fuer die Statusformel
    var EV_MAX = 252;     // Deckel der Hauptreihe, ebenso

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

    window.ChampionsSet = {
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
        toChampionsText: toChampionsText
    };
})();
