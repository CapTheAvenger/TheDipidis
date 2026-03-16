import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.splitlines()

results = []
for i, line in enumerate(lines, 1):
    # Skip lines that are pure JS/CSS, URLs, or comments
    stripped = line.strip()
    # Find ? that look like broken emoji: surrounded by spaces/brackets/tags
    for m in re.finditer(r'(?<=[> \'"=,;\(])(\?)(?=[< \'"=,;\)]|$)', line):
        pos = m.start()
        context = line[max(0,pos-40):pos+40].strip()
        results.append(f'L{i:4d}: {context}')

print(f'Found {len(results)} potential broken symbols:\n')
for r in results[:200]:
    print(r)
