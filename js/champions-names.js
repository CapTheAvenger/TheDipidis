// Side Quest · Champions — die Brücke zwischen drei Namensräumen
// ============================================================================
// Pokémon Champions führt denselben Kader unter drei verschiedenen Namen, und
// bis zum 25.08.2026 hat keine Stelle im Code sie ineinander übersetzt:
//
//   Nutzungsdaten   data/champions_usage.json      "hisuian-zoroark", "mega-garchomp"
//   Teamkameraden   dieselben Dateien, Anzeigename  "Hisuian Zoroark", "Basculegion Male"
//   Showdown        data/pokemon_battle_data.json   "Zoroark-Hisui",  "Basculegion"
//
// Der Team-Builder arbeitet im ersten und zeigt den zweiten. Alles, was ein
// gespeichertes Team weiterverarbeitet — Speed-Ladder, Sprites, Spezies-Filter,
// Export nach Limitless — erwartet den dritten.
//
// GEMESSEN am 25.08.2026: von 353 Anzeigenamen des Builders finden **152**
// keinen Eintrag in pokemon_battle_data.json. Solange den Builder nichts
// konsumiert, schadet das nicht. In dem Moment, in dem er speichert, bricht es:
// js/app-side-quest-play.js überspringt in der Speed-Ladder ein Pokémon ohne
// Spezies-Treffer mit einem stillen `continue` — ein Sechser-Team zeigt dann
// vier Zeilen, ohne dass irgendwo etwas rot wird.
//
// Deshalb übersetzt diese Datei BEIM SCHREIBEN, nicht beim Lesen. Import und
// Builder schreiben in dasselbe Array (`sideQuestImportedTeams`); käme die
// Übersetzung erst beim Lesen, lägen zwei Namenskonventionen dauerhaft
// nebeneinander in einem Speicher, den niemand mehr migrieren kann.
//
// Die Regeln unten decken 351 der 353 Slugs ab. Die Ausnahmen sind keine
// Bequemlichkeit, sondern Fälle, in denen eine Regel das FALSCHE Pokémon
// träfe — siehe die Begründung an jedem Eintrag.
(function () {
    'use strict';

    // Regionalpräfix vorn im Slug → Suffix hinten im Showdown-Namen.
    var REGION = {
        alolan: 'Alola', galarian: 'Galar', hisuian: 'Hisui', paldean: 'Paldea'
    };

    // Wörter, die nur die Form benennen und im Showdown-Namen entfallen.
    var FORMWORT = { form: 1, forme: 1, breed: 1, pattern: 1, trim: 1, size: 1 };

    // Fälle, in denen die Regeln danebengreifen. Jeder Eintrag mit Grund —
    // eine Ausnahmeliste ohne Begründung ist eine Liste, die niemand pflegen kann.
    var AUSNAHMEN = {
        // Der Bindestrich gehört zum Artnamen, nicht zur Form.
        'kommo-o': 'Kommo-o',
        // Punkt und Leerzeichen lassen sich aus einem Slug nicht ableiten.
        'mr-rime': 'Mr. Rime',
        // Die weibliche Form hat ANDERE Basiswerte (Ang 92 statt 112). Ohne
        // diesen Eintrag landet sie auf den Werten des Männchens.
        'basculegion-female': 'Basculegion-F',
        // Gleiche Basiswerte, aber eine andere Fähigkeit (Kompetenz statt
        // Trickster). Für ein Teamsheet ist das ein Unterschied.
        'meowstic-female': 'Meowstic-F',
        // Gleiche Basiswerte, andere Form — sie gehört so aufs Sheet.
        'morpeko-hangry-mode': 'Morpeko-Hangry',
        'maushold-family-of-four': 'Maushold-Four'
    };

    function cap(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }

    /** Alle plausiblen Showdown-Schreibweisen zu einem Nutzungs-Slug,
     *  von der spezifischsten zur allgemeinsten. */
    function kandidaten(slug) {
        var w = String(slug || '').toLowerCase().split('-').filter(Boolean);
        if (!w.length) return [];
        var out = [], rest, i;

        // mega-charizard-x → Charizard-Mega-X ; mega-garchomp → Garchomp-Mega
        if (w[0] === 'mega') {
            rest = [];
            for (i = 1; i < w.length; i++) rest.push(cap(w[i]));
            if (rest.length > 1 && (rest[rest.length - 1] === 'X' || rest[rest.length - 1] === 'Y')) {
                out.push(rest.slice(0, -1).join('-') + '-Mega-' + rest[rest.length - 1]);
            }
            out.push(rest.join('-') + '-Mega');
        }

        // alolan-ninetales → Ninetales-Alola ; paldean-tauros-aqua-breed → Tauros-Paldea-Aqua
        if (REGION[w[0]]) {
            rest = [];
            for (i = 1; i < w.length; i++) rest.push(cap(w[i]));
            out.push(rest.join('-') + '-' + REGION[w[0]]);
            out.push(rest[0] + '-' + REGION[w[0]]);
            if (w.length > 2) out.push(cap(w[1]) + '-' + REGION[w[0]] + '-' + cap(w[2]));
        }

        // Formwörter raus: lycanroc-midnight-form → Lycanroc-Midnight
        var ohneForm = [];
        for (i = 0; i < w.length; i++) if (!FORMWORT[w[i]]) ohneForm.push(cap(w[i]));
        out.push(ohneForm.join('-'));

        // Wörtlich, dann die reine Art: alcremie-lemon-cream → Alcremie
        var woertlich = [];
        for (i = 0; i < w.length; i++) woertlich.push(cap(w[i]));
        out.push(woertlich.join('-'));

        // Umgedrehte Formschreibweise: fan-rotom → Rotom-Fan.
        // Die Quelle fuehrt seit dem 26.08.2026 BEIDE Richtungen — im selben
        // Stand stehen 'rotom-fan' und 'fan-rotom'. Der Kandidat steht
        // bewusst hier unten: er ist die unspezifischste Vermutung und darf
        // keine der Regeln darueber ueberstimmen. Er kann auch nichts
        // kaputtmachen, weil zuShowdown jeden Kandidaten gegen die
        // Spezies-Tabelle haelt und null zurueckgibt, wenn keiner trifft.
        if (w.length >= 2) {
            var umgedreht = [cap(w[w.length - 1])];
            for (i = 0; i < w.length - 1; i++) umgedreht.push(cap(w[i]));
            out.push(umgedreht.join('-'));
        }

        out.push(cap(w[0]));
        return out;
    }

    /** Nutzungs-Slug → Showdown-Name, aufgelöst gegen die übergebene
     *  Spezies-Tabelle (data/pokemon_battle_data.json).
     *  Gibt null zurück, wenn nichts trifft — dann darf der Aufrufer NICHT
     *  raten, sondern muss den Fall sichtbar machen. */
    function zuShowdown(slug, dex) {
        var s = String(slug || '').toLowerCase();
        if (!s) return null;
        if (AUSNAHMEN[s]) return (!dex || dex[AUSNAHMEN[s]]) ? AUSNAHMEN[s] : null;
        var k = kandidaten(s), i;
        for (i = 0; i < k.length; i++) {
            if (!dex) { if (k[i]) return k[i]; }
            else if (dex[k[i]]) return k[i];
        }
        return null;
    }

    window.ChampionsNames = {
        zuShowdown: zuShowdown,
        kandidaten: kandidaten,
        AUSNAHMEN: AUSNAHMEN
    };
})();
