'use strict';
/*
 * Drei Befunde aus dem Champions-Modal, alle am selben Ort.
 *
 * 1) MEGA-FORMEN HATTEN KEINE NUTZUNGSDATEN. In-Game gibt es keine
 *    Mega-Statistik: gespielt wird die GRUNDFORM mit dem Mega-Stein.
 *    championsbattledata fuehrt entsprechend nur die Grundform. Das
 *    Modal zeigte deshalb bei 74 von 75 Mega-Formen "keine
 *    Nutzungsdaten" — obwohl die Grundform daneben einen Mega-Stein als
 *    meistgenutztes Item fuehrt.
 *
 *    Uebernommen wird nur MIT BELEG: die Grundform muss genau diesen
 *    Stein tragen (X/Y-Suffix inbegriffen — Raichunite Y gilt nur fuer
 *    Mega Raichu Y). Der Anteil steht als Herkunftsangabe im Modal.
 *    Ohne diesen Hinweis waere die geerbte Zahl eine Behauptung.
 *
 * 2) SECHZEHN MEGA-FAEHIGKEITEN FEHLEN — und es gibt keine Quelle
 *    dafuer. Es sind die Champions-eigenen M-B-Formen: roster.json
 *    kennt sie nicht (258 Eintraege, am 29.08.2026 in Chrome
 *    nachgesehen), championsbattledata hat keine Seite fuer sie,
 *    Smogon liefert nur Werte und Typen. Die Zeile stillschweigend
 *    wegzulassen las sich wie "hat keine besondere Faehigkeit". Also
 *    wird die Luecke benannt. Geraten wird nichts (CLAUDE.md).
 *
 * 3) DIE ENGLISCHE OBERFLAECHE BEKAM KEINE FAEHIGKEITSTEXTE.
 *    champions_names_de.json heisst nach den deutschen Namen, traegt
 *    aber auch `abilityFx` — und das zweisprachig, alle 194 Eintraege
 *    mit de UND en. Der Sprachriegel stand vor der ganzen Datei, also
 *    kam sie im englischen Modus nie an: der deutsche Nutzer las, was
 *    eine Faehigkeit tut, der englische nur ihren Namen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const JS = lies('js/app-side-quest-pokedex.js');
const POKEDEX = JSON.parse(lies('data/champions_pokedex.json'));
const USAGE = JSON.parse(lies('data/champions_usage.json'));
const NAMEN = JSON.parse(lies('data/champions_names_de.json'));

const MEGAS = (POKEDEX.entries || []).filter(e => e.form === 'Mega');
const SLUGS = USAGE.pokemon || USAGE;

/* ── „NEU IST ERLAUBT, VERLOREN NICHT" (12.09.2026) ─────────────────
 *
 * Entschieden vom Betreiber, nachdem der Lauf „Champions Usage Refresh"
 * um 05:12 UTC drei neue Mega-Formen in den Pokedex geschrieben hatte —
 * Baxcalibur, Salamence, Golisopod. Weder Nutzungszahlen noch
 * Faehigkeiten waren da; beides entsteht erst spaeter. Drei
 * Zusicherungen fielen um, der Deploy fiel mit, und die Seite hing den
 * ganzen Vormittag auf dem Stand von gestern, ohne dass etwas kaputt
 * aussah.
 *
 * Die Wachhunde bleiben scharf fuer das, wofuer sie gebaut wurden — eine
 * Form, die ihre Zahlen VERLIERT. Erkannt wird der Unterschied an der
 * Nutzungsdatei: kennt sie die Grundform nicht, ist die Art dort
 * insgesamt neu. Kennt sie die Grundform, fehlt etwas, das da sein
 * muesste.
 */
const grundformSlug = (e) => String((e.meta && e.meta.slug) || '')
    .replace(/-mega(-[xyz])?$/, '');
const istNeu = (e) => !SLUGS[grundformSlug(e)];
const NEUE = MEGAS.filter(istNeu).map(e => e.en);

describe('Mega-Formen erben die Zahlen der Grundform — mit Beleg', () => {
    it('fast jede Mega-Form hat jetzt Nutzungsdaten', () => {
        assert.ok(MEGAS.length >= 60, `nur ${MEGAS.length} Mega-Formen gefunden`);
        const ohne = MEGAS.filter(e => !e.meta || !SLUGS[e.meta.slug]);

        /* ── NEU IST ERLAUBT, VERLOREN NICHT (12.09.2026) ──────────────
         *
         * Am 12.09.2026 um 05:12 UTC schrieb der Lauf „Champions Usage
         * Refresh" drei neue Mega-Formen in den Pokedex — Baxcalibur,
         * Salamence, Golisopod. Nutzungszahlen hatten sie noch keine:
         * die entstehen erst, wenn das Feld sie spielt.
         *
         * Diese Zusicherung fiel deshalb um, der Deploy fiel mit, und
         * die Seite hing den ganzen Vormittag auf dem Stand von gestern
         * — ohne dass irgendetwas kaputt aussah. Genau das Muster, das
         * CLAUDE.md unter „Auch DOKUMENTE sind verdrahtet" beschreibt.
         *
         * Der Wachhund bleibt, aber er bewacht die richtige Sache: eine
         * Form, die ihre Zahlen VERLIERT, ist ein Datenausfall. Eine
         * Form, die noch nie welche hatte, ist ein neues Set.
         *
         * Unterschieden wird an der Nutzungsdatei selbst: kennt sie die
         * GRUNDFORM nicht, ist die Art dort insgesamt neu. Kennt sie die
         * Grundform, hat die Mega-Form ihre Zahlen verloren — und dann
         * faellt der Test wie bisher.
         *
         * Entschieden vom Betreiber am 12.09.2026 („Zusicherung auf
         * ‚neu ist erlaubt'"). */
        const nurNeu = ohne.filter(istNeu);
        const verloren = ohne.filter(e => !istNeu(e));

        assert.deepEqual(verloren.map(e => e.en), [],
            'diese Mega-Formen zeigen "keine Nutzungsdaten", obwohl ihre Grundform '
            + 'welche hat — das ist ein Datenausfall, kein neues Set');

        /* Und die Zahl bleibt klein. Zehn neue Formen auf einmal waeren
           kein neues Set mehr, sondern ein Fehler im Bau. */
        assert.ok(nurNeu.length <= 5,
            `${nurNeu.length} Mega-Formen ohne Nutzungsdaten (${
                nurNeu.map(e => e.en).join(', ')}) — das sind zu viele fuer `
            + '"neu dazugekommen"');
    });

    it('geerbt wird nur, wenn die Grundform den Stein wirklich haelt', () => {
        // Der Kern der Sache: ohne diese Bedingung waere die
        // Uebernahme geraten. Wir pruefen sie gegen die Rohdaten, nicht
        // gegen den Bauer.
        const schief = [];
        for (const e of MEGAS) {
            const m = e.meta || {};
            if (!m.viaBase) continue;
            const rec = SLUGS[m.slug];
            const items = [];
            for (const fmt of Object.keys(rec || {})) {
                const blk = rec[fmt];
                if (blk && Array.isArray(blk.held_item)) items.push(...blk.held_item);
            }
            const treffer = items.find(i => i && i.name === m.viaStone);
            if (!treffer) { schief.push(`${e.en}: ${m.viaStone} steht nicht in ${m.slug}`); continue; }
            if (Math.abs((treffer.pct || 0) - m.viaStonePct) > 0.05) {
                schief.push(`${e.en}: Anteil ${m.viaStonePct} statt ${treffer.pct}`);
            }
        }
        assert.deepEqual(schief, [], schief.join('\n  '));
    });

    it('kein X/Y-Stein landet bei der falschen Form', () => {
        // Raichunite Y gehoert zu Mega Raichu Y, nicht zu X. Ein
        // Prefix-Vergleich haette beide bedient.
        const schief = MEGAS
            .filter(e => /\b(X|Y)$/.test(e.en) && (e.meta || {}).viaStone)
            .filter(e => {
                const suffix = e.en.slice(-1);
                return !new RegExp('\\b' + suffix + '$').test(e.meta.viaStone);
            })
            .map(e => `${e.en} <- ${e.meta.viaStone}`);
        assert.deepEqual(schief, [], `Stein passt nicht zur Form: ${schief}`);
    });

    it('die Oberflaeche zeigt die Herkunft an', () => {
        assert.match(JS, /function viaBaseNote\(/,
            'ohne diesen Hinweis steht eine geerbte Zahl da wie eine eigene');
        assert.match(JS, /\$\{viaBaseNote\(e\)\}/,
            'viaBaseNote wird nirgends eingesetzt');
        // Er muss beide Enden nennen: woher, und wofuer der Anteil steht.
        for (const teil of ['viaBase', 'viaStone', 'viaStonePct']) {
            assert.ok(JS.includes('m.' + teil) || JS.includes(teil + ':'),
                `der Hinweis nennt ${teil} nicht`);
        }
    });

    it('der Hinweis steht in beiden Sprachen', () => {
        const treffer = [...JS.matchAll(/viaBase: \(basis, stein, pct\) =>/g)];
        assert.equal(treffer.length, 2,
            `${treffer.length} Sprachfassungen statt 2 — eine Seite bekaeme den ` +
            `Hinweis in der falschen Sprache oder gar nicht`);
    });
});

describe('Die fehlenden Mega-Faehigkeiten werden benannt', () => {
    it('die Luecke steht als Liste in den Daten', () => {
        const meta = POKEDEX._meta || {};
        assert.ok(Array.isArray(meta.megaAbilityMissing),
            'ohne diese Liste ist die Luecke wieder unsichtbar');
        const gerechnet = MEGAS
            .filter(e => !(e.megaAbility || '').trim())
            .map(e => e.en).sort();
        assert.deepEqual([...meta.megaAbilityMissing].sort(), gerechnet,
            'die gemeldete Liste stimmt nicht mit den Eintraegen ueberein');
        assert.ok((meta.megaAbilityMissingNote || '').length > 40,
            'die Begruendung fehlt — dann liest sich die Liste wie ein Fehler');
    });

    it('nichts wurde stattdessen erfunden', () => {
        // Die Gegenprobe zur Luecke: jede GEFUELLTE Mega-Faehigkeit muss
        // ein Name sein, den unsere Faehigkeitsdaten kennen. Ein
        // geratener Wert faellt hier durch.
        const bekannt = new Set(Object.keys((NAMEN.abilities) || {}));
        const fx = new Set(Object.keys((NAMEN.abilityFx) || {}));
        const unbekannt = MEGAS
            .map(e => e.megaAbility)
            .filter(Boolean)
            .filter(a => !bekannt.has(a) && !fx.has(a));
        assert.deepEqual(unbekannt, [],
            `Mega-Faehigkeit ohne Entsprechung in den Faehigkeitsdaten: ${unbekannt}`);
    });

    it('die Oberflaeche sagt es, statt die Zeile wegzulassen', () => {
        assert.ok(JS.includes("(e.form === 'Mega' || e.megaAbility)"),
            'ohne Faehigkeit faellt die Zeile wieder stumm weg');
        const treffer = [...JS.matchAll(/megaAbilityUnknown:/g)];
        assert.equal(treffer.length, 2, 'der Hinweis fehlt in einer der beiden Sprachen');
        assert.ok(JS.includes('sqp-d-megaab--unknown'),
            'die Luecke sieht aus wie eine Angabe');
    });

    it('die Liste ist genau so lang wie gemessen', () => {
        // Waechst sie, ist eine neue Form dazugekommen und niemand hat
        // die Quelle nachgezogen. Schrumpft sie, ist eine Quelle
        // aufgetaucht — dann gehoert die Begruendung ueberarbeitet.
        //
        // Am 31.08.2026 ist genau das passiert, in zwei Schritten:
        // pokebase.app fuehrt die Werte doch (der Befund vom 30.08., es
        // gebe keine oeffentliche Quelle, war falsch) — vier trugen den
        // Einzelbeleg allein. Die uebrigen zwoelf hat der Betreiber
        // noch am selben Tag bestaetigt. Die Luecke ist damit zu.
        /* Dieselbe Trennung wie oben: eine Form, die erst seit dem
           letzten Lauf im Pokedex steht, darf hier stehen — fuer eine
           Faehigkeit braucht es eine Quelle, und die entsteht nicht in
           derselben Nacht. Jede andere ist der alte Befund. */
        const fehlt = (POKEDEX._meta.megaAbilityMissing || [])
            .filter(n => NEUE.indexOf(n) < 0);
        assert.deepEqual(fehlt, [],
            'eine Mega-Form steht wieder ohne belegte Faehigkeit da — ' +
            'nachsehen, warum, und die Begruendung im Bauer nachziehen');
        assert.equal((POKEDEX._meta.megaAbilityBelegt || []).length, 16,
            'die Zahl der nachtraeglich belegten hat sich geaendert');
    });

    it('jeder nachgetragene Wert traegt, woher er kommt', () => {
        // Die Gegenprobe zur Luecke von der anderen Seite: ein Wert, der
        // nachtraeglich hereinkam, muss seine Herkunft mitfuehren.
        // Sonst steht er irgendwann neben den geprueften M-A-Werten und
        // niemand weiss mehr, welcher woher stammt.
        const belegt = new Set(POKEDEX._meta.megaAbilityBelegt || []);
        assert.ok(belegt.size > 0, 'Testvoraussetzung: mindestens einer');
        for (const e of MEGAS) {
            if (!belegt.has(e.en)) continue;
            assert.ok((e.megaAbility || '').trim(),
                `${e.en} gilt als belegt, fuehrt aber keine Faehigkeit`);
            assert.equal(e.megaAbilityQuelle, 'pokebase',
                `${e.en}: Herkunft fehlt oder ist unerwartet`);
        }
        // Und umgekehrt: kein Eintrag darf eine Herkunft behaupten,
        // ohne in der Liste zu stehen.
        const behauptet = MEGAS.filter(e => e.megaAbilityQuelle).map(e => e.en).sort();
        assert.deepEqual(behauptet, [...belegt].sort());
    });

    it('jede Mega-Form fuehrt jetzt eine Faehigkeit', () => {
        const ohne = MEGAS.filter(e => !(e.megaAbility || '').trim())
            .map(e => e.en).filter(n => NEUE.indexOf(n) < 0);
        assert.deepEqual(ohne, [],
            'ohne Faehigkeit steht in der Oberflaeche wieder ein Platzhalter: ' + ohne);
        /* Und die Neuen bleiben sichtbar, statt stillschweigend
           durchzurutschen: waechst ihre Zahl ueber eine Handvoll, ist
           das kein neues Set mehr, sondern ein Fehler im Bau. */
        assert.ok(NEUE.length <= 5,
            `${NEUE.length} Mega-Formen sind neu und ohne Daten (${NEUE.join(', ')})`);
    });

    it('die Luecke wird nicht mehr als quellenlos beschrieben', () => {
        // Der alte Wortlaut ("keine oeffentliche Quelle fuehrt sie") war
        // eine Aussage ueber die Welt, und sie stimmt seit dem
        // 31.08.2026 nicht mehr. Sie darf nicht zurueckkommen.
        const note = POKEDEX._meta.megaAbilityMissingNote || '';
        assert.ok(!/keine oeffentliche Quelle/i.test(note),
            'der widerlegte Satz steht wieder in den Daten');
        assert.ok(/champions_mega_faehigkeiten\.json/.test(note),
            'die Notiz muss sagen, wo die Herkunft je Form steht');
    });
});

describe('Faehigkeitstexte erreichen auch die englische Oberflaeche', () => {
    it('die Namensdatei wird nicht mehr am Sprachriegel abgewiesen', () => {
        const i = JS.indexOf('function loadNamesDe()');
        assert.notEqual(i, -1, 'loadNamesDe ist verschwunden');
        const rumpf = JS.slice(i, i + 700);
        assert.ok(!/uiLang\(\)\s*!==\s*'de'/.test(rumpf),
            'der Riegel steht wieder vor der ganzen Datei — dann bekommt die ' +
            'englische Oberflaeche zu keiner Faehigkeit eine Erklaerung');
    });

    it('die deutschen NAMEN bleiben trotzdem deutschen Nutzern vorbehalten', () => {
        // Die Gegenprobe: nur der Wirkungstext ist zweisprachig, der
        // Name nicht. Sonst stuende im englischen Modal "Sandsturm".
        const treffer = [...JS.matchAll(/uiLang\(\) === 'de' \? deName\(en, kind\) : null/g)];
        assert.equal(treffer.length, 2,
            `${treffer.length} statt 2 Sprachweichen bei der Namensanzeige`);
    });

    it('jeder Wirkungstext hat beide Sprachen', () => {
        const fx = NAMEN.abilityFx || {};
        const anzahl = Object.keys(fx).length;
        assert.ok(anzahl >= 100, `nur ${anzahl} Wirkungstexte — die Datei ist kaputt`);
        const halb = Object.entries(fx)
            .filter(([, v]) => !(v && (v.de || '').trim() && (v.en || '').trim()))
            .map(([k]) => k);
        assert.deepEqual(halb, [], `einsprachige Wirkungstexte: ${halb.slice(0, 8)}`);
    });
});
