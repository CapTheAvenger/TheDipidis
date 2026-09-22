/**
 * DIE GRUNDGESAMTHEIT IST DER TAG-2-CUT — UND DAS MUSS AN DER ZAHL STEHEN.
 *
 * BEFUND (nachgezaehlt am 07.09.2026, siehe die Tabelle unten, die
 * dieser Test selbst aus den Dateien rechnet):
 * data/tournament_decklists_per_player.csv fuehrt je Turnier
 * AUSSCHLIESSLICH die Spieler mit day2=1 aus data/player_continuity.csv,
 * lueckenlos von Platz 1 bis zum letzten. Nicht weil der Scraper
 * filtert, sondern weil limitlesstcg.com Decklisten erst ab Tag 2
 * veroeffentlicht.
 *
 * Fuer Mega Excadrill heisst das: 8 veroeffentlichte Listen von 32
 * Piloten bei 797 Spielern im Feld. Vor dieser Runde stand an vier
 * Stellen im Deckbauer "8 Listen ausgewertet" — der Nutzer liest das
 * als "acht Leute spielen das Deck".
 *
 * WARUM DIESE DATEI AUS data/ LIEST UND TROTZDEM KEINE WOCHENWERTE
 * BEHAUPTET (Register in test-testdaten-wachhund.js):
 *
 *   1. Die Zaehlungen sind GLEICHUNGEN ZWISCHEN DREI DATEIEN. Geprueft
 *      wird nicht "Worlds hat 797 Spieler", sondern "die Zahl der
 *      day2=1-Zeilen ist die Zahl der Listen ist die Summe der Spalte
 *      day2_players". Welche Zahlen dort stehen, ist jeder Zusicherung
 *      egal — sie muessen nur zueinander passen.
 *   2. Die EINE Ausnahme ist BELEGTE_FELDER in
 *      js/deck-builder-consistency.js. Die ist ABSICHTLICH eine harte
 *      Gleichheit gegen die Datei: der Kommentarblock im Motor nennt
 *      Feldgroessen, und genau der ist am 06.09.2026 still veraltet
 *      (774 statt 797, nachdem der Wochenlauf das Feld nachzog). Diese
 *      Zusicherung SOLL rot werden, wenn Kommentar und Datei
 *      auseinanderlaufen — dann ist der Kommentar nachzuziehen, nicht
 *      der Test zu entschaerfen. Sie hat einen erklaerten Ausweg: ein
 *      Turnier, das aus BELEGTE_FELDER faellt, wird uebersprungen, ein
 *      Turnier, das neu dazukommt, ist kein Fehler.
 *   3. Alles, was Text prueft, laeuft auf GESETZTEN dataQuality-Objekten
 *      und ruft die echten Funktionen auf.
 *
 * Kein jsdom: die drei Module laufen unter einem Minimal-global.
 */

const assert = require('node:assert/strict');
const { describe, it, before } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Papa = require('papaparse');
const { ZAHL_KOMMA_SRC, zahlKommaEinsetzen } = require('./lib-zahlkomma-sandkasten.js');
/* zahlKomma() aus js/app-utils.js — im Browser laedt index.html sie vor
   jedem Aufrufer, der Sandkasten muss sie deshalb ebenfalls kennen. */
const zahlKomma = new Function(ZAHL_KOMMA_SRC + '\nreturn zahlKomma;')();

const WURZEL = path.join(__dirname, '..', '..');
const D = (n) => path.join(WURZEL, 'data', n);

// ── CSV-Leser fuer die Nachzaehlung ─────────────────────────────────
function liesCsv(datei, trenner) {
    const txt = fs.readFileSync(D(datei), 'utf8').replace(/^﻿/, '');
    const res = Papa.parse(txt, {
        header: true, skipEmptyLines: true,
        delimiter: trenner || ',',
    });
    return res.data;
}

const PER   = liesCsv('tournament_decklists_per_player.csv');
const CONT  = liesCsv('player_continuity.csv');
const LABS  = liesCsv('labs_tournament_decks.csv');
const PBL   = liesCsv('labs_tournament_decks_TEF-PBL.csv');

const norm = (s) => String(s || '').trim().toLowerCase();
const zahl = (x) => parseInt(String(x || '0').trim(), 10) || 0;

/** Die Turniere, die die Listen-CSV ueberhaupt fuehrt. */
const TURNIERE = [...new Set(PER.map(r => String(r.tournament_id || '').trim()))]
    .filter(Boolean).sort();

/** Je Turnier: Plaetze mit Liste, day2-Zeilen, Feldgroesse. */
function erhebe(tid) {
    const zeilen = PER.filter(r => String(r.tournament_id || '').trim() === tid);
    const plaetze = [...new Set(zeilen.map(r => Number(r.place)))]
        .filter(p => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
    const cont = CONT.filter(r => String(r.tournament_id || '').trim() === tid);
    const day2 = cont.filter(r => String(r.day2 || '').trim() === '1');
    const labs = LABS.filter(r => String(r.tournament_id || '').trim() === tid);
    return {
        tid,
        plaetze,
        listen: plaetze.length,
        contZeilen: cont.length,
        day2: day2.length,
        // Nur day2-Zeilen MIT gueltigem Platz sind vergleichbar: eine
        // disqualifizierte Zeile ohne Platz kann keine Liste haben.
        day2MitPlatz: day2.filter(r => zahl(r.place) > 0).length,
        feld: labs.reduce((m, r) => Math.max(m, zahl(r.total_players)), 0),
        summeDay2Spalte: labs.reduce((s, r) => s + zahl(r.day2_players), 0),
        summePlayerCount: labs.reduce((s, r) => s + zahl(r.player_count), 0),
    };
}

const ERHEBUNG = TURNIERE.map(erhebe);

/* Feldgroessen der Online-Turniere, aus derselben Datei, die auch der
   Motor liest. Semikolon-getrennt und ohne BOM. */
/* Die Feldgroesse, die der Motor fuer ein ONLINE-Turnier kennt — in
   DERSELBEN Reihenfolge, in der er sie sucht.

   NACHGETRAGEN AM 10.09.2026, ABENDS. Vormittags kannte der Motor nur
   data/online_api_tournaments.csv, und diese Karte hier reichte. Seit
   dem Wochenlauf um 18:13 UTC fuellt der Online-Scraper die Spalte
   `spielerzahl` in der Zeile selbst — sie ist die ERSTE Quelle des
   Motors, und fuer Turniere, die die Turnierdatei noch nicht kennt,
   die einzige. Gemessen: 1.427 Online-Listen, davon 0 ohne
   Feldgroesse (vormittags waren es 305 von 1.319).

   Ohne diesen Nachtrag rechnet der Test den Sollwert aus einer
   aermeren Quelle als der Motor und meldet eine Abweichung, wo keine
   ist — genau das ist hier passiert. */
const ONLINE_FELD_AUS_ZEILE = (() => {
    const m = new Map();
    try {
        const zeilen = fs.readFileSync(
            D('tournament_decklists_per_player.csv'), 'utf8').split('\n');
        const kopf = zeilen[0].replace(/^﻿/, '').split(',');
        const iQ = kopf.indexOf('quelle');
        const iL = kopf.indexOf('limitless_tournament_id');
        const iS = kopf.indexOf('spielerzahl');
        if (iQ < 0 || iL < 0 || iS < 0) return m;
        for (const z of zeilen.slice(1)) {
            if (!z) continue;
            const f = z.split(',');
            if (f[iQ] !== 'online') continue;
            const n = parseInt((f[iS] || '').trim(), 10);
            const tid = (f[iL] || '').trim();
            if (tid && Number.isFinite(n) && n > 0 && !m.has(tid)) m.set(tid, n);
        }
    } catch (_) { /* Datei fehlt: dann bleibt die Karte leer */ }
    return m;
})();

const ONLINE_FELD = (() => {
    const m = new Map();
    try {
        const txt = fs.readFileSync(D('online_api_tournaments.csv'), 'utf8');
        const zeilen = txt.split('\n');
        const kopf = zeilen[0].replace(/^﻿/, '').split(';');
        const iId = kopf.indexOf('tournament_id');
        const iPl = kopf.indexOf('players');
        if (iId < 0 || iPl < 0) return m;
        for (const z of zeilen.slice(1)) {
            if (!z.trim()) continue;
            const f = z.split(';');
            const n = parseInt(f[iPl], 10);
            if (f[iId] && Number.isFinite(n) && n > 0) m.set(f[iId].trim(), n);
        }
    } catch (_) { /* Datei fehlt: dann bleibt die Karte leer */ }
    return m;
})();

// ── Module laden (ohne jsdom) ───────────────────────────────────────
function ladeMotor(ersatz) {
    // `ersatz` ist eine Zuordnung Dateiname -> CSV-Text. Damit laesst
    // sich EIN gesetzter Fall einspeisen (ein Turnier, das in keiner
    // Labs-Datei steht), ohne die echten Dateien anzufassen.
    const E = ersatz || {};
    const g = {
        console,
        setTimeout,
        Papa: {
            parse(url, opts) {
                // Der Motor ruft Papa.parse(url, {download:true}). Hier
                // liest dieselbe Datei vom Datentraeger — echte Daten,
                // kein Netz.
                const rein = String(url).split('?')[0].replace(/^data\//, '');
                try {
                    const txt = Object.prototype.hasOwnProperty.call(E, rein)
                        ? E[rein]
                        : fs.readFileSync(D(rein), 'utf8').replace(/^﻿/, '');
                    const res = Papa.parse(txt, { header: true, skipEmptyLines: true });
                    setTimeout(() => opts.complete(res), 0);
                } catch (e) {
                    setTimeout(() => opts.error ? opts.error(e) : opts.complete({ data: [] }), 0);
                }
            },
        },
        fetch(url) {
            const rein = String(url).split('?')[0].replace(/^data\//, '');
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(JSON.parse(fs.readFileSync(D(rein), 'utf8'))),
            });
        },
        getLang: () => 'de',
    };
    g.window = g;
    g.globalThis = g;
    vm.createContext(g);
    vm.runInContext(
        fs.readFileSync(path.join(WURZEL, 'js', 'deck-builder-consistency.js'), 'utf8'),
        g, { filename: 'deck-builder-consistency.js' });
    return g;
}

let G, MCB;
before(async () => {
    G = ladeMotor();
    MCB = G.MostConsistencyBuilder;
    await MCB.loadData();
});

// ════════════════════════════════════════════════════════════════════
describe('Die Listen-CSV fuehrt genau das Tag-2-Feld', () => {

    it('jedes Turnier: Zahl der Listen = Zahl der day2-Zeilen mit Platz', () => {
        assert.ok(ERHEBUNG.length > 0, 'Vorpruefung: die Listen-CSV fuehrt Turniere');
        for (const e of ERHEBUNG) {
            assert.equal(e.listen, e.day2MitPlatz,
                `Turnier ${e.tid}: ${e.listen} Listen, aber ${e.day2MitPlatz} `
                + `day2-Spieler mit Platz. Weichen die ab, ist die Datei NICHT `
                + `mehr genau der Tag-2-Cut — dann ist jede "Tag-2"-Beschriftung `
                + `im Deckbauer falsch und muss mit.`);
        }
    });

    it('jedes Turnier: die Plaetze laufen lueckenlos von 1 bis n', () => {
        for (const e of ERHEBUNG) {
            assert.equal(e.plaetze[0], 1, `Turnier ${e.tid}: erster Platz ist nicht 1`);
            assert.equal(e.plaetze[e.plaetze.length - 1], e.plaetze.length,
                `Turnier ${e.tid}: letzter Platz ${e.plaetze[e.plaetze.length - 1]} `
                + `bei ${e.plaetze.length} Listen — Luecke im Cut`);
            e.plaetze.forEach((p, i) => assert.equal(p, i + 1,
                `Turnier ${e.tid}: Luecke bei Platz ${i + 1}`));
        }
    });

    /* WARUM HIER KEIN GLEICHHEITSZEICHEN MEHR STEHT (22.09.2026).
       ===============================================================
       Bis heute verlangte diese Zusicherung, dass die Summe der Spalte
       `day2_players` in der Archetypen-Datei auf die Zahl der
       Decklisten passt. Fuer 0069, 0070 und 0071 tut sie das aufs
       Spiel genau. Fuer das Regional Baltimore (0072) nicht: labs
       summiert 558, es gibt 559 Listen.

       Nachgemessen — und es ist KEIN Datenverlust:

         data/player_continuity.csv, 0072:   559 Spieler mit day2=1
         Listen im Bestand:                  559, Plaetze 1..559 lueckenlos
         labs day2_players summiert:         558

       Zwei unabhaengige Quellen sagen 559. Die Differenz steckt in der
       ARCHETYPENZUORDNUNG: die beiden Dateien schneiden die Archetypen
       verschieden (`Hydrapple` gegen `Ogerpon Meganium Hydrapple`,
       `Lopunny Dusknoir` 6 gegen 8), und labs fuehrt zusaetzlich einen
       Sammeleintrag `Other` mit 2 Spielern. Ein Deck, das sich nicht
       einordnen laesst, faellt aus der Archetypensumme heraus — es
       verschwindet nicht aus dem Turnier.

       Die Richtung ist die Aussage: die Archetypensumme darf die Zahl
       der Listen NICHT UEBERSTEIGEN (das waeren Geisterspieler), und
       sie darf nur geringfuegig darunter liegen. Ein Gleichheitszeichen
       haette beim naechsten unzuordenbaren Deck wieder den Deploy
       angehalten, ohne dass etwas kaputt ist. */
    /* EIN EINZELNES UNZUORDENBARES DECK IST IMMER ERLAUBT.
       ---------------------------------------------------------------
       NACHTRAG 22.09.2026, erster Lauf des Tors im Wochenlauf: die
       reine Prozentgrenze war die falsche FORM, und zwar unabhaengig
       davon, welche Zahl dort steht.

       Die Luecke entsteht, weil die beiden Dateien die Archetypen
       verschieden schneiden und labs einen Sammeleintrag `Other`
       fuehrt. Sie ist damit eine Eigenschaft der ZUORDNUNG und faellt
       in ganzen Decks an, nicht in Prozent. Dasselbe eine Deck wiegt
       bei 559 Listen 0,18 % und bei 50 Listen 2 % — die Grenze haette
       also nicht die Datenlage bestraft, sondern die Turniergroesse.

       Deshalb: ein Deck geht immer durch, darueber hinaus ein Prozent.
       Ein systematischer Ausfall der Zuordnung faellt weiterhin auf. */
    const ZUORDNUNGS_LUECKE_MAX = 0.01;   // 1 % der Listen, gemessen: 1 von 559
    const ZUORDNUNGS_LUECKE_FREI = 1;     // ein Deck, immer

    it('Gegenprobe: die Summe der Spalte day2_players traegt die Listen', () => {
        for (const e of ERHEBUNG) {
            if (e.summeDay2Spalte === 0) continue;  // Turnier ohne Labs-Zeilen
            assert.ok(e.summeDay2Spalte <= e.listen,
                `Turnier ${e.tid}: labs day2_players summiert ${e.summeDay2Spalte}, `
                + `es gibt aber nur ${e.listen} Listen — mehr Spieler als Listen `
                + `heisst, dass jemand doppelt gezaehlt wird`);
            const fehlend = e.listen - e.summeDay2Spalte;
            const luecke = Math.max(0, fehlend - ZUORDNUNGS_LUECKE_FREI) / e.listen;
            assert.ok(luecke <= ZUORDNUNGS_LUECKE_MAX,
                `Turnier ${e.tid}: labs day2_players summiert ${e.summeDay2Spalte}, `
                + `die Listen-CSV fuehrt ${e.listen} — `
                + `${fehlend} Liste(n) finden keinen Archetypen-Eintrag — `
                + `nach Abzug der einen freien sind das `
                + `${(luecke * 100).toFixed(2)} % (erlaubt `
                + `${ZUORDNUNGS_LUECKE_MAX * 100} %). Eine einzelne `
                + `unzuordenbare Liste ist normal, ein systematischer Ausfall `
                + `der Zuordnung nicht`);
        }
    });

    it('Gegenprobe in der Formatdatei TEF-PBL: dieselbe Summe', () => {
        const proTurnier = new Map();
        for (const r of PBL) {
            const tid = String(r.tournament_id || '').trim();
            if (!tid) continue;
            proTurnier.set(tid, (proTurnier.get(tid) || 0) + zahl(r.day2_players));
        }
        assert.ok(proTurnier.size > 0,
            'Vorpruefung: labs_tournament_decks_TEF-PBL.csv fuehrt Turniere');
        let geprueft = 0;
        for (const e of ERHEBUNG) {
            if (!proTurnier.has(e.tid)) continue;
            /* Dieselbe Form wie oben, aus demselben Grund. */
            assert.ok(proTurnier.get(e.tid) <= e.listen,
                `Turnier ${e.tid} in TEF-PBL: ${proTurnier.get(e.tid)} Spieler `
                + `bei ${e.listen} Listen — mehr Spieler als Listen`);
            const fehlend2 = e.listen - proTurnier.get(e.tid);
            const luecke2 = Math.max(0, fehlend2 - ZUORDNUNGS_LUECKE_FREI) / e.listen;
            assert.ok(luecke2 <= ZUORDNUNGS_LUECKE_MAX,
                `Turnier ${e.tid} in TEF-PBL: ${proTurnier.get(e.tid)} statt ${e.listen} `
                + `(${fehlend2} ohne Archetypen-Eintrag, nach Abzug der einen `
                + `freien ${(luecke2 * 100).toFixed(2)} %)`);
            geprueft++;
        }
        assert.ok(geprueft > 0,
            'Vorpruefung: mindestens ein Turnier steht in beiden Dateien — '
            + 'sonst besteht diese Zusicherung leer');
    });

    it('das Feld ist GROESSER als der Cut — sonst gaebe es nichts zu beschriften', () => {
        for (const e of ERHEBUNG) {
            if (e.feld === 0) continue;
            assert.ok(e.feld > e.listen,
                `Turnier ${e.tid}: Feld ${e.feld} nicht groesser als ${e.listen} Listen`);
        }
    });
});

// ════════════════════════════════════════════════════════════════════
describe('BELEGTE_FELDER stimmt mit den Dateien ueberein', () => {
    /* Diese vier Zusicherungen sind der Wachhund gegen die stille
       Alterung von Kommentarzahlen — genau der Fehler, den die 774
       war. Sie sollen rot werden. */

    it('ist ueberhaupt exportiert', () => {
        assert.ok(MCB.BELEGTE_FELDER && typeof MCB.BELEGTE_FELDER === 'object',
            'MostConsistencyBuilder.BELEGTE_FELDER fehlt');
        assert.ok(Object.keys(MCB.BELEGTE_FELDER).length >= 3,
            'Vorpruefung: mindestens die drei erhobenen Turniere stehen drin');
    });

    it('jede genannte Feldgroesse ist die aus labs_tournament_decks.csv', () => {
        let geprueft = 0;
        for (const [tid, soll] of Object.entries(MCB.BELEGTE_FELDER)) {
            const e = ERHEBUNG.find(x => x.tid === tid);
            if (!e) continue;   // Turnier aus dem Bestand gefallen — kein Fehler
            assert.equal(soll.feld, e.feld,
                `${tid} (${soll.name}): der Code sagt Feld ${soll.feld}, die Datei `
                + `sagt ${e.feld}. Genau so ist die 774 entstanden — den KOMMENTAR `
                + `und diese Konstante nachziehen, nicht den Test.`);
            geprueft++;
        }
        assert.ok(geprueft > 0, 'Vorpruefung: mindestens ein Turnier vergleichbar');
    });

    it('jede genannte Listenzahl ist die aus der Listen-CSV', () => {
        for (const [tid, soll] of Object.entries(MCB.BELEGTE_FELDER)) {
            const e = ERHEBUNG.find(x => x.tid === tid);
            if (!e) continue;
            assert.equal(soll.listen, e.listen,
                `${tid} (${soll.name}): der Code sagt ${soll.listen} Listen, `
                + `die Datei fuehrt ${e.listen}`);
        }
    });

    it('die 774 kommt in der Datei nicht mehr als Feldgroesse vor', () => {
        /* Keine Wochenzahl: geprueft wird, dass KEINE der im Code
           genannten Feldgroessen von der Datei abweicht — die 774 ist
           nur das benannte Beispiel. Waere sie noch da, waere der
           Vergleich oben schon rot; diese Zeile macht den Grund
           lesbar. */
        const codeFelder = Object.values(MCB.BELEGTE_FELDER).map(v => v.feld);
        const dateiFelder = ERHEBUNG.map(e => e.feld).filter(Boolean);
        for (const f of codeFelder) {
            assert.ok(dateiFelder.includes(f),
                `Feldgroesse ${f} steht im Code, aber in keiner Datei — `
                + `veralteter Kommentarwert (so war es bei 774 gegen 797)`);
        }
    });
});

// ════════════════════════════════════════════════════════════════════
describe('dataQuality traegt Piloten und Feldgroesse aus den Labs-Dateien', () => {

    it('holt beide Zahlen — und zwar die aus der Datei, nicht abgeschrieben', async () => {
        // Ein Archetyp, den beide Dateien fuehren; welcher, ist egal.
        const kandidaten = [...new Set(PER.map(r => String(r.deck_archetype || '').trim()))]
            .filter(Boolean);
        assert.ok(kandidaten.length > 2, 'Vorpruefung: die CSV fuehrt Archetypen');

        let geprueft = 0;
        for (const arch of kandidaten) {
            const res = await MCB.build(arch);
            const dq = res && res.dataQuality;
            if (!dq || !dq.sufficient) continue;
            /* `nur_tag2` ist seit dem 10.09.2026 GEMESSEN, nicht fest.
               Der Wochenlauf #135 hat Online-Listen in dieselbe CSV
               geschrieben; dort ist jede Liste des Feldes
               veroeffentlicht, nicht nur der Cut. Ein Bau, der beide
               mischt, darf sich nicht "Tag 2" nennen — die Zusicherung
               prueft deshalb den ZUSAMMENHANG, nicht den festen Wert. */
            assert.equal(dq.nur_tag2, Number(dq.n_online || 0) === 0,
                `${arch}: nur_tag2=${dq.nur_tag2} passt nicht zu `
                + `n_online=${dq.n_online}`);
            const listen = MCB.listsForArchetype(arch);
            const sollOnline = listen.filter(
                l => String(l.quelle || '') === 'online').length;
            assert.equal(Number(dq.n_online || 0), sollOnline,
                `${arch}: n_online weicht von den Listen ab`);

            // Sollwerte aus denselben Dateien rechnen.
            const tids = [...new Set(
                MCB.listsForArchetype(arch).map(l => String(l.tournament_id || '').trim()))]
                .filter(Boolean);
            /* Die Feldgroesse eines ONLINE-Turniers steht nicht in den
               Labs-Dateien, sondern in data/online_api_tournaments.csv
               (Spalte `players`, Semikolon-getrennt) bzw. in der Spalte
               `spielerzahl` der Zeile selbst. Beides sind gemessene
               Zahlen; der Sollwert hier muss sie deshalb kennen, sonst
               prueft der Test die Papierwelt gegen eine gemischte. */
            let sollPiloten = 0, sollFeld = 0, pOk = true, fOk = tids.length > 0;
            for (const tid of tids) {
                const zeile = LABS.find(r => String(r.tournament_id || '').trim() === tid
                    && norm(r.deck_name) === norm(arch));
                if (zeile && zahl(zeile.player_count) > 0) sollPiloten += zahl(zeile.player_count);
                else pOk = false;
                const e = ERHEBUNG.find(x => x.tid === tid);
                if (e && e.feld > 0) { sollFeld += e.feld; continue; }
                // Dieselbe Reihenfolge wie im Motor: erst die Zeile,
                // dann die Turnierdatei.
                const onl = ONLINE_FELD_AUS_ZEILE.get(tid) || ONLINE_FELD.get(tid);
                if (onl > 0) sollFeld += onl; else fOk = false;
            }
            /* DIE MELDUNG NENNT DIE ZAHLEN (22.09.2026).
               Hier stand nur "weicht ab". Als das Tor im Wochenlauf
               anschlug, war das alles, was davon ankam — und die
               frischen Daten lagen als 41-MB-Artefakt daneben, an das
               ohne Anmeldung niemand herankommt. Eine Abweichung ohne
               ihre beiden Zahlen ist nicht nachpruefbar; genau das
               haelt dieses Repo sonst ueberall fest. */
            const woher = `Turniere ${tids.join(',') || '—'}`;
            assert.equal(dq.n_piloten, pOk ? sollPiloten : null,
                `${arch}: n_piloten ist ${dq.n_piloten}, aus labs player_count `
                + `gerechnet ${pOk ? sollPiloten : 'null (eine Zeile fehlt)'} `
                + `(${woher})`);
            assert.equal(dq.feldgroesse, fOk ? sollFeld : null,
                `${arch}: feldgroesse ist ${dq.feldgroesse}, aus labs `
                + `total_players bzw. der Online-Turnierdatei gerechnet `
                + `${fOk ? sollFeld : 'null (fuer ein Turnier gibt keine '
                    + 'Quelle eine Feldgroesse her)'} (${woher})`);
            geprueft++;
        }
        assert.ok(geprueft > 2,
            'Vorpruefung: mindestens drei Archetypen bauen ueberhaupt — '
            + 'sonst laeuft die Zusicherung leer');
    });

    it('Mega Excadrill: die Listenzahl ist kleiner als die Pilotenzahl', async () => {
        /* Keine Wochenzahl, sondern die EIGENSCHAFT, um die es geht:
           veroeffentlicht ist der Cut, gespielt hat ihn das Feld.
           Waeren beide gleich, waere die ganze Beschriftung ueberfluessig.
           Ist der Archetyp aus dem Bestand, wird uebersprungen. */
        const res = await MCB.build('Mega Excadrill');
        const dq = res && res.dataQuality;
        if (!dq || !dq.sufficient || dq.n_piloten === null) return;
        assert.ok(dq.n_lists < dq.n_piloten,
            `Mega Excadrill: ${dq.n_lists} Listen, ${dq.n_piloten} Piloten — `
            + 'die Listen koennen die Piloten nicht uebersteigen');
        assert.ok(dq.n_piloten < dq.feldgroesse,
            'Die Piloten eines Archetyps koennen das Feld nicht uebersteigen');
    });

    it('fehlt die Labs-Zeile, bleibt die Zahl LEER statt geraten', async () => {
        // Gesetzter Fall: ein Archetyp ohne Labs-Zeile darf keine
        // Pilotenzahl bekommen. Solche gibt es im Bestand wirklich
        // (labs fuehrt andere deck_name-Schreibweisen).
        const ohne = [...new Set(PER.map(r => String(r.deck_archetype || '').trim()))]
            .filter(Boolean)
            .filter(a => !LABS.some(r => norm(r.deck_name) === norm(a)));
        if (ohne.length === 0) return;   // waere eine Verbesserung der Daten
        for (const arch of ohne) {
            const res = await MCB.build(arch);
            const dq = res && res.dataQuality;
            if (!dq || !dq.sufficient) continue;
            assert.equal(dq.n_piloten, null,
                `${arch}: hat keine Labs-Zeile, bekommt aber ${dq.n_piloten} Piloten`);
        }
    });
});

// ════════════════════════════════════════════════════════════════════
describe('Der Satz an der Zahl — ausgefuehrt auf gesetzten Werten', () => {

    const VOLL   = { n_lists: 8, n_piloten: 32, feldgroesse: 797 };
    const OHNE_P = { n_lists: 8, n_piloten: null, feldgroesse: 797 };
    const NACKT  = { n_lists: 8, n_piloten: null, feldgroesse: null };

    it('nennt Listen, Piloten und Feld — und das Wort Tag 2', () => {
        const s = MCB.datenbasisSatz(VOLL, 'de');
        assert.equal(s, '8 Tag-2-Listen von 32 Piloten (Feld 797)');
    });

    it('englisch dieselbe Aussage', () => {
        assert.equal(MCB.datenbasisSatz(VOLL, 'en'),
            '8 day-2 lists from 32 pilots (field 797)');
    });

    it('ohne Pilotenzahl faellt nur dieser Halbsatz weg', () => {
        const s = MCB.datenbasisSatz(OHNE_P, 'de');
        assert.equal(s, '8 Tag-2-Listen (Feld 797)');
        assert.ok(!/Piloten/.test(s), 'erfundene Pilotenzahl im Satz');
    });

    it('ohne beide Zahlen bleibt die Listenzahl mit dem Wort Tag 2 — und NICHTS sonst', () => {
        const s = MCB.datenbasisSatz(NACKT, 'de');
        assert.equal(s, '8 Tag-2-Listen');
        assert.ok(!/Feld|\(/.test(s),
            'geratene Feldgroesse im Satz — genau das darf nicht passieren');
    });

    it('eine einzige Liste steht in der Einzahl', () => {
        assert.equal(MCB.datenbasisSatz({ n_lists: 1 }, 'de'), '1 Tag-2-Liste');
        assert.equal(MCB.datenbasisSatz({ n_lists: 1 }, 'en'), '1 day-2 list');
    });

    it('grosse Zahlen bekommen im Deutschen den Punkt', () => {
        assert.equal(MCB.datenbasisSatz({ n_lists: 675, feldgroesse: 3743 }, 'de'),
            '675 Tag-2-Listen (Feld 3.743)');
    });

    it('der Hinweistext erklaert die Quelle und erfindet nichts', () => {
        const h = MCB.datenbasisHinweis(VOLL, 'de');
        assert.ok(/Tag 2/.test(h), 'Hinweis nennt Tag 2 nicht');
        assert.ok(h.includes('32') && h.includes('797') && h.includes('8'),
            'Hinweis nennt die drei Zahlen nicht');
        const leer = MCB.datenbasisHinweis(NACKT, 'de');
        assert.ok(/Tag 2/.test(leer), 'auch ohne Zahlen muss Tag 2 dastehen');
        assert.ok(!/\d{3}/.test(leer), 'Hinweis erfindet eine Feldgroesse');
    });

    it('turnierFeld() liefert die Zahlen der Datei — und null, wo sie fehlen', () => {
        const e = ERHEBUNG[0];
        const arch = (PER.find(r => String(r.tournament_id || '').trim() === e.tid
            && LABS.some(x => String(x.tournament_id || '').trim() === e.tid
                && norm(x.deck_name) === norm(r.deck_archetype))) || {}).deck_archetype;
        assert.ok(arch, 'Vorpruefung: ein Archetyp mit Labs-Zeile');
        const f = MCB.turnierFeld(e.tid, arch);
        assert.equal(f.feldgroesse, e.feld);
        const soll = LABS.find(r => String(r.tournament_id || '').trim() === e.tid
            && norm(r.deck_name) === norm(arch));
        assert.equal(f.n_piloten, zahl(soll.player_count));

        const leer = MCB.turnierFeld('gibt-es-nicht', 'gibt-es-auch-nicht');
        assert.equal(leer.feldgroesse, null);
        assert.equal(leer.n_piloten, null);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('Der Deckbauer zeigt den Satz wirklich an', () => {
    /* Ausgefuehrt, nicht gegrept: der jeweilige Ausdruck wird aus
       js/app-deck-builder.js geschnitten und mit gesetzten Werten
       laufen gelassen. Ein Grep haette nicht gemerkt, ob der Satz auch
       ankommt. */
    const BAU = fs.readFileSync(path.join(WURZEL, 'js', 'app-deck-builder.js'), 'utf8');

    function schneide(von, bis) {
        const a = BAU.indexOf(von);
        assert.ok(a > -1, `Schnittanfang nicht gefunden: ${von}`);
        const b = BAU.indexOf(bis, a);
        assert.ok(b > a, `Schnittende nicht gefunden: ${bis}`);
        return BAU.slice(a, b);
    }

    const DQ = {
        n_lists: 8, n_piloten: 32, feldgroesse: 797, nur_tag2: true,
        n_turniere: 1, turniere: ['World Championships 2026 – Limitless'],
        juengstes_turnier: '2026-08-28', platz_von: 37, platz_bis: 122,
        total_weight: 0.4,
    };

    it('der Erfolgs-Hinweis nennt Tag 2, Piloten und Feld', () => {
        /* Geschnitten wird bis EINSCHLIESSLICH des echten
           showToast-Aufrufs. Endete der Schnitt davor und baute der
           Test den Aufruf selbst, koennte jemand die Zeile im
           Produktivcode auf "8 Listen ausgewertet" zurueckdrehen und
           dieser Test bliebe gruen — genau das ist im Mutationslauf
           passiert (Mutation 10). */
        const stueck = schneide(
            'const _mcb = window.MostConsistencyBuilder;',
            "                    'success', 4000\n                );");
        let gezeigt = '';
        const f = new Function('window', 'result', 'archetype', 'liveTotal', 'showToast',
            stueck + "\n'success', 4000);");
        f({ MostConsistencyBuilder: MCB }, { dataQuality: DQ, coreThreshold: 0.9 },
          'Mega Excadrill', 60, (t) => { gezeigt = t; });
        assert.equal(gezeigt,
            '✓ Mega Excadrill: 60/60 Karten · Core @ 90 % · 8 Tag-2-Listen von 32 Piloten (Feld 797)');
        assert.ok(!/\b8 Listen ausgewertet\b/.test(gezeigt),
            'die alte, nackte Formulierung steht wieder da');
    });

    it('faellt der Motor aus, steht immer noch Tag 2 da', () => {
        const stueck = schneide(
            'const _mcb = window.MostConsistencyBuilder;',
            "                showToast(");
        const f = new Function('window', 'result', stueck + '\nreturn _basis;');
        assert.equal(f({}, { dataQuality: DQ }), '8 Tag-2-Listen');
    });

    it('die Qualitaetszeile traegt den Satz statt "8 Listen"', () => {
        /* Wieder bis EINSCHLIESSLICH des echten auditFindings.push:
           der Satz allein zu pruefen liess die Mutation "hint faellt
           weg" gruen durch (Mutation 12). Gepruft wird jetzt der
           Eintrag, der wirklich in der Liste landet. */
        const stueck = schneide(
            'const _dqq = result.dataQuality || {};',
            '                }\n\n                /* WO DER BAU UND DAS AGGREGAT');
        const f = new Function('window', '_dqEntry', '_coreEntry', 'result',
            'const auditFindings = [];\n' + stueck + '\nreturn auditFindings[0];');
        const r = f({ MostConsistencyBuilder: MCB },
                    { n_lists: 8, decision: 'data_ok' }, null,
                    { dataQuality: DQ, coreThreshold: 0.9 });
        assert.ok(r, 'die Qualitaetszeile entsteht gar nicht');
        assert.ok(r.message.startsWith('Datenbasis: 8 Tag-2-Listen von 32 Piloten (Feld 797)'),
            'die Zeile nennt den Nenner nicht: ' + r.message);
        assert.ok(/Tag 2/.test(r.hint) && /797/.test(r.hint),
            'der Hinweis erklaert die Quelle nicht: ' + r.hint);
    });

    it('der Berichtstext (englisch) nennt day-2 lists', () => {
        const roh = schneide('algo_desc:    `MostConsistencyBuilder (Phase Y.2)',
                             'layers: {');
        const ausdruck = roh.replace(/^algo_desc:\s*/, '').replace(/,\s*$/, '');
        const f = new Function('window', 'result',
            'return ' + ausdruck.replace(/,\s*$/, '') + ';');
        const txt = f({ MostConsistencyBuilder: MCB },
                      { dataQuality: DQ, coreThreshold: 0.9 });
        assert.ok(/8 day-2 lists from 32 pilots \(field 797\) analyzed\./.test(txt), txt);
        assert.ok(!/\b8 lists analyzed\b/.test(txt), 'die alte Formulierung steht wieder da');
    });
});

// ════════════════════════════════════════════════════════════════════
describe('Die Schnellreferenz ordnet ihre Zahlen ein', () => {
    let QR;
    before(() => {
        const g = {
            console, setTimeout,
            // Auch hier laedt der echte Modulcode mit download:true; der
            // Stub liest dieselbe Datei vom Datentraeger und beachtet das
            // Trennzeichen, das das Modul selbst mitgibt.
            Papa: {
                parse(url, opts) {
                    const rein = String(url).split('?')[0].replace(/^data\//, '');
                    try {
                        const txt = fs.readFileSync(D(rein), 'utf8').replace(/^﻿/, '');
                        const res = Papa.parse(txt, {
                            header: true, skipEmptyLines: true,
                            delimiter: opts.delimiter || ',',
                        });
                        setTimeout(() => opts.complete(res), 0);
                    } catch (e) {
                        setTimeout(() => opts.error ? opts.error(e) : opts.complete({ data: [] }), 0);
                    }
                },
            },
            getLang: () => 'de',
            MostConsistencyBuilder: MCB,
            // Die ECHTE Zahlenumrechnung aus js/app-utils.js, aus der
            // Datei geschnitten statt nachgebaut — ein Nachbau koennte
            // Dezimalkommas anders lesen als die Seite.
            parseLocaleNumber: (function () {
                const q = fs.readFileSync(path.join(WURZEL, 'js', 'app-utils.js'), 'utf8');
                const a = q.indexOf('function parseLocaleNumber(');
                assert.ok(a > -1, 'parseLocaleNumber nicht gefunden');
                let tiefe = 0, i = q.indexOf('{', a);
                const start = i;
                for (; i < q.length; i++) {
                    if (q[i] === '{') tiefe++;
                    else if (q[i] === '}') { tiefe--; if (tiefe === 0) break; }
                }
                assert.ok(i > start, 'Funktionsrumpf nicht abgegrenzt');
                return new Function('return ' + q.slice(a, i + 1) + '; return parseLocaleNumber;')();
            })(),
        };
        g.window = g; g.globalThis = g;
        vm.createContext(g);
        zahlKommaEinsetzen(g);
        vm.runInContext(
            fs.readFileSync(path.join(WURZEL, 'js', 'current-meta-quickref.js'), 'utf8'),
            g, { filename: 'current-meta-quickref.js' });
        QR = g._currentMetaQuickRefInternals;
    });

    it('die Major-Kachel sagt Tag 2 und nennt Piloten und Feld', () => {
        const e = ERHEBUNG.find(x => x.feld > 0);
        assert.ok(e, 'Vorpruefung: ein Turnier mit Feldgroesse');
        const zeile = PER.find(r => String(r.tournament_id || '').trim() === e.tid
            && LABS.some(x => String(x.tournament_id || '').trim() === e.tid
                && norm(x.deck_name) === norm(r.deck_archetype)));
        assert.ok(zeile, 'Vorpruefung: ein Archetyp mit Labs-Zeile');
        const soll = MCB.turnierFeld(e.tid, zeile.deck_archetype);

        const html = QR._renderRefHeader({
            tournament_id: e.tid,
            deck_archetype: zeile.deck_archetype,
            tournament_name: 'World Championships 2026 – Limitless',
            tournament_date: '2026-08-28',
            place: 37, player_name: 'Testspieler',
            wins: 0, losses: 0, ties: 0,
            cards: [{ name: 'Test', count: 4 }],
        }, 'major');
        assert.ok(/Tag-2-Liste/.test(html), 'Major-Kachel nennt Tag 2 nicht:\n' + html);
        assert.ok(html.includes(String(soll.n_piloten)),
            `Major-Kachel nennt die Pilotenzahl ${soll.n_piloten} nicht`);
        assert.ok(/Feld /.test(html), 'Major-Kachel nennt das Feld nicht');
        assert.ok(/title="[^"]*Tag 2[^"]*"/.test(html),
            'Major-Kachel erklaert Tag 2 nicht im title');
    });

    it('ohne Labs-Zahlen steht nur das Wort Tag 2 — keine geratene Feldgroesse', () => {
        const html = QR._renderRefHeader({
            tournament_id: 'gibt-es-nicht',
            deck_archetype: 'gibt-es-auch-nicht',
            tournament_name: 'Testturnier', tournament_date: '2026-01-01',
            place: 3, player_name: 'X', wins: 0, losses: 0, ties: 0,
            cards: [{ name: 'Test', count: 4 }],
        }, 'major');
        assert.ok(/Tag-2-Liste/.test(html), 'Tag 2 fehlt');
        const sub = html.match(/past-meta-best-sub[^>]*>([^<]*)</)[1];
        assert.ok(!/Feld|Piloten/.test(sub),
            'geratene Feldgroesse oder Pilotenzahl in der Kopfzeile: ' + sub);
    });

    it('die Online-Kachel nennt das Feld — und sagt NICHT Tag 2', async () => {
        /* Die Online-Quelle hat keinen Tag 2. Nachgezaehlt in
           data/online_tournament_dated_cards.csv: bei keinem Turnier
           decken die veroeffentlichten Listen das Feld. "Tag 2" hier
           waere eine falsche Quellenangabe — diese Zusicherung haelt
           sie draussen. */
        const html = QR._renderRefHeader({
            tournament_name: 'Testturnier Online',
            tournament_date: '2026-09-06',
            total_decks_in_archetype: 8,
            total_players: 214,
            cards: [{ name: 'Test', count: 4 }],
        }, 'online');
        const sub = html.match(/past-meta-best-sub[^>]*>([^<]*)</)[1];
        assert.ok(/214/.test(sub), 'Online-Kachel nennt die Feldgroesse nicht: ' + sub);
        assert.ok(/Spielern im Feld/.test(sub), 'Einordnung fehlt: ' + sub);
        assert.ok(!/Tag.?2/.test(sub),
            'Online-Kachel behauptet Tag 2 — die Quelle kennt keinen: ' + sub);
    });

    it('ohne total_players steht keine geratene Feldgroesse', () => {
        const html = QR._renderRefHeader({
            tournament_name: 'Testturnier Online',
            tournament_date: '2026-09-06',
            total_decks_in_archetype: 8,
            cards: [{ name: 'Test', count: 4 }],
        }, 'online');
        const sub = html.match(/past-meta-best-sub[^>]*>([^<]*)</)[1];
        assert.ok(!/im Feld|in the field/.test(sub), 'erfundene Feldgroesse: ' + sub);
        assert.ok(/8 /.test(sub), 'Listenzahl fehlt: ' + sub);
    });

    it('der synthetisierte Online-Bau reicht total_players wirklich durch', async () => {
        const rows = Papa.parse(
            fs.readFileSync(D('online_tournament_dated_cards.csv'), 'utf8').replace(/^﻿/, ''),
            { header: true, skipEmptyLines: true, delimiter: ';' }).data;
        const mitFeld = rows.filter(r => zahl(r.total_players) > 0);
        assert.ok(mitFeld.length > 0,
            'Vorpruefung: die Online-Datei fuehrt total_players — '
            + 'ohne sie kann die Kachel den Nenner nicht nennen');
        const arch = mitFeld[0].archetype;
        const bau = await QR._findSynthesizedOnlineBuild(arch);
        if (!bau) return;   // Archetyp faellt durch die Rundung — kein Fehler
        const sollFeld = rows
            .filter(r => norm(r.archetype) === norm(arch)
                && String(r.tournament_id || '').trim() === String(bau.tournament_id || '').trim())
            .reduce((m, r) => Math.max(m, zahl(r.total_players)), 0);
        assert.equal(bau.total_players, sollFeld,
            'die Kachel bekaeme eine andere Feldgroesse als die Datei fuehrt');
    });
});

// ════════════════════════════════════════════════════════════════════
describe('Die Gewichtung gewichtet INNERHALB des Cuts', () => {
    /* Punkt 4 des Auftrags. Die Gewichtung selbst wurde NICHT geaendert
       — gemessen wurde kein Fehler an ihr. Geaendert wurde, was der
       Code ueber sie behauptet. Diese Zusicherungen halten die
       Richtigstellung fest, und zwar ausgefuehrt: sie rechnen die
       Gewichte und die Mehrheitsdiagnose auf GESETZTEN Eingaben nach,
       statt Woerter im Quelltext zu suchen. */

    it('das unterste Band ist NICHT "Day-1-only" — es gibt keine solche Liste', () => {
        /* Die Eigenschaft, nicht das Wort: gaebe es Day-1-only-Listen,
           haette mindestens ein Turnier mehr Listen als day2-Spieler.
           Das ist oben schon geprueft; hier die Folgerung fuer das
           Gewicht. Platz 122 bei Worlds bekommt das Band 0,1 (absolut)
           bzw. 0,2 (Perzentil) — beides sind Tag-2-Gewichte. */
        const w = MCB._internals.placementWeight;
        const e = ERHEBUNG.find(x => x.feld > 0 && x.listen > 32);
        assert.ok(e, 'Vorpruefung: ein Turnier mit Listen jenseits von Platz 32');
        const letzter = e.plaetze[e.plaetze.length - 1];
        assert.ok(letzter <= e.listen,
            'der letzte Platz mit Liste liegt hinter dem Cut — dann waere '
            + '"Day-1-only" doch richtig und die Beschriftung muesste zurueck');
        assert.ok(w(letzter, e.feld) > 0,
            'die letzte Tag-2-Liste bekaeme gar kein Gewicht');
    });

    it('das Perzentil misst am Feld, die Gewichtung laeuft ueber den Cut', () => {
        const w = MCB._internals.placementWeight;
        // Gesetzte Werte: Platz 37 in einem Feld von 797 ist das obere
        // 4,6 % des FELDES und liegt zugleich im oberen Viertel des
        // Cuts von 143. Beide Aussagen gelten; das Gewicht folgt dem
        // Feldperzentil.
        assert.strictEqual(w(37, 797), 0.6);
        // Derselbe Platz, aber als Perzentil des CUTS gerechnet (37/143
        // = 25,9 %) ergaebe 0,1 — die Rechnung nimmt also wirklich das
        // Feld als Nenner, nicht den Cut.
        assert.notStrictEqual(w(37, 143), 0.6);
        assert.strictEqual(w(37, 143), 0.1);
    });

    it('die Mehrheitsdiagnose zaehlt LISTEN, nie Piloten', async () => {
        /* Gesetzter Fall: acht Listen wie bei Mega Excadrill. Kaeme in
           plurality_n oder naive_n je eine Zahl heraus, die groesser
           als die Listenzahl ist, wuerde der Text "x/y lists" eine
           Feldmehrheit behaupten. */
        const res = await MCB.build('Mega Excadrill');
        if (!res || !res.dataQuality || !res.dataQuality.sufficient) return;
        const n = res.dataQuality.n_lists;
        const treffer = (res.trace || [])
            .filter(t => t.decision === 'alternative_count_suggestion');
        for (const t of treffer) {
            assert.ok(t.plurality_n + t.naive_n <= n,
                `Mehrheitsdiagnose zaehlt ${t.plurality_n + t.naive_n} von ${n} Listen`);
            assert.ok(/lists\)/.test(String(t.detail || '')),
                'der Text nennt keine Listen: ' + t.detail);
            assert.ok(!/Field plurality/i.test(String(t.detail || '')),
                'der Text behauptet wieder eine Feldmehrheit: ' + t.detail);
        }
    });

    it('die Schwelle von 3 haengt an der Stichprobe, nicht am Feld', async () => {
        /* Die Zusage: ein Archetyp mit weniger als drei Listen wird
           abgelehnt, und die Ablehnung sagt dazu, dass es Tag-2-Listen
           sind. Welcher Archetyp das diese Woche ist, ist egal. */
        const zaehler = new Map();
        for (const r of PER) {
            const a = String(r.deck_archetype || '').trim();
            if (!a) continue;
            const k = a + '|' + String(r.tournament_id || '') + '|' + String(r.place || '');
            if (!zaehler.has(a)) zaehler.set(a, new Set());
            zaehler.get(a).add(k);
        }
        const duenn = [...zaehler.entries()].filter(([, v]) => v.size < 3).map(([a]) => a);
        if (duenn.length === 0) return;   // waere eine Verbesserung der Daten
        const res = await MCB.build(duenn[0]);
        assert.equal(res.dataQuality.sufficient, false,
            `${duenn[0]} hat unter drei Listen, wird aber gebaut`);
        assert.ok(/day-2/.test(res.dataQuality.warning),
            'die Ablehnung sagt nicht, dass es Tag-2-Listen sind: '
            + res.dataQuality.warning);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('Fehlt eine Zahl, wird sie NICHT geraten — gesetzter Fall', () => {
    /* Diese beiden Zusicherungen brauchen einen Fall, den die echten
       Daten gerade nicht hergeben: ein Turnier, das in KEINER Labs-Datei
       steht. Also wird genau eine Datei ersetzt — die Listen-CSV — und
       alle anderen bleiben echt. Ohne diesen Block rutschten im
       Mutationslauf zwei Aenderungen gruen durch, die im Ausfall eine
       Zahl erfinden (Notwert 1000 fuer das Feld, Notwert 797/32 in der
       Schnellreferenz). */

    const KOPF = 'tournament_id,limitless_tournament_id,tournament_name,tournament_date,'
               + 'meta,place,player_name,deck_archetype,deck_slug,wins,losses,ties,'
               + 'card_name,card_identifier,set_code,set_number,count,type,is_ace_spec,'
               + 'quelle,druck_quelle,scraped_at';
    function zeile(platz, spieler, karte, anzahl) {
        return `9999,,Testturnier ohne Labs-Zeile,2026-09-01,TEF-PBL,${platz},${spieler},`
             + `Testarchetyp,1,3,1,0,${karte},${karte}-x,TST,1,${anzahl},Pokemon,No,papier,,`;
    }
    const ERSATZ_CSV = [KOPF,
        zeile(1, 'A', 'Testkarte', 4), zeile(1, 'A', 'Zweitkarte', 2),
        zeile(2, 'B', 'Testkarte', 4), zeile(2, 'B', 'Zweitkarte', 2),
        zeile(3, 'C', 'Testkarte', 4), zeile(3, 'C', 'Zweitkarte', 2),
        zeile(4, 'D', 'Testkarte', 4), zeile(4, 'D', 'Zweitkarte', 2),
    ].join('\n');

    let dq;
    before(async () => {
        const g = ladeMotor({ 'tournament_decklists_per_player.csv': ERSATZ_CSV });
        const m = g.MostConsistencyBuilder;
        await m.loadData();
        const res = await m.build('Testarchetyp');
        dq = res.dataQuality;
        // Vorpruefung: der gesetzte Fall greift ueberhaupt.
        assert.equal(dq.n_lists, 4,
            'der Ersatzbestand liefert nicht die vier gesetzten Listen');
    });

    it('kennt das Turnier keine Labs-Zeile, bleiben BEIDE Zahlen leer', () => {
        assert.equal(dq.feldgroesse, null,
            `Feldgroesse ${dq.feldgroesse} fuer ein Turnier ohne Labs-Zeile — `
            + 'das ist eine erfundene Zahl');
        assert.equal(dq.n_piloten, null,
            `Pilotenzahl ${dq.n_piloten} fuer einen Archetyp ohne Labs-Zeile`);
    });

    it('der Satz nennt dann nur die Listenzahl und das Wort Tag 2', () => {
        assert.equal(MCB.datenbasisSatz(dq, 'de'), '4 Tag-2-Listen');
        const h = MCB.datenbasisHinweis(dq, 'de');
        assert.ok(/Tag 2/.test(h), 'Tag 2 fehlt im Hinweis');
        assert.ok(!/\d/.test(h.replace(/Tag 2/g, '')),
            'im Hinweis steht eine Zahl, die es nicht gibt: ' + h);
    });

    it('ohne Motor rät die Major-Kachel keine Feldgroesse', () => {
        // Genau der Ausfall, den die Kachel abfangen muss: das
        // Builder-Modul ist nicht geladen. Dann darf dort das Wort
        // Tag 2 stehen — aber keine Zahl.
        const g = {
            console, setTimeout, Papa,
            getLang: () => 'de',
            parseLocaleNumber: (x) => Number(x) || 0,
        };
        g.window = g; g.globalThis = g;
        vm.createContext(g);
        zahlKommaEinsetzen(g);
        vm.runInContext(
            fs.readFileSync(path.join(WURZEL, 'js', 'current-meta-quickref.js'), 'utf8'),
            g, { filename: 'current-meta-quickref.js' });
        const html = g._currentMetaQuickRefInternals._renderRefHeader({
            tournament_id: '0071', deck_archetype: 'Mega Excadrill',
            tournament_name: 'Worlds', tournament_date: '2026-08-28',
            place: 37, player_name: 'X', wins: 0, losses: 0, ties: 0,
            cards: [{ name: 'Test', count: 4 }],
        }, 'major');
        const sub = html.match(/past-meta-best-sub[^>]*>([^<]*)</)[1];
        assert.ok(/Tag-2-Liste/.test(sub), 'Tag 2 fehlt: ' + sub);
        assert.ok(!/Feld|Piloten/.test(sub),
            'ohne Motor steht dort eine erfundene Zahl: ' + sub);
    });
});

// ════════════════════════════════════════════════════════════════════
describe('Die Mehrheitsdiagnose nennt Listen, nicht das Feld', () => {
    /* Die Diagnose feuert bei den heutigen Daten nicht (Mutation 18 kam
       deshalb gruen durch: es entstand gar kein trace-Eintrag). Ihr
       Text ist trotzdem eine Aussage, die auf dem Schirm landen kann,
       sobald sie feuert. Also wird die Textvorlage AUS DER DATEI
       GESCHNITTEN und mit gesetzten Werten ausgefuehrt — beide
       Vorkommen, denn es gibt sie fuer Core- und fuer Tech-Karten. */
    const QUELLE = fs.readFileSync(
        path.join(WURZEL, 'js', 'deck-builder-consistency.js'), 'utf8');

    const GESETZT = {
        plurality_n: 5, naive_n: 3, suggested_count: 3,
        placement_gap: 60, plurality_median: 40, naive_median: 100,
    };

    it('beide Textvorlagen sprechen von Tag-2-Listen', () => {
        const vorlagen = [];
        const marke = 'detail: `';
        let i = QUELLE.indexOf(marke);
        while (i > -1) {
            const ende = QUELLE.indexOf('`,\n', i);
            if (ende > i && /plurality_n/.test(QUELLE.slice(i, ende))) {
                vorlagen.push(QUELLE.slice(i + marke.length - 1, ende + 1));
            }
            i = QUELLE.indexOf(marke, i + 1);
        }
        assert.equal(vorlagen.length, 2,
            `Vorpruefung: zwei Textvorlagen erwartet, ${vorlagen.length} gefunden — `
            + 'ohne sie prueft diese Zusicherung nichts');
        for (const v of vorlagen) {
            // Die zwei Vorlagen nennen die aktuell gebaute Kopienzahl
            // unterschiedlich (`copies` im Core-, `placed` im Tech-Zweig).
            const f = new Function('altSuggestion', 'copies', 'placed',
                'return ' + v + ';');
            const txt = f(GESETZT, 4, 4);
            assert.ok(/lists\)/.test(txt), 'der Text nennt keine Listen: ' + txt);
            assert.ok(!/[Ff]ield plurality/.test(txt),
                'der Text behauptet eine MEHRHEIT DES FELDES. Gerechnet wird sie '
                + 'ueber _perListCounts, also ueber die veroeffentlichten '
                + 'Tag-2-Listen — bei Mega Excadrill 8 Listen von 32 Piloten. '
                + 'Text: ' + txt);
            assert.ok(/[Dd]ay-2/.test(txt),
                'der Text sagt nicht, dass es Tag-2-Listen sind: ' + txt);
        }
    });

    it('der Quelltext behauptet nirgends mehr eine Feldmehrheit', () => {
        assert.equal((QUELLE.match(/[Ff]ield plurality/g) || []).length, 0,
            'irgendwo steht wieder "field plurality" — die Mehrheit ist die '
            + 'der ausgewerteten Listen, und die sind der Tag-2-Cut');
    });
});
