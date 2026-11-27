from datetime import datetime, timedelta, timezone

import deals
import eat

NOW = datetime(2026, 11, 27, 3, 0, tzinfo=timezone.utc)
TAG = eat.FoodFeed("tag-fast-food", "https://www.ozbargain.com.au/tag/fast-food/feed", None)
KFC = eat.FoodFeed("kfc", "https://www.ozbargain.com.au/deals/kfc.com.au/feed", "kfc")

SAMPLE = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:ozb="https://www.ozbargain.com.au" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Fast Food</title>
<item>
 <title>[WA] 9 Pieces Chicken $9.99 @ Chicken Treat (Online &amp; Pickup Only)</title>
 <link>https://www.ozbargain.com.au/node/2001</link>
 <description><![CDATA[<p>Long description</p>]]></description>
 <ozb:meta votes-pos="12" votes-neg="0" expiry="2026-11-28T23:59:00+08:00" url="https://www.chickentreat.com.au/menu" />
 <media:thumbnail url="https://files.ozbargain.com.au/n/01/2001l.jpg" />
 <category domain="https://www.ozbargain.com.au/cat/dining-takeaway">Dining &amp; Takeaway</category>
 <category domain="https://www.ozbargain.com.au/tag/fast-food">fast food</category>
 <pubDate>Thu, 26 Nov 2026 18:33:00 +0800</pubDate>
</item>
<item>
 <title>50% off Selected Items (Oporto, Subway, Grill’d etc.) @ DoorDash</title>
 <link>https://www.ozbargain.com.au/node/2002</link>
 <ozb:meta votes-pos="40" votes-neg="1" url="https://www.doordash.com/x" />
 <pubDate>Wed, 25 Nov 2026 11:15:00 +1100</pubDate>
</item>
<item>
 <title>Free Coffee @ Some Local Cafe</title>
 <link>https://www.ozbargain.com.au/node/2003</link>
 <ozb:meta votes-pos="3" url="https://cafe.example/" />
 <pubDate>Wed, 25 Nov 2026 11:15:00 +1100</pubDate>
</item>
<item>
 <title>$1 Wicked Wings @ KFC</title>
 <link>https://www.ozbargain.com.au/node/2004</link>
 <ozb:meta votes-pos="300" expiry="2026-11-25T22:00:00+11:00" url="https://www.kfc.com.au/" />
 <ozb:title-msg type="expired">expired</ozb:title-msg>
 <pubDate>Tue, 24 Nov 2026 12:00:00 +1100</pubDate>
</item>
</channel></rss>"""


def test_tag_feed_keeps_only_chains_we_list():
    rows = eat.parse_food_feed(SAMPLE, TAG, NOW)
    assert [(r["node_id"], r["chain"]) for r in rows] == [(2001, "chickentreat"), (2002, "oporto"), (2004, "kfc")]
    first = rows[0]
    assert first["title"].startswith("[WA] 9 Pieces")
    assert first["image_url"] == "https://files.ozbargain.com.au/n/01/2001l.jpg"
    assert first["expires_at"] == "2026-11-28T15:59:00+00:00"
    assert not first["is_expired"]
    assert first["category"] == "Dining & Takeaway" and rows[1]["category"] is None
    assert rows[2]["is_expired"]
    for row in rows:
        assert set(row) == {
            "node_id", "title", "deal_url", "chain", "votes_pos", "votes_neg", "posted_at",
            "starts_at", "expires_at", "is_expired", "image_url", "category", "fetched_at",
        }


def test_chain_feed_files_every_deal_under_its_chain():
    rows = eat.parse_food_feed(SAMPLE, KFC, NOW)
    assert {r["chain"] for r in rows} == {"kfc"}
    assert len(rows) == 4


def test_chain_names_in_titles():
    assert eat.chain_for_title("Free Whopper @ Hungry Jack’s via App") == "hungryjacks"
    assert eat.chain_for_title("$6 Large Pizzas @ Domino's") == "dominos"
    assert eat.chain_for_title("Free Burrito @ Guzman Y Gomez via App") == "gyg"
    assert eat.chain_for_title("Big Mac $3 @ McDonald's") == "mcdonalds"
    assert eat.chain_for_title("Burger 2-for-1 @ Grill'd") == "grilld"
    assert eat.chain_for_title("Subwayfare tickets") is None
    assert eat.chain_for_host("https://order.kfc.com.au/x") == "kfc"
    assert eat.chain_for_host("https://notkfc.com.au/") is None


def test_feed_keys_and_urls():
    keys = [f.shop for f in eat.FOOD_FEEDS]
    assert len(keys) == len(set(keys)) and len(keys) <= 15
    for feed in eat.FOOD_FEEDS:
        assert feed.url.startswith("https://www.ozbargain.com.au/") and feed.url.endswith("/feed")
        assert feed.chain is None or feed.chain in eat.CHAIN_KEYS


def _ago(minutes):
    return (NOW - timedelta(minutes=minutes)).isoformat()


def test_food_clock():
    assert eat.should_fetch_food("schedule", "all", {"food_last_run_at": _ago(100)}, NOW)[0] is False
    assert eat.should_fetch_food("schedule", "all", {"food_last_run_at": _ago(331)}, NOW)[0] is True
    assert eat.should_fetch_food("schedule", "all", {}, NOW)[0] is True
    busy = {"food_last_run_at": _ago(56), "food_last_visit_at": _ago(10)}
    assert eat.should_fetch_food("schedule", "all", busy, NOW)[0] is True
    assert eat.should_fetch_food("visit", "all", busy, NOW)[0] is True
    assert eat.should_fetch_food("visit", "food", {"food_last_run_at": _ago(20)}, NOW)[0] is False
    assert eat.should_fetch_food("visit", "food", {"food_last_run_at": _ago(26)}, NOW)[0] is True
    assert eat.should_fetch_food("manual", "all", {"food_last_run_at": _ago(1)}, NOW)[0] is True


def test_missing_feed_waits_a_week():
    assert eat.feed_paused({"last_status": 404, "last_attempt_at": _ago(60)}, NOW)
    assert not eat.feed_paused({"last_status": 404, "last_attempt_at": _ago(8 * 24 * 60)}, NOW)
    assert not eat.feed_paused({"last_status": 200, "last_attempt_at": _ago(60)}, NOW)
    assert not eat.feed_paused(None, NOW)


def test_merge_keeps_the_chain_feed_row():
    a = eat.parse_food_feed(SAMPLE, KFC, NOW)
    b = eat.parse_food_feed(SAMPLE, TAG, NOW)
    merged = eat.merge_food_rows(a + b)
    assert len(merged) == 4 and {r["chain"] for r in merged} == {"kfc"}


class _Response:
    status_code = 200
    headers: dict = {}

    def __init__(self, text):
        self.text = text


class _Session:
    def __init__(self):
        self.urls = []

    def get(self, url, timeout, headers):
        self.urls.append(url)
        return _Response(SAMPLE)


def test_food_run_skips_missing_feeds_and_waits_between(monkeypatch):
    sleeps = []
    monkeypatch.setattr(deals.time, "sleep", lambda s: sleeps.append(s))
    session = _Session()
    assert deals.run_food(None, session, NOW, "schedule") is False
    assert session.urls == [f.url for f in eat.FOOD_FEEDS]
    assert sleeps == [deals.PAUSE_SECONDS] * (len(eat.FOOD_FEEDS) - 1)
