from datetime import datetime, timezone

import deals

FEED = deals.Feed("coles", "coles.com.au", "shops")
NOW = datetime(2026, 11, 25, 3, 0, tzinfo=timezone.utc)

# Synthetic feed in OzBargain's shape. Descriptions and images exist in the
# real feed and must never be stored.
SAMPLE = """<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:ozb="https://www.ozbargain.com.au" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Test</title>
<item>
 <title>Test Biscuits 200g $2.50 (Half Price) @ Coles</title>
 <link>https://www.ozbargain.com.au/node/1001</link>
 <description><![CDATA[<img src="https://files.example/1.jpg"/><p>Long description</p>]]></description>
 <ozb:meta comment-count="3" expiry="2026-12-02T00:00:00+11:00" starting="2026-11-25T00:00:00+11:00" votes-pos="20" votes-neg="1" url="https://www.coles.com.au/product/x" image="https://files.example/1.jpg" />
 <pubDate>Tue, 24 Nov 2026 21:54:51 +1100</pubDate>
</item>
<item>
 <title>Cereal 500g $3.25 (Coles price match) @ Amazon AU</title>
 <link>https://www.ozbargain.com.au/node/1002</link>
 <ozb:meta votes-pos="5" votes-neg="0" url="https://www.amazon.com.au/dp/B0TEST" />
 <pubDate>Wed, 25 Nov 2026 06:37:14 +1100</pubDate>
</item>
<item>
 <title>$10 off $50 Spend @ Coles</title>
 <link>https://www.ozbargain.com.au/node/1003</link>
 <ozb:meta votes-pos="381" votes-neg="0" expiry="2026-11-24T23:59:00+11:00" url="https://www.coles.com.au/offers" />
 <ozb:title-msg type="expired">expired</ozb:title-msg>
 <pubDate>Mon, 23 Nov 2026 23:59:51 +1100</pubDate>
</item>
<item>
 <title>Not a deal page</title>
 <link>https://evil.example/node/9</link>
 <pubDate>Mon, 23 Nov 2026 23:59:51 +1100</pubDate>
</item>
<item>
 <title>No date</title>
 <link>https://www.ozbargain.com.au/node/1004</link>
</item>
</channel></rss>"""


def test_parse_feed_keeps_only_safe_fields():
    rows = deals.parse_feed(SAMPLE, FEED, NOW)
    assert [r["node_id"] for r in rows] == [1001, 1002, 1003]
    first = rows[0]
    assert first == {
        "node_id": 1001,
        "title": "Test Biscuits 200g $2.50 (Half Price) @ Coles",
        "deal_url": "https://www.ozbargain.com.au/node/1001",
        "shop": "coles",
        "tab": "shops",
        "votes_pos": 20,
        "votes_neg": 1,
        "posted_at": "2026-11-24T10:54:51+00:00",
        "starts_at": "2026-11-24T13:00:00+00:00",
        "expires_at": "2026-12-01T13:00:00+00:00",
        "is_expired": False,
        "fetched_at": NOW.isoformat(),
    }
    for row in rows:
        assert "description" not in row and "image" not in row


def test_deal_is_filed_under_the_shop_it_links_to():
    rows = deals.parse_feed(SAMPLE, FEED, NOW)
    amazon = next(r for r in rows if r["node_id"] == 1002)
    assert (amazon["shop"], amazon["tab"]) == ("amazon", "online")


def test_ended_deals_are_flagged():
    rows = deals.parse_feed(SAMPLE, FEED, NOW)
    assert next(r for r in rows if r["node_id"] == 1003)["is_expired"] is True


def test_shop_for_url_matches_subdomains_only_on_dot_boundary():
    assert deals.shop_for_url("https://shop.coles.com.au/x").shop == "coles"
    assert deals.shop_for_url("https://notcoles.com.au/x") is None
    assert deals.shop_for_url(None) is None
    assert deals.shop_for_url("not a url") is None


def test_merge_rows_keeps_one_row_per_deal():
    rows = deals.parse_feed(SAMPLE, FEED, NOW)
    assert len(deals.merge_rows(rows + rows)) == 3


def test_every_feed_has_a_valid_shop_key():
    shops = [f.shop for f in deals.FEEDS]
    assert len(shops) == len(set(shops))
    for feed in deals.FEEDS:
        assert feed.tab in {"shops", "online"}
        assert 2 <= len(feed.shop) <= 30 and feed.shop.isalnum()
