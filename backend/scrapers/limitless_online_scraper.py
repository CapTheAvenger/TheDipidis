#!/usr/bin/env python3
"""
Limitless Online Deck Scraper - Fast Edition
Uses cloudscraper + BeautifulSoup4 + ThreadPoolExecutor for parallel matchup scraping.
"""

import csv
import re
import json
import html as html_mod
import os
import urllib.parse
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Tuple, Any

from bs4 import BeautifulSoup

from card_scraper_shared import (
    setup_console_encoding, get_app_path, get_data_dir, fetch_page_bs4,
    setup_logging, load_settings as _shared_load_settings,
)

setup_console_encoding()
logger = setup_logging("limitless_online_scraper")

# _get_scraper, safe_fetch_html replaced by fetch_page_bs4 from card_scraper_shared


# ── Settings ──────────────────────────────────────────────────────────────────
DEFAULT_SETTINGS: Dict[str, Any] = {
    "game": "POKEMON",
    "format": "STANDARD",
    "rotation": "2025",
    "set": "PFL",
    "top_decks_for_matchup": 10,
    "max_workers": 5,
    "delay_between_requests": 1.5,
    "output_file": "limitless_online_decks.csv",
}


def clean_deck_name(deck_name: str) -> str:
    """Clean deck name by removing extra whitespace and HTML artifacts."""
    deck_name = ' '.join(deck_name.split())
    deck_name = deck_name.replace('\n', '').replace('\r', '').strip()
    return deck_name


def _load_settings() -> Dict[str, Any]:
    return _shared_load_settings("limitless_online_settings.json", DEFAULT_SETTINGS)


def deck_name_to_url(deck_name: str) -> str:
    """Convert deck name to URL format (lowercase, spaces to hyphens)."""
    deck_name = deck_name.replace("\u2019s", "").replace("'s", "").replace("'", "")
    return deck_name.lower().replace(' ', '-')


def scrape_deck_statistics(
    game: str,
    format_type: str,
    rotation: Optional[str] = None,
    set_code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Scrape deck statistics from play.limitlesstcg.com/decks using BS4."""
    # Normalize legacy game code: the site requires "PTCG" not "POKEMON"
    if game.upper() == "POKEMON":
        game = "PTCG"
    params: Dict[str, str] = {"game": game, "format": format_type}
    if rotation:
        params["rotation"] = rotation
    if set_code:
        params["set"] = set_code

    url = f"https://play.limitlesstcg.com/decks?{urllib.parse.urlencode(params)}"
    logger.info("Fetching deck statistics from: %s", url)

    soup = fetch_page_bs4(url)
    if not soup:
        return []

    # Extract meta stats from <p> tag
    for p in soup.find_all("p"):
        text = p.get_text()
        m = re.search(r"(\d+)\s+tournaments,\s+(\d+)\s+players,\s+(\d+)\s+matches", text)
        if m:
            meta_stats = {
                "tournaments": int(m.group(1)),
                "players": int(m.group(2)),
                "matches": int(m.group(3)),
            }
            meta_path = os.path.join("data", "limitless_meta_stats.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta_stats, f, indent=2)
            logger.info("Meta statistics saved: %s", meta_stats)
            break

    table = soup.find("table")
    if not table:
        logger.warning("No table found on decks page")
        return []

    decks = []
    for row in table.find_all("tr"):
        # Find deck link directly to avoid tbody/td index issues
        deck_link = row.find("a", href=re.compile(r"^/decks/"))
        if not deck_link:
            continue

        deck_name = clean_deck_name(deck_link.get_text(strip=True))
        if not deck_name or deck_name.lower() == "other":
            continue

        href = deck_link.get("href", "")
        deck_url = href.replace("/decks/", "").split("?")[0].rstrip("/")

        cells = row.find_all(["td", "th"])
        texts = [c.get_text(strip=True) for c in cells]

        link_parent = deck_link.find_parent(["td", "th"])
        if link_parent not in cells:
            continue

        name_idx = cells.index(link_parent)

        if name_idx + 4 >= len(texts):
            continue

        rank     = texts[0]
        count    = texts[name_idx + 1]
        share    = texts[name_idx + 2]
        score    = texts[name_idx + 3]
        win_rate = texts[name_idx + 4]

        wins, losses, ties = 0, 0, 0
        sm = re.match(r"(\d+)\s*-\s*(\d+)\s*-\s*(\d+)", score)
        if sm:
            wins, losses, ties = int(sm.group(1)), int(sm.group(2)), int(sm.group(3))

        try:
            win_rate_numeric = float(win_rate.replace("%", "").strip())
        except ValueError:
            win_rate_numeric = 0.0

        try:
            share_numeric = float(share.replace("%", "").strip())
        except ValueError:
            share_numeric = 0.0

        decks.append({
            "rank": rank,
            "deck_name": deck_name,
            "count": count,
            "share": share,
            "share_numeric": share_numeric,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "win_rate": win_rate,
            "win_rate_numeric": win_rate_numeric,
            "deck_url": deck_url,
            "url": deck_name_to_url(deck_name),
            "scraped_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "format": format_type,
            "game": game,
        })

    logger.info("Found %s deck entries (Other excluded)", len(decks))
    return decks


def _scrape_single_matchup(
    deck_name: str,
    deck_url: str,
    settings: Dict[str, Any],
) -> Tuple[str, List[Dict[str, Any]]]:
    """Worker: scrape matchup data for one deck. Returns (deck_name, matchups)."""
    format_type = settings["format"]
    rotation    = settings.get("rotation", "")
    set_code    = settings.get("set", "")

    params = {
        "format": format_type.lower(),
        "rotation": rotation,
        "set": set_code,
    }
    url = (
        f"https://play.limitlesstcg.com/decks/{deck_url}/matchups/?"
        f"{urllib.parse.urlencode(params)}"
    )
    logger.info("  Fetching matchups: %s", url)

    soup = fetch_page_bs4(url)
    if not soup:
        # Fallback without set parameter
        params_ns = {"format": format_type.lower(), "rotation": rotation}
        url_fb = (
            f"https://play.limitlesstcg.com/decks/{deck_url}/matchups/?"
            f"{urllib.parse.urlencode(params_ns)}"
        )
        logger.info("  Fallback (no set): %s", url_fb)
        soup = fetch_page_bs4(url_fb)
        if not soup:
            return deck_name, []

    matchups = []
    for row in [tr for tr in soup.select("table tr") if tr.find("td")]:
        cells = row.find_all("td")

        # Identify score cell by W-L-T pattern
        score_cell = None
        score_idx  = None
        for i, cell in enumerate(cells):
            text = cell.get_text(strip=True)
            if re.match(r"\d+\s*-\s*\d+\s*-\s*\d+", text):
                score_cell = text
                score_idx  = i
                break

        if score_cell is None or score_idx is None or score_idx < 2:
            continue
        if score_idx + 1 >= len(cells):
            continue

        opponent_deck = cells[score_idx - 2].get_text(strip=True)
        winrate_text  = cells[score_idx + 1].get_text(strip=True)

        if not opponent_deck or opponent_deck.lower() in ("deck", "opponent", ""):
            continue

        m = re.match(r"(\d+)\s*-\s*(\d+)\s*-\s*(\d+)", score_cell)
        if not m:
            continue

        wins   = int(m.group(1))
        losses = int(m.group(2))
        ties   = int(m.group(3))
        total  = wins + losses + ties
        if total == 0:
            continue

        wr_numeric = (wins / (wins + losses)) * 100 if (wins + losses) > 0 else 0.0

        matchups.append({
            "opponent_deck": opponent_deck,
            "archetype": opponent_deck,
            "record": score_cell,
            "win_rate": winrate_text if winrate_text else f"{wr_numeric:.2f}%",
            "win_rate_numeric": wr_numeric,
            "total_games": total,
            "wins": wins,
            "losses": losses,
            "ties": ties,
        })

    logger.info("  %s: %s matchups found", deck_name, len(matchups))
    return deck_name, matchups


def analyze_matchups_for_top_decks(
    deck_data: List[Dict[str, Any]],
    settings: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Analyze matchups for top decks using ThreadPoolExecutor."""
    top_n       = settings.get("top_decks_for_matchup", 10)
    max_workers = settings.get("max_workers", 5)
    top_decks   = deck_data[:top_n]

    top_ratio_n     = min(20, len(deck_data))
    top_ratio_names = [d["deck_name"] for d in deck_data[:top_ratio_n]]

    logger.info("=" * 60)
    logger.info("Analyzing matchups for Top %s decks (max_workers=%s)...", top_n, max_workers)
    logger.info("=" * 60)

    # Scrape all matchup pages in parallel
    raw_results: Dict[str, List[Dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for deck in top_decks:
            dn  = deck["deck_name"]
            du  = deck.get("deck_url")
            if not du:
                logger.warning("No deck_url for %s, skipping.", dn)
                continue
            futures[executor.submit(_scrape_single_matchup, dn, du, settings)] = dn
        for future in as_completed(futures):
            dn, matchups = future.result()
            raw_results[dn] = matchups

    # Analyse results
    matchup_analysis: Dict[str, Dict[str, Any]] = {}
    for deck in top_decks:
        deck_name = deck["deck_name"]
        matchups  = raw_results.get(deck_name, [])

        if not matchups:
            logger.warning("No matchup data for %s", deck_name)
            matchup_analysis[deck_name] = {"best_matchups": [], "worst_matchups": []}
            continue

        filtered = [
            m for m in matchups
            if m["total_games"] >= 3 and m["opponent_deck"].lower() != "other"
        ]
        relevant = [
            m for m in filtered
            if m["opponent_deck"].lower() in [td.lower() for td in top_ratio_names]
        ]
        logger.info("  %s: %s relevant matchups vs Top 20", deck_name, len(relevant))

        relevant.sort(key=lambda x: x["win_rate_numeric"], reverse=True)
        best_5  = [m for m in relevant if m["win_rate_numeric"] >  50][:5]
        worst_5 = [m for m in relevant if m["win_rate_numeric"] < 50][-5:][::-1]

        pos = len([m for m in relevant if m["win_rate_numeric"] >  50])
        neg = len([m for m in relevant if m["win_rate_numeric"] < 50])

        all_opp: Dict[str, Any] = {}
        for matchup in filtered:
            opp = matchup["opponent_deck"]
            if opp not in all_opp:
                all_opp[opp] = matchup

        matchup_analysis[deck_name] = {
            "best_matchups":         best_5,
            "worst_matchups":        worst_5,
            "top20_matchups":        relevant,
            "positive_vs_top20":     pos,
            "negative_vs_top20":     neg,
            "all_opponent_matchups": all_opp,
        }

    return matchup_analysis


def save_to_csv(data: List[Dict[str, Any]], output_file: str):
    """Save scraped data to CSV file."""
    if not data:
        print("No data to save.")
        return
    
    output_path = os.path.join(get_data_dir(), output_file)
    
    print(f"\nSaving data to: {output_path}")
    
    fieldnames = ['rank', 'deck_name', 'count', 'share', 'share_numeric', 'wins', 'losses', 
                  'ties', 'win_rate', 'win_rate_numeric']
    
    try:
        with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            
            for row in data:
                # Format numeric values for German Excel and remove unnecessary fields
                row_formatted = {key: row[key] for key in fieldnames if key in row}
                row_formatted['share_numeric'] = str(row['share_numeric']).replace('.', ',')
                row_formatted['win_rate_numeric'] = str(row.get('win_rate_numeric', 0)).replace('.', ',')
                writer.writerow(row_formatted)
        
        print(f"Successfully saved {len(data)} entries to {output_file}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")

def load_previous_stats(stats_file: str) -> Dict[str, Dict[str, Any]]:
    """Load previous deck statistics from CSV file."""
    if not os.path.exists(stats_file):
        return {}
    
    previous_data = {}
    try:
        with open(stats_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                deck_name = row.get('deck_name', '')
                # Convert German decimal separator back to float
                share_numeric = row.get('share_numeric', '0').replace(',', '.')
                win_rate_numeric = row.get('win_rate_numeric', '0').replace(',', '.')
                
                previous_data[deck_name] = {
                    'rank': int(row.get('rank', 0)),
                    'count': int(row.get('count', 0)),
                    'share_numeric': float(share_numeric),
                    'wins': int(row.get('wins', 0)),
                    'losses': int(row.get('losses', 0)),
                    'ties': int(row.get('ties', 0)),
                    'win_rate_numeric': float(win_rate_numeric)
                }
    except Exception as e:
        print(f"⚠️  Warning: Could not load previous statistics: {e}")
        return {}
    
    return previous_data

def create_comparison_report(old_stats: Dict[str, Any], new_stats: Dict[str, Any], output_file: str, settings: Dict[str, Any], matchup_data: Optional[Dict[str, Any]] = None, deck_lookup: Optional[Dict[str, Any]] = None):
    """Create a detailed comparison report between old and new statistics."""
    # Write comparison files to data/ folder
    data_dir = get_data_dir()
    comparison_csv = os.path.join(data_dir, output_file.replace('.csv', '_comparison.csv'))
    comparison_html = os.path.join(data_dir, output_file.replace('.csv', '_comparison.html'))
    comparison_html_local = os.path.join(data_dir, output_file.replace('.csv', '_comparison_local.html'))
    
    # Prepare comparison data
    comparison_data = []
    
    # Get all unique deck names from both datasets
    all_decks = set(old_stats.keys()) | set(new_stats.keys())
    
    for deck_name in all_decks:
        old_data = old_stats.get(deck_name, {})
        new_data = new_stats.get(deck_name, {})
        
        old_rank = old_data.get('rank', 999)
        new_rank = new_data.get('rank', 999)
        old_count = old_data.get('count', 0)
        new_count = new_data.get('count', 0)
        old_share = old_data.get('share_numeric', 0)
        new_share = new_data.get('share_numeric', 0)
        old_winrate = old_data.get('win_rate_numeric', 0)
        new_winrate = new_data.get('win_rate_numeric', 0)
        
        rank_change = old_rank - new_rank if old_rank < 999 and new_rank < 999 else 0
        count_change = new_count - old_count
        share_change = new_share - old_share
        winrate_change = new_winrate - old_winrate
        
        # Determine status
        if old_count == 0:
            status = 'NEU'
        elif new_count == 0:
            status = 'VERSCHWUNDEN'
        else:
            status = 'BESTEHEND'
        
        # Determine trend based on rank
        if old_rank > new_rank and new_rank < 999:
            trend = 'AUFSTEIGEND'  # Better rank (lower number)
        elif old_rank < new_rank and old_rank < 999:
            trend = 'ABSTEIGEND'  # Worse rank (higher number)
        else:
            trend = 'STABIL'
        
        comparison_data.append({
            'deck_name': deck_name,
            'status': status,
            'trend': trend,
            'old_rank': old_rank if old_rank < 999 else '-',
            'new_rank': new_rank if new_rank < 999 else '-',
            'rank_change': rank_change,
            'old_count': old_count,
            'new_count': new_count,
            'count_change': count_change,
            'old_share': round(old_share, 2),
            'new_share': round(new_share, 2),
            'share_change': round(share_change, 2),
            'old_winrate': round(old_winrate, 2),
            'new_winrate': round(new_winrate, 2),
            'winrate_change': round(winrate_change, 2)
        })
    
    # Sort by new rank
    comparison_data.sort(key=lambda x: x['new_rank'] if isinstance(x['new_rank'], int) else 999)
    
    # Save matchup data to separate CSV if available
    if matchup_data:
        matchup_csv = os.path.join(data_dir, output_file.replace('.csv', '_matchups.csv'))
        try:
            with open(matchup_csv, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['deck_name', 'opponent', 'win_rate', 'record', 'total_games']
                writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                writer.writeheader()
                
                for deck_name, matchups in matchup_data.items():
                    # Write Top 20 matchups for each deck
                    top20_matchups = matchups.get('top20_matchups', [])
                    for matchup in top20_matchups:
                        writer.writerow({
                            'deck_name': deck_name,
                            'opponent': matchup['opponent_deck'],
                            'win_rate': str(round(matchup['win_rate_numeric'], 2)).replace('.', ','),
                            'record': matchup['record'],
                            'total_games': matchup['total_games']
                        })
            
            print(f"Matchup data saved to: {matchup_csv}")
        except Exception as e:
            print(f"Error saving matchup CSV: {e}")
    
    # Save to CSV
    try:
        with open(comparison_csv, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['deck_name', 'status', 'trend', 
                         'old_rank', 'new_rank', 'rank_change',
                         'old_count', 'new_count', 'count_change',
                         'old_share', 'new_share', 'share_change',
                         'old_winrate', 'new_winrate', 'winrate_change']
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            
            for row in comparison_data:
                # Format for German Excel
                row_formatted = row.copy()
                for key in ['old_share', 'new_share', 'share_change', 
                           'old_winrate', 'new_winrate', 'winrate_change']:
                    if isinstance(row[key], (int, float)):
                        row_formatted[key] = str(row[key]).replace('.', ',')
                writer.writerow(row_formatted)
        
        print(f"\nComparison report saved to: {comparison_csv}")
    except Exception as e:
        print(f"Error saving comparison CSV: {e}")
    
    # Create HTML report (data/ folder)
    try:
        logger.debug("Creating HTML report: %s", comparison_html)
        logger.debug("comparison_data length: %s", len(comparison_data))
        logger.debug("old_stats length: %s", len(old_stats))
        logger.debug("new_stats length: %s", len(new_stats))
        logger.debug(f"matchup_data: {type(matchup_data)}, {'has data' if matchup_data else 'is None/empty'}")
        logger.debug(f"deck_lookup: {type(deck_lookup)}, {'has data' if deck_lookup else 'is None/empty'}")
        create_html_report(comparison_data, comparison_html, old_stats, new_stats, settings, matchup_data, deck_lookup)
        print(f"HTML comparison report saved to: {comparison_html}")
    except Exception as e:
        print(f"Error creating HTML report (data/): {e}")
        import traceback
        traceback.print_exc()
    
    # Create HTML report (local - neben EXE)
    try:
        create_html_report(comparison_data, comparison_html_local, old_stats, new_stats, settings, matchup_data, deck_lookup)
        print(f"HTML comparison report saved to: {comparison_html_local}")
    except Exception as e:
        print(f"Error creating HTML report (local): {e}")
    
    # Print summary to console
    print_comparison_summary(comparison_data)

def create_deck_list_html(deck_data: List[Dict[str, Any]], output_file: str, deck_lookup: Dict[str, Any]):
    """Create a simple HTML report of all decks."""
    base_path = get_data_dir()
    html_path = os.path.join(base_path, output_file)
    
    html_content = f"""<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Limitless Online Decks - Overview</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}
        .header h1 {{
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }}
        .content {{
            padding: 30px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        th {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 12px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
        }}
        td {{
            padding: 12px;
            border-bottom: 1px solid #ecf0f1;
        }}
        tr:hover {{
            background-color: #f8f9fa;
        }}
        .rank {{
            font-weight: bold;
            color: #667eea;
            font-size: 1.1em;
        }}
        .positive {{
            color: #27ae60;
            font-weight: bold;
        }}
        .negative {{
            color: #e74c3c;
            font-weight: bold;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Limitless Online Decks</h1>
            <p>Complete Deck Statistics</p>
        </div>
        <div class="content">
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Deck Name</th>
                        <th>Entries</th>
                        <th>Meta Share</th>
                        <th>Wins</th>
                        <th>Losses</th>
                        <th>Ties</th>
                        <th>Win Rate</th>
                    </tr>
                </thead>
                <tbody>
                    {''.join([f'''
                    <tr>
                        <td class="rank">#{deck['rank']}</td>
                        <td><strong>{deck['deck_name']}</strong></td>
                        <td>{deck['count']}</td>
                        <td>{deck['share']}</td>
                        <td class="positive">{deck['wins']}</td>
                        <td class="negative">{deck['losses']}</td>
                        <td>{deck['ties']}</td>
                        <td><strong>{deck['win_rate']}</strong></td>
                    </tr>
                    ''' for deck in deck_data])}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>"""
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

def create_html_report(comparison_data: List[Dict[str, Any]], output_file: str, 
                       old_stats: Dict[str, Any], new_stats: Dict[str, Any], settings: Dict[str, Any], matchup_data: Optional[Dict[str, Any]] = None, deck_lookup: Optional[Dict[str, Any]] = None):
    """Create a visually appealing HTML comparison report."""
    
    # Get Top 10 from both periods
    old_top10 = sorted(
        [(name, data) for name, data in old_stats.items()],
        key=lambda x: x[1].get('rank', 999)
    )[:10]
    new_top10 = sorted(
        [(name, data) for name, data in new_stats.items()],
        key=lambda x: x[1].get('rank', 999)
    )[:10]
    
    old_top10_names = set(name for name, _ in old_top10)
    new_top10_names = set(name for name, _ in new_top10)
    
    entered_top10 = new_top10_names - old_top10_names
    left_top10 = old_top10_names - new_top10_names
    
    # New decks
    new_decks = [d for d in comparison_data if d['status'] == 'NEU']
    disappeared_decks = [d for d in comparison_data if d['status'] == 'VERSCHWUNDEN']
    
    # Biggest rank climbers and fallers (only within Top 30)
    rank_climbers = [d for d in comparison_data if d['rank_change'] > 0 and isinstance(d['new_rank'], int) and d['new_rank'] <= 30]
    rank_climbers.sort(key=lambda x: x['rank_change'], reverse=True)
    
    rank_fallers = [d for d in comparison_data if d['rank_change'] < 0 and isinstance(d['new_rank'], int) and d['new_rank'] <= 30]
    rank_fallers.sort(key=lambda x: x['rank_change'])
    
    # Pre-calculate complex HTML sections to avoid nested f-strings
    top3_by_count_html = ""
    if new_stats:
        try:
            decks_by_count = sorted(
                [{'deck_name': k, 'count': int(v.get('count', '0').replace(',', ''))} 
                 for k, v in new_stats.items()],
                key=lambda x: x['count'], 
                reverse=True
            )[:3]
            top3_by_count_html = '<br>'.join(
                f'<span style="color: #3498db;">{d["deck_name"]}</span> ({d["count"]})'
                for d in decks_by_count
            )
        except Exception as e:
            print(f"Warning: Could not calculate top 3 by count: {e}")
            top3_by_count_html = "N/A"
    else:
        top3_by_count_html = "N/A"
    
    # Calculate total deck count
    total_deck_count = 0
    if new_stats:
        try:
            total_deck_count = sum(int(v.get('count', '0').replace(',', '')) for v in new_stats.values())
        except Exception as e:
            print(f"Warning: Could not calculate total deck count: {e}")
    
    top_by_winrate_html = "N/A"
    if new_stats:
        try:
            max_count = max(int(v.get('count', '0').replace(',', '')) for v in new_stats.values())
            min_count_threshold = max_count * 0.1
            
            decks_with_winrate = [
                {'deck_name': k, 
                 'count': int(v.get('count', '0').replace(',', '')),
                 'win_rate_numeric': v.get('win_rate_numeric', 0)}
                for k, v in new_stats.items()
                if int(v.get('count', '0').replace(',', '')) >= min_count_threshold
            ]
            
            if decks_with_winrate:
                decks_with_winrate.sort(key=lambda x: x['win_rate_numeric'], reverse=True)
                # Get top 3 instead of just top 1
                top3_winrate = decks_with_winrate[:3]
                top_by_winrate_html = '<br>'.join(
                    f'<span style="color: #27ae60;">{d["deck_name"]}</span> ({d["win_rate_numeric"]:.1f}%)'
                    for d in top3_winrate
                )
        except Exception as e:
            print(f"Warning: Could not calculate top by WR: {e}")
    
    top10_changes_html = ""
    if entered_top10 or left_top10:
        changes = []
        for d in list(entered_top10)[:3]:
            wr = deck_lookup.get(d, {}).get('win_rate_numeric', 0) if deck_lookup else 0
            changes.append(f'✅ {d} ({wr:.1f}%)')
        for d in list(left_top10)[:3]:
            wr = deck_lookup.get(d, {}).get('win_rate_numeric', 0) if deck_lookup else 0
            changes.append(f'❌ {d} ({wr:.1f}%)')
        top10_changes_html = '<br>'.join(changes)
    else:
        top10_changes_html = 'No changes'
    
    html_content = f"""<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Limitless Online Deck Comparison Report</title>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }}
        .container {{
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }}
        h1 {{
            color: #2c3e50;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2.5em;
        }}
        .subtitle {{
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 30px;
            font-size: 1.2em;
        }}
        .meta-info {{
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            text-align: center;
        }}
        .meta-info span {{
            display: inline-block;
            margin: 0 15px;
            font-weight: bold;
        }}
        .section {{
            margin-bottom: 40px;
        }}
        .section h2 {{
            color: #34495e;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }}
        .stat-card h3 {{
            margin: 0 0 10px 0;
            font-size: 1.1em;
            opacity: 0.9;
        }}
        .stat-card .value {{
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        th {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }}
        td {{
            padding: 12px;
            border-bottom: 1px solid #ecf0f1;
        }}
        tr:hover {{
            background-color: #f8f9fa;
        }}
        .badge {{
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: bold;
        }}
        .badge-new {{ background-color: #2ecc71; color: white; }}
        .badge-disappeared {{ background-color: #e74c3c; color: white; }}
        .badge-stable {{ background-color: #95a5a6; color: white; }}
        .badge-up {{ background-color: #3498db; color: white; }}
        .badge-down {{ background-color: #e67e22; color: white; }}
        .positive {{ color: #27ae60; font-weight: bold; }}
        .negative {{ color: #e74c3c; font-weight: bold; }}
        .neutral {{ color: #95a5a6; }}
        .rank-change {{
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 3px;
        }}
        .rank-up {{
            background-color: #d4edda;
            color: #155724;
        }}
        .rank-down {{
            background-color: #f8d7da;
            color: #721c24;
        }}
        .opponent-option {{
            transition: all 0.2s ease;
        }}
        .opponent-option:hover {{
            background-color: #667eea !important;
            color: white;
        }}
    </style>
</head>
<body>
    <div class="container">
        

        <div class="stats-grid">
            <div class="stat-card">
                <h3>📊 Archetype Overview</h3>
                <div class="value">{total_deck_count:,} ({len(new_stats)})</div>
                <p style="font-size: 0.9em; margin: 10px 0;"><strong>Top 3 by Count:</strong><br>{top3_by_count_html}</p>
                <p style="font-size: 0.9em; margin: 10px 0;"><strong>Top 3 by Win Rate (≥10% of #1 games):</strong><br>{top_by_winrate_html}</p>
            </div>
            <div class="stat-card">
                <h3>🔄 Top 10 Changes</h3>
                <div class="value">{len(entered_top10) + len(left_top10)}</div>
                <p style="font-size: 0.85em;">{top10_changes_html}</p>
            </div>
            <div class="stat-card">
                <h3>🎴 Meta</h3>
                <div class="value" style="font-size: 1.8em; margin: 10px 0;">SVI-{settings.get('set', 'PFL')}</div>
                <p style="font-size: 0.9em;">Current Format Legality</p>
            </div>
        </div>

        <!-- Climbers and Fallers Side by Side -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
            <div class="section">
                <h2>📈 Biggest Rank Climbers</h2>
                <table>
                    <tr>
                        <th>Deck</th>
                        <th>Rank</th>
                        <th>Win Rate</th>
                    </tr>
                    {''.join(f"""
                    <tr>
                        <td><strong>{deck['deck_name']}</strong></td>
                        <td>#{deck['new_rank']} <span class="rank-change rank-up">(▲ {deck['rank_change']})</span></td>
                        <td>{deck_lookup.get(deck['deck_name'], dict()).get('win_rate_numeric', 0):.1f}% <span class="{'positive' if deck['winrate_change'] > 0 else 'negative' if deck['winrate_change'] < 0 else 'neutral'}">({deck['winrate_change']:+.2f}%)</span></td>
                    </tr>
                    """ for deck in rank_climbers[:10])}
                </table>
            </div>

            <div class="section">
                <h2>📉 Biggest Rank Fallers</h2>
                <table>
                    <tr>
                        <th>Deck</th>
                        <th>Rank</th>
                        <th>Win Rate</th>
                    </tr>
                    {''.join(f"""
                    <tr>
                        <td><strong>{deck['deck_name']}</strong></td>
                        <td>#{deck['new_rank']} <span class="rank-change rank-down">(▼ {abs(deck['rank_change'])})</span></td>
                        <td>{deck_lookup.get(deck['deck_name'], dict()).get('win_rate_numeric', 0):.1f}% <span class="{'positive' if deck['winrate_change'] > 0 else 'negative' if deck['winrate_change'] < 0 else 'neutral'}">({deck['winrate_change']:+.2f}%)</span></td>
                    </tr>
                    """ for deck in rank_fallers[:10])}
                </table>
            </div>
        </div>

        {f'''
        <div class="section">
            <h2>🎯 Matchup Analysis - Top 100 Decks</h2>
            <p style="color: #7f8c8d; margin-bottom: 20px;">Best and Worst matchups against Top 10 decks · Select opponent deck for detailed matchup</p>
            
            ''' if matchup_data else ''}
            
            {f'''
            <!-- Top 10 Decks - Expanded by default -->
            <details open style="margin-bottom: 30px; border: 2px solid #3498db; border-radius: 8px; padding: 15px; background: #ecf7ff;">
                <summary style="cursor: pointer; font-size: 1.3em; font-weight: bold; color: #2c3e50; padding: 10px; margin: -15px -15px 15px -15px; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; border-radius: 6px 6px 0 0;">
                    🏆 Top 10 Decks (Rank 1-10)
                </summary>
                {''.join(f"""
            <div style="margin-bottom: 40px; background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="color: #2c3e50; margin-top: 0;">{html_mod.escape(deck_name)} <span style="font-size: 0.8em; color: #7f8c8d;">(Rank #{deck_lookup.get(deck_name, dict()).get('rank', '?')} | Total WR: {deck_lookup.get(deck_name, dict()).get('win_rate_numeric', 0):.1f}%, Vs Top20: {matchups.get('positive_vs_top20', 0)}:{matchups.get('negative_vs_top20', 0)})</span></h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4 style="color: #27ae60; margin-bottom: 10px;">✅ Best Matchups</h4>
                        <table style="box-shadow: none;">
                            <tr style="background: #d4edda;">
                                <th style="background: #27ae60;">Opponent</th>
                                <th style="background: #27ae60;">Win Rate</th>
                                <th style="background: #27ae60;">Record</th>
                            </tr>
                            {''.join(f"""
                            <tr>
                                <td><strong>{matchup['opponent_deck']}</strong></td>
                                <td><strong>{matchup['win_rate_numeric']:.1f}%</strong></td>
                                <td>{matchup['record']} ({matchup['total_games']} games)</td>
                            </tr>
                            """ for matchup in matchups.get('best_matchups', [])) if matchups.get('best_matchups') else '<tr><td colspan="3" style="text-align: center; color: #95a5a6;">No data available</td></tr>'}
                        </table>
                    </div>
                    
                    <div>
                        <h4 style="color: #e74c3c; margin-bottom: 10px;">❌ Worst Matchups</h4>
                        <table style="box-shadow: none;">
                            <tr style="background: #f8d7da;">
                                <th style="background: #e74c3c;">Opponent</th>
                                <th style="background: #e74c3c;">Win Rate</th>
                                <th style="background: #e74c3c;">Record</th>
                            </tr>
                            {''.join(f"""
                            <tr>
                                <td><strong>{matchup['opponent_deck']}</strong></td>
                                <td><strong>{matchup['win_rate_numeric']:.1f}%</strong></td>
                                <td>{matchup['record']} ({matchup['total_games']} games)</td>
                            </tr>
                            """ for matchup in matchups.get('worst_matchups', [])) if matchups.get('worst_matchups') else '<tr><td colspan="3" style="text-align: center; color: #95a5a6;">No data available</td></tr>'}
                        </table>
                    </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 5px; border: 2px solid #3498db; margin-top: 20px;">
                    <h4 style="margin-top: 0; color: #3498db;">🔍 Select & Analyze Opponent Matchup</h4>
                    <label for="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="display: block; margin-bottom: 8px; font-weight: bold;">Search Opponent:</label>
                    <div style="position: relative;">
                        <input type="text" id="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" placeholder="Type to search deck..." style="width: 100%; padding: 10px; border: 2px solid #bbb; border-radius: 4px; font-size: 1em;" oninput="filterOpponents(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}')">
                        <div id="opponent_dropdown_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #bbb; border-top: none; border-radius: 0 0 4px 4px; max-height: 250px; overflow-y: auto; display: none; z-index: 1000;">
                            {''.join(f"<div class=\"opponent-option\" data-value=\"{html_mod.escape(opponent)}\" onclick=\"selectOpponent(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}', '{html_mod.escape(opponent).replace(chr(39), chr(92)+chr(39))}')\" style=\"padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;\">{html_mod.escape(opponent)}</div>" for opponent in sorted(matchups.get('all_opponent_matchups', dict()).keys()))}
                        </div>
                    </div>
                    <input type="hidden" id="opponent_selected_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" value="">
                    <div id="matchup_details_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="margin-top: 15px; display: none; background: #ecf0f1; padding: 15px; border-radius: 4px;"></div>
                </div>
                
                <script>
                window.matchupData_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')} = {json.dumps({k: {'opponent_deck': v.get('opponent_deck'), 'win_rate': v.get('win_rate'), 'win_rate_numeric': v.get('win_rate_numeric'), 'record': v.get('record'), 'total_games': v.get('total_games')} for k, v in matchups.get('all_opponent_matchups', dict()).items()})};
                </script>
            </div>
            """ for deck_name, matchups in (sorted([(dn, m) for dn, m in matchup_data.items() if int(deck_lookup.get(dn, dict()).get('rank', 999)) <= 10], key=lambda x: int(deck_lookup.get(x[0], dict()).get('rank', 999))) if matchup_data else []) if deck_name.lower() != 'other')}
            </details>
            
            <!-- Rank 11-30 - Collapsed by default -->
            <details style="margin-bottom: 30px; border: 2px solid #e67e22; border-radius: 8px; padding: 15px; background: #fef5e7;">
                <summary style="cursor: pointer; font-size: 1.3em; font-weight: bold; color: #2c3e50; padding: 10px; margin: -15px -15px 15px -15px; background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); color: white; border-radius: 6px 6px 0 0;">
                    📊 Rank 11-30
                </summary>
                {''.join(f"""
            <div style="margin-bottom: 40px; background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="color: #2c3e50; margin-top: 0;">{html_mod.escape(deck_name)} <span style="font-size: 0.8em; color: #7f8c8d;">(Rank #{deck_lookup.get(deck_name, dict()).get('rank', '?')} | Total WR: {deck_lookup.get(deck_name, dict()).get('win_rate_numeric', 0):.1f}%, Vs Top20: {matchups.get('positive_vs_top20', 0)}:{matchups.get('negative_vs_top20', 0)})</span></h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4 style="color: #27ae60; margin-bottom: 10px;">✅ Best Matchups</h4>
                        <table style="box-shadow: none;">
                            <tr style="background: #d4edda;">
                                <th style="background: #27ae60;">Opponent</th>
                                <th style="background: #27ae60;">Win Rate</th>
                                <th style="background: #27ae60;">Record</th>
                            </tr>
                            {''.join(f"""
                            <tr>
                                <td><strong>{matchup['opponent_deck']}</strong></td>
                                <td><strong>{matchup['win_rate_numeric']:.1f}%</strong></td>
                                <td>{matchup['record']} ({matchup['total_games']} games)</td>
                            </tr>
                            """ for matchup in matchups.get('best_matchups', [])) if matchups.get('best_matchups') else '<tr><td colspan="3" style="text-align: center; color: #95a5a6;">No data available</td></tr>'}
                        </table>
                    </div>
                    
                    <div>
                        <h4 style="color: #e74c3c; margin-bottom: 10px;">❌ Worst Matchups</h4>
                        <table style="box-shadow: none;">
                            <tr style="background: #f8d7da;">
                                <th style="background: #e74c3c;">Opponent</th>
                                <th style="background: #e74c3c;">Win Rate</th>
                                <th style="background: #e74c3c;">Record</th>
                            </tr>
                            {''.join(f"""
                            <tr>
                                <td><strong>{matchup['opponent_deck']}</strong></td>
                                <td><strong>{matchup['win_rate_numeric']:.1f}%</strong></td>
                                <td>{matchup['record']} ({matchup['total_games']} games)</td>
                            </tr>
                            """ for matchup in matchups.get('worst_matchups', [])) if matchups.get('worst_matchups') else '<tr><td colspan="3" style="text-align: center; color: #95a5a6;">No data available</td></tr>'}
                        </table>
                    </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 5px; border: 2px solid #3498db; margin-top: 20px;">
                    <h4 style="margin-top: 0; color: #3498db;">🔍 Select & Analyze Opponent Matchup</h4>
                    <label for="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="display: block; margin-bottom: 8px; font-weight: bold;">Search Opponent:</label>
                    <div style="position: relative;">
                        <input type="text" id="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" placeholder="Type to search deck..." style="width: 100%; padding: 10px; border: 2px solid #bbb; border-radius: 4px; font-size: 1em;" oninput="filterOpponents(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}')">
                        <div id="opponent_dropdown_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #bbb; border-top: none; border-radius: 0 0 4px 4px; max-height: 250px; overflow-y: auto; display: none; z-index: 1000;">
                            {''.join(f"<div class=\"opponent-option\" data-value=\"{html_mod.escape(opponent)}\" onclick=\"selectOpponent(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}', '{html_mod.escape(opponent).replace(chr(39), chr(92)+chr(39))}')\" style=\"padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;\">{html_mod.escape(opponent)}</div>" for opponent in sorted(matchups.get('all_opponent_matchups', dict()).keys()))}
                        </div>
                    </div>
                    <input type="hidden" id="opponent_selected_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" value="">
                    <div id="matchup_details_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="margin-top: 15px; display: none; background: #ecf0f1; padding: 15px; border-radius: 4px;"></div>
                </div>
                
                <script>
                window.matchupData_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')} = {json.dumps({k: {'opponent_deck': v.get('opponent_deck'), 'win_rate': v.get('win_rate'), 'win_rate_numeric': v.get('win_rate_numeric'), 'record': v.get('record'), 'total_games': v.get('total_games')} for k, v in matchups.get('all_opponent_matchups', dict()).items()})};
                </script>
            </div>
            """ for deck_name, matchups in (sorted([(dn, m) for dn, m in matchup_data.items() if 11 <= int(deck_lookup.get(dn, dict()).get('rank', 999)) <= 30], key=lambda x: int(deck_lookup.get(x[0], dict()).get('rank', 999))) if matchup_data else []) if deck_name.lower() != 'other')}
            </details>
            
            <!-- Rank 31+ - Collapsed by default -->
            <details style="margin-bottom: 30px; border: 2px solid #95a5a6; border-radius: 8px; padding: 15px; background: #f8f9fa;">
                <summary style="cursor: pointer; font-size: 1.3em; font-weight: bold; color: #2c3e50; padding: 10px; margin: -15px -15px 15px -15px; background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%); color: white; border-radius: 6px 6px 0 0;">
                    📋 Rest (Rank 31+)
                </summary>
                {''.join(f"""
            <div style="margin-bottom: 40px; background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="color: #2c3e50; margin-top: 0;">{html_mod.escape(deck_name)} <span style="font-size: 0.8em; color: #7f8c8d;">(Rank #{deck_lookup.get(deck_name, dict()).get('rank', '?')} | Total WR: {deck_lookup.get(deck_name, dict()).get('win_rate_numeric', 0):.1f}%, Vs Top20: {matchups.get('positive_vs_top20', 0)}:{matchups.get('negative_vs_top20', 0)})</span></h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4 style="color: #27ae60; margin-bottom: 10px;">✅ Best Matchups</h4>
                        <table style="box-shadow: none;">
                            <tr style="background: #d4edda;">
                                <th style="background: #27ae60;">Opponent</th>
                                <th style="background: #27ae60;">Win Rate</th>
                                <th style="background: #27ae60;">Record</th>
                            </tr>
                            {''.join(f"""
                            <tr>
                                <td><strong>{matchup['opponent_deck']}</strong></td>
                                <td><strong>{matchup['win_rate_numeric']:.1f}%</strong></td>
                                <td>{matchup['record']} ({matchup['total_games']} games)</td>
                            </tr>
                            """ for matchup in matchups.get('best_matchups', [])) if matchups.get('best_matchups') else '<tr><td colspan="3" style="text-align: center; color: #95a5a6;">No data available</td></tr>'}
                        </table>
                    </div>
                    
                    <div>
                        <h4 style="color: #e74c3c; margin-bottom: 10px;">❌ Worst Matchups</h4>
                        <table style="box-shadow: none;">
                            <tr style="background: #f8d7da;">
                                <th style="background: #e74c3c;">Opponent</th>
                                <th style="background: #e74c3c;">Win Rate</th>
                                <th style="background: #e74c3c;">Record</th>
                            </tr>
                            {''.join(f"""
                            <tr>
                                <td><strong>{matchup['opponent_deck']}</strong></td>
                                <td><strong>{matchup['win_rate_numeric']:.1f}%</strong></td>
                                <td>{matchup['record']} ({matchup['total_games']} games)</td>
                            </tr>
                            """ for matchup in matchups.get('worst_matchups', [])) if matchups.get('worst_matchups') else '<tr><td colspan="3" style="text-align: center; color: #95a5a6;">No data available</td></tr>'}
                        </table>
                    </div>
                </div>
                
                <div style="background: white; padding: 15px; border-radius: 5px; border: 2px solid #3498db; margin-top: 20px;">
                    <h4 style="margin-top: 0; color: #3498db;">🔍 Select & Analyze Opponent Matchup</h4>
                    <label for="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="display: block; margin-bottom: 8px; font-weight: bold;">Search Opponent:</label>
                    <div style="position: relative;">
                        <input type="text" id="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" placeholder="Type to search deck..." style="width: 100%; padding: 10px; border: 2px solid #bbb; border-radius: 4px; font-size: 1em;" oninput="filterOpponents(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}')">
                        <div id="opponent_dropdown_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #bbb; border-top: none; border-radius: 0 0 4px 4px; max-height: 250px; overflow-y: auto; display: none; z-index: 1000;">
                            {''.join(f"<div class=\"opponent-option\" data-value=\"{html_mod.escape(opponent)}\" onclick=\"selectOpponent(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}', '{html_mod.escape(opponent).replace(chr(39), chr(92)+chr(39))}')\" style=\"padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;\">{html_mod.escape(opponent)}</div>" for opponent in sorted(matchups.get('all_opponent_matchups', dict()).keys()))}
                        </div>
                    </div>
                    <input type="hidden" id="opponent_selected_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" value="">
                    <div id="matchup_details_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="margin-top: 15px; display: none; background: #ecf0f1; padding: 15px; border-radius: 4px;"></div>
                </div>
                
                <script>
                window.matchupData_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')} = {json.dumps({k: {'opponent_deck': v.get('opponent_deck'), 'win_rate': v.get('win_rate'), 'win_rate_numeric': v.get('win_rate_numeric'), 'record': v.get('record'), 'total_games': v.get('total_games')} for k, v in matchups.get('all_opponent_matchups', dict()).items()})};
                </script>
            </div>
            """ for deck_name, matchups in (sorted([(dn, m) for dn, m in matchup_data.items() if int(deck_lookup.get(dn, dict()).get('rank', 999)) > 30], key=lambda x: int(deck_lookup.get(x[0], dict()).get('rank', 999))) if matchup_data else []) if deck_name.lower() != 'other')}
            </details>
        </div>
        
        <script>
        function filterOpponents(input, deckName) {{
            const searchTerm = input.value.toLowerCase();
            const dropdown = document.getElementById('opponent_dropdown_' + deckName);
            const options = dropdown.querySelectorAll('.opponent-option');
            let visibleCount = 0;
            
            options.forEach(option => {{
                const text = option.textContent.toLowerCase();
                if (text.includes(searchTerm)) {{
                    option.style.display = 'block';
                    visibleCount++;
                }} else {{
                    option.style.display = 'none';
                }}
            }});
            
            // Show dropdown if there's input
            if (searchTerm.length > 0 && visibleCount > 0) {{
                dropdown.style.display = 'block';
            }} else if (searchTerm.length > 0) {{
                dropdown.style.display = 'block';
            }} else {{
                dropdown.style.display = 'none';
            }}
        }}
        
        function selectOpponent(element, deckName, opponent) {{
            const input = document.getElementById('opponent_search_' + deckName);
            const hidden = document.getElementById('opponent_selected_' + deckName);
            const dropdown = document.getElementById('opponent_dropdown_' + deckName);
            
            input.value = opponent;
            hidden.value = opponent;
            dropdown.style.display = 'none';
            
            showMatchup(opponent, deckName);
        }}
        
        function showMatchup(opponent, deckName) {{
            const detailsDiv = document.getElementById('matchup_details_' + deckName);
            
            if (!opponent) {{
                detailsDiv.style.display = 'none';
                return;
            }}
            
            const dataVar = 'matchupData_' + deckName;
            const matchupData = window[dataVar];
            
            if (matchupData && matchupData[opponent]) {{
                const data = matchupData[opponent];
                const wr = data.win_rate_numeric;
                const color = wr > 50 ? '#27ae60' : wr < 50 ? '#e74c3c' : '#95a5a6';
                
                detailsDiv.innerHTML = `
                    <h4 style="margin-top: 0; color: #2c3e50;">Matchup vs ${{opponent}}</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #ddd;">
                            <td style="padding: 8px; font-weight: bold;">Win Rate:</td>
                            <td style="padding: 8px; font-weight: bold; color: ${{color}}; font-size: 1.4em;">${{data.win_rate}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Record:</td>
                            <td style="padding: 8px;">${{data.record}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;">Total Games:</td>
                            <td style="padding: 8px; font-weight: bold;">${{data.total_games}}</td>
                        </tr>
                    </table>
                `;
                detailsDiv.style.display = 'block';
            }}
        }}
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {{
            const dropdowns = document.querySelectorAll('[id^="opponent_dropdown_"]');
            dropdowns.forEach(dropdown => {{
                if (!event.target.closest('div[id^="opponent_search_"]') && !dropdown.contains(event.target)) {{
                    dropdown.style.display = 'none';
                }}
            }});
        }});
        </script>
        ''' if matchup_data else ''}

        <div class="section">
            <h2>📋 Full Comparison Table</h2>
            <table>
                <tr>
                    <th>Deck</th>
                    <th>Rank</th>
                    <th>Count</th>
                    <th>Win Rate</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['deck_name']}</strong></td>
                    <td>{deck['new_rank']} {f'<span class="rank-change rank-up">(▲{deck["rank_change"]})</span>' if deck['rank_change'] > 0 else f'<span class="rank-change rank-down">(▼{abs(deck["rank_change"])})</span>' if deck['rank_change'] < 0 else '(-)'}</td>
                    <td>{deck['new_count']} <span class="{'positive' if deck['count_change'] > 0 else 'negative' if deck['count_change'] < 0 else 'neutral'}">({deck['count_change']:+d})</span></td>
                    <td>{deck_lookup.get(deck['deck_name'], dict()).get('win_rate_numeric', 0):.1f}% <span class="{'positive' if deck['winrate_change'] > 0 else 'negative' if deck['winrate_change'] < 0 else 'neutral'}">({deck['winrate_change']:+.2f}%)</span></td>
                </tr>
                """ for deck in comparison_data[:50])}
            </table>
        </div>
    </div>
</body>
</html>"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

def print_comparison_summary(comparison_data: List[Dict[str, Any]]):
    """Print a summary of the comparison to console."""
    new_decks = [d for d in comparison_data if d['status'] == 'NEU']
    disappeared = [d for d in comparison_data if d['status'] == 'VERSCHWUNDEN']
    climbers = [d for d in comparison_data if d['rank_change'] > 0]
    fallers = [d for d in comparison_data if d['rank_change'] < 0]
    
    climbers.sort(key=lambda x: x['rank_change'], reverse=True)
    fallers.sort(key=lambda x: x['rank_change'])
    
    print("\n" + "=" * 60)
    print("Comparison Summary")
    print("=" * 60)
    
    print(f"\n📊 Overview:")
    print(f"  • Total Decks: {len(comparison_data)}")
    print(f"  • New Decks: {len(new_decks)}")
    print(f"  • Disappeared: {len(disappeared)}")
    print(f"  • Rank Climbers: {len(climbers)}")
    print(f"  • Rank Fallers: {len(fallers)}")
    
    if climbers:
        print(f"\n📈 Top 5 Rank Climbers:")
        for i, deck in enumerate(climbers[:5], 1):
            print(f"  {i}. {deck['deck_name']}: #{deck['old_rank']} → #{deck['new_rank']} (▲{deck['rank_change']})")
    
    if fallers:
        print(f"\n📉 Top 5 Rank Fallers:")
        for i, deck in enumerate(fallers[:5], 1):
            print(f"  {i}. {deck['deck_name']}: #{deck['old_rank']} → #{deck['new_rank']} (▼{abs(deck['rank_change'])})")
    
    if new_decks:
        print(f"\n🆕 New Decks (Top 10):")
        for i, deck in enumerate(new_decks[:10], 1):
            print(f"  {i}. {deck['deck_name']}: #{deck['new_rank']} ({deck['new_count']} entries, {deck['new_winrate']}% WR)")

def main():
    """Main execution function."""
    logger.info("=" * 60)
    logger.info("Limitless Online Deck Scraper - Fast Edition")
    logger.info("=" * 60)

    settings = _load_settings()
    logger.info(
        f"Game: {settings['game']} | Format: {settings['format']} | "
        f"Output: {settings['output_file']}"
    )

    stats_path  = get_data_dir()
    output_file = os.path.join(stats_path, settings["output_file"])

    old_stats = load_previous_stats(output_file)

    logger.info("Fetching deck statistics...")
    deck_data = scrape_deck_statistics(
        settings["game"],
        settings["format"],
        settings.get("rotation"),
        settings.get("set"),
    )

    if not deck_data:
        logger.error("No data found. Please check your settings and try again.")
        return

    logger.info("Scraping complete! Total decks found: %s", len(deck_data))
    save_to_csv(deck_data, settings["output_file"])

    new_stats   = load_previous_stats(output_file)
    deck_lookup = {deck["deck_name"]: deck for deck in deck_data}

    matchup_data = analyze_matchups_for_top_decks(deck_data, settings)

    logger.info("Creating HTML report...")
    try:
        html_file = settings["output_file"].replace(".csv", ".html")
        create_deck_list_html(deck_data, html_file, deck_lookup)
        logger.info("HTML report created: %s", html_file)
    except Exception as e:
        logger.warning("Could not create HTML report: %s", e)
        import traceback
        traceback.print_exc()

    logger.info("Creating comparison report...")
    create_comparison_report(
        old_stats, new_stats, settings["output_file"], settings, matchup_data, deck_lookup
    )

    logger.info("Top 20 Decks:")
    for i, deck in enumerate(deck_data[:20], 1):
        logger.info(
            f"  {i}. {deck['deck_name']}: {deck['count']} entries "
            f"({deck['share']}, {deck['win_rate']} WR)"
        )

    logger.info("Scraping finished!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Scraping interrupted by user.")
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
