"""Fast-food deals for the /eat page, from OzBargain shop and tag feeds.

Run as part of deals.py (same job, same 2-second gaps and conditional GET),
but on its own, slower clock: see should_fetch_food. Rows go to
public.eat_deals; only the title, link, chain, votes, dates and the feed's own
image are kept. Which deals are WA-only, other-state-only or app-only is
worked out by the website from the title.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse


@dataclass(frozen=True)
class Chain:
    key: str
    domains: tuple[str, ...]
    names: tuple[str, ...]  # how deal titles name it, lower case


# Keys match src/lib/eat/chains.ts.
CHAINS: tuple[Chain, ...] = (
    Chain("kfc", ("kfc.com.au",), ("kfc",)),
    Chain("mcdonalds", ("mcdonalds.com.au", "mcdonalds.com", "mymaccaspartnerrewards.com.au"), ("mcdonald's", "mcdonalds", "maccas", "macca's", "mymacca's")),
    Chain("hungryjacks", ("hungryjacks.com.au",), ("hungry jack's", "hungry jacks")),
    Chain("subway", ("subway.com", "subway.com.au"), ("subway",)),
    Chain("dominos", ("dominos.com.au",), ("domino's", "dominos")),
    Chain("pizzahut", ("pizzahut.com.au",), ("pizza hut",)),
    Chain("redrooster", ("redrooster.com.au",), ("red rooster",)),
    Chain("chickentreat", ("chickentreat.com.au",), ("chicken treat",)),
    Chain("gyg", ("guzmanygomez.com.au", "guzmanygomez.com", "gyg.com.au"), ("guzman y gomez", "gyg")),
    Chain("oporto", ("oporto.com.au",), ("oporto",)),
    Chain("nandos", ("nandos.com.au",), ("nando's", "nandos")),
    Chain("grilld", ("grilld.com.au",), ("grill'd", "grilld")),
    Chain("zambrero", ("zambrero.com.au", "zambrero.com"), ("zambrero",)),
    Chain("tacobell", ("tacobell.com.au",), ("taco bell",)),
    Chain("madmex", ("madmex.com.au",), ("mad mex",)),
    Chain("nene", ("nenechicken.com.au",), ("nene chicken",)),
    Chain("jesters", ("jesters.au", "jesters.com.au"), ("jesters",)),
    Chain("schnitz", ("schnitz.com.au",), ("schnitz",)),
    Chain("rolld", ("rolld.com.au",), ("roll'd", "rolld")),
    Chain("sushisushi", ("sushisushi.com.au",), ("sushi sushi",)),
)
CHAIN_KEYS = {chain.key for chain in CHAINS}


@dataclass(frozen=True)
class FoodFeed:
    shop: str  # status key in public.eat_feed_status
    url: str
    chain: str | None  # set for a chain's own feed; None for a tag feed


def _store(key: str, domain: str) -> FoodFeed:
    return FoodFeed(key, f"https://www.ozbargain.com.au/deals/{domain}/feed", key)


# The chains with an OzBargain shop page, plus the fast-food tag for the rest.
FOOD_FEEDS: tuple[FoodFeed, ...] = (
    _store("kfc", "kfc.com.au"),
    _store("mcdonalds", "mcdonalds.com"),
    _store("hungryjacks", "hungryjacks.com.au"),
    _store("subway", "subway.com"),
    _store("dominos", "dominos.com.au"),
    _store("pizzahut", "pizzahut.com.au"),
    _store("redrooster", "redrooster.com.au"),
    _store("chickentreat", "chickentreat.com.au"),
    _store("gyg", "guzmanygomez.com.au"),
    _store("oporto", "oporto.com.au"),
    _store("nandos", "nandos.com.au"),
    _store("grilld", "grilld.com.au"),
    _store("zambrero", "zambrero.com.au"),
    FoodFeed("tag-fast-food", "https://www.ozbargain.com.au/tag/fast-food/feed", None),
)

# Clock for the food feeds: every ~5.5 hours, hourly while someone has /eat
# open, and a visit can ask for one when the last is 30+ minutes old.
FOOD_QUIET = timedelta(minutes=330)
FOOD_BUSY = timedelta(minutes=55)
FOOD_VISIT_WINDOW = timedelta(minutes=65)
FOOD_VISIT_MIN_GAP = timedelta(minutes=25)
# A feed that answered 404 is left alone for a week.
MISSING_FEED_PAUSE = timedelta(days=7)

_NODE_LINK = re.compile(r"^https://www\.ozbargain\.com\.au/node/(\d+)$")
_IMAGE_URL = re.compile(r"^https://files\.ozbargain\.com\.au/[A-Za-z0-9/._?=&%-]+$")
OZB_NS = "{https://www.ozbargain.com.au}"
MEDIA_NS = "{http://search.yahoo.com/mrss/}"


def _ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def should_fetch_food(mode: str, scope: str, state: dict, now: datetime) -> tuple[bool, str]:
    """Whether this run should fetch the food feeds, and why."""
    last_run = _ts(state.get("food_last_run_at"))
    last_visit = _ts(state.get("food_last_visit_at"))
    since = now - last_run if last_run else None
    if mode == "manual":
        return True, "started by hand"
    if mode == "visit" and scope == "food":
        if since is not None and since < FOOD_VISIT_MIN_GAP:
            return False, "fetched recently"
        return True, "someone opened Eat"
    if since is None or since >= FOOD_QUIET:
        return True, "regular refresh"
    if last_visit and now - last_visit <= FOOD_VISIT_WINDOW and since >= FOOD_BUSY:
        return True, "someone looked in the last hour"
    return False, "not due"


def feed_paused(status: dict | None, now: datetime) -> bool:
    """A feed that was missing (404) in the last week is not asked again yet."""
    if not status or status.get("last_status") != 404:
        return False
    tried = _ts(status.get("last_attempt_at"))
    return tried is not None and now - tried < MISSING_FEED_PAUSE


def _norm(text: str) -> str:
    return unescape(text).lower().replace("\u2019", "'").replace("\u2018", "'")


_NAME_PATTERNS = [
    (chain.key, re.compile(r"(?<![a-z0-9])" + re.escape(name) + r"(?![a-z0-9])"))
    for chain in CHAINS
    for name in chain.names
]


def chain_for_host(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    for chain in CHAINS:
        if any(host == d or host.endswith("." + d) for d in chain.domains):
            return chain.key
    return None


def chain_for_title(title: str) -> str | None:
    """The chain a title names: the shop after the last '@' first, else the first named."""
    text = _norm(title)
    at = text.rsplit(" @ ", 1)
    if len(at) == 2:
        for key, pattern in _NAME_PATTERNS:
            if pattern.search(at[1]):
                return key
    best: tuple[int, str] | None = None
    for key, pattern in _NAME_PATTERNS:
        match = pattern.search(text)
        if match and (best is None or match.start() < best[0]):
            best = (match.start(), key)
    return best[1] if best else None


def _iso(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def _int(value: str | None) -> int:
    try:
        return max(0, int(value or 0))
    except ValueError:
        return 0


def _image(url: str | None) -> str | None:
    url = unescape((url or "").strip())
    return url if len(url) <= 400 and _IMAGE_URL.match(url) else None


def parse_food_feed(xml_text: str, feed: FoodFeed, now: datetime | None = None) -> list[dict]:
    """Rows for public.eat_deals. A tag-feed deal that names no chain we list is dropped."""
    now = now or datetime.now(timezone.utc)
    root = ET.fromstring(xml_text)
    rows: list[dict] = []
    for item in root.iter("item"):
        link = (item.findtext("link") or "").strip()
        match = _NODE_LINK.match(link)
        title = " ".join(unescape(item.findtext("title") or "").split())
        if not match or not title:
            continue
        try:
            posted = parsedate_to_datetime(item.findtext("pubDate") or "")
        except (TypeError, ValueError):
            continue
        if posted is None:
            continue
        meta = item.find(f"{OZB_NS}meta")
        attrs = meta.attrib if meta is not None else {}
        chain = feed.chain or chain_for_host(attrs.get("url")) or chain_for_title(title)
        if chain not in CHAIN_KEYS:
            continue
        expires_at = _iso(attrs.get("expiry"))
        msg = item.find(f"{OZB_NS}title-msg")
        flagged = msg is not None and (msg.get("type") or "") in {"expired", "outofstock"}
        thumb = item.find(f"{MEDIA_NS}thumbnail")
        rows.append(
            {
                "node_id": int(match.group(1)),
                "title": title[:300],
                "deal_url": link,
                "chain": chain,
                "votes_pos": _int(attrs.get("votes-pos")),
                "votes_neg": _int(attrs.get("votes-neg")),
                "posted_at": posted.astimezone(timezone.utc).isoformat(),
                "starts_at": _iso(attrs.get("starting")),
                "expires_at": expires_at,
                "is_expired": flagged or (expires_at is not None and datetime.fromisoformat(expires_at) <= now),
                "image_url": _image(attrs.get("image")) or _image(thumb.get("url") if thumb is not None else None),
                "fetched_at": now.isoformat(),
            }
        )
    return rows


def merge_food_rows(rows: list[dict]) -> list[dict]:
    """One row per deal; a chain's own feed wins over the tag feed."""
    merged: dict[int, dict] = {}
    for row in rows:
        merged.setdefault(row["node_id"], row)
    return list(merged.values())
