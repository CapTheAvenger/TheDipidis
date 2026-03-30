import hashlib
import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8000/index.html"
ARTIFACT_DIR = Path("tests/artifacts/deck_analysis_global")


@dataclass
class TestResult:
    name: str
    passed: bool
    details: str = ""
    metrics: dict[str, Any] | None = None


def add_result(results: list[TestResult], name: str, passed: bool, details: str = "", metrics: dict[str, Any] | None = None) -> None:
    results.append(TestResult(name=name, passed=passed, details=details, metrics=metrics))


def wait_for_count(page: Any, selector: str, minimum: int = 1, timeout_ms: int = 35000) -> int:
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


def wait_for_stable_deck_total(page: Any, timeout_ms: int = 25000) -> dict[str, int]:
    start = time.time()
    previous: dict[str, int] | None = None
    stable = 0

    while (time.time() - start) * 1000 < timeout_ms:
        counts = page.evaluate(
            """
            () => {
                const ui = parseInt((document.getElementById('currentMetaDeckCount')?.textContent || '0').replace(/[^0-9]/g,''), 10) || 0;
                const deck = window.currentMetaDeck || {};
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

        def on_response(resp: Any):
            try:
                if int(resp.status) == 404:
                    response_404_urls.append(str(resp.url))
            except Exception:
                pass

        page.on("response", on_response)

        def on_console(msg: Any):
            if msg.type == "error":
                console_errors.append(f"console-error: {msg.text}")

        page.on("console", on_console)

        print("STEP: goto")
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)

        print("STEP: switch tab")
        page.evaluate("() => { if (typeof window.switchTab === 'function') window.switchTab('current-analysis'); }")
        try:
            page.wait_for_selector("#current-analysis.active", timeout=25000)
            add_result(results, "Deck Analysis Global tab active", True)
        except Exception as exc:
            add_result(results, "Deck Analysis Global tab active", False, f"Tab activation failed: {exc}")

        print("STEP: wait deck options")
        option_count = wait_for_count(page, "#currentMetaDeckSelect option", minimum=2, timeout_ms=50000)
        add_result(
            results,
            "Deck selector populated",
            option_count > 1,
            "Deck selector has selectable options." if option_count > 1 else "Deck selector not populated.",
            {"option_count": option_count},
        )

        print("STEP: snapshot initial")
        shot_initial = ARTIFACT_DIR / "deck_analysis_global_initial.png"
        page.screenshot(path=str(shot_initial), full_page=True)
        info_initial = screenshot_info(shot_initial)
        add_result(
            results,
            "Initial snapshot captured",
            info_initial["size_bytes"] > 10000,
            "Initial snapshot captured." if info_initial["size_bytes"] > 10000 else "Initial snapshot too small.",
            info_initial,
        )

        print("STEP: format filter checks")
        format_metrics = page.evaluate(
            """
            async () => {
                const select = document.getElementById('currentMetaDeckSelect');
                if (!select || typeof window.setCurrentMetaFormatFilter !== 'function') {
                    return { ok: false, reason: 'missing select or filter function' };
                }

                const getCount = () => Array.from(select.options).filter(o => !!o.value).length;
                const out = { ok: true, counts: {}, status: {} };

                await window.setCurrentMetaFormatFilter('all');
                out.counts.all = getCount();
                out.status.all = document.getElementById('currentMetaFilterStatus')?.textContent || '';

                await window.setCurrentMetaFormatFilter('live');
                out.counts.live = getCount();
                out.status.live = document.getElementById('currentMetaFilterStatus')?.textContent || '';

                await window.setCurrentMetaFormatFilter('play');
                out.counts.play = getCount();
                out.status.play = document.getElementById('currentMetaFilterStatus')?.textContent || '';

                await window.setCurrentMetaFormatFilter('all');
                return out;
            }
            """
        )
        format_ok = bool(format_metrics.get("ok")) and all(
            int(format_metrics.get("counts", {}).get(key, 0)) > 0 for key in ["all", "live", "play"]
        )
        add_result(
            results,
            "Format filter switches data",
            format_ok,
            "All format modes expose selectable archetypes." if format_ok else f"Format filter issue: {format_metrics}",
            format_metrics,
        )

        print("STEP: deck search")
        search_metrics = page.evaluate(
            """
            () => {
                const input = document.getElementById('currentMetaDeckSearch');
                const select = document.getElementById('currentMetaDeckSelect');
                if (!input || !select) return { ok: false, reason: 'missing deck search/select' };

                const sourceOption = Array.from(select.options).find(o => o.value && !o.disabled);
                if (!sourceOption) return { ok: false, reason: 'no deck options for search' };

                const token = (sourceOption.textContent || '').trim().split(/\\s+/)[0] || '';
                input.value = token;
                input.dispatchEvent(new Event('input', { bubbles: true }));

                const allOptions = Array.from(select.querySelectorAll('option')).filter(o => o.value);
                const visibleOptions = allOptions.filter(o => o.style.display !== 'none');
                const visibleMatch = visibleOptions.length > 0 && visibleOptions.every(o =>
                    (o.textContent || '').toLowerCase().includes(token.toLowerCase())
                );

                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));

                return {
                    ok: true,
                    token,
                    visible_count: visibleOptions.length,
                    visible_match: visibleMatch
                };
            }
            """
        )
        search_ok = bool(search_metrics.get("ok")) and bool(search_metrics.get("visible_match"))
        add_result(
            results,
            "Deck search filter works",
            search_ok,
            "Deck search narrows option list consistently." if search_ok else f"Deck search failed: {search_metrics}",
            search_metrics,
        )

        print("STEP: select archetype")
        selected = page.evaluate(
            """
            () => {
                const select = document.getElementById('currentMetaDeckSelect');
                if (!select) return { ok: false, reason: 'missing deck select' };

                const candidate = Array.from(select.options).find(o => o.value && !o.disabled && o.style.display !== 'none');
                if (!candidate) return { ok: false, reason: 'no selectable archetype option' };

                select.value = candidate.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { ok: true, selected: candidate.value, label: candidate.textContent || '' };
            }
            """
        )
        add_result(
            results,
            "Archetype selectable",
            bool(selected.get("ok")),
            "Archetype selected." if selected.get("ok") else f"Archetype selection failed: {selected}",
            selected,
        )

        print("STEP: wait cards and stats")
        card_count = wait_for_count(page, ".city-league-card-item", minimum=1, timeout_ms=50000)
        stats_values = page.evaluate(
            """
            () => ({
                cards: document.getElementById('currentMetaStatCards')?.textContent?.trim() || '',
                winrate: document.getElementById('currentMetaStatWinrate')?.textContent?.trim() || '',
                matchup: document.getElementById('currentMetaStatMatchup')?.textContent?.trim() || '',
                isStatsVisible: !document.getElementById('currentMetaStatsSection')?.classList.contains('d-none')
            })
            """
        )
        stats_ok = card_count > 0 and bool(stats_values.get("isStatsVisible")) and stats_values.get("cards") not in ("", "-")
        add_result(
            results,
            "Deck cards and stats rendered",
            stats_ok,
            "Cards and stats rendered after deck selection." if stats_ok else "Cards/stats did not render as expected.",
            {"rendered_cards": card_count, **stats_values},
        )

        print("STEP: top256 tournament completeness")
        top256_metrics = page.evaluate(
            """
            async () => {
                const select = document.getElementById('currentMetaDeckSelect');
                if (!select || typeof window.setCurrentMetaFormatFilter !== 'function') {
                    return { ok: false, reason: 'missing elements' };
                }

                // Switch to play (Major Tournament) filter
                await window.setCurrentMetaFormatFilter('play');

                // Choose first available archetype with deck count > 5 (more likely to have many tournaments)
                const candidates = Array.from(select.options).filter(o => !!o.value);
                if (!candidates.length) return { ok: false, reason: 'no play archetypes' };

                const picked = candidates[0];
                select.value = picked.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));

                return { ok: true, picked: picked.value };
            }
            """
        )

        if top256_metrics.get("ok"):
            page.wait_for_timeout(4000)
            top256_count = page.evaluate(
                """
                () => ({
                    sectionVisible: !document.getElementById('currentMetaTop256Section')?.classList.contains('d-none'),
                    entryCount: document.querySelectorAll('#currentMetaTop256List .top256-entry').length,
                    firstTournament: document.querySelector('#currentMetaTop256List .top256-entry .top256-tournament')?.textContent?.trim() || ''
                })
                """
            )
            top256_ok = (
                bool(top256_metrics.get("ok"))
                and bool(top256_count.get("sectionVisible"))
                and int(top256_count.get("entryCount", 0)) > 3
            )
        else:
            top256_count = {}
            top256_ok = False

        add_result(
            results,
            "Top-256 tournament list has more than 3 entries",
            top256_ok,
            f"Top-256 section shows {top256_count.get('entryCount', 0)} entries for '{top256_metrics.get('picked', '?')}'."
            if top256_ok
            else f"Top-256 list incomplete or hidden: {top256_metrics} | {top256_count}",
            {**top256_metrics, **top256_count},
        )

        # Restore 'all' filter for subsequent steps
        page.evaluate("""async () => { await window.setCurrentMetaFormatFilter('all'); }""")
        page.wait_for_timeout(1000)

        print("STEP: share filter")
        baseline_visible = page.locator(".city-league-card-item:not(.d-none)").count()
        share_metrics = page.evaluate(
            """
            () => {
                const select = document.getElementById('currentMetaFilterSelect');
                if (!select) return { ok: false, reason: 'missing filter select' };

                select.value = '90';
                if (typeof window.applyCurrentMetaFilter === 'function') {
                    window.applyCurrentMetaFilter();
                    return { ok: true, mode: 'applyCurrentMetaFilter' };
                }

                select.dispatchEvent(new Event('change', { bubbles: true }));
                return { ok: true, mode: 'change-event' };
            }
            """
        )
        page.wait_for_timeout(1000)
        filtered_visible = page.locator(".city-league-card-item:not(.d-none)").count()
        share_ok = bool(share_metrics.get("ok")) and filtered_visible <= baseline_visible
        add_result(
            results,
            "Card share filter applies",
            share_ok,
            "Share filter applied and visible cards did not increase." if share_ok else "Share filter behavior unexpected.",
            {
                "baseline_visible": baseline_visible,
                "filtered_visible": filtered_visible,
                **share_metrics,
            },
        )

        print("STEP: generation correctness")
        generation_targets = page.evaluate(
            """
            () => {
                const select = document.getElementById('currentMetaDeckSelect');
                if (!select) return [];
                return Array.from(select.options)
                    .map(o => String(o.value || '').trim())
                    .filter(v => !!v)
                    .slice(0, 3);
            }
            """
        )

        generation_results: list[dict[str, Any]] = []
        generation_ok = len(generation_targets) > 0
        for archetype_name in generation_targets:
            step = page.evaluate(
                """
                ([name]) => {
                    window.confirm = () => true;
                    window.alert = () => {};
                    const select = document.getElementById('currentMetaDeckSelect');
                    if (!select) return { ok: false, reason: 'missing deck select' };

                    const option = Array.from(select.options).find(o => String(o.value || '').toLowerCase() === name.toLowerCase());
                    if (!option) return { ok: false, reason: 'option-not-found' };

                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));

                    if (typeof window.clearDeck === 'function') window.clearDeck('currentMeta');
                    if (typeof window.autoComplete === 'function') window.autoComplete('currentMeta', 'min');

                    return { ok: true };
                }
                """,
                [archetype_name],
            )

            if not step.get("ok"):
                generation_ok = False
                generation_results.append({"archetype": archetype_name, "passed": False, "reason": step.get("reason", "unknown")})
                continue

            counts = wait_for_stable_deck_total(page, timeout_ms=30000)
            passed_row = counts.get("ui") == 60 and counts.get("state") == 60
            generation_ok = generation_ok and passed_row
            generation_results.append(
                {
                    "archetype": archetype_name,
                    "ui": counts.get("ui"),
                    "state": counts.get("state"),
                    "passed": passed_row,
                }
            )

        add_result(
            results,
            "Generation yields exactly 60 cards (sample archetypes)",
            generation_ok,
            "Sample archetypes generated exactly 60 cards." if generation_ok else "At least one sample archetype did not end at 60 cards.",
            {"rows": generation_results},
        )

        print("STEP: snapshot after interactions")
        shot_after = ARTIFACT_DIR / "deck_analysis_global_after.png"
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

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    unique_404_urls: list[str] = []
    for url in response_404_urls:
        if url not in unique_404_urls:
            unique_404_urls.append(url)

    report: dict[str, Any] = {
        "suite": "Deck Analysis Global E2E",
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