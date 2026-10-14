/**
 * BEFUND C4 / A-F3.22-24 / A-F4.45-47 (gemessen 07.09.2026) und die
 * Nachmessung B1/B3/B5 derselben Stelle am selben Tag.
 *
 *   C4:  In der Seltenheitsleiste ("Niedrige Seltenheit / Höchste
 *        Seltenheit / Alle Drucke") bleibt "Niedrige Seltenheit" blau,
 *        egal was gewaehlt ist; die gewaehlte Option sieht ungewaehlt
 *        aus. Im Typfilter des vergangenen und des laufenden Metas
 *        dasselbe mit "Alle".
 *
 *   B1:  Der erste Reparaturversuch hat den Startknopf mit
 *        :not(.btn-inactive) aus der EIGENEN Regel ausgeschlossen — und
 *        damit nur das eigene Blau abgeschaltet. Gewonnen hat danach
 *        css/ui-components.css:962 `.btn-success { background:
 *        linear-gradient(135deg,#0b7f58,#047f59) !important; box-shadow:
 *        0 0 8px rgba(16,185,129,0.5) !important }`. Der abgewaehlte
 *        Knopf war also GRUEN mit gruenem Schein, nicht neutral.
 *
 *        DIESER TEST HAT DAS NICHT GESEHEN, und das war sein Fehler:
 *        `istHervorgehoben()` fragte nur, ob der Hintergrund das Blau der
 *        Seite ist. Gruen ist nicht blau, also galt der Knopf als
 *        unmarkiert. Die Frage ist jetzt eine andere und eine bessere:
 *        SIEHT DER KNOPF ANDERS AUS ALS SEIN UNMARKIERTER NACHBAR IN
 *        DERSELBEN LEISTE? Verglichen wird Eigenschaft fuer Eigenschaft
 *        — Hintergrundfarbe, Hintergrundbild, Schatten, Schriftfarbe,
 *        Trennlinie — gegen den Knopf ohne jede Zustandsklasse. Damit
 *        zaehlt JEDE sichtbare Hervorhebung, gleich welcher Farbe.
 *
 *   B3:  Die Hervorhebung setzte `box-shadow: inset 0 -2px 0 ...
 *        !important` und hat damit den Auswahlring aus
 *        css/ui-components.css:632 VERDRAENGT — box-shadow ist eine
 *        Eigenschaft, nicht zwei. Jetzt setzt sie denselben Ring; dass
 *        der Ring in jedem gewaehlten Zustand steht, wird unten geprueft,
 *        und der Sollwert wird aus ui-components.css GELESEN.
 *
 *   B5:  Ein zweiter Schutz (:not) neben einer eigenen Neutralregel waere
 *        doppelt gemoppelt: jeder deckt den anderen, keiner ist geprueft.
 *        Es bleibt EIN Mechanismus — die Neutralregel —, und jede seiner
 *        Zeilen ist unten an einem Zustand gemessen, den die Seite
 *        wirklich erzeugt.
 *
 * DIE URSACHE LAG IN DREI DATEIEN, NICHT IN EINER:
 *
 *   index.html:801/1330/1929  class="btn-toggle-item btn-success" — fest
 *   index.html:1319/1918      class="...-type-btn active"        — fest
 *   js/app-city-league.js, js/app-current-meta-analysis.js,
 *   js/app-past-meta.js       schalten btn-active / btn-inactive um
 *   css/ui-components.css:632 .btn-active   — Deckkraft, Ring, kein Grund
 *   css/ui-components.css:962 .btn-success  — gruener Verlauf !important
 *   css/pokeball-menu.css:219 .btn-success  — gruene Flaeche !important
 *
 * index.html und css/ui-components.css sind fuer diesen Arbeitsbereich
 * gesperrt — repariert wird in css/pokeball-menu.css und
 * css/city-league.css.
 *
 * Geprueft wird nicht der Regeltext, sondern der GEWINNER der Kaskade
 * (Spezifitaet, !important, Quellreihenfolge aus index.html) — siehe
 * tests/unit/lib-css-kaskade.js. Keine Live-Daten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stilblatt, gewinner, flaeche, ladeReihenfolge, FLAECHE, WURZEL }
    = require('./lib-css-kaskade.js');

const BLATT = stilblatt([
    'css/components.css',      // UI-141: die Pille .ds-filter-btn und ihre Zustaende
    'css/ui-components.css',   // fremde Datei, nur gelesen
    'css/pokeball-menu.css',
    'css/city-league.css'
]);

const MARKUP = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
/** Ohne Kommentare — sonst zaehlt ein Satz UEBER eine Regel wie die Regel. */
const ohneKommentare = (datei) => fs
    .readFileSync(path.join(WURZEL, datei), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const POKEBALL = ohneKommentare('css/pokeball-menu.css');
const CITY = ohneKommentare('css/city-league.css');
const UI = ohneKommentare('css/ui-components.css');

const knopf = (...klassen) => ({ tag: 'button', klassen });
const bild = (el) => flaeche(BLATT, el);

/**
 * Die drei Leisten, so wie index.html sie ausliefert und die drei
 * Umschaltfunktionen sie danach setzen. Jede Leiste hat GENAU DIESE VIER
 * Zustaende — mehr erzeugt die Seite nicht.
 */
const LEISTEN = [
    {
        name: 'Seltenheitsleiste (overview / pastMeta)',
        basis: 'btn-toggle-item',
        startGewaehlt: ['btn-success'],
        startAbgewaehlt: ['btn-success', 'btn-inactive'],
        umGewaehlt: ['btn-active'],
        umAbgewaehlt: ['btn-inactive']
    },
    {
        /* UI-141 (15.10.2026): die Seltenheitsleiste der Deck-Analyse ist eine
           Pille wie die Raumwahl (.ds-filter-btn, css/components.css); sie
           startet mit btn-active statt btn-success. Den Auswahlring aus
           ui-components.css traegt sie bewusst nicht — die Raumwahl hat auch
           keinen; gewaehlt heisst hier Flaeche 1 mit Schatten. */
        name: 'Seltenheitsleiste Deck-Analyse (currentMeta, Pille)',
        basis: 'ds-filter-btn',
        startGewaehlt: ['btn-active'],
        startAbgewaehlt: ['btn-inactive'],
        umGewaehlt: ['btn-active'],
        umAbgewaehlt: ['btn-inactive'],
        ohneRing: true
    },
    {
        name: 'Typfilter vergangenes Meta',
        basis: 'past-meta-cards-type-btn',
        startGewaehlt: ['active'],
        startAbgewaehlt: ['active', 'btn-inactive'],
        umGewaehlt: ['btn-active'],
        umAbgewaehlt: ['btn-inactive']
    },
    {
        name: 'Typfilter laufendes Meta',
        basis: 'current-meta-cards-type-btn',
        startGewaehlt: ['active'],
        startAbgewaehlt: ['active', 'btn-inactive'],
        umGewaehlt: ['btn-active'],
        umAbgewaehlt: ['btn-inactive']
    }
];

/**
 * "Sieht hervorgehoben aus" heisst: die Flaeche weicht von der des
 * unmarkierten Nachbarn ab. Nicht "ist blau" — genau diese Verengung hat
 * den gruenen Knopf durchgelassen.
 */
function istHervorgehoben(basis, klassen) {
    const a = bild(knopf(basis, ...klassen));
    const n = bild(knopf(basis));
    return FLAECHE.some(p => a[p] !== n[p]);
}

/** Welche Eigenschaften weichen ab? (fuer lesbare Fehlermeldungen) */
function abweichungen(basis, klassen) {
    const a = bild(knopf(basis, ...klassen));
    const n = bild(knopf(basis));
    return FLAECHE.filter(p => a[p] !== n[p])
        .map(p => `${p}: ${a[p] || '(nichts)'} statt ${n[p] || '(nichts)'}`);
}

/** Der Auswahlring, den .btn-active in css/ui-components.css setzt. */
const RING = gewinner(stilblatt(['css/ui-components.css']),
    knopf('btn-active'), 'box-shadow').wert;

describe('Hervorhebung der Umschaltknoepfe (C4 / A-F3.22-24 / A-F4.45-47, B1, B3, B5)', () => {

    it('Vorbedingung: index.html setzt die Startklassen wirklich fest', () => {
        // Aendert sich das, ist dieser ganze Test gegenstandslos — dann soll
        // er das sagen und nicht still weitergruenen.
        assert.match(MARKUP, /id="overviewRarityMin"/);
        assert.match(MARKUP, /class="btn-toggle-item btn-success"[^>]*id="overviewRarityMin"/);
        assert.match(MARKUP, /class="ds-filter-btn btn-active"[^>]*id="currentMetaOverviewRarityMin"/);
        assert.match(MARKUP, /class="btn-toggle-item btn-success"[^>]*id="pastMetaRarityMin"/);
        assert.match(MARKUP, /class="past-meta-cards-type-btn active"|class="current-meta-cards-type-btn active"/);
    });

    it('Vorbedingung: css/ui-components.css gibt .btn-active keinen Hintergrund', () => {
        // Genau deshalb muss die sichtbare Regel in unsere Dateien.
        const nur = stilblatt(['css/ui-components.css']);
        assert.equal(gewinner(nur, knopf('btn-active'), 'background-color').wert, null);
        assert.equal(gewinner(nur, knopf('btn-active'), 'background-image').wert, null);
    });

    it('Vorbedingung B1: .btn-success traegt in beiden fremden Dateien !important', () => {
        // Das ist der Grund, warum ein :not() nicht reicht und die
        // Neutralregel selbst !important tragen muss.
        const ui = gewinner(stilblatt(['css/ui-components.css']),
            knopf('btn-success'), 'background-image');
        assert.match(ui.wert || '', /gradient/, 'der gruene Verlauf steht noch in ui-components.css');
        assert.equal(ui.wichtig, true, 'und zwar mit !important');
        assert.match(UI, /\.btn-success\s*\{[^}]*box-shadow:\s*0 0 8px[^}]*!important/,
            'der gruene Schein ebenfalls');
    });

    // ---------------------------------------------------------------
    // Der eigentliche Befund, fuer jede Leiste und jeden ihrer vier
    // Zustaende. Das ist die Tabelle aus dem Bericht, ausgefuehrt.
    // ---------------------------------------------------------------
    LEISTEN.forEach(L => {
        describe(L.name, () => {

            it('vor dem ersten Klick ist der Startknopf hervorgehoben', () => {
                assert.ok(istHervorgehoben(L.basis, L.startGewaehlt),
                    'sonst startet die Leiste ohne jede Markierung');
            });

            it('der abgewaehlte Startknopf sieht aus wie ein unmarkierter Nachbar — auch nicht gruen', () => {
                const anders = abweichungen(L.basis, L.startAbgewaehlt);
                assert.deepEqual(anders, [],
                    'BEFUND B1 war genau das: ' + anders.join(' | '));
            });

            it('der umgeschaltet gewaehlte Knopf ist hervorgehoben', () => {
                assert.ok(istHervorgehoben(L.basis, L.umGewaehlt),
                    'btn-active ohne sichtbare Regel war der Befund C4');
            });

            it('der umgeschaltet abgewaehlte Knopf ist neutral', () => {
                const anders = abweichungen(L.basis, L.umAbgewaehlt);
                assert.deepEqual(anders, [], anders.join(' | '));
            });

            it('genau ein Knopf der Leiste ist hervorgehoben', () => {
                // Zustand nach dem Klick auf die dritte Option, so wie die
                // Umschaltfunktion die Klassen setzt.
                const leiste = [L.startAbgewaehlt, L.umAbgewaehlt, L.umGewaehlt];
                assert.deepEqual(leiste.map(k => istHervorgehoben(L.basis, k)),
                    [false, false, true],
                    'vorher war genau der erste markiert — die ANZAHL stimmte '
                    + 'und die Markierung stand trotzdem am falschen Knopf');
            });

            it('beide gewaehlten Zustaende sehen gleich aus', () => {
                // Sonst springt die Farbe beim ersten Klick auf den Knopf,
                // der schon markiert war.
                assert.deepEqual(bild(knopf(L.basis, ...L.umGewaehlt)),
                    bild(knopf(L.basis, ...L.startGewaehlt)));
            });

            it('B3: der gewaehlte Knopf traegt einen Schatten, und zwar den Auswahlring', () => {
                [L.startGewaehlt, L.umGewaehlt].forEach(k => {
                    const s = bild(knopf(L.basis, ...k))['box-shadow'];
                    assert.ok(s, 'ohne Schatten: [' + k.join(' ') + ']');
                    if (L.ohneRing) return;
                    assert.ok(s.includes(RING),
                        'die Hervorhebung darf den Ring aus css/ui-components.css:632 '
                        + 'nicht verdraengen — box-shadow ist eine Eigenschaft, nicht zwei, '
                        + 'also gehoeren beide Schatten in dieselbe Liste. '
                        + 'Zustand [' + k.join(' ') + ']: ' + s);
                });
            });

            it('B1: kein abgewaehlter Zustand behaelt einen Schatten', () => {
                [L.startAbgewaehlt, L.umAbgewaehlt].forEach(k => {
                    assert.equal(bild(knopf(L.basis, ...k))['box-shadow'], '',
                        'der gruene Schein aus .btn-success ist zurueck: [' + k.join(' ') + ']');
                });
            });
        });
    });

    it('der wieder gewaehlte Startknopf traegt beide Klassen und bleibt markiert', () => {
        // btn-success (fest aus index.html) + btn-active (vom Klick).
        assert.ok(istHervorgehoben('btn-toggle-item', ['btn-success', 'btn-active']));
        assert.deepEqual(bild(knopf('btn-toggle-item', 'btn-success', 'btn-active')),
            bild(knopf('btn-toggle-item', 'btn-active')));
    });

    it('die Staples-Stufen schalten weiter ueber .active und bleiben markiert', () => {
        // js/app-tier-meta.js:2978 baut sie mit btn-toggle-item[.active] neu
        // auf und setzt nie btn-inactive — deshalb steht dort auch kein :not.
        assert.ok(istHervorgehoben('btn-toggle-item', ['active']));
        assert.ok(!istHervorgehoben('btn-toggle-item', []));
    });

    it('Typfilter (City League) schaltet weiter ueber .active und bleibt unangetastet', () => {
        // Diese Leiste setzt kein btn-inactive (js/app-city-league.js,
        // setOverviewCardTypeFilter) — sie war nie betroffen.
        assert.ok(istHervorgehoben('city-league-type-btn', ['active']));
        assert.ok(!istHervorgehoben('city-league-type-btn', []));
    });

    it('B5: es gibt genau EINEN Mechanismus fuers Abwaehlen, und der ist die Neutralregel', () => {
        // Zwei Mechanismen (:not UND Neutralregel) waeren beide ungeprueft,
        // weil jeder den anderen deckt. Also darf in den drei reparierten
        // Regelgruppen kein :not(.btn-inactive) mehr stehen.
        [['css/pokeball-menu.css', POKEBALL], ['css/city-league.css', CITY]].forEach(([n, q]) => {
            assert.ok(!/:not\(\.btn-inactive\)/.test(q),
                n + ': ein zweiter, ungepruefter Schutz neben der Neutralregel');
        });
        assert.match(POKEBALL, /\.btn-toggle-item\.btn-inactive\s*\{/);
        assert.match(CITY, /\.past-meta-cards-type-btn\.btn-inactive\s*\{/);
        assert.match(CITY, /\.current-meta-cards-type-btn\.btn-inactive\s*\{/);
    });

    it('die Neutralregel steht NACH der Hervorhebung — daran haengt sie', () => {
        // Gleiche Spezifitaet (0,2,0): nur die Quellreihenfolge entscheidet.
        assert.ok(POKEBALL.indexOf('.btn-toggle-item.btn-inactive')
            > POKEBALL.indexOf('.btn-toggle-item.btn-active'));
        assert.ok(CITY.indexOf('.past-meta-cards-type-btn.btn-inactive')
            > CITY.indexOf('.past-meta-cards-type-btn.btn-active'));
        assert.ok(CITY.indexOf('.current-meta-cards-type-btn.btn-inactive')
            > CITY.indexOf('.current-meta-cards-type-btn.btn-active'));
    });

    it('die Reparatur steht in unseren beiden Dateien, nicht in einer fremden', () => {
        assert.match(POKEBALL, /\.btn-toggle-item\.btn-active/);
        assert.match(CITY, /\.past-meta-cards-type-btn\.btn-active/);
        assert.match(CITY, /\.current-meta-cards-type-btn\.btn-active/);
        assert.ok(!/\.btn-active\s*\{[^}]*background/.test(UI),
            'css/ui-components.css gehoert einem anderen Arbeitsbereich und bleibt unberuehrt');
        assert.ok(!/\.btn-inactive\s*\{[^}]*background/.test(UI),
            'auch .btn-inactive dort bleibt ohne Hintergrund');
    });

    it('die Ladereihenfolge, auf der das beruht, stimmt noch', () => {
        const o = ladeReihenfolge();
        assert.ok(o.indexOf('css/ui-components.css') < o.indexOf('css/pokeball-menu.css'));
        assert.ok(o.indexOf('css/pokeball-menu.css') < o.indexOf('css/city-league.css'));
    });
});
