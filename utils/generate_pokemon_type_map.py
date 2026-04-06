"""
Generate a static JSON mapping from Pokedex number to TCG energy type.
Uses PokeAPI to fetch the primary type for each Pokemon (1-1025).
Maps game types to TCG energy types.
"""
import json
import urllib.request
import time
import sys

GAME_TO_TCG = {
    'grass': 'Grass',
    'fire': 'Fire',
    'water': 'Water',
    'electric': 'Lightning',
    'psychic': 'Psychic',
    'fighting': 'Fighting',
    'dark': 'Darkness',
    'steel': 'Metal',
    'dragon': 'Dragon',
    'normal': 'Colorless',
    'flying': 'Colorless',
    'bug': 'Grass',
    'poison': 'Psychic',   # In TCG, Poison Pokemon are Psychic or Darkness
    'ground': 'Fighting',
    'rock': 'Fighting',
    'ice': 'Water',
    'ghost': 'Psychic',
    'fairy': 'Psychic',    # Fairy type merged into Psychic in modern TCG
}

def fetch_pokemon_type(dex_number, retries=3):
    url = f'https://pokeapi.co/api/v2/pokemon/{dex_number}'
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Pokemon-TCG-Analysis/1.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                types = sorted(data.get('types', []), key=lambda t: t.get('slot', 99))
                if types:
                    primary_type = types[0]['type']['name']
                    return GAME_TO_TCG.get(primary_type, 'Colorless')
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
            else:
                print(f'  Failed dex {dex_number}: {e}', file=sys.stderr)
    return 'Colorless'

def main():
    output_path = 'data/pokemon_type_map.json'
    max_dex = 1025
    
    # Try to load existing partial data
    try:
        with open(output_path, 'r') as f:
            type_map = json.load(f)
        print(f'Loaded existing map with {len(type_map)} entries')
    except (FileNotFoundError, json.JSONDecodeError):
        type_map = {}

    batch_size = 50
    for start in range(1, max_dex + 1, batch_size):
        end = min(start + batch_size, max_dex + 1)
        needs_fetch = [i for i in range(start, end) if str(i) not in type_map]
        if not needs_fetch:
            continue
        
        print(f'Fetching dex {start}-{end-1} ({len(needs_fetch)} new)...')
        for dex in needs_fetch:
            tcg_type = fetch_pokemon_type(dex)
            type_map[str(dex)] = tcg_type
            # Small delay to be nice to the API
            time.sleep(0.05)
        
        # Save progress after each batch
        with open(output_path, 'w') as f:
            json.dump(type_map, f, separators=(',', ':'), sort_keys=True)
    
    print(f'\nDone! {len(type_map)} Pokemon types mapped to {output_path}')
    
    # Print summary
    from collections import Counter
    counts = Counter(type_map.values())
    for tcg_type, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f'  {tcg_type}: {count}')

if __name__ == '__main__':
    main()
