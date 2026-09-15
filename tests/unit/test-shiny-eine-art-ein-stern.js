/**
 * "sobald ich eine Form markiere soll das automatisch fuer alle gelten, da
 *  es ja das gleiche Pokemon ist und sich nur durch ein Item entwickelt"
 *                              — der Betreiber am 15.09.2026
 *
 * Der Stern beantwortet "habe ich das Vieh". Eine Mega-Form faengt man
 * nicht, man entwickelt sie aus der Art, die man schon hat — also gibt es
 * je Art genau eine Antwort, und Tandrak und Tandrak (Mega) teilen sich
 * einen Schluessel.
 *
 * Eine Regionalform teilt ihn NICHT: Alola-Vulnona ist kein Vulnona mit
 * Item, sondern ein eigenes Vieh, das man eigens besorgen muss. Und weil
 * die drei Paldea-Tauros sich Nummer UND Form-Kennung teilen ("128" +
 * "Regional"), steht bei Regionalformen der NAME im Schluessel.
 *
 * Diese Datei prueft VERHALTEN, nicht Schreibweise: das Modul laeuft in
 * einem vm-Kontext mit nachgebautem localStorage. Eine Textzusicherung
 * haette die Umstellung nicht gehalten — sie haette nur belegt, dass
 * irgendwo "Base" im Quelltext steht.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SHINY_QUELLE = lies('js/champions-shiny.js');
const POKEDEX_QUELLE = lies('js/app-side-quest-pokedex.js');
const DEX = JSON.parse(lies('data/champions_pokedex.json'));

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const POKEDEX = ohneKommentare(POKEDEX_QUELLE);

/** Das Modul frisch laden, mit einem vorgegebenen localStorage-Inhalt. */
function lade(vorrat) {
    const speicher = new Map();
    if (vorrat) speicher.set('championsShinyV1', JSON.stringify(vorrat));
    const ereignisse = [];
    const sandkasten = {
        console,
        JSON,
        Set,
        Number,
        String,
        Array,
        Promise,
        localStorage: {
            getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
            setItem: (k, v) => speicher.set(k, String(v)),
        },
        document: {
            dispatchEvent: (ev) => { ereignisse.push(ev); return true; },
        },
        CustomEvent: function (typ, init) { this.type = typ; this.detail = init && init.detail; },
    };
    sandkasten.window = sandkasten;
    vm.createContext(sandkasten);
    vm.runInContext(SHINY_QUELLE, sandkasten, { filename: 'champions-shiny.js' });
    return {
        CS: sandkasten.window.ChampionsShiny,
        ereignisse,
        gespeichert: () => JSON.parse(speicher.get('championsShinyV1') || '[]'),
    };
}

/* Echte Eintraege aus dem Pokedex — nichts erfunden. */
const eintrag = (en) => DEX.entries.find(e => e.en === en);
/* Aus dem vm-Kontext kommt ein Array MIT EIGENEM Prototyp; deepStrictEqual
 * vergleicht den mit und faellt sonst auf "same structure but not
 * reference-equal" um. Deshalb wird jede Liste hier in die eigene Welt
 * kopiert, bevor sie verglichen wird. */
const her = (x) => Array.from(x);
const mitForm = (form) => DEX.entries.filter(e => (e.form || 'Base') === form);

describe('Eine Art, ein Stern', () => {

    it('der Pokedex traegt ueberhaupt Mega-Formen mit Grundform', () => {
        // Gegenprobe zur Datenlage: ohne ein solches Paar prueft der Test
        // darunter nichts, und dann gehoert er weg statt gruen zu bleiben.
        const megas = mitForm('Mega');
        assert.ok(megas.length > 50, `nur ${megas.length} Mega-Eintraege — Datenlage pruefen`);
        const paare = megas.filter(m =>
            DEX.entries.some(b => b.dex === m.dex && (b.form || 'Base') === 'Base'));
        assert.ok(paare.length > 50,
            `nur ${paare.length} Mega-Formen haben ihre Grundform im Pokedex`);
    });

    it('Mega-Form und Grundform ergeben denselben Schluessel', () => {
        const { CS } = lade();
        const mega = eintrag('Mega Dragalge');
        const basis = eintrag('Dragalge');
        assert.ok(mega && basis, 'Tandrak/Mega-Tandrak fehlen im Pokedex');
        assert.strictEqual(CS.schluessel(mega), CS.schluessel(basis),
            'Mega und Grundform sind dasselbe Vieh und brauchen denselben Schluessel');
    });

    it('ein Stern auf der Mega-Form setzt auch die Grundform', () => {
        const { CS } = lade();
        const mega = eintrag('Mega Dragalge');
        const basis = eintrag('Dragalge');
        assert.strictEqual(CS.hat(basis), false, 'Ausgangslage: kein Stern');
        CS.umschalten(mega);
        assert.strictEqual(CS.hat(basis), true,
            'wer Mega-Tandrak besitzt, besitzt Tandrak');
        CS.umschalten(basis);
        assert.strictEqual(CS.hat(mega), false, 'und das Abwaehlen gilt genauso fuer beide');
    });

    it('Mega X und Mega Y fallen mit derselben Grundform zusammen', () => {
        const { CS } = lade();
        const x = eintrag('Mega Charizard X');
        const y = eintrag('Mega Charizard Y');
        const basis = eintrag('Charizard');
        assert.ok(x && y && basis, 'Glurak-Eintraege fehlen im Pokedex');
        assert.strictEqual(CS.schluessel(x), CS.schluessel(basis));
        assert.strictEqual(CS.schluessel(y), CS.schluessel(basis));
    });

    it('eine Regionalform bleibt ein eigenes Vieh', () => {
        const { CS } = lade();
        const regional = mitForm('Regional');
        assert.ok(regional.length > 5, `nur ${regional.length} Regionalformen — Datenlage pruefen`);
        let geprueft = 0;
        regional.forEach(r => {
            const basis = DEX.entries.find(e => e.dex === r.dex && (e.form || 'Base') === 'Base');
            if (!basis) return;
            geprueft++;
            assert.notStrictEqual(CS.schluessel(r), CS.schluessel(basis),
                `${r.en} und ${basis.en} duerfen sich keinen Stern teilen — `
                + 'eine Regionalform muss man eigens besorgen');
        });
        assert.ok(geprueft > 0, 'keine Regionalform hat eine Grundform im Pokedex — Test wirkungslos');
    });

    it('eine Geschlechtsform bekommt einen eigenen Stern', () => {
        /* Bestellt am 15.09.2026: "bei Salmagnis müssen wir einen
           unterschied zwischen männlich und weiblich machen."

           Ein weibliches Salmagnis entsteht nicht aus einem maennlichen
           — anders als eine Mega-Form. Es hat eigene Basiswerte und eine
           eigene Nutzungszeile; wer beide will, muss beide besorgen. */
        const { CS } = lade();
        const paare = DEX.entries.filter(e => (e.form || 'Base') === 'Geschlecht');
        assert.ok(paare.length >= 3,
            `nur ${paare.length} Geschlechtsformen im Pokedex — Datenlage pruefen`);
        let geprueft = 0;
        paare.forEach(w => {
            const basis = DEX.entries.find(e => e.dex === w.dex && (e.form || 'Base') === 'Base');
            if (!basis) return;
            geprueft++;
            assert.notStrictEqual(CS.schluessel(w), CS.schluessel(basis),
                `${w.en} und ${basis.en} duerfen sich keinen Stern teilen`);
        });
        assert.ok(geprueft >= 3, 'keine Geschlechtsform hat eine Grundform — Test wirkungslos');
    });

    it('eine Geschlechtsform faellt auch NICHT mit der Mega-Form zusammen', () => {
        // Psiaugon hat beides: eine Mega-Form (faellt mit der Grundform
        // zusammen) und eine weibliche Form (faellt NICHT zusammen).
        // Genau hier trennen sich die beiden Regeln.
        const { CS } = lade();
        const basis = eintrag('Meowstic');
        const mega = eintrag('Mega Meowstic');
        const weiblich = eintrag('Meowstic (F)');
        assert.ok(basis && mega && weiblich, 'Psiaugon-Eintraege fehlen im Pokedex');
        assert.strictEqual(CS.schluessel(mega), CS.schluessel(basis));
        assert.notStrictEqual(CS.schluessel(weiblich), CS.schluessel(basis));
    });

    it('die drei Paldea-Tauros bekommen drei verschiedene Schluessel', () => {
        const { CS } = lade();
        const tauros = DEX.entries.filter(e => e.dex === 128 && (e.form || 'Base') === 'Regional');
        assert.strictEqual(tauros.length, 3,
            'die Datenlage hat sich geaendert: 128 traegt nicht mehr drei Regionalformen');
        const schluessel = new Set(tauros.map(e => CS.schluessel(e)));
        assert.strictEqual(schluessel.size, 3,
            'Nummer UND Form-Kennung sind bei den drei Tauros gleich — ohne den '
            + 'Namen im Schluessel waeren sie ein einziger Stern');
    });

    it('kein Schluessel wird doppelt vergeben, ausser fuer dieselbe Art', () => {
        const { CS } = lade();
        const nachSchluessel = new Map();
        DEX.entries.forEach(e => {
            const k = CS.schluessel(e);
            if (!nachSchluessel.has(k)) nachSchluessel.set(k, []);
            nachSchluessel.get(k).push(e);
        });
        nachSchluessel.forEach((liste, k) => {
            const nummern = new Set(liste.map(e => String(e.dex)));
            assert.strictEqual(nummern.size, 1,
                `Schluessel ${k} deckt mehrere Pokedex-Nummern: ${[...nummern].join(', ')}`);
            const eigene = liste.filter(e => ['Regional', 'Geschlecht'].indexOf(e.form || 'Base') !== -1);
            assert.ok(eigene.length <= 1,
                `Schluessel ${k} deckt mehrere eigenstaendige Formen: `
                + eigene.map(e => e.en).join(', '));
        });
    });
});

describe('Alte Sterne gehen nicht verloren', () => {

    it('"<dex>|Mega" wird beim Lesen zu "<dex>|Base"', () => {
        const { CS, gespeichert } = lade(['6|Mega', '38|Base']);
        assert.deepStrictEqual(her(CS.alle()).sort(), ['38|Base', '6|Base'].sort(),
            'der alte Mega-Schluessel muss auf die Grundform umgeschrieben werden');
        assert.deepStrictEqual(her(gespeichert()).sort(), ['38|Base', '6|Base'].sort(),
            'und das Umschreiben muss im Speicher landen, nicht nur im Arbeitsspeicher');
    });

    it('ein Stern verschwindet dabei nicht', () => {
        const { CS } = lade(['6|Mega']);
        assert.strictEqual(CS.hat(eintrag('Charizard')), true);
        assert.strictEqual(CS.hat(eintrag('Mega Charizard X')), true);
    });

    it('"<dex>|Regional" bleibt stehen, solange der Pokedex fehlt', () => {
        const { CS } = lade(['128|Regional']);
        assert.deepStrictEqual(her(CS.alle()), ['128|Regional'],
            'welche Regionalform gemeint war, steht im alten Schluessel nicht — '
            + 'raten waere schlimmer als warten');
    });

    it('aufloesen() zieht "128|Regional" auf alle drei Tauros nach', () => {
        const { CS } = lade(['128|Regional']);
        const geaendert = CS.aufloesen(DEX.entries);
        assert.strictEqual(geaendert, true, 'aufloesen() meldet keine Aenderung');
        const tauros = DEX.entries.filter(e => e.dex === 128 && (e.form || 'Base') === 'Regional');
        tauros.forEach(e => assert.strictEqual(CS.hat(e), true,
            `${e.en} war vorher markiert (alle drei teilten sich den Schluessel) `
            + 'und muss es bleiben'));
        assert.ok(!her(CS.alle()).includes('128|Regional'), 'der alte Schluessel steht noch da');
    });

    it('aufloesen() ohne passenden Eintrag laesst den Stern in Ruhe', () => {
        const { CS } = lade(['9999|Regional']);
        assert.strictEqual(CS.aufloesen(DEX.entries), false);
        assert.deepStrictEqual(her(CS.alle()), ['9999|Regional'],
            'ohne Treffer darf der Stern nicht verschwinden — er ist eine Aussage '
            + 'ueber die Wirklichkeit, kein Zwischenstand');
    });

    it('aufloesen() ist ohne alte Schluessel ein Nichtstun', () => {
        const { CS } = lade(['6|Base']);
        assert.strictEqual(CS.aufloesen(DEX.entries), false);
        assert.deepStrictEqual(her(CS.alle()), ['6|Base']);
    });
});

describe('Der Sternknopf traegt den fertigen Schluessel', () => {

    it('umschaltenSchluessel() schaltet ueber die Zeichenkette', () => {
        const { CS, ereignisse } = lade();
        const tauros = DEX.entries.filter(e => e.dex === 128 && (e.form || 'Base') === 'Regional');
        const k = CS.schluessel(tauros[0]);
        assert.strictEqual(CS.umschaltenSchluessel(k), true);
        assert.strictEqual(CS.hat(tauros[0]), true);
        assert.strictEqual(CS.hat(tauros[1]), false,
            'ein Klick auf einen Tauros darf die anderen beiden nicht mitnehmen');
        assert.ok(ereignisse.length >= 1 && ereignisse[0].type === 'championsShinyChanged',
            'ohne Ereignis ziehen die Zahlen neben den Filtern nicht nach');
        assert.strictEqual(ereignisse[0].detail.schluessel, k);
    });

    it('der Knopf bekommt den gerechneten Schluessel ins Attribut', () => {
        assert.match(POKEDEX, /data-sqp-stern="\$\{escapeHtml\(\(window\.ChampionsShiny\s*\n?\s*&& window\.ChampionsShiny\.schluessel\(e\)\)/,
            'der Schluessel muss am Knopf stehen — aus dex und form laesst er sich '
            + 'fuer eine Regionalform nicht zurueckrechnen');
    });

    it('der Klick baut den Schluessel NICHT aus Bruchstuecken neu', () => {
        const block = POKEDEX.match(/host\.querySelectorAll\('\.sqp-stern'\)[\s\S]*?\n        \}\);/);
        assert.ok(block, 'der Klickblock des Sterns wurde nicht gefunden');
        assert.match(block[0], /umschaltenSchluessel\(k\)/,
            'der Klick muss ueber den fertigen Schluessel gehen');
        assert.ok(!/ChampionsShiny\.umschalten\(/.test(block[0]),
            'umschalten(e) rechnet den Schluessel neu — hier ist er schon da');
        assert.ok(!/getAttribute\('data-sqp-form'\)/.test(block[0]),
            'aus dex und form zusammengesetzt ergibt eine Regionalform "<dex>|R:" ohne Namen');
    });

    it('alle Kacheln mit demselben Schluessel springen mit um', () => {
        const block = POKEDEX.match(/host\.querySelectorAll\('\.sqp-stern'\)[\s\S]*?\n        \}\);/);
        assert.match(block[0], /querySelectorAll\('\.sqp-stern'\)\.forEach\(b =>/,
            'nach dem Umschalten muessen ALLE Sterne mit diesem Schluessel nachziehen — '
            + 'sonst behauptet die Nachbarkachel das Gegenteil');
        assert.match(block[0], /b\.getAttribute\('data-sqp-stern'\) !== k/,
            'und zwar genau die mit demselben Schluessel, nicht alle');
    });

    it('der Pokedex loest die alten Regional-Schluessel auf, sobald er geladen ist', () => {
        assert.match(POKEDEX, /ChampionsShiny\.aufloesen\(_entries\)/,
            'ohne diesen Aufruf bleiben alte "<dex>|Regional" fuer immer stehen');
    });
});

describe('Die beiden Zahlen neben den Filtern ergaenzen sich', () => {

    it('beide zaehlen EINTRAEGE, nicht Marken', () => {
        assert.match(POKEDEX, /\?\s*_entries\.filter\(e => window\.ChampionsShiny\.hat\(e\)\)\.length/,
            '"meine" muss Eintraege zaehlen — anzahl() zaehlt Marken, und eine Marke '
            + 'deckt seit dem 15.09.2026 mehrere Eintraege');
        assert.match(POKEDEX, /\?\s*_entries\.filter\(e => !window\.ChampionsShiny\.hat\(e\)\)\.length/,
            '"noch offen" muss dieselbe Grundmenge zaehlen');
        assert.ok(!/anzahl\(\)\s*\)?\s*:\s*0/.test(POKEDEX),
            'anzahl() darf nicht mehr als Filterzahl dienen');
    });

    it('gemessen am echten Pokedex ergeben beide zusammen die Gesamtzahl', () => {
        const { CS } = lade();
        CS.umschalten(eintrag('Mega Dragalge'));      // deckt zwei Eintraege
        CS.umschalten(eintrag('Mega Charizard X'));   // deckt drei
        const meine = DEX.entries.filter(e => CS.hat(e)).length;
        const offen = DEX.entries.filter(e => !CS.hat(e)).length;
        assert.strictEqual(meine + offen, DEX.entries.length,
            'die beiden Zahlen muessen die Gesamtzahl ergeben');
        assert.strictEqual(CS.anzahl(), 2, 'zwei Marken');
        assert.ok(meine > CS.anzahl(),
            'genau darum geht es: zwei Marken decken mehr als zwei Eintraege — '
            + `gemessen ${meine}`);
    });
});

describe('Gegenprobe zum Ausschneiden der Kommentare', () => {
    it('es bleibt genug Quelltext uebrig, um etwas zu pruefen', () => {
        assert.ok(POKEDEX.length > POKEDEX_QUELLE.length * 0.3,
            'das Ausschneiden hat zu viel entfernt');
    });
});
