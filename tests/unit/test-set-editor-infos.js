/**
 * Der Set-Editor sagt jetzt, WAS die Dinge tun — nicht nur, wie sie heissen.
 *
 * ANLASS (Betreiber, 15.09.2026, mit drei Bildschirmfotos):
 *
 *   "bei den Stats sollten wir auch anzeigen was oft genutzt wird und dann
 *    kann man das waehlen […] die meist genutzten statusverteilungen mit
 *    prozentualer Nutzung wie bei den Attacken dort zur Auswahl stehen
 *
 *    Koennen wir beim Wesen auch aufzeigen was das macht? Es wird ja immer
 *    ein Wert gesenkt und einer erhoeht das zu sehen waere gut
 *
 *    Und bei den Attacken waere gut wenn man da sehen kann ob es eine Prio
 *    Attacke ist oder ob die sonst was cooles kann. […] Ich lerne gerade
 *    erst alles und brauche daher eine optimale Versorgung an Informationen"
 *
 * DIE TRENNLINIE, DIE DIESE DATEI BEWACHT.
 * Eine <option> kann keine Auszeichnung tragen, und am Telefon malt das
 * Betriebssystem die Auswahlliste selbst. Was beim WAEHLEN sichtbar sein
 * muss — die Wesenswirkung, der Vorrang —, hat deshalb nur einen Platz:
 * den Beschriftungstext der Option. Wandert es in eine Zeile darunter,
 * sieht der Nutzer es genau dann nicht, wenn er es braucht. Genau das
 * halten die Zusicherungen unten fest.
 *
 * Kommentare werden vor jeder Textsuche entfernt — sonst faellt die
 * Verfaelschungsprobe blind aus, weil die Erklaerung ueber der Regel
 * dieselben Woerter enthaelt wie die Regel (CLAUDE.md, "Dein eigener
 * Kommentar macht die Verfaelschungsprobe blind"). Das ist in diesem
 * Projekt schon dreimal passiert.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(lies(p));

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const BUILDER = ohneKommentare(lies('js/app-side-quest-builder.js'));
const CSS = ohneKommentare(lies('css/side-quest.css'));

/** Eine Funktion aus dem Builder herausschneiden, ohne den halben Browser. */
function funktion(name) {
    const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n    \\}');
    const m = BUILDER.match(re);
    assert.ok(m, `${name}() steht nicht mehr in js/app-side-quest-builder.js`);
    return m[0];
}

describe('Wesen: welcher Wert steigt, welcher faellt', () => {

    it('die Wirkung steht in der OPTION, nicht in einer Zeile darunter', () => {
        const fn = funktion('wesenZusatz');
        assert.match(fn, /\$\{wertKurz\(x\.up\)\} ↑ \$\{wertKurz\(x\.down\)\} ↓/,
            'Ohne Pfeile steht da nur ein zweiter Name und keine Wirkung.');
        assert.match(BUILDER, /spOptionen\(naturen, st\.nature, l, 'nature', wesenZusatz\)/,
            'wesenZusatz muss der Wesensauswahl UEBERGEBEN werden. Am Telefon '
            + 'malt das Betriebssystem die Liste; was beim Waehlen sichtbar '
            + 'sein soll, hat dort seinen einzigen Platz.');
    });

    it('ein neutrales Wesen bekommt keinen leeren Zusatz', () => {
        const fn = funktion('wesenZusatz');
        assert.match(fn, /if \(!x \|\| !x\.up \|\| !x\.down\) return '';/,
            'Gemessen am 15.09.2026: 9 von 3148 Wesenszeilen fuehren kein '
            + 'up/down. Ohne diese Zeile stuende dort " · ↑ ↓".');
    });

    it('die Reglerbeschriftung und die Wesenswirkung benutzen DIESELBEN Woerter', () => {
        // champions_usage.json schreibt "Sp. Atk", der Regler heisst SPA.
        // Stuenden beide Schreibweisen nebeneinander, muesste der Leser sie
        // erst zusammenbringen — genau das, was der Betreiber nicht will.
        const fn = funktion('wertKurz');
        assert.match(fn, /CN\.WERT_SCHLUESSEL\[bezeichnung\]/);
        assert.match(fn, /LABEL_DE : CSx\.LABEL/,
            'Die Kurzform muss aus derselben Tabelle kommen wie die Regler.');

        const CN = ladeNamen();
        const u = json('data/champions_usage.json');
        const werte = new Set();
        Object.values(u.pokemon).forEach(rec => {
            ['singles', 'doubles'].forEach(f => {
                ((rec[f] || {}).nature || []).forEach(n => {
                    if (n.up) werte.add(n.up);
                    if (n.down) werte.add(n.down);
                });
            });
        });
        assert.ok(werte.size > 0, 'keine Wesensdaten gefunden');
        const unbekannt = [...werte].filter(w => !CN.WERT_SCHLUESSEL[w]);
        assert.deepEqual(unbekannt, [],
            'Diese Bezeichnungen stehen in den Nutzungsdaten, aber nicht in '
            + 'WERT_SCHLUESSEL — sie erschienen im Editor unuebersetzt.');
    });
});

describe('Attacken: Vorrang beim Waehlen, der Rest darunter', () => {

    it('der Vorrang steht in der OPTION', () => {
        const fn = funktion('attackeZusatz');
        assert.match(fn, /\$\{l\.vorrang\}/,
            'Eine Vorrangattacke waehlt man WEGEN des Vorrangs — also muss er '
            + 'in der Liste stehen, nicht erst darunter.');
        assert.match(fn, /if \(!r \|\| !p\) return '';/,
            'Priority 0 ist der Normalfall (474 von 513 Attacken). Stuende '
            + '"Vorrang 0" bei jeder, saehe man den Vorrang nirgends mehr.');
        assert.match(BUILDER, /spOptionen\(b\.move, gewaehlt, l, 'moves', attackeZusatz\)/);
    });

    it('die Zeile darunter traegt Typ, Kategorie, Zahlen und Wirkung', () => {
        const fn = funktion('attackeZeile');
        for (const [teil, warum] of [
            [/l\.kat/, 'die Kategorie (Physisch/Speziell/Status)'],
            [/l\.staerke/, 'die Staerke'],
            [/l\.genauigkeit/, 'die Genauigkeit'],
            [/l\.ap/, 'die AP'],
            [/r\.spread/, 'die Flaechenwirkung'],
            [/de_effect/, 'der deutsche Wirkungstext'],
        ]) {
            assert.match(fn, teil, `Es fehlt: ${warum}`);
        }
        assert.match(fn, /if \(!r\) return '';/,
            'Ohne geladene Ressourcendatei muss eine LEERE Zeichenkette '
            + 'zurueckkommen, nicht ein leerer Kasten.');
    });

    it('bei einer Status-Attacke steht kein leerer Staerkewert', () => {
        const fn = funktion('attackeZeile');
        assert.match(fn, /if \(kraft > 0\) zahlen\.push/,
            '"Staerke —" steht da, wo nichts steht; die Marke "Status" '
            + 'daneben sagt dasselbe schon.');
    });

    it('die Zeile wird beim Wechsel der Attacke nachgezogen', () => {
        assert.match(BUILDER, /slot\.innerHTML = e\.target\.value \? attackeZeile\(e\.target\.value, lJetzt\) : ''/,
            'Ohne Nachzug stuenden unter dem Feld die Werte der VORIGEN '
            + 'Attacke — schlimmer als gar keine Werte.');
    });

    it('die Typmarke ist dieselbe wie im Pokédex, keine zweite', () => {
        const fn = funktion('attackeZeile');
        assert.match(fn, /class="sqp-type sq-play-type-/,
            'Ein Typ muss auf der ganzen Seite gleich aussehen.');
        assert.match(CSS, /\.sqp-type \{/, 'die geteilte Typmarke steht nicht mehr im CSS');
        assert.match(CSS, /\.sq-play-type-fire\s*\{/, 'die Typfarben stehen nicht mehr im CSS');
    });

    it('nur der Vorrang bekommt Farbe', () => {
        // Bekaemen alle Marken Farbe, waere die Zeile ein Streifenmuster
        // und nichts stuende mehr heraus. Der Vorrang ist der einzige Wert,
        // den der Betreiber namentlich genannt hat.
        const block = CSS.match(/\.sqb-mv-prio \{[^}]*\}/);
        assert.ok(block, '.sqb-mv-prio steht nicht mehr im CSS');
        assert.match(block[0], /background:/, 'der Vorrang traegt keine Fuellung mehr');
        const neutral = CSS.match(/\.sqb-mv-kat, \.sqb-mv-prio, \.sqb-mv-flaeche \{[^}]*\}/);
        assert.ok(neutral, 'die gemeinsame Grundregel der Marken fehlt');
        assert.doesNotMatch(neutral[0], /background:/,
            'Die Grundregel darf keine Fuellung setzen, sonst sind alle Marken bunt.');
    });
});

describe('Statuswertpunkte: die meistgespielten Verteilungen zur Auswahl', () => {

    it('die Auswahl steht ueber den Reglern, und die Regler bleiben', () => {
        assert.match(BUILDER, /verteilungOptionen\(b\.stat_points, st\.sp, l\)/,
            'Die Auswahl muss aus stat_points kommen — den echten '
            + 'Nutzungsdaten, nicht aus einer Liste im Code.');
        const i = BUILDER.indexOf('class="sqb-spread"');
        const j = BUILDER.indexOf('class="sqb-sp-grid"');
        assert.ok(i > -1 && j > -1 && i < j,
            'Die Auswahl gehoert UEBER die Regler; darunter waere sie eine '
            + 'Korrektur statt eines Vorschlags.');
    });

    it('jede Verteilung nennt ihren Nutzungsanteil', () => {
        const fn = funktion('verteilungOptionen');
        assert.match(fn, /x\.pct/,
            'Ohne Prozentangabe ist es eine Liste von Zahlen, keine Analyse — '
            + '"wie bei den Attacken" war die Vorgabe.');
        assert.match(fn, /replace\('\.', ','\)/, 'deutsches Dezimalkomma wie ueberall sonst');
    });

    it('der Wert einer Option sind die PUNKTE, nicht ein Listenplatz', () => {
        const fn = funktion('verteilungOptionen');
        // BLINDER FLECK, gefunden von der Verfaelschungsprobe am 15.09.2026:
        // die erste Fassung suchte nur nach "JSON.stringify(CSx.KEYS.map" —
        // und das steht in DERSELBEN Funktion noch ein zweites Mal, fuer den
        // Vergleich mit dem aktuellen Stand. Die Probe ersetzte die richtige
        // Zeile, und der Test blieb gruen. Gesucht wird deshalb die
        // Zuweisung an `wert`, nicht der Ausdruck irgendwo.
        assert.match(fn, /const wert = JSON\.stringify\(CSx\.KEYS\.map\(k => punkte\[k\]\)\);/,
            'Ein Index waere an die Reihenfolge der Liste gebunden, und die '
            + 'kommt woechentlich neu aus dem Scraper. Nach dem naechsten Lauf '
            + 'stuende hinter demselben Index eine andere Verteilung.');
        assert.match(fn, /value="\$\{escapeHtml\(wert\)\}"/,
            'und dieser Wert muss auch wirklich am <option> haengen');
    });

    it('beide Richtungen sind verdrahtet', () => {
        assert.match(BUILDER, /spreadSel\.addEventListener\('change'/,
            'Auswahl -> Regler fehlt');
        assert.match(BUILDER, /verteilungAbgleichen\(\);/,
            'Regler -> Auswahl fehlt. Ohne das stuende oben weiter der Name '
            + 'einer Verteilung, die gar nicht mehr eingestellt ist.');
        const fn = funktion('verteilungAbgleichen');
        assert.match(fn, /spreadSel\.value = treffer \? treffer\.value : '';/);
    });

    it('"Eigene Verteilung" aendert nichts', () => {
        assert.match(BUILDER, /if \(!spreadSel\.value\) return;/,
            'Wer zurueck auf "Eigene Verteilung" stellt, will seine Regler '
            + 'behalten — nicht auf null gesetzt bekommen.');
    });

    it('jedes Pokémon der Nutzungsdaten hat etwas zur Auswahl', () => {
        const u = json('data/champions_usage.json');
        const ohne = [];
        Object.entries(u.pokemon).forEach(([slug, rec]) => {
            const sp = ((rec.doubles || {}).stat_points) || [];
            if (!sp.length) ohne.push(slug);
        });
        // Der Editor liest den Doppelkampf-Block (block2). Ein Pokémon ohne
        // Verteilungen bekommt gar keine Auswahl gezeigt — das ist gewollt
        // und faellt hier nur auf, wenn es ploetzlich viele werden.
        assert.ok(ohne.length < Object.keys(u.pokemon).length * 0.15,
            `${ohne.length} von ${Object.keys(u.pokemon).length} Pokémon haben `
            + `keine Verteilungen im Doppelkampf-Block: ${ohne.slice(0, 8).join(', ')}`);
    });
});

describe('Die Werte kommen aus den Daten, nicht aus dem Code', () => {

    it('champions_resources.json fuehrt alles, was die Zeile zeigt', () => {
        const r = json('data/champions_resources.json');
        const mv = r.entries.filter(e => e.cat === 'move');
        assert.ok(mv.length > 400, `nur ${mv.length} Attacken`);
        const fehlend = mv.filter(e => e.de_effect === undefined || e.priority === undefined
            || e.power === undefined || e.damage_class === undefined || e.type === undefined);
        assert.deepEqual(fehlend.map(e => e.en), [],
            'Diesen Attacken fehlt ein Feld, das der Editor anzeigt.');
        const mitVorrang = mv.filter(e => Number(e.priority));
        assert.ok(mitVorrang.length > 20,
            `nur ${mitVorrang.length} Attacken mit Vorrang — die Anzeige waere `
            + 'dann sinnlos. Gemessen am 15.09.2026: 39.');
    });

    it('der Builder laedt die Datei und faellt weich, wenn sie fehlt', () => {
        assert.match(BUILDER, /const RES_URL = 'data\/champions_resources\.json';/);
        const fn = funktion('loadRes');
        assert.match(fn, /catch \(err\)/,
            'Faellt die Datei aus, muss der Editor bleiben wie vorher — '
            + 'ohne Zusatzzeilen, aber bedienbar.');
        assert.match(BUILDER, /load\(\), loadDe\(\), loadDex\(\), loadRes\(\),/,
            'Ohne den gemeinsamen Wurf zeichnet der Editor einmal ohne Werte '
            + 'und erst der zweite Aufbau mit.');
    });

    it('die Typtabelle steht an EINER Stelle', () => {
        const CN = ladeNamen();
        assert.equal(Object.keys(CN.TYPEN_DE).length, 18, 'es gibt 18 Typen');
        assert.equal(CN.TYPEN_DE.Bug, 'Käfer');
        assert.equal(CN.WERT_SCHLUESSEL['Sp. Atk'], 'spa');
        assert.match(BUILDER, /CN\.TYPEN_DE\[r\.type\]/,
            'Der Builder muss die geteilte Tabelle benutzen und keine eigene '
            + 'Kopie anlegen — davon gibt es im Projekt schon fuenf.');
    });
});

function ladeNamen() {
    const ctx = { window: { getLang: () => 'de' }, fetch: async () => { throw new Error('offline'); }, console };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(lies('js/champions-namen.js'), ctx);
    return ctx.window.ChampionsNamen;
}
