import hashlib
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8000/index.html"
ARTIFACT_DIR = Path("tests/artifacts/past_meta")


@dataclass
class TestResult:
    name: str
    passed: bool
    details: str = ""
    metrics: dict[str, Any] | None = None


def add_result(results: list[TestResult], name: str, passed: bool, details: str = "", metrics: dict[str, Any] | None = None) -> None:
    results.append(TestResult(name=name, passed=passed, details=details, metrics=metrics))


def wait_for_options(page: Any, selector: str, minimum: int = 2, timeout_ms: int = 45000) -> int:
    start = time.time()
    while (time.time() - start) * 1000 < timeout_ms:
        count = page.locator(selector).count()
        if count >= minimum:
            return count
        page.wait_for_timeout(250)
    return page.locator(selector).count()


def screenshot_info(path: Path) -> dict[str, Any]:
    size = path.stat().st_size if path.exists() else 0
    md5 = ""
    if path.exists() and size > 0:
        md5 = hashlib.md5(path.read_bytes()).hexdigest()
    return {"path": str(path), "size_bytes": size, "md5": md5}


def parse_total_from_stat(stat_text: str) -> int:
    match = re.search(r"(\d+)\s*/\s*(\d+)", stat_text or "")
    if not match:
        return 0
    return int(match.group(2))


def parse_total_from_summary(summary_text: str) -> int:
    match = re.search(r"/\s*(\d+)\s*Total", summary_text or "")
    if not match:
        return 0
    return int(match.group(1))


def wait_for_stable_deck_total(page: Any, timeout_ms: int = 25000) -> dict[str, int]:
    start = time.time()
    previous: dict[str, int] | None = None
    stable = 0

    while (time.time() - start) * 1000 < timeout_ms:
        counts = page.evaluate(
            """
            () => {
                const ui = parseInt((document.getElementById('pastMetaDeckCount')?.textContent || '0').replace(/[^0-9]/g,''), 10) || 0;
                const deck = window.pastMetaDeck || {};
                const state = Object.values(deck).reduce((sum, c) => sum + (parseInt(c, 10) || 0), 0);
                return { ui, state };
            }
            """
        )

        if counts == previous:
            stable += 1
        else:
            stable = 0
            previous = counts

        if stable >= 4:
            return counts

        page.wait_for_timeout(300)

    return previous or {"ui": 0, "state": 0}


def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    results: list[TestResult] = []
    console_errors: list[str] = []
    response_404_urls: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})

        page.on("pageerror", lambda exc: console_errors.append(f"pageerror: {exc}"))

        def on_console(msg: Any):
            if msg.type == "error":
                console_errors.append(f"console-error: {msg.text}")

        def on_response(resp: Any):
            try:
                if int(resp.status) == 404:
                    response_404_urls.append(str(resp.url))
            except Exception:
                pass

        page.on("console", on_console)
        page.on("response", on_response)

        print("STEP: goto")
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)

        print("STEP: switch tab")
        page.evaluate("() => { if (typeof window.switchTab === 'function') window.switchTab('past-meta'); }")
        try:
            page.wait_for_selector("#past-meta.active", timeout=25000)
            add_result(results, "Past Meta tab active", True)
        except Exception as exc:
            add_result(results, "Past Meta tab active", False, f"Tab activation failed: {exc}")

        print("STEP: wait filters")
        format_options = wait_for_options(page, "#pastMetaFormatFilter option", minimum=2, timeout_ms=50000)
        add_result(
            results,
            "Format selector populated",
            format_options > 1,
            "Format selector has options." if format_options > 1 else "Format selector did not populate.",
            {"option_count": format_options},
        )

        print("STEP: snapshot initial")
        shot_initial = ARTIFACT_DIR / "past_meta_initial.png"
        page.screenshot(path=str(shot_initial), full_page=True)
        info_initial = screenshot_info(shot_initial)
        add_result(
            results,
            "Initial snapshot captured",
            info_initial["size_bytes"] > 10000,
            "Initial snapshot captured." if info_initial["size_bytes"] > 10000 else "Initial snapshot too small.",
            info_initial,
        )

        print("STEP: format + tournament + deck selection")
        selection_metrics = page.evaluate(
            """
            () => {
                const out = { ok: true };
                const formatSelect = document.getElementById('pastMetaFormatFilter');
                const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
                const deckSelect = document.getElementById('pastMetaDeckSelect');
                if (!formatSelect || !tournamentSelect || !deckSelect) {
                    return { ok: false, reason: 'missing selectors' };
                }

                const pickFormat = Array.from(formatSelect.options).find(o => String(o.value || '').trim() === 'SVI-ASC')
                    || Array.from(formatSelect.options).find(o => !!o.value && o.value !== 'all');
                if (!pickFormat) return { ok: false, reason: 'no format option' };

                formatSelect.value = pickFormat.value;
                formatSelect.dispatchEvent(new Event('change', { bubbles: true }));

                const pickTournament = Array.from(tournamentSelect.options).find(o => (o.textContent || '').toLowerCase().includes('houston'))
                    || Array.from(tournamentSelect.options).find(o => !!o.value && o.value !== 'all');
                if (!pickTournament) return { ok: false, reason: 'no tournament option' };

                tournamentSelect.value = pickTournament.value;
                tournamentSelect.dispatchEvent(new Event('change', { bubbles: true }));

                const pickDeck = Array.from(deckSelect.options).find(o => (o.value || '').toLowerCase().includes('alakazam dudunsparce'))
                    || Array.from(deckSelect.options).find(o => !!o.value);
                if (!pickDeck) return { ok: false, reason: 'no deck option' };

                deckSelect.value = pickDeck.value;
                deckSelect.dispatchEvent(new Event('change', { bubbles: true }));

                out.format = pickFormat.value;
                out.tournament = pickTournament.textContent || '';
                out.deck = pickDeck.value;
                return out;
            }
            """
        )
        add_result(
            results,
            "Past Meta selection works",
            bool(selection_metrics.get("ok")),
            "Format/tournament/deck selected." if selection_metrics.get("ok") else f"Selection failed: {selection_metrics}",
            selection_metrics,
        )

        page.wait_for_timeout(1500)

        print("STEP: cards + stats render")
        card_count = page.locator(".city-league-card-item").count()
        stats_metrics = page.evaluate(
            """
            () => ({
                statCards: document.getElementById('pastMetaStatCards')?.textContent?.trim() || '',
                summary: document.getElementById('pastMetaCardCountSummary')?.textContent?.trim() || '',
                cardsLabel: document.getElementById('pastMetaCardCount')?.textContent?.trim() || '',
                statsVisible: !document.getElementById('pastMetaStatsSection')?.classList.contains('d-none')
            })
            """
        )
        stats_ok = card_count > 0 and bool(stats_metrics.get("statsVisible")) and "/" in stats_metrics.get("statCards", "")
        add_result(
            results,
            "Deck cards and stats rendered",
            stats_ok,
            "Cards and stats rendered." if stats_ok else "Cards/stats not rendered as expected.",
            {"rendered_cards": card_count, **stats_metrics},
        )

        print("STEP: totals consistency")
        stat_total = parse_total_from_stat(stats_metrics.get("statCards", ""))
        summary_total = parse_total_from_summary(stats_metrics.get("summary", ""))
        totals_match = stat_total > 0 and summary_total > 0 and stat_total == summary_total
        add_result(
            results,
            "Stat total matches overview total",
            totals_match,
            "Stat and overview totals are consistent." if totals_match else "Stat/overview total mismatch.",
            {"stat_total": stat_total, "summary_total": summary_total, "stat_text": stats_metrics.get("statCards", ""), "summary_text": stats_metrics.get("summary", "")},
        )

        print("STEP: houston 60-card expectation")
        selected_context = page.evaluate(
            """
            () => ({
                format: document.getElementById('pastMetaFormatFilter')?.value || '',
                tournamentText: document.getElementById('pastMetaTournamentFilter')?.selectedOptions?.[0]?.textContent || '',
                deck: document.getElementById('pastMetaDeckSelect')?.value || ''
            })
            """
        )
        is_houston_path = (
            str(selected_context.get("format", "")).strip().upper() == "SVI-ASC"
            and "houston" in str(selected_context.get("tournamentText", "")).lower()
        )
        houston_ok = (not is_houston_path) or (stat_total == 60 and summary_total == 60)
        add_result(
            results,
            "SVI-ASC + Houston totals equal 60",
            houston_ok,
            "Houston selection totals are 60/60." if houston_ok else "Houston selection totals are not 60.",
            {"is_houston_path": is_houston_path, "context": selected_context, "stat_total": stat_total, "summary_total": summary_total},
        )

        print("STEP: share filter")
        baseline_visible = page.locator(".city-league-card-item:not(.d-none)").count()
        page.evaluate(
            """
            () => {
                const select = document.getElementById('pastMetaFilterSelect');
                if (!select) return;
                select.value = '90';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            """
        )
        page.wait_for_timeout(1000)
        filtered_visible = page.locator(".city-league-card-item:not(.d-none)").count()
        share_ok = filtered_visible <= baseline_visible
        add_result(
            results,
            "Card share filter applies",
            share_ok,
            "Share filter applied and visible cards did not increase." if share_ok else "Share filter behavior unexpected.",
            {"baseline_visible": baseline_visible, "filtered_visible": filtered_visible},
        )

        print("STEP: generation correctness")
        page.evaluate(
            """
            () => {
                window.confirm = () => true;
                window.alert = () => {};
                if (typeof window.clearDeck === 'function') window.clearDeck('pastMeta');
                if (typeof window.autoComplete === 'function') window.autoComplete('pastMeta', 'min');
            }
            """
        )
        generation_metrics = wait_for_stable_deck_total(page, timeout_ms=30000)
        generation_ok = generation_metrics.get("ui") == 60 and generation_metrics.get("state") == 60
        add_result(
            results,
            "Generated deck yields exactly 60 cards",
            generation_ok,
            "Generated deck reached exactly 60 cards." if generation_ok else "Generated deck did not reach 60 cards.",
            generation_metrics,
        )

        print("STEP: snapshot after interactions")
        shot_after = ARTIFACT_DIR / "past_meta_after.png"
        page.screenshot(path=str(shot_after), full_page=True)
        info_after = screenshot_info(shot_after)
        add_result(
            results,
            "Post-interaction snapshot captured",
            info_after["size_bytes"] > 10000,
            "Post-interaction snapshot captured." if info_after["size_bytes"] > 10000 else "Post snapshot too small.",
            info_after,
        )

        browser.close()

    unique_404_urls: list[str] = []
    for url in response_404_urls:
        if url not in unique_404_urls:
            unique_404_urls.append(url)

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    report: dict[str, Any] = {
        "suite": "Past Meta Structured E2E",
        "url": URL,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "status": "PASS" if failed == 0 else "FAIL",
        },
        "artifacts_dir": str(ARTIFACT_DIR),
        "console_errors": console_errors[:40],
        "response_404_urls": unique_404_urls[:100],
        "results": [asdict(r) for r in results],
    }

    report_path = ARTIFACT_DIR / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
