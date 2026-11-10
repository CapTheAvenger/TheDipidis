/* SC-51 (10.11.2026): Ein Format, das erst Tage alt ist, hat noch kaum
   Daten — keine Majors, wenige Paarungen, kein Meta-Play!-Turnier. Vier
   Zusicherungen pruefen "der Bestand ist dick genug, sonst prueft der
   Rest nichts". Direkt nach einem Setwechsel ist das keine Panne, sondern
   der Kalender; seit SC-50 machte es den Data Guardian rot (Wochenlauf
   #201 → Guardian 10.11.).

   Regel: solange der DATENSTAND (data/data_stand.json `erzeugt_am`)
   weniger als FRIST_TAGE Tage nach `set_release_date` liegt, werden genau
   diese Duenne-Pruefungen UEBERSPRUNGEN, mit Grund und Enddatum im
   Testprotokoll ("# SKIP"). Danach greifen sie wieder voll — kommt bis
   dahin nichts, ist es ein echter Befund. 28 Tage: In-Person-Legalitaet
   ist der zweite Freitag nach Erscheinen (~14 Tage), die ersten Majors
   folgen danach.

   WARUM DER DATENSTAND UND NICHT DIE UHR: gemessen wird, ob die DATEN
   dick sein koennen. Im Alltag ist das dasselbe (data_stand.json wird
   jeden Lauf fortgeschrieben). In der Setwechsel-Probe nicht: dort steht
   ein erfundenes Set neben den eingefrorenen Daten von heute, und mit
   faketime "30 Tage spaeter" waere es nach der Uhr alt, obwohl die Daten
   keinen Tag davon enthalten. Liegt der Datenstand VOR dem Erscheinen,
   kann er das Set gar nicht enthalten — das gilt ebenfalls als jung. */
const fs = require('node:fs');
const path = require('node:path');

const FRIST_TAGE = 28;
const TAG = 86400000;

function stichtagAus(wurzel) {
    try {
        const ds = JSON.parse(fs.readFileSync(path.join(wurzel, 'data', 'data_stand.json'), 'utf8'));
        const t = Date.parse(ds.erzeugt_am);
        if (isFinite(t)) return { zeit: t, quelle: 'Datenstand' };
    } catch (e) { /* keine Datei: Uhr */ }
    return { zeit: Date.now(), quelle: 'heute' };
}

function jungesFormat(wurzel, stichtag) {
    const fw = JSON.parse(fs.readFileSync(path.join(wurzel, 'data', 'format_window.json'), 'utf8'));
    const rel = fw.set_release_date;
    if (!rel || !/^\d{4}-\d{2}-\d{2}$/.test(rel)) {
        return { jung: false, grund: 'kein set_release_date in format_window.json' };
    }
    const st = stichtag ? { zeit: stichtag.getTime(), quelle: 'Stichtag' } : stichtagAus(wurzel);
    const d = new Date(st.zeit);
    const tage = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
        - Date.parse(rel + 'T00:00:00Z')) / TAG);
    const ende = new Date(Date.parse(rel + 'T00:00:00Z') + FRIST_TAGE * TAG).toISOString().slice(0, 10);
    const jung = tage < FRIST_TAGE;
    const alter = tage < 0 ? `${st.quelle} liegt ${-tage} Tag(e) VOR dem Erscheinen`
        : `${tage} Tag(e) alt (${st.quelle})`;
    return {
        jung, tage, ende, set: fw.current_set,
        grund: `Format ${fw.oldest_legal_set}-${fw.current_set} ist ${alter}, erschienen ${rel} `
            + `— Duenne-Pruefung ausgesetzt bis ${ende} (SC-51)`,
    };
}

module.exports = { jungesFormat, FRIST_TAGE };
