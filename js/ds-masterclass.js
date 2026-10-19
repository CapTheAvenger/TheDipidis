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
        /* 30.09.2026 (DA-26): die Online-Gruppe hat nur so viele Plaetze,
         * wie die letzten 7 Tage frische Listen hergeben (0 bis 5). Die
         * Kachel nennt deshalb die 20 festen Listen und „+ Online". */
        kennzahlen: '22 Matchups · 20 Listen + Online (7 Tage) · 10.164 Wörter',
        sprachen: ['de'],
        /* UMZUG 17.10.2026 (Hausi: „ja auf jeden Fall“): das Stueck liegt
         * nicht mehr unter masterclass/ (oeffentliches Repo, GitHub Pages
         * liefert jede Datei jedem aus), sondern in seinem Konto unter
         * users/{uid}/masterclasses/mega-stalobor, Feld html. Die Kachel
         * erscheint nur, wenn das Dokument da ist. Die Zahlen und Online-
         * Listen kommen beim Oeffnen frisch aus
         * data/masterclass_live/mega-stalobor.json (Wochenlauf). */
        quelle: 'konto'
    }];

    var cache = {};      /* guide-id -> HTML-Text */
    var pending = {};    /* guide-id -> Promise */

    var TXT = {
        de: {
            regalTitel: 'Meine Masterclasses',
            regalLead: 'Gekaufte Guides, auf Deutsch aufbereitet. Eine Kachel je Masterclass.',
            privat: 'Nur in deinem Konto',
            oeffnen: 'Öffnen',
            schliessen: 'Schließen',
            sprache: 'Sprache der Masterclass',
            keinEn: 'Die englische Fassung dieser Masterclass fehlt noch — angezeigt wird die deutsche.',
            platz: 'Platz für die nächste Masterclass',
            platzFein: 'Erscheint hier, sobald sie aufbereitet ist',
            laden: 'Masterclass wird geladen …',
            fehler: 'Die Masterclass ließ sich nicht laden.',
            erneut: 'Erneut versuchen',
            liveAlt: 'Die aktuellen Zahlen ließen sich nicht laden — hier steht der Stand vom %s.',
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
            binderAnteil: 'Share',
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
            binderWeitereDrucke: 'weiterer Print',
            binderWeitereDruckeMz: 'weitere Prints',
            binderEnergieHinweis: 'Basis-Energien sind austauschbar — gezeigt wird der meistgespielte Print.',
            binderDruck: 'Anderes Artwork',
            binderLimitless: 'Karte auf Limitless öffnen',
            binderProxy: 'In die Proxy-Liste',
            binderDruckGetauscht: 'Artwork getauscht',
            binderDruckRest: 'Nicht alle Kopien passten — mehr als 4× ist nicht erlaubt.',
            binderMatchups: 'Matchups aus echten Turnieren',
            binderTurniere: 'Turnierergebnisse des Decks',
            binderPartien: 'Matches',
            binderQuote: 'Win Rate',
            binderSpieler: 'Spieler',
            binderKeine: 'Keine Karte in diesem Meta.',
            binderHerkunft: 'Woher die Zahlen kommen'
        },
        en: {
            regalTitel: 'My Masterclasses',
            regalLead: 'Purchased guides, written up in German. One tile per masterclass.',
            privat: 'Only in your account',
            oeffnen: 'Open',
            schliessen: 'Close',
            sprache: 'Masterclass language',
            keinEn: 'There is no English version of this masterclass yet — showing the German one.',
            platz: 'Room for the next masterclass',
            platzFein: 'Appears here once it is prepared',
            laden: 'Loading the masterclass …',
            fehler: 'The masterclass could not be loaded.',
            erneut: 'Try again',
            liveAlt: 'The current numbers could not be loaded — showing the state of %s.',
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
            binderHerkunft: 'Where the numbers come from'
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

    /* Ein Stueck aus dem Konto (quelle 'konto'): Firestore
     * users/{uid}/masterclasses/<id>, Feld html. Die Regel
     * `match /users/{uid}/{document=**}` laesst nur den Eigentuemer lesen. */
    function holeAusKonto(id) {
        var u = window.auth && window.auth.currentUser;
        if (!u || !window.db) return Promise.reject(new Error('nicht angemeldet'));
        return window.db.collection('users').doc(u.uid).collection('masterclasses').doc(id).get()
            .then(function (d) {
                var x = d && d.exists !== false && typeof d.data === 'function' ? d.data() : null;
                if (!x || typeof x.html !== 'string' || !x.html) throw new Error('kein Dokument ' + id);
                return x.html;
            });
    }

    function hole(g) {
        if (cache[g.id]) return Promise.resolve(cache[g.id]);
        if (pending[g.id]) return pending[g.id];
        pending[g.id] = holeAusKonto(g.id)
            .then(function (txt) {
                cache[g.id] = txt;
                delete pending[g.id];
                return txt;
            })
            .catch(function (err) { delete pending[g.id]; throw err; });
        return pending[g.id];
    }

    /* ---------- Pokémon-Namen (F-25, Hausi 07.10.2026) ----------
     * Die Stuecke sind auf Deutsch geschrieben und nennen deutsche
     * Pokémon-Namen („Katapuldra“), der Rest der Seite englische. Regel:
     * „Englisch (Deutsch)“ beim ersten Vorkommen, danach englisch. Das
     * Stueck selbst bleibt unveraendert (gekaufte Aufbereitung, von
     * Skripten fortgeschrieben) — angeglichen wird beim Anzeigen. Quelle
     * der Namen: data/pokemon_names_de.json (EN -> DE). */
    var namenVersprechen = null;
    function holeNamen() {
        if (!namenVersprechen) {
            namenVersprechen = fetch('data/pokemon_names_de.json', { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.json() : {}; })
                .catch(function () { return {}; });
        }
        return namenVersprechen;
    }

    /** Ersetzt in Texten deutsche Pokémon-Namen; gesehen = Set der schon
     *  genannten Namen (erstes Vorkommen mit Klammer). Rein, getestet. */
    function namenImText(text, deZuEn, muster, gesehen) {
        return namenImTextRoh(text, deZuEn, muster, gesehen)
            .replace(/\u0000 \([^()]*\)/g, '').replace(/\u0000/g, '');
    }
    function namenImTextRoh(text, deZuEn, muster, gesehen) {
        return text.replace(muster, function (de, stelle, ganz) {
            var en = deZuEn[de];
            if (!en) return de;
            /* Das Stueck schreibt oft schon „Katapuldra (Dragapult)“ (72-mal,
               gemessen 07.10.). Dann wird daraus „Dragapult (Katapuldra)“ bzw.
               spaeter nur „Dragapult“ — und die alte Klammer faellt weg. */
            var paar = ' (' + en + ')';
            if (ganz.substr(stelle + de.length, paar.length) === paar) {
                var erstes = !gesehen.has(de);
                gesehen.add(de);
                return (erstes ? en + ' (' + de + ')' : en) + '\u0000';
            }
            /* In Zusammensetzungen („Stalobor-Deck“) keine Klammer mitten im
               Wort — dort steht nur der englische Name. */
            var weiter = ganz.charAt(stelle + de.length);
            if (gesehen.has(de) || weiter === '-') return en;
            gesehen.add(de);
            return en + ' (' + de + ')';
        });
    }

    function namenMuster(deZuEn) {
        var namen = Object.keys(deZuEn).filter(function (n) { return n.length >= 4; })
            .sort(function (a, b) { return b.length - a.length; })
            .map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
        if (!namen.length) return null;
        return new RegExp('(?<![A-Za-zÄÖÜäöüß])(?:' + namen.join('|') + ')(?![a-zäöüß])', 'g');
    }

    function namenAngleichen(wurzel, enZuDe) {
        if (!wurzel || !enZuDe) return;
        var deZuEn = {};
        Object.keys(enZuDe).forEach(function (en) {
            var de = enZuDe[en];
            if (de && de !== en) deZuEn[de] = en;
        });
        var muster = namenMuster(deZuEn);
        if (!muster) return;
        var gesehen = new Set();
        var gang = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode;
                return (p && /^(SCRIPT|STYLE)$/.test(p.nodeName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        var knoten = [];
        while (gang.nextNode()) knoten.push(gang.currentNode);
        knoten.forEach(function (n) {
            var neu = namenImText(n.nodeValue, deZuEn, muster, gesehen);
            if (neu !== n.nodeValue) n.nodeValue = neu;
        });
        Array.prototype.forEach.call(wurzel.querySelectorAll('[data-warum],[title]'), function (el) {
            ['data-warum', 'title'].forEach(function (a) {
                var v = el.getAttribute(a);
                if (v) {
                    var neu = namenImText(v, deZuEn, muster, new Set(Object.keys(deZuEn)));
                    if (neu !== v) el.setAttribute(a, neu);
                }
            });
        });
    }

    /* ---------- Regal ---------- */

    function kachel(g) {
        var nurDe = g.sprachen.indexOf(lang()) === -1;
        return '<article class="mcl-kachel" data-mcl-guide="' + esc(g.id) + '">' +
            '<div class="mcl-kachel-kopf">' +
            '<img class="mcl-kachel-bild" src="' + esc(g.bild) + '" alt="" loading="lazy" width="245" height="342">' +
            '<div class="mcl-kachel-txt">' +
            /* Hausi 17.10.2026: „nicht so viel Text darunter … den Titel und
             * von wem die ist … keine Details weiter.“ Alle Stuecke liegen
             * im Konto — ein Hinweis „Nur in deinem Konto“ an einzelnen
             * Kacheln verwirrte nur (Stalobor hatte ihn nicht). */
            '<b>' + esc(g.titel) + '</b>' +
            (g.autor ? '<span class="mcl-fein mcl-kachel-autor">' + esc(g.autor) + '</span>' : '') +
            (nurDe ? '<span class="mcl-nurde">' + esc(T('nurDe')) + '</span>' : '') +
            '</div></div>' +
            '<button type="button" class="mcl-oeffnen" data-mcl-oeffnen="' + esc(g.id) + '">' +
            esc(T('oeffnen')) + '</button></article>';
    }

    /* ---------- Private Masterclasses (17.10.2026) ----------
     *
     * ANLASS (Betreiber, 17.10.2026): „Komplett nur für mich in meinem
     * Konto … Ich habe dafür bezahlt und möchte es in meinem Format auf
     * meiner Seite haben." Eine Datei unter masterclass/ ist das NICHT:
     * GitHub Pages liefert sie jedem aus, der die Adresse kennt.
     *
     * Deshalb liegt so ein Stueck in Firestore unter
     * users/{uid}/masterclasses/{id}. Die bestehende Regel
     * `match /users/{uid}/{document=**}` (firestore.rules) laesst nur den
     * Eigentuemer lesen — es braucht keine neue Regel, und im Repo steht
     * vom Inhalt kein Wort. Felder: titel, titelEn, autor, datum, zusatz,
     * bild, kennzahlen, html (vollstaendige Seite).
     *
     * Angezeigt wird in einem iframe mit srcdoc und sandbox: das Stueck
     * bringt eigenes CSS und ein paar Zeilen Skript mit und darf weder in
     * die Seite hineinregnen noch auf Konto oder Speicher der App
     * zugreifen (kein allow-same-origin).
     */
    var privat = {};     /* 'privat-<id>' -> Guide inkl. html */

    function privatAusDoc(id, x) {
        if (!x || typeof x.html !== 'string' || !x.html) return null;
        return {
            id: 'privat-' + id,
            titel: x.titel || id,
            titelEn: x.titelEn || '',
            autor: x.autor || '',
            datum: x.datum || '',
            zusatz: x.zusatz || '',
            bild: x.bild || '',
            kennzahlen: x.kennzahlen || '',
            sprachen: ['de'],
            privat: true,
            html: x.html
        };
    }

    function holePrivat() {
        var u = window.auth && window.auth.currentUser;
        if (!u || !window.db) return Promise.resolve([]);
        return window.db.collection('users').doc(u.uid).collection('masterclasses').get()
            .then(function (snap) {
                var liste = [];
                snap.forEach(function (d) {
                    var x = d.data();
                    /* Ein Stueck, das im Regal einen eigenen Eintrag mit allen
                     * Funktionen hat (GUIDES, quelle 'konto'), wird NICHT
                     * zusaetzlich als Rahmen-Kachel gezeigt — es bekommt seine
                     * eigene Kachel, und sein Text liegt schon im Speicher. */
                    var konto = kontoGuide(d.id);
                    if (konto) {
                        if (x && typeof x.html === 'string' && x.html) {
                            cache[konto.id] = x.html;
                            liste.push(konto);
                        }
                        return;
                    }
                    var g = privatAusDoc(d.id, x);
                    if (g) { privat[g.id] = g; liste.push(g); }
                });
                return liste;
            })
            .catch(function (err) {
                console.warn('[DsMasterclass] private Masterclasses nicht geladen:', err && err.message);
                return [];
            });
    }

    /* Abmelden oder Kontowechsel: was aus dem Konto gelesen wurde, darf
     * nicht im Speicher der Seite liegen bleiben (Pruefagent zu PR #972) —
     * sonst oeffnete nach dem Abmelden ein gemerkter Text, oder ein
     * anderes Konto saehe die Stuecke des vorigen. */
    function kontoSpeicherLeeren() {
        GUIDES.forEach(function (g) {
            if (g.quelle === 'konto') { delete cache[g.id]; delete pending[g.id]; }
        });
        Object.keys(privat).forEach(function (k) { delete privat[k]; });
    }

    function kontoGuide(id) {
        return GUIDES.filter(function (g) { return g.quelle === 'konto' && g.id === id; })[0] || null;
    }

    function privatEinreihen() {
        return holePrivat().then(function (liste) {
            var h = host();
            var regal = h && h.querySelector('.mcl-regal');
            if (!regal || !liste.length) return;
            /* Reihenfolge (Hausi 17.10.2026: Profi-Wissen „als allererste
             * Stelle“): erst die allgemeinen Stuecke (Dokument-Kennung
             * beginnt mit „allgemein-“), dann die Konto-Guides in der
             * Reihenfolge von GUIDES, dann die uebrigen Rahmen-Kacheln. */
            var vorn = liste.filter(function (g) { return g.quelle === 'konto'; })
                .sort(function (a, b) { return GUIDES.indexOf(b) - GUIDES.indexOf(a); });
            vorn.forEach(function (g) {
                if (!regal.querySelector('[data-mcl-guide="' + g.id + '"]')) {
                    regal.insertAdjacentHTML('afterbegin', kachel(g));
                }
            });
            liste.filter(function (g) { return g.quelle !== 'konto' && /^privat-allgemein-/.test(g.id); })
                .reverse().forEach(function (g) {
                    if (!regal.querySelector('[data-mcl-guide="' + g.id + '"]')) {
                        regal.insertAdjacentHTML('afterbegin', kachel(g));
                    }
                });
            liste.forEach(function (g) {
                if (g.quelle === 'konto') return;
                if (!regal.querySelector('[data-mcl-guide="' + g.id + '"]')) {
                    regal.insertAdjacentHTML('beforeend', kachel(g));
                }
            });
        });
    }

    /* Sprungmarken im Stueck (<a href="#liste">) zeigen in einem srcdoc-
     * Rahmen auf die Adresse der ELTERNSEITE: ein Klick laedt dann
     * thedipidis.app/#liste im Rahmen, und der Browser blockt das
     * („Dieser Inhalt ist blockiert", Hausi 17.10.2026, Seitenleiste der
     * Tohaido-Masterclass). Darum bekommt jedes private Stueck vor </body>
     * ein Skript, das Klicks auf #-Verweise abfaengt und innerhalb des
     * Rahmens scrollt. */
    var ANKER_SKRIPT = '<script>document.addEventListener("click",function(e){' +
        'var a=e.target&&e.target.closest?e.target.closest("a[href^=\'#\']"):null;' +
        'if(!a)return;e.preventDefault();' +
        'var id=decodeURIComponent(a.getAttribute("href").slice(1));' +
        'var z=id?document.getElementById(id):document.body;' +
        'if(z)z.scrollIntoView({behavior:"smooth",block:"start"});});<\/script>';

    function mitAnkern(html) {
        var s = String(html || '');
        var skripte = ANKER_SKRIPT + LIVE_SKRIPT;
        return /<\/body>/i.test(s) ? s.replace(/<\/body>(?![\s\S]*<\/body>)/i, function () { return skripte + '</body>'; }) : s + skripte;
    }

    /* ---------- Live-Daten (17.10.2026) ----------------------------
     *
     * ANLASS (Hausi, 17.10.2026): „Die Daten will ich auch in Zukunft …
     * live haben … wenn ich die Master Class öffne, dass die ganz kurz
     * lädt und sich dann die aktuellen Daten einzieht.“ Die Stuecke liegen
     * im Konto; die ZAHLEN darin kommen aus oeffentlichen Turnierdaten. Der
     * Wochenlauf schreibt sie nach data/masterclass_live/<id>.json
     * (scripts/masterclass_zahlen_nachziehen.py, .._listen_nachziehen.py),
     * hier werden sie beim Oeffnen eingesetzt:
     *
     *   [data-live="<schluessel>"]  bekommt werte[schluessel] als Text,
     *   details[data-live-slug] + .mcl-wrz[data-live-spalte]  die Zellen,
     *   .mcl-sub  den Meta-Anteil, die Liste ihre Reihenfolge danach,
     *   die Gruppe „Online · letzte 7 Tage“  ihre Listen.
     *
     * Schlaegt der Abruf fehl, bleiben die Werte vom Umzugstag stehen und
     * ein Hinweis nennt dieses Datum (data-live-stand im Stueck). */
    function liveAdresse(id) { return 'data/masterclass_live/' + id + '.json'; }

    function holeLive(id) {
        if (typeof fetch !== 'function') return Promise.resolve(null);
        return fetch(liveAdresse(id) + '?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function hat(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

    function liveWerteSetzen(wurzel, werte) {
        var n = 0;
        if (!werte) return n;
        Array.prototype.forEach.call(wurzel.querySelectorAll('[data-live]'), function (el) {
            var k = el.getAttribute('data-live');
            if (hat(werte, k) && typeof werte[k] === 'string') { el.textContent = liveEn(werte[k]); n++; }
        });
        return n;
    }

    function liveZelle(zelle, spalte, z, m) {
        var em = zelle.querySelector('em');
        var alterKopf = em ? em.textContent : '';
        var neuerKopf = (m.koepfe && m.koepfe[spalte]) || alterKopf;
        var titel = zelle.getAttribute('title') || '';
        var vorn = titel.split(': ')[0];
        if (spalte === 'majors' && m.majors_praefix) vorn = liveEn(m.majors_praefix).replace(/: $/, '');
        else if (alterKopf && neuerKopf !== alterKopf) vorn = vorn.split(alterKopf).join(neuerKopf);
        zelle.className = z[0];
        zelle.setAttribute('title', vorn + ': ' + liveEn(z[1]));
        if (em) em.textContent = neuerKopf;
        var b = zelle.querySelector('b');
        if (b) b.textContent = liveEn(z[2]);
        var i = zelle.querySelector('i');
        var nenner = /\(([\d.]+)\)/.exec(z[3] || '');
        if (nenner) {
            if (!i) { i = document.createElement('i'); zelle.appendChild(i); }
            i.textContent = '(' + nenner[1] + ')';
        } else if (i) {
            i.parentNode.removeChild(i);
        }
    }

    function liveMatchups(wurzel, m) {
        if (!m || !m.zellen) return 0;
        var n = 0;
        var bloecke = wurzel.querySelectorAll('details.mcl-mu');
        Array.prototype.forEach.call(bloecke, function (d) {
            var slug = d.getAttribute('data-live-slug');
            if (slug) {
                var zellen = m.zellen[slug] || {};
                Array.prototype.forEach.call(d.querySelectorAll('.mcl-wrz[data-live-spalte]'), function (zelle) {
                    var sp = zelle.getAttribute('data-live-spalte');
                    liveZelle(zelle, sp, hat(zellen, sp) ? zellen[sp] : m.leer, m);
                    n++;
                });
            }
            var nm = d.querySelector('.mcl-nm em');
            var sub = d.querySelector('.mcl-sub');
            var anteil = nm && m.anteile ? m.anteile[nm.textContent.trim().toLowerCase()] : null;
            if (sub && anteil) {
                sub.textContent = sub.textContent.replace(/^\s*[\d.,]+\s*%\s*(Meta-Anteil|meta share)/i, function (x, wort) {
                    return /share/i.test(wort) ? String(anteil).replace(',', '.') + '% ' + wort : anteil + ' % ' + wort;
                });
            }
        });
        /* „Sortiert nach Meta-Anteil“ steht als Versprechen ueber der Liste
         * — dieselbe Regel wie frueher sortieren() im Erzeuger: Decks mit
         * Anteil absteigend, ohne Anteil am Ende, sonst stabil. */
        if (bloecke.length >= 20 && m.anteile) {
            var reihe = Array.prototype.map.call(bloecke, function (d, i) {
                var nm = d.querySelector('.mcl-nm em');
                var w = nm ? m.anteile[nm.textContent.trim().toLowerCase()] : null;
                var zahl = w ? parseFloat(String(w).replace(',', '.')) : NaN;
                return { d: d, i: i, hat: !isNaN(zahl), zahl: isNaN(zahl) ? 0 : zahl };
            });
            reihe.sort(function (a, b) {
                if (a.hat !== b.hat) return a.hat ? -1 : 1;
                if (a.zahl !== b.zahl) return b.zahl - a.zahl;
                return a.i - b.i;
            });
            var eltern = bloecke[0].parentNode;
            var anker = bloecke[bloecke.length - 1].nextSibling;
            reihe.forEach(function (x) { eltern.insertBefore(x.d, anker); });
        }
        return n;
    }

    /* Dieselbe Vergleichsform wie _schluessel in
     * scripts/masterclass_listen_nachziehen.py. */
    function kartenSchluessel(name) {
        var t = String(name || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (g, e) {
            var k = e.toLowerCase();
            if (k.charAt(0) === '#') {
                return String.fromCharCode(k.charAt(1) === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
            }
            return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k];
        });
        return t.trim().toLowerCase().replace(/[\u2019`]/g, "'")
            .replace(/^basic\s+/, '').replace(/\s+/g, ' ');
    }

    function kachelMitAnzahl(vorlage, n, ace) {
        var k = vorlage.cloneNode(true);
        k.setAttribute('data-n', String(n));
        if (ace && !k.hasAttribute('data-ace')) k.setAttribute('data-ace', '1');
        k.setAttribute('aria-label', (k.getAttribute('data-de') || '') + ', ' + n + ' mal');
        var a = k.querySelector('.mcl-anz');
        if (a) a.textContent = String(n);
        return k.outerHTML;
    }

    function kachelNeuHtml(x, n) {
        return '<button type="button" class="mcl-kk" data-mcl-karte="' + esc(x.karte) + '" data-de="' +
            esc(x.de) + '" data-en="' + esc(x.en) + '" data-druck="' + esc(x.druck) + '" data-druck-hoch="' +
            esc(x.hoch) + '" data-n="' + n + '"' + (x.ace ? ' data-ace="1"' : '') + ' aria-label="' +
            esc(x.de) + ', ' + n + ' mal"><img src="' + esc(x.bild) +
            '" alt="" loading="lazy" width="245" height="342"><span class="mcl-anz">' + n + '</span></button>';
    }

    /* Wie unterschied() im Erzeuger (bis 17.10.2026 dort gerechnet). */
    function listenUnterschied(zaehlung, tims) {
        var mehr = [], weniger = [], neu = [], fehlt = [];
        function reihe(o) {
            return Object.keys(o).map(function (k) { return [k, o[k]]; })
                .sort(function (a, b) { return (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); });
        }
        reihe(zaehlung).forEach(function (p) {
            var alt = hat(tims, p[0]) ? tims[p[0]] : null;
            if (alt === null) neu.push(p[1] + '× ' + p[0]);
            else if (p[1] > alt) mehr.push(p[1] + ' ' + LT('statt') + ' ' + alt + ' ' + p[0]);
            else if (p[1] < alt) weniger.push(p[1] + ' ' + LT('statt') + ' ' + alt + ' ' + p[0]);
        });
        reihe(tims).forEach(function (p) { if (!hat(zaehlung, p[0])) fehlt.push(LT('kein') + ' ' + p[0]); });
        var teile = [];
        if (neu.length) teile.push(LT('dazu') + ' ' + neu.slice(0, 4).join(', '));
        if (fehlt.length) teile.push(fehlt.slice(0, 4).join(', '));
        if (mehr.length || weniger.length) teile.push(mehr.concat(weniger).slice(0, 4).join(', '));
        if (!teile.length) return LT('gleich');
        return LT('gegenueber') + ' ' + teile.join('; ') + '.';
    }

    function liveListen(wurzel, l) {
        if (!l || !l.listen || !l.gruppe) return false;
        var gruppe = Array.prototype.filter.call(wurzel.querySelectorAll('.mcl-listgruppe'), function (g) {
            var t = g.querySelector('.mcl-listgruppe-titel');
            return t && t.textContent.trim() === l.gruppe;
        })[0];
        var reihe = gruppe && gruppe.querySelector('.mcl-listwahl-reihe');
        if (!reihe || l.listen.length > (l.max_plaetze || 5)) return false;
        var vorlagen = {};
        Array.prototype.forEach.call(wurzel.querySelectorAll('button.mcl-kk[data-en]'), function (k) {
            var s = kartenSchluessel(k.getAttribute('data-en'));
            if (!hat(vorlagen, s)) vorlagen[s] = k;
        });
        var tims = {};
        var timBlock = wurzel.querySelector('.mcl-liste[data-mcl-listenblock="0"]');
        Array.prototype.forEach.call(timBlock ? timBlock.querySelectorAll('button.mcl-kk') : [], function (k) {
            var de = k.getAttribute('data-de');
            var n = parseInt(k.getAttribute('data-n') || '0', 10);
            if (de && n) tims[de] = (tims[de] || 0) + n;
        });
        if (!Object.keys(vorlagen).length || !Object.keys(tims).length) return false;
        var alte = Array.prototype.map.call(reihe.querySelectorAll('[data-mcl-liste]'), function (c) {
            return c.getAttribute('data-mcl-liste');
        });
        var alleNummern = Array.prototype.map.call(wurzel.querySelectorAll('[data-mcl-listenblock]'), function (b) {
            return parseInt(b.getAttribute('data-mcl-listenblock'), 10);
        });
        var frei = alleNummern.length ? Math.max.apply(null, alleNummern) + 1 : 0;
        var ziel = alte.slice(0, l.listen.length);
        while (ziel.length < l.listen.length) ziel.push(String(frei++));
        var bloecke = [];
        for (var i = 0; i < l.listen.length; i++) {
            var liste = l.listen[i], kacheln = [], zaehlung = {}, summe = 0;
            for (var j = 0; j < liste.karten.length; j++) {
                var k = liste.karten[j];
                var v = vorlagen[k.schluessel];
                var de;
                if (v) { kacheln.push(kachelMitAnzahl(v, k.n, k.ace)); de = v.getAttribute('data-de') || k.name; }
                else if (k.neu) { kacheln.push(kachelNeuHtml(k.neu, k.n)); de = k.neu.de || k.name; }
                else {
                    /* Erfunden wird keine Kachel: dann bleibt die Gruppe, wie sie ist. */
                    console.warn('[DsMasterclass] Online-Liste ' + liste.name + ': unbekannte Karte ' + k.name);
                    return false;
                }
                zaehlung[de] = (zaehlung[de] || 0) + k.n;
                summe += k.n;
            }
            bloecke.push('<div class="mcl-liste" data-mcl-listenblock="' + ziel[i] + '" hidden data-mcl-listenname="' +
                esc(liste.name) + '"><p class="mcl-listmeta"><b>' + esc(liveEn(liste.fakten)) + '</b> ' +
                esc(listenUnterschied(zaehlung, tims)) + '</p><div class="mcl-gitter">' + kacheln.join('') +
                '</div><p class="mcl-quelle">' + summe + ' ' + LT('karten') + ' · ' + kacheln.length + ' ' + LT('verschiedene') +
                '<button type="button" class="mcl-kopieren" data-mcl-kopieren="' + ziel[i] + '">' +
                '<span aria-hidden="true">📋</span> ' + LT('kopieren') + '</button></p></div>');
        }
        alte.forEach(function (nr) {
            var b = wurzel.querySelector('.mcl-liste[data-mcl-listenblock="' + nr + '"]');
            if (b) b.parentNode.removeChild(b);
        });
        var alleBloecke = wurzel.querySelectorAll('.mcl-liste[data-mcl-listenblock]');
        var letzter = alleBloecke[alleBloecke.length - 1];
        if (letzter) letzter.insertAdjacentHTML('afterend', bloecke.join(''));
        reihe.innerHTML = l.listen.map(function (liste, x) {
            return '<button type="button" class="mcl-chip" data-mcl-liste="' + ziel[x] +
                '" aria-pressed="false">' + esc(liveEn(liste.name)) + '</button>';
        }).join('') || liveEn(l.leer_hinweis) || '';
        return true;
    }

    function liveHinweis(wurzel) {
        var st = wurzel.querySelector('[data-live-stand]');
        if (!st || wurzel.querySelector('.mcl-live-hinweis')) return;
        var p = document.createElement('p');
        p.className = 'mcl-live-hinweis';
        p.textContent = T('liveAlt').replace('%s', st.getAttribute('data-live-stand'));
        st.parentNode.insertBefore(p, st.nextSibling);
    }

    /* ---------- Aktuelle Daten: Online neben vor Ort (17.10.2026) ----------
     *
     * BESTELLUNG (Hausi, 17.10.2026): „… dass die Masterclasses … immer mit
     * aktuellen Daten nachgeliefert werden. … In-Personendaten und
     * Online-Daten gehen immer so ein bisschen auseinander … man kann es ja
     * beides aufzeigen … damit ich alle Daten auf einen Blick habe.“
     *
     * Quelle ist der Schluessel `aktuell` der Live-Datei
     * (scripts/masterclass_aktuell.py). Daraus entstehen zwei Dinge, fuer
     * JEDE Masterclass gleich — im Rahmen wie auf der Seite:
     *   der Block „Aktuelle Daten“ (aktuellBlockHtml) und
     *   je Matchup eine Zeile „Online … · Major …“ (aktuellMuZeilen).
     * Die Einschaetzung des Autors kommt aus dem Stueck selbst
     * ([data-live-slug] mit data-autor oder Tims Zelle) — sie steht nicht
     * in der oeffentlichen Datei. */
    var AKT_GRENZE = 20;

    /* Sprache des geoeffneten Stuecks (Hausi 19.10.2026: „jede Masterclass
     * einfach und schnell zwischen Deutsch und Englisch umschalten“). Der
     * Block „Aktuelle Daten“ spricht dieselbe Sprache wie das Stueck. */
    var aktSprache = 'de';
    /* Texte der Online-Listen im Stueck — folgen der Sprache der Masterclass,
     * nicht der Seite (die englische Fassung kann auf der deutschen Seite offen sein). */
    var LISTEN_TXT = {
        de: { karten: 'Karten', verschiedene: 'verschiedene', kopieren: 'Liste als Bild kopieren', statt: 'statt',
              kein: 'kein', dazu: 'dazu', gleich: 'Kartengleich mit Tims aktueller Liste.', gegenueber: 'Gegenüber Tims aktueller Liste:' },
        en: { karten: 'cards', verschiedene: 'unique', kopieren: 'Copy list as image', statt: 'instead of',
              kein: 'no', dazu: 'plus', gleich: "Same cards as Tim's current list.", gegenueber: "Compared with Tim's current list:" }
    };
    function LT(k) { return (LISTEN_TXT[aktSprache] || LISTEN_TXT.de)[k]; }
    var AKT_TXT = {
        de: { online: 'Online', anteil14: 'Meta-Anteil (14 Tage)', seit: 'Win % seit ', k7a: 'Letzte 7 Tage: Anteil',
            k7w: 'Letzte 7 Tage: Win %', listen: 'Listen', in: ' in ', turniereN: ' Turnieren', majorReg: 'Major · Regionals ',
            anteil: 'Meta-Anteil', von: ' von ', win: 'Win %', d2: 'Day 2 · Top 8 · Top 1', turniere: 'Turniere',
            keinMajor: 'Noch kein Regional mit diesem Deck in den Daten.', omAb: 'Online/Major weichen ab',
            autorAb: 'Autor weicht ab', gegner: 'Gegner', meta: 'Meta', major: 'Major', mittel: 'Mittel', autor: 'Autor',
            alle: 'Alle ', gegnerN: ' Gegner', besteOnline: 'Beste Online-Liste (7 Tage): ', platzVon: '. von ',
            titel: 'Aktuelle Daten', stand: ' · Stand ',
            fein: ' · Win % nach Matchpunkten, unter %n Matches die Bilanz (W-L-T) · Mittel = Durchschnitt aus Online und Major',
            haeufig: 'Die häufigsten Gegner' },
        en: { online: 'Online', anteil14: 'Meta share (14 days)', seit: 'Win % since ', k7a: 'Last 7 days: share',
            k7w: 'Last 7 days: Win %', listen: 'Lists', in: ' in ', turniereN: ' tournaments', majorReg: 'Major · Regionals ',
            anteil: 'Meta share', von: ' of ', win: 'Win %', d2: 'Day 2 · Top 8 · Top 1', turniere: 'Tournaments',
            keinMajor: 'No Regional with this deck in the data yet.', omAb: 'Online/Major differ',
            autorAb: 'Author differs', gegner: 'Opponent', meta: 'Meta', major: 'Major', mittel: 'Avg', autor: 'Author',
            alle: 'All ', gegnerN: ' opponents', besteOnline: 'Best online list (7 days): ', platzVon: ' of ',
            titel: 'Current data', stand: ' · as of ',
            fein: ' · Win % by match points, under %n matches the record (W-L-T) · Avg = mean of Online and Major',
            haeufig: 'Most common opponents' }
    };
    function A(k) { return (AKT_TXT[aktSprache] || AKT_TXT.de)[k]; }
    /* Zahlen der Live-Datei tragen das deutsche Komma ("4,42"). */
    function aktZahl(t) { return aktSprache === 'en' ? String(t).replace(',', '.') : String(t); }

    /* Englische Masterclass (19.10.2026): die Live-Texte kommen deutsch aus
     * data/masterclass_live/<id>.json (scripts/masterclass_zahlen_nachziehen.py,
     * masterclass_listen_nachziehen.py). In der englischen Fassung werden sie
     * hier uebertragen — alte und neue deutsche Schreibweise (Partien/Matches,
     * S–N–U/W–L–T, Präsenzturniere/Majors) werden beide erkannt. */
    function liveEn(t) {
        if (aktSprache !== 'en' || typeof t !== 'string') return t;
        /* Alt-Wortlaut als Regex-Literal: er wird nur erkannt, nie geschrieben. */
        return t
            .replace(/Win % nach Matchpunkten, aus ([\d.]+) (?:Partien|Matches), Bilanz ([\d–-]+) \((?:S–N–U|W–L–T)\)/,
                'Win % by match points, from $1 matches, record $2 (W–L–T)')
            .replace(/Bilanz ([\d–-]+) \((?:S–N–U|W–L–T)\) aus ([\d.]+) (?:Partien|Matches)\. Unter (\d+) (?:Partien|Matches) steht hier keine Quote — (?:eine einzelne Partie|ein einzelnes Match) verschiebt sie um ([\d.,]+) Punkte\./,
                'Record $1 (W–L–T) from $2 matches. Under $3 matches there is no rate here — a single match moves it by $4 points.')
            .replace(/keine (?:Partien|Matches) in den Daten/, 'no matches in the data')
            .replace(/^sind die letzten (?:Präsenzturniere|Majors) \((.*)\), schon im laufenden Format\.$/,
                'are the most recent Majors ($1), already in the current format.')
            .replace(/^sind die letzten (?:Präsenzturniere|Majors) \((.*)\) — die liefen noch im Format (.*)\.$/,
                'are the most recent Majors ($1) — those were still in the $2 format.')
            .replace(/^Letzte (?:Präsenzturniere|Majors) \((.*)\), Format /, 'Most recent Majors ($1), format ')
            .replace(/(\d+)\. Platz von (\d+)/g, function (x, a, b) { return enOrdinal(a) + ' place of ' + b; })
            .replace(/(\d+)\. Platz\b/g, function (x, a) { return enOrdinal(a) + ' place'; })
            .replace(/(\d+)\. von (\d+)/g, function (x, a, b) { return enOrdinal(a) + ' of ' + b; })
            .replace(/Keine Online-Liste ab (\d+) Spielern in den letzten 7 Tagen — ältere Listen stehen unter „([^“]*)“\./,
                'No online list from events with $1+ players in the last 7 days — older lists are under “$2”.')
            .replace(/ und /g, ' and ').replace(/„/g, '“')
            .replace(/(\d+),(\d+) ?%/g, '$1.$2%')
            .replace(/(\d),(\d)/g, '$1.$2')
            .replace(/\b([1-9]\d{0,2})\.(\d{3})\b/g, '$1,$2');
    }
    function enOrdinal(n) {
        n = +n; var z = n % 100, e = n % 10;
        return n + ((z >= 11 && z <= 13) ? 'th' : e === 1 ? 'st' : e === 2 ? 'nd' : e === 3 ? 'rd' : 'th');
    }
    function aktProzent(w) { return aktSprache === 'en' ? w.toFixed(1) + '%' : window.zahlKomma(w, 1) + ' %'; }   /* Festlegung DA-50: unter 20 Matches Bilanz statt Quote */

    function tausender(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

    /* {txt, n, duenn, wert} aus [S, N, U] — Matchpunkte (3S+U)/(3n). */
    function aktQuote(b) {
        var s = +(b && b[0]) || 0, l = +(b && b[1]) || 0, t = +(b && b[2]) || 0, n = s + l + t;
        if (!n) return { txt: '—', n: 0, duenn: true, wert: null };
        var w = (3 * s + t) / (3 * n) * 100;
        if (n < AKT_GRENZE) return { txt: s + '–' + l + '–' + t, n: n, duenn: true, wert: w };
        return { txt: aktProzent(w), n: n, duenn: false, wert: w };
    }

    function aktZelle(b) {
        var q = aktQuote(b);
        var ton = q.duenn || q.wert === null ? 'grau' : (q.wert >= 55 ? 'gut' : (q.wert <= 45 ? 'schlecht' : 'mittel'));
        return '<span class="mcl-akt-q mcl-akt-' + ton + '">' + esc(q.txt) +
            (q.n ? ' <i>(' + tausender(q.n) + ')</i>' : '') + '</span>';
    }

    /* Mittelwert (Hausi 17.10.2026: „online, Major und Masterclass miteinander
     * vergleichen und einen Mittelwert bilden“): Durchschnitt der Quoten aus
     * Online und Major, jede nur mit mindestens 20 Matches. Die Einschaetzung
     * des Autors ist ein Wort, keine Zahl — sie geht nicht in den Mittelwert,
     * sondern wird gegen ihn gehalten (autorStufe/aktStufe). */
    function aktMittel(a, b) {
        var w = [aktQuote(a), aktQuote(b)].filter(function (q) { return !q.duenn; })
            .map(function (q) { return q.wert; });
        if (!w.length) return null;
        return w.reduce(function (x, y) { return x + y; }, 0) / w.length;
    }

    function aktMittelZelle(a, b) {
        var m = aktMittel(a, b);
        if (m === null) return '<span class="mcl-akt-q mcl-akt-grau">—</span>';
        var ton = m >= 55 ? 'gut' : (m <= 45 ? 'schlecht' : 'mittel');
        return '<span class="mcl-akt-q mcl-akt-' + ton + '"><b>' + aktProzent(m) + '</b></span>';
    }

    /* Stufen wie in den Masterclasses: sehr guenstig ab 70, guenstig ab 57,
     * ausgeglichen ab 44, unguenstig ab 30, darunter sehr unguenstig. */
    function aktStufe(w) { return w >= 70 ? 4 : w >= 57 ? 3 : w >= 44 ? 2 : w >= 30 ? 1 : 0; }

    /* Das Wort des Autors als Stufe, -1 wenn es keine ist („wenig Sorge“).
     * DIESELBE Regel steht als Text im LIVE_SKRIPT (Rahmen) —
     * tests/unit/test-masterclass-live.js haelt beide gleich. */
    function autorStufe(t) {
        t = String(t || '').toLowerCase();
        var z = /(\d+)\s*[–-]\s*(\d+)\s*%/.exec(t) || /(\d+)\s*%/.exec(t);
        if (z) return aktStufe(z[2] ? (+z[1] + +z[2]) / 2 : +z[1]);
        if (/sehr ungünstig|sehr schlecht|very unfavou?rable|very bad/.test(t)) return 0;
        if (/sehr günstig|sehr gut|very favou?rable|very good/.test(t)) return 4;
        if (/ungünstig|schlecht|unfavou?rable|bad/.test(t)) return 1;
        if (/günstig|gut|einfach|favou?rable|good|easy/.test(t)) return 3;
        if (/ausgeglichen|knapp|offen|even|close/.test(t)) return 2;
        return -1;
    }

    /* Online und Major weichen ab: beide mit Quote, mindestens 10 Punkte auseinander. */
    function aktAbweichung(a, b) {
        var x = aktQuote(a), y = aktQuote(b);
        return !x.duenn && !y.duenn && Math.abs(x.wert - y.wert) >= 10;
    }

    var AKT_CSS = '<style>' +
        '.mcl-akt{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;padding:12px;margin:12px 0 18px;font-size:14px;line-height:1.45}' +
        '.mcl-akt h3{margin:0 0 2px;font-size:17px}.mcl-akt-fein{font-size:12px;opacity:.72;margin:0 0 10px}' +
        '.mcl-akt-zwei{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-bottom:12px}' +
        '.mcl-akt-k{border-radius:10px;padding:10px;background:color-mix(in srgb,currentColor 6%,transparent)}' +
        '.mcl-akt-k h4{margin:0 0 6px;font-size:14px}.mcl-akt-k dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0}' +
        '.mcl-akt-k dt{opacity:.72}.mcl-akt-k dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}' +
        '.mcl-akt-tab{width:100%;border-collapse:collapse;font-size:13px}.mcl-akt-tab th{text-align:left;font-size:12px;opacity:.72;font-weight:600;padding:4px}' +
        '.mcl-akt-tab td{padding:5px 4px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);vertical-align:top}' +
        '.mcl-akt-tab td.z,.mcl-akt-tab th.z{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}' +
        '.mcl-akt-q i{font-style:normal;font-size:11px;opacity:.65}.mcl-akt-gut{color:#1f9d55}.mcl-akt-schlecht{color:#d64545}.mcl-akt-grau{opacity:.6}' +
        '.mcl-akt-ab{display:inline-block;font-size:11px;border-radius:999px;padding:0 6px;background:rgba(227,96,43,.16);color:#e3602b;margin-left:4px}' +
        '.mcl-akt-autor{font-size:12px;opacity:.85}.mcl-akt details{margin-top:8px}.mcl-akt summary{cursor:pointer;font-weight:600;font-size:13px}' +
        '.mcl-akt-liste{columns:2 180px;font-size:12px;margin:6px 0 0;padding:0;list-style:none}.mcl-akt-liste li{break-inside:avoid}' +
        '.mcl-akt-mu{display:block;font-size:12px;margin-top:3px;opacity:.95}' +
        '.mcl-akt-tab td{overflow-wrap:anywhere}' +
        /* Handy: kein seitliches Scrollen (Festlegung A) — Meta-Spalte und Matchzahlen in der Tabelle weg, Zahlen in einer Zeile */
        '@media (max-width:520px){.mcl-akt-tab .mcl-akt-meta,.mcl-akt-tab .mcl-akt-q i{display:none}.mcl-akt{padding:10px}.mcl-akt-tab{font-size:12px}.mcl-akt-tab td,.mcl-akt-tab th{padding:4px 3px}.mcl-akt-ab{margin-left:0}}' +
        '</style>';

    function aktListe(l, kopf) {
        if (!l || !l.karten || !l.karten.length) return '';
        return '<details><summary>' + esc(kopf) + '</summary><ul class="mcl-akt-liste">' +
            l.karten.map(function (k) {
                return '<li>' + esc(k[0]) + '× ' + esc(k[1]) + ' <span class="mcl-akt-fein">' + esc(k[2] + ' ' + k[3]) + '</span></li>';
            }).join('') + '</ul></details>';
    }

    /* autorVon(slug) -> Einschaetzung des Autors (Text) oder ''. Rein: baut
     * nur HTML aus den Zahlen, alles ueber esc(). */
    function aktuellBlockHtml(a, autorVon, wieviele) {
        if (!a || !a.online) return '';
        var o = a.online, v = a.vor_ort, s = v && v.summe;
        /* autorVon === 'rahmen': im Rahmen fuellt das eingefuegte Skript die
         * Spalte aus dem Stueck (data-autor-fuer) und nimmt sie wieder weg,
         * wenn kein Matchup eine Einschaetzung traegt. */
        var rahmen = autorVon === 'rahmen';
        var autor = typeof autorVon === 'function' ? autorVon : function () { return ''; };
        var zeigen = wieviele || 12;
        var mitAutor = rahmen || (a.gegner || []).some(function (g) { return !!autor(g.slug); });
        var on = '<div class="mcl-akt-k"><h4>' + A('online') + ' · ' + esc(o.format) + '</h4><dl>' +
            (o.anteil14 ? '<dt>' + A('anteil14') + '</dt><dd>' + esc(aktZahl(o.anteil14)) + (aktSprache === 'en' ? '%' : ' %') + '</dd>' : '') +
            '<dt>' + A('seit') + esc(o.seit.slice(0, 6)) + '</dt><dd>' + aktZelle(o.bilanz) + '</dd>' +
            '<dt>' + A('k7a') + '</dt><dd>' + esc(aktZahl(o.kurz_anteil)) + (aktSprache === 'en' ? '%' : ' %') + '</dd>' +
            '<dt>' + A('k7w') + '</dt><dd>' + aktZelle(o.kurz_bilanz) + '</dd>' +
            '<dt>' + A('listen') + '</dt><dd>' + tausender(o.listen) + A('in') + tausender(o.turniere) + A('turniereN') + '</dd>' +
            '</dl></div>';
        var vo = v ? '<div class="mcl-akt-k"><h4>' + A('majorReg') + esc(v.format) + '</h4><dl>' +
            '<dt>' + A('anteil') + '</dt><dd>' + esc(aktZahl(s.anteil)) + (aktSprache === 'en' ? '%' : ' %') + ' (' + tausender(s.decks) + A('von') + tausender(s.spieler) + ')</dd>' +
            '<dt>' + A('win') + '</dt><dd>' + aktZelle(s.bilanz) + '</dd>' +
            '<dt>Day 2 · Top 8 · Top 1</dt><dd>' + s.day2 + ' · ' + s.top8 + ' · ' + s.sieg + '</dd>' +
            '<dt>' + A('turniere') + '</dt><dd>' + v.turniere.map(function (t) { return esc(t.name); }).join(', ') + '</dd>' +
            '</dl></div>' : '<div class="mcl-akt-k"><h4>Major</h4><p class="mcl-akt-fein">' + A('keinMajor') + '</p></div>';
        var zeile = function (g) {
            var ab = aktAbweichung(g.online, g.vor_ort) ? '<span class="mcl-akt-ab">' + A('omAb') + '</span>' : '';
            var m = aktMittel(g.online, g.vor_ort);
            var stufe = m === null ? '' : ' data-mittel-stufe="' + aktStufe(m) + '"';
            var at = autor(g.slug);
            var abA = (!rahmen && at && m !== null && autorStufe(at) >= 0 && Math.abs(autorStufe(at) - aktStufe(m)) >= 2) ?
                '<span class="mcl-akt-ab">' + A('autorAb') + '</span>' : '';
            return '<tr><td>' + esc(g.name) + ab + '</td><td class="z mcl-akt-meta">' + esc(aktZahl(g.anteil)) + (aktSprache === 'en' ? '%' : ' %') + '</td>' +
                '<td class="z">' + aktZelle(g.online) + '</td><td class="z">' + aktZelle(g.vor_ort) + '</td>' +
                '<td class="z">' + aktMittelZelle(g.online, g.vor_ort) + '</td>' +
                (rahmen ? '<td class="mcl-akt-autor" data-autor-spalte="1" data-autor-fuer="' + esc(g.slug) + '"' + stufe + '></td>' :
                    mitAutor ? '<td class="mcl-akt-autor">' + esc(at || '—') + abA + '</td>' : '') + '</tr>';
        };
        var kopfzeile = '<tr><th>' + A('gegner') + '</th><th class="z mcl-akt-meta">' + A('meta') + '</th><th class="z">Online</th><th class="z">' + A('major') + '</th><th class="z">' + A('mittel') + '</th>' +
            (mitAutor ? '<th data-autor-spalte="1">' + A('autor') + '</th>' : '') + '</tr>';
        var g = a.gegner || [];
        var tab = '<table class="mcl-akt-tab"><thead>' + kopfzeile + '</thead><tbody>' +
            g.slice(0, zeigen).map(zeile).join('') + '</tbody></table>' +
            (g.length > zeigen ? '<details><summary>' + A('alle') + g.length + A('gegnerN') + '</summary><table class="mcl-akt-tab"><tbody>' +
                g.slice(zeigen).map(zeile).join('') + '</tbody></table></details>' : '');
        var lo = a.liste_online;
        var listen = (lo ? aktListe(lo, A('besteOnline') + lo.platz + A('platzVon') + lo.von + ' (' + lo.bilanz + '), ' + lo.datum.slice(0, 6)) : '') +
            (a.listen_vor_ort || []).map(function (l) {
                return aktListe(l, 'Major: ' + l.platz + '. ' + l.turnier + ' (' + l.bilanz + '), ' + l.spieler);
            }).join('');
        return AKT_CSS + '<section class="mcl-akt" id="aktuell" data-mcl-akt="1"><h3>' + A('titel') + '</h3>' +
            '<p class="mcl-akt-fein">' + esc(a.name) + A('stand') + esc(o.bis) +
            A('fein').replace('%n', AKT_GRENZE) + '</p>' +
            '<div class="mcl-akt-zwei">' + on + vo + '</div>' +
            '<h4>' + A('haeufig') + '</h4>' + tab + listen + '</section>';
    }

    /* slug -> HTML der Zeile „Online … · Major … · Mittel …“ fuer die Matchups des Stuecks. */
    function aktuellMuZeilen(a) {
        var aus = {};
        (a && a.gegner || []).forEach(function (g) {
            var m = aktMittel(g.online, g.vor_ort);
            aus[g.slug] = { name: g.name, stufe: m === null ? -1 : aktStufe(m),
                html: 'Online ' + aktZelle(g.online) + ' · Major ' + aktZelle(g.vor_ort) +
                ' · ' + A('mittel') + ' ' + aktMittelZelle(g.online, g.vor_ort) +
                (aktAbweichung(g.online, g.vor_ort) ? '<span class="mcl-akt-ab">' + A('omAb') + '</span>' : '') };
        });
        return aus;
    }

    /* Einschaetzung des Autors aus dem Stueck: data-autor am Matchup, sonst
     * Tims Zelle (Stalobor). */
    function autorAusStueck(wurzel) {
        return function (slug) {
            var d = Array.prototype.filter.call(wurzel.querySelectorAll('[data-live-slug]'), function (x) {
                return (' ' + x.getAttribute('data-live-slug') + ' ').indexOf(' ' + slug + ' ') >= 0;
            })[0];
            if (!d) return '';
            if (d.getAttribute('data-autor')) return d.getAttribute('data-autor');
            var tim = d.querySelector('.mcl-wrz-tim b');
            return tim ? tim.textContent.trim() : '';
        };
    }

    /* Auf der Seite (Konto-Masterclass wie Stalobor): Block an
     * [data-live-block], sonst oben in den Matchups, sonst nach dem Kopf. */
    function aktuellEinsetzen(wurzel, a) {
        if (!wurzel || !a || !a.online) return false;
        var html = '<div data-mcl-akt-huelle="1">' + aktuellBlockHtml(a, autorAusStueck(wurzel)) + '</div>';
        Array.prototype.forEach.call(wurzel.querySelectorAll('[data-mcl-akt-huelle]'), function (x) {
            x.parentNode.removeChild(x);
        });
        var ziel = wurzel.querySelector('[data-live-block]');
        if (ziel) { ziel.innerHTML = html; return true; }
        var mu = wurzel.querySelector('[data-mcl-abschnitt="matchups"]');
        if (mu) { mu.insertAdjacentHTML('afterbegin', html); return true; }
        var kopf = wurzel.querySelector('.mcl-buehne-kopf');
        if (kopf) kopf.insertAdjacentHTML('afterend', html);
        else wurzel.insertAdjacentHTML('afterbegin', html);
        return true;
    }

    /* Gibt true zurueck, wenn frische Daten eingesetzt wurden. */
    function liveEinsetzen(wurzel, daten) {
        if (!wurzel) return false;
        if (!daten) { liveHinweis(wurzel); return false; }
        if (daten.matchups) {
            liveWerteSetzen(wurzel, daten.matchups.werte);
            liveMatchups(wurzel, daten.matchups);
        }
        if (daten.werte) liveWerteSetzen(wurzel, daten.werte);
        if (daten.online_listen) liveListen(wurzel, daten.online_listen);
        if (daten.aktuell) aktuellEinsetzen(wurzel, daten.aktuell);
        return true;
    }

    /* Fuer die Rahmen-Masterclasses (Tohaido, Hide 'n Sneak): die Elternseite
     * holt die JSON und schickt die einfachen Werte per postMessage hinein;
     * dieses Skript setzt sie in [data-live]. Der Rahmen hat keinen Zugriff
     * auf die App (kein allow-same-origin), darum der Umweg. */
    var LIVE_SKRIPT = '<script>window.addEventListener("message",function(e){' +
        'if(e.source!==window.parent)return;var d=e.data;' +
        /* Sprachwechsel: Stelle melden und nach dem Neuladen wieder anspringen */
        'if(d&&d.typ==="mcl-wo"){var h=null;Array.prototype.forEach.call(document.querySelectorAll("[id]"),function(x){' +
        'if(x.getBoundingClientRect().top<=80)h=x.id;});window.parent.postMessage({typ:"mcl-hier",id:h,y:window.scrollY},"*");return;}' +
        'if(d&&d.typ==="mcl-geh"){var z=d.id?document.getElementById(d.id):null;if(z)z.scrollIntoView({block:"start"});else window.scrollTo(0,d.y||0);return;}' +
        'if(!d||d.typ!=="mcl-live")return;' +
        'var w=d.werte||{};Array.prototype.forEach.call(document.querySelectorAll("[data-live]"),function(el){' +
        'var k=el.getAttribute("data-live");' +
        'if(Object.prototype.hasOwnProperty.call(w,k)&&typeof w[k]==="string")el.textContent=w[k];});' +
        /* Aktuelle Daten (17.10.2026): Block und Matchup-Zeilen aus der Elternseite */
        'function alle(s){return Array.prototype.slice.call(document.querySelectorAll(s));}' +
        /* autorStufe/aktStufe als Text — Gleichheit haelt test-masterclass-live.js */
        'function st(w){return w>=70?4:w>=57?3:w>=44?2:w>=30?1:0;}' +
        'function stufe(t){t=String(t||"").toLowerCase();var z=/(\\d+)\\s*[–-]\\s*(\\d+)\\s*%/.exec(t)||/(\\d+)\\s*%/.exec(t);' +
        'if(z)return st(z[2]?(+z[1]+ +z[2])/2:+z[1]);if(/sehr ungünstig|sehr schlecht|very unfavou?rable|very bad/.test(t))return 0;if(/sehr günstig|sehr gut|very favou?rable|very good/.test(t))return 4;' +
        'if(/ungünstig|schlecht|unfavou?rable|bad/.test(t))return 1;if(/günstig|gut|einfach|favou?rable|good|easy/.test(t))return 3;if(/ausgeglichen|knapp|offen|even|close/.test(t))return 2;return -1;}' +
        'function finde(s){return alle("[data-live-slug]").filter(function(x){return(" "+x.getAttribute("data-live-slug")+" ").indexOf(" "+s+" ")>=0;})[0];}' +
        'if(typeof d.block==="string"&&d.block){alle("[data-mcl-akt-huelle]").forEach(function(x){x.parentNode.removeChild(x);});' +
        'var h=document.createElement("div");h.setAttribute("data-mcl-akt-huelle","1");h.innerHTML=d.block;' +
        'var z=document.querySelector("[data-live-block]"),m=document.getElementById("matchups");' +
        'if(z){z.innerHTML="";z.appendChild(h);}else if(m){m.parentNode.insertBefore(h,m);}else{document.body.insertBefore(h,document.body.firstChild);}' +
        'var voll=0;alle("[data-autor-fuer]").forEach(function(td){var x=finde(td.getAttribute("data-autor-fuer"));' +
        'var t=x&&x.getAttribute("data-autor");td.textContent=t||"—";if(t)voll++;' +
        'var ms=td.getAttribute("data-mittel-stufe");var as=stufe(t);' +
        'if(t&&ms!==null&&as>=0&&Math.abs(as-(+ms))>=2){var f=document.createElement("span");f.setAttribute("class","mcl-akt-ab");f.textContent="Autor weicht ab";td.appendChild(f);}});' +
        'if(!voll)alle("[data-autor-spalte]").forEach(function(x){x.parentNode.removeChild(x);});}' +
        'if(d.mu&&typeof d.mu==="object"){alle("[data-live-slug]").forEach(function(el){' +
        'var slugs=el.getAttribute("data-live-slug").split(/\\s+/).filter(function(s){return Object.prototype.hasOwnProperty.call(d.mu,s);});' +
        'if(!slugs.length)return;var ort=el.querySelector("summary")||el;' +
        'Array.prototype.forEach.call(ort.querySelectorAll(".mcl-akt-mu"),function(x){x.parentNode.removeChild(x);});' +
        'Array.prototype.forEach.call(ort.querySelectorAll("[data-live-ersetzt]"),function(x){x.hidden=true;});' +
        'slugs.forEach(function(s){var sp=document.createElement("span");sp.setAttribute("class","mcl-akt-mu");' +
        'sp.innerHTML=(slugs.length>1?"<b>"+String(d.mu[s].name).replace(/[&<>"]/g,"")+":</b> ":"")+d.mu[s].html;ort.appendChild(sp);});});}' +
        '});<\/script>';

    /* ---------- Deutsch / Englisch (Hausi 19.10.2026) ----------
     * „jede Masterclass einfach und schnell zwischen Deutsch und Englisch
     * umschalten … der Umschalt-Button oben fixiert“. Die englische Fassung
     * liegt wie die deutsche nur im Konto: users/{uid}/masterclassesEn/{id},
     * Feld html (eigene Sammlung, weil ein Dokument hoechstens 1 MB tragen
     * darf und Stalobor allein 571 KB hat). Die Wahl gilt fuer alle
     * Masterclasses und wird im Browser gemerkt. */
    var SPRACH_SCHLUESSEL = 'mcl-sprache';
    function mclSprache() {
        try { return window.localStorage.getItem(SPRACH_SCHLUESSEL) === 'en' ? 'en' : 'de'; } catch (e) { return 'de'; }
    }
    function setzeMclSprache(l) {
        try { window.localStorage.setItem(SPRACH_SCHLUESSEL, l === 'en' ? 'en' : 'de'); } catch (e) { }
    }
    var enCache = {};
    function holeEn(id) {
        var u = window.auth && window.auth.currentUser;
        if (!u || !window.db) return Promise.resolve(null);
        if (hat(enCache, id)) return Promise.resolve(enCache[id]);
        return window.db.collection('users').doc(u.uid).collection('masterclassesEn').doc(id).get()
            .then(function (d) {
                var x = d && d.exists !== false && typeof d.data === 'function' ? d.data() : null;
                var h = x && typeof x.html === 'string' && x.html ? x.html : null;
                enCache[id] = h;
                return h;
            })
            .catch(function () { return null; });
    }
    /* Kopf der Buehne: Titel, DE|EN, Schliessen. Klebt oben (css), damit
     * der Umschalter beim Scrollen erreichbar bleibt. */
    function buehneKopf(g, sprache, fehltEn) {
        return '<div class="mcl-buehne-kopf"><h4>' + esc(T('geoeffnet')) + ': ' + esc(g.titel) + '</h4>' +
            '<div class="mcl-kopf-rechts"><div class="mcl-sprachwahl" role="group" aria-label="' + esc(T('sprache')) + '">' +
            ['de', 'en'].map(function (l) {
                return '<button type="button" class="mcl-sprachknopf" data-mcl-sprache="' + l + '" aria-pressed="' +
                    (l === sprache ? 'true' : 'false') + '">' + l.toUpperCase() + '</button>';
            }).join('') + '</div>' +
            '<button type="button" class="mcl-schliessen">' + esc(T('schliessen')) + '</button></div></div>' +
            (fehltEn ? '<p class="mcl-sprach-hinweis">' + esc(T('keinEn')) + '</p>' : '');
    }
    function mcIdOhnePrivat(g) { return String(g.id).replace(/^privat-/, ''); }

    function zeigePrivat(buehne, g, htmlText, sprache, fehltEn) {
        sprache = sprache || 'de';
        htmlText = htmlText || g.html;
        buehne.innerHTML = buehneKopf(g, sprache, fehltEn) +
            '<iframe class="mcl-privat-rahmen" sandbox="allow-scripts allow-popups" title="' +
            esc(g.titel) + '"></iframe>';
        var rahmen = buehne.querySelector('.mcl-privat-rahmen');
        var geladen = false, daten = null;
        function senden() {
            if (!geladen || !daten || !rahmen.contentWindow) return;
            var a = daten.aktuell;
            aktSprache = sprache;
            rahmen.contentWindow.postMessage({ typ: 'mcl-live', werte: daten.werte || {},
                block: a ? aktuellBlockHtml(a, 'rahmen') : '', mu: a ? aktuellMuZeilen(a) : null }, '*');
        }
        var ziel = springZiel; springZiel = null;
        rahmen.addEventListener('load', function () {
            geladen = true; senden();
            /* nach dem Einsetzen des Blocks springen, damit die Stelle stimmt */
            if (ziel && rahmen.contentWindow) setTimeout(function () {
                rahmen.contentWindow.postMessage({ typ: 'mcl-geh', id: ziel.id, y: ziel.y }, '*');
            }, 400);
        });
        rahmen.srcdoc = mitAnkern(htmlText);
        holeLive(String(g.id).replace(/^privat-/, '')).then(function (d) { daten = d; senden(); });
        buehne.querySelector('.mcl-schliessen').addEventListener('click', function () {
            buehne.hidden = true;
            buehne.innerHTML = '';
        });
        if (!ziel) try { buehne.scrollIntoView({ behavior: (window.scrollVerhalten ? window.scrollVerhalten() : 'smooth'), block: 'start' }); } catch (e) { }
    }

    function zeichneRegal() {
        var h = host();
        if (!h) return;
        h.innerHTML =
            '<p class="mcl-lead">' + esc(T('regalLead')) + '</p>' +
            '<div class="mcl-regal">' +
            GUIDES.filter(function (g) { return g.quelle !== 'konto'; }).map(kachel).join('') +   /* UI-117: keine Platzhalterkachel mehr; Konto-Guides kommen erst, wenn ihr Dokument da ist (privatEinreihen) */
            '</div><div class="mcl-buehne" id="mclBuehne" hidden></div>';
        h.dataset.state = 'regal';
        privatEinreihen();
    }

    /* ---------- Inhalt ---------- */

    function zeigeFehler(buehne, g) {
        buehne.innerHTML = '<div class="mcl-fehler"><p>' + esc(T('fehler')) + '</p>' +
            '<p><button type="button" class="mcl-erneut" data-mcl-oeffnen="' + esc(g.id) + '">' +
            esc(T('erneut')) + '</button></p></div>';
    }

    function oeffneGuide(id) {
        var g = GUIDES.filter(function (x) { return x.id === id; })[0] || privat[id];
        var buehne = document.getElementById('mclBuehne');
        if (!g || !buehne) return;
        var sprache = mclSprache();
        buehne.dataset.mclId = id;
        var enHolen = sprache === 'en' ? holeEn(mcIdOhnePrivat(g)) : Promise.resolve(null);
        if (g.privat) {
            buehne.hidden = false;
            enHolen.then(function (en) {
                if (sprache === 'en' && en) zeigePrivat(buehne, g, en, 'en');
                else zeigePrivat(buehne, g, g.html, 'de', sprache === 'en');
            });
            return;
        }
        buehne.hidden = false;
        buehne.innerHTML = '<p class="mcl-status">' + esc(T('laden')) + '</p>';
        Promise.all([hole(g), holeNamen(), holeLive(g.id), enHolen]).then(function (erg) {
            var istEn = sprache === 'en' && !!erg[3];
            var txt = istEn ? erg[3] : erg[0];
            buehne.innerHTML = buehneKopf(g, istEn ? 'en' : 'de', sprache === 'en' && !istEn) + txt;
            /* Erst die frischen Zahlen, dann Namen und Knoepfe — die
             * eingesetzten Listen brauchen dieselbe Verdrahtung. */
            aktSprache = istEn ? 'en' : 'de';
            liveEinsetzen(buehne, erg[2]);
            if (!istEn) namenAngleichen(buehne, erg[1]);
            verdrahte(buehne, g);
            var zielS = springZiel; springZiel = null;
            var zEl = zielS && zielS.id ? buehne.querySelector('#' + zielS.id.replace(/[^\w-]/g, '')) : null;
            if (zEl) { try { zEl.scrollIntoView({ block: 'start' }); } catch (e) { } return; }
            if (zielS) { try { window.scrollTo(0, zielS.y); } catch (e) { } return; }
            try { buehne.scrollIntoView({ behavior: (window.scrollVerhalten ? window.scrollVerhalten() : 'smooth'), block: 'start' }); } catch (e) { }
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
        var name = k.name || k.name_de;   // F-25 (07.10.2026): englisch wie der Rest der Seite
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
            /* F-25 (07.10.2026): englisch, der deutsche Name klein darunter */
            (k.name_de && k.name_de !== name ? '<span class="mcl-bd-de">' + esc(k.name_de) + '</span>' : '') +
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
                return String(a.name || a.name_de).localeCompare(String(b.name || b.name_de), 'de');   // F-25: englisch
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
                return String(a.name || a.name_de).localeCompare(String(b.name || b.name_de), 'de');   // F-25: englisch
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

    /* Der Schluessel einer KARTE, nicht eines Drucks.
     *
     * „Basic Metal Energy" und „Metal Energy" sind dieselbe Energieart —
     * dieselbe Zusammenfassung, die scripts/build_masterclass_cardbinder.py
     * in _energieart() macht, damit im Regal nicht sechs Metall-Energien
     * nebeneinander stehen. Dasselbe gilt deutsch fuer „Basis-".
     */
    function binderKartenSchluessel(name) {
        var n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (n.indexOf('basic ') === 0) n = n.slice(6);
        else if (n.indexOf('basis-') === 0) n = n.slice(6);
        else if (n.indexOf('basis ') === 0) n = n.slice(6);
        return n;
    }

    function binderMappeNamen(g) {
        var d = binderDaten[g.id];
        var idx = {};
        ((d && d.karten) || []).forEach(function (k) {
            [k.name, k.name_de].forEach(function (n) {
                var s = binderKartenSchluessel(n);
                if (s && !idx[s]) idx[s] = k;
            });
        });
        return idx;
    }

    /* ---------- Was der Cardbinder ueber einen Druck im Deck weiss ----
     *
     * BEFUND (Betreiber, 25.09.2026): „ich verstehe nicht warum die Karte
     * eine Zeile nach unten rutscht wenn ich die Raritaet wechsle." Nach
     * einem Artwork-Tausch stand Metang (SVP 90) unter „Ohne Angabe",
     * ohne Preis und ohne Zahlen.
     *
     * URSACHE: die Mappe fuehrt nur Drucke, die in den ausgewerteten
     * Listen WIRKLICH gespielt wurden. Ein frisch getauschter Druck ist
     * darin nicht enthalten; die Gruppe wurde aber allein am Druck
     * nachgesehen (`idx[schluessel].gruppe`) und fiel deshalb auf ''.
     *
     * Zwei Quellen, getrennt gehalten — das ist der Kern:
     *   k  = die Mappe unter DIESEM Druck. Nur daraus kommen Preis und
     *        Nutzungszahlen, denn die gehoeren dem Druck.
     *   a  = irgendein Druck DERSELBEN Karte. Daraus kommen Gruppe, Art,
     *        ACE SPEC und der Name — die gehoeren der Karte.
     * Fehlt k, bleiben Preis und Zahlen leer. Geraten wird nichts.
     */
    function binderDeckWissen(c, idx, nam) {
        var schluessel = String((c.set || '') + '-' + (c.number || '')).toUpperCase();
        var k = idx[schluessel] || null;
        var a = k;
        if (!a) {
            a = nam[binderKartenSchluessel(c.name_en)] ||
                nam[binderKartenSchluessel(c.name_de)] || null;
        }
        return { c: c, k: k, a: a, schluessel: schluessel };
    }

    /* Dasselbe fuer die Klick-Behandler, die nur den Druck in der Hand
     * haben. Gibt die Kartenkenntnis (a) zurueck, nicht den Preis. */
    function binderWissenZuDruck(g, schluessel) {
        var idx = binderMappeIndex(g);
        if (idx[schluessel]) return { k: idx[schluessel], a: idx[schluessel] };
        var nam = binderMappeNamen(g);
        var c = binderDeckKarten(g).filter(function (x) {
            return String((x.set || '') + '-' + (x.number || '')).toUpperCase() === schluessel;
        })[0];
        if (!c) return { k: null, a: null, c: null };
        var w = binderDeckWissen(c, idx, nam);
        return w;
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
        var c = e.c, k = e.k, a = e.a || e.k;
        var schluessel = e.schluessel ||
            String((c.set || '') + '-' + (c.number || '')).toUpperCase();
        var setCode = String(c.set || '').toUpperCase();
        var nummer = String(c.number || '');
        var name = c.name_en || (a && a.name) || c.name_de || (a && a.name_de) || schluessel;   // F-25
        var nameEn = c.name_en || (a && a.name) || c.name_de || '';
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

        var ace = a && a.ace
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
        var nam = binderMappeNamen(g);
        var gesamt = karten.reduce(function (s, c) { return s + (c.count || 0); }, 0);
        if (!gesamt) {
            return '<div class="mcl-bd-deck" data-mcl-bddeck="1">' +
                '<h4 class="mcl-bd-h">' + esc(T('binderDeck')) + '</h4>' +
                '<p class="mcl-status">' + esc(T('binderDeckLeer')) + '</p></div>';
        }

        var nachGruppe = {};
        var ace = 0, basis = 0, preis = 0, ohnePreis = 0;
        karten.forEach(function (c) {
            var w = binderDeckWissen(c, idx, nam);
            var k = w.k, a = w.a;
            var grp = (a && a.gruppe) || '';
            (nachGruppe[grp] || (nachGruppe[grp] = [])).push(w);
            if (a && a.ace) ace += (c.count || 0);
            /* Basis-Pokemon zaehlen — fuer die Regel „ohne Basis-Pokemon
             * ist das Deck nicht spielbar". Der Bestand schreibt die Art
             * teils mit Elementbuchstabe davor (MBasic, DBasic, WBasic),
             * deshalb das Wortende statt der Gleichheit. „Basic Energy"
             * endet auf „energy" und faellt damit nicht hinein. */
            var typ = String((a && a.typ) || c.type || '').toLowerCase().trim();
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
                    String(a.c.name_en || a.c.name_de || '').localeCompare(
                        String(b.c.name_en || b.c.name_de || ''), 'de');
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
        if (!p) return;
        /* Auch ein Druck, den die Mappe nicht fuehrt (frisch getauscht),
         * muss sich vermehren lassen — sonst tut das Plus nach einem
         * Artwork-Tausch stillschweigend nichts (Befund 25.09.2026). */
        var w = binderWissenZuDruck(g, schluessel);
        var karte = w.k ? binderDeckKarte(w.k) : w.c;
        if (!karte) return;
        var stand = binderStand[g.id] || (binderStand[g.id] = binderStandNeu());
        var menge = wieViele || (w.k ? binderMenge(w.k, stand.meta) : 1);
        var erg = p.addCopies(karte, menge);
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
        /* Ein Druck, den die Mappe nicht fuehrt (frisch getauscht), holt
         * seinen Namen aus dem Deck oder aus einem anderen Druck
         * derselben Karte. */
        var w = binderWissenZuDruck(g, schluessel);
        var name = (w.k && w.k.name) ||
            (w.c && (w.c.name_en || w.c.name_de)) ||
            (w.a && (w.a.name || w.a.name_de)) || '';
        var teile = String(schluessel || '').split('-');
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
                var pw = binderWissenZuDruck(g, ps);
                var pn = (pw.a && pw.a.name) || (pw.c && (pw.c.name_en || pw.c.name_de)) || ps;
                var pt = String(ps || '').split('-');
                if (typeof window.addCardToProxy === 'function') {
                    window.addCardToProxy(pn, pt[0], pt.slice(1).join('-'), 1);
                }
                return;
            }
            if ((b = e.target.closest('[data-mcl-bdzeigen]'))) {
                /* Dasselbe grosse Bild wie im Deckbauer. */
                if (typeof window.showSingleCard === 'function' && b.src) {
                    var zs = b.getAttribute('data-mcl-bdzeigen');
                    var zw = binderWissenZuDruck(g, zs);
                    var zn = (zw.a && (zw.a.name_de || zw.a.name)) ||
                        (zw.c && (zw.c.name_de || zw.c.name_en)) || zs;
                    window.showSingleCard(b.src, zn +
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
            if ((b = e.target.closest('[data-mcl-kopieren]'))) { listeKopieren(wurzel, b); return; }
            if ((b = e.target.closest('.mcl-kk'))) { kartenDetail(b); return; }
            if (e.target.closest('.mcl-schliessen')) {
                var buehne = document.getElementById('mclBuehne');
                if (buehne) { buehne.hidden = true; buehne.innerHTML = ''; }
            }
        });
        sucheVerdrahten(wurzel);
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
        var sp = e.target.closest('[data-mcl-sprache]');
        if (sp) sprachWechsel(sp.getAttribute('data-mcl-sprache'));
    });

    /* Gleiche Masterclass in der anderen Sprache neu oeffnen. Die Buehne
     * wird durch eine frische ersetzt — sonst haengen die Klick-Zuhoerer
     * der ersten Fassung (verdrahte) doppelt am selben Element. Die
     * Scrollstelle der Seite bleibt. */
    var springZiel = null;
    function stelleAufSeite(buehne) {
        var h = null;
        Array.prototype.forEach.call(buehne.querySelectorAll('[id]'), function (x) {
            if (x.getBoundingClientRect && x.getBoundingClientRect().top <= 80) h = x.id;
        });
        return { id: h, y: window.scrollY };
    }
    function sprachWechsel(l) {
        var alt = document.getElementById('mclBuehne');
        if (!alt || !alt.dataset.mclId) return;
        if (l === mclSprache()) return;
        setzeMclSprache(l);
        var id = alt.dataset.mclId;
        function neuOeffnen(stelle) {
            springZiel = stelle;
            var neu = alt.cloneNode(false);
            alt.parentNode.insertBefore(neu, alt);
            alt.parentNode.removeChild(alt);
            oeffneGuide(id);
        }
        var rahmen = alt.querySelector('.mcl-privat-rahmen');
        if (!rahmen || !rahmen.contentWindow) { neuOeffnen(stelleAufSeite(alt)); return; }
        /* Im Rahmen fragt die Seite nach der Stelle; kommt keine Antwort,
         * oeffnet sie nach 400 ms oben. */
        var fertig = false;
        function antwort(e) {
            if (e.source !== rahmen.contentWindow || !e.data || e.data.typ !== 'mcl-hier' || fertig) return;
            fertig = true; window.removeEventListener('message', antwort);
            neuOeffnen({ id: e.data.id, y: e.data.y });
        }
        window.addEventListener('message', antwort);
        rahmen.contentWindow.postMessage({ typ: 'mcl-wo' }, '*');
        setTimeout(function () { if (!fertig) { fertig = true; window.removeEventListener('message', antwort); neuOeffnen(null); } }, 400);
    }

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

    /* Wer den Untertab vor dem Ende der Anmeldung oeffnet, saehe die
     * privaten Kacheln sonst nie: nach dem Anmelden das Regal neu zeichnen
     * — aber nur, wenn gerade keine Masterclass offen ist. */
    if (window.auth && typeof window.auth.onAuthStateChanged === 'function') {
        try {
            window.auth.onAuthStateChanged(function () {
                kontoSpeicherLeeren();
                var h = host();
                var buehne = document.getElementById('mclBuehne');
                if (!h || h.dataset.state !== 'regal') return;
                if (buehne && !buehne.hidden) return;
                zeichneRegal();
            });
        } catch (e) { }
    }

    window.DsMasterclass = {
        oeffnen: oeffnen,
        guides: function () { return GUIDES.slice(); },
        _zeichneRegal: zeichneRegal,
        _privatAusDoc: privatAusDoc,
        _holePrivat: holePrivat,
        _zeigePrivat: zeigePrivat,
        _mitAnkern: mitAnkern,
        _holeLive: holeLive,
        _liveEinsetzen: liveEinsetzen,
        _kachel: kachel,
        _setzeAktSprache: function (l) { aktSprache = l; },
        _buehneKopf: buehneKopf,
        _sprachWechsel: function (l) { return sprachWechsel(l); },
        _mclSprache: mclSprache,
        _holeEn: holeEn,
        _aktuellBlockHtml: aktuellBlockHtml,
        _aktuellMuZeilen: aktuellMuZeilen,
        _aktuellEinsetzen: aktuellEinsetzen,
        _liveEn: liveEn,
        _aktQuote: aktQuote,
        _aktMittel: aktMittel,
        _autorStufe: autorStufe,
        _liveSkript: function () { return LIVE_SKRIPT; },
        _liveListen: liveListen,
        _liveMatchups: liveMatchups,
        _listenUnterschied: listenUnterschied,
        _kartenSchluessel: kartenSchluessel,
        _kontoGuide: kontoGuide,
        _kontoSpeicherLeeren: kontoSpeicherLeeren,
        _privat: privat,
        _hole: hole,
        _bereichWechseln: bereichWechseln,
        _matchupFilter: matchupFilter,
        _listeWechseln: listeWechseln,
        _markiere: markiere,
        _gitter: gitter,
        _bildAdresse: bildAdresse,
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
        _binderDruckTauschen: binderDruckTauschen,
        _namenImText: namenImText,
        _namenImTextRoh: namenImTextRoh,
        _namenMuster: namenMuster,
        _namenAngleichen: namenAngleichen
    };
})();
