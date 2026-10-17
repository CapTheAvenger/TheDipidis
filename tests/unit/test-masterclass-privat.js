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
    const rahmen = {};
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
    assert.strictEqual(rahmen.srcdoc, '<html><body>GEHEIM</body></html>');
    assert.ok(!html.includes('GEHEIM'), 'der Inhalt gehoert in srcdoc, nicht ins Seiten-HTML');
});

test('im Repo liegt keine Datei einer privaten Masterclass', () => {
    const dateien = fs.readdirSync(path.join(WURZEL, 'masterclass'));
    assert.ok(!dateien.some((d) => /tohaido|sharpedo/i.test(d)),
        'die private Mega-Tohaido-Masterclass darf nicht unter masterclass/ liegen: ' + dateien.join(', '));
});
