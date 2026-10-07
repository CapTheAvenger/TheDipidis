/**
 * R3 — Fuer jeden Reiter markiert das Pokeball-Menue genau EINEN Punkt.
 *
 * BEFUND (07.09.2026, Runde 3), gemessen im Sandkasten mit dem echten
 * Menue aus index.html:
 *
 *   switchTabAndUpdateMenu('meta-analysis-hub')  ->  0 markierte Punkte
 *   MetaAnalysisHub.exitToHub()                  ->  0 markierte Punkte
 *
 * Ursache: der Menuepunkt mit der Kennung `menu-btn-meta-analysis-hub`
 * wurde im selben Durchgang zu `menu-btn-home` umbenannt (er oeffnet
 * `current-meta`, also die Startseite). Beide Stellen, die einen Punkt
 * ueber `menu-btn-<Reitername>` nachschlagen — js/inline-init.js und
 * js/meta-analysis-hub.js — fanden fuer die Kachelseite danach nichts.
 * Sie entfernen aber ZUERST jede vorhandene Markierung. Das Menue sagte
 * also "du bist nirgends", und zwar lautlos.
 *
 * Der Kommentar in js/meta-analysis-hub.js behauptete dabei das
 * Gegenteil ("The hub now HAS its own top-level entry, so highlight
 * it") — ein Kommentar, der dem Verhalten widerspricht, ist ein Befund
 * fuer sich, weil er den echten verdeckt.
 *
 * WIE HIER GEPRUEFT WIRD
 * ----------------------
 * Nicht gegriffen, sondern AUSGEFUEHRT: die Menuepunkte werden aus dem
 * echten index.html gelesen und als Knoten in den DOM-Sandkasten
 * gehaengt (tests/unit/lib-dom-sandkasten.js), dann laeuft der echte
 * Rumpf von switchTabAndUpdateMenu() und von setSideMenuActive()
 * darueber. Gezaehlt wird, was danach `.menu-item.active` traegt —
 * ANZAHL GENAU 1, nicht "mindestens eine". Eine zweite Markierung ist
 * derselbe Fehler wie keine.
 *
 * Die Liste der Reiter, die Menuepunkte und die Ausnahmeliste werden
 * alle aus den echten Dateien gelesen. Abgeschrieben ist nichts.
 *
 * KEIN jsdom: der CI-Schritt installiert nur papaparse.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { dokument, ausschnitt, lies } = require('./lib-dom-sandkasten.js');
const { sandkasten } = require('./lib-tieflink-sandkasten.js');

const MARKUP = lies('index.html');
const INIT = lies('js', 'inline-init.js');
const HUB = lies('js', 'meta-analysis-hub.js');

/* Kommentare zuerst fort: index.html zitiert Kennungen wie
   `menu-btn-meta-analysis-hub` in mehreren Erklaertexten, und ein
   daraus gelesener Punkt existierte zur Laufzeit gar nicht. */
const MARKUP_OHNE_KOMMENTARE = MARKUP.replace(/<!--[\s\S]*?-->/g, '');

/** Die Reiter, die es im echten Markup wirklich gibt. */
const REITER = [...MARKUP_OHNE_KOMMENTARE.matchAll(
    /id="([a-z-]+)"\s+class="tab-content[^"]*"/g)].map(m => m[1]);

/** Die Menuepunkte, wie sie wirklich im Markup stehen. */
const MENUE = [...MARKUP_OHNE_KOMMENTARE.matchAll(
    /<button([^>]*\bid="menu-btn-[^"]+"[^>]*)>([\s\S]*?)<\/button>/g)].map(m => {
    const attr = m[1];
    const wert = (name) => (attr.match(new RegExp(name + '="([^"]*)"')) || [])[1];
    const label = (m[2].match(/<span class="menu-item-label">([\s\S]*?)<\/span>/) || [])[1];
    return {
        id: wert('id'),
        klasse: wert('class') || '',
        tab: wert('data-tab-id'),
        ziel: (attr.match(/switchTabAndUpdateMenu\('([^']*)'\)/) || [])[1],
        label: (label || '').trim()
    };
});

/**
 * Die Ausnahmeliste aus js/inline-init.js — gelesen, nicht
 * abgeschrieben. Sie sagt, welche Reiter ABSICHTLICH keinen Menuepunkt
 * haben.
 */
const AUSNAHMEN_QUELLE = (INIT.match(
    /const REITER_OHNE_MENUEPUNKT\s*=\s*\[[^\]]*\];/) || [])[0];
assert.ok(AUSNAHMEN_QUELLE,
    'js/inline-init.js fuehrt keine Liste REITER_OHNE_MENUEPUNKT mehr — dann '
    + 'ist nirgends festgehalten, welcher Reiter absichtlich ohne Menuepunkt '
    + 'dasteht, und "kein Punkt" ist wieder von "vergessen" nicht zu '
    + 'unterscheiden.');
// `[...]` weil das Ergebnis aus einem anderen vm-Kontext kommt: ein
// Array von dort ist strukturgleich, aber nicht dieselbe Klasse, und
// deepStrictEqual sagt genau das.
const AUSNAHMEN = [...vm.runInNewContext(
    AUSNAHMEN_QUELLE + ' REITER_OHNE_MENUEPUNKT;')];

/* UI-112 Etappe 3 (Hausi 06.10.2026): Reiter, die sich einen Menuepunkt
   teilen — die Deck-Analyse hat EINEN Punkt, Japan waehlt die Raumzeile
   oben in der Seite. Auch dieser Hebel steht unten fest. */
const ALIAS_QUELLE = (INIT.match(/const MENUEPUNKT_ALIAS\s*=\s*\{[^}]*\};/) || [])[0];
assert.ok(ALIAS_QUELLE, 'MENUEPUNKT_ALIAS steht nicht mehr in js/inline-init.js.');
const ALIAS = Object.assign({}, vm.runInNewContext(ALIAS_QUELLE + ' MENUEPUNKT_ALIAS;'));

/** Die Gruppentabelle — syncMenuClustersForTab() liest sie. */
const CLUSTER_QUELLE = (INIT.match(/const MENU_CLUSTERS\s*=\s*\{[\s\S]*?\n\};/) || [])[0];
assert.ok(CLUSTER_QUELLE, 'MENU_CLUSTERS steht nicht mehr in js/inline-init.js.');

/** Die Zeile, die den Nachschlager fuer andere Dateien bereitstellt. */
const EXPORT_QUELLE = (INIT.match(
    /window\.__dsMenuepunktFuerReiter\s*=\s*[^;]+;/) || [])[0];
assert.ok(EXPORT_QUELLE,
    'js/inline-init.js stellt __dsMenuepunktFuerReiter nicht mehr bereit — '
    + 'js/meta-analysis-hub.js faellt dann auf seinen eigenen Weg zurueck, '
    + 'und es gibt wieder zwei Regeln fuer dieselbe Frage.');

// ── Der Sandkasten: echtes Menue, echter Code ───────────────────────

/**
 * Baut ein Dokument mit genau den Menuepunkten und Reitern aus
 * index.html und laesst den echten Code darueber laufen.
 */
function aufbau() {
    const dok = dokument();
    const warnungen = [];

    const drop = dok.neu('div', 'mainMenuDropdown');
    dok.neu('div', 'mainMenuTrigger');
    dok.neu('span', 'current-tab-title');

    // Die Reiter — switchTabAndUpdateMenu prueft die Klasse.
    REITER.forEach(id => { dok.neu('div', id).className = 'tab-content'; });

    // Die Gruppen, damit syncMenuClustersForTab() wirklich laeuft und
    // nicht an `if (!submenu || !group) return` aussteigt.
    const gruppen = {};
    [...MARKUP_OHNE_KOMMENTARE.matchAll(/id="menu-submenu-([a-z-]+)"/g)]
        .map(m => m[1]).forEach(name => {
            gruppen[name] = {
                submenu: dok.neu('div', 'menu-submenu-' + name, drop),
                group: dok.neu('button', 'menu-group-' + name, drop)
            };
            gruppen[name].submenu.className = 'menu-submenu';
        });

    // Die Menuepunkte, mit Klassen, data-tab-id und Beschriftung.
    MENUE.forEach(p => {
        const b = dok.neu('button', p.id, drop);
        b.className = p.klasse;
        if (p.tab) b.setAttribute('data-tab-id', p.tab);
        const s = dok.neu('span', null, b);
        s.className = 'menu-item-label';
        s.textContent = p.label;
    });

    const fenster = { document: dok };
    fenster.window = fenster;
    const kontext = {
        document: dok,
        window: fenster,
        console: {
            warn: (...a) => warnungen.push(a.join(' ')),
            error: (...a) => warnungen.push(a.join(' ')),
            log() {}
        },
        // Bare Global, das switchTabAndUpdateMenu ueber `typeof` sucht.
        switchTab(tabId) {
            dok.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const t = dok.getElementById(tabId);
            if (t) t.classList.add('active');
        },
        String: String
    };
    fenster.switchTab = kontext.switchTab;
    vm.createContext(kontext);

    vm.runInContext([
        AUSNAHMEN_QUELLE,
        ALIAS_QUELLE,
        CLUSTER_QUELLE,
        ausschnitt(INIT, 'function menuepunktFuerReiter(tabId)'),
        EXPORT_QUELLE,
        ausschnitt(INIT, 'function syncMenuClustersForTab(tabId)'),
        ausschnitt(INIT, 'function switchTabAndUpdateMenu(tabId)'),
        ausschnitt(HUB, 'function setSideMenuActive(tabId)'),
        'globalThis.__wechsle = switchTabAndUpdateMenu;',
        'globalThis.__markiere = setSideMenuActive;'
    ].join('\n'), kontext, { filename: 'r3-menuemarkierung.js' });

    return {
        dok,
        warnungen,
        /** Die Kennungen der Punkte, die JETZT markiert sind. */
        markiert: () => dok.querySelectorAll('.menu-item.active').map(k => k.id).sort(),
        wechsle: (tabId) => kontext.__wechsle(tabId),
        setzeMarkierung: (tabId) => kontext.__markiere(tabId)
    };
}

/** Erwartete Anzahl markierter Punkte je Reiter — aus der Ausnahmeliste. */
function erwartung() {
    const e = {};
    REITER.forEach(r => { e[r] = AUSNAHMEN.indexOf(r) === -1 ? 1 : 0; });
    return e;
}

// ── Zusicherungen ───────────────────────────────────────────────────

describe('R3 — Menuemarkierung je Reiter', () => {

    it('das Markup hat die 15 Reiter, mit denen hier gerechnet wird', () => {
        // V2-15 (07.10.2026): 16 -> 15, die Kachelseite ist weg.
        assert.equal(REITER.length, 15,
            'Die Zahl der Reiter hat sich geaendert (' + REITER.length + '): '
            + REITER.join(', ') + '. Dann muss die Erwartung unten neu '
            + 'gemessen werden, statt still weiterzulaufen.');
        assert.ok(REITER.indexOf('meta-analysis-hub') < 0);
        assert.ok(REITER.indexOf('admin') >= 0);
    });

    it('genau EIN Reiter steht absichtlich ohne Menuepunkt da: admin', () => {
        /* Die Ausnahmeliste ist der Hebel, mit dem sich diese ganze
           Pruefung aushebeln liesse — wer einen Reiter dort eintraegt,
           darf ihn unmarkiert lassen. Deshalb steht sie hier fest.
           `admin` ist begruendet: js/app-admin.js sagt selbst "diese
           Seite steht nicht im Menü", und
           tests/unit/test-hilfe-und-reitertitel-07-09.js setzt genau das
           voraus. Ein zweiter Eintrag ist zu begruenden, nicht
           nachzutragen. */
        assert.deepEqual(AUSNAHMEN, ['admin']);
        assert.deepEqual(ALIAS, { 'city-league-analysis': 'current-analysis' });
        const ohnePunkt = REITER.filter(r => !ALIAS[r] && !MENUE.some(p => p.id === 'menu-btn-' + r));
        assert.deepEqual(ohnePunkt, ['admin'],
            'Diese Reiter haben keinen Menuepunkt im Markup. Steht ein Reiter '
            + 'hier, aber nicht in REITER_OHNE_MENUEPUNKT, bleibt das Menue '
            + 'beim Oeffnen dieses Reiters unmarkiert.');
    });

    it('jeder Reiter markiert GENAU EINEN Menuepunkt (Anzahl, nicht "mindestens")', () => {
        const s = aufbau();
        const gemessen = {};
        REITER.forEach(r => { s.wechsle(r); gemessen[r] = s.markiert().length; });
        assert.deepEqual(gemessen, erwartung(),
            'Gemessen wurde die Zahl der Punkte mit .menu-item.active nach '
            + 'switchTabAndUpdateMenu(<Reiter>). 0 heisst: das Menue sagt "du '
            + 'bist nirgends" — die vorige Markierung wird ja zuerst entfernt. '
            + '2 heisst: es sagt zwei Orte gleichzeitig.');
    });

    it('der markierte Punkt oeffnet auch genau diesen Reiter', () => {
        /* Sonst waere die Zaehlung oben mit einem falschen Punkt zu
           erfuellen — z. B. die Kachelseite auf "Startseite" zu
           markieren, den Punkt also, der current-meta oeffnet. Das ist
           genau die Verwechslung, die am 26.08.2026 abgestellt wurde. */
        const s = aufbau();
        const falsch = [];
        REITER.forEach(r => {
            s.wechsle(r);
            s.markiert().forEach(id => {
                const p = MENUE.find(x => x.id === id);
                if (!p) { falsch.push(r + ' -> ' + id + ' (kein Menuepunkt)'); return; }
                if (p.ziel !== (ALIAS[r] || r)) falsch.push(r + ' -> ' + id + ' oeffnet ' + p.ziel);
            });
        });
        assert.deepEqual(falsch, []);
    });

    it('die Startseite markiert ihren eigenen Punkt (V2-15: keine Kachelseite mehr)', () => {
        const s = aufbau();
        s.wechsle('current-meta');
        assert.deepEqual(s.markiert(), ['menu-btn-current-meta'],
            'Die Startseite hat ihren eigenen Punkt; beide duerfen nicht auf '
            + 'denselben zeigen.');
    });

    it('der zweite Weg (setSideMenuActive) markiert denselben Punkt', () => {
        /* js/meta-analysis-hub.js markiert beim Ruecksprung auf die
           Kachelseite selbst. Zwei Wege, ein Menuezustand — sonst haengt
           es vom Weg ab, was markiert ist. */
        const s = aufbau();
        const abweichler = [];
        REITER.forEach(r => {
            s.wechsle(r);
            const ueberMenue = s.markiert();
            s.setzeMarkierung(r);
            const ueberHub = s.markiert();
            if (ueberMenue.join(',') !== ueberHub.join(',')) {
                abweichler.push(r + ': Menue ' + JSON.stringify(ueberMenue)
                    + ' vs. Hub ' + JSON.stringify(ueberHub));
            }
        });
        assert.deepEqual(abweichler, []);
    });

    it('exitToHub landet auf einem markierten Menuepunkt', () => {
        /* Der Aufruf, dessen Kommentar bis zum 07.09.2026 das Gegenteil
           behauptete. Gemessen wird die Kennung, die exitToHub()
           tatsaechlich an setSideMenuActive uebergibt — aus der Datei
           gelesen. */
        const auszug = ausschnitt(HUB, 'function exitToHub()');
        const arg = (auszug.match(/setSideMenuActive\('([^']*)'\)/) || [])[1];
        assert.ok(arg, 'exitToHub() markiert gar keinen Menuepunkt mehr.');
        const s = aufbau();
        s.wechsle('tutorial');                 // irgendwo anders anfangen
        s.setzeMarkierung(arg);
        assert.equal(s.markiert().length, 1,
            'exitToHub() markiert "' + arg + '" — dafuer gibt es keinen '
            + 'eindeutigen Menuepunkt. Genau so stand das Menue nach dem '
            + 'Ruecksprung leer da.');
    });

    it('nur der zuletzt gewaehlte Reiter ist markiert — die vorige Markierung geht', () => {
        const s = aufbau();
        s.wechsle('cards');
        assert.deepEqual(s.markiert(), ['menu-btn-cards']);
        s.wechsle('pocket');
        assert.deepEqual(s.markiert(), ['menu-btn-pocket']);
    });

    it('ein Reiter ohne Menuepunkt meldet sich, statt lautlos leer zu bleiben', () => {
        /* Der eigentliche Rueckfall gegen die naechste Runde dieses
           Befunds: ein neuer Reiter ohne Menuepunkt faellt beim ersten
           Oeffnen auf. Geprueft auf BEIDEN Wegen — beide haben denselben
           Fehler gemacht. */
        const s = aufbau();
        s.wechsle('gibt-es-nicht');
        assert.equal(s.markiert().length, 0);
        assert.ok(s.warnungen.some(w => w.indexOf('gibt-es-nicht') >= 0),
            'switchTabAndUpdateMenu() hat den Reiter ohne Menuepunkt nicht '
            + 'gemeldet: ' + JSON.stringify(s.warnungen));

        const s2 = aufbau();
        s2.setzeMarkierung('gibt-es-nicht');
        assert.ok(s2.warnungen.some(w => w.indexOf('gibt-es-nicht') >= 0),
            'setSideMenuActive() (js/meta-analysis-hub.js) schlaegt wieder an '
            + 'seiner eigenen Stelle nach und meldet nichts: '
            + JSON.stringify(s2.warnungen));
    });

    it('der begruendete Ausnahmefall admin meldet sich NICHT', () => {
        const s = aufbau();
        s.wechsle('admin');
        assert.equal(s.markiert().length, 0);
        assert.deepEqual(s.warnungen, [],
            'admin steht absichtlich in keinem Menue — eine Warnung dafuer '
            + 'waere Laerm und wuerde die echten Faelle zudecken.');
    });
});

describe('R3 — Tiefenlinks markieren denselben einen Punkt', () => {

    /** Alle Kurzformen aus HASH_ALIASES — aus der Datei gelesen. */
    function kurzformen() {
        const tabelle = ausschnitt(INIT, 'const HASH_ALIASES = {')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '');
        return [...tabelle.matchAll(/'([a-z0-9-]+)':\s*'([a-z-]+)'/g)].map(m => m[1]);
    }

    it('jede Kurzform fuehrt auf einen Reiter mit genau einem Menuepunkt', () => {
        const kurz = kurzformen();
        assert.ok(kurz.length > 30, 'nur ' + kurz.length + ' Kurzformen gelesen');
        const s = aufbau();
        const e = erwartung();
        const schlecht = [];
        kurz.forEach(alias => {
            // Der Weg der Adresszeile: der Tieflink-Sandkasten fuehrt
            // applyHash() echt aus und protokolliert, auf welchem Reiter
            // er landet.
            const sk = sandkasten();
            sk.gehZu('#' + alias);
            const reiter = sk.protokoll.menue[sk.protokoll.menue.length - 1];
            if (!reiter) { schlecht.push('#' + alias + ' -> kein Reiterwechsel'); return; }
            s.wechsle(reiter);
            const n = s.markiert().length;
            if (n !== e[reiter]) {
                schlecht.push('#' + alias + ' -> ' + reiter + ': ' + n
                    + ' markiert, erwartet ' + e[reiter]);
            }
        });
        assert.deepEqual(schlecht, []);
    });

    it('#hub, #uebersicht und #overview fuehren auf die Startseite und markieren sie (V2-15)', () => {
        const s = aufbau();
        ['hub', 'uebersicht', 'overview', 'meta-analysis-hub'].forEach(alias => {
            const sk = sandkasten();
            sk.gehZu('#' + alias);
            const reiter = sk.protokoll.menue[sk.protokoll.menue.length - 1];
            assert.equal(reiter, 'current-meta', '#' + alias);
            s.wechsle(reiter);
            assert.deepEqual(s.markiert(), ['menu-btn-current-meta'],
                '#' + alias + ' laesst das Menue unmarkiert.');
        });
    });
});
