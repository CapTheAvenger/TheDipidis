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

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "scrape_pocket_tierlist.py")
FIXTURE = os.path.join(WURZEL, "tests", "fixtures", "game8_pocket_tierlist.html")


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

def test_beide_tabellen_werden_gefunden(gelesen):
    tier, set_decks = gelesen
    assert tier, ("keine Tier-Liste gelesen — ohne sie hat der Reiter "
                  "keinen Inhalt")
    assert set_decks, ("keine Set-Decks gelesen. Der Betreiber wollte "
                       "ausdruecklich beides: 'die Tier List [...] + die new "
                       "set xy Decks'")


def test_die_stufe_gehoert_zum_richtigen_deck(gelesen):
    """Der haeufigste stille Fehler bei so einer Tabelle.

    Der Aufbau ist <th> mit der Stufe, danach <td> mit den Decks. Wer die
    Zuordnung um eine Zeile verschiebt, bekommt eine Liste, die
    plausibel aussieht und in der jedes Deck falsch einsortiert ist.
    """
    tier, _ = gelesen
    nach_namen = {n: s for n, s, _ in tier}
    assert nach_namen.get("Chien-Pao ex and Baxcalibur") == "S"
    assert nach_namen.get("Mega Altaria ex and PD Espeon") == "S"
    assert nach_namen.get("Hoopa ex and Darkrai ex") == "A+", (
        "A+ wurde nicht als eigene Stufe erkannt — die Stufen der Seite "
        "sind S, A+, A, B, C, D, und A+ ist nicht A")
    assert nach_namen.get("TR Articuno ex") == "B"


def test_die_stufen_stehen_in_der_reihenfolge_der_seite(gelesen):
    tier, _ = gelesen
    reihe = []
    for _, s, _ in tier:
        if not reihe or reihe[-1] != s:
            reihe.append(s)
    assert reihe == ["S", "A+", "B"], (
        f"die Stufen kommen in der Reihenfolge {reihe} — die Seite fuehrt "
        f"sie von stark nach schwach, und die Oberfläche uebernimmt diese "
        f"Reihenfolge ungeprueft")


def test_das_wort_deck_faellt_aus_dem_namen(gelesen):
    tier, _ = gelesen
    mit = [n for n, _, _ in tier if n.endswith(" Deck")]
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
    nach_namen = {n: s for n, s, _ in set_decks}
    assert nach_namen.get("PD Espeon") == "S"
    assert nach_namen.get("TR Articuno ex") == "B"
    assert nach_namen.get("Suicune ex") == "S"
    assert len(set(nach_namen.values())) > 1, (
        "alle Set-Decks haben dieselbe Stufe — dann ist die Zuordnung je "
        "Zelle verlorengegangen")


def test_die_archiv_nummer_wird_mitgelesen(gelesen):
    tier, _ = gelesen
    ohne = [n for n, _, a in tier if not (a or "").isdigit()]
    assert not ohne, (f"ohne Archivnummer laesst sich die Deck-Seite nicht "
                      f"aufrufen und der Scan-Code nicht holen: {ohne}")


# ── Das verzögerte Laden ──────────────────────────────────────────────

def test_der_qr_kommt_aus_data_src_nicht_aus_src(mod):
    """Game8 laedt Bilder verzoegert.

    In `src` sitzt ein 1x1-Platzhalter als Daten-URL, die echte Adresse
    steht in `data-src`. Wer `src` liest, bekommt kein Bild und keinen
    Fehler — nur ein leeres Ergebnis.
    """
    html = ('<img alt="Foo Deck 2D Pattern QR Code" '
            'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" '
            'data-src="https://img.game8.co/1/echt.png/show">')
    assert mod.qr_adresse(html) == "https://img.game8.co/1/echt.png/show", (
        "der Parser nimmt den Platzhalter statt der echten Adresse")


def test_ohne_qr_auf_der_seite_gibt_es_keine_erfundene_adresse(mod):
    assert mod.qr_adresse("<img alt='irgendein Bild' data-src='x.png'>") is None, (
        "der Parser liefert eine Adresse fuer eine Seite ohne 2D-Muster — "
        "dann laedt der Scraper irgendein Bild und versucht, einen QR "
        "darin zu finden")


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
    for paket in ["zxing-cpp", "segno", "pillow"]:
        assert paket in zusammen.lower(), (
            f"{paket} fehlt in den pip-install-Zeilen von deploy-pages.yml. "
            f"Dann ueberspringt pytest die QR-Gegenprobe still, der Lauf ist "
            f"gruen, und niemand hat geprueft, ob die Scan-Codes das "
            f"Neu-Erzeugen ueberleben. Zeilen: {zeilen}")


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
