# Data Sources

Production uses two approved public-source adapters in one sequential operator
run: bounded Amazon seller-identity discovery, then official company website
verification and contact enrichment. The allowed contact types are public
business email, phone, WhatsApp, and WeChat. Alibaba, 1688, supplier directories,
registry crawling, generic search discovery, paid search APIs, paid proxies, and
Zyte API remain disabled.

Phase 4 contact extractor tests use sanitized local HTML fixtures only. These
fixtures cover an official contact page, a multilingual contact page, and a
misleading directory-style false positive. No fixture test connects to an
external source.

Phase 6 policy metadata remains authoritative. Amazon and official-site adapters
are enabled only by the accepted operator runtime; Alibaba, 1688, business
registry, and search discovery stay disabled.

Phase 7 implements real Scrapy official-site engines. In fixture mode, a
downloader middleware serves sanitized pages and robots.txt without a network
connection. In gated local-live or Zyte Student modes, the contact spider fetches
only authorized domains and bounded business pages. It stops on explicit blocks
and never switches providers. R2 uploads remain deferred.

If Amazon does not expose an official link, the Worker may create a maximum of
two deterministic exact-name candidates per seller and 25 candidates per run.
This does not query or scrape Google, Bing, DuckDuckGo, or another search engine.
The candidate spider requests only the HTTPS homepage after robots authorization,
blocks private response addresses and cross-domain redirect pivots, and rejects
parked pages. A domain is auto-linked only when its normalized label exactly
matches a collected public identity and the same identity appears prominently on
the page. Candidate decisions are stored as compact, versioned source evidence;
only accepted domains continue to contact-page crawling.

Accepted official-site evidence stays compact in D1: source URL, canonical URL,
masked evidence snippet or extraction context, content hash, first seen, last
fetched, last success, parser version, and schema version. Full raw HTML,
screenshot capture, and long-retention archives can move to R2 after launch.

Phase 8 entity resolution does not add a live source. It compares already
collected seller identities, aliases, domains, marketplace identifiers, public
contact hashes, and location hints.

Phase 9 dashboard data comes only from Worker `/v1` endpoints. The browser does
not call D1, R2, crawlers, source adapters, or provider APIs directly, and list
or export responses expose masked contacts only.

Phase 10A local runner smoke mode executes the official-site spider against the
sanitized fixture site and emits deterministic ingestion batches. It does not
fetch live URLs, load personal browser profiles, or read cookies.
