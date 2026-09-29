"""Ein Retry-After der Quelle darf den Wochenlauf nicht verhungern lassen.

BEFUND (29.09.2026): `safe_fetch_html` uebernahm den Retry-After-Kopf
ungeprueft. Gemessen mit einem lokalen 429-Server und "Retry-After: 3600":
Schlafzeiten [3600, 3600] fuer EINE Adresse — der Wochenlauf haette sein
Job-Limit (300 min) erreicht und waere ohne Push und ohne Artefakt
gestorben.

Die Zusicherung fuehrt `safe_fetch_html` aus, mit einer gesetzten Antwort
429 und einem aufgezeichneten `time.sleep`.
"""
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

import card_scraper_shared as css  # noqa: E402


class Antwort:
    status_code = 429
    text = ""

    def __init__(self, kopf):
        self.headers = {"Retry-After": kopf} if kopf is not None else {}

    def raise_for_status(self):
        raise RuntimeError("429")


class Scraper:
    def __init__(self, kopf):
        self.kopf = kopf

    def get(self, url, timeout=None):
        return Antwort(self.kopf)


def _lauf(monkeypatch, kopf):
    schlaf = []
    monkeypatch.setattr(css, "_get_scraper", lambda: Scraper(kopf))
    monkeypatch.setattr(css.time, "sleep", lambda s: schlaf.append(s))
    monkeypatch.setattr(css, "_curl_cffi_fetch", lambda *a, **k: "")
    css.safe_fetch_html("https://example.invalid/", retries=2, quiet=True)
    return schlaf


def test_eine_stunde_retry_after_wird_gedeckelt(monkeypatch):
    schlaf = _lauf(monkeypatch, "3600")
    assert schlaf, "bei 429 wird gar nicht gewartet — dann haemmert der Lauf die Quelle"
    assert max(schlaf) <= css.RETRY_AFTER_MAX, (
        f"Schlafzeiten {schlaf}: ein Retry-After der Quelle geht ungedeckelt durch")
    assert css.RETRY_AFTER_MAX <= 120


def test_ein_datum_im_kopf_bricht_nicht_ab(monkeypatch):
    schlaf = _lauf(monkeypatch, "Wed, 21 Oct 2026 07:28:00 GMT")
    assert schlaf and max(schlaf) <= css.RETRY_AFTER_MAX


def test_kleine_werte_bleiben_wie_sie_sind():
    assert css.warte_nach_retry_after("5", 3) == 5
    assert css.warte_nach_retry_after(None, 3) == 3
    assert css.warte_nach_retry_after("-4", 3) == 0
