"""VP-01, Nachtrag 06.11.2026: jede Champions-Attacke hat einen deutschen Namen.

Champions Usage Refresh #146 — der erste Lauf nach PR #1020 — fiel in
test-zweisprachige-namen-und-schliessen.js rot: Vivillon (Fancy) fuehrte
„Poison Powder" mit 0,2 % in den Singles, und die Attacke hatte in keiner
Quelle einen deutschen Namen. Das Tor hielt daraufhin champions_usage.json
und champions_pokedex.json zurueck — der elfte Lauf in Folge ohne Daten.

Die bestehende Zusicherung prueft nur die BENUTZTEN Attacken, also erst
im naechtlichen Lauf, wenn ein Spieler die Attacke zum ersten Mal setzt.
Hier wird die ganze Attackenliste des Formats geprueft
(data/champions_move_flags.json, 513 Eintraege am 06.11.2026): eine
Attacke, die dort neu zuwaechst, macht den PR rot, nicht den Scrape-Lauf.

Fehlt ein Name: NICHT raten — pokewiki.de/<englischer Name> leitet auf
den deutschen Artikel weiter; Eintrag mit Quelle und Beleg in
data/champions_namen_entschieden.json, dann scripts/build_champions_pokedex.py.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _json(*teile):
    with open(os.path.join(ROOT, *teile), encoding="utf-8") as f:
        return json.load(f)


def test_jede_attacke_der_flags_tabelle_hat_einen_deutschen_namen():
    attacken = _json("data", "champions_move_flags.json")["attacken"]
    namen = _json("data", "champions_names_de.json")["moves"]
    fehlt = sorted(a for a in attacken if not str(namen.get(a) or "").strip())
    assert fehlt == [], (
        f"{len(fehlt)} von {len(attacken)} Attacken ohne deutschen Namen: {fehlt}. "
        "Der naechste Spieler, der eine davon setzt, macht den Scrape-Lauf rot "
        "und das Tor haelt alle Champions-Dateien zurueck (06.11.2026, Lauf #146)."
    )


def test_der_gemeldete_fall_steht_mit_quelle_in_der_entscheidungsdatei():
    ent = _json("data", "champions_namen_entschieden.json")["namen"]["moves"]
    for en, de in (("Poison Powder", "Giftpuder"), ("Frenzy Plant", "Flora-Statue")):
        assert ent.get(en, {}).get("de") == de, f"{en} fehlt in der Entscheidungsdatei"
        assert "pokewiki.de" in ent[en].get("quelle", ""), f"{en} ohne Quelle"
    namen = _json("data", "champions_names_de.json")["moves"]
    assert namen.get("Poison Powder") == "Giftpuder", (
        "Der Name steht nur in der Entscheidungsdatei, nicht in der ERZEUGTEN "
        "Tabelle — scripts/build_champions_pokedex.py nicht gelaufen?")
