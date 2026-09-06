/**
 * Das Pokéball-Menü und die abgeschnittene Zeile.
 *
 * GEMELDET (31.08.2026): „Menü in der Meta Ansicht okay, aber bei
 * Champions ist es abgeschnitten."
 *
 * GEMESSEN, 1440×700, Startseite: der letzte sichtbare Eintrag war
 * waagerecht durchgeschnitten. Drei Ursachen lagen übereinander:
 *
 * 1. Das Stylesheet deckelte mit `max-height: calc(100vh - 90px)` —
 *    gegen die GANZE Bildhöhe. Das Menü hängt aber absolut im Kopf und
 *    scrollt mit; sein oberer Rand lag gemessen bei −23 px, während der
 *    Deckel 610 px erlaubte. Die Differenz fiel unten heraus.
 *
 * 2. `transition: all` animierte auch max-height. Jede Messung während
 *    des Übergangs lieferte Zwischenwerte — ein Kasten von 541 px bei
 *    einem Deckel von 545 px, also mitten im scale(0.98).
 *
 * 3. Ein aufklappendes Untermenü ändert die Höhe NACH dem Öffnen.
 *    requestAnimationFrame, setTimeout und transitionend verloren das
 *    Rennen jeweils in einzelnen Fällen.
 *
 * Diese Datei hält alle drei fest. Sie prüft den Quelltext, nicht den
 * Browser — die Geometrie selbst ist an 16 Kombinationen aus Bildgröße
 * und Reiter gemessen worden und steht im Projektbericht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const JS = lies('js', 'inline-init.js');
// Kommentare raus, bevor geprueft wird: die Begruendung im Stylesheet
// ZITIERT `transition: all` als das, was es nicht mehr sein darf — ohne
// diesen Schritt findet der Test seine eigene Erklaerung und schlaegt an.
const CSS = lies('css', 'pokeball-menu.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Pokéball-Menü — die Höhe kommt aus dem Platz, der da ist', () => {
    it('es gibt eine Funktion, die die Höhe setzt', () => {
        assert.match(JS, /function menueHoeheAnpassen\(drop\)/);
        assert.match(JS, /window\.menueHoeheAnpassen = menueHoeheAnpassen/);
    });

    it('gerechnet wird ab der tatsächlichen Position, nicht ab 100vh', () => {
        const f = /function menueHoeheAnpassen\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        assert.match(f, /getBoundingClientRect\(\)/,
            'ohne Messung der Position ist es wieder eine Rechnung gegen 100vh');
        assert.match(f, /sicht\s*-\s*oben/,
            'die Höhe muss die tatsächliche Oberkante abziehen');
    });

    it('gerechnet wird mit der SICHTBAREN Höhe, nicht mit window.innerHeight', () => {
        /* BEFUND (06.09.2026, Bildschirmfoto vom Betreiber): auf dem
           iPhone lief das Menü unten aus dem Bild, die letzten vier
           Einträge lagen über dem Seiteninhalt.

           `window.innerHeight` meldet in Safari auf iOS die GROSSE
           Ansichtshöhe — die mit eingeklappten Browserleisten. Wer nach
           unten gescrollt hat, sieht genau die; tippt er dann auf das
           Menü, fahren die Leisten wieder aus und es bleiben rund 100px
           weniger. Der Deckel war da schon gesetzt.

           `visualViewport.height` meldet, was wirklich zu sehen ist.
           innerHeight bleibt als Rückfall erlaubt — aber nur als
           Rückfall. */
        const f = /function menueHoeheAnpassen\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        assert.match(f, /visualViewport[\s\S]{0,60}height/,
            'ohne visualViewport rechnet das Menü auf iOS gegen eine Höhe, '
            + 'die der Nutzer gar nicht sieht');
        assert.match(f, /\|\|\s*window\.innerHeight/,
            'innerHeight muss als Rückfall bleiben — nicht jeder Browser '
            + 'kennt visualViewport');
    });

    it('die eigene Tableiste wird vom Platz abgezogen', () => {
        /* Sie ist fixiert und liegt über dem Seitenende. Ohne Abzug
           endet das Menü unter ihr — die untersten Einträge sind dann
           weder zu sehen noch zu treffen. */
        const f = /function menueHoeheAnpassen\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        assert.match(f, /dsTabbarHost/,
            'die Tableiste wird nicht gemessen');
        assert.match(f, /-\s*leisteHoch/,
            'die Höhe der Tableiste wird gemessen, aber nicht abgezogen');
        assert.match(f, /display\s*!==\s*'none'/,
            'auf dem Desktop gibt es die Leiste nicht — dort darf nichts '
            + 'abgezogen werden');
    });

    it('bei geänderter Sichthöhe wird nachgerechnet', () => {
        /* Auf iOS fahren die Browserleisten beim Tippen und Rollen ein
           und aus. `window.resize` feuert dabei NICHT — visualViewport
           schon. Ohne das Nachrechnen bliebe der Deckel auf dem Wert
           stehen, der beim Öffnen galt. */
        assert.match(JS, /visualViewport\.addEventListener\('resize'/,
            'ohne dieses Nachrechnen bleibt der Deckel auf dem Wert vom Öffnen');
        assert.match(JS, /visualViewport\.removeEventListener\('resize'/,
            'die Beobachtung wird nie beendet — sie rechnet dann für ein '
            + 'Menü weiter, das niemand sieht');
    });

    it('ragt das Menü oben aus dem Bild, wird zurückgescrollt statt abgeschnitten', () => {
        const f = /function menueHoeheAnpassen\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        assert.match(f, /r\.top < 8[\s\S]{0,120}window\.scrollBy/,
            'sonst bleibt der obere Teil des Menüs unerreichbar');
    });

    it('die Unterkante wird auf eine ganze Zeile korrigiert', () => {
        const f = /function menueHoeheAnpassen\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        // Der Kern: eine Zeile, die die Unterkante KREUZT, zieht den
        // Deckel auf ihre Oberkante.
        assert.match(f, /zr\.top < kasten\.bottom[\s\S]{0,80}zr\.bottom > kasten\.bottom/,
            'ohne diese Prüfung bleibt eine Zeile mittendrin geschnitten');
        assert.match(f, /schnittBei/, 'die Korrektur fehlt');
        assert.match(f, /versuch < 3/,
            'ein Durchgang reicht nicht — der Rollbalken ändert den Umbruch');
    });

    it('unter 240 px schrumpft das Menü nicht', () => {
        const f = /function menueHoeheAnpassen\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        assert.match(f, /240/,
            'sonst kippt ein enges Bild das Menü auf zwei Zeilen zusammen');
    });
});

describe('Pokéball-Menü — die Messung darf nicht in eine Animation fallen', () => {
    it('die Transition nennt ihre Eigenschaften und ist nicht mehr `all`', () => {
        const block = /\.main-menu-dropdown \{[\s\S]*?\n\}/.exec(CSS)[0];
        assert.ok(!/transition:\s*all\b/.test(block),
            '`transition: all` animiert auch max-height — jede Messung während '
            + 'des Übergangs liefert dann Zwischenwerte');
        // Nur die Deklaration selbst pruefen, bis zum Semikolon — sonst
        // findet ein `[\s\S]*?` das max-height, das ZWEI Zeilen spaeter
        // als eigene Regel steht und mit dem Uebergang nichts zu tun hat.
        const deklaration = /transition:([^;]*);/.exec(block);
        assert.ok(deklaration, 'keine transition-Deklaration gefunden');
        assert.match(deklaration[1], /opacity/);
        assert.match(deklaration[1], /transform/);
        assert.ok(!/max-height|\ball\b/.test(deklaration[1]),
            'max-height darf nicht animiert werden: ' + deklaration[1].trim());
    });

    it('der CSS-Deckel bleibt als Rückfall ohne JavaScript stehen', () => {
        const block = /\.main-menu-dropdown \{[\s\S]*?\n\}/.exec(CSS)[0];
        assert.match(block, /max-height:\s*calc\(100vh - 90px\)/);
        assert.match(block, /overflow-y:\s*auto/,
            'reicht der Platz nicht, muss das Menü rollen können');
    });
});

describe('Pokéball-Menü — nachrechnen, wenn sich der Inhalt ändert', () => {
    it('ein ResizeObserver hängt an den Untermenüs', () => {
        assert.match(JS, /new ResizeObserver/);
        assert.match(JS, /querySelectorAll\('\.menu-submenu'\)[\s\S]{0,80}observe/,
            'beobachtet werden muss der Inhalt, nicht der Kasten');
    });

    it('der Kasten selbst wird NICHT beobachtet', () => {
        // Sonst löst die eigene Höhenänderung die nächste Runde aus.
        const f = /function menueBeobachtungStarten\(drop\) \{[\s\S]*?\n\}/.exec(JS)[0];
        assert.ok(!/_menueBeobachter\.observe\(drop\)/.test(f),
            'das wäre eine Rückkopplung');
    });

    it('die Beobachtung endet beim Schließen — auf beiden Wegen', () => {
        assert.match(JS, /function menueBeobachtungBeenden\(\)/);
        // Weg 1: der Umschalter.
        assert.match(JS, /else \{ menueBeobachtungBeenden\(\); \}/);
        // Weg 2: Klick daneben.
        assert.match(JS, /trigger\.classList\.remove\('open'\);\s*\n\s*menueBeobachtungBeenden\(\);/,
            'ein Klick neben das Menü schließt es auch — dort lief der Beobachter weiter');
    });

    it('fehlt ResizeObserver, steigt es aus statt zu werfen', () => {
        assert.match(JS, /typeof ResizeObserver !== 'function'/);
    });
});
