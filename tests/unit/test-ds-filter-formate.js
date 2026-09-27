/**
 * Befund C2 / F16.3 — die Formatzeile ueber Past Meta, AUSGEFUEHRT.
 *
 * WAS DER LIVE-DURCHGANG (07.09.2026) GEMELDET HAT
 * ------------------------------------------------
 * „Past Meta zeigt zwei Formatauswahlen; oben->unten zieht mit,
 * unten->oben nicht."
 *
 * WAS HIER GEMESSEN WURDE
 * -----------------------
 * 1. Mit dem Markup aus index.html (Auswahlfeld in einer .control-group,
 *    Etikett daneben) VERDECKT ds-filter.js das Quellfeld korrekt:
 *    die Huelle bekommt .ds-filter-verdeckt, das Etikett ebenso,
 *    tabindex="-1" und aria-hidden="true" stehen am Feld. Und beide
 *    Richtungen spiegeln: Knopf/Kopie -> Quelle und Quelle -> Kopie.
 *    Zwei gleichzeitig sichtbare Auswahlfelder liessen sich SO NICHT
 *    nachstellen — das steht so im Bericht.
 *
 * 2. Reproduziert wurde dagegen der WIDERSPRUCH zwischen oben und
 *    unten. Die Zeile wird EINMAL aus den Optionen der Quelle gebaut.
 *    Past Meta fuellt seine sieben Formate erst nach dem Laden nach
 *    (js/app-past-meta.js), und ein Nachfuellen loest kein `change`
 *    aus. Gemessen, Stand vor der Korrektur:
 *
 *      1) direkt nach dem Laden  Knopfleiste mit 1 Knopf
 *                                "-- Alle Formate --"
 *      2) nach dem Nachfuellen   Knopfleiste mit 1 Knopf
 *                                "-- Alle Formate --",
 *                                waehrend die Quelle 7 Optionen fuehrt
 *
 *    Genau das ist "oben zeigt etwas anderes als unten". Gehalten hat
 *    das bisher ein einziges von Hand ausgeloestes `change`-Ereignis an
 *    genau einer Stelle — und das steht in einem `if`-Zweig.
 *
 * KEIN jsdom: der CI-Schritt installiert nur papaparse.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const L = require('./lib-dom-sandkasten.js');

const MARKUP = L.lies('index.html');
const FORMATE = ['SVI-PRE', 'TWM-PRE', 'SFA-PRE', 'SCR-PRE', 'SSP-PRE', 'PRE-PRE'];

/** Der Traeger der Kopier-Mechanik.
 *
 * Bis zum 27.09.2026 war das der Past-Meta-Reiter. Seit UI-33 steht das
 * Format dort in der Steuerung und wird NICHT mehr kopiert (eigene
 * Zusicherung unten). Die Mechanik — Huelle, Abgleich, Sperre ab fuenf
 * Optionen — gilt weiter fuer jeden Raum mit Kopie; geprueft wird sie
 * jetzt am Japan-Reiter mit sieben Optionen in einer Steuerungsgruppe. */
function umgebung(wahl) {
    wahl = wahl || {};
    const dok = L.dokument();
    const reiter = dok.neu('div', 'city-league');
    reiter.className = 'tab-content active fs-scale';
    const behaelter = dok.neu('div', null, reiter);
    behaelter.className = 'container';
    const kopf = dok.neu('div', null, behaelter);
    kopf.className = 'city-league-header';
    const steuer = dok.neu('div', null, behaelter);
    steuer.className = 'controls';
    const gruppe = dok.neu('div', null, steuer);
    gruppe.className = 'control-group';
    const etikett = dok.neu('label', null, gruppe);
    etikett.setAttribute('for', 'cityLeagueFormatSelect');
    etikett.textContent = 'Meta/Format Filter:';
    const quelle = dok.neu('select', 'cityLeagueFormatSelect', gruppe);
    quelle.className = 'control-input modern-select';

    const platzhalter = dok.createElement('option');
    platzhalter.value = 'all';
    platzhalter.textContent = '-- Alle Formate --';
    quelle.appendChild(platzhalter);
    if (!wahl.nurPlatzhalter) fuellen(dok, quelle);

    const uhren = [];
    const fenster = {
        document: dok, getLang: () => 'de',
        addEventListener() {}, switchTab() {}, switchTabAndUpdateMenu() {},
    };
    fenster.window = fenster;
    const ctx = {
        window: fenster, document: dok, console: { warn() {}, log() {} },
        setTimeout: (f) => { uhren.push(f); return uhren.length; },
        clearTimeout() {},
        Event: function (art, o) { return { type: art, bubbles: !!(o && o.bubbles) }; },
    };
    if (!wahl.ohneBeobachter) ctx.MutationObserver = L.BeobachterKlasse();
    vm.createContext(ctx);
    vm.runInContext(L.lies('js', 'ds-filter.js'), ctx, { filename: 'ds-filter.js' });

    return {
        dok, quelle, etikett, kopf, ctx, fenster,
        laufen() { let n = 0; while (uhren.length && n < 50) { uhren.shift()(); n++; } },
        zeile() { return kopf.parentElement.querySelector(':scope > .ds-filter'); },
        kopie() { const z = this.zeile(); return z ? z.querySelector('.ds-filter-select') : null; },
        knoepfe() {
            const z = this.zeile();
            if (!z) return [];
            return z.querySelectorAll('.ds-filter-btn')
                .filter(b => b.getAttribute('data-space') === null);
        },
    };
}

function fuellen(dok, quelle) {
    FORMATE.forEach(w => {
        const o = dok.createElement('option');
        o.value = w; o.textContent = w;
        quelle.appendChild(o);
    });
}

describe('C2 — das Markup, gegen das gemessen wird', () => {
    it('index.html fuehrt genau ein #pastMetaFormatFilter mit Etikett davor', () => {
        assert.equal((MARKUP.match(/id="pastMetaFormatFilter"/g) || []).length, 1);
        assert.ok(MARKUP.includes('<label for="pastMetaFormatFilter"'));
        assert.equal(MARKUP.includes('cl-format-container'), true,
            'die andere Verdeckungsvariante steht nicht mehr im Markup — dann stimmt der Kommentar in ds-filter.js nicht mehr');
    });
});

describe('C2 — das Quellfeld steht nicht doppelt da', () => {
    it('Huelle, Etikett, Tabulator und Screenreader sind alle abgeraeumt', () => {
        const u = umgebung({});
        const huelle = u.quelle.parentElement;
        assert.ok(huelle.classList.contains('ds-filter-huelle'),
            'das Quellfeld haengt in keiner Huelle');
        assert.ok(huelle.classList.contains('ds-filter-verdeckt'),
            'die Huelle ist nicht verdeckt — das Feld steht ein zweites Mal da');
        assert.ok(u.etikett.classList.contains('ds-filter-verdeckt'),
            '"Meta/Format Filter:" bleibt ueber einem Loch stehen');
        assert.equal(u.quelle.getAttribute('tabindex'), '-1');
        assert.equal(u.quelle.getAttribute('aria-hidden'), 'true');
    });

    it('mehrere Laeufe erzeugen keine zweite Zeile und keine zweite Huelle', () => {
        const u = umgebung({});
        u.ctx.window.DsFilter.zeichne();
        u.ctx.window.DsFilter.zeichne();
        assert.equal(u.kopf.parentElement.querySelectorAll('.ds-filter').length, 1);
        assert.equal(u.dok.querySelectorAll('.ds-filter-huelle').length, 1);
    });
});

describe('C2 — beide Richtungen ziehen mit', () => {
    it('oben -> unten: die Kopie setzt den Wert der Quelle', () => {
        const u = umgebung({});
        const kopie = u.kopie();
        assert.ok(kopie, 'bei sieben Formaten muss oben ein Auswahlfeld stehen, keine Knopfwand');
        kopie.value = 'TWM-PRE';
        kopie.dispatchEvent({ type: 'change' });
        u.laufen();
        assert.equal(u.quelle.value, 'TWM-PRE');
    });

    it('unten -> oben: die Quelle zieht die Kopie nach', () => {
        const u = umgebung({});
        u.quelle.value = 'SCR-PRE';
        u.quelle.dispatchEvent({ type: 'change' });
        u.laufen();
        assert.equal(u.kopie().value, 'SCR-PRE',
            'die Zeile oben zeigt weiter das alte Format');
    });
});

describe('C2 — nachgefuellte Formate erreichen die Zeile auch ohne change-Ereignis', () => {
    it('ohne Abgleich zeigt die Zeile den Platzhalter, die Quelle sieben Formate', () => {
        // Der gemessene Ausgangszustand, mit abgeschaltetem Beobachter.
        const u = umgebung({ nurPlatzhalter: true, ohneBeobachter: true });
        assert.equal(u.knoepfe().length, 1);
        assert.equal(u.knoepfe()[0].textContent, '-- Alle Formate --');
        fuellen(u.dok, u.quelle);
        u.laufen();
        assert.equal(u.quelle.options.length, 7);
        assert.equal(u.kopie(), null,
            'ohne Abgleich duerfte die Zeile die sieben Formate nicht kennen — die Messung ist ueberholt');
        assert.equal(u.knoepfe().length, 1, 'die Zeile hat sich ohne Abgleich veraendert');
    });

    it('abgleichen() zieht die Zeile nach', () => {
        const u = umgebung({ nurPlatzhalter: true, ohneBeobachter: true });
        fuellen(u.dok, u.quelle);
        assert.equal(u.ctx.window.DsFilter.abgleichen(), true,
            'abgleichen() hat den Unterschied nicht bemerkt');
        const kopie = u.kopie();
        assert.ok(kopie, 'nach dem Abgleich fehlt oben das Auswahlfeld');
        assert.equal(kopie.options.length, 7);
    });

    it('abgleichen() zeichnet NICHT neu, wenn sich nichts geaendert hat', () => {
        const u = umgebung({});
        const vorher = u.zeile();
        assert.equal(u.ctx.window.DsFilter.abgleichen(), false,
            'abgleichen() zeichnet ohne Anlass neu');
        assert.equal(u.zeile(), vorher, 'die Zeile wurde ohne Grund ersetzt');
    });

    it('der Beobachter erledigt es von selbst, ohne dass jemand Bescheid sagt', () => {
        const u = umgebung({ nurPlatzhalter: true });
        fuellen(u.dok, u.quelle);
        u.laufen();
        const kopie = u.kopie();
        assert.ok(kopie, 'der Beobachter hat das Nachfuellen nicht bemerkt');
        assert.equal(kopie.options.length, 7);
    });

    it('der Abdruck unterscheidet Optionsliste, aktive Wahl und Sperren', () => {
        const u = umgebung({});
        const raum = { key: 'jp', quelle: 'cityLeagueFormatSelect' };
        const a = u.ctx.window.DsFilter.abdruck(raum);
        u.quelle.value = 'SFA-PRE';
        const b = u.ctx.window.DsFilter.abdruck(raum);
        assert.notEqual(a, b, 'der Abdruck merkt die geaenderte Wahl nicht');
        u.quelle.options[3].disabled = true;
        const c = u.ctx.window.DsFilter.abdruck(raum);
        assert.notEqual(b, c, 'der Abdruck merkt eine Sperre nicht');
        const weg = u.quelle.options[6];
        u.quelle.removeChild(weg);
        const d = u.ctx.window.DsFilter.abdruck(raum);
        assert.notEqual(c, d, 'der Abdruck merkt eine entfernte Option nicht');
    });
});

describe('C2 — app-past-meta.js sagt der Zeile ausdruecklich Bescheid', () => {
    /* Ausgefuehrt, nicht gegriffen: eine Zusicherung auf den Quelltext
       ueberlebt ein `if (false)` um denselben Aufruf herum. Gemessen im
       Mutationslauf am 07.09.2026 — Mutation 20 blieb gruen, bis diese
       Probe den Block wirklich laufen liess. */
    function abgleichBlock() {
        const pm = L.lies('js', 'app-past-meta.js');
        const marke = pm.indexOf('BEFUND C2 (07.09.2026): das kuenstliche');
        assert.ok(marke > 0, 'der Abgleich-Block in app-past-meta.js ist nicht mehr auffindbar');
        const ab = pm.indexOf('if (', pm.indexOf('*/', marke));
        assert.ok(ab > marke, 'nach dem Kommentar folgt kein if-Block mehr');
        let tiefe = 0;
        for (let j = pm.indexOf('{', ab); j < pm.length; j++) {
            if (pm[j] === '{') tiefe++;
            else if (pm[j] === '}') { tiefe--; if (tiefe === 0) return pm.slice(ab, j + 1); }
        }
        assert.fail('die Klammern des Abgleich-Blocks gehen nicht auf');
    }

    it('nach dem Fuellen der Formatliste wird wirklich abgeglichen', () => {
        const gerufen = [];
        const ctx = {
            window: { DsFilter: { abgleichen: () => gerufen.push('abgleichen') } },
            devLog() {}, console,
        };
        vm.createContext(ctx);
        vm.runInContext(abgleichBlock(), ctx, { filename: 'app-past-meta-abgleich.js' });
        assert.deepEqual(gerufen, ['abgleichen'],
            'app-past-meta.js zieht die Formatzeile nicht mehr nach');
    });

    it('fehlt DsFilter, faellt nichts um', () => {
        const ctx = { window: {}, devLog() {}, console };
        vm.createContext(ctx);
        vm.runInContext(abgleichBlock(), ctx, { filename: 'app-past-meta-abgleich.js' });
    });

    it('wirft der Abgleich, wird es protokolliert statt verschluckt', () => {
        const protokoll = [];
        const ctx = {
            window: { DsFilter: { abgleichen: () => { throw new Error('kaputt'); } } },
            devLog: (...a) => protokoll.push(a.join(' ')), console,
        };
        vm.createContext(ctx);
        vm.runInContext(abgleichBlock(), ctx, { filename: 'app-past-meta-abgleich.js' });
        assert.equal(protokoll.length, 1, 'der Fehlschlag wurde stillschweigend verschluckt');
        assert.match(protokoll[0], /Formatzeile/);
    });
});

/* ══════════════════════════════════════════════════════════════════════
   BEFUND B8 (Pruefagent, 07.09.2026) — DER BEOBACHTER SAH NUR childList
   ══════════════════════════════════════════════════════════════════════
   Drei Wege liefen daneben, jeder einzeln gemessen (Aenderung -> alle
   Uhren abarbeiten -> Leiste unveraendert; danach abgleichen() von Hand
   -> korrekt):

     option.disabled = true + title   js/app-city-league.js:365-376
     select.value = …  per JavaScript js/app-city-league.js:299-300,
                                      js/app-init.js:75-80
     option.textContent               js/i18n.js:5395 (Sprachwechsel)

   Der Aufbau unten ist der City-League-Reiter, wie er in index.html
   steht: #cityLeagueFormatSelect mit zwei Optionen in einem
   .cl-format-container. Zwei Optionen heisst Knopfleiste, nicht
   Auswahlfeld — genau die Ansicht, in der die gesperrte Option
   anklickbar blieb.
   ════════════════════════════════════════════════════════════════════ */

function umgebungCityLeague() {
    const dok = L.dokument();
    const reiter = dok.neu('div', 'city-league');
    reiter.className = 'tab-content active';
    const behaelter = dok.neu('div', null, reiter);
    behaelter.className = 'city-league-container';
    const kopf = dok.neu('div', null, behaelter);
    kopf.className = 'city-league-header';
    const fbox = dok.neu('div', null, kopf);
    fbox.className = 'cl-format-container';
    const quelle = dok.neu('select', 'cityLeagueFormatSelect', fbox);
    quelle.className = 'cl-format-select';
    [['current', 'Aktuelles Meta'], ['past', 'Vergangenes Meta']].forEach(([w, txt]) => {
        const o = dok.createElement('option');
        o.value = w; o.textContent = txt;
        quelle.appendChild(o);
    });

    const uhren = [];
    const fenster = {
        document: dok, getLang: () => 'de',
        addEventListener() {}, switchTab() {}, switchTabAndUpdateMenu() {},
    };
    fenster.window = fenster;
    const ctx = {
        window: fenster, document: dok, console: { warn() {}, log() {} },
        setTimeout: (f) => { uhren.push(f); return uhren.length; },
        clearTimeout() {},
        MutationObserver: L.BeobachterKlasse(),
        Event: function (art, o) { return { type: art, bubbles: !!(o && o.bubbles) }; },
    };
    vm.createContext(ctx);
    vm.runInContext(L.lies('js', 'ds-filter.js'), ctx, { filename: 'ds-filter.js' });

    return {
        dok, quelle, kopf, ctx, fenster,
        /** Alle offenen Uhren abarbeiten — das tut der Browser von selbst. */
        laufen() { let n = 0; while (uhren.length && n < 50) { uhren.shift()(); n++; } },
        zeile() { return kopf.parentElement.querySelector(':scope > .ds-filter'); },
        knoepfe() {
            const z = this.zeile();
            if (!z) return [];
            return z.querySelectorAll('.ds-filter-btn')
                .filter(b => b.getAttribute('data-space') === null);
        },
        knopf(text) { return this.knoepfe().find(b => b.textContent === text) || null; },
    };
}

describe('B8 — eine gesperrte Option erreicht die Leiste ohne Ereignis', () => {
    it('Vorbedingung: zwei Optionen ergeben eine Knopfleiste, kein Auswahlfeld', () => {
        const u = umgebungCityLeague();
        assert.equal(u.knoepfe().length, 2);
        assert.equal(u.knoepfe()[0].disabled, false);
    });

    it('option.disabled = true + title erreicht die Leiste von selbst', () => {
        /* Der Weg aus js/app-city-league.js (_disableCurrent). */
        const u = umgebungCityLeague();
        const opt = u.quelle.options.find(o => o.value === 'current');
        opt.disabled = true;
        opt.title = 'Saisonpause — aktuelle Daten nicht verfügbar';
        u.laufen();

        const knopf = u.knopf('Aktuelles Meta');
        assert.ok(knopf, 'der Knopf ist verschwunden statt gesperrt zu werden');
        assert.equal(knopf.disabled, true,
            'die gesperrte Option bleibt oben anklickbar — genau der gemessene Befund');
        assert.equal(knopf.getAttribute('aria-disabled'), 'true');
        assert.match(knopf.title, /Saisonpause/,
            'der Grund der Sperre steht nicht am Knopf');
    });

    it('wechselt nur der GRUND, zieht die Leiste ebenfalls nach', () => {
        const u = umgebungCityLeague();
        const opt = u.quelle.options.find(o => o.value === 'current');
        opt.disabled = true;
        opt.title = 'Saisonpause';
        u.laufen();
        opt.title = 'Season pause';
        u.laufen();
        assert.equal(u.knopf('Aktuelles Meta').title, 'Season pause',
            'der Knopf traegt weiter den alten Grund');
    });

    it('select.value = … per JavaScript erreicht die Leiste', () => {
        /* Der Weg aus switchCityLeagueFormat: der Nutzer aendert das
           ANDERE Auswahlfeld, und dieses hier wird still mitgesetzt. */
        const u = umgebungCityLeague();
        assert.equal(u.knopf('Aktuelles Meta').getAttribute('aria-pressed'), 'true');
        u.quelle.value = 'past';          // kein change-Ereignis!
        u.laufen();
        assert.equal(u.knopf('Vergangenes Meta').getAttribute('aria-pressed'), 'true',
            'die Leiste zeigt weiter den falschen aktiven Knopf');
        assert.equal(u.knopf('Aktuelles Meta').getAttribute('aria-pressed'), 'false');
    });

    it('das Umschreiben liest und schreibt weiter das Original', () => {
        const u = umgebungCityLeague();
        u.quelle.value = 'past';
        assert.equal(u.quelle.value, 'past', 'der Wert kommt nicht mehr am Feld an');
        assert.equal(u.quelle.options.find(o => o.value === 'past').selected, true,
            'die Auswahl steht nicht an der Option');
    });

    it('option.textContent beim Sprachwechsel erreicht die Leiste', () => {
        const u = umgebungCityLeague();
        u.quelle.options.forEach(o => {
            o.textContent = (o.value === 'current') ? 'Current Meta' : 'Past Meta';
        });
        u.laufen();
        const texte = u.knoepfe().map(b => b.textContent);
        assert.deepEqual(texte, ['Current Meta', 'Past Meta'],
            'die Leiste behaelt die alten Beschriftungen: ' + texte.join(', '));
    });

    it('ohne MutationObserver faellt nichts um — es zieht nur nicht nach', () => {
        // Der Beobachter ist Zugabe. Wo es ihn nicht gibt, bleibt der
        // ausdrueckliche Aufruf window.DsFilter.abgleichen().
        const u = umgebung({ ohneBeobachter: true });
        assert.ok(u.zeile(), 'ohne Beobachter wurde gar keine Zeile gebaut');
    });
});

describe('B8 — Zusatz: die Sperre erreicht auch das Auswahlfeld ab fuenf Optionen', () => {
    it('eine gesperrte Option ist in der Kopie ebenfalls gesperrt', () => {
        const u = umgebung({});
        const gesperrt = u.quelle.options[3];
        gesperrt.disabled = true;
        gesperrt.title = 'kein Datensatz fuer dieses Format';
        u.laufen();
        const kopie = u.kopie();
        assert.ok(kopie, 'bei sieben Formaten muss oben ein Auswahlfeld stehen');
        const opt = kopie.options.find(o => o.value === gesperrt.value);
        assert.ok(opt, 'die Option fehlt in der Kopie');
        assert.equal(opt.disabled, true,
            'die Sperre wurde nicht auf die Kopie uebertragen — oben waehlbar, unten nicht');
        assert.match(opt.title, /kein Datensatz/,
            'der Grund der Sperre fehlt an der Kopie');
    });

    it('die uebrigen Optionen bleiben waehlbar', () => {
        const u = umgebung({});
        u.quelle.options[3].disabled = true;
        u.laufen();
        const kopie = u.kopie();
        const gesperrte = kopie.options.filter(o => o.disabled);
        assert.equal(gesperrte.length, 1,
            'es wurden ' + gesperrte.length + ' Optionen gesperrt statt genau einer');
    });
});

/* ══════════════════════════════════════════════════════════════════════
   M27 / M28 — zwei Waechter, die bisher niemand ausgefuehrt hat
   ════════════════════════════════════════════════════════════════════ */

/** Ein Dokument OHNE aktiven Reiter: zeichne() und abgleichen() kehren
 *  beide frueh zurueck — abgleichen() aber ERST nach horcheAufQuellen(). */
function umgebungOhneReiter() {
    const dok = L.dokument();
    const uhren = [];
    const fenster = {
        document: dok, getLang: () => 'de',
        addEventListener() {}, switchTab() {}, switchTabAndUpdateMenu() {},
    };
    fenster.window = fenster;
    const ctx = {
        window: fenster, document: dok, console: { warn(...a) { ctx.__warnungen.push(a.join(' ')); }, log() {} },
        setTimeout: (f) => { uhren.push(f); return uhren.length; },
        clearTimeout() {},
        MutationObserver: L.BeobachterKlasse(),
        Event: function (art, o) { return { type: art, bubbles: !!(o && o.bubbles) }; },
    };
    ctx.__warnungen = [];
    vm.createContext(ctx);
    vm.runInContext(L.lies('js', 'ds-filter.js'), ctx, { filename: 'ds-filter.js' });
    return {
        dok, ctx, fenster,
        offen() { return uhren.length; },
        laufen() { let n = 0; while (uhren.length && n < 50) { uhren.shift()(); n++; } },
    };
}

describe('M27 — abgleichen() meldet sich selbst bei neuen Quellen an', () => {
    it('ein Auswahlfeld, das erst nach dem Start entsteht, wird von abgleichen() erfasst', () => {
        const u = umgebungOhneReiter();
        // Beim Start gab es das Feld noch nicht — niemand kann es kennen.
        const quelle = u.dok.neu('select', 'cityLeagueFormatSelect');
        const o = u.dok.createElement('option');
        o.value = 'all'; o.textContent = '-- Alle Formate --';
        quelle.appendChild(o);
        assert.equal(quelle.__dsFilterHorcht, undefined,
            'Vorbedingung: das Feld darf noch nicht beobachtet werden');

        // Kein aktiver Reiter: abgleichen() kehrt gleich danach zurueck.
        assert.equal(u.ctx.window.DsFilter.abgleichen(), false);
        assert.equal(quelle.__dsFilterHorcht, true,
            'abgleichen() meldet sich nicht mehr bei neuen Quellen an — '
            + 'ein spaeter entstandenes Auswahlfeld bleibt fuer immer unbeobachtet');
    });

    it('das nachtraeglich erfasste Feld stellt danach wirklich eine Uhr', () => {
        const u = umgebungOhneReiter();
        const quelle = u.dok.neu('select', 'cityLeagueFormatSelect');
        assert.equal(u.offen(), 0, 'Vorbedingung: es darf keine Uhr laufen');
        u.ctx.window.DsFilter.abgleichen();          // meldet sich an
        quelle.dispatchEvent({ type: 'change' });
        assert.ok(u.offen() > 0,
            'ein change am nachtraeglich entstandenen Feld loest nichts aus');
        u.laufen();                                   // und faellt dabei nicht um
    });
});

describe('M28 — ein Auswahlfeld ohne Elternknoten bringt die Zeile nicht um', () => {
    function umgebungOhneEltern() {
        const dok = L.dokument();
        const reiter = dok.neu('div', 'city-league');
        reiter.className = 'tab-content active';
        const behaelter = dok.neu('div', null, reiter);
        behaelter.className = 'container';
        const kopf = dok.neu('div', null, behaelter);
        kopf.className = 'city-league-header';

        // Das Auswahlfeld haengt an NICHTS — es ist nur ueber die Kennung
        // erreichbar. Genau der Zustand, den der Waechter abfaengt.
        const quelle = dok.createElement('select');
        quelle.id = 'cityLeagueFormatSelect';
        FORMATE.forEach(w => {
            const o = dok.createElement('option');
            o.value = w; o.textContent = w;
            quelle.appendChild(o);
        });

        const warnungen = [];
        const uhren = [];
        const fenster = {
            document: dok, getLang: () => 'de',
            addEventListener() {}, switchTab() {}, switchTabAndUpdateMenu() {},
        };
        fenster.window = fenster;
        const ctx = {
            window: fenster, document: dok,
            console: { warn: (...a) => warnungen.push(a.join(' ')), log() {} },
            setTimeout: (f) => { uhren.push(f); return uhren.length; },
            clearTimeout() {},
            MutationObserver: L.BeobachterKlasse(),
            Event: function (art, o) { return { type: art, bubbles: !!(o && o.bubbles) }; },
        };
        vm.createContext(ctx);
        vm.runInContext(L.lies('js', 'ds-filter.js'), ctx, { filename: 'ds-filter.js' });
        return { dok, kopf, quelle, ctx, warnungen,
                 zeile() { return kopf.parentElement.querySelector(':scope > .ds-filter'); } };
    }

    it('die Zeile wird trotzdem gezeichnet', () => {
        const u = umgebungOhneEltern();
        assert.ok(u.zeile(),
            'ein Auswahlfeld ohne Elternknoten hat die ganze Filterzeile mitgenommen');
        assert.ok(u.zeile().querySelector('.ds-filter-select'),
            'die sieben Formate stehen nicht in der Zeile');
    });

    it('der Grund steht im Protokoll, nicht nur im Nichts', () => {
        const u = umgebungOhneEltern();
        const alle = u.warnungen.join(' | ');
        assert.match(alle, /cityLeagueFormatSelect/,
            'der stille Ausfall wird nicht gemeldet: "' + alle + '"');
        assert.match(alle, /Elternknoten/);
    });

    it('und es wird keine Huelle an einem Nichts gebaut', () => {
        const u = umgebungOhneEltern();
        assert.equal(u.quelle.parentElement, null,
            'das Feld wurde in eine Huelle gehaengt, die an nichts haengt');
    });
});

/* ══════════════════════════════════════════════════════════════════════
   UI-32 / UI-33 (27.09.2026) — in Rotationen steht das Format unten
   ════════════════════════════════════════════════════════════════════ */
describe('UI-33 — Rotationen zeigt das Format bei Turnier, Archetyp und Karten-Share', () => {
    function rotationen() {
        const dok = L.dokument();
        const reiter = dok.neu('div', 'past-meta');
        reiter.className = 'tab-content active fs-scale';
        const behaelter = dok.neu('div', null, reiter);
        behaelter.className = 'container';
        const kopf = dok.neu('div', null, behaelter);
        kopf.className = 'header';
        const steuer = dok.neu('div', null, behaelter);
        steuer.className = 'controls';
        const gruppe = dok.neu('div', null, steuer);
        gruppe.className = 'control-group';
        const etikett = dok.neu('label', null, gruppe);
        etikett.setAttribute('for', 'pastMetaFormatFilter');
        const quelle = dok.neu('select', 'pastMetaFormatFilter', gruppe);
        fuellen(dok, quelle);
        const uhren = [];
        const fenster = { document: dok, getLang: () => 'de', addEventListener() {}, switchTab() {}, switchTabAndUpdateMenu() {} };
        fenster.window = fenster;
        const ctx = { window: fenster, document: dok, console: { warn() {}, log() {} },
            setTimeout: (f) => { uhren.push(f); return uhren.length; }, clearTimeout() {},
            Event: function (art) { return { type: art }; } };
        vm.createContext(ctx);
        vm.runInContext(L.lies('js', 'ds-filter.js'), ctx, { filename: 'ds-filter.js' });
        return { dok, kopf, quelle, etikett,
                 zeile() { return kopf.parentElement.querySelector(':scope > .ds-filter'); } };
    }

    it('die Zeile oben traegt nur die Raumwahl, keine Formatkopie', () => {
        const u = rotationen();
        assert.ok(u.zeile(), 'die Zeile fehlt ganz');
        assert.ok(u.zeile().querySelectorAll('.ds-filter-btn').filter(b => b.getAttribute('data-space')).length === 3,
            'die Raumwahl Japan/Global/Rotationen fehlt');
        assert.ok(!u.zeile().querySelector('.ds-filter-select'), 'oben steht wieder eine Formatkopie');
        assert.equal(u.zeile().querySelectorAll('.ds-filter-lab').length, 0);
    });

    it('das Original in der Steuerung bleibt sichtbar und bedienbar', () => {
        const u = rotationen();
        const h = u.quelle.parentElement;
        assert.ok(!(h.classList && h.classList.contains('ds-filter-verdeckt')), 'das Format ist verdeckt');
        assert.ok(!u.etikett.classList.contains('ds-filter-verdeckt'), 'das Etikett ist verdeckt');
        assert.notEqual(u.quelle.getAttribute('tabindex'), '-1');
        assert.notEqual(u.quelle.getAttribute('aria-hidden'), 'true');
    });

    it('index.html fuehrt das Format in derselben Steuerung wie Turnier und Archetyp', () => {
        const i = MARKUP.indexOf('id="past-meta"');
        const steuer = MARKUP.slice(MARKUP.indexOf('<div class="controls">', i), MARKUP.indexOf('id="pastMetaStatsSection"', i));
        for (const id of ['pastMetaFormatFilter', 'pastMetaTournamentFilter', 'pastMetaDeckSelect', 'pastMetaFilterSelect']) {
            assert.ok(steuer.includes('id="' + id + '"'), id + ' steht nicht in der Steuerung');
        }
    });
});
