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
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
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
        return (
            ('[data-testid="product-price"]', None),
            ('[data-testid="price"]', None),
            ('[class*="Price__amount" i]', None),
        ) + generic
    if matches("bigw", "big w"):
        return (
            ('[data-testid="price"]', None),
            ('[data-testid="product-price"]', None),
        ) + generic
    if matches("coles.com.au", "coles"):
        return (('[data-testid="product-pricing"]', None),) + generic
    if matches("woolworths"):
        return (('.shelfProductTile-priceDollars', None),) + generic
    if matches("target.com.au"):
        # Confirmed against a live PDP: the old "product-price" hook is gone.
        return (
            ('[data-test="current-price"]', None),
            ('[data-test="price-ticket"]', None),
            ('[data-test="price"]', None),
        ) + generic
    if matches("therejectshop", "reject shop"):
        return (('[class*="product-price" i]', None),) + generic
    if matches("toymate"):
        # BigCommerce stencil: price lives in .price--withoutTax / meta itemprop.
        return (
            ('.price--withoutTax', None),
            ('[data-product-price-without-tax]', None),
            ('.productView-price .price', None),
        ) + generic
    if matches("toysrus", "toys r us"):
        # Shopify theme: sale / regular price blocks.
        return (
            ('.price__sale .price-item--sale', None),
            ('.price__regular .price-item--regular', None),
            ('[data-product-price]', None),
            ('.product__price', None),
        ) + generic

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
        "toymate": "Toymate",
        "toysrus": "Toys R Us",
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


def _retailer_needles(variable: str) -> set:
    raw = os.getenv(variable, "")
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def _link_matches(row: dict, needles: set) -> bool:
    hostname = urlparse(str(row.get("url") or "")).hostname or ""
    haystack = f"{row.get('retailer') or ''} {hostname}".lower()
    return any(needle in haystack for needle in needles)


def filter_links_by_retailer(links: list) -> list:
    """Split the work between machines.

    Kmart and Target only answer a browser driven from a desktop session, so the
    scheduled cloud run skips them and a local run picks them up.
    """

    only = _retailer_needles("CRAWL_RETAILERS")
    skip = _retailer_needles("CRAWL_SKIP_RETAILERS")

    if only:
        links = [row for row in links if _link_matches(row, only)]
    if skip:
        links = [row for row in links if not _link_matches(row, skip)]

    return links


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


def want_stealth() -> bool:
    """Stealth patches cut both ways: some walls fingerprint the patches."""

    return os.getenv("CRAWL_STEALTH", "1").strip().lower() not in {"0", "false", "no"}


def open_browser_page(playwright_factory):
    """Return (context_manager, needs_manual_stealth) for the installed version."""

    if not want_stealth():
        return playwright_factory, False
    if Stealth is not None:
        return Stealth().use_sync(playwright_factory), False
    return playwright_factory, True


# Where a normal Chrome or Edge install lives, best first. Driving one of these
# ourselves is the only configuration that gets past Kmart and Target.
BROWSER_EXECUTABLES = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    str(Path.home() / r"AppData\Local\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
)


def find_browser_executable() -> Optional[str]:
    override = os.getenv("CRAWL_BROWSER_PATH", "").strip()
    if override:
        return override if Path(override).exists() else None

    for candidate in BROWSER_EXECUTABLES:
        if Path(candidate).exists():
            return candidate
    return None


def browser_mode() -> str:
    """`cdp` drives a hand-started browser, `launch` lets Playwright start one.

    cdp is the default because it is the only one Kmart and Target answer, and
    it clears Big W more reliably too. It needs a real Chrome or Edge and a
    display; without either, the caller falls back to launch.
    """

    mode = os.getenv("CRAWL_BROWSER_MODE", "cdp").strip().lower()
    return mode if mode in {"cdp", "launch"} else "cdp"


LAUNCH_ARGS = [
    # Without this the CDP-driven browser advertises navigator.webdriver, which
    # is the cheapest signal bot walls look for.
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
]

# Deliberately minimal. The whole point of this mode is to look like a browser a
# person opened, so anything that smells of automation stays out.
CDP_ARGS = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--lang=en-AU",
    "--window-size=1366,900",
]

# Ordered best to worst. The last entry is the trap: with no channel Playwright
# >= 1.49 starts chrome-headless-shell, the old headless build, and Akamai
# refuses it on sight. Measured on Big W: headless shell gets 403, every other
# entry here gets 200.
BROWSER_CHANNELS: Tuple[Optional[str], ...] = ("chrome", "msedge", "chromium", None)


def browser_proxy() -> Optional[dict]:
    """Optional egress proxy: some walls judge the IP before anything else."""

    server = os.getenv("CRAWL_PROXY", "").strip()
    if not server:
        return None

    proxy = {"server": server}
    username = os.getenv("CRAWL_PROXY_USERNAME", "").strip()
    if username:
        proxy["username"] = username
        proxy["password"] = os.getenv("CRAWL_PROXY_PASSWORD", "")
    return proxy


def want_headless() -> bool:
    """Headful is worth the trouble: some walls reject headless outright.

    Under CI wrap the run in xvfb-run so this still has a display to draw on.
    """

    return os.getenv("CRAWL_HEADLESS", "1").strip().lower() not in {"0", "false", "no"}


def launch_browser(playwright) -> Tuple[Any, str]:
    """Launch the most credible Chromium build available, loudly."""

    proxy = browser_proxy()
    if proxy:
        print(f"[BROWSER] routing through proxy {proxy['server']}")

    headless = want_headless()
    failures = []
    for channel in BROWSER_CHANNELS:
        kwargs: dict = {"headless": headless, "args": LAUNCH_ARGS}
        if channel:
            kwargs["channel"] = channel
        if proxy:
            kwargs["proxy"] = proxy

        try:
            browser = playwright.chromium.launch(**kwargs)
        except Exception as error:
            first_line = str(error).strip().splitlines()[0]
            failures.append(f"{channel or 'headless-shell'} -> {first_line}")
            continue

        label = channel or "headless-shell"
        mode = "headless" if headless else "headful"
        print(f"[BROWSER] channel={label} mode={mode} version={browser.version}")
        if channel is None:
            print(
                "[WARN] Only chrome-headless-shell was available. Bot walls block it; "
                "run `playwright install chrome` so a branded build is present."
            )
        return browser, label

    raise RuntimeError("No Chromium build could be launched:\n  " + "\n  ".join(failures))


def desktop_user_agent(browser) -> str:
    """Borrow the launched build's version and drop the Headless marker.

    Pinning a version by hand is worse than not overriding at all: Chrome still
    sends Sec-CH-UA with its real major version, so a stale string contradicts
    the browser's own headers and marks the session as forged.
    """

    major = (browser.version or "").split(".")[0]
    if not major.isdigit():
        major = "141"

    return (
        f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        f"(KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"
    )


# Statuses a bot wall returns rather than the shop genuinely losing the page.
BLOCKED_STATUSES = {403, 429, 503}

# Bot walls often answer 200 and put the refusal in the body, so the status code
# alone cannot tell "blocked" apart from "layout changed".
BLOCK_MARKERS = (
    "access denied",
    "pardon our interruption",
    "attention required",
    "just a moment",
    "are you a human",
    "request unsuccessful",
)


def detect_block(page) -> Optional[str]:
    """Return a short reason when the page is a bot wall rather than a product."""

    try:
        title = (page.title() or "").strip()
    except Exception:
        return None

    lowered = title.lower()
    for marker in BLOCK_MARKERS:
        if marker in lowered:
            return title or marker

    # Akamai's denial page is a couple of hundred bytes and names its edge host.
    try:
        body = page.content()
    except Exception:
        return None

    if len(body) < 3000 and "errors.edgesuite.net" in body:
        return title or "Akamai edge denial"

    return None


DIAGNOSTICS_DIR = Path(__file__).resolve().parent.parent / "crawler-diagnostics"


def save_page_snapshot(page, *, label: str) -> None:
    """Keep the evidence: a failed run is unreadable without the actual page.

    CI uploads this directory, which is the only way to tell a bot wall apart
    from a redesigned page after the fact.
    """

    if os.getenv("CRAWL_SAVE_SNAPSHOTS", "1").strip().lower() in {"0", "false", "no"}:
        return

    safe = re.sub(r"[^a-z0-9._-]+", "_", label.lower()) or "page"
    stamp = time.strftime("%H%M%S")

    try:
        DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
        (DIAGNOSTICS_DIR / f"{safe}-{stamp}.html").write_text(
            page.content(), encoding="utf-8"
        )
        page.screenshot(path=str(DIAGNOSTICS_DIR / f"{safe}-{stamp}.png"), full_page=False)
        print(f"[DIAG] saved snapshot for {label} to {DIAGNOSTICS_DIR.name}/{safe}-{stamp}.*")
    except Exception as error:
        print(f"[WARN] Could not save snapshot for {label}: {error}")


def _human_like_warmup(page, origin: str) -> None:
    """Visit the origin and behave like a real visitor for a few seconds."""
    try:
        page.goto(origin, wait_until="domcontentloaded", timeout=45000)
    except Exception:
        return

    page.wait_for_timeout(random.randint(1500, 2500))

    # Simulate light scrolling and mouse movement
    try:
        page.mouse.move(random.randint(200, 800), random.randint(200, 500))
        page.evaluate("window.scrollBy(0, %d)" % random.randint(100, 400))
        page.wait_for_timeout(random.randint(800, 1500))
        page.evaluate("window.scrollBy(0, %d)" % random.randint(-50, 200))
    except Exception:
        pass

    # Accept cookie banners that many AU retailers show
    for selector in (
        'button:has-text("Accept")',
        'button:has-text("Got it")',
        'button:has-text("OK")',
        '[id*="cookie" i] button',
        '[class*="cookie" i] button',
    ):
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=500):
                btn.click()
                page.wait_for_timeout(random.randint(500, 1000))
                break
        except Exception:
            continue

    page.wait_for_timeout(random.randint(1000, 2000))


WARMUP_HOSTS = ("bigw", "coles", "woolworths", "kmart", "target", "therejectshop")


def goto_with_retry(page, url: str, *, attempts: int = 3):
    """Navigate to url, working around bot walls.

    Sites behind Akamai reject a cold request but let the same browser through
    once it holds cookies from the site's own home page, so each retry warms up
    on the origin first.

    Returns (status, error, block_reason). block_reason is set when the shop
    served a refusal page, which it may do under any status code.
    """

    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.hostname}"
    status: Optional[int] = None
    error: Optional[Exception] = None
    block: Optional[str] = None

    hostname = (parsed.hostname or "").lower()
    needs_warmup = any(k in hostname for k in WARMUP_HOSTS)

    for attempt in range(attempts):
        if attempt or needs_warmup:
            _human_like_warmup(page, origin)
            needs_warmup = False  # only once

        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=60000)
            error = None
        except Exception as nav_error:
            error = nav_error
            time.sleep(random.uniform(2, 4))
            continue

        status = getattr(response, "status", None)

        if status is None or status < 400:
            # Give JS-heavy pages a moment to render price elements, and any
            # interstitial challenge a moment to hand over the real page.
            page.wait_for_timeout(random.randint(2000, 4000))
            block = detect_block(page)
            if block is None:
                return status, None, None
        elif status not in BLOCKED_STATUSES:
            return status, None, None
        else:
            block = detect_block(page) or f"HTTP {status}"

        print(
            f"[RETRY] blocked ({block}, HTTP {status}) at {url} "
            f"(attempt {attempt + 1}/{attempts})"
        )
        time.sleep(random.uniform(3, 6))

    return status, error, block


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _wait_for_cdp(port: int, *, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/json/version", timeout=2
            ):
                return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.5)
    return False


def start_browser_process(port: int) -> Optional[subprocess.Popen]:
    """Start an ordinary browser window with a debugging port open.

    Measured against Kmart and Target: a browser Playwright launches is refused
    even headful and even with stealth off, while the same build started this
    way is served normally. Headless loses it again, so this mode needs a
    display; under CI that means xvfb-run.
    """

    executable = find_browser_executable()
    if not executable:
        print("[BROWSER] cdp mode: no Chrome or Edge install found")
        return None

    profile = os.getenv("CRAWL_BROWSER_PROFILE", "").strip() or str(
        Path.home() / ".pricetracker-browser"
    )

    command = [
        executable,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile}",
        *CDP_ARGS,
    ]

    # CI images run the browser without a usable sandbox; desktops do not need
    # this and are better off keeping it on.
    if os.name != "nt" and os.getenv("CI"):
        command += ["--no-sandbox", "--disable-dev-shm-usage"]

    command.append("about:blank")

    try:
        process = subprocess.Popen(
            command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
    except Exception as error:
        print(f"[BROWSER] cdp mode: could not start {executable}: {error}")
        return None

    if not _wait_for_cdp(port):
        print(f"[BROWSER] cdp mode: {executable} never opened port {port}")
        process.terminate()
        return None

    print(f"[BROWSER] cdp mode: driving {Path(executable).name} (profile {profile})")
    return process


def _prepare_page(page) -> None:
    page.set_default_timeout(60000)
    page.set_default_navigation_timeout(60000)


def run_with_cdp_page(handler) -> bool:
    """Drive a hand-started browser. Returns False if it could not be set up."""

    port = _free_port()
    process = start_browser_process(port)
    if process is None:
        return False

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
            # Reuse the window's own context. A fresh one would drop the profile's
            # cookies, which is half of why this mode gets through.
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.pages[0] if context.pages else context.new_page()
            _prepare_page(page)

            try:
                handler(page)
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    finally:
        try:
            process.terminate()
            process.wait(timeout=10)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass

    return True


def run_with_launched_page(handler) -> None:
    factory, manual_stealth = open_browser_page(sync_playwright())

    with factory as playwright:
        browser, _channel = launch_browser(playwright)
        context = browser.new_context(
            locale="en-AU",
            timezone_id="Australia/Sydney",
            viewport={"width": 1366, "height": 900},
            user_agent=desktop_user_agent(browser),
            # Chrome sets Sec-Fetch-* per request, so overriding them here would
            # send "navigate" on XHRs and give the automation away. Sec-CH-UA is
            # left alone too: the browser's own value matches what JS reports,
            # and a hand-written one would not.
            extra_http_headers={"Accept-Language": "en-AU,en;q=0.9"},
        )
        page = context.new_page()

        if manual_stealth and stealth_sync is not None:
            try:
                stealth_sync(page)
            except Exception:
                pass

        _prepare_page(page)

        try:
            handler(page)
        finally:
            try:
                browser.close()
            except Exception:
                pass


def run_with_page(handler) -> None:
    if browser_mode() == "cdp" and run_with_cdp_page(handler):
        return

    if browser_mode() == "cdp":
        print("[BROWSER] falling back to a Playwright-launched browser")

    run_with_launched_page(handler)


def run_test_mode(test_url: str) -> None:
    retailer = infer_retailer_from_hostname(urlparse(test_url).hostname or "")

    def handler(page) -> None:
        status, error, block = goto_with_retry(page, test_url)

        if error is not None:
            print(f"[TEST_NAV_FAIL] url={test_url} err={error}")
            return

        if block:
            print(f"[TEST_BLOCKED] url={test_url} status={status} reason={block!r}")
            save_page_snapshot(page, label=urlparse(test_url).hostname or "page")
            return

        if status and status >= 400:
            print(f"[TEST_HTTP_{status}] url={test_url}")
            return

        price, source = scrape_price(page, url=test_url, retailer=retailer)
        print(f"[TEST_RESULT] url={test_url} retailer={retailer} price={price} source={source}")

        if price is None:
            save_page_snapshot(page, label=urlparse(test_url).hostname or "page")

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

    links = filter_links_by_retailer(links)

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

            status, nav_error, block = goto_with_retry(page, url)

            if nav_error is not None:
                stats["failed"] += 1
                log_event(
                    supabase,
                    level="error",
                    message=f"{product_name} at {retailer}: page would not load ({nav_error}).",
                    link_id=link_id,
                )
                time.sleep(random.uniform(2, 4))
                continue

            blocked = bool(block) or (bool(status) and status in BLOCKED_STATUSES)

            if status and status >= 400 and not blocked:
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

            # A blocked response still gets one parse attempt: some bot walls
            # answer 403 while serving the real page underneath.
            try:
                price, source = scrape_price(page, url=url, retailer=retailer)
            except Exception as error:
                price, source = None, "ERROR"
                print(f"[WARN] scrape failed for {url}: {error}")

            if price is None:
                stats["failed"] += 1
                ci_hint = (
                    " (GitHub Actions IPs are blocked by Akamai at the network level —"
                    " set CRAWL_SKIP_RETAILERS=kmart,target,bigw and run those from a"
                    " local machine or configure CRAWL_PROXY)"
                    if (blocked and os.getenv("CI") and any(
                        k in (urlparse(url).hostname or "").lower()
                        for k in ("bigw", "kmart", "target")
                    ))
                    else ""
                )
                message = (
                    f"{product_name} at {retailer}: the shop blocked our price check "
                    f"({block or f'HTTP {status}'}). The link is probably fine; "
                    f"we will try again next run.{ci_hint}"
                    if blocked
                    else (
                        f"{product_name} at {retailer}: could not find a price on the page. "
                        "The shop may have changed its layout or the item is out of stock."
                    )
                )
                log_event(supabase, level="warning", message=message, link_id=link_id)
                save_page_snapshot(page, label=f"{retailer}-{link_id}")
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
