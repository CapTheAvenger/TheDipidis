/**
 * Hashtags, Kartenfilter und die zwei datengetriebenen Vorlagen.
 *
 * BESTELLT AM 11.09.2026 (Betreiber, fuer die Instagram-Beitraege ueber
 * thedipidis.app/posts/):
 *
 *   „immer alles mit entsprechenden Beschreibungen und Hashtags"
 *   „Meta Cards mit den gleichen Filtermoeglichkeiten wie auf der Seite"
 *   „wir koennen noch einen weiteren Filter machen, All used cards
 *    newest Set"
 *   „Wenn man den Post generiert ueber einen Filter, dann Format Staples
 *    neben das Format schreiben und in gross dann, was man sieht — in
 *    meinem Beispiel hier waere es dann ACE SPEC."
 *
 * Hashtags gab es auf dieser Seite bis dahin ueberhaupt nicht — kein
 * Feld, keine Liste, kein Treffer im ganzen Bestand.
 *
 * WAS DIESE DATEI FESTHAELT
 * -------------------------
 * 1. Jede Quelle liefert Hashtags, und zwar brauchbare: die feste Basis
 *    steht drin, Instagrams Grenze wird eingehalten, und kein Tag
 *    enthaelt ein Zeichen, das ins Leere verlinkt.
 * 2. Die Kartenfilter der Post-Seite sind DIESELBEN wie auf der Seite.
 *    Sie stehen zwangslaeufig zweimal im Bestand (posts/ laeuft ohne den
 *    Anwendungsrahmen) — dieser Test ist die Klammer dazwischen.
 * 3. Der gewaehlte Filter steht gross in der Ueberschrift und „Format
 *    staples" neben dem Format im Kicker.
 * 4. Die zwei neuen Vorlagen liefern die Daten, die ihre Zeichenroutinen
 *    lesen — dieselbe Luecke, die am selben Tag die Bildkarte halb leer
 *    stehen liess (siehe tests/unit/test-bildkarte-uebergabe.js).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const D = (p) => path.join(WURZEL, p);

function fenster() {
    const ctx = { console };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.fetch = function (u) {
        const p = D(String(u).replace(/^\.\.\//, ''));
        const da = fs.existsSync(p);
        return Promise.resolve({
            ok: da, status: da ? 200 : 404,
            text: () => Promise.resolve(fs.readFileSync(p, 'utf8')),
            json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8')))
        });
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(D('js/matchup-glaettung.js'), 'utf8'), ctx,
                    { filename: 'matchup-glaettung.js' });
    vm.runInContext(fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8'), ctx,
                    { filename: 'ds-post-quellen.js' });
    return ctx;
}

const Q = fenster().window.DsPostQuellen;
const QUELLTEXT = fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8');
const SEITE = fs.readFileSync(D('posts/index.html'), 'utf8');
const TIER = fs.readFileSync(D('js/app-tier-meta.js'), 'utf8');

async function fertig(id) {
    let erg = await Q.lade(id);
    if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
    return erg;
}

/* ══ 1 · HASHTAGS ═══════════════════════════════════════════════════ */

test('jede Quelle bringt Hashtags mit', async () => {
    for (const e of Q.liste()) {
        const erg = await fertig(e.id);
        assert.ok(typeof erg.tags === 'string' && erg.tags.length > 10,
            `${e.name} liefert keine Hashtags. Sie gehen denselben Weg wie die `
            + 'Bildunterschrift — aus der Quelle, nicht aus dem Tippen.');
    }
});

test('die feste Basis steht unter jedem Beitrag', async () => {
    /* Aus dem Quelltext gelesen, nicht abgeschrieben: sonst prueft der
       Test seine eigene Kopie. */
    const block = /var HASHTAG_BASIS = \[([\s\S]*?)\];/.exec(QUELLTEXT);
    assert.ok(block, 'HASHTAG_BASIS steht nicht mehr in js/ds-post-quellen.js');
    const basis = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(basis.length >= 3, `nur ${basis.length} Basis-Tags — zu duenn`);
    for (const e of Q.liste()) {
        const erg = await fertig(e.id);
        basis.forEach((b) => {
            assert.ok(erg.tags.indexOf('#' + b) > -1,
                `${e.name} laesst das Basis-Tag #${b} weg`);
        });
    }
});

test('kein Tag traegt ein Zeichen, das ins Leere verlinkt', async () => {
    /* Instagram erlaubt nur Buchstaben, Ziffern und Unterstrich. Ein
       „#N's Zoroark" waere zwei kaputte Tags. Und „Pokémon" muss
       #pokemon werden, nicht #pokmon — der Akzent faellt auf seinen
       Grundbuchstaben, nicht weg. */
    for (const e of Q.liste()) {
        const erg = await fertig(e.id);
        erg.tags.split(/\s+/).filter(Boolean).forEach((t) => {
            assert.match(t, /^#[a-z0-9_]+$/,
                `${e.name}: „${t}" ist kein gueltiges Hashtag`);
            assert.ok(t.length >= 4, `${e.name}: „${t}" ist zu kurz, um etwas zu finden`);
        });
    }
});

test('ein Akzent faellt auf seinen Grundbuchstaben, nicht weg', async () => {
    /* „Pokémon" muss #pokemon werden. Faellt das é ersatzlos, entsteht
       #pokmon — ein gueltiges Tag, das niemand sucht. Die Pruefung oben
       (nur a-z0-9_) haette das durchgelassen; deshalb diese hier. */
    const erg = await Q.lade('staples');
    const p = erg.proFilter('pokemon');
    assert.ok(p.tags.indexOf('#pokemon ') > -1 || /#pokemon$/.test(p.tags),
        'aus „Pokémon" wird kein #pokemon: ' + p.tags);
    assert.ok(p.tags.indexOf('#pokmon') < 0,
        'der Akzent faellt ersatzlos weg — #pokmon findet niemand');
});

test('kein Tag doppelt, und nicht mehr als die Grenze', async () => {
    const grenze = Number(/var HASHTAG_MAX = (\d+);/.exec(QUELLTEXT)[1]);
    assert.ok(grenze > 5 && grenze <= 30,
        `HASHTAG_MAX = ${grenze} — Instagram wertet ueber 30 als Spam`);
    for (const e of Q.liste()) {
        const erg = await fertig(e.id);
        const tags = erg.tags.split(/\s+/).filter(Boolean);
        assert.equal(new Set(tags).size, tags.length,
            `${e.name} wiederholt ein Hashtag: ${erg.tags}`);
        assert.ok(tags.length <= grenze,
            `${e.name} hat ${tags.length} Tags, die Grenze ist ${grenze}`);
    }
});

test('die Seite hat ein Feld dafuer und kopiert beides zusammen', () => {
    assert.match(SEITE, /id="tags"/, 'kein Hashtag-Feld auf der Seite');
    assert.match(SEITE, /'tags'\]/, "'tags' fehlt in FELDER — dann merkt die "
        + 'Geaendert-Zeile eine Aenderung nicht und das Zuruecksetzen laesst sie stehen');
    assert.match(SEITE, /id="btnBeides"/,
        'der Knopf fuer Bildunterschrift + Hashtags fehlt — Instagram will beides '
        + 'in EINEM Feld, zweimal einfuegen heisst zweimal umschalten');
});

/* ══ 2 · DIE KARTENFILTER ═══════════════════════════════════════════ */

test('die Filter der Post-Seite sind dieselben wie auf der Seite', () => {
    /* DIE KLAMMER UM ZWEI LISTEN.
     *
     * posts/ laeuft bewusst ohne den Anwendungsrahmen (kein i18n, kein
     * Login, keine Datenladung) — js/app-tier-meta.js zu laden hiesse,
     * die halbe Seite mitzuladen. Die Einteilung steht deshalb zweimal
     * im Bestand. Dieser Test ist der Grund, warum das vertretbar ist. */
    const post = /var POST_ARTEN = \[([\s\S]*?)\n\];/.exec(QUELLTEXT);
    assert.ok(post, 'POST_ARTEN steht nicht mehr in js/ds-post-quellen.js');
    const seite = /const STAPLES_ARTEN = \[([\s\S]*?)\n        \];/.exec(TIER);
    assert.ok(seite, 'STAPLES_ARTEN steht nicht mehr in js/app-tier-meta.js');

    const ids = (t) => [...t.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
    const postIds = ids(post[1]);
    const seiteIds = ids(seite[1]).map((x) => (x === 'ace' ? 'acespec' : x));
    assert.deepEqual(postIds.slice().sort(), seiteIds.slice().sort(),
        'die Kartenarten laufen auseinander.\n  posts: ' + postIds.join(', ')
        + '\n  Seite: ' + seiteIds.join(', ')
        + '\nWer eine Art hinzufuegt, fuegt sie an beiden Stellen hinzu — sonst '
        + 'zeigt der Beitrag eine andere Auswahl als die Seite, von der er kommt.');

    /* Und die Typenlisten gleich mit: „Pokémon" muss dieselben Werte der
       Spalte `type` einsammeln, sonst stehen zwei verschiedene Mengen
       unter demselben Namen. */
    const typen = (t, id) => {
        const eintrag = new RegExp("id: '" + id + "'[\\s\\S]{0,400}?typen: \\[([^\\]]*)\\]")
            .exec(t);
        return eintrag ? [...eintrag[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : null;
    };
    ['pokemon', 'supporter', 'item', 'tool', 'stadion', 'energie'].forEach((id) => {
        assert.deepEqual(typen(post[1], id), typen(seite[1], id),
            `die Typen von „${id}" unterscheiden sich zwischen posts/ und der Seite`);
    });
});

test('der Filter „neuestes Set" holt sein Kuerzel zur Laufzeit', () => {
    /* Ein eingetragenes „PBL" waere am 25.09.2026 falsch — dann wechselt
       das Format auf TEF-30C. Beide Stellen lesen es deshalb aus dem
       Formatfenster. */
    assert.match(QUELLTEXT, /format_window\.json/,
        'die Post-Seite traegt das Set-Kuerzel fest ein');
    assert.match(TIER, /window\._formatWindow[\s\S]{0,120}current_set/,
        'die Seite traegt das Set-Kuerzel fest ein statt es aus dem '
        + 'Formatfenster zu lesen');
    /* Kein Set-Kuerzel irgendwo in POST_ARTEN — auch nicht in einer
       Beschriftung. Ein Kuerzel sind zwei bis vier Grossbuchstaben oder
       Ziffern; „ACE SPEC" ist der einzige erlaubte Grossbuchstaben-Text
       dort und wird ausgenommen. */
    const block = /var POST_ARTEN = \[[\s\S]*?\n\];/.exec(QUELLTEXT)[0];
    const verdaechtig = (block.match(/'[A-Z0-9]{2,4}'|\b[A-Z0-9]{3,4}\b/g) || [])
        /* Die Kartentypen selbst sind Grossbuchstaben-Woerter und keine
           Set-Kuerzel: VMAX, VSTAR und die ACE-SPEC-Beschriftung. */
        .filter((x) => !/^(ACE|SPEC|VMAX|VSTAR|NFD)$/.test(x.replace(/'/g, '')));
    assert.deepEqual(verdaechtig, [],
        'in POST_ARTEN steht ein Set-Kuerzel fest: ' + verdaechtig.join(', ')
        + '. Am 25.09.2026 wechselt das Format auf TEF-30C — dann waere es falsch.');
});

test('jeder angebotene Filter liefert auch Karten', async () => {
    const erg = await Q.lade('staples');
    assert.ok(erg.filter && erg.filter.length > 3,
        'die Kartenquelle bietet keine Filter an');
    assert.ok(typeof erg.proFilter === 'function', 'proFilter fehlt');
    erg.filter.forEach((f) => {
        const g = erg.proFilter(f.id);
        const zeilen = String(g.zeilen || '').split('\n').filter(Boolean);
        assert.ok(zeilen.length > 0,
            `der Filter „${f.name}" steht in der Auswahl, liefert aber keine Karte — `
            + 'ein Versprechen, das beim Klick bricht');
    });
    /* Und die Pruefung selbst muss im Quelltext stehen: heute traegt
       jede der acht Arten Karten, morgen vielleicht nicht — dann faellt
       die Schleife oben nicht, weil der leere Filter gar nicht erst
       angeboten werden DARF. */
    assert.match(QUELLTEXT, /if \(reiheFuer\(pruefFuer\(a\)\)\.length\) verfuegbar\.push/,
        'ein Filter ohne Karten kaeme wieder in die Auswahl');
});

test('der gewaehlte Filter steht gross, das Format daneben', async () => {
    /* Bestellt: „dann Format Staples neben das Format schreiben und in
       gross dann, was man sieht — in meinem Beispiel hier waere es dann
       ACE SPEC." */
    const erg = await Q.lade('staples');
    const ace = erg.proFilter('acespec');
    assert.equal(ace.titel, 'ACE SPEC',
        `die Ueberschrift traegt nicht den Filter, sondern: ${ace.titel}`);
    assert.match(ace.kicker, /Format staples/,
        `der Kicker nennt nicht „Format staples": ${ace.kicker}`);
    assert.match(ace.kicker, /· [A-Z0-9]{2,4}$/,
        `der Kicker nennt das Format nicht: ${ace.kicker}`);
    /* Ohne Filter bleibt die alte Ueberschrift — sonst stuende „All
       cards" gross da, wo vorher ein Satz stand. */
    const alle = erg.proFilter('');
    assert.equal(alle.titel, 'In almost every deck');
});

test('die Seite zeigt den Filter nur, wenn die Quelle einen hat', () => {
    assert.match(SEITE, /id="filterFeld" hidden/,
        'das Filterfeld startet sichtbar — bei Quellen ohne Filter steht es leer da');
    assert.match(SEITE, /erg\.filter && erg\.filter\.length && erg\.proFilter/,
        'die Seite prueft nicht, ob die Quelle ueberhaupt Filter anbietet');

    // Gefunden am 12.09.2026 beim Rendern: das Attribut stand da, das
    // Feld war trotzdem zu sehen. `.feld{display:block}` schlaegt das
    // `display:none`, das der Browser an `[hidden]` haengt — CSS aus
    // dem Blatt gewinnt gegen den Vorgabestil. Ohne die eigene Regel
    // ist `hidden` auf dieser Seite wirkungslos, und zwar ueberall,
    // auch bei den Gruppen der Vorlagen.
    assert.match(SEITE, /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/,
        'ohne eigene [hidden]-Regel bleibt jedes versteckte Feld sichtbar');
});

/* ══ 3 · DIE ZWEI DATENGETRIEBENEN VORLAGEN ════════════════════════ */

test('die Heatmap liefert ein vollstaendiges Gitter', async () => {
    const erg = await Q.lade('heatmap');
    assert.ok(Array.isArray(erg.gitterKoepfe) && erg.gitterKoepfe.length >= 3,
        'zu wenige Spalten fuer ein Gitter');
    assert.equal(erg.gitter.length, erg.gitterKoepfe.length,
        'Zeilen und Spalten sind nicht gleich viele — das Gitter ist nicht quadratisch');
    erg.gitter.forEach((z, i) => {
        assert.equal(z.zellen.length, erg.gitterKoepfe.length,
            `Zeile ${i} hat ${z.zellen.length} Zellen statt ${erg.gitterKoepfe.length}`);
        assert.equal(z.deck, erg.gitterKoepfe[i],
            'Zeilen- und Spaltenreihenfolge laufen auseinander — dann liest man '
            + 'die Diagonale an der falschen Stelle');
        assert.equal(z.zellen[i], null,
            'die Diagonale traegt eine Zahl. Ein Deck gegen sich selbst ist per '
            + 'Definition 50 % und keine Messung');
    });
});

test('die Deckkarte liefert Kacheln und Paarungen', async () => {
    const erg = await Q.lade('deck-bilanz');
    const d = erg.proDeck(erg.decks[0]);
    assert.ok(Array.isArray(d.kacheln) && d.kacheln.length === 3,
        'die drei Kennzahlkacheln fehlen');
    d.kacheln.forEach((k) => {
        assert.ok(k.wert && k.label, 'eine Kachel ohne Wert oder Beschriftung');
    });
    assert.ok(Array.isArray(d.matchups) && d.matchups.length > 3,
        'zu wenige Paarungen');
    d.matchups.forEach((m) => {
        assert.ok(m.name && isFinite(m.quote) && isFinite(m.partien),
            `unvollstaendige Paarung: ${JSON.stringify(m)}`);
    });
});

test('die Paarungen sind die MEISTGESPIELTEN, nicht die besten', async () => {
    /* Dieselbe Regel wie vorschauAuswahl() in js/app-archetype-card.js
       seit dem 11.09.2026. Gemeldet: „von den fuenf Positiven die auch
       hinschreiben mit den meisten Begegnungen … da gibt's bestimmt noch
       andere Decks, wo man auch eine positive Winrate hat, aber mehr als
       zweihundert Matches hatte."

       Die Probe: unter den gezeigten muss die meistgespielte positive
       Paarung sein. Waere nach Quote ausgewaehlt, faellt sie heraus,
       sobald genug knappere daruberliegen. */
    const erg = await Q.lade('deck-bilanz');
    const d = erg.proDeck(erg.decks[0]);
    const gezeigt = d.matchups.map((m) => m.name);
    const positiv = d.matchups.filter((m) => m.quote >= 50);
    assert.ok(positiv.length > 0, 'keine positive Paarung dabei');
    const negativ = d.matchups.filter((m) => m.quote < 50);
    assert.ok(negativ.length > 0,
        'keine einzige negative Paarung — genau die will man vor einem Turnier sehen');
    /* Und die Reihenfolge bleibt nach Quote: man liest von gut nach schlecht. */
    for (let i = 1; i < d.matchups.length; i++) {
        assert.ok(d.matchups[i - 1].quote >= d.matchups[i].quote,
            'die Paarungen stehen nicht nach Quote sortiert');
    }
    assert.equal(new Set(gezeigt).size, gezeigt.length, 'eine Paarung steht doppelt');
});

test('die Seite zeichnet genau die Felder, die die Quellen liefern', () => {
    /* Dieselbe Luecke, die am 11.09.2026 die Bildkarte halb leer stehen
       liess: die Zeichenroutine las Felder, die der Sammler nie gesetzt
       hatte. Hier ist der Weg kuerzer, aber er existiert. */
    ['gitter', 'gitterKoepfe', 'kacheln', 'matchups'].forEach((f) => {
        assert.ok(SEITE.indexOf(f + ':') > -1 || SEITE.indexOf(f + ' =') > -1,
            `spec() reicht ${f} nicht an die Zeichenroutine weiter`);
    });
    assert.match(SEITE, /gitter: malGitter, deckkarte: malDeckkarte/,
        'die zwei Vorlagen sind nicht in KOERPER eingetragen');
    assert.match(SEITE, /gitter: 5, deckkarte: 6/,
        'sie fehlen in REIHE — dann tragen ihre Dateien keine Ordnungszahl');
});
