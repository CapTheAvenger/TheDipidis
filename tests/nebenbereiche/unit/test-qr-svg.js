/**
 * Der eigene QR-Erzeuger (js/qr-svg.js).
 *
 * WOZU
 * ----
 * Der Reiter "Pocket" zeigt zu jedem Deck ein 2D-Muster zum Scannen.
 * Wir legen nur den ausgelesenen Inhalt ab (data/pocket_tierlist.json,
 * Feld `code`) und zeichnen das Muster selbst — kein Hotlink auf einen
 * fremden Server, keine fremden Bilddaten im Auslieferungsstand.
 *
 * WAS HIER GEPRUEFT WIRD UND WAS NICHT
 * ------------------------------------
 * Hier steht die STRUKTUR: Version, Modulzahl, Suchmuster, Taktspur,
 * Ausrichtungsmuster, Formatinformation, und dass der Datenstrom
 * verlustfrei wieder aus dem Raster herauskommt. Der Rueckleser unten
 * ist bewusst NEU geschrieben und ruft nichts aus qr-svg.js auf —
 * sonst prueften sich zwei Kopien desselben Fehlers gegenseitig.
 *
 * Ob ein echter Leser das Bild annimmt, prueft
 * `tests/python/test_qr_svg.py` mit zxing-cpp. Das ist die
 * unabhaengige Instanz; diese Datei hier ersetzt sie nicht.
 *
 * DIE FEHLER, DIE DIESE DATEI FESTHAELT (alle am 07.09.2026 gemacht)
 * -----------------------------------------------------------------
 * 1. Die Formatinformation stand bitverkehrt im Bild. Ein QR-Leser
 *    nimmt so etwas nicht an — und es faellt an keiner Stelle auf,
 *    an der man rechnen kann, nur beim Lesen.
 * 2. Ausrichtungsmuster, deren Mittelpunkt auf der Taktspur liegt
 *    ((6,24) und (24,6) bei Version 8), fielen aus. 40 Module blieben
 *    faelschlich frei, der Datenstrom verrutschte um fuenf
 *    Codewoerter. Bei L und M faellt das NICHT auf, weil dort Version
 *    5 und 6 kein solches Muster haben — erst Q und H (Version 8 und
 *    9) zeigten es.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..', '..');
const qr = require(path.join(WURZEL, 'js', 'qr-svg.js'));
const DATEN = JSON.parse(fs.readFileSync(path.join(WURZEL, 'data', 'pocket_tierlist.json'), 'utf8'));
const CODES = DATEN.decks.map(d => d.code);

// Gemessen am 07.09.2026 mit segno (requirements.txt) ueber alle 33
// Codes, Byte-Modus, ohne Aufwertung der Stufe: fuer jede Stufe kam
// bei allen 33 dieselbe Version heraus.
const ERWARTET = { L: [5, 37], M: [6, 41], Q: [8, 49], H: [9, 53] };

// ── Ein Rueckleser, der nichts aus qr-svg.js benutzt ──────────────────

function maskenmuster(nr, y, x) {
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

const AUSRICHTUNG = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};

/** true, wo ein Datenmodul stehen darf. Eigenstaendig aufgebaut. */
function belegt(version) {
    const n = 17 + 4 * version;
    const f = [];
    for (let i = 0; i < n; i++) f.push(new Array(n).fill(false));
    function block(oy, ox, hoch, breit) {
        for (let y = oy; y < oy + hoch; y++) {
            for (let x = ox; x < ox + breit; x++) {
                if (y >= 0 && y < n && x >= 0 && x < n) f[y][x] = true;
            }
        }
    }
    block(0, 0, 9, 9);                 // Sucher oben links + Trenner + Format
    block(0, n - 8, 9, 8);             // Sucher oben rechts + Format
    block(n - 8, 0, 8, 9);             // Sucher unten links + Format + dunkles Modul
    for (let i = 0; i < n; i++) { f[6][i] = true; f[i][6] = true; }   // Taktspur
    const pos = AUSRICHTUNG[version];
    pos.forEach(cy => pos.forEach(cx => {
        const imSucher = (cy <= 8 && cx <= 8) || (cy <= 8 && cx >= n - 9) ||
                         (cy >= n - 9 && cx <= 8);
        if (!imSucher) block(cy - 2, cx - 2, 5, 5);
    }));
    if (version >= 7) {
        block(0, n - 11, 6, 3);
        block(n - 11, 0, 3, 6);
    }
    return f;
}

/** Die Codewoerter aus einem fertigen Raster zurueckholen. */
function zurueck(module, version, maske) {
    const n = module.length, fest = belegt(version), bits = [];
    let auf = true;
    for (let rechts = n - 1; rechts > 0; rechts -= 2) {
        if (rechts === 6) rechts--;
        for (let s = 0; s < n; s++) {
            const y = auf ? (n - 1 - s) : s;
            for (let d = 0; d < 2; d++) {
                const x = rechts - d;
                if (fest[y][x]) continue;
                bits.push(module[y][x] ^ (maskenmuster(maske, y, x) ? 1 : 0));
            }
        }
        auf = !auf;
    }
    const w = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        let v = 0;
        for (let k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
        w.push(v);
    }
    return { woerter: w, bits: bits.length };
}

describe('qr-svg: Version und Groesse', () => {
    it('alle 33 Codes ergeben je Stufe dieselbe Version wie segno', () => {
        // KEINE Ungleichung gegen den Bestand. Was hier schuetzen soll,
        // ist nicht "es sind viele Codes", sondern "die Schleife hat
        // wirklich jeden angefasst" — das sagt eine Gleichung genauer
        // (und der Wachhund in test-testdaten-wachhund.js zaehlt zu
        // Recht jede Ungleichung an Live-Daten mit).
        assert.notEqual(CODES.length, 0, 'die Datei fuehrt keinen einzigen Code');
        for (const [stufe, [version, groesse]] of Object.entries(ERWARTET)) {
            const abweichend = [];
            let angefasst = 0;
            CODES.forEach((c, i) => {
                angefasst++;
                const m = qr.matrix(c, stufe);
                if (m.version !== version || m.groesse !== groesse) {
                    abweichend.push(`#${i}: v${m.version}/${m.groesse}`);
                }
            });
            assert.equal(angefasst, CODES.length,
                'die Schleife hat nicht jeden Code angefasst');
            assert.deepStrictEqual(abweichend, [],
                `Stufe ${stufe} sollte ueberall Version ${version} (${groesse} Module) ` +
                `ergeben, weicht ab bei: ${abweichend.slice(0, 5).join(', ')}`);
        }
    });

    it('eine unbekannte Stufe wird abgewiesen statt still gedeutet', () => {
        assert.throws(() => qr.matrix('abc', 'X'), /Fehlerkorrekturstufe/);
    });

    it('was nicht mehr hineinpasst, wird gemeldet statt abgeschnitten', () => {
        assert.throws(() => qr.matrix('x'.repeat(400), 'H'), /keine Version bis 10/);
    });
});

describe('qr-svg: Funktionsmuster', () => {
    it('die drei Suchmuster stehen an ihren Ecken', () => {
        const m = qr.matrix(CODES[0], 'M').module, n = m.length;
        [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([oy, ox]) => {
            assert.equal(m[oy][ox], 1, `Sucher ${oy},${ox}: Ecke ist hell`);
            assert.equal(m[oy + 1][ox + 1], 0, 'der helle Ring fehlt');
            assert.equal(m[oy + 3][ox + 3], 1, 'der dunkle Kern fehlt');
        });
    });

    it('die Taktspur wechselt in Zeile und Spalte 6', () => {
        const m = qr.matrix(CODES[0], 'M').module, n = m.length;
        for (let i = 8; i < n - 8; i++) {
            assert.equal(m[6][i], i % 2 === 0 ? 1 : 0, `Taktspur waagerecht bei ${i}`);
            assert.equal(m[i][6], i % 2 === 0 ? 1 : 0, `Taktspur senkrecht bei ${i}`);
        }
    });

    it('das dunkle Modul steht', () => {
        const m = qr.matrix(CODES[0], 'M').module, n = m.length;
        assert.equal(m[n - 8][8], 1);
    });

    it('ein Ausrichtungsmuster AUF der Taktspur faellt nicht aus', () => {
        // Der Fehler vom 07.09.2026: die Bedingung lautete "Mittelpunkt
        // schon belegt -> auslassen". Bei Version 8 liegen (6,24) und
        // (24,6) auf der Taktspur und fielen damit weg. L und M zeigen
        // das nicht — dort gibt es kein solches Muster.
        const m = qr.matrix(CODES[0], 'Q').module;
        assert.equal(m.length, 49, 'Stufe Q sollte Version 8 ergeben');
        [[6, 24], [24, 6], [24, 24], [24, 42], [42, 24], [42, 42]].forEach(([cy, cx]) => {
            assert.equal(m[cy][cx], 1, `Ausrichtungsmuster ${cy},${cx}: Kern fehlt`);
            assert.equal(m[cy - 1][cx - 1], 0, `Ausrichtungsmuster ${cy},${cx}: heller Ring fehlt`);
            assert.equal(m[cy - 2][cx - 2], 1, `Ausrichtungsmuster ${cy},${cx}: dunkler Rand fehlt`);
        });
    });

    it('die Zahl der freien Module passt genau zu den Codewoertern', () => {
        // Genau diese Zahl war beim Ausrichtungsfehler um 40 zu hoch.
        const faelle = [['L', 5], ['M', 6], ['Q', 8], ['H', 9]];
        faelle.forEach(([stufe, version]) => {
            const m = qr.matrix(CODES[0], stufe);
            const frei = zurueck(m.module, version, m.maske).bits;
            const soll = qr._intern.codewoerter(CODES[0], version, stufe).length * 8;
            const rest = frei - soll;
            // Auch hier eine Zugehoerigkeit statt einer Ungleichung: die
            // Restbits sind per Norm genau eine der Zahlen 0 bis 7.
            assert.ok([0, 1, 2, 3, 4, 5, 6, 7].indexOf(rest) >= 0,
                `Stufe ${stufe}: ${frei} freie Module gegen ${soll} Datenbits — ` +
                `die Differenz ${rest} liegt ausserhalb der erlaubten Restbits (0..7)`);
        });
    });
});

describe('qr-svg: Formatinformation', () => {
    // Alle 32 Formatwoerter, AUS ECHTEN segno-SYMBOLEN AUSGELESEN
    // (error=..., mask=..., boost_error=False, 07.09.2026) — nicht aus
    // derselben Rechnung wie der Code, den sie pruefen sollen. Fuenf
    // davon stimmen ausserdem mit ISO/IEC 18004 Tabelle C.1 ueberein,
    // soweit sie hier von Hand nachgeschlagen wurden.
    //
    // Vollstaendig, weil die Zusicherung darunter sonst LEER BESTEHEN
    // kann: sie stieg mit `if (!soll) return;` aus, wenn die gewaehlte
    // Maske nicht in der Tabelle stand. Ueber alle 33 Codes kommen alle
    // acht Masken vor (Abnahme 07.09.2026).
    const TABELLE = {
        'L0': '111011111000100', 'L1': '111001011110011',
        'L2': '111110110101010', 'L3': '111100010011101',
        'L4': '110011000101111', 'L5': '110001100011000',
        'L6': '110110001000001', 'L7': '110100101110110',
        'M0': '101010000010010', 'M1': '101000100100101',
        'M2': '101111001111100', 'M3': '101101101001011',
        'M4': '100010111111001', 'M5': '100000011001110',
        'M6': '100111110010111', 'M7': '100101010100000',
        'Q0': '011010101011111', 'Q1': '011000001101000',
        'Q2': '011111100110001', 'Q3': '011101000000110',
        'Q4': '010010010110100', 'Q5': '010000110000011',
        'Q6': '010111011011010', 'Q7': '010101111101101',
        'H0': '001011010001001', 'H1': '001001110111110',
        'H2': '001110011100111', 'H3': '001100111010000',
        'H4': '000011101100010', 'H5': '000001001010101',
        'H6': '000110100001100', 'H7': '000100000111011'
    };
    // H/Maske 7 stand hier zuerst als '001100011011010' — aus dem
    // Gedaechtnis, und falsch. Gegengeprueft am 07.09.2026 an einem
    // echten segno-Symbol (error='h', mask=7, boost_error=False):
    // aus dessen Formatbereich gelesen kommt '000100000111011'. Die
    // uebrigen fuenf Woerter stimmten auf Anhieb; sie tragen die
    // Pruefung, dieses hier ist der sechste Zeuge.

    it('die Woerter stimmen mit der Norm ueberein', () => {
        Object.entries(TABELLE).forEach(([schluessel, soll]) => {
            const stufe = schluessel[0], maske = Number(schluessel.slice(1));
            // _intern.formatbits liefert die BILDreihenfolge (umgedreht).
            const gedreht = qr._intern.formatbits(stufe, maske);
            let wort = 0;
            for (let b = 0; b < 15; b++) wort |= ((gedreht >> (14 - b)) & 1) << b;
            assert.equal(wort.toString(2).padStart(15, '0'), soll,
                `Formatinformation ${stufe}/Maske ${maske}`);
        });
    });

    it('das hoechstwertige Bit steht auf (8,0), nicht das niederwertigste', () => {
        // Der Fehler vom 07.09.2026. Er ist NUR hier zu sehen: rechnen
        // laesst sich damit alles, nur lesen nicht.
        const m = qr.matrix(CODES[0], 'M');
        // Ueber ALLE Codes und alle vier Stufen — kein Ausstieg mehr.
        let geprueft = 0;
        ['L', 'M', 'Q', 'H'].forEach(stufe => {
            CODES.forEach(c => {
                const mm = qr.matrix(c, stufe);
                const soll = TABELLE[stufe + mm.maske];
                assert.ok(soll, `kein Sollwert fuer ${stufe}/Maske ${mm.maske}`);
                assert.equal(String(mm.module[8][0]), soll[0],
                    `${stufe}/Maske ${mm.maske}: auf (8,0) steht nicht das ` +
                    `hoechstwertige Bit der Formatinformation`);
                geprueft++;
            });
        });
        assert.equal(geprueft, CODES.length * 4,
            'die Schleife hat nicht jeden Fall angefasst');
    });

    it('beide Kopien der Formatinformation sagen dasselbe', () => {
        const m = qr.matrix(CODES[0], 'M'), mod = m.module, n = m.groesse;
        const bits = qr._intern.formatbits('M', m.maske);
        for (let i = 0; i <= 5; i++) {
            assert.equal(mod[8][i], (bits >> i) & 1, `Kopie 1, Bit ${i}`);
            assert.equal(mod[i][8], (bits >> (14 - i)) & 1, `Kopie 1 senkrecht, Bit ${14 - i}`);
        }
        for (let k = 0; k <= 6; k++) {
            assert.equal(mod[n - 1 - k][8], (bits >> k) & 1, `Kopie 2 senkrecht, Bit ${k}`);
        }
        for (let l = 7; l <= 14; l++) {
            assert.equal(mod[8][n - 15 + l], (bits >> l) & 1, `Kopie 2 waagerecht, Bit ${l}`);
        }
    });
});

describe('qr-svg: der Datenstrom kommt heil wieder heraus', () => {
    it('alle 33 Codes, alle vier Stufen', () => {
        const faelle = [['L', 5], ['M', 6], ['Q', 8], ['H', 9]];
        faelle.forEach(([stufe, version]) => {
            CODES.forEach((c, i) => {
                const m = qr.matrix(c, stufe);
                const soll = qr._intern.codewoerter(c, version, stufe);
                const ist = zurueck(m.module, version, m.maske).woerter;
                for (let k = 0; k < soll.length; k++) {
                    assert.equal(ist[k], soll[k],
                        `Stufe ${stufe}, Code #${i}: Codewort ${k} kam als ` +
                        `${ist[k]} zurueck statt ${soll[k]}`);
                }
            });
        });
    });

    it('die Fuellbytes beginnen mit 0xEC und wechseln', () => {
        // ISO/IEC 18004, 7.4.10: 11101100 / 00010001, in dieser
        // Reihenfolge. Ein Leser stoert sich nicht daran, wenn man sie
        // vertauscht — er liest die Laenge und ignoriert den Rest.
        // Deshalb faellt das an keinem Rueckleseweg auf, und deshalb
        // steht es hier (Mutationsprobe 07.09.2026: vertauschte
        // Fuellbytes ueberlebten beide Suiten).
        // Stufe L / Version 5, weil das der EINZIGE unserer vier Faelle
        // mit nur einem Block ist. Version 6 / M hat vier Bloecke, und
        // die Ausgabe ist verschraenkt — dort liegen die Fuellbytes
        // nicht hintereinander. (Erster Anlauf hat genau das uebersehen.)
        const w = qr._intern.codewoerter(CODES[0], 5, 'L');
        const bloecke = 1;
        assert.equal(qr._intern.datenmenge(5, 'L'), 108,
            'Version 5 / L sollte 108 Datencodewoerter haben');
        // 4 Bit Modus + 8 Bit Laenge + 88 Byte + 4 Bit Abschluss = 720 Bit
        // = 90 Codewoerter. Ab 90 stehen die Fuellbytes.
        const abPad = Math.ceil((4 + 8 + 8 * CODES[0].length + 4) / 8);
        assert.equal(abPad, 90);
        assert.equal(bloecke, 1);
        assert.equal(w[abPad], 0xec,
            `das erste Fuellbyte (Index ${abPad}) ist ${w[abPad]} statt 0xEC`);
        assert.equal(w[abPad + 1], 0x11, 'das zweite Fuellbyte ist nicht 0x11');
        assert.equal(w[abPad + 2], 0xec, 'die Fuellbytes wechseln nicht');
    });

    it('der erzwungene Maskenwert wird auch benutzt', () => {
        // Sonst prueft der Rueckleser oben immer nur die gewaehlte Maske.
        for (let k = 0; k < 8; k++) {
            assert.equal(qr.matrix(CODES[0], 'M', k).maske, k);
        }
    });
});

describe('qr-svg: das Bild', () => {
    it('traegt die Ruhezone von vier Modulen', () => {
        const s = qr.svg(CODES[0], { stufe: 'M' });
        assert.match(s, /viewBox="0 0 49 49"/,
            '41 Module + 2x4 Ruhezone = 49 — ohne Ruhezone liest kein Scanner');
    });

    it('ist hart schwarz auf weiss, auch im Dunkelmodus', () => {
        const s = qr.svg(CODES[0]);
        assert.match(s, /fill="#ffffff"/, 'kein weisser Grund');
        assert.match(s, /fill="#000000"/, 'keine schwarzen Module');
        assert.doesNotMatch(s, /var\(--/,
            'eine Farbe kommt aus einem Token — dann kippt das Muster im Dunkelmodus');
        assert.match(s, /shape-rendering="crispEdges"/);
    });

    it('zeichnet genau die dunklen Module', () => {
        const m = qr.matrix(CODES[0], 'M');
        let dunkel = 0;
        m.module.forEach(r => r.forEach(v => { if (v) dunkel++; }));
        const s = qr.svg(CODES[0], { stufe: 'M' });
        // Jede waagerechte Strecke ist ein M...h...v1h-...z; die Summe
        // der Strecken muss die Zahl der dunklen Module ergeben.
        let summe = 0;
        (s.match(/h(\d+)v1/g) || []).forEach(t => { summe += Number(t.slice(1, -2)); });
        assert.equal(summe, dunkel,
            `das Bild zeichnet ${summe} Module, das Raster hat ${dunkel} dunkle`);
    });

    it('bekommt einen Titel nur, wenn einer verlangt wird', () => {
        assert.match(qr.svg(CODES[0], { titel: 'Testdeck' }), /<title>Testdeck<\/title>/);
        assert.match(qr.svg(CODES[0]), /aria-hidden="true"/);
    });
});
