/**
 * N2 und N3 — zwei Tieflinks, die ins Nichts fuehrten.
 *
 * GEMESSEN AM 07.09.2026, im Browser (Chromium, playwright, lokal
 * ausgeliefertes index.html), jeder Aufruf aus einer anderen Ansicht:
 *
 *   von #tutorial aus:
 *     #hub             -> Reiter meta-analysis-hub      richtig
 *     #uebersicht      -> Reiter meta-analysis-hub      richtig
 *     #overview        -> Reiter tutorial, Hash #overview   FALSCH
 *
 *   von #hub aus:
 *     #quellen-begriffe -> Reiter quellen, qu-begriffe offen  richtig
 *     #quellen-umfang   -> Reiter meta-analysis-hub           FALSCH
 *
 * BEIDE URSACHEN SIND DIESELBE FORM: ein Eintrag stand in der falschen
 * Tabelle oder gar nicht. applyHash() liest zuerst HASH_ALIASES und
 * steigt bei `if (!tabId) return` wortlos aus. Alles, was nur weiter
 * unten steht (PROFILE_SUBTAB_FOR_HASH, die Abschnitts-Weissliste),
 * erreicht dann keine Zeile Code mehr.
 *
 *   N2: 'hub'/'uebersicht'/'overview' standen in
 *       PROFILE_SUBTAB_FOR_HASH — einer Tabelle fuer PROFIL-Untertabs,
 *       die nur gelesen wird, wenn der Reiter 'profile' ist. 'hub' und
 *       'uebersicht' funktionierten trotzdem, weil sie ZUSAETZLICH in
 *       HASH_ALIASES standen. 'overview' nicht.
 *   N3: der Abschnitt "Umfang" (js/app-quellen.js) bekam am 02.09.2026
 *       die Kennung `umfang`; weder die Aliastabelle noch die
 *       Weissliste in js/inline-init.js wurden mitgezogen. Zwei Listen,
 *       die dasselbe behaupten, laufen auseinander.
 *
 * Gepruef wird deshalb nicht "der eine fehlende Eintrag", sondern die
 * REGEL, aus der er folgt — sonst faengt der naechste Abschnitt
 * denselben Fehler wieder ein.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sandkasten } = require('./lib-tieflink-sandkasten.js');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'inline-init.js'), 'utf8');
const QUELLEN = fs.readFileSync(path.join(ROOT, 'js', 'app-quellen.js'), 'utf8');

function tabelle(name) {
    const m = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n    \\};').exec(SRC);
    assert.ok(m, name + ' nicht gefunden');
    return m[1];
}

function eintraege(body) {
    const ohne = body.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return Object.fromEntries(
        [...ohne.matchAll(/^\s*'([^']+)':\s*'([^']+)'/gm)].map(m => [m[1], m[2]]));
}

const ALIAS = eintraege(tabelle('HASH_ALIASES'));
const UNTER = eintraege(tabelle('PROFILE_SUBTAB_FOR_HASH'));

describe('N2 — die Kachelseite hat drei Kurzformen, alle in derselben Tabelle', () => {
    it('#hub, #uebersicht und #overview stehen in HASH_ALIASES', () => {
        for (const k of ['hub', 'uebersicht', 'overview']) {
            // V2-15 (07.10.2026): die Kachelseite ist weg, alle drei fuehren auf die Startseite.
            assert.strictEqual(ALIAS[k], 'current-meta',
                '#' + k + ' loest keinen Reiter auf — applyHash() steigt bei '
                + '`if (!tabId) return` aus, und die falsche Adresse bleibt stehen');
        }
    });

    it('und keine von ihnen in der Profil-Untertab-Tabelle', () => {
        for (const k of ['hub', 'uebersicht', 'overview']) {
            assert.ok(!(k in UNTER),
                '"' + k + '" ist kein Profil-Untertab. Ein Eintrag dort wird nur '
                + 'gelesen, wenn HASH_ALIASES den Reiter "profile" ergeben hat — '
                + 'er sieht aus wie eine Zuordnung und ist keine.');
        }
    });

    it('jeder Schluessel der Profil-Untertab-Tabelle zeigt in HASH_ALIASES auf "profile"', () => {
        // Die Regel hinter N2, in beide Richtungen geprueft: diese Tabelle
        // beantwortet ausschliesslich die Anschlussfrage "welcher
        // Profil-Untertab". Steht dort ein Schluessel, der gar nicht ins
        // Profil fuehrt, ist er wirkungslos — genau der Fall 'overview'.
        const falsch = Object.keys(UNTER).filter(k => ALIAS[k] !== 'profile');
        assert.deepStrictEqual(falsch, []);
    });
});

describe('N3 — jeder Abschnitt in Quellen & Methodik ist verlinkbar', () => {
    // Die Kennungen aus der Quelle selbst, nicht abgeschrieben.
    const KENNUNGEN = [...new Set(
        [...QUELLEN.matchAll(/^\s*id:\s*'([a-z]+)'/gm)].map(m => m[1]))];

    it('es gibt ueberhaupt Abschnitte zu pruefen', () => {
        assert.ok(KENNUNGEN.includes('quellen') && KENNUNGEN.includes('umfang'),
            'die Abschnittsliste in js/app-quellen.js wurde nicht erkannt: '
            + JSON.stringify(KENNUNGEN));
    });

    it('jede Abschnittskennung hat einen Alias "quellen-<id>"', () => {
        const fehlen = KENNUNGEN.filter(id => ALIAS['quellen-' + id] !== 'quellen');
        assert.deepStrictEqual(fehlen, [],
            'ohne Alias oeffnet der Verweis weder den Reiter noch den Abschnitt');
    });

    it('jede Abschnittskennung steht in der Weissliste von applyHash()', () => {
        const m = /const ABSCHNITTE = \{([\s\S]*?)\};/.exec(SRC);
        assert.ok(m, 'die Weissliste ABSCHNITTE gibt es nicht mehr');
        const weiss = [...m[1].matchAll(/([a-z]+):\s*1/g)].map(x => x[1]);
        const fehlen = KENNUNGEN.filter(id => !weiss.includes(id));
        assert.deepStrictEqual(fehlen, [],
            'der Reiter oeffnet, der Abschnitt bleibt zu — und niemand merkt, '
            + 'dass der Verweis nicht ankam');
    });

    it('app-quellen.js gibt die Liste heraus, damit es keine Zweitschrift braucht', () => {
        assert.match(QUELLEN, /window\.Quellen = \{[^}]*\bids:\s*ids\b/,
            'Quellen.ids() ist weg — dann ist die Weissliste in inline-init.js '
            + 'wieder eine von Hand gefuehrte Zweitschrift, und genau daran ist '
            + '#quellen-umfang gescheitert');
    });

    /* M5 (ueberlebende Mutation, Abnahme 07.09.2026): hier stand
       `assert.match(SRC, /window\.Quellen\.ids === 'function'/)`. Die
       Zusicherung prueft nur, dass die Zeichenkette im QUELLTEXT steht.
       `if (false && typeof window.Quellen.ids === 'function')` laesst sie
       stehen und schaltet die Abfrage trotzdem ab — die Mutation hat beide
       vollen Suiten ueberlebt. Ersetzt durch zwei Zusicherungen, die den
       Block AUSFUEHREN: eine Kennung, die es nur in ids() gibt, muss
       aufgehen, und eine, die dort fehlt, darf nicht aufgehen. Beide
       Richtungen zusammen belegen, dass ids() die Weissliste bestimmt und
       nicht die Aufzaehlung im Code. */
    it('applyHash() fragt die Abschnittsliste zur Laufzeit bei der Quelle ab', () => {
        const offen = [];
        const s = sandkasten({
            hash: '#hub',
            quellen: { open: id => offen.push(id), ids: () => ['neuerabschnitt'] }
        });
        s.start();
        s.gehZu('#quellen-neuerabschnitt');
        assert.deepStrictEqual(offen, ['neuerabschnitt'],
            'die Kennung steht nur in Quellen.ids(), nicht in der Aufzaehlung '
            + 'ABSCHNITTE — sie kann nur aufgehen, wenn ids() wirklich gerufen '
            + 'wird. Gesehen: ' + JSON.stringify(offen));
    });

    it('und die Aufzaehlung im Code sticht die Liste aus der Quelle nicht aus', () => {
        const offen = [];
        const s = sandkasten({
            hash: '#hub',
            quellen: { open: id => offen.push(id), ids: () => ['quellen'] }
        });
        s.start();
        s.gehZu('#quellen-umfang');   // steht in ABSCHNITTE, aber nicht in ids()
        assert.deepStrictEqual(offen, [''],
            'die Weissliste kommt wieder aus der Zweitschrift im Code statt aus '
            + 'js/app-quellen.js — genau die Konstruktion, an der #quellen-umfang '
            + 'gescheitert ist');
    });

    it('faellt die Liste aus, traegt die Aufzaehlung im Code weiter', () => {
        // Die Rueckfallebene ist der Grund, warum ABSCHNITTE noch dasteht:
        // eine aeltere zwischengespeicherte app-quellen.js hat kein ids().
        const offen = [];
        const s = sandkasten({
            hash: '#hub',
            quellen: { open: id => offen.push(id) }
        });
        s.start();
        s.gehZu('#quellen-umfang');
        assert.deepStrictEqual(offen, ['umfang']);
    });
});
