/**
 * Die Aufräumrunde vom 01.09.2026.
 *
 * AUSLÖSER
 *
 * Eine Rückmeldung mit zwölf Bildschirmfotos, deren tragender Satz
 * lautete: „Aber ich glaube, wir verlieren uns gerade so ein bisschen
 * in Unübersichtlichkeit, und das war nie der Plan."
 *
 * WAS DIESE DATEI PRÜFT — UND WAS NICHT
 *
 * Sie prüft nicht, dass etwas weg ist. Das allein wäre wertlos: eine
 * Löschung schreibt sich in einer Zeile, und beim nächsten Mal baut sie
 * jemand wieder ein, weil niemand mehr weiß, warum sie weg war.
 *
 * Sie prüft die drei Dinge, an denen eine Kürzung scheitern kann:
 *
 *   1. Sie ist keine Kürzung, sondern ein Verlust — eine Zahl, die
 *      nirgends mehr steht.
 *   2. Sie ist keine Vereinfachung, sondern eine Verschiebung — die
 *      Dopplung ist noch da, nur an anderer Stelle.
 *   3. Sie ist nicht begründet — kein Eintrag in
 *      docs/geparkte-features.md, also beim nächsten Mal wieder da.
 *
 * Die Prüfungen laufen deshalb, wo möglich, gegen das ERGEBNIS: die
 * Abschnittsköpfe werden wirklich gebaut, die Rundenzahl wirklich
 * gerechnet.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SEC    = read('js/ds-sections.js');
const EV     = read('js/ds-ev-rechner.js');
const PARKEN = read('docs/geparkte-features.md');

// ───────────────────────────────────────────────────────────────────
// 1. Die Abschnittsköpfe — ausgeführt, nicht gelesen
// ───────────────────────────────────────────────────────────────────

/* SECTIONS und die beiden Textfunktionen aus dem Modul herausschneiden
   und wirklich laufen lassen. Ein Test, der die Zeichenkette
   'Die meistgespielten Decks' im Quelltext sucht, hätte nicht gemerkt,
   dass die Unterzeile trotzdem als leeres Feld gerendert wird. */
function abschnitte(sprache) {
    const block = /var SECTIONS = \[[\s\S]*?\n    \];/.exec(SEC)[0];
    const f = new Function('getLang', `
        ${block}
        function de() { return getLang() === 'de'; }
        function texte(s) { return de() ? s.de : s.en; }
        return SECTIONS.map(s => ({ id: s.id, auf: s.auf, t: texte(s) }));
    `);
    return f(() => sprache);
}

describe('Die Abschnitte der Startseite', () => {
    it('heißen nach dem, was in ihnen steht — nicht nach einer Bewertung', () => {
        /* Gemeldet: "Wichtig hierbei ist aber, dass wir vielleicht nicht
           sagen 'die stärksten Decks', sondern es sind de facto erstmal
           nur die meistgenutzten Decks."
           Das ist keine Geschmacksfrage: sortiert wird nach Anteil, und
           eine Überschrift, die Stärke behauptet, wo Häufigkeit gezählt
           wird, ist schlicht falsch. */
        const de = abschnitte('de');
        const top = de.find(s => s.id === 'top');
        assert.ok(/meistgespielt/i.test(top.t[0]),
            `der erste Abschnitt heißt "${top.t[0]}" statt nach der Häufigkeit`);
        assert.ok(!/stärkst/i.test(top.t[0]), 'die Stärke-Behauptung ist zurück');

        const en = abschnitte('en');
        const topEn = en.find(s => s.id === 'top');
        assert.ok(/most played/i.test(topEn.t[0]),
            `englisch: "${topEn.t[0]}"`);
        assert.ok(!/strongest/i.test(topEn.t[0]));
    });

    it('die Karten-Überschrift nennt die Karten, nicht das Fachwort', () => {
        // Gemeldet: "Da könnte man wahrscheinlich einfach statt der
        // Überschrift 'die Karten, die fast jedes Deck spielt' nehmen,
        // 'meistgespielte Karten'."
        const cards = abschnitte('de').find(s => s.id === 'cards');
        assert.equal(cards.t[0], 'Meistgespielte Karten');
    });

    it('keine Unterzeile wiederholt ihre eigene Überschrift', () => {
        /* "wer schlägt wen" unter "Matchups", "Format-Staples" unter
           einer Überschrift, die das Wort schon trägt. Gemeldet: "Dieses
           'Wer schlägt wen' kann da weg … ist eine super sinnlose
           Bezeichnung."
           Geprüft wird die Regel, nicht die einzelne Zeile: keine
           Unterzeile darf ein Wort ihrer Überschrift wiederholen, und
           keine darf eine Umschreibung derselben Sache sein. */
        for (const sprache of ['de', 'en']) {
            for (const s of abschnitte(sprache)) {
                if (!s.t[1]) continue;
                const worte = (w) => w.toLowerCase()
                    .replace(/[^a-zäöüß ]/g, ' ').split(/\s+/).filter(x => x.length > 4);
                const kopf = new Set(worte(s.t[0]));
                const doppelt = worte(s.t[1]).filter(w => kopf.has(w));
                assert.deepEqual(doppelt, [],
                    `${sprache}/${s.id}: "${s.t[1]}" wiederholt "${doppelt}" aus "${s.t[0]}"`);
            }
        }
        // Und die drei, die keine mehr haben, haben wirklich keine.
        for (const id of ['top', 'heatmap', 'cards']) {
            assert.equal(abschnitte('de').find(s => s.id === id).t[1], '',
                `${id} hat wieder eine Unterzeile`);
            assert.equal(abschnitte('en').find(s => s.id === id).t[1], '');
        }
    });

    it('eine leere Unterzeile wird ausgeblendet, nicht nur geleert', () => {
        // Sonst kostet sie weiter Abstand und liest sich als
        // abgeschnittener Text.
        assert.match(SEC, /function setzeUnterzeile\(wurzel, text\)/);
        assert.match(SEC, /el\.hidden = !text;/);
        // Beide Stellen benutzen sie: der Aufbau UND die Neubeschriftung
        // beim Sprachwechsel. Ohne die zweite käme die leere Zeile beim
        // Umschalten zurück.
        assert.equal((SEC.match(/setzeUnterzeile\(/g) || []).length, 3,
            'eine der beiden Aufrufstellen setzt die Unterzeile wieder direkt');
    });

    it('jede Sprache kennt jeden Abschnitt', () => {
        const de = abschnitte('de'), en = abschnitte('en');
        assert.equal(de.length, en.length);
        de.forEach((s, i) => {
            assert.equal(s.id, en[i].id);
            assert.ok(s.t[0], `${s.id} hat keinen deutschen Titel`);
            assert.ok(en[i].t[0], `${s.id} hat keinen englischen Titel`);
        });
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Acht Runden, nicht neun — gerechnet, nicht gelesen
// ───────────────────────────────────────────────────────────────────

describe('Der EV-Rechner rechnet über ein echtes Turnier', () => {
    /* Gemeldet: "Fakt ist eins, dass wir auf Turnieren, wie gesagt,
       immer 8 Runden spielen, deswegen muss hier die Kalkulation bitte
       auf 8 Runden sein und nicht auf 9."

       Neun kam aus der Rundenformel grosser Turniere und gilt erst ab
       513 Spielern. Der Unterschied ist nicht kosmetisch: bei 54 % Win
       Rate sind es 4,86 statt 4,32 erwartete Siege — eine ganze
       Rundendifferenz in der Erwartung, und danach entscheidet sich, ob
       jemand Day 2 für erreichbar hält. */
    const STD = Number(/var RUNDEN_STD = (\d+);/.exec(EV)[1]);

    it('startet mit acht Runden', () => {
        assert.equal(STD, 8, `der Startwert steht auf ${STD} Runden`);
    });

    it('und die erwarteten Siege folgen dieser Zahl', () => {
        // Die Rechnung selbst, aus der Anzeigefunktion geschnitten:
        // Siege = EV/100 * Runden. Mit 9 käme 4,86 heraus, mit 8: 4,32.
        const siege = (ev, runden) => (ev / 100) * runden;
        assert.equal(siege(54, STD).toFixed(2), '4.32');
        assert.notEqual(siege(54, STD).toFixed(2), '4.86');
        assert.match(EV, /var siege = \(r\.ev \/ 100\) \* runden;/,
            'die Rechnung ist nicht mehr Quote mal Runden');
    });

    it('und der Startwert erreicht auch, wer schon einmal hier war', () => {
        /* Ein Startwert greift nur bei einem leeren Speicher. Wer den
           Rechner vorher geöffnet hatte, trug die 9 in localStorage —
           live nachgemessen nach dem Deploy: die Seite zeigte weiter 9.
           Darunter ausgerechnet der Betreiber, der die Änderung
           gemeldet hat; ohne den Schlüsselsprung hätte sich für ihn
           nichts geändert. */
        assert.match(EV, /var STORE\s*=\s*'ds_ev_wahl_v2'/,
            'der Speicherschlüssel steht wieder auf v1 — dann behalten alte Besucher ihre 9');
    });

    it('bleibt aber änderbar — die Zahl ist ein Startwert, kein Gesetz', () => {
        // Wer neun Runden spielt, soll neun eintragen können, und die
        // Eingabe soll den nächsten Besuch überleben.
        assert.match(EV, /class="ds-number ds-ev-runden" type="number" min="1" max="20"/);
        assert.match(EV, /merke\(\{ deck: deck, feld: feld, runden: runden \}\)/);
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Nichts ist ohne Begründung verschwunden
// ───────────────────────────────────────────────────────────────────

describe('Jede Entfernung ist begründet und rücknehmbar beschrieben', () => {
    const ENTFERNT = [
        'Unser Pick fürs Turnier',
        'Was gerade läuft',
        'Gemeldete Listen',
        'Deck-Suche',
        'Auf- und Absteiger',
    ];

    /* Gegen die ÜBERSCHRIFTEN geprüft, nicht gegen die ganze Datei.
       Ein Name, der irgendwo im Fließtext oder in der Ideenliste am Ende
       vorkommt, ist kein Eintrag — und genau so wäre diese Prüfung
       einmal durchgerutscht. */
    const KOEPFE = [...PARKEN.matchAll(/^### .*$/gm)].map(m => m[0]);

    for (const name of ENTFERNT) {
        it(`${name} hat einen eigenen Eintrag`, () => {
            assert.ok(KOEPFE.some(k => k.includes(name)),
                `${name} hat keine Überschrift in docs/geparkte-features.md — ` +
                `gefunden: ${KOEPFE.join(' | ')}`);
        });
    }

    it('und jeder Eintrag sagt, was an einer Rückkehr anders sein müsste', () => {
        /* Der wichtigste Teil. Ein Eintrag, der nur sagt "war da, ist
           weg", ist ein Nachruf — er verhindert nicht, dass dasselbe
           Feature in derselben Form wiederkommt. */
        const eintraege = PARKEN.split(/\n### /).slice(1);
        assert.ok(eintraege.length >= 5, `nur ${eintraege.length} Einträge`);
        for (const e of eintraege) {
            const titel = e.split('\n')[0];
            assert.ok(/Was anders sein müsste|Wo es jetzt steht|Nicht gelöscht/.test(e),
                `"${titel}" sagt nicht, was an einer Rückkehr anders sein müsste`);
            assert.ok(/Warum weg/.test(e), `"${titel}" nennt keinen Grund`);
        }
    });

    it('die Datei wird nicht ausgeliefert', () => {
        /* Sie ist eine interne Notiz. Im Quelltext DARF sie stehen —
           die Kommentare an den entfernten Stellen verweisen absichtlich
           auf sie, das ist der halbe Zweck der Übung. Sie darf nur
           nichts sein, was der Browser holt: kein Eintrag im
           Offline-Vorrat, kein src und kein href. */
        assert.ok(!read('service-worker.js').includes('geparkte-features'),
            'die interne Notiz steht im Offline-Vorrat');
        const html = read('index.html');
        assert.ok(!/(?:src|href)="[^"]*geparkte-features/.test(html),
            'die interne Notiz ist von der Seite aus verlinkt');
        // Und die Verweise, die es geben soll, sind Kommentare.
        for (const m of html.matchAll(/geparkte-features/g)) {
            const vor = html.lastIndexOf('<!--', m.index);
            const zu  = html.lastIndexOf('-->', m.index);
            assert.ok(vor > zu, 'ein Verweis steht ausserhalb eines Kommentars');
        }
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Leere Hüllen aus der Scraper-Datei
// ───────────────────────────────────────────────────────────────────

describe('Was übrig bleibt, wenn man einen Block aus seiner Hülle nimmt', () => {
    /* GEMESSEN am 01.09.2026: das erste Kind von #currentMetaContent war
       ein leeres <div style="display:grid; …; margin-bottom:40px">, die
       Hülle der am 19.08.2026 entfernten Blöcke "Biggest Rank Climbers"
       und "Biggest Rank Fallers". Kein Text, kein Kind, 40px
       Aussenabstand — ein unsichtbarer Block, der die ganze Seite nach
       unten schiebt. Zusammen mit den beiden heute entfernten Blöcken
       standen zwischen der Filterzeile und der ersten Überschrift
       639px; jetzt sind es 36.

       Node hat kein DOM, und jsdom ist keine Abhängigkeit dieses Repos.
       Der Baum unten ist deshalb von Hand gebaut — er kann genau das,
       was die Funktion benutzt. Ein Test, der stattdessen den Quelltext
       läse, würde eine kaputte Abbruchbedingung nicht bemerken. */
    const CARDS = read('js/app-meta-cards.js');

    function baum() {
        const knoten = (tag, kinder, text) => {
            const k = {
                tagName: tag.toUpperCase(),
                children: kinder || [],
                _text: text || '',
                parent: null,
                get textContent() {
                    return this._text + this.children.map(c => c.textContent).join('');
                },
                remove() {
                    if (!this.parent) return;
                    const i = this.parent.children.indexOf(this);
                    if (i > -1) this.parent.children.splice(i, 1);
                },
                querySelectorAll(sel) {
                    const raus = [];
                    const geh = (n) => n.children.forEach(c => {
                        if (c.tagName === sel.toUpperCase()) raus.push(c);
                        geh(c);
                    });
                    geh(this);
                    return raus;
                },
            };
            (kinder || []).forEach(c => { c.parent = k; });
            return k;
        };
        return { knoten };
    }

    function laden() {
        const src = /function _entferneLeereHuellen\(root\) \{[\s\S]*?\n        \}/.exec(CARDS);
        assert.ok(src, '_entferneLeereHuellen nicht gefunden');
        return new Function(src[0] + '\nreturn _entferneLeereHuellen;')();
    }

    it('eine leere Hülle fliegt raus', () => {
        const { knoten } = baum();
        const leer = knoten('div');
        const voll = knoten('div', [knoten('table', [], 'Daten')]);
        const wurzel = knoten('div', [leer, voll]);
        laden()(wurzel);
        assert.equal(wurzel.children.length, 1);
        assert.equal(wurzel.children[0], voll);
    });

    it('eine Hülle mit Text bleibt — auch ohne Kindelemente', () => {
        const { knoten } = baum();
        const mitText = knoten('div', [], 'Zu wenig Bewegung diese Woche.');
        const wurzel = knoten('div', [mitText]);
        laden()(wurzel);
        assert.equal(wurzel.children.length, 1, 'ein Hinweistext wurde weggeräumt');
    });

    it('und eine Hülle, die nur eine leere Hülle enthielt, geht mit', () => {
        /* Der eigentliche Grund für die zweite Runde. Ohne sie bliebe
           die äussere Hülle stehen — mit ihrem eigenen Aussenabstand,
           und damit wäre nichts gewonnen. */
        const { knoten } = baum();
        const innen = knoten('div');
        const aussen = knoten('div', [innen]);
        const wurzel = knoten('div', [aussen, knoten('table', [], 'x')]);
        laden()(wurzel);
        assert.deepEqual(wurzel.children.map(c => c.tagName), ['TABLE'],
            'die äussere Hülle steht noch: ' + wurzel.children.map(c => c.tagName));
    });

    it('nichts anderes als div wird angefasst', () => {
        // Ein leeres <td> oder <span> hat oft eine Bedeutung (eine Zelle
        // ohne Wert ist eine Zelle). Nur die Hüllen sind gemeint.
        const { knoten } = baum();
        const wurzel = knoten('div', [knoten('td'), knoten('span'), knoten('div')]);
        laden()(wurzel);
        assert.deepEqual(wurzel.children.map(c => c.tagName), ['TD', 'SPAN']);
    });

    it('sie läuft dort, wo die Blöcke entfernt werden', () => {
        assert.match(CARDS, /_entferneLeereHuellen\(root\);\s*\n\s*return root;/,
            'die Funktion wird nicht aufgerufen');
    });
});
