import json
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.goto("http://127.0.0.1:8000/index.html", wait_until="domcontentloaded", timeout=60000)

        page.evaluate("() => { if (typeof window.switchTab === 'function') window.switchTab('past-meta'); }")
        page.wait_for_selector("#past-meta.active", timeout=30000)
        page.wait_for_timeout(2000)

        # Select format containing SVI-ASC
        page.evaluate(
            """
            () => {
                const format = document.getElementById('pastMetaFormatFilter');
                if (!format) return;
                const opt = Array.from(format.options).find(o => (o.value || '').trim() === 'SVI-ASC');
                if (opt) {
                    format.value = opt.value;
                    format.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            """
        )
        page.wait_for_timeout(1000)

        # Select tournament containing Houston
        page.evaluate(
            """
            () => {
                const tournament = document.getElementById('pastMetaTournamentFilter');
                if (!tournament) return;
                const opt = Array.from(tournament.options).find(o => (o.textContent || '').toLowerCase().includes('houston'));
                if (opt) {
                    tournament.value = opt.value;
                    tournament.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            """
        )
        page.wait_for_timeout(1000)

        # Select deck containing Alakazam Dudunsparce if present
        page.evaluate(
            """
            () => {
                const deck = document.getElementById('pastMetaDeckSelect');
                if (!deck) return;
                const target = Array.from(deck.options).find(o => (o.value || '').toLowerCase().includes('alakazam dudunsparce'));
                const first = Array.from(deck.options).find(o => !!o.value);
                const pick = target || first;
                if (pick) {
                    deck.value = pick.value;
                    deck.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            """
        )
        page.wait_for_timeout(1200)

        data = page.evaluate(
            """
            () => {
                const statCards = document.getElementById('pastMetaStatCards')?.textContent?.trim() || '';
                const overview = `${document.getElementById('pastMetaCardCount')?.textContent?.trim() || ''} ${document.getElementById('pastMetaCardCountSummary')?.textContent?.trim() || ''}`.trim();
                const selectedDeck = document.getElementById('pastMetaDeckSelect')?.value || '';
                const scope = window.pastMetaCurrentScope || null;
                const cards = (window.pastMetaCurrentCards || []).map(c => ({
                    name: c.card_name || c.full_card_name || '',
                    max_count: c.max_count,
                    total_count: c.total_count,
                    avg_overall: c.average_count_overall,
                    card_count: c.card_count,
                    deck_count: c.deck_count,
                    total_decks: c.total_decks_in_archetype
                }));
                const sumAvgOverall = cards.reduce((s, c) => s + (parseFloat(String(c.avg_overall || 0).replace(',', '.')) || 0), 0);
                const sumMax = cards.reduce((s, c) => s + (parseInt(c.max_count || 0, 10) || 0), 0);
                return {
                    selectedDeck,
                    statCards,
                    overview,
                    scope,
                    cardsLen: cards.length,
                    sumAvgOverall,
                    sumMax,
                    sample: cards.slice(0, 12)
                };
            }
            """
        )

        out = Path("tests/artifacts/past_meta_probe.json")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"WROTE {out}")
        browser.close()


if __name__ == "__main__":
    main()
