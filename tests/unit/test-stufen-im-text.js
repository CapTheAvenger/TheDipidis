/**
 * „Der Angriff steigt stark" — und wie viel ist das?
 *
 * Aus docs/geparkte-features.md, angestrichen am 19.08.2026:
 *
 *   „Statusstufen bei Champions DORT erklaeren, wo 'steigt stark' und
 *    'sinkt drastisch' stehen: +1/+2/+3 sind 150/200/250 %, Maximum
 *    +6 = 400 %; -1/-2/-3 sind 66/50/40 %, Minimum -6 = 25 %."
 *
 * ── WARUM DIESE DATEI SO GRUENDLICH IST ────────────────────────────
 *
 * Der erste Entwurf las die Stufe aus dem DEUTSCHEN Fliesstext ab
 * („stark" = 2, „drastisch" = 3). Die Abnahme am 02.09.2026 hat ihn
 * zerlegt, und die Testschicht dazu ebenfalls — sie belegte fast nichts:
 * das Feature liess sich vollstaendig abklemmen, ohne dass einer von
 * 3510 Tests fiel.
 *
 * Gefunden wurden unter anderem:
 *   · die Marke lief ueber alle 1268 Eintraege, nicht ueber die 494
 *     Attacken; 84 Item- und Faehigkeitstexte trugen eine ungepruefte Zahl
 *   · vier Faehigkeiten trugen die UMKEHRUNG ihrer Aussage
 *     („Hindert Angreifer daran, die Verteidigung zu senken" -> -1)
 *   · aus Multiplikatoren wurden Stufen (Leben-Orb „um 30 %" -> +1)
 *   · Fadenschuss zeigte je nach Sprachschalter -1 oder -2
 *
 * Die Ursache war der Ansatz, nicht ein Fehler: deutscher Fliesstext ist
 * keine verlaessliche Quelle fuer eine Zahl. Die Zahl kommt jetzt aus dem
 * ENGLISCHEN Text, der formelhaft ist („by 2 stages"); der deutsche Text
 * dient nur noch dazu, die Marke zu platzieren.
 *
 * Diese Datei prueft deshalb an den ECHTEN 1268 Eintraegen und ruft
 * mitStufenzahl() wirklich auf, statt im Quelltext nach Zeichenketten zu
 * suchen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-resources.js'), 'utf8');
const STATUS = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-status.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const SRC_C = stripJs(SRC);
const STATUS_C = stripJs(STATUS);
const CSS_C = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

const RES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_resources.json'), 'utf8'));
const ZUST = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_statuszustaende.json'), 'utf8'));
const ALLE = RES.entries;
const MOVES = ALLE.filter(e => e.cat === 'move');

function load(lang, mitTabelle = true) {
    const sandbox = {
        console,
        document: {
            addEventListener() {}, getElementById: () => null,
            querySelectorAll: () => [], createElement: () => ({}),
        },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    if (mitTabelle) sandbox.SideQuestStufen = ZUST.stufen.tabelle;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox);
    // Die Eintragsliste, damit die Pruefung auf fremde Attackennamen
    // arbeiten kann — sie liest dieselbe Liste, die die Seite anzeigt.
    sandbox._sqResIntern.setEntries(ALLE);
    return sandbox._sqResIntern;
}

/** Die Stufe aus dem gerenderten HTML — oder null. */
function markeAus(html) {
    const m = html.match(/data-sq-stufe="(-?\d+)"/);
    return m ? Number(m[1]) : null;
}
/** Wie oft eine Marke im HTML vorkommt. */
function marken(html) { return (html.match(/class="sq-res-stufe"/g) || []).length; }

/** Was die Seite fuer einen Eintrag in einer Sprache wirklich zeigt. */
function gerendert(api, e, de) {
    const txt = de ? (e.de_effect || e.en_effect || '') : (e.en_effect || e.de_effect || '');
    return api.mitStufenzahl(txt, e);
}

describe('Stufen im Text — die Tabelle selbst', () => {
    it('sagt genau das, was angefragt wurde', () => {
        const t = {};
        ZUST.stufen.tabelle.forEach(z => { t[z.stufe] = z; });
        assert.equal(t[1].prozent_de, '150 %');
        assert.equal(t[2].prozent_de, '200 %');
        assert.equal(t[3].prozent_de, '250 %');
        assert.equal(t[6].prozent_de, '400 %');
        assert.equal(t[-2].prozent_de, '50 %');
        assert.equal(t[-3].prozent_de, '40 %');
        assert.equal(t[-6].prozent_de, '25 %');
        assert.equal(t[-1].prozent_de, '66,7 %');
    });

    it('stimmt mit der Formel ueberein', () => {
        ZUST.stufen.tabelle.forEach(z => {
            const s = Number(z.stufe);
            const soll = s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
            const sollTxt = (Math.round(soll * 1000) / 10).toFixed(1)
                .replace(/\.0$/, '').replace('.', ',') + ' %';
            assert.equal(z.prozent_de, sollTxt, `Stufe ${s}`);
        });
    });
});

describe('Stufen im Text — die Zahl kommt aus dem englischen Text', () => {
    it('eine eindeutige Angabe wird gelesen', () => {
        const api = load('en');
        assert.equal(api.stufeAusEnglisch("Raises the user's Speed by 2 stages."), 2);
        assert.equal(api.stufeAusEnglisch("Lowers the target's Attack by 1 stage."), -1);
        assert.equal(api.stufeAusEnglisch("Raises the user's Attack by three stages."), 3);
        assert.equal(api.stufeAusEnglisch("Has a 100% chance to lower the target's Speed by 1 stage."), -1);
    });

    it('zwei Angaben in einem Text ergeben KEINE Zahl', () => {
        const api = load('en');
        // Scharfer Extrakt: erhoeht das eine, senkt das andere. Welche der
        // beiden Zahlen an welchem Wort haengt, ist aus dem Text nicht zu
        // entscheiden — also steht keine da.
        assert.equal(api.stufeAusEnglisch(
            "Raises the target's Attack by 2 stages and lowers its Defense by 2 stages."), null);
    });

    it('ohne Stufenangabe keine Zahl', () => {
        const api = load('en');
        assert.equal(api.stufeAusEnglisch('The user attacks.'), null);
        assert.equal(api.stufeAusEnglisch(''), null);
        assert.equal(api.stufeAusEnglisch(null), null);
        // Multiplikator, keine Stufe.
        assert.equal(api.stufeAusEnglisch('Raises the damage of moves by 30%.'), null);
    });

    it('Genauigkeit, Fluchtwert und Volltrefferquote ergeben keine Zahl', () => {
        const api = load('en');
        // Die Daten sagen das selbst.
        assert.match(ZUST.stufen._meta.gilt_fuer,
            /Angriff, Verteidigung, Spezial-Angriff, Spezial-Verteidigung und Initiative/);
        assert.match(ZUST.stufen._meta.ausnahme_de, /Genauigkeit und Fluchtwert/);
        assert.equal(api.stufeAusEnglisch("Raises the user's evasiveness by 2 stages."), null);
        assert.equal(api.stufeAusEnglisch("Raises the user's chance for a critical hit by 2 stages."), null);
        assert.equal(api.stufeAusEnglisch("Has a 100% chance to lower the target's accuracy by 1 stage."), null);
        // Die Gegenprobe: der normale Fall bleibt.
        assert.equal(api.stufeAusEnglisch("Raises the user's Speed by 2 stages."), 2);
    });
});

describe('Stufen im Text — was gerendert wird', () => {
    const move = (en, de) => ({ cat: 'move', en: 'X', de: 'X', en_effect: en, de_effect: de });

    it('englisch: die Marke sitzt auf der Stufenangabe', () => {
        const api = load('en');
        const html = api.mitStufenzahl("Raises the user's Speed by 2 stages.",
            move("Raises the user's Speed by 2 stages."));
        assert.equal(marken(html), 1);
        assert.equal(markeAus(html), 2);
        assert.match(html, /<a class="sq-res-stufe"[^>]*>by 2 stages<span/,
            'die Zahl steht nicht an der Stufenangabe, sondern anderswo im Satz');
        assert.match(html, /\+2 · 200 %/);
    });

    it('deutsch: die Marke sitzt auf dem Richtungswort, die Zahl kommt aus dem Englischen', () => {
        const api = load('de');
        const e = move("Raises the user's Special Defense by 2 stages.",
                       'Gedächtnisverlust, der die Spezial-Verteidigung stark erhöht.');
        const html = api.mitStufenzahl(e.de_effect, e);
        assert.equal(markeAus(html), 2);
        assert.match(html, /<a class="sq-res-stufe"[^>]*>erhöht<span/);
        assert.match(html, /\+2 · 200 %/);
    });

    it('das Wort "stark" im deutschen Text aendert die Zahl NICHT', () => {
        const api = load('de');
        // Derselbe deutsche Text, zwei verschiedene englische Angaben.
        // Frueher haette „stark" hier zweimal +2 erzwungen.
        const a = api.mitStufenzahl('Erhöht den Angriff stark.',
            move("Raises the user's Attack by 1 stage.", 'Erhöht den Angriff stark.'));
        const b = api.mitStufenzahl('Erhöht den Angriff stark.',
            move("Raises the user's Attack by 3 stages.", 'Erhöht den Angriff stark.'));
        assert.equal(markeAus(a), 1, 'die deutsche Prosa bestimmt wieder die Zahl');
        assert.equal(markeAus(b), 3);
    });

    it('zwei Richtungswoerter im deutschen Text ergeben keine Marke', () => {
        const api = load('de');
        const e = move("Raises the user's Attack by 2 stages.",
                       'Erhöht den Angriff und senkt die Verteidigung.');
        assert.equal(marken(api.mitStufenzahl(e.de_effect, e)), 0,
            'die Zahl haengt an einem von zwei Effekten und niemand weiss, an welchem');
    });

    it('ein Richtungswort mit falschem Vorzeichen bekommt nichts', () => {
        const api = load('de');
        const e = move("Lowers the target's Attack by 1 stage.",
                       'Erhöht irgendetwas.');
        assert.equal(marken(api.mitStufenzahl(e.de_effect, e)), 0);
    });

    it('nur Attacken — Faehigkeiten und Items nie', () => {
        const api = load('en');
        const txt = "Raises the user's Speed by 2 stages.";
        ['ability', 'item', 'field'].forEach(cat => {
            assert.equal(marken(api.mitStufenzahl(txt, { cat, en_effect: txt })), 0,
                `${cat} traegt eine Stufenmarke`);
        });
        assert.equal(marken(api.mitStufenzahl(txt, { cat: 'move', en_effect: txt })), 1);
    });

    it('ohne Eintrag oder ohne Tabelle bleibt der Text — escaped', () => {
        const roh = 'Erhöht den <b>Angriff</b> stark & mehr.';
        const e = { cat: 'move', en_effect: "Raises the user's Attack by 2 stages.", de_effect: roh };
        const ohneTab = load('de', false);
        const h1 = ohneTab.mitStufenzahl(roh, e);
        assert.equal(marken(h1), 0, 'ohne Zahlen wird trotzdem markiert');
        assert.ok(!/<b>/.test(h1), 'der Text kommt ungefiltert durch');
        assert.match(h1, /&lt;b&gt;Angriff&lt;\/b&gt;/);
        assert.match(h1, /&amp; mehr/);

        const mitTab = load('de');
        assert.equal(marken(mitTab.mitStufenzahl(roh, null)), 0);
        assert.ok(!/<b>/.test(mitTab.mitStufenzahl(roh, null)));
    });

    it('der Text bleibt escaped — vor UND hinter der Marke', () => {
        const api = load('de');
        const roh = '<b>vor</b> Erhöht den Angriff. <script>x</script>';
        const e = { cat: 'move', en_effect: "Raises the user's Attack by 1 stage.", de_effect: roh };
        const html = api.mitStufenzahl(roh, e);
        assert.equal(marken(html), 1, 'Testannahme: hier muss eine Marke sitzen');
        assert.ok(!/<script>/.test(html), 'der Text HINTER der Marke ist ungefiltert');
        assert.ok(!/<b>vor<\/b>/.test(html), 'der Text VOR der Marke ist ungefiltert');
        assert.match(html, /&lt;script&gt;/);
        assert.match(html, /&lt;b&gt;vor/);
        assert.match(html, /<a class="sq-res-stufe"/, 'die eigene Auszeichnung wurde mit escaped');
    });

    /* DER PFAD, DEN DIE ABNAHME GEFUNDEN HAT: 1104 der 1268 Eintraege
       bekommen keine Marke und laufen durch den Rueckgabezweig
       `if (!treffer.length)`. Blieb der ungefiltert, kaeme fast der
       gesamte Nachschlagetext roh ins HTML. */
    it('auch ohne Marke bleibt der Text escaped', () => {
        const api = load('de');
        // Englisch liefert eine Stufe, der deutsche Text hat aber ZWEI
        // Richtungswoerter — also keine Marke, und der Text geht durch
        // genau diesen Zweig.
        const roh = 'Erhöht <b>X</b> und senkt <i>Y</i>.';
        const e = { cat: 'move', en_effect: "Raises the user's Attack by 1 stage.", de_effect: roh };
        const html = api.mitStufenzahl(roh, e);
        assert.equal(marken(html), 0, 'Testannahme: hier darf keine Marke sitzen');
        assert.ok(!/<b>/.test(html) && !/<i>/.test(html),
            'ohne Marke laeuft der Text ungefiltert ins HTML');
        assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);

        // Und derselbe Zweig fuer eine Attacke ganz ohne Stufenangabe.
        const e2 = { cat: 'move', en_effect: 'The user attacks.', de_effect: roh };
        const h2 = api.mitStufenzahl(roh, e2);
        assert.ok(!/<b>/.test(h2));
    });

    /* Das markierte Wort selbst ist heute nicht gefaehrlich: englisch ist
       es immer "by N stage(s)", deutsch immer eines der zehn
       Richtungswoerter — beide koennen kein "<" enthalten. Das
       escapeHtml() darum ist Vorsorge, keine Notwendigkeit, und laesst
       sich mit echten Daten nicht ausloesen. Geprueft wird deshalb, dass
       es DASTEHT: wer es entfernt, macht eine Aenderung an der Wortliste
       zu einer Luecke. */
    it('auch das markierte Wort geht durch escapeHtml — Vorsorge', () => {
        assert.match(SRC_C, /\+ `>\$\{escapeHtml\(tr\.wort\)\}<span class="sq-res-stufe-pct">/,
            'das markierte Wort wird ungefiltert eingesetzt — heute '
            + 'ungefaehrlich, aber eine Wortliste mit einem Sonderzeichen '
            + 'macht daraus eine Luecke');
    });
});

describe('Stufen im Text — an allen 1268 Eintraegen', () => {
    it('KEIN Eintrag ausser einer Attacke traegt eine Marke', () => {
        const de = load('de'), en = load('en');
        const falsch = [];
        ALLE.filter(e => e.cat !== 'move').forEach(e => {
            if (marken(gerendert(de, e, true))) falsch.push(`DE ${e.cat} ${e.de}`);
            if (marken(gerendert(en, e, false))) falsch.push(`EN ${e.cat} ${e.en}`);
        });
        assert.deepEqual(falsch, [],
            'Faehigkeiten und Items reden ueber Multiplikatoren und ueber das '
            + 'VERHINDERN von Senkungen — beides ist keine Stufe');
    });

    it('kein Eintrag zeigt je nach Sprache zwei verschiedene Zahlen', () => {
        const de = load('de'), en = load('en');
        const uneinig = [];
        ALLE.forEach(e => {
            const d = markeAus(gerendert(de, e, true));
            const g = markeAus(gerendert(en, e, false));
            if (d != null && g != null && d !== g) uneinig.push(`${e.en}: DE ${d} / EN ${g}`);
        });
        assert.deepEqual(uneinig, [],
            'dieselbe Attacke, zwei Zahlen je nach Sprachschalter');
    });

    it('jede Marke traegt eine der sechs bekannten Stufen', () => {
        const de = load('de'), en = load('en');
        const daneben = [];
        ALLE.forEach(e => {
            [markeAus(gerendert(de, e, true)), markeAus(gerendert(en, e, false))].forEach(s => {
                if (s != null && ![-3, -2, -1, 1, 2, 3].includes(s)) daneben.push(`${e.en}: ${s}`);
            });
        });
        assert.deepEqual(daneben, []);
    });

    it('jede Marke laesst sich am englischen Text nachrechnen', () => {
        const de = load('de'), en = load('en');
        const falsch = [];
        MOVES.forEach(e => {
            const soll = en.stufeAusEnglisch(e.en_effect);
            [['DE', markeAus(gerendert(de, e, true))], ['EN', markeAus(gerendert(en, e, false))]]
                .forEach(([l, ist]) => {
                    if (ist != null && ist !== soll) falsch.push(`${l} ${e.en}: ${ist} statt ${soll}`);
                });
        });
        assert.deepEqual(falsch, []);
    });

    it('kein Text enthaelt nach dem Rendern ein fremdes "<"', () => {
        const de = load('de'), en = load('en');
        const roh = [];
        ALLE.forEach(e => {
            [gerendert(de, e, true), gerendert(en, e, false)].forEach(h => {
                // Alles Eigene entfernen; was an "<" uebrig bleibt, kam aus den Daten.
                const rest = h.replace(/<a class="sq-res-stufe"[\s\S]*?<\/a>/g, '');
                if (rest.includes('<')) roh.push(e.en);
            });
        });
        assert.deepEqual(roh, []);
    });

    it('benannte Attacken tragen ihre Marke — in beiden Sprachen dieselbe', () => {
        const de = load('de'), en = load('en');
        const holen = (n) => MOVES.find(m => m.en === n);
        [['Agility', 2], ['Amnesia', 2], ['Swagger', 2], ['Lunge', -1]].forEach(([n, soll]) => {
            const e = holen(n);
            assert.ok(e, `Testannahme: ${n} steht nicht mehr in den Daten`);
            assert.equal(markeAus(gerendert(en, e, false)), soll, `${n} englisch`);
            const d = markeAus(gerendert(de, e, true));
            assert.ok(d === soll || d === null,
                `${n} deutsch: ${d} statt ${soll} oder gar nichts`);
        });
    });

    /* Die Faelle, an denen die Abnahme den ersten Entwurf zerlegt hat.
       Sie stehen hier namentlich, damit keiner von ihnen zurueckkommt. */
    it('die Funde der Abnahme bleiben unmarkiert', () => {
        const de = load('de'), en = load('en');
        const holen = (n) => ALLE.find(e => e.de === n || e.en === n);
        [
            ['Brustbieter', 'behauptete zu senken, verhindert aber das Senken'],
            ['Neutraltorso', 'verhindert das Senken'],
            ['Gefühlswippe', 'zwei Effekte, das "stark" wanderte'],
            ['Leben-Orb', 'Multiplikator, keine Stufe'],
            ['Kraftvorrat', 'redet ueber Statuswerte, aendert keine Stufe'],
            ['Sandsturm', 'Multiplikator'],
            ['Machoband', 'Multiplikator, und zwar ein halbierender'],
        ].forEach(([name, warum]) => {
            const e = holen(name);
            if (!e) return;   // Datei kann sich aendern; dann prueft der Rest.
            assert.equal(marken(gerendert(de, e, true)), 0, `${name} (DE) — ${warum}`);
            assert.equal(marken(gerendert(en, e, false)), 0, `${name} (EN) — ${warum}`);
        });
    });

    it('Fadenschuss zeigt in beiden Sprachen dieselbe Zahl', () => {
        const de = load('de'), en = load('en');
        const e = ALLE.find(x => x.de === 'Fadenschuss');
        assert.ok(e, 'Testannahme: Fadenschuss steht nicht mehr in den Daten');
        assert.equal(markeAus(gerendert(de, e, true)), markeAus(gerendert(en, e, false)));
    });

    it('ueberhaupt tragen Attacken eine Marke', () => {
        const de = load('de'), en = load('en');
        let mitDe = 0, mitEn = 0;
        MOVES.forEach(e => {
            if (marken(gerendert(de, e, true))) mitDe++;
            if (marken(gerendert(en, e, false))) mitEn++;
        });
        // Keine Zahl, sondern eine Aussage: es greift ueberhaupt. Der erste
        // Entwurf fand in 494 Attacken NULL Treffer, weil die Wortliste
        // erfunden statt abgelesen war.
        assert.ok(mitEn, 'keine einzige englische Attacke traegt eine Marke');
        assert.ok(mitDe, 'keine einzige deutsche Attacke traegt eine Marke');
    });
});

/* Die Funde der zweiten Abnahme. */
describe('Stufen im Text — die zweite Abnahme', () => {
    it('ein Satz ueber eine ANDERE Attacke bekommt keine Marke', () => {
        const de = load('de'), en = load('en');
        // Nebelfeld: "... and Secret Power has a 30% chance to lower
        // Special Attack by 1 stage." Das ist eine Aussage ueber
        // Kraftreserve, nicht ueber das Feld.
        ['Misty Terrain', 'Psychic Terrain'].forEach(n => {
            const e = ALLE.find(x => x.en === n);
            assert.ok(e, `Testannahme: ${n} steht nicht mehr in den Daten`);
            assert.match(e.en_effect, /Secret Power/,
                `Testannahme: ${n} nennt Kraftreserve nicht mehr`);
            assert.equal(marken(gerendert(en, e, false)), 0,
                `${n} traegt eine Zahl aus einem Satz ueber eine andere Attacke`);
            assert.equal(marken(gerendert(de, e, true)), 0);
        });
        // Die Gegenprobe: derselbe Satz ohne fremden Namen traegt sehr wohl.
        assert.equal(en.stufeAusEnglisch(
            "Has a 30% chance to lower Special Attack by 1 stage.", 'X'), -1);

        /* Geprueft wird der SATZ um die Fundstelle, nicht der ganze Text.
           Koenigsschild nennt in einem anderen Satz "Endure" — waere der
           ganze Text der Massstab, verloere es seine richtige Marke. */
        const ks = MOVES.find(e => e.en === "King's Shield");
        assert.ok(ks, 'Testannahme: Koenigsschild steht nicht mehr in den Daten');
        assert.ok(en.fremdeAttacke(ks.en_effect, ks.en),
            'Testannahme: der Koenigsschild-Text nennt keine andere Attacke mehr');
        assert.equal(en.stufeAusEnglisch(ks.en_effect, ks.en), -1,
            'Koenigsschild verliert seine Marke, weil eine fremde Attacke '
            + 'in einem ANDEREN Satz steht');

        /* Dass der eigene Name nicht als fremd zaehlt, laesst sich mit den
           echten Daten nicht ausloesen: die fuenf Attacken, die sich selbst
           nennen, tun das jeweils in einem anderen Satz als ihre
           Stufenangabe. Die Ausnahme ist Vorsorge — geprueft wird deshalb,
           dass sie DASTEHT. */
        assert.match(SRC_C, /e\.en === eigenerName\) continue;/,
            'ohne die Ausnahme fuer den eigenen Namen verliert jede '
            + 'Attacke ihre Marke, die sich im selben Satz selbst nennt');
    });

    it('die Partizipformen zaehlen mit', () => {
        const en = load('en');
        // Klebenetz und Koenigsschild: dieselbe formelhafte Struktur, nur
        // eine andere Wortform. Sie zu uebergehen hiess, richtige Zahlen
        // wegzulassen.
        assert.equal(en.stufeAusEnglisch(
            'Sets up a hazard, lowering the Speed by 1 stage of each opposing Pokemon.', 'X'), -1);
        assert.equal(en.stufeAusEnglisch(
            'Pokemon trying to make contact have their Attack lowered by 1 stage.', 'X'), -1);
        // Und ohne "by" — ein Text macht das.
        assert.equal(en.stufeAusEnglisch(
            'Raises the Attack of the user and all allies 1 stage.', 'X'), 1);
    });

    /* Zwoelf Attacken haben keinen deutschen Text; die Seite zeigt dort
       den englischen. Nach der OBERFLAECHENSPRACHE zu entscheiden hiess:
       derselbe Satz trug im englischen UI eine Marke und im deutschen
       keine. */
    it('die Marke richtet sich nach der Sprache des TEXTES, nicht der Oberflaeche', () => {
        const de = load('de'), en = load('en');
        const ohneDe = MOVES.filter(e => !(e.de_effect && e.de_effect.trim())
                                      && en.stufeAusEnglisch(e.en_effect, e.en) != null);
        assert.ok(ohneDe.length, 'Testannahme: alle Attacken haben deutschen Text');
        ohneDe.forEach(e => {
            const d = markeAus(gerendert(de, e, true));
            const g = markeAus(gerendert(en, e, false));
            assert.equal(d, g,
                `${e.en}: derselbe englische Satz traegt im deutschen UI ${d} `
                + `und im englischen ${g}`);
            assert.notEqual(d, null, `${e.en}: im deutschen UI fehlt die Marke`);
        });
    });

    it('ein deutscher Text wird weiter deutsch platziert', () => {
        const de = load('de');
        const e = MOVES.find(x => x.en === 'Amnesia');
        assert.ok(e && e.de_effect, 'Testannahme: Amnesie hat keinen deutschen Text');
        const html = gerendert(de, e, true);
        assert.match(html, /<a class="sq-res-stufe"[^>]*>erhöht<span/,
            'der deutsche Text wird nach englischen Wortformen durchsucht');
    });
});

describe('Stufen im Text — der Weg zur Tabelle', () => {
    it('das Feature haengt wirklich am Rendern der Eintraege', () => {
        assert.match(SRC_C, /\?\s*mitStufenzahl\(eff, e\)/,
            'der Effekttext laeuft nicht mehr durch mitStufenzahl — '
            + 'dann steht nirgends eine Zahl');
    });

    it('die Tabelle wird nachgeladen, wenn sie fehlt', () => {
        assert.match(STATUS_C, /function stufen\(\)/);
        assert.match(STATUS_C, /window\.sideQuestStatus = \{[\s\S]{0,200}?stufen: stufen/,
            'stufen() wird nicht nach aussen gegeben');
        assert.match(SRC_C, /window\.sideQuestStatus\.stufen\(\)/,
            'das Nachschlagen fordert die Tabelle nicht an — dann haengt '
            + 'die Zahl davon ab, ob jemand vorher den anderen Reiter '
            + 'geoeffnet hat');
    });

    it('ein Klick auf die Marke fuehrt zur ganzen Tabelle', () => {
        assert.match(SRC_C, /data-sq-stufe\]/);
        assert.match(SRC_C, /showView\('status'\)/);
        assert.match(SRC_C, /getElementById\('szStufenTitel'\)/,
            'der Sprung landet nicht bei der Tabelle');
        assert.match(SRC_C, /href="#side-quest-stufen"/);
    });

    it('die Marke ist sichtbar und mit der Tastatur bedienbar', () => {
        assert.match(CSS_C, /\.sq-res-stufe \{[^}]*text-decoration:\s*underline/);
        assert.match(CSS_C, /\.sq-res-stufe:focus-visible \{[^}]*outline/);
        assert.match(CSS_C, /\.sq-res-stufe-pct \{[^}]*tabular-nums/);
    });
});
