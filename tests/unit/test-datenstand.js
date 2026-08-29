/**
 * Das heutige Datum ist kein Datenstand.
 *
 * GEMESSEN am 20.08.2026: jeder Frische-Chip der Seite zeigte "Daten:
 * 20.8.2026" — den Tag des Besuchs. Der Wert kam aus
 *
 *     localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString('de-DE')
 *
 * und der linke Teil ist immer leer: 'lastScraperUpdate' wird nirgends im
 * Repo geschrieben. Fuenf Reiter, deren Daten bis zu 19 Tage auseinander
 * liegen, trugen dasselbe Datum — und zwar deins.
 *
 * Fuer den Head-Judge-Blick ist das der teuerste Mangel der Seite: ohne
 * Erhebungsdatum ist jede Zahl darunter als Beleg wertlos.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Kommentare abziehen: die Begruendungen ZITIEREN den alten, falschen Code —
   das sollen sie auch. Geprueft wird, was ausgefuehrt wird. */
const ohneKommentar = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

const MODUL = ohneKommentar(read('js/ds-datenstand.js'));
const INIT  = ohneKommentar(read('js/app-init.js'));
const HTML  = read('index.html');
const SW    = read('service-worker.js');

describe('Kein geratenes Datum mehr', () => {
    it('app-init.js setzt nicht mehr das heutige Datum in die Chips', () => {
        assert.doesNotMatch(INIT, /lastScraperUpdate/);
        assert.doesNotMatch(INIT, /js-data-freshness'\)\.forEach\(el => \{\s*el\.textContent = lastUpdate/);
    });

    it('niemand sonst liest den nie geschriebenen Schluessel als Datum', () => {
        // ds-nav.js und meta-analysis-hub.js lasen ihn ebenfalls; sie duerfen
        // daraus kein Datum ableiten, das es nicht gibt. Bis zum 21.08.2026
        // stand hier nur app-init.js in der Liste — der Kommentar nannte drei
        // Dateien, geprueft wurde eine.
        for (const datei of ['js/app-init.js', 'js/ds-nav.js', 'js/meta-analysis-hub.js']) {
            assert.doesNotMatch(ohneKommentar(read(datei)), /lastScraperUpdate/, datei);
        }
    });

    it('unbekannt heisst unbekannt', () => {
        assert.match(MODUL, /return de\(\) \? 'unbekannt' : 'unknown';/);
        // Und nirgends ein new Date() als Ersatzwert fuer einen Stand.
        assert.doesNotMatch(MODUL, /new Date\(\)\.toLocaleDateString/);
    });
});

describe('Der Antwortblock der Meta-Ansicht traegt einen echten Stand', () => {
    const HUB = read('js/meta-analysis-hub.js');

    it('nennt als Quelle genau die Datei, aus der er rechnet', () => {
        const gerechnet = /fetchAndParseCSV\(`\$\{base\}([a-z0-9_]+\.csv)/.exec(HUB);
        assert.ok(gerechnet, 'Datenquelle des Antwortblocks nicht gefunden');
        assert.match(HUB, new RegExp('data-quelle="' + gerechnet[1] + '"'),
            `Chip nennt nicht ${gerechnet[1]}`);
    });

    it('laesst den Chip nach dem Einhaengen fuellen', () => {
        // Ohne diesen Aufruf bleibt "unbekannt" stehen: zeichne() liest
        // data-quelle aus dem DOM, der HTML-String kennt es noch nicht.
        assert.match(ohneKommentar(HUB), /DsDatenstand\.zeichne\(h\)/);
    });
});

describe('Jeder Chip nennt den Stand SEINER Ansicht', () => {
    it('alle fuenf Chips tragen eine eigene Quelle', () => {
        const chips = [...HTML.matchAll(/class="js-data-freshness"([^>]*)>/g)].map(m => m[1]);
        assert.equal(chips.length, 5, `${chips.length} Chips gefunden`);
        for (const attr of chips) {
            assert.match(attr, /data-quelle="[a-z0-9_]+\.(csv|json)"/, attr);
        }
    });

    it('und zwar fuenf verschiedene', () => {
        // Der japanische Datenraum und das globale Meta werden von
        // verschiedenen Laeufen befuellt. Ein gemeinsames Datum waere wieder
        // dieselbe Luege, nur mit anderer Zahl.
        const quellen = [...HTML.matchAll(/js-data-freshness" data-quelle="([^"]+)"/g)].map(m => m[1]);
        assert.equal(quellen.length, 5);
        assert.equal(new Set(quellen).size, 5, 'doppelte Quelle: ' + quellen.join(', '));
        assert.ok(quellen.includes('limitless_online_decks.csv'));
        assert.ok(quellen.some(q => q.startsWith('city_league_')));
    });

    it('jede genannte Quelle liegt auch wirklich in data/', () => {
        const quellen = [...HTML.matchAll(/js-data-freshness" data-quelle="([^"]+)"/g)].map(m => m[1]);
        for (const q of quellen) {
            assert.ok(fs.existsSync(path.join(ROOT, 'data', q)), `data/${q} fehlt`);
        }
    });
});

describe('Wie der Stand ermittelt wird', () => {
    it('aus data/data_stand.json, nicht aus Last-Modified', () => {
        // GEMESSEN am 20.08.2026 gegen thedipidis.app: GitHub Pages setzt
        // Last-Modified auf die DEPLOY-Zeit — fuer alle Dateien dieselbe
        // (Thu, 20 Aug 2026 07:34) — und bei city_league_archetypes.csv und
        // city_league_analysis.csv gar keinen Kopf. Das haette das geratene
        // Datum nur durch ein anderes ersetzt.
        assert.match(MODUL, /data_stand\.json/);
        assert.doesNotMatch(MODUL, /method: 'HEAD'/);
        assert.doesNotMatch(MODUL, /Last-Modified/);
    });

    it('und einmal geladen, nicht einmal je Chip', () => {
        assert.match(MODUL, /if \(MANIFEST\) return MANIFEST;/);
    });

    it('ein fehlender Eintrag ergibt null, nie ein Ersatzdatum', () => {
        assert.match(MODUL, /if \(!iso\) return null;/);
        /* 29.08.2026: der Rueckfallwert hiess frueher schlicht `{}`. Seit das
           Manifest ZWEI Ebenen fuehrt (Dateidatum und Inhaltsdatum), ist es
           `{ dateien: {}, inhalt: {} }`. Die Absicht ist unveraendert und
           bleibt das, was hier geprueft wird: schlaegt der Abruf fehl, gibt
           es LEERE Verzeichnisse — keinen Ersatzwert, kein heutiges Datum.
           Geprueft wird deshalb die Eigenschaft, nicht der Wortlaut. */
        const rueckfall = (MODUL.match(/\.catch\(function \(\) \{ return ([^;]+); \}\)/) || [])[1];
        assert.ok(rueckfall, 'kein Rueckfallwert gefunden');
        /* Enger fassen als /Date/i: das Wort "dateien" enthaelt "date",
           und die erste Fassung dieser Zusage ist genau darueber
           gestolpert. Gesucht ist ein erzeugtes Datum, nicht der
           Buchstabenfolge wegen. */
        assert.doesNotMatch(rueckfall, /new Date|Date\.now|toLocaleDateString|today|heute/i,
            'der Rueckfall darf niemals ein Datum erfinden: ' + rueckfall);
        assert.match(rueckfall, /\{\s*\}|\{[^}]*:\s*\{\s*\}/,
            'der Rueckfall muss leer sein: ' + rueckfall);
    });

    it('alte Staende werden markiert, statt still durchzugehen', () => {
        assert.match(MODUL, /classList\.toggle\('is-alt', tage !== null && tage > 14\)/);
    });
});

describe('Woher der Stand kommt', () => {
    const STAND = JSON.parse(read('data/data_stand.json'));
    const SKRIPT = read('scripts/build_data_stand.py');
    const WOCHE = read('.github/workflows/weekly-full-update.yml');

    it('die Datei liegt vor und nennt ihre Herkunft', () => {
        assert.ok(STAND.dateien && Object.keys(STAND.dateien).length >= 10);
        assert.ok(STAND.quelle);
        assert.ok(STAND.erzeugt_am);
    });

    it('jeder Eintrag ist ein gueltiges Datum und keine Zukunft', () => {
        const jetzt = Date.now();
        for (const [f, iso] of Object.entries(STAND.dateien)) {
            const d = new Date(iso);
            assert.ok(!isNaN(d.getTime()), `${f}: ${iso} ist kein Datum`);
            assert.ok(d.getTime() <= jetzt + 86400000, `${f}: liegt in der Zukunft`);
        }
    });

    it('und die Staende sind wirklich verschieden — das war der ganze Punkt', () => {
        // Vorher trugen fuenf Reiter dasselbe Datum. Waeren hier alle Werte
        // gleich, waere nichts gewonnen.
        const werte = new Set(Object.values(STAND.dateien).map(x => x.slice(0, 10)));
        assert.ok(werte.size >= 3, 'nur ' + werte.size + ' verschiedene Staende');
    });

    it('jede Quelle der Chips steht im Verzeichnis', () => {
        const quellen = [...HTML.matchAll(/js-data-freshness" data-quelle="([^"]+)"/g)].map(m => m[1]);
        for (const q of quellen) {
            assert.ok(STAND.dateien[q], `kein Stand fuer ${q} in data_stand.json`);
        }
    });

    it('fortgeschrieben wird im Wochenlauf, vor dem Commit', () => {
        // Danach meldet git status nichts mehr — die Information waere weg.
        const iSkript = WOCHE.indexOf('build_data_stand.py');
        const iCommit = WOCHE.indexOf('name: Commit + push');
        assert.ok(iSkript > -1, 'der Schritt fehlt im Wochenlauf');
        assert.ok(iSkript < iCommit, 'muss VOR dem Commit laufen');
    });

    it('das Skript braucht keine tiefe Historie', () => {
        // .git ist 620 MB bei 2.962 Commits; ein tiefer Clone bei jedem Lauf
        // waere ein hoher Preis fuer ein Datum. Der Normalpfad kommt mit
        // `git status` aus, der Verlauf nur fuer den Erstbestand.
        assert.match(SKRIPT, /_git\("status", "--porcelain"/);
        assert.match(SKRIPT, /aus_git_flag/);
    });
});

describe('Einbau', () => {
    it('das Modul wird geladen, und vor app-init.js', () => {
        const iMod = HTML.indexOf('js/ds-datenstand.js');
        const iInit = HTML.indexOf('js/app-init.js');
        assert.ok(iMod > -1, 'ds-datenstand.js ist nicht eingebunden');
        assert.ok(iMod < iInit, 'muss vor app-init.js stehen — das liest window.DsDatenstand');
    });

    it('und steht im Offline-Vorrat', () => {
        assert.match(SW, /'\.\/js\/ds-datenstand\.js'/);
    });
});

describe('Dateidatum ist nicht Inhaltsdatum', () => {
    /* GEMESSEN am 29.08.2026: labs_tournament_decks.csv wurde am 25.08. neu
       geschrieben, das juengste Turnier darin ist vom 12.06. — 74 Tage
       Abstand. Der Betreiber hat bestaetigt: Sommerpause, die Daten stimmen.

       KEINE UEBERTREIBUNG: heute zeigt kein Chip diese Datei an, und der
       Meta Call nennt das Turnieralter selbst richtig. Es war also kein
       sichtbarer Fehler, sondern eine offene Flanke — dieselbe wie damals,
       nur eine Ebene tiefer: erst das Datum des BESUCHS statt des Standes,
       jetzt das Datum der DATEI statt des Inhalts. Diese Zusagen halten
       die Flanke zu, bevor ein Chip darauf zeigt. */
    const BAU = read('scripts/build_data_stand.py');
    const MOD = ohneKommentar(read('js/ds-datenstand.js'));

    it('der Erzeuger liest das juengste Datum aus dem Inhalt', () => {
        assert.match(BAU, /INHALT_BIS\s*=\s*\{/,
            'ohne diese Liste weiss niemand, welche Datei ein eigenes Datum fuehrt');
        assert.match(BAU, /"labs_tournament_decks\.csv":\s*"tournament_date"/,
            'die Turnierdatei ist der Fall, an dem es aufgefallen ist');
        assert.match(BAU, /"inhalt_bis":\s*inhalt/,
            'das Ergebnis muss auch in der Datei landen');
    });

    it('das Manifest traegt beide Ebenen', () => {
        const stand = JSON.parse(read('data/data_stand.json'));
        assert.ok(stand.dateien, 'dateien fehlt');
        assert.ok(stand.inhalt_bis, 'inhalt_bis fehlt — der Erzeuger lief nicht');
    });

    it('der Chip zieht den Inhalt vor, wenn er spuerbar aelter ist', () => {
        assert.match(MOD, /function inhaltStand\(/, 'inhaltStand fehlt');
        assert.match(MOD, /ABSTAND_TAGE/,
            'ohne Schwelle flackert der Chip bei einem Tag Unterschied');
        /* Die erste Fassung prueft nur, ob der Bezeichner vorkommt — sie
           blieb gruen, als ich `zeigeInhalt = false` setzte. Geprueft
           gehoert die ENTSCHEIDUNG: der Abstand muss gegen die Schwelle
           gehalten werden, und das Ergebnis muss die Anzeige waehlen. */
        assert.match(MOD, /zeigeInhalt\s*=\s*dInhalt\s*&&\s*abstand\s*>\s*ABSTAND_TAGE/,
            'zeigeInhalt muss aus dem Abstand entstehen, nicht gesetzt sein');
        assert.match(MOD, /var d\s*=\s*zeigeInhalt\s*\?\s*dInhalt\s*:\s*dDatei/,
            'die Entscheidung muss auch waehlen, was angezeigt wird');
        assert.match(MOD, /abstand\s*=\s*\(dDatei\s*&&\s*dInhalt\)/,
            'der Abstand muss aus beiden Daten gerechnet werden');
    });

    it('der Tooltip nennt weiter BEIDE Daten', () => {
        /* Der Inhalt beantwortet "wie aktuell sind die Zahlen", die
           Dateiaenderung beantwortet "wann wurde zuletzt nachgesehen".
           Wer die zweite Angabe streicht, macht aus einer Sommerpause
           einen Ausfall. */
        assert.match(MOD, /Juengster Eintrag in/, 'Inhaltsdatum fehlt im Tooltip');
        assert.match(MOD, /Zuletzt nachgesehen am/, 'Dateidatum fehlt im Tooltip');
        assert.match(MOD, /newest entry in/, 'englische Fassung fehlt');
        assert.match(MOD, /Last checked/, 'englische Fassung unvollstaendig');
    });

    it('ohne Inhaltsdatum bleibt es beim Dateidatum', () => {
        // Kein Ersatzwert, keine Schaetzung — dieselbe Regel wie oben.
        assert.match(MOD, /var iso = m\.inhalt && m\.inhalt\[datei\];\s*\n\s*if \(!iso\) return null;/,
            'fehlt der Eintrag, muss inhaltStand null liefern');
    });
});

describe('ace_specs.json ist in sich stimmig', () => {
    /* GEMESSEN am 29.08.2026: total_count sagte 53, es waren aber nur 39
       eindeutige Namen — sieben standen doppelt drin. Fuer die Anwendung
       folgenlos (die Liste wird als Menge benutzt), aber die Zahl im
       eigenen Metafeld war falsch, und genau diese Zahl wuerde man
       heranziehen, um zu pruefen, ob die Liste vollstaendig ist.

       NICHT geprueft und weiterhin offen: ob die Liste vollstaendig IST.
       Das laesst sich im Repo nicht feststellen — all_cards_merged.csv
       kennt keine Raritaet "ACE SPEC". Die Spalte is_ace_spec in den
       Turnier-CSVs taugt dafuer nicht: 16 der dort markierten Namen
       werden nachweislich mehrfach gespielt, sind also keine Ace Specs. */
    const LISTE = JSON.parse(read('data/ace_specs.json'));

    it('keine Dubletten', () => {
        const namen = LISTE.ace_specs.map(n => n.trim().toLowerCase());
        const doppelt = [...new Set(namen.filter((n, i) => namen.indexOf(n) !== i))];
        assert.deepEqual(doppelt, [], 'doppelte Eintraege: ' + doppelt.join(', '));
    });

    it('total_count zaehlt die eindeutigen Namen', () => {
        const eindeutig = new Set(LISTE.ace_specs.map(n => n.trim().toLowerCase())).size;
        assert.equal(LISTE.total_count, eindeutig,
            `total_count ${LISTE.total_count} gegen ${eindeutig} eindeutige Namen`);
    });

    it('die offene Frage steht in der Datei', () => {
        assert.match(LISTE._hinweis || '', /NICHT behoben/,
            'die Liste ist von Hand gepflegt und veraltet — das muss dranstehen, '
            + 'sonst haelt sie der naechste Leser fuer geprueft');
    });
});
