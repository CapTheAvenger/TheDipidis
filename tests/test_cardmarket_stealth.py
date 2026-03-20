#!/usr/bin/env python3
"""Test Cardmarket access with selenium-stealth"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium_stealth import stealth
import time

print('Starting Chrome with stealth...')
chrome_options = Options()
chrome_options.add_argument('--headless=new')
chrome_options.add_argument('--no-sandbox')  # Required for CI/container environments only
chrome_options.add_argument('--disable-dev-shm-usage')
chrome_options.add_argument('--window-size=1920,1080')
chrome_options.add_argument('--disable-blink-features=AutomationControlled')
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
chrome_options.add_experimental_option('useAutomationExtension', False)

driver = webdriver.Chrome(options=chrome_options)

# Apply stealth settings
stealth(driver,
        languages=["en-US", "en"],
        vendor="Google Inc.",
        platform="Win32",
        webgl_vendor="Intel Inc.",
        renderer="Intel Iris OpenGL Engine",
        fix_hairline=True,
        )

test_url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Erikas-Oddish-ASC001'

print('Accessing Cardmarket...')
driver.get(test_url)
time.sleep(8)  # Longer wait for Cloudflare

print(f'Page title: {driver.title}')
print(f'Current URL: {driver.current_url}')

# Check for bot protection
if 'Nur einen Moment' in driver.title or 'Just a moment' in driver.title or 'Cloudflare' in driver.title:
    print('⚠️ Bot protection detected, waiting longer...')
    time.sleep(15)
    print(f'Page title after wait: {driver.title}')

# Try to find price elements
try:
    dt_elements = driver.find_elements(By.TAG_NAME, 'dt')
    print(f'\nFound {len(dt_elements)} dt elements')
    
    if len(dt_elements) > 0:
        print('\nPrice information found:')
        for i, dt in enumerate(dt_elements[:15]):
            text = dt.text.strip()
            if text:
                print(f'  [{i}] {text[:60]}')
                if '7-day' in text.lower() or 'average' in text.lower() or 'from' in text.lower():
                    try:
                        dd = dt.find_element(By.XPATH, 'following-sibling::dd[1]')
                        price_text = dd.text.strip()
                        if price_text:
                            print(f'      ✓ FOUND PRICE: {price_text}')
                    except Exception:
                        pass
    else:
        print('\n⚠️ No dt elements found - likely blocked by Cloudflare')
        print('Page source preview (first 500 chars):')
        print(driver.page_source[:500])
    
except Exception as e:
    print(f'Error finding elements: {e}')

driver.quit()
print('\nTest complete!')
