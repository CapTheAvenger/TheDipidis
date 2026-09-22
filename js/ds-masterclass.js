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
        bild: 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/PBL/PBL_065_R_EN_LG.png',
        kennzahlen: '22 Matchups · 6 Listen · 10.250 Wörter',
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
            keinTreffer: 'Kein Treffer.'
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
            keinTreffer: 'No match.'
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

    function verdrahte(wurzel) {
        wurzel.addEventListener('click', function (e) {
            var b;
            if ((b = e.target.closest('[data-mcl-ziel]'))) { bereichWechseln(wurzel, b.getAttribute('data-mcl-ziel')); return; }
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
        _bildAdresse: bildAdresse
    };
})();
