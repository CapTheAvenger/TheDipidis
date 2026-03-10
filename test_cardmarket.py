#!/usr/bin/env python3
"""Test Cardmarket access with undetected-chromedriver"""

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
import time

print('Starting undetected Chrome...')
options = uc.ChromeOptions()
# Remove headless to see what's happening
# options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--window-size=1920,1080')

# Let undetected-chromedriver auto-detect and download the correct driver version
driver = uc.Chrome(options=options, version_main=145)
test_url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Erikas-Oddish-ASC001'

print('Accessing Cardmarket...')
driver.get(test_url)
time.sleep(5)

print(f'Page title: {driver.title}')
print(f'Current URL: {driver.current_url}')

# Check for bot protection
if 'Nur einen Moment' in driver.title or 'Just a moment' in driver.title:
    print('⚠️ Bot protection detected, waiting longer...')
    time.sleep(10)
    print(f'Page title after wait: {driver.title}')

# Try to find price elements
try:
    dt_elements = driver.find_elements(By.TAG_NAME, 'dt')
    print(f'\nFound {len(dt_elements)} dt elements')
    if len(dt_elements) > 0:
        for i, dt in enumerate(dt_elements[:10]):
            text = dt.text.strip()
            if text:
                print(f'  [{i}] {text[:60]}')
                if '7-day' in text.lower() or 'average' in text.lower():
                    try:
                        dd = dt.find_element(By.XPATH, 'following-sibling::dd[1]')
                        print(f'      → Price: {dd.text}')
                    except:
                        pass
except Exception as e:
    print(f'Error finding elements: {e}')

driver.quit()
print('\nTest complete!')
