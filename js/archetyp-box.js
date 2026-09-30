/* ============================================================
 * Archetyp-Box (FE-13, Rutsch 15, 28.09.2026)
 * ============================================================
 *
 * Eine Box je Archetyp: welche Karten braucht das Deck ueber ALLE
 * Formate, und welche davon liegen schon in der physischen Box — als
 * Original, als Proxy oder gar nicht. Unabhaengig von "Meine Sammlung",
 * weil dieselbe Karte in mehreren Boxen gebraucht wird.
 *
 * Wo sie entsteht: Reiter Rotationen, Kartenuebersicht, Format
 * "Alle Formate" + Archetyp. Der Knopf nimmt die Karten, die der
 * Kartenanteil-Filter gerade zeigt.
 *
 * Wo sie liegt: users/{uid}/archetypBoxen/{id} — eine Untersammlung wie
 * customBinders, NICHT ein Feld auf users/{uid} (dort liegen Sammlung,
 * Wunschliste und Tauschliste bereits unter EINEM 1-MiB-Limit). Die
 * Regel `match /users/{uid}/{document=**}` in firestore.rules deckt die
 * Untersammlung ab, es braucht keine neue Regel.
 *
 * Aktualisieren: neue Turnierdaten bringen neue Karten — sie kommen als
 * "fehlt" und "neu" dazu. Nichts wird still entfernt: eine Karte, die in
 * den Listen nicht mehr vorkommt, bleibt in der Box und wird benannt.
 *
 * Kartenidentitaet NIE ueber den Namen: (Set, Nummer) des angezeigten
 * Drucks, und beim Abgleich zusaetzlich die internationalen Drucke
 * derselben Karte (international_prints der Kartendatenbank).
 *
 * Aufbau: oben reine Logik (tests/unit/test-archetyp-box.js fuehrt sie
 * aus), darunter Speicher und Oberflaeche.
 */
(function () {
    'use strict';

    const SAMMLUNG = 'archetypBoxen';
    const SPIEGEL_SCHLUESSEL = 'archetypBoxenV1';
    const STATUS = ['fehlt', 'original', 'proxy'];
    const MAX_ANZAHL = 99;
    // Reihenfolge der Kartenarten in jeder Rubrik der Box.
    const TYP_REIHENFOLGE = ['Pokemon', 'Supporter', 'Item', 'Tool', 'Stadium',
        'Ace Spec', 'Special Energy', 'Energy'];

    // ════════════════════════════════════════════════════════
    // Reine Logik
    // ════════════════════════════════════════════════════════

    /** "SET-NUMMER" in einer Schreibweise: Set gross, Nummer ohne fuehrende Nullen. */
    function kartenId(set, nummer) {
        const s = String(set || '').trim().toUpperCase();
        const n = String(nummer || '').trim().toUpperCase().replace(/^0+(?=\w)/, '');
        if (!s || !n) return '';
        return s + '-' + n;
    }

    /** Zwei Eintraege meinen dieselbe Karte, wenn ihre Drucke sich beruehren. */
    function gleicheKarte(a, b) {
        if (!a || !b || !a.id || !b.id) return false;
        if (a.id === b.id) return true;
        const ra = Array.isArray(a.refs) ? a.refs : [];
        const rb = Array.isArray(b.refs) ? b.refs : [];
        return rb.indexOf(a.id) >= 0 || ra.indexOf(b.id) >= 0;
    }

    function anzahlBegrenzen(n) {
        const z = Math.round(Number(n));
        if (!Number.isFinite(z) || z < 1) return 1;
        return Math.min(MAX_ANZAHL, z);
    }

    function nullBis(n) {
        const z = Math.round(Number(n));
        if (!Number.isFinite(z) || z < 0) return 0;
        return Math.min(MAX_ANZAHL, z);
    }

    /*
     * Zwei Zahlen je Karte (Hausi, 28.09.2026, nach dem ersten Live-Blick):
     *
     *   gefordert — wie oft die Karte in einer Liste hoechstens gespielt
     *               wurde (max_count der Turnierdaten). Kommt aus den Daten,
     *               das Aktualisieren zieht sie nach. Von Hand hinzugefuegte
     *               Karten haben keine.
     *   drin      — wie viele Kopien wirklich in der Box liegen, aufgeteilt
     *               nach Druck (`drucke`: [{id, set, number, n}]). Gehoert
     *               dem Nutzer, kein Aktualisieren fasst sie an. Darf ueber
     *               "gefordert" hinausgehen.
     *
     * Aeltere Boxen (Rutsch 15, #859) kannten nur `anzahl` und den Status;
     * normiert() liest sie ohne Verlust in die neue Form.
     */
    function gefordertVon(k) {
        if (k.gefordert != null) return k.gefordert;
        if (k.manuell) return null;
        const m = parseInt(k.maxAnzahl, 10);
        return m > 0 ? m : null;
    }

    function normiert(k) {
        if (!k) return k;
        const aus = Object.assign({}, k);
        aus.gefordert = gefordertVon(k);
        if (!Array.isArray(k.drucke)) {
            const alt = (k.status === 'original' || k.status === 'proxy') ? anzahlBegrenzen(k.anzahl) : 0;
            aus.drucke = alt > 0 ? [{ id: k.id, set: k.set, number: k.number, n: alt }] : [];
        } else {
            aus.drucke = k.drucke.filter(function (d) { return d && d.id && nullBis(d.n) > 0; })
                .map(function (d) { return { id: d.id, set: d.set, number: d.number, n: nullBis(d.n) }; });
        }
        delete aus.anzahlEigen;
        return aus;
    }

    function drin(k) {
        return (normiert(k).drucke || []).reduce(function (a, d) { return a + d.n; }, 0);
    }

    /** Status folgt der Menge: nichts drin = fehlt; etwas drin und bisher fehlt = Original. */
    function statusNachMenge(k, gesamt) {
        if (gesamt <= 0) return 'fehlt';
        return k.status === 'proxy' || k.status === 'original' ? k.status : 'original';
    }

    /** Neue Box aus den Karten der Uebersicht. Keine "neu"-Marken: beim Anlegen ist alles neu. */
    function neueBox(kopf, frische, heute) {
        const karten = [];
        (frische || []).forEach(function (f) {
            if (!f || !f.id) return;
            if (karten.some(function (k) { return gleicheKarte(k, f); })) return;
            karten.push(Object.assign({}, f, {
                gefordert: f.maxAnzahl > 0 ? f.maxAnzahl : null, drucke: [],
                status: 'fehlt', manuell: false, inDaten: true, neu: null
            }));
        });
        return {
            schemaVersion: 2,
            name: String(kopf.name || ''),
            archetyp: String(kopf.archetyp || ''),
            schwelle: String(kopf.schwelle || 'all'),
            datenStand: kopf.datenStand || null,
            erstellt: heute,
            aktualisiert: heute,
            mitFormaten: karten.some(function (k) { return !!k.formate; }),
            karten: karten
        };
    }

    /**
     * Box gegen frische Daten halten. Liefert eine NEUE Box (die alte bleibt
     * unberuehrt) und die Liste der neu hinzugekommenen Karten.
     *
     *  - bekannte Karte: Anteil und Datenzahl nachziehen; die Anzahl nur,
     *    wenn der Nutzer sie nicht selbst gesetzt hat. Status bleibt.
     *  - unbekannte Karte: kommt als "fehlt" mit Marke "neu" dazu.
     *  - Karte, die in den Daten fehlt: bleibt, wird als "nicht mehr in den
     *    Listen" benannt (manuell hinzugefuegte Karten sind davon ausgenommen).
     */
    function abgleichen(box, frische, kopf, heute) {
        const alt = Array.isArray(box && box.karten) ? box.karten : [];
        const karten = alt.map(normiert);
        const getroffen = new Set();
        const neu = [];
        const entfernt = Array.isArray(box && box.entfernt) ? box.entfernt.map(function (e) { return Object.assign({}, e); }) : [];
        const wieder = Array.isArray(box && box.wieder) ? box.wieder.map(function (e) { return Object.assign({}, e); }) : [];
        const wiederNeu = [];
        (frische || []).forEach(function (f) {
            if (!f || !f.id) return;
            // Von Hand entfernt? Dann nicht still wieder hineinlegen — nur
            // anbieten, und nur, wenn die Karte seitdem oefter gespielt wird.
            const weg = entfernt.find(function (e) { return gleicheKarte(e, f); });
            if (weg) {
                const jetzt = Number(f.anteil) || 0;
                const damals = Number(weg.anteil) || 0;
                const schon = wieder.findIndex(function (w) { return gleicheKarte(w, f); });
                if (jetzt > damals) {
                    const angebot = Object.assign({}, f, { anteilVorher: weg.anteil == null ? null : weg.anteil, entferntAm: weg.datum || null });
                    if (schon >= 0) wieder[schon] = angebot;
                    else { wieder.push(angebot); wiederNeu.push(angebot); }
                } else if (schon >= 0) {
                    wieder.splice(schon, 1);
                }
                return;
            }
            let idx = -1;
            for (let i = 0; i < karten.length; i++) {
                if (gleicheKarte(karten[i], f)) { idx = i; break; }
            }
            if (idx >= 0) {
                if (getroffen.has(idx)) return;      // zweiter Druck derselben Karte
                getroffen.add(idx);
                const k = karten[idx];
                k.anteil = f.anteil;
                k.maxAnzahl = f.maxAnzahl;
                if (!k.manuell && f.maxAnzahl > 0) k.gefordert = f.maxAnzahl;
                k.inDaten = true;
                if (f.reihe != null) k.reihe = f.reihe;
                if (f.formate) k.formate = f.formate;
                const refs = new Set([].concat(k.refs || [], f.refs || [], [f.id]));
                refs.delete(k.id);
                k.refs = Array.from(refs);
                if (!k.typ && f.typ) k.typ = f.typ;
            } else {
                const eintrag = Object.assign({}, f, {
                    gefordert: f.maxAnzahl > 0 ? f.maxAnzahl : null, drucke: [],
                    status: 'fehlt', manuell: false, inDaten: true, neu: heute
                });
                karten.push(eintrag);
                getroffen.add(karten.length - 1);
                neu.push(eintrag);
            }
        });
        const nichtMehr = [];
        const mitFormaten = (frische || []).some(function (f) { return f && f.formate; });
        karten.forEach(function (k, i) {
            if (getroffen.has(i) || k.manuell) return;
            if (k.inDaten !== false) nichtMehr.push(k);
            k.inDaten = false;
            // In keinem Format mehr gespielt: auch kein Anteil je Format.
            if (mitFormaten) k.formate = {};
        });
        const ergebnis = Object.assign({}, box, {
            schemaVersion: 2,
            karten: karten,
            entfernt: entfernt,
            wieder: wieder,
            aktualisiert: heute,
            datenStand: (kopf && kopf.datenStand) || (box && box.datenStand) || null,
            mitFormaten: mitFormaten || !!(box && box.mitFormaten)
        });
        return { box: ergebnis, neu: neu, nichtMehr: nichtMehr, wieder: wiederNeu };
    }

    function typRang(typ) {
        const i = TYP_REIHENFOLGE.indexOf(String(typ || ''));
        return i >= 0 ? i : TYP_REIHENFOLGE.length;
    }

    /** Die drei Rubriken der Box, in der Reihenfolge, in der sie gezeigt werden. */
    function rubriken(box) {
        const r = { fehlt: [], original: [], proxy: [] };
        (box && box.karten || []).forEach(function (k) {
            const s = STATUS.indexOf(k.status) >= 0 ? k.status : 'fehlt';
            r[s].push(k);
        });
        // Erst die Reihenfolge der Kartenuebersicht (Familie mit dem hoechsten
        // Anteil zuerst, Linie Basic -> Phase 2), dann Kartenart und Anteil.
        const reihe = function (k) { return Number.isFinite(k.reihe) ? k.reihe : 1e9; };
        const ordnung = function (a, b) {
            return reihe(a) - reihe(b)
                || typRang(a.typ) - typRang(b.typ)
                || (Number(b.anteil) || 0) - (Number(a.anteil) || 0)
                || String(a.name || '').localeCompare(String(b.name || ''))
                || String(a.id).localeCompare(String(b.id));
        };
        r.fehlt.sort(ordnung); r.original.sort(ordnung); r.proxy.sort(ordnung);
        return r;
    }

    function zaehlen(box) {
        const z = { fehlt: 0, original: 0, proxy: 0, kopien: { fehlt: 0, original: 0, proxy: 0 }, neu: 0 };
        (box && box.karten || []).forEach(function (k) {
            const s = STATUS.indexOf(k.status) >= 0 ? k.status : 'fehlt';
            z[s] += 1;
            z.kopien[s] += drin(k);
            if (k.neu) z.neu += 1;
        });
        return z;
    }

    /**
     * Groesse einer Box (Hausi, 28.09.2026: „wie gross die Box sein muss“).
     *  karten  — verschiedene Karten
     *  stueck  — Kopien, die die Box fassen muss: je Karte das Hoechste aus
     *            „gefordert“ und „drin“ (von Hand ohne Vorgabe: mindestens 1)
     *  fehlen  — Karten mit Status „fehlt“ (wie die Rubrik)
     *  offen   — Kopien, die noch fehlen: je Karte „gefordert“ minus „drin“
     */
    function umfang(box) {
        const u = { karten: 0, stueck: 0, fehlen: 0, offen: 0 };
        (box && box.karten || []).forEach(function (roh) {
            const k = normiert(roh);
            const soll = gefordertVon(k) > 0 ? gefordertVon(k) : 1;
            const menge = drin(k);
            u.karten += 1;
            u.stueck += Math.max(soll, menge);
            u.offen += Math.max(0, soll - menge);
            if ((STATUS.indexOf(k.status) >= 0 ? k.status : 'fehlt') === 'fehlt') u.fehlen += 1;
        });
        return u;
    }

    /**
     * Angezeigter Name einer Box. Eine Box aus einer Sammelauswahl
     * (archetyp "__familie__|Alakazam") hiess bisher wie der Titel in
     * Rotationen, „Alle Alakazam-Decks“. Hausi, 28.09.2026: das „Alle“ weg —
     * „Alakazam-Decks“ sagt schon, dass es mehrere sind; eine einzelne
     * Variante traegt nur ihren Decknamen. Gespeichert bleibt der alte Name.
     */
    const FAMILIE = '__familie__|';
    function anzeigeName(box, muster) {
        const a = String((box && box.archetyp) || '');
        if (a.indexOf(FAMILIE) === 0 && a.length > FAMILIE.length) {
            return String(muster || '{name}-Decks').replace('{name}', a.slice(FAMILIE.length));
        }
        return String((box && box.name) || '');
    }

    /** Was die Druckfunktion bekommt: jede Proxy-Karte, je Druck mit seiner Anzahl. */
    function proxyListe(box) {
        const aus = [];
        rubriken(box).proxy.forEach(function (k) {
            normiert(k).drucke.forEach(function (d) {
                aus.push({ name: k.name, set: d.set, number: d.number, anzahl: d.n });
            });
        });
        return aus;
    }

    function karteAendern(box, id, fn) {
        return Object.assign({}, box, {
            karten: (box.karten || []).map(function (k) { return k.id === id ? fn(normiert(k)) : k; })
        });
    }

    /**
     * Status setzen. Wer eine Karte einsortiert, hat die Neu-Marke gesehen.
     * "Fehlt" heisst: nichts in der Box. Original/Proxy bei leerer Box
     * legt die geforderte Menge hinein (mindestens eine Kopie).
     */
    function statusSetzen(box, id, status) {
        if (STATUS.indexOf(status) < 0) return box;
        return karteAendern(box, id, function (k) {
            let drucke = k.drucke;
            if (status === 'fehlt') drucke = [];
            else if (!drucke.length) drucke = [{ id: k.id, set: k.set, number: k.number, n: nullBis(k.gefordert || 1) || 1 }];
            return Object.assign(k, { status: status, drucke: drucke, neu: null });
        });
    }

    /**
     * Gesamtmenge in der Box setzen (Knoepfe − und +). Der angezeigte Druck
     * nimmt die Aenderung auf; wird er beim Wegnehmen leer, geben die
     * anderen Drucke ab, der groesste zuerst.
     */
    function drinSetzen(box, id, gesamt) {
        const ziel = nullBis(gesamt);
        return karteAendern(box, id, function (k) {
            let drucke = k.drucke.map(function (d) { return Object.assign({}, d); });
            let delta = ziel - drucke.reduce(function (a, d) { return a + d.n; }, 0);
            let haupt = drucke.find(function (d) { return d.id === k.id; });
            if (delta > 0) {
                if (!haupt) { haupt = { id: k.id, set: k.set, number: k.number, n: 0 }; drucke.unshift(haupt); }
                haupt.n += delta;
            } else if (delta < 0) {
                const reihe = drucke.slice().sort(function (a, b) {
                    return (b.id === k.id) - (a.id === k.id) || b.n - a.n;
                });
                for (let i = 0; i < reihe.length && delta < 0; i++) {
                    const weg = Math.min(reihe[i].n, -delta);
                    reihe[i].n -= weg; delta += weg;
                }
            }
            drucke = drucke.filter(function (d) { return d.n > 0; });
            return Object.assign(k, { drucke: drucke, status: statusNachMenge(k, ziel), neu: null });
        });
    }

    /** Tippen auf die Plakette "gefordert": auf die geforderte Menge auffuellen. */
    function auffuellen(box, id) {
        const k = (box.karten || []).find(function (x) { return x.id === id; });
        if (!k) return box;
        const soll = gefordertVon(k);
        if (!(soll > 0) || drin(k) >= soll) return box;
        return drinSetzen(box, id, soll);
    }

    /**
     * "Reingelegt" aus der Zusammen-Ansicht: die Box bekommt ihre geforderte
     * Menge (Status wird Original, wenn er "fehlt" war). Karten ohne
     * geforderte Menge (von Hand) bekommen eine Kopie, wenn noch keine drin ist.
     */
    function reinlegen(box, id) {
        const k = (box.karten || []).find(function (x) { return x.id === id; });
        if (!k) return box;
        const soll = gefordertVon(k);
        if (soll > 0) return auffuellen(box, id);
        return drin(k) > 0 ? box : drinSetzen(box, id, 1);
    }

    /**
     * Zusammen-Ansicht: je Karte (Set, Nummer) EINE Gruppe ueber alle Boxen —
     * nie ueber den Namen. Reihenfolge = erstes Auftreten (die Sortierung der
     * Eintraege bleibt erhalten). Je Box: soll, drin, offen; die Gruppe summiert.
     */
    function zusammenfassen(eintraege) {
        const gruppen = [];
        const nachId = new Map();
        (eintraege || []).forEach(function (e) {
            if (!e || !e.k) return;
            const k = normiert(e.k);
            const id = kartenId(k.set, k.number) || k.id;
            let g = nachId.get(id);
            if (!g) {
                g = { id: id, k: k, element: e.element, teile: [], soll: 0, drin: 0, offen: 0 };
                nachId.set(id, g);
                gruppen.push(g);
            }
            const soll = k.gefordert > 0 ? k.gefordert : 0;
            const d = drin(k);
            const offen = soll > 0 ? Math.max(0, soll - d) : (d > 0 ? 0 : 1);
            g.teile.push({ box: e.box, k: k, soll: soll, drin: d, offen: offen });
            g.soll += soll; g.drin += d; g.offen += offen;
        });
        return gruppen;
    }

    /**
     * Sammlung nachziehen: je Druck, wie viele als ORIGINAL in den Boxen
     * liegen (Proxys zaehlen nicht, die besitzt man nicht). Vorgeschlagen wird
     * hoechstens ein Playset (4) und nie weniger als schon in der Sammlung
     * steht — die Sammlung wird nur angehoben, nie gesenkt.
     * Schluessel wie in der Sammlung: "Name|SET|Nummer" (genau dieser Druck).
     */
    function sammlungsBedarf(teile, besitzVon) {
        const proDruck = new Map();
        (teile || []).forEach(function (t) {
            const k = normiert(t.k);
            if (!k || k.status !== 'original') return;
            (k.drucke || []).forEach(function (d) {
                const schluessel = k.name + '|' + String(d.set).toUpperCase() + '|' + d.number;
                const x = proDruck.get(schluessel) || { schluessel: schluessel, set: String(d.set).toUpperCase(), number: String(d.number), inBoxen: 0 };
                x.inBoxen += d.n;
                proDruck.set(schluessel, x);
            });
        });
        const aus = [];
        proDruck.forEach(function (x) {
            const besitz = Math.max(0, parseInt(besitzVon ? besitzVon(x.schluessel) : 0, 10) || 0);
            const ziel = Math.min(4, x.inBoxen);
            if (besitz < ziel) aus.push(Object.assign(x, { besitz: besitz, ziel: ziel }));
        });
        return aus;
    }

    /** Aufteilung nach Druck aus dem Druck-Dialog: [{id, set, number, n}]. */
    function druckeSetzen(box, id, liste) {
        return karteAendern(box, id, function (k) {
            const gesehen = new Set();
            const drucke = (liste || []).filter(function (d) {
                if (!d || !d.id || gesehen.has(d.id) || !(nullBis(d.n) > 0)) return false;
                gesehen.add(d.id); return true;
            }).map(function (d) { return { id: d.id, set: d.set, number: d.number, n: nullBis(d.n) }; });
            const gesamt = drucke.reduce(function (a, d) { return a + d.n; }, 0);
            return Object.assign(k, { drucke: drucke, status: statusNachMenge(k, gesamt), neu: null });
        });
    }

    /** Karte von Hand dazu. Liegt sie (oder ein anderer Druck davon) schon drin, passiert nichts. */
    function manuellHinzufuegen(box, eintrag, heute) {
        if (!eintrag || !eintrag.id) return { box: box, hinzugefuegt: false };
        const karten = box.karten || [];
        if (karten.some(function (k) { return gleicheKarte(k, eintrag); })) {
            return { box: box, hinzugefuegt: false };
        }
        const neuEintrag = Object.assign({}, eintrag, {
            gefordert: null, drucke: [],
            status: 'fehlt', manuell: true, inDaten: null, neu: null,
            hinzugefuegt: heute
        });
        return { box: Object.assign({}, box, {
            karten: karten.concat([neuEintrag]),
            entfernt: (box.entfernt || []).filter(function (e) { return !gleicheKarte(e, eintrag); }),
            wieder: (box.wieder || []).filter(function (w) { return !gleicheKarte(w, eintrag); })
        }), hinzugefuegt: true };
    }

    /**
     * Karte aus der Box nehmen. Sie wird gemerkt (Hausi, 28.09.2026): wird
     * sie spaeter oefter gespielt, bietet das Aktualisieren sie wieder an,
     * statt sie still zurueckzulegen oder sie fuer immer zu vergessen.
     */
    function entfernen(box, id, heute) {
        const k = (box.karten || []).find(function (x) { return x.id === id; });
        if (!k) return box;
        const merk = { id: k.id, refs: k.refs || [], name: k.name, set: k.set, number: k.number,
            bild: k.bild || '', typ: k.typ || '', anteil: k.anteil == null ? null : k.anteil, datum: heute || null };
        const entfernt = (box.entfernt || []).filter(function (e) { return !gleicheKarte(e, k); }).concat([merk]);
        return Object.assign({}, box, {
            karten: (box.karten || []).filter(function (x) { return x.id !== id; }),
            entfernt: entfernt,
            wieder: (box.wieder || []).filter(function (w) { return !gleicheKarte(w, k); })
        });
    }

    /** Angebotene Karte wieder aufnehmen: sie kommt als "fehlt" mit Marke "Neu" in die Box. */
    function wiederAufnehmen(box, id, heute) {
        const w = (box.wieder || []).find(function (x) { return x.id === id; });
        if (!w) return box;
        const eintrag = Object.assign({}, w, {
            gefordert: w.maxAnzahl > 0 ? w.maxAnzahl : null, drucke: [],
            status: 'fehlt', manuell: false, inDaten: true, neu: heute
        });
        delete eintrag.anteilVorher; delete eintrag.entferntAm;
        return Object.assign({}, box, {
            karten: (box.karten || []).concat([eintrag]),
            wieder: (box.wieder || []).filter(function (x) { return x.id !== id; }),
            entfernt: (box.entfernt || []).filter(function (e) { return !gleicheKarte(e, w); })
        });
    }

    /** Angebot ablehnen: draussen lassen, und erst wieder anbieten, wenn der Anteil weiter steigt. */
    function draussenLassen(box, id) {
        const w = (box.wieder || []).find(function (x) { return x.id === id; });
        if (!w) return box;
        return Object.assign({}, box, {
            wieder: (box.wieder || []).filter(function (x) { return x.id !== id; }),
            entfernt: (box.entfernt || []).map(function (e) {
                return gleicheKarte(e, w) ? Object.assign({}, e, { anteil: w.anteil == null ? e.anteil : w.anteil }) : e;
            })
        });
    }

    // ── Filter und Sortierung der Box-Ansicht ──

    const ELEMENTE = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting',
        'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless'];

    /** Passt eine Karte zu den Filtern? filter = {anteil, art, element}. */
    function filterPasst(k, filter, element) {
        const f = filter || {};
        const a = k.anteil == null ? null : Number(k.anteil);
        if (f.anteil && f.anteil !== 'alle') {
            if (f.anteil === 'u10') { if (!(a != null && a < 10)) return false; }
            else if (!(a != null && a >= Number(f.anteil))) return false;
        }
        if (f.art && f.art !== 'alle' && String(k.typ || '') !== f.art) return false;
        if (f.art === 'Pokemon' && f.element && f.element !== 'alle' && element !== f.element) return false;
        return true;
    }

    /*
     * Hauptfilter "Format" (Hausi, 28.09.2026 abends). Alle Zahlen stammen
     * aus den Rotationen-Daten (Anteil der Karte je Format, k.formate) und
     * aus data/format_window.json + data/sets.json (Legalitaet).
     *
     *   aktuell  — im neuesten Format mit Turnierdaten gespielt
     *   standard — mindestens ein Druck ist im aktuellen Standard legal
     *   expanded — kein Druck ist im Standard legal
     *   raus     — vorher >= META_SCHWELLE, jetzt darunter (oder gar nicht)
     *   neu      — jetzt >= META_SCHWELLE, vorher darunter (oder gar nicht)
     *   rotiert  — vor der letzten Rotation legal, jetzt nicht mehr
     *
     * kontext = { aktuell, vorher, legal(k) -> true|false|null, legalVorRotation(k) }
     * Unbekannt (null) passt zu keinem der Legalitaetsfilter — lieber eine
     * Karte zu wenig anzeigen als eine falsch einsortieren.
     */
    const META_SCHWELLE = 10;

    function anteilIn(k, fmt) {
        const f = k && k.formate;
        if (!f || !fmt) return 0;
        const v = Number(f[fmt]);
        return Number.isFinite(v) ? v : 0;
    }

    /**
     * Wurde der Archetyp der Box im Format ueberhaupt gespielt? Abgeleitet aus
     * den Karten: spielt irgendein Deck des Archetyps in diesem Format, hat
     * mindestens eine Karte der Box dort einen Anteil ueber 0.
     */
    function imFormatGespielt(box, fmt) {
        if (!box || !fmt) return false;
        return (box.karten || []).some(function (k) { return anteilIn(k, fmt) > 0; });
    }

    function formatPasst(k, wahl, kontext, box) {
        if (!wahl || wahl === 'alle') return true;
        const c = kontext || {};
        if (wahl === 'aktuell') return anteilIn(k, c.aktuell) > 0;
        // Hausi, 29.09.2026: „aus dem Meta gefallen“ nur, wenn der Archetyp im
        // neuen Meta gespielt wurde — ohne Deck im neuen Meta faellt nichts heraus.
        if (wahl === 'raus') return (!box || imFormatGespielt(box, c.aktuell))
            && anteilIn(k, c.vorher) >= META_SCHWELLE && anteilIn(k, c.aktuell) < META_SCHWELLE;
        if (wahl === 'neu') return anteilIn(k, c.aktuell) >= META_SCHWELLE && anteilIn(k, c.vorher) < META_SCHWELLE;
        const legal = typeof c.legal === 'function' ? c.legal(k) : null;
        if (wahl === 'standard') return legal === true;
        if (wahl === 'expanded') return legal === false;
        if (wahl === 'rotiert') {
            const vorher = typeof c.legalVorRotation === 'function' ? c.legalVorRotation(k) : null;
            return legal === false && vorher === true;
        }
        return true;
    }

    /** Neuestes und vorletztes Format mit Turnierdaten, nach max_date im Manifest. */
    function formateNachDatum(manifest) {
        const keys = (manifest && manifest.meta_keys) || [];
        const chunks = (manifest && manifest.chunks) || [];
        const daten = (manifest && manifest.chunk_dates) || {};
        return keys.map(function (k, i) {
            const d = daten[chunks[i]] || {};
            return { key: k, bis: d.max_date || '' };
        }).filter(function (x) { return x.bis; })
          .sort(function (a, b) { return a.bis < b.bis ? 1 : (a.bis > b.bis ? -1 : 0); });
    }

    /**
     * Blockanfang vor der letzten Rotation: das juengste Anfangsset aus den
     * Formatschluesseln (BRS-…, SVI-…, TEF-…), das aelter ist als das
     * aktuelle oldest_legal_set. Reihenfolge aus data/sets.json.
     */
    function blockVorRotation(metaKeys, aeltestesLegal, setOrder) {
        const o = setOrder || {};
        const jetzt = o[String(aeltestesLegal || '').toUpperCase()];
        if (jetzt == null) return null;
        let best = null;
        (metaKeys || []).forEach(function (key) {
            const start = String(key).split('-')[0].toUpperCase();
            const v = o[start];
            if (v == null || v >= jetzt) return;
            if (!best || v > o[best]) best = start;
        });
        return best;
    }

    /**
     * Anteil je Format an die frischen Eintraege haengen.
     * jeFormat = { 'TEF-PBL': [{ ids: ['PBL-12', 'SVP-1'], anteil: 80 }], … }
     * Verbunden wird ueber (Set, Nummer) — der Eintrag und alle seine
     * internationalen Drucke —, nie ueber den Namen. Mehrere Treffer in
     * einem Format (zwei Drucke derselben Karte): der hoechste Anteil.
     */
    function formateZuordnen(frische, jeFormat) {
        const formate = Object.keys(jeFormat || {});
        return (frische || []).map(function (f) {
            if (!f || !f.id) return f;
            const ids = new Set([f.id].concat(f.refs || []));
            const aus = {};
            formate.forEach(function (fmt) {
                (jeFormat[fmt] || []).forEach(function (r) {
                    const a = Number(r && r.anteil);
                    if (!Number.isFinite(a)) return;
                    if (!(r.ids || []).some(function (id) { return ids.has(id); })) return;
                    if (aus[fmt] == null || a > aus[fmt]) aus[fmt] = a;
                });
            });
            return Object.assign({}, f, { formate: aus });
        });
    }

    /** Ist eine der Kennungen (Set-Nummer) in einem der Sets? */
    function druckIn(ids, sets) {
        if (!sets) return null;
        return (ids || []).some(function (id) {
            const set = String(id).split('-')[0];
            return sets.has(set);
        });
    }

    function elementRang(e) {
        const i = ELEMENTE.indexOf(String(e || ''));
        return i >= 0 ? i : ELEMENTE.length;
    }

    /**
     * Eintraege [{box, k, element}] sortieren.
     *  'anteil' — Standard: in einer Box die Reihenfolge der Kartenuebersicht,
     *             ueber mehrere Boxen der Anteil (hoechster zuerst).
     *  'art'    — wie man Karten einsortiert: Pokemon nach Typ (Pflanze,
     *             Feuer, Wasser …), dann Supporter, Items, Tools, Stadien,
     *             Ace Spec, Energie; innerhalb nach Name.
     */
    function sortieren(eintraege, art, eineBox) {
        const reihe = function (k) { return Number.isFinite(k.reihe) ? k.reihe : 1e9; };
        const name = function (e) { return String(e.k.name || ''); };
        const boxName = function (e) { return anzeigeName(e.box); };
        return eintraege.slice().sort(function (a, b) {
            if (art === 'art') {
                return typRang(a.k.typ) - typRang(b.k.typ)
                    || (a.k.typ === 'Pokemon' ? elementRang(a.element) - elementRang(b.element) : 0)
                    || name(a).localeCompare(name(b))
                    || String(a.k.id).localeCompare(String(b.k.id))
                    || boxName(a).localeCompare(boxName(b));
            }
            if (eineBox) {
                return reihe(a.k) - reihe(b.k)
                    || typRang(a.k.typ) - typRang(b.k.typ)
                    || (Number(b.k.anteil) || 0) - (Number(a.k.anteil) || 0)
                    || name(a).localeCompare(name(b));
            }
            return (Number(b.k.anteil) || 0) - (Number(a.k.anteil) || 0)
                || typRang(a.k.typ) - typRang(b.k.typ)
                || name(a).localeCompare(name(b))
                || boxName(a).localeCompare(boxName(b));
        });
    }

    /**
     * Anzahl, die die Kartenuebersicht auf dem Kaertchen zeigt — dieselbe
     * Regel wie getPastMetaDisplayCount in js/app-past-meta.js, aber mit
     * eigenem Umfang, weil die Box auch ohne sichtbare Uebersicht rechnet.
     * Die Gleichheit beider Regeln prueft tests/unit/test-archetyp-box.js,
     * indem es beide ausfuehrt.
     */
    function anzahlWieUebersicht(card, totalDecklists, repraesentativ) {
        const maxCount = parseInt((card && card.max_count) || 0, 10) || 0;
        if (!(totalDecklists > 1)) return maxCount;
        const r = Number(repraesentativ);
        if (r > 0) return Math.max(1, Math.round(r));
        return maxCount;
    }

    /** ISO-Datum (JJJJ-MM-TT) aus Millisekunden, sonst null. */
    function isoTag(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return null;
        const d = new Date(ms);
        const p = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    /** Juengstes max_date im Manifest der Rotationen-Daten, sonst null. */
    function neuestesDatumImManifest(manifest) {
        const daten = manifest && manifest.chunk_dates;
        if (!daten || typeof daten !== 'object') return null;
        let best = null;
        Object.keys(daten).forEach(function (k) {
            const m = daten[k] && daten[k].max_date;
            if (typeof m === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m) && (!best || m > best)) best = m;
        });
        return best;
    }

    /** Gibt es Turnierdaten, die juenger sind als der letzte Abgleich der Box? */
    function neueDatenDa(box, manifestDatum) {
        if (!box || !manifestDatum) return false;
        if (!box.datenStand) return true;
        return manifestDatum > box.datenStand;
    }

    const Logik = {
        kartenId, gleicheKarte, neueBox, abgleichen, rubriken, zaehlen, proxyListe,
        statusSetzen, drinSetzen, auffuellen, reinlegen, zusammenfassen, sammlungsBedarf, druckeSetzen, drin, normiert, gefordertVon, umfang, anzeigeName,
        manuellHinzufuegen, entfernen, wiederAufnehmen, draussenLassen, filterPasst, sortieren, ELEMENTE,
        formatPasst, imFormatGespielt, formateNachDatum, blockVorRotation, druckIn, anteilIn, META_SCHWELLE, formateZuordnen,
        anzahlWieUebersicht,
        isoTag, neuestesDatumImManifest, neueDatenDa, anzahlBegrenzen, STATUS
    };

    // Im Test gibt es kein document: dann nur die Logik ausliefern.
    if (typeof document === 'undefined') {
        if (typeof module !== 'undefined' && module.exports) module.exports = Logik;
        else if (typeof globalThis !== 'undefined') globalThis.ArchetypBoxLogik = Logik;
        return;
    }

    // ════════════════════════════════════════════════════════
    // Hilfen fuer die Seite
    // ════════════════════════════════════════════════════════

    function tx(key, vars, rueckfall) {
        if (typeof t === 'function') {
            const s = t(key, vars);
            if (s && s !== key) return s;
        }
        let r = rueckfall || key;
        if (vars) r = r.replace(/\{(\w+)\}/g, function (g, n) { return n in vars ? String(vars[n]) : g; });
        return r;
    }

    function nameVon(b) { return anzeigeName(b, tx('abx.familieName', null, '{name}-Decks')); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(text, art) {
        if (typeof showToast === 'function') showToast(text, art || 'info');
    }

    function heuteIso() { return isoTag(Date.now()); }

    function datumLesbar(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return '–';
        return m[3] + '.' + m[2] + '.' + m[1];
    }

    function prozent(x) {
        const n = Number(x);
        if (!Number.isFinite(n)) return '';
        if (typeof zahlKomma === 'function') return zahlKomma(n) + ' %';
        return String(Math.round(n * 10) / 10) + ' %';
    }

    function nutzer() {
        try { return (window.auth && window.auth.currentUser) || null; } catch (_) { return null; }
    }

    function sammlung() {
        const u = nutzer();
        if (!u || !window.db) return null;
        try { return window.db.collection('users').doc(u.uid).collection(SAMMLUNG); }
        catch (_) { return null; }
    }

    // ════════════════════════════════════════════════════════
    // Speicher
    // ════════════════════════════════════════════════════════

    let boxen = [];            // [{id, ...box}]
    let geladenFuer = null;    // uid, fuer die `boxen` gilt
    let ladeLauf = null;
    let aktiveId = null;
    let letztesErgebnis = null; // {id, neu:[], nichtMehr:[]}
    let manifestDatum = null;

    function spiegelLesen(uid) {
        try {
            const roh = JSON.parse(localStorage.getItem(SPIEGEL_SCHLUESSEL + ':' + uid) || '[]');
            return Array.isArray(roh) ? roh : [];
        } catch (_) { return []; }
    }

    function spiegelSchreiben() {
        if (!geladenFuer) return;
        try { localStorage.setItem(SPIEGEL_SCHLUESSEL + ':' + geladenFuer, JSON.stringify(boxen)); }
        catch (_) { /* voll oder gesperrt */ }
    }

    async function laden(erzwingen) {
        const u = nutzer();
        if (!u) { boxen = []; geladenFuer = null; return boxen; }
        if (geladenFuer === u.uid && !erzwingen) return boxen;
        if (ladeLauf) return ladeLauf;
        ladeLauf = (async function () {
            const col = sammlung();
            try {
                if (!col) throw new Error('keine Datenbank');
                const snap = await col.get();
                boxen = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
                geladenFuer = u.uid;
                spiegelSchreiben();
            } catch (e) {
                console.warn('[ArchetypBox] Boxen nicht ladbar:', e && e.message);
                boxen = spiegelLesen(u.uid);
                geladenFuer = u.uid;
            }
            boxen.sort(function (a, b) { return nameVon(a).localeCompare(nameVon(b)); });
            return boxen;
        })();
        try { return await ladeLauf; } finally { ladeLauf = null; }
    }

    /** Schreiben: sofort in der Liste, im Hintergrund ins Konto. Fehler werden gemeldet. */
    function schreiben(box) {
        const i = boxen.findIndex(function (b) { return b.id === box.id; });
        if (i >= 0) boxen[i] = box; else boxen.push(box);
        spiegelSchreiben();
        const col = sammlung();
        if (!col) {
            toast(tx('abx.nichtGespeichert', null, 'Die Box konnte nicht im Konto gespeichert werden.'), 'error');
            return Promise.resolve(false);
        }
        // Firestore lehnt `undefined` ab — ueber JSON gehen, dann fehlt so ein Feld einfach.
        const nutzlast = JSON.parse(JSON.stringify(box));
        delete nutzlast.id;
        return col.doc(box.id).set(nutzlast).then(function () { return true; }, function (err) {
            console.warn('[ArchetypBox] nicht gespeichert:', err && err.message);
            toast(tx('abx.nichtGespeichert', null, 'Die Box konnte nicht im Konto gespeichert werden.'), 'error');
            return false;
        });
    }

    function neueId() {
        const col = sammlung();
        if (col) { try { return col.doc().id; } catch (_) { /* unten */ } }
        return 'abx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function boxFuerArchetyp(archetyp) {
        return boxen.find(function (b) { return b.archetyp === archetyp; }) || null;
    }

    // ════════════════════════════════════════════════════════
    // Karten der Uebersicht -> Eintraege der Box
    // ════════════════════════════════════════════════════════

    /** Druck einer Uebersichtskarte, so wie die Kartenuebersicht ihn im Modus "Low Rarity" zeigt. */
    /** Name, Set und Nummer einer Uebersichtskarte. */
    function setNummerVon(card) {
        const vollName = String(card.full_card_name || card.card_name || '').trim();
        let name = vollName;
        let set = String(card.set_code || card.set || '').trim().toUpperCase();
        let nummer = String(card.set_number || card.number || '').trim();
        if ((!set || !nummer) && card.card_identifier) {
            const m = String(card.card_identifier).trim().match(/^([A-Z0-9]{2,6})\s+([A-Z0-9-]+)$/i);
            if (m) { if (!set) set = m[1].toUpperCase(); if (!nummer) nummer = m[2]; }
        }
        if (!set || !nummer) {
            const m = vollName.match(/^(.+?)\s+([A-Z0-9]{2,4})\s+([A-Z0-9]+)$/);
            if (m) { name = m[1].trim(); set = m[2]; nummer = m[3]; }
        }
        return { name: name, set: set, nummer: nummer };
    }

    function anteilVon(card) {
        const roh = (typeof parseLocaleNumber === 'function')
            ? parseLocaleNumber(card.percentage_in_archetype || card.share_percent || '', NaN)
            : parseFloat(String(card.percentage_in_archetype || '').replace(',', '.'));
        return Number.isFinite(roh) ? Math.round(roh * 10) / 10 : null;
    }

    /**
     * Anteil je Format: die Decks nach deck.format getrennt, jede Gruppe
     * mit derselben Statistik wie die Kartenuebersicht zusammengefasst.
     * Liefert { format: [{ ids, anteil }] } fuer formateZuordnen.
     */
    function jeFormatAus(matchingDecks) {
        if (typeof _pmAggregiereDecks !== 'function') return {};
        const gruppen = {};
        (matchingDecks || []).forEach(function (d) {
            const f = String((d && d.format) || '');
            if (!f) return;
            (gruppen[f] = gruppen[f] || []).push(d);
        });
        const aus = {};
        Object.keys(gruppen).forEach(function (fmt) {
            let karten = [];
            try { karten = _pmAggregiereDecks(gruppen[fmt]).aggregatedCards || []; } catch (_) { karten = []; }
            aus[fmt] = karten.map(function (c) {
                const sn = setNummerVon(c);
                const id = kartenId(sn.set, sn.nummer);
                if (!id) return null;
                let ids = [id];
                if (typeof getInternationalPrintsForCard === 'function') {
                    try {
                        ids = ids.concat((getInternationalPrintsForCard(sn.set, sn.nummer) || [])
                            .map(function (p) { return kartenId(p.set, p.number); }).filter(Boolean));
                    } catch (_) { /* nur der eigene Druck */ }
                }
                return { ids: ids, anteil: anteilVon(c) };
            }).filter(Boolean);
        });
        return aus;
    }

    function eintragAusUebersicht(card, totalDecklists) {
        const sn = setNummerVon(card);
        const name = sn.name;
        const set = sn.set;
        const nummer = sn.nummer;
        if (!set || !nummer) return null;   // ohne (Set, Nummer) keine Identitaet

        let druck = null;
        const imDb = (typeof getCanonicalCardRecord === 'function') ? getCanonicalCardRecord(set, nummer) : null;
        if (imDb && typeof getPreferredVersionForCard === 'function') {
            let vorher;
            let gesetzt = false;
            try {
                // Dieselbe Wahl wie die Uebersicht im Modus "Low Rarity".
                if (typeof globalRarityPreference !== 'undefined') {
                    vorher = globalRarityPreference;
                    globalRarityPreference = 'min';
                    gesetzt = true;
                }
                druck = getPreferredVersionForCard(name, imDb.set, imDb.number);
            } catch (_) {
                druck = null;
            } finally {
                if (gesetzt) globalRarityPreference = vorher;
            }
        }
        if (!druck) druck = imDb;
        const dSet = String((druck && druck.set) || set).toUpperCase();
        const dNummer = String((druck && druck.number) || nummer);
        const id = kartenId(dSet, dNummer);
        if (!id) return null;

        let refs = [];
        if (typeof getInternationalPrintsForCard === 'function') {
            try {
                refs = (getInternationalPrintsForCard(dSet, dNummer) || [])
                    .map(function (p) { return kartenId(p.set, p.number); }).filter(Boolean);
            } catch (_) { refs = []; }
        }
        const eigen = kartenId(set, nummer);
        if (eigen && refs.indexOf(eigen) < 0) refs.push(eigen);
        refs = refs.filter(function (r) { return r !== id; });

        const anzeigeName = (typeof getDisplayCardName === 'function')
            ? getDisplayCardName(name, dSet, dNummer) : name;
        let bild = '';
        if (typeof getBestCardImage === 'function') {
            try {
                bild = getBestCardImage(Object.assign({}, druck || {}, {
                    set_code: dSet, set_number: dNummer, card_name: name,
                    image_url: (druck && druck.image_url) || card.image_url || ''
                })) || '';
            } catch (_) { bild = ''; }
        }
        if (!bild) bild = (druck && druck.image_url) || card.image_url || '';
        const typ = (typeof getCardType === 'function') ? getCardType(name, dSet, dNummer) : '';
        const rep = (typeof getPastMetaRepresentativeCardCopies === 'function')
            ? getPastMetaRepresentativeCardCopies(card) : 0;

        return {
            id: id,
            name: anzeigeName || name,
            set: dSet,
            number: dNummer,
            bild: bild,
            typ: typ || '',
            element: typ === 'Pokemon' ? String((druck && druck.energy_type) || (imDb && imDb.energy_type) || '') : '',
            anzahl: anzahlWieUebersicht(card, totalDecklists, rep),
            maxAnzahl: parseInt(card.max_count || 0, 10) || 0,
            anteil: anteilVon(card),
            refs: refs
        };
    }

    /** In der Reihenfolge der Kartenuebersicht (sortCardsByType), mit Platznummer. */
    function eintraegeAus(karten, totalDecklists) {
        let liste = (karten || []).slice();
        if (typeof sortCardsByType === 'function') {
            try { liste = sortCardsByType(liste); } catch (_) { /* Reihenfolge wie geliefert */ }
        }
        const aus = [];
        liste.forEach(function (c) {
            const e = eintragAusUebersicht(c, totalDecklists);
            if (e) { e.reihe = aus.length; aus.push(e); }
        });
        return aus;
    }

    // ════════════════════════════════════════════════════════
    // Rotationen: der Knopf in der Kartenuebersicht
    // ════════════════════════════════════════════════════════

    function el(id) { return document.getElementById(id); }

    function uebersichtZustand() {
        const format = el('pastMetaFormatFilter');
        const deck = el('pastMetaDeckSelect');
        const filter = el('pastMetaFilterSelect');
        const archetyp = deck ? String(deck.value || '').trim() : '';
        const karten = (typeof pastMetaCurrentCards !== 'undefined' && Array.isArray(pastMetaCurrentCards))
            ? pastMetaCurrentCards : [];
        const aktuellesDeck = (typeof pastMetaCurrentDeck !== 'undefined') ? pastMetaCurrentDeck : null;
        const umfang = (typeof pastMetaCurrentScope !== 'undefined') ? pastMetaCurrentScope : null;
        return {
            alleFormate: !!format && format.value === 'all',
            archetyp: archetyp,
            name: (aktuellesDeck && aktuellesDeck.deck_name) || archetyp,
            schwelle: filter ? String(filter.value || 'all') : 'all',
            karten: karten,
            umfang: umfang,
            passt: !!aktuellesDeck && karten.length > 0 && umfang && umfang.format === 'all'
        };
    }

    function gefilterteKarten(karten, schwelle) {
        if (typeof applyShareFilterWithAceSpecBoost === 'function') {
            return applyShareFilterWithAceSpecBoost(karten, schwelle);
        }
        return karten.slice();
    }

    function schwelleText(schwelle) {
        return schwelle === 'all'
            ? tx('abx.schwelleAlle', null, 'alle Karten')
            : tx('abx.schwelleAb', { n: schwelle }, 'Karten ab {n} %');
    }

    async function uebersichtGezeichnet() {
        const knopf = el('pastMetaArchetypBoxBtn');
        if (!knopf) return;
        const z = uebersichtZustand();
        const zeigen = z.alleFormate && z.passt && !!z.archetyp;
        knopf.classList.toggle('d-none', !zeigen);
        if (!zeigen) { hinweisSetzen(''); return; }
        // Die Rueckmeldung gehoert zu EINEM Archetyp — beim Wechsel weg damit.
        if (hinweisFuer && hinweisFuer !== z.archetyp) hinweisSetzen('');
        if (nutzer()) { try { await laden(); } catch (_) { /* Liste bleibt leer */ } }
        const box = boxFuerArchetyp(z.archetyp);
        if (box) {
            knopf.textContent = tx('abx.knopfAktualisieren', null, 'Archetyp-Box aktualisieren');
            knopf.title = tx('abx.knopfAktualisierenTitel', { schwelle: schwelleText(box.schwelle || 'all') },
                'Neue Karten aus den Turnierdaten übernehmen ({schwelle})');
        } else {
            const n = gefilterteKarten(z.karten, z.schwelle).length;
            knopf.textContent = tx('abx.knopfAnlegen', { n: n }, 'Zu Archetyp-Box hinzufügen ({n})');
            knopf.title = tx('abx.knopfAnlegenTitel', { schwelle: schwelleText(z.schwelle) },
                'Eine Box für diesen Archetyp anlegen ({schwelle})');
        }
    }

    let hinweisFuer = null;   // Archetyp, zu dem die Rueckmeldung gehoert

    function hinweisSetzen(html, archetyp) {
        const h = el('pastMetaArchetypBoxHinweis');
        if (!h) return;
        hinweisFuer = html ? (archetyp || null) : null;
        h.innerHTML = html || '';
        h.classList.toggle('d-none', !html);
    }

    function oeffnenKnopf(id) {
        return '<button type="button" class="btn-modern abx-oeffnen" onclick="ArchetypBox.oeffnen(\''
            + esc(id) + '\')">' + esc(tx('abx.boxOeffnen', null, 'Box öffnen')) + '</button>';
    }

    function namenListe(eintraege, max) {
        const namen = eintraege.slice(0, max).map(function (e) { return e.name + ' (' + e.set + ' ' + e.number + ')'; });
        if (eintraege.length > max) namen.push(tx('abx.undWeitere', { n: eintraege.length - max }, 'und {n} weitere'));
        return namen.join(', ');
    }

    function ergebnisSatz(erg) {
        const teile = [];
        if (erg.neu.length === 0) {
            teile.push(tx('abx.keineNeuen', null, 'Keine neuen Karten — die Box kennt alle Karten der Turnierdaten.'));
        } else {
            teile.push(tx('abx.neueKarten', { n: erg.neu.length, liste: namenListe(erg.neu, 8) },
                '{n} neue Karten: {liste}'));
        }
        if (erg.wieder && erg.wieder.length) {
            teile.push(tx('abx.wiederSatz', { n: erg.wieder.length },
                '{n} früher entfernte Karten werden wieder öfter gespielt — unten entscheiden.'));
        }
        if (erg.nichtMehr.length) {
            teile.push(tx('abx.nichtMehrSatz', { n: erg.nichtMehr.length },
                '{n} Karten kommen in den Listen nicht mehr vor — sie bleiben in der Box.'));
        }
        return teile.join(' ');
    }

    async function ausUebersicht() {
        if (!nutzer()) {
            toast(tx('abx.anmelden', null, 'Bitte melde dich an — die Archetyp-Box liegt in deinem Konto.'), 'warning');
            return;
        }
        const z = uebersichtZustand();
        if (!(z.alleFormate && z.passt && z.archetyp)) return;
        await laden();
        const vorhanden = boxFuerArchetyp(z.archetyp);
        const schwelle = vorhanden ? String(vorhanden.schwelle || 'all') : z.schwelle;
        const datenStand = isoTag(stichtagFuer(z.archetyp));
        const decks = (typeof _pmDeckAuswahl === 'function') ? (_pmDeckAuswahl('all', 'all', z.archetyp).matchingDecks || []) : [];
        const frische = formateZuordnen(eintraegeAus(gefilterteKarten(z.karten, schwelle), z.umfang && z.umfang.totalDecklists),
            jeFormatAus(decks));
        if (frische.length === 0) {
            toast(tx('abx.keineKarten', null, 'Keine Karten mit Set und Nummer gefunden.'), 'warning');
            return;
        }
        const heute = heuteIso();
        if (vorhanden) {
            const erg = abgleichen(vorhanden, frische, { datenStand: datenStand }, heute);
            await schreiben(erg.box);
            letztesErgebnis = { id: vorhanden.id, neu: erg.neu, nichtMehr: erg.nichtMehr, wieder: erg.wieder };
            hinweisSetzen('<span>' + esc(ergebnisSatz(erg)) + '</span> ' + oeffnenKnopf(vorhanden.id), z.archetyp);
        } else {
            const box = neueBox({ name: z.name, archetyp: z.archetyp, schwelle: schwelle, datenStand: datenStand },
                frische, heute);
            box.id = neueId();
            await schreiben(box);
            letztesErgebnis = null;
            hinweisSetzen('<span>' + esc(tx('abx.angelegt', { name: nameVon(box), n: box.karten.length },
                'Archetyp-Box „{name}“ angelegt: {n} Karten, alle als „fehlt“ markiert.')) + '</span> '
                + oeffnenKnopf(box.id), z.archetyp);
        }
        uebersichtGezeichnet();
    }

    /** Juengstes Turnierdatum der Decks, aus denen die Karten stammen. */
    function stichtagFuer(archetyp) {
        if (typeof _pmDeckAuswahl !== 'function' || typeof parsePastMetaDateMs !== 'function') return 0;
        try {
            const decks = _pmDeckAuswahl('all', 'all', archetyp).matchingDecks || [];
            let best = 0;
            decks.forEach(function (d) {
                const ms = parsePastMetaDateMs(d.tournament_date);
                if (Number.isFinite(ms) && ms > best) best = ms;
            });
            return best;
        } catch (_) { return 0; }
    }

    // ════════════════════════════════════════════════════════
    // Aktualisieren ohne sichtbare Uebersicht (aus dem Profil)
    // ════════════════════════════════════════════════════════

    function warten(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    async function kartenDbVoll(maxMs) {
        if (typeof loadAllCardsDatabase === 'function'
            && (!window.allCardsDatabase || window.allCardsDatabase.length === 0)) {
            try { await loadAllCardsDatabase(); } catch (_) { /* weiter */ }
        }
        const bis = Date.now() + maxMs;
        while (window.cardDBFullyLoaded !== true && Date.now() < bis) await warten(400);
    }

    async function rotationenDatenLaden(fortschritt) {
        if (typeof loadPastMeta !== 'function' || typeof _loadPastMetaChunksIfNeeded !== 'function') {
            throw new Error('Rotationen-Daten nicht verfügbar');
        }
        fortschritt(tx('abx.ladeUebersicht', null, 'Lade Turnierübersicht …'));
        await loadPastMeta();
        await _loadPastMetaChunksIfNeeded('all', window._pastMetaSetOrderMap, window._pastMetaTournamentsByDate,
            function (n, g) {
                fortschritt(tx('abx.ladeFormate', { n: n, g: g }, 'Lade Turnierdaten aller Formate … {n} von {g}'));
            });
        fortschritt(tx('abx.ladeKarten', null, 'Lade Kartendatenbank …'));
        await kartenDbVoll(60000);
    }

    let aktualisiertGerade = false;

    /** Eine Box gegen die geladenen Rotationen-Daten halten und speichern. null = Archetyp nicht mehr in den Daten. */
    async function abgleichSpeichern(box) {
        const auswahl = _pmDeckAuswahl('all', 'all', box.archetyp);
        if (!auswahl.matchingDecks.length) return null;
        const summe = _pmAggregiereDecks(auswahl.matchingDecks);
        const karten = gefilterteKarten(summe.aggregatedCards, String(box.schwelle || 'all'));
        const frische = formateZuordnen(eintraegeAus(karten, summe.totalDecklists), jeFormatAus(auswahl.matchingDecks));
        const erg = abgleichen(box, frische, { datenStand: isoTag(summe.letztesDatumMs) }, heuteIso());
        erg.box.id = box.id;
        await schreiben(erg.box);
        return erg;
    }

    /**
     * Aktualisieren: eine Box (id) oder, mit id null, alle Boxen nacheinander —
     * die Turnierdaten werden dafuer nur einmal geladen.
     */
    async function aktualisieren(id) {
        if (aktualisiertGerade) return;
        const liste = id ? boxen.filter(function (b) { return b.id === id; }) : boxen.slice();
        if (!liste.length) return;
        aktualisiertGerade = true;
        const zeile = function (text) {
            const f = el('abxFortschritt');
            if (f) { f.textContent = text; f.classList.toggle('d-none', !text); }
        };
        const knopf = el('abxAktualisierenBtn');
        if (knopf) knopf.disabled = true;
        try {
            await rotationenDatenLaden(zeile);
            const weg = [];
            let neuSumme = 0;
            for (let i = 0; i < liste.length; i++) {
                if (liste.length > 1) zeile(tx('abx.ladeBox', { n: i + 1, g: liste.length, name: nameVon(liste[i]) }, 'Gleiche ab: {name} ({n} von {g}) …'));
                const erg = await abgleichSpeichern(liste[i]);
                if (!erg) { weg.push(nameVon(liste[i])); continue; }
                neuSumme += erg.neu.length;
                if (id) letztesErgebnis = { id: liste[i].id, neu: erg.neu, nichtMehr: erg.nichtMehr, wieder: erg.wieder };
            }
            zeile('');
            if (weg.length) {
                toast(tx('abx.archetypWeg', { name: weg.join(', ') },
                    '„{name}“ kommt in den Turnierdaten nicht mehr vor — die Box bleibt unverändert.'), 'warning');
            }
            if (!id) {
                toast(tx('abx.alleAktualisiert', { n: liste.length - weg.length, neu: neuSumme },
                    '{n} Boxen abgeglichen, {neu} neue Karten.'), 'success');
            }
            zeichnen();
        } catch (e) {
            console.warn('[ArchetypBox] Aktualisieren gescheitert:', e);
            zeile('');
            toast(tx('abx.aktualisierenFehler', null, 'Aktualisieren gescheitert — bitte später erneut versuchen.'), 'error');
        } finally {
            aktualisiertGerade = false;
            const k = el('abxAktualisierenBtn');
            if (k) k.disabled = false;
        }
    }

    let manifestDaten = null;   // tournament_cards_manifest.json
    let formatFenster = null;   // data/format_window.json

    async function jsonHolen(datei) {
        try {
            const basis = (typeof BASE_PATH !== 'undefined') ? BASE_PATH : './data/';
            const r = await fetch(basis + datei + '?t=' + Date.now());
            if (!r.ok) return null;
            return await r.json();
        } catch (_) { return null; }
    }

    async function formatDatenHolen() {
        const erg = await Promise.all([jsonHolen('tournament_cards_manifest.json'),
            window._formatWindow && window._formatWindow.oldest_legal_set ? Promise.resolve(window._formatWindow) : jsonHolen('format_window.json')]);
        manifestDaten = erg[0];
        formatFenster = erg[1];
        manifestDatum = neuestesDatumImManifest(manifestDaten);
    }

    /** Kontext fuer formatPasst: welche Formate "aktuell"/"vorher" sind und was legal ist. */
    function formatKontext() {
        const reihe = formateNachDatum(manifestDaten);
        const fw = formatFenster || {};
        const legalSets = function (von) {
            if (!von || !fw.current_set || typeof getFormatLegalSetCodes !== 'function') return null;
            try { return getFormatLegalSetCodes(von + '-' + fw.current_set); } catch (_) { return null; }
        };
        const jetzt = legalSets(fw.oldest_legal_set);
        const vorBlock = blockVorRotation(manifestDaten && manifestDaten.meta_keys, fw.oldest_legal_set, window.setOrderMap);
        const vorher = legalSets(vorBlock);
        const ids = function (k) {
            return [k.id].concat(k.refs || [], (k.drucke || []).map(function (d) { return d.id; }));
        };
        const basisEnergie = function (k) {
            if (k.typ !== 'Energy' || typeof getCanonicalCardRecord !== 'function') return false;
            const rec = getCanonicalCardRecord(k.set, k.number);
            return !!(rec && /^basic energy$/i.test(String(rec.type || '')));
        };
        return {
            aktuell: reihe[0] ? reihe[0].key : null,
            aktuellBis: reihe[0] ? reihe[0].bis : null,
            vorher: reihe[1] ? reihe[1].key : null,
            vorherBis: reihe[1] ? reihe[1].bis : null,
            standard: fw.oldest_legal_set && fw.current_set ? fw.oldest_legal_set + '-' + fw.current_set : null,
            vorBlock: vorBlock || null,
            fensterSet: fw.current_set || null,
            legalBekannt: !!jetzt,
            legal: function (k) { return basisEnergie(k) ? true : druckIn(ids(k), jetzt); },
            legalVorRotation: function (k) { return basisEnergie(k) ? true : druckIn(ids(k), vorher); }
        };
    }

    // ════════════════════════════════════════════════════════
    // Profil: die Boxen ansehen und pflegen
    // ════════════════════════════════════════════════════════

    async function profilOeffnen() {
        const wurzel = el('abxInhalt');
        if (!wurzel) return;
        if (!nutzer()) {
            wurzel.innerHTML = '<p class="abx-leer">' + esc(tx('abx.anmelden', null,
                'Bitte melde dich an — die Archetyp-Box liegt in deinem Konto.')) + '</p>';
            leisteZeichnen();
            return;
        }
        // Frisch aus dem Konto: wer die Box am Handy gepflegt hat, sieht es am Rechner.
        await laden(true);
        // Ohne ausdrueckliche Wahl: alle Boxen zusammen (Hausi, 28.09.2026) —
        // dann sucht man z. B. alle Pflanzen-Pokemon fuer alle Decks in einem Gang.
        if (aktiveId && !boxen.some(function (b) { return b.id === aktiveId; })) aktiveId = null;
        zeichnen();
        await formatDatenHolen();
        zeichnen();
    }

    // ── Filter (je Betrachter gemerkt) ──

    const ANSICHT_SCHLUESSEL = 'archetypBoxAnsichtV1';
    let ansicht = { gruppe: 'getrennt', format: 'alle', anteil: 'alle', art: 'alle', element: 'alle', sort: 'anteil' };
    try {
        const g = JSON.parse(localStorage.getItem(ANSICHT_SCHLUESSEL) || 'null');
        if (g && typeof g === 'object') ansicht = Object.assign(ansicht, g);
    } catch (_) { /* ohne Speicher */ }

    function ansichtSetzen(feld, wert) {
        ansicht[feld] = wert;
        if (feld === 'art' && wert !== 'Pokemon') ansicht.element = 'alle';
        try { localStorage.setItem(ANSICHT_SCHLUESSEL, JSON.stringify(ansicht)); } catch (_) { /* egal */ }
        zeichnen();
    }

    /** Pokemon-Typ einer Karte: gespeichert, sonst aus der Kartendatenbank (Set, Nummer). */
    function elementVon(k) {
        if (k.element) return k.element;
        if (k.typ !== 'Pokemon') return '';
        const rec = (typeof getCanonicalCardRecord === 'function') ? getCanonicalCardRecord(k.set, k.number) : null;
        if (!rec) return '';
        if (rec.energy_type) return String(rec.energy_type);
        if (typeof getCardElementType === 'function') { try { return getCardElementType(rec) || ''; } catch (_) { return ''; } }
        return '';
    }

    function leisteZeichnen() {
        const leiste = el('abxLeiste');
        if (!leiste) return;
        if (!boxen.length) { leiste.innerHTML = ''; return; }
        const alle = boxen.reduce(function (a, b) {
            const u = umfang(b);
            return { karten: a.karten + u.karten, stueck: a.stueck + u.stueck, fehlen: a.fehlen + u.fehlen, offen: a.offen + u.offen };
        }, { karten: 0, stueck: 0, fehlen: 0, offen: 0 });
        const chip = function (id, name, u) {
            const aktiv = boxen.length === 1 || (id || null) === (aktiveId || null);
            return '<button type="button" class="abx-chip' + (aktiv ? ' is-active' : '') + '" aria-pressed="'
                + (aktiv ? 'true' : 'false') + '" onclick="ArchetypBox.waehlen(' + (id ? '\'' + esc(id) + '\'' : 'null') + ')">'
                + '<span class="abx-chip-name">' + esc(name) + '</span>'
                + '<span class="abx-chip-zahl">' + esc(tx('abx.chipUmfang', { karten: u.karten, stueck: u.stueck }, '{karten} Karten · {stueck} Stück')) + '</span>'
                + '<span class="abx-chip-zahl">' + esc(tx('abx.chipFehlen', { n: u.fehlen, offen: u.offen }, '{n} fehlen · {offen} Stück offen')) + '</span></button>';
        };
        leiste.innerHTML = (boxen.length > 1 ? chip(null, tx('abx.alleBoxen', null, 'Alle Boxen'), alle) : '')
            + boxen.map(function (b) { return chip(b.id, nameVon(b), umfang(b)); }).join('');
    }

    function kachel(eintrag, mitBoxName) {
        const b = eintrag.box;
        const k = eintrag.k;
        const status = STATUS.indexOf(k.status) >= 0 ? k.status : 'fehlt';
        const arg = '\'' + esc(b.id) + '\',\'' + esc(k.id) + '\'';
        const menge = drin(k);
        const soll = k.gefordert;
        const marken = [];
        if (k.neu) marken.push('<span class="abx-marke abx-marke-neu">' + esc(tx('abx.markeNeu', null, 'Neu')) + '</span>');
        if (k.manuell) marken.push('<span class="abx-marke">' + esc(tx('abx.markeManuell', null, 'von Hand')) + '</span>');
        if (k.inDaten === false) marken.push('<span class="abx-marke abx-marke-alt" title="'
            + esc(tx('abx.markeNichtMehrTitel', null, 'Kommt in den aktuellen Turnierlisten nicht mehr vor.')) + '">'
            + esc(tx('abx.markeNichtMehr', null, 'nicht mehr gespielt')) + '</span>');
        const knoepfe = STATUS.map(function (s) {
            const text = tx('abx.status.' + s, null, s === 'fehlt' ? 'Fehlt' : (s === 'original' ? 'Original' : 'Proxy'));
            return '<button type="button" class="abx-seg abx-seg-' + s + (s === status ? ' is-active' : '')
                + '" aria-pressed="' + (s === status ? 'true' : 'false') + '" onclick="ArchetypBox.status('
                + arg + ',\'' + s + '\')">' + esc(text) + '</button>';
        }).join('');
        const bild = k.bild
            ? '<img src="' + esc(k.bild) + '" alt="' + esc(k.name) + '" loading="lazy" referrerpolicy="no-referrer">'
            : '<div class="abx-kein-bild">' + esc(k.set + ' ' + k.number) + '</div>';
        const anteil = (k.anteil != null && k.inDaten !== false && !k.manuell)
            ? '<span class="abx-anteil">' + esc(prozent(k.anteil)) + '</span>' : '';
        const sollTitel = tx('abx.sollTitel', { n: soll }, 'Höchstens {n}× in einer Liste gespielt — tippen, um {n} in die Box zu legen');
        // data-klein: nimmt den Knopf aus der Tippflaechen-Regel in
        // css/tippziele.css (pointer: coarse → min-height 44 px), die ihn am
        // Handy zu einem hohen Oval zog (Hausi, Screenshot 28.09.2026 19:54).
        const sollKnopf = soll > 0
            ? '<button type="button" data-klein class="abx-soll' + (menge >= soll ? ' is-voll' : '') + '" onclick="ArchetypBox.auffuellen('
                + arg + ')" title="' + esc(sollTitel) + '" aria-label="' + esc(sollTitel) + '">' + esc(soll) + '</button>'
            : '';
        const drinKlasse = menge === 0 ? ' is-leer' : (soll > 0 && menge >= soll ? ' is-voll' : '');
        const drinPlakette = '<span class="abx-anzahl' + drinKlasse + '" title="'
            + esc(tx('abx.anzahlTitel', null, 'Kopien in der Box')) + '">' + esc(menge) + '</span>';
        const wunschId = k.name + '|' + k.set + '|' + k.number;
        const aufListe = !!(window.userWishlist && window.userWishlist.has(wunschId));
        const herz = '<button type="button" data-klein class="wishlist-heart-badge abx-herz' + (aufListe ? ' wishlisted' : '')
            + '" data-card-id="' + esc(wunschId) + '" onclick="event.stopPropagation(); ArchetypBox.wunsch(this,' + arg + ')" title="'
            + esc(aufListe ? tx('wishBadge.remove', null, 'Von der Wunschliste nehmen') : tx('abx.wunschTitel', null, 'Fehlende auf die Wunschliste'))
            + '">' + (aufListe ? '&#9829;' : '&#9825;') + '</button>';
        const weitere = k.drucke.filter(function (d) { return d.id !== k.id; }).length;
        const druckZusatz = weitere
            ? ' <span class="abx-weitere">' + esc(tx('abx.weitereDrucke', { n: weitere }, '+{n} Druck')) + '</span>' : '';
        const boxZeile = mitBoxName ? '<div class="abx-boxname" title="' + esc(nameVon(b)) + '">' + esc(nameVon(b)) + '</div>' : '';
        return '<div class="abx-karte abx-karte-' + status + '" data-karte="' + esc(k.id) + '" data-box="' + esc(b.id) + '">'
            + '<div class="abx-bild">' + bild + sollKnopf + herz + drinPlakette
            + (marken.length ? '<div class="abx-marken">' + marken.join('') + '</div>' : '') + '</div>'
            + '<div class="abx-text">' + boxZeile + '<div class="abx-name" title="' + esc(k.name) + '">' + esc(k.name) + '</div>'
            + '<div class="abx-druck"><span>' + esc(k.set + ' ' + k.number) + druckZusatz + '</span>' + anteil + '</div>'
            + (eintrag.formatZeile ? '<div class="abx-formatzeile">' + esc(eintrag.formatZeile) + '</div>' : '') + '</div>'
            + '<div class="abx-segmente" role="group" aria-label="' + esc(tx('abx.statusAria', null, 'Status in der Box')) + '">' + knoepfe + '</div>'
            + '<div class="abx-zeile2">'
            + '<button type="button" class="abx-mini" onclick="ArchetypBox.anzahl(' + arg + ',-1)" aria-label="'
            + esc(tx('abx.wenigerAria', null, 'Eine Kopie weniger')) + '">−</button>'
            + '<button type="button" class="abx-mini" onclick="ArchetypBox.anzahl(' + arg + ',1)" aria-label="'
            + esc(tx('abx.mehrAria', null, 'Eine Kopie mehr')) + '">+</button>'
            + '<button type="button" class="abx-mini abx-drucke-btn" onclick="ArchetypBox.druckeOeffnen(' + arg + ')" title="'
            + esc(tx('abx.druckeTitel', null, 'Drucke: welcher Druck wie oft in der Box liegt')) + '" aria-label="'
            + esc(tx('abx.druckeTitel', null, 'Drucke: welcher Druck wie oft in der Box liegt')) + '">★</button>'
            + '<button type="button" class="abx-mini abx-weg" onclick="ArchetypBox.entfernen(' + arg + ')" title="'
            + esc(tx('abx.entfernenTitel', null, 'Aus der Box entfernen')) + '" aria-label="'
            + esc(tx('abx.entfernenTitel', null, 'Aus der Box entfernen')) + '">✕</button>'
            + '</div></div>';
    }

    function rubrik(schluessel, titel, eintraege, mitBoxName) {
        return '<section class="abx-rubrik abx-rubrik-' + schluessel + '">'
            + '<div class="abx-rubrik-kopf"><h3>' + esc(titel) + ' <span class="abx-rubrik-zahl">' + eintraege.length + '</span></h3></div>'
            + (eintraege.length
                ? '<div class="abx-gitter">' + eintraege.map(function (e) { return kachel(e, mitBoxName); }).join('') + '</div>'
                : '<p class="abx-leer">' + esc(tx('abx.rubrikLeer', null, 'Keine Karten.')) + '</p>')
            + '</section>';
    }

    /** Zusammen-Ansicht: eine Kachel je Karte ueber alle Boxen (Tipp oeffnet die Verteilung). */
    function gruppenKachel(g) {
        const k = g.k;
        const arg = '\'' + esc(g.id) + '\'';
        const titel = tx('abx.verteilungTitel', null, 'Verteilung auf die Boxen');
        const bild = k.bild
            ? '<img src="' + esc(k.bild) + '" alt="' + esc(k.name) + '" loading="lazy" referrerpolicy="no-referrer">'
            : '<div class="abx-kein-bild">' + esc(k.set + ' ' + k.number) + '</div>';
        const sollTitel = tx('abx.sollZusammenTitel', { n: g.soll }, 'Zusammen in allen Boxen: {n}');
        const soll = g.soll > 0 ? '<span class="abx-soll abx-soll-zusammen" title="' + esc(sollTitel) + '">' + esc(g.soll) + '</span>' : '';
        const drinKlasse = g.drin === 0 ? ' is-leer' : (g.offen === 0 ? ' is-voll' : '');
        const n = g.teile.length;
        return '<div class="abx-karte abx-karte-zusammen' + (g.offen === 0 ? ' abx-karte-original' : '') + '" data-karte="' + esc(g.id) + '">'
            + '<button type="button" class="abx-bild abx-bild-knopf" onclick="ArchetypBox.verteilung(' + arg + ')" title="' + esc(titel)
            + '" aria-label="' + esc(titel + ': ' + k.name) + '">' + bild + soll
            + '<span class="abx-anzahl' + drinKlasse + '">' + esc(g.drin) + '</span></button>'
            + '<div class="abx-text"><div class="abx-boxname">' + esc(n === 1 ? tx('abx.inEinerBox', null, 'in 1 Box')
                : tx('abx.inBoxen', { n: n }, 'in {n} Boxen')) + '</div>'
            + '<div class="abx-name" title="' + esc(k.name) + '">' + esc(k.name) + '</div>'
            + '<div class="abx-druck"><span>' + esc(k.set + ' ' + k.number) + '</span></div>'
            + '<div class="abx-offen-zeile">' + esc(tx('abx.drinOffen', { drin: g.drin, offen: g.offen }, '{drin} drin · {offen} offen')) + '</div></div>'
            + '<button type="button" class="abx-mini abx-vert-btn" onclick="ArchetypBox.verteilung(' + arg + ')">' + esc(titel) + '</button>'
            + '</div>';
    }

    function gruppenRubrik(schluessel, titel, gruppen) {
        return '<section class="abx-rubrik abx-rubrik-' + schluessel + '">'
            + '<div class="abx-rubrik-kopf"><h3>' + esc(titel) + ' <span class="abx-rubrik-zahl">' + gruppen.length + '</span></h3></div>'
            + (gruppen.length ? '<div class="abx-gitter">' + gruppen.map(gruppenKachel).join('') + '</div>'
                : '<p class="abx-leer">' + esc(tx('abx.rubrikLeer', null, 'Keine Karten.')) + '</p>')
            + '</section>';
    }

    /** Frueher entfernte Karten, die das Aktualisieren wieder anbietet. */
    function wiederBereich(gewaehlt, mitBoxName) {
        const liste = [];
        gewaehlt.forEach(function (b) { (b.wieder || []).forEach(function (w) { liste.push({ box: b, w: w }); }); });
        if (!liste.length) return '';
        const kacheln = liste.map(function (e) {
            const arg = '\'' + esc(e.box.id) + '\',\'' + esc(e.w.id) + '\'';
            const bild = e.w.bild
                ? '<img src="' + esc(e.w.bild) + '" alt="' + esc(e.w.name) + '" loading="lazy" referrerpolicy="no-referrer">'
                : '<div class="abx-kein-bild">' + esc(e.w.set + ' ' + e.w.number) + '</div>';
            const zeile = e.w.anteilVorher != null
                ? tx('abx.wiederAnteil', { jetzt: prozent(e.w.anteil), vorher: prozent(e.w.anteilVorher) }, 'jetzt {jetzt} · beim Entfernen {vorher}')
                : tx('abx.wiederAnteilOhne', { jetzt: prozent(e.w.anteil) }, 'jetzt {jetzt}');
            return '<div class="abx-karte abx-wieder-karte" data-karte="' + esc(e.w.id) + '" data-box="' + esc(e.box.id) + '">'
                + '<div class="abx-bild">' + bild + '</div>'
                + '<div class="abx-text">' + (mitBoxName ? '<div class="abx-boxname">' + esc(nameVon(e.box)) + '</div>' : '')
                + '<div class="abx-name" title="' + esc(e.w.name) + '">' + esc(e.w.name) + '</div>'
                + '<div class="abx-druck"><span>' + esc(e.w.set + ' ' + e.w.number) + '</span></div>'
                + '<div class="abx-wieder-zeile">' + esc(zeile) + '</div></div>'
                + '<div class="abx-wieder-knoepfe">'
                + '<button type="button" class="abx-seg abx-seg-original" onclick="ArchetypBox.wieder(' + arg + ',true)">'
                + esc(tx('abx.wiederJa', null, 'Aufnehmen')) + '</button>'
                + '<button type="button" class="abx-seg" onclick="ArchetypBox.wieder(' + arg + ',false)">'
                + esc(tx('abx.wiederNein', null, 'Draußen lassen')) + '</button></div></div>';
        }).join('');
        return '<section class="abx-rubrik abx-rubrik-wieder">'
            + '<div class="abx-rubrik-kopf"><h3>' + esc(tx('abx.wiederTitel', null, 'Schon mal entfernt — wieder öfter gespielt'))
            + ' <span class="abx-rubrik-zahl">' + liste.length + '</span></h3>'
            + '<div class="abx-wieder-alle">'
            + '<button type="button" class="btn btn-primary" onclick="ArchetypBox.wiederAlle(true)">'
            + esc(tx('abx.wiederAlleJa', null, 'Alle aufnehmen')) + '</button>'
            + '<button type="button" class="btn btn-outline" onclick="ArchetypBox.wiederAlle(false)">'
            + esc(tx('abx.wiederAlleNein', null, 'Alle draußen lassen')) + '</button></div></div>'
            + '<p class="abx-leer">' + esc(tx('abx.wiederText', null,
                'Diese Karten hast du aus der Box genommen. Seit dem letzten Aktualisieren werden sie öfter gespielt — willst du sie wieder aufnehmen?'))
            + '</p><div class="abx-gitter">' + kacheln + '</div></section>';
    }

    /** Kleine Zeile auf der Kachel: Anteil im aktuellen (und vorigen) Format. */
    function formatZeileVon(k, wahl, c) {
        if (!c.aktuell) return '';
        const jetzt = c.aktuell + ' ' + prozent(anteilIn(k, c.aktuell));
        if (wahl === 'aktuell' || !c.vorher) return jetzt;
        return c.vorher + ' ' + prozent(anteilIn(k, c.vorher)) + ' → ' + jetzt;
    }

    const FORMAT_WAHL = ['alle', 'aktuell', 'standard', 'expanded', 'raus', 'neu', 'rotiert'];

    /** Erklaerzeile zur Formatwahl — nennt die Formate und Daten, auf die sie sich stuetzt. */
    function formatHinweis(wahl, c) {
        const v = { aktuell: c.aktuell || '?', vorher: c.vorher || '?', bis: datumLesbar(c.aktuellBis), bisV: datumLesbar(c.vorherBis),
            n: META_SCHWELLE, standard: c.standard || '?', block: c.vorBlock || '?', fenster: c.fensterSet || '?' };
        const meta = wahl === 'aktuell' || wahl === 'raus' || wahl === 'neu';
        if (meta && !c.aktuell) return tx('abx.fmtKeineDaten', null, 'Keine Turnierdaten je Format geladen.');
        if (!meta && wahl !== 'alle' && !c.legalBekannt) return tx('abx.fmtLegalUnbekannt', null, 'Die Legalität ist noch nicht geladen — gleich noch einmal versuchen.');
        let satz = '';
        if (wahl === 'aktuell') satz = tx('abx.fmtAktuell', v, 'Gespielt in {aktuell}, dem neuesten Format mit Turnierdaten (bis {bis}).');
        else if (wahl === 'raus') satz = tx('abx.fmtRaus', v, 'In {vorher} (bis {bisV}) in mindestens {n} % der Listen, in {aktuell} (bis {bis}) darunter.');
        else if (wahl === 'neu') satz = tx('abx.fmtNeu', v, 'In {aktuell} (bis {bis}) in mindestens {n} % der Listen, in {vorher} (bis {bisV}) darunter.');
        else if (wahl === 'standard') satz = tx('abx.fmtStandard', v, 'Mindestens ein Druck ist in {standard} legal.');
        else if (wahl === 'expanded') satz = tx('abx.fmtExpanded', v, 'Kein Druck ist in {standard} legal — nur noch in Expanded spielbar.');
        else if (wahl === 'rotiert') satz = tx('abx.fmtRotiert', v, 'War vor der letzten Rotation legal (ab {block}), ist in {standard} nicht mehr legal.');
        if (meta && c.fensterSet && c.aktuell && String(c.aktuell).split('-')[1] !== String(c.fensterSet)) {
            satz += ' ' + tx('abx.fmtFensterOhne', v, 'Für {fenster} gibt es noch keine Turnierdaten.');
        }
        return satz;
    }

    function filterLeiste(kontext, ohneFormate, gewaehlt, mitBoxName) {
        const knopf = function (feld, wert, text) {
            const an = ansicht[feld] === wert;
            return '<button type="button" class="abx-filter' + (an ? ' is-active' : '') + '" aria-pressed="' + (an ? 'true' : 'false')
                + '" onclick="ArchetypBox.ansicht(\'' + feld + '\',\'' + esc(wert) + '\')">' + esc(text) + '</button>';
        };
        const reihe = function (label, inhalt) {
            return '<div class="abx-filter-reihe"><span class="abx-filter-label">' + esc(label) + '</span><div class="abx-filter-knoepfe">' + inhalt + '</div></div>';
        };
        const anteil = [['alle', tx('abx.fAlle', null, 'Alle')], ['90', tx('abx.fAb', { n: 90 }, 'ab {n} %')],
            ['70', tx('abx.fAb', { n: 70 }, 'ab {n} %')], ['50', tx('abx.fAb', { n: 50 }, 'ab {n} %')],
            ['u10', tx('abx.fUnter', { n: 10 }, 'unter {n} %')]];
        const arten = [['alle', tx('abx.fAlle', null, 'Alle')], ['Pokemon', tx('cl.typePokemon', null, 'Pokémon')],
            ['Supporter', tx('cl.typeSupporter', null, 'Supporter')], ['Item', tx('cl.typeItem', null, 'Item')],
            ['Tool', tx('cl.typeTool', null, 'Tool')], ['Stadium', tx('cl.typeStadium', null, 'Stadion')],
            ['Ace Spec', tx('cl.typeAceSpec', null, 'Ace Spec')], ['Energy', tx('cl.typeEnergy', null, 'Energie')]];
        const fmtText = {
            alle: tx('abx.fAlle', null, 'Alle'), aktuell: tx('abx.fmt.aktuell', null, 'Aktuelles Meta'),
            standard: tx('abx.fmt.standard', null, 'Standard-legal'), expanded: tx('abx.fmt.expanded', null, 'Nur Expanded'),
            raus: tx('abx.fmt.raus', null, 'Aus dem Meta gefallen'), neu: tx('abx.fmt.neu', null, 'Neu im Meta'),
            rotiert: tx('abx.fmt.rotiert', null, 'Bei der Rotation raus')
        };
        const c = kontext || {};
        let fmtZeile = ansicht.format && ansicht.format !== 'alle' ? formatHinweis(ansicht.format, c) : '';
        if (ansicht.format === 'raus' && c.aktuell) {
            const ohne = (gewaehlt || []).filter(function (b) { return !imFormatGespielt(b, c.aktuell); });
            if (ohne.length) fmtZeile += ' ' + tx('abx.fmtRausOhne', { aktuell: c.aktuell, liste: ohne.map(nameVon).join(', ') },
                'Ohne Deck in {aktuell} fällt nichts heraus: {liste}.');
        }
        if (ohneFormate && (ansicht.format === 'aktuell' || ansicht.format === 'raus' || ansicht.format === 'neu')) {
            fmtZeile += ' ' + tx('abx.fmtAlteBox', null, 'Mindestens eine Box kennt die Anteile je Format noch nicht — bitte einmal aktualisieren („Alle Boxen“ → „Alle Boxen aktualisieren“).');
        }
        let html = (mitBoxName ? reihe(tx('abx.fAnsicht', null, 'Ansicht'),
            knopf('gruppe', 'getrennt', tx('abx.gruppeGetrennt', null, 'Getrennt')) + knopf('gruppe', 'zusammen', tx('abx.gruppeZusammen', null, 'Zusammen'))) : '')
            + reihe(tx('abx.fFormat', null, 'Format'), FORMAT_WAHL.map(function (w) { return knopf('format', w, fmtText[w]); }).join(''))
            + (fmtZeile ? '<p class="abx-filter-hinweis">' + esc(fmtZeile) + '</p>' : '')
            + reihe(tx('abx.fAnteil', null, 'Anteil'), anteil.map(function (a) { return knopf('anteil', a[0], a[1]); }).join(''))
            + reihe(tx('abx.fArt', null, 'Kartenart'), arten.map(function (a) { return knopf('art', a[0], a[1]); }).join(''));
        if (ansicht.art === 'Pokemon') {
            html += reihe(tx('abx.fTyp', null, 'Typ'), [knopf('element', 'alle', tx('abx.fAlle', null, 'Alle'))].concat(
                ELEMENTE.map(function (e) { return knopf('element', e, tx('abx.el.' + e, null, e)); })).join(''));
        }
        html += reihe(tx('abx.fSort', null, 'Sortierung'),
            knopf('sort', 'anteil', tx('abx.sortAnteil', null, 'Nach Anteil')) + knopf('sort', 'art', tx('abx.sortArt', null, 'Nach Kartenart und Typ')));
        return '<div class="abx-filterblock" role="group" aria-label="' + esc(tx('abx.fAria', null, 'Filter und Sortierung')) + '">' + html + '</div>';
    }

    function zeichnen() {
        leisteZeichnen();
        const wurzel = el('abxInhalt');
        if (!wurzel) return;
        if (!boxen.length) {
            wurzel.innerHTML = '<div class="abx-leer-block"><p>' + esc(tx('abx.keineBox', null,
                'Noch keine Archetyp-Box. Öffne Rotationen, wähle „Alle Formate“ und einen Archetyp und tippe in der Kartenübersicht auf „Zu Archetyp-Box hinzufügen“.'))
                + '</p><button type="button" class="btn btn-primary" onclick="switchTabAndUpdateMenu(\'past-meta\')">'
                + esc(tx('abx.zuRotationen', null, 'Zu Rotationen')) + '</button></div>';
            return;
        }
        // Eine Box gilt als gewaehlt, wenn es nur eine gibt oder eine angetippt wurde.
        const eine = aktiveId ? boxen.find(function (b) { return b.id === aktiveId; }) : (boxen.length === 1 ? boxen[0] : null);
        const gewaehlt = eine ? [eine] : boxen.slice();
        const mitBoxName = !eine;

        let eintraege = [];
        gewaehlt.forEach(function (b) {
            (b.karten || []).forEach(function (roh) {
                const k = normiert(roh);
                eintraege.push({ box: b, k: k, element: elementVon(k) });
            });
        });
        const gesamt = eintraege.length;
        const kontext = formatKontext();
        eintraege = eintraege.filter(function (e) {
            return filterPasst(e.k, ansicht, e.element) && formatPasst(e.k, ansicht.format, kontext, e.box);
        });
        if (ansicht.format === 'aktuell' || ansicht.format === 'raus' || ansicht.format === 'neu') {
            eintraege.forEach(function (e) { e.formatZeile = formatZeileVon(e.k, ansicht.format, kontext); });
        }
        const ohneFormate = gewaehlt.some(function (b) { return !b.mitFormaten; });
        eintraege = sortieren(eintraege, ansicht.sort, !!eine);
        const zusammen = mitBoxName && ansicht.gruppe === 'zusammen';
        const r = { fehlt: [], original: [], proxy: [] };
        eintraege.forEach(function (e) { r[STATUS.indexOf(e.k.status) >= 0 ? e.k.status : 'fehlt'].push(e); });
        const proxyKopien = r.proxy.reduce(function (a, e) { return a + drin(e.k); }, 0);

        let kopf;
        if (eine) {
            kopf = '<div class="abx-kopf"><h3 class="abx-titel">' + esc(nameVon(eine)) + '</h3>'
                + '<p class="abx-meta">' + esc(tx('abx.metaZeile', {
                    schwelle: schwelleText(eine.schwelle || 'all'),
                    daten: datumLesbar(eine.datenStand),
                    datum: datumLesbar(eine.aktualisiert)
                }, 'Alle Formate · {schwelle} · Turnierdaten bis {daten} · abgeglichen am {datum}')) + '</p></div>';
        } else {
            kopf = '<div class="abx-kopf"><h3 class="abx-titel">' + esc(tx('abx.alleBoxen', null, 'Alle Boxen')) + '</h3>'
                + '<p class="abx-meta">' + esc(tx('abx.alleMeta', { n: boxen.length, liste: boxen.map(nameVon).join(', ') },
                    '{n} Boxen zusammen: {liste}')) + '</p></div>';
        }
        const alt = gewaehlt.filter(function (b) { return neueDatenDa(b, manifestDatum); });
        const hinweis = alt.length
            ? '<p class="abx-neudaten">' + esc(eine
                ? tx('abx.neueDaten', { datum: datumLesbar(manifestDatum) },
                    'Es gibt Turnierdaten bis {datum}, die diese Box noch nicht kennt — „Archetyp-Box aktualisieren“ übernimmt neue Karten.')
                : tx('abx.neueDatenAlle', { datum: datumLesbar(manifestDatum), liste: alt.map(nameVon).join(', ') },
                    'Turnierdaten bis {datum} — noch nicht abgeglichen: {liste}. Box antippen und aktualisieren.')) + '</p>'
            : '';
        const erg = (eine && letztesErgebnis && letztesErgebnis.id === eine.id)
            ? '<p class="abx-ergebnis" role="status">' + esc(ergebnisSatz(letztesErgebnis)) + '</p>' : '';
        const druckId = eine ? '\'' + esc(eine.id) + '\'' : 'null';
        const aktionen = '<div class="abx-aktionen">'
            + (eine ? '<button type="button" id="abxAktualisierenBtn" class="btn btn-primary" onclick="ArchetypBox.aktualisieren(\''
                + esc(eine.id) + '\')">' + esc(tx('abx.knopfAktualisieren', null, 'Archetyp-Box aktualisieren')) + '</button>'
                : '<button type="button" id="abxAktualisierenBtn" class="btn btn-primary" onclick="ArchetypBox.aktualisieren(null)">'
                + esc(tx('abx.alleAktualisieren', { n: boxen.length }, 'Alle {n} Boxen aktualisieren')) + '</button>')
            + (r.proxy.length
                ? '<button type="button" class="btn btn-outline abx-druck-btn" onclick="ArchetypBox.proxysDrucken(' + druckId + ')">'
                    + esc(tx('abx.proxysDrucken', { n: proxyKopien }, 'Proxys drucken ({n})')) + '</button>'
                : '')
            + (eine ? '<button type="button" class="btn btn-outline" onclick="ArchetypBox.loeschen(\'' + esc(eine.id) + '\')">'
                + esc(tx('abx.loeschen', null, 'Box löschen')) + '</button>' : '')
            + '</div><p id="abxFortschritt" class="abx-fortschritt d-none" role="status" aria-live="polite"></p>';
        const suche = eine
            ? '<div class="abx-suche"><label for="abxSuche">' + esc(tx('abx.sucheLabel', null, 'Karte von Hand hinzufügen'))
                + '</label><input type="text" id="abxSuche" class="input-system" autocomplete="off" placeholder="'
                + esc(tx('abx.suchePlatzhalter', null, 'Name oder Set + Nummer, z. B. TWM 130'))
                + '" oninput="ArchetypBox.suchen(this.value)"><div id="abxTreffer" class="abx-treffer"></div></div>'
            : '';
        const summe = '<p class="abx-summe">' + esc(tx('abx.summe', {
            fehlt: r.fehlt.length, original: r.original.length, proxy: r.proxy.length
        }, '{fehlt} fehlen · {original} als Original drin · {proxy} als Proxy drin'))
            + (eintraege.length < gesamt ? ' <span class="abx-gefiltert">' + esc(tx('abx.gefiltert', { n: eintraege.length, g: gesamt },
                '({n} von {g} nach Filter)')) + '</span>' : '') + '</p>';
        let hauptteil;
        if (zusammen) {
            const gruppen = zusammenfassen(eintraege);
            const raus = gruppen.filter(function (g) { return g.offen > 0; });
            const fertig = gruppen.filter(function (g) { return g.offen === 0; });
            const offen = raus.reduce(function (a, g) { return a + g.offen; }, 0);
            hauptteil = '<p class="abx-summe">' + esc(tx('abx.summeZusammen', { n: gruppen.length, offen: offen },
                    '{n} Karten · {offen} Stück noch raussuchen'))
                + (eintraege.length < gesamt ? ' <span class="abx-gefiltert">' + esc(tx('abx.gefiltert', { n: eintraege.length, g: gesamt },
                    '({n} von {g} nach Filter)')) + '</span>' : '') + '</p>'
                + gruppenRubrik('raus', tx('abx.rubrikRaus', null, 'Noch raussuchen'), raus)
                + gruppenRubrik('fertig', tx('abx.rubrikFertig', null, 'Überall drin'), fertig);
        } else {
            hauptteil = summe
                + rubrik('fehlt', tx('abx.rubrikFehlt', null, 'Noch nicht in der Box'), r.fehlt, mitBoxName)
                + rubrik('original', tx('abx.rubrikOriginal', null, 'Schon drin (Original)'), r.original, mitBoxName)
                + rubrik('proxy', tx('abx.rubrikProxy', null, 'Als Proxy drin'), r.proxy, mitBoxName);
        }
        wurzel.innerHTML = kopf + hinweis + aktionen + erg + suche + wiederBereich(gewaehlt, mitBoxName)
            + filterLeiste(kontext, ohneFormate, gewaehlt, mitBoxName) + hauptteil;
    }

    function boxVon(boxId) { return boxen.find(function (b) { return b.id === boxId; }) || null; }

    function aendern(boxId, fn) {
        const box = boxVon(boxId);
        if (!box) return;
        const neu = fn(box);
        neu.id = box.id;
        schreiben(neu);
        zeichnen();
    }

    function status(boxId, id, s) { aendern(boxId, function (b) { return statusSetzen(b, id, s); }); }

    function anzahl(boxId, id, delta) {
        aendern(boxId, function (b) {
            const k = (b.karten || []).find(function (x) { return x.id === id; });
            if (!k) return b;
            return drinSetzen(b, id, drin(k) + delta);
        });
    }

    function fuellen(boxId, id) { aendern(boxId, function (b) { return auffuellen(b, id); }); }

    function wieder(boxId, id, ja) {
        aendern(boxId, function (b) { return ja ? wiederAufnehmen(b, id, heuteIso()) : draussenLassen(b, id); });
    }

    function wiederAlle(ja) {
        const eine = aktiveId ? boxVon(aktiveId) : (boxen.length === 1 ? boxen[0] : null);
        (eine ? [eine] : boxen.slice()).forEach(function (b) {
            if (!(b.wieder || []).length) return;
            let neu = b;
            (b.wieder || []).slice().forEach(function (w) {
                neu = ja ? wiederAufnehmen(neu, w.id, heuteIso()) : draussenLassen(neu, w.id);
            });
            neu.id = b.id;
            schreiben(neu);
        });
        zeichnen();
    }

    async function wunsch(knopf, boxId, id) {
        const wunschId = knopf && knopf.getAttribute('data-card-id');
        if (!wunschId) return;
        const box = boxVon(boxId);
        const k = box && (box.karten || []).find(function (x) { return x.id === id; });
        const drauf = window.userWishlist && window.userWishlist.has(wunschId);
        try {
            if (drauf) {
                if (typeof removeFromWishlist === 'function') await removeFromWishlist(wunschId);
            } else if (typeof addToWishlistWithCount === 'function') {
                const soll = k ? gefordertVon(k) : null;
                const fehlt = soll > 0 ? soll - drin(k) : 1;
                await addToWishlistWithCount(wunschId, Math.max(1, fehlt));
            }
        } catch (e) { console.warn('[ArchetypBox] Wunschliste:', e && e.message); }
        const jetzt = !!(window.userWishlist && window.userWishlist.has(wunschId));
        document.querySelectorAll('.wishlist-heart-badge[data-card-id="' + CSS.escape(wunschId) + '"]').forEach(function (b) {
            b.classList.toggle('wishlisted', jetzt);
            b.innerHTML = jetzt ? '&#9829;' : '&#9825;';
        });
    }

    // ── Drucke: welcher Druck wie oft in der Box liegt ──

    function druckeDerKarte(k) {
        const liste = [];
        const gesehen = new Set();
        const dazu = function (set, number, extra) {
            const id = kartenId(set, number);
            if (!id || gesehen.has(id)) return;
            gesehen.add(id);
            liste.push(Object.assign({ id: id, set: String(set).toUpperCase(), number: String(number) }, extra || {}));
        };
        let prints = [];
        if (typeof getInternationalPrintsForCard === 'function') {
            try { prints = getInternationalPrintsForCard(k.set, k.number) || []; } catch (_) { prints = []; }
        }
        dazu(k.set, k.number, { bild: k.bild, rarity: '' });
        prints.forEach(function (p) {
            let bild = p.image_url || '';
            if (typeof getBestCardImage === 'function') {
                try { bild = getBestCardImage(Object.assign({}, p, { set_code: p.set, set_number: p.number, card_name: k.name })) || bild; }
                catch (_) { /* Datenbankbild */ }
            }
            if (kartenId(p.set, p.number) === k.id) {
                const erst = liste[0]; erst.rarity = p.rarity || ''; if (!erst.bild) erst.bild = bild;
                return;
            }
            dazu(p.set, p.number, { bild: bild, rarity: p.rarity || '' });
        });
        // Drucke, die schon in der Box liegen, aber die Datenbank nicht (mehr) kennt.
        k.drucke.forEach(function (d) { dazu(d.set, d.number, { bild: '', rarity: '' }); });
        const n = {};
        k.drucke.forEach(function (d) { n[d.id] = d.n; });
        liste.forEach(function (d) { d.n = n[d.id] || 0; });
        return liste;
    }

    let dialogZustand = null;   // {id, liste}

    function dialogZeichnen() {
        const d = el('abxDruckDialog');
        if (!d || !dialogZustand) return;
        const box = boxVon(dialogZustand.boxId);
        const k = box && normiert((box.karten || []).find(function (x) { return x.id === dialogZustand.id; }) || null);
        if (!k) return;
        const summe = dialogZustand.liste.reduce(function (a, x) { return a + x.n; }, 0);
        d.querySelector('.abx-dialog-inhalt').innerHTML =
            '<h3 id="abxDruckTitel">' + esc(k.name) + '</h3>'
            + '<p class="abx-dialog-zeile">' + esc(k.gefordert > 0
                ? tx('abx.druckeSumme', { n: summe, soll: k.gefordert }, 'In der Box: {n} · höchstens gespielt: {soll}')
                : tx('abx.druckeSummeOhne', { n: summe }, 'In der Box: {n}')) + '</p>'
            + '<div class="abx-dialog-liste">' + dialogZustand.liste.map(function (x, i) {
                return '<div class="abx-dialog-druck' + (x.n > 0 ? ' is-drin' : '') + '">'
                    + (x.bild ? '<img src="' + esc(x.bild) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<div class="abx-dialog-ohne"></div>')
                    + '<div class="abx-dialog-text"><strong>' + esc(x.set + ' ' + x.number) + '</strong>'
                    + (x.rarity ? '<span>' + esc(x.rarity) + '</span>' : '') + '</div>'
                    + '<div class="abx-dialog-zahl">'
                    + '<button type="button" class="abx-mini" onclick="ArchetypBox._druck(' + i + ',-1)" aria-label="'
                    + esc(tx('abx.wenigerAria', null, 'Eine Kopie weniger')) + '">−</button>'
                    + '<span aria-live="polite">' + x.n + '</span>'
                    + '<button type="button" class="abx-mini" onclick="ArchetypBox._druck(' + i + ',1)" aria-label="'
                    + esc(tx('abx.mehrAria', null, 'Eine Kopie mehr')) + '">+</button></div></div>';
            }).join('') + '</div>'
            + '<div class="abx-dialog-fuss">'
            + '<button type="button" class="btn btn-outline" onclick="ArchetypBox.druckeSchliessen(false)">'
            + esc(tx('abx.abbrechen', null, 'Abbrechen')) + '</button>'
            + '<button type="button" class="btn btn-primary" onclick="ArchetypBox.druckeSchliessen(true)">'
            + esc(tx('abx.uebernehmen', null, 'Übernehmen')) + '</button></div>';
    }

    // ── Verteilung (Zusammen-Ansicht): wie oft gehoert die Karte in welche Box ──

    let verteilungId = null;
    let sammlungListe = [];

    function besitzIn(schluessel) {
        return (window.userCollectionCounts && window.userCollectionCounts.get(schluessel)) || 0;
    }

    /** Alle Boxen, nicht gefiltert: die Liste zeigt jede Box, in die die Karte gehoert. */
    function gruppeVon(id) {
        const alle = [];
        boxen.forEach(function (b) { (b.karten || []).forEach(function (roh) { alle.push({ box: b, k: roh }); }); });
        return zusammenfassen(alle).find(function (g) { return g.id === id; }) || null;
    }

    function verteilungZeichnen() {
        const d = el('abxVertDialog');
        if (!d || !verteilungId) return;
        const g = gruppeVon(verteilungId);
        if (!g) { verteilungSchliessen(); return; }
        const zeilen = g.teile.map(function (t) {
            const arg = '\'' + esc(t.box.id) + '\',\'' + esc(t.k.id) + '\'';
            const knopf = t.offen > 0
                ? '<button type="button" class="btn btn-primary abx-rein-btn" onclick="ArchetypBox.reinlegen(' + arg + ')">'
                    + esc(tx('abx.reingelegt', null, 'Reingelegt')) + '</button>'
                : '<span class="abx-rein-ok">' + esc(tx('abx.istDrin', null, 'drin ✓')) + '</span>';
            return '<tr' + (t.offen === 0 ? ' class="is-drin"' : '') + '><td>' + esc(nameVon(t.box)) + '</td>'
                + '<td class="r">' + esc(t.k.anteil != null && !t.k.manuell ? prozent(t.k.anteil) : '–') + '</td>'
                + '<td class="r"><b>' + esc(t.soll > 0 ? t.soll + '×' : '–') + '</b></td>'
                + '<td class="r">' + esc(t.drin) + '</td><td class="r">' + knopf + '</td></tr>';
        }).join('');
        d.querySelector('.abx-dialog-inhalt').innerHTML =
            '<h3 id="abxVertTitel">' + esc(g.k.name) + ' <span class="abx-vert-druck">' + esc(g.k.set + ' ' + g.k.number) + '</span></h3>'
            + '<p class="abx-dialog-zeile">' + esc(tx('abx.verteilungZeile', { n: g.teile.length, soll: g.soll, drin: g.drin, offen: g.offen },
                'Gehört in {n} Boxen, zusammen {soll} Stück · {drin} drin · {offen} offen')) + '</p>'
            + '<div class="abx-vert-rahmen"><table class="abx-vert-tabelle"><thead><tr>'
            + '<th>' + esc(tx('abx.spBox', null, 'Box')) + '</th><th class="r">' + esc(tx('abx.spAnteil', null, 'Anteil')) + '</th>'
            + '<th class="r">' + esc(tx('abx.spSoll', null, 'Soll')) + '</th><th class="r">' + esc(tx('abx.spDrin', null, 'Drin')) + '</th><th></th></tr></thead>'
            + '<tbody>' + zeilen + '</tbody><tfoot><tr><td>' + esc(tx('abx.zusammen', null, 'Zusammen')) + '</td><td></td>'
            + '<td class="r"><b>' + esc(g.soll + '×') + '</b></td><td class="r">' + esc(g.drin) + '</td><td></td></tr></tfoot></table></div>'
            + sammlungZeilen(g)
            + '<div class="abx-dialog-fuss">'
            + '<button type="button" class="btn btn-outline" onclick="ArchetypBox.verteilungSchliessen()">'
            + esc(tx('abx.schliessen', null, 'Schließen')) + '</button>'
            + (g.offen > 0 ? '<button type="button" class="btn btn-primary" onclick="ArchetypBox.alleReinlegen()">'
                + esc(tx('abx.alleReingelegt', { n: g.offen }, 'Alle reingelegt ({n})')) + '</button>' : '')
            + '</div>';
    }

    function sammlungZeilen(g) {
        sammlungListe = sammlungsBedarf(g.teile, besitzIn);
        if (!sammlungListe.length) return '';
        return '<div class="abx-sammlung">' + sammlungListe.map(function (x, i) {
            return '<div class="abx-sammlung-zeile"><span>' + esc(tx('abx.sammlungZeile',
                { druck: x.set + ' ' + x.number, besitz: x.besitz, boxen: x.inBoxen },
                'Sammlung {druck}: {besitz} · als Original in den Boxen: {boxen}')) + '</span>'
                + '<button type="button" class="btn btn-outline abx-sammlung-btn" onclick="ArchetypBox.sammlungSetzen(' + i + ')">'
                + esc(tx('abx.sammlungSetzen', { n: x.ziel }, 'Sammlung auf {n} setzen')) + '</button></div>';
        }).join('') + '</div>';
    }

    /** Hebt die Sammlung ueber den bestehenden Weg (addToCollection) auf das Ziel an — nie darueber, nie nach unten. */
    function sammlungSetzen(i) {
        const x = sammlungListe[i];
        if (!x || typeof addToCollection !== 'function') return;
        let jetzt = besitzIn(x.schluessel);
        let schritte = 0;
        while (jetzt < x.ziel && schritte < 4) {
            addToCollection(x.schluessel);
            const neu = besitzIn(x.schluessel);
            if (neu <= jetzt) break;   // nicht angemeldet oder abgelehnt
            jetzt = neu; schritte++;
        }
        verteilungZeichnen();
    }

    function verteilungOeffnen(id) {
        verteilungId = id;
        let d = el('abxVertDialog');
        if (!d) {
            d = document.createElement('div');
            d.id = 'abxVertDialog';
            d.className = 'abx-dialog';
            d.setAttribute('role', 'dialog');
            d.setAttribute('aria-modal', 'true');
            d.setAttribute('aria-labelledby', 'abxVertTitel');
            d.innerHTML = '<div class="abx-dialog-inhalt"></div>';
            d.addEventListener('click', function (e) { if (e.target === d) verteilungSchliessen(); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && verteilungId) verteilungSchliessen();
            });
            document.body.appendChild(d);
        }
        d.classList.remove('d-none');
        verteilungZeichnen();
    }

    function verteilungSchliessen() {
        verteilungId = null;
        const d = el('abxVertDialog');
        if (d) d.classList.add('d-none');
    }

    function reinlegenKarte(boxId, id) {
        aendern(boxId, function (b) { return reinlegen(b, id); });
        verteilungZeichnen();
    }

    function alleReinlegen() {
        const g = verteilungId && gruppeVon(verteilungId);
        if (!g) return;
        g.teile.forEach(function (t) {
            if (t.offen <= 0) return;
            const box = boxVon(t.box.id);
            if (!box) return;
            const neu = reinlegen(box, t.k.id);
            neu.id = box.id;
            schreiben(neu);
        });
        zeichnen();
        verteilungZeichnen();
    }

    function druckeOeffnen(boxId, id) {
        const box = boxVon(boxId);
        const roh = box && (box.karten || []).find(function (x) { return x.id === id; });
        if (!roh) return;
        dialogZustand = { boxId: boxId, id: id, liste: druckeDerKarte(normiert(roh)) };
        let d = el('abxDruckDialog');
        if (!d) {
            d = document.createElement('div');
            d.id = 'abxDruckDialog';
            d.className = 'abx-dialog';
            d.setAttribute('role', 'dialog');
            d.setAttribute('aria-modal', 'true');
            d.setAttribute('aria-labelledby', 'abxDruckTitel');
            d.innerHTML = '<div class="abx-dialog-inhalt"></div>';
            d.addEventListener('click', function (e) { if (e.target === d) druckeSchliessen(false); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && dialogZustand) druckeSchliessen(false);
            });
            document.body.appendChild(d);
        }
        d.classList.remove('d-none');
        dialogZeichnen();
    }

    function druckAendern(i, delta) {
        if (!dialogZustand || !dialogZustand.liste[i]) return;
        const x = dialogZustand.liste[i];
        x.n = Math.max(0, Math.min(MAX_ANZAHL, x.n + delta));
        dialogZeichnen();
    }

    function druckeSchliessen(uebernehmen) {
        const d = el('abxDruckDialog');
        if (uebernehmen && dialogZustand) {
            const z = dialogZustand;
            aendern(z.boxId, function (b) { return druckeSetzen(b, z.id, z.liste); });
        }
        dialogZustand = null;
        if (d) d.classList.add('d-none');
    }

    function entfernenKarte(boxId, id) {
        const box = boxVon(boxId);
        const k = box && (box.karten || []).find(function (x) { return x.id === id; });
        if (!k) return;
        const frage = tx('abx.entfernenFrage', { name: k.name }, '„{name}“ aus der Box entfernen?');
        if (typeof window.confirm === 'function' && !window.confirm(frage)) return;
        aendern(boxId, function (b) { return entfernen(b, id, heuteIso()); });
    }

    function loeschen(id) {
        const box = boxen.find(function (b) { return b.id === id; });
        if (!box) return;
        const frage = tx('abx.loeschenFrage', { name: nameVon(box) },
            'Archetyp-Box „{name}“ löschen? Deine Sammlung bleibt unberührt.');
        if (typeof window.confirm === 'function' && !window.confirm(frage)) return;
        boxen = boxen.filter(function (b) { return b.id !== id; });
        spiegelSchreiben();
        const col = sammlung();
        if (col) col.doc(id).delete().catch(function (err) {
            console.warn('[ArchetypBox] Löschen gescheitert:', err && err.message);
            toast(tx('abx.nichtGespeichert', null, 'Die Box konnte nicht im Konto gespeichert werden.'), 'error');
        });
        if (aktiveId === id) aktiveId = null;
        if (letztesErgebnis && letztesErgebnis.id === id) letztesErgebnis = null;
        zeichnen();
    }

    /** Proxys drucken: eine Box, oder (id null) alle Boxen zusammen — gefiltert wie gerade gezeigt. */
    function proxysDrucken(id) {
        if (typeof addCardToProxy !== 'function') return;
        const quelle = id ? [boxVon(id)].filter(Boolean) : boxen.slice();
        const kontext = formatKontext();
        const liste = [];
        quelle.forEach(function (b) {
            const sichtbar = Object.assign({}, b, { karten: (b.karten || []).filter(function (roh) {
                const k = normiert(roh); return filterPasst(k, ansicht, elementVon(k)) && formatPasst(k, ansicht.format, kontext, b);
            }) });
            proxyListe(sichtbar).forEach(function (p) { liste.push(p); });
        });
        let kopien = 0;
        liste.forEach(function (p) { addCardToProxy(p.name, p.set, p.number, p.anzahl, true); kopien += p.anzahl; });
        if (typeof renderProxyQueue === 'function') renderProxyQueue();
        toast(tx('abx.proxysUebergeben', { n: kopien }, '{n} Proxys in die Druckliste übernommen.'), 'success');
        if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('proxy');
    }

    // ── Von Hand hinzufuegen ──

    let sucheTakt = null;

    function sucheTreffer(text) {
        const q = String(text || '').trim();
        const db = window.allCardsDatabase || [];
        if (q.length < 2 || !db.length) return [];
        const mSetNr = q.match(/^([A-Za-z0-9]{2,6})[\s-]+([A-Za-z0-9]+)$/);
        const treffer = [];
        const gesehen = new Set();
        if (mSetNr) {
            const k = (typeof getCanonicalCardRecord === 'function')
                ? getCanonicalCardRecord(mSetNr[1].toUpperCase(), mSetNr[2]) : null;
            if (k) { treffer.push(k); gesehen.add(kartenId(k.set, k.number)); }
        }
        const klein = q.toLowerCase();
        for (let i = 0; i < db.length && treffer.length < 12; i++) {
            const c = db[i];
            const en = String(c.name_en || c.name || '').toLowerCase();
            const de = String(c.name_de || '').toLowerCase();
            if (en.indexOf(klein) < 0 && de.indexOf(klein) < 0) continue;
            const id = kartenId(c.set, c.number);
            if (!id || gesehen.has(id)) continue;
            gesehen.add(id);
            treffer.push(c);
        }
        return treffer;
    }

    function suchen(text) {
        clearTimeout(sucheTakt);
        sucheTakt = setTimeout(async function () {
            const ziel = el('abxTreffer');
            if (!ziel) return;
            if (String(text || '').trim().length < 2) { ziel.innerHTML = ''; return; }
            if ((!window.allCardsDatabase || !window.allCardsDatabase.length) && typeof loadAllCardsDatabase === 'function') {
                ziel.innerHTML = '<p class="abx-leer">' + esc(tx('abx.ladeKarten', null, 'Lade Kartendatenbank …')) + '</p>';
                try { await loadAllCardsDatabase(); } catch (_) { /* unten leer */ }
            }
            const t2 = sucheTreffer(text);
            ziel.innerHTML = t2.length
                ? t2.map(function (c) {
                    const name = c.name_en || c.name || '';
                    const de = c.name_de && c.name_de !== name ? ' · ' + c.name_de : '';
                    return '<button type="button" class="abx-treffer-zeile" onclick="ArchetypBox.hinzufuegen(\''
                        + esc(String(c.set).toUpperCase()) + '\',\'' + esc(c.number) + '\')">'
                        + '<span class="abx-treffer-name">' + esc(name + de) + '</span>'
                        + '<span class="abx-treffer-druck">' + esc(String(c.set).toUpperCase() + ' ' + c.number
                            + (c.rarity ? ' · ' + c.rarity : '')) + '</span></button>';
                }).join('')
                : '<p class="abx-leer">' + esc(tx('abx.keinTreffer', null, 'Keine Karte gefunden.')) + '</p>';
        }, 180);
    }

    function hinzufuegen(set, nummer) {
        const box = aktiveId ? boxVon(aktiveId) : (boxen.length === 1 ? boxen[0] : null);
        if (!box) return;
        const k = (typeof getCanonicalCardRecord === 'function') ? getCanonicalCardRecord(set, nummer) : null;
        if (!k) return;
        const id = kartenId(k.set, k.number);
        let refs = [];
        if (typeof getInternationalPrintsForCard === 'function') {
            try {
                refs = (getInternationalPrintsForCard(k.set, k.number) || [])
                    .map(function (p) { return kartenId(p.set, p.number); }).filter(function (r) { return r && r !== id; });
            } catch (_) { refs = []; }
        }
        const name = k.name_en || k.name || '';
        let bild = k.image_url || '';
        if (typeof getBestCardImage === 'function') {
            try { bild = getBestCardImage(Object.assign({}, k, { set_code: k.set, set_number: k.number, card_name: name })) || bild; }
            catch (_) { /* Datenbankbild */ }
        }
        const eintrag = {
            id: id, name: name, set: String(k.set).toUpperCase(), number: String(k.number), bild: bild,
            typ: (typeof getCardType === 'function') ? getCardType(name, k.set, k.number) : '',
            element: k.energy_type || '',
            anzahl: 1, maxAnzahl: 0, anteil: null, refs: refs
        };
        const erg = manuellHinzufuegen(box, eintrag, heuteIso());
        if (!erg.hinzugefuegt) {
            toast(tx('abx.schonDrin', { name: name }, '„{name}“ liegt schon in der Box.'), 'info');
            return;
        }
        erg.box.id = box.id;
        schreiben(erg.box);
        const eingabe = el('abxSuche');
        if (eingabe) eingabe.value = '';
        const ziel = el('abxTreffer');
        if (ziel) ziel.innerHTML = '';
        toast(tx('abx.hinzugefuegt', { name: name }, '„{name}“ hinzugefügt.'), 'success');
        zeichnen();
    }

    // ── Oeffnen von aussen ──

    function oeffnen(id) {
        if (id) aktiveId = id;
        if (typeof openProfileSection === 'function') openProfileSection('archetypbox');
        else if (typeof switchProfileTab === 'function') switchProfileTab('archetypbox');
    }

    function waehlen(id) {
        aktiveId = id || null;
        if (!letztesErgebnis || letztesErgebnis.id !== id) letztesErgebnis = null;
        zeichnen();
    }

    // Wer sich ab- oder ummeldet, sieht nicht die Boxen des Vorgaengers.
    function abmelden() { boxen = []; geladenFuer = null; aktiveId = null; letztesErgebnis = null; }
    if (window.auth && typeof window.auth.onAuthStateChanged === 'function') {
        try { window.auth.onAuthStateChanged(function (u) { if (!u || u.uid !== geladenFuer) abmelden(); }); }
        catch (_) { /* kein Beobachter */ }
    }

    document.addEventListener('languageChanged', function () {
        if (el('profile-archetypbox') && !el('profile-archetypbox').classList.contains('d-none')) zeichnen();
        uebersichtGezeichnet();
    });

    window.ArchetypBox = Object.assign({}, Logik, {
        uebersichtGezeichnet: uebersichtGezeichnet,
        ausUebersicht: ausUebersicht,
        profilOeffnen: profilOeffnen,
        oeffnen: oeffnen,
        waehlen: waehlen,
        status: status,
        anzahl: anzahl,
        auffuellen: fuellen,
        wunsch: wunsch,
        wieder: wieder,
        wiederAlle: wiederAlle,
        ansicht: ansichtSetzen,
        druckeOeffnen: druckeOeffnen,
        verteilung: verteilungOeffnen,
        verteilungSchliessen: verteilungSchliessen,
        reinlegen: reinlegenKarte,
        alleReinlegen: alleReinlegen,
        sammlungSetzen: sammlungSetzen,
        druckeSchliessen: druckeSchliessen,
        _druck: druckAendern,
        entfernen: entfernenKarte,
        loeschen: loeschen,
        aktualisieren: aktualisieren,
        proxysDrucken: proxysDrucken,
        suchen: suchen,
        hinzufuegen: hinzufuegen,
        _eintragAusUebersicht: eintragAusUebersicht
    });
})();
