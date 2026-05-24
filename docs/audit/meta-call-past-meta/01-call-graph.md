# Phase 1 — Meta Call call-graph (Ist-Zustand)

## Entry-points

### A. User opens Meta Call (Profile → Meta Call sub-tab)

```
switchTabAndUpdateMenu('profile')                        index.html:472
  └─ switchTab('profile')                                js/app-core.js:1227
switchProfileTab('metacall')                             (binding via profile-tab-btn)
  └─ MetaCall.init()                                     js/app-meta-call.js:6165
     ├─ container = document.getElementById('profile-metacall')   js/app-meta-call.js:6166
     ├─ ok = await loadData()                            js/app-meta-call.js:6176, defined :2431
     │   ├─ fetch limitless_online_decks_comparison.csv  js/app-meta-call.js:2434
     │   ├─ fetch online_tournament_top8_decks.csv       js/app-meta-call.js:2473
     │   ├─ fetch format_window.json                     js/app-meta-call.js:2501
     │   ├─ fetch labs_tournament_decks.csv              js/app-meta-call.js:2521
     │   └─ fetch limitless_online_decks_matchups.csv    js/app-meta-call.js:2801
     ├─ _runPredictor()                                  js/app-meta-call.js:2790, defined :1742
     ├─ _decorateMetaCallEntries()                       js/app-meta-call.js:6311
     └─ renderAll()                                      js/app-meta-call.js:6312, defined :4170
        ├─ renderSettingsPanel()                         :4214 (defined :3569)
        ├─ renderMetaCallModePanel()                     :4215 (defined :3646)
        ├─ renderSourcesPanel()                          :4216 (defined :3670)
        ├─ renderFieldPanel(field)                       :3781
        ├─ renderRecommendationsPanel(field)             :4231
        └─ renderResultsPanel(field)                     :4045
```

### B. User clicks an archetype in Recommendations

```
<row onclick="MetaCall._jumpToDeckAnalysis(deckName)">
  └─ _jumpToDeckAnalysis(deckName)                       js/app-meta-call.js:6196
     └─ window.navigateToCurrentMetaWithDeck(deckName)   defined js/app-core.js:1467
        ├─ switchTab('current-analysis')                 js/app-core.js:1472
        ├─ poll select#currentMetaDeckSelect             js/app-core.js:1478
        ├─ select.value = matchingOption.value           js/app-core.js:1490
        └─ loadCurrentMetaDeckData(matchingOption.value) js/app-core.js:1492
```

### C. User switches Meta Call mode (standard/counter)

```
<button onclick="MetaCall._setMetaCallMode(key)">
  └─ _setMetaCallMode(key)                               js/app-meta-call.js (defined later)
     └─ _runPredictor() + renderAll()
```

## State variables relevant to source

The module-internal state at `js/app-meta-call.js:8-50` exposes:

- `_shareList` — `[{name, onlineShare, ladderShare, trend, onlineWinPct}]`
- `_tournamentStats` — `normalize(deck) -> { broughtShare, top8Conv, … }`
- `_labsRowsByDeck` — Major Day-2 data
- `_metaCallMode` — `'standard'` | `'counter'` (session-scoped)
- `_useClCurrent` / `_useClPast` — CL toggles

**No "source" concept exists today** — everything assumes the current
ladder + current labs + current matchups as the truth.

## Existing extension points

- `renderSettingsPanel()`, `renderMetaCallModePanel()`, `renderSourcesPanel()`
  — three panels stacked in `renderAll()` at lines 4214-4216.
  New "Source" panel would slot in between Settings and Mode.
- Module export at line 6341 — `_setMetaCallMode`-style click handlers
  attach onto `window.MetaCall.*`. New handlers added the same way.
- `window.navigateToCurrentMetaWithDeck` (`js/app-core.js:1467`) is
  the routing template — duplicate for Past Meta target.

## Past Meta module surface

```
js/app-past-meta.js
  ├─ pastMetaDecks (array of deck objects)
  ├─ pastMetaTournaments (filtered overview rows)
  ├─ DOM hooks: #pastMetaFormatFilter, #pastMetaTournamentFilter, #pastMetaDeckSelect
  └─ Listeners (line 342-349):
       formatSelect change → _loadPastMetaChunksIfNeeded(format) + updatePastMetaTournamentFilter() + updatePastMetaDeckList()
       deckSelect change → onPastMetaDeckSelect()
```

A new `navigateToPastMetaWithDeck(deckName, format)` must:
1. `switchTabAndUpdateMenu('past-meta')`
2. Set `formatSelect.value = format` and dispatch a `change` event (or call the handler chain directly)
3. Poll `deckSelect` for the deck name and set + fire change
