/**
 * Statuszustände — die Übersicht, die es bis zum 31.08.2026 nicht gab.
 *
 * WAS HIER SCHIEFGEHEN KANN
 *
 * 1. Ein Schlüssel zeigt ins Leere. Die Seite nennt Attacken, Items und
 *    Fähigkeiten beim englischen Namen und löst den deutschen über
 *    data/champions_names_de.json auf. Fehlt dort ein Eintrag, steht auf
 *    der deutschen Seite plötzlich "Will-O-Wisp" statt "Irrlicht" — und
 *    zwar still, ohne Fehler.
 *
 * 2. Eine Zahl driftet von unseren eigenen Daten weg. Die Regeln kommen
 *    aus der Hauptreihe (PokéWiki), aber zwei Zahlen stehen auch in
 *    unseren Champions-Daten: Irrlicht nennt 1/16 KP und halbierten
 *    physischen Angriff, Schlafpuder nennt 1 bis 3 Runden. Wenn die
 *    Übersicht etwas anderes sagt als die Attacke daneben, widerspricht
 *    die Seite sich selbst — und man merkt es nur, wenn beides
 *    gleichzeitig offen ist.
 *
 * 3. Der Weg dorthin fehlt. Die Ansicht hängt an einem Unterreiter mit
 *    data-sq-view="status", einem Host und einem Zweig in showView().
 *    Fehlt einer davon, ist die Seite gebaut und unerreichbar.
 *
 * 4. Der Klassenpräfix. Siehe tests/unit/test-admin-datenluecken.js: mit
 *    dem Präfix `ad-` blendet jeder Werbeblocker die Elemente aus.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const json = (...p) => JSON.parse(lies(...p));

const DATEN = json('data', 'champions_statuszustaende.json');
const NAMEN = json('data', 'champions_names_de.json');
const MOVES = json('data', 'champions_moves_reference.json').moves;
const USAGE = json('data', 'champions_usage.json').pokemon;
const TEAMS = json('data', 'champions_replica_teams.json');

/* Alle Attacken, die in Champions BELEGT sind.
 *
 * Die Attackenreferenz allein reicht nicht: sie deckt nur den aktuellen
 * Top-20-Pool (102 Attacken). data/champions_names_de.json reicht auch
 * nicht — die Datei fuehrt 927 Attacken, also die ganze Hauptreihe, und
 * beweist ueber Champions gar nichts. Die Belegbasis ist deshalb die
 * Vereinigung aus In-Game-Nutzung, Replica-Teams und Referenz.
 *
 * Wichtig fuer die Auslegung: die Nutzungsdaten fuehren je Pokemon nur
 * die haeufigsten Attacken. Wer hier fehlt, ist NICHT widerlegt, nur
 * unbelegt — und unbelegt reicht nicht, um ihn auf der Seite zu nennen.
 */
function belegteAttacken() {
    const menge = new Set(Object.keys(MOVES));
    for (const rec of Object.values(USAGE)) {
        for (const fmt of ['doubles', 'singles']) {
            for (const m of ((rec[fmt] || {}).move || [])) {
                if (m && m.name) menge.add(m.name);
            }
        }
    }
    (function walk(o) {
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (!o || typeof o !== 'object') return;
        for (const [k, v] of Object.entries(o)) {
            if ((k === 'moves' || k === 'move') && Array.isArray(v)) {
                for (const x of v) {
                    if (typeof x === 'string') menge.add(x);
                    else if (x && x.name) menge.add(x.name);
                }
            } else walk(v);
        }
    })(TEAMS);
    return menge;
}
const BELEGT = belegteAttacken();
const JS_MODUL = lies('js', 'app-side-quest-status.js');
const CSS = lies('css', 'statuszustaende.css');
const HTML = lies('index.html');
const RESOURCES = lies('js', 'app-side-quest-resources.js');

const ZUSTAENDE = DATEN.zustaende;
const TOPF = { attacke: 'moves', item: 'items', faehigkeit: 'abilities' };
const LISTEN = ['verursacht', 'immun', 'heilt', 'nutzt'];

function alleEintraege() {
    const out = [];
    for (const z of ZUSTAENDE) {
        for (const feld of LISTEN) {
            for (const e of (z[feld] || [])) out.push({ z: z.id, feld, e });
        }
    }
    return out;
}

describe('Statuszustände — die Daten', () => {
    it('führt die sieben Zustände, die es in Champions gibt', () => {
        // Der Beleg für die Auswahl ist die Prunusbeere: sie heilt laut
        // unseren Item-Daten Brand, Gift, Paralyse, Schlaf, Frost und
        // Verwirrung. Die schwere Vergiftung kommt über Toxin dazu.
        const ids = ZUSTAENDE.map(z => z.id).sort();
        assert.deepEqual(ids, [
            'einfrieren', 'paralyse', 'schlaf', 'schwere-vergiftung',
            'vergiftung', 'verbrennung', 'verwirrung'
        ].sort());
    });

    it('jeder Zustand trägt beide Sprachen an jeder Stelle', () => {
        for (const z of ZUSTAENDE) {
            for (const feld of ['de', 'en', 'kuerzel', 'art', 'id']) {
                assert.ok((z[feld] || '').trim(), `${z.id}: ${feld} fehlt`);
            }
            for (const paar of ['kurz', 'dauer']) {
                assert.ok((z[paar].de || '').trim(), `${z.id}.${paar}: deutsch fehlt`);
                assert.ok((z[paar].en || '').trim(), `${z.id}.${paar}: englisch fehlt`);
            }
            assert.ok(z.wirkung.length > 0, `${z.id}: keine Wirkung beschrieben`);
            for (const w of z.wirkung) {
                assert.ok((w.wert || '').trim(), `${z.id}: eine Wirkung ohne Zahl`);
                assert.ok((w.de || '').trim() && (w.en || '').trim(),
                    `${z.id}: eine Wirkung nur einsprachig`);
            }
            assert.ok(Array.isArray(z.immunTypen), `${z.id}: immunTypen fehlt`);
        }
    });

    it('jeder genannte Name lässt sich ins Deutsche auflösen', () => {
        // Der Fehler, der sonst still passiert: die deutsche Seite zeigt
        // den englischen Schlüssel und sieht dabei völlig normal aus.
        const fehlen = [];
        for (const { z, feld, e } of alleEintraege()) {
            const topf = NAMEN[TOPF[e.art]];
            assert.ok(topf, `unbekannte Art ${e.art} bei ${z}/${feld}`);
            if (!topf[e.key]) fehlen.push(`${z}/${feld}: ${e.key} (${e.art})`);
        }
        assert.deepEqual(fehlen, [],
            'ohne deutschen Namen steht der englische Schlüssel auf der Seite');
    });

    it('jeder Eintrag sagt in beiden Sprachen, was er tut', () => {
        for (const { z, feld, e } of alleEintraege()) {
            assert.ok((e.de || '').trim(), `${z}/${feld}/${e.key}: deutsch fehlt`);
            assert.ok((e.en || '').trim(), `${z}/${feld}/${e.key}: englisch fehlt`);
            assert.ok(['attacke', 'item', 'faehigkeit'].includes(e.art),
                `${z}/${feld}/${e.key}: unbekannte Art ${e.art}`);
        }
    });

    it('die Quelle steht dabei, mit Adresse und Lesedatum', () => {
        const q = DATEN._meta.quelle;
        assert.match(q.url, /^https:\/\/pokewiki\.de\//);
        assert.equal(q.name, 'PokéWiki');
        assert.match(q.gelesen_am, /^\d{4}-\d{2}-\d{2}$/);
        for (const z of ZUSTAENDE) {
            assert.ok(q.einzelseiten[z.id],
                `${z.id}: keine Einzelseite als Beleg hinterlegt`);
        }
        assert.ok((DATEN._meta.geltung || '').includes('Hauptreihe'),
            'die Seite muss sagen, dass die Regeln aus der Hauptreihe stammen');
    });

    it('kein ASCII-Ersatz in dem, was der Nutzer liest', () => {
        // ae/oe/ue statt Umlaut ist in diesem Projekt schon zweimal live
        // gegangen. Der Quelltext darf ASCII schreiben, die Oberfläche nicht.
        const verdaechtig = ['Faehigkeit', 'Uebersicht', 'Zustaende', 'fuehrt',
            'uebernommen', 'waehlen', 'koennen', 'muessen', 'Luecke', 'Staerke',
            'Zaehler', 'Haelfte', 'naechst'];
        const treffer = [];
        const pruefe = (wo, txt) => {
            for (const w of verdaechtig) {
                if ((txt || '').includes(w)) treffer.push(`${wo}: ${w}`);
            }
        };
        for (const z of ZUSTAENDE) {
            pruefe(z.id + '.kurz', z.kurz.de);
            pruefe(z.id + '.dauer', z.dauer.de);
            if (z.hinweis) pruefe(z.id + '.hinweis', z.hinweis.de);
            if (z.frueher) pruefe(z.id + '.frueher', z.frueher.de);
            z.wirkung.forEach((w, i) => {
                pruefe(`${z.id}.wirkung[${i}]`, w.de);
                pruefe(`${z.id}.wirkung[${i}].wert`, w.wert);
            });
            for (const feld of LISTEN) {
                for (const e of (z[feld] || [])) pruefe(`${z.id}/${feld}/${e.key}`, e.de);
            }
        }
        assert.deepEqual(treffer, [], 'ASCII-Ersatz in sichtbarem Text');
    });
});

describe('Statuszustände — sie widerspricht unseren eigenen Daten nicht', () => {
    // Der eigentliche Wert dieser Datei: die Übersicht steht neben
    // Attacken, die dieselbe Zahl nennen. Driften die auseinander,
    // widerspricht die Seite sich selbst.

    it('Verbrennung: dieselbe Zahl wie bei Irrlicht', () => {
        const irrlicht = MOVES['Will-O-Wisp'].effect;
        assert.match(irrlicht, /1\/16/, 'Testvoraussetzung: Irrlicht nennt 1/16');
        assert.match(irrlicht, /halbiert/i, 'Testvoraussetzung: Irrlicht nennt die Halbierung');
        const brand = ZUSTAENDE.find(z => z.id === 'verbrennung');
        const werte = brand.wirkung.map(w => w.wert).join(' ');
        assert.match(werte, /1\/16/,
            'die Übersicht nennt einen anderen KP-Verlust als Irrlicht daneben');
        assert.match(werte, /×0,5/,
            'die Übersicht nennt die Halbierung nicht, Irrlicht schon');
    });

    it('Schlaf: dieselbe Dauer wie bei Schlafpuder', () => {
        const puder = MOVES['Sleep Powder'].effect;
        assert.match(puder, /1[–-]3\s*Runden/,
            'Testvoraussetzung: Schlafpuder nennt 1–3 Runden');
        const schlaf = ZUSTAENDE.find(z => z.id === 'schlaf');
        assert.match(schlaf.wirkung.map(w => w.wert).join(' '), /1[–-]3\s*Runden/,
            'die Übersicht nennt eine andere Schlafdauer als Schlafpuder daneben');
    });

    it('jede genannte Attacke ist in Champions belegt', () => {
        // BEFUND 31.08.2026: der erste Entwurf nannte Pilzspore als
        // staerkste Schlaf-Attacke. Sie steht in champions_names_de.json
        // — aber die Datei fuehrt die ganze Hauptreihe und belegt ueber
        // Champions nichts. Kein Champions-Datensatz fuehrt Pilzspore.
        // Sie ist deshalb wieder raus.
        assert.ok(BELEGT.size > 300, `nur ${BELEGT.size} belegte Attacken gefunden`);
        const fehlen = [];
        for (const z of ZUSTAENDE) {
            for (const feld of LISTEN) {
                for (const e of (z[feld] || [])) {
                    if (e.art === 'attacke' && !BELEGT.has(e.key)) {
                        fehlen.push(`${z.id}/${feld}: ${e.key}`);
                    }
                }
            }
        }
        assert.deepEqual(fehlen, [],
            'genannt wird nur, was in Champions belegt ist — nicht, was es '
            + 'in der Hauptreihe gibt');
    });

    it('Pilzspore bleibt draussen, solange sie unbelegt ist', () => {
        // Die Gegenprobe zum Befund oben: wer sie wieder eintraegt, soll
        // vorher einen Champions-Beleg dafuer haben.
        const genannt = ZUSTAENDE.some(z => LISTEN.some(f =>
            (z[f] || []).some(e => e.key === 'Spore')));
        assert.equal(genannt, BELEGT.has('Spore'),
            genannt ? 'Pilzspore steht wieder drin, ohne Champions-Beleg'
                    : 'Pilzspore ist jetzt belegt — sie darf wieder rein');
    });

    it('die Typ-Immunitäten sind echte Typen', () => {
        const TYPEN = new Set(['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice',
            'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock',
            'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']);
        for (const z of ZUSTAENDE) {
            for (const t of z.immunTypen) {
                assert.ok(TYPEN.has(t), `${z.id}: ${t} ist kein Typ`);
            }
        }
    });

    it('das Modul übersetzt jeden der 18 Typen', () => {
        const m = /var TYP_DE = \{([\s\S]*?)\};/.exec(JS_MODUL);
        assert.ok(m, 'TYP_DE nicht gefunden');
        const anzahl = [...m[1].matchAll(/[A-Z][a-z]+:/g)].length;
        assert.equal(anzahl, 18, `${anzahl} statt 18 Typen — einer fehlt oder ist doppelt`);
    });
});

describe('Statuszustände — der Weg dorthin', () => {
    it('der Unterreiter steht im HTML', () => {
        assert.match(HTML, /data-sq-view="status"/);
    });

    it('der Host steht im HTML und heißt nicht wie die Ladeanzeige', () => {
        assert.match(HTML, /id="sideQuestZustaendeHost"/);
        // #sideQuestStatus ist die Ladeanzeige der Teams-Ansicht. Wer den
        // Host so nennt, überschreibt sie — und sucht den Fehler lange.
        assert.ok(!/id="sideQuestStatusHost"/.test(HTML),
            'der Host darf nicht sideQuestStatusHost heißen');
        assert.match(HTML, /id="sideQuestStatus"/, 'die Ladeanzeige muss bleiben');
    });

    it('showView kennt die Ansicht und aktiviert sie', () => {
        assert.match(RESOURCES, /status:\s*'sideQuestZustaendeHost'/);
        assert.match(RESOURCES, /view === 'status'[\s\S]{0,120}sideQuestStatus\.activate/);
    });

    it('der Unterreiter bekommt eine Beschriftung', () => {
        assert.match(RESOURCES, /v === 'status' \? 'Status'/);
    });

    it('Skript und Stylesheet sind eingebunden', () => {
        assert.match(HTML, /src="js\/app-side-quest-status\.js\?v=/);
        assert.match(HTML, /href="css\/statuszustaende\.css\?v=/);
    });
});

describe('Statuszustände — Oberfläche', () => {
    it('deutsch und englisch führen dieselben Schlüssel', () => {
        const block = /var T = \{([\s\S]*?)\n    \};/.exec(JS_MODUL);
        assert.ok(block, 'Textblock T nicht gefunden');
        const teile = block[1].split(/\n\s{8}en: \{/);
        assert.equal(teile.length, 2, 'de- und en-Block nicht trennbar');
        const keys = s => [...s.matchAll(/^\s{12}([a-zA-Z]+):/gm)].map(m => m[1]).sort();
        const de = keys(teile[0]), en = keys(teile[1]);
        assert.ok(de.length > 15, `nur ${de.length} deutsche Schlüssel`);
        assert.deepEqual(de, en,
            'fehlt: ' + de.filter(k => !en.includes(k)).join(', ')
            + ' | zu viel: ' + en.filter(k => !de.includes(k)).join(', '));
    });

    it('keine Klasse beginnt mit dem Präfix, den Werbeblocker ausblenden', () => {
        const treffer = new Set();
        for (const [datei, quelle] of [['css', CSS], ['js', JS_MODUL]]) {
            for (const m of quelle.matchAll(/(?<![\w-])ad-[a-z]/g)) {
                treffer.add(datei + ': ' + quelle.slice(m.index, m.index + 18).split(/['"\s{,]/)[0]);
            }
        }
        assert.deepEqual([...treffer], [],
            'siehe test-admin-datenluecken.js — das hat schon einmal die Knöpfe gekostet');
    });

    it('jede gezeichnete Klasse hat eine Regel im Stilblatt', () => {
        const ausCss = new Set([...CSS.matchAll(/\.(sz-[a-z-]+)/g)].map(m => m[1]));
        const ausJs = new Set([...JS_MODUL.matchAll(/(?<![\w-])(sz-[a-z-]+)/g)].map(m => m[1]));
        assert.ok(ausCss.size > 20, `nur ${ausCss.size} Klassen im Stilblatt`);
        const gedeckt = k => ausCss.has(k) || ausCss.has(k.split('--')[0]);
        const ohne = [...ausJs].filter(k => !gedeckt(k));
        assert.deepEqual(ohne, [], 'gezeichnet, aber nirgends gestaltet: ' + ohne.join(', '));
    });

    it('meldet eine unlesbare Datei, statt leer auszusehen', () => {
        // Eine leere Seite liest sich wie "es gibt keine Statuszustände".
        assert.match(JS_MODUL, /_daten = 'fehler'/);
        assert.match(JS_MODUL, /_daten === 'fehler'/);
    });

    it('zeigt nie einen Rohschlüssel, wenn der deutsche Name fehlt', () => {
        // Der Rückfall ist der englische Name — der IST der Schlüssel und
        // damit lesbar. Ein leerer String wäre der Fehler.
        assert.match(JS_MODUL, /return topf\[schluessel\] \|\| schluessel;/);
    });
});
