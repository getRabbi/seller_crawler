from __future__ import annotations

from collections.abc import Sequence
from ipaddress import ip_address

from scrapy.resolver import CachingThreadedResolver
from twisted.internet.defer import Deferred
from twisted.internet.error import DNSLookupError


class PublicCachingResolver(CachingThreadedResolver):
    """Resolve and cache only a public address before a downloader connects."""

    def getHostByName(
        self,
        name: str,
        timeout: Sequence[int] = (),
    ) -> Deferred[str]:
        deferred = super().getHostByName(name, timeout)
        deferred.addCallback(_require_public_address, name)
        return deferred


def _require_public_address(result: str, hostname: str) -> str:
    try:
        address = ip_address(result)
    except ValueError as error:
        raise DNSLookupError(f"DNS result for {hostname} was not an IP address") from error
    if not address.is_global:
        raise DNSLookupError(f"DNS result for {hostname} was not public")
    return result
