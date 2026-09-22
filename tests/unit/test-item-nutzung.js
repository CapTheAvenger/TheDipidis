/* Item-Nutzung und "effektiv gegen Typ X".
 *
 * Beides am 09.09.2026 bestellt. Die Zusicherungen hier drehen sich um
 * die zwei Stellen, an denen eine falsche Auskunft entstehen kann:
 *
 *  1. DER NENNER der Item-Prozentzahl. Sie ist der Anteil an den Bauten
 *     EINES Pokemon, nicht sein Anteil an allen Traegern des Items. Die
 *     zweite Zahl steht nirgends und laesst sich nicht herleiten.
 *
 *  2. STATUSATTACKEN gegen einen Typ. Sie haben keine Typwirkung — sie
 *     als "x1" zu zeigen waere eine Behauptung ueber Schaden, den es
 *     nicht gibt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const l = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const ITEMS = l('js/app-side-quest-items.js');
const DEX = l('js/app-side-quest-pokedex.js');
const HTML = l('index.html');
const RES = JSON.parse(l('data/champions_resources.json'));
const USAGE = JSON.parse(l('data/champions_usage.json'));
const SHINY = JSON.parse(l('data/pokemon_go_shiny.json'));

describe('Item-Nutzung: der Nenner', () => {
    it('steht auf dem Bildschirm, nicht nur im Quelltext', () => {
        assert.match(ITEMS, /nennerHinweis: 'Die Prozentzahl ist der Anteil an den Bauten DIESES Pokémon/,
            'ohne diesen Satz liest der Nutzer die Zahl als Anteil an allen Traegern');
        assert.match(ITEMS, /sqi-nenner/, 'der Hinweis muss auch gerendert werden');
    });

    it('rechnet keinen Anteil an allen Traegern aus', () => {
        /* "X % aller Wahlschal-Traeger sind Pokemon Y" waere die
         * naheliegendste Auskunft und die einzige, die die Daten nicht
         * hergeben: die Prozentwerte haben je Pokemon einen ANDEREN
         * Nenner (seine eigenen Bauten), sie lassen sich deshalb nicht
         * zu 100 % aufaddieren.
         *
         * Der Test sucht genau diese Rechnung: eine Summe ueber die
         * Prozentwerte einer Item-Zeile, durch die dann geteilt wird. */
        const tabelle = ITEMS.match(/function itemTabelle\(\)[\s\S]*?\n    \}/)[0];
        // Es gibt genau EINE Summe ueber die Prozentwerte, und sie
        // multipliziert mit den Auftritten, statt zu normieren. Eine
        // zweite waere die verbotene Rechnung.
        const summen = tabelle.match(/\.reduce\(/g) || [];
        assert.equal(summen.length, 1,
            `${summen.length} Summen in itemTabelle() — erwartet ist genau eine (die Praesenz). `
            + 'Eine zweite Summe ueber die Prozentwerte waere ein Anteil an allen Traegern, '
            + 'den die Daten nicht hergeben: jeder Wert hat einen anderen Nenner.');
        assert.match(tabelle, /praesenz = zeilen\.reduce\(\(s, x\) => s \+ \(x\.pct \/ 100\) \* x\.auftritte, 0\)/,
            'die Praesenz-Rechnung sieht anders aus als erwartet — bitte hier nachziehen');
    });

    it('kennzeichnet die Praesenz als Schaetzung', () => {
        assert.match(ITEMS, /praesenzHint:[\s\S]{0,400}Schätzung/,
            'Praesenz ist ein Produkt aus zwei Erhebungen und muss als Schaetzung dastehen');
        assert.match(ITEMS, /Bindung × Team-Auftritte/,
            'die Rechnung gehoert offengelegt');
    });

    it('sortiert nicht nach Bindung vor, weil dort nur Mega-Steine stehen', () => {
        assert.match(ITEMS, /let _sortierung = 'praesenz'/,
            'nach Bindung sortiert sind die ersten zehn Zeilen Mega-Steine — richtig gerechnet, als erster Bildschirm wertlos');
        assert.match(ITEMS, /Mega-Steine/, 'die Begruendung gehoert an die Konstante');
    });
});

describe('Item-Nutzung: keine zwei gleichen Zeilen', () => {
    it('ergaenzt die Form, wenn der Pokedex den Slug nicht kennt', () => {
        assert.match(ITEMS, /function anzeigeName/,
            'ohne eigene Namensbildung stehen drei Zeilen "Rotom" untereinander');
        assert.match(ITEMS, /replace\(\/-\(form\|variety\)\$\/, ''\)/,
            'die Slugs der Nutzungsdatei tragen -form und -variety, der Pokedex nicht');
    });

    it('JEDER Nutzungs-Slug ergibt einen eindeutigen Namen — nachgerechnet', () => {
        const dex = JSON.parse(l('data/champions_pokedex.json')).entries;
        const bySlug = new Map();
        dex.forEach(e => { if (e.meta && e.meta.slug) bySlug.set(e.meta.slug, e); });
        const namen = new Map();
        Object.keys(USAGE.pokemon).forEach(slug => {
            const rec = USAGE.pokemon[slug];
            let e = bySlug.get(slug) || bySlug.get(slug.replace(/-(form|variety)$/, ''));
            let name;
            if (e) name = e.de;
            else {
                const basis = rec.name || slug;
                const form = slug.split('-').slice(1).filter(x => x !== 'form' && x !== 'variety');
                name = form.length
                    ? `${basis} (${form.map(x => x[0].toUpperCase() + x.slice(1)).join(' ')})`
                    : basis;
            }
            if (!namen.has(name)) namen.set(name, []);
            namen.get(name).push(slug);
        });
        const doppelt = [...namen.entries()].filter(([, s]) => s.length > 1);
        assert.deepEqual(doppelt, [],
            'diese Namen stehen fuer mehrere Slugs und waeren im Raster nicht zu unterscheiden');
    });
});

describe('Effektiv gegen Typ', () => {
    it('Statusattacken werden als Status gezeigt, nicht als ×1', () => {
        assert.match(DEX, /if \(w\.art === 'status'\)/,
            'ohne eigenen Zweig erscheint eine Statusattacke mit einem Schadensfaktor');
        assert.match(DEX, /statusAttackeHint: 'Statusattacke — richtet keinen typabhängigen Schaden an\.'/);
    });

    it('erkennt Statusattacken trotz Grossschreibung in der Quelle', () => {
        // Die Quelle schreibt "Status", nicht "status". Ein
        // Kleinbuchstabenvergleich liess am 09.09.2026 alle 174
        // Statusattacken durch.
        assert.match(DEX, /String\(r\.damage_class \|\| ''\)\.toLowerCase\(\) === 'status'/);
        const status = (RES.entries || []).filter(x => x.cat === 'move'
            && String(x.damage_class || '').toLowerCase() === 'status');
        assert.ok(status.length > 100,
            `nur ${status.length} Statusattacken in der Quelle — dann stimmt das Feld nicht mehr`);
        assert.ok((RES.entries || []).some(x => x.cat === 'move' && x.damage_class === 'Status'),
            'die Quelle schreibt nicht mehr gross — der Vergleich oben ist dann zu pruefen');
    });

    it('sagt "Typ unbekannt", statt einen Typ zu raten', () => {
        assert.match(DEX, /if \(!typ\) return \{ art: 'unbekannt' \};/);
        const mitTyp = new Set((RES.entries || [])
            .filter(x => x.cat === 'move' && x.type).map(x => x.en));
        const genutzt = new Set();
        Object.values(USAGE.pokemon).forEach(p => ['doubles', 'singles'].forEach(f => {
            ((p[f] || {}).move || []).forEach(m => genutzt.add(m.name));
        }));
        const ohne = [...genutzt].filter(m => !mitTyp.has(m));
        /* UMGESCHRIEBEN 22.09.2026: hier stand die feste Zahl 20 auf einer
           Menge, die mit dem Kader waechst. Heute 0 von 423 — viel Luft,
           aber dieselbe Bauart: ein Set, das Attacken zuerst in die
           Nutzungsdatei bekommt, laesst sie steigen. Ein Anteil waechst
           mit. */
        assert.ok(ohne.length < Math.max(20, genutzt.size * 0.05),
            `${ohne.length} von ${genutzt.size} genutzten Attacken ohne Typ — `
            + 'das ist zu viel fuer eine Randnotiz');
    });

    it('ist verdrahtet: Waehler, Neuzeichnen, beide Sprachen', () => {
        assert.match(DEX, /id="sqpGegenTyp"/);
        assert.match(DEX, /gt\.addEventListener\('change'/,
            'ohne Ereignis passiert beim Umschalten nichts');
        ['gegenTypLabel', 'statusAttacke', 'typUnbekannt'].forEach(k => {
            const de = DEX.slice(DEX.indexOf('de: {'), DEX.indexOf('en: {'));
            const en = DEX.slice(DEX.indexOf('en: {'));
            assert.ok(de.includes(k + ':'), `deutsche Beschriftung ${k} fehlt`);
            assert.ok(en.includes(k + ':'), `englische Beschriftung ${k} fehlt`);
        });
    });
});

describe('Shiny in GO', () => {
    it('die angekuendigten Veroeffentlichungen sind gefiltert', () => {
        const skript = l('scripts/scrape_pokemon_go_shiny.py');
        assert.match(skript, /if datum > heute:/,
            'ohne Datumsfilter behauptet die Seite, ein noch nicht erschienenes Shiny sei fangbar');
        assert.ok(SHINY._meta.angekuendigt_uebersprungen != null,
            'die Zahl der uebersprungenen gehoert ins _meta, sonst faellt ein Formatwechsel nicht auf');
    });

    it('ein veroeffentlichtes Shiny belegt, dass es die Art in GO gibt', () => {
        // Nicht nur der Name der Variablen: die Bedingung selbst. Ein
        // `= false` traegt den Namen weiter und schaltet die Korrektur ab.
        assert.match(DEX, /const belegtDurchShiny = \(sh === 'ja' && st === 'nicht-gelistet'\);/,
            'sonst steht "nicht in dieser Liste" neben einem gemeldeten Shiny — ein Widerspruch auf demselben Bildschirm');
        assert.match(DEX, /if \(belegtDurchShiny\) \{[\s\S]{0,160}goDurchShiny/,
            'die Korrektur muss die Zeile auch wirklich ersetzen');
        assert.match(DEX, /goDurchShiny: 'In GO — belegt durch das veröffentlichte Shiny'/);
    });

    it('anders als die Artenliste darf diese Quelle ein Nein sagen', () => {
        assert.match(DEX, /shinyNein: 'Kein veröffentlichtes Shiny'/);
        assert.match(SHINY._meta.lesart_kein_treffer, /belastbar/,
            'die Datei muss begruenden, warum ihr Nein traegt und das der Artenliste nicht');
    });
});

describe('Die Ansicht haengt im Reiter', () => {
    it('Knopf, Wirt, Skript und Service Worker', () => {
        assert.match(HTML, /data-sq-view="items"/, 'der Unterreiter fehlt');
        assert.match(HTML, /id="sideQuestItemsHost"/, 'der Wirt fehlt');
        assert.match(HTML, /js\/app-side-quest-items\.js/, 'das Skript ist nicht eingebunden');
        assert.match(l('service-worker.js'), /app-side-quest-items\.js/,
            'ohne Eintrag im Service Worker fehlt die Datei offline');
        const res = l('js/app-side-quest-resources.js');
        assert.match(res, /items: 'sideQuestItemsHost'/, 'die Ansicht ist nicht registriert');
        assert.match(res, /view === 'items' && window\.sideQuestItems/,
            'ohne diesen Zweig bleibt der Reiter leer');
    });
});
