# Data Sources

The current local phases have no live source adapters. Amazon, Alibaba, 1688,
search discovery, Zyte API, and live crawling remain disabled.

Solo Mode v1 narrows the first launch source scope to official company websites
only. The allowed contact types are public business email, phone, WhatsApp, and
WeChat. Marketplace crawling, Amazon, Alibaba, 1688, supplier directories,
registry crawling, broad search discovery, paid search APIs, paid proxies, and
Zyte API are deferred.

The reconciled active phase is Phase 7. It is partially complete and remains
local-only; Phases 8, 9, and 10A are implemented ahead of order but do not
activate any source.

Phase 4 contact extractor tests use sanitized local HTML fixtures only. These
fixtures cover an official contact page, a multilingual contact page, and a
misleading directory-style false positive. No fixture test connects to an
external source.

Phase 6 adapter policies are local metadata only. `official_site` and
`business_registry` are enabled by default for later approved local work;
Amazon, Alibaba, 1688, and search discovery remain disabled until explicit
phase work and source review allow them.

Phase 7 official-site enrichment is still local only and partially complete.
Crawl plans use a supplied
official seed URL, supplied HTML, and supplied sitemap text in tests or later
runner code; the module does not fetch homepages or sitemaps. It restricts URLs
to the canonical same domain, a fixed page budget, static official business
paths, and sitemap-discovered business pages. Evidence envelopes are prepared
with deterministic object keys, but R2 uploads and approved live crawling remain
unimplemented.

For Solo v1, accepted official-site evidence should be compact in D1 first:
source URL, canonical URL, masked evidence snippet or extraction context,
content hash, first seen, last fetched, last success, parser version, and schema
version. Full raw HTML, screenshot capture, and long-retention archives can move
to R2 after launch.

Phase 8 entity resolution does not add a live source. It compares already
collected seller identities, aliases, domains, marketplace identifiers, public
contact hashes, and location hints in deterministic local fixtures.

Phase 9 dashboard data is local fixture data only. It does not call live Worker
endpoints, direct D1, R2, crawlers, source adapters, or provider APIs.

Phase 10A local runner smoke mode emits an empty fixture ingestion batch by
default. It does not fetch source pages, run Scrapy spiders against live URLs,
load personal browser profiles, or read cookies.
