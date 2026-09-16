/**
 * DER SCHADENSRECHNER ALS EIGENER REITER.
 *
 * ANLASS (Betreiber, 16.09.2026): „aber der Damage Culc ist ja immer
 * noch kein eigenes Feature … ich erwarte schon etwas in richtung von
 * NCP — nur optisch schoener, besser zu bedienen und klarer."
 *
 * Bis dahin war der Rechner ein UNTERZUSTAND der Matchup-Liste: erst
 * ein Pokemon waehlen, dann eine Zeile anklicken. Wer ihn suchte, fand
 * ihn nicht.
 *
 * WAS HIER WIRKLICH SCHIEFGEHEN KANN — beides ist beim Bauen passiert
 * und live gemessen worden, bevor es hier stand:
 *
 *  1. ZWEI ANSICHTEN, EIN SATZ ZUHOERER. Die gemeinsamen Regler in
 *     wire() riefen render() — und render() zeichnet den MATCHUP-Kasten.
 *     Im Rechner-Reiter aenderte der Volltreffer die Zahl also NICHT,
 *     waehrend der gemerkte Stand daneben die neue Zahl trug. Nichts sah
 *     kaputt aus; die Zahl war nur falsch.
 *  2. DIE ANSICHTSFAHNE LEBTE NUR WAEHREND DES ZEICHNENS. editorTarget()
 *     haette in jedem spaeteren Klick das Set des MATCHUP-Paares
 *     bearbeitet: man dreht an den Reglern des einen und aendert den
 *     Satz des anderen.
 *
 * KEINE LIVEDATEN, KEIN jsdom.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-matchups.js'), 'utf8');
const DMG = fs.readFileSync(path.join(ROOT, 'js', 'champions-damage.js'), 'utf8');
const RES = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-resources.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'side-quest.css'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const SRC_C = stripJs(SRC);
const RES_C = stripJs(RES);
const CSS_C = stripCss(CSS);

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const DATA = {
    usage: read('champions_usage.json'),
    dex: read('champions_pokedex.json'),
    teams: read('champions_replica_teams.json'),
    res: read('champions_resources.json'),
    chart: read('champions_type_chart.json'),
    names: read('champions_names_de.json'),
    flags: read('champions_move_flags.json'),
};

function load(lang = 'de') {
    const sandbox = {
        console,
        document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}) },
        getLang: () => lang,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
        BASE_PATH: 'data/',
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(DMG, sandbox);
    vm.runInContext(SRC, sandbox);
    const api = sandbox._sqMatchupInternals;
    api.setData(DATA);
    return api;
}

/** Ein Paar aus den echten Daten, bei dem beide Seiten Schaden machen. */
function paar(api) {
    const roster = api.setData(DATA);
    const namen = roster.map(r => r.name);
    for (const a of namen) {
        const sa = api.teamSet('me', a);
        if (!sa) continue;
        for (const d of namen) {
            if (d === a) continue;
            const sd = api.teamSet('opp', d);
            if (!sd) continue;
            const hin = api.moveTable(a, sa, d, sd);
            const her = api.moveTable(d, sd, a, sa);
            if (hin.length && her.length && hin[0].range.max > 0 && her[0].range.max > 0) {
                return { me: a, opp: d, meSet: sa, oppSet: sd, hin, her };
            }
        }
    }
    throw new Error('kein rechenbares Paar in den echten Daten gefunden');
}

describe('Der Reiter existiert und ist verdrahtet', () => {
    it('steht in index.html als Unterreiter und hat einen eigenen Kasten', () => {
        assert.ok(/data-sq-view="rechner"/.test(INDEX),
            'kein Unterreiter „rechner" — dann bleibt der Rechner unauffindbar');
        assert.ok(/id="sideQuestRechnerHost"/.test(INDEX), 'kein eigener Kasten');
        // Und er steht VOR dem Team-Builder, wie im Entwurf abgenommen.
        assert.ok(INDEX.indexOf('data-sq-view="rechner"') < INDEX.indexOf('data-sq-view="builder"'),
            'der Rechner-Reiter steht hinter dem Team-Builder');
    });

    it('die Ansichtsumschaltung kennt ihn und ruft ihn auf', () => {
        assert.ok(/rechner:\s*'sideQuestRechnerHost'/.test(RES_C),
            'der Kasten fehlt in der Host-Tabelle — dann bliebe er beim Wechsel sichtbar');
        assert.ok(/view === 'rechner'[\s\S]{0,120}sideQuestRechner\.activate\(\)/.test(RES_C),
            'der Reiter wird nie aktiviert');
    });

    it('das Modul bietet den Einstieg nach aussen an', () => {
        const api = load();
        assert.ok(api.rechnerHtml && api.rechFall, 'die Rechnerteile fehlen');
    });
});

describe('Der Fall, den das Kopfband zeigt', () => {
    it('folgt der gewaehlten Attacke — und der gewaehlten Richtung', () => {
        const api = load();
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me' });
        const erst = api.rechFall();
        assert.ok(erst, 'kein Fall trotz rechenbarem Paar');
        assert.equal(erst.attName, p.me, 'die Richtung „me" greift nicht vom eigenen Pokemon an');
        // Ohne Wahl: die staerkste Attacke (moveTable sortiert absteigend).
        assert.equal(erst.name, p.hin[0].name,
            'ohne Wahl muss die staerkste Attacke im Kopfband stehen');

        if (p.hin.length > 1) {
            api.rechState({ move: p.hin[1].name });
            assert.equal(api.rechFall().name, p.hin[1].name,
                'die gewaehlte Attacke landet nicht im Kopfband');
        }
        api.rechState({ seite: 'opp', move: null });
        const her = api.rechFall();
        assert.equal(her.attName, p.opp, 'die Gegenrichtung greift nicht vom Gegner an');
        assert.equal(her.defName, p.me);
    });

    it('der Satz traegt Spanne, Anteil und K.O. — nicht nur eine Zahl', () => {
        const api = load();
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me' });
        const f = api.rechFall();
        const html = api.rechSatzHtml(f);
        assert.ok(html.indexOf(`${f.range.min}–${f.range.max}`) !== -1,
            'die Schadensspanne fehlt im Satz');
        assert.ok(html.indexOf('%') !== -1, 'der Anteil fehlt im Satz');
        assert.ok(html.indexOf(api.koLabel(f.range.ko)) !== -1, 'das K.O.-Urteil fehlt im Satz');
    });

    it('jede Sache steht mit EINEM Namen im Satz, nicht mit zweien', () => {
        /* Live gesehen am 16.09.2026: die Kopfzeile las sich „Rillaboom
           Gortrom Wood Hammer Holzhammer gegen Sneasler Snieboss: …" —
           vier Namen, wo zwei genuegen. Ueberall sonst ist die doppelte
           Form richtig; in DIESEM Satz, der die Antwort des ganzen
           Reiters traegt, nicht. */
        const api = load('de');
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me' });
        const f = api.rechFall();
        const html = api.rechSatzHtml(f);
        // Kein <small> — das ist die doppelte Form aus nameHtml().
        assert.ok(html.indexOf('<small>') === -1,
            `der Satz traegt die doppelte Namensform: ${html.replace(/<[^>]+>/g, '')}`);
        // Und der andere Name ist nicht verloren, sondern steht im title.
        const deName = api.nurDeutsch(f.attName, 'pokemon');
        if (deName) {
            assert.ok(html.indexOf(`title="${f.attName}"`) !== -1,
                'der englische Name ist ganz verschwunden statt in den Titel zu wandern');
            assert.ok(html.indexOf(deName) !== -1, 'der deutsche Name fehlt');
        }
    });

    it('beide Richtungen stehen gleichzeitig im Kasten', () => {
        /* Das ist der Unterschied zum NCP-Rechner: dort steht immer nur
           eine Richtung. Im Doppelkampf ist die Frage aber nie „was mache
           ich", sondern „wer legt wen zuerst um". */
        const api = load();
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me' });
        const html = api.rechnerHtml();
        assert.ok(html.indexOf('data-sq-rseite="me"') !== -1, 'die eigene Richtung fehlt');
        assert.ok(html.indexOf('data-sq-rseite="opp"') !== -1, 'die Gegenrichtung fehlt');
        assert.ok(html.indexOf('data-sq-feld="wetter"') !== -1, 'die Feldleiste fehlt');
        assert.ok(html.indexOf('data-sq-rech="me"') !== -1
            && html.indexOf('data-sq-rech="opp"') !== -1,
            'die Pokemon-Auswahl fehlt auf einer Seite — dann ist es kein eigenes Feature');
    });
});

describe('Der Vergleich merkt sich die LAGE, nicht nur die Zahl', () => {
    it('ohne gesetzte Lage steht dort nichts', () => {
        const api = load();
        const p = paar(api);
        api.feldState({ wetter: '', gelaende: '', crit: false });
        assert.equal(api.lageKurz(p.meSet, p.oppSet), '',
            'eine leere Lage darf keinen Text erzeugen — sonst steht in jeder Zeile dasselbe');
    });

    it('jeder gesetzte Teil wird benannt', () => {
        const api = load();
        const p = paar(api);
        api.feldState({ wetter: 'Rain', gelaende: 'Grassy', crit: true });
        p.oppSet.schirm = 'reflect';
        p.meSet.hilfe = true;
        p.oppSet.helfer = true;
        p.meSet.boosts = { atk: 2, def: 0, spa: 0, spd: 0 };
        const t = api.lageKurz(p.meSet, p.oppSet);
        [api.L ? null : null].forEach(() => {});
        ['Regen', 'Grasfeld', 'Volltreffer', 'Reflektor', 'Hilfreiche Hand', 'Helfer']
            .forEach(w => assert.ok(t.indexOf(w) !== -1, `„${w}" fehlt in der Lage: ${t}`));
        assert.ok(/\+2/.test(t), `die Angriffsstufe fehlt in der Lage: ${t}`);
        api.feldState({ wetter: '', gelaende: '', crit: false });
        p.oppSet.schirm = ''; p.meSet.hilfe = false; p.oppSet.helfer = false;
        p.meSet.boosts = { atk: 0, def: 0, spa: 0, spd: 0 };
    });

    it('zweimal derselbe Stand ist kein Vergleich', () => {
        const api = load();
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me', verlauf: [] });
        api.merkeStand();
        api.merkeStand();
        assert.equal(api.rechState().verlauf.length, 1,
            'derselbe Stand darf nicht zweimal in der Liste stehen');
    });

    it('ein anderer Stand kommt dazu, und die Liste bleibt gedeckelt', () => {
        const api = load();
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me', verlauf: [] });
        api.merkeStand();
        api.feldState({ crit: true });
        api.merkeStand();
        api.feldState({ crit: false });
        const v = api.rechState().verlauf;
        assert.equal(v.length, 2, 'der zweite Stand fehlt');
        assert.notEqual(v[0].satz, v[1].satz, 'beide Staende tragen dieselbe Zahl');
        assert.ok(v.find(x => /Volltreffer/.test(x.lage)),
            'kein Stand nennt den Volltreffer, durch den er sich unterscheidet');

        /* Deckel: mehr als zwoelf merkt sich die Liste nicht. Jeder
           Eintrag muss dafuer WIRKLICH neu sein — sonst greift schon die
           Doppelsperre darueber und der Deckel bliebe ungeprueft. Die
           Stufe der Angriffsseite wandert deshalb bei jedem Durchgang
           eins weiter; die steht in der Lage und macht jede Zeile
           einzigartig. */
        api.rechState({ verlauf: [] });
        for (let i = 0; i < 20; i++) {
            p.meSet.boosts = { atk: (i % 6) + 1, def: Math.floor(i / 6), spa: 0, spd: 0 };
            api.merkeStand();
        }
        p.meSet.boosts = { atk: 0, def: 0, spa: 0, spd: 0 };
        const lang = api.rechState().verlauf;
        assert.equal(new Set(lang.map(x => x.lage)).size, lang.length,
            'die Probe hat Doppeleintraege erzeugt — dann prueft der Deckel nichts');
        assert.ok(lang.length <= 12,
            `die Vergleichsliste waechst unbegrenzt (${lang.length})`);
    });

    it('die Liste wird erst gezeichnet, wenn etwas drinsteht', () => {
        const api = load();
        api.rechState({ verlauf: [] });
        assert.equal(api.verlaufHtml(), '', 'ein leerer Vergleichskasten steht im Weg herum');
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, move: null, seite: 'me' });
        api.merkeStand();
        assert.ok(api.verlaufHtml().indexOf('sq-verl-zeile') !== -1, 'die Zeile fehlt');
    });
});

describe('Zwei Ansichten, ein Satz Zuhoerer', () => {
    it('kein gemeinsamer Zuhoerer zeichnet blind den Matchup-Kasten', () => {
        /* Der Fehler, der beim Bauen live gemessen wurde: die Regler in
           wire() riefen render(), und render() zeichnet den MATCHUP-
           Kasten. Geprueft wird der Rumpf von wire(), ohne Kommentare —
           sonst macht die Erklaerung darueber die Probe blind. */
        const start = SRC_C.indexOf('function wire(host)');
        const ende = SRC_C.indexOf('function wireTeam(host)');
        assert.ok(start !== -1 && ende > start, 'wire() nicht gefunden');
        const rumpf = SRC_C.slice(start, ende);
        assert.ok(rumpf.indexOf('zeichne();') !== -1,
            'wire() ruft nirgends zeichne() — dann kennt kein Zuhoerer die Ansicht');
        assert.ok(!/(^|[^a-zA-Z.])render\(\);/.test(rumpf),
            'wire() ruft noch direkt render() — im Rechner-Reiter bliebe die Zahl stehen');
        assert.ok(SRC_C.length > SRC.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    });

    it('die Ansichtsfahne ueberlebt den Zeichenvorgang', () => {
        /* AUSGEFUEHRT: nach renderRechner() muss editorTarget() das Paar
           des RECHNERS liefern, nicht das der Matchup-Liste. Genau das
           war beim ersten Einbau falsch. */
        const api = load();
        const p = paar(api);
        api.rechState({ me: p.me, opp: p.opp, an: true });
        assert.equal(api.editorTarget('me').name, p.me,
            'im Rechner-Reiter zeigt der Set-Editor auf das falsche Pokemon');
        assert.equal(api.editorTarget('opp').name, p.opp,
            'im Rechner-Reiter zeigt der Gegner-Editor auf das falsche Pokemon');
        api.rechState({ an: false });
        assert.notEqual(api.editorTarget('me').name, undefined,
            'ausserhalb des Rechners muss weiter das Matchup-Paar gelten');
    });
});

describe('Hilfreiche Hand und Helfer', () => {
    it('gehoeren an die SEITE, nicht ans Feld', () => {
        const api = load();
        const roster = api.setData(DATA);
        const set = api.teamSet('me', roster[0].name);
        assert.equal(set.hilfe, false, 'ein frisches Set startet ohne Hilfreiche Hand');
        assert.equal(set.helfer, false, 'ein frisches Set startet ohne Helfer');
        const html = api.lageHtml('me', set);
        assert.ok(html.indexOf('data-sq-flag="hilfe"') !== -1, 'kein Haken fuer die Hilfreiche Hand');
        assert.ok(html.indexOf('data-sq-flag="helfer"') !== -1, 'kein Haken fuer den Helfer');
    });

    it('die Hand hebt den Schaden, der Helfer senkt ihn — und zwar auf der richtigen Seite', () => {
        const api = load();
        const p = paar(api);
        const mn = p.hin[0].name;
        const rechne = () => api.rangeFor(p.me, p.meSet, api.statsOf(p.me, p.meSet),
            p.opp, p.oppSet, api.statsOf(p.opp, p.oppSet), mn);
        const grund = rechne().max;
        p.meSet.hilfe = true;
        const mitHand = rechne().max;
        p.meSet.hilfe = false;
        p.oppSet.hilfe = true;          // die Hand des VERTEIDIGERS darf nichts tun
        const fremdeHand = rechne().max;
        p.oppSet.hilfe = false;
        p.oppSet.helfer = true;
        const mitHelfer = rechne().max;
        p.oppSet.helfer = false;
        const meinHelfer = (() => { p.meSet.helfer = true; const v = rechne().max; p.meSet.helfer = false; return v; })();

        assert.ok(mitHand > grund, `Hilfreiche Hand muss heben (${mitHand} statt ${grund})`);
        assert.equal(fremdeHand, grund,
            'die Hilfreiche Hand des Verteidigers darf den Schaden nicht aendern');
        assert.ok(mitHelfer < grund, `Helfer muss senken (${mitHelfer} statt ${grund})`);
        assert.equal(meinHelfer, grund,
            'der Helfer der ANGREIFERSEITE darf den Schaden nicht aendern');
        assert.equal(rechne().max, grund, 'zurueckgesetzt muss der Grundwert wiederkommen');
    });

    it('der Helfer wirkt auch beim Volltreffer — ein Schirm nicht', () => {
        /* Der Volltreffer hebt SCHIRME auf, nicht Faehigkeiten. Stuende
           der Helfer bei den Schirmen, waere er im Volltreffer wirkungslos. */
        const api = load();
        const p = paar(api);
        const mn = p.hin[0].name;
        const rechne = () => api.rangeFor(p.me, p.meSet, api.statsOf(p.me, p.meSet),
            p.opp, p.oppSet, api.statsOf(p.opp, p.oppSet), mn);
        api.feldState({ crit: true });
        const critPur = rechne().max;
        p.oppSet.helfer = true;
        const critHelfer = rechne().max;
        p.oppSet.helfer = false;
        api.feldState({ crit: false });
        assert.ok(critHelfer < critPur,
            `der Helfer muss auch im Volltreffer senken (${critHelfer} statt ${critPur})`);
    });
});

describe('Das Stylesheet traegt den Reiter', () => {
    it('die neuen Regeln stehen da und benutzen die Marken', () => {
        ['.sq-rech-kopf', '.sq-rech-satz', '.sq-rech-zwei', '.sq-rech-mv',
         '.sq-verl-zeile', '.sq-rech-saetze', '.sq-partner']
            .forEach(sel => assert.ok(CSS_C.indexOf(sel) !== -1, `${sel} fehlt in side-quest.css`));
        assert.ok(CSS_C.length > CSS.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    });

    it('die Attackenzeile bricht auf schmalen Schirmen um', () => {
        /* Gesucht wird der Block, der WIRKLICH die Rechnerzeile umbricht
           — es gibt mehrere 560er-Grenzen in dieser Datei, und die erste
           gehoert einer anderen Regel. */
        const i = CSS_C.indexOf('.sq-console .sq-rech-mv {\n        grid-template-columns');
        assert.ok(i !== -1, 'die Attackenzeile hat keinen Umbruch fuer schmale Schirme');
        const vor = CSS_C.slice(0, i);
        const media = vor.lastIndexOf('@media');
        assert.ok(media !== -1 && /max-width:\s*560px/.test(vor.slice(media, media + 60)),
            'der Umbruch haengt nicht an einer 560-px-Grenze');
        assert.ok(CSS_C.slice(i, i + 700).indexOf('grid-template-areas') !== -1,
            'die Attackenzeile behaelt vier Spalten auf dem Handy');
    });
});
