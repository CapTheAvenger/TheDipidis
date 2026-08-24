/**
 * Das Turnierposter, 1080 × 1350 — und die eingefrorene Deckliste, ohne
 * die es kein Kartengitter gäbe.
 *
 * Wunsch des Betreibers: "wenn man sein Deck eingefügt hat, dass man das
 * dann so ähnlich erstellt wie in dem Beispiel. Irgendwas was man dann
 * auch geil bei Instagram posten kann … man sieht was man selbst
 * gespielt hat, was die Gegner gespielt haben und wo gegen gewonnen oder
 * verloren, ob BO1 oder BO3."
 *
 * Der Review hat drei Dinge herausgearbeitet, die hier festgehalten
 * werden, weil man sie beim nächsten Anfassen am ehesten wieder verliert:
 *
 *  1. **Ein Zeiger auf ein gespeichertes Deck reicht nicht.** saveDeck()
 *     schreibt set() ohne Version auf dieselbe Doc-ID — nach dem nächsten
 *     Kartentausch zeigte das Bild von Sonntag eine Liste, die nie
 *     gespielt wurde. Deshalb eine Kopie im Turniereintrag.
 *  2. **Kein fester Deckel auf die Kartenzahl.** Gemessen an 1.058
 *     echten Listen aus data/tournament_decklists_per_player.csv: Median
 *     25 verschiedene Karten, Maximum 36. Ein Deckel bei 24 schneidet
 *     genau die Einzelkarten ab, über die unter einem Post geredet wird.
 *  3. **Kein rotes X auf besiegten Gegnern.** Zweideutig, und Grün/Rot
 *     ist die häufigste Farbsehschwäche — css/tokens.css nennt das
 *     ausdrücklich. Ring plus Zeichen sagt dasselbe eindeutig.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** Objekte aus der Sandkiste haben einen anderen Object.prototype, also
 *  schlaegt deepStrictEqual auf "same structure but not reference-equal"
 *  an. Hier wird nur der Inhalt verglichen. */
const alsEinfach = o => JSON.parse(JSON.stringify(o));

const ROOT = path.join(__dirname, '..', '..');
const SHARE = fs.readFileSync(path.join(ROOT, 'js', 'ds-share.js'), 'utf8');
const JOURNAL = fs.readFileSync(path.join(ROOT, 'js', 'battle-journal.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const CSS = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))
    .join('\n');

/** Kommentare raus, bevor eine Zusicherung nach Code sucht. */
const ohneKommentar = src => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

/* ── ds-share.js in einer Sandkiste laden ───────────────────────────
 * Die Datei braucht window und document.createElement. Sie ruft beides
 * erst innerhalb ihrer Funktionen auf, ein Minimalgerüst reicht also.
 * So werden die Rechenteile ECHT ausgeführt statt per Regex begutachtet. */
function ladeShare(stubs) {
    const sandbox = {
        console, Math, JSON, Date, Intl, Number, String, Object, Array, isFinite, parseInt, parseFloat,
        setTimeout, clearTimeout, Promise, URL, encodeURIComponent,
        document: {
            documentElement: { lang: 'de' },
            createElement: () => ({ width: 0, height: 0, getContext: () => null }),
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => []
        },
        location: { href: 'https://thedipidis.app/', origin: 'https://thedipidis.app' },
        navigator: { language: 'de-DE' }
    };
    sandbox.window = sandbox;
    Object.assign(sandbox, stubs || {});
    vm.createContext(sandbox);
    vm.runInContext(SHARE, sandbox);
    return sandbox.DsShare._internals;
}

// ── 1. Kartenschlüssel ──────────────────────────────────────────────

describe('Turnierbild: der Kartenschlüssel wird zerlegt', () => {
    const I = ladeShare();

    it('trennt Name, Set und Nummer', () => {
        assert.deepEqual(alsEinfach(I.parseKartenSchluessel('Ultra Ball (SVI 196)')),
            { name: 'Ultra Ball', set: 'SVI', number: '196' });
    });

    it('kommt mit Klammern im Kartennamen zurecht', () => {
        // "Technical Machine: Evolution" hat keinen, aber Promo-Namen
        // schon. Der letzte Klammerausdruck ist der Druck.
        assert.deepEqual(alsEinfach(I.parseKartenSchluessel("Boss's Orders (PAL 172)")),
            { name: "Boss's Orders", set: 'PAL', number: '172' });
    });

    it('ein Schlüssel ohne Druckangabe fällt nicht aus der Liste', () => {
        // Lieber eine Karte ohne Bild als eine Liste mit 58 Karten.
        const r = I.parseKartenSchluessel('Irgendeine Karte');
        assert.equal(r.name, 'Irgendeine Karte');
        assert.equal(r.set, '');
    });
});

// ── 2. Das Gitter ───────────────────────────────────────────────────

describe('Turnierbild: das Kartengitter rechnet, statt zu raten', () => {
    const I = ladeShare();

    it('bleibt in der vorgegebenen Höhe', () => {
        const m = I.gitterMasse(28, 952, 600);
        assert.ok(m, 'für 28 Karten auf 952 × 600 wurde nichts gefunden');
        const hoehe = m.zeilen * m.kh + (m.zeilen - 1) * m.gap;
        assert.ok(hoehe <= 600, `Gitter ist ${hoehe} px hoch, erlaubt sind 600`);
        const breite = m.spalten * m.kb + (m.spalten - 1) * m.gap;
        assert.ok(breite <= 952, `Gitter ist ${breite} px breit, erlaubt sind 952`);
    });

    it('zeigt ALLE Karten, nicht die ersten 24', () => {
        const m = I.gitterMasse(36, 952, 600);   // das gemessene Maximum
        assert.ok(m, 'für die längste reale Liste passt kein Gitter');
        assert.ok(m.spalten * m.zeilen >= 36,
            `Platz für ${m.spalten * m.zeilen} von 36 Karten`);
    });

    it('nimmt die grösseren Kacheln, wenn beide passen', () => {
        // Wenige Karten sollen gross sein. Mehr Spalten waeren auch
        // erlaubt, sind aber die schlechtere Antwort.
        const wenig = I.gitterMasse(12, 952, 900);
        const viel = I.gitterMasse(34, 952, 900);
        assert.ok(wenig.kb > viel.kb,
            `12 Karten bekommen ${wenig.kb} px, 34 Karten ${viel.kb} px`);
    });

    it('behält das Kartenformat bei', () => {
        const m = I.gitterMasse(20, 952, 700);
        const verhaeltnis = m.kh / m.kb;
        assert.ok(Math.abs(verhaeltnis - 342 / 245) < 0.02,
            `Seitenverhältnis ${verhaeltnis.toFixed(3)} statt ${(342 / 245).toFixed(3)}`);
    });

    it('sagt ehrlich nein, wenn nichts passt', () => {
        // Kein Notgitter mit 4-px-Kacheln: dann malt der Aufrufer lieber
        // gar keins.
        assert.equal(I.gitterMasse(60, 952, 60), null);
    });
});

// ── 3. Die Liste aus dem Schnappschuss ──────────────────────────────

describe('Turnierbild: die Liste kommt sortiert aus dem Schnappschuss', () => {
    function mitDeckdaten() {
        return ladeShare({
            _mbShared: {
                findCardImage: () => 'https://cdn.example/bild.png',
                findCardRecord: (name) => ({
                    type: /Energy$/.test(name) ? 'Basic Energy'
                        : /Ball|Candy/.test(name) ? 'Item'
                        : /Iono|Arven/.test(name) ? 'Supporter' : 'Fire'
                }),
                getMetaBinderTypeMeta: (c) => {
                    const t = String(c.type || '').toLowerCase();
                    if (t.includes('supporter')) return { supertype: 'Trainer', type: 'Supporter' };
                    if (t.includes('item')) return { supertype: 'Trainer', type: 'Item' };
                    if (t.includes('basic energy')) return { supertype: 'Energy', type: 'Basic Energy' };
                    return { supertype: 'Pokemon', type: 'Pokemon-Fire' };
                },
                getMetaBinderSortCategory: (m) => m.supertype === 'Pokemon' ? 'Pokemon' : m.type
            }
        });
    }

    const snap = {
        cards: {
            'Basic Fire Energy (SVE 10)': 6,
            'Ultra Ball (SVI 196)': 4,
            'Iono (PAL 185)': 3,
            'Charizard ex (OBF 125)': 2,
            'Arven (OBF 186)': 4
        },
        cardCount: 60
    };

    it('sortiert wie eine Deckliste: Pokémon, Unterstützer, Item, Energie', () => {
        const I = mitDeckdaten();
        const namen = I.schnappschussKarten(snap).map(k => k.name);
        assert.equal(namen[0], 'Charizard ex', 'die Pokémon stehen nicht oben');
        assert.equal(namen[namen.length - 1], 'Basic Fire Energy',
            'die Energie steht nicht unten');
        assert.ok(namen.indexOf('Arven') < namen.indexOf('Ultra Ball'),
            'Unterstützer stehen nicht vor den Items');
    });

    it('sortiert innerhalb der Art nach Anzahl', () => {
        const I = mitDeckdaten();
        const u = I.schnappschussKarten(snap).filter(k => /Arven|Iono/.test(k.name));
        assert.deepEqual(alsEinfach(u.map(k => k.anzahl)), [4, 3],
            'die häufigere Karte steht nicht vorn');
    });

    it('trägt die Bild-URL je Karte', () => {
        const I = mitDeckdaten();
        assert.ok(I.schnappschussKarten(snap).every(k => k.url),
            'mindestens eine Karte hat keine Bildquelle');
    });

    it('ohne Schnappschuss kommt eine leere Liste, kein Fehler', () => {
        const I = mitDeckdaten();
        assert.equal(I.schnappschussKarten(null).length, 0);
        assert.equal(I.schnappschussKarten({}).length, 0);
    });

    it('überlebt eine fehlende Kartendatenbank', () => {
        // Auf einem frisch geladenen Tab ist _mbShared noch nicht da.
        // Dann gibt es eben kein Bild — aber die Liste steht.
        const I = ladeShare();
        const liste = I.schnappschussKarten(snap);
        assert.equal(liste.length, 5);
        assert.ok(liste.every(k => k.url === ''));
    });
});

// ── 4. Der Spec trägt, was das Bild braucht ─────────────────────────

describe('Turnierbild: collectTournamentSpec liefert BO-Art und Schnappschuss', () => {
    const code = ohneKommentar(SHARE);

    it('jede Runde sagt BO1 oder BO3', () => {
        // Vorher stand die Angabe nur indirekt drin: als gefüllte
        // Spieleliste. Ein BO3 ohne eingetragene Einzelspiele sah damit
        // aus wie ein BO1 — und der Betreiber nennt die Angabe
        // ausdrücklich als das, was er sehen will.
        assert.match(code, /bestOf: e\.bestOf === 'bo3' \? 'bo3' : 'bo1'/);
    });

    it('der Schnappschuss wird in der GRUPPE gesucht, nicht bei asc[0]', () => {
        // Ein nachgetragener Match trägt ihn nicht. Dieselbe Falle wie
        // bei der Platzierung, die deshalb schon so gelöst ist.
        const stelle = code.indexOf('deckSnapshot:');
        assert.ok(stelle > 0, 'der Spec trägt keinen Schnappschuss');
        const block = code.slice(stelle, stelle + 260);
        assert.match(block, /asc\.find\(/, 'es wird nicht die Gruppe durchsucht');
        assert.ok(!/asc\[0\]\.deckSnapshot/.test(code),
            'der Schnappschuss wird wieder beim ersten Eintrag geholt');
    });
});

// ── 5. Das eingefrorene Deck im Journal ─────────────────────────────

describe('Battle Journal: die gespielte Liste wird eingefroren', () => {
    const code = ohneKommentar(JOURNAL);

    it('die Kopie trägt Karten, Summe und Zeitpunkt', () => {
        const m = JOURNAL.match(/function bjBaueSchnappschuss\(deckId\) \{[\s\S]*?\n    \}/);
        assert.ok(m, 'bjBaueSchnappschuss fehlt');
        ['cards:', 'cardCount:', 'frozenAtMs:', 'deckId:'].forEach(feld => {
            assert.ok(m[0].includes(feld), `dem Schnappschuss fehlt ${feld}`);
        });
    });

    it('Karten mit Anzahl 0 kommen nicht mit', () => {
        const m = JOURNAL.match(/function bjBaueSchnappschuss\(deckId\) \{[\s\S]*?\n    \}/);
        assert.match(m[0], /if \(n > 0\)/,
            'eine auf 0 gesetzte Karte landet als Kachel auf dem Bild');
    });

    it('der Schnappschuss wird in der Turniergruppe gesucht', () => {
        assert.match(code, /function bjFindeSchnappschuss\(entries\)/);
        const m = JOURNAL.match(/function bjFindeSchnappschuss\(entries\) \{[\s\S]*?\n    \}/);
        assert.match(m[0], /\.find\(/, 'es wird nicht die ganze Gruppe durchsucht');
    });

    it('eine leere Auswahl löst die Verknüpfung, statt sie stehen zu lassen', () => {
        // Drei Fälle, und sie sind nicht dasselbe: nichts gewählt und nie
        // etwas verknüpft -> nicht schreiben; nichts gewählt, aber es gab
        // einen -> auf null setzen. Ohne diesen Unterschied bekäme man die
        // alte Liste nie wieder los.
        assert.match(code, /let neuerSchnapp;/);
        assert.match(code, /} else if \(alterSchnapp\) \{\s*neuerSchnapp = null;/);
        assert.match(code, /const schnappFeld = \(neuerSchnapp === undefined\) \? \{\} : \{ deckSnapshot: neuerSchnapp \}/);
    });

    it('geschrieben wird an allen drei Orten: Outbox, Firestore, Cache', () => {
        const treffer = code.match(/if \(neuerSchnapp !== undefined\) e\.deckSnapshot = neuerSchnapp;/g) || [];
        assert.equal(treffer.length, 2, 'Outbox und Cache werden nicht beide bedient');
        assert.match(code, /\.\.\.schnappFeld,/, 'Firestore bekommt den Schnappschuss nicht');
    });

    it('das Auswahlfeld steht im Turnierdialog', () => {
        assert.match(HTML, /id="bjEditTournSnapshot"/);
        assert.match(HTML, /id="bjEditTournSnapshotState"/);
    });

    it('ohne gespeichertes Deck steht dort ein Satz, kein leeres Feld', () => {
        // Der häufigste Fall beim Gelegenheitsspieler. Ein leeres
        // Auswahlfeld sieht nach einem Fehler aus.
        assert.match(code, /bj\.snapshotNoDecks/);
        assert.match(I18N, /'bj\.snapshotNoDecks':\s*'[^']*gespeichert/);
    });
});

// ── 6. Die Turnierzeile ─────────────────────────────────────────────

describe('Battle Journal: die Turnierzeile hat drei Ziele statt fünf', () => {
    const code = ohneKommentar(JOURNAL);
    const zeile = code.slice(code.indexOf('class="bj-tournament-header"'),
                             code.indexOf('class="bj-tournament-header"') + 3000);

    it('der Bild-Knopf ruft das Hochformat auf', () => {
        assert.match(zeile, /shareTournamentPost\(/);
    });

    it('die alten Teilen-Knöpfe stehen nicht mehr in der Zeile', () => {
        const bisMenue = zeile.slice(0, zeile.indexOf('bj-tournament-menu'));
        assert.ok(!/shareTournamentSummary\(/.test(bisMenue),
            'die Textbilder stehen wieder direkt in der Zeile');
        assert.ok(!/bj-tournament-edit-btn/.test(bisMenue),
            'Edit steht wieder direkt in der Zeile');
    });

    it('sie sind unter den drei Punkten erreichbar', () => {
        const menue = zeile.slice(zeile.indexOf('bj-tournament-menu'));
        ['openEditTournamentModal(', 'shareTournamentCard(',
         "shareTournamentSummary('", 'shareTournamentSummary('].forEach(fn => {
            assert.ok(menue.includes(fn), `${fn} fehlt im Menü`);
        });
    });

    it('das Menü schliesst sich, bevor die Aktion läuft', () => {
        // Sonst liegt es über dem Bild, das gerade aufgeht.
        const m = JOURNAL.match(/function bjMenuAction\(btn, fn\) \{[\s\S]*?\n    \}/);
        assert.ok(m, 'bjMenuAction fehlt');
        assert.ok(m[0].indexOf('bjSchliesseAlleMenues') < m[0].indexOf('fn()'),
            'die Aktion läuft, bevor das Menü zugeht');
    });

    it('ein Klick daneben schliesst das Menü', () => {
        assert.match(code, /document\.addEventListener\('click'/);
        assert.match(code, /closest\('\.bj-tournament-more'\)/);
    });

    it('für diese Zeile gibt es endlich eine Mobilregel', () => {
        // Vorher: keine einzige @media-Regel für irgendeinen
        // .bj-tournament-*-Selektor in allen 33 CSS-Dateien. Fünf Knöpfe
        // liessen dem Turniernamen bei 390 px rund 44 px.
        const mobil = CSS.match(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\n\}/g) || [];
        assert.ok(mobil.some(b => b.includes('.bj-tournament-header')),
            'die Turnierzeile hat weiterhin keine Mobilregel');
        assert.ok(mobil.some(b => /\.bj-tournament-header\s*\{[^}]*flex-wrap:\s*wrap/.test(b)),
            'die Zeile bricht auf dem Telefon nicht um');
    });

    it('die Knöpfe sind auf dem Telefon gross genug zum Treffen', () => {
        const mobil = CSS.match(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\n\}/g) || [];
        const block = mobil.find(b => b.includes('.bj-tournament-share-btn'));
        assert.ok(block, 'für die Knöpfe gibt es keine Mobilregel');
        assert.match(block, /min-height:\s*(4[0-9]|[5-9][0-9])px/,
            'die Knöpfe bleiben unter 40 px hoch');
    });
});

// ── 7. Was NICHT vom Vorbild übernommen wurde ───────────────────────

describe('Turnierbild: die Entscheidungen gegen die Vorlage', () => {
    const code = ohneKommentar(SHARE);
    const poster = code.slice(code.indexOf('function postCardCanvas'),
                              code.indexOf('function sharePostCard'));

    it('der Ausgang steht in der divergierenden Skala, nicht in Grün/Rot', () => {
        assert.match(poster, /C\.dvPos/);
        assert.match(poster, /C\.dvNeg/);
        assert.ok(!/#2ecc71|#27ae60|'green'|'red'/.test(poster),
            'irgendwo ist Grün oder Rot zurückgekommen');
    });

    it('Farbe allein entscheidet nicht — es gibt ein Zeichen dazu', () => {
        assert.match(poster, /L\('S', 'W'\)/, 'das Siegzeichen fehlt');
        assert.match(poster, /L\('N', 'L'\)/, 'das Niederlagenzeichen fehlt');
    });

    it('das Anzahl-Zeichen ist nicht rot', () => {
        // Rot heisst auf diesem Bild "Niederlage". Ein rotes 4 an einer
        // Karte hiesse dann etwas anderes als dasselbe Rot am Gegner.
        const badge = poster.slice(poster.indexOf('var br = Math.max'));
        assert.match(badge, /ctx\.fillStyle = C\.brand;/,
            'das Anzahl-Zeichen benutzt nicht die Markenfarbe');
    });

    it('eine fehlende Karte wird zur getönten Platte, nie zum Loch', () => {
        assert.match(poster, /ctx\.fillStyle = C\.surface2;/);
        assert.ok(!/ctx\.fillStyle = '#fff'/.test(poster),
            'ein weisses Rechteck sieht aus wie ein Fehler');
    });

    it('ohne Platzierung entsteht kein leerer Goldkasten', () => {
        // Der Betreiber postet auch ein 4-3. Ein leeres Feld mit
        // Goldrahmen sieht aus, als fehle etwas.
        assert.match(poster, /if \(spec\.place\) \{\s*spalten\.push/);
    });

    it('bei vielen Runden schrumpfen die Kreise, statt Runden wegzulassen', () => {
        // Ein Bild, das die Hälfte der Runden verschweigt, ist eine
        // falsche Auskunft — kein Platzproblem.
        assert.match(poster, /while \(proReihe > 0 && proReihe \* d/);
        // Nicht nach "rounds.slice(" suchen: die naheliegende Kuerzung
        // schreibt sich "(spec.rounds || []).slice(0, 9)" und waere daran
        // vorbeigelaufen. Im Poster hat KEIN slice(0, etwas zu suchen.
        assert.ok(!/\.slice\(0,/.test(poster),
            'irgendetwas im Poster wird wieder abgeschnitten');
        assert.match(poster, /for \(var r = 0; r < rounds\.length; r\+\+\)/,
            'die Rundenschleife laeuft nicht mehr ueber alle Runden');
    });

    it('das Bild ist 1080 × 1350 — Instagram schneidet mehr Höhe ab', () => {
        assert.match(code, /var PC = \{ W: 1080, H: 1350/);
    });
});
