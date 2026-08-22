"""`read` umfasst `list`. Genau daran hing der E-Mail-Abfluss.

BEFUND (21.08.2026, gemessen gegen die Produktivdatenbank): drei
Collections trugen `allow read`, gemeint war ueberall `get`.

  * publicProfiles     — ein db.collection('publicProfiles').get()
                         lieferte jedem eingeloggten Nutzer alle fuenf
                         Konten samt vollstaendiger E-Mail-Adresse.
  * testingGroupInvites — dasselbe Muster: jede Einladung samt `token`,
                         `groupName` und `createdBy`. Der Token IST die
                         Zugangsberechtigung zur Gruppe; wer ihn
                         aufzaehlen kann, braucht keinen Einladungslink.
  * shared_decks       — die Aufzaehlung ging (0 Dokumente, also kein
                         Abfluss, aber die Tuer stand offen). Die
                         6-Zeichen-ID soll die Berechtigung sein; mit
                         offenem `list` ist sie es nicht.

Alle drei werden im Frontend AUSSCHLIESSLICH per .doc(id).get() gelesen —
`list` braucht keine einzige Stelle. Die Sperre kostet also nichts.

Der Test haelt beides fest: dass die Sperre dasteht, und dass keine
Collection zurueck auf das mehrdeutige `allow read` faellt.
"""

import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
REGELN = os.path.join(WURZEL, "firestore.rules")

# Collections, deren Dokument-ID die Zugangsberechtigung ist: wer die ID
# kennt, darf lesen — wer sie nicht kennt, darf nicht aufzaehlen.
NUR_PER_ID = (
    "publicProfiles",
    "emailIndex",
    "shared_decks",
    "testingGroupInvites",
)


@pytest.fixture(scope="module")
def regeln():
    with open(REGELN, encoding="utf-8") as f:
        return f.read()


def _block(regeln, collection):
    """Der match-Block einer Collection, ohne Kommentarzeilen."""
    treffer = re.search(
        r"match /" + re.escape(collection) + r"/\{[^}]+\}\s*\{(.*?)\n    \}",
        regeln, re.S)
    assert treffer, f"match-Block fuer {collection} nicht gefunden"
    return "\n".join(z for z in treffer.group(1).splitlines()
                     if not z.strip().startswith("//"))


@pytest.mark.parametrize("collection", NUR_PER_ID)
def test_list_ist_ausdruecklich_gesperrt(regeln, collection):
    block = _block(regeln, collection)
    assert re.search(r"allow list:\s*if false", block), (
        f"{collection}: `allow list: if false` fehlt. Ohne die Sperre kann "
        f"jeder Berechtigte die ganze Collection aufzaehlen — genau so ist "
        f"der E-Mail-Abfluss entstanden.")


@pytest.mark.parametrize("collection", NUR_PER_ID)
def test_kein_mehrdeutiges_read(regeln, collection):
    block = _block(regeln, collection)
    assert not re.search(r"allow read\b", block), (
        f"{collection}: `allow read` ist zurueck. `read` umfasst `get` UND "
        f"`list` — wer nur `get` meint, muss `get` schreiben.")


def test_get_bleibt_erlaubt(regeln):
    """Die Sperre darf die Funktion nicht mitnehmen."""
    for collection in NUR_PER_ID:
        block = _block(regeln, collection)
        assert re.search(r"allow get:", block), (
            f"{collection}: kein `allow get` — dann ist die Collection "
            f"komplett tot, nicht nur die Aufzaehlung.")


def test_niemand_liest_diese_collections_per_query():
    """Die Sperre kostet nur dann nichts, wenn der Code sie nicht braucht.

    Faellt dieser Test, ist eine Query dazugekommen — dann gehoert
    ENTWEDER die Query auf einen Hash-Index umgebaut (wie bei
    emailIndex geschehen) ODER die Regel bewusst geoeffnet. Nicht
    stillschweigend das eine ins andere kippen lassen.
    """
    js = os.path.join(WURZEL, "js")
    verstoesse = []
    for name in sorted(os.listdir(js)):
        if not name.endswith(".js") or name.startswith("vendor"):
            continue
        with open(os.path.join(js, name), encoding="utf-8") as f:
            roh = f.read()
        # Kommentarzeilen abziehen: die Begruendungen im Code zitieren die
        # alten Aufrufe woertlich, und ein Zitat ist kein Zugriff.
        inhalt = "\n".join("" if z.strip().startswith("//") else z
                           for z in roh.splitlines())
        for collection in NUR_PER_ID:
            for m in re.finditer(
                    r"collection\(['\"]" + re.escape(collection) + r"['\"]\)(.{0,40})",
                    inhalt, re.S):
                weiter = m.group(1).lstrip()
                if not weiter.startswith(".doc("):
                    zeile = inhalt[:m.start()].count("\n") + 1
                    verstoesse.append(
                        f"{name}:{zeile} {collection} → {weiter[:40]!r}")
    assert not verstoesse, (
        "Zugriff ohne .doc(id) auf eine nur-per-ID-Collection:\n  "
        + "\n  ".join(verstoesse))
