/**
 * js/ds-share.js — die beiden teilbaren Bilder.
 *
 * Ein Canvas kann keine CSS-Variablen auflösen, deshalb steht die
 * Palette in ds-share.js als Kopie der Dunkelmodus-Werte aus
 * css/tokens.css. Eine Kopie ohne Test ist eine Kopie, die auseinander
 * läuft: der erste Test hier vergleicht sie Zeile für Zeile.
 *
 * Die übrigen Tests halten die drei Entscheidungen fest, die den
 * Unterschied zur Vorlage ausmachen und die man beim nächsten Anfassen
 * am ehesten wieder verliert:
 *
 *  - Die Bildkarte zeigt beste UND schlechteste Matchups. Nur die
 *    Oberseite einer sortierten Liste zu zeigen ist Werbung, und jedes
 *    Deck sieht darauf gut aus.
 *  - Jede Zeile trägt ihre Partienzahl. Eine 68-%-Zeile über 9 Partien
 *    ist nicht dasselbe Argument wie eine über 238.
 *  - Die divergierende Skala bleibt blau↔rot. Grün↔rot ist die
 *    häufigste Farbsehschwäche, und css/tokens.css nennt poke_hive
 *    dort ausdrücklich als Vorbild mit genau dieser Schwäche.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/** Kommentare raus, bevor eine Zusicherung nach Code sucht. */
const ohneKommentar = src => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SHARE = fs.readFileSync(path.join(ROOT, 'js', 'ds-share.js'), 'utf8');
const TOKENS = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
const SHARE_CSS = fs.readFileSync(path.join(ROOT, 'css', 'ds-share.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NAV = fs.readFileSync(path.join(ROOT, 'js', 'ds-nav.js'), 'utf8');
const CARD = fs.readFileSync(path.join(ROOT, 'js', 'app-archetype-card.js'), 'utf8');
const JOURNAL = fs.readFileSync(path.join(ROOT, 'js', 'battle-journal.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

// Der Dunkelmodus-Block aus tokens.css, ohne den Hellmodus darüber.
const DARK = TOKENS.slice(TOKENS.indexOf(':root[data-theme="dark"]'));

function tokenValue(name) {
    const m = DARK.match(new RegExp('--' + name + ':\\s*([^;]+);'));
    return m ? m[1].trim() : null;
}
function paletteValue(key) {
    const m = SHARE.match(new RegExp("\\b" + key + ":\\s*'([^']+)'"));
    return m ? m[1].trim() : null;
}

describe('ds-share: die Palette ist eine geprüfte Kopie', () => {
    // Links der Schlüssel in ds-share.js, rechts der Tokenname.
    const MIRROR = {
        surface1: 'surface-1',
        surface2: 'surface-2',
        line: 'line',
        lineStrong: 'line-strong',
        ink: 'ink',
        ink2: 'ink-2',
        ink3: 'ink-3',
        brand: 'brand',
        brandInk: 'brand-ink',
        gold: 'gold',
        alarm: 'alarm',
        dvPos: 'dv-pos',
        dvNeg: 'dv-neg',
        dvZero: 'dv-zero',
        dvPosBg: 'dv-pos-bg',
        dvNegBg: 'dv-neg-bg',
        spaceJp: 'space-jp',
        bg1: 'surface-0',
    };

    for (const [key, token] of Object.entries(MIRROR)) {
        it(`${key} entspricht --${token} im Dunkelmodus`, () => {
            const want = tokenValue(token);
            const got = paletteValue(key);
            assert.ok(want, `--${token} fehlt im Dunkelmodus-Block von tokens.css`);
            assert.ok(got, `${key} fehlt in der Palette von ds-share.js`);
            assert.equal(got.toLowerCase(), want.toLowerCase(),
                `${key} in js/ds-share.js sagt ${got}, css/tokens.css sagt --${token}: ${want}. ` +
                'Die Palette ist eine Kopie — wenn das Token wandert, muss sie mitwandern.');
        });
    }

    it('spaceGl und spacePast folgen ihren Tokens, nicht einer eigenen Farbe', () => {
        assert.equal(paletteValue('spaceGl').toLowerCase(), tokenValue('brand').toLowerCase());
        assert.equal(paletteValue('spacePast').toLowerCase(), tokenValue('ink-3').toLowerCase());
    });
});

describe('ds-share: die drei Datenraum-Farben sind definiert', () => {
    // css/ds-nav.css hat --space-jp/--space-gl/--space-past ab dem
    // 17.08.2026 benutzt, ohne dass sie irgendwo standen: border-left-color
    // fiel still auf currentColor zurück, Japan und Past sahen identisch
    // aus. Ein referenzierter Name ohne Definition wirft nichts — er tut
    // einfach nichts, und genau deshalb gehört er in einen Test.
    for (const name of ['space-jp', 'space-gl', 'space-past']) {
        it(`--${name} ist in beiden Modi definiert`, () => {
            const light = TOKENS.slice(0, TOKENS.indexOf(':root[data-theme="dark"]'));
            assert.match(light, new RegExp('--' + name + ':'),
                `--${name} fehlt im Hellmodus von css/tokens.css`);
            assert.match(DARK, new RegExp('--' + name + ':'),
                `--${name} fehlt im Dunkelmodus von css/tokens.css`);
        });
    }

    it('jede in css/*.css benutzte --space-*-Variable existiert auch', () => {
        const cssDir = path.join(ROOT, 'css');
        const used = new Set();
        for (const f of fs.readdirSync(cssDir).filter(x => x.endsWith('.css'))) {
            const txt = fs.readFileSync(path.join(cssDir, f), 'utf8');
            for (const m of txt.matchAll(/var\(\s*(--space-[a-z0-9-]+)\s*\)/g)) used.add(m[1]);
        }
        for (const name of used) {
            assert.match(TOKENS, new RegExp(name.replace(/-/g, '\\-') + ':'),
                `${name} wird benutzt, ist aber nirgends definiert — die Regel fällt still aus.`);
        }
    });
});

describe('ds-share: die Entscheidungen gegen die Vorlage', () => {
    it('zeigt beste und schlechteste Matchups, nicht die besten n', () => {
        // Der Zuschnitt nimmt Kopf UND Schwanz der sortierten Liste.
        assert.match(SHARE, /all\.slice\(0, head\)\.concat\(all\.slice\(all\.length - tail\)\)/,
            'Der Matchup-Zuschnitt nimmt nur noch den Anfang der Liste — ' +
            'damit sieht jedes Deck auf seiner eigenen Bildkarte gut aus.');
        assert.match(SHARE, /weitere Matchups ausgelassen/,
            'Die ausgelassenen Zeilen werden nicht mehr benannt.');
    });

    it('malt keine Zeile ohne ihre Partienzahl', () => {
        assert.match(SHARE, /L\('Matches', 'Games'\)/,
            'Die Spalte mit der Matchzahl ist aus der Matchup-Tabelle verschwunden.');
        assert.match(SHARE, /num\(m\.games, 0\)/,
            'Die Matchzahl wird nicht mehr je Zeile gemalt.');
    });

    it('benutzt keine grün↔rot-Skala', () => {
        // Alles Farbige läuft über die dv-*-Werte aus der Palette. Eine
        // frische Grünkomponente im Zeichencode wäre der Rückfall.
        const greens = SHARE.match(/#[0-9a-f]{0,2}(?:[8-9a-f][0-9a-f])[0-9a-f]{2}\b/gi) || [];
        const suspicious = greens.filter(h => {
            const v = h.replace('#', '');
            if (v.length !== 6) return false;
            const r = parseInt(v.slice(0, 2), 16);
            const g = parseInt(v.slice(2, 4), 16);
            const b = parseInt(v.slice(4, 6), 16);
            return g > 150 && g > r + 40 && g > b + 40;   // klar grün
        });
        assert.deepEqual(suspicious, [],
            'Grüner Farbwert in js/ds-share.js: ' + suspicious.join(', ') +
            '. Die Skala der Seite ist blau↔rot, siehe css/tokens.css.');
    });

    it('das Ergebnisbild ist quadratisch', () => {
        assert.match(SHARE, /RC = \{ S: 1080/,
            'Instagram schneidet alles, was nicht 1:1 ist — das ist der Grund für 1080×1080.');
    });

    it('das Deckbild misst 1200 × 675', () => {
        assert.match(SHARE, /W: 1200, H: 675/);
    });
});

describe('ds-share: verdrahtet', () => {
    it('css und js hängen in index.html', () => {
        assert.match(HTML, /href="css\/ds-share\.css/);
        assert.match(HTML, /src="js\/ds-share\.js/);
    });

    it('ds-share.js lädt nach ds-nav.js und nach app-archetype-card.js', () => {
        // Beide werden erst beim Klick gelesen, aber die Reihenfolge im
        // Dokument ist die billigste Absicherung, die es gibt.
        const posShare = HTML.indexOf('src="js/ds-share.js');
        assert.ok(posShare > HTML.indexOf('src="js/ds-nav.js'), 'ds-share.js steht vor ds-nav.js');
        assert.ok(posShare > HTML.indexOf('src="js/app-archetype-card.js'),
            'ds-share.js steht vor app-archetype-card.js');
    });

    it('DsNav hoert den Sprachwechsel auf document ab', () => {
        // js/i18n.js verschickt `new CustomEvent('languageChanged')` auf
        // document und OHNE bubbles — ein Listener auf window loest nie
        // aus. Genau so stand es hier bis zum 18.08.2026: die Leiste
        // blieb nach jedem Sprachwechsel auf der alten Sprache stehen,
        // waehrend der Rest der Seite umschaltete.
        assert.match(NAV, /document\.addEventListener\('languageChanged'/,
            'js/ds-nav.js hoert wieder nur auf window — dort kommt das Ereignis nie an.');
    });

    it('DsNav gibt die Fakten für den Bildfuß heraus', () => {
        assert.match(NAV, /getFacts: function \(space\)/);
        assert.match(NAV, /spaceForTab: function \(tabId\)/);
    });

    it('die Archetyp-Karte liefert ihre Zahlen ohne HTML', () => {
        assert.match(CARD, /window\.getArchetypeFacts = function/);
        assert.match(CARD, /window\.getArchetypeMatchups = function/);
    });

    it('der Knopf im Kopf der Archetyp-Karte ruft DsShare', () => {
        assert.match(CARD, /class="arc-share"/);
        assert.match(CARD, /window\.DsShare\.shareDeckCard\(deck\)/);
    });

    it('das Journal hat einen Knopf für das quadratische Bild', () => {
        // Mit dem Meta-Schluessel: das Bild muss dieselbe Gruppe zeigen wie
        // die Kopfzeile, neben der der Knopf steht.
        assert.match(JOURNAL, /shareTournamentCard\('\$\{safeTournKey\}','\$\{safeMetaKey\}'\)/);
        assert.match(JOURNAL, /window\.shareTournamentCard = function/);
        // Fehlt das Modul, sagt der Knopf das — er ist nicht einfach tot.
        assert.match(JOURNAL, /bj\.shareCardMissing/);
    });

    it('jeder neue Textschlüssel steht in beiden Sprachen', () => {
        for (const key of ['arc.shareImage', 'arc.shareImageTip',
                           'bj.shareTournamentCard', 'bj.shareCardMissing',
                           'bj.placement', 'bj.placementHint',
                           'cl.usageBarTitle', 'cl.skelMain', 'cl.skelOptions', 'cl.skelNiche']) {
            const n = (I18N.match(new RegExp("'" + key.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.equal(n, 2, `${key} steht ${n}× in i18n.js, erwartet 2 (en + de)`);
        }
    });

    it('css/ds-share.css kommt ohne !important aus', () => {
        const withoutComments = SHARE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.equal((withoutComments.match(/!important/g) || []).length, 0);
    });

    it('css/ds-share.css schreibt keine rohe Schriftgröße in px', () => {
        const withoutComments = SHARE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        const raw = withoutComments.match(/font-size:\s*\d+px/g) || [];
        assert.deepEqual(raw, [], 'Schriftgrößen kommen aus den --fs-*-Tokens.');
    });
});

describe('ds-share: ein Turnier ist die Gruppe seiner Partien', () => {
    // Ein Journaleintrag ist EINE Partie. Wer die Bilanz aus einem
    // einzelnen Eintrag liest, bekommt 1-0-0 für ein Turnier mit acht
    // Runden. Der Sammler muss gruppieren — und genauso rechnen wie
    // shareTournamentSummary(), sonst zeigen die beiden Bilder desselben
    // Turniers verschiedene Bilanzen.
    it('nimmt die Gruppe, aus der die Kopfzeile gerechnet wurde', () => {
        // Bis zum 20.08.2026 filterte der Sammler nur nach dem Turniernamen
        // und ueber den UNGEFILTERTEN Bestand, waehrend die Kopfzeile daneben
        // aus der gefilterten Liste nach Meta UND Turniername gruppiert.
        // Gemessen: Kopfzeile 2-1-1 (50 %), Bild 2-3-1 (33 %).
        assert.match(SHARE, /window\._bjGetGroup\(tournamentName, o0\.metaKey\)/);
        assert.match(JOURNAL, /window\._bjGetGroup = journalGruppe/);
        assert.match(JOURNAL, /function journalGruppe\(tournamentName, metaKey\)/);
        assert.match(SHARE, /\(a\.createdAtMs \|\| 0\) - \(b\.createdAtMs \|\| 0\)/);
    });

    it('rechnet dieselbe Win Rate wie das Journal — keine vierte Konvention', () => {
        // Hier stand (S + U/2)/Partien, und dieser Test hat das ZERTIFIZIERT:
        // "zaehlt Unentschieden halb, wie die Siegquote ueberall sonst". Das
        // stimmte nicht. Das Journal rechnet durchgaengig S/(S+N+U), und die
        // Tier-Karte, aus der die Deck-Bildkarte ihre Zahl zieht, ebenfalls.
        // Bei 2-1-1 waren das 62,5 % im Bild gegen 50 % in der Zeile daneben.
        assert.match(SHARE, /winRate: scored \? \(w \/ scored\) \* 100 : NaN/);
        assert.doesNotMatch(SHARE, /\(w \+ t \/ 2\) \/ scored/);
        // Und die Fussnote nennt genau diese Konvention.
        assert.match(SHARE, /kurzHinweis\('mitUnentschieden'\)/);
    });

    it('sucht die Platzierung in der ganzen Gruppe, nicht im ersten Eintrag', () => {
        // Die Platzierung haengt am Turnier, gespeichert ist sie an jedem
        // Eintrag. Wer nur asc[0] fragt, verliert sie, sobald jemand nach
        // dem Eintragen noch einen Match nachtraegt.
        assert.match(SHARE, /asc\.find\(function \(e\) \{ return e\.placement; \}\)/);
    });

    it('das Journal schreibt die Platzierung auf alle drei Speicher', () => {
        // Outbox, Firestore und der Cache — faellt einer aus, zeigt die
        // Ansicht etwas anderes als das Bild.
        const writes = (JOURNAL.match(/placement: newPlacement|e\.placement = newPlacement/g) || []);
        assert.equal(writes.length, 3,
            'Erwartet drei Schreibstellen (Outbox, Firestore-Batch, Cache), gefunden ' + writes.length);
    });

    it('eine geleerte Platzierung loescht sie auch', () => {
        // newDeck wird nur geschrieben, wenn es gefuellt ist. Bei der
        // Platzierung waere das eine Falle: man bekaeme sie nie wieder weg.
        assert.ok(!/if \(newPlacement\)/.test(JOURNAL),
            'Die Platzierung wird bedingt geschrieben — dann laesst sie sich nicht mehr loeschen.');
    });

    it('liest die Runden aus dem Cache, nicht aus Firestore', () => {
        // Der Bildexport darf keinen Netzweg haben: er läuft auch offline,
        // und das Journal ist ausdrücklich ein Offline-Journal.
        //
        // Gescannt wird der Code OHNE Kommentare. Vorher schlug diese
        // Zusicherung an, weil ein Kommentar auf js/firebase-collection.js
        // verwies — ein Dateiname in Prosa ist kein Netzweg. Die Prüfung
        // ist trotzdem richtig, sie las nur die falsche Textmenge.
        assert.match(SHARE, /window\._bjGetCache/);
        assert.ok(!/firebase|firestore/i.test(ohneKommentar(SHARE)),
            'ds-share.js greift auf Firestore zu — das Journal ist offline-first.');
    });
});
