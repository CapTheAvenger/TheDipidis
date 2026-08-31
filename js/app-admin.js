/* Admin — Datenlücken und der Weg, sie zu schließen.
 *
 * KLASSENPRAEFIX: dl- (Datenluecken), NICHT ad-.
 * Gemessen am 31.08.2026 an der laufenden Seite: mit dem
 * urspruenglichen Praefix stand der Knopf im Browser auf
 * display:none — kein Fehler im Stilblatt, sondern eine
 * kosmetische Filterregel jedes gaengigen Werbeblockers. Die
 * beiden Knoepfe je Luecke, also der ganze Zweck der Seite,
 * waren fuer jeden Besucher mit Blocker unsichtbar. Die
 * lokale Messung hatte es NICHT gefunden, weil sie Elemente
 * mit Hoehe 0 herausfilterte. tests/unit/test-admin-datenluecken.js
 * haelt den Praefix jetzt fest.
 *
 * WARUM ES DIESE SEITE GIBT
 *
 * Die Seite benennt ihre Lücken schon heute an Ort und Stelle: der
 * Pokédex schreibt „keine belegte Quelle" unter eine Mega-Form, der
 * Datenausweis schreibt „Schnappschuss fehlt". Das ist richtig — aber
 * es ist verstreut. Wer die Lücken SCHLIESSEN will statt sie nur zur
 * Kenntnis zu nehmen, müsste dafür jede Ansicht einzeln durchklicken
 * und sich merken, was er gesehen hat.
 *
 * Hier stehen sie an einem Ort, mit dem, was zum Schließen fehlt:
 * ein Vorschlag, seine Quelle, und die Einstufung, ob der Beleg
 * einzeln trägt oder nicht.
 *
 * DER RÜCKKANAL
 *
 * Diese Seite schreibt nichts. Sie kann es nicht und soll es nicht:
 * eine öffentlich erreichbare Seite mit Schreibrecht auf die Daten
 * bräuchte ein Geheimnis im Browser, und ein Geheimnis im Browser ist
 * keins. Stattdessen baut sie ein vorbefülltes GitHub-Issue: der
 * Betreiber ist dort ohnehin angemeldet, drückt Absenden, und der
 * Vorgang steht im selben Kanal, in dem auch der Data Guardian meldet.
 * Kein Token, kein Schlüssel, kein neuer Dienst.
 *
 * WAS DIESE SEITE NICHT IST
 *
 * Sie ist nicht zugangsgeschützt. Sie steht nicht im Menü und ist nur
 * über #admin erreichbar, aber wer die Adresse kennt, sieht sie. Das
 * ist vertretbar, weil hier nichts Vertrauliches steht — es ist eine
 * Liste dessen, was uns fehlt, und die darf jeder sehen. Der Hinweis
 * steht auch auf der Seite selbst, damit niemand einen Schutz annimmt,
 * den es nicht gibt.
 */
(function () {
    'use strict';

    var LUECKEN_URL = 'data/datenluecken.json';
    var ISSUE_BASIS = 'https://github.com/CapTheAvenger/TheDipidis/issues/new';

    /* Obergrenze fuer die erzeugte Adresse.
     *
     * GEMESSEN (31.08.2026): mit 63 offenen Luecken war die
     * Sammeladresse 12.147 Zeichen lang. GitHub weist eine Anfrage
     * dieser Laenge ab — der Knopf haette wortlos auf eine Fehlerseite
     * gefuehrt, und zwar erst ab einer bestimmten Zahl von Luecken,
     * also genau dann, wenn man ihn am dringendsten braucht. 6000 ist
     * mit Abstand unter dem, was Server und Browser sicher tragen.
     */
    var MAX_ADRESSE = 6000;

    var _daten = null;
    var _laden = null;
    var _filter = 'alle';

    function de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var T = {
        de: {
            titel: 'Datenlücken',
            zurueck: '← Startseite',
            lead: 'Alles, was die Seite über sich selbst nicht weiß — an einem Ort, mit Vorschlag und Quelle daneben. Diese Seite ändert keine Daten: „Bestätigen" öffnet ein vorbefülltes GitHub-Issue, das du absendest.',
            offen: 'offen',
            keine: 'Keine offene Lücke.',
            keineText: 'Das Inventar ist leer — jede geprüfte Stelle trägt einen belegten Wert.',
            alle: 'Alle',
            wo: 'Steht in',
            vorschlag: 'Vorschlag',
            quelle: 'Quelle',
            grundform: 'Fähigkeiten der Grundform',
            keinVorschlag: 'Kein Vorschlag — hier fehlt noch eine Quelle.',
            eindeutig: 'eindeutig belegt',
            mehrdeutig: 'Bestätigung nötig',
            ungeprueft: 'ungeprüft',
            btnQuelle: 'Quelle ansehen ↗',
            btnSenden: 'Bestätigen & senden ↗',
            btnAlle: 'Alle %n Vorschläge auf einmal bestätigen ↗',
            btnAlleTeil: '%n von %g Vorschlägen auf einmal bestätigen ↗',
            laedt: 'Lädt …',
            fehler: 'Das Lücken-Inventar konnte nicht geladen werden.',
            fehlerText: 'data/datenluecken.json fehlt oder ist unlesbar. Erzeugen mit: python3 scripts/datenluecken.py',
            stand: 'Inventar erzeugt',
            offenHinweis: 'Nicht zugangsgeschützt: diese Seite steht nicht im Menü, ist aber über #admin für jeden erreichbar. Sie zeigt nur, was uns fehlt — nichts Vertrauliches.',
            wieWeiter: 'Wie es weitergeht',
            wieWeiterText: 'Beim Absenden landet dein Eintrag als Issue im Repository. Ich lese die Issues aus, trage den bestätigten Wert mit deiner Quelle in data/champions_mega_faehigkeiten.json nach und schließe die Lücke.'
        },
        en: {
            titel: 'Data gaps',
            zurueck: '← Home',
            lead: 'Everything the site does not know about itself — in one place, with a proposal and its source next to it. This page changes no data: "Confirm" opens a prefilled GitHub issue for you to submit.',
            offen: 'open',
            keine: 'No open gap.',
            keineText: 'The inventory is empty — every checked spot carries a sourced value.',
            alle: 'All',
            wo: 'Lives in',
            vorschlag: 'Proposal',
            quelle: 'Source',
            grundform: 'Base form abilities',
            keinVorschlag: 'No proposal — a source is still missing here.',
            eindeutig: 'conclusively sourced',
            mehrdeutig: 'needs confirmation',
            ungeprueft: 'unchecked',
            btnQuelle: 'View source ↗',
            btnSenden: 'Confirm & send ↗',
            btnAlle: 'Confirm all %n proposals at once ↗',
            btnAlleTeil: 'Confirm %n of %g proposals at once ↗',
            laedt: 'Loading …',
            fehler: 'The gap inventory could not be loaded.',
            fehlerText: 'data/datenluecken.json is missing or unreadable. Build it with: python3 scripts/datenluecken.py',
            stand: 'Inventory built',
            offenHinweis: 'Not access-protected: this page is not in the menu, but anyone with the #admin link can reach it. It only shows what we are missing — nothing confidential.',
            wieWeiter: 'What happens next',
            wieWeiterText: 'Submitting files your entry as an issue in the repository. I read the issues, record the confirmed value together with your source in data/champions_mega_faehigkeiten.json, and close the gap.'
        }
    };

    function t() { return T[de() ? 'de' : 'en']; }

    /* ── Rückkanal ────────────────────────────────────────────────
     *
     * Ein Issue statt eines Schreibzugriffs. Der Titel trägt das
     * Präfix, an dem ich die Vorgänge wiederfinde; der Rumpf trägt
     * die Felder, die ich zum Nachtragen brauche, plus eine Zeile,
     * die sich maschinell lesen lässt. Was der Betreiber ausfüllt,
     * steht oben — nicht unter dem Ballast.
     */
    function issueUrl(l) {
        var v = l.vorschlag || {};
        var rumpf = [
            '### Meine Prüfung',
            '',
            'Bestätigt (ja/nein): ',
            'Richtiger Wert, falls abweichend: ',
            'Quelle, die ich geprüft habe: ',
            'Notiz: ',
            '',
            '---',
            '',
            '### Die Lücke',
            '',
            '- Kennung: `' + l.id + '`',
            '- Klasse: ' + l.klasse,
            '- Steht in: `' + l.wo + '`',
            ''
        ];
        if (v.wert) {
            rumpf.push('### Vorschlag der Seite', '',
                '- Wert: **' + v.wert + '**',
                '- Quelle: ' + (v.quelle || '—'),
                '- Einstufung: ' + (v.einstufung || '—'),
                '- Begründung: ' + (v.begruendung || '—'));
            if (v.grundform) {
                rumpf.push('- Fähigkeiten der Grundform (' + v.grundform + '): '
                    + (v.basisFaehigkeiten || []).join(', '));
            }
            rumpf.push('');
        } else {
            rumpf.push('### Vorschlag der Seite', '', 'Keiner — hier fehlt noch eine Quelle.', '');
        }
        rumpf.push('<!-- datenluecke ' + JSON.stringify({
            id: l.id, klasse: l.klasse, vorschlag: v.wert || null
        }) + ' -->');
        return ISSUE_BASIS
            + '?title=' + encodeURIComponent('[Datenlücke] ' + (l.titel || l.id))
            + '&labels=' + encodeURIComponent('datenluecke')
            + '&body=' + encodeURIComponent(rumpf.join('\n'));
    }

    function sammelAdresse(teil, gesamt) {
        var rest = gesamt - teil.length;
        var zeilen = [
            '### Sammelbestätigung',
            '',
            'Ich habe die folgenden Vorschläge geprüft. Was ich NICHT bestätige,',
            'streiche ich unten heraus oder schreibe den richtigen Wert dahinter.',
            ''
        ];
        if (rest > 0) {
            zeilen.push('> Hier stehen ' + teil.length + ' von ' + gesamt
                + ' Lücken. Für die übrigen ' + rest + ' den Knopf danach noch '
                + 'einmal drücken — mehr passt nicht in eine Adresse.', '');
        }
        teil.forEach(function (l) {
            var v = l.vorschlag || {};
            zeilen.push('- [ ] `' + l.id + '` → **' + (v.wert || '—') + '**  ('
                + (v.einstufung || '—') + ', ' + (v.quelle || '—') + ')');
        });
        zeilen.push('', '---', '',
            'Quelle, die ich geprüft habe: ',
            'Notiz: ', '',
            '<!-- datenluecke-sammel ' + JSON.stringify({
                ids: teil.map(function (l) { return l.id; }),
                von: teil.length, gesamt: gesamt
            }) + ' -->');
        return ISSUE_BASIS
            + '?title=' + encodeURIComponent('[Datenlücke] Sammelbestätigung ('
                + teil.length + (rest > 0 ? ' von ' + gesamt : '') + ')')
            + '&labels=' + encodeURIComponent('datenluecke')
            + '&body=' + encodeURIComponent(zeilen.join('\n'));
    }

    /* Nimmt so viele Lücken auf, wie in eine Adresse passen — und sagt
     * im Rumpf, wie viele das sind. Lieber ein Vorgang mit 40 Zeilen
     * und einem Hinweis als ein Knopf, der auf eine Fehlerseite führt.
     */
    function issueUrlSammel(liste) {
        var url = sammelAdresse(liste, liste.length);
        if (url.length <= MAX_ADRESSE) return url;
        var teil = liste.slice();
        while (teil.length > 1) {
            teil = teil.slice(0, teil.length - 1);
            url = sammelAdresse(teil, liste.length);
            if (url.length <= MAX_ADRESSE) return url;
        }
        return url;
    }

    /* Wie viele Lücken der Sammelknopf tatsächlich mitnimmt — die
     * Beschriftung soll keine Zahl versprechen, die die Adresse nicht
     * trägt.
     */
    function sammelAnzahl(liste) {
        var url = issueUrlSammel(liste);
        var m = /datenluecke-sammel/.test(decodeURIComponent(url))
            ? /"von":(\d+)/.exec(decodeURIComponent(url)) : null;
        return m ? Number(m[1]) : liste.length;
    }

    /* ── Zeichnen ─────────────────────────────────────────────── */

    function einstufungHtml(v) {
        var c = t();
        var e = (v && v.einstufung) || 'ungeprueft';
        var text = e === 'eindeutig' ? c.eindeutig
            : e === 'mehrdeutig' ? c.mehrdeutig : c.ungeprueft;
        return '<span class="dl-badge dl-badge--' + esc(e) + '">' + esc(text) + '</span>';
    }

    function karteHtml(l) {
        var c = t();
        var v = l.vorschlag;
        var titel = de() ? (l.titel || l.id) : (l.titelEn || l.titel || l.id);
        var h = '<article class="dl-karte">'
            + '<h3 class="dl-karte-titel">' + esc(titel) + '</h3>'
            + '<p class="dl-wo"><span class="dl-wo-label">' + esc(c.wo) + '</span> '
            + '<code>' + esc(l.wo) + '</code></p>';
        if (l.notiz) h += '<p class="dl-notiz">' + esc(l.notiz) + '</p>';
        if (v) {
            h += '<div class="dl-vorschlag">'
                + '<div class="dl-vorschlag-kopf">'
                + '<span class="dl-vorschlag-label">' + esc(c.vorschlag) + '</span>'
                + einstufungHtml(v) + '</div>'
                + '<p class="dl-wert">' + esc(v.wert) + '</p>';
            if (v.begruendung) h += '<p class="dl-begruendung">' + esc(v.begruendung) + '</p>';
            if (v.grundform && (v.basisFaehigkeiten || []).length) {
                h += '<p class="dl-basis"><span class="dl-wo-label">' + esc(c.grundform)
                    + ' (' + esc(v.grundform) + ')</span> '
                    + esc(v.basisFaehigkeiten.join(', ')) + '</p>';
            }
            h += '</div>';
        } else {
            h += '<p class="dl-kein">' + esc(c.keinVorschlag) + '</p>';
        }
        h += '<div class="dl-aktionen">';
        if (v && v.quelle) {
            h += '<a class="dl-btn dl-btn--still" href="' + esc(v.quelle)
                + '" target="_blank" rel="noopener noreferrer">' + esc(c.btnQuelle) + '</a>';
        }
        h += '<a class="dl-btn dl-btn--haupt" href="' + esc(issueUrl(l))
            + '" target="_blank" rel="noopener noreferrer">' + esc(c.btnSenden) + '</a>'
            + '</div></article>';
        return h;
    }

    function render() {
        var host = document.getElementById('adminHost');
        if (!host) return false;
        var c = t();

        var h = document.getElementById('adminTitel');
        if (h) h.textContent = c.titel;
        var b = document.getElementById('adminZurueck');
        if (b) b.textContent = c.zurueck;

        if (_daten === 'fehler') {
            host.innerHTML = '<div class="ds-empty"><p class="ds-empty-title">'
                + esc(c.fehler) + '</p><p class="ds-empty-body">'
                + esc(c.fehlerText) + '</p></div>';
            return true;
        }
        if (!_daten) {
            /* BEFUND (Agentenrunde 31.08.2026): hier stand host.innerHTML = ''.
               oeffne() ruft render() SOFORT auf, bevor laden() die Daten hat —
               in diesem Fenster loeschte die Seite ihren eigenen Inhalt und
               zeigte einen leeren Kasten ohne jeden Hinweis. Ausgerechnet in
               dieser Datei steht daneben der Kommentar "Melden, nicht still
               leer lassen". */
            host.innerHTML = '<p class="dl-lead">' + esc(c.laedt) + '</p>';
            return true;
        }

        var alle = _daten.luecken || [];
        var klassen = (_daten._meta && _daten._meta.klassen) || {};
        var jeKlasse = (_daten._meta && _daten._meta.jeKlasse) || {};

        var kopf = '<p class="dl-lead">' + esc(c.lead) + '</p>'
            + '<p class="dl-hinweis">' + esc(c.offenHinweis) + '</p>';

        if (!alle.length) {
            host.innerHTML = kopf + '<div class="ds-empty"><p class="ds-empty-title">'
                + esc(c.keine) + '</p><p class="ds-empty-body">'
                + esc(c.keineText) + '</p></div>';
            return true;
        }

        var filter = '<div class="dl-filter" role="group" aria-label="'
            + esc(c.titel) + '">'
            + '<button type="button" class="dl-chip' + (_filter === 'alle' ? ' is-an' : '')
            + '" data-dl-filter="alle">' + esc(c.alle) + ' <b>' + alle.length + '</b></button>';
        Object.keys(jeKlasse).sort().forEach(function (k) {
            var label = (klassen[k] && klassen[k][de() ? 'de' : 'en']) || k;
            filter += '<button type="button" class="dl-chip'
                + (_filter === k ? ' is-an' : '') + '" data-dl-filter="' + esc(k) + '">'
                + esc(label) + ' <b>' + jeKlasse[k] + '</b></button>';
        });
        filter += '</div>';

        var sichtbar = _filter === 'alle'
            ? alle : alle.filter(function (l) { return l.klasse === _filter; });

        var mitVorschlag = sichtbar.filter(function (l) {
            return l.vorschlag && l.vorschlag.wert;
        });
        var sammelN = mitVorschlag.length > 1 ? sammelAnzahl(mitVorschlag) : 0;
        var sammel = mitVorschlag.length > 1
            ? '<div class="dl-sammel"><a class="dl-btn dl-btn--haupt" href="'
                + esc(issueUrlSammel(mitVorschlag)) + '" target="_blank" rel="noopener noreferrer">'
                + esc((sammelN < mitVorschlag.length ? c.btnAlleTeil : c.btnAlle)
                    .replace('%n', String(sammelN))
                    .replace('%g', String(mitVorschlag.length)))
                + '</a></div>'
            : '';

        var stand = (_daten._meta && _daten._meta.erzeugt)
            ? '<p class="dl-stand">' + esc(c.stand) + ': '
                + esc(String(_daten._meta.erzeugt).replace('T', ' ').replace('Z', ' UTC'))
                + '</p>'
            : '';

        host.innerHTML = kopf + filter
            + '<div class="dl-liste">' + sichtbar.map(karteHtml).join('') + '</div>'
            + sammel
            + '<div class="dl-fuss"><h3>' + esc(c.wieWeiter) + '</h3><p>'
            + esc(c.wieWeiterText) + '</p>' + stand + '</div>';
        return true;
    }

    function laden() {
        if (_laden) return _laden;
        _laden = fetch(LUECKEN_URL, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (j) { _daten = j; return j; })
            .catch(function (e) {
                // Melden, nicht still leer lassen: eine leere Seite liest
                // sich wie "keine Luecken", und das waere eine Aussage.
                if (window.console) console.warn('[admin] Inventar nicht ladbar:', e);
                _daten = 'fehler';
                return null;
            })
            .then(function (x) { render(); return x; });
        return _laden;
    }

    function oeffne() {
        render();          // sofort Titel und Rueckweg, damit nichts leer blitzt
        return laden();
    }

    document.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest('[data-dl-filter]');
        if (!btn) return;
        _filter = btn.getAttribute('data-dl-filter') || 'alle';
        render();
    });

    document.addEventListener('languageChanged', function () {
        var host = document.getElementById('adminHost');
        if (host && host.children.length) render();
    });

    window.DsAdmin = {
        render: render,
        open: oeffne,
        _intern: { issueUrl: issueUrl, issueUrlSammel: issueUrlSammel,
                   sammelAnzahl: sammelAnzahl, MAX_ADRESSE: MAX_ADRESSE, T: T }
    };
})();
