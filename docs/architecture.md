# Architecture

The frozen architecture is provider-neutral: runners emit signed idempotent
batches to a Cloudflare Worker API, while D1 owns canonical state and R2 owns
evidence.

Solo Mode v1 is a single-operator launch profile, not a replacement for the
tested foundation. It keeps the provider-neutral crawler, Worker ingestion, four
D1 partitions, local fallback runner, and verified one-unit Zyte path, but it
defers the broader hybrid runner matrix until after launch. GitHub Actions
crawler fallback, credit-backed fallback, automatic provider orchestration,
Zyte API, and extra Scrapy Cloud units are out of scope for Solo v1.

For Solo v1, R2 is optional. D1 must store compact evidence provenance for each
accepted source: source URL, canonical URL, masked evidence snippet or
extraction context, content hash, timestamps, parser version, and schema
version. R2 can be added later for full HTML, screenshots, batch archives, and
longer evidence retention.

Current reconciled phase state: Phases 0-8 are complete and verified; Phase 9 is
active and partially complete; Phase 10A is partially complete; Phase 10B and
later provider phases are not ready.

Phase 1 implements the local D1 data boundary:

- core stores canonical sellers, marketplace accounts, aliases, score
  components, compact product links, and FTS5 search.
- contacts stores encrypted or masked contact records, suppression state,
  outreach state, and contact audit events.
- operations stores sources, crawl runs, review queue, source registry,
  idempotency keys, quota state, and runtime feature flags.
- history stores recent field history and recent diff metadata.

Foreign keys are declared only inside a single partition. Cross-database
references remain text IDs checked by the Worker repository/unit-of-work layer.

Phase 2 adds the secure ingestion boundary. Runners post signed batches to
`POST /v1/ingest/batch`; the Worker verifies HMAC, timestamp, nonce replay,
idempotency, source policy, the strict ingestion payload contract, and bounded
batch sizes before writing through the cross-database unit-of-work coordinator.

The Worker does not claim cross-database transactions. It writes partitions in a
documented order and returns retryable failure metadata if a later partition
fails after earlier idempotent writes.

Phase 3 adds crawler-side contracts. The Python crawler emits Pydantic
`IngestionBatch` models with explicit version fields, serializes them
deterministically, compresses with gzip, and signs the exact compressed body the
Worker receives. The durable local spool stores retryable failed batches by
idempotency key checksum so ingestion can be replayed without relying on runner
logs.

Phase 4 adds the crawler-side contact extraction boundary. Extractors operate on
already fetched or fixture HTML only, emit typed public-business contact
candidates, keep masked context-window evidence, normalize phone-like values
with `phonenumbers`, and classify candidates using explainable confidence
components. They do not perform SMTP mailbox enumeration, QR decoding, live
fetching, CAPTCHA handling, or provider activation.

Phase 5 adds the deterministic normalization boundary used before scoring,
entity resolution, and history writes. Company names are Unicode-normalized,
case-folded, stripped of punctuation, whitespace-normalized, and reduced through
English and Chinese suffix rules. Domains are canonicalized to lower-case IDNA
hostnames, country aliases keep mainland China, Hong Kong, Macau, and Taiwan
distinct, and address masking redacts street-level detail.

Phase 6 adds the source adapter control boundary. Adapters are policy-backed and
feature-gated, with explicit risk level, robots policy, terms risk/review
status, per-domain concurrency, minimum delay, and blocked-page cooldown.
Marketplace, supplier-directory, and search-discovery adapters remain disabled
by default. Blocked-page detection stops the affected adapter/domain path; the
framework does not rotate providers or bypass access controls.

Phase 7 is complete and verified for Solo v1. The official-site Scrapy spider
uses explicit seeds, robots.txt, same-domain canonical URLs, a sequential
per-domain queue, strict page/depth/request limits, block detection, sitemap and
common business-page discovery, deterministic records, and confidence-scored
contact extraction. A no-network downloader middleware provides full fixture
execution. Compact masked evidence is persisted through the ingestion contract;
raw R2 evidence is deferred by the Solo amendment.

Phase 8 is complete and verified ahead of order. Exact identifiers,
canonical domains, normalized company names, public contact hashes, country/city
signals, and fuzzy name similarity produce transparent score components.
Decisions are deterministic: scores at `>= 92` can auto-merge, scores from
`70-91` enter review, and scores below `70` do not merge. Core migration tables
record decision payloads and non-destructive redirects so merges can be audited
and rolled back without deleting canonical or historical rows.

Phase 9 is partially complete. The Next.js app exposes internal
Overview, Sellers, Seller detail, Contacts, Review queue, Crawl health, Sources,
Suppression, and Export routes while remaining a static export. Browser-visible
data is local fixture data with masked contacts and reveal-audit metadata. Live
dashboard data must come through versioned Worker `/v1` API routes; secrets,
direct D1/R2 access, and raw contact values do not belong in browser code.

Phase 10A is partially complete. The local runner validates
the same zero-charge startup gates as other providers, honors the global kill
switch, rejects personal browser profile and cookie inputs, enforces a single
active job with an exclusive local lock, and defaults to fixture-only dry-run
smoke batches. The shared Docker artifact uses the same crawler code path as
future provider runners, but provider-specific deployments remain blocked until
their separate activation phases. Spool replay verifies stored checksums,
re-signs the original compressed body with a fresh nonce, preserves
idempotency, and deletes records only after Worker acceptance.

The shortest Solo v1 architecture path is:

1. Add Worker read/search/export APIs for the simple private dashboard.
2. Protect dashboard access with single-user Cloudflare Access.
3. Verify basic four-D1 backup and restore.
4. Verify the local Docker fallback artifact.
5. Activate Zyte only through the one-unit Phase 10B smoke gate.
