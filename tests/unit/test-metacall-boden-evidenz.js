/**
 * Predictor 5.5/5.6 — was der Boden braucht, um zu tragen.
 *
 * Gemessen am 29.08.2026 im echten Browser: der Boden stand scharf auf
 * TEF-CRI, das aus GENAU ZWEI Turnieren besteht (Turin 06.06., NAIC
 * 12.06.), 78 Tage alt, aus einem Kartenpool vor PBL. Er hob 33 von
 * 131 Decks um zusammen 17,53 pp an — Lillie's Clefairy 0,11 -> 0,91
 * (Faktor 8), Metagross 0,09 -> 0,54 (Faktor 6) — und senkte durch die
 * anschliessende Normierung Dragapult Blaziken von 9,45 auf 6,84.
 *
 * Die Ebene daneben (Lag-Fenster) hat eine Alterssperre, der Chip im
 * Kopf faerbt sich nach derselben Grenze rot. Nur der Boden hatte
 * keine. Diese Datei haelt drei Dinge fest:
 *   1. der Boden hat eine Alterssperre, und es ist DIESELBE
 *   2. ein Boden ruht nicht auf einem einzelnen Turnier oder auf
 *      einer Handvoll Spieler
 *   3. es wird kein Frueh-/Spaet-Fenster behauptet, wenn es keins gibt
 *
 * Geprueft wird die Quelle selbst, nicht eine Nachbildung.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function konstante(name) {
    const m = MC.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+)'));
    assert.ok(m, `${name} steht nicht mehr in js/app-meta-call.js`);
    return Number(m[1]);
}

describe('Predictor 5.5 — Alterssperre auf dem Boden', () => {
    it('der Boden wird nur scharf gestellt, wenn er nicht zu alt ist', () => {
        assert.match(MC, /const prevZuAlt = prevAlterTage != null && prevAlterTage > prevGrenzeTage;/,
            'die Altersentscheidung fehlt');
        // Die Entscheidung muss die Bedingung sein, nicht nur daneben stehen.
        assert.match(MC, /if \(prevFmtKey && setAdditionOnly && !prevZuAlt\) \{/,
            'der Boden haengt nicht an prevZuAlt — er wuerde weiter unbegrenzt scharf stehen');
    });

    it('es ist dieselbe Grenze wie beim Lag-Fenster, keine zweite Zahl', () => {
        assert.match(MC, /const prevGrenzeTage = lagTage \+ LAG_KARENZ_TAGE;/,
            'der Boden hat eine eigene Altersgrenze bekommen; sie muss dieselbe sein '
            + 'wie die des Lag-Fensters, sonst driften zwei Zahlen fuer dieselbe Frage');
        assert.equal(konstante('LAG_KARENZ_TAGE'), 21);
    });

    it('das Alter wird am VORFORMAT gemessen, nicht am aktiven Format', () => {
        // Der Boden lebt von Vorformat-Zeilen. Haenge er am Alter der
        // aktiven Zeilen, waere er in dem Moment abgelaufen, in dem das
        // neue Format frisch gescrapt ist — also genau falsch herum.
        const block = MC.slice(MC.indexOf('let prevNeuestesISO'), MC.indexOf('const prevZuAlt'));
        assert.ok(block.includes('prevRowsAlle'),
            'prevAlterTage wird nicht aus den Vorformat-Zeilen abgeleitet');
        assert.ok(!block.includes('activeNewestDate'),
            'das Alter des aktiven Formats hat hier nichts zu suchen');
    });
});

describe('Predictor 5.5 — Evidenzhuerde je Archetyp', () => {
    it('ein Boden ruht auf mehr als einem Turnier und mehr als einer Handvoll Spieler', () => {
        assert.ok(konstante('PREDICTOR_5_5_MIN_TURNIERE') >= 2,
            'ein einzelnes Turnier darf keinen Boden setzen');
        assert.ok(konstante('PREDICTOR_5_5_MIN_SPIELER') >= 20,
            'unter 20 Spielern verschiebt ein einzelner Spieler den Anteil zu stark');
        // Was die Huerde WIRKLICH aussortiert, wird in
        // test-metacall-boden-verhalten.js gerechnet statt behauptet.
        // Diese Datei liest nur Quelltext und kann eine falsche
        // Begruendung nicht bemerken — genau das ist am 29.08.2026
        // passiert.
    });

    it('beide Bedingungen entscheiden wirklich ueber die Ablage', () => {
        const i = MC.indexOf('const genugTurniere = a.turniere.size');
        assert.notEqual(i, -1, 'die Turnierbedingung fehlt');
        const block = MC.slice(i, i + 700);
        assert.match(block, /const genugSpieler\s*=\s*fullPlayers >= PREDICTOR_5_5_MIN_SPIELER;/);
        // Die Ablage in _lastMetaLabsByDeck muss an BEIDEN haengen.
        assert.match(block, /if \(floorShare > 0 && genugTurniere && genugSpieler\) \{[\s\S]*?_lastMetaLabsByDeck\[k\] =/,
            'der Eintrag wird abgelegt, ohne dass beide Bedingungen ihn decken');
    });

    it('die Turniere werden je Deck wirklich gezaehlt, nicht die Zeilen', () => {
        // n zaehlt Zeilen. Ein Deck kann in einem Turnier mehrere
        // Zeilen haben; n >= 2 waere also keine Aussage ueber Turniere.
        assert.match(MC, /turniere: new Set\(\)/, 'die Turniermenge je Deck fehlt');
        assert.match(MC, /if \(tid\) lastMetaAgg\[k\]\.turniere\.add\(tid\);/,
            'die Turnier-ID wird nicht in die Menge aufgenommen');
    });
});

describe('Predictor 5.6 — kein Split, wo es keinen gibt', () => {
    it('unter drei Turnieren wird kein Frueh-/Spaet-Fenster behauptet', () => {
        assert.ok(konstante('PREDICTOR_5_6_MIN_TURNIERE_SPLIT') >= 3,
            'bei zwei Turnieren nimmt slice(-2) beide als "spaet" und laesst '
            + 'das Frueh-Fenster leer — earlyShare 0, Wachstum und Damper tot');
        assert.match(MC, /const splitMoeglich = sortedTids\.length >= PREDICTOR_5_6_MIN_TURNIERE_SPLIT;/);
        assert.match(MC, /const lateTidSet = splitMoeglich\s*\n?\s*\? new Set\(sortedTids\.slice\(-2\)\)\s*\n?\s*: new Set\(\);/,
            'lateTidSet haengt nicht an splitMoeglich');
    });

    it('der Zustand wird gemeldet statt still zu sein', () => {
        // Genau das war der Fehler: growth ≡ 1,0 und 0 gedaempfte Decks
        // sahen aus wie ein Ergebnis, waren aber ein Nichtlauf.
        const i = MC.indexOf('if (!splitMoeglich) {');
        assert.notEqual(i, -1, 'der Nichtlauf wird nicht gemeldet');
        assert.match(MC.slice(i, i + 600), /console\.log\(/);
    });
});

describe('Der Boden senkt sehr wohl — der Kommentar sagt es jetzt', () => {
    it('der widerlegte Sicherheitssatz steht nicht mehr da', () => {
        assert.ok(!MC.includes('Der Boden hebt nur an, er senkt nie'),
            'der Satz ist durch die Normierung widerlegt: 17,53 pp Anhebung '
            + 'druecken jedes ungebodete Deck. Er darf nicht wieder auftauchen.');
    });
});

describe('poissonP — tot, mit falscher Begruendung', () => {
    it('die Funktion ist weg', () => {
        assert.ok(!/function poissonP\s*\(/.test(MC), 'poissonP hat keinen Aufrufer');
    });
    it('binomialP, das sie ersetzt hat, ist noch da', () => {
        assert.match(MC, /function binomialP\(k, n, p\)/);
    });
});

describe('Der Hinweis steht dort, wo gefragt wird — und nur einmal', () => {
    it('das Alter erklaert im Titel seine FOLGE, nicht nur seine Harmlosigkeit', () => {
        assert.match(MC, /const datumHilfe = \(_lagFensterAbgelaufen && _lagFensterAlterTage != null\)/,
            'der Datums-Chip unterscheidet die beiden Faelle nicht mehr');
        assert.ok(MC.includes("t('mc.bannerDataGapHelp')"),
            'der Lueckentext wird nicht benutzt');
        const i = MC.indexOf('const datumHilfe =');
        assert.match(MC.slice(i, i + 400), /: t\('mc\.bannerDataHelp'\)/,
            'der normale Fall hat seinen eigenen Text verloren');
    });

    it('der Lag-Chip wird NICHT zusaetzlich im Lueckenfall gezeigt', () => {
        // Im Bild nachgesehen: er stand dann direkt neben
        // mc.bannerModeA und sagte dasselbe ein zweites Mal. Der
        // Betreiber will kuerzere Texte, nicht doppelte.
        const i = MC.indexOf('const _lagWindowChip = (');
        assert.notEqual(i, -1);
        const block = MC.slice(i, i + 400);
        assert.ok(!block.includes('_lagFensterAbgelaufen'),
            'der Chip haengt wieder am Lueckenfall und verdoppelt mc.bannerModeA');
    });

    it('beide Sprachen fuehren den Lueckentext', () => {
        const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
        const n = (I18N.match(/'mc\.bannerDataGapHelp'/g) || []).length;
        assert.equal(n, 2, `mc.bannerDataGapHelp steht ${n}x statt 2x (en + de)`);
    });
});
