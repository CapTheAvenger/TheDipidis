/**
 * /myid — replies with the user's Telegram chat ID.
 *
 * Why this exists:
 *   The site's Settings → Preisalarme section needs the user's chat ID
 *   to push Wishlist + Trade List price alerts via the bot. Telegram
 *   doesn't surface the chat ID anywhere in the standard UI, so the
 *   bot becomes the simplest source of truth — paste /myid in the
 *   chat, get a number, copy it into Settings.
 *
 * The reply also includes a one-tap copy button (HTML <code>…</code>
 * makes the number long-press-copyable on mobile clients).
 */
export function registerMyId(bot) {
    bot.command('myid', (ctx) => {
        const id = ctx.from && ctx.from.id;
        if (!id) {
            return ctx.reply('Konnte deine Telegram-User-ID nicht ermitteln 😕');
        }
        return ctx.reply(
            `Deine Telegram-Chat-ID:\n\n<code>${id}</code>\n\n` +
            'Tippe auf die Zahl, um sie zu kopieren. Dann auf der Webseite unter ' +
            '<b>Mein Profil → Account → Einstellungen → Preisalarme</b> einfügen ' +
            'und den Toggle aktivieren.',
            { parse_mode: 'HTML' },
        );
    });
}
