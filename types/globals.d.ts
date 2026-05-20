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
