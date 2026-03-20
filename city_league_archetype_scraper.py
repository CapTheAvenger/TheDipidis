#!/usr/bin/env python3
"""
City League Archetype Scraper - FAST EDITION
============================================
Scrapes archetype data from limitlesstcg.com Japanese City League tournaments.
- Uses cloudscraper for Cloudflare bypass
- Uses BeautifulSoup4 for robust HTML parsing
- Uses ThreadPoolExecutor for fast concurrent scraping
- Generates detailed HTML & CSV comparison reports
"""

import csv
import re
import time
import json
import html as html_mod
import os
import sys
import logging
import threading
import concurrent.futures
from datetime import datetime, timedelta

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Es fehlen Bibliotheken! Bitte installiere sie mit:")
    print("pip install cloudscraper beautifulsoup4")
    sys.exit(1)

# Import shared utilities
from card_scraper_shared import setup_console_encoding, get_app_path, get_data_dir, normalize_archetype_name, _get_scraper, clean_pokemon_name, fix_mega_pokemon_name

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
data_dir = get_data_dir()
os.makedirs(data_dir, exist_ok=True)
log_file = os.path.join(data_dir, "archetype_scraper.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS = {
    "start_date": "24.01.2026",
    "end_date": "auto",
    "delay_between_requests": 1.5,
    "max_workers": 5,
    "output_file": "city_league_archetypes.csv",
    "region": "jp",
    "additional_tournament_ids": []
}

def load_settings() -> dict:
    settings = DEFAULT_SETTINGS.copy()
    app_path = get_app_path()

    candidates = [
        os.path.join(app_path, "city_league_archetype_settings.json"),
        os.path.join(os.getcwd(), "city_league_archetype_settings.json"),
        os.path.join(app_path, "data", "city_league_archetype_settings.json")
    ]

    for path in candidates:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8-sig") as f:
                    settings.update(json.loads(f.read()))
                logger.info(f"Settings geladen: {path}")
                return settings
            except Exception as e:
                logger.warning(f"Konnte Settings nicht laden: {e}")

    logger.info("Keine Settings-Datei gefunden. Nutze Standardwerte.")
    return settings

def calculate_date_range(start_date: str, end_date: str):
    start_str = start_date
    if end_date == 'auto':
        end_dt = datetime.now() - timedelta(days=2)
        end_str = end_dt.strftime('%d.%m.%Y')
    else:
        end_str = end_date
    return start_str, end_str

def parse_date(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%d.%m.%Y")
    except ValueError:
        logger.error(f"Invalid date format: {date_str}. Use DD.MM.YYYY")
        raise

# ============================================================================
# CLOUDSCRAPER / NETWORK
# ============================================================================

def fetch_page_bs4(url: str, retries: int = 2):
    """Fetch URL and return parsed BeautifulSoup object."""
    scraper = _get_scraper()
    for attempt in range(1, retries + 2):
        try:
            response = scraper.get(url, timeout=15)
            response.raise_for_status()
            return BeautifulSoup(response.text, 'html.parser')
        except Exception as e:
            if attempt <= retries:
                time.sleep(2)
            else:
                logger.debug(f"Fetch failed: {url} -> {e}")
    return None

# ============================================================================
# SCRAPING LOGIC
# ============================================================================
def parse_tournament_date(date_str: str):
    """Parse Limitless date formats (e.g. '24 Jan 26' or '21st February 2026')."""
    try:
        return datetime.strptime(date_str.strip(), "%d %b %y")
    except ValueError:
        try:
            clean_date = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)
            return datetime.strptime(clean_date.strip(), "%d %B %Y")
        except ValueError:
            return None

def get_tournaments_in_date_range(region: str, start_date: datetime, end_date: datetime) -> list:
    url = f"https://limitlesstcg.com/tournaments/{region}?show=500"
    logger.info(f"Lade Turnierliste: {url}")

    soup = fetch_page_bs4(url)
    if not soup:
        logger.error("Fehler beim Laden der Turnierliste.")
        return []

    tournaments = []
    rows = [tr for tr in soup.select('table.striped tr') if tr.find('td')]

    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 4:
            continue

        date_text = cells[0].get_text(strip=True)
        t_date = parse_tournament_date(date_text)

        if t_date and start_date <= t_date <= end_date:
            link = cells[1].find('a')
            if not link:
                continue

            href = link['href']
            t_id = href.split('/')[-1]
            t_url = f"https://limitlesstcg.com{href}" if href.startswith('/') else href

            tournaments.append({
                'tournament_id': t_id,
                'url': t_url,
                'date_str': date_text,
                'prefecture': cells[2].get_text(strip=True),
                'shop': link.get_text(strip=True)
            })

    logger.info(f"{len(tournaments)} Turniere im Zeitraum gefunden.")
    return tournaments

def get_tournament_by_id(tournament_id: str) -> dict:
    url = f"https://limitlesstcg.com/tournaments/{tournament_id}"
    soup = fetch_page_bs4(url)
    if not soup:
        return None

    header = soup.select_one('.tournament-header')
    name = header.find('h1').get_text(strip=True) if header and header.find('h1') else f"Tournament {tournament_id}"

    date_str = ""
    for infobox in soup.select('.infobox-line'):
        text = infobox.get_text(strip=True)
        if '•' in text and 'player' in text.lower():
            date_str = text.split('•')[0].strip()
            break

    return {
        'tournament_id': str(tournament_id),
        'url': url,
        'date_str': date_str,
        'prefecture': 'Special Event',
        'shop': name
    }

def _scrape_single_tournament(tournament: dict) -> list:
    """
    Worker function for multithreading.
    Robuste Tabellenextraktion - vermeidet tbody-Verschluck-Bug.
    """
    soup = fetch_page_bs4(tournament['url'])
    results = []
    if not soup:
        return results

    # ROBUST: Finde zuerst die Tabelle, dann alle <tr> direkt
    # Vermeidet BeautifulSoup tbody-Verschluck-Bug
    table = soup.select_one('table.striped')
    if not table:
        logger.debug(f"Keine Tabelle gefunden für Turnier {tournament.get('tournament_id', 'unknown')}")
        return results
    
    # Iteriere über ALLE <tr>-Zeilen, überspringe Header-Zeilen
    for row in table.find_all('tr'):
        # Überspringe Header-Zeilen (die nur <th> haben)
        if row.find('th'):
            continue
        
        cells = row.find_all('td')
        if len(cells) < 4:
            continue

        placement = cells[0].get_text(strip=True)
        player = cells[1].get_text(strip=True)

        # Extrahiere Pokémon-Namen aus img.pokemon Elementen
        pokemon_imgs = cells[2].select('img.pokemon')
        raw_names = [img['alt'] for img in pokemon_imgs if img.has_attr('alt')]

        # Bereinige Namen (entferne -EX, -VSTAR, etc. und fixe Mega)
        cleaned_names = [fix_mega_pokemon_name(clean_pokemon_name(n)) for n in raw_names]
        archetype_raw = ' '.join(cleaned_names)
        
        # Normalisiere Archetype-Namen für konsistente Analyse
        archetype = normalize_archetype_name(archetype_raw) if archetype_raw else ''

        if placement.isdigit() and archetype:
            results.append({
                'date': tournament.get('date_str', ''),
                'tournament_id': tournament['tournament_id'],
                'prefecture': tournament.get('prefecture', ''),
                'shop': tournament.get('shop', ''),
                'format': 'City League (JP)',
                'placement': placement,
                'player': player,
                'archetype': archetype
            })
    return results

# ============================================================================
# STATS & REPORT GENERATION
# ============================================================================
def save_to_csv(data: list, output_file: str):
    if not data:
        return
    output_path = os.path.join(get_data_dir(), output_file)

    with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        fieldnames = ['date', 'tournament_id', 'prefecture', 'shop', 'format', 'placement', 'player', 'archetype']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(data)
    logger.info(f"✓ {len(data)} Eintraege in {output_file} gespeichert.")

def save_deck_statistics(data: list, output_file: str):
    stats_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_deck_stats.csv'))
    deck_data = {}

    for entry in data:
        arch = entry.get('archetype', 'Unknown')
        place = int(entry.get('placement', 0))
        t_info = f"{entry.get('date', '')} - {entry.get('prefecture', '')} - {entry.get('shop', '')}"

        if arch not in deck_data:
            deck_data[arch] = {'count': 0, 'placements': [], 'tournaments': set()}

        deck_data[arch]['count'] += 1
        deck_data[arch]['placements'].append(place)
        deck_data[arch]['tournaments'].add(t_info)

    stats_rows = []
    for arch, info in deck_data.items():
        avg_place = sum(info['placements']) / len(info['placements']) if info['placements'] else 0
        stats_rows.append({
            'archetype': arch,
            'format': 'City League (JP)',
            'total_appearances': info['count'],
            'average_placement': str(round(avg_place, 2)).replace('.', ','),
            'best_placement': min(info['placements']) if info['placements'] else 0,
            'worst_placement': max(info['placements']) if info['placements'] else 0,
            'tournaments': '; '.join(info['tournaments'])
        })

    stats_rows.sort(key=lambda x: x['total_appearances'], reverse=True)

    with open(stats_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['archetype', 'format', 'total_appearances', 'average_placement', 'best_placement', 'worst_placement', 'tournaments']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(stats_rows)
    logger.info(f"✓ Deck Stats gespeichert in: {stats_file}")

def create_comparison_report(old_data: list, new_data: list, output_file: str):
    data_dir = get_data_dir()
    comparison_csv = os.path.join(data_dir, output_file.replace('.csv', '_comparison.csv'))
    comparison_html = os.path.join(data_dir, output_file.replace('.csv', '_comparison.html'))

    def build_stats(data):
        stats = {}
        total_decks = len(data)  # Für Meta-Share-Berechnung
        for entry in data:
            arch = entry.get('archetype', 'Unknown')
            place = int(entry.get('placement', 0))
            if arch not in stats:
                stats[arch] = {'count': 0, 'placements': [], 'total_placement': 0}
            stats[arch]['count'] += 1
            stats[arch]['placements'].append(place)
            stats[arch]['total_placement'] += place
        for arch, d in stats.items():
            d['avg_placement'] = d['total_placement'] / d['count'] if d['count'] > 0 else 0
            d['best_placement'] = min(d['placements']) if d['placements'] else 0
            d['meta_share'] = (d['count'] / total_decks * 100) if total_decks > 0 else 0  # NEU: Meta-Share
        return stats, total_decks

    old_stats, old_total = build_stats(old_data)
    new_stats, new_total = build_stats(new_data)

    comparison_data = []
    all_archetypes = set(old_stats.keys()) | set(new_stats.keys())

    for arch in all_archetypes:
        old = old_stats.get(arch, {'count': 0, 'avg_placement': 0, 'best_placement': 0, 'meta_share': 0})
        new = new_stats.get(arch, {'count': 0, 'avg_placement': 0, 'best_placement': 0, 'meta_share': 0})

        count_change = new['count'] - old['count']
        avg_change = new['avg_placement'] - old['avg_placement']
        meta_share_change = new['meta_share'] - old['meta_share']  # NEU: Meta-Share-Änderung

        if old['count'] == 0:
            status = 'NEU'
        elif new['count'] == 0:
            status = 'VERSCHWUNDEN'
        else:
            status = 'BESTEHEND'

        if abs(avg_change) < 0.5:
            trend = 'STABIL'
        elif avg_change < 0:
            trend = 'VERBESSERT'
        else:
            trend = 'VERSCHLECHTERT'

        comparison_data.append({
            'archetype': arch, 'status': status, 'trend': trend,
            'old_count': old['count'], 'new_count': new['count'], 'count_change': count_change,
            'old_meta_share': round(old['meta_share'], 2),  # NEU
            'new_meta_share': round(new['meta_share'], 2),  # NEU
            'meta_share_change': round(meta_share_change, 2),  # NEU
            'old_avg_placement': round(old['avg_placement'], 2), 'new_avg_placement': round(new['avg_placement'], 2),
            'avg_placement_change': round(avg_change, 2),
            'old_best': old['best_placement'], 'new_best': new['best_placement']
        })

    comparison_data.sort(key=lambda x: x['new_count'], reverse=True)

    with open(comparison_csv, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['archetype', 'status', 'trend', 'old_count', 'new_count', 'count_change',
                      'old_meta_share', 'new_meta_share', 'meta_share_change',  # NEU
                      'old_avg_placement', 'new_avg_placement', 'avg_placement_change', 'old_best', 'new_best']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        for row in comparison_data:
            rf = row.copy()
            # Formatiere Dezimalzahlen mit Komma für Excel (deutsches Format)
            for k in ['old_avg_placement', 'new_avg_placement', 'avg_placement_change',
                      'old_meta_share', 'new_meta_share', 'meta_share_change']:
                rf[k] = str(row[k]).replace('.', ',')
            writer.writerow(rf)

    create_html_comparison(comparison_data, comparison_html)
    logger.info(f"✓ HTML Report erzeugt: {comparison_html}")


def create_html_comparison(comparison_data: list, output_file: str):
    new_decks = [d for d in comparison_data if d['status'] == 'NEU']
    disappeared_decks = [d for d in comparison_data if d['status'] == 'VERSCHWUNDEN']

    rows_html = ''.join(
        f'<tr>'
        f'<td><strong>{html_mod.escape(deck["archetype"])}</strong></td>'
        f'<td><span class="badge badge-{deck["status"].lower()}">{deck["status"]}</span></td>'
        f'<td><span class="badge badge-{deck["trend"].lower()}">{deck["trend"]}</span></td>'
        f'<td>{deck["new_count"]}</td>'
        f'<td><span class="{"positive" if deck["count_change"] > 0 else "negative" if deck["count_change"] < 0 else "neutral"}">({deck["count_change"]:+d})</span></td>'
        f'<td>{deck["new_meta_share"]:.1f}%</td>'
        f'<td><span class="{"positive" if deck["meta_share_change"] > 0 else "negative" if deck["meta_share_change"] < 0 else "neutral"}">({deck["meta_share_change"]:+.1f}%)</span></td>'
        f'<td>{deck["new_avg_placement"]:.2f}</td>'
        f'<td><span class="{"positive" if deck["avg_placement_change"] < 0 else "negative" if deck["avg_placement_change"] > 0 else "neutral"}">({deck["avg_placement_change"]:+.2f})</span></td>'
        f'<td>{deck["new_best"] if deck["new_best"] > 0 else "-"}</td>'
        f'</tr>'
        for deck in comparison_data[:50]
    )

    new_details = '<br>'.join([f"{html_mod.escape(d['archetype'])} ({d['new_count']}x)" for d in new_decks[:5]]) if new_decks else 'No new archetypes'
    dis_details = '<br>'.join([f"{html_mod.escape(d['archetype'])} (was {d['old_count']}x)" for d in disappeared_decks[:5]]) if disappeared_decks else 'No disappeared archetypes'
    most_active_count = comparison_data[0]['new_count'] if comparison_data else 0
    most_active_name = html_mod.escape(comparison_data[0]['archetype']) if comparison_data else 'No data'
    most_active_avg = comparison_data[0]['new_avg_placement'] if comparison_data else 0
    total_archetypes = len(comparison_data)
    generated_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    html = f"""<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>City League Archetype Comparison</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; max-width: 1400px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
        .container {{ background: white; border-radius: 10px; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }}
        h1 {{ color: #2c3e50; text-align: center; margin-bottom: 10px; font-size: 2.5em; }}
        .subtitle {{ text-align: center; color: #7f8c8d; margin-bottom: 30px; font-size: 1.2em; }}
        .meta-info {{ background: #ecf0f1; padding: 15px; border-radius: 5px; margin-bottom: 30px; text-align: center; }}
        .meta-info span {{ display: inline-block; margin: 0 15px; font-weight: bold; }}
        .section {{ margin-bottom: 40px; }}
        .section h2 {{ color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; }}
        .stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .stat-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }}
        .stat-card h3 {{ margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9; }}
        .stat-card .value {{ font-size: 2.5em; font-weight: bold; margin: 10px 0; }}
        .stat-card .details {{ font-size: 0.85em; opacity: 0.9; margin-top: 10px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        th {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; text-align: left; font-weight: 600; }}
        td {{ padding: 12px; border-bottom: 1px solid #ecf0f1; }}
        tr:hover {{ background-color: #f8f9fa; }}
        .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: bold; color: white; }}
        .badge-neu {{ background-color: #2ecc71; }}
        .badge-verschwunden {{ background-color: #e74c3c; }}
        .badge-bestehend {{ background-color: #3498db; }}
        .badge-verbessert {{ background-color: #27ae60; }}
        .badge-verschlechtert {{ background-color: #e67e22; }}
        .badge-stabil {{ background-color: #95a5a6; }}
        .positive {{ color: #27ae60; font-weight: bold; }}
        .negative {{ color: #e74c3c; font-weight: bold; }}
        .neutral {{ color: #95a5a6; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>City League Archetype Comparison</h1>
        <div class="subtitle">Japanese City League Tournament Data</div>
        <div class="meta-info">
            <span>Generated: {generated_at}</span>
            <span>Total Archetypes Tracked: {total_archetypes}</span>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <h3>New Archetypes</h3>
                <div class="value">{len(new_decks)}</div>
                <div class="details">{new_details}</div>
            </div>
            <div class="stat-card">
                <h3>Disappeared</h3>
                <div class="value">{len(disappeared_decks)}</div>
                <div class="details">{dis_details}</div>
            </div>
            <div class="stat-card">
                <h3>Most Active</h3>
                <div class="value">{most_active_count}</div>
                <div class="details">{most_active_name}<br>Avg Placement: {most_active_avg}</div>
            </div>
        </div>
        <div class="section">
            <h2>Full Comparison Table (Top 50)</h2>
            <table>
                <tr><th>Archetype</th><th>Status</th><th>Trend</th><th>Count</th><th>Count Δ</th><th>Meta Share</th><th>Share Δ</th><th>Avg Placement</th><th>Avg Δ</th><th>Best</th></tr>
                {rows_html}
            </table>
        </div>
    </div>
</body>
</html>"""

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

# ============================================================================
# MAIN EXECUTION
# ============================================================================
def main():
    logger.info("=" * 60)
    logger.info("CITY LEAGUE ARCHETYPE SCRAPER - FAST EDITION")
    logger.info("=" * 60)

    settings = load_settings()
    start_date_str, end_date_str = calculate_date_range(settings['start_date'], settings['end_date'])

    try:
        start_date = parse_date(start_date_str)
        end_date = parse_date(end_date_str)
    except ValueError:
        return

    logger.info(f"Zeitraum: {start_date_str} bis {end_date_str}")

    tournaments = get_tournaments_in_date_range(settings['region'], start_date, end_date)

    for t_id in settings.get('additional_tournament_ids', []):
        t_info = get_tournament_by_id(str(t_id))
        if t_info:
            tournaments.append(t_info)
            logger.info(f"Zusaetzliches Turnier {t_id} geladen.")

    if not tournaments:
        logger.info("Keine Turniere gefunden.")
        return

    # Load existing to skip already scraped tournaments
    existing_ids = set()
    output_path = os.path.join(get_data_dir(), settings['output_file'])
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                if row.get('tournament_id'):
                    existing_ids.add(row['tournament_id'])

    new_tournaments = [t for t in tournaments if str(t['tournament_id']) not in existing_ids]

    if not new_tournaments:
        logger.info("Alle Turniere wurden bereits erfasst!")
        return

    logger.info(f"Starte Multithreading Download fuer {len(new_tournaments)} Turniere...")
    all_data = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=settings.get("max_workers", 5)) as executor:
        future_to_t = {executor.submit(_scrape_single_tournament, t): t for t in new_tournaments}
        for future in concurrent.futures.as_completed(future_to_t):
            t = future_to_t[future]
            try:
                res = future.result()
                all_data.extend(res)
                logger.info(f"  {t.get('shop', t['tournament_id'])} (ID: {t['tournament_id']}) -> {len(res)} Decks")
            except Exception as e:
                logger.error(f"Fehler bei {t['tournament_id']}: {e}")

    logger.info(f"Scraping beendet. {len(all_data)} neue Archetypes gefunden.")

    old_data = []
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8-sig') as f:
            old_data = list(csv.DictReader(f, delimiter=';'))

    new_data = old_data + all_data

    if all_data:
        save_to_csv(new_data, settings['output_file'])
        save_deck_statistics(new_data, settings['output_file'])
        create_comparison_report(old_data, new_data, settings['output_file'])

    logger.info("=" * 60)
    logger.info("ERFOLGREICH BEENDET")
    logger.info("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Abbruch durch Benutzer.")
    except Exception as e:
        logger.critical(f"Unerwarteter Fehler: {e}", exc_info=True)
