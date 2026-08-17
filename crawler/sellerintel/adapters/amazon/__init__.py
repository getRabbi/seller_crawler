from sellerintel.adapters.amazon.parser import (
    AMAZON_PARSER_VERSION,
    SUPPORTED_AMAZON_MARKETPLACES,
    AmazonMarketplace,
    AmazonProductIdentity,
    AmazonSellerIdentity,
    AmazonSourceAdapter,
    build_search_url,
    marketplace_for,
    parse_product_page,
    parse_search_page,
    parse_seller_page,
)

ENABLED_BY_DEFAULT = False
SPIDER_NAME = "amazon_discovery"
LIVE_CRAWL_IMPLEMENTED = True

__all__ = [
    "AMAZON_PARSER_VERSION",
    "ENABLED_BY_DEFAULT",
    "LIVE_CRAWL_IMPLEMENTED",
    "SPIDER_NAME",
    "SUPPORTED_AMAZON_MARKETPLACES",
    "AmazonMarketplace",
    "AmazonProductIdentity",
    "AmazonSellerIdentity",
    "AmazonSourceAdapter",
    "build_search_url",
    "marketplace_for",
    "parse_product_page",
    "parse_search_page",
    "parse_seller_page",
]
