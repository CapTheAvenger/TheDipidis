/* SC-51 (10.11.2026): Ein Format, das erst Tage alt ist, hat noch kaum
   Daten — keine Majors, wenige Paarungen, kein Meta-Play!-Turnier. Vier
   Zusicherungen pruefen "der Bestand ist dick genug, sonst prueft der
   Rest nichts". Direkt nach einem Setwechsel ist das keine Panne, sondern
   der Kalender; seit SC-50 machte es den Data Guardian rot (Wochenlauf
   #201 → Guardian 10.11.).

   Regel: in den ersten FRIST_TAGE Tagen nach `set_release_date` aus
   data/format_window.json werden genau diese Duenne-Pruefungen
   UEBERSPRUNGEN, mit Grund und Enddatum im Testprotokoll ("# SKIP").
   Danach greifen sie wieder voll — kommt bis dahin nichts, ist es ein
   echter Befund. 28 Tage: In-Person-Legalitaet ist der zweite Freitag
   nach Erscheinen (~14 Tage), die ersten Majors folgen danach. */
const fs = require('node:fs');
const path = require('node:path');

const FRIST_TAGE = 28;

function jungesFormat(wurzel, heute = new Date()) {
    const fw = JSON.parse(fs.readFileSync(path.join(wurzel, 'data', 'format_window.json'), 'utf8'));
    const rel = fw.set_release_date;
    if (!rel || !/^\d{4}-\d{2}-\d{2}$/.test(rel)) {
        return { jung: false, grund: 'kein set_release_date in format_window.json' };
    }
    const tage = Math.floor((Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate())
        - Date.parse(rel + 'T00:00:00Z')) / 86400000);
    const ende = new Date(Date.parse(rel + 'T00:00:00Z') + FRIST_TAGE * 86400000).toISOString().slice(0, 10);
    const jung = tage >= 0 && tage < FRIST_TAGE;
    return {
        jung, tage, ende, set: fw.current_set,
        grund: `Format ${fw.oldest_legal_set}-${fw.current_set} ist ${tage} Tag(e) alt `
            + `(erschienen ${rel}) — Duenne-Pruefung ausgesetzt bis ${ende} (SC-51)`,
    };
}

module.exports = { jungesFormat, FRIST_TAGE };
