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
