from __future__ import annotations

from urllib.parse import urlparse, urlunparse

from sellerintel.adapters.amazon.parser import (
    AMAZON_PARSER_VERSION,
    AmazonProductIdentity,
    AmazonSellerIdentity,
)
from sellerintel.adapters.official_site import deterministic_uuidv7
from sellerintel.normalization.company import normalize_company_name
from sellerintel.normalization.domain import canonicalize_domain
from sellerintel.normalization.text import normalize_search_text
from sellerintel.schemas.ingestion import (
    MarketplaceAccountRecord,
    ProductLinkRecord,
    SellerAliasRecord,
    SellerRecord,
    SourceRecord,
)
from sellerintel.spool.checksums import sha256_hex


def seller_id_for_amazon(
    marketplace: str,
    merchant_token: str | None,
    profile_url: str,
) -> str:
    external_key = merchant_token or profile_url
    return deterministic_uuidv7("amazon-seller", f"{marketplace}:{external_key}")


def seller_record_for_product(
    product: AmazonProductIdentity,
    *,
    observed_at: str,
) -> SellerRecord:
    seller_name = product.seller_display_name or product.merchant_token or "Amazon seller"
    normalized = normalize_company_name(seller_name)
    seller_id = seller_id_for_amazon(
        product.marketplace,
        product.merchant_token,
        product.seller_profile_url or product.product_url,
    )
    return SellerRecord(
        id=seller_id,
        canonical_name=normalized.nfkc or seller_name,
        normalized_name=normalized.normalized or normalize_search_text(seller_name),
        identity_confidence=80 if product.merchant_token else 60,
        quality_score=30,
        schema_version=1,
        parser_version=AMAZON_PARSER_VERSION,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
        created_at=observed_at,
        updated_at=observed_at,
    )


def seller_record_for_identity(
    seller: AmazonSellerIdentity,
    *,
    observed_at: str,
) -> SellerRecord:
    company_name = (
        seller.business_name
        or seller.display_name
        or seller.merchant_token
        or "Amazon seller"
    )
    normalized = normalize_company_name(company_name)
    domain = (
        canonicalize_domain(urlparse(seller.official_website_url).hostname or "")
        if seller.official_website_url
        else None
    )
    return SellerRecord(
        id=seller_id_for_amazon(seller.marketplace, seller.merchant_token, seller.profile_url),
        canonical_name=normalized.nfkc or company_name,
        normalized_name=normalized.normalized or normalize_search_text(company_name),
        legal_name=seller.business_name,
        country_code=seller.country_code,
        address_public_masked=seller.public_location,
        official_domain=domain,
        identity_confidence=90 if seller.merchant_token and seller.business_name else 75,
        manufacturer_score=seller.manufacturer_score,
        trader_score=seller.trader_score,
        quality_score=_quality_score(seller),
        schema_version=1,
        parser_version=AMAZON_PARSER_VERSION,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
        created_at=observed_at,
        updated_at=observed_at,
    )


def marketplace_account_for_product(
    product: AmazonProductIdentity,
    *,
    seller_id: str,
    observed_at: str,
) -> MarketplaceAccountRecord:
    return MarketplaceAccountRecord(
        id=deterministic_uuidv7(
            "marketplace-account",
            f"{product.marketplace}:{product.merchant_token or product.seller_profile_url}",
        ),
        seller_id=seller_id,
        marketplace=product.marketplace,
        merchant_token=product.merchant_token,
        display_name=product.seller_display_name,
        profile_url=product.seller_profile_url,
        storefront_url=None,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
    )


def marketplace_account_for_identity(
    seller: AmazonSellerIdentity,
    *,
    seller_id: str,
    observed_at: str,
) -> MarketplaceAccountRecord:
    return MarketplaceAccountRecord(
        id=deterministic_uuidv7(
            "marketplace-account",
            f"{seller.marketplace}:{seller.merchant_token or seller.profile_url}",
        ),
        seller_id=seller_id,
        marketplace=seller.marketplace,
        merchant_token=seller.merchant_token,
        display_name=seller.display_name,
        profile_url=seller.profile_url,
        storefront_url=seller.storefront_url,
        country_hint=seller.country_code,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
    )


def product_link_record(
    product: AmazonProductIdentity,
    *,
    seller_id: str,
    source_id: str,
    observed_at: str,
) -> ProductLinkRecord:
    title = product.title or product.asin
    return ProductLinkRecord(
        id=deterministic_uuidv7(
            "amazon-product-link",
            f"{seller_id}:{product.marketplace}:{product.asin}",
        ),
        seller_id=seller_id,
        product_name=title,
        normalized_product_name=normalize_search_text(title),
        brand=product.brand,
        normalized_brand=normalize_search_text(product.brand) if product.brand else None,
        category=product.category,
        product_url=product.product_url,
        source_id=source_id,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
        schema_version=1,
        parser_version=AMAZON_PARSER_VERSION,
    )


def seller_alias_record(
    value: str,
    *,
    seller_id: str,
    source_id: str,
    observed_at: str,
) -> SellerAliasRecord:
    return SellerAliasRecord(
        id=deterministic_uuidv7("seller-alias", f"{seller_id}:{normalize_search_text(value)}"),
        seller_id=seller_id,
        alias=value,
        normalized_alias=normalize_search_text(value),
        alias_type="amazon_display_name",
        source_id=source_id,
        first_seen_at=observed_at,
        last_seen_at=observed_at,
    )


def amazon_source_record(
    *,
    url: str,
    seller_id: str | None,
    source_type: str,
    http_status: int,
    page_title: str | None,
    evidence_snippet: str,
    html: str,
    content_hash_override: str | None = None,
    observed_at: str,
    status: str = "active",
    next_allowed_at: str | None = None,
) -> SourceRecord:
    canonical = _canonical_source_url(url)
    domain = canonicalize_domain(urlparse(canonical).hostname or "")
    if domain is None:
        raise ValueError("Amazon source URL must contain a canonical domain")
    return SourceRecord(
        id=deterministic_uuidv7("source-url", canonical),
        seller_id=seller_id,
        source_url=canonical,
        canonical_url=canonical,
        source_domain=domain,
        source_type=source_type,
        robots_status="obey",
        terms_risk="high",
        http_status=http_status,
        page_title=page_title,
        evidence_snippet=evidence_snippet[:500],
        content_hash=content_hash_override or sha256_hex(html.encode()),
        detected_at=observed_at,
        last_seen_at=observed_at,
        first_seen_at=observed_at,
        last_fetched_at=observed_at,
        last_success_at=observed_at if 200 <= http_status < 300 else None,
        next_allowed_at=next_allowed_at,
        schema_version=1,
        parser_version=AMAZON_PARSER_VERSION,
        status=status,
    )


def _quality_score(seller: AmazonSellerIdentity) -> int:
    return min(
        100,
        25
        + (20 if seller.business_name else 0)
        + (15 if seller.country_code else 0)
        + (15 if seller.public_location else 0)
        + (25 if seller.official_website_url else 0),
    )


def _canonical_source_url(url: str) -> str:
    parsed = urlparse(url)
    domain = canonicalize_domain(parsed.hostname or "")
    if domain is None:
        raise ValueError("Amazon source URL must contain a canonical domain")
    return urlunparse(("https", domain, parsed.path or "/", "", parsed.query, ""))
