/**
 * Der Schadensrechner: vier Ketten statt einer Multiplikation
 * ===========================================================
 *
 * GEMELDET am 16.09.2026: „unser Damage Culc ist ja eine Katastrophe,
 * analysiere bitte noch mal
 * https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/ und optimiere
 * unseren".
 *
 * NACHGELESEN im Quelltext jenes Rechners (MIT-Lizenz, Honko / Tapin /
 * Firestorm / squirrelboyVGC / nerd-of-now):
 * script_res/damage_MASTER.js (`chainMods`, `pokeRound`,
 * `calcGeneralMods`, `calcFinalMods`) und script_res/damage_SV.js
 * (`GET_DAMAGE_SV`). Die Reihenfolge dort ist nicht Geschmackssache,
 * sondern die des Spiels.
 *
 * GEMESSEN, was der alte Weg gekostet hat — die alte Formel woertlich
 * nachgebaut und gegen die neue gehalten, ueber die echten Daten
 * (247 Bauten aus champions_usage.json, ihre meistgenutzten Attacken
 * gegen 40 Ziele, 23.880 Paare):
 *
 *     abweichend:            4.419 Paare = 18,5 %
 *     groesste Abweichung:   96 Schadenspunkte
 *     nach Ursache:  Flaechenabzug 2.262 · Life Orb 1.664
 *                    STAB-Rundung 479 · Expert Belt 14
 *
 * Die drei Ursachen sind dieselben drei Stellen:
 *   1. Flaechenabzug und Wetter lagen HINTER dem Wurf statt davor.
 *   2. STAB lief ueber floor statt pokeRound.
 *   3. Life Orb / Expert Belt lagen in derselben Klammer wie der
 *      Typvorteil statt in einer eigenen Schlusskette.
 *
 * VERFAELSCHUNGSPROBE (16.09.2026, jede einzeln gefahren):
 *   pokeRound -> Math.round          : „halbe Werte runden ab" faellt um
 *   0xC00 hinter den Wurf verschoben : „Flaeche vor dem Wurf" faellt um
 *   0x14CC -> 1.3                    : „Life Orb rechnet im Festkomma" faellt um
 *   Bedroher-Zweig entfernt          : „Bedroher senkt den Angriff" faellt um
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const kasten = { window: {}, console };
vm.createContext(kasten);
vm.runInContext(fs.readFileSync(path.join(WURZEL, 'js', 'champions-damage.js'), 'utf8'), kasten);
const CD = kasten.window.ChampionsDamage;

const TYPTAFEL = JSON.parse(fs.readFileSync(
    path.join(WURZEL, 'data', 'champions_type_chart.json'), 'utf8'));
const eff = CD.makeChart(TYPTAFEL);

/* Zwei gesetzte Bauten. Die Zahlen sind frei gewaehlt, aber FEST — an
   echten Nutzungsdaten haengt diese Datei absichtlich nicht, sonst
   prueft sie den naechtlichen Lauf statt die Rechnung. */
const ANG = { atk: 200, spa: 150, def: 100, spd: 100, hp: 180, spe: 120 };
const VER = { atk: 100, spa: 100, def: 120, spd: 130, hp: 190, spe: 90 };

function schlag(extra) {
    return CD.damageRange(Object.assign({
        move: { en: 'Prüfschlag', type: 'Rock', power: 90, damage_class: 'Physical' },
        attackerStats: ANG, defenderStats: VER,
        attackerTypes: ['Rock'],
        effectiveness: 1,
    }, extra || {}));
}

describe('Das Festkomma und seine Rundung', () => {
    it('halbe Werte runden ab, nicht auf', () => {
        /* pokeRound: 0,5 geht nach unten, 0,5000001 nach oben. Mit
           Math.round waere die halbe Zahl aufgerundet — genau der
           Unterschied, der einen Schadenspunkt verschiebt. */
        const r = CD.pokeRound;
        assert.equal(r(2.5), 2, 'pokeRound(2,5) muss 2 sein, nicht 3');
        assert.equal(r(2.500001), 3);
        assert.equal(r(3.5), 3);
        assert.equal(r(-0.5), -1, 'auch unter null wird abgeschnitten');
    });

    it('eine Kette aus lauter Einsen aendert nichts', () => {
        assert.equal(CD.chainMods([0x1000, 0x1000]), 0x1000);
    });

    it('die Kette rechnet im Festkomma, nicht in Kommazahlen', () => {
        // 1,5 × 1,5 = 2,25 → 0x2400
        assert.equal(CD.chainMods([0x1800, 0x1800]), 0x2400);
    });
});

describe('Die Reihenfolge — was vor und was nach dem Wurf liegt', () => {
    it('der Flächenabzug liegt VOR dem Wurf', () => {
        /* Der Beweis, dass er davor liegt: liegt er davor, ist jeder
           Wurf das Ergebnis EINER gerundeten Grundzahl, und der Abstand
           zwischen kleinstem und groesstem Wurf schrumpft mit. Laege er
           dahinter, waere jeder Wurf einzeln um 0,75 gekuerzt und das
           Verhaeltnis min/max bliebe exakt gleich. */
        const ohne = schlag({ spread: false, field: { doubles: true } });
        const mit = schlag({ spread: true, field: { doubles: true } });
        assert.ok(mit.max < ohne.max, 'Fläche muss den Schaden senken');
        const vOhne = ohne.max - ohne.min, vMit = mit.max - mit.min;
        assert.ok(vMit < vOhne,
            'Läge der Abzug hinter dem Wurf, bliebe die Spanne breiter. '
            + `Spanne ohne ${vOhne}, mit ${vMit}`);
        assert.ok(mit.angewendet.indexOf('Flächenabzug') !== -1);
    });

    it('Sonne verstärkt Feuer und schwächt Wasser', () => {
        const feuer = { move: { type: 'Fire', power: 90, damage_class: 'Special' },
            attackerStats: ANG, defenderStats: VER, attackerTypes: [], effectiveness: 1 };
        const normal = CD.damageRange(feuer);
        const sonne = CD.damageRange(Object.assign({}, feuer, { field: { weather: 'Sun' } }));
        assert.ok(sonne.max > normal.max, 'Sonne muss Feuer verstärken');
        assert.ok(sonne.angewendet.indexOf('Sonne') !== -1);
        const wasser = Object.assign({}, feuer, { move: { type: 'Water', power: 90, damage_class: 'Special' } });
        const nass = CD.damageRange(Object.assign({}, wasser, { field: { weather: 'Sun' } }));
        assert.ok(nass.max < CD.damageRange(wasser).max, 'Sonne muss Wasser schwächen');
    });

    it('Life Orb rechnet mit 0x14CC, nicht mit 1,3 und nicht mit 0x14CD', () => {
        /* 0x14CC/0x1000 = 1,29980…, nicht 1,3 — und der Nachbarwert
           0x14CD trennt sich davon ebenfalls. Damit die Zusicherung
           beides fängt, steht hier ein Fall, in dem alle drei
           auseinandergehen: gesucht und gefunden über die Rundung,
           bei einem Wurf von 25 gibt 0x14CC 32 und 0x14CD 33.

           Gerechnet wird das über eine schwache Attacke, deren Würfe in
           genau diesen Bereich fallen. */
        const klein = { move: { type: 'Rock', power: 20, damage_class: 'Physical' },
            attackerStats: { atk: 60, spa: 60 }, defenderStats: { def: 120, spd: 120, hp: 190 },
            attackerTypes: [], effectiveness: 1 };
        const ohne = CD.damageRange(klein);
        const mit = CD.damageRange(Object.assign({}, klein, { attacker: { item: 'Life Orb' } }));
        assert.ok(mit.angewendet.indexOf('Life Orb') !== -1);

        const erwartet = ohne.rolls.map(v => CD.pokeRound(v * 0x14CC / 0x1000));
        assert.deepEqual(Array.from(mit.rolls), erwartet,
            'Life Orb muss genau pokeRound(wurf · 0x14CC / 0x1000) sein');

        const nachbar = ohne.rolls.map(v => CD.pokeRound(v * 0x14CD / 0x1000));
        assert.notDeepEqual(erwartet, nachbar,
            'Vorbedingung: der Fall muss 0x14CC von 0x14CD trennen — sonst prüft die Zeile nichts');
        const glatt = ohne.rolls.map(v => Math.floor(v * 1.3));
        assert.notDeepEqual(erwartet, glatt,
            'Vorbedingung: der Fall muss das Festkomma von glattem 1,3 trennen');
    });
});

describe('Fähigkeiten und Gegenstände beider Seiten', () => {
    it('Bedroher senkt den Angriff um eine Stufe', () => {
        /* Als Statusstufe, nicht als Multiplikator: −1 ist ×2/3 mit
           Abschneiden, und das ist nicht dasselbe wie ×0,667. */
        const ohne = schlag({});
        const mit = schlag({ attacker: { boosts: { atk: -1 } } });
        assert.ok(mit.max < ohne.max);
        const erwartet = Math.floor(ANG.atk * 2 / 3);
        const probe = CD.damageRange({
            move: { type: 'Rock', power: 90, damage_class: 'Physical' },
            attackerStats: Object.assign({}, ANG, { atk: erwartet }),
            defenderStats: VER, attackerTypes: ['Rock'], effectiveness: 1,
        });
        assert.deepEqual(Array.from(mit.rolls), Array.from(probe.rolls),
            '−1 Angriff muss genau floor(atk · 2/3) sein');
    });

    it('Schwebe fängt eine Boden-Attacke ganz ab — und nennt den Grund', () => {
        const r = CD.damageRange({
            move: { type: 'Ground', power: 100, damage_class: 'Physical' },
            attackerStats: ANG, defenderStats: VER, attackerTypes: [],
            effectiveness: eff('Ground', ['Normal']),
            defender: { ability: 'Levitate' },
        });
        assert.ok(r.immune, 'Schwebe muss Boden abfangen');
        assert.equal(r.immunGrund, 'Levitate');
        assert.equal(r.max, 0);
    });

    it('Rauhaut-Durchbruch hebt die Abwehrfähigkeit auf', () => {
        const r = CD.damageRange({
            move: { type: 'Ground', power: 100, damage_class: 'Physical' },
            attackerStats: ANG, defenderStats: VER, attackerTypes: [], effectiveness: 1,
            attacker: { ability: 'Mold Breaker' }, defender: { ability: 'Levitate' },
        });
        assert.ok(!r.immune, 'Überbrückung muss Schwebe aushebeln');
        assert.ok(r.angewendet.indexOf('Mold Breaker') !== -1);
    });

    it('eine Widerstandsbeere halbiert nur den sehr effektiven Treffer', () => {
        const se = { move: { type: 'Dark', power: 90, damage_class: 'Physical' },
            attackerStats: ANG, defenderStats: VER, attackerTypes: [] };
        const ohne = CD.damageRange(Object.assign({}, se, { effectiveness: 2 }));
        const mit = CD.damageRange(Object.assign({}, se, { effectiveness: 2,
            defender: { item: 'Colbur Berry' } }));
        assert.ok(mit.max < ohne.max, 'gegen sehr effektiv muss sie greifen');
        const neutralOhne = CD.damageRange(Object.assign({}, se, { effectiveness: 1 }));
        const neutralMit = CD.damageRange(Object.assign({}, se, { effectiveness: 1,
            defender: { item: 'Colbur Berry' } }));
        assert.equal(neutralMit.max, neutralOhne.max,
            'gegen einen neutralen Treffer darf sie nichts tun');
    });

    it('Schirme wirken im Doppelkampf schwächer als im Einzelkampf', () => {
        /* 0xAAC statt 0x800 — im Doppel bleiben zwei Drittel stehen,
           nicht die Hälfte. Wer hier 0,5 einsetzt, rechnet jeden
           Doppelkampf falsch. */
        const einzel = schlag({ field: { reflect: true, doubles: false } });
        const doppel = schlag({ field: { reflect: true, doubles: true } });
        const roh = schlag({});
        assert.ok(einzel.max < doppel.max && doppel.max < roh.max,
            `Einzel ${einzel.max} < Doppel ${doppel.max} < ohne ${roh.max}`);
    });

    it('Technik verstärkt nur schwache Attacken', () => {
        const schwach = { move: { type: 'Rock', power: 60, damage_class: 'Physical' },
            attackerStats: ANG, defenderStats: VER, attackerTypes: [], effectiveness: 1 };
        const stark = Object.assign({}, schwach,
            { move: { type: 'Rock', power: 61, damage_class: 'Physical' } });
        assert.ok(CD.damageRange(Object.assign({}, schwach, { attacker: { ability: 'Technician' } })).max
            > CD.damageRange(schwach).max, '60 muss verstärkt werden');
        assert.equal(CD.damageRange(Object.assign({}, stark, { attacker: { ability: 'Technician' } })).max,
            CD.damageRange(stark).max, '61 darf nicht mehr verstärkt werden');
    });
});

describe('Was der Rechner NICHT kann, sagt er selbst', () => {
    it('eine Fähigkeit ohne Datengrundlage wird gemeldet, nicht geraten', () => {
        /* Eisenfaust braucht die Kennzeichnung „Faustattacke". Die
           Attackendaten führen sie nicht — also wird nichts verstärkt
           UND der Aufrufer erfährt warum. Stillschweigend nichts zu tun
           wäre dasselbe Ergebnis mit einer Lüge davor. */
        const r = schlag({ attacker: { ability: 'Iron Fist' } });
        assert.ok(r.unbelegt.indexOf('Iron Fist') !== -1,
            'Eisenfaust muss in `unbelegt` stehen');
        assert.equal(r.max, schlag({}).max, 'und darf nichts verändern');
    });

    it('jeder wirksame Modifikator steht namentlich im Ergebnis', () => {
        const r = schlag({ attacker: { item: 'Life Orb', ability: 'Technician' },
            spread: true, field: { doubles: true, weather: 'Sun' } });
        assert.ok(r.angewendet.indexOf('Life Orb') !== -1);
        assert.ok(r.angewendet.indexOf('Flächenabzug') !== -1);
        assert.ok(Array.isArray(r.angewendet) && r.angewendet.length > 0,
            'Eine Zahl ohne Herkunft ist in diesem Projekt keine Zahl.');
    });
});

describe('Die Festpunkte von vorher halten', () => {
    it('Kingambit Eisenschädel in Sneasler bleibt 117–138', () => {
        /* Die Probe, die vor dem Umbau schon galt (siehe Dateikopf von
           js/champions-damage.js). Sie muss den Umbau überleben —
           sonst war er keine Korrektur, sondern eine Änderung. */
        const kb = CD.buildStats({ hp: 100, atk: 135, def: 120, spa: 60, spd: 85, spe: 50 },
            { hp: 32, atk: 32, spd: 1, spe: 1 }, 'Adamant');
        assert.equal(kb.hp, 207); assert.equal(kb.atk, 205); assert.equal(kb.def, 140);
        assert.equal(kb.spa, 72); assert.equal(kb.spd, 106); assert.equal(kb.spe, 71);
    });
});
