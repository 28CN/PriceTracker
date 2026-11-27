"""Fetch OzBargain shop feeds into public.ozb_deals.

Run by .github/workflows/fetch-deals.yml a few times a day. Also fetches the
fast-food feeds for /eat on their own clock (see eat.py). Stores only the
deal title, the OzBargain deal page link, the shop, votes and dates: no
descriptions or images. A feed that fails or comes back empty leaves that
shop's existing rows alone and is recorded in public.ozb_feed_status.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python deals.py
    python deals.py --dry-run      # fetch and parse, print, write nothing
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse

import requests

import eat

USER_AGENT = "PriceTrackerDeals/1.0 (+https://pricetracker-au.vercel.app/about/built)"
FEED_URL = "https://www.ozbargain.com.au/deals/{domain}/feed"
OZB_NS = "{https://www.ozbargain.com.au}"
PAUSE_SECONDS = 2.0  # between feeds, to be polite
KEEP_DAYS = 30
OG_FETCH_LIMIT = 10  # deal pages fetched per run for a missing image
OG_PAUSE_SECONDS = 3.0
MEDIA_NS = "{http://search.yahoo.com/mrss/}"
_IMAGE_URL = re.compile(r"^https://files\.ozbargain\.com\.au/[A-Za-z0-9/._?=&%-]+$")
_OG_IMAGE = re.compile(
    r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']'
    r'|<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    re.I,
)


@dataclass(frozen=True)
class Feed:
    shop: str
    domain: str
    tab: str  # 'shops' (shops we crawl) or 'online'


FEEDS: tuple[Feed, ...] = (
    Feed("coles", "coles.com.au", "shops"),
    Feed("woolworths", "woolworths.com.au", "shops"),
    Feed("kmart", "kmart.com.au", "shops"),
    Feed("target", "target.com.au", "shops"),
    Feed("bigw", "bigw.com.au", "shops"),
    Feed("toymate", "toymate.com.au", "shops"),
    Feed("bunnings", "bunnings.com.au", "shops"),
    Feed("chemistwarehouse", "chemistwarehouse.com.au", "shops"),
    Feed("jbhifi", "jbhifi.com.au", "shops"),
    Feed("amazon", "amazon.com.au", "online"),
    Feed("ebay", "ebay.com.au", "online"),
    Feed("temu", "temu.com", "online"),
    Feed("aliexpress", "aliexpress.com", "online"),
    Feed("kogan", "kogan.com", "online"),
)

_NODE_LINK = re.compile(r"^https://www\.ozbargain\.com\.au/node/(\d+)$")


def shop_for_url(url: str | None) -> Feed | None:
    """The feed whose shop sells the deal, from the deal's own shop link."""
    if not url:
        return None
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    for feed in FEEDS:
        if host == feed.domain or host.endswith("." + feed.domain):
            return feed
    return None


def clean_image_url(url: str | None) -> str | None:
    """Only OzBargain's own image host, https, and a sane length."""
    url = unescape((url or "").strip())
    if len(url) > 400 or not _IMAGE_URL.match(url):
        return None
    return url


def og_image_from_html(html: str) -> str | None:
    match = _OG_IMAGE.search(html)
    return clean_image_url(match.group(1) or match.group(2)) if match else None


def _parse_iso(value: str | None) -> str | None:
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


def parse_feed(xml_text: str, feed: Feed, now: datetime | None = None) -> list[dict]:
    """Parse one RSS feed into rows for public.ozb_deals. Bad items are skipped."""
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
        expires_at = _parse_iso(attrs.get("expiry"))
        title_msg = item.find(f"{OZB_NS}title-msg")
        flagged_ended = title_msg is not None and (title_msg.get("type") or "") in {"expired", "outofstock"}
        ended = flagged_ended or (expires_at is not None and datetime.fromisoformat(expires_at) <= now)
        # A deal in the Coles feed can be "Coles price match @ Amazon": file it
        # under the shop the deal actually links to, when that is one we list.
        owner = shop_for_url(attrs.get("url")) or feed
        thumb = item.find(f"{MEDIA_NS}thumbnail")
        enclosure = item.find("enclosure")
        image = (
            clean_image_url(attrs.get("image"))
            or clean_image_url(thumb.get("url") if thumb is not None else None)
            or clean_image_url(enclosure.get("url") if enclosure is not None else None)
        )
        rows.append(
            {
                "node_id": int(match.group(1)),
                "title": title[:300],
                "deal_url": link,
                "shop": owner.shop,
                "tab": owner.tab,
                "votes_pos": _int(attrs.get("votes-pos")),
                "votes_neg": _int(attrs.get("votes-neg")),
                "posted_at": posted.astimezone(timezone.utc).isoformat(),
                "starts_at": _parse_iso(attrs.get("starting")),
                "expires_at": expires_at,
                "is_expired": ended,
                "image_url": image,
                "fetched_at": now.isoformat(),
            }
        )
    return rows


# Adaptive refresh (see should_run). OzBargain caches its feeds and asks bots
# not to poll hard; hourly while someone is looking, ~3-hourly otherwise.
VISIT_WINDOW = timedelta(minutes=65)
BUSY_INTERVAL = timedelta(minutes=55)
QUIET_INTERVAL = timedelta(minutes=170)
VISIT_MIN_GAP = timedelta(minutes=25)


def _ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def should_run(mode: str, state: dict, now: datetime) -> tuple[bool, str]:
    """Whether this run should fetch, and why. `mode` is manual, visit or schedule."""
    last_run = _ts(state.get("last_run_at"))
    last_visit = _ts(state.get("last_visit_at"))
    since_run = now - last_run if last_run else None
    if mode == "manual":
        return True, "started by hand"
    if mode == "visit":
        if since_run is not None and since_run < VISIT_MIN_GAP:
            return False, "fetched recently"
        return True, "someone opened Deals"
    if since_run is None or since_run >= QUIET_INTERVAL:
        return True, "regular refresh"
    if last_visit and now - last_visit <= VISIT_WINDOW and since_run >= BUSY_INTERVAL:
        return True, "someone looked in the last hour"
    return False, "nobody looked lately and the last fetch is recent"


@dataclass
class FeedResult:
    text: str | None  # feed body on 200
    not_modified: bool  # 304: nothing new since last time
    etag: str | None
    last_modified: str | None
    status: int | None


def fetch_feed(session: requests.Session, feed, validators: dict | None = None, url: str | None = None) -> FeedResult:
    """GET one feed, conditionally when we have its ETag / Last-Modified."""
    url = url or FEED_URL.format(domain=feed.domain)
    headers = {}
    if validators and validators.get("etag"):
        headers["If-None-Match"] = validators["etag"]
    if validators and validators.get("last_modified"):
        headers["If-Modified-Since"] = validators["last_modified"]
    status = None
    for attempt in range(2):
        try:
            response = session.get(url, timeout=20, headers=headers)
            status = response.status_code
            etag = response.headers.get("ETag")
            modified = response.headers.get("Last-Modified")
            if status == 304:
                return FeedResult(None, True, etag or (validators or {}).get("etag"), modified or (validators or {}).get("last_modified"), status)
            if status == 200 and "<rss" in response.text[:500]:
                return FeedResult(response.text, False, etag, modified, status)
            print(f"[deals] {feed.shop}: HTTP {status}", file=sys.stderr)
        except requests.RequestException as error:
            print(f"[deals] {feed.shop}: {type(error).__name__}", file=sys.stderr)
        if attempt == 0:
            time.sleep(5)
    return FeedResult(None, False, None, None, status)


def fill_missing_images(session: requests.Session, rows: list[dict], known: dict[int, str]) -> int:
    """Use a stored image, else the deal page's og:image, for a few deals per run."""
    fetched = 0
    for row in rows:
        if row["image_url"]:
            continue
        if known.get(row["node_id"]):
            row["image_url"] = known[row["node_id"]]
            continue
        if fetched >= OG_FETCH_LIMIT or row["is_expired"]:
            continue
        fetched += 1
        time.sleep(OG_PAUSE_SECONDS)
        try:
            response = session.get(row["deal_url"], timeout=20, headers={"Accept": "text/html"})
            if response.status_code == 200:
                row["image_url"] = og_image_from_html(response.text[:200_000])
        except requests.RequestException as error:
            print(f"[deals] og:image {row['node_id']}: {type(error).__name__}", file=sys.stderr)
    return fetched


def merge_rows(rows: list[dict]) -> list[dict]:
    """One row per deal. The same deal can appear in two feeds."""
    merged: dict[int, dict] = {}
    for row in rows:
        merged.setdefault(row["node_id"], row)
    return list(merged.values())


def run_shops(client, session: requests.Session, now: datetime) -> bool:
    """Fetch the shop feeds for /deals. Returns True when every feed failed."""
    validators: dict[str, dict] = {}
    if client is not None:
        stored = client.table("ozb_feed_status").select("shop, etag, last_modified").execute().data or []
        validators = {row["shop"]: row for row in stored}

    all_rows: list[dict] = []
    statuses: list[dict] = []
    unchanged = 0
    for index, feed in enumerate(FEEDS):
        if index:
            time.sleep(PAUSE_SECONDS)
        result = fetch_feed(session, feed, validators.get(feed.shop))
        text = result.text
        rows: list[dict] = []
        if text is not None:
            try:
                rows = parse_feed(text, feed, now)
            except ET.ParseError:
                print(f"[deals] {feed.shop}: feed did not parse", file=sys.stderr)
                text = None
        ok = text is not None or result.not_modified
        label = "not changed" if result.not_modified else ("ok" if ok else "failed")
        print(f"[deals] {feed.shop}: {label}, {len(rows)} deals")
        all_rows.extend(rows)
        status: dict = {"shop": feed.shop, "last_attempt_at": now.isoformat(), "last_status": result.status}
        if result.not_modified:
            unchanged += 1  # keep the stored item_count
        else:
            status["item_count"] = len(rows)
        if ok:
            status["last_ok_at"] = now.isoformat()
            status["etag"] = result.etag
            status["last_modified"] = result.last_modified
        statuses.append(status)
    with_etag = sum(1 for s in statuses if s.get("etag"))
    with_modified = sum(1 for s in statuses if s.get("last_modified"))
    print(f"[deals] conditional GET: ETag on {with_etag}, Last-Modified on {with_modified}, 304 on {unchanged} of {len(FEEDS)} feeds")

    rows = merge_rows(all_rows)
    if client is None:
        for row in rows[:20]:
            print(row["shop"], row["votes_pos"], row["title"][:80])
        print(f"[deals] dry run: {len(rows)} deals, nothing written")
        return False

    missing = [row["node_id"] for row in rows if not row["image_url"]]
    known: dict[int, str] = {}
    if missing:
        stored = client.table("ozb_deals").select("node_id, image_url").in_("node_id", missing).execute()
        known = {r["node_id"]: r["image_url"] for r in (stored.data or []) if r.get("image_url")}
    pages = fill_missing_images(session, rows, known)
    if pages:
        print(f"[deals] looked up {pages} deal pages for a missing image")
    if rows:
        # first_seen_at keeps its default on insert and is never sent, so an
        # update leaves the first time we saw the deal alone.
        client.table("ozb_deals").upsert(rows, on_conflict="node_id").execute()
    for status in statuses:
        client.table("ozb_feed_status").upsert(status, on_conflict="shop").execute()
    cutoff = (now - timedelta(days=KEEP_DAYS)).isoformat()
    client.table("ozb_deals").delete().lt("posted_at", cutoff).execute()
    client.table("ozb_refresh_state").update({"last_run_at": now.isoformat()}).eq("id", True).execute()
    failed = [s["shop"] for s in statuses if "last_ok_at" not in s]
    print(f"[deals] wrote {len(rows)} deals; failed feeds: {', '.join(failed) or 'none'}")
    # Partial failure is fine; fail only if every feed failed.
    return len(failed) == len(FEEDS)


def run_food(client, session: requests.Session, now: datetime, mode: str) -> bool:
    """Fetch the fast-food feeds for /eat. Returns True when every feed asked failed."""
    stored_status: dict[str, dict] = {}
    if client is not None:
        stored = client.table("eat_feed_status").select("feed, etag, last_modified, last_status, last_attempt_at").execute().data or []
        stored_status = {row["feed"]: row for row in stored}

    all_rows: list[dict] = []
    statuses: list[dict] = []
    asked = 0
    for feed in eat.FOOD_FEEDS:
        previous = stored_status.get(feed.shop)
        if mode != "manual" and eat.feed_paused(previous, now):
            print(f"[eat] {feed.shop}: skipped (missing last time)")
            continue
        if asked:
            time.sleep(PAUSE_SECONDS)
        asked += 1
        result = fetch_feed(session, feed, previous, url=feed.url)
        text = result.text
        rows: list[dict] = []
        if text is not None:
            try:
                rows = eat.parse_food_feed(text, feed, now)
            except ET.ParseError:
                print(f"[eat] {feed.shop}: feed did not parse", file=sys.stderr)
                text = None
        ok = text is not None or result.not_modified
        print(f"[eat] {feed.shop}: {'not changed' if result.not_modified else ('ok' if ok else 'failed')}, {len(rows)} deals")
        all_rows.extend(rows)
        status: dict = {"feed": feed.shop, "last_attempt_at": now.isoformat(), "last_status": result.status}
        if not result.not_modified:
            status["item_count"] = len(rows)
        if ok:
            status["last_ok_at"] = now.isoformat()
            status["etag"] = result.etag
            status["last_modified"] = result.last_modified
        statuses.append(status)

    rows = eat.merge_food_rows(all_rows)
    if client is None:
        for row in rows[:30]:
            print(row["chain"], row["votes_pos"], row["title"][:80])
        print(f"[eat] dry run: {len(rows)} deals from {asked} feeds, nothing written")
        return False
    if rows:
        client.table("eat_deals").upsert(rows, on_conflict="node_id").execute()
    for status in statuses:
        client.table("eat_feed_status").upsert(status, on_conflict="feed").execute()
    cutoff = (now - timedelta(days=KEEP_DAYS)).isoformat()
    client.table("eat_deals").delete().lt("posted_at", cutoff).execute()
    client.table("ozb_refresh_state").update({"food_last_run_at": now.isoformat()}).eq("id", True).execute()
    failed = [s["feed"] for s in statuses if "last_ok_at" not in s]
    print(f"[eat] wrote {len(rows)} deals; failed feeds: {', '.join(failed) or 'none'}")
    return bool(statuses) and len(failed) == len(statuses)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mode", choices=["manual", "visit", "schedule"], default="manual")
    # "food" is a visit to /eat: only the fast-food feeds.
    parser.add_argument("--scope", choices=["all", "food"], default="all")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    client = None
    shops, food = args.scope == "all", True
    if not args.dry_run:
        from supabase import create_client  # only needed when writing

        client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        state_rows = client.table("ozb_refresh_state").select("*").limit(1).execute().data or []
        state = state_rows[0] if state_rows else {}
        if shops:
            shops, why = should_run(args.mode, state, now)
            print(f"[deals] mode={args.mode}: {'fetching' if shops else 'skipping'} ({why})")
        food, why = eat.should_fetch_food(args.mode, args.scope, state, now)
        print(f"[eat] mode={args.mode} scope={args.scope}: {'fetching' if food else 'skipping'} ({why})")
    if not shops and not food:
        return 0

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/rss+xml"})
    shops_failed = run_shops(client, session, now) if shops else False
    if shops and food:
        time.sleep(PAUSE_SECONDS)
    food_failed = run_food(client, session, now, args.mode) if food else False
    return 1 if shops_failed or food_failed else 0


if __name__ == "__main__":
    sys.exit(main())
