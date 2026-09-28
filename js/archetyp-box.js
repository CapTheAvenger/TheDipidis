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
    const MAX_ANZAHL = 60;
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

    /** Neue Box aus den Karten der Uebersicht. Keine "neu"-Marken: beim Anlegen ist alles neu. */
    function neueBox(kopf, frische, heute) {
        const karten = [];
        (frische || []).forEach(function (f) {
            if (!f || !f.id) return;
            if (karten.some(function (k) { return gleicheKarte(k, f); })) return;
            karten.push(Object.assign({}, f, {
                anzahl: anzahlBegrenzen(f.anzahl),
                status: 'fehlt', manuell: false, inDaten: true, neu: null, anzahlEigen: false
            }));
        });
        return {
            schemaVersion: 1,
            name: String(kopf.name || ''),
            archetyp: String(kopf.archetyp || ''),
            schwelle: String(kopf.schwelle || 'all'),
            datenStand: kopf.datenStand || null,
            erstellt: heute,
            aktualisiert: heute,
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
        const karten = alt.map(function (k) { return Object.assign({}, k); });
        const getroffen = new Set();
        const neu = [];
        (frische || []).forEach(function (f) {
            if (!f || !f.id) return;
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
                k.inDaten = true;
                if (f.reihe != null) k.reihe = f.reihe;
                if (!k.anzahlEigen) k.anzahl = anzahlBegrenzen(f.anzahl);
                const refs = new Set([].concat(k.refs || [], f.refs || [], [f.id]));
                refs.delete(k.id);
                k.refs = Array.from(refs);
                if (!k.typ && f.typ) k.typ = f.typ;
            } else {
                const eintrag = Object.assign({}, f, {
                    anzahl: anzahlBegrenzen(f.anzahl),
                    status: 'fehlt', manuell: false, inDaten: true, neu: heute, anzahlEigen: false
                });
                karten.push(eintrag);
                getroffen.add(karten.length - 1);
                neu.push(eintrag);
            }
        });
        const nichtMehr = [];
        karten.forEach(function (k, i) {
            if (getroffen.has(i) || k.manuell) return;
            if (k.inDaten !== false) nichtMehr.push(k);
            k.inDaten = false;
        });
        const ergebnis = Object.assign({}, box, {
            karten: karten,
            aktualisiert: heute,
            datenStand: (kopf && kopf.datenStand) || (box && box.datenStand) || null
        });
        return { box: ergebnis, neu: neu, nichtMehr: nichtMehr };
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
            z.kopien[s] += anzahlBegrenzen(k.anzahl);
            if (k.neu) z.neu += 1;
        });
        return z;
    }

    /** Was die Druckfunktion bekommt: jede Proxy-Karte mit ihrer Anzahl. */
    function proxyListe(box) {
        return rubriken(box).proxy.map(function (k) {
            return { name: k.name, set: k.set, number: k.number, anzahl: anzahlBegrenzen(k.anzahl) };
        });
    }

    /** Status setzen. Wer eine Karte einsortiert, hat die Neu-Marke gesehen. */
    function statusSetzen(box, id, status) {
        if (STATUS.indexOf(status) < 0) return box;
        return Object.assign({}, box, {
            karten: (box.karten || []).map(function (k) {
                return k.id === id ? Object.assign({}, k, { status: status, neu: null }) : k;
            })
        });
    }

    function anzahlSetzen(box, id, anzahl) {
        return Object.assign({}, box, {
            karten: (box.karten || []).map(function (k) {
                return k.id === id ? Object.assign({}, k, { anzahl: anzahlBegrenzen(anzahl), anzahlEigen: true }) : k;
            })
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
            anzahl: anzahlBegrenzen(eintrag.anzahl || 1),
            status: 'fehlt', manuell: true, inDaten: null, neu: null, anzahlEigen: true,
            hinzugefuegt: heute
        });
        return { box: Object.assign({}, box, { karten: karten.concat([neuEintrag]) }), hinzugefuegt: true };
    }

    function entfernen(box, id) {
        return Object.assign({}, box, {
            karten: (box.karten || []).filter(function (k) { return k.id !== id; })
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
        statusSetzen, anzahlSetzen, manuellHinzufuegen, entfernen, anzahlWieUebersicht,
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
            boxen.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
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
    function eintragAusUebersicht(card, totalDecklists) {
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
        const anteilRoh = (typeof parseLocaleNumber === 'function')
            ? parseLocaleNumber(card.percentage_in_archetype || card.share_percent || '', NaN)
            : parseFloat(String(card.percentage_in_archetype || '').replace(',', '.'));

        return {
            id: id,
            name: anzeigeName || name,
            set: dSet,
            number: dNummer,
            bild: bild,
            typ: typ || '',
            anzahl: anzahlWieUebersicht(card, totalDecklists, rep),
            maxAnzahl: parseInt(card.max_count || 0, 10) || 0,
            anteil: Number.isFinite(anteilRoh) ? Math.round(anteilRoh * 10) / 10 : null,
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
        const frische = eintraegeAus(gefilterteKarten(z.karten, schwelle), z.umfang && z.umfang.totalDecklists);
        if (frische.length === 0) {
            toast(tx('abx.keineKarten', null, 'Keine Karten mit Set und Nummer gefunden.'), 'warning');
            return;
        }
        const heute = heuteIso();
        if (vorhanden) {
            const erg = abgleichen(vorhanden, frische, { datenStand: datenStand }, heute);
            await schreiben(erg.box);
            letztesErgebnis = { id: vorhanden.id, neu: erg.neu, nichtMehr: erg.nichtMehr };
            hinweisSetzen('<span>' + esc(ergebnisSatz(erg)) + '</span> ' + oeffnenKnopf(vorhanden.id), z.archetyp);
        } else {
            const box = neueBox({ name: z.name, archetyp: z.archetyp, schwelle: schwelle, datenStand: datenStand },
                frische, heute);
            box.id = neueId();
            await schreiben(box);
            letztesErgebnis = null;
            hinweisSetzen('<span>' + esc(tx('abx.angelegt', { name: box.name, n: box.karten.length },
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

    async function aktualisieren(id) {
        if (aktualisiertGerade) return;
        const box = boxen.find(function (b) { return b.id === id; });
        if (!box) return;
        aktualisiertGerade = true;
        const zeile = function (text) {
            const f = el('abxFortschritt');
            if (f) { f.textContent = text; f.classList.toggle('d-none', !text); }
        };
        const knopf = el('abxAktualisierenBtn');
        if (knopf) knopf.disabled = true;
        try {
            await rotationenDatenLaden(zeile);
            const auswahl = _pmDeckAuswahl('all', 'all', box.archetyp);
            if (!auswahl.matchingDecks.length) {
                zeile('');
                toast(tx('abx.archetypWeg', { name: box.name },
                    '„{name}“ kommt in den Turnierdaten nicht mehr vor — die Box bleibt unverändert.'), 'warning');
                return;
            }
            const summe = _pmAggregiereDecks(auswahl.matchingDecks);
            const karten = gefilterteKarten(summe.aggregatedCards, String(box.schwelle || 'all'));
            const frische = eintraegeAus(karten, summe.totalDecklists);
            const erg = abgleichen(box, frische, { datenStand: isoTag(summe.letztesDatumMs) }, heuteIso());
            erg.box.id = box.id;
            await schreiben(erg.box);
            letztesErgebnis = { id: box.id, neu: erg.neu, nichtMehr: erg.nichtMehr };
            zeile('');
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

    async function manifestDatumHolen() {
        try {
            const basis = (typeof BASE_PATH !== 'undefined') ? BASE_PATH : './data/';
            const r = await fetch(basis + 'tournament_cards_manifest.json?t=' + Date.now());
            if (!r.ok) return null;
            return neuestesDatumImManifest(await r.json());
        } catch (_) { return null; }
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
        if (!aktiveId || !boxen.some(function (b) { return b.id === aktiveId; })) {
            aktiveId = boxen.length ? boxen[0].id : null;
        }
        zeichnen();
        manifestDatum = await manifestDatumHolen();
        zeichnen();
    }

    function leisteZeichnen() {
        const leiste = el('abxLeiste');
        if (!leiste) return;
        if (!boxen.length) { leiste.innerHTML = ''; return; }
        leiste.innerHTML = boxen.map(function (b) {
            const z = zaehlen(b);
            const aktiv = b.id === aktiveId;
            return '<button type="button" class="abx-chip' + (aktiv ? ' is-active' : '') + '" aria-pressed="'
                + (aktiv ? 'true' : 'false') + '" onclick="ArchetypBox.waehlen(\'' + esc(b.id) + '\')">'
                + '<span class="abx-chip-name">' + esc(b.name) + '</span>'
                + '<span class="abx-chip-zahl">' + esc(tx('abx.chipFehlt', { n: z.fehlt }, '{n} fehlen')) + '</span>'
                + '</button>';
        }).join('');
    }

    function kachel(k) {
        const status = STATUS.indexOf(k.status) >= 0 ? k.status : 'fehlt';
        const idJs = esc(k.id);
        const marken = [];
        if (k.neu) marken.push('<span class="abx-marke abx-marke-neu">' + esc(tx('abx.markeNeu', null, 'Neu')) + '</span>');
        if (k.manuell) marken.push('<span class="abx-marke">' + esc(tx('abx.markeManuell', null, 'von Hand')) + '</span>');
        if (k.inDaten === false) marken.push('<span class="abx-marke abx-marke-alt" title="'
            + esc(tx('abx.markeNichtMehrTitel', null, 'Kommt in den aktuellen Turnierlisten nicht mehr vor.')) + '">'
            + esc(tx('abx.markeNichtMehr', null, 'nicht mehr gespielt')) + '</span>');
        const knoepfe = STATUS.map(function (s) {
            const text = tx('abx.status.' + s, null, s === 'fehlt' ? 'Fehlt' : (s === 'original' ? 'Original' : 'Proxy'));
            return '<button type="button" class="abx-seg abx-seg-' + s + (s === status ? ' is-active' : '')
                + '" aria-pressed="' + (s === status ? 'true' : 'false') + '" onclick="ArchetypBox.status(\''
                + idJs + '\',\'' + s + '\')">' + esc(text) + '</button>';
        }).join('');
        const bild = k.bild
            ? '<img src="' + esc(k.bild) + '" alt="' + esc(k.name) + '" loading="lazy" referrerpolicy="no-referrer">'
            : '<div class="abx-kein-bild">' + esc(k.set + ' ' + k.number) + '</div>';
        const anteil = (k.anteil != null && k.inDaten !== false && !k.manuell)
            ? '<span class="abx-anteil">' + esc(prozent(k.anteil)) + '</span>' : '';
        return '<div class="abx-karte abx-karte-' + status + '" data-karte="' + esc(k.id) + '">'
            + '<div class="abx-bild">' + bild + '<span class="abx-anzahl" title="'
            + esc(tx('abx.anzahlTitel', null, 'Kopien in der Box')) + '">' + esc(k.anzahl) + '×</span>'
            + (marken.length ? '<div class="abx-marken">' + marken.join('') + '</div>' : '') + '</div>'
            + '<div class="abx-text"><div class="abx-name" title="' + esc(k.name) + '">' + esc(k.name) + '</div>'
            + '<div class="abx-druck">' + esc(k.set + ' ' + k.number) + anteil + '</div></div>'
            + '<div class="abx-segmente" role="group" aria-label="' + esc(tx('abx.statusAria', null, 'Status in der Box')) + '">' + knoepfe + '</div>'
            + '<div class="abx-zeile2">'
            + '<button type="button" class="abx-mini" onclick="ArchetypBox.anzahl(\'' + idJs + '\',-1)" aria-label="'
            + esc(tx('abx.wenigerAria', null, 'Eine Kopie weniger')) + '">−</button>'
            + '<button type="button" class="abx-mini" onclick="ArchetypBox.anzahl(\'' + idJs + '\',1)" aria-label="'
            + esc(tx('abx.mehrAria', null, 'Eine Kopie mehr')) + '">+</button>'
            + '<button type="button" class="abx-mini abx-weg" onclick="ArchetypBox.entfernen(\'' + idJs + '\')" title="'
            + esc(tx('abx.entfernenTitel', null, 'Aus der Box entfernen')) + '" aria-label="'
            + esc(tx('abx.entfernenTitel', null, 'Aus der Box entfernen')) + '">✕</button>'
            + '</div></div>';
    }

    function rubrik(schluessel, titel, karten) {
        return '<section class="abx-rubrik abx-rubrik-' + schluessel + '">'
            + '<div class="abx-rubrik-kopf"><h3>' + esc(titel) + ' <span class="abx-rubrik-zahl">' + karten.length + '</span></h3></div>'
            + (karten.length
                ? '<div class="abx-gitter">' + karten.map(kachel).join('') + '</div>'
                : '<p class="abx-leer">' + esc(tx('abx.rubrikLeer', null, 'Keine Karten.')) + '</p>')
            + '</section>';
    }

    function zeichnen() {
        leisteZeichnen();
        const wurzel = el('abxInhalt');
        if (!wurzel) return;
        const box = boxen.find(function (b) { return b.id === aktiveId; });
        if (!box) {
            wurzel.innerHTML = '<div class="abx-leer-block"><p>' + esc(tx('abx.keineBox', null,
                'Noch keine Archetyp-Box. Öffne Rotationen, wähle „Alle Formate“ und einen Archetyp und tippe in der Kartenübersicht auf „Zu Archetyp-Box hinzufügen“.'))
                + '</p><button type="button" class="btn btn-primary" onclick="switchTabAndUpdateMenu(\'past-meta\')">'
                + esc(tx('abx.zuRotationen', null, 'Zu Rotationen')) + '</button></div>';
            return;
        }
        const r = rubriken(box);
        const z = zaehlen(box);
        const kopf = '<div class="abx-kopf"><h3 class="abx-titel">' + esc(box.name) + '</h3>'
            + '<p class="abx-meta">' + esc(tx('abx.metaZeile', {
                schwelle: schwelleText(box.schwelle || 'all'),
                daten: datumLesbar(box.datenStand),
                datum: datumLesbar(box.aktualisiert)
            }, 'Alle Formate · {schwelle} · Turnierdaten bis {daten} · abgeglichen am {datum}')) + '</p></div>';
        const neuDa = neueDatenDa(box, manifestDatum);
        const hinweis = neuDa
            ? '<p class="abx-neudaten">' + esc(tx('abx.neueDaten', { datum: datumLesbar(manifestDatum) },
                'Es gibt Turnierdaten bis {datum}, die diese Box noch nicht kennt — „Archetyp-Box aktualisieren“ übernimmt neue Karten.')) + '</p>'
            : '';
        const erg = (letztesErgebnis && letztesErgebnis.id === box.id)
            ? '<p class="abx-ergebnis" role="status">' + esc(ergebnisSatz(letztesErgebnis)) + '</p>' : '';
        const aktionen = '<div class="abx-aktionen">'
            + '<button type="button" id="abxAktualisierenBtn" class="btn btn-primary" onclick="ArchetypBox.aktualisieren(\''
            + esc(box.id) + '\')">' + esc(tx('abx.knopfAktualisieren', null, 'Archetyp-Box aktualisieren')) + '</button>'
            + (r.proxy.length
                ? '<button type="button" class="btn btn-outline abx-druck-btn" onclick="ArchetypBox.proxysDrucken(\''
                    + esc(box.id) + '\')">' + esc(tx('abx.proxysDrucken', { n: z.kopien.proxy }, 'Proxys drucken ({n})')) + '</button>'
                : '')
            + '<button type="button" class="btn btn-outline" onclick="ArchetypBox.loeschen(\'' + esc(box.id) + '\')">'
            + esc(tx('abx.loeschen', null, 'Box löschen')) + '</button></div>'
            + '<p id="abxFortschritt" class="abx-fortschritt d-none" role="status" aria-live="polite"></p>';
        const suche = '<div class="abx-suche"><label for="abxSuche">' + esc(tx('abx.sucheLabel', null, 'Karte von Hand hinzufügen'))
            + '</label><input type="text" id="abxSuche" class="input-system" autocomplete="off" placeholder="'
            + esc(tx('abx.suchePlatzhalter', null, 'Name oder Set + Nummer, z. B. TWM 130'))
            + '" oninput="ArchetypBox.suchen(this.value)"><div id="abxTreffer" class="abx-treffer"></div></div>';
        const summe = '<p class="abx-summe">' + esc(tx('abx.summe', {
            fehlt: z.fehlt, original: z.original, proxy: z.proxy
        }, '{fehlt} fehlen · {original} als Original drin · {proxy} als Proxy drin')) + '</p>';
        wurzel.innerHTML = kopf + hinweis + aktionen + erg + suche + summe
            + rubrik('fehlt', tx('abx.rubrikFehlt', null, 'Noch nicht in der Box'), r.fehlt)
            + rubrik('original', tx('abx.rubrikOriginal', null, 'Schon drin (Original)'), r.original)
            + rubrik('proxy', tx('abx.rubrikProxy', null, 'Als Proxy drin'), r.proxy);
    }

    function aendern(id, fn) {
        const box = boxen.find(function (b) { return b.id === aktiveId; });
        if (!box) return;
        const neu = fn(box);
        neu.id = box.id;
        schreiben(neu);
        zeichnen();
    }

    function status(id, s) { aendern(id, function (b) { return statusSetzen(b, id, s); }); }

    function anzahl(id, delta) {
        aendern(id, function (b) {
            const k = (b.karten || []).find(function (x) { return x.id === id; });
            if (!k) return b;
            return anzahlSetzen(b, id, anzahlBegrenzen(k.anzahl) + delta);
        });
    }

    function entfernenKarte(id) {
        const box = boxen.find(function (b) { return b.id === aktiveId; });
        const k = box && (box.karten || []).find(function (x) { return x.id === id; });
        if (!k) return;
        const frage = tx('abx.entfernenFrage', { name: k.name }, '„{name}“ aus der Box entfernen?');
        if (typeof window.confirm === 'function' && !window.confirm(frage)) return;
        aendern(id, function (b) { return entfernen(b, id); });
    }

    function loeschen(id) {
        const box = boxen.find(function (b) { return b.id === id; });
        if (!box) return;
        const frage = tx('abx.loeschenFrage', { name: box.name },
            'Archetyp-Box „{name}“ löschen? Deine Sammlung bleibt unberührt.');
        if (typeof window.confirm === 'function' && !window.confirm(frage)) return;
        boxen = boxen.filter(function (b) { return b.id !== id; });
        spiegelSchreiben();
        const col = sammlung();
        if (col) col.doc(id).delete().catch(function (err) {
            console.warn('[ArchetypBox] Löschen gescheitert:', err && err.message);
            toast(tx('abx.nichtGespeichert', null, 'Die Box konnte nicht im Konto gespeichert werden.'), 'error');
        });
        if (aktiveId === id) aktiveId = boxen.length ? boxen[0].id : null;
        if (letztesErgebnis && letztesErgebnis.id === id) letztesErgebnis = null;
        zeichnen();
    }

    function proxysDrucken(id) {
        const box = boxen.find(function (b) { return b.id === id; });
        if (!box || typeof addCardToProxy !== 'function') return;
        const liste = proxyListe(box);
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
        const box = boxen.find(function (b) { return b.id === aktiveId; });
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
        aktiveId = id;
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
        entfernen: entfernenKarte,
        loeschen: loeschen,
        aktualisieren: aktualisieren,
        proxysDrucken: proxysDrucken,
        suchen: suchen,
        hinzufuegen: hinzufuegen,
        _eintragAusUebersicht: eintragAusUebersicht
    });
})();
