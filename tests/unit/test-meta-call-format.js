/**
 * Meta Call rechnet mit dem Vorformat und nennt es das aktuelle —
 * Gruppe 10 der Pruefrunde vom 20.08.2026.
 *
 * Fuenf Befunde, ein gemeinsamer Kern: das Lag-Fenster, das die
 * Rotationsluecke ueberbruecken sollte, ging nie wieder zu. Es warf die
 * einzigen frischen Daten weg, der Datums-Chip zeigte das Alter des
 * Scraper-Laufs statt das der Turniere, ein Blend konnte wegen eines
 * falschen Schluessels nie greifen, ein Abzeichen zaehlte aufgefuellte
 * Zeilen mit, und eine feste 55 steuerte ein Fuenftel jeder Win Rate.
 *
 * Diese Datei prueft VERHALTEN, nicht Quelltext: jede Funktion wird aus
 * app-meta-call.js herausgeschnitten, mit Attrappen ausgefuehrt und an
 * ihrem Ergebnis gemessen. Ein Filter, den man nur im Quelltext sieht,
 * kann tot sein — genau das war Befund 3.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MC = lies('js/app-meta-call.js');

/** Schneidet einen Abschnitt zwischen zwei Ankern heraus (beide inklusive). */
function schnitt(quelle, vonAnker, bisAnker, wasFuer) {
    const a = quelle.indexOf(vonAnker);
    assert.ok(a >= 0, `Anker nicht gefunden (${wasFuer}): ${vonAnker}`);
    const b = quelle.indexOf(bisAnker, a);
    assert.ok(b > a, `Endanker nicht gefunden (${wasFuer}): ${bisAnker}`);
    return quelle.slice(a, b + bisAnker.length);
}

// ───────────────────────────────────────────────────────────────────
// 1. Das Lag-Fenster hat jetzt eine Altersgrenze
// ───────────────────────────────────────────────────────────────────
describe('Lag-Fenster: Nachhinken hat eine Frist, eine Datenluecke nicht', () => {
    // 29.08.2026: LAG_KARENZ_TAGE steht seit der Chip-Vereinheitlichung
    // auf Modulebene, nicht mehr im Lag-Block. Der Schnitt beginnt
    // deshalb an der ersten Zeile der eigentlichen Logik; die Karenz
    // wird weiter AUS DER QUELLE gelesen, damit ein geaenderter Wert
    // hier auffaellt statt stillschweigend mitzuwandern.
    const KARENZ = (() => {
        const m = MC.match(/const LAG_KARENZ_TAGE = (\d+);/);
        assert.ok(m, 'LAG_KARENZ_TAGE steht nicht mehr in js/app-meta-call.js');
        return Number(m[1]);
    })();
    const block = schnitt(MC,
        'const lagTage = (_formatWindow && Number(_formatWindow.lag_days)) || 14;',
        '_activeMetaKeyVoll = activeMetaKey;',
        'Lag-Fenster');

    /**
     * Fuehrt den echten Block aus. `heute` und `neueste` steuern das
     * Alter; zurueck kommt, mit welchem Set-Code weitergerechnet wird.
     */
    function fahre({ neueste, heute, activeSetCode, currentSetCode, lagDays }) {
        const rumpf = `
            const LAG_KARENZ_TAGE = ${KARENZ};
            let _lagFensterAlterTage = null, _lagFensterAbgelaufen = false;
            let _lagNeuesteLabsZeile = '', _activeMetaKeyVoll = '';
            const _formatWindow = { lag_days: lagDays };
            const activeMetaKey = 'TEF-' + activeSetCode;
            const console = { info: () => {} };
            const Date = FakeDate;
            ${block}
            return { activeSetCode, _lagFensterAbgelaufen, _lagFensterAlterTage };
        `;
        // Eine Uhr, die auf `heute` steht — Date.now() ist sonst nicht
        // pruefbar, und ein Test, der morgen anders ausgeht, ist keiner.
        class FakeDate extends Date {
            static now() { return new Date(heute + 'T00:00:00Z').getTime(); }
        }
        // eslint-disable-next-line no-new-func
        const f = new Function('activeNewestDate', 'activeSetCode', 'currentSetCode',
            'lagDays', 'FakeDate', rumpf);
        return f(neueste, activeSetCode, currentSetCode, lagDays, FakeDate);
    }

    it('laesst das Fenster offen, solange die alten Turniere wirklich noch laufen', () => {
        // 10 Tage alt, lag_days 14 → Karenz 35: klares Nachhinken.
        const r = fahre({
            neueste: '2026-08-10', heute: '2026-08-20',
            activeSetCode: 'CRI', currentSetCode: 'PBL', lagDays: 14,
        });
        assert.equal(r._lagFensterAbgelaufen, false);
        assert.equal(r.activeSetCode, 'CRI', 'beim Nachhinken bleibt das alte Format aktiv');
    });

    it('schliesst es, wenn seit lag_days + 21 Tagen nichts mehr kam', () => {
        // Der gemessene Fall: juengste Labs-Zeile 10.06., Pruefdatum
        // 20.08. — 71 Tage, Grenze 35.
        const r = fahre({
            neueste: '2026-06-10', heute: '2026-08-20',
            activeSetCode: 'CRI', currentSetCode: 'PBL', lagDays: 14,
        });
        assert.equal(r._lagFensterAlterTage, 71, 'Alter der juengsten Labs-Zeile');
        assert.equal(r._lagFensterAbgelaufen, true);
        assert.equal(r.activeSetCode, 'PBL',
            'nach Fristablauf wird mit dem laufenden Format weitergerechnet — '
            + 'sonst verwirft Predictor 4.7 die Online-Siege des aktuellen Formats');
    });

    it('genau auf der Grenze bleibt es offen (35 Tage zu, 36 auf)', () => {
        const auf = fahre({
            neueste: '2026-07-16', heute: '2026-08-20',
            activeSetCode: 'CRI', currentSetCode: 'PBL', lagDays: 14,
        });
        assert.equal(auf._lagFensterAlterTage, 35);
        assert.equal(auf.activeSetCode, 'CRI', '35 Tage sind noch innerhalb der Karenz');
        const zu = fahre({
            neueste: '2026-07-15', heute: '2026-08-20',
            activeSetCode: 'CRI', currentSetCode: 'PBL', lagDays: 14,
        });
        assert.equal(zu._lagFensterAlterTage, 36);
        assert.equal(zu.activeSetCode, 'PBL');
    });

    it('ruehrt nichts an, wenn ohnehin schon das laufende Format aktiv ist', () => {
        const r = fahre({
            neueste: '2026-06-10', heute: '2026-08-20',
            activeSetCode: 'PBL', currentSetCode: 'PBL', lagDays: 14,
        });
        assert.equal(r.activeSetCode, 'PBL');
    });

    it('kommt ohne Datum nicht ins Stolpern', () => {
        const r = fahre({
            neueste: '', heute: '2026-08-20',
            activeSetCode: 'CRI', currentSetCode: 'PBL', lagDays: 14,
        });
        assert.equal(r._lagFensterAlterTage, null);
        assert.equal(r._lagFensterAbgelaufen, false);
        assert.equal(r.activeSetCode, 'CRI');
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Der Major-Blend sucht den vollen Format-Schluessel
// ───────────────────────────────────────────────────────────────────
describe('Major-Blend: der Schluessel ist ein Paar, nie ein einzelnes Set', () => {
    const block = schnitt(MC,
        'const currentMeta = (function () {',
        '\n    })();',
        'currentMeta');

    function loese({ currentSetOnly, activeMetaKeyVoll, karten }) {
        const rumpf = `
            const _currentSetOnly = currentSetOnly;
            const _activeMetaKeyVoll = activeMetaKeyVoll;
            const [_majorMatchupMap, _majorMatchupMapDay1, _majorMatchupMapDay2] = karten;
            ${block}
            return currentMeta;
        `;
        // eslint-disable-next-line no-new-func
        return new Function('currentSetOnly', 'activeMetaKeyVoll', 'karten', rumpf)(
            currentSetOnly, activeMetaKeyVoll, karten);
    }

    it('nimmt den vollen Schluessel, wenn dessen letztes Segment passt', () => {
        assert.equal(loese({
            currentSetOnly: 'PBL', activeMetaKeyVoll: 'TEF-PBL',
            karten: [null, null, null],
        }), 'TEF-PBL');
    });

    it('findet ihn sonst in der Matchup-Karte', () => {
        assert.equal(loese({
            currentSetOnly: 'PBL', activeMetaKeyVoll: 'TEF-CRI',
            karten: [{ 'TEF-CRI': {}, 'SVI-PBL': {} }, null, null],
        }), 'SVI-PBL', 'ein blosses "PBL" steht in keiner dieser Karten');
    });

    it('sieht auch in den Day-1/Day-2-Karten nach', () => {
        assert.equal(loese({
            currentSetOnly: 'PBL', activeMetaKeyVoll: '',
            karten: [{}, null, { 'MEG-PBL': {} }],
        }), 'MEG-PBL');
    });

    it('faellt auf das Set allein zurueck, wenn nichts vorliegt', () => {
        assert.equal(loese({
            currentSetOnly: 'PBL', activeMetaKeyVoll: 'TEF-CRI',
            karten: [{ 'TEF-CRI': {} }, null, null],
        }), 'PBL');
    });

    it('ohne current_set kein Schluessel', () => {
        assert.equal(loese({
            currentSetOnly: '', activeMetaKeyVoll: 'TEF-CRI',
            karten: [{ 'TEF-CRI': {} }, null, null],
        }), '');
    });

    it('die Matchup-Karte traegt tatsaechlich Paarschluessel — Gegenprobe an den Rohdaten', () => {
        // Wenn diese Annahme faellt, ist der ganze Umbau falsch. Also
        // wird sie an der Quelle geprueft, nicht behauptet.
        const csv = 'data/labs_tournament_matchups.csv';
        if (!fs.existsSync(path.join(ROOT, csv))) return; // Datei optional im Repo
        const zeilen = lies(csv).replace(/^﻿/, '').trim().split(/\r?\n/);
        const kopf = zeilen[0].split(/[;,]/).map(s => s.trim());
        const iMeta = kopf.indexOf('meta');
        assert.ok(iMeta >= 0, 'Spalte "meta" erwartet');
        const trenner = zeilen[0].includes(';') ? ';' : ',';
        const werte = new Set(zeilen.slice(1)
            .map(z => (z.split(trenner)[iMeta] || '').trim())
            .filter(Boolean));
        assert.ok(werte.size > 0, 'meta-Spalte ist leer');
        for (const w of werte) {
            assert.ok(w.includes('-'),
                `meta-Wert "${w}" ist kein Paarschluessel — die Annahme des Blends stimmt nicht mehr`);
        }
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Die Junk-Win-Rate wird gemessen, nicht angenommen
// ───────────────────────────────────────────────────────────────────
describe('Junk-Win-Rate: gerechnet statt geraten', () => {
    const block = schnitt(MC,
        'let _junkWrCacheQuelle = null;',
        '  }\n  if (typeof window !== \'undefined\') window._mcJunkWinRatePct',
        'junkWinRate');

    function baue(shareList, fallback = 55, topN = 25) {
        const rumpf = `
            const _shareList = shareList;
            const _settings = { junkWinRate: fallback };
            const TOP_N = topN;
            ${block.replace(/\}\s*if \(typeof window[\s\S]*$/, '}')}
            return _junkWinRatePct;
        `;
        // eslint-disable-next-line no-new-func
        return new Function('shareList', 'fallback', 'topN', rumpf)(shareList, fallback, topN);
    }

    it('faellt auf die Voreinstellung zurueck, wenn das Feld kuerzer als TOP_N ist', () => {
        const f = baue([{ onlineShare: 5, onlineWinPct: 50 }]);
        assert.equal(f(), 55);
    });

    it('faellt zurueck, wenn der Rest weniger als fuenf brauchbare Zeilen hat', () => {
        const liste = [];
        for (let i = 0; i < 25; i++) liste.push({ onlineShare: 3, onlineWinPct: 50 });
        for (let i = 0; i < 4; i++) liste.push({ onlineShare: 0.1, onlineWinPct: 40 });
        assert.equal(baue(liste)(), 55);
    });

    it('rechnet die Gegenquote des gewichteten Restfeldes', () => {
        const liste = [];
        for (let i = 0; i < 25; i++) liste.push({ onlineShare: 3, onlineWinPct: 52 });
        // Rest: 5 Decks, gleiches Gewicht, Ø-WR 45 % → erwartet 55 %.
        for (let i = 0; i < 5; i++) liste.push({ onlineShare: 1, onlineWinPct: 45 });
        assert.equal(Math.round(baue(liste)() * 100) / 100, 55);
    });

    it('gewichtet nach Anteil, nicht nach Kopfzahl', () => {
        const liste = [];
        // Die Kopfgruppe muss die groessten Anteile haben, sonst schneidet
        // der Sortierschritt sie gar nicht ab — genau das ist der Sinn von
        // TOP_N.
        for (let i = 0; i < 25; i++) liste.push({ onlineShare: 20, onlineWinPct: 52 });
        liste.push({ onlineShare: 9, onlineWinPct: 40 });   // schwer
        for (let i = 0; i < 4; i++) liste.push({ onlineShare: 0.25, onlineWinPct: 50 });
        // gewichtet: (9*40 + 1*50) / 10 = 41 → 100-41 = 59
        assert.equal(Math.round(baue(liste)()), 59);
    });

    it('klemmt bei 30 und 70, damit ein kaputter Datentag nicht durchschlaegt', () => {
        const hoch = [];
        for (let i = 0; i < 25; i++) hoch.push({ onlineShare: 3, onlineWinPct: 50 });
        for (let i = 0; i < 5; i++) hoch.push({ onlineShare: 1, onlineWinPct: 1 });
        assert.equal(baue(hoch)(), 70);
        const tief = [];
        for (let i = 0; i < 25; i++) tief.push({ onlineShare: 3, onlineWinPct: 50 });
        for (let i = 0; i < 5; i++) tief.push({ onlineShare: 1, onlineWinPct: 99 });
        assert.equal(baue(tief)(), 30);
    });

    it('an den echten Ladder-Daten liegt sie nahe an der alten 55 — aber jetzt belegt', () => {
        // limitless_online_decks.csv, Semikolon, deutsche Dezimalkommas.
        const zeilen = lies('data/limitless_online_decks.csv')
            .replace(/^﻿/, '').trim().split(/\r?\n/);
        const kopf = zeilen[0].split(';').map(s => s.trim());
        const iShare = kopf.indexOf('share_numeric');
        const iWr = kopf.indexOf('win_rate_numeric');
        assert.ok(iShare >= 0 && iWr >= 0, 'share_numeric / win_rate_numeric erwartet');
        const num = (s) => parseFloat(String(s || '').replace(',', '.'));
        const liste = zeilen.slice(1).map(z => {
            const f = z.split(';');
            return { onlineShare: num(f[iShare]), onlineWinPct: num(f[iWr]) };
        }).filter(d => isFinite(d.onlineShare) && isFinite(d.onlineWinPct));
        assert.ok(liste.length > 25, 'zu wenige Zeilen fuer den Test');
        const wert = baue(liste)();
        assert.ok(wert > 50 && wert < 60,
            `Junk-WR aus echten Daten sollte im Band 50–60 liegen, war ${wert}`);
        // Der gemessene Stand am 20.08.2026 war 54,47 %. Die Schranke ist
        // absichtlich weit: die Zahl DARF sich mit den Daten bewegen, sie
        // darf nur nicht davonlaufen.
    });

    it('merkt sich das Ergebnis pro Liste', () => {
        const liste = [];
        for (let i = 0; i < 25; i++) liste.push({ onlineShare: 3, onlineWinPct: 52 });
        for (let i = 0; i < 5; i++) liste.push({ onlineShare: 1, onlineWinPct: 45 });
        const f = baue(liste);
        const a = f();
        liste.length = 0;               // dieselbe Kennung, veraenderter Inhalt
        assert.equal(f(), a, 'zweiter Aufruf kommt aus dem Zwischenspeicher');
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Der d2WR-Hebel wird bei einer einzigen Beobachtung gedaempft
// ───────────────────────────────────────────────────────────────────
describe('d2WR-Multiplikator: eine Beobachtung reisst ihn nicht mehr an die Kappung', () => {
    const block = schnitt(MC,
        'function _d2WrMultiplier(d2WrPct, majors) {',
        'return Math.max(0.4, Math.min(1.6, raw));\n    }',
        'd2WrMultiplier');
    // eslint-disable-next-line no-new-func
    const mult = new Function(`${block}; return _d2WrMultiplier;`)();

    it('ohne Zahl bleibt er neutral', () => {
        assert.equal(mult(null, 3), 1.0);
    });

    it('bei zwei oder mehr Majors bleibt der alte Hebel unveraendert', () => {
        assert.equal(Math.round(mult(55, 2) * 1000) / 1000, 1.5);
        assert.equal(Math.round(mult(46, 3) * 1000) / 1000, 0.6);
    });

    it('bei einem einzigen Major zaehlt der Ausschlag halb', () => {
        assert.equal(Math.round(mult(55, 1) * 1000) / 1000, 1.25);
        assert.equal(Math.round(mult(46, 1) * 1000) / 1000, 0.8);
    });

    it('50 % bleibt in beiden Faellen neutral', () => {
        assert.equal(mult(50, 1), 1.0);
        assert.equal(mult(50, 5), 1.0);
    });

    it('die Kappung greift weiterhin', () => {
        assert.equal(mult(90, 5), 1.6);
        assert.equal(mult(10, 5), 0.4);
    });

    it('ohne Angabe der Turnierzahl wird nicht gedaempft (Rueckwaertsvertraeglichkeit)', () => {
        assert.equal(Math.round(mult(55) * 1000) / 1000, 1.5);
    });
});

// ───────────────────────────────────────────────────────────────────
// 5. Das Day-2-Abzeichen zaehlt nur, was ueber der Schwelle liegt
// ───────────────────────────────────────────────────────────────────
describe('Day-2-Abzeichen: aufgefuellte Zeilen zaehlen nicht mit', () => {
    const block = schnitt(MC,
        'const DAY2_THRESHOLD = 0.20;',
        'const day2Names = new Set(day2.map(d => normalize(d.name)));',
        'day2-Auffuellung');

    function fahre(wahrscheinlichkeiten) {
        const rumpf = `
            const evaluated = probs.map((p, i) => ({ name: 'D' + i, day2Prob: p }));
            const day2Eligible = new Set(evaluated.map(e => e.name));
            const normalize = (s) => s;
            ${block}
            return { day2, day2UeberSchwelle };
        `;
        // eslint-disable-next-line no-new-func
        return new Function('probs', rumpf)(wahrscheinlichkeiten);
    }

    it('zaehlt sechs, wenn sechs die Schwelle nehmen — auch wenn zehn Zeilen stehen', () => {
        const probs = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.19, 0.18, 0.17, 0.16, 0.15];
        const r = fahre(probs);
        assert.equal(r.day2UeberSchwelle, 6, 'nur die ueber 20 %');
        assert.equal(r.day2.length, 10, 'die Liste bleibt zehn Zeilen lang');
    });

    it('markiert genau die aufgefuellten Zeilen', () => {
        const probs = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.19, 0.18, 0.17, 0.16, 0.15];
        const r = fahre(probs);
        const markiert = r.day2.filter(e => e.unterSchwelle);
        assert.equal(markiert.length, 4);
        for (const e of markiert) assert.ok(e.day2Prob < 0.20);
        for (const e of r.day2.filter(e => !e.unterSchwelle)) {
            assert.ok(e.day2Prob >= 0.20);
        }
    });

    it('markiert nichts, wenn alle zehn die Schwelle nehmen', () => {
        const probs = new Array(12).fill(0.4);
        const r = fahre(probs);
        assert.equal(r.day2UeberSchwelle, 12);
        assert.equal(r.day2.length, 10);
        assert.equal(r.day2.filter(e => e.unterSchwelle).length, 0);
    });

    it('zaehlt null, wenn keins die Schwelle nimmt', () => {
        const r = fahre(new Array(11).fill(0.1));
        assert.equal(r.day2UeberSchwelle, 0);
        assert.equal(r.day2.length, 10);
        assert.equal(r.day2.filter(e => e.unterSchwelle).length, 10);
    });

    it('die Rueckgabe von calcRecommendationsSplit fuehrt den Zaehler auch im leeren Fall', () => {
        assert.ok(/return \{ day2: \[\], geheimtipps: \[\], day2UeberSchwelle: 0 \}/.test(MC),
            'der fruehe Ausstieg muss dieselbe Form liefern, sonst zeigt das Abzeichen undefined');
        assert.ok(/return \{ day2, geheimtipps: tips, day2UeberSchwelle \}/.test(MC));
    });
});

// ───────────────────────────────────────────────────────────────────
// 6. Was auf dem Bildschirm steht
// ───────────────────────────────────────────────────────────────────
describe('Beschriftungen sagen, was gerechnet wurde', () => {
    const I18N = lies('js/i18n.js');

    function ladeSprachen() {
        const w = {};
        // i18n.js haengt am Ende an window; das genuegt uns.
        // eslint-disable-next-line no-new-func
        new Function('window', 'document', 'localStorage', 'navigator',
            I18N + '\n; window.__t = translations;')(
            w, { addEventListener() {}, querySelectorAll: () => [], documentElement: {} },
            { getItem: () => null, setItem() {} }, { language: 'de' });
        return w.__t;
    }
    const T = ladeSprachen();

    it('beide Sprachen kennen die neuen Schluessel', () => {
        const neu = ['mc.bannerScrapedAt', 'mc.recBelowThreshold', 'mc.recBelowThresholdTip',
            'mc.d2WrSample', 'mc.intelTop8BroughtSuffix'];
        for (const k of neu) {
            assert.ok(T.de[k], `de fehlt: ${k}`);
            assert.ok(T.en[k], `en fehlt: ${k}`);
        }
    });

    it('der Datums-Chip nennt das Turnier, nicht den Scraper-Lauf', () => {
        assert.match(T.de['mc.bannerDataDate'], /Jüngstes Turnier/);
        assert.match(T.de['mc.bannerDataStale'], /Jüngstes Turnier/);
        assert.doesNotMatch(T.de['mc.bannerDataDate'], /^Turnierdaten/);
        assert.match(T.de['mc.bannerScrapedAt'], /Scraper-Lauf/);
    });

    it('16 Punkte sind 5-2-1, nicht 6-2', () => {
        // 6-2 waeren 18 Punkte. Die alte Beschreibung stand in beiden
        // Sprachen und war schlicht falsch gerechnet.
        assert.match(T.de['mc.tournamentTypeRegionalDesc'], /5-2-1/);
        assert.doesNotMatch(T.de['mc.tournamentTypeRegionalDesc'], /6-2/);
        assert.match(T.en['mc.tournamentTypeRegionalDesc'], /5-2-1/);
        assert.doesNotMatch(T.en['mc.tournamentTypeRegionalDesc'], /6-2/);
    });

    it('die Day-2-Schwelle wird nicht mehr als skalierend beschrieben', () => {
        // Der Schluessel heisst seit dem 02.09.2026 mc.recHintZiel: der
        // Hinweis nennt jetzt das Ziel des aktiven Turniertyps ({ziel})
        // statt hart "Day 2" — bei Cup und Challenge gibt es keinen
        // zweiten Tag, und der Code wusste das an der Pille darunter
        // laengst.
        assert.doesNotMatch(T.de['mc.recHintZiel'], /skaliert/i);
        assert.match(T.de['mc.recHintZiel'], /fest bei 20 %/);
        assert.doesNotMatch(T.en['mc.recHintZiel'], /scales/i);
        assert.match(T.de['mc.recHintZiel'], /\{ziel\}/,
            'der Hinweis steht wieder hart auf einem Turnierziel, statt es '
            + 'vom aktiven Typ einsetzen zu lassen');
        assert.match(T.en['mc.recHintZiel'], /\{ziel\}/);
    });

    it('die d2WR-Beschriftung verspricht keine fuenf Majors mehr', () => {
        assert.doesNotMatch(T.de['mc.d2WrLabel'], /5 Majors/);
        assert.doesNotMatch(T.en['mc.d2WrLabel'], /5 majors/i);
        assert.match(T.de['mc.d2WrSample'], /\{n\}/);
    });

    it('die persoenliche Schaetzung ersetzt, sie mittelt nicht', () => {
        // "gemittelt" darf vorkommen — aber nur verneint ("wird nicht
        // damit gemittelt"). Geprueft wird die Behauptung, nicht das Wort.
        const behauptetMittelung = (text, muster) => {
            const m = text.match(muster);
            if (!m) return false;
            const davor = text.slice(Math.max(0, m.index - 30), m.index);
            return !/\bnicht\b|\bnot\b|\bno longer\b/i.test(davor);
        };
        for (const k of ['mc.personalShareExpl', 'mc.headerPersonalTooltip', 'mc.headerFinalTooltip']) {
            assert.ok(!behauptetMittelung(T.de[k], /gemittelt|gemischt/),
                `${k} behauptet weiterhin eine Mittelung: ${T.de[k]}`);
            assert.ok(!behauptetMittelung(T.en[k], /averaged|blended/),
                `${k} (en) behauptet weiterhin eine Mittelung: ${T.en[k]}`);
        }
        assert.match(T.de['mc.personalShareExpl'], /ERSETZT/);
        assert.match(T.de['mc.headerFinalTooltip'], /Differenz geht an Others/);
    });

    it('die Top-8-Kachel nennt ihre Quelle', () => {
        assert.match(T.de['mc.intelTop8Conv'], /Online-Turniere/);
        assert.doesNotMatch(T.de['mc.intelTop8Conv'], /Major/);
        assert.match(T.en['mc.intelTop8Conv'], /online tournaments/);
    });

    it('die Kachel zeigt die Quote als Hauptwert, den Anteil darunter', () => {
        // convPct ist top8Conv*100 — ein Anteil wurde vorher ungerechnet
        // als Prozent gezeigt.
        assert.ok(/const convPct = \(top8Conv \|\| 0\) \* 100;/.test(MC),
            'convPct fehlt — die Kachel zeigt wieder broughtShare als Hauptwert');
        const kachel = schnitt(MC, "t('mc.intelTop8Conv'),", '));', 'Top-8-Kachel');
        assert.ok(kachel.includes('convPct'), 'Hauptwert muss die Quote sein');
        assert.ok(kachel.includes('intelTop8BroughtSuffix'), 'Anteil gehoert in die Unterzeile');
    });
});

// ───────────────────────────────────────────────────────────────────
// 7. Die neuen CSS-Klassen gibt es wirklich, und ohne !important
// ───────────────────────────────────────────────────────────────────
describe('Die Markierungen sind gestaltet', () => {
    const CSS = lies('css/meta-call.css');
    for (const klasse of ['mc-rec-unter-schwelle', 'mc-rec-d2wr-n']) {
        it(`.${klasse} ist definiert`, () => {
            assert.ok(CSS.includes('.' + klasse), `${klasse} fehlt in meta-call.css`);
        });
    }
    it('ohne neue !important', () => {
        for (const klasse of ['mc-rec-unter-schwelle', 'mc-rec-d2wr-n']) {
            const i = CSS.indexOf('.' + klasse);
            const bis = CSS.indexOf('}', i);
            assert.doesNotMatch(CSS.slice(i, bis), /!important/,
                `${klasse} bringt ein !important mit`);
        }
    });

    it('die Schwellen-Plakette steht unter der Zahl, nicht daneben', () => {
        // Gemessen bei 1440x900 und 390x844: neben "18,0 %" ragte sie aus
        // ihrer 90 px breiten Zelle heraus. Der Umbruch ist die Loesung,
        // nicht eine kleinere Schrift — auf dem Handy setzt die
        // Sammelregel in styles.css ohnehin 12px !important.
        const i = CSS.indexOf('.mc-rec-unter-schwelle {');
        const regel = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(regel, /display:\s*block/,
            'ohne display:block sitzt die Plakette wieder neben der Zahl');
        assert.doesNotMatch(regel, /margin-left:\s*6px/,
            'der seitliche Abstand gehoert zur alten Anordnung');
    });
});

// ───────────────────────────────────────────────────────────────────
// 8. Der Rennlauf zwischen Rendern und Matchup-Karte
// ───────────────────────────────────────────────────────────────────
describe('Empfehlungen werden nachgezogen, wenn die Matchup-Karte spaeter kommt', () => {
    // Gemessen am 20.08.2026 mit einer Sonde in
    // renderRecommendationsPanel: Render bei t = 5.577 ms mit
    // _matchupMap === null, Karte fertig bei t = 5.770 ms. Ohne Karte
    // faellt jede Paarung auf die Vorgabe zurueck — alle zehn Zeilen
    // zeigten 17,3 % und 50,1 % und die Rangfolge war Rauschen.
    const block = schnitt(MC,
        'function _panelsNachMatchupsNachziehen() {',
        "_matchupMap ? Object.keys(_matchupMap).length : 0);\n  }",
        'Nachziehung');

    /** Baut eine Attrappe des DOM, die mitschreibt, was angefasst wird. */
    function bauePruefstand({ mitRecPanel, mitResults }) {
        const beruehrt = [];
        const mach = (name) => ({
            _name: name,
            set innerHTML(v) { beruehrt.push(name); this._html = v; },
            get innerHTML() { return this._html || ''; },
            querySelector: (sel) => (sel === '.metacall-panel' || sel === '.mc-rec-panel'
                ? mach('fragment' + sel) : null),
            closest: () => mach('wrap'),
        });
        const recPanel = mitRecPanel ? mach('rec') : null;
        const results = mitResults ? mach('results') : null;
        const feldTbody = mach('feld-tbody');
        const container = {
            querySelector: (sel) => {
                if (sel === '.mc-rec-panel') return recPanel;
                if (sel === '.metacall-results-grid') return results;
                if (sel === '.metacall-table tbody') return feldTbody;
                return null;
            },
        };
        let feldGebaut = 0;
        const rumpf = `
            const document = {
                getElementById: () => container,
                createElement: () => mach('tmp'),
            };
            const _shareList = [{ name: 'A' }];
            const _matchupMap = { a: {}, b: {} };
            const buildField = () => { zaehl(); return [{ name: 'A' }]; };
            const renderResultsPanel = () => '<div class="metacall-panel">R</div>';
            const renderRecommendationsPanel = () => '<div class="mc-rec-panel">E</div>';
            const console = { info: () => {} };
            ${block}
            return _panelsNachMatchupsNachziehen;
        `;
        // eslint-disable-next-line no-new-func
        const f = new Function('container', 'mach', 'zaehl', rumpf)(
            container, mach, () => { feldGebaut++; });
        return { f, beruehrt, feldTbody, zaehler: () => feldGebaut };
    }

    it('tut nichts, solange keins der Panels im DOM steht', () => {
        const s = bauePruefstand({ mitRecPanel: false, mitResults: false });
        s.f();
        assert.deepEqual(s.beruehrt, [], 'ohne Panels darf nichts angefasst werden');
        assert.equal(s.zaehler(), 0, 'und das Feld nicht einmal gebaut werden');
    });

    it('zieht die Empfehlungstabelle nach, wenn sie schon steht', () => {
        const s = bauePruefstand({ mitRecPanel: true, mitResults: false });
        s.f();
        assert.ok(s.beruehrt.includes('rec'), 'die Empfehlungstabelle muss neu geschrieben werden');
        assert.equal(s.zaehler(), 1, 'genau ein frischer Feldaufbau');
    });

    it('laesst die Feldtabelle in Ruhe — dort tippt der Nutzer', () => {
        const s = bauePruefstand({ mitRecPanel: true, mitResults: true });
        s.f();
        assert.ok(!s.beruehrt.includes('feld-tbody'),
            'die Feldtabelle enthaelt das Eingabefeld der eigenen Schaetzung');
    });

    it('die Nachziehung wird aufgerufen, sobald die Karte steht', () => {
        // Reihenfolge im Quelltext: erst die Karte fuellen, dann die
        // Korrekturen, dann nachziehen. Ein Aufruf davor waere wirkungslos.
        const iKarte = MC.indexOf('_computeMatchupAdjustments();');
        const iZieh  = MC.indexOf('_panelsNachMatchupsNachziehen();');
        assert.ok(iKarte > 0 && iZieh > iKarte,
            'die Nachziehung muss nach _computeMatchupAdjustments() stehen');
    });
});
