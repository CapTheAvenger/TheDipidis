/**
 * Team-Rechner — eigenes Team gegen die sechs des Gegners.
 *
 * Der Rechner darueber ist einer gegen einen. Im Doppelkampf steht aber
 * nie ein Paar auf dem Feld, sondern vier gegen vier, und die Frage ist
 * nicht "was macht A gegen B", sondern "wen kann ich umlegen, bevor er
 * mich umlegt". Genau das stand seit dem 19.08.2026 in
 * docs/geparkte-features.md und war der erste Punkt der Liste.
 *
 * Was hier schiefgehen kann und deshalb geprueft wird:
 *
 *  - ZWEI RECHENWEGE. Die Matrix muss durch dasselbe bestMove() gehen wie
 *    die Einzelansicht. Sonst sagt die eine Ansicht 2HKO und die andere
 *    OHKO fuer dasselbe Paar — der Kopf von app-side-quest-matchups.js
 *    sagt genau das ueber sich selbst.
 *  - DAS UEBERGEBENE SET. Wer im Builder eine Verteilung baut, will SEINE
 *    Zahlen sehen. Faellt die Uebergabe still auf das meistgenutzte Set
 *    zurueck, rechnet der Rechner richtig — nur fuer ein anderes Team.
 *  - DAS URTEIL. Schaden allein entscheidet nicht: 90 % bei langsamerer
 *    Initiative ist eine Niederlage. Gewertet wird ueber die Trefferzahl,
 *    bei Gleichstand ueber die Initiative, und ein Initiativgleichstand
 *    bleibt unentschieden, weil er ein Muenzwurf ist.
 *  - VIER VON SECHS. Ausgeschaltet heisst "nicht im Kampf", nicht
 *    "geloescht" — der Chip bleibt in den sechs stehen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-matchups.js'), 'utf8');
const DMG = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-builder.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');

const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const SRC_C = stripJs(SRC);
const BUILDER_C = stripJs(BUILDER);
const CSS_C = stripCss(CSS);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
};

function load(lang = 'de') {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}) },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(DMG, sandbox);
    vm.runInContext(SRC, sandbox);
    const api = sandbox._sqMatchupInternals;
    api.setData(DATA);
    return { api, sandbox };
}

/** Zwei Namen, die in den echten Daten beide ein Set haben. */
function zweiEchte(api) {
    const roster = api.setData(DATA);
    const mit = roster.filter(r => api.teamSet('opp', r.name)).map(r => r.name);
    assert.ok(mit.length >= 2, 'zu wenige Pokemon mit Set fuer den Test');
    return [mit[0], mit[1]];
}

describe('Team-Rechner — dieselben Zahlen wie die Einzelansicht', () => {
    it('die Matrixzelle nimmt bestMove(), nicht einen eigenen Rechenweg', () => {
        const { api } = load();
        const [a, b] = zweiEchte(api);
        const z = api.teamZelle(a, b);
        assert.ok(z, `keine Zelle fuer ${a} gegen ${b}`);

        const aSet = api.teamSet('me', a), bSet = api.teamSet('opp', b);
        const erwartetDeal = api.bestMove(a, aSet, b, bSet);
        const erwartetTake = api.bestMove(b, bSet, a, aSet);

        assert.deepEqual(
            z.deal ? [z.deal.name, z.deal.range.min, z.deal.range.max] : null,
            erwartetDeal ? [erwartetDeal.name, erwartetDeal.range.min, erwartetDeal.range.max] : null,
            'die Matrix teilt anders aus als die Einzelansicht');
        assert.deepEqual(
            z.take ? [z.take.name, z.take.range.min, z.take.range.max] : null,
            erwartetTake ? [erwartetTake.name, erwartetTake.range.min, erwartetTake.range.max] : null,
            'die Matrix steckt anders ein als die Einzelansicht');
    });

    it('die Initiative kommt aus ChampionsDamage, nicht aus einem Vergleich vor Ort', () => {
        const { api, sandbox } = load();
        const [a, b] = zweiEchte(api);
        const z = api.teamZelle(a, b);
        const aStats = api.statsOf(a, api.teamSet('me', a));
        const bStats = api.statsOf(b, api.teamSet('opp', b));
        const erwartet = sandbox.ChampionsDamage.speedComparison(aStats.spe, bStats.spe);
        assert.equal(z.spd.faster, erwartet.faster);
        assert.equal(z.spd.tie, erwartet.tie);
        assert.equal(z.spd.mine, erwartet.mine);
        assert.equal(z.spd.theirs, erwartet.theirs);
    });

    /* Der Spiegelkampf ist der Fall, an dem ein selbstgebauter Vergleich
       auffliegt. `a > b` ist bei gleicher Initiative false — und false
       heisst in einer nackten Prueflogik "langsamer". Es ist aber keins
       von beidem: Gleichstand ist ein Muenzwurf, und ihn als "langsamer"
       zu zeichnen waere in der Haelfte der Faelle falsch.
       ChampionsDamage.speedComparison weiss das, ein `>` weiss es nicht. */
    it('gleiche Initiative ist ein Gleichstand, nicht "langsamer"', () => {
        const { api } = load();
        const [a] = zweiEchte(api);
        const z = api.teamZelle(a, a);       // Spiegel: identische Werte
        assert.ok(z, 'keine Zelle fuer den Spiegelkampf');
        assert.equal(z.spd.tie, true,
            'gleiche Initiative wird nicht als Gleichstand erkannt');
        assert.equal(z.spd.faster, false);
        assert.equal(api.teamUrteil(z), 'is-patt',
            'der Spiegelkampf bekommt ein Urteil, obwohl er ein Muenzwurf ist');
    });
});

describe('Team-Rechner — das uebergebene Set gewinnt', () => {
    it('ein uebergebener Bau wird gerechnet, nicht das meistgenutzte Set', () => {
        const { api } = load();
        const [a] = zweiEchte(api);
        const standard = api.teamSet('me', a);
        assert.ok(standard, 'Testannahme: das Pokemon hat ein Standardset');

        // Ein Bau, der sich vom Standard garantiert unterscheidet.
        const eigen = {
            nature: 'Adamant', ability: '', item: '',
            moves: standard.moves.slice(0, 1),
            spread: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 },
        };
        api.teamState({ mine: [{ name: a, set: eigen }], reset: true });
        const genommen = api.teamSet('me', a);
        assert.equal(genommen, eigen,
            'die Uebergabe faellt still auf das meistgenutzte Set zurueck');
        assert.equal(genommen.spread.atk, 32);
    });

    it('ohne uebergebenes Set greift das meistgenutzte', () => {
        const { api } = load();
        const [a] = zweiEchte(api);
        api.teamState({ mine: [{ name: a, set: null }], reset: true });
        const genommen = api.teamSet('me', a);
        assert.ok(genommen, 'ohne eigenen Bau steht gar kein Set zur Verfuegung');
        assert.ok(Array.isArray(genommen.moves));
    });

    /* Der Vergleich laeuft ueber eine flache Kopie: das Objekt entsteht
       IM Sandkasten und traegt dessen Object.prototype, deepStrictEqual
       vergleicht aber auch den Prototyp. */
    const flach = (o) => ({ hp: o.hp, atk: o.atk, def: o.def, spa: o.spa, spd: o.spd, spe: o.spe });

    it('die Champions-Verteilung wird aus dem Text gelesen, nicht geraten', () => {
        const { api } = load();
        // Genau die Schreibweise, die ChampionsSet.toChampionsText
        // erzeugt: Zahl zuerst, mit " / " getrennt (js/champions-set.js:121).
        assert.deepEqual(flach(api.spreadAusText('12 HP / 32 Atk / 22 Spe')),
            { hp: 12, atk: 32, def: 0, spa: 0, spd: 0, spe: 22 });
        // Die andere Richtung ebenfalls, weil Pastes beides fuehren.
        assert.deepEqual(flach(api.spreadAusText('HP 12 / Atk 32 / Spe 22')),
            { hp: 12, atk: 32, def: 0, spa: 0, spd: 0, spe: 22 });
        // Unlesbares faellt weg statt als 0 durchzugehen und dabei einen
        // anderen Wert zu ueberschreiben.
        assert.deepEqual(flach(api.spreadAusText('Quatsch / SpD 8')),
            { hp: 0, atk: 0, def: 0, spa: 0, spd: 8, spe: 0 });
        assert.deepEqual(flach(api.spreadAusText('')),
            { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    });

    /* Die staerkste Pruefung dieser Datei: der Rundlauf gegen die ECHTE
       Schreibfunktion. Eine Zusicherung gegen selbst getippte Zeichenketten
       bleibt gruen, wenn der Builder das Format morgen aendert — dieser
       Test nicht. */
    it('Rundlauf: was der Builder schreibt, liest der Rechner zurueck', () => {
        const { api, sandbox } = load();
        const CSSRC = fs.readFileSync(path.join(ROOT, 'js', 'champions-set.js'), 'utf8');
        vm.runInContext(CSSRC, sandbox);
        const CS = sandbox.ChampionsSet;
        assert.ok(CS && typeof CS.toChampionsText === 'function',
            'ChampionsSet.toChampionsText nicht gefunden');
        const proben = [
            { hp: 12, atk: 32, def: 0, spa: 0, spd: 0, spe: 22 },
            { hp: 0, atk: 0, def: 32, spa: 4, spd: 30, spe: 0 },
            { hp: 32, atk: 0, def: 0, spa: 32, spd: 2, spe: 0 },
            { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ];
        proben.forEach(sp => {
            const text = CS.toChampionsText(sp);
            assert.deepEqual(flach(api.spreadAusText(text)), sp,
                `Rundlauf gebrochen bei "${text}"`);
        });
    });

    it('uebernimmTeam nimmt hoechstens sechs und macht die Ansicht auf', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const acht = roster.slice(0, 8).map(r => ({
            name: r.name, nature: 'Adamant', moves: ['Tackle'], evs: 'Atk 32',
        }));
        api.uebernimmTeam({ mons: acht });
        const st = api.teamState();
        assert.equal(st.mine.length, api.TEAM_MAX,
            'mehr als sechs Baeue landen im Team');
        assert.equal(st.an, true, 'die Ansicht macht nicht auf');
    });

    it('ein Bau ohne Wesen und ohne Attacken kommt mit set: null durch', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        api.uebernimmTeam({ mons: [{ name: roster[0].name, moves: [], evs: '' }] });
        const st = api.teamState();
        assert.equal(st.mine.length, 1, 'der Bau faellt still heraus');
        assert.equal(st.mine[0].set, null,
            'ein leerer Bau bekommt ein erfundenes Set statt sichtbar leer zu bleiben');
    });
});

describe('Team-Rechner — das Urteil', () => {
    /* BEFUND DER ABNAHME (02.09.2026): die Urteilstests liefen gegen
       Attrappen, die NUR eine Trefferzahl trugen. Damit war der eigentliche
       Fehler strukturell untestbar — dass `ko.hits` die Gluecks­wurfzahl
       ist und `ko.chance` danebenlag, konnte keine dieser Attrappen
       zeigen.

       Die Attrappe traegt jetzt dieselben Felder wie eine echte Zeile:
       minPct, maxPct, ko.hits, ko.chance. */
    const bereich = (minPct, maxPct, hits, chance) => ({
        range: { minPct, maxPct, effectiveness: 1, ko: { hits, chance } },
    });
    const zelle = (deal, take, spd) => ({
        deal: deal || null, take: take || null,
        spd: spd || { faster: true, tie: false },
    });

    it('wer im Durchschnitt weniger Treffer braucht, gewinnt die Zelle', () => {
        const { api } = load();
        // 60 % je Treffer -> 2 Treffer; 30 % -> 4 Treffer.
        assert.equal(api.teamUrteil(zelle(
            bereich(55, 65, 2, 1), bereich(27, 33, 4, 1))), 'is-gut');
        assert.equal(api.teamUrteil(zelle(
            bereich(27, 33, 4, 1), bereich(55, 65, 2, 1))), 'is-schlecht');
    });

    /* DER GEMELDETE FALL, mit den echten Zahlen aus der Abnahme:
       Kingambit legt Blastoise garantiert in zwei Treffern um; Blastoise
       schafft zwei Treffer zu 3,9 %. Die Zelle war ROT. */
    it('ein K.O. mit 3,9 % Chance zaehlt nicht wie ein sicherer', () => {
        const { api } = load();
        const ich = bereich(52.6, 62.2, 2, 1);
        const er = bereich(42.5, 50.7, 2, 0.0390625);
        assert.equal(api.realistischeTreffer(ich.range), 2);
        assert.equal(api.realistischeTreffer(er.range), 3,
            'ein Zweischlag mit 3,9 % Chance gilt weiter als Zweischlag');
        assert.equal(api.teamUrteil(zelle(ich, er, { faster: false, tie: false })), 'is-gut',
            'die Zelle ist rot, obwohl ich garantiert zuerst umlege');
    });

    it('die Gluecks­wurfzahl bleibt die Untergrenze', () => {
        const { api } = load();
        // Rechnerisch aus dem Schnitt: 100/70 -> 2. Die Engine sagt aber,
        // dass schon EIN Treffer toeten kann. Weniger als eins geht nicht,
        // mehr als der Schnitt aber schon.
        assert.equal(api.realistischeTreffer(bereich(60, 80, 1, 0.2).range), 2);
        // Umgekehrt: der Schnitt sagt 1, die Engine kennt keinen K.O. in 1.
        assert.equal(api.realistischeTreffer(bereich(95, 130, 2, 1).range), 2);
    });

    it('bei gleicher Trefferzahl entscheidet die Initiative', () => {
        const { api } = load();
        const a = bereich(55, 65, 2, 1), b = bereich(55, 65, 2, 1);
        assert.equal(api.teamUrteil(zelle(a, b, { faster: true, tie: false })), 'is-gut');
        assert.equal(api.teamUrteil(zelle(a, b, { faster: false, tie: false })), 'is-schlecht');
    });

    it('ein Initiativgleichstand bleibt unentschieden — er ist ein Muenzwurf', () => {
        const { api } = load();
        const a = bereich(55, 65, 2, 1);
        assert.equal(api.teamUrteil(zelle(a, a, { faster: false, tie: true })), 'is-patt');
    });

    it('was niemanden umlegt, ist ein Patt', () => {
        const { api } = load();
        // 0 % ist immun oder wirkungslos — davon stirbt nichts.
        assert.equal(api.realistischeTreffer(bereich(0, 0, null, 0).range), Infinity);
        assert.equal(api.teamUrteil(zelle(
            bereich(0, 0, null, 0), bereich(0, 0, null, 0))), 'is-patt');
        assert.equal(api.teamUrteil(zelle(null, null)), 'is-patt');
    });

    it('was auch nach neun Treffern nicht toetet, toetet nicht', () => {
        const { api } = load();
        // 5 % je Treffer waeren 20 Treffer — jenseits von KO_MAX_HITS.
        assert.equal(api.realistischeTreffer(bereich(4, 6, null, 0).range), Infinity);
    });

    it('ohne Zelle steht kein Urteil da', () => {
        const { api } = load();
        assert.equal(api.teamUrteil(null), 'is-leer');
    });

    /* Die Gegenprobe an ECHTEN Daten: das Urteil darf sich in keinem Paar
       des Kaders auf eine Trefferzahl stuetzen, die die Zelle selbst als
       unter 50 % wahrscheinlich ausweist. Vor der Korrektur waren das
       30 % aller farbigen Zellen. */
    it('kein Urteil stuetzt sich auf einen unwahrscheinlichen K.O.', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const namen = roster.map(r => r.name).filter(n => api.teamSet('opp', n)).slice(0, 45);
        let farbig = 0, schwach = 0;
        const schlecht = [];
        for (const a of namen) {
            for (const b of namen) {
                const z = api.teamZelle(a, b);
                if (!z) continue;
                const u = api.teamUrteil(z);
                if (u === 'is-leer') continue;
                farbig++;
                for (const s2 of [z.deal, z.take]) {
                    if (!s2 || !s2.range.ko || s2.range.ko.hits == null) continue;
                    const r = api.realistischeTreffer(s2.range);
                    if (r === s2.range.ko.hits && s2.range.ko.chance < 0.5) {
                        schwach++;
                        if (schlecht.length < 3) schlecht.push(`${a}/${b} ${Math.round(s2.range.ko.chance * 100)} %`);
                        break;
                    }
                }
            }
        }
        assert.ok(farbig, 'keine farbigen Zellen geprueft');
        const anteil = schwach / farbig;
        assert.ok(anteil < 0.05,
            `${schwach} von ${farbig} Urteilen (${(anteil * 100).toFixed(1)} %) stuetzen sich `
            + `auf einen K.O. unter 50 % Chance: ${schlecht.join(', ')}`);
    });
});

describe('Team-Rechner — vier von sechs', () => {
    it('ausgeschaltet heisst nicht geloescht', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const sechs = roster.slice(0, 6).map(r => r.name);
        api.teamState({ opp: sechs.slice(), reset: true });
        api.ausSet('opp').add(sechs[0]);
        api.ausSet('opp').add(sechs[1]);
        assert.equal(api.teamState().opp.length, 6,
            'das Ausschalten hat das Pokemon aus den sechs entfernt');
        assert.deepEqual(api.aktiveNamen('opp'), sechs.slice(2),
            'die aktiven vier stimmen nicht');
        assert.equal(api.istAktiv('opp', sechs[0]), false);
        assert.equal(api.istAktiv('opp', sechs[2]), true);
    });

    it('vier ist eine Anzeige, keine Sperre', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        api.teamState({ opp: roster.slice(0, 6).map(r => r.name), reset: true });
        assert.equal(api.aktiveNamen('opp').length, 6,
            'sechs aktive werden auf vier gekuerzt — dann kann man nicht '
            + 'erst rechnen und danach waehlen');
        assert.equal(api.TEAM_KAMPF, 4);
    });

    it('beide Seiten haben getrennte Schalter', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const n = roster[0].name;
        api.teamState({ mine: [{ name: n, set: null }], opp: [n], reset: true });
        api.ausSet('opp').add(n);
        assert.equal(api.istAktiv('opp', n), false);
        assert.equal(api.istAktiv('me', n), true,
            'ein Schalter auf der Gegnerseite schaltet auch das eigene aus');
    });
});

/* BEFUND DER ABNAHME (02.09.2026): es gab NULL Abdeckung des Zeichnens.
   teamCalcHtml, teamMatrix, teamBank, teamPfeil und wireTeam wurden von
   keinem Test aufgerufen. Drei Mutationen, die das Feature vollstaendig
   abschalten, blieben deshalb gruen:
     - teamCalcHtml() gibt '' zurueck    -> der Rechner zeichnet nichts
     - teamZelle() gibt null zurueck     -> jede Zelle ist ein Strich
     - die teamBtn-Zweige vertauscht     -> der Knopf steht nur im Rechner

   Die folgenden Pruefungen rufen die Zeichenfunktionen wirklich auf und
   lesen ihr Ergebnis. */
describe('Team-Rechner — was wirklich gezeichnet wird', () => {

    function gestellt(anzahlGegner) {
        const { api, sandbox } = load();
        const roster = api.setData(DATA);
        const mit = roster.filter(r => api.teamSet('opp', r.name)).map(r => r.name);
        api.teamState({
            mine: mit.slice(0, 3).map(n => ({ name: n, set: null })),
            opp: mit.slice(3, 3 + (anzahlGegner == null ? 2 : anzahlGegner)),
            an: true, reset: true,
        });
        return { api, sandbox, meine: mit.slice(0, 3), gegner: mit.slice(3, 3 + (anzahlGegner == null ? 2 : anzahlGegner)) };
    }

    it('teamCalcHtml zeichnet Bank, Suchfeld, Matrix und Fussnote', () => {
        const { api } = gestellt();
        const html = api.teamCalcHtml();
        assert.ok(html && html.trim(), 'der Rechner zeichnet gar nichts');
        assert.match(html, /class="sq-team"/);
        assert.match(html, /data-sq-team-toggle="me"/, 'die eigene Bank fehlt');
        assert.match(html, /data-sq-team-toggle="opp"/, 'die Gegnerbank fehlt');
        assert.match(html, /id="sqTeamSuche"/, 'das Suchfeld fehlt');
        assert.match(html, /class="sq-team-matrix"/, 'die Matrix fehlt');
        assert.match(html, /class="sq-note"/, 'die Fussnote fehlt');
    });

    it('die Matrix hat je aktivem Paar genau eine Zelle', () => {
        const { api, meine, gegner } = gestellt(2);
        const html = api.teamMatrix();
        const zellen = (html.match(/class="sq-team-zelle/g) || []).length;
        assert.equal(zellen, meine.length * gegner.length,
            `${zellen} Zellen fuer ${meine.length}x${gegner.length}`);
        // <th scope="row"> statt <tr>: der Tabellenkopf ist auch ein <tr>.
        const zeilen = (html.match(/<th scope="row">/g) || []).length;
        assert.equal(zeilen, meine.length);
        const kopf = (html.match(/<th scope="col">/g) || []).length;
        assert.equal(kopf, gegner.length);
    });

    it('in jeder Zelle stehen echte Zahlen, kein Strich', () => {
        const { api } = gestellt(2);
        const html = api.teamMatrix();
        const striche = (html.match(/class="sq-team-zelle is-leer"/g) || []).length;
        assert.equal(striche, 0, 'die Matrix ist leer, obwohl beide Seiten Sets haben');
        assert.match(html, /\d+(?:,\d)?–\d+(?:,\d)? %/,
            'in keiner Zelle steht eine Spanne — es wird nur der Hoechstwurf gezeigt');
    });

    it('die Zelle zeigt die Spanne, nicht nur den Hoechstwurf', () => {
        const { api } = gestellt(1);
        const html = api.teamMatrix();
        // Genau die Form "42,5–50,7 %". Ein einzelner Wert wuerde den
        // Leser glauben lassen, das sei der Schaden — es ist der beste Wurf.
        const spannen = html.match(/<b>[^<]*–[^<]*%<\/b>/g) || [];
        assert.ok(spannen.length,
            'keine einzige Zelle zeigt eine Spanne min–max');
    });

    it('die Zelle nennt die Attacke, aus der die Zahl kommt', () => {
        const { api } = gestellt(1);
        const html = api.teamMatrix();
        assert.match(html, /<em title="[^"]+">[^<]+<\/em>/,
            'die Prozentzahl steht ohne ihre Attacke da und ist nicht nachrechenbar');
    });

    it('die Zelle traegt ihr Urteil auch als Text, nicht nur als Farbe', () => {
        const { api } = gestellt(1);
        const html = api.teamMatrix();
        assert.match(html, /class="sq-nur-vorlesen">[^<]+</,
            'das Urteil haengt allein an einer Farbkante — fuer '
            + 'Rot-Gruen-Schwaeche und beim Vorlesen ist die Zelle urteilslos');
    });

    it('die Zelle springt in die Einzelansicht', () => {
        const { api } = gestellt(1);
        const html = api.teamMatrix();
        assert.match(html, /data-sq-team-zelle="/, 'kein Absprung aus der Zelle');
        assert.match(html, /data-sq-team-mein="/);
        assert.match(html, /role="button" tabindex="0"/);
    });

    it('ohne aktive Seite steht der Grund da, keine leere Tabelle', () => {
        const { api, meine } = gestellt(2);
        meine.forEach(n => api.ausSet('me').add(n));
        const html = api.teamMatrix();
        assert.ok(!/sq-team-matrix/.test(html), 'eine Matrix ohne Zeilen wird gezeichnet');
        assert.match(html, /sq-empty/);
    });

    it('der Zaehler sagt, wie viele von wie vielen aktiv sind', () => {
        const { api, gegner } = gestellt(2);
        const html = api.teamBank('opp');
        assert.match(html, /sq-team-zaehler/);
        api.ausSet('opp').add(gegner[0]);
        const html2 = api.teamBank('opp');
        assert.notEqual(html, html2, 'der Zaehler bewegt sich nicht');
    });

    it('mehr als vier aktiv wird gesagt, aber nicht verhindert', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const mit = roster.filter(r => api.teamSet('opp', r.name)).map(r => r.name);
        api.teamState({ opp: mit.slice(0, 6), an: true, reset: true });
        const html = api.teamBank('opp');
        assert.match(html, /sq-team-zuviel/,
            'sechs aktive werden nicht als "mehr als vier" ausgewiesen');
        assert.equal(api.aktiveNamen('opp').length, 6,
            'die Zahl wird durchgesetzt statt nur angezeigt');
    });

    it('das Kreuz steht neben dem Schalter, nicht darin', () => {
        const { api } = gestellt(1);
        const html = api.teamBank('opp');
        // Ein Bedienelement in einem <button> ist ungueltiges HTML.
        const proButton = html.split('<button').slice(1);
        proButton.forEach(teil => {
            const bisEnde = teil.split('</button>')[0];
            assert.ok(!/<button|role="button"/.test(bisEnde),
                'in einem Schalter steckt ein zweites Bedienelement');
        });
        assert.match(html, /class="sq-team-chip-weg"/);
    });

    it('der Knopf in den Team-Rechner steht in der Liste, nicht im Rechner', () => {
        const { api, sandbox } = load();
        api.setData(DATA);
        // Ein Host, der das gezeichnete HTML aufnimmt.
        let letztes = '';
        sandbox.document.getElementById = (id) =>
            (id === 'sideQuestMatchupsHost'
                ? { set innerHTML(v) { letztes = v; }, get innerHTML() { return letztes; },
                    querySelectorAll: () => [], querySelector: () => null, hidden: false }
                : null);
        api.teamState({ an: false, reset: true });
        api.state({ me: null });
        sandbox.sideQuestMatchups.activate();
        const inListe = letztes;
        assert.match(inListe, /data-sq-team-open/,
            'in der Matchup-Liste fehlt der Weg in den Team-Rechner');

        api.teamState({ an: true });
        sandbox.sideQuestMatchups.activate();
        assert.ok(!/data-sq-team-open/.test(letztes),
            'der Knopf steht auch im Rechner selbst, wo er nichts tut');
        assert.match(letztes, /data-sq-back/, 'aus dem Rechner fuehrt kein Weg zurueck');
    });

    /* wireTeam haengt die Klickpfade an. Ein winziges Falsch-DOM reicht,
       um zu zeigen, DASS jeder Selektor bedient wird — ohne das bleibt
       ein geloeschter Zweig unbemerkt. */
    it('wireTeam bedient jeden Klickpfad', () => {
        const { api } = gestellt(1);
        const gesehen = {};
        const knoten = (sel) => ({
            getAttribute: () => 'x',
            addEventListener: (art) => { gesehen[sel] = (gesehen[sel] || []).concat(art); },
        });
        const host = {
            querySelectorAll: (sel) => [knoten(sel)],
            querySelector: (sel) => (sel === '#sqTeamSuche' ? knoten(sel) : null),
        };
        api.wireTeam(host);
        ['[data-sq-team-open]', '[data-sq-team-weg]', '[data-sq-team-toggle]',
         '[data-sq-team-add]', '[data-sq-team-zelle]'].forEach(sel => {
            assert.ok(gesehen[sel] && gesehen[sel].includes('click'),
                `kein Klick an ${sel}`);
        });
        assert.ok(gesehen['[data-sq-team-zelle]'].includes('keydown'),
            'die Zelle ist nicht mit der Tastatur erreichbar');
        assert.ok(gesehen['#sqTeamSuche'] && gesehen['#sqTeamSuche'].includes('input'),
            'das Suchfeld reagiert nicht');
    });
});

/* Die Befunde 2, 5 und 6 der Abnahme: der Namensraum, die fehlende
   Klammerung, die englischsprachige Suche. Alle drei waren vorher ohne
   Zusicherung. */
describe('Team-Rechner — was die Abnahme gefunden hat', () => {

    it('der Showdown-Name wird in den Anzeigenamen aufgeloest', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        /* Der gemeldete Fall: alsTeamObjekt() schreibt "Zoroark-Hisui",
           _dex fuehrt "Hisuian Zoroark". 25 von 238 Slugs — saemtliche
           Regionalformen — kamen als leere Zeile an. */
        const formen = roster.filter(r => /^(Hisuian|Alolan|Galarian|Paldean)/.test(r.name));
        assert.ok(formen.length, 'Testannahme: der Kader fuehrt Regionalformen');

        formen.slice(0, 5).forEach(r => {
            const slug = api.usageSlug(r.name);
            assert.ok(slug, `${r.name} ohne Nutzungs-Slug`);
            // Genau die Form, die der Builder uebergibt: Showdown-Name
            // (fuer den Rechner unbekannt) plus Slug.
            const geloest = api.loeseNamen({ name: 'Voellig-Unbekannt-XY', slug });
            assert.equal(geloest, r.name,
                `${slug} loest nicht auf ${r.name} auf, sondern auf ${geloest}`);
            assert.ok(api.statsOf(geloest, api.teamSet('opp', geloest)),
                `${geloest} laesst sich nicht berechnen`);
        });
    });

    it('ohne Slug wird der Name gegen den Kader gehalten, nicht geraten', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const echt = roster[0].name;
        assert.equal(api.loeseNamen({ name: echt }), echt);
        // Ein Name, den niemand kennt, bleibt stehen — dann sagt es der
        // Chip. Er wird nicht auf irgendetwas Aehnliches gebogen.
        assert.equal(api.loeseNamen({ name: 'Kein Pokemon Der Welt' }),
            'Kein Pokemon Der Welt');

        /* Der Unterschied, um den es geht: ein Name, den _dex NICHT
           kennt, der aber als Slug auffindbar ist, muss ueber den Slug
           gehen. Wer den Namen ungeprueft durchreicht, liefert genau die
           leere Zeile, die die Abnahme gefunden hat. */
        const form = roster.find(r => /^(Hisuian|Alolan|Galarian|Paldean)/.test(r.name));
        assert.ok(form, 'Testannahme: der Kader fuehrt Regionalformen');
        /* Ohne Slug — so rufen fremde Aufrufer die oeffentliche
           Schnittstelle auf. Ein Name, den _dex nicht kennt, der aber als
           Slug auffindbar ist, muss trotzdem ankommen. Wer den Namen
           ungeprueft durchreicht, liefert die leere Zeile aus der
           Abnahme. */
        const slugForm = api.usageSlug(form.name);
        assert.ok(slugForm && slugForm !== form.name,
            `Testannahme: "${form.name}" hat einen abweichenden Slug`);
        assert.ok(!api.statsOf(slugForm, api.teamSet('opp', form.name)),
            `Testannahme: "${slugForm}" ist als Name unbekannt`);
        assert.equal(api.loeseNamen({ name: slugForm }), form.name,
            `"${slugForm}" wird ungeprueft durchgereicht statt auf `
            + `"${form.name}" aufgeloest zu werden`);
    });

    it('ein unbekannter Name traegt die Warnung am Chip', () => {
        const { api } = load();
        api.setData(DATA);
        api.teamState({ mine: [{ name: 'Kein Pokemon Der Welt', set: null }],
                        an: true, reset: true });
        const html = api.teamBank('me');
        assert.match(html, /sq-team-chip-warn/,
            'ein Pokemon, das der Rechner nicht kennt, kommt kommentarlos '
            + 'als leere Zeile an');
    });

    it('die Verteilung wird geklammert: 32 je Wert, Summe 66', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const name = roster.find(r => api.teamSet('opp', r.name)).name;
        // oeffneTeamRechner ist eine oeffentliche window-Schnittstelle.
        // Ein Aufrufer mit Showdown-EVs darf keine Werte erzeugen, die es
        // in Champions nicht gibt.
        api.uebernimmTeam({ mons: [{ name, slug: api.usageSlug(name),
            nature: 'Adamant', moves: ['Tackle'], evs: '252 HP / 252 Atk / 4 Spe' }] });
        const sp = api.teamState().mine[0].set.spread;
        const summe = sp.hp + sp.atk + sp.def + sp.spa + sp.spd + sp.spe;
        assert.ok(sp.hp <= api.SP_MAX && sp.atk <= api.SP_MAX,
            `ungeklammert: ${JSON.stringify(sp)}`);
        assert.ok(summe <= api.SP_BUDGET,
            `Summe ${summe} ueber dem Budget ${api.SP_BUDGET}`);
    });

    it('geklammert wird ueber ChampionsSet, nicht mit einem zweiten Weg', () => {
        const { api, sandbox } = load();
        const CSSRC = fs.readFileSync(path.join(ROOT, 'js', 'champions-set.js'), 'utf8');
        vm.runInContext(CSSRC, sandbox);
        const roh = { hp: 60, atk: 60, def: 60, spa: 0, spd: 0, spe: 0 };
        assert.deepEqual(
            Object.entries(api.klammereSpread(roh)).sort(),
            Object.entries(sandbox.ChampionsSet.clampSpread(roh)).sort(),
            'die Klammer des Rechners weicht von der des Builders ab');
    });

    it('spreadAusText nimmt den Parser aus ChampionsSet, wenn er da ist', () => {
        const { api, sandbox } = load();
        const CSSRC = fs.readFileSync(path.join(ROOT, 'js', 'champions-set.js'), 'utf8');
        vm.runInContext(CSSRC, sandbox);
        // Die deutschen Kuerzel und die Langform konnte der eigene Parser
        // nicht — ChampionsSet kann beides seit jeher.
        ['32 KP / 32 ANG', '12 Sp. Atk / 8 Sp. Def', '2 INI / 30 SPV'].forEach(t => {
            assert.deepEqual(
                Object.entries(api.spreadAusText(t)).sort(),
                Object.entries(sandbox.ChampionsSet.parseSpread(t)).sort(),
                `"${t}" wird anders gelesen als im Builder`);
        });
        assert.notDeepEqual(api.spreadAusText('32 KP / 32 ANG'),
            { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            'die deutschen Kuerzel werden verschluckt');

        /* Und der Beweis, dass wirklich ChampionsSet gefragt wird und
           nicht zufaellig zwei Wege dasselbe sagen: wenn parseSpread
           etwas Erkennbares zurueckgibt, muss es durchkommen. */
        const echterParser = sandbox.ChampionsSet.parseSpread;
        let gefragt = 0;
        sandbox.ChampionsSet.parseSpread = (t) => { gefragt++; return echterParser(t); };
        api.spreadAusText('12 HP / 32 Atk');
        sandbox.ChampionsSet.parseSpread = echterParser;
        assert.equal(gefragt, 1,
            'spreadAusText geht am Parser des Builders vorbei und rechnet '
            + 'auf einem zweiten Weg');
    });

    it('die Gegnersuche findet auch den deutschen Namen', () => {
        const { api } = load('de');
        const roster = api.setData(DATA);
        // Ein Pokemon, dessen deutscher Name sich vom englischen
        // unterscheidet — aus der echten Namensdatei.
        const kandidat = roster.find(r => {
            const de = (DATA.names.pokemon || {})[r.name];
            return de && de.toLowerCase() !== r.name.toLowerCase()
                && !r.name.toLowerCase().includes(de.toLowerCase().slice(0, 4));
        });
        assert.ok(kandidat, 'Testannahme: es gibt abweichende deutsche Namen');
        const de = DATA.names.pokemon[kandidat.name];

        api.teamState({ opp: [], an: true, reset: true });
        api.teamQ(de.slice(0, 5).toLowerCase());
        const html = api.teamSuche();
        assert.match(html, /data-sq-team-add=/,
            `"${de}" findet im Team-Rechner nichts, obwohl der Kader es kennt`);
        assert.ok(html.includes(kandidat.name),
            `die Suche nach "${de}" liefert nicht ${kandidat.name}`);
    });

    it('Immunitaet steht als Wort da, nicht als 0 %', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        // Ein echtes immunes Paar suchen: Normal/Kampf gegen Geist,
        // Psycho gegen Unlicht, Boden gegen Flug.
        const namen = roster.filter(r => api.teamSet('opp', r.name)).map(r => r.name).slice(0, 60);
        let gefunden = null;
        for (const a of namen) {
            for (const b of namen) {
                const z = api.teamZelle(a, b);
                if (z && z.deal && z.deal.range.effectiveness === 0) { gefunden = [a, b]; break; }
            }
            if (gefunden) break;
        }
        assert.ok(gefunden, 'Testannahme: im Kader gibt es ein immunes Paar');
        api.teamState({ mine: [{ name: gefunden[0], set: null }],
                        opp: [gefunden[1]], an: true, reset: true });
        const html = api.teamMatrix();
        assert.match(html, /is-immun/,
            `${gefunden[0]} gegen ${gefunden[1]} ist immun und wird als Zahl gezeigt — `
            + 'nicht unterscheidbar von "trifft fuer fast nichts"');
    });

    it('eine zweite Uebergabe erbt nichts von der ersten', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const mit = roster.filter(r => api.teamSet('opp', r.name)).map(r => r.name);
        api.uebernimmTeam({ mons: [{ name: mit[0], slug: api.usageSlug(mit[0]),
                                     nature: 'Adamant', moves: ['Tackle'], evs: '' }] });
        api.teamState({ opp: [mit[1], mit[2]] });
        api.ausSet('opp').add(mit[1]);

        api.uebernimmTeam({ mons: [{ name: mit[3], slug: api.usageSlug(mit[3]),
                                     nature: 'Adamant', moves: ['Tackle'], evs: '' }] });
        const st = api.teamState();
        // .length statt deepEqual: das Feld kommt aus dem Sandkasten
        // und traegt dessen Array.prototype.
        assert.equal(st.opp.length, 0,
            'die zweite Uebergabe erbt die Gegner der ersten');
        assert.equal(api.ausSet('opp').size, 0,
            'die zweite Uebergabe erbt die abgeschalteten Gegner der ersten');
    });

    it('die Fussnote verspricht in der Team-Ansicht keinen Set-Editor', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const mit = roster.filter(r => api.teamSet('opp', r.name)).map(r => r.name);
        api.teamState({ mine: [{ name: mit[0], set: null }], opp: [mit[1]],
                        an: true, reset: true });
        const html = api.teamCalcHtml();
        const note = (html.match(/<p class="sq-note">([\s\S]*?)<\/p>/) || [])[1] || '';
        assert.ok(note.trim(), 'keine Fussnote gefunden');
        assert.ok(!/im Rechner änderbar|editable in the calculator/.test(note),
            'die Fussnote zeigt auf einen Set-Editor, den es in dieser '
            + 'Ansicht nicht gibt');
    });
});

describe('Team-Rechner — Uebergabe aus dem Builder', () => {
    it('das Modul bietet oeffneTeamRechner nach aussen an', () => {
        const { sandbox } = load();
        assert.equal(typeof sandbox.sideQuestMatchups.oeffneTeamRechner, 'function',
            'der Builder kann das Team nicht uebergeben');
    });

    it('der Builder hat einen Knopf und uebergibt alsTeamObjekt()', () => {
        assert.match(BUILDER_C, /class="sqb-rechner"/,
            'der Knopf im Builder fehlt');
        assert.match(BUILDER_C,
            /sideQuestMatchups\.oeffneTeamRechner\(alsTeamObjekt\(\)\)/,
            'der Builder uebergibt etwas anderes als das gebaute Team — '
            + 'dann rechnet der Rechner mit fremden Verteilungen');
        /* Der Slug ist der Schluessel, ueber den der Rechner den
           Anzeigenamen findet. Ohne ihn kommen alle Regionalformen als
           leere Zeile an — der Befund der Abnahme. */
        const teamObj = BUILDER_C.slice(BUILDER_C.indexOf('function alsTeamObjekt'));
        const bis = teamObj.slice(0, teamObj.indexOf('return { mons'));
        assert.match(bis, /slug:\s*slug/,
            'alsTeamObjekt() gibt den Nutzungs-Slug nicht mit — dann muss '
            + 'der Rechner den Showdown-Namen raten');
    });

    it('fehlt der Rechner, sagt der Builder das, statt still nichts zu tun', () => {
        assert.match(BUILDER_C, /rechnerFehlt/,
            'ohne geladenen Rechner passiert beim Klick nichts und niemand '
            + 'erfaehrt warum');
        assert.match(BUILDER, /Der Rechner konnte nicht geladen werden/);
        assert.match(BUILDER, /The calculator could not be loaded/);
    });
});

describe('Team-Rechner — Oberflaeche', () => {
    it('die Matrix scrollt in ihrem eigenen Kasten, nicht die Seite', () => {
        assert.match(CSS_C, /\.sq-team-matrixwrap\s*\{[^}]*overflow-x:\s*auto/,
            'eine breite Matrix schiebt die ganze Seite zur Seite');
    });

    it('gruen ist, was du austeilst — dieselbe Farbe wie eine Ansicht hoeher', () => {
        // #6fdca0 und #ff8f7a stehen in .sq-mu-bar.is-deal/.is-take. Ein
        // dritter Gruenton fuer dieselbe Bedeutung waere der Anfang davon,
        // dass die Farbe nichts mehr heisst.
        const marken = CSS_C.match(/--sq-gut:\s*(#[0-9a-fA-F]{6})/);
        const marken2 = CSS_C.match(/--sq-schlecht:\s*(#[0-9a-fA-F]{6})/);
        assert.ok(marken && marken2, 'die Farbmarken des Team-Rechners fehlen');
        assert.equal(marken[1].toLowerCase(), '#6fdca0');
        assert.equal(marken2[1].toLowerCase(), '#ff8f7a');
        assert.match(CSS_C, /\.sq-mu-bar\.is-deal i \{[^}]*#6fdca0/);
        assert.match(CSS_C, /\.sq-mu-bar\.is-take i \{[^}]*#ff8f7a/);
    });

    it('jeder Chip ist mit der Tastatur erreichbar und sagt seinen Zustand', () => {
        assert.match(SRC_C, /aria-pressed="\$\{an \? 'true' : 'false'\}"/,
            'der Schalter sagt Screenreadern nicht, ob er an ist');
        assert.match(CSS_C, /\.sq-team-chip:focus-visible[^{]*\{[^}]*outline/,
            'der Chip zeigt keinen Tastaturfokus');
    });

    it('ein Pokemon ohne Set traegt das am Chip, nicht erst in der Zelle', () => {
        assert.match(SRC_C, /sq-team-chip-warn/);
        assert.match(SRC_C, /teamKeinSet/);
    });

    /* Live gefunden (02.09.2026): ein uebergebener Bau mit Wesen, aber
       ohne Attacken zeigte in JEDER Zelle "du teilst aus –". Rechnerisch
       richtig — vier Statusattacken machen null Schaden — aber ein Strich
       ohne Grund sieht aus wie ein Fehler des Rechners. Der Grund steht
       jetzt am Chip, dort wo die Ursache sitzt. */
    it('ein Bau ohne Angriffsattacke sagt das am Chip', () => {
        const { api } = load();
        const roster = api.setData(DATA);
        const name = roster.find(r => api.teamSet('opp', r.name)).name;

        // Ein Set mit einer Attacke, die es gibt und die Staerke hat.
        const echt = api.teamSet('opp', name);
        const mitPower = (echt.moves || []).some(mn => {
            const t = api.moveTable(name, echt, name, echt);
            return !!t.length;
        });
        assert.ok(mitPower, 'Testannahme: das Standardset hat eine Angriffsattacke');

        // Und derselbe Bau ohne jede Attacke darf nicht als vollwertig gelten.
        api.teamState({ mine: [{ name, set: {
            nature: 'Adamant', ability: '', item: '', moves: [],
            spread: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
        } }], reset: true });
        const leer = api.teamSet('me', name);
        assert.deepEqual(leer.moves, [],
            'die Uebergabe hat dem Bau Attacken hinzugefuegt');
        assert.equal(api.moveTable(name, leer, name, echt).length, 0,
            'ein Set ohne Attacken erzeugt trotzdem Schadenszeilen');

        /* BEFUND DER ABNAHME: hier stand eine Quelltextsuche nach
           "keine Angriffsattacke" — und dieselbe Zeichenkette ist seit
           jeher der Wert von `noMove` (Zeile 127). Die Zusicherung war
           erfuellt, auch wenn teamKeineAttacke geloescht wurde. Geprueft
           wird jetzt das GEZEICHNETE Ergebnis. */
        api.teamState({ mine: [{ name, set: {
            nature: 'Adamant', ability: '', item: '', moves: [],
            spread: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
        } }], an: true, reset: true });
        const html = api.teamBank('me');
        assert.match(html, /sq-team-chip-warn/,
            'der Chip traegt keine Warnung, obwohl der Bau nichts austeilt');
        const warnung = (html.match(/sq-team-chip-warn">([^<]*)</) || [])[1];
        assert.ok(warnung && warnung.trim(),
            `die Warnung am Chip ist leer: ${JSON.stringify(warnung)}`);
    });

    /* Die Unterscheidung, um die es geht: 199 der 494 Attacken in
       champions_resources.json haben keine Staerke. Ein Bau aus vier
       davon ist ein vollstaendiges Set und teilt trotzdem nichts aus.
       Eine Pruefung, die nur fragt "kennen wir die Attacke?", wuerde
       ihn als angriffsfaehig durchwinken. */
    it('vier Statusattacken sind kein Angriff', () => {
        const { api } = load();
        const moves = DATA.res.entries.filter(e => e.cat === 'move');
        const status = moves.filter(e => !e.power).map(e => e.en);
        const kraft = moves.filter(e => e.power).map(e => e.en);
        /* Keine Ungleichung gegen eine feste Zahl: dass es beide Sorten
           gibt, ist eine Eigenschaft der Attackendaten und bleibt wahr;
           WIE VIELE es sind, ist ein Wochenwert und gehoerte damit in
           den Datenwaechter, nicht hierher. */
        assert.ok(status.length && kraft.length,
            'Testannahme veraltet: die Attackendaten fuehren nicht mehr '
            + 'beide Sorten');

        const bau = (mv) => ({ nature: 'Adamant', ability: '', item: '', moves: mv,
                               spread: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } });
        assert.equal(api.hatAngriff(bau(status.slice(0, 4))), false,
            `vier Statusattacken (${status.slice(0, 4).join(', ')}) gelten als Angriff`);
        assert.equal(api.hatAngriff(bau(kraft.slice(0, 1))), true,
            `${kraft[0]} gilt nicht als Angriff`);
        // Eine einzige Angriffsattacke unter drei Statusattacken reicht.
        assert.equal(api.hatAngriff(bau(status.slice(0, 3).concat(kraft[0]))), true);
        assert.equal(api.hatAngriff(bau([])), false);
        assert.equal(api.hatAngriff(null), false);
    });

    it('der Team-Knopf steht nur in der Liste, nicht im Rechner selbst', () => {
        assert.match(SRC_C, /const teamBtn = \(!_calc && !_teamAn\)/,
            'der Knopf in den Team-Rechner steht auch dort, wo er nichts tut');
    });
});
