"""Der Deploy, der nie lief.

Befund vom 21.08.2026: Auf `main` landeten seit dem 19.08. sieben Auto-Commits
der Daten-Workflows. Kein einziger davon hat einen Pages-Deploy ausgeloest —
die letzten acht Deploys stammten ausnahmslos aus PR-Merges (#462-#469).
Frische Daten erreichten die Seite also nur zufaellig, naemlich dann, wenn
jemand gerade Code merget.

Ursache: GitHub unterdrueckt `on: push`-Workflows fuer Pushes, die mit
GITHUB_TOKEN authentifiziert sind (Rekursionsschutz). Der explizite
`gh workflow run deploy-pages.yml` wurde aus mehreren Workflows entfernt, mit
der Begruendung, der Push triggere den Deploy ohnehin — und genau das tut er
nicht. weekly-full-update.yml traegt beide Aussagen im selben File, direkt
untereinander.

Gemessene Folge: live standen 199 Turniere / 14.026 Spieler, waehrend
data/limitless_meta_stats.json im Repo schon 392 / 29.436 fuehrte
(generated_at 2026-08-21T06:14). daily-price-refresh hat es selbst
protokolliert — am 18., 19. und 20.08. je ein
"::warning::No deploy-pages run found for <sha>", und der Lauf war jedes Mal
gruen.

Dieser Test ist das Netz darunter: wer den Dispatch wieder herausnimmt, macht
den Lauf rot statt die Seite still veralten zu lassen.
"""
import os
import re

import pytest
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WF_DIR = os.path.join(ROOT, ".github", "workflows")

DISPATCH_RE = re.compile(r"gh\s+workflow\s+run\s+deploy-pages\.yml")

# Workflows, die zwar nach main pushen, aber bewusst keinen Deploy anstossen.
# Jede Ausnahme braucht einen Grund — eine sichtbare Luecke ist heilbar, eine
# stille nicht.
AUSNAHMEN = {
    "cardmarket-card-images.yml":
        "schreibt nur Zwischenprodukte (cardmarket_card_images.csv, cm_expansions.csv); "
        "kein js/-Modul holt sie, sie stehen im Vertrag data/_consumers.md fuer "
        "Fremdprojekte, die von main lesen, nicht von Pages.",
    "data-guardian.yml":
        "schreibt nur data/_guardian_baseline.json — reiner Pruefzustand, "
        "erreicht den Browser nie.",
    "pokepricelab-index.yml":
        "Katalog-Index als Eingabe fuer spaetere Laeufe; kein js/-Modul holt ihn.",
    "pokepricelab-verify.yml":
        "Verifikationsbericht als Arbeitsliste; kein js/-Modul holt ihn.",
    "verify-cardmarket-mapping.yml":
        "schreibt die Mapping-Datei, die andere Skripte lesen; kein js/-Modul holt sie.",
    # Browsersichtbar, aber ohne eigenen pushed-Ausgang. Ihre Daten gehen
    # spaetestens mit dem Wochenlauf live, der `git add -A` macht und den
    # Deploy anstoesst — Verzug bis zu vier Tage (cron Di+Fr). Bewusst offen
    # gelassen statt die Commit-Schritte dieser drei umzubauen.
    "player-continuity-scrape.yml":
        "browsersichtbar (js/app-past-meta.js), aber ohne pushed-Ausgang; "
        "geht spaetestens mit dem Wochenlauf live (Verzug bis 4 Tage).",
    "prizepack-official-images.yml":
        "browsersichtbar (js/firebase-collection.js), aber ohne pushed-Ausgang; "
        "geht spaetestens mit dem Wochenlauf live (Verzug bis 4 Tage).",
    "tutorial-screenshots.yml":
        "schreibt images/tutorials/, ohne pushed-Ausgang; "
        "geht spaetestens mit dem Wochenlauf live (Verzug bis 4 Tage).",
}


def _workflows():
    for name in sorted(os.listdir(WF_DIR)):
        if name.endswith((".yml", ".yaml")):
            with open(os.path.join(WF_DIR, name), encoding="utf-8") as f:
                yield name, f.read()


def _pusht_nach_main(text):
    """Schreibt der Workflow selbst auf main?

    Im Repo stehen mindestens vier Schreibweisen nebeneinander:
    `git push origin HEAD:main`, `if git push origin HEAD:main; then`,
    ein nacktes `git push` (der Checkout steht auf main) und
    `git push && break` in einer Retry-Schleife. Beide frueheren Fassungen
    dieses Tests kannten je nur einen Teil davon und uebersahen vier bzw.
    fuenf Workflows — der Test hat beide Male selbst Alarm geschlagen.
    Deshalb jetzt zeilenweise und kommentarfest statt per Muster.
    """
    for zeile in text.splitlines():
        nackt = zeile.strip()
        if not nackt or nackt.startswith("#"):
            continue
        if "git push" in nackt:
            return True
    return False


PUSHER = [(n, t) for n, t in _workflows() if _pusht_nach_main(t)]


def test_es_gibt_ueberhaupt_pushende_workflows():
    # Sonst prueft der Rest still nichts.
    assert len(PUSHER) >= 8, f"nur {len(PUSHER)} pushende Workflows gefunden"


@pytest.mark.parametrize("name,text", PUSHER, ids=[n for n, _ in PUSHER])
def test_wer_nach_main_pusht_stoesst_den_deploy_an(name, text):
    if name in AUSNAHMEN:
        grund = AUSNAHMEN[name]
        assert len(grund) > 40, f"{name} steht ohne tragfaehigen Grund auf der Ausnahmeliste"
        assert not DISPATCH_RE.search(text), (
            f"{name} stoesst den Deploy doch an — dann gehoert es nicht mehr "
            f"auf die Ausnahmeliste"
        )
        return
    assert DISPATCH_RE.search(text), (
        f"{name} pusht nach main, stoesst aber deploy-pages nicht an. Ein Push "
        f"mit GITHUB_TOKEN loest `on: push` NICHT aus — ohne Dispatch veraltet "
        f"die Seite still. Entweder Dispatch einbauen oder mit Grund in "
        f"AUSNAHMEN eintragen."
    )


@pytest.mark.parametrize("name,text", PUSHER, ids=[n for n, _ in PUSHER])
def test_dispatch_haengt_an_einem_echten_push(name, text):
    """Sonst deployt der Workflow auch, wenn er gar nichts committet hat."""
    if not DISPATCH_RE.search(text):
        return
    doc = yaml.safe_load(text)
    treffer = []
    for job in (doc.get("jobs") or {}).values():
        for step in (job.get("steps") or []):
            if DISPATCH_RE.search(str(step.get("run", ""))):
                treffer.append(step)
    assert treffer, f"{name}: Dispatch nur im Kommentar, nicht als Schritt"
    for step in treffer:
        assert "pushed" in str(step.get("if", "")), (
            f"{name}: der Dispatch-Schritt haengt nicht an "
            f"steps.commit.outputs.pushed — er wuerde auch ohne Commit deployen"
        )


@pytest.mark.parametrize("name", sorted(AUSNAHMEN))
def test_ausnahmeliste_verrottet_nicht(name):
    """Eine Ausnahme fuer einen Workflow, den es nicht mehr gibt, taeuscht Deckung vor."""
    assert os.path.exists(os.path.join(WF_DIR, name)), f"{name} existiert nicht mehr"
    assert name in dict(PUSHER), f"{name} pusht gar nicht mehr nach main"


@pytest.mark.parametrize("name,text", PUSHER, ids=[n for n, _ in PUSHER])
def test_dispatch_braucht_actions_write(name, text):
    if not DISPATCH_RE.search(text):
        return
    doc = yaml.safe_load(text)
    perms = doc.get("permissions") or {}
    assert perms.get("actions") == "write", (
        f"{name}: `gh workflow run` braucht `actions: write`, sonst scheitert "
        f"der Dispatch zur Laufzeit mit 403"
    )
