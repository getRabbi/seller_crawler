# Data Sources

The current local phases have no live source adapters. Amazon, Alibaba, 1688,
search discovery, Zyte API, and live crawling remain disabled.

Solo Mode v1 narrows the first launch source scope to official company websites
only. The allowed contact types are public business email, phone, WhatsApp, and
WeChat. Marketplace crawling, Amazon, Alibaba, 1688, supplier directories,
registry crawling, broad search discovery, paid search APIs, paid proxies, and
Zyte API are deferred.

Phase 7, the Solo v1 Phase 9 dashboard/API surface, and Phase 10A are complete
and verified locally. No live source is activated.

Phase 4 contact extractor tests use sanitized local HTML fixtures only. These
fixtures cover an official contact page, a multilingual contact page, and a
misleading directory-style false positive. No fixture test connects to an
external source.

Phase 6 adapter policies are local metadata only. `official_site` and
`business_registry` are enabled by default for later approved local work;
Amazon, Alibaba, 1688, and search discovery remain disabled until explicit
phase work and source review allow them.

Phase 7 implements a real Scrapy official-site engine. In its default fixture
mode, a downloader middleware serves sanitized pages and robots.txt without a
network connection. In gated local-live or Zyte modes, the same spider fetches
only explicit approved domains and bounded business pages. It stops on explicit
blocks and never switches providers. R2 uploads remain deferred.

For Solo v1, accepted official-site evidence should be compact in D1 first:
source URL, canonical URL, masked evidence snippet or extraction context,
content hash, first seen, last fetched, last success, parser version, and schema
version. Full raw HTML, screenshot capture, and long-retention archives can move
to R2 after launch.

Phase 8 entity resolution does not add a live source. It compares already
collected seller identities, aliases, domains, marketplace identifiers, public
contact hashes, and location hints in deterministic local fixtures.

Phase 9 dashboard data comes only from Worker `/v1` endpoints. The browser does
not call D1, R2, crawlers, source adapters, or provider APIs directly, and list
or export responses expose masked contacts only.

Phase 10A local runner smoke mode executes the official-site spider against the
sanitized fixture site and emits deterministic ingestion batches. It does not
fetch live URLs, load personal browser profiles, or read cookies.
