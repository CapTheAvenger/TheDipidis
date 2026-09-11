/**
 * Die lange Erklaerung wandert hinter den Professor-Eich-Knopf.
 *
 * GEMELDET am 10.09.2026, mit fuenf Bildschirmfotos vom Telefon: vier
 * Textwaende standen mitten in der Meta-Ansicht und schoben die Zahlen
 * nach unten (Tier-Grundlage 9 Zeilen, Heatmap-Erklaerung 6 Zeilen
 * Fliesstext plus 5 Zeilen Legende, Meta-Performance 7 Zeilen). Woertlich:
 * "wie man das Professor eich Bild neben jedem Titel und geben darueber
 * die Beschreibung, Infos und Legenden."
 *
 * Gebaut ist das als REGISTER (js/ds-abschnitt-info.js): die Erzeuger
 * bauen ihren Text weiter dort, wo die Zahlen sind, und MELDEN ihn nur
 * hierher. js/ds-sections.js zeichnet den Knopf — und nur den Knopf.
 *
 * WAS DIESE DATEI FESTHAELT
 * -------------------------
 * 1. Ohne Meldung kein Knopf. Ein Knopf, der einen leeren Dialog
 *    oeffnet, ist schlimmer als kein Knopf.
 * 2. Alle Abschnitte der Meta-Ansicht bekommen einen, sobald
 *    gemeldet wurde — und wenn einer dazukommt, sagt der Test
 *    seinen Namen.
 * 3. Die erste Ueberschrift heisst "Archetypen", nicht mehr "Decks".
 *    Die Kacheln darunter zeigen Archetypen mit ihren Varianten
 *    ("Dragapult · 7 Varianten"), keine einzelnen Decklisten.
 * 4. Nachgezeichnet wird die KNOPFZEILE, nie der Abschnitt: die Inhalte
 *    wurden per appendChild aus fremden Renderern verschoben und
 *    verlieren beim Neubauen jeden Ereignis-Handler.
 * 5. Der Klick auf den Knopf klappt den Abschnitt nicht um.
 *
 * ZU 5 — LIVE GEMESSEN (10.09.2026, Chromium 1440 x 900, die echten
 * Dateien ueber einen lokalen Server, Klick auf den Info-Knopf des
 * Abschnitts "heatmap"):
 *
 *   Knopf NEBEN dem Klapp-Knopf, ohne Ausnahme in der Weiche
 *       aria-expanded true -> true,  ds_sections_v1 leer
 *   Knopf IM Klapp-Knopf, ohne Ausnahme
 *       aria-expanded true -> false, ds_sections_v1 ["top","cards"]
 *   Knopf IM Klapp-Knopf, mit Ausnahme
 *       aria-expanded true -> true,  ds_sections_v1 leer
 *
 * Es traegt also die STELLUNG des Knopfes, nicht das stopPropagation()
 * in js/ds-abschnitt-info.js: jener Zuhoerer haengt am `document`, die
 * Klapp-Weiche am Host `#currentMetaContent` — der liegt im Baum
 * darunter und ist beim Blubbern zuerst dran. Die Ausnahme in der
 * Weiche steht trotzdem, fuer den Tag, an dem jemand den Knopf in die
 * Ueberschrift zieht. In allen drei Faellen trug der Dialog den Titel
 * "Matchups" und den gemeldeten Rumpf; ein Klick auf die Ueberschrift
 * daneben klappte weiterhin zu (aria-expanded "false").
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { dokument, ausschnitt, lies } = require('./lib-dom-sandkasten.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const REGISTER_QUELLE = read('js/ds-abschnitt-info.js');
const SEKTIONEN_QUELLE = read('js/ds-sections.js');
const QUELLEN_QUELLE = read('js/app-quellen.js');

/* Die Abschnitte, so wie sie in SECTIONS stehen — in DIESER Reihenfolge.
   Diese Liste ist der Wachhund: kommt einer dazu oder wandert einer,
   faellt der Test und nennt ihn beim Namen.

   Stand 11.09.2026: der Rechner-Abschnitt ist entfallen (die Rechnung
   sitzt im Meta Call, der Weg dorthin am Knopf „Gegen das Meta" jeder
   Deck-Karte), und 'cards' steht hinten statt an dritter Stelle —
   beides auf Ansage des Betreibers vom selben Abend. */
const BEKANNTE_ABSCHNITTE = ['top', 'heatmap', 'tiers', 'rang', 'cards'];

// ── Ein Platz zum Ausfuehren ────────────────────────────────────────
//
// Beide Dateien laufen im selben Kontext auf demselben Dokument — so
// wie im Browser auch. Der Sandkasten parst kein HTML; das ist hier
// sogar praktisch, weil `innerHTML` dadurch die Zeichenkette behaelt,
// die knopfHtml() erzeugt hat, und genau die wird geprueft.
function platz(sprache) {
    const dok = dokument();
    const ctx = { console, document: dok };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.getLang = () => sprache || 'de';
    vm.createContext(ctx);

    vm.runInContext(REGISTER_QUELLE, ctx, { filename: 'js/ds-abschnitt-info.js' });

    /* Aus ds-sections.js nur die Stuecke, die zum Zeichnen der
       Knopfzeile gehoeren. Der Rest der Datei braucht einen echten
       Host mit gerenderten Bloecken; das ist die Live-Messung oben. */
    const teile = [
        /var HOST_ID = [^;]+;/.exec(SEKTIONEN_QUELLE)[0],
        /var SECTIONS = \[[\s\S]*?\n    \];/.exec(SEKTIONEN_QUELLE)[0],
        ausschnitt(SEKTIONEN_QUELLE, 'function quotenName('),
        ausschnitt(SEKTIONEN_QUELLE, 'function de('),
        ausschnitt(SEKTIONEN_QUELLE, 'function fuelleQuoten('),
        ausschnitt(SEKTIONEN_QUELLE, 'function texte('),
        ausschnitt(SEKTIONEN_QUELLE, 'function zeichneInfoKnoepfe('),
        'globalThis.SECTIONS = SECTIONS;',
        'globalThis.zeichneInfoKnoepfe = zeichneInfoKnoepfe;',
        'globalThis.texte = texte;',
    ].join('\n');
    vm.runInContext(teile, ctx, { filename: 'js/ds-sections.js (Ausschnitt)' });

    // Der Host mit einem Abschnitt je Kennung — so gebaut, wie kopf()
    // ihn baut: .ds-sec > .ds-sec-kopf > span.ds-sec-info.
    const host = dok.neu('div', 'currentMetaContent');
    ctx.SECTIONS.forEach((s) => {
        const sec = dok.neu('section', null, host);
        sec.className = 'ds-sec';
        sec.setAttribute('data-sec', s.id);
        const zeile = dok.neu('div', null, sec);
        zeile.className = 'ds-sec-kopf';
        const slot = dok.neu('span', null, zeile);
        slot.className = 'ds-sec-info';
    });

    // Der Dialog, den zeige() fuellt.
    const modal = dok.neu('div', 'helpModal');
    const titel = dok.neu('h2', null, modal);
    titel.className = 'help-modal-title';
    const rumpf = dok.neu('div', null, modal);
    rumpf.className = 'help-modal-body';

    return { dok, ctx, host, modal, register: ctx.DsAbschnittInfo };
}

function slotVon(host, id) {
    return host.querySelector('.ds-sec[data-sec="' + id + '"] .ds-sec-info');
}

// ═══════════════════════════════════════════════════════════════════
describe('Das Register — ohne Meldung kein Knopf', () => {
    it('knopfHtml gibt leer zurueck, solange nichts gemeldet wurde', () => {
        const p = platz();
        assert.equal(p.register.hat('tiers'), false);
        assert.equal(p.register.knopfHtml('tiers', 'Tier-Liste'), '',
            'ein Knopf ohne Inhalt oeffnet einen leeren Dialog — das ist schlimmer als kein Knopf');
    });

    it('nach der Meldung steht der Knopf da, mit Kennung und Beschriftung', () => {
        const p = platz();
        p.register.melde('tiers', { titel: 'Tier-Liste', html: '<p>Grundlage</p>' });
        const html = p.register.knopfHtml('tiers', 'Tier-Liste');
        assert.match(html, /<button[^>]*type="button"/, 'ohne type="button" schickt er ein Formular ab');
        assert.match(html, /class="tab-help-btn ds-abschnitt-info"/,
            'dieselbe Klasse wie der vorhandene Professor-Eich-Knopf — ein zweites Aussehen '
            + 'fuer dieselbe Geste waere eine Marke, die nichts bedeutet');
        assert.match(html, /data-abschnitt-info="tiers"/, 'ohne Kennung weiss der Zuhoerer nicht, was er zeigen soll');
        assert.match(html, /aria-label="[^"]*Tier-Liste"/,
            'ein Knopf ohne Text braucht eine Beschriftung, sonst ist er fuer Screenreader namenlos');
    });

    it('eine zweite Meldung ersetzt die erste', () => {
        // Die Erzeuger melden erneut, wenn ihre Daten nachkommen. Zwei
        // Fassungen nebeneinander waeren zwei Wahrheiten.
        const p = platz();
        p.register.melde('rang', { titel: 'Alt', html: '<p>alt</p>' });
        p.register.melde('rang', { titel: 'Neu', html: '<p>neu</p>' });
        const hol = p.register.hol('rang');
        // deepStrictEqual scheitert ueber Kontextgrenzen (andere
        // Prototypkette), deshalb Feld fuer Feld.
        assert.equal(hol.titel, 'Neu');
        assert.equal(hol.html, '<p>neu</p>');
    });

    it('eine Meldung ohne html aendert nichts', () => {
        const p = platz();
        p.register.melde('rang', { titel: 'Da', html: '<p>da</p>' });
        p.register.melde('rang', { titel: 'Leer' });
        assert.equal(p.register.hol('rang').html, '<p>da</p>',
            'ein leerer Nachschlag darf einen vorhandenen Text nicht loeschen');
    });

    it('zeige() fuellt Titel und Rumpf desselben Dialogs, den die Reiter benutzen', () => {
        const p = platz();
        p.register.melde('heatmap', { titel: 'Matchups', html: '<p>Legende</p>' });
        assert.equal(p.register.zeige('heatmap', 'egal'), true);
        assert.equal(p.modal.querySelector('.help-modal-title').textContent, 'Matchups');
        assert.equal(p.modal.querySelector('.help-modal-body').innerHTML, '<p>Legende</p>');
        assert.equal(p.modal.classList.contains('active'), true, 'der Dialog bleibt zu');
    });

    it('zeige() auf einen unbekannten Abschnitt oeffnet nichts', () => {
        const p = platz();
        assert.equal(p.register.zeige('gibtsnicht', 'x'), false);
        assert.equal(p.modal.classList.contains('active'), false);
    });

    it('beiAenderung feuert, wenn ein Abschnitt zum ersten Mal meldet', () => {
        // Ohne das bekaeme ein Abschnitt, dessen Daten spaeter kommen,
        // nie einen Knopf — und genau so laden die Daten hier.
        const p = platz();
        const gehoert = [];
        p.register.beiAenderung((id) => gehoert.push(id));
        p.register.melde('cards', { titel: 'Karten', html: '<p>x</p>' });
        p.register.melde('cards', { titel: 'Karten', html: '<p>x</p>' });   // unveraendert
        p.register.melde('cards', { titel: 'Karten', html: '<p>y</p>' });   // geaendert
        assert.deepStrictEqual(gehoert, ['cards', 'cards'],
            'gemeldet wird nur, wenn sich der Text wirklich geaendert hat');
    });
});

// ═══════════════════════════════════════════════════════════════════
describe('Die Meta-Ansicht — ein Knopf je Abschnitt', () => {
    it('vor der ersten Meldung traegt kein Abschnitt einen Knopf', () => {
        const p = platz();
        p.ctx.zeichneInfoKnoepfe(p.host);
        BEKANNTE_ABSCHNITTE.forEach((id) => {
            assert.equal(slotVon(p.host, id).innerHTML, '',
                `Abschnitt "${id}" zeigt einen Knopf, ohne dass etwas gemeldet wurde`);
        });
    });

    it('jeder Abschnitt der Liste bekommt einen, sobald er gemeldet hat', () => {
        const p = platz();
        Array.from(p.ctx.SECTIONS).forEach((s) => {
            p.register.melde(s.id, { titel: 'T ' + s.id, html: '<p>Inhalt ' + s.id + '</p>' });
        });
        p.ctx.zeichneInfoKnoepfe(p.host);
        const ohne = Array.from(p.ctx.SECTIONS, (s) => s.id)
            .filter((id) => !/data-abschnitt-info="/.test(slotVon(p.host, id).innerHTML));
        assert.deepStrictEqual(ohne, [],
            'ohne Knopf geblieben: ' + ohne.join(', '));
    });

    it('meldet nur einer, bekommt auch nur einer einen', () => {
        const p = platz();
        p.register.melde('rang', { titel: 'Meta-Performance', html: '<p>Spalten</p>' });
        p.ctx.zeichneInfoKnoepfe(p.host);
        const mit = BEKANNTE_ABSCHNITTE
            .filter((id) => /data-abschnitt-info="/.test(slotVon(p.host, id).innerHTML));
        assert.deepStrictEqual(mit, ['rang']);
    });

    it('ein weiterer Abschnitt wird benannt, nicht stillschweigend uebergangen', () => {
        // DIE WICHTIGSTE ZUSICHERUNG DIESER DATEI.
        //
        // Wer SECTIONS erweitert, baut einen Abschnitt, den niemand
        // erklaert: der Knopf erscheint nur, wo gemeldet wurde. Das
        // faellt beim Ansehen nicht auf — es fehlt ja nur ein kleines
        // Bild. Deshalb steht die Liste hier ausgeschrieben und der
        // Fehlertext sagt, was zu tun ist.
        const p = platz();
        const ids = Array.from(p.ctx.SECTIONS, (s) => s.id);
        const neu = ids.filter((x) => BEKANNTE_ABSCHNITTE.indexOf(x) < 0);
        const weg = BEKANNTE_ABSCHNITTE.filter((x) => ids.indexOf(x) < 0);
        assert.deepStrictEqual(ids, BEKANNTE_ABSCHNITTE,
            'die Abschnittsliste in js/ds-sections.js hat sich geaendert — neu: ['
            + neu.join(', ') + '], weg: [' + weg.join(', ') + ']. '
            + 'Ein neuer Abschnitt bekommt nur dann einen Info-Knopf, wenn sein Erzeuger '
            + 'DsAbschnittInfo.melde("' + (neu[0] || '<id>') + '", …) ruft. Bitte melden '
            + 'oder hier bewusst eintragen.');
    });

    it('der Knopf traegt die Ueberschrift seines Abschnitts als Beschriftung', () => {
        const p = platz();
        p.register.melde('top', { titel: 'x', html: '<p>x</p>' });
        p.ctx.zeichneInfoKnoepfe(p.host);
        assert.match(slotVon(p.host, 'top').innerHTML,
            /aria-label="Beschreibung und Legende: Die meistgespielten Archetypen"/);
    });

    it('auf Englisch steht die englische Beschriftung da', () => {
        const p = platz('en');
        p.register.melde('top', { titel: 'x', html: '<p>x</p>' });
        p.ctx.zeichneInfoKnoepfe(p.host);
        assert.match(slotVon(p.host, 'top').innerHTML,
            /aria-label="Description and legend: Most played archetypes"/);
    });

    it('zweimal zeichnen schreibt nicht zweimal', () => {
        // Der MutationObserver in ds-sections.js horcht auf den ganzen
        // Teilbaum. Ein Schreiben bei jedem Durchlauf loeste die
        // naechste Runde aus — und die uebernaechste.
        //
        // Gezaehlt wird ueber knopfHtml(): die Marke steigt VOR dem
        // Bauen des Markups aus, ein Aufruf bedeutet also ein
        // Schreiben. (innerHTML ist im Sandkasten nicht ueberschreibbar.)
        const p = platz();
        p.register.melde('tiers', { titel: 'x', html: '<p>x</p>' });
        let gebaut = 0;
        const echt = p.ctx.DsAbschnittInfo;
        p.ctx.DsAbschnittInfo = {
            hat: (id) => echt.hat(id),
            knopfHtml: (id, u) => { gebaut++; return echt.knopfHtml(id, u); },
        };
        p.ctx.zeichneInfoKnoepfe(p.host);
        assert.equal(gebaut, 1, 'der erste Durchlauf baut den einen gemeldeten Knopf');
        const vorher = slotVon(p.host, 'tiers').innerHTML;
        p.ctx.zeichneInfoKnoepfe(p.host);
        p.ctx.zeichneInfoKnoepfe(p.host);
        assert.equal(gebaut, 1, 'die Marke greift nicht — jeder Durchlauf schreibt neu');
        assert.equal(slotVon(p.host, 'tiers').innerHTML, vorher);
    });
});

// ═══════════════════════════════════════════════════════════════════
describe('Die Ueberschrift heisst Archetypen', () => {
    it('deutsch und englisch, in beiden Faellen ohne "Decks"', () => {
        const de = platz('de');
        const en = platz('en');
        assert.equal(de.ctx.texte(de.ctx.SECTIONS[0])[0], 'Die meistgespielten Archetypen');
        assert.equal(en.ctx.texte(en.ctx.SECTIONS[0])[0], 'Most played archetypes');
    });

    it('die alte Beschriftung steht nirgends mehr in der Datei', () => {
        assert.ok(!/meistgespielten Decks/.test(SEKTIONEN_QUELLE),
            'die deutsche Fassung sagt weiter "Decks"');
        assert.ok(!/most played decks/i.test(SEKTIONEN_QUELLE.replace(/\/\*[\s\S]*?\*\//g, '')),
            'die englische Fassung sagt weiter "decks"');
    });

    it('jeder Abschnitt hat beide Sprachen', () => {
        const p = platz();
        const leer = Array.from(p.ctx.SECTIONS)
            .filter((s) => !s.de || !s.de[0] || !s.en || !s.en[0])
            .map((s) => s.id);
        assert.deepStrictEqual(leer, [], 'ohne Ueberschrift: ' + leer.join(', '));
    });
});

// ═══════════════════════════════════════════════════════════════════
describe('Nachgezeichnet wird die Knopfzeile, nicht der Abschnitt', () => {
    const OHNE_KOMMENTAR = SEKTIONEN_QUELLE
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

    it('geschrieben wird ausschliesslich in .ds-sec-info', () => {
        // Die Inhalte wurden per appendChild aus app-tier-meta.js,
        // app-current-meta.js und app-meta-cards.js VERSCHOBEN. Wer den
        // Abschnitt neu baut, schneidet deren Handler ab.
        const fn = ausschnitt(OHNE_KOMMENTAR, 'function zeichneInfoKnoepfe(');
        assert.match(fn, /querySelector\('\.ds-sec-info'\)/,
            'zeichneInfoKnoepfe sucht den Platz fuer den Knopf nicht');
        const schreibt = fn.match(/(\w+)\.innerHTML\s*=/g) || [];
        assert.deepStrictEqual(schreibt, ['platz.innerHTML ='],
            'hier darf nur der Platz des Knopfes beschrieben werden, sonst nichts: ' + schreibt);
    });

    it('das Register wird beim Anmelden nach Aenderungen gefragt', () => {
        assert.match(OHNE_KOMMENTAR, /DsAbschnittInfo[\s\S]{0,120}beiAenderung\(/,
            'ohne Anmeldung bekaeme ein spaet gemeldeter Abschnitt nie einen Knopf');
    });

    it('der Knopf entsteht aus knopfHtml, nicht aus einer zweiten Abschrift', () => {
        assert.match(OHNE_KOMMENTAR, /A\.knopfHtml\(s\.id/,
            'ein zweites Knopf-Markup hier waere die naechste Stelle, die auseinanderlaeuft');
    });

    it('der Knopf steht NEBEN dem Klapp-Knopf, nicht darin', () => {
        // <button> im <button> ist ungueltig; Chromium laesst es beim
        // Setzen von innerHTML stehen, es faellt also nicht auf.
        const fn = ausschnitt(OHNE_KOMMENTAR, 'function kopf(');
        assert.match(fn, /zeile\.appendChild\(b\)/, 'der Klapp-Knopf haengt nicht in der Zeile');
        assert.match(fn, /className = 'ds-sec-info'/, 'der Platz fuer den Info-Knopf fehlt');
        const knopfInnen = /b\.innerHTML =[\s\S]{0,300}?;/.exec(fn)[0];
        assert.ok(!/<button/.test(knopfInnen),
            'der Info-Knopf steckt wieder im Klapp-Knopf — zwei Bedienelemente ineinander');
    });
});

// ═══════════════════════════════════════════════════════════════════
describe('Der Klick auf den Knopf klappt nichts um', () => {
    const OHNE_KOMMENTAR = SEKTIONEN_QUELLE
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

    it('die Weiche am Host steigt beim Info-Knopf sofort aus', () => {
        // Heute wirkungslos, weil der Knopf neben dem Klapp-Knopf steht
        // und closest('.ds-sec-hd') ihn gar nicht erst findet. Sie ist
        // die Absicherung fuer den Tag, an dem jemand ihn in die
        // Ueberschrift zieht — dann klappte der Abschnitt beim Oeffnen
        // des Dialogs zu, und zwar gespeichert (siehe Kopf der Datei).
        const i = OHNE_KOMMENTAR.indexOf("host.addEventListener('click'");
        assert.ok(i > -1, 'die Weiche am Host fehlt');
        const weiche = OHNE_KOMMENTAR.slice(i, i + 1200);
        const aus = weiche.indexOf("closest('[data-abschnitt-info]')");
        const klapp = weiche.indexOf("closest('.ds-sec-hd')");
        assert.ok(aus > -1, 'der Info-Knopf wird in der Weiche nicht erkannt — er klappt den Abschnitt zu');
        assert.ok(klapp > -1 && aus < klapp,
            'die Ausnahme muss VOR dem Umschalten stehen, sonst ist der Zustand schon gewechselt');
        assert.match(weiche.slice(aus, aus + 80), /\breturn\b/,
            'erkannt, aber nicht ausgestiegen');
    });

    it('der Zuhoerer im Register haelt die Weitergabe trotzdem an', () => {
        // Fuer alle anderen Klapp-Behandlungen ueber dem Host.
        assert.match(REGISTER_QUELLE, /stopPropagation\(\)/);
    });
});

// ═══════════════════════════════════════════════════════════════════
describe('Quellen & Methodik sagt, wo die Erklaerungen stehen', () => {
    /* GEPRUEFT WIRD DAS GEZEICHNETE, NICHT DER QUELLTEXT.
     *
     * Die erste Fassung dieser Zusicherungen las js/app-quellen.js als
     * Text — und bestand die Mutationsprobe nicht: der Kommentar UEBER
     * dem Abschnitt enthaelt dieselben Woerter wie der Abschnitt selbst.
     * Ein Test, der eine Erklaerung im Kommentar findet, waere gruen,
     * waehrend auf der Seite nichts davon steht. */
    function gezeichnet(sprache) {
        const dok = dokument();
        const ctx = { console, document: dok };
        ctx.window = ctx;
        ctx.globalThis = ctx;
        ctx.getLang = () => sprache;
        vm.createContext(ctx);
        dok.neu('div', 'quellenHost');
        dok.neu('h1', 'quellenTitel');
        dok.neu('a', 'quellenZurueck');
        vm.runInContext(QUELLEN_QUELLE, ctx, { filename: 'js/app-quellen.js' });
        assert.equal(ctx.Quellen.render(), true, 'die Seite zeichnet sich nicht');
        return dok.getElementById('quellenHost').innerHTML;
    }

    const DE = gezeichnet('de');
    const EN = gezeichnet('en');

    it('der Abschnitt steht auf der gezeichneten Seite — in beiden Sprachen', () => {
        assert.match(DE, /id="qu-erklaerungen"/, 'auf Deutsch fehlt er');
        assert.match(EN, /id="qu-erklaerungen"/, 'auf Englisch fehlt er');
        assert.match(DE, /Wo die ausführlichen Erklärungen stehen/);
        assert.match(EN, /Where the detailed explanations live/);
    });

    it('er nennt den Knopf, hinter dem die Erklaerung steht', () => {
        assert.match(DE, /Professor-Eich-Knopf/);
        assert.match(EN, /Professor Oak button/);
        assert.match(DE, /Beschreibung, Zahlen(?:\s|&nbsp;)*und Legende/);
        assert.match(EN, /description, figures and legend/);
    });

    it('er nennt alle Auswertungen beim Namen — und keine, die es nicht mehr gibt', () => {
        const NAMEN_DE = ['Die meistgespielten Archetypen', 'Matchups', 'Meistgespielte Karten',
                          'Tier-Liste', 'Meta-Performance'];
        const NAMEN_EN = ['Most played archetypes', 'Matchups', 'Most played cards',
                          'Tier list', 'Meta performance'];
        // „Gegen welches Meta?" stand hier bis zum 11.09.2026. Der
        // Abschnitt ist weg; eine Quellenseite, die ihn weiter nennt,
        // schickt den Leser an eine Ueberschrift, die es nicht gibt.
        assert.ok(DE.indexOf('Gegen welches Meta?') < 0, 'der entfallene Abschnitt wird weiter genannt');
        assert.ok(EN.indexOf('Against which field?') < 0, 'der entfallene Abschnitt wird weiter genannt');
        const fehltDe = NAMEN_DE.filter((n) => DE.indexOf(n) < 0);
        const fehltEn = NAMEN_EN.filter((n) => EN.indexOf(n) < 0);
        assert.deepStrictEqual(fehltDe, [], 'auf Deutsch nicht genannt: ' + fehltDe.join(' | '));
        assert.deepStrictEqual(fehltEn, [], 'auf Englisch nicht genannt: ' + fehltEn.join(' | '));
    });

    it('er sagt, warum die Texte nicht hier abgeschrieben stehen', () => {
        // Der Grund ist der Punkt: die Texte tragen Zahlen aus dem
        // laufenden Datenstand, eine Kopie hier waere beim naechsten
        // Datenlauf falsch — und zwar unbemerkt.
        assert.match(DE, /Zahlen aus dem laufenden Datenstand/);
        assert.match(DE, /beim nächsten Datenlauf falsch/);
        assert.match(EN, /figures from the running data/);
        assert.match(EN, /wrong after the next data run/);
    });

    it('er nennt die Bauart der Saetze, die dort stehen', () => {
        // Ohne ein Beispiel bleibt "enthaelt Zahlen" eine Behauptung.
        assert.match(DE, /365 von 3\.644 Listen/);
        assert.match(EN, /365 of 3,644 lists/);
    });

    it('er steht zugeklappt da — offen ist weiterhin nur der erste', () => {
        const offenDe = (DE.match(/<details class="qu-sec"[^>]*open/g) || []).length;
        const offenEn = (EN.match(/<details class="qu-sec"[^>]*open/g) || []).length;
        assert.equal(offenDe, 1, 'zwei offene Abschnitte sind wieder die Textwand');
        assert.equal(offenEn, 1);
        assert.ok(!/id="qu-erklaerungen" open/.test(DE), 'der neue Abschnitt steht offen');
    });

    it('der Tieflink #quellen-erklaerungen findet ihn', () => {
        // js/inline-init.js liest die erlaubten Anker aus Quellen.ids().
        const dok = dokument();
        const ctx = { console, document: dok };
        ctx.window = ctx; ctx.globalThis = ctx; ctx.getLang = () => 'de';
        vm.createContext(ctx);
        vm.runInContext(QUELLEN_QUELLE, ctx, { filename: 'js/app-quellen.js' });
        assert.ok(Array.from(ctx.Quellen.ids()).indexOf('erklaerungen') > -1,
            'ohne Eintrag in Quellen.ids() klappt der Anker den Abschnitt nicht auf');
    });
});
