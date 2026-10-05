/**
 * BEFUND C6 / F15.19-F15.24 (Reiter "Laufendes Meta", Tier-Liste,
 * gemessen 07.09.2026):
 *
 *   Mega Excadrill (7,3 % Anteil) steht UNTER Slowking (5,5 %). Die
 *   Reihenfolge folgt computeTierScore(), also einem zusammengesetzten
 *   Wert — auf der Seite stand dazu kein Wort. Wer die Liste fuer eine
 *   Rangfolge nach Anteil haelt, liest das als Rechenfehler.
 *   cmTierGrundlageZeile() schreibt diesen Satz jetzt.
 *
 * BEFUND B2 (Nachmessung am selben Tag) — UND WARUM DIESE DATEI
 * UMGESCHRIEBEN WURDE:
 *
 *   Der Kommentar behauptete, die Zahlen des Satzes kaemen aus den
 *   Konstanten. Fuer 6 von 17 stimmte das; 11 waren an der Aufrufstelle
 *   als Literale wiederholt (50, 15, 0,6, 10, 0,8, 15, 12, 1,5, 0,4, 8,
 *   10). Und dieser Test hat es gedeckt: er las die Zahlen mit regulaeren
 *   Ausdruecken AUS DEM QUELLTEXT und reichte sie SELBST in den Satz
 *   hinein. Damit verglich er den Quelltext mit sich selbst — die
 *   Aufrufstelle kam gar nicht vor. Vier Mutationen liefen gruen durch.
 *
 *   Jetzt wird von zwei Seiten geprueft, und keine der beiden schreibt
 *   eine Zahl ab:
 *
 *   (A) DURCHREICHEN. Das Objektliteral der Aufrufstelle wird aus der
 *       Datei geschnitten und AUSGEFUEHRT — mit erfundenen Kennwerten
 *       statt der echten Konstanten. Steht rechts vom Doppelpunkt ein
 *       Name, taucht der Kennwert im Satz auf. Steht dort ein Literal,
 *       taucht er nicht auf und der Test faellt.
 *
 *   (B) STIMMT DIE ZAHL MIT DER RECHNUNG UEBEREIN. computeTierScore()
 *       wird ausgefuehrt und aus ihrem VERHALTEN werden Deckel, Gewichte,
 *       Vorwert und Labs-Schwelle gemessen — Anteil hochdrehen, bis der
 *       Beitrag stehen bleibt; Partien variieren und den Vorwert
 *       zurueckrechnen. Diese gemessenen Werte muessen den Zahlen
 *       entsprechen, die im gerenderten Satz stehen.
 *
 *   (A) faengt "Literal an der Aufrufstelle", (B) faengt "Literal in der
 *   Rechnung". Zusammen kann der Satz nicht mehr von der Rechnung
 *   abwandern, egal an welchem Ende jemand schreibt.
 *
 * Keine Live-Daten: alle Eingaben setzt der Test. Die Zahlen der
 * Beispielrechnungen unten (315, 3.138, ...) sind TESTVORGABEN, keine
 * gemessenen Seitenwerte.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { QUELLE, funktion, schnitt } = require('./lib-tier-sandkasten.js');

// ───────────────────────────────────────────────────────────────────
// Die echte Rechnung, ausgefuehrt.
// ───────────────────────────────────────────────────────────────────
const RECHNUNG = (() => {
    const kasten = { Math, Number, String, Object, Array, JSON };
    vm.createContext(kasten);
    vm.runInContext(
        schnitt('const TIER_SCORE = Object.freeze({', 'const TIER_SCORE = Object.freeze({')
        + '\n' + funktion('computeTierScore')
        // const-Deklarationen landen nicht von selbst am Kontextobjekt.
        + '\n;globalThis.TIER_SCORE = TIER_SCORE;', kasten);
    return kasten;
})();

const wert = (deck, labs) => RECHNUNG.computeTierScore(deck, labs || null);
/** Ein Deck ohne Partien: adjWR faellt auf 50, wrComp auf 0. */
const nurAnteil = (share) => wert({ share, winrate: 0, new_count: 0 }).shareComp;
/** Ein Labs-Eintrag ueber der Schwelle, damit nur der gefragte Teil zaehlt. */
const nurLabs = (winPct, day2Conv) => wert(
    { share: 0, winrate: 0, new_count: 0, archetype: 'X' },
    { X: { games: 1e6, winPct, day2Conv } }).labsComp;

/** Gewicht und Deckel eines Bestandteils aus seinem Verlauf ablesen. */
function gewichtUndDeckel(f, schritt) {
    const gewicht = (f(schritt) - f(0)) / schritt;
    const deckel = f(1e9) / gewicht;
    return { gewicht, deckel };
}

const GEMESSEN = (() => {
    const anteil = gewichtUndDeckel(nurAnteil, 1);
    const labsWr = gewichtUndDeckel((d) => nurLabs(50 + d, 0), 1);
    const tag2 = gewichtUndDeckel((c) => nurLabs(50, c), 0.01);

    // Vorwert: adjWR = (n*r/100 + P*0,5) / (n + P) * 100, nach P aufgeloest.
    // n ist die LISTENzahl (BEFUND B1), nicht eine Partienzahl.
    const g = 400, r = 100;
    const a = wert({ share: 0, winrate: r, new_count: g }).adjWR;
    const vorListen = g * (r - a) / (a - 50);

    // Win-%-Bestandteil: zwei Punkte unter dem Deckel, einer weit darueber.
    const p1 = wert({ share: 0, winrate: 52, new_count: 4000 });
    const p2 = wert({ share: 0, winrate: 56, new_count: 4000 });
    const wrGewicht = (p2.wrComp - p1.wrComp) / (p2.adjWR - p1.adjWR);
    const wrDeckel = wert({ share: 0, winrate: 100, new_count: 1e9 }).wrComp / wrGewicht;

    // Labs-Schwelle: die kleinste Partienzahl, bei der labsHit umspringt.
    let labsMinPartien = null;
    for (let n = 1; n <= 500 && labsMinPartien === null; n++) {
        if (wert({ share: 0, winrate: 0, new_count: 0, archetype: 'X' },
            { X: { games: n, winPct: 60, day2Conv: 0 } }).labsHit) labsMinPartien = n;
    }

    return {
        anteilDeckel: anteil.deckel, anteilGewicht: anteil.gewicht,
        wrDeckel, wrGewicht, vorListen,
        labsWrDeckel: labsWr.deckel, labsWrGewicht: labsWr.gewicht,
        tag2Deckel: tag2.deckel, tag2Gewicht: tag2.gewicht,
        labsMinPartien
    };
})();

// ───────────────────────────────────────────────────────────────────
// Das Objektliteral der Aufrufstelle, ausgefuehrt.
// ───────────────────────────────────────────────────────────────────
const AUFRUF_MARKE = 'const cmGrundlage = cmTierGrundlageZeile({';

/** Das Objekt, das die Seite wirklich baut — mit frei setzbarer Umgebung. */
function aufrufObjekt(umgebung) {
    const ab = QUELLE.indexOf(AUFRUF_MARKE);
    assert.ok(ab >= 0, 'die Aufrufstelle steht nicht mehr in der Datei');
    const auf = QUELLE.indexOf('{', ab + AUFRUF_MARKE.length - 1);
    const zu = QUELLE.indexOf('});', auf);
    assert.ok(zu > auf, 'das Objektliteral der Aufrufstelle ist nicht abgeschlossen');
    const kasten = Object.assign({ Math, Object, Number, String }, umgebung);
    vm.createContext(kasten);
    return vm.runInContext('(' + QUELLE.slice(auf, zu + 1) + ')', kasten);
}

/** Konstanten der Tier-Einteilung, die keine Funktion nach aussen gibt. */
function konstante(re, was) {
    const m = re.exec(QUELLE);
    assert.ok(m, 'im Quelltext nicht gefunden: ' + was);
    return Number(m[1]);
}
const T = {
    T1_MAX: konstante(/const T1_MAX\s*=\s*([\d.]+);/, 'T1_MAX'),
    T2_MAX: konstante(/const T2_MAX\s*=\s*([\d.]+);/, 'T2_MAX'),
    T3_MAX: konstante(/const T3_MAX\s*=\s*([\d.]+);/, 'T3_MAX'),
    T1_MIN_SHARE: konstante(/const T1_MIN_SHARE\s*=\s*([\d.]+);/, 'T1_MIN_SHARE'),
    T1_MIN_WR: konstante(/const T1_MIN_WR\s*=\s*([\d.]+);/, 'T1_MIN_WR'),
    MINDEST_ANTEIL_GROESSTER:
        konstante(/const MINDEST_ANTEIL_GROESSTER\s*=\s*([\d.]+);/, 'MINDEST_ANTEIL_GROESSTER')
};

/** Die echte Umgebung der Aufrufstelle; nur die Datenzahlen setzt der Test. */
const echteUmgebung = (mindestListen, groesste, labs) => Object.assign({}, T, {
    TIER_SCORE: RECHNUNG.TIER_SCORE,
    minCountThreshold: mindestListen,
    _maxCount: groesste,
    labsByName: labs === undefined ? { irgendein: {} } : labs
});

/** cmTierGrundlageZeile() aus der echten Datei laden und ausfuehren.
 *
 * SEIT DEM 10.09.2026 GIBT DIE FUNKTION DEN SATZ NICHT MEHR ZURUECK.
 * Er stand als neun Zeilen Fliesstext in der Tier-Liste und ist hinter
 * den Info-Knopf der Ueberschrift gewandert — die Funktion MELDET ihn
 * jetzt an window.DsAbschnittInfo statt ihn zu rendern.
 *
 * Alle Zusicherungen dieser Datei bleiben unveraendert: sie pruefen den
 * INHALT des Satzes, und der wird weiterhin an derselben Stelle aus
 * denselben Konstanten gebaut. Nur die Abholstelle ist eine andere.
 * Genau darum wird hier das Register mitgegeben und der gemeldete Text
 * zurueckgereicht — haette ich stattdessen die Zusicherungen gelockert,
 * waere aus einer Verlagerung eine Luecke geworden. */
function zeile(sprache, g) {
    let gemeldet = '';
    const kasten = {
        Math, Number, String, Object, Array, JSON,
        getLang: () => sprache,
        escapeHtml: (x) => String(x),
        window: {
            getLang: () => sprache,
            DsAbschnittInfo: {
                melde: (id, inhalt) => {
                    if (id !== 'tiers') {
                        throw new Error('unter falscher Kennung gemeldet: ' + id);
                    }
                    gemeldet = String((inhalt && inhalt.html) || '');
                }
            }
        }
    };
    vm.createContext(kasten);
    // DA-47: der Quotenname kommt aus dem echten Konventionsmodul.
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'win-rate-konvention.js'), 'utf8'), kasten);
    vm.runInContext(funktion('cmTierGrundlageZeile'), kasten);
    const zurueck = kasten.cmTierGrundlageZeile(g);
    assert.equal(zurueck, '',
        'Die Funktion rendert wieder auf die Flaeche, statt zu melden — '
        + 'dann steht der Satz doppelt: im Dialog und in der Tier-Liste.');
    assert.ok(gemeldet,
        'Nichts gemeldet. Ohne Meldung zeigt ds-sections.js keinen Knopf, '
        + 'und die Erklaerung der Reihenfolge ist von der Seite verschwunden '
        + 'statt umgezogen.');
    // Die Huelle <p>…</p> abstreifen, damit die Zusicherungen unten
    // denselben nackten Satz sehen wie vorher.
    return gemeldet.replace(/^<p>/, '').replace(/<\/p>$/, '');
}

/** Der Satz, wie die Seite ihn mit ihren eigenen Konstanten baut. */
const satz = (sprache, mindestListen, groesste, labs) =>
    zeile(sprache || 'de', aufrufObjekt(echteUmgebung(
        mindestListen === undefined ? 313.8 : mindestListen,
        groesste === undefined ? 3138 : groesste, labs)));

/** Deutsche Schreibweise einer Zahl mit n Nachkommastellen. */
const de = (x, n) => Number(x).toFixed(n).replace('.', ',');

describe('Grundlage der Tier-Einteilung im laufenden Meta (C6 / F15.19-F15.24, B2, B6)', () => {

    it('die Rechnung laesst sich ausfuehren und liefert brauchbare Messwerte', () => {
        Object.entries(GEMESSEN).forEach(([name, w]) => {
            assert.ok(Number.isFinite(w) && w > 0,
                name + ' konnte nicht gemessen werden: ' + w);
        });
    });

    // ───────────────────────────────────────────────────────────
    // (A) Durchreichen: Kennwerte statt echter Konstanten.
    // ───────────────────────────────────────────────────────────
    it('B2: JEDE Zahl des Satzes kommt aus der Umgebung der Aufrufstelle, keine ist dort abgeschrieben', () => {
        // Erfundene, gut unterscheidbare Kennwerte. Steht an der
        // Aufrufstelle ein Literal statt eines Namens, fehlt der Kennwert
        // im Satz — und genau das war Befund B2.
        const K = {
            T1_MAX: 111, T2_MAX: 112, T3_MAX: 113,
            T1_MIN_SHARE: 114, T1_MIN_WR: 115,
            MINDEST_ANTEIL_GROESSTER: 1.16,     // * 100 = 116
            TIER_SCORE: {
                PRIOR_LISTEN: 121, ANTEIL_DECKEL: 122, ANTEIL_GEWICHT: 123,
                WR_DECKEL: 124, WR_GEWICHT: 125, LABS_MIN_PARTIEN: 126,
                LABS_WR_DECKEL: 127, LABS_WR_GEWICHT: 128,
                TAG2_DECKEL: 129, TAG2_GEWICHT: 131
            },
            minCountThreshold: 132, _maxCount: 133,
            labsByName: { irgendein: {} }
        };
        const s = zeile('de', aufrufObjekt(K));
        const erwartet = [
            ['Tier 1 fasst höchstens 111 Decks', 'T1_MAX'],
            ['Tier 2 höchstens 112', 'T2_MAX'],
            ['Tier 3 höchstens 113', 'T3_MAX'],
            ['114,0 % Anteil', 'T1_MIN_SHARE'],
            ['115,0 % Win Rate', 'T1_MIN_WR'],
            ['mindestens 116 % der Listenzahl', 'MINDEST_ANTEIL_GROESSTER'],
            ['Vorwert von 121 Listen', 'TIER_SCORE.PRIOR_LISTEN'],
            ['Anteil (bis 122 %', 'TIER_SCORE.ANTEIL_DECKEL'],
            ['Gewicht 123,0)', 'TIER_SCORE.ANTEIL_GEWICHT'],
            ['über 50 (bis +124 pp', 'TIER_SCORE.WR_DECKEL'],
            ['Gewicht 125,0;', 'TIER_SCORE.WR_GEWICHT'],
            ['ab 126 Matches je Deck', 'TIER_SCORE.LABS_MIN_PARTIEN'],
            ['bis +127 pp', 'TIER_SCORE.LABS_WR_DECKEL'],
            ['Gewicht 128,0)', 'TIER_SCORE.LABS_WR_GEWICHT'],
            ['Day-2-Quote (bis 129,00', 'TIER_SCORE.TAG2_DECKEL'],
            ['Gewicht 131)', 'TIER_SCORE.TAG2_GEWICHT'],
            ['hier 132 von 133 Listen', 'minCountThreshold / _maxCount']
        ];
        const fehlend = erwartet.filter(([t]) => !s.includes(t))
            .map(([t, n]) => n + ' (erwartet: "' + t + '")');
        assert.deepEqual(fehlend, [],
            'an der Aufrufstelle abgeschrieben statt durchgereicht:\n  '
            + fehlend.join('\n  ') + '\n\nSatz:\n' + s);
        assert.equal(erwartet.length, 17, 'es sind 17 Zahlen, alle 17 werden geprueft');
    });

    it('B2: an der Aufrufstelle steht rechts vom Doppelpunkt keine nackte Zahl mehr', () => {
        const ab = QUELLE.indexOf(AUFRUF_MARKE);
        const block = QUELLE.slice(ab, QUELLE.indexOf('});', ab));
        const literale = block.split('\n').slice(1)
            .filter(z => /:\s*-?\d/.test(z))
            .map(z => z.trim());
        assert.deepEqual(literale, [],
            'wieder abgeschrieben statt durchgereicht: ' + literale.join(' | '));
    });

    // ───────────────────────────────────────────────────────────
    // (B) Der Satz nennt die Zahlen, mit denen wirklich gerechnet wird.
    // ───────────────────────────────────────────────────────────
    it('B2: Anteilsdeckel und -gewicht im Satz sind die gemessenen', () => {
        const s = satz('de');
        assert.ok(s.includes('Anteil (bis ' + de(GEMESSEN.anteilDeckel, 0) + ' %, Gewicht '
            + de(GEMESSEN.anteilGewicht, 1) + ')'),
            'gemessen: Deckel ' + GEMESSEN.anteilDeckel + ', Gewicht '
            + GEMESSEN.anteilGewicht + '\n' + s);
    });

    it('B2: Win-%-Deckel, -Gewicht und Vorwert im Satz sind die gemessenen', () => {
        const s = satz('de');
        assert.ok(s.includes('bis +' + de(GEMESSEN.wrDeckel, 0) + ' pp, Gewicht '
            + de(GEMESSEN.wrGewicht, 1)), 'gemessen: ' + JSON.stringify(GEMESSEN) + '\n' + s);
        /* BEFUND B1 (07.09.2026): hier stand "Partien". Geglaettet wird
           gegen die LISTENzahl (deck.new_count), nicht gegen Partien —
           die Einheit im Satz muss die der Rechnung sein. */
        assert.ok(s.includes('Vorwert von ' + Math.round(GEMESSEN.vorListen) + ' Listen bei 50 %'),
            'gemessener Vorwert: ' + GEMESSEN.vorListen + '\n' + s);
    });

    it('B2: Labs-Schwelle, -Deckel und -Gewicht im Satz sind die gemessenen', () => {
        const s = satz('de');
        assert.ok(s.includes('ab ' + GEMESSEN.labsMinPartien + ' Matches je Deck'),
            'gemessene Schwelle: ' + GEMESSEN.labsMinPartien + '\n' + s);
        assert.ok(s.includes('bis +' + de(GEMESSEN.labsWrDeckel, 0) + ' pp, Gewicht '
            + de(GEMESSEN.labsWrGewicht, 1)), s);
    });

    it('B2: Tag-2-Deckel und -Gewicht im Satz sind die gemessenen', () => {
        const s = satz('de');
        assert.ok(s.includes('Day-2-Quote (bis ' + de(GEMESSEN.tag2Deckel, 2)
            + ', Gewicht ' + de(GEMESSEN.tag2Gewicht, 0) + ')'),
            'gemessen: Deckel ' + GEMESSEN.tag2Deckel + ', Gewicht '
            + GEMESSEN.tag2Gewicht + '\n' + s);
    });

    it('B2: unterhalb des genannten Deckels waechst der Beitrag, oberhalb nicht mehr', () => {
        // Der Deckel ist keine Zierde: das ist die Aussage des Satzes,
        // ausgefuehrt statt behauptet.
        const d = GEMESSEN.anteilDeckel;
        assert.ok(nurAnteil(d) > nurAnteil(d - 1), 'unter dem Deckel muss es steigen');
        assert.equal(nurAnteil(d + 50), nurAnteil(d), 'ueber dem Deckel darf es nicht mehr steigen');
        const g = GEMESSEN.labsMinPartien;
        assert.equal(wert({ share: 0, winrate: 0, new_count: 0, archetype: 'X' },
            { X: { games: g - 1, winPct: 99, day2Conv: 1 } }).labsComp, 0,
            'unter der genannten Schwelle darf die Turnierdatei nicht zaehlen');
    });

    // ───────────────────────────────────────────────────────────
    // Wortlaut und Aufbau
    // ───────────────────────────────────────────────────────────
    it('der Satz nennt die Obergrenzen der drei Stufen und die zwei Tier-1-Huerden', () => {
        const s = satz('de');
        assert.ok(s.includes('Tier 1 fasst höchstens ' + T.T1_MAX + ' Decks'), s);
        assert.ok(s.includes('Tier 2 höchstens ' + T.T2_MAX), s);
        assert.ok(s.includes('Tier 3 höchstens ' + T.T3_MAX), s);
        assert.ok(s.includes(de(T.T1_MIN_SHARE, 1) + ' % Anteil'), s);
        assert.ok(s.includes(de(T.T1_MIN_WR, 1) + ' % Win Rate'), s);
    });

    /* DA-47 (05.10.2026, Entscheidung Hausi „Rechnung angleichen"): die
       Rangfolge rechnet mit S/(S+N) — der Zahl, die auf der Tier-Karte
       steht —, und die heisst auf der ganzen Seite „Win-Rate". „Win %"
       bleibt den Matchpunkten vorbehalten und darf hier NICHT stehen. */
    it('Win-Raten heissen "Win-Rate" (S/(S+N)), nicht "Win %"', () => {
        const d = satz('de'), e = satz('en');
        assert.ok(d.includes('Win Rate'), 'deutsche Fassung');
        assert.ok(/win rate/i.test(e), 'englische Fassung');
        assert.ok(!/Win %|Siegquote|Gewinnrate/.test(d + e),
            'keine zweite Bezeichnung fuer dieselbe Groesse');
    });

    it('B6: die Mindestlistenzahl bezieht sich auf den GROESSTEN Archetyp, nicht auf Rang 1', () => {
        // _maxCount ist das Maximum ueber alle new_count. Das ist nicht
        // dasselbe wie die Listenzahl des nach Score erstplatzierten Decks
        // — heute faellt es zusammen, bei anderen Daten nicht.
        assert.match(QUELLE, /const _maxCount = normalizedDecks\.reduce\(\(m, d\) => Math\.max\(m, d\.new_count \|\| 0\), 0\);/,
            'die Groesse selbst muss das Maximum ueber alle new_count bleiben');
        const s = satz('de', 313.8, 3138);   // Testvorgabe, kein Seitenwert
        assert.match(s, /% der Listenzahl des größten Archetyps, hier 314 von 3\.138 Listen/);
        assert.ok(!/Rang-1-Deck/.test(s), 'die alte, falsche Formulierung ist weg');
        assert.match(satz('en', 313.8, 3138), /of the largest archetype’s list count, here 314 of 3,138 lists/);
    });

    it('die Mindestlistenzahl wird aufgerundet, nicht abgeschnitten', () => {
        // 0,1 Liste gibt es nicht; abgerundet waere die Schwelle zu niedrig.
        assert.match(satz('de', 31.2, 312), /hier 32 von 312 Listen/);
    });

    it('ohne Grundlage faellt der Halbsatz weg statt eine Zahl zu erfinden', () => {
        const s = satz('de', 0, 0);
        assert.ok(!s.includes('größten Archetyps'), 'ohne Grundlage keine Behauptung');
        assert.match(s, /Tier 1 fasst höchstens/, 'der Rest des Satzes bleibt');
    });

    it('fehlt die Turnierdatei, sagt der Satz das — statt einen Anteil zu erklaeren, den es nicht gab', () => {
        const s = satz('de', 313.8, 3138, null);
        assert.match(s, /KEINE Turnierdatei/);
        assert.ok(!s.includes('Day-2-Quote (bis'), 'der fehlende Anteil wird nicht beschrieben');
        assert.match(satz('en', 313.8, 3138, null), /No tournament file/);
    });

    it('erklaert, warum ein hoeherer Anteil weiter unten stehen kann', () => {
        assert.match(satz('de'), /höherem Anteil unter einem mit niedrigerem/);
        assert.match(satz('en'), /higher share can sit below/);
    });

    it('die Zeile wird wirklich gerendert, und ueber der Tier-Liste', () => {
        assert.match(QUELLE, /let html = heroHtml \+ overallTop8Html \+ cmGrundlage \+/);
    });

    it('die Stellschrauben stehen genau einmal im Quelltext', () => {
        // Ein zweites Vorkommen waere die naechste Gelegenheit, dass die
        // beiden auseinanderlaufen.
        assert.match(QUELLE, /const TIER_SCORE = Object\.freeze\(\{/);
        assert.equal(Object.isFrozen(RECHNUNG.TIER_SCORE), true,
            'TIER_SCORE muss eingefroren sein, sonst ist die eine Quelle keine');
        assert.equal((QUELLE.match(/const TIER_SCORE\s*=/g) || []).length, 1);
        assert.equal((QUELLE.match(/const MINDEST_ANTEIL_GROESSTER\s*=/g) || []).length, 1);
    });

    it('der Satz wird unter der Kennung des Abschnitts gemeldet, nicht gerendert', () => {
        /* WAR: "das Ergebnis ist ein Absatz mit der Klasse, die es auf
           der japanischen Seite schon gibt" — geprueft wurde
           `^<p class="tier-grundlage">`.

           Seit dem 10.09.2026 gibt es diesen Absatz auf der Flaeche
           nicht mehr. Er stand als neun Zeilen Fliesstext in der
           Tier-Liste und ist hinter den Info-Knopf der Ueberschrift
           gewandert. Eine Klasse fuer einen Absatz, den niemand mehr
           zeichnet, ist keine Zusicherung.

           Was an ihre Stelle tritt, ist die Bedingung, die wirklich
           traegt: die Meldung geht unter GENAU der Kennung raus, unter
           der js/ds-sections.js den Abschnitt fuehrt ('tiers'). Faellt
           die auseinander, bleibt der Knopf aus und der Satz ist weg —
           still. `zeile()` oben wirft bei jeder anderen Kennung. */
        const kasten = { treffer: [] };
        const g = aufrufObjekt(echteUmgebung(313.8, 3138, undefined));
        const sandkasten = {
            Math, Number, String, Object, Array, JSON,
            getLang: () => 'de',
            escapeHtml: (x) => String(x),
            window: { DsAbschnittInfo: { melde: (id, inh) => kasten.treffer.push([id, inh]) } }
        };
        vm.createContext(sandkasten);
        vm.runInContext(funktion('cmTierGrundlageZeile'), sandkasten);
        sandkasten.cmTierGrundlageZeile(g);

        assert.equal(kasten.treffer.length, 1, 'genau eine Meldung erwartet');
        assert.equal(kasten.treffer[0][0], 'tiers',
            'Die Kennung muss die des Abschnitts in js/ds-sections.js sein.');
        assert.match(kasten.treffer[0][1].html, /^<p>/,
            'Der Dialog bekommt Absatzmarkup, keinen nackten Text.');
        assert.ok(kasten.treffer[0][1].titel,
            'Ohne Titel steht im Dialog die allgemeine Ersatzueberschrift.');
    });

    it('ohne Register faellt nichts um — die Seite laedt auch ohne die neue Datei', () => {
        /* ds-abschnitt-info.js ist ein eigenes Skript. Faellt es aus
           (Ladefehler, alter Zwischenspeicher), darf die Tier-Liste
           nicht mitfallen — sie ist die Hauptsache, der Erklaersatz die
           Nebensache. */
        const g = aufrufObjekt(echteUmgebung(313.8, 3138, undefined));
        const ohne = {
            Math, Number, String, Object, Array, JSON,
            getLang: () => 'de',
            escapeHtml: (x) => String(x),
            window: {}
        };
        vm.createContext(ohne);
        vm.runInContext(funktion('cmTierGrundlageZeile'), ohne);
        assert.equal(ohne.cmTierGrundlageZeile(g), '',
            'Ohne Register muss die Funktion still einen leeren String liefern.');
    });
});
