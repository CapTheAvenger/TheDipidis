# -*- coding: utf-8 -*-
"""DIE POCKET-TIER-LISTE UND IHRE SCAN-CODES

ANLASS (04.09.2026)
-------------------
Betreiber: "ich würde gerne die Tier List von game8 übernehmen [...] ich
will den Scan Code haben um das Deck in Pocket einfach nachzubauen."

Game8 zeigt den Code NUR als QR-Bild auf ihrem Server — auf keiner
Deck-Seite steht ein abschreibbarer Text. scripts/scrape_pocket_tierlist.py
liest deshalb den Inhalt aus dem QR aus und legt IHN ab, damit die
Oberfläche den Code selbst rendern kann.

WARUM DIESE DATEI OHNE NETZ AUSKOMMT
------------------------------------
game8.co ist aus dem Bausandkasten nicht erreichbar (Egress-Proxy, 403).
Ein Parser, den nur CI prüfen kann, wird in der Praxis nicht geprüft —
also liegt in tests/fixtures/game8_pocket_tierlist.html ein Ausschnitt der
echten Seite, und der Parser läuft hier dagegen.

WAS GEPRÜFT WIRD
----------------
Die drei Stellen, an denen dieser Scraper still falsch werden kann:

  1. Die Stufe wird der falschen Zeile zugeordnet. Der Aufbau ist
     `<th>` mit der Stufe, dann `<td>` mit den Decks — wer das verwechselt,
     bekommt eine Liste, in der jedes Deck eine Stufe zu hoch steht.
  2. Der Parser liest `src` statt `data-src`. Game8 lädt verzögert; in
     `src` sitzt ein 1x1-Platzhalter. Das Ergebnis wäre kein Fehler,
     sondern ein leeres Bild.
  3. Die Gegenprobe fällt weg. Ein Code, der beim Neu-Erzeugen anders
     herauskommt, führt den Nutzer beim Scannen ins Leere — und niemand
     merkt, woran es lag.
"""

import importlib.util
import io
import json
import os
import re
import sys
import types

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "scrape_pocket_tierlist.py")
FIXTURE = os.path.join(WURZEL, "tests", "fixtures", "game8_pocket_tierlist.html")
DECKSEITE = os.path.join(WURZEL, "tests", "fixtures", "game8_pocket_deckseite.html")
AUSGABE_ECHT = os.path.join(WURZEL, "data", "pocket_tierlist.json")


def _modul():
    spec = importlib.util.spec_from_file_location("pocket_scraper", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope="module")
def mod():
    return _modul()


@pytest.fixture(scope="module")
def gelesen(mod):
    with io.open(FIXTURE, encoding="utf-8") as f:
        return mod.lies_seite(f.read())


# ── Der Parser ────────────────────────────────────────────────────────
#
# Alle Zusicherungen hier laufen gegen WORTGETREUE Ausschnitte der echten
# Game8-Seite. Der Vorgaenger dieser Datei prueft gegen einen Ausschnitt,
# den ich mir selbst zurechtgeschnitten hatte — und der belegte meine
# Annahme statt der Seite: er trennte beide Tabellen sauber, kannte
# keinen Apostroph-Fehler und nur ein Muster je Deck-Seite. Alle drei
# Annahmen waren falsch, und der erste echte Lauf am 04.09.2026 lieferte
# 24 Decks, von denen fuenf "Team Rocket" hiessen.

def test_beide_tabellen_werden_gefunden(gelesen):
    tier, set_decks = gelesen
    assert tier, ("keine Tier-Liste gelesen — ohne sie hat der Reiter "
                  "keinen Inhalt")
    assert set_decks, ("keine Set-Decks gelesen. Der Betreiber wollte "
                       "ausdruecklich beides: 'die Tier List [...] + die new "
                       "set xy Decks'")


def test_die_beiden_tabellen_sind_nicht_dieselbe(gelesen):
    """Der Fehler, der den ersten echten Lauf gekostet hat.

    Beide Suchen fanden die Set-Tabelle, weil die alte Regel ("irgendwo
    ein Tier-Abzeichen UND irgendwo ein th") auf beide zutrifft und die
    Set-Tabelle auf der Seite zuerst steht. Heraus kamen zweimal
    dieselben Zeilen.

    Unterschieden wird jetzt daran, WO das Abzeichen haengt: in der
    Tier-Tabelle im th (eines je Stufe), in der Set-Tabelle im td (eines
    je Deck).
    """
    tier, set_decks = gelesen
    assert [n for n, *_ in tier] != [n for n, *_ in set_decks], (
        "Tier-Liste und Set-Decks enthalten dieselben Zeilen — dann wurde "
        "zweimal dieselbe Tabelle gelesen")
    assert len(tier) > 15, (
        f"nur {len(tier)} Decks in der Tier-Liste — die echte Seite fuehrt "
        f"deutlich mehr; vermutlich wurde die falsche Tabelle erwischt")


def test_die_stufe_gehoert_zum_richtigen_deck(gelesen):
    """Der haeufigste stille Fehler bei so einer Tabelle.

    Der Aufbau ist <th> mit der Stufe, danach <td> mit den Decks. Wer die
    Zuordnung um eine Zeile verschiebt, bekommt eine Liste, die
    plausibel aussieht und in der jedes Deck falsch einsortiert ist.
    """
    tier, _ = gelesen
    nach_namen = {n: s for n, s, _a, _k, _ab in tier}
    assert nach_namen.get("Chien-Pao ex and Baxcalibur") == "S"
    assert nach_namen.get("Mega Altaria ex and PD Espeon") == "S"
    assert nach_namen.get("Hoopa ex and Darkrai ex") == "A+", (
        "A+ wurde nicht als eigene Stufe erkannt — die Stufen der Seite "
        "sind S, A+, A, B, C, D, und A+ ist nicht A")
    assert nach_namen.get("Flygon ex") == "C"


def test_die_stufen_stehen_in_der_reihenfolge_der_seite(gelesen):
    tier, _ = gelesen
    reihe = []
    for _n, st, _a, _k, _ab in tier:
        if not reihe or reihe[-1] != st:
            reihe.append(st)
    assert reihe == ["S", "A+", "A", "B", "C"], (
        f"die Stufen kommen in der Reihenfolge {reihe} — die Seite fuehrt "
        f"sie von stark nach schwach, und die Oberflaeche uebernimmt diese "
        f"Reihenfolge ungeprueft")


def test_das_wort_deck_faellt_aus_dem_namen(gelesen):
    tier, _ = gelesen
    mit = [n for n, _s, _a, _k, _ab in tier if n.endswith(" Deck")]
    assert not mit, (f"diese Namen tragen noch das angehaengte 'Deck': {mit}. "
                     f"Auf einer Kachel unter einem Deck-Symbol ist das Wort "
                     f"'Deck' Fuellung, keine Information")


def test_in_der_set_tabelle_traegt_jede_zelle_ihre_eigene_stufe(gelesen):
    """Die zweite Tabelle ist anders gebaut als die erste.

    Dort steht die Stufe NICHT in einer Kopfzeile darueber, sondern als
    Abzeichen in derselben Zelle wie das Deck. Wer nur die erste Bauart
    kennt, gibt allen Set-Decks die Stufe der letzten Kopfzeile.
    """
    _, set_decks = gelesen
    stufen = [s for _n, s, _a, _k, _ab in set_decks]
    assert stufen and all(stufen), "einem Set-Deck fehlt die Stufe"
    assert len(set(stufen)) > 1, (
        "alle Set-Decks haben dieselbe Stufe — dann ist die Zuordnung je "
        "Zelle verlorengegangen")


def test_die_archiv_nummer_wird_mitgelesen(gelesen):
    tier, _ = gelesen
    ohne = [n for n, _s, a, _k, _ab in tier if not (a or "").isdigit()]
    assert not ohne, (f"ohne Archivnummer laesst sich die Deck-Seite nicht "
                      f"aufrufen und der Scan-Code nicht holen: {ohne}")


def test_die_tier_liste_verlinkt_den_abschnitt_nicht_nur_die_seite(gelesen):
    """Ohne den Anker faellt die halbe Zuordnung zusammen.

    Eine Deck-Seite traegt mehrere Decks (597145 hat vier). Die
    Tier-Liste unterscheidet sie ueber `#hm_NNN`. Wer den Anker
    wegwirft, kann die Varianten nicht mehr auseinanderhalten und legt
    sie im Woerterbuch uebereinander.
    """
    tier, set_decks = gelesen
    ohne = [n for n, _s, _a, k, _ab in tier if not k]
    assert not ohne, (f"diese Tier-Eintraege kamen ohne Anker an: {ohne[:5]}")

    mehrfach = {}
    for _n, _s, a, _k, _ab in tier:
        mehrfach[a] = mehrfach.get(a, 0) + 1
    doppelt = {a: n for a, n in mehrfach.items() if n > 1}
    assert doppelt, (
        "keine einzige Archivnummer kommt zweimal vor — dann prueft dieser "
        "Test nichts. Auf der Seite vom 04.09.2026 fuehrten mehrere Seiten "
        "zwei Varianten (z. B. 597145, 562097, 613775)")

    # Und die Set-Tabelle verlinkt ohne Anker: dort ist die Seite gemeint.
    assert all(k is None for _n, _s, _a, k, _ab in set_decks), (
        "ein Set-Eintrag traegt einen Anker — dann stimmt die Annahme nicht "
        "mehr, dass dort die Seite als Ganzes gemeint ist")


def test_der_apostroph_fehler_von_game8_ist_im_ausschnitt_erhalten(gelesen):
    """Diese Zusicherung schuetzt den AUSSCHNITT, nicht den Parser.

    Game8 gibt den Apostroph als Anfuehrungszeichen aus:

        alt="Team Rocket" s articuno ex data-src="..."

    Das Attribut endet danach, und jeder regelkonforme Parser liest hier
    "Team Rocket". Wer den Ausschnitt irgendwann "aufraeumt", nimmt allen
    Zusicherungen rund um die Namensfindung die Grundlage — und der
    naechste Durchgang lernt die Lektion noch einmal.
    """
    roh = open(FIXTURE, encoding="utf-8").read()
    assert 'alt="Team Rocket" s ' in roh, (
        "der kaputte alt-Text ist aus dem Ausschnitt verschwunden. Er ist "
        "kein Schmutz, sondern der Befund")

    tier, set_decks = gelesen
    kurz = [n for n, *_ in tier + set_decks if n == "Team Rocket"]
    assert kurz, (
        "kein einziger Name kommt mehr abgeschnitten an — entweder ist der "
        "Ausschnitt begradigt worden, oder jemand hat versucht, den Namen "
        "aus dem alt-Text zu reparieren. Der richtige Weg ist die "
        "Ueberschrift auf der Deck-Seite")


# ── Die Deck-Seite: welches Muster gehoert zu welchem Deck ────────────

@pytest.fixture(scope="module")
def deckseite():
    with io.open(DECKSEITE, encoding="utf-8") as f:
        return f.read()


def test_eine_seite_traegt_mehrere_muster(mod, deckseite):
    """Der Befund, an dem "das erste Muster der Seite" zerbricht.

    Seite 597145 zeigt vier Muster — Greninja, EW Butterfree, Teal Mask
    Ogerpon ex, Pheromosa. Wer das erste nimmt, liefert fuer drei von
    vier Decks den Code eines FREMDEN Decks aus. Der Nutzer scannt,
    bekommt ein anderes Deck, und niemand merkt woran es lag.
    """
    abschnitte = mod.deck_abschnitte(deckseite)
    assert len(abschnitte) >= 3, (
        f"nur {len(abschnitte)} Muster gefunden — dann prueft dieser Test "
        f"den Mehrfachfall nicht")
    adressen = [a for _n, a in abschnitte]
    assert len(set(adressen)) == len(adressen), (
        "zwei Abschnitte zeigen auf dasselbe Bild — dann ist die Zuordnung "
        "verrutscht")


# ── Die Kartenliste (ab 07.09.2026) ───────────────────────────────────


def test_zu_jedem_muster_steht_eine_kartenliste(mod, deckseite):
    """Die Liste steht im Fließtext derselben Seite, die schon geholt ist.

    Bis zum 07.09.2026 hat der Lauf sie weggeworfen. Gemessen am
    Ausschnitt: alle vier Abschnitte tragen genau 20 Karten — die
    Deckgroesse in Pocket.
    """
    for name, adr in mod.deck_abschnitte(deckseite):
        karten = mod.karten_zum_muster(deckseite, adr)
        assert karten, f"zu '{name}' wurde keine Kartenliste gefunden"
        gesamt = sum(k["anzahl"] for k in karten)
        assert gesamt == 20, (
            f"'{name}' ergibt {gesamt} Karten statt 20 — dann liest der "
            f"Parser Zellen mit, die nicht zum Deck gehoeren, oder er "
            f"verliert welche")


def test_eine_karte_traegt_namen_anzahl_und_setnummer(mod, deckseite):
    _n, adr = mod.deck_abschnitte(deckseite)[0]
    erste = mod.karten_zum_muster(deckseite, adr)[0]
    assert erste == {"name": "Froakie", "anzahl": 1, "set": "A1", "nummer": "087"}, (
        f"die erste Karte kam als {erste!r} an")


def test_ein_setkuerzel_mit_bindestrich_geht_nicht_verloren(mod, deckseite):
    """BEFUND 07.09.2026, am echten Lauf gemessen.

    Mit `[A-Za-z0-9]+` als Kuerzel blieben 66 Karteneintraege ohne
    Setnummer — alle aus dem Promo-Set **P-A**. Der Ausdruck brach am
    Bindestrich ab und lieferte `set: null`, ohne Meldung. Genau diese
    Karten stehen fast in jedem Deck (Poke Ball, Professor's Research).
    """
    karten = [k for _n, adr in mod.deck_abschnitte(deckseite)
              for k in mod.karten_zum_muster(deckseite, adr)]
    ohne = [k["name"] for k in karten if not k["set"]]
    assert not ohne, f"{len(ohne)} Karten ohne Setnummer: {sorted(set(ohne))}"
    promo = {k["set"] for k in karten if k["set"] and "-" in k["set"]}
    assert promo, (
        "im Ausschnitt kommt kein Kuerzel mit Bindestrich mehr vor — dann "
        "prueft dieser Test nichts mehr und der Ausschnitt gehoert erneuert")


def test_ein_unbekanntes_muster_liefert_keine_fremde_liste(mod, deckseite):
    """Sonst bekaeme ein Deck die Karten eines anderen."""
    assert mod.karten_zum_muster(deckseite, "https://img.game8.co/gibtsnicht.png") == []


def test_der_scan_code_nennt_die_trennstelle_und_sie_geht_auf(mod, deckseite):
    """Die einzige Pruefung hier, in der Game8s eigene Angaben vorkommen.

    Die Kartenzahlen stehen im Fließtext, die Aufteilung in Pokémon und
    Trainer steckt im Muster. Zwei getrennte Wege. `probe()` kann das
    nicht: dort kommt Game8s Bild ueberhaupt nicht vor.

    Gemessen: von den vier Abschnitten des Ausschnitts stehen drei auch
    in der ausgelieferten Datei; bei allen drei geht die Trennstelle auf.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = {d["name"]: d for d in json.load(f)["decks"]}
    geprueft = 0
    for name, adr in mod.deck_abschnitte(deckseite):
        if name not in decks:
            continue
        karten = mod.karten_zum_muster(deckseite, adr)
        pokemon, trainer, grund = mod.teile_karten(karten, decks[name]["code"])
        assert grund is None, f"'{name}': {grund}"
        assert sum(k["anzahl"] for k in pokemon) + sum(k["anzahl"] for k in trainer) == 20
        geprueft += 1
    assert geprueft >= 3, (
        f"nur {geprueft} Abschnitte des Ausschnitts stehen noch in der Datei — "
        f"dann prueft dieser Test kaum etwas")


def test_eine_liste_mit_falscher_kartenzahl_wird_abgelehnt(mod, deckseite):
    """Die Gegenprobe: sonst prueft die Trennung nur, dass sie nie meckert.

    Abgelehnt wird zuverlaessig nur, was in der SUMME nicht passt — und
    genau das ist der Fall, den ein verrutschter Parser erzeugt.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = {d["name"]: d for d in json.load(f)["decks"]}
    name, adr = next((n, a) for n, a in mod.deck_abschnitte(deckseite) if n in decks)
    karten = mod.karten_zum_muster(deckseite, adr)
    _p, _t, grund = mod.teile_karten(karten + [{"name": "Zuviel", "anzahl": 1}],
                                     decks[name]["code"])
    assert grund and "21" in grund, (
        f"eine Liste mit 21 Karten wurde gegen einen 20er-Code angenommen: {grund}")


def test_die_trennstelle_liegt_dort_wo_der_code_sie_nennt(mod, deckseite):
    """Nicht nur "es geht auf", sondern WO es aufgeht.

    Ohne diesen Fall bliebe eine Trennung bei der ersten Karte
    unbemerkt: die Summe stimmte weiter, `grund` bliebe None, und die
    Oberflaeche zeigte 1 Pokémon und 19 Trainer. Die Mutationsprobe am
    07.09.2026 hat genau das ueberlebt.

    Das Deck heisst "… and 18 Trainers" — die Zahl steht im Namen.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = {d["name"]: d for d in json.load(f)["decks"]}
    name = "Team Rocket's Articuno ex and 18 Trainers"
    adr = next(a for n, a in mod.deck_abschnitte(deckseite) if n == name)
    pokemon, trainer, grund = mod.teile_karten(
        mod.karten_zum_muster(deckseite, adr), decks[name]["code"])
    assert grund is None, grund
    assert sum(k["anzahl"] for k in pokemon) == 2, (
        f"{sum(k['anzahl'] for k in pokemon)} Pokémon statt 2: "
        f"{[k['name'] for k in pokemon]}")
    assert sum(k["anzahl"] for k in trainer) == 18, (
        f"{sum(k['anzahl'] for k in trainer)} Trainer statt 18 — "
        f"und im Namen des Decks steht 18")
    assert [k["name"] for k in pokemon] == ["Team Rocket's Articuno ex"]

    # ZWEITER ZEUGE, UND ER IST DER EIGENTLICHE.
    # Beim Articuno-Deck steht die einzige Pokémon-Karte zweimal drin —
    # die Trennstelle faellt dort schon nach der ERSTEN Zeile. Eine
    # Trennung, die immer nach der ersten Zeile schneidet, kaeme damit
    # durch (Mutationsprobe 07.09.2026, ueberlebt). Dieses Deck hier
    # trennt erst nach der siebten Zeile.
    name2 = "Mega Sceptile ex and Greninja"
    adr2 = next(a for n, a in mod.deck_abschnitte(deckseite) if n == name2)
    pk2, tr2, grund2 = mod.teile_karten(
        mod.karten_zum_muster(deckseite, adr2), decks[name2]["code"])
    assert grund2 is None, grund2
    assert len(pk2) == 7 and sum(k["anzahl"] for k in pk2) == 8, (
        f"{len(pk2)} Zeilen / {sum(k['anzahl'] for k in pk2)} Pokémon statt "
        f"7 / 8: {[k['name'] for k in pk2]}")
    assert sum(k["anzahl"] for k in tr2) == 12
    assert pk2[-1]["name"] == "Furfrou" and tr2[0]["name"] == "Cyrus", (
        f"die Trennstelle liegt woanders: ... {pk2[-1]['name']} | "
        f"{tr2[0]['name']} ...")


def test_der_lauf_haengt_die_kartenliste_ans_deck(mod, monkeypatch, deckseite):
    """Die Verdrahtung, nicht nur die Funktion.

    Die Mutationsprobe am 07.09.2026 hat `karten_zum_muster(...)` in
    `sammle` durch `[]` ersetzt — und alle Zusicherungen blieben gruen,
    weil sie die fertige Datei lasen statt den Lauf. Die Datei stammt
    aber aus einem frueheren Lauf; sie beweist nichts ueber den heutigen
    Code.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = {d["name"]: d for d in json.load(f)["decks"]}
    name = "Team Rocket's Articuno ex and 18 Trainers"
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": deckseite})
    _verkabelt(mod, monkeypatch, netz, code=decks[name]["code"])
    fertig, ausfaelle, _v, _z = mod.sammle([(name, "B", "9", None, "")], [], still=True)
    assert fertig, f"kein Deck durchgekommen: {ausfaelle}"
    d = fertig[0]
    assert d.get("pokemon") and d.get("trainer"), (
        f"der Lauf hat keine Kartenliste ans Deck gehaengt: "
        f"{sorted(d)} / Hinweis: {d.get('karten_hinweis')!r}")
    assert sum(k["anzahl"] for k in d["pokemon"] + d["trainer"]) == 20
    assert d["pokemon"][0]["set"] == "B4a", (
        f"die Setnummer fehlt oder ist falsch: {d['pokemon'][0]!r}")


def test_eine_trennstelle_zwischen_zwei_karten_wird_abgelehnt(mod, deckseite):
    """Die Trennstelle muss GENAU auf eine Kartengrenze fallen.

    Mutationsprobe der Abnahme am 07.09.2026: `lauf == n_pokemon` durch
    `lauf >= n_pokemon` zu ersetzen ueberlebte beide Suiten. Mit `>=`
    schneidet die Trennung beim ersten Ueberschreiten — die Zahl der
    Pokémon stimmt dann nicht mehr, und die Oberflaeche zeigt Trainer
    unter Pokémon.

    Der Fall wird hier gebaut, nicht gesucht: zwei Pokémon-Zeilen
    werden zu einer zusammengefasst. Die Summe bleibt 20, aber die
    Grenze, die der Code nennt, liegt jetzt MITTEN in einer Zeile.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = {d["name"]: d for d in json.load(f)["decks"] if d.get("pokemon")}
    name = "Mega Sceptile ex and Greninja"
    if name not in decks:
        pytest.skip(f"'{name}' steht nicht mehr in der Datei")
    d = decks[name]
    pokemon = [dict(k) for k in d["pokemon"]]
    trainer = [dict(k) for k in d["trainer"]]
    assert pokemon and trainer
    # Die LETZTE Pokémon-Zeile mit der ERSTEN Trainer-Zeile verschmelzen.
    # Zwei Pokémon-Zeilen zusammenzulegen genuegt nicht: die Grenze
    # laege danach immer noch am Ende der verschmolzenen Zeile.
    letzte = pokemon.pop()
    trainer[0] = dict(trainer[0],
                      name=letzte["name"] + "+" + trainer[0]["name"],
                      anzahl=letzte["anzahl"] + trainer[0]["anzahl"])
    karten = pokemon + trainer
    assert sum(k["anzahl"] for k in karten) == 20, "die Probe hat die Summe verschoben"
    _p, _t, grund = mod.teile_karten(karten, d["code"])
    assert grund and "Kartengrenze" in grund, (
        f"eine Trennstelle mitten in einer Zeile wurde angenommen: {grund!r}")


def test_eine_quote_unter_zwei_dritteln_bricht_ab(mod, monkeypatch):
    """Die 66-%-Schwelle, im Band zwischen den beiden anderen Riegeln.

    Mutationsprobe 07.09.2026: die Schwelle abzuschalten ueberlebte
    beide Suiten. Der vorhandene Fall (3 von 49) faellt naemlich schon
    durch die ZWEITE Bremse (`len(fertig) < versucht * 0.3`) — er prueft
    die 66 % gar nicht mit.

    Hier: 25 von 52 gelesen. Das sind 48 % — ueber der 30-%-Bremse und
    unter zwei Dritteln. Nur die 66-%-Schwelle kann das fangen.
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(52)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(25)]
    ausfaelle = [(f"D{i}", "HTTP 202") for i in range(25, 52)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, ausfaelle, [])
    assert rc == 1, (
        f"25 von 52 Decks gelesen (48 %) und der Lauf meldet Erfolg ({rc}) — "
        f"die Schwelle von zwei Dritteln greift nicht")
    assert not geschrieben


def test_die_trennung_allein_beweist_nicht_dass_der_code_zum_deck_gehoert(mod):
    """Festhalten, was die Pruefung NICHT kann — damit es niemand behauptet.

    Der Entwurf vom 07.09.2026 hat sie als "die nicht-zirkulaere
    Pruefung" verkauft. Nachgemessen ueber alle 33 x 32 Paarungen:
    **74,1 % der fremden Codes werden angenommen**. Dieser Test ist
    bewusst herum — er verlangt, dass mindestens die Haelfte durchgeht.
    Faellt er eines Tages um, ist die Pruefung schaerfer geworden, und
    dann muessen `_meta.karten_hinweis` und der Docstring nachgezogen
    werden, statt eine ueberholte Zahl weiterzutragen.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = [d for d in json.load(f)["decks"] if d.get("pokemon")]
    paare = durch = 0
    for a in decks:
        karten = a["pokemon"] + a["trainer"]
        for b in decks:
            if b is a:
                continue
            paare += 1
            if mod.teile_karten(karten, b["code"])[2] is None:
                durch += 1
    assert paare > 500, f"zu wenige Paarungen fuer eine Aussage: {paare}"
    assert durch / paare > 0.5, (
        f"nur {durch}/{paare} fremde Codes gehen durch ({durch/paare:.1%}) — die "
        f"Pruefung ist schaerfer geworden als die Zahl, die in _meta und im "
        f"Docstring steht")


def test_die_vielfachheiten_sind_die_schaerfere_angabe(mod):
    """Und sie ist eine ANGABE, keine Sperre.

    Gemessen am 07.09.2026: das eigene Deck besteht sie bei 32 von 33,
    ein fremder Code bei 21 von 1056 (2,0 %). Der eine Ausreisser ist
    erklaerbar — Game8 fasst zwei Drucke derselben Karte in einer Zeile
    zusammen, der Code unterscheidet sie.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        decks = [d for d in json.load(f)["decks"] if d.get("pokemon")]
    eigen = sum(1 for d in decks
                if mod.abgleich_vielfachheiten(d["pokemon"], d["trainer"],
                                               d["code"]) is None)
    assert eigen >= len(decks) - 2, (
        f"nur {eigen} von {len(decks)} eigenen Decks bestehen den strengen "
        f"Abgleich — das waere ein Datenbefund, kein Rundungsfehler")
    # ZWEI WEGE, UND NUR EINER ZAEHLT.
    #
    # Die erste Fassung dieses Tests hat die richtige Trennung des Decks
    # behalten und nur den Code ausgetauscht — 2,0 %. Diese Information
    # hat der Lauf aber nicht: `sammle` trennt die Karten mit
    # `teile_karten` nach DEMSELBEN Code, der danach geprueft wird. Auf
    # diesem Weg sind es 11,1 %, also 5,6-mal so viel. Die unabhaengige
    # Abnahme am 07.09.2026 hat das nachgerechnet; hier steht jetzt der
    # Produktivwert, und der ideale daneben, damit niemand ihn wieder
    # verwechselt.
    paare = durch_lauf = durch_ideal = 0
    for a in decks:
        karten = a["pokemon"] + a["trainer"]
        for b in decks:
            if b is a:
                continue
            paare += 1
            pk, tr, grund = mod.teile_karten(karten, b["code"])
            if grund is None and mod.abgleich_vielfachheiten(pk, tr, b["code"]) is None:
                durch_lauf += 1
            if mod.abgleich_vielfachheiten(a["pokemon"], a["trainer"],
                                           b["code"]) is None:
                durch_ideal += 1
    assert durch_lauf / paare < 0.20, (
        f"der strenge Abgleich laesst auf dem Weg des Laufs {durch_lauf}/{paare} "
        f"fremde Codes durch ({durch_lauf/paare:.1%}) — dann ist er nicht mehr "
        f"schaerfer als die Trennung (74 %)")
    assert durch_lauf > durch_ideal, (
        f"der Produktivweg ({durch_lauf}) laesst nicht mehr durch als der ideale "
        f"({durch_ideal}) — dann misst dieser Test die Verwechslung nicht mehr, "
        f"die die Abnahme gefunden hat, und die Zahlen in _meta und im Docstring "
        f"gehoeren geprueft")

    # Und die Zahl in der ausgelieferten Datei muss die des Laufs sein.
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        hinweis = json.load(f)["_meta"].get("karten_hinweis", "")
    assert "11,1" in hinweis or "11.1" in hinweis, (
        "_meta.karten_hinweis nennt nicht den Produktivwert — dort stand am "
        "07.09.2026 die um 5,6-fach zu guenstige Zahl 2 %")


def test_ein_deck_ohne_strengen_abgleich_traegt_den_grund(mod):
    """Wer die Angabe still weglaesst, macht aus 32 von 33 eine 33."""
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        daten = json.load(f)
    streng = daten["_meta"]["uebersicht"].get("kartenliste_streng")
    gezaehlt = sum(1 for d in daten["decks"]
                   if d.get("pokemon") and not d.get("karten_abgleich"))
    assert streng == gezaehlt, (
        f"_meta sagt {streng} streng geprueft, gezaehlt sind es {gezaehlt}")
    for d in daten["decks"]:
        if d.get("pokemon") and d.get("karten_abgleich"):
            assert len(d["karten_abgleich"]) > 20, (
                f"{d['name']}: der Grund ist zu duenn, um ihn zu beurteilen: "
                f"{d['karten_abgleich']!r}")


def test_ein_unbrauchbarer_code_teilt_nicht(mod):
    _p, _t, grund = mod.teile_karten([{"name": "X", "anzahl": 20}], "kein base64!!")
    assert grund and "Aufbau" in grund


def test_die_ausgelieferten_decks_tragen_stimmige_kartenlisten(mod):
    """Am ECHTEN Auslieferungsstand, nicht am Ausschnitt.

    Ein Deck darf ohne Liste ausgeliefert werden — der Scan-Code ist das
    Hauptstueck. Aber wenn eine Liste da ist, muss sie aufgehen, und
    wenn keine da ist, muss der Grund danebenstehen.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        daten = json.load(f)
    fehler = []
    mit = 0
    for d in daten["decks"]:
        if d.get("pokemon") or d.get("trainer"):
            mit += 1
            stueck = sum(k["anzahl"] for k in d["pokemon"] + d["trainer"])
            if stueck != 20:
                fehler.append(f"{d['name']}: {stueck} Karten statt 20")
            for k in d["pokemon"] + d["trainer"]:
                if not k.get("name") or not k.get("anzahl"):
                    fehler.append(f"{d['name']}: unvollstaendige Karte {k!r}")
        elif not d.get("karten_hinweis"):
            fehler.append(f"{d['name']}: keine Liste und kein Grund dafuer")
    assert not fehler, "\n".join(fehler)
    assert daten["_meta"]["uebersicht"]["mit_kartenliste"] == mit, (
        f"_meta sagt {daten['_meta']['uebersicht']['mit_kartenliste']} Decks mit "
        f"Liste, gezaehlt sind es {mit}")


def test_der_name_kommt_aus_der_ueberschrift_und_ueberlebt_den_apostroph(mod, deckseite):
    namen = [n for n, _a in mod.deck_abschnitte(deckseite)]
    assert "Team Rocket's Articuno ex and 18 Trainers" in namen, (
        f"der Apostroph-Name kam nicht heil an: {namen}. Aus dem alt-Text "
        f"ist er nicht zu holen — er steht in der Ueberschrift, und die ist "
        f"Elementtext")
    assert not [n for n in namen if "&#" in n], (
        f"in einem Namen steht noch eine HTML-Entitaet: {namen}. So stuende "
        f"sie auch auf der Kachel")
    assert not [n for n in namen if n.endswith(" Deck")], (
        f"ein Name traegt noch das angehaengte 'Deck': {namen}")


def test_jeder_anker_benennt_seine_EIGENE_ueberschrift(mod, deckseite):
    """Die Zusicherung, die am 04.09.2026 gefehlt hat.

    `name_zum_anker` suchte die Überschrift NACH VORN ab der Fundstelle
    der id. Game8 hängt die id aber an die Überschrift selbst:

        <h3 class='a-header--3' id='hm_104'>Mega Altaria ex … Deck</h3>

    Die Fundstelle liegt damit MITTEN im öffnenden Tag, das `<h3` davor.
    Gefunden wurde deshalb immer die NÄCHSTE Überschrift, und jeder
    Anker lieferte den Namen des Decks danach.

    In der ausgelieferten Datei trugen dadurch 15 von 24 Tier-Einträgen
    Namen und Code des Nachbardecks. Kein Test hat es bemerkt — der
    damalige Test hier trug den Versatz sogar als SOLLWERT ein:

        assert name_zum_anker(deckseite, "hm_103") == "… EW Butterfree"

    während hm_103 in Wahrheit Greninja ist. Ein Test, der aus dem Code
    abgeschrieben wird statt aus der Quelle, schreibt den Fehler fest.

    Deshalb steht hier keine Liste von Sollwerten mehr, sondern die
    Regel: JEDE Überschrift mit id muss unter genau dieser id gefunden
    werden. Die Wahrheit wird aus dem Ausschnitt gelesen, nicht aus dem
    Gedächtnis.
    """
    import html as _html
    treffer = list(re.finditer(
        r"<h([2-4])[^>]*id=['\"](hm_\d+)['\"][^>]*>(.*?)</h\1>", deckseite, re.S))
    assert len(treffer) >= 3, (
        f"nur {len(treffer)} Überschriften mit Anker im Ausschnitt — dann "
        f"prüft dieser Test zu wenig")

    for m in treffer:
        anker = m.group(2)
        echt = _html.unescape(re.sub(r"<[^>]+>", "", m.group(3)))
        echt = re.sub(r"\s*Deck$", "", re.sub(r"\s+", " ", echt).strip()).strip()
        assert mod.name_zum_anker(deckseite, anker) == echt, (
            f"{anker} traegt im Ausschnitt die Ueberschrift {echt!r}, "
            f"name_zum_anker sagt aber "
            f"{mod.name_zum_anker(deckseite, anker)!r}. Genau dieser Versatz "
            f"hat 15 von 24 Tier-Eintraegen das falsche Deck zugeordnet")


def test_ein_unbekannter_anker_liefert_keinen_namen(mod, deckseite):
    assert mod.name_zum_anker(deckseite, "hm_999") is None, (
        "ein unbekannter Anker liefert einen Namen — dann wird geraten")
    assert mod.name_zum_anker(deckseite, None) is None


def test_zum_anker_gehoert_das_richtige_muster(mod, deckseite):
    """Die Zusage, um die es am Ende geht."""
    name, adresse, grund = mod.waehle_abschnitt(deckseite, "hm_103", "Mega Sceptile ex")
    assert name == "Mega Sceptile ex and Greninja", grund
    alle = dict(mod.deck_abschnitte(deckseite))
    assert adresse == alle[name], (
        "der Anker fuehrt zum Namen des einen und zum Bild des anderen Decks")

    andere = mod.waehle_abschnitt(deckseite, "hm_102", "Mega Sceptile ex")
    assert andere[1] != adresse, (
        "zwei verschiedene Anker liefern dasselbe Muster — dann wirkt der "
        "Anker nicht")


def test_ein_mehrdeutiger_name_mit_anker_wird_gemeldet_statt_geraten(mod, deckseite):
    """"Team Rocket" passt auf mehrere Decks — dann lieber kein Code."""
    name, adresse, grund = mod.waehle_abschnitt(deckseite, "hm_777", "Mega Sceptile ex")
    assert adresse is None, (
        f"ein Eintrag mit unbrauchbarem Anker und mehrdeutigem Namen bekommt "
        f"trotzdem einen Code ({name}) — das ist die Bauart, bei der der "
        f"Nutzer ein fremdes Deck scannt")
    assert grund and "passt auf 3 Decks" in grund, (
        f"der Grund nennt nicht, WORAN es lag: {grund}. Eine Meldung ohne "
        f"Ursache kostet beim naechsten Mal denselben Durchgang noch einmal")


def test_ohne_anker_gilt_das_erste_muster_der_seite(mod, deckseite):
    """Die Set-Tabelle verlinkt Seiten, keine Abschnitte.

    Hier wird bewusst das erste Muster genommen — und das ist kein Raten,
    weil der NAME aus demselben Abschnitt kommt. Auf der Kachel steht
    also genau das Deck, dessen Muster darunter liegt.
    """
    name, adresse, _grund = mod.waehle_abschnitt(deckseite, None, "Mega Sceptile ex")
    erste = mod.deck_abschnitte(deckseite)[0]
    assert (name, adresse) == erste, (
        "ohne Anker wird nicht das erste Muster genommen — dann bekommen die "
        "Set-Decks einen Code, den niemand vorhergesagt hat")


# ── Das verzoegerte Laden ─────────────────────────────────────────────

def test_der_qr_kommt_aus_data_src_nicht_aus_src(mod, deckseite):
    """Game8 laedt Bilder verzoegert.

    In `src` sitzt ein 1x1-Platzhalter als Daten-URL, die echte Adresse
    steht in `data-src`. Wer `src` liest, bekommt kein Bild und keinen
    Fehler — nur ein leeres Ergebnis.
    """
    adressen = [a for _n, a in mod.deck_abschnitte(deckseite)]
    assert adressen, "keine Adresse gelesen"
    assert not [a for a in adressen if a.startswith("data:")], (
        f"der Parser nimmt den Platzhalter statt der echten Adresse: "
        f"{[a for a in adressen if a.startswith('data:')][:1]}")
    assert all(a.startswith("https://img.game8.co/") for a in adressen), (
        f"eine Adresse zeigt nicht auf Game8s Bildserver: {adressen}")


def test_ohne_muster_auf_der_seite_gibt_es_keine_erfundene_adresse(mod):
    seite = "<h2>Foo Deck</h2><img alt='irgendein Bild' data-src='x.png'>"
    assert mod.deck_abschnitte(seite) == [], (
        "der Parser findet ein Muster auf einer Seite ohne 2D-Muster — dann "
        "laedt der Scraper irgendein Bild und sucht einen QR darin")
    name, adresse, grund = mod.waehle_abschnitt(seite, None, "Foo")
    assert adresse is None and grund, (
        "eine Seite ohne Muster liefert trotzdem eine Adresse")


def test_es_gibt_keine_zweite_lockerere_zuordnung_mehr(mod):
    """Toter Code mit einer weicheren Regel ist eine Falle.

    `qr_adresse()` wurde von niemandem mehr gerufen, kannte aber weder
    den Anker noch die Mehrdeutigkeitspruefung — ihr Namensvergleich war
    beidseitig. Wer sie eines Tages wieder in den Lauf genommen haette,
    bekaeme bei "Team Rocket" das erstbeste Deck. Die Abnahme am
    04.09.2026 hat sie deshalb als Falle benannt; sie ist entfernt.
    """
    assert not hasattr(mod, "qr_adresse"), (
        "qr_adresse ist zurueck. Es darf genau EINEN Weg geben, auf dem ein "
        "Deck seinem Muster zugeordnet wird, und das ist waehle_abschnitt")


# ── Die Gegenprobe ────────────────────────────────────────────────────

QR_BIBLIOTHEKEN = ("segno", "zxingcpp", "PIL")


def _qr_noetig():
    """Die Proben unten brauchen die QR-Bibliotheken.

    ANLASS (04.09.2026, roter Deploy). Sie standen ohne Weiche da und
    liefen hier durch, weil die Bibliotheken im Bausandkasten
    installiert sind. Der Testschritt in deploy-pages.yml installiert
    dagegen nur pytest, beautifulsoup4, requests und lxml — dort fiel
    der erste Import mit ModuleNotFoundError um, `build` und `deploy`
    wurden uebersprungen, und die Seite hing.

    Uebersprungen zu werden ist aber die ZWEITBESTE Loesung: die
    Gegenprobe ist die ganze Sicherheit hinter den Scan-Codes, und ein
    stiller Uebersprung waere so gut wie keine Pruefung. Deshalb steht
    unten test_der_testschritt_installiert_die_qr_bibliotheken und
    verlangt, dass sie in CI tatsaechlich LAUFEN.
    """
    for name in QR_BIBLIOTHEKEN:
        pytest.importorskip(
            name,
            reason=f"{name} fehlt — die QR-Gegenprobe kann hier nicht laufen")


def test_die_gegenprobe_besteht_fuer_echte_inhalte(mod):
    """Auslesen, neu erzeugen, wieder auslesen — dasselbe?"""
    _qr_noetig()
    for inhalt in ["https://ptcgp.example/d?x=AB12",
                   "PTCGP1|A1-234,A2b-011|x2y3",
                   "".join(chr(65 + i % 26) for i in range(180))]:
        assert mod.probe(inhalt), (
            f"ein Inhalt von {len(inhalt)} Zeichen ueberlebt das Neu-Erzeugen "
            f"nicht — dann waere der Code auf unserer Seite ein anderer als "
            f"der bei Game8")


def test_die_gegenprobe_bemerkt_einen_unterschied(mod):
    """Die Gegenprobe braucht ihre eigene Gegenprobe.

    BEFUND beim Mutationslauf am 04.09.2026: schrieb man die Probe von
    "Inhalt ist gleich" auf "irgendein Code ist lesbar" um, blieb die
    ganze Datei gruen. Eine Pruefung, die nie fehlschlagen kann, ist
    keine Pruefung.

    Hier bekommt sie deshalb eine Erzeugung untergeschoben, die
    absichtlich ein Zeichen mehr kodiert. Wer den Vergleich entfernt,
    faellt hier um.
    """
    _qr_noetig()
    import segno

    def verfaelscht(inhalt, **kw):
        return segno.make(inhalt + "X", **kw)

    echt = "PTCGP1|A1-234,A2b-011|x2y3"
    assert mod.probe(echt) is True, "die Probe scheitert schon am echten Fall"
    assert mod.probe(echt, erzeuge=verfaelscht) is False, (
        "die Probe meldet Erfolg, obwohl das erzeugte Bild einen ANDEREN "
        "Inhalt traegt. Genau dieser Fall ist der Grund, aus dem es sie "
        "gibt: ein Code, der beim Rendern zu etwas anderem wird, fuehrt "
        "den Nutzer beim Scannen ins Leere")


def test_die_gegenprobe_ist_im_lauf_verdrahtet():
    """Eine Pruefung, die niemand aufruft, ist eine Funktion.

    Der Wert dieses Scrapers haengt daran, dass KEIN ungeprueftes Muster
    in die Datei kommt: ein Code, der beim Rendern zu etwas anderem wird,
    fuehrt den Nutzer beim Scannen ins Leere.
    """
    quelle = open(SKRIPT, encoding="utf-8").read()
    i = quelle.index("def sammle(")
    j = quelle.index("def main(")
    rumpf = quelle[i:j]
    assert "probe(" in rumpf, "sammle() ruft die Gegenprobe nicht auf"
    assert "continue" in rumpf.split("probe(")[1][:300], (
        "die Gegenprobe wird aufgerufen, aber ihr Ergebnis aendert nichts — "
        "ein durchgefallener Code kaeme trotzdem in die Datei")


def test_ein_leeres_ergebnis_ist_kein_erfolg():
    """Dieselbe Hausregel wie bei den anderen Scrapern (Befund S6).

    Ein Lauf, der null Codes liest und trotzdem gruen meldet, schreibt
    beim naechsten Mal eine leere Datei ueber eine volle.
    """
    quelle = open(SKRIPT, encoding="utf-8").read()
    assert "::error::" in quelle, "der Scraper meldet keinen Fehler nach aussen"
    assert "kein einziger Scan-Code" in quelle, (
        "der Zweig fuer 'nichts gelesen' ist weg — dann meldet ein "
        "vollstaendig fehlgeschlagener Lauf Erfolg")


# ── Was in der Ausgabe stehen muss ────────────────────────────────────

def test_die_quelle_wird_angeschrieben():
    """Die Tier-Einstufung ist Game8s Einschaetzung, nicht unsere Messung.

    Diese Seite schreibt sonst jede Zahl ihrer Quelle zu. Eine fremde
    redaktionelle Bewertung ohne Herkunft zu zeigen waere ein Rueckschritt
    hinter den eigenen Anspruch.
    """
    quelle = open(SKRIPT, encoding="utf-8").read()
    for feld in ["quelle", "quelle_url", "quelle_hinweis", "abgerufen"]:
        assert f'"{feld}"' in quelle, (
            f"das Feld {feld} fehlt in der Ausgabe — die Oberflaeche kann "
            f"die Herkunft dann nicht anschreiben")
    assert "game8.co" in quelle
    assert "redaktionelle" in quelle, (
        "der Hinweis, dass die Einstufung eine fremde Einschaetzung ist "
        "und keine gemessene Zahl, steht nicht mehr in der Ausgabe")


def test_die_ausfaelle_stehen_in_der_datei_nicht_nur_im_log():
    """Report, don't silently repair.

    Ein Deck ohne lesbaren Code faellt aus der Liste. Stuende das nur im
    Lauf-Protokoll, waere die Luecke auf der Seite unsichtbar.
    """
    quelle = open(SKRIPT, encoding="utf-8").read()
    assert '"ohne_code"' in quelle, (
        "die durchgefallenen Decks werden nicht mit ausgegeben — dann sieht "
        "niemand, dass die Liste unvollstaendig ist")


def test_der_scraper_ist_hoeflich():
    """Game8 schuldet uns nichts.

    Fuenfzig Deck-Seiten im Millisekundentakt sind eine Last fuer eine
    fremde Seite; im Sekundentakt sind sie es nicht.
    """
    quelle = open(SKRIPT, encoding="utf-8").read()
    assert "PAUSE_S" in quelle, "die Pause zwischen zwei Abrufen ist weg"
    i = quelle.index("PAUSE_S =")
    wert = float(quelle[i:].split("=")[1].split("#")[0].strip().split()[0])
    assert wert >= 0.5, (
        f"die Pause steht auf {wert} s — das ist kein Abruf mehr, das ist "
        f"ein Sturmlauf auf eine fremde Seite")
    assert "time.sleep(PAUSE_S)" in quelle, "die Pause wird nirgends genommen"


# ── Die ausgelieferte Datei, sobald es sie gibt ───────────────────────

AUSGABE = os.path.join(WURZEL, "data", "pocket_tierlist.json")


@pytest.mark.skipif(not os.path.exists(AUSGABE),
                    reason="data/pocket_tierlist.json gibt es noch nicht — "
                           "der erste CI-Lauf steht aus")
def test_jedes_deck_in_der_datei_hat_einen_code():
    with io.open(AUSGABE, encoding="utf-8") as f:
        d = json.load(f)
    ohne = [x.get("name") for x in d.get("decks", []) if not x.get("code")]
    assert not ohne, (
        f"diese Decks stehen ohne Scan-Code in der Datei: {ohne}. Ein Deck "
        f"ohne Code hat auf dem Reiter nichts zu suchen — der Code IST der "
        f"Zweck")


def test_die_abhaengigkeiten_stehen_in_requirements():
    """Sonst faellt der erste CI-Lauf mit einem ImportError um.

    Der Scraper importiert zxingcpp und segno erst INNERHALB der
    Funktionen — das haelt den Modulimport leicht und macht diese Datei
    ohne die Bibliotheken lauffaehig. Der Preis dafuer ist, dass ein
    fehlender Eintrag in requirements.txt hier nicht auffaellt, sondern
    erst mitten im Lauf auf dem Github-Laeufer.
    """
    req = open(os.path.join(WURZEL, "requirements.txt"), encoding="utf-8").read()
    # Die ZEILE pruefen, nicht das Vorkommen: beide Namen stehen auch im
    # Kommentar darueber, und damit waere diese Zusicherung gruen, obwohl
    # pip die Pakete nie installiert. Genau diese Falle ist in diesem
    # Projekt schon mehrfach zugeschnappt.
    zeilen = [z.split("#")[0].strip() for z in req.splitlines()]
    for paket in ["zxing-cpp", "segno"]:
        assert any(z.startswith(paket) for z in zeilen), (
            f"{paket} steht in keiner Anforderungszeile von requirements.txt "
            f"— der Lauf auf dem Github-Laeufer bricht dann beim ersten Deck "
            f"mit einem ImportError ab")


# ── Die Abruf-Leiter ──────────────────────────────────────────────────
#
# ANLASS (04.09.2026, zweiter CI-Lauf). Die erste Fassung der Leiter fiel
# nur weiter, wenn eine BIBLIOTHEK fehlte. Auf dem Laeufer war
# cloudscraper installiert und antwortete mit HTTP 202 — Cloudflares
# "Pruefung laeuft". Damit war Schluss, curl_cffi kam nie an die Reihe,
# und der Lauf brach ab, obwohl die naechste Sprosse ungefragt danebenlag.
#
# Diese Zusicherungen haengen an gesetzten Antworten, nicht am Netz: sie
# gelten auf dem Laeufer genauso wie im Bausandkasten ohne Netz.

class _Antwort:
    def __init__(self, code, text="<html>ok</html>"):
        self.status_code = code
        self.text = text
        self.content = text.encode("utf-8")


class _Sprosse:
    """Eine erfundene Sitzung, die eine feste Folge von Antworten gibt."""

    def __init__(self, *antworten):
        self.antworten = list(antworten)
        self.gefragt = 0

    def get(self, url, **kw):
        self.gefragt += 1
        a = self.antworten[min(self.gefragt - 1, len(self.antworten) - 1)]
        if isinstance(a, Exception):
            raise a
        return a


def _leiter(mod, monkeypatch, bauplan, schlaf=True):
    """Die Leiter mit erfundenen Sprossen bestuecken."""
    gebaut = {}

    def baue(art):
        wert = bauplan[art]
        if isinstance(wert, Exception):
            raise wert
        gebaut[art] = wert
        return wert

    monkeypatch.setattr(mod, "_baue", baue)
    monkeypatch.setattr(mod, "_GEMERKT", None, raising=False)
    if schlaf:
        monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    return gebaut


def test_eine_abweisung_reicht_die_leiter_weiter(mod, monkeypatch):
    """HTTP 202 ist der Fall, der den zweiten CI-Lauf gekostet hat."""
    zweite = _Sprosse(_Antwort(200, "<html>echt</html>"))
    _leiter(mod, monkeypatch, {
        "cloudscraper": _Sprosse(_Antwort(202)),
        "curl_cffi": zweite,
        "requests": _Sprosse(_Antwort(200, "<html>zu spaet</html>")),
    })
    assert mod.hole("https://beispiel.test/x") == "<html>echt</html>"
    assert zweite.gefragt == 1


def test_bei_einer_abweisung_wird_nicht_nachgebohrt(mod, monkeypatch):
    """Wer 403 sagt, sagt es auch beim dritten Mal.

    Ohne diese Zusicherung darf `_frage` die Abweisung wie einen
    Netzfehler behandeln und dreimal fragen. Das kostet bei rund hundert
    Abrufen Minuten und macht aus einer hoeflichen Absage eine Belaestigung.
    """
    erste = _Sprosse(_Antwort(403))
    _leiter(mod, monkeypatch, {
        "cloudscraper": erste,
        "curl_cffi": _Sprosse(_Antwort(200)),
        "requests": _Sprosse(_Antwort(200)),
    })
    mod.hole("https://beispiel.test/x")
    assert erste.gefragt == 1, (
        f"die abweisende Sprosse wurde {erste.gefragt}-mal gefragt")


def test_ein_netzfehler_wird_dagegen_wiederholt(mod, monkeypatch):
    """Ein abgerissener Aufbau ist kein Nein — da lohnt der zweite Versuch."""
    erste = _Sprosse(OSError("Verbindung abgerissen"),
                     OSError("Verbindung abgerissen"),
                     _Antwort(200, "<html>doch noch</html>"))
    _leiter(mod, monkeypatch, {
        "cloudscraper": erste,
        "curl_cffi": _Sprosse(_Antwort(200, "<html>falsch</html>")),
        "requests": _Sprosse(_Antwort(200)),
    })
    assert mod.hole("https://beispiel.test/x") == "<html>doch noch</html>"
    assert erste.gefragt == 3


def test_die_durchgekommene_sprosse_wird_gemerkt(mod, monkeypatch):
    """Sonst laeuft jede der rund hundert Deck-Seiten die Leiter von vorn."""
    erste = _Sprosse(_Antwort(202))
    zweite = _Sprosse(_Antwort(200, "<html>a</html>"), _Antwort(200, "<html>b</html>"))
    _leiter(mod, monkeypatch, {
        "cloudscraper": erste,
        "curl_cffi": zweite,
        "requests": _Sprosse(_Antwort(200)),
    })
    assert mod.hole("https://beispiel.test/1") == "<html>a</html>"
    assert mod.hole("https://beispiel.test/2") == "<html>b</html>"
    assert erste.gefragt == 1, (
        "die abgewiesene Sprosse wurde beim zweiten Abruf erneut gefragt — "
        "dann wird nicht gemerkt, welche durchkommt")


def test_kippt_die_gemerkte_sprosse_wird_die_leiter_neu_gegangen(mod, monkeypatch):
    """Cloudflare kann mitten im Lauf anspringen.

    Merken darf nicht heissen: fuer immer festlegen. Sonst faellt der
    ganze Lauf aus, sobald der Schutz nach dreissig Deck-Seiten zuschlaegt
    — obwohl die naechste Sprosse noch durchkaeme.
    """
    erste = _Sprosse(_Antwort(200, "<html>erst ja</html>"), _Antwort(403))
    zweite = _Sprosse(_Antwort(200, "<html>uebernommen</html>"))
    _leiter(mod, monkeypatch, {
        "cloudscraper": erste,
        "curl_cffi": zweite,
        "requests": _Sprosse(_Antwort(200)),
    })
    assert mod.hole("https://beispiel.test/1") == "<html>erst ja</html>"
    assert mod.hole("https://beispiel.test/2") == "<html>uebernommen</html>"


def test_eine_fehlende_bibliothek_haelt_die_leiter_nicht_auf(mod, monkeypatch):
    _leiter(mod, monkeypatch, {
        "cloudscraper": ImportError("kein cloudscraper"),
        "curl_cffi": ImportError("kein curl_cffi"),
        "requests": _Sprosse(_Antwort(200, "<html>nackt</html>")),
    })
    assert mod.hole("https://beispiel.test/x") == "<html>nackt</html>"


def test_kommt_niemand_durch_steht_jede_antwort_im_fehler(mod, monkeypatch):
    """Der erste CI-Lauf meldete nur "keine Tier-Tabelle gefunden".

    Die Ursache — Bot-Schutz — war daraus nicht zu erkennen und kostete
    einen ganzen Durchgang. Wer scheitert, muss sagen, WORAN.
    """
    _leiter(mod, monkeypatch, {
        "cloudscraper": _Sprosse(_Antwort(202)),
        "curl_cffi": ImportError("nicht installiert"),
        "requests": _Sprosse(_Antwort(403)),
    })
    with pytest.raises(RuntimeError) as fehler:
        mod.hole("https://beispiel.test/x")
    text = str(fehler.value)
    for stueck in ["cloudscraper", "202", "curl_cffi", "nicht installiert",
                   "requests", "403", "Cloudflare"]:
        assert stueck in text, (
            f"'{stueck}' fehlt in der Fehlermeldung — dann beginnt die Suche "
            f"beim naechsten Ausfall wieder bei null. Meldung: {text}")


def test_die_leiter_faengt_bei_cloudscraper_an_und_endet_bei_requests(mod):
    """Die Reihenfolge ist eine Entscheidung, keine Laune.

    cloudscraper zuerst, weil sechs andere Scraper dieses Projekts damit
    seit Monaten durchkommen. curl_cffi dahinter, weil es den
    TLS-Fingerabdruck nachahmt und damit gegen den Schutz reicht, an dem
    cloudscraper scheitert. requests zuletzt, weil es keinen Schutz
    ueberwindet und nur dafuer da ist, dass das Skript ueberhaupt anlaeuft.
    """
    assert mod.SPROSSEN == ("cloudscraper", "curl_cffi", "requests")
    assert 202 in mod.ABGEWIESEN, (
        "202 fehlt unter den Abweisungen — genau dieser Code hat den "
        "zweiten CI-Lauf gekostet, und er sieht keinem Fehler aehnlich")


# ── Der Testschritt in CI ─────────────────────────────────────────────

def test_der_testschritt_installiert_die_qr_bibliotheken():
    """Sonst wird die Gegenprobe in CI still uebersprungen.

    ANLASS (04.09.2026). `probe()` importierte numpy; der Testschritt in
    deploy-pages.yml installiert nur vier Pakete, also fiel der Import
    um und der Deploy stand. numpy ist inzwischen ganz weg — zxing-cpp
    nimmt ein PIL-Bild unmittelbar entgegen.

    Damit waere der Deploy gerettet und die Pruefung verloren: ohne
    segno, zxingcpp und Pillow greift `_qr_noetig()` und die Gegenprobe
    wird uebersprungen. Ein gruener Lauf hiesse dann nur noch, dass
    niemand hingesehen hat — und der Scan-Code ist der ganze Zweck des
    Reiters. Also muss der Testschritt sie mitbringen, und diese
    Zusicherung haelt das fest.
    """
    pfad = os.path.join(WURZEL, ".github", "workflows", "deploy-pages.yml")
    text = open(pfad, encoding="utf-8").read()
    zeilen = [z for z in text.splitlines() if "pip install" in z]
    assert zeilen, "in deploy-pages.yml steht kein pip-install-Schritt mehr"
    zusammen = " ".join(zeilen)
    for paket in ["zxing-cpp", "segno", "pillow", "pyyaml"]:
        assert paket in zusammen.lower(), (
            f"{paket} fehlt in den pip-install-Zeilen von deploy-pages.yml. "
            f"Dann ueberspringt pytest still eine Pruefung — bei zxing-cpp, "
            f"segno und Pillow die QR-Gegenprobe, bei PyYAML die drei "
            f"Zusicherungen ueber pocket-tierlist.yml. Der Lauf ist gruen, "
            f"und niemand hat hingesehen. Zeilen: {zeilen}")


def test_der_scraper_braucht_kein_numpy():
    """Eine Abhaengigkeit weniger ist eine Fehlerquelle weniger.

    Nachgemessen am 04.09.2026: zxing-cpp liest aus einem PIL-Bild
    denselben Inhalt wie aus np.array(bild). Der Umweg brachte nichts
    und kostete einen Deploy.
    """
    text = open(SKRIPT, encoding="utf-8").read()
    zeilen = [z.strip() for z in text.splitlines()
              if z.strip().startswith(("import ", "from "))]
    treffer = [z for z in zeilen if "numpy" in z]
    assert not treffer, (
        f"der Scraper importiert wieder numpy: {treffer}. Der Testschritt in "
        f"deploy-pages.yml installiert es nicht — genau daran hing der "
        f"Deploy am 04.09.2026")


# ── Das 2D-Muster ist ein verzierter QR-Code ──────────────────────────
#
# BEFUND (04.09.2026, am echten Bild). Game8 liefert 298x300 Graustufen,
# und zxing-cpp liest daraus GAR NICHTS: runde Punkte mit Luecken
# dazwischen, dazu ein Booster-Symbol ueber der Mitte. Was hilft, ist die
# Luecken zu schliessen — aber kein einzelner Weg ist verlaesslich.
#
# Nachgemessen an einem echten Muster: von sechs Wegen lasen vier,
# zwei nicht. Deshalb gilt ein Ergebnis erst, wenn MINDESTENS ZWEI
# dasselbe lesen. Ein falscher Code waere schlimmer als kein Code.
#
# Geprueft wird hier die Entscheidungsregel, nicht die Bildbearbeitung:
# `_varianten` wird untergeschoben, damit die Faelle gesetzt sind statt
# von der Tagesform eines Decoders abzuhaengen.

class _Fund:
    def __init__(self, text):
        self.text = text


def _mit_lesungen(mod, monkeypatch, lesungen):
    """lies_qr so verkabeln, dass die Wege feste Ergebnisse liefern."""
    monkeypatch.setattr(mod, "_varianten",
                        lambda bild: [(f"weg{i}", i) for i in range(len(lesungen))])

    def lesen(marke, **kw):
        t = lesungen[marke]
        return [_Fund(t)] if t else []

    zx = types.SimpleNamespace(read_barcodes=lesen)
    monkeypatch.setitem(sys.modules, "zxingcpp", zx)
    # Image.open() wird nur noch gerufen, das Ergebnis ist egal.
    monkeypatch.setitem(sys.modules, "PIL", types.SimpleNamespace(
        Image=types.SimpleNamespace(open=lambda *_a, **_k: types.SimpleNamespace(
            convert=lambda _m: None))))
    monkeypatch.setitem(sys.modules, "PIL.Image", types.SimpleNamespace(
        open=lambda *_a, **_k: types.SimpleNamespace(convert=lambda _m: None)))


def test_ein_einzelner_treffer_reicht_nicht(mod, monkeypatch):
    """Genau die Bauart, die einen falschen Code ausliefern wuerde."""
    _mit_lesungen(mod, monkeypatch, ["ABC", None, None, None])
    assert mod.lies_qr(b"egal") is None, (
        "ein einziger Weg hat gelesen, und das Ergebnis gilt schon. Ein "
        "Fehlgriff des Decoders wuerde so zum Scan-Code des Nutzers")


def test_zwei_uebereinstimmende_lesungen_gelten(mod, monkeypatch):
    _mit_lesungen(mod, monkeypatch, ["ABC", "ABC", None, None])
    assert mod.lies_qr(b"egal") == "ABC"


def test_widersprechende_lesungen_gelten_nicht(mod, monkeypatch):
    """Zwei Wege, zwei verschiedene Inhalte — dann stimmt etwas nicht.

    Die Mehrheit zu nehmen waere hier das Schlimmste: einer der beiden
    ist falsch, und welcher, weiss niemand.
    """
    _mit_lesungen(mod, monkeypatch, ["ABC", "ABC", "XYZ", None])
    assert mod.lies_qr(b"egal") is None, (
        "bei widersprechenden Lesungen desselben Bildes wird trotzdem eine "
        "ausgewaehlt")


def test_gar_keine_lesung_ist_kein_leerer_code(mod, monkeypatch):
    _mit_lesungen(mod, monkeypatch, [None, None, None, None])
    assert mod.lies_qr(b"egal") is None


def test_die_schwelle_laesst_sich_nicht_wegargumentieren(mod):
    """Die Zahl steht in der Signatur und ist damit nachlesbar."""
    import inspect
    sig = inspect.signature(mod.lies_qr)
    assert sig.parameters["mindestens"].default == 2, (
        "die Schwelle steht nicht mehr auf zwei — bei eins ist die Probe "
        "wirkungslos")


def test_es_werden_mehrere_wege_gegangen(mod):
    """Ein Weg allein liest das echte Muster nicht.

    Nachgemessen am 04.09.2026: roh -> nichts, Verkleinern /4 -> nichts,
    Weichzeichnen 2,0 -> nichts. Wer die Leiter auf einen Weg kuerzt,
    bekommt fuer einen Teil der Decks gar keinen Code.
    """
    from PIL import Image
    bild = Image.new("L", (120, 120), 255)
    wege = [w for w, _b in mod._varianten(bild)]
    assert len(wege) >= 5, (
        f"nur {len(wege)} Wege: {wege}. Gemessen am echten Muster lasen vier "
        f"von sechs; wer die Leiter kuerzt, verliert Decks. Fuenf ist die "
        f"Untergrenze, unter der ein einzelner Ausfall die Zwei-von-N-Regel "
        f"auf eine Einzelmeinung zurueckwirft")
    assert len(set(wege)) == len(wege), f"doppelte Wege: {wege}"


# ── Verhalten statt Quelltext-Suche ───────────────────────────────────
#
# BEFUND DER ABNAHME (04.09.2026). Fuenf Zusicherungen dieser Datei
# pruefen, ob bestimmte Zeichenketten im Quelltext VORKOMMEN — ob die
# Gegenprobe verdrahtet ist, ob ein leeres Ergebnis abbricht, ob die
# Quelle angeschrieben wird, ob Ausfaelle in der Datei landen, ob der
# Scraper Pausen macht. Alle fuenf liessen sich aushebeln, ohne den Text
# anzufassen: die Bedingung wird abgeschaltet, der Kommentar bleibt
# stehen, der Test bleibt gruen.
#
# Ein Quelltext-Grep sagt, dass jemand etwas geschrieben hat. Er sagt
# nicht, dass es wirkt. Die Zusicherungen hier rufen die Funktionen auf.


class _Netz:
    """Ein erfundenes Netz: Seiten und Bilder aus einem Woerterbuch."""

    def __init__(self, seiten, bilder=None):
        self.seiten = seiten
        self.bilder = bilder or {}
        self.abrufe = []

    def hole(self, url, binaer=False, versuche=3):
        self.abrufe.append(url)
        if binaer:
            # Voreinstellung: die Adresse SELBST ist der Bildinhalt, damit
            # zwei Muster nie zufaellig denselben Code ergeben.
            return self.bilder.get(url, url.encode())
        if url not in self.seiten:
            raise RuntimeError(f"unerwartete Adresse: {url}")
        return self.seiten[url]


def _verkabelt(mod, monkeypatch, netz, code=None, probe_ok=True, unlesbar=False):
    """lies_qr/probe/hole ersetzen.

    `code=None` heisst: JEDES Muster bekommt einen eigenen Inhalt,
    abgeleitet aus den Bilddaten. Das ist die Voreinstellung, seit der
    Scan-Code der Schluessel beim Zusammenlegen ist — gaebe die Attrappe
    allen Decks denselben Code, wuerde der Code sie zu Recht zu EINEM
    Deck zusammenlegen, und der Test praefte etwas anderes als gemeint.
    """
    monkeypatch.setattr(mod, "hole", netz.hole)
    if unlesbar:
        leser = lambda daten, **kw: None            # noqa: E731
    elif code is not None:
        leser = lambda daten, **kw: code            # noqa: E731
    else:
        leser = lambda daten, **kw: "CODE-" + daten.decode(errors="replace")  # noqa: E731
    monkeypatch.setattr(mod, "lies_qr", leser)
    monkeypatch.setattr(mod, "probe", lambda inhalt, erzeuge=None: probe_ok)
    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)


def _seite(*abschnitte):
    """Eine erfundene Deck-Seite mit je Abschnitt Ueberschrift und Muster."""
    teile = []
    for i, name in enumerate(abschnitte, 101):
        teile.append(
            f"<h3 id='hm_{i}'>{name} Deck</h3>"
            f"<img alt='{name} Deck 2D Pattern QR Code' "
            f"data-src='https://img.game8.co/{i}/x.png/show'>")
    return "".join(teile)


def test_varianten_derselben_seite_fallen_nicht_zusammen(mod, monkeypatch):
    """Der Fehler, den der Docstring von sammle als gefunden beschreibt.

    Ohne Verhaltenstest kann er zurueckkommen: der Schluessel im
    Woerterbuch ist (Archivnummer, Anker), und wer daraus die blosse
    Nummer macht, legt zwei Varianten uebereinander. Genau das ist der
    Fall, den die Abnahme als ueberlebende Mutation gemeldet hat.
    """
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha", "Beta")})
    _verkabelt(mod, monkeypatch, netz)
    fertig, ausfaelle, _versucht, _zus = mod.sammle(
        [("Alpha", "S", "9", "hm_101", ""), ("Beta", "A", "9", "hm_102", "")], [], still=True)
    assert len(fertig) == 2, (
        f"aus zwei Varianten derselben Seite wurden {len(fertig)} — dann "
        f"faellt eine still unter den Tisch. Ausfaelle: {ausfaelle}")
    assert {d["name"] for d in fertig} == {"Alpha", "Beta"}
    assert {d["tier"] for d in fertig} == {"S", "A"}


def test_die_seite_wird_nur_einmal_geholt(mod, monkeypatch):
    """Sonst holt jede Variante dieselbe Seite noch einmal."""
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha", "Beta")})
    _verkabelt(mod, monkeypatch, netz)
    mod.sammle([("Alpha", "S", "9", "hm_101", ""), ("Beta", "A", "9", "hm_102", "")], [], still=True)
    seitenabrufe = [u for u in netz.abrufe if "/archives/" in u]
    assert len(seitenabrufe) == 1, (
        f"die Seite wurde {len(seitenabrufe)}-mal geholt — Game8 schuldet uns "
        f"nichts, und zweimal dasselbe zu holen ist unnoetige Last")


def test_ein_deck_ohne_bestandene_darstellungsprobe_kommt_nicht_in_die_datei(mod, monkeypatch):
    """Die Probe muss WIRKEN, nicht nur im Quelltext stehen.

    Die Abnahme hat gezeigt, dass sich der Ausfallzweig abschalten
    laesst, ohne dass ein Test es merkt: der fruehere Test suchte nur
    die Zeichenkette "probe(" und ein "continue" dahinter.
    """
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha")})
    _verkabelt(mod, monkeypatch, netz, probe_ok=False)
    fertig, ausfaelle, _versucht, _zus = mod.sammle([("Alpha", "S", "9", "hm_101", "")], [], still=True)
    assert fertig == [], (
        "ein Deck, dessen Inhalt unsere eigene Darstellung nicht uebersteht, "
        "steht trotzdem in der Datei")
    assert ausfaelle and "Gegenprobe" in ausfaelle[0][1], (
        f"der Ausfall wird nicht als solcher gemeldet: {ausfaelle}")


def test_ein_unlesbares_muster_kommt_nicht_in_die_datei(mod, monkeypatch):
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha")})
    _verkabelt(mod, monkeypatch, netz, unlesbar=True)
    fertig, ausfaelle, _versucht, _zus = mod.sammle([("Alpha", "S", "9", "hm_101", "")], [], still=True)
    assert fertig == [] and ausfaelle, "ein unlesbares Muster liefert einen Code"


def test_der_name_kommt_von_der_deck_seite_nicht_aus_der_uebersicht(mod, monkeypatch):
    """Der Behelfsname der Uebersicht ist bei Apostroph abgeschnitten."""
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9":
                  _seite("Team Rocket's Articuno ex and 18 Trainers")})
    _verkabelt(mod, monkeypatch, netz)
    fertig, _aus, _versucht, _zus = mod.sammle([("Team Rocket", "B", "9", "hm_101", "")], [], still=True)
    assert fertig[0]["name"] == "Team Rocket's Articuno ex and 18 Trainers", (
        f"der abgeschnittene Behelfsname hat ueberlebt: {fertig[0]['name']!r}")


# ── main(): was der Lauf bei Ausfaellen tut ───────────────────────────

def _lauf(mod, monkeypatch, tier, set_decks, fertig, ausfaelle, argv, ziel=None):
    """main() unter gesetzten Bedingungen laufen lassen.

    `ziel` ist PFLICHT-Ersatz fuer mod.AUSGABE. Ohne ihn schreibt ein
    Test, der main() bis zum Ende laufen laesst, in die ECHTE
    data/pocket_tierlist.json — und genau das ist am 04.09.2026 passiert:
    die Suite ersetzte 31 echte Decks durch zehn Attrappen D0..D9. Der
    Waechter unten faengt es, falls es jemand wieder vergisst.
    """
    monkeypatch.setattr(mod, "AUSGABE", str(ziel) if ziel else "/dev/null")
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, set_decks))
    monkeypatch.setattr(mod, "sammle",
                        lambda *a, **k: (fertig, ausfaelle, len(fertig) + len(ausfaelle), []))
    monkeypatch.setattr(sys, "argv", ["x"] + argv)
    geschrieben = []
    echtes_open = open

    def merk_open(pfad, modus="r", *a, **k):
        if "w" in modus:
            geschrieben.append(pfad)
        return echtes_open(pfad, modus, *a, **k)

    monkeypatch.setattr("builtins.open", merk_open)
    return mod.main(), geschrieben


def test_ein_leeres_ergebnis_gibt_eins_zurueck(mod, monkeypatch):
    """Frueher nur ein Quelltext-Grep — die Bedingung liess sich abschalten."""
    rc, geschrieben = _lauf(mod, monkeypatch,
                            [("A", "S", "1", "hm_101", "")], [], [], [("A", "kaputt")], [])
    assert rc == 1, "ein Lauf ohne einen einzigen Code meldet Erfolg"
    assert not geschrieben, "und schreibt die vorhandene Datei tot"


def test_ein_teilausfall_ersetzt_die_gute_datei_nicht(mod, monkeypatch):
    """Der Befund der Abnahme: 3 von 49 gelesen, Rueckgabe 0, Datei ersetzt."""
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(49)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(3)]
    ausfaelle = [(f"D{i}", "HTTP 202") for i in range(3, 49)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, ausfaelle, [])
    assert rc == 1, (
        f"3 von 49 Decks gelesen, und der Lauf meldet Erfolg ({rc}). Der "
        f"Ablauf haette das committet")
    assert not geschrieben, "die gute Datei wurde durch eine mit drei Decks ersetzt"


def test_ein_vollstaendiger_lauf_schreibt(mod, monkeypatch, tmp_path):
    """Die Gegenprobe zur Schwelle: sonst prueft sie nur, dass nie geschrieben wird."""
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(10)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(10)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [], [],
                            ziel=tmp_path / "pocket_tierlist.json")
    assert rc == 0
    assert any("pocket_tierlist.json" in str(p) for p in geschrieben), (
        f"ein vollstaendiger Lauf schreibt nichts: {geschrieben}")


def test_ein_probelauf_ersetzt_die_produktionsdatei_nicht(mod, monkeypatch):
    """`--nur` heisst Probelauf und stand so auch im Actions-Dialog.

    Vorher schrieb er trotzdem die volle Ausgabedatei mit nur N Decks.
    Wer im Dialog "nur 3" setzte und die Trocken-Box uebersah, kuerzte
    die Tier-Liste auf drei Decks.
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(3)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(3)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [], ["--nur", "3"])
    assert rc == 0
    assert not any("pocket_tierlist.json" in str(p) for p in geschrieben), (
        f"ein Probelauf hat die Produktionsdatei ersetzt: {geschrieben}")


def _mit_bestand(tmp_path, wieviele):
    """Eine Zieldatei anlegen, die schon `wieviele` Decks traegt."""
    ziel = tmp_path / "pocket_tierlist.json"
    ziel.write_text(json.dumps({
        "_meta": {"anzahl": wieviele},
        "decks": [{"name": f"Alt{i}", "code": "X", "tier": "B"}
                  for i in range(wieviele)],
    }, ensure_ascii=False), encoding="utf-8")
    return ziel


def test_eine_geschrumpfte_quelle_ersetzt_den_bestand_nicht(mod, monkeypatch, tmp_path):
    """Das Loch, das die Gegenpruefung am 07.09.2026 nachgestellt hat.

    Die beiden vorhandenen Schwellen rechnen nur auf dem Lauf selbst.
    Listet die Quelle nur noch drei Decks und werden alle drei sauber
    gelesen, sind das 100 % der angegangenen Eintraege — kein Ausfall,
    keine Warnung, Rueckgabe 0. Ausgefuehrt ersetzte das 33 Decks durch
    3 und stiess den Deploy an.
    """
    ziel = _mit_bestand(tmp_path, 33)
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(3)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(3)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [], [], ziel=ziel)
    assert rc == 1, (
        f"drei Decks gegen 33 im Bestand, und der Lauf meldet Erfolg ({rc})")
    assert not any("pocket_tierlist.json" in str(x) for x in geschrieben), (
        f"der Bestand wurde trotzdem ersetzt: {geschrieben}")
    danach = json.loads(ziel.read_text(encoding="utf-8"))
    assert len(danach["decks"]) == 33, (
        f"die Datei traegt nach dem abgebrochenen Lauf "
        f"{len(danach['decks'])} Decks statt 33")


def test_ein_echter_set_wechsel_laesst_sich_durchsagen(mod, monkeypatch, tmp_path):
    """Die Gegenprobe: sonst prueft der Riegel nur, dass nie geschrieben wird.

    Schrumpft Game8s Liste wirklich, muss der Lauf durchgehen — aber nur
    auf ausdrueckliche Anweisung, damit die Entscheidung im Protokoll
    steht statt still zu passieren.
    """
    ziel = _mit_bestand(tmp_path, 33)
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(3)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(3)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [],
                            ["--schrumpfen-erlauben"], ziel=ziel)
    assert rc == 0, f"der ausdrueckliche Set-Wechsel wurde abgewiesen ({rc})"
    assert any("pocket_tierlist.json" in str(x) for x in geschrieben), (
        f"und geschrieben wurde auch nichts: {geschrieben}")


def test_der_riegel_faellt_bei_normaler_schwankung_nicht(mod, monkeypatch, tmp_path):
    """Ein Riegel, der jeden Lauf abweist, ist kein Riegel, sondern ein Stopp.

    Genau an der Schwelle (7 von 10 = 70 %) muss geschrieben werden;
    darunter nicht. Ohne diesen Fall bliebe ein `<=` statt `<` — oder
    eine Schwelle von 0.99 — unbemerkt.
    """
    ziel = _mit_bestand(tmp_path, 10)
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(7)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(7)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [], [], ziel=ziel)
    assert rc == 0, f"7 von 10 Decks sind noch keine geschrumpfte Quelle ({rc})"
    assert any("pocket_tierlist.json" in str(x) for x in geschrieben)


def test_der_erste_lauf_wird_nicht_vom_riegel_aufgehalten(mod, monkeypatch, tmp_path):
    """Ohne Vorlage gibt es keinen Bestand zu schuetzen.

    Sonst koennte die Tier-Liste nach einem Verlust der Datei nie wieder
    entstehen — der Riegel wuerde sich selbst im Weg stehen.
    """
    ziel = tmp_path / "pocket_tierlist.json"        # existiert absichtlich nicht
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(3)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(3)]
    rc, geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [], [], ziel=ziel)
    assert rc == 0, f"der erste Lauf wurde abgewiesen ({rc})"
    assert any("pocket_tierlist.json" in str(x) for x in geschrieben)


def test_eine_unlesbare_vorlage_haelt_den_lauf_nicht_auf(mod, monkeypatch, tmp_path):
    """Kaputtes JSON im Ziel ist kein Bestand, den man schuetzen koennte.

    Wer hier abbraeche, machte eine beschaedigte Datei unreparierbar.
    """
    ziel = tmp_path / "pocket_tierlist.json"
    ziel.write_text("{ das ist kein JSON", encoding="utf-8")
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(3)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(3)]
    rc, _geschrieben = _lauf(mod, monkeypatch, tier, [], fertig, [], [], ziel=ziel)
    assert rc == 0, f"eine kaputte Vorlage hat den Lauf aufgehalten ({rc})"


def test_eine_fehlende_set_tabelle_bricht_den_lauf_ab(mod):
    """Sonst verschwinden 24 Decks kommentarlos, wenn Game8 umbenennt.

    Die erste Reparatur hat hier nur gewarnt und weiterlaufen lassen.
    Die zweite Abnahme (04.09.2026) hat gezeigt, dass das nichts nuetzt:
    die 24 Set-Decks tauchen weder in `fertig` noch in `ausfaelle` auf,
    die Schwelle sieht sie also nicht, die Datei wird ueberschrieben und
    der Lauf gibt 0 zurueck. Eine halbe Datei als ganze auszuliefern ist
    schlimmer als ein Abbruch.
    """
    nur_tier = ("<table><tr><th><img alt='S Tier'></th></tr>"
                "<tr><td>"
                + "".join(f"<a href='/archives/{i}#hm_101'>"
                          f"<img alt='Deck {i}'></a>" for i in range(3))
                + "</td></tr></table>")
    with pytest.raises(RuntimeError) as fehler:
        mod.lies_seite(nur_tier)
    assert "Set-Tabelle" in str(fehler.value)


def test_die_darstellungsprobe_behauptet_keine_echtheit(mod):
    """Festhalten, was probe() NICHT kann — damit es niemand wieder glaubt.

    Die Abnahme am 04.09.2026 hat nachgemessen:

        probe("voelliger Unsinn 12345") -> True

    Game8s Bild kommt in der Funktion nicht vor. Sie prueft, ob ein
    Inhalt UNSERE eigene Darstellung uebersteht — mehr nicht. Die
    Echtheit sichert lies_qr mit seiner Zwei-von-fuenf-Regel.

    Dieser Test ist bewusst herum: er verlangt, dass beliebiger Inhalt
    besteht. Faellt er eines Tages um, hat jemand probe() umgebaut — und
    muss dann auch den Text in _meta und im Modulkopf nachziehen.
    """
    _qr_noetig()
    assert mod.probe("voelliger Unsinn 12345") is True
    assert mod.probe("a") is True


def test_der_dateitext_verspricht_keine_echtheit_durch_die_darstellungsprobe():
    """_meta.code_hinweis wird von Konsumenten gelesen wie eine Zusage."""
    text = open(SKRIPT, encoding="utf-8").read()
    i = text.find('"code_hinweis"')
    assert i > 0, "code_hinweis steht nicht mehr in der Ausgabe"
    block = text[i:i + 900]
    assert "fünf Wegen" in block or "fuenf Wegen" in block, (
        "der Hinweis nennt die Zwei-von-fuenf-Regel nicht — dann steht dort "
        "die Darstellungsprobe als einzige Sicherung, und das war die "
        "Uebertreibung, die die Abnahme bemaengelt hat")
    assert "Darstellbarkeit" in block or "darstellbar" in block.lower(), (
        "der Hinweis trennt Echtheit und Darstellbarkeit nicht")


def test_die_tier_stufe_gewinnt_gegen_die_set_stufe(mod, monkeypatch):
    """Ein Deck steht in beiden Tabellen — welche Stufe gilt?

    Die Tier-Liste ist die Rangliste; die Set-Tabelle sagt nur, dass das
    Deck zum aktuellen Set gehoert. Wer die zweite gewinnen laesst,
    ueberschreibt die Einstufung mit einer Nebenangabe.
    """
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha")})
    _verkabelt(mod, monkeypatch, netz)
    fertig, _aus, _versucht, _zus = mod.sammle([("Alpha", "S", "9", "hm_101", "")],
                           [("Alpha", "C", "9", None, "")], still=True)
    stufen = {d["name"]: d["tier"] for d in fertig}
    assert stufen.get("Alpha") == "S", (
        f"die Set-Stufe hat die Tier-Stufe ueberschrieben: {stufen}")


def test_zwischen_zwei_abrufen_wird_gewartet(mod, monkeypatch):
    """Game8 schuldet uns nichts.

    Frueher war das ein Quelltext-Grep nach 'time.sleep' — der blieb
    gruen, wenn man eine der beiden Pausen entfernte. Gezaehlt wird
    jetzt.
    """
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha")})
    monkeypatch.setattr(mod, "hole", netz.hole)
    monkeypatch.setattr(mod, "lies_qr", lambda daten, **kw: "ABC")
    monkeypatch.setattr(mod, "probe", lambda inhalt, erzeuge=None: True)
    pausen = []
    monkeypatch.setattr(mod.time, "sleep", lambda s: pausen.append(s))

    mod.sammle([("Alpha", "S", "9", "hm_101", "")], [], still=True)
    abrufe = len(netz.abrufe)
    assert len(pausen) >= abrufe, (
        f"{abrufe} Abrufe, aber nur {len(pausen)} Pausen — jeder Abruf braucht "
        f"eine, sonst prasseln fuenfzig Deck-Seiten im Millisekundentakt auf "
        f"eine fremde Seite ein")
    assert all(p >= 1.0 for p in pausen), f"zu kurze Pausen: {pausen}"


def test_ein_abbruch_beim_schreiben_zerstoert_die_vorhandene_datei_nicht(
        mod, monkeypatch, tmp_path):
    """`open(..., "w")` kuerzt die Datei, BEVOR geschrieben wird.

    Der Ablauf hat ein 20-Minuten-Limit. Bricht der Lauf mitten im
    Schreiben ab, stuende dort unvollstaendiges JSON — und der
    Commit-Schritt committet es.
    """
    ziel = tmp_path / "pocket_tierlist.json"
    ziel.write_text('{"decks": ["die gute alte Datei"]}', encoding="utf-8")
    monkeypatch.setattr(mod, "AUSGABE", str(ziel))

    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(5)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(5)]
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, [], len(fertig), []))
    monkeypatch.setattr(sys, "argv", ["x"])

    echtes_dump = json.dump

    def bricht_ab(*a, **k):
        echtes_dump(*a, **k)          # halb schreiben …
        raise KeyboardInterrupt("Zeitlimit")   # … dann abbrechen

    monkeypatch.setattr(json, "dump", bricht_ab)
    with pytest.raises(KeyboardInterrupt):
        mod.main()

    assert ziel.read_text(encoding="utf-8") == '{"decks": ["die gute alte Datei"]}', (
        "die vorhandene Datei wurde beim abgebrochenen Schreiben zerstoert — "
        "erst daneben schreiben, dann umbenennen")


def test_die_ausgabe_schreibt_quelle_und_ausfaelle_wirklich_hinein(
        mod, monkeypatch, tmp_path):
    """Frueher ein Quelltext-Grep. Jetzt wird die Datei gelesen."""
    ziel = tmp_path / "pocket_tierlist.json"
    monkeypatch.setattr(mod, "AUSGABE", str(ziel))
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(10)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(9)]
    ausfaelle = [("D9", "kein 2D-Muster zu diesem Deck")]
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle",
                        lambda *a, **k: (fertig, ausfaelle, len(fertig) + len(ausfaelle), []))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 0

    d = json.loads(ziel.read_text(encoding="utf-8"))
    m = d["_meta"]
    assert m["quelle"] == "game8.co" and m["quelle_url"].startswith("https://game8.co")
    assert "redaktionelle" in m["quelle_hinweis"], (
        "die Ausgabe schreibt nicht an, dass die Einstufung Game8s "
        "redaktionelle Einschaetzung ist — der Reiter uebernaehme sie sonst "
        "als gemessene Zahl")
    assert m["anzahl"] == len(d["decks"]) == 9
    assert [x["name"] for x in m["ohne_code"]] == ["D9"], (
        f"die Ausfaelle stehen nicht in der Datei, nur im Protokoll: "
        f"{m['ohne_code']}")
    assert m["abgerufen"] and "T" in m["abgerufen"]


def test_ein_deck_aus_beiden_tabellen_steht_nur_einmal_in_der_datei(mod, monkeypatch):
    """Der Befund der Abnahme: 48 Eintraege auf 34 verschiedene Codes.

    Neun Namen standen doppelt, mehrere mit widerspruechlicher Stufe bei
    identischem Code — z. B. "Mega Altaria ex and Gourgeist" einmal als A
    und einmal als B. Ein Reiter, der das anzeigt, zeigt dasselbe Deck
    zweimal auf verschiedenen Raengen.
    """
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha")})
    _verkabelt(mod, monkeypatch, netz)
    fertig, _aus, _versucht, _zus = mod.sammle([("Alpha", "S", "9", "hm_101", "")],
                           [("Alpha", "C", "9", None, "")], still=True)
    assert len(fertig) == 1, (
        f"dasselbe Deck steht {len(fertig)}-mal in der Ausgabe: "
        f"{[(d['name'], d['tier']) for d in fertig]}")
    assert fertig[0]["quelle_liste"] == "beide", (
        "dass das Deck in BEIDEN Listen steht, geht verloren")
    assert fertig[0]["tier"] == "S", (
        f"die Set-Stufe hat die Tier-Stufe ueberschrieben: {fertig[0]['tier']}")


def test_kein_code_steht_unter_zwei_namen_in_derselben_ausgabe(mod, monkeypatch):
    """Zwei Namen, ein Code heisst: eine Zuordnung ist verrutscht."""
    seite = _seite("Alpha", "Beta")
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": seite})
    monkeypatch.setattr(mod, "hole", netz.hole)
    # Jedes Muster bekommt seinen eigenen Inhalt — abgeleitet aus der Adresse.
    monkeypatch.setattr(mod, "lies_qr", lambda daten, **kw: daten.decode())
    monkeypatch.setattr(mod, "probe", lambda inhalt, erzeuge=None: True)
    monkeypatch.setattr(mod.time, "sleep", lambda *_: None)
    netz.bilder = {"https://img.game8.co/101/x.png/show": b"CODE-ALPHA",
                   "https://img.game8.co/102/x.png/show": b"CODE-BETA"}
    fertig, _aus, _versucht, _zus = mod.sammle([("Alpha", "S", "9", "hm_101", ""),
                            ("Beta", "A", "9", "hm_102", "")], [], still=True)
    codes = {d["name"]: d["code"] for d in fertig}
    assert codes == {"Alpha": "CODE-ALPHA", "Beta": "CODE-BETA"}, (
        f"Name und Code passen nicht zusammen: {codes}")
    assert len(set(codes.values())) == len(codes), (
        f"zwei Decks tragen denselben Code: {codes}")


def test_kein_test_schreibt_in_die_echte_datendatei():
    """Waechter gegen den Fehler, den diese Suite selbst gemacht hat.

    Am 04.09.2026 lief `test_ein_vollstaendiger_lauf_schreibt` ohne
    Ersatz fuer `mod.AUSGABE` durch und ersetzte die echten 31 Decks
    durch zehn Attrappen. Gemerkt habe ich es nur, weil die Datei
    hinterher 1.352 statt 12.000 Bytes hatte.

    Eine Testsuite, die Produktionsdaten anfasst, ist gefaehrlicher als
    eine, die zu wenig prueft: sie macht kaputt, was sie schuetzen soll.
    """
    with io.open(AUSGABE_ECHT, encoding="utf-8") as f:
        d = json.load(f)
    attrappen = [x for x in d.get("decks", []) if x.get("code") == "X"
                 or str(x.get("name", "")).startswith("D") and len(str(x.get("name"))) <= 3]
    assert not attrappen, (
        f"in data/pocket_tierlist.json stehen Test-Attrappen: "
        f"{[x.get('name') for x in attrappen][:5]}. Ein Test hat in die echte "
        f"Datei geschrieben — such nach einem Lauf ohne Ersatz fuer AUSGABE")
    assert len(d.get("decks", [])) > 20, (
        f"nur {len(d.get('decks', []))} Decks in der echten Datei — das sieht "
        f"nach einem Probelauf oder einem Test aus, der sie ueberschrieben hat")


# ── Zweite Abnahme: die Reparaturen selbst unter Beschuss ─────────────

def test_zwei_verschiedene_decks_mit_gleichem_namen_bleiben_getrennt(mod):
    """Der Fehler, den die ERSTE Reparatur eingebaut hat.

    `_zusammenfuehren` legte ueber den Namen zusammen. Zwei Decks
    verschiedener Seiten, die zufaellig gleich heissen, wurden damit zu
    einem — und zwar zu einem widerspruechlichen: Stufe und Anker vom
    einen, Archivnummer und Code vom anderen. Der entstehende Verweis
    /archives/111#hm_103 zeigt auf einen Abschnitt, den es auf Seite 111
    nicht gibt.

    Der Scan-Code IST das Deck. Verschiedene Codes heissen verschiedene
    Decks, egal wie sie heissen.
    """
    a = {"name": "X", "tier": "S", "archiv": "111", "anker": "hm_101",
         "quelle_liste": "tier", "code": "CODE-A"}
    b = {"name": "X", "tier": "D", "archiv": "222", "anker": "hm_103",
         "quelle_liste": "tier", "code": "CODE-B"}
    raus, _zus = mod._zusammenfuehren([dict(a), dict(b)])
    assert len(raus) == 2, (
        f"zwei Decks mit verschiedenen Codes wurden zu {len(raus)} "
        f"zusammengelegt: {raus}")


def test_beim_zusammenlegen_bleiben_archiv_und_anker_zusammen(mod):
    """Ein Anker gilt nur auf seiner eigenen Seite."""
    tier = {"name": "X", "tier": "S", "archiv": "111", "anker": "hm_101",
            "quelle_liste": "tier", "code": "GLEICH"}
    setd = {"name": "X", "tier": "C", "archiv": "222", "anker": None,
            "quelle_liste": "set", "code": "GLEICH"}
    for reihenfolge in ([dict(tier), dict(setd)], [dict(setd), dict(tier)]):
        raus, _zus = mod._zusammenfuehren(reihenfolge)
        assert len(raus) == 1
        d = raus[0]
        assert d["anker"] == "hm_101" and d["archiv"] == "111", (
            f"Anker und Archivnummer stammen von verschiedenen Seiten: {d}")
        assert d["tier"] == "S", f"die Set-Stufe hat gewonnen: {d}"
        assert d["quelle_liste"] == "beide"


def test_die_schwelle_rechnet_auf_den_angegangenen_decks(mod, monkeypatch, tmp_path):
    """Sonst schrumpft der Nenner beim Zusammenlegen und ein Ausfall sieht gut aus.

    Nachgestellt von der zweiten Abnahme: 49 angegangen, 44 durch
    Zusammenlegen verschwunden, 1 Ausfall — gemeldet wurde "4 Decks, 1
    ohne", also 80 %, und die gute Datei wurde ersetzt.
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(49)]
    fertig = [{"name": f"D{i}", "code": "X"} for i in range(4)]
    ausfaelle = [("D48", "kaputt")]
    monkeypatch.setattr(mod, "AUSGABE", str(tmp_path / "x.json"))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, ausfaelle, 49, []))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 1, (
        "49 angegangen, 4 uebrig — und der Lauf meldet Erfolg")
    assert not (tmp_path / "x.json").exists(), "die Datei wurde trotzdem geschrieben"


def test_viele_decks_mit_einem_einzigen_code_sind_kein_ergebnis(mod, monkeypatch, tmp_path):
    """Ein kaputter Musterleser liefert ueberall dasselbe.

    Ohne diese Bremse sieht das nach einem sauberen Lauf mit vielen
    Doppelungen aus: keine Ausfaelle, Quote 100 %.
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(40)]
    fertig = [{"name": "D0", "code": "IMMER-DASSELBE"}]
    monkeypatch.setattr(mod, "AUSGABE", str(tmp_path / "x.json"))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, [], 40, []))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 1, (
        "40 Decks angegangen, ein einziger Code dabei — und der Lauf meldet "
        "Erfolg mit 100 %")


def test_der_anker_wird_nicht_irgendwo_im_dokument_gesucht(mod):
    """Die id muss im oeffnenden Tag der Ueberschrift selbst stehen.

    Die zweite Abnahme hat drei Wege gezeigt, auf denen die reine
    Textsuche danebengreift. Jeder von ihnen liefert einen falschen
    Namen — und ein falscher Name fuehrt weiter unten zum Muster des
    falschen Decks, waehrend die Stufe vom richtigen stammt.
    """
    faelle = {
        "data-id":
            "<h3 id='hm_105' data-id='hm_103'>Deck A</h3><h3 id='hm_103'>Deck B</h3>",
        "im Kommentar":
            "<!-- <h3 id='hm_103'>Alte Fassung</h3> --><h3 id='hm_103'>Deck B</h3>",
        "im Skript":
            "<script>var t=\"<h3 id='hm_103'>Platzhalter</h3>\"</script>"
            "<h3 id='hm_103'>Deck B</h3>",
    }
    for was, markup in faelle.items():
        assert mod.name_zum_anker(markup, "hm_103") == "Deck B", (
            f"{was}: {mod.name_zum_anker(markup, 'hm_103')!r} statt 'Deck B'")


def test_die_adresse_stammt_aus_demselben_bild_tag(mod):
    """Sonst faellt der Name vom Code ab, ohne dass es auffaellt.

    Zwei Wege aus der zweiten Abnahme: "2D Pattern" im Fliesstext (dann
    wurde die Adresse des naechsten beliebigen Bildes genommen) und eine
    gedrehte Attributreihenfolge (dann die des FOLGENDEN Bildes).
    """
    fliesstext = ("<h2>Table of Contents</h2><p>Wo finde ich das 2D Pattern?</p>"
                  "<img alt='Werbung' data-src='https://img.game8.co/9/banner.png'>")
    assert mod.deck_abschnitte(fliesstext) == [], (
        f"aus Fliesstext wurde ein Deck-Abschnitt: "
        f"{mod.deck_abschnitte(fliesstext)}")

    gedreht = ("<h3 id='hm_101'>Alpha Deck</h3>"
               "<img data-src='https://img.game8.co/1/alpha.png' "
               "alt='Alpha Deck 2D Pattern QR Code'>"
               "<img alt='irgendwas' data-src='https://img.game8.co/2/fremd.png'>")
    raus = mod.deck_abschnitte(gedreht)
    assert raus and raus[0][1].endswith("alpha.png"), (
        f"bei gedrehter Attributreihenfolge wurde die Adresse des naechsten "
        f"Bildes genommen: {raus}")


def test_echte_doppelungen_loesen_keinen_fehlalarm_aus(mod, monkeypatch, tmp_path):
    """Die andere Haelfte der Schwellen-Reparatur.

    Rechnet die Schwelle auf dem ZUSAMMENGELEGTEN Ergebnis, schrumpft
    der Nenner mit jeder echten Doppelung — und ein sauberer Lauf wird
    abgebrochen. Nachgestellt von der zweiten Abnahme: 9 von 12
    erfolgreich (75 %), davon 5 dasselbe Deck aus beiden Tabellen,
    gerechnet wurden 4/7 = 57 % -> Abbruch, obwohl nichts kaputt ist.
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(12)]
    fertig = [{"name": f"D{i}", "code": f"C{i}"} for i in range(4)]
    ausfaelle = [(f"D{9 + i}", "kein Muster") for i in range(3)]
    # Die fuenf Doppelungen stehen als solche da. Ohne sie ginge die
    # Rechnung 12 = 4 + 3 + ? nicht auf, und genau darauf besteht main()
    # seit der dritten Abnahme (04.09.2026).
    doppelt = [{"art": "erwartet", "behalten": f"D{i}", "aufgegangen_in": str(i),
                "verloren": f"D{i}", "verlorene_stelle": f"{i}#hm_{i}",
                "verlorene_stufe": "S"} for i in range(4, 9)]
    monkeypatch.setattr(mod, "AUSGABE", str(tmp_path / "x.json"))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, ausfaelle, 12, doppelt))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 0, (
        "9 von 12 Decks gelesen (75 %), davon fuenf echte Doppelungen — und "
        "der Lauf bricht ab. Die Schwelle rechnet auf dem Ergebnis statt auf "
        "den angegangenen Decks")
    assert (tmp_path / "x.json").exists()


def test_nur_bilder_tragen_muster(mod):
    """Das Fenster muss an ein <img> gebunden sein, nicht an Zeichenabstand.

    Ohne die Bindung genuegt es, dass irgendwo nach "2D Pattern" ein
    data-src steht — auch im selben Absatz. Dann entsteht ein Deck aus
    einem Werbebanner.
    """
    absatz = ("<h2>Hinweis</h2>"
              "<p data-src='https://img.game8.co/9/banner.png'>2D Pattern</p>")
    assert mod.deck_abschnitte(absatz) == [], (
        f"aus einem <p> mit data-src wurde ein Deck-Abschnitt: "
        f"{mod.deck_abschnitte(absatz)}")


# ── Dritte Abnahme, 04.09.2026 ────────────────────────────────────────
#
# Ein Agententeam hat vier Wege gefunden, auf denen Decks verschwinden
# oder eine Stufe neben dem falschen Deck landet. Alle vier sind an der
# ECHTEN Seite nachgestellt, nicht an einer Annahme.

def test_eine_aufgefuellte_zeile_verliert_ihre_decks_nicht(gelesen):
    """Die letzte Set-Zeile hat nur drei Decks und ein <th> als Fueller.

    BEFUND: die Zeilenweiche hiess `if abzeichen and tr.find("th")`. Die
    letzte Zeile der Set-Tabelle traegt Abzeichen (in den td) UND ein
    `<th colspan="4"></th>` — also wurde sie als Stufenzeile gelesen und
    uebersprungen:

        Zeile 9  Zellen ['td','td','td','th']  Abzeichen: ja

    562129 (Whimsicott ex) und 532008 (Sylveon ex) standen danach weder
    in data/pocket_tierlist.json noch unter den gemeldeten Ausfaellen.
    Sie waren weg, bevor sammle() sie gezaehlt hat — deshalb konnte auch
    die Schwelle nichts davon sehen.
    """
    _tier, set_decks = gelesen
    ids = [aid for _n, _st, aid, _a, _ab in set_decks]
    for verloren in ("562129", "532008", "571731"):
        assert verloren in ids, (
            f"Archiv {verloren} steht in der letzten Set-Zeile der echten "
            f"Seite und fehlt im Ergebnis. Gelesen: {len(ids)} Set-Decks")


def test_die_stufenweiche_haengt_am_th_nicht_an_der_zeile(mod):
    """Dieselbe Sache als Mechanismus, unabhaengig vom Ausschnitt."""
    from bs4 import BeautifulSoup
    zeile = (
        "<table>"
        "<tr><th><img alt='S Tier'></th></tr>"
        "<tr><td><a href='/archives/1'><img alt='Alpha Deck'></a></td>"
        "    <td><a href='/archives/2'><img alt='Beta Deck'></a>"
        "        <img alt='B Tier'></td>"
        "    <th colspan='4'></th></tr>"
        "</table>")
    tab = BeautifulSoup(zeile, "lxml").find("table")
    namen = [n for n, _s, _i, _a, _ab in mod.lies_tabelle(tab)]
    assert namen == ["Alpha", "Beta"], (
        f"eine mit <th> aufgefuellte Zeile wurde uebersprungen: {namen}")


def test_alle_passenden_tabellen_werden_gelesen_nicht_die_erste(mod):
    """`treffer[0]` haette einen Umbau der Seite stillschweigend halbiert.

    Teilt Game8 die Tier-Liste eines Tages in eine Tabelle je Stufe,
    liefert die alte Fassung die Decks der ersten — und meldet dabei
    100 % Quote, weil sie die anderen nie angegangen ist.
    """
    def tabelle(stufe, ids):
        zellen = "".join(
            f"<td><a href='/archives/{i}'><img alt='D{i} Deck'></a></td>"
            for i in ids)
        return (f"<table><tr><th><img alt='{stufe} Tier'></th></tr>"
                f"<tr>{zellen}</tr></table>")

    seite = ("<html><body>"
             + tabelle("S", [1, 2, 3])
             + tabelle("A", [4, 5, 6])
             + "<table><tr><th>New Mega Rising Decks</th></tr><tr>"
             + "".join(f"<td><a href='/archives/{i}'><img alt='S{i} Deck'>"
                       f"</a><img alt='B Tier'></td>" for i in (7, 8, 9))
             + "</tr></table></body></html>")
    tier, set_decks = mod.lies_seite(seite)
    assert len(tier) == 6, (
        f"zwei Tier-Tabellen zu je drei Decks, gelesen wurden {len(tier)}. "
        f"Nur die erste Tabelle zu nehmen verliert die andere lautlos")
    assert len(set_decks) == 3


def test_ohne_anker_gewinnt_der_erste_TEILTREFFER_nicht_das_erste_muster(mod, monkeypatch):
    """Der Fall 562115, nachgestellt.

    Die Seite heisst "Best Mega Absol ex Decks" und fuehrt mit einem
    Hoopa-Deck. Die alte Regel nahm fuer ankerlose Eintraege
    `abschnitte[0]` mit der Begruendung, Game8 stelle sein
    Hauptvorschlag-Deck nach oben. Die echte Seite widerlegt das.

    Der Name blieb dabei richtig — er kommt aus demselben Abschnitt wie
    der Code. Die STUFE nicht: sie kam aus der Set-Zeile und blieb am
    Eintrag haengen. So stand Mega Absols A+ neben einem Hoopa-Deck.
    """
    seite = _seite("Hoopa ex and Darkrai ex",
                   "Zoroark ex and Mega Absol ex",
                   "Mega Absol ex and Weezing")
    name, adresse, grund = mod.waehle_abschnitt(seite, None, "Mega Absol ex")
    assert grund is None
    assert "Mega Absol ex" in name, (
        f"ankerloser Eintrag 'Mega Absol ex' bekam den Abschnitt '{name}' — "
        f"ein Deck, in dem Mega Absol gar nicht vorkommt")
    assert adresse.endswith("/102/x.png/show"), (
        f"nicht der erste Teiltreffer, sondern {adresse}")


def test_ohne_anker_und_ohne_bezug_gibt_es_keinen_code(mod):
    """Kommt der Name in KEINEM Abschnitt vor, wird nicht geraten.

    Hier fiel der Eintrag frueher bis ans Ende durch und bekam
    `abschnitte[0]` — irgendein Muster der Seite. Ein gemeldeter Ausfall
    ist wiederherstellbar; eine Stufe neben einem fremden Deck sieht
    niemand.
    """
    seite = _seite("Hoopa ex and Darkrai ex", "Greninja and Froslass")
    name, adresse, grund = mod.waehle_abschnitt(seite, None, "Sylveon ex")
    assert adresse is None and name is None, (
        f"'Sylveon ex' kommt auf der Seite nicht vor und bekam trotzdem "
        f"'{name}'")
    assert grund and "Sylveon ex" in grund


def test_zusammengelegte_eintraege_werden_gemeldet(mod, monkeypatch):
    """47 gelesene Eintraege ergaben 31 Zeilen — die 16 dazwischen fielen still weg.

    Weder das Protokoll noch `_meta` sagten etwas davon; `_meta` meldete
    31 + 2, so dass ein Leser auf 33 statt auf 49 Eintraege schloss.
    """
    a = {"name": "Alpha", "tier": "S", "archiv": "1", "anker": "hm_101",
         "quelle_liste": "tier", "code": "GLEICH"}
    b = {"name": "Beta", "tier": "B", "archiv": "2", "anker": None,
         "quelle_liste": "set", "code": "GLEICH"}
    raus, zus = mod._zusammenfuehren([dict(a), dict(b)])
    assert len(raus) == 1
    assert len(zus) == 1, "das Zusammenlegen wurde nicht berichtet"
    assert zus[0]["verloren"] == "Beta"
    assert zus[0]["behalten"] == "Alpha"
    assert zus[0]["art"] == "erwartet", (
        "ein Tier-Eintrag und ein Set-Eintrag mit demselben Code sind "
        "dasselbe Deck — genau dafuer ist das Zusammenlegen da")


def test_zwei_eintraege_derselben_tabelle_mit_gleichem_code_sind_eine_kollision(mod):
    """Und dann darf keine fremde Stufe uebernommen werden.

    Zwei Set-Zeilen mit demselben Code heisst: entweder verlinkt Game8
    zweimal dasselbe Deck, oder wir haben zweimal dasselbe Muster
    gegriffen. Beides ist ein Befund, kein Grund, eine Stufe zu erben.
    """
    a = {"name": "Alpha", "tier": None, "archiv": "1", "anker": None,
         "quelle_liste": "set", "code": "GLEICH"}
    b = {"name": "Beta", "tier": "A+", "archiv": "2", "anker": None,
         "quelle_liste": "set", "code": "GLEICH"}
    raus, zus = mod._zusammenfuehren([dict(a), dict(b)])
    assert zus and zus[0]["art"] == "Kollision", (
        f"zwei Set-Eintraege mit demselben Code wurden als erwartet "
        f"verbucht: {zus}")
    assert raus[0]["tier"] is None, (
        f"'Alpha' hat Betas Stufe geerbt, obwohl nicht feststeht, dass es "
        f"dasselbe Deck ist: {raus[0]}")


def test_die_rechnung_muss_aufgehen(mod, monkeypatch, tmp_path):
    """angegangen = ausgeliefert + ohne Code + zusammengelegt.

    Geht sie nicht auf, verschwindet irgendwo etwas still — und genau
    das war der Befund. Lieber ein Abbruch als eine Datei, deren
    Herkunft sich nicht nachrechnen laesst.
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(12)]
    fertig = [{"name": f"D{i}", "code": f"C{i}"} for i in range(4)]
    monkeypatch.setattr(mod, "AUSGABE", str(tmp_path / "x.json"))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, [], 12, []))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 1, (
        "12 angegangen, 4 ausgeliefert, 0 Ausfaelle, 0 zusammengelegt — "
        "acht Eintraege sind spurlos weg und der Lauf schreibt trotzdem")
    assert not (tmp_path / "x.json").exists()


def test_die_ausgabe_nennt_die_herkunft_der_zahl(mod, monkeypatch, tmp_path):
    """`anzahl` allein laesst sich nicht nachpruefen."""
    tier = [("A", "S", "1", "hm_101", "")]
    fertig = [{"name": "A", "code": "C1"}]
    zus = [{"art": "erwartet", "behalten": "A", "aufgegangen_in": "1",
            "verloren": "A2", "verlorene_stelle": "2", "verlorene_stufe": "B"}]
    ziel = tmp_path / "x.json"
    monkeypatch.setattr(mod, "AUSGABE", str(ziel))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, [("A2", "B", "2", None, "")]))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, [], 2, zus))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 0
    daten = json.loads(ziel.read_text(encoding="utf-8"))
    meta = daten["_meta"]
    assert meta["uebersicht"]["angegangen"] == 2
    assert meta["uebersicht"]["tier_tabelle"] == 1
    assert meta["uebersicht"]["set_tabelle"] == 1
    assert meta["zusammengelegt"], "das Zusammenlegen steht nicht in der Datei"
    assert (meta["anzahl"] + len(meta["ohne_code"]) + len(meta["zusammengelegt"])
            == meta["uebersicht"]["angegangen"]), (
        f"die Zahlen in _meta gehen nicht auf: {meta}")


def test_nur_null_schreibt_nicht(mod, monkeypatch, tmp_path):
    """`--nur 0` lief ueber ALLE Decks und schrieb anschliessend.

    `if nur:` und `if a.nur:` sind bei 0 beide falsch. Wer 0 eintippt,
    meint das Gegenteil von "alles schreiben".
    """
    tier = [(f"D{i}", "S", str(i), f"hm_{i}") for i in range(3)]
    fertig = [{"name": "D0", "code": "C0"}]
    ziel = tmp_path / "x.json"
    monkeypatch.setattr(mod, "AUSGABE", str(ziel))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, []))
    monkeypatch.setattr(mod, "sammle", lambda *a, **k: (fertig, [], 1, []))
    monkeypatch.setattr(sys, "argv", ["x", "--nur", "0"])
    assert mod.main() == 0
    assert not ziel.exists(), "--nur 0 hat die Produktionsdatei geschrieben"


def test_nur_null_geht_null_decks_an(mod, monkeypatch):
    netz = _Netz({f"{mod.BASIS}/games/Pokemon-TCG-Pocket/archives/9": _seite("Alpha")})
    _verkabelt(mod, monkeypatch, netz)
    fertig, _aus, versucht, _zus = mod.sammle(
        [("Alpha", "S", "9", "hm_101", "")], [], nur=0, still=True)
    assert versucht == 0 and fertig == [], (
        f"--nur 0 ging {versucht} Decks an statt keines")


def test_ein_tag_traegt_hoechstens_einen_abschnitt(mod):
    """"2D Pattern" zweimal in einem Tag ergab zwei Abschnitte.

    Damit schlug jede Eindeutigkeitspruefung in waehle_abschnitt fehl,
    obwohl es nur ein Muster gab.
    """
    seite = ("<h3>Alpha Deck</h3>"
             "<img alt='Alpha Deck 2D Pattern QR Code' "
             "title='2D Pattern' data-src='https://img.game8.co/1/a.png'>")
    raus = mod.deck_abschnitte(seite)
    assert len(raus) == 1, f"ein Bild ergab {len(raus)} Abschnitte: {raus}"


def _ablauf():
    """Den Ablauf als YAML lesen, nicht als Text.

    Ein Textvergleich stolpert ueber die Begruendungen in den
    Kommentaren — dort steht `::group::` als Zitat des alten Standes.
    Was zaehlt, ist der Befehl, der laeuft.
    """
    yaml = pytest.importorskip("yaml")
    pfad = os.path.join(WURZEL, ".github", "workflows", "pocket-tierlist.yml")
    with io.open(pfad, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _schritt(name):
    for s in _ablauf()["jobs"]["scrape"]["steps"]:
        if s.get("name") == name:
            return s
    raise AssertionError(f"Schritt '{name}' fehlt im Ablauf")


def _ohne_kommentare(befehl):
    return "\n".join(z for z in befehl.splitlines()
                     if not z.lstrip().startswith("#"))


def test_der_ablauf_faerbt_einen_abbruch_nicht_gruen():
    """`set +e` … `exit 0` hat die harten Abbrueche neutralisiert.

    Fehlende Set-Tabelle, Quote unter zwei Dritteln, Rechnung geht nicht
    auf — alle drei sind dafuer gebaut, dass jemand hinsieht. Mit
    `exit 0` blieb der Lauf gruen und der Rueckfall verschwand in einer
    zugeklappten `::group::`.
    """
    befehl = _ohne_kommentare(_schritt("Run Pocket tier-list scraper")["run"])
    assert "exit $rc" in befehl, (
        "der Scraper-Schritt gibt seinen Rueckgabewert nicht weiter — ein "
        "Abbruch bleibt gruen")
    assert "::group::" not in befehl, (
        "der Lauf steht in einer zugeklappten Gruppe; ein Rueckfall ist "
        "dort nicht zu sehen")
    assert "::error::" in befehl


def test_der_ablauf_committet_nach_einem_abbruch_nicht():
    """Ein eigenes `if:` ersetzt die stillschweigende Bedingung success()."""
    bedingung = str(_schritt("Commit + push")["if"])
    assert "success()" in bedingung, (
        f"der Commit-Schritt laeuft auch nach einem Abbruch: {bedingung}")


def test_die_eingabe_aus_dem_actions_dialog_laeuft_nicht_als_shell_text():
    """`--nur ${{ inputs.nur }}` setzte den Feldinhalt in die Befehlszeile."""
    schritt = _schritt("Run Pocket tier-list scraper")
    befehl = _ohne_kommentare(schritt["run"])
    assert "${{" not in befehl, (
        f"eine Actions-Einsetzung steht direkt in der Befehlszeile: "
        f"{[z for z in befehl.splitlines() if '${{' in z]}")
    assert "NUR" in schritt.get("env", {}), (
        "die Eingabe kommt nicht ueber die Umgebung herein")


# ── Der Abschnitt der Set-Tabelle (16.09.2026) ────────────────────────
#
# ANLASS (Betreiber): „bei neues Set sollten ja nur die New Team
# Rocket's Ambition Decks und Old Decks Updated with Team Rocket's
# Ambition inklusive der Tiers".
#
# Die Set-Tabelle ist keine flache Liste. Ihre zwei Ueberschriften sagen
# etwas, das die Stufe nicht sagt: ob ein Deck MIT dem Set neu ist oder
# ein bestehendes, das durch das Set besser wurde. Bis hierher hat der
# Lauf die Ueberschrift gelesen und weggeworfen.

SET_TABELLE = """
<table>
  <tr><th>New Alpha Decks</th></tr>
  <tr><td><a href="/games/x/archives/11"><img alt="Neu Eins Deck"></a>
          <img alt="B Tier"></td></tr>
  <tr><th>Old Decks Updated with Alpha</th></tr>
  <tr><td><a href="/games/x/archives/22"><img alt="Alt Eins Deck"></a>
          <img alt="S Tier"></td>
      <td><a href="/games/x/archives/33"><img alt="Alt Zwei Deck"></a>
          <img alt="A Tier"></td></tr>
</table>
"""


def _tab(html):
    from bs4 import BeautifulSoup
    return BeautifulSoup(html, "lxml").find("table")


def test_die_set_tabelle_traegt_ihre_abschnitte_mit(mod):
    zeilen = mod.lies_tabelle(_tab(SET_TABELLE))
    nach_id = {aid: abschnitt for _n, _s, aid, _k, abschnitt in zeilen}
    assert nach_id["11"] == "New Alpha Decks", (
        "das erste Deck traegt nicht die Ueberschrift, unter der es steht")
    assert nach_id["22"] == "Old Decks Updated with Alpha"
    assert nach_id["33"] == "Old Decks Updated with Alpha", (
        "die zweite Zelle derselben Zeile hat den Abschnitt verloren")


def test_die_stufen_ueberschrift_ist_kein_abschnitt(mod):
    """Die Tier-Tabelle hat Ueberschriften, aber keine Abschnitte.

    Dort steht in der Ueberschrift die STUFE, und die steht schon im
    zweiten Feld. Landete sie zusaetzlich im Abschnitt, gruppierte der
    Reiter unter „Neues Set" nach Stufennamen — also genau nach dem, was
    er gerade NICHT zeigen soll.
    """
    tier = """
    <table>
      <tr><th><img alt="S Tier"></th></tr>
      <tr><td><a href="/games/x/archives/44"><img alt="Nur Tier Deck"></a></td></tr>
    </table>
    """
    zeilen = mod.lies_tabelle(_tab(tier))
    assert [a for *_r, a in zeilen] == [""], (
        f"die Tier-Tabelle liefert Abschnitte: {[a for *_r, a in zeilen]}")


def test_der_abschnitt_ueberlebt_das_zusammenlegen(mod, monkeypatch):
    """Sieben von 28 Set-Zeilen zeigen auf ein Deck unter anderer Nummer.

    Gemessen am 16.09.2026 gegen die echte Seite. Faellt der Abschnitt
    beim Zusammenlegen weg, verliert der Reiter fuer diese sieben die
    Aufteilung — und zwar still.
    """
    behalten = {"name": "A", "tier": "S", "archiv": "1", "anker": "hm_1",
                "quelle_liste": "tier", "set_abschnitt": "", "code": "X"}
    verloren = {"name": "A", "tier": "S", "archiv": "2", "anker": None,
                "quelle_liste": "set", "set_abschnitt": "New Alpha Decks", "code": "X"}
    reihe, zusammen = mod._zusammenfuehren([behalten, verloren])
    assert len(reihe) == 1, "die beiden haetten zusammenfallen muessen"
    assert reihe[0]["set_abschnitt"] == "New Alpha Decks", (
        "der Abschnitt ging beim Zusammenlegen verloren")
    assert zusammen, "das Zusammenlegen wurde nicht festgehalten"


def test_nur_die_set_tabelle_setzt_einen_abschnitt(mod):
    """Ein Tier-Eintrag darf keinen Abschnitt tragen.

    Sonst stuende in der Datei ein Abschnitt an einem Deck, das in der
    Set-Tabelle gar nicht vorkommt — eine Behauptung ueber die Quelle,
    die die Quelle nicht deckt. Der Reiter gruppierte unter „Neues Set"
    dann nach Stufennamen, also nach genau dem, was er dort NICHT zeigen
    soll.
    """
    alle = mod.baue_eintraege(
        [("Nur Tier", "S", "9", "hm_1", "Ueberschrift der Tier-Tabelle")],
        [])
    d = list(alle.values())[0]
    assert d["set_abschnitt"] == "", (
        f"ein Tier-Eintrag traegt den Abschnitt {d['set_abschnitt']!r}")


def test_ein_set_eintrag_bringt_den_abschnitt_an_ein_tier_deck(mod):
    """Der haeufigste Fall: dasselbe Deck steht in beiden Tabellen.

    Elf der 33 Decks sind das (gemessen 16.09.2026). Kaeme der Abschnitt
    dabei nicht mit, stuenden sie unter „Neues Set" ohne Ueberschrift —
    und das sind gerade die bekanntesten.
    """
    alle = mod.baue_eintraege(
        [("A", "S", "9", None, "")],
        [("A", "S", "9", None, "New Alpha Decks")])
    d = list(alle.values())[0]
    assert d["quelle_liste"] == "beide"
    assert d["set_abschnitt"] == "New Alpha Decks", (
        "der Set-Eintrag hat den Abschnitt nicht an das Tier-Deck weitergegeben")


def test_die_reihenfolge_der_abschnitte_steht_in_meta(mod, monkeypatch, tmp_path):
    """Gefunden bei der Live-Abnahme am 16.09.2026, nicht von einem Test.

    Der Reiter zeigte „Old Decks Updated …" ueber „New … Decks", Game8
    zeigt es andersherum. Die Oberflaeche ordnete nach erstem Auftreten
    in der nach Stufe sortierten Deckliste — und weil das staerkste Deck
    zufaellig ein aktualisiertes war, stand der zweite Abschnitt oben.

    Die Reihenfolge kennt nur die Quellseite. Sie gehoert deshalb in die
    Daten und nicht in eine Regel im Browser: die Ueberschriften wechseln
    mit jedem Set, eine feste Liste im Code waere beim naechsten Set
    falsch.
    """
    # `main` bricht bei leerer Tier-Liste ab (Aufbau der Seite geaendert) —
    # deshalb steht hier ein Eintrag, der mit der Frage nichts zu tun hat.
    tier = [("T", "S", "9", "hm_1", "")]
    set_decks = [
        ("Neu", "S", "1", None, "New Alpha Decks"),
        ("Alt", "A", "2", None, "Old Decks Updated with Alpha"),
        ("Neu2", "B", "3", None, "New Alpha Decks"),
    ]
    ziel = tmp_path / "x.json"
    monkeypatch.setattr(mod, "AUSGABE", str(ziel))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, set_decks))
    monkeypatch.setattr(mod, "sammle",
                        lambda *a, **k: ([{"name": "Neu", "code": "C"}], [], 1, []))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 0
    meta = json.loads(ziel.read_text(encoding="utf-8"))["_meta"]
    assert meta["set_abschnitte"] == [
        "New Alpha Decks", "Old Decks Updated with Alpha"], (
        f"die Reihenfolge der Quelle kam nicht durch: {meta.get('set_abschnitte')!r}")


def test_die_abschnittsliste_ist_ohne_wiederholung_und_ohne_leere(mod, monkeypatch, tmp_path):
    """Zwei Fallen auf einmal.

    Ein `set` waere hier falsch (es hat keine Reihenfolge), eine blosse
    Liste waere es auch (dieselbe Ueberschrift steht an jedem Deck
    darunter). Und ein Eintrag ohne Abschnitt — der Normalfall bei der
    Tier-Tabelle — darf keinen leeren Abschnitt in die Liste schreiben:
    die Oberflaeche zeigt Decks ohne Abschnitt bewusst am ENDE, mit einer
    eigenen Auskunft.
    """
    tier = [("T", "S", "9", "hm_1", "")]
    set_decks = [
        ("A", "S", "1", None, "Zwei"),
        ("B", "A", "2", None, ""),
        ("C", "B", "3", None, "Eins"),
        ("D", "B", "4", None, "Zwei"),
    ]
    ziel = tmp_path / "x.json"
    monkeypatch.setattr(mod, "AUSGABE", str(ziel))
    monkeypatch.setattr(mod, "hole", lambda *a, **k: "<html></html>")
    monkeypatch.setattr(mod, "lies_seite", lambda h: (tier, set_decks))
    monkeypatch.setattr(mod, "sammle",
                        lambda *a, **k: ([{"name": "A", "code": "C"}], [], 1, []))
    monkeypatch.setattr(sys, "argv", ["x"])
    assert mod.main() == 0
    liste = json.loads(ziel.read_text(encoding="utf-8"))["_meta"]["set_abschnitte"]
    assert liste == ["Zwei", "Eins"], f"weder Reihenfolge noch Eindeutigkeit: {liste!r}"
    assert "" not in liste, "ein leerer Abschnitt steht in der Liste"


def test_die_ausgelieferte_datei_fuehrt_jede_benutzte_ueberschrift(mod):
    """Die Gegenprobe an den echten Daten, in BEIDE Richtungen.

    Steht an einem Deck ein Abschnitt, den `_meta.set_abschnitte` nicht
    kennt, landet er in der Oberflaeche am Ende — und niemand merkt es.
    Steht in der Liste eine Ueberschrift, die an keinem Deck haengt,
    hat sich die Quelle geaendert, ohne dass die Decks nachgezogen sind.
    """
    datei = os.path.join(WURZEL, "data", "pocket_tierlist.json")
    with io.open(datei, encoding="utf-8") as f:
        daten = json.load(f)
    ordnung = daten["_meta"].get("set_abschnitte")
    assert ordnung, "die ausgelieferte Datei fuehrt keine Abschnittsreihenfolge"
    benutzt = {d.get("set_abschnitt") for d in daten["decks"] if d.get("set_abschnitt")}
    assert benutzt <= set(ordnung), (
        f"Abschnitte an Decks, die _meta nicht kennt: {benutzt - set(ordnung)}")
    assert set(ordnung) <= benutzt, (
        f"Abschnitte in _meta, die an keinem Deck haengen: {set(ordnung) - benutzt}")
