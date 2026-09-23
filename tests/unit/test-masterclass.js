/* test-masterclass.js — Zusicherungen fuer den Masterclass-Untertab.
 *
 * Drei Dinge sollen hier beissen:
 *
 *   1. VERHALTEN. Die Umschalter (Bereich, Matchup-Filter, Listenwahl)
 *      und die Auszeichnung der Begruendungen werden AUSGEFUEHRT, nicht
 *      im Quelltext gesucht. Eine Textzusicherung haette am 12.09.2026
 *      schon einmal nicht gebissen, weil der eigene Kommentar das
 *      gesuchte Muster enthielt.
 *   2. DATENLAGE. Das nachgeladene Stueck behauptet Zahlen — 60 Karten
 *      je Liste, genau ein ACE SPEC, Siegquoten mit Nenner. Das wird
 *      gegen die Datei gerechnet, nicht geglaubt.
 *   3. SPRACHE. Die Oberflaechen-Beschriftungen des Regals muessen in
 *      beiden Sprachen existieren; der Inhalt selbst ist erklaertermassen
 *      nur deutsch und traegt dafuer einen Hinweis.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const JS = fs.readFileSync(path.join(WURZEL, 'js', 'ds-masterclass.js'), 'utf8');
const FRAGMENT = fs.readFileSync(path.join(WURZEL, 'masterclass', 'mega-stalobor.de.html'), 'utf8');
const CSS = fs.readFileSync(path.join(WURZEL, 'css', 'masterclass.css'), 'utf8');
const INDEX = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(WURZEL, 'js', 'i18n.js'), 'utf8');
const SWITCH = fs.readFileSync(path.join(WURZEL, 'js', 'firebase-collection.js'), 'utf8');

/* Kommentare heraus, bevor Quelltext nach Zeichenketten durchsucht wird.
 * Ohne das macht der eigene Kommentar die Verfaelschungsprobe blind
 * (CLAUDE.md, 13./14.09.2026). */
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const JS_NACKT = ohneKommentare(JS);

/* Gegenprobe zum Ausschneiden selbst. */
test('das Kommentar-Ausschneiden entfernt nicht zu viel', () => {
    assert.ok(JS_NACKT.length > JS.length * 0.3,
        `nur noch ${JS_NACKT.length} von ${JS.length} Zeichen uebrig`);
});

/* ── Funktionen aus der Datei schneiden und wirklich ausfuehren ── */

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(treffer.index, i + 1);
        }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

function lade(...namen) {
    const quelle = namen.map((n) => schneideFunktion(JS, n)).join('\n');
    const ktx = { assert };
    vm.createContext(ktx);
    vm.runInContext(quelle + '\n;({' + namen.join(',') + '})', ktx);
    return vm.runInContext('({' + namen.join(',') + '})', ktx);
}

/* Ein winziger DOM-Ersatz: genau die vier Methoden, die die Umschalter
 * benutzen. Kein jsdom im Repo, und fuer drei Schleifen braucht es keins. */
function knoten(attrs, tag) {
    const a = Object.assign({}, attrs);
    return {
        tagName: tag || 'DIV',
        hidden: false,
        getAttribute: (k) => (k in a ? a[k] : null),
        setAttribute: (k, v) => { a[k] = String(v); },
        _attrs: a
    };
}
function wurzelMit(liste) {
    return {
        querySelectorAll: (sel) => liste.filter((n) => {
            const m = /^\[([^\]=]+)\]$/.exec(sel);
            if (m) return n.getAttribute(m[1]) !== null;
            const k = /^\.([\w-]+)$/.exec(sel);
            if (k) return (n._attrs.class || '').split(/\s+/).includes(k[1]);
            return false;
        })
    };
}

test('bereichWechseln zeigt genau einen Abschnitt und druckt genau einen Knopf', () => {
    const { bereichWechseln } = lade('bereichWechseln');
    const abschnitte = ['spick', 'matchups', 'listen', 'doku']
        .map((z) => knoten({ 'data-mcl-abschnitt': z }));
    const knoepfe = ['spick', 'matchups', 'listen', 'doku']
        .map((z) => knoten({ 'data-mcl-ziel': z }));
    bereichWechseln(wurzelMit(abschnitte.concat(knoepfe)), 'listen');
    assert.deepStrictEqual(abschnitte.map((a) => a.hidden), [true, true, false, true]);
    assert.deepStrictEqual(knoepfe.map((b) => b.getAttribute('aria-pressed')),
        ['false', 'false', 'true', 'false']);
});

test('matchupFilter blendet genau die andere Einstufung aus, "alle" zeigt wieder alles', () => {
    const { matchupFilter } = lade('matchupFilter');
    const mus = ['gut', 'schlecht', 'even', 'gut']
        .map((s) => knoten({ 'data-s': s, class: 'mcl-mu' }));
    const chips = ['alle', 'gut', 'even', 'schlecht']
        .map((f) => knoten({ 'data-mcl-filter': f }));
    const w = wurzelMit(mus.concat(chips));
    matchupFilter(w, 'gut');
    assert.deepStrictEqual(mus.map((m) => m.hidden), [false, true, true, false]);
    assert.strictEqual(chips[1].getAttribute('aria-pressed'), 'true');
    assert.strictEqual(chips[0].getAttribute('aria-pressed'), 'false');
    matchupFilter(w, 'alle');
    assert.deepStrictEqual(mus.map((m) => m.hidden), [false, false, false, false]);
});

test('listeWechseln zeigt genau einen Listenblock', () => {
    const { listeWechseln } = lade('listeWechseln');
    const bloecke = [0, 1, 2, 3, 4, 5].map((i) => knoten({ 'data-mcl-listenblock': String(i) }));
    const chips = [0, 1, 2, 3, 4, 5].map((i) => knoten({ 'data-mcl-liste': String(i) }));
    listeWechseln(wurzelMit(bloecke.concat(chips)), 4);
    assert.deepStrictEqual(bloecke.map((b) => b.hidden), [true, true, true, true, false, true]);
    assert.strictEqual(chips[4].getAttribute('aria-pressed'), 'true');
});

test('markiere maskiert HTML und laesst nur Fett und Kursiv durch', () => {
    const { markiere } = lade('markiere', 'esc');
    assert.strictEqual(markiere('**fett** und *kursiv*'), '<b>fett</b> und <i>kursiv</i>');
    const boese = markiere('<img src=x onerror="alert(1)">');
    assert.ok(!boese.includes('<img'), `HTML durchgelassen: ${boese}`);
    assert.ok(boese.includes('&lt;img'), `nicht maskiert: ${boese}`);
});

/* ── Was das Inhaltsstueck behauptet, muss darin auch stehen ── */

test('jede Liste fuehrt genau 60 Karten und genau ein ACE SPEC', () => {
    /* 21.09.2026: sechs Listen. 22.09.2026 auf 20 erweitert — Tims
     * Empfehlung mit dem Kangama/Arktos-Paket plus die dreizehn
     * Mega-Stalobor-Listen aus Tag 2 der Worlds. Der Betreiber hatte
     * gemeldet, dass die Kangama/Arktos-Liste fehlt; sie stand nur als
     * Fliesstext da. Die 60 und die eine ACE SPEC sind die Gegenprobe
     * fuers Ablesen: 14 Listen unabhaengig aus Videobildern
     * abgeschrieben, und jede kommt auf 60 — ein Lesefehler waere hier
     * aufgefallen. */
    const bloecke = FRAGMENT.match(/data-mcl-listenblock="\d+"[\s\S]*?<\/div>\s*<p class="mcl-quelle">/g) || [];
    assert.ok(bloecke.length >= 25, `${bloecke.length} Listenbloecke gefunden, erwartet mindestens 25`);
    const ACE = ['Heldenumhang', 'Edler Rollwagen', 'Geheime Box', 'Unfairer Stempel'];
    bloecke.forEach((b, i) => {
        const anzahlen = [...b.matchAll(/data-n="(\d+)"/g)].map((m) => Number(m[1]));
        const summe = anzahlen.reduce((a, n) => a + n, 0);
        assert.strictEqual(summe, 60, `Liste ${i} hat ${summe} Karten`);
        const aces = ACE.filter((a) => b.includes(`data-de="${a}"`)).length;
        assert.strictEqual(aces, 1, `Liste ${i} hat ${aces} ACE SPEC`);
        const zuViel = [...b.matchAll(/data-de="([^"]+)" data-en="[^"]*" data-druck="[^"]*" data-n="(\d+)"/g)]
            .filter((m) => Number(m[2]) > 4 && !/Energie|Energy/.test(m[1]));
        assert.strictEqual(zuViel.length, 0,
            `Liste ${i}: mehr als 4 Kopien von ${zuViel.map((m) => m[1]).join(', ')}`);
    });
});

test('jede Siegquote nennt ihren Nenner, und unter 30 Partien steht keine Quote', () => {
    /* BESTELLUNG (22.09.2026): "Koennen wir bei Matchups die aktuellen
     * Werte vom current Online Meta anzeigen ... und von den letzten
     * Majors auch noch die Matchup-Daten dazu ... damit ich mich mit
     * aktuellen Daten bestmoeglich vorbereiten kann."
     *
     * Drei gemessene Zahlen je Matchup, und damit drei Gelegenheiten,
     * eine Quote ohne Grundlage zu zeigen. Die Mindeststichprobe ist
     * dieselbe wie in der Archetypkarte (js/app-archetype-card.js,
     * MIN_PRAESENZ_PARTIEN = 30): darunter steht die Bilanz. */
    const zellen = [...FRAGMENT.matchAll(
        /<span class="mcl-wrz([^"]*)"[^>]*>(?:<em>([^<]*)<\/em>)?<b>([^<]*)<\/b>(?:<i>\((\d[\d.]*)\)<\/i>)?<\/span>/g)];
    assert.ok(zellen.length >= 80,
        `nur ${zellen.length} Zahlenzellen gefunden — erwartet vier je Matchup`);

    const ohneNenner = [];
    const zuDuenn = [];
    const verschenkt = [];
    zellen.forEach(([, klasse, label, wert, n]) => {
        if (/mcl-wrz-tim/.test(klasse)) return;          /* Tims Spalte ist keine Messung */
        if (wert === '—') return;                         /* keine Partien: sagt es auch */
        const partien = n ? Number(String(n).replace(/\./g, '')) : null;
        if (partien === null) { ohneNenner.push(label + ' ' + wert); return; }
        const istQuote = /%/.test(wert);
        if (istQuote && partien < 30) zuDuenn.push(`${label} ${wert} aus ${partien}`);
        if (!istQuote && partien >= 30) verschenkt.push(`${label} ${wert} aus ${partien}`);
    });

    assert.deepStrictEqual(ohneNenner, [], 'diese Zahlen stehen ohne Nenner da');
    assert.deepStrictEqual(zuDuenn, [],
        'diese Quoten stehen unter der Mindeststichprobe von 30 Partien');
    assert.deepStrictEqual(verschenkt, [],
        'hier steht eine Bilanz, obwohl die Stichprobe fuer eine Quote reicht');

    /* Gegenprobe: es muessen ueberhaupt Quoten UND Bilanzen vorkommen,
     * sonst prueft die Regel oben nur eine Seite. */
    const quoten = zellen.filter((m) => /%/.test(m[3])).length;
    const bilanzen = zellen.filter((m) => /\d+–\d+–\d+/.test(m[3])).length;
    assert.ok(quoten >= 20, `nur ${quoten} Quoten im Stueck`);
    assert.ok(bilanzen >= 5, `nur ${bilanzen} Bilanzen — die Mindeststichprobe greift nirgends`);
});

test('jedes Matchup zeigt drei Metas und Tims Einschaetzung', () => {
    /* "Vielleicht zeigen wir auch aktuelles Meta WR und daneben last
     * Meta Online und Last Meta Major ... und falls Tim eine eigene
     * Schaetzung gegeben hat, dann noch Tim WR." — Tim hat keine Zahl
     * genannt, deshalb steht dort sein Wort, klar als Einschaetzung
     * beschriftet. */
    const reihen = FRAGMENT.match(/<span class="mcl-wr3">[\s\S]*?<\/span><\/span>/g) || [];
    const mus = (FRAGMENT.match(/<details class="mcl-mu"/g) || []).length;
    assert.ok(mus >= 20, `nur ${mus} Matchups`);
    assert.strictEqual(reihen.length, mus,
        `${reihen.length} Zahlenreihen auf ${mus} Matchups`);
    /* BESTELLUNG (23.09.2026): "Bei jetzt schreibst du TEF bis 30C,
     * statt davor TEF bis PBL, und bei Majors da auch in Klammern
     * TEF bis PBL — mit den Metabezeichnungen kann doch jeder viel mehr
     * anfangen als mit jetzt und davor." Jeder Spaltenkopf muss also
     * sein Meta nennen. Der laufende kommt aus data/format_window.json,
     * genau wie im Rest der Seite; die Majors-Spalte traegt ihr Format
     * in Klammern, weil sie aus einem anderen stammt. */
    /* Das laufende Fenster kommt aus dem Stempel des Stuecks selbst
     * (data-mcl-drucke-fenster) — der wird beim Bau aus
     * data/format_window.json gesetzt und in der Python-Zusicherung
     * dagegen geprueft. So haengt dieser Test nicht an den Daten dieser
     * Woche (tests/unit/test-testdaten-wachhund.js). */
    const stempel = (FRAGMENT.match(/data-mcl-drucke-fenster="([^"]+)"/) || [])[1];
    assert.ok(stempel, 'der Formatfenster-Stempel des Stuecks fehlt');
    const laufend = stempel.replace('-', '\u2013');
    const koepfe = [...FRAGMENT.matchAll(/<span class="mcl-wr3">([\s\S]*?)<\/span><\/span>/g)]
        .map((m) => [...m[1].matchAll(/<em>([^<]+)<\/em>/g)].map((e) => e[1]).join('|'));
    assert.strictEqual(koepfe.length, mus, `${koepfe.length} Zahlenreihen auf ${mus} Matchups`);
    const gleich = new Set(koepfe);
    assert.strictEqual(gleich.size, 1,
        'die Matchups tragen verschiedene Spaltenkoepfe: ' + [...gleich].join(' / '));
    const [k1, k2, k3, k4] = [...gleich][0].split('|');
    assert.strictEqual(k1, laufend,
        `die erste Spalte heisst "${k1}", das laufende Formatfenster ist "${laufend}"`);
    assert.ok(/^[A-Z0-9]+\u2013[A-Z0-9]+$/.test(k2) && k2 !== k1,
        `die zweite Spalte nennt kein eigenes Meta: "${k2}"`);
    assert.ok(/^Majors \([A-Z0-9]+\u2013[A-Z0-9]+\)$/.test(k3),
        `die Majors-Spalte nennt ihr Format nicht in Klammern: "${k3}"`);
    assert.strictEqual(k4, 'Tim', `die vierte Spalte heisst "${k4}"`);
    assert.ok(!/<em>(Jetzt|Davor)<\/em>/.test(FRAGMENT),
        'die Spalten heissen wieder Jetzt/Davor statt nach ihrem Meta');

    /* Tims Wort muss zur Ampel des Matchups passen — sonst widerspraeche
     * die Zeile dem Balken daneben. */
    const paare = [...FRAGMENT.matchAll(/data-s="(gut|even|schlecht)"[\s\S]*?mcl-tim-(gut|even|schlecht)"[^>]*><em>Tim<\/em><b>([^<]+)<\/b>/g)];
    assert.strictEqual(paare.length, mus, `nur ${paare.length} Tim-Zellen zugeordnet`);
    const wort = { gut: 'gut', even: 'ausgeglichen', schlecht: 'schlecht' };
    const falsch = paare.filter((m) => m[1] !== m[2] || m[3] !== wort[m[1]]).map((m) => m.slice(1, 4).join('/'));
    assert.deepStrictEqual(falsch, [], 'Tims Spalte widerspricht der Ampel');

    /* Und die Zahlen muessen als das beschriftet sein, was sie sind. */
    assert.ok(/Win % nach Matchpunkten/.test(FRAGMENT), 'die Konvention der Quoten steht nirgends');
    assert.ok(/online_api_matchups_TEF-30C\.csv/.test(FRAGMENT), 'die Quelle des aktuellen Metas fehlt');
    assert.ok(/labs_tournament_matchups\.csv/.test(FRAGMENT), 'die Quelle der Majors fehlt');
});


test('die Zahlenspalten stapeln, solange sie nicht nebeneinander passen', () => {
    /* Mit den Metakoepfen braucht der Zahlenblock 527 statt 434 px
     * (Playwright, tokens.css inline — ohne die fallen alle var()-Regeln
     * aus und jede Messung ist wertlos). Der Umbruchpunkt lag bei 560 px
     * und war schon vorher zu tief: bei 640 px Breite stand die Zeile
     * auf 152 px, weil die Deck-Namen neben den Zahlen auf fuenf Zeilen
     * brachen; mit den laengeren Koepfen waeren es 274 px und 14
     * abgeschnittene Stellen geworden. Ab 1000 px gestapelt: 95-112 px,
     * kein Umbruch, nichts abgeschnitten. */
    const m = CSS.match(/@media \(max-width:\s*(\d+)px\)\s*\{\s*\.mcl-mu > summary\s*\{\s*grid-template-columns:\s*7px 1fr;/);
    assert.ok(m, 'die Regel, die die Zahlenspalten unter den Deck-Namen stapelt, fehlt');
    assert.ok(Number(m[1]) >= 900,
        `gestapelt wird erst unter ${m[1]} px — der Zahlenblock braucht 527 px neben dem Namen`);
});
test('das Stueck nennt seine Quellen und behauptet keine eigenen Zahlen', () => {
    /* 22.09.2026: die Matchup-Quelle hat gewechselt. Vorher stand dort
     * EINE Ladder-Aggregation (limitless_online_decks_matchups.csv,
     * Konvention ohne Unentschieden); jetzt sind es drei Quellen, aus
     * denen die Quoten selbst gerechnet werden — die alte Zeile waere
     * eine vierte Zahl fuer dieselbe Frage gewesen. */
    [
        'online_api_matchups_TEF-30C.csv',
        'online_api_matchups_TEF-PBL.csv',
        'labs_tournament_matchups.csv',
        'limitless_online_decks.csv',
    ].forEach((quelle) => {
        assert.ok(FRAGMENT.includes(quelle), `die Quelle ${quelle} wird nicht genannt`);
    });
    /* Und der Stand, zu dem die Zahlen gelesen wurden: das Stueck zieht
     * nicht nach. */
    assert.ok(/Stand \d{4}-\d{2}-\d{2}/.test(FRAGMENT), 'der Datenstand fehlt');
    assert.ok(/zieht nicht selbst nach/.test(FRAGMENT),
        'das Stueck sagt nicht, dass seine Zahlen eingefroren sind');
});

/* ── Einbindung und Sprache ── */

test('index.html traegt Huelle, Knopf, CSS und Skript', () => {
    assert.ok(/id="profile-masterclass"/.test(INDEX), 'Huelle fehlt');
    assert.ok(/id="masterclassHost"/.test(INDEX), 'Host-Knoten fehlt');
    assert.ok(/switchProfileTab\('masterclass'\)/.test(INDEX), 'Knopf fehlt');
    assert.ok(/css\/masterclass\.css\?v=/.test(INDEX), 'CSS nicht eingebunden');
    assert.ok(/js\/ds-masterclass\.js\?v=/.test(INDEX), 'Skript nicht eingebunden');
});

test('switchProfileTab zeichnet das Regal', () => {
    const fn = schneideFunktion(SWITCH, 'switchProfileTab');
    const nackt = ohneKommentare(fn);
    assert.ok(nackt.includes("tabName === 'masterclass'"),
        'der Einstieg fehlt in switchProfileTab');
    assert.ok(nackt.includes('DsMasterclass'), 'DsMasterclass wird nicht gerufen');
});

test('die Beschriftungen des Regals gibt es in beiden Sprachen', () => {
    ['mcl.tab', 'mcl.title'].forEach((k) => {
        const n = (I18N.match(new RegExp(`'${k.replace('.', '\\.')}'`, 'g')) || []).length;
        assert.strictEqual(n, 2, `${k} kommt ${n}-mal vor, erwartet 2 (en und de)`);
    });
    const txt = JS_NACKT.slice(JS_NACKT.indexOf('var TXT'), JS_NACKT.indexOf('function lang'));
    const de = (txt.match(/de:\s*\{[\s\S]*?\}/) || [''])[0];
    const en = (txt.match(/en:\s*\{[\s\S]*?\}/) || [''])[0];
    const schluessel = (b) => (b.match(/(\w+):\s*'/g) || []).map((x) => x.replace(/:\s*'$/, ''));
    assert.deepStrictEqual(schluessel(de).sort(), schluessel(en).sort(),
        'die Beschriftungen unterscheiden sich zwischen de und en');
    assert.ok(schluessel(de).length >= 12, `nur ${schluessel(de).length} Beschriftungen`);
});

test('die nur-deutsche Aufbereitung sagt das auch, statt es zu verschweigen', () => {
    assert.ok(JS_NACKT.includes('nurDe'), 'der Hinweis fehlt');
    assert.ok(/sprachen:\s*\['de'\]/.test(JS_NACKT),
        'der Guide gibt seine Sprachen nicht an');
    assert.ok(JS_NACKT.includes("g.sprachen.indexOf(lang()) === -1"),
        'der Hinweis haengt an keiner Bedingung');
});

test('die CSS kommt ohne !important aus und faerbt ueber Tokens', () => {
    /* Die Kommentare muessen raus, BEVOR gezaehlt wird: der Kopfkommentar
     * dieser CSS-Datei sagt selbst "Kein !important in dieser Datei" und
     * haette die Zusicherung sonst rot gemacht, ohne dass eine Regel
     * !important benutzt. Genau die Falle aus CLAUDE.md, nur andersherum. */
    const cssNackt = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(cssNackt.length > CSS.length * 0.3,
        `das Ausschneiden hat zu viel entfernt: ${cssNackt.length} von ${CSS.length}`);
    assert.strictEqual((cssNackt.match(/!important/g) || []).length, 0,
        '!important in css/masterclass.css');
    assert.ok(cssNackt.includes(':root[data-theme="dark"] #masterclassHost'),
        'kein Dunkelmodus fuer die Ampelfarben');
    ['--surface-1', '--line', '--ink-2', '--r-md'].forEach((t) => {
        assert.ok(cssNackt.includes(`var(${t})`), `Token ${t} wird nicht benutzt`);
    });
});

/* ── Ausgeliefert wird nur, was die Positivliste kennt ── */

test('der Deploy kopiert masterclass/ nach _site — sonst ist es live 404', () => {
    /* BEFUND (21.09.2026, live gemessen): PR #792 war gruen, gemerged und
     * ausgerollt. Der Reiter zeigte trotzdem "Die Masterclass liess sich
     * nicht laden", weil `fetch('masterclass/mega-stalobor.de.html')` auf
     * thedipidis.app 404 gab: _site wird aus einer Positivliste gebaut,
     * nicht aus dem Repo-Inhalt. Dieselbe Falle wie bei tutorial/ (18.08.)
     * und posts/ (04.09.) — beide stehen als Kommentar in derselben Datei.
     * Eine gruene Suite hat davon nichts gemerkt, weil kein Test die
     * Ausliefer-Liste gelesen hat. Jetzt tut es einer. */
    const yml = fs.readFileSync(
        path.join(WURZEL, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');
    const ohneRaute = yml.split('\n').filter((z) => !/^\s*#/.test(z)).join('\n');
    assert.ok(ohneRaute.length > yml.length * 0.3,
        `das Ausschneiden hat zu viel entfernt: ${ohneRaute.length} von ${yml.length}`);
    assert.match(ohneRaute, /cp -r masterclass _site\/masterclass/,
        'masterclass/ fehlt in der Positivliste von deploy-pages.yml — '
        + 'das Inhaltsstueck waere live 404, obwohl es im Repo liegt');
    /* Die Gegenprobe: das Verzeichnis, aus dem geladen wird, ist auch das,
     * das kopiert wird. Ein Umbenennen faellt hier auf. */
    assert.match(JS_NACKT, /datei:\s*'masterclass\//,
        'der Guide zeigt nicht mehr auf masterclass/');
});

/* ── Fachbegriffe, die man nicht uebersetzt ── */

test('going first/second steht so da und ist nicht in "vorne/hinten" uebersetzt', () => {
    /* BEFUND (21.09.2026, vom Betreiber gemeldet): Die Aufbereitung hatte
     * "Vorne wählen" und "Zug 1 hinten" geschrieben. Im Deutschen sagen
     * Spieler aber "Going First" und "Going Second" — und schlimmer: im
     * selben Stueck heisst "vorne/hinten liegen" das Preisrennen. Derselbe
     * Satz meinte damit zwei verschiedene Dinge. Woertlich: "Going first
     * oder Going second ist auch im deutschen so übernommen und musst du
     * nicht übersetzen. Vorne ist hier auch falsch."
     *
     * Die Zusicherung prueft beide Richtungen: der Fachbegriff muss
     * vorkommen, und die uebersetzten Wendungen duerfen es nicht. */
    assert.ok(/Going First/.test(FRAGMENT), 'Going First kommt nicht vor');
    assert.ok(/Going Second/.test(FRAGMENT), 'Going Second kommt nicht vor');

    const verboten = [
        /vorne wählen/i, /hinten wählen/i, /Zug 1 hinten/i, /Zug 1 vorne/i,
        /wenn du vorne bist/i, /wenn du hinten bist/i,
        /wenn man vorne ist/i, /wenn man hinten ist/i,
        /blind vorne/i,
    ];
    const treffer = verboten
        .map((r) => (FRAGMENT.match(r) || [])[0])
        .filter(Boolean);
    assert.deepStrictEqual(treffer, [],
        'uebersetztes going first/second im Stueck: ' + treffer.join(', '));

    /* Gegenprobe, damit die Verbotsliste nicht ins Leere prueft: "vorne"
     * und "hinten" duerfen weiter vorkommen — aber nur dort, wo sie das
     * Preisrennen oder das Spielfeld meinen. */
    const rest = (FRAGMENT.match(/\b(vorne|hinten)\b/g) || []).length;
    assert.ok(rest <= 3,
        `${rest} offene "vorne/hinten" im Stueck — jedes davon von Hand pruefen`);
});

test('Phase 1 und Phase 2 heissen wie auf der Karte, nicht "Stufe"', () => {
    /* Die deutschen Karten sagen "Phase-2-Pokémon" (siehe card_text_de von
     * POR-84 Rosys Ermutigung). "Stufe 2" ist die englische Denkweise. */
    const stufe = (FRAGMENT.match(/Stufe[- ][12]/g) || []);
    assert.deepStrictEqual(stufe, [],
        'auf den deutschen Karten heisst das Phase 1 / Phase 2: ' + stufe.join(', '));
});

test('der Lavados-Treffer steht mit 220 da, und der Bankzugriff beim Boss', () => {
    /* BEFUND (21.09.2026, vom Betreiber gemeldet): Im Stueck stand
     * "Lavados (Moltres) gibt Bankzugriff ohne Matt" und "für 120".
     * Beides war falsch. Nachgerechnet am Kartentext:
     *   Kampfschwingen 20, gegen ein Pokémon-ex +90  = 110
     *   Mega-Stalobor-ex hat Feuerschwäche, also x2  = 220
     * Bankzugriff gibt Lavados gar keinen — die Attacke trifft nur das
     * Aktive Pokémon. Er kommt von Befehl vom Boss; neu ist nur, dass
     * Katapuldra die Feuer-Energie von Hand anlegen kann und Matt
     * (Crispin) dafuer nicht mehr braucht. Die 120 stammen aus einem
     * verstolperten Untertitel ("dealing 200 … 120 damage"). */
    const stellen = FRAGMENT.split(/Lavados/).slice(1)
        .map((s) => s.slice(0, 420));
    assert.ok(stellen.length >= 2, `nur ${stellen.length} Lavados-Stellen`);

    const mit220 = stellen.filter((s) => /\b220\b/.test(s));
    assert.ok(mit220.length >= 1,
        'keine Lavados-Stelle nennt die nachgerechneten 220');

    const falsch = stellen.filter((s) => /Bankzugriff/.test(s) && !/Boss/.test(s));
    assert.deepStrictEqual(falsch, [],
        'eine Lavados-Stelle behauptet Bankzugriff, ohne den Boss zu nennen');

    const alteZahl = stellen.filter((s) => /Lavados[^.]{0,80}\b120\b/.test('Lavados' + s));
    assert.deepStrictEqual(alteZahl, [],
        'die widerlegten 120 stehen wieder im Stueck');
});

test('das Kartendetail zeigt den deutschen Kartentext, nicht nur den englischen', () => {
    /* BEFUND (21.09.2026, live gesehen): Das Kartendetail war mit
     * "Kartentext (englisch)" ueberschrieben und zeigte nur den
     * englischen Text — in einer Aufbereitung, die es ausdruecklich auf
     * Deutsch geben sollte. Die Datenbank fuehrt card_text_de; genutzt
     * hat es niemand. Jetzt steht der deutsche Text oben und der
     * englische klein darunter. */
    assert.ok(/data-text-en=/.test(FRAGMENT),
        'das Stueck liefert keinen zweiten Kartentext mit');

    const kacheln = FRAGMENT.match(/data-text="[^"]{20,}"/g) || [];
    assert.ok(kacheln.length >= 20, `nur ${kacheln.length} Kartentexte im Stueck`);

    /* Nicht eine Stichprobe, sondern JEDES Hauptfeld: Wendungen, die nur
     * im englischen Kartentext vorkommen, duerfen dort nicht stehen.
     * Eine Stichprobe auf ein einzelnes Wort haette eine einzelne Karte
     * durchrutschen lassen — gemessen in der Verfaelschungsprobe. */
    /* 22.09.2026: die Liste fester englischer Wendungen hat eine
     * Verfaelschung durchgelassen — Briduradon-ex' englischer Text
     * enthaelt keine davon. Jetzt entscheiden allgemeine englische
     * Funktionswoerter, die in einem deutschen Kartentext nirgends
     * vorkommen (gemessen: 0 von 501 deutschen Texten treffen sie). */
    const englisch = /\b(your|the|you may|from your|during your|opponent|attached to|damage|discard|search)\b/i;
    const falsch = kacheln.filter((k) => englisch.test(k));
    assert.deepStrictEqual(falsch.map((k) => k.slice(11, 60)), [],
        'diese Kartentexte stehen englisch im Hauptfeld');

    /* Und der Gegencheck ohne Wortliste: Haupt- und Zweitfeld duerfen
     * nie denselben Text fuehren. Wer den deutschen Text durch den
     * englischen ersetzt, faellt hier auf, egal welche Woerter darin
     * stehen. */
    const paare = [...FRAGMENT.matchAll(/data-text="([^"]*)" data-text-en="([^"]*)"/g)];
    assert.ok(paare.length >= 20, `nur ${paare.length} Kartentext-Paare im Stueck`);
    const doppelt = paare.filter((m) => m[1] && m[2] && m[1] === m[2]);
    assert.deepStrictEqual(doppelt.map((m) => m[1].slice(0, 40)), [],
        'bei diesen Karten steht im Hauptfeld derselbe Text wie im Zweitfeld');
    assert.ok(/data-text="[^"]*Untergraben/.test(FRAGMENT),
        'im Hauptfeld steht nicht der deutsche Kartentext');

    assert.ok(JS_NACKT.includes('kartentextEn'),
        'das Skript kennt den zweiten Kartentext nicht');
    const de = JS_NACKT.slice(JS_NACKT.indexOf('de:'), JS_NACKT.indexOf('function lang'));
    assert.ok(/kartentext:\s*'Kartentext'/.test(de),
        'die deutsche Beschriftung heisst weiter "Kartentext (englisch)"');
});

test('die fuenf Online-Listen der letzten sieben Tage sind eigene Listen', () => {
    /* BESTELLUNG (22.09.2026): "kannst du noch die erfolgreichsten Listen
     * der letzten 7 Tage online Limitless Turniere dazu packen". Quelle:
     * play.limitlesstcg.com, gelesen am 22.09.2026 — Best-Finishes-Tabelle
     * des Archetyps plus die Standings aller dort gelisteten
     * Online-Turniere ab 100 Spielern im Fenster 15.-22.09.2026.
     *
     * Die Zusicherung haengt an data-mcl-liste und data-de, nicht an
     * Fliesstext: am 22.09. ist eine Verfaelschung durch eine
     * Freitextpruefung geschluepft, weil derselbe Name auch in der
     * Ausarbeitung steht. */
    const chips = FRAGMENT.match(/data-mcl-liste="\d+"[^>]*>([^<]+)</g) || [];
    const online = chips.filter((c) => /·\s*\d+\.\s*von\s*\d+/.test(c));
    assert.strictEqual(online.length, 5,
        `${online.length} Online-Chips, erwartet 5 (Platz und Feldgroesse im Namen)`);
    ['Kingssofgamer02', 'Kapony', 'Ducsjr', 'CALLMEDANDI', 'Lordeyebrow'].forEach((s) => {
        assert.ok(online.some((c) => c.includes(s)), `kein Online-Chip fuer ${s}`);
    });
    assert.ok(/class="mcl-listgruppe-titel">Online · letzte 7 Tage</.test(FRAGMENT),
        'die Gruppe "Online · letzte 7 Tage" fehlt in der Listenwahl');

    /* Briduradon-ex steckt nur in der Online-Liste von Ducsjr. Faellt die
     * Kachel weg, ist die Liste keine echte Liste mehr, sondern eine
     * Variante von Tims Liste. */
    assert.ok(/data-de="Briduradon-ex"/.test(FRAGMENT),
        'Briduradon-ex steht in keiner Liste als Karte');

    /* Woher die Zahlen kommen, steht unter den Listen — sonst ist eine
     * Platzierung eine Behauptung. */
    assert.ok(/play\.limitlesstcg\.com/.test(FRAGMENT), 'die Quelle der Online-Listen fehlt');
    assert.ok(/ab 100 Spielern/.test(FRAGMENT), 'die Grundgesamtheit der Online-Listen fehlt');
});

test('das Kopierbild teilt die Karten auf volle Zeilen auf und bleibt in der Breite', () => {
    /* BESTELLUNG (22.09.2026): ein Knopf, der die Liste als Bild in die
     * Zwischenablage legt — zum Verschicken auf Tims Discord. Das Bild
     * ist 1200 px breit, damit es dort vorhersagbar aussieht.
     *
     * Die Funktion wird AUSGEFUEHRT, nicht im Quelltext gesucht. */
    const { gitter } = lade('gitter');

    [19, 20, 21, 23, 24, 26, 29].forEach((n) => {
        const g = gitter(n);
        assert.ok(g, `keine Aufteilung fuer ${n} Karten`);
        const breite = g.spalten * g.kb + (g.spalten - 1) * 10 + 2 * 28;
        assert.ok(breite <= 1200,
            `${n} Karten: ${breite} px breit, mehr als die 1200 des Bildes`);
        assert.strictEqual(g.zeilen, Math.ceil(n / g.spalten),
            `${n} Karten: ${g.zeilen} Zeilen passen nicht zu ${g.spalten} Spalten`);
        assert.ok(g.kh > g.kb, `${n} Karten: Kachel ${g.kb}x${g.kh} ist nicht hochkant`);
    });

    /* 21 Karten auf 5 Spalten enden mit EINER Kachel in der letzten
     * Zeile — das liest sich wie ein Rest. Auf 7 Spalten sind es drei
     * volle Zeilen. Dieselbe Abwaegung wie in ds-share.js. */
    const g21 = gitter(21);
    assert.strictEqual(21 % g21.spalten, 0,
        `21 Karten enden mit ${21 % g21.spalten} Kacheln in der letzten Zeile`);
});

test('die Bildadresse wird aus dem Druck gebaut, nicht geraten', () => {
    const { bildAdresse } = lade('bildAdresse');
    assert.strictEqual(bildAdresse('PBL-103'),
        'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/PBL/PBL_103_R_EN_LG.png');
    /* Einstellige Nummern werden dreistellig — MEE-8 liegt unter
     * MEE_008, nicht unter MEE_8. */
    assert.ok(bildAdresse('MEE-8').endsWith('/MEE/MEE_008_R_EN_LG.png'), bildAdresse('MEE-8'));
    ['', 'PBL', 'PBL-', '-103'].forEach((mist) => {
        assert.strictEqual(bildAdresse(mist), '', `aus "${mist}" wurde eine Adresse`);
    });
});

test('jede Liste traegt einen Kopierknopf, jede Kachel beide Drucke', () => {
    /* BESTELLUNG (22.09.2026): "In den Listen selbst bitte den
     * aktuellsten Low-Rarity-Print" plus "einen Button, der die Liste
     * als Screenshot in die Zwischenablage packt". Also zwei Drucke je
     * Kachel — der guenstige in der Liste, der hochwertige im Detail —
     * und je Liste ein Knopf. */
    const bloecke = FRAGMENT.match(/data-mcl-listenblock="\d+"/g) || [];
    const knoepfe = FRAGMENT.match(/data-mcl-kopieren="\d+"/g) || [];
    assert.strictEqual(knoepfe.length, bloecke.length,
        `${knoepfe.length} Kopierknoepfe auf ${bloecke.length} Listen`);
    assert.ok(bloecke.length >= 25, `nur ${bloecke.length} Listen`);

    /* Das Bild braucht einen Namen, sonst heisst jede Datei gleich. */
    const namen = FRAGMENT.match(/data-mcl-listenname="[^"]+"/g) || [];
    assert.strictEqual(namen.length, bloecke.length,
        `${namen.length} Listen tragen einen Namen, erwartet ${bloecke.length}`);

    const druck = FRAGMENT.match(/data-druck="[^"]*"/g) || [];
    const hoch = FRAGMENT.match(/data-druck-hoch="[^"]*"/g) || [];
    assert.strictEqual(hoch.length, druck.length,
        `${hoch.length} Kacheln tragen den Sammlerdruck, ${druck.length} den Listendruck`);

    const paare = [...FRAGMENT.matchAll(/data-druck="([^"]*)" data-druck-hoch="([^"]*)"/g)];
    const anders = new Set(paare.filter((m) => m[1] !== m[2]).map((m) => m[1] + '>' + m[2]));
    assert.ok(anders.size >= 20,
        `nur ${anders.size} Karten unterscheiden Listen- und Sammlerdruck — die Trennung fehlt`);

    /* Und das Detail zeigt ihn auch an, sonst waere das Attribut tot. */
    assert.ok(JS_NACKT.includes('druckHoch'), 'das Skript liest data-druck-hoch nicht');
});

test('die Regalkachel zeigt den Sammlerdruck und nennt die Zahlen des Stuecks', () => {
    /* BEFUND (22.09.2026, vom Betreiber gemeldet, mit Bildschirmfoto):
     * "Ist immer noch der low rarity Print, obwohl da max rarity Print
     * hin soll." Gemeint war die KACHEL im Regal — sie hing noch an
     * PBL-65, waehrend Listen und Detail laengst getrennt waren.
     *
     * Die Zusicherung haengt die Kachel an die REGEL, nicht an eine
     * Nummer: sie liest den Sammlerdruck derselben Karte aus dem Stueck
     * und verlangt genau dessen Bild. Wer die Druckwahl aendert, aendert
     * damit auch die Kachel — oder faellt hier um. */
    const hoch = /data-mcl-karte="mega-excadrill-ex"[^>]*data-druck-hoch="([A-Z0-9]+)-(\d+)"/.exec(FRAGMENT);
    assert.ok(hoch, 'im Stueck steht kein Sammlerdruck fuer Mega-Stalobor-ex');
    const datei = `${hoch[1]}_${hoch[2].padStart(3, '0')}_R_EN_LG.png`;
    const kachel = /bild:\s*'([^']+)'/.exec(JS_NACKT);
    assert.ok(kachel, 'die Regalkachel fuehrt kein Bild');
    assert.ok(kachel[1].endsWith(datei),
        `die Kachel zeigt ${kachel[1].split('/').pop()}, der Sammlerdruck ist ${datei}`);

    /* Und die Kennzahlen auf der Kachel muessen stimmen: "6 Listen" stand
     * dort noch, als es 25 waren. */
    const kenn = /kennzahlen:\s*'([^']+)'/.exec(JS_NACKT);
    assert.ok(kenn, 'die Regalkachel fuehrt keine Kennzahlen');
    const zahl = (muster) => { const m = muster.exec(kenn[1]); return m ? Number(m[1].replace(/\./g, '')) : null; };
    const mus = (FRAGMENT.match(/class="mcl-mu"/g) || []).length;
    const listen = (FRAGMENT.match(/data-mcl-listenblock="\d+"/g) || []).length;
    assert.strictEqual(zahl(/(\d+)\s*Matchups/), mus, `Kachel nennt andere Matchups als das Stueck (${mus})`);
    assert.strictEqual(zahl(/(\d+)\s*Listen/), listen, `Kachel nennt andere Listen als das Stueck (${listen})`);

    /* Die Wortzahl gegen den tatsaechlichen Text, mit 10 % Luft: sie ist
     * eine Angabe fuer den Leser, keine Messgroesse — aber "10.250", wenn
     * es 6.000 sind, waere eine Behauptung. */
    const doku = /<div class="mcl-doku" id="mclDoku">([\s\S]*?)<\/div>\s*<p class="mcl-keintreffer"/.exec(FRAGMENT);
    assert.ok(doku, 'die Ausarbeitung steckt nicht mehr im Stueck');
    const woerter = (doku[1].replace(/<[^>]+>/g, ' ').match(/[A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9'\u2019\-.]*/g) || []).length;
    const genannt = zahl(/([\d.]+)\s*Wörter/);
    assert.ok(genannt !== null, 'die Kachel nennt keine Wortzahl');
    assert.ok(Math.abs(genannt - woerter) / woerter <= 0.1,
        `Kachel nennt ${genannt} Wörter, gezaehlt sind ${woerter}`);
});

test('der Klick auf den Kopierknopf landet beim Kopieren, der auf eine Karte beim Detail', () => {
    /* Die Verdrahtung wird AUSGEFUEHRT. Eine Textsuche nach
     * "data-mcl-kopieren" im Skript haette hier nichts gesehen: der
     * Name steht ohnehin in listeKopieren() selbst — gemessen in der
     * Verfaelschungsprobe, die Zeile liess sich entfernen, ohne dass
     * eine Zusicherung rot wurde. */
    const quelle = schneideFunktion(JS, 'verdrahte');
    const ktx = { assert, gerufen: [], handler: null };
    ktx.wurzel = { addEventListener: (typ, fn) => { if (typ === 'click') ktx.handler = fn; } };
    vm.createContext(ktx);
    vm.runInContext(
        'function bereichWechseln() { gerufen.push("bereich"); }\n'
        + 'function matchupFilter() { gerufen.push("filter"); }\n'
        + 'function listeWechseln() { gerufen.push("liste"); }\n'
        + 'function listeKopieren() { gerufen.push("kopieren"); }\n'
        + 'function kartenDetail() { gerufen.push("detail"); }\n'
        + 'function sucheVerdrahten() {}\n'
        + quelle + '\nverdrahte(wurzel);', ktx);

    assert.ok(ktx.handler, 'verdrahte() haengt keinen Klick-Horcher an');

    const klick = (treffer) => ({
        target: { closest: (sel) => (sel === treffer ? { getAttribute: () => '3' } : null) }
    });
    ktx.handler(klick('[data-mcl-kopieren]'));
    assert.deepStrictEqual(ktx.gerufen, ['kopieren'],
        'ein Klick auf den Kopierknopf ruft nicht listeKopieren');
    ktx.gerufen.length = 0;
    ktx.handler(klick('.mcl-kk'));
    assert.deepStrictEqual(ktx.gerufen, ['detail'],
        'ein Klick auf eine Karte ruft nicht mehr das Detail');
});

test('Tims Paketliste heisst Kangama Arktos Build', () => {
    /* BESTELLUNG (22.09.2026): "kannst du die Tim Liste welche aktuell
     * Update mit Paket heisst umbenennen in Kangama Arktos Build". */
    assert.ok(/data-mcl-liste="\d+"[^>]*>Kangama Arktos Build</.test(FRAGMENT),
        'kein Listenchip heisst "Kangama Arktos Build"');
    assert.ok(!/Update · mit Paket/.test(FRAGMENT),
        'der alte Name "Update · mit Paket" steht noch im Stueck');
});

test('die Kangama/Arktos-Liste und die Worlds-Gruppe sind da', () => {
    /* BEFUND (22.09.2026, vom Betreiber gemeldet): "es gibt ja wohl eine
     * Liste mit Kangama und Arctos, aber die ist gar nicht drin." Stimmte:
     * das Paket stand nur als Fliesstext in Teil B4. Tim zeigt die
     * fertigen 60 Karten bei Minute 11:50 des Updates. */
    /* Als Kartenkachel, nicht irgendwo im Fliesstext — genau das war
     * der Befund: der Name stand da, die Liste nicht. */
    assert.ok(/data-de="Team Rockets Kangama-ex"/.test(FRAGMENT),
        'Team Rockets Kangama-ex steht in keiner Liste als Karte');
    assert.ok(/data-de="Team Rockets Arktos"/.test(FRAGMENT),
        'Team Rockets Arktos steht in keiner Liste als Karte');

    const gruppen = FRAGMENT.match(/class="mcl-listgruppe-titel">([^<]+)</g) || [];
    assert.strictEqual(gruppen.length, 3,
        `${gruppen.length} Listengruppen, erwartet 3 (Tims Listen, Worlds Tag 2, Online)`);

    /* Die dreizehn fremden Listen tragen Name und Platzierung, sonst
     * weiss der Leser nicht, wessen Liste er sieht. */
    const chips = FRAGMENT.match(/data-mcl-liste="\d+"[^>]*>([^<]+)</g) || [];
    assert.ok(chips.length >= 25, `nur ${chips.length} Listenchips`);
    const mitPlatz = chips.filter((c) => /·\s*\d+\./.test(c));
    assert.ok(mitPlatz.length >= 11,
        `nur ${mitPlatz.length} Chips nennen eine Platzierung`);
});
