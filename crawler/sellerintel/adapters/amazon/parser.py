from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from parsel import Selector

from sellerintel.adapters.base import (
    AdapterDecision,
    AdapterRequest,
    AdapterResponse,
    IdentityCandidate,
    PolicyBackedAdapter,
    Seed,
)
from sellerintel.config.sources import DEFAULT_SOURCE_POLICIES
from sellerintel.normalization.country import normalize_country_code
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.normalization.text import normalize_whitespace

AMAZON_PARSER_VERSION = "amazon-public-v1"
ASIN_PATTERN = re.compile(r"(?<![A-Z0-9])([A-Z0-9]{10})(?![A-Z0-9])", re.I)
MERCHANT_PATTERN = re.compile(r"^[A-Z0-9]{6,32}$", re.I)
EXTERNAL_WEBSITE_LABELS = ("company website", "official website", "website", "web site")
SOCIAL_DOMAINS = frozenset(
    {
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "pinterest.com",
        "tiktok.com",
        "twitter.com",
        "x.com",
        "youtube.com",
    }
)


@dataclass(frozen=True, slots=True)
class AmazonMarketplace:
    code: str
    domain: str
    label: str


SUPPORTED_AMAZON_MARKETPLACES: tuple[AmazonMarketplace, ...] = (
    AmazonMarketplace("amazon.com", "www.amazon.com", "Amazon.com"),
    AmazonMarketplace("amazon.co.uk", "www.amazon.co.uk", "Amazon.co.uk"),
    AmazonMarketplace("amazon.ca", "www.amazon.ca", "Amazon.ca"),
    AmazonMarketplace("amazon.com.au", "www.amazon.com.au", "Amazon.com.au"),
    AmazonMarketplace("amazon.de", "www.amazon.de", "Amazon.de"),
    AmazonMarketplace("amazon.fr", "www.amazon.fr", "Amazon.fr"),
    AmazonMarketplace("amazon.it", "www.amazon.it", "Amazon.it"),
    AmazonMarketplace("amazon.es", "www.amazon.es", "Amazon.es"),
)


@dataclass(frozen=True, slots=True)
class AmazonProductIdentity:
    marketplace: str
    asin: str
    product_url: str
    title: str | None = None
    brand: str | None = None
    seller_display_name: str | None = None
    merchant_token: str | None = None
    seller_profile_url: str | None = None
    category: str | None = None


@dataclass(frozen=True, slots=True)
class AmazonSellerIdentity:
    marketplace: str
    merchant_token: str | None
    display_name: str | None
    business_name: str | None
    profile_url: str
    storefront_url: str | None
    public_location: str | None
    country_code: str | None
    official_website_url: str | None
    manufacturer_score: int
    trader_score: int


class AmazonSourceAdapter(PolicyBackedAdapter):
    """Approved public-page Amazon identity adapter; never extracts contacts."""

    def __init__(self) -> None:
        policy = next(
            policy for policy in DEFAULT_SOURCE_POLICIES if policy.adapter_name == "amazon"
        )
        super().__init__(policy)

    def explain_url_policy(self, url: str) -> AdapterDecision:
        decision = super().explain_url_policy(url)
        if not decision.allowed:
            return decision
        try:
            marketplace_for(urlparse(url).hostname or "")
        except ValueError:
            return AdapterDecision(False, "URL is not a supported Amazon marketplace host.")
        return AdapterDecision(True, "Allowed supported Amazon public page.")

    def build_requests(self, seed: Seed):  # type: ignore[no-untyped-def]
        if not self.is_allowed(seed.url):
            return ()
        return (
            AdapterRequest(
                url=canonicalize_amazon_url(seed.url),
                adapter_name=self.name,
                metadata={"seller_id": seed.seller_id or ""},
            ),
        )

    def parse_identity(self, response: AdapterResponse) -> list[IdentityCandidate]:
        marketplace = marketplace_for(urlparse(response.url).hostname or "")
        seller = parse_seller_page(response.text, response.url, marketplace.code)
        values = {
            "merchant_token": seller.merchant_token,
            "seller_display_name": seller.display_name,
            "business_name": seller.business_name,
            "public_location": seller.public_location,
            "official_website": seller.official_website_url,
        }
        return [
            IdentityCandidate(response.url, field, value, 85 if field == "merchant_token" else 70)
            for field, value in values.items()
            if value
        ]


def marketplace_for(value: str) -> AmazonMarketplace:
    hostname = value.casefold().rstrip(".")
    if "://" in hostname:
        hostname = (urlparse(hostname).hostname or "").casefold()
    for marketplace in SUPPORTED_AMAZON_MARKETPLACES:
        if hostname in {marketplace.domain, marketplace.code}:
            return marketplace
    raise ValueError("Unsupported Amazon marketplace")


def build_search_url(marketplace: str, query: str, *, page: int = 1) -> str:
    selected = marketplace_for(marketplace)
    cleaned = normalize_whitespace(query)
    if not 2 <= len(cleaned) <= 100:
        raise ValueError("Amazon query must contain 2 to 100 characters")
    if not 1 <= page <= 3:
        raise ValueError("Amazon result page must be between 1 and 3")
    parameters = {"k": cleaned}
    if page > 1:
        parameters["page"] = str(page)
    return f"https://{selected.domain}/s?{urlencode(parameters)}"


def parse_search_page(
    html: str,
    page_url: str,
    marketplace: str,
) -> tuple[AmazonProductIdentity, ...]:
    selected = marketplace_for(marketplace)
    selector = _html_selector(html)
    products: list[AmazonProductIdentity] = []
    seen: set[str] = set()
    for result in selector.css("div[data-asin]"):
        asin = (result.attrib.get("data-asin") or "").strip().upper()
        if not ASIN_PATTERN.fullmatch(asin) or asin in seen:
            continue
        href = _first(
            result.css(
                "h2 a::attr(href), a.a-link-normal[href*='/dp/']::attr(href)"
            ).getall()
        )
        if not href:
            continue
        product_url = canonical_product_url(urljoin(page_url, href), selected)
        if product_url is None:
            continue
        title = _first_text(result.css("h2 span::text, h2::text").getall())
        seen.add(asin)
        products.append(
            AmazonProductIdentity(
                marketplace=selected.code,
                asin=asin,
                product_url=product_url,
                title=title,
            )
        )
    return tuple(products)


def parse_product_page(html: str, page_url: str, marketplace: str) -> AmazonProductIdentity:
    selected = marketplace_for(marketplace)
    selector = _html_selector(html)
    asin = _asin_from_page(selector, page_url)
    if asin is None:
        raise ValueError("Amazon product page does not expose a valid ASIN")
    title = _first_text(
        selector.css("#productTitle::text, meta[name='title']::attr(content)").getall()
    )
    byline = _first_text(selector.css("#bylineInfo::text, #bylineInfo *::text").getall())
    brand = _clean_brand(byline)
    seller_link = _first_link(
        selector,
        "#sellerProfileTriggerId, #merchant-info a[href*='seller='], "
        ".tabular-buybox-text a[href*='seller='], a[href*='/sp?seller=']",
    )
    profile_url = (
        canonical_seller_url(urljoin(page_url, seller_link[0]), selected)
        if seller_link
        else None
    )
    merchant_token = merchant_token_from_url(profile_url or "")
    seller_name = normalize_whitespace(seller_link[1]) if seller_link and seller_link[1] else None
    if not seller_name:
        merchant_text = _first_text(
            selector.css("#merchant-info::text, #merchant-info *::text").getall()
        )
        seller_name = _seller_name_from_text(merchant_text)
    category = _first_text(
        selector.css("#wayfinding-breadcrumbs_feature_div li a::text, #nav-subnav a::text").getall()
    )
    return AmazonProductIdentity(
        marketplace=selected.code,
        asin=asin,
        product_url=canonical_product_url(page_url, selected) or page_url,
        title=title,
        brand=brand,
        seller_display_name=seller_name,
        merchant_token=merchant_token,
        seller_profile_url=profile_url,
        category=category,
    )


def parse_seller_page(html: str, page_url: str, marketplace: str) -> AmazonSellerIdentity:
    selected = marketplace_for(marketplace)
    selector = _html_selector(html)
    profile_url = canonical_seller_url(page_url, selected) or canonicalize_amazon_url(page_url)
    merchant_token = merchant_token_from_url(profile_url)
    display_name = _first_text(
        selector.css("#sellerName::text, #seller-profile-container h1::text, h1::text").getall()
    )
    detail_text = normalize_whitespace(
        " ".join(
            selector.css(
                "#page-section-detail-seller-info ::text, #seller-profile-container ::text"
            ).getall()
        )
    )
    business_name = _labeled_value(
        detail_text,
        ("Business Name", "Legal Business Name", "Company Name"),
    )
    public_location = _public_location(detail_text)
    country_code = _country_from_location(public_location or detail_text)
    storefront_link = _first_link(
        selector,
        "a[href*='/stores/'], a[href*='/s?me='], a[href*='marketplaceID=']",
    )
    storefront_url = (
        canonicalize_amazon_url(urljoin(page_url, storefront_link[0])) if storefront_link else None
    )
    official_website_url = _official_website(selector, page_url, selected)
    manufacturer_score, trader_score = _business_type_scores(detail_text)
    return AmazonSellerIdentity(
        marketplace=selected.code,
        merchant_token=merchant_token,
        display_name=display_name,
        business_name=business_name,
        profile_url=profile_url,
        storefront_url=storefront_url,
        public_location=public_location,
        country_code=country_code,
        official_website_url=official_website_url,
        manufacturer_score=manufacturer_score,
        trader_score=trader_score,
    )


def canonicalize_amazon_url(url: str) -> str:
    parsed = urlparse(url.strip())
    selected = marketplace_for(parsed.hostname or "")
    if parsed.scheme.lower() != "https" or parsed.username or parsed.password:
        raise ValueError("Amazon URLs must use HTTPS without credentials")
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    return urlunparse(("https", selected.domain, path, "", parsed.query, ""))


def canonical_product_url(url: str, marketplace: AmazonMarketplace) -> str | None:
    parsed = urlparse(url)
    try:
        if marketplace_for(parsed.hostname or "") != marketplace:
            return None
    except ValueError:
        return None
    match = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})(?:[/?]|$)", parsed.path, re.I)
    if match is None:
        return None
    return f"https://{marketplace.domain}/dp/{match.group(1).upper()}"


def canonical_seller_url(url: str, marketplace: AmazonMarketplace) -> str | None:
    parsed = urlparse(url)
    try:
        if marketplace_for(parsed.hostname or "") != marketplace:
            return None
    except ValueError:
        return None
    token = merchant_token_from_url(url)
    if token:
        return f"https://{marketplace.domain}/sp?{urlencode({'seller': token})}"
    if parsed.path.startswith("/stores/"):
        return urlunparse(("https", marketplace.domain, parsed.path.rstrip("/"), "", "", ""))
    return None


def merchant_token_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    for key in ("seller", "me", "merchant"):
        candidate = (query.get(key) or [""])[0].strip().upper()
        if MERCHANT_PATTERN.fullmatch(candidate):
            return candidate
    return None


def _html_selector(value: str) -> Selector:
    stripped = value.lstrip()
    if stripped.startswith(("{", "[")):
        return Selector(text="<html></html>", type="html")
    return Selector(text=value, type="html")


def _asin_from_page(selector: Selector, page_url: str) -> str | None:
    values = selector.css(
        "input#ASIN::attr(value), input[name='ASIN']::attr(value), [data-asin]::attr(data-asin)"
    ).getall()
    values.append(page_url)
    for value in values:
        match = ASIN_PATTERN.search(value or "")
        if match:
            return match.group(1).upper()
    return None


def _clean_brand(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"(?i)^\s*(?:visit the|brand\s*:)\s*", "", value)
    cleaned = re.sub(r"(?i)\s+store\s*$", "", cleaned)
    return normalize_whitespace(cleaned) or None


def _seller_name_from_text(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"(?i)\b(?:sold by|seller)\s*:?\s*([^|,]+)", value)
    return normalize_whitespace(match.group(1)) if match else None


def _labeled_value(text: str, labels: tuple[str, ...]) -> str | None:
    for label in labels:
        match = re.search(
            rf"(?i)\b{re.escape(label)}\s*:\s*(.+?)"
            r"(?=\s+(?:Business Address|Legal Business Name|Company Name|"
            r"Business Name|Phone|VAT|$)\s*:|$)",
            text,
        )
        if match:
            return normalize_whitespace(match.group(1))[:240] or None
    return None


def _public_location(text: str) -> str | None:
    match = re.search(
        r"(?i)\bBusiness Address\s*:\s*(.+?)"
        r"(?=\s+(?:Business Name|Legal Business Name|Company Name|"
        r"Company capability|Phone|VAT)\s*:|$)",
        text,
    )
    return normalize_whitespace(match.group(1))[:300] if match else None


def _country_from_location(value: str) -> str | None:
    normalized = normalize_whitespace(value)
    for alias in sorted(_country_alias_candidates(), key=len, reverse=True):
        if re.search(rf"(?i)(?:^|[,\s]){re.escape(alias)}(?:$|[,\s])", normalized):
            code = normalize_country_code(alias)
            if code:
                return code
    return None


def _country_alias_candidates() -> tuple[str, ...]:
    return (
        "United States of America",
        "United Kingdom",
        "Bangladesh",
        "Australia",
        "Vietnam",
        "Pakistan",
        "Germany",
        "France",
        "Canada",
        "China",
        "India",
        "Italy",
        "Spain",
        "USA",
        "UK",
    )


def _official_website(
    selector: Selector,
    page_url: str,
    marketplace: AmazonMarketplace,
) -> str | None:
    for anchor in selector.css("a[href]"):
        href = (anchor.attrib.get("href") or "").strip()
        label = normalize_whitespace(" ".join(anchor.css("::text").getall())).casefold()
        if not href or not any(term in label for term in EXTERNAL_WEBSITE_LABELS):
            continue
        candidate = urljoin(page_url, href)
        parsed = urlparse(candidate)
        if parsed.scheme.lower() != "https" or parsed.username or parsed.password:
            continue
        domain = canonicalize_domain(parsed.hostname or "")
        if domain is None:
            continue
        if domain == marketplace.code or domain.endswith(f".{marketplace.code}"):
            continue
        if domain in SOCIAL_DOMAINS or any(domain.endswith(f".{item}") for item in SOCIAL_DOMAINS):
            continue
        return f"https://{domain}/"
    return None


def _business_type_scores(text: str) -> tuple[int, int]:
    normalized = text.casefold()
    manufacturer_terms = ("manufacturer", "manufacturing", "factory", "oem", "odm")
    trader_terms = ("trading company", "wholesaler", "distributor", "reseller")
    manufacturer = min(100, sum(15 for term in manufacturer_terms if term in normalized))
    trader = min(100, sum(15 for term in trader_terms if term in normalized))
    return manufacturer, trader


def _first(values: list[str]) -> str | None:
    return next((value.strip() for value in values if value and value.strip()), None)


def _first_text(values: list[str]) -> str | None:
    cleaned = normalize_whitespace(" ".join(value for value in values if value))
    return cleaned[:500] if cleaned else None


def _first_link(selector: Selector, css: str) -> tuple[str, str] | None:
    anchor = selector.css(css)[0] if selector.css(css) else None
    if anchor is None:
        return None
    href = (anchor.attrib.get("href") or "").strip()
    label = normalize_whitespace(" ".join(anchor.css("::text").getall()))
    return (href, label) if href else None
