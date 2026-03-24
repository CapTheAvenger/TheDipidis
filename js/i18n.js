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

    // ── Modal / dialog common ────────────────────────────────────────
    'modal.cancel':             'Cancel',
    'modal.ok':                 'OK',
    'modal.copy':               'Copy',
    'modal.copied':             'Copied!',

    // ── app-core.js — proxy ──────────────────────────────────────
    'proxy.queueEmpty':         'No cards in proxy queue yet. Use the "Proxy" buttons in Overview, Deck, Meta Cards, Cards DB or Comparison.',
    'proxy.noPrint':            'No print specified',
    'proxy.remove':             'Remove',
    'proxy.addedToQueue':       'Added to proxy queue:',
    'proxy.clearConfirm':       'Clear complete proxy queue?',
    'proxy.noDeckCards':        'No deck cards found for this source.',
    'proxy.deckCardsAdded':     'deck cards added to proxy queue',
    'proxy.pasteFirst':         'Paste a decklist first.',
    'proxy.parseError':         'Could not parse decklist. Use format: 4 Buddy-Buddy Poffin SVI 186',
    'proxy.cardsImported':      'cards imported into proxy queue',
    'proxy.enterCardName':      'Please enter a card name.',
    'proxy.queueEmptyToast':    'Proxy queue is empty.',
    'proxy.printBlocked':       'Unable to open print window. Please allow popups for this site.',
    'proxy.printTitle':         'Proxy Print',
    'proxy.noNewCards':         'No newly added cards found in comparison results.',
    'proxy.compCardsAdded':     'new cards added to proxy queue',
    'proxy.addDecklistToQueue': 'Add Decklist to Queue',
    'proxy.addCard':            'Add Card',
    'proxy.clearQueue':         '🗑️ Clear Queue',
    'proxy.pageFooter':         'Page',
    'notify.playtesterLoading': 'Playtester is loading…',
    'notify.playtesterError':   'Playtester could not be loaded.',

    // ── app-deck-builder.js ─────────────────────────────────
    'deck.maxReached':          'Deck has reached maximum (70 cards)!',
    'deck.maxCopies':           'Maximum 4 copies per card!',
    'deck.aceSpecOnce':         'Ace Spec cards may only be in deck once!',
    'deck.aceSpecLimit':        'Only 1 Ace Spec card allowed per deck! Remove the existing one first.',
    'deck.radiantOnce':         'Radiant Pokémon may only be in deck once!',
    'deck.radiantLimit':        'Only 1 Radiant Pokémon allowed per deck! Remove the existing one first.',
    'deck.clearConfirm':        'Do you really want to remove all cards from the deck?',
    'deck.priceNA':             'N/A',
    'deck.emptyPlaceholder':    'Create a deck using the buttons above or add cards manually…',
    'deck.uniqueLabel':         'Unique',
    'deck.m3Exclusive':         'M3 Japan Exclusive',
    'deck.openHandProb':        'Probability on opening hand (7 cards)',
    'deck.openLimitless':       'Open on Limitless',
    'deck.addToProxy':          'Add to proxy',
    'deck.buyCardmarket':       'Buy on Cardmarket:',
    'deck.priceUnavailable':    'Price not available',
    'deck.empty':               'Your deck is empty!',
    'deck.notAvailable':        'This function is not available for this tab!',
    'deck.noCardsToAdd':        'No cards to add!',
    'deck.autoCompleteHeader':  'Auto-Complete will add',
    'deck.autoCompleteContinue':'Continue?',
    'deck.consistencySuccess':  '✅ Optimal list generated! (Consistency Build)',
    'deck.restored':            'Deck restored!',
    'deck.restorePrompt':       'An unsaved deck was found. Restore it?',
    'deck.addToDeck':           'Add to Deck',
    'deck.pokemon':             'Pokémon:',
    'deck.trainer':             'Trainer:',
    'deck.energy':              'Energy:',
    'deck.cards':               'cards',

    // ── playtester.js — toasts & confirms ─────────────────────
    'pt.deckEmpty':             'Your deck is empty. Add some cards first.',
    'pt.deckIncomplete':        '⚠️ Deck has only {n}/60 cards. You can still play!',
    'pt.importP1':              'Please import at least one deck for Player 1!',
    'pt.addOpponentOrMirror':   'Please add a deck for the opponent or choose Mirror Match.',
    'pt.gameSaved':             '💾 Game saved',
    'pt.saveFailed':            '❌ Save failed',
    'pt.noSaveAvailable':       'ℹ️ No saved game available',
    'pt.gameLoaded':            '📂 Game loaded',
    'pt.loadFailed':            '❌ Load failed',
    'pt.quitConfirm':           'Quit Playtester and return to the main page?',
    'pt.quitConfirmFull':       'Really quit the playtester? All progress will be lost.',
    'pt.redrawPrizesConfirm':   'Shuffle prize card(s) back into deck and re-deal?',
    'pt.effectExecuting':       '✅ Effect is being executed',
    'pt.noAutoEffect':          'ℹ️ No auto-effect, execute manually',
    'pt.mulliganError':         'Mulligan error:',

    // ── playtester.js — errors ───────────────────────────────
    'pt.errInvalidCardType':    '⛔ Only Pokémon, Energy or Tools may be placed on Active/Bench!',
    'pt.errAttachNoPokemon':    '⛔ Energy/Tool can only be attached to an existing Pokémon!',
    'pt.errDeckEmpty':          'Deck is empty!',
    'pt.errNotYourTurn':        'Not your turn!',
    'pt.errBenchFull':          'Bench full (max 5)!',
    'pt.errNoEnergy':           'No Energy card in hand!',

    // ── playtester.js — setup / UI ───────────────────────────
    'pt.setupPhase':            '🃏 Setup Phase',
    'pt.mpSetup':               '🌐 Multiplayer Setup',
    'pt.letsBattle':            '👊 Let\'s Battle!',
    'pt.ready':                 '✅ Ready!',
    'pt.mulliganDraw':          '🃏 Mulligan Draw',
    'pt.mulliganBonusText':     'may draw up to <b>{n}</b> extra card(s)',
    'pt.noBasicWarning':        '⚠️ No Basic Pokémon! Do a Mulligan.',
    'pt.clickBasicActive':      '⬆️ Click a Basic to set as Active',
    'pt.mulliganBtn':           '🃏 Mulligan',
    'pt.clearBench':            'Clear Bench',
    'pt.dblClickZoom':          'Dbl-click any card to zoom',
    'pt.p1Label':               '🔵 Player 1',
    'pt.p2Label':               '🔴 Player 2',
    'pt.waitingInput':          'Waiting for input…',
    'pt.pasteCode':             'Please paste a deck code first!',
    'pt.loadingCards':          'Loading card data…',
    'pt.invalidFormat':         'No valid deck format detected.',
    'pt.noValidCards':          'No valid cards found.',
    'pt.cardsLoaded':           'cards loaded ✅',
    'pt.missing':               'missing',
    'pt.loadDeck':              '📥 Load Deck',

    // ── playtester.js — modal buttons ─────────────────────────
    'pt.btnHand':               '⬆️ Hand',
    'pt.btnLost':               '🌌 Lost',
    'pt.btnBottom':             '⏬ Bottom',
    'pt.btnDiscard':            '🗑️ Discard',

    // ── playtester.js — opponent panel ─────────────────────
    'pt.deckEmptyLabel':        'Deck is empty.',
    'pt.discardEmpty':          '🗑️ Discard pile is empty.',
    'pt.lostZoneEmpty':         '🌌 Lost Zone is empty.',
    'pt.locks':                 'Locks:',
    'pt.active':                '⭐ Active',
    'pt.bench':                 'Bench',
    'pt.damage':                'Damage',
    'pt.heal':                  '💚 Heal',
    'pt.ko':                    '☠️ K.O.',
    'pt.discardZone':           '🗑️ Discard',
    'pt.setActive':             '⭐ Set as Active',
    'pt.removeAttached':        'Remove attached',
    'pt.field':                 'Field',
    'pt.discardPile':           'Discard',
    'pt.lostZone':              'Lost Zone',

    // ── playtester.js — additional errors ────────────────────
    'pt.nothingToUndo':         'Nothing to undo.',
    'pt.errSetupOnlyBasic':     '⛔ Only Basic Pokémon allowed in Setup!',
    'pt.errNoPokemonInZone':    'No Pokémon in this zone!',
    'pt.errUnknownCmd':         'Unknown! Try: /draw 3  /iono 6  /roxanne 2  /top 5  /mill 2  /attach active',
    'pt.errNoEnergyOnPokemon':  'No Energy on this Pokémon!',
    'pt.errNoBenchPokemon':     'No Pokémon on the Bench!',
    'pt.errNotEnoughEnergy':    'Not enough Energy!',
    'pt.errAvailable':          'available',
    'pt.errNeeded':             'required',
    'pt.errDiscardEmpty':       'Discard pile is empty.',
    'pt.errLostZoneEmpty':      'Lost Zone is empty.',
    'pt.errNoPrizes':           'No prize cards left!',
    'pt.errNoBasicEnergyHand':  '⛔ No Basic Energy in hand to discard!',
    'pt.errOpponentNoBench':    '⛔ Opponent has no Bench Pokémon!',
    'pt.errNoHandCards':        '⛔ No cards in hand!',
    'pt.errNotEnoughHandCards': '⛔ Not enough cards in hand to discard!',
    'pt.errNoPokemonWithEnergy':'⛔ No Pokémon with Basic Energy!',
    'pt.errNoOtherTarget':      '⛔ No other Pokémon as target!',
    'pt.errMinThreeHandCards':  '⛔ Not enough cards in hand (min. 3)!',
    'pt.errSelectBothDecks':    '⛔ Please select both decks!',
    'pt.errPasteBothDecks':     '⛔ Please paste both deck lists!',

    // ── Heatmap (Current Meta) ───────────────────────────────
    'heatmap.title':            '🔥 Matchup Heatmap',
    'heatmap.yLabel':           'Y-axis (Your deck)',
    'heatmap.xLabel':           'X-axis (Opponents, optional)',
    'heatmap.placeholderY':     'e.g. N\'s Zoroark',
    'heatmap.placeholderX':     'e.g. Dragapult',
    'heatmap.yourDeck':         'Your Deck ⚔',
    'heatmap.desc':             'Interactive win rate matrix.',
    'heatmap.favorable':        'Favorable',
    'heatmap.even':             'Even',
    'heatmap.unfavorable':      'Unfavorable',
    'heatmap.showTop10':        '▲ Show top 10 only',
    'heatmap.showAll':          '▼ Show all decks',
    'heatmap.hint':             '💡 Hover over cells to see detailed game counts. Data from Limitless Online.',
    'heatmap.noDecks':          'No decks found.',
    'heatmap.noDecksY':         'No decks found on Y-axis for',
    'heatmap.noDecksX':         'No decks found on X-axis for',
    'heatmap.mirror':           'Mirror match',
    'heatmap.noData':           'No data available',
    'heatmap.games':            'games',

    // ── City League ──────────────────────────────────────────
    'cl.loading':               'Loading',
    'cl.loadingData':           'data...',
    'cl.archetypeOverview':     '📊 Archetype Overview',
    'cl.top3Count':             'Top 3 by Count:',
    'cl.top3Placement':         'Top 3 by Avg Placement:',
    'cl.top10Changes':          '🔝 Top 10 Changes',
    'cl.entries':               'Entries:',
    'cl.exits':                 'Exits:',
    'cl.noTop10Changes':        'No changes in top 10',
    'cl.dataSource':            '📁 Data Source',
    'cl.period':                'Period:',
    'cl.tournaments':           'Tournaments:',
    'cl.popDecreases':          '📉 Popularity Decreases',
    'cl.perfImprovers':         'Performance Improvers (Better Avg Placement)',
    'cl.perfDecliners':         '📉 Performance Decliners (Worse Avg Placement)',
    'cl.fullComparison':        '📋 Full Comparison Table (Top 30)',
    'cl.searchPlaceholder':     'Search e.g.: draga, luca',
    'cl.archetypeCombined':     '📚 Archetype Combined (Top 20)',
    'cl.combinedExplanation':   'Combined numbers of all variants of a main Pokémon (e.g. all "dragapult *" decks)',
    'cl.generated':             'Generated:',
    'cl.totalTracked':          'Total Archetypes Tracked:',
    'cl.thArchetype':           'Archetype',
    'cl.thOldCount':            'Old Count',
    'cl.thNewCount':            'New Count',
    'cl.thChange':              'Change',
    'cl.thAvgPlacement':        'Avg Placement',
    'cl.thCount':               'Count',
    'cl.thAvgPlacementShort':   'Avg. Placement',
    'cl.thMainPokemon':         'Main Pokemon',
    'cl.thVariants':            'Variants',
    'cl.thDeck':                'Deck',
    'cl.goToAnalysis':          'Go to analysis of',
    'cl.analyzeVariants':       'Analyze all variants',
    'cl.noResults':             'No results found',
    'cl.resultsFound':          'result(s) found',
    'cl.noDataFound':           'No data found',
    'cl.noDataFoundDesc':       'No tournament data available for this filter combination.',
    'cl.cards':                 'Cards',
    'cl.selectDeck':            '-- Select a Deck --',
    'cl.topMetaDecks':          '🏆 Top 10 Meta Decks',
    'cl.allOtherDecks':         '🎴 All Other Decks (A-Z)',
    'cl.combinedArchetypes':    '🧩 Combined Archetypes (A–Z)',
    'cl.decks':                 'Decks',
    'cl.allVariants':           'All Variants',
    'cl.selectDeckFirst':       'Please select a deck first!',
    'cl.noCopyCards':           'No cards to copy! Please select an archetype first.',
    'cl.deckCopied':            'Deck copied to clipboard!',
    'cl.copyError':             'Error copying to clipboard!',
    'cl.selectDeckPlaceholder': 'Please select a deck...',
    'cl.noCardsFound':          'No cards found',
    'cl.filteredRange':         'Filtered:',
    'cl.filteredFrom':          'Filtered: From',
    'cl.filteredUntil':         'Filtered: Until',
    'cl.showingAll':            'Showing all tournaments',
    'cl.usageShare':            'Usage Share:',
    'cl.avgUsedDecks':          'Ø avg. (used decks):',
    'cl.avgAllDecks':           'Ø avg. (all decks):',
    'cl.deckCount':             'Deck Count:',
    'cl.maxCount':              'Max Count:',
    'cl.addToDeck':             'Add to Deck',
    'cl.proxy':                 'Proxy',
    'cl.addToDeckTooltip':      'Add to deck',
    'cl.proxyTooltip':          'Add to proxy',
    'cl.removeFromDeck':        'Remove from deck',
    'cl.switchPrint':           'Switch rarity/print',
    'cl.openLimitless':         'Open on Limitless',
    'cl.buyCardmarket':         'Buy on Cardmarket:',
    'cl.priceNA':               'Price not available',
    'cl.otherPrints':           'Other Int. Prints in Collection:',
    'cl.tierCore':              'Core Cards (80% - 100%)',
    'cl.tierAceSpec':           'Ace Spec (Max 1 per Deck)',
    'cl.tierTech':              'Tech Cards (15% - 79%)',
    'cl.tierSpicy':             'Spicy Techs (< 15%)',
    'cl.thImage':               'Image',
    'cl.thCardsInDeck':         'Cards in Deck',
    'cl.thCardName':            'Card Name',
    'cl.thSet':                 'Set',
    'cl.thNumber':              'Number',
    'cl.thPctArchetype':        '% in Archetype',
    'cl.thAvgCountUsed':        'Ø Count (if used)',
    'cl.thAction':              'Action',
    'cl.addBtn':                '+ Add',
    'cl.total':                 'Total',
    'cl.pokemon':               'Pokémon:',
    'cl.trainer':               'Trainer:',
    'cl.energy':                'Energy:',

    // ── Meta Chart ───────────────────────────────────────────
    'chart.metaShareTitle':     '📊 Meta Share Chart – Top Archetypes',
    'chart.toggle':             '▼ toggle',
    'chart.deckCount':          'Deck Count',
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

    // ── Modal / dialog common ────────────────────────────────────────
    'modal.cancel':             'Abbrechen',
    'modal.ok':                 'OK',
    'modal.copy':               'Kopieren',
    'modal.copied':             'Kopiert!',

    // ── app-core.js — proxy ──────────────────────────────────────
    'proxy.queueEmpty':         'Noch keine Karten in der Proxy-Warteschlange. Verwende die "Proxy"-Buttons in Übersicht, Deck, Meta-Karten, Karten-DB oder Vergleich.',
    'proxy.noPrint':            'Kein Druck angegeben',
    'proxy.remove':             'Entfernen',
    'proxy.addedToQueue':       'Zur Proxy-Warteschlange hinzugefügt:',
    'proxy.clearConfirm':       'Gesamte Proxy-Warteschlange leeren?',
    'proxy.noDeckCards':        'Keine Deck-Karten für diese Quelle gefunden.',
    'proxy.deckCardsAdded':     'Deck-Karten zur Proxy-Warteschlange hinzugefügt',
    'proxy.pasteFirst':         'Bitte zuerst eine Deckliste einfügen.',
    'proxy.parseError':         'Deckliste konnte nicht gelesen werden. Format: 4 Buddy-Buddy Poffin SVI 186',
    'proxy.cardsImported':      'Karten in die Proxy-Warteschlange importiert',
    'proxy.enterCardName':      'Bitte einen Kartennamen eingeben.',
    'proxy.queueEmptyToast':    'Proxy-Warteschlange ist leer.',
    'proxy.printBlocked':       'Druckfenster konnte nicht geöffnet werden. Bitte Pop-ups für diese Seite erlauben.',
    'proxy.printTitle':         'Proxy-Druck',
    'proxy.noNewCards':         'Keine neuen Karten im Vergleichsergebnis gefunden.',
    'proxy.compCardsAdded':     'neue Karten zur Proxy-Warteschlange hinzugefügt',
    'proxy.addDecklistToQueue': 'Deckliste zur Warteschlange hinzufügen',
    'proxy.addCard':            'Karte hinzufügen',
    'proxy.clearQueue':         '🗑️ Warteschlange leeren',
    'proxy.pageFooter':         'Seite',
    'notify.playtesterLoading': 'Playtester wird geladen…',
    'notify.playtesterError':   'Playtester konnte nicht geladen werden.',

    // ── app-deck-builder.js ─────────────────────────────────
    'deck.maxReached':          'Deck hat Maximum erreicht (70 Karten)!',
    'deck.maxCopies':           'Maximal 4 Kopien pro Karte!',
    'deck.aceSpecOnce':         'Ace-Spec-Karten dürfen nur 1x im Deck sein!',
    'deck.aceSpecLimit':        'Nur 1 Ace-Spec-Karte pro Deck erlaubt! Entferne zuerst die vorhandene.',
    'deck.radiantOnce':         'Strahlende Pokémon dürfen nur 1x im Deck sein!',
    'deck.radiantLimit':        'Nur 1 Strahlendes Pokémon pro Deck erlaubt! Entferne zuerst das vorhandene.',
    'deck.clearConfirm':        'Möchtest du wirklich alle Karten aus dem Deck entfernen?',
    'deck.priceNA':             'k.A.',
    'deck.emptyPlaceholder':    'Erstelle ein Deck mit den Buttons oben oder füge Karten manuell hinzu…',
    'deck.uniqueLabel':         'Einzigartig',
    'deck.m3Exclusive':         'M3 Japan-Exklusiv',
    'deck.openHandProb':        'Wahrscheinlichkeit auf der Starthand (7 Karten)',
    'deck.openLimitless':       'Auf Limitless öffnen',
    'deck.addToProxy':          'Zum Proxy hinzufügen',
    'deck.buyCardmarket':       'Auf Cardmarket kaufen:',
    'deck.priceUnavailable':    'Preis nicht verfügbar',
    'deck.empty':               'Dein Deck ist leer!',
    'deck.notAvailable':        'Diese Funktion ist für diesen Tab nicht verfügbar!',
    'deck.noCardsToAdd':        'Keine Karten zum Hinzufügen!',
    'deck.autoCompleteHeader':  'Auto-Complete fügt hinzu:',
    'deck.autoCompleteContinue':'Fortfahren?',
    'deck.consistencySuccess':  '✅ Optimale Liste generiert! (Konsistenz-Build)',
    'deck.restored':            'Deck wiederhergestellt!',
    'deck.restorePrompt':       'Ein ungespeichertes Deck wurde gefunden. Wiederherstellen?',
    'deck.addToDeck':           'Zum Deck hinzufügen',
    'deck.pokemon':             'Pokémon:',
    'deck.trainer':             'Trainer:',
    'deck.energy':              'Energie:',
    'deck.cards':               'Karten',

    // ── playtester.js — toasts & confirms ─────────────────────
    'pt.deckEmpty':             'Dein Deck ist leer. Füge zuerst Karten hinzu.',
    'pt.deckIncomplete':        '⚠️ Deck hat nur {n}/60 Karten. Du kannst trotzdem spielen!',
    'pt.importP1':              'Bitte importiere mindestens ein Deck für Spieler 1!',
    'pt.addOpponentOrMirror':   'Bitte füge ein Deck für den Gegner ein oder wähle Mirror Match.',
    'pt.gameSaved':             '💾 Spiel gespeichert',
    'pt.saveFailed':            '❌ Speichern fehlgeschlagen',
    'pt.noSaveAvailable':       'ℹ️ Kein Spielstand vorhanden',
    'pt.gameLoaded':            '📂 Spielstand geladen',
    'pt.loadFailed':            '❌ Laden fehlgeschlagen',
    'pt.quitConfirm':           'Playtester beenden und zur Hauptseite zurückkehren?',
    'pt.quitConfirmFull':       'Wirklich den Playtester beenden? Aller Fortschritt geht verloren.',
    'pt.redrawPrizesConfirm':   'Preiskarten zurück ins Deck mischen und neu austeilen?',
    'pt.effectExecuting':       '✅ Effekt wird ausgeführt',
    'pt.noAutoEffect':          'ℹ️ Kein Auto-Effekt, manuell ausführen',
    'pt.mulliganError':         'Mulligan-Fehler:',

    // ── playtester.js — errors ───────────────────────────────
    'pt.errInvalidCardType':    '⛔ Nur Pokémon, Energie oder Werkzeuge dürfen auf Aktiv/Bank!',
    'pt.errAttachNoPokemon':    '⛔ Energie/Werkzeug kann nur an ein vorhandenes Pokémon angelegt werden!',
    'pt.errDeckEmpty':          'Deck ist leer!',
    'pt.errNotYourTurn':        'Nicht dein Zug!',
    'pt.errBenchFull':          'Bank voll (max. 5)!',
    'pt.errNoEnergy':           'Keine Energiekarte auf der Hand!',

    // ── playtester.js — setup / UI ───────────────────────────
    'pt.setupPhase':            '🃏 Aufstellungsphase',
    'pt.mpSetup':               '🌐 Mehrspieler-Aufstellung',
    'pt.letsBattle':            '👊 Los geht\'s!',
    'pt.ready':                 '✅ Bereit!',
    'pt.mulliganDraw':          '🃏 Mulligan-Ziehen',
    'pt.mulliganBonusText':     'darf bis zu <b>{n}</b> Extra-Karte(n) ziehen',
    'pt.noBasicWarning':        '⚠️ Kein Basis-Pokémon! Führe einen Mulligan durch.',
    'pt.clickBasicActive':      '⬆️ Klicke auf ein Basis-Pokémon für Aktiv',
    'pt.mulliganBtn':           '🃏 Mulligan',
    'pt.clearBench':            'Bank leeren',
    'pt.dblClickZoom':          'Doppelklick auf Karte zum Vergrößern',
    'pt.p1Label':               '🔵 Spieler 1',
    'pt.p2Label':               '🔴 Spieler 2',
    'pt.waitingInput':          'Warte auf Eingabe…',
    'pt.pasteCode':             'Bitte zuerst einen Deck-Code einfügen!',
    'pt.loadingCards':          'Kartendaten werden geladen…',
    'pt.invalidFormat':         'Kein gültiges Deckformat erkannt.',
    'pt.noValidCards':          'Keine gültigen Karten gefunden.',
    'pt.cardsLoaded':           'Karten geladen ✅',
    'pt.missing':               'fehlen',
    'pt.loadDeck':              '📥 Deck laden',

    // ── playtester.js — modal buttons ─────────────────────────
    'pt.btnHand':               '⬆️ Hand',
    'pt.btnLost':               '🌌 Lost',
    'pt.btnBottom':             '⏬ Unten',
    'pt.btnDiscard':            '🗑️ Ablage',

    // ── playtester.js — opponent panel ─────────────────────
    'pt.deckEmptyLabel':        'Deck ist leer.',
    'pt.discardEmpty':          '🗑️ Ablagestapel ist leer.',
    'pt.lostZoneEmpty':         '🌌 Lost Zone ist leer.',
    'pt.locks':                 'Sperren:',
    'pt.active':                '⭐ Aktiv',
    'pt.bench':                 'Bank',
    'pt.damage':                'Schaden',
    'pt.heal':                  '💚 Heilen',
    'pt.ko':                    '☠️ K.O.',
    'pt.discardZone':           '🗑️ Ablage',
    'pt.setActive':             '⭐ Als Aktiv setzen',
    'pt.removeAttached':        'Angelegtes entfernen',
    'pt.field':                 'Feld',
    'pt.discardPile':           'Ablagestapel',
    'pt.lostZone':              'Lost Zone',

    // ── playtester.js — additional errors ────────────────────
    'pt.nothingToUndo':         'Nichts rückgängig zu machen.',
    'pt.errSetupOnlyBasic':     '⛔ Im Setup nur Basis-Pokémon erlaubt!',
    'pt.errNoPokemonInZone':    'Kein Pokémon in dieser Zone!',
    'pt.errUnknownCmd':         'Unbekannt! Probiere: /draw 3  /iono 6  /roxanne 2  /top 5  /mill 2  /attach active',
    'pt.errNoEnergyOnPokemon':  'Keine Energy auf diesem Pokémon!',
    'pt.errNoBenchPokemon':     'Keine Pokémon auf der Bank!',
    'pt.errNotEnoughEnergy':    'Nicht genug Energy!',
    'pt.errAvailable':          'vorhanden',
    'pt.errNeeded':             'benötigt',
    'pt.errDiscardEmpty':       'Ablagestapel ist leer.',
    'pt.errLostZoneEmpty':      'Lost Zone ist leer.',
    'pt.errNoPrizes':           'Keine Preiskarten mehr!',
    'pt.errNoBasicEnergyHand':  '⛔ Keine Basic Energy auf der Hand zum Ablegen!',
    'pt.errOpponentNoBench':    '⛔ Gegner hat keine Pokémon auf der Bank!',
    'pt.errNoHandCards':        '⛔ Keine Karten auf der Hand!',
    'pt.errNotEnoughHandCards': '⛔ Nicht genug Karten auf der Hand zum Ablegen!',
    'pt.errNoPokemonWithEnergy':'⛔ Keine Pokémon mit Basic Energy!',
    'pt.errNoOtherTarget':      '⛔ Kein anderes Pokémon als Ziel!',
    'pt.errMinThreeHandCards':  '⛔ Nicht genug Karten auf der Hand (min. 3)!',
    'pt.errSelectBothDecks':    '⛔ Bitte beide Decks auswählen!',
    'pt.errPasteBothDecks':     '⛔ Bitte beide Deck-Listen einfügen!',

    // ── Heatmap (Current Meta) ───────────────────────────────
    'heatmap.title':            '🔥 Matchup Heatmap',
    'heatmap.yLabel':           'Y-Achse (Dein Deck)',
    'heatmap.xLabel':           'X-Achse (Gegner, optional)',
    'heatmap.placeholderY':     'z.B. N\'s Zoroark',
    'heatmap.placeholderX':     'z.B. Dragapult',
    'heatmap.yourDeck':         'Dein Deck ⚔',
    'heatmap.desc':             'Interaktive Gewinnraten-Matrix.',
    'heatmap.favorable':        'Gut',
    'heatmap.even':             'Ausgeglichen',
    'heatmap.unfavorable':      'Schlecht',
    'heatmap.showTop10':        '▲ Nur Top 10 zeigen',
    'heatmap.showAll':          '▼ Alle Decks zeigen',
    'heatmap.hint':             '💡 Fahre über Zellen für Details. Daten von Limitless Online.',
    'heatmap.noDecks':          'Keine Decks gefunden.',
    'heatmap.noDecksY':         'Keine Decks auf der Y-Achse gefunden für',
    'heatmap.noDecksX':         'Keine Decks auf der X-Achse gefunden für',
    'heatmap.mirror':           'Spiegelmatch',
    'heatmap.noData':           'Keine Daten verfügbar',
    'heatmap.games':            'Spiele',

    // ── City League ──────────────────────────────────────────
    'cl.loading':               'Lade',
    'cl.loadingData':           'Daten...',
    'cl.archetypeOverview':     '📊 Archetypen-Übersicht',
    'cl.top3Count':             'Top 3 nach Anzahl:',
    'cl.top3Placement':         'Top 3 nach Ø-Platzierung:',
    'cl.top10Changes':          '🔝 Top 10 Veränderungen',
    'cl.entries':               'Aufsteiger:',
    'cl.exits':                 'Absteiger:',
    'cl.noTop10Changes':        'Keine Veränderungen in den Top 10',
    'cl.dataSource':            '📁 Datenquelle',
    'cl.period':                'Zeitraum:',
    'cl.tournaments':           'Turniere:',
    'cl.popDecreases':          '📉 Beliebtheit gesunken',
    'cl.perfImprovers':         'Performance verbessert (bessere Ø-Platzierung)',
    'cl.perfDecliners':         '📉 Performance verschlechtert (schlechtere Ø-Platzierung)',
    'cl.fullComparison':        '📋 Vollständige Vergleichstabelle (Top 30)',
    'cl.searchPlaceholder':     'Suche z.B.: draga, luca',
    'cl.archetypeCombined':     '📚 Archetypen kombiniert (Top 20)',
    'cl.combinedExplanation':   'Kumulierte Zahlen aller Varianten eines Haupt-Pokémons (z.B. alle "dragapult *" Decks)',
    'cl.generated':             'Erstellt:',
    'cl.totalTracked':          'Archetypen insgesamt:',
    'cl.thArchetype':           'Archetyp',
    'cl.thOldCount':            'Alte Anzahl',
    'cl.thNewCount':            'Neue Anzahl',
    'cl.thChange':              'Änderung',
    'cl.thAvgPlacement':        'Ø-Platzierung',
    'cl.thCount':               'Anzahl',
    'cl.thAvgPlacementShort':   'Ø-Platzierung',
    'cl.thMainPokemon':         'Haupt-Pokémon',
    'cl.thVariants':            'Varianten',
    'cl.thDeck':                'Deck',
    'cl.goToAnalysis':          'Zur Analyse von',
    'cl.analyzeVariants':       'Alle Varianten analysieren',
    'cl.noResults':             'Keine Ergebnisse gefunden',
    'cl.resultsFound':          'Ergebnis(se) gefunden',
    'cl.noDataFound':           'Keine Daten gefunden',
    'cl.noDataFoundDesc':       'Für diese Filterkombination liegen aktuell keine Turnierdaten vor.',
    'cl.cards':                 'Karten',
    'cl.selectDeck':            '-- Deck auswählen --',
    'cl.topMetaDecks':          '🏆 Top 10 Meta-Decks',
    'cl.allOtherDecks':         '🎴 Alle anderen Decks (A-Z)',
    'cl.combinedArchetypes':    '🧩 Kombinierte Archetypen (A–Z)',
    'cl.decks':                 'Decks',
    'cl.allVariants':           'Alle Varianten',
    'cl.selectDeckFirst':       'Bitte zuerst ein Deck auswählen!',
    'cl.noCopyCards':           'Keine Karten zum Kopieren! Bitte zuerst einen Archetypen auswählen.',
    'cl.deckCopied':            'Deck in Zwischenablage kopiert!',
    'cl.copyError':             'Fehler beim Kopieren!',
    'cl.selectDeckPlaceholder': 'Bitte ein Deck auswählen...',
    'cl.noCardsFound':          'Keine Karten gefunden',
    'cl.filteredRange':         'Gefiltert:',
    'cl.filteredFrom':          'Gefiltert: Ab',
    'cl.filteredUntil':         'Gefiltert: Bis',
    'cl.showingAll':            'Alle Turniere angezeigt',
    'cl.usageShare':            'Nutzungsanteil:',
    'cl.avgUsedDecks':          'Ø (Decks mit Karte):',
    'cl.avgAllDecks':           'Ø (alle Decks):',
    'cl.deckCount':             'Deck-Anzahl:',
    'cl.maxCount':              'Max. Anzahl:',
    'cl.addToDeck':             'Ins Deck',
    'cl.proxy':                 'Proxy',
    'cl.addToDeckTooltip':      'Ins Deck legen',
    'cl.proxyTooltip':          'Zum Proxy hinzufügen',
    'cl.removeFromDeck':        'Aus Deck entfernen',
    'cl.switchPrint':           'Print/Seltenheit wechseln',
    'cl.openLimitless':         'Auf Limitless öffnen',
    'cl.buyCardmarket':         'Auf Cardmarket kaufen:',
    'cl.priceNA':               'Preis nicht verfügbar',
    'cl.otherPrints':           'Andere Int. Prints in Sammlung:',
    'cl.tierCore':              'Kernkarten (80% – 100%)',
    'cl.tierAceSpec':           'Ace Spec (Max 1 pro Deck)',
    'cl.tierTech':              'Tech-Karten (15% – 79%)',
    'cl.tierSpicy':             'Spicy Techs (< 15%)',
    'cl.thImage':               'Bild',
    'cl.thCardsInDeck':         'Karten im Deck',
    'cl.thCardName':            'Kartenname',
    'cl.thSet':                 'Set',
    'cl.thNumber':              'Nummer',
    'cl.thPctArchetype':        '% im Archetyp',
    'cl.thAvgCountUsed':        'Ø Anzahl (wenn genutzt)',
    'cl.thAction':              'Aktion',
    'cl.addBtn':                '+ Hinzufügen',
    'cl.total':                 'Gesamt',
    'cl.pokemon':               'Pokémon:',
    'cl.trainer':               'Trainer:',
    'cl.energy':                'Energie:',

    // ── Meta Chart ───────────────────────────────────────────
    'chart.metaShareTitle':     '📊 Meta Share Chart – Top Archetypen',
    'chart.toggle':             '▼ umschalten',
    'chart.deckCount':          'Deck-Anzahl',
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
