# Changelog

## Unreleased - Solo Mode v1 Implementation

- Approved the Solo Mode v1 delivery overlay and amended the authoritative master
  specification to version 2.1.0 before implementation.
- Kept live crawling, Scrapy Cloud deployment, Zyte API, paid services, extra units,
  and Amazon disabled while local implementation proceeds.
- Completed and verified Phase 7 for Solo v1 with a real bounded Scrapy
  official-site spider, contact/sitemap discovery, compact D1 evidence, deterministic
  ingestion records, and a no-network end-to-end fixture crawl.
- Added operations migration `0004_compact_evidence.sql` and regenerated the strict
  ingestion JSON Schema contract.

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
