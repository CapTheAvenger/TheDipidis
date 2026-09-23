/**
 * EIN KOMMENTAR, DER EINE MESSUNG BEHAUPTET, IST EINE QUELLENANGABE —
 * ABER EINE FELDQUOTE IST KEINE KONSTANTE.
 *
 * BEFUND 1 (07.09.2026). In js/app-meta-call.js stand an zwei Stellen
 * "10,95 % (gemessen in data/labs_tournament_matchups_TEF-PBL.csv,
 * 6.121 Partien)". Nachgemessen ergab dieselbe Auswahl 11,05 % aus
 * 6.192 Partien. Die Dateien waren gewachsen, die Saetze nicht.
 * Behoben, indem die Zahl aus der Prosa in die Konstante
 * BELEGTE_FELDQUOTEN wanderte — und diese Datei sie gegen die Datei
 * nachrechnete.
 *
 * BEFUND 2 (22.09.2026) — DIE REPARATUR WAR DIE FALSCHE FORM.
 * Der Wochenlauf schrieb 13,75 % in dieselbe Datei. Die Zusicherung
 * schlug an, `test` fiel um, `build` und `deploy` wurden uebersprungen,
 * die Seite hing auf dem Vortag. Kaputt war nichts.
 *
 * Ein Sollwert mit Toleranzband verlangt, dass ein Mensch ihn
 * woechentlich nachzieht — und der Deploy steht so lange. Das ist
 * dieselbe Sorte Stillstand wie am 11., 12. und 13.09.2026, und
 * dieselbe Lehre: **die Frage ist nicht, ob die Zahl stimmt, sondern
 * welche Richtung ein Fehler ist.**
 *
 * WAS DIESE DATEI SEITDEM PRUEFT — beides ohne Wochenwert:
 *
 * 1. Das VERHAELTNIS. Auf Papier wird um mindestens den Faktor 3
 *    haeufiger unentschieden gespielt als online. Das ist die Aussage,
 *    auf der die Umstellung der Tag-2-Rechnung beruht, und sie ist eine
 *    Eigenschaft der beiden Spielformen — auf Papier laeuft die Zeit
 *    ab, online nicht.
 * 2. KEIN VERLUST. Die Partienzahl darf wachsen, aber nicht unter den
 *    in der Konstanten datierten Stand fallen. Ein leergelaufener
 *    Scraper faellt damit auf; Zuwachs weckt niemanden
 *    (CLAUDE.md, 12.09.2026).
 * 3. Dass die Konstante ueberhaupt noch dasteht und auf existierende
 *    Dateien zeigt — sonst stuenden die Quellenangaben wieder nur als
 *    Prosa im Kommentar, und Befund 1 waere zurueck.
 *
 * Gerechnet wird mit der Quote AUS DER DATEI (siehe `aggUnentschieden`
 * und `_unentschiedenQuote`), nie mit einer Zahl aus dem Quelltext.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const MC = lies('js', 'app-meta-call.js');

/** BELEGTE_FELDQUOTEN aus der Quelle schneiden und WIRKLICH auswerten. */
function ladeBelege() {
    const anfang = MC.indexOf('const BELEGTE_FELDQUOTEN = {');
    assert.ok(anfang >= 0,
        'BELEGTE_FELDQUOTEN ist aus js/app-meta-call.js verschwunden — dann '
        + 'stehen die gemessenen Feldquoten wieder nur als Prosa im Kommentar');
    const ende = MC.indexOf('\n  };', anfang);
    assert.ok(ende > anfang, 'BELEGTE_FELDQUOTEN hat kein Ende');
    const stueck = MC.slice(anfang, ende + 5);
    return new Function(stueck + ' return BELEGTE_FELDQUOTEN;')();
}
const FENSTER = require('../formatfenster.js');
const BELEGE = ladeBelege();

function csv(datei, trenner) {
    const text = lies(...datei.split('/')).replace(/\r/g, '').replace(/^﻿/, '');
    const teile = (z) => {
        const out = []; let cur = ''; let q = false;
        for (let i = 0; i < z.length; i++) {
            const c = z[i];
            if (c === '"') { q = !q; continue; }
            if (c === trenner && !q) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur); return out;
    };
    const raw = text.split('\n').filter((z) => z.trim() !== '');
    const kopf = teile(raw[0]).map((h) => h.trim().replace(/^﻿/, ''));
    return raw.slice(1).map((z) => {
        const v = teile(z); const o = {};
        kopf.forEach((h, i) => { o[h] = (v[i] || '').trim(); });
        return o;
    });
}
const ganz = (v) => {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
};

/* Die Partienzahl darf sich zwischen zwei Wochenlaeufen bewegen; der
   ANTEIL soll es nur im Rahmen der Toleranz, die im Code selbst
   dranstehen muss. Fuer den Nenner reicht ein weites Band: er faellt
   nur, wenn eine Datei leerlaeuft oder sich verdoppelt. */
const PARTIEN_BAND = 0.30;

/** Die Praesenzquote — genau die Auswahl, die auch aggUnentschieden trifft. */
function messePraesenz(datei) {
    let s = 0, n = 0, u = 0, zeilen = 0;
    for (const r of csv(datei, ',')) {
        if ((r.day_filter || '').trim().toLowerCase() !== 'overall') continue;
        const vs = ganz(r.vs_wins), vn = ganz(r.vs_losses), vu = ganz(r.vs_ties);
        if (vs == null || vn == null) continue;
        s += vs; n += vn; u += (vu || 0); zeilen++;
    }
    return { s, n, u, zeilen, partien: s + n + u };
}

/** Die Online-Quote — Summe ueber alle Deckzeilen der Uebersicht. */
function messeOnline(datei) {
    let s = 0, n = 0, u = 0, zeilen = 0;
    for (const r of csv(datei, ';')) {
        const a = ganz(r.wins), b = ganz(r.losses), c = ganz(r.ties);
        if (a == null || b == null) continue;
        s += a; n += b; u += (c || 0); zeilen++;
    }
    return { s, n, u, zeilen, partien: s + n + u };
}

describe('Die im Code genannten Feldquoten stehen so in den Dateien', () => {

    it('BELEGTE_FELDQUOTEN ist vollstaendig und selbsterklaerend', () => {
        assert.deepStrictEqual(Object.keys(BELEGE).sort(),
            ['unentschiedenOnline', 'unentschiedenPraesenz']);
        for (const [k, e] of Object.entries(BELEGE)) {
            /* `anteilPz` und `toleranzPp` sind am 22.09.2026 entfallen —
               siehe Befund 2 im Kopf. Was bleibt, ist die
               Quellenangabe plus eine datierte Untergrenze. */
            for (const feld of ['was', 'datei', 'auswahl', 'fenster', 'mindestensPartien', 'gemessenAm']) {
                assert.ok(e[feld] != null && e[feld] !== '',
                    `${k}: das Feld ${feld} fehlt — ohne es ist der Beleg nicht nachpruefbar`);
            }
            assert.ok(fs.existsSync(path.join(WURZEL, ...e.datei.split('/'))),
                `${k} zeigt auf eine Datei, die es nicht gibt: ${e.datei}`);
        }
    });

    it('kein Wochenwert steht mehr in der Konstanten', () => {
        /* Die Verfaelschungsprobe zu Befund 2: wer den Sollwert
           zurueckbaut, bekommt Rot — sonst waere der Stillstand vom
           22.09.2026 in vier Wochen wieder da, und der naechste
           Durchgang haette nur die Zahl hochgesetzt. */
        for (const [k, e] of Object.entries(BELEGE)) {
            for (const verboten of ['anteilPz', 'toleranzPp', 'partien', 'stand']) {
                assert.ok(!(verboten in e),
                    `${k}: das Feld ${verboten} ist zurueck. Eine Feldquote waechst `
                    + 'mit jedem Turnier — ein Sollwert dafuer haelt den Deploy an, '
                    + 'ohne dass etwas kaputt ist (Befund 22.09.2026).');
            }
        }
    });

    it('die Partienzahl waechst — und faellt nicht unter den datierten Stand', () => {
        /* DIE RICHTUNG IST DIE AUSSAGE. Zuwachs ist der Normalfall und
           weckt niemanden; ein Rueckgang heisst, dass eine Datei
           leergelaufen ist oder eine Auswahl nicht mehr trifft — und
           genau dann ist die Quellenangabe wertlos. */
        const faelle = [
            ['unentschiedenPraesenz', messePraesenz],
            ['unentschiedenOnline', messeOnline],
        ];
        for (const [k, messe] of faelle) {
            const e = BELEGE[k];
            const m = messe(e.datei);
            assert.ok(m.partien > 0,
                `${e.datei} liefert keine einzige Bilanzzeile — die Auswahl `
                + `"${e.auswahl}" trifft nichts mehr`);
            /* ABER NUR IM SELBEN FENSTER (23.09.2026). Rotiert das
               Format, faengt die Zaehlung von vorn an — das ist kein
               Verlust. Am 16.09.2026 ist auf 30C rotiert, und der
               Online-Bestand fiel im Wochenlauf #147 von 236.128 auf
               22.671 Partien, ohne dass irgendetwas kaputt war.

               Welcher Fall vorliegt, steht im Dateinamen: wer sein
               Format selbst nennt, rotiert nicht. */
            if (!FENSTER.belegGiltNoch(e)) {
                const f = FENSTER.fenster();
                console.log(`    # ${k}: Beleg aus dem Fenster ${e.fenster}, `
                    + `es laeuft ${f.schluessel} — Untergrenze ausgesetzt, `
                    + `gemessen sind jetzt ${m.partien} Partien aus ${m.zeilen} Zeilen`);
                /* NICHT lautlos durchwinken: leergelaufen ist auch nach
                   einer Rotation ein Fehler. Die Zeile oben hat bereits
                   `partien > 0` verlangt; hier kommt die Zeilenzahl dazu,
                   weil eine Datei mit einer Handvoll Zeilen keine
                   Quellenangabe mehr traegt. */
                assert.ok(m.zeilen >= 20,
                    `${e.datei}: nach der Rotation auf ${f.schluessel} stehen nur `
                    + `noch ${m.zeilen} Zeilen — das ist kein neues Fenster mehr, `
                    + 'sondern eine leergelaufene Datei');
                continue;
            }
            assert.ok(m.partien >= e.mindestensPartien,
                `${e.datei}: ${m.partien} Partien aus ${m.zeilen} Zeilen, am `
                + `${e.gemessenAm} waren es ${e.mindestensPartien}. Ein Verlust ist `
                + 'hier immer ein Fehler — die Datei sammelt Turniere, sie gibt '
                + 'keine zurueck.');
        }
    });

    it('die beiden Felder unterscheiden sich wirklich um ein Vielfaches', () => {
        /* Ohne diese Probe koennte die ganze Umstellung der Tag-2-Rechnung
           leer bestehen: waeren die Quoten gleich, aenderte sie nichts.
           Das Verhaeltnis ist eine Eigenschaft der beiden Spielformen
           (auf Papier laeuft die Zeit ab, online nicht), kein Wochenwert. */
        const p = messePraesenz(BELEGE.unentschiedenPraesenz.datei);
        const o = messeOnline(BELEGE.unentschiedenOnline.datei);
        const qP = p.u / p.partien;
        const qO = o.u / o.partien;
        assert.ok(qO > 0, 'online gibt es gar keine Unentschieden mehr');
        const VERHAELTNIS_MIN = 3;
        assert.ok(qP / qO >= VERHAELTNIS_MIN,
            `Papier ${(qP * 100).toFixed(2)} % gegen Online ${(qO * 100).toFixed(2)} % — `
            + 'nur noch Faktor ' + (qP / qO).toFixed(1));
    });

    it('die veralteten Zahlen stehen nur noch als Zitat da', () => {
        /* 6.121 und 174.954 duerfen im Text vorkommen — als das, was
           frueher dastand. Sie duerfen nur nicht mehr als aktuelle
           Messung ausgegeben werden. Geprueft wird das an der Konstanten,
           die der Code wirklich liest: dort darf keine der alten Zahlen
           stehen. */
        const alsText = JSON.stringify(BELEGE);
        for (const alt of ['6121', '174954', '10.95', '1.28', '15.3', '11.05', '1.29']) {
            assert.ok(!alsText.includes(alt),
                `die ueberholte Zahl ${alt} steht wieder in BELEGTE_FELDQUOTEN`);
        }
    });
});
