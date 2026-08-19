import json
import os
import random
import re
import time
from decimal import Decimal, ROUND_HALF_UP
from decimal import InvalidOperation as DecimalInvalidOperation
from pathlib import Path
from typing import Any, Iterable, Optional, Tuple
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import create_client

try:
    from playwright_stealth import stealth_sync  # playwright-stealth v1.x
except Exception:
    stealth_sync = None

try:
    from playwright_stealth import Stealth  # playwright-stealth v2.x
except Exception:
    Stealth = None


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def normalise_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def parse_price_decimal(text: str) -> Optional[Decimal]:
    if not text:
        return None

    s = normalise_whitespace(text)

    # Common AU formats:
    # - "$2.50", "A$2.50", "AU$2.50"
    # - "$1,234.56"
    # - "1.234,56" (occasionally)
    s = s.replace("\u00a0", " ")

    # Find the first numeric-ish money token.
    # Note: This intentionally allows commas/spaces as thousand separators.
    m = re.search(
        r"(?<!\d)(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)",
        s,
    )
    if not m:
        return None

    raw = m.group(1).replace(" ", "")

    try:
        # If both separators exist, assume the last one is the decimal separator.
        if "," in raw and "." in raw:
            last_comma = raw.rfind(",")
            last_dot = raw.rfind(".")
            if last_dot > last_comma:
                # 1,234.56 -> remove thousands commas
                raw = raw.replace(",", "")
            else:
                # 1.234,56 -> swap
                raw = raw.replace(".", "").replace(",", ".")
        elif "," in raw and "." not in raw:
            # 2,50 -> decimal comma
            raw = raw.replace(",", ".")
        else:
            # 1,234 -> thousands commas only
            raw = raw.replace(",", "")

        dec = Decimal(raw)
    except DecimalInvalidOperation:
        return None
    except Exception:
        return None

    # Price columns are DECIMAL(10,2) so quantise to 2dp.
    try:
        return dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return None


def walk_price_like_values(node: Any) -> Iterable[Any]:
    """
    Recursively yield any values that look like they might be a "price" field
    inside JSON-LD offers structures.
    """

    if node is None:
        return

    if isinstance(node, dict):
        for k, v in node.items():
            k_lower = str(k).lower()
            if k_lower in {"price", "lowprice", "highprice", "amount"} or k_lower.endswith(
                "price"
            ):
                yield v
            yield from walk_price_like_values(v)
        return

    if isinstance(node, list):
        for item in node:
            yield from walk_price_like_values(item)
        return


def extract_price_from_json_ld(page) -> Optional[Decimal]:
    try:
        script_texts = page.locator('script[type="application/ld+json"]').all_text_contents()
    except Exception:
        return None

    for txt in script_texts:
        txt = normalise_whitespace(txt)
        if not txt:
            continue

        try:
            parsed = json.loads(txt)
        except Exception:
            continue

        for maybe_price in walk_price_like_values(parsed):
            if isinstance(maybe_price, (int, float, str, Decimal)):
                parsed_price = parse_price_decimal(str(maybe_price))
                if parsed_price is not None and parsed_price > 0:
                    return parsed_price

    return None


def build_dom_extractors(retailer: str, url: str) -> Tuple[Tuple[str, Optional[str]], ...]:
    hostname = (urlparse(url).hostname or "").lower()
    r = (retailer or "").lower()

    def specs(*items: Tuple[str, Optional[str]]) -> Tuple[Tuple[str, Optional[str]], ...]:
        return tuple(items)

    if "kmart" in hostname or "kmart" in r:
        return specs(
            ('meta[itemprop="price"]', "content"),
            ('meta[property*="price:amount"]', "content"),
            ('[class*="price"] [class*="amount"]', None),
            ('[class*="price"]', None),
            ('span[class*="price"]', None),
        )

    if "target" in hostname or "target" in r:
        return specs(
            ('meta[itemprop="price"]', "content"),
            ('meta[property*="price:amount"]', "content"),
            ('[class*="price"]', None),
            ('span[class*="price"]', None),
            ('[data-test*="price"]', None),
        )

    if "bigw" in hostname or "bigw" in r:
        return specs(
            ('meta[itemprop="price"]', "content"),
            ('[class*="price"]', None),
            ('span[class*="price"]', None),
        )

    if "col" in hostname or "coles" in r:
        return specs(
            ('meta[itemprop="price"]', "content"),
            ('meta[property*="price:amount"]', "content"),
            ('[class*="price"]', None),
            ('span[class*="price"]', None),
            ('[data-testid*="price"]', None),
        )

    if "woolworths" in hostname or "woolworths" in r:
        return specs(
            ('meta[itemprop="price"]', "content"),
            ('[class*="price"]', None),
            ('span[class*="price"]', None),
            ('[data-test*="price"]', None),
        )

    if "reject" in hostname or "reject" in r or "therejectshop" in hostname:
        return specs(
            ('meta[itemprop="price"]', "content"),
            ('[class*="price"]', None),
            ('span[class*="price"]', None),
        )

    return specs(
        ('meta[itemprop="price"]', "content"),
        ('meta[property*="price:amount"]', "content"),
        ('[class*="price"]', None),
        ('span[class*="price"]', None),
    )


def extract_price_from_dom(page, url: str, retailer: str) -> Optional[Decimal]:
    specs = build_dom_extractors(retailer=retailer, url=url)

    for selector, attr in specs:
        try:
            loc = page.locator(selector)
            if loc.count() < 1:
                continue

            value: Optional[str]
            if attr:
                value = loc.first.get_attribute(attr)
            else:
                value = loc.first.text_content()

            if value:
                dec = parse_price_decimal(value)
                if dec is not None and dec > 0:
                    return dec
        except Exception:
            continue

    # Last-resort: look for currency patterns in the page HTML.
    try:
        html = page.content()
    except Exception:
        return None

    # Prefer explicit currency markers.
    moneyish = re.findall(r"(?:A\$|\$)\s*\d[\d,]*\.?\d{0,2}", html)
    for token in moneyish[:30]:
        dec = parse_price_decimal(token)
        if dec is not None and dec > 0:
            return dec

    return None


def get_active_tracked_links(
    supabase,
    *,
    product_id: Optional[str] = None,
    link_id: Optional[str] = None,
) -> list[dict]:
    query = (
        supabase.table("tracked_links")
        .select("id, product_id, url, retailer, products(name, target_price)")
        .eq("is_active", True)
    )

    if product_id:
        query = query.eq("product_id", product_id)

    if link_id:
        query = query.eq("id", link_id)

    res = query.execute()

    data = getattr(res, "data", None) or res.get("data") or []
    if not isinstance(data, list):
        return []
    return data


def insert_price_history(supabase, link_id: str, price: Decimal) -> None:
    supabase.table("price_history").insert(
        {
            "link_id": link_id,
            "price": str(price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        }
    ).execute()


def parse_uids(env_value: str) -> list[str]:
    parts = re.split(r"[,\s]+", env_value.strip())
    return [p for p in parts if p]


def send_wxpusher_if_enabled(
    *,
    enabled: bool,
    app_token: str,
    uids_env: str,
    product_name: str,
    retailer: str,
    current_price: Decimal,
    target_price: Decimal,
    url: str,
) -> None:
    if not enabled:
        return

    uids = parse_uids(uids_env)
    if not uids:
        print("[WxPusher] ENABLED but WXPUSHER_UIDS is empty.")
        return

    content = (
        f"Price drop alert (AU): {product_name}\n"
        f"Retailer: {retailer}\n"
        f"Now: ${current_price}\n"
        f"Target: ${target_price}\n"
        f"Link: {url}"
    )

    payload = {
        "appToken": app_token,
        "content": content,
        "contentType": 1,
        "uids": uids,
        "url": url,
    }

    r = requests.post(
        "https://wxpusher.zjiecode.com/api/send/message",
        json=payload,
        timeout=30,
    )
    r.raise_for_status()


def run() -> None:
    project_root = Path(__file__).resolve().parent.parent
    load_dotenv(project_root / ".env.local")
    load_dotenv(project_root / ".env")

    supabase_url = get_env("SUPABASE_URL")
    service_role_key = get_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)

    wx_enabled = os.getenv("ENABLE_WXPUSHER", "").strip().lower() in {"1", "true", "yes"}
    wx_app_token = os.getenv("WXPUSHER_APP_TOKEN", "").strip()
    wx_uids = os.getenv("WXPUSHER_UIDS", "").strip()
    crawl_product_id = os.getenv("CRAWL_PRODUCT_ID", "").strip() or None
    crawl_link_id = os.getenv("CRAWL_LINK_ID", "").strip() or None

    try:
        links = get_active_tracked_links(
            supabase, product_id=crawl_product_id, link_id=crawl_link_id
        )
    except Exception as e:
        print(f"[Supabase] Failed to query tracked_links: {e}")
        return

    if not links:
        print("[Crawler] No active tracked links found for the current filter.")
        return

    def crawl_loop(*, page, browser) -> None:
        page.set_default_timeout(60000)
        page.set_default_navigation_timeout(60000)

        try:
            for row in links:
                link_id = str(row.get("id"))
                url = str(row.get("url") or "")
                retailer = str(row.get("retailer") or "")
                product = row.get("products") or {}

                product_name = str(product.get("name") or "")
                target_price_raw = product.get("target_price")

                if not url or target_price_raw is None:
                    print(f"[Skip] link_id={link_id} missing url or target_price")
                    continue

                try:
                    target_price = Decimal(str(target_price_raw)).quantize(Decimal("0.01"))
                except Exception:
                    print(f"[Skip] link_id={link_id} invalid target_price={target_price_raw}")
                    continue

                current_price: Optional[Decimal] = None
                status_code: Optional[int] = None

                try:
                    resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                    status_code = getattr(resp, "status", None)
                except Exception as e:
                    print(f"[NAV_FAIL] link_id={link_id} status={status_code} err={e} url={url}")
                    continue

                if status_code == 404:
                    print(f"[404] link_id={link_id} url={url}")
                    time.sleep(random.uniform(2, 4))
                    continue

                try:
                    current_price = extract_price_from_json_ld(page)
                    if current_price is None:
                        current_price = extract_price_from_dom(
                            page, url=url, retailer=retailer
                        )
                except Exception as e:
                    print(f"[PARSE_FAIL] link_id={link_id} err={e} url={url}")
                    time.sleep(random.uniform(2, 4))
                    continue

                if current_price is None:
                    print(f"[PARSE_FAIL] link_id={link_id} url={url} (no price found)")
                    time.sleep(random.uniform(2, 4))
                    continue

                try:
                    insert_price_history(supabase, link_id=link_id, price=current_price)
                except Exception as e:
                    print(f"[DB_FAIL] link_id={link_id} price={current_price} err={e}")

                if current_price <= target_price:
                    print(
                        f"[TARGET_HIT] {product_name} at {retailer}: ${current_price} <= ${target_price}"
                    )
                    try:
                        send_wxpusher_if_enabled(
                            enabled=wx_enabled,
                            app_token=wx_app_token,
                            uids_env=wx_uids,
                            product_name=product_name,
                            retailer=retailer,
                            current_price=current_price,
                            target_price=target_price,
                            url=url,
                        )
                    except Exception as e:
                        print(f"[WxPusher_FAIL] link_id={link_id} err={e}")

                time.sleep(random.uniform(2, 4))

        finally:
            try:
                browser.close()
            except Exception:
                pass

    if stealth_sync:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page()
            try:
                stealth_sync(page)
            except Exception:
                pass
            crawl_loop(page=page, browser=browser)
        return

    if Stealth:
        with Stealth().use_sync(sync_playwright()) as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page()
            crawl_loop(page=page, browser=browser)
        return

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()
        crawl_loop(page=page, browser=browser)


if __name__ == "__main__":
    run()

