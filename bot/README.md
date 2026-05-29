# thedipidis-bot

Telegram bot that surfaces snapshots from [thedipidis.app](https://thedipidis.app):
Meta Call dashboard, deck-builder views with tech-card suggestions, copy-friendly
decklists.

## Status

| Phase | What | Status |
|---|---|---|
| 1 | Bot scaffold, `/start` menu, whitelist, Render deploy | ✅ done |
| 2 | Puppeteer screenshot pipeline + `/metacall` | ⏳ next |
| 3 | `/deck` with tech-cards image + decklist text | ⏳ later |

## Deploy to Render (one-time)

1. **Create the bot on Telegram**
   - Message [@BotFather](https://t.me/BotFather) → `/newbot` → pick a name +
     username. Copy the token.
2. **Find your Telegram user ID**
   - Message [@userinfobot](https://t.me/userinfobot). Note the numeric `id`.
3. **Deploy on Render**
   - Sign in at [render.com](https://render.com) with your GitHub.
   - **New → Blueprint** → pick the `TheDipidis` repo → confirm.
   - Render reads `bot/render.yaml` and creates the service.
4. **Set env vars on the service**
   - `BOT_TOKEN` — token from step 1
   - `ALLOWED_USER_IDS` — your id from step 2 (add friends' ids comma-separated)
5. **Wait for first build** (~3 min for npm install + Chromium download).
   The bot starts polling automatically.

## Run locally

```bash
cd bot
cp .env.example .env
# fill in BOT_TOKEN + ALLOWED_USER_IDS
npm install
npm run dev
```

Then `/start` in Telegram — you should see the main menu.

## Architecture

```
src/
  index.js              Express server + Telegraf entry
  auth.js               Whitelist middleware (ALLOWED_USER_IDS)
  commands/
    start.js            /start, /menu + main inline keyboard
    metacall.js         /metacall — placeholder, Phase 2
    deck.js             /deck — placeholder, Phase 3
  screenshot.js         Puppeteer wrapper (Phase 2)
```

The bot lives next to the main app in this monorepo so we share data file
URLs + scraper outputs, but it's deployed as its own Render service. The
PWA on GitHub Pages is unchanged.

## Free-tier cold starts

Render Free spins the service down after 15 min idle. The first message
after sleep takes ~30 s while the dyno wakes up + Chromium loads. For
sub-second responses, upgrade to Render Starter ($7/mo) — the
`render.yaml` keeps the same shape.

A cheaper way: ping `/health` from [UptimeRobot](https://uptimerobot.com)
every 5 min to keep the dyno warm. Free, just adds a small extra
HTTP request load.
