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
            verdrahte(buehne);
            try { buehne.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
        }).catch(function (err) {
            console.warn('[DsMasterclass] ' + g.id + ' nicht geladen:', err && err.message);
            zeigeFehler(buehne, g);
        });
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

    function sprechRoh(el) {
        var aus = '';
        (function gehe(knoten) {
            Array.prototype.forEach.call(knoten.childNodes || [], function (n) {
                if (n.nodeType === 3) { aus += n.nodeValue; return; }
                if (n.nodeType !== 1) return;
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

    function verdrahte(wurzel) {
        wurzel.addEventListener('click', function (e) {
            var b;
            if ((b = e.target.closest('[data-mcl-ziel]'))) { bereichWechseln(wurzel, b.getAttribute('data-mcl-ziel')); return; }
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
        _ersterSichtbarer: ersterSichtbarer
    };
})();
