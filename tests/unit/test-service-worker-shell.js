/**
 * service-worker.js — die Liste, die von Hand gepflegt werden musste.
 *
 * SHELL_ASSETS ist die Positivliste, die beim Install vorgecacht wird.
 * Der Kommentar darueber sagte bis zum 18.08.2026: "the list changes
 * <1×/quarter so the build infra isn't worth it yet". Gemessen an dem
 * Tag: 37 von 95 Assets fehlten — Meta Call, alle sechs Side-Quest-
 * Dateien, firebase-auth.js, firebase-globals.js, die Archetyp-Karte,
 * der Hub, der Ladebildschirm.
 *
 * Warum das mehr ist als "der erste Offline-Start":
 *
 *   CACHE_NAME traegt den Deploy-Stempel. Jeder Deploy — mehrere am Tag
 *   — installiert einen neuen Cache, und der activate-Handler loescht
 *   den alten. Vorgecacht wird beim Install nur SHELL_ASSETS; alles
 *   andere landet erst wieder im Cache, wenn der Nutzer es das naechste
 *   Mal online abruft. Wer zwischen Deploy und naechstem Abruf das Netz
 *   verliert, dem fehlen genau die Dateien, die nicht auf der Liste
 *   stehen. Der Kommentar an './js/firebase-globals.js' im Service
 *   Worker haelt fest, wie das beim letzten Mal aussah: "user appeared
 *   signed out and saw empty tabs (2026-05-28)".
 *
 * Ein Build-Schritt waere schoener. Ein Test, der laut wird, ist das,
 * was die Abweichung stoppt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

// Was index.html an eigenen JS/CSS-Dateien anzieht, in Dokumentreihenfolge.
function referencedAssets() {
    const out = [];
    const re = /(?:src|href)="((?:js|css)\/[^"?]+)/g;
    let m;
    while ((m = re.exec(HTML)) !== null) {
        if (!out.includes(m[1])) out.push(m[1]);
    }
    return out;
}

// Was der Service Worker beim Install vorcacht.
function shellAssets() {
    const block = SW.slice(SW.indexOf('const SHELL_ASSETS = ['),
                           SW.indexOf('];', SW.indexOf('const SHELL_ASSETS = [')));
    return (block.match(/'\.\/((?:js|css)\/[^']+)'/g) || [])
        .map(s => s.replace(/^'\.\//, '').replace(/'$/, ''));
}

describe('service worker: die Shell-Liste haelt mit index.html Schritt', () => {
    it('jede von index.html geladene JS- und CSS-Datei steht im Shell', () => {
        const refs = referencedAssets();
        const shell = shellAssets();
        const missing = refs.filter(r => !shell.includes(r));
        assert.deepEqual(missing, [],
            'Diese Dateien laedt index.html, der Service Worker cacht sie aber nicht vor:\n  '
            + missing.join('\n  ')
            + '\nNach jedem neuen <script> oder <link> gehoert der Pfad in SHELL_ASSETS.');
    });

    it('das Shell enthaelt keine Datei, die es nicht mehr gibt', () => {
        // js/firebase-credentials.js steht in .gitignore und wird erst im
        // Deploy aus einem Secret geschrieben (deploy-pages.yml:123). Im
        // Repo fehlt sie also mit Absicht — auf der Seite ist sie da, und
        // dort muss der Service Worker sie auch cachen.
        const GENERATED = ['js/firebase-credentials.js'];
        const dead = shellAssets()
            .filter(a => !GENERATED.includes(a))
            .filter(a => !fs.existsSync(path.join(ROOT, a)));
        assert.deepEqual(dead, [],
            'Diese Eintraege zeigen ins Leere; der Install protokolliert dafuer bei jedem '
            + 'Nutzer eine Warnung:\n  ' + dead.join('\n  '));
    });

    it('das Grundgeruest steht drin', () => {
        const shell = SW.slice(SW.indexOf('const SHELL_ASSETS = ['));
        for (const must of ["'./'", "'./index.html'", "'./css/tokens.css'"]) {
            assert.ok(shell.includes(must), `${must} fehlt im Shell — ohne das bootet nichts offline.`);
        }
    });

    it('die Anleitung wird bewusst NICHT vorgecacht', () => {
        // 546 KB fuer einen Tab, den kaum jemand offline sucht. Der
        // Netzwerk-zuerst-Zweig im fetch-Handler cacht sie nach dem
        // ersten Oeffnen ohnehin.
        const arrayStart = SW.indexOf('const SHELL_ASSETS = [');
        const array = SW.slice(arrayStart, SW.indexOf('];', arrayStart));
        assert.ok(!/tutorial\/tutorial\.[a-z]{2}\.html/.test(array),
            'Die Tutorial-Fragmente stehen im Shell — das zieht 546 KB bei jedem Deploy.');
        assert.match(SW, /Nicht in dieser Liste, mit Absicht/,
            'Die Begruendung fuer die Ausnahme ist verschwunden.');
    });
});
