# Tutorial Screenshots

Drop screenshots here matching the filenames the tutorial expects:

| Filename | What to capture |
|---|---|
| `01-meta-hub.png` | The Meta Hub homepage with the six-tile grid + card legend visible below |
| `02-meta-call.png` | Meta Call dashboard, ideally with a few overrides applied so the user sees the three-column read-out |
| `03-deck-builder.png` | Deck Analysis (Global) Deck Builder with a generated 60-card list + the Tech Slots row populated |
| `04-cooking-mode.png` | Cooking Mode active in Deck Analysis (Global), showing the pin / exclude action row on a few cards |
| `05-card-overview.png` | A Card Overview with at least one card carrying every badge (max-count, deck-count, wishlist, owned-other-prints amber, the full info stack) |
| `06-telegram-bot.png` | The Telegram bot chat showing the persistent menu + a sample Meta Call PNG returned |

## Sizing
Portrait orientation (mobile-style) works best at ~720×1280 px.
The CSS uses `aspect-ratio: 9 / 16` and `object-fit: cover`, so any
reasonable portrait image will look correct.

## Fallback
Until you drop a real file in, the tutorial slot renders a captioned
gradient placeholder (see `app-init.js` — the `Image()` probe leaves
the placeholder in place if the file 404s).
