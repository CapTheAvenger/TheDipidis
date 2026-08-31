/**
 * Admin — Datenlücken: der Weg hinein und der Rückkanal hinaus.
 *
 * WAS HIER SCHIEFGEHEN KANN
 *
 * 1. Der Bereich ist unerreichbar. Er steht bewusst in keinem Menü —
 *    #admin ist der EINZIGE Weg. Fehlt der Eintrag in HASH_ALIASES,
 *    steigt applyHash() wortlos aus (genau der Fehler, den
 *    test-tieflinks.js für #side-quest festgehalten hat), und der
 *    Bereich existiert praktisch nicht. Ohne Menüeintrag fällt das
 *    niemandem auf.
 *
 * 2. Der Rückkanal führt ins Leere. Der ganze Sinn der Seite ist der
 *    Knopf, der ein vorbefülltes GitHub-Issue öffnet. Fehlt darin die
 *    Kennung der Lücke, kommt ein Vorgang an, der nicht sagt, worum es
 *    geht — und das Nachtragen wird zum Raten.
 *
 * 3. Eine Sprachfassung verliert einen Schlüssel. Dann steht auf der
 *    englischen Seite `undefined` statt eines Satzes.
 *
 * Der Rückkanal wird ohne Browser geprüft: die beiden Adressbauer
 * werden aus der Quelle herausgeschnitten und einzeln ausgeführt.
 * `require` auf die Datei selbst ginge nicht — sie fasst beim Laden
 * `document` an.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const ADMIN = lies('js', 'app-admin.js');
const CSS = lies('css', 'admin.css');
const HTML = lies('index.html');
const INIT = lies('js', 'inline-init.js');
const CORE = lies('js', 'app-core.js');
const INVENTAR = JSON.parse(lies('data', 'datenluecken.json'));

/* Die beiden Adressbauer aus der Quelle schneiden und ausführbar
   machen — mitsamt der Konstante, auf die sie sich beziehen. */
function baueAdressen() {
    const basis = /var ISSUE_BASIS = '([^']+)';/.exec(ADMIN);
    assert.ok(basis, 'ISSUE_BASIS nicht gefunden');
    const einzeln = /function issueUrl\(l\) \{[\s\S]*?\n    \}/.exec(ADMIN);
    const sammel = /function issueUrlSammel\(liste\) \{[\s\S]*?\n    \}/.exec(ADMIN);
    assert.ok(einzeln, 'issueUrl nicht gefunden');
    assert.ok(sammel, 'issueUrlSammel nicht gefunden');
    const f = new Function(
        "var ISSUE_BASIS = '" + basis[1] + "';\n"
        + einzeln[0] + '\n' + sammel[0] + '\n'
        + 'return { issueUrl: issueUrl, issueUrlSammel: issueUrlSammel };'
    );
    return f();
}

const A = baueAdressen();

const BEISPIEL = {
    id: 'mega-faehigkeit/mega-raichu-y',
    klasse: 'mega-faehigkeit',
    titel: 'Raichu (Mega Y) — Mega-Fähigkeit fehlt',
    wo: 'data/champions_pokedex.json → entries[en=Mega Raichu Y].megaAbility',
    vorschlag: {
        wert: 'No Guard',
        quelle: 'https://pokebase.app/pokemon-champions/pokemon/raichu-mega-y',
        einstufung: 'mehrdeutig',
        begruendung: 'steht auch bei der Grundform',
        grundform: 'Raichu',
        basisFaehigkeiten: ['Lightning Rod', 'Static', 'No Guard', 'Electric Surge']
    }
};

describe('Admin — der Weg hinein', () => {
    it('#admin und #datenluecken führen auf den Reiter admin', () => {
        const tabelle = /const HASH_ALIASES = \{([\s\S]*?)\n    \};/.exec(INIT);
        assert.ok(tabelle, 'HASH_ALIASES nicht gefunden');
        const ohneKommentar = tabelle[1].replace(/^\s*\/\/.*$/gm, '');
        for (const schluessel of ['admin', 'datenluecken']) {
            const treffer = [...ohneKommentar.matchAll(
                new RegExp("^\\s*'" + schluessel + "':\\s*'([^']+)'", 'gm'))];
            assert.equal(treffer.length, 1,
                `#${schluessel} muss genau einmal in HASH_ALIASES stehen`);
            assert.equal(treffer[0][1], 'admin',
                `#${schluessel} zeigt auf ${treffer[0][1]} statt auf admin`);
        }
    });

    it('der Reiter existiert im HTML und hat seinen Behälter', () => {
        assert.match(HTML, /<div id="admin" class="tab-content">/);
        assert.match(HTML, /id="adminHost"/);
        assert.match(HTML, /id="adminTitel"/);
        assert.match(HTML, /id="adminZurueck"/);
    });

    it('Skript und Stylesheet sind eingebunden', () => {
        assert.match(HTML, /src="js\/app-admin\.js\?v=/);
        assert.match(HTML, /href="css\/admin\.css\?v=/);
    });

    it('switchTab zeichnet den Bereich beim Öffnen', () => {
        // Ohne diesen Zweig bleibt der Reiter leer, wenn man ihn
        // programmatisch aktiviert — genau der Fehler, den Side Quest
        // schon einmal hatte (app-core.js, 26.08.2026).
        assert.match(CORE, /case 'admin':[\s\S]{0,200}window\.DsAdmin/);
    });

    it('steht bewusst in keinem Menü', () => {
        // Kein Versehen, sondern die Entscheidung: der Bereich ist für
        // den Betreiber. Wenn hier jemand einen Menüknopf einbaut, soll
        // er das absichtlich tun und diesen Test mit anfassen.
        assert.ok(!/data-tab-id="admin"/.test(HTML),
            'Der Admin-Bereich hat einen Menüeintrag bekommen — Absicht?');
    });
});

describe('Admin — der Rückkanal', () => {
    it('die Adresse zeigt auf ein neues Issue im richtigen Repository', () => {
        const url = A.issueUrl(BEISPIEL);
        assert.ok(url.startsWith(
            'https://github.com/CapTheAvenger/TheDipidis/issues/new?'), url.slice(0, 80));
    });

    it('Titel und Rumpf tragen die Kennung der Lücke', () => {
        const u = new URL(A.issueUrl(BEISPIEL));
        assert.ok(u.searchParams.get('title').startsWith('[Datenlücke] '));
        const rumpf = u.searchParams.get('body');
        assert.ok(rumpf.includes('- Kennung: `' + BEISPIEL.id + '`'),
            'ohne lesbare Kennung im Rumpf ist der Vorgang nicht zuzuordnen');
        assert.ok(rumpf.includes('"id":"' + BEISPIEL.id + '"'),
            'die maschinenlesbare Zeile fehlt');
    });

    it('der Rumpf nennt Vorschlag, Quelle und Einstufung', () => {
        const rumpf = new URL(A.issueUrl(BEISPIEL)).searchParams.get('body');
        assert.ok(rumpf.includes('No Guard'));
        assert.ok(rumpf.includes(BEISPIEL.vorschlag.quelle));
        assert.ok(rumpf.includes('mehrdeutig'));
        assert.ok(rumpf.includes('Raichu'));
    });

    it('die Felder zum Ausfüllen stehen ganz oben, nicht unter dem Ballast', () => {
        const rumpf = new URL(A.issueUrl(BEISPIEL)).searchParams.get('body');
        assert.ok(rumpf.indexOf('Meine Prüfung') < rumpf.indexOf('Die Lücke'),
            'wer das Issue öffnet, soll zuerst das Eingabefeld sehen');
        assert.ok(rumpf.includes('Bestätigt (ja/nein):'));
        assert.ok(rumpf.includes('Quelle, die ich geprüft habe:'));
    });

    it('eine Lücke ohne Vorschlag bekommt trotzdem eine gültige Adresse', () => {
        const ohne = { id: 'bereich/statuszustaende', klasse: 'fehlender-bereich',
            titel: 'Statuszustände — Übersicht fehlt', wo: 'existiert nicht',
            vorschlag: null };
        const rumpf = new URL(A.issueUrl(ohne)).searchParams.get('body');
        assert.ok(rumpf.includes('bereich/statuszustaende'));
        assert.ok(rumpf.includes('Keiner'));
        assert.ok(rumpf.includes('"vorschlag":null'));
    });

    it('die Sammeladresse führt jede Kennung einzeln auf', () => {
        const liste = INVENTAR.luecken.filter(l => l.vorschlag && l.vorschlag.wert);
        assert.ok(liste.length > 1, 'Testvoraussetzung: mehr als ein Vorschlag');
        const rumpf = new URL(A.issueUrlSammel(liste)).searchParams.get('body');
        for (const l of liste) {
            assert.ok(rumpf.includes(l.id), `${l.id} fehlt in der Sammelbestätigung`);
        }
        assert.equal((rumpf.match(/- \[ \] /g) || []).length, liste.length,
            'jede Lücke braucht ihr eigenes Kästchen zum Abhaken');
    });

    it('Sonderzeichen im Titel überleben die Adresse', () => {
        // Umlaute und der Gedankenstrich sind harmlos — & und # sind es
        // nicht: ohne encodeURIComponent schneidet & den Titel ab und
        // hängt den Rest als eigenen Parameter an, # wirft alles
        // dahinter weg. Beides kommt in echten Titeln vor, sobald eine
        // Lücke "Typ & Fähigkeit" oder "#445" heißt.
        const gemein = Object.assign({}, BEISPIEL,
            { titel: 'Raichu & Pikachu — #26 Fähigkeit fehlt' });
        const u = new URL(A.issueUrl(gemein));
        assert.equal(u.searchParams.get('title'), '[Datenlücke] ' + gemein.titel);
        assert.equal(u.searchParams.get('labels'), 'datenluecke');
        assert.ok((u.searchParams.get('body') || '').includes(gemein.id),
            'der Rumpf darf am & nicht abreissen');
    });
});

describe('Admin — die Sprachfassungen', () => {
    it('deutsch und englisch führen dieselben Schlüssel', () => {
        const block = /var T = \{([\s\S]*?)\n    \};/.exec(ADMIN);
        assert.ok(block, 'Textblock T nicht gefunden');
        const teile = block[1].split(/\n\s{8}en: \{/);
        assert.equal(teile.length, 2, 'de- und en-Block nicht trennbar');
        const keys = s => [...s.matchAll(/^\s{12}([a-zA-Z]+):/gm)].map(m => m[1]).sort();
        const de = keys(teile[0]);
        const en = keys(teile[1]);
        assert.ok(de.length > 15, `nur ${de.length} deutsche Schlüssel gefunden`);
        assert.deepEqual(de, en,
            'fehlt: ' + de.filter(k => !en.includes(k)).join(', ')
            + ' | zu viel: ' + en.filter(k => !de.includes(k)).join(', '));
    });

    it('kein englischer Text steht in der deutschen Fassung', () => {
        const block = /var T = \{([\s\S]*?)\n    \};/.exec(ADMIN)[1];
        const deTeil = block.split(/\n\s{8}en: \{/)[0];
        for (const wort of [' the ', ' source ', 'Confirm', 'gaps']) {
            assert.ok(!deTeil.includes(wort),
                `"${wort}" steht in der deutschen Fassung`);
        }
    });
});

describe('Admin — der Werbeblocker-Fallstrick', () => {
    it('keine Klasse beginnt mit ad-', () => {
        // GEMESSEN am 31.08.2026 an der laufenden Seite: mit dem Präfix
        // `ad-` stand `.ad-btn` im Browser auf display:none — kein
        // Fehler im Stilblatt, sondern eine kosmetische Filterregel
        // jedes gängigen Werbeblockers. Betroffen waren die beiden
        // Knöpfe je Lücke, also genau der Zweck der Seite.
        //
        // Die lokale Messung hatte es NICHT gefunden, weil sie
        // Elemente mit Höhe 0 herausfilterte — ein display:none-Element
        // hat Höhe 0 und fiel damit durch dasselbe Sieb wie ein
        // Element, das gar nicht da ist. Deshalb steht die Regel jetzt
        // hier, wo sie ohne Browser hält.
        const treffer = new Set();
        for (const [datei, quelle] of [['css/admin.css', CSS], ['js/app-admin.js', ADMIN]]) {
            for (const m of quelle.matchAll(/(?<![\w-])ad-[a-z]/g)) {
                treffer.add(datei + ': ' + quelle.slice(m.index, m.index + 20).split(/['"\s{,]/)[0]);
            }
        }
        assert.deepEqual([...treffer], [],
            'Klassen mit dem Präfix ad- werden von Werbeblockern ausgeblendet');
    });

    it('das Stilblatt und das Modul benutzen denselben Präfix', () => {
        const ausCss = new Set([...CSS.matchAll(/\.(dl-[a-z-]+)/g)].map(m => m[1]));
        const ausJs = new Set([...ADMIN.matchAll(/(?<![\w-])(dl-[a-z-]+)/g)].map(m => m[1]));
        assert.ok(ausCss.size > 15, `nur ${ausCss.size} Klassen im Stilblatt`);
        // Jede Klasse, die das Modul zeichnet, muss im Stilblatt stehen —
        // sonst steht sie ohne Gestaltung auf der Seite. Eine Variante
        // wie dl-btn--still darf dabei auf die Regel ihrer Grundklasse
        // zurueckfallen; sie ist dann kein toter Name, sondern ein
        // Haken fuer spaeter.
        const gedeckt = k => ausCss.has(k) || ausCss.has(k.split('--')[0]);
        const ohneStil = [...ausJs].filter(k => !gedeckt(k) && !k.endsWith('-'));
        assert.deepEqual(ohneStil, [],
            'gezeichnet, aber nirgends gestaltet: ' + ohneStil.join(', '));
    });
});

describe('Admin — was die Seite über sich selbst sagt', () => {
    it('nennt den fehlenden Zugangsschutz beim Namen', () => {
        // Ein Bereich, der "Admin" heißt, weckt die Erwartung eines
        // Schutzes. Es gibt keinen. Das muss dastehen — sonst legt
        // jemand irgendwann etwas hier ab, was nicht öffentlich soll.
        assert.match(ADMIN, /offenHinweis:\s*'Nicht zugangsgeschützt/);
        assert.match(ADMIN, /offenHinweis:\s*'Not access-protected/);
    });

    it('sagt, dass sie selbst nichts ändert', () => {
        assert.ok(/lead:\s*'[^']*ändert keine Daten/.test(ADMIN));
        assert.ok(/lead:\s*'[^']*changes no data/.test(ADMIN));
    });

    it('meldet ein unlesbares Inventar, statt leer auszusehen', () => {
        // Eine leere Seite liest sich wie "keine Lücken" — und das wäre
        // eine Aussage, die wir nicht belegen können.
        assert.match(ADMIN, /_daten = 'fehler'/);
        assert.match(ADMIN, /_daten === 'fehler'/);
    });
});
