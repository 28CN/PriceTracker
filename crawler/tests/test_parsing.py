"""Pure-function tests for the crawler. No network, browser or Supabase."""

from decimal import Decimal

import pytest

import main


@pytest.mark.parametrize(
    "text, expected",
    [
        ("$19.99", "19.99"),
        ("AU$ 1,299.00", "1299.00"),
        ("12,50", "12.50"),
        ("1,299", "1299.00"),
        ("Now\u00a0$7", "7.00"),
        (42, "42.00"),
    ],
)
def test_parse_price_decimal(text, expected):
    assert main.parse_price_decimal(text) == Decimal(expected)


@pytest.mark.parametrize("text", [None, "", "   ", "free", "N/A"])
def test_parse_price_decimal_rejects_non_prices(text):
    assert main.parse_price_decimal(text) is None


def test_iter_json_ld_nodes_walks_graph_and_variants():
    doc = {"@graph": [{"@type": "WebPage"}, {"@type": "Product", "hasVariant": [{"@type": "Product", "sku": "v1"}]}]}
    nodes = list(main.iter_json_ld_nodes(doc))
    assert [n.get("@type") for n in nodes] == [None, "WebPage", "Product", "Product"]
    assert main.node_is_product(nodes[2])
    assert main.node_is_product({"@type": ["Thing", "Product"]})
    assert not main.node_is_product({"@type": "Offer"})


@pytest.mark.parametrize(
    "offers, expected",
    [
        ({"availability": "https://schema.org/InStock"}, "in_stock"),
        ({"availability": "http://schema.org/OutOfStock"}, "unavailable"),
        ([{"availability": "SoldOut"}, {"availability": "InStock"}], "in_stock"),
        ({"availability": {"@id": "https://schema.org/PreOrder"}}, "in_stock"),
        ({"availability": ""}, "unknown"),
        ("garbage", "unknown"),
    ],
)
def test_offer_stock(offers, expected):
    assert main.offer_stock(offers) == expected


def test_price_from_offers_prefers_first_positive_and_nested_spec():
    assert main.price_from_offers([{"price": "0"}, {"price": "24.50"}]) == Decimal("24.50")
    assert main.price_from_offers({"lowPrice": "9"}) == Decimal("9.00")
    assert main.price_from_offers({"priceSpecification": {"price": "15.00"}}) == Decimal("15.00")
    assert main.price_from_offers({"name": "no price"}) is None


def test_url_matches_page_ignores_www_case_and_trailing_slash():
    assert main.url_matches_page("https://www.Shop.com/P/123/", "https://shop.com/p/123")
    assert not main.url_matches_page("https://shop.com/p/124", "https://shop.com/p/123")
    assert not main.url_matches_page("/p/123", "https://shop.com/p/123")
    assert main.product_matches_page({"offers": [{"url": "https://shop.com/p/1"}]}, "https://shop.com/p/1")


@pytest.mark.parametrize(
    "host, expected",
    [
        ("www.kmart.com.au", "Kmart"),
        ("www.amazon.com.au", "Amazon AU"),
        ("www.bigw.com.au", "Big W"),
        ("shop.unknown.example", "shop.unknown.example"),
        ("", "Unknown"),
    ],
)
def test_infer_retailer_from_hostname(host, expected):
    assert main.infer_retailer_from_hostname(host) == expected


def test_split_finished_jobs_requeues_skipped_shops():
    jobs = [
        {"id": "j1", "product_id": "p1"},  # crawled -> done
        {"id": "j2", "link_id": "l2"},  # existed but skipped -> requeue
        {"id": "j3", "product_id": "gone"},  # no longer exists -> done
        {"id": "j4"},  # full-run job -> done
        {"product_id": "p1"},  # no id -> ignored
    ]
    raw = [{"id": "l1", "product_id": "p1"}, {"id": "l2", "product_id": "p2"}]
    crawled = [{"id": "l1", "product_id": "p1"}]
    assert main.split_finished_jobs(jobs, raw, crawled) == (["j1", "j3", "j4"], ["j2"])


LINKS = [
    {"id": "1", "retailer": "Kmart", "url": "https://www.kmart.com.au/p/1"},
    {"id": "2", "retailer": "Myer", "url": "https://www.myer.com.au/p/2"},
    {"id": "3", "retailer": "Shop", "url": "https://www.bunnings.com.au/p/3"},
]


def _ids(links):
    return [row["id"] for row in links]


def test_filter_links_skips_bot_walled_shops_in_ci(monkeypatch):
    for var in ("CRAWL_RETAILERS", "CRAWL_SKIP_RETAILERS", "CRAWL_PROXY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("CI", "true")
    assert _ids(main.filter_links_by_retailer(LINKS)) == ["2"]


def test_filter_links_keeps_everything_locally(monkeypatch):
    for var in ("CI", "CRAWL_RETAILERS", "CRAWL_SKIP_RETAILERS", "CRAWL_PROXY"):
        monkeypatch.delenv(var, raising=False)
    assert _ids(main.filter_links_by_retailer(LINKS)) == ["1", "2", "3"]


def test_filter_links_only_and_proxy_override_ci_skip(monkeypatch):
    monkeypatch.setenv("CI", "true")
    monkeypatch.setenv("CRAWL_RETAILERS", "kmart")
    assert _ids(main.filter_links_by_retailer(LINKS)) == ["1"]
    monkeypatch.delenv("CRAWL_RETAILERS")
    monkeypatch.setenv("CRAWL_PROXY", "http://proxy.example:8080")
    monkeypatch.setenv("CRAWL_SKIP_RETAILERS", "myer")
    assert _ids(main.filter_links_by_retailer(LINKS)) == ["1", "3"]
