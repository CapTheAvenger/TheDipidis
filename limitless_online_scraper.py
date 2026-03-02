
#!/usr/bin/env python3
"""
Limitless Online Deck Scraper
Scrapes deck statistics from play.limitlesstcg.com/decks
No external dependencies required - uses only Python standard library
"""

import urllib.request
import urllib.parse
import csv
import re
import time
import json
import os
import sys
from datetime import datetime
from html.parser import HTMLParser
from typing import List, Dict, Optional, Tuple, Any

# Import shared utilities
from card_scraper_shared import setup_console_encoding, get_app_path, get_data_dir

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# Default settings
DEFAULT_SETTINGS: Dict[str, Any] = {
    "game": "POKEMON",
    "format": "STANDARD",
    "rotation": "2025",
    "set": "PFL",
    "top_decks_for_matchup": 10,
    "delay_between_requests": 1.5,
    "output_file": "limitless_online_decks.csv"
}

def clean_deck_name(deck_name: str) -> str:
    """Clean deck name by removing extra whitespace and HTML artifacts."""
    # Remove extra whitespace
    deck_name = ' '.join(deck_name.split())
    # Remove any HTML-related artifacts
    deck_name = deck_name.replace('\n', '').replace('\r', '').strip()
    return deck_name

def load_settings() -> Dict[str, Any]:
    """Load settings from limitless_online_settings.json."""
    settings = DEFAULT_SETTINGS.copy()
    app_path = get_app_path()
    
    # Search for settings file in multiple locations
    candidates = [
        os.path.join(app_path, "limitless_online_settings.json"),
        os.path.join(os.getcwd(), "limitless_online_settings.json"),
        os.path.join(app_path, "..", "limitless_online_settings.json"),  # Parent dir (if running from dist/)
        os.path.join(app_path, "data", "limitless_online_settings.json")
    ]
    
    settings_path = None
    for path in candidates:
        normalized_path = os.path.normpath(path)
        if os.path.isfile(normalized_path):
            settings_path = normalized_path
            break
    
    if settings_path:
        try:
            with open(settings_path, "r", encoding="utf-8-sig") as f:
                content = f.read()
                loaded = json.loads(content)
            if isinstance(loaded, dict):
                settings.update(loaded)
            print(f"[Limitless Online] Loaded settings: {settings_path}")
        except Exception as e:
            print(f"[Limitless Online] WARNING: Failed to load settings: {e}")
            print(f"[Limitless Online] Using default settings.")
    else:
        print(f"[Limitless Online] No settings file found. Using defaults.")
    
    return settings

def fetch_page(url: str) -> str:
    """Fetch a webpage and return its HTML content."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

class DeckStatsParser(HTMLParser):
    """Parser to extract deck statistics from the decks page."""
    def __init__(self):
        super().__init__()
        self.decks: List[Dict[str, Any]] = []
        self.current_deck: Dict[str, Any] = {}
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.cell_index = 0
        self.capture_data = False
        self.current_data = ""
        self.row_number = 0
        self.meta_stats = {}  # Store meta statistics (tournaments, players, matches)
        self.in_p_tag = False
        self.p_content = ""
        
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        attrs_dict = dict(attrs)
        
        if tag == 'p':
            self.in_p_tag = True
            self.p_content = ""
        elif tag == 'table':
            self.in_table = True
        elif tag == 'tr' and self.in_table:
            self.in_row = True
            self.cell_index = 0
            self.current_deck = {}
            self.row_number += 1
        elif tag == 'td' and self.in_row:
            self.in_cell = True
            self.capture_data = True
            self.current_data = ""
        elif tag == 'a' and self.in_cell and attrs_dict.get('href', '').startswith('/decks/'):
            # Extract deck URL slug from href
            href = attrs_dict.get('href', '')
            # Remove /decks/ prefix and any query parameters
            deck_slug = href.replace('/decks/', '').split('?')[0].rstrip('/')
            # Patch: Add -ex suffix for main Pokémon decks if needed
            # Only add -ex if deck_name matches certain Pokémon and deck_slug does not already end with -ex
            main_pokemon = [
                'gardevoir', 'ceruledge', 'mega-venusaur', 'greninja'
            ]
            if 'deck_name' in self.current_deck:
                dn = self.current_deck['deck_name'].lower().replace(' ', '-').replace('é', 'e')
                for poke in main_pokemon:
                    if dn.startswith(poke) and not deck_slug.endswith('-ex'):
                        deck_slug = deck_slug + '-ex'
                        break
            if deck_slug and 'deck_url' not in self.current_deck:
                self.current_deck['deck_url'] = deck_slug
    
    def handle_endtag(self, tag: str) -> None:
        if tag == 'p' and self.in_p_tag:
            self.in_p_tag = False
            # Check if this p tag contains meta statistics
            import re
            match = re.search(r'(\d+)\s+tournaments,\s+(\d+)\s+players,\s+(\d+)\s+matches', self.p_content)
            if match:
                self.meta_stats = {
                    'tournaments': int(match.group(1)),
                    'players': int(match.group(2)),
                    'matches': int(match.group(3))
                }
        elif tag == 'table':
            self.in_table = False
        elif tag == 'tr' and self.in_row:
            self.in_row = False
            # Save deck if it has data
            if 'deck_name' in self.current_deck and self.current_deck['deck_name']:
                self.decks.append(self.current_deck.copy())
        elif tag == 'td' and self.in_cell:
            self.in_cell = False
            self.capture_data = False
            
            # Store the data based on cell index
            data = self.current_data.strip()
            if self.cell_index == 0:  # Rank
                self.current_deck['rank'] = data
            elif self.cell_index == 2:  # Deck name (skip icon column)
                self.current_deck['deck_name'] = clean_deck_name(data)
            elif self.cell_index == 3:  # Count
                self.current_deck['count'] = data
            elif self.cell_index == 4:  # Share
                self.current_deck['share'] = data
            elif self.cell_index == 5:  # Score (Wins-Losses-Ties)
                self.current_deck['score'] = data
            elif self.cell_index == 6:  # Win %
                self.current_deck['win_rate'] = data
            
            self.cell_index += 1
            self.current_data = ""
    
    def handle_data(self, data: str) -> None:
        if self.in_p_tag:
            self.p_content += data
        if self.capture_data and self.in_cell:
            self.current_data += data

class LimitlessOnlineDeckParser(HTMLParser):
    """Parser for Limitless Online individual deck pages.
    
    Extracts cards using href="/cards/SET_CODE/NUMBER" card links.
    This ensures:
    - Pokemon cards: Identified by SET_CODE/NUMBER (unique)
    - Trainer cards: Also has SET_CODE/NUMBER but can still reference name-only for latest rarity
    
    HTML Pattern: <a class="card-link" href="/cards/JTG/97">
                      <span class="card-count">4</span>
                      <span class="card-name">N's Zorua</span>
                  </a>
    """
    def __init__(self):
        super().__init__()
        self.cards: List[Dict[str, Any]] = []
        self.in_card_link = False
        self.current_count = None
        self.current_set_code = None
        self.current_number = None
        self.current_card_name = None
        
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        attrs_dict = dict(attrs)
        
        if tag == 'a' and 'card-link' in attrs_dict.get('class', ''):
            # Extract set code and number from href="/cards/SET_CODE/NUMBER"
            href = attrs_dict.get('href', '')
            match = re.match(r'/cards/([A-Z0-9\-]+)/(\d+)', href)
            if match:
                self.in_card_link = True
                self.current_set_code = match.group(1)
                self.current_number = match.group(2)
        
        elif self.in_card_link:
            if tag == 'span' and 'card-count' in attrs_dict.get('class', ''):
                self.parsing_count = True
            elif tag == 'span' and 'card-name' in attrs_dict.get('class', ''):
                self.parsing_name = True
    
    def handle_data(self, data: str) -> None:
        if self.in_card_link:
            data = data.strip()
            if data and hasattr(self, 'parsing_count') and self.parsing_count:
                try:
                    self.current_count = int(data)
                    self.parsing_count = False
                except ValueError:
                    pass
            elif data and hasattr(self, 'parsing_name') and self.parsing_name:
                self.current_card_name = data
                self.parsing_name = False
    
    def handle_endtag(self, tag: str) -> None:
        if tag == 'a' and self.in_card_link:
            # We have all card info: count, set_code, number, name
            if self.current_count and self.current_card_name:
                card_info = {
                    'name': self.current_card_name,
                    'count': self.current_count,
                    'set_code': self.current_set_code or '',
                    'number': self.current_number or ''
                }
                self.cards.append(card_info)
            
            # Reset for next card
            self.in_card_link = False
            self.current_count = None
            self.current_set_code = None
            self.current_number = None
            self.current_card_name = None
            self.parsing_count = False
            self.parsing_name = False

def scrape_deck_statistics(game: str, format_type: str, rotation: Optional[str] = None, set_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Scrape deck statistics from play.limitlesstcg.com/decks."""
    # Construct URL with parameters
    params = {
        'game': game,
        'format': format_type
    }
    
    # Add optional rotation and set parameters
    if rotation:
        params['rotation'] = rotation
    if set_code:
        params['set'] = set_code
    
    url = f"https://play.limitlesstcg.com/decks?{urllib.parse.urlencode(params)}"
    
    print(f"Fetching deck statistics from: {url}")
    
    html_content = fetch_page(url)
    if not html_content:
        return []
    
    parser = DeckStatsParser()
    parser.feed(html_content)
    
    # Save meta statistics to JSON file
    if parser.meta_stats:
        meta_stats_file = os.path.join('data', 'limitless_meta_stats.json')
        with open(meta_stats_file, 'w', encoding='utf-8') as f:
            json.dump(parser.meta_stats, f, indent=2)
        print(f"  Meta statistics saved: {parser.meta_stats}")
    
    # Parse score into wins, losses, ties
    for deck in parser.decks:
        score = deck.get('score', '')
        match = re.match(r'(\d+)\s*-\s*(\d+)\s*-\s*(\d+)', score)
        if match:
            deck['wins'] = int(match.group(1))
            deck['losses'] = int(match.group(2))
            deck['ties'] = int(match.group(3))
        else:
            deck['wins'] = 0
            deck['losses'] = 0
            deck['ties'] = 0
        
        # Clean up win rate (remove %)
        win_rate = deck.get('win_rate', '0%').replace('%', '').strip()
        try:
            deck['win_rate_numeric'] = float(win_rate)
        except ValueError:
            deck['win_rate_numeric'] = 0.0
        
        # Clean up share (remove %)
        share = deck.get('share', '0%').replace('%', '').strip()
        try:
            deck['share_numeric'] = float(share)
        except ValueError:
            deck['share_numeric'] = 0.0
        
        # Add timestamp
        deck['scraped_date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        deck['format'] = format_type
        deck['game'] = game
    
    print(f"  Found {len(parser.decks)} deck entries")
    
    # Filter out "Other" from deck list
    parser.decks = [deck for deck in parser.decks if deck.get('deck_name', '').lower() != 'other']
    print(f"  After filtering 'Other': {len(parser.decks)} deck entries")
    
    # Add URLs to each deck
    for deck in parser.decks:
        deck_name = deck.get('deck_name', '')
        if deck_name:
            deck['url'] = deck_name_to_url(deck_name)
    
    return parser.decks

def deck_name_to_url(deck_name: str) -> str:
    """Convert deck name to URL format (lowercase, spaces to hyphens)."""
    # Remove possessive 's first (e.g., "N's Zoroark" -> "N Zoroark" -> "n-zoroark")
    deck_name = deck_name.replace("'s", "").replace("'", "")
    return deck_name.lower().replace(' ', '-')

class MatchupParser(HTMLParser):
    """Parser to extract matchup data from matchup pages."""
    def __init__(self):
        super().__init__()
        self.matchups: List[Dict[str, Any]] = []
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.cell_index = 0
        self.current_data = ""
        self.current_matchup: Dict[str, Any] = {}
        self.capture_data = False
    
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        attrs_dict = dict(attrs)
        
        if tag == 'table':
            self.in_table = True
        elif tag == 'tr' and self.in_table:
            self.in_row = True
            self.cell_index = 0
            self.current_matchup = {}
        elif tag == 'td' and self.in_row:
            self.in_cell = True
            self.capture_data = True
            self.current_data = ""
    
    def handle_endtag(self, tag: str) -> None:
        if tag == 'table':
            self.in_table = False
        elif tag == 'tr' and self.in_row:
            self.in_row = False
            if 'opponent_deck' in self.current_matchup:
                self.matchups.append(self.current_matchup.copy())
        elif tag == 'td' and self.in_cell:
            self.in_cell = False
            self.capture_data = False
            
            data = self.current_data.strip()
            if self.cell_index == 0:  # Opponent deck name
                self.current_matchup['opponent_deck'] = data
            elif self.cell_index == 1:  # Record (W-L-T)
                self.current_matchup['record'] = data
            elif self.cell_index == 2:  # Win rate
                self.current_matchup['win_rate'] = data
            
            self.cell_index += 1
            self.current_data = ""
    
    def handle_data(self, data: str) -> None:
        if self.capture_data and self.in_cell:
            self.current_data += data

def scrape_matchup_data(deck_url: str, format_type: str, rotation: str, set_code: str, delay: float = 1.5) -> List[Dict[str, Any]]:
    """Scrape matchup data for a specific deck using its URL slug."""
    params = {
        'format': format_type.lower(),
        'rotation': rotation,
        'set': set_code
    }
    url = f"https://play.limitlesstcg.com/decks/{deck_url}/matchups/?{urllib.parse.urlencode(params)}"
    
    print(f"    Fetching matchups from: {url}")
    time.sleep(delay)
    
    html_content = fetch_page(url)
    if not html_content:
        # Try without set parameter as fallback
        print(f"    ⚠ No data for this set, trying without set parameter...")
        params_no_set = {
            'format': format_type.lower(),
            'rotation': rotation
        }
        url_fallback = f"https://play.limitlesstcg.com/decks/{deck_url}/matchups/?{urllib.parse.urlencode(params_no_set)}"
        print(f"    Fetching fallback from: {url_fallback}")
        time.sleep(delay)
        html_content = fetch_page(url_fallback)
        
        if not html_content:
            print(f"    ⚠ No HTML content received")
            return []
    
    # Use regex to find matchup data in table rows
    matchups = []
    
    # Pattern to match table rows with: Deck Name | Matches | Score (W-L-T) | Win %
    # The table has columns: Icon | Deck | Matches | Score | Win %
    row_pattern = r'<tr[^>]*>(.*?)</tr>'
    rows = re.findall(row_pattern, html_content, re.DOTALL)
    
    for row in rows:
        # Extract all cells
        cell_pattern = r'<td[^>]*>(.*?)</td>'
        cells = re.findall(cell_pattern, row, re.DOTALL)
        
        # We expect: [icon/empty], [Deck Name], [Matches], [Score], [Win %]
        if len(cells) >= 4:
            # Clean up HTML tags from cells
            def clean_html(text):
                # Remove all HTML tags and extra whitespace
                clean = re.sub(r'<[^>]+>', '', text)
                clean = re.sub(r'\s+', ' ', clean)
                return clean.strip()
            
            # Column indices may vary, so we try to identify by pattern
            # Look for cells with deck name, score pattern (W-L-T), and percentage
            deck_cell = None
            score_cell = None
            matches_cell = None
            winrate_cell = None
            
            for i, cell in enumerate(cells):
                clean_cell = clean_html(cell)
                
                # Check for score pattern (W-L-T)
                if re.match(r'\d+\s*-\s*\d+\s*-\s*\d+', clean_cell):
                    score_cell = clean_cell
                    # Table structure: [icon], Deck Name, Matches, Score, Win%
                    # Score is at position i, so:
                    # Deck name is at i-2 (2 positions before)
                    # Matches is at i-1 (1 position before)
                    # Win rate is at i+1 (1 position after)
                    if i >= 2:
                        deck_cell = clean_html(cells[i-2])
                    if i >= 1:
                        matches_cell = clean_html(cells[i-1])
                    if i + 1 < len(cells):
                        winrate_cell = clean_html(cells[i+1])
                    break
            
            # If we found valid data
            if deck_cell and score_cell and deck_cell and not deck_cell.lower() in ['deck', 'opponent', '']:
                # Parse record (W-L-T format)
                record_match = re.match(r'(\d+)\s*-\s*(\d+)\s*-\s*(\d+)', score_cell)
                if record_match:
                    wins = int(record_match.group(1))
                    losses = int(record_match.group(2))
                    ties = int(record_match.group(3))
                    total = wins + losses + ties
                    
                    if total > 0:
                        win_rate_numeric = (wins / (wins + losses)) * 100 if (wins + losses) > 0 else 0
                        
                        matchups.append({
                            'opponent_deck': deck_cell,
                            'archetype': deck_cell,  # Use opponent deck name as archetype for unified scraper
                            'record': score_cell,
                            'win_rate': winrate_cell if winrate_cell else f"{win_rate_numeric:.2f}%",
                            'win_rate_numeric': win_rate_numeric,
                            'total_games': total,
                            'wins': wins,
                            'losses': losses,
                            'ties': ties
                        })
    
    print(f"    Found {len(matchups)} matchups")
    return matchups

def analyze_matchups_for_top_decks(deck_data: List[Dict[str, Any]], settings: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Analyze matchups for top decks against other top 20 decks."""
    top_n = settings.get('top_decks_for_matchup', 10)
    top_decks = deck_data[:top_n]
    top_deck_names = [deck['deck_name'] for deck in top_decks]
    
    # Use Top 20 for matchup ratio calculation
    top_ratio_n = min(20, len(deck_data))
    top_ratio_names = [deck['deck_name'] for deck in deck_data[:top_ratio_n]]
    
    print(f"\n{'=' * 60}")
    print(f"Analyzing matchups for Top {top_n} decks...")
    print(f"{'=' * 60}")
    
    matchup_analysis = {}
    
    for i, deck in enumerate(top_decks, 1):
        deck_name = deck['deck_name']
        deck_url = deck.get('deck_url')
        if not deck_url:
            print(f"    ⚠ Kein deck_url für {deck_name}, überspringe.")
            matchup_analysis[deck_name] = {
                'best_matchups': [],
                'worst_matchups': []
            }
            continue
        print(f"\n[{i}/{top_n}] Analyzing {deck_name} (Slug: {deck_url})")
        # Scrape matchup data immer mit deck_url aus Deckliste
        matchups = scrape_matchup_data(
            deck_url,
            settings['format'],
            settings['rotation'],
            settings['set'],
            settings['delay_between_requests']
        )
        if not matchups:
            print(f"    ⚠ No matchup data found for {deck_name}")
            matchup_analysis[deck_name] = {
                'best_matchups': [],
                'worst_matchups': []
            }
            continue
        
        # Filter for matchups with minimum games and against TOP 20 decks only
        # First, filter by minimum games and exclude "Other" decks
        filtered_matchups = [m for m in matchups if m['total_games'] >= 3 and m['opponent_deck'].lower() != 'other']
        
        # Only analyze matchups vs Top 20 decks (for meaningful meta analysis)
        relevant_matchups = []
        for matchup in filtered_matchups:
            opponent = matchup['opponent_deck']
            # Case-insensitive match against Top 20
            if opponent.lower() in [td.lower() for td in top_ratio_names]:
                relevant_matchups.append(matchup)
        
        print(f"    Found {len(relevant_matchups)} matchups vs Top 20 decks")
        
        if not relevant_matchups:
            print(f"    ⚠ No matchups with minimum 3 games")
            matchup_analysis[deck_name] = {
                'best_matchups': [],
                'worst_matchups': []
            }
            continue
        
        # Sort by win rate
        relevant_matchups.sort(key=lambda x: x['win_rate_numeric'], reverse=True)
        
        # Get best 5 (only >50% WR) and worst 5 (only <50% WR)
        best_5 = [m for m in relevant_matchups if m['win_rate_numeric'] > 50][:5]
        worst_5 = [m for m in relevant_matchups if m['win_rate_numeric'] < 50][-5:][::-1]  # Reverse to show worst first
        
        # Calculate matchup ratio vs Top 20 (positive:negative)
        positive_vs_top20 = len([m for m in relevant_matchups if m['win_rate_numeric'] > 50])
        negative_vs_top20 = len([m for m in relevant_matchups if m['win_rate_numeric'] < 50])
        
        # Store all opponent matchups for interactive selector
        all_opponent_matchups = {}
        for matchup in filtered_matchups:
            opponent = matchup['opponent_deck']
            if opponent not in all_opponent_matchups:
                all_opponent_matchups[opponent] = matchup
        
        matchup_analysis[deck_name] = {
            'best_matchups': best_5,
            'worst_matchups': worst_5,
            'top20_matchups': relevant_matchups,  # All matchups vs Top 20 decks for CSV export
            'positive_vs_top20': positive_vs_top20,
            'negative_vs_top20': negative_vs_top20,
            'all_opponent_matchups': all_opponent_matchups  # For interactive selector
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
        print(f"[DEBUG] Creating HTML report: {comparison_html}")
        print(f"[DEBUG] comparison_data length: {len(comparison_data)}")
        print(f"[DEBUG] old_stats length: {len(old_stats)}")
        print(f"[DEBUG] new_stats length: {len(new_stats)}")
        print(f"[DEBUG] matchup_data: {type(matchup_data)}, {'has data' if matchup_data else 'is None/empty'}")
        print(f"[DEBUG] deck_lookup: {type(deck_lookup)}, {'has data' if deck_lookup else 'is None/empty'}")
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
                <div class="value" style="font-size: 1.8em; margin: 10px 0;">SVI-PFL</div>
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
                <h3 style="color: #2c3e50; margin-top: 0;">{deck_name} <span style="font-size: 0.8em; color: #7f8c8d;">(Rank #{deck_lookup.get(deck_name, dict()).get('rank', '?')} | Total WR: {deck_lookup.get(deck_name, dict()).get('win_rate_numeric', 0):.1f}%, Vs Top20: {matchups.get('positive_vs_top20', 0)}:{matchups.get('negative_vs_top20', 0)})</span></h3>
                
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
                    <label for="opponent_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="display: block; margin-bottom: 8px; font-weight: bold;">Search Opponent:</label>
                    <div style="position: relative;">
                        <input type="text" id="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" placeholder="Type to search deck..." style="width: 100%; padding: 10px; border: 2px solid #bbb; border-radius: 4px; font-size: 1em;" oninput="filterOpponents(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}')">
                        <div id="opponent_dropdown_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #bbb; border-top: none; border-radius: 0 0 4px 4px; max-height: 250px; overflow-y: auto; display: none; z-index: 1000;">
                            {''.join(f"<div class=\"opponent-option\" data-value=\"{opponent}\" onclick=\"selectOpponent(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}', '{opponent.replace(chr(39), chr(92)+chr(39))}')\" style=\"padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;\">{opponent}</div>" for opponent in sorted(matchups.get('all_opponent_matchups', dict()).keys()))}
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
                <h3 style="color: #2c3e50; margin-top: 0;">{deck_name} <span style="font-size: 0.8em; color: #7f8c8d;">(Rank #{deck_lookup.get(deck_name, dict()).get('rank', '?')} | Total WR: {deck_lookup.get(deck_name, dict()).get('win_rate_numeric', 0):.1f}%, Vs Top20: {matchups.get('positive_vs_top20', 0)}:{matchups.get('negative_vs_top20', 0)})</span></h3>
                
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
                    <label for="opponent_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="display: block; margin-bottom: 8px; font-weight: bold;">Search Opponent:</label>
                    <div style="position: relative;">
                        <input type="text" id="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" placeholder="Type to search deck..." style="width: 100%; padding: 10px; border: 2px solid #bbb; border-radius: 4px; font-size: 1em;" oninput="filterOpponents(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}')">
                        <div id="opponent_dropdown_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #bbb; border-top: none; border-radius: 0 0 4px 4px; max-height: 250px; overflow-y: auto; display: none; z-index: 1000;">
                            {''.join(f"<div class=\"opponent-option\" data-value=\"{opponent}\" onclick=\"selectOpponent(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}', '{opponent.replace(chr(39), chr(92)+chr(39))}')\" style=\"padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;\">{opponent}</div>" for opponent in sorted(matchups.get('all_opponent_matchups', dict()).keys()))}
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
                <h3 style="color: #2c3e50; margin-top: 0;">{deck_name} <span style="font-size: 0.8em; color: #7f8c8d;">(Rank #{deck_lookup.get(deck_name, dict()).get('rank', '?')} | Total WR: {deck_lookup.get(deck_name, dict()).get('win_rate_numeric', 0):.1f}%, Vs Top20: {matchups.get('positive_vs_top20', 0)}:{matchups.get('negative_vs_top20', 0)})</span></h3>
                
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
                    <label for="opponent_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="display: block; margin-bottom: 8px; font-weight: bold;">Search Opponent:</label>
                    <div style="position: relative;">
                        <input type="text" id="opponent_search_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" placeholder="Type to search deck..." style="width: 100%; padding: 10px; border: 2px solid #bbb; border-radius: 4px; font-size: 1em;" oninput="filterOpponents(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}')">
                        <div id="opponent_dropdown_{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 2px solid #bbb; border-top: none; border-radius: 0 0 4px 4px; max-height: 250px; overflow-y: auto; display: none; z-index: 1000;">
                            {''.join(f"<div class=\"opponent-option\" data-value=\"{opponent}\" onclick=\"selectOpponent(this, '{deck_name.replace(' ', '_').replace(chr(39), '').replace('-', '_')}', '{opponent.replace(chr(39), chr(92)+chr(39))}')\" style=\"padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;\">{opponent}</div>" for opponent in sorted(matchups.get('all_opponent_matchups', dict()).keys()))}
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
    print("=" * 60)
    print("Limitless Online Deck Scraper")
    print("=" * 60)
    
    # Load settings
    settings = load_settings()
    
    print(f"\nSettings:")
    print(f"  Game: {settings['game']}")
    print(f"  Format: {settings['format']}")
    print(f"  Output File: {settings['output_file']}")
    
    # Get paths for stats files
    stats_path = get_data_dir()
    output_file = os.path.join(stats_path, settings['output_file'])
    
    # Load previous statistics before scraping new ones
    old_stats = load_previous_stats(output_file)
    
    # Scrape current deck statistics
    print("\n" + "=" * 60)
    print("Fetching deck statistics...")
    print("=" * 60)
    
    deck_data = scrape_deck_statistics(
        settings['game'], 
        settings['format'],
        settings.get('rotation'),
        settings.get('set')
    )
    
    if not deck_data:
        print("\nNo data found. Please check your settings and try again.")
        return
    
    # Save results
    print("\n" + "=" * 60)
    print(f"Scraping complete! Total decks found: {len(deck_data)}")
    
    save_to_csv(deck_data, settings['output_file'])
    
    # Load the newly saved statistics
    new_stats = load_previous_stats(output_file)
    
    # Create a deck lookup dictionary from fresh data for HTML
    deck_lookup = {deck['deck_name']: deck for deck in deck_data}
    
    # Analyze matchups for top decks
    matchup_data = analyze_matchups_for_top_decks(deck_data, settings)
    
    # Always create HTML report
    print("\n" + "=" * 60)
    print("Creating HTML report...")
    print("=" * 60)
    try:
        html_file = settings['output_file'].replace('.csv', '.html')
        create_deck_list_html(deck_data, html_file, deck_lookup)
        print(f"✓ HTML report created: {html_file}")
    except Exception as e:
        print(f"⚠️  Could not create HTML report: {e}")
        import traceback
        traceback.print_exc()
    
    # Create comparison report (always, even without old stats)
    print("\n" + "=" * 60)
    print("Creating comparison report...")
    print("=" * 60)
    create_comparison_report(old_stats, new_stats, settings['output_file'], settings, matchup_data, deck_lookup)
    
    # Print top decks
    print("\n" + "=" * 60)
    print("Top 20 Decks:")
    print("=" * 60)
    
    for i, deck in enumerate(deck_data[:20], 1):
        print(f"{i}. {deck['deck_name']}: {deck['count']} entries ({deck['share']}, {deck['win_rate']} WR)")
    
    print("\n" + "=" * 60)
    print("Scraping finished!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nScraping interrupted by user.")
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
        input("Press Enter to close...")
