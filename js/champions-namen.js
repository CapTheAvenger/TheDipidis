/**
 * Deutsche Namen fuer Gegenstaende, Attacken, Faehigkeiten und Wesen —
 * einmal geladen, von jedem Champions-Modul benutzbar.
 *
 * BEFUND (03.09.2026, beim Bebildern der Anleitung): auf der deutschen
 * Seite stand im Team-Builder
 *
 *     Pelipper
 *     Focus Sash
 *     Fähigkeit        Drizzle
 *     Wesen            Modest
 *     Statuswertpunkte 2 HP / 32 SpA / 32 Spe
 *     Attacken         Hurricane · Tailwind · Weather Ball · Wide Guard
 *
 * Deutsche Beschriftungen, englische Werte. Nicht weil die Namen
 * fehlten — data/champions_names_de.json fuehrt sie alle —, sondern
 * weil js/app-side-quest.js nur die ART (pokemon_names_de.json) aufloest
 * und die uebrigen vier Felder unangetastet durchreicht.
 *
 * WARUM DIESE DATEI UND NICHT NOCH EINE KOPIE
 * -------------------------------------------
 * Drei Module laden champions_names_de.json bereits einzeln
 * (app-side-quest-pokedex.js, app-side-quest-matchups.js,
 * app-side-quest-status.js), und die Wesenstabelle stand nur in einem
 * davon. Eine vierte handgeschriebene Kopie waere genau der Fehler, den
 * dieses Projekt schon dreimal bezahlt hat. Also: eine Ladung, ein
 * Zwischenspeicher, eine Wesenstabelle.
 *
 * WAS DIESE DATEI AUSDRUECKLICH NICHT TUT
 * ---------------------------------------
 * Sie fasst den EXPORT nicht an. Der Showdown-/Limitless-Paste muss
 * englisch bleiben — er wird in ein Spiel und in ein Turnierformular
 * eingefuegt, nicht gelesen. Dieselbe Trennung wie beim Kopf einer
 * kopierten Deckliste (tests/unit/test-decklisten-kopf.js): was ein
 * Mensch liest, wird uebersetzt; was eine Maschine liest, nicht.
 */
(function () {
    'use strict';

    const URL_NAMEN = 'data/champions_names_de.json';

    // Die 25 Wesen. Sie stehen nicht in champions_names_de.json — die
    // Datei fuehrt Attacken, Gegenstaende und Faehigkeiten, keine Wesen.
    const WESEN_DE = {
        Hardy: 'Robust', Lonely: 'Solo', Brave: 'Mutig', Adamant: 'Hart', Naughty: 'Frech',
        Bold: 'Kühn', Docile: 'Sanft', Relaxed: 'Locker', Impish: 'Pfiffig', Lax: 'Lasch',
        Timid: 'Scheu', Hasty: 'Hastig', Serious: 'Ernst', Jolly: 'Froh', Naive: 'Naiv',
        Modest: 'Mäßig', Mild: 'Mild', Quiet: 'Ruhig', Bashful: 'Zaghaft', Rash: 'Hitzig',
        Calm: 'Still', Gentle: 'Zart', Sassy: 'Forsch', Careful: 'Sacht', Quirky: 'Kauzig',
    };

    let _tabelle = null;
    let _versucht = false;

    async function laden() {
        if (_versucht) return _tabelle;
        _versucht = true;
        try {
            const resp = await fetch(`${URL_NAMEN}?t=${Date.now()}`);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const json = await resp.json();
            if (json && typeof json === 'object') _tabelle = json;
        } catch (_err) {
            // Fail-soft: ohne Tabelle bleibt alles englisch. Das ist
            // schlechter als deutsch, aber besser als ein leeres Feld.
            _tabelle = null;
        }
        return _tabelle;
    }

    function istDeutsch() {
        return typeof window.getLang === 'function' && window.getLang() === 'de';
    }

    /**
     * Der deutsche Name, oder null.
     * art ∈ 'items' | 'moves' | 'abilities' | 'nature'
     */
    function de(en, art) {
        if (!en) return null;
        if (art === 'nature') return WESEN_DE[en] || null;
        const topf = _tabelle && _tabelle[art];
        return (topf && topf[en]) || null;
    }

    /* ── Gegenstände, die die Quelle nicht benennt (13.09.2026) ──────
     *
     * championsbattledata.com hat an diesem Tag aufgehört, für einen Teil
     * der gehaltenen Gegenstände Namen zu liefern, und schreibt
     * stattdessen "Unknown Item 542". Gemessen im Stand vom 13.09.:
     * 20 verschiedene Nummern, 174 betroffene Einträge; am Vortag keine
     * einzige.
     *
     * Die Nummer ist KEINE PokéAPI-Item-ID. Die Gegenprobe gegen
     * data/v2/csv/item_names.csv ergibt Poké-Flöte, Muschelglocke,
     * Zoomlinse und Kraftgürtel — nichts davon hält jemand in einem
     * Wettkampfformat. Eine Zuordnung wäre geraten, und geraten wird
     * hier nichts (CLAUDE.md: "Report, don't silently repair").
     *
     * Was die Oberfläche stattdessen tut: den Pseudonamen nicht als Namen
     * ausgeben. "Unknown Item 542" liest sich wie eine Angabe und ist
     * keine — der Leser hält es für einen Gegenstand, den er nicht kennt,
     * statt für eine Lücke. Er bekommt deshalb gesagt, dass die Quelle
     * den Namen nicht liefert; die Nummer bleibt dahinter stehen, damit
     * der Eintrag nachvollziehbar bleibt und mit dem Admin-Bereich
     * zusammengeht (Lückenklasse "gegenstandsname" in
     * data/datenluecken.json).
     *
     * WARUM HIER: fünf Flächen zeigen gehaltene Gegenstände an —
     * app-side-quest-items, -builder, -matchups, -pokedex und -usage.
     * Vier davon laufen über diese Funktion. Fünf Kopien der Regel wären
     * fünf Wahrheiten; die fünfte (items) ruft sie deshalb ebenfalls auf.
     */
    const UNBENANNT = /^Unknown Item (\d+)$/;

    function istUnbenannt(en) {
        return UNBENANNT.test(String(en || '').trim());
    }

    /**
     * Der Name, wie er auf der Seite stehen soll: deutsch, wenn die
     * Oberflaeche deutsch ist und ein deutscher Name da ist — sonst
     * unveraendert englisch. NIE ein leerer Platzhalter.
     *
     * Ausnahme: hat die Quelle gar keinen Namen geliefert, steht hier
     * die Luecke statt eines Pseudonamens — siehe oben.
     */
    function anzeige(en, art) {
        if (!en) return '';
        const unbenannt = UNBENANNT.exec(String(en).trim());
        if (unbenannt) {
            return istDeutsch()
                ? 'Von der Quelle nicht benannt (Nr. ' + unbenannt[1] + ')'
                : 'Not named by the source (no. ' + unbenannt[1] + ')';
        }
        if (!istDeutsch()) return en;
        return de(en, art) || en;
    }

    window.ChampionsNamen = { laden, de, anzeige, istDeutsch, istUnbenannt, WESEN_DE };
})();
