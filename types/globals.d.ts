// types/globals.d.ts
//
// Wave-1 L2.1 — ambient type declarations for the globals that the legacy
// codebase puts on `window` and uses without imports.
//
// This is a transitional file. As individual modules move from
// `window.X = …` exports to real `export` statements (Layer 2.2 onwards),
// the corresponding line here goes away. For now this is "what TypeScript
// has to assume about the world the code runs in."
//
// Everything is typed deliberately loose (`any` / loose function shapes)
// because the existing modules don't have real types yet — tightening
// happens on a per-callee basis as each module gets converted.

// ============================================================================
// CDN-loaded libraries
// ============================================================================

declare const firebase: any;
declare const Chart: any;
declare const Papa: any;
declare const localforage: any;
declare const MobileDragDrop: any;

// ============================================================================
// Build-time-injected values
// ============================================================================

declare const FIREBASE_CREDS: any;
declare const GOOGLE_CLIENT_ID: string | undefined;
declare const DEV_MODE: boolean;
declare const APP_VERSION: string;
declare const CARD_BACK_URL: string;
declare const BASE_PATH: string;
declare const PRICE_PROXY_URL: string;

// ============================================================================
// Project-owned globals — what gets exposed via `window.X = …` today.
//
// Listed alphabetically. Anything not declared here will produce a tsc
// error in any file that has `// @ts-check`; that's intentional — it
// forces us to either type it or convert the file to a real module.
// ============================================================================

interface Window {
    // App state
    APP_VERSION: string;
    BASE_PATH: string;
    CARD_BACK_URL: string;
    DEV_MODE?: boolean;
    GOOGLE_CLIENT_ID?: string;
    FIREBASE_CREDS?: any;
    __firebaseRuntimeInitialized?: boolean;

    // Auth + Firebase glue
    auth: any;
    db: any;
    userProfile: any;
    userCollection: Set<string>;
    userCollectionCounts: Map<string, number>;
    userWishlist: Set<string>;
    userWishlistCounts: Map<string, number>;
    userWishlistMaxPrices: Map<string, number>;
    userTradelist: Set<string>;
    userTradelistCounts: Map<string, number>;
    userTradelistMinPrices: Map<string, number>;
    userDecks: any[];
    deckFolders: any[];
    _pendingDeckSaveSource?: string | null;

    // Card / meta data (shared globals across many modules)
    allCardsDatabase: any[];
    allCardsData?: any[];
    cardsBySetNumberMap?: { [key: string]: any };
    cardIndexBySetNumber?: Map<string, any>;
    filteredCardsData?: any[];
    metaCardsMap?: Map<string, any>;
    englishSetCodes?: Set<string>;
    cardDeckCoverageMap?: Map<string, any>;
    archetypeDeckCounts?: Map<string, number>;
    totalUniqueDecks?: number;

    // Deck-builder state (the 3 parallel deck states + user-decks scope)
    cityLeagueDeck: { [key: string]: number };
    cityLeagueDeckOrder: string[];
    currentCityLeagueArchetype: string | null;
    currentMetaDeck: { [key: string]: number };
    currentMetaDeckOrder: string[];
    currentMetaArchetype: string | null;
    pastMetaDeck: { [key: string]: number };
    pastMetaDeckOrder: string[];
    pastMetaCurrentArchetype: string | null;
    currentCityLeagueFormat?: string;
    rarityPreferences?: any;
    pinnedCards?: any;
    excludedCards?: any;
    techSlots?: any;

    // Meta-analysis data
    cityLeagueAnalysisData?: any[];
    currentMetaAnalysisData?: any[];
    currentMetaTournamentCardsData?: any[];
    proxyQueue?: any[];
    _cityLeagueAnalysisPromise?: Promise<any> | null;

    // Module namespaces / external integrations
    ArchetypeIcons?: any;
    MetaCall?: any;

    // Common utility functions exposed by the legacy modules
    t?: (key: string, fallback?: string) => string;
    showToast?: (msg: string, kind?: string, durationMs?: number) => void;
    showNotification?: (msg: string, kind?: string, durationMs?: number) => void;
    switchTab?: (tabId: string) => void;
    escapeHtml?: (s: any) => string;
    escapeHtmlAttr?: (s: any) => string;
    escapeJsStr?: (s: any) => string;
    formatNumber?: (n: number) => string;
    loadCSV?: (filename: string, options?: any) => Promise<any[]>;
    dataUrl?: (path: string) => string;
    safeExternalUrl?: (url: string) => string;
    debounce?: <T extends (...args: any[]) => any>(fn: T, delayMs?: number) => T;

    // Deck-store helpers (firebase-globals.js exports)
    patchUserDecksLocal?: (op: 'add' | 'update' | 'delete', payload: any) => void;
    openShowdownExternal?: () => void;

    // Error tracking
    trackError?: (err: any) => void;

    // Card data cache module (card-data-cache.js)
    cardDataCache?: any;

    // Filter / sort hooks the deck-analysis-shared.js setupDeckAnalysisShared expects to find
    updateDeckStatsByIds?: (...args: any[]) => any;
    resetDeckOverviewCounts?: () => void;
    renderNoDeckSelectedState?: () => void;
    showDeckSections?: () => void;
    hideDeckSections?: () => void;

    // Calculator
    updateCalculations?: () => void;

    // Dev-only logging
    devLog?: (...args: any[]) => void;

    // i18n
    getLang?: () => string;
    switchLanguage?: (lang: string) => void;

    // Profile / Meta-Analysis Hub
    switchProfileTab?: (tabId: string) => void;
    MetaAnalysisHub?: any;

    // App-init / app-core boot status flags
    cityLeagueLoaded?: boolean;
    __appResourcesSettled?: boolean;
    __pendingAuthUser?: any;
    _analysisIndex?: any;
    _analysisIndexBuilt?: boolean;
    dipidisDataCache?: any;

    // Loaders called from app-init.js
    loadAllCardsDatabase?: () => Promise<any>;
    loadAceSpecsList?: () => Promise<any>;
    loadCityLeagueData?: () => Promise<any>;
    loadPokedexNumbers?: () => Promise<any>;
    loadSetMapping?: () => Promise<any>;
    loadRarityPreferences?: () => Promise<any>;
    loadSetOrderMap?: () => Promise<any>;
    hideAppLoadingOverlay?: () => void;
    runAppLoadingWatchdog?: () => void;

    // Cards helper
    getCardTypeCategory?: (card: any) => string;

    // Showdown handoff (tcg-showdown-link.js)
    openShowdownExternal?: () => void;
    openInShowdownFromBuilder?: (source: string) => void;
    copyDeckAndOpenShowdown?: (source: string) => void;

    // Draw simulator
    _toggleComboTarget?: (cardName: string) => void;
}

declare function getLang(): string;
declare function switchLanguage(lang: string): void;
declare function onUserSignedIn(user: any): void;
declare function onUserSignedOut(): void;
declare function loadAllCardsDatabase(): Promise<any>;
declare function loadAceSpecsList(): Promise<any>;
declare function loadCityLeagueData(): Promise<any>;
declare function loadPokedexNumbers(): Promise<any>;
declare function loadSetMapping(): Promise<any>;
declare function loadRarityPreferences(): Promise<any>;
declare function loadSetOrderMap(): Promise<any>;
declare function hideAppLoadingOverlay(): void;
declare function runAppLoadingWatchdog(): void;
declare function _toggleComboTarget(name: string): void;

// ============================================================================
// More legacy globals surfaced by the L2.2b file batch — all `any` typed for
// now; tighten as the corresponding source file gets converted.
// ============================================================================

declare const google: any;

declare function loadCSV(filename: string, options?: any): Promise<any[]>;
declare function loadCurrentMeta(...args: any[]): any;
declare function loadCurrentMetaAnalysis(...args: any[]): any;
declare function loadMetaCardAnalysis(...args: any[]): any;
declare function saveCurrentDeckToProfile(source: string): any;
declare function showInputModal(...args: any[]): any;
declare function switchTab(tabId: string): void;
declare function switchProfileTab(tabId: string): void;
declare function updateCollectionUI(): void;
declare function updateDecksUI(): void;
declare function updateProfileUI(data?: any): void;
declare function updateTradelistUI(): void;
declare function updateWishlistUI(): void;
declare function addCardToProxy(...args: any[]): any;
declare function renderProxyQueue(): void;
declare function addToWishlist(...args: any[]): any;
declare function flushBattleJournalOutbox(force?: boolean): any;
declare function renderBattleJournalSummary(): any;
declare function leaveMultiplayerGame(): any;
declare function getErrorMessage(code: string): string;
declare function loadUserData(uid: string): any;
declare function loadUserDecks(uid: string): any;
declare function clearUserData(): void;

interface Window {
    // Card-capability engine
    CardCapabilityEngine?: any;

    // Heatmap state
    heatmapExpanded?: boolean;
    heatmapSearchX?: string;
    heatmapSearchY?: string;

    // App-current-meta legacy state
    _matchupRegistry?: any;
    currentMetaArchetypes?: any;
    metaArchetypes?: any;
    currentMetaData?: any;
    currentMetaLoaded?: boolean;
    currentMetaAnalysisLoaded?: boolean;
    currentAnalysisLoaded?: boolean;

    // Tech-slots + pinned + excluded helpers (from app-deck-builder)
    pinnedCardsFromArray?: (source: any, arr: string[]) => void;
    pinnedCardsToArray?: (source: any) => string[];
    excludedCardsFromArray?: (source: any, arr: string[]) => void;
    excludedCardsToArray?: (source: any) => string[];
    techSlotsFromArray?: (source: any, arr: any[]) => void;
    techSlotsToArray?: (source: any) => any[];

    // Custom-binder module
    buildCustomBinder?: () => void;
    cbAddArchetype?: (...args: any[]) => any;
    cbAddMissingToWishlist?: (...args: any[]) => any;
    cbApplyFilter?: (...args: any[]) => any;
    cbDeletePreset?: (...args: any[]) => any;
    cbFilterArchetypeList?: (...args: any[]) => any;
    cbLoadPreset?: (...args: any[]) => any;
    cbRemoveArchetype?: (...args: any[]) => any;
    cbSaveCurrentAsPreset?: (...args: any[]) => any;
    cbSendMissingToProxy?: (...args: any[]) => any;
    cbSetFilter?: (...args: any[]) => any;
    cbSetPrintView?: (...args: any[]) => any;
    cbToggleArchetype?: (...args: any[]) => any;
    cbToggleArchetypeDropdown?: (...args: any[]) => any;
    cbToggleMainPokemonGroup?: (...args: any[]) => any;
    _cbArchetypeGroups?: any;
    _cbDelta?: any;
    _cbDroppedCards?: any;
    refreshCustomBinderOwnership?: () => any;

    // Meta-binder module (referenced from custom-binder)
    _mbShared?: any;
    _metaBinderArchetypeGroups?: any;
    _metaBinderCurrentMetaExactMap?: any;
    _metaBinderCurrentMetaLabel?: string;

    // City-league analysis data slots
    cityLeagueAnalysisDataCurrent?: any;
    cityLeagueAnalysisDataPast?: any;
    cityLeagueAnalysisM3Data?: any;

    // App-anti-tech / Tech-lab feature
    TechLab?: any;
    openAntiTechModal?: (...args: any[]) => any;
    closeAntiTechModal?: (...args: any[]) => any;
    advanceAntiTechModal?: (...args: any[]) => any;
    backToAntiTechStep1?: (...args: any[]) => any;
    confirmAntiTechBuild?: (...args: any[]) => any;
    _activeThreatsCache?: any;
    _archetypeCardMap?: any;
    _archetypeCardMapTag?: string;
    _cardArchetypeNormalizedMap?: any;
    _loadCardEffectsIndex?: any;

    // App-past-meta feature
    pastMetaLoaded?: boolean;
    pastMetaRawDeckCards?: any[];
    _pastMetaLoadedChunks?: any;
    _pastMetaManifest?: any;
    _pastMetaSetOrderMap?: any;
    _pastMetaTournamentsByDate?: any;
    _pastMetaRenderGen?: number;
    pastMetaOverviewCardTypeFilter?: string;

    // Meta-matchup data
    currentMetaMatchupData?: any;
    m3BaselineData?: any;

    // Tier-meta + filter helpers
    filterTierDeckCards?: (...args: any[]) => any;
    showSingleCard?: (...args: any[]) => any;

    // Cards / Card-DB cross-module helpers
    cardsBySetNumberMap?: any;
    globalRarityPreference?: any;
    isPinnedCard?: (...args: any[]) => boolean;
    isAceSpec?: (...args: any[]) => boolean;
}

// Free-global helpers referenced from medium-sized feature modules.
// Most live in app-core / app-deck-builder / app-cards-db. Loose `any`
// types until those source modules are typed.
declare function loadCurrentMetaRowsWithFallback(opts?: any): Promise<any[]>;
declare function aggregateCardStatsByDate(...args: any[]): any;
declare function applyShareFilterWithAceSpecBoost(...args: any[]): any;
declare function autoCompleteConsistency(...args: any[]): any;
declare function cardsBySetNumberMap(...args: any[]): any;
declare const cityLeagueData: any;
declare function deduplicateCards(rows: any[]): any[];
declare function fetchAndParseCSV(url: string, delimiter?: string): Promise<any[]>;
declare function fixCardNameEncoding(s: string): string;
declare function fixMojibake(s: string): string;
declare function getBestCardImage(...args: any[]): any;
declare function getCanonicalCardRecord(...args: any[]): any;
declare function getCardByNameFromIndex(...args: any[]): any;
declare function getCardType(cardOrName: any, setCode?: string, setNumber?: string): string;
declare function getDisplayCardName(cardOrName: any, setCode?: string, setNumber?: string): string;
declare function getEmptyStateBoxHtml(opts?: any): string;
declare function getInternationalPrintsForCard(...args: any[]): any[];
declare function getNameWarningHtml(...args: any[]): string;
declare function getOtherInternationalPrintOwnedCount(...args: any[]): number;
declare function getPreferredVersionForCard(...args: any[]): any;
declare function getWishlistBadgeHtml(...args: any[]): string;
declare function initSearchableSelect(...args: any[]): any;
declare function isAceSpec(...args: any[]): boolean;
declare function isPinnedCard(...args: any[]): boolean;
declare function mapSetCodeToMetaFormat(code: string): string;
declare function normalizeCardName(name: string): string;
declare function parseCSV(text: string, delimiter?: string): any[];
declare function parseJapaneseDate(s: string): string;
declare function showTableSkeleton(...args: any[]): void;
declare function resetDeckOverviewCounts(...args: any[]): void;
declare function renderNoDeckSelectedState(...args: any[]): void;
declare function sortCardsByType(...args: any[]): any[];
declare let globalRarityPreference: string;
declare let _pastMetaRenderGen: number;
declare let pastMetaOverviewCardTypeFilter: string;
declare function renderTechSlotsUI(...args: any[]): void;

// dom-helpers.js — typed DOM-element getters (Wave-1 L2.2d).
declare const dom: {
    el(id: string): HTMLElement | null;
    input(id: string): HTMLInputElement | null;
    select(id: string): HTMLSelectElement | null;
    textarea(id: string): HTMLTextAreaElement | null;
    button(id: string): HTMLButtonElement | null;
    queryAs<T extends HTMLElement>(root: ParentNode, selector: string, Ctor?: new () => T): T | null;
    queryInput(root: ParentNode, selector: string): HTMLInputElement | null;
    querySelect(root: ParentNode, selector: string): HTMLSelectElement | null;
    asHTML(e: Element): HTMLElement;
};

interface Window {
    dom?: typeof dom;
}

declare function devLog(...args: any[]): void;
declare function t(key: string, fallback?: string): string;
declare function showToast(msg: string, kind?: string, durationMs?: number): void;
declare function showNotification(msg: string, kind?: string, durationMs?: number): void;
declare function escapeHtml(s: any): string;
declare function escapeHtmlAttr(s: any): string;
declare function escapeJsStr(s: any): string;
declare function dataUrl(path: string): string;
declare function safeExternalUrl(url: string): string;
