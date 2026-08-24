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
                             code.indexOf('class="bj-tournament-header"') + 4200);

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
        // Seit dem 24.08. W/L/T statt S/N/U — der Betreiber hat die
        // internationalen Kuerzel ausdruecklich gewollt.
        assert.match(poster, /m\.result === 'win' \? 'W'/, 'das Siegzeichen fehlt');
        assert.match(poster, /m\.result === 'loss' \? 'L' : 'T'/, 'das Niederlagenzeichen fehlt');
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

// ── 8. Die Verknüpfung muss man finden können ───────────────────────

describe('Battle Journal: der Deckname verknüpft die Liste von selbst', () => {
    const code = ohneKommentar(JOURNAL);

    it('ein eingetragener Deckname friert die gleichnamige Liste ein', () => {
        // Gemeldet am 24.08.: "ich hatte extra mein eigenes Deck ausgewählt
        // und trotzdem wurde es da nicht angezeigt". Er hatte im Formular
        // "Mega Excadrill V1" gewählt — den Namen einer gespeicherten
        // Liste. Die Verknüpfung lag aber nur im Turnierdialog.
        assert.match(code, /function bjSchnappschussNachName\(deckName\)/);
        assert.match(code, /const schnapp = bjSchnappschussNachName\(values\.ownDeck\);/,
            'beim Loggen wird der Deckname nicht mehr ausgewertet');
    });

    it('bei zwei gleichnamigen Listen wird nicht geraten', () => {
        // Lieber kein Gitter als das falsche.
        const m = JOURNAL.match(/function bjSchnappschussNachName\(deckName\) \{[\s\S]*?\n    \}/);
        assert.match(m[0], /treffer\.length !== 1/,
            'bei mehreren Treffern wird trotzdem einer genommen');
    });

    it('ohne Treffer wird das Feld weggelassen, nicht auf null gesetzt', () => {
        // Ein deckSnapshot: null auf jedem Eintrag wäre eine Verknüpfung,
        // die es zu lösen gäbe — es gab aber nie eine.
        assert.match(code, /return schnapp \? \{ deckSnapshot: schnapp \} : \{\};/);
    });

    it('der Dialog schlägt die gleichnamige Liste vor', () => {
        assert.match(code, /const nachName = !vorhanden/,
            'ohne Verknüpfung wird nichts vorgeschlagen');
        assert.match(code, /bj\.snapshotSuggest/,
            'der Vorschlag wird nicht beschriftet');
        assert.match(I18N, /'bj\.snapshotSuggest':\s*'[^']*\{deck\}/,
            'der Vorschlagstext nennt den Decknamen nicht');
    });

    it('das Schema zählt hoch und wird nirgends wieder gesenkt', () => {
        // Ein Eintrag mit deckSnapshot traegt Fassung 7. Wer beim
        // Bearbeiten eine 6 zurueckschreibt, macht ihn aelter, als er ist.
        const stempel = [...code.matchAll(/schemaVersion:\s*(\d+)/g)].map(m => Number(m[1]));
        assert.ok(stempel.length >= 2, 'es wird nirgends mehr ein Schema gestempelt');
        stempel.forEach(v => assert.ok(v >= 7, `irgendwo wird noch Fassung ${v} geschrieben`));
    });
});

describe('Turnierbild: der Hinweis nennt den Weg, nicht nur das Ziel', () => {
    it('der Toast sagt, wo die Verknüpfung sitzt', () => {
        // "Verknüpfe im Turnierdialog die Liste" hat der Betreiber nicht
        // auf das ⋯-Menü abgebildet. Jetzt steht der Klickpfad da.
        const code = ohneKommentar(SHARE);
        assert.match(code, /⋯ → Turnier bearbeiten/,
            'der Hinweis nennt den Klickpfad nicht');
    });
});

// ── 9. Matchpunkte und der Day-2-Marker ─────────────────────────────

describe('Turnierbild: die Matchpunkte', () => {
    const I = ladeShare();
    const r = (...ergebnisse) => ergebnisse.map((result, i) => ({ n: i + 1, result }));

    it('Sieg 3, Unentschieden 1, Niederlage 0', () => {
        assert.equal(I.matchPunkte(r('win')), 3);
        assert.equal(I.matchPunkte(r('tie')), 1);
        assert.equal(I.matchPunkte(r('loss')), 0);
    });

    it('5-2-1 ergibt 16 — genau die Day-2-Schwelle', () => {
        // Acht Runden an Tag 1. 5 × 3 + 1 × 1 = 16.
        const acht = r('win','win','win','win','win','loss','loss','tie');
        assert.equal(I.matchPunkte(acht), 16);
    });

    it('eine leere Runde zählt nichts, statt zu stolpern', () => {
        assert.equal(I.matchPunkte([{ n: 1, result: '' }]), 0);
        assert.equal(I.matchPunkte(null), 0);
    });
});

describe('Turnierbild: der Day-2-Marker', () => {
    const I = ladeShare();

    it('die Schwelle steht bei 16', () => {
        // Der Betreiber nannte 16, eine Quelle im Netz 19. Beide stimmen —
        // für verschiedene Formate: 19 galt für den alten Tag 1 mit neun
        // Runden (6-2-1), heute sind es acht und damit 16 (5-2-1).
        assert.equal(I.DAY2_PUNKTE, 16);
    });

    it('erscheint auf grossen Turnieren ab der Schwelle', () => {
        assert.equal(I.hatDay2({ type: 'Regional/SPE/IC' }, 16), true);
        assert.equal(I.hatDay2({ type: 'Regional/SPE/IC' }, 15), false);
        assert.equal(I.hatDay2({ type: 'Regional/SPE/IC' }, 24), true);
    });

    it('erscheint NICHT auf Turnieren ohne zweiten Tag', () => {
        // Ein Cup mit 18 Punkten hat trotzdem keinen Tag 2. Der Marker wäre
        // dort eine falsche Auskunft, kein harmloser Zusatz.
        ['Cup', 'Challenge', 'Online', 'Testing', ''].forEach(typ => {
            assert.equal(I.hatDay2({ type: typ }, 30), false, `${typ} bekommt einen Marker`);
        });
    });

    it('die Zahl ist dieselbe, mit der der Meta Call rechnet', () => {
        // Zwei Stellen, eine Zahl. Läuft das auseinander, sagt das Bild
        // etwas anderes als die Vorhersage daneben.
        const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');
        const m = MC.match(/regional:\s*\{[^}]*rounds:\s*(\d+)[^}]*day2Points:\s*(\d+)/);
        assert.ok(m, 'die Regional-Einstellung des Meta Calls ist nicht mehr auffindbar');
        assert.equal(Number(m[2]), I.DAY2_PUNKTE, 'Bild und Meta Call nennen verschiedene Schwellen');
        assert.equal(Number(m[1]), 8, 'Tag 1 hat acht Runden, nicht mehr neun');
    });

    it('kein Text verspricht mehr neun Runden', () => {
        assert.ok(!/8-9 Swiss/.test(I18N), 'die Beschreibung nennt noch 8-9 Runden');
        assert.match(I18N, /8 Swiss-Runden \+ Top-8-Cut/);
    });
});

describe('Turnierbild: W, L und T statt S, N und U', () => {
    const code = ohneKommentar(SHARE);

    it('die Zeichen im Bild sind die internationalen', () => {
        // Das Leerzeichen nach dem Komma ist NICHT verlaesslich: eine
        // Ruecknahme schreibt sich genauso gut als L('S','W'). Also
        // toleranter suchen, sonst laeuft die Zusicherung daran vorbei.
        assert.ok(!/L\(\s*'S'\s*,\s*'W'\s*\)/.test(code), "L('S','W') ist zurück — im Bild steht wieder S");
        assert.ok(!/L\(\s*'N'\s*,\s*'L'\s*\)/.test(code), "L('N','L') ist zurück");
        assert.ok(!/L\(\s*'U'\s*,\s*'T'\s*\)/.test(code), "L('U','T') ist zurück");
    });

    it('die Fusszeile unter der Bilanz sagt W · L · T', () => {
        assert.match(code, /fuss: 'W · L · T'/);
        assert.ok(!/'S · N · U'/.test(code), 'S · N · U steht wieder unter der Bilanz');
    });

    it('jede Runde zeigt ihre Punkte', () => {
        const poster = code.slice(code.indexOf('function postCardCanvas'),
                                  code.indexOf('function sharePostCard'));
        assert.match(poster, /ctx\.fillText\('\+' \+ rp/,
            'unter den Kreisen stehen keine Punkte');
    });
});

describe('Turnierbild: das Bild ohne Deckliste', () => {
    const code = ohneKommentar(SHARE);
    const J = ohneKommentar(JOURNAL);

    it('die Karten werden verworfen, wenn man sie nicht zeigen will', () => {
        // Wer während eines laufenden Turniers postet, will die Liste oft
        // nicht preisgeben.
        assert.match(code, /if \(o\.ohneDeckliste\) karten = \[\];/);
    });

    it('dann kommt auch kein Hinweis, die Liste zu verknüpfen', () => {
        // Der Hinweis wäre dort eine Belehrung: die Liste FEHLT nicht, sie
        // ist absichtlich weggelassen.
        assert.match(code, /toast\(karten\.length \|\| o\.ohneDeckliste/);
    });

    it('der Dateiname sagt, was fehlt', () => {
        assert.match(code, /_post_ohne_liste_/);
    });

    it('es gibt einen Menüeintrag dafür', () => {
        assert.match(J, /shareTournamentPost\('\$\{safeTournKey\}','\$\{safeMetaKey\}', true\)/);
        assert.match(I18N, /'bj\.imageNoList':\s*'Bild ohne Deckliste'/);
    });

    it('der normale Knopf zeigt die Liste weiterhin', () => {
        const zeile = J.slice(J.indexOf('bj-tournament-image-btn'),
                              J.indexOf('bj-tournament-image-btn') + 400);
        assert.ok(!/, true\)/.test(zeile), 'der Hauptknopf lässt die Liste jetzt weg');
    });
});

describe('Turnierbild: keine einzelne Kachel in der letzten Zeile', () => {
    const I = ladeShare();

    it('28 Karten enden nicht mit einer einzelnen Kachel', () => {
        const m = I.gitterMasse(28, 952, 600);
        assert.ok(m, 'für 28 Karten passt kein Gitter');
        assert.ok(m.letzteZeile >= 2,
            `die letzte Zeile hat ${m.letzteZeile} Kachel(n) — das liest sich wie ein Rest`);
    });

    it('dafür werden die Kacheln nicht beliebig klein', () => {
        // Die vollere Zeile darf höchstens 12 % Kachelbreite kosten.
        const m = I.gitterMasse(28, 952, 600);
        const bestMoeglich = Math.max(...[7, 8, 9, 10].map(sp => {
            const gap = sp >= 8 ? 8 : 10;
            const kb = Math.floor((952 - gap * (sp - 1)) / sp);
            const kh = Math.round(kb * 342 / 245);
            return Math.ceil(28 / sp) * kh + (Math.ceil(28 / sp) - 1) * gap <= 600 ? kb : 0;
        }));
        assert.ok(m.kb >= bestMoeglich * 0.88,
            `${m.kb} px statt bis zu ${bestMoeglich} px — zu viel Verlust für eine glatte Zeile`);
    });
});
