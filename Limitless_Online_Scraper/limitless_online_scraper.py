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
from typing import List, Dict, Optional, Tuple

# Default settings
DEFAULT_SETTINGS = {
    "game": "POKEMON",
    "format": "STANDARD",
    "rotation": "2025",
    "set": "PFL",
    "top_decks_for_matchup": 10,
    "delay_between_requests": 1.5,
    "output_file": "limitless_online_decks.csv"
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def load_settings() -> Dict:
    """Load settings from limitless_online_settings.json, or create it with defaults if it doesn't exist."""
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'limitless_online_settings.json')
    
    # If running from dist folder, also check parent folder
    if not os.path.exists(settings_path) and os.path.basename(app_path) == 'dist':
        parent_path = os.path.dirname(app_path)
        parent_settings_path = os.path.join(parent_path, 'limitless_online_settings.json')
        if os.path.exists(parent_settings_path):
            settings_path = parent_settings_path
    
    print(f"Loading settings from: {settings_path}")
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    print("Settings file is empty. Using default settings.")
                    return DEFAULT_SETTINGS.copy()
                settings = json.loads(content)
                print(f"Settings loaded successfully: {settings}")
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                return settings
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading limitless_online_settings.json: {e}")
            print("Using default settings.")
            return DEFAULT_SETTINGS.copy()
    else:
        print(f"Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        print(f"Created default limitless_online_settings.json at {settings_path}")
        return DEFAULT_SETTINGS.copy()

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
        self.decks = []
        self.current_deck = {}
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.cell_index = 0
        self.capture_data = False
        self.current_data = ""
        self.row_number = 0
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == 'table':
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
            if deck_slug and 'deck_url' not in self.current_deck:
                self.current_deck['deck_url'] = deck_slug
    
    def handle_endtag(self, tag):
        if tag == 'table':
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
                self.current_deck['deck_name'] = data
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
    
    def handle_data(self, data):
        if self.capture_data and self.in_cell:
            self.current_data += data

def scrape_deck_statistics(game: str, format_type: str, rotation: str = None, set_code: str = None) -> List[Dict]:
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
        self.matchups = []
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.cell_index = 0
        self.current_data = ""
        self.current_matchup = {}
        self.capture_data = False
    
    def handle_starttag(self, tag, attrs):
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
    
    def handle_endtag(self, tag):
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
    
    def handle_data(self, data):
        if self.capture_data and self.in_cell:
            self.current_data += data

def scrape_matchup_data(deck_url: str, format_type: str, rotation: str, set_code: str, delay: float = 1.5) -> List[Dict]:
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

def analyze_matchups_for_top_decks(deck_data: List[Dict], settings: Dict) -> Dict[str, Dict]:
    """Analyze matchups for top decks against other top decks."""
    top_n = settings.get('top_decks_for_matchup', 10)
    top_decks = deck_data[:top_n]
    top_deck_names = [deck['deck_name'] for deck in top_decks]
    
    # Also get Top 20 for matchup ratio calculation
    top_20_names = [deck['deck_name'] for deck in deck_data[:20]]
    
    print(f"\n{'=' * 60}")
    print(f"Analyzing matchups for Top {top_n} decks...")
    print(f"{'=' * 60}")
    
    matchup_analysis = {}
    
    for i, deck in enumerate(top_decks, 1):
        deck_name = deck['deck_name']
        deck_url = deck.get('deck_url')
        
        # Fallback to generated URL if not available
        if not deck_url:
            deck_url = deck_name_to_url(deck_name)
            
        print(f"\n[{i}/{top_n}] Analyzing {deck_name}")
        
        # Scrape matchup data
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
        
        # Filter for matchups with minimum games and against top decks
        # First, filter by minimum games and exclude "Other" decks
        filtered_matchups = [m for m in matchups if m['total_games'] >= 3 and m['opponent_deck'].lower() != 'other']
        
        # Prefer matchups against top decks, but show all if none found
        top_deck_matchups = []
        for matchup in filtered_matchups:
            opponent = matchup['opponent_deck']
            # Exact case-insensitive match
            if opponent.lower() in [td.lower() for td in top_deck_names]:
                top_deck_matchups.append(matchup)
        
        # Use top deck matchups if available, otherwise use all filtered matchups
        relevant_matchups = top_deck_matchups if top_deck_matchups else filtered_matchups
        
        print(f"    Found {len(top_deck_matchups)} matchups vs Top {top_n}, {len(filtered_matchups)} total matchups")
        
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
        
        # Calculate Top 20 matchup ratio (positive:negative)
        top20_matchups = [m for m in filtered_matchups if m['opponent_deck'] in top_20_names]
        top20_positive = len([m for m in top20_matchups if m['win_rate_numeric'] > 50])
        top20_negative = len([m for m in top20_matchups if m['win_rate_numeric'] < 50])
        
        matchup_analysis[deck_name] = {
            'best_matchups': best_5,
            'worst_matchups': worst_5,
            'top20_positive': top20_positive,
            'top20_negative': top20_negative
        }
        
        best_summary = ', '.join([f"{m['opponent_deck']} ({m['win_rate_numeric']:.1f}%)" for m in best_5]) if best_5 else "None >50%"
        worst_summary = ', '.join([f"{m['opponent_deck']} ({m['win_rate_numeric']:.1f}%)" for m in worst_5]) if worst_5 else "None <50%"
        print(f"    ✅ Best: {best_summary}")
        print(f"    ❌ Worst: {worst_summary}")
    
    return matchup_analysis

def save_to_csv(data: List[Dict], output_file: str):
    """Save scraped data to CSV file."""
    if not data:
        print("No data to save.")
        return
    
    app_path = get_app_path()
    output_path = os.path.join(app_path, output_file)
    
    # Also check parent folder if in dist
    if os.path.basename(app_path) == 'dist':
        output_path = os.path.join(os.path.dirname(app_path), output_file)
    
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

def load_previous_stats(stats_file: str) -> Dict[str, Dict]:
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
        print(f"Warning: Could not load previous statistics: {e}")
        return {}
    
    return previous_data

def create_comparison_report(old_stats: Dict, new_stats: Dict, output_file: str, settings: Dict, matchup_data: Dict = None, deck_lookup: Dict = None):
    """Create a detailed comparison report between old and new statistics."""
    app_path = get_app_path()
    
    # Determine output paths
    if os.path.basename(app_path) == 'dist':
        base_path = os.path.dirname(app_path)
    else:
        base_path = app_path
    
    comparison_csv = os.path.join(base_path, output_file.replace('.csv', '_comparison.csv'))
    comparison_html = os.path.join(base_path, output_file.replace('.csv', '_comparison.html'))
    
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
        matchup_csv = os.path.join(base_path, output_file.replace('.csv', '_matchups.csv'))
        try:
            with open(matchup_csv, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['deck_name', 'matchup_type', 'opponent', 'win_rate', 'record', 'total_games']
                writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                writer.writeheader()
                
                for deck_name, matchups in matchup_data.items():
                    # Best matchups
                    for matchup in matchups.get('best_matchups', []):
                        writer.writerow({
                            'deck_name': deck_name,
                            'matchup_type': 'BEST',
                            'opponent': matchup['opponent_deck'],
                            'win_rate': str(round(matchup['win_rate_numeric'], 2)).replace('.', ','),
                            'record': matchup['record'],
                            'total_games': matchup['total_games']
                        })
                    
                    # Worst matchups
                    for matchup in matchups.get('worst_matchups', []):
                        writer.writerow({
                            'deck_name': deck_name,
                            'matchup_type': 'WORST',
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
    
    # Create HTML report
    try:
        create_html_report(comparison_data, comparison_html, old_stats, new_stats, settings, matchup_data, deck_lookup)
        print(f"HTML comparison report saved to: {comparison_html}")
    except Exception as e:
        print(f"Error creating HTML report: {e}")
    
    # Print summary to console
    print_comparison_summary(comparison_data)

def create_html_report(comparison_data: List[Dict], output_file: str, 
                       old_stats: Dict, new_stats: Dict, settings: Dict, matchup_data: Dict = None, deck_lookup: Dict = None):
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
    
    # Biggest rank climbers and fallers
    rank_climbers = [d for d in comparison_data if d['rank_change'] > 0]
    rank_climbers.sort(key=lambda x: x['rank_change'], reverse=True)
    
    rank_fallers = [d for d in comparison_data if d['rank_change'] < 0]
    rank_fallers.sort(key=lambda x: x['rank_change'])
    
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
    </style>
</head>
<body>
    <div class="container">
        <h1>🎮 Limitless Online Deck Comparison</h1>
        <div class="subtitle">Format: {settings.get('format', 'STANDARD')} | Game: {settings.get('game', 'POKEMON')}</div>
        
        <div class="meta-info">
            <span>📅 Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</span>
            <span>📊 Total Decks Tracked: {len(comparison_data)}</span>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>🆕 New Decks</h3>
                <div class="value">{len(new_decks)}</div>
                <p>Newly appeared in meta</p>
            </div>
            <div class="stat-card">
                <h3>❌ Disappeared</h3>
                <div class="value">{len(disappeared_decks)}</div>
                <p style="font-size: 0.85em;">{''.join([f'{d["deck_name"]} ({d["old_winrate"]}%)<br>' for d in disappeared_decks[:5]]) if disappeared_decks else 'No longer in rankings'}</p>
            </div>
            <div class="stat-card">
                <h3>📈 Top 10 Changes</h3>
                <div class="value">{len(entered_top10) + len(left_top10)}</div>
                <p style="font-size: 0.85em;">{''.join([f'✅ {d} ({deck_lookup.get(d, {}).get("win_rate_numeric", 0):.1f}%)<br>' for d in list(entered_top10)[:3]]) + ''.join([f'❌ {d} ({deck_lookup.get(d, {}).get("win_rate_numeric", 0):.1f}%)<br>' for d in list(left_top10)[:3]]) if (entered_top10 or left_top10) else 'No changes'}</p>
            </div>
        </div>

        <div class="section">
            <h2>🏆 Top 10 Movements</h2>
            {f'''
            <h3 style="color: #27ae60;">✅ Entered Top 10</h3>
            <table>
                <tr>
                    <th>Rank</th>
                    <th>Deck</th>
                    <th>Count</th>
                    <th>Win Rate</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>#{[d for d in comparison_data if d['deck_name'] == deck][0]['new_rank']}</strong></td>
                    <td>{deck}</td>
                    <td>{[d for d in comparison_data if d['deck_name'] == deck][0]['new_count']}</td>
                    <td>{deck_lookup.get(deck, {}).get('win_rate_numeric', 0):.1f}%</td>
                </tr>
                """ for deck in entered_top10)}
            </table>
            ''' if entered_top10 else '<p>No new entries in Top 10</p>'}
            
            {f'''
            <h3 style="color: #e74c3c; margin-top: 30px;">❌ Left Top 10</h3>
            <table>
                <tr>
                    <th>Was Rank</th>
                    <th>Deck</th>
                    <th>Count</th>
                    <th>Win Rate</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td>#{[d for d in comparison_data if d['deck_name'] == deck][0]['old_rank']}</td>
                    <td>{deck}</td>
                    <td>{[d for d in comparison_data if d['deck_name'] == deck][0]['new_count']}</td>
                    <td>{deck_lookup.get(deck, {}).get('win_rate_numeric', 0):.1f}%</td>
                </tr>
                """ for deck in left_top10)}
            </table>
            ''' if left_top10 else ''}
        </div>

        <div class="section">
            <h2>📈 Biggest Rank Climbers</h2>
            <table>
                <tr>
                    <th>Deck</th>
                    <th>Old Rank</th>
                    <th>New Rank</th>
                    <th>Change</th>
                    <th>Win Rate</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['deck_name']}</strong></td>
                    <td>#{deck['old_rank']}</td>
                    <td>#{deck['new_rank']}</td>
                    <td><span class="rank-change rank-up">▲ {deck['rank_change']}</span></td>
                    <td>{deck_lookup.get(deck['deck_name'], {}).get('win_rate_numeric', 0):.1f}% <span class="{'positive' if deck['winrate_change'] > 0 else 'negative' if deck['winrate_change'] < 0 else 'neutral'}">({deck['winrate_change']:+.2f}%)</span></td>
                </tr>
                """ for deck in rank_climbers[:10])}
            </table>
        </div>

        <div class="section">
            <h2>📉 Biggest Rank Fallers</h2>
            <table>
                <tr>
                    <th>Deck</th>
                    <th>Old Rank</th>
                    <th>New Rank</th>
                    <th>Change</th>
                    <th>Win Rate</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['deck_name']}</strong></td>
                    <td>#{deck['old_rank']}</td>
                    <td>#{deck['new_rank']}</td>
                    <td><span class="rank-change rank-down">▼ {abs(deck['rank_change'])}</span></td>
                    <td>{deck_lookup.get(deck['deck_name'], {}).get('win_rate_numeric', 0):.1f}% <span class="{'positive' if deck['winrate_change'] > 0 else 'negative' if deck['winrate_change'] < 0 else 'neutral'}">({deck['winrate_change']:+.2f}%)</span></td>
                </tr>
                """ for deck in rank_fallers[:10])}
            </table>
        </div>

        {f'''
        <div class="section">
            <h2>🎯 Matchup Analysis - Top {settings.get('top_decks_for_matchup', 10)} Decks</h2>
            <p style="color: #7f8c8d; margin-bottom: 20px;">Best and Worst matchups against other top decks (minimum 5 games)</p>
            
            {''.join(f"""
            <div style="margin-bottom: 40px; background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="color: #2c3e50; margin-top: 0;">{deck_name} <span style="font-size: 0.8em; color: #7f8c8d;">(Total WR: {deck_lookup.get(deck_name, {}).get('win_rate_numeric', 0):.1f}%, Matchup vs Top20: {matchups.get('top20_positive', 0)}:{matchups.get('top20_negative', 0)})</span></h3>
                
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
            </div>
            """ for deck_name, matchups in (matchup_data.items() if matchup_data else []) if deck_name.lower() != 'other')}
        </div>
        ''' if matchup_data else ''}

        <div class="section">
            <h2>📋 Full Comparison Table</h2>
            <table>
                <tr>
                    <th>Deck</th>
                    <th>Status</th>
                    <th>Old Rank</th>
                    <th>New Rank</th>
                    <th>Rank Δ</th>
                    <th>Count</th>
                    <th>Win Rate</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['deck_name']}</strong></td>
                    <td><span class="badge badge-{deck['status'].lower() if deck['status'] != 'VERSCHWUNDEN' else 'disappeared'}">{deck['status']}</span></td>
                    <td>{deck['old_rank'] if deck['old_rank'] != '-' else '-'}</td>
                    <td>{deck['new_rank'] if deck['new_rank'] != '-' else '-'}</td>
                    <td>
                        {f'<span class="rank-change rank-up">▲ {deck["rank_change"]}</span>' if deck['rank_change'] > 0 
                         else f'<span class="rank-change rank-down">▼ {abs(deck["rank_change"])}</span>' if deck['rank_change'] < 0 
                         else '-'}
                    </td>
                    <td>{deck['new_count']} <span class="{'positive' if deck['count_change'] > 0 else 'negative' if deck['count_change'] < 0 else 'neutral'}">({deck['count_change']:+d})</span></td>
                    <td>{deck_lookup.get(deck['deck_name'], {}).get('win_rate_numeric', 0):.1f}% <span class="{'positive' if deck['winrate_change'] > 0 else 'negative' if deck['winrate_change'] < 0 else 'neutral'}">({deck['winrate_change']:+.2f}%)</span></td>
                </tr>
                """ for deck in comparison_data[:50])}
            </table>
        </div>
    </div>
</body>
</html>"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

def print_comparison_summary(comparison_data: List[Dict]):
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
    app_path = get_app_path()
    if os.path.basename(app_path) == 'dist':
        stats_path = os.path.dirname(app_path)
    else:
        stats_path = app_path
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
    
    # Create comparison report if we have old stats
    if old_stats:
        print("\n" + "=" * 60)
        print("Creating comparison report...")
        print("=" * 60)
        create_comparison_report(old_stats, new_stats, settings['output_file'], settings, matchup_data, deck_lookup)
    else:
        # Still save matchup data even without comparison
        if matchup_data:
            app_path = get_app_path()
            if os.path.basename(app_path) == 'dist':
                base_path = os.path.dirname(app_path)
            else:
                base_path = app_path
            
            matchup_csv = os.path.join(base_path, settings['output_file'].replace('.csv', '_matchups.csv'))
            try:
                with open(matchup_csv, 'w', newline='', encoding='utf-8-sig') as f:
                    fieldnames = ['deck_name', 'matchup_type', 'opponent', 'win_rate', 'record', 'total_games']
                    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                    writer.writeheader()
                    
                    for deck_name, matchups in matchup_data.items():
                        for matchup in matchups.get('best_matchups', []):
                            writer.writerow({
                                'deck_name': deck_name,
                                'matchup_type': 'BEST',
                                'opponent': matchup['opponent_deck'],
                                'win_rate': str(round(matchup['win_rate_numeric'], 2)).replace('.', ','),
                                'record': matchup['record'],
                                'total_games': matchup['total_games']
                            })
                        
                        for matchup in matchups.get('worst_matchups', []):
                            writer.writerow({
                                'deck_name': deck_name,
                                'matchup_type': 'WORST',
                                'opponent': matchup['opponent_deck'],
                                'win_rate': str(round(matchup['win_rate_numeric'], 2)).replace('.', ','),
                                'record': matchup['record'],
                                'total_games': matchup['total_games']
                            })
                
                print(f"\nMatchup data saved to: {matchup_csv}")
            except Exception as e:
                print(f"Error saving matchup CSV: {e}")
    
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
