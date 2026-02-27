#!/usr/bin/env python3
"""
City League Archetype Scraper
Scrapes archetype data from limitlesstcg.com Japanese City League tournaments
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

# Fix Windows console encoding for Unicode characters (✓, ×, •, etc.)
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    if hasattr(sys.stderr, 'reconfigure'):
        try:
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass

# Default settings
DEFAULT_SETTINGS: Dict[str, Any] = {
    "start_date": "24.01.2026",
    "end_date": "auto",  # 'auto' = today - 2 days, or use 'DD.MM.YYYY'
    "delay_between_requests": 1.5,
    "output_file": "city_league_archetypes.csv",
    "region": "jp",
    "additional_tournament_ids": []  # List of tournament IDs to scrape from main site
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def get_data_dir() -> str:
    """Get the shared data directory for CSV outputs."""
    app_path = get_app_path()
    
    # Always use workspace root/data directory
    parts = app_path.replace('\\', '/').split('/')
    
    # Find workspace root (before 'dist' or use current if not in dist)
    if 'dist' in parts:
        dist_index = parts.index('dist')
        workspace_root = '/'.join(parts[:dist_index])  # Everything before 'dist'
    else:
        # Running from workspace root or as script
        workspace_root = app_path
    
    # Ensure data directory exists
    data_dir = os.path.join(workspace_root, 'data')
    os.makedirs(data_dir, exist_ok=True)
    
    return data_dir

def calculate_date_range(start_date: str, end_date: str) -> Tuple[str, str]:
    """Calculate date range for scraping.
    
    Args:
        start_date: Fixed date in 'DD.MM.YYYY' format
        end_date: 'auto' for today-2, or 'DD.MM.YYYY'
    
    Returns:
        Tuple of (start_date, end_date) in 'DD.MM.YYYY' format
    """
    from datetime import timedelta
    
    # Start date is always provided as fixed date
    start_str = start_date
    
    # Calculate end_date if 'auto'
    if end_date == 'auto':
        # Today - 2 days
        end_dt = datetime.now() - timedelta(days=2)
        end_str = end_dt.strftime('%d.%m.%Y')
    else:
        # Use provided date
        end_str = end_date
    
    return start_str, end_str

def load_settings() -> Dict[str, Any]:
    """Load settings from city_league_archetype_settings.json."""
    settings = DEFAULT_SETTINGS.copy()
    app_path = get_app_path()
    
    # Search for settings file in multiple locations
    candidates = [
        os.path.join(app_path, "city_league_archetype_settings.json"),
        os.path.join(os.getcwd(), "city_league_archetype_settings.json"),
        os.path.join(app_path, "..", "city_league_archetype_settings.json"),  # Parent dir (if running from dist/)
        os.path.join(app_path, "data", "city_league_archetype_settings.json")
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
            print(f"[City League Archetype] Loaded settings: {settings_path}")
        except Exception as e:
            print(f"[City League Archetype] WARNING: Failed to load settings: {e}")
            print(f"[City League Archetype] Using default settings.")
    else:
        print(f"[City League Archetype] No settings file found. Using defaults.")
    
    return settings

def parse_date(date_str: str) -> datetime:
    """Parse date from DD.MM.YYYY format."""
    try:
        return datetime.strptime(date_str, "%d.%m.%Y")
    except ValueError:
        print(f"Error parsing date: {date_str}. Using format DD.MM.YYYY")
        raise

def fetch_page(url: str) -> str:
    """Fetch a webpage and return its HTML content."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error fetching {url}: {type(e).__name__}: {str(e)[:50]}")
        return ""

class TournamentListParser(HTMLParser):
    """Parser to extract tournament information from the list page."""
    def __init__(self):
        super().__init__()
        self.tournaments: List[Dict[str, str]] = []
        self.in_table = False
        self.current_row: Dict[str, str] = {}
        self.current_cell = None
        self.cell_data = ""
        
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        attrs_dict = dict(attrs)
        
        if tag == 'table':
            self.in_table = True
        elif tag == 'tr' and self.in_table:
            self.current_row = {}
        elif tag == 'td' and self.in_table:
            # Start collecting cell data
            self.cell_data = ""
        elif tag == 'a' and self.in_table:
            # Check if it's a tournament link
            if 'href' in attrs_dict:
                href = attrs_dict['href']
                if '/tournaments/' in href and href.count('/') >= 3:
                    # Extract tournament ID from URL
                    match = re.search(r'/tournaments/[^/]+/(\d+)', href)
                    if match:
                        self.current_row['tournament_id'] = match.group(1)
                        self.current_row['url'] = 'https://limitlesstcg.com' + href if href.startswith('/') else href
    
    def handle_data(self, data: str) -> None:
        if self.in_table:
            self.cell_data += data.strip()
    
    def handle_endtag(self, tag: str) -> None:
        if tag == 'table':
            self.in_table = False
        elif tag == 'td' and self.in_table:
            # Process the collected cell data
            data = self.cell_data.strip()
            if data:
                # Try to parse as date
                date_match = re.match(r'(\d{1,2})\s+([A-Za-z]+)\s+(\d{2})', data)
                if date_match:
                    self.current_row['date_str'] = data
                # Store other data as potential prefecture/shop
                elif 'date_str' not in self.current_row:
                    pass
                elif 'prefecture' not in self.current_row:
                    self.current_row['prefecture'] = data
                elif 'shop' not in self.current_row:
                    self.current_row['shop'] = data
                elif 'winner' not in self.current_row:
                    self.current_row['winner'] = data
        elif tag == 'tr' and self.in_table:
            # Row complete, add if it has required data
            if 'tournament_id' in self.current_row and 'date_str' in self.current_row:
                self.tournaments.append(self.current_row.copy())

def parse_tournament_date(date_str: str) -> Optional[datetime]:
    """Parse date from format like '24 Jan 26' to datetime."""
    try:
        # Parse "24 Jan 26" format
        date_obj = datetime.strptime(date_str, "%d %b %y")
        return date_obj
    except ValueError:
        try:
            # Try full date format "21st February 2026"
            # Remove ordinal suffix (st, nd, rd, th)
            clean_date = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)
            date_obj = datetime.strptime(clean_date, "%d %B %Y")
            return date_obj
        except ValueError:
            print(f"Could not parse date: {date_str}")
            return None

def clean_pokemon_name(name: str) -> str:
    """Remove card variant suffixes from pokemon names (EX, V, VMAX, VSTAR, GX, ex, etc)."""
    # List of card variants to remove from the end of names
    variants = [' VSTAR', ' V-UNION', ' VMAX', ' V', ' EX', ' GX', ' ex']
    
    name = name.strip()
    for variant in variants:
        if name.upper().endswith(variant.upper()):
            # Remove the variant (case-insensitive)
            name = name[:-len(variant)].strip()
            break
    
    return name

def fix_mega_pokemon_name(name: str) -> str:
    """Convert 'pokemon-mega' format to 'mega pokemon' format."""
    if '-mega' in name.lower():
        # Remove '-mega' suffix and add 'mega' prefix
        name = re.sub(r'-mega$', '', name, flags=re.IGNORECASE)
        return f"mega {name}"
    return name

def extract_tournament_data_regex(html: str) -> List[Dict[str, str]]:
    """Extract deck archetypes from tournament page using regex."""
    archetypes = []
    
    # Find all table rows
    row_pattern = r'<tr>(.*?)</tr>'
    rows = re.findall(row_pattern, html, re.DOTALL)
    
    for row in rows:
        # Extract cells
        cells = re.findall(r'<td>(.*?)</td>', row, re.DOTALL)
        
        if len(cells) >= 3:
            # Cell 0: placement number
            # Cell 1: player name
            # Cell 2: deck with images
            placement = re.sub(r'<[^>]+>', '', cells[0]).strip()
            player_match = re.search(r'>([^<]+)</a>', cells[1])
            player = player_match.group(1) if player_match else re.sub(r'<[^>]+>', '', cells[1]).strip()
            
            # Extract pokemon names from alt attributes
            pokemon_names = re.findall(r'alt="([^"]+)"', cells[2])
            # Clean pokemon names (remove EX, V, VMAX, etc. variants)
            pokemon_names = [clean_pokemon_name(name) for name in pokemon_names]
            # Fix mega pokemon names (convert "pokemon-mega" to "mega pokemon")
            pokemon_names = [fix_mega_pokemon_name(name) for name in pokemon_names]
            archetype = ' '.join(pokemon_names) if pokemon_names else ''
            
            # Only add if we have valid data
            if placement.isdigit() and archetype:
                archetypes.append({
                    'placement': placement,
                    'player': player,
                    'archetype': archetype
                })
    
    return archetypes

class TournamentDateParser(HTMLParser):
    """Parser to extract tournament date and player count from tournament detail page."""
    def __init__(self):
        super().__init__()
        self.in_infobox = False
        self.in_header = False
        self.date_str = ""
        self.player_count = ""
        self.current_data = ""
        self.all_infobox_lines = []
        
    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        attrs_dict = dict(attrs)
        
        # Check for tournament header (often contains date)
        if tag == 'div' and 'class' in attrs_dict:
            if 'tournament-header' in attrs_dict.get('class', ''):
                self.in_header = True
                self.current_data = ""
            elif 'infobox-line' in attrs_dict.get('class', ''):
                self.in_infobox = True
                self.current_data = ""
        elif tag == 'span' and self.in_infobox:
            # Check for player count span with apc class
            if 'class' in attrs_dict and 'apc' in attrs_dict.get('class', ''):
                self.current_data = ""
    
    def handle_data(self, data: str) -> None:
        if self.in_infobox or self.in_header:
            self.current_data += data.strip() + " "
    
    def handle_endtag(self, tag: str) -> None:
        if tag == 'div':
            if self.in_infobox:
                # Store all infobox lines for analysis
                text = self.current_data.strip()
                if text:
                    self.all_infobox_lines.append(text)
                
                # Try to parse date and player info
                # Format 1: "21st February 2026 • 7000* Players"
                if '•' in text and 'player' in text.lower():
                    parts = text.split('•')
                    if len(parts) >= 2:
                        # Extract date (before the •)
                        date_part = parts[0].strip()
                        if date_part and not self.date_str:
                            self.date_str = date_part
                        
                        # Extract player count
                        player_part = parts[1].strip()
                        player_match = re.search(r'(\d+)', player_part)
                        if player_match and not self.player_count:
                            self.player_count = player_match.group(1)
                # Format 2: Just date line (fallback)
                elif not self.date_str:
                    # Try to find a date pattern: "DD Month YYYY" or "DD Month YY"
                    date_patterns = [
                        r'\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}',
                        r'\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}'
                    ]
                    for pattern in date_patterns:
                        match = re.search(pattern, text, re.IGNORECASE)
                        if match:
                            self.date_str = match.group(0)
                            break
                
                self.in_infobox = False
                self.current_data = ""
            elif self.in_header:
                self.in_header = False
                self.current_data = ""

def get_tournament_by_id(tournament_id: str, delay: float = 1.5) -> Optional[Dict[str, str]]:
    """
    Fetch tournament info from a specific tournament ID from the main site.
    Extracts date and player count from the tournament detail page.
    
    Args:
        tournament_id: The tournament ID (e.g., "547")
        delay: Delay between requests
        
    Returns:
        Dictionary with tournament info or None if failed
    """
    url = f"https://limitlesstcg.com/tournaments/{tournament_id}"
    print(f"\nFetching tournament from: {url}")
    
    html = fetch_page(url)
    if not html:
        print(f"  Failed to fetch tournament page for ID {tournament_id}")
        return None
    
    # Parse date and player count from infobox
    parser = TournamentDateParser()
    parser.feed(html)
    
    # Debug: Show what was found
    if parser.all_infobox_lines:
        print(f"  Found {len(parser.all_infobox_lines)} infobox lines")
    
    # If parser didn't find date, try regex fallback
    if not parser.date_str:
        print(f"  Parser failed, trying regex fallback...")
        # Try to find date in HTML with regex
        date_patterns = [
            r'(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
            r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4})'
        ]
        for pattern in date_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                parser.date_str = match.group(1)
                print(f"  Found date via regex: {parser.date_str}")
                break
    
    if not parser.date_str:
        print(f"  Warning: Could not extract date from tournament {tournament_id}")
        print(f"  First 500 chars of HTML: {html[:500]}")
        return None
    
    # Parse the date
    tournament_date = parse_tournament_date(parser.date_str)
    if not tournament_date:
        print(f"  Warning: Could not parse date '{parser.date_str}' from tournament {tournament_id}")
        return None
    
    # Format date as "24 Jan 26"
    date_str = tournament_date.strftime("%d %b %y")
    
    # Extract tournament name/location from page title or heading
    title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    tournament_name = title_match.group(1).strip() if title_match else f"Tournament {tournament_id}"
    
    tournament_info = {
        'tournament_id': tournament_id,
        'url': url,
        'date_str': date_str,
        'prefecture': 'Special Event',  # Mark as special event
        'shop': tournament_name,
        'player_count': parser.player_count if parser.player_count else 'Unknown'
    }
    
    print(f"  ✓ Found: {date_str} - {tournament_name} ({parser.player_count} players)")
    
    return tournament_info

def get_tournaments_in_date_range(region: str, start_date: datetime, end_date: datetime, delay: float = 1.5) -> List[Dict[str, str]]:
    """
    Fetch all tournaments from limitlesstcg.com for the given region and date range.
    """
    # Construct URL - show more results to capture all tournaments
    url = f"https://limitlesstcg.com/tournaments/{region}?show=500"
    
    print(f"Fetching tournament list from: {url}")
    html = fetch_page(url)
    
    if not html:
        print("Failed to fetch tournament list.")
        return []
    
    # Parse the HTML to extract tournament links and dates
    parser = TournamentListParser()
    parser.feed(html)
    
    tournaments_in_range = []
    
    print(f"\nFound {len(parser.tournaments)} tournaments total.")
    print(f"Filtering for dates between {start_date.strftime('%d.%m.%Y')} and {end_date.strftime('%d.%m.%Y')}")
    
    for tournament in parser.tournaments:
        tournament_date = parse_tournament_date(tournament['date_str'])
        
        if tournament_date and start_date <= tournament_date <= end_date:
            tournaments_in_range.append(tournament)
            try:
                print(f"  [OK] {tournament['date_str']} - {tournament.get('prefecture', 'N/A')} - {tournament.get('shop', 'N/A')} (ID: {tournament['tournament_id']})", flush=True)
            except UnicodeEncodeError:
                # Handle encoding issues with Japanese characters
                try:
                    print(f"  [OK] {tournament['date_str']} (ID: {tournament['tournament_id']})", flush=True)
                except:
                    print(f"  [OK] Tournament {tournament['tournament_id']}", flush=True)
    
    print(f"\nFound {len(tournaments_in_range)} tournaments in the specified date range.")
    return tournaments_in_range

def scrape_tournament_archetypes(tournament_url: str, tournament_info: Dict[str, str], delay: float = 1.5) -> List[Dict[str, str]]:
    """
    Scrape all deck archetypes from a single tournament.
    """
    print(f"\nScraping tournament: {tournament_url}")
    time.sleep(delay)
    
    html = fetch_page(tournament_url)
    if not html:
        print(f"  Failed to fetch tournament page.")
        return []
    
    # Use regex-based extraction
    archetypes = extract_tournament_data_regex(html)
    
    # Add tournament info to each archetype
    results = []
    for entry in archetypes:
        results.append({
            'date': tournament_info.get('date_str', ''),
            'tournament_id': tournament_info.get('tournament_id', ''),
            'prefecture': tournament_info.get('prefecture', ''),
            'shop': tournament_info.get('shop', ''),
            'format': 'City League (JP)',
            'placement': entry['placement'],
            'player': entry['player'],
            'archetype': entry['archetype']
        })
    
    print(f"  Found {len(results)} deck entries")
    return results

def save_to_csv(data: List[Dict[str, str]], output_file: str):
    """Save the scraped data to a CSV file (data already contains old + new combined)."""
    if not data:
        print("No data to save.")
        return
    
    output_path = os.path.join(get_data_dir(), output_file)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"Saving {len(data)} total entries to CSV")
    
    try:
        with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            fieldnames = ['date', 'tournament_id', 'prefecture', 'shop', 'format', 'placement', 'player', 'archetype']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=';')
            
            writer.writeheader()
            writer.writerows(data)
        
        print(f"✅ Successfully saved data to {output_file}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")

def save_deck_statistics(data: List[Dict[str, str]], output_file: str):
    """Calculate and save deck archetype statistics."""
    stats_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_deck_stats.csv'))
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(stats_file), exist_ok=True)
    
    # Collect all deck data
    deck_data = {}  # {archetype: {'count': int, 'placements': [int, ...], 'tournaments': [str, ...]}}
    
    for entry in data:
        archetype = entry.get('archetype', 'Unknown')
        placement = int(entry.get('placement', 0))
        tournament_info = f"{entry.get('date', '')} - {entry.get('prefecture', '')} - {entry.get('shop', '')} (ID: {entry.get('tournament_id', '')})"
        
        if archetype not in deck_data:
            deck_data[archetype] = {
                'count': 0,
                'placements': [],
                'tournaments': []
            }
        
        deck_data[archetype]['count'] += 1
        deck_data[archetype]['placements'].append(placement)
        deck_data[archetype]['tournaments'].append(tournament_info)
    
    # Calculate statistics
    stats_rows = []
    for archetype, deck_info in deck_data.items():
        avg_placement = sum(deck_info['placements']) / len(deck_info['placements']) if deck_info['placements'] else 0
        best_placement = min(deck_info['placements']) if deck_info['placements'] else 0
        worst_placement = max(deck_info['placements']) if deck_info['placements'] else 0
        
        # Format average_placement with comma as decimal separator for German Excel
        avg_placement_str = str(round(avg_placement, 2)).replace('.', ',')
        
        stats_rows.append({
            'archetype': archetype,
            'format': 'City League (JP)',
            'total_appearances': deck_info['count'],
            'average_placement': avg_placement_str,
            'best_placement': best_placement,
            'worst_placement': worst_placement,
            'tournaments': '; '.join(set(deck_info['tournaments']))  # Unique tournament names
        })
    
    # Sort by total appearances (most common first)
    stats_rows.sort(key=lambda x: x['total_appearances'], reverse=True)
    
    # Save to CSV
    try:
        with open(stats_file, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['archetype', 'format', 'total_appearances', 'average_placement', 'best_placement', 'worst_placement', 'tournaments']
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            writer.writerows(stats_rows)
        
        print(f"\nDeck statistics saved to: {stats_file}")
        print(f"\nTop 10 Most Common Decks:")
        print("-" * 70)
        for i, row in enumerate(stats_rows[:10], 1):
            print(f"{i}. {row['archetype']}: {row['total_appearances']} appearances, avg placement: {row['average_placement']}")
    except Exception as e:
        print(f"Error saving deck statistics: {e}")

def create_comparison_report(old_data: List[Dict[str, str]], new_data: List[Dict[str, str]], output_file: str):
    """Create HTML and CSV comparison reports between old and new data."""
    # Write comparison files to data/ folder
    data_dir = get_data_dir()
    comparison_csv = os.path.join(data_dir, output_file.replace('.csv', '_comparison.csv'))
    comparison_html = os.path.join(data_dir, output_file.replace('.csv', '_comparison.html'))
    comparison_html_local = os.path.join(data_dir, output_file.replace('.csv', '_comparison_local.html'))
    
    # Build archetype stats from old and new data
    def build_stats(data):
        stats = {}
        for entry in data:
            archetype = entry.get('archetype', 'Unknown')
            placement = int(entry.get('placement', 0))
            
            if archetype not in stats:
                stats[archetype] = {
                    'count': 0,
                    'placements': [],
                    'total_placement': 0
                }
            
            stats[archetype]['count'] += 1
            stats[archetype]['placements'].append(placement)
            stats[archetype]['total_placement'] += placement
        
        # Calculate averages
        for archetype, data in stats.items():
            data['avg_placement'] = data['total_placement'] / data['count'] if data['count'] > 0 else 0
            data['best_placement'] = min(data['placements']) if data['placements'] else 0
        
        return stats
    
    old_stats = build_stats(old_data)
    new_stats = build_stats(new_data)
    
    # Prepare comparison data
    comparison_data = []
    all_archetypes = set(old_stats.keys()) | set(new_stats.keys())
    
    for archetype in all_archetypes:
        old = old_stats.get(archetype, {'count': 0, 'avg_placement': 0, 'best_placement': 0})
        new = new_stats.get(archetype, {'count': 0, 'avg_placement': 0, 'best_placement': 0})
        
        count_change = new['count'] - old['count']
        avg_change = new['avg_placement'] - old['avg_placement']
        
        # Determine status
        if old['count'] == 0:
            status = 'NEU'
        elif new['count'] == 0:
            status = 'VERSCHWUNDEN'
        else:
            status = 'BESTEHEND'
        
        # Determine trend (better avg placement = lower number)
        if abs(avg_change) < 0.5:
            trend = 'STABIL'
        elif avg_change < 0:
            trend = 'VERBESSERT'  # Lower placement = better
        else:
            trend = 'VERSCHLECHTERT'
        
        comparison_data.append({
            'archetype': archetype,
            'status': status,
            'trend': trend,
            'old_count': old['count'],
            'new_count': new['count'],
            'count_change': count_change,
            'old_avg_placement': round(old['avg_placement'], 2),
            'new_avg_placement': round(new['avg_placement'], 2),
            'avg_placement_change': round(avg_change, 2),
            'old_best': old['best_placement'],
            'new_best': new['best_placement']
        })
    
    # Sort by new count (most popular first)
    comparison_data.sort(key=lambda x: x['new_count'], reverse=True)
    
    # Save CSV
    try:
        with open(comparison_csv, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['archetype', 'status', 'trend', 'old_count', 'new_count', 'count_change',
                         'old_avg_placement', 'new_avg_placement', 'avg_placement_change',
                         'old_best', 'new_best']
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            
            for row in comparison_data:
                row_formatted = row.copy()
                # Format for German Excel (comma as decimal separator)
                for key in ['old_avg_placement', 'new_avg_placement', 'avg_placement_change']:
                    row_formatted[key] = str(row[key]).replace('.', ',')
                writer.writerow(row_formatted)
        
        print(f"\nComparison CSV saved to: {comparison_csv}")
    except Exception as e:
        print(f"Error saving comparison CSV: {e}")
    
    # Create HTML report (data/ folder)
    try:
        create_html_comparison(comparison_data, comparison_html)
        print(f"HTML comparison report saved to: {comparison_html}")
    except Exception as e:
        print(f"Error creating HTML report (data/): {e}")
    
    # Create HTML report (local - neben EXE)
    try:
        create_html_comparison(comparison_data, comparison_html_local)
        print(f"HTML comparison report saved to: {comparison_html_local}")
    except Exception as e:
        print(f"Error creating HTML report (local): {e}")

def create_html_comparison(comparison_data: List[Dict[str, Any]], output_file: str):
    """Create a visually appealing HTML comparison report."""
    
    new_decks = [d for d in comparison_data if d['status'] == 'NEU']
    disappeared_decks = [d for d in comparison_data if d['status'] == 'VERSCHWUNDEN']
    
    # Biggest count increases/decreases
    count_increasers = [d for d in comparison_data if d['count_change'] > 0]
    count_increasers.sort(key=lambda x: x['count_change'], reverse=True)
    
    count_decreasers = [d for d in comparison_data if d['count_change'] < 0]
    count_decreasers.sort(key=lambda x: x['count_change'])
    
    # Performance improvers/decliners (lower placement = better)
    improvers = [d for d in comparison_data if d['avg_placement_change'] < -0.5]
    improvers.sort(key=lambda x: x['avg_placement_change'])
    
    decliners = [d for d in comparison_data if d['avg_placement_change'] > 0.5]
    decliners.sort(key=lambda x: x['avg_placement_change'], reverse=True)
    
    html_content = f"""<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>City League Archetype Comparison Report</title>
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
        .stat-card .details {{
            font-size: 0.85em;
            opacity: 0.9;
            margin-top: 10px;
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
        .badge-bestehend {{ background-color: #3498db; color: white; }}
        .badge-verbessert {{ background-color: #27ae60; color: white; }}
        .badge-verschlechtert {{ background-color: #e67e22; color: white; }}
        .badge-stabil {{ background-color: #95a5a6; color: white; }}
        .positive {{ color: #27ae60; font-weight: bold; }}
        .negative {{ color: #e74c3c; font-weight: bold; }}
        .neutral {{ color: #95a5a6; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🏆 City League Archetype Comparison</h1>
        <div class="subtitle">Japanese City League Tournament Data</div>
        
        <div class="meta-info">
            <span>📅 Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</span>
            <span>📊 Total Archetypes Tracked: {len(comparison_data)}</span>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <h3>🆕 New Archetypes</h3>
                <div class="value">{len(new_decks)}</div>
                <div class="details">
                    {'<br>'.join([f"{d['archetype']} ({d['new_count']}x)" for d in new_decks[:5]]) if new_decks else 'No new archetypes'}
                </div>
            </div>
            <div class="stat-card">
                <h3>❌ Disappeared</h3>
                <div class="value">{len(disappeared_decks)}</div>
                <div class="details">
                    {'<br>'.join([f"{d['archetype']} (was {d['old_count']}x)" for d in disappeared_decks[:5]]) if disappeared_decks else 'No disappeared archetypes'}
                </div>
            </div>
            <div class="stat-card">
                <h3>📈 Most Active</h3>
                <div class="value">{comparison_data[0]['new_count'] if comparison_data else 0}</div>
                <div class="details">
                    {comparison_data[0]['archetype'] if comparison_data else 'No data'}
                    <br>Avg Placement: {comparison_data[0]['new_avg_placement'] if comparison_data else 0}
                </div>
            </div>
        </div>

        <div class="section">
            <h2>📈 Popularity Increases</h2>
            <table>
                <tr>
                    <th>Archetype</th>
                    <th>Old Count</th>
                    <th>New Count</th>
                    <th>Change</th>
                    <th>Avg Placement</th>
                    <th>Avg Δ</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['archetype']}</strong></td>
                    <td>{deck['old_count']}</td>
                    <td>{deck['new_count']}</td>
                    <td><span class="positive">+{deck['count_change']}</span></td>
                    <td>{deck['new_avg_placement']:.2f}</td>
                    <td><span class="{'positive' if deck['avg_placement_change'] < 0 else 'negative' if deck['avg_placement_change'] > 0 else 'neutral'}">({deck['avg_placement_change']:+.2f})</span></td>
                </tr>
                """ for deck in count_increasers[:10])}
            </table>
        </div>

        <div class="section">
            <h2>📉 Popularity Decreases</h2>
            <table>
                <tr>
                    <th>Archetype</th>
                    <th>Old Count</th>
                    <th>New Count</th>
                    <th>Change</th>
                    <th>Avg Placement</th>
                    <th>Avg Δ</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['archetype']}</strong></td>
                    <td>{deck['old_count']}</td>
                    <td>{deck['new_count']}</td>
                    <td><span class="negative">{deck['count_change']}</span></td>
                    <td>{deck['new_avg_placement']:.2f}</td>
                    <td><span class="{'positive' if deck['avg_placement_change'] < 0 else 'negative' if deck['avg_placement_change'] > 0 else 'neutral'}">({deck['avg_placement_change']:+.2f})</span></td>
                </tr>
                """ for deck in count_decreasers[:10])}
            </table>
        </div>

        <div class="section">
            <h2>⭐ Performance Improvers (Better Avg Placement)</h2>
            <table>
                <tr>
                    <th>Archetype</th>
                    <th>Count</th>
                    <th>Old Avg</th>
                    <th>New Avg</th>
                    <th>Improvement</th>
                    <th>Best Placement</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['archetype']}</strong></td>
                    <td>{deck['new_count']}</td>
                    <td>{deck['old_avg_placement']:.2f}</td>
                    <td>{deck['new_avg_placement']:.2f}</td>
                    <td><span class="positive">{deck['avg_placement_change']:.2f}</span></td>
                    <td>{deck['new_best']}</td>
                </tr>
                """ for deck in improvers[:10] if deck['new_count'] >= 3)}
            </table>
        </div>

        <div class="section">
            <h2>📉 Performance Decliners (Worse Avg Placement)</h2>
            <table>
                <tr>
                    <th>Archetype</th>
                    <th>Count</th>
                    <th>Old Avg</th>
                    <th>New Avg</th>
                    <th>Decline</th>
                    <th>Best Placement</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['archetype']}</strong></td>
                    <td>{deck['new_count']}</td>
                    <td>{deck['old_avg_placement']:.2f}</td>
                    <td>{deck['new_avg_placement']:.2f}</td>
                    <td><span class="negative">+{deck['avg_placement_change']:.2f}</span></td>
                    <td>{deck['new_best']}</td>
                </tr>
                """ for deck in decliners[:10] if deck['new_count'] >= 3)}
            </table>
        </div>

        <div class="section">
            <h2>📋 Full Comparison Table (Top 30)</h2>
            <table>
                <tr>
                    <th>Archetype</th>
                    <th>Status</th>
                    <th>Trend</th>
                    <th>Count</th>
                    <th>Count Δ</th>
                    <th>Avg Placement</th>
                    <th>Avg Δ</th>
                    <th>Best</th>
                </tr>
                {''.join(f"""
                <tr>
                    <td><strong>{deck['archetype']}</strong></td>
                    <td><span class="badge badge-{deck['status'].lower()}">{deck['status']}</span></td>
                    <td><span class="badge badge-{deck['trend'].lower()}">{deck['trend']}</span></td>
                    <td>{deck['new_count']}</td>
                    <td><span class="{'positive' if deck['count_change'] > 0 else 'negative' if deck['count_change'] < 0 else 'neutral'}">({deck['count_change']:+d})</span></td>
                    <td>{deck['new_avg_placement']:.2f}</td>
                    <td><span class="{'positive' if deck['avg_placement_change'] < 0 else 'negative' if deck['avg_placement_change'] > 0 else 'neutral'}">({deck['avg_placement_change']:+.2f})</span></td>
                    <td>{deck['new_best'] if deck['new_best'] > 0 else '-'}</td>
                </tr>
                """ for deck in comparison_data[:30])}
            </table>
        </div>
    </div>
</body>
</html>"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

def main():
    """Main execution function."""
    print("=" * 60)
    print("City League Archetype Scraper")
    print("=" * 60)
    
    # Load settings
    settings = load_settings()
    
    # Calculate dates (end_date can be 'auto' for today-2)
    start_date_str, end_date_str = calculate_date_range(settings['start_date'], settings['end_date'])
    
    # Parse dates
    try:
        start_date = parse_date(start_date_str)
        end_date = parse_date(end_date_str)
    except ValueError:
        print("Error: Invalid date format. Use DD.MM.YYYY format.")
        return
    
    print(f"\nSettings:")
    print(f"  Date Range: {start_date_str} - {end_date_str}")
    if settings['end_date'] == 'auto':
        print(f"    (End date auto-calculated: today - 2 days)")
    print(f"  Region: {settings['region']}")
    print(f"  Output File: {settings['output_file']}")
    print(f"  Delay: {settings['delay_between_requests']}s")
    
    additional_ids = settings.get('additional_tournament_ids', [])
    if additional_ids:
        print(f"  Additional Tournaments: {', '.join(str(id) for id in additional_ids)}")
    
    # Get tournaments in date range
    tournaments = get_tournaments_in_date_range(
        settings['region'],
        start_date,
        end_date,
        settings['delay_between_requests']
    )
    
    # Add additional tournaments by ID from main site (e.g., Champions League)
    additional_ids = settings.get('additional_tournament_ids', [])
    if additional_ids:
        print(f"\n{'='*60}")
        print(f"Fetching {len(additional_ids)} additional tournament(s) by ID...")
        print(f"{'='*60}")
        
        for tournament_id in additional_ids:
            tournament_info = get_tournament_by_id(
                str(tournament_id),
                settings['delay_between_requests']
            )
            if tournament_info:
                tournaments.append(tournament_info)
                print(f"  ✓ Added tournament {tournament_id} to scraping queue")
            else:
                print(f"  ✗ Failed to fetch tournament {tournament_id}")
    
    if not tournaments:
        print("\nNo tournaments found in the specified date range.")
        return
    
    # Load existing tournament IDs to skip already scraped ones
    existing_tournament_ids = set()
    output_path = os.path.join(get_data_dir(), settings['output_file'])
    if os.path.exists(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=';')
                for row in reader:
                    if 'tournament_id' in row and row['tournament_id']:
                        existing_tournament_ids.add(row['tournament_id'])
            print(f"\nFound {len(existing_tournament_ids)} already scraped tournaments")
        except Exception as e:
            print(f"\nCould not load existing tournament IDs: {e}")
    
    # Filter out already scraped tournaments
    new_tournaments = [t for t in tournaments if str(t['tournament_id']) not in existing_tournament_ids]
    
    if not new_tournaments:
        print("\n✅ All tournaments in date range already scraped! Nothing new to scrape.")
        
        # Load existing data and regenerate deck statistics
        output_path = os.path.join(get_data_dir(), settings['output_file'])
        if os.path.exists(output_path):
            try:
                with open(output_path, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f, delimiter=';')
                    all_saved_data = list(reader)
                print(f"\n✓ Loaded {len(all_saved_data)} entries from existing CSV")
                
                # Regenerate deck statistics only (comparison stays the same since no new data)
                save_deck_statistics(all_saved_data, settings['output_file'])
                print("✓ Deck statistics regenerated from existing data")
                print("   (Comparison report not updated - no new data to add)")
            except Exception as e:
                print(f"Error regenerating statistics: {e}")
        return
    
    print(f"\n📊 Tournaments to scrape: {len(new_tournaments)} new (skipping {len(tournaments) - len(new_tournaments)} already scraped)")
    
    # Scrape archetypes from each tournament
    all_data = []
    
    print(f"\nStarting to scrape {len(new_tournaments)} new tournaments...")
    print("=" * 60)
    
    for i, tournament in enumerate(new_tournaments, 1):
        print(f"\n[{i}/{len(new_tournaments)}] Processing tournament {tournament['tournament_id']}")
        
        archetypes = scrape_tournament_archetypes(
            tournament['url'],
            tournament,
            settings['delay_between_requests']
        )
        
        all_data.extend(archetypes)
    
    # Save results
    print("\n" + "=" * 60)
    print(f"Scraping complete! Total entries collected: {len(all_data)}")
    
    # Load existing data BEFORE saving new data (for comparison)
    output_path = os.path.join(get_data_dir(), settings['output_file'])
    old_data = []
    
    if os.path.exists(output_path):
        try:
            with open(output_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=';')
                old_data = list(reader)
            print(f"\n✓ Loaded {len(old_data)} existing entries from CSV (for comparison)")
        except Exception as e:
            print(f"\n⚠️  Could not load existing data: {e}")
            old_data = []
    
    # Combine old data + new data = complete dataset
    new_data = old_data + all_data
    
    if all_data:
        # Save complete dataset (overwrites CSV with old + new data combined)
        save_to_csv(new_data, settings['output_file'])
        print(f"✓ Saved {len(new_data)} total entries to CSV ({len(old_data)} existing + {len(all_data)} new)")
    
    # Generate deck statistics from complete dataset
    if new_data:
        save_deck_statistics(new_data, settings['output_file'])
        
        # Create comparison: old_data (before scrape) vs. new_data (after scrape)
        print(f"\n📊 Creating comparison report:")
        print(f"   Before this scrape: {len(old_data)} entries")
        print(f"   After this scrape:  {len(new_data)} entries")
        print(f"   Change: +{len(all_data)} new entries")
        
        create_comparison_report(old_data, new_data, settings['output_file'])
        print("✓ Comparison report generated successfully!")
    elif old_data:
        # No new data scraped, but we can still regenerate stats from existing data
        save_deck_statistics(old_data, settings['output_file'])
        print("\n✓ Deck statistics regenerated from existing data")
        print("   (No comparison report - no new data to compare)")
    
    # Create HTML report if we have data
    if all_data:
        try:
            # Convert to comparison data format for HTML
            comparison_data = []
            for i, entry in enumerate(all_data, 1):
                comparison_data.append({
                    'rank': i,
                    'placement': entry.get('placement', ''),
                    'player': entry.get('player', ''),
                    'archetype': entry.get('archetype', ''),
                    'date': entry.get('date', ''),
                    'shop': entry.get('shop', ''),
                    'prefecture': entry.get('prefecture', '')
                })
            
            html_file = settings['output_file'].replace('.csv', '.html')
            create_html_comparison(comparison_data, html_file)
            print(f"✓ HTML report created: {html_file}")
        except Exception as e:
            print(f"⚠️  Could not create HTML report: {e}")
        
        # Print summary statistics
        print("\n" + "=" * 60)
        print("Archetype Summary:")
        print("=" * 60)
        
        archetype_counts = {}
        for entry in all_data:
            arch = entry['archetype']
            archetype_counts[arch] = archetype_counts.get(arch, 0) + 1
        
        # Sort by count
        sorted_archetypes = sorted(archetype_counts.items(), key=lambda x: x[1], reverse=True)
        
        for archetype, count in sorted_archetypes:
            print(f"  {archetype}: {count}")
    
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
