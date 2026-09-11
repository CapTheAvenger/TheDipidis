"""Wann wird ein neues Set auf Praesenzturnieren legal?

DIE REGEL
---------
Erscheinungsdatum, dann der ZWEITE Freitag danach. Nicht "Erscheinen
plus vierzehn Tage".

Bis zum 11.09.2026 rechnete update_sets.py stur
`IN_PERSON_LEGAL_LAG_DAYS = 14`. Das war keine Regel, sondern eine
Beobachtung: Sets erscheinen fast immer freitags, und fuer einen
Freitag fallen beide Rechnungen auf denselben Tag. Nachgerechnet an
allen Sets mit Erscheinungsdatum in data/sets_metadata.json: dreizehn
Freitagssets, dreizehnmal dasselbe Datum.

Genau einmal fielen sie auseinander, und da war die feste Frist falsch:
MEE erschien Donnerstag, den 25.09.2025. Vierzehn Tage ergaben den
09.10., die Regel ergibt den 03.10. — sechs Tage, in denen das Set
legal war und der Bestand es nicht wusste.

WARUM DAS JETZT ZAEHLT
----------------------
Gemeldet vom Betreiber am 11.09.2026: "30th Celebration" erscheint am
MITTWOCH, dem 16.09.2026.

    feste Frist   16.09. + 14 Tage          = 30.09.2026 (Mittwoch)
    diese Regel   16.09. -> 18.09. -> 25.09 = 25.09.2026 (Freitag)

Zwischen beiden liegt das Turnier in Frankfurt am 26.09.2026. Mit der
festen Frist waere es als TEF-PBL verbucht worden, obwohl dort
TEF-30C gespielt wird.

Der Freitag ist nicht willkuerlich: Turnierwochenenden beginnen
freitags, und ein Formatwechsel mitten in einem Wochenende gibt es
nicht. Deshalb faellt die Grenze immer auf einen Freitag, egal an
welchem Wochentag ein Set erscheint.

Die Zahl `lag_days` in data/format_window.json bleibt erhalten — sie
wird jetzt ABGELEITET (der tatsaechliche Abstand in Tagen) statt
vorgegeben. Ihre Verbraucher (js/app-meta-call.js fuer die
Altersgrenze des Lag-Fensters, tests/python/test_data_integrity.py)
rechnen damit unveraendert weiter.
"""

import datetime

FREITAG = 4          # datetime.date.weekday(): Montag 0 … Sonntag 6
FREITAGE_BIS_LEGAL = 2


def zweiter_freitag_nach(iso_datum, freitage=FREITAGE_BIS_LEGAL):
    """Der `freitage`-te Freitag STRIKT nach `iso_datum` (YYYY-MM-DD).

    Strikt danach heisst: erscheint ein Set selbst an einem Freitag,
    zaehlt dieser Freitag nicht mit. Beleg: PBL erschien Freitag, den
    17.07.2026, und war ab dem 31.07.2026 legal — das ist der zweite
    Freitag danach (24.07., 31.07.), nicht der zweite einschliesslich
    (17.07., 24.07.).

    Gibt '' zurueck, wenn das Datum nicht lesbar ist — genau wie
    _add_days() es tat, damit der Aufrufer das abhaengige Feld
    auslassen kann statt einen erfundenen Tag zu schreiben.
    """
    try:
        d = datetime.date.fromisoformat(str(iso_datum).strip())
    except Exception:
        return ''
    if freitage < 1:
        return d.isoformat()
    gefunden = 0
    tag = d
    # Hoechstens 7 * freitage + 7 Schritte — die Schleife endet immer.
    for _ in range(7 * (freitage + 1)):
        tag = tag + datetime.timedelta(days=1)
        if tag.weekday() == FREITAG:
            gefunden += 1
            if gefunden >= freitage:
                return tag.isoformat()
    return ''


def abstand_in_tagen(iso_von, iso_bis):
    """Tage zwischen zwei ISO-Daten, oder None. Fuer `lag_days`."""
    try:
        a = datetime.date.fromisoformat(str(iso_von).strip())
        b = datetime.date.fromisoformat(str(iso_bis).strip())
    except Exception:
        return None
    return (b - a).days
