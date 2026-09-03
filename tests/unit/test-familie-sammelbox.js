'use strict';
/*
 * Alle Varianten eines Hauptpokemon in einer Box.
 *
 * ANLASS (03.09.2026). Betreiber: "In meinem Beispiel habe ich gerade
 * Dragapult in die Suche eingegeben und muss mich dann ja jetzt für ein
 * Archetype entscheiden. Aber ich würde mich auch gerne alle Karten
 * anzeigen lassen wo Dragapult das Hauptpokemon war. Das dient dazu
 * wirklich alle Karten in eine Box zu packen wo man dann schnell alle Deck
 * Varianten zu egal welchen Dragapult Deck schnell nachbauen kann."
 *
 * WIE DAS HAUPTPOKEMON BESTIMMT WIRD
 *
 * Limitless benennt einen Archetyp nach seinen Pokemon, das wichtigste
 * zuerst. Der Kopf einer Familie ist deshalb der LAENGSTE Archetypname,
 * der Praefix eines anderen ist: "Dragapult" fuer die zehn
 * Dragapult-Decks.
 *
 * NICHT das erste Wort — es gibt zweiteilige Namen ("Iron Thorns",
 * "Roaring Moon", "N's Zoroark", "Mega Excadrill"). Das erste Wort waere
 * dort "Iron", "Roaring", "N's", "Mega", und es entstuenden Familien, die
 * es nicht gibt. Gemessen am 03.09.2026 ueber alle Formate: 16 Familien,
 * darunter korrekt "Iron Thorns" (2 Varianten) und "Roaring Moon" (3).
 *
 * NACHGEPRUEFT gegen data/archetype_icons.json, das je Archetyp die
 * Pokemon in Reihenfolge fuehrt: fuer alle 97 Archetypen, die dort stehen,
 * nennt die Praefixregel dasselbe Hauptpokemon wie das erste Icon. 97
 * Treffer, 0 Abweichungen. Die Icon-Datei deckt nur die Haelfte der 197
 * Past-Meta-Archetypen ab (sie pflegt das aktuelle Meta) — deshalb ist sie
 * hier die PROBE und nicht die Quelle.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const PM = lies(path.join('js', 'app-past-meta.js'));
const I18N = lies(path.join('js', 'i18n.js'));
const CSS = lies(path.join('css', 'styles.css'));
const HTML = lies('index.html');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '');
const PMK = ohneKomm(PM);

/* Die echte Funktion aus dem Modul holen, nicht nachbauen. Eine Kopie
   waere gruen, waehrend die ausgelieferte Fassung kaputt ist — genau der
   Fehler, den tests/unit/test-matchup-major-spalte.js am 03.09.2026
   abgelegt hat. */
function holFamilienKopf() {
    const m = PM.match(/function familienKopf\(name, alleNamen\) \{[\s\S]*?\n {8}\}/);
    assert.ok(m, 'familienKopf ist aus app-past-meta.js verschwunden');
    // eslint-disable-next-line no-new-func
    return new Function(m[0] + '\nreturn familienKopf;')();
}

describe('der Familienkopf ist das Hauptpokemon', () => {
    const familienKopf = holFamilienKopf();

    it('erkennt die Varianten eines einfachen Namens', () => {
        const namen = ['Dragapult', 'Dragapult Dusknoir', 'Dragapult LZ Box', 'Charizard'];
        assert.strictEqual(familienKopf('Dragapult Dusknoir', namen), 'Dragapult');
        assert.strictEqual(familienKopf('Dragapult LZ Box', namen), 'Dragapult');
        assert.strictEqual(familienKopf('Dragapult', namen), 'Dragapult');
        assert.strictEqual(familienKopf('Charizard', namen), 'Charizard');
    });

    it('nimmt bei zweiteiligen Namen den LAENGEREN Kopf', () => {
        /* Der Grund, warum es nicht das erste Wort sein darf. Gaebe es
           beide, muesste "Iron Thorns Dragapult" zu "Iron Thorns"
           gehoeren und nicht zu einem erfundenen "Iron". */
        const namen = ['Iron Thorns', 'Iron Thorns Dragapult', 'Iron Hands'];
        assert.strictEqual(familienKopf('Iron Thorns Dragapult', namen), 'Iron Thorns');
        assert.strictEqual(familienKopf('Iron Hands', namen), 'Iron Hands');
    });

    it('erfindet keine Familie, wenn der Kopf nicht allein vorkommt', () => {
        /* Lieber keine Sammelauswahl als eine falsche: gibt es kein reines
           "Iron Thorns", liefert die Regel den Namen selbst zurueck, die
           Familie hat ein Mitglied und wird gar nicht angeboten. */
        const namen = ['Iron Thorns Dragapult', 'Charizard'];
        assert.strictEqual(familienKopf('Iron Thorns Dragapult', namen),
            'Iron Thorns Dragapult');
    });

    it('verwechselt keine Namen, die nur zufaellig aehnlich anfangen', () => {
        // "Dragapult" ist kein Praefix von "Dragapultx" im Sinne der
        // Regel — es fehlt das trennende Leerzeichen.
        const namen = ['Dragapult', 'Dragapultx Something'];
        assert.strictEqual(familienKopf('Dragapultx Something', namen),
            'Dragapultx Something');
    });
});

describe('die Praefixregel stimmt mit den gepflegten Icons ueberein', () => {
    const familienKopf = holFamilienKopf();

    it('dieselbe Art wie das erste Icon — ueber alle Archetypen', () => {
        /* DIE EIGENTLICHE PROBE. data/archetype_icons.json fuehrt je
           Archetyp die Pokemon in der Reihenfolge, in der Limitless sie
           nennt — das erste ist das Hauptpokemon. Wo beide Quellen etwas
           sagen, muessen sie dieselbe ART nennen.

           VERGLICHEN WIRD DIE ART, NICHT DAS BILD. Die Icon-Datei
           unterscheidet Formen: "Palafin" traegt `palafin`, "Palafin
           Dudunsparce" traegt `palafin-hero`. Das ist dasselbe Pokemon in
           zwei Gestalten, und beide gehoeren in dieselbe Box — wer nach
           Palafin sucht, will beide Decks. Vier von 542 Eintraegen liegen
           so, alle vier dieses eine Paar.

           Die Form abzuschneiden macht die Probe aber nicht zahnlos:
           "Mega Excadrill" heisst nicht "Excadrill ...", faellt also gar
           nicht unter dieselbe Praefixfamilie. Die Lockerung greift nur
           dort, wo der Name ohnehin schon derselbe ist. Zusaetzlich haelt
           die zweite Zusicherung darunter fest, dass die EXAKTE
           Uebereinstimmung die weit ueberwiegende Regel bleibt. */
        const icons = JSON.parse(lies(path.join('data', 'archetype_icons.json'))).archetypes;
        const namen = Object.keys(icons);
        const art = (slug) => String(slug || '').split('-')[0];
        let geprueft = 0;
        const abweichungen = [];
        for (const n of namen) {
            const kopf = familienKopf(n, namen);
            const kopfIcons = icons[kopf];
            if (!kopfIcons || !kopfIcons.length || !icons[n] || !icons[n].length) continue;
            geprueft++;
            if (art(kopfIcons[0]) !== art(icons[n][0])) {
                abweichungen.push(`${n} -> Kopf ${kopf}: Icon ${icons[n][0]} vs ${kopfIcons[0]}`);
            }
        }
        assert.ok(geprueft >= 400,
            `nur ${geprueft} Archetypen geprueft — die Icon-Datei ist geschrumpft `
            + 'und die Probe belegt nichts mehr');
        assert.deepEqual(abweichungen, [],
            'die Praefixregel nennt eine andere Pokemon-ART als die gepflegten Icons');
    });

    it('und in aller Regel sogar dieselbe Form', () => {
        /* Ohne diese zweite Zusicherung koennte die Lockerung oben eine
           echte Regression verdecken: waeren ploetzlich 200 Eintraege nur
           noch auf Artebene gleich, waere an der Regel etwas faul. */
        const icons = JSON.parse(lies(path.join('data', 'archetype_icons.json'))).archetypes;
        const namen = Object.keys(icons);
        let geprueft = 0, exakt = 0;
        for (const n of namen) {
            const kopfIcons = icons[familienKopf(n, namen)];
            if (!kopfIcons || !kopfIcons.length || !icons[n] || !icons[n].length) continue;
            geprueft++;
            if (kopfIcons[0] === icons[n][0]) exakt++;
        }
        const quote = exakt / geprueft;
        assert.ok(quote > 0.97,
            `nur ${exakt} von ${geprueft} Archetypen (${(quote * 100).toFixed(1)} %) `
            + 'stimmen exakt mit dem Icon des Familienkopfs ueberein — bei mehr als '
            + 'ein paar Formunterschieden stimmt die Regel nicht mehr');
    });
});

describe('die Sammelauswahl steht im Auswahlfeld', () => {

    it('nur wenn die Familie im aktiven Filter mehr als eine Variante hat', () => {
        assert.match(PMK, /if \(meine && meine\.length > 1\)/,
            'die Sammelzeile erscheint wieder auch bei einer einzigen Variante — '
            + 'dann steht "Alle Dragapult-Decks (1 Variante)" neben "Dragapult"');
    });

    it('die Familien werden aus den GEFILTERTEN Archetypen gebildet', () => {
        /* Sonst stuende "10 Varianten" da, wenn das gewaehlte Turnier nur
           zwei davon gesehen hat — eine Zahl, die man nachzaehlen kann und
           die dann nicht stimmt. */
        const i = PMK.indexOf('const alleNamen = archetypes.map');
        assert.ok(i > 0,
            'die Familien werden nicht mehr aus der gefilterten Archetypenliste '
            + 'gebildet');
    });

    it('sie traegt den Familiennamen im Text', () => {
        // Damit die Suche im Auswahlfeld sie mit demselben Wort findet wie
        // die Varianten — der Betreiber tippt "dragapult" und muss die
        // Sammelzeile dabei sehen.
        for (const s of werte('pm.familieOption')) {
            assert.ok(/\{name\}/.test(s),
                `"${s}" nennt den Familiennamen nicht — dann findet die Suche `
                + 'im Auswahlfeld die Sammelzeile nicht');
            assert.ok(/\{v\}/.test(s), `"${s}" nennt die Zahl der Varianten nicht`);
        }
    });

    it('ein Turnier heisst nicht "1 Turniere"', () => {
        assert.match(PMK, /turniere\.size === 1/,
            'die Einzahl ist weg — die Sammelzeile schreibt wieder "1 Turniere"');
        for (const k of ['pm.familieTurnier', 'pm.familieTurniere']) {
            assert.strictEqual(werte(k).length, 2, `${k} fehlt in einer Sprache`);
        }
        for (const s of werte('pm.familieTurnier')) {
            assert.ok(!/\{n\}/.test(s), `"${s}" ist die Einzahl und braucht keine Zahl`);
        }
    });
});

describe('die Auswahl wird auch beim Laden als Familie verstanden', () => {

    it('die Marke wird erkannt und der Name herausgeloest', () => {
        assert.match(PMK, /const FAMILIE_PREFIX = '__familie__\|'/,
            'die Marke fuer eine Sammelauswahl ist weg');
        assert.match(PMK, /startsWith\(FAMILIE_PREFIX\)/,
            'der Lader unterscheidet Sammelauswahl und Einzelarchetyp nicht mehr');
    });

    it('gefiltert wird ueber den Familienkopf, nicht ueber Namensgleichheit', () => {
        const i = PMK.indexOf('const matchingDecks = imFilter.filter');
        assert.ok(i > 0, 'die Deckauswahl im Lader ist umgebaut worden');
        const stelle = PMK.slice(i, i + 320);
        assert.match(stelle, /familienKopf\(/,
            'eine Sammelauswahl filtert wieder auf Namensgleichheit — dann '
            + 'enthaelt die Box nur den Kopf und keine Variante');
        assert.match(stelle, /=== familienName/,
            'der Vergleich gegen den Familiennamen ist weg');
    });

    it('der Kopf wird ueber DIESELBE Menge gebildet wie im Auswahlfeld', () => {
        /* Sonst koennte "Dragapult LZ Box" hier in einer anderen Familie
           landen als eine Zeile weiter oben, und die Box enthielte etwas
           anderes, als die Zeile verspricht. */
        const i = PMK.indexOf('const alleNamen = istFamilie');
        assert.ok(i > 0, 'die Namensmenge fuer den Lader ist weg');
        assert.match(PMK.slice(i, i + 260), /imFilter/,
            'der Lader bildet die Familien nicht mehr aus derselben gefilterten '
            + 'Menge wie das Auswahlfeld');
    });

    it('die Marke landet in keiner Ueberschrift', () => {
        assert.match(PMK, /deck_name: anzeigeName/,
            'das virtuelle Deck traegt wieder die Rohmarke "__familie__|…" '
            + 'statt eines lesbaren Namens');
        assert.match(PMK, /window\.pastMetaCurrentArchetype = anzeigeName/,
            'der Deckbauer bekommt wieder die Rohmarke');
    });
});

describe('was die Zahlen bedeuten, steht dabei', () => {

    it('der Hinweis erscheint nur bei einer Sammelauswahl', () => {
        assert.match(HTML, /id="pastMetaFamilieHinweis"/,
            'die Hinweiszeile fehlt im Markup');
        assert.match(PMK, /famHinweis\.hidden = false/,
            'der Hinweis wird nie eingeblendet');
        assert.match(PMK, /famHinweis\.hidden = true/,
            'der Hinweis bleibt nach der Rueckkehr zu einer Variante stehen');
    });

    it('er sagt, worauf die Prozentzahlen stehen', () => {
        /* OHNE DIESEN SATZ IST DIE ANSICHT IRREFUEHREND. Eine Karte, die
           in einer Variante Pflicht ist und in den anderen fehlt, steht
           ueber zehn Varianten gemittelt bei 10 % — und sieht damit aus
           wie eine Randkarte. */
        for (const s of werte('pm.familieHinweis')) {
            assert.ok(/\{liste\}/.test(s),
                'der Hinweis zaehlt die Varianten nicht auf — dann kann niemand '
                + 'pruefen, was in der Box steckt');
            assert.ok(/ALLER|ALL of these/.test(s),
                'der Hinweis sagt nicht mehr, dass die Anteile auf allen '
                + 'Varianten zusammen stehen: ' + s.slice(0, 80));
            assert.ok(/einzeln|on its own/.test(s),
                'der Hinweis sagt nicht mehr, wie man die einzelne Variante bekommt');
        }
    });

    it('Turnierbilanz und beste Liste sagen, warum sie leer sind', () => {
        /* Beide kennen nur einzelne Archetypen. Den Familienkopf
           einzusetzen waere die bequeme Luege — er ist nur eine der zehn
           Varianten. */
        assert.match(PMK, /if \(istFamilie\) \{[\s\S]{0,600}familieKeineBilanz/,
            'die Turnierbilanz zeigt fuer eine Sammelauswahl wieder die Zahlen '
            + 'einer einzelnen Variante oder verschwindet stillschweigend');
        for (const s of werte('pm.familieKeineBilanz')) {
            assert.ok(/Variante|variant/.test(s),
                'der Satz sagt nicht, was man stattdessen tun kann');
        }
    });

    it('der Hinweis nimmt seine Farbe aus den Tokens', () => {
        const i = CSS.indexOf('.pm-familie-hinweis {');
        assert.ok(i > 0, 'die Regel fuer die Hinweiszeile fehlt');
        const rumpf = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(rumpf, /color:\s*var\(--ink-/,
            'die Hinweiszeile nimmt wieder eine feste Farbe statt eines Tokens — '
            + 'genau so ist am 02.09.2026 ein Kontrast von 3,42:1 entstanden');
        assert.match(rumpf, /background:\s*var\(--/,
            'die Flaeche steht auf einer festen Farbe und kippt im anderen Modus');
    });
});

describe('nebenbei aufgefallen', () => {
    it('die Turnierkachel sagt auf Deutsch nicht "Tournaments"', () => {
        /* Stand bis zum 03.09.2026 so da — ein englisches Wort direkt
           neben dem uebersetzten "Tag-2-Decklisten". Aufgefallen, weil die
           Sammelbox ueber 74 Turniere geht und die Kachel damit zum ersten
           Mal die Mehrzahl zeigte. */
        assert.ok(!/\$\{uniqueTournamentCount\} Tournaments/.test(PMK),
            'die Kachel schreibt wieder "74 Tournaments" in die deutsche '
            + 'Oberflaeche');
        assert.match(PMK, /const turnierWort = dePM \? 'Turniere' : 'tournaments'/,
            'die Uebersetzung des Wortes ist weg');
    });
});

/* Werte eines i18n-Schluessels, beide Sprachen. Gesucht wird nur im WERT —
   der Schluessel selbst bleibt unangetastet. */
function werte(schluessel) {
    const out = [];
    for (const z of I18N.split('\n')) {
        const m = z.match(/^\s*'([a-zA-Z0-9_.]+)':\s*'((?:[^'\\]|\\.)*)'\s*,\s*$/);
        if (m && m[1] === schluessel) out.push(m[2]);
    }
    assert.strictEqual(out.length, 2,
        `${schluessel} steht ${out.length}x in i18n.js, erwartet 2 (de und en)`);
    return out;
}
