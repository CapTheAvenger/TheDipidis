/**
 * Der Pocket-Reiter, AUSGEFUEHRT — nicht gegriffen.
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * tests/unit/test-pocket-reiter.js prueft den Quelltext (`assert.match`
 * auf die Datei). Die unabhaengige Abnahme am 07.09.2026 hat gemessen,
 * was das nicht faengt: von zwoelf Mutationen ueberlebten sechs beide
 * vollen Suiten, vier davon in js/ds-pocket.js —
 *
 *   * TIER_ORDNUNG ohne 'D'          -> eine ganze Stufe verschwindet
 *   * Filter 'tier' ohne 'beide'     -> elf Decks fallen aus der Auswahl
 *   * das Vollbild oeffnet nie       -> der Zweck des Reiters
 *   * esc() escaped nicht mehr       -> Deck-Namen kommen von der Quelle
 *
 * Ein Quelltext-Grep kann keine davon sehen. Diese Datei fuehrt den
 * Renderer deshalb wirklich aus, gegen die ECHTEN Daten, und prueft,
 * was dabei herauskommt.
 *
 * KEIN jsdom
 * ----------
 * Der Testschritt in deploy-pages.yml installiert nur papaparse
 * (`npm install --no-save papaparse`). Ein Test, der jsdom braucht,
 * faellt dort um. Der Ersatz unten ist absichtlich winzig: er kann
 * genau das, was ds-pocket.js anfasst, und nichts weiter.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..', '..');
const DATEN = JSON.parse(fs.readFileSync(path.join(WURZEL, 'data', 'pocket_tierlist.json'), 'utf8'));
// Die echten Game8-Decks vom 28.09.2026, eingefroren als Testdaten: fuer
// Namensfaelle, die an genau diesen Namen entdeckt wurden.
const GAME8 = JSON.parse(fs.readFileSync(
    path.join(WURZEL, 'tests', 'fixtures', 'pocket_game8_decks.json'), 'utf8')).decks;

// ── Der kleinste Ersatz, der traegt ──────────────────────────────────

function element(id) {
    return {
        id: id,
        innerHTML: '',
        hidden: true,
        dataset: {},
        style: {},
        _hoerer: {},
        addEventListener(art, f) { (this._hoerer[art] = this._hoerer[art] || []).push(f); },
        querySelector() { return { focus() {} }; },
        querySelectorAll() { return []; }
    };
}

function umgebung(daten) {
    const knoten = {
        pocket: element('pocket'),
        pocketListe: element('pocketListe'),
        pocketOverlay: element('pocketOverlay')
    };
    // Der Koerper muss echt genug sein, dass die Hintergrund-Sperre an ihm
    // arbeiten kann — sonst prueft der Test die Sperre nicht, er glaubt sie.
    const koerperKlassen = new Set();
    const dok = {
        readyState: 'complete',
        body: {
            style: {},
            classList: {
                add(k) { koerperKlassen.add(k); },
                remove(k) { koerperKlassen.delete(k); },
                contains(k) { return koerperKlassen.has(k); }
            }
        },
        documentElement: { style: {}, scrollTop: 0 },
        _hoerer: {},
        getElementById(id) { return knoten[id] || null; },
        addEventListener(art, f) { (this._hoerer[art] = this._hoerer[art] || []).push(f); },
        querySelector() { return null; }
    };
    // Der Verlauf, so klein wie moeglich und so echt wie noetig: der
    // Reiter legt beim Oeffnen einen Eintrag an, damit die Zurueck-Geste
    // des Telefons das Vollbild schliesst statt die Seite zu verlassen.
    // Ohne diesen Ersatz koennte der Test genau das nicht pruefen.
    const verlauf = {
        eintraege: [],
        pushState(zustand) { this.eintraege.push(zustand); },
        back() {
            this.eintraege.pop();
            (fenster._hoerer.popstate || []).forEach(h => h({}));
        }
    };
    const fenster = {
        document: dok,
        navigator: {},
        history: verlauf,
        _hoerer: {},
        addEventListener(art, f) { (this._hoerer[art] = this._hoerer[art] || []).push(f); },
        fetch(pfad, wahl) {
            fenster._geholt = { pfad: pfad, wahl: wahl };
            // Seit dem 16.09.2026 holt der Reiter zwei Dateien; nur den
            // letzten Abruf zu merken hiesse, die Reihenfolge nicht
            // pruefen zu koennen.
            (fenster._alleGeholt = fenster._alleGeholt || []).push({ pfad: pfad, wahl: wahl });
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(
                    /pocket_sets/.test(pfad) ? { sets: { B3b: 'Everyday Wonders' } } : daten),
            });
        },
        getLang: () => 'de',
        console: { warn() {} },
        pageYOffset: 0,
        scrollTo(x, y) { fenster.pageYOffset = y; dok.documentElement.scrollTop = y; }
    };
    fenster.window = fenster;
    return { fenster, dok, knoten, verlauf };
}

/** ds-pocket.js in der Ersatzumgebung laufen lassen. */
function laden(daten) {
    const { fenster, dok, knoten, verlauf } = umgebung(daten);
    const quelle = fs.readFileSync(path.join(WURZEL, 'js', 'ds-pocket.js'), 'utf8');
    const qr = require(path.join(WURZEL, 'js', 'qr-svg.js'));
    fenster.qrSvg = qr;
    const f = new Function('window', 'document', 'navigator', 'fetch', 'getLang', 'console',
                           'history',
                           quelle + '\n;return window.dsPocket;');
    // fetch als Weiterleitung, nicht als feste Bindung: sonst haelt das
    // Modul die urspruengliche Funktion fest, und ein Test, der spaeter
    // einen Netzfehler einsetzt, prueft nichts.
    const holen = function () { return fenster.fetch.apply(fenster, arguments); };
    /* Die ECHTE Symbol-Aufloesung dazu, mit der ECHTEN Datei.
     *
     * ds-pocket.js holt die Sprites ueber window.ArchetypeIcons. Ein
     * Ersatz dafuer wuerde nur beweisen, dass der Ersatz stimmt — und
     * genau in dieser Kette steckt die Arbeit: aus "TRA Garchomp and
     * Mantyke" muessen garchomp und mantyke werden, nicht `tra`.
     * Also laeuft hier das Original. */
    /* Die ECHTE Hintergrund-Sperre dazu. Ein Ersatz wuerde nur zeigen,
     * dass ds-pocket.js irgendetwas aufruft — geprueft werden soll aber,
     * dass die Seite dahinter wirklich stillsteht. */
    new Function('window', 'document',
                 fs.readFileSync(path.join(WURZEL, 'js', 'hintergrund-sperre.js'), 'utf8')
    )(fenster, dok);

    const iconQuelle = fs.readFileSync(path.join(WURZEL, 'js', 'archetype-icons.js'), 'utf8');
    const iconDaten = JSON.parse(fs.readFileSync(
        path.join(WURZEL, 'data', 'archetype_icons.json'), 'utf8'));
    new Function('window', 'globalThis', 'fetch', 'document', iconQuelle)(
        fenster, fenster,
        () => Promise.resolve({ ok: true, json: () => Promise.resolve(iconDaten) }),
        undefined);

    const api = f(fenster, dok, fenster.navigator, holen, fenster.getLang, fenster.console,
                  verlauf);
    return { api, fenster, dok, knoten, verlauf, iconsBereit: fenster.ArchetypeIcons.preload() };
}

/** Einen Klick auf ein Element mit diesem Attribut nachstellen. */
function klick(knoten, attribut, wert) {
    const ziel = {
        closest(w) {
            return w === '[' + attribut + ']'
                ? { getAttribute: (a) => (a === attribut ? wert : null) }
                : null;
        }
    };
    (knoten.pocket._hoerer.click || []).forEach(h => h({ target: ziel }));
}

async function gezeichnet(daten) {
    const u = laden(daten);
    // Erst die Symboldatei, dann zeichnen — sonst faenden die Zeilen
    // die Sprites noch nicht, genau wie im Browser vor dem Nachzug.
    await u.iconsBereit;
    u.api.render();
    await new Promise(r => setTimeout(r, 0));
    return u;
}

describe('Pocket-Reiter: die Liste entsteht wirklich', () => {
    let u;
    before(async () => { u = await gezeichnet(DATEN); });

    it('zeichnet jedes Deck der Datei', () => {
        const zeilen = (u.knoten.pocketListe.innerHTML.match(/class="pk-zeile"/g) || []).length;
        assert.equal(zeilen, DATEN.decks.length,
            `${zeilen} Zeilen gegen ${DATEN.decks.length} Decks in der Datei — ` +
            `die Fusszeile behauptet die Zahl der Datei, also muss sie auch dastehen`);
    });

    it('jede Stufe bekommt ihren eigenen Abschnitt mit der richtigen Zahl', () => {
        // Faengt TIER_ORDNUNG ohne 'D' (ueberlebende Mutation 07.09.2026).
        //
        // DECKS OHNE STUFE zaehlen hier nicht mit: Game8 fuehrt seit dem
        // 16.09.2026 „Team Rocket's Wobbuffet" als Untiered, der Scraper
        // schreibt dafuer `tier: null`. Die bekommen KEINEN Stufen-
        // Abschnitt, sondern den eigenen Kasten „Ohne bekannte Stufe"
        // darunter — geprueft im Fall gleich danach.
        const zaehlung = {};
        const ohneStufe = [];
        DATEN.decks.forEach(d => {
            if (d.tier === null || d.tier === undefined || d.tier === '') {
                ohneStufe.push(d);
                return;
            }
            zaehlung[d.tier] = (zaehlung[d.tier] || 0) + 1;
        });
        const html = u.knoten.pocketListe.innerHTML;
        Object.keys(zaehlung).forEach(stufe => {
            const re = new RegExp('Stufe ' + stufe.replace('+', '\\+') +
                                  ' <span class="pk-stufe-zahl">' + zaehlung[stufe] + '<');
            assert.match(html, re,
                `der Abschnitt "Stufe ${stufe}" mit ${zaehlung[stufe]} Decks fehlt`);
        });
        const abschnitte = (html.match(/class="pk-stufe"/g) || []).length;
        assert.equal(abschnitte, Object.keys(zaehlung).length + (ohneStufe.length ? 1 : 0),
            'die Zahl der Abschnitte passt nicht zu den Stufen in der Datei');
        if (ohneStufe.length) {
            assert.match(html, /Ohne bekannte Stufe|Tier not recognised/,
                'die Decks ohne Stufe haben keinen eigenen Kasten — dann fallen '
                + 'sie entweder weg oder stehen unter einer Stufe, die sie nicht haben');
        }
    });

    it('holt die Daten ohne Zwischenspeicher', () => {
        /* Seit dem 16.09.2026 holt der Reiter ZWEI Dateien: die
           Deckliste und die Set-Namen. Geprueft wird deshalb nicht mehr
           „genau dieser eine Abruf", sondern die Eigenschaft, auf die es
           ankommt — die Deckliste kommt ZUERST (der Reiter ist ohne die
           Namen voll bedienbar, umgekehrt nicht), und KEIN Abruf nimmt
           den Zwischenspeicher. */
        const alle = u.fenster._alleGeholt || [u.fenster._geholt];
        assert.equal(alle[0].pfad, 'data/pocket_tierlist.json',
            'die Deckliste muss der erste Abruf sein — sonst wartet der '
            + 'Reiter auf eine Datei, die er zum Zeichnen nicht braucht');
        alle.forEach(g => assert.equal(g.wahl.cache, 'no-store',
            `${g.pfad} wurde mit Zwischenspeicher geholt`));
    });
});

describe('Pocket-Reiter: Zahlen und Regel kommen aus der Datei', () => {
    const prozent = (x) => (x * 100).toFixed(1).replace('.', ',') + ' %';

    it('jede Zeile traegt Anteil, Siegquote und Listenzahl IHRES Decks', async () => {
        const u = await gezeichnet(DATEN);
        const zeilen = u.knoten.pocketListe.innerHTML.split('class="pk-zeile"').slice(1);
        assert.equal(zeilen.length, DATEN.decks.length);
        const nachIndex = {};
        zeilen.forEach(z => { nachIndex[(z.match(/data-pk-deck="(\d+)"/) || [])[1]] = z; });
        DATEN.decks.forEach((d, i) => {
            const z = nachIndex[String(i)];
            assert.ok(z, d.name + ': keine Zeile');
            assert.ok(z.includes(prozent(d.anteil) + ' der Listen'), d.name + ': Anteil fehlt');
            assert.ok(z.includes('WR* ' + prozent(d.quote)), d.name + ': Siegquote fehlt');
            assert.ok(z.includes(d.listen + ' Listen'), d.name + ': Listenzahl fehlt');
        });
    });

    it('innerhalb einer Stufe steht die Reihenfolge der Datei (nach Anteil)', async () => {
        const u = await gezeichnet(DATEN);
        const reihe = (u.knoten.pocketListe.innerHTML.match(/data-pk-deck="(\d+)"/g) || [])
            .map(m => Number(m.match(/\d+/)[0]));
        const ordnung = DATEN._meta.stufenregel.map(r => r.stufe);
        const soll = DATEN.decks.map((d, i) => i)
            .sort((a, b) => ordnung.indexOf(DATEN.decks[a].tier) - ordnung.indexOf(DATEN.decks[b].tier) || a - b);
        assert.deepEqual(reihe, soll);
    });

    it('die angeschriebene Stufenregel ist die aus _meta — und folgt ihr (Verfaelschungsprobe)', async () => {
        const u = await gezeichnet(DATEN);
        const h = u.knoten.pocketListe.innerHTML;
        DATEN._meta.stufenregel.filter(r => r.anteil_ab != null).forEach(r => {
            assert.ok(h.includes(r.stufe + ': Anteil ab ' + prozent(r.anteil_ab)),
                'die Regel fuer ' + r.stufe + ' steht nicht so da wie in der Datei');
        });
        const anders = JSON.parse(JSON.stringify(DATEN));
        anders._meta.stufenregel[0].anteil_ab = 0.123;
        const u2 = await gezeichnet(anders);
        assert.ok(u2.knoten.pocketListe.innerHTML.includes('Anteil ab 12,3 %'),
            'die Regel im Text folgt der Datei nicht — dann steht sie im Code');
    });

    it('die Fusszeile nennt Decks ohne Code, Archetypen unter der Schwelle und laufende Turniere', async () => {
        const probe = JSON.parse(JSON.stringify(DATEN));
        probe._meta.ohne_code = [{ name: 'TESTDECK OHNE CODE', grund: 'TESTGRUND' }];
        probe._meta.unter_min_listen = { archetypen: 7, listen: 31 };
        probe._meta.offene_turniere = [{ id: 'x', name: 'TEST', datum: '2026-09-29', grund: 'laeuft' }];
        const u = await gezeichnet(probe);
        const h = u.knoten.pocketListe.innerHTML;
        assert.ok(h.includes('TESTDECK OHNE CODE (TESTGRUND)'), 'Deck ohne Code nicht benannt');
        assert.ok(h.includes('7 weitere Archetypen mit zusammen 31 Listen'), 'Schwelle nicht benannt');
        assert.ok(h.includes('1 Turniere sind noch nicht dabei'), 'laufende Turniere nicht benannt');
    });

    it('die Warnung erscheint ab dem dritten Tag ohne Auffrischung, nicht vorher', async () => {
        const tage = (n) => { const d = JSON.parse(JSON.stringify(DATEN));
            d._meta.abgerufen = new Date(Date.now() - n * 86400000 - 60000).toISOString(); return d; };
        assert.doesNotMatch((await gezeichnet(tage(2))).knoten.pocketListe.innerHTML, /pk-alt/);
        assert.match((await gezeichnet(tage(3))).knoten.pocketListe.innerHTML, /pk-alt/);
    });
});

describe('Pocket-Reiter: das Vollbild', () => {
    it('geht auf und traegt ein Muster', async () => {
        // Faengt "das Vollbild oeffnet nie" (ueberlebende Mutation).
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        const ov = u.knoten.pocketOverlay;
        assert.equal(ov.hidden, false, 'das Vollbild ist nach dem Antippen verborgen');
        assert.match(ov.innerHTML, /<svg /, 'kein Muster im Vollbild');
        assert.match(ov.innerHTML, /fill="#000000"/, 'das Muster ist nicht schwarz');
        assert.match(ov.innerHTML, /fill="#ffffff"/, 'der Grund ist nicht weiss');
    });

    it('traegt Name, Stufe und Quelle IM Bild', () => {
        return gezeichnet(DATEN).then(u => {
            klick(u.knoten, 'data-pk-deck', '0');
            const h = u.knoten.pocketOverlay.innerHTML;
            const d = DATEN.decks[0];
            assert.ok(h.includes(d.name), 'der Deck-Name fehlt im Vollbild');
            assert.match(h, /Limitless/, 'die Quelle fehlt im Vollbild');
            assert.ok(h.includes('WR* '), 'die Siegquote fehlt im Vollbild');
            assert.match(h, /Stand \d\d\.\d\d\.\d{4}/, 'das Datum fehlt im Vollbild');
        });
    });

    it('schliesst wieder', async () => {
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        assert.equal(u.knoten.pocketOverlay.hidden, false);
        klick(u.knoten, 'data-pk-zu', '1');
        assert.equal(u.knoten.pocketOverlay.hidden, true, 'das Vollbild bleibt offen');
    });
});

/* Sprites vor dem Deck-Namen.
 *
 * Vom Betreiber am 10.09.2026 gewuenscht. Die Arbeit steckt nicht im
 * Zeichnen, sondern darin, aus einem Game8-Decknamen die richtigen
 * Pokemon zu bekommen: dort stehen Set-Kuerzel ("PD Espeon", "RS
 * Heliolisk", "TRA Garchomp", "CB Magnezone", "EW Butterfree"),
 * Kartenzusaetze ("ex"), Formworte ("Mega", "Alolan", "Teal Mask")
 * und Beiwerk ("and 18 Trainers") durcheinander.
 *
 * GERATEN WIRD NICHTS: nur ein Pokemon, das im Decknamen genannt wird
 * UND als Karte im Deck steht, bekommt ein Bild. Deshalb faellt "TRA"
 * von allein weg — es ist keine Karte, "Garchomp" schon.
 *
 * Diese Datei prueft die Regel an den ECHTEN Daten, ueber alle Decks.
 * Sie behauptet keine Wochenwerte: welche Decks Game8 diese Woche
 * fuehrt, ist ihr egal. */
describe('Pocket-Reiter: die Sprites vor dem Namen', () => {

    /* Die ECHTE Funktion aus dem Modul, nicht ein Nachbau. Ein Nachbau
       haette nur bewiesen, dass der Nachbau stimmt. */
    let _api = null;
    function arten(d) {
        if (!_api) _api = laden(DATEN).api;
        return _api._intern.benannteArten(d);
    }
    // benannteArten braucht die Symboldatei nicht — sie liest nur den
    // Decknamen gegen die Kartenliste. Deshalb kein await noetig.


    it('jedes Deck bekommt mindestens ein Bild', async () => {
        const u = await gezeichnet(DATEN);
        const zeilen = u.knoten.pocketListe.innerHTML.split('class="pk-zeile"');
        // erstes Stueck ist der Kopf vor der ersten Zeile
        const echte = zeilen.slice(1);
        assert.equal(echte.length, DATEN.decks.length,
            `${echte.length} Zeilen fuer ${DATEN.decks.length} Decks`);
        const ohne = echte.filter(z => !z.includes('pk-sprite'));
        assert.deepEqual(ohne.map(z => (z.match(/pk-name">([^<]*)/) || [])[1]), [],
            'diese Decks bekommen kein einziges Bild — dann steht die '
            + 'Aufloesung ueber die Kartenliste nicht mehr');
    });

    it('kein Bild ohne Karte im Deck', () => {
        /* DIE Zusicherung. Sie faellt, sobald jemand anfaengt, aus dem
           Decknamen zu raten statt gegen die Kartenliste zu pruefen —
           dann kaemen Slugs wie `tra` oder `rocket` heraus, die es
           nicht gibt. */
        const norm = (v) => String(v || '').toLowerCase().replace(/['\u2018\u2019]/g, '');
        for (const d of DATEN.decks) {
            const gefunden = arten(d);
            for (const a of gefunden) {
                const drin = (d.pokemon || []).some(p => p.name === a);
                assert.ok(drin, `${d.name}: "${a}" ist keine Karte in diesem Deck`);
                assert.ok(norm(d.name).includes(norm(a)),
                    `${d.name}: "${a}" wird im Namen gar nicht genannt`);
            }
        }
    });

    it('jede Zeile traegt ein oder zwei Bilder, nie mehr', async () => {
        /* GLEICHHEIT statt "hoechstens": eine Ungleichung gegen Live-Daten
           waere genau das, was tests/unit/test-testdaten-wachhund.js
           verhindern soll. Ein Deck nennt ein oder zwei Pokemon — drei
           waere ein Fehler in der Auswahl, null ein Fehler in der
           Aufloesung. Welche Decks es diese Woche sind, ist egal. */
        const u = await gezeichnet(DATEN);
        for (const stueck of u.knoten.pocketListe.innerHTML.split('class="pk-zeile"').slice(1)) {
            const n = (stueck.match(/class="pk-sprite"/g) || []).length;
            assert.ok(n === 1 || n === 2, `eine Zeile traegt ${n} Bilder`);
        }
    });

    it('ein Name, der in einem anderen steckt, wird nicht doppelt gezaehlt', () => {
        /* "Mega Lucario ex and Hitmonlee" fuehrt BEIDE als Karte:
           "Mega Lucario ex" und "Lucario". Ohne die Sperre auf schon
           belegte Stellen im Namen kam zweimal Lucario heraus und
           Hitmonlee gar nicht. */
        const d = GAME8.find(x => /Lucario/.test(x.name) && /Hitmonlee/.test(x.name));
        assert.ok(d, 'das eingefrorene Game8-Deck fehlt');
        const gefunden = arten(d);
        assert.ok(gefunden.some(a => /Hitmonlee/.test(a)),
            `Hitmonlee fehlt: ${JSON.stringify(gefunden)}`);
        const lucarios = gefunden.filter(a => /Lucario/.test(a));
        assert.equal(lucarios.length, 1,
            `Lucario kommt ${lucarios.length}-mal vor: ${JSON.stringify(gefunden)}`);
    });

    it('der laengere Name an derselben Stelle gewinnt', () => {
        // Sonst schlaegt "Altaria" das "Mega Altaria ex", in dem es steckt.
        const d = GAME8.find(x => /^Mega Altaria ex and PD Espeon/.test(x.name));
        assert.ok(d, 'das eingefrorene Game8-Deck fehlt');
        assert.deepEqual(arten(d), ['Mega Altaria ex', 'Espeon']);
    });

    it('das Bild traegt einen leeren Alternativtext', async () => {
        /* Der Deck-Name steht unmittelbar daneben. Ein gefuellter
           Alternativtext liesse eine Vorlesehilfe alles doppelt sagen. */
        const u = await gezeichnet(DATEN);
        const html = u.knoten.pocketListe.innerHTML;
        assert.ok(!/class="pk-sprite"[^>]*alt="[^"]+"/.test(html),
            'ein Sprite traegt einen gefuellten Alternativtext');
        assert.match(html, /class="pk-sprites" aria-hidden="true"/,
            'die Bildgruppe ist fuer Vorlesehilfen nicht ausgeblendet');
    });

    it('die Bilder tragen keine Ladeverzoegerung', async () => {
        /* GEMESSEN live am 10.09.2026: mit loading="lazy" luden 3 von
           63 Bildern. Die uebrigen 60 blieben dauerhaft bei
           naturalWidth 0 — auch nach dem Scrollen, und ohne dass
           onerror feuerte. Uebrig blieb auf jeder Zeile eine leere
           Luecke von 26 px: schlimmer als gar keine Bilder. Dieselben
           Bilder ohne das Attribut: 63 von 63, null Fehler.

           66 Sprites von je ein bis drei Kilobyte, von einem Server,
           den die Seite ohnehin fuer jedes Archetyp-Symbol benutzt —
           die Verzoegerung spart hier nichts. */
        const u = await gezeichnet(DATEN);
        const html = u.knoten.pocketListe.innerHTML;
        assert.ok(!/class="pk-sprite"[^>]*loading=/.test(html),
            'ein Sprite traegt wieder loading="lazy" — dann bleiben die '
            + 'Bilder aus und auf jeder Zeile steht eine leere Luecke');
    });

    it('ein fehlendes Bild versteckt sich, statt eine Luecke zu lassen', async () => {
        const u = await gezeichnet(DATEN);
        assert.match(u.knoten.pocketListe.innerHTML, /onerror="this\.style\.display=/,
            'ohne onerror bliebe bei einer fehlenden Datei ein leerer '
            + 'Kasten vor dem Namen stehen');
    });
});

/* Der Weg zurueck aus dem Vollbild.
 *
 * BEFUND (10.09.2026, vom Betreiber am Telefon gemeldet: "Man kommt von
 * hier aus nicht zurueck"). Es gab genau einen Ausweg — den Knopf —, und
 * der war am Telefon nicht erreichbar: die Polsterung des Overlays
 * beachtete den unteren Geraeteeinzug, aber nicht den oberen. Gemessen
 * bei 390 px lag seine Oberkante 20 px unter dem Bildschirmrand, bei
 * einer Dynamic Island (59 px Einzug) also vollstaendig darunter. Und er
 * scrollte mit: nach 25 px stand er schon bei -5 px.
 *
 * Escape gibt es am Telefon nicht, und ohne Verlaufseintrag verliess die
 * Zurueck-Geste die ganze Anwendung.
 *
 * Geprueft werden hier die WEGE, nicht ihre Pixel — die Geometrie steht
 * in den CSS-Zusicherungen weiter unten. */
describe('Pocket-Reiter: der Weg zurueck aus dem Vollbild', () => {

    it('der Knopf steht in der klebenden Leiste, nicht frei im Fluss', async () => {
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        const html = u.knoten.pocketOverlay.innerHTML;
        assert.match(html, /<div class="pk-leiste">\s*<button[^>]*data-pk-zu/,
            'der Schliessknopf steht wieder frei im Fluss — dann scrollt '
            + 'er weg und liegt am Telefon unter der Statusleiste');
    });

    it('das Oeffnen legt einen Verlaufseintrag an', async () => {
        const u = await gezeichnet(DATEN);
        assert.equal(u.verlauf.eintraege.length, 0);
        klick(u.knoten, 'data-pk-deck', '0');
        assert.equal(u.verlauf.eintraege.length, 1,
            'ohne Eintrag verlaesst die Zurueck-Geste die ganze Anwendung');
        assert.equal(u.verlauf.eintraege[0].dsPocket, 'pocketOverlay',
            'der Eintrag traegt keine Marke — dann laesst er sich nicht '
            + 'von einem fremden unterscheiden');
    });

    it('die Zurueck-Geste schliesst das Vollbild', async () => {
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        assert.equal(u.knoten.pocketOverlay.hidden, false);
        u.verlauf.back();
        assert.equal(u.knoten.pocketOverlay.hidden, true,
            'die Zurueck-Geste laesst das Vollbild offen — am Telefon ist '
            + 'sie der Reflex');
        assert.equal(u.fenster.HintergrundSperre.aktiv(), false,
            'die Hintergrund-Sperre bleibt stehen — die Seite waere danach '
            + 'gar nicht mehr zu bewegen');
        assert.equal(u.dok.body.style.position, '',
            'der Koerper bleibt auf position:fixed festgenagelt');
    });

    it('das Vollbild haelt die Seite dahinter an', async () => {
        // Gemeldet am 10.09.2026: „Wenn ich in der Ansicht bin, kann ich
        // manchmal die Seite dahinter scrollen." Die Sperre gab es, sie
        // lief nur ueber body.style.overflow und war damit wirkungslos.
        const u = await gezeichnet(DATEN);
        u.fenster.pageYOffset = 420;
        u.dok.documentElement.scrollTop = 420;
        klick(u.knoten, 'data-pk-deck', '0');
        assert.equal(u.fenster.HintergrundSperre.aktiv(), true,
            'das Vollbild sperrt die Seite nicht — der Hintergrund scrollt mit');
        assert.equal(u.dok.body.style.position, 'fixed');
        assert.equal(u.dok.body.style.top, '-420px',
            'ohne den gemerkten Versatz springt die Seite beim Oeffnen an '
            + 'ihren Anfang');
        u.api.schliesse();
        assert.equal(u.fenster.HintergrundSperre.aktiv(), false);
        assert.equal(u.fenster.pageYOffset, 420,
            'der Leser landet nach dem Schliessen an einer anderen Stelle '
            + 'als vor dem Oeffnen');
    });

    it('nach der Zurueck-Geste wird nicht ein zweites Mal zurueckgesprungen', async () => {
        // Sonst faellt die Anwendung eine Ansicht zu weit zurueck: der
        // Eintrag ist vom popstate schon verbraucht.
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        u.verlauf.back();
        assert.equal(u.verlauf.eintraege.length, 0);
        // Ein zweites back() darf nichts mehr aus unserem Bestand nehmen.
        const vorher = u.verlauf.eintraege.length;
        u.verlauf.back();
        assert.equal(u.verlauf.eintraege.length, vorher,
            'es wurde ein Eintrag zu viel verbraucht');
    });

    it('der Knopf raeumt seinen Verlaufseintrag wieder ab', async () => {
        // Sonst sammeln sich Eintraege an, und die Zurueck-Geste muesste
        // danach mehrfach gedrueckt werden, um die Seite zu verlassen.
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        assert.equal(u.verlauf.eintraege.length, 1);
        klick(u.knoten, 'data-pk-zu', '1');
        assert.equal(u.knoten.pocketOverlay.hidden, true);
        assert.equal(u.verlauf.eintraege.length, 0,
            'der Eintrag bleibt liegen — dann braucht es zwei Zurueck, um '
            + 'die Seite zu verlassen');
    });

    it('zweimal oeffnen legt nicht zwei Eintraege an', async () => {
        const u = await gezeichnet(DATEN);
        klick(u.knoten, 'data-pk-deck', '0');
        klick(u.knoten, 'data-pk-deck', '1');
        assert.equal(u.verlauf.eintraege.length, 1,
            'ein Deckwechsel im offenen Vollbild haeuft Eintraege an');
    });
});

describe('Pocket-Reiter: was schiefgehen kann', () => {
    it('Deck-Namen werden maskiert', async () => {
        // Faengt "esc() escaped nicht mehr" (ueberlebende Mutation).
        // Die Namen kommen von der Quelle, nicht von uns.
        const boese = JSON.parse(JSON.stringify(DATEN));
        boese.decks[0].name = '<img src=x onerror=alert(1)>';
        const u = await gezeichnet(boese);
        const h = u.knoten.pocketListe.innerHTML;
        assert.doesNotMatch(h, /<img src=x/, 'ein Deck-Name kam ungefiltert ins HTML');
        assert.match(h, /&lt;img src=x/, 'der Name wurde gar nicht gezeigt');
    });

    it('eine unbekannte Stufe verschwindet nicht still', async () => {
        // Der Riegel, den ds-post-quellen.js schon hatte und der hier
        // fehlte (Abnahme 07.09.2026). tier:null ist ueber den
        // Kollisionsweg des Scrapers erreichbar.
        const fremd = JSON.parse(JSON.stringify(DATEN));
        fremd.decks[0].tier = 'S+';
        fremd.decks[1].tier = null;
        const u = await gezeichnet(fremd);
        const h = u.knoten.pocketListe.innerHTML;
        const zeilen = (h.match(/class="pk-zeile"/g) || []).length;
        assert.equal(zeilen, fremd.decks.length,
            `${zeilen} von ${fremd.decks.length} Decks gezeichnet — zwei sind ` +
            `still verschwunden, waehrend die Fusszeile weiter alle behauptet`);
        assert.match(h, /Ohne bekannte Stufe/, 'die fremde Stufe wird nicht angeschrieben');
        assert.ok(h.includes('S+'), 'die unbekannte Stufe wird nicht benannt');
    });

    it('ein Deck ohne Code zeigt den Grund, kein Muster und keinen Kopierknopf', async () => {
        const ohne = JSON.parse(JSON.stringify(DATEN));
        ohne.decks[0].code = null;
        ohne.decks[0].code_fehlt = 'TESTGRUND: Karte fehlt in der Tabelle';
        const u = await gezeichnet(ohne);
        assert.match(u.knoten.pocketListe.innerHTML, /ohne Scan-Code/, 'die Zeile sagt es nicht');
        klick(u.knoten, 'data-pk-deck', '0');
        const h = u.knoten.pocketOverlay.innerHTML;
        assert.match(h, /TESTGRUND: Karte fehlt in der Tabelle/, 'der Grund fehlt im Vollbild');
        assert.doesNotMatch(h, /<svg /, 'ein Muster ohne Code');
        assert.doesNotMatch(h, /data-pk-kopieren/, 'ein Kopierknopf ohne Code');
        assert.doesNotMatch(h, />null</, '„null" steht als Code da');
    });

    it('eine leere Datei meldet das, statt nichts zu zeigen', async () => {
        const u = await gezeichnet({ _meta: {}, decks: [] });
        assert.match(u.knoten.pocketListe.innerHTML, /Tier-Liste ist leer/);
    });

    it('ein Netzfehler wird gemeldet, nicht verschwiegen', async () => {
        const u = laden(DATEN);
        u.fenster.fetch = () => Promise.resolve({ ok: false, status: 503 });
        u.api.render();
        await new Promise(r => setTimeout(r, 0));
        assert.match(u.knoten.pocketListe.innerHTML, /is-fehler/,
            'ein 503 hinterlaesst einen leeren Reiter ohne Erklaerung');
    });

    it('ohne QR-Erzeuger kommt der Code als Text', async () => {
        const u = laden(DATEN);
        u.fenster.qrSvg = undefined;
        u.api.render();
        await new Promise(r => setTimeout(r, 0));
        const i = DATEN.decks.findIndex(d => d.code);
        klick(u.knoten, 'data-pk-deck', String(i));
        const h = u.knoten.pocketOverlay.innerHTML;
        assert.match(h, /nicht zeichnen/, 'es bleibt ein leeres weisses Feld stehen');
        assert.ok(h.includes(DATEN.decks[i].code), 'der Code steht nirgends zum Abschreiben');
    });
});

/* SET-NAMEN (16.09.2026). Betreiber: „können wir bei den Details von den
   Karten auch den Set Namen schreiben weil mit B3 und A2 und so kann ich
   nichts anfangen". Die Gruppierung nach Game8s Set-Abschnitten ist mit
   dem Wechsel auf Limitless (29.09.2026) entfallen — Limitless fuehrt
   keine solchen Abschnitte. */
describe('Pocket: die Kartenliste nennt das Set beim Namen', () => {
    const MIT_KARTEN = {
        _meta: {}, decks: [{
            name: 'Testdeck', tier: 'B', anteil: 0.02, quote: 0.5, listen: 12,
            siege: 6, niederlagen: 6, unentschieden: 0,
            code: 'x', pokemon: [{ name: 'Bonsly', anzahl: 1, set: 'B3b', nummer: '078' }],
            trainer: [{ name: 'Cyrus', anzahl: 1, set: 'ZZ9', nummer: '001' }],
        }],
    };

    it('schreibt den Klarnamen vor die Kennung — und erfindet keinen', async () => {
        const u = await gezeichnet(MIT_KARTEN);
        // Die Namenstabelle kommt als ZWEITER Abruf, nach dem Zeichnen.
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        klick(u.knoten, 'data-pk-deck', '0');
        const html = u.knoten.pocketOverlay.innerHTML;
        assert.ok(html.indexOf('Everyday Wonders') !== -1,
            'der Set-Name fehlt — mit „B3b" allein kann niemand einkaufen gehen');
        /* NUR der sichtbare Text zaehlt. Die Kennung steht ausserdem im
           title-Attribut — wer gegen das ganze HTML prueft, haelt eine
           Zeile fuer heil, in der sichtbar gar keine Kennung mehr
           steht. */
        const sichtbar = html.replace(/<[^>]+>/g, '|');
        assert.ok(sichtbar.indexOf('B3b-078') !== -1,
            'die Kennung fehlt sichtbar — sie steht auf der Karte und ist das, '
            + 'was man im Laden abgleicht');
        assert.ok(sichtbar.indexOf('ZZ9-001') !== -1,
            'eine unbekannte Kennung muss sichtbar stehen bleiben');
        assert.ok(html.indexOf('<b>Everyday Wonders</b>') !== -1,
            'der bekannte Name steht nicht als Name da');
        assert.equal((html.match(/<b>/g) || []).length, 1,
            'fuer die unbekannte Kennung wurde ein Name erfunden');
    });
});

/* ── EIN DECK OHNE STUFE (16.09.2026) ─────────────────────────────────
   Game8 fuehrte „Team Rocket's Wobbuffet" als Untiered; der
   damalige Scraper schrieb dafuer `tier: null`. Der Zweig fuer unbekannte
   Stufen gab es seit dem 07.09. — betreten hat ihn nie ein Deck, und
   deshalb ist drei Wochen nicht aufgefallen, dass er als einziger
   Zweig KEINE Sprites zeichnet. Ein Sonderweg, den nichts betritt, ist
   kein Sonderweg, sondern eine Falle mit Zeitzuender. */
describe('Pocket: ein Deck ohne Stufe', () => {
    const OHNE_STUFE = {
        _meta: { anzahl: 2 },
        decks: [
            { name: 'Pikachu ex', tier: 'S', archiv: '1', quelle_liste: 'tier',
              set_abschnitt: '', pokemon: [{ name: 'Pikachu ex', anzahl: 2, set: 'A1', nummer: '001' }] },
            { name: 'Wobbuffet', tier: null, archiv: '2', quelle_liste: 'set',
              set_abschnitt: 'New Alpha Decks',
              pokemon: [{ name: 'Wobbuffet', anzahl: 2, set: 'A1', nummer: '002' }] },
        ],
    };

    it('faellt nicht aus der Liste und bekommt trotzdem sein Bild', async () => {
        const u = await gezeichnet(OHNE_STUFE);
        const html = u.knoten.pocketListe.innerHTML;
        assert.ok(html.indexOf('Wobbuffet') !== -1,
            'das Deck ohne Stufe fehlt ganz');
        assert.match(html, /Ohne bekannte Stufe|Tier not recognised/,
            'es fehlt der eigene Kasten samt Begruendung');
        // Der Kern: auch diese Zeile traegt ein Bild.
        const nachWobbuffet = html.slice(html.indexOf('Ohne bekannte Stufe'));
        assert.ok(nachWobbuffet.indexOf('pk-sprite') !== -1,
            'die Zeile ohne Stufe bekommt kein Bild — sie stuende als einzige '
            + 'der Liste nackt da');
    });
});
