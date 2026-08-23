# Changelog

## Unreleased - Solo Mode v1 Implementation

- Fixed production dashboard-to-API JSON requests by allowing unauthenticated
  `OPTIONS` preflight through the API's Cloudflare Access application. The
  Worker continues to allow CORS only for the configured dashboard origin, and
  every non-`OPTIONS` API request remains protected by Access.
- Marked every New Crawl required field in the dashboard, added mode-aware
  pre-submit validation, and replaced raw browser `Failed to fetch` errors with
  an actionable Worker API Access-session recovery link.
- Promoted the bounded single-operator runtime to production at immutable
  release `6bc8b45b05f5561adec15fefbf87ff435b931f0c`, with four current D1
  partitions, Access-protected Worker/Pages, one-unit Scrapy Cloud execution,
  a successful no-network cloud smoke, and a verified sequential restore drill.
- Hardened four-D1 backup and restore so an environment label cannot target
  database names from a different environment.
- Updated the locked development `pip` dependency to `26.2.1`, clearing
  `PYSEC-2026-3721` while leaving the production crawler dependency set
  unchanged.
- Made Amazon HTML parsers fail safe when a nominally successful public source
  response contains JSON instead of HTML. Product-page merchant identity now
  counts toward the bounded seller target, non-HTML seller responses create no
  false seller-page evidence, and a one-seller run no longer fans out while
  waiting for profile enrichment.
- Enforced the Amazon adapter's single safe retry in per-job Scrapy Cloud
  settings so project-level defaults cannot expand a 503 response into extra
  attempts.
- Fixed operator-launched official-site crawl timestamps so every request uses
  a real ISO-8601 observation time even when a caller omits the optional
  override; the Worker now supplies a per-job timestamp and the spider retains
  a safe UTC fallback instead of persisting the literal string `None`.
- Made the New Crawl seller target a server-bounded custom numeric control with
  10/25/50/100 suggestions, preserving the hard 1-100 backend limit.
- Added the explicitly approved single-operator Amazon identity-discovery
  extension: bounded public search/product/seller parsing, product-to-seller
  relationships, real business-country evidence, source provenance, block and
  Retry-After cooldown handling, normalization, D1 persistence, and credible
  official-domain handoff. No Amazon contact scraping, hidden API, login,
  CAPTCHA bypass, proxy rotation, Zyte API, or paid provider was added.
- Added an Access-authenticated New Crawl control plane and dashboard form for
  Amazon keyword discovery and direct official-site enrichment. OPS_DB now
  stores idempotent requests, events, queue state, one-unit ownership, retries,
  cancellations, warnings, and run-to-seller results through migration 0005.
- Made accepted staging/production profiles operator-ready while preserving the
  emergency pause and all zero-charge locks. Generic paid search remains off;
  Amazon/public-source keyword discovery is represented separately and active.
- Added server-backed seller/contact filters, operational crawl-run actions,
  source-run result views, dynamic truthful runtime status, and overview
  metrics without exposing contact or crawler credentials to the frontend.

- Replaced the unreliable manual Scrapy Cloud custom-setting dependency with
  per-job `run.json` settings sourced from the approved local environment. The
  controlled runner pins one unit, validates staging/production Worker URLs,
  injects ingestion, cooldown, and encryption settings without printing secret
  payloads, and keeps Zyte API and paid services disabled.
- Removed the conflicting built-in Scrapy depth counter from the official-site
  spider. Its deterministic logical-depth, page-budget, same-domain, and robots
  controls remain authoritative, so sitemap and redirect responses cannot
  prematurely drop queued contact pages.
- Added versioned AES-256-GCM contact storage, a masked-by-default API/CSV
  boundary, and an Access-authenticated, reasoned, audited single-operator
  contact reveal path.
- Connected deterministic entity resolution to ingestion persistence with
  review records, idempotent merge/keep-separate/ignore decisions, cross-D1
  link audits, and non-destructive rollback.
- Added signed pre-crawl cooldown authorization and persisted per-domain 429
  `Retry-After` state so later jobs fail closed until the cooldown expires.
- Tracked the spool package, aligned replay headers with normal ingestion,
  restored the sanitized environment example, and made package scripts
  Linux-compatible.
- Kept local/no-network defaults locked while making accepted operator
  environments explicitly configurable for bounded Amazon discovery and
  official-site enrichment. Alibaba, 1688, business registry, generic search,
  Zyte API, paid services, and other deferred features remain disabled.
- Approved the Solo Mode v1 delivery overlay and amended the authoritative master
  specification to version 2.1.0 before implementation.
- Kept live crawling, Scrapy Cloud deployment, Zyte API, paid services, extra units,
  and Amazon disabled while local implementation proceeds.
- Completed and verified Phase 7 for Solo v1 with a real bounded Scrapy
  official-site spider, contact/sitemap discovery, compact D1 evidence, deterministic
  ingestion records, and a no-network end-to-end fixture crawl.
- Added operations migration `0004_compact_evidence.sql` and regenerated the strict
  ingestion JSON Schema contract.
- Added Worker APIs for seller list/detail, masked contacts, duplicate review,
  crawl runs, FTS search, and seller/contact CSV export.
- Connected the static dashboard to Worker APIs with loading, empty, failure,
  retry, and locked states; removed launch-path fixture data.
- Added cryptographic Cloudflare Access JWT verification for signature, issuer,
  audience, expiry, and the single allowed email.
- Added local and staging/production four-D1 Wrangler configuration, migration
  validation, and checksummed backup/restore tooling.
- Added the controlled one-unit Scrapy Cloud runner, no-network smoke spider,
  deploy/start/status/cancel CLI, and a manual fail-closed deployment workflow.
- Verified signed fixture ingestion through a real local Worker and four local
  D1 databases, including search, duplicate handling, crawl status, detail, and
  CSV responses.
- Verified the crawler Docker image with networking disabled; corrected the
  image entrypoint so runtime startup never attempts to install development
  dependencies.
- Made local-runner, D1 transfer, and Scrapy Cloud runbook commands self-contained
  from the repository root instead of relying on a shell-persistent `PYTHONPATH`.
- Deployed Cloudflare staging in the repository-authorized account: four migrated
  D1 partitions, the bound Worker and route, the Pages dashboard/custom domain,
  proxied DNS, exact-email Access protection, and the exact-path HMAC ingestion
  bypass. Secret values were neither printed nor committed.
- Documented the deployed staging inventory, security review, free-tier quota
  impact, remaining manual gates, and forward-only rollback/recovery path in
  `STAGING_DEPLOYMENT_REPORT.md`.
- Deployed crawler version `a6aea18-main` to the entitled Scrapy Cloud project,
  verified a one-unit/no-network hosted smoke with one response, one item, and
  zero errors, then verified controlled cancellation on a second sequential job.
  No periodic job, live crawl, Zyte API, extra unit, or paid service was enabled.
- Added and deployed the public synthetic `seed-stg.scalemyprints.com` fixture,
  restricted Worker ingestion to that exact domain, and configured the endpoint
  and HMAC only in private Scrapy Cloud project settings.
- Hardened cloud ingestion with an explicit product User-Agent, valid UTC
  observation timestamps, safe rejection receipts that never log raw items,
  explicit deploy-version forwarding, and Scrapy Cloud job-ID persistence.
- Completed final one-unit run `871778/1/3`: 6 responses, 2 receipt-only items,
  0 errors, 0 block/spool signals, four encrypted and masked synthetic contact
  types in D1, a completed linked crawl run, and zero remaining jobs/schedules.
- Completed a checksummed four-D1 staging backup. Core export now excludes only
  the rebuildable FTS5 virtual index because Cloudflare D1 cannot export virtual
  tables; canonical tables remain covered and the runbook requires FTS rebuild.

## Unreleased - Solo Mode v1 Planning

- Added `SOLO_MODE_IMPLEMENTATION_PLAN.md` as a documentation-only
  single-operator launch overlay.
- Documented the minimum Solo v1 scope: one verified Zyte Student Scrapy Cloud
  unit, one local fallback runner, official-website crawling, contact
  extraction, normalization, basic entity resolution, Worker ingestion, four D1
  databases, private dashboard, CSV export, basic backup, and single-user
  Cloudflare Access.
- Documented Solo v1 deferrals, including Zyte API, extra Scrapy Cloud units,
  GitHub Actions crawler fallback, credit-backed fallback, automatic provider
  orchestration, AI summaries, outreach automation, team roles, advanced
  monitoring, complex approvals, and full raw-evidence R2 storage.

## Unreleased - Stabilization And Phase Reconciliation

- Accepted the audit-determined phase state: Phases 0-6 are complete and
  verified, Phase 7 is active and partially complete, Phase 8 is complete and
  verified ahead of order, Phase 9 is partially complete, Phase 10A is partially
  complete, and Phase 10B/later provider phases are not ready.
- Updated repository defaults to record the confirmed Zyte Student entitlement
  while keeping Scrapy Cloud deploy, live crawling, Zyte API, extra Scrapy Cloud
  units, Amazon, and paid services disabled.
- Removed duplicate and unused environment defaults for ingestion endpoint,
  ingestion spool, and R2 upload placeholders.
- Removed the duplicate master-specification copy after byte-for-byte
  verification; `SELLER_INTELLIGENCE_MASTER_SPEC.md` remains authoritative.

## 0.10.0 - Phase 10A Partial Local Runner Readiness

- Added fixture-only local runner readiness with startup-gate validation,
  kill-switch enforcement, one-job lock behavior, and dry-run smoke batches.
- Added local runner checks that reject personal browser profile and cookie
  environment variables.
- Added spool replay helpers that verify checksums, re-sign stored gzip bodies
  with fresh nonces, preserve idempotency keys, and delete only after 2xx
  acceptance.
- Added a shared crawler `Dockerfile` and `.dockerignore` with locked zero-charge
  defaults.
- Added Windows Task Scheduler and Linux cron runbook notes without enabling any
  schedule.
- Added Phase 10A local runner and spool replay tests.

## 0.9.0 - Phase 9 Partial Dashboard

- Replaced the bootstrap dashboard with a static internal operations dashboard.
- Added Overview, Sellers, Seller detail, Contacts, Review queue, Crawl health,
  Sources, Suppression, and Export routes.
- Added shared dashboard shell, metric, status, score, table, and state
  components with responsive desktop/mobile layouts.
- Added masked fixture data, reveal-audit metadata, source-policy views, and
  `/v1` Worker API route boundaries for later live integration.
- Added dashboard tests for route coverage, locked runtime state, masked contact
  display, review-score ranges, and Worker API path versioning.

## 0.8.0 - Phase 8 Entity Resolution

- Added runner-side exact and fuzzy seller entity-resolution scoring with
  transparent score components and deterministic decision IDs.
- Added fixed merge thresholds: auto-merge at `>= 92`, review queue at `70-91`,
  and no merge below `70`.
- Added merge audit-trail and rollback-plan helpers that do not delete
  canonical or historical data.
- Added core migration tables for entity-resolution decisions and non-destructive
  seller merge redirects.
- Added deterministic Phase 8 fixture tests and migration coverage.

## 0.7.0 - Phase 7 Partial Official Website Enrichment

- Added local official-site crawl planning with canonical URLs, same-domain
  restriction, page-budget enforcement, static contact/business paths, and
  sitemap-discovered business page admission.
- Added official-page enrichment envelopes with deterministic content hashes and
  intended evidence object keys while keeping R2 uploads disabled.
- Reused Phase 4 contact extractors for confidence-scored public business
  contact candidates on official-site pages.
- Added Phase 7 official-site enrichment tests for URL policy, canonicalization,
  evidence hashing, and contact extraction.
- Documented Phase 7 local-only safety, rollback, and free-tier impact.

## 0.6.0 - Phase 6 Source Adapter Framework

- Added policy-backed `SourceAdapter` protocol scaffolding and default adapter
  registry.
- Added source policies with risk level, robots policy, terms risk/review
  status, per-domain concurrency, minimum delay, cooldown, and feature flags.
- Kept marketplace, supplier-directory, and search-discovery adapters disabled
  by default.
- Added blocked-page detection and cooldown behavior for explicit blocks,
  CAPTCHA/challenge markers, forbidden statuses, and rate limits.
- Added Phase 6 adapter registry and policy tests.

## 0.5.0 - Phase 5 Normalization

- Added deterministic company-name, domain, country, phone, address, and hash
  normalization utilities.
- Added Unicode NFKC normalization, punctuation removal, whitespace collapse,
  English and Chinese company suffix handling, and IDNA domain canonicalization.
- Added address masking helpers that redact street-level detail before
  downstream display or history use.
- Added Phase 5 normalization tests.

## 0.4.0 - Phase 4 Contact Extractors

- Added fixture-driven email, phone, WhatsApp, and WeChat extractors.
- Added masked context-window evidence, deterministic normalization,
  classification, review status, and confidence components.
- Added sanitized official-contact, multilingual-contact, and false-positive
  extractor fixtures.
- Added extractor coverage gating with `pytest-cov` and `phonenumbers` for
  E.164 phone normalization.
- Documented Phase 4 local-only safety, rollback, and free-tier impact.

## 0.3.0 - Phase 3 Crawler Contracts

- Added Pydantic ingestion batch and crawler record contracts.
- Added deterministic JSON and gzip serialization.
- Replaced the crawler ingestion stub with a signed HMAC client using fresh
  nonces, gzip body signing, retry with exponential backoff, and local spool
  fallback for temporary failures.
- Added spool record write/read/checksum helpers.
- Added crawler contract, client, and local Worker-compatible integration tests.
- Tightened the shared ingestion JSON Schema and Worker runtime validator to
  reject unexpected fields, wrong primitive types, and missing explicit
  `schema_version` values on versioned records.
- Added Pydantic as the required crawler contract dependency.
- Documented Phase 3 security, rollback, and free-tier impact.

## 0.2.0 - Phase 2 Secure Ingestion

- Added `POST /v1/ingest/batch` with gzip support, HMAC-SHA256 verification,
  timestamp windows, nonce replay protection, idempotency, source policy checks,
  structured errors, and masked operational logs.
- Added the ingestion batch JSON Schema contract file.
- Added operations nonce replay migration.
- Added local Worker ingestion tests for valid, invalid, replayed, expired, and
  oversized requests.
- Documented Phase 2 security, rollback, and free-tier impact.

## 0.1.0 - Phase 1 Database

- Added partitioned D1-compatible migrations for core, contacts, operations,
  and history.
- Added core FTS5 search schema and post-restore rebuild script.
- Added Worker D1 repository classes and a sequential cross-database
  unit-of-work coordinator.
- Added local migration and repository tests.
- Documented database rollback, restore order, and free-tier impact.

## 0.0.0 - Phase 0 Bootstrap

- Added initial monorepo skeleton.
- Added locked zero-charge runtime defaults.
- Added Python, Worker, and dashboard bootstrap tests.
- Added non-deploying CI workflow placeholders.
