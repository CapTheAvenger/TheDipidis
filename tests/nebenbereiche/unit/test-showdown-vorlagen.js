/**
 * Deckvorlagen fuer TCG Showdown — scripts/showdown_vorlagen.js
 * =============================================================
 *
 * Bestellung Hausi, 02.11.2026: Tier 1–3 des aktuellen Metas, je Archetyp die
 * bestplatzierte Liste des letzten Majors, sonst die beste Online-Liste; jeden
 * Dienstag mit dem Wochenlauf neu.
 *
 * Geprueft wird VERHALTEN (die Funktionen werden ausgefuehrt), nicht Text —
 * ausser fuer die Ablaufdatei, die wirklich Text ist.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const V = require(path.join(ROOT, 'scripts', 'showdown_vorlagen.js'));

function liste(platz, spieler, archetyp, karten) {
    return karten.map(([anzahl, name, set, nummer, typ]) => ({
        place: String(platz), player_name: spieler, deck_archetype: archetyp,
        count: String(anzahl), card_name: name, set_code: set, set_number: nummer, type: typ || '',
        wins: '7', losses: '2', ties: '0', spielerzahl: '',
    }));
}
const SECHZIG = [[4, 'Dreepy', 'TWM', '128', 'Basic'], [3, 'Dragapult ex', 'TWM', '130', 'Stage 2'], [53, 'Psychic Energy', 'SVE', '5', 'Basic Energy']];
const NEUNUNDFUENFZIG = [[4, 'Dreepy', 'TWM', '128', 'Basic'], [3, 'Dragapult ex', 'TWM', '130', 'Stage 2'], [52, 'Psychic Energy', 'SVE', '5', 'Basic Energy']];
const gleich = (x) => x;

describe('Showdown-Vorlagen: die bestplatzierte Liste je Archetyp', () => {
    it('nimmt den besseren Platz, nicht die erste Zeile', () => {
        const zeilen = [...liste(12, 'B', 'Dragapult', SECHZIG), ...liste(3, 'A', 'Dragapult', SECHZIG)];
        const beste = V.bestenJeArchetyp(zeilen, gleich);
        assert.equal(beste.get('Dragapult').platz, 3);
        assert.equal(beste.get('Dragapult').spieler, 'A');
    });

    it('eine Liste ohne 60 Karten ist keine Vorlage — auch nicht auf Platz 1', () => {
        const zeilen = [...liste(1, 'A', 'Dragapult', NEUNUNDFUENFZIG), ...liste(9, 'B', 'Dragapult', SECHZIG)];
        assert.equal(V.bestenJeArchetyp(zeilen, gleich).get('Dragapult').platz, 9);
    });

    it('fasst Turniernamen ueber die Namensbruecke zusammen', () => {
        const zeilen = [...liste(4, 'A', 'Dhelmise Banette', SECHZIG)];
        const beste = V.bestenJeArchetyp(zeilen, (n) => (n === 'Dhelmise Banette' ? 'Dhelmise' : n));
        assert.ok(beste.has('Dhelmise'));
        assert.equal(beste.get('Dhelmise').archetypRoh, 'Dhelmise Banette');
    });
});

describe('Showdown-Vorlagen: welches Major', () => {
    const majors = [
        { tournament_id: '0077', tournament_name: 'Nice', tournament_date: '2026-10-17' },
        { tournament_id: '0078', tournament_name: 'Puebla', tournament_date: '2026-10-24' },
        { tournament_id: '0076', tournament_name: 'Louisville', tournament_date: '2026-10-09' },
    ];
    it('das juengste Major mit Listen', () => {
        const r = V.waehleMajor(majors, new Map([['0077', [1]], ['0078', [1]], ['0076', [1]]]));
        assert.equal(r.major.tournament_name, 'Puebla');
        assert.deepEqual(r.ohneListen, []);
    });
    it('ein juengeres Major ohne Listen wird benannt, nicht verschwiegen', () => {
        const r = V.waehleMajor(majors, new Map([['0077', [1]], ['0076', [1]]]));
        assert.equal(r.major.tournament_name, 'Nice');
        assert.deepEqual(r.ohneListen.map((x) => x.name), ['Puebla']);
    });
});

describe('Showdown-Vorlagen: Titelkarte', () => {
    it('das Pokémon aus dem Archetypnamen, ex vor Vorstufe', () => {
        const karten = [{ anzahl: 4, name: 'Dreepy', typ: 'Basic' }, { anzahl: 3, name: 'Dragapult ex', typ: 'Stage 2' }];
        assert.equal(V.titelkarte('Dragapult', karten).name, 'Dragapult ex');
    });
    it('das erste Wort des Archetyps gewinnt gegen ein spaeteres', () => {
        const karten = [{ anzahl: 4, name: 'Dusknoir', typ: 'Stage 2' }, { anzahl: 2, name: 'Alakazam', typ: 'Stage 2' }];
        assert.equal(V.titelkarte('Alakazam Dusknoir', karten).name, 'Alakazam');
    });
});

describe('Showdown-Vorlagen: der ausgelieferte Stand', () => {
    const datei = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'showdown_vorlagen.json'), 'utf8'));
    // Die 60 Karten prueft der Verhaltenstest oben an GESETZTEN Listen; hier nur die Struktur.
    it('jede Vorlage hat ein Tier 1–3, eine benannte Quelle und Drucke', () => {
        assert.ok(datei.vorlagen.length > 0);
        for (const v of datei.vorlagen) {
            assert.ok([1, 2, 3].includes(v.tier), v.archetyp);
            assert.ok(['major', 'online'].includes(v.quelle), v.archetyp);
            assert.ok(v.turnier && v.datum, v.archetyp);
            for (const c of v.karten) assert.ok(c.set && c.nummer, `${v.archetyp}: ${c.name} ohne Druck`);
        }
    });
    it('eine Major-Vorlage stammt vom Major, das _meta nennt', () => {
        for (const v of datei.vorlagen.filter((x) => x.quelle === 'major')) {
            assert.equal(v.turnier_id, datei._meta.major.id, v.archetyp);
        }
    });
    it('nach Tier sortiert', () => {
        const t = datei.vorlagen.map((v) => v.tier);
        assert.deepEqual(t, t.slice().sort((a, b) => a - b));
    });
});

describe('Showdown-Vorlagen: im Wochenlauf', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'weekly-full-update.yml'), 'utf8');
    it('der Erzeuger laeuft nach dem Rueckweg nach data/ und vor dem Tor', () => {
        const erzeuger = wf.indexOf('node scripts/showdown_vorlagen.js');
        assert.ok(erzeuger > -1, 'Erzeuger fehlt im Wochenlauf');
        assert.ok(erzeuger > wf.indexOf('- name: Erzeugte Dateien zurueck nach data/'), 'laeuft vor dem Rueckweg');
        assert.ok(erzeuger < wf.indexOf('- name: Zusicherungen gegen die frischen Daten'), 'laeuft nach dem Tor');
        assert.ok(erzeuger > wf.indexOf('uses: actions/setup-node'), 'laeuft vor der Node-Einrichtung');
    });
});

describe('Showdown-Vorlagen: Standard-legale Drucke', () => {
    const rm = { marks: { G: { SVI: '1-198', BLK: '85' }, H: { TEF: '1-218', BLK: '84' }, I: { PFL: '1-130' } } };
    const fw = { oldest_legal_set: 'TEF' };
    const karten = [
        { set: 'SVI', number: '186', international_prints: 'BLK-84,SVI-186' },   // alter Druck, legaler Nachdruck
        { set: 'BLK', number: '85', international_prints: 'BLK-85,SVI-189' },    // nur Marke G
        { set: 'PFL', number: '61', international_prints: '' },                  // eigene Marke I
    ];
    const erg = V.legaleDrucke(rm, fw, karten);
    it('erlaubt ist die Marke des aeltesten legalen Sets und alle spaeteren', () => {
        assert.deepEqual(erg.erlaubt, ['H', 'I']);
    });
    it('ein alter Druck ist legal, wenn seine Nachdruck-Gruppe eine erlaubte Marke hat', () => {
        assert.ok(erg.drucke.includes('SVI-186'));
        assert.ok(erg.drucke.includes('BLK-84'));
    });
    it('nur Marke G bleibt draussen', () => {
        assert.ok(!erg.drucke.includes('BLK-85'));
        assert.ok(!erg.drucke.includes('SVI-189'));
    });
    it('ein Druck ohne Gruppe zaehlt mit seiner eigenen Marke', () => {
        assert.ok(erg.drucke.includes('PFL-61'));
    });
    it('die ausgelieferte Datei passt zu den ausgelieferten Vorlagen: jede Vorlage ist legal', () => {
        const legal = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'showdown_legal.json'), 'utf8')).drucke);
        const vorl = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'showdown_vorlagen.json'), 'utf8')).vorlagen;
        for (const v of vorl) for (const c of v.karten) {
            if (/^(Basic )?(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal) Energy$/.test(c.name)) continue;
            assert.ok(legal.has(`${c.set}-${String(c.nummer).replace(/^0+(?=\d)/, '')}`.toUpperCase()), `${v.archetyp}: ${c.name} ${c.set} ${c.nummer}`);
        }
    });
});

describe('Showdown-Vorlagen: Nachdruck-Gruppen fuer unbekannte Drucke', () => {
    const rm = { marks: { G: { SVI: '1-198' }, H: { TEF: '1-218', ASC: '183' } } };
    const fw = { oldest_legal_set: 'TEF' };
    const karten = [
        { set: 'RCL', number: '189', international_prints: 'ASC-183,RCL-189,SWSH-1' },
        { set: 'SVI', number: '1', international_prints: 'SVI-1,PAL-9' },   // ohne legalen Druck
        { set: 'TEF', number: '5', international_prints: '' },              // Einzeldruck
    ];
    const erg = V.legaleDrucke(rm, fw, karten);
    it('eine Gruppe mit legalem Druck wird mitgeliefert, mit allen Drucken', () => {
        assert.ok(erg.gruppen.some((g) => g.includes('RCL-189') && g.includes('ASC-183') && g.includes('SWSH-1')));
    });
    it('eine Gruppe ohne legalen Druck und ein Einzeldruck nicht', () => {
        assert.ok(!erg.gruppen.some((g) => g.includes('SVI-1')));
        assert.ok(!erg.gruppen.some((g) => g.includes('TEF-5')));
    });
    it('der alte Druck einer legalen Gruppe ist selbst legal', () => {
        assert.ok(erg.drucke.includes('RCL-189'));
    });
});

describe('CPU-Wissen fuer TCG Showdown (data/cpu_wissen.json)', () => {
    const w = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cpu_wissen.json'), 'utf8'));
    const FELDER = new Set(['angreifer', 'bankZuerst', 'nichtAufBank', 'unterstuetzer', 'nieSpielen', 'zieleZuerst', 'bossNurBeiKo', 'quelle']);
    it('jede Regel nennt ihre Quelle (Masterclass oder Rueckmeldung Hausi) und kennt nur bekannte Felder', () => {
        assert.ok(w.decks && typeof w.decks === 'object' && w.matchups && typeof w.matchups === 'object', 'decks/matchups fehlen');
        for (const [bereich, eintraege] of [['decks', w.decks], ['matchups', w.matchups]]) {
            for (const [name, r] of Object.entries(eintraege)) {
                assert.ok(typeof r.quelle === 'string' && /[A-Za-zÄÖÜäöü]{3}/.test(r.quelle), `${bereich}/${name}: ohne Quelle`);
                for (const k of Object.keys(r)) assert.ok(FELDER.has(k), `${bereich}/${name}: unbekanntes Feld ${k}`);
                if (bereich === 'matchups') assert.ok(/.\|./.test(name), `${name}: Matchup braucht „Deck|Gegner“`);
            }
        }
    });
    it('Regeln aus dem Massentest nennen die gemessene Siegquote vorher/nachher und heben sie um mindestens 5 Punkte', () => {
        let n = 0;
        for (const [name, r] of Object.entries(w.decks)) {
            if (!/Massentest/.test(r.quelle)) continue;
            n++;
            const m = /von ([\d.]+) % auf ([\d.]+) %/.exec(r.quelle);
            assert.ok(m, `${name}: Massentest-Regel ohne Messwerte`);
            assert.ok(Number(m[2]) - Number(m[1]) >= 5, `${name}: nur ${m[1]} → ${m[2]} %`);
            assert.ok(Array.isArray(r.angreifer) && r.angreifer.length, `${name}: Massentest-Regel ohne angreifer`);
        }
        assert.ok(n >= 1, 'keine Massentest-Regel gefunden');
    });
});

describe('Spielserver fuer „Mit Kumpel“ (data/showdown_server.json)', () => {
    it('nennt eine https-Adresse — der Client nimmt nichts anderes an', () => {
        const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'showdown_server.json'), 'utf8'));
        assert.match(d.url, /^https:\/\/[a-z0-9.-]+$/);
    });
});
