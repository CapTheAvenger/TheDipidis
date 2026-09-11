/**
 * BEFUND (08.09.2026, live gemessen auf thedipidis.app 202609080008-33eb397)
 *
 * Die Anordnung des Betreibers lautet woertlich: "Win-Raten ueberall in
 * der Limitless-Bezeichnung 'Win %' - keine eigenen Begriffe."
 *
 * Zwei Dateien trugen weiter Hausnamen, nachdem die uebrigen umgestellt
 * waren (gemeldet von zwei Parallelagenten als "ausserhalb meines
 * Pakets"):
 *
 *   js/ds-ev-rechner.js:319  "Erwartete Win Rate"   (Datei entfallen)
 *   js/ds-ev-rechner.js:389  "Deine Win Rate"        (Datei entfallen)
 *   js/ds-sections.js:83     "Listen, Win Rate und Top-8-Quote je Deck"
 *
 * "Win %" durfte dort NICHT hin. Nachgemessen:
 *
 *   - Der EV-Rechner nimmt seine Quoten aus quote() in
 *     js/matchup-glaettung.js: (S + k/2) / (S + N + k). Unentschieden
 *     stehen nicht im Nenner -> `ohneUnentschieden` = S / (S + N).
 *   - Die Meta-Performance-Spalte liest new_winrate aus
 *     data/limitless_online_decks_comparison.csv -> `mitUnentschieden`
 *     = S / (S + N + U) (so benannt in js/app-tier-meta.js).
 *
 * "Win %" gehoert allein den Matchpunkten (3S + U) / (3n). Diese Datei
 * nagelt beides fest: kein Hausname mehr, und der angezeigte Name muss
 * zu der Konvention passen, die an der Stelle wirklich gerechnet wird.
 *
 * Kein jsdom, kein Netz, kein data/-Zugriff: die Formel wird aus
 * js/matchup-glaettung.js ausgefuehrt, die Namen aus
 * js/win-rate-konvention.js.
 */
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies   = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

/* Die EV-Anzeige lag bis zum 11.09.2026 in js/ds-ev-rechner.js. Sie ist
   in den Meta Call gezogen (renderDeckGegenMetaPanel), und die Datei ist
   am selben Abend entfallen — der Verweis, der dort uebrig blieb, war
   ein Abschnitt ohne Inhalt. Geprueft wird deshalb jetzt der Block, in
   dem die Zahl entsteht. Die Zusagen selbst sind unveraendert: kein
   Hausname im angezeigten Text, die Konvention an genau einer Stelle
   festgelegt, "Win %" nur als Abgrenzung. */
const MCALL    = lies('js/app-meta-call.js');
const EV       = (function () {
    const a = MCALL.indexOf('const EV_UMFANG_KEY');
    const b = MCALL.indexOf('// Recommendations panel — top N decks ranked');
    assert.ok(a > -1 && b > a, 'der EV-Block steht nicht mehr in js/app-meta-call.js');
    return MCALL.slice(a, b);
}());
const SEKTION  = lies('js/ds-sections.js');
const SHARE    = lies('js/ds-share.js');

/** Laedt js/win-rate-konvention.js in einem eigenen Fenster. */
function konventionModul(sprache) {
    const fenster = { getLang: () => sprache };
    const kontext = vm.createContext({ window: fenster, console });
    kontext.window.window = fenster;
    vm.runInContext(lies('js/win-rate-konvention.js'), kontext);
    return fenster.WinRateKonvention;
}

/** Fuehrt quote() aus js/matchup-glaettung.js aus. */
function glaettung() {
    const fenster = {};
    const kontext = vm.createContext({ window: fenster, console });
    kontext.window.window = fenster;
    vm.runInContext(lies('js/matchup-glaettung.js'), kontext);
    const G = fenster.MatchupGlaettung || fenster.Glaettung
        || Object.keys(fenster).map(k => fenster[k])
             .find(v => v && typeof v.quote === 'function');
    assert.ok(G && typeof G.quote === 'function',
        'quote() aus js/matchup-glaettung.js nicht gefunden');
    return G;
}

/* Kommentare heraus, damit die Befundbeschreibung oben in den Dateien
   selbst nicht als Fundstelle zaehlt. Zeichenketten bleiben stehen -
   genau die will der Suchlauf sehen. */
function ohneKommentare(quelle) {
    return quelle
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* Der Bezeichner `WinRateKonvention` ist der NAME DES MODULS, das die
   Hausnamen gerade abschafft - er ist keine Beschriftung. Er wird vor
   dem Suchlauf entfernt, sonst meldet der Test sein eigenes Heilmittel.
   Ebenso `win_rate`/`winRate` als Feld- und Variablennamen: die stehen
   in den Daten und im Code, nicht auf dem Bildschirm. */
function ohneBezeichner(quelle) {
    /* Ein BEZEICHNER ist ein zusammenhaengender Wortlauf, der den
       Begriff enthaelt und LAENGER ist als er selbst: `WinRateKonvention`,
       `majorWinRate`, `hatMajorWr`, `win_rate_numeric`. Das ist
       Programmtext und steht auf keinem Bildschirm.

       Genau die bare Form bleibt stehen — „Win Rate", „WR" allein —,
       denn das ist die Beschriftung, um die es geht. Ein Filter, der
       auch sie schluckt, macht den Test wertlos; das ist beim ersten
       Anlauf passiert. */
    return quelle.replace(/[A-Za-z0-9_$]+/g, function (wort) {
        if (!/(WinRate|Winrate|winRate|winrate|win_rate|Wr|wr|WR)/.test(wort)) return wort;
        const bar = /^(WR|Wr|wr)$/.test(wort);
        return bar ? wort : ' ';
    });
}

const HAUSNAMEN = /(Win\s*Rate|Win-Rate|Winrate|win\s+rate|\bWR\b|Siegrate|Gewinnrate)/;

test('der EV-Block traegt keinen Hausnamen mehr', () => {
    const rumpf = ohneBezeichner(ohneKommentare(EV));
    const treffer = rumpf.split('\n')
        .map((z, i) => ({ nr: i + 1, z }))
        .filter(o => HAUSNAMEN.test(o.z));
    assert.deepStrictEqual(treffer.map(o => `${o.nr}: ${o.z.trim()}`), [],
        'Hausname im ausgelieferten Teil des EV-Blocks in js/app-meta-call.js');
});

test('js/ds-sections.js traegt keinen Hausnamen mehr', () => {
    const rumpf = ohneBezeichner(ohneKommentare(SEKTION));
    const treffer = rumpf.split('\n')
        .map((z, i) => ({ nr: i + 1, z }))
        .filter(o => HAUSNAMEN.test(o.z));
    assert.deepStrictEqual(treffer.map(o => `${o.nr}: ${o.z.trim()}`), [],
        'Hausname im ausgelieferten Teil von js/ds-sections.js');
});

test('der EV-Rechner rechnet wirklich ohneUnentschieden', () => {
    const G = glaettung();
    // 30-10-10: ohneU = 30/40 = 75 %, mitU = 30/50 = 60 %,
    // Matchpunkte = (90+10)/150 = 66,67 %. Ohne Glaettung (k = 0)
    // muss genau die erste Zahl herauskommen.
    assert.strictEqual(G.quote(30, 10, 0), 75,
        'quote() rechnet nicht S/(S+N) - die Beschriftung waere dann falsch');
    assert.notStrictEqual(G.quote(30, 10, 0), 60);
    // Mit dem Vorwert k = 20 zieht es zur Mitte, aber der Nenner bleibt
    // ohne Unentschieden: (30+10)/(40+20) = 66,67 %.
    assert.ok(Math.abs(G.quote(30, 10, 20) - (40 / 60) * 100) < 1e-9);
    // Und die Zahl der Unentschieden aendert daran nichts, weil sie
    // gar nicht uebergeben wird - genau das ist das Merkmal.
    assert.strictEqual(G.quote(30, 10, 20), G.quote(30, 10, 20));
});

test('der EV-Rechner nennt genau diese Konvention, in beiden Sprachen', () => {
    for (const sprache of ['de', 'en']) {
        const K = konventionModul(sprache);
        const soll = K.kurz('ohneUnentschieden');
        const falsch = K.kurz('matchpunkte');           // "Win %"
        const auchFalsch = K.kurz('mitUnentschieden');

        /* Die Konvention steht an EINER Stelle und wird von dort geholt.
           Im Meta Call ist das `_evQuotenName()`, das
           WinRateKonvention.kurz('ohneUnentschieden') fragt. */
        assert.ok(/_evQuotenName\(\)[\s\S]{0,400}kurz\('ohneUnentschieden'\)/.test(EV),
            'der EV-Block legt seine Konvention nicht mehr fest');
        // Der Name wird zur Laufzeit geholt, nicht abgeschrieben.
        assert.ok(!EV.includes(`'${soll}'`) && !EV.includes(`"${soll}"`),
            `der Name "${soll}" steht abgeschrieben im EV-Block `
            + '- er muss aus WinRateKonvention.kurz() kommen');
        /* "Win %" darf hier GENAU EINMAL vorkommen: in dem Satz, der
           dem Leser sagt, dass die gezeigte Zahl das eben NICHT ist.
           Das ist eine Abgrenzung, keine Beschriftung. Jede weitere
           Fundstelle waere eine Beschriftung und ist verboten. */
        /* Mit Umlaut: der Satz steht seit dem Umzug im Meta Call und
           damit in einem angezeigten Text — „Groesse" waere dort eine
           ASCII-Ersatzschreibung auf einer deutschen Seite. */
        const ABGRENZUNG =
            'das ist NICHT die Größe, die Limitless "Win %" nennt';
        const rumpfEV = ohneKommentare(EV);
        const winProzentStellen = (rumpfEV.match(/Win %/g) || []).length;
        assert.strictEqual(winProzentStellen, 1,
            `"${falsch}" steht ${winProzentStellen}-mal im EV-Block; `
            + 'erlaubt ist allein der Abgrenzungssatz');
        /* Der Satz ist im Quelltext ueber mehrere Zeilen mit ' + '
           zusammengesetzt. Zum Vergleich werden die Nahtstellen und
           danach JEDER Leerraum entfernt - sonst haengt das Ergebnis
           an der Zeilenumbruchstelle. */
        const ohneRaum = (x) => String(x).replace(/\s+/g, '');
        const zusammen = ohneRaum(rumpfEV.replace(/'\s*\+\s*'/g, ''));
        assert.ok(zusammen.includes(ohneRaum(ABGRENZUNG)),
            'die eine erlaubte Fundstelle ist nicht der Abgrenzungssatz, '
            + 'sondern etwas anderes - dann ist es eine Beschriftung');
        assert.ok(!ohneKommentare(EV).includes(auchFalsch),
            `"${auchFalsch}" ist die falsche Konvention fuer diese Stelle`);
        assert.ok(soll.length > 0 && falsch === 'Win %');
    }
});

test('der Abschnitt "Meta-Performance" fuellt den Namen erst beim Anzeigen', () => {
    // Die Liste wird beim Laden einmal ausgewertet; kurz() haengt aber
    // an der Sprache. Ein dort schon eingesetzter Name bliebe beim
    // Sprachwechsel stehen - deshalb der Platzhalter.
    assert.ok(SEKTION.includes('{quote:mitUnentschieden}'),
        'der Platzhalter in der Abschnittsliste fehlt');
    assert.ok(/function fuelleQuoten/.test(SEKTION),
        'fuelleQuoten() fehlt - der Platzhalter wuerde roh angezeigt');
    assert.ok(/function texte\s*\([\s\S]{0,200}fuelleQuoten/.test(SEKTION),
        'texte() ruft fuelleQuoten() nicht auf');
});

test('fuelleQuoten() setzt den Namen der richtigen Konvention ein', () => {
    for (const sprache of ['de', 'en']) {
        const K = konventionModul(sprache);
        const fenster = { getLang: () => sprache, WinRateKonvention: K };
        const kontext = vm.createContext({ window: fenster, console, document: undefined });
        kontext.window.window = fenster;
        // Nur die zwei Helfer ausschneiden - der Rest der Datei greift
        // auf das Dokument zu.
        const schnitt = SEKTION.slice(
            SEKTION.indexOf('function quotenName'),
            SEKTION.indexOf('function texte'));
        vm.runInContext(schnitt + '; globalThis.__f = fuelleQuoten;', kontext);
        const raus = kontext.__f('Listen, {quote:mitUnentschieden} und Top-8-Quote');
        assert.strictEqual(raus,
            `Listen, ${K.kurz('mitUnentschieden')} und Top-8-Quote`);
        assert.ok(!raus.includes('{quote'), 'Platzhalter blieb stehen');
        assert.ok(!raus.includes('Win %'),
            'die Spalte rechnet S/(S+N+U) und darf nicht "Win %" heissen');
    }
});

test('faellt das Konventionsmodul aus, steht die Formel da - nie ein Hausname', () => {
    const kontext = vm.createContext({ window: { getLang: () => 'de' }, console });
    kontext.window.window = kontext.window;
    const schnitt = SEKTION.slice(
        SEKTION.indexOf('function quotenName'),
        SEKTION.indexOf('function texte'));
    vm.runInContext(schnitt + '; globalThis.__f = fuelleQuoten;', kontext);
    const raus = kontext.__f('Listen, {quote:mitUnentschieden} und Top-8-Quote');
    assert.strictEqual(raus, 'Listen, S / (S + N + U) und Top-8-Quote');
    assert.ok(!HAUSNAMEN.test(raus), 'der Rueckfall darf kein Hausname sein');
});


/* ── js/ds-share.js — die drei teilbaren Bilder ─────────────────────
 *
 * Hier zeichnet die Seite auf eine Leinwand. Ein Bild hat keine
 * Sprechblase: was daraufsteht, ist alles, was der Leser bekommt — ein
 * `title` waere hier keine Loesung, sondern gar nicht vorhanden.
 * Deshalb muss der volle Name (und bei der Bilanzzeile die Formel) auf
 * dem Bild stehen.
 *
 * Zwei Konventionen kommen darin vor, nachgewiesen an der Herkunft:
 *   - Deck-Kachel und Journal: win_rate_numeric aus
 *     data/limitless_online_decks.csv bzw. w/(w+l+t) -> mitUnentschieden
 *   - Matchup-Tabelle: window.getArchetypeMatchups() aus
 *     js/app-archetype-card.js, gespeist aus
 *     data/limitless_online_decks_matchups.csv (Feld win_rate)
 *     -> ohneUnentschieden
 */
test('js/ds-share.js traegt keinen Hausnamen mehr', () => {
    const rumpf = ohneBezeichner(ohneKommentare(SHARE));
    const treffer = rumpf.split('\n')
        .map((z, i) => ({ nr: i + 1, z }))
        .filter(o => HAUSNAMEN.test(o.z));
    assert.deepStrictEqual(treffer.map(o => `${o.nr}: ${o.z.trim()}`), [],
        'Hausname im ausgelieferten Teil von js/ds-share.js');
});

test('die Bildkarte beschriftet beide Konventionen aus dem Modul', () => {
    assert.ok(SHARE.includes("var SHARE_KONVENTION = 'mitUnentschieden';"),
        'js/ds-share.js legt seine Konvention nicht mehr fest');

    /* Auf die AUFRUFSTELLEN pruefen, nicht auf die Definition der
       Hilfsfunktion: sonst bleibt der Test gruen, wenn eine Beschriftung
       auf einen festen Namen zurueckgedreht wird, weil `quotenName`
       weiter oben ja noch definiert ist. Genau das ist beim ersten
       Anlauf passiert (Mutation S1/S2 ueberlebte). */
    const rumpf = ohneKommentare(SHARE);
    const nachDenHelfern = rumpf.slice(rumpf.indexOf('var SHARE_KONVENTION'));
    const ohneDefinition = nachDenHelfern
        .replace(/function quotenName[\s\S]*?\n    \}/, ' ')
        .replace(/function quotenFormel[\s\S]*?\n    \}/, ' ');

    const aufrufe = (ohneDefinition.match(/quotenName\(/g) || []).length;
    assert.ok(aufrufe >= 4,
        `nur ${aufrufe} Aufrufe von quotenName() ausserhalb der Definition — `
        + 'mindestens vier Beschriftungen holen ihren Namen aus dem Modul '
        + '(Deck-Kachel, Spaltenkopf, Sortierhinweis, Rundenfuss)');
    assert.ok(/quotenName\('ohneUnentschieden'\)/.test(ohneDefinition),
        'der Kopf der Matchup-Spalte nennt nicht ohneUnentschieden — '
        + 'die Zahl kommt aber aus limitless_online_decks_matchups.csv');
    assert.ok(/quotenFormel\(\)/.test(ohneDefinition),
        'die Bilanzzeile zeigt die Formel nicht — auf einem Bild gibt es '
        + 'keine Sprechblase, die sie nachreichen koennte');
});

test('die Bildkarte faellt auf die Formel zurueck, nie auf einen Hausnamen', () => {
    const kontext = vm.createContext({ window: { getLang: () => 'de' }, console });
    kontext.window.window = kontext.window;
    /* Bis zur naechsten Modulkonstante schneiden — `var C = {` ist die
       erste Zeile nach den beiden Helfern (js/ds-share.js:72). Eine
       Schnittgrenze nach Zeichenzahl trifft mitten in eine Funktion und
       ergibt einen SyntaxError statt eines Befunds. */
    const anfang = SHARE.indexOf('function quotenName');
    const ende   = SHARE.indexOf('\n    var C = {', anfang);
    assert.ok(ende > anfang, 'Schnittgrenze in js/ds-share.js nicht gefunden');
    const schnitt = SHARE.slice(anfang, ende);
    vm.runInContext(
        "var SHARE_KONVENTION = 'mitUnentschieden';" + schnitt
        + '; globalThis.__n = quotenName; globalThis.__f = quotenFormel;', kontext);
    assert.strictEqual(kontext.__n(), 'S / (S + N + U)');
    assert.strictEqual(kontext.__f(), 'S / (S + N + U)');
    assert.ok(!HAUSNAMEN.test(kontext.__n()));
});
