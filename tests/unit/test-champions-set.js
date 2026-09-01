/**
 * js/champions-set.js — die Zahlen und die Umrechnung, an einer Stelle.
 *
 * Pokémon Champions rechnet Statuswertpunkte anders als die Hauptreihe:
 * 0–32 je Wert, Summe hoechstens 66. Showdown rechnet EVs: 0–252, Summe
 * hoechstens 510. Der Faktor ist 8.
 *
 * Bis zum 26.08.2026 lagen diese Zahlen an drei Stellen verstreut (Rechner,
 * Play-Overlay, Scraper) — und der Export kannte keine davon. Er schrieb die
 * rohen 0–32 unter das Etikett "EVs:". Fuer Limitless ist das richtig, fuer
 * Showdown um den Faktor 8 daneben: ein Bau mit "32 Atk" spielte dort mit
 * einem Achtel des gemeinten Angriffs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'champions-set.js'), 'utf8'), sandbox);
const CS = sandbox.window.ChampionsSet;
const rein = v => JSON.parse(JSON.stringify(v));

describe('ChampionsSet: die Zahlen', () => {
    it('haengt sich an window und traegt die Konstanten', () => {
        assert.ok(CS);
        assert.equal(CS.SP_BUDGET, 66);
        assert.equal(CS.SP_MAX, 32);
        assert.equal(CS.EV_SCALE, 8);
        assert.equal(CS.EV_MAX, 252);
        // EV_TOTAL_MAX (510) ist am 01.09.2026 entfallen: es war der
        // Deckel fuer eine Umrechnung, die es nicht mehr gibt. Siehe die
        // Begruendung weiter unten.
        assert.equal(CS.EV_TOTAL_MAX, undefined);
    });

    it('die sechs Werte stehen in Spielreihenfolge', () => {
        assert.deepEqual(rein(CS.KEYS), ['hp', 'atk', 'def', 'spa', 'spd', 'spe']);
    });
});

describe('ChampionsSet: klemmen', () => {
    it('deckelt je Wert bei 32', () => {
        assert.equal(CS.clampSpread({ atk: 99 }).atk, 32);
    });

    it('deckelt die Summe bei 66 und schneidet ab, statt umzuverteilen', () => {
        // Bewusst abschneiden: wer 40 auf Angriff schiebt, soll die
        // verlorenen Punkte sehen und selbst entscheiden, wohin sie gehen.
        const s = CS.clampSpread({ hp: 40, atk: 40, spe: 40 });
        assert.equal(CS.spreadTotal(s), 66);
        assert.deepEqual(rein(s), { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 2 });
    });

    it('das Ergebnis haengt nicht an der Reihenfolge der Eingabe', () => {
        // Waere hier "groesster zuerst" verdrahtet, haette dieselbe Eingabe
        // je nach Reglerbewegung ein anderes Ergebnis.
        const a = CS.clampSpread({ spe: 32, atk: 32, hp: 32 });
        const b = CS.clampSpread({ hp: 32, atk: 32, spe: 32 });
        assert.deepEqual(rein(a), rein(b));
    });

    it('Unsinn wird zu null, nicht zu NaN', () => {
        const s = CS.clampSpread({ hp: 'viel', atk: -5, def: null, spa: 1.9 });
        assert.deepEqual(rein(s), { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 });
    });
});

describe('ChampionsSet: lesen und schreiben', () => {
    it('liest die englischen Kuerzel der Quelle', () => {
        assert.deepEqual(rein(CS.parseSpread('2 HP / 32 Atk / 32 Spe')),
            { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
    });

    it('liest auch die deutschen aus dem Telegram-Bauplan', () => {
        assert.deepEqual(rein(CS.parseSpread('2 KP / 32 ANG / 32 INI')),
            { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
    });

    it('geht verlustfrei hin und zurueck', () => {
        const t = '2 HP / 32 Atk / 1 SpD / 31 Spe';
        assert.equal(CS.toChampionsText(CS.parseSpread(t)), t);
    });

    it('schreibt keine Nullen mit', () => {
        assert.equal(CS.toChampionsText({ hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 }),
            '32 Atk');
        assert.equal(CS.toChampionsText(CS.leer()), '');
    });
});

describe('ChampionsSet: EINE Zahlenwelt, nicht zwei', () => {
    /* BIS ZUM 01.09.2026 STANDEN HIER DREI PRUEFUNGEN AN toShowdownText()
       UND showdownUeberschuss().
       Sie hielten fest, dass der Showdown-Export die Punkte mal 8 rechnet
       (32 -> 252) und meldet, wenn ein Bau das 510er-EV-Budget sprengt.

       Beides war ab dem 26.08.2026 falsch, und der Betreiber hat es
       bemerkt: "wir machen den Showdown paste falsch oder? showdown
       arbeitet doch sicher mittlerweile auch mit den max 32 wie beim
       Limitless paste oder?"

       Nachgeprueft am Quelltext des Simulators
       (github.com/smogon/pokemon-showdown, Stand 01.09.2026):

         sim/dex-formats.ts    format.mod.startsWith('champions')
                                   -> this.evLimit = 66
         sim/team-validator.ts useStatPoints = mod.startsWith('champions');
                               set.evs[stat] > 32
                                   -> "has more than 32 Stat Points in ..."
         data/aliases.ts       cou: "[Gen 9 Champions] OU"

       Ein umgerechneter Bau wurde von Showdown also nicht falsch
       verstanden, sondern abgelehnt: 252 waeren dort 252 Statuspunkte.

       Die Tests pruefen deshalb jetzt das Gegenteil — dass es genau EINE
       Serialisierung gibt und keine zweite zurueckkommt. Das ist die
       Zusicherung, die etwas wert ist: die Umrechnung war nicht kaputt,
       sie war ueberfluessig, und ihr Rueckbau ist der Fehler, den man beim
       naechsten Mal wieder macht. */

    it('es gibt nur eine Serialisierung', () => {
        assert.equal(typeof CS.toChampionsText, 'function');
        assert.equal(CS.toShowdownText, undefined,
            'die Umrechnung fuer den Paste ist zurueck — siehe Kopf von js/champions-set.js');
        assert.equal(CS.showdownUeberschuss, undefined,
            'die 510er-Warnung ist zurueck; Showdown deckelt Champions bei 66 Punkten');
        assert.equal(CS.EV_TOTAL_MAX, undefined);
    });

    it('und sie schreibt die Punkte, wie sie sind', () => {
        // Genau der Fall aus der Meldung: 2/32/32 bleibt 2/32/32.
        const s = CS.parseSpread('2 HP / 32 Atk / 32 Spe');
        assert.equal(CS.toChampionsText(s), '2 HP / 32 Atk / 32 Spe');
        // Keine Zahl darueber, die Showdown zurueckweisen wuerde.
        for (const m of CS.toChampionsText(s).matchAll(/(\d+) /g)) {
            assert.ok(Number(m[1]) <= CS.SP_MAX, `${m[1]} liegt ueber dem Deckel von ${CS.SP_MAX}`);
        }
        assert.ok(CS.spreadTotal(s) <= CS.SP_BUDGET);
    });

    it('der Umrechnungsfaktor bleibt — aber nur fuer die Statusformel', () => {
        /* EV_SCALE und EV_MAX sind nicht geloescht: js/app-side-quest-play.js
           fuettert damit die Hauptreihen-Formel, um aus Champions-Punkten
           einen Initiative-Wert zu machen. Das ist eine Rechnung ueber
           Werte, kein Schreiben von Text. */
        assert.equal(CS.EV_SCALE, 8);
        assert.equal(CS.EV_MAX, 252);
        const PLAY = fs.readFileSync(
            path.join(__dirname, '..', '..', 'js', 'app-side-quest-play.js'), 'utf8');
        assert.match(PLAY, /CHAMPIONS_EV_SCALE/,
            'die Statusformel benutzt den Faktor nicht mehr — dann kann er weg');
    });

    it('kein Aufrufer rechnet den Paste noch um', () => {
        const dir = path.join(__dirname, '..', '..', 'js');
        const treffer = fs.readdirSync(dir).filter(f => f.endsWith('.js')).filter(f => {
            const txt = fs.readFileSync(path.join(dir, f), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
            return /toShowdownText|showdownUeberschuss/.test(txt);
        });
        assert.deepEqual(treffer, [], 'diese Dateien rufen die Umrechnung wieder auf: ' + treffer);
    });
});
