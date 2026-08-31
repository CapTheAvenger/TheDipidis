/* Side Quest · Champions — Statuszustände.
 *
 * WARUM ES DIESE SEITE GIBT
 *
 * Bis zum 31.08.2026 stand nirgends auf der Seite, was Paralyse
 * eigentlich tut. Die Zahlen existierten — verstreut in
 * Attacken-Beschreibungen ("Verbrennt das Ziel: 1/16 max. KP pro Runde")
 * und in Item-Texten ("heilt JEDEN Status") —, aber wer wissen wollte,
 * wie stark eine Paralyse jetzt eigentlich bremst, fand es nicht. Der
 * Betreiber hat genau das gefragt: „irgendwie fehlt mir dafür voll der
 * Überblick."
 *
 * DIE QUELLENFRAGE
 *
 * Champions führt keine Regelseite zu Statuszuständen — weder im Spiel
 * noch bei pokebase. Die Zahlen kommen deshalb aus der Hauptreihe
 * (PokéWiki, Stand 9. Generation), und das steht auf der Seite, statt
 * als Champions-Wahrheit ausgegeben zu werden. Wo unsere eigenen
 * Champions-Daten eine Zahl nennen, deckt sie sich bisher: Irrlicht
 * nennt 1/16 KP und halbierten physischen Angriff, Schlafpuder nennt
 * 1 bis 3 Runden.
 *
 * WAS DIE SEITE ANDERS MACHT ALS EIN WIKI
 *
 * Ein Wiki listet alles. Diese Seite listet, was in Champions
 * tatsächlich vorkommt: jede genannte Attacke, jedes Item, jede
 * Fähigkeit steht in unseren Champions-Daten und wird über
 * data/champions_names_de.json auf ihren deutschen Namen aufgelöst.
 * Vier Blöcke je Zustand — wer ihn verursacht, wer immun ist, wer ihn
 * heilt, und wer ihn ausnutzt. Der letzte Block ist der, den ein Wiki
 * nicht hat.
 *
 * KLASSENPRÄFIX: sz- (Statuszustände). Nicht ad-, nicht ads- — solche
 * Namen blendet jeder Werbeblocker aus; das hat uns am 31.08.2026
 * schon einmal die Knöpfe im Admin-Bereich gekostet.
 */
(function () {
    'use strict';

    var DATEN_URL = 'data/champions_statuszustaende.json';
    var NAMEN_URL = 'data/champions_names_de.json';

    var _daten = null;
    var _namen = null;
    var _laden = null;
    var _offen = null;          // id des einzeln aufgeklappten Zustands
    var _alleOffen = false;     // Umschalter oben: alles auf / alles zu

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* Deutscher Name, wenn die Oberfläche deutsch ist und wir einen
     * haben — sonst der englische. Nie ein Rohschlüssel: der englische
     * Name IST der Schlüssel und damit immer lesbar. */
    function name(schluessel, art) {
        if (!de() || !_namen) return schluessel;
        var topf = _namen[art] || {};
        return topf[schluessel] || schluessel;
    }

    var TYP_DE = {
        Normal: 'Normal', Fire: 'Feuer', Water: 'Wasser', Electric: 'Elektro',
        Grass: 'Pflanze', Ice: 'Eis', Fighting: 'Kampf', Poison: 'Gift',
        Ground: 'Boden', Flying: 'Flug', Psychic: 'Psycho', Bug: 'Käfer',
        Rock: 'Gestein', Ghost: 'Geist', Dragon: 'Drache', Dark: 'Unlicht',
        Steel: 'Stahl', Fairy: 'Fee'
    };
    function typ(en) { return de() ? (TYP_DE[en] || en) : en; }

    var T = {
        de: {
            titel: 'Statuszustände',
            lead: 'Was Paralyse, Schlaf, Verbrennung und die übrigen wirklich tun — mit den Zahlen dahinter.',
            quelleLabel: 'Regeln nach',
            geltung: 'Champions führt selbst keine Regelseite zu Statuszuständen. Die Zahlen stammen deshalb aus der Hauptreihe (Stand 9. Generation). Wo unsere Champions-Daten eine Zahl nennen, deckt sie sich damit: Irrlicht nennt 1/16 KP und halbierten physischen Angriff, Schlafpuder 1 bis 3 Runden.',
            wirkung: 'Wirkung',
            dauer: 'Dauer',
            immunTypen: 'Immune Typen',
            keineImmunTypen: 'Kein Typ ist immun.',
            verursacht: 'Wer ihn setzt',
            immun: 'Wer immun ist',
            heilt: 'Wer ihn heilt',
            nutzt: 'Wer ihn ausnutzt',
            frueher: 'Früher war das anders',
            primaer: 'bleibt nach dem Wechsel',
            fluechtig: 'weg beim Wechsel',
            keine: 'nichts davon in Champions',
            laedt: 'Wird geladen …',
            fehler: 'Die Statusübersicht konnte nicht geladen werden.',
            fehlerText: 'data/champions_statuszustaende.json fehlt oder ist unlesbar.',
            aufklappen: 'Alles aufklappen',
            zuklappen: 'Alles zuklappen'
        },
        en: {
            titel: 'Status conditions',
            lead: 'What paralysis, sleep, burn and the rest actually do — with the numbers behind them.',
            quelleLabel: 'Rules from',
            geltung: 'Champions carries no rules page on status conditions of its own. The numbers therefore come from the main series (Gen 9). Where our Champions data names a number it agrees: Will-O-Wisp says 1/16 HP and halved physical attack, Sleep Powder says 1 to 3 turns.',
            wirkung: 'Effect',
            dauer: 'Duration',
            immunTypen: 'Immune types',
            keineImmunTypen: 'No type is immune.',
            verursacht: 'What inflicts it',
            immun: 'What is immune',
            heilt: 'What cures it',
            nutzt: 'What turns it to advantage',
            frueher: 'It used to be different',
            primaer: 'survives a switch',
            fluechtig: 'gone on a switch',
            keine: 'none of these in Champions',
            laedt: 'Loading …',
            fehler: 'The status overview could not be loaded.',
            fehlerText: 'data/champions_statuszustaende.json is missing or unreadable.',
            aufklappen: 'Expand all',
            zuklappen: 'Collapse all'
        }
    };
    function t() { return T[de() ? 'de' : 'en']; }

    var ART_KLASSE = { attacke: 'sz-pill--move', item: 'sz-pill--item', faehigkeit: 'sz-pill--ability' };
    var ART_TOPF = { attacke: 'moves', item: 'items', faehigkeit: 'abilities' };

    function listeHtml(titel, eintraege) {
        var c = t();
        if (!eintraege || !eintraege.length) {
            return '<div class="sz-block"><h4 class="sz-block-titel">' + esc(titel) + '</h4>'
                 + '<p class="sz-leer">' + esc(c.keine) + '</p></div>';
        }
        var zeilen = eintraege.map(function (x) {
            return '<li class="sz-zeile">'
                 + '<span class="sz-pill ' + (ART_KLASSE[x.art] || '') + '">'
                 + esc(name(x.key, ART_TOPF[x.art] || 'moves')) + '</span>'
                 + '<span class="sz-zeile-text">' + esc(de() ? x.de : x.en) + '</span>'
                 + '</li>';
        }).join('');
        return '<div class="sz-block"><h4 class="sz-block-titel">' + esc(titel) + '</h4>'
             + '<ul class="sz-liste">' + zeilen + '</ul></div>';
    }

    function zustandHtml(z) {
        var c = t();
        var offen = _alleOffen || _offen === z.id;
        var titel = de() ? z.de : z.en;
        var zweit = de() ? z.en : z.de;

        var wirkung = (z.wirkung || []).map(function (w) {
            return '<li class="sz-wirkung">'
                 + '<span class="sz-wert">' + esc(w.wert) + '</span>'
                 + '<span class="sz-wirkung-text">' + esc(de() ? w.de : w.en) + '</span></li>';
        }).join('');

        var typen = (z.immunTypen || []).length
            ? (z.immunTypen).map(function (x) {
                return '<span class="sz-typ">' + esc(typ(x)) + '</span>';
              }).join('')
            : '<span class="sz-leer">' + esc(c.keineImmunTypen) + '</span>';

        var koerper =
            '<ul class="sz-wirkungen">' + wirkung + '</ul>'
          + '<dl class="sz-fakten">'
          + '<dt>' + esc(c.dauer) + '</dt><dd>' + esc(de() ? z.dauer.de : z.dauer.en) + '</dd>'
          + '<dt>' + esc(c.immunTypen) + '</dt><dd class="sz-typen">' + typen + '</dd>'
          + '</dl>'
          + (z.hinweis ? '<p class="sz-hinweis">' + esc(de() ? z.hinweis.de : z.hinweis.en) + '</p>' : '')
          + listeHtml(c.verursacht, z.verursacht)
          + listeHtml(c.immun, z.immun)
          + listeHtml(c.heilt, z.heilt)
          + listeHtml(c.nutzt, z.nutzt)
          + (z.frueher
              ? '<details class="sz-frueher"><summary>' + esc(c.frueher) + '</summary><p>'
                + esc(de() ? z.frueher.de : z.frueher.en) + '</p></details>'
              : '');

        return '<article class="sz-karte sz-karte--' + esc(z.farbe || 'info') + '">'
             + '<button type="button" class="sz-kopf" data-sz-id="' + esc(z.id) + '"'
             + ' aria-expanded="' + (offen ? 'true' : 'false') + '">'
             + '<span class="sz-kuerzel">' + esc(z.kuerzel) + '</span>'
             + '<span class="sz-kopf-text">'
             + '<span class="sz-name">' + esc(titel) + '</span>'
             + '<span class="sz-zweitname">' + esc(zweit) + '</span>'
             + '<span class="sz-kurz">' + esc(de() ? z.kurz.de : z.kurz.en) + '</span>'
             + '</span>'
             + '<span class="sz-art">' + esc(z.art === 'fluechtig' ? c.fluechtig : c.primaer) + '</span>'
             + '<span class="sz-pfeil" aria-hidden="true"></span>'
             + '</button>'
             + '<div class="sz-koerper"' + (offen ? '' : ' hidden') + '>' + koerper + '</div>'
             + '</article>';
    }

    function render() {
        var host = document.getElementById('sideQuestZustaendeHost');
        if (!host) return false;
        var c = t();

        if (_daten === 'fehler') {
            host.innerHTML = '<div class="ds-empty"><p class="ds-empty-title">' + esc(c.fehler)
                + '</p><p class="ds-empty-body">' + esc(c.fehlerText) + '</p></div>';
            return true;
        }
        if (!_daten) {
            host.innerHTML = '<p class="sz-lead">' + esc(c.laedt) + '</p>';
            return true;
        }

        var q = (_daten._meta && _daten._meta.quelle) || {};
        var liste = (_daten.zustaende || []).map(zustandHtml);

        host.innerHTML =
            '<p class="sz-lead">' + esc(c.lead) + '</p>'
          + '<p class="sz-quelle">' + esc(c.quelleLabel) + ' '
          + '<a href="' + esc(q.url || '#') + '" target="_blank" rel="noopener noreferrer">'
          + esc(q.name || 'PokéWiki') + '</a>'
          + (q.gelesen_am ? ' <span class="sz-stand">(' + esc(q.gelesen_am) + ')</span>' : '')
          + '</p>'
          + '<p class="sz-geltung">' + esc(c.geltung) + '</p>'
          + '<div class="sz-werkzeuge">'
          + '<button type="button" class="sz-alle" data-sz-alle="'
          + (_alleOffen ? 'zu' : 'auf') + '">'
          + esc(_alleOffen ? c.zuklappen : c.aufklappen) + '</button></div>'
          + '<div class="sz-liste-karten">' + liste.join('') + '</div>';
        return true;
    }

    function laden() {
        if (_laden) return _laden;
        _laden = Promise.all([
            fetch(DATEN_URL).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }),
            fetch(NAMEN_URL).then(function (r) { return r.ok ? r.json() : null; })
                .catch(function () { return null; })
        ]).then(function (beide) {
            _daten = beide[0];
            _namen = beide[1];
            render();
            return _daten;
        }).catch(function (e) {
            // Melden, nicht still leer lassen: eine leere Seite liest sich
            // wie "es gibt keine Statuszustaende".
            if (window.console) console.warn('[status] nicht ladbar:', e);
            _daten = 'fehler';
            render();
            return null;
        });
        return _laden;
    }

    function activate() {
        render();
        return laden();
    }

    document.addEventListener('click', function (ev) {
        var kopf = ev.target && ev.target.closest && ev.target.closest('[data-sz-id]');
        if (kopf) {
            var id = kopf.getAttribute('data-sz-id');
            // Aus "alles offen" heraus schliesst ein Klick genau diesen
            // einen — sonst muesste man erst global zuklappen.
            if (_alleOffen) { _alleOffen = false; _offen = null; }
            else { _offen = (_offen === id) ? null : id; }
            render();
            return;
        }
        var alle = ev.target && ev.target.closest && ev.target.closest('[data-sz-alle]');
        if (alle) {
            _alleOffen = alle.getAttribute('data-sz-alle') === 'auf';
            _offen = null;
            render();
        }
    });

    document.addEventListener('languageChanged', function () {
        var host = document.getElementById('sideQuestZustaendeHost');
        if (host && !host.hidden && host.children.length) render();
    });

    window.sideQuestStatus = {
        activate: activate, render: render,
        _intern: { T: T, TYP_DE: TYP_DE }
    };
})();
