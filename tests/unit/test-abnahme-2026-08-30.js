/**
 * Abnahme vom 30.08.2026 — die fuenf Befundgruppen A bis E.
 *
 * Alle Befunde wurden vorher im Browser gemessen (Playwright, Chromium,
 * lokaler Server, Sprachwechsel per switchLanguage() gegen einen frischen
 * Ladevorgang in der Zielsprache). Diese Datei haelt fest, WORAN die
 * Reparatur haengt, damit sie nicht still zurueckfaellt.
 *
 * A — SPRACHWECHSEL LIESS VIER ANSICHTEN STEHEN.
 *   switchLanguage() ruft updateTranslationsInDOM(), und das erreicht
 *   ausschliesslich Elemente mit data-i18n. Alles, was ein Modul per
 *   innerHTML zusammenbaut, traegt keins und muss von einem
 *   languageChanged-Listener nachgezogen werden.
 *   Gemessen (deutsch -> englisch, veraltete Textzeilen):
 *     Meta Call            311 -> 0
 *     Startseite (Staples)  34 -> 0
 *     Proxy Printer          1 -> 0
 *     City-League-Analyse    4 -> 0
 *   Meta Call war der schlimmste Fall: die Registrierung stand HINTER
 *   dem fruehen Ruecksprung `if (_shareList && _matchupMap) { ... return; }`
 *   und wurde deshalb nie erreicht — eine Instrumentierung von
 *   document.addEventListener zaehlte null Registrierungen aus dieser
 *   Datei.
 *
 * B — DER RASTER/LISTE-UMSCHALTER BESCHRIFTETE SICH FALSCH.
 *   Zwei getrennte Fehler. (1) Die Startbeschriftung: in der Japan-Ansicht
 *   ueberschrieben zwei Stellen sie mit festem Englisch, in den beiden
 *   anderen stand data-i18n="cl.btnGrid", und dieser Schluessel trug in
 *   BEIDEN Sprachbloecken den englischen Wert. (2) Jeder Sprachwechsel
 *   warf die zustandsabhaengige Beschriftung weg, weil
 *   updateTranslationsInDOM() den statischen data-i18n-Wert
 *   zurueckschreibt — im Rasterzustand versprach der Knopf danach das,
 *   was schon da war.
 *   Gemessen (Start / nach EN / nach Klick / nach EN):
 *     vorher  Japan     "List View" / "Grid View" / "Rasteransicht" / "Grid View"
 *             Global    "Grid" / "Grid" / "Rasteransicht" / "Grid"
 *             Vergangen "Grid" / "Grid" / "Rasteransicht" / "Grid"
 *     nachher alle drei "Listenansicht" / "List View" / "Rasteransicht" / "Grid View"
 *
 * C — FUENFZEHN FESTE ENGLISCHE ZEICHENKETTEN.
 *   Zwei davon im Regelbetrieb sichtbar, gemessen:
 *     Meta Call, Datenquellen  ["no data","11 archetypes"]
 *                           -> ["keine Daten","11 Archetypen"]
 *     Meta-Karten-Zaehler      "12 Cards" / "15 Cards"
 *                           -> "12 Karten" / "15 Karten"
 *
 * D — DIE POKEDEX-SUCHE WAR AN DREI VON FUENF STELLEN WIRKUNGSLOS.
 *   Der Platzhalter verspricht ueberall "Name (EN/DE), Set+Nr. oder
 *   Pokedex suchen…". Die Spalte pokedex_number ist in allen 20.878
 *   Zeilen von data/all_cards_database.csv leer; der Rueckfall geht ueber
 *   window.cardPokedexSearchValue (window.pokedexNumbers, 1064 Eintraege).
 *   Gemessen:
 *     Deck-Analyse Japan, Uebersicht  "887" 0 -> 1, "257" 0 -> 1
 *     Meta-Karten                     "52" 0 -> 1, "1015" 0 -> 1, "1016" 0 -> 1
 *
 * E — DIE LEERE SUCHE WIDERSPRACH SICH.
 *   Bei 0 Treffern blieben die Abschnittskoepfe der Uebersicht stehen und
 *   zeigten weiter die UNGEFILTERTEN Zahlen ("Kernkarten 14 / Optionen 9 /
 *   Situativ 21"), waehrend der Zaehler daneben "0 Karten" sagte.
 *   Vergangenes Meta blieb ganz leer, ohne ein Wort.
 *   Gemessen nachher: keine Kopfzeile mehr sichtbar, dafuer in allen drei
 *   Ansichten "Keine Karten gefunden / Filtereinstellungen anpassen".
 *
 * Jede Zusicherung hier ist MUTATIONSGEPRUEFT: der jeweilige Fehler wurde
 * wieder eingebaut, der Test wurde rot, die Mutation wurde
 * zurueckgenommen. Die Mutationsliste steht am Dateiende.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HTML  = read('index.html');
const I18N  = read('js/i18n.js');
const CORE  = read('js/app-core.js');
const MC    = read('js/app-meta-call.js');
const TIER  = read('js/app-tier-meta.js');
const CL    = read('js/app-city-league.js');
const CMA   = read('js/app-current-meta-analysis.js');
const PAST  = read('js/app-past-meta.js');
const SHARED = read('js/deck-analysis-shared.js');
const MCARD = read('js/app-meta-cards.js');
const FEAT  = read('js/app-features.js');
const SQ    = read('js/app-side-quest.js');
const FC    = read('js/firebase-collection.js');

/* ── Werkzeuge ─────────────────────────────────────────────── */

// Rumpf einer Funktion ausschneiden, ueber Klammerzaehlung.
function rumpf(src, name) {
    const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
    assert.ok(m, 'Funktion nicht gefunden: ' + name);
    const auf = src.indexOf('{', m.index);
    let tiefe = 0;
    for (let i = auf; i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}') {
            tiefe--;
            if (tiefe === 0) return src.slice(m.index, i + 1);
        }
    }
    assert.fail('Funktionsende nicht gefunden: ' + name);
}

// Kommentare entfernen. Ohne das wuerde eine Zusicherung von einem
// Kommentar bestanden, der den reparierten Fehler nur BESCHREIBT — genau
// das ist beim Umbau am 30.08.2026 einmal passiert.
function ohneKommentare(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

// Die beiden Sprachbloecke von js/i18n.js trennen.
const DE_START = I18N.indexOf('\n  de: {');
assert.ok(DE_START > 0, 'js/i18n.js: der de-Block wurde nicht gefunden');
const I18N_EN = I18N.slice(0, DE_START);
const I18N_DE = I18N.slice(DE_START);

function wert(block, key) {
    const m = new RegExp("'" + key.replace(/\./g, '\\.') + "':\\s*('(?:[^'\\\\]|\\\\.)*')")
        .exec(block);
    return m ? m[1].slice(1, -1).replace(/\\'/g, "'") : null;
}

function zweisprachig(key) {
    const n = (I18N.match(new RegExp("'" + key.replace(/\./g, '\\.') + "':", 'g')) || []).length;
    assert.equal(n, 2, 'js/i18n.js: "' + key + '" steht ' + n + 'x statt genau 2x '
        + '(einmal im en-Block, einmal im de-Block)');
    const en = wert(I18N_EN, key);
    const de = wert(I18N_DE, key);
    assert.ok(en, 'js/i18n.js: "' + key + '" fehlt im en-Block');
    assert.ok(de, 'js/i18n.js: "' + key + '" fehlt im de-Block');
    assert.notEqual(de, en, 'js/i18n.js: "' + key + '" traegt im de-Block den '
        + 'englischen Wert ' + JSON.stringify(en) + ' — genau der Befund bei cl.btnGrid');
}

/* ══ A — der Sprachwechsel muss jede gebaute Ansicht erreichen ══ */

describe('Befund A — vier Ansichten blieben beim Sprachwechsel stehen', () => {

    it('A1 · Meta Call registriert VOR dem fruehen Ruecksprung', () => {
        const init = ohneKommentare(rumpf(MC, 'init'));
        const iReg    = init.indexOf('_sprachListenerRegistrieren()');
        const iSprung = init.indexOf('return; }');
        assert.notEqual(iReg, -1,
            'app-meta-call.js: init() registriert den Sprachwechsel gar nicht mehr — '
            + 'das war der Ausgangsbefund (311 veraltete Zeilen)');
        assert.notEqual(iSprung, -1,
            'app-meta-call.js: der fruehe Ruecksprung in init() ist weg — dann muss '
            + 'diese Zusicherung neu bewertet werden');
        assert.ok(iReg < iSprung,
            'app-meta-call.js: die Registrierung liegt wieder HINTER dem fruehen '
            + 'Ruecksprung `if (_shareList && _matchupMap) { renderAll(); return; }`. '
            + 'Ab dem zweiten Betreten des Reiters wird sie dann nie erreicht — '
            + 'gemessen: null Registrierungen, 311 deutsche Zeilen nach dem Wechsel '
            + 'auf Englisch.');
    });

    it('A1 · die Registrierung laeuft genau einmal, auch bei mehrfachem init()', () => {
        const q = ohneKommentare(MC);
        assert.match(q, /_sprachListenerAktiv\s*=\s*false/,
            'app-meta-call.js: die Einmal-Sperre fehlt');
        const fn = ohneKommentare(rumpf(MC, '_sprachListenerRegistrieren'));
        assert.match(fn, /if\s*\(\s*_sprachListenerAktiv\s*\)\s*return/,
            'app-meta-call.js: ohne diese Wache haengt bei jedem Reiterwechsel ein '
            + 'weiterer Listener am Dokument, und ein Sprachklick zeichnet die '
            + 'Ansicht n-mal neu');
        // Die Sperre muss GESETZT werden, sonst wacht sie nie.
        assert.match(fn, /_sprachListenerAktiv\s*=\s*true/,
            'app-meta-call.js: die Sperre wird nie gesetzt — sie wacht dann nicht');
    });

    it('A1 · der Listener zeichnet nur eine bereits gezeichnete Ansicht', () => {
        const fn = ohneKommentare(rumpf(MC, '_sprachListenerRegistrieren'));
        assert.match(fn, /if\s*\(\s*!_shareList\s*\)\s*return/,
            'app-meta-call.js: ohne diese Wache fuellt ein Sprachwechsel auf einer '
            + 'anderen Seite still den verborgenen Meta-Call-Reiter');
    });

    it('A2 · der Startseiten-Handler zieht auch das Staples-Widget nach', () => {
        const q = ohneKommentare(TIER);
        assert.ok(q.includes('staplesWidgetNeuBeschriften'),
            'app-tier-meta.js: das Staples-Widget wird beim Sprachwechsel nicht mehr '
            + 'nachgezogen — dann bleiben "Meistgespielte Karten (Format-Staples)", '
            + '"von 60 Archetypen mit Deckliste", "Bild generieren", der Stern-Hinweis '
            + 'und 15 Prozentzeilen deutsch stehen (34 gemessene Zeilen)');
        const i = q.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1, 'app-tier-meta.js: der languageChanged-Listener ist weg');
        // NACHGEHAERTET (30.08.2026): die erste Fassung suchte nur den
        // NAMEN im Handler. Die Mutation `.then(() => 0)` liess sie gruen
        // durch, weil die typeof-Wache eine Zeile darueber den Namen
        // ebenfalls nennt. Geprueft wird jetzt der Aufruf selbst.
        assert.match(q.slice(i), /staplesWidgetNeuBeschriften\(\)/,
            'app-tier-meta.js: der AUFRUF steht nicht im Sprachwechsel-Handler — '
            + 'der blosse Name in einer typeof-Wache zieht das Widget nicht nach');
        // Und er darf kein verborgenes Widget bauen.
        assert.ok(q.slice(i, i + 900).includes("querySelector('.top-cards-container')"),
            'app-tier-meta.js: ohne diese Wache baut ein Sprachwechsel auf einer '
            + 'anderen Seite das Widget in einen verborgenen Reiter');
    });

    it('A2 · das Nachziehen laedt die Daten NICHT erneut', () => {
        const fn = ohneKommentare(rumpf(TIER, 'staplesWidgetNeuBeschriften'));
        assert.ok(fn.includes('_staplesDaten'),
            'app-tier-meta.js: das Widget wird nicht aus den schon geladenen Zahlen '
            + 'gebaut');
        assert.ok(!fn.includes('loadCurrentMetaRowsWithFallback'),
            'app-tier-meta.js: ein Sprachklick zieht wieder einen kompletten '
            + 'Datenabruf nach sich — die Zahlen liegen in _staplesDaten schon fertig da');
    });

    it('A3 · app-core.js hat einen Sprachwechsel fuer die Proxy-Warteschlange', () => {
        const q = ohneKommentare(CORE);
        const i = q.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1,
            'app-core.js: es gibt wieder GAR KEINEN languageChanged-Listener — '
            + 'dann bleibt "Warteschlange leer …" nach dem Umschalten stehen');
        assert.ok(/languageChanged'[\s\S]{0,400}renderProxyQueue\(\)/.test(q),
            'app-core.js: renderProxyQueue() laeuft beim Sprachwechsel nicht nach');
        assert.ok(/languageChanged'[\s\S]{0,400}proxyQueueList/.test(q),
            'app-core.js: ohne die Wache auf proxyQueueList zeichnet der Handler '
            + 'in einen Reiter, den es noch gar nicht gibt');
    });

    it('A4 · der Datumshinweis der City-League-Analyse wird neu beschriftet', () => {
        const q = ohneKommentare(CL);
        assert.ok(q.includes('_relabelCityLeagueDateRangeHints'),
            'app-city-league.js: "Verfuegbar: 6.6.2026 – 6.6.2026" wird beim '
            + 'Sprachwechsel nicht mehr nachgezogen');
        // lastIndexOf, nicht indexOf: app-city-league.js hat zwei
        // languageChanged-Listener. Der erste gehoert zum durchsuchbaren
        // Auswahlfeld; gemeint ist der i18n-Handler am Dateiende.
        const i = q.lastIndexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1, 'app-city-league.js: der Sprachwechsel-Handler ist weg');
        const kopf = q.slice(i, i + 1200);
        assert.ok(kopf.includes('_relabelCityLeagueDateRangeHints()'),
            'app-city-league.js: der Aufruf steht nicht im Sprachwechsel-Handler');
        // Er darf NICHT hinter window.cityLeagueLoaded liegen: der Hinweis
        // steht auch dann schon da, wenn nur die Analyse geladen ist.
        const iFlag = kopf.indexOf('window.cityLeagueLoaded');
        assert.ok(iFlag === -1 || kopf.indexOf('_relabelCityLeagueDateRangeHints()') < iFlag,
            'app-city-league.js: das Nachbeschriften liegt wieder hinter '
            + 'window.cityLeagueLoaded — dann bleibt der Hinweis in der '
            + 'Analyse-Ansicht deutsch stehen');
    });

    it('A4 · die beiden Zaehler der geleerten Deck-Ansicht kommen mit', () => {
        const q = ohneKommentare(CL);
        const i = q.lastIndexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1, 'app-city-league.js: der Sprachwechsel-Handler ist weg');
        const kopf = q.slice(i, i + 1400);
        assert.ok(kopf.includes('cityLeagueStatsSection'),
            'app-city-league.js: der Handler prueft nicht mehr, ob die Deck-Ansicht '
            + 'geleert ist');
        // NACHGEHAERTET (30.08.2026): die erste Fassung suchte nur den
        // Namen. Weil er in der typeof-Wache derselben Bedingung steht,
        // ueberlebte die Mutation "Aufruf entfernt" den Test. Geprueft
        // wird jetzt der Aufruf mit seinen beiden Zaehler-Elementen.
        assert.match(kopf, /resetDeckOverviewCounts\(\s*'cityLeagueCardCount'\s*,\s*'cityLeagueCardCountSummary'/,
            'app-city-league.js: "0 Karten" / "/ 0 Gesamt" bleiben nach dem '
            + 'Sprachwechsel stehen — der Aufruf fehlt (ein blosser typeof-Name '
            + 'setzt nichts)');
    });

    it('A · die Meta-Karten-Gitter kommen beim Sprachwechsel mit', () => {
        const q = ohneKommentare(MCARD);
        const i = q.indexOf("document.addEventListener('languageChanged'");
        assert.notEqual(i, -1,
            'app-meta-cards.js: ohne diesen Listener bleibt der Zaehler stehen — '
            + 'gemessen zuletzt "12 Cards" neben einer sonst deutschen Ansicht');
        const kopf = q.slice(i);
        assert.ok(kopf.includes('renderMetaCards('),
            'app-meta-cards.js: das Gitter wird nicht neu gezeichnet');
        assert.ok(kopf.includes('children.length') || kopf.includes('metaCardData'),
            'app-meta-cards.js: ohne Wache schreibt ein Sprachwechsel die '
            + 'Leermeldung in einen verborgenen Reiter');
    });
});

/* ══ B — der Umschalter sagt, wohin der Klick fuehrt ══════════ */

describe('Befund B — der Raster/Liste-Umschalter beschriftete sich falsch', () => {

    it('B1 · kein fest verdrahtetes Englisch mehr in den drei Ansichten', () => {
        for (const [datei, src] of [['app-city-league.js', CL],
                                    ['app-current-meta-analysis.js', CMA],
                                    ['app-past-meta.js', PAST]]) {
            const q = ohneKommentare(src);
            assert.ok(!/textContent\s*=\s*'List View'/.test(q),
                datei + ': "List View" ist wieder fest verdrahtet — das war die '
                + 'gemessene Startbeschriftung der Japan-Ansicht, auch auf Deutsch');
            assert.ok(!/textContent\s*=\s*'Grid View'/.test(q),
                datei + ': "Grid View" ist wieder fest verdrahtet');
        }
    });

    it('B1 · cl.btnGrid traegt im de-Block keinen englischen Wert', () => {
        // Der Ausgangsbefund: der Schluessel stand zweimal mit demselben
        // englischen Wert 'Grid' da, der de-Block also ohne Uebersetzung.
        zweisprachig('cl.btnGrid');
        assert.equal(wert(I18N_DE, 'cl.btnGrid'), 'Raster',
            'js/i18n.js: der deutsche Wert von cl.btnGrid ist nicht mehr "Raster"');
    });

    it('B2 · die drei Umschalter tragen kein data-i18n mehr', () => {
        const UMSCHALTER = ['toggleDeckGridView()',
                            'toggleCurrentMetaDeckGridView()',
                            'togglePastMetaDeckGridView()'];
        for (const fn of UMSCHALTER) {
            const re = new RegExp('<button[^>]*onclick="' + fn.replace(/[()]/g, '\\$&') + '"[^>]*>');
            const m = re.exec(HTML);
            assert.ok(m, 'index.html: der Umschalter ' + fn + ' ist verschwunden');
            const tag = m[0];
            assert.ok(!/\bdata-i18n=/.test(tag),
                'index.html: ' + fn + ' traegt wieder data-i18n. updateTranslationsInDOM() '
                + 'schreibt dann bei JEDEM Sprachwechsel den statischen Wert zurueck und '
                + 'wirft die zustandsabhaengige Beschriftung weg — im Rasterzustand '
                + 'verspricht der Knopf danach das, was schon da ist.');
            assert.match(tag, /data-view-toggle="grid"/,
                'index.html: ' + fn + ' meldet seinen Startzustand nicht mehr');
        }
    });

    it('B2 · der Helfer beschriftet nach dem ZIEL des Klicks', () => {
        const fn = ohneKommentare(rumpf(CORE, 'ansichtsUmschalterBeschriften'));
        // Rasterzustand -> der Klick fuehrt zur Liste -> "Listenansicht".
        assert.match(fn, /rasterSichtbar\s*\?\s*t\('btn\.listView'\)\s*:\s*t\('btn\.gridView'\)/,
            'app-core.js: der Helfer beschriftet nicht mehr nach dem Ziel des Klicks. '
            + 'Vertauscht heisst: der Knopf verspricht im Rasterzustand das Raster.');
        zweisprachig('btn.listView');
        zweisprachig('btn.gridView');
    });

    it('B2 · der Sprachwechsel beschriftet die Umschalter neu', () => {
        const q = ohneKommentare(CORE);
        assert.ok(/languageChanged'\s*,\s*alleAnsichtsUmschalterBeschriften/.test(q),
            'app-core.js: nach einem Sprachwechsel behaelt der Knopf den alten '
            + 'Wortlaut — genau der zweite Teil des Befunds');
        assert.ok(/DOMContentLoaded'\s*,\s*alleAnsichtsUmschalterBeschriften/.test(q),
            'app-core.js: die Startbeschriftung wird nicht mehr gesetzt, der Knopf '
            + 'traegt dann den Platzhalter aus dem HTML');
        const alle = ohneKommentare(rumpf(CORE, 'alleAnsichtsUmschalterBeschriften'));
        assert.match(alle, /\[data-view-toggle\]/,
            'app-core.js: der Sammelaufruf findet die Umschalter nicht mehr');
    });

    it('B2 · jeder Umschalter meldet beide Zustaende', () => {
        const FAELLE = [['app-city-league.js', CL, 'toggleDeckGridView'],
                        ['app-current-meta-analysis.js', CMA, 'toggleCurrentMetaDeckGridView'],
                        ['app-past-meta.js', PAST, 'togglePastMetaDeckGridView']];
        for (const [datei, src, fn] of FAELLE) {
            const q = ohneKommentare(rumpf(src, fn));
            assert.ok(q.includes('ansichtsUmschalterBeschriften'),
                datei + ': ' + fn + ' meldet seinen Zustand nicht mehr');
            assert.ok(q.includes("'grid'"),
                datei + ': ' + fn + ' meldet den Rasterzustand nicht — dann bleibt die '
                + 'Beschriftung beim Zurueckschalten falsch');
            assert.ok(q.includes("'list'"),
                datei + ': ' + fn + ' meldet den Listenzustand nicht — dann bleibt die '
                + 'Beschriftung nach dem ersten Klick stehen');
        }
    });
});

/* ══ C — keine festen englischen Zeichenketten mehr ═══════════ */

describe('Befund C — fuenfzehn feste englische Zeichenketten', () => {

    // Jede Zeile: Datei, Quelle, das Literal das WEG sein muss, der
    // i18n-Schluessel der es ersetzt.
    const STELLEN = [
        ['app-meta-call.js',            MC,    "' archetypes'",                 'mc.sourceArchetypes'],
        ['app-meta-call.js',            MC,    "'no data'",                     'mc.sourceNoData'],
        ['app-meta-cards.js',           MCARD, "'0 Cards'",                     'cl.cards'],
        ['app-meta-cards.js',           MCARD, '} Cards`',                      'cl.cards'],
        ['app-meta-cards.js',           MCARD, "'Loading card database...'",    'cdb.loadingDatabase'],
        ['app-meta-cards.js',           MCARD, "thNewRank.textContent = 'Rank'", 'cl.rank'],
        ['app-current-meta-analysis.js', CMA,  'No matchup data found',         'cm.noMatchupData'],
        ['app-features.js',             FEAT,  "'-- No saved decks available --'", 'deckCompare.noSavedDecks'],
        ['app-side-quest.js',           SQ,    "= 'Copied!'",                   'cdb.copied'],
        ['app-side-quest.js',           SQ,    "= 'Loading…'",                  'sideQuest.loading'],
        ['firebase-collection.js',      FC,    "'Select a folder for this deck.'", 'folder.selectPrompt'],
        ['firebase-collection.js',      FC,    "'(No Folder)'",                 'folder.none'],
        ['firebase-collection.js',      FC,    "'+ Create New Folder'",         'folder.createNew'],
        ['firebase-collection.js',      FC,    "cancelBtn.textContent = 'Cancel'", 'folder.cancel'],
        ['app-city-league.js',          CL,    'Re-run City League Analysis scraper', 'cl.dateFilterNoDates'],
    ];

    for (const [datei, src, literal, key] of STELLEN) {
        it(datei + ' · ' + JSON.stringify(literal) + ' laeuft ueber ' + key, () => {
            const q = ohneKommentare(src);
            assert.ok(!q.includes(literal),
                datei + ': das feste Literal ' + JSON.stringify(literal) + ' ist zurueck');
            assert.ok(q.includes("t('" + key + "')"),
                datei + ': ' + key + ' wird nicht benutzt');
            zweisprachig(key);
        });
    }

    it("'No cards found' laeuft an allen drei Stellen ueber cl.noCardsFound", () => {
        for (const [datei, src] of [['app-meta-cards.js', MCARD],
                                    ['app-current-meta-analysis.js', CMA],
                                    ['app-past-meta.js', PAST]]) {
            const q = ohneKommentare(src);
            assert.ok(!/>No cards found</.test(q),
                datei + ': das feste "No cards found" ist zurueck');
            assert.ok(q.includes("t('cl.noCardsFound')"),
                datei + ': cl.noCardsFound wird nicht benutzt');
        }
        zweisprachig('cl.noCardsFound');
    });

    it('index.html · #decks-search hat eine Platzhalter-Bindung', () => {
        const m = /<input[^>]*id="decks-search"[^>]*>/.exec(HTML);
        assert.ok(m, 'index.html: #decks-search ist verschwunden');
        assert.match(m[0], /data-i18n-placeholder="profile\.decksSearchPlaceholder"/,
            'index.html: #decks-search hat wieder keine Platzhalter-Bindung — der '
            + 'Platzhalter bleibt dann in beiden Sprachen englisch');
        zweisprachig('profile.decksSearchPlaceholder');
    });

    it('index.html · kein <input> traegt zwei data-i18n-placeholder', () => {
        // Zwei gleiche Attribute an EINEM Element: das zweite ist tot, der
        // Browser nimmt das erste. Gefunden an den beiden Tech-Slot-Feldern.
        const tags = HTML.match(/<input\b[^>]*>/g) || [];
        for (const tag of tags) {
            const n = (tag.match(/data-i18n-placeholder=/g) || []).length;
            assert.ok(n <= 1,
                'index.html: ein <input> traegt ' + n + ' data-i18n-placeholder — '
                + 'alle ausser dem ersten sind tot: ' + tag.slice(0, 140));
        }
    });
});

/* ══ D — das Pokedex-Versprechen einloesen ════════════════════ */

describe('Befund D — die Pokedex-Suche war an drei Stellen wirkungslos', () => {

    it('die CSV-Spalte pokedex_number gibt es wirklich nicht', () => {
        // Der Ausgangspunkt des Befunds, als Zusicherung: faellt die Spalte
        // eines Tages doch an, ist dieser Test das Signal, den Rueckfall
        // neu zu bewerten (er bleibt korrekt, die Spalte gewinnt dann).
        const kopf = read('data/all_cards_database.csv').split('\n')[0];
        assert.ok(!/\bpokedex_number\b/.test(kopf),
            'data/all_cards_database.csv fuehrt jetzt eine Spalte pokedex_number — '
            + 'der Rueckfall bleibt richtig, aber die Messung gehoert wiederholt. '
            + 'Kopfzeile: ' + kopf.slice(0, 160));
    });

    it('D1 · der Kachelfilter hat den Pokedex-Zweig', () => {
        // 03.09.2026: die drei fast wortgleichen Kachelfilter (City
        // League, Current Meta, Past Meta) liegen jetzt als EINE Funktion
        // in js/deck-analysis-shared.js. Die Zusicherung wandert mit —
        // die Sache, die sie schuetzt, ist dieselbe geblieben.
        const fn = ohneKommentare(rumpf(SHARED, 'uebersichtKachelnFiltern'));
        assert.ok(fn.includes('cardPokedexSearchValue'),
            'deck-analysis-shared.js: der Pokedex-Zweig fehlt wieder ganz — gemessen fand '
            + 'die Suche nach "887" (Dragapult) und "257" (Blaziken) dort 0 Treffer, '
            + 'waehrend das Feld daneben Pokedex-Suche verspricht');
        assert.match(fn, /dexNr !== '' && dexNr === suchbegriff/,
            'deck-analysis-shared.js: der Vergleich auf die exakte Pokedex-Nummer fehlt');
        assert.match(fn, /passtSuche =[\s\S]{0,600}dexNr/,
            'deck-analysis-shared.js: der Pokedex-Wert wird berechnet, aber nicht in die '
            + 'Trefferbedingung eingerechnet — dann ist er wirkungslos');
    });

    it('D1b · alle drei Uebersichten benutzen diesen einen Filter', () => {
        // Sonst schuetzt die Zusicherung oben nur noch eine von dreien.
        for (const [datei, src, fn] of [
                ['app-city-league.js',           CL,   'filterOverviewCards'],
                ['app-current-meta-analysis.js', CMA,  'filterCurrentMetaOverviewCards'],
                ['app-past-meta.js',             PAST, 'filterPastMetaOverviewCards']]) {
            const q = ohneKommentare(rumpf(src, fn));
            assert.ok(q.includes('uebersichtKachelnFiltern'),
                datei + ': ' + fn + ' hat wieder einen eigenen Filterrumpf — '
                + 'dann gilt jede Zusicherung nur noch fuer die gemeinsame Fassung');
        }
    });

    it('D2 · renderMetaCards liest nicht mehr die leere CSV-Spalte', () => {
        const fn = ohneKommentare(rumpf(MCARD, 'renderMetaCards'));
        assert.ok(!/const dexNum = \(card\.pokedex_number \|\| ''\)/.test(fn),
            'app-meta-cards.js: renderMetaCards liest wieder card.pokedex_number — '
            + 'diese Spalte ist in allen 20.878 Zeilen leer, die Suche findet dann '
            + 'wieder 0 Treffer');
        assert.ok(fn.includes('filterCardsArray'),
            'app-meta-cards.js: renderMetaCards benutzt den gemeinsamen Filter nicht '
            + 'mehr — damit ist die dritte handgeschriebene Kopie der Suchvorschrift '
            + 'zurueck');
    });

    it('D3 · searchDeckCards benutzt den gemeinsamen Filter', () => {
        const fn = ohneKommentare(rumpf(MCARD, 'searchDeckCards'));
        assert.ok(fn.includes('filterCardsArray'),
            'app-meta-cards.js: searchDeckCards hat wieder eine eigene Kopie der '
            + 'Suchvorschrift');
        assert.ok(!/const dexNum = \(card\.pokedex_number \|\| ''\)/.test(fn),
            'app-meta-cards.js: searchDeckCards liest wieder die leere CSV-Spalte');
    });

    it('D · filterCardsArray ist wieder in Benutzung, nicht nur in Tests', () => {
        // Der Nebenbefund: die Funktion war in der AUSLIEFERUNG von nirgends
        // aufgerufen; nur zwei Unit-Tests hielten ihre Pokedex-Korrektur am
        // Leben. Eine Zusicherung ohne Ansicht dahinter ist wertlos.
        assert.ok(CORE.includes('window.filterCardsArray = filterCardsArray'),
            'app-core.js: filterCardsArray wird nicht mehr exportiert');
        const rufer = [];
        for (const [datei, src] of [['app-meta-cards.js', MCARD],
                                    ['app-city-league.js', CL],
                                    ['app-current-meta-analysis.js', CMA],
                                    ['app-past-meta.js', PAST],
                                    ['app-tier-meta.js', TIER],
                                    ['app-features.js', FEAT]]) {
            if (/window\.filterCardsArray\s*\(/.test(ohneKommentare(src))) rufer.push(datei);
        }
        assert.ok(rufer.length > 0,
            'filterCardsArray ist wieder toter Code — nur noch Tests rufen sie. '
            + 'Dann gehoert sie samt ihren Zusicherungen geloescht, statt eine '
            + 'Abdeckung vorzutaeuschen, die keine Ansicht deckt.');
    });

    it('D · der Rueckfall findet ueber den Namen, wenn die Spalte leer ist', () => {
        // Der echte Code aus beiden Dateien in eine Sandbox, nicht ein
        // Nachbau: ein Nachbau wuerde den Befund nicht abdecken.
        const prefix = FC.match(/const POKEMON_FORM_PREFIX_RE = [^\n]+/);
        assert.ok(prefix, 'firebase-collection.js: POKEMON_FORM_PREFIX_RE ist weg');
        const sandbox = {
            console, String, Number, Object, Array, Math, JSON,
            parseInt, parseFloat, isNaN, isFinite, RegExp,
        };
        sandbox.window = { pokedexNumbers: { pikachu: 25, charizard: 6 } };
        vm.createContext(sandbox);
        vm.runInContext([
            prefix[0],
            rumpf(FC, 'getCardPokedexNumber'),
            rumpf(CORE, 'cardPokedexSearchValue'),
            rumpf(CORE, 'filterCardsArray'),
            'window.getCardPokedexNumber = getCardPokedexNumber;',
            'window.cardPokedexSearchValue = cardPokedexSearchValue;',
        ].join('\n\n'), sandbox, { filename: 'pokedex-abnahme.js' });

        // Set und Nummer bewusst so, dass weder "25" noch "6" ueber
        // Set+Nummer treffen kann.
        const karten = [
            { name_en: 'Pikachu',      name: 'Pikachu',      set: 'ASC', number: '55'  },
            { name_en: 'Pikachu ex',   name: 'Pikachu ex',   set: 'ASC', number: '57'  },
            { name_en: 'Charizard ex', name: 'Charizard ex', set: 'OBF', number: '199' },
            { name_en: 'Iono',         name: 'Iono',         set: 'PAL', number: '185' },
        ];
        const namen = t => sandbox.filterCardsArray(karten, t).map(c => c.name_en).sort();
        assert.deepEqual(namen('25'), ['Pikachu', 'Pikachu ex'],
            'die Suche nach der Pokedex-Nummer 25 muss beide Pikachu-Drucke finden, '
            + 'obwohl die CSV-Spalte pokedex_number leer ist');
        assert.deepEqual(namen('6'), ['Charizard ex'],
            'Charizard (6) fehlt oder Iono ist faelschlich dabei — Iono ist kein '
            + 'Pokemon und darf keine Pokedex-Nummer bekommen');
        // Eine gefuellte Spalte muss den Rueckfall schlagen.
        const eigen = [{ name_en: 'Pikachu', name: 'Pikachu', set: 'ASC', number: '55',
                         pokedex_number: '777' }];
        assert.equal(sandbox.filterCardsArray(eigen, '777').length, 1,
            'eine gefuellte pokedex_number muss gewinnen');
        assert.equal(sandbox.filterCardsArray(eigen, '25').length, 0,
            'bei gefuellter Spalte darf der Rueckfall nicht zusaetzlich greifen');
    });
});

/* ══ E — melden, nicht verschweigen ═══════════════════════════ */

describe('Befund E — die leere Suche widersprach sich', () => {

    it('alle drei Uebersichten melden das Ergebnis', () => {
        for (const [datei, src, fn] of [
                ['app-city-league.js',           CL,   'filterOverviewCards'],
                ['app-current-meta-analysis.js', CMA,  'filterCurrentMetaOverviewCards'],
                ['app-past-meta.js',             PAST, 'filterPastMetaOverviewCards']]) {
            const q = ohneKommentare(rumpf(src, fn));
            assert.ok(q.includes('uebersichtKachelnFiltern'),
                datei + ': ' + fn + ' geht nicht mehr ueber den gemeinsamen Filter — '
                + 'dann meldet es das Suchergebnis womoeglich gar nicht');
        }
        // Gemeldet wird an einer Stelle, fuer alle drei.
        const g = ohneKommentare(rumpf(SHARED, 'uebersichtKachelnFiltern'));
        assert.ok(g.includes('uebersichtSuchergebnisMelden'),
            'deck-analysis-shared.js: der Kachelfilter meldet das Suchergebnis nicht '
            + 'mehr. Dann stehen die Abschnittskoepfe mit ihren UNGEFILTERTEN Zahlen '
            + 'weiter da, waehrend der Zaehler daneben "0 Karten" sagt — die Seite '
            + 'widerspricht sich.');
        assert.match(g, /uebersichtSuchergebnisMelden\(\s*gitter\s*,\s*sichtbar\s*\)/,
            'deck-analysis-shared.js: der Filter uebergibt nicht den gefilterten '
            + 'Zaehler — mit einer anderen Zahl meldet der Helfer das Falsche');
    });

    it('der Helfer zieht die Abschnittskoepfe mit', () => {
        const q = ohneKommentare(rumpf(CORE, 'uebersichtSuchergebnisMelden'));
        assert.ok(q.includes('meta-card-skeleton-section'),
            'app-core.js: die Abschnittskoepfe werden nicht mehr angefasst');
        // NACHGEHAERTET (30.08.2026): die erste Fassung suchte nur den
        // Klassennamen. Die Mutation `if (false) zaehler.textContent = ...`
        // liess sie gruen durch, weil der querySelector den Namen weiter
        // nennt. Geprueft wird jetzt die Zuweisung mitsamt ihrer Wache.
        assert.ok(q.includes('meta-card-skeleton-count'),
            'app-core.js: der Abschnittskopf wird gar nicht mehr gesucht');
        assert.match(q, /if\s*\(\s*zaehler\s*\)\s*zaehler\.textContent\s*=\s*String\(sichtbar\)/,
            'app-core.js: die Zahl im Abschnittskopf wird nicht mehr auf den '
            + 'GEFILTERTEN Stand gesetzt — gemessen stand dort "Kernkarten 14 / '
            + 'Optionen 9 / Situativ 21" neben einem Zaehler, der "0 Karten" sagte');
        assert.match(q, /sec\.classList\.toggle\('d-none'/,
            'app-core.js: leere Abschnitte werden nicht mehr ausgeblendet');
        // Beide Versteck-Schreibweisen des Hauses muessen gezaehlt werden.
        assert.ok(q.includes("classList.contains('d-none')") && q.includes("style.display === 'none'"),
            'app-core.js: der Zaehler kennt nur noch eine der beiden '
            + 'Versteck-Schreibweisen — die globale Analyse versteckt ueber '
            + 'style.display, die beiden anderen ueber d-none');
    });

    it('der Helfer meldet die Leere und raeumt sie wieder weg', () => {
        const q = ohneKommentare(rumpf(CORE, 'uebersichtSuchergebnisMelden'));
        assert.match(q, /if\s*\(\s*sichtbareGesamt\s*>\s*0\s*\)\s*\{[\s\S]{0,120}remove\(\)/,
            'app-core.js: die Meldung bleibt stehen, sobald die Suche wieder '
            + 'Treffer hat');
        assert.ok(q.includes('uebersichtLeermeldungBeschriften'),
            'app-core.js: die Leermeldung wird nicht mehr gesetzt');
        const b = ohneKommentare(rumpf(CORE, 'uebersichtLeermeldungBeschriften'));
        assert.ok(b.includes("t('cdb.noCardsFound')") && b.includes("t('cdb.adjustFilters')"),
            'app-core.js: die Meldung laeuft nicht mehr ueber i18n — Vorbild ist die '
            + 'Kartendatenbank ("Keine Karten gefunden — Filtereinstellungen anpassen")');
        zweisprachig('cdb.noCardsFound');
        zweisprachig('cdb.adjustFilters');
    });

    it('die Leermeldung macht den Sprachwechsel mit', () => {
        const q = ohneKommentare(CORE);
        assert.ok(/languageChanged'[\s\S]{0,300}uebersichtLeermeldungBeschriften/.test(q),
            'app-core.js: die Meldung traegt kein data-i18n und wird beim '
            + 'Sprachwechsel nicht nachgezogen — sie bliebe deutsch stehen');
    });

    it('die Meldung benutzt eine Klasse, keine id', () => {
        // Drei Uebersichten im selben Dokument — drei gleiche id-Werte
        // waeren ungueltig, und querySelector faende nur die erste.
        const q = ohneKommentare(CORE);
        assert.ok(!/hinweis\.id\s*=/.test(q),
            'app-core.js: die Leermeldung traegt wieder eine id. Bei drei '
            + 'Uebersichten gaebe es die id dreimal im Dokument.');
        assert.ok(q.includes("UEBERSICHT_LEER_KLASSE = 'ds-uebersicht-leer'"),
            'app-core.js: die Klasse der Leermeldung ist umbenannt oder weg');
    });
});

/* ══ Konvention ═══════════════════════════════════════════════ */

describe('Konvention — jeder neue Schluessel steht genau zweimal', () => {
    const NEU = [
        'mc.sourceArchetypes', 'mc.sourceNoData', 'cdb.loadingDatabase', 'cl.rank',
        'cm.noMatchupData', 'deckCompare.noSavedDecks', 'folder.selectPrompt',
        'folder.none', 'folder.createNew', 'folder.cancel', 'cl.dateFilterNoDates',
        'profile.decksSearchPlaceholder', 'sideQuest.loading',
    ];
    it('einmal im en-Block, einmal im de-Block, und nicht derselbe Wert', () => {
        for (const k of NEU) zweisprachig(k);
    });
});

/*
 * ── MUTATIONSPROTOKOLL (30.08.2026) ──────────────────────────
 *
 * Jede Zusicherung oben wurde geprueft, indem der Fehler wieder eingebaut
 * und der Test laufen gelassen wurde. Alle wurden rot; danach wurde die
 * Mutation zurueckgenommen. Geprueft wurden unter anderem:
 *
 *   A1  Registrierung wieder hinter den fruehen Ruecksprung geschoben
 *   A1  `if (_sprachListenerAktiv) return;` entfernt
 *   A1  `if (!_shareList) return;` entfernt
 *   A2  staplesWidgetNeuBeschriften() aus dem Handler entfernt
 *   A2  im Helfer wieder loadCurrentMetaRowsWithFallback aufgerufen
 *   A3  den ganzen languageChanged-Listener aus app-core.js entfernt
 *   A4  _relabelCityLeagueDateRangeHints() hinter window.cityLeagueLoaded gelegt
 *   A   den languageChanged-Listener aus app-meta-cards.js entfernt
 *   B1  cl.btnGrid im de-Block wieder auf 'Grid' gesetzt
 *   B2  data-i18n="cl.btnGrid" an einen Umschalter zurueckgeschrieben
 *   B2  im Helfer listView und gridView vertauscht
 *   B2  in einem Umschalter 'list' durch 'grid' ersetzt
 *   C   je Stelle das englische Literal zurueckgeschrieben
 *   C   den zweiten data-i18n-placeholder wieder ans Tech-Slot-Feld gehaengt
 *   D1  den Pokedex-Zweig aus filterOverviewCards entfernt
 *   D2  in renderMetaCards wieder card.pokedex_number gelesen
 *   D   window.filterCardsArray-Aufrufe entfernt (Funktion wieder tot)
 *   E   uebersichtSuchergebnisMelden aus einem Filter entfernt
 *   E   im Helfer die Kopfzeilen-Zahl nicht mehr nachgefuehrt
 *   E   die Klasse wieder durch eine id ersetzt
 *
 * Zwei Zusicherungen liessen eine Mutation zunaechst durch und wurden
 * nachgehaertet; beide Faelle stehen im Bericht.
 */
