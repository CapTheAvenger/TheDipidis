/**
 * Meta-Prognose — was das naechste Praesenzturnier vermutlich bringt.
 *
 * WARUM ES DIESE DATEI GIBT (09.09.2026)
 * --------------------------------------
 * data/meta_prognose.json wird seit dem 08.09. taeglich gebaut
 * (scripts/build_meta_prognose.py, aus dem Limitless-API-Lauf), ist
 * committet, wird mit jedem Deploy ausgeliefert — und wurde von KEINER
 * Zeile JavaScript geladen. 53 KB fertige Rechnung, 117 Archetypen mit
 * Konfidenzband, taeglich frisch, unsichtbar.
 *
 * WAS DIE ZAHL BEDEUTET — und was nicht
 * -------------------------------------
 * Online-Anteile und Praesenzanteile sind nicht dasselbe. Gemessen ueber
 * sechs Regional-Anker: die Spitze VERDICHTET sich auf dem Weg vom
 * Online-Ladder ins Turnierlokal, im Mittel um +10,4 Prozentpunkte
 * (Spanne +4,0 bis +12,7). Genau diese Verdichtung rechnet der Bauer auf
 * den aktuellen Online-Stand.
 *
 * Das ist eine ERWARTUNG mit ausgewiesener Guete (r 0,936, mittlerer
 * Fehler 0,51 pp), keine Messung. Die Oberflaeche sagt das an drei
 * Stellen: im Untertitel, in der Spalte "erwartet" mit ihrer Bandbreite,
 * und in der Fusszeile mit Modell, Ankerzahl und Fenster.
 *
 * DREI DINGE, DIE HIER BEWUSST NICHT PASSIEREN
 * --------------------------------------------
 *   1. Kein Name wird aus der Kennung abgeleitet. Der Bauer schreibt
 *      seit heute `archetyp_name` mit; wer aus "n-zoroark" einen Namen
 *      raet, trifft 26 von 62 und verschmilzt "N's Zoroark" still mit
 *      "Zoroark". Fehlt der Name, steht die Kennung da.
 *   2. Keine Prognose ohne Modell. Traegt eine Zeile kein `prognose`-
 *      Feld, zeigt die Spalte einen Strich — nicht den Online-Anteil,
 *      der sich wie eine Vorhersage laese.
 *   3. Der Sammeleimer `other` hat keine Zeile. Er steht im Nenner
 *      (sonst summierten die Anteile nicht auf 100 %), ist aber kein
 *      Deck, sondern zwanzig.
 */
(function () {
    'use strict';

    const QUELLE = 'data/meta_prognose.json';
    let _daten = null;
    let _geladen = false;
    let _alle = false;          // false = nur die Spitze, true = alle 117

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    const T = {
        de: {
            titel: 'Meta-Prognose fürs nächste Turnier',
            unter: 'Erwarteter Feldanteil im Turnierlokal, gerechnet aus dem '
                 + 'Online-Stand. Eine Erwartung mit ausgewiesener Güte, keine Messung.',
            deck: 'Deck',
            online: 'Online',
            erwartet: 'erwartet',
            bewegung: 'Bewegung',
            // UI-8 (5), 26.09.2026: Kopfzeilen mit Erklaerung
            tipOnline: 'Anteil des Decks an den Online-Listen im Fenster (gemessen).',
            tipErwartet: 'Erwarteter Anteil im Turnierlokal nach dem Modell — eine Erwartung, keine Messung.',
            tipBewegung: 'Unterschied zwischen erwartet und online, in Prozentpunkten.',
            listen: 'Listen',
            keine: 'Für dieses Format liegt keine Prognose vor.',
            fehler: 'Die Prognosedaten konnten nicht geladen werden.',
            laden: 'Lade Prognose …',
            mehr: (n) => `alle ${n} Decks zeigen`,
            weniger: 'nur die Spitze zeigen',
            ohneModell: 'kein Modell',
            fuss: (m) => `Modell „${m.art}" aus ${m.anker} Regional-Ankern · `
                 + `Verdichtung +${zahl(m.verdichtung_median)} pp `
                 + `(${zahl(m.verdichtung_min)} bis ${zahl(m.verdichtung_max)}) · `
                 + `r ${zahl(m.r_mittel, 3)} · mittlerer Fehler ${zahl(m.mae_mittel)} pp`,
            fenster: (mt) => `Fenster ${mt.fenster} · Online-Stand ${datum(mt.online_von)} `
                 + `bis ${datum(mt.online_bis)} · ${zahlN(mt.online_listen)} Listen`,
            bandTitel: 'Bandbreite aus der kleinsten und größten gemessenen Verdichtung',
            spitzeTitel: 'Zählt zur Spitze, auf die die Verdichtung verteilt wird',
        },
        en: {
            titel: 'Meta forecast for the next event',
            unter: 'Expected field share on site, derived from the online standing. '
                 + 'An expectation with stated accuracy, not a measurement.',
            deck: 'Deck',
            online: 'online',
            erwartet: 'expected',
            bewegung: 'shift',
            tipOnline: "The deck's share of the online lists in this window (measured).",
            tipErwartet: 'Expected share on site according to the model — an expectation, not a measurement.',
            tipBewegung: 'Difference between expected and online, in percentage points.',
            listen: 'lists',
            keine: 'No forecast available for this format.',
            fehler: 'Could not load the forecast data.',
            laden: 'Loading forecast …',
            mehr: (n) => `show all ${n} decks`,
            weniger: 'show the top only',
            ohneModell: 'no model',
            fuss: (m) => `Model "${m.art}" from ${m.anker} regional anchors · `
                 + `compression +${zahl(m.verdichtung_median)} pp `
                 + `(${zahl(m.verdichtung_min)} to ${zahl(m.verdichtung_max)}) · `
                 + `r ${zahl(m.r_mittel, 3)} · mean error ${zahl(m.mae_mittel)} pp`,
            fenster: (mt) => `Window ${mt.fenster} · online ${datum(mt.online_von)} `
                 + `to ${datum(mt.online_bis)} · ${zahlN(mt.online_listen)} lists`,
            bandTitel: 'Range from the smallest and largest measured compression',
            spitzeTitel: 'Part of the top the compression is distributed onto',
        },
    };
    function t() { return T[de() ? 'de' : 'en']; }

    function zahl(v, stellen) {
        // null/undefined/"" NICHT ueber Number() laufen lassen: Number(null)
        // ist 0, und eine fehlende Zahl wuerde als „0,0" erscheinen — genau
        // die Sorte Angabe, die wie eine Messung aussieht und keine ist.
        // Gefunden beim Testschreiben am 09.09.2026.
        if (v === null || v === undefined || v === '') return '–';
        const n = Number(v);
        if (!Number.isFinite(n)) return '–';
        const s = n.toFixed(stellen == null ? 1 : stellen);
        return de() ? s.replace('.', ',') : s;
    }
    function zahlN(v) {
        if (v === null || v === undefined || v === '') return '–';
        const n = Number(v);
        if (!Number.isFinite(n)) return '–';
        return n.toLocaleString(de() ? 'de-DE' : 'en-US');
    }
    function datum(s) {
        if (!s) return '–';
        const teile = String(s).split('-');
        if (teile.length !== 3) return s;
        return de() ? `${teile[2]}.${teile[1]}.${teile[0]}` : s;
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function laden() {
        if (_geladen) return _daten;
        _geladen = true;
        const v = (typeof window.APP_VERSION === 'string') ? window.APP_VERSION : Date.now();
        /* Der Parameter heisst `stand`, NICHT `v` — und das ist kein
           Geschmack.

           GEMESSEN am 10.09.2026 an der live ausgelieferten Datei: der
           Deploy laesst in deploy-pages.yml (Schritt "Cache-bust asset
           references") ein sed ueber JEDE Datei in js/ laufen, das jede
           Zeichenfolge "Fragezeichen v Gleichheitszeichen" bis zum
           naechsten Anfuehrungszeichen durch die Deploy-Version
           ersetzt.

           Steht das Muster in einem normalen String, endet die
           Ersetzung sofort am schliessenden Anfuehrungszeichen und
           alles bleibt heil — so machen es archetype-icons.js und
           draw-simulator.js. In einem TEMPLATE-Literal gibt es dort
           kein Anfuehrungszeichen: die Regex frass den halben Rest der
           Zeile. Die ausgelieferte Datei war 6.161 statt 12.173 Bytes
           gross und warf "SyntaxError: missing ) after argument list".
           Der Reiter blieb leer, waehrend Datei und Tests auf main
           einwandfrei waren — das Modul war das einzige im Projekt mit
           diesem Muster in einem Template-Literal.

           Ein anderer Parametername umgeht die Ersetzung vollstaendig.
           tests/unit/test-meta-prognose.js haelt das fest. */
        const antwort = await fetch(QUELLE + '?stand=' + encodeURIComponent(v));
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        _daten = await antwort.json();
        return _daten;
    }

    /** Balkenbreite in Prozent der Spaltenbreite, gedeckelt. */
    function breite(wert, groesster) {
        if (!(groesster > 0)) return 0;
        return Math.max(1.5, Math.min(100, (Number(wert) / groesster) * 100));
    }

    function zeileHtml(z, groesster, l) {
        const name = (z.archetyp_name || '').trim() || z.archetyp_id;
        const hatPrognose = Number.isFinite(Number(z.prognose));
        const bew = Number(z.bewegung);
        const richtung = !Number.isFinite(bew) ? '' : (bew > 0.05 ? 'is-hoch' : (bew < -0.05 ? 'is-runter' : 'is-gleich'));
        const pfeil = !Number.isFinite(bew) ? '' : (bew > 0.05 ? '▲' : (bew < -0.05 ? '▼' : '–'));
        const band = hatPrognose
            ? `${zahl(z.prognose_von)} – ${zahl(z.prognose_bis)} %`
            : '';
        return `<tr class="${z.in_der_spitze ? 'is-spitze' : ''}">
            <td class="mp-deck">${z.in_der_spitze
                ? `<span class="mp-spitze" title="${esc(l.spitzeTitel)}" aria-hidden="true">●</span>`
                : '<span class="mp-spitze is-leer" aria-hidden="true">●</span>'}<span
                class="mp-name">${esc(name)}</span></td>
            <td class="mp-zahl">${zahl(z.online_anteil)} %<span class="mp-listen">${zahlN(z.online_listen)} ${esc(l.listen)}</span></td>
            <td class="mp-erwartet">${hatPrognose
                ? `<span class="mp-balken" style="--mp-b:${breite(z.prognose, groesster)}%"></span>`
                   + `<b>${zahl(z.prognose)} %</b>`
                   + `<span class="mp-band" title="${esc(l.bandTitel)}">${band}</span>`
                : `<span class="mp-ohne">– <i>${esc(l.ohneModell)}</i></span>`}</td>
            <td class="mp-bewegung ${richtung}">${Number.isFinite(bew)
                ? `${pfeil} ${zahl(Math.abs(bew))} pp` : '–'}</td>
        </tr>`;
    }

    function html() {
        const l = t();
        if (!_daten) return `<p class="mp-leer">${esc(l.fehler)}</p>`;
        const zeilen = Array.isArray(_daten.prognose) ? _daten.prognose : [];
        if (!zeilen.length) return `<p class="mp-leer">${esc(l.keine)}</p>`;

        // Voreinstellung: die Spitze plus alles ueber 1 % Online-Anteil.
        // Alle 117 auf einmal sind eine Liste, kein Ueberblick.
        const sichtbar = _alle
            ? zeilen
            : zeilen.filter(z => z.in_der_spitze || Number(z.online_anteil) >= 1);
        const groesster = zeilen.reduce(
            (m, z) => Math.max(m, Number(z.prognose) || Number(z.online_anteil) || 0), 0);
        const m = _daten.modell;
        const mt = _daten._meta || {};

        /* Der Frischechip traegt seinen Text ZUR EINFUEGEZEIT in der
           aktuellen Sprache, nicht fest auf Deutsch.

           GEMESSEN am 10.09.2026 im CI-Lauf `sprachreinheit`:
           "FAIL EN.i18n 'data.updated' (expected 'Data:' got 'Daten:')".
           Der Reiter rendert erst, wenn er geoeffnet wird — da ist der
           Uebersetzungsdurchgang der Seite laengst gelaufen, und ein fest
           deutsch geschriebenes Wort bleibt stehen. Das `data-i18n`
           bleibt trotzdem dran, damit ein SPAETERER Sprachwechsel den
           Text wieder anfasst. Dasselbe Muster wie in
           app-current-meta-analysis.js Zeile 6071. */
        return `<section class="mp-panel">
            <h3 class="mp-titel">${esc(l.titel)}<span class="data-freshness-chip"
                title="Daten zuletzt aktualisiert"><span class="data-freshness-chip-icon"
                aria-hidden="true">&#128260;</span> <span data-i18n="data.updated">${
                de() ? 'Daten:' : 'Data:'}</span>
                <span class="js-data-freshness" data-quelle="meta_prognose.json">&#8230;</span></span></h3>
            <p class="mp-unter">${esc(l.unter)}</p>
            <div class="mp-tabelle-wrap">
              <table class="mp-tabelle">
                <thead><tr>
                  <th>${esc(l.deck)}</th>
                  <th class="mp-zahl" title="${esc(l.tipOnline)}">${esc(l.online)}</th>
                  <th title="${esc(l.tipErwartet)}">${esc(l.erwartet)}</th>
                  <th title="${esc(l.tipBewegung)}">${esc(l.bewegung)}</th>
                </tr></thead>
                <tbody>${sichtbar.map(z => zeileHtml(z, groesster, l)).join('')}</tbody>
              </table>
            </div>
            <button type="button" class="mp-mehr" data-mp-mehr>${
                esc(_alle ? l.weniger : l.mehr(zeilen.length))}</button>
            <p class="mp-fuss">${m ? esc(l.fuss(m)) : ''}</p>
            <p class="mp-fuss">${esc(l.fenster(mt))}</p>
        </section>`;
    }

    function verdrahte(host) {
        const knopf = host.querySelector('[data-mp-mehr]');
        if (knopf) {
            knopf.addEventListener('click', () => {
                _alle = !_alle;
                zeichne();
            });
        }
    }

    async function zeichne() {
        const host = document.getElementById('metaPrognoseHost');
        if (!host) return;
        if (!_daten && !_geladen) {
            host.innerHTML = `<p class="mp-leer">${esc(t().laden)}</p>`;
        }
        try {
            await laden();
        } catch (e) {
            console.warn('[Meta-Prognose] konnte %s nicht laden: %s', QUELLE, e.message);
            host.innerHTML = `<p class="mp-leer">${esc(t().fehler)}</p>`;
            return;
        }
        host.innerHTML = html();
        verdrahte(host);
        // Der Frischechip wird erst jetzt in den Baum gehaengt — das
        // Datenstandsmodul hat beim Seitenstart nichts vorgefunden.
        // meta_prognose.json steht seit dem 09.09. in data_stand.json.
        if (window.DsDatenstand && typeof window.DsDatenstand.zeichne === 'function') {
            window.DsDatenstand.zeichne();
        }
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById('metaPrognoseHost');
        if (host && host.innerHTML.trim()) zeichne();
    });

    window.MetaPrognose = { zeichne, _intern: { html, breite, zahl, laden } };

    // Der Reiter wird erst beim Umschalten sichtbar; hier reicht ein
    // Versuch beim Laden plus einer beim Tabwechsel.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', zeichne);
    } else {
        zeichne();
    }
})();
