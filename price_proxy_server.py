#!/usr/bin/env python3
"""
Price Proxy Server - CORS-enabled proxy for live price fetching
================================================================
Allows the web frontend to fetch live prices from Limitless TCG and Cardmarket
by proxying requests and adding CORS headers.

Usage:
    python price_proxy_server.py
    
Then access from JavaScript:
    fetch('http://localhost:8001/fetch-price?url=...')
"""

from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import time
import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app, origins=["http://localhost:8000", "http://127.0.0.1:8000",
                    "https://captheavenger.github.io"])

# Allowed hosts for SSRF protection
ALLOWED_HOSTS = {"limitlesstcg.com", "www.limitlesstcg.com",
                 "cardmarket.com", "www.cardmarket.com"}

# Rate limiting
last_request_time = 0
MIN_DELAY = 0.3

def extract_eur_price_from_html(html: str, source: str) -> str:
    """Extract EUR price from HTML."""
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        if source == 'limitless':
            table = soup.find('table', class_='card-prints-versions')
            if table:
                current_row = table.find('tr', class_='current')
                if current_row:
                    eur_link = current_row.find('a', class_='eur')
                    if eur_link:
                        return eur_link.get_text(strip=True)
        
        elif source == 'cardmarket':
            # Try multiple strategies
            price_elements = soup.find_all('dd', class_=re.compile(r'col'))
            for elem in price_elements:
                text = elem.get_text(strip=True)
                if '€' in text and any(c.isdigit() for c in text):
                    return text
            
            price_elem = soup.find(class_=re.compile(r'price', re.I))
            if price_elem:
                text = price_elem.get_text(strip=True)
                if '€' in text:
                    return text
        
        return ''
    except Exception:
        return ''

@app.route('/fetch-price')
def fetch_price():
    """Fetch and parse price from URL."""
    global last_request_time
    
    url = request.args.get('url')
    source = request.args.get('source', 'limitless')
    
    if not url:
        return jsonify({'error': 'Missing url parameter'}), 400
    
    # SSRF protection: only allow known hosts
    try:
        parsed = urlparse(url)
        if parsed.hostname not in ALLOWED_HOSTS:
            return jsonify({'error': 'URL host not allowed'}), 403
        if parsed.scheme not in ('http', 'https'):
            return jsonify({'error': 'Invalid URL scheme'}), 403
    except Exception:
        return jsonify({'error': 'Invalid URL'}), 400
    
    # Rate limiting
    now = time.time()
    elapsed = now - last_request_time
    if elapsed < MIN_DELAY:
        time.sleep(MIN_DELAY - elapsed)
    last_request_time = time.time()
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        price = extract_eur_price_from_html(response.text, source)
        
        # Extract Cardmarket URL if from Limitless
        cardmarket_url = ''
        if source == 'limitless' and price:
            soup = BeautifulSoup(response.text, 'html.parser')
            table = soup.find('table', class_='card-prints-versions')
            if table:
                current_row = table.find('tr', class_='current')
                if current_row:
                    eur_link = current_row.find('a', class_='eur')
                    if eur_link:
                        cardmarket_url = eur_link.get('href', '')
        
        return jsonify({
            'price': price,
            'cardmarket_url': cardmarket_url,
            'success': bool(price)
        })
    
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 500

@app.route('/health')
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'message': 'Price proxy server is running'})

if __name__ == '__main__':
    print("=" * 70)
    print("PRICE PROXY SERVER - Live Price Fetching")
    print("=" * 70)
    print()
    print("Server starting on: http://localhost:8001")
    print()
    print("Available endpoints:")
    print("  - /fetch-price?url=...&source=limitless  → Get price as JSON")
    print("  - /health                                → Health check")
    print()
    print("Cache: None (always fresh)")
    print("Rate limit: 0.3s between requests")
    print()
    
    # Check dependencies
    try:
        import flask
        import flask_cors
        import bs4
        print("✓ All dependencies installed")
    except ImportError as e:
        print(f"ERROR: Missing dependency: {e}")
        print("Install: pip install flask flask-cors beautifulsoup4 requests")
        input("\nPress Enter to exit...")
        exit(1)
    
    print()
    print("=" * 70)
    print()
    
    app.run(host='localhost', port=8001, debug=False)
