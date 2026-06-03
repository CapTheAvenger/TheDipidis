#!/usr/bin/env python3
"""
Daily Price Alerts
==================
Pushes Telegram notifications to users who opted in to price alerts
via Mein Profil → Account → Einstellungen → Preisalarme. Two rules:

  • Wishlist:  cardmarket eur_low <= user wishlistMaxPrice
               → "🎯 Treffer! <Karte> ist jetzt X € — dein Ziel war Y €"
  • Tradelist: cardmarket eur_price >= user tradelistMinPrice
                                       * (1 + thresholdPct/100)
               → "⚠ Markt für <Karte> ist N % über deinem Preis"

Snooze: each (user, card) pair gets a lastNotified timestamp written
back to Firestore. The same alert won't fire again within 48 hours
even if the price still satisfies the trigger — keeps the bot from
spamming the user while a card sits at a discount.

Required secrets (set in GitHub repo Settings → Secrets and variables
→ Actions):
  • BOT_TOKEN                — Telegram bot token (same one Render uses)
  • FIREBASE_SERVICE_ACCOUNT — JSON service-account credentials with
                               Firestore read+write scope on the
                               `users` collection

Sources:
  • data/price_data.csv             — name, set, number, eur_price,
                                       eur_low, cardmarket_url
  • data/all_cards_database.csv     — fallback name lookup for cards
                                       not in price_data yet
"""

import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from typing import Dict, Optional, Tuple

SNOOZE_HOURS = 48
DEFAULT_TRADELIST_THRESHOLD_PCT = 10
SITE_BASE_URL = "https://thedipidis.app"


# ── price-data loader ─────────────────────────────────────────────

def _parse_eur(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    s = raw.replace("€", "").replace(",", ".").strip()
    if not s:
        return None
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


def load_price_index(path: str) -> Dict[str, dict]:
    """Returns {cardId -> {name, eur_price, eur_low, cardmarket_url}}
    where cardId = "<name>|<set>|<number>" — matches the format the
    frontend uses for wishlist/tradelist arrays."""
    out: Dict[str, dict] = {}
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("name") or "").strip()
            set_ = (row.get("set") or "").strip()
            num = (row.get("number") or "").strip()
            if not (name and set_ and num):
                continue
            out[f"{name}|{set_}|{num}"] = {
                "name": name,
                "set": set_,
                "number": num,
                "eur_price": _parse_eur(row.get("eur_price")),
                "eur_low": _parse_eur(row.get("eur_low")),
                "cardmarket_url": (row.get("cardmarket_url") or "").strip(),
            }
    return out


# ── telegram api ──────────────────────────────────────────────────

def send_telegram(bot_token: str, chat_id: str, text: str) -> bool:
    """Returns True on HTTP 200. Uses urllib so we don't bring in
    `requests` for a one-call script."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"  ✗ telegram send failed for chat {chat_id}: {e}", file=sys.stderr)
        return False


# ── alert builders ────────────────────────────────────────────────

def _deep_link(sub: str, set_: str, number: str) -> str:
    # Hash-based routing matches the rest of the app's deep-link
    # convention (see HASH_ALIASES in js/inline-init.js). The
    # focusCard handler in inline-init.js parses the query string
    # after the alias and scrolls + flashes the card row.
    focus = urllib.parse.quote(f"{set_}|{number}", safe="")
    alias = "wishlist" if sub == "wishlist" else "tradelist"
    return f"{SITE_BASE_URL}/#{alias}?focusCard={focus}"


def _fmt_eur(v: Optional[float]) -> str:
    if v is None:
        return "—"
    return f"{v:.2f}".replace(".", ",") + " €"


def build_user_alerts(
    user_doc: dict,
    price_index: Dict[str, dict],
    now_ms: int,
) -> Tuple[list, dict]:
    """Returns (alert_lines, updated_lastNotified_map)."""
    alerts = user_doc.get("priceAlerts", {}).get("telegram", {})
    threshold_pct = alerts.get("tradelistThresholdPct") or DEFAULT_TRADELIST_THRESHOLD_PCT
    last_notified = alerts.get("lastNotified") or {}

    snooze_cutoff = now_ms - SNOOZE_HOURS * 3600 * 1000
    updated: Dict[str, int] = {}

    lines = []

    # ── Wishlist (cardmarket_low <= userMaxPrice) ──
    wishlist = user_doc.get("wishlist") or []
    max_prices = user_doc.get("wishlistMaxPrices") or {}
    for card_id in wishlist:
        max_p = max_prices.get(card_id)
        if not (isinstance(max_p, (int, float)) and max_p > 0):
            continue
        info = price_index.get(card_id)
        if not info:
            continue
        cm = info.get("eur_low") or info.get("eur_price")
        if cm is None or cm > max_p:
            continue
        if (last_notified.get(card_id) or 0) > snooze_cutoff:
            continue
        url = _deep_link("wishlist", info["set"], info["number"])
        lines.append(
            f"🎯 <b>{info['name']}</b> ({info['set']} {info['number']})\n"
            f"   Markt: {_fmt_eur(cm)} · dein Ziel: {_fmt_eur(max_p)}\n"
            f"   → <a href=\"{url}\">In der Wishlist anschauen</a>"
        )
        updated[card_id] = now_ms

    # ── Tradelist (cardmarket >= userMinPrice * (1 + pct/100)) ──
    tradelist = user_doc.get("tradelist") or []
    min_prices = user_doc.get("tradelistMinPrices") or {}
    for card_id in tradelist:
        min_p = min_prices.get(card_id)
        if not (isinstance(min_p, (int, float)) and min_p > 0):
            continue
        info = price_index.get(card_id)
        if not info:
            continue
        cm = info.get("eur_price") or info.get("eur_low")
        if cm is None:
            continue
        threshold = min_p * (1 + threshold_pct / 100.0)
        if cm < threshold:
            continue
        if (last_notified.get(card_id) or 0) > snooze_cutoff:
            continue
        delta_pct = (cm - min_p) / min_p * 100
        url = _deep_link("tradelist", info["set"], info["number"])
        lines.append(
            f"⚠ <b>{info['name']}</b> ({info['set']} {info['number']}) "
            f"+{delta_pct:.0f} %\n"
            f"   Markt: {_fmt_eur(cm)} · dein Preis: {_fmt_eur(min_p)}\n"
            f"   → <a href=\"{url}\">Trade-Preis anpassen</a>"
        )
        updated[card_id] = now_ms

    return lines, updated


# ── main loop ─────────────────────────────────────────────────────

def main() -> int:
    bot_token = os.environ.get("BOT_TOKEN")
    if not bot_token:
        print("✗ BOT_TOKEN env var missing", file=sys.stderr)
        return 1
    svc_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not svc_account_json:
        print("✗ FIREBASE_SERVICE_ACCOUNT env var missing", file=sys.stderr)
        return 1

    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(here)
    price_csv = os.path.join(project_root, "data", "price_data.csv")
    price_index = load_price_index(price_csv)
    print(f"loaded {len(price_index)} cards from {price_csv}")

    # firebase-admin import lives here so a missing dep fails the
    # workflow loudly instead of during script discovery.
    import firebase_admin
    from firebase_admin import credentials, firestore

    cred_dict = json.loads(svc_account_json)
    cred = credentials.Certificate(cred_dict)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    now_ms = int(time.time() * 1000)
    users_processed = 0
    alerts_sent = 0

    # We can't where() on a nested map field reliably with the admin
    # SDK if the index isn't deployed, so we scan all users and skip
    # the ones without telegram enabled. Cheap enough at our scale.
    for user_snap in db.collection("users").stream():
        user_doc = user_snap.to_dict() or {}
        telegram = (user_doc.get("priceAlerts") or {}).get("telegram") or {}
        if not telegram.get("enabled"):
            continue
        chat_id = telegram.get("chatId")
        if not chat_id:
            continue
        users_processed += 1

        lines, last_notified_updates = build_user_alerts(user_doc, price_index, now_ms)
        if not lines:
            continue

        body = "💸 <b>Preisalarme von TheDipidis</b>\n\n" + "\n\n".join(lines)
        if send_telegram(bot_token, str(chat_id), body):
            alerts_sent += 1
            merged_last = dict(telegram.get("lastNotified") or {})
            merged_last.update(last_notified_updates)
            db.collection("users").document(user_snap.id).set({
                "priceAlerts": {
                    "telegram": {
                        "lastNotified": merged_last,
                    },
                },
            }, merge=True)
            print(f"  ✓ sent {len(lines)} alert(s) to user {user_snap.id}")
        else:
            print(f"  ✗ telegram delivery failed for user {user_snap.id}")

    print(f"\nDone. users_processed={users_processed} alerts_sent={alerts_sent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
