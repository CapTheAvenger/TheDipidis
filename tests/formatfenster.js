/* Das laufende Formatfenster — und wie alt es ist.
 *
 * BEFUND 23.09.2026 (Wochenlauf #147). Am 16.09.2026 ist das Standardformat
 * auf 30C rotiert. Der Online-Scraper haengt an jede Anfrage
 * `?set=<current_set>`, holt also seither nur noch Partien SEIT dem neuen
 * Set: 22.671 statt 236.128, 847 statt 1.794 Matchup-Zeilen — bei fast
 * unveraenderter Archetypenliste (107 statt 139 Zeilen).
 *
 * Acht Zusicherungen nagelten genau diese Bestandsgroessen fest ("ein
 * Verlust ist hier immer ein Fehler", "mindestens 1.287 Zeilen"). Sie
 * hatten recht fuer EIN Fenster und mussten bei der Rotation umfallen. Der
 * Wochenlauf hat deshalb nichts gepusht — richtig so, aber er bleibt rot,
 * bis die Belege wissen, zu welchem Fenster sie gehoeren.
 *
 * DIE REGEL: Ein Bestandswert gilt fuer EIN Formatfenster. Wechselt das
 * Fenster, faengt die Zaehlung von vorn an — das ist kein Verlust.
 * Innerhalb eines Fensters gilt weiter: verloren ist ein Fehler, Zuwachs
 * nicht.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');

function fenster() {
    const roh = JSON.parse(
        fs.readFileSync(path.join(WURZEL, 'data', 'format_window.json'), 'utf8'));
    const alt = String(roh.oldest_legal_set || '').trim();
    const neu = String(roh.current_set || '').trim();
    if (!alt || !neu) {
        throw new Error('format_window.json fuehrt kein oldest_legal_set/current_set '
            + '— ohne beides laesst sich kein Fenster benennen');
    }
    const start = String(roh.set_release_date || '').trim();
    const tage = start
        ? (Date.now() - Date.parse(start + 'T00:00:00Z')) / 86400000
        : null;
    return {
        schluessel: `${alt}-${neu}`,        // z. B. "TEF-30C"
        vorher: String(roh.previous_format_key || '').trim() || null,
        start,
        tage,
    };
}

/* Wie lange ein Fenster als JUNG gilt. Gemessen, nicht geraten: der
 * Online-Bestand des Vorformats stand am 22.09.2026 bei 236.128 Partien
 * aus acht Wochen, das neue Fenster am 23.09.2026 bei 22.671 aus einer.
 * Ein Fenster, das noch waechst wie ein junges, darf keine Obergrenze
 * tragen — sonst faellt der Test an dem Tag um, an dem die Daten gut
 * werden. Drei Wochen decken den Zuwachs ab und sind kurz genug, dass ein
 * veralteter Beleg nicht monatelang unbemerkt bleibt. */
const JUNG_TAGE = 21;

function istJung() {
    const f = fenster();
    return f.tage == null ? false : f.tage < JUNG_TAGE;
}

/** Gilt ein datierter Bestandsbeleg noch?
 *
 *  ZWEI Faelle, und der Unterschied steht in der Datei selbst:
 *
 *  1. Die Datei traegt ihr Format IM NAMEN
 *     (labs_tournament_matchups_TEF-PBL.csv). Sie rotiert nicht — bei der
 *     naechsten Rotation entsteht eine NEUE Datei daneben, und diese hier
 *     behaelt ihren Bestand fuer immer. Der Beleg gilt weiter.
 *  2. Die Datei traegt keinen Formatnamen (limitless_online_decks.csv).
 *     Sie wird bei jeder Rotation neu gefuellt. Der Beleg gilt nur fuer
 *     das Fenster, unter dem er gemessen wurde.
 */
function belegGiltNoch(beleg) {
    const b = beleg && beleg.fenster ? String(beleg.fenster).trim() : '';
    if (!b) return true;
    const datei = String((beleg && beleg.datei) || '');
    if (datei.includes(b)) return true;     // Fall 1: Format steht im Dateinamen
    return b === fenster().schluessel;      // Fall 2
}

/** Wie ein Bestandsbeleg zum laufenden Fenster steht.
 *
 *   'gilt'        — derselbe Fenster (oder Datei mit Format im Namen):
 *                   die Untergrenze wird angewandt wie bisher.
 *   'jung'        — rotiert, und das neue Fenster ist keine drei Wochen
 *                   alt: die Untergrenze wird AUSGESETZT, weil die
 *                   Zaehlung von vorn beginnt. Der Test muss dann den
 *                   gemessenen Wert ausgeben, damit der naechste
 *                   Durchgang ihn eintragen kann, und eine weite
 *                   Bodengrenze pruefen — leergelaufen bleibt ein Fehler.
 *   'ueberfaellig'— rotiert, und das Fenster laeuft laenger als drei
 *                   Wochen: die Gnadenfrist ist um, der Beleg gehoert
 *                   nachgemessen. Der Test faellt um und sagt es.
 */
function rotationsLage(beleg) {
    if (belegGiltNoch(beleg)) return 'gilt';
    return istJung() ? 'jung' : 'ueberfaellig';
}

/** Der Satz, der bei 'ueberfaellig' im Fehler steht — an einer Stelle,
 *  damit alle Zusicherungen dasselbe sagen. */
function ueberfaelligText(beleg, gemessen) {
    const f = fenster();
    return `der Beleg wurde im Fenster ${beleg.fenster} gemessen, es laeuft `
        + `seit ${Math.round(f.tage)} Tagen ${f.schluessel}. Die Gnadenfrist von `
        + `${JUNG_TAGE} Tagen ist um: gemessen sind jetzt ${gemessen} — `
        + 'eintragen und das Fenster mitschreiben, nicht die Grenze senken.';
}

module.exports = {
    fenster, istJung, belegGiltNoch, rotationsLage, ueberfaelligText,
    JUNG_TAGE, WURZEL,
};
