# pocket_game8_decks.json — TESTDATEN, eingefroren am 29.09.2026

Byte-gleiche Kopie von `data/pocket_tierlist.json` in dem Stand, den Game8
am 28.09.2026 lieferte (Abruf 07:31 UTC): 34 Decks mit ihren **echten, in
Pocket gescannten** Scan-Codes (aus Game8s 2D-Mustern ausgelesen) und den
Kartenlisten der Deck-Seiten.

Seit dem Wechsel auf Limitless (29.09.2026) baut unser eigener Lauf die
Codes aus der Kennungstabelle — ein Vergleich mit ihnen bewiese nichts.
Diese Datei ist deshalb der Vorrat ECHTER Codes für:

- `tests/nebenbereiche/unit/test-qr-svg.js` und `tests/nebenbereiche/python/test_qr_svg.py`
  (unser QR-Zeichner),
- `tests/nebenbereiche/unit/test-pocket-deckcode.js` und
  `tests/nebenbereiche/python/test_pocket_limitless.py` (unsere Kodierer),
- die Gegenprobe in `scripts/build_pocket_karten_ids.py`.

Nicht ändern: sie ist ein Beleg, kein Datenstand.
