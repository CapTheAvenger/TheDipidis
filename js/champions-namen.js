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

    /**
     * Der Name, wie er auf der Seite stehen soll: deutsch, wenn die
     * Oberflaeche deutsch ist und ein deutscher Name da ist — sonst
     * unveraendert englisch. NIE ein leerer Platzhalter.
     */
    function anzeige(en, art) {
        if (!en) return '';
        if (!istDeutsch()) return en;
        return de(en, art) || en;
    }

    window.ChampionsNamen = { laden, de, anzeige, istDeutsch, WESEN_DE };
})();
