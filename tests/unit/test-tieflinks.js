/**
 * Tieflinks — und der Schluessel, der zweimal vergeben war.
 *
 * Gemessen am 18.08.2026, im Browser, jeder Aufruf ein frischer Ladevorgang:
 *
 *   vorher                        nachher
 *   #current-meta  -> current-meta        #current-meta  -> current-meta
 *   #past-meta     -> past-meta           #past-meta     -> past-meta
 *   #cards         -> cards               #cards         -> cards
 *   #side-quest    -> past-meta   FALSCH  #side-quest    -> side-quest
 *   #meta-call     -> profile     FALSCH  #meta-call     -> meta-call
 *   #meta-analysis-hub -> cards   FALSCH  #meta-analysis-hub -> meta-analysis-hub
 *
 * Die Ursache bei #meta-call ist die interessante: HASH_ALIASES vergab
 * 'metacall' und 'meta-call' ZWEIMAL im selben Objektliteral — oben auf
 * 'meta-call' (Block 7 hatte den Tab aus dem Profil geloest) und weiter
 * unten noch einmal auf 'profile'. In einem Objektliteral gewinnt der
 * spaetere Schluessel. Ein geteilter Link auf Meta Call landete deshalb
 * weiter hinter der Anmeldewand, die Block 7 gerade beseitigt hatte.
 *
 * Der Fix war da. Er kam nur nie an — dieselbe Form wie beim
 * Sprachumschalter, dessen Reparatur an einem gespeicherten Wert
 * scheiterte.
 *
 * Bei #side-quest und #meta-analysis-hub war es simpler: kein Eintrag,
 * applyHash() steigt wortlos aus, der Besucher landet irgendwo.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'inline-init.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function tabelle(name) {
    const m = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\n    \\};').exec(SRC);
    assert.ok(m, name + ' nicht gefunden');
    return m[1];
}

function schluessel(body) {
    // Kommentarzeilen raus, sonst zaehlen erwaehnte Namen mit.
    const ohne = body.replace(/^\s*\/\/.*$/gm, '');
    return [...ohne.matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]);
}

describe('Tieflinks — kein Schluessel zweimal', () => {
    it('HASH_ALIASES vergibt jeden Schluessel genau einmal', () => {
        const ks = schluessel(tabelle('HASH_ALIASES'));
        const doppelt = ks.filter((k, i) => ks.indexOf(k) !== i);
        assert.deepStrictEqual([...new Set(doppelt)], [],
            'in einem Objektliteral gewinnt der spaetere — der frueher ' +
            'geschriebene Eintrag sieht richtig aus und wirkt nicht');
    });

    it('PROFILE_SUBTAB_FOR_HASH ebenso', () => {
        const ks = schluessel(tabelle('PROFILE_SUBTAB_FOR_HASH'));
        const doppelt = ks.filter((k, i) => ks.indexOf(k) !== i);
        assert.deepStrictEqual([...new Set(doppelt)], []);
    });
});

describe('Tieflinks — Meta Call ist kein Profil-Untertab mehr', () => {
    it('#meta-call zeigt auf den eigenen Tab', () => {
        const t = tabelle('HASH_ALIASES');
        assert.match(t, /'meta-call':\s*'meta-call'/);
        assert.ok(!/'meta-call':\s*'profile'/.test(t.replace(/^\s*\/\/.*$/gm, '')));
    });

    it('und steht nicht mehr in der Profil-Untertab-Tabelle', () => {
        const t = tabelle('PROFILE_SUBTAB_FOR_HASH').replace(/^\s*\/\/.*$/gm, '');
        assert.ok(!/'metacall'/.test(t));
        assert.ok(!/'meta-call'/.test(t));
    });
});

describe('Tieflinks — jedes Ziel existiert wirklich', () => {
    it('jeder Alias zeigt auf einen Reiter, den es im Markup gibt', () => {
        // Ein Alias auf einen entfernten Reiter blendet alle Reiter aus
        // und zeigt keinen — eine leere Seite ohne Rueckweg ausser der
        // Adresszeile. Genau dafuer gibt es die Wache in applyHash();
        // dieser Test faengt es eine Stufe frueher ab.
        const t = tabelle('HASH_ALIASES').replace(/^\s*\/\/.*$/gm, '');
        const ziele = [...new Set([...t.matchAll(/:\s*'([^']+)'/g)].map(m => m[1]))];
        const fehlen = ziele.filter(z => !HTML.includes('id="' + z + '"'));
        assert.deepStrictEqual(fehlen, []);
    });

    it('die drei nachgetragenen Aliase sind da', () => {
        const t = tabelle('HASH_ALIASES');
        assert.match(t, /'side-quest':\s*'side-quest'/);
        assert.match(t, /'meta-analysis-hub':\s*'meta-analysis-hub'/);
        assert.match(t, /'champions':\s*'side-quest'/);
    });

    it('applyHash steigt weiterhin aus, wenn der Reiter fehlt', () => {
        assert.match(SRC, /if \(!document\.getElementById\(tabId\)\) \{/);
    });
});
