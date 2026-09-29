"""Das Fenster im Speed-Korpus gilt der AUSWAHL, nicht dem Inhalt.

BEFUND (10.09.2026): `data/champions_speed_corpus.json` trug in `_meta`
ein 14-Tage-Fenster (2026-08-26 bis 2026-09-09) — und 190 der 644 Proben
lagen ausserhalb. Das sind 29,5 %; die aelteste Probe ist vom
2026-06-19, also 68 Tage vor `window_start`.

Wer `_meta` las und "das sind die letzten 14 Tage" schloss, lag bei
knapp einem Drittel der Daten falsch. Und die drei Kommentare in
js/app-side-quest-play.js schlossen genau das.

DAS IST KEIN FEHLER IM AUFBAU. champions_replica_scraper.py setzt den
Korpus absichtlich aus zwei Zufluessen zusammen: dem Fenster-Pool UND
den ranggewaehlten Spitzenteams, die keine Datumsschranke tragen. Der
Kommentar dort sagt es sogar ("at least as broad as what we display").

Der Fehler war, dass die Datei eine Eigenschaft behauptete, die ihr
Inhalt nicht hat. Behoben nicht durch Wegwerfen von Daten, sondern
durch eine ehrliche Beschriftung: `window_applies_to` sagt, worauf sich
das Fenster bezieht, `content_from`/`content_to` sagen, was wirklich
drinsteht, und `samples_outside_window` nennt die Zahl.

DIE REGEL, die diese Datei haelt: jede Zahl in `_meta` muss aus dem
Inhalt der Datei nachrechenbar sein. Kein Feld darf etwas behaupten,
das die Proben widerlegen.
"""

import datetime
import json
import os
import re

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DATEI = os.path.join(WURZEL, "data", "champions_speed_corpus.json")
SCRAPER = os.path.join(WURZEL, "backend", "scrapers", "champions_replica_scraper.py")

with open(DATEI, encoding="utf-8") as f:
    KORPUS = json.load(f)
META = KORPUS["_meta"]
PROBEN = KORPUS["samples"]

_MONATE = {m.lower(): i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def _tag(roh):
    """Dieselben Schreibweisen wie parse_date_shared im Scraper."""
    s = (roh or "").strip()
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$", s)
    if m:
        monat = _MONATE.get(m.group(2)[:3].lower())
        if monat:
            try:
                return datetime.date(int(m.group(3)), monat, int(m.group(1)))
            except ValueError:
                return None
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    return None


TAGE = sorted(t for t in (_tag(p.get("date")) for p in PROBEN) if t)


def test_die_datei_hat_ueberhaupt_lesbare_proben():
    """Vorpruefung gegen ein leeres Bestehen."""
    assert len(PROBEN) > 100, f"nur {len(PROBEN)} Proben"
    assert len(TAGE) == len(PROBEN), (
        f"{len(PROBEN) - len(TAGE)} Proben tragen kein lesbares Datum — "
        f"dann pruefen die Zusicherungen unten nur einen Teil"
    )


def test_der_angegebene_inhaltsbereich_stimmt():
    assert META.get("content_from") == TAGE[0].isoformat(), (
        f"content_from sagt {META.get('content_from')}, aelteste Probe "
        f"ist {TAGE[0]}"
    )
    assert META.get("content_to") == TAGE[-1].isoformat(), (
        f"content_to sagt {META.get('content_to')}, juengste Probe "
        f"ist {TAGE[-1]}"
    )


def test_die_zahl_der_proben_ausserhalb_des_fensters_stimmt():
    ab = datetime.date.fromisoformat(META["window_start"])
    bis = datetime.date.fromisoformat(META["window_end"])
    gezaehlt = len([t for t in TAGE if not (ab <= t <= bis)])
    assert META.get("samples_outside_window") == gezaehlt, (
        f"_meta sagt {META.get('samples_outside_window')} Proben ausserhalb "
        f"des Fensters, gezaehlt sind es {gezaehlt}"
    )


def test_das_fenster_sagt_selbst_wofuer_es_gilt():
    """Ohne diesen Satz liest sich das Fenster wieder als Aussage ueber
    den Inhalt — und genau das war der Fehler."""
    hinweis = META.get("window_applies_to") or ""
    assert hinweis, "window_applies_to fehlt"
    assert "pool" in hinweis.lower(), (
        f"window_applies_to erklaert nicht, dass das Fenster der Auswahl "
        f"gilt: {hinweis!r}"
    )
    assert "content_from" in hinweis, (
        "window_applies_to verweist nicht auf die Felder, die den Inhalt "
        "beschreiben"
    )


def test_die_teamzahlen_sind_zwei_verschiedene_zahlen():
    """team_count = geholte Teams, teams_with_samples = die, die auch
    Proben geliefert haben. Sie standen bisher als eine Zahl da."""
    mit_proben = len({p.get("replica") for p in PROBEN if p.get("replica")})
    assert META.get("teams_with_samples") == mit_proben, (
        f"teams_with_samples sagt {META.get('teams_with_samples')}, "
        f"gezaehlt sind {mit_proben} verschiedene Replica-Kennungen"
    )
    assert META.get("team_count") >= mit_proben, (
        "es koennen nicht mehr Teams Proben liefern als geholt wurden — "
        "eine der beiden Zahlen ist falsch"
    )


def test_die_einfachen_zahlen_stimmen_auch():
    assert META.get("sample_count") == len(PROBEN)
    assert META.get("species_count") == len({p["species"] for p in PROBEN})


def test_der_scraper_schreibt_dieselben_felder():
    """Sonst wirft der naechste Lauf die ehrliche Beschriftung weg."""
    with open(SCRAPER, encoding="utf-8") as f:
        quelle = f.read()
    for feld in ("window_applies_to", "content_from", "content_to",
                 "samples_outside_window", "teams_with_samples"):
        assert f"'{feld}'" in quelle, (
            f"der Scraper schreibt {feld} nicht — der naechste Lauf "
            f"entfernt es wieder aus der Datei"
        )


def test_kein_kommentar_behauptet_mehr_ein_14_tage_fenster():
    """js/app-side-quest-play.js schloss aus dem Fenster auf den Inhalt.
    Erlaubt bleibt der Satz, der den Irrtum ERKLAERT."""
    pfad = os.path.join(WURZEL, "js", "app-side-quest-play.js")
    with open(pfad, encoding="utf-8") as f:
        text = f.read()
    treffer = [z.strip() for z in text.split("\n")
               if re.search(r"14-day window|14-Tage-Fenster", z)]
    erlaubt = [z for z in treffer if "NICHT" in z or "siehe" in z]
    uebrig = [z for z in treffer if z not in erlaubt]
    assert not uebrig, (
        "diese Kommentare behaupten weiterhin ein 14-Tage-Fenster ueber "
        f"den Inhalt: {uebrig}"
    )
