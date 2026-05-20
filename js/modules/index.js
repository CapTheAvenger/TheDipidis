// Wave-1 Layer-2.3 — hybrid bundle entry point for ES-module-style files.
//
// Files that opt into real `import` / `export` live in `js/modules/` and are
// re-exported from this index. esbuild bundles them into
// `_dist/app.modules.bundle.js` with `format:'iife'` + `globalName:'AppModules'`,
// then a footer copies every export onto `window` so the legacy concat bundle
// — which still hosts the bulk of the code — can call them globally.
//
// At Layer-2.3 there are no real modules yet; this file only carries a
// sentinel marker so we can verify the IIFE loads (and loads BEFORE the
// legacy concat bundle) at runtime. Layer-2.4 introduces the first real
// module conversion (app-calculator → real `export`s).

export const APP_MODULES_BUNDLE_VERSION = '2.3.0-bootstrap';
