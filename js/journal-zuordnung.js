/**
 * FE-20 — Journal <-> Meta: wer ist wer?
 *
 * Das Journal speichert Gegner und eigenes Deck als freien Text
 * („Excadrill v2", „Excadrill Frankfurt", „Frankfurt", „Test 1"). Der Meta
 * Call kennt Archetypen („Mega Excadrill"). Diese Datei ordnet zu — und zwar
 * nur, wenn es SICHER ist. Was nicht sicher passt, bleibt „nicht zugeordnet"
 * und laesst sich von Hand zuordnen. Geraten wird nie.
 *
 * Reine Funktionen, kein DOM. Browser: window.JournalZuordnung; Test: require.
 */
(function (wurzel) {
    'use strict';

    function woerter(s) {
        return String(s || '').toLowerCase()
            .replace(/['‘’‛`´ʼ\-]/g, '')
            .split(/\s+/).filter(Boolean);
    }
    function norm(s) { return woerter(s).join(''); }

    /* Zusatzwoerter, die den Archetyp nicht aendern: v1, 2, ex, (Ort), [..] */
    const ZUSATZ = /^(?:v\d+|\d+|ex|\(.*\)|\[.*\])$/;

    function beginntMit(w, p) {
        if (!p.length || w.length < p.length) return false;
        for (let i = 0; i < p.length; i++) if (w[i] !== p[i]) return false;
        return true;
    }
    function endetMit(w, p) {
        if (!p.length || w.length < p.length) return false;
        const off = w.length - p.length;
        for (let i = 0; i < p.length; i++) if (w[off + i] !== p[i]) return false;
        return true;
    }

    /**
     * Ordnet einen Journal-Namen einem bekannten Deck zu.
     * @returns {{deck:(string|null), art:'manuell'|'exakt'|'zusatz'|'offen'|'mehrdeutig'}}
     *   zusatz = der Name beginnt mit dem Deck (oder dem Pokemon-Teil davon,
     *   „Excadrill" fuer „Mega Excadrill") und traegt nur Zusatz dahinter.
     */
    function ordneZu(name, bekannte, manuell) {
        const n = norm(name);
        if (!n) return { deck: null, art: 'offen' };
        const liste = (bekannte || []).map(String);
        if (manuell && Object.prototype.hasOwnProperty.call(manuell, n)) {
            const ziel = manuell[n];
            if (ziel) return { deck: String(ziel), art: 'manuell' };
        }
        const ex = liste.filter(function (d) { return norm(d) === n; });
        if (ex.length === 1) return { deck: ex[0], art: 'exakt' };
        if (ex.length > 1) return { deck: null, art: 'mehrdeutig' };

        const nw = woerter(name);
        const kand = [];
        liste.forEach(function (d) {
            const dw = woerter(d);
            if (!dw.length) return;
            /* Laenge des vorne stehenden Treffers: ganzer Deckname am Anfang
               oder (Pokemon-Teil) ein hinterer Teil des Decknamens am Anfang. */
            let laenge = 0;
            if (nw.length > dw.length && beginntMit(nw, dw)) laenge = dw.length;
            else {
                for (let l = dw.length - 1; l >= 1; l--) {
                    if (beginntMit(nw, dw.slice(dw.length - l)) && nw.length > l) { laenge = l; break; }
                }
            }
            if (laenge > 0) kand.push({ deck: d, laenge: laenge, dw: dw });
        });
        if (!kand.length) return { deck: null, art: 'offen' };
        const max = Math.max.apply(null, kand.map(function (k) { return k.laenge; }));
        const beste = kand.filter(function (k) { return k.laenge === max; });
        const decks = Array.from(new Set(beste.map(function (k) { return k.deck; })));
        if (decks.length > 1) return { deck: null, art: 'mehrdeutig' };
        const rest = nw.slice(max);
        /* Beginnt der Rest mit einem Pokemon-Namen eines anderen bekannten Decks
           („Excadrill Garganacl" bei bekanntem „Garganacl Box")? Dann nicht raten. */
        const fremd = liste.some(function (d) {
            if (d === decks[0]) return false;
            const dw = woerter(d);
            return dw.some(function (w) { return w.length > 3 && rest[0] === w; });
        });
        if (fremd && !rest.every(function (w) { return ZUSATZ.test(w); })) return { deck: null, art: 'mehrdeutig' };
        return { deck: decks[0], art: 'zusatz' };
    }

    /**
     * Gehoert ein Journal-Eintrag zum gewaehlten eigenen Deck?
     * 1. Name (exakt / Zusatz, wie UI-62)
     * 2. verknuepfter Schnappschuss: Archetyp gleich oder Zusatz
     * 3. Hauptkarte des Schnappschusses: >= 2 Stueck eines Pokemon, dessen
     *    Name dem gewaehlten Deck entspricht — nur, wenn kein anderes bekanntes
     *    Deck mit laengerem Namen dieselbe Karte traegt und ganz in der Liste steckt.
     * @param eintrag   {ownDeck, deckSnapshot}
     * @param eigenes   Name des gewaehlten Decks
     * @param bekannte  Namen aller bekannten Decks
     * @param kartenNamen  fn(snapshot) -> {grundname(lower, ohne ex/V): stueck}
     * @returns {{ja:boolean, art:string}}
     */
    function gehoertZuEigenem(eintrag, eigenes, bekannte, kartenNamen) {
        const o = norm(eigenes);
        if (!o || !eintrag) return { ja: false, art: '' };
        const ow = woerter(eigenes);
        const lang = (bekannte || []).map(woerter).filter(function (w) { return w.length > ow.length; });
        function nameOk(text) {
            if (norm(text) === o) return 'name';
            const w = woerter(text);
            if (w.length > ow.length && beginntMit(w, ow)
                && !lang.some(function (k) { return beginntMit(w, k); })) return 'zusatz';
            return '';
        }
        const a = nameOk(eintrag.ownDeck);
        if (a) return { ja: true, art: a };
        const s = eintrag.deckSnapshot;
        if (!s) return { ja: false, art: '' };
        if (s.archetype && nameOk(s.archetype)) return { ja: true, art: 'archetyp' };
        if (!s.archetype && typeof kartenNamen === 'function') {
            const namen = kartenNamen(s) || {};
            if ((namen[o] || 0) >= 2) {
                /* Ein anderes Deck, das mit dem eigenen Namen anfaengt oder endet,
                   und dessen uebrige Woerter ebenfalls als Karte im Deck liegen,
                   ist der bessere Treffer — dann nicht zuordnen. */
                const verdraengt = (bekannte || []).some(function (d) {
                    const dw = woerter(d);
                    if (dw.length <= ow.length || norm(d) === o) return false;
                    if (!(beginntMit(dw, ow) || endetMit(dw, ow))) return false;
                    const uebrig = beginntMit(dw, ow) ? dw.slice(ow.length) : dw.slice(0, dw.length - ow.length);
                    return uebrig.length > 0 && uebrig.every(function (w) {
                        return Object.keys(namen).some(function (k) { return k === w || k.indexOf(w) !== -1; });
                    });
                });
                if (!verdraengt) return { ja: true, art: 'hauptkarte' };
            }
        }
        return { ja: false, art: '' };
    }

    const api = { woerter: woerter, norm: norm, ordneZu: ordneZu, gehoertZuEigenem: gehoertZuEigenem };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else wurzel.JournalZuordnung = api;
})(typeof window !== 'undefined' ? window : this);
