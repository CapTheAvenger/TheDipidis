#!/usr/bin/env python3
"""Simple test: One card from Cardmarket with stealth"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium_stealth import stealth
import time

print('Starting Chrome with stealth...')
chrome_options = Options()
chrome_options.add_argument('--headless=new')
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('--disable-dev-shm-usage')
chrome_options.add_argument('--disable-gpu')
chrome_options.add_argument('--window-size=1920,1080')
chrome_options.add_argument('--disable-blink-features=AutomationControlled')
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
chrome_options.add_experimental_option('useAutomationExtension', False)

driver = webdriver.Chrome(options=chrome_options)

# Apply stealth
stealth(driver,
        languages=["en-US", "en"],
        vendor="Google Inc.",
        platform="Win32",
        webgl_vendor="Intel Inc.",
        renderer="Intel Iris OpenGL Engine",
        fix_hairline=True,
        )

# Test with first card
test_url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Erikas-Oddish-ASC001'
card_name = "Erika's Oddish"

print(f'\nAccessing Cardmarket for: {card_name}')
print(f'URL: {test_url}')
driver.get(test_url)
time.sleep(8)  # Wait for Cloudflare

print(f'Page title: {driver.title}')

# Try to find 7-day average price
eur_price = ''
try:
    dt_elements = driver.find_elements(By.TAG_NAME, 'dt')
    print(f'Found {len(dt_elements)} dt elements')
    
    for dt in dt_elements:
        if "7-days average" in dt.text or "7-day average" in dt.text:
            dd_element = dt.find_element(By.XPATH, "following-sibling::dd[1]")
            text = dd_element.text.strip()
            if '€' in text:
                eur_price = text
                print(f'\n✓ SUCCESS: Found 7-day average price: {eur_price}')
                break
    
    if not eur_price:
        print('\n⚠️ No 7-day average found on Cardmarket')
        print('This likely means Cloudflare blocked us.')
        
except Exception as e:
    print(f'\n✗ ERROR: {e}')

driver.quit()
print('\nTest complete!')
