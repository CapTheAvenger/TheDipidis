"""Unit tests for backend.core.threat_classifier."""

from backend.core.threat_classifier import classify_card, classify_database


def _pokemon(name, energy_type, hp, attacks=None, abilities=None, rules=None, card_type="Pokemon"):
    return {
        "name": name,
        "card_type": card_type,
        "energy_type": energy_type,
        "hp": hp,
        "abilities": abilities or [],
        "attacks": attacks or [],
        "rules": rules or [],
    }


def _trainer(name, card_type, rules):
    return {
        "name": name,
        "card_type": card_type,
        "energy_type": "",
        "hp": "",
        "abilities": [],
        "attacks": [],
        "rules": rules or [],
    }


class TestRetreatLockThreat:
    def test_yveltal_clutch_text_tags_retreat_lock(self):
        # MEG 88 — the canonical example from the user request.
        card = _pokemon("Yveltal", "Darkness", "110", attacks=[
            {"name": "Clutch", "cost": ["D"], "damage": "20",
             "text": "During your opponent's next turn, the Defending Pokémon can't retreat."},
            {"name": "Dark Feather", "cost": ["D", "D", "C"], "damage": "110", "text": ""},
        ])
        tags = classify_card(card)
        assert "retreat_lock" in tags["threats"]
        assert tags["counters"] == []

    def test_basic_card_type_normalizes_to_pokemon(self):
        # The scraper sometimes records 'Basic' instead of 'Pokemon' for
        # the card_type — classifier must still tag it normally.
        card = _pokemon("Yveltal", "Darkness", "110", card_type="Basic", attacks=[
            {"name": "Clutch", "cost": ["D"], "damage": "20",
             "text": "the Defending Pokémon can't retreat"},
        ])
        assert "retreat_lock" in classify_card(card)["threats"]

    def test_no_match_for_card_without_retreat_text(self):
        card = _pokemon("Random Mon", "Fire", "70", attacks=[
            {"name": "Tackle", "cost": ["C"], "damage": "10", "text": ""},
        ])
        assert classify_card(card)["threats"] == []


class TestRetreatLockCounter:
    def test_switch_item_tags_retreat_lock_counter(self):
        card = _trainer("Switch", "Item", rules=[
            "Switch your Active Pokémon with 1 of your Benched Pokémon."
        ])
        tags = classify_card(card)
        assert "retreat_lock" in tags["counters"]

    def test_guzma_supporter_tags_retreat_lock_counter(self):
        # Guzma matches via the SECOND clause ("switch your Active …")
        # — the first clause alone (only-opponent switch) doesn't break
        # a retreat lock and shouldn't count.
        card = _trainer("Guzma", "Supporter", rules=[
            "Switch your opponent's Active Pokémon with 1 of their Benched Pokémon. "
            "Then, switch your Active Pokémon with 1 of your Benched Pokémon."
        ])
        assert "retreat_lock" in classify_card(card)["counters"]

    def test_pokemon_catcher_does_not_count_as_retreat_lock_counter(self):
        # Pokémon Catcher only switches the OPPONENT'S active —
        # doesn't help if WE are retreat-locked, since our defending
        # Pokémon stays in the Active spot.
        card = _trainer("Pokémon Catcher", "Item", rules=[
            "Switch your opponent's Active Pokémon with 1 of their Benched Pokémon."
        ])
        assert classify_card(card)["counters"] == []

    def test_attack_with_switch_text_does_not_count_as_counter(self):
        # Counter gate: only Trainer/Item/Supporter/Tool are eligible.
        # An attack like "Quick Charge" that says 'switch your active'
        # mid-text shouldn't auto-count as a Switch counter.
        card = _pokemon("Random Mon", "Water", "100", attacks=[
            {"name": "Tide Pool", "cost": ["W"], "damage": "20",
             "text": "Switch your Active Pokémon with 1 of your Benched Pokémon."},
        ])
        assert classify_card(card)["counters"] == []


class TestHandDisruption:
    def test_iono_supporter_is_threat_and_counter(self):
        card = _trainer("Iono", "Supporter", rules=[
            "Each player shuffles their hand and puts it on the bottom of their deck. "
            "If either player put any cards on the bottom of their deck in this way, "
            "each player draws a card for each of their remaining Prize cards."
        ])
        tags = classify_card(card)
        assert "hand_disruption" in tags["threats"]
        assert "hand_disruption" in tags["counters"]

    def test_judge_supporter_is_threat_and_counter(self):
        card = _trainer("Judge", "Supporter", rules=[
            "Each player shuffles their hand into their deck and draws 4 cards."
        ])
        tags = classify_card(card)
        assert "hand_disruption" in tags["threats"]
        assert "hand_disruption" in tags["counters"]


class TestBenchDamage:
    def test_attack_targeting_benched_tags_threat(self):
        card = _pokemon("Kleavor", "Grass", "270", attacks=[
            {"name": "Axe Break", "cost": ["G", "F"], "damage": "120",
             "text": "This attack also does 60 damage to 1 of your opponent's Benched Pokémon V."},
        ])
        assert "bench_damage" in classify_card(card)["threats"]

    def test_manaphy_ability_tags_counter(self):
        card = _pokemon("Manaphy", "Water", "70", abilities=[
            {"name": "Wave Veil",
             "text": "Prevent all damage done to your Benched Pokémon by attacks from your opponent's Pokémon."},
        ])
        assert "bench_damage" in classify_card(card)["counters"]


class TestNoiseFiltering:
    def test_illustrator_credit_in_rules_does_not_match(self):
        # Some Limitless pages leak "Illustrated by …" into
        # .card-text-section. The classifier strips noise prefixes.
        card = _trainer("RandomItem", "Item", rules=[
            "Illustrated by akagi"
        ])
        assert classify_card(card)["threats"] == []
        assert classify_card(card)["counters"] == []


class TestBulkClassifier:
    def test_classify_database_returns_only_tagged(self):
        db = {
            "MEG|88": _pokemon("Yveltal", "Darkness", "110", attacks=[
                {"name": "Clutch", "cost": ["D"], "damage": "20",
                 "text": "the Defending Pokémon can't retreat"},
            ]),
            "RND|1": _pokemon("Random Mon", "Fire", "70", attacks=[
                {"name": "Tackle", "cost": ["C"], "damage": "10", "text": ""},
            ]),
            "SVI|194": _trainer("Switch", "Item", rules=[
                "Switch your Active Pokémon with 1 of your Benched Pokémon."
            ]),
        }
        out = classify_database(db)
        assert set(out.keys()) == {"MEG|88", "SVI|194"}
        assert "retreat_lock" in out["MEG|88"]["threats"]
        assert "retreat_lock" in out["SVI|194"]["counters"]

    def test_empty_input_returns_empty(self):
        assert classify_database({}) == {}
