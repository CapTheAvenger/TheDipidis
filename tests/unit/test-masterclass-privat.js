/* test-masterclass-privat.js — private Masterclasses (17.10.2026).
 *
 * Zusicherung: Eine private Masterclass kommt NUR aus
 * users/{uid}/masterclasses des angemeldeten Kontos, nie aus einer Datei
 * im Repo, und wird in einem iframe ohne allow-same-origin gezeigt.
 * Geprueft wird am Verhalten: js/ds-masterclass.js laeuft komplett in
 * einer vm mit Attrappen fuer window, document, auth und db.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const JS = fs.readFileSync(path.join(WURZEL, 'js', 'ds-masterclass.js'), 'utf8');

function umgebung(user, docs, fehler) {
    const pfade = [];
    const db = {
        collection: (a) => ({ doc: (uid) => ({ collection: (b) => ({
            get: () => {
                pfade.push(a + '/' + uid + '/' + b);
                if (fehler) return Promise.reject(new Error('permission-denied'));
                return Promise.resolve({ forEach: (fn) => docs.forEach((d) => fn({ id: d.id, data: () => d.data })) });
            }
        }) }) })
    };
    const window = {
        auth: { currentUser: user, onAuthStateChanged: () => {} },
        db,
        addEventListener: () => {},
        getLang: () => 'de'
    };
    const document = { addEventListener: () => {}, getElementById: () => null };
    const ktx = { window, document, console: { warn: () => {}, log: () => {} }, Promise, Set, NodeFilter: {} };
    vm.createContext(ktx);
    vm.runInContext(JS, ktx);
    return { mc: window.DsMasterclass, pfade };
}

test('ohne Anmeldung gibt es keine privaten Masterclasses und keinen Abruf', async () => {
    const { mc, pfade } = umgebung(null, [{ id: 'x', data: { html: '<p>x</p>' } }]);
    const liste = await mc._holePrivat();
    assert.strictEqual(liste.length, 0);
    assert.strictEqual(pfade.length, 0);
});

test('angemeldet: gelesen wird genau users/<eigene uid>/masterclasses', async () => {
    const { mc, pfade } = umgebung({ uid: 'U1' }, [
        { id: 'mega-tohaido', data: { titel: 'Mega-Tohaido-ex', html: '<p>Inhalt</p>', autor: 'A' } },
        { id: 'leer', data: { titel: 'ohne Inhalt' } }
    ]);
    const liste = await mc._holePrivat();
    assert.strictEqual(pfade.join('|'), 'users/U1/masterclasses');
    assert.strictEqual(liste.length, 1, 'ein Dokument ohne html darf keine Kachel ergeben');
    assert.strictEqual(liste[0].id, 'privat-mega-tohaido');
    assert.strictEqual(liste[0].privat, true);
});

test('verweigerte Regel fuehrt zu leerer Liste statt Absturz', async () => {
    const { mc } = umgebung({ uid: 'U1' }, [], true);
    assert.strictEqual((await mc._holePrivat()).length, 0);
});

test('Anzeige: iframe mit sandbox OHNE allow-same-origin und srcdoc = gespeicherte Seite', () => {
    const { mc } = umgebung({ uid: 'U1' }, []);
    const g = mc._privatAusDoc('t', { titel: 'T', html: '<html><body>GEHEIM</body></html>' });
    let html = '';
    const rahmen = { addEventListener() {} };
    const knopf = { addEventListener: () => {} };
    const buehne = {
        set innerHTML(v) { html = v; }, get innerHTML() { return html; },
        querySelector: (s) => (s === '.mcl-privat-rahmen' ? rahmen : knopf),
        scrollIntoView: () => {}
    };
    mc._zeigePrivat(buehne, g);
    const sandbox = (html.match(/sandbox="([^"]*)"/) || [])[1];
    assert.ok(sandbox !== undefined, 'kein sandbox-Attribut');
    assert.ok(!/allow-same-origin/.test(sandbox), 'allow-same-origin gibt dem Stueck Zugriff auf Konto und Speicher');
    assert.ok(rahmen.srcdoc.startsWith('<html><body>GEHEIM'), 'gespeicherte Seite gehoert in srcdoc');
    assert.ok(!html.includes('GEHEIM'), 'der Inhalt gehoert in srcdoc, nicht ins Seiten-HTML');
});

test('im Repo liegt keine Datei einer privaten Masterclass', () => {
    /* Seit dem Umzug von Mega-Stalobor (17.10.2026) gibt es das
     * Verzeichnis gar nicht mehr; test-masterclass.js verbietet jede
     * HTML-Datei darin. */
    const ordner = path.join(WURZEL, 'masterclass');
    const dateien = fs.existsSync(ordner) ? fs.readdirSync(ordner) : [];
    assert.ok(!dateien.some((d) => /tohaido|sharpedo/i.test(d)),
        'die private Mega-Tohaido-Masterclass darf nicht unter masterclass/ liegen: ' + dateien.join(', '));
});

/* Nachbesserung 17.10.2026: Sprungmarken im srcdoc-Rahmen zeigten auf die
 * Elternseite und luden thedipidis.app/#liste im Rahmen („Dieser Inhalt ist
 * blockiert"). Das eingefuegte Skript wird hier AUSGEFUEHRT. */
test('Sprungmarken im privaten Stueck scrollen im Rahmen statt zu navigieren', () => {
    const { mc } = umgebung({ uid: 'U1' }, []);
    const roh = '<!doctype html><html><body><a href="#liste">Liste</a><section id="liste"></section></body></html>';
    const html = mc._mitAnkern(roh);
    assert.ok(html.startsWith('<!doctype html>'), 'das Skript darf nicht vor den Doctype (sonst Quirks-Modus)');
    const skript = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
    assert.ok(skript, 'kein Anker-Skript im Stueck');
    assert.ok(html.indexOf('<script>') < html.lastIndexOf('</body>'), 'Skript gehoert vor </body>');
    let handler = null, verhindert = false, gescrollt = null;
    const ziel = { scrollIntoView: () => { gescrollt = 'liste'; } };
    const document = {
        addEventListener: (typ, fn) => { if (typ === 'click') handler = fn; },
        getElementById: (id) => (id === 'liste' ? ziel : null),
        body: { scrollIntoView: () => { gescrollt = 'body'; } }
    };
    const k = { document };
    vm.createContext(k);
    vm.runInContext(skript, k);
    assert.ok(handler, 'Skript registriert keinen Klick-Handler');
    const anker = { getAttribute: () => '#liste' };
    handler({ target: { closest: (sel) => (sel.includes('href^=') ? anker : null) }, preventDefault: () => { verhindert = true; } });
    assert.strictEqual(verhindert, true, 'der Klick muss die Navigation verhindern');
    assert.strictEqual(gescrollt, 'liste');
});

test('Stueck ohne </body> bekommt das Skript angehaengt', () => {
    const { mc } = umgebung({ uid: 'U1' }, []);
    assert.ok(/<script>[\s\S]*<\/script>$/.test(mc._mitAnkern('<p>x</p>')));
});

test('zeigePrivat setzt das Stueck MIT Anker-Skript in den Rahmen', () => {
    const { mc } = umgebung({ uid: 'U1' }, []);
    const g = mc._privatAusDoc('t', { titel: 'T', html: '<html><body>X</body></html>' });
    const rahmen = { addEventListener() {} };
    const buehne = { innerHTML: '', querySelector: (s) => (s === '.mcl-privat-rahmen' ? rahmen : { addEventListener() {} }), scrollIntoView() {} };
    mc._zeigePrivat(buehne, g);
    assert.ok(/addEventListener\("click"/.test(rahmen.srcdoc), 'Rahmen ohne Anker-Skript');
});
