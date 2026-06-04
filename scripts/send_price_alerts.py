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


def _cardmarket_link(info: dict) -> str:
    """Build the Cardmarket product URL with our standard query string
    (DE/EN sellers + Germany filter). Returns empty string when the
    card has no Cardmarket mapping yet — the alert template skips
    rendering the link in that case so we don't surface a broken
    "Cardmarket öffnen" tap."""
    raw = (info.get("cardmarket_url") or "").strip()
    if not raw:
        return ""
    base = raw.split("?")[0]
    return f"{base}?sellerCountry=7&language=1,3"


def build_user_alerts(
    user_doc: dict,
    price_index: Dict[str, dict],
    now_ms: int,
    force_no_snooze: bool = False,
    diag_label: str = "",
) -> Tuple[list, list, list, list]:
    """Return four lists:

      wishlist_lines  — formatted message rows (one per triggered card)
      wishlist_cards  — card_ids that drove the wishlist_lines
      tradelist_lines — formatted message rows
      tradelist_cards — card_ids that drove the tradelist_lines

    The Wishlist and Trade List streams are returned separately so the
    caller can fire them as two distinct Telegram messages — user
    feedback was that one mega-message mixing both streams was harder
    to skim than two focused ones, and the per-card deep link was
    redundant when a single footer link per message points at the
    right tab anyway. Each line keeps its OWN Cardmarket link
    (different per card) but drops the in-page deep link.

    Per-card diagnostic logging records why each candidate did or
    didn't trigger; `force_no_snooze` lets the workflow_dispatch
    operator bypass the 48 h cool-down for ad-hoc verification runs.
    """
    alerts = user_doc.get("priceAlerts", {}).get("telegram", {})
    threshold_pct = alerts.get("tradelistThresholdPct") or DEFAULT_TRADELIST_THRESHOLD_PCT
    last_notified = alerts.get("lastNotified") or {}

    snooze_cutoff = now_ms - SNOOZE_HOURS * 3600 * 1000
    diag = {
        "wishlist_total": 0,
        "wishlist_no_max": 0,
        "wishlist_no_price": 0,
        "wishlist_above_target": 0,
        "wishlist_snoozed": 0,
        "wishlist_triggered": 0,
        "tradelist_total": 0,
        "tradelist_no_min": 0,
        "tradelist_no_price": 0,
        "tradelist_below_threshold": 0,
        "tradelist_snoozed": 0,
        "tradelist_triggered": 0,
    }

    wishlist_lines: list = []
    wishlist_cards: list = []
    tradelist_lines: list = []
    tradelist_cards: list = []

    # ── Wishlist (cardmarket_low <= userMaxPrice) ──
    wishlist = user_doc.get("wishlist") or []
    max_prices = user_doc.get("wishlistMaxPrices") or {}
    for card_id in wishlist:
        diag["wishlist_total"] += 1
        max_p = max_prices.get(card_id)
        if not (isinstance(max_p, (int, float)) and max_p > 0):
            diag["wishlist_no_max"] += 1
            continue
        info = price_index.get(card_id)
        if not info:
            diag["wishlist_no_price"] += 1
            continue
        cm = info.get("eur_low") or info.get("eur_price")
        if cm is None or cm > max_p:
            diag["wishlist_above_target"] += 1
            continue
        if not force_no_snooze and (last_notified.get(card_id) or 0) > snooze_cutoff:
            diag["wishlist_snoozed"] += 1
            continue
        diag["wishlist_triggered"] += 1
        cm_url = _cardmarket_link(info)
        cm_link = f" · 🛒 <a href=\"{cm_url}\">Cardmarket</a>" if cm_url else ""
        wishlist_lines.append(
            f"• <b>{info['name']}</b> ({info['set']} {info['number']})\n"
            f"  Markt {_fmt_eur(cm)} · Ziel {_fmt_eur(max_p)}{cm_link}"
        )
        wishlist_cards.append(card_id)

    # ── Tradelist (cardmarket >= userMinPrice * (1 + pct/100)) ──
    tradelist = user_doc.get("tradelist") or []
    min_prices = user_doc.get("tradelistMinPrices") or {}
    for card_id in tradelist:
        diag["tradelist_total"] += 1
        min_p = min_prices.get(card_id)
        if not (isinstance(min_p, (int, float)) and min_p > 0):
            diag["tradelist_no_min"] += 1
            continue
        info = price_index.get(card_id)
        if not info:
            diag["tradelist_no_price"] += 1
            continue
        cm = info.get("eur_price") or info.get("eur_low")
        if cm is None:
            diag["tradelist_no_price"] += 1
            continue
        threshold = min_p * (1 + threshold_pct / 100.0)
        if cm < threshold:
            diag["tradelist_below_threshold"] += 1
            continue
        if not force_no_snooze and (last_notified.get(card_id) or 0) > snooze_cutoff:
            diag["tradelist_snoozed"] += 1
            continue
        diag["tradelist_triggered"] += 1
        cm_url = _cardmarket_link(info)
        cm_link = f" · 💶 <a href=\"{cm_url}\">Cardmarket</a>" if cm_url else ""
        tradelist_lines.append(
            f"• <b>{info['name']}</b> ({info['set']} {info['number']})\n"
            f"  Markt {_fmt_eur(cm)} · dein Preis {_fmt_eur(min_p)}{cm_link}"
        )
        tradelist_cards.append(card_id)

    print(
        f"  [{diag_label or 'user'}] wishlist: "
        f"{diag['wishlist_total']} on list, "
        f"{diag['wishlist_no_max']} no max set, "
        f"{diag['wishlist_no_price']} no price data, "
        f"{diag['wishlist_above_target']} above your target, "
        f"{diag['wishlist_snoozed']} snoozed, "
        f"{diag['wishlist_triggered']} → notify"
    )
    print(
        f"  [{diag_label or 'user'}] tradelist: "
        f"{diag['tradelist_total']} on list, "
        f"{diag['tradelist_no_min']} no min set, "
        f"{diag['tradelist_no_price']} no price data, "
        f"{diag['tradelist_below_threshold']} below {threshold_pct:.0f} % over min, "
        f"{diag['tradelist_snoozed']} snoozed, "
        f"{diag['tradelist_triggered']} → notify"
    )

    return wishlist_lines, wishlist_cards, tradelist_lines, tradelist_cards


def _pluralize_cards(n: int) -> str:
    return "1 Karte" if n == 1 else f"{n} Karten"


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

    # workflow_dispatch input to bypass the 48 h per-card snooze for a
    # one-off verification run. The GitHub Actions runner passes its
    # boolean inputs as the strings 'true' / 'false', not real bools,
    # hence the explicit comparison.
    force_no_snooze = (os.environ.get("FORCE_NO_SNOOZE", "false").lower() == "true")
    if force_no_snooze:
        print("⚠ FORCE_NO_SNOOZE = true — 48 h cool-down bypassed for this run")

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
    messages_sent = 0

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

        wl_lines, wl_cards, tl_lines, tl_cards = build_user_alerts(
            user_doc, price_index, now_ms,
            force_no_snooze=force_no_snooze,
            diag_label=user_snap.id,
        )
        if not wl_lines and not tl_lines:
            continue

        notified_card_ids: list = []

        # ── Message 1: Wishlist hits ──
        if wl_lines:
            body = (
                f"🎯 <b>Wishlist-Treffer</b> ({_pluralize_cards(len(wl_lines))})\n\n"
                + "\n\n".join(wl_lines)
                + f"\n\n→ <a href=\"{SITE_BASE_URL}/#wishlist\">In der Wishlist anschauen</a>"
            )
            if send_telegram(bot_token, str(chat_id), body):
                messages_sent += 1
                notified_card_ids.extend(wl_cards)
                print(f"  ✓ wishlist message ({len(wl_lines)} cards) → user {user_snap.id}")
            else:
                print(f"  ✗ wishlist delivery failed for user {user_snap.id}")

        # ── Message 2: Trade-list warnings ──
        if tl_lines:
            body = (
                f"⚠ <b>Trade-List-Warnungen</b> ({_pluralize_cards(len(tl_lines))})\n\n"
                + "\n\n".join(tl_lines)
                + f"\n\n→ <a href=\"{SITE_BASE_URL}/#tradelist\">Trade-Preise anpassen</a>"
            )
            if send_telegram(bot_token, str(chat_id), body):
                messages_sent += 1
                notified_card_ids.extend(tl_cards)
                print(f"  ✓ trade-list message ({len(tl_lines)} cards) → user {user_snap.id}")
            else:
                print(f"  ✗ trade-list delivery failed for user {user_snap.id}")

        # Persist the snooze marks only for cards we actually pinged
        # successfully. A failed message means tomorrow's run can
        # retry the same cards without the 48 h cool-down blocking.
        if notified_card_ids:
            merged_last = dict(telegram.get("lastNotified") or {})
            for cid in notified_card_ids:
                merged_last[cid] = now_ms
            db.collection("users").document(user_snap.id).set({
                "priceAlerts": {
                    "telegram": {
                        "lastNotified": merged_last,
                    },
                },
            }, merge=True)

    print(f"\nDone. users_processed={users_processed} messages_sent={messages_sent}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
