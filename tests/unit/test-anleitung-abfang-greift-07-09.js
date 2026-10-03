/**
 * B5 / F8.5b — NACHPRUEFUNG, keine Reparatur.
 *
 * In beiden Anleitungen stehen je neun `href="#"`. Ein Fix vom
 * 07.09.2026 faengt diese Klicks in js/inline-init.js ab
 * (tutorialToterVerweis); tests/unit/test-tutorial-tote-verweise-07-09.js
 * prueft den Rumpf dieser Funktion.
 *
 * WAS DORT NICHT GEPRUEFT WIRD, und warum es diese Datei gibt: jener
 * Test STELLT closest() selbst (`closest: () => (treffer ? a : null)`).
 * Damit ist die Bedingung `#tutorial a[href="#"]` eine Behauptung des
 * Tests, nicht der Seite. Faende die Auswahl in Wirklichkeit nichts —
 * weil die Anleitung nicht mehr in #tutorial haengt, weil der Wirt
 * umbenannt wurde, weil ein Verweis anders geschrieben wird —, bliebe
 * jener Test gruen und der Klick fiele wieder auf die Startseite.
 *
 * Hier laeuft derselbe Abfaenger deshalb gegen eine ECHTE Ahnenkette,
 * gebaut aus der Verschachtelung von index.html und den wirklichen
 * Verweisen der beiden Anleitungsdateien.
 *
 * GEMESSEN am 07.09.2026 mit genau diesem Aufbau:
 *
 *   #tutorialHost liegt in #tutorial                   ja
 *   Klick auf "Cardmarket"      defaultPrevented       true
 *                               href bleibt            "#"
 *                               Meldung                erscheint
 *   Klick auf "@TheDipidisBot"  href wird              https://t.me/TheDipidisBot
 *   Klick ausserhalb            defaultPrevented       false
 *
 * Urteil: BEHOBEN. An tutorial/tutorial.de.html und
 * tutorial/tutorial.en.html wurde nichts geaendert.
 *
 * KEIN jsdom, KEINE LIVEDATEN aus data/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const INIT = fs.readFileSync(path.join(WURZEL, 'js', 'inline-init.js'), 'utf8');
const HTML = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');

/* ── Ein Element mit echten Eltern ──────────────────────────────────
 * matches() kann genau die eine Auswahl, die der Abfaenger benutzt;
 * closest() laeuft die Kette wirklich hoch. Mehr braucht es nicht, und
 * mehr waere wieder eine Behauptung. */
function element(tag, attribute, kinder) {
    const e = {
        tag,
        attribute: attribute || {},
        kinder: kinder || [],
        eltern: null,
        style: {},
        textContent: ''
    };
    e.kinder.forEach(k => { k.eltern = e; });
    e.getAttribute = (k) => (k in e.attribute ? e.attribute[k] : null);
    e.setAttribute = (k, v) => { e.attribute[k] = v; };
    e.matches = (sel) => {
        assert.equal(sel, '#tutorial a[href="#"]',
            'der Abfaenger sucht nach einer anderen Auswahl als erwartet: ' + sel);
        if (e.tag !== 'a' || e.getAttribute('href') !== '#') return false;
        let n = e.eltern;
        while (n) { if (n.attribute && n.attribute.id === 'tutorial') return true; n = n.eltern; }
        return false;
    };
    e.closest = (sel) => {
        let n = e;
        while (n) { if (n.matches && n.matches(sel)) return n; n = n.eltern; }
        return null;
    };
    return e;
}

function abfaenger(sprache) {
    const a = INIT.indexOf('function tutorialToterVerweis(');
    assert.ok(a >= 0, 'tutorialToterVerweis() gibt es nicht mehr');
    let tiefe = 0;
    let rumpf = '';
    for (let j = INIT.indexOf('{', a); j < INIT.length; j++) {
        if (INIT[j] === '{') tiefe++;
        else if (INIT[j] === '}') { tiefe--; if (tiefe === 0) { rumpf = INIT.slice(a, j + 1); break; } }
    }
    const notizen = [];
    const geoeffnet = [];
    const sb = { console, String, RegExp };
    sb.window = { open: (u) => geoeffnet.push(u) };
    sb.getLang = () => (sprache || 'de');
    sb.showNotification = (t) => notizen.push(t);
    sb.document = { addEventListener: () => {} };
    vm.createContext(sb);
    vm.runInContext(rumpf, sb, { filename: 'tutorialToterVerweis.js' });
    return {
        notizen,
        geoeffnet,
        klick(ziel) {
            let verhindert = false;
            sb.tutorialToterVerweis({ target: ziel, preventDefault() { verhindert = true; } });
            return verhindert;
        }
    };
}

/** Die Seite so nachgebaut, wie index.html sie verschachtelt. */
function seite() {
    const cardmarket = element('a', { href: '#' }); cardmarket.textContent = 'Cardmarket';
    const bot = element('a', { href: '#' }); bot.textContent = '@TheDipidisBot';
    const draussen = element('a', { href: '#' }); draussen.textContent = 'Cardmarket';
    const wirt = element('div', { id: 'tutorialHost' }, [cardmarket, bot]);
    const reiter = element('div', { id: 'tutorial' }, [wirt]);
    const anderer = element('div', { id: 'cards' }, [draussen]);
    element('body', {}, [reiter, anderer]);
    return { cardmarket, bot, draussen, wirt, reiter };
}

describe('B5/F8.5b — der Abfang greift wirklich, nicht nur im Stub', () => {
    it('die Anleitung haengt in #tutorial — sonst faende die Auswahl nichts', () => {
        // seit UI-4 (26.09.2026) traegt jeder Reiter zusaetzlich fs-scale
        const reiter = HTML.search(/<div id="tutorial" class="tab-content(?: fs-scale)?">/);
        assert.ok(reiter > -1, '#tutorial gibt es nicht mehr');
        const wirt = HTML.indexOf('id="tutorialHost"', reiter);
        assert.ok(wirt > reiter, '#tutorialHost steht nicht mehr hinter #tutorial');
        const naechsterReiter = HTML.indexOf('class="tab-content', reiter + 40);
        assert.ok(naechsterReiter > wirt,
            'Der Wirt der Anleitung liegt nicht mehr INNERHALB von #tutorial. '
            + 'closest(\'#tutorial a[href="#"]\') findet dann nichts, der Klick setzt den '
            + 'Hash wieder auf leer, und der Leser landet auf der Startseite — ohne dass '
            + 'eine einzige Zusicherung dieses Projekts es merkt.');
    });

    it('die neue Anleitung hat keine toten Verweise mehr', () => {
        /* UI-78 (03.10.2026): die alte Anleitung mit ihren neun
           href="#"-Verweisen ist durch „Erste Schritte + Glossar" ersetzt.
           Der Abfang oben bleibt — er greift, falls je wieder einer
           hineinkommt; die neue Fassung hat keinen. */
        for (const datei of ['tutorial/tutorial.de.html', 'tutorial/tutorial.en.html']) {
            const txt = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
            const tote = [...txt.matchAll(/<a href="#">([^<]*)<\/a>/g)].map(m => m[1]);
            assert.equal(tote.length, 0, datei + ': ' + JSON.stringify(tote));
        }
    });

    it('ein Klick auf "Cardmarket" springt nirgendwohin und sagt warum', () => {
        const s = seite();
        const a = abfaenger('de');
        assert.equal(a.klick(s.cardmarket), true,
            'ohne preventDefault setzt href="#" den Hash auf leer, und der '
            + 'popstate-Zuhoerer schickt die Anwendung auf die Startseite');
        assert.equal(s.cardmarket.getAttribute('href'), '#',
            'ein geratenes Ziel waere schlechter als keines');
        assert.equal(a.notizen.length, 1, 'stillschweigend ist keine Antwort');
        assert.match(a.notizen[0], /Beispielbild/);
        assert.deepEqual(a.geoeffnet, []);
    });

    it('ein Klick auf "@TheDipidisBot" bekommt sein echtes Ziel', () => {
        const s = seite();
        const a = abfaenger('de');
        assert.equal(a.klick(s.bot), true);
        assert.equal(s.bot.getAttribute('href'), 'https://t.me/TheDipidisBot');
        assert.deepEqual(a.geoeffnet, ['https://t.me/TheDipidisBot']);
        assert.deepEqual(a.notizen, [], 'ein Verweis, der funktioniert, braucht keine Entschuldigung');
    });

    it('derselbe Verweis ausserhalb der Anleitung bleibt unangetastet', () => {
        const s = seite();
        const a = abfaenger('de');
        assert.equal(a.klick(s.draussen), false, 'der Abfaenger greift zu weit');
        assert.deepEqual(a.notizen, []);
    });

    it('auf Englisch sagt die Meldung dasselbe', () => {
        const s = seite();
        const a = abfaenger('en');
        a.klick(s.cardmarket);
        assert.equal(a.notizen.length, 1);
        assert.match(a.notizen[0], /example screenshot/i);
        assert.ok(!/Beispielbild/.test(a.notizen[0]), 'deutscher Satz im englischen Modus');
    });
});
