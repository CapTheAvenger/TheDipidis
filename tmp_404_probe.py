from playwright.sync_api import sync_playwright


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})

        hits: list[str] = []

        def on_response(resp):
            try:
                if resp.status == 404:
                    hits.append(resp.url)
            except Exception:
                pass

        def on_console(msg):
            if msg.type == "error":
                print("CONSOLE_ERROR", msg.text)

        page.on("response", on_response)
        page.on("console", on_console)

        page.goto("http://127.0.0.1:8000/index.html", wait_until="domcontentloaded", timeout=60000)
        page.locator("button[onclick=\"switchTab('current-analysis')\"]").first.click(timeout=15000)
        page.wait_for_selector("#current-analysis.active", timeout=25000)

        page.wait_for_timeout(2000)
        options = page.locator("#currentMetaDeckSelect option")
        if options.count() > 1:
            page.evaluate(
                """
                () => {
                    const select = document.getElementById('currentMetaDeckSelect');
                    const candidate = Array.from(select.options).find(o => o.value && !o.disabled);
                    if (candidate) {
                        select.value = candidate.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                """
            )

        page.wait_for_timeout(6000)
        browser.close()

    unique_hits: list[str] = []
    for url in hits:
        if url not in unique_hits:
            unique_hits.append(url)

    print("404_COUNT", len(unique_hits))
    for url in unique_hits:
        print("404_URL", url)


if __name__ == "__main__":
    main()
