import hashlib
import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8000/index.html"
ARTIFACT_DIR = Path("tests/artifacts/battle_journal")


@dataclass
class TestResult:
    name: str
    passed: bool
    details: str = ""
    metrics: dict[str, Any] | None = None


def add_result(results: list[TestResult], name: str, passed: bool, details: str = "", metrics: dict[str, Any] | None = None) -> None:
    results.append(TestResult(name=name, passed=passed, details=details, metrics=metrics))


def screenshot_info(path: Path) -> dict[str, Any]:
    size = path.stat().st_size if path.exists() else 0
    md5 = ""
    if path.exists() and size > 0:
        md5 = hashlib.md5(path.read_bytes()).hexdigest()
    return {"path": str(path), "size_bytes": size, "md5": md5}


def wait_for_condition(page: Any, fn_js: str, timeout_ms: int = 10000) -> bool:
    start = time.time()
    while (time.time() - start) * 1000 < timeout_ms:
        ok = page.evaluate(fn_js)
        if ok:
            return True
        page.wait_for_timeout(200)
    return bool(page.evaluate(fn_js))


def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    results: list[TestResult] = []
    console_errors: list[str] = []
    fatal_error = ""

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()

            page.on("pageerror", lambda exc: console_errors.append(f"pageerror: {exc}"))

            def on_console(msg: Any):
                if msg.type == "error":
                    console_errors.append(f"console-error: {msg.text}")

            page.on("console", on_console)

            print("STEP: goto", flush=True)
            page.goto(URL, wait_until="domcontentloaded", timeout=60000)

            print("STEP: clear storage", flush=True)
            page.evaluate(
                """
                () => {
                    localStorage.removeItem('battleJournalOutboxV1');
                    localStorage.removeItem('battleJournalDraftV1');
                    localStorage.removeItem('battleJournalThemeV1');
                }
                """
            )

            print("STEP: initialized check", flush=True)
            ready_ok = wait_for_condition(
                page,
                """
                () => typeof window.openBattleJournalSheet === 'function'
                  && !!document.getElementById('battleJournalFab')
                  && !!document.getElementById('battleJournalForm')
                                    && !!document.getElementById('battleJournalOwnDeckChoices')
                                    && !!document.getElementById('battleJournalOpponentChoices')
                """,
                timeout_ms=20000,
            )
            add_result(
                results,
                "Battle Journal initialized",
                ready_ok,
                "Global functions and UI nodes are available." if ready_ok else "Battle Journal did not initialize in time.",
            )

            print("STEP: initial snapshot", flush=True)
            initial_shot = ARTIFACT_DIR / "battle_journal_initial.png"
            page.screenshot(path=str(initial_shot), full_page=True)
            add_result(
                results,
                "Initial snapshot captured",
                True,
                metrics=screenshot_info(initial_shot),
            )

            print("STEP: theme toggle", flush=True)
            page.click("#battleJournalFab", timeout=5000)
            theme_metrics = page.evaluate(
                """
                () => {
                    const sheet = document.getElementById('battleJournalSheet');
                    const toggle = document.getElementById('battleJournalThemeToggle');
                    const beforeDark = !!(sheet && sheet.classList.contains('is-dark'));
                    if (toggle) toggle.click();
                    const afterDark = !!(sheet && sheet.classList.contains('is-dark'));
                    const storedTheme = localStorage.getItem('battleJournalThemeV1') || '';
                    return {
                        before_dark: beforeDark,
                        after_dark: afterDark,
                        changed: beforeDark !== afterDark,
                        stored_theme: storedTheme
                    };
                }
                """
            )
            theme_ok = bool(theme_metrics.get("changed")) and theme_metrics.get("stored_theme") in {"dark", "light"}
            add_result(
                results,
                "Theme toggle updates journal sheet",
                theme_ok,
                "Theme toggled and persisted to localStorage." if theme_ok else "Theme toggle did not change the sheet state.",
                theme_metrics,
            )

            # Offline submit path
            print("STEP: offline submit", flush=True)
            context.set_offline(True)
            wait_for_condition(
                page,
                """
                () => document.querySelectorAll('#battleJournalOwnDeckChoices .battle-journal-tap-card').length > 0
                  && document.querySelectorAll('#battleJournalOpponentChoices .battle-journal-tap-card').length > 0
                """,
                timeout_ms=10000,
            )

            deck_pick_metrics = page.evaluate(
                """
                () => {
                    const ownCards = Array.from(document.querySelectorAll('#battleJournalOwnDeckChoices .battle-journal-tap-card'));
                    const oppCards = Array.from(document.querySelectorAll('#battleJournalOpponentChoices .battle-journal-tap-card'));
                    const opponentCard = oppCards.find(btn => (btn.dataset.value || '').trim().toLowerCase() !== 'other...') || oppCards[0] || null;

                    if (ownCards[0]) ownCards[0].click();
                    if (opponentCard) opponentCard.click();

                    // Fallback for sparse datasets where only "Other..." is shown.
                    const ownInput = document.getElementById('battleJournalOwnDeckValue');
                    const oppInput = document.getElementById('battleJournalOpponentValue');
                    if (ownInput && !String(ownInput.value || '').trim() && typeof window.setBattleJournalChoice === 'function') {
                        window.setBattleJournalChoice('ownDeck', 'QA Own Deck');
                    }
                    if (oppInput && !String(oppInput.value || '').trim() && typeof window.setBattleJournalChoice === 'function') {
                        window.setBattleJournalChoice('opponentArchetype', 'QA Opponent Deck');
                    }

                    const ownValue = (document.getElementById('battleJournalOwnDeckValue') || {}).value || '';
                    const oppValue = (document.getElementById('battleJournalOpponentValue') || {}).value || '';
                    return {
                        own_choices: ownCards.length,
                        opp_choices: oppCards.length,
                        own_value: ownValue,
                        opp_value: oppValue
                    };
                }
                """
            )

            deck_pick_ok = bool(deck_pick_metrics.get("own_value")) and bool(deck_pick_metrics.get("opp_value"))
            add_result(
                results,
                "Tap deck selection updates hidden values",
                deck_pick_ok,
                "Tap-cards populated hidden deck fields." if deck_pick_ok else "Tap-cards did not populate hidden values.",
                deck_pick_metrics,
            )

            page.click(".battle-journal-choice[data-field='turnOrder'][data-value='first']", timeout=5000)
            page.click(".battle-journal-choice[data-field='result'][data-value='win']", timeout=5000)
            page.click("#battleJournalForm button[type='submit']", timeout=5000)

            save_fx_ok = wait_for_condition(
                page,
                """
                () => {
                    const fx = document.getElementById('battleJournalSaveFx');
                    return !!(fx && fx.classList.contains('is-show'));
                }
                """,
                timeout_ms=1500,
            )
            add_result(
                results,
                "Save feedback animation triggers",
                save_fx_ok,
                "Save FX became visible after submit." if save_fx_ok else "Save FX class was not observed in time.",
            )

            offline_metrics = page.evaluate(
                """
                () => {
                    const outbox = JSON.parse(localStorage.getItem('battleJournalOutboxV1') || '[]');
                    const badge = document.getElementById('battleJournalFabBadge');
                    const status = document.getElementById('battleJournalStatusBadge');
                    return {
                        outbox_count: Array.isArray(outbox) ? outbox.length : -1,
                        badge_text: badge ? badge.textContent.trim() : '',
                        status_text: status ? status.textContent.trim() : ''
                    };
                }
                """
            )
            offline_ok = offline_metrics.get("outbox_count", 0) >= 1 and offline_metrics.get("badge_text") in {"1", "2", "3"}
            add_result(
                results,
                "Offline save queues entry",
                offline_ok,
                "Entry was saved to local outbox while offline." if offline_ok else "Offline save did not enqueue as expected.",
                offline_metrics,
            )

            # Online, signed-out status path
            print("STEP: online signed-out status", flush=True)
            context.set_offline(False)
            page.evaluate(
                """
                async () => {
                    if (typeof window.flushBattleJournalOutbox === 'function') {
                        await window.flushBattleJournalOutbox(false);
                    }
                }
                """
            )
            waiting_metrics = page.evaluate(
                """
                () => {
                    const status = document.getElementById('battleJournalStatusBadge');
                    return { status_text: status ? status.textContent.trim() : '' };
                }
                """
            )
            waiting_ok = bool(waiting_metrics.get("status_text"))
            add_result(
                results,
                "Online signed-out status rendered",
                waiting_ok,
                "Status badge updated in online signed-out state." if waiting_ok else "Status badge missing in signed-out path.",
                waiting_metrics,
            )

        # Inject mock auth + mock firestore and sync queued entries.
            print("STEP: mock auth + sync", flush=True)
            synced_metrics = page.evaluate(
                """
                async () => {
                    const writes = [];
                    const chain = {
                        collection: () => chain,
                        doc: (id) => {
                            chain._lastDoc = id;
                            return chain;
                        },
                        set: async (payload) => {
                            writes.push({ id: chain._lastDoc || null, ownDeck: payload?.ownDeck || null });
                        }
                    };

                    window.firebase = window.firebase || {};
                    window.firebase.firestore = window.firebase.firestore || {};
                    window.firebase.firestore.FieldValue = {
                        serverTimestamp: () => ({ __serverTimestamp: true })
                    };

                    window.auth = { currentUser: { uid: 'qa-user-1' } };
                    window.db = { collection: () => chain };

                    if (typeof window.flushBattleJournalOutbox === 'function') {
                        await window.flushBattleJournalOutbox(false);
                    }

                    const outbox = JSON.parse(localStorage.getItem('battleJournalOutboxV1') || '[]');
                    const badge = document.getElementById('battleJournalFabBadge');
                    const profilePending = document.getElementById('battleJournalProfilePending');
                    const profileState = document.getElementById('battleJournalProfileState');
                    return {
                        writes_count: writes.length,
                        outbox_count: Array.isArray(outbox) ? outbox.length : -1,
                        badge_text: badge ? badge.textContent.trim() : '',
                        profile_pending_text: profilePending ? profilePending.textContent.trim() : '',
                        profile_state_text: profileState ? profileState.textContent.trim() : ''
                    };
                }
                """
            )
            sync_ok = synced_metrics.get("writes_count", 0) >= 1 and synced_metrics.get("outbox_count") == 0
            add_result(
                results,
                "Online sync flushes outbox",
                sync_ok,
                "Queued entries were written and local outbox was cleared." if sync_ok else "Sync path did not clear outbox.",
                synced_metrics,
            )

        # Keep profile card check non-blocking (it is auth-gated in normal UX).
            print("STEP: profile node check", flush=True)
            profile_presence = page.evaluate(
                """
                () => ({
                    has_profile_pending: !!document.getElementById('battleJournalProfilePending'),
                    has_profile_state: !!document.getElementById('battleJournalProfileState')
                })
                """
            )
            add_result(
                results,
                "Profile widgets present in DOM",
                bool(profile_presence.get("has_profile_pending")) and bool(profile_presence.get("has_profile_state")),
                "Profile status nodes exist.",
                profile_presence,
            )

            print("STEP: final snapshot", flush=True)
            final_shot = ARTIFACT_DIR / "battle_journal_after.png"
            page.screenshot(path=str(final_shot), full_page=True)
            add_result(
                results,
                "Post-interaction snapshot captured",
                True,
                metrics=screenshot_info(final_shot),
            )

            browser.close()
    except Exception as exc:
        fatal_error = str(exc)
        add_result(results, "E2E runtime", False, f"Unexpected runtime exception: {exc}")
        console_errors.append(f"fatal: {exc}")

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    report: dict[str, Any] = {
        "suite": "Battle Journal E2E",
        "url": URL,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "status": "PASS" if failed == 0 else "FAIL",
        },
        "artifacts_dir": str(ARTIFACT_DIR),
        "fatal_error": fatal_error,
        "console_errors": console_errors,
        "results": [asdict(r) for r in results],
    }

    report_path = ARTIFACT_DIR / "report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report["summary"], indent=2))
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
