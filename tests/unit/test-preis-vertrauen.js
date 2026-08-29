/**
 * Preise: die Zuordnung Karte → Produkt ist nicht eindeutig, und jede
 * Unsicherheit wurde auf dem Weg zur Seite aufgewertet.
 * Gruppe 11 der Pruefrunde vom 20.08.2026.
 *
 * Drei Befunde, ein Muster: der Fehlschlag einer Pruefung wurde still zum
 * Vorgabewert "geprueft".
 *
 *  * 100 Produktnummern bedienen je zwei Karten — beide zeigen denselben
 *    Preis, ihre Links zeigen auf zwei verschiedene Produkte.
 *  * 3.015 Preiszeilen haben gar keine Zuordnungszeile und trugen trotzdem
 *    mapping_status='ok' — 24,8 % des Katalogwerts.
 *  * Das Vertrauenszeichen erschien nur in der Wunschliste, nicht dort, wo
 *    die meisten Preise gelesen werden.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const COLLECTION = lies('js/firebase-collection.js');
const CARDSDB    = lies('js/app-cards-db.js');
const MERGER     = lies('backend/scrapers/cardmarket_price_merger.py');
const CONSUMERS  = lies('data/_consumers.md');

function stueck(quelle, re, was) {
    const m = quelle.match(re);
    if (!m) throw new Error('konnte ' + was + ' nicht herausschneiden');
    return m[0];
}

// 29.08.2026: Die Faelle tragen jetzt Sprachschluessel statt festem
// Deutsch. Der Test bekommt deshalb die ECHTE Sprachtabelle statt einer
// Attrappe — damit prueft er die ganze Kette: Schluessel vorhanden,
// Text vorhanden, Text kommt beim Nutzer an. Eine Attrappe haette den
// Fall "Schluessel existiert gar nicht" durchgelassen.
const I18N = lies('js/i18n.js');

function sprachtabelle(sprache) {
    // Beide Bloecke stehen nacheinander in derselben Datei; der erste
    // ist englisch, der zweite deutsch.
    const alle = [...I18N.matchAll(/^ {4}'([a-zA-Z0-9._]+)':\s*('(?:\\.|[^'\\])*')/gm)];
    const mitte = Math.floor(alle.length / 2);
    const teil = sprache === 'en' ? alle.slice(0, mitte) : alle.slice(mitte);
    const karte = {};
    for (const m of teil) {
        if (karte[m[1]] === undefined) {
            // eslint-disable-next-line no-eval
            karte[m[1]] = eval(m[2]);
        }
    }
    return karte;
}

function ladeBadge(sprache = 'de') {
    const tabelle = sprachtabelle(sprache);
    const quelle =
        stueck(COLLECTION, /const PRICE_TRUST_CASES = \{[\s\S]*?\n\};/, 'faelle')
        + '\n'
        + stueck(COLLECTION, /function priceTrustBadge\(card, cmUrl\) \{[\s\S]*?\n\}/, 'badge');
    const w = { cardDBHasMappingStatus: true };
    // eslint-disable-next-line no-new-func
    return new Function('window', 'escapeHtml', 't',
        quelle + '\nreturn priceTrustBadge;')(w, (x) => String(x)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
        (k) => (tabelle[k] !== undefined ? tabelle[k] : k));
}

describe('Das Vertrauenszeichen kennt alle drei Faelle', () => {
    const badge = ladeBadge();

    it('geprueft bleibt still', () => {
        assert.equal(badge({ mapping_status: 'ok' }), '');
        assert.equal(badge({}), '');
        assert.equal(badge(null), '');
    });

    it('Heuristik, fehlende Zuordnung und doppelte Nummer werden angeschrieben', () => {
        assert.match(badge({ mapping_status: 'unverified' }), /nicht verifiziert/);
        assert.match(badge({ mapping_status: 'unmapped' }), /ohne Zuordnung/);
        assert.match(badge({ mapping_status: 'collision' }), /Nummer doppelt vergeben/);
    });

    it('jeder Fall erklaert sich im Titel, nicht nur in der Farbe', () => {
        for (const st of ['unverified', 'unmapped', 'collision']) {
            const html = badge({ mapping_status: st });
            const titel = (html.match(/title="([^"]*)"/) || [])[1] || '';
            assert.ok(titel.length > 80, st + ': Titel zu kurz — ' + titel);
        }
    });

    it('ohne Feld im Datensatz schweigt es ganz', () => {
        const tabelle = sprachtabelle('de');
        const quelle =
            stueck(COLLECTION, /const PRICE_TRUST_CASES = \{[\s\S]*?\n\};/, 'faelle')
            + '\n'
            + stueck(COLLECTION, /function priceTrustBadge\(card, cmUrl\) \{[\s\S]*?\n\}/, 'badge');
        // eslint-disable-next-line no-new-func
        const ohne = new Function('window', 'escapeHtml', 't',
            quelle + '\nreturn priceTrustBadge;')({ cardDBHasMappingStatus: false }, (x) => x,
            (k) => (tabelle[k] !== undefined ? tabelle[k] : k));
        assert.equal(ohne({ mapping_status: 'unmapped' }), '');
    });

    it('im englischen Modus steht dort kein deutsches Wort', () => {
        // Genau der Fehler, der das ausgeloest hat: die Tabelle war
        // vollstaendig, die Anzeige trotzdem deutsch.
        const en = ladeBadge('en');
        for (const st of ['unverified', 'unmapped', 'collision']) {
            const html = en({ mapping_status: st });
            assert.ok(html.length > 0, st + ': gar kein Zeichen');
            assert.ok(!/[äöüÄÖÜß]/.test(html), st + ': Umlaut im englischen Text — ' + html.slice(0, 90));
            assert.ok(!/\b(nicht|ohne|Nummer|doppelt|Karte|Preis|einem|einer|derselben)\b/.test(html),
                st + ': deutsches Wort im englischen Text — ' + html.slice(0, 120));
        }
    });

    it('kein Fall zeigt seinen eigenen Schluessel statt eines Textes', () => {
        // Wenn t() den Schluessel nicht findet, gibt es ihn selbst
        // zurueck. Das saehe aus wie ein Text und waere keiner.
        for (const sprache of ['de', 'en']) {
            const b = ladeBadge(sprache);
            for (const st of ['unverified', 'unmapped', 'collision']) {
                const html = b({ mapping_status: st });
                assert.ok(!/preis\.[a-zA-Z]/.test(html),
                    `${sprache}/${st}: roher Schluessel in der Anzeige — ${html.slice(0, 100)}`);
            }
        }
    });

    it('und es haengt nicht mehr allein an der Wunschliste', () => {
        assert.match(CARDSDB, /window\.priceTrustBadge\(card, displayCardMarketUrl\)/);
    });
});

describe('Der Mischer benennt, was er nicht weiss', () => {
    it('kein stiller ok-Zweig mehr', () => {
        assert.doesNotMatch(MERGER,
            /mapping_status = 'unverified' if method\.startswith\('priced-by'\) else 'ok'/);
        assert.match(MERGER, /mapping_status = 'unmapped'/);
        assert.match(MERGER, /mapping_status = 'collision'/);
    });

    it('Kollisionen werden aus der Zuordnungsdatei selbst erkannt', () => {
        assert.match(MERGER, /kollidierend = \{i for i, n in id_counts\.items\(\) if n > 1\}/);
    });

    it('der Preis wird markiert, nicht geloescht', () => {
        // Hausregel: melden, nicht stillschweigend reparieren. Ein Loch ist
        // keine bessere Antwort als eine gekennzeichnete Zahl.
        const block = stueck(MERGER, /id_counts = collections\.Counter[\s\S]*?sum\(n for i, n in id_counts\.items\(\) if n > 1\)\)/, 'kollision');
        assert.match(block, /nicht geloescht/);
    });
});

describe('Die Zahlen stimmen mit den Rohdaten überein', () => {
    // Diese Pruefungen rechnen den Zustand nach, den die Behebung meint.
    // Verschwinden die Kollisionen eines Tages, faellt der Test auf und die
    // Sonderbehandlung kann ueberprueft werden.
    function mapping() {
        const zeilen = lies('data/cardmarket_id_mapping.csv').replace(/^﻿/, '').trim().split('\n');
        const kopf = zeilen[0].split(',');
        const iSet = kopf.indexOf('set'), iNum = kopf.indexOf('number');
        const iId = kopf.indexOf('cardmarket_product_id'), iM = kopf.indexOf('match_method');
        return zeilen.slice(1).map(z => { const f = z.split(','); return {
            set: f[iSet], number: f[iNum], id: f[iId], method: f[iM] }; });
    }

    it('100 Produktnummern bedienen mehr als eine Karte', () => {
        const zaehler = new Map();
        for (const r of mapping()) zaehler.set(r.id, (zaehler.get(r.id) || 0) + 1);
        const doppelt = [...zaehler.values()].filter(n => n > 1);
        assert.ok(doppelt.length >= 50 && doppelt.length <= 200,
            'kollidierende IDs: ' + doppelt.length);
    });

    it('kein Paar ist auf BEIDEN Seiten live-verified', () => {
        // Bis zum 23.08.2026 war das umgekehrt: neun Produktnummern trugen auf
        // beiden kollidierenden Zeilen match_method='live-verified' — ein
        // Widerspruch in sich, denn dieselbe Nummer kann nicht zwei Karten
        // bestaetigt zugeordnet sein. Der Test hielt diesen Zustand als Zahl
        // fest und verlangte ausdruecklich, dass er auffaellt, sobald er
        // verschwindet ("Verschwinden die Kollisionen eines Tages, faellt der
        // Test auf"). Genau das ist passiert: die manuellen Pins in
        // data/cardmarket_mapping_manual.csv haben alle neun aufgeloest, jedes
        // Paar hat jetzt zwei verschiedene Produktnummern per 'manual-pin'
        // (HL-28/29, TRR-19/20, BWP-30/31, FLF-18/19, ROS-54/55, BUS-112a/142,
        // UPR-20/21, DRM-60/60a, JTG-143/144).
        //
        // Aus dem Befund wird damit eine Regressionsschranke: taucht wieder
        // ein beidseitig verifiziertes Paar auf, hat entweder ein Pin seine
        // Wirkung verloren oder der Zuordner schreibt 'live-verified' erneut
        // als stillen Vorgabewert, statt den Fehlschlag zu melden.
        const nach = new Map();
        for (const r of mapping()) {
            if (!nach.has(r.id)) nach.set(r.id, []);
            nach.get(r.id).push(r);
        }
        const beide = [...nach.entries()].filter(([, v]) =>
            v.length > 1 && v.every(x => x.method === 'live-verified'));
        assert.deepEqual(beide.map(([id, v]) =>
            id + ': ' + v.map(x => x.set + '-' + x.number).join(' + ')), [],
            'Diese Produktnummern sind auf beiden Seiten als bestaetigt markiert. '
            + 'Eine Nummer kann nicht zwei Karten bestaetigt zugeordnet sein — '
            + 'entweder fehlt ein Pin in data/cardmarket_mapping_manual.csv, oder '
            + 'der Zuordner setzt live-verified wieder als Vorgabewert.');
    });

    it('3.015 Preiszeilen haben keine Zuordnungszeile', () => {
        const schluessel = new Set(mapping().map(r => r.set + '|' + r.number));
        const zeilen = lies('data/price_data.csv').replace(/^﻿/, '').trim().split('\n');
        const kopf = zeilen[0].split(',');
        const iSet = kopf.indexOf('set'), iNum = kopf.indexOf('number');
        assert.ok(iSet >= 0 && iNum >= 0, kopf.join('|'));
        let ohne = 0;
        for (const z of zeilen.slice(1)) {
            const f = z.split(',');
            if (!schluessel.has(f[iSet] + '|' + f[iNum])) ohne++;
        }
        assert.ok(ohne > 1000, 'ohne Zuordnung: ' + ohne);
    });
});

describe('Die Wert-Kachel sagt, worauf sie steht', () => {
    function ladeNotiz(sprache) {
        const quelle = stueck(COLLECTION,
            /function collectionValueNote\(stats\) \{[\s\S]*?\n\}/, 'notiz');
        // eslint-disable-next-line no-new-func
        return new Function('window',
            quelle + '\nreturn collectionValueNote;')({ getLang: () => sprache || 'de' });
    }

    it('nennt Betrag und Anteil der ungesicherten Preise', () => {
        const n = ladeNotiz('de');
        const txt = n({ totalValue: 1000, unsicherValue: 248, unsicherCount: 12 });
        assert.match(txt, /248,00 €/);
        assert.match(txt, /25 %/);
        assert.match(txt, /ungesicherter Produktzuordnung/);
    });

    it('nennt den aeltesten einfliessenden Preisstand, wenn er alt ist', () => {
        const n = ladeNotiz('de');
        const alt = new Date(Date.now() - 140 * 86400000).toISOString();
        const txt = n({ totalValue: 100, unsicherValue: 0, aeltesterPreisstand: alt });
        assert.match(txt, /ältester einfließender Preisstand/);
        assert.match(txt, /1[34]\d Tage/);
    });

    it('schweigt, wenn es nichts zu sagen gibt', () => {
        const n = ladeNotiz('de');
        assert.equal(n({ totalValue: 100, unsicherValue: 0,
                         aeltesterPreisstand: new Date().toISOString() }), '');
        assert.equal(n({ totalValue: 0 }), '');
        assert.equal(n(null), '');
    });

    it('die Notiz hat einen Platz im Dokument', () => {
        assert.match(lies('index.html'), /id="profile-collection-value-note"/);
        assert.match(lies('css/auth-styles.css'), /\.stat-card p\.stat-card-note/);
        assert.match(COLLECTION, /function setzeSammlungsNotiz\(text\)/);
    });
});

describe('Der veroeffentlichte Vertrag sagt die Wahrheit', () => {
    it('live-verified wird nicht mehr als Identitaetsaussage verkauft', () => {
        assert.doesNotMatch(CONSUMERS, /this is an identity statement, not a heuristic/);
        assert.match(CONSUMERS, /a price fingerprint, not an identity statement/);
        assert.match(CONSUMERS, /FP_TOLERANCE = 1\.15/);
    });

    it('die zwei neuen Werte sind dokumentiert', () => {
        assert.match(CONSUMERS, /\| `unmapped`/);
        assert.match(CONSUMERS, /\| `collision`/);
        assert.match(CONSUMERS, /A new value is not a new column/);
    });
});
