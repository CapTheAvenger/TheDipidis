/* ds-share.js — die drei teilbaren Bilder.
 *
 * Die Seite hatte genau einen Bildexport: _buildDeckCanvas() im
 * Deckbauer, ein Kartengitter auf dunklem Verlauf. Was hier dazukommt,
 * sind die beiden Bilder, nach denen im Wettkampfumfeld tatsächlich
 * gefragt wird:
 *
 *   1. Die Deck-Analyse als 1200×675 — Anteil, Siegquote, Top-8 gegen
 *      Erwartung, dazu die Matchup-Tabelle. Nach poke_hives Vorlage,
 *      mit drei Korrekturen: die Skala ist blau↔rot statt grün↔rot
 *      (css/tokens.css nennt poke_hive dort ausdrücklich als Vorbild
 *      mit genau dieser Schwäche), jede Zeile trägt ihre Partienzahl
 *      und ihre Bilanz, und die Quote nennt ihre Herkunft.
 *   2. Das Turnierergebnis als 1080×1080 — Platzierung, Bilanz, Deck,
 *      Runde für Runde. Das Format, in dem Ergebnisse geteilt werden.
 *
 * Gemalt wird auf <canvas>, nicht per DOM-Rasterizer: die Seite hat
 * keine html2canvas-Abhängigkeit und soll keine bekommen, und ein
 * Bild, das exakt 1200×675 misst, ist auf X, Instagram und Discord
 * vorhersagbar — eine DOM-Aufnahme ist es nie.
 *
 * Kein !important, keine neue Abhängigkeit, keine Netzwerkquelle außer
 * denen, die die Seite ohnehin schon lädt.
 */
(function () {
    'use strict';

    /* ── Palette ──────────────────────────────────────────────────────
     *
     * Ein Canvas kann keine CSS-Variablen auflösen, also stehen die
     * Werte hier. Es sind die Dunkelmodus-Werte aus css/tokens.css, und
     * zwar unabhängig davon, welches Thema der Nutzer gerade sieht: das
     * Bild verlässt die Seite und soll überall gleich aussehen.
     *
     * tests/unit/test-ds-share.js vergleicht diese Tabelle Zeile für
     * Zeile mit css/tokens.css und schlägt an, sobald eine Farbe dort
     * wandert. Ohne diesen Test wäre das hier eine stille Kopie.
     */
    var C = {
        bg0:      '#05070f',   /* --surface-0 eine Stufe tiefer, Kopf/Fuß */
        bg1:      '#0b0f1e',   /* --surface-0 dunkel */
        surface1: '#111730',
        surface2: '#161d3a',
        line:     '#253057',
        lineStrong: '#35427a',
        ink:      '#eef2ff',
        ink2:     '#b9c1e0',
        ink3:     '#8791b8',
        brand:    '#5566e0',
        brandInk: '#8b98ff',
        gold:     '#ffcb05',
        alarm:    '#ff6a4d',
        dvPos:    '#6aa8ff',
        dvNeg:    '#ff8f7a',
        dvZero:   '#6a739a',
        dvPosBg:  'rgba(106, 168, 255, .16)',
        dvNegBg:  'rgba(255, 143, 122, .16)',
        spaceJp:  '#f0b429',
        spaceGl:  '#5566e0',
        spacePast:'#8791b8'
    };

    var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

    function fSans(size, weight) { return (weight || 400) + ' ' + size + 'px ' + SANS; }
    function fMono(size, weight) { return (weight || 400) + ' ' + size + 'px ' + MONO; }

    /* ── Sprache ──────────────────────────────────────────────────── */
    function isDe() {
        try { return (typeof getLang === 'function' ? getLang() : 'de') === 'de'; }
        catch (e) { return true; }
    }
    function L(de, en) { return isDe() ? de : en; }

    /* ── Zahlen ───────────────────────────────────────────────────────
     * Die CSVs liefern deutsche Dezimalkommas; formatPercent/parse-
     * LocaleNumber aus app-utils.js sind die Wahrheit. Hier nur die
     * Ausgabe, damit die Bildkarte dieselben Ziffern zeigt wie die
     * Kachel daneben. */
    function num(v, digits) {
        if (v === null || v === undefined || !isFinite(v)) return '–';
        var d = digits === undefined ? 2 : digits;
        return Number(v).toLocaleString(isDe() ? 'de-DE' : 'en-GB',
            { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    function signed(v, digits) {
        if (v === null || v === undefined || !isFinite(v)) return '–';
        return (v >= 0 ? '+' : '−') + num(Math.abs(v), digits === undefined ? 1 : digits);
    }

    /* ── Bilder ───────────────────────────────────────────────────────
     *
     * Wortgleich zur Lösung in app-deck-builder.js:2659 ff.: die
     * Limitless-CDN und r2.limitlesstcg.net senden kein
     * Access-Control-Allow-Origin, ein direkt gezeichnetes Bild
     * vergiftet das Canvas und toBlob() wirft. Deshalb der weserv-Proxy
     * plus harte Zeitgrenze — ein hängender Abruf darf das Bild nicht
     * für immer blockieren, sondern nur seinen eigenen Platz leer
     * lassen.
     */
    var IMG_TIMEOUT_MS = 10000;

    function corsUrl(url) {
        if (!url || url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return url;
        try {
            var u = new URL(url, location.href);
            if (u.origin === location.origin) return url;
        } catch (e) { return url; }
        return 'https://images.weserv.nl/?url=' + encodeURIComponent(url);
    }

    function loadImage(url) {
        return new Promise(function (resolve) {
            if (!url) return resolve(null);
            var settled = false;
            var img = new Image();
            img.crossOrigin = 'anonymous';
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                resolve(null);
            }, IMG_TIMEOUT_MS);
            img.onload = function () {
                if (settled) return;
                settled = true; clearTimeout(timer); resolve(img);
            };
            img.onerror = function () {
                if (settled) return;
                settled = true; clearTimeout(timer); resolve(null);
            };
            img.src = corsUrl(url);
        });
    }

    /* Ein Archetyp hat ein oder zwei Sprites. Fehlt das Verzeichnis oder
     * der Name, kommt ein leeres Feld zurück und der Aufrufer malt das
     * Kürzel — nie ein kaputtes Bildsymbol. */
    function iconUrls(name) {
        try {
            if (window.ArchetypeIcons && typeof window.ArchetypeIcons.getIconUrls === 'function') {
                return window.ArchetypeIcons.getIconUrls(name) || [];
            }
        } catch (e) { /* egal */ }
        return [];
    }
    function loadIcons(name, max) {
        var urls = iconUrls(name).slice(0, max || 2);
        return Promise.all(urls.map(loadImage)).then(function (a) {
            return a.filter(Boolean);
        });
    }

    /* Kürzel als Ersatzbild: die ersten Buchstaben der ein bis zwei
     * Wörter, in einer getönten Zelle. Sieht wie eine Entscheidung aus,
     * nicht wie ein Ladefehler. */
    function initials(name) {
        var parts = String(name || '?').split(/\s+/).filter(Boolean);
        return parts.slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
    }

    /* ── Zeichenwerkzeug ──────────────────────────────────────────── */
    function rr(ctx, x, y, w, h, r) {
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y, x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x, y + h, rad);
        ctx.arcTo(x, y + h, x, y, rad);
        ctx.arcTo(x, y, x + w, y, rad);
        ctx.closePath();
    }

    /* Kürzt mit echtem Auslassungszeichen statt drei Punkten und misst
     * dabei — "My De…" im Kopf der mobilen Ansicht war genau der Fehler,
     * den das Audit gefunden hat. Hier ist die Breite fest, also wird
     * gemessen und nicht geraten. */
    function clip(ctx, text, maxW) {
        var s = String(text === null || text === undefined ? '' : text);
        if (ctx.measureText(s).width <= maxW) return s;
        var lo = 0, hi = s.length;
        while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
        }
        return s.slice(0, lo) + '…';
    }

    function label(ctx, text, x, y, color) {
        ctx.save();
        ctx.font = fSans(11, 700);
        ctx.fillStyle = color || C.ink3;
        ctx.textBaseline = 'alphabetic';
        /* letterSpacing gibt es nur in neueren Engines; ohne sie steht
         * das Label eben etwas enger — kein Grund für einen Fallback. */
        try { ctx.letterSpacing = '0.09em'; } catch (e) { /* egal */ }
        ctx.fillText(String(text).toUpperCase(), x, y);
        try { ctx.letterSpacing = '0px'; } catch (e) { /* egal */ }
        ctx.restore();
    }

    function pokeball(ctx, cx, cy, r) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath();
        ctx.fillStyle = '#e3350d'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = C.bg0; ctx.lineWidth = Math.max(2, r * 0.18);
        ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    /* Sprite oder Kürzel — der Aufrufer muss nie unterscheiden. */
    function sprite(ctx, img, x, y, size, fallbackText) {
        if (img) { ctx.drawImage(img, x, y, size, size); return; }
        ctx.save();
        ctx.fillStyle = C.surface2;
        rr(ctx, x, y, size, size, Math.max(4, size * 0.22)); ctx.fill();
        ctx.strokeStyle = C.lineStrong; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.ink2;
        ctx.font = fSans(Math.max(9, Math.round(size * 0.42)), 700);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(fallbackText || '?', x + size / 2, y + size / 2 + 1);
        ctx.restore();
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }

    /* ═══════════════════════════════════════════════════════════════
     * Karte 1 · Deck-Analyse, 1200 × 675
     * ═══════════════════════════════════════════════════════════════ */

    var DC = {
        W: 1200, H: 675,
        HEAD: 64, STATS: 128, FOOT: 38,
        KEY_W: 300, PAD: 24
    };

    function deckCardCanvas(spec, art) {
        var cv = document.createElement('canvas');
        cv.width = DC.W; cv.height = DC.H;
        var ctx = cv.getContext('2d');
        var bodyY = DC.HEAD + DC.STATS;
        var bodyH = DC.H - DC.FOOT - bodyY;

        /* Grund */
        ctx.fillStyle = C.bg1; ctx.fillRect(0, 0, DC.W, DC.H);

        /* ── Kopf ───────────────────────────────────────────────── */
        ctx.fillStyle = C.bg0; ctx.fillRect(0, 0, DC.W, DC.HEAD);
        pokeball(ctx, DC.PAD + 11, DC.HEAD / 2, 11);
        ctx.fillStyle = C.ink3;
        ctx.font = fSans(13, 700);
        ctx.textBaseline = 'middle';
        ctx.fillText('thedipidis.app', DC.PAD + 30, DC.HEAD / 2 + 1);

        /* Sprites rechts, dahinter das Formatschild. */
        var rightX = DC.W - DC.PAD;
        var fmtText = spec.format || '';
        if (fmtText) {
            ctx.font = fSans(11, 700);
            var fw = ctx.measureText(fmtText.toUpperCase()).width + 20;
            ctx.strokeStyle = C.lineStrong; ctx.lineWidth = 1;
            rr(ctx, rightX - fw, DC.HEAD / 2 - 11, fw, 22, 6); ctx.stroke();
            label(ctx, fmtText, rightX - fw + 10, DC.HEAD / 2 + 4, C.ink2);
            rightX -= fw + 10;
        }
        var icons = art.icons || [];
        for (var i = icons.length - 1; i >= 0; i--) {
            rightX -= 40;
            sprite(ctx, icons[i], rightX, DC.HEAD / 2 - 20, 40, initials(spec.name));
            rightX -= 6;
        }
        if (!icons.length) {
            rightX -= 40;
            sprite(ctx, null, rightX, DC.HEAD / 2 - 20, 40, initials(spec.name));
        }

        /* Titel mittig zwischen Marke und Sprites — nicht auf der
         * Bildmitte, sonst rutscht er bei langen Namen unter die
         * Sprites. */
        var titleL = DC.PAD + 150, titleR = rightX - 16;
        ctx.font = fSans(34, 700);
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'center';
        ctx.fillText(clip(ctx, spec.name, titleR - titleL), (titleL + titleR) / 2, DC.HEAD / 2 + 1);
        ctx.textAlign = 'start';

        /* ── Kennzahlen ─────────────────────────────────────────────
         * Drei Spalten, 2 px Fuge in --line: 1 / 1.35 / 1.35, weil die
         * beiden rechten eine Herleitung tragen und die linke nur eine
         * Zahl. */
        ctx.fillStyle = C.line;
        ctx.fillRect(0, DC.HEAD, DC.W, DC.STATS);
        var units = 1 + 1.35 + 1.35;
        var free = DC.W - 4;
        var w1 = Math.round(free * (1 / units));
        var w2 = Math.round(free * (1.35 / units));
        var cols = [
            { x: 0, w: w1 },
            { x: w1 + 2, w: w2 },
            { x: w1 + w2 + 4, w: DC.W - (w1 + w2 + 4) }
        ];

        function statCol(col, accent, value, valueColor, key, note, note2) {
            ctx.fillStyle = C.surface1;
            ctx.fillRect(col.x, DC.HEAD, col.w, DC.STATS);
            ctx.fillStyle = accent;
            ctx.fillRect(col.x, DC.HEAD, col.w, 3);
            var x = col.x + DC.PAD;
            var maxW = col.w - DC.PAD * 2;
            ctx.textBaseline = 'alphabetic';
            ctx.font = fMono(42, 700);
            ctx.fillStyle = valueColor;
            ctx.fillText(clip(ctx, value, maxW), x, DC.HEAD + 62);
            label(ctx, key, x, DC.HEAD + 84);
            ctx.font = fMono(12, 400);
            ctx.fillStyle = C.ink3;
            ctx.fillText(clip(ctx, note || '', maxW), x, DC.HEAD + 102);
            if (note2) {
                ctx.font = fSans(11, 400);
                ctx.fillText(clip(ctx, note2, maxW), x, DC.HEAD + 118);
            }
        }

        var hasShare = isFinite(spec.share);
        statCol(cols[0], C.dvZero,
            hasShare ? num(spec.share, 2) + ' %' : '–',
            C.ink,
            L('Anteil im Feld', 'Meta share'),
            hasShare ? num(spec.count, 0) + ' ' + L('Listen', 'lists') : L('keine Daten', 'no data'));

        var wrDelta = isFinite(spec.winRate) ? spec.winRate - 50 : null;
        statCol(cols[1],
            wrDelta === null ? C.dvZero : (wrDelta >= 0 ? C.dvPos : C.dvNeg),
            isFinite(spec.winRate) ? num(spec.winRate, 2) + ' %' : '–',
            C.ink,
            L('Siegquote', 'Win rate'),
            wrDelta === null ? L('keine Daten', 'no data')
                : signed(wrDelta, 2) + ' ' + L('ggü. 50 %', 'vs 50%'),
            L('Siege ÷ gewertete Partien, Unentschieden halb',
              'wins ÷ scored games, ties count half'));

        var hasConv = isFinite(spec.perfPct);
        statCol(cols[2],
            !hasConv ? C.dvZero : (spec.perfPct >= 0 ? C.dvPos : C.dvNeg),
            hasConv ? signed(spec.perfPct, 1) + ' %' : '–',
            C.ink,
            L('Top-8 gegen Erwartung', 'Top-8 vs expectation'),
            hasConv ? num(spec.top8, 0) + ' / ' + num(spec.brought, 0) + ' → '
                      + num((spec.top8 / spec.brought) * 100, 2) + ' %'
                    : L('zu wenig Daten', 'not enough data'),
            hasConv
                ? (spec.thin
                    ? L('n unter 50 — zum Feld hin geglättet (K=50)',
                        'n below 50 — smoothed toward the field (K=50)')
                    : L('empirisch-bayessche Glättung, K=50',
                        'empirical-Bayes shrinkage, K=50'))
                : L('Deck fehlt in der Top-Cut-Datei', 'deck absent from the top-cut file'));

        /* ── Körper links: Sprites groß + Herkunft ─────────────────── */
        ctx.fillStyle = C.line; ctx.fillRect(0, bodyY, DC.W, bodyH);
        ctx.fillStyle = C.surface1;
        ctx.fillRect(0, bodyY, DC.KEY_W, bodyH);

        var artH = 210;
        var g = ctx.createRadialGradient(DC.KEY_W / 2, bodyY + artH * 0.4, 10,
                                         DC.KEY_W / 2, bodyY + artH * 0.4, DC.KEY_W * 0.62);
        g.addColorStop(0, 'rgba(85,102,224,.26)');
        g.addColorStop(1, 'rgba(85,102,224,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, bodyY, DC.KEY_W, artH);

        var big = icons.length ? icons : [null];
        var bs = big.length > 1 ? 112 : 140;
        var totalW = big.length * bs + (big.length - 1) * 10;
        var bx = (DC.KEY_W - totalW) / 2;
        for (var k = 0; k < big.length; k++) {
            sprite(ctx, big[k], bx + k * (bs + 10), bodyY + (artH - bs) / 2, bs, initials(spec.name));
        }

        var ly = bodyY + artH + 8;
        var lines = [
            [L('Datenraum', 'Data space'), spec.spaceLabel || '–'],
            [L('Format', 'Format'), spec.format || '–'],
            [L('Quelle', 'Source'), spec.source || '–'],
            [L('Feld gesamt', 'Field total'),
             isFinite(spec.totalBrought) ? num(spec.totalBrought, 0) + ' ' + L('Einträge', 'entries') : '–'],
            [L('Stand', 'As of'), spec.stand || '–']
        ];
        for (var li = 0; li < lines.length; li++) {
            label(ctx, lines[li][0], DC.PAD, ly + 12);
            ctx.font = fSans(13, 600);
            ctx.fillStyle = C.ink2;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(clip(ctx, lines[li][1], DC.KEY_W - DC.PAD * 2), DC.PAD, ly + 30);
            ly += 40;
        }

        /* ── Körper rechts: Matchups ────────────────────────────────
         * Partienzahl und Bilanz stehen in jeder Zeile. Trainer Hill
         * macht das vor und es ist der Grund, warum man seinen Zahlen
         * glauben kann: eine 67-%-Zeile über 9 Partien und eine über
         * 300 sind nicht dasselbe Argument. */
        var mx = DC.KEY_W + 2;
        ctx.fillStyle = C.surface1;
        ctx.fillRect(mx, bodyY, DC.W - mx, bodyH);

        var tx = mx + 20;
        var xGames  = mx + 600;
        var xRecord = mx + 740;
        var wrX = DC.W - 20 - 116, wrW = 116;
        var ty = bodyY + 30;

        label(ctx, L('Gegner', 'Opponent'), tx, ty);
        ctx.textAlign = 'right';
        label(ctx, L('Partien', 'Games'), xGames, ty);
        label(ctx, L('Bilanz', 'Record'), xRecord, ty);
        label(ctx, L('Siegquote', 'Win rate'), wrX + wrW - 10, ty);
        ctx.textAlign = 'start';
        ctx.fillStyle = C.line;
        ctx.fillRect(tx, ty + 8, DC.W - 20 - tx, 1);

        var rowH = 34;
        var maxRows = Math.floor((bodyY + bodyH - (ty + 14) - 26) / rowH);

        /* Beste UND schlechteste Matchups, nicht die besten elf.
         * Eine Bildkarte, die nur die Oberseite der sortierten Liste
         * zeigt, ist Werbung — jedes Deck sieht darauf gut aus. Die
         * Frage vor einem Turnier ist die andere: woran stirbt es? */
        var all = (spec.matchups || []);
        var mus = all;
        var cutAfter = -1;
        if (all.length > maxRows) {
            var head = Math.ceil((maxRows - 1) / 2);
            var tail = (maxRows - 1) - head;
            mus = all.slice(0, head).concat(all.slice(all.length - tail));
            cutAfter = head - 1;
        }
        var hidden = all.length - mus.length;
        var ry = ty + 14;

        for (var r = 0; r < mus.length; r++) {
            var m = mus[r];
            var cy = ry + rowH / 2;
            sprite(ctx, (art.mIcons && art.mIcons[r]) || null, tx, cy - 11, 22, initials(m.opponent));
            ctx.font = fSans(13, 500);
            ctx.fillStyle = m.thin ? C.ink3 : C.ink;
            ctx.textBaseline = 'middle';
            ctx.fillText(clip(ctx, m.opponent, xGames - 110 - (tx + 30)), tx + 30, cy);

            ctx.textAlign = 'right';
            ctx.font = fMono(13, 400);
            ctx.fillStyle = C.ink3;
            ctx.fillText(num(m.games, 0), xGames, cy);
            ctx.fillText((m.wins || 0) + '–' + (m.losses || 0), xRecord, cy);
            ctx.textAlign = 'start';

            /* Getönte Zelle statt farbigem Text: der Kontrast bleibt
             * konstant, egal wie stark die Tönung ist. */
            var d = m.winRate - 50;
            ctx.fillStyle = m.thin ? 'rgba(135,145,184,.10)'
                          : (d >= 0 ? C.dvPosBg : C.dvNegBg);
            rr(ctx, wrX, cy - 13, wrW, 26, 6); ctx.fill();
            ctx.font = fMono(14, 700);
            ctx.fillStyle = m.thin ? C.ink3 : C.ink;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(num(m.winRate, 1) + ' %', wrX + wrW - 10, cy);
            ctx.textAlign = 'start';

            ctx.fillStyle = 'rgba(37,48,87,.55)';
            ctx.fillRect(tx, ry + rowH - 1, DC.W - 20 - tx, 1);
            ry += rowH;

            if (r === cutAfter && hidden > 0) {
                ctx.font = fSans(12, 400);
                ctx.fillStyle = C.ink3;
                ctx.textBaseline = 'middle';
                ctx.fillText('· · ·  ' + hidden + ' ' + L('weitere Matchups ausgelassen',
                    'more matchups omitted') + '  · · ·', tx, ry + rowH / 2);
                ctx.fillStyle = 'rgba(37,48,87,.55)';
                ctx.fillRect(tx, ry + rowH - 1, DC.W - 20 - tx, 1);
                /* Kein r++: die Auslassung kostet eine Bildzeile, aber
                 * keinen Listeneintrag — mus ist bereits um genau diese
                 * eine Zeile gekürzt. */
                ry += rowH;
            }
        }

        if (!mus.length) {
            ctx.font = fSans(14, 400);
            ctx.fillStyle = C.ink3;
            ctx.textBaseline = 'middle';
            ctx.fillText(L('Für dieses Deck liegen keine Matchup-Daten vor.',
                           'No matchup data for this deck yet.'), tx, ry + 24);
        } else {
            /* Die Legende steht nur da, wenn sie etwas erklärt. Ein Hinweis
             * auf graue Zeilen unter einer Tabelle ohne graue Zeile ist
             * Rauschen — und Rauschen ist genau das, was das Audit an den
             * bestehenden Ansichten bemängelt hat. */
            var note = mus.some(function (m) { return m.thin; })
                ? L('Graue Zeilen: unter ' + (spec.thinGames || 20) + ' Partien — die Quote ist dort noch ein Gerücht.',
                    'Grey rows: fewer than ' + (spec.thinGames || 20) + ' games — that rate is still a rumour.')
                : L('Sortiert nach Siegquote. Jede Zeile trägt ihre Partienzahl.',
                    'Sorted by win rate. Every row carries its game count.');
            ctx.font = fSans(11, 400);
            ctx.fillStyle = C.ink3;
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(note, tx, bodyY + bodyH - 10);
        }

        /* ── Fuß ────────────────────────────────────────────────────
         * Der Datenraum steht auch hier, weil das Bild die Seite
         * verlässt: ohne ihn wäre nicht mehr erkennbar, ob die Zahlen
         * aus Japan, aus dem globalen Feld oder aus einem eingefrorenen
         * Fenster stammen. Genau diese Verwechslung war der teuerste
         * Befund des Audits. */
        ctx.fillStyle = C.bg0;
        ctx.fillRect(0, DC.H - DC.FOOT, DC.W, DC.FOOT);
        var dotColor = spec.space === 'jp' ? C.spaceJp
                     : spec.space === 'past' ? C.spacePast : C.spaceGl;
        ctx.fillStyle = dotColor;
        ctx.beginPath(); ctx.arc(DC.PAD + 4, DC.H - DC.FOOT / 2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = fSans(12, 400);
        ctx.fillStyle = C.ink3;
        ctx.textBaseline = 'middle';
        ctx.fillText([spec.spaceLabel, spec.format, spec.source].filter(Boolean).join(' · '),
                     DC.PAD + 16, DC.H - DC.FOOT / 2 + 1);
        ctx.textAlign = 'right';
        ctx.fillText(L('Stand ', 'As of ') + (spec.stand || '–') + ' · thedipidis.app',
                     DC.W - DC.PAD, DC.H - DC.FOOT / 2 + 1);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        return cv;
    }

    /* ═══════════════════════════════════════════════════════════════
     * Karte 2 · Turnierergebnis, 1080 × 1080
     *
     * Das Quadrat ist kein Geschmack, sondern das einzige Seiten-
     * verhältnis, das Instagram ungeschnitten annimmt — und dort landen
     * diese Bilder. Was drauf muss, steht in der Vorlage, die der Nutzer
     * mitgebracht hat: Platzierung, Bilanz, Deck, Runde für Runde.
     * Was NICHT drauf kommt: ein Platz für ein Foto der Person. Das
     * Ergebnis gehört auf das Bild, nicht das Gesicht.
     * ═══════════════════════════════════════════════════════════════ */

    var RC = { S: 1080, PAD: 56, ROW: 52, GAP: 6 };

    function resultCardCanvas(spec, art) {
        var cv = document.createElement('canvas');
        cv.width = RC.S; cv.height = RC.S;
        var ctx = cv.getContext('2d');

        ctx.fillStyle = C.bg0; ctx.fillRect(0, 0, RC.S, RC.S);
        var g1 = ctx.createRadialGradient(216, -108, 20, 216, -108, 780);
        g1.addColorStop(0, 'rgba(85,102,224,.38)'); g1.addColorStop(1, 'rgba(85,102,224,0)');
        ctx.fillStyle = g1; ctx.fillRect(0, 0, RC.S, RC.S);
        var g2 = ctx.createRadialGradient(1188, 1188, 20, 1188, 1188, 700);
        g2.addColorStop(0, 'rgba(255,203,5,.20)'); g2.addColorStop(1, 'rgba(255,203,5,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, RC.S, RC.S);

        /* ── Kopf: Platzierung · Turnier · Bilanz ──────────────────── */
        var x = RC.PAD, topY = 72;
        if (spec.place) {
            ctx.font = fMono(64, 700);
            ctx.fillStyle = C.gold;
            ctx.textBaseline = 'alphabetic';
            ctx.save();
            ctx.shadowColor = 'rgba(255,203,5,.35)'; ctx.shadowBlur = 24;
            ctx.fillText(spec.place, x, topY + 52);
            ctx.restore();
            x += ctx.measureText(spec.place).width + 26;
        }

        /* Bilanz rechts zuerst messen, damit der Turniername weiss,
         * wo er aufhören muss. */
        var rec = spec.record || { w: 0, l: 0, t: 0 };
        var recText = rec.w + '–' + rec.l + '–' + rec.t;
        ctx.font = fMono(40, 700);
        var recW = Math.max(ctx.measureText(recText).width, 130);
        var recX = RC.S - RC.PAD;

        ctx.font = fSans(34, 700);
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(clip(ctx, spec.tournament || L('Turnier', 'Tournament'),
                          recX - recW - 32 - x), x, topY + 34);
        ctx.font = fSans(15, 400);
        ctx.fillStyle = C.ink2;
        ctx.fillText(clip(ctx, [spec.type, spec.format, spec.date].filter(Boolean).join(' · '),
                          recX - recW - 32 - x), x, topY + 60);

        ctx.textAlign = 'right';
        ctx.font = fMono(40, 700);
        ctx.fillStyle = C.ink;
        ctx.fillText(recText, recX, topY + 40);
        label(ctx, isFinite(spec.winRate)
            ? L('Bilanz · ', 'Record · ') + num(spec.winRate, 1) + ' %'
            : L('Bilanz', 'Record'), recX, topY + 60);
        ctx.textAlign = 'start';

        /* Der Signaturstrich, derselbe wie unter der Kopfzeile der
         * Seite: Marke nach Gold. */
        var ruleY = topY + 92;
        var rg = ctx.createLinearGradient(RC.PAD, 0, RC.S - RC.PAD, 0);
        rg.addColorStop(0, C.brand); rg.addColorStop(1, C.gold);
        ctx.fillStyle = rg;
        ctx.fillRect(RC.PAD, ruleY, RC.S - RC.PAD * 2, 3);

        /* ── Das gespielte Deck ─────────────────────────────────────
         * Gross, mittig, mit Sprites. Das ist die Angabe, um die es
         * geht — wer mit was wie weit gekommen ist. */
        var big = (art.icons && art.icons.length) ? art.icons : [null];
        var bs = big.length > 1 ? 132 : 156;
        var heroH = bs + 62;                 /* Sprites plus Deckname */

        /* Erst rechnen, dann malen: wie viel Platz die Rundenliste braucht,
         * entscheidet, wo der Deckblock sitzt. Bei drei Runden stand vorher
         * ein Drittel des Bildes leer, weil der Block oben festgenagelt war
         * und die Liste unten mittig sass. */
        var contentTop = ruleY + 28;
        var footY = RC.S - 84;
        var rounds = spec.rounds || [];
        var band = footY - contentTop - heroH - 28;

        var rowH = RC.ROW;
        var fits = Math.max(0, Math.floor(band / (rowH + RC.GAP)));
        var shown = rounds.slice(0, rounds.length > fits ? Math.max(0, fits - 1) : fits);
        var rowCount = shown.length + (rounds.length > shown.length ? 1 : 0);
        /* Wenige Runden duerfen hoehere Zeilen haben — bis 84 px. Danach
         * bleibt Luft, aber sie verteilt sich oben und unten gleich. */
        if (rowCount > 0) {
            rowH = Math.max(RC.ROW, Math.min(72, Math.floor(band / rowCount) - RC.GAP));
        }
        var listH = rowCount ? rowCount * (rowH + RC.GAP) - RC.GAP : 0;
        var slack = Math.max(0, band - listH);

        /* Der Rest verteilt sich 40 / 35 / 25 auf ueber dem Deckblock,
         * zwischen Deckblock und Liste, unter der Liste. Nicht gleich
         * gedrittelt: unten steht schon die Fusszeile, oben nur der
         * Signaturstrich. */
        var heroY = contentTop + Math.round(slack * 0.40);
        var listY = heroY + heroH + 28 + Math.round(slack * 0.35);

        var totalW = big.length * bs + (big.length - 1) * 14;
        var bx = (RC.S - totalW) / 2;
        for (var k = 0; k < big.length; k++) {
            sprite(ctx, big[k], bx + k * (bs + 14), heroY, bs, initials(spec.deck));
        }
        ctx.textAlign = 'center';
        ctx.font = fSans(40, 700);
        ctx.fillStyle = C.ink;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(clip(ctx, spec.deck || '–', RC.S - RC.PAD * 2), RC.S / 2, heroY + bs + 46);
        ctx.textAlign = 'start';

        /* ── Runde für Runde ────────────────────────────────────────
         * Eine Zeile je Partie: Runde, Ausgang, Gegner, Zugreihenfolge.
         * Ohne die Zugreihenfolge fehlt dem Ergebnis die Hälfte seiner
         * Erklärung — sie steht im Journal, also steht sie auch hier. */
        for (var r = 0; r < shown.length; r++) {
            var m = shown[r];
            var y = listY + r * (rowH + RC.GAP);
            var cy = y + rowH / 2;

            ctx.fillStyle = 'rgba(17,23,48,.80)';
            rr(ctx, RC.PAD, y, RC.S - RC.PAD * 2, rowH, 12); ctx.fill();
            ctx.strokeStyle = m.result === 'win' ? C.dvPos
                            : m.result === 'loss' ? C.dvNeg : C.lineStrong;
            ctx.lineWidth = 1;
            rr(ctx, RC.PAD, y, RC.S - RC.PAD * 2, rowH, 12); ctx.stroke();

            ctx.font = fMono(15, 700);
            ctx.fillStyle = C.ink3;
            ctx.textBaseline = 'middle';
            ctx.fillText('R' + (m.n || (r + 1)), RC.PAD + 18, cy);

            var mark = m.result === 'win' ? L('S', 'W')
                     : m.result === 'loss' ? L('N', 'L') : L('U', 'T');
            var markColor = m.result === 'win' ? C.dvPos
                          : m.result === 'loss' ? C.dvNeg : C.dvZero;
            ctx.fillStyle = markColor;
            ctx.beginPath(); ctx.arc(RC.PAD + 74, cy, 15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = C.bg0;
            ctx.font = fSans(16, 700);
            ctx.textAlign = 'center';
            ctx.fillText(mark, RC.PAD + 74, cy + 1);
            ctx.textAlign = 'start';

            sprite(ctx, (art.rIcons && art.rIcons[r]) || null, RC.PAD + 104, cy - 15, 30,
                   initials(m.opponent));

            var tail = [];
            if (m.turnOrder === 'first')  tail.push(L('1. Zug', 'went first'));
            if (m.turnOrder === 'second') tail.push(L('2. Zug', 'went second'));
            if (m.games) tail.push(m.games);
            ctx.font = fSans(14, 400);
            ctx.fillStyle = C.ink3;
            var tailText = tail.join(' · ');
            var tailW = tailText ? ctx.measureText(tailText).width : 0;
            ctx.textAlign = 'right';
            if (tailText) ctx.fillText(tailText, RC.S - RC.PAD - 20, cy);
            ctx.textAlign = 'start';

            ctx.font = fSans(20, 600);
            ctx.fillStyle = C.ink;
            ctx.fillText(clip(ctx, m.opponent || '–',
                              RC.S - RC.PAD - 20 - tailW - 24 - (RC.PAD + 144)),
                         RC.PAD + 144, cy);
        }

        if (rounds.length > shown.length) {
            var my = listY + shown.length * (rowH + RC.GAP) + rowH / 2;
            ctx.font = fSans(15, 400);
            ctx.fillStyle = C.ink3;
            ctx.textBaseline = 'middle';
            ctx.fillText('+ ' + (rounds.length - shown.length) + ' '
                + L('weitere Runden', 'more rounds'), RC.PAD + 18, my);
        }

        /* ── Fuss ───────────────────────────────────────────────── */
        pokeball(ctx, RC.PAD + 13, RC.S - 52, 13);
        ctx.font = fSans(16, 700);
        ctx.fillStyle = C.ink2;
        ctx.textBaseline = 'middle';
        ctx.fillText('thedipidis.app', RC.PAD + 36, RC.S - 51);
        ctx.textAlign = 'right';
        ctx.font = fSans(13, 400);
        ctx.fillStyle = C.ink3;
        ctx.fillText(L('Aus dem Battle Journal', 'From the Battle Journal'),
                     RC.S - RC.PAD, RC.S - 51);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        return cv;
    }

    /* ═══════════════════════════════════════════════════════════════
     * Ausliefern
     * ═══════════════════════════════════════════════════════════════ */

    function toast(msg, kind) {
        try { if (typeof showToast === 'function') showToast(msg, kind || 'info'); }
        catch (e) { /* ein fehlender Toast darf den Export nicht kippen */ }
    }

    function safeName(s) {
        return String(s || 'bild')
            .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 60) || 'bild';
    }

    function deliver(canvas, name) {
        return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
                if (!blob) {
                    toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
                    return resolve(false);
                }
                var file = new File([blob], name, { type: 'image/png' });
                /* navigator.share wird versucht, sobald es existiert —
                 * canShare({files}) meldet im iOS-Standalone-PWA
                 * gelegentlich false, obwohl das Teilen funktioniert.
                 * Dieselbe Erfahrung steht in app-deck-builder.js. */
                if (navigator.share) {
                    navigator.share({ files: [file], title: name })
                        .then(function () { resolve(true); })
                        .catch(function () { download(blob, name); resolve(true); });
                    return;
                }
                download(blob, name);
                resolve(true);
            }, 'image/png');
        });
    }

    function download(blob, name) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast(L('Bild gespeichert', 'Image saved'), 'success');
    }

    /* ═══════════════════════════════════════════════════════════════
     * Daten einsammeln
     * ═══════════════════════════════════════════════════════════════ */

    function spaceFacts(space) {
        try {
            if (window.DsNav && typeof window.DsNav.getFacts === 'function') {
                return window.DsNav.getFacts(space) || null;
            }
        } catch (e) { /* egal */ }
        return null;
    }

    function activeSpace() {
        try {
            var active = document.querySelector('.tab-content.active');
            if (active && window.DsNav && typeof window.DsNav.spaceForTab === 'function') {
                return window.DsNav.spaceForTab(active.id) || 'gl';
            }
        } catch (e) { /* egal */ }
        return 'gl';
    }

    function today() {
        return new Date().toLocaleDateString(isDe() ? 'de-DE' : 'en-GB');
    }

    function collectDeckSpec(name, space) {
        var sp = space || activeSpace();
        var facts = spaceFacts(sp) || {};
        var getFacts = window.getArchetypeFacts;
        var getMus = window.getArchetypeMatchups;
        if (typeof getFacts !== 'function') return Promise.resolve(null);

        return Promise.all([
            getFacts(name),
            typeof getMus === 'function' ? getMus(name) : Promise.resolve([])
        ]).then(function (res) {
            var f = res[0] || {};
            var mus = res[1] || [];
            return {
                name: name,
                share: f.share, winRate: f.winRate, count: f.count,
                perfPct: f.perfPct, top8: f.top8, brought: f.brought, thin: f.thin,
                totalBrought: f.totalBrought,
                matchups: mus,
                thinGames: f.thinGames || 20,
                space: sp,
                spaceLabel: facts.region || '',
                format: facts.format || '',
                source: facts.source || '',
                stand: facts.stamp || today()
            };
        });
    }

    /* Ein Journaleintrag ist EINE Partie, kein Turnier — das Turnier ist
     * die Gruppe aller Einträge mit demselben Namen. Genau so rechnet
     * shareTournamentSummary() im Journal, und genau so wird hier
     * gruppiert, damit beide Bilder dieselbe Bilanz zeigen. */
    function collectTournamentSpec(tournamentName, opts) {
        var cache = [];
        try { cache = (window._bjGetCache && window._bjGetCache()) || []; } catch (e) { cache = []; }
        var entries = cache.filter(function (e) {
            return String(e.tournamentName || '') === String(tournamentName || '');
        });
        if (!entries.length) return null;

        var asc = entries.slice().sort(function (a, b) {
            return (a.createdAtMs || 0) - (b.createdAtMs || 0);
        });
        var w = 0, l = 0, t = 0;
        asc.forEach(function (e) {
            if (e.result === 'win') w++;
            else if (e.result === 'loss') l++;
            else if (e.result === 'tie') t++;
        });
        var scored = w + l + t;
        var last = asc[asc.length - 1];
        var o = opts || {};

        return {
            tournament: tournamentName,
            // Die Platzierung haengt am Turnier, gespeichert ist sie aber an
            // jedem Eintrag. Ein spaeter nachgetragener Match hat das Feld
            // nicht — also nicht asc[0] fragen, sondern die Gruppe.
            place: o.place || (asc.find(function (e) { return e.placement; }) || {}).placement || null,
            record: { w: w, l: l, t: t },
            winRate: scored ? ((w + t / 2) / scored) * 100 : NaN,
            deck: asc[0].ownDeck || '',
            format: asc[0].meta || '',
            type: asc[0].tournamentType || '',
            date: new Date(last.createdAtMs || Date.now())
                .toLocaleDateString(isDe() ? 'de-DE' : 'en-GB'),
            rounds: asc.map(function (e, i) {
                return {
                    n: i + 1,
                    result: e.result || '',
                    opponent: e.opponentArchetype || '–',
                    turnOrder: e.turnOrder || '',
                    games: (e.bestOf === 'bo3' && Array.isArray(e.bo3Games) && e.bo3Games.length)
                        ? e.bo3Games.map(function (gm) {
                            return gm.result === 'win' ? L('S', 'W')
                                 : gm.result === 'loss' ? L('N', 'L') : L('U', 'T');
                          }).join('')
                        : ''
                };
            })
        };
    }

    /* ═══════════════════════════════════════════════════════════════
     * Öffentliche Aufrufe
     * ═══════════════════════════════════════════════════════════════ */

    function shareDeckCard(name, space) {
        if (!name) return Promise.resolve(false);
        toast(L('Bild wird erstellt …', 'Creating image …'), 'info');
        return collectDeckSpec(name, space).then(function (spec) {
            if (!spec) {
                toast(L('Für dieses Deck fehlen die Zahlen.',
                        'The numbers for this deck are missing.'), 'warning');
                return false;
            }
            var mus = (spec.matchups || []).slice(0, 12);
            return Promise.all([
                loadIcons(spec.name, 2),
                Promise.all(mus.map(function (m) {
                    return loadIcons(m.opponent, 1).then(function (a) { return a[0] || null; });
                }))
            ]).then(function (art) {
                var cv = deckCardCanvas(spec, { icons: art[0], mIcons: art[1] });
                return deliver(cv, safeName(spec.name) + '_analyse_'
                    + new Date().toISOString().slice(0, 10) + '.png');
            });
        }).catch(function (err) {
            console.error('[DsShare] deck card failed', err);
            toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
            return false;
        });
    }

    function shareResultCard(tournamentName, opts) {
        var spec = collectTournamentSpec(tournamentName, opts);
        if (!spec) {
            toast(L('Zu diesem Turnier stehen keine Partien im Journal.',
                    'No matches recorded for this tournament.'), 'warning');
            return Promise.resolve(false);
        }
        toast(L('Bild wird erstellt …', 'Creating image …'), 'info');
        var rounds = spec.rounds.slice(0, 12);
        return Promise.all([
            loadIcons(spec.deck, 2),
            Promise.all(rounds.map(function (m) {
                return loadIcons(m.opponent, 1).then(function (a) { return a[0] || null; });
            }))
        ]).then(function (art) {
            var cv = resultCardCanvas(spec, { icons: art[0], rIcons: art[1] });
            return deliver(cv, safeName(spec.tournament) + '_ergebnis_'
                + new Date().toISOString().slice(0, 10) + '.png');
        }).catch(function (err) {
            console.error('[DsShare] result card failed', err);
            toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
            return false;
        });
    }

    window.DsShare = {
        shareDeckCard: shareDeckCard,
        shareResultCard: shareResultCard,
        // Für Tests und für alles, was die Karte anders befüllen will als
        // die beiden Sammler oben.
        _internals: {
            PALETTE: C, deckCardCanvas: deckCardCanvas, resultCardCanvas: resultCardCanvas,
            collectTournamentSpec: collectTournamentSpec, clip: clip, corsUrl: corsUrl,
            safeName: safeName, initials: initials
        }
    };
})();
