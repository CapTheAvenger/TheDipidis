/* ds-share.js — die drei teilbaren Bilder.
 *
 * Die Seite hatte genau einen Bildexport: _buildDeckCanvas() im
 * Deckbauer, ein Kartengitter auf dunklem Verlauf. Was hier dazukommt,
 * sind die beiden Bilder, nach denen im Wettkampfumfeld tatsächlich
 * gefragt wird:
 *
 *   1. Die Deck-Analyse als 1200×675 — Anteil, Win Rate, Top-8 gegen
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
        /* Die erste Fuge sitzt genau ueber der Kante des Koerpers darunter.
         *
         * Vorher wurden die drei Spalten nach 1 / 1,35 / 1,35 aufgeteilt. Das
         * ergab fuer die erste 323 px, also eine Fuge bei x = 323..325 —
         * waehrend der Koerper darunter bei DC.KEY_W = 300 seine Kante hat.
         * 25 px daneben, ueber die ganze Kartenhoehe sichtbar.
         *
         * Gemeldet am 19.08.2026: "der eine Strich, der neben dem Bild ist, und
         * der eine Strich, der neben dem Anteil im Feld ist, die sind so leicht
         * versetzt, sieht irgendwie komisch aus."
         *
         * Jetzt liegt die erste Kante fest auf KEY_W; die beiden rechten teilen
         * sich den Rest im bisherigen Verhaeltnis (1,35 zu 1,35, also haelftig).
         * Sie tragen je eine Herleitung, die linke nur eine Zahl — deshalb
         * durfte sie ohnehin die schmalste sein. */
        var w1 = DC.KEY_W - 2;              /* Fuge endet exakt auf KEY_W */
        var restW = DC.W - (w1 + 2) - 2;    /* zwei Fugen a 2 px */
        var w2 = Math.round(restW / 2);
        var cols = [
            { x: 0, w: w1 },
            { x: DC.KEY_W, w: w2 },
            { x: DC.KEY_W + w2 + 2, w: DC.W - (DC.KEY_W + w2 + 2) }
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
            L('Anteil am Meta', 'Meta share'),
            hasShare ? num(spec.count, 0) + ' ' + L('Listen', 'lists') : L('keine Daten', 'no data'));

        var wrDelta = isFinite(spec.winRate) ? spec.winRate - 50 : null;
        statCol(cols[1],
            wrDelta === null ? C.dvZero : (wrDelta >= 0 ? C.dvPos : C.dvNeg),
            isFinite(spec.winRate) ? num(spec.winRate, 2) + ' %' : '–',
            C.ink,
            'Win Rate',   /* in beiden Sprachen gleich — die Szene sagt Win Rate */
            wrDelta === null ? L('keine Daten', 'no data')
                : signed(wrDelta, 2) + ' ' + L('ggü. 50 %', 'vs 50%'),
            /* Die Fussnote beschrieb eine vierte Konvention, die hier
               niemand rechnet. spec.winRate ist die Deck-Win-Rate aus
               data/limitless_online_decks.csv (win_rate_numeric), und die
               ist S/(S+N+U) — Unentschieden zaehlen im Nenner mit, aber
               nicht als halber Sieg. Nachgemessen ueber die Datei: mittlere
               Abweichung 0,0033 Punkte zu dieser Formel, 0,42 zur
               Konvention ohne Unentschieden. Dieselbe Zahl liefert das
               Battle Journal (js/battle-journal.js), das ebenfalls hier
               hineinzeichnet. */
            (window.WinRateKonvention
                ? window.WinRateKonvention.kurzHinweis('mitUnentschieden')
                : L('Siege ÷ alle gespielten Matches',
                    'wins ÷ all games played')));

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
                    ? L('n unter 50 — zum Meta hin geglättet (K=50)',
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
            [L('Meta gesamt', 'Meta total'),
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
        label(ctx, L('Matches', 'Games'), xGames, ty);
        label(ctx, L('Record', 'Record'), xRecord, ty);
        label(ctx, 'Win Rate', wrX + wrW - 10, ty);
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
                ? L('Graue Zeilen: unter ' + (spec.thinGames || 20) + ' Matches — die Quote ist dort noch ein Gerücht.',
                    'Grey rows: fewer than ' + (spec.thinGames || 20) + ' games — that rate is still a rumour.')
                : L('Sortiert nach Win Rate. Jede Zeile trägt ihre Matchzahl.',
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
            ? 'W · L · T · ' + num(spec.winRate, 1) + ' %'
            : 'W · L · T', recX, topY + 60);
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

            /* W/L/T in beiden Sprachen. Die Kuerzel stehen so auf jeder
             * Turniertabelle, und der Betreiber hat sie ausdruecklich so
             * gewollt — S/N/U las sich fuer ihn nicht als Ergebnis. */
            var mark = m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'T';
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
            if (m.turnOrder === 'first')  tail.push(L('First', 'went first'));
            if (m.turnOrder === 'second') tail.push(L('Second', 'went second'));
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
        /* Erst zeigen, dann entscheiden.
         *
         * Bis zum 19.08.2026 schob diese Funktion die PNG-Datei direkt in
         * den Download-Ordner (oder in das Teilen-Menue des Systems). Man
         * bekam also ein Bild, das man erst nach dem Speichern zu sehen
         * bekam. Gemeldet: "wenn man auf Bild generieren drueckt, bekommt
         * man 'n schoenes Bild — warum zeigen wir das nicht direkt in der
         * Seite an?"
         *
         * Das Fenster dafuer gab es schon, nur im Meta Call. Es liegt jetzt
         * in js/ds-bildvorschau.js und wird von beiden benutzt.
         *
         * Faellt das Modul aus, bleibt der alte Weg: lieber ein Download
         * ohne Vorschau als ein Knopf, der nichts tut. */
        if (window.DsBildvorschau && typeof window.DsBildvorschau.zeige === 'function') {
            return window.DsBildvorschau.zeige(canvas, {
                dateiname: name,
                titel: L('Bildkarte', 'Image card'),
                alt: L('Analyse als Bild', 'Analysis as an image'),
            });
        }
        return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
                if (!blob) {
                    toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
                    return resolve(false);
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
        var o0 = opts || {};
        // Dieselbe Gruppe, aus der die Kopfzeile im Journal gerechnet wurde
        // — nicht der ungefilterte Bestand. Ohne den Meta-Schluessel und die
        // aktiven Filter zeigte das Bild eine andere Bilanz als die Zeile,
        // neben der sein Knopf steht (gemessen: 2-1-1 gegen 2-3-1).
        var entries = [];
        try {
            if (typeof window._bjGetGroup === 'function') {
                entries = window._bjGetGroup(tournamentName, o0.metaKey) || [];
            }
        } catch (e) { entries = []; }
        if (!entries.length) {
            var cache = [];
            try { cache = (window._bjGetCache && window._bjGetCache()) || []; } catch (e2) { cache = []; }
            entries = cache.filter(function (e) {
                return String(e.tournamentName || '') === String(tournamentName || '');
            });
        }
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
        var o = o0;

        return {
            tournament: tournamentName,
            // Die Platzierung haengt am Turnier, gespeichert ist sie aber an
            // jedem Eintrag. Ein spaeter nachgetragener Match hat das Feld
            // nicht — also nicht asc[0] fragen, sondern die Gruppe.
            place: o.place || (asc.find(function (e) { return e.placement; }) || {}).placement || null,
            record: { w: w, l: l, t: t },
            // S/(S+N+U) — dieselbe Konvention, die das Journal selbst
            // rechnet und die auf der Tier-Karte steht. Hier stand
            // (S + U/2)/Partien: eine vierte Konvention, die keine Quelle
            // dieses Hauses benutzt, und die Fussnote darunter behauptete
            // sie auch noch. Bei 2-1-1 waren das 62,5 % im Bild gegen
            // 50 % in der Zeile daneben.
            winRate: scored ? (w / scored) * 100 : NaN,
            deck: asc[0].ownDeck || '',
            // Die eingefrorene Liste. Sie haengt am Turnier, gespeichert ist
            // sie an jedem Eintrag — also die Gruppe fragen, nicht asc[0]:
            // ein nachgetragener Match traegt sie nicht.
            deckSnapshot: (asc.find(function (e) {
                return e && e.deckSnapshot && e.deckSnapshot.cards;
            }) || {}).deckSnapshot || null,
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
                    // BO1 oder BO3 stand bisher nur indirekt drin: als
                    // gefuellte Spieleliste. Ein BO3 ohne eingetragene
                    // Einzelspiele sah damit aus wie ein BO1. Der Betreiber
                    // nennt die Angabe ausdruecklich, also steht sie jetzt
                    // als eigenes Feld hier.
                    bestOf: e.bestOf === 'bo3' ? 'bo3' : 'bo1',
                    games: (e.bestOf === 'bo3' && Array.isArray(e.bo3Games) && e.bo3Games.length)
                        ? e.bo3Games.map(function (gm) {
                            return gm.result === 'win' ? 'W'
                                 : gm.result === 'loss' ? 'L' : 'T';
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
            toast(L('Zu diesem Turnier stehen keine Matches im Journal.',
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


    /* ═══════════════════════════════════════════════════════════════
     * Karte 3 · Turnierposter, 1080 × 1350
     *
     * Das Hochformat 4:5 ist das groesste Bild, das Instagram im Feed
     * ungeschnitten zeigt — mehr Hoehe je Breite gibt es dort nicht.
     * Vorlage sind die Liga-Posts, die der Betreiber mitgebracht hat:
     * Ergebnis gross, die gespielte Liste als Kartengitter, die Gegner
     * als Reihe. Was NICHT uebernommen wird:
     *
     *   · das Foto der Person — das Ergebnis gehoert aufs Bild, nicht
     *     das Gesicht;
     *   · das rote X auf besiegten Gegnern — zweideutig (wer hat wen
     *     geschlagen?) und ausserhalb der Palette. Stattdessen faerbt
     *     der Ring, und ein Zeichen im Eck sagt es noch einmal, damit
     *     es auch farbfehlsichtig lesbar bleibt;
     *   · ein Sponsorenband — diese Seite hat eine Marke, die passt in
     *     84 px.
     *
     * Ohne eingefrorene Liste faellt das Gitter weg und der Deckblock
     * wird gross. Ein leeres Kartenfeld waere schlimmer als keins.
     * ═══════════════════════════════════════════════════════════════ */

    var PC = { W: 1080, H: 1350, PAD: 64 };

    /* Matchpunkte. Ein Sieg zaehlt 3, ein Unentschieden 1, eine Niederlage 0
     * — dieselbe Rechnung, mit der die Turnierleitung die Tabelle fuehrt. */
    var PUNKTE = { win: 3, tie: 1, loss: 0 };

    function matchPunkte(runden) {
        return (runden || []).reduce(function (summe, m) {
            return summe + (m.result === 'win' ? PUNKTE.win
                          : m.result === 'tie' ? PUNKTE.tie : PUNKTE.loss);
        }, 0);
    }

    /* Ab wann Tag 2.
     *
     * Der Betreiber hat 16 genannt, eine Quelle im Netz nannte 19. Beide
     * stimmen — fuer verschiedene Formate: 19 galt fuer den alten Tag 1 mit
     * neun Runden (6-2-1), heute sind es acht Runden und damit 16 (5-2-1).
     * Der Meta Call rechnet an anderer Stelle mit denselben Zahlen
     * (js/app-meta-call.js: regional { rounds: 8, day2Points: 16 }), also
     * stehen sie hier nicht zum zweiten Mal frei erfunden da.
     *
     * Nur die grossen Turniere haben ueberhaupt einen zweiten Tag. Auf einem
     * Cup oder einer Challenge waere der Marker eine falsche Auskunft, also
     * erscheint er dort nicht. */
    var DAY2_PUNKTE = 16;
    var DAY2_TYPEN = ['regional/spe/ic', 'regional/spe', 'regional', 'international', 'worlds', 'spe'];

    function hatDay2(spec, punkte) {
        var typ = String(spec && spec.type || '').trim().toLowerCase();
        if (DAY2_TYPEN.indexOf(typ) === -1) return false;
        return punkte >= DAY2_PUNKTE;
    }


    /* Aus "Ultra Ball (SVI 196)" wird {name, set, number}. Das ist das
     * Format, in dem deck.cards die Schluessel fuehrt (siehe
     * js/firebase-collection.js: "Exact prints"). Passt der Schluessel
     * nicht auf das Muster, bleibt er als Name stehen — dann gibt es
     * eben kein Bild, aber die Karte faellt nicht aus der Liste. */
    function parseKartenSchluessel(key) {
        var m = String(key || '').match(/^(.*?)\s*\(([^()\s]+)\s+([^()\s]+)\)\s*$/);
        if (!m) return { name: String(key || ''), set: '', number: '' };
        return { name: m[1].trim(), set: m[2].trim(), number: m[3].trim() };
    }

    /* Die Reihenfolge, in der jeder eine Deckliste liest. Nicht das
     * Alphabet — "Ancient Booster Energy Capsule" vor "Charizard ex"
     * waere korrekt sortiert und trotzdem unlesbar. */
    var PC_ART_RANG = {
        Pokemon: 1, Supporter: 2, Item: 3, Tool: 4, Stadium: 5,
        'Special Energy': 6, 'Basic Energy': 7
    };

    function kartenArtRang(karte) {
        try {
            var shared = window._mbShared;
            if (!shared || typeof shared.getMetaBinderTypeMeta !== 'function') return 99;
            var rec = (typeof shared.findCardRecord === 'function')
                ? shared.findCardRecord(karte.name, karte.set, karte.number) : null;
            var meta = shared.getMetaBinderTypeMeta({
                name: karte.name, set: karte.set, number: karte.number,
                type: (rec && rec.type) || '', rarity: (rec && rec.rarity) || ''
            });
            var kat = (typeof shared.getMetaBinderSortCategory === 'function')
                ? shared.getMetaBinderSortCategory(meta) : String(meta.type || '');
            return PC_ART_RANG[kat] || 99;
        } catch (e) { return 99; }
    }

    /** Die Liste aus dem Schnappschuss, sortiert und mit Bild-URL. */
    function schnappschussKarten(snap) {
        if (!snap || !snap.cards) return [];
        var shared = window._mbShared || {};
        var liste = Object.keys(snap.cards).map(function (key) {
            var teil = parseKartenSchluessel(key);
            var url = '';
            try {
                if (typeof shared.findCardImage === 'function') {
                    url = shared.findCardImage(teil.name, teil.set, teil.number) || '';
                }
            } catch (e) { url = ''; }
            return {
                key: key, name: teil.name, set: teil.set, number: teil.number,
                anzahl: Number(snap.cards[key]) || 0,
                rang: kartenArtRang(teil), url: url
            };
        });
        liste.sort(function (a, b) {
            if (a.rang !== b.rang) return a.rang - b.rang;
            if (a.anzahl !== b.anzahl) return b.anzahl - a.anzahl;
            return a.name.localeCompare(b.name, 'de');
        });
        return liste;
    }

    /* Wie viele Spalten passen, damit ALLE verschiedenen Karten in die
     * gegebene Hoehe passen? Kein fester Deckel: was ein Deckel
     * abschneidet, sind die Einzelkarten, und ueber genau die wird unter
     * einem Post geredet. Lieber kleinere Kacheln als eine halbe Liste.
     * Gemessen an 1.058 echten Listen aus data/tournament_decklists_per_player.csv:
     * Median 25 verschiedene Karten, Maximum 36. */
    function gitterMasse(anzahl, breite, hoehe) {
        var beste = null;
        var passende = [];
        for (var spalten = 4; spalten <= 12; spalten++) {
            var gap = spalten >= 8 ? 8 : 10;
            var kb = Math.floor((breite - gap * (spalten - 1)) / spalten);
            var kh = Math.round(kb * 342 / 245);          /* echtes Kartenformat */
            var zeilen = Math.ceil(anzahl / spalten);
            if (zeilen * kh + (zeilen - 1) * gap > hoehe) continue;
            var rest = anzahl % spalten;
            var kandidat = { spalten: spalten, kb: kb, kh: kh, gap: gap, zeilen: zeilen,
                             letzteZeile: rest === 0 ? spalten : rest };
            if (!beste || kb > beste.kb) beste = kandidat;
            passende.push(kandidat);
        }
        if (!beste) return null;

        /* Unter den fast gleich grossen Aufteilungen die mit der volleren
         * letzten Zeile. 28 Karten auf 9 Spalten enden mit EINER Kachel —
         * das liest sich wie ein Rest, obwohl es die Liste ist. Auf 8
         * Spalten sind es vier, bei kaum kleineren Kacheln. Die Grenze von
         * 12 % ist die Schmerzgrenze: darunter wird das Bild sichtbar
         * kleiner, und dann ist die krumme Zeile das kleinere Uebel. */
        var schwelle = beste.kb * 0.88;
        passende.forEach(function (k) {
            if (k.kb >= schwelle && k.letzteZeile > beste.letzteZeile) beste = k;
        });
        return beste;
    }

    function postCardCanvas(spec, art) {
        var cv = document.createElement('canvas');
        cv.width = PC.W; cv.height = PC.H;
        var ctx = cv.getContext('2d');
        var innen = PC.W - PC.PAD * 2;

        ctx.fillStyle = C.bg0; ctx.fillRect(0, 0, PC.W, PC.H);
        var g1 = ctx.createRadialGradient(200, -120, 20, 200, -120, 820);
        g1.addColorStop(0, 'rgba(85,102,224,.38)'); g1.addColorStop(1, 'rgba(85,102,224,0)');
        ctx.fillStyle = g1; ctx.fillRect(0, 0, PC.W, PC.H);
        var g2 = ctx.createRadialGradient(1180, 1420, 20, 1180, 1420, 760);
        g2.addColorStop(0, 'rgba(255,203,5,.20)'); g2.addColorStop(1, 'rgba(255,203,5,0)');
        ctx.fillStyle = g2; ctx.fillRect(0, 0, PC.W, PC.H);

        /* ── Kopf ──────────────────────────────────────────────────── */
        pokeball(ctx, PC.PAD + 13, 62, 13);
        ctx.font = fSans(16, 700);
        ctx.fillStyle = C.ink2;
        ctx.textBaseline = 'middle';
        ctx.fillText('thedipidis.app', PC.PAD + 36, 63);
        ctx.textBaseline = 'alphabetic';

        ctx.font = fSans(46, 700);
        ctx.fillStyle = C.ink;
        ctx.fillText(clip(ctx, spec.tournament || L('Turnier', 'Tournament'), innen), PC.PAD, 130);
        ctx.font = fSans(18, 400);
        ctx.fillStyle = C.ink3;
        ctx.fillText(clip(ctx, [spec.type, spec.format, spec.date].filter(Boolean).join(' · '), innen),
                     PC.PAD, 162);

        var rg = ctx.createLinearGradient(PC.PAD, 0, PC.W - PC.PAD, 0);
        rg.addColorStop(0, C.brand); rg.addColorStop(1, C.gold);
        ctx.fillStyle = rg; ctx.fillRect(PC.PAD, 184, innen, 4);

        /* ── Ergebnisband ──────────────────────────────────────────
         * Drei Spalten — oder zwei, wenn keine Platzierung eingetragen
         * ist. Ein leerer Goldkasten waere schlechter als keiner. */
        var rec = spec.record || { w: 0, l: 0, t: 0 };
        var punkte = matchPunkte(spec.rounds);
        var day2 = hatDay2(spec, punkte);

        var spalten = [];
        if (spec.place) {
            spalten.push({ lab: L('PLATZIERUNG', 'PLACEMENT'), val: spec.place,
                           farbe: C.gold, mono: true });
        }
        /* W · L · T, nicht S · N · U. Die Kuerzel sind international und
         * stehen genauso auf jeder Turniertabelle — der Betreiber hat sie
         * ausdruecklich so gewollt, und ein Bild fuer Instagram wird nicht
         * nur in Deutschland gelesen. */
        spalten.push({ lab: L('ERGEBNIS', 'RESULT'),
                       val: rec.w + '-' + rec.l + '-' + rec.t,
                       fuss: 'W · L · T', farbe: C.ink, mono: true });
        spalten.push({ lab: L('PUNKTE', 'POINTS'), val: String(punkte),
                       fuss: L('Sieg 3 · Unentschieden 1', 'win 3 · tie 1'),
                       farbe: day2 ? C.gold : C.brandInk, mono: true,
                       marke: day2 ? 'DAY 2' : '' });
        spalten.push({ lab: L('RUNDEN', 'ROUNDS'), val: String((spec.rounds || []).length),
                       fuss: isFinite(spec.winRate) ? num(spec.winRate, 1) + ' % Win Rate' : '',
                       farbe: C.brandInk, mono: true });

        var bandY = 206, bandH = 168;
        ctx.fillStyle = C.surface1;
        rr(ctx, PC.PAD, bandY, innen, bandH, 20); ctx.fill();
        ctx.strokeStyle = C.line; ctx.lineWidth = 1;
        rr(ctx, PC.PAD, bandY, innen, bandH, 20); ctx.stroke();

        var sw = innen / spalten.length;
        ctx.textAlign = 'center';
        for (var i = 0; i < spalten.length; i++) {
            var sp = spalten[i];
            var cx = PC.PAD + sw * i + sw / 2;
            if (i > 0) {
                ctx.fillStyle = C.line;
                ctx.fillRect(PC.PAD + sw * i - 1, bandY + 28, 2, bandH - 56);
            }
            /* label() erbt textAlign. Hier stand cx minus die halbe Breite —
             * bei textAlign 'center' verschiebt das ein zweites Mal, und
             * PLATZIERUNG stand sichtbar links neben seiner Zahl. */
            ctx.textAlign = 'center';
            if (sp.marke) {
                /* Marke und Beschriftung stehen als EINE mittige Gruppe in
                 * der Beschriftungszeile. Zuerst sass die Marke ueber der
                 * Zahl — bei 74 px Ziffernhoehe lag sie mitten darauf. */
                ctx.font = fSans(11, 700);
                var lw = ctx.measureText(String(sp.lab).toUpperCase()).width;
                ctx.font = fSans(12, 700);
                var mw = ctx.measureText(sp.marke).width + 18;
                var ges = lw + 10 + mw;
                var lx = cx - ges / 2 + lw / 2;
                ctx.textAlign = 'center';
                label(ctx, sp.lab, lx, bandY + 42);
                ctx.fillStyle = C.gold;
                rr(ctx, cx - ges / 2 + lw + 10, bandY + 28, mw, 20, 10); ctx.fill();
                ctx.fillStyle = C.bg0;
                ctx.font = fSans(12, 700);
                ctx.textBaseline = 'middle';
                ctx.fillText(sp.marke, cx - ges / 2 + lw + 10 + mw / 2, bandY + 39);
                ctx.textBaseline = 'alphabetic';
            } else {
                label(ctx, sp.lab, cx, bandY + 42);
            }
            /* Der Wert schrumpft, wenn er nicht passt — "9/128" ist eine
             * gueltige Platzierung und dreimal so breit wie "3.". */
            var groesse = 74;
            do {
                ctx.font = sp.mono ? fMono(groesse, 700) : fSans(groesse, 700);
                if (ctx.measureText(sp.val).width <= sw - 36) break;
                groesse -= 4;
            } while (groesse > 26);
            ctx.fillStyle = sp.farbe;
            ctx.fillText(clip(ctx, sp.val, sw - 28), cx, bandY + 112);
            if (sp.fuss) {
                ctx.font = fSans(15, 400);
                ctx.fillStyle = C.ink3;
                ctx.fillText(clip(ctx, sp.fuss, sw - 28), cx, bandY + 142);
            }

        }
        ctx.textAlign = 'start';

        /* ── Deckzeile ─────────────────────────────────────────────── */
        var karten = art.karten || [];
        var hatGitter = karten.length > 0;
        var deckY = bandY + bandH + 32;
        var sprGr = hatGitter ? 54 : 150;
        var big = (art.icons && art.icons.length) ? art.icons : [null];

        if (hatGitter) {
            for (var k = 0; k < big.length; k++) {
                sprite(ctx, big[k], PC.PAD + k * (sprGr + 10), deckY, sprGr, initials(spec.deck));
            }
            var textX = PC.PAD + big.length * (sprGr + 10) + 8;
            ctx.font = fSans(38, 700);
            ctx.fillStyle = C.ink;
            ctx.textBaseline = 'middle';
            ctx.fillText(clip(ctx, spec.deck || '–', PC.W - PC.PAD - textX - 220),
                         textX, deckY + sprGr / 2 - 8);
            ctx.font = fSans(16, 400);
            ctx.fillStyle = C.ink3;
            var summe = (spec.deckSnapshot && spec.deckSnapshot.cardCount) || 0;
            ctx.fillText(karten.length + ' ' + L('verschiedene Karten', 'distinct cards')
                + (summe ? ' · ' + summe + ' ' + L('gesamt', 'total') : ''),
                textX, deckY + sprGr / 2 + 22);
            ctx.textBaseline = 'alphabetic';
        }

        /* ── Gegnerband zuerst rechnen: es steht unten fest, das Gitter
         * bekommt den Rest. ─────────────────────────────────────────── */
        var rounds = spec.rounds || [];
        var fussY = PC.H - 84;
        var einreihig = rounds.length <= 9;
        var d = einreihig ? 96 : 80;
        var gap = einreihig ? 12 : 10;
        var proReihe = einreihig ? rounds.length : Math.ceil(rounds.length / 2);
        /* Bei mehr als 18 Runden wird es eng — dann schrumpft der Kreis
         * weiter, statt Runden wegzulassen. Ein Bild, das die Haelfte
         * der Runden verschweigt, ist eine falsche Auskunft. */
        while (proReihe > 0 && proReihe * d + (proReihe - 1) * gap > innen && d > 44) {
            d -= 4;
        }

        /* Erst die Hoehe des Bandes, dann seine Oberkante. Vorher stand die
         * Kante fest bei fussY - 200: bei zwei Reihen lief das Band in die
         * Fusszeile, bei einer verschenkte es Platz, den das Kartengitter
         * gebraucht haette. Das Gitter bekommt, was uebrig bleibt. */
        /* Platz fuer die Punktezeile unter jedem Kreis: 18 px. Bei einer
         * Reihe steht darunter noch der Gegnername. */
        var gegnerHoehe = einreihig ? (d + 40) : (2 * d + 20 + 18);
        var gegnerY = fussY - 20 - gegnerHoehe;
        var gegnerLabelY = gegnerY - 14;

        label(ctx, L('GEGNER', 'OPPONENTS'), PC.PAD, gegnerLabelY);
        var boArten = {};
        rounds.forEach(function (m) { boArten[m.bestOf || 'bo1'] = true; });
        var boSchild = Object.keys(boArten).length === 1 ? Object.keys(boArten)[0].toUpperCase() : '';
        if (boSchild) {
            ctx.font = fSans(13, 700);
            var bw = ctx.measureText(boSchild).width + 20;
            ctx.strokeStyle = C.lineStrong; ctx.lineWidth = 1;
            rr(ctx, PC.PAD + 120, gegnerLabelY - 15, bw, 22, 11); ctx.stroke();
            ctx.fillStyle = C.ink3;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(boSchild, PC.PAD + 120 + bw / 2, gegnerLabelY - 4);
            ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }

        for (var r = 0; r < rounds.length; r++) {
            var m = rounds[r];
            var reihe = einreihig ? 0 : Math.floor(r / proReihe);
            var spInReihe = einreihig ? r : (r % proReihe);
            var inDieser = einreihig ? rounds.length
                : Math.min(proReihe, rounds.length - reihe * proReihe);
            var reiheB = inDieser * d + (inDieser - 1) * gap;
            var gx = PC.PAD + Math.round((innen - reiheB) / 2) + spInReihe * (d + gap);
            var gy = gegnerY + reihe * (d + 28);
            var farbe = m.result === 'win' ? C.dvPos : m.result === 'loss' ? C.dvNeg : C.dvZero;

            ctx.save();
            ctx.beginPath();
            ctx.arc(gx + d / 2, gy + d / 2, d / 2 - 3, 0, Math.PI * 2);
            ctx.closePath(); ctx.clip();
            var ic = (art.rIcons && art.rIcons[r]) || null;
            if (ic) {
                ctx.drawImage(ic, gx + 4, gy + 4, d - 8, d - 8);
            } else {
                ctx.fillStyle = C.surface2;
                ctx.fillRect(gx, gy, d, d);
                ctx.fillStyle = C.ink3;
                ctx.font = fSans(Math.round(d * 0.30), 700);
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(initials(m.opponent), gx + d / 2, gy + d / 2);
                ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
            }
            ctx.restore();

            ctx.strokeStyle = farbe; ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(gx + d / 2, gy + d / 2, d / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();

            /* Das Zeichen im Eck. Ring UND Zeichen, weil Farbe allein
             * fuer rund acht Prozent der Maenner keine Auskunft ist. */
            var pz = Math.max(11, Math.round(d * 0.15));
            ctx.fillStyle = farbe;
            ctx.beginPath();
            ctx.arc(gx + d - pz, gy + d - pz, pz, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = C.bg0;
            ctx.font = fSans(Math.round(pz * 1.35), 700);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(m.result === 'win' ? 'W'
                       : m.result === 'loss' ? 'L' : 'T',
                       gx + d - pz, gy + d - pz + 1);
            ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';

            /* Die Punkte der Runde. Drei fuer den Sieg, einer fuers
             * Unentschieden, keiner fuer die Niederlage — damit man auf dem
             * Bild nachrechnen kann, wie die Summe oben zustande kommt. */
            var rp = m.result === 'win' ? PUNKTE.win
                   : m.result === 'tie' ? PUNKTE.tie : PUNKTE.loss;
            ctx.font = fMono(15, 700);
            ctx.fillStyle = rp > 0 ? farbe : C.ink3;
            ctx.textAlign = 'center';
            ctx.fillText('+' + rp, gx + d / 2, gy + d + 17);
            ctx.textAlign = 'start';

            /* Der Gegnername unter dem Kreis — nur einreihig, sonst gibt
             * es dafuer keine Hoehe. */
            if (einreihig) {
                ctx.font = fSans(13, 600);
                ctx.fillStyle = C.ink3;
                ctx.textAlign = 'center';
                ctx.fillText(clip(ctx, m.opponent || '–', d + gap), gx + d / 2, gy + d + 36);
                ctx.textAlign = 'start';
            }
        }

        /* ── Kartengitter ODER grosser Deckblock ───────────────────── */
        var gitterTop = deckY + (hatGitter ? sprGr + 22 : 0);
        var gitterHoehe = gegnerLabelY - 26 - gitterTop;

        if (hatGitter) {
            var mass = gitterMasse(karten.length, innen, gitterHoehe);
            if (mass) {
                var startX = PC.PAD + Math.round((innen - (mass.spalten * mass.kb
                    + (mass.spalten - 1) * mass.gap)) / 2);
                /* Bleibt Luft, wird sie oben und unten gleich verteilt —
                 * ein Gitter, das oben klebt, sieht nach abgeschnitten aus. */
                var gitterH = mass.zeilen * mass.kh + (mass.zeilen - 1) * mass.gap;
                gitterTop += Math.max(0, Math.round((gitterHoehe - gitterH) / 2));
                for (var c2 = 0; c2 < karten.length; c2++) {
                    var ka = karten[c2];
                    var zeile = Math.floor(c2 / mass.spalten);
                    var inZeile = Math.min(mass.spalten, karten.length - zeile * mass.spalten);
                    /* Die letzte Zeile mittig. 28 Karten auf 9 Spalten enden
                     * sonst mit einer einzelnen Kachel ganz links, und das
                     * liest sich wie ein Rest, nicht wie eine Liste. */
                    var zeilenX = startX + Math.round(((mass.spalten - inZeile) * (mass.kb + mass.gap)) / 2);
                    var kx = zeilenX + (c2 % mass.spalten) * (mass.kb + mass.gap);
                    var ky = gitterTop + zeile * (mass.kh + mass.gap);

                    ctx.save();
                    rr(ctx, kx, ky, mass.kb, mass.kh, 6); ctx.clip();
                    if (ka.bild) {
                        ctx.drawImage(ka.bild, kx, ky, mass.kb, mass.kh);
                    } else {
                        /* Nie ein Loch: eine getoente Platte mit dem
                         * Kartennamen sieht wie eine Entscheidung aus,
                         * ein weisses Rechteck wie ein Fehler. */
                        ctx.fillStyle = C.surface2;
                        ctx.fillRect(kx, ky, mass.kb, mass.kh);
                        ctx.fillStyle = C.ink3;
                        ctx.font = fSans(Math.max(9, Math.round(mass.kb * 0.10)), 600);
                        ctx.textAlign = 'center';
                        var woerter = String(ka.name).split(/\s+/);
                        for (var wz = 0; wz < Math.min(3, woerter.length); wz++) {
                            ctx.fillText(clip(ctx, woerter[wz], mass.kb - 8),
                                kx + mass.kb / 2, ky + mass.kh / 2 - 10 + wz * 14);
                        }
                        ctx.textAlign = 'start';
                    }
                    ctx.restore();

                    ctx.strokeStyle = 'rgba(37,48,87,.9)'; ctx.lineWidth = 1;
                    rr(ctx, kx, ky, mass.kb, mass.kh, 6); ctx.stroke();

                    /* Das Anzahl-Zeichen. Nicht rot — rot heisst auf
                     * diesem Bild "Niederlage". Die Marke traegt es. */
                    var br = Math.max(13, Math.round(mass.kb * 0.17));
                    ctx.fillStyle = C.brand;
                    ctx.beginPath();
                    ctx.arc(kx + mass.kb - br - 3, ky + mass.kh - br - 3, br, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = C.bg0; ctx.lineWidth = 2.5; ctx.stroke();
                    ctx.fillStyle = '#ffffff';
                    ctx.font = fSans(Math.round(br * 1.25), 700);
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(String(ka.anzahl), kx + mass.kb - br - 3, ky + mass.kh - br - 2);
                    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
                }
            }
        } else {
            /* Ohne Liste: der Deckblock nimmt den Platz des Gitters. */
            var bs2 = big.length > 1 ? 150 : 176;
            var totalW = big.length * bs2 + (big.length - 1) * 16;
            var bx = (PC.W - totalW) / 2;
            var by = gitterTop + Math.max(0, Math.round((gitterHoehe - bs2 - 70) / 2));
            for (var k2 = 0; k2 < big.length; k2++) {
                sprite(ctx, big[k2], bx + k2 * (bs2 + 16), by, bs2, initials(spec.deck));
            }
            ctx.textAlign = 'center';
            ctx.font = fSans(46, 700);
            ctx.fillStyle = C.ink;
            ctx.fillText(clip(ctx, spec.deck || '–', innen), PC.W / 2, by + bs2 + 52);
            ctx.textAlign = 'start';
        }

        /* ── Fuss ──────────────────────────────────────────────────── */
        pokeball(ctx, PC.PAD + 13, fussY + 30, 13);
        ctx.font = fSans(18, 700);
        ctx.fillStyle = C.ink2;
        ctx.textBaseline = 'middle';
        ctx.fillText('thedipidis.app', PC.PAD + 36, fussY + 31);
        ctx.textAlign = 'right';
        ctx.font = fSans(14, 400);
        ctx.fillStyle = C.ink3;
        ctx.fillText(L('Battle Journal', 'Battle Journal') + ' · ' + (spec.date || ''),
                     PC.W - PC.PAD, fussY + 31);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        return cv;
    }

    /** Das Turnierposter. Laedt Sprites und, wenn eine Liste eingefroren
     *  ist, die Kartenbilder. */
    function sharePostCard(tournamentName, opts) {
        var o = opts || {};
        var spec = collectTournamentSpec(tournamentName, opts);
        if (!spec) {
            toast(L('Zu diesem Turnier stehen keine Matches im Journal.',
                    'No matches recorded for this tournament.'), 'warning');
            return Promise.resolve(false);
        }
        var karten = schnappschussKarten(spec.deckSnapshot);

        /* Wer waehrend eines Turniers postet, will die Liste oft nicht
         * zeigen. Dann faellt das Gitter weg wie bei einem Turnier ohne
         * verknuepfte Liste — dieselbe Darstellung, andere Absicht. */
        if (o.ohneDeckliste) karten = [];

        /* Der Hinweis gehoert in den Toast und NICHT auf das Bild. Ein Satz
         * "verknuepfe deine Liste" auf einem Instagram-Post waere Werbung
         * fuer eine Einstellung — hier ist er eine Auskunft. Und wer das
         * Gitter absichtlich weglaesst, braucht ihn ueberhaupt nicht. */
        toast(karten.length || o.ohneDeckliste
            ? L('Bild wird erstellt …', 'Creating image …')
            : L('Bild wird erstellt — ohne Kartengitter. So kommt es rein: ⋯ → Turnier bearbeiten → „Welche Liste hast du gespielt?" → Speichern.',
                'Creating image — without the card grid. To add it: ⋯ → Edit tournament → "Which list did you play?" → Save.'),
            'info');
        var rounds = spec.rounds || [];
        return Promise.all([
            loadIcons(spec.deck, 2),
            Promise.all(rounds.map(function (m) {
                return loadIcons(m.opponent, 1).then(function (a) { return a[0] || null; });
            })),
            Promise.all(karten.map(function (ka) {
                return loadImage(ka.url).then(function (img) { ka.bild = img; return ka; });
            }))
        ]).then(function (aa) {
            var cv = postCardCanvas(spec, { icons: aa[0], rIcons: aa[1], karten: aa[2] });
            return deliver(cv, safeName(spec.tournament)
                + (o.ohneDeckliste ? '_post_ohne_liste_' : '_post_')
                + new Date().toISOString().slice(0, 10) + '.png');
        }).catch(function (err) {
            console.error('[DsShare] post card failed', err);
            toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
            return false;
        });
    }

    /* ═══════════════════════════════════════════════════════════════
     * Turnierbild fuer den Meta Call
     *
     * Der Betreiber am 28.08.2026: "dann kannst du ja vielleicht einfach
     * die Moeglichkeit geben auf der Webseite, dass man den Turniernamen
     * eingibt und die Anzahl Teilnehmer, und dass darauf dann berechnet
     * wird [...] und dann drueckt man auf 'Bild generieren' und dann wird
     * das Bild, wie fuer unseren Instagram-Post besprochen, generiert."
     *
     * Das Format ist 1080x1350 — Instagram-Hochkant. Grund, Blueten,
     * Logo und Fuss stammen aus demselben Entwurf wie die Posts, damit
     * jemand, der ueber Instagram kommt, die Seite wiedererkennt.
     * ═══════════════════════════════════════════════════════════════ */

    var MP = { W: 1080, H: 1350 };

    /* Farben aus dem Logo (Grund) und aus der Feldtabelle der Seite
     * (Tafel). Die Tafel sieht deshalb aus wie die Tabelle im Meta Call,
     * nicht wie eine zweite Gestaltung daneben. */
    var MC_FARBEN = {
        creme:  '#F7EFE4',
        matt:   '#A38FA8',
        holz:   '#E3B276',
        kopf:   '#1A2640',
        zeileA: '#FFFFFF',
        zeileB: '#F7F8FB',
        name:   '#1A2640',
        wert:   '#2F7FBF',
        linie:  'rgba(26,38,64,.10)'
    };

    /* Bluetenlage B1 — dieselbe, die der Betreiber fuer die Posts
     * freigegeben hat. [Datei, x, y, Breite, Drehung in Grad, Deckung].
     * Die Koordinaten gelten fuer 1080 Breite, also eins zu eins. */
    var MC_BLUETEN = [
        ['b0', 812, -46, 234, -12, 0.95],
        ['b3', 700,  96, 168,  22, 0.88],
        ['b5', 968, 128, 132, -28, 0.90],
        ['p1', 636,  16,  86,  34, 0.70],
        ['p3', 560, 176,  62, -18, 0.55],
        ['p0', 452,  60,  54,  12, 0.40],
        ['p4', 386, 214,  44, -34, 0.30]
    ];

    function markenBild(name) {
        return loadImage('images/marke/' + name + '.webp');
    }

    /* Der Grund: dieselben zwei Verlaeufe wie in der CSS-Fassung der
     * Posts. Ein Radialverlauf oben rechts ueber einem dunklen
     * Linearverlauf. */
    function malGrund(ctx) {
        var lin = ctx.createLinearGradient(MP.W * 0.18, 0, MP.W * 0.82, MP.H);
        lin.addColorStop(0,    '#241530');
        lin.addColorStop(0.58, '#160C1B');
        lin.addColorStop(1,    '#100810');
        ctx.fillStyle = lin;
        ctx.fillRect(0, 0, MP.W, MP.H);

        var rad = ctx.createRadialGradient(
            MP.W * 0.76, MP.H * 0.03, 0,
            MP.W * 0.76, MP.H * 0.03, MP.W * 0.95
        );
        rad.addColorStop(0, 'rgba(74,45,85,.80)');
        rad.addColorStop(1, 'rgba(74,45,85,0)');
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, MP.W, MP.H);
    }

    function malBluete(ctx, img, lage) {
        if (!img) return;
        var w = lage[3];
        var h = w * (img.height / img.width);
        ctx.save();
        ctx.globalAlpha = lage[5];
        ctx.translate(lage[1] + w / 2, lage[2] + h / 2);
        ctx.rotate(lage[4] * Math.PI / 180);
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 8;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }

    /* Das Logo liegt auf schwarzem Grund. 'screen' laesst das Schwarz
     * verschwinden und den Rest stehen — dasselbe, was im Post
     * mix-blend-mode:screen macht. Kann der Browser den Modus nicht,
     * faellt er auf 'source-over' zurueck; dann sieht man einen
     * dunklen Kasten, aber das Bild entsteht trotzdem. */
    function malLogo(ctx, img, x, y, w) {
        if (!img) return;
        var h = w * (img.height / img.width);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
    }

    /* Ein Kopf fuer alle Post-Bilder.
     *
     * Bis zum 28.08.2026 hatte das Staples-Bild einen eigenen, halb
     * nachgebauten Kopf: gesperrte Zeile ja, Titel nein. Ergebnis waren
     * zwei Gestaltungen fuer dieselbe Sache — "T E F - P B L  ·
     * F O R M A T - S T A P L E S" gesperrt ueber die halbe Breite,
     * waehrend der Meta Call daneben eine kurze Kickerzeile und einen
     * grossen Titel trug. Betreiber, mit der gesperrten Zeile
     * eingekringelt: "warum steht das Format Staples noch da oben?
     * Koennen wir mal bitte ein Format durchziehen, die anderen waren
     * doch super."
     *
     * Also: derselbe Kopf, immer. Kicker = Turnier oder Format, Titel =
     * worum es geht. Der zweite Nachbau ist weg — und mit ihm die
     * Stelle, an der die Logo-Ueberdeckung entstehen konnte. */
    function malPostKopf(ctx, spec, logo) {
        var kicker = String(spec.kicker || '').toUpperCase();
        var titel  = String(spec.titel || 'Meta Call');

        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = MC_FARBEN.holz;
        /* Die Kopfzeile ist gesperrt gesetzt, also gut doppelt so breit
         * wie ihr Text. "WORLDS 2026" passt bei 24 px; "TEF-PBL \u00b7
         * FORMAT-STAPLES" wurde zu "FORMAT-STA\u2026" abgeschnitten. Ein
         * Format ist kein Zierrat \u2014 lieber kleiner als halb. Der Platz
         * reicht bis zum Logo (x = 750), abzueglich Luft. */
        var gesperrt = kicker.split('').join(' ');
        var kickerGr = 24;
        ctx.font = fMono(kickerGr, 600);
        while (ctx.measureText(gesperrt).width > 660 && kickerGr > 15) {
            kickerGr -= 1;
            ctx.font = fMono(kickerGr, 600);
        }
        ctx.fillText(clip(ctx, gesperrt, 660), 56, 322);

        ctx.fillStyle = MC_FARBEN.creme;
        var gr = 72;
        ctx.font = fSans(gr, 800);
        while (ctx.measureText(titel).width > 560 && gr > 40) {
            gr -= 3;
            ctx.font = fSans(gr, 800);
        }
        ctx.fillText(titel, 56, 322 + 14 + gr);

        malLogo(ctx, logo, MP.W - 44 - 286, 300, 286);
    }

    function malMetaCallFuss(ctx, links) {
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = MC_FARBEN.matt;
        ctx.font = fMono(22, 400);
        ctx.fillText(clip(ctx, String(links || ''), 640), 56, MP.H - 50);

        ctx.fillStyle = MC_FARBEN.holz;
        ctx.font = fMono(24, 600);
        var netz = 'thedipidis.app';
        ctx.textAlign = 'right';
        ctx.fillText(netz, MP.W - 56, MP.H - 50);
        ctx.textAlign = 'left';
    }

    /* Die Tafel: Kopfzeile plus eine Zeile je Deck, im Zuschnitt der
     * Feldtabelle. Hoehe richtet sich nach der Anzahl der Zeilen, damit
     * zehn Decks genauso sauber sitzen wie sechs. */
    function malMetaCallTafel(ctx, spec, sprites) {
        var decks = spec.decks || [];
        var x = 26, breite = MP.W - 52;
        var oben = 580;
        var kopfH = 54;
        var zeileH = Math.min(58, Math.max(42, Math.floor((MP.H - 150 - oben - kopfH) / Math.max(1, decks.length))));
        var hoehe = kopfH + decks.length * zeileH;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur = 52;
        ctx.shadowOffsetY = 22;
        rr(ctx, x, oben, breite, hoehe, 12);
        ctx.fillStyle = MC_FARBEN.zeileA;
        ctx.fill();
        ctx.restore();

        ctx.save();
        rr(ctx, x, oben, breite, hoehe, 12);
        ctx.clip();

        ctx.fillStyle = MC_FARBEN.kopf;
        ctx.fillRect(x, oben, breite, kopfH);
        ctx.fillStyle = 'rgba(247,239,228,.72)';
        ctx.font = fSans(19, 700);
        ctx.textBaseline = 'middle';
        ctx.fillText(String(spec.spalteLinks || 'DECK').toUpperCase(), x + 26, oben + kopfH / 2);
        ctx.textAlign = 'right';
        ctx.fillText(String(spec.spalteRechts || '').toUpperCase(), x + breite - 26, oben + kopfH / 2);
        ctx.textAlign = 'left';

        decks.forEach(function (d, i) {
            var y = oben + kopfH + i * zeileH;
            ctx.fillStyle = i % 2 ? MC_FARBEN.zeileB : MC_FARBEN.zeileA;
            ctx.fillRect(x, y, breite, zeileH);
            ctx.fillStyle = MC_FARBEN.linie;
            ctx.fillRect(x, y + zeileH - 1, breite, 1);

            var sp = sprites[i] || [];
            var sx = x + 22;
            var gr = Math.min(30, zeileH - 14);
            sp.slice(0, 2).forEach(function (img) {
                sprite(ctx, img, sx, y + (zeileH - gr) / 2, gr, '');
                sx += gr + 2;
            });
            if (!sp.length) sx += gr;

            ctx.fillStyle = MC_FARBEN.name;
            ctx.font = fSans(Math.min(24, zeileH - 26), 700);
            ctx.textBaseline = 'middle';
            ctx.fillText(clip(ctx, d.name, breite * 0.55), sx + 14, y + zeileH / 2);

            ctx.fillStyle = d.wertFarbe || MC_FARBEN.wert;
            ctx.font = fSans(Math.min(24, zeileH - 26), 700);
            ctx.textAlign = 'right';
            ctx.fillText(d.wert, x + breite - 26, y + zeileH / 2);
            ctx.textAlign = 'left';
        });

        ctx.restore();
        ctx.textBaseline = 'alphabetic';
    }

    function metaCallPostCanvas(spec, bilder) {
        var cv = document.createElement('canvas');
        cv.width = MP.W; cv.height = MP.H;
        var ctx = cv.getContext('2d');

        malGrund(ctx);
        MC_BLUETEN.forEach(function (lage, i) { malBluete(ctx, bilder.blueten[i], lage); });
        malPostKopf(ctx, spec, bilder.logo);
        malMetaCallTafel(ctx, spec, bilder.sprites);
        malMetaCallFuss(ctx, spec.fuss);
        return cv;
    }

    /* Oeffentlicher Weg: Spezifikation rein, Bild raus. Alle Bilder
     * werden vorher geladen; faellt eines aus, bleibt sein Platz leer
     * und das Bild entsteht trotzdem. */
    function shareMetaCallPost(spec) {
        if (!spec || !Array.isArray(spec.decks) || !spec.decks.length) {
            toast(L('Keine Daten für das Bild', 'No data for the image'), 'error');
            return Promise.resolve(false);
        }
        /* Kicker = immer das aktuelle Meta, Titel = worum es geht.
         *
         * Betreiber am 28.08.2026: "immer das aktuelle Meta nutzen, bei dem
         * Meta Call geht es ja nur darum, den Turniernamen dann als Titel
         * zu nehmen." Vorher stand der Turniername im Kicker und ein
         * fester Titel darunter — damit trug die kleine Zeile die
         * eigentliche Information und die grosse eine Ueberschrift, die
         * bei jedem Bild gleich war. */
        var mcFacts = spaceFacts(activeSpace()) || {};
        spec = Object.assign({}, spec, {
            kicker: spec.kicker || mcFacts.format || '',
            titel:  spec.titel  || ''
        });
        var laden = [
            markenBild('logo'),
            Promise.all(MC_BLUETEN.map(function (b) { return markenBild(b[0]); })),
            Promise.all(spec.decks.map(function (d) { return loadIcons(d.name, 2); }))
        ];
        return Promise.all(laden).then(function (teile) {
            var cv = metaCallPostCanvas(spec, {
                logo: teile[0], blueten: teile[1], sprites: teile[2]
            });
            return deliver(cv, safeName(spec.dateiname || spec.titel || 'meta-call') + '.png');
        }).catch(function (e) {
            console.error('[DsShare] Meta-Call-Bild fehlgeschlagen', e);
            toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
            return false;
        });
    }

    /* ═══════════════════════════════════════════════════════════════
     * Format-Staples als Post
     *
     * Der Betreiber: "wenn wir ueber Karten reden muessen wir immer die
     * Kartenbilder mit anzeigen weil teilweise ja Karten gleich heissen
     * und man schneller sieht um welche Karte es geht und was die kann".
     * Darum traegt dieses Bild die echten Kartenbilder — Name und Balken
     * allein sagen bei "Judge" oder "Switch" nicht, welche Karte gemeint
     * ist.
     *
     * Grund, Blueten, Logo, Kopf und Fuss sind dieselben wie beim
     * Meta-Call-Post. Das war eine Ansage: "dann sollten wir die gleichen
     * Farben ueberall nutzen, nicht einmal Balken neon Blau und andere
     * Gold." Neu ist nur das Kartengitter dazwischen.
     * ═══════════════════════════════════════════════════════════════ */

    /* Fuenf Spalten fuer bis zu 15 Karten — dann gehen drei volle Zeilen
     * auf, statt sechs plus sechs plus drei. Die Kachelhoehe kommt aus
     * dem verfuegbaren Feld, die Breite aus dem echten Kartenformat
     * (245 x 342). Passt die Reihe nicht in die Breite, entscheidet die
     * Breite. */
    function staplesGitter(anzahl, breite, hoehe) {
        var beste = null;
        for (var spalten = 3; spalten <= 8; spalten++) {
            var gap = spalten >= 7 ? 10 : 14;
            var zeilen = Math.ceil(anzahl / spalten);
            var kh = Math.floor((hoehe - gap * (zeilen - 1)) / zeilen);
            var kb = Math.round(kh * 245 / 342);
            var maxKb = Math.floor((breite - gap * (spalten - 1)) / spalten);
            if (kb > maxKb) { kb = maxKb; kh = Math.round(kb * 342 / 245); }
            if (kh < 60 || kb < 44) continue;
            var rest = anzahl % spalten;
            var kandidat = { spalten: spalten, zeilen: zeilen, kb: kb, kh: kh, gap: gap,
                             letzteZeile: rest === 0 ? spalten : rest };
            if (!beste || kb > beste.kb) beste = kandidat;
        }
        return beste;
    }

    /* Der Streifen am Fuss jeder Kachel: Name links, Anteil rechts in
     * Gold. Er liegt AUF dem Bild statt darunter, weil eine eigene
     * Textzeile je Karte eine ganze Kachelgroesse kostet — und eine
     * kleinere Karte erkennt niemand mehr wieder. */
    function malStapleKachel(ctx, k, x, y, kb, kh) {
        ctx.save();
        rr(ctx, x, y, kb, kh, 8); ctx.clip();
        if (k.bild) {
            ctx.drawImage(k.bild, x, y, kb, kh);
        } else {
            ctx.fillStyle = '#2A1B35';
            ctx.fillRect(x, y, kb, kh);
            ctx.fillStyle = MC_FARBEN.matt;
            ctx.font = fSans(Math.max(10, Math.round(kb * 0.11)), 600);
            ctx.textAlign = 'center';
            var woerter = String(k.name || '').split(/\s+/);
            for (var w = 0; w < Math.min(3, woerter.length); w++) {
                ctx.fillText(clip(ctx, woerter[w], kb - 10), x + kb / 2, y + kh / 2 - 12 + w * 16);
            }
            ctx.textAlign = 'left';
        }

        var bandH = Math.max(34, Math.round(kh * 0.20));
        var lin = ctx.createLinearGradient(0, y + kh - bandH - 12, 0, y + kh);
        lin.addColorStop(0, 'rgba(12,6,14,0)');
        lin.addColorStop(0.35, 'rgba(12,6,14,.80)');
        lin.addColorStop(1, 'rgba(12,6,14,.94)');
        ctx.fillStyle = lin;
        ctx.fillRect(x, y + kh - bandH - 12, kb, bandH + 12);

        /* Der Rang sitzt in der unteren rechten Ecke, IM dunklen Band.
         *
         * Vorher stand er oben links — genau dort, wo jede Pokemon-Karte
         * ihren eigenen gedruckten Namen traegt. Im Livebild vom
         * 31.08.2026 las sich Rang 1 als "Stretcher" statt "Night
         * Stretcher", Rang 2 als "Ball", Rang 3 als "Determination": die
         * Muenze deckte jeweils das erste Wort zu. Unten rechts liegt das
         * Band ohnehin schon dunkel ueber dem Bild, dort verdeckt die
         * Muenze nichts, und Gold auf Dunkel bleibt dieselbe Rolle wie
         * auf allen anderen Bildern. */
        var r = Math.max(13, Math.round(kb * 0.105));
        var rangX = x + kb - r - 7;
        var rangY = y + kh - r - 8;

        /* Name und Prozentzeile duerfen nicht unter die Muenze laufen —
         * der Platz, den sie belegt, geht von der Textbreite ab. */
        var textB = kb - 14 - (2 * r + 8);

        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = MC_FARBEN.creme;
        ctx.font = fSans(Math.max(10, Math.round(kb * 0.082)), 700);
        ctx.fillText(clip(ctx, k.name || '', textB), x + 7, y + kh - bandH * 0.52);

        ctx.fillStyle = MC_FARBEN.holz;
        ctx.font = fMono(Math.max(11, Math.round(kb * 0.095)), 700);
        ctx.fillText(clip(ctx, num(k.share, 1) + ' %', textB), x + 7, y + kh - 9);

        ctx.beginPath();
        ctx.arc(rangX, rangY, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(12,6,14,.88)'; ctx.fill();
        ctx.strokeStyle = MC_FARBEN.holz; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = MC_FARBEN.holz;
        ctx.font = fMono(Math.round(r * 1.05), 700);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(k.rang), rangX, rangY + 1);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.restore();

        ctx.strokeStyle = 'rgba(227,178,118,.34)'; ctx.lineWidth = 1;
        rr(ctx, x, y, kb, kh, 8); ctx.stroke();
    }

    function staplesPostCanvas(spec, bilder) {
        var cv = document.createElement('canvas');
        cv.width = MP.W; cv.height = MP.H;
        var ctx = cv.getContext('2d');

        malGrund(ctx);
        MC_BLUETEN.forEach(function (lage, i) { malBluete(ctx, bilder.blueten[i], lage); });

        /* Derselbe Kopf wie der Meta-Call-Post: kurze Kickerzeile, grosser
         * Titel, Logo rechts. Kein eigener Nachbau mehr. */
        malPostKopf(ctx, spec, bilder.logo);

        /* Das Logo setzt die Unterkante des Kopfes, nicht der Text.
         *
         * Am 28.08.2026 fiel der Titel weg und das Gitter rueckte auf eine
         * feste y=380 hoch — das Logo reicht aber bis 459 hinunter und
         * stand danach mitten in der ersten Kartenreihe. Gemeldet mit
         * Bild: "was zur Hoelle ist da mit dem Logo passiert". Eine feste
         * Zahl kann das nicht wissen; sie wird aus der wirklich
         * gezeichneten Logohoehe gerechnet. malPostKopf zeichnet das Logo
         * an derselben Stelle (x = W-44-286, y = 300, Breite 286).
         *
         * Der Titel endet bei rund y=428 und liegt damit ohnehin darueber
         * — das Logo bleibt die bindende Kante. */
        var LOGO_B = 286, LOGO_Y = 300;
        var logoH = (bilder.logo && bilder.logo.width)
            ? LOGO_B * (bilder.logo.height / bilder.logo.width)
            : LOGO_B * 0.557;

        var pad = 40;
        var innen = MP.W - pad * 2;
        var oben = Math.round(LOGO_Y + logoH + 22);
        var feldH = MP.H - 112 - oben;
        var karten = spec.karten || [];
        var mass = staplesGitter(karten.length, innen, feldH);
        if (mass) {
            var gitterB = mass.spalten * mass.kb + (mass.spalten - 1) * mass.gap;
            var gitterH = mass.zeilen * mass.kh + (mass.zeilen - 1) * mass.gap;
            var startX = pad + Math.round((innen - gitterB) / 2);
            var startY = oben + Math.max(0, Math.round((feldH - gitterH) / 2));
            for (var i = 0; i < karten.length; i++) {
                var zeile = Math.floor(i / mass.spalten);
                var inZeile = Math.min(mass.spalten, karten.length - zeile * mass.spalten);
                /* Eine angebrochene letzte Zeile mittig — links geklebt
                 * liest sie sich wie ein Rest, nicht wie das Ende. */
                var zx = startX + Math.round(((mass.spalten - inZeile) * (mass.kb + mass.gap)) / 2);
                malStapleKachel(ctx, karten[i],
                    zx + (i % mass.spalten) * (mass.kb + mass.gap),
                    startY + zeile * (mass.kh + mass.gap),
                    mass.kb, mass.kh);
            }
        }

        malMetaCallFuss(ctx, spec.fuss);
        return cv;
    }

    /* Oeffentlicher Weg. Die Kartenbilder laufen ueber denselben Proxy
     * wie alle anderen; faellt eines aus, traegt seine Kachel den Namen
     * statt eines Lochs. Fallen zu viele aus, wird das gesagt, statt ein
     * halb leeres Bild wortlos anzubieten. */
    function shareStaplesPost(spec) {
        if (!spec || !Array.isArray(spec.karten) || !spec.karten.length) {
            toast(L('Keine Daten für das Bild', 'No data for the image'), 'error');
            return Promise.resolve(false);
        }
        var facts = spaceFacts(activeSpace()) || {};

        /* Unten links nur noch das Datum. Betreiber: "unten in der Ecke
         * reicht das Datum, weil Meta steht ja schon oben und Limitless
         * Online ist egal." Das Format steht in der Kopfzeile; die Quelle
         * war die einzige Angabe, die nur hier stand — sie gehoert jetzt
         * in den Text des Posts. */
        var fuss = L('Stand ', 'as of ') + (facts.stamp || today());
        return Promise.all([
            markenBild('logo'),
            Promise.all(MC_BLUETEN.map(function (b) { return markenBild(b[0]); })),
            Promise.all(spec.karten.map(function (k) { return loadImage(k.url); }))
        ]).then(function (teile) {
            var bilder = teile[2];
            var fehlend = bilder.filter(function (b) { return !b; }).length;
            if (fehlend > Math.max(2, Math.floor(spec.karten.length / 3))) {
                toast(L('Zu viele Kartenbilder liessen sich nicht laden (' + fehlend + ' von '
                        + spec.karten.length + '). Bitte noch einmal versuchen.',
                        'Too many card images failed to load (' + fehlend + ' of '
                        + spec.karten.length + '). Please try again.'), 'error', 6000);
                return false;
            }
            var karten = spec.karten.map(function (k, i) {
                return { rang: k.rang, name: k.name, share: k.share, bild: bilder[i] };
            });
            /* Kicker = Format, Titel = worum es geht — dieselbe Aufteilung
             * wie beim Meta Call ("WORLDS \u00b7 TEF-PBL" / "Meta-Call").
             * Vorher stand beides zusammengefasst in der gesperrten Zeile
             * und lief ueber die halbe Bildbreite. */
            var cv = staplesPostCanvas({
                kicker: spec.kicker || facts.format || '',
                titel:  spec.titel  || L('Format-Staples', 'Format Staples'),
                karten: karten, fuss: fuss
            }, { logo: teile[0], blueten: teile[1] });
            if (fehlend > 0) {
                toast(L(fehlend + ' Kartenbild(er) fehlen im Post.',
                        fehlend + ' card image(s) missing from the post.'), 'warning', 5000);
            }
            return deliver(cv, safeName(spec.dateiname || spec.titel || 'format-staples') + '.png');
        }).catch(function (e) {
            console.error('[DsShare] Staples-Bild fehlgeschlagen', e);
            toast(L('Bild-Export fehlgeschlagen', 'Image export failed'), 'error');
            return false;
        });
    }

    window.DsShare = {
        shareDeckCard: shareDeckCard,
        shareMetaCallPost: shareMetaCallPost,
        shareStaplesPost: shareStaplesPost,
        shareResultCard: shareResultCard,
        sharePostCard: sharePostCard,
        // Für Tests und für alles, was die Karte anders befüllen will als
        // die beiden Sammler oben.
        _internals: {
            PALETTE: C, deckCardCanvas: deckCardCanvas, resultCardCanvas: resultCardCanvas,
            collectTournamentSpec: collectTournamentSpec, clip: clip, corsUrl: corsUrl,
            postCardCanvas: postCardCanvas, schnappschussKarten: schnappschussKarten,
            metaCallPostCanvas: metaCallPostCanvas, MC_FARBEN: MC_FARBEN,
            staplesPostCanvas: staplesPostCanvas, staplesGitter: staplesGitter,
            MC_BLUETEN: MC_BLUETEN, MP: MP,
            matchPunkte: matchPunkte, hatDay2: hatDay2,
            PUNKTE: PUNKTE, DAY2_PUNKTE: DAY2_PUNKTE,
            parseKartenSchluessel: parseKartenSchluessel, gitterMasse: gitterMasse,
            safeName: safeName, initials: initials
        }
    };
})();
