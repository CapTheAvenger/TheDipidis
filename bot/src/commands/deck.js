/**
 * /deck — placeholder for Phase 2/3.
 *
 * Final shape (to land in Phase 3):
 *   1. Inline keyboard with the user's saved decks (pulled from
 *      thedipidis.app Firestore via service-account credentials)
 *      plus current-meta archetypes from the static data files.
 *   2. On pick: screenshot of the deck builder view + a second
 *      image with up to 10 tech-card suggestions from
 *      app-tech-lab's logic.
 *   3. Sends the 60-card decklist as a copy-friendly text block
 *      alongside the images.
 */

import { MENU_LABEL_DECK } from './start.js';

export function registerDeck(bot) {
    bot.command('deck', (ctx) => placeholder(ctx));
    bot.action('deck:list', async (ctx) => {
        await ctx.answerCbQuery();
        return placeholder(ctx);
    });
    // Persistent reply-keyboard taps arrive as plain text — match the
    // exact button label so they route to the same handler as /deck.
    bot.hears(MENU_LABEL_DECK, (ctx) => placeholder(ctx));
}

async function placeholder(ctx) {
    return ctx.reply(
        '🚧 Deck Builder kommt in Phase 3.\n' +
            'Geplant: Auswahl-Liste der Decks → Bild mit Nutzungs-Stats + Tech-Cards → Decklist als kopierbarer Text.',
    );
}
