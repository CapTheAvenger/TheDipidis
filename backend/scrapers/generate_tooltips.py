import os
import json
import requests
from bs4 import BeautifulSoup
from openai import OpenAI

# Initiiere den OpenAI Client (benötigt OPENAI_API_KEY in den Umgebungsvariablen)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

LIMITLESS_URL = "https://limitlesstcg.com/decks?variants=true"
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "generated_tooltips.json")


def get_top_decks(limit=20):
    """Scrapt die Top-Decks von Limitless TCG."""
    print("Scraping Limitless TCG...")
    response = requests.get(LIMITLESS_URL, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    decks = []
    table = soup.find("table", class_="data-table")
    if not table:
        print("Tabelle nicht gefunden!")
        return []

    for row in table.find_all("tr")[1 : limit + 1]:
        name_cell = row.find("td")
        if name_cell:
            deck_name = name_cell.text.strip()
            deck_name = deck_name.split("\n")[0].strip()
            if deck_name:
                decks.append(deck_name)
    return decks


def generate_tooltip(deck_name):
    """Lässt die KI eine Anfänger-Strategie schreiben."""
    print(f"Generiere Strategie für: {deck_name}...")
    prompt = (
        f"Analysiere das Pokémon TCG Deck '{deck_name}'. "
        "Fasse die primäre Gewinnstrategie in maximal zwei leicht verständlichen "
        "Sätzen für einen Anfänger zusammen. Antworte auf Deutsch und nur mit der Strategie."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Fehler bei der Generierung für {deck_name}: {e}")
        return ""


def main():
    top_decks = get_top_decks(limit=20)

    # Lade existierende Tooltips, um API-Kosten zu sparen (nur neue generieren)
    output_path = os.path.normpath(OUTPUT_FILE)
    tooltips = {}
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            tooltips = json.load(f)

    for deck in top_decks:
        if deck not in tooltips:
            strategy = generate_tooltip(deck)
            if strategy:
                tooltips[deck] = strategy

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(tooltips, f, ensure_ascii=False, indent=2)
    print(f"Tooltips erfolgreich aktualisiert und gespeichert ({len(tooltips)} Einträge).")


if __name__ == "__main__":
    main()
