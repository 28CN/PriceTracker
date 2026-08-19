"""Crawls Australian retailer pages and records prices in Supabase.

Run it plain to crawl every active link:
    python crawler/main.py

Filter it with environment variables:
    CRAWL_PRODUCT_ID / CRAWL_LINK_ID   only crawl one product or one link
    TEST_URL                           parse a single page and print the result
"""

import json
import os
import random
import re
import time
from decimal import Decimal, ROUND_HALF_UP
from decimal import InvalidOperation as DecimalInvalidOperation
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional, Tuple
from urllib.parse import urlparse

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import create_client

try:
    from playwright_stealth import Stealth  # playwright-stealth v2.x
except Exception:
    Stealth = None

try:
    from playwright_stealth import stealth_sync  # playwright-stealth v1.x
except Exception:
    stealth_sync = None


PRICE_KEYS = {"price", "lowprice", "amount"}


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_price_decimal(text: Any) -> Optional[Decimal]:
    """Pull a plain 2dp figure out of anything that looks like AU money."""

    if text is None:
        return None

    s = re.sub(r"\s+", " ", str(text)).strip().replace("\u00a0", " ")
    if not s:
        return None

    match = re.search(
        r"(?<!\d)(\d{1,3}(?:,\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)",
        s,
    )
    if not match:
        return None

    raw = match.group(1)

    if "," in raw and "." in raw:
        if raw.rfind(".") > raw.rfind(","):
            raw = raw.replace(",", "")
        else:
            raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        # A lone comma is a thousands separator when three digits follow it.
        raw = raw.replace(",", "") if re.search(r",\d{3}(?!\d)", raw) else raw.replace(",", ".")

    try:
        return Decimal(raw).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (DecimalInvalidOperation, ValueError, ArithmeticError):
        return None


def iter_json_ld_nodes(node: Any) -> Iterator[dict]:
    """Walk a JSON-LD document, including @graph and nested item lists."""

    if isinstance(node, list):
        for item in node:
            yield from iter_json_ld_nodes(item)
        return

    if not isinstance(node, dict):
        return

    yield node

    for key in ("@graph", "mainEntity", "itemListElement", "hasVariant"):
        if key in node:
            yield from iter_json_ld_nodes(node[key])


def node_is_product(node: dict) -> bool:
    raw_type = node.get("@type")
    types = raw_type if isinstance(raw_type, list) else [raw_type]
    return any(isinstance(t, str) and "product" in t.lower() for t in types)


def price_from_offers(offers: Any) -> Optional[Decimal]:
    for candidate in offers if isinstance(offers, list) else [offers]:
        if not isinstance(candidate, dict):
            continue

        for key in ("price", "lowPrice"):
            if key in candidate:
                parsed = parse_price_decimal(candidate.get(key))
                if parsed and parsed > 0:
                    return parsed

        spec = candidate.get("priceSpecification")
        if spec is not None:
            parsed = price_from_offers(spec)
            if parsed:
                return parsed

    return None


def walk_price_like_values(node: Any) -> Iterable[Any]:
    if isinstance(node, dict):
        for key, value in node.items():
            if str(key).lower() in PRICE_KEYS:
                yield value
            yield from walk_price_like_values(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk_price_like_values(item)


def extract_price_from_json_ld(page) -> Optional[Decimal]:
    try:
        blocks = page.locator('script[type="application/ld+json"]').all_text_contents()
    except Exception:
        return None

    documents = []
    for block in blocks:
        block = (block or "").strip()
        if not block:
            continue
        try:
            documents.append(json.loads(block))
        except Exception:
            continue

    # A Product node is far more trustworthy than any stray price field, so
    # give those a full pass before falling back to a loose search.
    for document in documents:
        for node in iter_json_ld_nodes(document):
            if node_is_product(node) and "offers" in node:
                parsed = price_from_offers(node["offers"])
                if parsed:
                    return parsed

    for document in documents:
        for value in walk_price_like_values(document):
            if isinstance(value, (int, float, str)):
                parsed = parse_price_decimal(value)
                if parsed and parsed > 0:
                    return parsed

    return None


def build_dom_extractors(retailer: str, url: str) -> Tuple[Tuple[str, Optional[str]], ...]:
    hostname = (urlparse(url).hostname or "").lower()
    name = (retailer or "").lower()

    generic: Tuple[Tuple[str, Optional[str]], ...] = (
        ('meta[itemprop="price"]', "content"),
        ('meta[property="product:price:amount"]', "content"),
        ('[itemprop="price"]', "content"),
        ('[data-testid*="price" i]', None),
        ('[data-test*="price" i]', None),
        ('[class*="price" i] [class*="amount" i]', None),
        ('[class*="product-price" i]', None),
        ('[class*="price" i]', None),
    )

    def matches(*needles: str) -> bool:
        return any(needle in hostname or needle in name for needle in needles)

    if matches("kmart"):
        return (('[data-testid="product-price"]', None),) + generic
    if matches("bigw", "big w"):
        return (('[data-testid="price"]', None),) + generic
    if matches("coles.com.au", "coles"):
        return (('[data-testid="product-pricing"]', None),) + generic
    if matches("woolworths"):
        return (('.shelfProductTile-priceDollars', None),) + generic
    if matches("target.com.au"):
        return (('[data-test="product-price"]', None),) + generic
    if matches("therejectshop", "reject shop"):
        return (('[class*="product-price" i]', None),) + generic

    return generic


def extract_price_from_dom(page, url: str, retailer: str) -> Optional[Decimal]:
    for selector, attribute in build_dom_extractors(retailer=retailer, url=url):
        try:
            locator = page.locator(selector)
            if locator.count() < 1:
                continue

            value = (
                locator.first.get_attribute(attribute)
                if attribute
                else locator.first.text_content()
            )
        except Exception:
            continue

        parsed = parse_price_decimal(value)
        if parsed and parsed > 0:
            return parsed

    # Deliberately no whole-page "$" regex here. Grabbing the first dollar sign
    # on the page tends to catch delivery thresholds and promo banners, and a
    # silently wrong price is worse than a missing one.
    return None


def scrape_price(page, *, url: str, retailer: str) -> Tuple[Optional[Decimal], str]:
    price = extract_price_from_json_ld(page)
    if price is not None:
        return price, "JSON_LD"

    price = extract_price_from_dom(page, url=url, retailer=retailer)
    if price is not None:
        return price, "DOM"

    return None, "NONE"


def infer_retailer_from_hostname(hostname: str) -> str:
    h = (hostname or "").lower()
    known = {
        "kmart": "Kmart",
        "target": "Target",
        "bigw": "Big W",
        "coles": "Coles",
        "woolworths": "Woolworths",
        "therejectshop": "The Reject Shop",
    }
    for needle, label in known.items():
        if needle in h:
            return label
    return hostname or "Unknown"


def response_data(res) -> list:
    """supabase-py returns an object with .data; empty results are still valid."""

    data = getattr(res, "data", None)
    if data is None and isinstance(res, dict):
        data = res.get("data")
    return data if isinstance(data, list) else []


def get_active_tracked_links(
    supabase,
    *,
    product_id: Optional[str] = None,
    link_id: Optional[str] = None,
) -> list:
    query = (
        supabase.table("tracked_links")
        .select("id, product_id, url, retailer, products(name, target_price)")
        .eq("is_active", True)
    )

    if product_id:
        query = query.eq("product_id", product_id)
    if link_id:
        query = query.eq("id", link_id)

    return response_data(query.execute())


def insert_price_history(supabase, *, link_id: str, price: Decimal) -> None:
    supabase.table("price_history").insert(
        {"link_id": link_id, "price": str(price)}
    ).execute()


def log_event(supabase, *, level: str, message: str, link_id: Optional[str] = None) -> None:
    """Mirror important log lines into the table the website's bell reads."""

    print(f"[{level.upper()}] {message}")
    try:
        supabase.table("crawl_events").insert(
            {"link_id": link_id, "level": level, "message": message}
        ).execute()
    except Exception as error:
        print(f"[WARN] Could not record notification: {error}")


def open_browser_page(playwright_factory):
    """Return (context_manager, needs_manual_stealth) for the installed version."""

    if Stealth is not None:
        return Stealth().use_sync(playwright_factory), False
    return playwright_factory, True


def run_with_page(handler) -> None:
    factory, manual_stealth = open_browser_page(sync_playwright())

    with factory as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            locale="en-AU",
            timezone_id="Australia/Sydney",
            viewport={"width": 1366, "height": 900},
        )
        page = context.new_page()

        if manual_stealth and stealth_sync is not None:
            try:
                stealth_sync(page)
            except Exception:
                pass

        page.set_default_timeout(60000)
        page.set_default_navigation_timeout(60000)

        try:
            handler(page)
        finally:
            try:
                browser.close()
            except Exception:
                pass


def run_test_mode(test_url: str) -> None:
    retailer = infer_retailer_from_hostname(urlparse(test_url).hostname or "")

    def handler(page) -> None:
        try:
            response = page.goto(test_url, wait_until="domcontentloaded", timeout=60000)
        except Exception as error:
            print(f"[TEST_NAV_FAIL] url={test_url} err={error}")
            return

        status = getattr(response, "status", None)
        if status and status >= 400:
            print(f"[TEST_HTTP_{status}] url={test_url}")
            return

        price, source = scrape_price(page, url=test_url, retailer=retailer)
        print(f"[TEST_RESULT] url={test_url} retailer={retailer} price={price} source={source}")

    run_with_page(handler)


def run() -> None:
    project_root = Path(__file__).resolve().parent.parent
    load_dotenv(project_root / ".env.local")
    load_dotenv(project_root / ".env")

    test_url = os.getenv("TEST_URL", "").strip()
    if test_url:
        run_test_mode(test_url)
        return

    supabase = create_client(get_env("SUPABASE_URL"), get_env("SUPABASE_SERVICE_ROLE_KEY"))

    product_filter = os.getenv("CRAWL_PRODUCT_ID", "").strip() or None
    link_filter = os.getenv("CRAWL_LINK_ID", "").strip() or None

    try:
        links = get_active_tracked_links(
            supabase, product_id=product_filter, link_id=link_filter
        )
    except Exception as error:
        print(f"[ERROR] Could not read tracked_links: {error}")
        return

    if not links:
        print("[INFO] No active tracked links matched the current filter.")
        return

    stats = {"ok": 0, "failed": 0}

    def handler(page) -> None:
        for row in links:
            link_id = str(row.get("id"))
            url = str(row.get("url") or "")
            retailer = str(row.get("retailer") or "") or infer_retailer_from_hostname(
                urlparse(url).hostname or ""
            )
            product = row.get("products") or {}
            product_name = str(product.get("name") or "this product")
            target_price = parse_price_decimal(product.get("target_price"))

            if not url:
                log_event(
                    supabase,
                    level="warning",
                    message=f"{product_name}: a tracked link has no URL saved.",
                    link_id=link_id,
                )
                continue

            try:
                response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                status = getattr(response, "status", None)
            except Exception as error:
                stats["failed"] += 1
                log_event(
                    supabase,
                    level="error",
                    message=f"{product_name} at {retailer}: page would not load ({error}).",
                    link_id=link_id,
                )
                time.sleep(random.uniform(2, 4))
                continue

            if status and status >= 400:
                stats["failed"] += 1
                log_event(
                    supabase,
                    level="error",
                    message=(
                        f"{product_name} at {retailer}: link looks dead (HTTP {status}). "
                        "It may need replacing."
                    ),
                    link_id=link_id,
                )
                time.sleep(random.uniform(2, 4))
                continue

            try:
                price, source = scrape_price(page, url=url, retailer=retailer)
            except Exception as error:
                price, source = None, "ERROR"
                print(f"[WARN] scrape failed for {url}: {error}")

            if price is None:
                stats["failed"] += 1
                log_event(
                    supabase,
                    level="warning",
                    message=(
                        f"{product_name} at {retailer}: could not find a price on the page. "
                        "The shop may have changed its layout or the item is out of stock."
                    ),
                    link_id=link_id,
                )
                time.sleep(random.uniform(2, 4))
                continue

            try:
                insert_price_history(supabase, link_id=link_id, price=price)
                stats["ok"] += 1
                print(f"[OK] {product_name} at {retailer}: ${price} (via {source})")
            except Exception as error:
                stats["failed"] += 1
                log_event(
                    supabase,
                    level="error",
                    message=f"{product_name} at {retailer}: could not save price ({error}).",
                    link_id=link_id,
                )

            if target_price is not None and price <= target_price:
                print(f"[TARGET_HIT] {product_name} at {retailer}: ${price} <= ${target_price}")

            time.sleep(random.uniform(2, 4))

    run_with_page(handler)

    if stats["failed"]:
        log_event(
            supabase,
            level="info",
            message=(
                f"Crawl finished: {stats['ok']} price(s) updated, "
                f"{stats['failed']} link(s) had trouble."
            ),
        )

    print(f"[DONE] updated={stats['ok']} failed={stats['failed']}")


if __name__ == "__main__":
    run()
