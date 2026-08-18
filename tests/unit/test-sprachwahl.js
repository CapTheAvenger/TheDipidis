/**
 * Die Sprachwahl — und die Wahl, die nie eine war.
 *
 * Gemessen am 18.08.2026 im Browser des Seitenbetreibers, auf der
 * eigenen, deutschsprachigen Seite:
 *
 *   navigator.language      de-DE
 *   localStorage.app_lang   en      <- gewinnt
 *   i18nPreferredLang()     de      <- der Block-4-Fix, wirkungslos
 *
 * Bis zum 18.08.2026 stand der Standard hart auf 'en' UND der
 * Umschalter zeigte die aktive statt der Zielsprache. Wer damals "DE"
 * las und darauf tippte, weil er Deutsch wollte, schaltete nach
 * Englisch — und switchLanguage() schrieb das als bewusste Wahl in den
 * Speicher. Block 4 hat beides repariert, aber eine gespeicherte Wahl
 * schlaegt den Standard. Der Fix konnte die Leute, fuer die er gemacht
 * war, nicht erreichen.
 *
 * Diese Tests halten die einmalige Bereinigung fest: sie greift nur im
 * eindeutigen Versehensfall, sie laeuft genau einmal, und sie stellt
 * nicht still um.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'ui-components.css'), 'utf8');

// Die beiden reinen Funktionen aus dem echten Quelltext holen, nicht
// abschreiben. (Der Fehler aus Block 8: ein Test, der eine Kopie gegen
// sich selbst prueft, findet nie etwas.)
function loadLangLogic(nav, store) {
    const grab = re => {
        const m = re.exec(SRC);
        if (!m) throw new Error('nicht im Quelltext gefunden: ' + re);
        return m[0];
    };
    const src = [
        "const I18N_STORAGE_KEY = 'app_lang';",
        "const I18N_SUPPORTED = ['en', 'de'];",
        grab(/const I18N_MIGRATION_KEY = '[^']+';/),
        grab(/function i18nPreferredLang\(\) \{[\s\S]*?\n\}/),
        grab(/function i18nMigrateStoredLang\(\) \{[\s\S]*?\n\}/),
        'return { i18nPreferredLang, i18nMigrateStoredLang, I18N_MIGRATION_KEY };',
    ].join('\n');
    const localStorage = {
        _d: Object.assign({}, store),
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); },
    };
    // eslint-disable-next-line no-new-func
    const api = new Function('navigator', 'localStorage', src)(nav, localStorage);
    return Object.assign({ store: localStorage._d }, api);
}

const DE = { language: 'de-DE', languages: ['de-DE', 'de', 'en-US', 'en'] };
const EN = { language: 'en-US', languages: ['en-US', 'en'] };
const FR = { language: 'fr-FR', languages: ['fr-FR', 'fr'] };

describe('i18nPreferredLang — was ein Browser sagt', () => {
    it('deutscher Browser will Deutsch', () => {
        assert.strictEqual(loadLangLogic(DE, {}).i18nPreferredLang(), 'de');
    });
    it('englischer Browser will Englisch', () => {
        assert.strictEqual(loadLangLogic(EN, {}).i18nPreferredLang(), 'en');
    });
    it('eine Sprache, die es nicht gibt, faellt auf Deutsch — nicht auf Englisch', () => {
        // Die Seite heisst "Dein Portal fuer Meta-Analyse & Deckbau".
        assert.strictEqual(loadLangLogic(FR, {}).i18nPreferredLang(), 'de');
    });
    it('ohne navigator faellt es auf Deutsch statt zu werfen', () => {
        assert.strictEqual(loadLangLogic(undefined, {}).i18nPreferredLang(), 'de');
    });
});

describe('i18nMigrateStoredLang — greift genau im Versehensfall', () => {
    it('deutscher Browser mit gespeichertem "en" wird auf Deutsch gestellt', () => {
        const m = loadLangLogic(DE, { app_lang: 'en' });
        assert.strictEqual(m.i18nMigrateStoredLang(), 'de');
        assert.strictEqual(m.store.app_lang, 'de');
    });

    it('gespeichertes "de" wird NICHT angefasst', () => {
        const m = loadLangLogic(DE, { app_lang: 'de' });
        assert.strictEqual(m.i18nMigrateStoredLang(), null);
        assert.strictEqual(m.store.app_lang, 'de');
    });

    it('englischer Browser mit "en" wird NICHT angefasst — das ist eine echte Wahl', () => {
        const m = loadLangLogic(EN, { app_lang: 'en' });
        assert.strictEqual(m.i18nMigrateStoredLang(), null);
        assert.strictEqual(m.store.app_lang, 'en');
    });

    it('ohne gespeicherte Wahl passiert nichts — es gab nichts zu korrigieren', () => {
        const m = loadLangLogic(DE, {});
        assert.strictEqual(m.i18nMigrateStoredLang(), null);
        assert.strictEqual(m.store.app_lang, undefined);
    });

    it('laeuft genau einmal, auch wenn der Nutzer danach zurueckschaltet', () => {
        const m = loadLangLogic(DE, { app_lang: 'en' });
        assert.strictEqual(m.i18nMigrateStoredLang(), 'de');
        m.store.app_lang = 'en';                  // Nutzer klickt zurueck
        assert.strictEqual(m.i18nMigrateStoredLang(), null, 'darf nicht ein zweites Mal umstellen');
        assert.strictEqual(m.store.app_lang, 'en', 'die zweite Wahl bleibt stehen');
    });

    it('setzt die Marke auch dann, wenn nichts umgestellt wurde', () => {
        // Sonst laeuft die Pruefung bei jedem Seitenaufruf erneut.
        const m = loadLangLogic(EN, { app_lang: 'en' });
        m.i18nMigrateStoredLang();
        assert.strictEqual(m.store[m.I18N_MIGRATION_KEY], '1');
    });
});

describe('der Hinweis — nicht still umstellen', () => {
    it('es gibt eine Funktion, die den Hinweis zeichnet', () => {
        assert.match(SRC, /function renderLangResetNotice\(target\)/);
    });

    it('sie wird beim Laden mit dem Ergebnis der Bereinigung aufgerufen', () => {
        assert.match(SRC, /renderLangResetNotice\(I18N_MIGRATED_TO\)/);
    });

    it('der Hinweis hat einen Rueckweg, der die Sprache wirklich umschaltet', () => {
        const fn = /function renderLangResetNotice\(target\) \{[\s\S]*?\n\}/.exec(SRC)[0];
        assert.match(fn, /switchLanguage\(/, 'ohne Rueckweg ist der Hinweis eine Sackgasse');
        assert.match(fn, /role', 'status'/, 'ein Hinweis muss angesagt werden');
    });

    it('der Hinweis erscheint hoechstens einmal im Dokument', () => {
        const fn = /function renderLangResetNotice\(target\) \{[\s\S]*?\n\}/.exec(SRC)[0];
        assert.match(fn, /getElementById\('langResetNotice'\)/);
    });

    it('er ist gestaltet und nutzt Tokens statt fester Farben', () => {
        const rule = /\.lang-reset-notice\s*\{([^}]*)\}/.exec(CSS);
        assert.ok(rule, '.lang-reset-notice fehlt im Stylesheet');
        assert.match(rule[1], /var\(--/);
    });

    it('seine Knoepfe sind gross genug zum Antippen', () => {
        const back = /\.lang-reset-notice-back\s*\{([^}]*)\}/.exec(CSS)[1];
        assert.ok(Number(/min-height:\s*(\d+)px/.exec(back)[1]) >= 28);
    });
});

describe('der Umschalter beschriftet sein Ziel, nicht seinen Zustand', () => {
    it('die Beschriftung ist die ANDERE Sprache', () => {
        assert.match(SRC, /const target = currentLang === 'de' \? 'en' : 'de';/);
        assert.match(SRC, /toggle\.textContent = target\.toUpperCase\(\);/);
    });
    it('es gibt keinen Rueckfall auf die alte Logik mehr', () => {
        assert.ok(!/textContent = currentLang === 'de' \? 'DE' : 'EN'/.test(SRC));
    });
});
