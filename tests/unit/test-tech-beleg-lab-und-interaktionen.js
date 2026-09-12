/**
 * DIE EINORDNUNG GILT AUCH IN DEN BEIDEN ANDEREN AUSGABEPFADEN
 *
 * ENTSCHEIDUNG DES BETREIBERS (07.09.2026), woertlich:
 *
 *     "Empfehlungen auf das begrenzen, was belegt ist, Rest offen als
 *      'keine Daten' anschreiben."
 *
 * Umgesetzt war das zuerst nur im Build-vs-Assistenten
 * (js/app-anti-tech.js) und im Warum-Dialog (js/app-deck-builder.js).
 * Die unabhaengige Abnahme hat zwei weitere Stellen gemessen, die
 * Tech-Karten empfehlen und dabei GAR NICHTS ueber ihre Herkunft
 * sagten:
 *
 *   1. Tech Lab (js/app-tech-lab.js, `_renderTechGrid`, eingebunden
 *      ueber index.html #techLabSection). `grep -n "beleg"` fand null
 *      Treffer. Die Kacheln zeigten nur `confidence` — eine Aussage
 *      ueber die SICHERHEIT DER ABLEITUNG, die als Aussage ueber die
 *      Karte gelesen wird — und die Begruendung stand im
 *      title-Attribut, also im Tooltip. Selbst eingetragene Karten
 *      (techLab.confUser) sahen aus wie ein Befund der Maschine.
 *
 *   2. "Erkannte Tech-Interaktionen"
 *      (js/app-current-meta-analysis.js,
 *      `_renderCapabilityTechSection`). Ebenfalls nur `confidence`,
 *      ohne Quelle, Version, Stand — und ohne die Partienzahl, die an
 *      DIESER Stelle wirklich vorliegt, weil hier ein Deck gegen ein
 *      Deck steht.
 *
 * KEINE DATEI AUS data/ WIRD HIER GELESEN. Alle Eingaben sind
 * synthetisch. Geprueft wird der Wortlaut der Einordnung und die
 * Zuordnung Quelle -> Grad; beides sind Entscheidungen dieses
 * Projekts und aendern sich nicht mit dem naechsten Scraperlauf.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const LAB  = lies('js', 'app-tech-lab.js');
const META = lies('js', 'app-current-meta-analysis.js');
const I18N = lies('js', 'i18n.js');

/* Zieht eine benannte Funktion samt Kopf aus dem Quelltext, an der
   geschweiften Klammer gezaehlt. */
function funktion(quelle, kopf) {
    const a = quelle.indexOf(kopf);
    assert.ok(a >= 0, `nicht gefunden: ${kopf}`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', a); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(a, j + 1); }
    }
    throw new Error(`unbalancierte Klammern in ${kopf}`);
}

const STAND = { version: '0.1', datum: '2026-05-15', paarungen: 5 };

// ─────────────────────────────────────────────────────────────────────
// 1. Tech Lab (js/app-tech-lab.js)
// ─────────────────────────────────────────────────────────────────────

/* Zeichnet das ECHTE Kachelgitter. `t` fehlt absichtlich — dann
   greifen die deutschen Rueckfaelle, und genau die stehen ohne
   geladenes Woerterbuch in der Oberflaeche. */
function maleGitter(techs, stand) {
    const geschrieben = { html: '' };
    const listEl = {
        set innerHTML(v) { geschrieben.html = v; },
        get innerHTML() { return geschrieben.html; }
    };
    const code = [
        "const BELEG_QUELLE = 'data/card_capability_interactions.json';",
        `let _regelstand = ${JSON.stringify(stand === undefined ? STAND : stand)};`,
        funktion(LAB, '    function _t(key, fallback) {'),
        funktion(LAB, '    function _tf(key, fallback) {'),
        funktion(LAB, '    function _escapeHtml(s) {'),
        funktion(LAB, '    function _cardImageUrl(cardId) {'),
        funktion(LAB, '    function _belegDatum(iso) {'),
        funktion(LAB, '    function _belegSatz(tech) {'),
        funktion(LAB, '    function _belegKlasse(tech) {'),
        funktion(LAB, '    function _belegKopfHtml() {'),
        funktion(LAB, '    function _renderTechGrid(listEl, techs, direction, emptyText) {'),
        "return _renderTechGrid(listEl, techs, 'beatenBy', 'nichts gefunden');"
    ].join('\n');
    new Function('listEl', 'techs', 'getLang', 't', 'escapeHtml', code)(
        listEl, techs, () => 'de', undefined, undefined);
    return geschrieben.html;
}

const AUS_REGELBASIS = {
    name: 'Crustle', cardId: 'PBL|9', narrative: 'Crustle ignoriert Pikachu exs KO-Schutz.',
    confidence: 'high', attackSource: 'Rock Wrecker', beleg: 'paarung'
};
const SELBST_EINGETRAGEN = {
    name: 'Kieran', cardId: null, narrative: 'Von dir hinzugefügt',
    confidence: 'user', attackSource: null, beleg: 'nutzer', isUserAdded: true
};

describe('Tech Lab: jede Kachel sagt, worauf sie beruht', () => {

    it('eine Kachel aus der Regelbasis nennt Quelle, Version und Stand — sichtbar', () => {
        const html = maleGitter([AUS_REGELBASIS]);
        assert.ok(html.includes('tech-lab-grid-beleg'), 'eigenes Element je Kachel');
        assert.ok(html.includes('belegt'), html.slice(0, 400));
        assert.ok(html.includes('card_capability_interactions.json'), 'nennt die Quelle');
        assert.ok(html.includes('v0.1'), 'nennt die Version');
        assert.ok(html.includes('15.05.2026'), 'nennt den Stand in deutscher Schreibweise');
    });

    it('die Einordnung steht NICHT im title-Attribut', () => {
        /* Genau der gemessene Befund: die Begruendung steckte in
           `title="…"`, also im Tooltip — auf dem Telefon liest die
           niemand. */
        const html = maleGitter([AUS_REGELBASIS]);
        const vorTitle = html.split('title=')[0];
        assert.ok(vorTitle.includes('belegt'),
            'die Einordnung muss vor dem ersten title-Attribut im Text stehen');
        assert.ok(html.includes('class="tech-lab-grid-beleg tech-lab-beleg-ja"'),
            'und in einem eigenen, sichtbaren Element');
    });

    it('Tech Lab behauptet KEINE Partienzahl — hier steht Karte gegen Karte', () => {
        const html = maleGitter([AUS_REGELBASIS]);
        assert.ok(html.includes('keine Partien dahinter'),
            `die fehlende Stichprobe wird benannt: ${html}`);
        assert.ok(!/\d+\s*Partien\b(?! dahinter)/.test(html.replace('keine Partien dahinter', '')),
            'eine Zahl aus irgendeiner Deckpaarung waere hier erfunden');
    });

    it('eine selbst eingetragene Karte sagt genau das', () => {
        const html = maleGitter([SELBST_EINGETRAGEN]);
        assert.ok(html.includes('vom Nutzer eingetragen'), html);
        assert.ok(html.includes('nicht an Partien gemessen'), html);
        assert.ok(html.includes('tech-lab-beleg-nutzer'), 'eigene Klasse fuer die eigene Eintragung');
        assert.ok(!html.includes('belegt ·'),
            'was ein Mensch hingeschrieben hat, ist kein Befund der Maschine');
    });

    it('eine Kachel ohne Herkunftsangabe gilt als unbelegt, nicht als belegt', () => {
        const html = maleGitter([{ name: 'X', confidence: 'medium' }]);
        assert.ok(html.includes('unbelegt'), html);
        assert.ok(html.includes('aus dem Kartentext abgeleitet, nicht an Partien gemessen'), html);
        assert.ok(html.includes('tech-lab-beleg-nein'), html);
        assert.ok(!html.includes('card_capability_interactions.json · '),
            'eine unbelegte Kachel beruft sich nicht auf die Regelbasis');
    });

    it('ueber dem Gitter stehen Quelle, Version, Stand und die Abdeckung', () => {
        const html = maleGitter([AUS_REGELBASIS]);
        assert.ok(html.includes('tech-lab-beleg-kopf'), 'eigener Kopf ueber der Liste');
        assert.ok(html.includes('5 Paarungen'),
            'fuenf Paarungen sind eine Aussage ueber die Abdeckung');
    });

    it('auch ueber einer leeren Liste steht, WORAUS nichts gefunden wurde', () => {
        const html = maleGitter([]);
        assert.ok(html.includes('tech-lab-beleg-kopf'), html);
        assert.ok(html.includes('15.05.2026'), html);
        assert.ok(html.includes('nichts gefunden'), 'der leere Zustand bleibt stehen');
    });

    it('ohne gelesene Regelbasis steht "Datum unbekannt", kein erfundenes Datum', () => {
        const html = maleGitter([AUS_REGELBASIS], { version: null, datum: null, paarungen: 0 });
        assert.ok(html.includes('Datum unbekannt'), html);
        assert.ok(!/\d{2}\.\d{2}\.\d{4}/.test(html), `kein erfundenes Datum: ${html}`);
    });

    /* MASKIERUNG: Kartennamen und Regelstand kommen aus Dateien. */
    it('ein Kartenname mit HTML wird maskiert', () => {
        const html = maleGitter([Object.assign({}, AUS_REGELBASIS, { name: '<b>X</b>' })]);
        assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'), html.slice(0, 600));
        assert.ok(!html.includes('<b>X</b>'), 'ein Kartenname darf kein Markup werden');
    });

    it('eine Version mit HTML wird im Kopf maskiert', () => {
        const html = maleGitter([AUS_REGELBASIS],
            { version: '<b>0.1</b>', datum: '2026-05-15', paarungen: 5 });
        assert.ok(html.includes('&lt;b&gt;0.1&lt;/b&gt;'), html.slice(0, 600));
        assert.ok(!html.includes('<b>0.1</b>'), 'ein Wert aus der Datei darf kein Markup werden');
    });

});

describe('Tech Lab: die Herkunft wird beim Einsammeln festgehalten', () => {

    /* Die drei Stellen, an denen Tech Lab Eintraege baut, muessen ihre
       Herkunft mitgeben — sonst rechnet der Renderer mit nichts und
       faellt still auf "unbelegt" zurueck, obwohl eine Paarung
       dahintersteht. */
    /* Nachgezogen am 07.09.2026: eine Zusicherung, die nur "irgendwo
       in dieser Funktion steht beleg" prueft, ueberlebt das Streichen
       EINER von zwei Fundstellen. Geprueft wird deshalb JEDER
       Eintrag, den Tech Lab in `byCard` legt — das sind die drei
       Stellen, an denen eine Kachel entsteht. */
    function eintraege(quelle) {
        const raus = [];
        let i = 0;
        while ((i = quelle.indexOf('byCard.set(', i)) >= 0) {
            let tiefe = 0, ende = -1;
            for (let j = quelle.indexOf('(', i); j < quelle.length; j++) {
                if (quelle[j] === '(') tiefe++;
                else if (quelle[j] === ')') { tiefe--; if (tiefe === 0) { ende = j; break; } }
            }
            assert.ok(ende > 0, 'unbalancierte Klammern an byCard.set');
            raus.push(quelle.slice(i, ende + 1));
            i = ende;
        }
        return raus;
    }

    it('JEDER Eintrag, den Tech Lab anlegt, traegt seine Herkunft', () => {
        const alle = eintraege(LAB).filter(e => e.includes('narrative'));
        assert.ok(alle.length >= 3,
            `es gibt drei Stellen, an denen eine Kachel entsteht — gefunden: ${alle.length}`);
        alle.forEach((e, i) => {
            assert.ok(/beleg:\s*'paarung'/.test(e),
                `Eintrag ${i + 1} ohne Herkunft — die Kachel faellt still auf `
                + `"unbelegt" zurueck, obwohl eine Paarung dahintersteht:\n${e.slice(0, 300)}`);
        });
    });

    it('selbst eingetragene Karten bekommen beleg: nutzer', () => {
        const f = funktion(LAB, '    function _applyOverridesToTechs(engineTechs, directionOverrides) {');
        assert.ok(/beleg:\s*'nutzer'/.test(f),
            'wer selbst etwas eintraegt, soll das an der Kachel wiederfinden');
    });

    it('der Stand der Regelbasis wird gelesen, bevor er hingeschrieben wird', () => {
        assert.ok(LAB.includes('_ensureRegelstand()'),
            'sonst stuende "Datum unbekannt" ueber Zeilen, deren Datum in der Datei steht');
    });

});

describe('Tech Lab: der Stand der Regelbasis kommt aus der Datei', () => {

    function ladeStandHelfer(antwort) {
        const code = [
            "const BELEG_QUELLE = 'data/card_capability_interactions.json';",
            'let _regelstand = null;',
            funktion(LAB, '    function _ensureRegelstand() {'),
            'return _ensureRegelstand;'
        ].join('\n');
        const gerufen = [];
        const fetchStub = (pfad) => {
            gerufen.push(pfad);
            return Promise.resolve({ ok: antwort !== null, json: () => Promise.resolve(antwort) });
        };
        return { f: new Function('fetch', code)(fetchStub), gerufen };
    }

    it('uebernimmt Version, Datum und Zahl der Paarungen aus der Datei', async () => {
        const { f, gerufen } = ladeStandHelfer({
            version: '0.1', generated_at: '2026-05-15', interactions: [1, 2, 3, 4, 5]
        });
        assert.deepStrictEqual(await f(), { version: '0.1', datum: '2026-05-15', paarungen: 5 });
        assert.deepStrictEqual(gerufen, ['./data/card_capability_interactions.json']);
    });

    it('erfindet nichts, wenn die Datei nicht gelesen werden kann', async () => {
        const { f } = ladeStandHelfer(null);
        assert.deepStrictEqual(await f(), { version: null, datum: null, paarungen: 0 });
    });

});

// ─────────────────────────────────────────────────────────────────────
// 2. "Erkannte Tech-Interaktionen" (js/app-current-meta-analysis.js)
// ─────────────────────────────────────────────────────────────────────

/* Zeichnet den ECHTEN Abschnitt. Der Container protokolliert nur. */
function maleInteraktionen(daten, archetyp, matchupZeilen, stand) {
    const geschrieben = { html: '' };
    const container = {
        set innerHTML(v) { geschrieben.html = v; },
        get innerHTML() { return geschrieben.html; }
    };
    const code = [
        "const UV_BELEG_QUELLE = 'data/card_capability_interactions.json';",
        `let _uvRegelstand = ${JSON.stringify(stand === undefined ? STAND : stand)};`,
        funktion(META, '        function _uvText(key, de) {'),
        funktion(META, '        function _uvBelegDatum(iso) {'),
        funktion(META, '        function _uvPartienByOpponent(archetype) {'),
        funktion(META, '        function _uvBelegSatz(m, partien) {'),
        funktion(META, '        function _uvBelegKlasse(m) {'),
        funktion(META, '        function _renderCapabilityTechSection(capabilityData, archetype) {'),
        'return _renderCapabilityTechSection(capabilityData, archetype);'
    ].join('\n');
    const welt = { currentMetaMatchupData: matchupZeilen };
    new Function('capabilityData', 'archetype', 'document', 'window', 'getLang', 't',
        'escapeHtml', 'stripExSuffix', 'console', code)(
        daten, archetyp,
        { getElementById: () => container },
        welt, () => 'de', (k) => k,
        (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        (n) => String(n).replace(/\s+ex$/i, ''),
        { log: () => {} });
    return geschrieben.html;
}

const MATCHUPS = [
    // Die Zeile des FREMDEN Decks steht zuerst — ein fehlender
    // Deckfilter faellt sonst nicht auf.
    { deck_name: 'Dragapult',      opponent: 'Toucannon', win_rate: '68,73', total_games: '280' },
    { deck_name: 'Mega Excadrill', opponent: 'Toucannon', win_rate: '38,03', total_games: '358' }
];

function daten(matchups) {
    return new Map([['Toucannon', {
        matchups, gegenrichtung: [], winsBonus: 8, winsBonusRaw: 8
    }]]);
}

const REGELZEILE = {
    narrative: 'Crustle ignoriert Pikachu exs KO-Schutz.',
    confidence: 'high',
    interactionTag: 'attack.ignores_effects→ability.ko_prevention'
};

describe('Erkannte Tech-Interaktionen: jede Zeile sagt, worauf sie beruht', () => {

    it('nennt Quelle, Version, Stand und die Partien des Matchups', () => {
        const html = maleInteraktionen(daten([REGELZEILE]), 'Mega Excadrill', MATCHUPS);
        assert.ok(html.includes('uv-tech-beleg'), 'eigenes Element je Zeile');
        assert.ok(html.includes('belegt'), html);
        assert.ok(html.includes('card_capability_interactions.json'), html);
        assert.ok(html.includes('v0.1'), html);
        assert.ok(html.includes('15.05.2026'), html);
        assert.ok(html.includes('358 Partien'),
            `die Stichprobe des Matchups steht daneben: ${html}`);
    });

    it('die Partien eines FREMDEN Decks zaehlen nicht mit', () => {
        const html = maleInteraktionen(daten([REGELZEILE]), 'Mega Excadrill', MATCHUPS);
        assert.ok(!html.includes('280 Partien'),
            'die 280 gehoeren Dragapult und haben hier nichts zu suchen');
    });

    it('die Einordnung steht sichtbar, nicht in einem title-Attribut', () => {
        const html = maleInteraktionen(daten([REGELZEILE]), 'Mega Excadrill', MATCHUPS);
        assert.ok(!html.includes('title='), 'dieser Abschnitt kennt gar kein title-Attribut');
        assert.ok(html.includes('uv-tech-beleg uv-tech-beleg-ja'), html);
    });

    it('eine Zeile ohne benannte Paarung wird NICHT zum Beleg erklaert', () => {
        const ohne = { narrative: 'Irgendwas', confidence: 'low' };
        const html = maleInteraktionen(daten([ohne]), 'Mega Excadrill', MATCHUPS);
        assert.ok(html.includes('unbelegt'), html);
        assert.ok(html.includes('aus dem Kartentext abgeleitet, nicht an Partien gemessen'), html);
        assert.ok(html.includes('uv-tech-beleg-nein'), html);
    });

    it('ohne Partienzahl steht das da und keine Null', () => {
        const html = maleInteraktionen(daten([REGELZEILE]), 'Mega Excadrill', []);
        assert.ok(html.includes('nicht bekannt'), html);
        assert.ok(!html.includes('0 Partien'), `keine Null als Angabe: ${html}`);
    });

    it('ueber der Liste stehen Quelle, Version, Stand und die Abdeckung', () => {
        const html = maleInteraktionen(daten([REGELZEILE]), 'Mega Excadrill', MATCHUPS);
        assert.ok(html.includes('uv-tech-beleg-kopf'), html);
        assert.ok(html.includes('5 Paarungen'), html);
    });

    it('ohne gelesene Regelbasis steht "Datum unbekannt"', () => {
        const html = maleInteraktionen(daten([REGELZEILE]), 'Mega Excadrill', MATCHUPS,
            { version: null, datum: null, paarungen: 0 });
        assert.ok(html.includes('Datum unbekannt'), html);
        assert.ok(!/\d{2}\.\d{2}\.\d{4}/.test(html), `kein erfundenes Datum: ${html}`);
    });

    it('ein leerer Datensatz bleibt leer — kein Kopf ohne Liste', () => {
        assert.strictEqual(maleInteraktionen(new Map(), 'Mega Excadrill', MATCHUPS), '');
    });

    it('ein Gegnername mit HTML wird maskiert', () => {
        const d = new Map([['<b>Toucannon</b>', {
            matchups: [REGELZEILE], gegenrichtung: [], winsBonus: 8
        }]]);
        const html = maleInteraktionen(d, 'Mega Excadrill', MATCHUPS);
        assert.ok(html.includes('&lt;b&gt;Toucannon&lt;/b&gt;'), html);
        assert.ok(!html.includes('<b>Toucannon</b>'), 'ein Deckname darf kein Markup werden');
    });

});

// ─────────────────────────────────────────────────────────────────────
// 3. js/i18n.js — die Schluessel gibt es in BEIDEN Sprachen
// ─────────────────────────────────────────────────────────────────────

describe('i18n: kein deutscher Rueckfall in englischer Oberflaeche', () => {

    /* BEFUND DER ABNAHME (07.09.2026): keiner der neuen Schluessel
       existierte. In englischer Oberflaeche standen die deutschen
       Rueckfaelle ("belegt", "unbelegt", "Stand"). Die Woerterbuecher
       werden hier aus dem Quelltext ausgewertet — ohne DOM, ohne
       localStorage. */
    const woerterbuch = (() => {
        const a = I18N.indexOf('const translations = {');
        assert.ok(a >= 0, 'translations nicht gefunden');
        const b = I18N.indexOf('\n};', a);
        assert.ok(b > a, 'Ende von translations nicht gefunden');
        // eslint-disable-next-line no-eval
        return eval('(' + I18N.slice(a + 'const translations = '.length, b + 2) + ')');
    })();

    const NEUE = [
        'antiTech.belegJa', 'antiTech.belegNein', 'antiTech.belegHeuristik',
        'antiTech.belegStand', 'antiTech.belegDatumUnbekannt', 'antiTech.belegPartien',
        'antiTech.belegOhnePartien', 'antiTech.belegKopf', 'antiTech.belegKeineDaten',
        'antiTech.belegKeineDatenSatz',
        'antiTech.belegOhneAntwort', 'antiTech.belegOhneAntwortSatz',
        'techLab.belegJa', 'techLab.belegNein', 'techLab.belegHeuristik',
        'techLab.belegNutzer', 'techLab.belegNutzerSatz', 'techLab.belegStand',
        'techLab.belegDatumUnbekannt', 'techLab.belegOhnePartien', 'techLab.belegKopf',
        'buildInfo.belegJa', 'buildInfo.belegNein', 'buildInfo.belegHeuristik',
        'buildInfo.belegNutzer', 'buildInfo.belegNutzerSatz', 'buildInfo.belegStand',
        'buildInfo.belegPartien', 'buildInfo.belegOhnePartien', 'buildInfo.belegKeine'
    ];

    it('jeder verwendete Beleg-Schluessel steht in beiden Woerterbuechern', () => {
        const fehlen = NEUE.filter(k => !(k in woerterbuch.en) || !(k in woerterbuch.de));
        assert.deepStrictEqual(fehlen, [],
            'ein fehlender Schluessel faellt auf den deutschen Rueckfall im Quelltext '
            + 'zurueck — in englischer Oberflaeche steht dann Deutsch');
    });

    it('die englischen Fassungen sind nicht die deutschen', () => {
        const gleich = NEUE.filter(k => woerterbuch.en[k] === woerterbuch.de[k]);
        assert.deepStrictEqual(gleich, [],
            'ein unuebersetzter Eintrag ist derselbe Fehler mit mehr Aufwand');
    });

    it('die deutschen Fassungen stimmen mit den Rueckfaellen im Quelltext ueberein', () => {
        /* Sonst springt der Wortlaut, sobald das Woerterbuch geladen
           ist — und Tests, die ohne `t` messen, pruefen etwas anderes
           als die Oberflaeche zeigt. */
        assert.strictEqual(woerterbuch.de['antiTech.belegJa'], 'belegt');
        assert.strictEqual(woerterbuch.de['antiTech.belegNein'], 'unbelegt');
        assert.strictEqual(woerterbuch.de['antiTech.belegHeuristik'],
            'aus dem Kartentext abgeleitet, nicht an Partien gemessen');
        assert.strictEqual(woerterbuch.de['antiTech.belegPartien'], 'Matchup aus {n} Partien');
        assert.strictEqual(woerterbuch.de['antiTech.belegOhnePartien'],
            'Partienzahl des Matchups nicht bekannt');
        assert.strictEqual(woerterbuch.de['antiTech.belegKeineDaten'], 'keine Daten');
        assert.strictEqual(woerterbuch.de['antiTech.belegOhneAntwort'], 'keine bekannte Antwort');
        assert.strictEqual(woerterbuch.de['buildInfo.belegKeine'], 'keine Daten');
        assert.strictEqual(woerterbuch.de['techLab.belegNutzer'], 'vom Nutzer eingetragen');
        assert.strictEqual(woerterbuch.de['techLab.belegOhnePartien'],
            'keine Partien dahinter — hier stehen Kartentexte gegeneinander, keine Deckpaarungen');
    });

    it('die Platzhalter ueberleben die Uebersetzung', () => {
        [['antiTech.belegPartien', ['{n}']],
         ['buildInfo.belegPartien', ['{n}']],
         ['antiTech.belegKopf', ['{datei}', '{version}', '{datum}', '{n}']],
         ['techLab.belegKopf', ['{datei}', '{version}', '{datum}', '{n}']],
         ['antiTech.belegKeineDatenSatz', ['{liste}']],
         ['antiTech.belegOhneAntwortSatz', ['{liste}']]
        ].forEach(([k, platz]) => {
            platz.forEach(p => {
                assert.ok(woerterbuch.en[k].includes(p), `${k} (en) braucht ${p}`);
                assert.ok(woerterbuch.de[k].includes(p), `${k} (de) braucht ${p}`);
            });
        });
    });

    it('beide Woerterbuecher decken sich vollstaendig', () => {
        const en = Object.keys(woerterbuch.en);
        const de = Object.keys(woerterbuch.de);
        assert.deepStrictEqual(en.filter(k => !(k in woerterbuch.de)), [], 'nur in en');
        assert.deepStrictEqual(de.filter(k => !(k in woerterbuch.en)), [], 'nur in de');
    });

});
