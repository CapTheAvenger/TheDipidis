/* ═══════════════════════════════════════════════════════════════
   i18n.js – Internationalization (Deutsch / English)
   ═══════════════════════════════════════════════════════════════ */

const I18N_STORAGE_KEY = 'app_lang';
const I18N_DEFAULT_LANG = 'en';
const I18N_SUPPORTED = ['en', 'de'];

/* ── translation dictionary ─────────────────────────────────── */
const translations = {
  en: {
    // ── Main title & header ──────────────────────────────────
    'app.title':              '🎴 Pokémon TCG Hub',
    'app.subtitle':           'Your Portal for Meta Analysis & Deck Building',
    'header.signIn':          'Sign In',
    'header.myProfile':       'My Profile',

    // ── Sidebar / Main Menu ──────────────────────────────────
    'menu.title':             'Main Menu',
    'menu.cityLeague':        '🇯🇵 City League Meta',
    'menu.cityLeagueAnalysis':'📊 Deck Analysis (Japan)',
    'menu.currentMeta':       '🎮 Current Meta (Global)',
    'menu.currentMetaAnalysis':'📈 Deck Analysis (Global)',
    'menu.pastMeta':          '🏆 Past Meta',
    'menu.cardDatabase':      '🧰 Card Database',
    'menu.proxyPrinter':      '🖨️ Proxy Printer',
    'menu.playtester':        '⚔️ Playtester Sandbox',
    'menu.profile':           '👤 My Profile',
    'menu.howToUse':          '📖 How to Use',

    // ── Tab labels ───────────────────────────────────────────
    'tab.cityLeague':         '🇯🇵 City League Meta',
    'tab.cityLeagueSub':      '(Japanese Tournaments)',
    'tab.cityLeagueAnalysis': '📊 City League Deck Analysis',
    'tab.currentMeta':        '🎮 Current Meta',
    'tab.currentMetaSub':     '(Global Meta & Online)',
    'tab.currentMetaAnalysis':'📈 Current Meta Deck Analysis',
    'tab.pastMeta':           '🏆 Past Meta',
    'tab.cards':              '🧰 Cards',
    'tab.proxyPrinter':       '🖨️ Proxy Printer',
    'tab.playtester':         '⚔️ Playtester',
    'tab.profile':            '👤 Profile',
    'tab.howToUse':           '📖 How to Use',

    // ── Common buttons / actions ─────────────────────────────
    'btn.save':               '💾 Save',
    'btn.copy':               '📋 Copy',
    'btn.close':              'Close',
    'btn.cancel':             'Cancel',
    'btn.confirm':            'Confirm',
    'btn.delete':             'Delete',
    'btn.clear':              '🗑️ Clear',
    'btn.search':             '🔍 Search',
    'btn.reset':              '🔄 Reset Filters',
    'btn.compare':            '🔄 Compare',
    'btn.share':              '🔗 Share',
    'btn.import':             '📥 Import',
    'btn.export':             '📤 Export',
    'btn.importPTCGL':        '📥 PTCGL',
    'btn.exportPTCGL':        '📤 PTCGL',
    'btn.print':              '🖨️ Print Queue',
    'btn.generate':           '🪄 Generate',
    'btn.consistency':        '🎯 Consistency',
    'btn.testDraw':           '🎲 Test Draw',
    'btn.playtest':           '🃏 Playtest',
    'btn.addCard':            '➕ Add Card',
    'btn.gridView':           '🖼️ Grid',
    'btn.deckToProxy':        '🖨️ Deck → Proxy',
    'btn.loadMetaAnalysis':   '🔄 Load Meta Analysis',
    'btn.resetDeck':          '🔄 Reset Deck',

    // ── Section headings ─────────────────────────────────────
    'section.deckBuilder':    '🛠️ Deck Builder',
    'section.yourDeck':       '🎴 Your Deck',
    'section.deckStats':      '📊 Deck Statistics',
    'section.cardOverview':   '🃏 Card Overview',
    'section.metaCards':      '🌍 Meta Card Analysis (Top 10 Archetypes)',
    'section.matchups':       '⚔️ Best/Worst Matchups',
    'section.importDecklist': '📋 Import Decklist',
    'section.addSingleCard':  '🎯 Add Single Card',

    // ── Filters & labels ─────────────────────────────────────
    'filter.tournamentPeriod':'📅 Tournament Period Filter',
    'filter.from':            'From:',
    'filter.to':              'To:',
    'filter.searchDeck':      '🔍 Search Deck',
    'filter.selectArchetype': '🎯 Select Deck Archetype',
    'filter.cardShareFilter': '🦂 Card Share Filter',
    'filter.formatFilter':    '📊 Tournament Format Filter',
    'filter.metaFormat':      '📊 Meta / Format',
    'filter.set':             '📦 Set',
    'filter.rarity':          '💎 Rarity',
    'filter.category':        '🎴 Category',
    'filter.all':             'All',

    // ── Card types (used in filters) ─────────────────────────
    'cardType.pokemon':       'Pokémon',
    'cardType.supporter':     'Supporter',
    'cardType.item':          'Item',
    'cardType.tool':          'Tool',
    'cardType.stadium':       'Stadium',
    'cardType.energy':        'Energy',
    'cardType.specialEnergy': 'Special Energy',
    'cardType.aceSpec':       'Ace Spec',

    // ── Auth / login ─────────────────────────────────────────
    'auth.signIn':            'Sign In',
    'auth.createAccount':     'Create Account',
    'auth.email':             'Email',
    'auth.password':          'Password',
    'auth.confirmPassword':   'Confirm Password',
    'auth.noAccount':         "Don't have an account? Sign Up",
    'auth.forgotPassword':    'Forgot password?',
    'auth.googleSignIn':      'Sign in with Google',

    // ── Footer ───────────────────────────────────────────────
    'footer.lastUpdate':      '📅 Last Update:',

    // ── Misc ─────────────────────────────────────────────────
    'misc.unique':            'Unique:',
    'misc.copies':            'Copies:',
    'misc.player1':           '👤 Player 1',
    'misc.player2':           '👤 Player 2',
    'misc.startSimulator':    '🚀 START SIMULATOR',
    'misc.multiplayer':       '🌐 MULTIPLAYER',
    'misc.tipMirrorMatch':    '💡 Tip: Mirror Match — both players use the same deck',
  },

  de: {
    // ── Main title & header ──────────────────────────────────
    'app.title':              '🎴 Pokémon TCG Hub',
    'app.subtitle':           'Dein Portal für Meta-Analyse & Deckbau',
    'header.signIn':          'Anmelden',
    'header.myProfile':       'Mein Profil',

    // ── Sidebar / Main Menu ──────────────────────────────────
    'menu.title':             'Hauptmenü',
    'menu.cityLeague':        '🇯🇵 City League Meta',
    'menu.cityLeagueAnalysis':'📊 Deck-Analyse (Japan)',
    'menu.currentMeta':       '🎮 Aktuelles Meta (Global)',
    'menu.currentMetaAnalysis':'📈 Deck-Analyse (Global)',
    'menu.pastMeta':          '🏆 Vergangenes Meta',
    'menu.cardDatabase':      '🧰 Kartendatenbank',
    'menu.proxyPrinter':      '🖨️ Proxy-Drucker',
    'menu.playtester':        '⚔️ Playtester Sandbox',
    'menu.profile':           '👤 Mein Profil',
    'menu.howToUse':          '📖 Anleitung',

    // ── Tab labels ───────────────────────────────────────────
    'tab.cityLeague':         '🇯🇵 City League Meta',
    'tab.cityLeagueSub':      '(Japanische Turniere)',
    'tab.cityLeagueAnalysis': '📊 City League Deck-Analyse',
    'tab.currentMeta':        '🎮 Aktuelles Meta',
    'tab.currentMetaSub':     '(Globales Meta & Online)',
    'tab.currentMetaAnalysis':'📈 Aktuelle Meta Deck-Analyse',
    'tab.pastMeta':           '🏆 Vergangenes Meta',
    'tab.cards':              '🧰 Karten',
    'tab.proxyPrinter':       '🖨️ Proxy-Drucker',
    'tab.playtester':         '⚔️ Playtester',
    'tab.profile':            '👤 Profil',
    'tab.howToUse':           '📖 Anleitung',

    // ── Common buttons / actions ─────────────────────────────
    'btn.save':               '💾 Speichern',
    'btn.copy':               '📋 Kopieren',
    'btn.close':              'Schließen',
    'btn.cancel':             'Abbrechen',
    'btn.confirm':            'Bestätigen',
    'btn.delete':             'Löschen',
    'btn.clear':              '🗑️ Leeren',
    'btn.search':             '🔍 Suche',
    'btn.reset':              '🔄 Filter zurücksetzen',
    'btn.compare':            '🔄 Vergleichen',
    'btn.share':              '🔗 Teilen',
    'btn.import':             '📥 Importieren',
    'btn.export':             '📤 Exportieren',
    'btn.importPTCGL':        '📥 PTCGL',
    'btn.exportPTCGL':        '📤 PTCGL',
    'btn.print':              '🖨️ Druckwarteschlange',
    'btn.generate':           '🪄 Generieren',
    'btn.consistency':        '🎯 Konsistenz',
    'btn.testDraw':           '🎲 Testhand',
    'btn.playtest':           '🃏 Playtesten',
    'btn.addCard':            '➕ Karte hinzufügen',
    'btn.gridView':           '🖼️ Raster',
    'btn.deckToProxy':        '🖨️ Deck → Proxy',
    'btn.loadMetaAnalysis':   '🔄 Meta-Analyse laden',
    'btn.resetDeck':          '🔄 Deck zurücksetzen',

    // ── Section headings ─────────────────────────────────────
    'section.deckBuilder':    '🛠️ Deckbau',
    'section.yourDeck':       '🎴 Dein Deck',
    'section.deckStats':      '📊 Deck-Statistiken',
    'section.cardOverview':   '🃏 Kartenübersicht',
    'section.metaCards':      '🌍 Meta-Karten-Analyse (Top 10 Archetypen)',
    'section.matchups':       '⚔️ Beste/Schlechteste Matchups',
    'section.importDecklist': '📋 Deckliste importieren',
    'section.addSingleCard':  '🎯 Einzelne Karte hinzufügen',

    // ── Filters & labels ─────────────────────────────────────
    'filter.tournamentPeriod':'📅 Turnierzeitraum-Filter',
    'filter.from':            'Von:',
    'filter.to':              'Bis:',
    'filter.searchDeck':      '🔍 Deck suchen',
    'filter.selectArchetype': '🎯 Deck-Archetyp wählen',
    'filter.cardShareFilter': '🦂 Karten-Anteil-Filter',
    'filter.formatFilter':    '📊 Turnierformat-Filter',
    'filter.metaFormat':      '📊 Meta / Format',
    'filter.set':             '📦 Set',
    'filter.rarity':          '💎 Seltenheit',
    'filter.category':        '🎴 Kategorie',
    'filter.all':             'Alle',

    // ── Card types (used in filters) ─────────────────────────
    'cardType.pokemon':       'Pokémon',
    'cardType.supporter':     'Unterstützer',
    'cardType.item':          'Item',
    'cardType.tool':          'Werkzeug',
    'cardType.stadium':       'Stadion',
    'cardType.energy':        'Energie',
    'cardType.specialEnergy': 'Spezial-Energie',
    'cardType.aceSpec':       'Ass-Spezi',

    // ── Auth / login ─────────────────────────────────────────
    'auth.signIn':            'Anmelden',
    'auth.createAccount':     'Konto erstellen',
    'auth.email':             'E-Mail',
    'auth.password':          'Passwort',
    'auth.confirmPassword':   'Passwort bestätigen',
    'auth.noAccount':         'Noch kein Konto? Registrieren',
    'auth.forgotPassword':    'Passwort vergessen?',
    'auth.googleSignIn':      'Mit Google anmelden',

    // ── Footer ───────────────────────────────────────────────
    'footer.lastUpdate':      '📅 Letztes Update:',

    // ── Misc ─────────────────────────────────────────────────
    'misc.unique':            'Einzigartig:',
    'misc.copies':            'Kopien:',
    'misc.player1':           '👤 Spieler 1',
    'misc.player2':           '👤 Spieler 2',
    'misc.startSimulator':    '🚀 SIMULATOR STARTEN',
    'misc.multiplayer':       '🌐 MEHRSPIELER',
    'misc.tipMirrorMatch':    '💡 Tipp: Spiegelkampf — beide Spieler nutzen dasselbe Deck',
  }
};

/* ── state ───────────────────────────────────────────────────── */
let currentLang = localStorage.getItem(I18N_STORAGE_KEY)
                  || I18N_DEFAULT_LANG;
if (!I18N_SUPPORTED.includes(currentLang)) currentLang = I18N_DEFAULT_LANG;

/* ── core API ────────────────────────────────────────────────── */

/**
 * Return the translated string for `key` in the current language.
 * Falls back to English, then returns the key itself if nothing found.
 */
function t(key) {
  const lang = translations[currentLang];
  if (lang && lang[key] !== undefined) return lang[key];
  const fallback = translations[I18N_DEFAULT_LANG];
  if (fallback && fallback[key] !== undefined) return fallback[key];
  return key;                     // last resort: show the key
}

/**
 * Switch to `lang` ('en' or 'de'), persist choice, update DOM.
 * Dispatches a 'languageChanged' CustomEvent on document so other
 * modules (charts, dynamic tables) can re-render.
 */
function switchLanguage(lang) {
  if (!I18N_SUPPORTED.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(I18N_STORAGE_KEY, lang);
  updateTranslationsInDOM();
  document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
}

/**
 * Return the currently active language code ('en' | 'de').
 */
function getLang() {
  return currentLang;
}

/* ── DOM updater ─────────────────────────────────────────────── */

/**
 * Walk all elements with `data-i18n` and replace visible text.
 *
 * Supported attributes:
 *   data-i18n="key"              → sets innerHTML
 *   data-i18n-placeholder="key"  → sets placeholder
 *   data-i18n-title="key"        → sets title attribute
 *   data-i18n-aria="key"         → sets aria-label
 */
function updateTranslationsInDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.innerHTML = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });

  // Update the language toggle button label
  const toggle = document.getElementById('langToggleBtn');
  if (toggle) toggle.textContent = currentLang === 'de' ? '🇬🇧 EN' : '🇩🇪 DE';
}

/* ── auto-init on load ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  updateTranslationsInDOM();
});
