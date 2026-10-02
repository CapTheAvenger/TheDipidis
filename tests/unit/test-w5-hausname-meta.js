/**
 * W5 — „META", NIE „FELD" (Anordnung des Betreibers, 03.10.2026).
 *
 * „Wir benutzen immer das Wort Meta und nicht das Wort Feld — und trotzdem
 * sprechen wir im Meta Call immer noch vereinzelt von Feld."
 *
 * Gemeint ist das TEILNEHMERFELD (Anteile, Zusammensetzung, „Feldanteil").
 * Ein FORMULARFELD („Feld leeren") bleibt, weil es ein Eingabefeld ist — das
 * steht in der POSITIVLISTE mit Begruendung, und eine TOTE Zeile laesst diesen
 * Test fallen.
 *
 * GEPRUEFT WIRD NUR, WAS EIN MENSCH LIEST: Zeichenketten. Kommentare,
 * console.*-Zeilen (Entwicklerprotokoll) und Bezeichner (`_feldTeilung`,
 * `FELD_AUSWAHL_KEY`, `mc-feld-summe`, `renderFieldPanel`) werden nicht
 * angesehen — sie stehen auf keinem Bildschirm.
 *
 * Bereich: js/app-meta-call.js, js/win-rate-konvention.js und die
 * `mc.*`-Schluessel in js/i18n.js (deutsch UND englisch).
 *
 * NICHT GEPRUEFT: Nebenbereiche (Playtest „Spielfeld", Deck-Detail-Bild,
 * Deck-Empfehlung, Matchup-Tab) — ob die Regel dort ebenfalls gilt, ist offen.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const VERBOTEN = [
  { muster: /(?<![\w-])Feld(?:es|er|ern|s)?(?![\w-])/, was: '„Feld" (deutsch)' },
  { muster: /Turnierfeld|Teilnehmerfeld|Feldanteil|Feldquote|Feldgr[oö]/i, was: 'Zusammensetzung mit „Feld"' },
  { muster: /Field-(?:Share|Anteil|Zusammensetzung)/, was: '„Field-…" im deutschen Text' },
  { muster: /(?<![\w-])[Ff]ields?(?![\w-])/, was: '„field" (englisch)' },
];

const POSITIVLISTE = [
  { datei: 'js/app-meta-call.js', text: 'Feld leeren gibt den gemessenen Wert zurück',
    grund: 'EINGABEFELD (Schaetzung), kein Teilnehmerfeld.' },
  { datei: 'js/app-meta-call.js', text: 'clear the field to get the measured value back',
    grund: 'EINGABEFELD (englische Fassung derselben Zeile).' },
];

function ohneKommentare(q) {
  const b = q.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return b.split('\n').map((z) => (/^\s*\/\//.test(z) ? '' : z)).join('\n');
}
const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/** Alle Zeichenketten mit Zeilennummer; console.*-Zeilen bleiben aussen vor. */
function literale(quelle) {
  const code = ohneKommentare(quelle);
  const raus = [];
  code.split('\n').forEach((zeile, i) => {
    if (/console\.(?:log|info|warn|error)\s*\(/.test(zeile)) return;
    for (const m of zeile.matchAll(LITERAL)) raus.push({ zeile: i + 1, text: m[0] });
  });
  return raus;
}

function befunde(datei, nurMc) {
  const q = lies(datei);
  const liste = datei.endsWith('i18n.js')
    ? q.split('\n').map((z, i) => ({ z, i })).filter(({ z }) => /^\s*'mc\.[A-Za-z0-9_]+'\s*:/.test(z))
        .map(({ z, i }) => ({ zeile: i + 1, text: z }))
    : literale(q);
  const raus = [];
  for (const l of liste) {
    for (const v of VERBOTEN) {
      if (v.muster.test(l.text)) {
        const ok = POSITIVLISTE.some((p) => p.datei === datei && l.text.includes(p.text));
        if (!ok) raus.push(`${datei}:${l.zeile} ${v.was}: ${l.text.slice(0, 140)}`);
      }
    }
  }
  return raus;
}

const DATEIEN = ['js/app-meta-call.js', 'js/win-rate-konvention.js', 'js/i18n.js'];

describe('W5 — kein „Feld" im Meta Call', () => {
  for (const d of DATEIEN) {
    it(d + ' sagt „Meta", nicht „Feld"', () => {
      const b = befunde(d);
      assert.deepEqual(b, [], 'Das Wort „Feld" steht (wieder) in einer Zeichenkette:\n' + b.join('\n'));
    });
  }

  it('POSITIVLISTE: keine tote Zeile', () => {
    for (const p of POSITIVLISTE) {
      assert.ok(lies(p.datei).includes(p.text), `tote Ausnahme: ${p.text}`);
      assert.ok(p.grund && p.grund.length > 10, 'Ausnahme ohne Begruendung: ' + p.text);
    }
  });

  it('VORPRUEFUNG: das Muster greift auf einen gesetzten Fall (nicht leer)', () => {
    const t = [
      'const a = L(\'Alle Decks im erwarteten Feld\', \'x\');',
      'const b = `Die Feldanteile kommen aus der Prognose`;',
      'const c = \'Listed in the field: \';',
      'const ok = \'metacall-field-group\'; const _feldTeilung = 1; // Feld im Kommentar',
    ].join('\n');
    const treffer = literale(t).filter((l) => VERBOTEN.some((v) => v.muster.test(l.text)));
    assert.equal(treffer.length, 3, 'das Muster erkennt die drei Fehler nicht (oder zu viele): ' + JSON.stringify(treffer));
  });
});
