"""Generate pokemonproxies_m3_map.js from CSV"""
import csv

# Read CSV
with open('data/pokemonproxies_m3_mapping.csv', 'r', encoding='utf-8') as f:
    data = list(csv.DictReader(f))

# Generate JavaScript
js_content = """// PokemonProxies M3 (Muniki's Zero) Mapping
// Auto-generated from pokemonproxies_m3_mapping.csv
const pokemonProxiesM3Map = new Map([
"""

for row in data:
    js_content += f"  ['{row['card_number']}', '{row['image_url']}'],\n"

js_content += "]);\n"

# Write JS file
with open('data/pokemonproxies_m3_map.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"✓ Generated pokemonproxies_m3_map.js with {len(data)} cards")
print(f"✓ Includes: {', '.join([row['card_number'] for row in data[:5]])}...")
