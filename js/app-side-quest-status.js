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
            lead: 'Was Paralyse, Schlaf, Verbrennung und die übrigen wirklich tun — mit den Zahlen dahinter. Ganz unten: was „steigt stark“ und „sinkt drastisch“ in Prozent bedeuten.',
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
            zuklappen: 'Alles zuklappen',
            stufenTitel: 'Statuswert-Stufen',
            stufenLead: 'Was „steigt stark“ und „sinkt drastisch“ in Zahlen heißen. Eine Attacke verschiebt den Wert um Stufen, nicht um Prozente — der Faktor hängt davon ab, wo der Wert schon steht.',
            stufeSp: 'Stufe',
            faktorSp: 'Faktor',
            wertSp: 'Vom Grundwert',
            meldungSp: 'Meldung im Kampf',
            stufenGrenze: 'Weiter als +6 oder −6 geht es nicht: dort ist bei 400 % Schluss und bei 25 %.',
            stufenMeldung: 'Die Meldung richtet sich danach, um wie viele Stufen eine Attacke verschiebt — nicht danach, wo der Wert danach steht. Vom Grundwert aus ist das dasselbe. Ab drei Stufen auf einmal heißt es immer „drastisch“.',
            stufenAusnahme: 'Genauigkeit und Fluchtwert folgen einer eigenen, flacheren Tabelle — von 1/3 bei −6 bis 3 bei +6.',
            stufenGilt: 'Gilt für Angriff, Verteidigung, Spezial-Angriff, Spezial-Verteidigung und Initiative.',
            grund: 'unverändert'
        },
        en: {
            titel: 'Status conditions',
            lead: 'What paralysis, sleep, burn and the rest actually do — with the numbers behind them. At the bottom: what "rose sharply" and "fell severely" mean in percent.',
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
            zuklappen: 'Collapse all',
            stufenTitel: 'Stat stages',
            stufenLead: 'What "rose sharply" and "fell severely" mean as numbers. A move shifts the stat by stages, not by percent — the factor depends on where the stat already stands.',
            stufeSp: 'Stage',
            faktorSp: 'Factor',
            wertSp: 'Of the base',
            meldungSp: 'Battle message',
            stufenGrenze: 'It stops at +6 and −6: 400 % at the top, 25 % at the bottom.',
            stufenMeldung: 'The message depends on how many stages a move shifts, not on where the stat ends up. From the base value the two coincide. Three stages at once or more always reads "drastically".',
            stufenAusnahme: 'Accuracy and evasion follow their own, flatter table — from 1/3 at −6 to 3 at +6.',
            stufenGilt: 'Applies to Attack, Defense, Special Attack, Special Defense and Speed.',
            grund: 'unchanged'
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

    /* Die Stufentabelle.
     *
     * WARUM SIE HIER STEHT UND NICHT BEI DEN ATTACKEN
     *
     * "Der Angriff steigt stark" ist ein Satz, den man in zwanzig
     * Attackentexten liest. Zwanzigmal dieselbe Erklaerung darunter
     * waere genau die Unuebersichtlichkeit, gegen die diese Seite
     * gerade aufgeraeumt wurde. Also einmal, an dem Ort, an dem ohnehin
     * steht, was im Kampf mit einem Pokemon passiert — und von den
     * Attacken aus verlinkt.
     *
     * WARUM DIE ZEILE MIT DER 0 DABEI IST
     *
     * Ohne sie liest sich die Tabelle wie zwei Listen. Mit ihr sieht
     * man in einem Blick, dass +1 und -1 NICHT symmetrisch sind:
     * plus die Haelfte gegen minus ein Drittel. Genau das ueberrascht
     * die meisten.
     */
    function stufenHtml() {
        var c = t(), st = _daten && _daten.stufen;
        if (!st || !st.tabelle || !st.tabelle.length) return '';
        var m = st._meta || {};
        var zeilen = st.tabelle.map(function (z) {
            var wort = de() ? z.wort_de : z.wort_en;
            var null_ = (z.stufe === 0);
            return '<tr class="sz-stufe-zeile'
                 + (null_ ? ' is-null' : (z.stufe > 0 ? ' is-auf' : ' is-ab')) + '">'
                 + '<th scope="row" class="sz-stufe-nr">'
                 + (z.stufe > 0 ? '+' : '') + z.stufe + '</th>'
                 + '<td class="sz-stufe-bruch">' + esc(z.bruch) + '</td>'
                 + '<td class="sz-stufe-pct">' + esc(de() ? z.prozent_de : z.prozent_en) + '</td>'
                 + '<td class="sz-stufe-wort">'
                 + (wort ? esc(wort) : '<span class="sz-stufe-leer">' + esc(c.grund) + '</span>')
                 + '</td></tr>';
        }).join('');
        var quellen = (m.quellen || []).map(function (q) {
            return '<a href="' + esc(q.url) + '" target="_blank" rel="noopener noreferrer">'
                 + esc(q.name) + '</a>';
        }).join(' · ');
        return '<section class="sz-stufen" aria-labelledby="szStufenTitel">'
             + '<h3 class="sz-stufen-titel" id="szStufenTitel">' + esc(c.stufenTitel) + '</h3>'
             + '<p class="sz-lead">' + esc(c.stufenLead) + '</p>'
             + '<div class="mobile-table-scroll"><table class="sz-stufen-tabelle">'
             + '<thead><tr><th scope="col">' + esc(c.stufeSp) + '</th>'
             + '<th scope="col">' + esc(c.faktorSp) + '</th>'
             + '<th scope="col">' + esc(c.wertSp) + '</th>'
             + '<th scope="col">' + esc(c.meldungSp) + '</th></tr></thead>'
             + '<tbody>' + zeilen + '</tbody></table></div>'
             + '<p class="sz-stufen-hinweis">' + esc(c.stufenGilt) + ' ' + esc(c.stufenGrenze) + '</p>'
             + '<p class="sz-stufen-hinweis">' + esc(c.stufenMeldung) + '</p>'
             + '<p class="sz-stufen-hinweis">' + esc(c.stufenAusnahme) + '</p>'
             + (quellen ? '<p class="sz-quelle">' + esc(c.quelleLabel) + ' ' + quellen + '</p>' : '')
             + '</section>';
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
          + '<div class="sz-liste-karten">' + liste.join('') + '</div>'
          + stufenHtml();
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
            /* Die Stufentabelle wird ausserhalb dieses Reiters gebraucht:
               im Nachschlagen steht in zwanzig Attackentexten "steigt
               stark", und dort gehoert der Faktor hin. Weitergereicht wird
               DIE Tabelle, nicht eine Kopie der Zahlen — zwei Listen
               waeren zwei Wahrheiten. */
            if (_daten && _daten.stufen && Array.isArray(_daten.stufen.tabelle)) {
                window.SideQuestStufen = _daten.stufen.tabelle;
                document.dispatchEvent(new CustomEvent('sideQuestStufenBereit'));
            }
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

    /* Die Stufentabelle auf Zuruf — auch wenn dieser Reiter nie
       geoeffnet wurde. Das Nachschlagen braucht sie fuer die
       Attackentexte, und ob jemand vorher hier war, darf nicht
       entscheiden, ob dort eine Zahl steht. laden() haelt seine eigene
       Zusage fest, ein zweiter Aufruf laedt also nichts nach. */
    function stufen() {
        if (window.SideQuestStufen) return Promise.resolve(window.SideQuestStufen);
        return laden().then(function () { return window.SideQuestStufen || null; });
    }

    window.sideQuestStatus = {
        activate: activate, render: render, stufen: stufen,
        _intern: { T: T, TYP_DE: TYP_DE }
    };
})();
