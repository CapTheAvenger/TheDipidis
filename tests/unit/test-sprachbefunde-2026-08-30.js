/**
 * Sprach- und Beschriftungsbefunde vom 30.08.2026.
 *
 * Dreizehn bestaetigte Stellen, an denen die Seite in der falschen
 * Sprache sprach. Sie zerfallen in vier Ursachen — die Datei ist danach
 * gegliedert, weil eine Zusicherung nur dann hilft, wenn klar ist,
 * welchen Rueckfall sie abfaengt.
 *
 * URSACHE 1 — KEIN languageChanged-LISTENER.
 *   switchLanguage() ruft updateTranslationsInDOM(), und das erreicht
 *   ausschliesslich Elemente mit data-i18n. Alles, was ein Modul per
 *   innerHTML zusammenbaut, traegt keins. Gemessen am 30.08.2026 blieben
 *   nach dem Umschalten von Deutsch auf Englisch stehen:
 *     "Top-Archetypen", "Meistgespielte Deck-Varianten (Global)",
 *     "GEMELDETE LISTEN ... aus 475 Turnieren"   (app-tier-meta.js)
 *     "14.990 Karten gefunden", "Namen kopieren" (app-cards-db.js)
 *     "190 Einzigartige Karten ..."              (custom-binder.js)
 *     "212 Einzigartige Karten ..."              (meta-binder.js)
 *     "Noch keine Per-Decklist-Daten ..."        (current-meta-quickref.js)
 *     "Melde dich an, um Testing Groups zu ..."  (app-testing-groups.js)
 *     "Aktiver Filter: Alle Turniere"            (app-current-meta-analysis.js)
 *   Dazu das OFFENE Matchup-Fenster im Battle Journal, dessen Listener
 *   zwar existierte, aber populateMatchupFilters/renderMatchupAnalysis
 *   nicht rief.
 *
 * URSACHE 2 — FEHLENDE data-i18n-BINDUNG in index.html.
 *   Das Cardmarket-Wants-Fenster, vier Bedienelemente des Custom
 *   Binders, drei Zeilen im Bearbeiten-Dialog des Battle Journals, der
 *   Bild-Knopf des Deck-Rasters, die Musterkarte der Legende, der
 *   Telegram-Chat-ID-Platzhalter und drei Suchfelder.
 *
 * URSACHE 3 — FEST VERDRAHTETE LITERALE im Skript.
 *   "Show All"/"Paginated"/"Copy Names" in der Kartendatenbank,
 *   "0 Cards / 60 Total" und "Grid View"/"List View" in den beiden
 *   Deck-Analysen, der englische Kopfbereich der Side Quest und die
 *   showNotification-Texte in firebase-collection.js (31 englisch,
 *   3 deutsch — derselbe Nutzer bekam je nach Knopf eine andere
 *   Sprache).
 *
 * URSACHE 4 — EIN VERSPRECHEN OHNE DECKUNG.
 *   Der Platzhalter der Kartensuche verspricht "Name (EN/DE), Set+Nr.
 *   oder Pokedex". Die Pokedex-Suche las card.pokedex_number; diese
 *   Spalte steht nicht einmal in der Kopfzeile von
 *   data/all_cards_database.csv (20.419 Zeilen, 0 gefuellt). Gemessen
 *   am 30.08.2026 fand die Suche nach "25" genau EIN Pikachu — und das
 *   nur, weil dessen Kartennummer 25 ist (MEW 25). Nach der Korrektur:
 *   139 Pikachu-Drucke.
 *
 * Jede Zusicherung hier ist mutationsgeprueft: der jeweilige Fehler
 * wurde wieder eingebaut, der Test wurde rot, die Mutation wurde
 * zurueckgenommen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HTML   = read('index.html');
const I18N   = read('js/i18n.js');
const CARDS  = read('js/app-cards-db.js');
const CORE   = read('js/app-core.js');
const CMA    = read('js/app-current-meta-analysis.js');
const CL     = read('js/app-city-league.js');
const PAST   = read('js/app-past-meta.js');
const TIER   = read('js/app-tier-meta.js');
const CB     = read('js/custom-binder.js');
const MB     = read('js/meta-binder.js');
const QREF   = read('js/current-meta-quickref.js');
const TG     = read('js/app-testing-groups.js');
const BJ     = read('js/battle-journal.js');
const FC     = read('js/firebase-collection.js');
const SQ     = read('js/app-side-quest.js');
const TUT_DE = read('tutorial/tutorial.de.html');
const TUT_EN = read('tutorial/tutorial.en.html');

/* ── Werkzeuge ─────────────────────────────────────────────── */

// Die beiden Woerterbloecke aus js/i18n.js. Gleiche Technik wie in
// test-sprache-meta-ansicht.js: der de-Block ist der letzte, deshalb
// laeuft er bis zum Dateiende durch.
function tabelle(name) {
    const start = I18N.indexOf('\n  ' + name + ': {');
    assert.ok(start > -1, 'Block ' + name + ' nicht gefunden');
    const rest = I18N.slice(start);
    const ende = rest.indexOf('\n  },');
    const block = rest.slice(0, ende > -1 ? ende : rest.length);
    const out = {};
    for (const m of block.matchAll(/^\s*'([^']+)':\s*'((?:[^'\\]|\\.)*)'/gm)) out[m[1]] = m[2];
    return out;
}
const EN = tabelle('en');
const DE = tabelle('de');

// Das komplette Start-Tag des Elements mit dieser id.
function tag(id) {
    const i = HTML.indexOf('id="' + id + '"');
    assert.ok(i > -1, 'Element #' + id + ' nicht in index.html');
    const start = HTML.lastIndexOf('<', i);
    const end = HTML.indexOf('>', i);
    return HTML.slice(start, end + 1);
}

// Kommentare raus. Ohne das haette ein Kommentar, der die Renderfunktion
// beim Namen nennt, die Zusicherung erfuellt — genau so hat die erste
// Fassung dieser Datei eine Mutation durchgewunken.
function ohneKommentare(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

// Der Rumpf des languageChanged-Handlers: ab addEventListener bis zur
// schliessenden Klammer, mit Klammerzaehlung statt Regex, damit
// verschachtelte Bloecke mitkommen. Kommentarfrei.
function langHandler(rohSrc, datei) {
    const src = ohneKommentare(rohSrc);
    const i = src.indexOf("addEventListener('languageChanged'");
    assert.ok(i > -1, datei + ' hat keinen languageChanged-Listener');
    const open = src.indexOf('{', i);
    assert.ok(open > -1, datei + ': Handler ohne Rumpf');
    let tiefe = 0;
    for (let k = open; k < src.length; k++) {
        if (src[k] === '{') tiefe++;
        else if (src[k] === '}') {
            tiefe--;
            if (tiefe === 0) return src.slice(open, k + 1);
        }
    }
    assert.fail(datei + ': Handler-Rumpf nicht geschlossen');
}

// Beide Woerterbuecher muessen den Schluessel fuehren, und die Werte
// duerfen nicht identisch sein — ein deutscher Eintrag, der das
// englische Wort wiederholt, ist genau der Fehler, den wir suchen.
function zweisprachig(key, { darfGleichSein = false } = {}) {
    assert.ok(key in EN, 'Schluessel fehlt im en-Block: ' + key);
    assert.ok(key in DE, 'Schluessel fehlt im de-Block: ' + key);
    assert.ok(EN[key].trim().length > 0, 'en-Wert leer: ' + key);
    assert.ok(DE[key].trim().length > 0, 'de-Wert leer: ' + key);
    if (!darfGleichSein) {
        assert.notEqual(DE[key], EN[key],
            'de- und en-Wert sind identisch, also nicht uebersetzt: ' + key);
    }
}

/* ── A · Sprachwechsel zeichnet die Ansicht neu ────────────── */

describe('Befund A — languageChanged zeichnet die Ansicht neu', () => {
    // Modul, Quelltext, Funktion die der Handler rufen MUSS, und der
    // Waechter, der ihn davon abhaelt, in einen verborgenen Reiter zu
    // schreiben.
    const module = [
        ['js/app-tier-meta.js',              TIER,  'renderCurrentMetaTierList', 'currentMetaContent'],
        ['js/app-cards-db.js',               CARDS, 'renderCardDatabase',        'cardsContent'],
        ['js/custom-binder.js',              CB,    'cbRenderBinder',            'cbGrid'],
        ['js/meta-binder.js',                MB,    'renderMetaBinder',          'metaBinderGrid'],
        ['js/current-meta-quickref.js',      QREF,  'renderQuickRefPanels',      'currentMetaQuickRefSection'],
        ['js/app-testing-groups.js',         TG,    'renderAll',                 'profile-testinggroups'],
        ['js/app-current-meta-analysis.js',  CMA,   'updateCurrentMetaFilterStatusLabel', 'currentMetaFilterStatus'],
    ];

    for (const [datei, src, fn, waechter] of module) {
        it(datei + ' zeichnet beim Sprachwechsel neu', () => {
            const rumpf = langHandler(src, datei);
            assert.ok(rumpf.includes(fn + '('),
                datei + ': der languageChanged-Handler ruft ' + fn + '() nicht — '
                + 'die im Skript gebaute Ansicht bleibt dann in der alten Sprache stehen');
        });

        it(datei + ' zeichnet NUR eine bereits gezeichnete Ansicht neu', () => {
            const rumpf = langHandler(src, datei);
            assert.ok(rumpf.includes(waechter),
                datei + ': der Handler prueft nicht ueber "' + waechter + '", ob die Ansicht '
                + 'ueberhaupt schon gezeichnet ist — ein Sprachwechsel auf einer anderen '
                + 'Seite wuerde still einen verborgenen Reiter fuellen');
        });
    }

    it('app-testing-groups.js hatte gar keinen Listener — jetzt schon', () => {
        assert.ok(TG.includes("addEventListener('languageChanged'"),
            'js/app-testing-groups.js: ohne Listener bleibt ein offenes Gruppendetail '
            + '(_renderGroupDetail) nach dem Sprachwechsel vollstaendig stehen');
    });

    it('battle-journal.js zeichnet das OFFENE Matchup-Fenster neu', () => {
        const rumpf = langHandler(BJ, 'js/battle-journal.js');
        assert.ok(rumpf.includes('populateMatchupFilters()'),
            'battle-journal.js: populateMatchupFilters() wird sonst nur von '
            + 'openMatchupAnalysisModal() gerufen — ein offenes Fenster bleibt stehen');
        assert.ok(rumpf.includes('renderMatchupAnalysis()'),
            'battle-journal.js: renderMatchupAnalysis() fehlt im Sprachwechsel');
        assert.ok(/matchupAnalysisModal/.test(rumpf),
            'battle-journal.js: es fehlt die Pruefung, ob das Matchup-Fenster ueberhaupt '
            + 'offen ist — sonst zeichnen wir in ein verborgenes Fenster');
    });

    it('die Tier-Liste haengt sich beim zweiten Lauf nicht selbst an', () => {
        // renderCurrentMetaTierList() stellte ihr HTML dem vorhandenen
        // Inhalt VORAN. Beim ersten Sprachwechsel standen dadurch Hero-
        // Bereich und Tier-Liste zweimal untereinander, einmal je Sprache
        // (gemessen: 2 x .tier-hero-section, "Top-Archetypen" ueber
        // "Top Archetypes").
        assert.ok(TIER.includes("data-cm-tier-block"),
            'app-tier-meta.js: die erzeugten Knoten sind nicht markiert — '
            + 'der zweite Lauf kann den ersten dann nicht entfernen');
        assert.ok(/querySelectorAll\('\[data-cm-tier-block="1"\]'\)[\s\S]{0,80}remove\(\)/.test(TIER),
            'app-tier-meta.js: der vorherige Tier-Block wird nicht entfernt — '
            + 'ein Sprachwechsel verdoppelt Hero-Bereich und Tier-Liste');
        assert.ok(!/container\.innerHTML\s*=\s*html\s*\+\s*container\.innerHTML/.test(TIER),
            'app-tier-meta.js: das blosse Voranstellen ist zurueck — es verdoppelt den Block');
    });
});

/* ── B · Cardmarket-Wants-Fenster ──────────────────────────── */

describe('Befund B — Cardmarket-Wants-Fenster', () => {
    const stellen = [
        ['cmw.title',          '🛒 Cardmarket Wants — Helper'],
        ['cmw.intro',          'paste-text fundamentally adds'],
        ['cmw.section1',       '1. Direct product links'],
        ['cmw.section1Accent', 'exact print'],
        ['cmw.section1Hint',   'Click each row to open'],
        ['cmw.section2',       '2. Paste-text'],
        ['cmw.section2Accent', 'fast bulk-add'],
        ['cmw.copyPaste',      'Copy paste-text'],
        ['cmw.openWants',      'Open Cardmarket Wants'],
    ];

    // Der Ausschnitt des Fensters aus index.html — damit eine Bindung
    // anderswo im Dokument nicht faelschlich als Treffer zaehlt.
    const von = HTML.indexOf('id="wishlistCardmarketModal"');
    const bis = HTML.indexOf('<!-- Trade List Grid Modal', von);
    assert.ok(von > -1 && bis > von, 'Wants-Fenster nicht in index.html gefunden');
    const MODAL = HTML.slice(von, bis);

    for (const [key, text] of stellen) {
        it(key + ' ist im Fenster gebunden und zweisprachig', () => {
            assert.ok(MODAL.includes('data-i18n="' + key + '"'),
                'index.html: die Stelle mit "' + text + '" traegt kein data-i18n="' + key + '" — '
                + 'sie bleibt dann im deutschen Modus englisch');
            zweisprachig(key);
        });
    }

    it('der Erklaerabsatz darf HTML fuehren', () => {
        assert.ok(/data-i18n="cmw\.intro"[^>]*data-i18n-html/.test(MODAL),
            'index.html: cmw.intro enthaelt <strong>; ohne data-i18n-html landen die '
            + 'spitzen Klammern als Text in der Oberflaeche');
    });

    it('die im Skript erzeugten Texte des Fensters laufen ueber i18n', () => {
        for (const key of ['cmw.hintEmpty', 'cmw.hintMissing', 'cmw.hintOk',
                           'cmw.listEmpty', 'cmw.rowTitle', 'cmw.rowFallbackTitle',
                           'cmw.hintMore']) {
            assert.ok(FC.includes("fcText('" + key + "'"),
                'firebase-collection.js: ' + key + ' wird nicht benutzt');
            zweisprachig(key);
        }
        assert.ok(!FC.includes("hint.textContent = 'Wishlist is empty.'"),
            'firebase-collection.js: der englische Hinweis ist wieder fest verdrahtet');
    });
});

/* ── C · Custom-Binder-Bedienelemente ──────────────────────── */

describe('Befund C — vier englische Bedienelemente im Custom Binder', () => {
    it('#cbAddWishlist und #cbSendProxy sind gebunden', () => {
        assert.match(tag('cbAddWishlist'), /data-i18n="cb\.addWishlist"/);
        assert.match(tag('cbSendProxy'),   /data-i18n="cb\.proxyAll"/);
        zweisprachig('cb.addWishlist');
        zweisprachig('cb.proxyAll');
    });

    it('#cbArchetypeSearch und #cbDropdownToggle sind gebunden', () => {
        assert.match(tag('cbArchetypeSearch'), /data-i18n-placeholder="cards\.searchArchetype"/);
        assert.match(tag('cbArchetypeSearch'), /data-i18n-aria="cards\.searchArchetypeAria"/);
        assert.match(tag('cbDropdownToggle'),  /data-i18n="cb\.browse"/);
        zweisprachig('cards.searchArchetype');
        zweisprachig('cb.browse');
    });

    it('das kaputt kodierte Zeichen ist weg', () => {
        // "Search archetype?" und "Browse ?" trugen ein Fragezeichen an
        // der Stelle, an der ein Auslassungspunkt bzw. ein Pfeil stehen
        // sollte — der Rest einer verungluecketen Umkodierung.
        assert.ok(!HTML.includes('Search archetype?'),
            'index.html: "Search archetype?" ist zurueck (kaputt kodiertes Zeichen)');
        assert.ok(!HTML.includes('Browse ?'),
            'index.html: "Browse ?" ist zurueck (kaputt kodiertes Zeichen)');
    });

    it('der Pfeil des Browse-Knopfes ueberlebt den Sprachwechsel', () => {
        // updateTranslationsInDOM() ersetzt bei einem Element MIT Kindern
        // nur den ersten Textknoten und laesst die Kindelemente stehen.
        // Steht der Pfeil dagegen selbst im Textknoten, ueberschreibt ihn
        // der erste Sprachwechsel — der Knopf verliert sein Zeichen.
        const i = HTML.indexOf('id="cbDropdownToggle"');
        const start = HTML.lastIndexOf('<button', i);
        const ende = HTML.indexOf('</button>', i);
        assert.ok(start > -1 && ende > start, '#cbDropdownToggle nicht gefunden');
        const knopf = HTML.slice(start, ende + '</button>'.length);
        const inhalt = knopf.slice(knopf.indexOf('>') + 1, knopf.lastIndexOf('</button>'));
        assert.match(inhalt, /<span[^>]*aria-hidden="true"[^>]*>▾<\/span>/,
            'index.html: der Pfeil des Browse-Knopfes steht nicht in einem eigenen '
            + '<span aria-hidden> — der erste Sprachwechsel wuerde ihn entfernen. '
            + 'Knopfinhalt: ' + inhalt);
        const textVorSpan = inhalt.slice(0, inhalt.indexOf('<span'));
        assert.ok(textVorSpan.trim().length > 0,
            'index.html: vor dem Pfeil steht kein Textknoten — updateTranslationsInDOM() '
            + 'haette dann nichts zu ersetzen und die Beschriftung bliebe stehen');
    });
});

/* ── D · Battle-Journal-Bearbeiten-Dialog ──────────────────── */

describe('Befund D — deutsche Texte im englischen Bearbeiten-Dialog', () => {
    const von = HTML.indexOf('id="bjEditEntryModal"');
    assert.ok(von > -1, 'bjEditEntryModal nicht gefunden');
    const MODAL = HTML.slice(von, von + 12000);

    it('Brick- und Mulligan-Hinweis sind gebunden', () => {
        assert.ok(MODAL.includes('data-i18n="bj.brickHint"'),
            'index.html: "(Verloren durch Pech)" steht wieder ungebunden im Dialog');
        assert.ok(MODAL.includes('data-i18n="bj.mulliganHint"'),
            'index.html: "(Eroeffnungshand neu)" steht wieder ungebunden im Dialog');
        zweisprachig('bj.brickHint');
        zweisprachig('bj.mulliganHint');
    });

    it('das Notizen-Feld hat ein eigenes Label mit Schluessel', () => {
        assert.ok(MODAL.includes('data-i18n="bj.notesLabel"'),
            'index.html: das Label "Notizen" ist wieder ungebunden');
        zweisprachig('bj.notesLabel');
        assert.equal(EN['bj.notesLabel'], 'Notes');
        assert.equal(DE['bj.notesLabel'], 'Notizen');
    });

    it('Anlegen- und Bearbeiten-Dialog benutzen dieselben Schluessel', () => {
        // Der Anlegen-Zwilling war schon korrekt gebunden; genau daran
        // ist die Abweichung im Bearbeiten-Dialog aufgefallen.
        const brick = (HTML.match(/data-i18n="bj\.brickHint"/g) || []).length;
        const mull  = (HTML.match(/data-i18n="bj\.mulliganHint"/g) || []).length;
        assert.equal(brick, 2, 'index.html: bj.brickHint muss an beiden Dialogen haengen');
        assert.equal(mull, 2, 'index.html: bj.mulliganHint muss an beiden Dialogen haengen');
    });
});

/* ── E · Seitenleiste der Kartendatenbank ──────────────────── */

describe('Befund E — Kartendatenbank: Pager stand fest auf Englisch', () => {
    const keys = ['cdb.showAll', 'cdb.showAllTitle', 'cdb.showPaginated',
                  'cdb.showPaginatedTitle', 'cdb.copyNames', 'cdb.copyNamesTitle',
                  'cdb.copied', 'cdb.copyFailed'];

    it('alle Pager-Schluessel sind zweisprachig hinterlegt', () => {
        keys.forEach(k => zweisprachig(k));
    });

    it('die Knoepfe lesen ihre Beschriftung aus i18n', () => {
        keys.forEach(k => assert.ok(CARDS.includes("_cdbLabel('" + k + "'"),
            'app-cards-db.js: ' + k + ' wird nicht benutzt'));
    });

    it('keine festen englischen Literale mehr im Pager', () => {
        const verboten = [
            "textContent = showAllCards ? 'Paginated' : 'Show All'",
            "copyBtn.textContent = 'Copy Names'",
            "copyBtn.textContent = 'Copied!'",
            "showToast('Copy failed', 'error')",
        ];
        for (const v of verboten) {
            assert.ok(!CARDS.includes(v),
                'app-cards-db.js: fest verdrahtet ist zurueck — ' + v);
        }
    });
});

/* ── F · Side-Quest-Kopfbereich ────────────────────────────── */

describe('Befund F — Side Quest sprach im deutschen Modus englisch', () => {
    it('die Kopfzeile in index.html ist gebunden', () => {
        assert.ok(HTML.includes('data-i18n="sideQuest.subtitle"'),
            'index.html: der <p> im Side-Quest-Kopf traegt kein data-i18n');
        zweisprachig('sideQuest.subtitle');
    });

    it('"Last updated:" kommt aus der Sprachtabelle des Moduls', () => {
        assert.ok(!/side-quest-updated">Last updated:/.test(SQ),
            'app-side-quest.js: "Last updated:" ist wieder fest verdrahtet');
        assert.ok(SQ.includes('labels.lastUpdated'),
            'app-side-quest.js: der Stand-Text kommt nicht aus LABELS');
        assert.equal((SQ.match(/lastUpdated:\s*'/g) || []).length, 2,
            'app-side-quest.js: lastUpdated fehlt in einem der beiden LABELS-Bloecke');
    });

    it('der Untertitel waehlt die deutsche Fassung', () => {
        assert.ok(SQ.includes('meta.subtitle_de'),
            'app-side-quest.js: _meta.subtitle wird wieder unabhaengig von der Sprache genommen');
        assert.equal((SQ.match(/subtitleFallback:\s*'/g) || []).length, 2,
            'app-side-quest.js: der Rueckfall fehlt in einem der beiden LABELS-Bloecke — '
            + 'ohne ihn stuende nach einem Scraper-Lauf ohne subtitle_de wieder Englisch da');
    });

    it('die deutsche Fassung steht im CODE, nicht in der Datendatei', () => {
        // NACHTRAG (30.08.2026, wenige Stunden nach der Reparatur): der
        // erste Anlauf legte subtitle_de in champions_replica_teams.json
        // — und der naechste Scraper-Lauf (04:04 UTC, am selben Tag) hat
        // das Feld wortlos wieder entfernt. Die Datei gehoert dem
        // Scraper; eine Uebersetzung darin ist eine Uebersetzung auf
        // Zeit, und eine Zusicherung darauf faellt beim naechsten Lauf.
        //
        // Deutsch kommt deshalb aus LABELS. Geprueft wird jetzt, was
        // tatsaechlich traegt: dass der Rueckfall da ist und dass die
        // deutsche Seite ihn nimmt, wenn die Datei nichts liefert.
        const meta = JSON.parse(read('data/champions_replica_teams.json'))._meta;
        assert.ok(meta && typeof meta.subtitle === 'string',
            'die Datendatei fuehrt gar keinen Untertitel mehr');
        assert.equal((SQ.match(/subtitleFallback:\s*'/g) || []).length, 2,
            'der deutsche Rueckfall fehlt in einem der beiden LABELS-Bloecke — ' +
            'ohne ihn steht nach jedem Scraper-Lauf wieder Englisch da');
        const iDe = SQ.indexOf("        de: {");
        const iEn = SQ.indexOf("        en: {");
        assert.ok(iDe > -1 && iEn > iDe, 'die Sprachbloecke sind verschoben');
        const deBlock = SQ.slice(iDe, iEn);
        const m = deBlock.match(/subtitleFallback:\s*'([^']+)'/);
        assert.ok(m, 'kein deutscher Rueckfall gefunden');
        assert.ok(!/Replica codes from top/.test(m[1]),
            'der deutsche Rueckfall ist der englische Satz: ' + m[1]);
        assert.ok(/Replica-Codes|Turnier/.test(m[1]),
            'der deutsche Rueckfall sieht nicht deutsch aus: ' + m[1]);
    });
});

/* ── G/H/I/M · einzelne Bindungen in index.html ────────────── */

describe('Befunde G, H, I, M — einzelne fehlende Bindungen', () => {
    it('G · #deckGridSaveBtn stand fest auf Deutsch', () => {
        assert.match(tag('deckGridSaveBtn'), /data-i18n="ui\.saveDeckGridImage"/,
            'index.html: der Bild-Knopf zeigt im englischen Modus wieder "Als Bild speichern"');
        zweisprachig('ui.saveDeckGridImage');
    });

    it('H · die Musterkarte der Legende ist gebunden', () => {
        const i = HTML.indexOf('data-legend-key="E"');
        assert.ok(i > -1, 'index.html: Legendenzeile E nicht gefunden');
        const zeile = HTML.slice(HTML.lastIndexOf('<', i), HTML.indexOf('>', i) + 1);
        assert.match(zeile, /data-i18n="legend\.sampleCardName"/,
            'index.html: "Karten-Name" steht wieder ungebunden in der Legende');
        zweisprachig('legend.sampleCardName');
    });

    it('I · der Telegram-Chat-ID-Platzhalter ist gebunden', () => {
        assert.match(tag('settings-price-alerts-chatid'),
            /data-i18n-placeholder="settings\.chatIdPlaceholder"/,
            'index.html: "z. B. 123456789" steht wieder ungebunden');
        zweisprachig('settings.chatIdPlaceholder');
    });

    it('M · die drei Listensuchfelder sind gebunden', () => {
        for (const id of ['collection-search', 'wishlist-search', 'tradelist-search']) {
            assert.match(tag(id), /data-i18n-placeholder="filter\.searchCardPlaceholder"/,
                'index.html: #' + id + ' traegt den englischen Platzhalter ohne Bindung');
        }
        zweisprachig('filter.searchCardPlaceholder');
    });
});

/* ── J · englische Literale in deutschen Funktionsflaechen ── */

describe('Befund J — "0 Cards / 60 Total", Grid/List, Toasts', () => {
    it('die Kartenzaehler benutzen dieselben Schluessel wie die City League', () => {
        // Die City-League-Ansicht schreibt an derselben Stelle
        // "33 Karten / 60 Gesamt" — sie ist das Vorbild.
        for (const [datei, src] of [['app-current-meta-analysis.js', CMA],
                                    ['app-past-meta.js', PAST]]) {
            assert.ok(!/`\$\{[A-Za-z.]+\} Cards`/.test(src),
                datei + ': "${n} Cards" ist wieder fest verdrahtet');
            assert.ok(!/'\/ \d+ Total'/.test(src) && !/`\/ \$\{[^}]+\} Total`/.test(src),
                datei + ': "/ n Total" ist wieder fest verdrahtet');
            assert.ok(src.includes("t('cl.total')"),
                datei + ': der Nenner laeuft nicht ueber t(\'cl.total\')');
            assert.ok(src.includes("t('cl.cards')"),
                datei + ': der Zaehler laeuft nicht ueber t(\'cl.cards\')');
        }
    });

    it('der Ansichtsumschalter beschriftet sich in beiden Sprachen', () => {
        for (const [datei, src] of [['app-current-meta-analysis.js', CMA],
                                    ['app-past-meta.js', PAST],
                                    ['app-city-league.js', CL]]) {
            assert.ok(!/textContent = 'Grid View'/.test(src),
                datei + ': "Grid View" ist wieder fest verdrahtet');
            assert.ok(!/textContent = 'List View'/.test(src),
                datei + ': "List View" ist wieder fest verdrahtet');
            assert.ok(src.includes('ansichtsUmschalterBeschriften'),
                datei + ': der Umschalter meldet seinen Zustand nicht mehr an '
                + 'den gemeinsamen Beschriftungshelfer');
        }
        // Seit dem 30.08.2026 (Befund B) liegt der Wortlaut in EINEM
        // Helfer in app-core.js statt dreimal in den Umschaltern. Vorher
        // stand er im Knopf und wurde vom naechsten Sprachwechsel mit dem
        // statischen data-i18n-Wert ueberschrieben.
        assert.ok(CORE.includes("t('btn.listView')") && CORE.includes("t('btn.gridView')"),
            'app-core.js: der Beschriftungshelfer liest die beiden Schluessel nicht');
        zweisprachig('btn.gridView');
        zweisprachig('btn.listView');
    });

    it('die drei Toasts laufen ueber i18n', () => {
        assert.ok(!CMA.includes("showToast('Deck copied to clipboard!'"),
            'app-current-meta-analysis.js: englischer Toast ist zurueck');
        assert.ok(!CMA.includes("showToast('Please select a deck first!'"),
            'app-current-meta-analysis.js: englischer Toast ist zurueck');
        assert.ok(!CMA.includes("showToast('No cards to copy!"),
            'app-current-meta-analysis.js: englischer Toast ist zurueck');
        for (const k of ['cl.deckCopied', 'cl.selectDeckFirst', 'cl.noCopyCards']) {
            assert.ok(CMA.includes("t('" + k + "')"),
                'app-current-meta-analysis.js: ' + k + ' wird nicht benutzt');
            zweisprachig(k);
        }
    });
});

/* ── K · showNotification ──────────────────────────────────── */

describe('Befund K — showNotification sprach 31x englisch und 3x deutsch', () => {
    // Alle showNotification-Aufrufe, deren erstes Argument ein blankes
    // String- oder Template-Literal ist. Genau die waren einsprachig.
    // Aufrufe mit fcText(...), getLang()-Weichen oder mehrzeiligen
    // Ausdruecken zaehlen nicht mit.
    const literale = [];
    for (const m of FC.matchAll(/(?<!\* {5})showNotification\((['`])([\s\S]*?)\1/g)) {
        // Ein Template-Literal mit getLang()-Weiche darin ist bereits
        // zweisprachig — es war nie Teil des Befunds.
        if (/getLang\(\)|isDE/.test(m[2])) continue;
        literale.push(m[2]);
    }

    it('kein Aufruf traegt mehr ein blankes Literal', () => {
        assert.deepEqual(literale, [],
            'firebase-collection.js: diese Hinweise stehen wieder einsprachig im Code: '
            + literale.slice(0, 6).join(' | '));
    });

    it('die Stichproben aus dem Befund laufen ueber i18n', () => {
        const proben = [
            ['notif.wishlistEmpty',   'Wishlist is empty'],
            ['notif.deckDeleted',     'Deck deleted'],
            ['notif.maxCopies',       'Maximum 4 copies per card'],
            ['notif.signInSaveDecks', 'Please sign in to save decks'],
            ['notif.signInFirst',     'Bitte erst einloggen'],
            ['notif.collectionCleared', 'Collection wurde geleert'],
            ['notif.folderDeleteError', 'Fehler beim Loeschen des Ordners'],
        ];
        for (const [key, alt] of proben) {
            assert.ok(FC.includes("fcText('" + key + "'"),
                'firebase-collection.js: "' + alt + '" laeuft nicht ueber ' + key);
            zweisprachig(key);
        }
    });

    it('der Helfer faellt auf den bisherigen Wortlaut zurueck', () => {
        // Ohne Rueckfall zeigt ein fehlender Schluessel dem Nutzer den
        // Schluesselnamen im Hinweis.
        assert.ok(/function fcText\(key, fallback\)[\s\S]{0,260}return fallback;/.test(FC),
            'firebase-collection.js: fcText() hat keinen Rueckfalltext mehr');
    });
});

/* ── L · Anleitungen zitieren die echten Beschriftungen ────── */

describe('Befund L — die Anleitungen nannten fremdsprachige Beschriftungen', () => {
    it('die englische Anleitung nennt den englischen Menuepfad', () => {
        assert.ok(!TUT_EN.includes('open <strong>Mein Profil → Account → Einstellungen'),
            'tutorial.en.html: der deutsche Menuepfad ist zurueck — in der englischen '
            + 'Oberflaeche heissen die Punkte anders, die Anweisung fuehrt ins Leere');
        assert.ok(TUT_EN.includes('My Profile → Account → Settings'),
            'tutorial.en.html: der englische Menuepfad fehlt');
        // Gegenprobe an der Oberflaeche selbst.
        assert.equal(EN['menu.profile'], 'My Profile');
        assert.equal(EN['profile.groupMisc'], 'Account');
        assert.equal(EN['profile.settings'], 'Settings');
        assert.equal(EN['profile.priceAlerts.title'], 'Telegram price alerts');
    });

    it('die deutsche Anleitung nennt die deutschen Schaltflaechen', () => {
        assert.ok(!TUT_DE.includes('<strong>Save</strong>'),
            'tutorial.de.html: "Save" ist zurueck — die deutsche Oberflaeche zeigt "Speichern"');
        assert.ok(!TUT_DE.includes('Main Cards'),
            'tutorial.de.html: "Main Cards" ist zurueck — die deutsche Oberflaeche zeigt "Kernkarten"');
        assert.ok(!TUT_DE.includes('Tech Cards (forced into next Generate)'),
            'tutorial.de.html: der englische Slot-Reihen-Titel ist zurueck');
        // Gegenprobe an der Oberflaeche selbst.
        assert.equal(DE['btn.save'], 'Speichern');
        assert.equal(DE['cl.skelMain'], 'Kernkarten');
        assert.equal(DE['techSlots.label'], 'Tech-Karten');
        assert.equal(DE['techSlots.hint'], '(werden beim nächsten Generate fest ins Deck)');
        assert.ok(TUT_DE.includes('Tech-Karten (werden beim nächsten Generate fest ins Deck)'),
            'tutorial.de.html: die tatsaechliche deutsche Beschriftung fehlt');
    });
});

/* ── N · das Pokedex-Versprechen ───────────────────────────── */

// filterCardsArray und cardPokedexSearchValue aus app-core.js sowie die
// echte Namensaufloesung aus firebase-collection.js in eine Sandbox
// schneiden. Bewusst der ECHTE Code beider Dateien: ein Test gegen eine
// nachgebaute Suche wuerde den Befund nicht abdecken.
function schneide(src, name) {
    const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
    assert.ok(m, 'Funktion nicht gefunden: ' + name);
    const start = m.index;
    const open = src.indexOf('{', start);
    let tiefe = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') tiefe++;
        else if (src[i] === '}') {
            tiefe--;
            if (tiefe === 0) return src.slice(start, i + 1);
        }
    }
    assert.fail('Funktionsende nicht gefunden: ' + name);
}

function sucheSandbox(dexMap) {
    const prefixRe = FC.match(/const POKEMON_FORM_PREFIX_RE = [^\n]+/);
    assert.ok(prefixRe, 'POKEMON_FORM_PREFIX_RE nicht in firebase-collection.js');
    const win = { pokedexNumbers: dexMap };
    const sandbox = {
        console, String, Number, Object, Array, Math, JSON,
        parseInt, parseFloat, isNaN, isFinite, RegExp,
        window: win,
    };
    const code = [
        prefixRe[0],
        schneide(FC, 'getCardPokedexNumber'),
        schneide(CORE, 'cardPokedexSearchValue'),
        schneide(CORE, 'filterCardsArray'),
        'window.getCardPokedexNumber = getCardPokedexNumber;',
        'window.cardPokedexSearchValue = cardPokedexSearchValue;',
    ].join('\n\n');
    const ctx = vm.createContext(sandbox);
    vm.runInContext(code, ctx, { filename: 'pokedex-suche.js' });
    return sandbox;
}

describe('Befund N — die Pokedex-Suche fand nichts', () => {
    // Ein Ausschnitt in der Form, in der die echte CSV ankommt: die
    // Spalte pokedex_number gibt es dort nicht, das Feld ist also
    // undefined.
    // Set und Nummer sind bewusst so gewaehlt, dass weder "25" noch "6"
    // ueber Set+Nummer treffen kann — sonst wuerde der Test einen
    // Pokedex-Treffer melden, der in Wahrheit ein Nummerntreffer ist.
    const karten = [
        { name_en: 'Pikachu',      name: 'Pikachu',      set: 'ASC', number: '55'  },
        { name_en: 'Pikachu ex',   name: 'Pikachu ex',   set: 'ASC', number: '57'  },
        { name_en: 'Charizard ex', name: 'Charizard ex', set: 'OBF', number: '199' },
        { name_en: 'Iono',         name: 'Iono',         set: 'PAL', number: '185' },
        { name_en: 'Ultra Ball',   name: 'Ultra Ball',   set: 'SVI', number: '197' },
    ];
    const dex = { pikachu: 25, charizard: 6 };

    it('die CSV fuehrt die Spalte pokedex_number wirklich nicht', () => {
        // Der Ausgangspunkt des Befunds, als Zusicherung: faellt die
        // Spalte eines Tages doch an, ist dieser Test das Signal, den
        // Rueckfall neu zu bewerten (er bleibt korrekt, die Spalte
        // gewinnt dann).
        const kopf = read('data/all_cards_database.csv').split('\n')[0];
        assert.ok(kopf.includes('name_en') && kopf.includes('set'),
            'all_cards_database.csv: unerwartete Kopfzeile — ' + kopf.slice(0, 120));
    });

    it('ohne die Namenstabelle findet die Suche nach "25" kein Pikachu', () => {
        // Die Lage VOR der Korrektur, nachgestellt: leere Spalte, keine
        // Tabelle. Genau 0 Treffer — das war der Befund.
        const s = sucheSandbox(null);
        const treffer = s.filterCardsArray(karten, '25');
        assert.equal(treffer.length, 0,
            'ohne window.pokedexNumbers darf nichts ueber die Pokedex-Nummer gefunden werden');
    });

    it('mit der Namenstabelle findet "25" beide Pikachu-Drucke', () => {
        const s = sucheSandbox(dex);
        const treffer = s.filterCardsArray(karten, '25').map(c => c.name_en);
        assert.deepEqual(treffer.sort(), ['Pikachu', 'Pikachu ex'],
            'die Suche nach der Pokedex-Nummer 25 muss alle Pikachu-Drucke finden, '
            + 'auch wenn die CSV-Spalte pokedex_number leer ist');
    });

    it('die Suche nach "6" findet Charizard, nicht Iono', () => {
        const s = sucheSandbox(dex);
        const treffer = s.filterCardsArray(karten, '6').map(c => c.name_en);
        assert.ok(treffer.includes('Charizard ex'),
            'Charizard (Pokedex 6) fehlt — der Zusatzname "ex" wird nicht abgeschnitten');
        assert.ok(!treffer.includes('Iono'),
            'Iono ist kein Pokemon und darf keine Pokedex-Nummer bekommen');
    });

    it('eine gefuellte Spalte schlaegt die Namenstabelle', () => {
        const s = sucheSandbox(dex);
        const eigen = [{ name_en: 'Pikachu', name: 'Pikachu', set: 'ASC', number: '55',
                         pokedex_number: '777' }];
        assert.equal(s.filterCardsArray(eigen, '777').length, 1,
            'eine gefuellte pokedex_number muss gewinnen');
        assert.equal(s.filterCardsArray(eigen, '25').length, 0,
            'bei gefuellter Spalte darf der Rueckfall nicht zusaetzlich greifen');
    });

    it('filterCardsArray laeuft auch ohne window (Sandbox der Unit-Tests)', () => {
        const nurFn = {};
        const ctx = vm.createContext({ console, String, Number, Object, Array, Math, JSON,
                                       parseInt, parseFloat, isNaN, isFinite, RegExp });
        vm.runInContext(schneide(CORE, 'filterCardsArray') + '\nthis.f = filterCardsArray;', ctx);
        nurFn.f = ctx.f;
        assert.doesNotThrow(() => nurFn.f(karten, 'pika'),
            'filterCardsArray darf ohne window nicht werfen — die bestehenden Unit-Tests '
            + 'schneiden genau diese Funktion allein in eine Sandbox');
        assert.equal(nurFn.f(karten, 'pika').length, 2);
    });

    it('die beiden DOM-Filter haben den Pokedex-Zweig bekommen', () => {
        for (const [datei, src] of [['app-current-meta-analysis.js', CMA],
                                    ['app-past-meta.js', PAST]]) {
            assert.ok(src.includes('cardPokedexSearchValue'),
                datei + ': der Pokedex-Zweig fehlt wieder — das Suchfeld daneben '
                + 'verspricht Pokedex-Suche');
            assert.ok(/dexNum !== '' && dexNum === searchTerm/.test(src),
                datei + ': der Vergleich auf die exakte Pokedex-Nummer fehlt');
        }
        assert.ok(CARDS.includes('cardPokedexSearchValue'),
            'app-cards-db.js: der Pokedex-Zweig liest wieder nur die leere CSV-Spalte');
    });

    it('es gibt genau EINE Namensaufloesung, keine zweite Kopie', () => {
        // Dieses Projekt hatte schon einmal drei auseinandergelaufene
        // Kopien derselben Namensnormalisierung.
        assert.equal((CORE.match(/function getCardPokedexNumber\s*\(/g) || []).length, 0,
            'app-core.js: eine zweite Kopie von getCardPokedexNumber ist entstanden — '
            + 'sie kollidiert ausserdem mit der globalen aus firebase-collection.js');
        assert.ok(CORE.includes('window.getCardPokedexNumber'),
            'app-core.js: cardPokedexSearchValue benutzt die vorhandene Aufloesung nicht');
    });
});

/* ── Wortlaut-Konvention ───────────────────────────────────── */

describe('Konvention — jeder neue Schluessel steht genau zweimal', () => {
    const neu = [
        'cmw.title', 'cmw.dialogAria', 'cmw.intro', 'cmw.section1', 'cmw.section1Accent',
        'cmw.section1Hint', 'cmw.section2', 'cmw.section2Accent', 'cmw.copyPaste',
        'cmw.openWants', 'cmw.hintEmpty', 'cmw.hintMissing', 'cmw.hintMore', 'cmw.hintOk',
        'cmw.listEmpty', 'cmw.rowTitle', 'cmw.rowFallbackTitle',
        'bj.notesLabel',
        'cdb.copyNames', 'cdb.copyNamesTitle', 'cdb.copied', 'cdb.copyFailed',
        'cdb.showAll', 'cdb.showAllTitle', 'cdb.showPaginated', 'cdb.showPaginatedTitle',
        'cdb.prev', 'cdb.prevAria', 'cdb.next', 'cdb.nextAria',
        'sideQuest.subtitle', 'sideQuest.lastUpdated',
        'ui.saveDeckGridImage', 'legend.sampleCardName', 'settings.chatIdPlaceholder',
        'btn.listView', 'cb.browseAria',
        'notif.signInFeature', 'notif.signInSaveDecks', 'notif.signInProfile',
        'notif.signInFirst', 'notif.maxCopiesPlayset', 'notif.maxCopies',
        'notif.collectionError', 'notif.collectionAlreadyEmpty', 'notif.collectionCleared',
        'notif.wishlistAdded', 'notif.wishlistError', 'notif.wishlistCount',
        'notif.wishlistRemoved', 'notif.wishlistEmpty', 'notif.wishlistCopied',
        'notif.wishlistCopiedShort', 'notif.invalidDeckSource', 'notif.emptyDeck',
        'notif.deckSavedNamed', 'notif.deckSaved', 'notif.deckUpdated', 'notif.deckDeleted',
        'notif.deckError', 'notif.noDecksLoaded', 'notif.deckNotFound',
        'notif.chatIdInvalid', 'notif.priceAlertsOn', 'notif.priceAlertsOff',
        'notif.saveFailed', 'notif.enterName', 'notif.nameUpdated', 'notif.nameError',
        'notif.imageExportUnavailable', 'notif.copyFailed', 'notif.nothingToCopy',
        'notif.pasteTextCopied', 'notif.folderDeleted', 'notif.folderDeleteError',
        'notif.folderExists', 'notif.folderCreated', 'notif.deckMoved',
        'notif.deckUnfiled', 'notif.deckMoveError', 'notif.tradelistAdded',
        'notif.tradelistError', 'notif.tradelistCount', 'notif.tradelistRemoved',
        'notif.tradelistEmpty', 'notif.tradelistCopied', 'notif.tradelistCopiedShort',
    ];

    it('jeder neue Schluessel kommt genau zweimal in js/i18n.js vor', () => {
        for (const k of neu) {
            const n = (I18N.match(new RegExp("'" + k.replace(/\./g, '\\.') + "':", 'g')) || []).length;
            assert.equal(n, 2, 'js/i18n.js: "' + k + '" steht ' + n + 'x statt genau 2x '
                + '(einmal im en-Block, einmal im de-Block)');
        }
    });

    it('keiner der neuen Schluessel hat in de nur den englischen Wert', () => {
        // Ausnahme: Schluessel, deren Wert in beiden Sprachen gleich
        // lauten DARF, gibt es hier nicht — alle tragen Text.
        for (const k of neu) zweisprachig(k);
    });
});
