'use strict';
/*
 * Was das erste Präsenzturnier eines Formats im Meta Call ausgelöst hat.
 *
 * LAGE (01.09.2026)
 * -----------------
 * Mit Worlds San Francisco bekam TEF-PBL sein erstes Major. Der Predictor
 * sprang damit von Modus A auf Modus B — und schaltete zwei Mechaniken
 * scharf, die vorher nie gelaufen waren. Beide waren kaputt, seit es sie
 * gibt; sichtbar wurde es erst an diesem Tag.
 *
 * 1  DIE LADDER-UMSCHREIBUNG IM DATENFENSTER
 *
 *    `_applyDateFilter` schrieb bei gesetztem Fenster `ladderShare` UND
 *    `broughtShare` aus dem datierten Kartenstrom neu — in Modus A
 *    ausdrücklich übersprungen, in Modus B nicht. Die Begründung im
 *    Kommentar ("in Modus B wird der Strom gegen die Major-Anteile
 *    re-verankert") war eine Absichtserklärung ohne Umsetzung: die
 *    einzige Stelle, die das täte, ist Phase β — und die verlangt ZWEI
 *    Majors. TEF-PBL hat eines.
 *
 *    Nachgemessen an der Rückwärtsstrecke, n = 7, MAE über die
 *    Vereinigung der jeweiligen Top 12:
 *
 *        Fenster aus                     1,670 pp
 *        beide umgeschrieben (bisher)    2,397 pp   +44 % Fehler
 *        nur broughtShare umgeschrieben  1,753 pp
 *
 *    7 von 7 Zielen schlechter. Der Grund ist nicht die Stichprobe (715
 *    Eimer gegen 36.368 Ladder-Listen), sondern die Deckelung des
 *    Sammelns auf 60 Decks à 20 Listen: JEDER Archetyp hat 13–20 Eimer,
 *    der Spitzenwert ist strukturell auf ~2,8 % gedeckelt, die Streuung
 *    fällt von 1,52 auf 0,46 pp, die Rangkorrelation zur Ladder liegt
 *    bei ρ = 0,11. Keine ungenaue Ladder — eine andere Größe.
 *
 * 2  DER HYPE-DAMPER
 *
 *    Bedingung: `ladderPct > broughtPct × 1,25` → ×0,75. Zwei Gründe,
 *    warum das nie das war, was draufstand:
 *
 *      a) `broughtShare` kommt aus online_tournament_top8_decks.csv,
 *         also aus ONLINE-Turnieren — in Modus A wie in Modus B. Die
 *         Begründung von Predictor 5.4 beschreibt eine Quellen-
 *         umschaltung, die es nie gab. Der Damper hielt Online gegen
 *         Online, genau der Fehler, den 5.4 beheben wollte.
 *
 *      b) `ladderPct` ist zusätzlich durch `totalLadder` normiert,
 *         `broughtPct` nicht. Damit ist das Verhältnis
 *         100 / totalLadder — für JEDES Deck derselbe Wert. Gemessen:
 *         1,0850 bei allen 49 Decks, über neun Stichtage 1,087–1,136.
 *         Die Schwelle 1,25 war ein globaler Schalter, kein
 *         Deck-Kriterium, und hat nie ausgelöst.
 *
 * 3  DIE PRÜFSPUR
 *
 *    `hypeDamperApplied` wurde gesetzt und nie zurückgenommen, während
 *    `_shareList` mehrere Läufe je Seitenaufbau überlebt. Die Telemetrie
 *    meldete deshalb im zweiten Lauf Decks als gedämpft, die dieser Lauf
 *    nie angefasst hatte.
 *
 * Diese Tests lesen die Quelle, weil die Mechaniken tief im Modul
 * hängen und ein nachgebauter Predictor nur beweisen würde, dass der
 * Nachbau stimmt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const quelle = fs.readFileSync(path.join(wurzel, 'js', 'app-meta-call.js'), 'utf8');
const ohneKomm = quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

describe('Datenfenster — die Ladder bleibt roh', () => {

    it('schreibt ladderShare nicht mehr um', () => {
        // Nicht auf die alte Schreibweise prüfen, sondern auf JEDE
        // Zuweisung an ladderShare innerhalb von _applyDateFilter —
        // sonst rutscht dieselbe Umschreibung in anderer Form durch.
        // (Nachgemessen: die enge Fassung tat genau das.)
        const i = ohneKomm.indexOf('async function _applyDateFilter');
        assert.ok(i > 0, '_applyDateFilter nicht gefunden');
        const ende = ohneKomm.indexOf('\n  async function ', i + 10);
        const rumpf = ohneKomm.slice(i, ende > i ? ende : i + 6000);
        const treffer = rumpf.match(/\.ladderShare\s*=/g) || [];
        assert.deepStrictEqual(treffer, [],
            'die Ladder wird im Datenfenster wieder überschrieben '
            + `(${treffer.length}× zugewiesen) — das kostete 0,73 pp MAE über 7 Ziele`);
    });

    it('schreibt broughtShare weiterhin um', () => {
        assert.ok(/broughtShare\s*=\s*\(c\s*\/\s*totalBuckets\)\s*\*\s*100/.test(ohneKomm),
            'ohne die Umschreibung der Mitbring-Quote hat das Datenfenster '
            + 'gar keine Wirkung mehr');
    });

    it('hängt nicht mehr am Predictor-Modus', () => {
        // Solange die Umschreibung an `_predictorMode !== "B"` hing, war
        // sie in Modus A aus und in Modus B an — und niemand hat sie je
        // laufen sehen, bis das erste Major kam.
        assert.ok(!/skipLadderOverride\s*=\s*_predictorMode/.test(ohneKomm),
            'die Ladder-Umschreibung hängt wieder am Modus');
    });

    it('kanonisiert die Eimer-Schlüssel', () => {
        // Ohne _kanonName trafen die Schreibweisen des datierten Stroms
        // die Schlüssel von _tournamentStats nicht — die Mitbring-Quote
        // von Dhelmise, Toucannon, Basic Box, Beedrill und Metagross
        // wurde dadurch auf null gesetzt statt auf ihren Wert.
        const i = ohneKomm.indexOf('function _bucketCountsFromDatedRows');
        assert.ok(i > 0, '_bucketCountsFromDatedRows nicht gefunden');
        const rumpf = ohneKomm.slice(i, i + 700);
        assert.ok(/normalize\(\s*_kanonName\(/.test(rumpf),
            '_bucketCountsFromDatedRows schlüsselt wieder ohne _kanonName');
    });
});

describe('Hype-Damper — stillgelegt, nicht gelöscht', () => {

    it('ist abgeschaltet', () => {
        assert.ok(/HYPE_DAMPER_AKTIV\s*=\s*false/.test(ohneKomm),
            'der Hype-Damper läuft wieder — er vergleicht Online gegen Online '
            + 'und sein Verhältnis ist deckunabhängig konstant');
    });

    it('wird auch wirklich durch den Schalter gehalten', () => {
        // Ein Schalter, den die Bedingung nicht abfragt, ist Dekoration.
        const i = ohneKomm.indexOf('HYPE_DAMPER_AKTIV');
        const rumpf = ohneKomm.slice(i, i + 400);
        assert.ok(/if\s*\(\s*HYPE_DAMPER_AKTIV/.test(rumpf),
            'die Bedingung fragt den Schalter nicht ab');
    });

    it('bleibt als Code stehen, samt Begründung', () => {
        // Wiederkommen soll er dürfen — aber erst ab dem zweiten Major
        // und gegen day1Share statt gegen broughtShare. Wer das löscht,
        // löscht die Bedingungen mit.
        assert.ok(/HYPE_DAMPER_RATIO_MIN\s*=\s*1\.25/.test(ohneKomm),
            'die Schwelle ist verschwunden');
        assert.ok(/day1Share/.test(quelle),
            'der Weg zurück (Vergleich gegen day1Share) steht nicht mehr da');
    });
});

describe('Prüfspur — die Damper-Marke gilt je Lauf', () => {

    it('wird zu Beginn jedes Laufs zurückgesetzt', () => {
        assert.ok(/d\.hypeDamperApplied\s*=\s*false/.test(ohneKomm),
            'die Marke wird nie zurückgenommen — dann meldet die Telemetrie '
            + 'im zweiten Lauf Decks, die dieser Lauf nicht angefasst hat');
    });

    it('setzt zurück, bevor sie gesetzt werden kann', () => {
        const zurueck = ohneKomm.indexOf('hypeDamperApplied = false');
        const setzen  = ohneKomm.indexOf('hypeDamperApplied = true');
        assert.ok(zurueck > 0 && setzen > 0, 'eine der beiden Stellen fehlt');
        assert.ok(zurueck < setzen,
            'die Rücknahme steht hinter dem Setzen — dann löscht sie das '
            + 'Ergebnis desselben Laufs');
    });
});

describe('Die Meldung von Predictor 5.5 sagt nichts Falsches mehr', () => {

    it('behauptet nicht mehr, das laufende Format habe keine Vor-Ort-Daten', () => {
        // Der Satz stimmte, solange TEF-PBL kein eigenes Turnier hatte.
        // Seit Worlds ist er falsch — und er stand als Begründung neben
        // einer Entscheidung, die aus einem ganz anderen Grund richtig
        // ist (das VORFORMAT ist zu alt).
        const stellen = quelle.split('Boden NICHT scharf');
        assert.ok(stellen.length > 1, 'die Meldung gibt es nicht mehr');
        const meldung = stellen[1].slice(0, 700);
        assert.ok(/VORFORMAT|Vorformat/.test(meldung),
            'die Meldung sagt nicht, worauf sich das "keine Daten" bezieht');
    });
});
