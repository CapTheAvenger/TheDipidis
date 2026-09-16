// champions-damage.js — the numbers behind the Champions matchup view
// and damage calculator.
//
// ── UMBAU 16.09.2026: VIER KETTEN STATT EINER MULTIPLIKATION ───────
//
// Gemeldet: "unser Damage Culc ist ja eine Katastrophe, analysiere bitte
// noch mal https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/".
//
// Nachgelesen im Quelltext dieses Rechners (MIT, Honko/Tapin/Firestorm/
// squirrelboyVGC/nerd-of-now, script_res/damage_MASTER.js,
// damage_SV.js). Die Reihenfolge der Rechnung ist dort — und im Spiel —
// NICHT "alles malnehmen": es sind VIER getrennte Ketten, jede im
// 4096er-Festkomma, jede mit pokeRound abgeschlossen:
//
//     Grundstaerke -> bpMods     -> pokeRound
//     Angriff      -> atMods     -> pokeRound
//     Verteidigung -> dfMods     -> pokeRound
//     Grundschaden -> Flaeche, Wetter, Volltreffer
//                  -> WURF (16 Stueck)
//                  -> STAB (pokeRound)  -> Typvorteil (floor)
//                  -> Verbrennung (floor) -> finalMods (pokeRound)
//
// Was hier vorher stand, war eine einzige Multiplikation NACH dem Wurf:
//
//     floor(floor(floor(base * wurf) * stab) * eff * extra)
//
// Drei Fehler steckten darin, alle messbar:
//   1. Der Flaechenabzug (0,75) und das Wetter lagen HINTER dem Wurf.
//      Im Spiel liegen sie DAVOR — auf dem Grundschaden, nicht auf
//      jedem einzelnen Wurf.
//   2. STAB lief ueber floor statt pokeRound.
//   3. Life Orb und Expert Belt lagen in derselben Klammer wie der
//      Typvorteil statt in einer eigenen Kette danach.
// Der Vergleich der alten und der neuen Rechnung steht in
// tests/unit/test-champions-schaden-ketten.js.
//
// Deliberately DOM-free and shared by both surfaces: two implementations
// of a damage range is how one page ends up telling you 2HKO and the
// other OHKO for the same pair.
//
// Nothing here is scraped. Base powers, PP and damage classes come from
// data/champions_resources.json (every move's power, PP and damage
// class), base stats from
// champions_pokedex.json, spreads and natures from champions_usage.json,
// and the type chart is public rules knowledge in
// data/champions_type_chart.json.
//
// The stat model was checked against a published Silph Scope set before
// any of this was written — Kingambit, Adamant, 32 HP / 32 Atk / 1 SpD /
// 1 Spe gives 207 / 205 / 140 / 72 / 106 / 71, all six exact. Iron Head
// into Sneasler gives 117–138, which is what they show too. Those are
// fixtures now; if the model drifts, they break.
(function (global) {
    'use strict';

    const LEVEL = 50;

    // Damage rolls: 16 evenly spaced multipliers from 0.85 to 1.00. A
    // range without them is not a range, and "OHKO" without knowing which
    // rolls reach it is a guess.
    const ROLLS = Array.from({ length: 16 }, (_, i) => (85 + i) / 100);

    const NATURES = {
        Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
        Bold: ['def', 'atk'], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
        Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
        Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Rash: ['spa', 'spd'],
        Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'],
        Hardy: null, Docile: null, Serious: null, Bashful: null, Quirky: null,
    };

    // Lv. 50, IV fixed at 31 — the Champions model.
    //   non-HP  int(((2*base + 31) * 50 / 100 + 5 + SP) * nature)
    //   HP      (2*base + 31) * 50 / 100 + 50 + 10 + SP
    // Identical to computeFinal in app-side-quest-pokedex.js, which
    // writes the same thing as base + 20 / base + 75; kept in this form
    // because it is the form the game documents.
    function statAt50(base, sp, natureMult) {
        const core = Math.floor(((2 * Number(base || 0) + 31) * LEVEL) / 100) + 5 + Number(sp || 0);
        return Math.floor(core * (natureMult == null ? 1 : natureMult));
    }

    function hpAt50(base, sp) {
        return Math.floor(((2 * Number(base || 0) + 31) * LEVEL) / 100) + 50 + 10 + Number(sp || 0);
    }

    function natureMult(nature, stat) {
        const fx = NATURES[nature];
        if (!fx) return 1;
        if (fx[0] === stat) return 1.1;
        if (fx[1] === stat) return 0.9;
        return 1;
    }

    // { hp, atk, def, spa, spd, spe } for a build.
    // `base` is the Pokédex entry ({hp:{base}, …} or a flat map).
    function buildStats(base, spread, nature) {
        const b = (k) => {
            const v = base && base[k];
            return (v && typeof v === 'object') ? v.base : v;
        };
        const sp = spread || {};
        const out = { hp: hpAt50(b('hp'), sp.hp) };
        ['atk', 'def', 'spa', 'spd', 'spe'].forEach(k => {
            out[k] = statAt50(b(k), sp[k], natureMult(nature, k));
        });
        return out;
    }

    // ── type effectiveness ──────────────────────────────────────────

    function makeChart(json) {
        const table = (json && json.chart) || {};
        return function effectiveness(moveType, defenderTypes) {
            if (!moveType) return 1;
            const row = table[moveType];
            if (!row) return 1;
            return (defenderTypes || []).filter(Boolean).reduce((m, t) => {
                const v = row[t];
                return m * (v === undefined ? 1 : v);
            }, 1);
        };
    }

    // ── Festkomma: 4096 ist die Eins ────────────────────────────────
    //
    // Das Spiel rechnet Modifikatoren nicht als 1,3 sondern als 5324
    // von 4096, und es rundet nach jeder Kette mit "kaufmaennisch, aber
    // die halbe runter". Beides ist nicht Geschmackssache: 1,3 statt
    // 0x14CC und Math.round statt pokeRound geben regelmaessig einen
    // Schadenspunkt Unterschied, und ein Punkt entscheidet ueber OHKO.
    const M = 0x1000;
    function pokeRound(n) { return (n % 1 > 0.5) ? Math.ceil(n) : Math.floor(n); }
    function chainMods(mods) {
        let m = M;
        for (let i = 0; i < mods.length; i++) {
            if (mods[i] !== M) m = Math.round((m * mods[i]) / M);
        }
        return m;
    }

    // ── Belegte Modifikatoren ───────────────────────────────────────
    //
    // Aufgenommen ist NUR, was in data/champions_usage.json wirklich
    // vorkommt (gemessen 16.09.2026 ueber alle 264 Arten, beide
    // Formate) UND sich aus den Daten entscheiden laesst. Alles andere
    // steht unten unter NICHT_BELEGT und wird gemeldet, nicht geraten.

    // Typ-Items: ×1,2 auf die Grundstaerke der passenden Attacke.
    const TYP_ITEM = {
        'Charcoal': 'Fire', 'Mystic Water': 'Water', 'Magnet': 'Electric',
        'Miracle Seed': 'Grass', 'Never-Melt Ice': 'Ice', 'Black Belt': 'Fighting',
        'Poison Barb': 'Poison', 'Soft Sand': 'Ground', 'Sharp Beak': 'Flying',
        'Twisted Spoon': 'Psychic', 'Silver Powder': 'Bug', 'Hard Stone': 'Rock',
        'Spell Tag': 'Ghost', 'Dragon Fang': 'Dragon', 'Black Glasses': 'Dark',
        'Metal Coat': 'Steel', 'Silk Scarf': 'Normal', 'Fairy Feather': 'Fairy',
    };

    // Widerstandsbeeren: halbieren einen SEHR EFFEKTIVEN Treffer des
    // Typs (Chilan halbiert Normal immer — im Bestand kommt sie nicht
    // vor, steht aber der Vollstaendigkeit halber da).
    const RESIST_BEERE = {
        'Occa Berry': 'Fire', 'Passho Berry': 'Water', 'Wacan Berry': 'Electric',
        'Rindo Berry': 'Grass', 'Yache Berry': 'Ice', 'Chople Berry': 'Fighting',
        'Kebia Berry': 'Poison', 'Shuca Berry': 'Ground', 'Coba Berry': 'Flying',
        'Payapa Berry': 'Psychic', 'Tanga Berry': 'Bug', 'Charti Berry': 'Rock',
        'Kasib Berry': 'Ghost', 'Haban Berry': 'Dragon', 'Colbur Berry': 'Dark',
        'Babiri Berry': 'Steel', 'Roseli Berry': 'Fairy', 'Chilan Berry': 'Normal',
    };

    // Faehigkeiten, die einen Typ ganz abfangen.
    const IMMUN_FAEHIGKEIT = {
        'Levitate': 'Ground', 'Earth Eater': 'Ground',
        'Flash Fire': 'Fire',
        'Water Absorb': 'Water', 'Dry Skin': 'Water', 'Storm Drain': 'Water',
        'Volt Absorb': 'Electric', 'Motor Drive': 'Electric', 'Lightning Rod': 'Electric',
        'Sap Sipper': 'Grass',
    };

    // Die Notlage-Faehigkeiten: ×1,5 auf den Angriff, wenn die eigenen
    // KP auf einem Drittel oder darunter stehen.
    const NOTLAGE = { 'Overgrow': 'Grass', 'Blaze': 'Fire', 'Torrent': 'Water', 'Swarm': 'Bug' };

    // WAS BEWUSST FEHLT — und warum. Diese Liste ist Teil des
    // Ergebnisses: `unbelegt` nennt sie dem Aufrufer, damit die
    // Oberflaeche sagen kann, dass eine Zahl eine Untergrenze ist.
    //
    // Der gemeinsame Grund ist EINE Datenluecke: die Attackendaten in
    // data/champions_resources.json fuehren Typ, Staerke, Klasse,
    // Genauigkeit, AP, Vorrang, Ziel — aber KEINE Merkmale
    // (Kontakt, Faust, Biss, Klinge, Schall, Puls, Ball). Ohne sie
    // laesst sich nicht entscheiden, welche Attacke Eisenfaust
    // verstaerkt. Geraten wird nicht.
    /* AM 16.09.2026 STAND HIER EINE LISTE VON ZWOELF.
       ------------------------------------------------------------------
       Elf davon hatten denselben Grund: die Attackendaten fuehrten keine
       Merkmale. Der Betreiber am selben Tag: „genau geraten wird nicht,
       aber dann muessen wir die Daten dringend belegen."

       Belegt sind sie jetzt — data/champions_move_flags.json, erzeugt
       von scripts/build_champions_move_flags.py aus der Attackendatei
       des Kampfsimulators von Pokemon Showdown (MIT). Gemessen:
       513 von 513 Champions-Attacken gefunden, KEINE ohne Eintrag.

       Uebrig bleibt eine einzige Faehigkeit, und ihr Grund ist ein
       anderer: Stahlgeist wirkt vom PARTNER aus. Der Rechner kennt zwei
       Seiten, nicht vier Plaetze. Das ist keine Datenluecke, sondern
       eine Grenze dieses Rechners — und sie steht hier, damit sie nicht
       fuer eine gehalten wird. */
    const NICHT_BELEGT = {
        'Steely Spirit': 'wirkt vom Partner aus; der Rechner kennt zwei Seiten, nicht vier Plaetze',
    };

    /* Merkmale einer Attacke. Fehlt die Merkmalsdatei, ist die Liste
       leer — dann greift keine der Regeln unten, und das ist richtig:
       lieber keine Verstaerkung als eine geratene. */
    function hatMerkmal(move, name) {
        const f = move && move.flags;
        return !!(f && f.indexOf && f.indexOf(name) !== -1);
    }

    // Statusstufen: +1 ist ×1,5, −1 ist ×2/3 — und beide mit floor,
    // nicht mit Rundung.
    function stufe(wert, stufen) {
        const s = Math.max(-6, Math.min(6, Number(stufen) || 0));
        if (s > 0) return Math.floor(wert * (2 + s) / 2);
        if (s < 0) return Math.floor(wert * 2 / (2 - s));
        return wert;
    }

    function seite(o) {
        const x = o || {};
        return {
            ability: x.ability || '',
            item: x.item || '',
            status: x.status || '',
            boosts: x.boosts || {},
            hpAnteil: (x.hpAnteil == null) ? 1 : Number(x.hpAnteil),
            types: x.types || [],
        };
    }

    /**
     * damageRange(opts) -> {
     *   rolls[16], min, max, minPct, maxPct, effectiveness, stab,
     *   ko: { hits, chance }, angewendet[], unbelegt[]
     * }
     *
     * Pflicht: move, attackerStats, defenderStats.
     * Freiwillig: attackerTypes, effectiveness, spread, crit,
     *   attacker {ability,item,status,boosts,hpAnteil},
     *   defender {ability,item,boosts,hpAnteil},
     *   field {weather,terrain,reflect,lightScreen,auroraVeil,doubles,
     *          helpingHand,friendGuard},
     *   item (alte Form: Gegenstand des Angreifers).
     *
     * `angewendet` fuehrt jeden wirksam gewordenen Modifikator mit
     * Namen — eine Zahl ohne Herkunft ist in diesem Projekt keine Zahl.
     * Gibt null zurueck, wenn die Attacke keinen Schaden macht.
     */
    function damageRange(opts) {
        const move = opts.move || {};
        const power = Number(move.power) || 0;
        const cls = move.damage_class || move.category;
        if (!power || cls === 'Status') return null;

        const a = seite(Object.assign({ item: opts.item }, opts.attacker));
        const d = seite(opts.defender);
        const f = opts.field || {};
        const doppel = (f.doubles == null) ? !!opts.spread : !!f.doubles;
        const physical = cls !== 'Special';
        const angewendet = [];
        const unbelegt = [];
        const merke = (name) => { if (angewendet.indexOf(name) === -1) angewendet.push(name); };
        [a.ability, d.ability].forEach(ab => {
            if (ab && NICHT_BELEGT[ab] && unbelegt.indexOf(ab) === -1) unbelegt.push(ab);
        });

        // ── Typvorteil und die Faehigkeiten, die ganz abfangen ──────
        let eff = opts.effectiveness == null ? 1 : opts.effectiveness;
        const durchbricht = (a.ability === 'Mold Breaker' || a.ability === 'Teravolt'
            || a.ability === 'Turboblaze');
        if (!durchbricht && IMMUN_FAEHIGKEIT[d.ability] === move.type) {
            merke(d.ability);
            return { rolls: new Array(16).fill(0), min: 0, max: 0, minPct: 0, maxPct: 0,
                     effectiveness: 0, stab: 1, ko: null, immune: true,
                     immunGrund: d.ability, angewendet, unbelegt };
        }
        if (durchbricht && IMMUN_FAEHIGKEIT[d.ability] === move.type) merke('Mold Breaker');
        /* Kugelsicher und Schallmauer fangen nicht einen TYP ab, sondern
           eine BAUART — sie brauchen deshalb die Merkmale und standen bis
           zum 16.09.2026 in NICHT_BELEGT. */
        const merkmalImmun = (!durchbricht && (
            (d.ability === 'Bulletproof' && hatMerkmal(move, 'bullet') && 'Bulletproof')
            || (d.ability === 'Soundproof' && hatMerkmal(move, 'sound') && 'Soundproof')));
        if (merkmalImmun) {
            merke(merkmalImmun);
            return { rolls: new Array(16).fill(0), min: 0, max: 0, minPct: 0, maxPct: 0,
                     effectiveness: 0, stab: 1, ko: null, immune: true,
                     immunGrund: merkmalImmun, angewendet, unbelegt };
        }
        if (eff === 0) {
            return { rolls: new Array(16).fill(0), min: 0, max: 0, minPct: 0, maxPct: 0,
                     effectiveness: 0, stab: 1, ko: null, immune: true,
                     angewendet, unbelegt };
        }

        // ── 1. Grundstaerke ─────────────────────────────────────────
        const bpMods = [];
        if (a.ability === 'Technician' && power <= 60) { bpMods.push(0x1800); merke('Technician'); }
        /* ×1,2 */
        if (a.ability === 'Iron Fist' && hatMerkmal(move, 'punch')) { bpMods.push(0x1333); merke('Iron Fist'); }
        if (a.ability === 'Reckless' && move.recoil) { bpMods.push(0x1333); merke('Reckless'); }
        /* ×1,3 */
        if (a.ability === 'Sheer Force' && move.zusatzeffekt) { bpMods.push(0x14CD); merke('Sheer Force'); }
        if (a.ability === 'Tough Claws' && hatMerkmal(move, 'contact')) { bpMods.push(0x14CD); merke('Tough Claws'); }
        if (a.ability === 'Punk Rock' && hatMerkmal(move, 'sound')) { bpMods.push(0x14CD); merke('Punk Rock'); }
        /* ×1,5 */
        if (a.ability === 'Mega Launcher' && hatMerkmal(move, 'pulse')) { bpMods.push(0x1800); merke('Mega Launcher'); }
        if (a.ability === 'Strong Jaw' && hatMerkmal(move, 'bite')) { bpMods.push(0x1800); merke('Strong Jaw'); }
        if (a.ability === 'Analytic' && opts.langsamer) { bpMods.push(0x14CD); merke('Analytic'); }
        if (TYP_ITEM[a.item] === move.type) { bpMods.push(0x1333); merke(a.item); }
        if (a.item === 'Muscle Band' && physical) { bpMods.push(0x1199); merke('Muscle Band'); }
        if (a.item === 'Wise Glasses' && !physical) { bpMods.push(0x1199); merke('Wise Glasses'); }
        if (a.item === 'Normal Gem' && move.type === 'Normal') { bpMods.push(0x14CD); merke('Normal Gem'); }
        /* HILFREICHE HAND — der Partner schlaegt mit.
           16.09.2026, auf Ansage: „Hilfreiche Hand + Helfer (Doubles)".
           Sie ist ein GRUNDSTAERKE-Modifikator (×1,5, 0x1800), kein
           Angriffs-Modifikator; die Reihenfolge entscheidet ueber die
           letzte Stelle, weil jede Kette fuer sich mit pokeRound
           schliesst. Belegt: Showdowns Rechenkern fuehrt sie in
           calculateBPMods mit 6144 = 0x1800.

           Sie gehoert der ANGREIFERSEITE: ein Partner hilft dem, der
           schlaegt, nicht dem, der getroffen wird. */
        if (f.helpingHand) { bpMods.push(0x1800); merke('Helping Hand'); }
        const gelaende = String(f.terrain || '');
        if (gelaende === 'Grassy' && move.type === 'Grass') { bpMods.push(0x14CD); merke('Grassy Terrain'); }
        if (gelaende === 'Electric' && move.type === 'Electric') { bpMods.push(0x14CD); merke('Electric Terrain'); }
        if (gelaende === 'Psychic' && move.type === 'Psychic') { bpMods.push(0x14CD); merke('Psychic Terrain'); }
        const staerke = Math.max(1, pokeRound(power * chainMods(bpMods) / M));

        // ── 2. Angriff ──────────────────────────────────────────────
        let atk = physical ? opts.attackerStats.atk : opts.attackerStats.spa;
        const boostAtk = physical ? a.boosts.atk : a.boosts.spa;
        if (boostAtk) { atk = stufe(atk, boostAtk); merke((boostAtk > 0 ? '+' : '') + boostAtk + (physical ? ' Angriff' : ' Sp.-Angriff')); }
        const atMods = [];
        if ((a.ability === 'Huge Power' || a.ability === 'Pure Power') && physical) { atMods.push(0x2000); merke(a.ability); }
        if (a.ability === 'Hustle' && physical) { atMods.push(0x1800); merke('Hustle'); }
        if (a.ability === 'Guts' && physical && a.status) { atMods.push(0x1800); merke('Guts'); }
        if (a.ability === 'Solar Power' && !physical && String(f.weather || '') === 'Sun') { atMods.push(0x1800); merke('Solar Power'); }
        if (a.ability === 'Water Bubble' && move.type === 'Water') { atMods.push(0x2000); merke('Water Bubble'); }
        /* Scharfkantig liegt auf dem ANGRIFF, nicht auf der Staerke —
           NCP damage_MASTER.js Zeile 1960, atMods. */
        if (a.ability === 'Sharpness' && hatMerkmal(move, 'slicing')) { atMods.push(0x1800); merke('Sharpness'); }
        if (NOTLAGE[a.ability] === move.type && a.hpAnteil <= 1 / 3) { atMods.push(0x1800); merke(a.ability); }
        if (!durchbricht && d.ability === 'Thick Fat' && (move.type === 'Fire' || move.type === 'Ice')) { atMods.push(0x800); merke('Thick Fat'); }
        if (!durchbricht && d.ability === 'Heatproof' && move.type === 'Fire') { atMods.push(0x800); merke('Heatproof'); }
        atk = Math.max(1, pokeRound(atk * chainMods(atMods) / M));

        // ── 3. Verteidigung ─────────────────────────────────────────
        let def = physical ? opts.defenderStats.def : opts.defenderStats.spd;
        const boostDef = physical ? d.boosts.def : d.boosts.spd;
        if (boostDef) { def = stufe(def, boostDef); merke((boostDef > 0 ? '+' : '') + boostDef + (physical ? ' Verteidigung' : ' Sp.-Verteidigung')); }
        const dfMods = [];
        if (d.ability === 'Fur Coat' && physical) { dfMods.push(0x2000); merke('Fur Coat'); }
        if (d.ability === 'Marvel Scale' && physical && d.status) { dfMods.push(0x1800); merke('Marvel Scale'); }
        if (d.ability === 'Grass Pelt' && physical && gelaende === 'Grassy') { dfMods.push(0x1800); merke('Grass Pelt'); }
        def = Math.max(1, pokeRound(def * chainMods(dfMods) / M));

        const hp = opts.defenderStats.hp;
        if (!atk || !def || !hp) return null;

        // ── 4. Grundschaden ─────────────────────────────────────────
        let grund = Math.floor(Math.floor(
            Math.floor((2 * LEVEL) / 5 + 2) * staerke * atk / def) / 50) + 2;

        // Flaeche und Wetter liegen VOR dem Wurf — genau das war der
        // Fehler der alten Fassung.
        const flaeche = doppel && !!opts.spread;
        if (flaeche) { grund = pokeRound(grund * 0xC00 / M); merke('Flächenabzug'); }
        const wetter = String(f.weather || '');
        if ((wetter === 'Sun' && move.type === 'Fire') || (wetter === 'Rain' && move.type === 'Water')) {
            grund = pokeRound(grund * 0x1800 / M); merke(wetter === 'Sun' ? 'Sonne' : 'Regen');
        } else if ((wetter === 'Sun' && move.type === 'Water') || (wetter === 'Rain' && move.type === 'Fire')) {
            grund = pokeRound(grund * 0x800 / M); merke(wetter === 'Sun' ? 'Sonne' : 'Regen');
        }
        if (opts.crit) { grund = Math.floor(grund * 1.5); merke('Volltreffer'); }
        // Alte Form: ein freier Faktor. Bleibt erhalten, damit ein
        // Aufrufer, der etwas Eigenes rechnet, nicht stillschweigend
        // etwas anderes bekommt.
        if (opts.extraMultiplier && opts.extraMultiplier !== 1) {
            grund = pokeRound(grund * opts.extraMultiplier);
        }

        // ── 5. STAB ─────────────────────────────────────────────────
        let stabMod = M;
        if ((opts.attackerTypes || a.types || []).indexOf(move.type) !== -1) {
            stabMod = (a.ability === 'Adaptability') ? 0x2000 : 0x1800;
            if (a.ability === 'Adaptability') merke('Adaptability');
        }

        // ── 6. Verbrennung ──────────────────────────────────────────
        const verbrannt = physical && a.status === 'burn' && a.ability !== 'Guts';
        if (verbrannt) merke('Verbrennung');

        // ── 7. Die Schlusskette ─────────────────────────────────────
        const finalMods = [];
        const schirm = !opts.crit && (
            (f.auroraVeil && 'Aurora Veil')
            || (f.reflect && physical && 'Reflect')
            || (f.lightScreen && !physical && 'Light Screen'));
        if (schirm) { finalMods.push(doppel ? 0xAAC : 0x800); merke(schirm); }
        if (!durchbricht && d.ability === 'Multiscale' && d.hpAnteil >= 1) { finalMods.push(0x800); merke('Multiscale'); }
        if (!durchbricht && (d.ability === 'Filter' || d.ability === 'Solid Rock') && eff > 1) {
            finalMods.push(0xC00); merke(d.ability);
        }
        if (!durchbricht && d.ability === 'Purifying Salt' && move.type === 'Ghost') { finalMods.push(0x800); merke('Purifying Salt'); }
        if (!durchbricht && d.ability === 'Fluffy' && hatMerkmal(move, 'contact')) { finalMods.push(0x800); merke('Fluffy'); }
        if (!durchbricht && d.ability === 'Fluffy' && move.type === 'Fire') { finalMods.push(0x2000); merke('Fluffy'); }
        if (!durchbricht && d.ability === 'Punk Rock' && hatMerkmal(move, 'sound')) { finalMods.push(0x800); merke('Punk Rock'); }
        /* HELFER (Friend Guard) — der Partner deckt mit.
           ×0,75 (0xC00) auf alles, was auf DIESE Seite einschlaegt,
           also ein Modifikator der VERTEIDIGERSEITE. Belegt: Showdowns
           calculateFinalMods fuehrt sie mit 3072 = 0xC00. Wie beim
           Schirm zaehlt die Seite, auf der sie steht — nicht die, von
           der sie ausgeht.

           Anders als der Schirm wirkt sie AUCH bei einem Volltreffer:
           der Volltreffer hebt Schirme auf, nicht Faehigkeiten. */
        if (f.friendGuard) { finalMods.push(0xC00); merke('Friend Guard'); }
        if (a.item === 'Expert Belt' && eff > 1) { finalMods.push(0x1333); merke('Expert Belt'); }
        else if (a.item === 'Life Orb') { finalMods.push(0x14CC); merke('Life Orb'); }
        const beere = RESIST_BEERE[d.item];
        if (beere === move.type && (eff > 1 || move.type === 'Normal')) {
            finalMods.push(0x800); merke(d.item);
        }
        const schluss = chainMods(finalMods);

        const rolls = [];
        for (let i = 0; i < 16; i++) {
            let v = Math.floor(grund * (85 + i) / 100);
            v = pokeRound(v * stabMod / M);
            v = Math.floor(v * eff);
            if (verbrannt) v = Math.floor(v / 2);
            v = pokeRound(v * schluss / M);
            rolls.push(Math.max(1, v));
        }
        const min = rolls[0], max = rolls[rolls.length - 1];
        const round1 = (v) => Math.round(v * 1000) / 10;   // 74.52 -> 74.5
        return {
            rolls, min, max,
            minPct: round1(min / hp), maxPct: round1(max / hp),
            effectiveness: eff, stab: stabMod / M,
            ko: koChance(rolls, hp, ueberlebt(d, hp)),
            angewendet, unbelegt,
        };
    }

    // Focus Sash und Robustheit halten EINEN Treffer aus vollen KP auf
    // 1 KP aus. Das ist keine Schadensfrage, sondern eine KO-Frage —
    // und ohne sie behauptet die Zeile einen OHKO, den es nicht gibt.
    // Gemessen im Bestand: Focus Sash ist der dritthäufigste Gegenstand
    // (397 Arteneintraege), Robustheit tragen 9 Arten.
    function ueberlebt(d, hp) {
        if (d.hpAnteil < 1) return null;
        if (d.item === 'Focus Sash') return 'Focus Sash';
        if (d.ability === 'Sturdy') return 'Sturdy';
        return null;
    }

    // How many hits koChance() looks ahead. Beyond this the answer stops
    // being useful — nothing in this format survives nine hits of a move
    // that can damage it at all — and the return says so explicitly
    // instead of pretending to a number.
    const KO_MAX_HITS = 9;

    /**
     * The honest KO statement. "OHKO" is only true when the LOWEST roll
     * kills; when only some rolls do, the share of rolls that get there
     * is the answer, and hiding it would overstate the result.
     *
     * ── Two things were wrong here until 20.08.2026 ──
     *
     * 1. `rolls.filter(r => r * hits >= hp)` asked "does ONE roll,
     *    multiplied by the hit count, kill?". That is not n hits — it is
     *    the same hit happening n times. Real damage over n hits is the
     *    SUM OF n INDEPENDENT DRAWS from the 16 rolls, and that sum is
     *    far more concentrated than one roll scaled up.
     *
     *    The hit COUNT came out right either way (min·n and max·n bound
     *    the sum correctly). The CHANCE did not. Swept over 2.556
     *    base-damage / HP combinations: the reported chance was off by
     *    more than half a point in 53,3 % of them, by up to 43,8
     *    percentage points. Base damage 13 into 45 HP read "4HKO 50 %";
     *    the true figure is 93,8 %. The old form could also only ever
     *    print sixteenths — 50 %, 56 %, 62 % — because it counted
     *    single rolls no matter how many hits it was talking about.
     *
     * 2. The loop stopped at four hits and then returned
     *    `{ hits: 5, chance: 0 }`. "5+HKO 0 %" says "five hits will not
     *    kill it", which is the opposite of the truth whenever five hits
     *    do. In a 21.336-combination sweep, 332 rows said 0 % where the
     *    LOWEST roll five times over already kills — a guaranteed 5HKO
     *    printed as impossible.
     *
     * The distribution is now built exactly, by convolution, one hit at a
     * time, and the loop stops at the first hit count that can kill at
     * all. No sampling: with 16 integer rolls the support stays small
     * (a few dozen sums), so the exact answer is also the cheap one.
     *
     * Returns { hits, chance } — or { hits: null, chance: 0 } when even
     * KO_MAX_HITS hits of the highest roll cannot get there.
     */
    function koChance(rolls, hp) {
        if (!hp) return null;
        if (!rolls || !rolls.length) return null;

        // Verteilung der Summe nach n Treffern, als Map Summe -> Wahrscheinlichkeit.
        // Startpunkt ist "null Treffer, Schaden 0 mit Sicherheit".
        let verteilung = new Map([[0, 1]]);
        const p = 1 / rolls.length;

        for (let hits = 1; hits <= KO_MAX_HITS; hits++) {
            const naechste = new Map();
            for (const [summe, wk] of verteilung) {
                for (let i = 0; i < rolls.length; i++) {
                    const s = summe + rolls[i];
                    naechste.set(s, (naechste.get(s) || 0) + wk * p);
                }
            }
            verteilung = naechste;

            let chance = 0;
            for (const [summe, wk] of verteilung) {
                if (summe >= hp) chance += wk;
            }
            if (chance > 0) {
                // Gleitkomma: 0,9999999999 ist eine Garantie, kein 99,99 %.
                if (chance > 1 - 1e-9) return { hits, chance: 1 };
                return { hits, chance };
            }

            // Wenn selbst der hoechste Wurf n-mal nicht reicht, brauchen
            // wir die kleinen Summen nicht weiterzutragen — alles unter
            // (hp - (KO_MAX_HITS - hits) * maxWurf) kann nie ankommen.
            // Ohne das waechst die Map bei sehr grossen Trefferzahlen
            // unnoetig.
            const maxWurf = rolls[rolls.length - 1];
            const untergrenze = hp - (KO_MAX_HITS - hits) * maxWurf;
            if (untergrenze > 0) {
                for (const summe of verteilung.keys()) {
                    if (summe < untergrenze) verteilung.delete(summe);
                }
                if (!verteilung.size) break;
            }
        }
        return { hits: null, chance: 0 };
    }

    // Ties count as "not faster" — going first on a speed tie is a coin
    // flip, and calling it faster would be wrong half the time.
    function speedComparison(mine, theirs) {
        if (mine === theirs) return { faster: false, tie: true, mine, theirs };
        return { faster: mine > theirs, tie: false, mine, theirs };
    }

    global.ChampionsDamage = {
        LEVEL, ROLLS, NATURES, KO_MAX_HITS,
        statAt50, hpAt50, natureMult, buildStats,
        makeChart, damageRange, koChance, speedComparison,
        /* Die Bausteine der Rechnung nach aussen, damit eine Zusicherung
           sie EINZELN pruefen kann. Eine Kette, die nur im Ganzen
           pruefbar ist, wird beim ersten Fehler zur Suche im Heuhaufen. */
        pokeRound, chainMods, stufe, hatMerkmal,
        TYP_ITEM, RESIST_BEERE, IMMUN_FAEHIGKEIT, NOTLAGE, NICHT_BELEGT,
    };
})(typeof window !== 'undefined' ? window : globalThis);
