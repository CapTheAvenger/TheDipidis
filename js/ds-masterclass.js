/* ds-masterclass.js — gekaufte Masterclasses, auf Deutsch aufbereitet.
 *
 * Aufbau wie bei der Anleitung (js/ds-tutorial.js): index.html traegt nur
 * eine Huelle, der Inhalt wird erst geholt, wenn jemand eine Masterclass
 * oeffnet. Das Stueck fuer Mega-Stalobor-ex ist 188 KB gross — es gehoert
 * nicht in ein Dokument, das jeder Besucher laedt.
 *
 * Warum ein Regal und keine einzelne Seite: der Betreiber kauft laufend
 * weitere Masterclasses. Eine neue kostet hier zwei Zeilen in GUIDES plus
 * eine Datei unter masterclass/ — kein Umbau.
 *
 * Drei Dinge, die hier leicht danebengehen und deshalb festgehalten sind:
 *
 *   1. Die Kartenbilder liegen NICHT im Repo. Sie kommen ueber dieselbe
 *      Limitless-Adresse, die js/app-anti-tech.js:891 baut. Die Sandkiste
 *      erreicht den CDN nicht (Proxy antwortet 403), der Browser des
 *      Besuchers sehr wohl — geprueft wird das deshalb live, nicht im Test.
 *   2. Die Aufbereitung liegt nur auf DEUTSCH vor. Auf der englischen
 *      Oberflaeche steht deshalb ein Hinweis statt einer halben
 *      Uebersetzung; erfunden wird nichts.
 *   3. Die aufgedruckte rote Anzahl-Plakette auf den Kartenbildern gibt es
 *      hier nicht — die Bilder kommen roh vom CDN. Die eigene Plakette
 *      (.mcl-anz) ist die einzige Zahl im Bild und stimmt je Liste.
 */
(function () {
    'use strict';

    var HOST_ID = 'masterclassHost';

    /* Eine Zeile je gekaufter Masterclass. Die Kennzahlen stehen hier und
     * nicht im Inhaltsstueck, damit das Regal ohne Abruf gezeichnet werden
     * kann. */
    var GUIDES = [{
        id: 'mega-stalobor',
        titel: 'Mega-Stalobor-ex',
        titelEn: 'Mega Excadrill ex',
        autor: 'Tim Danklin',
        datum: '17.08.2026',
        zusatz: 'Update 10.09. · Liste 19.09.',
        /* Die Regalkachel zeigt den SAMMLERDRUCK der Leitkarte — denselben,
         * den das Kartendetail zeigt (PBL-103 statt PBL-65). Hausi,
         * 22.09.2026: "Ist immer noch der low rarity Print, obwohl da max
         * rarity Print hin soll." Der guenstige Druck gehoert in die
         * Listen, die verschickt werden; auf der Kachel steht das Bild,
         * das man ansieht. */
        bild: 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/PBL/PBL_103_R_EN_LG.png',
        /* Gezaehlt am Stueck, nicht geschaetzt: 22 Matchups, 25 Listen,
         * 10.164 Woerter in der Ausarbeitung (22.09.2026). Die Zahl "6
         * Listen" stand hier noch, als es laengst 25 waren. */
        kennzahlen: '22 Matchups · 25 Listen · 10.164 Wörter',
        sprachen: ['de'],
        datei: 'masterclass/mega-stalobor.de.html'
    }];

    var cache = {};      /* guide-id -> HTML-Text */
    var pending = {};    /* guide-id -> Promise */

    var TXT = {
        de: {
            regalTitel: 'Meine Masterclasses',
            regalLead: 'Gekaufte Guides, auf Deutsch aufbereitet. Eine Kachel je Masterclass.',
            oeffnen: 'Öffnen',
            schliessen: 'Schließen',
            platz: 'Platz für die nächste Masterclass',
            platzFein: 'Format, Namen und Prüfungen sind schon gebaut',
            laden: 'Masterclass wird geladen …',
            fehler: 'Die Masterclass ließ sich nicht laden.',
            erneut: 'Erneut versuchen',
            direkt: 'Direkt öffnen',
            nurDe: 'Diese Aufbereitung liegt nur auf Deutsch vor.',
            geoeffnet: 'Geöffnet',
            inDieser: '× in dieser Liste',
            warum: 'Warum diese Anzahl',
            kartentext: 'Kartentext',
            kartentextEn: 'Card text (English)',
            sammlerdruck: 'Sammlerdruck',
            kopiert: 'Liste als Bild — kopieren oder sichern',
            keinTreffer: 'Kein Treffer.',
            binder: 'Cardbinder',
            binderLead: 'Jede Karte, die für diesen Archetyp je in einer erfassten Liste stand.',
            binderLaden: 'Kartenmappe wird geladen …',
            binderFehlt: 'Für diese Masterclass ist noch keine Kartenmappe gebaut.',
            binderAlle: 'Alle Metas',
            binderListen: 'Listen',
            binderAnteil: 'Anteil',
            binderSchnitt: 'Ø',
            binderMax: 'max',
            binderPreis: 'Preis',
            binderOhnePreis: 'kein Preis im Bestand',
            binderSortStandard: 'Standardsortierung',
            binderSortNutzung: 'Meistgenutzt',
            binderSortName: 'Name',
            binderSortPreis: 'Preis',
            binderNurTim: 'Nur Tims Empfehlungen',
            binderNurTimTitel: 'Zeigt nur Karten, die in einer von Tims Listen stehen — die Gruppe „Tims Listen" in diesem Stück.',
            binderTimN: 'Tim spielt',
            binderGrpPokemon: 'Pokémon',
            binderGrpSupporter: 'Supporter',
            binderGrpItem: 'Item',
            binderGrpTool: 'Tool',
            binderGrpStadium: 'Stadion',
            binderGrpSpecialEnergy: 'Spezial-Energie',
            binderGrpBasicEnergy: 'Basis-Energie',
            binderGrpOhne: 'Ohne Angabe',
            binderDeck: 'Mein Deck',
            binderDeckLeer: 'Noch keine Karte im Deck. Das + auf einer Karte legt sie so oft hinein, wie sie im Schnitt gespielt wurde.',
            binderDeckZahl: 'von 60',
            binderPlus: 'Ins Deck',
            binderMinus: 'Eine heraus',
            binderPlusTitel: 'Legt die Karte so oft ins Deck, wie sie im Schnitt gespielt wurde — dieselbe Regel wie die rote Marke auf den anderen Reitern.',
            binderGrenze: 'Mehr als 4× ist nicht erlaubt (außer Basis-Energie).',
            binderDeckSpeichern: 'In „Meine Decks" speichern',
            binderDeckLeeren: 'Deck leeren',
            binderDeckKopieren: 'Als Liste kopieren',
            binderDeckSumme: 'Kartenwert',
            binderDeckOhnePreis: 'ohne Preis',
            binderWarn60: 'Ein Deck hat genau 60 Karten.',
            binderWarnAce: 'Mehr als eine ACE SPEC ist nicht erlaubt.',
            binderWarnBasis: 'Ohne Basis-Pokémon ist das Deck nicht spielbar.',
            binderGespeichert: 'Deck in „Meine Decks" gespeichert.',
            binderNichtAngemeldet: 'Zum Speichern in „Meine Decks" bitte anmelden.',
            binderDeckName: 'Name des Decks',
            binderPlusEine: 'Eine mehr',
            binderWeitereDrucke: 'weiterer Druck',
            binderWeitereDruckeMz: 'weitere Drucke',
            binderEnergieHinweis: 'Basis-Energien sind austauschbar — gezeigt wird der meistgespielte Druck.',
            binderDruck: 'Anderes Artwork',
            binderLimitless: 'Karte auf Limitless öffnen',
            binderProxy: 'In die Proxy-Liste',
            binderDruckGetauscht: 'Artwork getauscht',
            binderDruckRest: 'Nicht alle Kopien passten — mehr als 4× ist nicht erlaubt.',
            binderMatchups: 'Matchups aus echten Turnieren',
            binderTurniere: 'Turnierergebnisse des Decks',
            binderPartien: 'Partien',
            binderQuote: 'Siegquote',
            binderSpieler: 'Spieler',
            binderKeine: 'Keine Karte in diesem Meta.',
            binderHerkunft: 'Woher die Zahlen kommen',
            vorlesen: 'Vorlesen',
            pause: 'Pause',
            weiter: 'Weiter',
            stopp: 'Stopp',
            tempo: 'Tempo',
            keineStimme: 'Dieser Browser kann nicht vorlesen.'
        },
        en: {
            regalTitel: 'My Masterclasses',
            regalLead: 'Purchased guides, written up in German. One tile per masterclass.',
            oeffnen: 'Open',
            schliessen: 'Close',
            platz: 'Room for the next masterclass',
            platzFein: 'Format, names and checks are already built',
            laden: 'Loading the masterclass …',
            fehler: 'The masterclass could not be loaded.',
            erneut: 'Try again',
            direkt: 'Open directly',
            nurDe: 'This write-up is only available in German.',
            geoeffnet: 'Open',
            inDieser: '× in this list',
            warum: 'Why this count',
            kartentext: 'Card text',
            kartentextEn: 'Kartentext (Deutsch)',
            sammlerdruck: 'Collector print',
            kopiert: 'List as an image — copy or save',
            keinTreffer: 'No match.',
            binder: 'Cardbinder',
            binderLead: 'Every card that has ever appeared in a recorded list for this archetype.',
            binderLaden: 'Loading card binder …',
            binderFehlt: 'No card binder has been built for this masterclass yet.',
            binderAlle: 'All metas',
            binderListen: 'lists',
            binderAnteil: 'share',
            binderSchnitt: 'avg',
            binderMax: 'max',
            binderPreis: 'Price',
            binderOhnePreis: 'no price on file',
            binderSortStandard: 'Standard order',
            binderSortNutzung: 'Most used',
            binderSortName: 'Name',
            binderSortPreis: 'Price',
            binderNurTim: "Tim's picks only",
            binderNurTimTitel: "Shows only cards that appear in one of Tim's lists — the \u201cTims Listen\u201d group in this piece.",
            binderTimN: 'Tim plays',
            binderGrpPokemon: 'Pok\u00e9mon',
            binderGrpSupporter: 'Supporter',
            binderGrpItem: 'Item',
            binderGrpTool: 'Tool',
            binderGrpStadium: 'Stadium',
            binderGrpSpecialEnergy: 'Special Energy',
            binderGrpBasicEnergy: 'Basic Energy',
            binderGrpOhne: 'Unspecified',
            binderDeck: 'My deck',
            binderDeckLeer: 'No card in the deck yet. The + on a card adds as many copies as it was played on average.',
            binderDeckZahl: 'of 60',
            binderPlus: 'Add to deck',
            binderMinus: 'Remove one',
            binderPlusTitel: 'Adds as many copies as the card was played on average \u2014 the same rule as the red badge on the other tabs.',
            binderGrenze: 'More than 4\u00d7 is not allowed (except basic energy).',
            binderDeckSpeichern: 'Save to My Decks',
            binderDeckLeeren: 'Clear deck',
            binderDeckKopieren: 'Copy as list',
            binderDeckSumme: 'Card value',
            binderDeckOhnePreis: 'without price',
            binderWarn60: 'A deck has exactly 60 cards.',
            binderWarnAce: 'More than one ACE SPEC is not allowed.',
            binderWarnBasis: 'Without a Basic Pok\u00e9mon the deck cannot be played.',
            binderGespeichert: 'Deck saved to My Decks.',
            binderNichtAngemeldet: 'Please sign in to save to My Decks.',
            binderDeckName: 'Deck name',
            binderPlusEine: 'One more',
            binderWeitereDrucke: 'other print',
            binderWeitereDruckeMz: 'other prints',
            binderEnergieHinweis: 'Basic energies are interchangeable \u2014 the most played print is shown.',
            binderDruck: 'Different artwork',
            binderLimitless: 'Open card on Limitless',
            binderProxy: 'Add to proxy list',
            binderDruckGetauscht: 'Artwork swapped',
            binderDruckRest: 'Not all copies fit \u2014 more than 4\u00d7 is not allowed.',
            binderMatchups: 'Matchups from real tournaments',
            binderTurniere: 'Tournament results for this deck',
            binderPartien: 'games',
            binderQuote: 'win rate',
            binderSpieler: 'players',
            binderKeine: 'No card in this meta.',
            binderHerkunft: 'Where the numbers come from',
            vorlesen: 'Read aloud',
            pause: 'Pause',
            weiter: 'Continue',
            stopp: 'Stop',
            tempo: 'Speed',
            keineStimme: 'This browser cannot read aloud.'
        }
    };

    function lang() {
        try {
            return (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'de';
        } catch (e) { return 'de'; }
    }
    function T(key) { return (TXT[lang()] || TXT.de)[key]; }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function host() { return document.getElementById(HOST_ID); }

    /* Das ?v= stempelt deploy-pages.yml beim Deploy um — ohne den Stempel
     * serviert der Service Worker nach einer Textaenderung die alte. */
    function url(g) { return g.datei + '?v=0'; }

    function hole(g) {
        if (cache[g.id]) return Promise.resolve(cache[g.id]);
        if (pending[g.id]) return pending[g.id];
        pending[g.id] = fetch(url(g), { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (txt) {
                cache[g.id] = txt;
                delete pending[g.id];
                return txt;
            })
            .catch(function (err) { delete pending[g.id]; throw err; });
        return pending[g.id];
    }

    /* ---------- Regal ---------- */

    function kachel(g) {
        var nurDe = g.sprachen.indexOf(lang()) === -1;
        return '<article class="mcl-kachel" data-mcl-guide="' + esc(g.id) + '">' +
            '<div class="mcl-kachel-kopf">' +
            '<img class="mcl-kachel-bild" src="' + esc(g.bild) + '" alt="" loading="lazy" width="245" height="342">' +
            '<div class="mcl-kachel-txt">' +
            '<b>' + esc(g.titel) + '</b>' +
            '<span class="mcl-kachel-en">' + esc(g.titelEn) + '</span>' +
            '<span class="mcl-fein">' + esc(g.autor) + ' · ' + esc(g.datum) + '<br>' + esc(g.zusatz) + '</span>' +
            '<span class="mcl-kennzahlen">' + esc(g.kennzahlen) + '</span>' +
            (nurDe ? '<span class="mcl-nurde">' + esc(T('nurDe')) + '</span>' : '') +
            '</div></div>' +
            '<button type="button" class="mcl-oeffnen" data-mcl-oeffnen="' + esc(g.id) + '">' +
            esc(T('oeffnen')) + '</button></article>';
    }

    function zeichneRegal() {
        var h = host();
        if (!h) return;
        h.innerHTML =
            '<p class="mcl-lead">' + esc(T('regalLead')) + '</p>' +
            '<div class="mcl-regal">' +
            GUIDES.map(kachel).join('') +
            '<div class="mcl-platz"><span>' + esc(T('platz')) + '</span>' +
            '<span class="mcl-fein">' + esc(T('platzFein')) + '</span></div>' +
            '</div><div class="mcl-buehne" id="mclBuehne" hidden></div>';
        h.dataset.state = 'regal';
    }

    /* ---------- Inhalt ---------- */

    function zeigeFehler(buehne, g) {
        buehne.innerHTML = '<div class="mcl-fehler"><p>' + esc(T('fehler')) + '</p>' +
            '<p><button type="button" class="mcl-erneut" data-mcl-oeffnen="' + esc(g.id) + '">' +
            esc(T('erneut')) + '</button> <a href="' + esc(url(g)) + '">' + esc(T('direkt')) + '</a></p></div>';
    }

    function oeffneGuide(id) {
        var g = GUIDES.filter(function (x) { return x.id === id; })[0];
        var buehne = document.getElementById('mclBuehne');
        if (!g || !buehne) return;
        buehne.hidden = false;
        buehne.innerHTML = '<p class="mcl-status">' + esc(T('laden')) + '</p>';
        hole(g).then(function (txt) {
            buehne.innerHTML = '<div class="mcl-buehne-kopf"><h4>' + esc(T('geoeffnet')) + ': ' +
                esc(g.titel) + '</h4>' +
                '<button type="button" class="mcl-schliessen">' + esc(T('schliessen')) + '</button></div>' + txt;
            verdrahte(buehne, g);
            try { buehne.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
        }).catch(function (err) {
            console.warn('[DsMasterclass] ' + g.id + ' nicht geladen:', err && err.message);
            zeigeFehler(buehne, g);
        });
    }

    /* ---------- Cardbinder ----------------------------------------
     *
     * ANLASS (Betreiber, 24.09.2026): „Dann nehme ich noch einen Reiter,
     * Cardbinder, wo ich sehe, aus allen, seitdem es den Archetype gibt,
     * alle Karten, die jemals fuer diesen Archetype benutzt worden sind
     * … dass ich den Masterclass-Bereich einfach nicht verlassen
     * moechte." Dazu: Metafilter, meistgenutzte Karten, Preise,
     * Matchups und Turnierergebnisse.
     *
     * WARUM DER REITER HIER ENTSTEHT UND NICHT IM INHALTSSTUECK
     * --------------------------------------------------------
     * masterclass/<id>.de.html ist eine gekaufte Aufbereitung, von Hand
     * gesetzt, 640 KB gross. Stuende der Cardbinder darin, muesste jede
     * kuenftige Masterclass ihn mitbringen — und die erste, die es
     * vergisst, haette ihn nicht. Er wird deshalb beim Oeffnen
     * ANGEHAENGT: eine neue Masterclass bekommt ihn, ohne dass jemand
     * daran denkt. Genau das war die Auflage: „wenn ich mir zukuenftig
     * neue Masterclasses kaufe, dann soll von Anfang an klar sein, dass
     * das so gemacht werden soll".
     *
     * Die Daten kommen aus data/masterclass_cardbinder/<id>.json,
     * vorberechnet von scripts/build_masterclass_cardbinder.py. Roh
     * waeren es 32 MB Kartenzeilen je Meta — das laedt niemand im
     * Browser.
     */

    var binderDaten = {};    /* guide-id -> Mappe */
    var binderLaeuft = {};   /* guide-id -> Promise */
    var binderStand = {};    /* guide-id -> {meta, sort, nurTim} */
    var binderTim = {};      /* guide-id -> {SET-NUM: Anzahl in Tims Listen} */
    var binderTimJetzt = {}; /* guide-id -> {SET-NUM: Anzahl in Tims AKTUELLER Liste} */

    /* Die Standardsortierung, um die der Betreiber am 25.09.2026 gebeten
     * hat: „Pokemon, supporter, Item, Tool, Stadion, Spezial Energie,
     * Basis Energie". Dieselbe Reihenfolge fuehrt js/app-deck-builder.js
     * seit Langem als `typeOrder`; die Gruppe je Karte steht in der
     * Mappe (scripts/kartengruppe.py hat sie gesetzt). */
    var BINDER_GRUPPEN = ['pokemon', 'supporter', 'item', 'tool', 'stadium',
        'special-energy', 'basic-energy'];
    var BINDER_GRUPPE_TXT = {
        'pokemon': 'binderGrpPokemon',
        'supporter': 'binderGrpSupporter',
        'item': 'binderGrpItem',
        'tool': 'binderGrpTool',
        'stadium': 'binderGrpStadium',
        'special-energy': 'binderGrpSpecialEnergy',
        'basic-energy': 'binderGrpBasicEnergy'
    };

    function binderGruppenRang(k) {
        var i = BINDER_GRUPPEN.indexOf(k && k.gruppe);
        return i < 0 ? BINDER_GRUPPEN.length : i;
    }

    function binderDruck(k) {
        return String((k.set || '') + '-' + (k.nummer || '')).toUpperCase();
    }

    function binderUrl(id) {
        return 'data/masterclass_cardbinder/' + encodeURIComponent(id) + '.json';
    }

    function binderHolen(id) {
        if (binderDaten[id]) return Promise.resolve(binderDaten[id]);
        if (binderLaeuft[id]) return binderLaeuft[id];
        binderLaeuft[id] = fetch(binderUrl(id), { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (j) {
                binderDaten[id] = j;
                delete binderLaeuft[id];
                return j;
            })
            .catch(function (err) { delete binderLaeuft[id]; throw err; });
        return binderLaeuft[id];
    }

    /* Eine Zahl, die aus den Daten kommt — oder ein Strich. Nie eine 0,
     * die wie eine Messung aussieht. */
    function binderZahl(w, nach) {
        if (w === null || w === undefined || w === '') return '–';
        var n = Number(w);
        if (!isFinite(n)) return '–';
        return n.toFixed(nach === undefined ? 0 : nach).replace('.', ',');
    }

    /* ---------- Tims Empfehlungen ----------------------------------
     *
     * ANLASS (Betreiber, 25.09.2026): „ich möchte bitte noch eine Option
     * das ich nur nach Tims empfehlungen filtern kann wenn ich innerhalb
     * meiner Masterclass Daten mein Deck bauen will."
     *
     * Woher die Auskunft kommt: aus dem geladenen Stueck selbst. Die
     * Schalterleiste dort ist in Gruppen geteilt, und die erste heisst
     * „Tims Listen" (Bloecke 0–6 bei Mega-Stalobor). Dieselbe Gruppierung
     * liest scripts/masterclass_listen_nachziehen.py schon aus
     * (gruppen_nummern(), GRUPPE) und dieselbe Bezugsliste nennt es
     * TIMS_BLOCK = "0" — Tims aktuelle Liste.
     *
     * NICHT aus der Kartenmappe: die kennt nur, was in ERFASSTEN Listen
     * stand. Ob Tim eine Karte empfiehlt, steht in seiner Ausarbeitung —
     * und nirgends sonst.
     */
    function timGruppenBloecke(wurzel) {
        var nummern = [];
        wurzel.querySelectorAll('.mcl-listgruppe').forEach(function (grp) {
            var titel = grp.querySelector('.mcl-listgruppe-titel');
            var text = (titel && titel.textContent) || '';
            /* Die Gruppe heisst im Stueck „Tims Listen". Geprueft wird auf
             * den Namen des Autors, nicht auf den vollen Wortlaut — eine
             * kuenftige Masterclass hat einen anderen Autor. */
            if (!/^\s*tim/i.test(text)) return;
            grp.querySelectorAll('[data-mcl-liste]').forEach(function (c) {
                var n = c.getAttribute('data-mcl-liste');
                if (n !== null && nummern.indexOf(n) < 0) nummern.push(n);
            });
        });
        /* Kein Gruppentitel im Stueck: dann gilt der Bezug, den der
         * Erzeuger ohnehin kennt — Block 0 ist Tims aktuelle Liste. */
        if (!nummern.length && wurzel.querySelector('[data-mcl-listenblock="0"]')) {
            nummern.push('0');
        }
        return nummern;
    }

    function timZaehlung(wurzel, bloecke) {
        var aus = {};
        bloecke.forEach(function (nr) {
            var block = wurzel.querySelector('[data-mcl-listenblock="' + nr + '"]');
            if (!block) return;
            block.querySelectorAll('.mcl-kk').forEach(function (kk) {
                var druck = String(kk.getAttribute('data-druck') || '').toUpperCase();
                var n = parseInt(kk.getAttribute('data-n'), 10) || 0;
                if (!druck || !n) return;
                /* Mehrere Listen: die HOECHSTE Zahl, die Tim je gespielt
                 * hat. Eine Summe ueber sieben Listen waere sinnlos. */
                aus[druck] = Math.max(aus[druck] || 0, n);
            });
        });
        return aus;
    }

    function timLesen(wurzel, g) {
        if (binderTim[g.id]) return;
        var bloecke = timGruppenBloecke(wurzel);
        binderTim[g.id] = timZaehlung(wurzel, bloecke);
        binderTimJetzt[g.id] = timZaehlung(wurzel, bloecke.slice(0, 1));
    }

    /* ---------- Die Bruecke zum Deck ------------------------------
     *
     * Es gibt EIN Deck: das des Deckbauers im Profil
     * (js/app-profile-deck-builder.js, localStorage
     * dipidis.profileDeckBuilder.v1). Der Cardbinder legt dort hinein
     * und liest von dort — kein zweites Deck, das auseinanderlaeuft.
     */
    function deckBauer() {
        var p = window.ProfileDeckBuilder;
        return (p && typeof p.addCopies === 'function') ? p : null;
    }

    /* Aus einer Mappenkarte die Form, die der Deckbauer fuehrt. */
    function binderDeckKarte(k) {
        return {
            set: k.set || '',
            number: k.nummer || '',
            name_en: k.name || '',
            name_de: k.name_de || '',
            type: k.typ || '',
            rarity: null,
            image_url: k.bild || '',
            is_japanese: false
        };
    }

    function binderImDeck(k) {
        var p = deckBauer();
        if (!p || typeof p.countOf !== 'function') return 0;
        try { return p.countOf(binderDeckKarte(k)) || 0; } catch (e) { return 0; }
    }

    /* Wie oft die Karte ins Deck soll: die REGEL, die das Haus schon hat.
     *
     * _markeZahl() in js/app-city-league.js beantwortet genau diese Frage
     * („wie viele spiele ich davon, wenn ich sie spiele") und ist dort
     * ausfuehrlich begruendet — Schnitt ueber die Listen, die die Karte
     * WIRKLICH enthalten, Boden bei 1, bei einer einzigen Liste das
     * Maximum. Sie ist global und wird vor dieser Datei geladen
     * (index.html). Fehlt sie wider Erwarten, gilt die Hoechstzahl —
     * derselbe Rueckfall wie in js/app-current-meta-analysis.js:5207.
     */
    function binderMenge(k, meta) {
        var w = (meta === 'alle') ? k.gesamt : (k.je_meta && k.je_meta[meta]);
        if (!w) return 1;
        var schnitt = (w.schnitt === null || w.schnitt === undefined) ? 0 : w.schnitt;
        var hoechst = w.hoechstzahl || 0;
        var listen = w.listen_gesamt || 0;
        var mit = w.listen_mit_karte || 0;
        var n = (typeof window._markeZahl === 'function')
            ? window._markeZahl(0, schnitt, hoechst, mit, listen)
            : (hoechst || Math.max(1, Math.round(schnitt)));
        n = Number(n) || 0;
        /* Die Marke darf 0 sein, wenn keine Quelle eine Zahl fuehrt —
         * ins Deck gelegt wird dann trotzdem eine Karte, denn der Klick
         * war eindeutig. */
        return Math.max(1, n);
    }

    function binderKarteHtml(k, meta, tim, timJetzt) {
        var w = (meta === 'alle') ? k.gesamt : (k.je_meta && k.je_meta[meta]);
        if (!w) return '';
        var name = k.name_de || k.name;
        var druck = (k.set || '') + (k.nummer ? '-' + k.nummer : '');
        var schluessel = binderDruck(k);
        var bild = k.bild || bildAdresse(druck);
        var kopf = bild
            ? '<img loading="lazy" alt="' + esc(name) + '" src="' + esc(bild) + '">'
            : '<div class="mcl-kk-text">' + esc(name) + '</div>';
        var teile = [];
        if (w.anteil !== null && w.anteil !== undefined) {
            teile.push('<b>' + binderZahl(w.anteil, 1) + '\u00a0%</b>');
        }
        if (w.listen_mit_karte) {
            teile.push(binderZahl(w.listen_mit_karte) + '\u202f/\u202f' +
                binderZahl(w.listen_gesamt) + ' ' + esc(T('binderListen')));
        }
        if (w.schnitt) teile.push(esc(T('binderSchnitt')) + '\u00a0' + binderZahl(w.schnitt, 2));
        if (w.hoechstzahl) teile.push(esc(T('binderMax')) + '\u00a0' + binderZahl(w.hoechstzahl));
        var preis = k.preis && k.preis.eur !== null && k.preis.eur !== undefined
            ? (k.preis.url
                ? '<a class="mcl-bd-preis" href="' + esc(k.preis.url) + '" target="_blank" rel="noopener">'
                    + binderZahl(k.preis.eur, 2) + '\u00a0\u20ac</a>'
                : '<span class="mcl-bd-preis">' + binderZahl(k.preis.eur, 2) + '\u00a0\u20ac</span>')
            : '<span class="mcl-bd-preis mcl-bd-kein" title="' + esc(T('binderOhnePreis')) + '">–</span>';
        /* Was der Deckbau braucht, steht AN der Karte: wie viele das +
         * hineinlegt, wie viele schon drin sind, und was Tim spielt. */
        var menge = binderMenge(k, meta);
        var drin = binderImDeck(k);
        var timN = (tim && tim[schluessel]) || 0;
        var timJ = (timJetzt && timJetzt[schluessel]) || 0;
        var timMarke = timN
            ? '<span class="mcl-bd-tim" title="' + esc(T('binderTimN') + ' ' + timN + '\u00d7' +
                (timJ ? '' : ' (nicht in seiner aktuellen Liste)')) + '"' +
                (timJ ? '' : ' data-alt="1"') + '>' + esc(T('binderTimN')) + '\u00a0' + timN + '\u00d7</span>'
            : '';
        var aceMarke = k.ace ? '<span class="mcl-bd-ace" title="ACE SPEC — h\u00f6chstens eine je Deck">ACE</span>' : '';
        /* Basis-Energien stehen nur noch einmal je Energieart da. Was
         * sonst noch gefuehrt wird, wird benannt statt verschwiegen. */
        var weitere = (k.weitere_drucke || []);
        var weitereMarke = weitere.length
            ? '<span class="mcl-bd-weitere" title="' + esc(T('binderEnergieHinweis') + ' ' +
                weitere.map(function (w) {
                    return (w.set || '') + '-' + (w.nummer || '') + ': ' +
                        binderZahl(w.listen_mit_karte) + ' ' + T('binderListen');
                }).join(' · ')) + '">+' + weitere.length + '\u00a0' +
                esc(T(weitere.length === 1 ? 'binderWeitereDrucke' : 'binderWeitereDruckeMz')) + '</span>'
            : '';
        var zaehler = '<span class="mcl-bd-zaehler" data-mcl-bdzahl="' + esc(schluessel) + '"' +
            (drin ? '' : ' hidden') + '>' + drin + '\u00d7</span>';
        var knoepfe =
            '<button type="button" class="mcl-bd-minus" data-mcl-bdminus="' + esc(schluessel) + '"' +
                ' aria-label="' + esc(T('binderMinus') + ': ' + name) + '" title="' + esc(T('binderMinus')) + '"' +
                (drin ? '' : ' hidden') + '>\u2212</button>' +
            '<button type="button" class="mcl-bd-plus" data-mcl-bdplus="' + esc(schluessel) + '"' +
                ' aria-label="' + esc(T('binderPlus') + ': ' + name + ', ' + menge + '\u00d7') + '"' +
                ' title="' + esc(T('binderPlusTitel')) + '">+\u202f' + menge + '\u00d7</button>';

        return '<li class="mcl-bd-karte" data-mcl-bdkarte="' + esc(schluessel) + '"' +
            ' data-gruppe="' + esc(k.gruppe || '') + '">' +
            '<div class="mcl-bd-bild">' + kopf + zaehler + aceMarke + '</div>' +
            '<div class="mcl-bd-txt"><b>' + esc(name) + '</b>' +
            '<span class="mcl-bd-druck">' + esc(druck) + '</span>' +
            '<span class="mcl-bd-zahlen">' + teile.join(' · ') + '</span>' +
            weitereMarke +
            timMarke +
            preis +
            '<span class="mcl-bd-knoepfe">' + knoepfe + '</span>' +
            '</div></li>';
    }

    function binderSortiert(karten, meta, wie, nurTim, tim) {
        var liste = karten.filter(function (k) {
            if (!(meta === 'alle' || (k.je_meta && k.je_meta[meta]))) return false;
            if (nurTim) return !!(tim && tim[binderDruck(k)]);
            return true;
        });
        var wert = function (k) {
            var w = (meta === 'alle') ? k.gesamt : k.je_meta[meta];
            return w ? (w.listen_mit_karte || 0) : 0;
        };
        if (wie === 'name') {
            liste.sort(function (a, b) {
                return String(a.name_de || a.name).localeCompare(String(b.name_de || b.name), 'de');
            });
        } else if (wie === 'preis') {
            liste.sort(function (a, b) {
                var pa = a.preis && a.preis.eur !== null ? a.preis.eur : -1;
                var pb = b.preis && b.preis.eur !== null ? b.preis.eur : -1;
                return pb - pa;
            });
        } else if (wie === 'standard') {
            /* Pokemon, Supporter, Item, Tool, Stadion, Spezial-Energie,
             * Basis-Energie — innerhalb einer Gruppe das Meistgespielte
             * zuerst, damit die Reihenfolge einer Deckliste entspricht. */
            liste.sort(function (a, b) {
                var d = binderGruppenRang(a) - binderGruppenRang(b);
                if (d) return d;
                d = wert(b) - wert(a);
                if (d) return d;
                return String(a.name_de || a.name).localeCompare(String(b.name_de || b.name), 'de');
            });
        } else {
            liste.sort(function (a, b) { return wert(b) - wert(a); });
        }
        return liste;
    }

    /* ---------- Mein Deck ------------------------------------------
     *
     * ANLASS (Betreiber, 25.09.2026): „Ich möchte insgesamt einfach
     * einfach und Komfortable mein finales Deck bauen mit allem was dazu
     * gehört, vor allem mit allen Informationen die ich brauche."
     *
     * Also: die Zahl gegen 60, die Gruppen wie in einer Deckliste, die
     * Regelverstoesse benannt (60 Karten, hoechstens eine ACE SPEC,
     * mindestens ein Basis-Pokemon), der Kartenwert — und der Weg
     * heraus: als Liste in die Ablage oder in „Meine Decks".
     */

    function binderDeckKarten(g) {
        var p = deckBauer();
        if (!p || typeof p.getDeck !== 'function') return [];
        var d = null;
        try { d = p.getDeck(); } catch (e) { d = null; }
        if (!d) {
            /* Der Profil-Reiter war noch nie offen — countOf() liest
             * dann aus dem Speicher und fuellt ihn. */
            try { p.countOf({ set: '', number: '' }); d = p.getDeck(); } catch (e) { d = null; }
        }
        return (d && Array.isArray(d.cards)) ? d.cards.filter(function (c) { return (c.count || 0) > 0; }) : [];
    }

    /* Die Mappe kennt Gruppe, Preis und ACE SPEC — der Deckbauer nicht.
     * Deshalb wird je Deckkarte in der Mappe nachgesehen. */
    function binderMappeIndex(g) {
        var d = binderDaten[g.id];
        var idx = {};
        ((d && d.karten) || []).forEach(function (k) { idx[binderDruck(k)] = k; });
        return idx;
    }

    /* Eine Deckkachel — dieselbe Form wie im Deckbauer der
     * Deck-Analyse (js/app-current-meta-analysis.js) und mit DENSELBEN
     * Klassen. Nichts davon ist hier neu gebaut; das Stilblatt dafuer
     * steht seit Langem in css/ui-components.css.
     *
     * ANLASS (Betreiber, 25.09.2026, Bildschirmaufnahme): „wenn ich jetzt
     * so eine zweite Karte reinsetze, dann wird die da unten drunter
     * gepackt, und damit zieht sich die Liste irgendwann total in die
     * Laenge. … Wir haben hier schon den Deck-Builder-Bereich, da haben
     * wir auch den Deckbau gebaut, um dann die Artworks austauschen zu
     * koennen und die Mengen veraendern zu koennen mit Plus und Minus —
     * den sollst du einfach in dem Bereich ‚Mein Deck' in der Masterclass
     * beim Cardbinder nachbauen."
     *
     * WARUM DIE FRUEHERE ZEILE NICHT ZU RETTEN WAR (gemessen 25.09.2026)
     * css/ui-components.css:18 setzt fuer JEDES Limitless-Kartenbild
     *     img[src*="digitaloceanspaces.com/tpci/"] { width: 100% }
     * Ein Attributselektor schlaegt eine einzelne Klasse. Das 28-px-Bild
     * der Deckzeile wurde deshalb 159 px breit, der Name bekam 10 px und
     * brach auf ein Zeichen je Zeile um. Die Klassen der Deckbauer-Kachel
     * haben dieses Problem nicht — sie leben seit Monaten neben genau
     * dieser Regel.
     */
    function binderDeckKachelHtml(e) {
        var c = e.c, k = e.k;
        var schluessel = String((c.set || '') + '-' + (c.number || '')).toUpperCase();
        var setCode = String(c.set || '').toUpperCase();
        var nummer = String(c.number || '');
        var name = c.name_de || c.name_en || schluessel;
        var nameEn = c.name_en || c.name_de || '';
        var bild = (k && k.bild) || bildAdresse(schluessel);
        var druckText = (setCode + ' ' + nummer).trim();

        /* Die Zahlen der Mappe, wenn die Karte darin steht. Ein Druck,
         * den nie jemand gespielt hat, steht nicht drin — dann bleiben
         * die Felder leer statt bei null. */
        var w = k && k.gesamt;
        var anteil = (w && w.anteil !== null && w.anteil !== undefined)
            ? '<div class="city-league-card-stats-mobile">' + binderZahl(w.anteil, 1) + '\u00a0%</div>' : '';
        var schnitt = (w && w.schnitt)
            ? '<div class="city-league-card-avg-mobile">\u00d8 ' + binderZahl(w.schnitt, 2) + 'x</div>' : '';
        /* Ohne Leerzeichen vor dem Euro — genau wie im Deckbauer. Mit
         * Leerzeichen schnitt der Preis bei schmalen Kacheln auf „,03"
         * ab (live gesehen am 25.09.2026). */
        var preis = (k && k.preis && k.preis.eur !== null && k.preis.eur !== undefined)
            ? binderZahl(k.preis.eur, 2) + '\u20ac' : '\u2013';

        var herz = '';
        try {
            if (typeof window.getWishlistBadgeHtml === 'function') {
                herz = window.getWishlistBadgeHtml(nameEn, setCode, nummer) || '';
            }
        } catch (err) { herz = ''; }

        var ace = k && k.ace
            ? '<div class="mcl-bd-dace" title="ACE SPEC — h\u00f6chstens eine je Deck">ACE</div>' : '';

        return '<div class="card-item city-league-card-item mcl-bd-dkachel"' +
            ' data-mcl-bddeckkarte="' + esc(schluessel) + '">' +
            '<div class="card-image-container city-league-card-image-container">' +
            (bild
                ? '<img class="city-league-card-image" loading="lazy" alt="' + esc(name) +
                  '" src="' + esc(bild) + '" data-mcl-bdzeigen="' + esc(schluessel) + '">'
                : '') +
            '<div class="city-league-card-badge city-league-card-badge-deck">' + (c.count || 0) + '</div>' +
            herz + ace +
            '<div class="card-info-bottom city-league-card-info-bottom">' +
            '<div class="card-info-text city-league-card-info-text">' +
            '<div class="city-league-card-title-mobile" title="' + esc(name) + '">' + esc(name) + '</div>' +
            '<div class="city-league-card-set-stats-row">' +
            '<div class="city-league-card-set-mobile">' + esc(druckText) + '</div>' + anteil + '</div>' +
            schnitt +
            '</div>' +
            '<div class="card-action-buttons city-league-card-action-buttons">' +
            '<div class="city-league-card-action-row">' +
            '<button type="button" class="city-league-card-action-btn city-league-card-remove-btn"' +
                ' data-mcl-bdminus="' + esc(schluessel) + '" title="' + esc(T('binderMinus')) +
                '" aria-label="' + esc(T('binderMinus') + ': ' + name) + '">\u2212</button>' +
            '<button type="button" class="city-league-card-action-btn city-league-card-rarity-btn"' +
                ' data-mcl-bddruck="' + esc(schluessel) + '" title="' + esc(T('binderDruck')) +
                '" aria-label="' + esc(T('binderDruck') + ': ' + name) + '">\u2605</button>' +
            '<button type="button" class="city-league-card-action-btn city-league-card-add-btn"' +
                ' data-mcl-bdplus1="' + esc(schluessel) + '" title="' + esc(T('binderPlusEine')) +
                '" aria-label="' + esc(T('binderPlusEine') + ': ' + name) + '">+</button>' +
            '</div>' +
            '<div class="city-league-card-action-row">' +
            (setCode && nummer
                ? '<button type="button" class="city-league-card-action-btn city-league-card-limitless-btn"' +
                  ' data-mcl-bdlimitless="' + esc(schluessel) + '" title="' + esc(T('binderLimitless')) + '">L</button>'
                : '<span></span>') +
            '<button type="button" class="city-league-card-action-btn city-league-card-proxy-btn"' +
                ' data-mcl-bdproxy="' + esc(schluessel) + '" title="' + esc(T('binderProxy')) + '">P</button>' +
            '<span class="city-league-card-action-btn city-league-card-market-btn">' + preis + '</span>' +
            '</div></div></div></div></div>';
    }

    function binderDeckHtml(g) {
        var karten = binderDeckKarten(g);
        var idx = binderMappeIndex(g);
        var gesamt = karten.reduce(function (s, c) { return s + (c.count || 0); }, 0);
        if (!gesamt) {
            return '<div class="mcl-bd-deck" data-mcl-bddeck="1">' +
                '<h4 class="mcl-bd-h">' + esc(T('binderDeck')) + '</h4>' +
                '<p class="mcl-status">' + esc(T('binderDeckLeer')) + '</p></div>';
        }

        var nachGruppe = {};
        var ace = 0, basis = 0, preis = 0, ohnePreis = 0;
        karten.forEach(function (c) {
            var schluessel = String((c.set || '') + '-' + (c.number || '')).toUpperCase();
            var k = idx[schluessel];
            var grp = (k && k.gruppe) || '';
            (nachGruppe[grp] || (nachGruppe[grp] = [])).push({ c: c, k: k });
            if (k && k.ace) ace += (c.count || 0);
            /* Basis-Pokemon zaehlen — fuer die Regel „ohne Basis-Pokemon
             * ist das Deck nicht spielbar". Der Bestand schreibt die Art
             * teils mit Elementbuchstabe davor (MBasic, DBasic, WBasic),
             * deshalb das Wortende statt der Gleichheit. „Basic Energy"
             * endet auf „energy" und faellt damit nicht hinein. */
            var typ = String((k && k.typ) || c.type || '').toLowerCase().trim();
            if (/(^|[a-z])basic$/.test(typ)) basis += (c.count || 0);
            if (k && k.preis && k.preis.eur !== null && k.preis.eur !== undefined) {
                preis += k.preis.eur * (c.count || 0);
            } else {
                ohnePreis += (c.count || 0);
            }
        });

        var reihen = BINDER_GRUPPEN.concat(['']).map(function (grp) {
            var eintraege = nachGruppe[grp];
            if (!eintraege || !eintraege.length) return '';
            eintraege.sort(function (a, b) {
                return (b.c.count || 0) - (a.c.count || 0) ||
                    String(a.c.name_de || a.c.name_en || '').localeCompare(
                        String(b.c.name_de || b.c.name_en || ''), 'de');
            });
            var summe = eintraege.reduce(function (s, e) { return s + (e.c.count || 0); }, 0);
            var titel = grp ? T(BINDER_GRUPPE_TXT[grp]) : T('binderGrpOhne');
            return '<h5 class="mcl-bd-grp">' + esc(titel) + ' <span>' + summe + '</span></h5>' +
                /* md statt sm: bei 90 px blieben dem Preis neben L und P
                 * nur rund 32 px, und „1,03€" wurde zu „,03". Das Deck
                 * ist die Arbeitsflaeche, nicht die Uebersicht. */
                '<div class="card-grid mcl-bd-dgitter" data-size="md">' +
                eintraege.map(binderDeckKachelHtml).join('') + '</div>';
        }).join('');

        var warnungen = [];
        if (gesamt !== 60) warnungen.push(T('binderWarn60'));
        if (ace > 1) warnungen.push(T('binderWarnAce'));
        if (!basis) warnungen.push(T('binderWarnBasis'));

        var summe = '<span class="mcl-bd-dsumme">' + esc(T('binderDeckSumme')) + ' ' +
            binderZahl(preis, 2) + '\u00a0\u20ac' +
            (ohnePreis ? ' <small>(' + ohnePreis + ' ' + esc(T('binderDeckOhnePreis')) + ')</small>' : '') +
            '</span>';

        return '<div class="mcl-bd-deck" data-mcl-bddeck="1">' +
            '<h4 class="mcl-bd-h">' + esc(T('binderDeck')) +
            ' <span class="mcl-bd-dzahl" data-voll="' + (gesamt === 60) + '">' + gesamt +
            ' ' + esc(T('binderDeckZahl')) + '</span></h4>' +
            (warnungen.length
                ? '<ul class="mcl-bd-dwarn">' + warnungen.map(function (x) {
                    return '<li>' + esc(x) + '</li>';
                }).join('') + '</ul>' : '') +
            reihen +
            summe +
            '<div class="mcl-bd-dknopf">' +
            '<input type="text" class="mcl-bd-dname-eingabe" data-mcl-bddeckname="1" ' +
            'placeholder="' + esc(T('binderDeckName')) + '" aria-label="' + esc(T('binderDeckName')) + '" ' +
            'value="' + esc(g.titel || '') + '">' +
            '<button type="button" class="mcl-btn" data-mcl-bdspeichern="1">' +
            esc(T('binderDeckSpeichern')) + '</button>' +
            '<button type="button" class="mcl-btn mcl-btn-leise" data-mcl-bdkopieren="1">' +
            esc(T('binderDeckKopieren')) + '</button>' +
            '<button type="button" class="mcl-btn mcl-btn-leise" data-mcl-bdleeren="1">' +
            esc(T('binderDeckLeeren')) + '</button>' +
            '</div></div>';
    }

    /* Die Deckliste im ueblichen Textformat — dieselbe Form, die der
     * Deckbauer beim Einfuegen wieder liest (parseDeckList). */
    function binderDeckText(g) {
        var karten = binderDeckKarten(g);
        var idx = binderMappeIndex(g);
        var zeilen = [];
        BINDER_GRUPPEN.concat(['']).forEach(function (grp) {
            karten.forEach(function (c) {
                var schluessel = String((c.set || '') + '-' + (c.number || '')).toUpperCase();
                var k = idx[schluessel];
                if (((k && k.gruppe) || '') !== grp) return;
                zeilen.push((c.count || 0) + ' ' + (c.name_en || c.name_de || '') +
                    ' ' + (c.set || '') + ' ' + (c.number || ''));
            });
        });
        return zeilen.join('\n');
    }

    function binderZeichnen(wurzel, g) {
        var ziel = wurzel.querySelector('[data-mcl-abschnitt="binder"]');
        if (!ziel) return;
        var d = binderDaten[g.id];
        if (!d) return;
        var stand = binderStand[g.id] || (binderStand[g.id] = binderStandNeu());
        timLesen(wurzel, g);
        var tim = binderTim[g.id] || {};
        var timJetzt = binderTimJetzt[g.id] || {};

        var metas = (d.metas || []);
        var chips = ['<button type="button" class="mcl-chip" data-mcl-bdmeta="alle" aria-pressed="' +
            (stand.meta === 'alle') + '">' + esc(T('binderAlle')) + '</button>'];
        metas.forEach(function (m) {
            chips.push('<button type="button" class="mcl-chip" data-mcl-bdmeta="' + esc(m.id) +
                '" aria-pressed="' + (stand.meta === m.id) + '"' +
                (m.hinweis ? ' title="' + esc(m.hinweis) + '"' : '') + '>' +
                esc(m.name || m.id) + ' <small>' + binderZahl(m.listen) + '</small></button>');
        });

        var sorten = [['standard', 'binderSortStandard'], ['nutzung', 'binderSortNutzung'],
            ['name', 'binderSortName'], ['preis', 'binderSortPreis']];
        var sortChips = sorten.map(function (p) {
            return '<button type="button" class="mcl-chip" data-mcl-bdsort="' + p[0] +
                '" aria-pressed="' + (stand.sort === p[0]) + '">' + esc(T(p[1])) + '</button>';
        }).join('');
        /* Der Tim-Schalter steht nur da, wenn es im Stueck ueberhaupt
         * Tim-Listen gibt — ein Filter, der nichts filtern kann, ist
         * eine Falle. */
        var timAnzahl = Object.keys(tim).length;
        if (timAnzahl) {
            sortChips += '<button type="button" class="mcl-chip mcl-chip-tim" data-mcl-bdtim="1"' +
                ' aria-pressed="' + (!!stand.nurTim) + '" title="' + esc(T('binderNurTimTitel')) + '">' +
                esc(T('binderNurTim')) + ' <small>' + timAnzahl + '</small></button>';
        }

        var liste = binderSortiert(d.karten || [], stand.meta, stand.sort, stand.nurTim, tim);
        var mitGruppen = (stand.sort === 'standard');
        var karten;
        if (!liste.length) {
            karten = '<p class="mcl-status">' + esc(T('binderKeine')) + '</p>';
        } else if (mitGruppen) {
            /* In der Standardsortierung bekommt jede Gruppe ihre
             * Ueberschrift mit Kartenzahl — so liest man eine Deckliste. */
            var stuecke = [];
            var letzte = null;
            var offen = false;
            liste.forEach(function (k) {
                var grp = k.gruppe || '';
                if (grp !== letzte) {
                    if (offen) stuecke.push('</ul>');
                    var anzahl = liste.filter(function (x) { return (x.gruppe || '') === grp; }).length;
                    var titel = grp ? T(BINDER_GRUPPE_TXT[grp]) : T('binderGrpOhne');
                    stuecke.push('<h5 class="mcl-bd-grp">' + esc(titel) +
                        ' <span>' + anzahl + '</span></h5><ul class="mcl-bd-gitter">');
                    offen = true;
                    letzte = grp;
                }
                stuecke.push(binderKarteHtml(k, stand.meta, tim, timJetzt));
            });
            if (offen) stuecke.push('</ul>');
            karten = stuecke.join('');
        } else {
            karten = '<ul class="mcl-bd-gitter">' + liste.map(function (k) {
                return binderKarteHtml(k, stand.meta, tim, timJetzt);
            }).join('') + '</ul>';
        }

        var mus = (d.matchups || []).slice(0, 24).map(function (m) {
            var s = m.siegquote;
            var klasse = s >= 55 ? 'gut' : (s <= 45 ? 'schlecht' : 'even');
            return '<li class="mcl-bd-mu" data-s="' + klasse + '"><span class="mcl-ampel"></span>' +
                '<span class="mcl-bd-mu-n">' + esc(m.gegner) + '</span>' +
                '<span class="mcl-bd-mu-z"><b>' + binderZahl(s, 1) + '\u00a0%</b>' +
                '<small>' + binderZahl(m.partien) + ' ' + esc(T('binderPartien')) + '</small></span></li>';
        }).join('');

        var turniere = (d.turniere || []).map(function (t) {
            return '<li class="mcl-bd-tn"><b>' + esc(t.turnier) + '</b>' +
                '<span>' + esc(t.datum) + ' · ' + binderZahl(t.spieler_deck) + '\u202f/\u202f' +
                binderZahl(t.spieler_gesamt) + ' ' + esc(T('binderSpieler')) +
                ' · ' + binderZahl(t.anteil, 2) + '\u00a0% · ' +
                esc(T('binderQuote')) + ' ' + binderZahl(t.siegquote, 1) + '\u00a0%</span></li>';
        }).join('');

        var quellen = [];
        (d.karten || []).forEach(function (k) {
            (k.quellen || []).forEach(function (q) {
                if (quellen.indexOf(q) < 0) quellen.push(q);
            });
        });

        ziel.innerHTML =
            '<p class="mcl-lead">' + esc(T('binderLead')) + '</p>' +
            '<div class="mcl-filter" data-mcl-bdleiste="meta">' + chips.join('') + '</div>' +
            '<div class="mcl-filter" data-mcl-bdleiste="sort">' + sortChips + '</div>' +
            binderDeckHtml(g) +
            karten +
            (mus ? '<h4 class="mcl-bd-h">' + esc(T('binderMatchups')) + '</h4>' +
                '<ul class="mcl-bd-mus">' + mus + '</ul>' : '') +
            (turniere ? '<h4 class="mcl-bd-h">' + esc(T('binderTurniere')) + '</h4>' +
                '<ul class="mcl-bd-tns">' + turniere + '</ul>' : '') +
            '<details class="mcl-bd-herkunft"><summary>' + esc(T('binderHerkunft')) + '</summary>' +
            '<p>' + esc(String((d._meta && d._meta.hinweis) || '')) + '</p>' +
            '<p class="mcl-sub">' + esc(quellen.join(' · ')) +
            (d._meta && d._meta.gebaut ? ' · ' + esc(d._meta.gebaut) : '') + '</p></details>';
    }

    function binderStandNeu() {
        /* Die Standardsortierung ist die Voreinstellung: der Betreiber
         * baut hier sein Deck, und eine Deckliste liest man in dieser
         * Reihenfolge. */
        return { meta: 'alle', sort: 'standard', nurTim: false };
    }

    /* Nach einer Deckaenderung nur das Noetige neu zeichnen: die Zaehler
     * an den Karten und der Deckblock. Das ganze Gitter neu zu setzen
     * (228 Karten) verliert die Bildlaufhoehe und laedt Bilder neu. */
    function binderZaehlerNachziehen(wurzel, g) {
        var ziel = wurzel.querySelector('[data-mcl-abschnitt="binder"]');
        if (!ziel) return;
        var idx = binderMappeIndex(g);
        ziel.querySelectorAll('[data-mcl-bdkarte]').forEach(function (li) {
            var schluessel = li.getAttribute('data-mcl-bdkarte');
            var k = idx[schluessel];
            var n = k ? binderImDeck(k) : 0;
            var zahl = li.querySelector('[data-mcl-bdzahl]');
            if (zahl) {
                zahl.textContent = n + '\u00d7';
                zahl.hidden = !n;
            }
            var minus = li.querySelector('[data-mcl-bdminus]');
            if (minus) minus.hidden = !n;
        });
        var alt = ziel.querySelector('[data-mcl-bddeck]');
        if (alt) {
            var huelle = document.createElement('div');
            huelle.innerHTML = binderDeckHtml(g);
            var neu = huelle.firstElementChild;
            if (neu) alt.parentNode.replaceChild(neu, alt);
        }
    }

    function binderMeldung(wurzel, text) {
        var ziel = wurzel.querySelector('[data-mcl-abschnitt="binder"]');
        if (!ziel) return;
        var alt = ziel.querySelector('.mcl-bd-meldung');
        if (alt) alt.remove();
        var p = document.createElement('p');
        p.className = 'mcl-bd-meldung';
        p.setAttribute('role', 'status');
        p.textContent = text;
        ziel.insertBefore(p, ziel.firstChild);
        setTimeout(function () { if (p.parentNode) p.remove(); }, 6000);
    }

    function binderPlus(wurzel, g, schluessel, wieViele) {
        var p = deckBauer();
        var k = binderMappeIndex(g)[schluessel];
        if (!p || !k) return;
        var stand = binderStand[g.id] || (binderStand[g.id] = binderStandNeu());
        var menge = wieViele || binderMenge(k, stand.meta);
        var erg = p.addCopies(binderDeckKarte(k), menge);
        if (erg && erg.grenze && !erg.hinzugefuegt) binderMeldung(wurzel, T('binderGrenze'));
        binderZaehlerNachziehen(wurzel, g);
    }

    function binderMinus(wurzel, g, schluessel) {
        var p = deckBauer();
        if (!p || typeof p.removeOne !== 'function') return;
        p.removeOne(schluessel);
        binderZaehlerNachziehen(wurzel, g);
    }

    /* ---------- Das Artwork tauschen -------------------------------
     *
     * ANLASS (Betreiber, 25.09.2026): „um dann die Artworks austauschen
     * zu koennen".
     *
     * Der Druckschalter ist gebaut und geprueft — js/app-cards-db.js,
     * openRaritySwitcher(). Er hat zwei Wege durch dasselbe Fenster:
     * mit Deck tauscht er die Stueckzahlen um, ohne Deck waehlt er nur
     * den ANZEIGE-Druck und meldet die Wahl als Ereignis
     * `ds:anzeigedruck`.
     *
     * Der Cardbinder nimmt den zweiten Weg (`anzeigeZiel = 'staples'`)
     * und macht den Tausch selbst. Das ist der kleine Eingriff: der
     * Schalter kennt drei Deckarten (cityLeague, currentMeta, pastMeta)
     * plus gespeicherte Profildecks, und eine vierte haette an fuenf
     * Stellen in zwei fremden Dateien eingetragen werden muessen — jede
     * davon eine Stelle, an der die drei vorhandenen Decks kaputtgehen
     * koennen. Das Ereignis gibt es schon; es wird hier nur gehoert.
     */
    function binderDruckSchalter(wurzel, g, schluessel) {
        var k = binderMappeIndex(g)[schluessel];
        var name = k && k.name;
        var teile = String(schluessel || '').split('-');
        if (!name) {
            /* Ein Druck, den die Mappe nicht fuehrt (frisch getauscht):
             * dann steht der Name im Deck. */
            var d = binderDeckKarten(g).filter(function (c) {
                return String((c.set || '') + '-' + (c.number || '')).toUpperCase() === schluessel;
            })[0];
            name = d && (d.name_en || d.name_de);
        }
        if (!name || typeof window.openRaritySwitcher !== 'function') return;
        binderDruckWartet[g.id] = schluessel;
        window.openRaritySwitcher(name, name + ' (' + teile[0] + ' ' + teile.slice(1).join('-') + ')',
            '', 'staples');
    }

    var binderDruckWartet = {};   /* guide-id -> Druck, dessen Schalter offen ist */
    var binderHoertDruck = false;

    function binderDruckZuhoeren() {
        if (binderHoertDruck) return;
        binderHoertDruck = true;
        document.addEventListener('ds:anzeigedruck', function (e) {
            var d = e && e.detail;
            if (!d || !d.set || !d.number) return;
            var buehne = document.getElementById('mclBuehne');
            if (!buehne || buehne.hidden) return;
            GUIDES.forEach(function (g) {
                if (!binderDruckWartet[g.id]) return;
                var alt = binderDruckWartet[g.id];
                delete binderDruckWartet[g.id];
                binderDruckTauschen(buehne, g, alt, String(d.set).toUpperCase(), String(d.number));
            });
        });
    }

    /* Alle Kopien des alten Drucks auf den neuen umziehen. Der Bestand
     * nennt das „Alle tauschen"; hier ist es dasselbe, nur fuer das eine
     * Deck des Cardbinders. */
    function binderDruckTauschen(wurzel, g, altSchluessel, neuSet, neuNummer) {
        var p = deckBauer();
        if (!p) return;
        var neuSchluessel = (neuSet + '-' + neuNummer).toUpperCase();
        if (neuSchluessel === altSchluessel) return;
        var deck = binderDeckKarten(g);
        var alt = deck.filter(function (c) {
            return String((c.set || '') + '-' + (c.number || '')).toUpperCase() === altSchluessel;
        })[0];
        if (!alt || !(alt.count > 0)) return;

        var wieViele = alt.count;
        for (var i = 0; i < wieViele; i++) p.removeOne(altSchluessel);
        var erg = p.addCopies({
            set: neuSet, number: String(neuNummer),
            name_en: alt.name_en, name_de: alt.name_de,
            type: alt.type, energy_type: alt.energy_type,
            image_url: '', is_japanese: false
        }, wieViele);

        binderZaehlerNachziehen(wurzel, g);
        var gelegt = (erg && erg.hinzugefuegt) || 0;
        binderMeldung(wurzel, T('binderDruckGetauscht') + ': ' + altSchluessel + ' \u2192 ' +
            neuSchluessel + ', ' + gelegt + '\u00d7' +
            (gelegt < wieViele ? ' \u2014 ' + T('binderDruckRest') : ''));
    }

    function binderSpeichern(wurzel, g) {
        var p = deckBauer();
        if (!p || typeof p.saveToAccount !== 'function') return;
        var feld = wurzel.querySelector('[data-mcl-bddeckname]');
        var name = (feld && feld.value) || g.titel || '';
        var erg = p.saveToAccount(name);
        if (erg && erg.ok) {
            binderMeldung(wurzel, T('binderGespeichert'));
        } else if (erg && erg.grund === 'kein-konto') {
            binderMeldung(wurzel, T('binderNichtAngemeldet'));
        } else {
            binderMeldung(wurzel, T('binderDeckLeer'));
        }
    }

    function binderKopieren(wurzel, g) {
        var text = binderDeckText(g);
        if (!text) { binderMeldung(wurzel, T('binderDeckLeer')); return; }
        var fertig = function () { binderMeldung(wurzel, T('binderDeckKopieren') + ' \u2713'); };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(fertig, function () { fertig(); });
                return;
            }
        } catch (e) { /* Rueckfall unten */ }
        fertig();
    }

    function binderLeeren(wurzel, g) {
        var p = deckBauer();
        if (!p || typeof p.clearDeck !== 'function') return;
        p.clearDeck();
        binderZaehlerNachziehen(wurzel, g);
    }

    /* Wer das Deck anderswo aendert (Deckbauer im Profil), findet hier
     * dieselben Zahlen vor. Ein einziger Zuhoerer fuer die ganze Seite:
     * je geoeffneter Masterclass einen anzuhaengen wuerde sie stapeln. */
    var binderHoertZu = false;
    function binderZuhoeren() {
        if (binderHoertZu) return;
        binderHoertZu = true;
        document.addEventListener('profileDeckChanged', function () {
            var buehne = document.getElementById('mclBuehne');
            if (!buehne || buehne.hidden) return;
            var wurzel = buehne.querySelector('[data-mcl-abschnitt="binder"]');
            if (!wurzel) return;
            GUIDES.forEach(function (g) {
                if (binderDaten[g.id]) binderZaehlerNachziehen(buehne, g);
            });
        });
    }

    function binderOeffnen(wurzel, g) {
        var ziel = wurzel.querySelector('[data-mcl-abschnitt="binder"]');
        if (!ziel) return;
        binderZuhoeren();
        binderDruckZuhoeren();
        if (binderDaten[g.id]) { binderZeichnen(wurzel, g); return; }
        ziel.innerHTML = '<p class="mcl-status">' + esc(T('binderLaden')) + '</p>';
        binderHolen(g.id).then(function () {
            binderZeichnen(wurzel, g);
        }).catch(function (err) {
            console.warn('[DsMasterclass] Cardbinder ' + g.id + ' nicht geladen:', err && err.message);
            /* Kein erfundener Inhalt: was fehlt, wird benannt. */
            ziel.innerHTML = '<p class="mcl-status">' + esc(T('binderFehlt')) + '</p>';
        });
    }

    /* Haengt Knopf und Abschnitt an das geladene Stueck. Laeuft genau
     * einmal je geoeffneter Masterclass. */
    function binderEinhaengen(wurzel, g) {
        var nav = wurzel.querySelector('.mcl-bereiche');
        if (!nav || nav.querySelector('[data-mcl-ziel="binder"]')) return;
        var knopf = document.createElement('button');
        knopf.type = 'button';
        knopf.className = 'mcl-bereich';
        knopf.setAttribute('data-mcl-ziel', 'binder');
        knopf.setAttribute('aria-pressed', 'false');
        knopf.textContent = T('binder');
        nav.appendChild(knopf);

        var abschnitte = wurzel.querySelectorAll('[data-mcl-abschnitt]');
        var letzter = abschnitte[abschnitte.length - 1];
        if (!letzter) return;
        var block = document.createElement('div');
        block.className = 'mcl-abschnitt mcl-bd';
        block.setAttribute('data-mcl-abschnitt', 'binder');
        block.hidden = true;
        letzter.parentNode.insertBefore(block, letzter.nextSibling);
    }

    /* ---------- Verdrahtung im geladenen Stueck ---------- */

    function bereichWechseln(wurzel, ziel) {
        /* Wer den Bereich wechselt, will nicht weiter vorgelesen bekommen,
         * was er nicht mehr sieht. */
        if (ziel !== 'doku') vlStopp(wurzel);
        wurzel.querySelectorAll('[data-mcl-abschnitt]').forEach(function (a) {
            a.hidden = a.getAttribute('data-mcl-abschnitt') !== ziel;
        });
        wurzel.querySelectorAll('[data-mcl-ziel]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-mcl-ziel') === ziel));
        });
    }

    function matchupFilter(wurzel, wert) {
        wurzel.querySelectorAll('.mcl-mu').forEach(function (m) {
            m.hidden = !(wert === 'alle' || m.getAttribute('data-s') === wert);
        });
        wurzel.querySelectorAll('[data-mcl-filter]').forEach(function (c) {
            c.setAttribute('aria-pressed', String(c.getAttribute('data-mcl-filter') === wert));
        });
    }

    function listeWechseln(wurzel, i) {
        wurzel.querySelectorAll('[data-mcl-listenblock]').forEach(function (b) {
            b.hidden = b.getAttribute('data-mcl-listenblock') !== String(i);
        });
        wurzel.querySelectorAll('[data-mcl-liste]').forEach(function (c) {
            c.setAttribute('aria-pressed', String(c.getAttribute('data-mcl-liste') === String(i)));
        });
    }

    /* Dieselbe Adresse wie im Bestand (js/app-anti-tech.js) und wie im
     * erzeugten Stueck — aus "SET-NUM" wird die Limitless-Bildadresse. */
    function bildAdresse(druck) {
        var t = String(druck || '').split('-');
        if (t.length !== 2 || !t[0] || !t[1]) return '';
        var n = t[1];
        while (n.length < 3) n = '0' + n;
        return 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/' + t[0] + '/' + t[0] + '_' + n + '_R_EN_LG.png';
    }

    function detailBild(knopf) {
        var hoch = knopf.dataset.druckHoch;
        return hoch && hoch !== knopf.dataset.druck ? bildAdresse(hoch) : '';
    }

    /* Bilder vom Limitless-CDN vergiften das Canvas: die Adresse schickt
     * kein Access-Control-Allow-Origin, und toBlob() wirft danach. Der
     * Bestand loest das seit dem Deckbauer ueber den weserv-Proxy
     * (js/app-deck-builder.js, js/ds-share.js) — dieselbe Loesung hier,
     * ueber DsShare, wenn es geladen ist. */
    function corsAdresse(url) {
        try {
            if (window.DsShare && window.DsShare._internals
                && typeof window.DsShare._internals.corsUrl === 'function') {
                return window.DsShare._internals.corsUrl(url);
            }
        } catch (e) { /* egal */ }
        if (!url || url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return url;
        try {
            if (new URL(url).origin === location.origin) return url;
        } catch (e) { return url; }
        return 'https://images.weserv.nl/?url=' + encodeURIComponent(url);
    }

    function ladeBild(url) {
        return new Promise(function (fertig) {
            var fertigGemeldet = false;
            var bild = new Image();
            bild.crossOrigin = 'anonymous';
            var uhr = setTimeout(function () {
                if (fertigGemeldet) return;
                fertigGemeldet = true;
                fertig(null);
            }, 10000);
            bild.onload = function () {
                if (fertigGemeldet) return;
                fertigGemeldet = true;
                clearTimeout(uhr);
                fertig(bild);
            };
            bild.onerror = function () {
                if (fertigGemeldet) return;
                fertigGemeldet = true;
                clearTimeout(uhr);
                fertig(null);
            };
            bild.src = url;
        });
    }

    /* Wie viele Spalten? Feste Breite 1200 px — ein Bild mit
     * vorhersagbarer Groesse liest sich auf Discord besser als eine
     * Bildschirmaufnahme. Die Spaltenzahl richtet sich nach der Zahl der
     * verschiedenen Karten, damit die letzte Zeile nicht als Rest
     * dasteht. */
    function gitter(anzahl) {
        var beste = null;
        for (var spalten = 5; spalten <= 8; spalten++) {
            var zeilen = Math.ceil(anzahl / spalten);
            var rest = anzahl % spalten || spalten;
            var kb = Math.floor((1200 - 2 * 28 - 10 * (spalten - 1)) / spalten);
            /* Die VOLLE letzte Zeile schlaegt die groessere Kachel: 21
             * Karten auf 5 Spalten enden mit EINER Kachel, und die liest
             * sich wie ein Rest, obwohl sie zur Liste gehoert. Auf 7
             * Spalten sind es drei volle Zeilen. Dieselbe Abwaegung wie
             * in js/ds-share.js gitterMasse(). */
            var wert = (rest / spalten) * 1000 + kb;
            if (!beste || wert > beste.wert) {
                beste = { spalten: spalten, zeilen: zeilen, kb: kb,
                          kh: Math.round(kb * 342 / 245), wert: wert };
            }
        }
        return beste;
    }

    async function listeKopieren(wurzel, knopf) {
        var i = knopf.getAttribute('data-mcl-kopieren');
        var block = wurzel.querySelector('[data-mcl-listenblock="' + i + '"]');
        if (!block) return;
        var kacheln = [].slice.call(block.querySelectorAll('.mcl-kk'));
        if (!kacheln.length) return;

        var vorher = knopf.textContent;
        knopf.disabled = true;
        knopf.textContent = T('laden');

        var g = gitter(kacheln.length);
        var PAD = 28, GAP = 10, KOPF = 104, FUSS = 46;
        var breite = 1200;
        var hoehe = PAD + KOPF + g.zeilen * g.kh + (g.zeilen - 1) * GAP + FUSS + PAD;
        var c = document.createElement('canvas');
        c.width = breite;
        c.height = hoehe;
        var ctx = c.getContext('2d');
        var sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

        ctx.fillStyle = '#12101B';
        ctx.fillRect(0, 0, breite, hoehe);

        var name = block.getAttribute('data-mcl-listenname') || '';
        var summe = kacheln.reduce(function (s, k) { return s + (Number(k.dataset.n) || 0); }, 0);
        ctx.fillStyle = '#F4F1FF';
        ctx.font = '700 34px ' + sans;
        ctx.textBaseline = 'top';
        ctx.fillText(name, PAD, PAD);
        ctx.fillStyle = '#A79FC4';
        ctx.font = '500 20px ' + sans;
        ctx.fillText('Mega-Stalobor-ex · ' + summe + ' Karten · ' + kacheln.length + ' verschiedene',
            PAD, PAD + 44);

        /* Alle Bilder GLEICHZEITIG. Nacheinander waeren es bei 26
         * Karten 26 Umlaeufe — auf dem Handy im Zug ist das der
         * Unterschied zwischen zwei Sekunden und einer halben Minute,
         * und eine haengende Adresse haelt bei 10 s Zeitgrenze alles
         * dahinter auf. */
        var bilder = await Promise.all(kacheln.map(function (kachel) {
            var im = kachel.querySelector('img');
            var quelle = im ? (im.currentSrc || im.getAttribute('src')) : '';
            return quelle ? ladeBild(corsAdresse(quelle)) : Promise.resolve(null);
        }));

        for (var k = 0; k < kacheln.length; k++) {
            var sp = k % g.spalten, ze = Math.floor(k / g.spalten);
            var x = PAD + sp * (g.kb + GAP);
            var y = PAD + KOPF + ze * (g.kh + GAP);
            ctx.save();
            ctx.beginPath();
            var r = 10;
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + g.kb, y, x + g.kb, y + g.kh, r);
            ctx.arcTo(x + g.kb, y + g.kh, x, y + g.kh, r);
            ctx.arcTo(x, y + g.kh, x, y, r);
            ctx.arcTo(x, y, x + g.kb, y, r);
            ctx.closePath();
            ctx.clip();
            if (bilder[k]) {
                ctx.drawImage(bilder[k], x, y, g.kb, g.kh);
            } else {
                ctx.fillStyle = '#241E33';
                ctx.fillRect(x, y, g.kb, g.kh);
                ctx.fillStyle = '#A79FC4';
                ctx.font = '600 15px ' + sans;
                ctx.textAlign = 'center';
                ctx.fillText(kacheln[k].dataset.de || '', x + g.kb / 2, y + g.kh / 2);
                ctx.textAlign = 'left';
            }
            ctx.restore();
            /* Die Anzahl als Muenze unten auf der Kachel — dieselbe Stelle
             * wie in der Seite, damit das Bild und die Liste gleich
             * gelesen werden. */
            var rr = Math.max(15, Math.round(g.kb * 0.13));
            var mx = x + g.kb / 2, my = y + g.kh - rr - 6;
            ctx.beginPath();
            ctx.arc(mx, my, rr, 0, Math.PI * 2);
            ctx.fillStyle = '#E8833A';
            ctx.fill();
            ctx.fillStyle = '#1A1020';
            ctx.font = '700 ' + Math.round(rr * 1.15) + 'px ' + sans;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(kacheln[k].dataset.n || ''), mx, my + 1);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
        }

        ctx.fillStyle = '#6F6890';
        ctx.font = '500 18px ' + sans;
        ctx.fillText('thedipidis.app · Masterclass Mega-Stalobor-ex', PAD, hoehe - PAD - 18);

        knopf.disabled = false;
        knopf.textContent = vorher;

        var datei = (name.replace(/[^\wÄÖÜäöüß]+/g, '-').replace(/^-+|-+$/g, '') || 'Liste') + '.png';
        if (window.DsBildvorschau && typeof window.DsBildvorschau.zeige === 'function') {
            return window.DsBildvorschau.zeige(c, {
                dateiname: datei, titel: T('kopiert'), alt: name
            });
        }
        /* Ohne das Vorschaumodul bleibt der Download — lieber eine Datei
         * als ein Knopf, der nichts tut. */
        c.toBlob(function (blob) {
            if (!blob) return;
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = datei;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }, 'image/png');
    }

    function kartenDetail(knopf) {
        var alt = document.getElementById('mclLupe');
        if (alt) alt.remove();
        var bild = knopf.querySelector('img');
        var d = document.createElement('div');
        d.id = 'mclLupe';
        d.className = 'mcl-lupe';
        d.setAttribute('role', 'dialog');
        d.setAttribute('aria-modal', 'true');
        d.innerHTML = '<div class="mcl-lupe-inhalt">' +
            '<div class="mcl-lupe-kopf">' +
            /* Im Detail haengt der hochwertigste Druck derselben Karte,
              * in der Liste der neueste guenstige: die Liste wird
              * verschickt und nachgebaut, das Detail angesehen
              * (Hausi, 22.09.2026). Faellt data-druck-hoch weg, bleibt
              * das Bild der Kachel. */
            (bild ? '<img src="' + esc(detailBild(knopf) || bild.getAttribute('src')) + '" alt="">' : '') +
            '<div><h5>' + esc(knopf.dataset.de) + '</h5>' +
            '<p class="mcl-lupe-en">' + esc(knopf.dataset.en) + '</p>' +
            (knopf.dataset.druck ? '<p class="mcl-lupe-druck">' + esc(knopf.dataset.druck) + '</p>' : '') +
            (knopf.dataset.druckHoch && knopf.dataset.druckHoch !== knopf.dataset.druck
                ? '<p class="mcl-lupe-druck mcl-fein">' + esc(T('sammlerdruck')) + ': '
                  + esc(knopf.dataset.druckHoch) + '</p>' : '') +
            '<p class="mcl-lupe-druck mcl-fein">' + esc(knopf.dataset.n) + ' ' + esc(T('inDieser')) + '</p>' +
            '</div></div>' +
            (knopf.dataset.warum ? '<div class="mcl-lupe-block"><strong>' + esc(T('warum')) + '</strong>' +
                markiere(knopf.dataset.warum) + '</div>' : '') +
            /* Der deutsche Kartentext steht oben, der englische darunter:
              * Hausi hat die Karten auf Deutsch in der Hand und liest die
              * Listen auf Englisch. Bis zum 21.09.2026 gab es hier nur den
              * englischen — in einer Aufbereitung, die es auf Deutsch geben
              * sollte. */
            (knopf.dataset.text ? '<div class="mcl-lupe-block"><strong>' + esc(T('kartentext')) + '</strong>' +
                esc(knopf.dataset.text) + '</div>' : '') +
            (knopf.dataset.textEn ? '<div class="mcl-lupe-block mcl-fein"><strong>' + esc(T('kartentextEn')) + '</strong>' +
                esc(knopf.dataset.textEn) + '</div>' : '') +
            '<button type="button" class="mcl-lupe-zu">' + esc(T('schliessen')) + '</button></div>';
        document.body.appendChild(d);
        d.addEventListener('click', function (e) {
            if (e.target === d || e.target.classList.contains('mcl-lupe-zu')) d.remove();
        });
    }

    /* Nur die beiden Auszeichnungen, die in den Begruendungen vorkommen.
     * Alles andere wird maskiert — der Text kommt aus einem data-Attribut
     * und darf kein HTML einschleusen. */
    function markiere(roh) {
        return esc(roh)
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.+?)\*/g, '<i>$1</i>');
    }

    /* ── Vorlesen ─────────────────────────────────────────────────
     *
     * BESTELLUNG (23.09.2026): "Ein Knopf im Ausarbeitungs-Bereich, der
     * vorliest, wo du gerade bist, mit Pause und Tempo." Hausi hoert die
     * Masterclass beim Radfahren.
     *
     * Die Sprachausgabe steckt im Browser (Web Speech API) — kein
     * fremder Dienst, keine Datei, und auf dem Handy nimmt sie die
     * Stimme, die dort eingestellt ist. Vier Dinge, die dabei
     * erfahrungsgemaess schieflaufen und hier geloest sind:
     *
     *   1. LANGE TEXTE brechen ab. Chrome hoert nach gut 15 Sekunden auf
     *      zu sprechen, wenn eine einzelne Aeusserung zu lang ist.
     *      Deshalb wird Block fuer Block gesprochen, jeder Block in
     *      Stuecken an Satzgrenzen, und waehrend des Sprechens haelt ein
     *      Taktgeber die Warteschlange mit resume() wach.
     *   2. WO BIN ICH? Vorgelesen wird ab dem ersten Block, der im Bild
     *      steht — nicht von vorn. Der laufende Block wird markiert und
     *      nachgezogen, sonst sucht man beim Weiterlesen die Stelle.
     *   3. DIE SUCHE blendet Bloecke aus. Ausgeblendete werden
     *      uebersprungen; sonst liest die Stimme, was nicht dasteht.
     *   4. GESPROCHEN IST NICHT GESCHRIEBEN. "Mega-Stalobor-ex" wurde
     *      als "Mega Stalobor, Ex" mit Pause gelesen, die englischen
     *      Namen in Klammern zerhacken jeden Satz, Druckcodes wie
     *      "PBL-46" sind im Ton Buchstabensalat (Hausi, 23.09.2026,
     *      nach zehn Minuten Hoeren). Der Text auf dem Bildschirm bleibt
     *      wie er ist; nur was gesprochen wird, wird geglaettet.
     */

    var vl = { bloecke: [], stuecke: [], i: 0, laeuft: false, tempo: 1, takt: null };

    function sprache() {
        return window.speechSynthesis || null;
    }

    /* Nur, was auf dem Bildschirm steht: ausgeblendete Bloecke und leere
     * Huellen faellt die Stimme nicht an. */
    function vorleseBloecke(doku) {
        return Array.prototype.slice.call(doku.children).filter(function (b) {
            return !b.hidden && String(b.textContent || '').trim().length > 1;
        });
    }

    /* Welche Klammer ist ein englischer Kartenname? Nicht geraten,
     * sondern nachgesehen: die Kartenkacheln desselben Stuecks tragen
     * ihren englischen Namen in data-en. Eine Heuristik ueber Gross- und
     * Kleinschreibung wuerde "(Metallmacher)" genauso wegwerfen wie
     * "(Beldum)" — und die deutsche Erklaerung ist genau das, was
     * bleiben soll. */
    function englischeNamen(wurzel) {
        var aus = {};
        if (!wurzel || !wurzel.querySelectorAll) return aus;
        Array.prototype.forEach.call(wurzel.querySelectorAll('[data-en]'), function (k) {
            var n = String(k.getAttribute('data-en') || '').trim().toLowerCase();
            if (n) aus[n] = true;
        });
        return aus;
    }

    /* Der Text eines Blocks, mit MARKE um kursive Stellen. Die
     * Ausarbeitung haelt eine Konvention durch, und die entscheidet
     * ueber die Klammern:
     *
     *     Grolldra (Dreepy)                 deutsch, dahinter englisch
     *     <em>Metal Maker</em> (Metallmacher)  englisch, dahinter deutsch
     *
     * Beide sehen als reiner Text gleich aus. Im Markup nicht: die
     * englischen Attackennamen stehen kursiv. Ohne diese Marke wuerde
     * die Glaettung die deutsche Erklaerung wegwerfen — also genau das,
     * was bleiben soll. */
    var KURSIV_AUF = '\u0001', KURSIV_ZU = '\u0002';

    /* Tabellen sind der Sonderfall. GEMESSEN 25.09.2026 in der
     * ausgelieferten Ausarbeitung: fuenf Tabellen, vier davon
     * Decklisten in der Form
     *
     *     Anzahl | Deutsch | English [| Druck]
     *
     * und eine zweispaltige (Karte | Wofuer). Wer die ungefiltert
     * vorliest, hoert jede Zeile doppelt — "4 Tanhel Beldum, 4 Metang
     * Metang" — und dazu Setnummern. Gehoert wurde genau das am
     * 25.09.2026 auf der Seite; es war der Grund fuer diese Regel.
     *
     * Also: die ersten ZWEI Zellen. Nicht die erste, weil die
     * zweispaltige Tabelle in beiden Spalten Inhalt hat. Reine
     * Kopfzeilen (nur TH) fallen weg, THEAD ebenso. */
    function sprechZellen(tr) {
        var zellen = Array.prototype.filter.call(tr.children || [], function (c) {
            return c.tagName === 'TD' || c.tagName === 'TH';
        });
        if (!zellen.length) return null;
        var nurKopf = zellen.every(function (c) { return c.tagName === 'TH'; });
        return nurKopf ? null : zellen.slice(0, 2);
    }

    function sprechRoh(el) {
        var aus = '';
        (function gehe(knoten) {
            Array.prototype.forEach.call(knoten.childNodes || [], function (n) {
                if (n.nodeType === 3) { aus += n.nodeValue; return; }
                if (n.nodeType !== 1) return;
                if (n.tagName === 'THEAD') return;
                if (n.tagName === 'TABLE') { gehe(n); aus += '. '; return; }
                if (n.tagName === 'TR') {
                    var zellen = sprechZellen(n);
                    if (!zellen) return;
                    zellen.forEach(function (c) { gehe(c); aus += ' '; });
                    aus += ', ';
                    return;
                }
                var kursiv = n.tagName === 'EM' || n.tagName === 'I';
                if (kursiv) aus += KURSIV_AUF;
                gehe(n);
                if (kursiv) aus += KURSIV_ZU;
            });
        })(el);
        return aus;
    }

    /* Ist der Klammerinhalt ein englischer Name? Erst die Kartenliste
     * des Stuecks (belegt), dann die Form: ein bis drei Woerter, jedes
     * gross geschrieben, keine Ziffern. "Grolldra (Dreepy)" faellt so
     * weg, "(und zwar zwei Stueck)" bleibt. */
    function englischeKlammer(inhalt, bekannt) {
        var kern = inhalt.replace(/,.*$/, '').trim();
        if (!kern) return false;
        if (bekannt[kern.toLowerCase()]) return true;
        if (/\d/.test(kern)) return false;
        var woerter = kern.split(/\s+/);
        if (woerter.length > 3) return false;
        return woerter.every(function (w) { return /^[A-ZÄÖÜ][\wÄÖÜäöüß'\u2019-]*$/.test(w); });
    }

    /* Aus geschriebenem Text gesprochenen machen. */
    function sprechText(roh, namen) {
        var bekannt = namen || {};
        var t = String(roh || '');
        t = t.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, ' ');       /* Zeitmarken */
        t = t.replace(/([A-Za-zÄÖÜäöüß])-(ex|EX)\b/g, '$1ex');     /* Stalobor-ex */
        t = t.replace(/\bMega-(?=[A-ZÄÖÜ])/g, 'Mega ');
        t = t.replace(/(\u0002\s*)?\(([^()]*)\)/g, function (ganz, nachKursiv, inhalt) {
            if (/\b[A-Z0-9]{2,4}-\d+\b/.test(inhalt)) return nachKursiv || ' ';  /* Druckcode */
            if (nachKursiv) return ganz;          /* deutsche Erklaerung: bleibt */
            return englischeKlammer(inhalt, bekannt) ? ' ' : ganz;
        });
        t = t.split(KURSIV_AUF).join('').split(KURSIV_ZU).join('');
        /* Wo eine Klammer herausfaellt, bleibt sonst ein Leerzeichen vor
         * dem Satzzeichen stehen — die Stimme macht daraus eine Pause
         * mitten im Satzende. */
        t = t.replace(/\s+([,.;:!?])/g, '$1');
        return t.replace(/\s{2,}/g, ' ').trim();
    }

    /* In Stuecke an Satzgrenzen: eine einzelne lange Aeusserung bricht
     * in Chrome mitten im Satz ab. */
    function sprechStuecke(text, hoechstens) {
        var max = hoechstens || 220;
        var saetze = String(text || '').match(/[^.!?…]+[.!?…]*\s*/g) || [];
        var aus = [], jetzt = '';
        saetze.forEach(function (satz) {
            if ((jetzt + satz).length > max && jetzt.trim()) { aus.push(jetzt.trim()); jetzt = ''; }
            while (satz.length > max) {                  /* Satz ohne Punkt */
                var schnitt = satz.lastIndexOf(' ', max);
                if (schnitt < 40) schnitt = max;
                aus.push(satz.slice(0, schnitt).trim());
                satz = satz.slice(schnitt);
            }
            jetzt += satz;
        });
        if (jetzt.trim()) aus.push(jetzt.trim());
        return aus.filter(function (s) { return s.length; });
    }

    /* Ab wo? Der erste Block, dessen Ende noch im Bild ist. */
    function ersterSichtbarer(bloecke, oben) {
        for (var i = 0; i < bloecke.length; i++) {
            var r = bloecke[i].getBoundingClientRect();
            if (r.bottom > (oben || 0)) return i;
        }
        return 0;
    }

    function deutscheStimme() {
        var s = sprache();
        var alle = (s && s.getVoices) ? s.getVoices() : [];
        var de = alle.filter(function (v) { return /^de/i.test(v.lang || ''); });
        return de.length ? de[0] : null;
    }

    function vlMarkiere(el) {
        var wurzel = document.getElementById('mclDoku');
        if (!wurzel) return;
        Array.prototype.forEach.call(wurzel.querySelectorAll('.mcl-vl-jetzt'), function (b) {
            b.classList.remove('mcl-vl-jetzt');
        });
        if (!el) return;
        el.classList.add('mcl-vl-jetzt');
        var r = el.getBoundingClientRect();
        if (r.top < 60 || r.bottom > (window.innerHeight || 800) - 40) {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
        }
    }

    function vlKnoepfe(wurzel, zustand) {
        var start = wurzel.querySelector('[data-mcl-vl="start"]');
        var stopp = wurzel.querySelector('[data-mcl-vl="stopp"]');
        if (start) {
            start.textContent = zustand === 'laeuft' ? '⏸ ' + T('pause')
                : zustand === 'pause' ? '▶ ' + T('weiter')
                : '▶ ' + T('vorlesen');
            start.setAttribute('aria-pressed', String(zustand === 'laeuft'));
        }
        if (stopp) stopp.hidden = zustand === 'aus';
    }

    function vlWeiterSprechen(wurzel) {
        var s = sprache();
        if (!s || !vl.laeuft) return;
        if (vl.i >= vl.stuecke.length) { vlStopp(wurzel); return; }
        var stueck = vl.stuecke[vl.i];
        vlMarkiere(stueck.el);
        var u = new window.SpeechSynthesisUtterance(stueck.text);
        u.lang = 'de-DE';
        u.rate = vl.tempo;
        var stimme = deutscheStimme();
        if (stimme) u.voice = stimme;
        u.onend = function () { vl.i++; vlWeiterSprechen(wurzel); };
        u.onerror = function () { vl.i++; vlWeiterSprechen(wurzel); };
        s.speak(u);
    }

    function vlStart(wurzel) {
        var s = sprache();
        var doku = wurzel.querySelector('#mclDoku');
        if (!s || !doku) return;
        s.cancel();
        var bloecke = vorleseBloecke(doku);
        var ab = ersterSichtbarer(bloecke, 70);
        var namen = englischeNamen(wurzel);
        vl.stuecke = [];
        bloecke.slice(ab).forEach(function (el) {
            sprechStuecke(sprechText(sprechRoh(el), namen)).forEach(function (text) {
                vl.stuecke.push({ el: el, text: text });
            });
        });
        vl.i = 0;
        vl.laeuft = true;
        vlKnoepfe(wurzel, 'laeuft');
        vlTaktAn(wurzel);
        vlWeiterSprechen(wurzel);
    }

    /* Chrome haelt die Warteschlange nur an, wenn niemand hinsieht:
     * ohne diesen Taktgeber verstummt sie nach gut 15 Sekunden. */
    function vlTaktAn(wurzel) {
        vlTaktAus();
        vl.takt = window.setInterval(function () {
            var s = sprache();
            if (!s || !vl.laeuft) return;
            if (s.speaking && !s.paused) { s.pause(); s.resume(); }
        }, 9000);
    }

    function vlTaktAus() {
        if (vl.takt) { window.clearInterval(vl.takt); vl.takt = null; }
    }

    function vlStopp(wurzel) {
        var s = sprache();
        if (s) s.cancel();
        vl.laeuft = false;
        vl.stuecke = [];
        vl.i = 0;
        vlTaktAus();
        vlMarkiere(null);
        if (wurzel) vlKnoepfe(wurzel, 'aus');
    }

    function vlUmschalten(wurzel) {
        var s = sprache();
        if (!s) return;
        if (!vl.laeuft) { vlStart(wurzel); return; }
        if (s.paused) { s.resume(); vlKnoepfe(wurzel, 'laeuft'); return; }
        s.pause();
        vlKnoepfe(wurzel, 'pause');
    }

    /* Tempo waehrend des Lesens: die laufende Aeusserung traegt ihre Rate
     * schon in sich, also wird ab dem naechsten Stueck neu angesetzt. */
    function vlTempo(wurzel, wert) {
        var zahl = Number(wert);
        vl.tempo = (zahl > 0.4 && zahl < 3) ? zahl : 1;
        try { window.localStorage.setItem('mclVorleseTempo', String(vl.tempo)); } catch (e) { }
        if (!vl.laeuft) return;
        var s = sprache();
        if (s) s.cancel();
        vlWeiterSprechen(wurzel);
    }

    function vorleserBauen(wurzel) {
        var zeile = wurzel.querySelector('.mcl-suchzeile');
        if (!zeile || zeile.querySelector('[data-mcl-vl]')) return;
        var gespeichert = 1;
        try { gespeichert = Number(window.localStorage.getItem('mclVorleseTempo')) || 1; } catch (e) { }
        vl.tempo = (gespeichert > 0.4 && gespeichert < 3) ? gespeichert : 1;
        var leiste = document.createElement('div');
        leiste.className = 'mcl-vorleser';
        if (!sprache()) {
            leiste.innerHTML = '<span class="mcl-fein">' + esc(T('keineStimme')) + '</span>';
            zeile.appendChild(leiste);
            return;
        }
        var tempi = [0.8, 1, 1.2, 1.5, 1.8];
        leiste.innerHTML =
            '<button type="button" class="mcl-vl-knopf" data-mcl-vl="start" aria-pressed="false">▶ '
            + esc(T('vorlesen')) + '</button>'
            + '<button type="button" class="mcl-vl-knopf mcl-vl-stopp" data-mcl-vl="stopp" hidden>■ '
            + esc(T('stopp')) + '</button>'
            + '<label class="mcl-vl-tempo">' + esc(T('tempo'))
            + ' <select data-mcl-vl="tempo">'
            + tempi.map(function (t) {
                return '<option value="' + t + '"' + (t === vl.tempo ? ' selected' : '') + '>'
                    + String(t).replace('.', ',') + '×</option>';
            }).join('')
            + '</select></label>';
        zeile.appendChild(leiste);
        leiste.addEventListener('change', function (e) {
            var w = e.target.closest('[data-mcl-vl="tempo"]');
            if (w) vlTempo(wurzel, w.value);
        });
    }

    /* Volltextsuche im Ausarbeitungs-Abschnitt. Ohne Treffer wird ALLES
     * ausgeblendet — sonst bleibt eine Wand aus Ueberschriften stehen und
     * die Seite sieht kaputt aus. */
    function sucheVerdrahten(wurzel) {
        var feld = wurzel.querySelector('#mclSuche');
        var doku = wurzel.querySelector('#mclDoku');
        var leer = wurzel.querySelector('#mclKeinTreffer');
        if (!feld || !doku) return;
        var bloecke = Array.prototype.slice.call(doku.children);
        var roh = bloecke.map(function (b) { return b.innerHTML; });
        feld.addEventListener('input', function () {
            var q = feld.value.trim();
            if (q.length < 2) {
                bloecke.forEach(function (b, i) { b.innerHTML = roh[i]; b.hidden = false; });
                if (leer) leer.hidden = true;
                return;
            }
            var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            var treffer = 0;
            bloecke.forEach(function (b, i) {
                var passt = b.textContent.toLowerCase().indexOf(q.toLowerCase()) !== -1;
                var ueberschrift = /^H[234]$/.test(b.tagName);
                b.hidden = !(passt || ueberschrift);
                b.innerHTML = passt
                    ? roh[i].replace(/>([^<]+)</g, function (m, t) {
                        return '>' + t.replace(re, '<mark>$1</mark>') + '<';
                    })
                    : roh[i];
                if (passt) treffer++;
            });
            if (treffer === 0) bloecke.forEach(function (b) { b.hidden = true; });
            if (leer) leer.hidden = treffer > 0;
        });
    }

    function verdrahte(wurzel, g) {
        binderEinhaengen(wurzel, g);
        wurzel.addEventListener('click', function (e) {
            var b;
            if ((b = e.target.closest('[data-mcl-bdplus1]'))) {
                binderPlus(wurzel, g, b.getAttribute('data-mcl-bdplus1'), 1);
                return;
            }
            if ((b = e.target.closest('[data-mcl-bddruck]'))) {
                binderDruckSchalter(wurzel, g, b.getAttribute('data-mcl-bddruck'));
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdlimitless]'))) {
                var lt = String(b.getAttribute('data-mcl-bdlimitless') || '').split('-');
                if (typeof window.openLimitlessCard === 'function') {
                    window.openLimitlessCard(lt[0], lt.slice(1).join('-'));
                }
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdproxy]'))) {
                var ps = b.getAttribute('data-mcl-bdproxy');
                var pk = binderMappeIndex(g)[ps];
                var pt = String(ps || '').split('-');
                if (typeof window.addCardToProxy === 'function') {
                    window.addCardToProxy((pk && pk.name) || ps, pt[0], pt.slice(1).join('-'), 1);
                }
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdzeigen]'))) {
                /* Dasselbe grosse Bild wie im Deckbauer. */
                if (typeof window.showSingleCard === 'function' && b.src) {
                    var zs = b.getAttribute('data-mcl-bdzeigen');
                    var zk = binderMappeIndex(g)[zs];
                    window.showSingleCard(b.src, ((zk && (zk.name_de || zk.name)) || zs) +
                        ' (' + String(zs).replace('-', ' ') + ')');
                }
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdplus]'))) {
                binderPlus(wurzel, g, b.getAttribute('data-mcl-bdplus'));
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdminus]'))) {
                binderMinus(wurzel, g, b.getAttribute('data-mcl-bdminus'));
                return;
            }
            if (e.target.closest('[data-mcl-bdspeichern]')) { binderSpeichern(wurzel, g); return; }
            if (e.target.closest('[data-mcl-bdkopieren]')) { binderKopieren(wurzel, g); return; }
            if (e.target.closest('[data-mcl-bdleeren]')) { binderLeeren(wurzel, g); return; }
            if ((b = e.target.closest('[data-mcl-bdmeta]'))) {
                var st = binderStand[g.id] || (binderStand[g.id] = binderStandNeu());
                st.meta = b.getAttribute('data-mcl-bdmeta');
                binderZeichnen(wurzel, g);
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdsort]'))) {
                var st2 = binderStand[g.id] || (binderStand[g.id] = binderStandNeu());
                st2.sort = b.getAttribute('data-mcl-bdsort');
                binderZeichnen(wurzel, g);
                return;
            }
            if (e.target.closest('[data-mcl-bdtim]')) {
                var st3 = binderStand[g.id] || (binderStand[g.id] = binderStandNeu());
                st3.nurTim = !st3.nurTim;
                binderZeichnen(wurzel, g);
                return;
            }
            if ((b = e.target.closest('[data-mcl-ziel]'))) {
                var ziel = b.getAttribute('data-mcl-ziel');
                bereichWechseln(wurzel, ziel);
                if (ziel === 'binder') binderOeffnen(wurzel, g);
                return;
            }
            if ((b = e.target.closest('[data-mcl-filter]'))) { matchupFilter(wurzel, b.getAttribute('data-mcl-filter')); return; }
            if ((b = e.target.closest('[data-mcl-liste]'))) { listeWechseln(wurzel, b.getAttribute('data-mcl-liste')); return; }
            if ((b = e.target.closest('[data-mcl-vl="start"]'))) { vlUmschalten(wurzel); return; }
            if ((b = e.target.closest('[data-mcl-vl="stopp"]'))) { vlStopp(wurzel); return; }
            if ((b = e.target.closest('[data-mcl-kopieren]'))) { listeKopieren(wurzel, b); return; }
            if ((b = e.target.closest('.mcl-kk'))) { kartenDetail(b); return; }
            if (e.target.closest('.mcl-schliessen')) {
                vlStopp(wurzel);
                var buehne = document.getElementById('mclBuehne');
                if (buehne) { buehne.hidden = true; buehne.innerHTML = ''; }
            }
        });
        sucheVerdrahten(wurzel);
        vorleserBauen(wurzel);
    }

    /* ---------- Einstieg ---------- */

    function oeffnen() {
        var h = host();
        if (!h) return;
        if (h.dataset.state !== 'regal') zeichneRegal();
    }

    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mcl-oeffnen]');
        if (b) oeffneGuide(b.getAttribute('data-mcl-oeffnen'));
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var l = document.getElementById('mclLupe');
        if (l) l.remove();
    });

    /* Sprachwechsel: das Regal traegt uebersetzte Beschriftungen, das
     * geladene Stueck bleibt deutsch. Nur das Regal neu zeichnen, und nur
     * wenn gerade keine Masterclass offen ist — sonst verliert der Nutzer
     * seine Stelle. */
    window.addEventListener('languageChanged', function () {
        var h = host();
        var buehne = document.getElementById('mclBuehne');
        if (!h || h.dataset.state !== 'regal') return;
        if (buehne && !buehne.hidden) return;
        zeichneRegal();
    });

    window.DsMasterclass = {
        oeffnen: oeffnen,
        guides: function () { return GUIDES.slice(); },
        _zeichneRegal: zeichneRegal,
        _bereichWechseln: bereichWechseln,
        _matchupFilter: matchupFilter,
        _listeWechseln: listeWechseln,
        _markiere: markiere,
        _gitter: gitter,
        _bildAdresse: bildAdresse,
        _sprechText: sprechText,
        _sprechRoh: sprechRoh,
        _englischeNamen: englischeNamen,
        _sprechStuecke: sprechStuecke,
        _vorleseBloecke: vorleseBloecke,
        _ersterSichtbarer: ersterSichtbarer,
        /* Fuer die Zusicherungen: der Cardbinder wird am Verhalten
         * geprueft, nicht am Wortlaut im Quelltext. */
        _binderEinhaengen: binderEinhaengen,
        _binderZeichnen: binderZeichnen,
        _binderSortiert: binderSortiert,
        _binderKarteHtml: binderKarteHtml,
        _binderZahl: binderZahl,
        _binderDaten: binderDaten,
        _binderStand: binderStand,
        _binderMenge: binderMenge,
        _binderDeckHtml: binderDeckHtml,
        _binderDeckText: binderDeckText,
        _binderGruppen: BINDER_GRUPPEN,
        _timGruppenBloecke: timGruppenBloecke,
        _timZaehlung: timZaehlung,
        _binderStandNeu: binderStandNeu,
        _binderTim: binderTim,
        _binderDeckKachelHtml: binderDeckKachelHtml,
        _binderDruckTauschen: binderDruckTauschen
    };
})();
