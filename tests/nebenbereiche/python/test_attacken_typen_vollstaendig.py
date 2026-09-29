"""Jede in Champions genutzte Attacke muss einen Typ haben.

BEFUND (09.09.2026): sechs Attacken standen auf der Pokedex-Seite als
"Typ unbekannt" — Barb Barrage, Make It Rain, No Retreat, Rage Fist,
Spirit Break, Topsy-Turvy. Die Anzeige war korrekt: sie hatten in
data/champions_resources.json ueberhaupt keinen Eintrag.

Ursache war der Bauer. scripts/build_champions_resources.py hat aus dem
Quelldatensatz (otterlyclueless/pokemon-champions-data) nur Attacken mit
`inChampions: true` uebernommen. Bei diesen sechs steht der Schalter auf
false, obwohl die Champions-Nutzungsdaten (data/champions_usage.json)
belegen, dass Pokemon sie in Champions tatsaechlich einsetzen. Der Bauer
traegt sie jetzt nach und markiert sie mit `nachgetragen: true`.

WIE STARK DER BELEG IST — nachgemessen, weil die erste Fassung dieser
Datei mehr behauptet hat, als der Code haelt: `championsVerified` steht
in der Quelle bei 900 von 900 Attacken auf true und taugt nicht als
Beleg; einen Typ haben ebenfalls alle 900. Der einzig wirksame Beleg ist
das Vorkommen in den Nutzungsdaten. Der Bauer begrenzt den Nachtrag
deshalb der Zahl nach (NACHTRAG_OBERGRENZE): sechs Ausreisser sind ein
Quellfehler, sechzig waeren ein Scraper-Fehler.

Dieser Test haelt den Zustand fest, den der Nutzer sieht: keine genutzte
Attacke ohne Typ. Er prueft die ausgelieferten Daten, nicht nur den
Bauer — ein Bauer, der richtig rechnet und dessen Ergebnis niemand
committet, hilft der Seite nicht.
"""

import io
import json
import os
import re
import tokenize

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DATA = os.path.join(ROOT, "data")


def _norm(s):
    """Dieselbe Normalisierung, die der Bauer beim Abgleich benutzt.

    Der Bauer trifft ueber norm(); wer hier roh vergleicht, meldet eine
    Schreibvariante der Quelle ("Topsy Turvy" ohne Bindestrich) als
    fehlenden Eintrag, obwohl die Daten stimmen — ein roter Deploy ohne
    Fehler.
    """
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def _ohne_kommentar(quelltext):
    """Kommentare raus, bevor eine Zusicherung im Quelltext sucht.

    Ueber tokenize statt ueber einen Zeilen-Regex: der Regex traf nur
    ganzzeilige Kommentare, ein nachgestellter blieb stehen und konnte
    eine Zusicherung gruen halten. Beim Mutationstest am 09.09.2026 ist
    genau das passiert — der erklaerende Kommentar im Bauer nannte den
    Dateinamen, und die Pruefung war zufrieden, obwohl der Code die
    Datei nicht mehr oeffnete.
    """
    zeilen = quelltext.splitlines()
    for tok in tokenize.generate_tokens(io.StringIO(quelltext).readline):
        if tok.type != tokenize.COMMENT:
            continue
        nr, spalte = tok.start
        zeilen[nr - 1] = zeilen[nr - 1][:spalte]
    return "\n".join(zeilen)


def _lade(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _genutzte_attacken():
    """norm(EN) -> Anzeigename, aus den Nutzungsdaten."""
    nutzung = _lade("champions_usage.json")
    namen = {}
    for eintrag in (nutzung.get("pokemon") or {}).values():
        if not isinstance(eintrag, dict):
            continue
        for modus in ("doubles", "singles"):
            block = eintrag.get(modus)
            if not isinstance(block, dict):
                continue
            for m in (block.get("move") or []):
                if isinstance(m, dict) and m.get("name"):
                    namen[_norm(m["name"])] = m["name"]
    return namen


def _attacken_im_nachschlagewerk():
    """norm(EN) -> Eintrag, nur cat == move."""
    res = _lade("champions_resources.json")
    return {_norm(e["en"]): e for e in res["entries"] if e.get("cat") == "move"}


# Die sechs vom 09.09.2026, mit Typ und deutschem Namen.
# Typen aus dem Quelldatensatz (otterlyclueless), deutsche Namen aus
# data/de_name_overrides.json (PokeWiki) — gegengeprueft an den
# Wiki-Seiten: Goldrausch = Stahl, Finalformation = Kampf.
NACHTRAG_ERWARTET = {
    "Barb Barrage": ("Poison", "Giftstachelregen"),
    "Make It Rain": ("Steel", "Goldrausch"),
    "No Retreat": ("Fighting", "Finalformation"),
    "Rage Fist": ("Ghost", "Zornesfaust"),
    "Spirit Break": ("Fairy", "Seelenbruch"),
    "Topsy-Turvy": ("Dark", "Invertigo"),
}


def test_nutzungsdaten_liefern_ueberhaupt_attacken():
    """Schutz gegen einen gruenen Test auf leerer Menge."""
    genutzt = _genutzte_attacken()
    assert len(genutzt) >= 300, (
        "Nur %d genutzte Attacken gefunden — die Nutzungsdaten sind duenn "
        "oder ihre Struktur hat sich geaendert. Ohne sie prueft der Rest "
        "dieser Datei nichts." % len(genutzt)
    )


def test_jede_genutzte_attacke_hat_einen_eintrag():
    genutzt = _genutzte_attacken()
    bekannt = _attacken_im_nachschlagewerk()
    fehlend = sorted(genutzt[k] for k in set(genutzt) - set(bekannt))
    assert not fehlend, (
        "Diese genutzten Attacken haben keinen Eintrag in "
        "champions_resources.json und erscheinen auf der Seite als "
        "'Typ unbekannt': %s. Fuehrt der Quelldatensatz sie, gehoert der "
        "Nachtrag in scripts/build_champions_resources.py; fuehrt er sie "
        "nicht, gehoert der Befund dokumentiert — nicht geraten."
        % ", ".join(fehlend)
    )


def test_jede_genutzte_attacke_hat_einen_typ():
    genutzt = _genutzte_attacken()
    bekannt = _attacken_im_nachschlagewerk()
    ohne_typ = sorted(
        genutzt[k] for k in genutzt
        if k in bekannt and not str(bekannt[k].get("type") or "").strip()
    )
    assert not ohne_typ, (
        "Diese genutzten Attacken haben einen Eintrag, aber ein leeres "
        "Typ-Feld: %s. Die Typwirksamkeit im Pokedex kann fuer sie nichts "
        "rechnen." % ", ".join(ohne_typ)
    )


def test_die_nachgetragenen_stimmen_mit_der_quelle_ueberein():
    """Die konkreten sechs — aber nur, solange sie genutzt werden.

    Der Nachtrag wird bei jedem Lauf aus den Nutzungsdaten neu
    hergeleitet, und die sind volatil: Spirit Break steht dort genau
    einmal (Grimmsnarl, Einzelkampf), Topsy-Turvy bei Malamar auf Platz
    10 von 10. Faellt so ein Pokemon aus der Ladder-Statistik, laesst der
    Bauer die Attacke voellig zu Recht weg. Eine feste Sechserliste
    wuerde dann rot und den Deploy blockieren, obwohl alles richtig
    gerechnet hat.

    Deshalb: geprueft wird jede der sechs, die heute noch in den
    Nutzungsdaten steht. Verschwundene werden benannt, nicht bestraft.
    """
    genutzt = _genutzte_attacken()
    bekannt = _attacken_im_nachschlagewerk()
    geprueft, entfallen = [], []
    for en, (typ, de) in NACHTRAG_ERWARTET.items():
        key = _norm(en)
        if key not in genutzt:
            entfallen.append(en)
            continue
        geprueft.append(en)
        assert key in bekannt, "%s wird genutzt, fehlt aber im Nachschlagewerk" % en
        e = bekannt[key]
        assert e.get("type") == typ, (
            "%s: Typ ist %r, erwartet %r" % (en, e.get("type"), typ))
        assert e.get("de") == de, (
            "%s: deutscher Name ist %r, erwartet %r" % (en, e.get("de"), de))
        assert e.get("nachgetragen") is True, (
            "%s muss als nachgetragen markiert sein — sonst sieht der "
            "naechste Leser nicht, dass der inChampions-Schalter der "
            "Quelle hier uebergangen wurde." % en)
    assert geprueft, (
        "Keine der sechs steht noch in den Nutzungsdaten (%s). Das ist "
        "kein Fehler dieser Aenderung, macht diese Pruefung aber leer — "
        "wer das sieht, sollte den Nachtrag neu belegen."
        % ", ".join(entfallen)
    )


def test_nachgetragene_sind_nicht_geraten():
    """Jeder nachgetragene Eintrag muss in den Nutzungsdaten stehen.

    Ein Nachtrag ohne Nutzungsbeleg waere genau das, was der Nachtrag
    nicht sein darf: eine Behauptung darueber, was in Champions spielbar
    ist. Der Beleg ist dieselbe Datei, aus der der Bauer liest — dieser
    Test faengt also einen Fehler im Bauer oder eine Handaenderung an
    der JSON, nicht einen Fehler im Scraper. Gegen den steht die
    Obergrenze im Bauer.
    """
    genutzt = _genutzte_attacken()
    nachgetragen = {k: e for k, e in _attacken_im_nachschlagewerk().items()
                    if e.get("nachgetragen")}
    assert nachgetragen, "Kein einziger nachgetragener Eintrag gefunden."
    ohne_beleg = sorted(e["en"] for k, e in nachgetragen.items() if k not in genutzt)
    assert not ohne_beleg, (
        "Nachgetragen ohne Beleg in den Nutzungsdaten: %s"
        % ", ".join(ohne_beleg)
    )


def test_bauer_traegt_aus_den_nutzungsdaten_nach():
    """Der Bauer selbst — sonst faellt der Nachtrag beim naechsten Lauf weg.

    Die Daten oben koennen von Hand richtig sein und beim naechsten
    CI-Lauf trotzdem wieder verschwinden.
    """
    pfad = os.path.join(ROOT, "scripts", "build_champions_resources.py")
    quelle = _ohne_kommentar(open(pfad, encoding="utf-8").read())
    assert 'os.path.join(DATA, "champions_usage.json")' in quelle, (
        "Der Bauer oeffnet die Nutzungsdaten nicht — der Nachtrag ist beim "
        "naechsten Lauf wieder weg."
    )
    assert "nachgetragen=True" in quelle, (
        "Der Bauer markiert nichts als nachgetragen."
    )
    assert 'mv.get("type")' in quelle, (
        "Der Bauer prueft beim Nachtrag nicht, ob die Quelle einen Typ "
        "fuehrt — damit koennte er typlose Eintraege erzeugen."
    )
    assert "NACHTRAG_OBERGRENZE" in quelle, (
        "Der Bauer hat keine Obergrenze mehr. Ein verrutschter Scraper "
        "koennte dann beliebig viele Nicht-Champions-Attacken einspielen, "
        "und der einzige Beleg des Nachtrags waere genau dieser Scraper."
    )


def test_leere_nutzungsdaten_brechen_den_lauf_ab():
    """Eine leere, aber gueltige Nutzungsdatei darf nicht durchgehen.

    Vorher sah dieser Fall aus wie ein normaler Lauf: keine Meldung,
    494 Attacken, Rueckgabewert 0, committet — und die Nachtraege still
    wieder weg. Der Bauer muss abbrechen, damit die CI-Absicherung den
    committeten Stand behaelt.
    """
    pfad = os.path.join(ROOT, "scripts", "build_champions_resources.py")
    quelle = _ohne_kommentar(open(pfad, encoding="utf-8").read())
    assert "if not genutzt:" in quelle and "raise ValueError" in quelle, (
        "Der Bauer bricht bei leeren Nutzungsdaten nicht ab."
    )


def test_das_nachschlagewerk_wird_nach_den_nutzungsdaten_gebaut():
    """Reihenfolge in CI — sonst baut der Bauer auf dem Vortagesstand.

    In beiden Laeufen, die champions_usage.json committen, muss der
    Bauer NACH dem Scraper AUFGERUFEN werden und
    champions_resources.json muss im `git add` stehen. Sonst kann eine
    neu aufgetauchte Attacke ohne Eintrag im Repo landen — und der
    naechste Deploy faellt auf diesem Test um, ohne dass jemand etwas
    falsch gemacht hat.

    Geprueft wird der AUFRUF ("python -u scripts/…"), nicht die blosse
    Erwaehnung des Dateinamens: beim Mutationstest am 09.09.2026 hat
    der erklaerende Kommentar in derselben Datei die schwaechere
    Fassung dieser Pruefung gruen gehalten.
    """
    wf = os.path.join(ROOT, ".github", "workflows")
    AUFRUF_BAU = "python -u scripts/build_champions_resources.py"
    AUFRUF_SCRAPE = "python -u scripts/scrape_champions_usage.py"

    for datei in ("champions-replica-scrape.yml", "champions-usage-refresh.yml"):
        text = open(os.path.join(wf, datei), encoding="utf-8").read()
        assert AUFRUF_SCRAPE in text, (
            "%s ruft den Usage-Scraper nicht auf" % datei)
        assert AUFRUF_BAU in text, (
            "%s committet die Nutzungsdaten, ohne das Nachschlagewerk neu "
            "zu bauen. Eine neu aufgetauchte Attacke bliebe dann ohne "
            "Eintrag." % datei)
        assert text.index(AUFRUF_SCRAPE) < text.index(AUFRUF_BAU), (
            "%s baut das Nachschlagewerk VOR dem Usage-Scrape — der Bauer "
            "arbeitet dann mit dem Vortagesstand." % datei)

    # Der Neubau muss auch mitcommittet werden, sonst bleibt er im Runner.
    refresh = open(os.path.join(wf, "champions-usage-refresh.yml"),
                   encoding="utf-8").read()
    anfang = refresh.index("git add ")
    ende = refresh.index("git diff --cached", anfang)
    assert "data/champions_resources.json" in refresh[anfang:ende], (
        "champions-usage-refresh.yml nimmt champions_resources.json nicht "
        "in den Commit auf — der Neubau bliebe im Runner liegen."
    )
