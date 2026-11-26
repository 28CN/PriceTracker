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
 <media:thumbnail url="https://files.ozbargain.com.au/n/01/1001l.jpg?h=abc" />
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
        "image_url": "https://files.ozbargain.com.au/n/01/1001l.jpg?h=abc",
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


def test_images_only_from_ozbargain():
    assert deals.clean_image_url("https://files.ozbargain.com.au/n/1/2l.jpg?h=a&amp;b=1") == (
        "https://files.ozbargain.com.au/n/1/2l.jpg?h=a&b=1"
    )
    assert deals.clean_image_url("http://files.ozbargain.com.au/n/1/2l.jpg") is None
    assert deals.clean_image_url("https://files.ozbargain.com.au.evil.example/x.jpg") is None
    assert deals.clean_image_url("https://files.ozbargain.com.au/x.jpg\"onerror=") is None
    assert deals.clean_image_url(None) is None


def test_og_image_is_read_in_either_attribute_order():
    a = '<meta property="og:image" content="https://files.ozbargain.com.au/n/9/9l.jpg">'
    b = "<meta content='https://files.ozbargain.com.au/n/9/9l.jpg' property='og:image' />"
    assert deals.og_image_from_html(a) == deals.og_image_from_html(b) == "https://files.ozbargain.com.au/n/9/9l.jpg"
    assert deals.og_image_from_html('<meta property="og:image" content="https://evil.example/x.jpg">') is None


def test_missing_images_use_stored_then_a_few_page_lookups(monkeypatch):
    rows = [
        {"node_id": 1, "image_url": None, "is_expired": False, "deal_url": "https://www.ozbargain.com.au/node/1"},
        {"node_id": 2, "image_url": None, "is_expired": False, "deal_url": "https://www.ozbargain.com.au/node/2"},
    ]
    calls = []

    class Response:
        status_code = 200
        text = '<meta property="og:image" content="https://files.ozbargain.com.au/n/2/2l.jpg">'

    class Session:
        def get(self, url, **kwargs):
            calls.append(url)
            return Response()

    monkeypatch.setattr(deals.time, "sleep", lambda seconds: None)
    fetched = deals.fill_missing_images(Session(), rows, {1: "https://files.ozbargain.com.au/n/1/1l.jpg"})
    assert fetched == 1 and calls == ["https://www.ozbargain.com.au/node/2"]
    assert rows[0]["image_url"].endswith("/1l.jpg") and rows[1]["image_url"].endswith("/2l.jpg")


def _ago(minutes):
    from datetime import timedelta

    return (NOW - timedelta(minutes=minutes)).isoformat()


def test_schedule_runs_every_three_hours_when_nobody_looks():
    assert deals.should_run("schedule", {"last_run_at": _ago(60)}, NOW)[0] is False
    assert deals.should_run("schedule", {"last_run_at": _ago(171)}, NOW)[0] is True
    assert deals.should_run("schedule", {}, NOW)[0] is True


def test_schedule_runs_hourly_while_someone_looks():
    state = {"last_run_at": _ago(56), "last_visit_at": _ago(20)}
    assert deals.should_run("schedule", state, NOW)[0] is True
    state = {"last_run_at": _ago(30), "last_visit_at": _ago(5)}
    assert deals.should_run("schedule", state, NOW)[0] is False
    state = {"last_run_at": _ago(80), "last_visit_at": _ago(120)}
    assert deals.should_run("schedule", state, NOW)[0] is False


def test_visit_runs_unless_just_fetched_and_manual_always_runs():
    assert deals.should_run("visit", {"last_run_at": _ago(10)}, NOW)[0] is False
    assert deals.should_run("visit", {"last_run_at": _ago(20)}, NOW)[0] is False
    assert deals.should_run("visit", {"last_run_at": _ago(26)}, NOW)[0] is True
    assert deals.should_run("manual", {"last_run_at": _ago(1)}, NOW)[0] is True


class _Response:
    def __init__(self, status, text="", headers=None):
        self.status_code = status
        self.text = text
        self.headers = headers or {}


class _Session:
    def __init__(self, response):
        self.response = response
        self.sent = None

    def get(self, url, timeout, headers):
        self.sent = headers
        return self.response


def test_conditional_get_sends_validators_and_handles_304():
    session = _Session(_Response(304))
    result = deals.fetch_feed(session, FEED, {"etag": '"abc"', "last_modified": "Wed, 25 Nov 2026 03:00:00 GMT"})
    assert session.sent == {"If-None-Match": '"abc"', "If-Modified-Since": "Wed, 25 Nov 2026 03:00:00 GMT"}
    assert result.not_modified and result.text is None and result.etag == '"abc"'


def test_feed_200_keeps_new_validators():
    session = _Session(_Response(200, SAMPLE, {"ETag": '"new"', "Last-Modified": "x"}))
    result = deals.fetch_feed(session, FEED, None)
    assert session.sent == {}
    assert result.text and not result.not_modified and result.etag == '"new"' and result.last_modified == "x"
