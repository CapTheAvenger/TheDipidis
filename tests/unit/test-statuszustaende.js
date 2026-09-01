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

/* ─────────────────────────────────────────────────────────────────────
 * Statuswert-Stufen (01.09.2026)
 *
 * Vom Betreiber angefragt: „'...steigt': +1 Stufe (+50 % / 150 %) ·
 * '...steigt stark': +2 (200 %) · '...steigt drastisch': +3 (250 %)" —
 * die Formulierungen stehen in zwanzig Attackentexten, die Zahlen
 * dahinter standen nirgends.
 *
 * Was hier schiefgehen kann, und zwar still:
 *
 * 1. Eine Zahl in der Tabelle stimmt nicht mit der Formel überein. Eine
 *    handgetippte Prozentspalte ist genau die Stelle, an der aus 66,7
 *    irgendwann 65 wird. Deshalb wird jede Zeile NACHGERECHNET, nicht
 *    verglichen.
 * 2. Die Wortstufen rutschen. „steigt stark" ist +2, nicht +3 — wer das
 *    verwechselt, macht aus einer Verdopplung eine Verzweieinhalbfachung.
 * 3. Die Tabelle wird gebaut, aber nicht gezeigt.
 * ──────────────────────────────────────────────────────────────────── */

describe('Statuswert-Stufen: die Zahlen', () => {
    const ST = DATEN.stufen;

    it('es gibt sie, und zwar von -6 bis +6 ohne Lücke', () => {
        assert.ok(ST && Array.isArray(ST.tabelle), 'kein stufen.tabelle in den Daten');
        const stufen = ST.tabelle.map(z => z.stufe);
        assert.deepEqual(stufen, [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6],
            'Reihenfolge oder Umfang stimmen nicht: ' + stufen.join(', '));
    });

    it('jede Zeile folgt der Hauptreihen-Formel — nachgerechnet, nicht abgeschrieben', () => {
        // Erhöhung (2+n)/2, Senkung 2/(2-n). Beide Quellen im _meta
        // nennen dieselbe Tabelle; hier wird sie unabhängig erzeugt.
        for (const z of ST.tabelle) {
            const n = z.stufe;
            const soll = n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
            assert.ok(Math.abs(z.faktor - soll) < 1e-6,
                `Stufe ${n}: Faktor ${z.faktor} statt ${soll.toFixed(4)}`);
            const [za, ne] = z.bruch.split('/').map(Number);
            assert.ok(Math.abs(za / ne - soll) < 1e-6,
                `Stufe ${n}: Bruch ${z.bruch} ergibt nicht ${soll.toFixed(4)}`);
            // Beide Sprachfassungen, und beide gegen die Formel.
            for (const feld of ['prozent_de', 'prozent_en']) {
                assert.ok(z[feld], `Stufe ${n}: ${feld} fehlt`);
                const pct = Number(z[feld].replace(' %', '').replace(',', '.'));
                assert.ok(Math.abs(pct - soll * 100) < 0.06,
                    `Stufe ${n}: "${z[feld]}" passt nicht zu ${(soll * 100).toFixed(1)} %`);
            }
            /* BEFUND (Review 01.09.2026): es gab nur EIN Prozentfeld, mit
               deutschem Dezimalkomma — die englische Oberflaeche zeigte
               "66,7 %". Deutsch schreibt Komma, Englisch Punkt. */
            assert.ok(!z.prozent_en.includes(','), `Stufe ${n}: englisch mit Komma`);
            if (z.prozent_de !== z.prozent_en) {
                assert.ok(z.prozent_de.includes(','), `Stufe ${n}: deutsch ohne Komma`);
            }
        }
    });

    it('die vier Zahlen aus der Anfrage stehen genau so da', () => {
        // Der Abgleich gegen das, was der Betreiber geschrieben hat.
        const bei = (n) => ST.tabelle.find(z => z.stufe === n).prozent_de;
        assert.equal(bei(1), '150 %');
        assert.equal(bei(2), '200 %');
        assert.equal(bei(3), '250 %');
        assert.equal(bei(6), '400 %');
        assert.equal(bei(-2), '50 %');
        assert.equal(bei(-3), '40 %');
        assert.equal(bei(-6), '25 %');
        // 2/3 sind 66,7 % — der Betreiber schrieb 66 %. Gerundet wird
        // auf eine Nachkommastelle, weil 66 % die Zahl kleiner macht,
        // als sie ist.
        assert.equal(bei(-1), '66,7 %');
    });

    it('die Wortstufen sitzen auf den richtigen Zahlen', () => {
        const wort = (n) => ST.tabelle.find(z => z.stufe === n).wort_de;
        assert.equal(wort(1), 'steigt');
        assert.equal(wort(2), 'steigt stark');
        assert.equal(wort(3), 'steigt drastisch');
        assert.equal(wort(-1), 'sinkt');
        assert.equal(wort(-2), 'sinkt stark');
        assert.equal(wort(-3), 'sinkt drastisch');
        assert.equal(wort(0), '', 'die Nullzeile darf keine Meldung tragen');
        // Ab drei Stufen bleibt es bei "drastisch" — es gibt kein
        // eigenes Wort für +4, +5, +6.
        for (const n of [4, 5, 6]) assert.equal(wort(n), 'steigt drastisch');
        for (const n of [-4, -5, -6]) assert.equal(wort(n), 'sinkt drastisch');
        // Und in beiden Sprachen.
        for (const z of ST.tabelle) {
            assert.equal(!!z.wort_de, !!z.wort_en,
                `Stufe ${z.stufe}: eine Sprache hat eine Meldung, die andere nicht`);
        }
        /* BEFUND (Review 01.09.2026): die englischen Fassungen lauteten
           "fell harshly" / "fell severely". Der Simulator selbst schreibt
           die Woerter andersherum — data/text/default.ts, unboost2:
           "{POKEMON}'s {STAT} harshly fell!". Wir behaupten in der Spalte,
           das sei die Meldung im Kampf; dann muss sie es auch sein. */
        const en = (n) => ST.tabelle.find(z => z.stufe === n).wort_en;
        assert.equal(en(-2), 'harshly fell');
        assert.equal(en(-3), 'severely fell');
        assert.equal(en(2), 'rose sharply');
        assert.equal(en(3), 'rose drastically');
    });

    it('keine Zahl ohne Quelle — die Projektregel gilt auch hier', () => {
        const m = ST._meta || {};
        assert.ok(Array.isArray(m.quellen) && m.quellen.length >= 2,
            'weniger als zwei Quellen: eine allein hat schon einmal danebengelegen');
        m.quellen.forEach(q => {
            assert.match(q.url, /^https:\/\//, 'Quelle ohne Adresse: ' + q.name);
            assert.match(q.gelesen_am, /^\d{4}-\d{2}-\d{2}$/, 'Quelle ohne Lesedatum: ' + q.name);
        });
        assert.match(m.formel, /2 \+ Stufe/, 'die Formel steht nicht bei den Daten');
        // Und der ehrliche Vorbehalt: Genauigkeit und Fluchtwert folgen
        // einer ANDEREN Tabelle. Wer das wegloescht, druckt falsche Zahlen.
        assert.match(m.ausnahme_de, /Genauigkeit und Fluchtwert/);
        assert.match(m.ausnahme_en, /[Aa]ccuracy and evasion/);
        assert.match(m.geltung, /Champions/,
            'es fehlt der Hinweis, dass die Zahlen aus der Hauptreihe stammen');
    });
});

describe('Statuswert-Stufen: die Anzeige', () => {
    it('die Tabelle wird gebaut UND eingehängt', () => {
        assert.match(JS_MODUL, /function stufenHtml\(\)/, 'kein Renderer');
        assert.match(JS_MODUL, /\+ stufenHtml\(\);/,
            'die Tabelle wird gebaut, aber nie in die Seite gehängt');
    });

    it('sie wird wirklich aus den Daten erzeugt — ausgeführt, nicht gelesen', () => {
        // Der Renderer wird geschnitten und mit den echten Daten
        // gefahren. Ein Test, der nur den Quelltext liest, hätte eine
        // vertauschte Spalte nicht bemerkt.
        const start = JS_MODUL.indexOf('function stufenHtml()');
        const ende = JS_MODUL.indexOf('\n    }', start);
        const quelle = JS_MODUL.slice(start, ende + 6);
        const fn = new Function('_daten', 't', 'de', 'esc', quelle + '\nreturn stufenHtml;')(
            DATEN,
            () => ({
                stufenTitel: 'Statuswert-Stufen', stufenLead: 'L', stufeSp: 'Stufe',
                faktorSp: 'Faktor', wertSp: 'Bleibt', meldungSp: 'Meldung',
                stufenGrenze: 'G', stufenAusnahme: 'A', stufenGilt: 'GG',
                stufenMeldung: 'M',
                grund: 'unverändert', quelleLabel: 'Regeln von',
            }),
            () => true,
            (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
                { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        );
        const html = fn();
        assert.match(html, /<table class="sz-stufen-tabelle">/);
        // Dreizehn Zeilen, jede genau einmal.
        assert.equal((html.match(/class="sz-stufe-zeile/g) || []).length, 13);
        // Die Zahlen aus der Anfrage stehen im erzeugten Markup.
        for (const p of ['150 %', '200 %', '250 %', '400 %', '66,7 %', '50 %', '40 %', '25 %']) {
            assert.ok(html.includes(p), `${p} fehlt in der gerenderten Tabelle`);
        }
        assert.ok(html.includes('steigt stark') && html.includes('sinkt drastisch'));
        // Vorzeichen: +2 muss als "+2" dastehen, nicht als "2".
        assert.match(html, />\+2</);
        assert.match(html, />-2</);
        // Der Vorbehalt und die Quellen reisen mit.
        assert.ok(html.includes('Regeln von'));
        /* BEFUND (Review 01.09.2026): die Spalte behauptete "Die Meldung
           im Kampf lautet" fuer JEDE Zeile. Die Meldung richtet sich aber
           nach der ANZAHL verschobener Stufen, nicht nach der erreichten
           Stufe — vom Grundwert aus dasselbe, sonst nicht. Der Hinweis
           dazu muss mitkommen, sonst behauptet die Tabelle zu viel. */
        assert.ok(html.includes('>M<'), 'der Bezug der Meldung fehlt');
        assert.match(html, /pokewiki\.de/);
        // Und nichts Rohes.
        assert.ok(!/undefined|NaN|\[object/.test(html), html.slice(0, 300));
    });

    it('die englische Fassung zeigt englische Zahlen', () => {
        /* Der Renderer muss die Sprache wirklich AUSWERTEN. Die Pruefung
           oben faehrt ihn nur auf Deutsch — mit `esc(z.prozent_de)` waere
           sie gruen geblieben, und die englische Oberflaeche haette
           weiter "66,7 %" gezeigt. Also derselbe Renderer, andere
           Sprache. */
        const start = JS_MODUL.indexOf('function stufenHtml()');
        const ende = JS_MODUL.indexOf('\n    }', start);
        const quelle = JS_MODUL.slice(start, ende + 6);
        const bau = (deutsch) => new Function('_daten', 't', 'de', 'esc', quelle + '\nreturn stufenHtml;')(
            DATEN,
            () => ({ stufenTitel: 'T', stufenLead: 'L', stufeSp: 'S', faktorSp: 'F',
                     wertSp: 'W', meldungSp: 'M', stufenGrenze: 'G', stufenAusnahme: 'A',
                     stufenGilt: 'GG', stufenMeldung: 'MM', grund: '-', quelleLabel: 'Q' }),
            () => deutsch,
            (x) => String(x == null ? '' : x))();
        const en = bau(false), deHtml = bau(true);
        assert.ok(en.includes('66.7 %'), 'englisch zeigt kein 66.7 % — die Sprache wird ignoriert');
        assert.ok(!en.includes('66,7 %'), 'englisch zeigt ein deutsches Komma');
        assert.ok(deHtml.includes('66,7 %'), 'deutsch zeigt kein Komma');
        // Und die Meldungen wechseln mit.
        assert.ok(en.includes('harshly fell') && !en.includes('sinkt stark'));
        assert.ok(deHtml.includes('sinkt stark') && !deHtml.includes('harshly fell'));
    });

    it('ohne Daten bleibt sie leer statt halb', () => {
        const start = JS_MODUL.indexOf('function stufenHtml()');
        const ende = JS_MODUL.indexOf('\n    }', start);
        const quelle = JS_MODUL.slice(start, ende + 6);
        const bau = (daten) => new Function('_daten', 't', 'de', 'esc', quelle + '\nreturn stufenHtml;')(
            daten, () => ({}), () => true, (s) => String(s));
        assert.equal(bau(null)(), '');
        assert.equal(bau({})(), '');
        assert.equal(bau({ stufen: { tabelle: [] } })(), '');
    });

    it('die Tabelle ist gestylt, ohne feste Farben und ohne Grün gegen Rot', () => {
        assert.match(CSS, /\.sz-stufen-tabelle/, 'kein CSS für die Tabelle');
        const block = CSS.slice(CSS.indexOf('/* ── Statuswert-Stufen'),
                                CSS.indexOf('/* ── Schmal'));
        // Kommentare zählen nicht mit: die Begründung NENNT den geerbten
        // Verlauf (#1a1a2e), gegen den hier angeschrieben wird.
        const ohne = block.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.ok(!/#[0-9a-f]{3,6}/i.test(ohne), 'feste Farbe im Stufen-Block');
        // Richtung über die divergierende Skala, nicht über Grün/Rot.
        assert.match(ohne, /var\(--dv-pos\)/);
        assert.match(ohne, /var\(--dv-neg\)/);
        assert.ok(!/green|--gut\b/i.test(ohne));
    });

    it('der Spaltenkopf bringt seine eigene Fläche mit', () => {
        /* BEFUND (Review 01.09.2026): css/styles.css malt auf JEDES
           `table thead` einen dunklen Verlauf mit weisser Schrift. Diese
           Tabelle setzte nur die Textfarbe und erbte den Grund — gemessen
           standen die Spaltenköpfe im Hellmodus bei 2,0:1 bis 2,5:1
           statt der geforderten 4,5:1. Im Dunkelmodus fiel es nicht auf,
           weil dort zufällig beides dunkel ist. Genau die Sorte Fehler,
           die eine Woche steht. */
        const kopf = CSS.slice(CSS.indexOf('.sz-stufen-tabelle thead th'));
        const block = kopf.slice(0, kopf.indexOf('}'));
        assert.match(block, /background:\s*var\(--/,
            'der Spaltenkopf erbt wieder den dunklen Verlauf aus styles.css');
        /* Und kein nowrap: table-layout ist fixed, vier Spalten teilen
           sich 640px, die deutschen Überschriften brauchen mehr. Gemessen
           lief "Die Meldung im Kampf lautet" in die Nachbarspalte. */
        assert.ok(!/white-space:\s*nowrap/.test(block),
            'die Spaltenköpfe dürfen nicht mehr umbrechen — sie werden abgeschnitten');
    });

    it('auf dem Telefon scrollt sie, statt die Seite zu sprengen', () => {
        assert.match(JS_MODUL, /mobile-table-scroll/,
            'die Tabelle steht ohne Scrollkasten — bei 390px läuft sie über');
    });
});
