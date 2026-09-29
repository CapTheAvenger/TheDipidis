// qr-svg.js — QR-Code als SVG, ohne Bauschritt und ohne fremdes CDN.
//
// WARUM SELBST ZEICHNEN
// ---------------------
// Der Reiter "Pocket" zeigt zu jedem Deck ein 2D-Muster zum Scannen.
// Bis 29.09.2026 kam es als verziertes PNG von Game8 (img.game8.co), und
// wir legten nur den ausgelesenen Inhalt ab; seitdem baut
// scripts/scrape_pocket_limitless.py den Inhalt selbst aus der Deckliste
// (data/pocket_tierlist.json, Feld `code`). Gezeichnet wird hier:
//
//   * kein Hotlink auf einen fremden Server, der jederzeit abschalten kann,
//   * kein fremdes Bildmaterial im Auslieferungsstand,
//   * und die Groesse und die Farben sind unsere.
//
// NUR BYTE-MODUS, NUR VERSION 1 BIS 10
// ------------------------------------
// Der Zeichenvorrat der Pocket-Codes ist Base64 mit Kleinbuchstaben; der
// alphanumerische Modus kennt keine. Alle 33 Codes sind 88 Zeichen lang
// und passen bei Fehlerkorrektur M in Version 6 (41x41 Module) —
// nachgemessen am 07.09.2026 mit segno ueber alle 33. Version 10 als
// Obergrenze laesst Luft, ohne die Versionsinformation ab Version 7
// wegzulassen (die ist eingebaut).
//
// DIE ZAHLEN STAMMEN NICHT AUS DEM GEDAECHTNIS
// --------------------------------------------
// Die Bloecktabelle unten ist aus segno (requirements.txt) erzeugt, nicht
// abgetippt, und `tests/unit/test-qr-svg.js` vergleicht die fertige
// Modulmatrix dieses Moduls mit der von segno — fuer alle 33 echten Codes
// in allen vier Fehlerkorrekturstufen. Ein Rechenfehler hier faellt damit
// auf, bevor jemand vergeblich scannt.
//
// DER SCAN IST GEPRUEFT, UND ZWAR AM ECHTEN SPIEL
// ------------------------------------------------
// 07.09.2026: der Betreiber hat ein von diesem Modul gezeichnetes
// Muster (Chien-Pao ex and Baxcalibur, Stufe M, Version 6, 41x41) mit
// Pokemon TCG Pocket gescannt. Es funktioniert.
//
// Das ist die einzige Aussage hier, die keine Rechnung ersetzen kann:
// dass unser Erzeuger und unser Leser uebereinstimmen, sagt nichts
// darueber, ob DIE APP das Bild annimmt. Bis zu diesem Scan war der
// ganze Reiter eine Kette von Plausibilitaeten.
//
// DUNKEL AUF HELL, IMMER
// ----------------------
// `svg()` schreibt Grund- und Modulfarbe hart in das Bild. Ein
// invertierter QR ist nicht verlaesslich scannbar, und der Reiter laeuft
// auch im Dunkelmodus.

(function (global) {
    'use strict';

    // [Bloecke, Gesamtcodewoerter je Block, Datencodewoerter je Block]
    var BLOECKE = {
        1: { L: [[1, 26, 19]], M: [[1, 26, 16]], Q: [[1, 26, 13]], H: [[1, 26, 9]] },
        2: { L: [[1, 44, 34]], M: [[1, 44, 28]], Q: [[1, 44, 22]], H: [[1, 44, 16]] },
        3: { L: [[1, 70, 55]], M: [[1, 70, 44]], Q: [[2, 35, 17]], H: [[2, 35, 13]] },
        4: { L: [[1, 100, 80]], M: [[2, 50, 32]], Q: [[2, 50, 24]], H: [[4, 25, 9]] },
        5: { L: [[1, 134, 108]], M: [[2, 67, 43]], Q: [[2, 33, 15], [2, 34, 16]], H: [[2, 33, 11], [2, 34, 12]] },
        6: { L: [[2, 86, 68]], M: [[4, 43, 27]], Q: [[4, 43, 19]], H: [[4, 43, 15]] },
        7: { L: [[2, 98, 78]], M: [[4, 49, 31]], Q: [[2, 32, 14], [4, 33, 15]], H: [[4, 39, 13], [1, 40, 14]] },
        8: { L: [[2, 121, 97]], M: [[2, 60, 38], [2, 61, 39]], Q: [[4, 40, 18], [2, 41, 19]], H: [[4, 40, 14], [2, 41, 15]] },
        9: { L: [[2, 146, 116]], M: [[3, 58, 36], [2, 59, 37]], Q: [[4, 36, 16], [4, 37, 17]], H: [[4, 36, 12], [4, 37, 13]] },
        10: { L: [[2, 86, 68], [2, 87, 69]], M: [[4, 69, 43], [1, 70, 44]], Q: [[6, 43, 19], [2, 44, 20]], H: [[6, 43, 15], [2, 44, 16]] }
    };

    // Ausrichtungsmuster ab Version 2 (Version 1 hat keine).
    var AUSRICHTUNG = {
        2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
        7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
    };

    var STUFEN = { L: 1, M: 0, Q: 3, H: 2 };   // Bitmuster der Formatinformation

    // ── GF(256) ──────────────────────────────────────────────────────
    var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
    (function () {
        var x = 1;
        for (var i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;          // x^8 + x^4 + x^3 + x^2 + 1
        }
        for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
    }());

    function mal(a, b) {
        if (a === 0 || b === 0) return 0;
        return EXP[LOG[a] + LOG[b]];
    }

    function generator(grad) {
        var g = [1];
        for (var i = 0; i < grad; i++) {
            var neu = new Array(g.length + 1).fill(0);
            for (var j = 0; j < g.length; j++) {
                neu[j] ^= g[j];
                neu[j + 1] ^= mal(g[j], EXP[i]);
            }
            g = neu;
        }
        return g;
    }

    function restklasse(daten, anzahl) {
        var g = generator(anzahl);
        var rest = daten.slice().concat(new Array(anzahl).fill(0));
        for (var i = 0; i < daten.length; i++) {
            var f = rest[i];
            if (f === 0) continue;
            for (var j = 0; j < g.length; j++) rest[i + j] ^= mal(g[j], f);
        }
        return rest.slice(daten.length);
    }

    // ── Datenstrom ───────────────────────────────────────────────────
    function bytes(text) {
        if (global.TextEncoder) return Array.from(new global.TextEncoder().encode(text));
        // Rueckfall: eigene UTF-8-Kodierung.
        var raus = [];
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (c < 0x80) raus.push(c);
            else if (c < 0x800) raus.push(0xc0 | (c >> 6), 0x80 | (c & 63));
            else raus.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
        return raus;
    }

    function datenmenge(version, stufe) {
        var summe = 0;
        BLOECKE[version][stufe].forEach(function (b) { summe += b[0] * b[2]; });
        return summe;
    }

    function versionFuer(laenge, stufe) {
        for (var v = 1; v <= 10; v++) {
            var laengenbits = v < 10 ? 8 : 16;
            var noetig = 4 + laengenbits + 8 * laenge;
            if (datenmenge(v, stufe) * 8 >= noetig) return v;
        }
        return null;
    }

    function codewoerter(text, version, stufe) {
        var roh = bytes(text);
        var laengenbits = version < 10 ? 8 : 16;
        var bits = [];
        function schreib(wert, anzahl) {
            for (var i = anzahl - 1; i >= 0; i--) bits.push((wert >> i) & 1);
        }
        schreib(4, 4);                       // Byte-Modus
        schreib(roh.length, laengenbits);
        roh.forEach(function (b) { schreib(b, 8); });

        var platz = datenmenge(version, stufe) * 8;
        var abschluss = Math.min(4, platz - bits.length);
        for (var i = 0; i < abschluss; i++) bits.push(0);
        while (bits.length % 8) bits.push(0);

        var daten = [];
        for (var j = 0; j < bits.length; j += 8) {
            var w = 0;
            for (var k = 0; k < 8; k++) w = (w << 1) | bits[j + k];
            daten.push(w);
        }
        var fuell = [0xec, 0x11], f = 0;
        while (daten.length < datenmenge(version, stufe)) daten.push(fuell[f++ % 2]);

        // Bloecke bilden, Fehlerkorrektur rechnen, verschraenken.
        var datenbloecke = [], ecbloecke = [], zeiger = 0, ecLaenge = 0;
        BLOECKE[version][stufe].forEach(function (b) {
            var anzahl = b[0], gesamt = b[1], nutz = b[2];
            ecLaenge = gesamt - nutz;
            for (var i = 0; i < anzahl; i++) {
                var teil = daten.slice(zeiger, zeiger + nutz);
                zeiger += nutz;
                datenbloecke.push(teil);
                ecbloecke.push(restklasse(teil, gesamt - nutz));
            }
        });
        var raus = [], laengste = 0;
        datenbloecke.forEach(function (b) { laengste = Math.max(laengste, b.length); });
        for (var s = 0; s < laengste; s++) {
            for (var b2 = 0; b2 < datenbloecke.length; b2++) {
                if (s < datenbloecke[b2].length) raus.push(datenbloecke[b2][s]);
            }
        }
        for (var s2 = 0; s2 < ecLaenge; s2++) {
            for (var b3 = 0; b3 < ecbloecke.length; b3++) raus.push(ecbloecke[b3][s2]);
        }
        return raus;
    }

    // ── Modulraster ──────────────────────────────────────────────────
    function leer(n) {
        var m = [];
        for (var i = 0; i < n; i++) m.push(new Array(n).fill(null));
        return m;
    }

    function setzeFunktionsmuster(m, version) {
        var n = m.length;

        function sucher(oy, ox) {
            for (var y = -1; y <= 7; y++) {
                for (var x = -1; x <= 7; x++) {
                    var yy = oy + y, xx = ox + x;
                    if (yy < 0 || yy >= n || xx < 0 || xx >= n) continue;
                    var innen = (y >= 0 && y <= 6 && (x === 0 || x === 6)) ||
                                (x >= 0 && x <= 6 && (y === 0 || y === 6)) ||
                                (y >= 2 && y <= 4 && x >= 2 && x <= 4);
                    m[yy][xx] = innen ? 1 : 0;
                }
            }
        }
        sucher(0, 0); sucher(0, n - 7); sucher(n - 7, 0);

        for (var i = 8; i < n - 8; i++) {
            var an = (i % 2 === 0) ? 1 : 0;
            m[6][i] = an;
            m[i][6] = an;
        }

        var pos = AUSRICHTUNG[version] || [];
        for (var a = 0; a < pos.length; a++) {
            for (var b = 0; b < pos.length; b++) {
                var cy = pos[a], cx = pos[b];
                // NUR die drei Mittelpunkte auslassen, die in einem SUCHER
                // liegen — nicht jeden, der schon belegt ist.
                //
                // BEFUND 07.09.2026: die alte Bedingung war
                // `m[cy][cx] !== null`. Ab Version 7 liegen zwei
                // Ausrichtungsmuster auf der Taktspur ((6,24) und (24,6)
                // bei Version 8), deren Mittelpunkt also schon gesetzt
                // ist. Sie fielen aus — 40 Module blieben faelschlich frei,
                // der Datenstrom verrutschte um fuenf Codewoerter, und
                // zxing-cpp las bei Q und H nichts. Bei L und M faellt es
                // nicht auf, weil dort Version 5 und 6 kein solches Muster
                // haben.
                var imSucher = (cy <= 8 && cx <= 8) ||
                               (cy <= 8 && cx >= n - 9) ||
                               (cy >= n - 9 && cx <= 8);
                if (imSucher) continue;
                for (var dy = -2; dy <= 2; dy++) {
                    for (var dx = -2; dx <= 2; dx++) {
                        var rand = Math.max(Math.abs(dy), Math.abs(dx));
                        m[cy + dy][cx + dx] = (rand !== 1) ? 1 : 0;
                    }
                }
            }
        }

        m[n - 8][8] = 1;                                  // dunkles Modul

        // Formatbereiche freihalten (Wert kommt spaeter).
        for (var k = 0; k <= 8; k++) {
            if (m[8][k] === null) m[8][k] = 0;
            if (m[k][8] === null) m[k][8] = 0;
        }
        for (var k2 = 0; k2 < 8; k2++) {
            if (m[8][n - 1 - k2] === null) m[8][n - 1 - k2] = 0;
            if (m[n - 1 - k2][8] === null) m[n - 1 - k2][8] = 0;
        }
        if (version >= 7) {
            for (var y2 = 0; y2 < 6; y2++) {
                for (var x2 = 0; x2 < 3; x2++) {
                    m[y2][n - 11 + x2] = 0;
                    m[n - 11 + x2][y2] = 0;
                }
            }
        }
    }

    function frei(version) {
        // Ein zweites Raster, das nur sagt: hier darf gezeichnet werden.
        var n = 17 + 4 * version;
        var m = leer(n);
        setzeFunktionsmuster(m, version);
        var f = [];
        for (var y = 0; y < n; y++) {
            f.push([]);
            for (var x = 0; x < n; x++) f[y].push(m[y][x] === null);
        }
        return f;
    }

    function setzeDaten(m, offen, woerter) {
        var n = m.length, bit = 0, gesamt = woerter.length * 8;
        var aufwaerts = true;
        for (var rechts = n - 1; rechts > 0; rechts -= 2) {
            if (rechts === 6) rechts--;                   // Spalte 6 ist Taktspur
            for (var s = 0; s < n; s++) {
                var y = aufwaerts ? (n - 1 - s) : s;
                for (var d = 0; d < 2; d++) {
                    var x = rechts - d;
                    if (!offen[y][x]) continue;
                    var wert = 0;
                    if (bit < gesamt) {
                        wert = (woerter[bit >> 3] >> (7 - (bit & 7))) & 1;
                        bit++;
                    }
                    m[y][x] = wert;
                }
            }
            aufwaerts = !aufwaerts;
        }
    }

    function maske(nr, y, x) {
        switch (nr) {
            case 0: return (y + x) % 2 === 0;
            case 1: return y % 2 === 0;
            case 2: return x % 3 === 0;
            case 3: return (y + x) % 3 === 0;
            case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
            case 5: return (y * x) % 2 + (y * x) % 3 === 0;
            case 6: return ((y * x) % 2 + (y * x) % 3) % 2 === 0;
            default: return ((y + x) % 2 + (y * x) % 3) % 2 === 0;
        }
    }

    function strafe(m) {
        var n = m.length, punkte = 0, y, x, i;

        // Regel 1: fuenf und mehr gleiche in einer Reihe.
        for (y = 0; y < n; y++) {
            for (var richtung = 0; richtung < 2; richtung++) {
                var lauf = 1, letzter = -1;
                for (x = 0; x < n; x++) {
                    var w = richtung === 0 ? m[y][x] : m[x][y];
                    if (w === letzter) { lauf++; }
                    else {
                        if (lauf >= 5) punkte += lauf - 2;
                        lauf = 1; letzter = w;
                    }
                }
                if (lauf >= 5) punkte += lauf - 2;
            }
        }

        // Regel 2: gleichfarbige 2x2-Felder.
        for (y = 0; y < n - 1; y++) {
            for (x = 0; x < n - 1; x++) {
                var a = m[y][x];
                if (a === m[y][x + 1] && a === m[y + 1][x] && a === m[y + 1][x + 1]) punkte += 3;
            }
        }

        // Regel 3: das Sucher-aehnliche Muster 1011101 mit vier hellen daneben.
        var muster1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
        var muster2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
        for (y = 0; y < n; y++) {
            for (x = 0; x + 11 <= n; x++) {
                var waag1 = true, waag2 = true, senk1 = true, senk2 = true;
                for (i = 0; i < 11; i++) {
                    if (m[y][x + i] !== muster1[i]) waag1 = false;
                    if (m[y][x + i] !== muster2[i]) waag2 = false;
                    if (m[x + i][y] !== muster1[i]) senk1 = false;
                    if (m[x + i][y] !== muster2[i]) senk2 = false;
                }
                if (waag1) punkte += 40;
                if (waag2) punkte += 40;
                if (senk1) punkte += 40;
                if (senk2) punkte += 40;
            }
        }

        // Regel 4: Abweichung vom halb-halb-Verhaeltnis.
        var dunkel = 0;
        for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (m[y][x]) dunkel++;
        var anteil = dunkel * 100 / (n * n);
        punkte += Math.floor(Math.abs(anteil - 50) / 5) * 10;
        return punkte;
    }

    function formatbits(stufe, maskennr) {
        var daten = (STUFEN[stufe] << 3) | maskennr;
        var rest = daten << 10;
        for (var i = 14; i >= 10; i--) {
            if ((rest >> i) & 1) rest ^= 0x537 << (i - 10);
        }
        var wort = ((daten << 10) | rest) ^ 0x5412;
        // UMGEDREHT, UND DAS IST DER PUNKT
        // --------------------------------
        // `wort` ist die Formatinformation, wie sie ueberall notiert wird:
        // hoechstwertiges Bit zuerst. Im Symbol steht dieses hoechstwertige
        // Bit auf (8,0) — die Reihenfolge im Bild ist also die umgekehrte
        // der Zaehlung hier. Wer sie nicht dreht, bekommt ein Muster, das
        // kein Leser annimmt (07.09.2026: erst am Abgleich mit segno
        // aufgefallen, die Modulmatrix wich in beiden Formatkopien ab).
        var gedreht = 0;
        for (var b = 0; b < 15; b++) gedreht |= ((wort >> (14 - b)) & 1) << b;
        return gedreht;
    }

    function versionsbits(version) {
        var rest = version << 12;
        for (var i = 17; i >= 12; i--) {
            if ((rest >> i) & 1) rest ^= 0x1f25 << (i - 12);
        }
        return (version << 12) | rest;
    }

    function setzeFormat(m, stufe, maskennr) {
        var n = m.length, bits = formatbits(stufe, maskennr);
        for (var i = 0; i <= 5; i++) m[8][i] = (bits >> i) & 1;
        m[8][7] = (bits >> 6) & 1;
        m[8][8] = (bits >> 7) & 1;
        m[7][8] = (bits >> 8) & 1;
        for (var j = 9; j <= 14; j++) m[14 - j][8] = (bits >> j) & 1;

        // Die zweite Kopie: Bits 0..6 senkrecht unten links, Bits 7..14
        // waagerecht rechts. Die Stelle (n-8, 8) dazwischen ist NICHT
        // Teil der Formatinformation, sondern das dunkle Modul.
        //
        // BEFUND 07.09.2026: hier lief die senkrechte Schleife bis 7 und
        // schrieb Bit 7 in das dunkle Modul, das danach wieder auf 1
        // gesetzt wurde — Bit 7 war weg, und die waagerechte Schleife
        // begann eine Spalte zu weit rechts. Ergebnis: ein Muster, das
        // kein Leser annimmt.
        for (var k = 0; k <= 6; k++) m[n - 1 - k][8] = (bits >> k) & 1;
        for (var l = 7; l <= 14; l++) m[8][n - 15 + l] = (bits >> l) & 1;
        m[n - 8][8] = 1;
    }

    function setzeVersion(m, version) {
        if (version < 7) return;
        var n = m.length, bits = versionsbits(version);
        for (var i = 0; i < 18; i++) {
            var an = (bits >> i) & 1;
            var a = Math.floor(i / 3), b = i % 3;
            m[a][n - 11 + b] = an;
            m[n - 11 + b][a] = an;
        }
    }

    function matrix(text, stufe, maskeErzwungen) {
        stufe = stufe || 'M';
        if (!(stufe in STUFEN)) throw new Error('unbekannte Fehlerkorrekturstufe: ' + stufe);
        var laenge = bytes(text).length;
        var version = versionFuer(laenge, stufe);
        if (!version) {
            throw new Error(laenge + ' Byte passen bei Stufe ' + stufe +
                            ' in keine Version bis 10 — dieses Modul kann nicht mehr');
        }
        var woerter = codewoerter(text, version, stufe);
        var offen = frei(version);
        var n = 17 + 4 * version;

        var grund = leer(n);
        setzeFunktionsmuster(grund, version);
        setzeDaten(grund, offen, woerter);
        setzeVersion(grund, version);

        var beste = null, besteStrafe = Infinity, besteNr = 0;
        for (var nr = 0; nr < 8; nr++) {
            if (maskeErzwungen !== undefined && maskeErzwungen !== null && nr !== maskeErzwungen) continue;
            var kandidat = grund.map(function (r) { return r.slice(); });
            for (var y = 0; y < n; y++) {
                for (var x = 0; x < n; x++) {
                    if (offen[y][x] && maske(nr, y, x)) kandidat[y][x] ^= 1;
                }
            }
            setzeFormat(kandidat, stufe, nr);
            var p = strafe(kandidat);
            if (p < besteStrafe) { besteStrafe = p; beste = kandidat; besteNr = nr; }
        }
        return { module: beste, version: version, groesse: n, maske: besteNr, stufe: stufe };
    }

    function svg(text, wahl) {
        wahl = wahl || {};
        var m = matrix(text, wahl.stufe);
        var rand = wahl.rand === undefined ? 4 : wahl.rand;   // Ruhezone, Norm: 4 Module
        var n = m.groesse, g = n + 2 * rand;
        var teile = [];
        for (var y = 0; y < n; y++) {
            var x = 0;
            while (x < n) {
                if (m.module[y][x]) {
                    var von = x;
                    while (x < n && m.module[y][x]) x++;
                    teile.push('M' + (von + rand) + ' ' + (y + rand) +
                               'h' + (x - von) + 'v1h-' + (x - von) + 'z');
                } else {
                    x++;
                }
            }
        }
        // Farben hart, nicht ueber Tokens: ein invertierter QR ist nicht
        // verlaesslich scannbar, und diese Seite hat einen Dunkelmodus.
        var titel = wahl.titel ? '<title>' + String(wahl.titel).replace(/[<>&]/g, '') + '</title>' : '';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + g + ' ' + g +
               '" shape-rendering="crispEdges" role="img"' +
               (wahl.titel ? '' : ' aria-hidden="true"') + '>' + titel +
               '<rect width="' + g + '" height="' + g + '" fill="#ffffff"/>' +
               '<path d="' + teile.join('') + '" fill="#000000"/></svg>';
    }

    // Innereien fuer den Abgleich gegen segno (tests/unit/test-qr-svg.js).
    // Nicht fuer die Oberflaeche gedacht; der Unterstrich sagt das.
    global.qrSvg = {
        matrix: matrix, svg: svg,
        _intern: {
            codewoerter: codewoerter, frei: frei, setzeDaten: setzeDaten,
            formatbits: formatbits, versionsbits: versionsbits,
            versionFuer: versionFuer, datenmenge: datenmenge
        }
    };
}(typeof window !== 'undefined' ? window : this));

if (typeof module !== 'undefined' && module.exports) {
    module.exports = (typeof window !== 'undefined' ? window : this).qrSvg;
}
