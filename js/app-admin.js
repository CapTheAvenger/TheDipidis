/* Admin — Datenlücken und der Weg, sie zu schließen.
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

    function issueUrlSammel(liste) {
        var zeilen = [
            '### Sammelbestätigung',
            '',
            'Ich habe die folgenden Vorschläge geprüft. Was ich NICHT bestätige,',
            'streiche ich unten heraus oder schreibe den richtigen Wert dahinter.',
            ''
        ];
        liste.forEach(function (l) {
            var v = l.vorschlag || {};
            zeilen.push('- [ ] `' + l.id + '` → **' + (v.wert || '—') + '**  ('
                + (v.einstufung || '—') + ', ' + (v.quelle || '—') + ')');
        });
        zeilen.push('', '---', '',
            'Quelle, die ich geprüft habe: ',
            'Notiz: ', '',
            '<!-- datenluecke-sammel ' + JSON.stringify({
                ids: liste.map(function (l) { return l.id; })
            }) + ' -->');
        return ISSUE_BASIS
            + '?title=' + encodeURIComponent('[Datenlücke] Sammelbestätigung ('
                + liste.length + ')')
            + '&labels=' + encodeURIComponent('datenluecke')
            + '&body=' + encodeURIComponent(zeilen.join('\n'));
    }

    /* ── Zeichnen ─────────────────────────────────────────────── */

    function einstufungHtml(v) {
        var c = t();
        var e = (v && v.einstufung) || 'ungeprueft';
        var text = e === 'eindeutig' ? c.eindeutig
            : e === 'mehrdeutig' ? c.mehrdeutig : c.ungeprueft;
        return '<span class="ad-badge ad-badge--' + esc(e) + '">' + esc(text) + '</span>';
    }

    function karteHtml(l) {
        var c = t();
        var v = l.vorschlag;
        var titel = de() ? (l.titel || l.id) : (l.titelEn || l.titel || l.id);
        var h = '<article class="ad-karte">'
            + '<h3 class="ad-karte-titel">' + esc(titel) + '</h3>'
            + '<p class="ad-wo"><span class="ad-wo-label">' + esc(c.wo) + '</span> '
            + '<code>' + esc(l.wo) + '</code></p>';
        if (l.notiz) h += '<p class="ad-notiz">' + esc(l.notiz) + '</p>';
        if (v) {
            h += '<div class="ad-vorschlag">'
                + '<div class="ad-vorschlag-kopf">'
                + '<span class="ad-vorschlag-label">' + esc(c.vorschlag) + '</span>'
                + einstufungHtml(v) + '</div>'
                + '<p class="ad-wert">' + esc(v.wert) + '</p>';
            if (v.begruendung) h += '<p class="ad-begruendung">' + esc(v.begruendung) + '</p>';
            if (v.grundform && (v.basisFaehigkeiten || []).length) {
                h += '<p class="ad-basis"><span class="ad-wo-label">' + esc(c.grundform)
                    + ' (' + esc(v.grundform) + ')</span> '
                    + esc(v.basisFaehigkeiten.join(', ')) + '</p>';
            }
            h += '</div>';
        } else {
            h += '<p class="ad-kein">' + esc(c.keinVorschlag) + '</p>';
        }
        h += '<div class="ad-aktionen">';
        if (v && v.quelle) {
            h += '<a class="ad-btn ad-btn--still" href="' + esc(v.quelle)
                + '" target="_blank" rel="noopener noreferrer">' + esc(c.btnQuelle) + '</a>';
        }
        h += '<a class="ad-btn ad-btn--haupt" href="' + esc(issueUrl(l))
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
        if (!_daten) { host.innerHTML = ''; return true; }

        var alle = _daten.luecken || [];
        var klassen = (_daten._meta && _daten._meta.klassen) || {};
        var jeKlasse = (_daten._meta && _daten._meta.jeKlasse) || {};

        var kopf = '<p class="ad-lead">' + esc(c.lead) + '</p>'
            + '<p class="ad-hinweis">' + esc(c.offenHinweis) + '</p>';

        if (!alle.length) {
            host.innerHTML = kopf + '<div class="ds-empty"><p class="ds-empty-title">'
                + esc(c.keine) + '</p><p class="ds-empty-body">'
                + esc(c.keineText) + '</p></div>';
            return true;
        }

        var filter = '<div class="ad-filter" role="group" aria-label="'
            + esc(c.titel) + '">'
            + '<button type="button" class="ad-chip' + (_filter === 'alle' ? ' is-an' : '')
            + '" data-ad-filter="alle">' + esc(c.alle) + ' <b>' + alle.length + '</b></button>';
        Object.keys(jeKlasse).sort().forEach(function (k) {
            var label = (klassen[k] && klassen[k][de() ? 'de' : 'en']) || k;
            filter += '<button type="button" class="ad-chip'
                + (_filter === k ? ' is-an' : '') + '" data-ad-filter="' + esc(k) + '">'
                + esc(label) + ' <b>' + jeKlasse[k] + '</b></button>';
        });
        filter += '</div>';

        var sichtbar = _filter === 'alle'
            ? alle : alle.filter(function (l) { return l.klasse === _filter; });

        var mitVorschlag = sichtbar.filter(function (l) {
            return l.vorschlag && l.vorschlag.wert;
        });
        var sammel = mitVorschlag.length > 1
            ? '<div class="ad-sammel"><a class="ad-btn ad-btn--haupt" href="'
                + esc(issueUrlSammel(mitVorschlag)) + '" target="_blank" rel="noopener noreferrer">'
                + esc(c.btnAlle.replace('%n', String(mitVorschlag.length))) + '</a></div>'
            : '';

        var stand = (_daten._meta && _daten._meta.erzeugt)
            ? '<p class="ad-stand">' + esc(c.stand) + ': '
                + esc(String(_daten._meta.erzeugt).replace('T', ' ').replace('Z', ' UTC'))
                + '</p>'
            : '';

        host.innerHTML = kopf + filter
            + '<div class="ad-liste">' + sichtbar.map(karteHtml).join('') + '</div>'
            + sammel
            + '<div class="ad-fuss"><h3>' + esc(c.wieWeiter) + '</h3><p>'
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
        var btn = ev.target && ev.target.closest && ev.target.closest('[data-ad-filter]');
        if (!btn) return;
        _filter = btn.getAttribute('data-ad-filter') || 'alle';
        render();
    });

    document.addEventListener('languageChanged', function () {
        var host = document.getElementById('adminHost');
        if (host && host.children.length) render();
    });

    window.DsAdmin = {
        render: render,
        open: oeffne,
        _intern: { issueUrl: issueUrl, issueUrlSammel: issueUrlSammel, T: T }
    };
})();
