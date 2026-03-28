import hashlib
import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8000/index.html"
ARTIFACT_DIR = Path("tests/artifacts/city_league_meta")


@dataclass
class TestResult:
    name: str
    passed: bool
    details: str = ""
    metrics: dict[str, Any] | None = None


def add_result(results: list[TestResult], name: str, passed: bool, details: str = "", metrics: dict[str, Any] | None = None) -> None:
    results.append(TestResult(name=name, passed=passed, details=details, metrics=metrics))


def wait_for_count(page, selector: str, minimum: int = 1, timeout_ms: int = 30000) -> int:
    start = time.time()
    while (time.time() - start) * 1000 < timeout_ms:
        count = page.locator(selector).count()
        if count >= minimum:
            return count
        page.wait_for_timeout(250)
    return page.locator(selector).count()


def screenshot_file_info(path: Path) -> dict[str, Any]:
    size = path.stat().st_size if path.exists() else 0
    digest = ""
    if path.exists() and size > 0:
        digest = hashlib.md5(path.read_bytes()).hexdigest()
    return {"path": str(path), "size_bytes": size, "md5": digest}


def reload_with_format(page, fmt: str) -> None:
    page.evaluate("([f]) => localStorage.setItem('cityLeagueFormat', f)", [fmt])
    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector("#city-league.active", timeout=20000)


def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    results: list[TestResult] = []
    console_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})

        page.on("pageerror", lambda exc: console_errors.append(f"pageerror: {exc}"))

        def on_console(msg):
            if msg.type == "error":
                console_errors.append(f"console-error: {msg.text}")

        page.on("console", on_console)

        print("STEP: goto")
        page.goto(URL, wait_until="domcontentloaded", timeout=60000)

        try:
            print("STEP: verify tab")
            page.wait_for_selector("#city-league.active", timeout=20000)
            add_result(results, "Initial city-league tab active", True)
        except Exception as exc:
            add_result(results, "Initial city-league tab active", False, f"Tab not active: {exc}")

        print("STEP: wait initial tables")
        combined_rows = wait_for_count(page, "#cityLeagueCombinedTable tbody tr", minimum=1, timeout_ms=35000)
        full_rows = wait_for_count(page, "#cityLeagueFullTable tbody tr", minimum=1, timeout_ms=35000)
        add_result(
            results,
            "Initial meta tables rendered",
            combined_rows > 0 and full_rows > 0,
            "Combined and full tables contain rows." if (combined_rows > 0 and full_rows > 0) else "Expected rows missing.",
            {"combined_rows": combined_rows, "full_rows": full_rows},
        )

        print("STEP: search hook")
        has_search_hook = page.evaluate(
            "() => ({ has_input: !!document.getElementById('cityLeagueSearchFilter'), has_fn: typeof window.filterCityLeagueTable === 'function' })"
        )
        add_result(
            results,
            "Search hook available",
            bool(has_search_hook.get("has_input")) and bool(has_search_hook.get("has_fn")),
            "Search input and global hook are available." if (has_search_hook.get("has_input") and has_search_hook.get("has_fn")) else "Search hook incomplete.",
            has_search_hook,
        )

        # Visual snapshots: initial M4
        print("STEP: snapshot m4 initial")
        m4_initial = ARTIFACT_DIR / "city_league_m4_initial.png"
        page.screenshot(path=str(m4_initial), full_page=True)
        m4_initial_info = screenshot_file_info(m4_initial)
        add_result(
            results,
            "Snapshot M4 initial captured",
            m4_initial_info["size_bytes"] > 10000,
            "Initial snapshot captured." if m4_initial_info["size_bytes"] > 10000 else "Initial snapshot too small.",
            m4_initial_info,
        )

        # M3 load path + snapshot
        try:
            print("STEP: switch m3")
            reload_with_format(page, "M3")
            m3_rows = wait_for_count(page, "#cityLeagueCombinedTable tbody tr", minimum=1, timeout_ms=35000)
            m3_shot = ARTIFACT_DIR / "city_league_m3.png"
            page.screenshot(path=str(m3_shot), full_page=True)
            m3_info = screenshot_file_info(m3_shot)
            add_result(
                results,
                "Load M3 and snapshot",
                m3_rows > 0 and m3_info["size_bytes"] > 10000,
                "M3 rendered and snapshot captured." if (m3_rows > 0 and m3_info["size_bytes"] > 10000) else "M3 render/snapshot issue.",
                {"m3_rows": m3_rows, **m3_info},
            )
        except Exception as exc:
            add_result(results, "Load M3 and snapshot", False, f"M3 load failed: {exc}")
            m3_info = {"md5": "", "size_bytes": 0}

        # M4 load path + snapshot
        try:
            print("STEP: switch m4")
            reload_with_format(page, "M4")
            m4_rows = wait_for_count(page, "#cityLeagueCombinedTable tbody tr", minimum=1, timeout_ms=35000)
            m4_back_shot = ARTIFACT_DIR / "city_league_m4_back.png"
            page.screenshot(path=str(m4_back_shot), full_page=True)
            m4_back_info = screenshot_file_info(m4_back_shot)
            add_result(
                results,
                "Load M4 and snapshot",
                m4_rows > 0 and m4_back_info["size_bytes"] > 10000,
                "M4 rendered and snapshot captured." if (m4_rows > 0 and m4_back_info["size_bytes"] > 10000) else "M4 render/snapshot issue.",
                {"m4_rows": m4_rows, **m4_back_info},
            )
        except Exception as exc:
            add_result(results, "Load M4 and snapshot", False, f"M4 load failed: {exc}")
            m4_back_info = {"md5": "", "size_bytes": 0}

        # Basic visual regression heuristic: M3 should differ from M4 screenshot hash
        visual_diff_ok = bool(m3_info.get("md5")) and bool(m4_initial_info.get("md5")) and (m3_info.get("md5") != m4_initial_info.get("md5"))
        add_result(
            results,
            "Visual difference M4 vs M3",
            visual_diff_ok,
            "M4 and M3 snapshots differ." if visual_diff_ok else "Snapshots look identical by hash.",
            {"m4_md5": m4_initial_info.get("md5"), "m3_md5": m3_info.get("md5")},
        )

        # Search behavior on full table
        try:
            print("STEP: search behavior")
            first_name = page.locator("#cityLeagueFullTable tbody tr td:first-child").first.inner_text(timeout=8000).strip()
            token = first_name.split()[0] if first_name else ""
            page.fill("#cityLeagueSearchFilter", token)
            page.wait_for_timeout(600)

            row_texts = [t.strip() for t in page.locator("#cityLeagueFullTable tbody tr td:first-child").all_inner_texts() if t.strip()]
            search_pass = bool(token) and len(row_texts) > 0 and all(token.lower() in t.lower() for t in row_texts)
            add_result(
                results,
                "Search filter behavior",
                search_pass,
                "Search narrows rows correctly." if search_pass else "Search produced inconsistent rows.",
                {"token": token, "result_rows": len(row_texts), "sample": row_texts[:5]},
            )

            page.fill("#cityLeagueSearchFilter", "")
            page.wait_for_timeout(300)
        except Exception as exc:
            add_result(results, "Search filter behavior", False, f"Search test failed: {exc}")

        browser.close()

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    report = {
        "suite": "City League Meta E2E + Visual Snapshots",
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
        "results": [asdict(r) for r in results],
    }

    print("STEP: report")
    report_path = ARTIFACT_DIR / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
