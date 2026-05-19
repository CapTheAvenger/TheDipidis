// ESLint flat config — pragmatic baseline for a vanilla-JS-with-globals codebase.
//
// Philosophy: this lint pass should only flag *real* bugs (typos, dead code,
// shadowing, accidental fallthrough). It must NOT flood the build with thousands
// of "no-undef" / "no-unused-vars" warnings on a codebase that intentionally
// communicates via window.X globals — we'll tighten the rules incrementally
// after Phase B (modularization).

const globals = require('globals');

// Project-specific globals exposed across the load chain (see index.html for
// the script order). Listed explicitly so no-undef stays useful.
const PROJECT_GLOBALS = {
  // App-wide singletons
  DEV_MODE: 'readonly',
  APP_VERSION: 'readonly',
  CARD_BACK_URL: 'readonly',

  // CDN libs loaded via <script src=...>
  firebase: 'readonly',
  Chart: 'readonly',
  Papa: 'readonly',
  localforage: 'readonly',
  MobileDragDrop: 'readonly',

  // Build-time injected
  FIREBASE_CREDS: 'readonly',
  GOOGLE_CLIENT_ID: 'readonly',

  // Project-owned globals — these get assigned across the load chain. Marked
  // 'writable' so legitimate assignments aren't flagged while we still wait
  // for Phase B to convert to real modules.
  t: 'writable',
  showToast: 'writable',
  showNotification: 'writable',
  switchTab: 'writable',
  escapeHtml: 'writable',
  formatNumber: 'writable',
  loadCSV: 'writable',
  BASE_PATH: 'writable',
};

module.exports = [
  // Browser-side application code
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...PROJECT_GLOBALS,
      },
    },
    rules: {
      // Real-bug catchers — keep ON
      'no-cond-assign': ['error', 'except-parens'],
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty-pattern': 'error',
      'no-ex-assign': 'error',
      'no-func-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-misleading-character-class': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',

      // Common bugs that aren't strictly syntax
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-extra-boolean-cast': 'error',
      'no-prototype-builtins': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
      'no-with': 'error',
      'require-yield': 'error',

      // Style/quality rules — kept as WARN until Phase B (modularization).
      // no-undef is *intentionally* warn-only on this vanilla-JS-with-globals
      // codebase: ESLint can't statically see cross-file window.* deps, so a
      // hard error would produce ~1400 false positives. Once ES modules are
      // introduced in Phase B, flip this back to 'error'.
      'no-undef': 'warn',
      'no-unused-vars': ['warn', {
        args: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],
      'no-redeclare': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Node-side test code
  {
    files: ['tests/unit/**/*.js', 'tests/e2e/**/*.js', 'tests/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },

  // Service worker — has its own global scope
  {
    files: ['service-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'error',
    },
  },

  // Tooling / build scripts
  {
    files: ['*.config.js', 'tests/e2e/run-*.js', 'tests/e2e/runtime-*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },

  // Hard-ignore generated/third-party/data folders
  {
    ignores: [
      'data/**',
      'node_modules/**',
      'test-results/**',
      'test-artifacts/**',
      'tests/artifacts/**',
      '_site/**',
      'images/**',
      'js/firebase-credentials.js',
    ],
  },
];
