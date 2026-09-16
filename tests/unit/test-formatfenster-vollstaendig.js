/**
 * Das Formatfenster kommt VOLLSTÄNDIG in der Oberfläche an
 * =======================================================
 *
 * BEFUND 16.09.2026, live gefunden — von keinem Test:
 *
 *     > JSON.stringify(Object.keys(window._formatWindow))
 *     ["current_set","oldest_legal_set","current_set_jp"]
 *
 *     > await fetch('./data/format_window.json').then(r=>r.json())
 *     { current_set, oldest_legal_set, set_release_date,
 *       in_person_legal_date, lag_days, current_set_jp, jp_release_date,
 *       previous_format_key, set_addition_only,
 *       neuestes_set, neuestes_set_release_date, neues_set_filter_ab }
 *
 * DREI von ZWÖLF. Der Grund ist der Schnappschuss in index.html: er
 * wird von `bump-version.sh` und vom Deploy-Schritt „Cache-bust" mit
 * drei EINZELNEN sed-Zeilen fortgeschrieben, eine je Feldname. Wer ein
 * Feld ergänzt, muss es an drei Stellen eintragen — und merkt es nicht,
 * wenn er es vergisst, weil nichts rot wird.
 *
 * Genau das war am selben Tag passiert: `neuestes_set` und
 * `neues_set_filter_ab` standen in der Datei, der Filter „Neues Set"
 * fiel trotzdem still auf `current_set` zurück.
 *
 * Der Schnappschuss bleibt (er ist synchron da, bevor ein Modul läuft).
 * Neu ist, dass die Datei darübergelegt wird, sobald sie geladen ist.
 *
 * VERFÄLSCHUNGSPROBE (16.09.2026, jede einzeln):
 *   Object.assign -> Zuweisung nur der drei Felder : „alles kommt an" fällt um
 *   Eintrag in app-init.js entfernt                : „der Ladeschritt läuft" fällt um
 *   Fehlerzweig ohne Schnappschuss                 : „der Schnappschuss überlebt" fällt um
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const ohneKommentare = (s) => {
    const heraus = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    assert.ok(heraus.length > s.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    return heraus;
};

const CORE = lies('js/app-core.js');
const INIT = ohneKommentare(lies('js/app-init.js'));

/** Die Ladefunktion wörtlich aus der Quelle schneiden und ausführen. */
function ladeFunktion(fetchAntwort, schnappschuss) {
    const a = CORE.indexOf('async function loadFormatWindow()');
    assert.ok(a > -1, 'loadFormatWindow() nicht gefunden');
    const b = CORE.indexOf('\n        async function loadSetOrderMap()', a);
    assert.ok(b > a, 'Endanker nicht gefunden');
    const kasten = {
        console: { warn() {} },
        Object, Date, JSON, Promise,
        window: { _formatWindow: schnappschuss },
        fetch: () => Promise.resolve(fetchAntwort),
    };
    kasten.globalThis = kasten;
    vm.createContext(kasten);
    vm.runInContext(CORE.slice(a, b) + '\nthis._lade = loadFormatWindow;', kasten);
    return kasten;
}

const SCHNAPPSCHUSS = { current_set: 'PBL', oldest_legal_set: 'TEF', current_set_jp: 'M6' };
const DATEI = {
    current_set: 'PBL', oldest_legal_set: 'TEF', set_release_date: '2026-07-17',
    in_person_legal_date: '2026-07-31', lag_days: 14, current_set_jp: 'M6',
    jp_release_date: '2026-07-31', previous_format_key: 'TEF-CRI', set_addition_only: true,
    neuestes_set: 'PBL', neuestes_set_release_date: '2026-07-17',
    neues_set_filter_ab: '2026-07-18',
};

describe('Der Ladeschritt legt die Datei über den Schnappschuss', () => {
    it('alle Felder der Datei kommen an, nicht nur die drei des Schnappschusses', async () => {
        const k = ladeFunktion({ ok: true, json: () => Promise.resolve(DATEI) },
            Object.assign({}, SCHNAPPSCHUSS));
        await k._lade();
        Object.keys(DATEI).forEach(feld => {
            assert.deepEqual(k.window._formatWindow[feld], DATEI[feld],
                `${feld} ist nicht angekommen — der Befund vom 16.09.2026`);
        });
        assert.ok(Object.keys(k.window._formatWindow).length >= Object.keys(DATEI).length,
            'es kommen weniger Felder an, als die Datei führt');
    });

    it('fällt der Abruf aus, bleibt der Schnappschuss stehen', async () => {
        /* Lieber drei richtige Felder als gar keine: getCurrentMetaFormat()
           in index.html baut den Formatschlüssel daraus. */
        const k = ladeFunktion({ ok: false }, Object.assign({}, SCHNAPPSCHUSS));
        await k._lade();
        assert.deepEqual(k.window._formatWindow, SCHNAPPSCHUSS);
    });

    it('eine kaputte Antwort wirft den Schnappschuss nicht weg', async () => {
        const k = ladeFunktion({ ok: true, json: () => Promise.reject(new Error('kaputt')) },
            Object.assign({}, SCHNAPPSCHUSS));
        await k._lade();
        assert.deepEqual(k.window._formatWindow, SCHNAPPSCHUSS);
    });

    it('der Ladeschritt steht in der Startliste', async () => {
        assert.ok(/loadFormatWindow\(\)/.test(INIT),
            'app-init.js ruft loadFormatWindow() nicht — die Funktion liefe nie');
        assert.ok(/key:\s*'format_window'/.test(INIT),
            'der Schritt trägt keinen Schlüssel und taucht in keiner Fehlermeldung auf');
    });
});

describe('Der Schnappschuss selbst', () => {
    const HTML = lies('index.html');

    it('index.html trägt weiterhin die drei synchron nötigen Felder', () => {
        /* Sie stehen VOR jedem Modul und tragen getCurrentMetaFormat().
           Verschwinden sie, greift der Formatschlüssel ins Leere, bevor
           der Ladeschritt oben überhaupt anläuft. */
        ['current_set', 'oldest_legal_set', 'current_set_jp'].forEach(feld => {
            assert.ok(new RegExp(feld + ":\\s*'[A-Z0-9-]+'").test(HTML),
                `${feld} fehlt im Schnappschuss von index.html`);
        });
    });

    it('der Schnappschuss nennt die Datei als eigentliche Quelle', () => {
        const stelle = HTML.indexOf('window._formatWindow = {');
        assert.ok(stelle > -1);
        const umfeld = HTML.slice(Math.max(0, stelle - 900), stelle);
        assert.ok(/format_window\.json/.test(umfeld),
            'Ohne diesen Hinweis liest der nächste den Schnappschuss als Quelle der Wahrheit.');
    });
});
