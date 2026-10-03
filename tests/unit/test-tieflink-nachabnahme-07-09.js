/**
 * Nachabnahme der Navigations-/Tieflink-Reparatur, 07.09.2026.
 *
 * Die unabhaengige Abnahme hat die Reparatur im Kern abgenommen und
 * dabei sechs weitere Befunde gemessen. Diese Datei haelt sie fest —
 * und zwar, wo immer es geht, AUSGEFUEHRT statt gegriffen. Die Abnahme
 * hat naemlich auch gezeigt, was ein `assert.match(SRC, ...)` nicht
 * faengt: eine Zeile, die im Quelltext steht und zur Laufzeit tot ist.
 *
 * GEMESSENE AUSGANGSLAGE (Browser, lokal ausgeliefertes index.html):
 *
 *   B1  Kopfzeilen-Knopf "Card Database" (index.html:608)
 *       von #current-meta aus geklickt -> Reiter cards, Hash blieb
 *       #current-meta.                                        FALSCH
 *   B2  navigateToAnalysisWithDeck() / navigateToPastMetaWithDeck()
 *       riefen switchTab() direkt. switchTab (js/app-core.js:1524)
 *       enthaelt 0x __dsSchreibeTabHash, location.hash, pushState,
 *       replaceState — die Adresse blieb also stehen.          FALSCH
 *   B3  #deckcompare und #settings: Hash von Hand gesetzt -> Reiter
 *       blieb stehen, Untertab blieb profile-collection. 9 von 11
 *       Untertabs loesten auf, diese zwei nicht.               FALSCH
 *   B4  Zweimal derselbe Kopfzeilen-Knopf: history.length 3 -> 4 bei
 *       unveraendertem #wishlist, der zweite Zurueck-Druck aenderte
 *       nichts Sichtbares.                                     FALSCH
 *   B5  #quellen-<unbekannt> wechselte nicht einmal den Reiter
 *       (blieb auf meta-analysis-hub), obwohl der Kommentar in
 *       applyHash() zusagt, ein unbekannter Anker solle "die Seite
 *       oeffnen und in Ruhe lassen".                           FALSCH
 *   B6  tutorial.en.html nannte tcg-showdown.com zweimal, verlinkte
 *       es null mal — 10 <a> gegen 12 in der deutschen Fassung.
 *   Zusatz  Fehlte eine Kennung in Quellen.ids(), blieb der Abschnitt
 *       stumm zu: 0 Meldungen, 0 console.warn.
 *   M17/M18  Zwei Wachen in schreibeProfilHash() waren ungetestet.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { sandkasten, UNTERTAB_IDS } = require('./lib-tieflink-sandkasten.js');

const WURZEL = path.join(__dirname, '..', '..');
const MARKUP = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const CORE = fs.readFileSync(path.join(WURZEL, 'js', 'app-core.js'), 'utf8');
const TUT_DE = fs.readFileSync(path.join(WURZEL, 'tutorial', 'tutorial.de.html'), 'utf8');
const TUT_EN = fs.readFileSync(path.join(WURZEL, 'tutorial', 'tutorial.en.html'), 'utf8');

// ── B1 ───────────────────────────────────────────────────────────────

describe('B1 — die Kopfzeilen-Knoepfe schreiben die Adresse mit', () => {
    it('kein onclick im Markup ruft switchTab() direkt', () => {
        // Die REGEL, nicht der eine Knopf: switchTab() schaltet nur um.
        // Wer es aus dem Markup ruft, laesst die Adresse auf der vorigen
        // Ansicht stehen — genau der gemessene Befund B1.
        const treffer = [...MARKUP.matchAll(/onclick="switchTab\(([^)]*)\)/g)].map(m => m[1]);
        assert.deepStrictEqual(treffer, [],
            'diese onclick-Ziele gehen an der Adresse vorbei: ' + treffer.join(', '));
    });

    it('der Knopf "Card Database" nimmt den Weg der drei anderen', () => {
        const knopf = /<button class="header-icon-btn header-cards-btn"[^>]*>/.exec(MARKUP);
        assert.ok(knopf, 'den Kopfzeilen-Knopf zur Kartendatenbank gibt es nicht mehr');
        assert.match(knopf[0], /onclick="switchTabAndUpdateMenu\('cards'\)"/);
    });

    it('alle vier Kopfzeilen-Verknuepfungen nehmen einen adressschreibenden Weg', () => {
        for (const klasse of ['header-mydecks-btn', 'header-wishlist-btn',
                              'header-cards-btn', 'header-profile-btn']) {
            const m = new RegExp('<button[^>]*class="[^"]*' + klasse + '[^"]*"[^>]*>').exec(MARKUP);
            assert.ok(m, 'Knopf ' + klasse + ' fehlt');
            assert.match(m[0], /onclick="(switchTabAndUpdateMenu|openProfileSection)\(/,
                klasse + ' schaltet an der Adresse vorbei um');
        }
    });
});

// ── B2 ───────────────────────────────────────────────────────────────

/** Einen benannten Block aus einer Quelle per Klammerzaehlung schneiden. */
function block(src, marke) {
    const start = src.indexOf(marke);
    assert.ok(start >= 0, 'nicht gefunden: ' + marke);
    let tiefe = 0;
    for (let j = src.indexOf('{', start); j < src.length; j++) {
        if (src[j] === '{') tiefe++;
        else if (src[j] === '}') { tiefe--; if (tiefe === 0) return src.slice(start, j + 1); }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
}

/**
 * Eine Navigationsfunktion wirklich AUSFUEHREN und nachsehen, welchen
 * Reiterwechsel sie nimmt. Ein Grep auf den Quelltext wuerde eine
 * auskommentierte oder abgeschaltete Zeile nicht bemerken.
 */
function fuehreNavigationAus(quelltextBloecke, aufruf) {
    const gesehen = { menue: [], nurTab: [] };
    const kontext = {
        console: { warn() {}, error() {}, log() {} },
        devLog() {},
        setTimeout() { /* die Warteschleifen interessieren hier nicht */ },
        document: { getElementById: () => null },
        Event: function () {},
        switchTabAndUpdateMenu: t => gesehen.menue.push(t),
        switchTab: t => gesehen.nurTab.push(t)
    };
    kontext.window = kontext;
    vm.createContext(kontext);
    vm.runInContext(quelltextBloecke.join('\n') + '\n' + aufruf, kontext,
                    { filename: 'app-core-navigation.js' });
    return gesehen;
}

describe('B2 — die zwei uebersehenen Geschwister der Held-Kachel-Wege', () => {
    const WECHSLER = block(CORE, 'function wechsleZuAnalyse(tabId)');

    it('navigateToAnalysisWithDeck() wechselt ueber switchTabAndUpdateMenu', () => {
        const gesehen = fuehreNavigationAus(
            [WECHSLER, block(CORE, 'function navigateToAnalysisWithDeck(archetypeName)')],
            "navigateToAnalysisWithDeck('Dragapult ex');");
        assert.deepStrictEqual(gesehen.menue, ['city-league-analysis'],
            'die City-League-Analyse ist wieder nicht verlinkbar: switchTab() '
            + 'schreibt keine Adresse (0x pushState/replaceState/location.hash)');
        assert.deepStrictEqual(gesehen.nurTab, []);
    });

    it('navigateToPastMetaWithDeck() ebenfalls', () => {
        const gesehen = fuehreNavigationAus(
            [WECHSLER, block(CORE, 'window.navigateToPastMetaWithDeck = function(')],
            "window.navigateToPastMetaWithDeck('Dragapult ex', 'TEF-POR');");
        assert.deepStrictEqual(gesehen.menue, ['past-meta']);
        assert.deepStrictEqual(gesehen.nurTab, []);
    });

    it('und beide haben weiterhin eine Rueckfallebene ohne switchTabAndUpdateMenu', () => {
        // Ohne sie wuerde ein Ladefehler in js/inline-init.js die
        // Navigation ganz stilllegen statt nur die Adresse zu verlieren.
        for (const [marke, aufruf, ziel] of [
            ['function navigateToAnalysisWithDeck(archetypeName)',
             "navigateToAnalysisWithDeck('X');", 'city-league-analysis'],
            ['window.navigateToPastMetaWithDeck = function(',
             "window.navigateToPastMetaWithDeck('X', '');", 'past-meta']]) {
            const gesehen = { nurTab: [] };
            const kontext = {
                console: { warn() {}, error() {}, log() {} },
                devLog() {}, setTimeout() {},
                document: { getElementById: () => null },
                switchTab: t => gesehen.nurTab.push(t)
            };
            kontext.window = kontext;
            vm.createContext(kontext);
            vm.runInContext(block(CORE, 'function wechsleZuAnalyse(tabId)') + '\n'
                            + block(CORE, marke) + '\n' + aufruf, kontext);
            assert.deepStrictEqual(gesehen.nurTab, [ziel],
                marke + ' faellt ohne switchTabAndUpdateMenu ins Leere');
        }
    });
});

// ── B3 ───────────────────────────────────────────────────────────────

describe('B3 — jeder Profil-Untertab im Markup ist verlinkbar', () => {
    it('das Markup hat die elf Untertabs, die die Abnahme gezaehlt hat', () => {
        assert.ok(UNTERTAB_IDS.length >= 11,
            'nur ' + UNTERTAB_IDS.length + ' .profile-tab-content gefunden: '
            + UNTERTAB_IDS.join(', '));
        for (const id of ['deckcompare', 'settings']) {
            assert.ok(UNTERTAB_IDS.includes(id), 'profile-' + id + ' fehlt im Markup');
        }
    });

    it('jede Kennung loest zur Laufzeit auf Reiter profile + eigenen Untertab auf', () => {
        // Die REGEL, nicht die zwei Nachzuegler: wer morgen einen
        // zwoelften Untertab einbaut, faellt hier auf, bevor der
        // naechste stille Tieflink entsteht.
        for (const id of UNTERTAB_IDS) {
            const s = sandkasten({ hash: '#current-meta' });
            s.start();
            const vorReiter = s.protokoll.reiter.length;
            s.gehZu('#' + id);
            assert.deepStrictEqual(s.protokoll.reiter.slice(vorReiter), ['profile'],
                '#' + id + ' wechselt den Reiter nicht — applyHash() steigt bei '
                + '`if (!tabId) return` aus');
            assert.deepStrictEqual(s.protokoll.untertab, [id],
                '#' + id + ' oeffnet das Profil, bleibt aber auf dem zuletzt '
                + 'offenen Untertab stehen (im Zweifel "Meine Sammlung")');
        }
    });
});

// ── B4 ───────────────────────────────────────────────────────────────

describe('B4 — ein Klick, genau ein Verlaufseintrag', () => {
    it('der Klick auf eine Kopfzeilen-Verknuepfung schiebt einmal', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        const vorher = s.fenster.history.length;
        s.kontext.openProfileSection('wishlist');
        assert.equal(s.hash(), '#wishlist');
        assert.equal(s.fenster.history.length, vorher + 1,
            'gemessen wurde 3 -> 4 statt 3 -> 4 mit sichtbarer Wirkung: '
            + 'der Zwischenschritt "#profile" kostet einen Verlaufseintrag, '
            + 'den niemand besucht hat. Verlauf: '
            + JSON.stringify(s.protokoll.verlauf));
    });

    it('und schiebt "#profile" dabei nicht als Zwischenstand in den Verlauf', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.kontext.openProfileSection('decks');
        const profileEintraege = s.protokoll.verlauf.filter(e => /#profile$/.test(e[1]));
        assert.deepStrictEqual(profileEintraege, [],
            '"#profile" stand keine Millisekunde in der Adresszeile — ein '
            + 'Verlaufseintrag dafuer ist eine Sackgasse');
    });

    it('der Klick auf den bereits offenen Untertab kostet gar keinen', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.kontext.openProfileSection('wishlist');
        const nachErstem = s.fenster.history.length;
        s.kontext.openProfileSection('wishlist');
        s.kontext.openProfileSection('wishlist');
        assert.equal(s.fenster.history.length, nachErstem,
            'zweimal derselbe Knopf, und der Zurueck-Druck aendert nichts '
            + 'Sichtbares. Verlauf: ' + JSON.stringify(s.protokoll.verlauf));
        assert.equal(s.hash(), '#wishlist');
    });

    it('ein Wechsel zwischen zwei Untertabs bleibt zurueckgehbar', () => {
        // Die Sperre darf nicht ins Gegenteil kippen: wer von der
        // Wunschliste zu "Meine Decks" geht, muss zurueckkommen.
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.kontext.openProfileSection('wishlist');
        const nachErstem = s.fenster.history.length;
        s.kontext.openProfileSection('decks');
        assert.equal(s.hash(), '#decks');
        assert.equal(s.fenster.history.length, nachErstem + 1);
    });

    it('auch der normale Reiterwechsel bleibt bei einem Eintrag pro Klick', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        const vorher = s.fenster.history.length;
        s.kontext.switchTabAndUpdateMenu('cards');
        s.kontext.switchTabAndUpdateMenu('cards');
        assert.equal(s.hash(), '#cards');
        assert.equal(s.fenster.history.length, vorher + 1);
    });
});

// ── B5 + Zusatz ──────────────────────────────────────────────────────

function quellenErsatz(liste, protokoll) {
    return {
        open: id => protokoll.push(id),
        ids: () => liste
    };
}

describe('B5 — ein unbekannter Abschnittsanker oeffnet die Seite und laesst sie in Ruhe', () => {
    const ECHTE = ['quellen', 'umfang', 'begriffe', 'zuverlaessig',
                   'trennung', 'stand', 'rechtliches'];

    it('#quellen-<unbekannt> wechselt den Reiter — wie der Kommentar zusagt', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', quellen: quellenErsatz(ECHTE, offen) });
        s.start();
        const vorher = s.protokoll.reiter.length;
        s.gehZu('#quellen-tippfehler');
        assert.deepStrictEqual(s.protokoll.reiter.slice(vorher), ['quellen'],
            'gemessen blieb der Reiter auf meta-analysis-hub stehen, waehrend '
            + 'der Kommentar in applyHash() "die Seite oeffnen" verspricht');
    });

    it('klappt dabei keinen Abschnitt auf und scrollt nirgendwohin', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', quellen: quellenErsatz(ECHTE, offen) });
        s.start();
        s.gehZu('#quellen-tippfehler');
        assert.deepStrictEqual(offen, [''],
            'ein unbekannter Anker darf nicht ins Leere scrollen');
    });

    it('und ein bekannter Anker klappt weiterhin seinen Abschnitt auf', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', quellen: quellenErsatz(ECHTE, offen) });
        s.start();
        s.gehZu('#quellen-stand');
        assert.deepStrictEqual(offen, ['stand']);
    });
});

describe('Zusatz — ein Tieflink, der nicht ankommt, sagt es', () => {
    it('nennt den unbekannten Abschnitt in der Konsole', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', quellen: quellenErsatz(['quellen', 'stand'], offen) });
        s.start();
        s.gehZu('#quellen-umfang');   // Kennung fehlt in ids()
        assert.equal(offen.length, 1);
        assert.equal(offen[0], '', 'ein Abschnitt, den es nicht gibt, darf nicht aufklappen');
        assert.ok(s.protokoll.warnungen.some(w => /umfang/.test(w) && /quellen/i.test(w)),
            'stiller Ausfall: 0 console.warn, obwohl der Verweis nicht ankam. '
            + 'Gesehen: ' + JSON.stringify(s.protokoll.warnungen));
    });

    it('und zeigt eine Meldung, wenn die Meldungsleiste geladen ist', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', quellen: quellenErsatz(['quellen'], offen) });
        s.start();
        s.gehZu('#quellen-rechtliches');
        assert.equal(s.protokoll.meldungen.length, 1,
            'der Besucher sieht eine zugeklappte Seite und haelt sie fuer das Ziel');
        assert.match(s.protokoll.meldungen[0][0], /rechtliches/);
    });

    it('schweigt dagegen, wenn der Abschnitt existiert', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', quellen: quellenErsatz(['quellen', 'stand'], offen) });
        s.start();
        s.gehZu('#quellen-stand');
        assert.deepStrictEqual(s.protokoll.meldungen, [],
            'eine Warnung auf dem guten Weg macht die Warnung wertlos');
    });

    it('faellt ohne showNotification nicht um — die Konsole reicht', () => {
        const offen = [];
        const s = sandkasten({ hash: '#hub', ohneMeldung: true,
                               quellen: quellenErsatz(['quellen'], offen) });
        s.start();
        s.gehZu('#quellen-stand');
        assert.equal(offen.length, 1);
        assert.ok(s.protokoll.warnungen.length >= 1);
    });
});

// ── B6 ───────────────────────────────────────────────────────────────

/* UI-78 (03.10.2026, Entscheidung Hausi „kurz neu + Glossar"): hier stand
   „B6 — beide Anleitungen verlinken den externen Playtester". Der Block pruefte Inhalte der alten Langfassung der Anleitung,
   die es nicht mehr gibt. Die neue Seite pruefen tests/unit/test-tutorial.js
   (Erste Schritte + Glossar) und tests/unit/test-day2-schreibweise.js. */

// ── M17 / M18 ────────────────────────────────────────────────────────

describe('M17 — schreibeProfilHash() schreibt nur die kanonische Kurzform', () => {
    it('eine Kurzform, die nicht auf sich selbst zeigt, landet nicht in der Adresse', () => {
        // 'meta-binder' loest zwar auf (HASH_ALIASES -> profile,
        // PROFILE_SUBTAB_FOR_HASH -> 'metabinder'), ist aber nicht die
        // kanonische Schreibweise. Wuerde sie geschrieben, haette
        // dieselbe Ansicht zwei Adressen — dieselbe Regel, die
        // kanonischerHash() fuer Reiter durchsetzt.
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.fenster.__dsSchreibeProfilHash('meta-binder');
        assert.notEqual(s.hash(), '#meta-binder',
            'die Selbstbezugs-Wache ist weg: dieselbe Ansicht hat jetzt zwei Adressen');
    });

    it('statt dessen bleibt die Adresse bei etwas, das applyHash() aufloest', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.fenster.__dsSchreibeProfilHash('meta-binder');
        const h = s.hash().replace(/^#/, '');
        const wieder = sandkasten({ hash: '#current-meta' });
        wieder.start();
        const vorher = wieder.protokoll.reiter.length;
        wieder.gehZu('#' + h);
        assert.deepStrictEqual(wieder.protokoll.reiter.slice(vorher), ['profile'],
            'die geschriebene Adresse "' + h + '" fuehrt nirgendwohin');
    });

    it('die kanonische Kurzform wird dagegen geschrieben', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.fenster.__dsSchreibeProfilHash('metabinder');
        assert.equal(s.hash(), '#metabinder');
    });

    it('und eine Kennung, die gar nicht ins Profil fuehrt, wird abgewiesen', () => {
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.fenster.__dsSchreibeProfilHash('hub');
        assert.notEqual(s.hash(), '#hub');
    });
});

describe('M18 — waehrend applyHash() laeuft, wird nichts zurueckgeschrieben', () => {
    it('ein Untertab-Schreibversuch aus dem Routing heraus bleibt folgenlos', () => {
        // applyHash() liest den Hash und ruft switchTabAndUpdateMenu.
        // Alles, was dabei zurueckschreibt, ueberschreibt die Adresse,
        // die gerade aufgeloest wird. Diese Sperre hat heute keinen
        // erreichbaren Produktionsweg — belegt wird sie trotzdem, sonst
        // faellt sie beim naechsten Aufraeumen weg und der Fehler kommt
        // ohne Warnung wieder.
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        const vorher = s.protokoll.verlauf.length;
        const echt = s.kontext.switchTabAndUpdateMenu;
        s.kontext.switchTabAndUpdateMenu = function (t) {
            s.fenster.__dsSchreibeProfilHash('wishlist');
            return echt.apply(null, arguments);
        };
        s.fenster.switchTabAndUpdateMenu = s.kontext.switchTabAndUpdateMenu;
        s.gehZu('#tutorial');
        assert.equal(s.hash(), '#tutorial',
            'das Routing hat sich seine eigene Adresse ueberschrieben');
        assert.deepStrictEqual(s.protokoll.verlauf.slice(vorher), [],
            'waehrend applyHash() laeuft, darf kein Verlaufseintrag entstehen. '
            + 'Gesehen: ' + JSON.stringify(s.protokoll.verlauf.slice(vorher)));
    });

    it('ausserhalb des Routings schreibt dieselbe Funktion sehr wohl', () => {
        // Sonst waere die Sperre nicht bewiesen, sondern nur eine
        // Funktion, die nie etwas tut.
        const s = sandkasten({ hash: '#current-meta' });
        s.start();
        s.fenster.__dsSchreibeProfilHash('wishlist');
        assert.equal(s.hash(), '#wishlist');
    });
});
