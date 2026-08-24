"""Scrapy spiders for the bounded Solo Mode runtime."""

from sellerintel.spiders.website_contacts import OfficialWebsiteSpider
from sellerintel.spiders.website_discovery import OfficialDomainDiscoverySpider

__all__ = ["OfficialDomainDiscoverySpider", "OfficialWebsiteSpider"]
