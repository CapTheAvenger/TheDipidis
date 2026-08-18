/**
 * Block 7 — zwei Stellen, an denen die Anmeldung im Weg stand.
 *
 * 1. Meta Call lag als Untertab in #profile-content und war damit
 *    ausgeloggt unsichtbar. Gezaehlt in js/app-meta-call.js: 10.839
 *    Zeilen, davon NULL Treffer fuer currentUser, getCurrentUser oder
 *    window.auth. Die Szenarien liegen in localStorage, die Felddaten
 *    in data/. Es brauchte den Login nie — nur den Container.
 *
 * 2. Die Kartendatenbank rendert ausgeloggt 180 von 291 Knoepfen fuer
 *    Sammlung, Wunschliste und Tauschliste. Jeder antwortete auf einen
 *    Klick mit "Please sign in to use this feature" als roter
 *    Fehlermeldung — auf Englisch, auf einer deutschsprachigen Seite,
 *    und ohne einen Weg zur Anmeldung.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Kommentare zaehlen nicht mit. Diese Dateien erklaeren den Befund
// ausfuehrlich und nennen dabei genau die Namen, nach denen hier
// gesucht wird — ein Scanner, der das mitliest, findet Code, den es
// nicht gibt.
const code = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const HTML = R('index.html');
const MC = R('js/app-meta-call.js');
const CORE = R('js/app-core.js');
const NAV = R('js/ds-nav.js');
const FC = R('js/firebase-collection.js');
const CFG = R('js/firebase-config.js');
const INIT = R('js/inline-init.js');
const I18N = R('js/i18n.js');
const TG = R('js/app-testing-groups.js');

describe('Meta Call: eigener Tab statt Profil-Untertab', () => {
    it('es gibt einen Tab-Container #meta-call', () => {
        assert.match(HTML, /<div id="meta-call" class="tab-content">/);
        assert.match(HTML, /id="metaCallHost"/);
    });

    it('der alte Profil-Container ist weg', () => {
        assert.ok(!/id="profile-metacall"/.test(HTML),
            'Meta Call haengt wieder in #profile-content und ist damit ausgeloggt unsichtbar.');
        assert.ok(!/getElementById\('profile-metacall'\)/.test(MC),
            'js/app-meta-call.js zielt wieder auf den Profil-Container.');
    });

    it('das Modul braucht die Anmeldung nach wie vor nicht', () => {
        // Wenn hier je ein Treffer auftaucht, ist die Entkopplung nicht
        // mehr umsonst zu haben und der Fall gehoert neu bewertet.
        const hits = (code(MC).match(/currentUser|getCurrentUser|window\.auth\b/g) || []);
        assert.deepEqual(hits, [],
            'js/app-meta-call.js liest jetzt den Anmeldezustand: ' + hits.join(', '));
    });

    it('switchTab initialisiert es', () => {
        assert.match(CORE, /case 'meta-call':\s*\n\s*if \(typeof MetaCall !== 'undefined'\) MetaCall\.init\(\);/);
    });

    it('die Hauptnavigation zeigt unter Turnier darauf', () => {
        assert.match(NAV, /id: 'turnier',\s*go: 'meta-call',/);
        assert.match(NAV, /tabs: \['meta-call'\]/);
        // Der Sonderfall im Profil kennt Meta Call nicht mehr.
        assert.ok(!/metacall\|journal/.test(NAV),
            'groupForTab() sucht wieder nach dem Meta-Call-Untertab im Profil.');
    });

    it('Tiefenlinks fuehren hin', () => {
        assert.match(INIT, /'metacall':\s*'meta-call'/);
        assert.match(INIT, /'meta-call':\s*'meta-call'/);
    });

    it('der Menueeintrag steht in beiden Sprachen', () => {
        assert.match(HTML, /id="menu-btn-meta-call"/);
        assert.equal((I18N.match(/'menu\.metaCall'/g) || []).length, 2);
        assert.equal((I18N.match(/'menu\.metaCallTitle'/g) || []).length, 2);
    });

    it('Testing Groups springt in den neuen Tab', () => {
        assert.ok(!/switchProfileTab\('metacall'\)/.test(TG),
            'Der Import aus einer Testing Group zielt wieder auf den Profil-Untertab.');
        assert.match(TG, /switchTabAndUpdateMenu\('meta-call'\)/);
    });
});

describe('Ausgeloggt: die Sammlungsknoepfe fuehren zur Anmeldung', () => {
    it('kein "Please sign in"-Fehler mehr im Code', () => {
        // Zwei verbleibende Treffer sind der Kommentar am Wechter und
        // sein englischer Rueckfalltext.
        const calls = (code(FC).match(/showNotification\('Please sign in to use this feature', 'error'\)/g) || []);
        assert.deepEqual(calls, [],
            calls.length + ' Stellen antworten wieder mit einer roten Fehlermeldung.');
    });

    it('es gibt einen Waechter, und er oeffnet die Anmeldung', () => {
        assert.match(FC, /function requireSignIn\(\)/);
        assert.match(FC, /window\.showAuthModal\('signin'\)/);
        const guards = (FC.match(/if \(!requireSignIn\(\)\) return;/g) || []).length;
        assert.ok(guards >= 9,
            `Erwartet mindestens 9 bewachte Stellen, gefunden ${guards}.`);
    });

    it('der Anmeldezustand steht als Klasse am Dokument', () => {
        assert.match(CFG, /classList\.toggle\('is-signed-out', !user\)/);
        // Beim Start, bevor Firebase antwortet, gilt: nicht angemeldet.
        // Sonst blitzen die Knoepfe kurz im aktiven Zustand auf.
        assert.match(INIT, /classList\.add\('is-signed-out'\)/);
    });

    it('gesperrte Knoepfe sind gedaempft, nicht versteckt', () => {
        const CSS = R('css/components.css');
        assert.match(CSS, /html\.is-signed-out \[onclick\*="Collection"\]/);
        assert.ok(!/html\.is-signed-out[^{]*\{[^}]*display:\s*none/.test(CSS),
            'Die Knoepfe werden ausgeblendet. Wer die Funktion nie sieht, sucht sie auch nicht.');
    });
});
