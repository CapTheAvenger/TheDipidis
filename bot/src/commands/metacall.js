/**
 * /metacall — placeholder for Phase 2.
 *
 * Will pull the tournament list from
 * https://thedipidis.app/data/current_meta_scraped_tournaments.json,
 * surface it as an inline keyboard, then call into screenshot.js to
 * render the Meta Call dashboard view for the picked tournament.
 *
 * Phase 1 just acknowledges the action so the menu wiring can be
 * verified end-to-end before we bring Puppeteer online.
 */

export function registerMetaCall(bot) {
    bot.command('metacall', (ctx) => placeholder(ctx));
    bot.action('metacall:list', async (ctx) => {
        await ctx.answerCbQuery();
        return placeholder(ctx);
    });
}

async function placeholder(ctx) {
    return ctx.reply(
        '🚧 Meta Call kommt in Phase 2.\n' +
            'Wenn der Screenshot-Pipeline live ist, kriegst du hier eine Liste der Turniere als Buttons und ein pixelgenaues Dashboard-Bild zurück.',
    );
}
