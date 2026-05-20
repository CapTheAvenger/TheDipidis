// Wave-1 Layer-2.3+ — hybrid bundle entry point for ES-module-style files.
//
// Files that opt into real `import` / `export` live in `js/modules/` and are
// re-exported from this index. esbuild bundles them into
// `_dist/app.modules.bundle.js` with `format:'iife'` + `globalName:'AppModules'`,
// then a footer copies every export onto `window` so the legacy concat bundle
// — which still hosts the bulk of the code — can call them globally.

export const APP_MODULES_BUNDLE_VERSION = '2.9.0';

// L2.4 — first real module: the deck-probability calculator. Re-exporting
// `updateCalculations` here makes it land on `window.updateCalculations` via
// the IIFE footer, preserving the legacy global the old IIFE used to set
// manually. Importing the module also runs its top-level side effects
// (DOMContentLoaded listener registration).
export { updateCalculations } from './app-calculator.js';

// L2.9 — canonical card-key utility (Wave-2 Card-PK foundation).
// Re-exporting puts parseCardKey / formatCardKey / getCardName / printId /
// hasPrintInfo on the global `window` so legacy callers can use them via
// bare identifiers; future ES-module call-sites can `import` directly.
export {
    parseCardKey,
    formatCardKey,
    getCardName,
    hasPrintInfo,
    printId,
} from './card-key.js';

// L2.10 — store primitive + pilot user-store (Wave-1 "Stores" foundation).
// Importing user-store.js also runs its side effect (window.userStore = …),
// so legacy non-module callers can use the store without a manual import.
export { createStore } from './stores/store.js';
export { userStore } from './stores/user-store.js';

// Wave-2 — canonical share / win-rate metrics. Re-exporting puts
// parsePercent / parsePercentOrNaN / formatPercent / weightedAverageWinRate
// on the global window for legacy bare-identifier use; new ES-module
// call-sites can `import` directly.
export {
    parsePercent,
    parsePercentOrNaN,
    formatPercent,
    weightedAverageWinRate,
} from './metrics.js';

// Wave-1 Firebase modular SDK lazy-loader. Importing here runs the side
// effect that exposes `window.getFirebaseModular()` for legacy non-module
// callers; new ES-module call-sites use `import { getFirebase } from
// './firebase/init.js'`. No Firebase modular JS is downloaded until the
// first caller actually invokes getFirebase().
export { getFirebase } from './firebase/init.js';

// L2.11 — archetype icons (legacy IIFE → ES module). The footer of the
// modules bundle mirrors the export onto window.ArchetypeIcons so the
// 30+ existing `window.ArchetypeIcons.X` call-sites keep working.
export { ArchetypeIcons } from './archetype-icons.js';

// L2.12 — TCG Showdown deck-handoff (legacy IIFE → ES module).
// Three top-level functions used by HTML inline onclick handlers.
export {
    openInShowdownFromBuilder,
    copyDeckAndOpenShowdown,
    openShowdownExternal,
} from './tcg-showdown-link.js';

// L2.13 — DOM type-narrowing helpers (legacy IIFE → ES module).
// The `dom` namespace stays on window for legacy use.
export { dom } from './dom-helpers.js';

// L2.14 — small shared helpers for Deck-Analysis tabs.
export {
    updateDeckStatsByIds,
    showDeckSections,
    hideDeckSections,
    resetDeckOverviewCounts,
    renderNoDeckSelectedState,
} from './deck-analysis-shared.js';

// L2.14 — auth modal open / close helpers.
export { showAuthModal, closeAuthModal } from './auth-ui-helpers.js';

// L2.15 — card data IndexedDB cache. Exposes the cardDataCache namespace.
export { cardDataCache } from './card-data-cache.js';

// L2.16 — Meta-Analysis Hub (tile-based sub-tab launcher) +
//   Card-Capability Engine (effect-tag extraction).
export { MetaAnalysisHub } from './meta-analysis-hub.js';
export { CardCapabilityEngine } from './card-capability-engine.js';

// L2.17 — Anti-Tech "Build vs Specific Decks" modal (913 LOC).
// Five entry points called by HTML inline onclick handlers.
export {
    openAntiTechModal,
    closeAntiTechModal,
    advanceAntiTechModal,
    backToAntiTechStep1,
    confirmAntiTechBuild,
} from './app-anti-tech.js';

// L2.18 — Tech Lab interactive tech-card explorer (1067 LOC). Exposes
// the TechLab namespace plus loadCurrentMetaRowsWithFallback used by
// other meta-tab files.
export { TechLab } from './app-tech-lab.js';
