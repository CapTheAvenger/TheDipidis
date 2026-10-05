'use strict';
/**
 * VIER ZAHLEN, DIE NICHT SAGTEN, WAS SIE SIND.
 *
 * Diese Datei gehoert zu den Befunden B1 bis B5 der Datenflusskarte vom
 * 07.09.2026. Sie GREIFT NICHT den Quelltext ab, sondern schneidet die
 * geaenderten Stellen heraus und FUEHRT SIE AUS — mit selbst gesetzten
 * Eingaben. Kein jsdom (der Testschritt in deploy-pages.yml installiert
 * nur papaparse), kein Zugriff auf data/: jede Zusicherung prueft eine
 * Eigenschaft des Codes, keinen Wochenwert.
 *
 *   B1  js/app-deck-builder.js — `consistency_score` laeuft auf zwei
 *       Skalen (Y.2: 0-100 Anteil; Legacy: 0-120 Ordnungsgroesse mit
 *       +18/-20 und Deckel 24). Der Warum?-Kasten schrieb an beide nur
 *       "score". Geprueft: jede angezeigte Zahl traegt ihren Nenner, und
 *       der Nenner folgt dem Baupfad statt fest verdrahtet zu sein.
 *
 *   B2  js/app-meta-call.js — die Day-2-Quote wird hier aus der SPALTE
 *       day1_to_day2_conv gelesen, ab 10 Antritten je Turnier, waehrend
 *       zwei andere Ansichten des Hauses selbst rechnen (5 bzw. keine
 *       Mindestzahl). Geprueft: die Mindestzahl der Anzeige ist dieselbe
 *       wie die des Ladeblocks, und beide stehen an der Zahl.
 *
 *   B3  js/app-meta-call.js — der Zweig `_clip(t8ConvAvg / 0.25, …)`
 *       traegt nichts, weil top8_conv_rate in den Labs-Daten leer ist.
 *       Geprueft: er faellt nicht mehr still aus, sondern meldet sich
 *       genau dann, wenn er KEIN Deck erreicht hat — und schweigt,
 *       sobald er wieder eines erreicht.
 *
 *   B4  js/app-past-meta.js — die Kachel "Win %" rechnet Matchpunkte,
 *       die Deck-Analyse rechnet aus derselben Datei S/(S+N+U).
 *       Geprueft: der Gegenverweis steht an der Kachel und holt beide
 *       Namen aus js/win-rate-konvention.js, statt sie abzuschreiben.
 *
 *   B5  js/app-deck-builder.js — unter MIN_WEIGHTED_LISTS baut der
 *       Alt-Pfad weiter, und das stand nur in der Konsole. Geprueft: der
 *       Befund traegt die TATSAECHLICHE Listenzahl und die Schwelle, und
 *       die Schwelle kommt aus js/deck-builder-consistency.js statt aus
 *       einer zweiten Kopie.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const BAUER = lies('js/app-deck-builder.js');
const MC    = lies('js/app-meta-call.js');
const PM    = lies('js/app-past-meta.js');
const KONS  = lies('js/deck-builder-consistency.js');
const KONV  = lies('js/win-rate-konvention.js');

/* ── Werkzeug: Quelltext ausschneiden und AUSFUEHREN ─────────────── */

/** Rumpf einer Funktion, an der Klammer gezaehlt statt geraten. */
function rumpf(quelle, kopf) {
    const start = quelle.indexOf(kopf);
    assert.ok(start >= 0, `Funktion nicht gefunden: ${kopf}`);
    let i = quelle.indexOf('{', start), tiefe = 0;
    for (let j = i; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(i + 1, j);
        }
    }
    throw new Error(`unbalancierte Klammern in ${kopf}`);
}

/** Stueck zwischen zwei Marken, beide muessen eindeutig sein. */
function stueck(quelle, von, bis) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anfangsmarke fehlt: ${von}`);
    assert.equal(quelle.indexOf(von, a + 1), -1, `Anfangsmarke doppelt: ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endmarke fehlt: ${bis}`);
    return quelle.slice(a, b);
}

/** Ein Zahlenliteral aus einer `const NAME = 12;`-Zeile. */
function konstante(quelle, name) {
    const m = quelle.match(new RegExp('const\\s+' + name + '\\s*=\\s*([\\d.]+)\\s*;'));
    assert.ok(m, `Konstante nicht gefunden: ${name}`);
    return Number(m[1]);
}

/** Ein winziges Dokument: nur, was die geprueften Bloecke anfassen. */
function minidom() {
    const mach = (tag) => {
        const el = {
            tagName: String(tag).toUpperCase(),
            className: '', textContent: '', title: '',
            kinder: [],
            appendChild(k) { this.kinder.push(k); return k; },
            get childElementCount() { return this.kinder.length; },
        };
        return el;
    };
    return { createElement: mach, _mach: mach };
}

/** Alle Textinhalte eines Knotenbaums, flach. */
function texte(knoten, raus) {
    raus = raus || [];
    if (knoten.textContent) raus.push(knoten.textContent);
    (knoten.kinder || []).forEach(k => texte(k, raus));
    return raus;
}

/* ══ B1 ═══════════════════════════════════════════════════════════ */

/** _buildScoreSkala + _buildScoreSkalaSatz als aufrufbare Funktionen. */
function skalenApi(sprache) {
    const sb = {
        console,
        getLang: () => (sprache || 'de'),
    };
    sb.window = sb;
    vm.createContext(sb);
    // Die Tabelle und beide Funktionen im Original.
    vm.runInContext(
        stueck(BAUER, 'const BUILD_SCORE_SKALEN = {', 'if (typeof window !== \'undefined\') {\n            window._buildScoreSkala')
        + '\nglobalThis.BUILD_SCORE_SKALEN = BUILD_SCORE_SKALEN;'
        + '\nglobalThis._buildScoreSkala = _buildScoreSkala;'
        + '\nglobalThis._buildScoreSkalaSatz = _buildScoreSkalaSatz;',
        sb);
    return sb;
}

describe('B1 — der angezeigte "score" nennt seine Skala', () => {

    it('die Skala folgt dem Baupfad, nicht einem festen Wert', () => {
        const s = skalenApi('de');
        // Ausdruecklich benannt.
        assert.equal(s._buildScoreSkala({ score_scale: 'y2_anteil' }).max, 100);
        assert.equal(s._buildScoreSkala({ score_scale: 'legacy_punkte' }).max, 120);
        // Ohne das Feld: ueber layers.phase_y2, denn daran haengt der Pfad.
        assert.equal(s._buildScoreSkala({ layers: { phase_y2: true } }).max, 100);
        assert.equal(s._buildScoreSkala({ layers: {} }).max, 120);
        // Unbekannte Kennung faellt NICHT auf 100 zurueck: der
        // Legacy-Pfad ist der weitere Bereich, ein zu kleiner Nenner
        // waere die schlimmere Luege.
        assert.equal(s._buildScoreSkala({ score_scale: 'quatsch' }).max, 120);
        assert.equal(s._buildScoreSkala(null).max, 120);
    });

    it('die beiden Skalen sind verschieden — sonst prueft das hier nichts', () => {
        const s = skalenApi('de');
        assert.notEqual(s.BUILD_SCORE_SKALEN.y2_anteil.max,
                        s.BUILD_SCORE_SKALEN.legacy_punkte.max,
                        'beide Skalen tragen denselben Nenner — dann war der '
                        + 'ganze Befund B1 gegenstandslos oder jemand hat sie '
                        + 'stillschweigend vereinheitlicht');
    });

    it('der Satz nennt die Zahl der Skala und sagt, was sie bedeutet', () => {
        for (const sprache of ['de', 'en']) {
            const s = skalenApi(sprache);
            const y2  = s._buildScoreSkalaSatz({ score_scale: 'y2_anteil' });
            const alt = s._buildScoreSkalaSatz({ score_scale: 'legacy_punkte' });
            assert.ok(y2.includes(String(s.BUILD_SCORE_SKALEN.y2_anteil.max)),
                `[${sprache}] der Y.2-Satz nennt seine Obergrenze nicht: ${y2}`);
            assert.ok(alt.includes(String(s.BUILD_SCORE_SKALEN.legacy_punkte.max)),
                `[${sprache}] der Legacy-Satz nennt seine Obergrenze nicht: ${alt}`);
            assert.notEqual(y2, alt,
                `[${sprache}] beide Pfade bekommen denselben Satz`);
            // Der Legacy-Satz muss die Schwellen nennen, an denen die
            // Stufen haengen — ohne sie ist "0-120" eine nackte Zahl.
            for (const schwelle of ['75', '40', '25']) {
                assert.ok(alt.includes(schwelle),
                    `[${sprache}] die Stufenschwelle ${schwelle} fehlt im Satz: ${alt}`);
            }
            assert.ok(/\+18/.test(alt) && /(−|-)20/.test(alt),
                `[${sprache}] die Tech-Zuschlaege fehlen im Satz: ${alt}`);
        }
    });

    it('deutsch und englisch sind wirklich zwei Texte', () => {
        const de = skalenApi('de')._buildScoreSkalaSatz({ score_scale: 'y2_anteil' });
        const en = skalenApi('en')._buildScoreSkalaSatz({ score_scale: 'y2_anteil' });
        assert.notEqual(de, en, 'der Satz ist einsprachig');
    });

    it('jede Kartenzeile traegt den Nenner ihrer Skala', () => {
        /* Der echte Renderblock des Warum?-Kastens, ausgeschnitten und
           mit einem Minidokument ausgefuehrt. Ein Grep haette nicht
           gemerkt, dass der Nenner in einem der beiden Pfade fehlt. */
        const koerper = stueck(BAUER,
            'const _skala = _buildScoreSkala(report);',
            '// Notes — short legend so the badges aren\'t cryptic');
        const dom = minidom();
        const modal = dom._mach('div');

        function male(report) {
            modal.kinder.length = 0;
            const sb = skalenApi('de');
            sb.document = dom;
            sb.modal = modal;
            sb.report = report;
            vm.runInContext('(function(){' + koerper + '})();', sb);
            return texte(modal);
        }

        const karten = [
            { card_name: 'Iono', addCount: 4, share_percent: 87, consistency_score: 87 },
            { card_name: 'Buddy-Buddy Poffin', addCount: 2, share_percent: 61, consistency_score: 61 },
        ];
        const y2 = male({ score_scale: 'y2_anteil', cards: karten });
        assert.ok(y2.some(x => x === 'score 87/100'),
            'die Y.2-Zeile schreibt ihren Nenner nicht: ' + JSON.stringify(y2));
        assert.ok(!y2.some(x => x === 'score 87'),
            'es steht wieder eine nackte Punktzahl da');

        const legacy = male({ score_scale: 'legacy_punkte', cards: karten });
        assert.ok(legacy.some(x => x === 'score 87/120'),
            'die Legacy-Zeile schreibt ihren Nenner nicht: ' + JSON.stringify(legacy));

        /* Und der Nenner ist nicht fest verdrahtet: derselbe Wert 87
           bekommt in den beiden Pfaden verschiedene Nenner. */
        assert.notDeepEqual(y2, legacy,
            'beide Pfade malen dieselbe Zeile — dann folgt der Nenner nicht dem Pfad');
    });

    it('auch die ACE-SPEC-Tabelle nennt den Nenner ihrer Punktzahl', () => {
        /* Der zweite Ort, an dem eine Punktzahl steht. Er erscheint nur
           auf dem Legacy-Pfad — trotzdem darf der Nenner dort nicht
           fehlen und nicht fest verdrahtet sein. */
        const block = stueck(BAUER, 'acePick.candidates.forEach((c, i) => {',
                                    'aceWrap.appendChild(table);');
        const dom = minidom();
        const tabelle = dom._mach('div');
        const sb = skalenApi('de');
        sb.document = dom;
        sb.table = tabelle;
        sb.acePick = {
            quelle_text: '',            // Legacy-Pfad: die Online-Zeile erscheint
            has_major_anchor: false,
            major_total_decks: 0,
            candidates: [{ card_name: 'Maximum Belt', archetype_share: 41,
                           consistency_score: 47, major_share: null,
                           major_deck_count: 0 }],
        };
        sb.report = { score_scale: 'legacy_punkte' };
        vm.runInContext('(function(){' + block + '})();', sb);
        const alle = texte(tabelle).join(' | ');
        assert.ok(/score 47\/120/.test(alle),
            'die ACE-Zeile schreibt ihren Nenner nicht: ' + alle);
        assert.ok(!/score 47(?!\/)/.test(alle),
            'es steht wieder eine nackte Punktzahl da: ' + alle);
    });

    it('der Skalensatz landet im Kasten, nicht nur in der Konsole', () => {
        const koerper = stueck(BAUER,
            'const _skala = _buildScoreSkala(report);',
            '// Notes — short legend so the badges aren\'t cryptic');
        const dom = minidom();
        const modal = dom._mach('div');
        const sb = skalenApi('de');
        sb.document = dom; sb.modal = modal;
        sb.report = { score_scale: 'legacy_punkte', cards: [] };
        vm.runInContext('(function(){' + koerper + '})();', sb);
        const alle = texte(modal).join('\n');
        assert.ok(alle.includes(sb._buildScoreSkalaSatz(sb.report)),
            'der Satz zur Skala steht nicht im Kasten');
        const satzKnoten = modal.kinder.find(
            k => String(k.className).includes('build-info-score-scale'));
        assert.ok(satzKnoten, 'der Satz hat keinen eigenen Absatz bekommen');
    });

    it('beide Berichte tragen ihre Kennung — sonst raet der Kasten', () => {
        /* Ausgefuehrt statt gegriffen: die beiden Berichtsobjekte werden
           aus dem Quelltext geschnitten und als Objektliteral gebaut.
           Wird eine Kennung entfernt, faellt schon das Auswerten auf. */
        const y2Fragment = stueck(BAUER, "score_scale:      'y2_anteil',", 'cards:            reportCards,');
        assert.ok(/score_scale:\s*'y2_anteil'/.test(y2Fragment));
        const s = skalenApi('de');
        const y2Bericht = vm.runInContext('({' + y2Fragment + '})', s);
        assert.equal(s._buildScoreSkala(y2Bericht).max, 100);

        const altFragment = stueck(BAUER, "score_scale: 'legacy_punkte',", 'layers: {');
        const altBericht = vm.runInContext('({' + altFragment + '})', s);
        assert.equal(s._buildScoreSkala(altBericht).max, 120);
    });
});

/* ══ B5 ═══════════════════════════════════════════════════════════ */

/** _duenneBasisBefund als aufrufbare Funktion. */
function befundApi(sprache) {
    const sb = { console, getLang: () => (sprache || 'de') };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext('function _duenneBasisBefund(mv) {'
        + rumpf(BAUER, 'function _duenneBasisBefund(mv)') + '}', sb);
    return sb._duenneBasisBefund || vm.runInContext('_duenneBasisBefund', sb);
}

describe('B5 — der Rueckfall unter die Mindestzahl ist nicht mehr stumm', () => {

    it('die Schwelle kommt aus dem Bauer-Modul, nicht aus einer Kopie', () => {
        const sb = { console, setTimeout, window: undefined };
        sb.globalThis = sb;
        vm.createContext(sb);
        vm.runInContext(KONS, sb);
        const M = sb.MostConsistencyBuilder;
        assert.ok(M, 'js/deck-builder-consistency.js gibt nichts nach aussen');
        assert.equal(typeof M.MIN_WEIGHTED_LISTS, 'number',
            'die Stichprobenuntergrenze ist nicht exportiert — dann muesste '
            + 'der Aufrufer sie abschreiben, und es gaebe sie zweimal');
        assert.equal(M.MIN_WEIGHTED_LISTS, konstante(KONS, 'MIN_WEIGHTED_LISTS'),
            'der Export zeigt nicht auf die Konstante, die der Bau benutzt');
        // Und der Aufrufer liest genau diesen Export.
        assert.ok(BAUER.includes('builder.MIN_WEIGHTED_LISTS'),
            'js/app-deck-builder.js holt die Schwelle nicht aus dem Modul');
    });

    it('ohne Rueckfall gibt es keinen Befund', () => {
        const f = befundApi('de');
        assert.equal(f(null), null);
        assert.equal(f(undefined), null);
    });

    it('der Befund nennt die tatsaechliche Listenzahl und die Schwelle', () => {
        const f = befundApi('de');
        const b = f({ archetyp: 'Mega Chandelure', n_lists: 1, schwelle: 3 });
        assert.equal(b.level, 'warn', 'ein Rueckfall auf einer Liste ist keine Info');
        const text = b.message + ' ' + b.hint;
        assert.ok(text.includes('Mega Chandelure'), 'der Archetyp fehlt: ' + text);
        assert.ok(/\b1 Day-2-Liste\b/.test(text),
            'die tatsaechliche Listenzahl fehlt oder steht im Plural: ' + text);
        assert.ok(text.includes('3'), 'die Schwelle fehlt: ' + text);

        const zwei = f({ archetyp: 'Dhelmise', n_lists: 2, schwelle: 3 });
        assert.ok(/\b2 Day-2-Listen\b/.test(zwei.message),
            'zwei Listen stehen im Singular: ' + zwei.message);

        /* Die Zahl wird WIRKLICH durchgereicht und nicht gerundet oder
           durch die Schwelle ersetzt — die haeufigste stille Mutation. */
        const acht = f({ archetyp: 'X', n_lists: 8, schwelle: 12 });
        assert.ok(acht.message.includes('8') && acht.message.includes('12'),
            'Listenzahl und Schwelle sind nicht mehr unterscheidbar: ' + acht.message);
    });

    it('der Befund sagt, dass der Bau NICHT aus den Praesenzlisten kommt', () => {
        const f = befundApi('de');
        const b = f({ archetyp: 'X', n_lists: 1, schwelle: 3 });
        assert.ok(/Präsenz/.test(b.hint),
            'der Hinweis sagt nicht, woher der Bau stattdessen kommt: ' + b.hint);
        const e = befundApi('en')({ archetyp: 'X', n_lists: 1, schwelle: 3 });
        assert.notEqual(e.message, b.message, 'der Befund ist einsprachig');
        assert.ok(/Day 2 list\b/.test(e.message), e.message);
    });

    it('die Messung kommt vom Y.2-Pfad bis in den Bericht', () => {
        /* Der Uebergabepunkt. Ohne ihn steht der Befund zwar im Code,
           bekommt aber nie eine Zahl — und das saehe man an keiner
           Ausgabe, weil dann einfach nichts erscheint. */
        const hop = stueck(BAUER,
            '                    if (_newPath && _newPath.duennerBestand) {',
            "                    console.info('[autoCompleteConsistency] Phase Y.2 declined");
        const sb = { console };
        vm.createContext(sb);
        const nimm = (newPath) => vm.runInContext(
            '(function(){ let _mindestzahlVerfehlt = null;'
            + 'const _newPath = ' + JSON.stringify(newPath) + ';'
            + hop + ' return _mindestzahlVerfehlt; })()', sb);
        assert.equal(nimm({ applied: false, reason: 'x' }), null,
            'eine Ablehnung ohne Messung setzt trotzdem etwas');
        const durch = nimm({ applied: false, reason: 'x',
            duennerBestand: { archetyp: 'Crustle', n_lists: 2, schwelle: 3 } });
        assert.ok(durch, 'die Messung erreicht den Bericht nicht');
        assert.equal(durch.n_lists, 2);
        assert.equal(durch.archetyp, 'Crustle');
    });

    it('der Rueckfall meldet sich auch ohne den Warum?-Kasten', () => {
        /* Wer den Kasten nie oeffnet, sah bisher nur "fertig". Der
           Hinweis muss deshalb auch im Toast stehen — mit derselben
           Zahl, nicht mit einer zweiten Formulierung. */
        const block = stueck(BAUER,
            'const _duennBefund = _duenneBasisBefund(_mindestzahlVerfehlt);',
            '\n                }\n            }');
        const gesehen = [];
        const sb = { console, getLang: () => 'de',
                     showToast: (text, art) => gesehen.push({ text, art }) };
        sb.window = sb;
        vm.createContext(sb);
        vm.runInContext('function _duenneBasisBefund(mv) {'
            + rumpf(BAUER, 'function _duenneBasisBefund(mv)') + '}', sb);

        sb._mindestzahlVerfehlt = null;
        vm.runInContext('(function(){' + block + '})();', sb);
        assert.equal(gesehen.length, 0, 'ohne Rueckfall wird gewarnt');

        sb._mindestzahlVerfehlt = { archetyp: 'Dhelmise', n_lists: 2, schwelle: 3 };
        vm.runInContext('(function(){' + block + '})();', sb);
        assert.equal(gesehen.length, 1, 'der Rueckfall bleibt im Toast stumm');
        assert.equal(gesehen[0].art, 'warning', 'der Hinweis kommt als Erfolg daher');
        assert.ok(gesehen[0].text.includes('Dhelmise')
               && /\b2 Day-2-Listen\b/.test(gesehen[0].text)
               && gesehen[0].text.includes('3'),
            'der Toast nennt Archetyp, Listenzahl oder Schwelle nicht: '
            + gesehen[0].text);
    });

    it('der Befund steht ganz vorn im Warum?-Kasten', () => {
        /* Der echte Zusammenbau des Legacy-Berichts, ausgeschnitten und
           mit gesetzten Bausteinen ausgefuehrt. */
        const fragment = stueck(BAUER,
            'mindestzahl_verfehlt: _mindestzahlVerfehlt || null,',
            '// ACE-SPEC pick reasoning');
        const sb = { console, getLang: () => 'de' };
        sb.window = sb;
        vm.createContext(sb);
        vm.runInContext('function _duenneBasisBefund(mv) {'
            + rumpf(BAUER, 'function _duenneBasisBefund(mv)') + '}', sb);
        sb._buildQualityAudit = () => ({ findings: [{ level: 'info', key: 'energy_ok' }] });
        sb.consistencyDeck = [];

        sb._mindestzahlVerfehlt = { archetyp: 'Hydrapple', n_lists: 1, schwelle: 3 };
        const mitBefund = vm.runInContext('({' + fragment + '})', sb);
        assert.equal(mitBefund.mindestzahl_verfehlt.n_lists, 1);
        assert.equal(mitBefund.quality_audit.findings.length, 2);
        assert.equal(mitBefund.quality_audit.findings[0].key,
            'praesenzbasis_unter_mindestzahl',
            'der Befund steht nicht an erster Stelle');
        assert.ok(mitBefund.quality_audit.findings[0].message.includes('Hydrapple'));

        sb._mindestzahlVerfehlt = null;
        const ohne = vm.runInContext('({' + fragment + '})', sb);
        assert.equal(ohne.mindestzahl_verfehlt, null);
        assert.equal(ohne.quality_audit.findings.length, 1,
            'ohne Rueckfall erscheint trotzdem ein Befund');
    });

    it('die Ablehnung reicht die GEMESSENE Listenzahl weiter, nicht die Schwelle', () => {
        /* Der Rueckgabeblock des Y.2-Pfades, ausgeschnitten und mit
           gesetzten Werten ausgefuehrt. Listenzahl und Schwelle sind hier
           absichtlich VERSCHIEDEN — sonst koennte die eine still durch
           die andere ersetzt werden und niemand saehe es. */
        const block = stueck(BAUER,
            'const _dqThin  = result.dataQuality || {};',
            '\n            }\n            if (!Array.isArray(result.deck)');
        const sb = { console };
        vm.createContext(sb);
        sb.archetype = 'Testdeck';
        sb.builder = { MIN_WEIGHTED_LISTS: 3 };
        sb.result = {
            dataQuality: { n_lists: 2, sufficient: false, warning: 'zu duenn' },
            trace: [{ phase: 6, decision: 'data_too_thin', n_lists: 2, threshold: 3 }],
        };
        const r = vm.runInContext('(function(){' + block + '})()', sb);
        assert.equal(r.applied, false);
        assert.equal(r.duennerBestand.n_lists, 2,
            'die weitergereichte Zahl ist nicht die gemessene Listenzahl');
        assert.equal(r.duennerBestand.schwelle, 3);
        assert.equal(r.duennerBestand.archetyp, 'Testdeck');
        assert.notEqual(r.duennerBestand.n_lists, r.duennerBestand.schwelle,
            'Listenzahl und Schwelle sind dieselbe Zahl geworden');

        /* Ohne Phase-6-Spur (gar keine Liste im Fenster) faellt die
           Schwelle auf den Export des Moduls zurueck — und die
           Listenzahl bleibt die gemessene Null. */
        sb.result = { dataQuality: { n_lists: 0, sufficient: false }, trace: [] };
        const leer = vm.runInContext('(function(){' + block + '})()', sb);
        assert.equal(leer.duennerBestand.n_lists, 0);
        assert.equal(leer.duennerBestand.schwelle, 3);

        /* Und mit einer ANDEREN Schwelle im Modul folgt der Befund ihr,
           statt eine eigene 3 zu fuehren. */
        sb.builder = { MIN_WEIGHTED_LISTS: 7 };
        const andere = vm.runInContext('(function(){' + block + '})()', sb);
        assert.equal(andere.duennerBestand.schwelle, 7);
    });

    it('unter der Schwelle liefert der echte Bauer kein Deck — aber die Zahlen dafuer',
        async () => {
        /* Mit GESETZTEN Zeilen, nicht mit data/: geprueft wird die
           Regel, nicht das Feld dieser Woche. */
        const zeilen = [];
        const mach = (spieler, platz, karte, anzahl) => ({
            tournament_id: '0099', tournament_name: 'Testturnier',
            tournament_date: '2026-08-01', deck_archetype: 'Testdeck',
            player_name: spieler, place: String(platz),
            card_name: karte, count: String(anzahl),
            card_type: 'Trainer', set_code: 'TST', set_number: '1',
        });
        // Zwei Listen — eine unter MIN_WEIGHTED_LISTS = 3.
        for (const [sp, pl] of [['A', 1], ['B', 2]]) {
            for (let i = 0; i < 12; i++) zeilen.push(mach(sp, pl, 'Karte ' + i, 4));
        }
        const kopf = Object.keys(zeilen[0]).join(',');
        const csv = kopf + '\n' + zeilen.map(z => Object.values(z).join(',')).join('\n');

        const sb = { console: { log(){}, warn(){}, info(){}, error(){} }, setTimeout, window: undefined };
        sb.globalThis = sb;
        sb.Papa = { parse: (url, o) => {
            const text = /decklists_per_player/.test(url) ? csv : 'a\n';
            const zl = text.trim().split('\n');
            const k = zl[0].split(',');
            o.complete({ data: zl.slice(1).filter(Boolean).map(z => {
                const t = z.split(','); const r = {};
                k.forEach((n, i) => { r[n] = t[i]; }); return r;
            }) });
        } };
        sb.fetch = async () => ({ ok: false });
        vm.createContext(sb);
        vm.runInContext(KONS, sb);
        const M = sb.MostConsistencyBuilder;
        const res = await M.build('Testdeck', {});
        assert.equal(res.dataQuality.sufficient, false,
            'zwei Listen reichen dem Bauer ploetzlich');
        assert.equal(res.deck.length, 0, 'der Bauer liefert unter der Schwelle ein Deck');
        const spur = res.trace.find(e => e.phase === 6 && e.decision === 'data_too_thin');
        assert.ok(spur, 'die Spur nennt den Grund nicht');
        assert.equal(spur.n_lists, 2, 'die Spur zaehlt die Listen falsch');
        assert.equal(spur.threshold, M.MIN_WEIGHTED_LISTS,
            'die Spur nennt eine andere Schwelle als der Export');

        // Und genau diese beiden Zahlen bilden den angezeigten Befund.
        const b = befundApi('de')({
            archetyp: 'Testdeck', n_lists: spur.n_lists, schwelle: spur.threshold });
        assert.ok(b.message.includes(String(spur.n_lists))
               && b.message.includes(String(spur.threshold)), b.message);
    });
});

/* ══ B2 ═══════════════════════════════════════════════════════════ */

/** Die Herkunftstexte des Meta Calls als aufrufbare Funktionen. */
function d2Api(sprache) {
    const sb = { console, getLang: () => (sprache || 'de') };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(
        'const D2CONV_MIN_ANTRITTE = ' + konstante(MC, 'D2CONV_MIN_ANTRITTE') + ';\n'
        + "const D2CONV_SPALTE = " + JSON.stringify(spalte()) + ';\n'
        + 'function _mcIstDeutsch() {' + rumpf(MC, 'function _mcIstDeutsch()') + '}\n'
        + 'function _d2ConvHerkunft() {' + rumpf(MC, 'function _d2ConvHerkunft()') + '}\n'
        + 'function _d2ConvKurz() {' + rumpf(MC, 'function _d2ConvKurz()') + '}\n'
        + 'function _frozenD2Hinweis() {' + rumpf(MC, 'function _frozenD2Hinweis()') + '}\n'
        + 'globalThis.__api = { _d2ConvHerkunft, _d2ConvKurz, _frozenD2Hinweis, '
        + 'D2CONV_MIN_ANTRITTE, D2CONV_SPALTE };', sb);
    return sb.__api;
}

function spalte() {
    const m = MC.match(/const D2CONV_SPALTE\s*=\s*'([^']+)'/);
    assert.ok(m, 'D2CONV_SPALTE fehlt');
    return m[1];
}

describe('B2 — die Day-2-Quote nennt Quelle und Mindeststichprobe', () => {

    it('die Spalte, die gelesen wird, steht auch im Text', () => {
        for (const sprache of ['de', 'en']) {
            const api = d2Api(sprache);
            assert.equal(api.D2CONV_SPALTE, 'day1_to_day2_conv',
                'diese Datei liest eine andere Spalte als angenommen');
            assert.ok(api._d2ConvHerkunft().includes(api.D2CONV_SPALTE),
                `[${sprache}] der Text nennt die gelesene Spalte nicht`);
        }
    });

    it('die Mindestzahl im Text ist die des Ladeblocks', () => {
        const api = d2Api('de');
        assert.ok(api._d2ConvHerkunft().includes(String(api.D2CONV_MIN_ANTRITTE)),
            'der lange Hinweis nennt die Mindestzahl nicht');
        assert.ok(api._d2ConvKurz().includes(String(api.D2CONV_MIN_ANTRITTE)),
            'der kurze Zusatz an der Zahl nennt die Mindestzahl nicht');
        /* Und der Ladeblock benutzt WIRKLICH die Konstante, nicht eine
           zweite 10 daneben — ausgefuehrt, nicht gegriffen. */
        const tor = stueck(MC,
            "const dayConv = parseEU(r[D2CONV_SPALTE] || '0');",
            'if (!_labsDay2ConvByDeck[k]) {');
        const sb = { console, D2CONV_SPALTE: api.D2CONV_SPALTE,
                     D2CONV_MIN_ANTRITTE: api.D2CONV_MIN_ANTRITTE,
                     parseEU: (x) => Number(String(x).replace(',', '.')) || 0 };
        vm.createContext(sb);
        const nimmt = (d1) => {
            sb.r = { [api.D2CONV_SPALTE]: '0.30', day1_players: String(d1) };
            return vm.runInContext(
                '(function(){ let genommen = false;' + tor
                + ' genommen = true; } return genommen; })()', sb);
        };
        assert.equal(nimmt(api.D2CONV_MIN_ANTRITTE), true,
            'genau an der Schwelle wird die Zeile verworfen');
        assert.equal(nimmt(api.D2CONV_MIN_ANTRITTE - 1), false,
            'eine Zeile unter der Schwelle geht trotzdem ein');
    });

    it('die andere Ansicht derselben Datei sagt, dass sie anders rechnet', () => {
        for (const sprache of ['de', 'en']) {
            const api = d2Api(sprache);
            const h = api._frozenD2Hinweis();
            assert.ok(h.includes(api.D2CONV_SPALTE),
                `[${sprache}] der Spaltenname fehlt im Hinweis der Tabelle`);
            assert.ok(h.includes(String(api.D2CONV_MIN_ANTRITTE)),
                `[${sprache}] die Mindestzahl des Nachbarblocks fehlt`);
            assert.notEqual(h, api._d2ConvHerkunft(),
                `[${sprache}] beide Ansichten bekommen denselben Satz`);
        }
    });

    it('deutsch und englisch sind wirklich zwei Texte', () => {
        assert.notEqual(d2Api('de')._d2ConvHerkunft(), d2Api('en')._d2ConvHerkunft());
        assert.notEqual(d2Api('de')._d2ConvKurz(),     d2Api('en')._d2ConvKurz());
        assert.notEqual(d2Api('de')._frozenD2Hinweis(),d2Api('en')._frozenD2Hinweis());
    });
});

/* ══ B3 ═══════════════════════════════════════════════════════════ */

/** Zaehler und Meldung des Labs-T8-Zweigs, ausfuehrbar. */
function t8Api() {
    const meldungen = [];
    const sb = {
        console: Object.assign({}, console, { warn: (...a) => meldungen.push(a.join(' ')) }),
        _lastMajorInfo: { id: 'T1' },
    };
    vm.createContext(sb);
    vm.runInContext(
        stueck(MC, 'const _t8Herkunft = { spalte: 0, ersatz: 0, ohne: 0 };',
                   '  // ── Diagnostic: Counter Coverage vs Dominant Family')
        + '\nglobalThis.__api = { _t8Herkunft, _t8Zaehle, _meldeT8Herkunft };', sb);
    return { api: sb.__api, meldungen, sb };
}

describe('B3 — der tote Zweig faellt nicht mehr still aus', () => {

    it('die Meldung kommt genau dann, wenn die Spalte KEIN Deck getragen hat', () => {
        const { api, meldungen } = t8Api();
        for (let i = 0; i < 40; i++) api._t8Zaehle('ersatz');
        api._t8Zaehle('ohne');
        api._meldeT8Herkunft();
        assert.equal(meldungen.length, 1, 'der Ausfall wird nicht gemeldet');
        assert.ok(/top8_conv_rate/.test(meldungen[0]),
            'die Meldung nennt die tote Spalte nicht: ' + meldungen[0]);
        assert.ok(meldungen[0].includes('0 von 41'),
            'die Meldung nennt nicht, wie viele Decks der Zweig getragen hat: '
            + meldungen[0]);
        assert.ok(meldungen[0].includes('40'),
            'die Meldung nennt die Zahl der Ersatzfaelle nicht: ' + meldungen[0]);
    });

    it('sobald die Spalte wieder traegt, schweigt die Meldung', () => {
        const { api, meldungen } = t8Api();
        api._t8Zaehle('spalte');
        api._t8Zaehle('ersatz');
        api._meldeT8Herkunft();
        assert.equal(meldungen.length, 0,
            'die Meldung bleibt stehen, obwohl der gemeinte Zweig wieder traegt');
    });

    it('ohne Decks wird nichts gemeldet, und dieselbe Lage nur einmal', () => {
        const { api, meldungen } = t8Api();
        api._meldeT8Herkunft();
        assert.equal(meldungen.length, 0, 'eine leere Lage wird gemeldet');
        api._t8Zaehle('ersatz');
        api._meldeT8Herkunft();
        api._meldeT8Herkunft();
        assert.equal(meldungen.length, 1, 'dieselbe Lage wird mehrfach gemeldet');
    });

    it('ein unbekannter Zweigname verfaelscht die Zaehlung nicht', () => {
        const { api } = t8Api();
        api._t8Zaehle('quatsch');
        assert.equal(api._t8Herkunft.spalte + api._t8Herkunft.ersatz
                   + api._t8Herkunft.ohne, 0);
    });

    it('der Rechenblock meldet den Zweig, den er wirklich genommen hat', () => {
        /* Der Block aus dem Motor, ausgeschnitten und mit einem Spitzel
           statt des echten Zaehlers ausgefuehrt — dieselbe Bauart wie
           tests/unit/test-motor-acht-stufen-wirksamkeit.js. */
        const block = stueck(MC, 'const convStats3 = _labsConvByDeck[k];',
                                 '// Predictors 4.0a + 4.5');
        const gesehen = [];
        const sb = {
            console,
            _clip: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
            _t8Zaehle: (z) => gesehen.push(z),
        };
        vm.createContext(sb);
        const lauf = (conv, qual) => {
            gesehen.length = 0;
            sb.k = 'deck';
            sb._labsConvByDeck = conv > 0 ? { deck: { sum: conv, n: 1 } } : {};
            sb._labsQualityByDeck = qual ? { deck: qual } : {};
            const wert = vm.runInContext(
                '(function(){' + block + ' return labsT8Boost; })()', sb);
            return { wert, zweig: gesehen.slice() };
        };

        const mitSpalte = lauf(0.5, { d1: 6, d2: 3 });
        assert.deepEqual(mitSpalte.zweig, ['spalte'],
            'der lebende Zweig meldet sich als der tote (oder gar nicht)');
        assert.ok(mitSpalte.wert > 1.0,
            'der Vorrang liegt nicht mehr beim Spaltenwert — dann misst der '
            + 'Zaehler etwas anderes als der Kommentar behauptet');

        const ersatz = lauf(0, { d1: 6, d2: 9 });
        assert.deepEqual(ersatz.zweig, ['ersatz']);
        assert.ok(Math.abs(ersatz.wert - 1.5) < 1e-9);

        const ohne = lauf(0, null);
        assert.deepEqual(ohne.zweig, ['ohne']);
        assert.equal(ohne.wert, 1.0);
    });

    it('ohne Zaehler im Kontext rechnet der Block unveraendert weiter', () => {
        /* Zwei bestehende Testdateien schneiden genau diesen Block aus
           und fuehren ihn OHNE _t8Zaehle aus. Die Zaehlung darf sie
           nicht umwerfen — sonst haette die Messung den Motor geaendert,
           statt ihn zu beobachten. */
        const block = stueck(MC, 'const convStats3 = _labsConvByDeck[k];',
                                 '// Predictors 4.0a + 4.5');
        const sb = { console, _clip: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
                     k: 'deck', _labsConvByDeck: {},
                     _labsQualityByDeck: { deck: { d1: 6, d2: 9 } } };
        vm.createContext(sb);
        const wert = vm.runInContext(
            '(function(){' + block + ' return labsT8Boost; })()', sb);
        assert.ok(Math.abs(wert - 1.5) < 1e-9);
    });
});

/* ══ B4 ═══════════════════════════════════════════════════════════ */

describe('B4 — die Win-%-Kachel nennt die Konvention des Nachbarreiters', () => {

    function konventionen(sprache) {
        const sb = { console, getLang: () => (sprache || 'de'),
                     document: { addEventListener() {}, querySelector: () => null } };
        sb.window = sb;
        vm.createContext(sb);
        vm.runInContext(KONV, sb);
        assert.ok(sb.WinRateKonvention);
        return sb.WinRateKonvention;
    }

    /* Der Name des Nachbarreiters, aus js/i18n.js gelesen statt
       abgeschrieben. Die Datei gehoert einem anderen Arbeitspaket; hier
       wird sie nur als Quelle des Namens benutzt. Steht der Schluessel
       nicht mehr da, faellt diese Zusicherung auf. */
    function reiterName(sprache) {
        const i18n = lies('js/i18n.js');
        const treffer = [...i18n.matchAll(
            /'tab\.currentMetaAnalysis'\s*:\s*'([^']+)'/g)].map(m => m[1]);
        assert.equal(treffer.length, 2,
            'js/i18n.js fuehrt tab.currentMetaAnalysis nicht mehr zweisprachig');
        // Reihenfolge in der Datei: erst englisch, dann deutsch.
        const voll = (sprache === 'de') ? treffer[1] : treffer[0];
        // Der unterscheidende Teil, ohne das Praefix "Aktuelle Meta".
        const m = voll.match(/Deck[- ]Analy\w+/);
        assert.ok(m, 'der Reitername sieht anders aus als erwartet: ' + voll);
        return m[0];
    }

    /** Der Satz der Kachel, aus dem Quelltext geschnitten und gebaut. */
    function satz(sprache) {
        const code = stueck(PM,
            "const wkDe = (typeof getLang === 'function' && getLang() === 'de');",
            'const winPctTitle =');
        const WK = konventionen(sprache);
        const sb = { console, getLang: () => sprache, WK };
        vm.createContext(sb);
        return vm.runInContext(
            '(function(){' + code + ' return { satz: winPctKonvSatz }; })()', sb).satz;
    }

    it('beide Namen kommen aus js/win-rate-konvention.js, nicht aus einer Kopie', () => {
        for (const sprache of ['de', 'en']) {
            const WK = konventionen(sprache);
            const s = satz(sprache);
            assert.ok(s.includes(WK.kurz('matchpunkte')),
                `[${sprache}] die eigene Konvention wird nicht beim Namen genannt: ${s}`);
            assert.ok(s.includes(WK.KONVENTIONEN.matchpunkte.formel),
                `[${sprache}] die eigene Formel fehlt: ${s}`);
            // DA-47 (05.10.2026): die Deck-Analyse rechnet S/(S+N).
            assert.ok(s.includes(WK.kurz('ohneUnentschieden')),
                `[${sprache}] die Konvention des Nachbarreiters fehlt: ${s}`);
            assert.ok(s.includes(WK.KONVENTIONEN.ohneUnentschieden.formel),
                `[${sprache}] die Formel des Nachbarreiters fehlt: ${s}`);
            assert.ok(s.includes('win_pct'),
                `[${sprache}] die Spalte, aus der die Zahl kommt, fehlt: ${s}`);
            /* Und der Satz sagt, WELCHER Reiter die andere Zahl zeigt.
               Ohne das ist der Verweis eine Behauptung ohne Adresse —
               genau der Zustand vor dem 07.09.2026. Der Name kommt aus
               js/i18n.js, damit er nicht abgeschrieben ist. */
            assert.ok(s.includes(reiterName(sprache)),
                `[${sprache}] der Satz nennt den Nachbarreiter nicht `
                + `("${reiterName(sprache)}"): ${s}`);
        }
    });

    it('der reservierte Name steht nur ueber seiner eigenen Formel', () => {
        const WK = konventionen('de');
        const s = satz('de');
        /* "Win %" darf im Satz vorkommen — es ist ja die Konvention
           DIESER Kachel. Es darf nur nicht der Name sein, der dem
           Nachbarreiter zugeschrieben wird. */
        const nachbar = s.slice(s.indexOf(WK.kurz('mitUnentschieden')));
        assert.ok(!nachbar.includes(WK.kurz('matchpunkte')),
            'der reservierte Name klebt am Nachbarreiter: ' + nachbar);
        assert.notEqual(WK.kurz('matchpunkte'), WK.kurz('mitUnentschieden'),
            'beide Konventionen heissen wieder gleich');
    });

    it('UI-35: der Satz steht im title der Win-%-Zahl, nicht mehr darunter', () => {
        /* Bis 27.09.2026 stand der Satz sichtbar unter der Zahl (Befund
           07.09.: auf dem Telefon gibt es keinen Mauszeiger). Hausi hat es
           am 27.09.2026 anders entschieden (UI-35): „Text unter Win
           Percentage kann weg" — Record und Win % stehen in einer Zeile.
           Der Satz bleibt im title, verloren geht er nicht. */
        const kachel = stueck(PM,
            '<div class="past-meta-stat-teil past-meta-stat-winpct"',
            '<div class="past-meta-stat-card${day2Duenn');
        assert.ok(kachel.includes('title="${(winPctTitle'), 'der Satz fehlt auch im title');
        assert.ok(!kachel.includes('${winPctKonvSatz}'), 'der Satz steht wieder sichtbar unter der Zahl');
        const titel = stueck(PM, 'const winPctTitle =', ';');
        assert.ok(titel.includes('winPctKonvSatz'), 'der title traegt den Konventionssatz nicht mehr');
        const paar = stueck(PM, '<div class="past-meta-stat-card past-meta-stat-paar">',
            '<div class="past-meta-stat-card${day2Duenn');
        assert.ok(paar.includes('${recordLabel}') && paar.includes('${winPctLabel}'),
            'Record und Win % stehen nicht mehr in einer Kachel (UI-35)');
    });

    it('ohne das Konventionsmodul faellt die Kachel nicht um', () => {
        const code = stueck(PM,
            "const wkDe = (typeof getLang === 'function' && getLang() === 'de');",
            'const winPctTitle =');
        const sb = { console, getLang: () => 'de', WK: null };
        vm.createContext(sb);
        const r = vm.runInContext(
            '(function(){' + code + ' return winPctKonvSatz; })()', sb);
        assert.equal(r, '', 'ohne Modul entsteht ein halber Satz statt keinem');
    });
});
