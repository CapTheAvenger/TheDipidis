import re
import os


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    index_path = os.path.join(script_dir, '..', 'index.html')

    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.splitlines()

    results = []
    for i, line in enumerate(lines, 1):
        # Find ? that look like broken emoji: surrounded by spaces/brackets/tags
        for m in re.finditer(r'(?<=[> \'"=,;\(])(\?)(?=[< \'"=,;\)]|$)', line):
            pos = m.start()
            context = line[max(0,pos-40):pos+40].strip()
            results.append(f'L{i:4d}: {context}')

    print(f'Found {len(results)} potential broken symbols:\n')
    for r in results[:200]:
        print(r)


if __name__ == "__main__":
    main()
